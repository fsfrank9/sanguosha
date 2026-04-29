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
  return Engine.makeTestCard(type, overrides);
}

function ids(cards) {
  return cards.map(card => card.id);
}

test('engine exposes card/equipment helpers', () => {
  for (const fn of ['distanceBetween', 'equipCard', 'loseEquipment', 'isShaCard', 'playZhangbaSha']) {
    assert.equal(typeof Engine[fn], 'function', `${fn} should be exported`);
  }
});

test('equipment replaces same slot and discards previous equipment', () => {
  const game = Engine.newGame({ seed: 301 });
  const zhuge = c('zhuge', { id: 'zhuge' });
  const qinggang = c('qinggang', { id: 'qinggang' });
  assert.equal(Engine.equipCard(game, 'player', zhuge).ok, true);
  assert.equal(game.player.equipment.weapon.id, 'zhuge');
  assert.equal(Engine.equipCard(game, 'player', qinggang).ok, true);
  assert.equal(game.player.equipment.weapon.id, 'qinggang');
  assert.ok(game.discard.some(card => card.id === 'zhuge'));
});

test('horses change duel distance and weapon range gates sha', () => {
  const game = Engine.newGame({ seed: 302 });
  assert.equal(Engine.distanceBetween(game, 'player', 'enemy'), 1);
  game.enemy.equipment.horsePlus = c('plus_horse', { id: 'enemy-plus' });
  assert.equal(Engine.distanceBetween(game, 'player', 'enemy'), 2);
  game.player.hand = [c('sha', { id: 'too-far' })];
  assert.equal(Engine.playCard(game, 'player', 'too-far').ok, false, 'bare sha should not reach +1 horse');
  game.player.equipment.weapon = c('qinggang', { id: 'range-2' });
  assert.equal(Engine.playCard(game, 'player', 'too-far').ok, true, 'range 2 weapon should reach +1 horse');
  game.player.equipment.horseMinus = c('minus_horse', { id: 'player-minus' });
  assert.equal(Engine.distanceBetween(game, 'player', 'enemy'), 1);
});

