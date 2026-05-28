// v10 V4 端到端: 万箭齐发 玩家闪响应 (走 V3 requestPlayerResponse 框架).
// 引擎默认行为零回归 (无 shanResponse='ask' 时自动响应).
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

function setupGame(seed) {
  const game = Engine.newGame({ seed: seed || 92001, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.skillPreferences = game.player.skillPreferences || {};
  game.player.skillPreferences.shanResponse = 'ask';
  game.turn = 'enemy';
  game.phase = 'play';
  return game;
}

test('v10 V4: 玩家被【万箭齐发】 + shanResponse=ask + 有闪 → 暂停 pendingChoice wanjian-response', () => {
  const game = setupGame();
  game.player.hand = [Engine.makeTestCard('shan', { id: 'pshan' })];
  game.enemy.hand = [Engine.makeTestCard('wanjian', { id: 'ewan' })];
  const playerHpBefore = game.player.hp;

  const res = Engine.playCard(game, 'enemy', 'ewan');
  assert.equal(res.ok, true, res.message);
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'wanjian-response');
  assert.equal(game.pendingChoice.actor, 'player');
  assert.equal(game.pendingChoice.sourceName, '万箭齐发');
  assert.ok(game.pauseState && game.pauseState.wanjianResponse);
  assert.equal(game.pauseState.wanjianResponse.sourceActor, 'enemy');
  assert.equal(game.pauseState.wanjianResponse.title, '万箭齐发');
  // 候选含玩家手中的闪
  const optIds = (game.pendingChoice.options || []).map(o => o.cardId);
  assert.deepEqual(optIds, ['pshan']);
  // 伤害未结算 (等待响应)
  assert.equal(game.player.hp, playerHpBefore);
});

test('v10 V4: resolvePendingChoice({use:true}) → 出闪化解, 无伤害', () => {
  const game = setupGame(92002);
  game.player.hand = [Engine.makeTestCard('shan', { id: 'pshan' })];
  game.enemy.hand = [Engine.makeTestCard('wanjian', { id: 'ewan' })];
  Engine.playCard(game, 'enemy', 'ewan');
  const hpBefore = game.player.hp;

  const res = Engine.resolvePendingChoice(game, { use: true });
  assert.equal(res.ok, true, res.message);
  assert.equal(game.player.hp, hpBefore, '化解 → 无伤害');
  assert.equal(game.player.hand.length, 0, '闪 已消耗');
  assert.equal(game.pendingChoice, null);
  assert.equal(game.pauseState.wanjianResponse, null, 'pauseState 已清');
});

test('v10 V4: resolvePendingChoice({cardId:pshan}) → 指定用此牌当闪化解', () => {
  const game = setupGame(92003);
  game.player.hand = [Engine.makeTestCard('shan', { id: 'pshan' })];
  game.enemy.hand = [Engine.makeTestCard('wanjian', { id: 'ewan' })];
  Engine.playCard(game, 'enemy', 'ewan');
  const hpBefore = game.player.hp;

  const res = Engine.resolvePendingChoice(game, { cardId: 'pshan' });
  assert.equal(res.ok, true, res.message);
  assert.equal(game.player.hp, hpBefore);
  assert.equal(game.player.hand.length, 0);
});

test('v10 V4: resolvePendingChoice({use:false}) → 不出闪, 受 1 点伤害', () => {
  const game = setupGame(92004);
  game.player.hand = [Engine.makeTestCard('shan', { id: 'pshan' })];
  game.enemy.hand = [Engine.makeTestCard('wanjian', { id: 'ewan' })];
  Engine.playCard(game, 'enemy', 'ewan');
  const hpBefore = game.player.hp;

  const res = Engine.resolvePendingChoice(game, { use: false });
  assert.equal(res.ok, true, res.message);
  assert.equal(game.player.hp, hpBefore - 1, '受 1 点伤害');
  assert.equal(game.player.hand.length, 1, '闪 仍在手中 (未消耗)');
});

test('v10 V4: 无 shanResponse pref → 引擎自动响应 (旧行为, 不暂停)', () => {
  const game = setupGame(92005);
  delete game.player.skillPreferences.shanResponse;  // 关 pref
  game.player.hand = [Engine.makeTestCard('shan', { id: 'pshan' })];
  game.enemy.hand = [Engine.makeTestCard('wanjian', { id: 'ewan' })];
  const hpBefore = game.player.hp;

  const res = Engine.playCard(game, 'enemy', 'ewan');
  assert.equal(res.ok, true, res.message);
  assert.equal(game.pendingChoice, null, '未暂停');
  assert.equal(game.player.hp, hpBefore, '自动出闪化解');
});

test('v10 V4: shanResponse=ask 但玩家无闪 → 不暂停 (直接受伤)', () => {
  const game = setupGame(92006);
  game.player.hand = [];  // 无闪
  game.enemy.hand = [Engine.makeTestCard('wanjian', { id: 'ewan' })];
  const hpBefore = game.player.hp;

  const res = Engine.playCard(game, 'enemy', 'ewan');
  assert.equal(res.ok, true, res.message);
  assert.equal(game.pendingChoice, null);
  assert.equal(game.player.hp, hpBefore - 1, '无闪 → 受伤');
});

test('v10 V4: 玩家自己用【万箭齐发】打敌方 → 不暂停 (只玩家被攻击才暂停)', () => {
  const game = setupGame(92007);
  game.turn = 'player'; game.phase = 'play';
  game.player.hand = [Engine.makeTestCard('wanjian', { id: 'pwan' })];
  game.enemy.hand = [Engine.makeTestCard('shan', { id: 'eshan' })];
  const enemyHpBefore = game.enemy.hp;

  const res = Engine.playCard(game, 'player', 'pwan');
  assert.equal(res.ok, true, res.message);
  assert.equal(game.pendingChoice, null, '玩家用万箭不暂停');
  assert.equal(game.enemy.hp, enemyHpBefore, '敌方自动出闪化解');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
