import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const htmlPath = path.resolve(import.meta.dirname, '../index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script id="game-engine"[^>]*>([\s\S]*?)<\/script>/);
assert.ok(match, 'index.html should contain <script id="game-engine">');

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox, { filename: 'game-engine.js' });
const Engine = sandbox.window.SanguoshaEngine;
assert.ok(Engine, 'game engine should expose window.SanguoshaEngine');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

function c(type, overrides = {}) {
  assert.equal(typeof Engine.makeTestCard, 'function', 'engine should expose makeTestCard for deterministic rules tests');
  return Engine.makeTestCard(type, overrides);
}

function names(collection) {
  return collection.map(item => item.name || item.type);
}

test('catalog contains official-style standard and military card families', () => {
  assert.ok(Engine.CARD_CATALOG, 'CARD_CATALOG should be exposed');
  const required = [
    'sha', 'fire_sha', 'thunder_sha', 'shan', 'tao', 'jiu',
    'wuzhong', 'juedou', 'guohe', 'shunshou', 'jiedao', 'taoyuan', 'wugu', 'nanman', 'wanjian', 'wuxie',
    'lebusishu', 'bingliang', 'shandian', 'huogong', 'tiesuo',
    'zhuge', 'qinggang', 'cixiong', 'qinglong', 'zhangba', 'guanshi', 'fangtian', 'qilin',
    'bagua', 'renwang', 'tengjia', 'baiyin', 'minus_horse', 'plus_horse'
  ];
  for (const key of required) assert.ok(Engine.CARD_CATALOG[key], `missing card: ${key}`);
  const game = Engine.newGame({ seed: 21 });
  assert.ok(game.deck.length >= 100, 'official-style deck should be much larger than demo deck');
  assert.ok(game.deck.every(card => card.suit && card.rank && card.color), 'deck cards should have suit/rank/color metadata');
});

test('newGame creates formal zones, selectable heroes and play phase', () => {
  const game = Engine.newGame({ seed: 22, playerHero: 'zhangfei', enemyHero: 'caocao' });
  assert.equal(game.player.heroId, 'zhangfei');
  assert.equal(game.enemy.heroId, 'caocao');
  assert.deepEqual(Object.keys(game.player.equipment).sort(), ['armor', 'horseMinus', 'horsePlus', 'weapon'].sort());
  assert.ok(Array.isArray(game.player.judgeArea));
  assert.equal(game.player.judgeArea.length, 0);
  assert.equal(game.turn, 'player');
  assert.equal(game.phase, 'play');
  assert.equal(game.player.hand.length, 4);
  assert.equal(game.enemy.hand.length, 4);
});

