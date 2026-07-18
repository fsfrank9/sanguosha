// v13 M4: 暗身份自对弈 soak + 推断准确率量化门禁 (入 verify 门禁)。
//   (a) 暗置模式全 AI 自对弈红线 — 每步不抛异常/牌守恒/终局可达/终局全
//       翻明 (范式沿用 v13_k4_soak45, 驱动循环与兜底决定表同源);
//   (b) 推断准确率 — 每回合边界抽样: 对每个 (存活 viewer, 未翻明存活
//       seat) 取 perceivedSideOf 猜测, 非 null 记一次判读, 判对口径:
//       rebelSide↔反贼 / lordSide↔忠臣 (内奸不可被推断为内奸 — 判读
//       恒错, 保守计入分母)。
//   随机基线 (对未翻明身份多重集合均匀乱猜的期望命中率):
//       E = Σ(n_i/N)²  — 5 席暗置 {反2,忠1,内1}: 6/16 = 37.5%;
//                        4 席暗置 {反1,忠1,内1}: 3/9 ≈ 33.3%。
//   门禁: 各档位合并准确率须显著高于基线 (阈值按固定种子实测收口, 见
//   文末断言; 更换种子/评分权重后须重跑本文件重新确认)。
import assert from 'node:assert/strict';
import { Engine, StateRuntime } from './helpers/load-engine.mjs';
import { collectCardCensus } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// pendingChoice 兜底决定表 — 与 v13_k4_soak45 / v12_h_soak_3p 同源。
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

// 回合边界推断抽样 — 只对未翻明存活座席判读 (主公恒翻明不入样)。
function sampleInference(game, stats) {
  const alive = StateRuntime.aliveSeats(game);
  for (const viewer of alive) {
    for (const seat of alive) {
      if (seat === viewer) continue;
      if (StateRuntime.isRoleRevealed(game, seat)) continue;
      const guess = StateRuntime.perceivedSideOf(game, viewer, seat);
      stats.pairs += 1;
      if (guess === null) continue;
      assert.ok(guess === 'rebelSide' || guess === 'lordSide',
        `未翻明座席猜测只能是 rebelSide/lordSide, 实际: ${guess}`);
      stats.guesses += 1;
      const role = game.roles[seat];
      const correct = (guess === 'rebelSide' && role === '反贼')
        || (guess === 'lordSide' && role === '忠臣');
      if (correct) stats.correct += 1;
    }
  }
}

function runHiddenSoak(newGameOptions, stats, { maxTurns = 150, maxSteps = 9000, hidden = true } = {}) {
  const game = Engine.newGame(Object.assign({}, newGameOptions, { hiddenRoles: hidden }));
  assert.equal(game.hiddenRoles, hidden, '暗置开关生效');
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
  let sampledTurns = 0;
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
      `第 ${steps} 步后全场牌 id 集合与开局不一致 (seed=${newGameOptions.seed})`);
    // 回合边界抽样 (每个新回合一次, 终局后不采 — roleRevealed 已全翻明)。
    const turnsNow = countTurnsStarted(game);
    if (turnsNow > sampledTurns && game.phase !== 'gameover') {
      sampledTurns = turnsNow;
      sampleInference(game, stats);
    }
  }

  const turnsStarted = countTurnsStarted(game);
  if (game.phase === 'gameover') {
    assert.ok(game.winner === 'lordSide' || game.winner === 'rebelSide' || game.winner === 'renegade',
      `终局 winner 必须是 lordSide/rebelSide/renegade, 实际: ${game.winner} (seed=${newGameOptions.seed})`);
    for (const seat of game.seats) {
      assert.equal(game.roleRevealed[seat], true, `终局 ${seat} 全翻明 (seed=${newGameOptions.seed})`);
    }
  }
  return { steps, turns: turnsStarted, gameover: game.phase === 'gameover', winner: game.winner };
}

// 明置直读基线对照 (信息性, 无胜负门禁 — n 小, 胜率差只求"可测"):
// 同种子同阵容关掉暗置重跑, 与暗置局终局并排记录。红线 (守恒/零挂起)
// 仍全程断言; 明置局不入准确率样本 (isRoleRevealed 恒真, 抽样自跳过)。
function runOpenBaseline(newGameOptions) {
  const throwaway = { pairs: 0, guesses: 0, correct: 0 };
  return runHiddenSoak(newGameOptions, throwaway, { hidden: false });
}

// ── 固定种子阵容 (武将组合沿用 K4 验证池; 种子经逐一实跑验证在回合上限
// 内终局且全程守恒; 更换种子前应重跑本文件确认)。
const ROSTERS5 = [
  { seed: 48101, playerHero: 'liubei', enemyHero: 'caocao', allyHero: 'guanyu', ally2Hero: 'machao', ally3Hero: 'lvbu' },
  { seed: 48102, playerHero: 'sunquan', enemyHero: 'huaxiong', allyHero: 'daqiao', ally2Hero: 'xiahouyuan', ally3Hero: 'zhoutai' },
  { seed: 48103, playerHero: 'zhangjiao', enemyHero: 'xiaoqiao', allyHero: 'simayi', ally2Hero: 'zhangfei', ally3Hero: 'diaochan' },
  // 轮转身份 (玩家=忠臣, AI 主公) × 暗置 — 覆盖玩家非主公暗身份局。
  { seed: 48104, roles: { player: '忠臣', enemy: '反贼', ally: '内奸', ally2: '主公', ally3: '反贼' },
    playerHero: 'zhouyu', enemyHero: 'zhangfei', allyHero: 'lvbu', ally2Hero: 'sunquan', ally3Hero: 'huangzhong' }
];
const ROSTERS4 = [
  { seed: 48201, playerHero: 'liubei', enemyHero: 'caocao', allyHero: 'guanyu', ally2Hero: 'lvbu' },
  { seed: 48202, playerHero: 'guojia', enemyHero: 'ganning', allyHero: 'lvmeng', ally2Hero: 'zhaoyun' }
];

