// v13 K4: 4/5 人身份场全 AI 自对弈固定种子加压基准 (入 verify 门禁) —
// 断言 (a) 每步不抛异常 (b) 每步之后全场牌 id 集合与开局一致 (守恒)
// (c) 局终 winner ∈ {lordSide, rebelSide, renegade} (d) 终局可达:
// 全部种子在回合上限内决出胜负 (确定性 seed, 逐一实跑验证挑选)。
//
// 范式沿用 tests/v12_h_soak_3p.test.mjs (驱动循环/兜底决定表/守恒断言)。
// 该文件注释中"只报告不修复"的两处 v12 疑似缺陷核实均已修复:
//   (a) 判定区叠放延时锦囊中途死亡/终局丢牌 → judge-area.js 亡者/终局
//       分支已把剩余在途牌入弃牌堆 (v12 H5);
//   (b) AI 火攻预览目标与结算目标不一致 → ai.js 已改 aiShaTargetSeat
//       预解析同一目标 (v12 H5)。
// 内奸 AI 现状 (K4 复核记录, v13 M3 已销账): isHostileSeat 对内奸全敌对
// 预留仍生效 (敌对判定层), 骑墙已在目标评分层实现 — aiPickHostileTarget
// 按感知阵营聚合两侧战力, +15 打压强势侧 (见 v13_m_hidden_roles 用例)。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { collectCardCensus } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// pendingChoice 兜底决定表 — 与 v12_h_soak_3p 同源 (kind 覆盖说明见彼处)。
function decisionForPendingChoice(pending) {
  switch (pending.kind) {
    case 'dying-rescue':
    case 'guanshi-discard':
    case 'qilin-pick':
    case 'luoshen-continue':
      return { decline: true };
    case 'fanjian-guess':
      return { suit: 'spade' };
    case 'ganglie-source-choice':
      return { mode: 'takeDamage' };
    case 'cixiong-choose':
      return { option: 'draw' };
    case 'yaowu-reward':
      return { choice: 'draw' };
    case 'leiji-ask':
      return { auto: true };
    case 'huogong-show':
      return { cardId: pending.cardIds && pending.cardIds[0] };
    case 'wugu-pick':
      return { cardId: pending.cards && pending.cards[0] && pending.cards[0].id };
    case 'fankui-pick': {
      const zone = (pending.zones && pending.zones[0]) || { zone: 'hand' };
      return zone.zone === 'equipment' ? { zone: 'equipment', cardId: zone.cardId } : { zone: 'hand' };
    }
    case 'guohe-1v1-pick': {
      if (pending.equipment && pending.equipment.length) return { zone: 'equipment', cardId: pending.equipment[0].cardId };
      if (pending.hand && pending.hand.length) return { zone: 'hand', cardId: pending.hand[0].cardId };
      // audit4-M2: identity3 界限突破版可拆判定区 — 目标可因判定区唯一
      // 有牌而合法, 无兜底会 fail-重挂死循环。
      if (pending.judgeArea && pending.judgeArea.length) return { zone: 'judge', cardId: pending.judgeArea[0].cardId };
      return { zone: 'hand' };
    }
    default:
      return {};
  }
}

function countTurnsStarted(game) {
  return (game.turnHistory || []).filter((entry) => entry.phase === 'prepare').length;
}

function idsSorted(set) {
  return Array.from(set).sort();
}

