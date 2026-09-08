// AC1 Wei/Shu: public-engine adversarial probes. Sources and candidate decisions
// are recorded in docs/audit/2026-09-08-v16-ac-wei-shu-audit.md.
import assert from 'node:assert/strict';
import { Engine, c, StateRuntime } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function fresh(playerHero, enemyHero = 'zhangfei', extra = {}) {
  const game = Engine.newGame({ seed: 91234, playerHero, enemyHero, ...extra });
  for (const actor of game.seats) {
    Object.assign(game[actor], { hand: [], judgeArea: [], equipment: {}, flags: {},
      hp: 4, maxHp: 4, skillPreferences: { dying: 'decline', guicai: 'decline', fangzhu: 'decline' } });
  }
  Object.assign(game, { turn: 'player', phase: 'play', pendingChoice: null,
    pendingChoiceQueue: [], pauseState: {}, discard: [], log: [],
    deck: Array.from({ length: 24 }, (_, i) => c('shan', { id: 'ac-ws-deck-' + i, suit: 'club' })) });
  return game;
}
function trio(playerHero, enemyHero = 'zhangfei') {
  return fresh(playerHero, enemyHero, { seats: ['player', 'enemy', 'ally'], allyHero: 'liubei',
    roles: { player: '主公', enemy: '反贼', ally: '反贼' } });
}
function action(game, fn) {
  const result = assertCardConservation(game, fn);
  assert.equal(result.ok, true, result.message);
  return result;
}
function resolve(game, decision) { return action(game, () => Engine.resolvePendingChoice(game, decision)); }

// shu:196/106 + shu:354: skill-converted Sha is also a legal Tiaoxin use.
for (const [hero, type, suit] of [['zhaoyun', 'shan', 'spade'], ['guanyu', 'tao', 'heart']]) {
  test('AC WS1 Tiaoxin offers and uses native ' + hero + ' Sha conversion', () => {
    const game = fresh(hero, 'jiangwei'); game.turn = 'enemy';
    game.player.hand = [c(type, { id: 'converted-demand', suit })];
    action(game, () => Engine.useSkill(game, 'enemy', 'tiaoxin', [], { target: 'player' }));
    assert.equal(game.pendingChoice.kind, 'tiaoxin-demand');
    assert.ok(game.pendingChoice.options.some(option => option.cardId === 'converted-demand'),
      'expected native conversion in legal Sha options');
    resolve(game, { cardId: 'converted-demand' });
    assert.equal(game.enemy.hp, 3);
    assert.equal(game.player.hand.length, 0);
  });
}

// wei:61 does not exclude a damage source who is the damaged Sima Yi.
test('AC WS2 Fankui may gain own equipment after self-sourced elemental chain damage', () => {
  const game = fresh('simayi'); game.player.chained = game.enemy.chained = true;
  game.player.hand = [c('fire_sha', { id: 'self-chain' })];
  game.player.equipment.weapon = c('qinggang', { id: 'self-weapon' });
  action(game, () => Engine.playCard(game, 'player', 'self-chain', { target: 'enemy' }));
  assert.equal(game.player.hp, 3);
  assert.equal(game.pendingChoice?.kind, 'fankui-pick', 'self source still has an eligible owned card');
  assert.equal(game.pendingChoice.sourceActor, 'player');
  resolve(game, { zone: 'equipment', cardId: 'self-weapon' });
  assert.equal(game.player.equipment.weapon, null);
  assert.equal(game.player.hand.filter(card => card.id === 'self-weapon').length, 1);
});

test('AC WS3 Shensu rejects duplicate options atomically and retains the prompt', () => {
  const game = fresh('xiahouyuan'); action(game, () => Engine.startTurn(game, 'player'));
  const before = JSON.stringify({ hp: game.enemy.hp, flags: game.player.flags, deck: game.deck });
  const result = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { options: [1, 1] }));
  assert.equal(result.ok, false, 'one phase cannot pay the same skip twice');
  assert.equal(game.pendingChoice?.kind, 'shensu-options');
  assert.equal(JSON.stringify({ hp: game.enemy.hp, flags: game.player.flags, deck: game.deck }), before);
  resolve(game, { options: [1] }); assert.equal(game.enemy.hp, 3);
});

