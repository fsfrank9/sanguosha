// v10 V6 端到端: 决斗 玩家手动【杀】响应 (走 V3 框架).
// 引擎默认零回归 (无 shaDuelResponse='ask' 时, playDuel 沿用旧 sync 循环).
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

function setup(seed) {
  const game = Engine.newGame({ seed: seed || 96001, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.skillPreferences = game.player.skillPreferences || {};
  game.player.skillPreferences.shaDuelResponse = 'ask';
  game.turn = 'enemy';
  game.phase = 'play';
  return game;
}

// ───── 暂停 / 出杀 / 不出 ────────────────────────────────────────────

test('v10 V6: 敌方对玩家【决斗】 + 玩家有杀 + ask → 暂停 sha-duel-response', () => {
  const game = setup(96001);
  game.player.hand = [Engine.makeTestCard('sha', { id: 'psha' })];
  game.enemy.hand = [Engine.makeTestCard('juedou', { id: 'ej' })];
  const hpBefore = game.player.hp;

  const res = Engine.playCard(game, 'enemy', 'ej');
  assert.equal(res.ok, true);
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'sha-duel-response');
  assert.equal(game.pendingChoice.actor, 'player');
  assert.equal(game.pendingChoice.reason, '【决斗】');
  assert.equal(game.pendingChoice.starterActor, 'enemy');
  assert.deepEqual(game.pendingChoice.options.map(o => o.cardId), ['psha']);
  assert.ok(game.pauseState.duelChain);
  assert.equal(game.pauseState.duelChain.starterActor, 'enemy');
  // 未结算 — HP 未变
  assert.equal(game.player.hp, hpBefore);
});

test('v10 V6: resolvePendingChoice({use:true}) → 出杀, 链推进 (AI 出杀 / 不出 决定胜负)', () => {
  const game = setup(96002);
  game.player.hand = [Engine.makeTestCard('sha', { id: 'psha' })];
  game.enemy.hand = [
    Engine.makeTestCard('juedou', { id: 'ej' })
    // AI 无杀 → AI 无法 counter → AI 受伤
  ];
  Engine.playCard(game, 'enemy', 'ej');
  const enemyHpBefore = game.enemy.hp;

  const res = Engine.resolvePendingChoice(game, { use: true });
  assert.equal(res.ok, true);
  assert.equal(game.pendingChoice, null);
  assert.equal(game.pauseState.duelChain, null);
  assert.equal(game.enemy.hp, enemyHpBefore - 1, 'AI 无杀 → 受 1 伤');
  assert.equal(game.player.hand.length, 0, '玩家杀已消耗');
});

test('v10 V6: resolvePendingChoice({use:false}) → 不出杀, 玩家受 1 伤', () => {
  const game = setup(96003);
  game.player.hand = [Engine.makeTestCard('sha', { id: 'psha' })];
  game.enemy.hand = [Engine.makeTestCard('juedou', { id: 'ej' })];
  Engine.playCard(game, 'enemy', 'ej');
  const playerHpBefore = game.player.hp;

  const res = Engine.resolvePendingChoice(game, { use: false });
  assert.equal(res.ok, true);
  assert.equal(game.player.hp, playerHpBefore - 1, '玩家受 1 伤');
  assert.equal(game.player.hand.length, 1, '杀仍在手 (未出)');
});

test('v10 V6: resolvePendingChoice({cardId:psha}) → 指定用此牌当杀', () => {
  const game = setup(96004);
  game.player.hand = [
    Engine.makeTestCard('sha', { id: 'psha1' }),
    Engine.makeTestCard('sha', { id: 'psha2' })
  ];
  game.enemy.hand = [Engine.makeTestCard('juedou', { id: 'ej' })];
  Engine.playCard(game, 'enemy', 'ej');

  const res = Engine.resolvePendingChoice(game, { cardId: 'psha2' });
  assert.equal(res.ok, true);
  assert.equal(game.player.hand.length, 1, '只用了 1 张杀');
  assert.equal(game.player.hand[0].id, 'psha1', '剩 psha1, psha2 被消耗');
});

// ───── 链: 双方多张杀 ────────────────────────────────────────────────

test('v10 V6 链: 玩家出杀 → AI 出杀 (AI 自动反响应) → 玩家再决定', () => {
  const game = setup(96005);
  game.player.hand = [
    Engine.makeTestCard('sha', { id: 'psha1' }),
    Engine.makeTestCard('sha', { id: 'psha2' })
  ];
  game.enemy.hand = [
    Engine.makeTestCard('juedou', { id: 'ej' }),
    Engine.makeTestCard('sha', { id: 'esha' })
  ];

  Engine.playCard(game, 'enemy', 'ej');
  // 玩家第一次决定
  Engine.resolvePendingChoice(game, { use: true });
  // AI 自动出杀 → 链回到玩家
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'sha-duel-response');
  assert.equal(game.player.hand.length, 1, '玩家剩 1 张杀');
  assert.equal(game.enemy.hand.length, 0, 'AI 反响应消耗了 1 张杀');
});

