// v15 W2: 全场牌张守恒 soak (多种子 × 3/4/5 席轮转 × 全 AI 自动对局)。
//
// 缘起: v14 P4 的 1200 种子守恒 fuzz 抓到过两条**预存**缺陷 (青囊座席二元
// 回退 / harness zone 名笔误), 但那是一次性的 scratch harness, 没有入库 ——
// 于是这条唯一能发现"某条罕见路径把牌弄丢/弄多了"的手段, 每次都要重写。
// 本文件把它固化: 每一步之后做全区域普查 (含 v15 V 新增的武将牌上置牌区
// "田"), 牌 ID 集合变化或同一牌重复占区立即失败。
//
// 分档: 入全档不入快档 (v14 O2 约定 — soak/基准一律入全档)。
// 种子规模按 SANGUOSHA_SOAK_SEEDS 环境变量可调, 缺省 150 (~23s);
// 发布前/审计批用 `SANGUOSHA_SOAK_SEEDS=1200 node --test tests/v15_w_conservation_soak.test.mjs`
// 跑满档 (~3min, 2026-08-06 第五轮审计实跑 1200 种子 / 65253 步零失败)。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { collectCardCensus } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

const SEEDS = Number(process.env.SANGUOSHA_SOAK_SEEDS || 150);
const MAX_TURNS = 60;

// 覆盖 SP 与火/林/山包, 再补标准包高交互面。
const HEROES = [
  'sp_guanyu', 'sp_yuanshu',
  'zhanghe', 'dengai', 'liushan', 'jiangwei', 'sunce', 'erzhang', 'caiwenji',
  'caopi', 'sunjian', 'lusu', 'menghuo', 'zhurong', 'jiaxu', 'dongzhuo',
  'xuhuang', 'pangde', 'pangtong', 'dianwei', 'xunyu', 'taishici', 'yuanshao',
  'yanliangwenchou', 'wolongzhugeliang',
  'caocao', 'zhouyu', 'huatuo', 'yuji', 'guanyu', 'zhaoyun', 'machao',
  'huangyueying', 'daqiao', 'ganning', 'lvmeng', 'sunshangxiang', 'huanggai',
  'simayi', 'zhangliao', 'xuchu', 'zhenji', 'lvbu', 'diaochan', 'zhangjiao',
  'zhoutai', 'liubei', 'sunquan', 'zhugeliang', 'xiaoqiao', 'weiyan', 'caoren',
];

function buildGame(seed) {
  const n = 3 + (seed % 3); // 3/4/5 席轮转
  const seats = ['player', 'enemy', 'ally', 'ally2', 'ally3'].slice(0, n);
  const roles = { [seats[0]]: '主公' };
  const rest = ['反贼', '忠臣', '反贼', '内奸'];
  seats.slice(1).forEach((seat, i) => { roles[seat] = rest[i % rest.length]; });
  const pick = (k) => HEROES[(seed * 7 + k * 13) % HEROES.length];
  const cfg = { seed, seats, roles, playerHero: pick(0), enemyHero: pick(1) };
  if (n >= 3) cfg.allyHero = pick(2);
  if (n >= 4) cfg.ally2Hero = pick(3);
  if (n >= 5) cfg.ally3Hero = pick(4);
  return Engine.newGame(cfg);
}

// 玩家席窗口一律用最保守的收窗决策: 先试放弃, 放弃不被接受 (必选型窗口)
// 再取第一个候选。目的是把对局推下去, 而不是模拟"好的玩法"。
//
// 少数窗口是**官方意义上的必选**且决策形状特殊, 通用兜底解不开 —— 逐个
// 列在这里。这不是给引擎开后门: 这些窗口本就没有"放弃"这条出路
//   雌雄双股剑 — "令其选择一项: 弃置一张手牌 / 令你摸一张牌" (二选一, 必选)
//   反间       — "令其猜测该牌花色" (必猜, 无弃权)
//   庸肆       — 必须选择 count 张手牌/装备，不能放弃或只传单个 cardId
// 而通用兜底只会传 { cardId / target / option:'heal' / choice:'hp' }。
const MANDATORY_DECISIONS = {
  'yongsi-discard': (p) => ({ cardIds: p.options.slice(0, p.count).map(option => option.cardId) }),
  'fanjian-guess': () => ({ suit: 'spade' }),
  'cixiong-choose': (p, game) => {
    const hand = (game[p.actor] && game[p.actor].hand) || [];
    return hand.length ? { option: 'discard', cardId: hand[0].id } : { option: 'draw' };
  },
};

