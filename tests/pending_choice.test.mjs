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

// ─── 遗计 (Phase 6C-bis) ───────────────────────────────────────────────

function damageGuojia(game, amount) {
  // Direct engine call so we don't depend on a particular damage source.
  return Engine.drawCards && (function () {
    // Re-export side-effect-free entry; if the engine doesn't surface
    // damage(), simulate via card play.
    return null;
  })();
}

test('yiji default (no preference) keeps cards on caster — no pendingChoice', () => {
  const game = buildGame('guojia', 'sunquan');
  game.player.hand = [];
  game.deck = [
    c('sha', { id: 'yiji-1' }),
    c('tao', { id: 'yiji-2' }),
    c('shan', { id: 'yiji-3' }),
    c('jiu', { id: 'yiji-4' })
  ];
  // Trigger directly by simulating a 1-damage hit on 郭嘉.
  // We use Sha from enemy → player path; build a minimal flow.
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'enemy-sha', suit: 'spade', color: 'black' })];
  Engine.playCard(game, 'enemy', 'enemy-sha');

  assert.equal(Engine.getPendingChoice(game), null, 'yiji default behavior should not prompt');
  // 郭嘉 received 1 damage → drew 2 cards. They should be in 郭嘉's hand.
  assert.ok(game.player.hand.length >= 2, '郭嘉 keeps the 2 drawn cards by default');
});

test('yiji "ask" preference suspends with pendingChoice listing the drawn cards', () => {
  const game = buildGame('guojia', 'sunquan');
  Engine.setSkillPreference(game, 'player', 'yiji', 'ask');
  game.player.hand = [];
  game.deck = [
    c('sha', { id: 'extra' }),  // padding so deck isn't empty
    c('shan', { id: 'yiji-drawn-a' }),
    c('tao', { id: 'yiji-drawn-b' })
  ];
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'enemy-sha-ask', suit: 'spade', color: 'black' })];
  Engine.playCard(game, 'enemy', 'enemy-sha-ask');

  const pending = Engine.getPendingChoice(game);
  assert.ok(pending, 'ask preference suspends with pendingChoice');
  assert.equal(pending.kind, 'yiji-distribute');
  assert.equal(pending.actor, 'player');
  assert.equal(pending.drawnIds.length, 2, 'two cards listed for 1 damage point');
  // Cards are already in 郭嘉's hand (the prompt is post-draw).
  assert.ok(
    pending.drawnIds.every(id => game.player.hand.some(card => card.id === id)),
    'drawn cards live in 郭嘉 hand while prompt is open',
  );
});

test('yiji resolve with giveIds transfers selected cards to opponent hand', () => {
  const game = buildGame('guojia', 'sunquan');
  Engine.setSkillPreference(game, 'player', 'yiji', 'ask');
  game.player.hand = [];
  game.deck = [
    c('sha', { id: 'extra' }),
    c('shan', { id: 'yiji-keep' }),
    c('tao', { id: 'yiji-give' })
  ];
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'enemy-sha-resolve', suit: 'spade', color: 'black' })];
  const enemyHandBefore = game.enemy.hand.length;
  Engine.playCard(game, 'enemy', 'enemy-sha-resolve');

  const pending = Engine.getPendingChoice(game);
  assert.ok(pending);
  const giveId = pending.drawnIds.find(id => id === 'yiji-give');
  Engine.resolvePendingChoice(game, { giveIds: [giveId] });

  assert.equal(Engine.getPendingChoice(game), null, 'pending choice clears after resolve');
  assert.ok(
    !game.player.hand.some(card => card.id === giveId),
    'given card leaves 郭嘉 hand',
  );
  assert.ok(
    game.enemy.hand.some(card => card.id === giveId),
    'given card arrives in opponent hand',
  );
  assert.ok(
    game.player.hand.some(card => card.id === 'yiji-keep'),
    'unselected card stays with 郭嘉',
  );
  assert.equal(game.enemy.hand.length, enemyHandBefore + 1 - 1, 'opponent net +1 card (used Sha, gained yiji-give)');
});

