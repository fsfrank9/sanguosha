      import { Runtime } from './runtime.js';
      import { SkillRuntime } from './skill-runtime.js';
      import { CardRuntime } from './card-runtime.js';
      import { StateRuntime } from './state.js';
      import { PhaseRuntime } from './phases.js';
      import { JudgementRuntime } from './judgement.js';
      import { createAIRuntime } from './ai.js';
      import { createDamageDyingRuntime } from './damage-dying.js';
      import { createResponseRuntime } from './response.js';
      import { createTricksRuntime } from './tricks.js';
      import { createEquipmentRuntime } from './equipment.js';
      import { createJudgeAreaRuntime } from './judge-area.js';
      import { installStandardSkillHandlers, PLAY_PHASE_ACTIVE_SKILLS } from './skills.js';
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
      // v11 A2: 牌移动原语 — 所有"牌离开/进入区域"的站点统一走这四个出口。
      var findCardZone = CardRuntime.findCardZone;
      var takeCard = CardRuntime.takeCard;
      var putCard = CardRuntime.putCard;
      var moveCard = CardRuntime.moveCard;
      // v11 C2: 窄签名手牌出口 (removeCardFromHand 等) 的在途标记补口
      var markHandOrigin = CardRuntime.markHandOrigin;
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

      installStandardSkillHandlers(skillRegistry, {
        hasSkill: hasSkill,
        opponent: opponent,
        actorName: actorName,
        isShaType: isShaType,
        log: log,
        takeHandCard: takeHandCard,
        triggerBiyue: triggerBiyue,
        triggerKejiBeforeDiscard: triggerKejiBeforeDiscard,
        triggerJizhi: triggerJizhi,
        triggerLuoyiDrawPhase: triggerLuoyiDrawPhase,
        triggerLuoyiDamageModify: triggerLuoyiDamageModify,
        triggerQianxunCardTarget: triggerQianxunCardTarget,
        triggerTongjiCardTarget: triggerTongjiCardTarget,
        triggerTianduJudgementAfterResolve: triggerTianduJudgementAfterResolve,
        triggerGuicaiJudgementBeforeResolve: triggerGuicaiJudgementBeforeResolve,
        triggerTieqiNeedResponse: triggerTieqiNeedResponse,
        triggerJianxiongDamageAfter: triggerJianxiongDamageAfter,
        triggerFankuiDamageAfter: triggerFankuiDamageAfter,
        triggerYijiDamageAfter: triggerYijiDamageAfter,
        triggerGanglieDamageAfter: triggerGanglieDamageAfter,
        triggerYaowuDamageAfter: triggerYaowuDamageAfter,
        triggerJushouTurnEnd: triggerJushouTurnEnd,
        triggerKuangguDamageAfter: triggerKuangguDamageAfter,
        triggerLiegongNeedResponse: triggerLiegongNeedResponse,
        triggerShensuActiveSkill: triggerShensuActiveSkill,
        triggerLongdanCardAs: triggerLongdanCardAs,
        triggerWushengCardAs: triggerWushengCardAs,
        triggerQingguoCardAs: triggerQingguoCardAs,
        triggerGuoseCardAs: triggerGuoseCardAs,
        triggerQixiCardAs: triggerQixiCardAs,
        triggerLiuliOnShaTargeted: triggerLiuliOnShaTargeted,
        triggerZhihengActiveSkill: triggerZhihengActiveSkill,
        triggerKurouActiveSkill: triggerKurouActiveSkill,
        triggerRendeActiveSkill: triggerRendeActiveSkill,
        triggerQingnangActiveSkill: triggerQingnangActiveSkill,
        triggerJieyinActiveSkill: triggerJieyinActiveSkill,
        triggerFanjianActiveSkill: triggerFanjianActiveSkill,
        triggerGuanxingActiveSkill: triggerGuanxingActiveSkill,
        triggerGuanxingPreview: triggerGuanxingPreview
      });

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

      // v11 C8 (批次 32): 同疾 (标袁术) — 锁定技。gltjk spec: "其他角色使用
      // 【杀】选择目标时, 若其手牌数大于其体力值且袁术在其攻击范围内, 不能
      // 指定除袁术以外的角色为目标"。1v1 中可指定的目标只有对手: 对手是
      // 袁术则杀本就指向袁术, 对手不是袁术则场上无袁术 — 恒不拦截。与
      // 流离同为 reserved hook: 扫描 source/target 之外的袁术, 多人模式
      // 启用后自动生效。
      function triggerTongjiCardTarget(context) {
        var game = context.game;
        if (!context.card || !isShaCard(context.card)) return null;
        var others = ['player', 'enemy'].filter(function (a) {
          return a !== context.actor && a !== context.targetActor;
        });
        for (var i = 0; i < others.length; i += 1) {
          var holder = game[others[i]];
          if (holder && hasSkill(holder, 'tongji')
              && (holder.hand || []).length > holder.hp
              && canReachWithSha(game, context.actor, others[i])) {
            return {
              protected: true,
              message: actorName(game, others[i]) + '的【同疾】生效，【杀】必须以其为目标。'
            };
          }
        }
        return null;
      }

      function takeHandCard(game, fromActor, toActor, reason) {
        var from = game[fromActor];
        var to = game[toActor];
        if (!from || !to || !from.hand.length) return null;
        var index = randomHandIndex(game, from);
        var card = moveCard(game, from.hand[index], { zone: 'hand', actor: fromActor }, { zone: 'hand', actor: toActor });
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
        // 唯一的整堆搬移站点 (弃牌堆→洗混→新牌堆), 不走逐张 moveCard。
        game.deck = shuffle(game.discard.splice(0), game.random);
      }

      function drawCards(game, actor, count) {
        var drawn = [];
        for (var i = 0; i < count; i += 1) {
          reshuffleIfNeeded(game);
          if (game.deck.length === 0) break;
          var card = moveCard(game, null, { zone: 'deck' }, { zone: 'hand', actor: actor });
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
        markHandOrigin(state, state.hand[index]);
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

      function removeOwnCardFromAnyZone(state, cardId, game) {
        var hit = findOwnCardById(state, cardId);
        if (!hit) return null;
        if (hit.zone === 'hand') {
          return removeCardFromHand(state, cardId);
        }
        // equipment — M2: 制衡/苦肉/武圣转化等把装备区牌当成本, 同样是"失去
        // 装备" — 传入 game 的调用方会触发失去时机 (白银狮子回血)。
        if (game) {
          var ownerActor = game.player === state ? 'player' : 'enemy';
          takeCard(game, cardId, { zone: 'equipment', actor: ownerActor, slot: hit.slot });
          triggerEquipmentLoss(game, ownerActor, hit.card);
        } else {
          state.equipment[hit.slot] = null;
        }
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
        markHandOrigin(state, state.hand[index]);
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

      // M1: 还原【朱雀羽扇】本次使用临时转化的【杀】, 使其以原始身份 (普通
      // 【杀】或被当作杀的红牌) 离开结算, 避免洗回牌堆 / 进入手牌后变成永久【火杀】。
      function restoreZhuqueIdentity(card) {
        if (card && card.zhuqueOriginalType !== undefined) {
          card.type = card.zhuqueOriginalType;
          card.name = card.zhuqueOriginalName;
          delete card.zhuqueOriginalType;
          delete card.zhuqueOriginalName;
        }
      }

      function discardCard(game, card) {
        restoreZhuqueIdentity(card);
        // H1: 虚拟合成牌 (丈八蛇矛的两手牌当【杀】等) 没有对应实体——组成它
        // 的实体牌已在转化时弃置, 再推入弃牌堆会凭空多出一张牌污染牌堆。
        if (card && card.virtual) return;
        var physicalCard = physicalCardOf(card);
        if (physicalCard) putCard(game, physicalCard, { zone: 'discard' });
      }

      function triggerJianxiongDamageAfter(game, targetActor, sourceCard) {
        var target = game[targetActor];
        if (!sourceCard || !target || !hasSkill(target, 'jianxiong')) return null;
        // H1: 虚拟合成牌 (丈八蛇矛) 造成伤害时, 奸雄获得组成它的实体牌
        // (转化时已进入弃牌堆), 而不是把无实体的虚拟牌收进手牌。
        if (sourceCard.virtual) {
          var components = sourceCard.physicalCards || [];
          var gainedNames = [];
          components.forEach(function (component) {
            if (!moveCard(game, component, { zone: 'discard' }, { zone: 'hand', actor: targetActor })) return;
            gainedNames.push(component.name);
          });
          if (!gainedNames.length) return null;
          log(game, actorName(game, targetActor) + '发动【奸雄】，获得了造成伤害的【' + gainedNames.join('】、【') + '】。');
          return { claimedSourceCard: true };
        }
        var physicalSourceCard = physicalCardOf(sourceCard);
        if (!physicalSourceCard) return null;
        // M5: 被朱雀临时转化的【杀】进入奸雄手牌前还原物理身份, 与 discardCard 一致。
        restoreZhuqueIdentity(sourceCard);
        // L2: 决斗/南蛮/万箭/火攻 在使用时已进弃牌堆 — 奸雄获得时从弃牌堆取回,
        // 保持牌守恒 (杀类牌仍在结算中不在弃牌堆, takeCard 取不到, 直接入手)。
        takeCard(game, physicalSourceCard, { zone: 'discard' });
        putCard(game, physicalSourceCard, { zone: 'hand', actor: targetActor });
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
        // M3 (审计二轮): gltjk glossary__zone.md — "其判定区里的牌既不是该角色
        // 的牌, 也不为任何角色所拥有"。反馈获得"来源的一张牌"仅限手牌/装备区,
        // 此前错误把判定区列为可获得 zone。
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
        if (zones.length === 0) {
          return null;  // nothing to gain
        }
        if (pref === 'ask') {
          setPendingChoice(game, {
            kind: 'fankui-pick',
            actor: targetActor,
            sourceActor: sourceActor,
            zones: zones
          });
          return { suspendedForFankui: true };
        }
        // Auto path: hand if any → equipment (M3: 判定区牌不可获得)。
        var autoZone = (source.hand && source.hand.length) ? 'hand' : 'equipment';
        var gained = removeTargetZoneCard(game, sourceActor, autoZone);
        if (!gained || !gained.card) return null;
        putCard(game, gained.card, { zone: 'hand', actor: targetActor });
        log(game, actorName(game, targetActor) + '发动【反馈】，获得' + actorName(game, sourceActor) + '的一张' + gained.zone + '牌。');
        return { gainedSourceCard: true };
      }

      function resolveFankuiPickChoice(game, pending, decision) {
        var holder = pending.actor;
        var sourceActor = pending.sourceActor;
        var holderState = game[holder];
        if (!holderState) return fail('未知角色。');
        var zone = decision && decision.zone;
        // M3: 判定区牌不为任何角色所拥有, 反馈不可获得 (glossary__zone.md)。
        if (['hand', 'equipment'].indexOf(zone) < 0) {
          setPendingChoice(game, pending);
          return fail('请选择有效的区域（hand / equipment）。');
        }
        // For hand zone we deliberately ignore decision.cardId — engine
        // picks a random hand card, preserving the "opponent's hand
        // contents are hidden when 反馈 is choosing" semantic. equipment
        // zone uses the specific cardId the player clicked.
        var gained = removeTargetZoneCard(game, sourceActor, zone, zone === 'hand' ? null : decision.cardId);
        if (!gained || !gained.card) {
          setPendingChoice(game, pending);
          return fail('找不到目标牌，请重新选择。');
        }
        putCard(game, gained.card, { zone: 'hand', actor: holder });
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
        setPendingChoice(game, {
          kind: 'yiji-distribute',
          actor: targetActor,
          drawnIds: drawnIds,
          cards: cards,
          currentPoint: currentPoint,
          totalPoints: saved.totalPoints
        });
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
          setPendingChoice(game, {
            kind: 'ganglie-fire',
            actor: targetActor,
            sourceActor: sourceActor,
            sourceName: actorName(game, sourceActor)
          });
          return { suspendedForGanglieFire: true };
        }
        return runGanglieJudgement(game, targetActor, sourceActor);
      }

      // v11 C7 (批次 31): 耀武 (华雄) — 锁定技。gltjk skill cache:
      //   "当你受到红色【杀】造成的伤害后, 伤害来源选择一项:
      //    回复 1 点体力, 或摸一张牌。"
      // 选择权在伤害来源: AI/auto 来源按 受伤→回血 否则→摸牌; 玩家来源
      // 经 pendingChoice 'yaowu-reward' 面板二选一 (体力满时只能摸牌)。
      function triggerJushouTurnEnd(context) {
        var game = context.game;
        var actor = context.actor;
        var state = game[actor];
        if (!state || !hasSkill(state, 'jushou') || game.phase === 'gameover') return null;
        var pref = state.skillPreferences && state.skillPreferences.jushou;
        if (pref === 'decline') {
          log(game, actorName(game, actor) + '选择不发动【据守】。');
          return null;
        }
        drawCards(game, actor, 3);
        state.turnedOver = !state.turnedOver;
        log(game, actorName(game, actor) + '发动【据守】，摸三张牌并' + (state.turnedOver ? '翻面。' : '翻回正面。'));
        return { triggeredJushou: true };
      }

      function triggerKuangguDamageAfter(context) {
        var game = context.game;
        var sourceActor = context.sourceActor;
        var source = game[sourceActor];
        if (!source || !hasSkill(source, 'kuanggu') || source.hp >= source.maxHp || game.phase === 'gameover') return null;
        source.hp = Math.min(source.maxHp, source.hp + 1);
        log(game, actorName(game, sourceActor) + '发动【狂骨】，造成伤害后回复 1 点体力。');
        return { triggeredKuanggu: true };
      }

      function triggerLiegongNeedResponse(game, actor, targetActor, responseType, triggeringCard) {
        var source = game[actor];
        var target = game[targetActor];
        if (responseType !== 'shan' || !source || !target || !hasSkill(source, 'liegong')) return null;
        var targetHand = (target.hand || []).length;
        if (targetHand >= source.hp || targetHand <= source.attackRange) {
          log(game, actorName(game, actor) + '发动【烈弓】，' + actorName(game, targetActor) + '不能打出【闪】。');
          return { responseLocked: true };
        }
        return null;
      }

      function triggerShensuActiveSkill(context) {
        if (context.skillId !== 'shensu') return null;
        var game = context.game;
        var actor = context.actor;
        var self = context.state;
        if (!self || !hasSkill(self, 'shensu')) return null;
        if (self.flags.shensuUsed) return fail('【神速】每回合限一次。');
        var card = { id: 'virtual-shensu-' + actor + '-' + game.turn, name: '杀', type: 'sha', suit: 'spade', color: 'black', virtual: true };
        self.flags.shensuUsed = true;
        log(game, actorName(game, actor) + '发动【神速】，视为对' + actorName(game, opponent(actor)) + '使用一张【杀】。');
        return playSha(game, actor, card, 1);
      }

      function triggerYaowuDamageAfter(context) {
        var game = context.game;
        var targetActor = context.targetActor;
        var sourceActor = context.sourceActor;
        var target = game[targetActor];
        var source = game[sourceActor];
        if (!target || !sourceActor || !source || !hasSkill(target, 'yaowu') || game.phase === 'gameover') return null;
        var sourceCard = context.sourceCard;
        if (!sourceCard || !isShaCard(sourceCard) || sourceCard.color !== 'red') return null;
        log(game, actorName(game, targetActor) + '的【耀武】被触发，' + actorName(game, sourceActor) + '选择一项奖励。');
        var pref = (source.skillPreferences && source.skillPreferences.yaowuReward)
          || (sourceActor === 'player' ? 'ask' : 'auto');
        if (pref === 'ask') {
          setPendingChoice(game, {
            kind: 'yaowu-reward',
            actor: sourceActor,
            targetName: actorName(game, targetActor),
            canRecover: source.hp < source.maxHp
          });
          return { suspendedForYaowu: true };
        }
        // auto: 受伤 → 回血, 否则 → 摸一张
        return applyYaowuReward(game, sourceActor, source.hp < source.maxHp ? 'recover' : 'draw');
      }

      function applyYaowuReward(game, sourceActor, choice) {
        var source = game[sourceActor];
        if (!source) return null;
        if (choice === 'recover' && source.hp < source.maxHp) {
          source.hp += 1;
          log(game, actorName(game, sourceActor) + '因【耀武】回复 1 点体力。');
        } else {
          log(game, actorName(game, sourceActor) + '因【耀武】摸一张牌。');
          drawCards(game, sourceActor, 1);
        }
        return { yaowuRewarded: true };
      }

      function resolveYaowuRewardChoice(game, pending, decision) {
        var sourceActor = pending.actor;
        var source = game[sourceActor];
        if (!source) return fail('未知角色。');
        var choice = decision && decision.choice;
        if (choice !== 'recover' && choice !== 'draw') {
          setPendingChoice(game, pending);
          return fail('请选择 recover 或 draw。');
        }
        if (choice === 'recover' && source.hp >= source.maxHp) {
          setPendingChoice(game, pending);
          return fail('体力已满，只能选择摸牌。');
        }
        applyYaowuReward(game, sourceActor, choice);
        return success('耀武奖励结算完成。');
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
          setPendingChoice(game, {
            kind: 'ganglie-source-choice',
            actor: sourceActor,
            targetActor: targetActor,
            candidates: candidates
          });
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
          var hcard = takeCard(game, id, { zone: 'hand', actor: sourceActor });
          if (hcard) {
            discardCard(game, hcard);
            discarded.push(hcard);
            continue;
          }
          // Equipment slot?
          var slotKey = ['weapon', 'armor', 'horseMinus', 'horsePlus'].find(function (s) {
            return source.equipment && source.equipment[s] && source.equipment[s].id === id;
          });
          if (slotKey) {
            var ecard = takeCard(game, id, { zone: 'equipment', actor: sourceActor, slot: slotKey });
            discardCard(game, ecard);
            triggerEquipmentLoss(game, sourceActor, ecard);
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
            setPendingChoice(game, pending);
            return fail('请选择两张牌弃置（或选择受 1 点伤害）。');
          }
          // Validate each id is in pending.candidates (i.e. source's
          // hand-or-equipment at the moment the prompt fired).
          var validIds = pending.candidates.map(function (e) { return e.id; });
          for (var i = 0; i < cardIds.length; i += 1) {
            if (validIds.indexOf(cardIds[i]) < 0) {
              setPendingChoice(game, pending);
              return fail('选择的牌不在可弃置列表中。');
            }
          }
          if (cardIds[0] === cardIds[1]) {
            setPendingChoice(game, pending);
            return fail('需要两张不同的牌。');
          }
          var disc = applyGanglieDiscardCards(game, sourceActor, cardIds);
          if (disc.length !== 2) {
            // Shouldn't happen because we validated, but guard anyway.
            setPendingChoice(game, pending);
            return fail('弃置失败，请重新选择。');
          }
          log(game, actorName(game, sourceActor) + '因【刚烈】弃置两张牌：' + disc.map(function (c) { return '【' + c.name + '】'; }).join('、') + '。');
          return success('刚烈完成（弃 2 牌）。');
        }
        setPendingChoice(game, pending);
        return fail('请选择：弃两张牌 或 受 1 点伤害。');
      }

      function triggerTianduJudgementAfterResolve(context) {
        var game = context.game;
        var actor = context.actor;
        var state = context.state || game[actor];
        var physicalCard = physicalCardOf(context.card);
        if (!state || !physicalCard || !hasSkill(state, 'tiandu')) return null;
        putCard(game, physicalCard, { zone: 'hand', actor: actor });
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
          setPendingChoice(game, {
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
          });
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

      // v11 C3 (批次 27): 奇袭 (甘宁) — gltjk skill cache:
      //   "出牌阶段，你可以将一张黑色牌当【过河拆桥】使用。"
      // 仅 proactive (出牌阶段主动转化); 黑色手牌或装备牌皆可作来源
      // (spec condition: "发动者有黑色手牌或装备牌", 与武圣同口径)。
      function triggerQixiCardAs(context) {
        var state = context.state;
        if (!state || !hasSkill(state, 'qixi')) return null;
        if (context.mode !== 'proactive' || context.asType !== 'guohe') return null;
        if (!context.card || context.card.color !== 'black') return null;
        return { card: context.card, asName: '过河拆桥', skillName: '奇袭', priority: 10 };
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
          var card = removeOwnCardFromAnyZone(self, cardIds[i], game);
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

      // v11 C6 (批次 30): 结姻 (孙尚香) — gltjk skill cache:
      //   "出牌阶段限一次，你可以弃置两张手牌并选择一名已受伤的男性角色，
      //    你和其各回复 1 点体力。"
      // 1v1: 目标恒为对手 (须男性且已受伤); 自身满血时只有目标受益 (封顶)。
      function triggerJieyinActiveSkill(context) {
        if (context.skillId !== 'jieyin') return null;
        var game = context.game;
        var actor = context.actor;
        var self = context.state;
        var cardIds = context.cardIds || [];
        if (!self || !hasSkill(self, 'jieyin')) return null;
        if (self.flags.jieyinUsed) return fail('【结姻】每回合限一次。');
        var targetActor = opponent(actor);
        var target = game[targetActor];
        if (!target || target.gender !== 'male') return fail('【结姻】需要一名男性角色为目标。');
        if (target.hp >= target.maxHp) return fail('目标未受伤，不能发动【结姻】。');
        if (cardIds.length !== 2 || cardIds[0] === cardIds[1]) return fail('请选择两张不同的手牌弃置。');
        var inHand = cardIds.every(function (id) {
          return (self.hand || []).some(function (item) { return item.id === id; });
        });
        if (!inHand) return fail('选择的手牌不存在。');
        var firstCost = removeCardFromHand(self, cardIds[0]);
        var secondCost = removeCardFromHand(self, cardIds[1]);
        discardCard(game, firstCost);
        discardCard(game, secondCost);
        self.flags.jieyinUsed = true;
        self.hp = Math.min(self.maxHp, self.hp + 1);
        target.hp = Math.min(target.maxHp, target.hp + 1);
        log(game, actorName(game, actor) + '发动【结姻】，弃置【' + firstCost.name + '】、【' + secondCost.name + '】，与' + actorName(game, targetActor) + '各回复 1 点体力。');
        return success('结姻完成。');
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
            putCard(game, giveCard, { zone: 'hand', actor: context.targetActor });
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
        putCard(game, fanjianCard, { zone: 'hand', actor: targetActor });
        self.flags.fanjianUsed = true;
        log(game, actorName(game, actor) + '发动【反间】，将【' + fanjianCard.name + '】交给' + actorName(game, targetActor) + '。');

        // Backward-compat override: explicit guess from caller skips the prompt.
        if (options.guessedSuit) {
          return applyFanjianGuess(game, actor, targetActor, fanjianCard, options.guessedSuit);
        }

        if (targetActor === 'player') {
          // Set pendingChoice; the player UI shows the card NAME but not
          // suit, then 4 suit buttons.
          setPendingChoice(game, {
            kind: 'fanjian-guess',
            actor: targetActor,
            sourceActor: actor,
            cardId: fanjianCard.id,
            cardName: fanjianCard.name
          });
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
          setPendingChoice(game, pending);
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

      // v11 B1: 装备穿/卸/失去时机与武器特效 (麒麟/寒冰/雌雄) 已迁往
      // ./equipment.js (见下方 EquipmentRuntime 装配)。

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
          setPendingChoice(game, {
            kind: 'guohe-1v1-pick',
            actor: sourceActor,
            target: targetActor,
            equipment: equipmentList(target).map(function (e) {
              return { slot: e.slot, cardId: e.card.id, name: e.card.name, suit: e.card.suit, rank: e.card.rank };
            }),
            hand: target.hand.map(function (c) {
              return { cardId: c.id, name: c.name, suit: c.suit, color: c.color, rank: c.rank };
            })
          });
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
          setPendingChoice(game, pending);
          return fail('请选择 equipment 或 hand。');
        }
        if (!cardId) {
          setPendingChoice(game, pending);
          return fail('请通过 cardId 指定具体牌。');
        }
        var result = executeGuohe1v1Pick(game, sourceActor, targetActor, zone, cardId);
        if (!result.ok) {
          setPendingChoice(game, pending);
          return result;
        }
        return result;
      }

      // v7 PR-7: 五谷丰登 — 顺序选牌循环。每个 picker：pool 仅余 1 张时强制
      // 取走（无可选项）；多张时按 skillPreferences.wugu 决定 auto/ask。
      // 暂停时 pauseState.wugu 保存 sourceActor / wuguCard / pool / order /
      // idx / options，由 resolveWuguPickChoice 续算。
      function processWuguPick(game, sourceActor, wuguCard, pool, order, idx, options) {
        // H1b-2: 逐目标无懈驱动 — 每名 picker 选牌前先开无懈窗口 (无懈只抵消
        // 「对一个目标」的效果, 五谷有 2 名目标各自可被无懈)。具体逻辑见
        // advanceWuguTargets / wuguPickForCurrent (定义在无懈续延区附近)。
        return advanceWuguTargets(game, {
          sourceActor: sourceActor,
          wuguCardId: wuguCard && wuguCard.id,
          pool: pool,
          order: order,
          idx: idx,
          options: options
        });
      }

      function resolveWuguPickChoice(game, pending, decision) {
        var saved = game.pauseState && game.pauseState.wugu;
        if (!saved) return fail('找不到【五谷丰登】的暂停状态。');
        var picker = pending.actor;
        var cardId = decision && decision.cardId;
        if (!cardId) {
          setPendingChoice(game, pending);
          return fail('请从亮出的牌中选择一张（用 cardId 指定）。');
        }
        var pool = saved.pool;
        var poolIdx = pool.findIndex(function (c) { return c.id === cardId; });
        if (poolIdx < 0) {
          setPendingChoice(game, pending);
          return fail('该牌不在【五谷丰登】的亮出池中。');
        }
        var picked = pool.splice(poolIdx, 1)[0];  // pool 是在途池, 不是区域
        putCard(game, picked, { zone: 'hand', actor: picker });
        log(game, actorName(game, picker) + '从【五谷丰登】选择获得【' + picked.name + '】。');
        // H1b-2: 该 picker 选完 → idx+1 回到逐目标驱动 (下一名先开无懈窗口),
        // pool 引用沿用 (累计 splice)。
        game.pauseState.wugu = null;
        return advanceWuguTargets(game, {
          sourceActor: saved.sourceActor,
          wuguCardId: saved.wuguCardId,
          pool: pool,
          order: saved.order,
          idx: saved.idx + 1,
          options: saved.options
        });
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
          setPendingChoice(game, {
            kind: 'jiedao-decision',
            actor: opponentActor,
            sourceActor: sourceActor
          });
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
          putCard(game, borrowedSha, { zone: 'hand', actor: opponentActor });
          log(game, '【杀】不再合法（second legality check）；交出武器。');
          return transferWeaponJiedao(game, sourceActor, opponentActor);
        }
        return shaResult;
      }

      function transferWeaponJiedao(game, sourceActor, opponentActor) {
        var opponentState = game[opponentActor];
        var weapon = opponentState.equipment && opponentState.equipment.weapon;
        if (!weapon) return success('【借刀杀人】无效果（目标无武器）。');
        moveCard(game, weapon, { zone: 'equipment', actor: opponentActor, slot: 'weapon' }, { zone: 'hand', actor: sourceActor });
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

      // v11 B1: 响应窗口框架域拆分 — 请求/队列/注册表/分发迁往 ./response.js,
      // 引擎闭包能力经 createResponseRuntime 依赖注入; 各 resolver 留在各自
      // 领域, 经 registerResponseKind 注册。processJudgeArea 等以包装函数注入,
      // 函数声明提升保证前向引用安全。
      var ResponseRuntime = createResponseRuntime({
        log: log,
        success: success,
        fail: fail,
        processJudgeArea: function (game, actor) { return processJudgeArea(game, actor); },
        continueTurnAfterJudgeArea: function (game, actor) { return continueTurnAfterJudgeArea(game, actor); }
      });
      var requestPlayerResponse = ResponseRuntime.requestPlayerResponse;
      var RESPONSE_KIND_RESOLVERS = ResponseRuntime.RESPONSE_KIND_RESOLVERS;
      var registerResponseKind = ResponseRuntime.registerResponseKind;
      var setPendingChoice = ResponseRuntime.setPendingChoice;
      var shiftPendingChoiceQueue = ResponseRuntime.shiftPendingChoiceQueue;
      var resumeSuspendedTurnFlowIfReady = ResponseRuntime.resumeSuspendedTurnFlowIfReady;
      var finishPendingChoiceResolution = ResponseRuntime.finishPendingChoiceResolution;
      var pendingChoiceGuard = ResponseRuntime.pendingChoiceGuard;
      var resolveResponseChoice = ResponseRuntime.resolveResponseChoice;

      // L2: 决斗/南蛮/万箭/火攻 等锦囊在使用时已进入弃牌堆, 伤害结算收尾时
      // 不可重复弃置 (否则弃牌堆出现双份); 仍在结算中的牌 (如【杀】) 正常弃置。
      function discardSourceCardIfPending(game, card) {
        if (!card) return;
        var physical = physicalCardOf(card);
        if (physical && game.discard.indexOf(physical) !== -1) return;
        discardCard(game, card);
      }

      // v11 B1: 伤害/濒死域拆分 — damage/enterDying/濒死救援/铁索传导 迁往
      // ./damage-dying.js, 引擎闭包能力经 createDamageDyingRuntime 依赖注入。
      var DamageDyingRuntime = createDamageDyingRuntime({
        skillRegistry: skillRegistry,
        log: log,
        success: success,
        fail: fail,
        setPendingChoice: setPendingChoice,
        discardCard: discardCard,
        discardSourceCardIfPending: discardSourceCardIfPending,
        // v11 E1 (批次 35): 装备伤害修正 handler 表 — 装备域后置装配, 包装注入
        applyEquipmentDamageModifiers: function (g, ctx) { return applyEquipmentDamageModifiers(g, ctx); },
        // v11 C1: 救援 — 濒死路径同样适用 (桃/急救视为桃)。
        taoRecoverBonus: function (g, u, t) { return taoRecoverBonus(g, u, t); },
        isArmorIgnoredBySha: isArmorIgnoredBySha
      });
      var damage = DamageDyingRuntime.damage;
      var enterDying = DamageDyingRuntime.enterDying;
      var resolveDyingRescueChoice = DamageDyingRuntime.resolveDyingRescueChoice;

      // v11 C2 (批次 26): 连营 — 统一手牌失去事件的第一个消费者。
      // CardRuntime 在 putCard 落位提交手牌失去后回调这里; 在途还原路径
      // (火攻同花色不符退回 / 濒死救援校验失败退回等) 不会触发。
      // spec: 失去最后一张手牌后, 可以摸一张牌 (默认自动, decline 可关)。
      CardRuntime.setHandLossHandler(function (game, originState) {
        if (!game || game.phase === 'gameover') return;
        if (!originState || (originState.hand || []).length > 0) return;
        if (!hasSkill(originState, 'lianying')) return;
        if (originState.skillPreferences && originState.skillPreferences.lianying === 'decline') return;
        var actor = game.player === originState ? 'player'
          : (game.enemy === originState ? 'enemy' : null);
        if (!actor) return;
        log(game, actorName(game, actor) + '发动【连营】，摸一张牌。');
        drawCards(game, actor, 1);
      });

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

      function findResponseCard(state, type, preferredCardId, game) {
        var card = null;
        if (type === 'shan') {
          // v9 PR-E26: 玩家指定了用哪张牌当【闪】 → 直接消耗那张 (真闪 / 龙胆 / 倾国).
          if (preferredCardId) {
            var picked = shanOptionForCard(state, preferredCardId);
            if (!picked) return null;
            return {
              card: removeOwnCardFromAnyZone(state, preferredCardId, game),
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
          return shanConversion ? { card: removeOwnCardFromAnyZone(state, shanConversion.card.id, game), asName: shanConversion.asName, skillName: shanConversion.skillName } : null;
        }
        if (type === 'sha') {
          // v10 V6: 玩家指定用哪张牌当【杀】 → 直接消耗那张 (真杀 / 龙胆 / 武圣).
          if (preferredCardId) {
            var pickedSha = shaOptionForCard(state, preferredCardId);
            if (!pickedSha) return null;
            return {
              card: removeOwnCardFromAnyZone(state, preferredCardId, game),
              asName: '杀',
              skillName: pickedSha.via
            };
          }
          card = removeFirstCardOfType(state, 'sha');
          if (card) return { card: card, asName: '杀', skillName: null };
          var responseContext = { mode: 'response', state: state, asType: 'sha' };
          var conversion = selectCardAsConversion(SkillRuntime.runHook(skillRegistry, 'onCardAs', responseContext));
          // Same: support equipment-zone sources for 武圣 's response path.
          if (conversion) return { card: removeOwnCardFromAnyZone(state, conversion.card.id, game), asName: conversion.asName, skillName: conversion.skillName };
          // v7 PR-14: 丈八蛇矛 — "你可以将两张手牌当【杀】使用或打出"
          //   响应路径：装备 丈八 且手牌 >= 2 时，consume 2 张手牌当 杀 响应。
          //   spec 是 optional，但响应窗口缺省"自动出杀"——保留旧行为。
          //   skillPreferences.zhangba = 'decline' 可禁用。
          if (hasEquipmentEffect(state, 'zhangbaTwoHandSha')
              && state.hand.length >= 2
              && (!state.skillPreferences || state.skillPreferences.zhangba !== 'decline')) {
            var zbActor = game.player === state ? 'player' : 'enemy';
            var zbFirst = takeCard(game, state.hand[0], { zone: 'hand', actor: zbActor });
            var zbSecond = takeCard(game, state.hand[0], { zone: 'hand', actor: zbActor });
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
        var response = findResponseCard(game[actor], type, preferredCardId, game);
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
          card = takeCard(game, preferredCardId, { zone: 'hand', actor: actor });
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

      // v11 B1: 无懈链框架迁往 ./tricks.js (createTricksRuntime 依赖注入);
      // 各锦囊 continuation 暂留本文件, 经 registerWuxieContinuation 注册。
      // consumeWuxie/requestPlayerResponse 为函数声明/已装配别名, 提升与
      // 装配顺序保证前向引用安全。
      var TricksRuntime = createTricksRuntime({
        log: log,
        success: success,
        fail: fail,
        consumeWuxie: function (game, actor, reason, preferredCardId) {
          return consumeWuxie(game, actor, reason, preferredCardId);
        },
        requestPlayerResponse: requestPlayerResponse,
        registerResponseKind: registerResponseKind,
        // v11 B1 第五步: 锦囊 continuation 所需能力 (函数声明提升, 包装注入
        // 保证前向引用安全)
        setPendingChoice: setPendingChoice,
        damage: function (g, t, a, s, r, c, n, o) { return damage(g, t, a, s, r, c, n, o); },
        discardCard: function (g, c) { return discardCard(g, c); },
        drawCards: function (g, a, n) { return drawCards(g, a, n); },
        finishTrickUse: function (g, a, c, r, o) { return finishTrickUse(g, a, c, r, o); },
        finishWugu: function (g, ctx) { return finishWugu(g, ctx); },
        peekHuogongReveal: function (g, a) { return peekHuogongReveal(g, a); },
        playAOE: function (g, a, c, rt, t) { return playAOE(g, a, c, rt, t); },
        playDuel: function (g, a, c) { return playDuel(g, a, c); },
        removeCardFromHand: function (s, id) { return removeCardFromHand(s, id); },
        removeFirstMatchingCard: function (s, p) { return removeFirstMatchingCard(s, p); },
        removeTargetZoneCard: function (g, t, z, id) { return removeTargetZoneCard(g, t, z, id); },
        resolveGuohe1v1: function (g, s, t, o) { return resolveGuohe1v1(g, s, t, o); },
        resolveJiedaoDecision: function (g, s, o, c, op) { return resolveJiedaoDecision(g, s, o, c, op); },
        scoreCardForAI: function (g, a, c) { return scoreCardForAI(g, a, c); },
        // v11 D1 (批次 33): AI 无懈期望值 — ai 域后置装配, 包装注入
        aiShouldUseWuxie: function (g, r, ch) { return aiShouldUseWuxie(g, r, ch); }
      });
      var registerWuxieContinuation = TricksRuntime.registerWuxieContinuation;
      var listWuxieOptions = TricksRuntime.listWuxieOptions;
      var hasWuxieResponseAvailable = TricksRuntime.hasWuxieResponseAvailable;
      var checkWuxieAndContinue = TricksRuntime.checkWuxieAndContinue;
      var advanceWuxieChain = TricksRuntime.advanceWuxieChain;
      var settleWuxieChain = TricksRuntime.settleWuxieChain;
      var advanceTaoyuanTargets = TricksRuntime.advanceTaoyuanTargets;
      var advanceWuguTargets = TricksRuntime.advanceWuguTargets;
      var wuguPickForCurrent = TricksRuntime.wuguPickForCurrent;

      // v11 B1: 装备域装配 — 依赖注入引擎闭包能力 (函数声明经包装注入,
      // 提升保证前向引用); yinyue-response 在工厂内自注册。
      var EquipmentRuntime = createEquipmentRuntime({
        log: log,
        success: success,
        fail: fail,
        setPendingChoice: setPendingChoice,
        requestPlayerResponse: requestPlayerResponse,
        registerResponseKind: registerResponseKind,
        damage: function (g, t, a, s, r, c, n, o) { return damage(g, t, a, s, r, c, n, o); },
        discardCard: function (g, c) { return discardCard(g, c); },
        drawCards: function (g, a, n) { return drawCards(g, a, n); },
        equipmentList: function (s) { return equipmentList(s); },
        removeCardFromHand: function (s, id) { return removeCardFromHand(s, id); },
        resumePlayShaAfterCixiong: function (g) { return resumePlayShaAfterCixiong(g); },
        scoreCardForAI: function (g, a, c) { return scoreCardForAI(g, a, c); },
        consumeResponse: function (g, a, t, r, p) { return consumeResponse(g, a, t, r, p); },
        hasShanResponseAvailable: function (s) { return hasShanResponseAvailable(s); },
        listShanResponseOptions: function (s) { return listShanResponseOptions(s); }
      });
      var equipCard = EquipmentRuntime.equipCard;
      var loseEquipment = EquipmentRuntime.loseEquipment;
      var triggerEquipmentLoss = EquipmentRuntime.triggerEquipmentLoss;
      // v11 E1 (批次 35): 装备伤害修正 handler 表 (damage-dying 经包装引用)
      var applyEquipmentDamageModifiers = EquipmentRuntime.applyEquipmentDamageModifiers;
      var applyQilinDiscard = EquipmentRuntime.applyQilinDiscard;
      var resolveQilinPickChoice = EquipmentRuntime.resolveQilinPickChoice;
      var applyHanbingPrevent = EquipmentRuntime.applyHanbingPrevent;
      var applyWeaponHitEffects = EquipmentRuntime.applyWeaponHitEffects;
      var applyCixiongOnDesignate = EquipmentRuntime.applyCixiongOnDesignate;
      var fireCixiongTargetChoice = EquipmentRuntime.fireCixiongTargetChoice;
      var resolveCixiongFireChoice = EquipmentRuntime.resolveCixiongFireChoice;
      var resolveCixiongChoose = EquipmentRuntime.resolveCixiongChoose;
      var triggerYinyueQiang = EquipmentRuntime.triggerYinyueQiang;
      var resolveYinyueResponseChoice = EquipmentRuntime.resolveYinyueResponseChoice;

      // v11 B1: 银月枪触发与响应已迁往 ./equipment.js (见 EquipmentRuntime 装配)。

      var JudgeAreaRuntime = createJudgeAreaRuntime({
        skillRegistry: skillRegistry,
        reshuffleIfNeeded: reshuffleIfNeeded,
        takeCard: takeCard,
        putCard: putCard,
        discardCard: discardCard,
        log: log,
        actorName: actorName,
        evaluateDelayedTrick: evaluateDelayedTrick,
        damage: function (g, a, n, s, r, c, nature, opts) { return damage(g, a, n, s, r, c, nature, opts); },
        opponent: opponent
      });
      var judge = JudgeAreaRuntime.judge;
      var resolveJudgementCard = JudgeAreaRuntime.resolveJudgementCard;
      var judgementReasonFor = JudgeAreaRuntime.judgementReasonFor;
      var processJudgeArea = JudgeAreaRuntime.processJudgeArea;
      var applyJudgeAreaOutcome = JudgeAreaRuntime.applyJudgeAreaOutcome;

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
        // 注册表迁移收官: 所有 pendingChoice / response kind 统一经
        // RESPONSE_KIND_RESOLVERS 分发 (此前仅 V3-V6 的 shan/wuxie/sha-duel/
        // wanjian/yinyue 走注册表, 其余 15 个 kind 是手写 if 链)。
        var resolver = RESPONSE_KIND_RESOLVERS[pending.kind];
        if (!resolver) return fail('未知的选择类型：' + pending.kind);
        game.pendingChoice = null;
        return finishPendingChoiceResolution(game, resolver(game, pending, decision || {}));
      }

      // 注册表迁移收官: 把原 resolvePendingChoice 内的 15 个手写 if 分支统一
      // 注册到 RESPONSE_KIND_RESOLVERS, 与 V3-V6 已迁移的 response kind 同走
      // 一套 dispatcher。resolver 签名 (game, pending, decision), 各自负责清理
      // 对应 pauseState (失败时可重设 game.pendingChoice 以重试)。
      registerResponseKind('guicai-replace', resolveGuicaiReplaceChoice);
      registerResponseKind('yiji-distribute', resolveYijiDistributeChoice);
      registerResponseKind('guanxing-reorder', resolveGuanxingChoice);
      registerResponseKind('fanjian-guess', resolveFanjianGuessChoice);
      registerResponseKind('fankui-pick', resolveFankuiPickChoice);
      registerResponseKind('ganglie-fire', resolveGanglieFireChoice);
      registerResponseKind('ganglie-source-choice', resolveGanglieSourceChoice);
      registerResponseKind('qilin-pick', resolveQilinPickChoice);
      registerResponseKind('cixiong-fire', resolveCixiongFireChoice);
      registerResponseKind('cixiong-choose', resolveCixiongChoose);
      registerResponseKind('jiedao-decision', resolveJiedaoDecisionChoice);
      registerResponseKind('wugu-pick', resolveWuguPickChoice);
      registerResponseKind('guohe-1v1-pick', resolveGuohe1v1PickChoice);
      registerResponseKind('dying-rescue', resolveDyingRescueChoice);
      registerResponseKind('luoshen-continue', resolveLuoshenContinueChoice);
      // v11 C7 (批次 31): 耀武 — 伤害来源的奖励二选一
      registerResponseKind('yaowu-reward', resolveYaowuRewardChoice);

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
            setPendingChoice(game, pending);
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
          var moved = [];
          for (var i = 0; i < validIds.length; i += 1) {
            var card = moveCard(game, validIds[i], { zone: 'hand', actor: actor }, { zone: 'hand', actor: opp });
            if (!card) continue;
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
          var replacement = takeCard(game, decision.cardId, { zone: 'hand', actor: holder });
          if (!replacement) return fail('找不到这张牌。');
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
          pendingChoiceQueue: [],
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
          return { card: takeCard(game, picked.card, { zone: 'hand', actor: targetActor }), zone: '手牌' };
        }
        if (zone === 'equipment') {
          takeCard(game, picked.card, { zone: 'equipment', actor: targetActor, slot: picked.slot });
          // M2: 被拆/被顺/被反馈拿走装备同样是"失去装备区里的牌"
          triggerEquipmentLoss(game, targetActor, picked.card);
          return { card: picked.card, zone: '装备区' };
        }
        if (zone === 'judge') {
          return { card: takeCard(game, picked.card, { zone: 'judgeArea', actor: targetActor }), zone: '判定区' };
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
        if (hasEquipmentEffect(self, 'zhuqueShaToFire') && card.type === 'sha'
            && (!self.skillPreferences || self.skillPreferences.zhuque !== 'decline')) {
          // M1: 朱雀转火杀是「本次使用」的视为效果, 不应永久改写物理牌身份。
          // 记录转化前 type/name, 由 discardCard 在该牌离场时还原; 否则该【杀】
          // 弃置 → 洗回牌堆后会变成永久【火杀】, 污染牌堆。虚拟杀 (武圣/龙胆/
          // 丈八 的 wrapper) 走 physicalCard, wrapper 被丢弃, 不受影响。
          card.zhuqueOriginalType = card.type;
          card.zhuqueOriginalName = card.name;
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
        if (hasEquipmentEffect(self, 'fangtianLastHandBonus') && self.hand.length === 0) {
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

      // v11 C1: 无双 — 锁定技。吕布的【杀】需目标依次两张【闪】; 决斗中
      // 吕布的对手每轮需依次打出两张【杀】。
      function shanRequiredAgainstSha(game, sourceActor) {
        return hasSkill(game[sourceActor], 'wushuang') ? 2 : 1;
      }

      function duelShaRequired(game, responder) {
        return hasSkill(game[opponent(responder)], 'wushuang') ? 2 : 1;
      }

      // v11 C1: 救援 — 主公技/锁定。其他吴势力角色对主公孙权使用【桃】
      // (含急救视为桃) 时, 回复量 +1。
      function taoRecoverBonus(game, userActor, targetActor) {
        if (userActor === targetActor) return 0;
        var target = game[targetActor];
        var user = game[userActor];
        if (!target || !user || !hasSkill(target, 'jiuyuan')) return 0;
        if (!game.roles || game.roles[targetActor] !== '主公') return 0;
        if (user.camp !== '吴') return 0;
        log(game, actorName(game, targetActor) + '的【救援】生效，回复量 +1。');
        return 1;
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
            // v11 C1: 无双 → shanRemaining=2, 首张闪后再开第二个响应窗口。
            source: { actor: actor, card: card, amount: amount, shanRemaining: shanRequiredAgainstSha(game, actor) },
            // v9 PR-E26: 列出所有可作【闪】的牌 (真闪 + 龙胆/倾国 转化), 玩家自选.
            options: listShanResponseOptions(target),
            meta: { sourceActor: actor, shaName: card.name },
            logMessage: '等待' + actorName(game, 'player') + '决定是否打出【闪】。',
            statusMessage: '等待玩家响应【杀】。'
          });
        }

        var dodged = false;
        if (!responseContext.responseLocked) {
          // v11 C1: 无双 — 需依次两张【闪】(每一张都可由八卦判定替代)。
          var shanNeeded = shanRequiredAgainstSha(game, actor);
          if (shanNeeded > 1) {
            log(game, '【无双】锁定：' + actorName(game, targetActor) + '需依次使用两张【闪】。');
          }
          dodged = true;
          for (var shanIndex = 0; shanIndex < shanNeeded; shanIndex += 1) {
            // v11 D2 (批次 34): AI 座席每张需求先试八卦判定 (免费闪机会),
            // 判定失败仍可出真闪; 玩家 auto 座席保持旧顺序 (真闪优先)。
            if (targetActor !== 'player' && tryBaguaDodge(game, targetActor, ignoreArmor)) continue;
            if (consumeResponse(game, targetActor, 'shan', '【杀】')) continue;
            if (targetActor === 'player' && tryBaguaDodge(game, targetActor, ignoreArmor)) continue;
            dodged = false;
            break;
          }
        }
        return resolveShaAfterResponse(game, actor, card, amount, dodged);
      }

      // H2: 八卦阵 — 需要打出【闪】时 (响应【杀】或【万箭齐发】) 若目标装备
      // 八卦且未被无视, 进行判定; 红色视为打出【闪】。返回是否因此闪避; 无
      // 八卦 / 被无视 → 返回 false 且无副作用。统一【杀】与【万箭齐发】两类
      // 需闪场景, 此前【万箭齐发】缺失此兜底 (有八卦无闪的目标必中)。
      function tryBaguaDodge(game, targetActor, ignoreArmor) {
        var target = game[targetActor];
        if (!target || !hasEquipmentEffect(target, 'baguaShanJudge') || ignoreArmor) return false;
        var baguaJudge = judge(game, targetActor, '【八卦阵】');
        var dodged = false;
        if (baguaJudge && baguaJudge.color === 'red') {
          log(game, actorName(game, targetActor) + '的【八卦阵】判定为红色，视为打出【闪】。');
          dodged = true;
        }
        resolveJudgementCard(game, targetActor, target, '【八卦阵】', baguaJudge);
        return dodged;
      }

      // M7 (审计二轮): 贯石斧 — spec "你可以弃置两张牌, 令此【杀】依然生效":
      //   (a) "可以" → skillPreferences.guanshi 提供 decline / ask 开关
      //       (此前无条件强制发动, 可能弃掉玩家的桃/无懈);
      //   (b) "两张牌" 含装备区牌 (此前只取手牌最旧两张);
      //   (c) ask 档 (默认 auto, 避免 UI 无对应面板时卡死) 经 pendingChoice
      //       'guanshi-discard' 让玩家自选两张或放弃。
      // 返回 result 表示贯石流程接管 (强制命中或暂停); null 表示不发动,
      // 回到正常闪避收尾。
      function applyGuanshiForcedHit(game, actor, targetActor, card, amount) {
        var self = game[actor];
        var handIds = (self.hand || []).map(function (c) { return c.id; });
        var equipEntries = equipmentList(self);
        if (handIds.length + equipEntries.length < 2) return null;
        var pref = (self.skillPreferences && self.skillPreferences.guanshi) || 'auto';
        if (pref === 'decline') {
          log(game, actorName(game, actor) + '选择不发动【贯石斧】。');
          return null;
        }
        if (pref === 'ask') {
          if (!game.pauseState) game.pauseState = {};
          game.pauseState.guanshi = { actor: actor, targetActor: targetActor, card: card, amount: amount };
          setPendingChoice(game, {
            kind: 'guanshi-discard',
            actor: actor,
            handIds: handIds,
            equipment: equipEntries.map(function (e) {
              return { slot: e.slot, cardId: e.card.id, name: e.card.name };
            })
          });
          return success('等待' + actorName(game, actor) + '决定是否发动【贯石斧】。');
        }
        // v11 D2 (批次 34): AI 座席期望值门 — 两张牌换 1 点强制伤害, 只在
        // 斩杀压力 (目标血线 <= 伤害+1) 或手牌充裕 (>=4, 成本可承受) 时
        // 划算; 玩家 auto 座席保持旧行为 (无条件发动)。
        if (actor !== 'player') {
          var guanshiTarget = game[targetActor];
          var killPressure = guanshiTarget && guanshiTarget.hp <= amount + 1;
          if (!killPressure && handIds.length < 4) {
            log(game, actorName(game, actor) + '保留手牌，不发动【贯石斧】。');
            return null;
          }
        }
        // auto: 弃 AI 评分最低的两张手牌; 手牌不足两张时用装备补足
        // (坐骑 > 防具 > 武器, 尽量保留战力)。
        var scoredHand = (self.hand || []).slice()
          .map(function (c) { return { card: c, score: scoreCardForAI(game, actor, c) }; })
          .sort(function (a, b) { return a.score - b.score; });
        var costIds = scoredHand.slice(0, 2).map(function (e) { return e.card.id; });
        if (costIds.length < 2) {
          var slotOrder = { horsePlus: 1, horseMinus: 2, armor: 3, weapon: 4 };
          var sortedEquips = equipEntries.slice().sort(function (a, b) {
            return (slotOrder[a.slot] || 9) - (slotOrder[b.slot] || 9);
          });
          for (var si = 0; si < sortedEquips.length && costIds.length < 2; si += 1) {
            costIds.push(sortedEquips[si].card.id);
          }
        }
        return executeGuanshiForcedHit(game, actor, targetActor, card, amount, costIds);
      }

      function executeGuanshiForcedHit(game, actor, targetActor, card, amount, costIds) {
        var self = game[actor];
        var discardedNames = [];
        for (var i = 0; i < costIds.length; i += 1) {
          var costCard = removeOwnCardFromAnyZone(self, costIds[i], game);
          if (costCard) {
            discardCard(game, costCard);
            discardedNames.push(costCard.name);
          }
        }
        log(game, actorName(game, actor) + '发动【贯石斧】，弃置【' + discardedNames.join('】、【') + '】令【杀】强制命中。');
        if (damage(game, targetActor, amount, actor, '【' + card.name + '】', card)) applyWeaponHitEffects(game, actor, targetActor);
        return success('贯石斧强制命中。');
      }

      function resolveGuanshiDiscardChoice(game, pending, decision) {
        var saved = game.pauseState && game.pauseState.guanshi;
        if (!saved) return fail('找不到【贯石斧】的暂停状态。');
        var actor = pending.actor;
        if (decision && decision.decline) {
          game.pauseState.guanshi = null;
          log(game, actorName(game, actor) + '选择不发动【贯石斧】。');
          log(game, actorName(game, saved.targetActor) + '闪避成功，没有受到伤害。');
          discardCard(game, saved.card);
          return success('目标闪避。');
        }
        var ids = (decision && decision.cardIds) || [];
        var allowed = pending.handIds.concat(pending.equipment.map(function (e) { return e.cardId; }));
        var unique = ids.filter(function (id, idx) { return ids.indexOf(id) === idx && allowed.indexOf(id) >= 0; });
        if (unique.length !== 2) {
          setPendingChoice(game, pending);
          return fail('请选择两张要弃置的牌（手牌或装备），或 decline 放弃。');
        }
        game.pauseState.guanshi = null;
        return executeGuanshiForcedHit(game, actor, saved.targetActor, saved.card, saved.amount, unique);
      }

      registerResponseKind('guanshi-discard', resolveGuanshiDiscardChoice);

      // v9 PR-E25: 【杀】响应窗口结束后的结算 (贯石/青龙/伤害). 从原
      // continueShaAfterCixiong 拆出, 供同步路径 + shan-response 暂停恢复共用.
      function resolveShaAfterResponse(game, actor, card, amount, dodged) {
        var self = game[actor];
        var targetActor = opponent(actor);
        var target = game[targetActor];
        if (dodged) {
          if (hasEquipmentEffect(self, 'guanshiForceHit')) {
            var guanshiResult = applyGuanshiForcedHit(game, actor, targetActor, card, amount);
            if (guanshiResult) return guanshiResult;
          }
          if (hasEquipmentEffect(self, 'qinglongChase')) {
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
        var shanRemaining = saved.shanRemaining || 1;
        var dodged = false;
        if (d.cardId) {
          dodged = consumeResponse(game, 'player', 'shan', '【杀】', d.cardId);
          if (!dodged) log(game, actorName(game, 'player') + '指定的牌无法当【闪】。');
        } else if (d.use) {
          dodged = consumeResponse(game, 'player', 'shan', '【杀】');
          if (!dodged) log(game, actorName(game, 'player') + '没有可打出的【闪】。');
        } else {
          log(game, actorName(game, 'player') + '选择不打出【闪】。');
          // v11 C1: 放弃出闪 → 剩余每一张需求都须由八卦判定顶上才算抵消。
          dodged = true;
          for (var baguaIndex = 0; baguaIndex < shanRemaining; baguaIndex += 1) {
            if (!tryBaguaDodge(game, 'player', isArmorIgnoredBySha(game, actor, card))) {
              dodged = false;
              break;
            }
          }
          shanRemaining = 1; // 已按剩余需求整体判定完毕
        }
        // v11 C1: 无双 — 首张闪成功且仍有剩余需求 → 再开一个响应窗口。
        if (dodged && shanRemaining > 1) {
          if (hasShanResponseAvailable(game.player)) {
            return requestPlayerResponse(game, {
              kind: 'shan-response',
              actor: 'player',
              pauseKey: 'shaResponse',
              source: { actor: actor, card: card, amount: amount, shanRemaining: shanRemaining - 1 },
              options: listShanResponseOptions(game.player),
              meta: { sourceActor: actor, shaName: card.name },
              logMessage: '【无双】：' + actorName(game, 'player') + '需再使用一张【闪】。',
              statusMessage: '等待玩家响应【杀】(无双第二张)。'
            });
          }
          // 无第二张可出 → 尝试八卦顶上, 否则未抵消。
          dodged = tryBaguaDodge(game, 'player', isArmorIgnoredBySha(game, actor, card));
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
          reason: '【决斗】',
          // L2: 保留决斗牌引用 — 奸雄可获得"造成伤害的牌" (决斗/南蛮/万箭/火攻)
          card: card
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
        // v11 C1: 无双 — 对手为吕布时每轮需依次打出两张【杀】。
        var duelNeeded = duelShaRequired(game, responder);
        var duelPaid = 0;
        while (duelPaid < duelNeeded && consumeResponse(game, responder, 'sha', chain.reason)) {
          duelPaid += 1;
        }
        if (duelPaid === duelNeeded) {
          chain.currentResponder = opponent(responder);
          return advanceDuelChain(game);
        }
        if (duelNeeded > 1) {
          log(game, '【无双】锁定：' + actorName(game, responder) + '未能打出两张【杀】。');
        }
        // 无杀 → 受 1 伤, 链结束
        var loser = responder;
        game.pauseState.duelChain = null;
        damage(game, loser, 1, opponent(loser), chain.reason, chain.card);
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
            damage(game, ploser, 1, opponent(ploser), chain.reason, chain.card);
            return success('决斗结算完成。');
          }
          // v11 C1: 无双 — 玩家每轮需依次两张【杀】; 首张后剩余 >0 则再询问。
          if (chain.shaRemaining === undefined || chain.shaRemaining === null) {
            chain.shaRemaining = duelShaRequired(game, 'player');
          }
          chain.shaRemaining -= 1;
          if (chain.shaRemaining > 0) {
            if (hasShaResponseAvailable(game.player)) {
              log(game, '【无双】：' + actorName(game, 'player') + '需再打出一张【杀】。');
              return advanceDuelChain(game);
            }
            log(game, '【无双】锁定：' + actorName(game, 'player') + '无法打出第二张【杀】。');
            game.pauseState.duelChain = null;
            damage(game, 'player', 1, opponent('player'), chain.reason, chain.card);
            return success('决斗结算完成。');
          }
          chain.shaRemaining = null;
          chain.currentResponder = opponent('player');
          return advanceDuelChain(game);
        }
        // 玩家放弃出杀 → 受 1 伤
        log(game, actorName(game, 'player') + '选择不打出【杀】响应' + chain.reason + '。');
        game.pauseState.duelChain = null;
        damage(game, 'player', 1, opponent('player'), chain.reason, chain.card);
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
              source: { sourceActor: actor, title: title, card: card },
              options: listShanResponseOptions(aoeTarget),
              meta: { sourceActor: actor, sourceName: title },
              logMessage: '等待' + actorName(game, 'player') + '决定是否打出【闪】响应【' + title + '】。',
              statusMessage: '等待玩家响应【' + title + '】。'
            });
          }
        }
        // v11 D2 (批次 34): AI 座席先试八卦判定 (免费闪机会), 成功则省下
        // 真闪应对后续威胁; 玩家 auto 座席保持旧顺序 (真闪优先)。
        if (responseType === 'shan' && targetActor !== 'player'
            && tryBaguaDodge(game, targetActor, false)) {
          log(game, actorName(game, targetActor) + '成功化解【' + title + '】。');
        } else if (consumeResponse(game, targetActor, responseType, '【' + title + '】')) {
          log(game, actorName(game, targetActor) + '成功化解【' + title + '】。');
        } else if (responseType === 'shan' && targetActor === 'player' && tryBaguaDodge(game, targetActor, false)) {
          // H2: 【万箭齐发】需打出【闪】, 八卦阵 红判定可化解。
          //      (【南蛮入侵】需【杀】, responseType==='sha', 不触发八卦)
          log(game, actorName(game, targetActor) + '成功化解【' + title + '】。');
        } else {
          // L2: 传 card — 奸雄可获得造成伤害的南蛮/万箭实体牌
          damage(game, targetActor, 1, actor, '【' + title + '】', card);
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
        // H2: 玩家未以【闪】化解 (放弃 / 无闪 / 指定牌无效) → 八卦阵 红判定可化解。
        if (!dodged && tryBaguaDodge(game, 'player', false)) {
          dodged = true;
        }
        if (dodged) {
          log(game, actorName(game, 'player') + '成功化解【' + title + '】。');
        } else {
          damage(game, 'player', 1, sourceActor, '【' + title + '】', saved.card);
        }
        return success(title + '响应完成。');
      }

      registerResponseKind('wanjian-response', resolveWanjianResponseChoice);

      // L1 (审计二轮): 火攻 "目标展示一张手牌" 是目标的选择, 此前恒取
      // hand[0] (确定性泄露 + 目标无选择权)。现在: AI / 'auto' (默认) 目标用
      // 游戏 RNG 随机挑一张并缓存 (pauseState.huogongReveal), 同一次结算内
      // getHuogongChoice 预览 / playCard 校验 / 结算三处一致; 玩家目标可设
      // skillPreferences.huogongShow='ask' 经 pendingChoice 'huogong-show'
      // 自选 (默认 auto, 避免 UI 无对应面板时卡死)。
      function peekHuogongReveal(game, targetActor) {
        var targetState = game[targetActor];
        if (!targetState || !targetState.hand || !targetState.hand.length) return null;
        if (!game.pauseState) game.pauseState = {};
        var cached = game.pauseState.huogongReveal;
        if (cached && cached.targetActor === targetActor) {
          var cachedCard = targetState.hand.find(function (c) { return c.id === cached.cardId; });
          if (cachedCard) return cachedCard;
        }
        var pref = (targetState.skillPreferences && targetState.skillPreferences.huogongShow) || 'auto';
        if (targetActor === 'player' && pref === 'ask') return null;
        var picked = targetState.hand[randomHandIndex(game, targetState)];
        game.pauseState.huogongReveal = { targetActor: targetActor, cardId: picked.id };
        return picked;
      }

      function getHuogongChoice(game, actor) {
        var self = game && game[actor];
        var target = game && game[opponent(actor)];
        if (!self || !target || !target.hand || !target.hand.length) {
          return { ok: false, revealedCard: null, usableCostIds: [], unusableCostIds: [], usableCards: [], unusableCards: [], message: '目标没有手牌。' };
        }
        var revealed = peekHuogongReveal(game, opponent(actor));
        if (!revealed) {
          return { ok: false, pendingTargetChoice: true, revealedCard: null, usableCostIds: [], unusableCostIds: [], usableCards: [], unusableCards: [], message: '等待目标选择展示牌。' };
        }
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
        var pendingGuard = pendingChoiceGuard(game);
        if (pendingGuard) return pendingGuard;
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
        return playCardWithRegisteredHandler(game, actor, card, options, self);
      }

      var PLAY_HANDLERS = {};
      function registerPlayHandler(key, handler) {
        PLAY_HANDLERS[key] = handler;
      }

      function playHandlerKey(card) {
        if (isShaCard(card)) return 'sha';
        if (card && card.family === 'equipment') return 'equipment';
        if (card && card.family === 'delayed') return 'delayed';
        return (card && card.type) || 'default';
      }

      function playCardWithRegisteredHandler(game, actor, card, options, self) {
        var handler = PLAY_HANDLERS[playHandlerKey(card)] || PLAY_HANDLERS.default;
        return handler(game, actor, card, options || {}, self);
      }

      function playShaCardHandler(game, actor, card, options, self) {
        return playSha(game, actor, card);
      }

      function playEquipmentCardHandler(game, actor, card, options, self) {
        return equipCard(game, actor, card);
      }

      function playDelayedCardHandler(game, actor, card, options, self) {
          // H1: 延时锦囊放置前开无懈窗口 (gltjk card__scroll.md — 无懈可击可在
          // 锦囊「对一个目标生效前」抵消; 延时锦囊于放置时即指定目标)。
          // 乐不思蜀/兵粮寸断 → 对方判定区; 闪电 → 自己判定区。无懈响应者恒为
          // 非来源方 (opponent(actor))。
          var delayedSide = (card.type === 'shandian') ? actor : opponent(actor);
          return checkWuxieAndContinue(game, opponent(actor), '【' + card.name + '】', 'delayed-place', {
            actor: actor, card: card, options: options, delayedSide: delayedSide
          });
      }

      function playTaoCardHandler(game, actor, card, options, self) {
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
          // v11 C1: 救援 — 其他吴势力角色对主公孙权使用【桃】回复量 +1。
          var taoHeal = 1 + taoRecoverBonus(game, actor, taoTargetActor);
          taoTargetState.hp = Math.min(taoTargetState.maxHp, taoTargetState.hp + taoHeal);
          log(game, actorName(game, actor) + '使用【桃】' + (taoTargetActor === actor ? '' : '对' + actorName(game, taoTargetActor)) + '，回复 ' + taoHeal + ' 点体力。');
          return success('回复体力。');
      }

      function playJiuCardHandler(game, actor, card, options, self) {
          // v7 PR-8: 标记已用 + shaBonus = 1（不累加，spec "下一张【杀】"
          // 即下一次结算 +1，不是叠加多次酒）
          discardCard(game, card);
          if (!self.flags) self.flags = {};
          self.flags.jiuUsedThisTurn = true;
          self.shaBonus = 1;
          log(game, actorName(game, actor) + '饮下【酒】，本回合下一张【杀】伤害 +1。');
          return success('下一张杀伤害提升。');
      }

      function playWuzhongCardHandler(game, actor, card, options, self) {
          // v7 PR-16: gltjk card__scroll.md 无中生有 (1V1/界限突破/国-标):
          //   "使用目标: 包括你在内的一名角色"。options.wuzhongTarget 可指定
          //   'player' / 'enemy'; 未指定时默认 = actor。
          // H1: 摸牌前开无懈窗口 (对方可抵消)。
          discardCard(game, card);
          var wzTargetActor = (options.wuzhongTarget === 'player' || options.wuzhongTarget === 'enemy')
            ? options.wuzhongTarget
            : actor;
          if (!game[wzTargetActor]) {
            return fail('无效的【无中生有】目标。');
          }
          log(game, actorName(game, actor) + '使用【无中生有】' + (wzTargetActor === actor ? '' : '令' + actorName(game, wzTargetActor)) + '。');
          return checkWuxieAndContinue(game, opponent(actor), '【无中生有】', 'wuzhong', {
            actor: actor, card: card, options: options, wzTargetActor: wzTargetActor
          });
      }

      function playJuedouCardHandler(game, actor, card, options, self) {
          // v10 V5: 走无懈链框架. WUXIE_CONTINUATIONS['juedou'] 注册在 trick 区下方.
          return checkWuxieAndContinue(game, opponent(actor), '【决斗】', 'juedou', {
            actor: actor, card: card, options: options
          });
      }

      // H1: 南蛮入侵 / 万箭齐发 在 1v1 中只有 1 名目标 (对方), 单个无懈窗口
        // 即与官方一致。无懈窗口在 playAOE (响应 / 伤害) 之前。
      function playNanmanCardHandler(game, actor, card, options, self) {
          return checkWuxieAndContinue(game, opponent(actor), '【南蛮入侵】', 'nanman', {
            actor: actor, card: card, options: options
          });
      }

      function playWanjianCardHandler(game, actor, card, options, self) {
          return checkWuxieAndContinue(game, opponent(actor), '【万箭齐发】', 'wanjian', {
            actor: actor, card: card, options: options
          });
      }

      function playGuoheCardHandler(game, actor, card, options, self) {
          // v7 PR-9: 1V1 变体两选项 — 装备区一张 / 看手并弃一张。
          // v10 V5: 走无懈链框架.
          discardCard(game, card);
          return checkWuxieAndContinue(game, opponent(actor), '【过河拆桥】', 'guohe', {
            actor: actor, card: card, options: options
          });
      }

      function playShunshouCardHandler(game, actor, card, options, self) {
          // v10 V5: 走无懈链框架.
          discardCard(game, card);
          return checkWuxieAndContinue(game, opponent(actor), '【顺手牵羊】', 'shunshou', {
            actor: actor, card: card, options: options
          });
      }

      function playTaoyuanCardHandler(game, actor, card, options, self) {
          discardCard(game, card);
          // v7 PR-2 + H1b: gltjk card__scroll.md "对未受伤的角色无效"; 多角色
          // 结算顺序从发动者起逆时针 = [actor, opponent]。H1b: 每名受伤目标各
          // 自独立开无懈窗口 (无懈只抵消「对一个目标」的效果, 双方都受伤时各
          // 自可被无懈)。未受伤角色不是目标, 不开窗。
          log(game, actorName(game, actor) + '使用【桃园结义】。');
          var taoyuanTargets = [actor, opponent(actor)].filter(function (side) {
            var s = game[side];
            return s && s.hp < s.maxHp;
          });
          return advanceTaoyuanTargets(game, {
            actor: actor, card: card, options: options, targets: taoyuanTargets, idx: 0
          });
      }

      function playWuguCardHandler(game, actor, card, options, self) {
          // v7 PR-7: gltjk card__scroll.md 五谷丰登 —
          //   "执行动作：当此牌指定目标后，你亮出牌堆顶的 X 张牌（X 为目标数）。"
          //   "作用效果：目标角色获得这些牌中（剩余）的一张牌。"
          //   "若你未将执行动作完整执行完毕，终止此牌的使用结算。"
          //   "使用结算结束后，将这些牌中剩余的牌置入弃牌堆。"
          var wuguTargetCount = StateRuntime.aliveActorCount(game);
          // M4 (审计二轮): 逐张亮出, 每张前按需洗牌 (与 drawCards 同构)。此前
          // reshuffleIfNeeded 只在 deck===0 时触发, deck=1 + discard=130 时
          // 循环空转, 错误地以"牌堆不足"终止结算。五谷自身在亮牌后才进弃牌堆
          // (结算中的牌不可被洗回亮出)。
          var wuguPool = [];
          for (var wi = 0; wi < wuguTargetCount; wi++) {
            reshuffleIfNeeded(game);
            if (game.deck.length === 0) break;
            wuguPool.push(takeCard(game, null, { zone: 'deck' }));  // 亮出池是在途池
          }
          discardCard(game, card);
          if (wuguPool.length < wuguTargetCount) {
            // 牌堆 + 弃牌堆合计不足 X 张 → 官方: 执行动作未完整执行, 终止结算,
            // 已亮出的牌置入弃牌堆 (保持牌守恒)。
            wuguPool.forEach(function (revealedCard) { discardCard(game, revealedCard); });
            log(game, '【五谷丰登】牌堆不足以亮出 ' + wuguTargetCount + ' 张牌，结算终止。');
            return finishTrickUse(game, actor, card, success('五谷丰登终止（牌堆不足）。'), options);
          }
          log(game, actorName(game, actor) + '使用【五谷丰登】，亮出 ' + wuguPool.map(function (c) { return '【' + c.name + '】'; }).join(' / ') + '。');
          // 多角色结算顺序原则：从当前回合角色起按逆时针 → 1v1 即 [actor, opponent(actor)]
          return finishTrickUse(game, actor, card, processWuguPick(game, actor, card, wuguPool, [actor, opponent(actor)], 0, options), options);
      }

      function playHuogongCardHandler(game, actor, card, options, self) {
          // v10 V5: 走无懈链框架. 后续 huogong 流程移到 WUXIE_CONTINUATIONS['huogong'].
          discardCard(game, card);
          return checkWuxieAndContinue(game, opponent(actor), '【火攻】', 'huogong', {
            actor: actor, card: card, options: options
          });
      }

      function playTiesuoCardHandler(game, actor, card, options, self) {
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

      function playJiedaoCardHandler(game, actor, card, options, self) {
          // v7 PR-5: gltjk card__scroll.md 注 — 须做两次合法性检测.
          // 第一次已在 canPlayCard 检过; 这里做第二次 (在 jiedao 继续逻辑里).
          // v10 V5: 走无懈链框架.
          discardCard(game, card);
          return checkWuxieAndContinue(game, opponent(actor), '【借刀杀人】', 'jiedao', {
            actor: actor, card: card, options: options
          });
      }

      function playDefaultCardHandler(game, actor, card, options, self) {
        discardCard(game, card);
        return success('卡牌已使用。');
      }

      registerPlayHandler('sha', playShaCardHandler);
      registerPlayHandler('equipment', playEquipmentCardHandler);
      registerPlayHandler('delayed', playDelayedCardHandler);
      registerPlayHandler('tao', playTaoCardHandler);
      registerPlayHandler('jiu', playJiuCardHandler);
      registerPlayHandler('wuzhong', playWuzhongCardHandler);
      registerPlayHandler('juedou', playJuedouCardHandler);
      registerPlayHandler('nanman', playNanmanCardHandler);
      registerPlayHandler('wanjian', playWanjianCardHandler);
      registerPlayHandler('guohe', playGuoheCardHandler);
      registerPlayHandler('shunshou', playShunshouCardHandler);
      registerPlayHandler('taoyuan', playTaoyuanCardHandler);
      registerPlayHandler('wugu', playWuguCardHandler);
      registerPlayHandler('huogong', playHuogongCardHandler);
      registerPlayHandler('tiesuo', playTiesuoCardHandler);
      registerPlayHandler('jiedao', playJiedaoCardHandler);
      registerPlayHandler('default', playDefaultCardHandler);

      // v11 B1 第五步: 各锦囊 continuation / 桃园五谷逐目标推进 / 火攻结算
      // 已随框架迁入 ./tricks.js (见下方 TricksRuntime 装配)。

      // 全部目标处理完 → 剩余亮出牌进弃牌堆。
      function finishWugu(game, ctx) {
        if (ctx.pool.length) {
          ctx.pool.forEach(function (rem) {
            discardCard(game, rem);
            log(game, '【五谷丰登】剩余【' + rem.name + '】置入弃牌堆。');
          });
          ctx.pool.length = 0;
        }
        return success('五谷丰登结算完成。');
      }

      function startTurn(game, actor) {
        var pendingGuard = pendingChoiceGuard(game);
        if (pendingGuard) return pendingGuard;
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
        // v11 C8 (批次 32): 妄尊 (标袁术) — gltjk spec: "主公的准备阶段开始
        // 时, 你可以摸一张牌, 该主公本回合手牌上限 -1"。1v1 实现取对手为
        // 主公的场景 (袁术自任主公时 +1 牌/-1 上限自净, 不建模); 默认自动,
        // skillPreferences.wangzun='decline' 可关。放在观星/洛神之前, 避免
        // 其 pendingChoice 挂起时被跳过。
        var wangzunHolderActor = opponent(actor);
        var wangzunHolder = game[wangzunHolderActor];
        if (wangzunHolder && hasSkill(wangzunHolder, 'wangzun')
            && game.roles && game.roles[actor] === '主公'
            && !(wangzunHolder.skillPreferences && wangzunHolder.skillPreferences.wangzun === 'decline')) {
          log(game, actorName(game, wangzunHolderActor) + '发动【妄尊】，摸一张牌，' + actorName(game, actor) + '本回合手牌上限 -1。');
          drawCards(game, wangzunHolderActor, 1);
          state.handLimitDelta = (state.handLimitDelta || 0) - 1;
        }
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
            setPendingChoice(game, {
              kind: 'guanxing-reorder',
              actor: actor,
              cards: preview.cards.map(function (c) {
                return { id: c.id, name: c.name, type: c.type, suit: c.suit, rank: c.rank };
              })
            });
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
          setPendingChoice(game, { kind: 'luoshen-continue', actor: actor });
          return { suspended: true };
        }
        return runLuoshenJudge(game, actor, pref);
      }

      function runLuoshenJudge(game, actor, pref) {
        var state = game[actor];
        var card = judge(game, actor, '【洛神】');
        if (!card) return null;
        if (card.color === 'black') {
          putCard(game, card, { zone: 'hand', actor: actor });
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
        var pendingGuard = pendingChoiceGuard(game);
        if (pendingGuard) return pendingGuard;
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
        var pendingGuard = pendingChoiceGuard(game);
        if (pendingGuard) return pendingGuard;
        var state = game[actor];
        if (!state) return fail('未知角色。');
        cardIds = cardIds || [];
        var excess = Math.max(0, state.hand.length - handLimit(game, actor));
        if (excess === 0) return success('无需弃牌。');
        // L4 (审计二轮): 先完整校验再变更状态 — 此前传入重复/无效 cardId 时
        // 先弃掉能弃的再返回 fail, 状态已被部分修改 (非事务性)。
        var unique = [];
        cardIds.forEach(function (id) {
          if (unique.indexOf(id) < 0) unique.push(id);
        });
        var valid = unique.filter(function (id) {
          return state.hand.some(function (card) { return card.id === id; });
        });
        if (valid.length < excess) return fail('需要弃置 ' + excess + ' 张有效手牌。');
        var discarded = [];
        for (var i = 0; i < valid.length && discarded.length < excess; i += 1) {
          var card = removeCardFromHand(state, valid[i]);
          if (card) {
            discarded.push(card);
            discardCard(game, card);
          }
        }
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
        var pendingGuard = pendingChoiceGuard(game);
        if (pendingGuard) return pendingGuard;
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
        var pendingGuard = pendingChoiceGuard(game);
        if (pendingGuard) return pendingGuard;
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
        var pendingGuard = pendingChoiceGuard(game);
        if (pendingGuard) return pendingGuard;
        if (game.phase === 'gameover') return fail('游戏已经结束。');
        var ending = game.turn;
        return completeTurn(game, ending);
      }

      function playZhangbaSha(game, actor, cardIds) {
        var pendingGuard = pendingChoiceGuard(game);
        if (pendingGuard) return pendingGuard;
        var self = game[actor];
        cardIds = cardIds || [];
        if (!self) return fail('未知角色。');
        if (!hasEquipmentEffect(self, 'zhangbaTwoHandSha')) return fail('未装备【丈八蛇矛】。');
        if (self.usedSha && !canUseUnlimitedSha(self)) return fail('本回合已经使用过【杀】。');
        if (cardIds.length !== 2) return fail('需要选择两张手牌。');
        var first = removeCardFromHand(self, cardIds[0]);
        var second = removeCardFromHand(self, cardIds[1]);
        if (!first || !second) {
          if (first) putCard(game, first, { zone: 'hand', actor: actor });
          if (second) putCard(game, second, { zone: 'hand', actor: actor });
          return fail('选择的手牌不存在。');
        }
        discardCard(game, first);
        discardCard(game, second);
        // H1: virtual + physicalCards 标记 — 虚拟杀本身不进弃牌堆 (discardCard
        // 会跳过), 奸雄等"获得造成伤害的牌"改为获得这两张组成实体牌。
        var virtualSha = makeTestCard('sha', {
          id: 'zhangba-' + first.id + '-' + second.id,
          suit: first.suit,
          rank: first.rank,
          color: first.color,
          name: '丈八蛇矛杀',
          virtual: true,
          physicalCards: [first, second]
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
        // v8 PR-C1: 国色把方片当乐; v11 C3: 奇袭把黑牌当拆 — asType 白名单
        if (asType !== 'sha' && asType !== 'lebusishu' && asType !== 'guohe') {
          return fail('当前只支持转化为【杀】、【乐不思蜀】或【过河拆桥】。');
        }
        var cardAsContext = { mode: 'proactive', game: game, actor: actor, state: self, card: original, asType: asType };
        var conversion = selectCardAsConversion(SkillRuntime.runHook(skillRegistry, 'onCardAs', cardAsContext));
        if (!conversion) return fail('当前武将不能这样转化。');
        // 路径分支：杀 走原有 canPlayCard 检查；乐/拆 走各自虚拟卡检查
        if (asType === 'sha') {
          if (self.usedSha && !canUseUnlimitedSha(self)) return fail('本回合已经使用过【杀】。');
          var playableSha = canPlayCard(game, actor, virtualShaFromCard(original));
          if (!playableSha.ok) return playableSha;
          playableSha.skillName = conversion.skillName;
          playableSha.message = '发动【' + conversion.skillName + '】，将【' + original.name + '】当【杀】使用。';
          return playableSha;
        }
        if (asType === 'guohe') {
          // v11 C3: 奇袭 — 复用普通过河拆桥的 canPlayCard 检查
          // (对方两区皆空 / 回合与阶段限制在那里统一把关)。
          var playableGuohe = canPlayCard(game, actor, virtualGuoheFromCard(original));
          if (!playableGuohe.ok) return playableGuohe;
          playableGuohe.skillName = conversion.skillName;
          playableGuohe.message = '发动【' + conversion.skillName + '】，将【' + original.name + '】当【过河拆桥】使用。';
          return playableGuohe;
        }
        // lebusishu
        var playableLebu = canPlayCard(game, actor, virtualLebusishuFromCard(original));
        if (!playableLebu.ok) return playableLebu;
        playableLebu.skillName = conversion.skillName;
        playableLebu.message = '发动【' + conversion.skillName + '】，将【' + original.name + '】当【乐不思蜀】使用。';
        return playableLebu;
      }

      function playCardAs(game, actor, cardId, asType, options) {
        var pendingGuard = pendingChoiceGuard(game);
        if (pendingGuard) return pendingGuard;
        var self = game[actor];
        if (!self) return fail('未知角色。');
        var hit = findOwnCardById(self, cardId);
        if (!hit) return fail('找不到这张牌。');
        var original = hit.card;
        var playable = canPlayCardAs(game, actor, original, asType);
        if (!playable.ok) return playable;
        // Remove from whichever zone the source card lived in. The slot is
        // cleared if it came from equipment (relevant for 关羽 卸下武器当杀).
        removeOwnCardFromAnyZone(self, cardId, game);
        log(game, actorName(game, actor) + playable.message);
        if (asType === 'lebusishu') {
          // v8 PR-C1: 国色 把方片当乐。L3 (审计二轮): 与普通乐不思蜀一致走
          // delayed-place 无懈链 — 此前直接 push 判定区, 转化版乐无法被无懈。
          var virtualLebu = virtualLebusishuFromCard(original);
          return checkWuxieAndContinue(game, opponent(actor), '【乐不思蜀】', 'delayed-place', {
            actor: actor, card: virtualLebu, options: {}, delayedSide: opponent(actor)
          });
        }
        if (asType === 'guohe') {
          // v11 C3 (批次 27): 奇袭 黑牌当拆 — 与普通过河拆桥一致: 先弃置来源
          // 实体牌 (discardCard 经 physicalCardOf 落原牌), 再走无懈链 →
          // guohe continuation (1v1 两选项 pick / options.targetZone 照常)。
          var virtualGuohe = virtualGuoheFromCard(original);
          discardCard(game, virtualGuohe);
          return checkWuxieAndContinue(game, opponent(actor), '【过河拆桥】', 'guohe', {
            actor: actor, card: virtualGuohe, options: options || {}
          });
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

      // v11 C3 (批次 27): 奇袭把黑色牌视为过河拆桥 — 同上构造虚拟卡,
      // 弃置时经 physicalCardOf 落原实体牌, 不产生 guohe 型幻影牌。
      function virtualGuoheFromCard(original) {
        return {
          id: original.id,
          type: 'guohe',
          name: '过河拆桥',
          family: 'trick',
          suit: original.suit,
          color: original.color,
          rank: original.rank,
          physicalCard: original
        };
      }

      // v11 C4 (批次 28): 枚举一张牌当前可用的主动转化 (proactive card-as)。
      // UI 转化面板据此动态列按钮 — 新增 asType 时只需扩这张表,
      // 面板与 playerCardAction 无需再改。每项含 asType/asName/skillName/playable。
      var PROACTIVE_CARD_AS_TYPES = [
        { asType: 'sha', asName: '杀' },
        { asType: 'lebusishu', asName: '乐不思蜀' },
        { asType: 'guohe', asName: '过河拆桥' }
      ];

      function listCardConversions(game, actor, cardOrId) {
        var list = [];
        for (var i = 0; i < PROACTIVE_CARD_AS_TYPES.length; i += 1) {
          var entry = PROACTIVE_CARD_AS_TYPES[i];
          var playable = canPlayCardAs(game, actor, cardOrId, entry.asType);
          if (playable.ok) {
            list.push({ asType: entry.asType, asName: entry.asName, skillName: playable.skillName, playable: playable });
          }
        }
        return list;
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
        var pendingGuard = pendingChoiceGuard(game);
        if (pendingGuard) return pendingGuard;
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

      // v11 B1: AI 域拆分 — 评估/lookahead/runAITurn 整体迁往 ./ai.js,
      // 引擎闭包能力经 createAIRuntime 依赖注入; 公开 API 形状不变。
      var AIRuntime = createAIRuntime({
        success: success,
        fail: fail,
        playCard: playCard,
        playCardAs: playCardAs,
        canPlayCard: canPlayCard,
        canPlayCardAs: canPlayCardAs,
        // v11 C5 (批次 29): 锦囊类转化候选枚举 (国色/奇袭 AI 出牌决策)
        listCardConversions: listCardConversions,
        useSkill: useSkill,
        startTurn: startTurn,
        endTurn: endTurn,
        advancePhase: advancePhase,
        finishPlayPhase: finishPlayPhase,
        discardSelected: discardSelected,
        needsDiscard: needsDiscard,
        getDiscardCount: getDiscardCount,
        getHuogongChoice: getHuogongChoice
      });
      var scoreCardForAI = AIRuntime.scoreCardForAI;
      var aiEstimateShaCount = AIRuntime.aiEstimateShaCount;
      var aiEstimateShanCount = AIRuntime.aiEstimateShanCount;
      // v11 D1 (批次 33): 无懈期望值评估 (tricks 域经包装引用)
      var aiShouldUseWuxie = AIRuntime.aiShouldUseWuxie;
      var aiCloneGame = AIRuntime.aiCloneGame;
      var aiEvaluateState = AIRuntime.aiEvaluateState;
      var aiSimulateCardPlay = AIRuntime.aiSimulateCardPlay;
      var aiEvaluateStateWithThreat = AIRuntime.aiEvaluateStateWithThreat;
      var aiScoreCardWithLookahead = AIRuntime.aiScoreCardWithLookahead;
      var aiChooseCard = AIRuntime.aiChooseCard;
      var aiChooseSkillAction = AIRuntime.aiChooseSkillAction;
      var aiTakeAction = AIRuntime.aiTakeAction;
      var runAITurn = AIRuntime.runAITurn;

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
        listCardConversions: listCardConversions,
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
        aiShouldUseWuxie: aiShouldUseWuxie,
        aiScoreCardWithLookahead: aiScoreCardWithLookahead,
        // v8 PR-D4: threat-aware eval (考虑对方下回合威胁)
        aiEvaluateStateWithThreat: aiEvaluateStateWithThreat,
        runAITurn: runAITurn,
        opponent: opponent
      };

      if (typeof window !== 'undefined') {
        window.SanguoshaEngine = SanguoshaEngine;
      }
