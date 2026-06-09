import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

// M2 (审计二轮): 白银狮子 — "当你失去装备区里的【白银狮子】时, 你回复1点体力"。
// 此前回血只在 loseEquipment 一条路径生效; 替换防具 / 过河拆桥 / 制衡弃装备 /
// 反馈拿装备等路径直接清槽位, 全部绕过回血。

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function makeGame(playerHero = 'liubei', enemyHero = 'sunquan') {
  const game = Engine.newGame({ seed: 97, startWithFirstTurn: true, playerHero, enemyHero });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('M2: 装新防具替换白银狮子 → 回复 1 点体力', () => {
  const game = makeGame();
  game.player.equipment.armor = c('baiyin', { id: 'by-replace' });
  game.player.hp = game.player.maxHp - 2;
  game.player.hand = [c('bagua', { id: 'new-armor' })];

  const result = Engine.playCard(game, 'player', 'new-armor');
  assert.equal(result.ok, true);
  assert.equal(game.player.equipment.armor.id, 'new-armor');
  assert.equal(game.player.hp, game.player.maxHp - 1, '替换失去白银 → +1');
  assert.ok(game.discard.some((card) => card.id === 'by-replace'), '旧白银进弃牌堆');
});

test('M2: 过河拆桥弃置对方白银狮子 → 对方回复 1 点体力', () => {
  const game = makeGame();
  game.enemy.equipment.armor = c('baiyin', { id: 'by-guohe' });
  game.enemy.hp = game.enemy.maxHp - 2;
  game.player.hand = [c('guohe', { id: 'gh-by' })];

  Engine.playCard(game, 'player', 'gh-by');
  const resolved = Engine.resolvePendingChoice(game, { zone: 'equipment', cardId: 'by-guohe' });
  assert.equal(resolved.ok, true);
  assert.equal(game.enemy.equipment.armor, null);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, '被拆白银 → +1');
});

test('M2: 制衡弃置装备区白银狮子 → 回复 1 点体力', () => {
  const game = makeGame('sunquan', 'liubei');
  game.player.equipment.armor = c('baiyin', { id: 'by-zhiheng' });
  game.player.hp = game.player.maxHp - 2;

  const result = Engine.useSkill(game, 'player', 'zhiheng', ['by-zhiheng']);
  assert.equal(result.ok, true, result.message);
  assert.equal(game.player.equipment.armor, null);
  assert.equal(game.player.hp, game.player.maxHp - 1, '制衡弃白银 → +1');
});

test('M2: 反馈拿走对方装备区白银狮子 → 失去方回复 1 点体力', () => {
  const game = makeGame('simayi', 'caocao');
  game.turn = 'enemy';
  game.enemy.equipment.armor = c('baiyin', { id: 'by-fankui' });
  game.enemy.hp = game.enemy.maxHp - 2;
  game.enemy.hand = [c('sha', { id: 'dmg-sha' })];

  Engine.playCard(game, 'enemy', 'dmg-sha'); // 司马懿受伤 → 反馈 ask
  assert.equal(game.pendingChoice.kind, 'fankui-pick');
  const resolved = Engine.resolvePendingChoice(game, { zone: 'equipment', cardId: 'by-fankui' });
  assert.equal(resolved.ok, true);
  assert.ok(game.player.hand.some((card) => card.id === 'by-fankui'), '司马懿获得白银');
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, '曹操失去白银 → +1');
});

test('M2: 满血时失去白银狮子 → 不回血 (回复体力受上限限制)', () => {
  const game = makeGame();
  game.player.equipment.armor = c('baiyin', { id: 'by-full' });
  game.player.hp = game.player.maxHp;
  game.player.hand = [c('renwang', { id: 'rw-armor' })];

  Engine.playCard(game, 'player', 'rw-armor');
  assert.equal(game.player.hp, game.player.maxHp, '满血不超回');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
