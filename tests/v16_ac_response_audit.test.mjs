// AC1: source-backed audit of six basic and twelve instant-trick card types.
// Every scenario enters the real Engine; no response runtime is mocked.
import assert from 'node:assert/strict';
import { Engine, c } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

const red = (type, id) => c(type, { id, suit: 'heart', color: 'red', rank: '6' });
const black = (type, id) => c(type, { id, suit: 'spade', color: 'black', rank: '6' });
function gameFor(playerHero = 'sunquan', enemyHero = 'liubei', multi = false) {
  const cfg = { seed: 160099, playerHero, enemyHero };
  if (multi) Object.assign(cfg, { allyHero: 'sunshangxiang', seats: ['player', 'enemy', 'ally'],
    roles: { player: '忠臣', enemy: '主公', ally: '反贼' } });
  const game = Engine.newGame(cfg);
  for (const actor of game.seats) Object.assign(game[actor], {
    hand: [], judgeArea: [], flags: {}, hp: 4, maxHp: 4, chained: false,
    equipment: { weapon: null, armor: null, horseMinus: null, horsePlus: null },
    skillPreferences: { dying: 'decline', wuxieResponse: 'decline', guicai: 'decline',
      guidao: 'decline', wugu: 'auto' }
  });
  Object.assign(game, { turn: 'player', phase: 'play', pendingChoice: null, pendingChoiceQueue: [],
    pauseState: {}, discard: [], log: [], deck: Array.from({ length: 24 }, (_, i) => red('tao', 'deck-' + i)) });
  return game;
}
function play(game, actor, id, options = {}) {
  return assertCardConservation(game, () => Engine.playCard(game, actor, id, options));
}
function decide(game, decision) {
  assert.ok(game.pendingChoice, 'decision must have been opened by a real Engine action');
  return assertCardConservation(game, () => Engine.resolvePendingChoice(game, decision));
}
function drained(game) {
  assert.equal(game.pendingChoice, null);
  assert.equal((game.pendingChoiceQueue || []).length, 0);
  assert.equal((game.pauseState.responseFlows || []).length, 0);
  for (const key of ['shaResponseFlow', 'duelChain', 'aoe', 'wuxieChain', 'guhuoResponse', 'wugu']) {
    assert.ok(!game.pauseState[key], key + ' must be cleared');
  }
}

for (const type of ['sha', 'fire_sha', 'thunder_sha']) {
  test('AC basic ' + type + ': one target, once in phase, physical source settles once', () => {
    const game = gameFor();
    game.player.hand = [red(type, 'attack'), red('sha', 'second')];
    assert.equal(play(game, 'player', 'attack', { target: 'enemy' }).ok, true);
    assert.equal(game.enemy.hp, 3);
    assert.equal(play(game, 'player', 'second', { target: 'enemy' }).ok, false);
    assert.equal(game.discard.filter(card => card.id === 'attack').length, 1);
    assert.deepEqual(game.player.hand.map(card => card.id), ['second']);
    drained(game);
  });
  test('AC basic ' + type + ': explicit self and dead targets reject without cost', () => {
    const game = gameFor();
    game.player.hand = [red(type, 'attack')];
    assert.equal(play(game, 'player', 'attack', { target: 'player' }).ok, false);
    game.enemy.hp = 0;
    assert.equal(play(game, 'player', 'attack', { target: 'enemy' }).ok, false);
    assert.equal(game.player.hand[0].id, 'attack');
    assert.equal(game.player.usedSha, false);
  });
}

test('AC basic shan: response-only and stale explicit ID never consumes another valid Shan', () => {
  let game = gameFor();
  game.player.hand = [red('shan', 'saved')];
  assert.equal(play(game, 'player', 'saved').ok, false);
  game.turn = 'enemy';
  game.enemy.hand = [red('sha', 'attack')];
  game.player.skillPreferences.shanResponse = 'ask';
  assert.equal(play(game, 'enemy', 'attack').ok, true);
  game = JSON.parse(JSON.stringify(game));
  assert.equal(decide(game, { cardId: 'never-owned' }).ok, true);
  assert.equal(game.player.hp, 3);
  assert.equal(game.player.hand[0].id, 'saved');
  assert.ok(!game.player.aiRevealed?.shan, 'bad selection does not disclose inability to respond');
  drained(game);
});