test('AC WS4 acquired Liegong cannot lock Shan during preparation-stage Shensu', () => {
  const game = fresh('xiahouyuan'); StateRuntime.grantSkill(game.player, 'liegong', '烈弓');
  game.enemy.hand = [c('shan', { id: 'outside-play-shan' })];
  action(game, () => Engine.startTurn(game, 'player')); assert.equal(game.phase, 'prepare');
  resolve(game, { options: [1] });
  assert.equal(game.enemy.hp, 4, 'outside play phase Liegong cannot prevent the response');
  assert.equal(game.enemy.hand.length, 0, 'the enemy used its Shan');
});

test('AC WS5 Xingshang gains owned hand and equipment; delayed cards are discarded on death', () => {
  const game = trio('caopi'); game.enemy.hp = 1;
  game.enemy.hand = [c('guohe', { id: 'dead-hand' })];
  game.enemy.equipment.weapon = c('qinggang', { id: 'dead-equip' });
  game.enemy.judgeArea = [c('lebusishu', { id: 'dead-delay' })];
  game.player.hand = [c('sha', { id: 'kill' })];
  action(game, () => Engine.playCard(game, 'player', 'kill', { target: 'enemy' }));
  assert.ok(game.player.hand.some(card => card.id === 'dead-hand'));
  assert.ok(game.player.hand.some(card => card.id === 'dead-equip'));
  assert.ok(!game.player.hand.some(card => card.id === 'dead-delay'), 'judgement-area card is not the deceased character\'s card');
  assert.ok(game.discard.some(card => card.id === 'dead-delay'));
});

test('AC WS6 Kuanggu uses pre-damage distance despite a later Fankui equipment transfer', () => {
  let game = trio('simayi', 'weiyan'); game.turn = 'enemy'; game.enemy.hp = 2;
  game.enemy.equipment.horseMinus = c('minus_horse', { id: 'distance-minus' });
  game.player.equipment.horsePlus = c('plus_horse', { id: 'distance-plus' });
  game.enemy.hand = [c('sha', { id: 'distance-hit' })];
  assert.equal(Engine.distanceBetween(game, 'enemy', 'player'), 1);
  action(game, () => Engine.playCard(game, 'enemy', 'distance-hit', { target: 'player' }));
  assert.equal(game.pendingChoice?.kind, 'fankui-pick');
  game = JSON.parse(JSON.stringify(game));
  resolve(game, { zone: 'equipment', cardId: 'distance-minus' });
  assert.equal(Engine.distanceBetween(game, 'enemy', 'player'), 2);
  assert.equal(game.enemy.hp, 3, 'the qualifying distance is sampled before deduction, not after Fankui');
});

test('AC WS6 Kuanggu heals after killing an adjacent target while other opponents survive', () => {
  const game = trio('weiyan'); game.player.hp = 2; game.enemy.hp = 1;
  game.player.hand = [c('sha', { id: 'kuanggu-kill' })];
  action(game, () => Engine.playCard(game, 'player', 'kuanggu-kill', { target: 'enemy' }));
  assert.notEqual(game.phase, 'gameover'); assert.equal(game.enemy.hp, 0);
  assert.equal(game.player.hp, 3, 'source-side caused damage trigger survives target death');
});

test('AC WS1 Tiaoxin equipment Wusheng preserves physical identity and uses ordinary target defenses', () => {
  const game = fresh('guanyu', 'jiangwei'); game.turn = 'enemy';
  game.player.equipment.weapon = c('qinggang', { id: 'red-weapon', suit: 'heart' });
  game.enemy.hand = [c('shan', { id: 'defend-conversion' })];
  action(game, () => Engine.useSkill(game, 'enemy', 'tiaoxin', [], { target: 'player' }));
  resolve(game, { cardId: 'red-weapon' });
  assert.equal(game.enemy.hp, 4, 'ordinary Shan still defends a converted Sha');
  assert.equal(game.player.equipment.weapon, null);
  assert.equal(game.discard.find(card => card.id === 'red-weapon').type, 'qinggang');
});

