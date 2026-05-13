import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function makeGame() {
  const game = Engine.newGame({ seed: 78, startWithFirstTurn: true });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

function dealJiu(state, id) {
  const card = { id, type: 'jiu', name: '酒', suit: 'spade', color: 'black' };
  state.hand.push(card);
  return card;
}

function dealSha(state, id) {
  const card = { id, type: 'sha', name: '杀', suit: 'spade', color: 'black' };
  state.hand.push(card);
  return card;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v7 PR-8: 第一次 酒 → ok; 第二次 酒 同回合 → 拒绝', () => {
  const game = makeGame();
  dealJiu(game.player, 'jiu-1');
  dealJiu(game.player, 'jiu-2');
  assert.equal(Engine.playCard(game, 'player', 'jiu-1').ok, true);
  assert.equal(game.player.flags.jiuUsedThisTurn, true);
  assert.equal(game.player.shaBonus, 1);
  // Second jiu blocked by canPlayCard
  const second = Engine.canPlayCard(game, 'player', game.player.hand[0]);
  assert.equal(second.ok, false);
  assert.match(second.message, /已经使用过/);
});

test('v7 PR-8: 酒 + 杀 同回合 → 杀伤害 = 2', () => {
  const game = makeGame();
  dealJiu(game.player, 'jiu-boost');
  dealSha(game.player, 'boosted-sha');
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'jiu-boost');
  Engine.playCard(game, 'player', 'boosted-sha');
  assert.equal(game.enemy.hp, enemyHpBefore - 2, '酒+杀 → 2 点伤害');
  assert.equal(game.player.shaBonus, 0, 'shaBonus 用一次后重置');
});

test('v7 PR-8: shaBonus 在使用一张【杀】后归零；下一张 杀 不再 +1', () => {
  const game = makeGame();
  dealJiu(game.player, 'jiu-once');
  dealSha(game.player, 'sha-1');
  dealSha(game.player, 'sha-2');
  game.player.equipment.weapon = { id: 'zhuge', type: 'zhuge', name: '诸葛连弩', family: 'equipment', slot: 'weapon', range: 1 };
  Engine.playCard(game, 'player', 'jiu-once');
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'sha-1');
  // First sha: bonus +1 → 2 dmg
  assert.equal(game.enemy.hp, enemyHpBefore - 2);
  Engine.playCard(game, 'player', 'sha-2');
  // Second sha: no bonus → 1 dmg
  assert.equal(game.enemy.hp, enemyHpBefore - 3);
});

test('v7 PR-8: 酒 喝完不出杀 → 回合结束 shaBonus 归零', () => {
  const game = makeGame();
  dealJiu(game.player, 'jiu-wasted');
  Engine.playCard(game, 'player', 'jiu-wasted');
  assert.equal(game.player.shaBonus, 1);
  // Force end-of-turn reset
  Engine.endTurn(game);
  assert.equal(game.player.shaBonus, 0, 'shaBonus 在回合结束时清零');
  assert.equal(game.player.flags.jiuUsedThisTurn, false, '酒次数也清零');
});

test('v7 PR-8: 新回合可以再次喝 酒', () => {
  const game = makeGame();
  dealJiu(game.player, 'jiu-turn-1');
  dealJiu(game.player, 'jiu-turn-3');
  Engine.playCard(game, 'player', 'jiu-turn-1');
  // turn ends; jiuUsedThisTurn reset
  Engine.endTurn(game);
  // now it's enemy's turn; end again to come back to player
  Engine.endTurn(game);
  // 新一轮 player 的回合开始；force phase 到 play 跳过 prepare 流程的细节
  game.turn = 'player';
  game.phase = 'play';
  // jiuUsedThisTurn should be false now
  assert.equal(game.player.flags.jiuUsedThisTurn, false);
  const result = Engine.playCard(game, 'player', 'jiu-turn-3');
  assert.equal(result.ok, true, '新回合可再次饮酒');
});

test('v7 PR-8: 酒 不会累加 shaBonus（即使 canPlayCard 被绕过模拟）', () => {
  // 直接调 resolve 不走 canPlayCard 验证: shaBonus 应该被 set = 1，不是累加
  const game = makeGame();
  game.player.shaBonus = 5; // 模拟某种异常状态
  dealJiu(game.player, 'jiu-not-acc');
  Engine.playCard(game, 'player', 'jiu-not-acc');
  assert.equal(game.player.shaBonus, 1, 'shaBonus 设置为 1，不累加');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
