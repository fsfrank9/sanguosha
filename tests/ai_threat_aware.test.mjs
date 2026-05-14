import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function buildGame(playerHero, enemyHero, seed) {
  const game = Engine.newGame({ seed: seed || 9801, playerHero, enemyHero });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].flags = game[actor].flags || {};
    game[actor].skillPreferences = game[actor].skillPreferences || {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp;
  }
  game.turn = 'player';
  game.phase = 'play';
  return game;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── aiEvaluateStateWithThreat ─────────────────────────────────────

test('v8 PR-D4: aiEvaluateStateWithThreat — 对方手牌空 → 无威胁, 与 baseline 相等', () => {
  const game = buildGame('liubei', 'sunquan');
  game.player.hand = [];
  game.enemy.hand = [];
  const base = Engine.aiEvaluateState(game, 'player');
  const withThreat = Engine.aiEvaluateStateWithThreat(game, 'player');
  assert.equal(withThreat, base, '0 sha 威胁 = 无 penalty');
});

test('v8 PR-D4: aiEvaluateStateWithThreat — 对方多 sha + 我无闪 → 每点 -25', () => {
  const game = buildGame('liubei', 'sunquan');
  game.player.hand = []; // 0 闪
  game.enemy.hand = [c('sha', { id: 'e-s1' }), c('sha', { id: 'e-s2' })]; // 2 sha
  const base = Engine.aiEvaluateState(game, 'player');
  const withThreat = Engine.aiEvaluateStateWithThreat(game, 'player');
  // 2 sha - 0 闪 = 2 dmg incoming × 25 = 50 penalty
  // 另外 enemy.hand=2 vs player.hand=0 → handDiff -2*5=-10 (in baseline)
  // 验证 threat penalty = 50
  assert.equal(base - withThreat, 50, '威胁 penalty = 50');
});

test('v8 PR-D4: aiEvaluateStateWithThreat — 我方有闪抵消, 威胁 减少', () => {
  const game = buildGame('liubei', 'sunquan');
  game.player.hand = [c('shan', { id: 'p-shan-def' })]; // 1 闪
  game.enemy.hand = [c('sha', { id: 'e-s1' }), c('sha', { id: 'e-s2' })]; // 2 sha
  // incoming = 2 - 1 = 1 dmg × 25 = 25 penalty
  const base = Engine.aiEvaluateState(game, 'player');
  const withThreat = Engine.aiEvaluateStateWithThreat(game, 'player');
  assert.equal(base - withThreat, 25, '威胁 penalty = 25 (1 sha 被闪抵消)');
});

test('v8 PR-D4: aiEvaluateStateWithThreat — 我闪 >= 对方杀, 0 penalty', () => {
  const game = buildGame('liubei', 'sunquan');
  game.player.hand = [c('shan', { id: 'p-h1' }), c('shan', { id: 'p-h2' }), c('shan', { id: 'p-h3' })];
  game.enemy.hand = [c('sha', { id: 'e-s1' })];
  const base = Engine.aiEvaluateState(game, 'player');
  const withThreat = Engine.aiEvaluateStateWithThreat(game, 'player');
  assert.equal(withThreat, base, '3 闪 vs 1 杀 → 0 incoming, 无 penalty');
});

test('v8 PR-D4: aiEvaluateStateWithThreat — 对方装武圣红牌当杀 也计入威胁', () => {
  const game = buildGame('liubei', 'guanyu'); // 对手 guanyu 武圣
  game.player.hand = []; // 0 闪
  game.enemy.hand = [
    c('tao', { id: 'e-tao-r', suit: 'heart', color: 'red' }),     // 红色非杀 → 武圣
    c('wuzhong', { id: 'e-wz-r', suit: 'heart', color: 'red' })   // 红色非杀 → 武圣
  ];
  const base = Engine.aiEvaluateState(game, 'player');
  const withThreat = Engine.aiEvaluateStateWithThreat(game, 'player');
  // 2 红色非杀 → 2 sha 估算; 我 0 闪 → 2 incoming × 25 = 50 penalty
  assert.equal(base - withThreat, 50, '武圣 红色估算计入威胁 penalty');
});

