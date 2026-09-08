import assert from 'node:assert/strict';
import { CardRuntime } from '../src/engine/card-runtime.js';
import { StateRuntime } from '../src/engine/state.js';
import { SkillRuntime } from '../src/engine/skill-runtime.js';
import { createResponseRuntime } from '../src/engine/response.js';
import { createGodChoiceRuntime } from '../src/engine/god-choices.js';
import { installGodStrategyHandlers } from '../src/engine/god-strategy.js';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

const c = (id, type = 'sha', suit = 'spade') => CardRuntime.makeTestCard(type, { id, suit, rank: '6' });
function setup(skills = ['qixing', 'kuangfeng', 'dawu', 'renjie', 'baiyin', 'lianpo']) {
  const state = (name, skills) => ({ name, hp: 3, maxHp: 3, hand: [], stars: [], judgeArea: [],
    equipment: { weapon: null, armor: null, horseMinus: null, horsePlus: null },
    skills: skills.map(id => ({ id, name: id })), flags: {}, godMarks: {}, skillPreferences: {} });
  const game = { seats: ['player', 'enemy', 'ally'], player: state('神诸葛亮', skills), enemy: state('曹操', []), ally: state('刘备', []),
    roles: { player: '主公', enemy: '反贼', ally: '忠臣' }, turn: 'player', phase: 'play',
    deck: Array.from({ length: 40 }, (_, i) => c('deck-' + i, i % 3 ? 'sha' : 'tao')), discard: [], log: [], pauseState: {},
    pendingChoice: null, pendingChoiceQueue: [] };
  const registry = SkillRuntime.createRegistry();
  const deps = { success: message => ({ ok: true, message }), fail: message => ({ ok: false, message }),
    log: (g, text) => g.log.push(text), reshuffleIfNeeded() {}, enterDying(g, actor) { g.dyingActor = actor; },
    triggerEquipmentLoss(g, actor, card) { g.equipmentLosses = (g.equipmentLosses || []).concat(card.id); },
    scoreCardForAI(g, a, card) { return card.type === 'tao' ? 10 : card.type === 'shan' ? 7 : 3; },
    drawCards(g, actor, count) { for (let i = 0; i < count; i++) { const card = CardRuntime.takeCard(g, null, { zone: 'deck' }); if (card) CardRuntime.putCard(g, card, { zone: 'hand', actor }); } },
    registerBoundaryHook(name, skill, callback) { deps.boundary = callback; } };
  const responses = createResponseRuntime(deps);
  const choices = createGodChoiceRuntime({ ...deps, requestPlayerResponse: responses.requestPlayerResponse, registerResponseKind: responses.registerResponseKind });
  const strategy = installGodStrategyHandlers(registry, { ...deps, godChoices: choices, responseFlows: responses.responseFlows });
  const choose = (decision, g = game) => responses.resolveResponseChoice(g, { choiceId: g.pendingChoice?.choiceId, ...decision });
  const hook = (name, context = {}) => SkillRuntime.runHook(registry, name, { game, ...context });
  const active = (mode, cardIds) => hook('onActiveSkill', { actor: 'player', state: game.player, skillId: 'jilue', options: { mode }, cardIds }).find(x => x.skillId === 'jilue').result;
  return { game, registry, strategy, choose, hook, active, deps };
}

test('AB 七星 replaces four-card initial deal with eleven watched cards and a private seven-card zone', () => {
  const { game: g, strategy, choose } = setup();
  assertCardConservation(g, () => strategy.beginInitialHand(g, 'player'));
  assert.equal(g.player.hand.length, 0); assert.equal(g.player.stars.length, 11);
  assert.equal(g.pendingChoice.godChoiceType, 'qixing-initial');
  const ids = g.pendingChoice.cards.slice(3, 7).map(c => c.id);
  const before = JSON.stringify(g);
  assert.equal(choose({ cardIds: [ids[0], ids[0], ids[1], ids[2]] }).ok, false);
  assert.equal(JSON.stringify(g), before, 'invalid complete selection is atomic');
  assert.equal(choose({ decline: true }).ok, false);
  assertCardConservation(g, () => choose({ cardIds: ids }));
  assert.deepEqual(g.player.hand.map(c => c.id), ids); assert.equal(g.player.stars.length, 7);
});

test('AB 七星 initial selection survives a JSON copy without moving original game cards', () => {
  const { game: g, strategy, choose } = setup(); strategy.beginInitialHand(g, 'player');
  const copy = JSON.parse(JSON.stringify(g));
  const ids = copy.pendingChoice.cards.slice(0, 4).map(c => c.id);
  assertCardConservation(copy, () => choose({ cardIds: ids }, copy));
  assert.equal(copy.player.hand.length, 4); assert.equal(g.player.hand.length, 0);
});

