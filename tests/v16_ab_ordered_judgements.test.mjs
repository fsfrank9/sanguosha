import assert from 'node:assert/strict';
import { Engine, c, StateRuntime } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function fresh() {
  const g = Engine.newGame({ seed: 80317, seats: ['enemy', 'player', 'ally', 'ally2', 'ally3'],
    playerHero: 'god_simayi', enemyHero: 'simayi', allyHero: 'zhangjiao', ally2Hero: 'god_guanyu', ally3Hero: 'liubei',
    godCamps: { player: '魏', ally2: '蜀' },
    roles: { player: '忠臣', enemy: '反贼', ally: '反贼', ally2: '反贼', ally3: '主公' } });
  for (const actor of g.seats) Object.assign(g[actor], { hand: [], judgeArea: [], equipment: {}, flags: {},
    hp: 4, maxHp: 4, skillPreferences: { dying: 'decline', guicai: 'decline', guidao: 'decline', jilue: 'ask', leiji: 'decline' } });
  Object.assign(g, { turn: 'enemy', phase: 'play', pendingChoice: null, pendingChoiceQueue: [], pauseState: {}, discard: [], log: [],
    deck: Array.from({ length: 30 }, (_, i) => c('sha', { id: 'ordered-deck-' + i, suit: 'club' })) });
  StateRuntime.grantSkill(g.player, 'jilue', '极略'); g.player.godMarks = { nin: 2 };
  g.player.hand = [c('shan', { id: 'god-heart', suit: 'heart' }), c('shan', { id: 'god-spare', suit: 'spade' })];
  g.enemy.hand = [c('sha', { id: 'native-spade', suit: 'spade' }), c('tao', { id: 'native-spare', suit: 'heart' })];
  g.ally.hand = [c('sha', { id: 'dao-club', suit: 'club' })];
  return g;
}
function delayed(g, actor = 'enemy') {
  g[actor].judgeArea = [c('lebusishu', { id: 'ordered-delay', suit: 'spade' })];
  Engine.startTurn(g, actor);
}
function resolve(g, decision) {
  const result = assertCardConservation(g, () => Engine.resolvePendingChoice(g, decision));
  assert.equal(result.ok, true, result.message); return result;
}

test('AB ordered delayed judgement: native Guicai decline leaves a real paid Jilue opportunity', () => {
  const g = fresh(); delayed(g);
  assert.equal(g.pendingChoice.actor, 'player'); assert.equal(g.pendingChoice.jilueGuicai, true);
  assert.equal(g.pendingChoice.orderedReplacement, true); assert.equal(g.enemy.hand.length, 2);
  resolve(g, { cardId: 'god-heart' });
  assert.equal(g.player.godMarks.nin, 1); assert.equal(g.enemy.flags.skipPlay, false);
  assert.equal(g.phase, 'play'); assert.equal(g.pendingChoice, null);
});

test('AB ordered replacements: native change, then paid God change, then Guidao changes latest card', () => {
  const g = fresh(); g.enemy.skillPreferences.guicai = 'ask'; g.ally.skillPreferences.guidao = 'auto';
  delayed(g);
  assert.equal(g.pendingChoice.actor, 'enemy'); resolve(g, { cardId: 'native-spade' });
  assert.equal(g.pendingChoice.actor, 'player'); assert.equal(g.pendingChoice.judgementCard.id, 'native-spade');
  assert.equal(g.enemy.hand.filter(c => c.id === 'native-spare').length, 1);
  resolve(g, { cardId: 'god-heart' });
  assert.equal(g.player.godMarks.nin, 1); assert.equal(g.player.hand[0].id, 'god-spare');
  assert.ok(g.ally.hand.some(c => c.id === 'god-heart'), 'Guidao receives the latest Jilue replacement');
  assert.ok(g.discard.some(c => c.id === 'dao-club'), 'the final replacement alone settles as judgement');
  assert.equal(g.enemy.flags.skipPlay, true); assert.equal(g.pendingChoice, null);
  assert.equal(g.log.filter(line => line.includes('极略·鬼才') && line.includes('弃置一枚')).length, 1);
});

test('AB ordered round starts with the turn actor even when another character is judged by Wuhun', () => {
  const g = fresh(); g.enemy.skillPreferences.guicai = 'ask'; g.ally.skillPreferences.guidao = 'ask';
  g.ally2.hp = 1; g.ally3.nightmare = 3;
  g.enemy.equipment.weapon = c('qinggang', { id: 'ordered-range' });
  g.enemy.hand.push(c('sha', { id: 'ordered-kill' }));
  assertCardConservation(g, () => Engine.playCard(g, 'enemy', 'ordered-kill', { target: 'ally2' }));
  assert.equal(g.pendingChoice.reason, '【武魂】'); assert.equal(g.pendingChoice.actor, 'enemy');
  resolve(g, { cardId: 'native-spade' }); assert.equal(g.pendingChoice.actor, 'player');
  assert.equal(g.pendingChoice.judgementActor, 'ally3'); assert.equal(g.pendingChoice.judgementCard.id, 'native-spade');
  resolve(g, { cardId: 'god-heart' });
  assert.equal(g.pendingChoice.actor, 'ally'); assert.equal(g.pendingChoice.kind, 'guidao-replace');
  assert.equal(g.pendingChoice.judgementCard.id, 'god-heart');
  assert.equal(g.phase, 'play'); assert.equal(g.ally3.hp, 4, 'Wuhun cannot kill while a later replacement is pending');
  // Shan is not Tao: the final decline permits the lethal Wuhun judgement.
  resolve(g, {}); assert.equal(g.phase, 'gameover'); assert.equal(g.ally3.hp, 0);
});

