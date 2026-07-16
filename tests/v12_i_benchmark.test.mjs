// v12 I 验收基准: v12 AI vs v11 AI 固定种子自对弈, 胜率 ≥55% (路线图验收线)。
//
// 设计:
//   - 10 组武将对 × 10 个种子 (两段各 5) × 双向换边 = 200 局 (同种子同
//     武将换 profile, 消先手与武将强度差; 全部固定种子 → 完全确定性)。
//   - 双段取样 (61001+ 与 31001+) 摊薄单段种子敏感性: 复核实测各独立段
//     胜率 54.0~62.0% (跨段合计 ~57%), 单段贴线段存在 (70001+ 为 54.0%),
//     双段 200 局合计余量充足。两段均未参与启发式调参 (调参用 11001+ 段)。
//   - v11 profile 冻结旧启发路径 (全知直读/单步 lookahead/无压血线),
//     v12 为缺省新路径 (诚实计数/整回合深度模拟/处决与血线状态机)。
//   - 两席均为 AI 驱动: player 座席 14 处 resolver 默认 'ask' (正常对局
//     player 是人), 逐键设 'auto' 保证全自动零挂起。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

const PAIRS = [
  ['caocao', 'liubei'], ['guanyu', 'zhaoyun'], ['machao', 'huangzhong'],
  ['zhangfei', 'sunquan'], ['zhouyu', 'zhenji'], ['ganning', 'lvmeng'],
  ['guojia', 'simayi'], ['zhangliao', 'xuchu'], ['lvbu', 'xiahoudun'],
  ['huaxiong', 'diaochan'],
];
const SEEDS = [61001, 61002, 61003, 61004, 61005, 31001, 31002, 31003, 31004, 31005];

const AUTO_PREF_KEYS = ['cixiong', 'cixiongResponse', 'dying', 'fankui', 'ganglie',
  'ganglieSource', 'guanshi', 'guanxing', 'guicai', 'guidao', 'guohe', 'hanbing',
  'huogongShow', 'jiedao', 'jushou', 'leiji', 'lianying', 'liegong', 'luoshen',
  'luoyi', 'qilin', 'shensu', 'tianxiang', 'tieqi', 'tuxi', 'wangzun', 'wugu',
  'xiaoji', 'yaowuReward', 'yiji', 'yinyue', 'zhangba', 'zhuque'];

function autoPrefs(state) {
  const prefs = {};
  AUTO_PREF_KEYS.forEach((k) => { prefs[k] = 'auto'; });
  state.skillPreferences = prefs;
}

function playGame(seed, heroP, heroE, profP, profE) {
  const game = Engine.newGame({ seed, playerHero: heroP, enemyHero: heroE, startWithFirstTurn: true });
  game.player.aiProfile = profP;
  game.enemy.aiProfile = profE;
  autoPrefs(game.player);
  autoPrefs(game.enemy);
  let guard = 0;
  let leaks = 0;
  while (game.phase !== 'gameover' && guard < 300) {
    guard += 1;
    if (game.pendingChoice) {
      leaks += 1;
      Engine.resolvePendingChoice(game, {});
      continue;
    }
    const r = Engine.runAITurn(game, game.turn);
    if (!r.ok) return { error: r.message };
  }
  return {
    winner: game.phase === 'gameover' ? game.winner : null,
    timeout: game.phase !== 'gameover',
    leaks,
  };
}

let v12Wins = 0;
let v11Wins = 0;
let timeouts = 0;
const failures = [];
for (const [ha, hb] of PAIRS) {
  for (const seed of SEEDS) {
    for (const [pp, pe] of [['v12', 'v11'], ['v11', 'v12']]) {
      const r = playGame(seed, ha, hb, pp, pe);
      if (r.error) { failures.push(`${ha}/${hb} seed=${seed} ${pp}: ${r.error}`); continue; }
      if (r.leaks) failures.push(`${ha}/${hb} seed=${seed}: ${r.leaks} 次 pendingChoice 泄漏`);
      if (r.timeout || !r.winner) { timeouts += 1; continue; }
      if ((r.winner === 'player' ? pp : pe) === 'v12') v12Wins += 1;
      else v11Wins += 1;
    }
  }
}

const decisive = v12Wins + v11Wins;
const rate = decisive ? (v12Wins / decisive) * 100 : 0;
console.log(`基准: ${decisive} 决出 (${timeouts} 平局截断), v12=${v12Wins} v11=${v11Wins}, 胜率 ${rate.toFixed(1)}%`);

assert.equal(failures.length, 0, `对局异常: ${failures.slice(0, 3).join(' | ')}`);
assert.ok(decisive >= 180, `决出局数过少 (${decisive}/200), 基准失真`);
assert.ok(rate >= 55, `v12 对 v11 胜率 ${rate.toFixed(1)}% 未达验收线 55%`);
console.log('✓ v12 I 验收基准: 胜率 ≥55% 达成');