test('AB 七星 exchange validates two equal disjoint live zones and never spends equipment', () => {
  const { game: g, strategy, choose } = setup();
  g.player.hand = [c('hand-a'), c('hand-b')]; g.player.stars = [c('star-a'), c('star-b')];
  g.player.equipment.weapon = c('weapon', 'zhuge');
  strategy.beginDrawPhaseEnd(g, 'player');
  const before = JSON.stringify(g);
  assert.equal(choose({ cardIds: ['hand-a'], starIds: ['star-a', 'star-b'] }).ok, false);
  assert.equal(JSON.stringify(g), before);
  assert.equal(choose({ cardIds: ['weapon'], starIds: ['star-a'] }).ok, false);
  assertCardConservation(g, () => choose({ cardIds: ['hand-a', 'hand-b'], starIds: ['star-b', 'star-a'] }));
  assert.deepEqual(g.player.hand.map(c => c.id), ['star-b', 'star-a']);
  assert.deepEqual(g.player.stars.map(c => c.id), ['hand-a', 'hand-b']);
});

test('AB 七星 exchange is optional and its AI considers only its own hand and stars', () => {
  const { game: g, strategy, choose } = setup();
  g.player.hand = [c('hand')]; g.player.stars = [c('star')];
  strategy.beginDrawPhaseEnd(g, 'player'); assert.equal(choose({ decline: true }).ok, true);
  g.enemy.skills = [{ id: 'qixing' }]; g.enemy.hand = [c('ai-low')]; g.enemy.stars = [c('ai-high', 'tao')];
  Object.defineProperty(g.ally, 'hand', { get() { throw new Error('hidden hand peek'); } });
  strategy.beginDrawPhaseEnd(g, 'enemy'); assert.equal(g.enemy.hand[0].id, 'ai-high');
});

for (const first of ['kuangfeng', 'dawu']) test('AB 狂风/大雾 let their holder choose order: ' + first, () => {
  const { game: g, strategy, choose } = setup(); g.player.stars = [c('s1'), c('s2'), c('s3')];
  strategy.beginEndPhase(g, 'player');
  choose({ optionId: first });
  assertCardConservation(g, () => choose({ starIds: ['s1'], targetActors: ['enemy'] }));
  assert.equal(g.pendingChoice.godChoiceType, 'god-weather-order');
  assert.ok(!g.pendingChoice.options.some(x => x.id === first));
  choose({ optionId: first === 'dawu' ? 'kuangfeng' : 'dawu' });
  choose({ starIds: ['s2'], targetActors: ['player'] });
  assert.equal(g.pendingChoice, null); assert.equal(g.pauseState.responseFlows.length, 0);
  assert.equal(g.godWeather.kuangfeng.length, 1); assert.equal(g.godWeather.dawu.length, 1);
});

test('AB 大雾 equal-star target cost rejects duplicates and mismatch atomically', () => {
  const { game: g, strategy, choose } = setup(); g.player.stars = [c('s1'), c('s2'), c('s3')];
  strategy.beginEndPhase(g, 'player'); choose({ optionId: 'dawu' });
  const before = JSON.stringify(g);
  assert.equal(choose({ starIds: ['s1', 's2'], targetActors: ['enemy'] }).ok, false);
  assert.equal(JSON.stringify(g), before);
  assert.equal(choose({ starIds: ['s1', 's2'], targetActors: ['enemy', 'enemy'] }).ok, false);
  assertCardConservation(g, () => choose({ starIds: ['s1', 's2'], targetActors: ['player', 'ally'] }));
  assert.equal(g.godWeather.dawu.length, 2);
});

test('AB 狂风 costs exactly one star; a declined weather use consumes no card', () => {
  const { game: g, strategy, choose } = setup(); g.player.stars = [c('s1'), c('s2')];
  strategy.beginEndPhase(g, 'player'); choose({ optionId: 'kuangfeng' });
  assert.equal(choose({ starIds: ['s1', 's2'], targetActors: ['player', 'enemy'] }).ok, false);
  choose({ decline: true }); choose({ optionId: 'finish' });
  assert.equal(g.player.stars.length, 2); assert.equal(g.pendingChoice, null);
});

test('AB weather frame clones resume independently, auto decisions leave no unfinished flow', () => {
  const { game: g, strategy, choose } = setup(); g.player.stars = [c('s1'), c('s2')];
  strategy.beginEndPhase(g, 'player'); const copy = JSON.parse(JSON.stringify(g));
  choose({ optionId: 'dawu' }, copy); choose({ starIds: ['s1'], targetActors: ['player'] }, copy);
  choose({ optionId: 'finish' }, copy); assert.equal(g.player.stars.length, 2); assert.equal(copy.player.stars.length, 1);
  const x = setup(); x.game.enemy.skills = [{ id: 'dawu' }, { id: 'kuangfeng' }]; x.game.enemy.stars = [c('a1'), c('a2')];
  x.strategy.beginEndPhase(x.game, 'enemy'); assert.equal(x.game.pauseState.responseFlows.length, 0);
});