test('AB ordered round JSON resume preserves paid native cost and charges each later cost only once', () => {
  const g = fresh(); g.enemy.skillPreferences.guicai = 'ask'; g.ally.skillPreferences.guidao = 'ask';
  delayed(g); resolve(g, { cardId: 'native-spade' }); const copy = JSON.parse(JSON.stringify(g));
  resolve(copy, { cardId: 'god-heart' }); assert.equal(copy.pendingChoice.actor, 'ally');
  const next = JSON.parse(JSON.stringify(copy)); resolve(next, { cardId: 'dao-club' });
  assert.equal(next.player.godMarks.nin, 1); assert.equal(g.player.godMarks.nin, 2);
  assert.equal(g.pendingChoice.actor, 'player'); assert.equal(copy.pendingChoice.actor, 'ally');
  assert.ok(next.enemy.hand.some(c => c.id === 'native-spare'));
  assert.equal(next.discard.filter(c => c.id === 'native-spade').length, 1);
  assert.equal(next.discard.filter(c => c.id === 'dao-club').length, 1);
  assert.equal(next.pauseState.responseFlows.length, 0); assert.equal(next.pendingChoice, null);
});

test('AB ordered replacement rejects unoffered or invalid cost without spending cards, marks, or turn position', () => {
  const g = fresh(); delayed(g); g.player.hand.push(c('tao', { id: 'late-card', suit: 'heart' }));
  const before = JSON.stringify(g);
  const result = assertCardConservation(g, () => Engine.resolvePendingChoice(g, { cardId: 'late-card' }));
  assert.equal(result.ok, false); assert.equal(JSON.stringify(g), before);
  resolve(g, { cardId: 'god-heart' }); assert.equal(g.player.godMarks.nin, 1);
});

test('AB ordered Jilue decline does not spend a mark or prevent a later native Guidao from acting', () => {
  const g = fresh(); g.ally.skillPreferences.guidao = 'ask'; delayed(g);
  resolve(g, {}); assert.equal(g.player.godMarks.nin, 2); assert.equal(g.player.hand.length, 2);
  assert.equal(g.pendingChoice.actor, 'ally'); resolve(g, { cardId: 'dao-club' });
  assert.equal(g.enemy.flags.skipPlay, true); assert.equal(g.pendingChoice, null);
});

test('AB ordered expired Jilue source leaves later actors available without charging nin', () => {
  const g = fresh(); g.ally.skillPreferences.guidao = 'ask'; delayed(g);
  StateRuntime.stripAllSkills(g.player); resolve(g, { cardId: 'god-heart' });
  assert.equal(g.player.godMarks.nin, 2); assert.equal(g.pendingChoice.actor, 'ally');
  resolve(g, {}); assert.equal(g.pendingChoice, null);
});


test('AB Leiji resumes its own legacy judgement after native, Jilue and Guidao replacements', () => {
  const g = fresh();
  StateRuntime.grantSkill(g.player, 'leiji', '雷击'); g.player.skillPreferences.leiji = 'ask'; g.player.skillPreferences.shanResponse = 'ask';
  g.enemy.skillPreferences.guicai = 'ask'; g.ally.skillPreferences.guidao = 'ask';
  g.enemy.hand.push(c('sha', { id: 'leiji-attack', suit: 'spade' }));
  Engine.playCard(g, 'enemy', 'leiji-attack', { target: 'player' });
  assert.equal(g.pendingChoice.kind, 'shan-response'); resolve(g, { cardId: 'god-spare' });
  assert.equal(g.pendingChoice.kind, 'leiji-ask'); resolve(g, { target: 'ally3' });
  assert.equal(g.pendingChoice.reason, '【雷击】'); assert.equal(g.pendingChoice.actor, 'enemy');
  const hp = g.ally3.hp; resolve(g, { cardId: 'native-spade' });
  assert.equal(g.pendingChoice.actor, 'player'); resolve(g, { cardId: 'god-heart' });
  assert.equal(g.pendingChoice.actor, 'ally'); assert.equal(g.ally3.hp, hp);
  const copy = JSON.parse(JSON.stringify(g)); resolve(copy, { cardId: 'dao-club' });
  assert.equal(copy.ally3.hp, hp - 1); assert.equal(copy.player.godMarks.nin, 1);
  assert.equal(copy.pendingChoice, null); assert.equal(copy.pauseState.leiji, null);
  assert.ok(copy.ally.hand.some(c => c.id === 'god-heart'));
  assert.equal(g.ally3.hp, hp, 'the suspended original remains unchanged');
});

await runTests();
