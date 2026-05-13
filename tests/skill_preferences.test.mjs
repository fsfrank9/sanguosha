import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

function newGameWithXuChu() {
  return Engine.newGame({
    seed: 42,
    playerHero: 'xuchu',
    enemyHero: 'liubei',
    startWithFirstTurn: false,
  });
}

test('setSkillPreference / getSkillPreference round-trip', () => {
  const game = newGameWithXuChu();
  assert.equal(Engine.getSkillPreference(game, 'player', 'luoyi'), null);

  const r1 = Engine.setSkillPreference(game, 'player', 'luoyi', 'decline');
  assert.equal(r1.ok, true);
  assert.equal(Engine.getSkillPreference(game, 'player', 'luoyi'), 'decline');

  // 'auto' is now a stored value (distinct from null/default) so multi-state
  // preferences like guicai can express "auto" vs "ask" explicitly.
  const r2 = Engine.setSkillPreference(game, 'player', 'luoyi', 'auto');
  assert.equal(r2.ok, true);
  assert.equal(Engine.getSkillPreference(game, 'player', 'luoyi'), 'auto');

  // Passing null/undefined clears the preference back to default.
  const r3 = Engine.setSkillPreference(game, 'player', 'luoyi', null);
  assert.equal(r3.ok, true);
  assert.equal(Engine.getSkillPreference(game, 'player', 'luoyi'), null);
});

test('luoyi default behavior: auto-fires on draw phase, reduces draw count, sets damage flag', () => {
  const game = newGameWithXuChu();
  const before = game.player.hand.length;
  Engine.startTurn(game, 'player');
  // Default xuchu draw phase: 2 - 1 = 1 card drawn; flags.luoyi set.
  assert.equal(game.player.hand.length - before, 1, 'draw count should be 1 (2 - 1) when luoyi auto-fires');
  assert.equal(game.player.flags.luoyi, true, 'flags.luoyi should be set when auto-fired');
});

test('luoyi opt-out via skillPreferences: draws full 2 cards and no damage bonus this turn', () => {
  const game = newGameWithXuChu();
  Engine.setSkillPreference(game, 'player', 'luoyi', 'decline');
  const before = game.player.hand.length;
  Engine.startTurn(game, 'player');
  assert.equal(game.player.hand.length - before, 2, 'draw count should be 2 (full) when luoyi declined');
  assert.notEqual(game.player.flags.luoyi, true, 'flags.luoyi should NOT be set when declined');
  assert.equal(game.player.flags.luoyiDeclined, true, 'flags.luoyiDeclined records the decision');
});

test('luoyi preference resets after clearing with null', () => {
  const game = newGameWithXuChu();
  Engine.setSkillPreference(game, 'player', 'luoyi', 'decline');
  assert.equal(Engine.getSkillPreference(game, 'player', 'luoyi'), 'decline');
  Engine.setSkillPreference(game, 'player', 'luoyi', null);
  assert.equal(Engine.getSkillPreference(game, 'player', 'luoyi'), null);
});

test('setSkillPreference rejects unknown actor', () => {
  const game = newGameWithXuChu();
  const r = Engine.setSkillPreference(game, 'bogus', 'luoyi', 'decline');
  assert.equal(r.ok, false);
});

console.log('\nSkill preferences tests passed.');
