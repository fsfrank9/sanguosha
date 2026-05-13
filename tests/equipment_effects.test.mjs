import assert from 'node:assert/strict';
import { Engine, StateRuntime } from './helpers/load-engine.mjs';

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function blankState() {
  return {
    skills: [],
    equipment: { weapon: null, armor: null, horsePlus: null, horseMinus: null }
  };
}

// ─── Registry API ──────────────────────────────────────────────────────

test('StateRuntime exposes hasEquipmentEffect and sumEquipmentEffect', () => {
  assert.equal(typeof StateRuntime.hasEquipmentEffect, 'function');
  assert.equal(typeof StateRuntime.sumEquipmentEffect, 'function');
});

test('hasEquipmentEffect returns false for state with no equipment', () => {
  const state = blankState();
  assert.equal(StateRuntime.hasEquipmentEffect(state, 'unlimitedSha'), false);
  assert.equal(StateRuntime.hasEquipmentEffect(state, 'ignoreArmorOnSha'), false);
  assert.equal(StateRuntime.hasEquipmentEffect(state, 'blockBlackSha'), false);
});

test('zhuge crossbow grants unlimitedSha via equipment registry', () => {
  const state = blankState();
  state.equipment.weapon = c('zhuge');
  assert.equal(StateRuntime.hasEquipmentEffect(state, 'unlimitedSha'), true);
  // Also reachable via canUseUnlimitedSha which OR-merges skills + equipment.
  assert.equal(StateRuntime.canUseUnlimitedSha(state), true);
});

test('qinggang sword grants ignoreArmorOnSha', () => {
  const state = blankState();
  state.equipment.weapon = c('qinggang');
  assert.equal(StateRuntime.hasEquipmentEffect(state, 'ignoreArmorOnSha'), true);
});

test('renwang shield grants blockBlackSha', () => {
  const state = blankState();
  state.equipment.armor = c('renwang');
  assert.equal(StateRuntime.hasEquipmentEffect(state, 'blockBlackSha'), true);
});

test('non-registered equipment type contributes no effects', () => {
  const state = blankState();
  state.equipment.weapon = c('zhangba');  // active skill, no passive flags
  assert.equal(StateRuntime.hasEquipmentEffect(state, 'unlimitedSha'), false);
  assert.equal(StateRuntime.hasEquipmentEffect(state, 'ignoreArmorOnSha'), false);
});

test('sumEquipmentEffect returns 0 when no slot contributes', () => {
  const state = blankState();
  assert.equal(StateRuntime.sumEquipmentEffect(state, 'nonexistent'), 0);
  state.equipment.weapon = c('zhuge');  // boolean effect, not numeric
  assert.equal(StateRuntime.sumEquipmentEffect(state, 'unlimitedSha'), 0,
    'boolean effects do not accumulate as numbers');
});

// ─── Behavior (existing flows still work through the new pathway) ─────

function setupSkillGame(playerHero, enemyHero) {
  const game = Engine.newGame({ seed: 1111, playerHero, enemyHero });
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
  game.turn = 'player';
  game.phase = 'play';
  return game;
}

test('integration: zhuge crossbow allows multiple Sha in one play phase', () => {
  const game = setupSkillGame('sunquan', 'liubei');
  game.player.equipment.weapon = c('zhuge');
  game.player.hand = [c('sha', { id: 'multi-sha-1' }), c('sha', { id: 'multi-sha-2' })];
  assert.equal(Engine.playCard(game, 'player', 'multi-sha-1').ok, true);
  assert.equal(Engine.playCard(game, 'player', 'multi-sha-2').ok, true);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 2);
});

test('integration: qinggang sword causes a black Sha to bypass renwang shield', () => {
  const game = setupSkillGame('sunquan', 'liubei');
  game.player.equipment.weapon = c('qinggang');
  game.player.hand = [c('sha', { id: 'qg-sha', suit: 'spade', color: 'black' })];
  game.enemy.equipment.armor = c('renwang');
  assert.equal(Engine.playCard(game, 'player', 'qg-sha').ok, true);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1,
    'qinggang ignores renwang → black Sha lands');
});

test('integration: renwang shield blocks a black Sha (no qinggang)', () => {
  const game = setupSkillGame('sunquan', 'liubei');
  game.player.hand = [c('sha', { id: 'black-sha', suit: 'spade', color: 'black' })];
  game.enemy.equipment.armor = c('renwang');
  assert.equal(Engine.playCard(game, 'player', 'black-sha').ok, true);
  assert.equal(game.enemy.hp, game.enemy.maxHp,
    'renwang cancels black Sha without armor pierce');
});

test('integration: renwang does NOT block a red Sha', () => {
  const game = setupSkillGame('sunquan', 'liubei');
  game.player.hand = [c('sha', { id: 'red-sha', suit: 'heart', color: 'red' })];
  game.enemy.equipment.armor = c('renwang');
  assert.equal(Engine.playCard(game, 'player', 'red-sha').ok, true);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1,
    'red Sha is not affected by renwang');
});

console.log('\nEquipment passive effects tests passed.');
