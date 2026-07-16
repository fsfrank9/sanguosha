// v12 I 阶段行为测试: I1 两步 lookahead / I2 可见信息计数建模 / I3 多人目标
// 评估 + killPressure 状态机 + discardHold 弃牌保留值 + v11 profile 冻结。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }
function c(type, overrides = {}) { return Engine.makeTestCard(type, overrides); }

function build1v1(opts = {}) {
  const game = Engine.newGame({
    seed: opts.seed || 71001,
    playerHero: opts.playerHero || 'liubei',
    enemyHero: opts.enemyHero || 'caocao'
  });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const seat of ['player', 'enemy']) {
    game[seat].hand = [];
    game[seat].judgeArea = [];
    game[seat].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[seat].hp = game[seat].maxHp;
    game[seat].skillPreferences = {};
    game[seat].flags = {};
  }
  game.turn = 'player';
  game.phase = 'play';
  return game;
}

function build3p(opts = {}) {
  const game = Engine.newGame({
    seed: opts.seed || 72001,
    seats: ['player', 'enemy', 'ally'],
    playerHero: opts.playerHero || 'liubei',
    enemyHero: opts.enemyHero || 'caocao',
    allyHero: opts.allyHero || 'guanyu'
  });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const seat of game.seats) {
    game[seat].hand = [];
    game[seat].judgeArea = [];
    game[seat].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[seat].hp = game[seat].maxHp;
    game[seat].skillPreferences = {};
    game[seat].flags = {};
  }
  return game;
}

// ═════ I2: 可见信息计数建模 ═════

test('I2: aiUnknownCounts — 未知池 = 全场总量 − (弃牌堆 + 公开区 + 自己手牌)', () => {
  const game = build1v1({ seed: 71002 });
  // 全场恰好: 牌堆 2 杀 1 闪, 弃牌堆 1 闪, 我方手 1 桃, 对手手 1 杀 1 闪
  game.deck = [c('sha', { id: 'd1' }), c('sha', { id: 'd2' }), c('shan', { id: 'd3' })];
  game.discard = [c('shan', { id: 'x1' })];
  game.player.hand = [c('tao', { id: 'p1' })];
  game.enemy.hand = [c('sha', { id: 'e1' }), c('shan', { id: 'e2' })];
  const unknown = Engine.aiUnknownCounts(game, 'player');
  // 未知 (player 视角) = 牌堆 3 + 对手手 2 = 5 张; 其中杀 3 闪 2
  assert.equal(unknown.total, 5);
  assert.equal(unknown.sha, 3);
  assert.equal(unknown.shan, 2);
  assert.equal(unknown.tao, 0, '自己手里的桃可见, 不在未知池');
});

test('I2: 对手估计 = 手牌数 × 未知池占比; 自己 = 精确直读', () => {
  const game = build1v1({ seed: 71003 });
  game.deck = [c('sha', { id: 'd1' }), c('sha', { id: 'd2' }), c('shan', { id: 'd3' }), c('tao', { id: 'd4' })];
  game.player.hand = [c('shan', { id: 'p1' }), c('shan', { id: 'p2' })];
  game.enemy.hand = [c('sha', { id: 'e1' }), c('sha', { id: 'e2' })];
  // player 视角未知池 = 4 (deck) + 2 (enemy hand) = 6, 其中杀 4
  // 对手杀估计 = 2 × 4/6 ≈ 1.33 (诚实, 不读暗牌 — 实际对手确有 2 杀)
  const est = Engine.aiEstimateShaCountFor(game, 'player', 'enemy');
  assert.ok(est > 1.2 && est < 1.5, `对手杀估计应 ≈1.33, 实测 ${est}`);
  // 自己 = 精确
  assert.equal(Engine.aiEstimateShanCountFor(game, 'player', 'player'), 2);
});

