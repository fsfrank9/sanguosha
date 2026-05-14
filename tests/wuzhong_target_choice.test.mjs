import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function makeGame() {
  const game = Engine.newGame({ seed: 93, startWithFirstTurn: true });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  game.deck = [
    { id: 'd-1', type: 'sha', name: '杀', suit: 'spade', color: 'black' },
    { id: 'd-2', type: 'sha', name: '杀', suit: 'spade', color: 'black' },
    { id: 'd-3', type: 'sha', name: '杀', suit: 'spade', color: 'black' },
    { id: 'd-4', type: 'sha', name: '杀', suit: 'spade', color: 'black' }
  ];
  return game;
}

function dealWuzhong(state, id) {
  const card = { id, type: 'wuzhong', name: '无中生有', family: 'trick', suit: 'heart', color: 'red' };
  state.hand.push(card);
  return card;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v7 PR-16: 无目标参数 → 默认 actor 摸 2 (旧行为)', () => {
  const game = makeGame();
  dealWuzhong(game.player, 'wz-default');
  const result = Engine.playCard(game, 'player', 'wz-default');
  assert.equal(result.ok, true);
  assert.equal(game.player.hand.length, 2, 'player 摸 2');
  assert.equal(game.enemy.hand.length, 0, 'enemy 不变');
});

test('v7 PR-16: options.wuzhongTarget="player" → 显式 self', () => {
  const game = makeGame();
  dealWuzhong(game.player, 'wz-self');
  Engine.playCard(game, 'player', 'wz-self', { wuzhongTarget: 'player' });
  assert.equal(game.player.hand.length, 2);
  assert.equal(game.enemy.hand.length, 0);
});

test('v7 PR-16: options.wuzhongTarget="enemy" → 对手摸 2 (spec: 包括你在内的一名角色)', () => {
  const game = makeGame();
  dealWuzhong(game.player, 'wz-foe');
  Engine.playCard(game, 'player', 'wz-foe', { wuzhongTarget: 'enemy' });
  assert.equal(game.enemy.hand.length, 2, '对手摸 2');
  assert.equal(game.player.hand.length, 0, 'player 不变');
});

test('v7 PR-16: options.wuzhongTarget 无效值 → 默认回退到 actor', () => {
  const game = makeGame();
  dealWuzhong(game.player, 'wz-invalid');
  Engine.playCard(game, 'player', 'wz-invalid', { wuzhongTarget: 'random-string' });
  // 无效值 → 默认 actor
  assert.equal(game.player.hand.length, 2);
  assert.equal(game.enemy.hand.length, 0);
});

test('v7 PR-16: enemy 自己回合也能用 wuzhongTarget 给 player（仅 API 合规）', () => {
  const game = makeGame();
  game.turn = 'enemy';
  dealWuzhong(game.enemy, 'wz-enemy-gives');
  Engine.playCard(game, 'enemy', 'wz-enemy-gives', { wuzhongTarget: 'player' });
  assert.equal(game.player.hand.length, 2, 'player 收到 2');
  assert.equal(game.enemy.hand.length, 0, 'enemy 不摸');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
