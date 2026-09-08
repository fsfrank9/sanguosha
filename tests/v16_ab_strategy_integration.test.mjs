import assert from 'node:assert/strict';
import { Engine, c } from './helpers/load-engine.mjs';
import { StateRuntime } from '../src/engine/state.js';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function game(hero = 'god_simayi', enemy = 'liubei') {
  const g = Engine.newGame({ seed: 1183, playerHero: hero, enemyHero: enemy, allyHero: 'sunquan',
    seats: ['player', 'enemy', 'ally'], roles: { player: '主公', enemy: '反贼', ally: '反贼' },
    godCamps: { player: '魏' } });
  if (g.pendingChoice?.godChoiceType === 'qixing-initial') Engine.resolvePendingChoice(g,
    { choiceId: g.pendingChoice.choiceId, cardIds: g.pendingChoice.cards.slice(0, 4).map(c => c.id) });
  for (const actor of g.seats) Object.assign(g[actor], { hand: [], stars: [], judgeArea: [], flags: {},
    equipment: { weapon: null, armor: null, horseMinus: null, horsePlus: null }, hp: 4, maxHp: 4,
    skillPreferences: { jilue: 'ask', guicai: 'decline', guidao: 'decline' } });
  Object.assign(g, { turn: 'player', phase: 'play', pendingChoice: null, pendingChoiceQueue: [], pauseState: {},
    discard: [], log: [], deck: Array.from({ length: 40 }, (_, i) => c('sha', { id: 'deck-' + i, suit: 'spade' })) });
  return g;
}
const choose = (g, d) => Engine.resolvePendingChoice(g, { choiceId: g.pendingChoice?.choiceId, ...d });
let shaSerial = 0;
function hit(g, target, amount = 1, source = 'enemy', nature = 'sha') {
  const card = c(nature, { id: 'hit-' + (++shaSerial) });
  g[source].hand.push(card); g[source].usedSha = false; g[source].shaBonus = amount - 1;
  g.turn = source; g.phase = 'play';
  const result = Engine.playCard(g, source, card.id, { target });
  if (g.pendingChoice?.kind === 'shan-response') choose(g, { decline: true });
  return result;
}
const grantJilue = g => { StateRuntime.grantSkill(g.player, 'jilue', '极略'); g.player.godMarks = { nin: 3 }; };

test('AB integrated setup selects god faction before the Qixing initial hand and completes serial dealing', () => {
  const g = Engine.newGame({ seed: 1141, playerHero: 'god_zhugeliang', enemyHero: 'god_lvbu' });
  assert.equal(g.pendingChoice.godChoiceType, 'faction'); assert.equal(g.player.hand.length, 0);
  choose(g, { optionId: '蜀' }); assert.equal(g.player.camp, '蜀'); assert.equal(g.enemy.camp, '群');
  assert.equal(g.pendingChoice.godChoiceType, 'qixing-initial'); assert.equal(g.enemy.hand.length, 0);
  assertCardConservation(g, () => choose(g, { cardIds: g.pendingChoice.cards.slice(0, 4).map(c => c.id) }));
  assert.equal(g.player.hand.length, 4); assert.equal(g.player.stars.length, 7); assert.equal(g.enemy.hand.length, 4);
  assert.equal(g.phase, 'play'); assert.equal(g.pendingChoice, null);
});

test('AB integrated Qixing draw-end pauses before play, exchanges, then resumes one phase exactly once', () => {
  const g = game('god_zhugeliang'); g.player.stars = [c('tao', { id: 'star' })];
  g.phase = 'judge'; Engine.advancePhase(g); assert.equal(g.phase, 'draw'); assert.equal(g.player.hand.length, 2);
  Engine.advancePhase(g); assert.equal(g.pendingChoice.godChoiceType, 'qixing-exchange'); assert.equal(g.phase, 'draw');
  const old = g.player.hand[0].id;
  assertCardConservation(g, () => choose(g, { cardIds: [old], starIds: ['star'] }));
  assert.equal(g.phase, 'play'); assert.equal(g.player.hand.length, 2); assert.equal(g.player.stars[0].id, old);
});

test('AB integrated weather resolves before handing over turn, and clears at the owner next start', () => {
  const g = game('god_zhugeliang'); g.player.stars = [c('sha', { id: 'star' })];
  Engine.endTurn(g); assert.equal(g.turn, 'player'); choose(g, { optionId: 'dawu' });
  choose(g, { starIds: ['star'], targetActors: ['player'] });
  assert.equal(g.turn, 'enemy'); assert.equal(g.godWeather.dawu.length, 1);
  g.pendingChoice = null; Engine.startTurn(g, 'player'); assert.equal(g.godWeather.dawu.length, 0);
});

