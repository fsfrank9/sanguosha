import assert from 'node:assert/strict';
import { Engine, StateRuntime, c } from './helpers/load-engine.mjs';
import { GeneralCardRuntime } from '../src/engine/general-card-runtime.js';
import { test, runTests } from './helpers/harness.mjs';
import { assertCardConservation, collectCardCensus } from './helpers/card-conservation.mjs';

function fresh(options = {}) {
  return Engine.newGame({ seed: 163030, playerHero: 'zuoci', enemyHero: 'caocao', ...options });
}
function ownPool(game, actor = 'player', count = 100) {
  return GeneralCardRuntime.draw(game, actor, count);
}
function answer(game, heroId, skillId, dispatcher = 'resolvePendingChoice') {
  const pending = game.pendingChoice;
  const option = heroId ? pending.options.find(entry => entry.heroId === heroId)
    : pending.options.find(entry => !entry.disabledReason);
  return Engine[dispatcher](game, { choiceId: pending.choiceId, heroId: option.heroId,
    skillId: skillId || option.skills?.[0]?.id });
}
function withHooks(hooks, action) {
  const remove = hooks.map(([name, skill, fn]) => Engine.registerBoundaryHook(name, skill, fn));
  try { action(); } finally { remove.forEach(unregister => unregister()); }
}

test('AA3 live newGame pauses after revealed characters and before initial hands', () => {
  withHooks([['onGameStart', 'huashen', ({ game, actor, requestGeneralSelection }) => {
    assert.equal(game.turn, null); assert.equal(game.phase, 'setup');
    assert.equal(game.player.hand.length, 0); assert.equal(game.enemy.hand.length, 0);
    assert.equal(game.roleRevealed.player, true);
    ownPool(game, actor, 2); requestGeneralSelection(game, actor, { reason: '开局选择' });
  }]], () => {
    const game = fresh(); const initial = collectCardCensus(game).ids;
    assert.equal(game.pendingChoice.kind, 'general-card-choice');
    assert.equal(GeneralCardRuntime.view(game, 'player').hiddenCount, 2);
    assert.equal(Engine.startTurn(game, 'player').ok, false);
    assert.equal(answer(game).ok, true);
    assert.equal(game.player.hand.length, 4); assert.equal(game.enemy.hand.length, 4);
    assert.deepEqual(collectCardCensus(game).ids, initial);
    assert.equal(game.pauseState.responseFlows.length, 0);
  });
});

test('AA3 game-start choice precedes real first turn without double dealing after JSON resume', () => {
  withHooks([['onGameStart', 'huashen', ({ game, actor, requestGeneralSelection }) => {
    game.initInvocations = (game.initInvocations || 0) + 1;
    ownPool(game, actor, 2); requestGeneralSelection(game, actor);
  }]], () => {
    const original = fresh({ startWithFirstTurn: true });
    const game = JSON.parse(JSON.stringify(original));
    assert.equal(answer(game).ok, true);
    assert.equal(game.initInvocations, 1); assert.equal(game.phase, 'play');
    assert.equal(game.player.hand.length, 6); assert.equal(game.enemy.hand.length, 4);
    assert.equal(game.turnHistory.filter(entry => entry.phase === 'prepare').length, 1);
    assert.equal(original.player.hand.length, 0);
    assert.equal(original.pendingChoice.kind, 'general-card-choice');
  });
});

test('AA3 independent general RNG never changes ordinary game deck or initial hands', () => {
  const normal = fresh();
  withHooks([['onGameStart', 'huashen', ({ game, actor }) => { ownPool(game, actor, 7); }]], () => {
    const drawn = fresh();
    for (const zone of ['deck', 'discard']) assert.deepEqual(drawn[zone], normal[zone]);
    for (const actor of drawn.seats) assert.deepEqual(drawn[actor].hand, normal[actor].hand);
    assert.equal(drawn.random(), normal.random());
    assert.equal(drawn.pendingChoice, null);
  });
});

test('AA3 turned-over and dead seats never enter turn-start hooks', () => {
  const seen = [];
  withHooks([['onTurnStart', 'huashen', ({ actor, boundaryActor }) => seen.push([actor, boundaryActor])]], () => {
    const game = fresh({ seats: ['player', 'enemy', 'ally'], allyHero: 'zuoci' });
    game.player.turnedOver = true; game.enemy.hp = 0;
    Engine.startTurn(game, 'player');
    assert.equal(game.player.turnedOver, false); assert.equal(game.turn, 'ally');
    assert.deepEqual(seen, [['ally', 'ally'], ['player', 'ally']]);
    assert.equal(game.turnHistory[0].actor, 'ally');
  });
});

