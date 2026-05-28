// v10 V4 端到端: 银月枪 玩家闪响应 (走 V3 requestPlayerResponse 框架).
// 银月枪触发条件: 持有者于回合外用黑色手牌时, 令对方出闪或受 1 点伤害.
// 引擎默认行为零回归 (无 shanResponse='ask' 时自动响应).
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// 构造: 敌方装银月枪, 敌方在玩家回合内打黑色手牌触发 (回合外).
// player 是 turn-holder, enemy 是 yinyue 持有者 → 玩家被攻击.
function setupGame(seed) {
  const game = Engine.newGame({ seed: seed || 93001, playerHero: 'liubei', enemyHero: 'caocao' });
  game.enemy.equipment.weapon = Engine.makeTestCard('yinyue', { id: 'eyinyue' });
  game.player.skillPreferences = game.player.skillPreferences || {};
  game.player.skillPreferences.shanResponse = 'ask';
  game.turn = 'player'; game.phase = 'play';
  return game;
}

// 银月枪在响应 / 打出黑色手牌时触发. 这里用 enemy 响应黑色【杀】触发更简便.
// 实际场景: 玩家 出杀 → enemy 出杀 响应 (决斗类) → enemy 是黑色 sha → 触发银月.
// 简化测试: 直接调 triggerYinyueQiang 入口, 校 V3 框架 pause 行为.
// 由于 triggerYinyueQiang 是内部 fn (未 export), 我们用 enemy 出黑闪响应玩家杀 触发.
function triggerByEnemyShaResponse(game) {
  // 玩家出杀, 敌方手中有黑色闪 → 响应消耗 → triggerYinyueQiang(game, 'enemy')
  game.player.hand = [Engine.makeTestCard('sha', { id: 'psha' })];
  game.enemy.hand = [
    Engine.makeTestCard('shan', { id: 'eshan', suit: 'spade', color: 'black' }),
    Engine.makeTestCard('shan', { id: 'eshan2', suit: 'spade', color: 'black' })
  ];
  return Engine.playCard(game, 'player', 'psha');
}

test('v10 V4: 玩家被银月枪 + shanResponse=ask + 有闪 → 暂停 pendingChoice yinyue-response', () => {
  const game = setupGame();
  game.player.hand = [
    Engine.makeTestCard('sha', { id: 'psha' }),
    Engine.makeTestCard('shan', { id: 'pshan' })
  ];
  game.enemy.hand = [Engine.makeTestCard('shan', { id: 'eshan', suit: 'spade', color: 'black' })];

  const playerHpBefore = game.player.hp;
  const res = Engine.playCard(game, 'player', 'psha');
  assert.equal(res.ok, true, res.message);
  // 敌方出黑闪响应 → 触发银月 → 玩家是目标 + 有闪 + ask → 暂停
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'yinyue-response');
  assert.equal(game.pendingChoice.actor, 'player');
  assert.equal(game.pendingChoice.sourceName, '银月枪');
  assert.ok(game.pauseState && game.pauseState.yinyueResponse);
  assert.equal(game.pauseState.yinyueResponse.holderActor, 'enemy');
  // 候选含玩家手中的闪
  const optIds = (game.pendingChoice.options || []).map(o => o.cardId);
  assert.deepEqual(optIds, ['pshan']);
  // 伤害未结算
  assert.equal(game.player.hp, playerHpBefore);
});

test('v10 V4: resolvePendingChoice({use:true}) → 出闪化解银月, 无伤害', () => {
  const game = setupGame(93002);
  game.player.hand = [
    Engine.makeTestCard('sha', { id: 'psha' }),
    Engine.makeTestCard('shan', { id: 'pshan' })
  ];
  game.enemy.hand = [Engine.makeTestCard('shan', { id: 'eshan', suit: 'spade', color: 'black' })];
  Engine.playCard(game, 'player', 'psha');
  const hpBefore = game.player.hp;
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'yinyue-response');

  const res = Engine.resolvePendingChoice(game, { use: true });
  assert.equal(res.ok, true, res.message);
  assert.equal(game.player.hp, hpBefore, '出闪 → 无伤害');
  assert.equal(game.pendingChoice, null);
  assert.equal(game.pauseState.yinyueResponse, null);
});

test('v10 V4: resolvePendingChoice({use:false}) → 不出闪银月, 受 1 点伤害', () => {
  const game = setupGame(93003);
  game.player.hand = [
    Engine.makeTestCard('sha', { id: 'psha' }),
    Engine.makeTestCard('shan', { id: 'pshan' })
  ];
  game.enemy.hand = [Engine.makeTestCard('shan', { id: 'eshan', suit: 'spade', color: 'black' })];
  Engine.playCard(game, 'player', 'psha');
  const hpBefore = game.player.hp;

  const res = Engine.resolvePendingChoice(game, { use: false });
  assert.equal(res.ok, true, res.message);
  assert.equal(game.player.hp, hpBefore - 1, '受 1 点伤害');
  assert.equal(game.player.hand.length, 1, '闪 仍在手中');
});

test('v10 V4: 无 shanResponse pref → 银月自动响应 (旧行为)', () => {
  const game = setupGame(93004);
  delete game.player.skillPreferences.shanResponse;
  game.player.hand = [
    Engine.makeTestCard('sha', { id: 'psha' }),
    Engine.makeTestCard('shan', { id: 'pshan' })
  ];
  game.enemy.hand = [Engine.makeTestCard('shan', { id: 'eshan', suit: 'spade', color: 'black' })];
  const hpBefore = game.player.hp;

  const res = Engine.playCard(game, 'player', 'psha');
  assert.equal(res.ok, true, res.message);
  assert.equal(game.pendingChoice, null, '未暂停');
  // 银月自动消耗玩家闪化解 → 无伤害
  assert.equal(game.player.hp, hpBefore);
});

test('v10 V4: shanResponse=ask 但玩家无闪 → 银月不暂停 (直接受伤)', () => {
  const game = setupGame(93005);
  game.player.hand = [Engine.makeTestCard('sha', { id: 'psha' })];  // 仅一张杀, 无闪
  game.enemy.hand = [Engine.makeTestCard('shan', { id: 'eshan', suit: 'spade', color: 'black' })];
  const hpBefore = game.player.hp;

  const res = Engine.playCard(game, 'player', 'psha');
  assert.equal(res.ok, true, res.message);
  assert.equal(game.pendingChoice, null, '玩家无闪 → 不暂停');
  assert.equal(game.player.hp, hpBefore - 1, '受 1 点银月伤害');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
