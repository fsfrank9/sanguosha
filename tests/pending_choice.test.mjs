import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function buildGame(playerHero, enemyHero) {
  const game = Engine.newGame({ seed: 7777, playerHero, enemyHero });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].flags = {};
    game[actor].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[actor].hp = game[actor].maxHp;
  }
  return game;
}

test('AI 鬼才 keeps the legacy auto hand[0] replacement (no pending choice)', () => {
  const game = buildGame('sunquan', 'simayi');
  game.enemy.hand = [c('shan', { id: 'ai-replace-shan', suit: 'heart', color: 'red', rank: '8' })];
  game.enemy.judgeArea = [c('lebusishu', { id: 'lebu-ai-1', suit: 'club', color: 'black' })];
  // Pad the deck so the resumed draw phase doesn't reshuffle.
  game.deck = [
    c('sha', { id: 'pad-1', suit: 'diamond', color: 'red' }),
    c('sha', { id: 'pad-2', suit: 'club', color: 'black' }),
    c('sha', { id: 'lebu-judge-1', suit: 'spade', color: 'black', rank: '5' })
  ];

  const result = Engine.startTurn(game, 'enemy');

  assert.equal(result.ok, true);
  assert.equal(Engine.getPendingChoice(game), null, 'AI 司马懿 should auto-pick hand[0] and never set pendingChoice');
  assert.ok(
    game.log.some(l => /鬼才/.test(l) && /ai-replace-shan/.test(l)),
    'auto path should log the replacement',
  );
  assert.ok(
    game.discard.some(card => card.id === 'lebu-judge-1'),
    'original judgement card should land in discard after auto-replacement',
  );
});

test('player 鬼才 suspends startTurn with pendingChoice and exposes hand candidates', () => {
  const game = buildGame('simayi', 'sunquan');
  game.turn = 'enemy';
  game.player.hand = [
    c('sha', { id: 'hand-a', suit: 'spade', color: 'black', rank: 'K' }),
    c('tao', { id: 'hand-b', suit: 'heart', color: 'red', rank: '5' })
  ];
  game.player.judgeArea = [c('lebusishu', { id: 'lebu-pl-1', suit: 'club', color: 'black' })];
  game.deck = [c('sha', { id: 'lebu-judge-orig', suit: 'spade', color: 'black', rank: '7' })];

  const result = Engine.startTurn(game, 'player');

  assert.equal(result.ok, true, result.message);
  const pending = Engine.getPendingChoice(game);
  assert.ok(pending, 'startTurn should suspend with a pendingChoice');
  assert.equal(pending.kind, 'guicai-replace');
  assert.equal(pending.actor, 'player');
  assert.deepEqual(pending.candidates.map(c => c.id), ['hand-a', 'hand-b'], 'candidates should mirror player hand');
  assert.equal(pending.judgementCard.id, 'lebu-judge-orig');
  // Engine should NOT have advanced to draw phase yet.
  assert.equal(game.phase, 'judge', 'phase stays at judge while pending');
});

test('player 鬼才 resolves with chosen card: judgement card replaced, turn continues to draw phase', () => {
  const game = buildGame('simayi', 'sunquan');
  game.turn = 'enemy';
  game.player.hand = [
    c('sha', { id: 'hand-a', suit: 'spade', color: 'black', rank: 'K' }),
    c('tao', { id: 'hand-b', suit: 'heart', color: 'red', rank: '5' })
  ];
  game.player.judgeArea = [c('lebusishu', { id: 'lebu-pl-1', suit: 'club', color: 'black' })];
  // Draw deck has the original judgement card; downstream we need additional
  // cards for the resumed draw phase so the engine doesn't run out.
  game.deck = [
    c('sha', { id: 'extra-1', suit: 'diamond', color: 'red' }),
    c('sha', { id: 'extra-2', suit: 'club', color: 'black' }),
    c('sha', { id: 'lebu-judge-orig', suit: 'spade', color: 'black', rank: '7' })
  ];

  Engine.startTurn(game, 'player');
  assert.ok(Engine.getPendingChoice(game), 'should be paused');

  const resolveResult = Engine.resolvePendingChoice(game, { cardId: 'hand-b' });
  assert.equal(resolveResult.ok, true, resolveResult.message);
  assert.equal(Engine.getPendingChoice(game), null, 'pendingChoice should clear after resolve');
  assert.equal(game.player.hand.find(card => card.id === 'hand-b'), undefined, 'chosen replacement leaves hand');
  // Lebusishu: skip play if judgement is NOT heart. We replaced with a heart
  // tao, so play phase is NOT skipped — the turn proceeds to draw, then play.
  assert.equal(game.player.flags.skipPlay, false, 'heart replacement means play is NOT skipped');
  assert.equal(game.phase, 'play', 'after resolve, turn advances through draw to play phase');
});

