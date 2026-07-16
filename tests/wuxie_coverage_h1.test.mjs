import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

assert.ok(Engine, 'engine module loaded');

// H1: 无懈可击窗口覆盖 — 无中生有 / 南蛮入侵 / 万箭齐发 / 延时锦囊放置。
// 审计前这些牌没有无懈窗口, 直接结算。gltjk card__scroll.md: 无懈可击可在
// 一张锦囊「对一个目标生效前」抵消之。在 1v1 中 南蛮/万箭 只有 1 名目标 (对方),
// 故单个无懈窗口即与官方一致。

function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

// 干净的对局: 清空手牌/判定区/装备/牌堆, 双方满血, player 回合 play 阶段。
function buildGame(opts) {
  opts = opts || {};
  const game = Engine.newGame({ seed: 77, playerHero: opts.playerHero || 'liubei', enemyHero: opts.enemyHero || 'caocao' });
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
  return game;
}

// --- 无中生有 ---

test('H1 无中生有: 对方持【无懈】(auto) → 抵消, 不摸牌', () => {
  const game = buildGame();
  game.player.hand = [c('wuzhong', { id: 'wz' })];
  game.enemy.hand = [c('wuxie', { id: 'enemy-wuxie' })];
  const before = game.player.hand.length; // 出牌后会先移除 wuzhong
  const r = Engine.playCard(game, 'player', 'wz');
  assert.equal(r.ok, true);
  assert.equal(game.player.hand.length, 0, '被无懈 → 未摸到 2 张牌');
  assert.ok(game.discard.some((card) => card.id === 'enemy-wuxie'), '对方【无懈】已消耗');
  assert.ok(game.discard.some((card) => card.id === 'wz'), '【无中生有】进入弃牌堆');
});

test('H1 无中生有: 对方无【无懈】→ 正常摸 2 张', () => {
  const game = buildGame();
  game.player.hand = [c('wuzhong', { id: 'wz2' })];
  game.enemy.hand = [];
  game.deck = [c('sha', { id: 'd1' }), c('sha', { id: 'd2' })];
  const r = Engine.playCard(game, 'player', 'wz2');
  assert.equal(r.ok, true);
  assert.equal(game.player.hand.length, 2, '无人抵消 → 摸到 2 张');
});

// --- 南蛮入侵 ---

test('H1 南蛮入侵: 对方持【无懈】(auto) → 抵消, 不掉血', () => {
  const game = buildGame();
  game.player.hand = [c('nanman', { id: 'nm' })];
  game.enemy.hand = [c('wuxie', { id: 'nm-wuxie' })]; // 只有无懈, 无杀
  // v11 D1 (批次 33): AI 无懈走期望值 (无杀响应且 hp<=2 才无懈南蛮) —
  // 压低血线满足条件, 保持本测试对无懈链的覆盖意图。
  game.enemy.hp = 2;
  const hp = game.enemy.hp;
  const r = Engine.playCard(game, 'player', 'nm');
  assert.equal(r.ok, true);
  assert.equal(game.enemy.hp, hp, '南蛮被无懈 → 对方不受伤害');
  assert.ok(game.discard.some((card) => card.id === 'nm-wuxie'), '【无懈】已消耗');
  assert.ok(game.discard.some((card) => card.id === 'nm'), '【南蛮入侵】进入弃牌堆');
});

test('H1 南蛮入侵: 对方无【无懈】且无【杀】→ 受 1 点伤害', () => {
  const game = buildGame();
  game.player.hand = [c('nanman', { id: 'nm2' })];
  game.enemy.hand = [];
  const hp = game.enemy.hp;
  const r = Engine.playCard(game, 'player', 'nm2');
  assert.equal(r.ok, true);
  assert.equal(game.enemy.hp, hp - 1, '无抵消无响应 → 受 1 点伤害');
});

// --- 万箭齐发 ---

test('H1 万箭齐发: 对方持【无懈】(auto) → 抵消, 不掉血', () => {
  const game = buildGame();
  game.player.hand = [c('wanjian', { id: 'wj' })];
  game.enemy.hand = [c('wuxie', { id: 'wj-wuxie' })]; // 只有无懈, 无闪
  // v11 D1 (批次 33): 同上 — 无闪响应且 hp<=2 才无懈万箭。
  game.enemy.hp = 2;
  const hp = game.enemy.hp;
  const r = Engine.playCard(game, 'player', 'wj');
  assert.equal(r.ok, true);
  assert.equal(game.enemy.hp, hp, '万箭被无懈 → 对方不受伤害');
  assert.ok(game.discard.some((card) => card.id === 'wj-wuxie'), '【无懈】已消耗');
});

test('H1 万箭齐发: 对方无【无懈】且无【闪】→ 受 1 点伤害', () => {
  const game = buildGame();
  game.player.hand = [c('wanjian', { id: 'wj2' })];
  game.enemy.hand = [];
  const hp = game.enemy.hp;
  const r = Engine.playCard(game, 'player', 'wj2');
  assert.equal(r.ok, true);
  assert.equal(game.enemy.hp, hp - 1, '无抵消无响应 → 受 1 点伤害');
});

