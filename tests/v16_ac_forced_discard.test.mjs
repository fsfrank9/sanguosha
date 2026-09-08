import assert from 'node:assert/strict';
import { Engine, c, StateRuntime as S } from './helpers/load-engine.mjs';
import { collectCardCensus } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function game() {
  const g = Engine.newGame({ seed: 169260, seats: ['player', 'enemy', 'ally'],
    playerHero: 'zhangfei', enemyHero: 'sunjian', allyHero: 'caiwenji',
    roles: { player: '主公', enemy: '反贼', ally: '忠臣' } });
  for (const actor of g.seats) Object.assign(g[actor], { skills: [], hand: [], equipment: {},
    flags: {}, hp: 4, maxHp: 4, skillPreferences: {} });
  Object.assign(g, { turn: 'player', phase: 'play', pendingChoice: null,
    pendingChoiceQueue: [], pauseState: {}, discard: [], log: [],
    deck: Array.from({ length: 30 }, (_, index) => c('sha', { id: 'deck-' + index, suit: 'club' })) });
  return g;
}
const grant = (g, actor, id) => S.grantSkill(g[actor], id);
const answer = (g, decision) => Engine.resolvePendingChoice(g, { choiceId: g.pendingChoice?.choiceId, ...decision });
const ids = g => collectCardCensus(g).ids;
const countDiscard = (g, id) => g.discard.filter(card => card.id === id).length;
function yinghun() {
  const g = game(); grant(g, 'enemy', 'yinghun'); g.enemy.hp = 2;
  g.player.hand = [c('tao', { id: 'keep-or-pay' })];
  g.player.equipment.armor = c('baiyin', { id: 'armor-pay' }); g.player.hp = 2;
  Engine.startTurn(g, 'enemy');
  assert.equal(g.pendingChoice?.godChoiceType, 'effect-discard');
  assert.equal(g.pendingChoice.actor, 'player');
  return g;
}
function beige() {
  const g = game(); grant(g, 'ally', 'beige');
  g.ally.hand = [c('sha', { id: 'beige-cost' })];
  g.player.hand = [c('sha', { id: 'attack' }), c('tao', { id: 'held-1' }), c('tao', { id: 'held-2' })];
  g.player.equipment.armor = c('baiyin', { id: 'armor-pay' }); g.player.hp = 2;
  return g;
}

test('C26 Yinghun lets the affected player choose hand/equipment cards and pauses the next phase', () => {
  const g = yinghun(); const census = ids(g);
  assert.equal(g.phase, 'prepare');
  assert.equal(g.enemy.hand.length, 0, 'preparation has not advanced to enemy draw');
  assert.equal(g.player.hand.length, 2, 'Yinghun draws once before choice');
  assert.equal(g.pendingChoice.cardMin, 2);
  assert.equal(g.pendingChoice.cards.find(card => card.id === 'armor-pay').sourceZone, 'equipment');
  assert.equal(g.pendingChoice.optional, false);
  assert.equal(answer(g, { cardIds: ['armor-pay', 'keep-or-pay'] }).ok, true);
  assert.equal(g.player.hp, 3, 'discarding Silver Lion heals its owner');
  assert.equal(g.player.hand.length, 1);
  assert.equal(g.enemy.hand.length, 2, 'resume reaches normal draw exactly once');
  assert.equal(g.phase, 'play');
  assert.deepEqual(ids(g), census);
});

for (const selection of [[], ['keep-or-pay'], ['keep-or-pay', 'keep-or-pay'], ['keep-or-pay', 'unknown'], ['armor-pay', 'enemy-private'], ['armor-pay', 'judgement-card']]) {
  test('C26 rejects the whole invalid discard transaction without partial payment: ' + selection.join(','), () => {
    const g = yinghun();
    g.enemy.hand = [c('sha', { id: 'enemy-private' })];
    g.player.judgeArea = [c('lebusishu', { id: 'judgement-card' })];
    const before = JSON.stringify(g);
    assert.equal(answer(g, { cardIds: selection }).ok, false);
    assert.equal(JSON.stringify(g), before);
  });
}

test('C26 forced discard cannot decline or use a stale choice token', () => {
  const g = yinghun(); const before = JSON.stringify(g);
  assert.equal(answer(g, { decline: true }).ok, false);
  assert.equal(JSON.stringify(g), before);
  assert.equal(answer(g, { choiceId: g.pendingChoice.choiceId - 1, cardIds: ['armor-pay', 'keep-or-pay'] }).ok, false);
  assert.equal(JSON.stringify(g), before);
});

test('C26 Yinghun JSON resume keeps drawn cards and fires equipment-loss draws once', () => {
  let g = yinghun(); grant(g, 'player', 'xiaoji'); const census = ids(g);
  g = JSON.parse(JSON.stringify(g));
  assert.equal(answer(g, { cardIds: ['armor-pay', 'keep-or-pay'] }).ok, true);
  assert.equal(g.player.hand.length, 3, 'one kept Yinghun card plus two Xiaoji draws');
  assert.equal(g.player.hp, 3);
  assert.equal(countDiscard(g, 'armor-pay'), 1);
  assert.equal(countDiscard(g, 'keep-or-pay'), 1);
  assert.deepEqual(ids(g), census);
  assert.equal(g.pauseState.effectDiscard, null);
});

