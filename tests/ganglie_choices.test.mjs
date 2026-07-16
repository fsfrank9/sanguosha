import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

// v11 A1: 所有推进引擎状态的 Engine.* 调用均原地包上 assertCardConservation (全局牌守恒断言)。

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function buildGame(playerHero, enemyHero, seed) {
  const game = Engine.newGame({ seed: seed || 6104, playerHero, enemyHero });
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

function ids(arr) {
  return Array.from(arr).map(item => item && item.id);
}

// ─── 夏侯惇's choice to trigger (player default = 'ask') ──────────────

test('Player 夏侯惇 takes damage → pendingChoice ganglie-fire (yes/no prompt)', () => {
  const game = buildGame('xiahoudun', 'caocao');
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'attack-sha', suit: 'spade', color: 'black' })];

  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'attack-sha'));

  const pending = Engine.getPendingChoice(game);
  assert.ok(pending);
  assert.equal(pending.kind, 'ganglie-fire');
  assert.equal(pending.actor, 'player', 'player 夏侯惇 chooses');
  assert.equal(pending.sourceActor, 'enemy');
});

test('Player 夏侯惇 declines → no judgement, no damage to source', () => {
  const game = buildGame('xiahoudun', 'caocao');
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'attack-sha', suit: 'spade', color: 'black' })];
  game.enemy.hp = game.enemy.maxHp;
  game.deck = [c('sha', { id: 'would-be-judge', suit: 'spade', color: 'black' })];

  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'attack-sha'));
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { fire: false }));

  assert.equal(game.enemy.hp, game.enemy.maxHp, 'source unaffected when 夏侯惇 declines');
  // Judge card untouched in deck (no judgement happened).
  assert.ok(game.deck.some(card => card.id === 'would-be-judge'),
    'deck top still has the would-be judgement card');
  assert.ok(game.log.some(l => /选择不发动【刚烈】/.test(l)));
});

test('skillPreferences.ganglie=decline suppresses 夏侯惇\'s fire prompt entirely', () => {
  const game = buildGame('xiahoudun', 'caocao');
  Engine.setSkillPreference(game, 'player', 'ganglie', 'decline');
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'attack-sha', suit: 'spade', color: 'black' })];

  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'attack-sha'));

  assert.equal(Engine.getPendingChoice(game), null, 'decline pref means no prompt');
  assert.ok(game.log.some(l => /选择不发动【刚烈】/.test(l)));
});

// ─── Source's choice (player source, 2+ cards) ───────────────────────

test('Player source picks the 2 specific hand cards to discard', () => {
  const game = buildGame('sunquan', 'xiahoudun');
  game.player.hand = [
    c('sha', { id: 'attack-sha', suit: 'spade', color: 'black' }),
    c('shan', { id: 'keep-this', suit: 'heart', color: 'red' }),
    c('sha', { id: 'discard-this-1', suit: 'spade', color: 'black' }),
    c('sha', { id: 'discard-this-2', suit: 'club', color: 'black' })
  ];
  game.deck = [c('sha', { id: 'judge-black', suit: 'club', color: 'black' })];

  assertCardConservation(game, () => Engine.playCard(game, 'player', 'attack-sha'));
  const pending = Engine.getPendingChoice(game);
  assert.ok(pending);
  assert.equal(pending.kind, 'ganglie-source-choice');
  assert.equal(pending.actor, 'player');

  // Player picks 2 specific cards (not the keep-this card).
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, {
    mode: 'discard',
    cardIds: ['discard-this-1', 'discard-this-2']
  }));

  assert.equal(game.player.hp, game.player.maxHp, 'no damage taken');
  assert.ok(game.player.hand.some(c => c.id === 'keep-this'), 'unselected card stays in hand');
  assert.ok(!game.player.hand.some(c => c.id === 'discard-this-1'), 'selected card #1 left hand');
  assert.ok(!game.player.hand.some(c => c.id === 'discard-this-2'), 'selected card #2 left hand');
  assert.ok(game.discard.some(c => c.id === 'discard-this-1'));
  assert.ok(game.discard.some(c => c.id === 'discard-this-2'));
});

test('v13 审计三轮: 刚烈成本仅手牌 — 手牌不足 2 张时装备不可顶替, 直接受 1 伤', () => {
  // spec (card__hero__wei.md): "1.弃置两张手牌；2.受到1点伤害" — 装备区牌
  // 不是手牌, 不能作为该选项的成本 (此前误将装备计入候选)。
  const game = buildGame('sunquan', 'xiahoudun');
  game.player.hand = [
    c('sha', { id: 'attack-sha', suit: 'spade', color: 'black' }),
    c('shan', { id: 'spare-hand', suit: 'heart', color: 'red' })
  ];
  game.player.equipment.weapon = c('zhuge', { id: 'equip-weapon' });
  game.deck = [c('sha', { id: 'judge-black', suit: 'club', color: 'black' })];

  const hpBefore = game.player.hp;
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'attack-sha'));
  // 出杀后手牌只剩 1 张 (spare-hand), 装备不计 → 无"弃两张"选项 → 直接受伤
  assert.equal(Engine.getPendingChoice(game), null, '手牌不足 2 → 无选择直接受伤');
  assert.equal(game.player.hp, hpBefore - 1, '受 1 点刚烈反制伤害');
  assert.equal(game.player.equipment.weapon.id, 'equip-weapon', '装备保留 (不可作成本)');
  assert.ok(game.player.hand.some(c => c.id === 'spare-hand'), '手牌保留');
});

