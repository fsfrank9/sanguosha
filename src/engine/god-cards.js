import { SkillRuntime } from './skill-runtime.js';
import { StateRuntime } from './state.js';
import { CardRuntime } from './card-runtime.js';

// AB: the Wind/Forest god cards use the same JSON-safe response frames as
// ordinary card effects. Only revealed cards enter choice payloads; Guixin's
// hand option contains a count, never the opponent's hidden card identities.
export function installGodCardHandlers(skillRegistry, deps) {
  var flows = deps.responseFlows;
  var choices = deps.godChoices;
  var slots = ['weapon', 'armor', 'horseMinus', 'horsePlus'];
  var success = deps.success;
  var fail = deps.fail;
  var name = deps.actorName || StateRuntime.actorName;
  var log = deps.log;

  function alive(game, actor) {
    return game.phase !== 'gameover' && game[actor] && game[actor].hp > 0;
  }
  function enabled(game, actor, skill) {
    return alive(game, actor) && StateRuntime.skillEnabled(game[actor], skill, game);
  }
  function preference(game, actor, skill) {
    return game[actor].skillPreferences && game[actor].skillPreferences[skill];
  }
  function automatic(game, actor, skill) {
    var pref = preference(game, actor, skill);
    return actor !== 'player' || pref === 'auto' || pref === 'always';
  }
  function reject(game, pending, message) {
    game.pendingChoice = pending;
    return fail(message);
  }
  function frame(game, key) {
    return game.pauseState && game.pauseState[key];
  }
  function choose(game, actor, type, config, decision) {
    return choices.request(game, actor, type, config, decision);
  }
  function score(game, actor, card) {
    return deps.scoreCardForAI ? deps.scoreCardForAI(game, actor, card) : 0;
  }
  function uniqueIds(ids) {
    return Array.isArray(ids) && ids.every(function (id, i) {
      return typeof id === 'string' && ids.indexOf(id) === i;
    });
  }

  function discardRevealed(game, source) {
    var cards = source.cards || [];
    source.cards = [];
    cards.forEach(function (card) {
      if (!CardRuntime.findCardZone(game, card)) deps.discardCard(game, card);
    });
  }
  function finishShelie(game, source) {
    flows.finish(game, 'god-shelie', source);
    if (source.advanceTurn && alive(game, source.actor)
        && game.turn === source.actor && game.phase === 'draw') {
      return deps.finishDrawPhaseAndAdvance(game, source.actor);
    }
    return success('涉猎结算完成。');
  }
  function revealShelie(game, source) {
    source.cards = [];
    for (var i = 0; i < 5; i += 1) {
      if (deps.reshuffleIfNeeded) deps.reshuffleIfNeeded(game);
      var card = CardRuntime.takeCard(game, null, { zone: 'deck' });
      if (!card) break;
      source.cards.push(card);
    }
    source.stage = 'pick';
    log(game, name(game, source.actor) + '发动【涉猎】，放弃摸牌，亮出'
      + source.cards.map(function (card) {
        return CardRuntime.suitLabelOf(card) + card.rank + '【' + card.name + '】';
      }).join('、') + '。');
  }
  function bestShelieCards(game, source) {
    var bySuit = {};
    source.cards.forEach(function (card) {
      if (!bySuit[card.suit] || score(game, source.actor, card) > score(game, source.actor, bySuit[card.suit])) {
        bySuit[card.suit] = card;
      }
    });
    return Object.keys(bySuit).map(function (suit) { return bySuit[suit].id; });
  }
  function advanceShelie(game, source) {
    while (!game.pendingChoice && game.phase !== 'gameover') {
      if (!alive(game, source.actor)) {
        discardRevealed(game, source);
        return finishShelie(game, source);
      }
      if (source.stage === 'ask') {
        if (!enabled(game, source.actor, 'shelie')) {
          source.stage = 'normal';
          continue;
        }
        choose(game, source.actor, 'shelie-invoke', {
          skillId: 'shelie', title: '涉猎', prompt: '放弃摸牌，亮出五张牌并获得每种花色各一张？',
          options: [{ id: 'invoke', label: '发动涉猎' }, { id: 'decline', label: '照常摸牌' }],
          auto: automatic(game, source.actor, 'shelie')
        }, { optionId: 'invoke' });
      } else if (source.stage === 'reveal') {
        revealShelie(game, source);
      } else if (source.stage === 'pick') {
        if (!source.cards.length) { source.stage = 'done'; continue; }
        var count = new Set(source.cards.map(function (card) { return card.suit; })).size;
        choose(game, source.actor, 'shelie-pick', {
          skillId: 'shelie', title: '涉猎 · 选择牌',
          prompt: '每种出现的花色必须选择一张，其余置入弃牌堆。',
          cards: source.cards.slice(), cardMin: count, cardMax: count, cardSuitRule: 'distinct',
          auto: automatic(game, source.actor, 'shelie')
        }, { cardIds: bestShelieCards(game, source) });
      } else if (source.stage === 'normal') {
        source.stage = 'done';
        deps.drawCards(game, source.actor, source.drawCount);
      } else {
        return finishShelie(game, source);
      }
    }
    return success('等待涉猎选择。');
  }
  choices.register('shelie-invoke', function (game, pending, decision) {
    var source = frame(game, 'godShelie');
    if (!source || source.stage !== 'ask') return fail('涉猎选择已经失效。');
    if (decision.optionId !== 'invoke' && decision.optionId !== 'decline' && !decision.decline) {
      return reject(game, pending, '请选择发动涉猎或照常摸牌。');
    }
    source.stage = decision.optionId === 'invoke' && !decision.decline
      && enabled(game, source.actor, 'shelie') ? 'reveal' : 'normal';
    return success('已选择涉猎摸牌方式。');
  });
  choices.register('shelie-pick', function (game, pending, decision) {
    var source = frame(game, 'godShelie');
    if (!source || source.stage !== 'pick') return fail('涉猎选牌已经失效。');
    var ids = decision.cardIds;
    var suits = source.cards.map(function (card) { return card.suit; });
    var chosen = uniqueIds(ids) && ids.map(function (id) {
      return source.cards.find(function (card) { return card.id === id; });
    });
    if (!chosen || chosen.some(function (card) { return !card; })
        || chosen.length !== new Set(suits).size
        || new Set(chosen.map(function (card) { return card.suit; })).size !== chosen.length) {
      return reject(game, pending, '请从每种出现的花色中恰好选择一张牌。');
    }
    var revealed = source.cards;
    source.cards = [];
    source.stage = 'done';
    revealed.forEach(function (card) {
      if (alive(game, source.actor) && ids.indexOf(card.id) >= 0) {
        CardRuntime.putCard(game, card, { zone: 'hand', actor: source.actor });
      } else deps.discardCard(game, card);
    });
    return success('已获得涉猎选中的牌。');
  });
  flows.register('god-shelie', { key: 'godShelie', advance: advanceShelie, cancel: discardRevealed });
  function triggerShelie(context) {
    var game = context.game;
    var actor = context.actor;
    if (!enabled(game, actor, 'shelie') || preference(game, actor, 'shelie') === 'decline') return null;
    var source = { actor: actor, drawCount: context.drawCount, stage: 'ask', cards: [], advanceTurn: false };
    flows.run(game, 'god-shelie', source);
    if (game.pendingChoice || frame(game, 'godShelie')) {
      context.godDrawSuspended = true;
      return { suspendedForShelie: true };
    }
    context.drawCount = 0; // synchronous choice already completed either branch
    return { shelieApplied: true };
  }
  function captureShelieDrawCount(game, context) {
    var source = frame(game, 'godShelie');
    if (!source || !context.godDrawSuspended) return false;
    source.drawCount = context.drawCount;
    source.advanceTurn = true;
    return true;
  }

  function gongxinTargets(game, actor) {
    return StateRuntime.seatsFrom(game, actor, false).filter(function (seat) {
      return alive(game, seat) && (game[seat].hand || []).length;
    });
  }
  function viewHand(game, actor) {
    return game[actor].hand.map(function (card) {
      var suit = StateRuntime.effectiveCardSuit(game[actor], card);
      return Object.assign({}, card, { suit: suit, color: suit === 'heart' || suit === 'diamond' ? 'red' : 'black' });
    });
  }
  function advanceGongxin(game, source) {
    while (!game.pendingChoice && game.phase !== 'gameover') {
      if (!alive(game, source.actor)) break;
      if (source.stage === 'target') {
        var targets = gongxinTargets(game, source.actor);
        if (!targets.length || !enabled(game, source.actor, 'gongxin')) break;
        choose(game, source.actor, 'gongxin-target', {
          skillId: 'gongxin', title: '攻心 · 选择目标', prompt: '观看一名其他角色的手牌。',
          targets: targets.map(function (actor) { return { actor: actor, name: name(game, actor) }; }),
          targetMin: 1, targetMax: 1, optional: true,
          auto: automatic(game, source.actor, 'gongxin')
        }, { targetActors: [StateRuntime.perceivedHostileFirstPool(game, source.actor, targets)[0]] });
      } else if (source.stage === 'look') {
        if (!alive(game, source.targetActor) || !game[source.targetActor].hand.length) break;
        var cards = viewHand(game, source.targetActor).map(function (card) {
          return Object.assign(card, { disabled: card.suit !== 'heart' });
        });
        var hearts = cards.filter(function (card) { return card.suit === 'heart'; })
          .sort(function (a, b) { return score(game, source.targetActor, b) - score(game, source.targetActor, a); });
        choose(game, source.actor, 'gongxin-look', {
          skillId: 'gongxin', title: '攻心 · ' + name(game, source.targetActor) + '的手牌',
          prompt: '可展示一张红桃牌，或结束观看。', cards: cards, cardMin: 0, cardMax: 1,
          options: [{ id: 'reveal', label: '展示选中的红桃牌', cardMin: 1 },
            { id: 'decline', label: '结束观看', skipSelection: true }],
          auto: automatic(game, source.actor, 'gongxin')
        }, hearts.length ? { optionId: 'reveal', cardIds: [hearts[0].id] } : { optionId: 'decline' });
      } else if (source.stage === 'move') {
        var card = game[source.targetActor] && game[source.targetActor].hand.find(function (entry) {
          return entry.id === source.cardId;
        });
        if (!card || !alive(game, source.targetActor)) break;
        choose(game, source.actor, 'gongxin-move', {
          skillId: 'gongxin', title: '攻心 · 处理展示牌',
          prompt: name(game, source.targetActor) + '已展示【' + card.name + '】，请选择去向。',
          options: [{ id: 'discard', label: '弃置此牌' }, { id: 'top', label: '置于牌堆顶' }],
          auto: automatic(game, source.actor, 'gongxin')
        }, { optionId: 'discard' });
      } else break;
    }
    if (!game.pendingChoice) flows.finish(game, 'god-gongxin', source);
    return success(game.pendingChoice ? '等待攻心选择。' : '攻心结算完成。');
  }
  function startGongxinTarget(game, source, target) {
    source.targetActor = target;
    source.stage = 'look';
    game[source.actor].flags = game[source.actor].flags || {};
    game[source.actor].flags.gongxinUsed = true;
    log(game, name(game, source.actor) + '发动【攻心】，观看' + name(game, target) + '的手牌。');
  }
  choices.register('gongxin-target', function (game, pending, decision) {
    var source = frame(game, 'godGongxin');
    if (!source || source.stage !== 'target') return fail('攻心目标选择已经失效。');
    if (decision.decline) { source.stage = 'done'; return success('取消攻心。'); }
    var targets = decision.targetActors;
    if (!Array.isArray(targets) || targets.length !== 1 || gongxinTargets(game, source.actor).indexOf(targets[0]) < 0) {
      return reject(game, pending, '请选择一名有手牌的其他角色。');
    }
    if (!enabled(game, source.actor, 'gongxin')) { source.stage = 'done'; return success('攻心已失效。'); }
    startGongxinTarget(game, source, targets[0]);
    return success('已选择攻心目标。');
  });
  choices.register('gongxin-look', function (game, pending, decision) {
    var source = frame(game, 'godGongxin');
    if (!source || source.stage !== 'look') return fail('攻心观看窗口已经失效。');
    if (decision.decline || decision.optionId === 'decline') {
      source.stage = 'done';
      return success('攻心观看结束。');
    }
    var ids = decision.cardIds;
    var card = uniqueIds(ids) && ids.length === 1 && game[source.targetActor]
      && game[source.targetActor].hand.find(function (entry) { return entry.id === ids[0]; });
    if (decision.optionId !== 'reveal' || !card
        || !(pending.cards || []).some(function (entry) { return entry.id === card.id; })
        || StateRuntime.effectiveCardSuit(game[source.targetActor], card) !== 'heart') {
      return reject(game, pending, '只能展示当前手牌中的一张红桃牌。');
    }
    source.cardId = card.id;
    source.stage = 'move';
    log(game, name(game, source.targetActor) + '因【攻心】展示红桃' + card.rank + '【' + card.name + '】。');
    return success('已展示攻心选择的红桃牌。');
  });
  choices.register('gongxin-move', function (game, pending, decision) {
    var source = frame(game, 'godGongxin');
    if (!source || source.stage !== 'move') return fail('攻心处理窗口已经失效。');
    if (decision.optionId !== 'discard' && decision.optionId !== 'top') {
      return reject(game, pending, '请选择弃置或置于牌堆顶。');
    }
    source.stage = 'done';
    if (!alive(game, source.actor) || !alive(game, source.targetActor)) return success('攻心目标已离场。');
    var card = CardRuntime.takeCard(game, source.cardId, { zone: 'hand', actor: source.targetActor });
    if (!card) return success('展示牌已离开手牌区。');
    if (decision.optionId === 'top') CardRuntime.putCard(game, card, { zone: 'deck', position: 'top' });
    else deps.discardCard(game, card);
    if (deps.notifyCardLoss) deps.notifyCardLoss(game, source.targetActor);
    log(game, name(game, source.actor) + '将【攻心】展示的【' + card.name + '】'
      + (decision.optionId === 'top' ? '置于牌堆顶。' : '弃置。'));
    return success('攻心展示牌已处理。');
  });
  flows.register('god-gongxin', { key: 'godGongxin', advance: advanceGongxin });
  function triggerGongxin(context) {
    if (context.skillId !== 'gongxin') return null;
    var game = context.game;
    var actor = context.actor;
    if (!enabled(game, actor, 'gongxin')) return fail('攻心当前不可发动。');
    if (game.turn !== actor || game.phase !== 'play') return fail('攻心只能在自己的出牌阶段发动。');
    if (game[actor].flags && game[actor].flags.gongxinUsed) return fail('攻心出牌阶段限一次。');
    var targets = gongxinTargets(game, actor);
    if (!targets.length) return fail('没有有手牌的其他角色。');
    var source = { actor: actor, stage: 'target' };
    // The ordinary active-skill context supplies a legacy default opponent.
    // Gongxin's optional target wizard must open unless a target was actually
    // requested by the caller.
    var target = context.options && context.options.target;
    if (target) {
      if (targets.indexOf(target) < 0) return fail('攻心须选择有手牌的其他角色。');
      startGongxinTarget(game, source, target);
    }
    return flows.run(game, 'god-gongxin', source);
  }

  function zoneOptions(game, target) {
    var state = game[target];
    if (!state || state.hp <= 0) return [];
    var result = [];
    if (state.hand.length) result.push({ id: 'hand', label: '随机获得一张手牌（共 ' + state.hand.length + ' 张）', zone: 'hand' });
    slots.forEach(function (slot) {
      var card = state.equipment && state.equipment[slot];
      if (card) result.push({ id: 'equipment:' + card.id, label: '装备区 · ' + card.name,
        zone: 'equipment', slot: slot, cardId: card.id });
    });
    (state.judgeArea || []).forEach(function (card) {
      result.push({ id: 'judge:' + card.id, label: '判定区 · ' + card.name, zone: 'judge', cardId: card.id });
    });
    return result;
  }
  function guixinTargets(game, actor) {
    // rule__principle.md:50/54: a multi-target skill settles in action order
    // beginning with the current turn's role, not with the skill's holder.
    return StateRuntime.seatsFrom(game, game.turn || actor, true).filter(function (target) {
      return target !== actor && alive(game, target) && zoneOptions(game, target).length;
    });
  }
  function advanceGuixin(game, source) {
    while (!game.pendingChoice && game.phase !== 'gameover') {
      if (!alive(game, source.actor)) break;
      if (source.stage === 'ask') {
        if (!source.remaining || !enabled(game, source.actor, 'guixin')
            || preference(game, source.actor, 'guixin') === 'decline' || !guixinTargets(game, source.actor).length) break;
        choose(game, source.actor, 'guixin-invoke', {
          skillId: 'guixin', title: '归心', prompt: '获得每名其他角色区域里的一张牌，然后翻面？',
          options: [{ id: 'invoke', label: '发动归心' }, { id: 'decline', label: '不发动此次归心' }],
          auto: automatic(game, source.actor, 'guixin')
        }, { optionId: 'invoke' });
      } else if (source.stage === 'take') {
        while (source.index < source.targets.length && !zoneOptions(game, source.targets[source.index]).length) source.index += 1;
        if (source.index >= source.targets.length) {
          source.stage = 'flip';
          continue;
        }
        var target = source.targets[source.index];
        var options = zoneOptions(game, target);
        // Picking from a hand is always random. AI only compares public zones;
        // it can remove a delayed trick from an ally without peeking at hands.
        var autoOption = !StateRuntime.perceivedHostile(game, source.actor, target)
          && options.find(function (option) { return option.zone === 'judge'; });
        choose(game, source.actor, 'guixin-card', {
          skillId: 'guixin', title: '归心 · ' + name(game, target),
          prompt: '从该角色的手牌区、装备区或判定区获得一张牌。',
          options: options, auto: automatic(game, source.actor, 'guixin')
        }, { optionId: (autoOption || options[0]).id });
      } else if (source.stage === 'flip') {
        source.stage = 'ask';
        game[source.actor].turnedOver = !game[source.actor].turnedOver;
        log(game, name(game, source.actor) + '因【归心】'
          + (game[source.actor].turnedOver ? '翻面。' : '翻回正面。'));
      } else break;
    }
    if (!game.pendingChoice) flows.finish(game, 'god-guixin', source);
    return success(game.pendingChoice ? '等待归心选择。' : '归心结算完成。');
  }
  choices.register('guixin-invoke', function (game, pending, decision) {
    var source = frame(game, 'godGuixin');
    if (!source || source.stage !== 'ask') return fail('归心选择已经失效。');
    if (decision.optionId !== 'invoke' && decision.optionId !== 'decline' && !decision.decline) {
      return reject(game, pending, '请选择是否发动此次归心。');
    }
    source.remaining -= 1;
    if (decision.optionId !== 'invoke' || decision.decline || !enabled(game, source.actor, 'guixin')) {
      return success('此次归心不发动。');
    }
    source.targets = guixinTargets(game, source.actor);
    source.index = 0;
    source.stage = 'take';
    return success('归心开始获得牌。');
  });
  choices.register('guixin-card', function (game, pending, decision) {
    var source = frame(game, 'godGuixin');
    if (!source || source.stage !== 'take') return fail('归心选牌已经失效。');
    var target = source.targets[source.index];
    var option = zoneOptions(game, target).find(function (entry) { return entry.id === decision.optionId; });
    if (!option || !(pending.options || []).some(function (entry) { return entry.id === option.id; })) {
      return reject(game, pending, '请选择该角色当前区域内的一张牌。');
    }
    source.index += 1; // pay before equipment/hand loss opens a nested window
    if (!alive(game, source.actor)) return success('归心角色已离场。');
    var selected = option.zone === 'hand'
      ? game[target].hand[deps.randomHandIndex(game, game[target])].id : option.cardId;
    var gained = CardRuntime.takeCard(game, selected, {
      zone: option.zone === 'judge' ? 'judgeArea' : option.zone, actor: target, slot: option.slot
    });
    if (gained) {
      // Finish the physical transfer before loss effects. In particular, a
      // nested death cannot leave this card in transit or add it to a corpse
      // after that corpse's card cleanup has already run.
      CardRuntime.putCard(game, gained, { zone: 'hand', actor: source.actor });
      log(game, name(game, source.actor) + '发动【归心】，获得' + name(game, target) + '的一张'
        + (option.zone === 'hand' ? '手牌' : option.zone === 'equipment' ? '装备区牌' : '判定区牌') + '。');
      if (option.zone === 'equipment' && deps.triggerEquipmentLoss) deps.triggerEquipmentLoss(game, target, gained);
      if (deps.notifyCardLoss) deps.notifyCardLoss(game, target);
    }
    return success('归心已获得该角色的一张牌。');
  });
  flows.register('god-guixin', { key: 'godGuixin', advance: advanceGuixin });
  function triggerGuixin(context) {
    var actor = context.targetActor;
    if (!enabled(context.game, actor, 'guixin') || context.amount <= 0) return null;
    return flows.run(context.game, 'god-guixin', { actor: actor, remaining: context.amount, stage: 'ask' });
  }

  SkillRuntime.registerSkill(skillRegistry, 'shelie', { onDrawPhase: triggerShelie });
  SkillRuntime.registerSkill(skillRegistry, 'gongxin', { onActiveSkill: triggerGongxin });
  SkillRuntime.registerSkill(skillRegistry, 'guixin', { onDamageAfter: triggerGuixin });
  SkillRuntime.registerSkill(skillRegistry, 'feiying', {});
  function runAIActiveSkills(game, actor) {
    if (!enabled(game, actor, 'gongxin') || game.pendingChoice || game.turn !== actor || game.phase !== 'play'
        || game[actor].flags && game[actor].flags.gongxinUsed
        || preference(game, actor, 'gongxin') === 'decline') return null;
    var targets = StateRuntime.perceivedHostileFirstPool(game, actor, gongxinTargets(game, actor));
    targets.sort(function (a, b) { return game[b].hand.length - game[a].hand.length; });
    if (!targets.length) return null;
    var preferences = game[actor].skillPreferences || (game[actor].skillPreferences = {});
    var previous = preferences.gongxin;
    preferences.gongxin = 'auto';
    var result;
    try {
      result = deps.useSkill(game, actor, 'gongxin', [], { target: targets[0] });
    } finally {
      if (previous === undefined) delete preferences.gongxin;
      else preferences.gongxin = previous;
    }
    return { acted: !!(result && result.ok), result: result };
  }
  return { captureShelieDrawCount: captureShelieDrawCount, runAIActiveSkills: runAIActiveSkills };
}
