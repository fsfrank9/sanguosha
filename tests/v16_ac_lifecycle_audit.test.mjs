import assert from 'node:assert/strict';
import { Engine, c, StateRuntime as S } from './helpers/load-engine.mjs';
import { GeneralCardRuntime as G } from '../src/engine/general-card-runtime.js';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function fresh(hero = 'xiaoqiao', overrides = {}) {
  const game = Engine.newGame({ seed: 9125, seats: ['player', 'enemy', 'ally', 'ally2'],
    playerHero: hero, enemyHero: 'liubei', allyHero: 'guanyu', ally2Hero: 'lvbu',
    roles: { player: '忠臣', enemy: '反贼', ally: '主公', ally2: '反贼' }, ...overrides });
  for (const actor of game.seats) Object.assign(game[actor], { hp: 4, maxHp: 4, hand: [],
    judgeArea: [], equipment: {}, flags: {}, skillPreferences: { dying: 'decline' } });
  Object.assign(game, { turn: 'enemy', phase: 'play', pauseState: {}, pendingChoice: null,
    pendingChoiceQueue: [], log: [], discard: [], deck: Array.from({ length: 30 }, (_, i) =>
      c('sha', { id: 'ac-lifecycle-deck-' + i, suit: 'club' })) });
  return game;
}

function resolve(game, decision) {
  return G.assertConservation(game, () => assertCardConservation(game, () => {
    const result = Engine.resolvePendingChoice(game, { choiceId: game.pendingChoice?.choiceId, ...decision });
    assert.equal(result.ok, true, result.message);
    return result;
  }));
}

test('AC L1 Tianxiang transferred dying rescue survives JSON and draws only on the restored game', () => {
  const game = fresh();
  game.player.skillPreferences.tianxiang = 'ask';
  game.player.hand = [c('tao', { id: 'ac-transfer-cost', suit: 'heart' })];
  game.enemy.hp = 1;
  game.enemy.skillPreferences.dying = 'ask';
  game.enemy.hand = [c('sha', { id: 'ac-transfer-hit' }), c('tao', { id: 'ac-transfer-rescue' })];
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'ac-transfer-hit', { target: 'player' }));
  assert.equal(game.pendingChoice.kind, 'tianxiang-ask');
  resolve(game, { cardId: 'ac-transfer-cost', target: 'enemy' });
  assert.equal(game.pendingChoice.kind, 'dying-rescue');
  const copy = JSON.parse(JSON.stringify(game));
  const original = JSON.stringify(game);
  resolve(copy, { cardId: 'ac-transfer-rescue' });
  assert.equal(copy.enemy.hp, 1);
  assert.equal(copy.enemy.hand.length, 3, 'Tianxiang draws missing HP after rescue');
  assert.equal(copy.pendingChoice, null);
  assert.equal((copy.pauseState.responseFlows || []).length, 0);
  assert.equal(JSON.stringify(game), original, 'resuming a clone cannot mutate the original');
  resolve(game, { cardId: 'ac-transfer-rescue' });
  assert.deepEqual(copy.enemy.hand, game.enemy.hand);
});

test('AC L2 JSON Niepan claims all three delayed cards exactly once and never rejudges cleared cards', () => {
  const game = fresh('pangtong');
  game.player.hp = 1;
  game.player.skillPreferences.niepan = 'ask';
  game.player.judgeArea = [c('lebusishu', { id: 'ac-niepan-le' }),
    c('bingliang', { id: 'ac-niepan-bing' }), c('shandian', { id: 'ac-niepan-lightning' })];
  game.deck.push(c('sha', { id: 'ac-niepan-judgement', suit: 'spade', rank: '5' }));
  assertCardConservation(game, () => Engine.startTurn(game, 'player'));
  assert.equal(game.pendingChoice.kind, 'niepan-ask');
  assert.equal(game.phase, 'judge');
  const copy = JSON.parse(JSON.stringify(game));
  resolve(copy, {});
  assert.equal(copy.phase, 'play');
  assert.equal(copy.player.hp, 3);
  assert.equal(copy.player.flags.skipPlay, false);
  assert.equal(copy.player.flags.skipDraw, false);
  assert.equal(copy.log.filter(line => line.includes('进行') && line.includes('判定')).length, 1);
  for (const id of ['ac-niepan-le', 'ac-niepan-bing', 'ac-niepan-lightning']) {
    assert.equal(copy.discard.filter(card => card.id === id).length, 1, id);
  }
  assert.equal(game.pendingChoice.kind, 'niepan-ask');
  resolve(game, {});
  assert.deepEqual(copy.player.hand, game.player.hand);
});

