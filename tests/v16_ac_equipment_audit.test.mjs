import assert from 'node:assert/strict';
import { Engine, c, StateRuntime as S } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function fresh(playerHero = 'liubei', enemyHero = 'liubei') {
  const game = Engine.newGame({ seed: 91915, seats: ['player', 'enemy', 'ally', 'ally2'],
    playerHero, enemyHero, allyHero: 'guanyu', ally2Hero: 'lvbu',
    roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '反贼' } });
  for (const actor of game.seats) Object.assign(game[actor], { hand: [], judgeArea: [], equipment: {},
    flags: {}, hp: 4, maxHp: 4, tian: [], skillPreferences: { dying: 'decline' } });
  Object.assign(game, { turn: 'player', phase: 'play', pauseState: {}, pendingChoice: null,
    pendingChoiceQueue: [], discard: [], log: [], deck: Array.from({ length: 25 }, (_, i) =>
      c('sha', { id: 'ac-equipment-deck-' + i, suit: 'club' })) });
  return game;
}
function play(game, type = 'sha', actor = 'player', target = 'enemy', options = {}) {
  const card = c(type, { id: 'ac-equipment-play-' + game.log.length });
  game[actor].hand.push(card);
  const result = assertCardConservation(game, () => Engine.playCard(game, actor, card.id, { target, ...options }));
  assert.equal(result.ok, true, result.message);
  return card;
}
function resolve(game, decision) {
  const result = assertCardConservation(game, () => Engine.resolvePendingChoice(game,
    { choiceId: game.pendingChoice?.choiceId, ...decision }));
  assert.equal(result.ok, true, result.message);
  return result;
}

test('AC E1 Qilin ask remains optional with exactly one horse and JSON decline preserves it', () => {
  const game = fresh();
  game.player.equipment.weapon = c('qilin', { id: 'ac-qilin' });
  game.player.skillPreferences.qilin = 'ask';
  game.enemy.equipment.horseMinus = c('minus_horse', { id: 'ac-qilin-only-horse' });
  play(game);
  assert.equal(game.pendingChoice?.kind, 'qilin-pick');
  assert.equal(game.enemy.equipment.horseMinus.id, 'ac-qilin-only-horse');
  const copy = JSON.parse(JSON.stringify(game)); resolve(copy, { decline: true });
  assert.equal(copy.enemy.equipment.horseMinus.id, 'ac-qilin-only-horse');
  assert.equal(copy.pendingChoice, null);
});

test('AC E2 Hanbing sequential off-turn card losses each trigger Tuntian', () => {
  const game = fresh('liubei', 'dengai');
  game.player.equipment.weapon = c('hanbing', { id: 'ac-hanbing' });
  game.player.skillPreferences.hanbing = 'auto';
  game.enemy.hand = [c('sha', { id: 'ac-hanbing-first' }), c('sha', { id: 'ac-hanbing-second' })];
  play(game);
  assert.equal(game.enemy.hp, 4);
  assert.equal(game.enemy.hand.length, 0);
  assert.equal(game.enemy.tian.length, 2, 'each separate discarded card opens its own loss timing');
  assert.equal(game.log.filter(line => line.includes('进行【屯田】判定')).length, 2);
});

test('AC E3 last-hand equipment replacement settles Lianying before Baiyin healing', () => {
  const game = fresh('luxun'); game.player.hp = 2;
  game.player.equipment.armor = c('baiyin', { id: 'ac-replace-old' });
  play(game, 'bagua', 'player', 'player');
  const handAt = game.log.findIndex(line => line.includes('发动【连营】'));
  const healAt = game.log.findIndex(line => line.includes('因失去【白银狮子】'));
  assert.ok(handAt >= 0 && healAt > handAt, 'simultaneous replacement hand loss offers the character skill before armor effect');
  assert.equal(game.player.hp, 3);
  assert.equal(game.player.hand.length, 1);
  assert.equal(game.player.equipment.armor.type, 'bagua');
});

test('AC E2 Hanbing waits between two Tuntian Jilue judgements and each JSON clone pays once', () => {
  const game = fresh('liubei', 'dengai');
  S.grantSkill(game.player, 'jilue', '极略'); game.player.godMarks = { nin: 2 };
  game.player.skillPreferences.jilue = 'ask';
  game.player.equipment.weapon = c('hanbing', { id: 'ac-hanbing-jilue' });
  game.player.hand = [c('sha', { id: 'ac-replace-one', suit: 'club' }), c('sha', { id: 'ac-replace-two', suit: 'spade' })];
  game.enemy.hand = [c('sha', { id: 'ac-target-one' }), c('sha', { id: 'ac-target-two' })];
  play(game);
  assert.equal(game.pendingChoice.reason, '【屯田】');
  assert.equal(game.enemy.hand.length, 1, 'second discard waits for first loss judgement');
  assert.equal(game.enemy.tian.length, 0);
  let copy = JSON.parse(JSON.stringify(game));
  resolve(copy, { cardId: 'ac-replace-one' });
  assert.equal(copy.player.godMarks.nin, 1);
  assert.equal(copy.enemy.tian.length, 1);
  assert.equal(copy.enemy.hand.length, 0);
  assert.equal(copy.pendingChoice.reason, '【屯田】');
  copy = JSON.parse(JSON.stringify(copy));
  resolve(copy, { cardId: 'ac-replace-two' });
  assert.equal(copy.player.godMarks.nin, 0); assert.equal(copy.enemy.tian.length, 2);
  assert.equal(copy.enemy.hp, 4); assert.equal(copy.pendingChoice, null);
  assert.equal(copy.pauseState.hanbingDiscard, null);
  assert.equal(game.enemy.hand.length, 1); assert.equal(game.player.godMarks.nin, 2);
});

