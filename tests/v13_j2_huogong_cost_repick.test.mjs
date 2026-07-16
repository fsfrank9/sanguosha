// v13 J2: 火攻成本挂起重选 — 三重巧合路径 (无懈拉锯 × 展示缓存消耗 ×
// 重展示花色变化) 下, 玩家出牌时显式指定的成本牌在结算中途失效。v12 曾
// 自动代选同花色 (人类显式选择被顶替, 复核记录在案的已知简化); v13 补
// pendingChoice 'huogong-cost' 挂起重选三件套: 引擎 resolver + 面板 +
// 行为测试。AI/auto 座席保持自动改选 (旧行为); 无同花色仍走无伤结算兜底。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

// 布局三重巧合: 玩家出火攻带显式 club 成本; 展示缓存钉在目标的 club 无懈上;
// 目标 (hp=2, EV 满足) 打出该无懈 (缓存被消耗) → 玩家反无懈 → 结算恢复 →
// 重展示只剩 heart → club 成本失效。
function buildTripleCoincidence(opts) {
  opts = opts || {};
  const game = Engine.newGame({ seed: 13201, playerHero: 'liubei', enemyHero: 'caocao' });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].flags = {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp;
    game[actor].skillPreferences = {};
  }
  game.turn = 'player';
  game.phase = 'play';
  game.player.hand = [
    c('huogong', { id: 'hg' }),
    c('sha', { id: 'c-club', suit: 'club', color: 'black' }),
    c('sha', { id: 'c-heart', suit: 'heart', color: 'red' }),
    c('wuxie', { id: 'p-wx', suit: 'diamond', color: 'red' })
  ];
  game.enemy.hand = [
    c('wuxie', { id: 'e-wx', suit: 'club', color: 'black' }),
    c('shan', { id: 'e-heart', suit: 'heart', color: 'red' })
  ];
  game.enemy.hp = 2; // 火攻 EV: hp<=2 才无懈
  game.pauseState = game.pauseState || {};
  game.pauseState.huogongReveal = { targetActor: 'enemy', cardId: 'e-wx' };
  if (opts.ask) game.player.skillPreferences.huogongCost = 'ask';
  return game;
}

test('J2: 三重巧合 + ask → 挂起 huogong-cost 重选, 不再自动代选', () => {
  const game = buildTripleCoincidence({ ask: true });
  const r = Engine.playCard(game, 'player', 'hg', { huogongCostCardId: 'c-club' });
  assert.equal(r.ok, true, r.message);
  // 无懈拉锯: 敌方消耗被缓存的 club 无懈 → 玩家反无懈 → 结算恢复
  assert.ok(game.discard.some((x) => x.id === 'e-wx'), '缓存的展示牌 (无懈) 被消耗');
  assert.ok(game.discard.some((x) => x.id === 'p-wx'), '玩家反无懈');
  // 重展示只剩 heart → 显式 club 成本失效 → 挂起重选
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'huogong-cost', '挂起重选');
  assert.equal(game.pendingChoice.actor, 'player');
  assert.deepEqual(game.pendingChoice.usableCostIds, ['c-heart'], '候选 = 同花色 (heart) 手牌');
  assert.ok(game.player.hand.some((x) => x.id === 'c-club'), '失效成本退回手牌');
  assert.equal(game.enemy.hp, 2, '挂起期间未结算伤害');

  // 重选 heart 成本 → 1 点火焰伤害
  assertCardConservation(game, () => {
    const r2 = Engine.resolvePendingChoice(game, { cardId: 'c-heart' });
    assert.equal(r2.ok, true, r2.message);
  });
  assert.equal(game.enemy.hp, 1, '重选成本后火攻命中 1 点');
  assert.ok(game.discard.some((x) => x.id === 'c-heart'), '重选的成本弃置');
});

test('J2: 挂起重选 → 选不弃置 → 无伤结算', () => {
  const game = buildTripleCoincidence({ ask: true });
  Engine.playCard(game, 'player', 'hg', { huogongCostCardId: 'c-club' });
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'huogong-cost');
  assertCardConservation(game, () => {
    const r = Engine.resolvePendingChoice(game, { decline: true });
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.enemy.hp, 2, '不弃置 → 无伤');
  assert.ok(game.player.hand.some((x) => x.id === 'c-heart'), 'heart 成本保留');
  assert.ok(game.player.hand.some((x) => x.id === 'c-club'), 'club 成本保留');
});

test('J2: 无效重选 (花色不符) → 重挂面板等待', () => {
  const game = buildTripleCoincidence({ ask: true });
  Engine.playCard(game, 'player', 'hg', { huogongCostCardId: 'c-club' });
  const r = Engine.resolvePendingChoice(game, { cardId: 'c-club' }); // club ≠ 重展示的 heart
  assert.equal(r.ok, false, '花色不符被拒');
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'huogong-cost', '面板重挂');
  const r2 = Engine.resolvePendingChoice(game, { cardId: 'c-heart' });
  assert.equal(r2.ok, true, r2.message);
  assert.equal(game.enemy.hp, 1);
});

test('J2 零回归: AI/auto 座席保持自动改选同花色 (旧行为)', () => {
  const game = buildTripleCoincidence({ ask: false });
  const r = Engine.playCard(game, 'player', 'hg', { huogongCostCardId: 'c-club' });
  assert.equal(r.ok, true, r.message);
  assert.equal(game.pendingChoice, null, 'auto 不挂起');
  assert.equal(game.enemy.hp, 1, '自动改选同花色, 火攻命中');
  assert.ok(game.discard.some((x) => x.id === 'c-heart'), '自动改选的 heart 弃置');
  assert.ok(game.player.hand.some((x) => x.id === 'c-club'), '失效 club 退回手牌');
});

test('J2 兜底: 重展示后无同花色 → 无伤结算 (不挂起)', () => {
  const game = buildTripleCoincidence({ ask: true });
  // 玩家没有 heart 牌 → 重展示 heart 后无同花色可弃
  game.player.hand = game.player.hand.filter((x) => x.id !== 'c-heart');
  const r = Engine.playCard(game, 'player', 'hg', { huogongCostCardId: 'c-club' });
  assert.equal(r.ok, true, r.message);
  assert.equal(game.pendingChoice, null, '无候选 → 不挂起');
  assert.equal(game.enemy.hp, 2, '无同花色 → 无伤结算兜底');
  assert.match(r.message, /没有同花色牌可弃/, '兜底结果信息');
  assert.ok(game.player.hand.some((x) => x.id === 'c-club'), '失效成本退回手牌');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
