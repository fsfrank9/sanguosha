import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function makeGame() {
  const game = Engine.newGame({ seed: 77, startWithFirstTurn: true });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

function dealWugu(state, id) {
  const card = { id, type: 'wugu', name: '五谷丰登', family: 'trick', suit: 'spade', color: 'black' };
  state.hand.push(card);
  return card;
}

function deckCard(id, type, name, extra) {
  return Object.assign({ id, type, name, suit: 'heart', color: 'red' }, extra || {});
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v7 PR-7 / v8 PR-D2: 1v1 X=2 — auto path 按 scoreCard 挑最高分, 不再 deterministic 取顶张', () => {
  const game = makeGame();
  game.player.skillPreferences.wugu = 'auto';
  game.enemy.skillPreferences.wugu = 'auto';
  // 让 player 受伤, 桃应是高分; sha 中等; shan 0
  game.player.hp = game.player.maxHp - 1;
  // deck.pop() → top of deck = last array element
  // 让 top=shan (低分), mid=sha (中分), bottom=tao (高分 for wounded player)
  // X=2 → reveal top 2 = [shan, sha] (pool 顺序: revealed[0]=top=shan, [1]=mid=sha)
  game.deck = [deckCard('bottom', 'tao', '桃'), deckCard('mid', 'sha', '杀'), deckCard('top', 'shan', '闪')];
  dealWugu(game.player, 'wugu-auto');
  Engine.playCard(game, 'player', 'wugu-auto');
  // pool = [shan, sha]; player AI 挑 高分 sha (闪 score 0 vs 杀 score >0)
  assert.ok(game.player.hand.some((c) => c.id === 'mid'), 'player AI picked higher-scoring 杀, not deterministic 闪');
  assert.ok(game.enemy.hand.some((c) => c.id === 'top'), 'enemy got remaining 闪');
  assert.ok(game.deck.some((c) => c.id === 'bottom'), '未参加 reveal 的 桃 仍在 deck');
});

test('v7 PR-7: player ask → pendingChoice "wugu-pick" with full pool', () => {
  const game = makeGame();
  // default pref = ask for player
  game.deck = [deckCard('a', 'tao', '桃'), deckCard('b', 'sha', '杀')];
  dealWugu(game.player, 'wugu-ask');
  Engine.playCard(game, 'player', 'wugu-ask');
  assert.ok(game.pendingChoice);
  assert.equal(game.pendingChoice.kind, 'wugu-pick');
  assert.equal(game.pendingChoice.actor, 'player');
  assert.equal(game.pendingChoice.cards.length, 2);
  assert.deepEqual(game.pendingChoice.cards.map((c) => c.id).sort(), ['a', 'b']);
  // No card has been distributed yet
  assert.equal(game.player.hand.length, 0);
  assert.equal(game.enemy.hand.length, 0);
});

test('v7 PR-7: resolveWuguPickChoice → 玩家选 cardId, opponent 自动取剩', () => {
  const game = makeGame();
  game.deck = [deckCard('rare', 'tao', '桃'), deckCard('cheap', 'shan', '闪')];
  dealWugu(game.player, 'wugu-resolve');
  Engine.playCard(game, 'player', 'wugu-resolve');
  // Pool revealed; player chooses 'rare' (the 桃)
  const result = Engine.resolvePendingChoice(game, { cardId: 'rare' });
  assert.equal(result.ok, true);
  assert.ok(game.player.hand.some((c) => c.id === 'rare'));
  assert.ok(game.enemy.hand.some((c) => c.id === 'cheap'));
  assert.equal(game.pendingChoice, null);
});

test('v7 PR-7: 玩家选了不存在的 cardId → fail，重设 pendingChoice', () => {
  const game = makeGame();
  game.deck = [deckCard('x', 'tao', '桃'), deckCard('y', 'sha', '杀')];
  dealWugu(game.player, 'wugu-bad-id');
  Engine.playCard(game, 'player', 'wugu-bad-id');
  const result = Engine.resolvePendingChoice(game, { cardId: 'no-such-id' });
  assert.equal(result.ok, false);
  assert.ok(game.pendingChoice, '失败后 pendingChoice 应被重置');
  assert.equal(game.pendingChoice.kind, 'wugu-pick');
});

test('v7 PR-7: 牌堆不足 X 张 → 终止使用结算 (spec)', () => {
  const game = makeGame();
  game.deck = [deckCard('only', 'tao', '桃')];
  game.discard = []; // empty discard so reshuffle can't help
  dealWugu(game.player, 'wugu-empty');
  game.player.skillPreferences.wugu = 'auto';
  const result = Engine.playCard(game, 'player', 'wugu-empty');
  assert.equal(result.ok, true);
  // wugu was discarded, but no cards distributed
  assert.equal(game.player.hand.length, 0, 'player hand 不变（除了 wugu 自身被消耗）');
  assert.equal(game.enemy.hand.length, 0, 'enemy hand 不变');
  assert.ok(game.discard.some((c) => c.id === 'wugu-empty'), 'wugu 自身入弃牌堆');
});

test('v7 PR-7: enemy turn — AI source 完全 auto，无 pause', () => {
  const game = makeGame();
  game.turn = 'enemy';
  game.deck = [deckCard('e1', 'tao', '桃'), deckCard('e2', 'sha', '杀')];
  dealWugu(game.enemy, 'wugu-enemy');
  Engine.playCard(game, 'enemy', 'wugu-enemy');
  assert.equal(game.pendingChoice, null);
  // enemy (source, AI auto) takes 'e2' (top, last popped) wait — let's verify:
  // deck = [e1, e2]; pop() returns last → first pop = e2; second pop = e1.
  // So pool = [e2, e1]. auto picks index 0 = e2 for enemy. player gets e1.
  assert.ok(game.enemy.hand.some((c) => c.id === 'e2'));
  assert.ok(game.player.hand.some((c) => c.id === 'e1'));
});

test('v7 PR-7: 全 auto 时剩余牌应被弃 (X=3 假设 但 1v1 X=2 不会有剩；用 mock 3 测试已注释)', () => {
  // 1v1 中 X = aliveActorCount = 2，两人各取一张，无剩余。本断言占位；多人模式下才有剩余检验意义。
  const game = makeGame();
  game.player.skillPreferences.wugu = 'auto';
  game.deck = [deckCard('a1', 'tao', '桃'), deckCard('a2', 'sha', '杀')];
  dealWugu(game.player, 'wugu-no-leftover');
  Engine.playCard(game, 'player', 'wugu-no-leftover');
  // 双方各取 1，无剩余 → 弃牌堆里只有 wugu 自身
  const wuguDiscarded = game.discard.filter((c) => c.id === 'wugu-no-leftover').length;
  const otherDiscarded = game.discard.filter((c) => ['a1', 'a2'].indexOf(c.id) >= 0).length;
  assert.equal(wuguDiscarded, 1);
  assert.equal(otherDiscarded, 0, '1v1 X=2 双人各取一张，无剩余进弃牌堆');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