test('I2: 响应空窗 — 响应失败公开证明凑不出该牌型, 估计归零, 新回合清除', () => {
  const game = build1v1({ seed: 71004, enemyHero: 'caocao' });
  for (let i = 0; i < 10; i += 1) game.deck.push(c('shan', { id: `dk-${i}`, suit: 'diamond' }));
  game.player.hand = [c('sha', { id: 'p-sha' })];
  game.enemy.hand = [c('tao', { id: 'e-tao' })]; // 无闪 → 响应失败
  Engine.playCard(game, 'player', 'p-sha', { target: 'enemy' });
  assert.ok(game.enemy.aiRevealed && game.enemy.aiRevealed.shan, '闪响应失败 → 空窗记账');
  assert.equal(Engine.aiEstimateShanCountFor(game, 'player', 'enemy'), 0, '空窗内闪估计为 0');
  // 对手新回合开始 (摸牌) → 空窗失效
  Engine.endTurn(game);
  assert.equal(game.enemy.aiRevealed, null, '新回合清除空窗');
});

test('I2: v11 profile 冻结 — 对手估计仍全知直读 (旧行为)', () => {
  const game = build1v1({ seed: 71005 });
  game.deck = [c('tao', { id: 'd1' }), c('tao', { id: 'd2' })];
  game.player.aiProfile = 'v11';
  game.enemy.hand = [c('shan', { id: 'e1' }), c('shan', { id: 'e2' })];
  assert.equal(Engine.aiFoeEstimate(game, 'player', 'enemy', 'shan'), 2, 'v11 直读对手 2 闪');
  game.player.aiProfile = undefined;
  const honest = Engine.aiFoeEstimate(game, 'player', 'enemy', 'shan');
  assert.ok(honest < 2, `v12 诚实估计 (${honest}) 不等于直读`);
});

// ═════ I1: 两步 lookahead (整回合深度模拟) ═════

test('I1: aiDeepTurnEval — 深度模拟不污染原局 (牌守恒 + 状态不变)', () => {
  const game = build1v1({ seed: 71006 });
  for (let i = 0; i < 20; i += 1) game.deck.push(c('shan', { id: `dk-${i}`, suit: 'diamond' }));
  game.player.hand = [c('sha', { id: 'p1' }), c('juedou', { id: 'p2' }), c('tao', { id: 'p3' })];
  game.enemy.hand = [c('shan', { id: 'e1' }), c('sha', { id: 'e2' })];
  const handBefore = game.player.hand.length;
  const hpBefore = game.enemy.hp;
  const sim = Engine.aiSimulateCardPlay(game, 'player', game.player.hand[0], 'normal');
  assert.ok(sim, '模拟成功');
  const value = Engine.aiDeepTurnEval(sim, 'player');
  assert.equal(typeof value, 'number');
  assert.equal(game.player.hand.length, handBefore, '原局手牌未动');
  assert.equal(game.enemy.hp, hpBefore, '原局血量未动');
  assert.equal(game.turn, 'player', '原局回合未动');
});

test('I1: 深度精化包在 aiChooseCard 内 — 决策全程牌守恒且选择合法', () => {
  const game = build1v1({ seed: 71007 });
  for (let i = 0; i < 20; i += 1) game.deck.push(c('shan', { id: `dk-${i}`, suit: 'diamond' }));
  game.player.hand = [c('sha', { id: 'p1' }), c('juedou', { id: 'p2' }), c('wuzhong', { id: 'p3' }), c('guohe', { id: 'p4' })];
  game.enemy.hand = [c('shan', { id: 'e1' }), c('shan', { id: 'e2' }), c('sha', { id: 'e3' })];
  const choice = assertCardConservation(game, () => Engine.aiChooseCard(game, 'player'));
  assert.ok(choice, '有选择');
  assert.ok(game.player.hand.some((x) => x.id === choice.card.id), '选中的是手牌');
});

test('I1: 模拟世界内嵌套决策短路 (aiSimulating → 纯启发, 不递归克隆)', () => {
  const game = build1v1({ seed: 71008 });
  game.player.hand = [c('sha', { id: 'p1' })];
  game.aiSimulating = true;
  // 短路路径: 直接返回启发分, 不做任何克隆模拟 (结果与纯启发一致)
  const withLookahead = Engine.aiScoreCardWithLookahead(game, 'player', game.player.hand[0], 'normal');
  const heuristicOnly = Engine.aiScoreCard(game, 'player', game.player.hand[0]);
  assert.equal(withLookahead, heuristicOnly, 'aiSimulating 世界内 lookahead 分 = 纯启发分');
  game.aiSimulating = undefined;
});