test('AA3 turn-start pending choice resumes before prepare exactly once', () => {
  withHooks([['onTurnStart', 'huashen', ({ game, actor, boundaryActor, requestGeneralSelection }) => {
    if (actor !== boundaryActor) return;
    game.boundaryCalls = (game.boundaryCalls || 0) + 1;
    requestGeneralSelection(game, actor, { optional: true });
  }]], () => {
    const game = fresh(); ownPool(game);
    Engine.startTurn(game, 'player');
    assert.equal(game.phase, 'turn-start'); assert.equal(game.turnHistory.length, 0);
    const clone = JSON.parse(JSON.stringify(game));
    assert.equal(Engine.resolvePendingChoice(clone, { decline: true, choiceId: clone.pendingChoice.choiceId }).ok, true);
    assert.equal(clone.boundaryCalls, 1); assert.equal(clone.phase, 'play');
    assert.equal(clone.turnHistory.filter(entry => entry.phase === 'prepare').length, 1);
    assert.equal(game.phase, 'turn-start');
  });
});

test('AA3 end-after window is outside every turn and precedes extra-turn dispatch', () => {
  withHooks([['onAfterTurnEnd', 'huashen', ({ game, actor, boundaryActor, requestGeneralSelection }) => {
    if (actor !== boundaryActor) return;
    assert.equal(game.turn, null); assert.equal(game.phase, 'between-turns');
    assert.equal(game.enemy.shaBonus, 0);
    requestGeneralSelection(game, actor, { optional: true });
  }]], () => {
    const game = fresh({ seats: ['player', 'enemy', 'ally'], allyHero: 'liubei' });
    ownPool(game); game.pendingExtraTurns = ['ally']; game.enemy.shaBonus = 1;
    Engine.endTurn(game);
    assert.equal(game.turn, null); assert.deepEqual(game.pendingExtraTurns, ['ally']);
    assert.equal(answer(game, 'huatuo', 'jijiu').ok, true);
    assert.equal(game.turn, 'ally'); assert.equal(game.extraTurnReturnSeat, 'enemy');
    assert.equal(StateRuntime.skillEnabled(game.player, 'jijiu', game), true);
    Engine.endTurn(game);
    assert.equal(game.turn, 'enemy'); assert.equal(game.extraTurnReturnSeat, null);
  });
});

test('AA3 end-after JSON resume skips a turned-over extra turn and returns to the original next seat', () => {
  withHooks([['onAfterTurnEnd', 'huashen', ({ game, actor, boundaryActor, requestGeneralSelection }) => {
    if (actor === boundaryActor) requestGeneralSelection(game, actor, { optional: true });
  }]], () => {
    const original = fresh({ seats: ['player', 'enemy', 'ally'], allyHero: 'liubei' });
    ownPool(original); original.pendingExtraTurns = ['ally']; original.ally.turnedOver = true;
    Engine.endTurn(original);
    const game = JSON.parse(JSON.stringify(original));
    assert.equal(game.turn, null);
    assert.equal(Engine.resolvePendingChoice(game, { decline: true, choiceId: game.pendingChoice.choiceId }).ok, true);
    assert.equal(game.ally.turnedOver, false);
    assert.equal(game.turn, 'enemy', 'skipped recipient must not replace the original continuation seat');
    assert.equal(game.extraTurnReturnSeat, null);
    assert.equal(game.turnHistory.some(entry => entry.actor === 'ally'), false);
    assert.equal(original.ally.turnedOver, true);
    assert.equal(original.turn, null);
    assert.equal(game.pauseState.responseFlows.length, 0);
  });
});

