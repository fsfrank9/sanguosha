import assert from 'node:assert/strict';
import { Engine, c, StateRuntime } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function game() {
  const g = Engine.newGame({ seed: 169123, seats: ['player', 'enemy', 'ally'],
    playerHero: 'lusu', enemyHero: 'zhangfei', allyHero: 'caiwenji',
    roles: { player: '主公', enemy: '反贼', ally: '反贼' } });
  for (const a of g.seats) Object.assign(g[a], { hand: [], skills: [], flags: {}, equipment: {},
    hp: 4, maxHp: 4, skillPreferences: {} });
  Object.assign(g, { pendingChoice: null, pendingChoiceQueue: [], pauseState: {}, turn: 'player', phase: 'play',
    discard: [], log: [], deck: Array.from({ length: 30 }, (_, i) => c('sha', { id: 'deck-' + i, suit: 'heart' })) });
  return g;
}
function grant(g, actor, id) { StateRuntime.grantSkill(g[actor], id); }
function answer(g, decision) { return Engine.resolvePendingChoice(g, { choiceId: g.pendingChoice?.choiceId, ...decision }); }
function dimeng(g, ids) { return Engine.useSkill(g, 'player', 'dimeng', ids, { targetA: 'enemy', targetB: 'ally' }); }
function dimengHands(g) {
  grant(g, 'player', 'dimeng');
  g.player.hand = ['cost', 'other'].map(id => c('sha', { id }));
  g.enemy.hand = ['e1', 'e2', 'e3'].map(id => c('sha', { id }));
  g.ally.hand = [c('sha', { id: 'a1' })];
}

// wu.md:457; glossary__zone.md:80. The complete payment must exist before exchange.
for (const ids of [['cost', 'cost'], ['ghost', 'ghost'], ['cost', 'ghost']]) {
  test('AC Dimeng rejects invalid complete payment atomically: ' + ids.join(','), () => {
    const g = game(); dimengHands(g); const before = JSON.stringify(g);
    assert.equal(assertCardConservation(g, () => dimeng(g, ids)).ok, false);
    assert.equal(JSON.stringify(g), before);
  });
}
test('AC Dimeng accepts hand plus equipment payment and applies equipment loss once', () => {
  const g = game(); dimengHands(g); g.player.hand.pop(); g.player.hp = 2;
  g.player.equipment.armor = c('baiyin', { id: 'armor-cost' });
  assert.equal(assertCardConservation(g, () => dimeng(g, ['cost', 'armor-cost'])).ok, true);
  assert.equal(g.player.hp, 3); assert.equal(g.player.equipment.armor, null);
  assert.deepEqual(g.enemy.hand.map(card => card.id), ['a1']);
  assert.deepEqual(g.discard.filter(card => ['cost', 'armor-cost'].includes(card.id)).map(card => card.id).sort(), ['armor-cost', 'cost']);
});

// neutral.md:391. One own card includes equipment (glossary__zone.md:80).
test('AC Beige may pay its only equipment and loss recovery occurs before judgement effect', () => {
  const g = game(); grant(g, 'ally', 'beige'); g.ally.hp = 2;
  g.ally.equipment.armor = c('baiyin', { id: 'beige-cost' });
  g.player.hand = [c('sha', { id: 'attack' })];
  assert.equal(assertCardConservation(g, () => Engine.playCard(g, 'player', 'attack', { target: 'enemy' })).ok, true);
  assert.equal(g.enemy.hp, 4, 'heart judgement heals the one Sha damage');
  assert.equal(g.ally.hp, 3, 'Silver Lion loss heals cost payer');
  assert.equal(g.ally.equipment.armor, null);
  assert.equal(g.discard.filter(card => card.id === 'beige-cost').length, 1);
});

// legend.md:27; glossary__description.md:201,227 explicitly disallow healing when everyone is full.
test('AC Qinyin cannot choose an impossible all-full recovery effect', () => {
  const g = game(); grant(g, 'player', 'qinyin');
  g.player.hand = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => c('sha', { id }));
  Engine.finishPlayPhase(g); Engine.discardSelected(g, 'player', ['a', 'b']); Engine.advancePhase(g);
  assert.equal(g.pendingChoice.godChoiceType, 'qinyin');
  assert.equal(answer(g, { optionId: 'recover' }).ok, false);
  assert.equal(g.pendingChoice.godChoiceType, 'qinyin');
  assert.equal(answer(g, { optionId: 'lose' }).ok, true);
  for (const a of g.seats) assert.equal(g[a].hp, 3);
});

// wu.md:471; the god discard-end choice must retain IDs through JSON save/restore.
test('AC Qinyin JSON pause preserves following Guzheng discard entitlement', () => {
  let g = game(); grant(g, 'player', 'qinyin'); grant(g, 'enemy', 'guzheng');
  g.player.hand = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => c('sha', { id }));
  Engine.finishPlayPhase(g); Engine.discardSelected(g, 'player', ['a', 'b']); Engine.advancePhase(g);
  assert.equal(g.pendingChoice.godChoiceType, 'qinyin');
  g = JSON.parse(JSON.stringify(g));
  assert.equal(assertCardConservation(g, () => answer(g, { optionId: 'lose' })).ok, true);
  assert.equal(g.player.hand.length, 5, 'one discarded hand returns to its owner');
  assert.equal(g.enemy.hand.length, 1, 'the remaining discard goes to Guzheng holder');
  assert.equal(g.discard.length, 0);
});

