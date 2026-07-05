import assert from 'node:assert/strict';
import { Engine, CardRuntime } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

// v11 A2: moveCard 原语行为测试 — 区域定位/移出/放入/移动的单一受控出口。

const { findCardZone, takeCard, putCard, moveCard } = CardRuntime;

function c(type, overrides) {
  return Engine.makeTestCard(type, overrides);
}

function buildGame() {
  const game = Engine.newGame({ seed: 11, startWithFirstTurn: true, playerHero: 'liubei', enemyHero: 'caocao' });
  game.phase = 'play';
  game.turn = 'player';
  game.deck = [c('shan', { id: 'deck-bottom' }), c('sha', { id: 'deck-top' })];
  game.discard = [c('tao', { id: 'in-discard' })];
  game.player.hand = [c('sha', { id: 'p-hand-1' }), c('shan', { id: 'p-hand-2' })];
  game.enemy.hand = [c('tao', { id: 'e-hand-1' })];
  game.player.equipment.weapon = c('zhangba', { id: 'p-weapon', slot: 'weapon' });
  game.enemy.judgeArea = [c('lebusishu', { id: 'e-judge-1' })];
  return game;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('findCardZone: 定位 deck/discard/hand/equipment/judgeArea, 在途返回 null', () => {
  const game = buildGame();
  assert.deepEqual(findCardZone(game, 'deck-top'), { zone: 'deck' });
  assert.deepEqual(findCardZone(game, 'in-discard'), { zone: 'discard' });
  assert.deepEqual(findCardZone(game, 'p-hand-1'), { zone: 'hand', actor: 'player' });
  assert.deepEqual(findCardZone(game, 'p-weapon'), { zone: 'equipment', actor: 'player', slot: 'weapon' });
  assert.deepEqual(findCardZone(game, 'e-judge-1'), { zone: 'judgeArea', actor: 'enemy' });
  assert.equal(findCardZone(game, 'nowhere-card'), null);
});

test('takeCard: 按 ID 从各区域移出; card=null 取牌堆顶', () => {
  const game = buildGame();
  const fromHand = takeCard(game, 'p-hand-2', { zone: 'hand', actor: 'player' });
  assert.equal(fromHand.id, 'p-hand-2');
  assert.equal(game.player.hand.length, 1);

  const top = takeCard(game, null, { zone: 'deck' });
  assert.equal(top.id, 'deck-top', 'deck 尾部是牌堆顶');
  const bottom = takeCard(game, null, { zone: 'deck', position: 'bottom' });
  assert.equal(bottom.id, 'deck-bottom');

  const weapon = takeCard(game, 'p-weapon', { zone: 'equipment', actor: 'player', slot: 'weapon' });
  assert.equal(weapon.id, 'p-weapon');
  assert.equal(game.player.equipment.weapon, null);

  assert.equal(takeCard(game, 'missing', { zone: 'hand', actor: 'player' }), null, '不在区域返回 null');
  assert.equal(takeCard(game, 'p-hand-1', { zone: 'equipment', actor: 'player', slot: 'weapon' }), null, '槽位空返回 null');
});

test('putCard: 入手牌(含 index)/装备/判定区/牌堆底; 虚拟牌抛错', () => {
  const game = buildGame();
  const gained = c('wuxie', { id: 'gained-1' });
  putCard(game, gained, { zone: 'hand', actor: 'enemy' });
  assert.equal(game.enemy.hand[game.enemy.hand.length - 1].id, 'gained-1');

  const restored = c('shan', { id: 'restored-at-0' });
  putCard(game, restored, { zone: 'hand', actor: 'player', index: 0 });
  assert.equal(game.player.hand[0].id, 'restored-at-0', 'index 指定插入位置');

  putCard(game, c('bagua', { id: 'new-armor', slot: 'armor' }), { zone: 'equipment', actor: 'enemy', slot: 'armor' });
  assert.equal(game.enemy.equipment.armor.id, 'new-armor');

  putCard(game, c('shandian', { id: 'judge-new' }), { zone: 'judgeArea', actor: 'player' });
  assert.equal(game.player.judgeArea[0].id, 'judge-new');

  putCard(game, c('sha', { id: 'deck-under' }), { zone: 'deck', position: 'bottom' });
  assert.equal(game.deck[0].id, 'deck-under', '牌堆底是数组头部');

  assert.throws(() => putCard(game, { id: 'virt', type: 'sha', suit: 'spade', virtual: true }, { zone: 'discard' }),
    /虚拟牌/, '虚拟牌不能进入区域');
});

test('moveCard: from 显式/自动定位均守恒; 目标不存在返回 null', () => {
  const game = buildGame();
  assertCardConservation(game, () => {
    const moved = moveCard(game, 'p-hand-1', { zone: 'hand', actor: 'player' }, { zone: 'discard' });
    assert.equal(moved.id, 'p-hand-1');
  }, '显式 from 移动');
  assertCardConservation(game, () => {
    const auto = moveCard(game, 'in-discard', null, { zone: 'hand', actor: 'enemy' });
    assert.equal(auto.id, 'in-discard', 'from=null 自动定位');
  }, '自动定位移动');
  assert.equal(moveCard(game, 'nowhere-card', null, { zone: 'discard' }), null);
});

test('moveCard: 装备区↔手牌 (借刀夺武器语义) 守恒', () => {
  const game = buildGame();
  assertCardConservation(game, () => {
    const weapon = moveCard(game, 'p-weapon',
      { zone: 'equipment', actor: 'player', slot: 'weapon' },
      { zone: 'hand', actor: 'enemy' });
    assert.equal(weapon.id, 'p-weapon');
    assert.equal(game.player.equipment.weapon, null);
    assert.ok(game.enemy.hand.some((x) => x.id === 'p-weapon'));
  }, '装备转移');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
