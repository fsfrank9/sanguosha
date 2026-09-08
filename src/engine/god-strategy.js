import { CardRuntime } from './card-runtime.js';
import { SkillRuntime } from './skill-runtime.js';
import { StateRuntime } from './state.js';
import { SKILL_METADATA } from '../data/heroes.js';

// AB: stars are physical cards in a private, persistent zone. Marks and
// weather records contain identifiers only, and all suspended work is JSON.
export function installGodStrategyHandlers(skillRegistry, deps) {
  var flows = deps.responseFlows;
  var choices = deps.godChoices;
  var ok = deps.success || function (message) { return { ok: true, message: message }; };
  var fail = deps.fail || function (message) { return { ok: false, message: message }; };
  var log = deps.log;
  var name = StateRuntime.actorName;
  var enabled = StateRuntime.skillEnabled;
  var slots = ['weapon', 'armor', 'horseMinus', 'horsePlus'];

  function marks(state) { return state.godMarks || (state.godMarks = {}); }
  function nin(state) { return Math.max(0, Number(state && state.godMarks && state.godMarks.nin) || 0); }
  function canJilue(game, actor) {
    return !!(game[actor] && game[actor].hp > 0 && enabled(game[actor], 'jilue', game) && nin(game[actor]) > 0);
  }
  function payNin(game, actor, mode) {
    if (!canJilue(game, actor)) return false;
    marks(game[actor]).nin = nin(game[actor]) - 1;
    log(game, name(game, actor) + '发动【极略·' + mode + '】，弃置一枚“忍”。');
    return true;
  }
  function cardView(card) {
    return { id: card.id, type: card.type, name: card.name, suit: card.suit,
      rank: card.rank, color: card.color, family: card.family };
  }
  function views(cards) { return (cards || []).map(cardView); }
  function scored(game, actor, cards, descending) {
    return cards.slice().sort(function (a, b) {
      var scoreA = deps.scoreCardForAI ? deps.scoreCardForAI(game, actor, a) : (a.type === 'tao' ? 10 : a.type === 'shan' ? 6 : 3);
      var scoreB = deps.scoreCardForAI ? deps.scoreCardForAI(game, actor, b) : (b.type === 'tao' ? 10 : b.type === 'shan' ? 6 : 3);
      return descending ? scoreB - scoreA : scoreA - scoreB;
    });
  }
  function targets(game, actor, otherOnly) {
    return StateRuntime.aliveSeats(game).filter(function (seat) { return !otherOnly || seat !== actor; })
      .map(function (seat) { return { actor: seat, name: name(game, seat) }; });
  }
  function ownCards(game, actor) {
    var state = game[actor];
    var result = (state.hand || []).map(function (card) { return { card: card, ref: { zone: 'hand', actor: actor } }; });
    slots.forEach(function (slot) {
      var card = state.equipment && state.equipment[slot];
      if (card) result.push({ card: card, ref: { zone: 'equipment', actor: actor, slot: slot } });
    });
    return result;
  }
  function distinct(ids) { return Array.isArray(ids) && new Set(ids).size === ids.length; }
  function idsPresent(cards, ids) {
    return distinct(ids) && ids.every(function (id) { return cards.some(function (card) { return card.id === id; }); });
  }
  function restoreChoice(game, pending, message) {
    game.pendingChoice = pending;
    return fail(message);
  }
  function request(game, actor, type, config, ai) {
    if (type === 'god-weather-order') {
      var prefs = game[actor].skillPreferences || {};
      config.auto = ['auto', 'always', 'decline'].indexOf(prefs.kuangfeng) >= 0
        && ['auto', 'always', 'decline'].indexOf(prefs.dawu) >= 0;
    }
    return choices.request(game, actor, type, config, ai);
  }

  function beginInitialHand(game, actor) {
    var state = game[actor];
    if (!state || !enabled(state, 'qixing', game)) return null;
    state.stars = state.stars || [];
    for (var i = 0; i < 11; i += 1) {
      deps.reshuffleIfNeeded(game);
      var card = CardRuntime.takeCard(game, null, { zone: 'deck', position: 'top' });
      if (!card) break;
      CardRuntime.putCard(game, card, { zone: 'stars', actor: actor });
    }
    var count = Math.min(4, state.stars.length);
    if (!count) return ok('牌堆没有可分配的牌。');
    return request(game, actor, 'qixing-initial', {
      skillId: 'qixing', title: '七星', prompt: '从观看的牌中选择四张作为起始手牌，其余成为“星”。',
      cards: views(state.stars), cardMin: count, cardMax: count, optional: false
    }, { cardIds: scored(game, actor, state.stars, true).slice(0, count).map(function (card) { return card.id; }) });
  }
  choices.register('qixing-initial', function (game, pending, decision) {
    var state = game[pending.actor];
    var ids = decision.cardIds || [];
    var count = Math.min(4, (state.stars || []).length);
    if (ids.length !== count || !idsPresent(state.stars || [], ids)) return restoreChoice(game, pending, '请选择四张不同的起始手牌。');
    ids.forEach(function (id) { CardRuntime.moveCard(game, id, { zone: 'stars', actor: pending.actor }, { zone: 'hand', actor: pending.actor }); });
    log(game, name(game, pending.actor) + '以【七星】分配起始手牌，留下 ' + state.stars.length + ' 张“星”。');
    return ok('七星起始分配完成。');
  });

  function beginDrawPhaseEnd(game, actor) {
    var state = game[actor];
    if (!state || !enabled(state, 'qixing', game) || !state.hand.length || !(state.stars || []).length) return null;
    var count = Math.min(state.hand.length, state.stars.length);
    var handLow = scored(game, actor, state.hand, false);
    var starsHigh = scored(game, actor, state.stars, true);
    var desired = [];
    var removed = [];
    for (var i = 0; i < count; i += 1) {
      var handScore = deps.scoreCardForAI ? deps.scoreCardForAI(game, actor, handLow[i]) : 0;
      var starScore = deps.scoreCardForAI ? deps.scoreCardForAI(game, actor, starsHigh[i]) : 0;
      if (starScore > handScore) { desired.push(starsHigh[i].id); removed.push(handLow[i].id); }
    }
    return request(game, actor, 'qixing-exchange', {
      skillId: 'qixing', title: '七星换牌', prompt: '选择等量的手牌和“星”交换，也可以放弃。',
      cards: views(state.hand), cardMin: 1, cardMax: count,
      starCards: views(state.stars), starMin: 1, starMax: count, equalCardStarCount: true, optional: true
    }, desired.length ? { cardIds: removed, starIds: desired } : { decline: true });
  }
  choices.register('qixing-exchange', function (game, pending, decision) {
    if (decision.decline) return ok('不交换七星。');
    var state = game[pending.actor];
    var handIds = decision.cardIds || [];
    var starIds = decision.starIds || [];
    if (!handIds.length || handIds.length !== starIds.length || !idsPresent(state.hand, handIds)
        || !idsPresent(state.stars || [], starIds)) return restoreChoice(game, pending, '须选择相同数量的不同手牌与“星”。');
    // Remove both complete sets before placing either set. Their identifiers
    // were checked against the live zones, so neither side can pay twice.
    var handCards = handIds.map(function (id) { return CardRuntime.takeCard(game, id, { zone: 'hand', actor: pending.actor }); });
    var starCards = starIds.map(function (id) { return CardRuntime.takeCard(game, id, { zone: 'stars', actor: pending.actor }); });
    handCards.forEach(function (card) { CardRuntime.putCard(game, card, { zone: 'stars', actor: pending.actor }); });
    starCards.forEach(function (card) { CardRuntime.putCard(game, card, { zone: 'hand', actor: pending.actor }); });
    log(game, name(game, pending.actor) + '发动【七星】，交换 ' + handIds.length + ' 张手牌与“星”。');
    return ok('七星换牌完成。');
  });

  function weather(game) { return game.godWeather || (game.godWeather = { kuangfeng: [], dawu: [] }); }
  function clearWeather(game, actor) {
    if (!game.godWeather) return;
    ['kuangfeng', 'dawu'].forEach(function (skill) {
      game.godWeather[skill] = (game.godWeather[skill] || []).filter(function (entry) { return entry.source !== actor; });
    });
  }
  function modifyFog(context) {
    var game = context.game;
    var protectedByFog = game.godWeather && (game.godWeather.dawu || []).some(function (entry) { return entry.target === context.targetActor; });
    if (!protectedByFog || context.nature === 'thunder') return null;
    context.amount = 0;
    context.prevented = true;
    log(game, name(game, context.targetActor) + '受【大雾】保护，防止此次非雷电伤害。');
    return { prevented: true };
  }
  function modifyWind(context) {
    var game = context.game;
    if (!game.godWeather || context.nature !== 'fire' || context.prevented) return null;
    var extra = (game.godWeather.kuangfeng || []).filter(function (entry) { return entry.target === context.targetActor; }).length;
    if (!extra) return null;
    context.amount += extra;
    log(game, name(game, context.targetActor) + '受【狂风】影响，此次火焰伤害 +' + extra + '。');
    return { added: extra };
  }
  function modifyWeather(context) {
    return modifyFog(context) || modifyWind(context);
  }
  function beginEndPhase(game, actor) {
    var state = game[actor];
    if (!state || !(state.stars || []).length || (!enabled(state, 'kuangfeng', game) && !enabled(state, 'dawu', game))) return null;
    return flows.run(game, 'god-weather', { actor: actor, used: [] });
  }
  function advanceWeather(game, source) {
    var state = game[source.actor];
    if (!state || state.hp <= 0 || !(state.stars || []).length) { flows.finish(game, 'god-weather', source); return ok('天气技能结算完成。'); }
    var options = ['kuangfeng', 'dawu'].filter(function (skill) { return source.used.indexOf(skill) < 0 && enabled(state, skill, game); })
      .map(function (id) { return { id: id, label: id === 'kuangfeng' ? '狂风' : '大雾' }; });
    if (!options.length || source.done) { flows.finish(game, 'god-weather', source); return ok('天气技能结算完成。'); }
    options.push({ id: 'finish', label: '结束选择' });
    var preferred = options.some(function (option) { return option.id === 'dawu'; }) ? 'dawu' : 'kuangfeng';
    return request(game, source.actor, 'god-weather-order', {
      title: '结束阶段技能', prompt: '选择本次发动的技能；两项技能可以自行决定先后顺序。',
      options: options, optional: false
    }, { optionId: preferred });
  }
  flows.register('god-weather', { key: 'godWeatherFlow', advance: advanceWeather });
  choices.register('god-weather-order', function (game, pending, decision) {
    var source = game.pauseState.godWeatherFlow;
    if (!source || source.actor !== pending.actor) return fail('找不到天气技能时机。');
    var skill = decision.optionId;
    if (skill === 'finish') { source.done = true; return flows.run(game, 'god-weather', source); }
    if (['kuangfeng', 'dawu'].indexOf(skill) < 0 || source.used.indexOf(skill) >= 0 || !enabled(game[pending.actor], skill, game)) {
      return restoreChoice(game, pending, '请选择尚未发动的天气技能。');
    }
    var state = game[pending.actor];
    var maximum = skill === 'kuangfeng' ? 1 : Math.min(state.stars.length, StateRuntime.aliveSeats(game).length);
    var legal = targets(game, pending.actor, false);
    var preferred = skill === 'dawu' ? pending.actor : StateRuntime.perceivedHostileFirstPool(game, pending.actor,
      legal.map(function (entry) { return entry.actor; }).filter(function (actor) { return actor !== pending.actor; }))[0];
    return request(game, pending.actor, 'god-weather-targets', {
      skillId: skill, title: skill === 'kuangfeng' ? '狂风' : '大雾',
      prompt: skill === 'kuangfeng' ? '弃置一张“星”，指定一名角色受到更多火焰伤害。' : '弃置任意数量的“星”，保护相同数量的角色免受非雷电伤害。',
      starCards: views(state.stars), starMin: 1, starMax: maximum,
      targets: legal, targetMin: 1, targetMax: maximum, equalStarTargetCount: true, optional: true
    }, preferred ? { starIds: [scored(game, pending.actor, state.stars, false)[0].id], targetActors: [preferred] } : { decline: true });
  });
  choices.register('god-weather-targets', function (game, pending, decision) {
    var source = game.pauseState.godWeatherFlow;
    var state = game[pending.actor];
    var skill = pending.skillId;
    if (!source || source.actor !== pending.actor) return fail('找不到天气技能时机。');
    if (decision.decline) { source.used.push(skill); return flows.run(game, 'god-weather', source); }
    var ids = decision.starIds || [];
    var targetActors = decision.targetActors || [];
    if (!ids.length || ids.length !== targetActors.length || !idsPresent(state.stars || [], ids) || !distinct(targetActors)
        || targetActors.some(function (actor) { return !game[actor] || game[actor].hp <= 0; })
        || (skill === 'kuangfeng' && ids.length !== 1) || source.used.indexOf(skill) >= 0 || !enabled(state, skill, game)) {
      return restoreChoice(game, pending, '星与目标必须等量，目标和星均不可重复。');
    }
    source.used.push(skill);
    ids.forEach(function (id) { CardRuntime.moveCard(game, id, { zone: 'stars', actor: pending.actor }, { zone: 'discard' }); });
    var records = weather(game)[skill];
    targetActors.forEach(function (actor) { records.push({ source: pending.actor, target: actor }); });
    log(game, name(game, pending.actor) + '发动【' + (skill === 'kuangfeng' ? '狂风' : '大雾') + '】，指定' + targetActors.map(function (actor) { return name(game, actor); }).join('、') + '。');
    return flows.run(game, 'god-weather', source);
  });

  function renjieDamage(context) {
    var state = context.game[context.targetActor];
    if (!state || state.hp <= 0 || !enabled(state, 'renjie', context.game) || context.amount <= 0) return null;
    marks(state).nin = nin(state) + context.amount;
    log(context.game, name(context.game, context.targetActor) + '因【忍戒】获得 ' + context.amount + ' 枚“忍”。');
    return { ninGained: context.amount };
  }
  function recordDiscard(game, actor, handCards) {
    var state = game[actor];
    if (!state || game.turn !== actor || game.phase !== 'discard' || !enabled(state, 'renjie', game)) return null;
    var count = new Set((handCards || []).map(function (card) { return card.id; })).size;
    if (!count) return null;
    marks(state).nin = nin(state) + count;
    log(game, name(game, actor) + '因【忍戒】弃牌获得 ' + count + ' 枚“忍”。');
    return { ninGained: count };
  }
  function baiyin(context) {
    var game = context.game;
    var state = game[context.actor];
    if (!state || !enabled(state, 'baiyin', game) || state.hp <= 0 || nin(state) < 4) return null;
    state.flags = state.flags || {};
    if (state.flags.baiyinAwakened) return null;
    state.flags.baiyinAwakened = true;
    state.maxHp = Math.max(0, state.maxHp - 1);
    state.hp = Math.min(state.hp, state.maxHp);
    StateRuntime.grantSkill(state, 'jilue', '极略', SKILL_METADATA.jilue);
    log(game, name(game, context.actor) + '触发【拜印】，减一点体力上限并获得【极略】。');
    if (state.hp <= 0) deps.enterDying(game, context.actor);
    return { awakened: 'baiyin' };
  }

  function beforeCardUse(game, actor, card) {
    if (!canJilue(game, actor) || !card || (card.family !== 'trick' && card.family !== 'delayed')) return null;
    return request(game, actor, 'jilue-jizhi', {
      skillId: 'jilue', title: '极略·集智', prompt: '是否弃置一枚“忍”摸一张牌？',
      options: [{ id: 'invoke', label: '弃一忍，摸一牌' }], optional: true
    }, { optionId: 'invoke' });
  }
  choices.register('jilue-jizhi', function (game, pending, decision) {
    if (decision.decline || !canJilue(game, pending.actor)) return ok('不发动极略·集智。');
    if (decision.optionId !== 'invoke') return restoreChoice(game, pending, '请选择是否发动集智。');
    payNin(game, pending.actor, '集智');
    deps.drawCards(game, pending.actor, 1);
    return ok('极略·集智结算完成。');
  });
  function jilueDamage(context) {
    var game = context.game;
    var actor = context.targetActor;
    if (!canJilue(game, actor) || context.amount <= 0) return null;
    var legal = targets(game, actor, true);
    if (!legal.length) return null;
    var candidates = legal.map(function (entry) { return entry.actor; }).filter(function (seat) { return !game[seat].turnedOver; });
    var hostile = StateRuntime.perceivedHostileFirstPool(game, actor, candidates);
    return request(game, actor, 'jilue-fangzhu', {
      skillId: 'jilue', title: '极略·放逐', prompt: '弃一枚“忍”，令另一名角色摸已损失体力值张牌，然后翻面。',
      targets: legal, targetMin: 1, targetMax: 1, optional: true
    }, hostile.length ? { targetActors: [hostile[0]] } : { decline: true });
  }
  choices.register('jilue-fangzhu', function (game, pending, decision) {
    if (decision.decline || !canJilue(game, pending.actor)) return ok('不发动极略·放逐。');
    var actor = (decision.targetActors || [])[0];
    if (!actor || actor === pending.actor || !game[actor] || game[actor].hp <= 0 || decision.targetActors.length !== 1) {
      return restoreChoice(game, pending, '请选择一名其他存活角色。');
    }
    var lost = Math.max(0, game[pending.actor].maxHp - game[pending.actor].hp);
    payNin(game, pending.actor, '放逐');
    deps.drawCards(game, actor, lost);
    game[actor].turnedOver = !game[actor].turnedOver;
    log(game, name(game, actor) + '因【极略·放逐】摸 ' + lost + ' 张牌并翻面。');
    return ok('极略·放逐结算完成。');
  });

  function startJilueActive(game, actor, mode, cardIds) {
    var state = game[actor];
    if (!canJilue(game, actor) || game.turn !== actor || game.phase !== 'play') return fail('极略只能在出牌阶段消耗忍发动。');
    state.flags = state.flags || {};
    if (mode === 'wansha') {
      payNin(game, actor, '完杀');
      StateRuntime.activateSkillSource(state, 'jilue-wansha', Object.assign({}, SKILL_METADATA.wansha, { id: 'wansha', name: '完杀' }));
      return ok('极略·完杀生效至本回合结束。');
    }
    if (mode === 'zhiheng') {
      if (state.flags.jilueZhihengUsed) return fail('极略·制衡每个出牌阶段限一次。');
      var available = ownCards(game, actor);
      if (!available.length) return fail('没有可用于制衡的手牌或装备牌。');
      if (!cardIds || !cardIds.length) {
        var low = scored(game, actor, available.map(function (entry) { return entry.card; }), false);
        return request(game, actor, 'jilue-zhiheng', {
          skillId: 'jilue', title: '极略·制衡', prompt: '弃一枚忍并弃置选中的手牌或装备牌，再摸等量牌。',
          cards: views(available.map(function (entry) { return entry.card; })), cardMin: 1, cardMax: available.length, optional: true
        }, { cardIds: [low[0].id] });
      }
      if (!idsPresent(available.map(function (entry) { return entry.card; }), cardIds)) return fail('制衡必须选择不同的现有手牌或装备牌。');
      payNin(game, actor, '制衡');
      state.flags.jilueZhihengUsed = true;
      var selected = cardIds.map(function (id) { return available.find(function (entry) { return entry.card.id === id; }); });
      var paid = selected.map(function (entry) { return CardRuntime.takeCard(game, entry.card.id, entry.ref); });
      // The saved flow contains equipment IDs only; paid cards already enter
      // discard before equipment-loss triggers are allowed to open a window.
      paid.forEach(function (card) { CardRuntime.putCard(game, card, { zone: 'discard' }); });
      return flows.run(game, 'jilue-zhiheng', { actor: actor, count: paid.length,
        equipmentIds: selected.filter(function (entry) { return entry.ref.zone === 'equipment'; }).map(function (entry) { return entry.card.id; }), idx: 0 });
    }
    if (mode) return fail('未知的极略效果。');
    var options = [{ id: 'wansha', label: '完杀：本回合限制救援' }];
    if (!state.flags.jilueZhihengUsed && ownCards(game, actor).length) options.unshift({ id: 'zhiheng', label: '制衡：弃置并摸等量牌' });
    return request(game, actor, 'jilue-mode', {
      skillId: 'jilue', title: '极略', prompt: '选择消耗一枚“忍”发动的效果。', options: options, optional: true
    }, { optionId: options[0].id });
  }
  choices.register('jilue-mode', function (game, pending, decision) {
    if (decision.decline) return ok('不发动极略。');
    if (!decision.optionId || !(pending.options || []).some(function (entry) { return entry.id === decision.optionId; })) {
      return restoreChoice(game, pending, '请选择当前可用的极略效果。');
    }
    return startJilueActive(game, pending.actor, decision.optionId);
  });
  choices.register('jilue-zhiheng', function (game, pending, decision) {
    if (decision.decline) return ok('不发动极略·制衡。');
    if (!Array.isArray(decision.cardIds) || !decision.cardIds.length) return restoreChoice(game, pending, '请选择至少一张用于制衡的牌。');
    var result = startJilueActive(game, pending.actor, 'zhiheng', decision.cardIds);
    if (result && result.ok === false) game.pendingChoice = pending;
    return result;
  });
  flows.register('jilue-zhiheng', { key: 'jilueZhiheng', advance: function (game, source) {
    while (source.idx < source.equipmentIds.length) {
      var id = source.equipmentIds[source.idx++];
      var card = game.discard.find(function (entry) { return entry.id === id; });
      if (card) deps.triggerEquipmentLoss(game, source.actor, card);
      if (game.pendingChoice) return { ok: true, suspended: true };
      if (game.phase === 'gameover') break;
    }
    flows.finish(game, 'jilue-zhiheng', source);
    if (game.phase !== 'gameover' && game[source.actor].hp > 0) deps.drawCards(game, source.actor, source.count);
    return ok('极略·制衡结算完成。');
  } });

  function runAIActiveSkills(game, actor) {
    if (game.phase !== 'play' || game.turn !== actor || game.pendingChoice || !canJilue(game, actor)) return { acted: false };
    var state = game[actor];
    var hostile = targets(game, actor, true).map(function (entry) { return entry.actor; });
    hostile = StateRuntime.perceivedHostileFirstPool(game, actor, hostile);
    var hasAttack = (state.hand || []).some(function (card) { return CardRuntime.isShaCard(card)
      || ['juedou', 'nanman', 'wanjian', 'huogong'].indexOf(card.type) >= 0; });
    if (!enabled(state, 'wansha', game) && hasAttack && hostile.some(function (seat) { return game[seat].hp <= 2; })) {
      return { acted: true, result: startJilueActive(game, actor, 'wansha') };
    }
    if (!(state.flags && state.flags.jilueZhihengUsed)) {
      // Spend only excess low-value hand cards. Equipment already installed
      // contributes to survival and is not discarded merely to exercise AI.
      var keepSha = false;
      var keepShan = false;
      var candidates = (state.hand || []).filter(function (card) {
        if (CardRuntime.isShaCard(card)) { if (!keepSha && !state.usedSha) { keepSha = true; return false; } return true; }
        if (card.type === 'shan') { if (!keepShan) { keepShan = true; return false; } return true; }
        return card.type === 'jiu' && state.flags && state.flags.jiuUsedThisTurn;
      });
      if (candidates.length) return { acted: true, result: startJilueActive(game, actor, 'zhiheng', candidates.map(function (card) { return card.id; })) };
    }
    return { acted: false };
  }

  function recordDeath(game, deadActor, killerActor) {
    clearWeather(game, deadActor);
    if (game.godTurnEnded || !game.turn || game.phase === 'between-turns' || game.phase === 'setup' || !killerActor
        || killerActor === deadActor || !game[killerActor]) return;
    game.godTurnKills = game.godTurnKills || {};
    game.godTurnKills[killerActor] = (game.godTurnKills[killerActor] || 0) + 1;
  }
  function resetTurn(game, actor) {
    game.godTurnKills = {};
    game.godTurnEnded = false;
    clearWeather(game, actor);
    StateRuntime.seatList(game).forEach(function (seat) {
      if (game[seat]) StateRuntime.clearSkillSource(game[seat], 'jilue-wansha');
    });
    if (game[actor]) {
      game[actor].flags = game[actor].flags || {};
      game[actor].flags.jilueZhihengUsed = false;
    }
  }
  function afterTurnEnd(context) {
    var game = context.game;
    var actor = context.actor;
    if (!game[actor] || game[actor].hp <= 0 || !enabled(game[actor], 'lianpo', game)
        || !(game.godTurnKills && game.godTurnKills[actor])) return null;
    // Consume this ended-turn opportunity before a nested choice. An extra
    // turn has an independent kill ledger installed by resetTurn.
    delete game.godTurnKills[actor];
    return request(game, actor, 'lianpo-extra-turn', {
      skillId: 'lianpo', title: '连破', prompt: '本回合击杀过角色，是否获得一个额外回合？',
      options: [{ id: 'invoke', label: '获得额外回合' }], optional: true
    }, { optionId: 'invoke' });
  }
  choices.register('lianpo-extra-turn', function (game, pending, decision) {
    if (decision.decline || !game[pending.actor] || game[pending.actor].hp <= 0
        || !enabled(game[pending.actor], 'lianpo', game)) return ok('不发动连破。');
    if (decision.optionId !== 'invoke') return restoreChoice(game, pending, '请选择是否发动连破。');
    game.pendingExtraTurns = game.pendingExtraTurns || [];
    game.pendingExtraTurns.push(pending.actor);
    log(game, name(game, pending.actor) + '发动【连破】，获得一个额外回合。');
    return ok('连破额外回合已加入队列。');
  });
  if (deps.registerBoundaryHook) deps.registerBoundaryHook('onAfterTurnEnd', 'lianpo', afterTurnEnd);

  SkillRuntime.registerSkill(skillRegistry, 'qixing', {
    onInitialHand: function (context) { return beginInitialHand(context.game, context.actor); },
    onDrawPhaseEnd: function (context) { return beginDrawPhaseEnd(context.game, context.actor); }
  });
  // Each registered weather hook performs its own real modifier. The engine
  // calls modifyWeather once to enforce prevention before amplification.
  SkillRuntime.registerSkill(skillRegistry, 'kuangfeng', { onDamageBegin: modifyWind });
  SkillRuntime.registerSkill(skillRegistry, 'dawu', { onDamageBegin: modifyFog });
  SkillRuntime.registerSkill(skillRegistry, 'renjie', {
    onDamageAfter: renjieDamage,
    onDiscardPhaseLoss: function (context) { return recordDiscard(context.game, context.actor, context.cards); }
  });
  SkillRuntime.registerSkill(skillRegistry, 'baiyin', { onPreparePhase: baiyin });
  SkillRuntime.registerSkill(skillRegistry, 'jilue', {
    // The paid Guicai alternative is dispatched by the native ordered holder
    // scan in skills.js; it is never granted as an unconditional skill.
    onDamageAfter: jilueDamage,
    onCardUse: function (context) { return context.godTiming ? beforeCardUse(context.game, context.actor, context.card) : null; },
    onActiveSkill: function (context) {
      return context.skillId === 'jilue' ? startJilueActive(context.game, context.actor, context.options.mode, context.cardIds) : null;
    }
  });
  SkillRuntime.registerSkill(skillRegistry, 'lianpo', {
    onAfterTurnEnd: afterTurnEnd
  });
  return { beginInitialHand: beginInitialHand, beginDrawPhaseEnd: beginDrawPhaseEnd,
    beginEndPhase: beginEndPhase, beforeCardUse: beforeCardUse,
    modifyWeather: modifyWeather, recordDiscard: recordDiscard, recordDeath: recordDeath,
    clearWeather: clearWeather, resetTurn: resetTurn, afterTurnEnd: afterTurnEnd, runAIActiveSkills: runAIActiveSkills };
}
