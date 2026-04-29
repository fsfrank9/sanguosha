import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const htmlPath = path.resolve(import.meta.dirname, '../index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script id="game-engine"[^>]*>([\s\S]*?)<\/script>/);
assert.ok(match, 'index.html should contain <script id="game-engine">');

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox, { filename: 'game-engine.js' });
const Engine = sandbox.window.SanguoshaEngine;
assert.ok(Engine, 'engine should expose window.SanguoshaEngine');

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

function skillIds(heroId) {
  return Array.from(Engine.HERO_CATALOG[heroId].skills || []).map((skill) => skill.id);
}

test('主公/反贼身份决定游戏开始后的先手，玩家是反贼时敌方主公先行动', () => {
  const game = Engine.newGame({
    seed: 3001,
    playerHero: 'liubei',
    enemyHero: 'caocao',
    playerRole: '反贼',
    enemyRole: '主公',
    startWithFirstTurn: true
  });
  assert.equal(game.roles.player, '反贼');
  assert.equal(game.roles.enemy, '主公');
  assert.equal(game.firstActor, 'enemy');
  assert.equal(game.turn, 'enemy');
  assert.equal(game.phase, 'play');
  assert.equal(game.turnHistory[0].actor, 'enemy');
  assert.match(game.log.join('\n'), /主公先手|曹操的准备阶段/);
});

test('周瑜作为第一回合先手时，【英姿】在初始摸牌阶段正常触发', () => {
  const game = Engine.newGame({
    seed: 3002,
    playerHero: 'zhouyu',
    enemyHero: 'caocao',
    playerRole: '主公',
    enemyRole: '反贼',
    startWithFirstTurn: true
  });
  assert.equal(game.firstActor, 'player');
  assert.equal(game.turn, 'player');
  assert.equal(game.phase, 'play');
  assert.equal(game.player.hand.length, 7, 'initial four cards + Yingzi draw phase should be 7');
  assert.match(game.log.join('\n'), /周瑜.*英姿|周瑜摸了 3 张牌/);
});