test('AA3 native Fangquan choice finishes before end-after selection and extra-turn dispatch', () => {
  withHooks([['onAfterTurnEnd', 'huashen', ({ game, actor, boundaryActor, requestGeneralSelection }) => {
    if (actor !== boundaryActor) return;
    assert.equal(game.pauseState.turnEndPending, null);
    assert.equal(game.turn, null); assert.deepEqual(game.pendingExtraTurns, ['ally']);
    requestGeneralSelection(game, actor, { optional: true });
  }]], () => {
    const game = fresh({ playerHero: 'liushan', seats: ['player', 'enemy', 'ally'], allyHero: 'huatuo' });
    StateRuntime.grantSkill(game.player, 'huashen'); ownPool(game);
    game.player.flags.fangquanSkipped = true;
    const cost = game.player.hand[0].id;
    Engine.endTurn(game);
    assert.equal(game.pendingChoice.kind, 'fangquan-grant');
    assert.equal(game.turn, 'player');
    assertCardConservation(game, () => Engine.resolvePendingChoice(game, { target: 'ally', cardId: cost }));
    assert.equal(game.pendingChoice.kind, 'general-card-choice');
    assert.equal(game.turn, null);
    assert.equal(answer(game, 'huangyueying', 'jizhi').ok, true);
    assert.equal(game.turn, 'ally'); assert.equal(game.extraTurnReturnSeat, 'enemy');
    assert.equal(game.discard.filter(card => card.id === cost).length, 1);
    assert.equal(game.pauseState.responseFlows.length, 0);
  });
});

test('AA3 death during an extra-turn start boundary preserves the original next seat', () => {
  withHooks([['onTurnStart', 'huashen', ({ game, actor, boundaryActor }) => {
    if (actor === 'ally' && actor === boundaryActor) game.ally.hp = 0;
  }]], () => {
    const game = fresh({ playerHero: 'liubei', enemyHero: 'zhangfei',
      seats: ['player', 'enemy', 'ally', 'ally2'], allyHero: 'zuoci', ally2Hero: 'machao',
      roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '反贼' } });
    game.pendingExtraTurns = ['ally'];
    assertCardConservation(game, () => Engine.endTurn(game));
    assert.equal(game.ally.hp, 0);
    assert.equal(game.turn, 'enemy', 'death in the start boundary must retain the original continuation');
    assert.equal(game.extraTurnReturnSeat, null);
    assert.equal(game.turnHistory.some(entry => entry.actor === 'ally' || entry.actor === 'ally2'), false);
    assert.equal(game.pauseState.responseFlows.length, 0);
  });
});

test('AA3 same boundary reevaluates gained and lost skills without restarting paid hooks', () => {
  const calls = [];
  withHooks([
    ['onTurnStart', 'aa_new', () => calls.push('new')],
    ['onTurnStart', 'huashen', ({ game, actor }) => {
      calls.push('paid'); StateRuntime.grantSkill(game[actor], 'aa_new', '新技能');
      StateRuntime.activateSkillSource(game[actor], 'switch', { id: 'aa_replacement' });
    }],
    ['onTurnStart', 'aa_lost', () => calls.push('lost')],
  ], () => {
    const game = fresh(); StateRuntime.activateSkillSource(game.player, 'switch', { id: 'aa_lost' });
    Engine.startTurn(game, 'player');
    assert.deepEqual(calls, ['paid', 'new']);
  });
});

test('AA3 queued nested choices drain before lifecycle continuation, including JSON copies', () => {
  withHooks([['onTurnStart', 'huashen', ({ game, actor, boundaryActor, requestGeneralSelection }) => {
    if (actor !== boundaryActor) return;
    game.paidInvocations = (game.paidInvocations || 0) + 1;
    requestGeneralSelection(game, actor, { optional: true });
    requestGeneralSelection(game, actor, { optional: true });
  }]], () => {
    const original = fresh(); ownPool(original); Engine.startTurn(original, 'player');
    const game = JSON.parse(JSON.stringify(original));
    const firstId = game.pendingChoice.choiceId;
    answer(game, 'huangyueying', 'jizhi');
    assert.equal(game.phase, 'turn-start'); assert.equal(game.pendingChoiceQueue.length, 0);
    assert.notEqual(game.pendingChoice.choiceId, firstId);
    answer(game, 'guanyu', 'wusheng', 'resolveResponseChoice');
    assert.equal(game.paidInvocations, 1); assert.equal(game.phase, 'play');
    assert.equal(game.pauseState.responseFlows.length, 0);
    assert.equal(StateRuntime.skillEnabled(game.player, 'jizhi', game), false);
    assert.equal(StateRuntime.skillEnabled(game.player, 'wusheng', game), true);
    assert.equal(original.pendingChoice.choiceId, firstId);
  });
});

