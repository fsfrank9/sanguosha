// v11 C8 (批次 32): 标准版袁术 (群/男/4勾玉, gid 215) — 妄尊 + 同疾。
// 妄尊: 主公的准备阶段开始时, 袁术摸一张牌, 该主公本回合手牌上限 -1
//       (handLimitDelta 回合级修正, 回合始/末复位)。
// 同疾: 锁定技 — 1v1 恒不拦截 (可指定目标只有对手), reserved hook 同流离。
// 附: 结姻 jieyinUsed 每回合复位的回归 (批次 30 遗漏修复)。
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
    seed: opts.seed || 32001,
    playerHero: opts.playerHero || 'liubei',
    enemyHero: opts.enemyHero || 'yuanshu',
    playerRole: opts.playerRole,
    enemyRole: opts.enemyRole
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
  for (let i = 0; i < n; i += 1) game.deck.push(c('sha', { id: `deck-${i}` }));
}

// ───── 妄尊 ─────────────────────────────────────────────────────────

test('妄尊: 主公准备阶段 → 袁术摸一张, 主公本回合手牌上限 -1', () => {
  const game = buildGame(); // player=主公(默认), enemy=袁术
  stockDeck(game, 5);
  assertCardConservation(game, () => {
    const r = Engine.startTurn(game, 'player');
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.enemy.hand.length, 1, '袁术摸一张');
  assert.equal(Engine.handLimit(game, 'player'), game.player.hp - 1, '主公手牌上限 -1');
  assert.ok(game.log.some((l) => l.includes('【妄尊】')), '有妄尊日志');
});

test('妄尊: 手牌上限修正是回合级 — 回合重置后不残留', () => {
  const game = buildGame();
  stockDeck(game, 8);
  Engine.startTurn(game, 'player');
  assert.equal(Engine.handLimit(game, 'player'), game.player.hp - 1);
  // 撤掉妄尊后再开新回合: resetActorTurnState 清 delta 且不再施加
  game.enemy.skills = [];
  game.player.hand = [];
  Engine.startTurn(game, 'player');
  assert.equal(Engine.handLimit(game, 'player'), game.player.hp, '修正已复位');
});

test('妄尊 反例: 回合角色非主公 → 不触发', () => {
  const game = buildGame({ playerRole: '反贼', enemyRole: '主公' });
  stockDeck(game, 5);
  Engine.startTurn(game, 'player');
  assert.equal(game.enemy.hand.length, 0, '袁术不摸牌');
  assert.equal(Engine.handLimit(game, 'player'), game.player.hp, '上限不变');
  assert.ok(!game.log.some((l) => l.includes('【妄尊】')));
});

test('妄尊 decline 偏好: 不发动', () => {
  const game = buildGame();
  game.enemy.skillPreferences.wangzun = 'decline';
  stockDeck(game, 5);
  Engine.startTurn(game, 'player');
  assert.equal(game.enemy.hand.length, 0);
  assert.equal(Engine.handLimit(game, 'player'), game.player.hp);
});

test('妄尊 反例: 非袁术对手 → 不触发', () => {
  const game = buildGame({ enemyHero: 'lvmeng' });
  stockDeck(game, 5);
  Engine.startTurn(game, 'player');
  assert.equal(game.enemy.hand.length, 0);
  assert.equal(Engine.handLimit(game, 'player'), game.player.hp);
});

// ───── 同疾 (1v1 恒不拦截, reserved) ────────────────────────────────

test('同疾: 1v1 对手的杀照常指向袁术 (不误拦)', () => {
  const game = buildGame();
  // 袁术手牌 > 体力 (同疾条件满足), 但 1v1 目标本就是袁术 → 不拦截
  game.enemy.hand = [c('tao', { id: 't1' }), c('tao', { id: 't2' }), c('tao', { id: 't3' }), c('tao', { id: 't4' }), c('tao', { id: 't5' })];
  game.enemy.hp = 4;
  game.player.hand = [c('sha', { id: 'p-sha' })];
  const hp = game.enemy.hp;
  const r = Engine.playCard(game, 'player', 'p-sha');
  assert.equal(r.ok, true, '杀照常可用');
  assert.equal(game.enemy.hp, hp - 1, '命中 (袁术无闪)');
});

test('同疾: 袁术自己出杀不受影响', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'e-sha' }), c('tao', { id: 't1' }), c('tao', { id: 't2' }), c('tao', { id: 't3' }), c('tao', { id: 't4' })];
  const r = Engine.playCard(game, 'enemy', 'e-sha');
  assert.equal(r.ok, true);
});

// ───── 回归: 结姻 每回合复位 (批次 30 遗漏修复) ─────────────────────

test('回归 结姻: jieyinUsed 随新回合复位 (每回合限一次, 而非每局)', () => {
  const game = buildGame({ playerHero: 'sunshangxiang', enemyHero: 'liubei' });
  game.player.flags.jieyinUsed = true;
  stockDeck(game, 5);
  Engine.startTurn(game, 'player');
  assert.equal(game.player.flags.jieyinUsed, false, '新回合复位');
  // 复位后可再次发动
  game.player.hp = 1;
  game.enemy.hp = 2;
  game.player.hand = [c('sha', { id: 'j1' }), c('shan', { id: 'j2' })];
  const r = Engine.useSkill(game, 'player', 'jieyin', ['j1', 'j2']);
  assert.equal(r.ok, true, r.message);
  assert.equal(game.player.hp, 2);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