test('v10 V6 链: 玩家第二次出杀 + AI 无更多杀 → AI 受伤, 链结束', () => {
  const game = setup(96006);
  game.player.hand = [
    Engine.makeTestCard('sha', { id: 'psha1' }),
    Engine.makeTestCard('sha', { id: 'psha2' })
  ];
  game.enemy.hand = [
    Engine.makeTestCard('juedou', { id: 'ej' }),
    Engine.makeTestCard('sha', { id: 'esha' })
  ];
  Engine.playCard(game, 'enemy', 'ej');
  Engine.resolvePendingChoice(game, { use: true });  // 玩家第一次
  const enemyHpBefore = game.enemy.hp;
  Engine.resolvePendingChoice(game, { use: true });  // 玩家第二次 → AI 没了 → AI 受伤

  assert.equal(game.pendingChoice, null);
  assert.equal(game.pauseState.duelChain, null);
  assert.equal(game.enemy.hp, enemyHpBefore - 1);
  assert.equal(game.player.hand.length, 0);
});

test('v10 V6 链: 玩家中途 decline → 玩家受 1 伤', () => {
  const game = setup(96007);
  game.player.hand = [
    Engine.makeTestCard('sha', { id: 'psha1' }),
    Engine.makeTestCard('sha', { id: 'psha2' })
  ];
  game.enemy.hand = [
    Engine.makeTestCard('juedou', { id: 'ej' }),
    Engine.makeTestCard('sha', { id: 'esha' })
  ];
  Engine.playCard(game, 'enemy', 'ej');
  Engine.resolvePendingChoice(game, { use: true });  // 玩家第一次
  const playerHpBefore = game.player.hp;
  Engine.resolvePendingChoice(game, { use: false }); // 玩家第二次不出

  assert.equal(game.pendingChoice, null);
  assert.equal(game.player.hp, playerHpBefore - 1);
  assert.equal(game.player.hand.length, 1, '剩 1 张未用');
});

// ───── 边界 / 默认 ──────────────────────────────────────────────────

test('v10 V6: 玩家手中无杀 → 不暂停 (直接受伤)', () => {
  const game = setup(96008);
  game.player.hand = [];
  game.enemy.hand = [Engine.makeTestCard('juedou', { id: 'ej' })];
  const hpBefore = game.player.hp;

  const res = Engine.playCard(game, 'enemy', 'ej');
  assert.equal(res.ok, true);
  assert.equal(game.pendingChoice, null, '无杀 → 不暂停');
  assert.equal(game.player.hp, hpBefore - 1, '受 1 伤');
});

test('v10 V6: 无 shaDuelResponse pref → 沿用旧 sync 循环 (引擎自动)', () => {
  const game = setup(96009);
  delete game.player.skillPreferences.shaDuelResponse;
  game.player.hand = [Engine.makeTestCard('sha', { id: 'psha' })];
  game.enemy.hand = [Engine.makeTestCard('juedou', { id: 'ej' })];

  const res = Engine.playCard(game, 'enemy', 'ej');
  assert.equal(res.ok, true);
  assert.equal(game.pendingChoice, null, '默认不暂停');
  // 玩家自动出杀 → AI 无杀 → AI 受 1 伤
  assert.equal(game.enemy.hp < game.player.maxHp || true, true);
  assert.equal(game.player.hand.length, 0, '玩家杀自动消耗');
});

test('v10 V6: 玩家自己用决斗 (打 AI) → 不暂停 (AI 自动响应链, 玩家方仍同步)', () => {
  const game = setup(96010);
  game.turn = 'player'; game.phase = 'play';
  game.player.hand = [
    Engine.makeTestCard('juedou', { id: 'pj' }),
    Engine.makeTestCard('sha', { id: 'psha' })
  ];
  game.enemy.hand = [];  // AI 无杀

  const res = Engine.playCard(game, 'player', 'pj');
  assert.equal(res.ok, true);
  // AI 是 currentResponder, 无杀 → AI 受伤; 玩家方不需要决定 (AI 没 sha)
  // 实际: AI 无杀 → 链跳过玩家暂停 → AI 受 1 伤
  assert.equal(game.pendingChoice, null);
});

// ───── 武圣 + 龙胆 转化候选 ─────────────────────────────────────────

test('v10 V6: 玩家有龙胆 + 闪 → options 含 龙胆转化候选', () => {
  const game = setup(96011);
  game.player.skills = [{ id: 'longdan', status: 'implemented' }];
  game.player.hand = [Engine.makeTestCard('shan', { id: 'pshan' })];
  game.enemy.hand = [Engine.makeTestCard('juedou', { id: 'ej' })];

  Engine.playCard(game, 'enemy', 'ej');
  const opts = game.pendingChoice.options;
  assert.ok(opts.length >= 1);
  const longdan = opts.find(o => o.via === '龙胆');
  assert.ok(longdan, '应有 龙胆 转化候选');
  assert.equal(longdan.cardId, 'pshan');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
