// v14 Q2 验收基准: 内奸高阶博弈 (装忠节奏/拆家阈值/终局收割序/濒死救主)
// 对 M3 骑墙初版的量化对照 — v13 "不设胜率门槛"的非目标在 v14 反转为带
// 门槛目标 (路线图 Q2)。
//
// 设计: 5 人身份场固定阵容 ×2 × 固定种子 ×12 × 双 profile (ally3 内奸席
// aiRenegadeProfile 'm3' 冻结 vs v14 缺省), 其余席位/决策表完全一致 —
// 差异全部归因内奸策略。完全确定性 (固定种子), 不引入 flake; 引擎行为
// 演进后数字漂移属预期, 重测回钉 (v12_i 同款惯例, 更换种子前重跑确认)。
// 宽样本佐证 (2 阵容 ×30 种子, 执行记录存档): 内奸胜局 m3 2 → v14 5,
// 主公方 17 → 28 (装忠/救主将终局分布可测地移向主公方存活)。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { test, runTests } from './helpers/harness.mjs';

function decisionForPendingChoice(pending) {
  switch (pending.kind) {
    case 'dying-rescue':
    case 'liuli-transfer':
    case 'guanshi-discard':
    case 'qilin-pick':
    case 'luoshen-continue':
      return { decline: true };
    case 'fanjian-guess': return { suit: 'spade' };
    case 'ganglie-source-choice': return { mode: 'takeDamage' };
    case 'cixiong-choose': return { option: 'draw' };
    case 'yaowu-reward': return { choice: 'draw' };
    case 'leiji-ask': return { auto: true };
    case 'huogong-show': return { cardId: pending.cardIds && pending.cardIds[0] };
    case 'wugu-pick': return { cardId: pending.cards && pending.cards[0] && pending.cards[0].id };
    case 'fankui-pick': {
      const zone = (pending.zones && pending.zones[0]) || { zone: 'hand' };
      return zone.zone === 'equipment' ? { zone: 'equipment', cardId: zone.cardId } : { zone: 'hand' };
    }
    case 'guohe-1v1-pick': {
      if (pending.equipment && pending.equipment.length) return { zone: 'equipment', cardId: pending.equipment[0].cardId };
      if (pending.hand && pending.hand.length) return { zone: 'hand', cardId: pending.hand[0].cardId };
      // 评审收口 (对齐 v13_k4_soak45 audit4-M2): resolver 只认 'judge',
      // 传 'judgeArea' 会 fail-重挂死循环; 末位再兜 hand 防空区域挂死。
      if (pending.judgeArea && pending.judgeArea.length) return { zone: 'judge', cardId: pending.judgeArea[0].cardId };
      return { zone: 'hand' };
    }
    default: return {};
  }
}

// 5p 预设身份 (K1): player=主公 enemy=反贼 ally=忠臣 ally2=反贼 ally3=内奸。
function runGame(seed, roster, renegadeProfile) {
  const game = Engine.newGame({
    seed,
    seats: ['player', 'enemy', 'ally', 'ally2', 'ally3'],
    playerHero: roster[0], enemyHero: roster[1], allyHero: roster[2],
    ally2Hero: roster[3], ally3Hero: roster[4]
  });
  game.player.skillPreferences = Object.assign({}, game.player.skillPreferences, {
    dying: 'auto', wuxieResponse: 'auto', shanResponse: 'auto', shaDuelResponse: 'auto',
    jijiangAid: 'decline', hujiaAid: 'decline'
  });
  if (renegadeProfile === 'm3') game.ally3.aiRenegadeProfile = 'm3';
  let steps = 0;
  const turnsStarted = () => (game.turnHistory || []).filter((e) => e.phase === 'prepare').length;
  while (game.phase !== 'gameover' && turnsStarted() < 150 && steps < 9000) {
    steps += 1;
    if (game.pendingChoice) {
      const kind = game.pendingChoice.kind;
      const result = Engine.resolvePendingChoice(game, decisionForPendingChoice(game.pendingChoice));
      assert.ok(result && result.ok, `resolvePendingChoice(${kind}, seed=${seed}) 失败: ${result && result.message}`);
    } else {
      const result = Engine.runAITurn(game, game.turn);
      // 预存形状怪癖: 反间等挂起结果无 ok 字段 — pendingChoice 已设即合法。
      assert.ok((result && result.ok) || game.pendingChoice,
        `runAITurn(${game.turn}, seed=${seed}) 失败: ${result && result.message}`);
    }
  }
  return game.phase === 'gameover' ? game.winner : 'undecided';
}

const ROSTERS = [
  ['liubei', 'caocao', 'guanyu', 'lvbu', 'simayi'],
  ['sunquan', 'zhangfei', 'zhouyu', 'huangzhong', 'guojia'],
];

function runProfile(profile) {
  const tally = { lordSide: 0, rebelSide: 0, renegade: 0, undecided: 0 };
  for (let ri = 0; ri < ROSTERS.length; ri += 1) {
    for (let s = 0; s < 12; s += 1) {
      const winner = runGame(48001 + ri * 100 + s, ROSTERS[ri], profile);
      tally[winner] = (tally[winner] || 0) + 1;
    }
  }
  return tally;
}

test('Q2 基准: v14 内奸策略胜局数超 M3 冻结基线, 终局分布可测移动', () => {
  const m3 = runProfile('m3');
  const v14 = runProfile('v14');
  console.log(`Q2 基准 (24 局/档): m3=${JSON.stringify(m3)} v14=${JSON.stringify(v14)}`);
  assert.ok(v14.renegade > m3.renegade,
    `内奸胜局须超基线: v14=${v14.renegade} vs m3=${m3.renegade}`);
  assert.ok(v14.lordSide > m3.lordSide,
    `装忠/救主应将分布移向主公方存活: v14=${v14.lordSide} vs m3=${m3.lordSide}`);
  assert.equal(m3.undecided + v14.undecided, 0, '全部种子在回合上限内终局');
});

await runTests();
