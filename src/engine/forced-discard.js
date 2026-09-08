import { CardRuntime } from './card-runtime.js';
import { StateRuntime } from './state.js';

// AC-C26: the affected role chooses its own hand/equipment cards. The frame
// owns a complete committed payment and resumes loss timings without re-drawing
// Yinghun cards or repeating a Beige judgement after a JSON copy.
export function createForcedDiscardRuntime(deps) {
  const flows = deps.responseFlows;
  const choices = deps.godChoices;
  const ok = message => ({ ok: true, message });
  const name = StateRuntime.actorName;

  function available(game, actor) {
    const state = game[actor];
    if (!state) return [];
    return (state.hand || []).map(card => ({ card, ref: { zone: 'hand', actor } }))
      .concat(deps.equipmentList(state).map(entry => ({ card: entry.card,
        ref: { zone: 'equipment', actor, slot: entry.slot } })));
  }

  function finish(game, source) {
    flows.finish(game, 'effect-discard', source);
    deps.log(game, '【' + source.label + '】令' + name(game, source.actor) + '弃置 ' + (source.paidIds || []).length + ' 张牌。');
    return ok('弃牌结算完成。');
  }

  function advance(game, source) {
    if (source.stage === 'choose') {
      const entries = available(game, source.actor);
      source.count = Math.min(source.count, entries.length);
      if (!game[source.actor] || game[source.actor].hp <= 0 || !source.count) return finish(game, source);
      source.stage = 'choosing';
      const ranked = entries.slice().sort((a, b) =>
        deps.scoreCardForDiscard(game, source.actor, a.card) - deps.scoreCardForDiscard(game, source.actor, b.card));
      return choices.request(game, source.actor, 'effect-discard', {
        skillId: 'effectDiscard', effectSkillId: source.skillId,
        title: source.label, prompt: '请选择自己要弃置的 ' + source.count + ' 张手牌或装备牌。',
        optional: false, cardMin: source.count, cardMax: source.count,
        cards: entries.map(entry => Object.assign({}, entry.card, { sourceZone: entry.ref.zone })),
        effectFlowId: source.responseFlowId
      }, { cardIds: ranked.slice(0, source.count).map(entry => entry.card.id) });
    }
    if (source.stage === 'choosing') return ok('等待本人选择弃牌。');
    while (source.index < source.equipmentEvents.length) {
      // These are committed loss events, not claims on the card's current
      // zone: an earlier Xiaoji draw may already have reshuffled this card.
      const card = source.equipmentEvents[source.index++];
      deps.triggerEquipmentLoss(game, source.actor, card);
      if (flows.blocked(game)) return Object.assign(ok('等待失去装备后的结算。'), { suspended: true });
      if (game.phase === 'gameover') return finish(game, source);
    }
    if (!source.lossNotified) {
      source.lossNotified = true;
      if (source.paidIds.length) deps.notifyCardLoss(game, source.actor);
      if (flows.blocked(game)) return Object.assign(ok('等待失牌后的结算。'), { suspended: true });
    }
    return finish(game, source);
  }

  choices.register('effect-discard', (game, pending, decision) => {
    const source = game.pauseState && game.pauseState.effectDiscard;
    if (!source || source.responseFlowId !== pending.effectFlowId || source.stage !== 'choosing') {
      game.pendingChoice = pending;
      return deps.fail('找不到当前弃牌结算。');
    }
    if (game.phase === 'gameover') {
      flows.finish(game, 'effect-discard', source);
      return ok('游戏结束，弃牌结算取消。');
    }
    if (!game[source.actor] || game[source.actor].hp <= 0) return finish(game, source);
    const ids = decision.cardIds;
    const entries = available(game, source.actor);
    if (decision.decline || !Array.isArray(ids) || ids.length !== source.count || new Set(ids).size !== ids.length
        || ids.some(id => !entries.some(entry => entry.card.id === id))) {
      game.pendingChoice = pending;
      return deps.fail('须选择 ' + source.count + ' 张不同的现有手牌或装备牌。');
    }
    // Validate the whole transaction before removing any selected card. Remove
    // all cards before the first hand/equipment-loss trigger can draw new ones.
    const selected = ids.map(id => entries.find(entry => entry.card.id === id));
    const paid = selected.map(entry => CardRuntime.takeCard(game, entry.card.id, entry.ref));
    source.paidIds = ids.slice();
    source.equipmentEvents = selected.filter(entry => entry.ref.zone === 'equipment')
      .map(entry => Object.assign({}, entry.card));
    source.index = 0;
    source.stage = 'loss';
    paid.forEach(card => CardRuntime.putCard(game, card, { zone: 'discard' }));
    return flows.run(game, 'effect-discard', source);
  });
  flows.register('effect-discard', { key: 'effectDiscard', advance });
  function discard(game, actor, count, skillId, label) {
    return flows.run(game, 'effect-discard', { actor, count, skillId, label,
      stage: 'choose', paidIds: [], equipmentEvents: [], index: 0, lossNotified: false });
  }
  return { discard };
}
