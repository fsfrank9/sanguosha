import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function buildGame(playerHero, enemyHero, seed) {
  const game = Engine.newGame({ seed: seed || 6102, playerHero, enemyHero });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].flags = {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp;
  }
  game.turn = 'player';
  game.phase = 'play';
  return game;
}

// ─── Target-side prompt for player target ──────────────────────────────

test('AI 反间 against player suspends with pendingChoice for player to guess', () => {
  const game = buildGame('liubei', 'zhouyu');
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'fj-card', suit: 'heart', color: 'red' })];

  Engine.useSkill(game, 'enemy', 'fanjian', ['fj-card']);

  const pending = Engine.getPendingChoice(game);
  assert.ok(pending, 'pendingChoice should be set so player can guess');
  assert.equal(pending.kind, 'fanjian-guess');
  assert.equal(pending.actor, 'player', 'player (target) is the one who guesses');
  assert.equal(pending.sourceActor, 'enemy');
  assert.equal(pending.cardId, 'fj-card');
  assert.equal(pending.cardName, '杀');
  assert.equal(pending.cardSuit, undefined, 'suit should NOT be exposed to the guesser');
});

test('Player resolves correct suit → no damage; wrong suit → 1 damage from source', () => {
  // Correct guess
  const gA = buildGame('liubei', 'zhouyu');
  gA.turn = 'enemy';
  gA.phase = 'play';
  gA.enemy.hand = [c('sha', { id: 'card-A', suit: 'heart', color: 'red' })];
  Engine.useSkill(gA, 'enemy', 'fanjian', ['card-A']);
  const hpBeforeA = gA.player.hp;
  Engine.resolvePendingChoice(gA, { suit: 'heart' });
  assert.equal(gA.player.hp, hpBeforeA, 'correct guess → no damage');
  assert.equal(Engine.getPendingChoice(gA), null);

  // Wrong guess
  const gB = buildGame('liubei', 'zhouyu');
  gB.turn = 'enemy';
  gB.phase = 'play';
  gB.enemy.hand = [c('sha', { id: 'card-B', suit: 'heart', color: 'red' })];
  Engine.useSkill(gB, 'enemy', 'fanjian', ['card-B']);
  const hpBeforeB = gB.player.hp;
  Engine.resolvePendingChoice(gB, { suit: 'spade' });
  assert.equal(gB.player.hp, hpBeforeB - 1, 'wrong guess → 1 damage');
});

test('Player keeps the transferred 反间 card whether or not the guess is correct', () => {
  const game = buildGame('liubei', 'zhouyu');
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'transferred', suit: 'diamond', color: 'red' })];
  Engine.useSkill(game, 'enemy', 'fanjian', ['transferred']);
  Engine.resolvePendingChoice(game, { suit: 'club' });  // wrong
  assert.ok(
    game.player.hand.some(card => card.id === 'transferred'),
    'card stays in target hand regardless of guess outcome',
  );
});

// ─── AI as target: random blind guess ─────────────────────────────────

test('Player 反间 against AI: AI guesses blindly via random suit (no pendingChoice)', () => {
  const game = buildGame('zhouyu', 'liubei');
  // Use a known seed; engine random is deterministic.
  game.player.hand = [c('sha', { id: 'pl-card', suit: 'heart', color: 'red' })];

  Engine.useSkill(game, 'player', 'fanjian', ['pl-card']);

  // AI never sets pendingChoice for itself.
  assert.equal(Engine.getPendingChoice(game), null);
  // Damage may or may not happen depending on the random suit roll — assert
  // that AI made some guess (log should contain 猜测).
  assert.ok(
    game.log.some(l => /猜测/.test(l)),
    'AI made a blind guess and the engine logged it',
  );
});

// ─── Legacy options.guessedSuit override ──────────────────────────────

test('options.guessedSuit override bypasses the prompt (backward compat)', () => {
  const game = buildGame('zhouyu', 'caocao');
  game.player.hand = [c('sha', { id: 'compat-card', suit: 'heart', color: 'red' })];

  const hpBefore = game.enemy.hp;
  const result = Engine.useSkill(game, 'player', 'fanjian', ['compat-card'], { guessedSuit: 'spade' });
  assert.equal(result.ok, true, result.message);
  // The card is heart, "guess" was spade → wrong → enemy takes damage.
  // (This matches the existing v30 test's expectation, semantics carried by
  // the explicit override path.)
  assert.equal(game.enemy.hp, hpBefore - 1);
  assert.equal(Engine.getPendingChoice(game), null);
});

// ─── Validation: bad suit re-prompts ─────────────────────────────────

test('Invalid suit decision restores pendingChoice (UI re-renders panel)', () => {
  const game = buildGame('liubei', 'zhouyu');
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'bad-suit-card', suit: 'heart', color: 'red' })];
  Engine.useSkill(game, 'enemy', 'fanjian', ['bad-suit-card']);
  const result = Engine.resolvePendingChoice(game, { suit: 'banana' });
  assert.equal(result.ok, false);
  // Pending is restored so player can re-pick.
  assert.ok(Engine.getPendingChoice(game), 'invalid suit must not consume the prompt');
});

// ─── Frequency: once per turn ─────────────────────────────────────────

test('Second 反间 in same turn returns "每回合限一次"', () => {
  const game = buildGame('zhouyu', 'liubei');
  game.player.hand = [
    c('sha', { id: 'first', suit: 'heart', color: 'red' }),
    c('sha', { id: 'second', suit: 'heart', color: 'red' })
  ];
  Engine.useSkill(game, 'player', 'fanjian', ['first']);
  // Don't even need to resolve the pending; the flag is already set.
  const result = Engine.useSkill(game, 'player', 'fanjian', ['second']);
  assert.equal(result.ok, false);
  assert.match(result.message, /每回合限一次/);
});

console.log('\nFanjian target-guess tests passed.');