function settlePending(game) {
  const before = game.pendingChoice;
  // AC-C26 has no decline route; respond through the real mandatory choice API.
  if (before.kind === 'god-choice' && before.godChoiceType === 'effect-discard') {
    Engine.resolvePendingChoice(game, { choiceId: before.choiceId,
      cardIds: before.cards.slice(0, before.cardMin).map(card => card.id) });
    return game.pendingChoice !== before;
  }
  const special = MANDATORY_DECISIONS[before.kind];
  if (special) {
    Engine.resolvePendingChoice(game, special(before, game));
    return game.pendingChoice !== before;
  }
  Engine.resolvePendingChoice(game, { decline: true, skip: true, use: false });
  if (game.pendingChoice !== before) return true;
  const p = game.pendingChoice;
  const opt = (p.options && p.options[0]) || (p.candidates && p.candidates[0]);
  if (!opt) return false;
  Engine.resolvePendingChoice(game, {
    cardId: opt.cardId, target: opt.seat, option: 'heal', choice: 'hp',
  });
  return game.pendingChoice !== before;
}

test(`W2 soak: ${SEEDS} 种子 × 3/4/5 席全 AI 对局, 每步全区域牌张守恒`, () => {
  const failures = [];
  let steps = 0;
  for (let seed = 1; seed <= SEEDS; seed += 1) {
    const game = buildGame(seed);
    // Z review: census returns ids/zoneEntries, not total/byZone. The former
    // undefined === undefined comparison never checked conservation. Compare
    // identity as well as duplicates: equal counts alone can hide replacement.
    const initial = collectCardCensus(game);
    assert.ok(initial.ids.size > 0, '开局牌普查不能为空');
    assert.deepEqual(initial.zoneDuplicates, [], '开局不能有重复占区');
    for (let turn = 0; turn < MAX_TURNS; turn += 1) {
      if (game.phase === 'gameover') break;
      try {
        if (game.pendingChoice) {
          if (!settlePending(game)) {
            failures.push({ seed, turn, why: '窗口收不掉: ' + game.pendingChoice.kind });
            break;
          }
        } else if (game.turn === 'player') {
          Engine.finishPlayPhase(game);
          Engine.advancePhase(game);
          Engine.advancePhase(game);
        } else {
          Engine.runAITurn(game, game.turn);
        }
      } catch (err) {
        failures.push({ seed, turn, why: '抛异常: ' + String(err && err.message).slice(0, 160) });
        break;
      }
      steps += 1;
      const census = collectCardCensus(game);
      const vanished = [...initial.ids].filter(id => !census.ids.has(id));
      const conjured = [...census.ids].filter(id => !initial.ids.has(id));
      if (vanished.length || conjured.length || census.zoneDuplicates.length) {
        failures.push({
          seed, turn, why: `牌张 ${initial.ids.size} → ${census.ids.size}`,
          vanished, conjured, duplicates: census.zoneDuplicates,
          zones: Object.fromEntries(census.zoneEntries),
        });
        break;
      }
    }
  }
  assert.deepEqual(failures.slice(0, 5), [],
    `守恒/推进失败 ${failures.length} 例 (共 ${steps} 步); 前 5 例见上`);
  assert.ok(steps > SEEDS * 10, `推进步数异常偏少 (${steps}) — soak 可能空转了`);
  console.log(`  (log) ${SEEDS} 种子 / ${steps} 步，实体牌 ID 集合与重复占区检查通过`);
});

runTests(import.meta.url);
