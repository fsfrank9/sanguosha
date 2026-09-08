// AB god-inclusive interaction sample. Historical W2 and the three fixed AI
// benchmarks retain their existing rosters and seeds; this is an added pool.
import assert from 'node:assert/strict';
import { Engine, SkillRuntime } from './helpers/load-engine.mjs';
import { GeneralCardRuntime } from '../src/engine/general-card-runtime.js';
import { collectCardCensus } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

const SEEDS = Number(process.env.SANGUOSHA_AB_SOAK_SEEDS || 24);
assert.ok(Number.isSafeInteger(SEEDS) && SEEDS >= 8, 'AB soak needs at least one pass through all eight god heroes');
const GODS = ['god_guanyu', 'god_lvmeng', 'god_zhouyu', 'god_zhugeliang',
  'god_caocao', 'god_lvbu', 'god_zhaoyun', 'god_simayi'];
const LEGACY = ['caocao', 'liubei', 'xiaoqiao', 'zhangjiao', 'dengai', 'caiwenji', 'jiaxu', 'sp_yuanshu'];
const MAX_ACTIONS = 180;

function godDecision(pending, game) {
  const result = { choiceId: pending.choiceId };
  if (pending.optional) return { ...result, decline: true };
  if (pending.godChoiceType === 'faction') return { ...result, optionId: '魏' };
  if (pending.godChoiceType === 'wumou') {
    return { ...result, optionId: game[pending.actor].godMarks?.rage > 0 ? 'rage' : 'hp' };
  }
  if (pending.godChoiceType === 'shelie-pick') {
    const suits = new Map();
    for (const card of pending.cards) if (!suits.has(card.suit)) suits.set(card.suit, card.id);
    return { ...result, cardIds: [...suits.values()] };
  }
  if (pending.options?.length) result.optionId = pending.options.find(option => !option.disabled)?.id;
  if (pending.cards?.length) result.cardIds = pending.cards.filter(card => !card.disabled)
    .slice(0, pending.cardMin || 0).map(card => card.id);
  if (pending.starCards?.length) result.starIds = pending.starCards.slice(0, pending.starMin || 0).map(card => card.id);
  if (pending.targets?.length) result.targetActors = pending.targets.filter(target => !target.disabled)
    .slice(0, pending.targetMin || 0).map(target => target.actor);
  return result;
}

function settlePending(game) {
  const pending = game.pendingChoice;
  let decisions;
  switch (pending.kind) {
    case 'god-choice': decisions = [godDecision(pending, game)]; break;
    case 'yongsi-discard': decisions = [{ cardIds: pending.options.slice(0, pending.count).map(option => option.cardId) }]; break;
    case 'fanjian-guess': decisions = [{ suit: 'spade' }]; break;
    case 'cixiong-choose': decisions = [{ option: 'draw' }]; break;
    case 'ganglie-source-choice': decisions = [{ mode: 'takeDamage' }]; break;
    case 'huogong-show': decisions = [{ cardId: pending.cardIds?.[0] }]; break;
    case 'wugu-pick': decisions = [{ cardId: pending.cards?.[0]?.id }]; break;
    case 'yaowu-reward': decisions = [{ choice: 'draw' }]; break;
    case 'leiji-ask': decisions = [{ auto: true }]; break;
    case 'fankui-pick': {
      const zone = pending.zones?.[0] || { zone: 'hand' };
      decisions = [zone.zone === 'equipment' ? { zone: 'equipment', cardId: zone.cardId } : { zone: 'hand' }];
      break;
    }
    case 'guohe-1v1-pick': {
      const equipment = pending.equipment?.[0];
      const hand = pending.hand?.[0];
      const judge = pending.judgeArea?.[0];
      decisions = [equipment ? { zone: 'equipment', cardId: equipment.cardId }
        : hand ? { zone: 'hand', cardId: hand.cardId }
          : judge ? { zone: 'judge', cardId: judge.cardId } : { zone: 'hand' }];
      break;
    }
    default: {
      const option = pending.options?.[0] || pending.candidates?.[0] || {};
      decisions = [{ decline: true, skip: true, use: false },
        { cardId: option.cardId, target: option.seat, option: 'heal', choice: 'hp' }, {}];
    }
  }
  for (const decision of decisions) {
    const result = Engine.resolvePendingChoice(game, decision);
    if (result?.ok && game.pendingChoice !== pending) return;
    assert.equal(game.pendingChoice, pending, 'a rejected decision must keep its own pending window');
  }
  assert.fail(`unresolved ${pending.kind}/${pending.godChoiceType || ''}: ${JSON.stringify(decisions)}`);
}