test('AC WS1 Tiaoxin rechecks a lost conversion before spending the selected physical card', () => {
  const game = fresh('zhangfei', 'jiangwei'); game.turn = 'enemy';
  StateRuntime.activateSkillSource(game.player, 'ac-probe', { id: 'longdan', name: '龙胆' });
  game.player.hand = [c('shan', { id: 'stale-conversion' })];
  action(game, () => Engine.useSkill(game, 'enemy', 'tiaoxin', [], { target: 'player' }));
  StateRuntime.activateSkillSource(game.player, 'ac-probe', { id: 'qicai', name: '奇才' });
  const result = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'stale-conversion' }));
  assert.equal(result.ok, false); assert.equal(game.pendingChoice?.kind, 'tiaoxin-demand');
  assert.equal(game.player.hand[0].id, 'stale-conversion'); assert.equal(game.enemy.hp, 4);
});

test('AC WS1 paid Tiaoxin Longdan resumes after JSON-cloned nested Fankui without duplicating its material', () => {
  let game = fresh('zhaoyun', 'jiangwei'); game.turn = 'enemy';
  StateRuntime.grantSkill(game.enemy, 'fankui', '反馈'); game.enemy.skillPreferences.fankui = 'ask';
  game.player.hand = [c('shan', { id: 'paid-conversion' }), c('guohe', { id: 'fankui-gain' })];
  action(game, () => Engine.useSkill(game, 'enemy', 'tiaoxin', [], { target: 'player' }));
  resolve(game, { cardId: 'paid-conversion' });
  assert.equal(game.pendingChoice?.kind, 'fankui-pick'); assert.equal(game.enemy.hp, 3);
  game = JSON.parse(JSON.stringify(game));
  resolve(game, { zone: 'hand' });
  assert.equal(game.pendingChoice, null); assert.equal(game.enemy.hp, 3);
  assert.equal(game.discard.filter(card => card.id === 'paid-conversion').length, 1);
  assert.equal(game.discard.find(card => card.id === 'paid-conversion').type, 'shan');
  assert.ok(game.enemy.hand.some(card => card.id === 'fankui-gain'));
});

test('AC WS1 AI Longdan black-hand Tiaoxin use also triggers Yinyue after the Sha', () => {
  const game = fresh('jiangwei', 'zhaoyun');
  game.enemy.hand = [c('shan', { id: 'black-longdan', suit: 'club' })];
  game.enemy.equipment.weapon = c('yinyue', { id: 'use-yinyue' });
  action(game, () => Engine.useSkill(game, 'player', 'tiaoxin', [], { target: 'enemy' }));
  assert.equal(game.player.hp, 2, 'converted Sha and Yinyue each deal one damage');
  assert.equal(game.discard.filter(card => card.id === 'black-longdan').length, 1);
});

test('AC WS2 source-less lightning never obtains a Fankui card from another character', () => {
  const game = fresh('simayi');
  game.player.judgeArea = [c('shandian', { id: 'source-less-lightning' })];
  game.player.equipment.weapon = c('qinggang', { id: 'self-retained-weapon' });
  game.enemy.hand = [c('guohe', { id: 'unrelated-hand' })];
  game.deck.push(c('sha', { id: 'lightning-judge', suit: 'spade', rank: '7' }));
  action(game, () => Engine.startTurn(game, 'player'));
  assert.equal(game.player.hp, 1); assert.equal(game.pendingChoice, null);
  assert.equal(game.player.equipment.weapon.id, 'self-retained-weapon');
  assert.equal(game.enemy.hand[0].id, 'unrelated-hand');
  assert.ok(!game.log.some(entry => entry.includes('【反馈】')));
});

test('AC WS7 Qiangxi paid HP cost still damages its target after the source dies in a live game', () => {
  const game = trio('zhangfei', 'dianwei'); game.turn = 'enemy'; game.enemy.hp = 1;
  action(game, () => Engine.useSkill(game, 'enemy', 'qiangxi', [], { target: 'player' }));
  assert.equal(game.enemy.hp, 0); assert.notEqual(game.phase, 'gameover');
  assert.equal(game.player.hp, 3, 'executable paid damage continues after source death');
});

