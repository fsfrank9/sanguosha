import { SkillRuntime } from './skill-runtime.js';
import { StateRuntime } from './state.js';
import { CardRuntime } from './card-runtime.js';

// AB: 火 LE003 神周瑜、林 LE006 神吕布。All multi-player effects have
// an explicit program counter, so a rescue, Tianxiang or equipment-loss ask
// resumes the paid effect without repeating a target or a cost.
export function installGodWrathHandlers(skillRegistry, deps) {
  var flows = deps.responseFlows;
  var choices = deps.godChoices;
  var slots = ['weapon', 'armor', 'horsePlus', 'horseMinus'];
  var names = { qinyin: '琴音', yeyan: '业炎', shenfen: '神愤', wuqian: '无前', wumou: '无谋' };

  function ok(message) { return deps.success(message || '技能结算完成。'); }
  function reject(game, pending, message) {
    if (pending) game.pendingChoice = pending;
    return deps.fail(message);
  }
  function living(game, actor) { return !!(game[actor] && game[actor].hp > 0); }
  function enabled(game, actor, id) {
    return living(game, actor) && StateRuntime.skillEnabled(game[actor], id, game);
  }
  function marks(state) { return state.godMarks || (state.godMarks = {}); }
  function rage(state) { return Number(state && state.godMarks && state.godMarks.rage) || 0; }
  function flags(state) { return state.flags || (state.flags = {}); }
  function actorName(game, actor) { return StateRuntime.actorName(game, actor); }
  function log(game, text) { deps.log(game, text); }
  function actionOrder(game, includeSelf, actor) {
    return StateRuntime.seatsFrom(game, game.turn || actor, true).filter(function (seat) {
      return living(game, seat) && (includeSelf || seat !== actor);
    });
  }
  function targetOptions(game, actor, includeSelf) {
    return actionOrder(game, includeSelf, actor).map(function (seat) {
      return { actor: seat, name: actorName(game, seat) };
    });
  }
  function hostile(game, actor, other) {
    if (actor === other) return -1;
    return StateRuntime.perceivedHostile(game, actor, other) ? 1 : -1;
  }
  function handCards(game, actor, ids) {
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length) return null;
    var hand = game[actor] && game[actor].hand || [];
    var result = ids.map(function (id) { return hand.find(function (card) { return card.id === id; }); });
    return result.every(Boolean) ? result : null;
  }
  function fourSuits(game, actor, ids) {
    var cards = handCards(game, actor, ids);
    return !!(cards && cards.length === 4 && cards.every(function (card) {
      return ['spade', 'heart', 'club', 'diamond'].indexOf(StateRuntime.effectiveCardSuit(game[actor], card)) >= 0;
    }) && new Set(cards.map(function (card) {
      return StateRuntime.effectiveCardSuit(game[actor], card);
    })).size === 4);
  }
  function findFourSuits(game, actor) {
    var found = {};
    (game[actor].hand || []).forEach(function (card) {
      var suit = StateRuntime.effectiveCardSuit(game[actor], card);
      if (['spade', 'heart', 'club', 'diamond'].indexOf(suit) >= 0 && !found[suit]) found[suit] = card.id;
    });
    return Object.keys(found).length === 4 ? Object.keys(found).map(function (suit) { return found[suit]; }) : [];
  }
  function discardHands(game, actor, ids) {
    // Lock the full set before committing a loss (e.g. Lianying may draw new
    // cards). New cards never become part of the already selected payment.
    var cards = ids.map(function (id) { return CardRuntime.takeCard(game, id, { zone: 'hand', actor: actor }); }).filter(Boolean);
    cards.forEach(function (card) { deps.discardCard(game, card); });
    if (cards.length && deps.notifyCardLoss) deps.notifyCardLoss(game, actor);
    return cards;
  }
  function loseHp(game, actor, amount, reason) {
    if (!living(game, actor) || game.phase === 'gameover') return;
    game[actor].hp -= amount;
    log(game, actorName(game, actor) + '因【' + reason + '】失去 ' + amount + ' 点体力。');
    if (game[actor].hp <= 0) deps.enterDying(game, actor, null);
  }
  function flowFor(game, id) {
    var frame = (game.pauseState && game.pauseState.responseFlows || []).find(function (entry) {
      return entry.kind === 'god-wrath' && entry.id === id;
    });
    return frame && frame.source;
  }
  function finish(game, source) {
    flows.finish(game, 'god-wrath', source);
    return ok('【' + names[source.skillId] + '】结算完成。');
  }
  function start(game, source) { return flows.run(game, 'god-wrath', source); }

  function qinyinScore(game, actor, mode) {
    return actionOrder(game, true, actor).reduce(function (sum, seat) {
      var state = game[seat]; var enemy = hostile(game, actor, seat);
      if (mode === 'recover') return sum - enemy * (state.hp < state.maxHp ? (state.hp === 1 ? 3 : 1) : 0);
      return sum + enemy * (state.hp === 1 ? (seat === actor ? 8 : 4) : 1);
    }, 0);
  }
  function qinyinCanRecover(game) {
    return StateRuntime.aliveSeats(game).some(function (actor) { return game[actor].hp < game[actor].maxHp; });
  }
  function qinyinDecision(game, actor) {
    var recover = qinyinScore(game, actor, 'recover');
    var lose = qinyinScore(game, actor, 'lose');
    if (Math.max(recover, lose) <= 0) return { decline: true };
    return { optionId: recover >= lose ? 'recover' : 'lose' };
  }

  function advance(game, source) {
    while (game.phase !== 'gameover' && !game.pendingChoice) {
      if (source.skillId === 'qinyin') {
        if (source.step === 'choice') {
          source.step = 'waiting';
          return choices.request(game, source.actor, 'qinyin', {
            skillId: 'qinyin', title: '琴音', prompt: '令所有角色各回复 1 点体力，或各失去 1 点体力？',
            options: (qinyinCanRecover(game) ? [{ id: 'recover', label: '所有角色回复 1 点体力' }] : [])
              .concat([{ id: 'lose', label: '所有角色失去 1 点体力' }]),
            optional: true, context: { flowId: source.responseFlowId }
          }, qinyinDecision(game, source.actor));
        }
        if (source.step === 'waiting') return ok('等待【琴音】选择。');
        if (source.idx >= source.order.length) return finish(game, source);
        var qseat = source.order[source.idx++];
        if (!living(game, qseat)) continue;
        if (source.mode === 'recover') {
          var recovery = Math.min(1, game[qseat].maxHp - game[qseat].hp);
          if (recovery > 0) {
            game[qseat].hp += recovery;
            log(game, actorName(game, qseat) + '因【琴音】回复 1 点体力。');
          }
        } else loseHp(game, qseat, 1, '琴音');
      } else if (source.skillId === 'yeyan') {
        if (source.step === 'cost') {
          source.step = 'damage';
          if (source.large) {
            discardHands(game, source.actor, source.costIds);
            // Hand loss is committed before the separate HP payment. If a
            // loss skill opens a choice, defer that next payment as well.
            source.step = 'hp-cost';
            if (game.pendingChoice) break;
          }
        }
        if (source.step === 'hp-cost') {
          source.step = 'damage';
          loseHp(game, source.actor, 3, '业炎');
          if (game.pendingChoice || game.phase === 'gameover') break;
        }
        if (source.idx >= source.allocations.length) return finish(game, source);
        var allocation = source.allocations[source.idx++];
        if (!living(game, allocation.actor)) continue;
        deps.damage(game, allocation.actor, allocation.amount,
          living(game, source.actor) ? source.actor : null, '【业炎】', null, 'fire');
      } else if (source.skillId === 'shenfen') {
        if (source.stage === 'damage') {
          if (source.idx >= source.order.length) { source.stage = 'equipment'; source.idx = 0; continue; }
          var victim = source.order[source.idx++];
          if (living(game, victim)) deps.damage(game, victim, 1,
            living(game, source.actor) ? source.actor : null, '【神愤】', null, 'normal');
        } else if (source.stage === 'equipment') {
          if (source.idx >= source.order.length) { source.stage = 'hand'; source.idx = 0; continue; }
          var owner = source.order[source.idx];
          if (!living(game, owner)) { source.idx++; source.equipIds = null; continue; }
          if (!source.equipIds) {
            source.equipIds = slots.map(function (slot) {
              var card = game[owner].equipment && game[owner].equipment[slot];
              return card && { id: card.id, slot: slot };
            }).filter(Boolean);
          }
          if (!source.equipIds.length) {
            source.idx++; source.equipIds = null;
            if (deps.notifyCardLoss) deps.notifyCardLoss(game, owner);
            continue;
          }
          var entry = source.equipIds.shift();
          var equipped = CardRuntime.takeCard(game, entry.id, { zone: 'equipment', actor: owner, slot: entry.slot });
          if (equipped) {
            deps.discardCard(game, equipped);
            deps.triggerEquipmentLoss(game, owner, equipped);
          }
        } else if (source.stage === 'hand') {
          if (source.idx >= source.order.length) { source.stage = 'flip'; continue; }
          var handOwner = source.order[source.idx++];
          if (!living(game, handOwner)) continue;
          var hand = game[handOwner].hand || [];
          var count = Math.min(4, hand.length);
          if (!count) continue;
          if (hand.length <= 4) { discardHands(game, handOwner, hand.map(function (card) { return card.id; })); continue; }
          var aiIds = hand.slice().sort(function (a, b) {
            return deps.scoreCardForDiscard ? deps.scoreCardForDiscard(game, handOwner, a) - deps.scoreCardForDiscard(game, handOwner, b) : 0;
          }).slice(0, count).map(function (card) { return card.id; });
          return choices.request(game, handOwner, 'shenfen-discard', {
            skillId: 'shenfen', title: '神愤：弃置手牌', prompt: '请选择弃置 4 张手牌。',
            cards: hand.slice(), cardMin: 4, cardMax: 4, optional: false,
            context: { flowId: source.responseFlowId }
          }, { cardIds: aiIds });
        } else {
          if (living(game, source.actor)) {
            game[source.actor].turnedOver = !game[source.actor].turnedOver;
            log(game, actorName(game, source.actor) + '因【神愤】将武将牌' + (game[source.actor].turnedOver ? '翻面。' : '翻回正面。'));
          }
          return finish(game, source);
        }
      } else return finish(game, source);
    }
    if (game.phase === 'gameover') return finish(game, source);
    return Object.assign(ok('等待插入结算。'), { suspended: true, paused: true });
  }
  flows.register('god-wrath', { key: 'godWrath', advance: advance });

  choices.register('qinyin', function (game, pending, decision) {
    var source = flowFor(game, pending.context.flowId);
    if (!source) return ok('【琴音】时机已结束。');
    if (decision.decline) return finish(game, source);
    if (['recover', 'lose'].indexOf(decision.optionId) < 0) return reject(game, pending, '请选择回复或失去体力。');
    if (decision.optionId === 'recover' && !qinyinCanRecover(game)) return reject(game, pending, '所有角色体力已满，只能选择失去体力或放弃。');
    source.mode = decision.optionId; source.step = 'targets';
    source.order = actionOrder(game, true, source.actor); source.idx = 0;
    log(game, actorName(game, source.actor) + '发动【琴音】。');
    return start(game, source);
  });
  choices.register('shenfen-discard', function (game, pending, decision) {
    var source = flowFor(game, pending.context.flowId);
    if (!source) return ok('【神愤】结算已结束。');
    var cards = handCards(game, pending.actor, decision.cardIds || []);
    var count = Math.min(4, (game[pending.actor].hand || []).length);
    if (!cards || cards.length !== count || cards.some(function (card) {
      return !(pending.cards || []).some(function (offered) { return offered.id === card.id; });
    })) return reject(game, pending, '请选择当前手牌中的 ' + count + ' 张不同手牌。');
    discardHands(game, pending.actor, decision.cardIds);
    return start(game, source);
  });

  function validateActive(game, actor, skillId) {
    if (!enabled(game, actor, skillId)) return deps.fail('【' + names[skillId] + '】当前不可发动。');
    if (game.phase !== 'play' || game.turn !== actor) return deps.fail('请在自己的出牌阶段发动。');
    return null;
  }
  function activateYeyan(game, actor, cardIds, allocations) {
    var invalid = validateActive(game, actor, 'yeyan');
    if (invalid) return invalid;
    if (flags(game[actor]).yeyanUsed) return deps.fail('【业炎】每局只能发动一次。');
    if (!Array.isArray(allocations) || allocations.length < 1 || allocations.length > 3
        || new Set(allocations.map(function (a) { return a && a.actor; })).size !== allocations.length
        || allocations.some(function (a) { return !a || !living(game, a.actor) || !Number.isInteger(a.amount) || a.amount < 1; })
        || allocations.reduce(function (sum, a) { return sum + a.amount; }, 0) > 3) {
      return deps.fail('【业炎】须选择 1 至 3 名角色，分配正整数伤害，合计不超过 3 点。');
    }
    var large = allocations.some(function (a) { return a.amount >= 2; });
    if (large ? !fourSuits(game, actor, cardIds) : cardIds.length !== 0) {
      return deps.fail(large ? '大业炎必须弃置四张花色各异的手牌。' : '小业炎不需要弃置手牌。');
    }
    flags(game[actor]).yeyanUsed = true;
    var order = actionOrder(game, true, actor);
    var locked = allocations.map(function (a) { return { actor: a.actor, amount: a.amount }; })
      .sort(function (a, b) { return order.indexOf(a.actor) - order.indexOf(b.actor); });
    log(game, actorName(game, actor) + '发动限定技【业炎】。');
    return start(game, { skillId: 'yeyan', actor: actor, step: 'cost', costIds: cardIds.slice(), large: large,
      allocations: locked, idx: 0 });
  }
  function yeyanWizard(game, actor) {
    var invalid = validateActive(game, actor, 'yeyan');
    if (invalid) return invalid;
    if (flags(game[actor]).yeyanUsed) return deps.fail('【业炎】每局只能发动一次。');
    var options = [{ id: 'small', label: '对 1 至 3 名角色各造成 1 点火焰伤害' }];
    if (findFourSuits(game, actor).length) options = options.concat([
      { id: 'large2', label: '弃四种花色手牌并失去 3 体力：对一人造成 2 点火焰伤害' },
      { id: 'large3', label: '弃四种花色手牌并失去 3 体力：对一人造成 3 点火焰伤害' },
      { id: 'split', label: '弃四种花色手牌并失去 3 体力：分配 2 + 1 点火焰伤害' }
    ]);
    return choices.request(game, actor, 'yeyan-mode', { title: '业炎', skillId: 'yeyan',
      prompt: '选择业炎的伤害分配方式。', options: options, optional: true }, { optionId: 'small' });
  }
  choices.register('yeyan-mode', function (game, pending, decision) {
    if (decision.decline) return ok('不发动【业炎】。');
    if (!(pending.options || []).some(function (entry) { return entry.id === decision.optionId; })) return reject(game, pending, '请选择当前可用的业炎方式。');
    var mode = decision.optionId; var actor = pending.actor;
    var targetCount = mode === 'small' ? 3 : 1;
    var targets = targetOptions(game, actor, true);
    var enemies = targets.filter(function (entry) { return hostile(game, actor, entry.actor) > 0; });
    var suggested = (enemies.length ? enemies : targets).slice(0, mode === 'small' ? 3 : 1).map(function (entry) { return entry.actor; });
    return choices.request(game, actor, 'yeyan-targets', {
      title: '业炎：选择目标', skillId: 'yeyan', prompt: mode === 'split' ? '先选择承受 2 点火焰伤害的角色，并选择四种花色手牌。' : '选择目标' + (mode === 'small' ? '。' : '和四种花色手牌。'),
      targets: targets, targetMin: 1, targetMax: targetCount,
      cards: mode === 'small' ? [] : (game[actor].hand || []).slice(), cardMin: mode === 'small' ? 0 : 4,
      cardMax: mode === 'small' ? 0 : 4, cardSuitRule: mode === 'small' ? null : 'distinct', optional: true, context: { mode: mode }
    }, { targetActors: suggested, cardIds: mode === 'small' ? [] : findFourSuits(game, actor) });
  });
  choices.register('yeyan-targets', function (game, pending, decision) {
    if (decision.decline) return ok('不发动【业炎】。');
    var targets = decision.targetActors || [];
    var mode = pending.context.mode; var ids = decision.cardIds || [];
    if (!targets.length || targets.length > pending.targetMax || new Set(targets).size !== targets.length
        || targets.some(function (seat) { return !(pending.targets || []).some(function (entry) { return entry.actor === seat; }); })) {
      return reject(game, pending, '请选择窗口列出的不同目标。');
    }
    if (mode === 'split') {
      if (!fourSuits(game, pending.actor, ids)) return reject(game, pending, '请选择四张花色各异的手牌。');
      var rest = targetOptions(game, pending.actor, true).filter(function (entry) { return entry.actor !== targets[0]; });
      if (!rest.length) return reject(game, pending, '还需要另一名角色承受 1 点伤害。');
      return choices.request(game, pending.actor, 'yeyan-second', { title: '业炎：分配剩余伤害', skillId: 'yeyan',
        prompt: '选择另一名角色承受 1 点火焰伤害。', targets: rest, targetMin: 1, targetMax: 1, optional: true,
        context: { firstActor: targets[0], costIds: ids.slice() }
      }, { targetActors: [rest[0].actor] });
    }
    var allocations = targets.map(function (actor) { return { actor: actor, amount: mode === 'large3' ? 3 : mode === 'large2' ? 2 : 1 }; });
    var result = activateYeyan(game, pending.actor, ids, allocations);
    if (result && result.ok === false) game.pendingChoice = pending;
    return result;
  });
  choices.register('yeyan-second', function (game, pending, decision) {
    if (decision.decline) return ok('不发动【业炎】。');
    var targets = decision.targetActors || [];
    if (targets.length !== 1 || !(pending.targets || []).some(function (entry) { return entry.actor === targets[0]; })) {
      return reject(game, pending, '请选择另一名角色。');
    }
    var result = activateYeyan(game, pending.actor, pending.context.costIds, [
      { actor: pending.context.firstActor, amount: 2 }, { actor: targets[0], amount: 1 }
    ]);
    if (result && result.ok === false) game.pendingChoice = pending;
    return result;
  });

  function activateWuqian(game, actor, target) {
    var invalid = validateActive(game, actor, 'wuqian');
    if (invalid) return invalid;
    if (rage(game[actor]) < 2 || !living(game, target)) return deps.fail('【无前】需要 2 枚暴怒标记和一名存活目标。');
    marks(game[actor]).rage = rage(game[actor]) - 2;
    StateRuntime.activateSkillSource(game[actor], 'god-wuqian', { id: 'wushuang', name: '无双', status: 'implemented', frequency: 'locked' });
    var sources = game[target].godArmorSuppressedBy || [];
    if (sources.indexOf(actor) < 0) game[target].godArmorSuppressedBy = sources.concat([actor]);
    flags(game[actor]).godWuqianTurnActor = game.turn;
    log(game, actorName(game, actor) + '发动【无前】，本回合获得【无双】，' + actorName(game, target) + '的防具技能无效。');
    return ok('【无前】已生效。');
  }
  function wuqianWizard(game, actor) {
    var invalid = validateActive(game, actor, 'wuqian');
    if (invalid) return invalid;
    if (rage(game[actor]) < 2) return deps.fail('【无前】需要 2 枚暴怒标记。');
    var targets = targetOptions(game, actor, true);
    var target = targets.find(function (entry) { return hostile(game, actor, entry.actor) > 0; }) || targets[0];
    return choices.request(game, actor, 'wuqian', { title: '无前', skillId: 'wuqian', prompt: '选择本回合防具技能失效的角色。',
      targets: targets, targetMin: 1, targetMax: 1, optional: true }, { targetActors: [target.actor] });
  }
  choices.register('wuqian', function (game, pending, decision) {
    if (decision.decline) return ok('不发动【无前】。');
    var targets = decision.targetActors || [];
    if (targets.length !== 1 || !(pending.targets || []).some(function (entry) { return entry.actor === targets[0]; })) return reject(game, pending, '请选择一名合法目标。');
    var result = activateWuqian(game, pending.actor, targets[0]);
    if (result && result.ok === false) game.pendingChoice = pending;
    return result;
  });

  function activateShenfen(game, actor) {
    var invalid = validateActive(game, actor, 'shenfen');
    if (invalid) return invalid;
    if (flags(game[actor]).shenfenUsed) return deps.fail('【神愤】每个出牌阶段限一次。');
    if (rage(game[actor]) < 6) return deps.fail('【神愤】需要 6 枚暴怒标记。');
    marks(game[actor]).rage = rage(game[actor]) - 6;
    flags(game[actor]).shenfenUsed = true;
    log(game, actorName(game, actor) + '弃 6 枚暴怒标记，发动【神愤】。');
    return start(game, { skillId: 'shenfen', actor: actor, order: actionOrder(game, false, actor), idx: 0, stage: 'damage' });
  }
  function afterInitialHands(game) {
    StateRuntime.seatList(game).forEach(function (actor) {
      if (!enabled(game, actor, 'kuangbao') || marks(game[actor]).kuangbaoStarted) return;
      marks(game[actor]).kuangbaoStarted = true;
      marks(game[actor]).rage = rage(game[actor]) + 2;
      log(game, actorName(game, actor) + '因【狂暴】获得 2 枚暴怒标记。');
    });
  }
  function addRage(context, actor) {
    if (!enabled(context.game, actor, 'kuangbao') || !(context.amount > 0)) return null;
    marks(context.game[actor]).rage = rage(context.game[actor]) + context.amount;
    log(context.game, actorName(context.game, actor) + '因【狂暴】获得 ' + context.amount + ' 枚暴怒标记。');
    return { rageAdded: context.amount };
  }
  function beforeTrickUse(game, actor, card) {
    if (!enabled(game, actor, 'wumou') || !CardRuntime.isNormalTrickCard(card)) return null;
    if (rage(game[actor]) === 0) {
      loseHp(game, actor, 1, '无谋');
      return Object.assign(ok('【无谋】失去 1 点体力。'), { suspended: !!game.pendingChoice });
    }
    return choices.request(game, actor, 'wumou', { title: '无谋', skillId: 'wumou',
      prompt: '使用非延时锦囊：弃 1 枚暴怒标记，或失去 1 点体力。',
      options: [{ id: 'rage', label: '弃 1 枚暴怒标记' }, { id: 'hp', label: '失去 1 点体力' }], optional: false
    }, { optionId: game[actor].hp >= 4 && rage(game[actor]) < 6 ? 'hp' : 'rage' });
  }
  choices.register('wumou', function (game, pending, decision) {
    if (decision.optionId === 'rage') {
      if (rage(game[pending.actor]) < 1) return reject(game, pending, '没有可弃置的暴怒标记。');
      marks(game[pending.actor]).rage = rage(game[pending.actor]) - 1;
      log(game, actorName(game, pending.actor) + '因【无谋】弃 1 枚暴怒标记。');
      return ok('【无谋】成本已支付。');
    }
    if (decision.optionId !== 'hp') return reject(game, pending, '请选择弃暴怒或失去体力。');
    loseHp(game, pending.actor, 1, '无谋');
    return Object.assign(ok('【无谋】成本已支付。'), { suspended: !!game.pendingChoice });
  });
  function clearDeathEffects(game, actor) {
    StateRuntime.seatList(game).forEach(function (seat) {
      if (!game[seat]) return;
      game[seat].godArmorSuppressedBy = (game[seat].godArmorSuppressedBy || []).filter(function (source) { return source !== actor; });
    });
    if (game[actor]) {
      StateRuntime.clearSkillSource(game[actor], 'god-wuqian');
      delete flags(game[actor]).godWuqianTurnActor;
    }
  }
  function clearTurnEffects(game, actor) {
    StateRuntime.seatList(game).forEach(function (seat) {
      if (game[seat] && flags(game[seat]).godWuqianTurnActor === actor) clearDeathEffects(game, seat);
    });
    if (game[actor]) { delete flags(game[actor]).shenfenUsed; delete flags(game[actor]).aiWuqianUsed; }
  }

  SkillRuntime.registerSkill(skillRegistry, 'qinyin', {
    onDiscardPhaseEnd: function (context) {
      var game = context.game; var actor = context.actor;
      if (!enabled(game, actor, 'qinyin') || new Set((context.discardedCards || []).map(function (card) { return card.id; })).size < 2) return null;
      if (game[actor].skillPreferences && game[actor].skillPreferences.qinyin === 'decline') return null;
      return start(game, { skillId: 'qinyin', actor: actor, step: 'choice', idx: 0, order: [] });
    }
  });
  SkillRuntime.registerSkill(skillRegistry, 'yeyan', { onActiveSkill: function (context) {
    if (context.skillId !== 'yeyan') return null;
    var options = context.options || {};
    return options.allocations ? activateYeyan(context.game, context.actor, context.cardIds || [], options.allocations)
      : yeyanWizard(context.game, context.actor);
  } });
  SkillRuntime.registerSkill(skillRegistry, 'kuangbao', {
    onDamageAfter: function (context) { return addRage(context, context.targetActor); },
    onDamageDealt: function (context) { return addRage(context, context.sourceActor); }
  });
  SkillRuntime.registerSkill(skillRegistry, 'wumou', {});
  SkillRuntime.registerSkill(skillRegistry, 'wuqian', { onActiveSkill: function (context) {
    if (context.skillId !== 'wuqian') return null;
    return context.options && context.options.target ? activateWuqian(context.game, context.actor, context.targetActor)
      : wuqianWizard(context.game, context.actor);
  } });
  SkillRuntime.registerSkill(skillRegistry, 'shenfen', { onActiveSkill: function (context) {
    return context.skillId === 'shenfen' ? activateShenfen(context.game, context.actor) : null;
  } });

  function runAIActiveSkills(game, actor) {
    if (game.phase !== 'play' || game.turn !== actor || game.pendingChoice || !living(game, actor)) return { acted: false };
    var enemies = actionOrder(game, false, actor).filter(function (seat) { return hostile(game, actor, seat) > 0; });
    if (!enemies.length) return { acted: false };
    if (enabled(game, actor, 'yeyan') && !flags(game[actor]).yeyanUsed) {
      var cost = findFourSuits(game, actor);
      var allocations = enemies.slice(0, 3).map(function (seat) { return { actor: seat, amount: 1 }; });
      if (game[actor].hp >= 4 && cost.length && enemies.some(function (seat) { return game[seat].hp <= 3; })) {
        var lethal = enemies.find(function (seat) { return game[seat].hp <= 3; });
        allocations = [{ actor: lethal, amount: 3 }];
      } else cost = [];
      return { acted: true, result: activateYeyan(game, actor, cost, allocations) };
    }
    if (enabled(game, actor, 'shenfen') && !flags(game[actor]).shenfenUsed && rage(game[actor]) >= 6) {
      return { acted: true, result: activateShenfen(game, actor) };
    }
    if (enabled(game, actor, 'wuqian') && !flags(game[actor]).aiWuqianUsed && rage(game[actor]) >= 2
        && (game[actor].hand || []).some(CardRuntime.isShaCard)) {
      var target = enemies.find(function (seat) { return game[seat].equipment && game[seat].equipment.armor; }) || enemies[0];
      flags(game[actor]).aiWuqianUsed = true;
      return { acted: true, result: activateWuqian(game, actor, target) };
    }
    return { acted: false };
  }
  return { afterInitialHands: afterInitialHands, beforeTrickUse: beforeTrickUse,
    clearTurnEffects: clearTurnEffects, clearDeathEffects: clearDeathEffects,
    runAIActiveSkills: runAIActiveSkills };
}
