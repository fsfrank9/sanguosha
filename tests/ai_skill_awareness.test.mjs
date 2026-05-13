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
  const game = Engine.newGame({ seed: 4242, playerHero, enemyHero });
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

// ─── 观星 (zhugeliang) ─────────────────────────────────────────────────

test('AI fires 观星 when available — free information action', () => {
  const game = buildGame('sunquan', 'zhugeliang');
  game.enemy.hand = [];
  game.deck = [c('sha', { id: 'top-1' }), c('sha', { id: 'top-2' })];
  const action = Engine.aiChooseSkillAction(game, 'enemy');
  assert.ok(action, 'AI should pick a skill action');
  assert.equal(action.skillId, 'guanxing', 'AI should choose 观星 first when available');
});

test('AI does NOT fire 观星 twice in a single turn (flag set)', () => {
  const game = buildGame('sunquan', 'zhugeliang');
  game.enemy.hand = [];
  game.deck = [c('sha', { id: 'gx-1' }), c('sha', { id: 'gx-2' })];
  Engine.aiTakeAction(game, 'enemy');
  assert.equal(game.enemy.flags.guanxingUsed, true, 'flag set after first guanxing fire');
  const action2 = Engine.aiChooseSkillAction(game, 'enemy');
  // Either fall through to other skills/card play, OR null. Critical thing:
  // it cannot be guanxing again.
  assert.ok(!action2 || action2.skillId !== 'guanxing', 'cannot re-fire 观星 same turn');
});

// ─── 仁德 (liubei) ─────────────────────────────────────────────────────

test('AI does NOT fire 仁德 when HP is full (heal can\'t fire)', () => {
  const game = buildGame('sunquan', 'liubei');
  game.enemy.hand = [c('sha', { id: 'r-1' }), c('sha', { id: 'r-2' })];
  game.enemy.hp = game.enemy.maxHp;  // full HP
  const action = Engine.aiChooseSkillAction(game, 'enemy');
  assert.ok(!action || action.skillId !== 'rende', 'no 仁德 at full HP');
});

test('AI fires 仁德 when rendeGiven >= 1 and below max HP — heal trigger', () => {
  const game = buildGame('sunquan', 'liubei');
  game.enemy.hand = [c('sha', { id: 'r-1' }), c('sha', { id: 'r-2' })];
  game.enemy.hp = game.enemy.maxHp - 1;
  game.enemy.flags.rendeGiven = 1;  // one more triggers heal
  const action = Engine.aiChooseSkillAction(game, 'enemy');
  assert.ok(action, 'expected a skill action');
  assert.equal(action.skillId, 'rende');
  assert.equal(action.cardIds.length, 1, 'gives exactly one card');
});

test('AI fires 仁德 emergency when HP <= 1 and has >= 2 cards', () => {
  const game = buildGame('sunquan', 'liubei');
  game.enemy.hand = [c('sha', { id: 'r-a' }), c('sha', { id: 'r-b' })];
  game.enemy.hp = 1;
  const action = Engine.aiChooseSkillAction(game, 'enemy');
  assert.ok(action);
  assert.equal(action.skillId, 'rende', 'emergency 仁德 to start heal chain');
});

test('AI 仁德 actually transfers a hand card to opponent when invoked', () => {
  const game = buildGame('sunquan', 'liubei');
  game.enemy.hand = [c('sha', { id: 'r-x' })];
  game.enemy.hp = game.enemy.maxHp - 1;
  game.enemy.flags.rendeGiven = 1;
  const before = game.player.hand.length;
  Engine.aiTakeAction(game, 'enemy');
  assert.equal(game.player.hand.length, before + 1, 'player received a card');
  assert.equal(game.enemy.flags.rendeHealed, true, 'heal flag set after the trigger fires');
});

// ─── 反间 (zhouyu) ─────────────────────────────────────────────────────

test('AI does NOT fire 反间 when no excess hand and opponent is healthy', () => {
  const game = buildGame('sunquan', 'zhouyu');
  game.enemy.hand = [c('sha', { id: 'f-1' })];  // not over hand limit
  game.player.hp = game.player.maxHp;  // healthy
  const action = Engine.aiChooseSkillAction(game, 'enemy');
  assert.ok(!action || action.skillId !== 'fanjian', 'AI skips 反间 unless excess or low-HP opp');
});

test('AI fires 反间 when opponent is at low HP — chip damage threat', () => {
  const game = buildGame('sunquan', 'zhouyu');
  game.enemy.hand = [c('sha', { id: 'f-2', suit: 'heart', color: 'red' })];
  game.player.hp = 2;  // vulnerable
  const action = Engine.aiChooseSkillAction(game, 'enemy');
  assert.ok(action, 'expected a skill action');
  assert.equal(action.skillId, 'fanjian');
  assert.equal(action.cardIds.length, 1);
});

test('AI prefers a non-spade card for 反间 (bias toward default-spade guess miss)', () => {
  const game = buildGame('sunquan', 'zhouyu');
  game.enemy.hand = [
    c('sha', { id: 'spade-card', suit: 'spade', color: 'black' }),
    c('sha', { id: 'heart-card', suit: 'heart', color: 'red' })
  ];
  game.player.hp = 1;  // ensure fanjian fires
  const action = Engine.aiChooseSkillAction(game, 'enemy');
  assert.equal(action.skillId, 'fanjian');
  assert.equal(action.cardIds[0], 'heart-card',
    'AI picks the non-spade card so the default spade guess tends to miss');
});

// ─── 整体回归 ──────────────────────────────────────────────────────────

test('AI skill priority: 观星 fires before 仁德 when both are available', () => {
  // Hypothetical hero (multi-skill not in catalog), so simulate via state.
  const game = buildGame('sunquan', 'zhugeliang');
  game.enemy.skills = [
    { id: 'guanxing', name: '观星', desc: '' },
    { id: 'rende', name: '仁德', desc: '' }
  ];
  game.enemy.hand = [c('sha', { id: 'p-1' }), c('sha', { id: 'p-2' })];
  game.enemy.hp = game.enemy.maxHp - 1;
  game.enemy.flags.rendeGiven = 1;
  game.deck = [c('sha', { id: 'preview-1' })];
  const action = Engine.aiChooseSkillAction(game, 'enemy');
  assert.equal(action.skillId, 'guanxing', 'free-info skill goes first');
});

test('AI does not fire any skill when 司马懿 has no actionable active skill', () => {
  // 司马懿's skills (fankui, guicai) are not active — should fall through.
  const game = buildGame('sunquan', 'simayi');
  game.enemy.hand = [c('sha', { id: 's-1' })];
  const action = Engine.aiChooseSkillAction(game, 'enemy');
  assert.equal(action, null, 'no active skill applies for 司马懿');
});

console.log('\nAI skill awareness tests passed.');
