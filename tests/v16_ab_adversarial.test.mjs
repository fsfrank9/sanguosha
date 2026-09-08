import assert from 'node:assert/strict';
import { Engine, c, StateRuntime } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

// Independent contracts: card__hero__legend.md:27–43,61–67,81–87;
// flow__damage.md:53–54,67–82,109–113 (weather precedes Tianxiang,
// transferred damage starts anew; each chain recipient starts from the first loss).
function fresh() {
  const game = Engine.newGame({ seed: 169901, seats: ['player', 'enemy', 'ally', 'ally2', 'ally3'],
    playerHero: 'liubei', enemyHero: 'zhangfei', allyHero: 'zhaoyun', ally2Hero: 'machao', ally3Hero: 'guanyu',
    roles: { player: '主公', enemy: '反贼', ally: '反贼', ally2: '忠臣', ally3: '内奸' } });
  game.deck = Array.from({ length: 45 }, (_, i) => c('sha', { id: 'adv-deck-' + i, suit: 'club' }));
  game.discard = []; game.log = []; game.pendingChoice = null; game.pendingChoiceQueue = []; game.pauseState = {};
  game.turn = 'enemy'; game.phase = 'play';
  for (const actor of game.seats) Object.assign(game[actor], { hp: 5, maxHp: 5, hand: [], stars: [], judgeArea: [],
    equipment: {}, skills: [], flags: {}, godMarks: {}, skillPreferences: { dying: 'decline' }, chained: false, turnedOver: false });
  return game;
}
const grant = (game, actor, id) => StateRuntime.grantSkill(game[actor], id, id);
function active(game, actor, skill, cards = [], options = {}) {
  const result = assertCardConservation(game, () => Engine.useSkill(game, actor, skill, cards, options));
  assert.equal(result.ok, true, result.message); return result;
}
function choose(game, decision) {
  const result = assertCardConservation(game, () => Engine.resolvePendingChoice(game,
    { choiceId: game.pendingChoice?.choiceId, ...decision }));
  assert.equal(result.ok, true, result.message); return result;
}
function fire(game, target = 'player', type = 'fire_sha') {
  game.enemy.hand.push(c(type, { id: 'adv-strike', suit: 'diamond' }));
  const result = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'adv-strike', { target }));
  assert.equal(result.ok, true, result.message);
}
function weather(game, wind = [], fog = []) {
  game.godWeather = { kuangfeng: wind.map(target => ({ source: 'ally2', target })), dawu: fog.map(target => ({ source: 'ally2', target })) };
}
function tianxiang(game) {
  grant(game, 'player', 'tianxiang'); game.player.skillPreferences.tianxiang = 'ask';
  game.player.hand = [c('tao', { id: 'adv-transfer', suit: 'heart' })];
}

// Source is an AI seat so the human is the last damage recipient and later
// the only hand-discard chooser: both global barriers can be observed.
test('AB adversarial: Shenfen finishes every damage before equipment, then every equipment before four-hand discard', () => {
  let game = fresh(); grant(game, 'enemy', 'shenfen'); grant(game, 'player', 'guixin'); game.enemy.godMarks.rage = 6;
  for (const actor of ['ally', 'ally2', 'ally3', 'player']) {
    game[actor].hand = Array.from({ length: 6 }, (_, i) => c('sha', { id: actor + '-hand-' + i }));
    game[actor].equipment.weapon = c('zhuge', { id: actor + '-weapon' });
  }
  active(game, 'enemy', 'shenfen');
  assert.equal(game.pendingChoice.godChoiceType, 'guixin-invoke');
  for (const actor of ['ally', 'ally2', 'ally3', 'player']) {
    assert.equal(game[actor].hp, 4); assert.ok(game[actor].equipment.weapon); assert.equal(game[actor].hand.length, 6);
  }
  game = JSON.parse(JSON.stringify(game)); choose(game, { decline: true });
  assert.equal(game.pendingChoice.godChoiceType, 'shenfen-discard');
  for (const actor of ['ally', 'ally2', 'ally3', 'player']) assert.equal(game[actor].equipment.weapon, null);
  assert.equal(game.player.hand.length, 6); assert.equal(game.ally.hand.length, 2); assert.equal(game.enemy.turnedOver, false);
  choose(game, { cardIds: game.player.hand.slice(1, 5).map(card => card.id) });
  assert.equal(game.player.hand.length, 2); assert.equal(game.enemy.turnedOver, true); assert.equal(game.pendingChoice, null);
});