for (const nature of ['normal', 'fire', 'thunder']) test('AB 大雾 prevents only non-thunder damage: ' + nature, () => {
  const { game: g, strategy } = setup(); g.godWeather = { dawu: [{ source: 'player', target: 'enemy' }], kuangfeng: [{ source: 'ally', target: 'enemy' }] };
  const context = { game: g, targetActor: 'enemy', nature, amount: 2 }; strategy.modifyWeather(context);
  assert.equal(context.amount, nature === 'thunder' ? 2 : 0); assert.equal(!!context.prevented, nature !== 'thunder');
});

test('AB 狂风 fires at damage beginning and survives skill loss until source next turn or death', () => {
  const { game: g, strategy } = setup(); g.godWeather = { dawu: [], kuangfeng: [{ source: 'player', target: 'enemy' }, { source: 'ally', target: 'enemy' }] };
  g.player.skills = []; const context = { game: g, targetActor: 'enemy', nature: 'fire', amount: 1 };
  strategy.modifyWeather(context); assert.equal(context.amount, 3);
  strategy.resetTurn(g, 'player'); assert.equal(g.godWeather.kuangfeng.length, 1);
  strategy.recordDeath(g, 'ally', 'enemy'); assert.equal(g.godWeather.kuangfeng.length, 0);
});

test('AB 忍戒 counts damage points before the same event offers 极略·放逐', () => {
  const { game: g, hook, choose } = setup(['renjie', 'jilue']); g.player.hp = 1;
  hook('onDamageAfter', { targetActor: 'player', sourceActor: 'enemy', amount: 2 });
  assert.equal(g.player.godMarks.nin, 2); assert.equal(g.pendingChoice.godChoiceType, 'jilue-fangzhu');
  assertCardConservation(g, () => choose({ targetActors: ['enemy'] }));
  assert.equal(g.player.godMarks.nin, 1); assert.equal(g.enemy.hand.length, 2); assert.equal(g.enemy.turnedOver, true);
});

test('AB 忍戒 discard tracking excludes equipment, transfers and other players phases', () => {
  const { game: g, strategy } = setup(); const hand = [c('a'), c('b')];
  strategy.recordDiscard(g, 'player', hand); assert.equal(g.player.godMarks.nin, undefined);
  g.phase = 'discard'; g.turn = 'enemy'; strategy.recordDiscard(g, 'player', hand); assert.equal(g.player.godMarks.nin, undefined);
  g.turn = 'player'; strategy.recordDiscard(g, 'player', hand); assert.equal(g.player.godMarks.nin, 2);
  strategy.recordDiscard(g, 'player', []); assert.equal(g.player.godMarks.nin, 2);
});

test('AB 拜印 awakens only once at four nin, lowers max hp without spending marks, grants only 极略', () => {
  const { game: g, hook } = setup(['baiyin', 'renjie']); g.player.maxHp = 4; g.player.hp = 4; g.player.godMarks.nin = 3;
  hook('onPreparePhase', { actor: 'player' }); assert.equal(g.player.maxHp, 4);
  g.player.godMarks.nin = 4; hook('onPreparePhase', { actor: 'player' });
  assert.equal(g.player.maxHp, 3); assert.equal(g.player.hp, 3); assert.equal(g.player.godMarks.nin, 4);
  assert.equal(StateRuntime.skillEnabled(g.player, 'jilue', g), true);
  for (const id of ['guicai', 'fangzhu', 'jizhi', 'zhiheng', 'wansha']) assert.equal(StateRuntime.skillEnabled(g.player, id, g), false);
  hook('onPreparePhase', { actor: 'player' }); assert.equal(g.player.maxHp, 3);
});

for (const type of ['wuzhong', 'wuxie', 'lebusishu', 'bingliang', 'shandian']) test('AB 极略·集智 is a paid optional use-timing trigger for ' + type, () => {
  const { game: g, strategy, choose, hook } = setup(['jilue']); g.player.godMarks.nin = 2;
  strategy.beforeCardUse(g, 'player', c('trick', type)); assert.equal(g.pendingChoice.godChoiceType, 'jilue-jizhi');
  choose({ decline: true }); assert.equal(g.player.godMarks.nin, 2); assert.equal(g.player.hand.length, 0);
  strategy.beforeCardUse(g, 'player', c('trick', type)); choose({ optionId: 'invoke' });
  assert.equal(g.player.godMarks.nin, 1); assert.equal(g.player.hand.length, 1);
  hook('onCardUse', { actor: 'player', card: c('trick', type) }); assert.equal(g.pendingChoice, null, 'legacy after-effect hook must not trigger a second time');
});

