// Independent AC payment review. Sources: wu.md:457 (Dimeng), wu.md:279
// (Yinghun), wu.md:255 (Xiaoji), equipment.md:192-196 (Silver Lion loss effect).
import assert from 'node:assert/strict';
import { Engine, c, StateRuntime } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function paymentGame() {
  const game = Engine.newGame({ seed: 169123, seats: ['player', 'enemy', 'ally'],
    playerHero: 'lusu', enemyHero: 'sunjian', allyHero: 'caiwenji',
    roles: { player: '主公', enemy: '反贼', ally: '反贼' } });
  for (const actor of game.seats) Object.assign(game[actor], {
    hand: [], judgeArea: [], skills: [], flags: {}, equipment: {},
    hp: 4, maxHp: 4, skillPreferences: {}
  });
  Object.assign(game, { turn: 'player', phase: 'play', pendingChoice: null,
    pendingChoiceQueue: [], pauseState: {}, discard: [], deck: [], log: [] });
  return game;
}
function grant(game, actor, skill) { StateRuntime.grantSkill(game[actor], skill); }
function answer(game, decision) {
  return assertCardConservation(game, () => Engine.resolvePendingChoice(game,
    { choiceId: game.pendingChoice?.choiceId, ...decision }));
}
function equipCosts(game) {
  game.player.hp = 2;
  game.player.equipment.weapon = c('qinggang', { id: 'weapon-cost' });
  game.player.equipment.armor = c('baiyin', { id: 'armor-cost' });
  grant(game, 'player', 'xiaoji');
}
function assertBothLosses(game) {
  assert.equal(game.player.hp, 3, 'committed Silver Lion loss must heal even after its material was redrawn');
  assert.equal(game.log.filter(line => line.includes('发动【枭姬】')).length, 2);
  assert.equal(game.player.equipment.weapon, null);
  assert.equal(game.player.equipment.armor, null);
  assert.equal(game.pendingChoice, null);
  assert.equal(game.pauseState.responseFlows.length, 0);
}

test('AC-P1 Dimeng equipment loss events survive first Xiaoji reshuffling both cost cards', () => {
  const game = paymentGame(); equipCosts(game); grant(game, 'player', 'dimeng');
  game.enemy.hand = ['e1', 'e2', 'e3'].map(id => c('sha', { id }));
  game.ally.hand = [c('sha', { id: 'a1' })];
  assert.equal(assertCardConservation(game, () => Engine.useSkill(game, 'player', 'dimeng',
    ['weapon-cost', 'armor-cost'], { targetA: 'enemy', targetB: 'ally' })).ok, true);
  assertBothLosses(game);
  assert.deepEqual(game.enemy.hand.map(card => card.id), ['a1']);
  assert.deepEqual(game.ally.hand.map(card => card.id), ['e1', 'e2', 'e3']);
});

test('AC-P1 forced discard equipment events survive first Xiaoji reshuffling both cost cards', () => {
  const game = paymentGame(); equipCosts(game); grant(game, 'enemy', 'yinghun');
  game.enemy.hp = 2; game.enemy.skillPreferences.yinghun = 'ask';
  game.deck = [c('sha', { id: 'yinghun-draw' })];
  assert.equal(assertCardConservation(game, () => Engine.startTurn(game, 'enemy')).ok, true);
  assert.equal(game.pendingChoice.kind, 'yinghun-choice');
  assert.equal(answer(game, { option: 2, target: 'player' }).ok, true);
  assert.equal(game.pendingChoice.godChoiceType, 'effect-discard');
  assert.equal(answer(game, { cardIds: ['weapon-cost', 'armor-cost'] }).ok, true);
  assertBothLosses(game);
  assert.ok(game.player.hand.some(card => card.id === 'yinghun-draw'));
});

test('AC payment crossreview: forced discard JSON rejects stale/duplicate IDs before payment and survives source skill loss', () => {
  let game = paymentGame(); equipCosts(game); grant(game, 'enemy', 'yinghun');
  game.enemy.hp = 2; game.enemy.skillPreferences.yinghun = 'ask';
  game.deck = [c('sha', { id: 'yinghun-draw' })];
  assert.equal(assertCardConservation(game, () => Engine.startTurn(game, 'enemy')).ok, true);
  assert.equal(answer(game, { option: 2, target: 'player' }).ok, true);
  const original = game;
  game = JSON.parse(JSON.stringify(game));
  const choiceId = game.pendingChoice.choiceId;
  for (const bad of [{ choiceId: choiceId - 1, cardIds: ['weapon-cost', 'armor-cost'] },
    { cardIds: ['weapon-cost', 'weapon-cost'] }, { cardIds: ['weapon-cost', 'missing'] }]) {
    assert.equal(answer(game, bad).ok, false);
    assert.equal(game.pendingChoice.choiceId, choiceId);
    assert.equal(game.player.hp, 2);
    assert.equal(game.player.equipment.weapon.id, 'weapon-cost');
    assert.equal(game.player.equipment.armor.id, 'armor-cost');
    assert.equal(game.discard.length, 0);
  }
  StateRuntime.stripAllSkills(game.enemy, game);
  assert.equal(answer(game, { cardIds: ['weapon-cost', 'armor-cost'] }).ok, true);
  assertBothLosses(game);
  assert.equal(original.player.hp, 2);
  assert.equal(original.player.equipment.armor.id, 'armor-cost', 'JSON execution cannot mutate original game');
});

