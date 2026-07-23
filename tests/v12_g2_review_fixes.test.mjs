// v12 G2 复核修复回归 — 独立规则合规复核发现的 4 处严重缺陷:
//   1. 神速: 多选项部分成功后因非法输入重挂, 重试重放已成功选项 (重复无距离杀)
//      → 修复为"先全量校验、后逐一应用", 应用阶段无可失败路径。
//   2. 天香: 转移致命且濒死暂停救援时, "然后其摸X张牌"回调因 hp<=0 被跳过
//      且永不重触发 → 挂 pauseState.deferredAfterDying, 濒死结束后统一冲刷。
//   3. 红颜×鬼才/鬼道: 接受改判分支 (a) 原判定牌不经 resolveJudgementCard
//      离场, 视图未还原 → 物理牌花色永久损坏; (b) 替换牌不经 judge(),
//      红颜对其失效 → 双向修复 (还原原牌 + 补施视图)。
//   4. 红颜×银月枪: consumeWuxie 姊妹分支漏改 effectiveCardColor →
//      小乔黑桃无懈仍触发银月枪。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function buildGame(opts) {
  opts = opts || {};
  const game = Engine.newGame({
    seed: opts.seed || 20260712,
    playerHero: opts.playerHero || 'liubei',
    enemyHero: opts.enemyHero || 'liubei'
  });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].flags = {};
    game[actor].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[actor].hp = game[actor].maxHp;
    game[actor].skillPreferences = {};
    game[actor].turnedOver = false;
    game[actor].chuang = [];
  }
  game.turn = 'player';
  game.phase = 'play';
  return game;
}

function stockDeck(game, n) {
  for (let i = 0; i < n; i += 1) game.deck.push(c('sha', { id: `deck-${i}`, suit: 'diamond' }));
}

// ───── 修复 1: 神速部分失败不再重放已成功选项 ─────

test('神速: {options:[1,2]} 带非法 equipCardId → 整包拒绝重挂, 选项一未被执行', () => {
  const game = buildGame({ playerHero: 'xiahouyuan' });
  stockDeck(game, 12);
  game.player.hand = [c('zhuge', { id: 'eq-x' })];
  game.enemy.hand = [];
  const enemyHpBefore = game.enemy.hp;
  Engine.startTurn(game, 'player');
  assert.equal(game.pendingChoice.kind, 'shensu-options');
  const bad = assertCardConservation(game, () =>
    Engine.resolvePendingChoice(game, { options: [1, 2], equipCardId: 'does-not-exist' }));
  assert.notEqual(bad.ok, true, '非法装备 id → 整包失败');
  assert.equal(game.enemy.hp, enemyHpBefore, '选项一的虚拟杀不得先行执行');
  assert.notEqual(game.player.flags.skipDraw, true, '选项一的跳阶段标记不得先行落地');
  assert.ok(game.pendingChoice && game.pendingChoice.kind === 'shensu-options', '决策重挂可重试');
  const retry = assertCardConservation(game, () =>
    Engine.resolvePendingChoice(game, { options: [1, 2], equipCardId: 'eq-x' }));
  assert.equal(retry.ok, true, retry.message);
  assert.equal(game.enemy.hp, enemyHpBefore - 2, '重试成功后恰好两张虚拟杀 (选项一+二), 无重放');
});

test('神速: 非法 options 值 → 拒绝并重挂', () => {
  const game = buildGame({ playerHero: 'xiahouyuan' });
  stockDeck(game, 8);
  Engine.startTurn(game, 'player');
  const bad = Engine.resolvePendingChoice(game, { options: [3] });
  assert.notEqual(bad.ok, true);
  assert.equal(game.pendingChoice.kind, 'shensu-options');
  Engine.resolvePendingChoice(game, { options: [] });
});

// ───── 修复 2: 天香致命转移 → 濒死救援结束后补牌 ─────

test('天香: 转移致命 → 对手救回后仍按已损体力补牌 (deferredAfterDying)', () => {
  const game = buildGame({ playerHero: 'xiaoqiao', enemyHero: 'liubei' });
  stockDeck(game, 10);
  game.turn = 'enemy';
  game.phase = 'play';
  game.player.hand = [c('sha', { id: 'ht-cost', suit: 'heart', rank: '3' })];
  // 对手 1 血, 酒+杀 打出 2 点伤害 → 天香转移回对手自身 → hp=-1 濒死
  // → 两张桃自救 → 补牌回调应在救援结束后冲刷。
  game.enemy.hp = 1;
  game.enemy.hand = [c('jiu', { id: 'e-jiu' }), c('sha', { id: 'e-sha' }),
    c('tao', { id: 'tao-1' }), c('tao', { id: 'tao-2' }), c('sha', { id: 'e-keep' })];
  game.enemy.skillPreferences.dying = 'auto';
  const handBefore = game.enemy.hand.length - 2; // 酒+杀 打出后基准
  assertCardConservation(game, () => {
    Engine.playCard(game, 'enemy', 'e-jiu');
    Engine.playCard(game, 'enemy', 'e-sha');
  });
  assert.equal(game.phase !== 'gameover', true, '对手自救成功, 游戏未结束');
  assert.equal(game.player.hp, game.player.maxHp, '小乔未掉血 (伤害已转移)');
  assert.ok(game.enemy.hp >= 1, '对手救回至 1 血以上');
  const lost = game.enemy.maxHp - game.enemy.hp;
  const drewLog = game.log.some((l) => l.includes('因【天香】摸'));
  assert.ok(drewLog, '濒死结束后补牌回调被冲刷执行 (log 含 因【天香】摸)');
  // 手牌变化 = -2桃(自救) + lost(补牌)
  assert.equal(game.enemy.hand.length, handBefore - 2 + lost, '补牌数 = 救援后的已损体力');
});