test('AB 极略 declines all non-trick uses and cannot activate after losing skill or marks', () => {
  const { game: g, strategy, choose } = setup(['jilue']); g.player.godMarks.nin = 1;
  for (const type of ['sha', 'tao', 'zhuge']) assert.equal(strategy.beforeCardUse(g, 'player', c(type, type)), null);
  strategy.beforeCardUse(g, 'player', c('trick', 'wuzhong')); g.player.skills = [];
  choose({ optionId: 'invoke' }); assert.equal(g.player.hand.length, 0); assert.equal(g.player.godMarks.nin, 1);
});

test('AB 极略·制衡 validates its full cost, triggers equipment loss, and shares no native 制衡 frequency', () => {
  const { game: g, active, strategy } = setup(['jilue']); g.player.godMarks.nin = 3;
  g.player.hand = [c('h')]; g.player.equipment.armor = c('armor', 'baiyin'); g.player.flags.zhihengUsed = true;
  const before = JSON.stringify(g); assert.equal(active('zhiheng', ['h', 'h']).ok, false); assert.equal(JSON.stringify(g), before);
  assertCardConservation(g, () => active('zhiheng', ['h', 'armor']));
  assert.equal(g.player.godMarks.nin, 2); assert.equal(g.player.hand.length, 2); assert.deepEqual(g.equipmentLosses, ['armor']);
  assert.equal(active('zhiheng', [g.player.hand[0].id]).ok, false); assert.equal(g.player.godMarks.nin, 2);
  strategy.resetTurn(g, 'player'); assert.equal(active('zhiheng', [g.player.hand[0].id]).ok, true);
});

test('AB 极略 zero-argument UI chooses a mode then cards, and cancellation does not spend nin', () => {
  const { game: g, active, choose } = setup(['jilue']); g.player.godMarks.nin = 2; g.player.hand = [c('h')];
  active(); assert.equal(g.pendingChoice.godChoiceType, 'jilue-mode'); choose({ optionId: 'zhiheng' });
  assert.equal(g.pendingChoice.godChoiceType, 'jilue-zhiheng'); choose({ decline: true });
  assert.equal(g.player.godMarks.nin, 2); assert.equal(g.player.hand[0].id, 'h');
});

test('AB 极略·完杀 costs one nin each use and only grants this paid turn effect', () => {
  const { game: g, active, strategy } = setup(['jilue']); g.player.godMarks.nin = 3;
  active('wansha'); assert.equal(g.player.godMarks.nin, 2);
  assert.equal(StateRuntime.wanshaBlocksTaoUse(g, 'ally', 'enemy'), true);
  assert.equal(StateRuntime.wanshaBlocksTaoUse(g, 'enemy', 'enemy'), false);
  active('wansha'); assert.equal(g.player.godMarks.nin, 1); assert.equal(g.player.dynamicSkills.length, 1);
  strategy.resetTurn(g, 'enemy'); assert.equal(StateRuntime.skillEnabled(g.player, 'wansha', g), false);
});

test('AB 连破 counts only real-turn kills, consumes one opportunity, queues an extra turn', () => {
  const { game: g, strategy, choose } = setup(['lianpo']);
  g.turn = null; g.phase = 'between-turns'; strategy.recordDeath(g, 'enemy', 'player');
  assert.equal(strategy.afterTurnEnd({ game: g, actor: 'player' }), null);
  g.turn = 'ally'; g.phase = 'play'; strategy.recordDeath(g, 'enemy', 'player');
  g.turn = null; g.phase = 'between-turns'; strategy.afterTurnEnd({ game: g, actor: 'player' });
  assert.equal(g.pendingChoice.godChoiceType, 'lianpo-extra-turn'); choose({ optionId: 'invoke' });
  assert.deepEqual(g.pendingExtraTurns, ['player']); assert.equal(strategy.afterTurnEnd({ game: g, actor: 'player' }), null);
  strategy.resetTurn(g, 'player'); assert.deepEqual(g.godTurnKills, {});
});

test('AB 连破 decline, self-kill, lost skill and dead source never enqueue a turn', () => {
  const { game: g, strategy, choose } = setup(['lianpo']);
  strategy.recordDeath(g, 'player', 'player'); assert.equal(strategy.afterTurnEnd({ game: g, actor: 'player' }), null);
  strategy.recordDeath(g, 'enemy', 'player'); strategy.afterTurnEnd({ game: g, actor: 'player' }); choose({ decline: true });
  assert.equal(g.pendingExtraTurns, undefined);
  strategy.recordDeath(g, 'enemy', 'player'); strategy.afterTurnEnd({ game: g, actor: 'player' }); g.player.hp = 0;
  choose({ optionId: 'invoke' }); assert.equal(g.pendingExtraTurns, undefined);
});

await runTests();