const stats5 = { pairs: 0, guesses: 0, correct: 0 };
const stats4 = { pairs: 0, guesses: 0, correct: 0 };
const outcomes = [];

for (const roster of ROSTERS5) {
  test(`M4 暗置 5p 自对弈 (seed=${roster.seed}${roster.roles ? ', 玩家=' + roster.roles.player : ''})`, () => {
    const summary = runHiddenSoak({
      seed: roster.seed,
      seats: ['player', 'enemy', 'ally', 'ally2', 'ally3'],
      roles: roster.roles,
      playerHero: roster.playerHero,
      enemyHero: roster.enemyHero,
      allyHero: roster.allyHero,
      ally2Hero: roster.ally2Hero,
      ally3Hero: roster.ally3Hero,
      startWithFirstTurn: true
    }, stats5);
    outcomes.push({ seed: roster.seed, ...summary });
    console.log(`  (log) seed=${roster.seed} ${summary.gameover ? `第 ${summary.turns} 回合终局, winner=${summary.winner}` : `${summary.turns} 回合上限未终局`}, 共 ${summary.steps} 步`);
  });
}

for (const roster of ROSTERS4) {
  test(`M4 暗置 4p 自对弈 (seed=${roster.seed})`, () => {
    const summary = runHiddenSoak({
      seed: roster.seed,
      seats: ['player', 'enemy', 'ally', 'ally2'],
      playerHero: roster.playerHero,
      enemyHero: roster.enemyHero,
      allyHero: roster.allyHero,
      ally2Hero: roster.ally2Hero,
      startWithFirstTurn: true
    }, stats4);
    outcomes.push({ seed: roster.seed, ...summary });
    console.log(`  (log) seed=${roster.seed} ${summary.gameover ? `第 ${summary.turns} 回合终局, winner=${summary.winner}` : `${summary.turns} 回合上限未终局`}, 共 ${summary.steps} 步`);
  });
}

test('M4 明置基线对照: 同种子明置重跑 — 胜率差可测 (信息性, 红线仍断言)', () => {
  const rows = [];
  for (const roster of [...ROSTERS5.map((r) => ({ ...r, seats5: true })), ...ROSTERS4]) {
    const seats = roster.seats5
      ? ['player', 'enemy', 'ally', 'ally2', 'ally3']
      : ['player', 'enemy', 'ally', 'ally2'];
    const summary = runOpenBaseline({
      seed: roster.seed,
      seats,
      roles: roster.roles,
      playerHero: roster.playerHero,
      enemyHero: roster.enemyHero,
      allyHero: roster.allyHero,
      ally2Hero: roster.ally2Hero,
      ally3Hero: roster.ally3Hero,
      startWithFirstTurn: true
    });
    const hiddenRun = outcomes.find((o) => o.seed === roster.seed);
    rows.push({ seed: roster.seed, open: summary, hidden: hiddenRun });
    console.log(`  (log) seed=${roster.seed} 明置=${summary.gameover ? summary.winner : '未终局'} vs 暗置=${hiddenRun && hiddenRun.gameover ? hiddenRun.winner : '未终局'}`);
  }
  const diffs = rows.filter((r) => r.hidden && r.open.winner !== r.hidden.winner).length;
  console.log(`  (log) 明置/暗置终局归属差异: ${diffs}/${rows.length} 局 (信息性记录, 不设门禁)`);
});

test('M4 终局可达: 全部暗置种子在回合上限内决出胜负', () => {
  const undecided = outcomes.filter((o) => !o.gameover);
  assert.equal(undecided.length, 0,
    `未终局种子: ${undecided.map((o) => o.seed).join(', ')} (更换种子并重跑验证)`);
});

test('M4 推断准确率门禁: 合并准确率显著高于随机基线', () => {
  const acc5 = stats5.guesses ? stats5.correct / stats5.guesses : 0;
  const acc4 = stats4.guesses ? stats4.correct / stats4.guesses : 0;
  console.log(`  (log) 5p: ${stats5.correct}/${stats5.guesses} 判对 (覆盖 ${stats5.guesses}/${stats5.pairs} 对) → ${(acc5 * 100).toFixed(1)}% vs 基线 37.5%`);
  console.log(`  (log) 4p: ${stats4.correct}/${stats4.guesses} 判对 (覆盖 ${stats4.guesses}/${stats4.pairs} 对) → ${(acc4 * 100).toFixed(1)}% vs 基线 33.3%`);
  assert.ok(stats5.guesses >= 50, `5p 判读样本过少 (${stats5.guesses}), 门禁失去意义`);
  assert.ok(stats4.guesses >= 20, `4p 判读样本过少 (${stats4.guesses}), 门禁失去意义`);
  // 固定种子确定性 — 阈值按实测收口 (基线 + 显著余量), 权重/种子变更后重校。
  assert.ok(acc5 >= 0.50, `5p 推断准确率 ${(acc5 * 100).toFixed(1)}% 应 ≥50% (随机基线 37.5%)`);
  assert.ok(acc4 >= 0.45, `4p 推断准确率 ${(acc4 * 100).toFixed(1)}% 应 ≥45% (随机基线 33.3%)`);
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
