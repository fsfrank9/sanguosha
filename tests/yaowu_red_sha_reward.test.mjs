// v11 C7 (批次 31): 耀武 (华雄, 锁定技) — 受到红色【杀】造成的伤害后,
// 伤害来源选择一项: 回复 1 点体力, 或摸一张牌。
// 新交互 kind 'yaowu-reward' (玩家来源 ask 面板二选一; AI/auto 来源
// 受伤→回血 否则→摸牌)。
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
  const game = Engine.newGame({ seed: opts.seed || 31001, playerHero: opts.playerHero || 'huaxiong', enemyHero: opts.enemyHero || 'lvmeng' });
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
  game.turn = 'enemy';
  game.phase = 'play';
  return game;
}

function redSha(id) { return c('sha', { id, suit: 'heart', color: 'red' }); }

// ───── auto 来源 (AI) ───────────────────────────────────────────────

test('耀武 auto: 来源受伤 → 回复 1 点体力', () => {
  const game = buildGame();
  game.enemy.hp = 2;
  game.enemy.hand = [redSha('e-red-sha')];
  const huaxiongHp = game.player.hp;
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'enemy', 'e-red-sha');
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.player.hp, huaxiongHp - 1, '华雄受 1 伤');
  assert.equal(game.enemy.hp, 3, '来源因耀武回复 1');
  assert.ok(game.log.some((l) => l.includes('【耀武】')), '有耀武日志');
});

test('耀武 auto: 来源满血 → 摸一张牌', () => {
  const game = buildGame();
  game.enemy.hand = [redSha('e-red-sha')];
  game.deck = [c('tao', { id: 'reward-draw' })];
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'e-red-sha'));
  assert.equal(game.enemy.hp, game.enemy.maxHp, '满血不回复');
  assert.deepEqual(game.enemy.hand.map((x) => x.id), ['reward-draw'], '改为摸一张');
});

// ───── ask 来源 (玩家) ──────────────────────────────────────────────

function askSetup(opts) {
  const game = buildGame(Object.assign({ playerHero: 'lvmeng', enemyHero: 'huaxiong' }, opts || {}));
  game.turn = 'player';
  game.player.hand = [redSha('p-red-sha')];
  return game;
}

test('耀武 ask: 玩家来源 → pendingChoice yaowu-reward, 选摸牌', () => {
  const game = askSetup();
  game.deck = [c('tao', { id: 'reward-draw' })];
  const r = Engine.playCard(game, 'player', 'p-red-sha');
  assert.equal(r.ok, true, r.message);
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'yaowu-reward');
  assert.equal(game.pendingChoice.actor, 'player');
  assert.equal(game.pendingChoice.canRecover, false, '满血 → 不可选回复');

  assertCardConservation(game, () => {
    const r2 = Engine.resolvePendingChoice(game, { choice: 'draw' });
    assert.equal(r2.ok, true, r2.message);
  });
  assert.equal(game.pendingChoice, null);
  assert.ok(game.player.hand.some((x) => x.id === 'reward-draw'), '摸到奖励牌');
});

test('耀武 ask: 受伤来源选回复 → +1 体力', () => {
  const game = askSetup();
  game.player.hp = 2;
  Engine.playCard(game, 'player', 'p-red-sha');
  assert.equal(game.pendingChoice.canRecover, true);
  const r = Engine.resolvePendingChoice(game, { choice: 'recover' });
  assert.equal(r.ok, true, r.message);
  assert.equal(game.player.hp, 3, '回复 1');
});

test('耀武 ask: 满血选回复被拒 → 重试选摸牌', () => {
  const game = askSetup();
  game.deck = [c('tao', { id: 'reward-draw' })];
  Engine.playCard(game, 'player', 'p-red-sha');
  const bad = Engine.resolvePendingChoice(game, { choice: 'recover' });
  assert.equal(bad.ok, false, '满血不能选回复');
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'yaowu-reward', '选择重新挂起');
  const good = Engine.resolvePendingChoice(game, { choice: 'draw' });
  assert.equal(good.ok, true);
  assert.ok(game.player.hand.some((x) => x.id === 'reward-draw'));
});

test('耀武 ask: 非法 decision → 拒绝并重挂', () => {
  const game = askSetup();
  Engine.playCard(game, 'player', 'p-red-sha');
  const bad = Engine.resolvePendingChoice(game, {});
  assert.equal(bad.ok, false);
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'yaowu-reward');
  Engine.resolvePendingChoice(game, { choice: 'draw' });
});

// ───── 反例与边界 ───────────────────────────────────────────────────

test('耀武 反例: 黑色杀 → 不触发', () => {
  const game = buildGame();
  game.enemy.hp = 2;
  game.enemy.hand = [c('sha', { id: 'e-black-sha', suit: 'spade', color: 'black' })];
  Engine.playCard(game, 'enemy', 'e-black-sha');
  assert.equal(game.enemy.hp, 2, '不回复');
  assert.ok(!game.log.some((l) => l.includes('【耀武】')));
});

test('耀武 反例: 红色决斗伤害 (非杀) → 不触发', () => {
  const game = buildGame();
  game.enemy.hp = 2;
  game.enemy.hand = [c('juedou', { id: 'e-juedou', suit: 'heart', color: 'red' })];
  // 华雄无杀 → 决斗受 1 伤, 但来源牌是决斗非杀
  Engine.playCard(game, 'enemy', 'e-juedou');
  assert.ok(!game.log.some((l) => l.includes('【耀武】')));
});

test('耀武 边界: 红杀致濒死 + 自救成功 → 延迟时机照常触发', () => {
  const game = buildGame();
  game.player.hp = 1;
  game.player.hand = [c('tao', { id: 'rescue-tao' })];
  game.player.skillPreferences.dying = 'auto';
  game.enemy.hp = 2;
  game.enemy.hand = [redSha('e-red-sha')];
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'e-red-sha'));
  assert.equal(game.phase, 'play', '自救存活');
  assert.equal(game.player.hp, 1, '桃救回到 1');
  assert.equal(game.enemy.hp, 3, '濒死结算后耀武照常给来源回复');
  assert.ok(game.log.some((l) => l.includes('【耀武】')));
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