test('AC payment crossreview: paid Dimeng keeps both old hands in processing through JSON and source skill loss', () => {
  let game = paymentGame(); grant(game, 'player', 'dimeng'); grant(game, 'player', 'jilue');
  game.player.godMarks = { nin: 1 };
  game.player.hand = [c('sha', { id: 'unused-retrial', suit: 'club' })];
  game.player.hp = 2;
  game.player.equipment.weapon = c('qinggang', { id: 'weapon-cost' });
  game.player.equipment.armor = c('baiyin', { id: 'armor-cost' });
  for (const actor of ['enemy', 'ally']) grant(game, actor, 'tuntian');
  game.enemy.hand = ['e1', 'e2', 'e3'].map(id => c('sha', { id }));
  game.ally.hand = [c('sha', { id: 'a1' })];
  game.deck = [c('sha', { id: 'judge-two', suit: 'heart' }), c('sha', { id: 'judge-one', suit: 'heart' })];
  assert.equal(assertCardConservation(game, () => Engine.useSkill(game, 'player', 'dimeng',
    ['weapon-cost', 'armor-cost'], { targetA: 'enemy', targetB: 'ally' })).ok, true);
  assert.equal(game.pendingChoice.reason, '【屯田】');
  assert.equal(game.player.hp, 3);
  assert.equal(game.enemy.hand.length, 0); assert.equal(game.ally.hand.length, 0);
  game = JSON.parse(JSON.stringify(game));
  StateRuntime.stripAllSkills(game.player, game);
  assert.equal(answer(game, { decline: true }).ok, true);
  assert.deepEqual(game.enemy.hand.map(card => card.id), ['a1']);
  assert.deepEqual(game.ally.hand.map(card => card.id), ['e1', 'e2', 'e3']);
  for (const id of ['weapon-cost', 'armor-cost']) assert.equal(game.discard.filter(card => card.id === id).length, 1);
  assert.equal(game.player.hp, 3);
  assert.equal(game.pendingChoice, null); assert.equal(game.pauseState.responseFlows.length, 0);
});

test('AC payment crossreview: already paid Beige survives holder skill loss after JSON loss judgement', () => {
  let game = paymentGame();
  grant(game, 'ally', 'beige'); grant(game, 'ally', 'tuntian'); grant(game, 'player', 'jilue');
  game.player.godMarks = { nin: 1 };
  game.ally.hp = 2; game.ally.equipment.armor = c('baiyin', { id: 'beige-cost' });
  game.player.hand = [c('sha', { id: 'attack' }), c('sha', { id: 'retrial', suit: 'heart' })];
  game.deck = [c('sha', { id: 'beige-heart', suit: 'heart' }), c('sha', { id: 'tuntian-club', suit: 'club' })];
  assert.equal(assertCardConservation(game, () => Engine.playCard(game, 'player', 'attack', { target: 'enemy' })).ok, true);
  assert.equal(game.pendingChoice.reason, '【屯田】');
  assert.equal(game.enemy.hp, 3); assert.equal(game.ally.hp, 3);
  game = JSON.parse(JSON.stringify(game));
  StateRuntime.stripAllSkills(game.ally, game);
  assert.equal(answer(game, { decline: true }).ok, true);
  if (game.pendingChoice) {
    assert.equal(game.pendingChoice.reason, '【悲歌】');
    assert.equal(answer(game, { decline: true }).ok, true);
  }
  assert.equal(game.enemy.hp, 4, 'paid Beige judgement still resolves after losing Beige');
  assert.equal(game.ally.hp, 3, 'equipment cost recovery occurs once');
  assert.equal(game.discard.filter(card => card.id === 'beige-cost').length, 1);
  assert.equal(game.pendingChoice, null); assert.equal(game.pauseState.responseFlows.length, 0);
});

await runTests({ collect: true });
