// v11 C1 (批次 25): 救援 — 主公技/锁定。其他吴势力角色对主公孙权使用【桃】
// (含华佗【急救】视为桃) 时, 回复量 +1。
// 覆盖: 出牌阶段对主公用桃 (+1 与 maxHp 封顶) / 濒死救援 桃 与 急救 /
// 反例 (自用、非吴势力、非主公身份)。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

// player = 孙权 (默认主公), enemy 可换 (吴/非吴)。
function buildGame(opts) {
  opts = opts || {};
  const game = Engine.newGame({
    seed: opts.seed || 25101,
    playerHero: opts.playerHero || 'sunquan',
    enemyHero: opts.enemyHero || 'lvmeng',
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
  game.turn = 'enemy';
  game.phase = 'play';
  return game;
}

// ───── 出牌阶段: v13 J0-4 后跨席用桃被拒, 救援仅剩濒死路径 ─────────────

test('v13 J0-4: 出牌阶段吴势力对受伤主公用桃被拒绝 (桃只能对自己)', () => {
  const game = buildGame();
  game.player.hp = 1;
  game.enemy.hp = game.enemy.maxHp - 1; // 自己受伤, canPlayCard 放行
  game.enemy.hand = [c('tao', { id: 'etao' })];
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'enemy', 'etao', { taoTarget: 'player' });
    assert.equal(r.ok, false, '出牌阶段桃目标恒为自己');
  });
  assert.equal(game.player.hp, 1, '主公血量不变');
  assert.equal(game.enemy.hand.length, 1, '桃退回手牌');
  assert.ok(!game.log.some((l) => l.includes('【救援】')), '无救援日志');
});

test('反例: 孙权自用桃 → 只回复 1 (救援不加成自用)', () => {
  const game = buildGame();
  game.turn = 'player';
  game.player.hp = 1;
  game.player.hand = [c('tao', { id: 'ptao' })];
  Engine.playCard(game, 'player', 'ptao');
  assert.equal(game.player.hp, 2, '自用 → 无加成');
  assert.ok(!game.log.some((l) => l.includes('【救援】')), '无救援日志');
});

// ───── 濒死救援: 桃 / 急救 ──────────────────────────────────────────

test('救援 濒死: 吴势力(吕蒙) ask 用桃救主公孙权 → 回复 2, 脱离濒死', () => {
  const game = buildGame();
  game.player.hp = 1;
  game.enemy.hand = [c('sha', { id: 'esha' }), c('tao', { id: 'etao' })];
  game.enemy.skillPreferences.dying = 'ask';
  Engine.playCard(game, 'enemy', 'esha');
  // 杀命中 → 玩家 hp 0 濒死; 响应顺序从回合角色(enemy)起 → enemy ask 暂停
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'dying-rescue');
  assert.equal(game.pendingChoice.actor, 'enemy');
  assert.deepEqual(game.pendingChoice.taoIds, ['etao']);

  assertCardConservation(game, () => {
    const r = Engine.resolvePendingChoice(game, { cardId: 'etao' });
    assert.equal(r.ok, true);
  });
  assert.equal(game.player.hp, 2, '濒死救援回复 1 + 救援加成 1');
  assert.equal(game.pauseState.dying, null, '脱离濒死');
  assert.equal(game.phase, 'play', '未 game-over');
  assert.ok(game.log.some((l) => l.includes('【救援】')), '有救援日志');
});

test('救援 濒死 反例: 非吴势力(曹操)用桃救孙权 → 只回复 1', () => {
  const game = buildGame({ enemyHero: 'caocao' });
  game.player.hp = 1;
  game.enemy.hand = [c('sha', { id: 'esha' }), c('tao', { id: 'etao' })];
  game.enemy.skillPreferences.dying = 'ask';
  Engine.playCard(game, 'enemy', 'esha');
  Engine.resolvePendingChoice(game, { cardId: 'etao' });
  assert.equal(game.player.hp, 1, '无加成 → 回到 1');
  assert.equal(game.pauseState.dying, null, '脱离濒死');
});

test('救援 濒死 反例: 孙权用桃自救 → 只回复 1', () => {
  const game = buildGame();
  game.player.hp = 1;
  game.player.hand = [c('tao', { id: 'ptao' })];
  game.player.skillPreferences.dying = 'auto';
  game.enemy.hand = [c('sha', { id: 'esha' })];
  Engine.playCard(game, 'enemy', 'esha');
  assert.equal(game.player.hp, 1, '自救无加成');
  assert.equal(game.phase, 'play');
});

test('救援 濒死: 华佗(设为吴)【急救】视为桃 → 回复 2', () => {
  const game = buildGame({ enemyHero: 'huatuo' });
  game.enemy.camp = '吴'; // 华佗本为群, 测试改吴以验证急救走救援加成
  game.turn = 'player';
  game.player.hp = 1;
  // 玩家孙权在自己回合出决斗, 对手回杀 → 玩家受伤濒死 (回合外条件满足急救)
  game.player.hand = [c('juedou', { id: 'pj' })];
  game.enemy.hand = [c('sha', { id: 'esha' }), c('shan', { id: 'ered', suit: 'heart', color: 'red' })];
  game.enemy.skillPreferences.dying = 'ask';
  Engine.playCard(game, 'player', 'pj');
  // 决斗: enemy 出杀 → 玩家无杀 → 玩家 hp 0 濒死 → 玩家无救援牌 →
  // 轮到 enemy (ask, 急救红牌可用) 暂停
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'dying-rescue');
  assert.equal(game.pendingChoice.actor, 'enemy');
  assert.deepEqual(game.pendingChoice.jijiuIds, ['ered']);

  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'ered' }));
  assert.equal(game.player.hp, 2, '急救视为桃 → 1 + 救援加成 1');
  assert.equal(game.pauseState.dying, null, '脱离濒死');
  assert.ok(game.log.some((l) => l.includes('【急救】')), '有急救日志');
  assert.ok(game.log.some((l) => l.includes('【救援】')), '有救援日志');
});

test('救援 濒死 反例: 华佗(群)【急救】救孙权 → 只回复 1', () => {
  const game = buildGame({ enemyHero: 'huatuo' });
  game.turn = 'player';
  game.player.hp = 1;
  game.player.hand = [c('juedou', { id: 'pj' })];
  game.enemy.hand = [c('sha', { id: 'esha' }), c('shan', { id: 'ered', suit: 'heart', color: 'red' })];
  game.enemy.skillPreferences.dying = 'ask';
  Engine.playCard(game, 'player', 'pj');
  Engine.resolvePendingChoice(game, { cardId: 'ered' });
  assert.equal(game.player.hp, 1, '群势力 → 无加成');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
