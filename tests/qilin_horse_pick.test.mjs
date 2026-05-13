import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function makeGame(opts) {
  const game = Engine.newGame({ seed: 73, startWithFirstTurn: true, ...(opts || {}) });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  // Equip qilin so 杀 命中 triggers it.
  game.player.equipment.weapon = { id: 'qilin-w', type: 'qilin', name: '麒麟弓', family: 'equipment', slot: 'weapon', range: 5 };
  return game;
}

function dealSha(state, id) {
  const card = { id, type: 'sha', name: '杀', suit: 'spade', color: 'black' };
  state.hand.push(card);
  return card;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v7 PR-3: 麒麟弓 不触发 when target has 0 horses', () => {
  const game = makeGame();
  dealSha(game.player, 's0');
  Engine.playCard(game, 'player', 's0');
  assert.equal(game.enemy.equipment.horseMinus, null);
  assert.equal(game.enemy.equipment.horsePlus, null);
  assert.equal(game.pendingChoice, null);
});

test('v7 PR-3: 麒麟弓 single horseMinus → 自动弃 (no choice)', () => {
  const game = makeGame();
  game.enemy.equipment.horseMinus = { id: 'mh', type: 'minus_horse', name: '-1 马', family: 'equipment', slot: 'horseMinus' };
  dealSha(game.player, 's1');
  Engine.playCard(game, 'player', 's1');
  assert.equal(game.enemy.equipment.horseMinus, null, '-1 马 已被弃置');
  assert.ok(game.discard.some((c) => c.id === 'mh'), '弃牌堆里有该坐骑');
  assert.equal(game.pendingChoice, null, '不需要 pendingChoice');
});

test('v7 PR-3: 麒麟弓 single horsePlus → 自动弃 (no choice)', () => {
  const game = makeGame();
  game.enemy.equipment.horsePlus = { id: 'ph', type: 'plus_horse', name: '+1 马', family: 'equipment', slot: 'horsePlus' };
  dealSha(game.player, 's1b');
  Engine.playCard(game, 'player', 's1b');
  assert.equal(game.enemy.equipment.horsePlus, null);
  assert.ok(game.discard.some((c) => c.id === 'ph'));
});

test('v7 PR-3: 麒麟弓 TWO horses + source pref=auto → 自动弃 +1 马 (NOT both)', () => {
  const game = makeGame();
  game.player.skillPreferences.qilin = 'auto';
  game.enemy.equipment.horseMinus = { id: 'mh2', type: 'minus_horse', name: '-1 马', family: 'equipment', slot: 'horseMinus' };
  game.enemy.equipment.horsePlus = { id: 'ph2', type: 'plus_horse', name: '+1 马', family: 'equipment', slot: 'horsePlus' };
  dealSha(game.player, 's2');
  Engine.playCard(game, 'player', 's2');
  assert.equal(game.enemy.equipment.horsePlus, null, '+1 马 被弃');
  assert.ok(game.enemy.equipment.horseMinus, '-1 马 仍在装备区（spec: 弃一张，不是两张）');
});

test('v7 PR-3: 麒麟弓 TWO horses + source pref=ask → pendingChoice "qilin-pick"', () => {
  const game = makeGame();
  game.player.skillPreferences.qilin = 'ask';
  game.enemy.equipment.horseMinus = { id: 'mh3', type: 'minus_horse', name: '-1 马', family: 'equipment', slot: 'horseMinus' };
  game.enemy.equipment.horsePlus = { id: 'ph3', type: 'plus_horse', name: '+1 马', family: 'equipment', slot: 'horsePlus' };
  dealSha(game.player, 's3');
  Engine.playCard(game, 'player', 's3');
  assert.ok(game.pendingChoice, 'qilin-pick 应当 pause');
  assert.equal(game.pendingChoice.kind, 'qilin-pick');
  assert.equal(game.pendingChoice.actor, 'player');
  assert.equal(game.pendingChoice.target, 'enemy');
  assert.deepEqual(game.pendingChoice.horseSlots.sort(), ['horseMinus', 'horsePlus']);
  // both horses still on the target until user resolves
  assert.ok(game.enemy.equipment.horseMinus);
  assert.ok(game.enemy.equipment.horsePlus);
});

test('v7 PR-3: resolvePendingChoice {slot:"horseMinus"} discards -1 马', () => {
  const game = makeGame();
  game.player.skillPreferences.qilin = 'ask';
  game.enemy.equipment.horseMinus = { id: 'mh4', type: 'minus_horse', name: '-1 马', family: 'equipment', slot: 'horseMinus' };
  game.enemy.equipment.horsePlus = { id: 'ph4', type: 'plus_horse', name: '+1 马', family: 'equipment', slot: 'horsePlus' };
  dealSha(game.player, 's4');
  Engine.playCard(game, 'player', 's4');
  const result = Engine.resolvePendingChoice(game, { slot: 'horseMinus' });
  assert.equal(result.ok, true);
  assert.equal(game.enemy.equipment.horseMinus, null);
  assert.ok(game.enemy.equipment.horsePlus, '+1 马 保留');
  assert.equal(game.pendingChoice, null);
});

test('v7 PR-3: resolvePendingChoice {decline:true} fires no discard', () => {
  const game = makeGame();
  game.player.skillPreferences.qilin = 'ask';
  game.enemy.equipment.horseMinus = { id: 'mh5', type: 'minus_horse', name: '-1 马', family: 'equipment', slot: 'horseMinus' };
  game.enemy.equipment.horsePlus = { id: 'ph5', type: 'plus_horse', name: '+1 马', family: 'equipment', slot: 'horsePlus' };
  dealSha(game.player, 's5');
  Engine.playCard(game, 'player', 's5');
  const result = Engine.resolvePendingChoice(game, { decline: true });
  assert.equal(result.ok, true);
  assert.ok(game.enemy.equipment.horseMinus, '-1 马 保留');
  assert.ok(game.enemy.equipment.horsePlus, '+1 马 保留');
  assert.equal(game.pendingChoice, null);
});

test('v7 PR-3: skillPreferences.qilin="decline" 永不触发 (即使单匹马也保留)', () => {
  const game = makeGame();
  game.player.skillPreferences.qilin = 'decline';
  game.enemy.equipment.horsePlus = { id: 'ph6', type: 'plus_horse', name: '+1 马', family: 'equipment', slot: 'horsePlus' };
  dealSha(game.player, 's6');
  Engine.playCard(game, 'player', 's6');
  assert.ok(game.enemy.equipment.horsePlus, 'decline 模式下 1 匹马也保留');
  assert.equal(game.pendingChoice, null);
});

test('v7 PR-3: AI (enemy) 默认 auto-fire — 不暂停', () => {
  const game = makeGame();
  game.turn = 'enemy';
  game.enemy.equipment.weapon = { id: 'qilin-enemy', type: 'qilin', name: '麒麟弓', family: 'equipment', slot: 'weapon', range: 5 };
  game.player.equipment.weapon = null;
  game.player.equipment.horseMinus = { id: 'p-mh', type: 'minus_horse', name: '-1 马', family: 'equipment', slot: 'horseMinus' };
  game.player.equipment.horsePlus = { id: 'p-ph', type: 'plus_horse', name: '+1 马', family: 'equipment', slot: 'horsePlus' };
  dealSha(game.enemy, 'enemy-sha');
  Engine.playCard(game, 'enemy', 'enemy-sha');
  assert.equal(game.player.equipment.horsePlus, null, 'AI auto 默认弃 +1 马');
  assert.ok(game.player.equipment.horseMinus, '-1 马 保留');
  assert.equal(game.pendingChoice, null);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
