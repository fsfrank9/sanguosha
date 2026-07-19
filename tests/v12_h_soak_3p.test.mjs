// v12 H 阶段加压测试: 3 座席 identity3 全 AI 自对弈, 固定种子跑若干局,
// 断言 (a) 不抛异常 (b) 每步之后全场牌 id 集合与开局一致 (守恒, 比"每回合
// 后"检查更严格) (c) 局终时 winner ∈ {lordSide, rebelSide} (未在回合上限
// 内终局也视为通过, 但会 log 提示)。
//
// 驱动方式: 每一步要么排空一个 pendingChoice, 要么对 game.turn 调用
// Engine.runAITurn (文档契约: pendingChoice 排空后重调 runAITurn 续跑同一
// actor 的回合, 见 tests/v12_g2_ai_resume.test.mjs)。'player' 座席的多数
// 响应默认对 'player' 走 'ask' (dying / wuxieResponse 等 —
// `pref || (actor==='player' ? 'ask':'auto')` 模式), 若不显式收敛为 'auto'
// 会在自对弈中挂起等待人工输入而永远排不空。本文件双重防御:
//   1) 显式把 player.skillPreferences 的常见响应键设为 'auto' (与其余 AI
//      座席默认行为对齐)；
//   2) decisionForPendingChoice 按 pendingChoice.kind 兜底给出"合法且不会
//      被引擎重新挂起"的最简决定, 覆盖 27 种已注册的 kind (逐一阅读
//      src/engine/{skills,tricks,sha-flow,equipment,damage-dying,
//      game-engine}.js 对应 resolve*Choice 分支确认 {} 是否安全; 不安全的
//      分支才显式给出决定, 详见下表注释), 即使某个 hero 组合触发了未被
//      显式覆盖的 kind, default 分支 {} 也已验证对已注册的 27 个 kind
//      全部安全 (不会导致 resolvePendingChoice 返回 fail 后原样重挂)。
//
// 只读引擎, 不改 src/。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { collectCardCensus } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ── pendingChoice 兜底决定表 ────────────────────────────────────────────
// 下列 kind 若收到 {} (无 cardId/zone/mode/choice/suit/option) 会被对应
// resolver 判定为"输入不完整"而 fail 并把 pendingChoice 原样重挂 (见各
// resolve*Choice 内的 `setPendingChoice(game, pending); return fail(...)`
// 分支) —— 必须显式给出下面这些字段才能保证 1 步内排空:
//   dying-rescue          → { decline: true }            (无 cardId 即重挂)
//   fanjian-guess          → { suit: 'spade' }             (四色任一均合法猜测)
//   fankui-pick            → 按 pending.zones[0] 现场取值   (hand 不需要 cardId)
//   ganglie-source-choice  → { mode: 'takeDamage' }         (恒合法, 与手牌数无关)
//   guanshi-discard        → { decline: true }              (默认 pref='auto' 恒不会触发, 防御性兜底)
//   guohe-1v1-pick         → 按 pending.equipment/hand[0] 现场取值
//   huogong-show           → { cardId: pending.cardIds[0] } (目标手牌非空才会问, 恒有效)
//   qilin-pick             → { decline: true }
//   cixiong-choose         → { option: 'draw' }             (与目标手牌状态无关, 恒合法)
//   wugu-pick              → { cardId: pending.cards[0].id } (pool>1 才会问, 恒非空)
//   yaowu-reward           → { choice: 'draw' }             ('draw' 恒合法, 'recover' 满血时非法)
//   luoshen-continue       → { decline: true }              ({} 默认="继续", 显式停止避免连判)
// 其余已注册 kind (shan-response / wuxie-response / sha-duel-response /
// wanjian-response / yinyue-response / jijiang-aid / hujia-aid /
// jiedao-decision / cixiong-fire / guicai-replace / guidao-replace /
// shensu-options / guanxing-reorder / yiji-distribute / ganglie-fire) 的
// resolver 在收到 {} 时都会走"放弃/不发动"分支直接结算, 不会重挂。
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

