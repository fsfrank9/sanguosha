// v9 PR-E25: 玩家手动【闪】响应 — 被【杀】攻击时, 由玩家决定出不出【闪】.
// 引擎默认仍自动响应; 仅当 player.skillPreferences.shanResponse === 'ask'
// 且玩家有【闪】可响应时, 暂停为 pendingChoice 'shan-response'.
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

// 敌方回合, 敌方手里一张【杀】打玩家; 玩家手里一张【闪】.
function setup(prefs) {
  const game = Engine.newGame({ seed: 700, playerHero: 'liubei', enemyHero: 'caocao' });
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.player.hand = [c('shan', { id: 'p-shan' })];
  game.player.skillPreferences = prefs;
  return game;
}

test('v9 PR-E25: 玩家被【杀】+ shanResponse=ask + 有闪 → 暂停 pendingChoice shan-response', () => {
  const game = setup({ shanResponse: 'ask' });
  const hpBefore = game.player.hp;
  const r = Engine.playCard(game, 'enemy', 'e-sha');
  assert.equal(r.ok, true);
  const pc = Engine.getPendingChoice(game);
  assert.ok(pc, '应有 pendingChoice');
  assert.equal(pc.kind, 'shan-response');
  assert.equal(pc.actor, 'player');
  assert.equal(game.player.hp, hpBefore, '暂停期间不应结算伤害');
});

test('v9 PR-E25: resolvePendingChoice({use:true}) → 出闪, 无伤害, 闪进弃牌堆', () => {
  const game = setup({ shanResponse: 'ask' });
  const hpBefore = game.player.hp;
  Engine.playCard(game, 'enemy', 'e-sha');
  const r = Engine.resolvePendingChoice(game, { use: true });
  assert.equal(r.ok, true);
  assert.equal(game.player.hp, hpBefore, '出闪 → 不受伤');
  assert.equal(Engine.getPendingChoice(game), null, 'pendingChoice 应已清空');
  assert.ok(game.discard.some((x) => x.id === 'p-shan'), '【闪】应进弃牌堆');
});

test('v9 PR-E25: resolvePendingChoice({use:false}) → 不出闪, 受 1 点伤害', () => {
  const game = setup({ shanResponse: 'ask' });
  const hpBefore = game.player.hp;
  Engine.playCard(game, 'enemy', 'e-sha');
  const r = Engine.resolvePendingChoice(game, { use: false });
  assert.equal(r.ok, true);
  assert.equal(game.player.hp, hpBefore - 1, '不出闪 → 受 1 点伤害');
  assert.equal(Engine.getPendingChoice(game), null);
  assert.ok(game.player.hand.some((x) => x.id === 'p-shan'), '不出闪 → 闪仍在手牌');
});

test('v9 PR-E25: 无 shanResponse pref → 引擎自动响应 (旧行为, 不暂停)', () => {
  const game = setup({});
  const hpBefore = game.player.hp;
  const r = Engine.playCard(game, 'enemy', 'e-sha');
  assert.equal(r.ok, true);
  assert.equal(Engine.getPendingChoice(game), null, '无 ask → 不暂停');
  assert.equal(game.player.hp, hpBefore, '引擎自动出闪 → 不受伤');
});

test('v9 PR-E25: shanResponse=ask 但玩家无闪 → 不暂停 (无可响应)', () => {
  const game = setup({ shanResponse: 'ask' });
  game.player.hand = [];
  const hpBefore = game.player.hp;
  const r = Engine.playCard(game, 'enemy', 'e-sha');
  assert.equal(r.ok, true);
  assert.equal(Engine.getPendingChoice(game), null, '无闪 → 不暂停');
  assert.equal(game.player.hp, hpBefore - 1, '无闪 → 受伤');
});

test('v9 PR-E25: 玩家出【杀】打敌方 → 敌方响应自动, 不暂停 (只玩家被杀才暂停)', () => {
  const game = Engine.newGame({ seed: 701, playerHero: 'liubei', enemyHero: 'caocao' });
  game.turn = 'player';
  game.phase = 'play';
  game.player.hand = [c('sha', { id: 'p-sha' })];
  game.player.skillPreferences = { shanResponse: 'ask' };
  game.enemy.hand = [c('shan', { id: 'e-shan' })];
  const r = Engine.playCard(game, 'player', 'p-sha');
  assert.equal(r.ok, true);
  assert.equal(Engine.getPendingChoice(game), null, '玩家出杀打敌方 → 敌方响应自动, 不暂停');
});

console.log('\nShan-response (player manual 闪 response) tests passed.');