// --- 延时锦囊 (v13 J0-2: 放置直入判定区, 无懈窗口移至判定阶段生效前) ---

test('J0-2 乐不思蜀: 放置直入判定区; 判定前对方持【无懈】(auto) → 抵消', () => {
  const game = buildGame();
  game.player.hand = [c('lebusishu', { id: 'lbss' })];
  // v11 D1 (批次 33): 乐只在手牌有阵容 (>=2) 时才护 — 补一张手牌。
  game.enemy.hand = [c('wuxie', { id: 'lbss-wuxie' }), c('tao', { id: 'lbss-filler' })];
  game.deck = [c('sha', { id: 'd1' }), c('sha', { id: 'd2' }), c('sha', { id: 'd3' })];
  const r = Engine.playCard(game, 'player', 'lbss');
  assert.equal(r.ok, true);
  assert.equal(game.enemy.judgeArea.length, 1, '放置时不开无懈窗口, 直入判定区');
  assert.ok(!game.discard.some((card) => card.id === 'lbss-wuxie'), '放置时无懈未被询问消耗');
  // 对方回合判定阶段: 生效前开无懈窗口 → auto 抵消
  Engine.startTurn(game, 'enemy');
  assert.equal(game.enemy.judgeArea.length, 0, '判定前被无懈 → 弃置, 不判定');
  assert.ok(game.discard.some((card) => card.id === 'lbss'), '【乐不思蜀】进入弃牌堆');
  assert.ok(game.discard.some((card) => card.id === 'lbss-wuxie'), '【无懈】已消耗');
  assert.ok(!game.enemy.flags.skipPlay, '出牌阶段未被跳过');
});

test('H1 乐不思蜀: 对方无【无懈】→ 正常置入对方判定区', () => {
  const game = buildGame();
  game.player.hand = [c('lebusishu', { id: 'lbss2' })];
  game.enemy.hand = [];
  const r = Engine.playCard(game, 'player', 'lbss2');
  assert.equal(r.ok, true);
  assert.equal(game.enemy.judgeArea.length, 1, '无抵消 → 置入对方判定区');
  assert.equal(game.enemy.judgeArea[0].id, 'lbss2');
});

test('H1 闪电: 目标为自己, 对方无【无懈】→ 置入自己判定区', () => {
  const game = buildGame();
  game.player.hand = [c('shandian', { id: 'sd' })];
  game.enemy.hand = [];
  const r = Engine.playCard(game, 'player', 'sd');
  assert.equal(r.ok, true);
  assert.equal(game.player.judgeArea.length, 1, '闪电置入自己判定区');
  assert.equal(game.player.judgeArea[0].id, 'sd');
});

// --- 玩家 ask 路径: AI 出锦囊, 玩家被询问是否无懈 ---

test('H1 玩家 ask 路径: enemy 出【万箭齐发】, player 有【无懈】+ ask → 暂停等无懈响应', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('wanjian', { id: 'ai-wj' })];
  game.player.hand = [c('wuxie', { id: 'p-wuxie' })];
  game.player.skillPreferences.wuxieResponse = 'ask';
  const r = Engine.playCard(game, 'enemy', 'ai-wj');
  assert.equal(r.ok, true);
  assert.ok(game.pendingChoice, '应暂停等待玩家无懈响应');
  assert.equal(game.pendingChoice.kind, 'wuxie-response');
  assert.equal(game.pendingChoice.actor, 'player');
  // 玩家打出无懈 → 抵消 → 不受伤害
  const hp = game.player.hp;
  const r2 = Engine.resolvePendingChoice(game, { cardId: 'p-wuxie' });
  assert.equal(r2.ok, true);
  assert.equal(game.player.hp, hp, '玩家无懈抵消万箭 → 不掉血');
  assert.ok(!game.pendingChoice, '无懈链结算完成');
});

test('H1 玩家 ask 路径: 玩家放弃无懈 → 万箭照常结算 (无闪 → 掉血)', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('wanjian', { id: 'ai-wj2' })];
  game.player.hand = [c('wuxie', { id: 'p-wuxie2' })];
  game.player.skillPreferences.wuxieResponse = 'ask';
  const hp = game.player.hp;
  Engine.playCard(game, 'enemy', 'ai-wj2');
  assert.equal(game.pendingChoice.kind, 'wuxie-response');
  const r = Engine.resolvePendingChoice(game, { decline: true });
  assert.equal(r.ok, true);
  assert.equal(game.player.hp, hp - 1, '放弃无懈 + 无闪 → 受 1 点伤害');
  assert.ok(game.player.hand.some((card) => card.id === 'p-wuxie2'), '放弃 → 无懈保留');
});
