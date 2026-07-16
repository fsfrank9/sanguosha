// v13 J0-2 (PR #165 玩家实测缺陷 2): 延时锦囊无懈时机 — 官方时点为
// "一张锦囊牌对一个目标生效前" (card__scroll.md:78), 延时锦囊的生效即目标
// 判定阶段的判定结算 (flow__use.md:133 "先进行判定结算")。放置时不再询问,
// 无懈窗口移至 processJudgeArea 判定前。被抵消: 乐/兵粮 → 弃置; 闪电 →
// 不判定, 按移动规则置入下家判定区 (card__scroll.md:207 "目标角色被取消
// 后…置入其下家的判定区")。另: 判定阶段结算顺序为 LIFO ("进行其中最后
// 置入其判定区里的那张", flow__game.md 判定阶段)。
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
    seed: opts.seed || 13021,
    playerHero: opts.playerHero || 'liubei',
    enemyHero: opts.enemyHero || 'caocao'
  });
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

function stockDeck(game, n) {
  for (let i = 0; i < n; i += 1) game.deck.unshift(c('sha', { id: `deck-${i}` }));
}

test('J0-2: 放置时机零询问 — 玩家 (wuxie+ask) 被放乐, 放置时不暂停', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('lebusishu', { id: 'e-lbss' })];
  game.player.hand = [c('wuxie', { id: 'p-wx' })];
  game.player.skillPreferences.wuxieResponse = 'ask';
  const r = Engine.playCard(game, 'enemy', 'e-lbss');
  assert.equal(r.ok, true, r.message);
  assert.equal(game.pendingChoice, null, '放置时不再开无懈窗口');
  assert.equal(game.player.judgeArea.length, 1, '乐直接置入玩家判定区');
});

test('J0-2: 玩家 ask — 判定阶段生效前暂停询问; 打出无懈 → 乐弃置不判定', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('lebusishu', { id: 'e-lbss' })];
  game.player.hand = [c('wuxie', { id: 'p-wx' })];
  game.player.skillPreferences.wuxieResponse = 'ask';
  stockDeck(game, 6);
  Engine.playCard(game, 'enemy', 'e-lbss');
  // 玩家回合开始 → 判定阶段 → 乐生效前开无懈窗口 → 暂停
  const r = Engine.startTurn(game, 'player');
  assert.equal(r.ok, true, r.message);
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'wuxie-response', '判定前暂停询问');
  const handBefore = game.player.hand.length;
  const r2 = Engine.resolvePendingChoice(game, { cardId: 'p-wx' });
  assert.equal(r2.ok, true, r2.message);
  assert.ok(game.discard.some((x) => x.id === 'e-lbss'), '被抵消的乐进弃牌堆');
  assert.ok(!game.player.flags.skipPlay, '出牌阶段未被跳过');
  assert.equal(game.phase, 'play', '挂起排空后回合续跑至出牌阶段');
  assert.equal(game.player.hand.length, handBefore - 1 + 2, '无懈消耗 1 张, 摸牌阶段照常摸 2');
});

test('J0-2: 玩家 ask — 放弃无懈 → 乐照常判定 (非红桃跳过出牌)', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('lebusishu', { id: 'e-lbss' })];
  game.player.hand = [c('wuxie', { id: 'p-wx' })];
  game.player.skillPreferences.wuxieResponse = 'ask';
  stockDeck(game, 4);
  // 判定牌 (末位先取) 黑桃 → 乐判定失败 → 跳过出牌阶段
  game.deck.push(c('sha', { id: 'j-spade', suit: 'spade' }));
  Engine.playCard(game, 'enemy', 'e-lbss');
  Engine.startTurn(game, 'player');
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'wuxie-response');
  const r = Engine.resolvePendingChoice(game, { decline: true });
  assert.equal(r.ok, true, r.message);
  assert.ok(game.player.flags.skipPlay, '判定失败 → 跳过出牌阶段');
  assert.ok(game.player.hand.some((x) => x.id === 'p-wx'), '放弃 → 无懈保留');
});

test('J0-2: 闪电被无懈 → 不判定, 按移动规则置入下家判定区 (牌守恒)', () => {
  const game = buildGame();
  game.player.judgeArea = [c('shandian', { id: 'p-sd' })];
  game.player.hand = [c('wuxie', { id: 'p-wx' })];
  game.player.skillPreferences.wuxieResponse = 'ask';
  stockDeck(game, 6);
  const hp = game.player.hp;
  Engine.startTurn(game, 'player');
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'wuxie-response', '闪电生效前询问');
  assertCardConservation(game, () => {
    const r = Engine.resolvePendingChoice(game, { cardId: 'p-wx' });
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.player.hp, hp, '未判定未受伤');
  assert.ok(game.enemy.judgeArea.some((x) => x.id === 'p-sd'), '闪电移入下家判定区');
  assert.ok(!game.discard.some((x) => x.id === 'p-sd'), '闪电未进弃牌堆');
});

test('J0-2: 判定阶段 LIFO — 后置入的延时锦囊先结算 (兵粮先于乐)', () => {
  const game = buildGame();
  // 直接构造: 先置入乐, 后置入兵粮 (判定区数组顺序即置入顺序)
  game.player.judgeArea = [
    c('lebusishu', { id: 'p-lbss' }),
    c('bingliang', { id: 'p-bl' })
  ];
  stockDeck(game, 6);
  Engine.startTurn(game, 'player');
  const blIdx = game.log.findIndex((l) => l.includes('【兵粮寸断】判定'));
  const lbIdx = game.log.findIndex((l) => l.includes('【乐不思蜀】判定'));
  assert.ok(blIdx >= 0 && lbIdx >= 0, '两张延时锦囊都已判定');
  assert.ok(blIdx < lbIdx, '后置入的兵粮先结算 (LIFO, flow__game.md 判定阶段)');
});

test('J0-2: 无懈链跳过来源 — 放置者不被询问抵消自己的乐', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('lebusishu', { id: 'e-lbss' }), c('wuxie', { id: 'e-wx' }), c('tao', { id: 'filler' })];
  stockDeck(game, 6);
  Engine.playCard(game, 'enemy', 'e-lbss');
  assert.equal(game.player.judgeArea.length, 1);
  // 玩家回合判定阶段: 净通过态队列跳过来源 (enemy), 玩家无无懈 → 直接判定
  Engine.startTurn(game, 'player');
  assert.ok(game.enemy.hand.some((x) => x.id === 'e-wx'), '放置者的无懈未被消耗 (来源不自懈)');
  assert.ok(game.log.some((l) => l.includes('【乐不思蜀】判定')), '乐照常判定');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