test('AC WS7 JSON dying refusal resumes paid Qiangxi with no dead-source Fankui callback', () => {
  let game = trio('simayi', 'dianwei'); game.turn = 'enemy'; game.enemy.hp = 1;
  game.player.skillPreferences.dying = 'ask';
  game.player.hand = [c('tao', { id: 'declined-save' })];
  action(game, () => Engine.useSkill(game, 'enemy', 'qiangxi', [], { target: 'player' }));
  assert.equal(game.pendingChoice?.kind, 'dying-rescue'); assert.equal(game.player.hp, 4);
  game = JSON.parse(JSON.stringify(game));
  resolve(game, { decline: true });
  assert.equal(game.enemy.hp, 0); assert.equal(game.player.hp, 3);
  assert.equal(game.pendingChoice, null, 'no source exists for Fankui after the paid skill source died');
  assert.equal(game.player.hand[0].id, 'declined-save');
});

test('AC WS7 actual game-over during Qiangxi cost remains a hard stop', () => {
  const game = fresh('dianwei'); game.player.hp = 1;
  action(game, () => Engine.useSkill(game, 'player', 'qiangxi', [], { target: 'enemy' }));
  assert.equal(game.phase, 'gameover'); assert.equal(game.enemy.hp, 4);
});

test('AC WS8 Fangquan already-paid phase skip retains its delayed effect after total skill loss', () => {
  let game = fresh('liushan'); game.enemy.hp = 1;
  game.player.hand = [c('guohe', { id: 'delayed-fangquan-cost' })];
  game.player.skillPreferences.fangquan = 'auto';
  action(game, () => Engine.startTurn(game, 'player'));
  assert.equal(game.phase, 'discard'); assert.equal(game.player.flags.fangquanSkipped, true);
  StateRuntime.stripAllSkills(game.player, game);
  game = JSON.parse(JSON.stringify(game));
  action(game, () => Engine.endTurn(game));
  assert.equal(game.pendingChoice?.kind, 'fangquan-grant');
  resolve(game, { target: 'enemy', cardId: 'delayed-fangquan-cost' });
  assert.ok(game.discard.some(card => card.id === 'delayed-fangquan-cost'));
  assert.ok(game.extraTurnReturnSeat || (game.pendingExtraTurns || []).length,
    'the paid delayed effect grants its extra turn even though no skill remains');
});

test('AC WS8 Fangquan cannot pay a phase skip already imposed by Lebusishu', () => {
  const game = fresh('liushan'); game.enemy.hp = 1;
  game.player.hand = [c('guohe', { id: 'unpaid-fangquan-cost' })];
  game.player.skillPreferences.fangquan = 'auto';
  game.player.judgeArea = [c('lebusishu', { id: 'already-skipped-play' })];
  action(game, () => Engine.startTurn(game, 'player'));
  assert.equal(game.phase, 'discard');
  assert.ok(!game.player.flags.fangquanSkipped, 'glossary__flow:81 prohibits paying an already skipped phase');
  action(game, () => Engine.endTurn(game));
  assert.notEqual(game.pendingChoice?.kind, 'fangquan-grant');
});

test('AC WS9 unaccepted native Fankui prompt cannot activate after complete skill loss', () => {
  const game = fresh('simayi'); game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'unaccepted-fankui-hit' }), c('guohe', { id: 'unaccepted-fankui-prize' })];
  action(game, () => Engine.playCard(game, 'enemy', 'unaccepted-fankui-hit', { target: 'player' }));
  assert.equal(game.pendingChoice?.kind, 'fankui-pick');
  StateRuntime.stripAllSkills(game.player, game);
  const restored = JSON.parse(JSON.stringify(game));
  assertCardConservation(restored, () => Engine.resolvePendingChoice(restored, { zone: 'hand' }));
  assert.equal(restored.player.hand.length, 0, 'no accepted activation survives in this still-optional prompt');
  assert.equal(restored.enemy.hand[0]?.id, 'unaccepted-fankui-prize');
  assert.equal(restored.pendingChoice, null);
});

