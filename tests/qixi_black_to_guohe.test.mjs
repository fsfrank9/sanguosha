// v11 C3 (批次 27): 奇袭 (甘宁) — 出牌阶段可将一张黑色牌当【过河拆桥】使用。
// card-as 框架从 杀/乐不思蜀 泛化到 guohe: playCardAs(game, actor, cardId,
// 'guohe', options?) 构造虚拟拆 → 先弃来源实体牌 → 无懈链 → 1v1 两选项结算。
// 覆盖: 黑色手牌/装备来源、ask/auto/显式 targetZone 三种结算、无懈抵消、
// 反例 (红色牌 / 非甘宁 / 对方两区皆空) 与实体牌落弃牌堆守恒。
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
  const game = Engine.newGame({ seed: opts.seed || 27001, playerHero: opts.playerHero || 'ganning', enemyHero: opts.enemyHero || 'lvmeng' });
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

// ───── 基本流程 ─────────────────────────────────────────────────────

test('奇袭 auto: 黑色手牌当拆, 弃掉对方装备 (装备优先)', () => {
  const game = buildGame();
  game.player.skillPreferences.guohe = 'auto';
  game.player.hand = [c('sha', { id: 'black-sha', suit: 'spade', color: 'black' })];
  game.enemy.equipment.weapon = c('qinggang', { id: 'e-wpn' });
  assertCardConservation(game, () => {
    const r = Engine.playCardAs(game, 'player', 'black-sha', 'guohe');
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.enemy.equipment.weapon, null, '对方武器被拆');
  assert.ok(game.discard.some((x) => x.id === 'e-wpn'), '被拆装备进弃牌堆');
  assert.ok(game.discard.some((x) => x.id === 'black-sha' && x.type === 'sha'),
    '来源牌以原实体身份进弃牌堆 (无 guohe 型幻影)');
  assert.ok(game.log.some((l) => l.includes('【奇袭】')), '有奇袭日志');
});

test('奇袭 显式 targetZone: 指定弃对方手牌', () => {
  const game = buildGame();
  game.player.hand = [c('shan', { id: 'black-shan', suit: 'club', color: 'black' })];
  game.enemy.hand = [c('tao', { id: 'e-tao' })];
  assertCardConservation(game, () => {
    const r = Engine.playCardAs(game, 'player', 'black-shan', 'guohe', { targetZone: 'hand', targetCardId: 'e-tao' });
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.enemy.hand.length, 0, '对方手牌被弃');
  assert.ok(game.discard.some((x) => x.id === 'e-tao'));
});

test('奇袭 ask: 玩家发动后走 guohe-1v1-pick pendingChoice', () => {
  const game = buildGame();
  // player 默认 pref 即 ask
  game.player.hand = [c('sha', { id: 'black-sha', suit: 'spade', color: 'black' })];
  game.enemy.hand = [c('tao', { id: 'e-tao' })];
  const r = Engine.playCardAs(game, 'player', 'black-sha', 'guohe');
  assert.equal(r.ok, true, r.message);
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'guohe-1v1-pick');
  const r2 = Engine.resolvePendingChoice(game, { zone: 'hand', cardId: 'e-tao' });
  assert.equal(r2.ok, true, r2.message);
  assert.equal(game.enemy.hand.length, 0);
  assert.ok(game.discard.some((x) => x.id === 'e-tao'));
});

test('奇袭 装备来源: 黑色装备牌可当拆 (与武圣同口径)', () => {
  const game = buildGame();
  game.player.skillPreferences.guohe = 'auto';
  game.player.equipment.weapon = c('qinggang', { id: 'my-black-wpn', suit: 'spade', color: 'black' });
  game.enemy.hand = [c('tao', { id: 'e-tao' })];
  assertCardConservation(game, () => {
    const r = Engine.playCardAs(game, 'player', 'my-black-wpn', 'guohe');
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.player.equipment.weapon, null, '来源装备离开装备区');
  assert.ok(game.discard.some((x) => x.id === 'my-black-wpn'));
  assert.equal(game.enemy.hand.length, 0, '对方手牌被弃');
});

test('奇袭 被无懈: 来源牌照弃, 对方牌无损', () => {
  const game = buildGame();
  game.player.skillPreferences.guohe = 'auto';
  game.player.hand = [c('sha', { id: 'black-sha', suit: 'spade', color: 'black' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wuxie' }), c('tao', { id: 'e-tao' })];
  assertCardConservation(game, () => {
    const r = Engine.playCardAs(game, 'player', 'black-sha', 'guohe');
    assert.equal(r.ok, true, r.message);
  });
  assert.ok(game.discard.some((x) => x.id === 'black-sha'), '来源牌已弃');
  assert.ok(game.discard.some((x) => x.id === 'e-wuxie'), '无懈已打出');
  assert.deepEqual(game.enemy.hand.map((x) => x.id), ['e-tao'], '对方手牌无损');
  assert.ok(game.log.some((l) => l.includes('无懈可击')));
});

// ───── 反例 ─────────────────────────────────────────────────────────

test('反例: 红色牌不能当拆', () => {
  const game = buildGame();
  game.player.hand = [c('sha', { id: 'red-sha', suit: 'heart', color: 'red' })];
  game.enemy.hand = [c('tao', { id: 'e-tao' })];
  const r = Engine.playCardAs(game, 'player', 'red-sha', 'guohe');
  assert.equal(r.ok, false);
  assert.equal(game.player.hand.length, 1, '牌未消耗');
});

test('反例: 非甘宁不能发动奇袭', () => {
  const game = buildGame({ playerHero: 'liubei' });
  game.player.hand = [c('sha', { id: 'black-sha', suit: 'spade', color: 'black' })];
  game.enemy.hand = [c('tao', { id: 'e-tao' })];
  const r = Engine.playCardAs(game, 'player', 'black-sha', 'guohe');
  assert.equal(r.ok, false);
});

test('反例: 对方两区皆空 → 与普通拆一致被拒', () => {
  const game = buildGame();
  game.player.hand = [c('sha', { id: 'black-sha', suit: 'spade', color: 'black' })];
  const r = Engine.playCardAs(game, 'player', 'black-sha', 'guohe');
  assert.equal(r.ok, false);
  assert.equal(game.player.hand.length, 1, '牌未消耗');
});

test('反例: 非出牌回合不能发动', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.player.hand = [c('sha', { id: 'black-sha', suit: 'spade', color: 'black' })];
  game.enemy.hand = [c('tao', { id: 'e-tao' })];
  const r = Engine.playCardAs(game, 'player', 'black-sha', 'guohe');
  assert.equal(r.ok, false);
});

// ───── 回归: 既有转化路径不受 asType 泛化影响 ───────────────────────

test('回归: 未注册的 asType 仍被白名单拒绝', () => {
  const game = buildGame();
  game.player.hand = [c('sha', { id: 'black-sha', suit: 'spade', color: 'black' })];
  const r = Engine.playCardAs(game, 'player', 'black-sha', 'shunshou');
  assert.equal(r.ok, false);
  assert.match(r.message, /只支持/);
});

test('回归: 甘宁的黑牌不能当乐不思蜀 (国色不外溢)', () => {
  const game = buildGame();
  game.player.hand = [c('sha', { id: 'black-sha', suit: 'spade', color: 'black' })];
  const r = Engine.playCardAs(game, 'player', 'black-sha', 'lebusishu');
  assert.equal(r.ok, false);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
