import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

assert.ok(Engine, 'engine module loaded');

// H1b: 桃园结义 逐目标无懈。桃园对每名受伤角色分别「生效」, 无懈可击只抵消
// 「对一个目标」的效果 → 双方都受伤时, 两次回复可被各自独立无懈。
// 结算顺序从发动者起 = [actor, opponent]; 每名目标 responder = opponent(目标)。

function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function buildGame(opts) {
  opts = opts || {};
  const game = Engine.newGame({ seed: 61, playerHero: opts.playerHero || 'liubei', enemyHero: opts.enemyHero || 'caocao' });
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

test('H1b 桃园: 双方受伤 + 无人无懈 → 双方各回 1 (回归: 行为不变)', () => {
  const game = buildGame();
  game.player.hp = game.player.maxHp - 2;
  game.enemy.hp = game.enemy.maxHp - 2;
  game.player.hand = [c('taoyuan', { id: 'ty' })];
  const p0 = game.player.hp;
  const e0 = game.enemy.hp;
  const r = Engine.playCard(game, 'player', 'ty');
  assert.equal(r.ok, true);
  assert.equal(game.player.hp, p0 + 1, '发动者回 1');
  assert.equal(game.enemy.hp, e0 + 1, '对手回 1');
  assert.ok(game.discard.some((card) => card.id === 'ty'), '桃园进弃牌堆');
});

test('H1b 桃园: 双方受伤 + 对方持 1 张无懈(auto) → 抵消发动者回复, 对手仍自回', () => {
  // actor=player 出桃园。目标 0 = player, responder = enemy → enemy 用无懈抵消;
  // 目标 1 = enemy, responder = player(无无懈) → enemy 回复。
  const game = buildGame();
  game.player.hp = game.player.maxHp - 2;
  game.enemy.hp = game.enemy.maxHp - 2;
  game.player.hand = [c('taoyuan', { id: 'ty2' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' })];
  const p0 = game.player.hp;
  const e0 = game.enemy.hp;
  const r = Engine.playCard(game, 'player', 'ty2');
  assert.equal(r.ok, true);
  assert.equal(game.player.hp, p0, '发动者(player)的回复被对方无懈抵消');
  assert.equal(game.enemy.hp, e0 + 1, '对手(enemy)自己的回复未被抵消 (player 无无懈)');
  assert.ok(game.discard.some((card) => card.id === 'e-wx'), '无懈已消耗');
});

test('H1b 桃园: 仅发动者受伤 + 对方无懈 → 发动者不回 (单目标)', () => {
  const game = buildGame();
  game.player.hp = game.player.maxHp - 2;
  // enemy 满血 → 非目标
  game.player.hand = [c('taoyuan', { id: 'ty3' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx3' })];
  const p0 = game.player.hp;
  const e0 = game.enemy.hp;
  const r = Engine.playCard(game, 'player', 'ty3');
  assert.equal(r.ok, true);
  assert.equal(game.player.hp, p0, '唯一目标被无懈抵消 → 不回');
  assert.equal(game.enemy.hp, e0, 'enemy 满血非目标');
  assert.ok(game.discard.some((card) => card.id === 'e-wx3'), '无懈已消耗');
});

test('H1b 桃园 玩家 ask 路径: enemy 出桃园, player 用无懈抵消 enemy 的回复', () => {
  // actor=enemy 出桃园, 双方受伤。
  // 目标 0 = enemy(actor), responder = player(ask + 有无懈) → 暂停。
  const game = buildGame();
  game.turn = 'enemy';
  game.player.hp = game.player.maxHp - 2;
  game.enemy.hp = game.enemy.maxHp - 2;
  game.enemy.hand = [c('taoyuan', { id: 'ai-ty' })];
  game.player.hand = [c('wuxie', { id: 'p-wx' })];
  game.player.skillPreferences.wuxieResponse = 'ask';
  const p0 = game.player.hp;
  const e0 = game.enemy.hp;
  Engine.playCard(game, 'enemy', 'ai-ty');
  assert.ok(game.pendingChoice, '应暂停等玩家无懈 (针对 enemy 的回复)');
  assert.equal(game.pendingChoice.kind, 'wuxie-response');
  // 玩家打出无懈 → 抵消 enemy 的回复
  const r = Engine.resolvePendingChoice(game, { cardId: 'p-wx' });
  assert.equal(r.ok, true);
  assert.equal(game.enemy.hp, e0, 'enemy(发动者)的回复被玩家无懈抵消');
  assert.equal(game.player.hp, p0 + 1, '玩家自己的回复未被抵消 (enemy 无无懈)');
  assert.ok(!game.pendingChoice, '桃园逐目标结算完成');
});

test('H1b 桃园: 双方满血 → 无目标, 直接结算 (集智仍可触发, 仅状态不变)', () => {
  const game = buildGame();
  game.player.hand = [c('taoyuan', { id: 'ty-full' })];
  const p0 = game.player.hp;
  const e0 = game.enemy.hp;
  const r = Engine.playCard(game, 'player', 'ty-full');
  assert.equal(r.ok, true);
  assert.equal(game.player.hp, p0);
  assert.equal(game.enemy.hp, e0);
  assert.ok(game.discard.some((card) => card.id === 'ty-full'), '桃园进弃牌堆');
});