test('normal sha is limited once per play phase without skill or Zhuge crossbow', () => {
  const game = Engine.newGame({ seed: 23, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.hand = [c('sha', { id: 'sha-1' }), c('sha', { id: 'sha-2' })];
  game.enemy.hand = [];
  assert.equal(Engine.playCard(game, 'player', 'sha-1').ok, true);
  const second = Engine.playCard(game, 'player', 'sha-2');
  assert.equal(second.ok, false);
  assert.match(second.message, /杀/);
});

test('Zhuge crossbow removes sha limit after equipped', () => {
  const game = Engine.newGame({ seed: 24, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.hand = [c('zhuge', { id: 'zhuge' }), c('sha', { id: 'sha-1' }), c('sha', { id: 'sha-2' })];
  game.enemy.hand = [];
  assert.equal(Engine.playCard(game, 'player', 'zhuge').ok, true);
  assert.equal(game.player.equipment.weapon.type, 'zhuge');
  assert.equal(Engine.playCard(game, 'player', 'sha-1').ok, true);
  assert.equal(Engine.playCard(game, 'player', 'sha-2').ok, true);
});

test('delayed trick Le Bu Si Shu enters judgement zone and failed judgement skips play phase', () => {
  const game = Engine.newGame({ seed: 25, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.hand = [c('lebusishu', { id: 'lebu' })];
  assert.equal(Engine.playCard(game, 'player', 'lebu').ok, true);
  assert.equal(game.enemy.judgeArea.length, 1);
  assert.equal(game.enemy.judgeArea[0].type, 'lebusishu');

  game.deck = [c('sha', { id: 'draw-a' }), c('shan', { id: 'draw-b' }), c('sha', { id: 'judge-spade', suit: 'spade', rank: '9' })];
  Engine.endTurn(game);
  assert.equal(game.turn, 'enemy');
  assert.equal(game.enemy.flags.skipPlay, true);
  assert.equal(game.phase, 'discard');
});

test('Renwang shield blocks black sha', () => {
  const game = Engine.newGame({ seed: 26, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.hand = [c('sha', { id: 'black-sha', suit: 'spade', color: 'black' })];
  game.enemy.hand = [];
  game.enemy.equipment.armor = c('renwang', { id: 'renwang' });
  const hp = game.enemy.hp;
  assert.equal(Engine.playCard(game, 'player', 'black-sha').ok, true);
  assert.equal(game.enemy.hp, hp);
  assert.ok(game.log.some(line => /仁王盾/.test(line)));
});

test('Eight Diagram armor can auto provide shan on red judgement', () => {
  const game = Engine.newGame({ seed: 27, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.hand = [c('sha', { id: 'sha' })];
  game.enemy.hand = [];
  game.enemy.equipment.armor = c('bagua', { id: 'bagua' });
  game.deck = [c('tao', { id: 'red-judge', suit: 'heart', color: 'red' })];
  const hp = game.enemy.hp;
  assert.equal(Engine.playCard(game, 'player', 'sha').ok, true);
  assert.equal(game.enemy.hp, hp);
  assert.ok(game.log.some(line => /八卦阵/.test(line)));
});

test('classic hero skills: Paoxiao, Wusheng, Longdan, Zhiheng, Kurou and Jianxiong', () => {
  const zhangfei = Engine.newGame({ seed: 28, playerHero: 'zhangfei', enemyHero: 'caocao' });
  zhangfei.player.hand = [c('sha', { id: 'zf-sha-1' }), c('sha', { id: 'zf-sha-2' })];
  zhangfei.enemy.hand = [];
  assert.equal(Engine.playCard(zhangfei, 'player', 'zf-sha-1').ok, true);
  assert.equal(Engine.playCard(zhangfei, 'player', 'zf-sha-2').ok, true, '咆哮 should allow unlimited sha');

  const guanyu = Engine.newGame({ seed: 29, playerHero: 'guanyu', enemyHero: 'caocao' });
  guanyu.player.hand = [c('tao', { id: 'red-card', suit: 'heart', color: 'red' })];
  guanyu.enemy.hand = [];
  const gyHp = guanyu.enemy.hp;
  assert.equal(Engine.playCardAs(guanyu, 'player', 'red-card', 'sha').ok, true, '武圣 should use red card as sha');
  assert.equal(guanyu.enemy.hp, gyHp - 1);

  const zhaoyun = Engine.newGame({ seed: 30, playerHero: 'zhaoyun', enemyHero: 'caocao' });
  zhaoyun.player.hand = [c('shan', { id: 'shan-as-sha' })];
  zhaoyun.enemy.hand = [];
  const zyHp = zhaoyun.enemy.hp;
  assert.equal(Engine.playCardAs(zhaoyun, 'player', 'shan-as-sha', 'sha').ok, true, '龙胆 should use shan as sha');
  assert.equal(zhaoyun.enemy.hp, zyHp - 1);

  const sunquan = Engine.newGame({ seed: 31, playerHero: 'sunquan', enemyHero: 'caocao' });
  sunquan.player.hand = [c('sha', { id: 'sq-a' }), c('shan', { id: 'sq-b' })];
  const deckBefore = sunquan.deck.length;
  assert.equal(Engine.useSkill(sunquan, 'player', 'zhiheng', ['sq-a', 'sq-b']).ok, true);
  assert.equal(sunquan.player.hand.length, 2);
  assert.equal(sunquan.deck.length, deckBefore - 2);
  assert.equal(Engine.useSkill(sunquan, 'player', 'zhiheng', [sunquan.player.hand[0].id]).ok, false, '制衡 should be once per turn');

  const huanggai = Engine.newGame({ seed: 32, playerHero: 'huanggai', enemyHero: 'caocao' });
  const hgHp = huanggai.player.hp;
  const hgHand = huanggai.player.hand.length;
  assert.equal(Engine.useSkill(huanggai, 'player', 'kurou').ok, true);
  assert.equal(huanggai.player.hp, hgHp - 1);
  assert.equal(huanggai.player.hand.length, hgHand + 2);

  const caocao = Engine.newGame({ seed: 33, playerHero: 'liubei', enemyHero: 'caocao' });
  caocao.player.hand = [c('sha', { id: 'damage-source' })];
  caocao.enemy.hand = [];
  assert.equal(Engine.playCard(caocao, 'player', 'damage-source').ok, true);
  assert.ok(caocao.enemy.hand.some(card => card.id === 'damage-source'), '奸雄 should gain the damage card');
});

test('face-to-face UI places enemy board before arena and player hand dock near bottom', () => {
  const enemyIndex = html.indexOf('id="enemyBoard"');
  const arenaIndex = html.indexOf('id="centerArena"');
  const playerIndex = html.indexOf('id="playerBoard"');
  const handDockIndex = html.indexOf('id="playerHandDock"');
  assert.ok(enemyIndex > 0, 'enemyBoard should exist');
  assert.ok(arenaIndex > enemyIndex, 'center arena should be below enemy board');
  assert.ok(playerIndex > arenaIndex, 'player board should be below center arena');
  assert.ok(handDockIndex > playerIndex, 'player hand dock should be at bottom');
});

console.log('\nAll advanced engine behavior tests passed.');