test('AB adversarial: Duanchang removes Shenfen but cannot cancel its already-paid remaining effects', () => {
  const game = fresh(); grant(game, 'enemy', 'shenfen'); grant(game, 'ally', 'duanchang'); game.enemy.godMarks.rage = 6;
  game.ally.hp = 1;
  for (const actor of ['player', 'ally2', 'ally3']) {
    game[actor].hand = [c('sha', { id: actor + '-retained' })]; game[actor].equipment.weapon = c('zhuge', { id: actor + '-weapon' });
  }
  active(game, 'enemy', 'shenfen');
  assert.equal(game.ally.hp, 0); assert.equal(StateRuntime.skillEnabled(game.enemy, 'shenfen', game), false);
  for (const actor of ['player', 'ally2', 'ally3']) {
    assert.equal(game[actor].hp, 4); assert.equal(game[actor].hand.length, 0); assert.equal(game[actor].equipment.weapon, null);
  }
  assert.equal(game.enemy.turnedOver, true);
});

test('AB adversarial: Wuhun killing the Shenfen source leaves remaining damage and discards while the game continues', () => {
  const game = fresh(); grant(game, 'enemy', 'shenfen'); grant(game, 'ally', 'wuhun'); game.enemy.godMarks.rage = 6;
  game.ally.hp = 1; game.enemy.nightmare = 3;
  game.ally3.equipment.weapon = c('zhuge', { id: 'survivor-weapon' }); game.ally3.hand = [c('sha', { id: 'survivor-hand' })];
  active(game, 'enemy', 'shenfen');
  assert.equal(game.enemy.hp, 0); assert.notEqual(game.phase, 'gameover');
  assert.equal(game.player.hp, 4); assert.equal(game.ally2.hp, 4); assert.equal(game.ally3.hp, 4);
  assert.equal(game.ally3.equipment.weapon, null); assert.equal(game.ally3.hand.length, 0); assert.equal(game.enemy.turnedOver, false);
});

test('AB adversarial: one or two HP can pay large Yeyan; death still settles the locked fire damage without a source', () => {
  for (const hp of [1, 2]) {
    const game = fresh(); grant(game, 'enemy', 'yeyan'); game.enemy.hp = hp;
    game.enemy.hand = ['spade', 'heart', 'club', 'diamond'].map((suit, i) => c('sha', { id: 'adv-cost-' + i, suit }));
    active(game, 'enemy', 'yeyan', game.enemy.hand.map(card => card.id), { allocations: [{ actor: 'player', amount: 2 }, { actor: 'ally3', amount: 1 }] });
    assert.ok(game.enemy.hp <= 0); assert.equal(game.player.hp, 3); assert.equal(game.ally3.hp, 4);
    assert.equal(game.log.filter(line => line.includes('发动限定技【业炎】')).length, 1);
    assert.equal(game.enemy.hand.length, 0); assert.notEqual(game.phase, 'gameover');
    assert.equal((game.aggressionLog || []).some(entry => entry.source === 'enemy'), false);
  }
});

test('AB adversarial: malformed Yeyan target allocations and four-suit payments are rejected before any cost', () => {
  const cases = [
    { allocations: [{ actor: 'player', amount: 2 }, { actor: 'player', amount: 1 }] },
    { allocations: [{ actor: 'player', amount: 4 }] },
    { allocations: [{ actor: 'absent', amount: 2 }] },
    { allocations: [{ actor: 'player', amount: 1.5 }] },
    { allocations: [{ actor: 'player', amount: 2 }], duplicateCost: true }
  ];
  for (const sample of cases) {
    const game = fresh(); grant(game, 'enemy', 'yeyan');
    game.enemy.hand = ['spade', 'heart', 'club', 'diamond'].map((suit, i) => c('sha', { id: 'adv-cost-' + i, suit }));
    const ids = game.enemy.hand.map(card => card.id); if (sample.duplicateCost) ids[3] = ids[0];
    const before = JSON.stringify(game);
    const result = assertCardConservation(game, () => Engine.useSkill(game, 'enemy', 'yeyan', ids, { allocations: sample.allocations }));
    assert.equal(result.ok, false); assert.equal(JSON.stringify(game), before);
  }
});

test('AB adversarial: Tianxiang sees amplified fire damage, then declining after JSON restore applies wind only once', () => {
  let game = fresh(); tianxiang(game); weather(game, ['player']); fire(game);
  assert.equal(game.pendingChoice.kind, 'tianxiang-ask'); assert.equal(game.pendingChoice.amount, 2);
  game = JSON.parse(JSON.stringify(game)); choose(game, { decline: true });
  assert.equal(game.player.hp, 3); assert.equal(game.player.hand[0].id, 'adv-transfer');
});

test('AB adversarial: transferred fire starts with the amplified value and applies the new recipient wind once', () => {
  const game = fresh(); tianxiang(game); weather(game, ['player', 'enemy']); fire(game);
  choose(game, { cardId: 'adv-transfer', target: 'enemy' });
  assert.equal(game.player.hp, 5); assert.equal(game.enemy.hp, 2);
  assert.equal(game.enemy.hand.length, 3, 'Tianxiang draws for the actual recipient lost HP');
});

