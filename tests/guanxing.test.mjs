import assert from 'node:assert/strict';
import { Engine, StateRuntime } from './helpers/load-engine.mjs';

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function buildGame(playerHero, enemyHero, opts) {
  opts = opts || {};
  const game = Engine.newGame({ seed: opts.seed || 6100, playerHero: playerHero, enemyHero: enemyHero });
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
  game.turn = 'enemy';
  game.phase = 'play';
  return game;
}

// ─── Count formula ─────────────────────────────────────────────────────

test('aliveActorCount returns 2 in standard 1v1 with both players alive', () => {
  const game = buildGame('zhugeliang', 'sunquan');
  assert.equal(StateRuntime.aliveActorCount(game), 2);
});

test('aliveActorCount drops to 1 when one actor has 0 HP', () => {
  const game = buildGame('zhugeliang', 'sunquan');
  game.enemy.hp = 0;
  assert.equal(StateRuntime.aliveActorCount(game), 1);
});

test('Guanxing preview returns min(aliveActorCount, 5, deckSize) cards', () => {
  const game = buildGame('sunquan', 'zhugeliang');
  game.deck = [
    c('sha', { id: 'd-bottom' }),
    c('shan', { id: 'd-mid' }),
    c('tao', { id: 'd-near-top' }),
    c('sha', { id: 'd-top' })
  ];
  const preview = Engine.getGuanxingPreview(game, 'enemy');
  assert.equal(preview.ok, true);
  // alive = 2, deck = 4, so count = min(2, 5, 4) = 2.
  assert.deepEqual(preview.cards.map(c => c.id), ['d-near-top', 'd-top']);
});

test('Guanxing preview returns 0 cards when deck is empty', () => {
  const game = buildGame('sunquan', 'zhugeliang');
  game.deck = [];
  const preview = Engine.getGuanxingPreview(game, 'enemy');
  assert.equal(preview.ok, true);
  assert.equal(preview.cards.length, 0);
});

// ─── Prepare-phase auto-trigger ────────────────────────────────────────

test('startTurn for player 诸葛亮 suspends with pendingChoice in prepare phase', () => {
  const game = buildGame('zhugeliang', 'sunquan');
  game.deck = [
    c('sha', { id: 'extra-a' }),
    c('sha', { id: 'extra-b' }),
    c('sha', { id: 'gx-bottom' }),
    c('sha', { id: 'gx-top' })
  ];
  const result = Engine.startTurn(game, 'player');
  assert.equal(result.ok, true);
  const pending = Engine.getPendingChoice(game);
  assert.ok(pending, 'expected pending choice in prepare phase');
  assert.equal(pending.kind, 'guanxing-reorder');
  assert.equal(pending.actor, 'player');
  assert.deepEqual(pending.cards.map(c => c.id), ['gx-bottom', 'gx-top']);
  // Turn hasn't progressed past prepare.
  assert.equal(game.phase, 'prepare', 'phase stays at prepare while pending');
});

test('startTurn for AI 诸葛亮 auto-fires guanxing without pendingChoice', () => {
  const game = buildGame('sunquan', 'zhugeliang');
  game.deck = [
    c('sha', { id: 'extra-1' }),
    c('sha', { id: 'extra-2' }),
    c('sha', { id: 'ai-gx-bottom' }),
    c('sha', { id: 'ai-gx-top' })
  ];
  Engine.startTurn(game, 'enemy');
  assert.equal(Engine.getPendingChoice(game), null, 'AI never sets pendingChoice');
  assert.equal(game.enemy.flags.guanxingUsed, true, '观星 fired (used flag set)');
});

test('startTurn for hero without 观星 does not suspend', () => {
  const game = buildGame('sunquan', 'liubei');
  game.deck = [c('sha', { id: 'x-1' }), c('sha', { id: 'x-2' })];
  const result = Engine.startTurn(game, 'player');
  assert.equal(result.ok, true);
  assert.equal(Engine.getPendingChoice(game), null);
});

// ─── Resolve: { topIds, bottomIds } ───────────────────────────────────

test('resolvePendingChoice with topIds reorders cards to deck top, drawn in topIds order', () => {
  const game = buildGame('zhugeliang', 'sunquan');
  game.deck = [
    c('sha', { id: 'pad-1' }),
    c('sha', { id: 'pad-2' }),
    c('sha', { id: 'preview-low' }),  // preview[0] (bottom of preview)
    c('sha', { id: 'preview-high' })  // preview[1] (top of deck)
  ];
  Engine.startTurn(game, 'player');
  // After prepare: pending fires. We want preview-low drawn first, then
  // preview-high. Reorder via topIds = [preview-low, preview-high].
  Engine.resolvePendingChoice(game, { topIds: ['preview-low', 'preview-high'], bottomIds: [] });
  // After resolve, the turn continues: judge (empty) → draw (default 2)
  // → play. The first two cards drawn should be preview-low then preview-high.
  assert.equal(game.phase, 'play', 'turn proceeds to play phase after resolve');
  // After resolve, judge phase happens (empty), then draw phase draws 2.
  // Hand should contain the drawn cards in pop-order: top drawn first.
  // Player's hand should have the 2 cards in some order.
  const ids = game.player.hand.map(card => card.id);
  assert.deepEqual(ids, ['preview-low', 'preview-high'],
    'draw order: topIds[0] (preview-low) is drawn first into hand, then topIds[1] (preview-high)');
});