test('AC basic tao: wounded self heals one, full/self-other gates conserve cards', () => {
  const game = gameFor();
  game.player.hand = [red('tao', 'first'), red('tao', 'second')];
  assert.equal(play(game, 'player', 'first').ok, false);
  game.player.hp = 3; game.enemy.hp = 2;
  assert.equal(play(game, 'player', 'first', { target: 'enemy' }).ok, false);
  assert.equal(play(game, 'player', 'first').ok, true);
  assert.equal(game.player.hp, 4); assert.equal(game.enemy.hp, 2);
  assert.equal(play(game, 'player', 'second').ok, false);
});

test('AC basic jiu: phase limit and next elemental Sha damage bonus are each paid once', () => {
  const game = gameFor();
  game.player.hand = [red('jiu', 'drink'), red('jiu', 'extra'), red('fire_sha', 'attack')];
  assert.equal(play(game, 'player', 'drink').ok, true);
  assert.equal(play(game, 'player', 'extra').ok, false);
  assert.equal(play(game, 'player', 'attack').ok, true);
  assert.equal(game.enemy.hp, 2);
  assert.equal(game.player.shaBonus, 0);
  drained(game);
});

for (const converted of [false, true]) test('AC rejected Jiuchi allegation: ' + (converted ? 'converted' : 'native') + ' Jiu may legally target a third character', () => {
  const game = gameFor(converted ? 'dongzhuo' : 'sunquan', 'liubei', true);
  game.player.hand = [black(converted ? 'sha' : 'jiu', 'drink')];
  const result = assertCardConservation(game, () => converted
    ? Engine.playCardAs(game, 'player', 'drink', 'jiu', { target: 'ally' })
    : Engine.playCard(game, 'player', 'drink', { target: 'ally' }));
  assert.equal(result.ok, true);
  assert.equal(game.ally.shaBonus, 1);
  assert.equal(game.player.shaBonus, 0);
  assert.equal(game.player.flags.jiuUsedThisTurn, true);
  assert.ok(!game.ally.flags.jiuUsedThisTurn, 'frequency belongs to the user, not the target');
});

test('AC instant wuzhong: selected mirror version permits a living third target to draw two', () => {
  const game = gameFor('sunquan', 'liubei', true);
  game.player.hand = [red('wuzhong', 'draw')];
  assert.equal(play(game, 'player', 'draw', { target: 'ally' }).ok, true);
  assert.equal(game.ally.hand.length, 2);
  assert.equal(game.player.hand.length, 0);
  drained(game);
});

test('AC instant guohe: identity judge-area discard and 1V1 exclusion use different rules', () => {
  const identity = gameFor('sunquan', 'liubei', true);
  identity.player.hand = [red('guohe', 'trick')];
  identity.enemy.judgeArea = [black('lebusishu', 'delay')];
  assert.equal(play(identity, 'player', 'trick', { target: 'enemy', targetZone: 'judge', targetCardId: 'delay' }).ok, true);
  assert.equal(identity.enemy.judgeArea.length, 0);
  const duel = gameFor();
  duel.player.hand = [red('guohe', 'trick')];
  duel.enemy.judgeArea = [black('lebusishu', 'delay')];
  assert.equal(play(duel, 'player', 'trick', { target: 'enemy' }).ok, false);
  assert.equal(duel.enemy.judgeArea.length, 1);
});

test('AC instant shunshou: 1V1 ignores distance and preserves delayed-card physical identity', () => {
  const game = gameFor();
  game.player.hand = [red('shunshou', 'trick')];
  game.enemy.equipment.horsePlus = c('plus_horse', { id: 'horse' });
  game.enemy.judgeArea = [black('lebusishu', 'delay')];
  assert.equal(play(game, 'player', 'trick', { targetZone: 'judge', targetCardId: 'delay' }).ok, true);
  assert.equal(game.player.hand[0].id, 'delay');
  assert.equal(game.player.hand[0].type, 'lebusishu');
  assert.equal(game.enemy.judgeArea.length, 0);
});