test('Qinggang sword ignores Renwang shield for black sha', () => {
  const game = Engine.newGame({ seed: 303, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.equipment.weapon = c('qinggang', { id: 'qinggang' });
  game.player.hand = [c('sha', { id: 'black-sha', suit: 'spade', color: 'black' })];
  game.enemy.hand = [];
  game.enemy.equipment.armor = c('renwang', { id: 'renwang' });
  const hp = game.enemy.hp;
  assert.equal(Engine.playCard(game, 'player', 'black-sha').ok, true);
  assert.equal(game.enemy.hp, hp - 1);
});

test('Tengjia blocks normal sha and AOE but amplifies fire damage', () => {
  const normal = Engine.newGame({ seed: 304, playerHero: 'liubei', enemyHero: 'caocao' });
  normal.player.hand = [c('sha', { id: 'normal-sha' })];
  normal.enemy.hand = [];
  normal.enemy.equipment.armor = c('tengjia', { id: 'tengjia' });
  const normalHp = normal.enemy.hp;
  assert.equal(Engine.playCard(normal, 'player', 'normal-sha').ok, true);
  assert.equal(normal.enemy.hp, normalHp, '藤甲 should block normal sha');

  const aoe = Engine.newGame({ seed: 305, playerHero: 'liubei', enemyHero: 'caocao' });
  aoe.player.hand = [c('nanman', { id: 'nanman' })];
  aoe.enemy.hand = [];
  aoe.enemy.equipment.armor = c('tengjia', { id: 'tengjia-aoe' });
  const aoeHp = aoe.enemy.hp;
  assert.equal(Engine.playCard(aoe, 'player', 'nanman').ok, true);
  assert.equal(aoe.enemy.hp, aoeHp, '藤甲 should block Nanman damage');

  const fire = Engine.newGame({ seed: 306, playerHero: 'liubei', enemyHero: 'caocao' });
  fire.player.hand = [c('fire_sha', { id: 'fire-sha', suit: 'heart', color: 'red' })];
  fire.enemy.hand = [];
  fire.enemy.equipment.armor = c('tengjia', { id: 'tengjia-fire' });
  const fireHp = fire.enemy.hp;
  assert.equal(Engine.playCard(fire, 'player', 'fire-sha').ok, true);
  assert.equal(fire.enemy.hp, fireHp - 2, '藤甲 should add +1 fire damage');
});

test('Baiyin lion reduces multi-point damage to one and heals when lost', () => {
  const game = Engine.newGame({ seed: 307, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.hand = [c('jiu', { id: 'jiu' }), c('sha', { id: 'boosted-sha' })];
  game.enemy.hand = [];
  game.enemy.equipment.armor = c('baiyin', { id: 'baiyin' });
  const hp = game.enemy.hp;
  assert.equal(Engine.playCard(game, 'player', 'jiu').ok, true);
  assert.equal(Engine.playCard(game, 'player', 'boosted-sha').ok, true);
  assert.equal(game.enemy.hp, hp - 1, '白银狮子 should reduce 2 damage to 1');
  game.enemy.hp = 2;
  const lost = Engine.loseEquipment(game, 'enemy', 'armor');
  assert.equal(lost.ok, true);
  assert.equal(game.enemy.hp, 3, '失去白银狮子 should heal 1');
});

test('Nanman accepts any sha variant as response', () => {
  const game = Engine.newGame({ seed: 308, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.hand = [c('nanman', { id: 'nanman' })];
  game.enemy.hand = [c('thunder_sha', { id: 'thunder-response' })];
  const hp = game.enemy.hp;
  assert.equal(Engine.playCard(game, 'player', 'nanman').ok, true);
  assert.equal(game.enemy.hp, hp);
  assert.ok(game.discard.some(card => card.id === 'thunder-response'));
});

test('Wuxie can nullify targeted trick cards', () => {
  const game = Engine.newGame({ seed: 309, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.hand = [c('guohe', { id: 'guohe' })];
  game.enemy.hand = [c('wuxie', { id: 'wuxie' }), c('shan', { id: 'protected' })];
  assert.equal(Engine.playCard(game, 'player', 'guohe').ok, true);
  assert.deepEqual(ids(game.enemy.hand), ['protected']);
  assert.ok(game.discard.some(card => card.id === 'wuxie'));
});

test('core trick cards resolve: Taoyuan, Wugu, Huogong, Tiesuo and Jiedao', () => {
  const game = Engine.newGame({ seed: 310, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.hp = 2;
  game.enemy.hp = 2;
  game.player.hand = [
    c('taoyuan', { id: 'taoyuan' }),
    c('wugu', { id: 'wugu' }),
    c('huogong', { id: 'huogong' }),
    c('sha', { id: 'heart-cost', suit: 'heart', color: 'red' }),
    c('tiesuo', { id: 'tiesuo' }),
    c('jiedao', { id: 'jiedao' })
  ];
  game.enemy.hand = [c('shan', { id: 'revealed-heart', suit: 'heart', color: 'red' })];
  game.enemy.equipment.weapon = c('zhuge', { id: 'borrowed-zhuge' });
  game.deck = [c('tao', { id: 'wugu-enemy' }), c('tao', { id: 'wugu-player' })];

  assert.equal(Engine.playCard(game, 'player', 'taoyuan').ok, true);
  assert.equal(game.player.hp, 3);
  assert.equal(game.enemy.hp, 3);

  const beforePlayerHand = game.player.hand.length;
  const beforeEnemyHand = game.enemy.hand.length;
  assert.equal(Engine.playCard(game, 'player', 'wugu').ok, true);
  assert.equal(game.player.hand.length, beforePlayerHand); // spent wugu, gained one revealed card
  assert.equal(game.enemy.hand.length, beforeEnemyHand + 1);

  const enemyHp = game.enemy.hp;
  assert.equal(Engine.playCard(game, 'player', 'huogong').ok, true);
  assert.equal(game.enemy.hp, enemyHp - 1);
  assert.ok(game.discard.some(card => card.id === 'heart-cost'));

  assert.equal(Engine.playCard(game, 'player', 'tiesuo').ok, true);
  assert.equal(game.enemy.chained, true);

  assert.equal(Engine.playCard(game, 'player', 'jiedao').ok, true);
  assert.equal(game.player.equipment.weapon, null, 'target without sha should not auto-equip handed-over weapon');
  assert.ok(ids(game.player.hand).includes('borrowed-zhuge'), 'target without sha should hand weapon into player hand');
});

test('Zhangba, Qinglong, Guanshi and Qilin weapon effects are playable', () => {
  const zhangba = Engine.newGame({ seed: 311, playerHero: 'liubei', enemyHero: 'caocao' });
  zhangba.player.equipment.weapon = c('zhangba', { id: 'zhangba' });
  zhangba.player.hand = [c('tao', { id: 'left' }), c('shan', { id: 'right' })];
  zhangba.enemy.hand = [];
  const hp = zhangba.enemy.hp;
  assert.equal(Engine.playZhangbaSha(zhangba, 'player', ['left', 'right']).ok, true);
  assert.equal(zhangba.enemy.hp, hp - 1);

  const qinglong = Engine.newGame({ seed: 312, playerHero: 'liubei', enemyHero: 'caocao' });
  qinglong.player.equipment.weapon = c('qinglong', { id: 'qinglong' });
  qinglong.player.hand = [c('sha', { id: 'first-sha' }), c('sha', { id: 'follow-sha' })];
  qinglong.enemy.hand = [c('shan', { id: 'one-shan' })];
  const qinglongHp = qinglong.enemy.hp;
  assert.equal(Engine.playCard(qinglong, 'player', 'first-sha').ok, true);
  assert.equal(qinglong.enemy.hp, qinglongHp - 1, '青龙偃月刀 should continue after the first sha is dodged');

  const guanshi = Engine.newGame({ seed: 313, playerHero: 'liubei', enemyHero: 'caocao' });
  guanshi.player.equipment.weapon = c('guanshi', { id: 'guanshi' });
  guanshi.player.hand = [c('sha', { id: 'axe-sha' }), c('tao', { id: 'axe-cost-1' }), c('shan', { id: 'axe-cost-2' })];
  guanshi.enemy.hand = [c('shan', { id: 'dodge' })];
  const guanshiHp = guanshi.enemy.hp;
  assert.equal(Engine.playCard(guanshi, 'player', 'axe-sha').ok, true);
  assert.equal(guanshi.enemy.hp, guanshiHp - 1, '贯石斧 should discard two cards to force hit');
  assert.ok(guanshi.discard.some(card => card.id === 'axe-cost-1'));
  assert.ok(guanshi.discard.some(card => card.id === 'axe-cost-2'));

  const qilin = Engine.newGame({ seed: 314, playerHero: 'liubei', enemyHero: 'caocao' });
  qilin.player.equipment.weapon = c('qilin', { id: 'qilin' });
  qilin.player.hand = [c('sha', { id: 'qilin-sha' })];
  qilin.enemy.hand = [];
  qilin.enemy.equipment.horsePlus = c('plus_horse', { id: 'horse-plus' });
  qilin.enemy.equipment.horseMinus = c('minus_horse', { id: 'horse-minus' });
  assert.equal(Engine.playCard(qilin, 'player', 'qilin-sha').ok, true);
  assert.equal(qilin.enemy.equipment.horsePlus, null);
  assert.equal(qilin.enemy.equipment.horseMinus, null);
});

test('delayed tricks: Shandian starts on self and moves or damages by judgement', () => {
  const move = Engine.newGame({ seed: 315, playerHero: 'liubei', enemyHero: 'caocao' });
  move.player.hand = [c('shandian', { id: 'shandian' })];
  assert.equal(Engine.playCard(move, 'player', 'shandian').ok, true);
  assert.equal(move.player.judgeArea.length, 1);
  assert.equal(move.enemy.judgeArea.length, 0);
  move.deck = [c('shan', { id: 'safe-judge', suit: 'heart', color: 'red', rank: 'A' })];
  assert.equal(Engine.startTurn(move, 'player').ok, true);
  assert.equal(move.enemy.judgeArea.length, 1, 'safe lightning should move to opponent');

  const hit = Engine.newGame({ seed: 316, playerHero: 'liubei', enemyHero: 'caocao' });
  hit.player.judgeArea = [c('shandian', { id: 'shandian-hit' })];
  hit.deck = [c('sha', { id: 'bad-judge', suit: 'spade', color: 'black', rank: '7' })];
  const hp = hit.player.hp;
  assert.equal(Engine.startTurn(hit, 'player').ok, true);
  assert.equal(hit.player.hp, hp - 3);
  assert.equal(hit.player.judgeArea.length, 0);
});

console.log('\nCard/equipment tests passed.');