test('AA3 current general can select another skill, A-B-A retains usage and native body', () => {
  const game = fresh(); ownPool(game); const body = [game.player.id, game.player.maxHp, game.player.hp];
  const choose = (hero, skill) => { Engine.requestGeneralSelection(game, 'player'); assert.equal(answer(game, hero, skill).ok, true); };
  choose('sunquan', 'zhiheng'); game.player.flags.zhihengUsed = true;
  choose('zhaoyun', 'longdan'); choose('sunquan', 'zhiheng');
  assert.equal(game.player.flags.zhihengUsed, true);
  assert.equal(game.player.dynamicSkills.filter(skill => skill.id === 'zhiheng').length, 1);
  choose('huangyueying', 'jizhi');
  Engine.requestGeneralSelection(game, 'player');
  assert.equal(game.pendingChoice.activeHeroId, 'huangyueying');
  assert.equal(game.pendingChoice.activeSkillId, 'jizhi');
  assert.equal(answer(game, 'huangyueying', 'qicai').ok, true);
  assert.equal(StateRuntime.effectiveCamp(game.player), '蜀');
  assert.equal(StateRuntime.effectiveGender(game.player), 'female');
  assert.deepEqual([game.player.id, game.player.maxHp, game.player.hp], body);
  GeneralCardRuntime.assertConservation(game);
});

test('AA3 stale identity, forged skill, missing skill and forced decline reject atomically', () => {
  for (const patch of [{ choiceId: -1 }, { skillId: 'huashen' }, { skillId: undefined }, { decline: true }]) {
    const game = fresh(); ownPool(game); Engine.requestGeneralSelection(game, 'player');
    const before = JSON.stringify(game);
    assert.equal(Engine.resolvePendingChoice(game, { choiceId: game.pendingChoice.choiceId,
      heroId: 'huangyueying', skillId: 'jizhi', ...patch }).ok, false);
    assert.equal(JSON.stringify(game), before);
  }
});

test('AA3 removed selected ownership rejects atomically while other choices remain legal', () => {
  const game = fresh(); ownPool(game); Engine.requestGeneralSelection(game, 'player');
  GeneralCardRuntime.release(game, 'player', ['huangyueying']);
  const before = JSON.stringify(game);
  assert.equal(answer(game, 'huangyueying', 'jizhi').ok, false);
  assert.equal(JSON.stringify(game), before);
});

test('AA3 real source loss, death, or exhausted choices cancel and resume a JSON boundary without applying effects', () => {
  const mutations = [
    game => { StateRuntime.grantSkill(game.player, 'chanyuan'); game.player.hp = 1; },
    game => { StateRuntime.stripAllSkills(game.player, game); },
    game => { game.player.hp = 0; },
    game => { GeneralCardRuntime.releaseAll(game, 'player'); },
  ];
  for (const mutate of mutations) {
    withHooks([['onTurnStart', 'huashen', ({ game, actor, boundaryActor, requestGeneralSelection }) => {
      if (actor !== boundaryActor) return;
      game.boundaryCalls = (game.boundaryCalls || 0) + 1;
      requestGeneralSelection(game, actor);
    }]], () => {
      const original = fresh(); ownPool(original); Engine.startTurn(original, 'player');
      const game = JSON.parse(JSON.stringify(original));
      const choiceId = game.pendingChoice.choiceId;
      mutate(game);
      const pool = JSON.stringify(game.generalCards);
      assert.equal(Engine.resolvePendingChoice(game, { choiceId, decline: true }).ok, true);
      assert.equal(game.pendingChoice, null);
      assert.equal(game.boundaryCalls, 1);
      assert.equal(game.phase, 'play');
      assert.equal(JSON.stringify(game.generalCards), pool);
      assert.equal((game.player.dynamicSkills || []).length, 0);
      assert.equal(StateRuntime.effectiveCamp(game.player), '群');
      assert.equal(game.pauseState.responseFlows.length, 0);
      assert.equal(game.pauseState.generalSelection, null);
      assert.equal(original.pendingChoice.choiceId, choiceId);
      GeneralCardRuntime.assertConservation(game);
    });
  }
});