test('AC Y duel: double-Sha cost pauses for nested Silver Moon, JSON restores exact progress', () => {
  let game = gameFor('lvbu', 'sunquan');
  game.player.hand = [red('juedou', 'trick'), red('shan', 'defense')];
  game.player.skillPreferences.shanResponse = 'ask';
  game.enemy.equipment.weapon = c('yinyue', { id: 'silver' });
  game.enemy.hand = [black('sha', 'first'), red('sha', 'second')];
  assert.equal(play(game, 'player', 'trick').ok, true);
  assert.equal(game.pendingChoice.kind, 'yinyue-response');
  assert.deepEqual(game.enemy.hand.map(card => card.id), ['second']);
  game = JSON.parse(JSON.stringify(game));
  assert.equal(decide(game, { cardId: 'defense' }).ok, true);
  assert.equal(game.enemy.hand.length, 0);
  assert.equal(game.player.hp, 3);
  assert.equal(game.discard.filter(card => card.id === 'first').length, 1);
  drained(game);
});

for (const decline of [false, true]) test('AC instant jiedao: ' + (decline ? 'declining transfers weapon only' : 'borrowed Sha retains elemental nature'), () => {
  const game = gameFor();
  game.turn = 'enemy';
  game.enemy.hand = [red('jiedao', 'trick')];
  game.player.hand = [red('fire_sha', 'response')];
  game.player.equipment.weapon = c('zhuge', { id: 'weapon' });
  game.player.skillPreferences.jiedao = 'ask';
  game.enemy.equipment.armor = c('tengjia', { id: 'armor' });
  assert.equal(play(game, 'enemy', 'trick').ok, true);
  assert.equal(game.pendingChoice.kind, 'jiedao-decision');
  assert.equal(decide(game, decline ? { decline: true } : { cardId: 'response' }).ok, true);
  if (decline) {
    assert.equal(game.player.equipment.weapon, null);
    assert.ok(game.enemy.hand.some(card => card.id === 'weapon'));
    assert.equal(game.player.hand[0].id, 'response');
    assert.equal(game.enemy.hp, 4);
  } else {
    assert.equal(game.enemy.hp, 2, 'the borrowed elemental Sha is fire damage amplified by Tengjia');
    assert.ok(game.discard.some(card => card.id === 'response' && card.type === 'fire_sha'));
  }
  drained(game);
});

test('AC instant huogong: JSON show/cost windows reject invalid IDs and mismatched suits', () => {
  let game = gameFor();
  game.turn = 'enemy';
  game.enemy.hand = [red('huogong', 'trick'), red('sha', 'cost'), black('sha', 'wrong-suit')];
  game.player.hand = [red('shan', 'show')];
  game.player.skillPreferences.huogongShow = 'ask';
  game.enemy.skillPreferences.huogongCost = 'ask';
  assert.equal(play(game, 'enemy', 'trick').ok, true);
  assert.equal(game.pendingChoice.kind, 'huogong-show');
  assert.equal(decide(game, { cardId: 'not-in-hand' }).ok, false);
  assert.equal(game.pendingChoice.kind, 'huogong-show');
  game = JSON.parse(JSON.stringify(game));
  assert.equal(decide(game, { cardId: 'show' }).ok, true);
  assert.equal(game.pendingChoice.kind, 'huogong-cost');
  assert.equal(decide(game, { cardId: 'wrong-suit' }).ok, false);
  assert.equal(game.pendingChoice.kind, 'huogong-cost');
  assert.equal(decide(game, { cardId: 'cost' }).ok, true);
  assert.equal(game.player.hp, 3);
  assert.equal(game.player.hand[0].id, 'show', 'showing a card does not consume it');
  assert.equal(game.enemy.hand[0].id, 'wrong-suit');
  drained(game);
});

test('AC instant taoyuan: full seats do not recover and a canceled target does not cancel others', () => {
  const game = gameFor('sunquan', 'liubei', true);
  game.turn = 'enemy'; game.enemy.hp = 2; game.ally.hp = 3;
  game.enemy.hand = [red('taoyuan', 'trick')];
  game.player.hand = [red('wuxie', 'cancel')];
  game.player.skillPreferences.wuxieResponse = 'ask';
  assert.equal(play(game, 'enemy', 'trick').ok, true);
  assert.equal(game.pendingChoice.targetActor, 'enemy');
  assert.equal(decide(game, { cardId: 'cancel' }).ok, true);
  assert.equal(game.enemy.hp, 2); assert.equal(game.ally.hp, 4); assert.equal(game.player.hp, 4);
  drained(game);
});

