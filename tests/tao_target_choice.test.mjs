import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function makeGame() {
  const game = Engine.newGame({ seed: 71, startWithFirstTurn: true });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

function dealTao(state, id) {
  const card = { id, type: 'tao', name: '桃', suit: 'heart', color: 'red' };
  state.hand.push(card);
  return card;
}

const tests = [];
function test(name, fn) {
  tests.push([name, fn]);
}

test('v7 PR-1: 桃 can be played when self is wounded (target defaults to self)', () => {
  const game = makeGame();
  game.player.hp = game.player.maxHp - 1;
  dealTao(game.player, 'self-wounded');
  assert.equal(Engine.canPlayCard(game, 'player', game.player.hand[0]).ok, true);
  assert.equal(Engine.playCard(game, 'player', 'self-wounded').ok, true);
  assert.equal(game.player.hp, game.player.maxHp);
  assert.equal(game.enemy.hp, game.enemy.maxHp);
});

test('v7 PR-1: 桃 is illegal when BOTH actors are at full HP', () => {
  const game = makeGame();
  dealTao(game.player, 'both-full');
  assert.equal(game.player.hp, game.player.maxHp);
  assert.equal(game.enemy.hp, game.enemy.maxHp);
  const result = Engine.canPlayCard(game, 'player', game.player.hand[0]);
  assert.equal(result.ok, false, 'spec: 包括你在内的一名已受伤的角色 → 无受伤角色时不可使用');
});

test('v7 PR-1: 桃 is legal when self is full but opponent is wounded', () => {
  const game = makeGame();
  game.enemy.hp = game.enemy.maxHp - 2;
  dealTao(game.player, 'foe-wounded');
  assert.equal(Engine.canPlayCard(game, 'player', game.player.hand[0]).ok, true,
    'spec: 对手受伤即满足"包括你在内的一名已受伤的角色"');
});

test('v7 PR-1: options.taoTarget="enemy" heals opponent (not self)', () => {
  const game = makeGame();
  game.enemy.hp = game.enemy.maxHp - 2;
  dealTao(game.player, 'cross-heal');
  const result = Engine.playCard(game, 'player', 'cross-heal', { taoTarget: 'enemy' });
  assert.equal(result.ok, true);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, '对手回复 1 体力');
  assert.equal(game.player.hp, game.player.maxHp, '发动者血量不变');
});

test('v7 PR-1: options.taoTarget="enemy" with full-HP opponent is rejected', () => {
  const game = makeGame();
  game.player.hp = game.player.maxHp - 1; // self is wounded so canPlayCard passes
  dealTao(game.player, 'invalid-cross');
  const result = Engine.playCard(game, 'player', 'invalid-cross', { taoTarget: 'enemy' });
  assert.equal(result.ok, false, 'spec: 目标必须是已受伤角色');
  assert.equal(game.enemy.hp, game.enemy.maxHp);
});

test('v7 PR-1: default falls back to opponent when self is full and opponent wounded', () => {
  const game = makeGame();
  game.enemy.hp = game.enemy.maxHp - 1;
  dealTao(game.player, 'default-fallback');
  const result = Engine.playCard(game, 'player', 'default-fallback');
  assert.equal(result.ok, true);
  assert.equal(game.enemy.hp, game.enemy.maxHp, '默认回退到唯一受伤的对手');
  assert.equal(game.player.hp, game.player.maxHp);
});

for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}