test('v13 审计三轮: 刚烈候选仅列手牌 (手牌够 2 张时装备不入候选)', () => {
  const game = buildGame('sunquan', 'xiahoudun');
  game.player.hand = [
    c('sha', { id: 'attack-sha', suit: 'spade', color: 'black' }),
    c('shan', { id: 'hand-1', suit: 'heart', color: 'red' }),
    c('tao', { id: 'hand-2', suit: 'heart', color: 'red' })
  ];
  game.player.equipment.weapon = c('zhuge', { id: 'equip-weapon' });
  game.deck = [c('sha', { id: 'judge-black', suit: 'club', color: 'black' })];

  assertCardConservation(game, () => Engine.playCard(game, 'player', 'attack-sha'));
  const pending = Engine.getPendingChoice(game);
  assert.ok(pending, '手牌够 2 张 → 出选择');
  const candidateIds = pending.candidates.map(e => e.id);
  assert.ok(candidateIds.includes('hand-1'), '手牌是候选');
  assert.ok(!candidateIds.includes('equip-weapon'), '装备不是候选');

  assertCardConservation(game, () => Engine.resolvePendingChoice(game, {
    mode: 'discard',
    cardIds: ['hand-1', 'hand-2']
  }));
  assert.ok(game.discard.some(c => c.id === 'hand-1'));
  assert.ok(game.discard.some(c => c.id === 'hand-2'));
  assert.equal(game.player.equipment.weapon.id, 'equip-weapon', '装备保留');
});

test('Player source can refuse the discard option and take 1 damage instead', () => {
  const game = buildGame('sunquan', 'xiahoudun');
  game.player.hand = [
    c('sha', { id: 'attack-sha', suit: 'spade', color: 'black' }),
    c('shan', { id: 'precious-1', suit: 'heart', color: 'red' }),
    c('tao', { id: 'precious-2', suit: 'heart', color: 'red' })
  ];
  game.deck = [c('sha', { id: 'judge-black', suit: 'club', color: 'black' })];

  const hpBefore = game.player.hp;
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'attack-sha'));
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { mode: 'takeDamage' }));

  assert.equal(game.player.hp, hpBefore - 1, 'player took 1 damage instead of discarding');
  assert.ok(game.player.hand.some(c => c.id === 'precious-1'), 'precious cards kept');
  assert.ok(game.player.hand.some(c => c.id === 'precious-2'));
  assert.ok(game.log.some(l => /受到 1 点伤害/.test(l)));
});

// ─── Validation ─────────────────────────────────────────────────────

test('Discard with 1 cardId fails and restores pendingChoice', () => {
  const game = buildGame('sunquan', 'xiahoudun');
  game.player.hand = [
    c('sha', { id: 'attack-sha', suit: 'spade', color: 'black' }),
    c('shan', { id: 'card-a', suit: 'heart', color: 'red' }),
    c('shan', { id: 'card-b', suit: 'heart', color: 'red' })
  ];
  game.deck = [c('sha', { id: 'judge-black', suit: 'club', color: 'black' })];

  assertCardConservation(game, () => Engine.playCard(game, 'player', 'attack-sha'));
  const r = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { mode: 'discard', cardIds: ['card-a'] }));
  assert.equal(r.ok, false);
  assert.ok(Engine.getPendingChoice(game), 'invalid input must not consume the prompt');
});

test('Discard with same cardId twice fails', () => {
  const game = buildGame('sunquan', 'xiahoudun');
  game.player.hand = [
    c('sha', { id: 'attack-sha', suit: 'spade', color: 'black' }),
    c('shan', { id: 'lone-card', suit: 'heart', color: 'red' }),
    c('tao', { id: 'other-card', suit: 'heart', color: 'red' })
  ];
  game.deck = [c('sha', { id: 'judge-black', suit: 'club', color: 'black' })];

  assertCardConservation(game, () => Engine.playCard(game, 'player', 'attack-sha'));
  const r = assertCardConservation(game, () => Engine.resolvePendingChoice(game, {
    mode: 'discard',
    cardIds: ['lone-card', 'lone-card']
  }));
  assert.equal(r.ok, false, 'cannot discard same card twice');
  assert.ok(Engine.getPendingChoice(game));
});

// ─── AI behavior (auto path) ─────────────────────────────────────────

test('AI 夏侯惇 auto-fires + AI source auto-discards 2 (no pendingChoice)', () => {
  // Player attacks AI 夏侯惇. 夏侯惇 is AI → auto-fire. Source is player
  // → 'ask' by default → pendingChoice. We need player as AI for the
  // full auto path, so set both prefs to 'auto'.
  const game = buildGame('sunquan', 'xiahoudun');
  Engine.setSkillPreference(game, 'player', 'ganglieSource', 'auto');
  game.player.hand = [
    c('sha', { id: 'attack-sha', suit: 'spade', color: 'black' }),
    c('shan', { id: 'trash-1', suit: 'spade', color: 'black' }),
    c('shan', { id: 'trash-2', suit: 'spade', color: 'black' })
  ];
  game.deck = [c('sha', { id: 'judge-black', suit: 'club', color: 'black' })];

  assertCardConservation(game, () => Engine.playCard(game, 'player', 'attack-sha'));

  assert.equal(Engine.getPendingChoice(game), null, 'auto path consumes both prompts without suspension');
  assert.equal(game.player.hand.length, 0, 'AI source auto-discarded its remaining 2 cards');
  assert.equal(game.player.hp, game.player.maxHp, 'no damage taken (discard path was taken)');
});

console.log('\nGanglie player-choice tests passed.');