// ═════ I3: 敌意记账 + 目标评估 ═════

test('I3: aggressionLog — damage() 记账 谁伤了谁, aiHostilityToward 累计', () => {
  const game = build3p({ seed: 72002 });
  for (let i = 0; i < 8; i += 1) game.deck.push(c('shan', { id: `dk-${i}`, suit: 'diamond' }));
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.player.hand = [];
  Engine.playCard(game, 'enemy', 'e-sha', { target: 'player' });
  assert.ok(game.aggressionLog && game.aggressionLog.length >= 1, '伤害已记账');
  const entry = game.aggressionLog[game.aggressionLog.length - 1];
  assert.equal(entry.source, 'enemy');
  assert.equal(entry.target, 'player');
  assert.ok(Engine.aiHostilityToward(game, 'player', 'enemy') >= 1, '玩家视角对 enemy 敌意 ≥1');
  assert.equal(Engine.aiHostilityToward(game, 'enemy', 'player'), 0, '打人不算自己头上');
});

test('I3: 反贼 AI 多候选选主公 (胜负手); v11 沿用对手优先', () => {
  const game = build3p({ seed: 72003 });
  // enemy = 反贼; 候选 [player(主公), ally(忠臣)] — v12 应选主公
  game.player.hp = 4;
  game.ally.hp = 4;
  const picked = Engine.aiPickHostileTarget(game, 'enemy', ['ally', 'player']);
  assert.equal(picked, 'player', '反贼集火主公');
  game.enemy.aiProfile = 'v11';
  const legacy = Engine.aiPickHostileTarget(game, 'enemy', ['ally', 'player']);
  assert.equal(legacy, 'player', 'v11: opponent(enemy)=player 在候选中 → 沿用');
});

test('I3: 收割优先 — 同为敌对, 命悬一线者 (hp1 无桃余量) 优先', () => {
  const game = build3p({ seed: 72004, allyHero: 'caocao', enemyHero: 'guanyu' });
  // player 视角: 敌对候选构造为 enemy(hp4) 与 ally(hp1) — 直接改 roles 使
  // ally 也是反贼 (测试目标评分, 不走对局流程)
  game.roles = { player: '主公', enemy: '反贼', ally: '反贼' };
  game.enemy.hp = 4;
  game.ally.hp = 1;
  game.ally.hand = [];
  const picked = Engine.aiPickHostileTarget(game, 'player', ['enemy', 'ally']);
  assert.equal(picked, 'ally', '收割 hp1 空手的反贼 (击杀奖励摸三)');
});

test('I3: 1v1 单候选恒等旧行为 (目标选择零变化)', () => {
  const game = build1v1({ seed: 71009 });
  assert.equal(Engine.aiPickHostileTarget(game, 'player', ['enemy']), 'enemy');
  assert.equal(Engine.aiPrimaryFoe(game, 'player'), 'enemy');
});

// ═════ killPressure 状态机 + discardHold ═════

test('killPressure: 处决线 — 对手命悬且闪面稀薄时杀 150 分 (v11 为 85)', () => {
  const game = build1v1({ seed: 71010 });
  game.enemy.hp = 1;
  game.enemy.hand = []; // 空手 → 诚实估计闪 0
  game.player.hand = [c('sha', { id: 'p1' })];
  assert.equal(Engine.aiScoreCard(game, 'player', game.player.hand[0]), 150, 'v12 处决线');
  game.player.aiProfile = 'v11';
  assert.equal(Engine.aiScoreCard(game, 'player', game.player.hand[0]), 85, 'v11 旧分级');
});