test('AB integrated weather prevents damage before armor and amplifies fire before Silver Lion clamps it', () => {
  const g = game('god_zhugeliang'); g.player.equipment.armor = c('tengjia', { id: 'vine' });
  g.godWeather = { dawu: [{ source: 'ally', target: 'player' }], kuangfeng: [{ source: 'enemy', target: 'player' }] };
  hit(g, 'player', 1, 'enemy', 'fire_sha');
  assert.equal(g.player.hp, 4);
  g.godWeather.dawu = []; g.player.equipment.armor = c('baiyin', { id: 'lion' });
  hit(g, 'player', 2, 'enemy', 'fire_sha'); assert.equal(g.player.hp, 3);
});

test('AB integrated Renjie receives actual damage and discard marks, then Baiyin awakens before drawing', () => {
  const g = game(); hit(g, 'player', 2); g.turn = 'player';
  assert.equal(g.player.godMarks.nin, 2);
  g.player.hand = Array.from({ length: 4 }, (_, i) => c('shan', { id: 'hand-' + i })); g.phase = 'discard';
  Engine.discardSelected(g, 'player', ['hand-0', 'hand-1']); assert.equal(g.player.godMarks.nin, 4);
  Engine.startTurn(g, 'player'); assert.equal(g.player.maxHp, 3); assert.equal(g.player.flags.baiyinAwakened, true);
  assert.equal(StateRuntime.skillEnabled(g.player, 'jilue', g), true); assert.equal(g.player.godMarks.nin, 4);
});

test('AB integrated Jilue Jizhi spends one mark before Wuzhong effects, then resumes the paid card', () => {
  const g = game(); grantJilue(g); g.player.hand = [c('wuzhong', { id: 'wz' })];
  assertCardConservation(g, () => Engine.playCard(g, 'player', 'wz'));
  assert.equal(g.pendingChoice.godChoiceType, 'jilue-jizhi'); assert.equal(g.player.hand.length, 0);
  assertCardConservation(g, () => choose(g, { optionId: 'invoke' }));
  assert.equal(g.player.hand.length, 3); assert.equal(g.player.godMarks.nin, 2); assert.equal(g.pendingChoice, null);
});

test('AB integrated paid Guicai validates a replacement before spending nin and resumes delayed judgement', () => {
  const g = game(); grantJilue(g); g.player.hand = [c('shan', { id: 'heart', suit: 'heart' })];
  g.enemy.judgeArea = [c('lebusishu', { id: 'delay' })]; Engine.startTurn(g, 'enemy');
  assert.equal(g.pendingChoice.kind, 'guicai-replace'); assert.equal(g.pendingChoice.jilueGuicai, true);
  assert.equal(choose(g, { cardId: 'missing' }).ok, false); assert.equal(g.player.godMarks.nin, 3);
  assertCardConservation(g, () => choose(g, { cardId: 'heart' }));
  assert.equal(g.player.godMarks.nin, 2); assert.equal(g.enemy.flags.skipPlay, false); assert.equal(g.phase, 'play');
});

test('AB integrated Lianpo uses settled kills and returns from an extra turn to the original next seat', () => {
  const g = game(); g.enemy.hp = 1;
  hit(g, 'enemy', 1, 'player'); assert.equal(g.enemy.hp, 0); assert.notEqual(g.phase, 'gameover');
  assert.equal(g.godTurnKills.player, 1); Engine.endTurn(g);
  assert.equal(g.pendingChoice.godChoiceType, 'lianpo-extra-turn'); assert.equal(g.turn, null);
  choose(g, { optionId: 'invoke' }); assert.equal(g.turn, 'player'); assert.equal(g.extraTurnReturnSeat, 'ally');
  Engine.endTurn(g); assert.equal(g.turn, 'ally'); assert.equal(g.extraTurnReturnSeat, null);
});


test('AB integrated skipped face-down turn preserves weather until a real next turn begins', () => {
  const g = game('god_zhugeliang');
  g.godWeather = { dawu: [{ source: 'player', target: 'ally' }], kuangfeng: [] };
  g.player.turnedOver = true;
  Engine.startTurn(g, 'player'); assert.equal(g.turn, 'enemy'); assert.equal(g.godWeather.dawu.length, 1);
  Engine.startTurn(g, 'player'); assert.equal(g.turn, 'player'); assert.equal(g.godWeather.dawu.length, 0);
});

test('AB Jilue replaces Shuangxiong judgement before claiming it and resumes draw replacement once', () => {
  const g = game('god_simayi', 'yanliangwenchou'); grantJilue(g);
  g.player.hand = [c('shan', { id: 'red-replacement', suit: 'heart' })];
  g.enemy.hand = ['a', 'b', 'c'].map(id => c('sha', { id }));
  g.enemy.skillPreferences.shuangxiong = 'auto';
  Engine.startTurn(g, 'enemy'); assert.equal(g.phase, 'draw');
  assert.equal(g.pendingChoice.kind, 'guicai-replace'); assert.equal(g.pendingChoice.reason, '【双雄】');
  assert.equal(g.enemy.hand.length, 3); assert.equal(g.enemy.flags.shuangxiongColor, undefined);
  assertCardConservation(g, () => choose(g, { cardId: 'red-replacement' }));
  assert.equal(g.player.godMarks.nin, 2); assert.equal(g.enemy.hand.length, 4);
  assert.equal(g.enemy.flags.shuangxiongColor, 'red'); assert.equal(g.phase, 'play');
  assert.equal(g.enemy.hand.at(-1).id, 'red-replacement');
});

