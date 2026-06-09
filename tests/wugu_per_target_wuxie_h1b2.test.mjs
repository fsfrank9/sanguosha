import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

assert.ok(Engine, 'engine module loaded');

// H1b-2: 五谷丰登 逐目标无懈。五谷对每名角色「获得一张」分别生效, 无懈可击
// 只抵消「对一个目标」的效果 → 每名 picker 选牌前各自开无懈窗口
// (responder = opponent(picker))。被无懈则该 picker 不获得, 其余流程不变。

function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function buildGame(opts) {
  opts = opts || {};
  const game = Engine.newGame({ seed: 71, playerHero: opts.playerHero || 'liubei', enemyHero: opts.enemyHero || 'caocao' });
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

test('H1b-2 五谷: 双方无懈皆无 → 双方各获得 1 (回归: 行为不变)', () => {
  const game = buildGame();
  game.player.skillPreferences.wugu = 'auto';
  game.player.hand = [c('wugu', { id: 'wg0' })];
  game.deck = [c('sha', { id: 'a1' }), c('tao', { id: 'a2' })];
  const r = Engine.playCard(game, 'player', 'wg0');
  assert.equal(r.ok, true);
  assert.equal(game.player.hand.length, 1, '发动者获得 1');
  assert.equal(game.enemy.hand.length, 1, '对手获得 1');
  assert.ok(!game.pendingChoice, '全 auto → 无暂停');
});

test('H1b-2 五谷: 对方持无懈(auto) → 抵消发动者的获得, 对方仍自取', () => {
  // actor=player。目标 0 = player, responder = enemy(auto wuxie) → 抵消;
  // 目标 1 = enemy, responder = player(无无懈) → enemy 自取 1。
  const game = buildGame();
  game.player.skillPreferences.wugu = 'auto';
  game.player.hand = [c('wugu', { id: 'wg1' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' })];
  game.deck = [c('sha', { id: 'd1' }), c('sha', { id: 'd2' })];
  const r = Engine.playCard(game, 'player', 'wg1');
  assert.equal(r.ok, true);
  assert.equal(game.player.hand.length, 0, '发动者获得被无懈抵消 → 不摸');
  assert.equal(game.enemy.hand.length, 1, '对手自己的获得未被抵消');
  assert.ok(game.discard.some((card) => card.id === 'e-wx'), '无懈已消耗');
});

test('H1b-2 五谷 玩家 ask: 玩家用无懈抵消对方(发动者)的获得', () => {
  // actor=enemy。目标 0 = enemy, responder = player(ask + 无懈) → 暂停。
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('wugu', { id: 'ai-wg' })];
  game.player.hand = [c('wuxie', { id: 'p-wx' })];
  game.player.skillPreferences.wuxieResponse = 'ask';
  game.player.skillPreferences.wugu = 'auto';
  game.deck = [c('sha', { id: 'c1' }), c('tao', { id: 'c2' })];
  Engine.playCard(game, 'enemy', 'ai-wg');
  assert.ok(game.pendingChoice, '应暂停等玩家无懈 (针对 enemy 的获得)');
  assert.equal(game.pendingChoice.kind, 'wuxie-response');
  const r = Engine.resolvePendingChoice(game, { cardId: 'p-wx' });
  assert.equal(r.ok, true);
  assert.equal(game.enemy.hand.length, 0, '发动者(enemy)的获得被玩家无懈抵消');
  assert.equal(game.player.hand.length, 1, '玩家自己 auto 获得 1');
  assert.ok(!game.pendingChoice, '五谷逐目标结算完成');
});

test('H1b-2 五谷: 选牌暂停仍正常 (无懈窗口先结算, 对方无无懈)', () => {
  // actor=player, 玩家先选 (pool=2, ask) → 选牌暂停; 之后 enemy 自取末张。
  const game = buildGame();
  // player wugu 默认 'ask'
  game.player.hand = [c('wugu', { id: 'wg2' })];
  game.deck = [c('sha', { id: 'p1' }), c('tao', { id: 'p2' })];
  Engine.playCard(game, 'player', 'wg2');
  assert.ok(game.pendingChoice, '玩家先选 → 选牌暂停');
  assert.equal(game.pendingChoice.kind, 'wugu-pick');
  assert.equal(game.pendingChoice.actor, 'player');
  assert.equal(game.pendingChoice.cards.length, 2, '亮出 2 张供选');
  const pickId = game.pendingChoice.cards[0].id;
  const r = Engine.resolvePendingChoice(game, { cardId: pickId });
  assert.equal(r.ok, true);
  assert.equal(game.player.hand.length, 1, '玩家选到 1 张');
  assert.ok(game.player.hand.some((card) => card.id === pickId));
  assert.equal(game.enemy.hand.length, 1, '对手自取末张');
  assert.ok(!game.pendingChoice, '五谷结算完成');
});
