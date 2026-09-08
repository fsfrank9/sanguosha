import assert from 'node:assert/strict';
import { installGodWrathHandlers } from '../src/engine/god-wrath.js';
import { createGodChoiceRuntime } from '../src/engine/god-choices.js';
import { createResponseRuntime } from '../src/engine/response.js';
import { SkillRuntime } from '../src/engine/skill-runtime.js';
import { StateRuntime } from '../src/engine/state.js';
import { CardRuntime } from '../src/engine/card-runtime.js';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

const c = CardRuntime.makeTestCard;
function fixture(skills = ['qinyin', 'yeyan', 'kuangbao', 'wumou', 'wuqian', 'shenfen'], hooks = {}) {
  const registry = SkillRuntime.createRegistry();
  const success = message => ({ ok: true, message });
  const fail = message => ({ ok: false, message });
  const response = createResponseRuntime({ success, fail, log: (game, line) => game.log.push(line) });
  const godChoices = createGodChoiceRuntime({ success, fail, requestPlayerResponse: response.requestPlayerResponse,
    registerResponseKind: response.registerResponseKind });
  const game = { turn: 'player', phase: 'play', seats: ['player', 'enemy', 'ally'],
    roles: { player: '主公', enemy: '反贼', ally: '忠臣' }, deck: [], discard: [], log: [],
    roleSides: { '主公': 'lordSide', '忠臣': 'lordSide', '反贼': 'rebelSide' },
    pauseState: {}, pendingChoice: null, pendingChoiceQueue: [] };
  for (const actor of game.seats) game[actor] = { name: actor, hp: 5, maxHp: 5, skills: [], flags: {},
    camp: '群', hand: [], judgeArea: [], equipment: { weapon: null, armor: null, horsePlus: null, horseMinus: null } };
  game.player.skills = skills.map(id => ({ id, name: id }));
  const trace = [];
  const deps = { success, fail, responseFlows: response.responseFlows, godChoices,
    log: (g, line) => g.log.push(line),
    discardCard: (g, card) => { trace.push(['discard', card.id]); CardRuntime.putCard(g, card, { zone: 'discard' }); },
    triggerEquipmentLoss: (g, actor, card) => { trace.push(['equipment', actor, card.id]); if (hooks.equipment) hooks.equipment(g, actor, card); },
    damage: (g, actor, amount, source, reason, card, nature) => {
      trace.push(['damage', actor, amount, source, nature]);
      g[actor].hp -= amount;
      if (hooks.damage) hooks.damage(g, actor, amount, source);
      const context = { game: g, targetActor: actor, sourceActor: source, amount };
      if (g.phase !== 'gameover') SkillRuntime.runHook(registry, 'onDamageDealt', context);
      if (g[actor].hp > 0) SkillRuntime.runHook(registry, 'onDamageAfter', context);
    },
    enterDying: (g, actor) => { trace.push(['dying', actor]); if (hooks.dying) hooks.dying(g, actor); },
    scoreCardForDiscard: (_g, _a, card) => card.type === 'tao' ? 100 : 0 };
  const domain = installGodWrathHandlers(registry, deps);
  function active(g, id, cardIds = [], options = {}) {
    const results = SkillRuntime.runHook(registry, 'onActiveSkill', { game: g, actor: 'player',
      state: g.player, skillId: id, cardIds, options, targetActor: options.target || 'enemy' });
    return results.find(entry => entry.skillId === id).result;
  }
  function answer(g, decision) {
    const pending = g.pendingChoice;
    response.restoreResponseContext(g, pending);
    g.pendingChoice = null;
    const result = response.RESPONSE_KIND_RESOLVERS[pending.kind](g, pending, { choiceId: pending.choiceId, ...decision });
    response.finishPendingChoiceResolution(g, result);
    return result;
  }
  return { game, registry, response, domain, active, answer, trace };
}
function costs(game) {
  game.player.hand = ['spade', 'heart', 'club', 'diamond'].map((suit, i) => c('sha', { id: 'cost' + i, suit }));
  return game.player.hand.map(card => card.id);
}
function cards(actor, count) { return Array.from({ length: count }, (_, i) => c('sha', { id: actor + '-hand' + i })); }

