// v11 C2 (批次 26): 连营 (陆逊) — 失去最后一张手牌后摸一张牌。
// 底座是统一手牌失去事件: takeCard/removeCardFromHand 等手牌出口在牌上打
// 在途标记, putCard 落位时结算 (回到同一人手牌 = 在途还原, 不触发)。
// 覆盖: 出牌 / 响应 (窄签名 splice 出口) / 装备 / 被拆 / 濒死自救 各类
// 失去路径 + 在途还原与非最后一张等负例。
import assert from 'node:assert/strict';
import { Engine, CardRuntime } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function buildGame(opts) {
  opts = opts || {};
  const game = Engine.newGame({ seed: opts.seed || 26001, playerHero: opts.playerHero || 'luxun', enemyHero: opts.enemyHero || 'lvmeng' });
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

function lianyingLogs(game) {
  return game.log.filter((l) => l.includes('【连营】'));
}

// ───── 各类失去路径 ─────────────────────────────────────────────────

test('连营 出牌: 使用最后一张手牌 (杀) → 摸一张', () => {
  const game = buildGame();
  game.player.hand = [c('sha', { id: 'last-sha' })];
  game.deck = [c('tao', { id: 'draw1' })];
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'player', 'last-sha');
    assert.equal(r.ok, true);
  });
  assert.equal(lianyingLogs(game).length, 1, '连营触发一次');
  assert.deepEqual(game.player.hand.map((x) => x.id), ['draw1'], '摸回一张');
});

test('连营 响应: 自动打出最后一张闪 (窄签名 splice 出口) → 摸一张', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'esha' })];
  game.player.hand = [c('shan', { id: 'last-shan' })];
  game.deck = [c('tao', { id: 'draw1' })];
  const hp = game.player.hp;
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'esha'));
  assert.equal(game.player.hp, hp, '闪避成功');
  assert.equal(lianyingLogs(game).length, 1);
  assert.deepEqual(game.player.hand.map((x) => x.id), ['draw1']);
});

test('连营 装备: 装备最后一张手牌 → 摸一张', () => {
  const game = buildGame();
  game.player.hand = [c('bagua', { id: 'last-bagua' })];
  game.deck = [c('tao', { id: 'draw1' })];
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'player', 'last-bagua');
    assert.equal(r.ok, true);
  });
  assert.equal(game.player.equipment.armor.id, 'last-bagua');
  assert.equal(lianyingLogs(game).length, 1);
  assert.deepEqual(game.player.hand.map((x) => x.id), ['draw1']);
});

test('连营 被拆: 过河拆桥弃掉最后一张手牌 → 摸一张', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('guohe', { id: 'eguohe' })];
  game.player.hand = [c('sha', { id: 'last-card' })];
  game.deck = [c('tao', { id: 'draw1' })];
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'enemy', 'eguohe');
    assert.equal(r.ok, true);
  });
  assert.ok(game.discard.some((x) => x.id === 'last-card'), '手牌被弃');
  assert.equal(lianyingLogs(game).length, 1);
  assert.deepEqual(game.player.hand.map((x) => x.id), ['draw1']);
});

test('连营 濒死: 自救用掉最后一张桃 → 脱离濒死并摸一张', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.player.hp = 1;
  game.player.hand = [c('tao', { id: 'last-tao' })];
  game.player.skillPreferences.dying = 'auto';
  game.enemy.hand = [c('sha', { id: 'esha' })];
  game.deck = [c('tao', { id: 'draw1' })];
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'esha'));
  assert.equal(game.phase, 'play', '未 game-over');
  assert.equal(game.player.hp, 1, '桃自救回到 1');
  assert.equal(lianyingLogs(game).length, 1);
  assert.deepEqual(game.player.hand.map((x) => x.id), ['draw1']);
});

test('连营 连锁: 摸回的牌再次失去 → 再次触发 (unlimited)', () => {
  const game = buildGame();
  game.player.hand = [c('bagua', { id: 'last-bagua' })];
  game.deck = [c('tao', { id: 'draw2' }), c('sha', { id: 'draw1' })]; // pop 先取 draw1
  Engine.playCard(game, 'player', 'last-bagua');
  assert.deepEqual(game.player.hand.map((x) => x.id), ['draw1']);
  const r = Engine.playCard(game, 'player', 'draw1');
  assert.equal(r.ok, true);
  assert.equal(lianyingLogs(game).length, 2, '两次失去最后手牌 → 各触发一次');
  assert.deepEqual(game.player.hand.map((x) => x.id), ['draw2']);
});

