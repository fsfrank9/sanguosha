import test from 'node:test';
import assert from 'node:assert/strict';
import { SanguoshaEngine as Engine } from '../src/engine/game-engine.js';

test('v12 H1/H2: StateRuntime exposes seat ring and distance for 3-player identity table', () => {
  const game = Engine.newGame({ seed: 1201, seats: ['player', 'enemy', 'ally'], roles: { player: '主公', enemy: '反贼', ally: '忠臣' } });
  assert.deepEqual(Engine.seatList(game), ['player', 'enemy', 'ally']);
  assert.deepEqual(Engine.aliveSeats(game), ['player', 'enemy', 'ally']);
  assert.equal(Engine.nextSeat(game, 'player'), 'enemy');
  assert.equal(Engine.nextSeat(game, 'ally'), 'player');
  assert.equal(Engine.distanceBetween(game, 'player', 'ally'), 1, '3-player ring uses the shorter arc');
  game.ally.equipment.horsePlus = Engine.makeTestCard('plus_horse', { id: 'ally-plus' });
  assert.equal(Engine.distanceBetween(game, 'player', 'ally'), 2, '+1 horse still modifies ring distance');
});

test('v12 H3/H7: playCard accepts an explicit Sha target while 1v1 default remains opponent', () => {
  const game = Engine.newGame({ seed: 1202, seats: ['player', 'enemy', 'ally'], roles: { player: '主公', enemy: '反贼', ally: '忠臣' } });
  game.player.hand = [Engine.makeTestCard('sha', { id: 'p-sha' })];
  game.enemy.hand = [];
  game.ally.hand = [];
  game.ally.hp = 2;
  const result = Engine.playCard(game, 'player', 'p-sha', { target: 'ally' });
  assert.equal(result.ok, true);
  assert.equal(game.ally.hp, 1);
  assert.equal(game.enemy.hp, game.enemy.maxHp, 'explicit target prevents default opponent hit');
});

test('v12 H5: 3-player identity win checks distinguish lord and rebel side', () => {
  const rebelDies = Engine.newGame({ seed: 1203, seats: ['player', 'enemy', 'ally'], roles: { player: '主公', enemy: '反贼', ally: '忠臣' } });
  rebelDies.enemy.hp = 1;
  rebelDies.enemy.hand = [];
  rebelDies.player.hand = [Engine.makeTestCard('sha', { id: 'kill-rebel' })];
  assert.equal(Engine.playCard(rebelDies, 'player', 'kill-rebel', { target: 'enemy' }).ok, true);
  assert.equal(rebelDies.phase, 'gameover');
  assert.equal(rebelDies.winner, 'lordSide');

  const lordDies = Engine.newGame({ seed: 1204, seats: ['player', 'enemy', 'ally'], roles: { player: '主公', enemy: '反贼', ally: '忠臣' }, firstActor: 'enemy' });
  lordDies.player.hp = 1;
  lordDies.player.hand = [];
  lordDies.enemy.hand = [Engine.makeTestCard('sha', { id: 'kill-lord' })];
  assert.equal(Engine.playCard(lordDies, 'enemy', 'kill-lord', { target: 'player' }).ok, true);
  assert.equal(lordDies.phase, 'gameover');
  assert.equal(lordDies.winner, 'rebelSide');
});