test('AC instant wugu: JSON pool picks reject stale IDs and distribute each physical card once', () => {
  let game = gameFor('sunquan', 'liubei', true);
  game.player.hand = [red('wugu', 'trick')];
  game.player.skillPreferences.wugu = 'ask';
  assert.equal(play(game, 'player', 'trick').ok, true);
  assert.equal(game.pendingChoice.kind, 'wugu-pick');
  const shown = game.pendingChoice.cards.map(card => card.id);
  assert.equal(shown.length, 3);
  game = JSON.parse(JSON.stringify(game));
  assert.equal(decide(game, { cardId: 'trick' }).ok, false);
  assert.equal(game.pendingChoice.kind, 'wugu-pick');
  assert.equal(decide(game, { cardId: shown[1] }).ok, true);
  const hands = game.seats.flatMap(actor => game[actor].hand.map(card => card.id));
  assert.deepEqual(hands.slice().sort(), shown.slice().sort());
  assert.equal(new Set(hands).size, 3);
  drained(game);
});

for (const [type, responseType] of [['nanman', 'sha'], ['wanjian', 'shan']]) {
  test('AC instant ' + type + ': one canceled target leaves the next target response intact', () => {
    const game = gameFor('sunquan', 'liubei', true);
    game.turn = 'enemy';
    game.enemy.hand = [red(type, 'trick')];
    game.player.hand = [red('wuxie', 'cancel')];
    game.player.skillPreferences.wuxieResponse = 'ask';
    assert.equal(play(game, 'enemy', 'trick').ok, true);
    assert.equal(game.pendingChoice.targetActor, 'ally');
    assert.equal(decide(game, { cardId: 'cancel' }).ok, true);
    assert.equal(game.ally.hp, 4); assert.equal(game.player.hp, 3);
    drained(game);
  });
  test('AC Y ' + type + ': failed AI Guhuo declaration after JSON resumes the same seat exactly once', () => {
    let game = gameFor('sunquan', 'yuji');
    game.player.hand = [red(type, 'trick')];
    game.enemy.hand = [red('wuzhong', 'cover')];
    assert.equal(play(game, 'player', 'trick').ok, true);
    assert.equal(game.pendingChoice.kind, 'guhuo-challenge');
    assert.equal(game.pauseState.guhuo.declareType, responseType);
    game = JSON.parse(JSON.stringify(game));
    assert.equal(decide(game, { challenge: true }).ok, true);
    assert.equal(game.enemy.hp, 3);
    assert.equal(game.discard.filter(card => card.id === 'cover').length, 1);
    drained(game);
  });
}

test('AC instant wuxie: invalid selected card cannot silently consume the valid response', () => {
  const game = gameFor();
  game.turn = 'enemy';
  game.enemy.hand = [red('wuzhong', 'trick')];
  game.player.hand = [red('wuxie', 'saved')];
  game.player.skillPreferences.wuxieResponse = 'ask';
  assert.equal(play(game, 'enemy', 'trick').ok, true);
  assert.equal(decide(game, { cardId: 'stale' }).ok, true);
  assert.equal(game.player.hand[0].id, 'saved');
  assert.equal(game.enemy.hand.length, 2);
  drained(game);
});

test('AC instant tiesuo: recast has no Wuxie window and preserves existing chain state', () => {
  const game = gameFor();
  game.player.chained = true;
  game.player.hand = [red('tiesuo', 'trick')];
  game.enemy.hand = [red('wuxie', 'saved')];
  game.enemy.skillPreferences.wuxieResponse = 'auto';
  assert.equal(play(game, 'player', 'trick', { mode: 'recast' }).ok, true);
  assert.equal(game.player.hand.length, 1);
  assert.equal(game.player.chained, true);
  assert.equal(game.enemy.hand[0].id, 'saved');
  drained(game);
});

// Confirmed AC findings; expectations come from source, not observed buggy output.
test('AC-R1 tiesuo: reverse click order resolves from the current-turn seat', () => {
  const game = gameFor('sunquan', 'liubei', true);
  game.turn = 'enemy';
  game.enemy.hand = [red('tiesuo', 'trick')];
  game.player.hand = [red('wuxie', 'response')];
  game.player.skillPreferences.wuxieResponse = 'ask';
  assert.equal(play(game, 'enemy', 'trick', { targets: ['player', 'ally'] }).ok, true);
  assert.equal(game.pendingChoice.targetActor, 'ally');
  assert.equal(decide(game, { decline: true }).ok, true);
  assert.equal(game.pendingChoice.targetActor, 'player');
  assert.equal(decide(game, { decline: true }).ok, true);
  assert.equal(game.player.chained, true); assert.equal(game.ally.chained, true);
  drained(game);
});

