import { StateRuntime } from './state.js';
import { CardRuntime } from './card-runtime.js';
import { SkillRuntime } from './skill-runtime.js';

const SUITS = { tao: 'heart', sha: 'diamond', fire_sha: 'diamond', shan: 'club', wuxie: 'spade' };
const TYPES = { heart: 'tao', diamond: 'fire_sha', club: 'shan', spade: 'wuxie' };
const SLOTS = ['weapon', 'armor', 'horseMinus', 'horsePlus'];
const enabled = StateRuntime.skillEnabled;
const ok = message => ({ ok: true, message });
const no = message => ({ ok: false, message });

export function longhunMaterials(state, type) {
  if (!state || !enabled(state, 'longhun')) return [];
  const suit = SUITS[type];
  const result = (state.hand || []).map(card => ({ card, zone: 'hand' }));
  SLOTS.forEach(slot => {
    if (state.equipment && state.equipment[slot]) result.push({ card: state.equipment[slot], zone: 'equipment', slot });
  });
  return result.filter(entry => !suit || StateRuntime.effectiveCardSuit(state, entry.card) === suit);
}

export function longhunResponseOptions(state, type) {
  if (!SUITS[type]) return [];
  const candidates = longhunMaterials(state, type);
  const count = Math.max(1, state && state.hp || 0);
  if (candidates.length < count) return [];
  const cardIds = candidates.slice(0, count).map(entry => entry.card.id);
  return [{
    cardId: 'longhun:' + JSON.stringify(cardIds), cardIds, via: '龙魂',
    name: '龙魂·' + ({ tao: '桃', sha: '火杀', fire_sha: '火杀', shan: '闪', wuxie: '无懈可击' })[type],
    suit: SUITS[type], rank: null, requiredCount: count,
    candidateCards: candidates.map(entry => Object.assign({}, entry.card, { sourceZone: entry.zone, sourceSlot: entry.slot || null }))
  }];
}

export function parseLonghunChoice(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.startsWith('longhun:')) return null;
  try {
    const ids = JSON.parse(value.slice(8));
    return Array.isArray(ids) ? ids : [];
  } catch (_) { return []; }
}

function makeLonghunCard(state, entries, type) {
  const cards = entries.map(entry => entry.card);
  const one = cards.length === 1;
  const colors = cards.map(card => StateRuntime.effectiveCardColor(state, card));
  const card = CardRuntime.makeTestCard(type === 'sha' ? 'fire_sha' : type, {
    id: 'longhun-card:' + JSON.stringify(cards.map(item => item.id)),
    virtual: true, physicalCards: cards, skillId: 'longhun',
    suit: one ? StateRuntime.effectiveCardSuit(state, cards[0]) : null,
    rank: one ? cards[0].rank : cards.reduce((sum, item) => sum + CardRuntime.cardRankValue(item), 0),
    color: colors.every(color => color === colors[0]) ? colors[0] : null
  });
  // makeTestCard's default suit is useful for fixtures, but a multi-card
  // conversion explicitly has no suit (glossary__gamecard.md:122).
  card.suit = one ? StateRuntime.effectiveCardSuit(state, cards[0]) : null;
  return card;
}

