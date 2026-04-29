import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const htmlPath = path.resolve(import.meta.dirname, '../index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script id="game-engine"[^>]*>([\s\S]*?)<\/script>/);
assert.ok(match, 'index.html should contain <script id="game-engine">');

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox, { filename: 'game-engine.js' });
const Engine = sandbox.window.SanguoshaEngine;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

test('engine exposes formal phase APIs and phase order', () => {
  assert.deepEqual(Array.from(Engine.PHASES), ['prepare', 'judge', 'draw', 'play', 'discard', 'finish']);
  for (const fn of ['startTurn', 'advancePhase', 'finishPlayPhase', 'discardExcess', 'handLimit']) {
    assert.equal(typeof Engine[fn], 'function', `${fn} should be exported`);
  }
});

test('startTurn processes prepare judge draw then enters play', () => {
  const game = Engine.newGame({ seed: 201, playerHero: 'zhouyu', enemyHero: 'caocao' });
  game.player.hand = [];
  game.deck = [
    c('sha', { id: 'draw-1' }),
    c('shan', { id: 'draw-2' }),
    c('tao', { id: 'draw-3' })
  ];
  Engine.startTurn(game, 'player');
  assert.equal(game.turn, 'player');
  assert.equal(game.phase, 'play');
  assert.equal(game.player.hand.length, 3, '英姿 should draw 3 during draw phase');
  assert.ok(game.turnHistory.some(item => item.actor === 'player' && item.phase === 'draw'));
});

test('lebusishu skips play and leaves actor in discard phase after draw', () => {
  const game = Engine.newGame({ seed: 202, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.judgeArea = [c('lebusishu', { id: 'lebu' })];
  game.player.hand = [];
  game.deck = [
    c('sha', { id: 'draw-a' }),
    c('shan', { id: 'draw-b' }),
    c('sha', { id: 'judge-spade', suit: 'spade', color: 'black', rank: '9' })
  ];
  Engine.startTurn(game, 'player');
  assert.equal(game.player.flags.skipPlay, true);
  assert.equal(game.phase, 'discard');
  assert.equal(game.player.hand.length, 2, 'still draws before discard unless skipDraw');
});

test('bingliang skips draw but still enters play when play is not skipped', () => {
  const game = Engine.newGame({ seed: 203, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.judgeArea = [c('bingliang', { id: 'bing' })];
  game.player.hand = [];
  game.deck = [c('sha', { id: 'judge-heart', suit: 'heart', color: 'red', rank: '5' })];
  Engine.startTurn(game, 'player');
  assert.equal(game.player.flags.skipDraw, true);
  assert.equal(game.phase, 'play');
  assert.equal(game.player.hand.length, 0);
});

test('finishPlayPhase moves to discard and discardExcess enforces hp hand limit', () => {
  const game = Engine.newGame({ seed: 204, playerHero: 'liubei', enemyHero: 'caocao' });
  game.turn = 'player';
  game.phase = 'play';
  game.player.hp = 2;
  game.player.hand = [
    c('sha', { id: 'a' }), c('shan', { id: 'b' }), c('tao', { id: 'c' }), c('jiu', { id: 'd' })
  ];
  assert.equal(Engine.handLimit(game, 'player'), 2);
  Engine.finishPlayPhase(game);
  assert.equal(game.phase, 'discard');
  const result = Engine.discardExcess(game, 'player', ['a', 'b']);
  assert.equal(result.ok, true);
  assert.equal(game.player.hand.length, 2);
  assert.equal(game.discard.some(card => card.id === 'a'), true);
  assert.equal(game.discard.some(card => card.id === 'b'), true);
});

test('advancePhase goes through finish then starts opponent turn', () => {
  const game = Engine.newGame({ seed: 205, playerHero: 'liubei', enemyHero: 'caocao' });
  game.turn = 'player';
  game.phase = 'discard';
  game.player.hand = [];
  Engine.advancePhase(game);
  assert.equal(game.phase, 'finish');
  Engine.advancePhase(game);
  assert.equal(game.turn, 'enemy');
  assert.ok(['play', 'discard'].includes(game.phase));
});

console.log('\nPhase tests passed.');