for (const json of [false, true]) {
  test('AC-R3 taoyuan: later target killed by nested Wuxie/Silver Moon stays dead' + (json ? ' after JSON' : ''), () => {
    let game = gameFor('sunquan', 'liubei', true);
    game.turn = 'enemy'; game.enemy.hp = 2; game.player.hp = 1;
    game.enemy.hand = [red('taoyuan', 'trick')];
    game.ally.hand = [black('wuxie', 'cancel')];
    game.ally.equipment.weapon = c('yinyue', { id: 'silver' });
    game.ally.skillPreferences.wuxieResponse = 'auto';
    if (json) {
      game.player.hand = [red('shan', 'declined-defense')];
      game.player.skillPreferences.shanResponse = 'ask';
    }
    assert.equal(play(game, 'enemy', 'trick').ok, true);
    if (json) {
      assert.equal(game.pendingChoice.kind, 'yinyue-response');
      assert.equal(game.player.hp, 1);
      game = JSON.parse(JSON.stringify(game));
      assert.equal(decide(game, { decline: true }).ok, true);
    }
    assert.ok(game.log.some(line => line.includes('孙权阵亡')));
    assert.notEqual(game.phase, 'gameover', 'non-lord death must permit outer trick to continue');
    assert.equal(game.player.hp, 0, 'an already completed death is not rescued by later Taoyuan');
    drained(game);
  });
}

for (const type of ['wuzhong', 'wugu', 'taoyuan']) {
  test('AC-R3 ' + type + ': current target killed during Wuxie and then countered receives no effect', () => {
    const game = gameFor('sunquan', 'liubei', true);
    game.player.hp = 1;
    game.player.hand = [red(type, 'trick')];
    game.enemy.hand = [red('wuxie', 'counter')];
    game.enemy.skillPreferences.wuxieResponse = 'auto';
    game.ally.hand = [black('wuxie', 'cancel')];
    Object.assign(game.ally.skillPreferences, { wuxieResponse: 'auto', wuxiePolicy: 'always' });
    game.ally.equipment.weapon = c('yinyue', { id: 'silver' });
    assert.equal(play(game, 'player', 'trick').ok, true);
    assert.ok(game.log.some(line => line.includes('孙权阵亡')));
    assert.equal(game.discard.filter(card => card.type === 'wuxie').length, 2);
    assert.equal(game.player.hp, 0);
    assert.equal(game.player.hand.length, 0, 'dead characters cannot obtain a revealed/drawn card');
    if (type === 'wugu') {
      assert.equal(game.enemy.hand.length, 1, 'a dead source does not cancel living later targets');
      assert.equal(game.ally.hand.length, 1);
      assert.equal(game.discard.filter(card => card.type === 'tao').length, 1, 'unclaimed pool card settles');
    }
    drained(game);
  });
}

for (const json of [false, true]) test('AC-R4 wugu: terminal nested response discards the entire revealed pool' + (json ? ' after JSON' : ''), () => {
  let game = gameFor();
  game.player.hp = 1;
  game.player.hand = [red('wugu', 'trick')];
  game.enemy.hand = [black('wuxie', 'cancel')];
  game.enemy.equipment.weapon = c('yinyue', { id: 'silver' });
  Object.assign(game.enemy.skillPreferences, { wuxieResponse: 'auto', wuxiePolicy: 'always' });
  if (json) {
    game.player.hand.push(red('shan', 'declined-defense'));
    game.player.skillPreferences.shanResponse = 'ask';
  }
  const expectedPool = game.deck.slice(-2).map(card => card.id);
  assert.equal(play(game, 'player', 'trick').ok, true);
  if (json) {
    assert.equal(game.pendingChoice.kind, 'yinyue-response');
    game = JSON.parse(JSON.stringify(game));
    assert.equal(decide(game, { decline: true }).ok, true);
  }
  assert.equal(game.phase, 'gameover');
  for (const id of expectedPool) assert.equal(game.discard.filter(card => card.id === id).length, 1);
  drained(game);
});