test('AC E3 replaced Baiyin stays in processing during Lianying and cannot be reshuffled into that draw', () => {
  const game = fresh('luxun'); game.player.hp = 2; game.deck = [];
  game.player.equipment.armor = c('baiyin', { id: 'ac-recycle-old' });
  play(game, 'bagua', 'player', 'player');
  assert.equal(game.player.hand.length, 0, 'no available deck/discard card exists during Lianying');
  assert.equal(game.player.hp, 3);
  assert.equal(game.discard.filter(card => card.id === 'ac-recycle-old').length, 1);
  assert.equal(game.pauseState.equipmentReplacement, null);
});

test('AC E2 Hanbing retains its source Sha through both JSON loss windows before disposal', () => {
  let game = fresh('liubei', 'dengai');
  S.grantSkill(game.player, 'jilue', '极略'); game.player.godMarks = { nin: 1 };
  game.player.skillPreferences.jilue = 'ask';
  game.player.equipment.weapon = c('hanbing', { id: 'ac-hanbing-source-hold' });
  game.player.hand = [c('sha', { id: 'ac-hanbing-unused-retrial', suit: 'club' })];
  game.enemy.hand = [c('sha', { id: 'ac-hanbing-hold-first' }), c('sha', { id: 'ac-hanbing-hold-second' })];
  const attack = play(game);
  assert.equal(game.pendingChoice.reason, '【屯田】');
  assert.equal(game.discard.some(card => card.id === attack.id), false,
    'source Sha is still resolving while its first Hanbing loss is suspended');
  game = JSON.parse(JSON.stringify(game)); resolve(game, { decline: true });
  assert.equal(game.pendingChoice.reason, '【屯田】');
  assert.equal(game.discard.some(card => card.id === attack.id), false,
    'second loss cannot reshuffle the unresolved source Sha');
  game = JSON.parse(JSON.stringify(game)); resolve(game, { decline: true });
  assert.equal(game.pendingChoice, null);
  assert.equal(game.discard.filter(card => card.id === attack.id).length, 1);
});

test('AC E2 JSON Hanbing source remains with the multi-target Sha until its last target finishes', () => {
  let game = fresh('liubei', 'dengai');
  S.grantSkill(game.player, 'jilue', '极略'); game.player.godMarks = { nin: 1 };
  game.player.skillPreferences.jilue = 'ask'; game.player.flags.tianyiWon = true;
  game.player.equipment.weapon = c('hanbing', { id: 'ac-multi-hanbing' });
  game.player.hand = [c('sha', { id: 'ac-multi-unused-retrial', suit: 'club' })];
  S.grantSkill(game.ally, 'tuntian', '屯田');
  for (const actor of ['enemy', 'ally']) {
    game[actor].hand = ['first', 'second'].map(suffix => c('sha', { id: 'ac-multi-' + actor + suffix }));
  }
  const attack = play(game, 'sha', 'player', 'enemy', { targets: ['enemy', 'ally'] });
  for (let i = 0; i < 4; i++) {
    assert.equal(game.pendingChoice?.reason, '【屯田】');
    assert.equal(game.discard.some(card => card.id === attack.id), false,
      'multi-target source remains unresolved during loss window ' + i);
    game = JSON.parse(JSON.stringify(game)); resolve(game, { decline: true });
  }
  assert.equal(game.pendingChoice, null);
  assert.equal(game.discard.filter(card => card.id === attack.id).length, 1);
});

for (const [armor, cardType, damage, wine] of [
  ['renwang', 'sha', 0, false], ['tengjia', 'sha', 0, false],
  ['bagua', 'sha', 0, false], ['baiyin', 'sha', 1, true]
]) {
  for (const suppressed of [false, true]) {
    test(`AC AB armor ${armor} ${suppressed ? 'suppressed by Wuqian' : 'effective'} survives JSON effect queries`, () => {
      const game = fresh();
      game.enemy.equipment.armor = c(armor, { id: 'ac-armor-' + armor });
      game.enemy.skillPreferences.bagua = 'auto';
      game.deck.push(c('sha', { id: 'ac-red-bagua', suit: 'heart' }));
      if (suppressed) game.enemy.godArmorSuppressedBy = ['player'];
      if (wine) game.player.shaBonus = 1;
      const copy = JSON.parse(JSON.stringify(game));
      play(copy, cardType);
      assert.equal(copy.enemy.hp, 4 - (suppressed ? (wine ? 2 : 1) : damage));
      assert.equal(copy.enemy.equipment.armor.type, armor);
      assert.equal(game.enemy.hp, 4);
    });
  }
}

test('AC horses modify opposite directed distances while Feiying and Mashu remain distinct sources', () => {
  const game = fresh();
  assert.equal(Engine.distanceBetween(game, 'player', 'ally'), 2);
  game.player.equipment.horseMinus = c('minus_horse', { id: 'ac-minus' });
  assert.equal(Engine.distanceBetween(game, 'player', 'ally'), 1);
  assert.equal(Engine.distanceBetween(game, 'ally', 'player'), 2);
  game.ally.equipment.horsePlus = c('plus_horse', { id: 'ac-plus' });
  assert.equal(Engine.distanceBetween(game, 'player', 'ally'), 2);
  S.activateSkillSource(game.player, 'huashen', { id: 'mashu', name: '马术' });
  assert.equal(Engine.distanceBetween(game, 'player', 'ally'), 1);
  S.activateSkillSource(game.player, 'huashen', { id: 'qicai', name: '奇才' });
  S.grantSkill(game.ally, 'feiying', '飞影');
  assert.equal(Engine.distanceBetween(game, 'player', 'ally'), 3);
  assert.equal(Engine.distanceBetween(game, 'ally', 'player'), 2);
});

await runTests({ collect: true });