test('player 鬼才 decline keeps original judgement card and continues turn', () => {
  const game = buildGame('simayi', 'sunquan');
  game.turn = 'enemy';
  game.player.hand = [c('tao', { id: 'hand-untouched', suit: 'heart', color: 'red', rank: '5' })];
  game.player.judgeArea = [c('lebusishu', { id: 'lebu-pl-2', suit: 'club', color: 'black' })];
  game.deck = [
    c('sha', { id: 'extra-after-decline', suit: 'diamond', color: 'red' }),
    c('sha', { id: 'extra-after-decline-2', suit: 'club', color: 'black' }),
    c('sha', { id: 'lebu-judge-black', suit: 'spade', color: 'black', rank: '8' })
  ];

  Engine.startTurn(game, 'player');
  Engine.resolvePendingChoice(game, { cardId: null });

  assert.ok(
    game.player.hand.some(card => card.id === 'hand-untouched'),
    'declining keeps the player\'s original hand card',
  );
  assert.ok(
    game.discard.some(card => card.id === 'lebu-judge-black'),
    'original judgement card finalizes into discard',
  );
  // Black judgement on Lebusishu → play phase skipped.
  assert.equal(game.player.flags.skipPlay, true, 'spade judgement makes lebusishu succeed → skip play');
});

test('setSkillPreference guicai=auto on player restores hand[0] auto-fire (no prompt)', () => {
  const game = buildGame('simayi', 'sunquan');
  Engine.setSkillPreference(game, 'player', 'guicai', 'auto');
  game.turn = 'enemy';
  game.player.hand = [c('tao', { id: 'auto-pick', suit: 'heart', color: 'red', rank: '5' })];
  game.player.judgeArea = [c('lebusishu', { id: 'lebu-pl-auto', suit: 'club', color: 'black' })];
  game.deck = [
    c('sha', { id: 'extra-1-auto', suit: 'diamond', color: 'red' }),
    c('sha', { id: 'extra-2-auto', suit: 'club', color: 'black' }),
    c('sha', { id: 'lebu-judge-auto', suit: 'spade', color: 'black', rank: '7' })
  ];

  const result = Engine.startTurn(game, 'player');

  assert.equal(result.ok, true);
  assert.equal(Engine.getPendingChoice(game), null, 'auto preference skips the prompt');
  assert.ok(
    !game.player.hand.some(card => card.id === 'auto-pick'),
    'auto preference: hand[0] is consumed automatically (does not need a prompt)',
  );
  assert.ok(
    game.log.some(l => /鬼才/.test(l) && /auto-pick/.test(l)),
    'auto-fire path is logged',
  );
});

test('setSkillPreference guicai=decline on player skips the skill entirely', () => {
  const game = buildGame('simayi', 'sunquan');
  Engine.setSkillPreference(game, 'player', 'guicai', 'decline');
  game.turn = 'enemy';
  game.player.hand = [c('tao', { id: 'kept', suit: 'heart', color: 'red', rank: '5' })];
  game.player.judgeArea = [c('lebusishu', { id: 'lebu-pl-decline', suit: 'club', color: 'black' })];
  game.deck = [
    c('sha', { id: 'extra-1-decl', suit: 'diamond', color: 'red' }),
    c('sha', { id: 'extra-2-decl', suit: 'club', color: 'black' }),
    c('sha', { id: 'lebu-judge-decline', suit: 'spade', color: 'black', rank: '7' })
  ];

  Engine.startTurn(game, 'player');

  assert.equal(Engine.getPendingChoice(game), null, 'decline preference suppresses both prompt and auto');
  assert.ok(
    game.player.hand.some(card => card.id === 'kept'),
    'hand card is preserved on decline (no replacement consumed)',
  );
  assert.ok(game.log.some(l => /选择不发动【鬼才】/.test(l)), 'decline path is logged');
});

test('resolvePendingChoice without a pending prompt fails cleanly', () => {
  const game = buildGame('sunquan', 'sunquan');
  const result = Engine.resolvePendingChoice(game, { cardId: 'whatever' });
  assert.equal(result.ok, false);
  assert.match(result.message, /没有待处理/);
});

console.log('\nPending-choice (guicai pause/resume) tests passed.');