for (const selfCounter of [false, true]) test('AC-R2 wuxie: player may nullify own trick' + (selfCounter ? ' and counter own Wuxie' : ''), () => {
  const game = gameFor();
  game.player.hand = [red('wuzhong', 'trick'), red('wuxie', 'first')];
  if (selfCounter) game.player.hand.push(red('wuxie', 'second'));
  game.player.skillPreferences.wuxieResponse = 'ask';
  assert.equal(play(game, 'player', 'trick').ok, true);
  assert.equal(game.pendingChoice?.kind, 'wuxie-response');
  assert.equal(decide(game, { cardId: 'first' }).ok, true);
  if (selfCounter) {
    assert.equal(game.pendingChoice?.kind, 'wuxie-response');
    assert.equal(decide(game, { cardId: 'second' }).ok, true);
  }
  assert.equal(game.player.hand.length, selfCounter ? 2 : 0);
  assert.equal(game.discard.filter(card => card.type === 'wuxie').length, selfCounter ? 2 : 1);
  drained(game);
});

for (const json of [false, true]) test('AC-R4 juedou: terminal Wuxie settles the still-in-flight source' + (json ? ' after JSON' : ''), () => {
  let game = gameFor();
  game.player.hp = 1;
  game.player.hand = [red('juedou', 'trick')];
  game.enemy.hand = [black('wuxie', 'cancel')];
  game.enemy.equipment.weapon = c('yinyue', { id: 'silver' });
  Object.assign(game.enemy.skillPreferences, { wuxieResponse: 'auto', wuxiePolicy: 'always' });
  if (json) {
    game.player.hand.push(red('shan', 'declined-defense'));
    game.player.skillPreferences.shanResponse = 'ask';
  }
  assert.equal(play(game, 'player', 'trick').ok, true);
  if (json) {
    assert.equal(game.pendingChoice.kind, 'yinyue-response');
    game = JSON.parse(JSON.stringify(game));
    assert.equal(decide(game, { decline: true }).ok, true);
  }
  assert.equal(game.phase, 'gameover');
  assert.equal(game.discard.filter(card => card.id === 'trick').length, 1);
  drained(game);
});

test('AC Y sha: nested Leiji terminal after JSON retains the unpaid second Shan', () => {
  let game = gameFor('zhangjiao', 'lvbu');
  game.turn = 'enemy'; game.enemy.hp = 1;
  game.enemy.hand = [red('sha', 'trick')];
  game.player.hand = [red('shan', 'first'), red('shan', 'unpaid')];
  Object.assign(game.player.skillPreferences, { shanResponse: 'ask', leiji: 'ask' });
  game.deck.push(black('sha', 'leiji-judge'));
  assert.equal(play(game, 'enemy', 'trick').ok, true);
  assert.equal(decide(game, { cardId: 'first' }).ok, true);
  assert.equal(game.pendingChoice.kind, 'leiji-ask');
  assert.equal(game.pauseState.shaResponseFlow.shanRemaining, 1);
  assert.equal(play(game, 'enemy', 'nonexistent').ok, false, 'public play freezes during inner prompt');
  game = JSON.parse(JSON.stringify(game));
  assert.equal(decide(game, { target: 'enemy' }).ok, true);
  assert.equal(game.phase, 'gameover');
  assert.equal(game.player.hand[0].id, 'unpaid');
  assert.equal(game.discard.filter(card => card.id === 'trick').length, 1);
  drained(game);
});

test('AC-R2 wuxie: three-seat responder priority begins at the current-turn seat', () => {
  const game = gameFor('sunquan', 'liubei', true);
  game.turn = 'enemy';
  game.enemy.hand = [red('wuzhong', 'trick')];
  game.player.hand = [red('wuxie', 'manual')];
  game.player.skillPreferences.wuxieResponse = 'ask';
  game.ally.hand = [red('wuxie', 'earlier-seat')];
  Object.assign(game.ally.skillPreferences, { wuxieResponse: 'auto', wuxiePolicy: 'always' });
  assert.equal(play(game, 'enemy', 'trick', { target: 'player' }).ok, true);
  assert.equal(game.pendingChoice.kind, 'wuxie-response');
  assert.equal(game.pendingChoice.chainWuxied, true, 'ally had its action-order opportunity before player');
  assert.ok(game.discard.some(card => card.id === 'earlier-seat'));
  assert.equal(decide(game, { decline: true }).ok, true);
  assert.deepEqual(game.player.hand.map(card => card.id), ['manual']);
  drained(game);
});

await runTests({ collect: true });