test('AB 狂暴：真开局只给一次两暴怒；初始发牌由调用方先完成', () => {
  const f = fixture();
  f.game.player.hand = cards('player', 4);
  f.domain.afterInitialHands(f.game); f.domain.afterInitialHands(f.game);
  assert.equal(f.game.player.godMarks.rage, 2);
  assert.equal(f.game.player.hand.length, 4);
});

test('AB 狂暴：自伤分别计造成及受到；失体力与被抑制技能不计', () => {
  const f = fixture(); const g = f.game;
  SkillRuntime.runHook(f.registry, 'onDamageDealt', { game: g, sourceActor: 'player', targetActor: 'player', amount: 2 });
  SkillRuntime.runHook(f.registry, 'onDamageAfter', { game: g, sourceActor: 'player', targetActor: 'player', amount: 2 });
  assert.equal(g.player.godMarks.rage, 4);
  g.player.hp = 1; StateRuntime.grantSkill(g.player, 'chanyuan');
  SkillRuntime.runHook(f.registry, 'onDamageAfter', { game: g, sourceActor: null, targetActor: 'player', amount: 2 });
  assert.equal(g.player.godMarks.rage, 4);
});

test('AB 无谋：非延时锦囊才支付；普通牌和延时锦囊无成本', () => {
  const f = fixture(); const g = f.game;
  for (const type of ['sha', 'lebusishu', 'bingliang', 'shandian']) assert.equal(f.domain.beforeTrickUse(g, 'player', c(type)), null);
  assert.equal(g.player.hp, 5);
  f.domain.beforeTrickUse(g, 'player', c('wuxie'));
  assert.equal(g.player.hp, 4);
});

test('AB 无谋：玩家选择暴怒，旧令牌和非法选项均不扣费', () => {
  const f = fixture(); const g = f.game; g.player.godMarks = { rage: 2 };
  f.domain.beforeTrickUse(g, 'player', c('wuzhong'));
  assert.equal(g.pendingChoice.godChoiceType, 'wumou');
  assert.equal(f.answer(g, { optionId: 'rage', choiceId: -1 }).ok, false);
  assert.equal(f.answer(g, { optionId: 'invented' }).ok, false);
  assert.equal(g.player.godMarks.rage, 2);
  assert.equal(f.answer(g, { optionId: 'rage' }).ok, true);
  assert.equal(g.player.godMarks.rage, 1); assert.equal(g.player.hp, 5);
});

test('AB 无谋：选择失体力进入濒死一次，不构成伤害', () => {
  const f = fixture([], { dying: (g, actor) => { g.pendingChoice = { kind: 'rescue', actor }; } });
  const g = f.game; g.player.skills = [{ id: 'wumou' }]; g.player.hp = 1; g.player.godMarks = { rage: 1 };
  f.domain.beforeTrickUse(g, 'player', c('wuzhong'));
  f.answer(g, { optionId: 'hp' });
  assert.equal(g.player.hp, 0); assert.equal(g.player.godMarks.rage, 1);
  assert.deepEqual(f.trace, [['dying', 'player']]);
});

test('AB 无前：合法目标含自己，多个目标共用一次无双技能来源', () => {
  const f = fixture(); const g = f.game; g.player.godMarks = { rage: 6 };
  assert.equal(f.active(g, 'wuqian', [], { target: 'player' }).ok, true);
  assert.equal(f.active(g, 'wuqian', [], { target: 'enemy' }).ok, true);
  assert.equal(f.active(g, 'wuqian', [], { target: 'enemy' }).ok, true);
  assert.equal(g.player.godMarks.rage, 0);
  assert.deepEqual(g.player.godArmorSuppressedBy, ['player']);
  assert.deepEqual(g.enemy.godArmorSuppressedBy, ['player']);
  assert.equal(StateRuntime.skillEntries(g.player).filter(entry => entry.id === 'wushuang').length, 1);
});