test('AC Beige equipment loss pauses for Tuntian before judgement, with JSON-safe payment', () => {
  let g = game(); grant(g, 'ally', 'beige'); grant(g, 'ally', 'tuntian'); grant(g, 'player', 'jilue');
  g.player.godMarks = { nin: 1 }; g.ally.hp = 2;
  g.ally.equipment.armor = c('baiyin', { id: 'beige-cost' });
  g.player.hand = [c('sha', { id: 'attack' }), c('sha', { id: 'replace', suit: 'heart' })];
  assertCardConservation(g, () => Engine.playCard(g, 'player', 'attack', { target: 'enemy' }));
  assert.equal(g.pendingChoice.kind, 'guicai-replace'); assert.equal(g.pendingChoice.reason, '【屯田】');
  assert.equal(g.enemy.hp, 3, 'Beige judgement has not healed yet'); assert.equal(g.ally.hp, 3);
  g = JSON.parse(JSON.stringify(g));
  assertCardConservation(g, () => answer(g, { cardId: 'replace' }));
  assert.equal(g.enemy.hp, 4); assert.equal(g.ally.hp, 3); assert.equal(g.player.godMarks.nin, 0);
  assert.equal(g.discard.filter(card => card.id === 'beige-cost').length, 1);
  assert.equal(g.log.filter(line => line.includes('发动【悲歌】')).length, 1);
  assert.equal(g.pendingChoice, null); assert.equal(g.pauseState.responseFlows.length, 0);
});

test('AC Dimeng exchange notifies both simultaneous last-hand losses before either acquisition', () => {
  const g = game(); grant(g, 'player', 'dimeng');
  for (const a of ['enemy', 'ally']) { grant(g, a, 'lianying'); g[a].hand = [c('sha', { id: a + '-held' })]; }
  assertCardConservation(g, () => dimeng(g, []));
  assert.equal(g.enemy.hand.length, 2); assert.equal(g.ally.hand.length, 2);
  assert.ok(g.enemy.hand.some(card => card.id === 'ally-held'));
  assert.ok(g.ally.hand.some(card => card.id === 'enemy-held'));
});

test('AC Dimeng exchange gives each off-turn Tuntian owner a judgement', () => {
  const g = game(); grant(g, 'player', 'dimeng');
  for (const a of ['enemy', 'ally']) { grant(g, a, 'tuntian'); g[a].hand = [c('sha', { id: a + '-held' })]; }
  g.deck.forEach(card => { card.suit = 'club'; card.color = 'black'; });
  assertCardConservation(g, () => dimeng(g, []));
  assert.equal((g.enemy.tian || []).length, 1); assert.equal((g.ally.tian || []).length, 1);
});

test('AC Dimeng processing hands survive two serial Tuntian JSON windows and exchange only afterward', () => {
  let g = game(); grant(g, 'player', 'dimeng'); grant(g, 'player', 'jilue');
  g.player.godMarks = { nin: 2 };
  g.player.hand = ['replace1', 'replace2'].map(id => c('sha', { id, suit: 'club' }));
  for (const a of ['enemy', 'ally']) { grant(g, a, 'tuntian'); g[a].hand = [c('sha', { id: a + '-held' })]; }
  assertCardConservation(g, () => dimeng(g, []));
  assert.equal(g.pendingChoice.reason, '【屯田】');
  assert.equal(g.enemy.hand.length, 0); assert.equal(g.ally.hand.length, 0);
  const original = g; g = JSON.parse(JSON.stringify(g));
  assertCardConservation(g, () => answer(g, { cardId: 'replace1' }));
  assert.equal(g.pendingChoice.reason, '【屯田】');
  assert.equal(g.enemy.hand.length, 0); assert.equal(g.ally.hand.length, 0);
  assert.equal(g.enemy.tian[0].id, 'replace1');
  g = JSON.parse(JSON.stringify(g));
  assertCardConservation(g, () => answer(g, { cardId: 'replace2' }));
  assert.deepEqual(g.enemy.hand.map(card => card.id), ['ally-held']);
  assert.deepEqual(g.ally.hand.map(card => card.id), ['enemy-held']);
  assert.equal(g.ally.tian[0].id, 'replace2'); assert.equal(g.player.godMarks.nin, 0);
  assert.equal(original.player.godMarks.nin, 2); assert.equal(original.enemy.hand.length, 0);
  assert.equal(g.pendingChoice, null); assert.equal(g.pauseState.responseFlows.length, 0);
});

test('AC Dimeng paid exchange persists after source loses skills during the loss judgement window', () => {
  const g = game(); grant(g, 'player', 'dimeng'); grant(g, 'player', 'jilue');
  g.player.godMarks = { nin: 1 }; g.player.hand = [c('sha', { id: 'replace' })];
  for (const a of ['enemy', 'ally']) { grant(g, a, 'tuntian'); g[a].hand = [c('sha', { id: a + '-held' })]; }
  assertCardConservation(g, () => dimeng(g, []));
  assert.equal(g.pendingChoice.reason, '【屯田】'); StateRuntime.stripAllSkills(g.player, g);
  assertCardConservation(g, () => answer(g, { decline: true }));
  assert.deepEqual(g.enemy.hand.map(card => card.id), ['ally-held']);
  assert.deepEqual(g.ally.hand.map(card => card.id), ['enemy-held']);
  assert.equal(g.pendingChoice, null); assert.equal(g.pauseState.responseFlows.length, 0);
});

await runTests({ collect: true });
