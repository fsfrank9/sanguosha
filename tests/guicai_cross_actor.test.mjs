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
  const game = Engine.newGame({ seed: seed || 6101, playerHero, enemyHero });
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
  return game;
}

// ─── Cross-actor: player 司马懿 can replace OPPONENT's judgement ──────

test('player 司马懿 replaces opponent\'s 乐不思蜀 judgement via pendingChoice', () => {
  const game = buildGame('simayi', 'liubei');
  game.turn = 'player';
  game.phase = 'play';
  // 司马懿 has a heart card in hand to replace into.
  game.player.hand = [c('tao', { id: 'heart-replacement', suit: 'heart', color: 'red', rank: '5' })];
  // Opponent (刘备) has 乐不思蜀 in their judge area; opponent is about to
  // start their turn → prepare → judge area resolves.
  game.enemy.judgeArea = [c('lebusishu', { id: 'lebu-on-opp', suit: 'club', color: 'black' })];
  // Deck top: the lebusishu's judgement card will be drawn.
  game.deck = [
    c('sha', { id: 'pad-1' }),
    c('sha', { id: 'pad-2' }),
    c('sha', { id: 'lebu-judge-orig', suit: 'spade', color: 'black', rank: '7' })
  ];

  Engine.startTurn(game, 'enemy');
  const pending = Engine.getPendingChoice(game);
  assert.ok(pending, 'expected pendingChoice for player 司马懿 replacing opponent\'s judgement');
  assert.equal(pending.kind, 'guicai-replace');
  assert.equal(pending.actor, 'player', 'holder is player 司马懿');
  assert.equal(pending.judgementActor, 'enemy', 'judgement is the opponent\'s (刘备)');
  assert.deepEqual(pending.candidates.map(c => c.id), ['heart-replacement']);
});

test('player 司马懿 resolves replacement on opponent\'s judgement: heart replaces spade', () => {
  const game = buildGame('simayi', 'liubei');
  game.turn = 'player';
  game.phase = 'play';
  game.player.hand = [c('tao', { id: 'heart-rep', suit: 'heart', color: 'red', rank: '5' })];
  game.enemy.judgeArea = [c('lebusishu', { id: 'lebu', suit: 'club', color: 'black' })];
  game.deck = [
    c('sha', { id: 'pad-1' }),
    c('sha', { id: 'pad-2' }),
    c('sha', { id: 'lebu-orig', suit: 'spade', color: 'black', rank: '7' })
  ];

  Engine.startTurn(game, 'enemy');
  Engine.resolvePendingChoice(game, { cardId: 'heart-rep' });
  // After heart replacement, lebu evaluates to "is heart" → success → does
  // NOT skip play phase for opponent. Opponent reaches play phase.
  assert.notEqual(game.enemy.flags.skipPlay, true, 'heart replacement = lebu success, no skip');
  assert.equal(game.phase, 'play');
  // The original lebu judgement card got discarded (no longer in deck or
  // judge area); 司马懿's hand card was consumed.
  assert.equal(game.player.hand.some(card => card.id === 'heart-rep'), false);
});

// ─── Non-pausable judgement: player 鬼才 skips (v13 张角修缮-2) ─────────

test('鬼才 skips with log on non-pausable bagua judgement (player 司马懿, no auto hand burn)', () => {
  // Player 司马懿 with bagua armor, takes a black 杀 from opponent.
  // bagua judgement is non-pausable (it runs inside playSha). v13 张角修缮:
  // 玩家鬼才不再落 auto 烧手牌 — 明示跳过 (显式 guicai='auto' 才保留旧口径,
  // 见 v13_zhangjiao_repair R15)。
  const game = buildGame('simayi', 'liubei');
  game.turn = 'enemy';
  game.phase = 'play';
  game.player.equipment.armor = c('bagua', { id: 'bagua-armor' });
  game.player.hand = [c('tao', { id: 'replacement-heart', suit: 'heart', color: 'red', rank: '5' })];
  // Opponent plays a black sha; bagua judges black (spade) → no dodge.
  game.enemy.hand = [c('sha', { id: 'attack-sha', suit: 'spade', color: 'black' })];
  game.deck = [c('sha', { id: 'bagua-judge-orig', suit: 'spade', color: 'black', rank: '7' })];

  const before = game.player.hp;
  Engine.playCard(game, 'enemy', 'attack-sha');

  // pendingChoice must NOT be set (non-pausable judgement, skip path).
  assert.equal(Engine.getPendingChoice(game), null, 'no dangling pendingChoice from bagua judge');
  assert.ok(game.log.some(line => line.includes('【鬼才】时机不可挂起，本次跳过')), 'skip is logged');
  assert.equal(game.player.hand.some(card => card.id === 'replacement-heart'), true,
    'hand card NOT auto-burned');
  assert.equal(game.player.hp, before - 1, 'spade bagua judge stands → sha hits');
});

