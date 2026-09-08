import { CardRuntime } from './card-runtime.js';
import { StateRuntime } from './state.js';

// AB: a judgement owns an ordered, serializable replacement round. Each seat
// has one opportunity, starting with the current turn actor (principle §2a).
// Native Guicai, paid Jilue and Guidao all operate on the latest physical card.
export function createGodJudgementRuntime(deps) {
  var continuations = {};
  var flows = deps.responseFlows;

  function usesOrderedReplacements(game) {
    return StateRuntime.aliveSeats(game).some(function (actor) {
      return StateRuntime.skillEnabled(game[actor], 'jilue', game);
    });
  }
  function replacementCandidates(game, actor, skillId) {
    var state = game[actor];
    var cards = (state.hand || []).map(function (card) { return { card: card, zone: 'hand' }; });
    if (skillId === 'guidao') {
      ['weapon', 'armor', 'horseMinus', 'horsePlus'].forEach(function (slot) {
        var card = state.equipment && state.equipment[slot];
        if (card) cards.push({ card: card, zone: 'equipment' });
      });
      cards = cards.filter(function (entry) { return StateRuntime.effectiveCardColor(state, entry.card) === 'black'; });
    }
    return cards.map(function (entry) {
      var card = entry.card;
      return { id: card.id, type: card.type, name: card.name, suit: card.suit,
        rank: card.rank, color: card.color, zone: entry.zone };
    });
  }
  function replacementSkill(game, actor) {
    var state = game[actor];
    if (!state || state.hp <= 0) return null;
    var skills = ['guicai', 'guidao', 'jilue'];
    for (var i = 0; i < skills.length; i += 1) {
      var skillId = skills[i];
      if (!StateRuntime.skillEnabled(state, skillId, game)) continue;
      if (skillId === 'jilue' && !(state.godMarks && state.godMarks.nin > 0)) continue;
      var pref = state.skillPreferences && state.skillPreferences[skillId];
      // Declining one skill must not consume another holder's opportunity.
      if (pref === 'decline') continue;
      var candidates = replacementCandidates(game, actor, skillId);
      if (candidates.length) return { skillId: skillId, candidates: candidates,
        pref: pref || (actor === 'player' ? 'ask' : 'auto') };
    }
    return null;
  }
  function replacementSource(game, pending) {
    var frames = game.pauseState && game.pauseState.responseFlows || [];
    var frame = frames.find(function (entry) { return entry.kind === 'god-judgement'
      && entry.id === pending.orderedJudgementId; });
    return frame && frame.source;
  }
  function resolveOrderedReplacement(game, pending, decision) {
    var source = replacementSource(game, pending);
    if (!source || !source.current || source.current.actor !== pending.actor
        || source.current.skillId !== pending.replacementSkill || source.resolved) {
      game.pendingChoice = pending;
      return deps.fail('此改判窗口已经失效。');
    }
    var state = game[pending.actor];
    var skillId = source.current.skillId;
    var canInvoke = state && state.hp > 0 && StateRuntime.skillEnabled(state, skillId, game)
      && (skillId !== 'jilue' || state.godMarks && state.godMarks.nin > 0);
    if (!decision.cardId || !canInvoke || game.phase === 'gameover') {
      source.current = null;
      return deps.success('不改动当前判定牌。');
    }
    var candidate = (pending.candidates || []).find(function (card) { return card.id === decision.cardId; });
    var available = replacementCandidates(game, pending.actor, skillId);
    var current = available.find(function (card) { return card.id === decision.cardId; });
    var ref = current && CardRuntime.findCardZone(game, current.id);
    if (!candidate || !current || !ref || ref.actor !== pending.actor) {
      game.pendingChoice = pending;
      return deps.fail('请选择本次窗口内仍可用于改判的牌。');
    }
    // All original-candidate, live-zone and mark checks precede either cost.
    // Record the completed invocation before equipment loss can suspend us.
    source.current = null;
    if (skillId === 'jilue') {
      state.godMarks.nin -= 1;
      deps.log(game, StateRuntime.actorName(game, pending.actor) + '发动【极略·鬼才】，弃置一枚“忍”。');
    }
    var replacement = CardRuntime.takeCard(game, current.id, ref);
    var original = deps.restoreHongyanJudgementView(source.card);
    source.card = deps.applyHongyanJudgementView(game, source.actor, replacement);
    if (skillId === 'guidao') CardRuntime.putCard(game, original, { zone: 'hand', actor: pending.actor });
    else deps.discardCard(game, original);
    if (ref.zone === 'equipment') deps.triggerEquipmentLoss(game, pending.actor, replacement);
    deps.log(game, StateRuntime.actorName(game, pending.actor) + '发动【'
      + (skillId === 'guidao' ? '鬼道' : skillId === 'jilue' ? '极略·鬼才' : '鬼才')
      + '】，以【' + replacement.name + '】更改' + source.reason + '的判定。');
    return deps.success('改判已完成，继续下一名角色的机会。');
  }
  function advanceReplacements(game, source) {
    if (!source.order) {
      source.order = StateRuntime.seatsFrom(game, game.turn || source.actor, true);
      source.index = 0;
    }
    while (source.card && source.index < source.order.length && !game.pendingChoice && game.phase !== 'gameover') {
      var actor = source.order[source.index++];
      var choice = replacementSkill(game, actor);
      if (!choice) continue;
      source.current = { actor: actor, skillId: choice.skillId };
      var pending = { kind: choice.skillId === 'guidao' ? 'guidao-replace' : 'guicai-replace',
        actor: actor, judgementActor: source.actor, reason: source.reason,
        judgementCard: { id: source.card.id, name: source.card.name, type: source.card.type,
          suit: source.card.suit, rank: source.card.rank }, candidates: choice.candidates,
        jilueGuicai: choice.skillId === 'jilue', replacementSkill: choice.skillId,
        orderedJudgementId: source.responseFlowId, orderedReplacement: true };
      if (choice.pref === 'ask') {
        deps.requestPlayerResponse(game, { kind: pending.kind, actor: actor,
          pauseKey: 'godJudgement', source: source, meta: pending,
          statusMessage: '等待' + StateRuntime.actorName(game, actor) + '决定是否改判。' });
        return { ok: true, suspended: true };
      }
      var chosen = choice.candidates.slice().sort(function (a, b) {
        return (deps.scoreCardForAI ? deps.scoreCardForAI(game, actor, a) - deps.scoreCardForAI(game, actor, b) : 0);
      })[0];
      resolveOrderedReplacement(game, pending, { cardId: chosen.id });
    }
    return null;
  }
  function advance(game, source) {
    if (!source.started) {
      source.started = true;
      source.card = deps.judge(game, source.actor, source.reason, { pausable: true, skipReplacement: true });
    }
    advanceReplacements(game, source);
    if (game.pendingChoice) return { ok: true, suspended: true };
    if (source.replacementOnly) {
      flows.finish(game, 'god-judgement', source);
      source.resultCard = source.card;
      if (source.resumeLegacy && game.phase !== 'gameover') {
        return deps.resumeLegacyJudgement(game, source.actor, source.card);
      }
      return deps.success('改判顺序结算完成。');
    }
    if (!source.resolved) {
      source.resolved = true;
      var outcome = source.card && Object.assign({}, source.card);
      var spec = continuations[source.key];
      if (spec.settle) {
        spec.settle(game, { actor: source.actor, reason: source.reason,
          card: deps.restoreHongyanJudgementView(source.card), outcome: outcome,
          context: source.context });
      } else deps.resolveJudgementCard(game, source.actor, game[source.actor], source.reason, source.card);
      source.card = null;
      source.outcome = outcome;
      if (game.pendingChoice) return { ok: true, suspended: true };
    }
    flows.finish(game, 'god-judgement', source);
    if (game.phase === 'gameover') return deps.success('游戏结束。');
    return continuations[source.key].callback(game, { actor: source.actor, reason: source.reason,
      card: source.outcome, context: source.context });
  }

  flows.register('god-judgement', { key: 'godJudgement', advance: advance,
    cancel: function (game, source) {
      if (source.card && !CardRuntime.findCardZone(game, source.card)) {
        deps.discardCard(game, deps.restoreHongyanJudgementView(source.card));
      }
    } });

  function resolveReplacement(game, pending, decision, options) {
    if (pending.orderedReplacement) return resolveOrderedReplacement(game, pending, decision);
    // Saved single-window games remain resumable after the AB update.
    var source = game.pauseState && game.pauseState.godJudgement;
    if (!source || source.actor !== pending.judgementActor || !source.started || source.resolved) return null;
    if (game.phase === 'gameover') return deps.success('游戏结束，取消改判。');
    options = options || {};
    var state = game[pending.actor];
    var skillId = pending.jilueGuicai ? 'jilue'
      : pending.kind === 'guidao-replace' ? 'guidao' : 'guicai';
    if (!state || state.hp <= 0 || !StateRuntime.skillEnabled(state, skillId, game)) return deps.success('改判技能已经失效，继续原判定。');
    var chosen = decision.cardId && (pending.candidates || []).find(function (c) { return c.id === decision.cardId; });
    var ref = chosen && CardRuntime.findCardZone(game, chosen.id);
    var physical = ref && ref.actor === pending.actor && (ref.zone === 'hand'
      ? (state.hand || []).find(function (card) { return card.id === chosen.id; })
      : ref.zone === 'equipment' && state.equipment && state.equipment[ref.slot]);
    if (decision.cardId && (!chosen || !ref || ref.actor !== pending.actor
        || (ref.zone !== 'hand' && !(options.allowEquip && ref.zone === 'equipment'))
        || !physical || (options.requireBlack && StateRuntime.effectiveCardColor(state, physical) !== 'black'))) {
      game.pendingChoice = pending;
      return deps.fail('请选择当前可用于改判的牌。');
    }
    if (decision.cardId) {
      var replacement = CardRuntime.takeCard(game, chosen.id, ref);
      var original = deps.restoreHongyanJudgementView(source.card);
      if (options.gainOriginal) CardRuntime.putCard(game, original, { zone: 'hand', actor: pending.actor });
      else deps.discardCard(game, original);
      source.card = deps.applyHongyanJudgementView(game, source.actor, replacement);
      if (ref.zone === 'equipment') deps.triggerEquipmentLoss(game, pending.actor, replacement);
      deps.log(game, StateRuntime.actorName(game, pending.actor) + '发动【' + (options.skillLabel || '鬼才') + '】更改' + source.reason + '的判定。');
    }
    return deps.success('判定选择已完成。');
  }

  return { register: function (key, callback, options) {
      if (!key || typeof callback !== 'function' || continuations[key]) throw new Error('Invalid or duplicate god judgement continuation: ' + key);
      continuations[key] = { callback: callback, settle: options && options.settle };
    },
    start: function (game, actor, reason, key, context) {
      if (!continuations[key]) throw new Error('Unknown god judgement continuation: ' + key);
      return flows.run(game, 'god-judgement', { actor: actor, reason: reason, key: key, context: context || {} });
    },
    startReplacement: function (game, actor, reason, card) {
      var source = { actor: actor, reason: reason, card: card, started: true, replacementOnly: true, resumeLegacy: false };
      flows.run(game, 'god-judgement', source);
      if (game.pendingChoice) source.resumeLegacy = true;
      return { card: source.resultCard || source.card, suspended: !!game.pendingChoice };
    },
    usesOrderedReplacements: usesOrderedReplacements,
    resolveReplacement: resolveReplacement };
}