// ───── 修复 3: 红颜 × 鬼才/鬼道 接受改判的双向视图 ─────

test('红颜×鬼道: 接受改判 → 原黑桃判定牌花色还原后被张角获得 (无永久损坏)', () => {
  const game = buildGame({ playerHero: 'xiaoqiao', enemyHero: 'zhangjiao' });
  stockDeck(game, 6);
  // 小乔判定乐不思蜀, 原判定牌黑桃6; 张角(AI) 手有黑牌自动改判
  game.deck.push(c('sha', { id: 'orig-spade', suit: 'spade', rank: '6' }));
  game.player.judgeArea = [c('lebusishu', { id: 'le-1' })];
  game.enemy.hand = [c('sha', { id: 'zj-black', suit: 'club', rank: '9' })];
  assertCardConservation(game, () => Engine.startTurn(game, 'player'));
  // 张角三修: 鬼道 "替换" → 张角获得原判定牌 (进手牌); 红颜视图仍须还原。
  const orig = game.enemy.hand.find((card) => card.id === 'orig-spade');
  assert.ok(orig, '原判定牌被张角获得 (进手牌)');
  assert.ok(!game.discard.some((card) => card.id === 'orig-spade'), '原判定牌不进弃牌堆');
  assert.equal(orig.suit, 'spade', '张角获得的原判定牌花色已还原为黑桃');
  assert.equal(orig.hongyanOriginalSuit, undefined, '无视图残留字段');
});

test('红颜×鬼道: 张角改判打出的黑桃替换牌 → 对小乔判定同样视为红桃', () => {
  const game = buildGame({ playerHero: 'xiaoqiao', enemyHero: 'zhangjiao' });
  stockDeck(game, 6);
  // 原判定红桃 (乐不思蜀本会失效=跳过出牌不触发... 反转: 原判红桃=解,
  // 张角改判为黑桃想让乐生效 — 但小乔红颜把黑桃替换牌也视为红桃 → 仍解)
  game.deck.push(c('sha', { id: 'orig-heart', suit: 'heart', rank: '6' }));
  game.player.judgeArea = [c('lebusishu', { id: 'le-2' })];
  game.enemy.hand = [c('sha', { id: 'zj-spade', suit: 'spade', rank: '9' })];
  assertCardConservation(game, () => Engine.startTurn(game, 'player'));
  assert.equal(game.player.flags.skipPlay, false, '黑桃替换牌被红颜视为红桃 → 乐不思蜀判定仍解 (不跳过出牌)');
  const repl = game.discard.find((card) => card.id === 'zj-spade');
  assert.ok(repl, '替换牌结算后入弃牌堆');
  assert.equal(repl.suit, 'spade', '替换牌离场时花色同样还原');
});

// ───── 修复 4: 红颜 × 银月枪 (consumeWuxie 分支) ─────

test('红颜×银月枪: 小乔回合外打出黑桃无懈 → 不触发银月枪', () => {
  const game = buildGame({ playerHero: 'zhangfei', enemyHero: 'xiaoqiao' });
  stockDeck(game, 6);
  game.player.equipment.weapon = c('yinyue', { id: 'yy-1' });
  // 玩家出锦囊 (顺手牵羊), 小乔用黑桃无懈抵消 — 回合外打出黑色 → 旧版误触发银月
  game.player.hand = [c('shunshou', { id: 'ss-1' })];
  game.enemy.hand = [c('wuxie', { id: 'wx-spade', suit: 'spade', rank: '5' }), c('sha', { id: 'grab-me' })];
  game.enemy.skillPreferences.wuxie = 'auto';
  const hpBefore = game.enemy.hp;
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'ss-1'));
  assert.ok(game.log.some((l) => l.includes('无懈可击')), '无懈已打出');
  assert.ok(!game.log.some((l) => l.includes('银月枪')), '红颜黑桃视为红桃 → 银月枪不触发');
  assert.equal(game.enemy.hp, hpBefore, '小乔未因银月枪掉血');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