test('AC L3 Tiandu obtains Lightning judgement Wine before lethal damage and can self-rescue', () => {
  const game = fresh('guojia');
  game.player.hp = 3;
  game.player.skillPreferences = { dying: 'auto', yiji: 'decline' };
  game.player.judgeArea = [c('shandian', { id: 'ac-tiandu-lightning' })];
  game.deck.push(c('jiu', { id: 'ac-tiandu-judgement', suit: 'spade', rank: '3' }));
  assertCardConservation(game, () => Engine.startTurn(game, 'player'));
  assert.equal(game.player.hp, 1, 'the Wine obtained during judgement is available in dying');
  assert.equal(game.turn, 'player');
  assert.equal(game.phase, 'play');
  assert.equal(game.generalCards.deathReturnedSeats.includes('player'), false);
  assert.ok(game.log.findIndex(line => line.includes('发动【天妒】'))
    < game.log.findIndex(line => line.includes('因【闪电】受到')));
  assert.equal(game.discard.filter(card => card.id === 'ac-tiandu-judgement').length, 1);
});

test('AC L1 Kurou paid HP loss resumes a data-only draw after JSON rescue and ignores later skill loss', () => {
  const game = fresh('huanggai');
  game.turn = 'player'; game.player.hp = 1;
  game.player.skillPreferences.dying = 'ask';
  game.player.hand = [c('tao', { id: 'ac-kurou-rescue' })];
  assertCardConservation(game, () => Engine.useSkill(game, 'player', 'kurou', []));
  assert.equal(game.pendingChoice.kind, 'dying-rescue');
  assert.deepEqual(game.pauseState.deferredAfterDying, [{ kind: 'kurou-draw', actor: 'player' }]);
  const copy = JSON.parse(JSON.stringify(game));
  S.stripAllSkills(copy.player, copy);
  resolve(copy, { cardId: 'ac-kurou-rescue' });
  assert.equal(copy.player.hp, 1);
  assert.equal(copy.player.hand.length, 2);
  assert.equal(game.player.hand.length, 1);
  assert.equal(game.pendingChoice.kind, 'dying-rescue');
});

for (const initialHp of [1, 3]) {
  test(`AC L1 Tianxiang draw waits for Guixin damage-after at HP ${initialHp} through JSON windows`, () => {
    const game = fresh('liubei', { enemyHero: 'xiaoqiao' });
    game.turn = 'ally';
    game.enemy.skillPreferences.tianxiang = 'ask';
    game.enemy.hand = [c('tao', { id: 'ac-guixin-transfer', suit: 'heart' })];
    S.grantSkill(game.player, 'guixin', '归心');
    game.player.skillPreferences.guixin = 'ask';
    game.player.skillPreferences.dying = 'ask';
    game.player.hp = initialHp;
    game.ally.hand = [c('sha', { id: 'ac-guixin-hit' }), c('sha', { id: 'ac-guixin-available' })];
    if (initialHp === 1) game.player.hand.push(c('tao', { id: 'ac-guixin-rescue' }));
    assertCardConservation(game, () => Engine.playCard(game, 'ally', 'ac-guixin-hit', { target: 'enemy' }));
    resolve(game, { cardId: 'ac-guixin-transfer', target: 'player' });
    const copy = JSON.parse(JSON.stringify(game));
    if (initialHp === 1) {
      assert.equal(copy.pendingChoice.kind, 'dying-rescue');
      resolve(copy, { cardId: 'ac-guixin-rescue' });
    }
    assert.equal(copy.pendingChoice.godChoiceType, 'guixin-invoke');
    assert.equal(copy.player.hand.length, 0, 'Tianxiang draw cannot overtake damage-after');
    const next = JSON.parse(JSON.stringify(copy));
    resolve(next, { decline: true });
    assert.equal(next.player.hand.length, initialHp === 1 ? 3 : 2);
    assert.equal(next.pendingChoice, null);
    assert.equal(next.log.filter(line => line.includes('因【天香】摸')).length, 1);
    assert.equal(copy.player.hand.length, 0);
  });
}