test('AB 无前：死亡立即清除此来源，原生无双保留', () => {
  const f = fixture(); const g = f.game; g.player.godMarks = { rage: 2 };
  StateRuntime.grantSkill(g.player, 'wushuang');
  f.active(g, 'wuqian', [], { target: 'enemy' });
  f.domain.clearDeathEffects(g, 'player');
  assert.deepEqual(g.enemy.godArmorSuppressedBy, []);
  assert.equal(StateRuntime.skillEnabled(g.player, 'wushuang'), true);
  assert.equal(g.player.dynamicSkills.length, 0);
});

test('AB 无前：其他来源不被误清，回合结束取消临时无双', () => {
  const f = fixture(); const g = f.game; g.player.godMarks = { rage: 2 };
  g.enemy.godArmorSuppressedBy = ['ally'];
  f.active(g, 'wuqian', [], { target: 'enemy' });
  f.domain.clearTurnEffects(g, 'enemy');
  assert.equal(StateRuntime.skillEnabled(g.player, 'wushuang'), true);
  f.domain.clearTurnEffects(g, 'player');
  assert.equal(StateRuntime.skillEnabled(g.player, 'wushuang'), false);
  assert.deepEqual(g.enemy.godArmorSuppressedBy, ['ally']);
});

test('AB 无前：零参数选目标可取消，非法目标不扣暴怒', () => {
  const f = fixture(); const g = f.game; g.player.godMarks = { rage: 2 };
  f.active(g, 'wuqian');
  assert.equal(f.answer(g, { targetActors: ['ghost'] }).ok, false);
  assert.equal(g.player.godMarks.rage, 2);
  assert.equal(f.answer(g, { decline: true }).ok, true);
  assert.equal(g.player.godMarks.rage, 2);
});

test('AB 业炎：小业炎可只对一人造成一点，无手牌或体力成本', () => {
  const f = fixture(); const g = f.game;
  assert.equal(f.active(g, 'yeyan', [], { allocations: [{ actor: 'enemy', amount: 1 }] }).ok, true);
  assert.equal(g.player.hp, 5); assert.equal(g.enemy.hp, 4);
  assert.deepEqual(f.trace, [['damage', 'enemy', 1, 'player', 'fire']]);
  assert.equal(f.active(g, 'yeyan', [], { allocations: [{ actor: 'enemy', amount: 1 }] }).ok, false);
});

test('AB 业炎：目标或成本非法时完整原子拒绝，不消耗限定次数', () => {
  const f = fixture(); const g = f.game; const ids = costs(g);
  for (const allocations of [[], [{ actor: 'enemy', amount: 4 }], [{ actor: 'ghost', amount: 1 }],
    [{ actor: 'enemy', amount: 1.5 }], [{ actor: 'enemy', amount: 1 }, { actor: 'enemy', amount: 1 }]]) {
    assert.equal(f.active(g, 'yeyan', ids, { allocations }).ok, false);
    assert.equal(g.player.flags.yeyanUsed, undefined); assert.equal(g.player.hand.length, 4); assert.equal(g.player.hp, 5);
  }
  assert.equal(f.active(g, 'yeyan', [ids[0], ids[0], ids[2], ids[3]], { allocations: [{ actor: 'enemy', amount: 3 }] }).ok, false);
  g.player.hand[3].suit = 'spade';
  assert.equal(f.active(g, 'yeyan', ids, { allocations: [{ actor: 'enemy', amount: 3 }] }).ok, false);
});

test('AB 业炎：四花色须是手牌，装备不能支付', () => {
  const f = fixture(); const g = f.game; const ids = costs(g);
  const equipment = g.player.hand.pop(); g.player.equipment.weapon = equipment;
  assert.equal(f.active(g, 'yeyan', ids, { allocations: [{ actor: 'enemy', amount: 3 }] }).ok, false);
  assert.equal(g.player.hp, 5); assert.equal(g.player.flags.yeyanUsed, undefined);
});

test('AB 业炎：大业炎允许仅分配2点，四牌守恒并先支付3体力', () => {
  const f = fixture(); const g = f.game; const ids = costs(g);
  assertCardConservation(g, () => f.active(g, 'yeyan', ids, { allocations: [{ actor: 'enemy', amount: 2 }] }));
  assert.equal(g.player.hp, 2); assert.equal(g.enemy.hp, 3);
  assert.equal(g.player.hand.length, 0); assert.equal(g.discard.length, 4);
});