export function installGodConversionHandlers(registry, deps) {
  const flows = deps.responseFlows;
  const log = deps.log || (() => {});
  const name = StateRuntime.actorName;
  const choices = deps.godChoices;

  function validateMaterials(game, actor, type, ids) {
    const state = game[actor];
    if (!state || !enabled(state, 'longhun', game)) return null;
    if (!Array.isArray(ids) || ids.length !== Math.max(1, state.hp) || new Set(ids).size !== ids.length) return null;
    const candidates = longhunMaterials(state, type);
    const entries = ids.map(id => candidates.find(entry => entry.card.id === id));
    if (entries.some(entry => !entry)) return null;
    const suit = StateRuntime.effectiveCardSuit(state, entries[0].card);
    if (!TYPES[suit] || entries.some(entry => StateRuntime.effectiveCardSuit(state, entry.card) !== suit)) return null;
    return entries;
  }

  function takeMaterials(game, actor, entries) {
    // Remove the complete selected bundle before any equipment-loss effect
    // can change HP, draw cards or open a nested response window.
    entries.forEach(entry => CardRuntime.takeCard(game, entry.card.id,
      { zone: entry.zone, actor, slot: entry.slot }));
    entries.forEach(entry => {
      if (entry.zone === 'hand') CardRuntime.commitHandLossToProcessing(game, entry.card, actor);
    });
    entries.forEach(entry => {
      if (entry.zone === 'equipment' && deps.triggerEquipmentLoss) deps.triggerEquipmentLoss(game, actor, entry.card);
    });
  }

  function takeResponse(game, actor, type, preferredCardId, useOptions) {
    const state = game[actor];
    if (!state || !SUITS[type]) return null;
    let ids = parseLonghunChoice(preferredCardId);
    if (ids === null && preferredCardId) {
      // A single physical ID is also a useful public-API spelling when X=1.
      if (Math.max(1, state.hp) !== 1) return null;
      ids = [preferredCardId];
    }
    if (ids === null) {
      const available = longhunMaterials(state, type).slice();
      if (deps.scoreCardForAI) available.sort((a, b) => deps.scoreCardForAI(game, actor, a.card) - deps.scoreCardForAI(game, actor, b.card));
      ids = available.slice(0, Math.max(1, state.hp)).map(entry => entry.card.id);
    }
    const entries = validateMaterials(game, actor, type, ids);
    if (!entries) return null;
    const card = makeLonghunCard(state, entries, type);
    card.godLastHandSha = entries.every(entry => entry.zone === 'hand') && entries.length === state.hand.length;
    if (useOptions && (type === 'sha' || type === 'fire_sha')) {
      const futureState = Object.assign({}, state, { equipment: Object.fromEntries(SLOTS.map(slot => [slot,
        entries.some(entry => entry.zone === 'equipment' && entry.slot === slot) ? null : (state.equipment || {})[slot]])) });
      const future = Object.assign({}, game, { [actor]: futureState });
      const targets = useOptions.targets || [useOptions.target];
      if (targets.some(target => !target || !deps.isLegalCardTarget(future, actor, card, target))) return null;
    }
    takeMaterials(game, actor, entries);
    return { card, asName: card.name, skillName: '龙魂', extraCards: card.physicalCards,
      sourceZones: entries.map(entry => ({ zone: entry.zone, slot: entry.slot || null })) };
  }

  function validatePlay(game, actor, ids, options) {
    const state = game[actor];
    if (!state || game.turn !== actor || game.phase !== 'play') return { error: '只能在自己的出牌阶段发动【龙魂】。' };
    const entries = validateMaterials(game, actor, null, ids);
    if (!entries) return { error: '请选择当前体力值（至少1）张同花色手牌或装备牌。' };
    const type = TYPES[StateRuntime.effectiveCardSuit(state, entries[0].card)];
    if (type !== 'tao' && type !== 'fire_sha') return { error: '出牌阶段可将红桃牌当【桃】或方片牌当火【杀】使用。' };
    const card = makeLonghunCard(state, entries, type);
    const futureState = Object.assign({}, state, { equipment: Object.fromEntries(SLOTS.map(slot => [slot,
      entries.some(entry => entry.zone === 'equipment' && entry.slot === slot) ? null : (state.equipment || {})[slot]])) });
    const future = Object.assign({}, game, { [actor]: futureState });
    const playable = deps.canPlayCard(future, actor, card);
    if (!playable.ok) return { error: playable.message };
    const requested = (options && (options.targets || (options.target ? [options.target] : null))) || [];
    if (type === 'tao') {
      if (requested.some(target => target !== actor)) return { error: '出牌阶段的【桃】只能对自己使用。' };
      if (StateRuntime.wanshaBlocksTaoUse(game, actor)) return { error: '【完杀】期间不能使用【桃】。' };
      return { card, entries, options: Object.assign({}, options, { target: actor }) };
    }
    let targets = requested.slice();
    if (!targets.length) {
      const legal = StateRuntime.aliveSeats(future).filter(target => target !== actor && deps.isLegalCardTarget(future, actor, card, target));
      const preferred = StateRuntime.perceivedHostileFirstPool(future, actor, legal);
      targets = preferred.slice(0, 1);
    }
    const allLastHand = entries.every(entry => entry.zone === 'hand') && entries.length === state.hand.length;
    const extra = (allLastHand && StateRuntime.hasEquipmentEffect(futureState, 'fangtianLastHandBonus') ? 2 : 0)
      + (state.flags && state.flags.tianyiWon ? 1 : 0);
    if (!targets.length || targets.length > 1 + extra || new Set(targets).size !== targets.length
        || targets.some(target => !deps.isLegalCardTarget(future, actor, card, target))) return { error: '请选择合法且不重复的火【杀】目标。' };
    card.godLastHandSha = allLastHand;
    return { card, entries, options: Object.assign({}, options, { target: targets[0], targets }) };
  }

  function finishMaterials(game, source) {
    (source.card.physicalCards || []).forEach(card => {
      if (!CardRuntime.findCardZone(game, card)) CardRuntime.putCard(game, card, { zone: 'discard' });
    });
  }

  flows.register('god-longhun-use', {
    key: 'godLonghunUse',
    cancel: finishMaterials,
    advance(game, source) {
      if (source.stage === 'cost') {
        source.stage = 'use';
        takeMaterials(game, source.actor, source.entries);
        if (flows.blocked(game)) return ok('【龙魂】等待失去装备后的结算。');
      }
      if (source.stage === 'use') {
        source.stage = 'finish';
        if (game[source.actor].hp > 0) {
          log(game, name(game, source.actor) + '发动【龙魂】，将' + source.card.physicalCards.length + '张牌当【' + source.card.name + '】使用。');
          const result = deps.playCardWithRegisteredHandler(game, source.actor, source.card, source.options, game[source.actor]);
          if (result && !result.ok) {
            finishMaterials(game, source);
            flows.finish(game, 'god-longhun-use', source);
            return result;
          }
          if (flows.blocked(game)) return ok('【龙魂】等待牌的结算。');
        }
      }
      finishMaterials(game, source);
      flows.finish(game, 'god-longhun-use', source);
      return ok('【龙魂】结算完成。');
    }
  });

  function playLonghun(game, actor, ids, options) {
    const valid = validatePlay(game, actor, ids, options || {});
    if (valid.error) return no(valid.error);
    return flows.run(game, 'god-longhun-use', { actor, card: valid.card, entries: valid.entries, options: valid.options, stage: 'cost' });
  }

  choices.register('longhun-use', (game, pending, decision) => {
    if (decision.decline || decision.optionId === 'decline') return ok('取消【龙魂】。');
    const result = playLonghun(game, pending.actor, decision.cardIds || [], { targets: decision.targetActors || [] });
    if (!result.ok) game.pendingChoice = pending;
    return result;
  });

  function askLonghun(context) {
    const { game, actor } = context;
    if (context.cardIds && context.cardIds.length) return playLonghun(game, actor, context.cardIds, context.options);
    const state = game[actor];
    const count = Math.max(1, state.hp);
    const candidates = longhunMaterials(state).filter(entry => ['heart', 'diamond'].includes(StateRuntime.effectiveCardSuit(state, entry.card)));
    const aiTypes = state.hp < state.maxHp ? ['tao', 'sha'] : ['sha'];
    let ai = { optionId: 'decline', cardIds: [], targetActors: [] };
    for (const type of aiTypes) {
      const entries = longhunMaterials(state, type).slice().sort((a, b) => deps.scoreCardForAI ? deps.scoreCardForAI(game, actor, a.card) - deps.scoreCardForAI(game, actor, b.card) : 0);
      const ids = entries.slice(0, count).map(entry => entry.card.id);
      const valid = validatePlay(game, actor, ids, {});
      if (!valid.error) { ai = { optionId: 'use', cardIds: ids, targetActors: valid.options.targets || [actor] }; break; }
    }
    if (ai.optionId === 'decline' && actor !== 'player') return no('当前没有可使用的【龙魂】组合。');
    return choices.request(game, actor, 'longhun-use', {
      title: '龙魂', skillId: 'longhun', prompt: '选择' + count + '张同花色牌：红桃当桃，方片当火杀。',
      options: [{ id: 'use', label: '使用' }, { id: 'decline', label: '取消', skipSelection: true }],
      cards: candidates.map(entry => entry.card), cardMin: count, cardMax: count, cardSuitRule: 'same',
      targets: StateRuntime.aliveSeats(game).map(target => ({ actor: target, name: name(game, target) })),
      targetMin: 0, targetMax: 4, optional: true
    }, ai);
  }

  choices.register('wuhun-target', (game, pending, decision) => {
    const targets = (pending.targets || []).map(entry => entry.actor);
    const target = decision.targetActors && decision.targetActors[0];
    if (!target || !targets.includes(target) || !game[target] || game[target].hp <= 0) {
      game.pendingChoice = pending;
      return no('请选择梦魇数最多的存活角色。');
    }
    return deps.godJudgements.start(game, target, '【武魂】', 'god-wuhun', { deadActor: pending.actor, targetActor: target });
  });
  deps.godJudgements.register('god-wuhun', (game, result) => {
    const target = result.context.targetActor;
    if (game.phase === 'gameover' || !game[target] || game[target].hp <= 0) return;
    if (result.card && ['tao', 'taoyuan'].includes(result.card.type)) {
      log(game, name(game, target) + '的【武魂】判定为【' + result.card.name + '】，免于死亡。');
    } else {
      deps.directDeath(game, target);
    }
  });

  SkillRuntime.registerSkill(registry, 'wushen', {
    onCardAs(context) {
      if (context.asType !== 'sha' || !enabled(context.state, 'wushen', context.game)) return null;
      const card = context.card || (context.state.hand || []).find(item => StateRuntime.effectiveCardSuit(context.state, item) === 'heart');
      if (!card || !StateRuntime.effectiveCardView(context.state, card).wushenView) return null;
      return { card, asName: '杀', skillName: '武神', priority: 100 };
    }
  });
  SkillRuntime.registerSkill(registry, 'wuhun', {
    onDamageAfter(context) {
      const { game, targetActor, sourceActor } = context;
      if (game.phase === 'gameover' || !game[sourceActor] || !enabled(game[targetActor], 'wuhun', game)) return;
      game[sourceActor].nightmare = (game[sourceActor].nightmare || 0) + context.amount;
      log(game, name(game, sourceActor) + '获得' + context.amount + '枚“梦魇”。');
    },
    onDeath(context) {
      const { game, deadActor } = context;
      if (context.resolvingSeat !== deadActor || game.phase === 'gameover' || !enabled(game[deadActor], 'wuhun', game)) return null;
      const marked = StateRuntime.aliveSeats(game).filter(actor => actor !== deadActor && game[actor].nightmare > 0);
      if (!marked.length) return null;
      const max = Math.max(...marked.map(actor => game[actor].nightmare));
      const targets = marked.filter(actor => game[actor].nightmare === max);
      const pick = StateRuntime.perceivedHostileFirstPool(game, deadActor, targets)[0];
      if (targets.length === 1) return deps.godJudgements.start(game, pick, '【武魂】', 'god-wuhun', { deadActor, targetActor: pick });
      return choices.request(game, deadActor, 'wuhun-target', {
        title: '武魂', skillId: 'wuhun', prompt: '选择梦魇数最多的一名角色进行判定。',
        options: [{ id: 'judge', label: '判定' }],
        targets: targets.map(actor => ({ actor, name: name(game, actor) })), targetMin: 1, targetMax: 1,
        allowDeadActor: true
      }, { optionId: 'judge', targetActors: [pick] });
    }
  });
  SkillRuntime.registerSkill(registry, 'juejing', {
    onDrawPhase(context) {
      const state = context.game[context.actor];
      if (enabled(state, 'juejing', context.game) && !context.replaceDraw && context.drawCount > 0) {
        const lost = Math.max(0, state.maxHp - state.hp);
        context.drawCount += lost;
        if (lost) log(context.game, name(context.game, context.actor) + '因【绝境】额外摸' + lost + '张牌。');
      }
    }
  });
  SkillRuntime.registerSkill(registry, 'longhun', {
    onCardAs(context) {
      if (!enabled(context.state, 'longhun', context.game) || !SUITS[context.asType]) return null;
      const options = longhunResponseOptions(context.state, context.asType);
      if (!options.length) return null;
      const ids = context.cardIds || (context.card ? [context.card.id] : options[0].cardIds);
      const entries = longhunMaterials(context.state, context.asType).filter(entry => ids.includes(entry.card.id));
      if (entries.length !== Math.max(1, context.state.hp) || entries.length !== ids.length) return null;
      return { card: entries[0].card, cards: entries.map(entry => entry.card), asType: context.asType === 'sha' ? 'fire_sha' : context.asType,
        asName: context.asType === 'sha' ? '火杀' : options[0].name.slice(3), skillName: '龙魂', skillId: 'longhun', priority: 5 };
    },
    onActiveSkill(context) {
      return context.skillId === 'longhun' ? askLonghun(context) : null;
    }
  });
  function playResponseSha(game, actor, response, options) {
    if (!response || response.skillName !== '龙魂') return null;
    return flows.run(game, 'god-longhun-use', { actor, card: response.card, entries: [], options: options || {}, stage: 'use' });
  }
  function runAIActiveSkills(game, actor) {
    const state = game[actor];
    if (!state || !enabled(state, 'longhun', game) || game.turn !== actor || game.phase !== 'play') return { acted: false };
    for (const type of state.hp < state.maxHp ? ['tao', 'sha'] : ['sha']) {
      const entries = longhunMaterials(state, type).slice().sort((a, b) => deps.scoreCardForAI ? deps.scoreCardForAI(game, actor, a.card) - deps.scoreCardForAI(game, actor, b.card) : 0);
      const ids = entries.slice(0, Math.max(1, state.hp)).map(entry => entry.card.id);
      const valid = validatePlay(game, actor, ids, {});
      if (!valid.error) return { acted: true, result: playLonghun(game, actor, ids, valid.options) };
    }
    return { acted: false };
  }
  return { cardView: StateRuntime.effectiveCardView, responseOptions: longhunResponseOptions, takeResponse, playResponseSha,
    playLonghun, canPlayLonghun: validatePlay, validateMaterials, longhunMaterials, runAIActiveSkills };
}
