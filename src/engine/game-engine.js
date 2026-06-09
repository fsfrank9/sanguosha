      import { Runtime } from './runtime.js';
      import { SkillRuntime } from './skill-runtime.js';
      import { CardRuntime } from './card-runtime.js';
      import { StateRuntime } from './state.js';
      import { PhaseRuntime } from './phases.js';
      import { JudgementRuntime } from './judgement.js';
      import { HERO_CATALOG, HEROES } from '../data/heroes.js';
      import { CARD_CATALOG, CARD_INFO, PHASES } from '../data/cards.js';
      import { IMPLEMENTED_SKILL_IDS, ACTIVE_SKILL_IDS } from '../data/skill-status.js';

      var clone = Runtime.clone;
      var makeRng = Runtime.makeRng;
      var makePlayer = Runtime.makePlayer;
      var makeTestCard = CardRuntime.makeTestCard;
      var buildDeck = CardRuntime.buildDeck;
      var shuffle = CardRuntime.shuffle;
      var isShaType = CardRuntime.isShaType;
      var isShaCard = CardRuntime.isShaCard;
      var isNormalTrickCard = CardRuntime.isNormalTrickCard;
      var physicalCardOf = CardRuntime.physicalCardOf;
      var actorName = StateRuntime.actorName;
      var opponent = StateRuntime.opponent;
      var hasSkill = StateRuntime.hasSkill;
      var canUseUnlimitedSha = StateRuntime.canUseUnlimitedSha;
      var weaponRange = StateRuntime.weaponRange;
      var distanceBetween = StateRuntime.distanceBetween;
      var canReachWithSha = StateRuntime.canReachWithSha;
      var firstActorFromRoles = StateRuntime.firstActorFromRoles;
      var handLimit = StateRuntime.handLimit;
      var getActorStatus = StateRuntime.getActorStatus;
      var hasEquipmentEffect = StateRuntime.hasEquipmentEffect;
      var setPhase = PhaseRuntime.setPhase;
      var nextPlayablePhase = PhaseRuntime.nextPlayablePhase;
      var resetActorTurnState = PhaseRuntime.resetActorTurnState;
      var resetEndOfTurnState = PhaseRuntime.resetEndOfTurnState;
      var evaluateDelayedTrick = JudgementRuntime.evaluateDelayedTrick;

      SkillRuntime.annotateSkillStatus(HERO_CATALOG, IMPLEMENTED_SKILL_IDS, ACTIVE_SKILL_IDS);
      var skillRegistry = SkillRuntime.createRegistry();
      SkillRuntime.registerSkill(skillRegistry, 'biyue', {
        onTurnEnd: function (context) {
          triggerBiyue(context.game, context.actor);
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'keji', {
        onBeforeDiscardPhase: function (context) {
          return triggerKejiBeforeDiscard(context.game, context.actor, context);
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'jizhi', {
        onCardUse: function (context) {
          return triggerJizhi(context.game, context.actor, context.card, context.options);
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'yingzi', {
        onDrawPhase: function (context) {
          var state = context.game[context.actor];
          if (!state || !hasSkill(state, 'yingzi')) return;
          context.drawCount += 1;
          log(context.game, actorName(context.game, context.actor) + '发动【英姿】，摸牌阶段额外摸一张牌。');
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'tuxi', {
        onDrawPhase: function (context) {
          var game = context.game;
          var actor = context.actor;
          var state = game[actor];
          if (!state || !hasSkill(state, 'tuxi')) return;
          if (game[opponent(actor)].hand.length <= 0) return;
          // v6.1: spec condition is "发动者**选择**发动". Read
          // skillPreferences.tuxi to honor the choice: 'decline' skips
          // entirely. Default is auto-fire (preserves v5/v6 behavior so
          // existing tests + AI continue to work without per-turn toggles).
          var pref = state.skillPreferences && state.skillPreferences.tuxi;
          if (pref === 'decline') {
            log(game, actorName(game, actor) + '选择本回合不发动【突袭】。');
            return;
          }
          takeHandCard(game, opponent(actor), actor, '发动【突袭】，获得');
          context.drawCount = Math.max(0, context.drawCount - 1);
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'luoyi', {
        onDrawPhase: function (context) {
          return triggerLuoyiDrawPhase(context);
        },
        onDamageModify: function (context) {
          return triggerLuoyiDamageModify(context);
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'kongcheng', {
        onCardTarget: function (context) {
          var target = context.game[context.targetActor];
          if (!target || !hasSkill(target, 'kongcheng') || target.hand.length !== 0) return null;
          if (!isShaType(context.cardType) && context.cardType !== 'juedou') return null;
          return {
            protected: true,
            message: actorName(context.game, context.targetActor) + '处于【空城】状态，不能成为【' + context.cardName + '】目标。'
          };
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'qianxun', {
        onCardTarget: function (context) {
          return triggerQianxunCardTarget(context);
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'tiandu', {
        onJudgementAfterResolve: function (context) {
          return triggerTianduJudgementAfterResolve(context);
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'guicai', {
        onJudgementBeforeResolve: function (context) {
          return triggerGuicaiJudgementBeforeResolve(context);
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'tieqi', {
        onNeedResponse: function (context) {
          return triggerTieqiNeedResponse(context.game, context.actor, context.targetActor, context.responseType, context.card);
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'jianxiong', {
        onDamageAfter: function (context) {
          return triggerJianxiongDamageAfter(context.game, context.targetActor, context.sourceCard);
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'fankui', {
        onDamageAfter: function (context) {
          return triggerFankuiDamageAfter(context);
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'yiji', {
        onDamageAfter: function (context) {
          return triggerYijiDamageAfter(context);
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'ganglie', {
        onDamageAfter: function (context) {
          return triggerGanglieDamageAfter(context);
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'longdan', {
        onCardAs: function (context) {
          return triggerLongdanCardAs(context);
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'wusheng', {
        onCardAs: function (context) {
          return triggerWushengCardAs(context);
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'qingguo', {
        onCardAs: function (context) {
          return triggerQingguoCardAs(context);
        }
      });
      // v8 PR-C1: 国色 (大乔) onCardAs (方片 → 乐不思蜀, proactive only)
      SkillRuntime.registerSkill(skillRegistry, 'guose', {
        onCardAs: function (context) {
          return triggerGuoseCardAs(context);
        }
      });
      // v8 PR-C2: 流离 (大乔) onShaTargeted — 杀指定目标后 大乔 可弃 1 牌
      // 把杀转移给"攻击范围内的一名其他角色 (且必须为源此【杀】的合法目标)"。
      // 1v1 中可候选 = 仅源, 但源对自己不能用杀 → 0 合法目标 → 静默不触发。
      // 多人模式启用后此 hook 自动生效。
      SkillRuntime.registerSkill(skillRegistry, 'liuli', {
        onShaTargeted: function (context) {
          return triggerLiuliOnShaTargeted(context);
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'zhiheng', {
        onActiveSkill: function (context) {
          return triggerZhihengActiveSkill(context);
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'kurou', {
        onActiveSkill: function (context) {
          return triggerKurouActiveSkill(context);
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'rende', {
        onActiveSkill: function (context) {
          return triggerRendeActiveSkill(context);
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'qingnang', {
        onActiveSkill: function (context) {
          return triggerQingnangActiveSkill(context);
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'fanjian', {
        onActiveSkill: function (context) {
          return triggerFanjianActiveSkill(context);
        }
      });
      SkillRuntime.registerSkill(skillRegistry, 'guanxing', {
        onActiveSkill: function (context) {
          return triggerGuanxingActiveSkill(context);
        },
        onSkillPreview: function (context) {
          return triggerGuanxingPreview(context);
        }
      });

      var PLAY_PHASE_ACTIVE_SKILLS = {
        zhiheng: true,
        kurou: true,
        rende: true,
        fanjian: true,
        qingnang: true
      };

      function cardTargetProtection(game, actor, targetActor, card, displayName) {
        var cardType = card && card.type ? card.type : card;
        var cardName = displayName || (card && card.name) || (CARD_INFO[cardType] && CARD_INFO[cardType].name) || cardType;
        var results = SkillRuntime.runHook(skillRegistry, 'onCardTarget', {
          game: game,
          actor: actor,
          targetActor: targetActor,
          card: card,
          cardType: cardType,
          cardName: cardName
        });
        for (var i = 0; i < results.length; i += 1) {
          if (results[i].result && results[i].result.protected) return results[i].result;
        }
        return null;
      }

      function triggerQianxunCardTarget(context) {
        var target = context.game[context.targetActor];
        if (!target || !hasSkill(target, 'qianxun')) return null;
        if (context.cardType !== 'shunshou' && context.cardType !== 'lebusishu') return null;
        return {
          protected: true,
          message: actorName(context.game, context.targetActor) + '拥有【谦逊】，不能成为【' + context.cardName + '】目标。'
        };
      }

      function takeHandCard(game, fromActor, toActor, reason) {
        var from = game[fromActor];
        var to = game[toActor];
        if (!from || !to || !from.hand.length) return null;
        var index = randomHandIndex(game, from);
        var card = from.hand.splice(index, 1)[0];
        to.hand.push(card);
        log(game, actorName(game, toActor) + (reason || '获得') + actorName(game, fromActor) + '的一张手牌。');
        return card;
      }

      function performDrawPhase(game, actor) {
        var drawContext = {
          game: game,
          actor: actor,
          drawCount: 2
        };
        SkillRuntime.runHook(skillRegistry, 'onDrawPhase', drawContext);
        return drawCards(game, actor, drawContext.drawCount);
      }

      // Skill preference toggle. Lets the player explicitly choose how an
      // optional/configurable skill fires. Passing null/undefined clears the
      // preference (restores per-skill default behavior). Any string value
      // (including 'auto') is stored verbatim so per-skill hooks can read it
      // and react. Per-skill semantics:
      //   luoyi  (default: auto-fire) — 'decline' skips reduceDraw + damage flag
      //   guicai (default: 'ask' for player, 'auto' for AI) — 'auto' restores
      //          the legacy hand[0] auto-pick; 'decline' skips the skill
      function setSkillPreference(game, actor, skillId, value) {
        if (!game || !actor || !skillId) return fail('参数缺失。');
        var state = game[actor];
        if (!state) return fail('未知角色。');
        state.skillPreferences = state.skillPreferences || {};
        if (value === undefined || value === null) {
          delete state.skillPreferences[skillId];
        } else {
          state.skillPreferences[skillId] = value;
        }
        return success('偏好已更新。');
      }

      function getSkillPreference(game, actor, skillId) {
        if (!game || !actor || !skillId) return null;
        var state = game[actor];
        if (!state || !state.skillPreferences) return null;
        return state.skillPreferences[skillId] || null;
      }

      function triggerLuoyiDrawPhase(context) {
        var game = context.game;
        var state = game[context.actor];
        if (!state || !hasSkill(state, 'luoyi') || context.drawCount <= 0) return null;
        state.flags = state.flags || {};
        state.skillPreferences = state.skillPreferences || {};
        var flags = state.flags;
        if (flags.luoyi) return null;
        if (state.skillPreferences.luoyi === 'decline') {
          flags.luoyiDeclined = true;
          log(game, actorName(game, context.actor) + '选择本回合不发动【裸衣】。');
          return { declinedLuoyi: true };
        }
        context.drawCount = Math.max(0, context.drawCount - 1);
        flags.luoyi = true;
        log(game, actorName(game, context.actor) + '发动【裸衣】，摸牌阶段少摸一张牌，本回合【杀】或【决斗】伤害 +1。');
        return { triggeredLuoyi: true };
      }

      function triggerLuoyiDamageModify(context) {
        var game = context.game;
        var sourceActor = context.sourceActor;
        var source = game[sourceActor];
        if (!source || !hasSkill(source, 'luoyi') || !source.flags || !source.flags.luoyi || game.turn !== sourceActor) return null;
        var isShaDamage = isShaCard(context.sourceCard);
        var isDuelDamage = /决斗/.test(context.reason || '');
        if (!isShaDamage && !isDuelDamage) return null;
        context.amount += 1;
        log(game, actorName(game, sourceActor) + '的【裸衣】令本次伤害 +1。');
        return { modifiedDamage: true };
      }

      function isArmorIgnoredBySha(game, sourceActor, card) {
        var source = game[sourceActor];
        return !!(source && isShaCard(card) && hasEquipmentEffect(source, 'ignoreArmorOnSha'));
      }

      function log(game, text) {
        game.log.push(text);
        if (game.log.length > 80) game.log.shift();
      }

      function reshuffleIfNeeded(game) {
        if (game.deck.length > 0 || game.discard.length === 0) return;
        log(game, '牌堆耗尽，洗混弃牌堆形成新的牌堆。');
        game.deck = shuffle(game.discard.splice(0), game.random);
      }

      function drawCards(game, actor, count) {
        var drawn = [];
        for (var i = 0; i < count; i += 1) {
          reshuffleIfNeeded(game);
          if (game.deck.length === 0) break;
          var card = game.deck.pop();
          game[actor].hand.push(card);
          drawn.push(card);
        }
        if (drawn.length > 0) {
          log(game, actorName(game, actor) + '摸了 ' + drawn.length + ' 张牌。');
        }
        return drawn;
      }

      function shouldTriggerJizhi(card, options) {
        return isNormalTrickCard(card) && !(card.type === 'tiesuo' && options && options.mode === 'recast');
      }

      function triggerJizhi(game, actor, card, options) {
        var state = game[actor];
        if (!state || !hasSkill(state, 'jizhi') || !shouldTriggerJizhi(card, options) || game.phase === 'gameover') return;
        log(game, actorName(game, actor) + '发动【集智】，使用普通锦囊后摸 1 张牌。');
        drawCards(game, actor, 1);
      }

      function finishTrickUse(game, actor, card, result, options) {
        if (result && result.ok) {
          SkillRuntime.runHook(skillRegistry, 'onCardUse', {
            game: game,
            actor: actor,
            card: card,
            result: result,
            options: options || {}
          });
        }
        return result;
      }

      function removeCardFromHand(state, cardId) {
        var index = state.hand.findIndex(function (card) { return card.id === cardId; });
        if (index < 0) return null;
        return state.hand.splice(index, 1)[0];
      }

      // v6.1: helpers that treat a player's hand AND equipment as one "own
      // cards" pool. Used by 制衡 (cost: "弃置任意数量手牌或装备区牌") and
      // 武圣 (condition: "发动者有红色手牌或装备牌"). The equipment slot is
      // cleared when the card is removed.
      var EQUIPMENT_SLOTS = ['weapon', 'armor', 'horseMinus', 'horsePlus'];

      function findOwnCardById(state, cardId) {
        if (!state) return null;
        var handHit = (state.hand || []).find(function (c) { return c.id === cardId; });
        if (handHit) return { card: handHit, zone: 'hand' };
        if (state.equipment) {
          for (var i = 0; i < EQUIPMENT_SLOTS.length; i += 1) {
            var slot = EQUIPMENT_SLOTS[i];
            var card = state.equipment[slot];
            if (card && card.id === cardId) return { card: card, zone: 'equipment', slot: slot };
          }
        }
        return null;
      }

      function removeOwnCardFromAnyZone(state, cardId) {
        var hit = findOwnCardById(state, cardId);
        if (!hit) return null;
        if (hit.zone === 'hand') {
          return removeCardFromHand(state, cardId);
        }
        // equipment
        state.equipment[hit.slot] = null;
        return hit.card;
      }

      function firstMatchingOwnCard(state, predicate) {
        // Scans hand first, then equipment slots, in deterministic order.
        if (!state) return null;
        var handHit = (state.hand || []).find(predicate);
        if (handHit) return handHit;
        if (state.equipment) {
          for (var i = 0; i < EQUIPMENT_SLOTS.length; i += 1) {
            var card = state.equipment[EQUIPMENT_SLOTS[i]];
            if (card && predicate(card)) return card;
          }
        }
        return null;
      }

      function removeFirstMatchingCard(state, predicate) {
        var index = state.hand.findIndex(predicate);
        if (index < 0) return null;
        return state.hand.splice(index, 1)[0];
      }

      function removeFirstCardOfType(state, type) {
        return removeFirstMatchingCard(state, function (card) { return type === 'sha' ? isShaCard(card) : card.type === type; });
      }

      function firstMatchingCard(state, predicate) {
        if (!state || !state.hand) return null;
        return state.hand.find(predicate) || null;
      }

      function selectCardAsConversion(results) {
        var selected = null;
        for (var i = 0; i < results.length; i += 1) {
          var conversion = results[i].result;
          if (!conversion || !conversion.card) continue;
          if (!selected || (conversion.priority || 0) > (selected.priority || 0)) selected = conversion;
        }
        return selected;
      }

      function selectActiveSkillResult(results, skillId) {
        for (var i = 0; i < results.length; i += 1) {
          if (results[i].skillId === skillId && results[i].result !== undefined && results[i].result !== null) {
            return results[i].result;
          }
        }
        return null;
      }

      function discardCard(game, card) {
        var physicalCard = physicalCardOf(card);
        if (physicalCard) game.discard.push(physicalCard);
      }

      function triggerJianxiongDamageAfter(game, targetActor, sourceCard) {
        var target = game[targetActor];
        var physicalSourceCard = physicalCardOf(sourceCard);
        if (!sourceCard || !physicalSourceCard || !target || !hasSkill(target, 'jianxiong')) return null;
        target.hand.push(physicalSourceCard);
        log(game, actorName(game, targetActor) + '发动【奸雄】，获得了造成伤害的【' + physicalSourceCard.name + '】。');
        return { claimedSourceCard: true };
      }

      // 反馈 — spec: "司马懿 受到伤害结算后" / "需要选择来源的一张可获得
      // 牌" (手牌 / 装备 / 判定区). The v5/v6 engine called
      // removeTargetZoneCard(game, sourceActor) with no zone/cardId, which
      // defaults to a RANDOM hand card. Player 司马懿 got no choice over
      // zone or specific card, violating the spec's "需要选择".
      //
      // v6.1 flow:
      //   1. Catalogue source's gainable cards into zones:
      //      - hand:      count only (opponent hand contents are private)
      //      - equipment: per-slot entry with full card info (face-up)
      //      - judge:     per-trick entry with full card info (face-up)
      //   2. Player 司马懿 with default pref: pendingChoice 'fankui-pick'.
      //      UI shows the catalog; player picks { zone, cardId? }.
      //      For hand zone the cardId is ignored — random pick within hand
      //      preserves the "you can't peek at opponent's hand contents"
      //      semantic. For equipment/judge, cardId selects the specific
      //      card.
      //   3. AI / 'auto' / 'decline': behaves as v5/v6 (auto random hand or
      //      first available; 'decline' skips entirely).
      function triggerFankuiDamageAfter(context) {
        var game = context.game;
        var targetActor = context.targetActor;
        var sourceActor = context.sourceActor;
        var target = game[targetActor];
        var source = game[sourceActor];
        if (!target || !sourceActor || !source || sourceActor === targetActor
          || !hasSkill(target, 'fankui') || game.phase === 'gameover') return null;
        var pref = (target.skillPreferences && target.skillPreferences.fankui)
          || (targetActor === 'player' ? 'ask' : 'auto');
        if (pref === 'decline') {
          log(game, actorName(game, targetActor) + '选择不发动【反馈】。');
          return { declinedFankui: true };
        }
        // Build a zone catalog of every gainable card.
        var zones = [];
        if (source.hand && source.hand.length > 0) {
          zones.push({ zone: 'hand', count: source.hand.length });
        }
        ['weapon', 'armor', 'horseMinus', 'horsePlus'].forEach(function (slot) {
          var card = source.equipment && source.equipment[slot];
          if (card) zones.push({
            zone: 'equipment', slot: slot, cardId: card.id,
            name: card.name, suit: card.suit, rank: card.rank
          });
        });
        if (source.judgeArea) {
          source.judgeArea.forEach(function (card) {
            zones.push({
              zone: 'judge', cardId: card.id,
              name: card.name, suit: card.suit, rank: card.rank
            });
          });
        }
        if (zones.length === 0) {
          return null;  // nothing to gain
        }
        if (pref === 'ask') {
          game.pendingChoice = {
            kind: 'fankui-pick',
            actor: targetActor,
            sourceActor: sourceActor,
            zones: zones
          };
          return { suspendedForFankui: true };
        }
        // Auto path: legacy default zone (hand if any → equipment → judge).
        var gained = removeTargetZoneCard(game, sourceActor);
        if (!gained || !gained.card) return null;
        target.hand.push(gained.card);
        log(game, actorName(game, targetActor) + '发动【反馈】，获得' + actorName(game, sourceActor) + '的一张' + gained.zone + '牌。');
        return { gainedSourceCard: true };
      }

      function resolveFankuiPickChoice(game, pending, decision) {
        var holder = pending.actor;
        var sourceActor = pending.sourceActor;
        var holderState = game[holder];
        if (!holderState) return fail('未知角色。');
        var zone = decision && decision.zone;
        if (['hand', 'equipment', 'judge'].indexOf(zone) < 0) {
          game.pendingChoice = pending;
          return fail('请选择有效的区域（hand / equipment / judge）。');
        }
        // For hand zone we deliberately ignore decision.cardId — engine
        // picks a random hand card, preserving the "opponent's hand
        // contents are hidden when 反馈 is choosing" semantic. equipment
        // and judge zones use the specific cardId the player clicked.
        var gained = removeTargetZoneCard(game, sourceActor, zone, zone === 'hand' ? null : decision.cardId);
        if (!gained || !gained.card) {
          game.pendingChoice = pending;
          return fail('找不到目标牌，请重新选择。');
        }
        holderState.hand.push(gained.card);
        log(game, actorName(game, holder) + '发动【反馈】，获得' + actorName(game, sourceActor) + '的一张' + gained.zone + '牌。');
        return success('反馈完成。');
      }

      // 遗计 — spec: "**按伤害点数逐点处理**；每点伤害对应摸两张牌，然后
      // 可将这些牌分配给自己或其他角色". The v5/v6 engine batched all damage
      // points into a single pendingChoice. v6.1 honors "逐点" by iterating
      // one point at a time when the player is making decisions ('ask'
      // preference): draw 2, set pendingChoice listing those 2 cards, wait
      // for the player's giveIds decision, then advance to the next point.
      // AI / 'auto' preference keeps the batched draw-and-keep behavior since
      // every point's distribution is the same trivial "keep all to self".
      function triggerYijiDamageAfter(context) {
        var game = context.game;
        var targetActor = context.targetActor;
        var target = game[targetActor];
        if (!target || !hasSkill(target, 'yiji') || game.phase === 'gameover' || context.amount <= 0) return null;
        var pref = (target.skillPreferences && target.skillPreferences.yiji) || 'auto';
        if (pref === 'decline') {
          log(game, actorName(game, targetActor) + '选择不发动【遗计】。');
          return { declinedYiji: true };
        }
        if (pref === 'ask') {
          // Start per-point iteration. pauseState tracks remaining points
          // so resolveYijiDistributeChoice can fire the next point after
          // each prompt resolves.
          game.pauseState = game.pauseState || {};
          game.pauseState.yiji = {
            targetActor: targetActor,
            remainingPoints: context.amount,
            totalPoints: context.amount
          };
          return fireNextYijiPoint(game);
        }
        // Auto path: batched single-shot — draw 2 × amount, keep all.
        for (var i = 0; i < context.amount; i += 1) {
          drawCards(game, targetActor, 2);
          log(game, actorName(game, targetActor) + '发动【遗计】（第 ' + (i + 1) + ' / ' + context.amount + ' 点），摸两张牌。');
        }
        return { triggeredYiji: true, drawPairs: context.amount };
      }

      function fireNextYijiPoint(game) {
        var saved = game.pauseState && game.pauseState.yiji;
        if (!saved || saved.remainingPoints <= 0) {
          if (game.pauseState) game.pauseState.yiji = null;
          return { ok: true, message: '遗计完成。' };
        }
        var targetActor = saved.targetActor;
        var target = game[targetActor];
        if (!target) return fail('未知角色。');
        var currentPoint = saved.totalPoints - saved.remainingPoints + 1;
        var batch = drawCards(game, targetActor, 2);
        log(game, actorName(game, targetActor) + '发动【遗计】（第 ' + currentPoint + ' / ' + saved.totalPoints + ' 点），摸两张牌。');
        if (batch.length === 0) {
          // Deck exhausted; advance without prompting.
          saved.remainingPoints -= 1;
          return fireNextYijiPoint(game);
        }
        var drawnIds = batch.map(function (c) { return c.id; });
        var cards = drawnIds.map(function (id) {
          var c = target.hand.find(function (item) { return item.id === id; });
          return c ? { id: c.id, name: c.name, type: c.type, suit: c.suit, rank: c.rank } : null;
        }).filter(Boolean);
        game.pendingChoice = {
          kind: 'yiji-distribute',
          actor: targetActor,
          drawnIds: drawnIds,
          cards: cards,
          currentPoint: currentPoint,
          totalPoints: saved.totalPoints
        };
        return { suspendedForYiji: true };
      }

      // 刚烈 — spec has two distinct player-choice points the v5/v6 engine
      // collapsed:
      //   (a) 夏侯惇's choice to TRIGGER the judgement at all (spec:
      //       "夏侯惇 选择 触发反制判定"). v5/v6 auto-fired.
      //   (b) Source's choice between 弃 2 张牌 OR 受 1 点伤害 (spec:
      //       "伤害来源 选择 弃置两张牌或承受1点伤害"). v5/v6 forced
      //       discard if source had ≥ 2 hand cards, otherwise forced
      //       damage; source never got to pick.
      //   Plus: spec says "弃置两张 牌" (any cards: hand OR equipment) and
      //   source picks WHICH 2 — v5/v6 took source.hand.shift()×2 (oldest
      //   two hand cards) with no choice and no equipment included.
      //
      // v6.1 flow:
      //   1. Determine 夏侯惇's preference; if 'decline', skip. If 'ask'
      //      (player default), set pendingChoice 'ganglie-fire' for a
      //      yes/no prompt. AI 'auto' goes straight to step 2.
      //   2. resolveGanglieFireChoice with decision.fire === true (or
      //      auto-fire) runs the judgement.
      //   3. Heart judgement → no retaliation, return.
      //   4. Non-heart judgement → check source's preference:
      //      - 'ask' (player default): pendingChoice 'ganglie-source-choice'
      //        with the candidate list (hand + equipment) plus a take-1
      //        button. Source picks { mode, cardIds? }.
      //      - 'auto' (AI default): runGanglieSourceAutoChoice — discard
      //        the 2 lowest-value gainable cards if source has ≥ 2 cards,
      //        else take 1 damage.
      function triggerGanglieDamageAfter(context) {
        var game = context.game;
        var targetActor = context.targetActor;
        var sourceActor = context.sourceActor;
        var target = game[targetActor];
        var source = game[sourceActor];
        if (!target || !sourceActor || !source || !hasSkill(target, 'ganglie') || game.phase === 'gameover') return null;
        var pref = (target.skillPreferences && target.skillPreferences.ganglie)
          || (targetActor === 'player' ? 'ask' : 'auto');
        if (pref === 'decline') {
          log(game, actorName(game, targetActor) + '选择不发动【刚烈】。');
          return { declinedGanglie: true };
        }
        if (pref === 'ask') {
          game.pendingChoice = {
            kind: 'ganglie-fire',
            actor: targetActor,
            sourceActor: sourceActor,
            sourceName: actorName(game, sourceActor)
          };
          return { suspendedForGanglieFire: true };
        }
        return runGanglieJudgement(game, targetActor, sourceActor);
      }

      function runGanglieJudgement(game, targetActor, sourceActor) {
        var target = game[targetActor];
        var source = game[sourceActor];
        if (!source) return null;
        var ganglieJudge = judge(game, targetActor, '【刚烈】');
        var retaliates = !!(ganglieJudge && ganglieJudge.suit !== 'heart');
        resolveJudgementCard(game, targetActor, target, '【刚烈】', ganglieJudge);
        if (!ganglieJudge) {
          log(game, actorName(game, targetActor) + '发动【刚烈】，但没有判定牌。');
          return { triggeredGanglie: true, retaliated: false };
        }
        if (!retaliates) {
          log(game, actorName(game, targetActor) + '发动【刚烈】，判定为红桃，未触发反制。');
          return { triggeredGanglie: true, retaliated: false };
        }
        // Spec gives source two options (discard 2 or take 1 damage). If
        // source has < 2 discardable cards, the discard branch is
        // unavailable — short-circuit to take-damage with no prompt.
        var candidates = collectGanglieDiscardCandidates(source);
        if (candidates.length < 2) {
          log(game, actorName(game, sourceActor) + '无法弃置两张牌，因【刚烈】受到 1 点伤害。');
          damage(game, sourceActor, 1, targetActor, '【刚烈】', null, 'normal');
          return { triggeredGanglie: true, retaliated: true, dealtDamage: true };
        }
        var sourcePref = (source.skillPreferences && source.skillPreferences.ganglieSource)
          || (sourceActor === 'player' ? 'ask' : 'auto');
        if (sourcePref === 'ask') {
          game.pendingChoice = {
            kind: 'ganglie-source-choice',
            actor: sourceActor,
            targetActor: targetActor,
            candidates: candidates
          };
          return { suspendedForGanglieSource: true };
        }
        return runGanglieSourceAutoChoice(game, targetActor, sourceActor);
      }

      function collectGanglieDiscardCandidates(source) {
        var list = [];
        if (source.hand) {
          source.hand.forEach(function (c) {
            list.push({ zone: 'hand', id: c.id, name: c.name, suit: c.suit, rank: c.rank });
          });
        }
        ['weapon', 'armor', 'horseMinus', 'horsePlus'].forEach(function (slot) {
          var card = source.equipment && source.equipment[slot];
          if (card) list.push({ zone: 'equipment', slot: slot, id: card.id, name: card.name, suit: card.suit, rank: card.rank });
        });
        return list;
      }

      function applyGanglieDiscardCards(game, sourceActor, cardIds) {
        var source = game[sourceActor];
        var discarded = [];
        for (var i = 0; i < cardIds.length; i += 1) {
          var id = cardIds[i];
          // Hand?
          var handIdx = source.hand.findIndex(function (c) { return c.id === id; });
          if (handIdx >= 0) {
            var hcard = source.hand.splice(handIdx, 1)[0];
            discardCard(game, hcard);
            discarded.push(hcard);
            continue;
          }
          // Equipment slot?
          var slotKey = ['weapon', 'armor', 'horseMinus', 'horsePlus'].find(function (s) {
            return source.equipment && source.equipment[s] && source.equipment[s].id === id;
          });
          if (slotKey) {
            var ecard = source.equipment[slotKey];
            source.equipment[slotKey] = null;
            discardCard(game, ecard);
            discarded.push(ecard);
          }
        }
        return discarded;
      }

      function runGanglieSourceAutoChoice(game, targetActor, sourceActor) {
        var source = game[sourceActor];
        var candidates = collectGanglieDiscardCandidates(source);
        if (candidates.length >= 2) {
          // AI heuristic: discard the 2 lowest-scoring hand cards (prefer
          // not to discard equipment); fall through to take-damage if
          // somehow not enough hand cards either.
          var scored = candidates
            .filter(function (e) { return e.zone === 'hand'; })
            .map(function (e) {
              var card = source.hand.find(function (c) { return c.id === e.id; });
              return { entry: e, score: card ? scoreCardForAI(game, sourceActor, card) : 0 };
            })
            .sort(function (a, b) { return a.score - b.score; });
          if (scored.length >= 2) {
            var ids = [scored[0].entry.id, scored[1].entry.id];
            var disc = applyGanglieDiscardCards(game, sourceActor, ids);
            log(game, actorName(game, sourceActor) + '因【刚烈】弃置两张牌：' + disc.map(function (c) { return '【' + c.name + '】'; }).join('、') + '。');
            return { triggeredGanglie: true, retaliated: true, discardedCards: true };
          }
        }
        log(game, actorName(game, sourceActor) + '无法弃置两张牌，因【刚烈】受到 1 点伤害。');
        damage(game, sourceActor, 1, targetActor, '【刚烈】', null, 'normal');
        return { triggeredGanglie: true, retaliated: true, dealtDamage: true };
      }

      function resolveGanglieFireChoice(game, pending, decision) {
        var holder = pending.actor;
        var sourceActor = pending.sourceActor;
        if (!decision.fire) {
          log(game, actorName(game, holder) + '选择不发动【刚烈】。');
          return success('刚烈：未发动。');
        }
        var result = runGanglieJudgement(game, holder, sourceActor);
        if (result && result.suspendedForGanglieSource) {
          return success('刚烈：等待来源选择。');
        }
        return success('刚烈完成。');
      }

      function resolveGanglieSourceChoice(game, pending, decision) {
        var sourceActor = pending.actor;
        var targetActor = pending.targetActor;
        var source = game[sourceActor];
        if (!source) return fail('未知角色。');
        if (decision.mode === 'takeDamage') {
          log(game, actorName(game, sourceActor) + '选择因【刚烈】受到 1 点伤害。');
          damage(game, sourceActor, 1, targetActor, '【刚烈】', null, 'normal');
          return success('刚烈完成（受 1 伤）。');
        }
        if (decision.mode === 'discard') {
          var cardIds = Array.isArray(decision.cardIds) ? decision.cardIds : [];
          if (cardIds.length !== 2) {
            game.pendingChoice = pending;
            return fail('请选择两张牌弃置（或选择受 1 点伤害）。');
          }
          // Validate each id is in pending.candidates (i.e. source's
          // hand-or-equipment at the moment the prompt fired).
          var validIds = pending.candidates.map(function (e) { return e.id; });
          for (var i = 0; i < cardIds.length; i += 1) {
            if (validIds.indexOf(cardIds[i]) < 0) {
              game.pendingChoice = pending;
              return fail('选择的牌不在可弃置列表中。');
            }
          }
          if (cardIds[0] === cardIds[1]) {
            game.pendingChoice = pending;
            return fail('需要两张不同的牌。');
          }
          var disc = applyGanglieDiscardCards(game, sourceActor, cardIds);
          if (disc.length !== 2) {
            // Shouldn't happen because we validated, but guard anyway.
            game.pendingChoice = pending;
            return fail('弃置失败，请重新选择。');
          }
          log(game, actorName(game, sourceActor) + '因【刚烈】弃置两张牌：' + disc.map(function (c) { return '【' + c.name + '】'; }).join('、') + '。');
          return success('刚烈完成（弃 2 牌）。');
        }
        game.pendingChoice = pending;
        return fail('请选择：弃两张牌 或 受 1 点伤害。');
      }

      function triggerTianduJudgementAfterResolve(context) {
        var game = context.game;
        var actor = context.actor;
        var state = context.state || game[actor];
        var physicalCard = physicalCardOf(context.card);
        if (!state || !physicalCard || !hasSkill(state, 'tiandu')) return null;
        state.hand.push(physicalCard);
        context.claimed = true;
        log(game, actorName(game, actor) + '发动【天妒】，获得了判定牌【' + physicalCard.name + '】。');
        return { claimedJudgementCard: true };
      }

      // 鬼才 — spec: "任意判定牌翻出后、判定结果生效前... 司马懿有可打出
      // 的手牌". The skill fires whenever ANY judgement happens at the table
      // and any actor with 鬼才 has hand cards — it is NOT restricted to
      // 司马懿's own judgements. Priority order if multiple actors hold the
      // skill: judgement actor first (so 司马懿's own judgement uses his own
      // hand), then opponent (so 司马懿 can replace opponent judgements with
      // his own hand cards).
      //
      // pausable: only processJudgeArea-driven judgements can suspend the
      // engine for a player prompt (it has the pauseState snapshot path to
      // resume). For non-pausable judgements (bagua armor, ganglie retal-
      // iation judge, tieqi judge), the 'ask' preference cannot be honored
      // mid-flow — those fall back to auto-fire (hand[0]).
      //
      // skillPreferences.guicai overrides per holder:
      //   'auto'    — always pick hand[0] without prompting
      //   'decline' — never fire 鬼才 this trigger
      //   undefined — 'ask' for human player, 'auto' for AI
      function triggerGuicaiJudgementBeforeResolve(context) {
        var game = context.game;
        var judgementActor = context.actor;
        var originalCard = context.originalCard || context.card;
        if (!game || !originalCard || context.replaced) return null;
        // Find any actor at the table who can fire 鬼才.
        var order = [judgementActor, opponent(judgementActor)];
        var holder = null;
        for (var i = 0; i < order.length; i += 1) {
          var s = game[order[i]];
          if (s && hasSkill(s, 'guicai') && s.hand && s.hand.length > 0) {
            holder = order[i];
            break;
          }
        }
        if (!holder) return null;
        var holderState = game[holder];
        var pref = (holderState.skillPreferences && holderState.skillPreferences.guicai)
          || (holder === 'player' ? 'ask' : 'auto');
        if (pref === 'decline') {
          log(game, actorName(game, holder) + '选择不发动【鬼才】。');
          return { declinedGuicai: true };
        }
        if (pref === 'ask' && context.pausable) {
          // Set pendingChoice; processJudgeArea will detect this and snapshot
          // its iteration state. resolveGuicaiReplaceChoice takes the
          // replacement from holder.hand and resumes from the saved trick.
          game.pendingChoice = {
            kind: 'guicai-replace',
            actor: holder,
            judgementActor: judgementActor,
            reason: context.reason || '',
            judgementCard: {
              id: originalCard.id, name: originalCard.name,
              type: originalCard.type, suit: originalCard.suit,
              rank: originalCard.rank
            },
            candidates: holderState.hand.map(function (c) {
              return { id: c.id, name: c.name, type: c.type, suit: c.suit, rank: c.rank };
            })
          };
          return { suspendedForGuicai: true };
        }
        // Auto path (pref === 'auto', AI default, or non-pausable judgement):
        // v8 PR-D2: 不再 hand[0], 改 lowest-score 手牌 (scoreCardForAI). 鬼才
        // 把手牌投出当作新判定牌, 选最不值钱的减少损失. 注意: 这里不优化
        // 判定结果合不合适 (那需要 outcome lookahead, 留给 D3+).
        var sortedGuicai = holderState.hand
          .map(function (card) { return { card: card, score: scoreCardForAI(game, holder, card) }; })
          .sort(function (a, b) { return a.score - b.score; });
        var replacement = sortedGuicai[0].card;
        var paidCard = removeCardFromHand(holderState, replacement.id);
        if (!paidCard) return null;
        discardCard(game, originalCard);
        context.card = replacement;
        context.replaced = true;
        log(game, actorName(game, holder) + '发动【鬼才】，用【' + replacement.name + '】' + replacement.suit + ' ' + replacement.rank + '（' + replacement.id + '）代替' + actorName(game, judgementActor) + '的判定牌。');
        return { replacedJudgementCard: true, holder: holder, originalCard: originalCard, replacementCard: replacement };
      }

      function triggerLongdanCardAs(context) {
        var state = context.state;
        if (!state || !hasSkill(state, 'longdan')) return null;
        if (context.asType === 'shan' && context.mode === 'response') {
          var shaCard = firstMatchingCard(state, function (item) { return isShaCard(item); });
          return shaCard ? { card: shaCard, asName: '闪', skillName: '龙胆', priority: 20 } : null;
        }
        if (context.asType !== 'sha') return null;
        if (context.mode === 'response') {
          var shanCard = firstMatchingCard(state, function (item) { return item.type === 'shan'; });
          return shanCard ? { card: shanCard, asName: '杀', skillName: '龙胆', priority: 20 } : null;
        }
        if (context.card && context.card.type === 'shan') {
          return { card: context.card, asName: '杀', skillName: '龙胆', priority: 20 };
        }
        return null;
      }

      function triggerWushengCardAs(context) {
        var state = context.state;
        if (!state || !hasSkill(state, 'wusheng') || context.asType !== 'sha') return null;
        if (context.mode === 'response') {
          // v6.1: spec condition is "发动者有红色手牌**或装备牌**" — scan
          // both zones for a red card to use as 杀.
          var redCard = firstMatchingOwnCard(state, function (item) { return item.color === 'red'; });
          return redCard ? { card: redCard, asName: '杀', skillName: '武圣', priority: 10 } : null;
        }
        if (context.card && context.card.color === 'red') {
          return { card: context.card, asName: '杀', skillName: '武圣', priority: 10 };
        }
        return null;
      }

      function triggerQingguoCardAs(context) {
        var state = context.state;
        if (!state || !hasSkill(state, 'qingguo')) return null;
        if (context.mode !== 'response' || context.asType !== 'shan') return null;
        var blackCard = firstMatchingCard(state, function (item) { return item.color === 'black'; });
        return blackCard ? { card: blackCard, asName: '闪', skillName: '倾国', priority: 10 } : null;
      }

      // v8 PR-C2: 流离 (大乔) — gltjk card__hero__wu.md：
      //   "每当你成为【杀】的目标时, 你可以弃置一张牌并选择你攻击范围内的一名
      //    角色, 将此【杀】转移给该角色。"
      // ◆ 目标须为源此【杀】的合法目标 (不检测距离)。
      // 1v1 注: 攻击范围内除大乔外只剩源, 而源不能用杀指自己 → 候选恒空 →
      // 函数返回 null, 流离 静默不触发。多人模式下 hook 自动产生候选, 但
      // 实际 transfer / pendingChoice 暂留未来 PR。
      // 返回结构 (multi-player 预留):
      //   { paused: true, candidates: [...] } 若需要 pendingChoice
      //   { transferred: true, newTarget: 'p3' } 若自动转移
      //   null  若无可行转移 (1v1 默认)
      function triggerLiuliOnShaTargeted(context) {
        var target = context.target;
        if (!target || !hasSkill(target, 'liuli')) return null;
        // 必须有可弃牌 (手牌 / 装备区 / 判定区)
        var totalCards = (target.hand || []).length
          + equipmentList(target).length
          + (target.judgeArea || []).length;
        if (totalCards === 0) return null;
        // 候选 = 大乔攻击范围内 & 非自己 & 非源 & 源此杀的合法目标
        var game = context.game;
        var targetActor = context.targetActor;
        var sourceActor = context.sourceActor;
        var candidates = [];
        // 1v1 中 game 只有 player / enemy 两个 actor — 框架性遍历, 多人模式
        // 时只需扩展 game.actors 列表即可生效
        ['player', 'enemy'].forEach(function (a) {
          if (a === targetActor) return;
          if (a === sourceActor) return;  // spec 限定: 须为源的杀合法目标; 源对自己永远非法
          if (!game[a]) return;
          // 攻击范围检测: target 的 weaponRange 覆盖 a (距离 ≤ range)
          if (!canReachWithSha(game, targetActor, a)) return;
          // 须为源此杀的合法目标 (sourceCard 的 onCardTarget 检测)
          var protection = cardTargetProtection(game, sourceActor, a, context.card, '杀');
          if (protection) return;
          candidates.push(a);
        });
        if (candidates.length === 0) return null;
        // 多人模式扩展点: 此处应 pendingChoice 让大乔挑候选 + 弃牌
        // 1v1 不会到达这里, 留空逻辑作 reserved scaffolding
        return null;
      }

      // v8 PR-C1: 国色 (大乔) — gltjk skill cache：
      //   "出牌阶段，你可以将一张方片牌当【乐不思蜀】使用。"
      // 仅 proactive 模式（出牌阶段主动用方片当乐），不影响 response 流程。
      function triggerGuoseCardAs(context) {
        var state = context.state;
        if (!state || !hasSkill(state, 'guose')) return null;
        if (context.mode !== 'proactive' || context.asType !== 'lebusishu') return null;
        if (!context.card || context.card.suit !== 'diamond') return null;
        return { card: context.card, asName: '乐不思蜀', skillName: '国色', priority: 10 };
      }

      function triggerZhihengActiveSkill(context) {
        if (context.skillId !== 'zhiheng') return null;
        var game = context.game;
        var actor = context.actor;
        var self = context.state;
        var cardIds = context.cardIds || [];
        if (!self || !hasSkill(self, 'zhiheng')) return null;
        if (self.flags.zhihengUsed) return fail('【制衡】每回合限一次。');
        if (!cardIds.length) return fail('请选择要弃置的牌。');
        // v6.1: spec cost is "弃置任意数量手牌**或装备区牌**". We accept ids
        // from either zone via removeOwnCardFromAnyZone; equipment slots are
        // cleared when a card is taken from them.
        var discarded = [];
        for (var i = 0; i < cardIds.length; i += 1) {
          var card = removeOwnCardFromAnyZone(self, cardIds[i]);
          if (card) {
            discarded.push(card);
            discardCard(game, card);
          }
        }
        if (!discarded.length) return fail('没有成功弃置任何牌。');
        self.flags.zhihengUsed = true;
        log(game, actorName(game, actor) + '发动【制衡】，弃置 ' + discarded.length + ' 张牌并摸等量牌。');
        drawCards(game, actor, discarded.length);
        return success('制衡完成。');
      }

      function triggerKurouActiveSkill(context) {
        if (context.skillId !== 'kurou') return null;
        var game = context.game;
        var actor = context.actor;
        var self = context.state;
        if (!self || !hasSkill(self, 'kurou')) return null;
        // v6.1: spec condition is "发动者存活" — hp must be > 0, not > 1.
        // Allow hp=1 → 0; this 1v1-minimal engine treats hp≤0 as immediate
        // game-over (the multi-player 濒死/桃 救援 flow isn't modeled here).
        // Effect order per spec: "失去 1 点体力，然后摸两张牌". We draw the
        // 2 cards before tripping the game-over branch so 黄盖's hand still
        // reflects the spec sequence in any log readback.
        if (self.hp < 1) return fail('体力不足，不能发动【苦肉】。');
        self.hp -= 1;
        log(game, actorName(game, actor) + '发动【苦肉】，失去 1 点体力并摸两张牌。');
        drawCards(game, actor, 2);
        if (self.hp <= 0 && game.phase !== 'gameover') {
          // v7 PR-13: 苦肉 把 hp 降到 0 时，按 spec 进入濒死结算（不直接 game-over）
          enterDying(game, actor, actor);
        }
        return success('苦肉完成。');
      }

      // v8 PR-C4: 青囊 (华佗) — gltjk card__hero__neutral.md:
      //   "出牌阶段限一次，你可以弃置一张手牌并选择一名已受伤的角色，
      //    令其回复 1 点体力。"
      // 1v1 实现：target 可为 'player' / 'enemy' / 'self'，最终由
      // options.target 决定；未指定时默认对方（若对方受伤），否则自身。
      function triggerQingnangActiveSkill(context) {
        if (context.skillId !== 'qingnang') return null;
        var game = context.game;
        var actor = context.actor;
        var self = context.state;
        var cardIds = context.cardIds || [];
        var options = context.options || {};
        if (!self || !hasSkill(self, 'qingnang')) return null;
        if (self.flags.qingnangUsed) return fail('【青囊】每回合限一次。');
        if (!cardIds.length) return fail('请选择要弃置的一张手牌。');
        var targetActor = options.target || options.targetActor;
        if (targetActor === 'self') targetActor = actor;
        if (targetActor !== 'player' && targetActor !== 'enemy') {
          var opp = game[opponent(actor)];
          if (opp && opp.hp < opp.maxHp) targetActor = opponent(actor);
          else if (self.hp < self.maxHp) targetActor = actor;
          else return fail('没有已受伤的角色，无法发动【青囊】。');
        }
        var target = game[targetActor];
        if (!target) return fail('目标无效。');
        if (target.hp >= target.maxHp) return fail('目标未受伤，不能发动【青囊】。');
        var costCard = removeCardFromHand(self, cardIds[0]);
        if (!costCard) return fail('选择的手牌不存在。');
        discardCard(game, costCard);
        self.flags.qingnangUsed = true;
        target.hp = Math.min(target.maxHp, target.hp + 1);
        log(game, actorName(game, actor) + '发动【青囊】，弃置【' + costCard.name + '】，令' + actorName(game, targetActor) + '回复 1 点体力。');
        return success('青囊完成。');
      }

      function triggerRendeActiveSkill(context) {
        if (context.skillId !== 'rende') return null;
        var game = context.game;
        var actor = context.actor;
        var self = context.state;
        var cardIds = context.cardIds || [];
        var target = game[context.targetActor];
        if (!self || !target || !hasSkill(self, 'rende')) return null;
        if (!cardIds.length) return fail('请选择要给出的牌。');
        var given = [];
        cardIds.forEach(function (id) {
          var giveCard = removeCardFromHand(self, id);
          if (giveCard) {
            given.push(giveCard);
            target.hand.push(giveCard);
          }
        });
        if (!given.length) return fail('没有成功给出任何牌。');
        self.flags.rendeGiven = (self.flags.rendeGiven || 0) + given.length;
        log(game, actorName(game, actor) + '发动【仁德】，交给' + actorName(game, context.targetActor) + ' ' + given.length + ' 张牌。');
        if (self.flags.rendeGiven >= 2 && !self.flags.rendeHealed && self.hp < self.maxHp) {
          self.hp = Math.min(self.maxHp, self.hp + 1);
          self.flags.rendeHealed = true;
          log(game, actorName(game, actor) + '因【仁德】回复 1 点体力。');
        }
        return success('仁德完成。');
      }

      // 反间 — spec: source picks a hand card and gives it to target; **the
      // TARGET then guesses the card's suit**. If wrong, target takes 1
      // damage from the source. The v5/v6 engine took the guess from the
      // source's options (default 'spade') — that's the source effectively
      // guessing for the target, which inverts the rule.
      //
      // v6.1 flow:
      // 1. Source uses 反间, picks a hand card, transfers to target.
      // 2. Set game.pendingChoice = { kind: 'fanjian-guess', actor: target,
      //    sourceActor, cardName, cardId } so the target's UI / AI can pick
      //    a suit blindly.
      // 3. resolveFanjianGuessChoice validates suit and applies damage if
      //    the target's guess doesn't match the card's actual suit.
      //
      // Backward compat: if options.guessedSuit is provided (legacy test
      // paths), skip the prompt and apply the guess directly so existing
      // assertions keep working without modification.
      function triggerFanjianActiveSkill(context) {
        if (context.skillId !== 'fanjian') return null;
        var game = context.game;
        var actor = context.actor;
        var self = context.state;
        var cardIds = context.cardIds || [];
        var targetActor = context.targetActor;
        var target = game[targetActor];
        var options = context.options || {};
        if (!self || !target || !hasSkill(self, 'fanjian')) return null;
        if (self.flags.fanjianUsed) return fail('【反间】每回合限一次。');
        if (!cardIds.length) return fail('请选择一张交给对方的牌。');
        var fanjianCard = removeCardFromHand(self, cardIds[0]);
        if (!fanjianCard) return fail('选择的牌不存在。');
        target.hand.push(fanjianCard);
        self.flags.fanjianUsed = true;
        log(game, actorName(game, actor) + '发动【反间】，将【' + fanjianCard.name + '】交给' + actorName(game, targetActor) + '。');

        // Backward-compat override: explicit guess from caller skips the prompt.
        if (options.guessedSuit) {
          return applyFanjianGuess(game, actor, targetActor, fanjianCard, options.guessedSuit);
        }

        if (targetActor === 'player') {
          // Set pendingChoice; the player UI shows the card NAME but not
          // suit, then 4 suit buttons.
          game.pendingChoice = {
            kind: 'fanjian-guess',
            actor: targetActor,
            sourceActor: actor,
            cardId: fanjianCard.id,
            cardName: fanjianCard.name
          };
          return { suspendedForFanjian: true };
        }
        // AI target: blind random guess from {spade, heart, club, diamond}.
        return applyFanjianGuess(game, actor, targetActor, fanjianCard, randomSuit(game));
      }

      function randomSuit(game) {
        var suits = ['spade', 'heart', 'club', 'diamond'];
        var r = (game.random && typeof game.random === 'function') ? game.random() : Math.random();
        var idx = Math.floor(r * 4) % 4;
        if (idx < 0 || idx >= 4) idx = 0;
        return suits[idx];
      }

      function applyFanjianGuess(game, sourceActor, targetActor, fanjianCard, guessedSuit) {
        log(game, actorName(game, targetActor) + '猜测【' + fanjianCard.name + '】的花色为「' + guessedSuit + '」（实际：' + fanjianCard.suit + '）。');
        if (guessedSuit !== fanjianCard.suit) {
          log(game, '猜错，' + actorName(game, targetActor) + '受到 1 点伤害。');
          damage(game, targetActor, 1, sourceActor, '【反间】', null, 'normal');
        } else {
          log(game, '猜对，无伤害。');
        }
        return success('反间完成。');
      }

      function resolveFanjianGuessChoice(game, pending, decision) {
        var targetActor = pending.actor;
        var sourceActor = pending.sourceActor;
        var target = game[targetActor];
        if (!target) return fail('未知角色。');
        var fanjianCard = target.hand.find(function (c) { return c.id === pending.cardId; });
        if (!fanjianCard) return fail('找不到【反间】所交的牌。');
        var guess = decision && decision.suit;
        if (['spade', 'heart', 'club', 'diamond'].indexOf(guess) < 0) {
          // Restore pending so UI can keep prompting on invalid input.
          game.pendingChoice = pending;
          return fail('请选择有效的花色（spade/heart/club/diamond）。');
        }
        return applyFanjianGuess(game, sourceActor, targetActor, fanjianCard, guess);
      }

      // v6.1: count = min(aliveActorCount, 5, deckSize). 1v1 ⇒ 2 (was hardcoded 5).
      function triggerGuanxingPreview(context) {
        if (context.skillId !== 'guanxing') return null;
        var game = context.game;
        var self = context.state;
        if (!self || !hasSkill(self, 'guanxing')) return fail('没有【观星】。');
        var alive = StateRuntime.aliveActorCount(game);
        var count = Math.min(alive || 0, 5, game.deck.length);
        var preview = success('观星预览完成。');
        preview.cards = count > 0 ? game.deck.slice(game.deck.length - count) : [];
        return preview;
      }

      // v6.1: new API `{ topIds, bottomIds }` lets the player put any subset of
      // previewed cards at the deck top (in given order) and the rest at the
      // deck bottom (in given order). topIds[0] is drawn first; bottomIds[0]
      // is the first drawn of the bottom pile (after the existing deck below
      // the preview is exhausted); bottomIds[last] is the very bottom of the
      // deck. Cards not mentioned in either list stay on top, in their
      // original preview order, below any explicit topCards. The legacy
      // `orderIds` field is treated as an alias for `topIds` with the same
      // top-first semantic.
      function triggerGuanxingActiveSkill(context) {
        if (context.skillId !== 'guanxing') return null;
        var game = context.game;
        var actor = context.actor;
        var self = context.state;
        var options = context.options || {};
        if (!self || !hasSkill(self, 'guanxing')) return null;
        if (self.flags.guanxingUsed) return fail('【观星】每回合限一次。');
        var preview = triggerGuanxingPreview(context);
        if (!preview.ok) return preview;
        var count = preview.cards.length;
        var visibleCards = preview.cards.slice();

        var topIds = options.topIds || options.orderIds || null;
        var bottomIds = options.bottomIds || null;

        if (count > 0 && (topIds || bottomIds)) {
          var idToCard = {};
          preview.cards.forEach(function (card) { idToCard[card.id] = card; });
          var remaining = preview.cards.slice();
          var topCards = [];
          var bottomCards = [];

          if (topIds) {
            for (var i = 0; i < topIds.length; i += 1) {
              var idx = remaining.findIndex(function (c) { return c.id === topIds[i]; });
              if (idx >= 0) topCards.push(remaining.splice(idx, 1)[0]);
            }
          }
          if (bottomIds) {
            for (var j = 0; j < bottomIds.length; j += 1) {
              var bidx = remaining.findIndex(function (c) { return c.id === bottomIds[j]; });
              if (bidx >= 0) bottomCards.push(remaining.splice(bidx, 1)[0]);
            }
          }

          var below = game.deck.slice(0, game.deck.length - count);
          // Final deck array (index 0 = bottom of deck, last = top via pop):
          //   [bottomCards.reverse(), ...below, ...remaining, ...topCards.reverse()]
          // bottomCards[0] ends up at the END of the bottom segment (popped
          // first among the bottom pile, after existing deck-below exhausts).
          // bottomCards[last] ends up at index 0 of the array = absolute
          // bottom of the deck. topCards[0] ends up at the END of the array,
          // popped first. Remaining preview cards (unassigned by either list)
          // stay in preview order on top of `below`, BELOW the explicit
          // topCards in the top region.
          game.deck = bottomCards.slice().reverse()
            .concat(below)
            .concat(remaining)
            .concat(topCards.slice().reverse());
        }

        if (count > 0) {
          log(game, actorName(game, actor) + '发动【观星】，观看牌堆顶 ' + count + ' 张牌。');
        } else {
          log(game, actorName(game, actor) + '发动【观星】，但牌堆已无可观看的牌。');
        }
        self.flags.guanxingUsed = true;
        var guanxingResult = success('观星完成。');
        guanxingResult.cards = visibleCards;
        guanxingResult.topIds = (topIds || []).slice();
        guanxingResult.bottomIds = (bottomIds || []).slice();
        return guanxingResult;
      }

      function equipCard(game, actor, card) {
        var self = game[actor];
        if (!self) return fail('未知角色。');
        if (!card || card.family !== 'equipment') return fail('这不是装备牌。');
        var slot = card.slot || (CARD_CATALOG[card.type] && CARD_CATALOG[card.type].slot);
        if (!slot) return fail('装备槽位未知。');
        removeCardFromHand(self, card.id);
        if (self.equipment[slot]) {
          discardCard(game, self.equipment[slot]);
          log(game, actorName(game, actor) + '替换并弃置了原有装备【' + self.equipment[slot].name + '】。');
        }
        self.equipment[slot] = card;
        log(game, actorName(game, actor) + '装备了【' + card.name + '】。');
        return success('装备成功。');
      }

      function loseEquipment(game, actor, slot) {
        var self = game[actor];
        if (!self || !self.equipment) return fail('未知角色。');
        var card = self.equipment[slot];
        if (!card) return fail('该槽位没有装备。');
        self.equipment[slot] = null;
        discardCard(game, card);
        log(game, actorName(game, actor) + '失去了【' + card.name + '】。');
        if (card.type === 'baiyin' && self.hp > 0 && self.hp < self.maxHp) {
          self.hp = Math.min(self.maxHp, self.hp + 1);
          log(game, actorName(game, actor) + '因失去【白银狮子】回复 1 点体力。');
        }
        return success('失去装备。');
      }

      // v7 PR-3: 麒麟弓 — gltjk card__equipment.md：
      //   "每当你使用【杀】对目标角色造成伤害时，你可以弃置其装备区里的
      //    一张坐骑牌。"
      // 关键：弃【一张】，而非两张；且 "你可以" → 可选。
      //
      // skillPreferences.qilin（写入发动者 state）：
      //   'auto'    (AI/enemy 默认): 总是触发；目标有 2 匹马时默认弃 +1 马
      //   'ask'     (player 默认):   2 匹马时 pendingChoice 让 source 选；
      //                              1 匹马仍自动弃（没的选）
      //   'decline':                 完全不触发
      function applyQilinDiscard(game, sourceActor, targetActor) {
        var target = game[targetActor];
        if (!target || !target.equipment) return;
        var slots = [];
        if (target.equipment.horseMinus) slots.push('horseMinus');
        if (target.equipment.horsePlus) slots.push('horsePlus');
        if (slots.length === 0) return;
        var source = game[sourceActor];
        var pref = (source && source.skillPreferences && source.skillPreferences.qilin)
          || (sourceActor === 'player' ? 'ask' : 'auto');
        if (pref === 'decline') {
          log(game, actorName(game, sourceActor) + '选择不发动【麒麟弓】。');
          return;
        }
        if (slots.length === 1) {
          loseEquipment(game, targetActor, slots[0]);
          log(game, actorName(game, sourceActor) + '发动【麒麟弓】，弃置' + actorName(game, targetActor) + '的坐骑牌。');
          return;
        }
        // slots.length === 2
        if (pref === 'ask') {
          game.pendingChoice = {
            kind: 'qilin-pick',
            actor: sourceActor,
            target: targetActor,
            horseSlots: slots.slice()
          };
          return;
        }
        // 'auto': default heuristic — kill +1 马 first（多数情况对目标更具威胁）。
        loseEquipment(game, targetActor, 'horsePlus');
        log(game, actorName(game, sourceActor) + '发动【麒麟弓】，弃置' + actorName(game, targetActor) + '的【+1 马】。');
      }

      function resolveQilinPickChoice(game, pending, decision) {
        var sourceActor = pending.actor;
        var targetActor = pending.target;
        var sourceState = game[sourceActor];
        var targetState = game[targetActor];
        if (!sourceState || !targetState) return fail('未知角色。');
        if (decision && decision.decline) {
          log(game, actorName(game, sourceActor) + '选择不发动【麒麟弓】。');
          return success('麒麟弓已取消。');
        }
        var slot = decision && decision.slot;
        if (['horseMinus', 'horsePlus'].indexOf(slot) < 0) {
          game.pendingChoice = pending;
          return fail('请选择要弃置的坐骑（horseMinus / horsePlus）。');
        }
        if (pending.horseSlots.indexOf(slot) < 0
          || !targetState.equipment || !targetState.equipment[slot]) {
          game.pendingChoice = pending;
          return fail('该坐骑已不在装备区。');
        }
        loseEquipment(game, targetActor, slot);
        log(game, actorName(game, sourceActor) + '发动【麒麟弓】，弃置' + actorName(game, targetActor) + '的【' + (slot === 'horsePlus' ? '+1 马' : '-1 马') + '】。');
        return success('麒麟弓结算完成。');
      }

      // v8 PR-B1: 寒冰剑 — 由 damage() 在 hp 扣减前调用。源装寒冰且
      // sourceCard 是杀类时尝试触发。skillPreferences.hanbing:
      //   'auto'  (默认): 触发 → 按 装备 > 判定 > 手牌优先级弃 2 张, 防止伤害
      //   'decline':      不触发, 让伤害正常结算
      // 返回 {prevented:true} 表示防止伤害成功; 否则返回 null。
      // UI ask 模式待 PR-B1-bis 接入 pendingChoice 面板。
      function applyHanbingPrevent(game, sourceActor, targetActor) {
        var source = game[sourceActor];
        var target = game[targetActor];
        if (!source || !target) return null;
        var weapon = source.equipment && source.equipment.weapon;
        if (!weapon || weapon.type !== 'hanbing') return null;
        // 数有效牌总数 (手牌 + 装备 + 判定区)
        var equipsCount = equipmentList(target).length;
        var handCount = (target.hand || []).length;
        var judgeCount = (target.judgeArea || []).length;
        if (equipsCount + handCount + judgeCount === 0) return null;
        var pref = (source.skillPreferences && source.skillPreferences.hanbing) || 'auto';
        if (pref === 'decline') {
          log(game, actorName(game, sourceActor) + '选择不发动【寒冰剑】。');
          return null;
        }
        // auto / 其它: 按 装备 > 判定 > 手牌 顺序弃 2 张
        var discarded = 0;
        var equips = equipmentList(target).slice();
        for (var ei = 0; ei < equips.length && discarded < 2; ei += 1) {
          loseEquipment(game, targetActor, equips[ei].slot);
          discarded += 1;
        }
        var judges = (target.judgeArea || []).slice();
        for (var ji = 0; ji < judges.length && discarded < 2; ji += 1) {
          var jcard = target.judgeArea.shift();
          if (jcard) {
            discardCard(game, jcard);
            log(game, '【寒冰剑】依次弃置' + actorName(game, targetActor) + '判定区【' + jcard.name + '】。');
            discarded += 1;
          }
        }
        while (discarded < 2 && (target.hand || []).length > 0) {
          var hcard = target.hand.shift();
          if (hcard) {
            discardCard(game, hcard);
            log(game, '【寒冰剑】依次弃置' + actorName(game, targetActor) + '手牌【' + hcard.name + '】。');
            discarded += 1;
          }
        }
        log(game, actorName(game, sourceActor) + '发动【寒冰剑】，防止本次伤害并依次弃置' + actorName(game, targetActor) + ' ' + discarded + ' 张牌。');
        return { prevented: true, discarded: discarded };
      }

      function applyWeaponHitEffects(game, actor, targetActor) {
        var weapon = game[actor].equipment && game[actor].equipment.weapon;
        if (!weapon) return;
        if (weapon.type === 'qilin') {
          applyQilinDiscard(game, actor, targetActor);
        }
        // v7 PR-4: 雌雄双股剑 已经迁移到 "指定目标后" 时机 (applyCixiongOnDesignate)，
        // 不再于 applyWeaponHitEffects (post-damage) 触发——这样即便目标用闪
        // 闪避，雌雄仍按 spec 触发。
      }

      // v7 PR-4: 雌雄双股剑 — gltjk card__equipment.md：
      //   "每当你使用【杀】指定与你性别不同的一个目标后，
      //    你可以令其选择一项：1.弃置一张手牌；2.令你摸一张牌。"
      //
      // 时机：use-event step 5 "指定目标后"（响应窗口之前）。
      // 性别检查：source.gender !== target.gender 才触发。
      // 两个决策：
      //   1) source 可以选择是否发动（skillPreferences.cixiong）
      //   2) target 选择一项（skillPreferences.cixiongResponse）
      // 任一暂停 → pendingChoice + pauseState.playSha 保存 sha 上下文。
      function applyCixiongOnDesignate(game, sourceActor, targetActor) {
        var source = game[sourceActor];
        var target = game[targetActor];
        if (!source || !target) return null;
        var weapon = source.equipment && source.equipment.weapon;
        if (!weapon || weapon.type !== 'cixiong') return null;
        var sourceGender = source.gender;
        var targetGender = target.gender;
        if (!sourceGender || !targetGender || sourceGender === targetGender) return null;
        var sourcePref = (source.skillPreferences && source.skillPreferences.cixiong)
          || (sourceActor === 'player' ? 'ask' : 'auto');
        if (sourcePref === 'decline') {
          log(game, actorName(game, sourceActor) + '选择不发动【雌雄双股剑】。');
          return null;
        }
        if (sourcePref === 'ask') {
          game.pendingChoice = {
            kind: 'cixiong-fire',
            actor: sourceActor,
            target: targetActor
          };
          return { paused: true };
        }
        // 'auto' → fire immediately, proceed to target's choice.
        return fireCixiongTargetChoice(game, sourceActor, targetActor);
      }

      function fireCixiongTargetChoice(game, sourceActor, targetActor) {
        var source = game[sourceActor];
        var target = game[targetActor];
        log(game, actorName(game, sourceActor) + '发动【雌雄双股剑】，令' + actorName(game, targetActor) + '二选一。');
        if (!target.hand || target.hand.length === 0) {
          // No handcards → forced to option 2 (source draws 1).
          drawCards(game, sourceActor, 1);
          log(game, actorName(game, targetActor) + '没有手牌，' + actorName(game, sourceActor) + '摸一张牌。');
          return null;
        }
        var targetPref = (target.skillPreferences && target.skillPreferences.cixiongResponse)
          || (targetActor === 'player' ? 'ask' : 'auto');
        if (targetPref === 'auto') {
          // v8 PR-D2: 不再 deterministic 取 hand[0], 而是按 scoreCardForAI
          // 挑最不值钱的牌弃置 (受 hp/对方资源情况影响). 这样 target 留下
          // 真正有威胁的牌 (高分: 桃/无中/未用杀/酒).
          var sortedCixiong = target.hand
            .map(function (card) { return { card: card, score: scoreCardForAI(game, targetActor, card) }; })
            .sort(function (a, b) { return a.score - b.score; });
          var worstCard = sortedCixiong[0].card;
          var worstIdx = target.hand.findIndex(function (c) { return c.id === worstCard.id; });
          var dropped = target.hand.splice(worstIdx, 1)[0];
          discardCard(game, dropped);
          log(game, actorName(game, targetActor) + '因【雌雄双股剑】弃置【' + dropped.name + '】。');
          return null;
        }
        // 'ask' → pendingChoice for target.
        game.pendingChoice = {
          kind: 'cixiong-choose',
          actor: targetActor,
          sourceActor: sourceActor,
          handIds: target.hand.map(function (c) { return c.id; })
        };
        return { paused: true };
      }

      function resolveCixiongFireChoice(game, pending, decision) {
        var sourceActor = pending.actor;
        var targetActor = pending.target;
        if (!game[sourceActor] || !game[targetActor]) return fail('未知角色。');
        if (decision && (decision.decline || decision.fire === false)) {
          log(game, actorName(game, sourceActor) + '选择不发动【雌雄双股剑】。');
          return resumePlayShaAfterCixiong(game);
        }
        var targetResult = fireCixiongTargetChoice(game, sourceActor, targetActor);
        if (targetResult && targetResult.paused) {
          return success('等待目标选择…');
        }
        return resumePlayShaAfterCixiong(game);
      }

      function resolveCixiongChoose(game, pending, decision) {
        var targetActor = pending.actor;
        var sourceActor = pending.sourceActor;
        var target = game[targetActor];
        if (!target || !game[sourceActor]) return fail('未知角色。');
        var option = decision && decision.option;
        if (option === 'draw') {
          drawCards(game, sourceActor, 1);
          log(game, actorName(game, targetActor) + '选择让' + actorName(game, sourceActor) + '摸一张牌。');
        } else if (option === 'discard') {
          if (!target.hand.length) {
            drawCards(game, sourceActor, 1);
            log(game, actorName(game, targetActor) + '没有手牌，' + actorName(game, sourceActor) + '摸一张牌。');
          } else {
            var cardId = decision && decision.cardId;
            var idx = cardId ? target.hand.findIndex(function (c) { return c.id === cardId; }) : 0;
            if (idx < 0) idx = 0;
            var dropped = target.hand.splice(idx, 1)[0];
            discardCard(game, dropped);
            log(game, actorName(game, targetActor) + '弃置【' + dropped.name + '】响应【雌雄双股剑】。');
          }
        } else {
          game.pendingChoice = pending;
          return fail('请选择 discard 或 draw。');
        }
        return resumePlayShaAfterCixiong(game);
      }

      // v7 PR-9: 过河拆桥 1V1 — gltjk card__scroll.md：
      //   "你选择一项：1.弃置目标角色的装备区里的一张牌；2.观看目标角色的手牌
      //    并弃置其中一张牌。"
      // 调用方可通过 options.targetZone ('equipment' | 'hand') 直接指定（向后
      // 兼容老 UI）；'judge' 在 1V1 不合法。无显式选择时按 skillPreferences.guohe
      // (auto / ask / decline) 决定 — auto = 装备优先 → 手牌；ask = pendingChoice
      // 'guohe-1v1-pick' 暴露对手装备列表 + 手牌内容（spec: 选项 2 是 "观看
      // 目标角色的手牌并弃置其中一张"）。
      function resolveGuohe1v1(game, sourceActor, targetActor, options) {
        var target = game[targetActor];
        if (!target) return fail('未知角色。');
        var requestedZone = options && options.targetZone;
        if (requestedZone === 'judge') {
          return fail('1V1【过河拆桥】不能弃置判定区。');
        }
        if (requestedZone === 'equipment' || requestedZone === 'hand') {
          return executeGuohe1v1Pick(game, sourceActor, targetActor, requestedZone, options && options.targetCardId);
        }
        var sourceState = game[sourceActor];
        var pref = (sourceState && sourceState.skillPreferences && sourceState.skillPreferences.guohe)
          || (sourceActor === 'player' ? 'ask' : 'auto');
        if (pref === 'decline') {
          // spec 没说可放弃，但保留这个 toggle 以便测试 / future 扩展
          log(game, actorName(game, sourceActor) + '放弃【过河拆桥】结算。');
          return success('过河拆桥已取消。');
        }
        if (pref === 'ask') {
          game.pendingChoice = {
            kind: 'guohe-1v1-pick',
            actor: sourceActor,
            target: targetActor,
            equipment: equipmentList(target).map(function (e) {
              return { slot: e.slot, cardId: e.card.id, name: e.card.name, suit: e.card.suit, rank: e.card.rank };
            }),
            hand: target.hand.map(function (c) {
              return { cardId: c.id, name: c.name, suit: c.suit, color: c.color, rank: c.rank };
            })
          };
          return success('【过河拆桥】等待发动者选择…');
        }
        // v8 PR-D2: 'auto' → 装备优先, 按 slot 影响排 (weapon > armor >
        // horsePlus > horseMinus). 武器影响进攻最大, 防具次之, 马最末.
        // 无装备时弃手牌, 手牌为空才完全无效。手牌信息对 source 是隐藏的,
        // 所以 hand[0] 随机选可接受。
        var equips = equipmentList(target);
        if (equips.length) {
          var slotPriority = { weapon: 1, armor: 2, horsePlus: 3, horseMinus: 4 };
          var sortedEquips = equips.slice().sort(function (a, b) {
            return (slotPriority[a.slot] || 9) - (slotPriority[b.slot] || 9);
          });
          return executeGuohe1v1Pick(game, sourceActor, targetActor, 'equipment', sortedEquips[0].card.id);
        }
        if (target.hand.length) {
          return executeGuohe1v1Pick(game, sourceActor, targetActor, 'hand', target.hand[0].id);
        }
        return success('过河拆桥无效果（对方两区均空）。');
      }

      function executeGuohe1v1Pick(game, sourceActor, targetActor, zone, cardId) {
        var info = removeTargetZoneCard(game, targetActor, zone, cardId);
        if (!info || !info.card) {
          return fail('指定牌不存在或已被移除。');
        }
        discardCard(game, info.card);
        log(game, actorName(game, sourceActor) + '使用【过河拆桥】，弃置了' + actorName(game, targetActor) + (zone === 'equipment' ? '装备区' : '手牌') + '的【' + info.card.name + '】。');
        return success('弃置对方一张牌。');
      }

      function resolveGuohe1v1PickChoice(game, pending, decision) {
        var sourceActor = pending.actor;
        var targetActor = pending.target;
        var zone = decision && decision.zone;
        var cardId = decision && decision.cardId;
        if (zone !== 'equipment' && zone !== 'hand') {
          game.pendingChoice = pending;
          return fail('请选择 equipment 或 hand。');
        }
        if (!cardId) {
          game.pendingChoice = pending;
          return fail('请通过 cardId 指定具体牌。');
        }
        var result = executeGuohe1v1Pick(game, sourceActor, targetActor, zone, cardId);
        if (!result.ok) {
          game.pendingChoice = pending;
          return result;
        }
        return result;
      }

      // v7 PR-7: 五谷丰登 — 顺序选牌循环。每个 picker：pool 仅余 1 张时强制
      // 取走（无可选项）；多张时按 skillPreferences.wugu 决定 auto/ask。
      // 暂停时 pauseState.wugu 保存 sourceActor / wuguCard / pool / order /
      // idx / options，由 resolveWuguPickChoice 续算。
      function processWuguPick(game, sourceActor, wuguCard, pool, order, idx, options) {
        while (idx < order.length) {
          var picker = order[idx];
          if (!pool.length) break;
          if (pool.length === 1) {
            var only = pool.shift();
            game[picker].hand.push(only);
            log(game, actorName(game, picker) + '从【五谷丰登】获得【' + only.name + '】。');
            idx += 1;
            continue;
          }
          var pickerState = game[picker];
          var pref = (pickerState && pickerState.skillPreferences && pickerState.skillPreferences.wugu)
            || (picker === 'player' ? 'ask' : 'auto');
          if (pref === 'auto') {
            // v8 PR-D2: 不再 pool.shift() 取首张, 改 pick 最高分 (scoreCardForAI
            // 看自身受伤情况 / 已用杀 等). AI 抓到最对自己有用的那张.
            var bestPoolIdx = 0;
            var bestPoolScore = -Infinity;
            for (var pi = 0; pi < pool.length; pi += 1) {
              var ps = scoreCardForAI(game, picker, pool[pi]);
              if (ps > bestPoolScore) { bestPoolScore = ps; bestPoolIdx = pi; }
            }
            var picked = pool.splice(bestPoolIdx, 1)[0];
            pickerState.hand.push(picked);
            log(game, actorName(game, picker) + '从【五谷丰登】获得【' + picked.name + '】。');
            idx += 1;
            continue;
          }
          if (!game.pauseState) game.pauseState = {};
          game.pauseState.wugu = {
            sourceActor: sourceActor,
            wuguCardId: wuguCard && wuguCard.id,
            pool: pool,
            order: order,
            idx: idx,
            options: options
          };
          game.pendingChoice = {
            kind: 'wugu-pick',
            actor: picker,
            sourceActor: sourceActor,
            cards: pool.map(function (c) {
              return { id: c.id, name: c.name, suit: c.suit, color: c.color, rank: c.rank };
            })
          };
          return success('【五谷丰登】等待 ' + actorName(game, picker) + ' 选牌…');
        }
        // 全部选完，剩余进弃牌堆
        if (pool.length) {
          pool.forEach(function (rem) {
            discardCard(game, rem);
            log(game, '【五谷丰登】剩余【' + rem.name + '】置入弃牌堆。');
          });
          pool.length = 0;
        }
        return success('五谷丰登结算完成。');
      }

      function resolveWuguPickChoice(game, pending, decision) {
        var saved = game.pauseState && game.pauseState.wugu;
        if (!saved) return fail('找不到【五谷丰登】的暂停状态。');
        var picker = pending.actor;
        var cardId = decision && decision.cardId;
        if (!cardId) {
          game.pendingChoice = pending;
          return fail('请从亮出的牌中选择一张（用 cardId 指定）。');
        }
        var pool = saved.pool;
        var poolIdx = pool.findIndex(function (c) { return c.id === cardId; });
        if (poolIdx < 0) {
          game.pendingChoice = pending;
          return fail('该牌不在【五谷丰登】的亮出池中。');
        }
        var picked = pool.splice(poolIdx, 1)[0];
        game[picker].hand.push(picked);
        log(game, actorName(game, picker) + '从【五谷丰登】选择获得【' + picked.name + '】。');
        // 清掉旧 pauseState；processWuguPick 会按需重新设置
        var nextOrder = saved.order;
        var nextIdx = saved.idx + 1;
        var sourceActor = saved.sourceActor;
        // wuguCard 已经在使用阶段被 discardCard 处理过，这里只需占位
        var wuguCard = { id: saved.wuguCardId };
        var savedOptions = saved.options;
        game.pauseState.wugu = null;
        return processWuguPick(game, sourceActor, wuguCard, pool, nextOrder, nextIdx, savedOptions);
      }

      // v7 PR-5: 借刀杀人 — 两次合法性检测中的第二次（An 决定是否用杀时）。
      // 在 1v1 中 An = opponent，Bn = source。 流程:
      //   1) 若 opponent 手牌没 杀 → 强制交武器 (transferWeaponToSource);
      //   2) 若 opponent 有 杀 但当下 source 已经不是合法目标（spec 第二次检测
      //      —— 比如 借刀 期间双方距离改变 / 装备改变） → 交武器;
      //   3) opponent 决定 use / decline；'auto'(AI 默认) = 直接 use；
      //      'ask' (player 默认) = pendingChoice 'jiedao-decision'.
      function resolveJiedaoDecision(game, sourceActor, opponentActor, jiedaoCard, options) {
        var opponentState = game[opponentActor];
        if (!opponentState || !opponentState.equipment.weapon) {
          return success('【借刀杀人】无效果（目标无武器）。');
        }
        var hasSha = opponentState.hand.some(function (c) {
          return c && (c.type === 'sha' || c.type === 'fire_sha' || c.type === 'thunder_sha');
        });
        var canHit = canReachWithSha(game, opponentActor, sourceActor)
          && !cardTargetProtection(game, opponentActor, sourceActor, { type: 'sha', color: 'black', name: '杀' }, '杀');
        if (!hasSha || !canHit) {
          if (!hasSha) {
            log(game, actorName(game, opponentActor) + '没有【杀】可用，交出武器。');
          } else {
            log(game, actorName(game, opponentActor) + '无法对' + actorName(game, sourceActor) + '使用【杀】，交出武器。');
          }
          return transferWeaponJiedao(game, sourceActor, opponentActor);
        }
        var pref = (opponentState.skillPreferences && opponentState.skillPreferences.jiedao)
          || (opponentActor === 'player' ? 'ask' : 'auto');
        if (pref === 'comply') pref = 'auto'; // synonym
        if (pref === 'ask') {
          game.pendingChoice = {
            kind: 'jiedao-decision',
            actor: opponentActor,
            sourceActor: sourceActor
          };
          return success('【借刀杀人】等待目标决定…');
        }
        // 'auto' → fire sha.
        return jiedaoFireOpponentSha(game, sourceActor, opponentActor);
      }

      function jiedaoFireOpponentSha(game, sourceActor, opponentActor) {
        var opponentState = game[opponentActor];
        var borrowedSha = removeFirstCardOfType(opponentState, 'sha')
          || removeFirstCardOfType(opponentState, 'fire_sha')
          || removeFirstCardOfType(opponentState, 'thunder_sha');
        if (!borrowedSha) {
          return transferWeaponJiedao(game, sourceActor, opponentActor);
        }
        log(game, actorName(game, opponentActor) + '被【借刀杀人】驱使使用【' + borrowedSha.name + '】。');
        var shaResult = playSha(game, opponentActor, borrowedSha);
        if (!shaResult || !shaResult.ok) {
          // Second legality check failed at playSha entry (target protection / distance
          // changed since canPlayCard). Return sha to opponent's hand and transfer weapon.
          opponentState.hand.push(borrowedSha);
          log(game, '【杀】不再合法（second legality check）；交出武器。');
          return transferWeaponJiedao(game, sourceActor, opponentActor);
        }
        return shaResult;
      }

      function transferWeaponJiedao(game, sourceActor, opponentActor) {
        var opponentState = game[opponentActor];
        var sourceState = game[sourceActor];
        var weapon = opponentState.equipment && opponentState.equipment.weapon;
        if (!weapon) return success('【借刀杀人】无效果（目标无武器）。');
        opponentState.equipment.weapon = null;
        sourceState.hand.push(weapon);
        log(game, actorName(game, sourceActor) + '因【借刀杀人】获得【' + weapon.name + '】，置入手牌。');
        return success('借刀杀人获得武器。');
      }

      function resolveJiedaoDecisionChoice(game, pending, decision) {
        var sourceActor = pending.sourceActor;
        var opponentActor = pending.actor;
        if (!game[sourceActor] || !game[opponentActor]) return fail('未知角色。');
        if (decision && (decision.decline || decision.fire === false)) {
          log(game, actorName(game, opponentActor) + '选择不出【杀】，交出武器。');
          return transferWeaponJiedao(game, sourceActor, opponentActor);
        }
        return jiedaoFireOpponentSha(game, sourceActor, opponentActor);
      }

      function resumePlayShaAfterCixiong(game) {
        if (game.pauseState && game.pauseState.playSha) {
          var saved = game.pauseState.playSha;
          game.pauseState.playSha = null;
          return continueShaAfterCixiong(game, saved.actor, saved.card, saved.amount);
        }
        return success('雌雄双股剑结算完成。');
      }

      function randomHandIndex(game, state) {
        if (!state.hand.length) return -1;
        return Math.floor(game.random() * state.hand.length);
      }

      function fail(message) {
        return { ok: false, message: message };
      }

      function success(message) {
        return { ok: true, message: message };
      }

      // v10 V3: 玩家响应窗口框架 — 统一暂停/恢复 API.
      //
      // 调用 (engine 侧): 触发暂停时, 不再手写 game.pauseState[xxx] +
      //   game.pendingChoice = {...} + log + return; 改用 requestPlayerResponse
      //   一行调用. 各 response kind 注册 continuation 到 RESPONSE_KIND_RESOLVERS.
      //
      // spec:
      //   kind         — pendingChoice.kind ('shan-response' | 'wuxie-response' | ...)
      //   actor        — 等待哪个 actor 响应 (UI 据此决定渲染哪边面板)
      //   pauseKey     — 写入 game.pauseState[pauseKey] 的 key
      //   source       — 暂停上下文 (resume 时用): { actor, card, amount, ... }
      //   options      — UI 候选列表 (写入 pendingChoice.options)
      //   meta         — 额外 UI 字段 (merge 进 pendingChoice, 如 shaName/sourceActor)
      //   logMessage   — 可选 log 行
      //   statusMessage— success() 的返回 message
      //
      // 恢复: 由 resolvePendingChoice / resolveResponseChoice 据 kind 查
      // RESPONSE_KIND_RESOLVERS 分发到对应 resolver. resolver 签名
      // (game, pending, decision), 自负责清 game.pauseState[pauseKey].
      function requestPlayerResponse(game, spec) {
        if (!game.pauseState) game.pauseState = {};
        game.pauseState[spec.pauseKey] = spec.source;
        var pending = { kind: spec.kind, actor: spec.actor };
        if (spec.options !== undefined) pending.options = spec.options;
        if (spec.meta) {
          Object.keys(spec.meta).forEach(function (k) { pending[k] = spec.meta[k]; });
        }
        game.pendingChoice = pending;
        if (spec.logMessage) log(game, spec.logMessage);
        return success(spec.statusMessage || ('等待' + actorName(game, spec.actor) + '响应。'));
      }

      // v10 V3: response kind → resolver(game, pending, decision) 注册表.
      // 各 resolveXxxResponseChoice 函数声明后调 registerResponseKind 入册.
      var RESPONSE_KIND_RESOLVERS = {};

      function registerResponseKind(kind, resolver) {
        RESPONSE_KIND_RESOLVERS[kind] = resolver;
      }

      // v10 V3: response 专用 dispatcher (public 入口). 与 resolvePendingChoice
      // 区别: 此函数仅处理已注册的 response kind, 未注册 → fail.
      // V3 只迁移 shan-response; V4-V6 会陆续注册 wuxie / sha-duel 等.
      function resolveResponseChoice(game, decision) {
        var pending = game && game.pendingChoice;
        if (!pending) return fail('没有待处理的响应。');
        var resolver = RESPONSE_KIND_RESOLVERS[pending.kind];
        if (!resolver) return fail('未注册的响应类型：' + pending.kind);
        game.pendingChoice = null;
        return resolver(game, pending, decision || {});
      }

      function damage(game, targetActor, amount, sourceActor, reason, sourceCard, nature) {
        if (game.phase === 'gameover') return false;
        var target = game[targetActor];
        if (!target) return false;
        amount = Number(amount) || 0;
        var armor = target.equipment && target.equipment.armor;
        var ignoreArmor = !!(armor && sourceActor && sourceCard && isArmorIgnoredBySha(game, sourceActor, sourceCard));
        var damageNature = nature || 'normal';
        if (sourceCard && sourceCard.type === 'fire_sha') damageNature = 'fire';
        if (sourceCard && sourceCard.type === 'thunder_sha') damageNature = 'thunder';
        if (/火攻/.test(reason || '')) damageNature = 'fire';
        if (/闪电|雷/.test(reason || '')) damageNature = 'thunder';

        var damageModifyContext = {
          game: game,
          targetActor: targetActor,
          sourceActor: sourceActor,
          reason: reason,
          sourceCard: sourceCard,
          amount: amount,
          nature: damageNature
        };
        SkillRuntime.runHook(skillRegistry, 'onDamageModify', damageModifyContext);
        amount = Number(damageModifyContext.amount) || 0;

        if (armor && !ignoreArmor && armor.type === 'tengjia') {
          if (damageNature === 'fire') {
            amount += 1;
            log(game, actorName(game, targetActor) + '的【藤甲】令火焰伤害 +1。');
          } else if ((sourceCard && sourceCard.type === 'sha') || /南蛮入侵|万箭齐发/.test(reason || '')) {
            log(game, actorName(game, targetActor) + '的【藤甲】防止了这次伤害。');
            if (sourceCard) discardCard(game, sourceCard);
            return false;
          }
        }

        // v8 PR-B2: 古锭刀 — gltjk card__equipment.md "锁定技, 每当你使用
        // 【杀】对目标角色造成伤害时, 若其没有手牌, 你令伤害值+1"。
        // 时机=tengjia 之后、baiyin 之前; 这样 baiyin 仍能把 2 点 clamp
        // 回 1 点 (符合两件装备同时生效时的 spec 互动)。
        if (sourceActor && sourceCard && isShaCard(sourceCard) && amount > 0) {
          var gudingWeapon = game[sourceActor].equipment && game[sourceActor].equipment.weapon;
          if (gudingWeapon && gudingWeapon.type === 'guding' && (target.hand || []).length === 0) {
            amount += 1;
            log(game, actorName(game, sourceActor) + '的【古锭刀】令' + actorName(game, targetActor) + '无手牌伤害 +1。');
          }
        }

        if (armor && !ignoreArmor && armor.type === 'baiyin' && amount > 1) {
          amount = 1;
          log(game, actorName(game, targetActor) + '的【白银狮子】将伤害防止至 1 点。');
        }

        // v8 PR-B1: 寒冰剑 — gltjk card__equipment.md：
        //   "每当你使用【杀】对目标角色造成伤害时, 若其有牌, 你可以防止
        //    此伤害, 依次弃置其两张牌。"
        // 时机=hp 扣减前。源装寒冰 + sourceCard 是杀类 + amount > 0 + 目标
        // 有任意牌 → 按 source.skillPreferences.hanbing 决定 auto/decline。
        if (amount > 0 && sourceActor && sourceCard && isShaCard(sourceCard)) {
          var hbResult = applyHanbingPrevent(game, sourceActor, targetActor);
          if (hbResult && hbResult.prevented) {
            if (sourceCard) discardCard(game, sourceCard);
            return false;
          }
        }

        if (amount <= 0) {
          if (sourceCard) discardCard(game, sourceCard);
          return false;
        }
        // C1: 体力值可降至负数 (gltjk flow__neardeath.md — 1 体力的法正受
        // 【闪电】3 点伤害后为 -2, 需 3 张【桃】方能回到 +1)。不再 clamp 到
        // 0, 否则深度致命伤被一张【桃】抹平, 严重削弱【闪电】/【酒】+【杀】等。
        target.hp = target.hp - amount;
        log(game, actorName(game, targetActor) + '因' + reason + '受到 ' + amount + ' 点伤害。');
        var damageContext = {
          game: game,
          targetActor: targetActor,
          sourceActor: sourceActor,
          reason: reason,
          sourceCard: sourceCard,
          amount: amount,
          nature: damageNature
        };
        var damageResults = SkillRuntime.runHook(skillRegistry, 'onDamageAfter', damageContext);
        var sourceCardClaimed = false;
        for (var damageIndex = 0; damageIndex < damageResults.length; damageIndex += 1) {
          if (damageResults[damageIndex].result && damageResults[damageIndex].result.claimedSourceCard) {
            sourceCardClaimed = true;
          }
        }
        if (sourceCard && !sourceCardClaimed) {
          discardCard(game, sourceCard);
        }
        if (game.phase === 'gameover') return true;
        if (target.hp <= 0) {
          // v7 PR-13: gltjk flow__neardeath.md — 进入濒死结算，按顺序响应；
          // 任何一名响应者将 hp 回复到 1+ 即存活；全部响应完毕仍为 0 才死亡。
          enterDying(game, targetActor, sourceActor);
        }
        return true;
      }

      // v7 PR-13: 濒死结算流程 (gltjk flow__neardeath.md)。在 1v1 中：
      //   - 响应者顺序 = 当前回合角色起按逆时针 = [turn-player, opponent]
      //   - 每名响应者一次机会，按 skillPreferences.dying (auto/ask) 处理：
      //     - 自救：可出【桃】或【酒】(使用方法Ⅱ, 仅 self)
      //     - 救人：可出【桃】(仅 1v1 中 player 救 enemy 这种反直觉场景；
      //              AI 永不救对手)
      //   - 任何一次回复使 hp >= 1 → 存活，pauseState.dying 清空
      //   - 全部响应完毕 hp 仍为 0 → 死亡 + game-over
      function enterDying(game, dyingActor, sourceActor) {
        if (!game.pauseState) game.pauseState = {};
        if (game.pauseState.dying) {
          // 既已在濒死结算中 (mid-rescue又出新濒死), 不重复进入
          return;
        }
        log(game, actorName(game, dyingActor) + '体力为 0，进入濒死状态。');
        var turnActor = game.turn || dyingActor;
        var responderQueue = [turnActor];
        if (opponent(turnActor) && opponent(turnActor) !== turnActor) {
          responderQueue.push(opponent(turnActor));
        }
        game.pauseState.dying = {
          actor: dyingActor,
          source: sourceActor,
          responders: responderQueue,
          idx: 0
        };
        processDyingNext(game);
      }

      function processDyingNext(game) {
        var saved = game.pauseState && game.pauseState.dying;
        if (!saved) return null;
        var dyingActor = saved.actor;
        var dyingState = game[dyingActor];
        if (!dyingState) return null;
        // 存活检测：hp >= 1 → 结束濒死
        if (dyingState.hp >= 1) {
          log(game, actorName(game, dyingActor) + '脱离濒死状态。');
          game.pauseState.dying = null;
          return { saved: true };
        }
        // 全部响应完毕 → 死亡。从当前回合角色起按逆时针依次响应；C2: 同一
        // 名响应者可连续出多张【桃】/【酒】, 直到体力值首次回复至 1 点 (gltjk
        // flow__neardeath.md「直到A将体力值首次回复至1点或1点以上为止」)。仅当
        // 该响应者放弃 / 已无可用救援牌时才前进到下一名 (idx += 1)。
        while (saved.idx < saved.responders.length) {
          var responder = saved.responders[saved.idx];
          if (!game[responder]) {
            saved.idx += 1;
            continue;
          }
          var attemptResult = attemptDyingRescue(game, responder, dyingActor);
          if (attemptResult && attemptResult.paused) {
            return { paused: true };
          }
          if (attemptResult && attemptResult.healed) {
            // 回复后再次检查存活；未满 1 点则继续询问同一响应者 (不前进 idx)。
            if (dyingState.hp >= 1) {
              log(game, actorName(game, dyingActor) + '脱离濒死状态。');
              game.pauseState.dying = null;
              return { saved: true };
            }
            continue;
          }
          // skipped (无【桃】/【酒】或放弃) → 进入下一名响应者
          saved.idx += 1;
        }
        // All responders exhausted, no save → die. 1v1 中胜者恒为对手。
        log(game, actorName(game, dyingActor) + '没有人救援，死亡。');
        game.phase = 'gameover';
        game.winner = opponent(dyingActor);
        log(game, actorName(game, game.winner) + '获胜！');
        game.pauseState.dying = null;
        return { died: true };
      }

      function attemptDyingRescue(game, responder, dyingActor) {
        var responderState = game[responder];
        var dyingState = game[dyingActor];
        if (!responderState || !dyingState) return null;
        var pref = (responderState.skillPreferences && responderState.skillPreferences.dying)
          || (responder === 'player' ? 'ask' : 'auto');
        var taoCards = (responderState.hand || []).filter(function (c) { return c && c.type === 'tao'; });
        var jiuCards = (responder === dyingActor)
          ? (responderState.hand || []).filter(function (c) { return c && c.type === 'jiu'; })
          : [];
        // v8 PR-C3: 急救 (华佗) — 回合外可将红色牌当桃使用
        //   spec: gltjk card__hero__neutral.md 急救 "你于回合外可以将红色牌当桃使用"
        //   触发条件: responder 装 jijiu + game.turn !== responder + 手牌有非桃非酒的红色牌
        //   救援目标: 任意 (含他人)
        var jijiuCards = [];
        if (hasSkill(responderState, 'jijiu') && game.turn !== responder) {
          jijiuCards = (responderState.hand || []).filter(function (c) {
            return c && c.color === 'red' && c.type !== 'tao' && c.type !== 'jiu';
          });
        }
        if (!taoCards.length && !jiuCards.length && !jijiuCards.length) {
          log(game, actorName(game, responder) + '没有可用的【桃】/【酒】，无法救援。');
          return { skipped: true };
        }
        if (pref === 'decline') {
          log(game, actorName(game, responder) + '选择不救援。');
          return { skipped: true };
        }
        if (pref === 'ask') {
          game.pendingChoice = {
            kind: 'dying-rescue',
            actor: responder,
            dyingActor: dyingActor,
            taoIds: taoCards.map(function (c) { return c.id; }),
            jiuIds: jiuCards.map(function (c) { return c.id; }),
            jijiuIds: jijiuCards.map(function (c) { return c.id; })
          };
          return { paused: true };
        }
        // 'auto':
        //   - 救自己优先：dying = self → 用 桃 优先 (桃便宜, 酒 Method II 次, 急救 最后)
        //   - 救他人 (含 华佗 急救): 1v1 AI 默认不救对手, 但若 jijiu 可用 +
        //     dying = 对手, 华佗 AI 仍然不救 (与原 v8 PR-A2 行为一致 — AI
        //     不主动救敌). 玩家走 ask 路径.
        if (responder !== dyingActor) {
          log(game, actorName(game, responder) + '选择不救援。');
          return { skipped: true };
        }
        if (taoCards.length) {
          return executeDyingRescue(game, responder, dyingActor, 'tao', taoCards[0].id);
        }
        if (jiuCards.length) {
          return executeDyingRescue(game, responder, dyingActor, 'jiu', jiuCards[0].id);
        }
        // 自救 — 急救 红色牌兜底
        return executeDyingRescue(game, responder, dyingActor, 'jijiu', jijiuCards[0].id);
      }

      function executeDyingRescue(game, responder, dyingActor, kind, cardId) {
        var responderState = game[responder];
        var dyingState = game[dyingActor];
        if (!responderState || !dyingState) return { skipped: true };
        var idx = responderState.hand.findIndex(function (c) { return c.id === cardId; });
        if (idx < 0) return { skipped: true };
        var card = responderState.hand.splice(idx, 1)[0];
        if (kind === 'tao') {
          discardCard(game, card);
          dyingState.hp = Math.min(dyingState.maxHp, dyingState.hp + 1);
          log(game, actorName(game, responder) + '对' + actorName(game, dyingActor) + '使用【桃】（濒死救援），回复 1 点体力。');
          return { healed: true };
        }
        if (kind === 'jiu') {
          // 酒 使用方法Ⅱ: 仅 self
          if (responder !== dyingActor) {
            // 不允许救他人时用酒；回退到不消耗
            responderState.hand.splice(idx, 0, card);
            return { skipped: true };
          }
          discardCard(game, card);
          dyingState.hp = Math.min(dyingState.maxHp, dyingState.hp + 1);
          log(game, actorName(game, responder) + '濒死时饮下【酒】（使用方法Ⅱ），回复 1 点体力。');
          return { healed: true };
        }
        // v8 PR-C3: 急救 — 华佗回合外把红色牌当桃 (条件: hasSkill jijiu +
        // turn !== responder + 卡是红色非桃非酒). source 卡 进 弃牌堆, 救
        // 1 hp. spec 允许救任意角色 (含他人), 但通过 attemptDyingRescue
        // auto path 已经过滤 — auto 不救他人; 玩家 ask 路径才可用此选项.
        if (kind === 'jijiu') {
          if (!hasSkill(responderState, 'jijiu') || game.turn === responder) {
            // 条件不满足时回退
            responderState.hand.splice(idx, 0, card);
            return { skipped: true };
          }
          if (card.color !== 'red' || card.type === 'tao' || card.type === 'jiu') {
            responderState.hand.splice(idx, 0, card);
            return { skipped: true };
          }
          discardCard(game, card);
          dyingState.hp = Math.min(dyingState.maxHp, dyingState.hp + 1);
          log(game, actorName(game, responder) + '发动【急救】，将【' + card.name + '】当【桃】对' + actorName(game, dyingActor) + '使用，回复 1 点体力。');
          return { healed: true };
        }
        // 未知 kind
        responderState.hand.splice(idx, 0, card);
        return { skipped: true };
      }

      function resolveDyingRescueChoice(game, pending, decision) {
        var saved = game.pauseState && game.pauseState.dying;
        if (!saved) return fail('找不到濒死结算的暂停状态。');
        var responder = pending.actor;
        var dyingActor = pending.dyingActor;
        if (decision && (decision.decline || decision.skip)) {
          log(game, actorName(game, responder) + '选择不救援。');
          saved.idx += 1; // C2: 放弃 → 进入下一名响应者
          var nextOutcome = processDyingNext(game);
          return (nextOutcome && (nextOutcome.saved || nextOutcome.died)) ? success('濒死结算完成。') : success('继续濒死结算。');
        }
        var cardId = decision && decision.cardId;
        if (!cardId) {
          game.pendingChoice = pending;
          return fail('请通过 cardId 指定要使用的【桃】/【酒】。');
        }
        var allowed = (pending.taoIds || []).concat(pending.jiuIds || []).concat(pending.jijiuIds || []);
        if (allowed.indexOf(cardId) < 0) {
          game.pendingChoice = pending;
          return fail('该牌不在救援可用列表中。');
        }
        // v8 PR-C3: 三段 kind 判定 — 桃 / 酒 / 急救 (jijiu 红色当桃)
        var kind;
        if ((pending.taoIds || []).indexOf(cardId) >= 0) kind = 'tao';
        else if ((pending.jiuIds || []).indexOf(cardId) >= 0) kind = 'jiu';
        else kind = 'jijiu';
        var executeResult = executeDyingRescue(game, responder, dyingActor, kind, cardId);
        if (!executeResult.healed) {
          // 使用失败 (理论上不出现) → 跳过该响应者
          saved.idx += 1;
        }
        // C2: 救援成功后不前进 idx — 若仍未回复至 1 点, processDyingNext 会再次
        // 询问同一响应者 (再出一张【桃】); 已回复至 1 点则直接判存活。
        var outcome = processDyingNext(game);
        if (outcome && outcome.paused) return success('继续等待救援。');
        return success('濒死结算完成。');
      }

      // v9 PR-E26: 判定一张手牌能否当【闪】响应 — 真闪 / 龙胆(杀) / 倾国(黑牌).
      // 返回 { via: null|'龙胆'|'倾国' } 或 null.
      function shanOptionForCard(state, cardId) {
        var hand = state.hand || [];
        var card = null;
        for (var i = 0; i < hand.length; i += 1) {
          if (hand[i] && hand[i].id === cardId) { card = hand[i]; break; }
        }
        if (!card) return null;
        if (card.type === 'shan') return { via: null };
        if (hasSkill(state, 'longdan') && isShaCard(card)) return { via: '龙胆' };
        if (hasSkill(state, 'qingguo') && card.color === 'black') return { via: '倾国' };
        return null;
      }

      // v9 PR-E26: 枚举玩家所有可作【闪】响应的手牌 (真闪 + 转化候选), 供
      // shan-response 面板列出让玩家选用哪张. 引擎返回数据, UI 负责格式化.
      function listShanResponseOptions(state) {
        var opts = [];
        (state.hand || []).forEach(function (card) {
          if (!card) return;
          var opt = shanOptionForCard(state, card.id);
          if (opt) {
            opts.push({ cardId: card.id, via: opt.via, name: card.name, suit: card.suit, rank: card.rank });
          }
        });
        return opts;
      }

      // v10 V6: 判定一张牌能否当【杀】响应 — 真【杀】 / 龙胆(闪→杀) /
      // 武圣(红→杀). 丈八(2 牌虚拟) 不在单牌 option 范围 (UI 选不到, fallback
      // 走 consumeResponse 自动路径).
      function shaOptionForCard(state, cardId) {
        if (!state) return null;
        var card = null;
        var hand = state.hand || [];
        for (var i = 0; i < hand.length; i += 1) {
          if (hand[i] && hand[i].id === cardId) { card = hand[i]; break; }
        }
        if (!card && state.equipment) {
          // 武圣 红装备 也可当杀响应
          ['weapon', 'armor', 'horseMinus', 'horsePlus'].forEach(function (slot) {
            if (!card && state.equipment[slot] && state.equipment[slot].id === cardId) {
              card = state.equipment[slot];
            }
          });
        }
        if (!card) return null;
        if (isShaCard(card)) return { via: null };
        if (hasSkill(state, 'longdan') && card.type === 'shan') return { via: '龙胆' };
        if (hasSkill(state, 'wusheng') && card.color === 'red') return { via: '武圣' };
        return null;
      }

      // v10 V6: 枚举玩家所有可作【杀】响应的牌 (手牌 + 装备区 — 武圣需要装备区).
      function listShaResponseOptions(state) {
        var opts = [];
        var seen = {};
        function add(card) {
          if (!card || seen[card.id]) return;
          var opt = shaOptionForCard(state, card.id);
          if (opt) {
            seen[card.id] = true;
            opts.push({ cardId: card.id, via: opt.via, name: card.name, suit: card.suit, rank: card.rank });
          }
        }
        (state.hand || []).forEach(add);
        if (state.equipment) {
          ['weapon', 'armor', 'horseMinus', 'horsePlus'].forEach(function (slot) {
            add(state.equipment[slot]);
          });
        }
        return opts;
      }

      function hasShaResponseAvailable(state) {
        if (!state) return false;
        return listShaResponseOptions(state).length > 0;
      }

      function findResponseCard(state, type, preferredCardId) {
        var card = null;
        if (type === 'shan') {
          // v9 PR-E26: 玩家指定了用哪张牌当【闪】 → 直接消耗那张 (真闪 / 龙胆 / 倾国).
          if (preferredCardId) {
            var picked = shanOptionForCard(state, preferredCardId);
            if (!picked) return null;
            return {
              card: removeOwnCardFromAnyZone(state, preferredCardId),
              asName: '闪',
              skillName: picked.via
            };
          }
          card = removeFirstCardOfType(state, 'shan');
          if (card) return { card: card, asName: '闪', skillName: null };
          var shanResponseContext = { mode: 'response', state: state, asType: 'shan' };
          var shanConversion = selectCardAsConversion(SkillRuntime.runHook(skillRegistry, 'onCardAs', shanResponseContext));
          // v6.1: convert through hand-or-equipment so 武圣 can pull a red
          // weapon (cardAs may return an equipment card). Skills that only
          // operate on hand (倾国 / 龙胆) won't return equipment cards in
          // the first place, so this is a strict superset.
          return shanConversion ? { card: removeOwnCardFromAnyZone(state, shanConversion.card.id), asName: shanConversion.asName, skillName: shanConversion.skillName } : null;
        }
        if (type === 'sha') {
          // v10 V6: 玩家指定用哪张牌当【杀】 → 直接消耗那张 (真杀 / 龙胆 / 武圣).
          if (preferredCardId) {
            var pickedSha = shaOptionForCard(state, preferredCardId);
            if (!pickedSha) return null;
            return {
              card: removeOwnCardFromAnyZone(state, preferredCardId),
              asName: '杀',
              skillName: pickedSha.via
            };
          }
          card = removeFirstCardOfType(state, 'sha');
          if (card) return { card: card, asName: '杀', skillName: null };
          var responseContext = { mode: 'response', state: state, asType: 'sha' };
          var conversion = selectCardAsConversion(SkillRuntime.runHook(skillRegistry, 'onCardAs', responseContext));
          // Same: support equipment-zone sources for 武圣 's response path.
          if (conversion) return { card: removeOwnCardFromAnyZone(state, conversion.card.id), asName: conversion.asName, skillName: conversion.skillName };
          // v7 PR-14: 丈八蛇矛 — "你可以将两张手牌当【杀】使用或打出"
          //   响应路径：装备 丈八 且手牌 >= 2 时，consume 2 张手牌当 杀 响应。
          //   spec 是 optional，但响应窗口缺省"自动出杀"——保留旧行为。
          //   skillPreferences.zhangba = 'decline' 可禁用。
          if (state.equipment && state.equipment.weapon
              && state.equipment.weapon.type === 'zhangba'
              && state.hand.length >= 2
              && (!state.skillPreferences || state.skillPreferences.zhangba !== 'decline')) {
            var zbFirst = state.hand.shift();
            var zbSecond = state.hand.shift();
            return {
              card: {
                id: 'zhangba-resp-' + zbFirst.id + '-' + zbSecond.id,
                type: 'sha',
                name: '丈八杀',
                suit: zbFirst.suit,
                color: zbFirst.color,
                rank: zbFirst.rank,
                physicalCard: null,
                virtual: true
              },
              asName: '杀',
              skillName: '丈八蛇矛',
              extraCards: [zbFirst, zbSecond]
            };
          }
          return null;
        }
        card = removeFirstCardOfType(state, type);
        return card ? { card: card, asName: card.name, skillName: null } : null;
      }

      function consumeResponse(game, actor, type, reason, preferredCardId) {
        var response = findResponseCard(game[actor], type, preferredCardId);
        if (!response) return false;
        if (type === 'sha' && actor === game.turn) game[actor].usedOrRespondedSha = true;
        if (response.extraCards && response.extraCards.length) {
          // v7 PR-14: 丈八蛇矛 响应 — 弃两张物理手牌，虚拟杀不进弃牌堆
          response.extraCards.forEach(function (real) { discardCard(game, real); });
          log(game, actorName(game, actor) + '发动【' + response.skillName + '】，将【'
            + response.extraCards.map(function (c) { return c.name; }).join('】、【')
            + '】当【' + response.asName + '】响应' + reason + '。');
        } else {
          discardCard(game, response.card);
          if (response.skillName) {
            log(game, actorName(game, actor) + '发动【' + response.skillName + '】，将【' + response.card.name + '】当【' + response.asName + '】响应' + reason + '。');
          } else {
            log(game, actorName(game, actor) + '打出【' + response.card.name + '】响应' + reason + '。');
          }
        }
        // v8 PR-B4: 银月枪 — 回合外打出黑色手牌触发
        if (game.turn !== actor) {
          var blackCards = response.extraCards && response.extraCards.length
            ? response.extraCards.filter(function (c) { return c && c.color === 'black'; })
            : (response.card && response.card.color === 'black' ? [response.card] : []);
          if (blackCards.length > 0) triggerYinyueQiang(game, actor);
        }
        return true;
      }

      function consumeWuxie(game, actor, reason, preferredCardId) {
        var card;
        if (preferredCardId) {
          // v10 V5: 玩家指定用哪张无懈 (面板候选选定)
          var state = game[actor];
          var idx = state.hand.findIndex(function (c) {
            return c.id === preferredCardId && c.type === 'wuxie';
          });
          if (idx < 0) return false;
          card = state.hand.splice(idx, 1)[0];
        } else {
          card = removeFirstCardOfType(game[actor], 'wuxie');
        }
        if (!card) return false;
        discardCard(game, card);
        log(game, actorName(game, actor) + '打出【无懈可击】抵消' + reason + '。');
        SkillRuntime.runHook(skillRegistry, 'onCardUse', {
          game: game,
          actor: actor,
          card: card,
          result: success('无懈可击响应成功。'),
          options: { response: true }
        });
        // v8 PR-B4: 银月枪 — 回合外用黑色手牌 (无懈) 触发
        if (game.turn !== actor && card.color === 'black') {
          triggerYinyueQiang(game, actor);
        }
        return true;
      }

      // v10 V5: 无懈可击 链式响应 框架.
      //   每张锦囊触发 wuxie 检查: 先问 target 是否无懈; 若是, 再问 source 是否反无懈;
      //   依次交替, 直至某方放弃或无牌. 玩家方 (skillPreferences.wuxieResponse='ask')
      //   暂停; AI 方默认 auto-use (有无懈则用).
      //
      //   pauseState.wuxieChain = {
      //     trickName,         // 'juedou' / 'guohe' / 'shunshou' / 'huogong' / 'jiedao'
      //     ctx,               // 继续逻辑的上下文 (actor, card, options...)
      //     reason,            // 日志/文案用 (e.g. '【决斗】')
      //     currentResponder,  // 'player' | 'enemy' — 当前轮到谁决定
      //     wuxied             // bool — 当前 net 抵消态 (false=锦囊通过, true=已被抵消)
      //   }
      //
      //   每用一次无懈即翻转 wuxied + 切换 currentResponder.
      //   链结束时 settleWuxieChain 调 WUXIE_CONTINUATIONS[trickName] 完成结算.
      var WUXIE_CONTINUATIONS = {};

      function registerWuxieContinuation(trickName, fn) {
        WUXIE_CONTINUATIONS[trickName] = fn;
      }

      function listWuxieOptions(state) {
        if (!state || !state.hand) return [];
        var opts = [];
        state.hand.forEach(function (card) {
          if (card && card.type === 'wuxie') {
            opts.push({
              cardId: card.id, via: null, name: card.name,
              suit: card.suit, rank: card.rank
            });
          }
        });
        return opts;
      }

      function hasWuxieResponseAvailable(state) {
        return listWuxieOptions(state).length > 0;
      }

      // 入口: trick 调用此 fn 触发无懈检查链. ctx 是 trick 的继续上下文.
      function checkWuxieAndContinue(game, targetActor, reason, trickName, ctx) {
        if (!game.pauseState) game.pauseState = {};
        game.pauseState.wuxieChain = {
          trickName: trickName,
          ctx: ctx,
          reason: reason,
          currentResponder: targetActor,
          wuxied: false
        };
        return advanceWuxieChain(game);
      }

      // 链推进: 据 chain.currentResponder 决定 暂停 (玩家 ask + 有无懈) /
      // AI auto-use (有无懈则用) / 结算 (无无懈).
      function advanceWuxieChain(game) {
        var chain = game.pauseState && game.pauseState.wuxieChain;
        if (!chain) return fail('无懈链状态丢失。');
        var responder = chain.currentResponder;
        var state = game[responder];
        var hasWuxie = hasWuxieResponseAvailable(state);

        // 玩家 ask 路径 — 暂停等待玩家
        if (responder === 'player'
            && state.skillPreferences && state.skillPreferences.wuxieResponse === 'ask'
            && hasWuxie) {
          return requestPlayerResponse(game, {
            kind: 'wuxie-response',
            actor: 'player',
            pauseKey: 'wuxieChain',
            source: chain,  // 即 pauseState.wuxieChain 自身 (链状态)
            options: listWuxieOptions(state),
            meta: {
              reason: chain.reason,
              chainWuxied: chain.wuxied,
              trickName: chain.trickName
            },
            logMessage: '等待' + actorName(game, 'player') + '决定是否打出【无懈可击】响应' + chain.reason + '。',
            statusMessage: '等待玩家无懈响应。'
          });
        }

        // 非玩家 ask 路径: AI / 默认 auto — 有无懈则自动用
        if (hasWuxie) {
          consumeWuxie(game, responder, chain.reason);
          chain.wuxied = !chain.wuxied;
          chain.currentResponder = opponent(responder);
          return advanceWuxieChain(game);
        }

        // 无无懈 → 结算
        return settleWuxieChain(game);
      }

      function settleWuxieChain(game) {
        var chain = game.pauseState && game.pauseState.wuxieChain;
        if (!chain) return fail('无懈链状态丢失。');
        game.pauseState.wuxieChain = null;
        var cont = WUXIE_CONTINUATIONS[chain.trickName];
        if (!cont) return fail('未注册的无懈延续: ' + chain.trickName);
        return cont(game, chain.ctx, chain.wuxied);
      }

      // resolver — 玩家在 wuxie pendingChoice 上的决策.
      function resolveWuxieResponseChoice(game, pending, decision) {
        var chain = game.pauseState && game.pauseState.wuxieChain;
        if (!chain) return fail('找不到无懈响应的暂停状态。');

        if (decision.cardId || decision.use) {
          var used = consumeWuxie(game, 'player', chain.reason, decision.cardId || null);
          if (!used) {
            log(game, actorName(game, 'player') + '没有可打出的【无懈可击】。');
            return settleWuxieChain(game);
          }
          chain.wuxied = !chain.wuxied;
          chain.currentResponder = opponent('player');
          return advanceWuxieChain(game);
        }
        // 玩家放弃响应 → 结算
        log(game, actorName(game, 'player') + '选择不打出【无懈可击】响应' + chain.reason + '。');
        return settleWuxieChain(game);
      }

      registerResponseKind('wuxie-response', resolveWuxieResponseChoice);

      // v8 PR-B4: 银月枪 — gltjk SP 010：
      //   "每当你于回合外使用或打出黑色手牌时, 你可以令你攻击范围内的一名
      //    角色选择是否打出【闪】, 若其选择否, 你对其造成1点伤害"。
      // 1v1 中: 目标 = opponent (即原事件 source); 攻击范围检测用
      // canReachWithSha (银月 range=3, 1v1 默认距离 1 ≤ 3 → 总成立)。
      // skillPreferences.yinyue = 'auto' (默认触发) / 'decline' (跳过)。
      function triggerYinyueQiang(game, holderActor) {
        var holder = game[holderActor];
        if (!holder) return;
        var weapon = holder.equipment && holder.equipment.weapon;
        if (!weapon || weapon.type !== 'yinyue') return;
        var targetActor = opponent(holderActor);
        if (!targetActor || !game[targetActor]) return;
        if (!canReachWithSha(game, holderActor, targetActor)) return;
        var pref = (holder.skillPreferences && holder.skillPreferences.yinyue) || 'auto';
        if (pref === 'decline') {
          log(game, actorName(game, holderActor) + '选择不发动【银月枪】。');
          return;
        }
        log(game, actorName(game, holderActor) + '发动【银月枪】，令' + actorName(game, targetActor) + '出闪或受 1 点伤害。');
        // v10 V4: 银月枪 触发 + 玩家为目标 + shanResponse=ask + 有闪 → 暂停.
        if (targetActor === 'player') {
          var yinyueTarget = game.player;
          if (yinyueTarget.skillPreferences && yinyueTarget.skillPreferences.shanResponse === 'ask'
              && hasShanResponseAvailable(yinyueTarget)) {
            requestPlayerResponse(game, {
              kind: 'yinyue-response',
              actor: 'player',
              pauseKey: 'yinyueResponse',
              source: { holderActor: holderActor },
              options: listShanResponseOptions(yinyueTarget),
              meta: { sourceActor: holderActor, sourceName: '银月枪' },
              logMessage: '等待' + actorName(game, 'player') + '决定是否打出【闪】响应【银月枪】。',
              statusMessage: '等待玩家响应【银月枪】。'
            });
            return;
          }
        }
        if (!consumeResponse(game, targetActor, 'shan', '【银月枪】')) {
          damage(game, targetActor, 1, holderActor, '【银月枪】');
        }
      }

      // v10 V4: 银月枪 闪响应 — 玩家 decision 决定 化解 / damage(1).
      function resolveYinyueResponseChoice(game, pending, decision) {
        var saved = game.pauseState && game.pauseState.yinyueResponse;
        if (!saved) return fail('找不到【银月枪】响应的暂停状态。');
        game.pauseState.yinyueResponse = null;
        var holderActor = saved.holderActor;
        var dodged = false;
        if (decision.cardId) {
          dodged = consumeResponse(game, 'player', 'shan', '【银月枪】', decision.cardId);
          if (!dodged) log(game, actorName(game, 'player') + '指定的牌无法当【闪】。');
        } else if (decision.use) {
          dodged = consumeResponse(game, 'player', 'shan', '【银月枪】');
          if (!dodged) log(game, actorName(game, 'player') + '没有可打出的【闪】。');
        } else {
          log(game, actorName(game, 'player') + '选择不打出【闪】响应【银月枪】。');
        }
        if (!dodged) {
          damage(game, 'player', 1, holderActor, '【银月枪】');
        }
        return success('银月枪响应完成。');
      }

      registerResponseKind('yinyue-response', resolveYinyueResponseChoice);

      function judge(game, actor, reason, opts) {
        reshuffleIfNeeded(game);
        var card = game.deck.pop();
        if (!card) return null;
        log(game, actorName(game, actor) + '进行' + reason + '判定：【' + card.name + '】' + card.suit + ' ' + card.rank + '。');
        var state = game[actor];
        var judgementContext = {
          game: game,
          actor: actor,
          state: state,
          reason: reason,
          card: card,
          originalCard: card,
          replaced: false,
          // v6.1: only processJudgeArea's caller can suspend a judgement
          // mid-resolution (it has the pauseState snapshot to resume from).
          // Other callers (bagua armor judge, ganglie judge, tieqi judge)
          // run judge() inside their own multi-step logic with no resume
          // point, so 鬼才 falls back to auto-fire there. processJudgeArea
          // passes `{ pausable: true }`; others leave the default false.
          pausable: !!(opts && opts.pausable)
        };
        SkillRuntime.runHook(skillRegistry, 'onJudgementBeforeResolve', judgementContext);
        return judgementContext.card;
      }

      function resolveJudgementCard(game, actor, state, reason, card) {
        if (!card) return;
        var judgementContext = {
          game: game,
          actor: actor,
          state: state,
          reason: reason,
          card: card
        };
        SkillRuntime.runHook(skillRegistry, 'onJudgementAfterResolve', judgementContext);
        if (!judgementContext.claimed) {
          discardCard(game, card);
        }
      }

      function judgementReasonFor(trick) {
        if (!trick) return null;
        if (trick.type === 'lebusishu') return '【乐不思蜀】';
        if (trick.type === 'bingliang') return '【兵粮寸断】';
        if (trick.type === 'shandian') return '【闪电】';
        return null;
      }

      // Re-entrant judge-area processor. State that needs to survive a pause
      // (e.g. 鬼才 prompting) is held on game.pauseState.judgeArea so the
      // same function can resume from the right trick index after the player
      // resolves the prompt.
      function processJudgeArea(game, actor) {
        var state = game[actor];
        state.flags = state.flags || {};
        if (!game.pauseState) game.pauseState = {};
        var saved = game.pauseState.judgeArea;
        var pending;
        var startIdx;
        if (saved && saved.actor === actor) {
          pending = saved.pending;
          startIdx = saved.idx;
        } else {
          state.flags.skipPlay = false;
          state.flags.skipDraw = false;
          if (!state.judgeArea) state.judgeArea = [];
          pending = state.judgeArea.splice(0);
          startIdx = 0;
        }
        for (var i = startIdx; i < pending.length; i += 1) {
          var trick = pending[i];
          var reason = judgementReasonFor(trick);
          var judgementCard = reason ? judge(game, actor, reason, { pausable: true }) : null;
          if (game.pendingChoice) {
            // judge() invoked a hook that asked for a choice. Snapshot the
            // iteration so resolvePendingChoice can pick up where we left off.
            game.pauseState.judgeArea = {
              actor: actor,
              pending: pending,
              idx: i,
              currentTrick: trick,
              currentReason: reason,
              currentJudgementCard: judgementCard
            };
            return { suspended: true };
          }
          applyJudgeAreaOutcome(game, actor, state, trick, reason, judgementCard);
        }
        // Clear the snapshot if we exited cleanly.
        if (game.pauseState && game.pauseState.judgeArea) game.pauseState.judgeArea = null;
        return { ok: true };
      }

      function applyJudgeAreaOutcome(game, actor, state, trick, reason, judgementCard) {
        var outcome = evaluateDelayedTrick(trick, judgementCard);
        if (outcome.skipPlay) {
          state.flags.skipPlay = true;
          log(game, actorName(game, actor) + '【乐不思蜀】判定失败，跳过出牌阶段。');
        }
        if (outcome.skipDraw) {
          state.flags.skipDraw = true;
          log(game, actorName(game, actor) + '【兵粮寸断】判定失败，跳过摸牌阶段。');
        }
        if (trick.type === 'shandian' && outcome.hit) {
          damage(game, actor, outcome.damage, null, '【闪电】');
        } else if (trick.type === 'shandian' && outcome.moveToNext) {
          // v7 PR-12: gltjk card__scroll.md 注 — "若其下家不是此【闪电】的
          // 合法目标，则将对应的实体牌置入其下家的下家的判定区，以此类推。
          // 若所有角色都不是此【闪电】的合法目标，则将对应的实体牌置入其
          // 判定区。" 在 1v1 中只有 2 名角色：下家=对手；下家的下家=自己。
          // PR-6 已定义 "判定区里有同名延时锦囊的角色 = 非合法目标"。
          var foeActor = opponent(actor);
          var foeState = game[foeActor];
          var foeAlreadyShandian = (foeState.judgeArea || []).some(function (j) {
            return j && j.type === 'shandian';
          });
          if (foeAlreadyShandian) {
            // 对手已有 闪电 → 非合法目标 → 全部不合法 → 回到自己
            game[actor].judgeArea.push(trick);
            log(game, '【闪电】移动失败（对手判定区已有同名牌），留在' + actorName(game, actor) + '的判定区。');
          } else {
            foeState.judgeArea.push(trick);
            log(game, '【闪电】移至' + actorName(game, foeActor) + '的判定区。');
          }
        }
        resolveJudgementCard(game, actor, state, reason, judgementCard);
        if (outcome.discardTrick) discardCard(game, trick);
      }

      function getPendingChoice(game) {
        return (game && game.pendingChoice) || null;
      }

      // Resolve a pending player prompt. Decision shape depends on kind:
      //   guicai-replace:    { cardId }
      //                        Picks the hand card used as the new judgement
      //                        card. cardId === null means decline.
      //   yiji-distribute:   { giveIds: [<cardId>] }
      //                        Drawn cards in giveIds are transferred to the
      //                        opponent. giveIds undefined or empty = keep all.
      //   guanxing-reorder:  { topIds: [<cardId>], bottomIds: [<cardId>] }
      //                        Cards listed in topIds end up at the deck top
      //                        in given order (topIds[0] = drawn first).
      //                        Cards listed in bottomIds end up at the deck
      //                        bottom in given order (bottomIds[0] = first
      //                        drawn of bottom pile; bottomIds[last] = very
      //                        bottom of deck). Cards not in either list stay
      //                        on top in original preview order, below any
      //                        explicit topIds. decision.decline === true skips
      //                        the reorder entirely (skill still consumed).
      //   fanjian-guess:     { suit: 'spade'|'heart'|'club'|'diamond' }
      //                        Target's blind guess of the 反间 card's suit.
      //                        Wrong guess → 1 damage from source actor.
      function resolvePendingChoice(game, decision) {
        var pending = game && game.pendingChoice;
        if (!pending) return fail('没有待处理的选择。');
        // v10 V3: 框架注册的 response kinds 优先走 registry 分发.
        // 已注册: shan-response. V4-V6 会陆续加 wuxie / sha-duel 等.
        var registered = RESPONSE_KIND_RESOLVERS[pending.kind];
        if (registered) {
          game.pendingChoice = null;
          return registered(game, pending, decision || {});
        }
        game.pendingChoice = null;
        if (pending.kind === 'guicai-replace') {
          return resolveGuicaiReplaceChoice(game, pending, decision || {});
        }
        if (pending.kind === 'yiji-distribute') {
          return resolveYijiDistributeChoice(game, pending, decision || {});
        }
        if (pending.kind === 'guanxing-reorder') {
          return resolveGuanxingChoice(game, pending, decision || {});
        }
        if (pending.kind === 'fanjian-guess') {
          return resolveFanjianGuessChoice(game, pending, decision || {});
        }
        if (pending.kind === 'fankui-pick') {
          return resolveFankuiPickChoice(game, pending, decision || {});
        }
        if (pending.kind === 'ganglie-fire') {
          return resolveGanglieFireChoice(game, pending, decision || {});
        }
        if (pending.kind === 'ganglie-source-choice') {
          return resolveGanglieSourceChoice(game, pending, decision || {});
        }
        if (pending.kind === 'qilin-pick') {
          return resolveQilinPickChoice(game, pending, decision || {});
        }
        if (pending.kind === 'cixiong-fire') {
          return resolveCixiongFireChoice(game, pending, decision || {});
        }
        if (pending.kind === 'cixiong-choose') {
          return resolveCixiongChoose(game, pending, decision || {});
        }
        if (pending.kind === 'jiedao-decision') {
          return resolveJiedaoDecisionChoice(game, pending, decision || {});
        }
        if (pending.kind === 'wugu-pick') {
          return resolveWuguPickChoice(game, pending, decision || {});
        }
        if (pending.kind === 'guohe-1v1-pick') {
          return resolveGuohe1v1PickChoice(game, pending, decision || {});
        }
        if (pending.kind === 'dying-rescue') {
          return resolveDyingRescueChoice(game, pending, decision || {});
        }
        if (pending.kind === 'luoshen-continue') {
          return resolveLuoshenContinueChoice(game, pending, decision || {});
        }
        // v10 V3: shan-response 已移到框架注册表 (上方 RESPONSE_KIND_RESOLVERS).
        return fail('未知的选择类型：' + pending.kind);
      }

      function resolveGuanxingChoice(game, pending, decision) {
        var actor = pending.actor;
        var state = game[actor];
        if (!state) return fail('未知角色。');
        if (decision.decline) {
          state.flags.guanxingUsed = true;
          log(game, actorName(game, actor) + '选择不发动【观星】。');
        } else {
          var result = useSkill(game, actor, 'guanxing', [], {
            topIds: decision.topIds || [],
            bottomIds: decision.bottomIds || []
          });
          if (!result.ok) {
            // Restore so the UI can re-render the panel.
            game.pendingChoice = pending;
            return result;
          }
        }
        return continueTurnAfterPreparePhase(game, actor);
      }

      function resolveYijiDistributeChoice(game, pending, decision) {
        var actor = pending.actor;
        var state = game[actor];
        if (!state) return fail('未知角色。');
        var giveIds = Array.isArray(decision.giveIds) ? decision.giveIds : [];
        var validIds = giveIds.filter(function (id) { return pending.drawnIds.indexOf(id) >= 0; });
        if (validIds.length === 0) {
          log(game, actorName(game, actor) + '将【遗计】本点所摸的牌全部留给自己。');
        } else {
          var opp = opponent(actor);
          var oppState = game[opp];
          var moved = [];
          for (var i = 0; i < validIds.length; i += 1) {
            var idx = state.hand.findIndex(function (c) { return c.id === validIds[i]; });
            if (idx < 0) continue;
            var card = state.hand.splice(idx, 1)[0];
            oppState.hand.push(card);
            moved.push(card.name);
          }
          if (moved.length > 0) {
            log(game, actorName(game, actor) + '将【遗计】本点所摸的 ' + moved.length + ' 张牌交给' + actorName(game, opp) + '：' + moved.join('、') + '。');
          }
        }
        // v6.1: per-point iteration. If pauseState has more points to
        // process, fire the next one (re-sets pendingChoice for the new
        // batch). Otherwise we're done.
        var saved = game.pauseState && game.pauseState.yiji;
        if (saved && saved.remainingPoints > 1) {
          saved.remainingPoints -= 1;
          return fireNextYijiPoint(game);
        }
        if (game.pauseState) game.pauseState.yiji = null;
        return success('遗计：分配完成。');
      }

      function resolveGuicaiReplaceChoice(game, pending, decision) {
        // v6.1: pending.actor is the 鬼才 HOLDER (the actor whose hand is used
        // to replace the judgement card). pending.judgementActor is whose
        // judgement is being replaced — usually the same as holder when 司马懿
        // is being judged on his own, but different when 鬼才 fires on the
        // opponent's judgement.
        var holder = pending.actor;
        var judgementActor = pending.judgementActor || holder;
        var holderState = game[holder];
        var judgementActorState = game[judgementActor];
        if (!holderState || !judgementActorState) return fail('未知角色。');
        var saved = game.pauseState && game.pauseState.judgeArea;
        if (!saved || saved.actor !== judgementActor) return fail('找不到挂起的判定。');
        var originalCard = saved.currentJudgementCard;
        var resolvedCard = originalCard;
        var declined = !decision.cardId;
        if (!declined) {
          var idx = holderState.hand.findIndex(function (c) { return c.id === decision.cardId; });
          if (idx < 0) return fail('找不到这张牌。');
          var replacement = holderState.hand.splice(idx, 1)[0];
          if (originalCard) discardCard(game, originalCard);
          resolvedCard = replacement;
          log(game, actorName(game, holder) + '发动【鬼才】，用【' + replacement.name + '】' + replacement.suit + ' ' + replacement.rank + '（' + replacement.id + '）代替' + actorName(game, judgementActor) + '的判定牌。');
        } else {
          log(game, actorName(game, holder) + '选择不发动【鬼才】。');
        }
        applyJudgeAreaOutcome(game, judgementActor, judgementActorState, saved.currentTrick, saved.currentReason, resolvedCard);
        // Resume the iteration from the trick AFTER the one we just resolved.
        game.pauseState.judgeArea = {
          actor: judgementActor,
          pending: saved.pending,
          idx: saved.idx + 1
        };
        var resumeResult = processJudgeArea(game, judgementActor);
        if (resumeResult && resumeResult.suspended) {
          return success('继续等待玩家选择。');
        }
        if (game.phase === 'gameover') return success('游戏结束。');
        // Judge area fully resolved — continue the turn flow (draw + play).
        return continueTurnAfterJudgeArea(game, judgementActor);
      }

      function newGame(options) {
        options = options || {};
        var random = makeRng(options.seed || Date.now());
        var roles = {
          player: options.playerRole || '主公',
          enemy: options.enemyRole || '反贼'
        };
        var firstActor = options.firstActor || firstActorFromRoles(roles, 'player');
        var game = {
          version: '3.0.0',
          random: random,
          nextId: 0,
          turn: firstActor,
          phase: 'play',
          winner: null,
          deck: [],
          discard: [],
          log: [],
          turnHistory: [],
          pendingChoice: null,
          pauseState: {},
          roles: roles,
          firstActor: firstActor,
          player: makePlayer(clone(HERO_CATALOG[options.playerHero] || HEROES.player)),
          enemy: makePlayer(clone(HERO_CATALOG[options.enemyHero] || HEROES.enemy))
        };
        game.deck = buildDeck(game, random);
        drawCards(game, 'player', 4);
        drawCards(game, 'enemy', 4);
        log(game, '乱世开局：' + actorName(game, firstActor) + '为主公先手。');
        if (options.startWithFirstTurn) startTurn(game, firstActor);
        return game;
      }

      function equipmentSlots() {
        return ['weapon', 'armor', 'horseMinus', 'horsePlus'];
      }

      function equipmentSlotLabel(slot) {
        var labels = { weapon: '武器', armor: '防具', horseMinus: '-1 马', horsePlus: '+1 马' };
        return labels[slot] || '装备';
      }

      function equipmentList(state) {
        return equipmentSlots().map(function (slot) {
          return state.equipment && state.equipment[slot] ? { slot: slot, card: state.equipment[slot] } : null;
        }).filter(Boolean);
      }

      function hasAnyTargetableCard(state) {
        return !!(state && ((state.hand && state.hand.length) || (state.judgeArea && state.judgeArea.length) || equipmentList(state).length));
      }

      function defaultTargetZone(state) {
        if (state.hand && state.hand.length) return 'hand';
        if (equipmentList(state).length) return 'equipment';
        if (state.judgeArea && state.judgeArea.length) return 'judge';
        return 'hand';
      }

      function getTargetZoneCards(game, targetActor, zone) {
        var target = game && game[targetActor];
        if (!target) return [];
        zone = zone || defaultTargetZone(target);
        if (zone === 'hand') {
          return target.hand.map(function (card, index) {
            return { zone: 'hand', zoneLabel: '手牌区', index: index, card: card, label: '手牌 ' + (index + 1), hidden: true };
          });
        }
        if (zone === 'equipment') {
          return equipmentList(target).map(function (entry) {
            return { zone: 'equipment', zoneLabel: '装备区', slot: entry.slot, card: entry.card, label: equipmentSlotLabel(entry.slot) + '【' + entry.card.name + '】' };
          });
        }
        if (zone === 'judge') {
          return target.judgeArea.map(function (card, index) {
            return { zone: 'judge', zoneLabel: '延时锦囊区', index: index, card: card, label: '判定 ' + (index + 1) + '【' + card.name + '】' };
          });
        }
        return [];
      }

      function removeTargetZoneCard(game, targetActor, zone, cardId) {
        var target = game[targetActor];
        zone = zone || defaultTargetZone(target);
        var choices = getTargetZoneCards(game, targetActor, zone);
        if (!choices.length) return null;
        var picked;
        if (cardId) {
          picked = choices.find(function (entry) { return entry.card.id === cardId; });
          if (!picked) return null;
        } else if (zone === 'hand') {
          picked = choices[randomHandIndex(game, target)];
        } else {
          picked = choices[0];
        }
        if (!picked || !picked.card) return null;
        if (zone === 'hand') {
          return { card: target.hand.splice(picked.index, 1)[0], zone: '手牌' };
        }
        if (zone === 'equipment') {
          target.equipment[picked.slot] = null;
          return { card: picked.card, zone: '装备区' };
        }
        if (zone === 'judge') {
          return { card: target.judgeArea.splice(picked.index, 1)[0], zone: '判定区' };
        }
        return null;
      }

      function canPlayCard(game, actor, card) {
        if (!card) return fail('找不到这张牌。');
        if (game.phase === 'gameover') return fail('游戏已经结束。');
        if (game.turn !== actor) return fail('还没有轮到你行动。');
        if (game.phase !== 'play') return fail('当前不是出牌阶段。');
        var self = game[actor];
        if (card.type === 'shan' || card.type === 'wuxie') return fail('【' + card.name + '】只能用于响应，本版会自动打出。');
        var targetProtection = cardTargetProtection(game, actor, opponent(actor), card);
        if (targetProtection) return fail(targetProtection.message);
        // v7 PR-10/11: 1V1 顺手牵羊 / 兵粮寸断 都已取消距离限制
        //   顺手 (1V1): 目标 "有牌的对手"，无距离限制 — PR-10 已生效
        //   兵粮 (1V1): 目标 "对手"，无距离限制 — PR-11 已生效
        // 至此 1V1 标准包内已无距离限制的锦囊牌。
        if (isShaCard(card) && !canReachWithSha(game, actor, opponent(actor))) return fail('距离不足，当前武器范围无法使用【杀】。');
        if (isShaCard(card) && self.usedSha && !canUseUnlimitedSha(self)) return fail('本回合已经使用过【杀】。');
        if (card.type === 'tao') {
          // v7 PR-1: gltjk 基本牌·桃 使用方法Ⅰ —— 使用目标"包括你在内的一名已受伤的角色"。
          // 在 1v1 中，任一方受伤即可出【桃】；若双方满血则无合法目标。
          var taoSelfWounded = self.hp < self.maxHp;
          var taoFoeWounded = game[opponent(actor)].hp < game[opponent(actor)].maxHp;
          if (!taoSelfWounded && !taoFoeWounded) return fail('体力已满，不能使用【桃】。');
        }
        if (card.type === 'jiu') {
          // v7 PR-8: gltjk 基本牌·酒 使用方法Ⅰ —— "出牌阶段。每回合限一次。"
          // flags.jiuUsedThisTurn 在 resetActorTurnState / resetEndOfTurnState
          // 时复位，spec 的"此回合内"绑回合 已由 shaBonus 在 turn-start /
          // turn-end 复位实现。
          if (self.flags && self.flags.jiuUsedThisTurn) {
            return fail('本回合已经使用过【酒】。');
          }
        }
        if ((card.type === 'guohe' || card.type === 'shunshou') && !hasAnyTargetableCard(game[opponent(actor)])) {
          return fail('对方没有可操作的牌。');
        }
        // v7 PR-9: gltjk card__scroll.md 过河拆桥 (1V1) — "你选择一项：
        // 1.弃置目标角色的装备区里的一张牌；2.观看目标角色的手牌并弃置其中一张牌。"
        // 1V1 变体不允许选判定区；若对手只有判定区有牌而无手牌/装备 → 无合法行动，拒绝。
        if (card.type === 'guohe') {
          var guoheFoe = game[opponent(actor)];
          var guoheHasHand = (guoheFoe.hand || []).length > 0;
          var guoheHasEquip = equipmentList(guoheFoe).length > 0;
          if (!guoheHasHand && !guoheHasEquip) {
            return fail('1V1【过河拆桥】只能弃对手装备区或手牌；对方两者皆空。');
          }
        }
        // v7 PR-6: gltjk flow__condition.md 共同合法性: "判定区里有延时类锦囊
        // 牌的角色不是使用同名延时类锦囊牌的合法目标"。乐 / 兵 → opponent；
        // 闪电 → self。
        if (card.family === 'delayed') {
          var delayedTargetActor = card.type === 'shandian' ? actor : opponent(actor);
          var delayedTargetState = game[delayedTargetActor];
          var alreadyHas = (delayedTargetState.judgeArea || []).some(function (judge) {
            return judge && judge.type === card.type;
          });
          if (alreadyHas) {
            return fail(actorName(game, delayedTargetActor) + '的判定区已有【' + card.name + '】，不能再放置同名延时锦囊。');
          }
        }
        if (card.type === 'jiedao') {
          // v7 PR-5: gltjk card__scroll.md 注 — 借刀杀人 两次合法性检测，
          // 第一次在 "选择 An 为目标的同时选择 Bn"。1v1 中 An = opponent，
          // Bn = source 本人。
          // canPlayCard 阶段（第一次合法性检测）做以下保守检查：
          //   1) An 装备区有武器；
          //   2) An 的武器范围覆盖 Bn (canReachWithSha)；
          //   3) Bn 不被 onCardTarget 钩子拒绝（如【谦逊】等"不能成为目标"
          //      的技能）。
          // 装备效果（仁王盾屏蔽黑杀 / 藤甲屏蔽普通杀）等属于"对该牌无效"
          // 而非"非合法目标"，且不知道 An 的具体 杀 颜色 / 属性，因此放
          // 到 resolveJiedaoDecision 的第二次合法性检测中按实际 杀 牌再判。
          var jiedaoOpp = game[opponent(actor)];
          if (!jiedaoOpp.equipment.weapon) return fail('目标没有武器，无法发动【借刀杀人】。');
          if (!canReachWithSha(game, opponent(actor), actor)) {
            return fail('目标武器范围内没有合法的【杀】目标，无法发动【借刀杀人】。');
          }
          var jiedaoProtection = cardTargetProtection(game, opponent(actor), actor, { type: 'sha', name: '杀' }, '杀');
          if (jiedaoProtection) {
            return fail('目标无法对你使用【杀】，无法发动【借刀杀人】。');
          }
        }
        return success('可以使用。');
      }

      // 铁骑 (Phase 6C-bis): the cache wording ("发动者选择触发判定" /
      // "可结算") frames the skill as optional, although the v5/v6 engine
      // auto-fires. Rather than refactor playSha to pause mid-flow for a
      // per-杀 prompt (which would require pauseState.playSha and a
      // continuePlaySha continuation), we expose a persistent skill
      // preference that the player can flip on the skill bar:
      //   'auto' / undefined — fire on every Sha (legacy behavior, AI uses)
      //   'decline'          — skip 铁骑 entirely (no judgement, target may
      //                        still 闪 normally)
      function triggerTieqiNeedResponse(game, actor, targetActor, responseType, triggeringCard) {
        var source = game[actor];
        if (!source || responseType !== 'shan' || !isShaCard(triggeringCard) || !hasSkill(source, 'tieqi')) return null;
        var pref = source.skillPreferences && source.skillPreferences.tieqi;
        if (pref === 'decline') {
          log(game, actorName(game, actor) + '选择不发动【铁骑】。');
          return null;
        }
        var tieqiJudge = judge(game, actor, '【铁骑】');
        if (tieqiJudge && tieqiJudge.color === 'red') {
          log(game, actorName(game, actor) + '发动【铁骑】，红色判定令' + actorName(game, targetActor) + '不能打出【闪】。');
          resolveJudgementCard(game, actor, source, '【铁骑】', tieqiJudge);
          return { responseLocked: true };
        }
        log(game, actorName(game, actor) + '发动【铁骑】，判定未命中。');
        resolveJudgementCard(game, actor, source, '【铁骑】', tieqiJudge);
        return null;
      }

      function playSha(game, actor, card) {
        var self = game[actor];
        var targetActor = opponent(actor);
        var target = game[targetActor];
        var targetProtection = cardTargetProtection(game, actor, targetActor, card, '杀');
        if (targetProtection) return fail(targetProtection.message);
        if (!canReachWithSha(game, actor, targetActor)) return fail('距离不足，当前武器范围无法使用【杀】。');
        self.usedSha = true;
        self.usedOrRespondedSha = true;
        var amount = 1 + (self.shaBonus || 0);
        self.shaBonus = 0;
        // v8 PR-B3: 朱雀羽扇 — gltjk card__equipment.md "你可以将一张普通
        // 【杀】当火【杀】使用; 你可以将视为使用【杀】改为视为使用火【杀】"。
        // 现处理: 装备朱雀 + 普通杀 (card.type === 'sha') 且
        // skillPreferences.zhuque !== 'decline' → 转化为 火杀 (mutate type
        // 让 damage() 走 fire nature 路径)。已是 fire_sha / thunder_sha 不
        // 重复转。card-as 虚拟杀 (zhangba / wusheng / longdan 等的 virtual)
        // 也走此路径因为它们 card.type === 'sha'。
        var zhuqueWeapon = self.equipment && self.equipment.weapon;
        if (zhuqueWeapon && zhuqueWeapon.type === 'zhuque' && card.type === 'sha'
            && (!self.skillPreferences || self.skillPreferences.zhuque !== 'decline')) {
          card.type = 'fire_sha';
          card.name = '火杀';
          log(game, actorName(game, actor) + '发动【朱雀羽扇】，将【杀】转化为【火杀】。');
        }
        log(game, actorName(game, actor) + '对' + actorName(game, targetActor) + '使用【' + card.name + '】。');

        // v7 PR-15: gltjk card__equipment.md 方天画戟 — "若你使用的【杀】是
        // 最后的手牌，你使用此【杀】的额外目标数上限+2"。1v1 中只有一名对手
        // (额定 1 + 额外 0)，即便额外目标数上限+2 也无人可选；本 PR 仅做触发
        // 记录 (log + flags.fangtianBonus) 作为多人模式 / future trick 的占位。
        // 判定: sha 已从手牌移除，hand.length === 0 即上一刻该 sha 是最后一张。
        // 每次 playSha 进入时先清旧标记，避免上次结算残留。
        self.flags = self.flags || {};
        self.flags.fangtianBonus = false;
        var weaponNow = self.equipment && self.equipment.weapon;
        if (weaponNow && weaponNow.type === 'fangtian' && self.hand.length === 0) {
          self.flags.fangtianBonus = true;
          log(game, '【方天画戟】触发：' + actorName(game, actor) + '使用最后一张手牌【杀】，额外目标数上限 +2 (1v1 中无额外可选目标)。');
        }

        // v7 PR-4: 雌雄双股剑 fires at "指定目标后" (gltjk flow__use.md step 5).
        // 在响应窗口之前结算；若需要 source/target 的 pendingChoice，则把
        // sha 的剩余状态保存到 pauseState.playSha，由 resolveCixiong* 完成
        // 后调用 continueShaAfterCixiong 接着 渲染 仁王/闪/八卦/贯石/青龙/伤害.
        var cixiongResult = applyCixiongOnDesignate(game, actor, targetActor);
        if (cixiongResult && cixiongResult.paused) {
          if (!game.pauseState) game.pauseState = {};
          game.pauseState.playSha = { actor: actor, card: card, amount: amount };
          return success('【雌雄双股剑】结算中…');
        }

        // v8 PR-C2: 流离 (大乔) — 杀指定目标后 触发 hook (1v1 中目标候选恒空,
        // 实际为 no-op; 多人模式扩展点)
        SkillRuntime.runHook(skillRegistry, 'onShaTargeted', {
          game: game,
          sourceActor: actor,
          targetActor: targetActor,
          target: game[targetActor],
          card: card
        });

        return continueShaAfterCixiong(game, actor, card, amount);
      }

      // v9 PR-E25/E26: 非消耗式探测 — 玩家是否有【闪】可作响应 (真闪 + 转化候选).
      function hasShanResponseAvailable(state) {
        if (!state) return false;
        return listShanResponseOptions(state).length > 0;
      }

      function continueShaAfterCixiong(game, actor, card, amount) {
        var self = game[actor];
        var targetActor = opponent(actor);
        var target = game[targetActor];
        var ignoreArmor = isArmorIgnoredBySha(game, actor, card);

        if (!ignoreArmor && card.color === 'black' && hasEquipmentEffect(target, 'blockBlackSha')) {
          log(game, actorName(game, targetActor) + '的【仁王盾】抵消了黑色【杀】。');
          discardCard(game, card);
          return success('仁王盾抵消。');
        }

        var responseContext = {
          game: game,
          actor: actor,
          targetActor: targetActor,
          responseType: 'shan',
          reason: '【杀】',
          card: card,
          responseLocked: false
        };
        var responseResults = SkillRuntime.runHook(skillRegistry, 'onNeedResponse', responseContext);
        for (var responseIndex = 0; responseIndex < responseResults.length; responseIndex += 1) {
          if (responseResults[responseIndex].result && responseResults[responseIndex].result.responseLocked) {
            responseContext.responseLocked = true;
          }
        }

        // v9 PR-E25: 玩家是【杀】目标 + skillPreferences.shanResponse==='ask' +
        //   有【闪】可响应 → 暂停, 把"出不出闪"的决策交给玩家. 引擎默认 (无该
        //   pref) 仍走自动响应, 保证旧测试同步行为不变.
        // v10 V3: 走 requestPlayerResponse 框架 — pauseState.shaResponse + pendingChoice
        // 的设置统一. resolve 在 RESPONSE_KIND_RESOLVERS['shan-response'] 注册.
        if (targetActor === 'player' && !responseContext.responseLocked
            && target.skillPreferences && target.skillPreferences.shanResponse === 'ask'
            && hasShanResponseAvailable(target)) {
          return requestPlayerResponse(game, {
            kind: 'shan-response',
            actor: 'player',
            pauseKey: 'shaResponse',
            source: { actor: actor, card: card, amount: amount },
            // v9 PR-E26: 列出所有可作【闪】的牌 (真闪 + 龙胆/倾国 转化), 玩家自选.
            options: listShanResponseOptions(target),
            meta: { sourceActor: actor, shaName: card.name },
            logMessage: '等待' + actorName(game, 'player') + '决定是否打出【闪】。',
            statusMessage: '等待玩家响应【杀】。'
          });
        }

        var dodged = false;
        if (!responseContext.responseLocked && consumeResponse(game, targetActor, 'shan', '【杀】')) {
          dodged = true;
        } else if (!responseContext.responseLocked && !ignoreArmor
            && target.equipment && target.equipment.armor && target.equipment.armor.type === 'bagua') {
          var baguaJudge = judge(game, targetActor, '【八卦阵】');
          if (baguaJudge && baguaJudge.color === 'red') {
            log(game, actorName(game, targetActor) + '的【八卦阵】判定为红色，视为打出【闪】。');
            dodged = true;
          }
          resolveJudgementCard(game, targetActor, target, '【八卦阵】', baguaJudge);
        }
        return resolveShaAfterResponse(game, actor, card, amount, dodged);
      }

      // v9 PR-E25: 【杀】响应窗口结束后的结算 (贯石/青龙/伤害). 从原
      // continueShaAfterCixiong 拆出, 供同步路径 + shan-response 暂停恢复共用.
      function resolveShaAfterResponse(game, actor, card, amount, dodged) {
        var self = game[actor];
        var targetActor = opponent(actor);
        var target = game[targetActor];
        var weapon = self.equipment && self.equipment.weapon;

        if (dodged) {
          if (weapon && weapon.type === 'guanshi' && self.hand.length >= 2) {
            var costA = self.hand.shift();
            var costB = self.hand.shift();
            discardCard(game, costA);
            discardCard(game, costB);
            log(game, actorName(game, actor) + '发动【贯石斧】，弃置两张牌令【杀】强制命中。');
            if (damage(game, targetActor, amount, actor, '【' + card.name + '】', card)) applyWeaponHitEffects(game, actor, targetActor);
            return success('贯石斧强制命中。');
          }
          if (weapon && weapon.type === 'qinglong') {
            var follow = removeFirstCardOfType(self, 'sha');
            if (follow) {
              log(game, actorName(game, actor) + '发动【青龙偃月刀】，继续使用一张【杀】。');
              discardCard(game, card);
              return playSha(game, actor, follow);
            }
          }
          log(game, actorName(game, targetActor) + '闪避成功，没有受到伤害。');
          discardCard(game, card);
          return success('目标闪避。');
        }

        if (damage(game, targetActor, amount, actor, '【' + card.name + '】', card)) applyWeaponHitEffects(game, actor, targetActor);
        return success(target.name + '受到攻击。');
      }

      // v9 PR-E25/E26: 玩家解决【闪】响应 pendingChoice.
      //   decision.cardId — 指定用哪张牌当【闪】 (真闪 / 龙胆 / 倾国转化)
      //   decision.use    — true 时不指定 cardId, 引擎自动取第一张 (兼容旧调用)
      //   都没有 → 不出【闪】.
      function resolveShanResponseChoice(game, pending, decision) {
        var saved = game.pauseState && game.pauseState.shaResponse;
        if (!saved) return fail('找不到【杀】响应的暂停状态。');
        game.pauseState.shaResponse = null;
        var actor = saved.actor;
        var card = saved.card;
        var amount = saved.amount;
        var target = game.player;
        var d = decision || {};
        var dodged = false;
        if (d.cardId) {
          dodged = consumeResponse(game, 'player', 'shan', '【杀】', d.cardId);
          if (!dodged) log(game, actorName(game, 'player') + '指定的牌无法当【闪】。');
        } else if (d.use) {
          dodged = consumeResponse(game, 'player', 'shan', '【杀】');
          if (!dodged) log(game, actorName(game, 'player') + '没有可打出的【闪】。');
        } else {
          log(game, actorName(game, 'player') + '选择不打出【闪】。');
          var ignoreArmor = isArmorIgnoredBySha(game, actor, card);
          var armor = target.equipment && target.equipment.armor;
          if (armor && !ignoreArmor && armor.type === 'bagua') {
            var baguaJudge = judge(game, 'player', '【八卦阵】');
            if (baguaJudge && baguaJudge.color === 'red') {
              log(game, actorName(game, 'player') + '的【八卦阵】判定为红色，视为打出【闪】。');
              dodged = true;
            }
            resolveJudgementCard(game, 'player', target, '【八卦阵】', baguaJudge);
          }
        }
        return resolveShaAfterResponse(game, actor, card, amount, dodged);
      }

      // v10 V3: 注册到 response framework. UI 通过 resolvePendingChoice 或
      // resolveResponseChoice 调过来时, 此 fn 拿 pauseState.shaResponse + decision
      // 决定 dodged, 再走 resolveShaAfterResponse 共享后续结算.
      registerResponseKind('shan-response', resolveShanResponseChoice);

      // v10 V6: 决斗 链状态机 — playDuel 启动, advanceDuelChain 推进.
      //   pauseState.duelChain = { starterActor, currentResponder, reason }
      //   每轮: currentResponder 出杀; 出不出 → 切换; 出不了 → 受 1 伤, 链结束.
      //   玩家 (skillPreferences.shaDuelResponse='ask' + 有杀响应选项) 暂停;
      //   AI / 默认 走 consumeResponse 自动消耗 (有 sha / 转化即用).
      function playDuel(game, actor, card) {
        discardCard(game, card);
        log(game, actorName(game, actor) + '发起【决斗】。');
        if (!game.pauseState) game.pauseState = {};
        game.pauseState.duelChain = {
          starterActor: actor,
          currentResponder: opponent(actor),
          reason: '【决斗】'
        };
        return advanceDuelChain(game);
      }

      function advanceDuelChain(game) {
        var chain = game.pauseState && game.pauseState.duelChain;
        if (!chain) return fail('决斗链状态丢失。');
        if (game.phase === 'gameover') {
          game.pauseState.duelChain = null;
          return success('决斗结算完成。');
        }
        var responder = chain.currentResponder;
        var state = game[responder];
        var hasSha = hasShaResponseAvailable(state);

        // 玩家 ask + 有杀响应 → 暂停
        if (responder === 'player'
            && state.skillPreferences && state.skillPreferences.shaDuelResponse === 'ask'
            && hasSha) {
          return requestPlayerResponse(game, {
            kind: 'sha-duel-response',
            actor: 'player',
            pauseKey: 'duelChain',
            source: chain,
            options: listShaResponseOptions(state),
            meta: {
              reason: chain.reason,
              starterActor: chain.starterActor
            },
            logMessage: '等待' + actorName(game, 'player') + '决定是否打出【杀】响应' + chain.reason + '。',
            statusMessage: '等待玩家响应【决斗】。'
          });
        }

        // 非玩家 ask 路径: AI / 默认 — 走原 consumeResponse 自动消耗
        if (consumeResponse(game, responder, 'sha', chain.reason)) {
          chain.currentResponder = opponent(responder);
          return advanceDuelChain(game);
        }
        // 无杀 → 受 1 伤, 链结束
        var loser = responder;
        game.pauseState.duelChain = null;
        damage(game, loser, 1, opponent(loser), chain.reason);
        return success('决斗结算完成。');
      }

      // resolver — 玩家 sha-duel-response pendingChoice 决定.
      function resolveDuelResponseChoice(game, pending, decision) {
        var chain = game.pauseState && game.pauseState.duelChain;
        if (!chain) return fail('找不到决斗响应的暂停状态。');

        if (decision.cardId || decision.use) {
          var consumed = consumeResponse(game, 'player', 'sha', chain.reason, decision.cardId || null);
          if (!consumed) {
            // 罕见: 指定的 cardId 无效或库中此牌已不可用 → 视为放弃
            log(game, actorName(game, 'player') + '没有可打出的【杀】。');
            var ploser = 'player';
            game.pauseState.duelChain = null;
            damage(game, ploser, 1, opponent(ploser), chain.reason);
            return success('决斗结算完成。');
          }
          chain.currentResponder = opponent('player');
          return advanceDuelChain(game);
        }
        // 玩家放弃出杀 → 受 1 伤
        log(game, actorName(game, 'player') + '选择不打出【杀】响应' + chain.reason + '。');
        game.pauseState.duelChain = null;
        damage(game, 'player', 1, opponent('player'), chain.reason);
        return success('决斗结算完成。');
      }

      registerResponseKind('sha-duel-response', resolveDuelResponseChoice);

      function playAOE(game, actor, card, responseType, title) {
        var targetActor = opponent(actor);
        discardCard(game, card);
        log(game, actorName(game, actor) + '使用【' + title + '】。');
        // v10 V4: 万箭齐发 (responseType='shan') + 玩家为目标 + shanResponse=ask +
        // 有闪可响应 → 暂停, 让玩家自选闪 / 不出. 引擎默认仍走自动响应.
        if (responseType === 'shan' && targetActor === 'player') {
          var aoeTarget = game.player;
          if (aoeTarget.skillPreferences && aoeTarget.skillPreferences.shanResponse === 'ask'
              && hasShanResponseAvailable(aoeTarget)) {
            return requestPlayerResponse(game, {
              kind: 'wanjian-response',
              actor: 'player',
              pauseKey: 'wanjianResponse',
              source: { sourceActor: actor, title: title },
              options: listShanResponseOptions(aoeTarget),
              meta: { sourceActor: actor, sourceName: title },
              logMessage: '等待' + actorName(game, 'player') + '决定是否打出【闪】响应【' + title + '】。',
              statusMessage: '等待玩家响应【' + title + '】。'
            });
          }
        }
        if (consumeResponse(game, targetActor, responseType, '【' + title + '】')) {
          log(game, actorName(game, targetActor) + '成功化解【' + title + '】。');
        } else {
          damage(game, targetActor, 1, actor, '【' + title + '】');
        }
        return success(title + '结算完成。');
      }

      // v10 V4: 万箭齐发 闪响应 — 玩家 decision 决定 化解 / damage(1).
      // saved.sourceActor 是万箭来源, saved.title 是显示文案.
      function resolveWanjianResponseChoice(game, pending, decision) {
        var saved = game.pauseState && game.pauseState.wanjianResponse;
        if (!saved) return fail('找不到【万箭齐发】响应的暂停状态。');
        game.pauseState.wanjianResponse = null;
        var sourceActor = saved.sourceActor;
        var title = saved.title || '万箭齐发';
        var dodged = false;
        if (decision.cardId) {
          dodged = consumeResponse(game, 'player', 'shan', '【' + title + '】', decision.cardId);
          if (!dodged) log(game, actorName(game, 'player') + '指定的牌无法当【闪】。');
        } else if (decision.use) {
          dodged = consumeResponse(game, 'player', 'shan', '【' + title + '】');
          if (!dodged) log(game, actorName(game, 'player') + '没有可打出的【闪】。');
        } else {
          log(game, actorName(game, 'player') + '选择不打出【闪】响应【' + title + '】。');
        }
        if (dodged) {
          log(game, actorName(game, 'player') + '成功化解【' + title + '】。');
        } else {
          damage(game, 'player', 1, sourceActor, '【' + title + '】');
        }
        return success(title + '响应完成。');
      }

      registerResponseKind('wanjian-response', resolveWanjianResponseChoice);

      function getHuogongChoice(game, actor) {
        var self = game && game[actor];
        var target = game && game[opponent(actor)];
        if (!self || !target || !target.hand || !target.hand.length) {
          return { ok: false, revealedCard: null, usableCostIds: [], unusableCostIds: [], usableCards: [], unusableCards: [], message: '目标没有手牌。' };
        }
        var revealed = target.hand[0];
        var usableCards = [];
        var unusableCards = [];
        self.hand.forEach(function (card) {
          if (card.type === 'huogong') return;
          if (card.suit === revealed.suit) usableCards.push(card);
          else unusableCards.push(card);
        });
        return {
          ok: true,
          revealedCard: revealed,
          revealedSuit: revealed.suit,
          usableCards: usableCards,
          unusableCards: unusableCards,
          usableCostIds: usableCards.map(function (card) { return card.id; }),
          unusableCostIds: unusableCards.map(function (card) { return card.id; })
        };
      }

      function playCard(game, actor, cardId, options) {
        var self = game[actor];
        options = options || {};
        if (!self) return fail('未知角色。');
        var card = self.hand.find(function (item) { return item.id === cardId; });
        var playable = canPlayCard(game, actor, card);
        if (!playable.ok) return playable;
        if (card && (card.type === 'guohe' || card.type === 'shunshou') && (options.targetZone || options.targetCardId)) {
          var requestedZone = options.targetZone || defaultTargetZone(game[opponent(actor)]);
          var targetChoices = getTargetZoneCards(game, opponent(actor), requestedZone);
          if (!targetChoices.length) return fail('目标区域没有可操作的牌。');
          if (options.targetCardId && !targetChoices.some(function (entry) { return entry.card.id === options.targetCardId; })) {
            return fail('指定的目标牌不存在。');
          }
        }
        if (card && card.type === 'huogong' && options.huogongCostCardId) {
          var huogongChoice = getHuogongChoice(game, actor);
          if (!huogongChoice.ok) return fail(huogongChoice.message);
          if (huogongChoice.usableCostIds.indexOf(options.huogongCostCardId) < 0) return fail('请选择与展示牌同花色的手牌。');
        }
        card = removeCardFromHand(self, cardId);

        if (isShaCard(card)) return playSha(game, actor, card);

        if (card.family === 'equipment') return equipCard(game, actor, card);

        if (card.family === 'delayed') {
          if (card.type === 'shandian') {
            self.judgeArea.push(card);
            log(game, actorName(game, actor) + '将【闪电】置入自己的判定区。');
          } else {
            var delayedTarget = game[opponent(actor)];
            delayedTarget.judgeArea.push(card);
            log(game, actorName(game, actor) + '将【' + card.name + '】置入' + actorName(game, opponent(actor)) + '的判定区。');
          }
          return success('延时锦囊生效。');
        }

        if (card.type === 'tao') {
          // v7 PR-1: 目标"包括你在内的一名已受伤的角色"。options.taoTarget
          // 可指定 'player' / 'enemy'；未指定时默认为发动者，若发动者满血而对手
          // 受伤则回退到对手（保持 canPlayCard 已放行的合法性）。
          var requestedTaoTarget = options.taoTarget;
          var taoTargetActor;
          if (requestedTaoTarget === 'player' || requestedTaoTarget === 'enemy') {
            taoTargetActor = requestedTaoTarget;
          } else if (self.hp < self.maxHp) {
            taoTargetActor = actor;
          } else {
            taoTargetActor = opponent(actor);
          }
          var taoTargetState = game[taoTargetActor];
          if (!taoTargetState || taoTargetState.hp >= taoTargetState.maxHp) {
            return fail('目标体力已满，不能使用【桃】。');
          }
          discardCard(game, card);
          taoTargetState.hp = Math.min(taoTargetState.maxHp, taoTargetState.hp + 1);
          log(game, actorName(game, actor) + '使用【桃】' + (taoTargetActor === actor ? '' : '对' + actorName(game, taoTargetActor)) + '，回复 1 点体力。');
          return success('回复体力。');
        }

        if (card.type === 'jiu') {
          // v7 PR-8: 标记已用 + shaBonus = 1（不累加，spec "下一张【杀】"
          // 即下一次结算 +1，不是叠加多次酒）
          discardCard(game, card);
          if (!self.flags) self.flags = {};
          self.flags.jiuUsedThisTurn = true;
          self.shaBonus = 1;
          log(game, actorName(game, actor) + '饮下【酒】，本回合下一张【杀】伤害 +1。');
          return success('下一张杀伤害提升。');
        }

        if (card.type === 'wuzhong') {
          // v7 PR-16: gltjk card__scroll.md 无中生有 (1V1/界限突破/国-标):
          //   "使用目标: 包括你在内的一名角色"。options.wuzhongTarget 可指定
          //   'player' / 'enemy'; 未指定时默认 = actor。
          discardCard(game, card);
          var wzTargetActor = (options.wuzhongTarget === 'player' || options.wuzhongTarget === 'enemy')
            ? options.wuzhongTarget
            : actor;
          if (!game[wzTargetActor]) {
            return fail('无效的【无中生有】目标。');
          }
          log(game, actorName(game, actor) + '使用【无中生有】' + (wzTargetActor === actor ? '' : '令' + actorName(game, wzTargetActor)) + '摸两张牌。');
          drawCards(game, wzTargetActor, 2);
          return finishTrickUse(game, actor, card, success('摸两张牌。'), options);
        }

        if (card.type === 'juedou') {
          // v10 V5: 走无懈链框架. WUXIE_CONTINUATIONS['juedou'] 注册在 trick 区下方.
          return checkWuxieAndContinue(game, opponent(actor), '【决斗】', 'juedou', {
            actor: actor, card: card, options: options
          });
        }
        if (card.type === 'nanman') return finishTrickUse(game, actor, card, playAOE(game, actor, card, 'sha', '南蛮入侵'), options);
        if (card.type === 'wanjian') return finishTrickUse(game, actor, card, playAOE(game, actor, card, 'shan', '万箭齐发'), options);

        if (card.type === 'guohe') {
          // v7 PR-9: 1V1 变体两选项 — 装备区一张 / 看手并弃一张。
          // v10 V5: 走无懈链框架.
          discardCard(game, card);
          return checkWuxieAndContinue(game, opponent(actor), '【过河拆桥】', 'guohe', {
            actor: actor, card: card, options: options
          });
        }

        if (card.type === 'shunshou') {
          // v10 V5: 走无懈链框架.
          discardCard(game, card);
          return checkWuxieAndContinue(game, opponent(actor), '【顺手牵羊】', 'shunshou', {
            actor: actor, card: card, options: options
          });
        }

        if (card.type === 'taoyuan') {
          discardCard(game, card);
          // v7 PR-2: gltjk card__scroll.md 注："对未受伤的角色无效"。
          // 多角色结算顺序：从当前回合角色开始按逆时针方向（rule__principle.md
          // 多角色结算顺序原则 a.），即发动者先结算、对手后结算。
          log(game, actorName(game, actor) + '使用【桃园结义】。');
          var taoyuanOrder = [actor, opponent(actor)];
          taoyuanOrder.forEach(function (side) {
            var taoyuanState = game[side];
            if (!taoyuanState) return;
            if (taoyuanState.hp >= taoyuanState.maxHp) {
              log(game, '【桃园结义】对' + actorName(game, side) + '无效（未受伤）。');
              return;
            }
            taoyuanState.hp = Math.min(taoyuanState.maxHp, taoyuanState.hp + 1);
            log(game, actorName(game, side) + '因【桃园结义】回复 1 点体力。');
          });
          return finishTrickUse(game, actor, card, success('桃园结义结算完成。'), options);
        }

        if (card.type === 'wugu') {
          // v7 PR-7: gltjk card__scroll.md 五谷丰登 —
          //   "执行动作：当此牌指定目标后，你亮出牌堆顶的 X 张牌（X 为目标数）。"
          //   "作用效果：目标角色获得这些牌中（剩余）的一张牌。"
          //   "若你未将执行动作完整执行完毕，终止此牌的使用结算。"
          //   "使用结算结束后，将这些牌中剩余的牌置入弃牌堆。"
          discardCard(game, card);
          var wuguTargetCount = StateRuntime.aliveActorCount(game);
          // 多次重洗以尽可能凑齐 X 张
          for (var rs = 0; rs < 3 && game.deck.length < wuguTargetCount; rs++) {
            reshuffleIfNeeded(game);
          }
          if (game.deck.length < wuguTargetCount) {
            log(game, '【五谷丰登】牌堆不足以亮出 ' + wuguTargetCount + ' 张牌，结算终止。');
            return finishTrickUse(game, actor, card, success('五谷丰登终止（牌堆不足）。'), options);
          }
          var wuguPool = [];
          for (var wi = 0; wi < wuguTargetCount; wi++) wuguPool.push(game.deck.pop());
          log(game, actorName(game, actor) + '使用【五谷丰登】，亮出 ' + wuguPool.map(function (c) { return '【' + c.name + '】'; }).join(' / ') + '。');
          // 多角色结算顺序原则：从当前回合角色起按逆时针 → 1v1 即 [actor, opponent(actor)]
          return finishTrickUse(game, actor, card, processWuguPick(game, actor, card, wuguPool, [actor, opponent(actor)], 0, options), options);
        }

        if (card.type === 'huogong') {
          // v10 V5: 走无懈链框架. 后续 huogong 流程移到 WUXIE_CONTINUATIONS['huogong'].
          discardCard(game, card);
          return checkWuxieAndContinue(game, opponent(actor), '【火攻】', 'huogong', {
            actor: actor, card: card, options: options
          });
        }

        if (card.type === 'tiesuo') {
          discardCard(game, card);
          if (options.mode === 'recast') {
            log(game, actorName(game, actor) + '重铸【铁索连环】，摸一张牌。');
            drawCards(game, actor, 1);
            return success('铁索连环重铸完成。');
          }
          var targets = Array.from(options.targets || [opponent(actor)]).filter(function (side, index, array) {
            return (side === 'player' || side === 'enemy') && array.indexOf(side) === index;
          }).slice(0, 2);
          if (!targets.length) return fail('请选择要横置或重置的角色。');
          targets.forEach(function (side) {
            game[side].chained = !game[side].chained;
            log(game, actorName(game, actor) + '使用【铁索连环】，' + actorName(game, side) + (game[side].chained ? '横置。' : '重置。'));
          });
          return finishTrickUse(game, actor, card, success('铁索连环结算完成。'), options);
        }

        if (card.type === 'jiedao') {
          // v7 PR-5: gltjk card__scroll.md 注 — 须做两次合法性检测.
          // 第一次已在 canPlayCard 检过; 这里做第二次 (在 jiedao 继续逻辑里).
          // v10 V5: 走无懈链框架.
          discardCard(game, card);
          return checkWuxieAndContinue(game, opponent(actor), '【借刀杀人】', 'jiedao', {
            actor: actor, card: card, options: options
          });
        }

        discardCard(game, card);
        return success('卡牌已使用。');
      }

      // v10 V5: 无懈链 settle 时调用. ctx = { actor, card, options }.
      // wuxied: true → 锦囊被抵消; false → 锦囊照常结算.

      registerWuxieContinuation('juedou', function (game, ctx, wuxied) {
        if (wuxied) {
          discardCard(game, ctx.card);
          return finishTrickUse(game, ctx.actor, ctx.card, success('决斗被无懈可击。'), ctx.options);
        }
        return finishTrickUse(game, ctx.actor, ctx.card, playDuel(game, ctx.actor, ctx.card), ctx.options);
      });

      registerWuxieContinuation('guohe', function (game, ctx, wuxied) {
        // 注意: guohe 在调 checkWuxieAndContinue 前已 discardCard. wuxied 仅影响后续动作.
        if (wuxied) {
          return finishTrickUse(game, ctx.actor, ctx.card, success('过河拆桥被无懈可击。'), ctx.options);
        }
        return finishTrickUse(game, ctx.actor, ctx.card,
          resolveGuohe1v1(game, ctx.actor, opponent(ctx.actor), ctx.options), ctx.options);
      });

      registerWuxieContinuation('shunshou', function (game, ctx, wuxied) {
        if (wuxied) {
          return finishTrickUse(game, ctx.actor, ctx.card, success('顺手牵羊被无懈可击。'), ctx.options);
        }
        var self = game[ctx.actor];
        var opt = ctx.options || {};
        var stolenInfo = removeTargetZoneCard(game, opponent(ctx.actor), opt.targetZone, opt.targetCardId);
        if (stolenInfo && stolenInfo.card) {
          self.hand.push(stolenInfo.card);
          log(game, actorName(game, ctx.actor) + '使用【顺手牵羊】，获得了'
            + actorName(game, opponent(ctx.actor)) + stolenInfo.zone + '的一张牌。');
        }
        return finishTrickUse(game, ctx.actor, ctx.card, success('获得对方一张牌。'), ctx.options);
      });

      registerWuxieContinuation('huogong', function (game, ctx, wuxied) {
        if (wuxied) {
          return finishTrickUse(game, ctx.actor, ctx.card, success('火攻被无懈可击。'), ctx.options);
        }
        var self = game[ctx.actor];
        var fireTarget = game[opponent(ctx.actor)];
        var opt = ctx.options || {};
        if (!fireTarget.hand.length) {
          return finishTrickUse(game, ctx.actor, ctx.card, success('目标没有手牌，火攻未造成伤害。'), opt);
        }
        var revealed = fireTarget.hand[0];
        log(game, actorName(game, opponent(ctx.actor)) + '展示【' + revealed.name + '】（' + revealed.suit + '）。');
        if (opt.declineHuogong) {
          log(game, actorName(game, ctx.actor) + '选择不弃置同花色牌，【火攻】未造成伤害。');
          return finishTrickUse(game, ctx.actor, ctx.card, success('火攻未追加弃牌。'), opt);
        }
        var cost = opt.huogongCostCardId
          ? removeCardFromHand(self, opt.huogongCostCardId)
          : removeFirstMatchingCard(self, function (item) { return item.suit === revealed.suit; });
        if (!cost) return finishTrickUse(game, ctx.actor, ctx.card, success('没有同花色牌可弃，火攻未造成伤害。'), opt);
        if (cost.suit !== revealed.suit) {
          self.hand.push(cost);
          return fail('请选择与展示牌同花色的手牌。');
        }
        discardCard(game, cost);
        log(game, actorName(game, ctx.actor) + '弃置同花色【' + cost.name + '】发动【火攻】。');
        damage(game, opponent(ctx.actor), 1, ctx.actor, '【火攻】', null, 'fire');
        return finishTrickUse(game, ctx.actor, ctx.card, success('火攻结算完成。'), opt);
      });

      registerWuxieContinuation('jiedao', function (game, ctx, wuxied) {
        if (wuxied) {
          return finishTrickUse(game, ctx.actor, ctx.card, success('借刀杀人被无懈可击。'), ctx.options);
        }
        var weaponOwner = game[opponent(ctx.actor)];
        if (!weaponOwner.equipment.weapon) {
          return finishTrickUse(game, ctx.actor, ctx.card, success('目标没有武器，借刀杀人无效果。'), ctx.options);
        }
        return finishTrickUse(game, ctx.actor, ctx.card,
          resolveJiedaoDecision(game, ctx.actor, opponent(ctx.actor), ctx.card, ctx.options), ctx.options);
      });

      function startTurn(game, actor) {
        if (game.phase === 'gameover') return fail('游戏已经结束。');
        if (!game[actor]) return fail('未知角色。');
        game.turn = actor;
        var state = game[actor];
        resetActorTurnState(state);

        setPhase(game, actor, 'prepare');
        log(game, actorName(game, actor) + '的准备阶段。');

        var prepareResult = processPreparePhase(game, actor);
        if (prepareResult && prepareResult.suspended) {
          return success('回合在准备阶段暂停，等待玩家选择。');
        }

        return continueTurnAfterPreparePhase(game, actor);
      }

      // v6.1: prepare-phase hooks. Currently only 观星 has prepare-phase
      // behavior; the function leaves room for future skills that fire here.
      // For 观星 specifically: the player gets a pendingChoice prompt
      // ('guanxing-reorder'); AI auto-fires with no reorder (preserves
      // visible top cards in their natural order).
      function processPreparePhase(game, actor) {
        var state = game[actor];
        if (!state) return null;
        state.flags = state.flags || {};
        if (hasSkill(state, 'guanxing') && !state.flags.guanxingUsed && game.deck.length > 0) {
          var pref = (state.skillPreferences && state.skillPreferences.guanxing) || null;
          if (pref === 'decline') {
            state.flags.guanxingUsed = true;
            log(game, actorName(game, actor) + '选择不发动【观星】。');
            return null;
          }
          if (actor === 'player') {
            var preview = triggerGuanxingPreview({ game: game, state: state, skillId: 'guanxing' });
            if (!preview.ok || !preview.cards.length) {
              state.flags.guanxingUsed = true;
              return null;
            }
            game.pendingChoice = {
              kind: 'guanxing-reorder',
              actor: actor,
              cards: preview.cards.map(function (c) {
                return { id: c.id, name: c.name, type: c.type, suit: c.suit, rank: c.rank };
              })
            };
            return { suspended: true };
          }
          // AI: auto-fire with default ordering (no reorder).
          useSkill(game, actor, 'guanxing', [], {});
        }
        // v8 PR-C5: 洛神 (甄姬) — 准备阶段开始时可连续黑色判定获得。
        if (hasSkill(state, 'luoshen')) {
          var luoshenResult = triggerLuoshenPrepare(game, actor);
          if (luoshenResult && luoshenResult.suspended) return luoshenResult;
        }
        return null;
      }

      // v8 PR-C5: 洛神 (甄姬) — gltjk card__hero__wei.md：
      //   "准备阶段开始时，你可以判定，若结果为黑色，你可以重复此流程。
      //    最后你获得所有的黑色判定牌。"
      // 实现：每次判定→黑色入手 + 询问是否继续；红色直接结束并入弃牌堆。
      // pref:
      //   'decline' → 不发动（一次都不判）
      //   'auto'    → 持续判定到红色（自动每次继续）
      //   'ask'     → 玩家每次决定是否继续（首次也询问）
      function triggerLuoshenPrepare(game, actor) {
        var state = game[actor];
        if (!state || !hasSkill(state, 'luoshen')) return null;
        var pref = (state.skillPreferences && state.skillPreferences.luoshen)
          || (actor === 'player' ? 'ask' : 'auto');
        if (pref === 'decline') {
          log(game, actorName(game, actor) + '选择不发动【洛神】。');
          return null;
        }
        return startLuoshenStep(game, actor, pref);
      }

      function startLuoshenStep(game, actor, pref) {
        if (pref === 'ask' && actor === 'player') {
          if (!game.pauseState) game.pauseState = {};
          game.pauseState.luoshen = { actor: actor };
          game.pendingChoice = { kind: 'luoshen-continue', actor: actor };
          return { suspended: true };
        }
        return runLuoshenJudge(game, actor, pref);
      }

      function runLuoshenJudge(game, actor, pref) {
        var state = game[actor];
        var card = judge(game, actor, '【洛神】');
        if (!card) return null;
        if (card.color === 'black') {
          state.hand.push(card);
          log(game, actorName(game, actor) + '获得【洛神】判定牌【' + card.name + '】。');
          return startLuoshenStep(game, actor, pref);
        }
        log(game, '【洛神】判定为红色，结束。');
        discardCard(game, card);
        if (game.pauseState) game.pauseState.luoshen = null;
        return null;
      }

      function resolveLuoshenContinueChoice(game, pending, decision) {
        var actor = pending.actor;
        var state = game[actor];
        if (!state) return fail('未知角色。');
        if (game.pauseState) game.pauseState.luoshen = null;
        if (decision.decline || decision.stop) {
          log(game, actorName(game, actor) + '选择停止【洛神】。');
          return continueTurnAfterPreparePhase(game, actor);
        }
        var pref = (state.skillPreferences && state.skillPreferences.luoshen) || 'ask';
        runLuoshenJudge(game, actor, pref);
        if (game.pendingChoice) return success('洛神：等待玩家选择。');
        return continueTurnAfterPreparePhase(game, actor);
      }

      function continueTurnAfterPreparePhase(game, actor) {
        setPhase(game, actor, 'judge');
        log(game, actorName(game, actor) + '的判定阶段。');
        var judgeResult = processJudgeArea(game, actor);
        if (judgeResult && judgeResult.suspended) {
          return success('回合暂停，等待玩家选择。');
        }
        if (game.phase === 'gameover') return success('游戏结束。');
        return continueTurnAfterJudgeArea(game, actor);
      }

      function continueTurnAfterJudgeArea(game, actor) {
        var state = game[actor];
        setPhase(game, actor, 'draw');
        log(game, actorName(game, actor) + '的摸牌阶段。');
        if (!state.flags.skipDraw) {
          performDrawPhase(game, actor);
        } else {
          log(game, actorName(game, actor) + '跳过摸牌阶段。');
        }
        setPhase(game, actor, nextPlayablePhase(state));
        log(game, actorName(game, actor) + '进入' + (game.phase === 'play' ? '出牌' : '弃牌') + '阶段。');
        return success('回合开始。');
      }

      function triggerKejiBeforeDiscard(game, actor, context) {
        var state = game[actor];
        if (!state || !hasSkill(state, 'keji') || state.usedOrRespondedSha) return false;
        setPhase(game, actor, 'finish');
        log(game, actorName(game, actor) + '发动【克己】，本回合未使用或打出【杀】，跳过弃牌阶段。');
        if (context) {
          context.handled = true;
          context.result = success('克己跳过弃牌阶段。');
        }
        return true;
      }

      function finishPlayPhase(game) {
        if (game.phase === 'gameover') return fail('游戏已经结束。');
        var actor = game.turn;
        var hookContext = { game: game, actor: actor, handled: false, result: null };
        SkillRuntime.runHook(skillRegistry, 'onBeforeDiscardPhase', hookContext);
        if (hookContext.handled) return hookContext.result || success('阶段已处理。');
        setPhase(game, actor, 'discard');
        log(game, actorName(game, actor) + '结束出牌，进入弃牌阶段。');
        return success('进入弃牌阶段。');
      }

      function discardExcess(game, actor, cardIds) {
        var state = game[actor];
        if (!state) return fail('未知角色。');
        cardIds = cardIds || [];
        var excess = Math.max(0, state.hand.length - handLimit(game, actor));
        if (excess === 0) return success('无需弃牌。');
        if (cardIds.length < excess) return fail('需要弃置 ' + excess + ' 张牌。');
        var discarded = [];
        for (var i = 0; i < cardIds.length && discarded.length < excess; i += 1) {
          var card = removeCardFromHand(state, cardIds[i]);
          if (card) {
            discarded.push(card);
            discardCard(game, card);
          }
        }
        if (state.hand.length > handLimit(game, actor)) return fail('弃牌数量不足。');
        log(game, actorName(game, actor) + '弃置 ' + discarded.length + ' 张牌，满足手牌上限。');
        return success('弃牌完成。');
      }

      function getDiscardCount(game, actor) {
        var state = game[actor];
        if (!state) return 0;
        return Math.max(0, state.hand.length - handLimit(game, actor));
      }

      function needsDiscard(game, actor) {
        return getDiscardCount(game, actor) > 0;
      }

      function discardSelected(game, actor, cardIds) {
        var state = game[actor];
        if (!state) return fail('未知角色。');
        cardIds = Array.from(cardIds || []);
        var needed = getDiscardCount(game, actor);
        if (needed === 0) return success('无需弃牌。');
        if (cardIds.length < needed) return fail('需要弃置 ' + needed + ' 张牌。');

        var unique = [];
        cardIds.forEach(function (id) {
          if (unique.indexOf(id) < 0) unique.push(id);
        });
        var valid = unique.filter(function (id) {
          return state.hand.some(function (card) { return card.id === id; });
        });
        if (valid.length < needed) return fail('请选择 ' + needed + ' 张有效手牌弃置。');

        var discarded = [];
        for (var i = 0; i < valid.length && discarded.length < needed; i += 1) {
          var card = removeCardFromHand(state, valid[i]);
          if (card) {
            discarded.push(card);
            discardCard(game, card);
          }
        }
        log(game, actorName(game, actor) + '弃置 ' + discarded.length + ' 张牌，满足手牌上限。');
        return success('弃牌完成。');
      }

      function advancePhase(game) {
        if (game.phase === 'gameover') return fail('游戏已经结束。');
        var actor = game.turn;
        if (game.phase === 'prepare') {
          setPhase(game, actor, 'judge');
          log(game, actorName(game, actor) + '的判定阶段。');
          processJudgeArea(game, actor);
          return success('进入判定阶段。');
        }
        if (game.phase === 'judge') {
          setPhase(game, actor, 'draw');
          log(game, actorName(game, actor) + '的摸牌阶段。');
          if (!game[actor].flags.skipDraw) performDrawPhase(game, actor);
          return success('进入摸牌阶段。');
        }
        if (game.phase === 'draw') {
          setPhase(game, actor, nextPlayablePhase(game[actor]));
          log(game, actorName(game, actor) + '进入' + (game.phase === 'play' ? '出牌' : '弃牌') + '阶段。');
          return success('进入' + (game.phase === 'play' ? '出牌' : '弃牌') + '阶段。');
        }
        if (game.phase === 'play') return finishPlayPhase(game);
        if (game.phase === 'discard') {
          if (needsDiscard(game, actor)) return fail('需要先弃置 ' + getDiscardCount(game, actor) + ' 张牌。');
          setPhase(game, actor, 'finish');
          log(game, actorName(game, actor) + '进入结束阶段。');
          return success('进入结束阶段。');
        }
        if (game.phase === 'finish') {
          return completeTurn(game, actor);
        }
        return fail('未知阶段。');
      }

      function triggerBiyue(game, actor) {
        var state = game[actor];
        if (!state || !hasSkill(state, 'biyue') || game.phase === 'gameover') return;
        state.flags = state.flags || {};
        if (state.flags.biyueTriggered) return;
        state.flags.biyueTriggered = true;
        log(game, actorName(game, actor) + '发动【闭月】，结束阶段摸 1 张牌。');
        drawCards(game, actor, 1);
      }

      function completeTurn(game, ending) {
        SkillRuntime.runHook(skillRegistry, 'onTurnEnd', {
          game: game,
          actor: ending
        });
        resetEndOfTurnState(game[ending]);
        log(game, actorName(game, ending) + '结束回合。');
        return startTurn(game, opponent(ending));
      }

      function endTurn(game) {
        if (game.phase === 'gameover') return fail('游戏已经结束。');
        var ending = game.turn;
        return completeTurn(game, ending);
      }

      function playZhangbaSha(game, actor, cardIds) {
        var self = game[actor];
        cardIds = cardIds || [];
        if (!self) return fail('未知角色。');
        if (!self.equipment || !self.equipment.weapon || self.equipment.weapon.type !== 'zhangba') return fail('未装备【丈八蛇矛】。');
        if (self.usedSha && !canUseUnlimitedSha(self)) return fail('本回合已经使用过【杀】。');
        if (cardIds.length !== 2) return fail('需要选择两张手牌。');
        var first = removeCardFromHand(self, cardIds[0]);
        var second = removeCardFromHand(self, cardIds[1]);
        if (!first || !second) {
          if (first) self.hand.push(first);
          if (second) self.hand.push(second);
          return fail('选择的手牌不存在。');
        }
        discardCard(game, first);
        discardCard(game, second);
        var virtualSha = makeTestCard('sha', {
          id: 'zhangba-' + first.id + '-' + second.id,
          suit: first.suit,
          rank: first.rank,
          color: first.color,
          name: '丈八蛇矛杀'
        });
        log(game, actorName(game, actor) + '发动【丈八蛇矛】，将两张手牌当【杀】使用。');
        return playSha(game, actor, virtualSha);
      }

      function virtualShaFromCard(original) {
        return makeTestCard('sha', {
          id: original.id,
          suit: original.suit,
          rank: original.rank,
          color: original.color,
          name: original.name + '（当杀）',
          physicalCard: original
        });
      }

      function canPlayCardAs(game, actor, cardOrId, asType) {
        var self = game[actor];
        if (!self) return fail('未知角色。');
        // v6.1: accept either a card object OR an id; the id may refer to a
        // hand card OR an equipment slot (e.g. 关羽 卸下红色武器当 杀).
        var original = null;
        if (typeof cardOrId === 'string') {
          var hit = findOwnCardById(self, cardOrId);
          if (hit) original = hit.card;
        } else {
          original = cardOrId;
        }
        if (!original) return fail('找不到这张牌。');
        // v8 PR-C1: 国色把方片当乐 — 扩展 asType 白名单
        if (asType !== 'sha' && asType !== 'lebusishu') return fail('当前只支持转化为【杀】或【乐不思蜀】。');
        var cardAsContext = { mode: 'proactive', game: game, actor: actor, state: self, card: original, asType: asType };
        var conversion = selectCardAsConversion(SkillRuntime.runHook(skillRegistry, 'onCardAs', cardAsContext));
        if (!conversion) return fail('当前武将不能这样转化。');
        // 路径分支：杀 走原有 canPlayCard 检查；乐 走 virtualLebusishuFromCard
        if (asType === 'sha') {
          if (self.usedSha && !canUseUnlimitedSha(self)) return fail('本回合已经使用过【杀】。');
          var playableSha = canPlayCard(game, actor, virtualShaFromCard(original));
          if (!playableSha.ok) return playableSha;
          playableSha.skillName = conversion.skillName;
          playableSha.message = '发动【' + conversion.skillName + '】，将【' + original.name + '】当【杀】使用。';
          return playableSha;
        }
        // lebusishu
        var playableLebu = canPlayCard(game, actor, virtualLebusishuFromCard(original));
        if (!playableLebu.ok) return playableLebu;
        playableLebu.skillName = conversion.skillName;
        playableLebu.message = '发动【' + conversion.skillName + '】，将【' + original.name + '】当【乐不思蜀】使用。';
        return playableLebu;
      }

      function playCardAs(game, actor, cardId, asType) {
        var self = game[actor];
        if (!self) return fail('未知角色。');
        var hit = findOwnCardById(self, cardId);
        if (!hit) return fail('找不到这张牌。');
        var original = hit.card;
        var playable = canPlayCardAs(game, actor, original, asType);
        if (!playable.ok) return playable;
        // Remove from whichever zone the source card lived in. The slot is
        // cleared if it came from equipment (relevant for 关羽 卸下武器当杀).
        removeOwnCardFromAnyZone(self, cardId);
        log(game, actorName(game, actor) + playable.message);
        if (asType === 'lebusishu') {
          // v8 PR-C1: 国色 把方片当乐 — 直接放对手判定区, 复用 delayed-trick 流程
          var virtualLebu = virtualLebusishuFromCard(original);
          game[opponent(actor)].judgeArea.push(virtualLebu);
          log(game, actorName(game, actor) + '将【乐不思蜀】置入' + actorName(game, opponent(actor)) + '的判定区。');
          return success('国色 乐不思蜀 置入完成。');
        }
        return playSha(game, actor, virtualShaFromCard(original));
      }

      // v8 PR-C1: 国色把方片视为乐不思蜀 — 构造虚拟卡 (保留原 suit / rank /
      // physical card 以便弃牌正确; type/name/family 改为 lebusishu)
      function virtualLebusishuFromCard(original) {
        return {
          id: original.id,
          type: 'lebusishu',
          name: '乐不思蜀',
          family: 'delayed',
          suit: original.suit,
          color: original.color,
          rank: original.rank,
          physicalCard: original
        };
      }

      function getGuanxingPreview(game, actor) {
        var self = game[actor];
        if (!self) return fail('未知角色。');
        var previewContext = {
          game: game,
          actor: actor,
          state: self,
          skillId: 'guanxing'
        };
        var previewResults = SkillRuntime.runHook(skillRegistry, 'onSkillPreview', previewContext);
        var previewResult = selectActiveSkillResult(previewResults, 'guanxing');
        return previewResult || fail('没有【观星】。');
      }

      function useSkill(game, actor, skillId, cardIds, options) {
        var self = game[actor];
        cardIds = cardIds || [];
        options = options || {};
        if (!self) return fail('未知角色。');
        if (!hasSkill(self, skillId)) return fail('没有这个技能。');
        if (game.phase === 'gameover') return fail('游戏已经结束。');
        if (game.turn !== actor) return fail('还没有轮到你行动。');
        if (PLAY_PHASE_ACTIVE_SKILLS[skillId] && game.phase !== 'play') return fail('主动技能只能在出牌阶段发动。');
        self.flags = self.flags || {};
        var activeSkillContext = {
          game: game,
          actor: actor,
          state: self,
          targetActor: opponent(actor),
          skillId: skillId,
          cardIds: cardIds,
          options: options
        };
        var activeSkillResults = SkillRuntime.runHook(skillRegistry, 'onActiveSkill', activeSkillContext);
        var activeSkillResult = selectActiveSkillResult(activeSkillResults, skillId);
        if (activeSkillResult) return activeSkillResult;
        return fail('这个技能的主动效果尚未实现。');
      }

      // v8 PR-D1: AI 评估辅助 — non-destructive estimators that count cards
      // a state could play / respond as 杀 or 闪, including card-as conversion
      // paths (武圣 红→杀, 龙胆 杀↔闪, 倾国 黑→闪, 丈八 双手当杀).
      // 不消耗任何牌, 只读 state. 用于 scoreCardForAI 评估对手回应能力。
      function aiEstimateShaCount(state) {
        if (!state) return 0;
        var count = (state.hand || []).filter(function (c) { return isShaType(c.type); }).length;
        // 武圣: 红色手牌 + 红色装备 可当杀。已计为 sha 的不重复计入。
        if (hasSkill(state, 'wusheng')) {
          count += (state.hand || []).filter(function (c) {
            return c.color === 'red' && !isShaType(c.type);
          }).length;
          ['weapon', 'armor', 'horsePlus', 'horseMinus'].forEach(function (slot) {
            var eq = state.equipment && state.equipment[slot];
            if (eq && eq.color === 'red') count += 1;
          });
        }
        // 龙胆: 闪 ↔ 杀, 这里只计 闪 → 杀 方向 (用 estimateShanCount 时反过来)
        if (hasSkill(state, 'longdan')) {
          count += (state.hand || []).filter(function (c) { return c.type === 'shan'; }).length;
        }
        // 丈八: 任意两张手牌当杀。保守取剩余手牌的一半 (排除已计入的 sha / wusheng-red)。
        if (state.equipment && state.equipment.weapon && state.equipment.weapon.type === 'zhangba'
            && (state.hand || []).length >= 2) {
          var sparePool = (state.hand || []).filter(function (c) {
            if (isShaType(c.type)) return false;
            if (hasSkill(state, 'wusheng') && c.color === 'red') return false;
            if (hasSkill(state, 'longdan') && c.type === 'shan') return false;
            return true;
          });
          count += Math.floor(sparePool.length / 2);
        }
        return count;
      }

      function aiEstimateShanCount(state) {
        if (!state) return 0;
        var count = (state.hand || []).filter(function (c) { return c.type === 'shan'; }).length;
        // 龙胆: 杀 → 闪
        if (hasSkill(state, 'longdan')) {
          count += (state.hand || []).filter(function (c) { return isShaType(c.type); }).length;
        }
        // 倾国: 黑色手牌 → 闪
        if (hasSkill(state, 'qingguo')) {
          count += (state.hand || []).filter(function (c) {
            return c.color === 'black' && c.type !== 'shan';
          }).length;
        }
        return count;
      }

      // v8 PR-D1: 出牌/锦囊 score 精细化。对 桃 / 杀 / 决斗 / 锦囊 都按
      // 双方资源 + 自身受伤情况 给梯度分数, 替代原 v6 的 binary heuristic.
      function scoreCardForAI(game, actor, card) {
        var self = game[actor];
        var target = game[opponent(actor)];

        // 桃: hp 缺口梯度。critical (hp=1) > 多伤 > 轻伤; 满血给负分阻止 AI 用。
        if (card.type === 'tao') {
          if (self.hp >= self.maxHp) return -100;
          if (self.hp === 1) return 200;
          var deficit = self.maxHp - self.hp;
          if (deficit >= 2) return 120;
          return 80;
        }

        // 无中生有: 永远值钱 (1 张换 2 张)
        if (card.type === 'wuzhong') return 90;

        // 酒: 仅当持手中有可用杀且本回合未出过杀 → buff 杀; 否则浪费
        if (card.type === 'jiu') {
          var hasShaToBoost = !self.usedSha && self.hand.some(function (c) { return isShaType(c.type); });
          return hasShaToBoost ? 82 : -10;
        }

        // 杀: 看目标可响应闪数量 (含 longdan/qingguo 转化); 0 闪 → 高分, 多闪 → 低
        if (isShaType(card.type)) {
          if (self.usedSha && !canUseUnlimitedSha(self)) return -100;
          var targetShans = aiEstimateShanCount(target);
          if (targetShans === 0) return 85;
          if (targetShans === 1) return 60;
          return 35;
        }

        // 决斗: 估算双方"互响应杀"链。我方杀数 vs 对方杀数 (含 武圣/龙胆 转化)。
        if (card.type === 'juedou') {
          var ourSha = aiEstimateShaCount(self);
          var theirSha = aiEstimateShaCount(target);
          if (ourSha > theirSha) return 75;
          if (ourSha === theirSha) return 40;
          return 10;
        }

        // 南蛮: 对方无杀响应 → 1 dmg, 否则等于浪费 (chip 评分降低)
        if (card.type === 'nanman') {
          return aiEstimateShaCount(target) === 0 ? 80 : 30;
        }

        // 万箭: 对方无闪响应 → 1 dmg
        if (card.type === 'wanjian') {
          return aiEstimateShanCount(target) === 0 ? 80 : 30;
        }

        // 过河拆桥: 算目标 手牌 + 装备 总数
        if (card.type === 'guohe') {
          var equipSlots = ['weapon', 'armor', 'horsePlus', 'horseMinus'];
          var equipCount = equipSlots.filter(function (slot) {
            return target.equipment && target.equipment[slot];
          }).length;
          var total = (target.hand || []).length + equipCount;
          if (total === 0) return -100;
          if (total >= 3) return 70;
          return 50;
        }

        // 顺手: 仅看对方手牌 (spec 1v1 只能拿手牌)
        if (card.type === 'shunshou') {
          return (target.hand || []).length > 0 ? 65 : -100;
        }

        if (card.family === 'equipment') return 50;
        if (card.family === 'delayed') return 48;
        return 0;
      }

      // Phase 6F-bis: returns the best card+mode for AI to play, where mode
      // is 'normal' (use the card as itself) or 'asSha' (convert via 武圣 /
      // 龙胆 to a 杀). Considers both normal plays and conversions in the
      // same scoring pool so e.g. AI 关羽 with [red 桃, no 杀] at full HP
      // picks the 桃→杀 conversion (positive score) over the 桃 (negative
      // when full HP).
      // v8 PR-D3: 1-ply lookahead 框架 — clone game, simulate playCard,
      // evaluate resulting state. AI 用 simulation delta 修正 scoreCard
      // 启发式. 当 simulation 暂停 (pendingChoice) 或异常时回退到纯启发.

      // 深克隆 game state. log/turnHistory 用空数组 (simulation 不需要),
      // random 用独立确定 seed (避免污染原 game.random 状态).
      function aiCloneGame(g) {
        var savedLog = g.log;
        var savedHist = g.turnHistory;
        var savedRandom = g.random;
        g.log = [];
        g.turnHistory = [];
        g.random = undefined;
        var copy;
        try {
          copy = JSON.parse(JSON.stringify(g));
        } finally {
          g.log = savedLog;
          g.turnHistory = savedHist;
          g.random = savedRandom;
        }
        copy.log = [];
        copy.turnHistory = [];
        // 模拟用确定 seed; 不复用原 random closure 避免双向污染
        copy.random = makeRng(1);
        copy.aiSimulating = true;
        return copy;
      }

      // 状态评估: 自身 hp 与对方差为主, 加上 hand / equipment / judge 区差
      // game over 时给极大的 +/- bonus.
      function aiEvaluateState(g, actor) {
        var self = g[actor];
        var oppActor = opponent(actor);
        var opp = g[oppActor];
        if (!self || !opp) return 0;
        if (g.phase === 'gameover') {
          if (g.winner === actor) return 100000;
          if (g.winner === oppActor) return -100000;
        }
        // hp 差权重最高
        var hpScore = (self.hp - opp.hp) * 30;
        if (self.hp <= 0) hpScore -= 1000;
        else if (self.hp === 1) hpScore -= 50;
        else if (self.hp === 2) hpScore -= 10;
        // 手牌差
        var handScore = ((self.hand || []).length - (opp.hand || []).length) * 5;
        // 装备件数差
        var slots = ['weapon', 'armor', 'horsePlus', 'horseMinus'];
        var selfEq = slots.filter(function (s) { return self.equipment && self.equipment[s]; }).length;
        var oppEq = slots.filter(function (s) { return opp.equipment && opp.equipment[s]; }).length;
        var equipScore = (selfEq - oppEq) * 8;
        // 判定区: 自己有延时锦囊待结算 = 坏; 对方有 = 好
        var selfJudge = ((self.judgeArea || []).length) * -5;
        var oppJudge = ((opp.judgeArea || []).length) * 5;
        return hpScore + handScore + equipScore + selfJudge + oppJudge;
      }

      // 模拟 playCard / playCardAs, 返回 simulated game (post-state) 或 null.
      // null 表示模拟失败 (suspended pendingChoice / 抛异常 / 不合法).
      function aiSimulateCardPlay(g, actor, card, mode, options) {
        var clone = aiCloneGame(g);
        try {
          var result;
          if (mode === 'asSha') {
            result = playCardAs(clone, actor, card.id, 'sha');
          } else {
            result = playCard(clone, actor, card.id, options || null);
          }
          if (!result || !result.ok) return null;
          if (clone.pendingChoice) return null;
          return clone;
        } catch (e) {
          return null;
        }
      }

      // v8 PR-D4: threat-aware evaluation — baseline + 对手潜在伤害威胁.
      // 用 estimateShaCount(opp) vs estimateShanCount(self) 估算下回合可能
      // 接到的伤害, 给 actor 视角下负分. AI 因此会优先 disrupt 对手的杀
      // (过河武器 / 顺手) 或缓解自身防御.
      function aiEvaluateStateWithThreat(g, actor) {
        var base = aiEvaluateState(g, actor);
        if (g.phase === 'gameover') return base;
        var self = g[actor];
        var oppActor = opponent(actor);
        var opp = g[oppActor];
        if (!self || !opp) return base;
        // 对方下回合能用几张杀 (estimateShaCount 含 武圣 红色 / 龙胆 闪 等)
        var oppSha = aiEstimateShaCount(opp);
        // 我方能用几张闪 (estimateShanCount 含 龙胆 杀 / 倾国 黑 等)
        var selfShan = aiEstimateShanCount(self);
        // 预期入帐伤害 = max(0, 对方杀数 - 我方闪数). 简化 (忽略 paoxiao
        // 多杀重叠 / 距离等). 每点 dmg 减 25 (低于 hp 差权重 30 但显著).
        var incoming = Math.max(0, oppSha - selfShan);
        return base - incoming * 25;
      }

      // 综合分: 启发 + lookahead delta. sim 失败时回退仅启发.
      // v8 PR-D4: 评估改用 threat-aware 版本, 让 AI 考虑下回合对手反击潜力.
      function aiScoreCardWithLookahead(g, actor, card, mode) {
        var heuristic = (mode === 'asSha')
          ? scoreCardForAI(g, actor, { type: 'sha', family: 'basic', color: card.color })
          : scoreCardForAI(g, actor, card);
        var preEval = aiEvaluateStateWithThreat(g, actor);
        var sim = aiSimulateCardPlay(g, actor, card, mode);
        if (!sim) return heuristic;
        var postEval = aiEvaluateStateWithThreat(sim, actor);
        var delta = postEval - preEval;
        return heuristic + delta;
      }

      function aiChooseCard(game, actor) {
        if (game.turn !== actor || game.phase === 'gameover') return null;
        var self = game[actor];
        var candidates = [];
        self.hand.forEach(function (card) {
          // Original-card use.
          if (canPlayCard(game, actor, card).ok) {
            // v8 PR-D3: 用 lookahead 综合分; sim 失败回退到 scoreCardForAI
            var normalScore = aiScoreCardWithLookahead(game, actor, card, 'normal');
            if (normalScore > 0) candidates.push({ card: card, mode: 'normal', score: normalScore });
          }
          // As-Sha conversion (武圣 / 龙胆). Skip cards that are already
          // 杀 — no conversion needed.
          if (!isShaType(card.type)) {
            if (canPlayCardAs(game, actor, card, 'sha').ok) {
              var asScore = aiScoreCardWithLookahead(game, actor, card, 'asSha');
              if (asScore > 0) candidates.push({ card: card, mode: 'asSha', score: asScore });
            }
          }
        });
        candidates.sort(function (a, b) { return b.score - a.score; });
        return candidates.length ? { card: candidates[0].card, mode: candidates[0].mode } : null;
      }

      function aiChooseSkillAction(game, actor) {
        if (!game || game.turn !== actor || game.phase !== 'play') return null;
        var self = game[actor];
        if (!self) return null;
        self.flags = self.flags || {};
        var target = game[opponent(actor)];

        // 观星: free information; fire once per turn whenever deck has cards.
        if (hasSkill(self, 'guanxing') && !self.flags.guanxingUsed && game.deck.length > 0) {
          return { skillId: 'guanxing', cardIds: [], options: {} };
        }

        // 仁德: heal-trigger only. Giving cards to the opponent in 1v1 is a
        // real cost, so only fire when (a) the heal can fire this turn
        // (rendeGiven >= 1 means one more triggers heal), or (b) we are at
        // 1 HP and need 2 cards to start the heal chain. Always pick the
        // lowest-value card to give.
        if (hasSkill(self, 'rende') && self.hp < self.maxHp && !self.flags.rendeHealed && self.hand.length > 0) {
          var rendeGiven = self.flags.rendeGiven || 0;
          var emergency = self.hp <= 1 && self.hand.length >= 2;
          if (rendeGiven >= 1 || emergency) {
            var rendeCandidates = self.hand
              .map(function (card) { return { card: card, score: scoreCardForAI(game, actor, card) }; })
              .sort(function (a, b) { return a.score - b.score; });
            return { skillId: 'rende', cardIds: [rendeCandidates[0].card.id] };
          }
        }

        if (hasSkill(self, 'kurou') && !self.flags.aiKurouUsed && self.hp > 1) {
          var hasPlayable = !!aiChooseCard(game, actor);
          if (!hasPlayable || self.hand.length <= 1) return { skillId: 'kurou', cardIds: [] };
        }

        if (hasSkill(self, 'zhiheng') && !self.flags.zhihengUsed && self.hand.length > 0 && game.deck.length > 0) {
          var candidates = self.hand
            .map(function (card) { return { card: card, score: scoreCardForAI(game, actor, card) }; })
            .filter(function (item) { return item.score <= 0 || !canPlayCard(game, actor, item.card).ok; })
            .sort(function (a, b) { return a.score - b.score; });
          if (!candidates.length && self.hand.length > handLimit(game, actor)) {
            candidates = self.hand.map(function (card) { return { card: card, score: scoreCardForAI(game, actor, card) }; })
              .sort(function (a, b) { return a.score - b.score; });
          }
          if (candidates.length) return { skillId: 'zhiheng', cardIds: [candidates[0].card.id] };
        }

        // 青囊: heal whenever 自身 is wounded and 有手牌可弃。优先自救；
        // 自己满血但对方受伤时不会触发（不应该给敌人回血）。
        if (hasSkill(self, 'qingnang') && !self.flags.qingnangUsed && self.hand.length > 0 && self.hp < self.maxHp) {
          var qingnangCandidates = self.hand
            .map(function (card) { return { card: card, score: scoreCardForAI(game, actor, card) }; })
            .sort(function (a, b) { return a.score - b.score; });
          return { skillId: 'qingnang', cardIds: [qingnangCandidates[0].card.id], options: { target: actor } };
        }

        // 反间: opportunistic chip damage. The opponent guesses a suit
        // (default 'spade' if no UI prompt); giving a non-spade card biases
        // toward triggering damage. Only fire when we can afford the card
        // loss — either we are over hand limit (the card would be discarded
        // anyway) or the opponent is at low HP and the chip helps close out.
        if (hasSkill(self, 'fanjian') && !self.flags.fanjianUsed && self.hand.length > 0 && target) {
          var overLimit = self.hand.length > handLimit(game, actor);
          var oppLowHp = target.hp <= 2;
          if (overLimit || oppLowHp) {
            var fanjianCandidates = self.hand
              .map(function (card) { return { card: card, score: scoreCardForAI(game, actor, card) }; })
              .sort(function (a, b) { return a.score - b.score; });
            // Prefer giving a non-spade card so the default 'spade' guess
            // tends to miss, biasing toward damage. Fall back to the lowest-
            // score card if every hand card is a spade.
            var nonSpade = fanjianCandidates.find(function (item) { return item.card.suit !== 'spade'; });
            var picked = nonSpade || fanjianCandidates[0];
            return { skillId: 'fanjian', cardIds: [picked.card.id] };
          }
        }

        return null;
      }

      function aiTakeAction(game, actor) {
        if (!game || game.turn !== actor || game.phase !== 'play') {
          var blocked = success('当前不是出牌阶段。');
          blocked.action = 'none';
          return blocked;
        }

        var skillAction = aiChooseSkillAction(game, actor);
        if (skillAction) {
          var skillResult = useSkill(game, actor, skillAction.skillId, skillAction.cardIds, skillAction.options);
          if (skillResult.ok && skillAction.skillId === 'kurou') game[actor].flags.aiKurouUsed = true;
          skillResult.action = skillAction.skillId;
          return skillResult;
        }

        var choice = aiChooseCard(game, actor);
        if (!choice) {
          var idle = success('没有可执行的行动。');
          idle.action = 'none';
          return idle;
        }
        var card = choice.card;
        var cardResult;
        if (choice.mode === 'asSha') {
          // 武圣 / 龙胆 conversion path: engine routes through playCardAs →
          // playSha so the virtual 杀 is properly resolved.
          cardResult = playCardAs(game, actor, card.id, 'sha');
        } else {
          var cardOptions;
          if (card.type === 'tiesuo') cardOptions = { mode: 'chain', targets: [opponent(actor)] };
          if (card.type === 'huogong') {
            var fireChoice = getHuogongChoice(game, actor);
            cardOptions = fireChoice.ok && fireChoice.usableCostIds.length ? { huogongCostCardId: fireChoice.usableCostIds[0] } : { declineHuogong: true };
          }
          cardResult = playCard(game, actor, card.id, cardOptions);
        }
        cardResult.action = 'card';
        cardResult.cardId = card.id;
        cardResult.mode = choice.mode;
        return cardResult;
      }

      function aiDiscardCandidates(game, actor) {
        var state = game[actor];
        var count = getDiscardCount(game, actor);
        if (!state || count <= 0) return [];
        return state.hand
          .map(function (card) { return { card: card, score: scoreCardForAI(game, actor, card) }; })
          .sort(function (a, b) { return a.score - b.score; })
          .slice(0, count)
          .map(function (item) { return item.card.id; });
      }

      function runAITurn(game, actor, maxActions) {
        if (!game || !game[actor]) return fail('未知角色。');
        maxActions = maxActions || 12;
        if (game.phase === 'gameover') return fail('游戏已经结束。');

        if (game.turn !== actor || ['prepare', 'judge', 'draw'].indexOf(game.phase) < 0) {
          var started = startTurn(game, actor);
          if (!started.ok || game.phase === 'gameover') return started;
        }

        if (game.phase === 'play') {
          for (var i = 0; i < maxActions; i += 1) {
            var action = aiTakeAction(game, actor);
            if (!action.ok) return action;
            if (action.action === 'none' || game.phase === 'gameover') break;
          }
          if (game.phase === 'play') finishPlayPhase(game);
        }

        if (game.phase === 'discard' && needsDiscard(game, actor)) {
          var discarded = discardSelected(game, actor, aiDiscardCandidates(game, actor));
          if (!discarded.ok) return discarded;
        }

        if (game.phase === 'discard') {
          var advanced = advancePhase(game);
          if (!advanced.ok) return advanced;
        }

        if (game.phase === 'finish') {
          var ended = endTurn(game);
          if (!ended.ok) return ended;
        }

        var done = success('AI 回合完成。');
        done.action = 'turn';
        return done;
      }

      export const SanguoshaEngine = {
        HEROES: HEROES,
        HERO_CATALOG: HERO_CATALOG,
        IMPLEMENTED_SKILL_IDS: IMPLEMENTED_SKILL_IDS.slice(),
        ACTIVE_SKILL_IDS: ACTIVE_SKILL_IDS.slice(),
        CARD_INFO: CARD_INFO,
        CARD_CATALOG: CARD_CATALOG,
        PHASES: PHASES,
        makeTestCard: makeTestCard,
        newGame: newGame,
        distanceBetween: distanceBetween,
        equipCard: equipCard,
        loseEquipment: loseEquipment,
        getTargetZoneCards: getTargetZoneCards,
        getHuogongChoice: getHuogongChoice,
        getGuanxingPreview: getGuanxingPreview,
        isShaCard: isShaCard,
        playZhangbaSha: playZhangbaSha,
        canPlayCard: canPlayCard,
        canPlayCardAs: canPlayCardAs,
        playCard: playCard,
        playCardAs: playCardAs,
        useSkill: useSkill,
        startTurn: startTurn,
        advancePhase: advancePhase,
        finishPlayPhase: finishPlayPhase,
        discardExcess: discardExcess,
        getDiscardCount: getDiscardCount,
        needsDiscard: needsDiscard,
        discardSelected: discardSelected,
        handLimit: handLimit,
        getActorStatus: getActorStatus,
        endTurn: endTurn,
        setSkillPreference: setSkillPreference,
        getSkillPreference: getSkillPreference,
        getPendingChoice: getPendingChoice,
        resolvePendingChoice: resolvePendingChoice,
        // v10 V3: 响应窗口框架 — 引擎暂停/恢复统一 API.
        // V3 已迁移 shan-response; V4-V6 计划迁移 万箭/银月/无懈/决斗 杀.
        requestPlayerResponse: requestPlayerResponse,
        resolveResponseChoice: resolveResponseChoice,
        registerResponseKind: registerResponseKind,
        drawCards: drawCards,
        aiChooseCard: aiChooseCard,
        aiChooseSkillAction: aiChooseSkillAction,
        aiTakeAction: aiTakeAction,
        // v8 PR-D1: 暴露 AI 评估辅助 (供测试 + 未来扩展)
        aiScoreCard: scoreCardForAI,
        aiEstimateShaCount: aiEstimateShaCount,
        aiEstimateShanCount: aiEstimateShanCount,
        // v8 PR-D3: 1-ply lookahead helpers
        aiCloneGame: aiCloneGame,
        aiEvaluateState: aiEvaluateState,
        aiSimulateCardPlay: aiSimulateCardPlay,
        aiScoreCardWithLookahead: aiScoreCardWithLookahead,
        // v8 PR-D4: threat-aware eval (考虑对方下回合威胁)
        aiEvaluateStateWithThreat: aiEvaluateStateWithThreat,
        runAITurn: runAITurn,
        opponent: opponent
      };

      if (typeof window !== 'undefined') {
        window.SanguoshaEngine = SanguoshaEngine;
      }