test('AA3 optional decline and duplicate old response never change an accepted selection', () => {
  const game = fresh(); ownPool(game); Engine.requestGeneralSelection(game, 'player', { optional: true });
  const old = game.pendingChoice.choiceId;
  assert.equal(Engine.resolvePendingChoice(game, { decline: true, choiceId: old }).ok, true);
  Engine.requestGeneralSelection(game, 'player'); const before = JSON.stringify(game);
  assert.equal(Engine.resolvePendingChoice(game, { heroId: 'huangyueying', skillId: 'jizhi', choiceId: old }).ok, false);
  assert.equal(JSON.stringify(game), before); assert.equal(answer(game, 'huangyueying', 'jizhi').ok, true);
});

test('AA3 pure general selection, filters, and pending metadata never pollute card census', () => {
  const game = fresh(); ownPool(game); const before = collectCardCensus(game).ids;
  Engine.requestGeneralSelection(game, 'player');
  assert(game.pendingChoice.options.every(option => option.skills.every(skill => !skill.lord && skill.frequency !== 'oncePerGame' && skill.status === 'implemented')));
  assert.deepEqual(game.pendingChoice.options.find(option => option.heroId === 'sp_yuanshu').skills.map(skill => skill.id), ['yongsi']);
  assert(game.pendingChoice.options.some(option => option.heroId === 'sp_machao' && option.disabledReason));
  assert.equal(game.generalCards.catalogIds.length, Object.keys(Engine.HERO_CATALOG).length, 'unimplemented heroes remain in the conserved outside pool');
  assert.deepEqual(collectCardCensus(game).ids, before);
  assertCardConservation(game, () => answer(game, 'huangyueying', 'jizhi'));
  Engine.requestGeneralSelection(game, 'player', { applySkill: false });
  assert.equal(game.pendingChoice.options[0].skills, undefined);
  assertCardConservation(game, () => answer(game, 'sunquan'));
  assert.equal(game.player.dynamicSkills.filter(skill => skill.enabled).length, 1);
});

test('AA3 AI selection uses only its own options, stays deterministic and consumes no game RNG', () => {
  const a = fresh({ enemyHero: 'zuoci' }); ownPool(a, 'enemy', 10); ownPool(a, 'player', 5);
  const b = JSON.parse(JSON.stringify(a));
  b.generalCards.holdings.player.hiddenIds.reverse();
  const randomState = a.generalCards.randomState;
  assert.equal(Engine.requestGeneralSelection(a, 'enemy').ok, true);
  assert.equal(Engine.requestGeneralSelection(b, 'enemy').ok, true);
  assert.equal(a.pendingChoice, null);
  assert.deepEqual(a.generalCards.holdings.enemy, b.generalCards.holdings.enemy);
  assert.deepEqual(a.enemy.dynamicSkills, b.enemy.dynamicSkills);
  assert.equal(a.generalCards.randomState, randomState);
});

test('AA3 loss of every skill releases pool and identity while retaining unrelated game cards', () => {
  const game = fresh(); ownPool(game); Engine.requestGeneralSelection(game, 'player'); answer(game, 'huangyueying', 'jizhi');
  game.player.tian = [c('sha', { id: 'aa-retained-field' })];
  assertCardConservation(game, () => StateRuntime.stripAllSkills(game.player, game));
  assert.equal(GeneralCardRuntime.view(game, 'player').activeId, null);
  assert.equal(GeneralCardRuntime.view(game, 'player').hiddenCount, 0);
  assert.equal(StateRuntime.effectiveCamp(game.player), '群');
  assert.equal(StateRuntime.effectiveGender(game.player), 'male');
  GeneralCardRuntime.assertConservation(game);
});

test('AA3 gameover cancels a paused boundary without dealing or starting another turn', () => {
  Engine.registerResponseKind('aa-end-game', game => { game.phase = 'gameover'; return { ok: true }; });
  withHooks([['onGameStart', 'huashen', ({ game, actor }) => {
    Engine.requestPlayerResponse(game, { kind: 'aa-end-game', actor, pauseKey: 'aaTerminal', source: {} });
  }]], () => {
    const game = fresh({ startWithFirstTurn: true });
    assert.equal(Engine.resolvePendingChoice(game, {}).ok, true);
    assert.equal(game.phase, 'gameover'); assert.equal(game.player.hand.length, 0);
    assert.equal(game.turnHistory.length, 0); assert.equal(game.pauseState.responseFlows.length, 0);
    assert.equal(game.pauseState.lifecycleBoundary, null);
  });
});

const result = await runTests();
console.log(`${result.passed}/${result.total} AA3 boundary and selection tests passed.`);