test('AC L4 an unpaid Niepan window cannot revive after its skill source is lost', () => {
  const game = fresh('pangtong');
  game.player.hp = 1; game.player.skillPreferences.niepan = 'ask';
  game.enemy.hand = [c('sha', { id: 'ac-expired-niepan-hit' })];
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'ac-expired-niepan-hit', { target: 'player' }));
  assert.equal(game.pendingChoice.kind, 'niepan-ask');
  const copy = JSON.parse(JSON.stringify(game));
  S.stripAllSkills(copy.player, copy);
  resolve(copy, {});
  assert.equal(copy.player.hp, 0);
  assert.equal(copy.player.hand.length, 0);
  assert.equal(copy.log.some(line => line.includes('发动【涅槃】：')), false);
  assert.equal(copy.generalCards.deathReturnedSeats.includes('player'), true);
});

for (const type of ['lebusishu', 'bingliang', 'shandian']) {
  test(`AC delayed ${type} JSON Wuxie cancels before judgement and preserves both card resources`, () => {
    const game = fresh('liubei');
    game.player.hand = [c('wuxie', { id: 'ac-delay-wuxie' })];
    game.player.skillPreferences.wuxieResponse = 'ask';
    game.player.judgeArea = [c(type, { id: 'ac-delay' })];
    const generals = JSON.stringify(game.generalCards);
    assertCardConservation(game, () => Engine.startTurn(game, 'player'));
    assert.equal(game.pendingChoice.kind, 'wuxie-response');
    const copy = JSON.parse(JSON.stringify(game));
    resolve(copy, { cardId: 'ac-delay-wuxie' });
    assert.equal(copy.phase, 'play');
    assert.equal(copy.player.hp, 4);
    assert.equal(copy.player.hand.length, 2);
    assert.equal(copy.log.some(line => line.includes('进行') && line.includes('判定')), false);
    const settled = type === 'shandian' ? copy.enemy.judgeArea : copy.discard;
    assert.equal(settled.filter(card => card.id === 'ac-delay').length, 1);
    assert.equal(JSON.stringify(copy.generalCards), generals);
    assert.equal(game.pendingChoice.kind, 'wuxie-response');
  });
}

test('AC delayed LIFO settles Lightning, Bingliang, then Lebu with separate draw/play outcomes', () => {
  const game = fresh('liubei');
  game.player.judgeArea = [c('lebusishu', { id: 'ac-order-le' }), c('bingliang', { id: 'ac-order-bing' }),
    c('shandian', { id: 'ac-order-lightning' })];
  // deck.pop: diamond Lightning misses; heart Bingliang skips draw; club Lebu skips play.
  game.deck.push(c('sha', { id: 'ac-order-j-le', suit: 'club' }),
    c('sha', { id: 'ac-order-j-bing', suit: 'heart' }), c('sha', { id: 'ac-order-j-lightning', suit: 'diamond' }));
  assertCardConservation(game, () => Engine.startTurn(game, 'player'));
  assert.deepEqual(game.log.filter(line => line.includes('进行') && line.includes('判定'))
    .map(line => line.match(/进行【([^】]+)】/)[1]), ['闪电', '兵粮寸断', '乐不思蜀']);
  assert.equal(game.player.flags.skipDraw, true); assert.equal(game.player.flags.skipPlay, true);
  assert.equal(game.player.hand.length, 0); assert.equal(game.player.hp, 4);
  assert.equal(game.enemy.judgeArea[0].id, 'ac-order-lightning');
});

for (const active of [true, false]) {
  test(`AC AA dynamic Weimu ${active ? 'enabled' : 'inactive history'} controls Lightning relocation`, () => {
    const game = fresh('liubei');
    S.activateSkillSource(game.enemy, 'huashen', { id: 'weimu', name: '帷幕' });
    if (!active) S.activateSkillSource(game.enemy, 'huashen', { id: 'qicai', name: '奇才' });
    game.player.judgeArea = [c('shandian', { id: 'ac-weimu-lightning', suit: 'spade' })];
    game.deck.push(c('sha', { id: 'ac-weimu-judge', suit: 'heart' }));
    const copy = JSON.parse(JSON.stringify(game));
    assertCardConservation(copy, () => Engine.startTurn(copy, 'player'));
    assert.equal(S.ownsSkill(copy.enemy, 'weimu', copy), true);
    assert.equal(S.skillEnabled(copy.enemy, 'weimu', copy), active);
    assert.equal(copy[active ? 'ally' : 'enemy'].judgeArea[0].id, 'ac-weimu-lightning');
    assert.equal(copy.player.hp, 4);
  });
}

