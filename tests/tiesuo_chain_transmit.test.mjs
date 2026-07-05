import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

// v11 A1: 引擎变更调用已接入 assertCardConservation 全局牌守恒断言。
// H4 (审计二轮): 铁索连环属性伤害传导 — gltjk card__scroll.md。此前 chained
// 只是 UI 布尔, damage() 无任何连环逻辑: 不解除横置、不传导, 横置等于无效果。
//   - 横置角色受到属性 (火/雷) 伤害 → 解除连环状态
//   - 非传导伤害结算完毕后 → 对其他横置角色造成等量同属性传导伤害
//   - 传导伤害不再引发新的传导; 普通伤害不解除也不传导

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

test('H4: 双方横置 + 火杀 → 目标受伤解除, 传导等量火伤给另一横置角色并解除', () => {
  const game = makeGame();
  game.player.chained = true;
  game.enemy.chained = true;
  game.player.hand = [c('fire_sha', { id: 'fs-1', suit: 'heart', color: 'red' })];
  const playerHp = game.player.hp;
  const enemyHp = game.enemy.hp;

  const result = assertCardConservation(game, () => Engine.playCard(game, 'player', 'fs-1'));
  assert.equal(result.ok, true);
  assert.equal(game.enemy.hp, enemyHp - 1, '目标受 1 点火伤');
  assert.equal(game.enemy.chained, false, '目标解除连环');
  assert.equal(game.player.hp, playerHp - 1, '传导: 出杀者自己也横置 → 受等量火伤');
  assert.equal(game.player.chained, false, '被传导者也解除连环');
  assert.ok(game.log.some((entry) => /铁索连环.*传导/.test(entry)), '有传导 log');
});

test('H4: 普通杀对横置目标 → 不解除、不传导', () => {
  const game = makeGame();
  game.player.chained = true;
  game.enemy.chained = true;
  game.player.hand = [c('sha', { id: 'ns-1' })];
  const playerHp = game.player.hp;

  assertCardConservation(game, () => Engine.playCard(game, 'player', 'ns-1'));
  assert.equal(game.enemy.chained, true, '普通伤害不解除连环');
  assert.equal(game.player.hp, playerHp, '无传导');
});

test('H4: 目标横置但对方未横置 → 解除自身, 无传导', () => {
  const game = makeGame();
  game.player.chained = false;
  game.enemy.chained = true;
  game.player.hand = [c('fire_sha', { id: 'fs-2', suit: 'heart', color: 'red' })];
  const playerHp = game.player.hp;

  assertCardConservation(game, () => Engine.playCard(game, 'player', 'fs-2'));
  assert.equal(game.enemy.chained, false, '目标解除');
  assert.equal(game.player.hp, playerHp, '对方未横置 → 无传导');
});

test('H4: 未横置目标受属性伤害 → 完全无连环结算', () => {
  const game = makeGame();
  game.player.chained = true; // 出杀者横置, 但目标未横置
  game.enemy.chained = false;
  game.player.hand = [c('fire_sha', { id: 'fs-3', suit: 'heart', color: 'red' })];
  const playerHp = game.player.hp;

  assertCardConservation(game, () => Engine.playCard(game, 'player', 'fs-3'));
  assert.equal(game.player.chained, true, '目标未横置 → 不发生任何传导/解除');
  assert.equal(game.player.hp, playerHp);
  assert.ok(!game.log.some((entry) => /解除连环/.test(entry)));
});

test('H4: 闪电雷伤传导 — 判定阶段 3 点雷伤传导给另一横置角色', () => {
  const game = makeGame();
  game.player.chained = true;
  game.enemy.chained = true;
  game.enemy.judgeArea = [c('shandian', { id: 'ld-chain' })];
  game.deck = [
    c('shan', { id: 'd1', suit: 'club' }),
    c('shan', { id: 'd2', suit: 'club' }),
    c('sha', { id: 'judge-spade', suit: 'spade', rank: '5' })
  ];
  const playerHp = game.player.hp;
  const enemyHp = game.enemy.hp;

  assertCardConservation(game, () => Engine.endTurn(game)); // enemy 回合判定阶段闪电命中
  assert.equal(game.enemy.hp, enemyHp - 3, '闪电 3 点雷伤');
  assert.equal(game.enemy.chained, false, '解除连环');
  assert.equal(game.player.hp, playerHp - 3, '传导 3 点雷伤');
  assert.equal(game.player.chained, false, '被传导者解除');
  assert.notEqual(game.phase, 'gameover');
});

test('H4: 传导火伤遇藤甲 → 火焰伤害 +1 正常结算', () => {
  const game = makeGame();
  game.player.chained = true;
  game.enemy.chained = true;
  game.player.equipment.armor = c('tengjia', { id: 'tj-p' });
  game.player.hand = [c('fire_sha', { id: 'fs-4', suit: 'heart', color: 'red' })];
  const playerHp = game.player.hp;

  assertCardConservation(game, () => Engine.playCard(game, 'player', 'fs-4'));
  assert.equal(game.player.hp, playerHp - 2, '传导火伤 1 + 藤甲 +1 = 2');
});

test('H4: 传导伤害致死 → 游戏正常结束', () => {
  const game = makeGame();
  game.player.chained = true;
  game.enemy.chained = true;
  game.player.hp = 1;
  game.player.hand = [c('fire_sha', { id: 'fs-5', suit: 'heart', color: 'red' })];

  assertCardConservation(game, () => Engine.playCard(game, 'player', 'fs-5'));
  assert.equal(game.phase, 'gameover', '传导 1 点火伤打死 1 血出杀者');
  assert.equal(game.winner, 'enemy');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