test(`AB soak: ${SEEDS} god-inclusive seeds retain both resource sets and make legal progress`, () => {
  let actions = 0;
  let finished = 0;
  const featured = new Set();
  const kinds = new Set();
  SkillRuntime.resetLegacySkillQueryCount();
  for (let index = 0; index < SEEDS; index += 1) {
    const seed = 168001 + index;
    const count = 3 + index % 3;
    const seats = ['player', 'enemy', 'ally', 'ally2', 'ally3'].slice(0, count);
    const options = { seed, seats, hiddenRoles: index % 2 === 1, godCamps: {} };
    for (let seatIndex = 0; seatIndex < seats.length; seatIndex += 1) {
      const id = seatIndex === 0 || (index + seatIndex) % 2 === 0
        ? GODS[(index + seatIndex * 3) % GODS.length]
        : LEGACY[(index + seatIndex) % LEGACY.length];
      options[seats[seatIndex] + 'Hero'] = id;
      options.godCamps[seats[seatIndex]] = ['魏', '蜀', '吴', '群'][(index + seatIndex) % 4];
      if (id.startsWith('god_')) featured.add(id);
    }
    const game = Engine.newGame(options);
    for (const actor of seats) {
      const preferences = game[actor].skillPreferences || {};
      for (const key of Object.keys(preferences)) preferences[key] = 'auto';
      Object.assign(preferences, { dying: 'auto', wuxieResponse: 'auto', shanResponse: 'auto',
        shaDuelResponse: 'auto', jijiangAid: 'decline', hujiaAid: 'decline',
        shelie: 'auto', guixin: 'auto', gongxin: 'auto' });
      game[actor].skillPreferences = preferences;
    }
    const initial = collectCardCensus(game);
    assert.ok(initial.ids.size > 0);
    const expectedIds = [...initial.ids].sort();
    assert.deepEqual(initial.zoneDuplicates, []);
    for (let step = 0; step < MAX_ACTIONS && game.phase !== 'gameover'; step += 1) {
      const label = `seed=${seed}, step=${step}, actor=${game.turn}, phase=${game.phase}`;
      try {
        if (game.pendingChoice) {
          kinds.add(game.pendingChoice.godChoiceType || game.pendingChoice.kind);
          settlePending(game);
        } else {
          const result = Engine.runAITurn(game, game.turn);
          assert.ok(result?.ok || game.pendingChoice, result?.message || 'AI did not return a successful action');
        }
        const census = collectCardCensus(game);
        assert.deepEqual(census.zoneDuplicates, [], 'duplicate card zones');
        assert.deepEqual([...census.ids].sort(), expectedIds, 'ordinary card IDs changed');
        assert.equal(GeneralCardRuntime.assertConservation(game).total, 79, 'general card resources changed');
      } catch (error) {
        throw new Error(`${label}: ${error.message}`, { cause: error });
      }
      actions += 1;
    }
    if (game.phase === 'gameover') finished += 1;
  }
  assert.deepEqual([...featured].sort(), GODS.slice().sort(), 'all eight god heroes must enter real games');
  assert.ok(actions > SEEDS * 2, 'the sample must progress beyond setup');
  assert.equal(SkillRuntime.readLegacySkillQueryCount(), 0, 'god interactions use the AA canonical skill queries');
  console.log(`  (log) AB ${SEEDS} seeds / ${actions} actions / ${finished} finished games; pending kinds: ${[...kinds].sort().join(', ')}`);
});

await runTests();