test('AB 业炎：2+1 按行动顺序结算，目标可以包含自己', () => {
  const f = fixture(); const g = f.game; const ids = costs(g);
  f.active(g, 'yeyan', ids, { allocations: [{ actor: 'enemy', amount: 2 }, { actor: 'player', amount: 1 }] });
  assert.deepEqual(f.trace.filter(e => e[0] === 'damage'), [
    ['damage', 'player', 1, 'player', 'fire'], ['damage', 'enemy', 2, 'player', 'fire']
  ]);
  assert.equal(g.player.hp, 1); assert.equal(g.enemy.hp, 3);
});

test('AB 业炎：1体力可付成本，来源死亡而游戏继续时伤害无来源', () => {
  const f = fixture(); const g = f.game; const ids = costs(g); g.player.hp = 1;
  f.active(g, 'yeyan', ids, { allocations: [{ actor: 'enemy', amount: 3 }] });
  assert.equal(g.player.hp, -2);
  assert.deepEqual(f.trace.filter(e => e[0] === 'damage'), [['damage', 'enemy', 3, null, 'fire']]);
});

test('AB 业炎：真正终局取消后续火伤', () => {
  const f = fixture(undefined, { dying: g => { g.phase = 'gameover'; } });
  const g = f.game; const ids = costs(g); g.player.hp = 2;
  f.active(g, 'yeyan', ids, { allocations: [{ actor: 'enemy', amount: 3 }] });
  assert.equal(g.enemy.hp, 5); assert.equal(g.pauseState.responseFlows.length, 0);
});

test('AB 业炎：付体力后求桃挂起，JSON副本救回后继续且不重扣成本', () => {
  const f = fixture(undefined, { dying: (g, actor) => { g.pendingChoice = { kind: 'test-rescue', actor }; } });
  let g = f.game; const ids = costs(g); g.player.hp = 2;
  f.active(g, 'yeyan', ids, { allocations: [{ actor: 'enemy', amount: 2 }, { actor: 'ally', amount: 1 }] });
  assert.equal(g.enemy.hp, 5); assert.equal(g.player.hp, -1);
  g = JSON.parse(JSON.stringify(g)); g.pendingChoice = null; g.player.hp = 1;
  f.response.resumeSuspendedTurnFlowIfReady(g);
  assert.equal(g.player.hp, 1); assert.equal(g.enemy.hp, 3); assert.equal(g.ally.hp, 4);
  assert.equal(g.discard.length, 4); assert.equal(g.pauseState.responseFlows.length, 0);
});

test('AB 业炎：伤害目标插入选择后从下一目标恢复', () => {
  const f = fixture(undefined, { damage: (g, actor) => { if (actor === 'enemy') g.pendingChoice = { kind: 'test-damage' }; } });
  const g = f.game;
  f.active(g, 'yeyan', [], { allocations: [{ actor: 'enemy', amount: 1 }, { actor: 'ally', amount: 1 }] });
  assert.equal(g.enemy.hp, 4); assert.equal(g.ally.hp, 5);
  g.pendingChoice = null; f.response.resumeSuspendedTurnFlowIfReady(g);
  assert.equal(g.enemy.hp, 4); assert.equal(g.ally.hp, 4);
});

test('AB 业炎：零参数向导能输入2+1且最后确认才支付', () => {
  const f = fixture(); const g = f.game; const ids = costs(g);
  f.active(g, 'yeyan'); f.answer(g, { optionId: 'split' });
  assert.equal(g.pendingChoice.cardSuitRule, 'distinct');
  f.answer(g, { targetActors: ['enemy'], cardIds: ids });
  assert.equal(g.player.hp, 5); assert.equal(g.player.hand.length, 4);
  f.answer(g, { targetActors: ['ally'] });
  assert.equal(g.player.hp, 2); assert.equal(g.enemy.hp, 3); assert.equal(g.ally.hp, 4);
});