test('C26 Beige club uses the same mandatory player choice after its judgement', () => {
  const g = beige(); const census = ids(g);
  assert.equal(Engine.playCard(g, 'player', 'attack', { target: 'enemy' }).ok, true);
  assert.equal(g.pendingChoice?.godChoiceType, 'effect-discard');
  assert.equal(g.pendingChoice.effectSkillId, 'beige');
  assert.equal(g.pendingChoice.actor, 'player');
  assert.equal(g.player.hand.length, 2, 'attack paid; no arbitrary victim card has been discarded');
  assert.equal(answer(g, { cardIds: ['armor-pay', 'held-2'] }).ok, true);
  assert.deepEqual(g.player.hand.map(card => card.id), ['held-1']);
  assert.equal(g.player.hp, 3);
  assert.equal(g.enemy.hp, 3);
  assert.deepEqual(ids(g), census);
});

test('C26 Beige can discard equipment with no hand and clamps count to all available cards', () => {
  const g = beige(); g.player.hand = [g.player.hand[0]];
  assert.equal(Engine.playCard(g, 'player', 'attack', { target: 'enemy' }).ok, true);
  assert.equal(g.pendingChoice.cardMin, 1);
  assert.deepEqual(g.pendingChoice.cards.map(card => card.id), ['armor-pay']);
  assert.equal(answer(g, { cardIds: ['armor-pay'] }).ok, true);
  assert.equal(g.player.equipment.armor, null);
  assert.equal(g.player.hp, 3);
});

test('C26 Beige with no remaining own cards finishes without opening an impossible choice', () => {
  const g = beige(); g.player.hand = [g.player.hand[0]]; g.player.equipment = {};
  assert.equal(Engine.playCard(g, 'player', 'attack', { target: 'enemy' }).ok, true);
  assert.equal(g.pendingChoice, null);
  assert.equal(g.pauseState.effectDiscard, null);
  assert.equal(g.enemy.hp, 3);
});

test('C26 explicit auto preference picks only the affected role\'s legal cards', () => {
  const g = beige(); g.player.skillPreferences.effectDiscard = 'auto';
  const census = ids(g);
  assert.equal(Engine.playCard(g, 'player', 'attack', { target: 'enemy' }).ok, true);
  assert.equal(g.pendingChoice, null);
  assert.equal(g.player.hand.length + Object.values(g.player.equipment).filter(Boolean).length, 1);
  assert.deepEqual(ids(g), census);
});

test('C26 paid set survives nested Tuntian/Jilue judgement and JSON without another discard or draw', () => {
  let g = yinghun(); grant(g, 'player', 'tuntian'); grant(g, 'player', 'jilue');
  g.player.godMarks = { nin: 1 }; g.player.skillPreferences.jilue = 'ask';
  const census = ids(g);
  assert.equal(answer(g, { cardIds: ['armor-pay', 'keep-or-pay'] }).ok, true);
  assert.equal(g.pendingChoice?.kind, 'guicai-replace');
  assert.equal(g.pauseState.effectDiscard.lossNotified, true);
  assert.equal(g.enemy.hand.length, 0, 'nested judgement still blocks enemy draw');
  assert.equal(countDiscard(g, 'armor-pay'), 1);
  const kept = g.player.hand.map(card => card.id);
  g = JSON.parse(JSON.stringify(g));
  assert.equal(answer(g, { decline: true }).ok, true);
  assert.equal(g.pendingChoice, null);
  assert.equal(g.player.hp, 3);
  assert.deepEqual(g.player.hand.map(card => card.id), kept);
  assert.equal(g.player.tian.length, 1);
  assert.equal(g.enemy.hand.length, 2);
  assert.equal(g.pauseState.effectDiscard, null);
  assert.deepEqual(ids(g), census);
});


test('C26 an already-started Yinghun effect survives losing its source skill', () => {
  const g = yinghun(); S.stripAllSkills(g.enemy, g);
  assert.equal(answer(g, { cardIds: ['armor-pay', 'keep-or-pay'] }).ok, true);
  assert.equal(g.player.hand.length, 1);
  assert.equal(g.enemy.hand.length, 2);
  assert.equal(g.pendingChoice, null);
});

test('C26 terminal game cancels an unanswered discard without taking cards', () => {
  const g = yinghun(); const hand = g.player.hand.map(card => card.id);
  g.phase = 'gameover'; g.winner = 'player';
  assert.equal(answer(g, { cardIds: ['armor-pay', 'keep-or-pay'] }).ok, true);
  assert.deepEqual(g.player.hand.map(card => card.id), hand);
  assert.equal(g.player.equipment.armor.id, 'armor-pay');
  assert.equal(g.player.hp, 2);
  assert.equal(g.pendingChoice, null);
  assert.equal(g.pauseState.effectDiscard, null);
});

await runTests();