test('AB player Shuangxiong ask followed by paid Guicai keeps draw phase frozen until both choices finish', () => {
  const g = game(); grantJilue(g); StateRuntime.grantSkill(g.player, 'shuangxiong', '双雄');
  g.player.hand = [c('shan', { id: 'red-replacement', suit: 'heart' })];
  Engine.startTurn(g, 'player'); assert.equal(g.pendingChoice.kind, 'shuangxiong-ask');
  choose(g, { invoke: true }); assert.equal(g.pendingChoice.kind, 'guicai-replace'); assert.equal(g.phase, 'draw');
  assertCardConservation(g, () => choose(g, { cardId: 'red-replacement' }));
  assert.equal(g.player.hand.length, 1); assert.equal(g.player.hand[0].id, 'red-replacement');
  assert.equal(g.player.flags.shuangxiongColor, 'red'); assert.equal(g.phase, 'play');
});

test('AB Jilue replaces Luoshen before its black-card grant and resumes prepare exactly once', () => {
  const g = game('god_simayi', 'zhenji'); grantJilue(g);
  g.player.hand = [c('shan', { id: 'red-replacement', suit: 'heart' })];
  Engine.startTurn(g, 'enemy'); assert.equal(g.phase, 'prepare');
  assert.equal(g.pendingChoice.kind, 'guicai-replace'); assert.equal(g.pendingChoice.reason, '【洛神】');
  assert.equal(g.enemy.hand.length, 0);
  assertCardConservation(g, () => choose(g, { cardId: 'red-replacement' }));
  assert.equal(g.player.godMarks.nin, 2); assert.equal(g.enemy.hand.length, 2); assert.equal(g.phase, 'play');
  assert.ok(!g.enemy.hand.some(c => c.id === 'red-replacement'));
  assert.ok(g.discard.some(c => c.id === 'red-replacement'));
});

test('AB Luoshen paid judgement clone remains independent and a black result grants the replacement', () => {
  const g = game('god_simayi', 'zhenji'); grantJilue(g); g.player.godMarks.nin = 1;
  g.player.hand = [c('shan', { id: 'black-replacement', suit: 'club' })];
  g.deck.at(-2).suit = 'heart'; g.deck.at(-2).color = 'red';
  Engine.startTurn(g, 'enemy'); const copy = JSON.parse(JSON.stringify(g));
  assertCardConservation(copy, () => choose(copy, { cardId: 'black-replacement' }));
  assert.equal(copy.player.godMarks.nin, 0); assert.equal(g.player.godMarks.nin, 1);
  assert.equal(copy.enemy.hand.length, 3); assert.equal(copy.enemy.hand[0].id, 'black-replacement');
  assert.equal(copy.phase, 'play'); assert.equal(g.phase, 'prepare');
});

test('AB Jilue replaces Tuntian while a Sha response is suspended; heart prevents placing the field', () => {
  const g = game('god_simayi', 'dengai'); grantJilue(g);
  g.player.hand = [c('sha', { id: 'attack' }), c('shan', { id: 'red-replacement', suit: 'heart' })];
  g.enemy.hand = [c('shan', { id: 'dodge' })];
  Engine.playCard(g, 'player', 'attack', { target: 'enemy' });
  assert.equal(g.pendingChoice.kind, 'guicai-replace'); assert.equal(g.pendingChoice.reason, '【屯田】');
  assert.equal((g.enemy.tian || []).length, 0);
  assertCardConservation(g, () => choose(g, { cardId: 'red-replacement' }));
  assert.equal((g.enemy.tian || []).length, 0); assert.equal(g.enemy.hp, 4);
  assert.equal(g.player.godMarks.nin, 2); assert.equal(g.pendingChoice, null);
});

test('AB Tuntian replacement uses the judgement owner Hongyan view and restores the physical spade', () => {
  const g = game('god_simayi', 'dengai'); grantJilue(g); StateRuntime.grantSkill(g.enemy, 'hongyan', '红颜');
  g.player.hand = [c('sha', { id: 'attack' }), c('shan', { id: 'spade-replacement', suit: 'spade' })];
  g.enemy.hand = [c('shan', { id: 'dodge' })];
  Engine.playCard(g, 'player', 'attack', { target: 'enemy' });
  assert.equal(g.pendingChoice.reason, '【屯田】');
  assertCardConservation(g, () => choose(g, { cardId: 'spade-replacement' }));
  assert.equal((g.enemy.tian || []).length, 0);
  assert.equal(g.discard.find(c => c.id === 'spade-replacement').suit, 'spade');
});

await runTests();
