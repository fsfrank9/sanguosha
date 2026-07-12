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
      import { createShaFlowRuntime } from './sha-flow.js';
      import { createEquipmentRuntime } from './equipment.js';
      import { createJudgeAreaRuntime } from './judge-area.js';
      import { installStandardSkillHandlers, PLAY_PHASE_ACTIVE_SKILLS } from './skills.js';
      import { HERO_CATALOG, HEROES } from '../data/heroes.js';
      import { CARD_CATALOG, CARD_INFO, PHASES } from '../data/cards.js';
      import { IMPLEMENTED_SKILL_IDS, ACTIVE_SKILL_IDS } from '../data/skill-status.js';
      import { IDENTITY_PRESETS, ROLE_SIDES } from '../data/identity.js';

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
      var seatList = StateRuntime.seatList;
      var aliveSeats = StateRuntime.aliveSeats;
      var nextSeat = StateRuntime.nextSeat;
      var seatsFrom = StateRuntime.seatsFrom;
      var resolveSeatOption = StateRuntime.resolveSeatOption;
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

      function randomSuit(game) {
        var suits = ['spade', 'heart', 'club', 'diamond'];
        var r = (game.random && typeof game.random === 'function') ? game.random() : Math.random();
        var idx = Math.floor(r * 4) % 4;
        if (idx < 0 || idx >= 4) idx = 0;
        return suits[idx];
      }

      // v11 B1: 装备穿/卸/失去时机与武器特效 (麒麟/寒冰/雌雄) 已迁往
      // ./equipment.js (见下方 EquipmentRuntime 装配)。

      function resumePlayShaAfterCixiong(game) {
        if (game.pauseState && game.pauseState.playSha) {
          var saved = game.pauseState.playSha;
          game.pauseState.playSha = null;
          return continueShaAfterCixiong(game, saved.actor, saved.card, saved.amount, saved.targetActor);
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
        continueTurnAfterJudgeArea: function (game, actor) { return continueTurnAfterJudgeArea(game, actor); },
        continueTurnAfterPreparePhase: function (game, actor) { return continueTurnAfterPreparePhase(game, actor); },
        // v12 H2: AOE 逐座席队列被濒死救援挂起后的续跑 (锦囊域后置装配, 包装注入)
        resumeAOETargets: function (game) { return TricksRuntime.advanceAOETargets(game); }
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
        isArmorIgnoredBySha: function (g, a, c) { return isArmorIgnoredBySha(g, a, c); },
        // v12 H5: 身份场死亡结算 — 击杀反贼摸三张 (奖惩) 需要摸牌能力
        drawCards: function (g, a, n) { return drawCards(g, a, n); }
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
        // v12 G2: 雷击 (张角) — "当你使用或打出【闪】时"统一派发点
        // (杀响应/万箭/银月各路径都经本函数消耗【闪】; 八卦视为打出的
        // 【闪】在 sha-flow.tryBaguaDodge 内另行派发)。
        if (type === 'shan') {
          SkillRuntime.runHook(skillRegistry, 'onShanUsed', { game: game, actor: actor });
        }
        // v8 PR-B4: 银月枪 — 回合外打出黑色手牌触发
        if (game.turn !== actor) {
          // v12 G2: 红颜 — 响应者 (小乔) 的黑桃牌视为红桃 → 不触发银月枪。
          var blackCards = response.extraCards && response.extraCards.length
            ? response.extraCards.filter(function (c) { return c && StateRuntime.effectiveCardColor(game[actor], c) === 'black'; })
            : (response.card && StateRuntime.effectiveCardColor(game[actor], response.card) === 'black' ? [response.card] : []);
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
        // v12 G2 复核修复: 与 consumeResponse 对称 — 红颜黑桃视为红桃。
        if (game.turn !== actor && StateRuntime.effectiveCardColor(game[actor], card) === 'black') {
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
        removeCardFromHand: function (s, id) { return removeCardFromHand(s, id); },
        removeFirstMatchingCard: function (s, p) { return removeFirstMatchingCard(s, p); },
        removeTargetZoneCard: function (g, t, z, id) { return removeTargetZoneCard(g, t, z, id); },
        scoreCardForAI: function (g, a, c) { return scoreCardForAI(g, a, c); },
        // v11 D1 (批次 33): AI 无懈期望值 — ai 域后置装配, 包装注入
        // v12 F5: 锦囊结算函数迁入所需能力 — 杀链域后置装配, 经闭包晚绑定
        tryBaguaDodge: function (g, t, i) { return tryBaguaDodge(g, t, i); },
        isArmorIgnoredBySha: function (g, a, c) { return isArmorIgnoredBySha(g, a, c); },
        listShanResponseOptions: function (st) { return listShanResponseOptions(st); },
        hasShanResponseAvailable: function (st) { return hasShanResponseAvailable(st); },
        playSha: function (g, a, c, o) { return playSha(g, a, c, o); },
        shaOptionForCard: shaOptionForCard,
        listShaResponseOptions: listShaResponseOptions,
        findResponseCard: findResponseCard,
        consumeResponse: consumeResponse,
        cardTargetProtection: cardTargetProtection,
        getTargetZoneCards: getTargetZoneCards,
        removeOwnCardFromAnyZone: removeOwnCardFromAnyZone,
        moveCard: moveCard,
        takeCard: takeCard,
        equipmentList: equipmentList,
        hasSkill: hasSkill,
        canReachWithSha: canReachWithSha,
        hasEquipmentEffect: hasEquipmentEffect,
        hasShaResponseAvailable: hasShaResponseAvailable,
        randomHandIndex: randomHandIndex,
        removeFirstCardOfType: removeFirstCardOfType,
        aiShouldUseWuxie: function (g, r, ch) { return aiShouldUseWuxie(g, r, ch); },
        // v12 H7: 主公技·激将/护驾 求助 (决斗需杀 / AOE 需杀·闪; 函数声明提升)
        tryLordAidSync: tryLordAidSync,
        lordAidPlayerCanAid: lordAidPlayerCanAid
      });
      var registerWuxieContinuation = TricksRuntime.registerWuxieContinuation;
      var listWuxieOptions = TricksRuntime.listWuxieOptions;
      var hasWuxieResponseAvailable = TricksRuntime.hasWuxieResponseAvailable;
      var checkWuxieAndContinue = TricksRuntime.checkWuxieAndContinue;
      var playDuel = TricksRuntime.playDuel;
      var advanceDuelChain = TricksRuntime.advanceDuelChain;
      var resolveDuelResponseChoice = TricksRuntime.resolveDuelResponseChoice;
      var playAOE = TricksRuntime.playAOE;
      var advanceAOETargets = TricksRuntime.advanceAOETargets;
      var resolveWanjianResponseChoice = TricksRuntime.resolveWanjianResponseChoice;
      var peekHuogongReveal = TricksRuntime.peekHuogongReveal;
      var getHuogongChoice = TricksRuntime.getHuogongChoice;
      var resolveJiedaoDecision = TricksRuntime.resolveJiedaoDecision;
      var resolveJiedaoDecisionChoice = TricksRuntime.resolveJiedaoDecisionChoice;
      var jiedaoFireOpponentSha = TricksRuntime.jiedaoFireOpponentSha;
      var resolveGuohe1v1 = TricksRuntime.resolveGuohe1v1;
      var resolveGuohe1v1PickChoice = TricksRuntime.resolveGuohe1v1PickChoice;
      var resolveWuguPickChoice = TricksRuntime.resolveWuguPickChoice;
      var processWuguPick = TricksRuntime.processWuguPick;
      var finishWugu = TricksRuntime.finishWugu;
      var duelShaRequired = TricksRuntime.duelShaRequired;
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
      // v12 F5: 杀结算链域 (playSha → 闪响应 → 八卦/贯石/雌雄 收尾) 整体迁往
      // ./sha-flow.js。装配于 equipment 回绑之后; scoreCardForAI 晚绑定包装
      // (AIRuntime 后置), 其余 deps 此时均已就绪。直调面回绑同名 var,
      // registerResponseKind 注册行与 PLAY_HANDLERS/导出表零文本改动。
      var ShaFlowRuntime = createShaFlowRuntime({
        log: log,
        fail: fail,
        success: success,
        damage: damage,
        discardCard: discardCard,
        drawCards: drawCards,
        moveCard: moveCard,
        removeCardFromHand: removeCardFromHand,
        removeOwnCardFromAnyZone: removeOwnCardFromAnyZone,
        consumeResponse: consumeResponse,
        findResponseCard: findResponseCard,
        requestPlayerResponse: requestPlayerResponse,
        setPendingChoice: setPendingChoice,
        cardTargetProtection: cardTargetProtection,
        applyCixiongOnDesignate: applyCixiongOnDesignate,
        applyWeaponHitEffects: applyWeaponHitEffects,
        restoreZhuqueIdentity: restoreZhuqueIdentity,
        physicalCardOf: physicalCardOf,
        markHandOrigin: markHandOrigin,
        // judge-area 域在杀链之后装配 — 经闭包晚绑定 (八卦/贯石判定运行时才用)
        judge: function (g, a, r, o) { return judge(g, a, r, o); },
        resolveJudgementCard: function (g, a, st, r, c) { return resolveJudgementCard(g, a, st, r, c); },
        skillRegistry: skillRegistry,
        scoreCardForAI: function (g, a, c) { return scoreCardForAI(g, a, c); },
        equipmentList: equipmentList,
        removeFirstCardOfType: removeFirstCardOfType,
        shanOptionForCard: shanOptionForCard,
        // v12 H7: 主公技·护驾 求助 (杀需闪; 函数声明提升)
        tryLordAidSync: tryLordAidSync,
        lordAidPlayerCanAid: lordAidPlayerCanAid
      });
      var playSha = ShaFlowRuntime.playSha;
      var continueShaAfterCixiong = ShaFlowRuntime.continueShaAfterCixiong;
      var resolveShaAfterResponse = ShaFlowRuntime.resolveShaAfterResponse;
      var tryBaguaDodge = ShaFlowRuntime.tryBaguaDodge;
      var listShanResponseOptions = ShaFlowRuntime.listShanResponseOptions;
      var hasShanResponseAvailable = ShaFlowRuntime.hasShanResponseAvailable;
      var shanRequiredAgainstSha = ShaFlowRuntime.shanRequiredAgainstSha;
      var isArmorIgnoredBySha = ShaFlowRuntime.isArmorIgnoredBySha;
      var resolveShanResponseChoice = ShaFlowRuntime.resolveShanResponseChoice;
      var resolveGuanshiDiscardChoice = ShaFlowRuntime.resolveGuanshiDiscardChoice;
      var applyGuanshiForcedHit = ShaFlowRuntime.applyGuanshiForcedHit;
      var defaultHostileTarget = ShaFlowRuntime.defaultHostileTarget;
      var normalizeSingleTarget = ShaFlowRuntime.normalizeSingleTarget;


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
      var applyHongyanJudgementView = JudgeAreaRuntime.applyHongyanJudgementView;
      var restoreHongyanJudgementView = JudgeAreaRuntime.restoreHongyanJudgementView;
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

      // v12 F1: 技能域函数群 (trigger/resolver/辅助 共 53 个) 已整体迁往
      // ./skills.js。装配点从文件头下移到 响应/判定/伤害 运行时就位之后,
      // deps 全部为已绑定引用 (scoreCardForAI 在 AIRuntime 之前, 经闭包晚绑定,
      // 与 tricks/judge-area 的既有包装先例一致)。直调面回绑同名 var, 使
      // registerResponseKind 注册块 / processPreparePhase / 导出表零改动。
      var SkillDomain = installStandardSkillHandlers(skillRegistry, {
        hasSkill: hasSkill,
        opponent: opponent,
        actorName: actorName,
        seatList: seatList,
        isShaType: isShaType,
        isShaCard: isShaCard,
        // v12 H7: 离间 — 虚拟决斗走无懈链 (tricks 域已装配, 直接引用)
        checkWuxieAndContinue: checkWuxieAndContinue,
        log: log,
        fail: fail,
        success: success,
        clone: clone,
        takeHandCard: takeHandCard,
        randomHandIndex: randomHandIndex,
        firstMatchingCard: firstMatchingCard,
        firstMatchingOwnCard: firstMatchingOwnCard,
        equipmentList: equipmentList,
        drawCards: drawCards,
        damage: damage,
        discardCard: discardCard,
        moveCard: moveCard,
        removeCardFromHand: removeCardFromHand,
        putCard: putCard,
        markHandOrigin: markHandOrigin,
        judge: judge,
        resolveJudgementCard: resolveJudgementCard,
        setPendingChoice: setPendingChoice,
        requestPlayerResponse: requestPlayerResponse,
        cardTargetProtection: cardTargetProtection,
        canReachWithSha: canReachWithSha,
        weaponRange: weaponRange,
        distanceBetween: distanceBetween,
        physicalCardOf: physicalCardOf,
        applyJudgeAreaOutcome: applyJudgeAreaOutcome,
        processJudgeArea: processJudgeArea,
        continueTurnAfterJudgeArea: continueTurnAfterJudgeArea,
        continueTurnAfterPreparePhase: continueTurnAfterPreparePhase,
        enterDying: enterDying,
        isNormalTrickCard: isNormalTrickCard,
        randomSuit: randomSuit,
        removeOwnCardFromAnyZone: removeOwnCardFromAnyZone,
        removeTargetZoneCard: removeTargetZoneCard,
        restoreZhuqueIdentity: restoreZhuqueIdentity,
        selectActiveSkillResult: selectActiveSkillResult,
        setPhase: setPhase,
        takeCard: takeCard,
        triggerEquipmentLoss: triggerEquipmentLoss,
        useSkill: useSkill,
        reshuffleIfNeeded: reshuffleIfNeeded,
        playSha: function (g, a, c, o) { return playSha(g, a, c, o); },
        applyHongyanJudgementView: applyHongyanJudgementView,
        restoreHongyanJudgementView: restoreHongyanJudgementView,
        handLimit: handLimit,
        CARD_INFO: CARD_INFO,
        scoreCardForAI: function (g, a, c) { return scoreCardForAI(g, a, c); }
      });
      var triggerGuanxingPreview = SkillDomain.triggerGuanxingPreview;
      var triggerShensuPrepare = SkillDomain.triggerShensuPrepare;
      var resolveShensuOptionsChoice = SkillDomain.resolveShensuOptionsChoice;
      var resolveGuidaoReplaceChoice = SkillDomain.resolveGuidaoReplaceChoice;
      var triggerLuoshenPrepare = SkillDomain.triggerLuoshenPrepare;
      var getGuanxingPreview = SkillDomain.getGuanxingPreview;
      var resolveFankuiPickChoice = SkillDomain.resolveFankuiPickChoice;
      var resolveYaowuRewardChoice = SkillDomain.resolveYaowuRewardChoice;
      var resolveGanglieFireChoice = SkillDomain.resolveGanglieFireChoice;
      var resolveGanglieSourceChoice = SkillDomain.resolveGanglieSourceChoice;
      var resolveFanjianGuessChoice = SkillDomain.resolveFanjianGuessChoice;
      var resolveGuanxingChoice = SkillDomain.resolveGuanxingChoice;
      var resolveYijiDistributeChoice = SkillDomain.resolveYijiDistributeChoice;
      var resolveGuicaiReplaceChoice = SkillDomain.resolveGuicaiReplaceChoice;
      var resolveLuoshenContinueChoice = SkillDomain.resolveLuoshenContinueChoice;

      // 注册表迁移收官: 把原 resolvePendingChoice 内的 15 个手写 if 分支统一
      // 注册到 RESPONSE_KIND_RESOLVERS, 与 V3-V6 已迁移的 response kind 同走
      // 一套 dispatcher。resolver 签名 (game, pending, decision), 各自负责清理
      // 对应 pauseState (失败时可重设 game.pendingChoice 以重试)。
      registerResponseKind('guicai-replace', resolveGuicaiReplaceChoice);
      // v12 G2: 鬼道 (鬼才同构改判) 与 神速 (回合开始选项)
      registerResponseKind('guidao-replace', resolveGuidaoReplaceChoice);
      registerResponseKind('shensu-options', resolveShensuOptionsChoice);
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

      // ───── v12 H7: 主公技·激将/护驾 求助框架 ─────
      // 主公需要打出【杀】(激将, 蜀) / 【闪】(护驾, 魏) 而自身打不出时,
      // 依座次询问其他同势力座席代打。AI 代打者按阵营立场同步决定
      // (tryLordAidSync); 玩家代打者由调用点挂起询问 (lordAidPlayerCanAid
      // 判定 + 'jijiang-aid'/'hujia-aid' pendingChoice)。1v1 中主公没有
      // 同势力队友 (对手必敌对), 全部路径为 no-op — 行为零回归。
      var LORD_AID_SPECS = {
        jijiang: { camp: '蜀', type: 'sha', label: '激将' },
        hujia: { camp: '魏', type: 'shan', label: '护驾' }
      };

      function lordAidEnabled(game, lordActor, skillId) {
        var spec = LORD_AID_SPECS[skillId];
        var lordState = game[lordActor];
        return !!(spec && lordState && lordState.hp > 0 && hasSkill(lordState, skillId)
          && game.roles && game.roles[lordActor] === '主公'
          && !(lordState.skillPreferences && lordState.skillPreferences[skillId] === 'decline'));
      }

      // 可代打座席: 同势力 + 存活 + 与主公同阵营 (身份信息缺失不代打)。
      function lordAidAiderSeats(game, lordActor, skillId) {
        var spec = LORD_AID_SPECS[skillId];
        return seatsFrom(game, lordActor, false).filter(function (seat) {
          var state = game[seat];
          return state && state.hp > 0 && state.camp === spec.camp
            && StateRuntime.sideOf(game, seat) !== null
            && !StateRuntime.isHostileSeat(game, seat, lordActor);
        });
      }

      // 同步路径: AI 座席依座次代为"打出" (经 consumeResponse, 支持武圣/
      // 龙胆等转化)。玩家座席跳过 — 不擅动玩家手牌, 由挂起询问路径处理。
      function tryLordAidSync(game, lordActor, skillId, reason) {
        if (!lordAidEnabled(game, lordActor, skillId)) return false;
        var spec = LORD_AID_SPECS[skillId];
        var aiders = lordAidAiderSeats(game, lordActor, skillId);
        for (var aidIdx = 0; aidIdx < aiders.length; aidIdx += 1) {
          var aider = aiders[aidIdx];
          if (aider === 'player') continue;
          if (consumeResponse(game, aider, spec.type, reason + '（' + spec.label + '）')) {
            log(game, actorName(game, aider) + '响应【' + spec.label + '】，代'
              + actorName(game, lordActor) + '打出' + (spec.type === 'sha' ? '【杀】' : '【闪】') + '。');
            return true;
          }
        }
        return false;
      }

      // 玩家是否应被挂起询问代打 (AI 主公 + 玩家为可代打者 + 有牌可代)。
      function lordAidPlayerCanAid(game, lordActor, skillId) {
        if (lordActor === 'player' || !lordAidEnabled(game, lordActor, skillId)) return false;
        var spec = LORD_AID_SPECS[skillId];
        if (lordAidAiderSeats(game, lordActor, skillId).indexOf('player') < 0) return false;
        var player = game.player;
        if (player.skillPreferences && player.skillPreferences[skillId + 'Aid'] === 'decline') return false;
        return spec.type === 'sha' ? hasShaResponseAvailable(player) : hasShanResponseAvailable(player);
      }

      // v12 H7: 激将 — 玩家决定是否代 AI 主公打出【杀】。挂起来源:
      // pauseState.lordAidAOE (南蛮逐席) / pauseState.duelChain (决斗)。
      // 拒绝后 AI 同势力座席接力; 仍不足按原路径受伤。
      function resolveJijiangAidChoice(game, pending, decision) {
        var lordActor = pending.lordActor;
        var wantsAid = !!(decision && (decision.cardId || decision.use));
        var aoeSaved = game.pauseState && game.pauseState.lordAidAOE;
        if (aoeSaved) {
          game.pauseState.lordAidAOE = null;
          var aoePaid = false;
          if (wantsAid) {
            aoePaid = consumeResponse(game, 'player', 'sha', '【' + aoeSaved.title + '】（激将）', decision.cardId || null);
            if (aoePaid) log(game, actorName(game, 'player') + '响应【激将】，代' + actorName(game, lordActor) + '打出【杀】。');
          }
          if (!aoePaid) aoePaid = tryLordAidSync(game, lordActor, 'jijiang', '【' + aoeSaved.title + '】');
          if (aoePaid) {
            log(game, actorName(game, lordActor) + '成功化解【' + aoeSaved.title + '】。');
          } else {
            damage(game, lordActor, 1, aoeSaved.sourceActor, '【' + aoeSaved.title + '】', aoeSaved.card);
          }
          if (game.pauseState.aoe && !game.pendingChoice && game.phase !== 'gameover') {
            return advanceAOETargets(game);
          }
          if (game.pauseState.aoe && game.phase === 'gameover') game.pauseState.aoe = null;
          return success('【' + aoeSaved.title + '】响应完成。');
        }
        var chain = game.pauseState && game.pauseState.duelChain;
        if (!chain) return fail('找不到【激将】的挂起来源。');
        var duelFoeOfLord = lordActor === chain.starterActor ? chain.targetActor : chain.starterActor;
        var paid = false;
        if (wantsAid) {
          paid = consumeResponse(game, 'player', 'sha', chain.reason + '（激将）', decision.cardId || null);
          if (paid) {
            log(game, actorName(game, 'player') + '响应【激将】，代' + actorName(game, lordActor) + '打出【杀】。');
            chain.aidPaid += 1;
          }
        }
        if (!paid) {
          while (chain.aidPaid < chain.aidNeeded && tryLordAidSync(game, lordActor, 'jijiang', chain.reason)) {
            chain.aidPaid += 1;
          }
        }
        if (chain.aidPaid >= chain.aidNeeded) {
          chain.aidPaid = null;
          chain.aidNeeded = null;
          chain.currentResponder = duelFoeOfLord;
          return advanceDuelChain(game);
        }
        // 无双第二张: 玩家刚代打一张且仍有杀可代 → 再次询问
        if (paid && hasShaResponseAvailable(game.player)) {
          return requestPlayerResponse(game, {
            kind: 'jijiang-aid',
            actor: 'player',
            pauseKey: 'duelChain',
            source: chain,
            options: listShaResponseOptions(game.player),
            meta: { lordActor: lordActor, reason: chain.reason, aidSkill: 'jijiang' },
            logMessage: '等待' + actorName(game, 'player') + '决定是否再代打一张【杀】（无双）。',
            statusMessage: '等待玩家护主响应。'
          });
        }
        if (chain.aidNeeded > 1) {
          log(game, '【无双】锁定：' + actorName(game, lordActor) + '未能凑齐两张【杀】。');
        }
        chain.aidPaid = null;
        chain.aidNeeded = null;
        game.pauseState.duelChain = null;
        damage(game, lordActor, 1, duelFoeOfLord, chain.reason, chain.card);
        return success('决斗结算完成。');
      }

      // v12 H7: 护驾 — 玩家决定是否代 AI 主公打出【闪】。挂起来源:
      // pauseState.lordAidAOE (万箭逐席) / pauseState.shaResponse (杀需闪)。
      function resolveHujiaAidChoice(game, pending, decision) {
        var lordActor = pending.lordActor;
        var wantsAid = !!(decision && (decision.cardId || decision.use));
        var aoeSaved = game.pauseState && game.pauseState.lordAidAOE;
        if (aoeSaved) {
          game.pauseState.lordAidAOE = null;
          var aoePaid = false;
          if (wantsAid) {
            aoePaid = consumeResponse(game, 'player', 'shan', '【' + aoeSaved.title + '】（护驾）', decision.cardId || null);
            if (aoePaid) log(game, actorName(game, 'player') + '响应【护驾】，代' + actorName(game, lordActor) + '打出【闪】。');
          }
          if (!aoePaid) aoePaid = tryLordAidSync(game, lordActor, 'hujia', '【' + aoeSaved.title + '】');
          if (aoePaid) {
            log(game, actorName(game, lordActor) + '成功化解【' + aoeSaved.title + '】。');
          } else {
            damage(game, lordActor, 1, aoeSaved.sourceActor, '【' + aoeSaved.title + '】', aoeSaved.card);
          }
          if (game.pauseState.aoe && !game.pendingChoice && game.phase !== 'gameover') {
            return advanceAOETargets(game);
          }
          if (game.pauseState.aoe && game.phase === 'gameover') game.pauseState.aoe = null;
          return success('【' + aoeSaved.title + '】响应完成。');
        }
        var saved = game.pauseState && game.pauseState.shaResponse;
        if (!saved) return fail('找不到【护驾】的挂起来源。');
        game.pauseState.shaResponse = null;
        var remaining = saved.shanRemaining || 1;
        if (wantsAid && consumeResponse(game, 'player', 'shan', '【杀】（护驾）', decision.cardId || null)) {
          log(game, actorName(game, 'player') + '响应【护驾】，代' + actorName(game, lordActor) + '打出【闪】。');
          remaining -= 1;
        }
        // 剩余需求 (无双第二张等) 由 AI 同势力座席接力; 玩家只询问一次。
        while (remaining > 0 && tryLordAidSync(game, lordActor, 'hujia', '【杀】')) {
          remaining -= 1;
        }
        return resolveShaAfterResponse(game, saved.actor, saved.card, saved.amount, remaining <= 0, saved.targetActor);
      }

      registerResponseKind('jijiang-aid', resolveJijiangAidChoice);
      registerResponseKind('hujia-aid', resolveHujiaAidChoice);

      function newGame(options) {
        options = options || {};
        var random = makeRng(options.seed || Date.now());
        var seats = (options.seats && options.seats.length ? options.seats.slice() : ['player', 'enemy']);
        var roles = options.roles ? clone(options.roles) : {
          player: options.playerRole || '主公',
          enemy: options.enemyRole || '反贼'
        };
        if (seats.length >= 3 && !options.roles) {
          // v12 H5: 按身份预设逐席分配 (座次顺序即预设顺序, 首位主公)。
          var preset = IDENTITY_PRESETS[seats.length] || IDENTITY_PRESETS[3];
          roles = {};
          for (var ri = 0; ri < seats.length; ri += 1) {
            roles[seats[ri]] = options[seats[ri] + 'Role'] || preset[ri] || '反贼';
          }
        }
        var firstActor = options.firstActor || firstActorFromRoles(roles, seats[0] || 'player');
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
          seats: seats,
          firstActor: firstActor,
          mode: seats.length >= 3 ? 'identity3' : 'duel',
          // v12 H5: 身份→阵营映射随局携带 (胜负判定/内奸预留)。
          roleSides: clone(ROLE_SIDES),
          player: makePlayer(clone(HERO_CATALOG[options.playerHero] || HEROES.player)),
          enemy: makePlayer(clone(HERO_CATALOG[options.enemyHero] || HEROES.enemy))
        };
        for (var si = 0; si < seats.length; si += 1) {
          var seat = seats[si];
          if (!game[seat]) {
            var heroKey = options[seat + 'Hero'];
            game[seat] = makePlayer(clone(HERO_CATALOG[heroKey] || HEROES.enemy));
          }
        }
        game.deck = buildDeck(game, random);
        seatList(game).forEach(function (seat) { drawCards(game, seat, 4); });
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
        // v12 H1: 目标保护检查泛化为 ∃-无保护座席 — 全部其他座席均被
        // "不能成为目标"类技能 (谦逊/空城/同疾) 保护时才拒绝, 以首个保护
        // 原因回话 (1v1 单候选 → 与旧版逐字一致)。
        var otherSeats = aliveSeats(game).filter(function (seat) { return seat !== actor; });
        var protectionBlock = null;
        var unprotectedSeats = otherSeats.filter(function (seat) {
          var prot = cardTargetProtection(game, actor, seat, card);
          if (prot && !protectionBlock) protectionBlock = prot;
          return !prot;
        });
        if (otherSeats.length && !unprotectedSeats.length && protectionBlock) return fail(protectionBlock.message);
        // v7 PR-10/11: 1V1 顺手牵羊 / 兵粮寸断 都已取消距离限制 — v12 H3:
        // 该变体仅限 duel 模式; identity3 恢复官方距离 ≤1 (trickDistanceLimited)。
        if (isShaCard(card) && !legalTargetsForCard(game, actor, card).some(function (seat) { return seat !== actor; })) return fail('距离不足，当前武器范围无法使用【杀】。');
        if (isShaCard(card) && self.usedSha && !canUseUnlimitedSha(self)) return fail('本回合已经使用过【杀】。');
        if (card.type === 'tao') {
          // v7 PR-1: gltjk 基本牌·桃 使用方法Ⅰ —— 使用目标"包括你在内的一名已受伤的角色"。
          // v12 H1: 任一存活座席受伤即可出【桃】；全员满血则无合法目标。
          var taoAnyWounded = aliveSeats(game).some(function (seat) {
            return game[seat].hp < game[seat].maxHp;
          });
          if (!taoAnyWounded) return fail('体力已满，不能使用【桃】。');
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
        if ((card.type === 'guohe' || card.type === 'shunshou')
            && !otherSeats.some(function (seat) { return hasAnyTargetableCard(game[seat]); })) {
          return fail('对方没有可操作的牌。');
        }
        // v7 PR-9: gltjk card__scroll.md 过河拆桥 (1V1) — "你选择一项：
        // 1.弃置目标角色的装备区里的一张牌；2.观看目标角色的手牌并弃置其中一张牌。"
        // 1V1 变体不允许选判定区；若目标只有判定区有牌而无手牌/装备 → 无合法行动，拒绝。
        if (card.type === 'guohe') {
          var guoheAnyPickable = otherSeats.some(function (seat) {
            return (game[seat].hand || []).length > 0 || equipmentList(game[seat]).length > 0;
          });
          if (!guoheAnyPickable) {
            return fail('1V1【过河拆桥】只能弃对手装备区或手牌；对方两者皆空。');
          }
        }
        // v12 H3: identity3 顺手牵羊距离 ≤1 — 有牌座席均在距离外时拒绝。
        if (card.type === 'shunshou' && trickDistanceLimited(game)
            && !legalTargetsForCard(game, actor, card).length) {
          return fail('距离不足，无法使用【顺手牵羊】。');
        }
        // v7 PR-6: gltjk flow__condition.md 共同合法性: "判定区里有延时类锦囊
        // 牌的角色不是使用同名延时类锦囊牌的合法目标"。乐 / 兵 → 其他座席；
        // 闪电 → self。v12 H1: ∃-合法目标化 (identity3 兵粮另受距离 ≤1 约束)。
        if (card.family === 'delayed') {
          var delayedCandidates = legalTargetsForCard(game, actor, card);
          if (!delayedCandidates.length) {
            if (card.type === 'bingliang' && trickDistanceLimited(game)
                && otherSeats.some(function (seat) {
                  return !(game[seat].judgeArea || []).some(function (judge) { return judge && judge.type === card.type; });
                })) {
              return fail('距离不足，无法使用【兵粮寸断】。');
            }
            var delayedDefault = card.type === 'shandian' ? actor : (otherSeats[0] || actor);
            return fail(actorName(game, delayedDefault) + '的判定区已有【' + card.name + '】，不能再放置同名延时锦囊。');
          }
        }
        if (card.type === 'jiedao') {
          // v7 PR-5: gltjk card__scroll.md 注 — 借刀杀人 两次合法性检测，
          // 第一次在 "选择 An 为目标的同时选择 Bn"。v12 H1: An = 任一有武器
          // 座席 (缺省 1v1 对手)，Bn = An 攻击范围内可指定座席 (缺省使用者)。
          // canPlayCard 阶段（第一次合法性检测）做 ∃-检查 (1v1 信息逐字不变):
          //   1) ∃ An 装备区有武器；2) ∃ An 武器范围覆盖某 Bn；
          //   3) 该 Bn 不被 onCardTarget 钩子拒绝（如【谦逊】等）。
          // 装备效果（仁王盾/藤甲）属于"对该牌无效"而非"非合法目标"，且不知
          // An 的具体 杀 颜色，放到 resolveJiedaoDecision 第二次检测中再判。
          var jiedaoHolders = otherSeats.filter(function (seat) {
            return game[seat].equipment && game[seat].equipment.weapon;
          });
          if (!jiedaoHolders.length) return fail('目标没有武器，无法发动【借刀杀人】。');
          var jiedaoReachable = jiedaoHolders.filter(function (holder) {
            return aliveSeats(game).some(function (victim) {
              return victim !== holder && canReachWithSha(game, holder, victim);
            });
          });
          if (!jiedaoReachable.length) {
            return fail('目标武器范围内没有合法的【杀】目标，无法发动【借刀杀人】。');
          }
          var jiedaoUsable = jiedaoReachable.filter(function (holder) {
            return jiedaoVictimCandidates(game, holder).length > 0;
          });
          if (!jiedaoUsable.length) {
            return fail('目标无法对你使用【杀】，无法发动【借刀杀人】。');
          }
        }
        return success('可以使用。');
      }

      // v12 H3: 距离规则模式开关 — identity3 恢复官方 顺手牵羊/兵粮寸断
      // 距离 ≤1; duel (1v1) 保持 v7 变体无距离限制 (既有行为/测试不变)。
      function trickDistanceLimited(game) {
        return !!(game && game.mode === 'identity3');
      }

      // v12 H1: 借刀杀人 Bn (受害者) 候选 — 在武器持有者攻击范围内且不被
      // "不能成为目标"类技能保护的其他座席; 1v1 恒为 [使用者本人]。
      function jiedaoVictimCandidates(game, holderSeat) {
        return aliveSeats(game).filter(function (victim) {
          if (victim === holderSeat) return false;
          return canReachWithSha(game, holderSeat, victim)
            && !cardTargetProtection(game, holderSeat, victim, { type: 'sha', name: '杀' }, '杀');
        });
      }

      // v12 H1: 全牌类座席级合法目标矩阵 — canPlayCard 的 ∃-目标检查与
      // playCard 显式 options.target 校验共用。"可指定但可能无效果" (火攻
      // 空手牌目标等) 沿用 1v1 变体语义, 不在此处收紧。
      function isLegalCardTarget(game, actor, card, seat) {
        if (!card || !game[seat]) return false;
        var seatState = game[seat];
        if (typeof seatState.hp !== 'number' || seatState.hp <= 0) return false;
        if (seat === actor) {
          // 自指: 桃 (已受伤) / 无中生有 / 闪电 (判定区无同名)
          if (card.type === 'tao') return seatState.hp < seatState.maxHp;
          if (card.type === 'wuzhong') return true;
          if (card.type === 'shandian') {
            return !(seatState.judgeArea || []).some(function (judge) { return judge && judge.type === 'shandian'; });
          }
          return false;
        }
        if (isShaCard(card)) return canReachWithSha(game, actor, seat) && !cardTargetProtection(game, actor, seat, card, '杀');
        if (card.type === 'tao') return seatState.hp < seatState.maxHp;
        if (card.type === 'wuzhong') return true;
        if (card.type === 'shandian') return false; // 闪电只对自己使用
        if (card.type === 'lebusishu' || card.type === 'bingliang') {
          if ((seatState.judgeArea || []).some(function (judge) { return judge && judge.type === card.type; })) return false;
          if (card.type === 'bingliang' && trickDistanceLimited(game) && distanceBetween(game, actor, seat) > 1) return false;
          return !cardTargetProtection(game, actor, seat, card);
        }
        if (card.type === 'guohe') {
          if (!(seatState.hand || []).length && !equipmentList(seatState).length) return false;
          return !cardTargetProtection(game, actor, seat, card);
        }
        if (card.type === 'shunshou') {
          if (!hasAnyTargetableCard(seatState)) return false;
          if (trickDistanceLimited(game) && distanceBetween(game, actor, seat) > 1) return false;
          return !cardTargetProtection(game, actor, seat, card);
        }
        if (card.type === 'jiedao') {
          if (!seatState.equipment || !seatState.equipment.weapon) return false;
          if (cardTargetProtection(game, actor, seat, card)) return false;
          return jiedaoVictimCandidates(game, seat).length > 0;
        }
        // 决斗/火攻等: 任意其他存活座席 (受目标保护约束)
        return !cardTargetProtection(game, actor, seat, card);
      }

      function legalTargetsForCard(game, actor, card) {
        return aliveSeats(game).filter(function (seat) {
          return isLegalCardTarget(game, actor, card, seat);
        });
      }

      // v12 H1: 单目标锦囊 playCard 时的目标解析 — options.target 显式指定
      // (须为矩阵合法目标, 否则返回 null 由调用方拒绝且牌不离手); 缺省回退
      // 1v1 对手, 对手非法时取首个合法座席 (canPlayCard 已保证存在)。
      // v12 H5: 缺省池先取敌对座席 (阵营感知, AI 缺省目标不误伤友方);
      // 1v1 双方异阵营, 池恒为 [对手], 行为不变。
      function resolveTrickTargetActor(game, actor, card, options) {
        var requested = options && (options.target || (options.targets && options.targets[0]));
        if (requested) {
          var seat = resolveSeatOption(game, requested);
          if (!seat || seat === actor || !isLegalCardTarget(game, actor, card, seat)) return null;
          return seat;
        }
        var candidates = legalTargetsForCard(game, actor, card).filter(function (seat) { return seat !== actor; });
        var hostileCandidates = candidates.filter(function (seat) {
          return StateRuntime.isHostileSeat(game, actor, seat);
        });
        var pool = hostileCandidates.length ? hostileCandidates : candidates;
        return pool.indexOf(opponent(actor)) >= 0 ? opponent(actor) : (pool[0] || null);
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

      registerResponseKind('guanshi-discard', resolveGuanshiDiscardChoice);

      // v10 V3: 注册到 response framework. UI 通过 resolvePendingChoice 或
      // resolveResponseChoice 调过来时, 此 fn 拿 pauseState.shaResponse + decision
      // 决定 dodged, 再走 resolveShaAfterResponse 共享后续结算.
      registerResponseKind('shan-response', resolveShanResponseChoice);

      registerResponseKind('sha-duel-response', resolveDuelResponseChoice);

      registerResponseKind('wanjian-response', resolveWanjianResponseChoice);

      function playCard(game, actor, cardId, options) {
        var pendingGuard = pendingChoiceGuard(game);
        if (pendingGuard) return pendingGuard;
        var self = game[actor];
        options = options || {};
        if (!self) return fail('未知角色。');
        var card = self.hand.find(function (item) { return item.id === cardId; });
        var playable = canPlayCard(game, actor, card);
        if (!playable.ok) return playable;
        // v12 H1: 区域/成本预校验对齐显式目标 (缺省 1v1 对手)。
        if (card && (card.type === 'guohe' || card.type === 'shunshou') && (options.targetZone || options.targetCardId)) {
          var zoneTargetActor = resolveTrickTargetActor(game, actor, card, options) || opponent(actor);
          var requestedZone = options.targetZone || defaultTargetZone(game[zoneTargetActor]);
          var targetChoices = getTargetZoneCards(game, zoneTargetActor, requestedZone);
          if (!targetChoices.length) return fail('目标区域没有可操作的牌。');
          if (options.targetCardId && !targetChoices.some(function (entry) { return entry.card.id === options.targetCardId; })) {
            return fail('指定的目标牌不存在。');
          }
        }
        if (card && card.type === 'huogong' && options.huogongCostCardId) {
          var huogongChoice = getHuogongChoice(game, actor, resolveTrickTargetActor(game, actor, card, options));
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
        return playSha(game, actor, card, options);
      }

      function playEquipmentCardHandler(game, actor, card, options, self) {
        return equipCard(game, actor, card);
      }

      function playDelayedCardHandler(game, actor, card, options, self) {
          // H1: 延时锦囊放置前开无懈窗口 (gltjk card__scroll.md — 无懈可击可在
          // 锦囊「对一个目标生效前」抵消; 延时锦囊于放置时即指定目标)。
          // v12 H1: 乐/兵 经 options.target 显式指定 (缺省 1v1 对手); 闪电恒
          // 对自己。无懈首询者 = 目标 (队列自动跳过来源, 1v1 恒为对方)。
          var delayedSide;
          if (card.type === 'shandian') {
            delayedSide = actor;
          } else {
            delayedSide = resolveTrickTargetActor(game, actor, card, options);
            if (!delayedSide) {
              putCard(game, card, { zone: 'hand', actor: actor });
              return fail('无效的【' + card.name + '】目标。');
            }
          }
          return checkWuxieAndContinue(game, delayedSide, '【' + card.name + '】', 'delayed-place', {
            actor: actor, card: card, options: options, delayedSide: delayedSide
          });
      }

      function playTaoCardHandler(game, actor, card, options, self) {
          // v7 PR-1: 目标"包括你在内的一名已受伤的角色"。options.taoTarget /
          // options.target 可指定任意座席 (v12 H1: resolveSeatOption 校验);
          // 未指定时默认为发动者，若发动者满血则回退到首个受伤座席
          // (1v1 即对手, 保持 canPlayCard 已放行的合法性)。
          var requestedTaoTarget = resolveSeatOption(game, options.taoTarget || options.target);
          var taoTargetActor;
          if (requestedTaoTarget) {
            taoTargetActor = requestedTaoTarget;
          } else if (self.hp < self.maxHp) {
            taoTargetActor = actor;
          } else {
            taoTargetActor = aliveSeats(game).filter(function (seat) {
              return seat !== actor && game[seat].hp < game[seat].maxHp;
            })[0] || opponent(actor);
          }
          var taoTargetState = game[taoTargetActor];
          if (!taoTargetState || taoTargetState.hp >= taoTargetState.maxHp) {
            // v12 H1 修复: 拒绝时把牌放回手牌 (此前 playCard 已摘牌, 直接
            // fail 会让实体牌凭空消失 — 守恒红线)。
            putCard(game, card, { zone: 'hand', actor: actor });
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
          //   "使用目标: 包括你在内的一名角色"。options.wuzhongTarget /
          //   options.target 可指定任意座席 (v12 H1: resolveSeatOption 校验,
          //   无效值静默回退 actor — 与旧字面量白名单行为一致); 缺省 = actor。
          // H1: 摸牌前开无懈窗口。v12 H2: 首询者 = 目标 (队列跳过来源)。
          discardCard(game, card);
          var wzTargetActor = resolveSeatOption(game, options.wuzhongTarget || options.target) || actor;
          log(game, actorName(game, actor) + '使用【无中生有】' + (wzTargetActor === actor ? '' : '令' + actorName(game, wzTargetActor)) + '。');
          var wzResponder = wzTargetActor === actor ? opponent(actor) : wzTargetActor;
          return checkWuxieAndContinue(game, wzResponder, '【无中生有】', 'wuzhong', {
            actor: actor, card: card, options: options, wzTargetActor: wzTargetActor
          });
      }

      function playJuedouCardHandler(game, actor, card, options, self) {
          // v10 V5: 走无懈链框架. WUXIE_CONTINUATIONS['juedou'] 注册在 trick 区下方.
          // v12 H1: options.target 显式目标 (缺省 1v1 对手), 无懈首询者 = 目标。
          var duelTargetActor = resolveTrickTargetActor(game, actor, card, options);
          if (!duelTargetActor) {
            putCard(game, card, { zone: 'hand', actor: actor });
            return fail('无效的【决斗】目标。');
          }
          return checkWuxieAndContinue(game, duelTargetActor, '【决斗】', 'juedou', {
            actor: actor, card: card, options: options, targetActor: duelTargetActor
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
          // v10 V5: 走无懈链框架. v12 H1: options.target 显式目标。
          var ghTargetActor = resolveTrickTargetActor(game, actor, card, options);
          if (!ghTargetActor) {
            putCard(game, card, { zone: 'hand', actor: actor });
            return fail('无效的【过河拆桥】目标。');
          }
          discardCard(game, card);
          return checkWuxieAndContinue(game, ghTargetActor, '【过河拆桥】', 'guohe', {
            actor: actor, card: card, options: options, targetActor: ghTargetActor
          });
      }

      function playShunshouCardHandler(game, actor, card, options, self) {
          // v10 V5: 走无懈链框架. v12 H1: options.target 显式目标
          // (identity3 距离 ≤1 经 isLegalCardTarget 约束)。
          var ssTargetActor = resolveTrickTargetActor(game, actor, card, options);
          if (!ssTargetActor) {
            putCard(game, card, { zone: 'hand', actor: actor });
            return fail('无效的【顺手牵羊】目标。');
          }
          discardCard(game, card);
          return checkWuxieAndContinue(game, ssTargetActor, '【顺手牵羊】', 'shunshou', {
            actor: actor, card: card, options: options, targetActor: ssTargetActor
          });
      }

      function playTaoyuanCardHandler(game, actor, card, options, self) {
          discardCard(game, card);
          // v7 PR-2 + H1b: gltjk card__scroll.md "对未受伤的角色无效"; 多角色
          // 结算顺序从发动者起逆时针 = [actor, opponent]。H1b: 每名受伤目标各
          // 自独立开无懈窗口 (无懈只抵消「对一个目标」的效果, 双方都受伤时各
          // 自可被无懈)。未受伤角色不是目标, 不开窗。
          log(game, actorName(game, actor) + '使用【桃园结义】。');
          // v12 H2: 结算顺序泛化为座次环 (发动者起顺时针含自身); 1v1 恒为
          // [actor, opponent(actor)]。
          var taoyuanTargets = StateRuntime.seatsFrom(game, actor, true).filter(function (side) {
            var s = game[side];
            return s && s.hp > 0 && s.hp < s.maxHp;
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
          // 多角色结算顺序原则：从当前回合角色起按行动顺序 → 座次环
          // (v12 H2: seatsFrom 泛化; 1v1 恒为 [actor, opponent(actor)])
          return finishTrickUse(game, actor, card, processWuguPick(game, actor, card, wuguPool, StateRuntime.seatsFrom(game, actor, true).filter(function (side) { return game[side] && game[side].hp > 0; }), 0, options), options);
      }

      function playHuogongCardHandler(game, actor, card, options, self) {
          // v10 V5: 走无懈链框架. 后续 huogong 流程移到 WUXIE_CONTINUATIONS['huogong'].
          // v12 H1: options.target 显式目标。
          var hgTargetActor = resolveTrickTargetActor(game, actor, card, options);
          if (!hgTargetActor) {
            putCard(game, card, { zone: 'hand', actor: actor });
            return fail('无效的【火攻】目标。');
          }
          discardCard(game, card);
          return checkWuxieAndContinue(game, hgTargetActor, '【火攻】', 'huogong', {
            actor: actor, card: card, options: options, targetActor: hgTargetActor
          });
      }

      function playTiesuoCardHandler(game, actor, card, options, self) {
          discardCard(game, card);
          if (options.mode === 'recast') {
            log(game, actorName(game, actor) + '重铸【铁索连环】，摸一张牌。');
            drawCards(game, actor, 1);
            return success('铁索连环重铸完成。');
          }
          // v12 H1: 目标座席经 resolveSeatOption 校验 (任意存活座席, 至多 2 名)。
          var targets = Array.from(options.targets || [opponent(actor)]).filter(function (side, index, array) {
            return resolveSeatOption(game, side) && game[side].hp > 0 && array.indexOf(side) === index;
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
          // v10 V5: 走无懈链框架. v12 H1: An = options.target (缺省 1v1 对手),
          // Bn = options.jiedaoVictim (缺省使用者本人, 与 1v1 旧行为一致)。
          var holderActor = resolveTrickTargetActor(game, actor, card, options);
          if (!holderActor) {
            putCard(game, card, { zone: 'hand', actor: actor });
            return fail('无效的【借刀杀人】目标。');
          }
          var victimActor = resolveSeatOption(game, options.jiedaoVictim) || actor;
          if (victimActor === holderActor || !game[victimActor] || game[victimActor].hp <= 0
              || !canReachWithSha(game, holderActor, victimActor)
              || cardTargetProtection(game, holderActor, victimActor, { type: 'sha', name: '杀' }, '杀')) {
            putCard(game, card, { zone: 'hand', actor: actor });
            return fail('无效的【借刀杀人】受害目标。');
          }
          discardCard(game, card);
          return checkWuxieAndContinue(game, holderActor, '【借刀杀人】', 'jiedao', {
            actor: actor, card: card, options: options,
            targetActor: holderActor, victimActor: victimActor
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

      function startTurn(game, actor) {
        var pendingGuard = pendingChoiceGuard(game);
        if (pendingGuard) return pendingGuard;
        if (game.phase === 'gameover') return fail('游戏已经结束。');
        if (!game[actor]) return fail('未知角色。');
        // v12 G1 (修复批): 翻面 (据守) — 轮到武将牌被翻面的角色的回合时,
        // 将其翻回正面并跳过此回合, 回合直接传给座次环上的下一名角色。
        // 递归安全: 本次已翻回正面, 座次环一圈内必然终止。
        // v12 H5: 阵亡座席不再拥有回合 — 直接传给座次环下一名存活角色。
        if (game[actor].hp <= 0) {
          var nextAliveActor = nextSeat(game, actor);
          if (!nextAliveActor || nextAliveActor === actor) return fail('没有存活角色可开始回合。');
          return startTurn(game, nextAliveActor);
        }
        if (game[actor].turnedOver) {
          game[actor].turnedOver = false;
          log(game, actorName(game, actor) + '的武将牌翻回正面，跳过此回合。');
          return startTurn(game, nextSeat(game, actor));
        }
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
        // v12 H5: 妄尊持有者从 opponent() 二元假设泛化为座次环扫描
        // (1v1 恒为对手, 行为不变; 多席时每名持有者各自触发)。
        seatsFrom(game, actor, false).forEach(function (wangzunHolderActor) {
          var wangzunHolder = game[wangzunHolderActor];
          if (wangzunHolder && wangzunHolder.hp > 0 && hasSkill(wangzunHolder, 'wangzun')
              && game.roles && game.roles[actor] === '主公'
              && !(wangzunHolder.skillPreferences && wangzunHolder.skillPreferences.wangzun === 'decline')) {
            log(game, actorName(game, wangzunHolderActor) + '发动【妄尊】，摸一张牌，' + actorName(game, actor) + '本回合手牌上限 -1。');
            drawCards(game, wangzunHolderActor, 1);
            state.handLimitDelta = (state.handLimitDelta || 0) - 1;
          }
        });
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
        // v12 G2: 神速 (夏侯渊) — 判定阶段开始前声明: 跳过阶段换无距离
        // 虚拟【杀】。玩家经 pendingChoice 'shensu-options' 选择; AI 走
        // 保守启发 (对手 1 血才动用选项一)。AI 虚拟杀若为玩家开出闪响应
        // 窗口, 挂 pauseState.prepareResume 由选择排空后续跑。
        if (hasSkill(state, 'shensu')) {
          var shensuResult = triggerShensuPrepare(game, actor);
          if (shensuResult && shensuResult.suspended) return shensuResult;
        }
        return null;
      }

      function continueTurnAfterPreparePhase(game, actor) {
        // v12 H5: 回合角色已在准备阶段阵亡 (身份场对局继续) → 回合立即终止。
        if (game[actor] && game[actor].hp <= 0) return completeTurn(game, actor);
        setPhase(game, actor, 'judge');
        // v12 G2: 神速 选项一 — 跳过判定阶段 (判定区牌保留, 下回合照常结算)。
        if (game[actor].flags && game[actor].flags.skipJudge) {
          log(game, actorName(game, actor) + '跳过判定阶段。');
          return continueTurnAfterJudgeArea(game, actor);
        }
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
        // v12 H5: 回合角色已在判定阶段阵亡 (闪电, 身份场对局继续) → 回合终止。
        if (state && state.hp <= 0) return completeTurn(game, actor);
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

      function completeTurn(game, ending) {
        // v12 H5: 阵亡角色的回合终止 — 不再触发其回合结束时机 (闭月/据守等)。
        if (game[ending] && game[ending].hp <= 0) {
          log(game, actorName(game, ending) + '的回合因阵亡终止。');
          return startTurn(game, nextSeat(game, ending));
        }
        SkillRuntime.runHook(skillRegistry, 'onTurnEnd', {
          game: game,
          actor: ending
        });
        resetEndOfTurnState(game[ending]);
        log(game, actorName(game, ending) + '结束回合。');
        return startTurn(game, nextSeat(game, ending));
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

      // v12 H7: 全场型主公技 — 技能在主公身上, 但由其他座席发动 (黄天:
      // 其他群势力交牌)。useSkill 的持有校验对这类技能放宽为"场上存在
      // 持有该技能的主公", 发动资格由技能 handler 自行校验。
      var LORD_WIDE_SKILLS = { huangtian: true };

      function lordWideSkillAvailable(game, skillId) {
        if (!LORD_WIDE_SKILLS[skillId]) return false;
        return seatList(game).some(function (seat) {
          var seatState = game[seat];
          return seatState && seatState.hp > 0 && hasSkill(seatState, skillId)
            && game.roles && game.roles[seat] === '主公';
        });
      }

      function useSkill(game, actor, skillId, cardIds, options) {
        var pendingGuard = pendingChoiceGuard(game);
        if (pendingGuard) return pendingGuard;
        var self = game[actor];
        cardIds = cardIds || [];
        options = options || {};
        if (!self) return fail('未知角色。');
        if (!hasSkill(self, skillId) && !lordWideSkillAvailable(game, skillId)) return fail('没有这个技能。');
        if (game.phase === 'gameover') return fail('游戏已经结束。');
        if (game.turn !== actor) return fail('还没有轮到你行动。');
        if (PLAY_PHASE_ACTIVE_SKILLS[skillId] && game.phase !== 'play') return fail('主动技能只能在出牌阶段发动。');
        self.flags = self.flags || {};
        var activeSkillContext = {
          game: game,
          actor: actor,
          state: self,
          // v12 H5: 主动技目标从 opponent() 二元假设改为显式 options.target
          // (座席校验), 缺省回退 1v1 对手 — 多席 AI 反间/结姻 才不会误指友方。
          targetActor: resolveSeatOption(game, options.target) || opponent(actor),
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
        getHuogongChoice: getHuogongChoice,
        // v12 H5: 座席级合法目标矩阵 (AI 出杀目标挑选)
        legalTargetsForCard: legalTargetsForCard
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
        seatList: seatList,
        aliveSeats: aliveSeats,
        nextSeat: nextSeat,
        seatsFrom: seatsFrom,
        legalTargetsForCard: legalTargetsForCard,
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