test('yiji resolve with empty giveIds keeps everything', () => {
  const game = buildGame('guojia', 'sunquan');
  Engine.setSkillPreference(game, 'player', 'yiji', 'ask');
  game.player.hand = [];
  game.deck = [
    c('sha', { id: 'extra' }),
    c('shan', { id: 'yiji-a' }),
    c('tao', { id: 'yiji-b' })
  ];
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'enemy-sha-keep', suit: 'spade', color: 'black' })];
  Engine.playCard(game, 'enemy', 'enemy-sha-keep');

  Engine.resolvePendingChoice(game, { giveIds: [] });

  assert.ok(
    game.player.hand.some(card => card.id === 'yiji-a'),
    'card a stays',
  );
  assert.ok(
    game.player.hand.some(card => card.id === 'yiji-b'),
    'card b stays',
  );
  assert.ok(
    game.log.some(l => /全部留给自己/.test(l)),
    'keep-all path is logged',
  );
});

test('yiji "decline" preference skips the skill entirely (no cards drawn)', () => {
  const game = buildGame('guojia', 'sunquan');
  Engine.setSkillPreference(game, 'player', 'yiji', 'decline');
  game.player.hand = [];
  game.deck = [
    c('sha', { id: 'untouched-1' }),
    c('shan', { id: 'untouched-2' })
  ];
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'enemy-sha-decline', suit: 'spade', color: 'black' })];
  Engine.playCard(game, 'enemy', 'enemy-sha-decline');

  assert.equal(Engine.getPendingChoice(game), null);
  assert.equal(game.player.hand.length, 0, 'decline: no draw at all');
  assert.ok(game.log.some(l => /选择不发动【遗计】/.test(l)), 'decline path is logged');
  // Deck untouched by yiji draw.
  assert.ok(game.deck.some(card => card.id === 'untouched-1'));
});

// ─── 铁骑 (Phase 6C-bis) ───────────────────────────────────────────────

test('tieqi default (no preference) auto-fires on every player Sha', () => {
  const game = buildGame('machao', 'sunquan');
  game.player.hand = [c('sha', { id: 'machao-sha', suit: 'spade', color: 'black' })];
  game.enemy.hand = [c('shan', { id: 'target-shan' })];
  // Stack the deck so the 铁骑 judgement comes up red.
  game.deck = [c('sha', { id: 'tieqi-red-judge', suit: 'heart', color: 'red' })];

  Engine.playCard(game, 'player', 'machao-sha');

  assert.ok(game.log.some(l => /发动【铁骑】/.test(l)), 'tieqi fires automatically');
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, 'target cannot 闪, takes damage');
});

test('tieqi "decline" preference skips judgement and lets target 闪 normally', () => {
  const game = buildGame('machao', 'sunquan');
  Engine.setSkillPreference(game, 'player', 'tieqi', 'decline');
  game.player.hand = [c('sha', { id: 'machao-sha-decline', suit: 'spade', color: 'black' })];
  game.enemy.hand = [c('shan', { id: 'target-shan-decline' })];
  game.deck = [c('sha', { id: 'tieqi-would-be-judge', suit: 'heart', color: 'red' })];

  Engine.playCard(game, 'player', 'machao-sha-decline');

  assert.ok(
    game.log.some(l => /选择不发动【铁骑】/.test(l)),
    'decline path is logged',
  );
  assert.equal(game.enemy.hp, game.enemy.maxHp, 'target 闪 dodges the Sha');
  // Deck must still contain the judge card we stacked (since 铁骑 didn't fire).
  assert.ok(
    game.discard.every(card => card.id !== 'tieqi-would-be-judge') &&
    game.deck.some(card => card.id === 'tieqi-would-be-judge'),
    'judgement card untouched',
  );
});

console.log('\nPending-choice (guicai / yiji / tieqi) tests passed.');