test('连营 敌方侧: AI 陆逊响应掉最后一张闪 → AI 摸一张', () => {
  const game = buildGame({ playerHero: 'liubei', enemyHero: 'luxun' });
  game.player.hand = [c('sha', { id: 'psha' })];
  game.enemy.hand = [c('shan', { id: 'elast-shan' })];
  game.deck = [c('tao', { id: 'draw1' })];
  const hp = game.enemy.hp;
  Engine.playCard(game, 'player', 'psha');
  assert.equal(game.enemy.hp, hp, 'AI 闪避成功');
  assert.equal(lianyingLogs(game).length, 1);
  assert.deepEqual(game.enemy.hand.map((x) => x.id), ['draw1']);
});

// ───── 负例 ─────────────────────────────────────────────────────────

test('负例 在途还原: 火攻同花色不符退回手牌 → 不触发连营', () => {
  const game = buildGame();
  game.player.hand = [
    c('huogong', { id: 'phuogong' }),
    c('shan', { id: 'spade-cost', suit: 'spade', color: 'black' })
  ];
  game.enemy.hand = [c('tao', { id: 'revealed-heart', suit: 'heart', color: 'red' })];
  game.deck = [c('tao', { id: 'draw1' })];
  const r = Engine.playCard(game, 'player', 'phuogong', { huogongCostCardId: 'spade-cost' });
  assert.equal(r.ok, false, '花色不符被拒绝');
  assert.ok(game.player.hand.some((x) => x.id === 'spade-cost'), '弃牌成本退回手牌');
  assert.ok(game.player.hand.some((x) => x.id === 'phuogong'), '火攻未消耗');
  assert.equal(lianyingLogs(game).length, 0, '在途还原不算失去');
  assert.equal(game.deck.length, 1, '未摸牌');
});

test('负例 非最后一张: 还有手牌剩余 → 不触发', () => {
  const game = buildGame();
  game.player.hand = [c('sha', { id: 'sha1' }), c('sha', { id: 'keep' })];
  game.deck = [c('tao', { id: 'draw1' })];
  Engine.playCard(game, 'player', 'sha1');
  assert.equal(lianyingLogs(game).length, 0);
  assert.deepEqual(game.player.hand.map((x) => x.id), ['keep']);
});

test('负例 非陆逊: 无连营技能 → 不触发', () => {
  const game = buildGame({ playerHero: 'liubei' });
  game.player.hand = [c('sha', { id: 'last-sha' })];
  game.deck = [c('tao', { id: 'draw1' })];
  Engine.playCard(game, 'player', 'last-sha');
  assert.equal(lianyingLogs(game).length, 0);
  assert.equal(game.player.hand.length, 0, '不摸牌');
});

test('负例 decline: skillPreferences.lianying=decline → 不触发', () => {
  const game = buildGame();
  game.player.skillPreferences.lianying = 'decline';
  game.player.hand = [c('sha', { id: 'last-sha' })];
  game.deck = [c('tao', { id: 'draw1' })];
  Engine.playCard(game, 'player', 'last-sha');
  assert.equal(lianyingLogs(game).length, 0);
  assert.equal(game.player.hand.length, 0, '不摸牌');
});

test('负例 牌堆+弃牌堆全空: 触发但摸不到牌, 不崩溃', () => {
  const game = buildGame();
  game.player.hand = [c('bagua', { id: 'last-bagua' })];
  game.deck = [];
  const r = Engine.playCard(game, 'player', 'last-bagua');
  assert.equal(r.ok, true);
  assert.equal(game.player.hand.length, 0, '无牌可摸');
});

// ───── 架构守护: 在途标记必须不可枚举 ───────────────────────────────
// _handOrigin 指向持有者 state, 若可枚举会让 AI lookahead 的 JSON 深克隆
// 变成循环引用直接崩溃 (且守恒 census 深扫可能双重计数)。这里固定住该约束。

test('守护: _handOrigin 在途标记不可枚举, JSON 克隆安全', () => {
  const game = buildGame();
  const card = c('sha', { id: 'flight-sha' });
  game.player.hand = [card, c('shan', { id: 'stay' })];
  const taken = CardRuntime.takeCard(game, 'flight-sha', { zone: 'hand', actor: 'player' });
  assert.equal(taken._handOrigin, game.player, '在途标记指向原持有者');
  assert.ok(!Object.keys(taken).includes('_handOrigin'), '标记不可枚举');
  assert.ok(!JSON.stringify(taken).includes('_handOrigin'), 'JSON 序列化不含标记');
  // 牌在途 (挂在 pauseState 上) 时整局 JSON 克隆不得抛循环引用
  game.pauseState.probe = { card: taken };
  assert.doesNotThrow(() => JSON.stringify(game));
  // 收尾: 放回手牌 (在途还原), 标记清除
  delete game.pauseState.probe;
  CardRuntime.putCard(game, taken, { zone: 'hand', actor: 'player' });
  assert.equal(taken._handOrigin, undefined, '落位后标记清除');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