test('AB adversarial: chain recipients use the original settled loss, without accumulating another recipient wind bonus', () => {
  const game = fresh(); weather(game, ['player', 'ally']);
  for (const actor of ['player', 'ally', 'ally3']) game[actor].chained = true;
  fire(game);
  assert.equal(game.player.hp, 3); assert.equal(game.ally.hp, 2); assert.equal(game.ally3.hp, 3);
  for (const actor of ['player', 'ally', 'ally3']) assert.equal(game[actor].chained, false);
});

test('AB adversarial: Dawu prevents normal and fire damage before Tianxiang may spend a card or open a window', () => {
  for (const type of ['sha', 'fire_sha']) {
    const game = fresh(); tianxiang(game); weather(game, ['player'], ['player']); fire(game, 'player', type);
    assert.equal(game.pendingChoice, null); assert.equal(game.player.hp, 5);
    assert.deepEqual(game.player.hand.map(card => card.id), ['adv-transfer']);
    assert.equal(game.log.some(line => line.includes('决定是否发动【天香】')), false);
  }
});

test('AB adversarial: Tianxiang into Dawu prevents damage but still draws for the recipient existing lost HP', () => {
  const game = fresh(); tianxiang(game); weather(game, [], ['enemy']); game.enemy.hp = 3;
  fire(game); choose(game, { cardId: 'adv-transfer', target: 'enemy' });
  assert.equal(game.player.hp, 5); assert.equal(game.enemy.hp, 3); assert.equal(game.enemy.hand.length, 2);
});

test('AB adversarial: one incoming damage grants Renjie before the zero-mark owner can pay for Jilue Fangzhu', () => {
  const game = fresh(); grant(game, 'player', 'renjie'); grant(game, 'player', 'jilue'); game.player.godMarks.nin = 0;
  fire(game, 'player', 'sha');
  assert.equal(game.pendingChoice.godChoiceType, 'jilue-fangzhu'); assert.equal(game.player.godMarks.nin, 1);
  choose(game, { targetActors: ['enemy'] });
  assert.equal(game.player.godMarks.nin, 0); assert.equal(game.enemy.hand.length, 1); assert.equal(game.enemy.turnedOver, true);
});

test('AB adversarial: temporary Jilue Wansha expires at turn end before a Lianpo extra-turn choice', () => {
  const game = fresh(); game.turn = 'player'; grant(game, 'player', 'jilue'); grant(game, 'player', 'lianpo');
  game.player.godMarks.nin = 1; active(game, 'player', 'jilue', [], { mode: 'wansha' });
  assert.equal(StateRuntime.skillEnabled(game.player, 'wansha', game), true);
  game.godTurnKills = { player: 1 }; game.phase = 'finish';
  assertCardConservation(game, () => Engine.endTurn(game));
  assert.equal(game.pendingChoice.godChoiceType, 'lianpo-extra-turn');
  assert.equal(game.turn, null); assert.equal(StateRuntime.skillEnabled(game.player, 'wansha', game), false);
  assert.equal(StateRuntime.wanshaBlocksTaoUse(game, 'ally'), false);
});

test('AB adversarial: AI Yeyan targeting and Qixing exchange ignore other players hidden hand and star identities', () => {
  for (const mode of ['yeyan', 'qixing']) {
    const first = fresh(); grant(first, 'enemy', mode); first.hiddenRoles = true;
    first.roleRevealed = { player: true, enemy: true, ally: false, ally2: false, ally3: false };
    first.enemy.hand = [c('sha', { id: 'ai-own-low' })]; first.enemy.stars = [c('tao', { id: 'ai-own-star', suit: 'heart' })];
    for (const actor of ['player', 'ally', 'ally2', 'ally3']) {
      first[actor].hand = [c('shan', { id: actor + '-secret-hand' })]; first[actor].stars = [c('sha', { id: actor + '-secret-star' })];
    }
    const second = JSON.parse(JSON.stringify(first));
    for (const actor of ['player', 'ally', 'ally2', 'ally3']) {
      second[actor].hand[0] = c('tao', { id: actor + '-secret-hand', suit: 'heart' });
      second[actor].stars[0] = c('wuxie', { id: actor + '-secret-star', suit: 'spade' });
    }
    const run = game => {
      if (mode === 'yeyan') return assertCardConservation(game, () => Engine.aiTakeAction(game, 'enemy'));
      game.phase = 'draw'; return assertCardConservation(game, () => Engine.advancePhase(game));
    };
    run(first); run(second);
    const observed = game => ({ hp: game.seats.map(actor => game[actor].hp), hand: game.enemy.hand.map(card => card.id),
      stars: game.enemy.stars.map(card => card.id), used: game.enemy.flags.yeyanUsed,
      logs: game.log.filter(line => /业炎|七星/.test(line)) });
    assert.deepEqual(observed(first), observed(second), mode + ' may only use its own private cards and public opponent state');
    if (mode === 'yeyan') assert.equal(first.enemy.flags.yeyanUsed, true);
  }
});

await runTests({ collect: true });