function runSelfPlaySoak(newGameOptions, { maxTurns = 150, maxSteps = 9000 } = {}) {
  const game = Engine.newGame(newGameOptions);
  game.player.skillPreferences = Object.assign({}, game.player.skillPreferences, {
    dying: 'auto',
    wuxieResponse: 'auto',
    shanResponse: 'auto',
    shaDuelResponse: 'auto',
    jijiangAid: 'decline',
    hujiaAid: 'decline'
  });

  const baseline = collectCardCensus(game);
  assert.equal(baseline.zoneDuplicates.length, 0, '开局不应有牌重复出现在多个区域');
  const baselineIds = idsSorted(baseline.ids);

  let steps = 0;
  while (game.phase !== 'gameover' && countTurnsStarted(game) < maxTurns) {
    steps += 1;
    if (steps > maxSteps) {
      throw new Error(`疑似死循环: 已执行 ${steps} 步仍未终局 (turns=${countTurnsStarted(game)}, seed=${newGameOptions.seed})`);
    }
    if (game.pendingChoice) {
      const kind = game.pendingChoice.kind;
      const decision = decisionForPendingChoice(game.pendingChoice);
      const result = Engine.resolvePendingChoice(game, decision);
      assert.ok(result && result.ok,
        `resolvePendingChoice(kind=${kind}, seed=${newGameOptions.seed}) 失败: ${result && result.message}`);
    } else {
      const actor = game.turn;
      const result = Engine.runAITurn(game, actor);
      assert.ok(result && result.ok,
        `runAITurn(actor=${actor}, seed=${newGameOptions.seed}) 失败: ${result && result.message}`);
    }
    const census = collectCardCensus(game);
    assert.equal(census.zoneDuplicates.length, 0,
      `第 ${steps} 步后出现牌重复出现在多个区域: ${census.zoneDuplicates.join('; ')} (seed=${newGameOptions.seed})`);
    assert.deepEqual(idsSorted(census.ids), baselineIds,
      `第 ${steps} 步后全场牌 id 集合与开局不一致 (seed=${newGameOptions.seed}, turns=${countTurnsStarted(game)})`);
  }

  const turnsStarted = countTurnsStarted(game);
  if (game.phase === 'gameover') {
    assert.ok(game.winner === 'lordSide' || game.winner === 'rebelSide' || game.winner === 'renegade',
      `终局 winner 必须是 lordSide/rebelSide/renegade, 实际: ${game.winner} (seed=${newGameOptions.seed})`);
  }
  return { steps, turns: turnsStarted, gameover: game.phase === 'gameover', winner: game.winner };
}

// ── 固定种子阵容: 4 席 ×4 + 5 席 ×4。武将取自全实现池 (与 3p soak 同源),
// 组合覆盖 改判/濒死/无双/反间/离间/主公技/突袭+苦肉 等压力点; 身份按
// K1/K3 座次预设 (player=主公/enemy=反贼/ally=忠臣/ally2=内奸或反贼/
// ally3=内奸)。种子经逐一实跑验证在回合上限内终局且全程守恒; 更换种子
// 前应重跑本文件确认。
const ROSTERS4 = [
  { seed: 47101, playerHero: 'liubei', enemyHero: 'caocao', allyHero: 'guanyu', ally2Hero: 'lvbu' },
  { seed: 47102, playerHero: 'sunquan', enemyHero: 'zhangfei', allyHero: 'zhouyu', ally2Hero: 'huangzhong' },
  { seed: 47103, playerHero: 'zhangjiao', enemyHero: 'xiahoudun', allyHero: 'simayi', ally2Hero: 'diaochan' },
  { seed: 47104, playerHero: 'guojia', enemyHero: 'ganning', allyHero: 'lvmeng', ally2Hero: 'zhaoyun' }
];
const ROSTERS5 = [
  { seed: 47201, playerHero: 'liubei', enemyHero: 'caocao', allyHero: 'guanyu', ally2Hero: 'machao', ally3Hero: 'lvbu' },
  { seed: 47202, playerHero: 'sunquan', enemyHero: 'huaxiong', allyHero: 'daqiao', ally2Hero: 'xiahouyuan', ally3Hero: 'zhoutai' },
  { seed: 47203, playerHero: 'zhangjiao', enemyHero: 'xiaoqiao', allyHero: 'simayi', ally2Hero: 'zhangfei', ally3Hero: 'diaochan' },
  { seed: 47204, playerHero: 'guojia', enemyHero: 'zhaoyun', allyHero: 'lvmeng', ally2Hero: 'ganning', ally3Hero: 'huangzhong' }
];

const outcomes = [];

for (const roster of ROSTERS4) {
  test(`4p 自对弈加压 (seed=${roster.seed}: ${roster.playerHero}/${roster.enemyHero}/${roster.allyHero}/${roster.ally2Hero})`, () => {
    const summary = runSelfPlaySoak({
      seed: roster.seed,
      seats: ['player', 'enemy', 'ally', 'ally2'],
      playerHero: roster.playerHero,
      enemyHero: roster.enemyHero,
      allyHero: roster.allyHero,
      ally2Hero: roster.ally2Hero,
      startWithFirstTurn: true
    });
    outcomes.push({ seed: roster.seed, ...summary });
    console.log(`  (log) seed=${roster.seed} ${summary.gameover ? `第 ${summary.turns} 回合终局, winner=${summary.winner}` : `${summary.turns} 回合上限未终局`}, 共 ${summary.steps} 步`);
  });
}