test('火攻提供手动选择：展示目标牌，列出可用/不可用弃牌，并按指定牌结算', () => {
  assert.equal(typeof Engine.getHuogongChoice, 'function', 'engine should expose getHuogongChoice');
  const game = Engine.newGame({ seed: 3003, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.hand = [
    c('huogong', { id: 'huogong' }),
    c('sha', { id: 'heart-cost', suit: 'heart', color: 'red' }),
    c('shan', { id: 'spade-cost', suit: 'spade', color: 'black' })
  ];
  game.enemy.hand = [c('tao', { id: 'revealed-heart', suit: 'heart', color: 'red' })];
  const choice = Engine.getHuogongChoice(game, 'player');
  assert.equal(choice.revealedCard.id, 'revealed-heart');
  assert.deepEqual(Array.from(choice.usableCostIds), ['heart-cost']);
  assert.deepEqual(Array.from(choice.unusableCostIds), ['spade-cost']);

  const invalid = Engine.playCard(game, 'player', 'huogong', { huogongCostCardId: 'spade-cost' });
  assert.equal(invalid.ok, false, 'wrong-suit Huogong cost should be rejected before spending the card');
  assert.ok(game.player.hand.some((card) => card.id === 'huogong'));

  const hp = game.enemy.hp;
  const result = Engine.playCard(game, 'player', 'huogong', { huogongCostCardId: 'heart-cost' });
  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, hp - 1);
  assert.ok(game.discard.some((card) => card.id === 'heart-cost'));
});

test('火攻 UI 必须有手动选择面板，不可点击火攻后自动弃牌结算', () => {
  assert.match(html, /id="huogongModePanel"/, 'Huogong panel should exist');
  assert.match(html, /id="huogongCostChoices"/, 'Huogong cost choices should exist');
  assert.match(html, /function showHuogongPanel\(cardId\)/, 'UI should show Huogong panel first');
  assert.match(html, /data-huogong-cost-id/, 'Huogong cost cards should carry exact ids');
  assert.match(html, /huogongCostCardId:\s*costCardId/, 'UI should pass the selected cost card to engine');
});

test('下方手牌以固定牌块横向排列，不应按数量自动填满剩余宽度', () => {
  assert.match(html, /\.hand\s*\{[\s\S]*display:\s*flex/, 'hand area should use flex row');
  assert.match(html, /\.card\s*\{[\s\S]*flex:\s*0\s+0\s+(?:108|112|116|120)px/, 'each card should keep a fixed block width');
  assert.doesNotMatch(html, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(94px,\s*1fr\)\)/, 'hand cards must not auto-fill as 1fr grid columns');
});

test('已有武将补全官方核心技能元数据', () => {
  const expected = {
    liubei: ['rende', 'jijiang'],
    zhangfei: ['paoxiao'],
    guanyu: ['wusheng'],
    zhaoyun: ['longdan'],
    sunquan: ['zhiheng', 'jiuyuan'],
    huanggai: ['kurou'],
    caocao: ['jianxiong', 'hujia'],
    machao: ['mashu', 'tieqi'],
    zhangliao: ['tuxi'],
    zhouyu: ['yingzi', 'fanjian'],
    zhugeliang: ['guanxing', 'kongcheng']
  };
  for (const [hero, skills] of Object.entries(expected)) {
    for (const skill of skills) assert.ok(skillIds(hero).includes(skill), `${hero} should include ${skill}`);
  }
});

test('补全后的已有武将技能至少提供 1v1 可落地的引擎效果', () => {
  const machao = Engine.newGame({ seed: 3004, playerHero: 'machao', enemyHero: 'caocao' });
  machao.enemy.equipment.horsePlus = c('plus_horse', { id: 'plus-horse' });
  assert.equal(Engine.distanceBetween(machao, 'player', 'enemy'), 1, '马术 should offset +1 horse distance in 1v1');

  const liubei = Engine.newGame({ seed: 3005, playerHero: 'liubei', enemyHero: 'caocao' });
  liubei.player.hp = 3;
  liubei.player.hand = [c('sha', { id: 'rende-1' }), c('shan', { id: 'rende-2' })];
  assert.equal(Engine.useSkill(liubei, 'player', 'rende', ['rende-1', 'rende-2']).ok, true);
  assert.equal(liubei.player.hp, 4, '仁德 giving two cards should heal once');
  assert.deepEqual(Array.from(liubei.enemy.hand).map((card) => card.id).slice(-2), ['rende-1', 'rende-2']);

  const zhouyu = Engine.newGame({ seed: 3006, playerHero: 'zhouyu', enemyHero: 'caocao' });
  zhouyu.player.hand = [c('sha', { id: 'fanjian-card', suit: 'heart', color: 'red' })];
  const beforeHp = zhouyu.enemy.hp;
  assert.equal(Engine.useSkill(zhouyu, 'player', 'fanjian', ['fanjian-card'], { guessedSuit: 'spade' }).ok, true);
  assert.equal(zhouyu.enemy.hp, beforeHp - 1, '反间 guessed wrong should cause 1 damage');
  assert.ok(zhouyu.enemy.hand.some((card) => card.id === 'fanjian-card'));

  const zhugeliang = Engine.newGame({ seed: 3007, playerHero: 'zhugeliang', enemyHero: 'caocao' });
  const guanxing = Engine.useSkill(zhugeliang, 'player', 'guanxing', []);
  assert.equal(guanxing.ok, true);
  assert.ok(Array.isArray(Array.from(guanxing.cards)), '观星 should return visible top cards for UI/AI use');
});

test('武将池扩充到标准包、风林火山和 SP 包，并由 UI 动态生成选择池', () => {
  const heroes = Object.values(Engine.HERO_CATALOG);
  const packs = new Set(heroes.map((hero) => hero.pack));
  for (const pack of ['standard', 'wind', 'forest', 'fire', 'mountain', 'sp']) {
    assert.ok(packs.has(pack), `missing pack: ${pack}`);
  }
  assert.ok(heroes.length >= 55, 'hero catalog should include a broad official-style pool');
  for (const id of ['xiahoudun', 'simayi', 'guojia', 'luxun', 'lvbu', 'diaochan', 'xunyu', 'dianwei', 'taishici', 'jiangwei', 'sp_zhaoyun']) {
    assert.ok(Engine.HERO_CATALOG[id], `missing expanded hero ${id}`);
  }
  assert.match(html, /function populateHeroSelects\(\)/, 'UI should populate selects from HERO_CATALOG');
  assert.match(html, /Engine\.HERO_CATALOG/, 'UI setup pool should use the engine catalog, not a small hard-coded list only');
});

console.log('\nv3.0 official-flow tests passed.');