test('AC WS9 unaccepted native Fangzhu prompt cannot activate after complete skill loss', () => {
  const game = fresh('caopi'); game.turn = 'enemy'; game.player.skillPreferences.fangzhu = 'ask';
  game.enemy.hand = [c('sha', { id: 'unaccepted-fangzhu-hit' })];
  action(game, () => Engine.playCard(game, 'enemy', 'unaccepted-fangzhu-hit', { target: 'player' }));
  assert.equal(game.pendingChoice?.kind, 'fangzhu-pick');
  StateRuntime.stripAllSkills(game.player, game);
  const restored = JSON.parse(JSON.stringify(game));
  assertCardConservation(restored, () => Engine.resolvePendingChoice(restored, { target: 'enemy' }));
  assert.equal(restored.enemy.hand.length, 0, 'no optional skill activation remains available');
  assert.ok(!restored.enemy.turnedOver);
  assert.equal(restored.pendingChoice, null);
});

// glossary__card.md:45: a Jixi field material cannot also reduce distance.
for (const hasAlternative of [false, true]) {
  test('AC WS10 Jixi rejects a last-field range cost atomically; alternative target=' + hasAlternative, () => {
    const game = trio('zhangfei', 'dengai'); game.turn = 'enemy';
    StateRuntime.grantSkill(game.enemy, 'jixi', '急袭');
    game.enemy.tian = [c('sha', { id: 'range-field' })];
    game.ally.equipment.horsePlus = c('plus_horse', { id: 'range-target-horse' });
    game.ally.hand = [c('shan', { id: 'range-target-card' })];
    if (hasAlternative) game.player.hand = [c('shan', { id: 'reachable-alternative' })];
    assert.equal(Engine.distanceBetween(game, 'enemy', 'ally'), 1);
    assert.equal(Engine.canPlayCardAs(game, 'enemy', 'range-field', 'shunshou').ok, hasAlternative);
    assert.equal(Engine.canPlayCardAs(game, 'enemy', 'range-field', 'shunshou', { target: 'ally' }).ok, false);
    const before = JSON.stringify(game);
    const result = assertCardConservation(game, () => Engine.playCardAs(game, 'enemy', 'range-field', 'shunshou', { target: 'ally' }));
    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(game), before, 'failed pre-payment target check preserves field ID, zones, flags and all effects');
  });
}

test('AC WS10 Jixi still uses a field when the remaining field supplies legal range', () => {
  const game = trio('zhangfei', 'dengai'); game.turn = 'enemy';
  StateRuntime.grantSkill(game.enemy, 'jixi', '急袭');
  game.enemy.tian = [c('sha', { id: 'spent-field' }), c('sha', { id: 'remaining-field' })];
  game.ally.equipment.horsePlus = c('plus_horse', { id: 'legal-target-horse' });
  game.ally.hand = [c('shan', { id: 'legal-target-card' })];
  assert.equal(Engine.canPlayCardAs(game, 'enemy', 'spent-field', 'shunshou', { target: 'ally' }).ok, true);
  action(game, () => Engine.playCardAs(game, 'enemy', 'spent-field', 'shunshou', { target: 'ally' }));
  assert.deepEqual(game.enemy.tian.map(card => card.id), ['remaining-field']);
  assert.ok(game.discard.some(card => card.id === 'spent-field'));
  assert.equal(game.enemy.hand.length, 1);
});

// Falsified hypotheses: whole-card version / zone / trigger wording matter.
test('AC WF1 single-skill old Wind Caoren still draws three for Jushou, then skips one turn', () => {
  const game = fresh('caoren');
  action(game, () => Engine.endTurn(game));
  assert.equal(game.player.hand.length, 3);
  assert.equal(game.player.turnedOver, true);
  action(game, () => Engine.startTurn(game, 'player'));
  assert.equal(game.player.turnedOver, false);
  assert.equal(game.player.hand.length, 3, 'the skipped turn does not draw');
});

test('AC WF2 standard Fankui is once per damage event, not the breakthrough per-point variant', () => {
  const game = fresh('simayi'); game.turn = 'enemy';
  game.enemy.hand = [c('jiu', { id: 'wine' }), c('sha', { id: 'two-damage' }),
    c('guohe', { id: 'remaining-a' }), c('guohe', { id: 'remaining-b' })];
  action(game, () => Engine.playCard(game, 'enemy', 'wine'));
  action(game, () => Engine.playCard(game, 'enemy', 'two-damage', { target: 'player' }));
  assert.equal(game.player.hp, 2); assert.equal(game.pendingChoice?.kind, 'fankui-pick');
  resolve(game, { zone: 'hand' }); assert.equal(game.pendingChoice, null);
  assert.equal(game.player.hand.length, 1);
});