for (const suppressed of [false, true]) {
  test(`AC AA acquired Hongyan ${suppressed ? 'suppressed' : 'effective'} changes Lebu result without corrupting suit`, () => {
    const game = fresh('liubei');
    S.activateSkillSource(game.player, 'huashen', { id: 'hongyan', name: '红颜' });
    if (suppressed) { S.grantSkill(game.player, 'chanyuan', '缠怨'); game.player.hp = 1; }
    game.player.judgeArea = [c('lebusishu', { id: 'ac-hongyan-le' })];
    game.deck.push(c('sha', { id: 'ac-hongyan-judge', suit: 'spade' }));
    assertCardConservation(game, () => Engine.startTurn(game, 'player'));
    assert.equal(game.player.flags.skipPlay, suppressed);
    assert.equal(game.discard.find(card => card.id === 'ac-hongyan-judge').suit, 'spade');
    assert.equal(S.ownsSkill(game.player, 'hongyan', game), true);
    assert.equal(S.skillEnabled(game.player, 'hongyan', game), !suppressed);
  });
}

test('AC AA effective gender locks Roulin whole-card response count across JSON and form removal', () => {
  const game = fresh('liubei', { enemyHero: 'dongzhuo' });
  S.setIdentityOverride(game.player, 'huashen', { gender: 'female', camp: '吴' });
  assert.equal(game.player.gender, 'male');
  game.player.skillPreferences.shanResponse = 'ask';
  game.player.hand = [c('shan', { id: 'ac-gender-first' }), c('shan', { id: 'ac-gender-second' })];
  game.enemy.hand = [c('sha', { id: 'ac-gender-hit' })];
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'ac-gender-hit', { target: 'player' }));
  assert.equal(game.pendingChoice.kind, 'shan-response');
  resolve(game, { cardId: 'ac-gender-first' });
  const copy = JSON.parse(JSON.stringify(game));
  S.clearIdentityOverride(copy.player, 'huashen');
  assert.equal(S.effectiveGender(copy.player), 'male');
  assert.equal(copy.pendingChoice.kind, 'shan-response');
  resolve(copy, { cardId: 'ac-gender-second' });
  assert.equal(copy.player.hp, 4); assert.equal(copy.player.hand.length, 0);
  assert.equal(S.effectiveGender(game.player), 'female');
});

test('AC AA rescue reads current effective camp after JSON while base camp and independent generals stay fixed', () => {
  const game = fresh('sunquan', { roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '反贼' } });
  game.player.hp = 1;
  game.enemy.hand = [c('sha', { id: 'ac-camp-hit' }), c('tao', { id: 'ac-camp-tao' })];
  game.enemy.skillPreferences.dying = 'ask';
  const generals = JSON.stringify(game.generalCards);
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'ac-camp-hit', { target: 'player' }));
  assert.equal(game.pendingChoice.kind, 'dying-rescue');
  const copy = JSON.parse(JSON.stringify(game));
  S.setIdentityOverride(copy.enemy, 'huashen', { camp: '吴' });
  assert.equal(copy.enemy.camp, '蜀');
  resolve(copy, { cardId: 'ac-camp-tao' });
  assert.equal(copy.player.hp, 2);
  assert.equal(JSON.stringify(copy.generalCards), generals);
  assert.equal(game.player.hp, 0);
});

test('AC AA actual general selection A-B-A preserves Zhiheng use and independent physical/general census', () => {
  const game = fresh('zuoci'); game.turn = 'player';
  G.draw(game, 'player', 100);
  function select(g, heroId, skillId) {
    G.assertConservation(g, () => Engine.requestGeneralSelection(g, 'player'));
    assert.equal(g.pendingChoice.kind, 'general-card-choice');
    resolve(g, { heroId, skillId });
  }
  select(game, 'sunquan', 'zhiheng');
  game.player.hand.push(c('sha', { id: 'ac-selection-cost' }));
  assertCardConservation(game, () => Engine.useSkill(game, 'player', 'zhiheng', ['ac-selection-cost']));
  assert.equal(game.player.flags.zhihengUsed, true);
  select(game, 'huangyueying', 'qicai');
  const copy = JSON.parse(JSON.stringify(game));
  select(copy, 'sunquan', 'zhiheng');
  assert.equal(S.skillState(copy.player, 'qicai', copy).disabledReason, 'source-inactive');
  assert.equal(copy.player.flags.zhihengUsed, true);
  assert.equal(copy.player.camp, '群'); assert.equal(S.effectiveCamp(copy.player), '吴');
  const before = JSON.stringify(copy);
  const result = Engine.useSkill(copy, 'player', 'zhiheng', [copy.player.hand[0].id]);
  assert.equal(result.ok, false); assert.equal(JSON.stringify(copy), before);
  G.assertConservation(copy); G.assertConservation(game);
  assert.equal(G.view(copy, 'enemy', 'player').hiddenIds, undefined);
  assert.equal(G.view(copy, 'enemy', 'player').activeId, 'sunquan');
  assert.equal(G.view(game, 'player').activeId, 'huangyueying');
});