test('v8 PR-D4: aiEvaluateStateWithThreat — gameover 跳过 threat 计算', () => {
  const game = buildGame('liubei', 'sunquan');
  game.phase = 'gameover';
  game.winner = 'player';
  // 即使 enemy 持杀, gameover 时威胁无意义
  game.enemy.hand = [c('sha', { id: 'irrelevant' })];
  game.player.hand = [];
  const score = Engine.aiEvaluateStateWithThreat(game, 'player');
  assert.equal(score, 100000, 'gameover 时跳过 threat, 返回 baseline');
});

// ───── aiScoreCardWithLookahead 集成 threat-aware ────────────────────

test('v8 PR-D4: lookahead — 过河拆敌人武器 提高分 (减少未来威胁)', () => {
  const game = buildGame('liubei', 'sunquan');
  game.player.skillPreferences.guohe = 'auto';
  // enemy 装武器 + 持多张 sha; player 无防御
  game.enemy.equipment.weapon = c('cixiong', { id: 'e-weapon' });
  game.enemy.hand = [c('sha', { id: 'e-s1' }), c('sha', { id: 'e-s2' })];
  game.player.hand = [c('guohe', { id: 'p-gh' })];

  // 过河 sim: 拆掉 enemy 武器. 武器拆掉不直接减 sha 数, 但减装备件数 + 减
  // 攻击范围. threat 主要看 sha 数 + 闪; weapon 不直接影响 estimateShaCount.
  // 主要 delta 来自: equip 件数差 +8.
  // 验证 sim 至少有正 delta.
  const score = Engine.aiScoreCardWithLookahead(game, 'player', game.player.hand[0], 'normal');
  // guohe heuristic: opp hand(2) + equip(1) = 3 → 70 分
  // delta: pre baseline + threat vs post
  // 关键: score > heuristic 表示 sim 成功 + 有正 delta
  assert.ok(score >= 70, 'sim 应至少不减分 (拆装备 +8, 但威胁不变)');
});

test('v8 PR-D4: lookahead — 高威胁场景 AI 偏好防御', () => {
  // 对手有 2 杀, player 没闪 → 我方下回合预计扛 2 dmg
  // player 手里有 sha (heuristic 高) 和 shan (heuristic 0)
  // 在 lookahead 下, 闪虽然 heuristic 0, 但保留闪降低未来威胁
  // 注: 这里测的是出牌选择 — 出 sha 会用掉, 出 shan (闪) 是 non-play
  // 实际 AI 不会主动出闪 (闪只能响应). 改测: 用 shunshou 拆对方 sha
  const game = buildGame('liubei', 'sunquan');
  game.player.skillPreferences.shunshou = 'auto';
  game.enemy.hand = [c('sha', { id: 'e-s1' }), c('sha', { id: 'e-s2' })];
  game.player.hand = [
    c('shunshou', { id: 'p-ss' }),
    c('nanman', { id: 'p-nm' })  // 南蛮 vs 对方 2 sha → 对方有 sha 响应 → heuristic 30
  ];
  // shunshou heuristic (enemy hand > 0) = 65
  // 南蛮 heuristic = 30 (对方有 sha 响应)
  // 拆对方一张 sha → 减一点未来威胁 + reveal info; sim 后 enemy hand = 1, threat 减小
  const ssScore = Engine.aiScoreCardWithLookahead(game, 'player', game.player.hand[0], 'normal');
  const nmScore = Engine.aiScoreCardWithLookahead(game, 'player', game.player.hand[1], 'normal');
  assert.ok(ssScore > nmScore, 'shunshou (拆 sha 降威胁) 应高于 南蛮 (低 heuristic + 对方响应)');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