for (const roster of ROSTERS5) {
  test(`5p 自对弈加压 (seed=${roster.seed}: ${roster.playerHero}/${roster.enemyHero}/${roster.allyHero}/${roster.ally2Hero}/${roster.ally3Hero})`, () => {
    const summary = runSelfPlaySoak({
      seed: roster.seed,
      seats: ['player', 'enemy', 'ally', 'ally2', 'ally3'],
      playerHero: roster.playerHero,
      enemyHero: roster.enemyHero,
      allyHero: roster.allyHero,
      ally2Hero: roster.ally2Hero,
      ally3Hero: roster.ally3Hero,
      startWithFirstTurn: true
    });
    outcomes.push({ seed: roster.seed, ...summary });
    console.log(`  (log) seed=${roster.seed} ${summary.gameover ? `第 ${summary.turns} 回合终局, winner=${summary.winner}` : `${summary.turns} 回合上限未终局`}, 共 ${summary.steps} 步`);
  });
}

// ── v13 L: 可选身份轮转 roles 下的自对弈 (玩家席等价 AI) — 验证 AI 主公
// 先手 (firstActorFromRoles 全环扫描) + 玩家非主公身份全程/中途阵亡后
// 引擎续跑到终局。roles 为预设阵型内轮转 (构成不变)。
const ROSTERS_L = [
  { seed: 47301, seats: ['player', 'enemy', 'ally', 'ally2'],
    roles: { player: '反贼', enemy: '忠臣', ally: '内奸', ally2: '主公' },
    heroes: { playerHero: 'guanyu', enemyHero: 'lvmeng', allyHero: 'diaochan', ally2Hero: 'liubei' } },
  { seed: 47302, seats: ['player', 'enemy', 'ally', 'ally2', 'ally3'],
    roles: { player: '忠臣', enemy: '反贼', ally: '内奸', ally2: '主公', ally3: '反贼' },
    heroes: { playerHero: 'zhouyu', enemyHero: 'zhangfei', allyHero: 'lvbu', ally2Hero: 'sunquan', ally3Hero: 'huangzhong' } },
  { seed: 47303, seats: ['player', 'enemy', 'ally', 'ally2', 'ally3'],
    roles: { player: '内奸', enemy: '主公', ally: '反贼', ally2: '忠臣', ally3: '反贼' },
    heroes: { playerHero: 'simayi', enemyHero: 'caocao', allyHero: 'ganning', ally2Hero: 'guojia', ally3Hero: 'huaxiong' } }
];

for (const roster of ROSTERS_L) {
  test(`L 可选身份自对弈 (seed=${roster.seed}: 玩家=${roster.roles.player}, ${roster.seats.length} 席)`, () => {
    const summary = runSelfPlaySoak({
      seed: roster.seed,
      seats: roster.seats.slice(),
      roles: roster.roles,
      startWithFirstTurn: true,
      ...roster.heroes
    });
    outcomes.push({ seed: roster.seed, ...summary });
    console.log(`  (log) seed=${roster.seed} ${summary.gameover ? `第 ${summary.turns} 回合终局, winner=${summary.winner}` : `${summary.turns} 回合上限未终局`}, 共 ${summary.steps} 步`);
  });
}

// 终局可达门禁: 固定种子确定性 — 全部 11 局须在回合上限内决出胜负
// (弱于胜率门禁, 与路线图 K4 验收措辞一致: 零挂起/守恒/胜负可达)。
test('K4 终局可达: 全部固定种子在回合上限内决出胜负', () => {
  const undecided = outcomes.filter((o) => !o.gameover);
  assert.equal(undecided.length, 0,
    `未终局种子: ${undecided.map((o) => o.seed).join(', ')} (更换种子并重跑验证)`);
});

let failures = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`✗ ${name}`);
    console.error(error && error.stack ? error.stack : error);
  }
}
if (failures > 0) {
  console.error(`\n${failures}/${tests.length} 个测试失败。`);
  process.exit(1);
} else {
  console.log(`\n全部 ${tests.length} 个测试通过。`);
}