test('resolvePendingChoice with bottomIds sends cards to deck bottom', () => {
  const game = buildGame('zhugeliang', 'sunquan');
  game.deck = [
    c('sha', { id: 'pad-1' }),  // bottom of existing
    c('sha', { id: 'pad-2' }),
    c('sha', { id: 'pad-3' }),
    c('sha', { id: 'pad-4' }),
    c('sha', { id: 'preview-A' }),  // preview bottom
    c('sha', { id: 'preview-B' })   // preview top
  ];
  Engine.startTurn(game, 'player');
  // Send both preview cards to bottom; pad-4 / pad-3 / pad-2 / pad-1 stay at
  // top of remaining deck. preview-A goes "first of bottom pile" (drawn after
  // existing exhausts), preview-B is very bottom.
  Engine.resolvePendingChoice(game, { topIds: [], bottomIds: ['preview-A', 'preview-B'] });
  // After resolve: judge empty → draw 2 → hand has pad-4 + pad-3 (top of
  // remaining existing deck).
  assert.deepEqual(
    game.player.hand.map(card => card.id),
    ['pad-4', 'pad-3'],
    'draw should come from existing deck top, not from cards we put at bottom',
  );
  // Cards at bottom should still be in the deck (not drawn).
  assert.ok(game.deck.some(card => card.id === 'preview-A'));
  assert.ok(game.deck.some(card => card.id === 'preview-B'));
  // preview-B is the very bottom (index 0).
  assert.equal(game.deck[0].id, 'preview-B', 'bottomIds[last] is the absolute bottom');
});

test('resolvePendingChoice supports mixed top/bottom assignment', () => {
  const game = buildGame('zhugeliang', 'sunquan');
  // Manually clear enemy hand so opponent doesn't end the game.
  game.deck = [
    c('sha', { id: 'pad-1' }),
    c('sha', { id: 'pad-2' }),
    c('sha', { id: 'preview-A' }),
    c('sha', { id: 'preview-B' })
  ];
  Engine.startTurn(game, 'player');
  Engine.resolvePendingChoice(game, { topIds: ['preview-A'], bottomIds: ['preview-B'] });
  // draw phase pulls 2 cards from top: preview-A first, then pad-2 next.
  assert.deepEqual(
    game.player.hand.map(card => card.id),
    ['preview-A', 'pad-2'],
    'topIds[0] drawn first, then next card from below preview',
  );
  // preview-B sits at bottom (index 0).
  assert.equal(game.deck[0].id, 'preview-B');
});

// ─── Decline ──────────────────────────────────────────────────────────

test('resolvePendingChoice with decline sets guanxingUsed and skips reorder', () => {
  const game = buildGame('zhugeliang', 'sunquan');
  game.deck = [
    c('sha', { id: 'pad-1' }),
    c('sha', { id: 'pad-2' }),
    c('sha', { id: 'preview-A' }),
    c('sha', { id: 'preview-B' })
  ];
  Engine.startTurn(game, 'player');
  Engine.resolvePendingChoice(game, { decline: true });
  assert.equal(game.player.flags.guanxingUsed, true);
  assert.ok(game.log.some(l => /选择不发动【观星】/.test(l)));
  // Draw phase draws preview-B then preview-A (deck top order unchanged).
  assert.deepEqual(
    game.player.hand.map(card => card.id),
    ['preview-B', 'preview-A'],
  );
});

// ─── Frequency (once per turn) ────────────────────────────────────────

test('Calling useSkill(guanxing) after auto-fire returns "limited once per turn"', () => {
  const game = buildGame('sunquan', 'zhugeliang');
  game.deck = [
    c('sha', { id: 'p1' }),
    c('sha', { id: 'p2' }),
    c('sha', { id: 'p3' }),
    c('sha', { id: 'p4' })
  ];
  Engine.startTurn(game, 'enemy');
  // AI auto-fired guanxing already. Second call should fail.
  const result = Engine.useSkill(game, 'enemy', 'guanxing', [], {});
  assert.equal(result.ok, false);
  assert.match(result.message, /每回合限一次/);
});

// ─── skillPreferences.guanxing decline ────────────────────────────────

test('skillPreferences.guanxing = decline skips the prepare-phase prompt entirely', () => {
  const game = buildGame('zhugeliang', 'sunquan');
  Engine.setSkillPreference(game, 'player', 'guanxing', 'decline');
  game.deck = [
    c('sha', { id: 'd-1' }),
    c('sha', { id: 'd-2' }),
    c('sha', { id: 'd-3' }),
    c('sha', { id: 'd-4' })
  ];
  Engine.startTurn(game, 'player');
  // No pendingChoice; turn proceeds normally.
  assert.equal(Engine.getPendingChoice(game), null);
  assert.equal(game.player.flags.guanxingUsed, true);
  assert.equal(game.phase, 'play');
});

// ─── Legacy orderIds compat ───────────────────────────────────────────

test('Legacy orderIds is treated as topIds (top-first semantic)', () => {
  const game = buildGame('zhugeliang', 'sunquan');
  game.turn = 'player';
  game.phase = 'play';
  game.deck = [
    c('sha', { id: 'pad' }),
    c('sha', { id: 'card-A' }),
    c('sha', { id: 'card-B' })
  ];
  // Use legacy useSkill path (not the pendingChoice flow).
  const result = Engine.useSkill(game, 'player', 'guanxing', [], { orderIds: ['card-A', 'card-B'] });
  assert.equal(result.ok, true);
  // deck top should be card-A (drawn first), then card-B; that means
  // deck.slice(-2) = [card-B, card-A] since pop() takes last.
  assert.deepEqual(game.deck.slice(-2).map(c => c.id), ['card-B', 'card-A']);
});

console.log('\nGuanxing v6.1 tests passed.');
