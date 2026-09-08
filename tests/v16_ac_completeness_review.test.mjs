import assert from 'node:assert/strict';
import { Engine, c, StateRuntime } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function game() {
  const g = Engine.newGame({ seed: 421, seats: ['player', 'enemy', 'ally', 'ally2', 'ally3'],
    playerHero: 'guanyu', enemyHero: 'zhangfei', allyHero: 'jiangwei',
    ally2Hero: 'liubei', ally3Hero: 'lvbu',
    roles: { player: '主公', enemy: '反贼', ally: '反贼', ally2: '忠臣', ally3: '内奸' } });
  for (const a of g.seats) Object.assign(g[a], { hand: [], flags: {}, equipment: {},
    hp: 4, maxHp: 4, skillPreferences: {} });
  Object.assign(g, { pendingChoice: null, pendingChoiceQueue: [], pauseState: {}, turn: 'ally', phase: 'play',
    discard: [], log: [], deck: Array.from({ length: 30 }, (_, i) => c('sha', { id: 'deck-' + i, suit: 'club' })) });
  return g;
}

// Peer review WS1. shu.md:354 requires USE Sha; glossary__card.md:49-52
// explicitly excludes an equipped weapon converted by Wusheng when its range
// is needed to reach the target. An invalid request cannot trigger paid loss.
test('AC peer Tiaoxin rejects range-providing weapon conversion before equipment-loss effects', () => {
  const g = game(); StateRuntime.grantSkill(g.player, 'xiaoji');
  g.player.equipment.weapon = c('qinggang', { id: 'red-weapon', suit: 'heart' });
  assert.equal(Engine.distanceBetween(g, 'player', 'ally'), 2);
  assert.equal(assertCardConservation(g, () => Engine.useSkill(g, 'ally', 'tiaoxin', [], { target: 'player' })).ok, true);
  assert.equal(g.pendingChoice.kind, 'tiaoxin-demand');
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal(assertCardConservation(g, () => Engine.resolvePendingChoice(g, {
      choiceId: g.pendingChoice.choiceId, cardId: 'red-weapon'
    })).ok, false);
    assert.equal(g.player.hand.length, 0, 'rejected conversion must not grant Xiaoji draws');
    assert.equal(g.deck.length, 30); assert.equal(g.player.equipment.weapon.id, 'red-weapon');
    assert.equal(g.ally.hp, 4); assert.equal(g.pendingChoice.kind, 'tiaoxin-demand');
  }
});

// rule__principle.md:42 supplies this exact ordering example: transferred
// damage -> Kuanggu recovery -> Tianxiang draws for the remaining lost HP.
test('AC peer JSON Tianxiang self-transfer lets Kuanggu heal before calculating the draw', () => {
  let g = game(); g.turn = 'enemy';
  StateRuntime.grantSkill(g.player, 'tianxiang'); StateRuntime.grantSkill(g.enemy, 'kuanggu');
  g.player.skillPreferences.tianxiang = 'ask';
  g.player.hand = [c('tao', { id: 'transfer-cost', suit: 'heart' })];
  g.enemy.hand = [c('sha', { id: 'transfer-hit' })];
  assert.equal(assertCardConservation(g, () => Engine.playCard(g, 'enemy', 'transfer-hit', { target: 'player' })).ok, true);
  assert.equal(g.pendingChoice.kind, 'tianxiang-ask');
  const original = g; g = JSON.parse(JSON.stringify(g));
  assert.equal(assertCardConservation(g, () => Engine.resolvePendingChoice(g, {
    choiceId: g.pendingChoice.choiceId, cardId: 'transfer-cost', target: 'enemy'
  })).ok, true);
  assert.equal(g.enemy.hp, 4); assert.equal(g.enemy.hand.length, 0);
  assert.equal(g.player.hp, 4); assert.equal(g.deck.length, 30);
  assert.equal(g.pendingChoice, null); assert.equal(g.pauseState.responseFlows.length, 0);
  assert.equal(g.discard.filter(card => card.id === 'transfer-hit').length, 1);
  assert.equal(original.pendingChoice.kind, 'tianxiang-ask');
});

// Response peer added a live-target gate for Tiesuo. Challenge the moment after
// Wuxie: a counter cancels the nullification but cannot re-chain a dead target.
test('AC peer Tiesuo skips a target killed in a JSON Wuxie child and still resolves the next live target', () => {
  let g = Engine.newGame({ seed: 160099, playerHero: 'sunquan', enemyHero: 'liubei',
    allyHero: 'sunshangxiang', seats: ['player', 'enemy', 'ally'],
    roles: { player: '忠臣', enemy: '主公', ally: '反贼' } });
  for (const a of g.seats) Object.assign(g[a], { hand: [], judgeArea: [], equipment: {}, flags: {},
    hp: 4, maxHp: 4, chained: false, skillPreferences: { dying: 'decline', wuxieResponse: 'decline' } });
  Object.assign(g, { turn: 'player', phase: 'play', pendingChoice: null, pendingChoiceQueue: [], pauseState: {},
    discard: [], log: [], deck: Array.from({ length: 20 }, (_, i) => c('tao', { id: 'tiesuo-deck-' + i })) });
  g.player.hp = 1; g.player.hand = [c('tiesuo', { id: 'tiesuo-use', suit: 'heart' }), c('shan', { id: 'unpaid-shan' })];
  g.player.skillPreferences.shanResponse = 'ask';
  g.enemy.hand = [c('wuxie', { id: 'counter', suit: 'heart' })]; g.enemy.skillPreferences.wuxieResponse = 'auto';
  g.ally.hand = [c('wuxie', { id: 'nullify', suit: 'spade' })];
  Object.assign(g.ally.skillPreferences, { wuxieResponse: 'auto', wuxiePolicy: 'always' });
  g.ally.equipment.weapon = c('yinyue', { id: 'silver-moon' });
  assert.equal(assertCardConservation(g, () => Engine.playCard(g, 'player', 'tiesuo-use', { targets: ['player', 'enemy'] })).ok, true);
  assert.equal(g.pendingChoice.kind, 'yinyue-response'); g = JSON.parse(JSON.stringify(g));
  assert.equal(assertCardConservation(g, () => Engine.resolvePendingChoice(g, { decline: true })).ok, true);
  assert.equal(g.player.hp, 0); assert.equal(g.player.chained, false); assert.equal(g.enemy.chained, true);
  assert.notEqual(g.phase, 'gameover'); assert.equal(g.pendingChoice, null);
  assert.equal(g.pauseState.responseFlows.length, 0);
  assert.equal(g.discard.filter(card => card.id === 'tiesuo-use').length, 1);
});

await runTests({ collect: true });