test('killPressure: 血线危险区收敛 — 自己 hp2 对手血线安全时进攻牌 −30', () => {
  const game = build1v1({ seed: 71011 });
  game.player.hp = 2;
  game.enemy.hp = 4;
  game.enemy.hand = [c('tao', { id: 'e1' }), c('tao', { id: 'e2' }), c('tao', { id: 'e3' })];
  game.player.hand = [c('juedou', { id: 'p1' })];
  const v12Score = Engine.aiScoreCard(game, 'player', game.player.hand[0]);
  game.player.aiProfile = 'v11';
  const v11Score = Engine.aiScoreCard(game, 'player', game.player.hand[0]);
  game.player.aiProfile = undefined;
  // 危险区收敛真实效应为 -30 (复核实测 v12=10, v11=40); 断言留 15 分带宽
  // 容纳两 profile 对手估计法差异, 仍能测出收敛是否真实发生。
  assert.ok(v12Score <= v11Score - 15, `危险区收敛应显著压低进攻分 (v12=${v12Score}, v11=${v11Score})`);
});

test('killPressure: 轻伤留桃 (hp=maxHp-1 且 ≥3) — v12 25 分, v11 80 分', () => {
  const game = build1v1({ seed: 71012 });
  game.player.hp = 3; // maxHp 4
  const tao = c('tao', { id: 't1' });
  assert.equal(Engine.aiScoreCard(game, 'player', tao), 25, 'v12 留桃');
  game.player.aiProfile = 'v11';
  assert.equal(Engine.aiScoreCard(game, 'player', tao), 80, 'v11 旧梯度');
});

test('killPressure: 闪电自残轮盘 — v12 不主动挂 (-30), 红颜小乔例外 (48)', () => {
  const game = build1v1({ seed: 71013, playerHero: 'caocao' });
  const shandian = c('shandian', { id: 'sd1', suit: 'spade', color: 'black' });
  assert.equal(Engine.aiScoreCard(game, 'player', shandian), -30, 'v12 负分不出');
  game.player.aiProfile = 'v11';
  assert.equal(Engine.aiScoreCard(game, 'player', shandian), 48, 'v11 旧行为');
  const xq = build1v1({ seed: 71014, playerHero: 'xiaoqiao' });
  assert.equal(Engine.aiScoreCard(xq, 'player', shandian), 48, '红颜: 黑桃判定视为红桃, 闪电对自己必不中 → 照常威胁');
});

test('discardHold: 超限弃牌 v12 保闪 (弃 0 分杂牌); v11 先弃闪', () => {
  const game = build1v1({ seed: 71015 });
  game.turn = 'player';
  game.phase = 'discard';
  game.player.hp = 2; // 手牌上限 2
  // 手 4 张: 闪 / 闪 / 借刀(0 分) / 铁索(0 分) → 需弃 2
  game.player.hand = [
    c('shan', { id: 'h-shan1' }), c('shan', { id: 'h-shan2' }),
    c('jiedao', { id: 'h-jiedao' }), c('tiesuo', { id: 'h-tiesuo' })
  ];
  // aiDiscardCandidates 是运行时私有面 — 经 runAITurn 完整弃牌路径断言。
  game.phase = 'play';
  game.deck = [];
  const r = Engine.runAITurn(game, 'player');
  assert.ok(r.ok, r.message);
  assert.ok(game.player.hand.some((x) => x.type === 'shan'), 'v12 弃牌后手里仍有闪');
  // v11 对照
  const g2 = build1v1({ seed: 71016 });
  g2.turn = 'player';
  g2.phase = 'play';
  g2.deck = [];
  g2.player.aiProfile = 'v11';
  g2.player.hp = 2;
  g2.player.hand = [
    c('shan', { id: 'h-shan1' }), c('shan', { id: 'h-shan2' }),
    c('jiedao', { id: 'h-jiedao' }), c('tiesuo', { id: 'h-tiesuo' })
  ];
  const r2 = Engine.runAITurn(g2, 'player');
  assert.ok(r2.ok, r2.message);
  assert.ok(!g2.player.hand.some((x) => x.type === 'shan'), 'v11 旧行为: 闪 0 分先被弃光');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