for (const terminal of [false, true]) {
  test(`AC AA/AB Wuhun JSON direct death ${terminal ? 'terminal stop preserves resources' : 'returns both general holdings after nested death'}`, () => {
    const game = fresh('simayi', { enemyHero: 'god_guanyu', godCamps: { enemy: '蜀' },
      ...(terminal ? { roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '反贼' } } : {}) });
    game.turn = 'player'; game.enemy.hp = 1; game.player.nightmare = 4;
    game.player.skillPreferences.guicai = 'ask';
    game.player.hand = [c('sha', { id: 'ac-wuhun-kill' }), c('tao', { id: 'ac-wuhun-unpaid', suit: 'heart' })];
    const own = G.draw(game, 'player', 2), dead = G.draw(game, 'enemy', 2);
    G.select(game, 'player', own[0]); G.select(game, 'enemy', dead[0]);
    const generals = JSON.stringify(game.generalCards);
    assertCardConservation(game, () => Engine.playCard(game, 'player', 'ac-wuhun-kill', { target: 'enemy' }));
    assert.equal(game.pendingChoice.reason, '【武魂】');
    assert.equal(JSON.stringify(game.generalCards), generals, 'death hooks precede resource cleanup');
    assert.equal(game.player.hand.length, 1, 'kill reward has not passed nested Wuhun');
    const copy = JSON.parse(JSON.stringify(game));
    resolve(copy, {});
    assert.equal(copy.player.hp, 0);
    assert.equal(copy.pendingChoice, null);
    if (terminal) {
      assert.equal(copy.phase, 'gameover');
      assert.equal(JSON.stringify(copy.generalCards), generals);
      assert.equal(copy.player.hand.some(card => card.id === 'ac-wuhun-unpaid'), true);
    } else {
      assert.notEqual(copy.phase, 'gameover');
      assert.equal(copy.generalCards.holdings.player, undefined);
      assert.equal(copy.generalCards.holdings.enemy, undefined);
      assert.deepEqual(copy.generalCards.deathReturnedSeats, ['player', 'enemy']);
      for (const id of own.concat(dead, 'simayi', 'god_guanyu')) {
        assert.equal(copy.generalCards.outsideIds.filter(item => item === id).length, 1);
      }
      assert.equal(copy.player.hand.length, 0, 'dead killer cannot receive rebel reward');
    }
    assert.equal(JSON.stringify(game.generalCards), generals);
    assert.equal(game.pendingChoice.reason, '【武魂】');
    assert.equal(copy.log.some(line => line.includes('司马懿') && line.includes('进入濒死')), false,
      'Wuhun direct death never opens dying rescue');
  });
}

test('AC AA real Duanchang clears dynamic sources/identity/held generals but preserves ordinary outside resources', () => {
  const game = fresh('zuoci', { enemyHero: 'caiwenji' }); game.turn = 'player'; game.enemy.hp = 1;
  const held = G.draw(game, 'player', 3); G.select(game, 'player', held[0]);
  S.activateSkillSource(game.player, 'huashen', { id: 'paoxiao', name: '咆哮' });
  S.setIdentityOverride(game.player, 'huashen', { camp: '吴', gender: 'female' });
  game.player.hand = [c('sha', { id: 'ac-duanchang-kill' })];
  G.assertConservation(game, () => assertCardConservation(game, () => Engine.playCard(game, 'player', 'ac-duanchang-kill', { target: 'enemy' })));
  assert.equal(S.ownsSkill(game.player, 'paoxiao', game), false);
  assert.equal(S.effectiveCamp(game.player), '群'); assert.equal(S.effectiveGender(game.player), 'male');
  assert.equal(game.generalCards.holdings.player, undefined);
  assert.equal(game.generalCards.excludedIds.includes('zuoci'), true, 'living body stays on board');
  for (const id of held) assert.equal(game.generalCards.outsideIds.filter(item => item === id).length, 1);
  assert.equal(game.player.hand.length, 3, 'loss of skills does not remove the ordinary kill reward');
});