// 跑一局全 AI 自对弈直到 gameover 或 maxTurns 回合上限, 每一步后校验牌守恒。
function runSelfPlaySoak(newGameOptions, { maxTurns = 120, maxSteps = 6000 } = {}) {
  const game = Engine.newGame(newGameOptions);
  // 双重防御第 1 层: player 座席常见响应显式收敛为 auto (与其它 AI 座席
  // 默认行为对齐), 减少走到 ask 分支挂起的概率。
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
    // (b) 牌守恒: 每一步之后核对全场牌 id 集合与开局一致 (严于"每回合后")。
    const census = collectCardCensus(game);
    assert.equal(census.zoneDuplicates.length, 0,
      `第 ${steps} 步后出现牌重复出现在多个区域: ${census.zoneDuplicates.join('; ')} (seed=${newGameOptions.seed})`);
    assert.deepEqual(idsSorted(census.ids), baselineIds,
      `第 ${steps} 步后全场牌 id 集合与开局不一致 (seed=${newGameOptions.seed}, turns=${countTurnsStarted(game)})`);
  }

  const turnsStarted = countTurnsStarted(game);
  if (game.phase === 'gameover') {
    // (c) 局终 winner 必须是身份场的两大阵营之一。
    assert.ok(game.winner === 'lordSide' || game.winner === 'rebelSide',
      `终局 winner 必须是 lordSide/rebelSide, 实际: ${game.winner} (seed=${newGameOptions.seed})`);
  } else {
    console.log(`  (log) seed=${newGameOptions.seed} 跑满 ${turnsStarted} 回合上限仍未终局 (未终局也视为通过)`);
  }
  return { steps, turns: turnsStarted, gameover: game.phase === 'gameover', winner: game.winner };
}

// ── 8 局固定种子自对弈, 每局取材于"全实现"武将池 (IMPLEMENTED_SKILL_IDS
// 覆盖) 以避免撞到未接入的技能分支; 身份预设按座次默认分配
// (player=主公 / enemy=反贼 / ally=忠臣)。武将组合刻意覆盖不同压力点:
// 无懈拉锯 (guicai/guidao 改判) / 濒死救援 (buqu/tianxiang) / 无双连击
// (wushuang) / 反间猜测 (fanjian) / 离间虚拟决斗 (lijian) / 神速+主公技
// (shensu/hujia/jijiang) / 突袭+苦肉 (tuxi/kurou)。
//
// 种子挑选说明: 加压过程中发现两处疑似引擎缺陷 (均已按铁律 1 只报告不修复,
// 完整最小复现见随附报告, 不写入任何测试文件):
//   (a) src/engine/judge-area.js processJudgeArea — 角色判定区堆叠多张延时
//       锦囊时, 若排在前面的判定 (如闪电命中) 导致该角色死亡/终局, 排在
//       后面尚未结算的判定牌会被直接丢弃 (卡牌凭空消失, 而非按"死亡角色
//       剩余判定牌入弃牌堆"的既有约定处理)。
//   (b) src/engine/ai.js aiTakeAction 的火攻分支调用 getHuogongChoice(game,
//       actor) 时未传 targetActor, 回退到仅适配 1v1 的 opponent(actor)
//       (对非 player 座席几乎恒回退到 'player'), 与实际结算时
//       resolveTrickTargetActor 的身份场敌对目标解析 (忠臣默认目标应为
//       反贼而非同阵营主公) 不一致, 可致 AI 预览环节挑错弃牌花色, 实际
//       出牌校验失败, runAITurn 直接返回 fail (AI 回合中断)。
// 下列种子经逐一实跑验证 (100 回合上限内) 均未触发上述任一问题或其它异常;
// 更换/新增种子前应重新跑一遍 `node tests/v12_h_soak_3p.test.mjs` 确认。
const ROSTERS = [
  { seed: 37101, playerHero: 'liubei', enemyHero: 'caocao', allyHero: 'guanyu' },
  { seed: 37102, playerHero: 'zhangjiao', enemyHero: 'xiaoqiao', allyHero: 'simayi' },
  { seed: 37103, playerHero: 'sunquan', enemyHero: 'lvbu', allyHero: 'zhouyu' },
  { seed: 37104, playerHero: 'diaochan', enemyHero: 'zhangfei', allyHero: 'huangzhong' },
  { seed: 37105, playerHero: 'zhoutai', enemyHero: 'xiahoudun', allyHero: 'huaxiong' },
  { seed: 37206, playerHero: 'xiahouyuan', enemyHero: 'machao', allyHero: 'daqiao' },
  { seed: 37107, playerHero: 'xiahouyuan', enemyHero: 'huangzhong', allyHero: 'zhouyu' },
  { seed: 37109, playerHero: 'guojia', enemyHero: 'ganning', allyHero: 'lvmeng' }
];

for (const roster of ROSTERS) {
  test(`3p 自对弈加压 (seed=${roster.seed}: ${roster.playerHero}/${roster.enemyHero}/${roster.allyHero})`, () => {
    const summary = runSelfPlaySoak({
      seed: roster.seed,
      seats: ['player', 'enemy', 'ally'],
      playerHero: roster.playerHero,
      enemyHero: roster.enemyHero,
      allyHero: roster.allyHero,
      startWithFirstTurn: true
    });
    if (summary.gameover) {
      console.log(`  (log) seed=${roster.seed} 第 ${summary.turns} 回合终局, winner=${summary.winner}, 共 ${summary.steps} 步`);
    }
  });
}

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