test('AB 琴音：少于两张自己的弃置手牌不触发；满足条件可放弃', () => {
  const f = fixture(); const g = f.game;
  SkillRuntime.runHook(f.registry, 'onDiscardPhaseEnd', { game: g, actor: 'player', discardedCards: [c('sha')], allDiscardedCards: cards('gear', 4) });
  assert.equal(g.pendingChoice, null);
  SkillRuntime.runHook(f.registry, 'onDiscardPhaseEnd', { game: g, actor: 'player', discardedCards: cards('discarded', 2) });
  assert.equal(g.pendingChoice.godChoiceType, 'qinyin');
  f.answer(g, { decline: true });
  assert.equal(g.player.hp, 5); assert.equal(g.enemy.hp, 5);
});

test('AB 琴音：全体回复只至体力上限，含自己，死亡席不恢复', () => {
  const f = fixture(); const g = f.game; g.player.hp = 2; g.enemy.hp = 0;
  SkillRuntime.runHook(f.registry, 'onDiscardPhaseEnd', { game: g, actor: 'player', discardedCards: cards('discarded', 2) });
  f.answer(g, { optionId: 'recover' });
  assert.equal(g.player.hp, 3); assert.equal(g.enemy.hp, 0); assert.equal(g.ally.hp, 5);
});

test('AB 琴音：失体力按行动順序逐席，不伤害；本人濒死恢复后续席继续', () => {
  const f = fixture(undefined, { dying: (g, actor) => { g.pendingChoice = { kind: 'test-rescue', actor }; } });
  const g = f.game; g.player.hp = 1;
  SkillRuntime.runHook(f.registry, 'onDiscardPhaseEnd', { game: g, actor: 'player', discardedCards: cards('discarded', 2) });
  f.answer(g, { optionId: 'lose' });
  assert.equal(g.player.hp, 0); assert.equal(g.enemy.hp, 5);
  g.pendingChoice = null; g.player.hp = 1;
  f.response.resumeSuspendedTurnFlowIfReady(g);
  assert.equal(g.player.hp, 1); assert.equal(g.enemy.hp, 4); assert.equal(g.ally.hp, 4);
  assert.equal(g.player.godMarks, undefined); assert.equal(f.trace.some(e => e[0] === 'damage'), false);
});

test('AB 神愤：严格全体伤害→全体装备→全体四手牌→自己翻面，守恒', () => {
  const f = fixture(); const g = f.game; g.player.godMarks = { rage: 6 };
  for (const actor of ['enemy', 'ally']) {
    g[actor].hand = cards(actor, 5);
    g[actor].equipment.weapon = c('qinggang', { id: actor + '-weapon' });
    g[actor].equipment.armor = c('baiyin', { id: actor + '-armor' });
  }
  assertCardConservation(g, () => f.active(g, 'shenfen'));
  const events = f.trace.map(e => e[0] === 'discard' ? (e[1].includes('-hand') ? 'hand' : 'gear') : e[0]);
  assert.deepEqual(events.slice(0, 2), ['damage', 'damage']);
  assert.equal(events.indexOf('hand') > events.lastIndexOf('equipment'), true);
  assert.equal(g.enemy.hand.length, 1); assert.equal(g.ally.hand.length, 1); assert.equal(g.player.turnedOver, true);
  assert.equal(g.player.godMarks.rage, 2, '神愤造成两次伤害各触发一次狂暴');
  assert.equal(f.active(g, 'shenfen').ok, false);
});

test('AB 神愤：不足四张尽量弃完，先前翻面则最后翻回正面', () => {
  const f = fixture(); const g = f.game; g.player.godMarks = { rage: 6 }; g.player.turnedOver = true;
  g.enemy.hand = cards('enemy', 2);
  f.active(g, 'shenfen');
  assert.equal(g.enemy.hand.length, 0); assert.equal(g.discard.length, 2); assert.equal(g.player.turnedOver, false);
});