test('AC L1 terminal transferred rescue decline cancels draw and still settles the in-flight attack', () => {
  const game = fresh('xiaoqiao', { roles: { player: '反贼', enemy: '主公', ally: '忠臣', ally2: '反贼' } });
  game.player.skillPreferences.tianxiang = 'ask';
  game.player.hand = [c('tao', { id: 'ac-terminal-transfer', suit: 'heart' })];
  game.enemy.hp = 1; game.enemy.skillPreferences.dying = 'ask';
  game.enemy.hand = [c('sha', { id: 'ac-terminal-hit' }), c('tao', { id: 'ac-terminal-rescue' })];
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'ac-terminal-hit', { target: 'player' }));
  resolve(game, { cardId: 'ac-terminal-transfer', target: 'enemy' });
  const copy = JSON.parse(JSON.stringify(game));
  resolve(copy, { decline: true });
  assert.equal(copy.phase, 'gameover');
  assert.equal(copy.log.some(line => line.includes('因【天香】摸')), false);
  assert.equal(copy.discard.filter(card => card.id === 'ac-terminal-hit').length, 1);
  assert.equal((copy.pauseState.responseFlows || []).length, 0);
  assert.equal(game.phase, 'play');
});

test('AC AA expired end-after selection resumes its already-paid boundary once before a skipped extra turn', () => {
  const remove = Engine.registerBoundaryHook('onAfterTurnEnd', 'huashen', ({ game, actor, boundaryActor, requestGeneralSelection }) => {
    if (actor !== boundaryActor) return;
    assert.equal(game.turn, null); assert.equal(game.phase, 'between-turns');
    game.acBoundaryCount = (game.acBoundaryCount || 0) + 1;
    requestGeneralSelection(game, actor, { optional: true });
  });
  try {
    const game = fresh('zuoci'); game.turn = 'player'; G.draw(game, 'player', 100);
    game.pendingExtraTurns = ['ally']; game.ally.turnedOver = true;
    assertCardConservation(game, () => Engine.endTurn(game));
    assert.equal(game.pendingChoice.kind, 'general-card-choice');
    assert.equal(game.turn, null); assert.equal(game.acBoundaryCount, 1);
    const copy = JSON.parse(JSON.stringify(game));
    S.stripAllSkills(copy.player, copy);
    resolve(copy, { decline: true });
    assert.equal(copy.turn, 'enemy'); assert.equal(copy.phase, 'play');
    assert.equal(copy.acBoundaryCount, 1); assert.equal(copy.ally.turnedOver, false);
    assert.equal(copy.extraTurnReturnSeat, null); assert.equal(copy.generalCards.holdings.player, undefined);
    assert.equal(game.pendingChoice.kind, 'general-card-choice'); assert.equal(game.ally.turnedOver, true);
  } finally { remove(); }
});

test('AC L1 deferred Yinyue survives JSON after borrowed-Sha rescue and resolves after dying', () => {
  const game = fresh('liubei', { seats: ['player', 'enemy'] });
  game.turn = 'player'; game.player.hp = 1; game.player.skillPreferences.dying = 'ask';
  game.player.hand = [c('jiedao', { id: 'ac-yinyue-jiedao' }), c('tao', { id: 'ac-yinyue-rescue', suit: 'heart' })];
  game.enemy.hand = [c('sha', { id: 'ac-yinyue-sha', suit: 'spade' })];
  game.enemy.equipment.weapon = c('yinyue', { id: 'ac-yinyue-weapon' });
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'ac-yinyue-jiedao', { target: 'enemy' }));
  assert.equal(game.pendingChoice.kind, 'dying-rescue');
  assert.deepEqual(game.pauseState.deferredAfterDying, [{ kind: 'yinyue-trigger', holderActor: 'enemy' }]);
  const copy = JSON.parse(JSON.stringify(game));
  resolve(copy, { cardId: 'ac-yinyue-rescue' });
  const rescueAt = copy.log.findIndex(line => line.includes('脱离濒死'));
  const weaponAt = copy.log.findIndex(line => line.includes('发动【银月枪】'));
  assert.ok(rescueAt >= 0 && weaponAt > rescueAt);
  assert.equal(copy.phase, 'gameover');
  assert.equal(copy.discard.filter(card => card.id === 'ac-yinyue-sha').length, 1);
  assert.equal((copy.pauseState.responseFlows || []).length, 0);
  assert.equal(game.pendingChoice.kind, 'dying-rescue');
});

await runTests({ collect: true });
