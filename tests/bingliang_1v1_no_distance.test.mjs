import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function makeGame() {
  const game = Engine.newGame({ seed: 81, startWithFirstTurn: true });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

function dealBingliang(state, id) {
  const card = { id, type: 'bingliang', name: '兵粮寸断', family: 'delayed', suit: 'spade', color: 'black' };
  state.hand.push(card);
  return card;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v7 PR-11: 兵粮 (1V1) 在 distance=2 时仍可用 (+1 马 不再阻挡)', () => {
  const game = makeGame();
  game.enemy.equipment.horsePlus = { id: 'foe-plus', type: 'plus_horse', name: '+1 马', family: 'equipment', slot: 'horsePlus' };
  const card = dealBingliang(game.player, 'bl-d2');
  assert.equal(Engine.distanceBetween(game, 'player', 'enemy'), 2);
  const preview = Engine.canPlayCard(game, 'player', card);
  assert.equal(preview.ok, true, '1V1 兵粮 不再受距离 1 限制');
});

test('v7 PR-11: 兵粮 (1V1) 在 distance=3 时仍可用', () => {
  const game = makeGame();
  game.enemy.equipment.horsePlus = { id: 'foe-plus-1', type: 'plus_horse', name: '+1 马', family: 'equipment', slot: 'horsePlus' };
  game.player.equipment.horsePlus = { id: 'self-plus', type: 'plus_horse', name: '+1 马', family: 'equipment', slot: 'horsePlus' };
  const card = dealBingliang(game.player, 'bl-d3');
  const preview = Engine.canPlayCard(game, 'player', card);
  assert.equal(preview.ok, true);
});

test('v7 PR-11: 兵粮 (1V1) — 实际放入对手判定区', () => {
  const game = makeGame();
  game.enemy.equipment.horsePlus = { id: 'far-foe', type: 'plus_horse', name: '+1 马', family: 'equipment', slot: 'horsePlus' };
  dealBingliang(game.player, 'bl-play');
  const result = Engine.playCard(game, 'player', 'bl-play');
  assert.equal(result.ok, true);
  assert.equal(game.enemy.judgeArea.length, 1);
  assert.equal(game.enemy.judgeArea[0].id, 'bl-play');
});

test('v7 PR-11: 兵粮 同名禁叠仍然生效 (PR-6 不被破坏)', () => {
  const game = makeGame();
  game.enemy.judgeArea.push({ id: 'bl-existing', type: 'bingliang', name: '兵粮寸断', family: 'delayed', suit: 'spade', color: 'black' });
  const card = dealBingliang(game.player, 'bl-second');
  const preview = Engine.canPlayCard(game, 'player', card);
  assert.equal(preview.ok, false, 'PR-6 同名禁叠仍生效');
  assert.match(preview.message, /已有/);
});

test('v7 PR-11: 兵粮 判定为梅花 → 不跳过摸牌阶段 (回归 spec 正常路径)', () => {
  const game = makeGame();
  dealBingliang(game.player, 'bl-judge-club');
  Engine.playCard(game, 'player', 'bl-judge-club');
  // top of deck → club → 不跳过
  game.deck = [{ id: 'club-judge', type: 'sha', name: '杀', suit: 'club', color: 'black', rank: '5' }];
  game.turn = 'enemy';
  // start enemy turn → judge phase
  Engine.startTurn(game, 'enemy');
  // 判定后 spec 正常路径 — 这里仅验证 game.enemy.flags.skipDraw 仍 false 即可
  assert.notEqual(game.enemy.flags && game.enemy.flags.skipDraw, true,
    'club 判定 → 兵粮 不跳过摸牌');
});

test('v7 PR-11: 兵粮 判定不为梅花 → 跳过摸牌阶段', () => {
  const game = makeGame();
  dealBingliang(game.player, 'bl-judge-spade');
  Engine.playCard(game, 'player', 'bl-judge-spade');
  game.deck = [{ id: 'spade-judge', type: 'sha', name: '杀', suit: 'spade', color: 'black', rank: '7' }];
  game.turn = 'enemy';
  Engine.startTurn(game, 'enemy');
  assert.equal(game.enemy.flags && game.enemy.flags.skipDraw, true,
    '非 club 判定 → 跳过对手摸牌');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