test('AB 神愤：伤害暂停不得提前弃装备或手牌，JSON恢复不重复伤害', () => {
  const f = fixture(undefined, { damage: (g, actor) => { if (actor === 'enemy') g.pendingChoice = { kind: 'test-rescue' }; } });
  let g = f.game; g.player.godMarks = { rage: 6 };
  g.enemy.equipment.weapon = c('qinggang', { id: 'weapon' }); g.enemy.hand = cards('enemy', 3);
  f.active(g, 'shenfen');
  assert.equal(g.enemy.hp, 4); assert.equal(g.ally.hp, 5); assert.equal(g.discard.length, 0);
  g = JSON.parse(JSON.stringify(g)); g.pendingChoice = null;
  f.response.resumeSuspendedTurnFlowIfReady(g);
  assert.equal(g.enemy.hp, 4); assert.equal(g.ally.hp, 4); assert.equal(g.discard.length, 4);
});

test('AB 神愤：失装插入后重入不重复弃装备，后来获得手牌进入四牌步骤', () => {
  const f = fixture(undefined, { equipment: (g, actor, card) => {
    if (card.id === 'weapon') { CardRuntime.putCard(g, c('sha', { id: 'drawn-on-loss' }), { zone: 'hand', actor }); g.pendingChoice = { kind: 'test-loss' }; }
  } });
  const g = f.game; g.player.godMarks = { rage: 6 };
  g.enemy.equipment.weapon = c('qinggang', { id: 'weapon' }); g.enemy.hand = cards('enemy', 2);
  f.active(g, 'shenfen');
  assert.equal(g.enemy.hand.length, 3); assert.equal(g.player.turnedOver, undefined);
  g.pendingChoice = null; f.response.resumeSuspendedTurnFlowIfReady(g);
  assert.equal(g.enemy.hand.length, 0); assert.equal(g.discard.filter(card => card.id === 'weapon').length, 1);
  assert.equal(g.player.turnedOver, true);
});

test('AB 神愤：玩家被神愤时自行选四张，重复输入原子拒绝', () => {
  const f = fixture(); const g = f.game;
  g.enemy.skills = g.player.skills; g.player.skills = []; g.enemy.godMarks = { rage: 6 }; g.turn = 'enemy';
  g.player.hand = cards('player', 5);
  const result = SkillRuntime.runHook(f.registry, 'onActiveSkill', { game: g, actor: 'enemy', state: g.enemy,
    skillId: 'shenfen', cardIds: [], options: {} }).find(entry => entry.skillId === 'shenfen').result;
  assert.equal(result.ok, true); assert.equal(g.pendingChoice.godChoiceType, 'shenfen-discard');
  assert.equal(f.answer(g, { cardIds: ['player-hand0', 'player-hand0', 'player-hand1', 'player-hand2'] }).ok, false);
  assert.equal(g.player.hand.length, 5);
  f.answer(g, { cardIds: ['player-hand4', 'player-hand3', 'player-hand2', 'player-hand1'] });
  assert.deepEqual(g.player.hand.map(card => card.id), ['player-hand0']);
  assert.equal(g.enemy.turnedOver, true);
});

test('AB 神愤：终局停止余下全部伤害及弃牌，不在终局翻面', () => {
  const f = fixture(undefined, { damage: g => { g.phase = 'gameover'; } });
  const g = f.game; g.player.godMarks = { rage: 6 }; g.enemy.hand = cards('enemy', 3);
  f.active(g, 'shenfen');
  assert.equal(g.ally.hp, 5); assert.equal(g.enemy.hand.length, 3); assert.equal(g.player.turnedOver, undefined);
  assert.equal(g.pauseState.responseFlows.length, 0);
});

test('AB AI：主动业炎只选敌方；无前同回合不会无限耗标记', () => {
  const f = fixture(); const g = f.game;
  assert.equal(f.domain.runAIActiveSkills(g, 'player').acted, true);
  assert.equal(g.enemy.hp, 4); assert.equal(g.ally.hp, 5);
  g.player.godMarks = { rage: 4 }; g.player.hand = [c('sha')];
  assert.equal(f.domain.runAIActiveSkills(g, 'player').acted, true);
  assert.equal(f.domain.runAIActiveSkills(g, 'player').acted, false);
  assert.equal(g.player.godMarks.rage, 2);
});

const result = await runTests();
console.log(`${result.passed}/${result.total} AB 神周瑜 / 神吕布领域测试通过。`);