// ─── Decline preference still works ─────────────────────────────────

test('skillPreferences.guicai=decline prevents 鬼才 from firing on opponent judgement', () => {
  const game = buildGame('simayi', 'liubei');
  game.turn = 'player';
  game.phase = 'play';
  Engine.setSkillPreference(game, 'player', 'guicai', 'decline');
  game.player.hand = [c('tao', { id: 'kept', suit: 'heart', color: 'red' })];
  game.enemy.judgeArea = [c('lebusishu', { id: 'lebu-decline-opp', suit: 'club', color: 'black' })];
  game.deck = [
    c('sha', { id: 'pad-1' }),
    c('sha', { id: 'pad-2' }),
    c('sha', { id: 'lebu-orig-decline', suit: 'spade', color: 'black', rank: '7' })
  ];

  Engine.startTurn(game, 'enemy');
  // No pendingChoice; opponent's lebu resolves with the original spade card
  // (not heart) → skipPlay = true.
  assert.equal(Engine.getPendingChoice(game), null);
  assert.equal(game.player.hand.some(card => card.id === 'kept'), true, 'hand untouched');
  assert.equal(game.enemy.flags.skipPlay, true, 'lebu success on spade → opponent skips play');
});

// ─── AI 司马懿 still auto-fires ──────────────────────────────────────

test('AI 司马懿 auto-fires hand[0] (no pendingChoice) on own lebusishu judgement', () => {
  const game = buildGame('liubei', 'simayi');
  game.turn = 'player';
  game.phase = 'play';
  // AI 司马懿 has a heart card; on his own turn, lebu in his judge area
  // resolves. AI default preference is 'auto'.
  game.enemy.hand = [c('tao', { id: 'ai-heart', suit: 'heart', color: 'red', rank: '5' })];
  game.enemy.judgeArea = [c('lebusishu', { id: 'lebu-ai-own', suit: 'club', color: 'black' })];
  game.deck = [
    c('sha', { id: 'pad-1' }),
    c('sha', { id: 'pad-2' }),
    c('sha', { id: 'lebu-orig-ai', suit: 'spade', color: 'black', rank: '7' })
  ];

  Engine.startTurn(game, 'enemy');
  assert.equal(Engine.getPendingChoice(game), null, 'AI never sets pendingChoice for 鬼才');
  // Heart replaces spade → lebu success → no skip → enemy reached play phase.
  assert.notEqual(game.enemy.flags.skipPlay, true);
  assert.equal(game.enemy.hand.some(card => card.id === 'ai-heart'), false, 'hand[0] auto-consumed');
});

// ─── Original behavior: 司马懿 own judgement still pauses for player ────

test('player 司马懿 own lebusishu judgement still triggers pendingChoice', () => {
  const game = buildGame('simayi', 'liubei');
  game.turn = 'enemy';
  game.phase = 'play';
  game.player.hand = [c('tao', { id: 'own-replace', suit: 'heart', color: 'red' })];
  game.player.judgeArea = [c('lebusishu', { id: 'lebu-own', suit: 'club', color: 'black' })];
  game.deck = [
    c('sha', { id: 'pad-1' }),
    c('sha', { id: 'pad-2' }),
    c('sha', { id: 'own-lebu-orig', suit: 'spade', color: 'black', rank: '7' })
  ];

  Engine.startTurn(game, 'player');
  const pending = Engine.getPendingChoice(game);
  assert.ok(pending);
  assert.equal(pending.actor, 'player');
  assert.equal(pending.judgementActor, 'player', 'own judgement: holder === judgementActor');
});

console.log('\nGuicai cross-actor tests passed.');