test('AC WF3 old-standard Jizhi draws for normal tricks and excludes delayed tricks', () => {
  const game = fresh('huangyueying');
  game.player.hand = [c('wuzhong', { id: 'normal-trick' }), c('lebusishu', { id: 'delayed-trick' })];
  action(game, () => Engine.playCard(game, 'player', 'normal-trick'));
  assert.equal(game.player.hand.length, 4, 'two Wuzhong draws plus one Jizhi draw');
  action(game, () => Engine.playCard(game, 'player', 'delayed-trick', { target: 'enemy' }));
  assert.equal(game.player.hand.length, 3, 'the selected complete old-standard card does not trigger on delays');
});

test('AC WF4 acquired Lianhuan recast pays one card and does not count as Jizhi trick use', () => {
  const game = fresh('huangyueying'); StateRuntime.grantSkill(game.player, 'lianhuan', '连环');
  game.player.hand = [c('sha', { id: 'club-recast', suit: 'club' })];
  action(game, () => Engine.recastHandCard(game, 'player', 'club-recast'));
  assert.equal(game.player.hand.length, 1);
  assert.ok(game.discard.some(card => card.id === 'club-recast'));
});

test('AC WF5 Ganglie cannot pay its two-hand-card cost with two equipped cards', () => {
  const game = fresh('zhangfei', 'xiahoudun'); game.enemy.skillPreferences.ganglie = 'auto';
  game.player.equipment.weapon = c('qinggang', { id: 'ganglie-kept-weapon' });
  game.player.equipment.armor = c('bagua', { id: 'ganglie-kept-armor' });
  game.player.hand = [c('sha', { id: 'ganglie-attack' })];
  action(game, () => Engine.playCard(game, 'player', 'ganglie-attack', { target: 'enemy' }));
  assert.equal(game.player.hp, 3); assert.equal(game.pendingChoice, null);
  assert.equal(game.player.equipment.weapon.id, 'ganglie-kept-weapon');
  assert.equal(game.player.equipment.armor.id, 'ganglie-kept-armor');
});

test('AC AA current Kongcheng protection switches off while owned and returns on reactivation', () => {
  const game = fresh('zhangfei');
  StateRuntime.activateSkillSource(game.enemy, 'ac-probe', { id: 'kongcheng', name: '空城' });
  game.player.hand = [c('sha', { id: 'protected-hit' })];
  assert.equal(Engine.playCard(game, 'player', 'protected-hit', { target: 'enemy' }).ok, false);
  StateRuntime.activateSkillSource(game.enemy, 'ac-probe', { id: 'qicai', name: '奇才' });
  assert.equal(StateRuntime.ownsSkill(game.enemy, 'kongcheng'), true);
  action(game, () => Engine.playCard(game, 'player', 'protected-hit', { target: 'enemy' }));
  assert.equal(game.enemy.hp, 3);
  StateRuntime.activateSkillSource(game.enemy, 'ac-probe', { id: 'kongcheng', name: '空城' });
  assert.equal(StateRuntime.skillEnabled(game.enemy, 'kongcheng'), true);
});

test('AC AA inactive native Wusheng copy preserves native conversion without duplicate consumption', () => {
  const game = fresh('guanyu'); game.player.hand = [c('tao', { id: 'native-red', suit: 'heart' })];
  StateRuntime.activateSkillSource(game.player, 'ac-probe', { id: 'wusheng', name: '武圣' });
  StateRuntime.activateSkillSource(game.player, 'ac-probe', { id: 'qicai', name: '奇才' });
  action(game, () => Engine.playCardAs(game, 'player', 'native-red', 'sha', { target: 'enemy' }));
  assert.equal(game.enemy.hp, 3);
  assert.equal(game.discard.filter(card => card.id === 'native-red').length, 1);
});

await runTests({ collect: true });
