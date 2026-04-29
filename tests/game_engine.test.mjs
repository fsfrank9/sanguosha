import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const htmlPath = path.resolve(import.meta.dirname, '../index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script id="game-engine"[^>]*>([\s\S]*?)<\/script>/);
assert.ok(match, 'index.html should contain <script id="game-engine"> with the pure game engine');

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox, { filename: 'game-engine.js' });
const Engine = sandbox.window.SanguoshaEngine;
assert.ok(Engine, 'game engine should expose window.SanguoshaEngine');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test('newGame creates player/enemy with hp, hands, deck and player turn', () => {
  const game = Engine.newGame({ seed: 7 });
  assert.equal(game.turn, 'player');
  assert.equal(game.phase, 'play');
  assert.equal(game.player.hp, game.player.maxHp);
  assert.equal(game.enemy.hp, game.enemy.maxHp);
  assert.equal(game.player.hand.length, 4);
  assert.equal(game.enemy.hand.length, 4);
  assert.ok(game.deck.length > 20);
});

test('sha damages enemy when enemy has no shan', () => {
  const game = Engine.newGame({ seed: 1 });
  game.player.hand = [{ id: 'test-sha', type: 'sha', name: '杀' }];
  game.enemy.hand = [];
  const before = game.enemy.hp;
  const result = Engine.playCard(game, 'player', 'test-sha');
  assert.equal(result.ok, true);
  assert.equal(game.enemy.hp, before - 1);
  assert.equal(game.player.usedSha, true);
  assert.equal(game.player.hand.length, 0);
});

test('shan cancels sha damage and is discarded automatically', () => {
  const game = Engine.newGame({ seed: 2 });
  game.player.hand = [{ id: 'test-sha', type: 'sha', name: '杀' }];
  game.enemy.hand = [{ id: 'enemy-shan', type: 'shan', name: '闪' }];
  const before = game.enemy.hp;
  const result = Engine.playCard(game, 'player', 'test-sha');
  assert.equal(result.ok, true);
  assert.equal(game.enemy.hp, before);
  assert.equal(game.enemy.hand.length, 0);
  assert.equal(game.discard.some(card => card.id === 'enemy-shan'), true);
});

test('tao heals but never above max hp', () => {
  const game = Engine.newGame({ seed: 3 });
  game.player.hp = game.player.maxHp - 1;
  game.player.hand = [{ id: 'tao-1', type: 'tao', name: '桃' }, { id: 'tao-2', type: 'tao', name: '桃' }];
  assert.equal(Engine.playCard(game, 'player', 'tao-1').ok, true);
  assert.equal(game.player.hp, game.player.maxHp);
  const second = Engine.playCard(game, 'player', 'tao-2');
  assert.equal(second.ok, false);
  assert.equal(game.player.hp, game.player.maxHp);
});

test('wuzhong draws two cards', () => {
  const game = Engine.newGame({ seed: 4 });
  game.player.hand = [{ id: 'wz', type: 'wuzhong', name: '无中生有' }];
  const deckBefore = game.deck.length;
  const result = Engine.playCard(game, 'player', 'wz');
  assert.equal(result.ok, true);
  assert.equal(game.player.hand.length, 2);
  assert.equal(game.deck.length, deckBefore - 2);
});

test('ending turn switches active side and draws two cards', () => {
  const game = Engine.newGame({ seed: 5 });
  game.enemy.hand = [];
  Engine.endTurn(game);
  assert.equal(game.turn, 'enemy');
  assert.equal(game.phase, 'play');
  assert.equal(game.enemy.hand.length, 2);
});

test('game over is detected when hp reaches zero', () => {
  const game = Engine.newGame({ seed: 6 });
  game.player.hand = [{ id: 'fatal-sha', type: 'sha', name: '杀' }];
  game.enemy.hand = [];
  game.enemy.hp = 1;
  const result = Engine.playCard(game, 'player', 'fatal-sha');
  assert.equal(result.ok, true);
  assert.equal(game.winner, 'player');
  assert.equal(game.phase, 'gameover');
});

console.log('\nAll engine behavior tests passed.');
