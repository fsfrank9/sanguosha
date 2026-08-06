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
      import { createGuhuoRuntime } from './guhuo.js';
      import { createPindianRuntime } from './pindian.js';
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
      // v15 T: 拼点点数比较 (A=1 … K=13)
      var cardRankValue = CardRuntime.cardRankValue;
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
      // v15 S1: 蛊惑限次全场按回合复位 (响应窗口声明发生在他人回合内)
      var resetGuhuoTurnLimit = PhaseRuntime.resetGuhuoTurnLimit;
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
        notifyCardLoss(game, fromActor);
        return card;
      }

      // ── v15 V: "失去牌后" 单点 (屯田) ──
      // 官方 屯田 是"每当你于回合外失去牌后"。引擎此前没有失牌时机, 这里
      // 补一个显式广播点, 由**牌确实已离开该角色区域之后**的出口调用:
      //   · takeHandCard        (被顺手牵羊/反馈/巧变等获得手牌)
      //   · removeTargetZoneCard(被拆/被顺/被弃 —— 目标区域任意一张)
      //   · consumeResponse     (打出闪/无懈等响应牌; 回合外失牌的主力来源)
      //   · discardSelected / discardExcess (弃牌阶段; 屯田自身按"回合外"过滤)
      // 重入保护: 屯田会在 hook 里判定, 判定牌入弃牌堆 / 被天妒收走都可能
      // 再次走到上面的出口 —— 没有闸就会无限递归。
      function notifyCardLoss(game, actor) {
        if (!game || !game[actor] || game.phase === 'gameover') return;
        if (game.cardLossInFlight) return;
        game.cardLossInFlight = true;
        try {
          SkillRuntime.runHook(skillRegistry, 'onCardLost', { game: game, actor: actor });
        } finally {
          game.cardLossInFlight = false;
        }
      }

      function performDrawPhase(game, actor) {
        var drawContext = {
          game: game,
          actor: actor,
          drawCount: 2
        };
        SkillRuntime.runHook(skillRegistry, 'onDrawPhase', drawContext);
        // v14 Q3: 突袭玩家 ask — 摸牌决策挂起 (发动=放弃摸牌, 摸与否由
        // resolver 收尾), 快照补记 hook 后的最终 drawCount。
        if (game.pauseState && game.pauseState.tuxiAsk && game.pendingChoice) {
          game.pauseState.tuxiAsk.drawCount = drawContext.drawCount;
          return { suspended: true };
        }
        // v15 T 评审收口: 双雄玩家 ask 同款 (发动=放弃摸牌, 摸与否由 resolver
        // 收尾), 快照补记 hook 后的最终 drawCount。
        if (game.pauseState && game.pauseState.shuangxiongAsk && game.pendingChoice) {
          game.pauseState.shuangxiongAsk.drawCount = drawContext.drawCount;
          return { suspended: true };
        }
        // v15 U: 再起 (孟获) 同款摸牌阶段 ask。
        if (game.pauseState && game.pauseState.zaiqiAsk && game.pendingChoice) {
          game.pauseState.zaiqiAsk.drawCount = drawContext.drawCount;
          return { suspended: true };
        }
        var drawnResult = drawCards(game, actor, drawContext.drawCount);
        // v15 U: 好施的"然后"段必须在**摸牌完成之后**结算 (手牌数要含刚摸的
        // 牌)。并列手牌最少时会开窗 → 摸牌阶段在此挂起, 由 resolver 收尾。
        var haoshiOutcome = SkillDomain.settleHaoshi(game, actor);
        if (haoshiOutcome && haoshiOutcome.suspendedForHaoshi) return { suspended: true };
        return drawnResult;
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
        // v15 V: 武将牌上的"田"区 (邓艾 屯田)。只有 canPlayCardAs / playCardAs
        // 两条转化路径走本函数, 且各技能的 onCardAs hook 自己把关来源区域
        // (急袭只认"田"), 所以这里放开不会让"田"当普通牌打出。响应扫描
        // (firstMatchingOwnCard) 刻意**不**覆盖"田" —— 否则"田"里的【闪】会
        // 被自动打出去。
        var tianHit = (state.tian || []).find(function (c) { return c.id === cardId; });
        if (tianHit) return { card: tianHit, zone: 'tian' };
        return null;
      }

      // v12 H 复核修复: state → 座席名解析 (泛化任意座席数)。此前多处用
      // `game.player === state ? 'player' : 'enemy'` 二元硬编码, 在 3 人身份
      // 场把第三席误判为 enemy → 装备牌清错槽 (造牌) / 丈八取牌 null 崩溃 /
      // 连营静默失效。1v1 下遍历结果与旧三元判断逐字一致。
      function seatOfState(game, state) {
        if (!game || !state) return null;
        var seats = seatList(game);
        for (var i = 0; i < seats.length; i += 1) {
          if (game[seats[i]] === state) return seats[i];
        }
        return null;
      }

      function removeOwnCardFromAnyZone(state, cardId, game) {
        var hit = findOwnCardById(state, cardId);
        if (!hit) return null;
        if (hit.zone === 'hand') {
          return removeCardFromHand(state, cardId);
        }
        // v15 V: "田"离场 (急袭把一张"田"当【顺手牵羊】使用)。
        if (hit.zone === 'tian') {
          var ownerOfTian = seatOfState(game, state);
          if (game && ownerOfTian) {
            return takeCard(game, cardId, { zone: 'tian', actor: ownerOfTian });
          }
          state.tian = (state.tian || []).filter(function (c) { return c.id !== cardId; });
          return hit.card;
        }
        // equipment — M2: 制衡/苦肉/武圣转化等把装备区牌当成本, 同样是"失去
        // 装备" — 传入 game 的调用方会触发失去时机 (白银狮子回血)。
        var ownerActor = seatOfState(game, state);
        if (game && ownerActor) {
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

      // W1 (2026-06-09 审计 backlog:83 显式裁决 → **做**): 兜底原本是
      // Math.random() —— 一旦真的走到 (game.random 缺失), 同种子复跑会得到
      // 不同结果, 而整个守恒 fuzz 档 (1200 种子) 的前提正是"同种子必然同轨"。
      // 兜底改为**确定性**推导 (按牌堆+弃牌堆规模取模), 无 game.random 时
      // 依然可复现; 有 game.random 时行为逐字不变。
      function randomSuit(game) {
        var suits = ['spade', 'heart', 'club', 'diamond'];
        if (game && game.random && typeof game.random === 'function') {
          var idx = Math.floor(game.random() * 4) % 4;
          if (idx < 0 || idx >= 4) idx = 0;
          return suits[idx];
        }
        var deckLen = (game && game.deck && game.deck.length) || 0;
        var discardLen = (game && game.discard && game.discard.length) || 0;
        return suits[(deckLen + discardLen) % 4];
      }

      // v11 B1: 装备穿/卸/失去时机与武器特效 (麒麟/寒冰/雌雄) 已迁往
      // ./equipment.js (见下方 EquipmentRuntime 装配)。

      function resumePlayShaAfterCixiong(game) {
        if (game.pauseState && game.pauseState.playSha) {
          var saved = game.pauseState.playSha;
          game.pauseState.playSha = null;
          return continueShaAfterCixiong(game, saved.actor, saved.card, saved.amount, saved.targetActor);
        }
        // v14 P1: 多目标链的雌雄挂起 (锁定阶段, 游标已先行) → 续跑链驱动。
        if (game.pauseState && game.pauseState.shaChain) {
          return ShaFlowRuntime.advanceShaChain(game);
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
        resumeAOETargets: function (game) { return TricksRuntime.advanceAOETargets(game); },
        // v15 T 评审收口: 强袭成本致濒死时的伤害段续跑 (SkillDomain 后置
        // 装配, 晚绑定包装 — 与 tricks/judge-area 的既有先例一致)。
        resumeQiangxiDamage: function (game, saved) {
          return SkillDomain.resumeQiangxiDamage(game, saved);
        },
        // v15 T 评审收口: 拼点效果挂起后的补弃 (PindianRuntime 后置装配)。
        flushPindianCards: function (game) { return PindianRuntime.flushPindianCards(game); },
        // v15 U 评审收口: 乱武逐席链的续跑入口 (SkillDomain 后置装配)。
        advanceLuanwu: function (game) { return SkillDomain.advanceLuanwu(game); },
        // v15 V: 放权 —— onTurnEnd 挂起后的回合收尾 + 额外回合派发续跑。
        resumeTurnEndAndAdvance: function (game) { return resumeTurnEndAndAdvance(game); },
        // audit4-L5: 决斗链被插入结算挂起后的续跑 (锦囊域后置装配, 包装注入)
        resumeDuelChain: function (game) { return TricksRuntime.advanceDuelChain(game); },
        // v12 H 复核修复: 铁索传导环被濒死救援挂起后的续跑 (伤害域后置装配, 包装注入)
        resumeChainTransmit: function (game) { return DamageDyingRuntime.advanceChainTransmit(game); },
        // v14 P1: 多目标杀链被逐席挂起 (闪响应/濒死/流离等) 后的续跑 (杀链域后置装配, 包装注入)
        resumeShaChain: function (game) { return ShaFlowRuntime.advanceShaChain(game); },
        // v15 S1: 响应窗口蛊惑声明拦截 (函数声明提升, 蛊惑域后置装配)
        guhuoResponseIntercept: guhuoResponseIntercept
      });
      var requestPlayerResponse = ResponseRuntime.requestPlayerResponse;
      var RESPONSE_KIND_RESOLVERS = ResponseRuntime.RESPONSE_KIND_RESOLVERS;
      var registerResponseKind = ResponseRuntime.registerResponseKind;
      var setPendingChoice = ResponseRuntime.setPendingChoice;
      var shiftPendingChoiceQueue = ResponseRuntime.shiftPendingChoiceQueue;
      var resumeSuspendedTurnFlowIfReady = ResponseRuntime.resumeSuspendedTurnFlowIfReady;
      var finishPendingChoiceResolution = ResponseRuntime.finishPendingChoiceResolution;
      var pendingChoiceGuard = ResponseRuntime.pendingChoiceGuard;
      // v15 T: 拼点域 (驱虎/天义 前置; 后续烈刃/制霸/间书 同框架)。
      var PindianRuntime = createPindianRuntime({
        log: log,
        fail: fail,
        success: success,
        actorName: actorName,
        cardRankValue: cardRankValue,
        removeCardFromHand: removeCardFromHand,
        discardCard: discardCard,
        findCardZone: findCardZone,
        setPendingChoice: setPendingChoice,
        registerResponseKind: registerResponseKind,
        // AI 拼点出牌启发经晚绑定回环 (AIRuntime 在其后创建)。
        aiPickPindianCard: function (game, seat, pd) {
          return AIRuntime.aiPickPindianCard(game, seat, pd);
        }
      });
      var startPindian = PindianRuntime.startPindian;

      var resolveResponseChoice = ResponseRuntime.resolveResponseChoice;

      // L2: 决斗/南蛮/万箭/火攻 等锦囊在使用时已进入弃牌堆, 伤害结算收尾时
      // 不可重复弃置 (否则弃牌堆出现双份); 仍在结算中的牌 (如【杀】) 正常弃置。
      // v13 N2: 多目标 AOE 逐席结算 (南蛮/万箭) 中来源牌可能已被先结算
      // 席位的技能获得 (奸雄从弃牌堆取回) — 后续席位收尾时牌"不在弃牌堆"
      // 并非仍在结算中, 而是已归属某席; 补弃会造成同一对象双区并存
      // (守恒红线, k4 soak seed 47201/47303 抓获)。已归属席位的牌不弃。
      // 注: 铁索传导不在此列 — advanceChainTransmit 传 sourceCard=null
      // (opus 复核核实), AOE 是唯一同 sourceCard 多席结算路径。
      function discardSourceCardIfPending(game, card) {
        if (!card) return;
        var physical = physicalCardOf(card);
        // v14 P 评审收口: 多目标链的来源杀在全部目标结算完毕前不入弃牌堆
        // (官方"结算完毕后置入弃牌堆"; 逐席命中若早弃, 后续席位摸牌耗尽
        // 牌堆时会把仍在结算中的杀洗回并摸走 — opus 对抗实证)。链收尾的
        // finishShaChain 先清链态再调本函数, 此处放行统一弃置。
        var activeShaChain = game.pauseState && game.pauseState.shaChain;
        if (activeShaChain && activeShaChain.card
            && physicalCardOf(activeShaChain.card) === physical) return;
        // audit4-H1: "已落地"判定改为全区域定位 (findCardZone: 牌堆/弃牌堆/
        // 各席手牌/判定区/创区/装备) — 此前漏 牌堆与判定区: AOE 中途击杀
        // 奖励摸空牌堆触发洗牌, 已弃置的南蛮/万箭被洗回 deck, 旧检查误判
        // "仍在途"补弃 → 同一张牌 deck+discard 双区并存 (守恒红线,
        // fuzz seed 50/550)。真在途 (无任何区域) 才补弃。
        if (physical && findCardZone(game, physical)) return;
        discardCard(game, card);
      }

      // v11 B1: 伤害/濒死域拆分 — damage/enterDying/濒死救援/铁索传导 迁往
      // ./damage-dying.js, 引擎闭包能力经 createDamageDyingRuntime 依赖注入。
      var DamageDyingRuntime = createDamageDyingRuntime({
        // v15 S1: 蛊惑响应窗口开窗谓词 (于吉手上没有所需牌型也要开窗)
        guhuoResponsePossible: guhuoResponsePossible,
        // v15 S1: 蛊惑声明救援牌的注入取用口 (濒死不走 consumeResponse)
        takeGuhuoResponseCard: takeGuhuoResponseCard,
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
        drawCards: function (g, a, n) { return drawCards(g, a, n); },
        // audit4-M9/L2/L4: 装备域后置装配, 包装注入 — 急救红装备/惩罚弃装备
        // 的失去时机, 濒死黑酒的银月枪触发。
        triggerEquipmentLoss: function (g, a, c) { return triggerEquipmentLoss(g, a, c); },
        triggerYinyueQiang: function (g, a) { return triggerYinyueQiang(g, a); }
      });
      var damage = DamageDyingRuntime.damage;
      var enterDying = DamageDyingRuntime.enterDying;
      var resolveDyingRescueChoice = DamageDyingRuntime.resolveDyingRescueChoice;
      // v13 J3: 天香 ask 询问 resolver
      var resolveTianxiangAskChoice = DamageDyingRuntime.resolveTianxiangAskChoice;

      // v11 C2 (批次 26): 连营 — 统一手牌失去事件的第一个消费者。
      // CardRuntime 在 putCard 落位提交手牌失去后回调这里; 在途还原路径
      // (火攻同花色不符退回 / 濒死救援校验失败退回等) 不会触发。
      // spec: 失去最后一张手牌后, 可以摸一张牌 (默认自动, decline 可关)。
      CardRuntime.setHandLossHandler(function (game, originState) {
        if (!game || game.phase === 'gameover') return;
        if (!originState || (originState.hand || []).length > 0) return;
        if (!hasSkill(originState, 'lianying')) return;
        if (originState.skillPreferences && originState.skillPreferences.lianying === 'decline') return;
        // v12 H 复核修复: 座席归属泛化 (此前第三席解析为 null → 连营静默失效)。
        var actor = seatOfState(game, originState);
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
            // v12 H 复核修复: 座席归属泛化 — 此前 `game.player === state ?
            // 'player' : 'enemy'` 在 3 人场把第三席误判为 enemy, takeCard 从
            // enemy 手牌取不到 → null → zbFirst.id 崩溃。
            var zbActor = seatOfState(game, state) || 'enemy';
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

      // v15 S1: 蛊惑打出流程注入口 — 声明已亮出 (无人质疑/验真), 实体牌
      // 在处理区待用, 牌面除牌名外全部确定。各响应消费出口先来这里取牌,
      // 取到即以"声明牌名 + 实体牌面"顶替常规响应扫描 (实体牌已在声明期
      // 离手, 不再从任何区域摘牌)。一次性消费, 取走即清。
      var GUHUO_SHA_DECLARES = ['sha', 'fire_sha', 'thunder_sha'];

      function takeGuhuoResponseCard(game, actor, types) {
        var pending = game && game.pauseState && game.pauseState.guhuoResponse;
        if (!pending || pending.actor !== actor) return null;
        if (types && types.indexOf(pending.declareType) < 0) return null;
        game.pauseState.guhuoResponse = null;
        return pending;
      }

      function consumeResponse(game, actor, type, reason, preferredCardId) {
        var guhuoResolved = takeGuhuoResponseCard(game, actor,
          type === 'sha' ? GUHUO_SHA_DECLARES : [type]);
        var response = guhuoResolved
          ? { card: guhuoResolved.physical, asName: guhuoResolved.declaredName, skillName: '蛊惑' }
          : findResponseCard(game[actor], type, preferredCardId, game);
        if (!response) {
          // v12 I2: 响应空窗记账 (纯遥测) — 自动响应含全部转化路径, 拿不出
          // 即公开证明该座席当下凑不出此牌型; AI 估计在其下个回合开始 (摸牌,
          // resetActorTurnState 清除) 前按 0 计。真实对局中这是公开信息。
          // 复核修复 D1: 仅自动扫描路径 (无 preferredCardId) 记账 — 显式
          // 指定的牌无效 (findResponseCard 不回退扫描) 不证明没有此牌型。
          if (!preferredCardId && game[actor]) {
            game[actor].aiRevealed = game[actor].aiRevealed || {};
            game[actor].aiRevealed[type] = true;
          }
          return false;
        }
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
        // v15 V: 打出响应牌 = 失去牌 (屯田的主力触发源, 回合外过滤在技能侧)
        notifyCardLoss(game, actor);
        return true;
      }

      function consumeWuxie(game, actor, reason, preferredCardId) {
        var card;
        var wuxieVia = null; // v15 T: 看破等转化来源 (日志用)
        // v15 S1: 蛊惑声明的【无懈可击】(响应中的使用流程) — 牌面已亮出,
        // 实体牌在处理区, 直接顶替手牌扫描。
        var guhuoWuxie = takeGuhuoResponseCard(game, actor, ['wuxie']);
        if (guhuoWuxie) {
          card = guhuoWuxie.physical;
        } else if (preferredCardId) {
          // v10 V5: 玩家指定用哪张无懈 (面板候选选定)
          // v15 T: 看破 — 黑色手牌同样可指定 (候选/门槛/消费三处共用
          // TricksRuntime.wuxieOptionForCard 谓词)。
          var state = game[actor];
          var picked = (state.hand || []).find(function (c) { return c.id === preferredCardId; });
          if (!picked || !TricksRuntime.wuxieOptionForCard(state, picked)) return false;
          wuxieVia = TricksRuntime.wuxieOptionForCard(state, picked).via;
          card = takeCard(game, preferredCardId, { zone: 'hand', actor: actor });
        } else {
          card = removeFirstCardOfType(game[actor], 'wuxie');
          if (!card) {
            // v15 T: 无真无懈时看破转化兜底 (AI / auto 路径)。
            //
            // 评审收口 [中]: 此前是 hand.find —— 按手牌顺序取第一张黑牌,
            // 不估值。卧龙的开窗门槛对任何锦囊恒真, 于是一张【青釭剑】就被
            // 拿去抵消【过河拆桥】。改为在合格候选里取"最不值钱"的一张
            // (复用 AI 的弃牌估值单点; AIRuntime 后置装配, 缺席时退回原顺序)。
            var kanpoCandidates = ((game[actor] || {}).hand || []).filter(function (c) {
              var opt = TricksRuntime.wuxieOptionForCard(game[actor], c);
              return opt && opt.via;
            });
            if (kanpoCandidates.length > 1 && AIRuntime && AIRuntime.scoreCardForAI) {
              kanpoCandidates = kanpoCandidates.slice().sort(function (a, b) {
                return AIRuntime.scoreCardForAI(game, actor, a)
                  - AIRuntime.scoreCardForAI(game, actor, b);
              });
            }
            var kanpoPick = kanpoCandidates[0];
            if (kanpoPick) {
              wuxieVia = TricksRuntime.wuxieOptionForCard(game[actor], kanpoPick).via;
              card = takeCard(game, kanpoPick.id, { zone: 'hand', actor: actor });
            }
          }
        }
        if (!card) return false;
        discardCard(game, card);
        log(game, actorName(game, actor)
          + (guhuoWuxie ? '发动【蛊惑】，将【' + card.name + '】当'
            : (wuxieVia ? '发动【' + wuxieVia + '】，将【' + card.name + '】当' : '打出'))
          + '【无懈可击】抵消' + reason + '。');
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
        // v15 U 评审收口: AOE 建队列时的目标合法性过滤 (帷幕等"目标合法性"
        // 类技能, flow__condition.md:101)。晚绑定包装 — isLegalCardTarget
        // 声明在本处之后。
        isLegalCardTarget: function (game, actor, card, seat) {
          return isLegalCardTarget(game, actor, card, seat);
        },
        // v15 S1: 蛊惑响应窗口开窗谓词 (于吉手上没有所需牌型也要开窗)
        guhuoResponsePossible: guhuoResponsePossible,
        // v15 S 收口: 借刀持刀者使用杀 — 声明牌注入取用口 (不走 consumeResponse)
        takeGuhuoResponseCard: takeGuhuoResponseCard,
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
        // audit4-M8: 装备域后置装配, 包装注入 (借刀交武器的失去时机)。
        triggerEquipmentLoss: function (g, a, c) { return triggerEquipmentLoss(g, a, c); },
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
      // v13 审计三轮: 铁索使用分支逐目标无懈驱动
      var advanceTiesuoTargets = TricksRuntime.advanceTiesuoTargets;
      var wuguPickForCurrent = TricksRuntime.wuguPickForCurrent;

      // v11 B1: 装备域装配 — 依赖注入引擎闭包能力 (函数声明经包装注入,
      // 提升保证前向引用); yinyue-response 在工厂内自注册。
      var EquipmentRuntime = createEquipmentRuntime({
        // v15 S1: 蛊惑响应窗口开窗谓词 (于吉手上没有所需牌型也要开窗)
        guhuoResponsePossible: guhuoResponsePossible,
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
        listShanResponseOptions: function (s) { return listShanResponseOptions(s); },
        // v13 审计三轮: 银月枪八卦先行 (sha-flow 域后置装配, 包装注入)
        tryBaguaDodge: function (g, t, ig) { return tryBaguaDodge(g, t, ig); }
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
        // v15 S1: 蛊惑响应窗口开窗谓词 (于吉手上没有所需牌型也要开窗)
        guhuoResponsePossible: guhuoResponsePossible,
        log: log,
        fail: fail,
        success: success,
        damage: damage,
        discardCard: discardCard,
        drawCards: drawCards,
        moveCard: moveCard,
        removeCardFromHand: removeCardFromHand,
        removeOwnCardFromAnyZone: removeOwnCardFromAnyZone,
        // 评审收口: 青龙续杀转化选优复用同一裁决函数
        selectCardAsConversion: selectCardAsConversion,
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
        lordAidPlayerCanAid: lordAidPlayerCanAid,
        // v14 P1: 多目标链收尾的幂等来源牌弃置
        discardSourceCardIfPending: discardSourceCardIfPending
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
      // v14 P1/P2/P3: 多目标链驱动 + 方天前置查询 + 流离 resolver
      var advanceShaChain = ShaFlowRuntime.advanceShaChain;
      var shaExtraTargetLimit = ShaFlowRuntime.shaExtraTargetLimit;
      var resolveLiuliTransferChoice = ShaFlowRuntime.resolveLiuliTransferChoice;


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
        opponent: opponent,
        // v13 J0-2: 判定前无懈窗口 (tricks 域已装配, 直接注入)
        checkWuxieAndContinue: function (g, t, r, n, c) { return checkWuxieAndContinue(g, t, r, n, c); }
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
        // v15 S1: 响应窗口蛊惑声明 — 先于 kind resolver 拦截 (声明是"如何
        // 进行响应"的另一条分支, 不是该 kind 的一个决策值)。校验失败时
        // pendingChoice 原样留在槽内, 窗口不丢。
        if (decision && decision.guhuo) {
          return finishPendingChoiceResolution(game,
            guhuoResponseIntercept(game, pending, decision.guhuo));
        }
        // 注册表迁移收官: 所有 pendingChoice / response kind 统一经
        // RESPONSE_KIND_RESOLVERS 分发 (此前仅 V3-V6 的 shan/wuxie/sha-duel/
        // wanjian/yinyue 走注册表, 其余 15 个 kind 是手写 if 链)。
        var resolver = RESPONSE_KIND_RESOLVERS[pending.kind];
        if (!resolver) return fail('未知的选择类型：' + pending.kind);
        game.pendingChoice = null;
        return finishPendingChoiceResolution(game, resolver(game, pending, decision || {}));
      }

      // v15 S1: 响应窗口蛊惑声明拦截 (两个 dispatcher 共用)。函数声明提升,
      // GuhuoRuntime 在文件末装配、调用发生在运行期 — 与既有晚绑定包装
      // (aiShouldChallengeGuhuo 等) 同款。
      function guhuoResponseIntercept(game, pending, guhuoOpts) {
        return GuhuoRuntime.declareGuhuoResponse(game, pending, guhuoOpts || {});
      }

      // v12 F1: 技能域函数群 (trigger/resolver/辅助 共 53 个) 已整体迁往
      // ./skills.js。装配点从文件头下移到 响应/判定/伤害 运行时就位之后,
      // deps 全部为已绑定引用 (scoreCardForAI 在 AIRuntime 之前, 经闭包晚绑定,
      // 与 tricks/judge-area 的既有包装先例一致)。直调面回绑同名 var, 使
      // registerResponseKind 注册块 / processPreparePhase / 导出表零改动。
      var SkillDomain = installStandardSkillHandlers(skillRegistry, {
        hasSkill: hasSkill,
        // v15 T 评审收口: 涅槃 ask 挂起后重入濒死循环 (DamageDyingRuntime
        // 早于本处装配, 直绑即可)。
        processDyingNext: DamageDyingRuntime.processDyingNext,
        // v15 U: 英魂"令其弃置 N 张"的被动弃牌选牌 (AIRuntime 后置装配,
        // 晚绑定包装 — 与 scoreCardForAI 同款先例)。
        reshuffleIfNeeded: reshuffleIfNeeded,
        playSha: function (game, a, card, opts) { return playSha(game, a, card, opts); },
        removeFirstCardOfType: removeFirstCardOfType,
        aiDiscardCandidates: function (game, seat) {
          return AIRuntime.aiDiscardCandidates
            ? AIRuntime.aiDiscardCandidates(game, seat) : null;
        },
        // v15 T: 拼点 (驱虎/天义) — 发起入口与效果注册 (拼点域后置装配,
        // 包装注入)。
        startPindian: function (game, actor, targetActor, opts) {
          return PindianRuntime.startPindian(game, actor, targetActor, opts);
        },
        registerPindianContinuation: function (key, handler) {
          return PindianRuntime.registerPindianContinuation(key, handler);
        },
        pindianEligible: function (game, actor, targetActor) {
          return PindianRuntime.pindianEligible(game, actor, targetActor);
        },
        cardRankValue: cardRankValue,
        // v15 T: 乱击 — 虚拟【万箭齐发】走普通使用校验与结算入口
        // (函数声明提升, 运行期调用 — 与既有晚绑定注入同款)。
        canPlayCard: function (game, actor, card) { return canPlayCard(game, actor, card); },
        playCardWithRegisteredHandler: function (game, actor, card, options, self) {
          return playCardWithRegisteredHandler(game, actor, card, options, self);
        },
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
        // v15 V: 直谏 — 把手牌区的装备牌置入他人装备区 (顶替旧装备照常入弃牌堆)。
        equipCard: equipCard,
        // v15 T: 猛进 ask 挂起后续跑闪避分支剩余流程 (杀链域后置装配,
        // 包装注入 — 与 resumeAOETargets 等既有晚绑定同款)。
        continueShaDodgeAfterSkills: function (game, actor, card, amount, targetActor) {
          return ShaFlowRuntime.continueShaDodgeAfterSkills(game, actor, card, amount, targetActor);
        },
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
      var resolveLeijiAskChoice = SkillDomain.resolveLeijiAskChoice;
      var triggerLuoshenPrepare = SkillDomain.triggerLuoshenPrepare;
      var getGuanxingPreview = SkillDomain.getGuanxingPreview;
      var resolveFankuiPickChoice = SkillDomain.resolveFankuiPickChoice;
      var resolveMengjinPickChoice = SkillDomain.resolveMengjinPickChoice;
      var resolveNiepanAskChoice = SkillDomain.resolveNiepanAskChoice;
      var resolveQuhuVictimChoice = SkillDomain.resolveQuhuVictimChoice;
      var resolveJiemingPickChoice = SkillDomain.resolveJiemingPickChoice;
      // v15 V (山包)
      var resolveTiaoxinDemandChoice = SkillDomain.resolveTiaoxinDemandChoice;
      var resolveZhijiChoice = SkillDomain.resolveZhijiChoice;
      var resolveFangquanGrantChoice = SkillDomain.resolveFangquanGrantChoice;
      var resolveBenghuaiChoice = SkillDomain.resolveBenghuaiChoice;
      var resolveLuanwuShaChoice = SkillDomain.resolveLuanwuShaChoice;
      var resolveFangzhuPickChoice = SkillDomain.resolveFangzhuPickChoice;
      var resolveYinghunChoice = SkillDomain.resolveYinghunChoice;
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
      // v13 张角修缮: 雷击改为闪结算后挂起询问 (玩家选目标/放弃), AI 仍走自动
      registerResponseKind('leiji-ask', resolveLeijiAskChoice);
      registerResponseKind('shensu-options', resolveShensuOptionsChoice);
      registerResponseKind('yiji-distribute', resolveYijiDistributeChoice);
      registerResponseKind('guanxing-reorder', resolveGuanxingChoice);
      registerResponseKind('fanjian-guess', resolveFanjianGuessChoice);
      registerResponseKind('fankui-pick', resolveFankuiPickChoice);
      // v15 T: 猛进 (庞德) 选牌窗 — resolver 收尾后续跑闪避分支剩余流程。
      registerResponseKind('mengjin-pick', resolveMengjinPickChoice);
      // v15 T 评审收口: 涅槃 (庞统) 濒死询问窗 — 官方"你可以", 玩家席不再
      // 无条件抢在【桃】窗口之前烧掉限定技。
      registerResponseKind('niepan-ask', resolveNiepanAskChoice);
      // v15 T 评审收口: 驱虎赢后的受伤角色由荀彧选 (官方"你选择的一名角色",
      // 选择发生在赢之后); 节命逐点询问受益者 (官方"你可以令一名角色…")。
      registerResponseKind('quhu-victim', resolveQuhuVictimChoice);
      registerResponseKind('jieming-pick', resolveJiemingPickChoice);
      // v15 U: 崩坏 (董卓) 锁定技的二选一 (失体力 / 减体力上限)。
      registerResponseKind('benghuai-choice', resolveBenghuaiChoice);
      // v15 U: 乱武 (贾诩) 逐席窗口 — 使用一张杀, 或失去 1 点体力 (路线图 G12)。
      registerResponseKind('luanwu-sha', resolveLuanwuShaChoice);
      // v15 U: 放逐 (曹丕) 选目标 / 英魂 (孙坚) 选项 + 目标。
      registerResponseKind('fangzhu-pick', resolveFangzhuPickChoice);
      registerResponseKind('yinghun-choice', resolveYinghunChoice);
      // v15 U: 好施并列手牌最少时由鲁肃选受赠者 (rule__element.md:91 判例)。
      registerResponseKind('haoshi-give', resolveHaoshiGiveChoice);
      // v15 U: 再起 (孟获) 摸牌阶段真 ask (放弃摸牌换亮牌回血)。
      registerResponseKind('zaiqi-ask', resolveZaiqiAskChoice);
      registerResponseKind('ganglie-fire', resolveGanglieFireChoice);
      registerResponseKind('ganglie-source-choice', resolveGanglieSourceChoice);
      registerResponseKind('qilin-pick', resolveQilinPickChoice);
      registerResponseKind('cixiong-fire', resolveCixiongFireChoice);
      registerResponseKind('cixiong-choose', resolveCixiongChoose);
      // v14 Q3: 突袭摸牌阶段真 ask
      registerResponseKind('tuxi-pick', resolveTuxiPickChoice);
      // v15 T 评审收口: 双雄摸牌阶段真 ask (官方"你可以放弃摸牌")。
      registerResponseKind('shuangxiong-ask', resolveShuangxiongAskChoice);
      registerResponseKind('jiedao-decision', resolveJiedaoDecisionChoice);
      registerResponseKind('wugu-pick', resolveWuguPickChoice);
      registerResponseKind('guohe-1v1-pick', resolveGuohe1v1PickChoice);
      registerResponseKind('dying-rescue', resolveDyingRescueChoice);
      // v13 J3: 天香 ask — 伤害流暂停询问 (弃红桃 + 转移目标 / 放弃)
      registerResponseKind('tianxiang-ask', resolveTianxiangAskChoice);
      registerResponseKind('luoshen-continue', resolveLuoshenContinueChoice);
      // v11 C7 (批次 31): 耀武 — 伤害来源的奖励二选一
      registerResponseKind('yaowu-reward', resolveYaowuRewardChoice);
      // ── v15 V (山包) ──
      // 挑衅: 被指定者选"对姜维出杀"还是"被弃一张牌"。
      registerResponseKind('tiaoxin-demand', resolveTiaoxinDemandChoice);
      // 志继: 觉醒后的"回复 1 点体力 / 摸两张牌"二选一。
      registerResponseKind('zhiji-choice', resolveZhijiChoice);
      // 放权: 回合结束时"弃一张手牌令一名其他角色获得额外回合"。
      registerResponseKind('fangquan-grant', resolveFangquanGrantChoice);
      // 享乐: 杀的**来源**决定是否弃一张基本牌 (resolver 在杀结算链域)。
      registerResponseKind('xiangle-cost', ShaFlowRuntime.resolveXiangleCostChoice);

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
            // v13 M3: 求助响应立场遥测 (帮主公 = 强主忠信号)。
            StateRuntime.recordStance(game, { type: 'aid', source: aider, beneficiary: lordActor });
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
            if (aoePaid) StateRuntime.recordStance(game, { type: 'aid', source: 'player', beneficiary: lordActor }); // v13 M3 遥测
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
            StateRuntime.recordStance(game, { type: 'aid', source: 'player', beneficiary: lordActor }); // v13 M3 遥测
          }
        }
        if (!paid) {
          while (chain.aidPaid < chain.aidNeeded && tryLordAidSync(game, lordActor, 'jijiang', chain.reason)) {
            chain.aidPaid += 1;
            // 评审收口 (对抗验证 F2): 代打座席打出黑牌可挂银月枪询问 —
            // 双同步窗口共用单槽 pauseState.yinyueResponse 会碰撞丢伤害。
            // L5 同款守卫: 挂起即停; 已付张数同步进 resumePaid (续跑走
            // advanceDuelChain 的 auto 分支, 只认 resumePaid — 两个计数
            // 同为"本轮已向 duelNeeded 支付的总张数")。
            if (game.pendingChoice) {
              chain.resumePaid = chain.aidPaid;
              return success('【决斗】暂停，等待插入结算。');
            }
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
            if (aoePaid) StateRuntime.recordStance(game, { type: 'aid', source: 'player', beneficiary: lordActor }); // v13 M3 遥测
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
        var hujiaPaidThis = false;
        if (wantsAid && consumeResponse(game, 'player', 'shan', '【杀】（护驾）', decision.cardId || null)) {
          log(game, actorName(game, 'player') + '响应【护驾】，代' + actorName(game, lordActor) + '打出【闪】。');
          remaining -= 1;
          hujiaPaidThis = true;
          StateRuntime.recordStance(game, { type: 'aid', source: 'player', beneficiary: lordActor }); // v13 M3 遥测
        }
        // v12 H 复核修复: 无双第二张 — 玩家刚代打一张且仍有闪可代 → 再次
        // 询问 (与激将侧对称)。此前只 AI 座席接力, 玩家手上还有第二张真闪
        // 也被跳过 → 主公无谓掉血。
        if (remaining > 0 && hujiaPaidThis && hasShanResponseAvailable(game.player)) {
          saved.shanRemaining = remaining;
          return requestPlayerResponse(game, {
            kind: 'hujia-aid',
            actor: 'player',
            pauseKey: 'shaResponse',
            source: saved,
            options: listShanResponseOptions(game.player),
            meta: { lordActor: lordActor, sourceActor: saved.actor, shaName: saved.card && saved.card.name },
            logMessage: '等待' + actorName(game, 'player') + '决定是否再代打一张【闪】（无双）。',
            statusMessage: '等待玩家护驾响应。'
          });
        }
        // 剩余需求 (无双第二张等, 玩家已无闪) 由 AI 同势力座席接力。
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
        // v13 L1: firstActorFromRoles 按 seats 全环扫描主公 (轮转后主公可落
        // 任意座席, AI 主公先手)。
        var firstActor = options.firstActor || firstActorFromRoles(roles, seats, seats[0] || 'player');
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
          // v13 K1: 'identity3' 为身份场模式标签 (历史命名), 覆盖 3-5 人档 —
          // 引擎/UI 所有 mode==='identity3' 判断语义均为"身份场规则生效",
          // 与具体席数无关; 席数判断一律走 game.seats.length。
          mode: seats.length >= 3 ? 'identity3' : 'duel',
          // v12 H5: 身份→阵营映射随局携带 (胜负判定/内奸预留)。
          roleSides: clone(ROLE_SIDES),
          // v13 M1: 暗身份 — 官方 glossary__card.md:11 "除了主公外, 一名
          // 角色的身份牌在其因死亡而亮出前对其他角色不可见"。缺省明置
          // (options.hiddenRoles 未传) = v12 以来的简化口径, 零回归;
          // 仅身份场可开。roleRevealed 逐席可见性表在建席后初始化。
          hiddenRoles: !!(options.hiddenRoles && seats.length >= 3),
          roleRevealed: null,
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
        // v13 M1: 身份可见性初始化 — 明置模式全席公开 (恒等旧行为);
        // 暗置模式仅主公公开, 其余随死亡翻明 (damage-dying) / 终局全翻。
        game.roleRevealed = {};
        for (var rvi = 0; rvi < seats.length; rvi += 1) {
          game.roleRevealed[seats[rvi]] = !game.hiddenRoles || roles[seats[rvi]] === '主公';
        }
        // v13 K5 (review 修复): 官方 glossary__value.md:23 — "若游戏人数
        // 不小于5，主公的体力上限+1" (开局体力随之 +1)。4 人及以下不加;
        // 5 人档 v13 K 起现役, 该规则首次可达。
        if (seats.length >= 5) {
          for (var lordSi = 0; lordSi < seats.length; lordSi += 1) {
            if (roles[seats[lordSi]] === '主公' && game[seats[lordSi]]) {
              game[seats[lordSi]].maxHp += 1;
              game[seats[lordSi]].hp += 1;
            }
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
          var takenHand = takeCard(game, picked.card, { zone: 'hand', actor: targetActor });
          notifyCardLoss(game, targetActor); // v15 V: 屯田
          return { card: takenHand, zone: '手牌' };
        }
        if (zone === 'equipment') {
          takeCard(game, picked.card, { zone: 'equipment', actor: targetActor, slot: picked.slot });
          // M2: 被拆/被顺/被反馈拿走装备同样是"失去装备区里的牌"
          triggerEquipmentLoss(game, targetActor, picked.card);
          notifyCardLoss(game, targetActor); // v15 V: 屯田
          return { card: picked.card, zone: '装备区' };
        }
        if (zone === 'judge') {
          var takenJudge = takeCard(game, picked.card, { zone: 'judgeArea', actor: targetActor });
          notifyCardLoss(game, targetActor); // v15 V: 屯田
          return { card: takenJudge, zone: '判定区' };
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
        // v15 T: 次数/禁用闸统一走 shaUseAllowed (天义赢的额外次数 +1 与
        // 天义没赢的"本回合不能使用【杀】"都在其中)。
        if (isShaCard(card) && !StateRuntime.shaUseAllowed(self)) {
          return fail(self.flags && self.flags.tianyiLost
            ? '【天义】拼点没赢，本回合不能使用【杀】。' : '本回合已经使用过【杀】。');
        }
        if (card.type === 'tao') {
          // v13 J0-4 (PR #165 玩家实测缺陷 4): 出牌阶段【桃】收口为标准语义 —
          // 仅"自己已受伤"可使用且目标恒为自己; 濒死救援走独立求桃队列
          // (attemptDyingRescue), 不受影响。gltjk card__basic.md 界限突破变体
          // 文本 ("包括你在内的一名已受伤的角色") 记录为已知分歧, 见
          // docs/audit/ 第三轮纪要。
          if (self.hp >= self.maxHp) return fail('体力已满，不能使用【桃】。');
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
          // audit4-M2: ∃-目标检查改走合法性矩阵 (identity3 含判定区 —
          // 界限突破版; 1v1 保持 装备/手牌 二选一变体), 消息按模式给。
          var guoheAnyPickable = otherSeats.some(function (seat) {
            return isLegalCardTarget(game, actor, card, seat);
          });
          if (!guoheAnyPickable) {
            return fail(game.mode === 'identity3'
              ? '【过河拆桥】需要一名区域里有牌的其他角色。'
              : '1V1【过河拆桥】只能弃对手装备区或手牌；对方两者皆空。');
          }
        }
        // v12 H3: identity3 顺手牵羊距离 ≤1 — 有牌座席均在距离外时拒绝。
        if (card.type === 'shunshou' && trickDistanceLimited(game)
            && !legalTargetsForCard(game, actor, card).length) {
          return fail('距离不足，无法使用【顺手牵羊】。');
        }
        // audit4-M3: 火攻 "一名有手牌的角色" — 无合法目标 (全场空手牌) 时
        // 拒绝使用, 不再空放白触发集智等 onCardUse。
        if (card.type === 'huogong' && !legalTargetsForCard(game, actor, card).length) {
          return fail('没有有手牌的目标，无法使用【火攻】。');
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

      // audit4-M6: 奇才 (黄月英) "使用锦囊牌无距离限制" — flag 在
      // PASSIVE_EFFECTS 定义已久却无人消费 (v12 H3 恢复官方距离时漏接),
      // identity3 下顺手/兵粮距离仍拦她。锁定技, 无开关。
      function ignoresTrickDistance(state) {
        return SkillRuntime.hasPassiveEffect(state, 'ignoreTrickDistance');
      }

      // v15 U: 距离限制型锦囊 (顺手牵羊/兵粮寸断) 的**距离上限单点**。
      // 此前四处调用点各自手写 `distanceBetween(...) > 1`, 徐晃【断粮】的
      // "你能对距离为 2 的角色使用【兵粮寸断】"没法只改一处。
      //
      // 口径分层 (逐字, 三者语义不同, 不可互相替代):
      //   - 奇才"使用锦囊牌无距离限制" → Infinity;
      //   - 断粮"能对距离为 2 的角色使用【兵粮寸断】" → 上限**放宽到 2**
      //     (不是无限制), 且只对兵粮寸断这一张牌名;
      //   - 其余 → 官方上限 1。
      // 返回 0 表示"本模式不限距离"(1v1 变体口径, 见 trickDistanceLimited)。
      // v15 U: 帷幕的判据 — 目标持有帷幕 且 该牌是黑色锦囊牌。
      // 颜色按"实际颜色"读 (effectiveCardColor 单点, 红颜等改色技能一致);
      // 虚拟转化牌的颜色继承来源实体, 故"把黑色牌当锦囊使用"同样被挡。
      function weimuBlocksCard(game, seat, card) {
        var seatState = game[seat];
        if (!seatState || !hasSkill(seatState, 'weimu')) return false;
        if (!card) return false;
        if (card.family !== 'trick' && card.family !== 'delayed') return false;
        return StateRuntime.effectiveCardColor(seatState, card) === 'black';
      }

      function trickDistanceLimitFor(game, actor, cardType) {
        if (!trickDistanceLimited(game)) return Infinity;
        if (ignoresTrickDistance(game[actor])) return Infinity;
        if (cardType === 'bingliang' && hasSkill(game[actor], 'duanliang')) return 2;
        return 1;
      }

      function withinTrickDistance(game, actor, seat, cardType) {
        return distanceBetween(game, actor, seat) <= trickDistanceLimitFor(game, actor, cardType);
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
        // v15 U: 帷幕 (贾诩, card__hero__neutral.md:201) — "锁定技，你不是
        // 黑色锦囊牌的合法目标。"
        //
        // 取林版而非国-标版 (:217 "每当你成为黑色锦囊牌的目标时，你取消自己")
        // —— 两者语义不同: 林版在**指定目标**阶段就排除, 国-标版是成为目标后
        // 再取消 (会先经过"成为目标时"的时机)。见 spec 简报的变体裁定。
        // 接在 isLegalCardTarget 这个单点上, 玩家出牌 / AI 出牌 / 多目标逐席 /
        // 转化锦囊 / 延时锦囊放置 全部自动覆盖。
        // "锦囊牌"含**延时**锦囊 (glossary__gamecard.md:41 明写"延时类锦囊牌"),
        // 故【闪电】也被挡 —— 贾诩不能把闪电放进自己判定区 (官方直接后果)。
        if (weimuBlocksCard(game, seat, card)) return false;
        if (seat === actor) {
          // 自指: 桃 (已受伤) / 酒 (本实现仅自己, 见下方非自指分支注) /
          // 无中生有 / 闪电 (判定区无同名)
          if (card.type === 'tao') {
            // v15 U: 完杀 (贾诩) — 贾诩回合内, 不处于濒死状态的其他角色不能
            // 使用【桃】(含出牌阶段自己回血)。
            if (StateRuntime.wanshaBlocksTaoUse(game, actor)) return false;
            return seatState.hp < seatState.maxHp;
          }
          if (card.type === 'jiu') return !(seatState.flags && seatState.flags.jiuUsedThisTurn);
          if (card.type === 'wuzhong') return true;
          if (card.type === 'shandian') {
            return !(seatState.judgeArea || []).some(function (judge) { return judge && judge.type === 'shandian'; });
          }
          // 评审收口 [低 L3]: 【铁索连环】官方"使用目标：一至两名角色"
          // (card__scroll.md:232) — 没有"其他"限定, 自己是合法目标 (横置
          // 自己换连营/苦肉类收益是常规打法)。结算 handler 本就不排除自己,
          // 只有这条枚举谓词漏了 → 连环转化铁索时玩家点不到自己。
          if (card.type === 'tiesuo') return true;
          return false;
        }
        // 评审收口 [中]: 使用【杀】的距离面走 shaUseReachAllowed (天义无
        // 距离限制) — 这条正是 UI 高亮与 aiShaTargetSeat 读的谓词。
        if (isShaCard(card)) return StateRuntime.shaUseReachAllowed(game, actor, seat) && !cardTargetProtection(game, actor, seat, card, '杀');
        if (card.type === 'tao') return false; // v13 J0-4: 出牌阶段【桃】目标恒为自己
        // v13 K2 (座席泛化桶销账): 【酒】使用方法Ⅰ按官方语义放开他指 —
        // gltjk card__basic.md:58 (军争/国-标) "使用目标: 包括你在内的一名
        // 角色"。"每回合限一次"归属使用时机行 (限使用者出牌阶段的使用
        // 次数, 不限目标被喂次数), 故他指不查目标的 jiuUsedThisTurn;
        // 目标保护 (谦逊/空城类 onCardTarget) 照常约束。
        if (card.type === 'jiu') return !cardTargetProtection(game, actor, seat, card);
        if (card.type === 'wuzhong') return true;
        if (card.type === 'shandian') return false; // 闪电只对自己使用
        if (card.type === 'lebusishu' || card.type === 'bingliang') {
          if ((seatState.judgeArea || []).some(function (judge) { return judge && judge.type === card.type; })) return false;
          if (card.type === 'bingliang' && !withinTrickDistance(game, actor, seat, 'bingliang')) return false;
          return !cardTargetProtection(game, actor, seat, card);
        }
        if (card.type === 'guohe') {
          // audit4-M2: identity3 走界限突破版语义 "一名区域里有牌的其他角色"
          // (含判定区 — 可拆乐/兵粮/闪电, 与顺手一致); 仅 1v1 保留官方 1V1
          // 变体 (装备/手牌二选一, 判定区不可选)。
          if (game.mode === 'identity3') {
            if (!hasAnyTargetableCard(seatState)) return false;
          } else if (!(seatState.hand || []).length && !equipmentList(seatState).length) {
            return false;
          }
          return !cardTargetProtection(game, actor, seat, card);
        }
        if (card.type === 'shunshou') {
          if (!hasAnyTargetableCard(seatState)) return false;
          if (!withinTrickDistance(game, actor, seat, 'shunshou')) return false;
          return !cardTargetProtection(game, actor, seat, card);
        }
        // audit4-M3: 火攻目标合法性 "一名有手牌的角色" (card__scroll.md:244) —
        // 与过河/顺手同型的目标条款, 此前落默认分支可对空手牌角色空放
        // (还触发集智等 onCardUse 白摸牌)。结算期空手牌兜底保留作防御。
        if (card.type === 'huogong') {
          if (!(seatState.hand || []).length) return false;
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
        // v13 M2: 执行期缺省目标走感知路由 — 决斗/拆/顺/乐/兵/转化在 AI
        // 不显式传 target 时由此解析, 须与评分层同一信息面 (明置恒等)。
        var hostileCandidates = candidates.filter(function (seat) {
          return StateRuntime.perceivedHostile(game, actor, seat);
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
      // v14 P3: 流离转移询问 (sha-flow 域 resolver)
      registerResponseKind('liuli-transfer', resolveLiuliTransferChoice);

      // v10 V3: 注册到 response framework. UI 通过 resolvePendingChoice 或
      // resolveResponseChoice 调过来时, 此 fn 拿 pauseState.shaResponse + decision
      // 决定 dodged, 再走 resolveShaAfterResponse 共享后续结算.
      registerResponseKind('shan-response', resolveShanResponseChoice);

      registerResponseKind('sha-duel-response', resolveDuelResponseChoice);

      registerResponseKind('wanjian-response', resolveWanjianResponseChoice);

      // v15 T: 重铸 — 官方把"重铸"列为独立于使用/打出的操作 (出牌阶段
      // 弃置该牌并摸一张)。既有面只有【铁索连环】自带重铸; 连环 (庞统)
      // 令"梅花手牌"也能重铸 (card__hero__shu.md:322 逐字)。判定统一走
      // 本谓词 + onCanRecast hook, 技能侧只声明"哪些牌可重铸"。
      function canRecastCard(game, actor, card) {
        if (!card) return false;
        if (card.type === 'tiesuo') return true;
        return SkillRuntime.runHook(skillRegistry, 'onCanRecast', {
          game: game, actor: actor, state: game[actor], card: card
        }).some(function (entry) { return entry.result === true; });
      }

      function recastHandCard(game, actor, cardId) {
        // 评审收口 [中]: 与同族公开入口 (playCard / playCardAs / useSkill /
        // endTurn / discardSelected) 同守卫 — UI 的重铸钮直调本函数, 缺守卫
        // 时挂起中 (过河选牌/濒死…) 照样能弃一摸一。
        var pendingGuard = pendingChoiceGuard(game);
        if (pendingGuard) return pendingGuard;
        var self = game[actor];
        if (!self) return fail('未知角色。');
        if (game.turn !== actor || game.phase !== 'play') return fail('只能在自己的出牌阶段重铸。');
        var card = (self.hand || []).find(function (item) { return item.id === cardId; });
        if (!card) return fail('找不到这张手牌。');
        if (!canRecastCard(game, actor, card)) return fail('这张牌不能重铸。');
        removeCardFromHand(self, cardId);
        discardCard(game, card);
        log(game, actorName(game, actor) + '重铸【' + card.name + '】，摸一张牌。');
        drawCards(game, actor, 1);
        return success('重铸完成。');
      }

      function playCard(game, actor, cardId, options) {
        var pendingGuard = pendingChoiceGuard(game);
        if (pendingGuard) return pendingGuard;
        var self = game[actor];
        options = options || {};
        if (!self) return fail('未知角色。');
        var card = self.hand.find(function (item) { return item.id === cardId; });
        // v15 T: 非铁索牌的重铸请求经统一入口 (连环的梅花重铸面) —
        // 铁索自身的重铸仍走既有 handler 分支, 行为逐字不变。
        if (options.mode === 'recast' && card && card.type !== 'tiesuo') {
          return recastHandCard(game, actor, cardId);
        }
        var playable = canPlayCard(game, actor, card);
        if (!playable.ok) return playable;
        // v12 H1: 区域/成本预校验对齐显式目标 (缺省 1v1 对手)。
        if (card && (card.type === 'guohe' || card.type === 'shunshou') && (options.targetZone || options.targetCardId)) {
          // 评审收口 (对抗验证 F3): 1v1 过河判定区非法请求提前拒绝 —
          // 此前拖到 resolveGuohe1v1 时牌已入弃牌堆 (裸 API 白损一张)。
          if (card.type === 'guohe' && options.targetZone === 'judge' && game.mode !== 'identity3') {
            return fail('1V1【过河拆桥】不能弃置判定区。');
          }
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
        var result = playSha(game, actor, card, options);
        // audit4-M1 收口: playCard 已把牌移出手牌, 而 playSha 的拒绝路径
        // (非法目标/目标保护/距离) 不负责回滚 — 拒绝且牌真在途 (不在任何
        // 区域) 时退回手牌, 不留守恒泄漏。虚拟杀 (神速/丈八/转化) 的组成
        // 实体由各转化调用方自理。
        if (result && !result.ok && card && !card.virtual && !findCardZone(game, card)) {
          putCard(game, card, { zone: 'hand', actor: actor });
        }
        return result;
      }

      function playEquipmentCardHandler(game, actor, card, options, self) {
        return equipCard(game, actor, card);
      }

      function playDelayedCardHandler(game, actor, card, options, self) {
          // v13 J0-2 (PR #165 缺陷 2): 延时锦囊放置时不再开无懈窗口 — 官方
          // 无懈时机为"一张锦囊牌对一个目标生效前" (card__scroll.md:78), 而
          // 延时锦囊的生效 = 目标判定阶段"先进行判定结算" (flow__use.md:133),
          // 故无懈窗口移至 processJudgeArea 判定前 (judge-area.js, 无懈延续
          // 'delayed-judge')。放置为直接置入判定区。
          // v12 H1: 乐/兵 经 options.target 显式指定 (缺省 1v1 对手); 闪电恒
          // 对自己。card.delayedSource 记录使用者 — 判定时无懈链跳过来源。
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
          card.delayedSource = actor;
          putCard(game, card, { zone: 'judgeArea', actor: delayedSide });
          if (card.type === 'shandian') {
            log(game, actorName(game, actor) + '将【闪电】置入自己的判定区。');
          } else {
            log(game, actorName(game, actor) + '将【' + card.name + '】置入' + actorName(game, delayedSide) + '的判定区。');
          }
          return success('延时锦囊已放置。');
      }

      function playTaoCardHandler(game, actor, card, options, self) {
          // v13 J0-4 (PR #165 玩家实测缺陷 4): 出牌阶段【桃】目标恒为自己,
          // 且仅自己已受伤时可用 (canPlayCard 已把关)。显式指定其他座席一律
          // 拒绝并退牌 (守恒红线); 救援他人只保留濒死求桃队列一条路径。
          var requestedTaoTarget = resolveSeatOption(game, options.taoTarget || options.target);
          if (requestedTaoTarget && requestedTaoTarget !== actor) {
            putCard(game, card, { zone: 'hand', actor: actor });
            return fail('出牌阶段【桃】只能对自己使用。');
          }
          if (self.hp >= self.maxHp) {
            // v12 H1 修复: 拒绝时把牌放回手牌 (此前 playCard 已摘牌, 直接
            // fail 会让实体牌凭空消失 — 守恒红线)。
            putCard(game, card, { zone: 'hand', actor: actor });
            return fail('体力已满，不能使用【桃】。');
          }
          discardCard(game, card);
          self.hp = Math.min(self.maxHp, self.hp + 1);
          log(game, actorName(game, actor) + '使用【桃】，回复 1 点体力。');
          return success('回复体力。');
      }

      function playJiuCardHandler(game, actor, card, options, self) {
          // v7 PR-8: 标记已用 + shaBonus = 1（不累加，spec "下一张【杀】"
          // 即下一次结算 +1，不是叠加多次酒）
          // v13 K2 (座席泛化桶销账): 官方使用方法Ⅰ"包括你在内的一名角色" —
          // options.target 可指定他人 (借刀驱使的杀可吃增益), 缺省自己。
          // jiuUsedThisTurn 恒挂使用者 (限次归属使用时机行); shaBonus 挂
          // 目标 (playSha 按"谁在打杀"读自己的 shaBonus, 天然衔接);
          // "此回合内"过期语义由 completeTurn 统一清全席 shaBonus 兜底。
          var jiuTargetActor = resolveSeatOption(game, options && options.target) || actor;
          if (jiuTargetActor !== actor && !isLegalCardTarget(game, actor, card, jiuTargetActor)) {
            putCard(game, card, { zone: 'hand', actor: actor });
            return fail('无效的【酒】目标。');
          }
          discardCard(game, card);
          if (!self.flags) self.flags = {};
          self.flags.jiuUsedThisTurn = true;
          game[jiuTargetActor].shaBonus = 1;
          log(game, actorName(game, actor) + (jiuTargetActor === actor
            ? '饮下【酒】，本回合下一张【杀】伤害 +1。'
            : '对' + actorName(game, jiuTargetActor) + '使用【酒】，其于本回合内使用的下一张【杀】伤害 +1。'));
          return success('下一张杀伤害提升。');
      }

      function playWuzhongCardHandler(game, actor, card, options, self) {
          // v7 PR-16: gltjk card__scroll.md 无中生有 (1V1/界限突破/国-标):
          //   "使用目标: 包括你在内的一名角色"。options.wuzhongTarget /
          //   options.target 可指定任意座席 (v12 H1: resolveSeatOption 校验,
          //   无效值静默回退 actor — 与旧字面量白名单行为一致); 缺省 = actor。
          // H1: 摸牌前开无懈窗口。v13 审计三轮: 首询者 = 目标座席 (自指时
          // 队列自动跳过来源, 座次环泛化 — 此前自指走二元 opponent(), 3p
          // 下首询锚点跳过第三席)。
          discardCard(game, card);
          var wzTargetActor = resolveSeatOption(game, options.wuzhongTarget || options.target) || actor;
          log(game, actorName(game, actor) + '使用【无中生有】' + (wzTargetActor === actor ? '' : '令' + actorName(game, wzTargetActor)) + '。');
          return checkWuxieAndContinue(game, wzTargetActor, '【无中生有】', 'wuzhong', {
            actor: actor, card: card, options: options, wzTargetActor: wzTargetActor
          });
      }

      // v15 V: 普通锦囊的 "指定目标后" 时机 (flow__use.md step 5)。
      // 目前唯一消费者是 激昂 (孙策) —— 它只关心【决斗】与红色【杀】, 后者
      // 走既有的 onShaTargeted, 所以这里只需要决斗一处接入点。
      function runTrickTargetedHooks(game, actor, card, targetActor) {
        if (game.phase === 'gameover') return;
        SkillRuntime.runHook(skillRegistry, 'onTrickTargeted', {
          game: game, sourceActor: actor, targetActor: targetActor, card: card
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
          runTrickTargetedHooks(game, actor, card, duelTargetActor);
          return checkWuxieAndContinue(game, duelTargetActor, '【决斗】', 'juedou', {
            actor: actor, card: card, options: options, targetActor: duelTargetActor
          });
      }

      // v13 审计三轮: 南蛮/万箭 改逐目标无懈 — 官方多目标牌逐目标结算,
      // "生效前"响应对每名目标独立重现 (flow__use.md; 与桃园/五谷同型)。
      // 旧"全局单窗口"在 1v1 (单目标) 行为等价, 多席下一张无懈错误地抵消
      // 全部目标。逐席窗口移入 advanceAOETargets ('aoe-target' 延续)。
      function playNanmanCardHandler(game, actor, card, options, self) {
          // finishTrickUse 保持在使用时点触发 onCardUse (集智) — 旧全局
          // 无懈延续曾承担此包装, 迁移逐目标窗口时不得丢失 (评审修复)。
          return finishTrickUse(game, actor, card, playAOE(game, actor, card, 'sha', '南蛮入侵'), options);
      }

      function playWanjianCardHandler(game, actor, card, options, self) {
          return finishTrickUse(game, actor, card, playAOE(game, actor, card, 'shan', '万箭齐发'), options);
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
          // v12 H1: 目标座席经 resolveSeatOption 校验 (任意存活座席, 至多 2 名)。
          // v13 审计三轮: 使用分支补逐目标无懈窗口 (普通锦囊, 官方无豁免;
          // 目标校验先行, 失败退牌)。重铸不是"使用", 不开窗。
          if (options.mode === 'recast') {
            discardCard(game, card);
            log(game, actorName(game, actor) + '重铸【铁索连环】，摸一张牌。');
            drawCards(game, actor, 1);
            return success('铁索连环重铸完成。');
          }
          // v13 K2: 缺省目标去二元化 — 无显式 targets 时取敌对座席池首位
          // (此前 opponent(actor) 纯二元函数, 4/5 席非 player/enemy 座席缺省
          // 会错指玩家席; 1v1 池恒为 [对手], 行为不变)。UI 座席点选与 AI
          // 路径均显式传 targets, 该缺省仅兜底直调。
          var tiesuoDefault = StateRuntime.perceivedHostileSeats(game, actor).slice(0, 1); // v13 M2 感知路由
          var targets = Array.from(options.targets || tiesuoDefault).filter(function (side, index, array) {
            return resolveSeatOption(game, side) && game[side].hp > 0 && array.indexOf(side) === index;
          }).slice(0, 2);
          if (!targets.length) {
            putCard(game, card, { zone: 'hand', actor: actor });
            return fail('请选择要横置或重置的角色。');
          }
          discardCard(game, card);
          return advanceTiesuoTargets(game, {
            actor: actor, card: card, options: options, targets: targets, idx: 0
          });
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
        // v15 S1: 蛊惑"每名角色的回合内限一次"是全场按回合刷新的额度
        // (响应窗口声明发生在他人回合内) → 每席随回合切换复位。
        resetGuhuoTurnLimit(game);

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
        // v15 U: 准备阶段技能钩子 (孙坚英魂 等)。位序在妄尊之后、观星之前 —
        // 观星/洛神会挂起 pendingChoice, 挂起后本函数即返回, 排在其后的钩子
        // 本回合就跑不到了。挂起判据取钩子自身的返回信号, 不看
        // game.pendingChoice (v15 T H1 教训: 该槽位可能已被无关窗口占用)。
        var prepareHookResults = SkillRuntime.runHook(skillRegistry, 'onPreparePhase', {
          game: game, actor: actor, state: state
        });
        if (prepareHookResults.some(function (entry) {
          return entry && entry.result && entry.result.suspendedForYinghun;
        })) {
          if (!game.pauseState) game.pauseState = {};
          game.pauseState.prepareResume = { actor: actor };
          return { suspended: true };
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
          var drawOutcome = performDrawPhase(game, actor);
          // v14 Q3: 突袭 ask 挂起 — 停在摸牌阶段, 出牌推进由 tuxi-pick
          // resolver 经 finishDrawPhaseAndAdvance 收尾。
          if (drawOutcome && drawOutcome.suspended) {
            return success('等待' + actorName(game, actor) + '决定【突袭】。');
          }
        } else {
          log(game, actorName(game, actor) + '跳过摸牌阶段。');
        }
        return finishDrawPhaseAndAdvance(game, actor);
      }

      // v14 Q3: 摸牌阶段收尾 + 推进出牌/弃牌 — 自 continueTurnAfterJudgeArea
      // 尾部拆出, 供 突袭 ask resolver 重入 (语句与拆出前逐行一致)。
      // ── v15 V: 出牌阶段开始前 (放权) ──
      // 官方 放权 是"你可以跳过出牌阶段" —— 决策点在摸牌阶段结束、出牌阶段
      // 开始之前。引擎既有的跳过出口是 flags.skipPlay (神速/乐不思蜀 共用),
      // 本 hook 就是让技能有机会在 nextPlayablePhase 读它之前写它。
      function runBeforePlayPhaseHooks(game, actor) {
        if (game.phase === 'gameover' || !game[actor]) return;
        SkillRuntime.runHook(skillRegistry, 'onBeforePlayPhase', { game: game, actor: actor });
      }

      // ── v15 V: 弃牌阶段结束时 (固政) ──
      // discardedCards = 本阶段内该角色因弃置而失去的手牌 (recordDiscardPhaseLoss
      // 记账)。传的是**牌对象引用**, 技能侧据此在弃牌堆里定位 (中途被别的
      // 技能拿走的不再计入)。
      function runDiscardPhaseEndHooks(game, actor) {
        if (game.phase === 'gameover' || !game[actor]) return;
        var flags = game[actor].flags || {};
        SkillRuntime.runHook(skillRegistry, 'onDiscardPhaseEnd', {
          game: game,
          actor: actor,
          discardedCards: (flags.discardPhaseCards || []).slice()
        });
        flags.discardPhaseCards = [];
      }

      function finishDrawPhaseAndAdvance(game, actor) {
        var state = game[actor];
        runBeforePlayPhaseHooks(game, actor);
        setPhase(game, actor, nextPlayablePhase(state));
        log(game, actorName(game, actor) + '进入' + (game.phase === 'play' ? '出牌' : '弃牌') + '阶段。');
        return success('回合开始。');
      }

      // v14 Q3: 突袭 ask resolver — decision { targets: [seat, seat?] } 发动
      // (放弃摸牌, 获得每席一张手牌); { decline } 或空决策 = 放弃发动照常
      // 摸牌 (soak 决策表 {} 兜底安全)。非法目标按惯例重挂。
      function resolveTuxiPickChoice(game, pending, decision) {
        var saved = game.pauseState && game.pauseState.tuxiAsk;
        if (!saved) return fail('找不到【突袭】询问的暂停状态。');
        var actor = pending.actor;
        var d = decision || {};
        // 评审收口: 显式传了 targets 但不是数组 (如单个座席字符串) → 按
        // 惯例重挂报错, 不静默落入放弃分支。
        if (d.targets != null && !Array.isArray(d.targets)) {
          setPendingChoice(game, pending);
          return fail('【突袭】的 targets 须为座席数组（一至两名）。');
        }
        var requested = Array.isArray(d.targets) ? d.targets : [];
        if (!d.decline && requested.length) {
          var legalSeats = (pending.candidates || []).map(function (cd) { return cd.seat; });
          var picks = [];
          for (var i = 0; i < requested.length; i += 1) {
            var seat = resolveSeatOption(game, requested[i]);
            if (!seat || legalSeats.indexOf(seat) < 0 || picks.indexOf(seat) >= 0
                || !game[seat] || game[seat].hp <= 0 || !(game[seat].hand || []).length) {
              setPendingChoice(game, pending);
              return fail('请选择一至两名有手牌的其他角色，或 decline 放弃发动【突袭】。');
            }
            picks.push(seat);
          }
          if (picks.length > 2) {
            setPendingChoice(game, pending);
            return fail('【突袭】至多指定两名角色。');
          }
          game.pauseState.tuxiAsk = null;
          picks.forEach(function (seat) {
            takeHandCard(game, seat, actor, '发动【突袭】，获得');
          });
          log(game, actorName(game, actor) + '发动【突袭】，放弃摸牌。');
          return finishDrawPhaseAndAdvance(game, actor);
        }
        game.pauseState.tuxiAsk = null;
        log(game, actorName(game, actor) + '选择不发动【突袭】。');
        // 评审收口: == null 判缺省而非 falsy 兜底 — 快照 drawCount=0 (未来
        // 某技能压零) 时放弃发动应摸 0 张, 不得被 || 吞成 2。
        drawCards(game, actor, saved.drawCount == null ? 2 : saved.drawCount);
        return finishDrawPhaseAndAdvance(game, actor);
      }

      // v15 T 评审收口: 双雄 ask resolver — { decline } / 空决策 = 放弃发动
      // 照常摸牌 (soak 决策表 {} 兜底安全); 其余即发动 (放弃摸牌 → 判定 →
      // 获得判定牌 → 本回合异色手牌可当【决斗】)。与突袭同款收尾。
      function resolveShuangxiongAskChoice(game, pending, decision) {
        var saved = game.pauseState && game.pauseState.shuangxiongAsk;
        if (!saved) return fail('找不到【双雄】询问的暂停状态。');
        var actor = pending.actor;
        game.pauseState.shuangxiongAsk = null;
        var shell = { game: game, actor: actor, drawCount: saved.drawCount == null ? 2 : saved.drawCount };
        if (decision && (decision.decline || decision.skip)) {
          log(game, actorName(game, actor) + '选择不发动【双雄】。');
        } else {
          SkillDomain.applyShuangxiongDrawPhase(game, actor, shell);
        }
        if (shell.drawCount > 0) drawCards(game, actor, shell.drawCount);
        return finishDrawPhaseAndAdvance(game, actor);
      }

      // v15 U: 好施受赠者 resolver — 并列手牌最少时由鲁肃选 (官方判例
      // rule__element.md:91)。窗口开在摸牌阶段内, 收尾后推进到出牌阶段。
      function resolveHaoshiGiveChoice(game, pending, decision) {
        var legal = (pending.candidates || []).map(function (entry) { return entry.seat; });
        var seat = resolveSeatOption(game, decision && decision.target);
        if (!seat || legal.indexOf(seat) < 0) {
          setPendingChoice(game, pending);
          return fail('请从手牌最少的角色中选择一名接受【好施】。');
        }
        SkillDomain.applyHaoshiGive(game, pending.actor, seat, pending.giveCount || 0);
        if (game.turn === pending.actor && game.phase === 'draw') {
          return finishDrawPhaseAndAdvance(game, pending.actor);
        }
        return success('好施结算完成。');
      }

      // v15 U: 再起 ask resolver — { decline } / 空决策 = 放弃发动照常摸牌;
      // 其余即发动 (放弃摸牌 → 亮 X 张 → 回血 → 获得非红桃)。
      function resolveZaiqiAskChoice(game, pending, decision) {
        var saved = game.pauseState && game.pauseState.zaiqiAsk;
        if (!saved) return fail('找不到【再起】询问的暂停状态。');
        var actor = pending.actor;
        game.pauseState.zaiqiAsk = null;
        if (decision && (decision.decline || decision.skip)) {
          log(game, actorName(game, actor) + '选择不发动【再起】。');
          drawCards(game, actor, saved.drawCount == null ? 2 : saved.drawCount);
        } else {
          SkillDomain.applyZaiqi(game, actor, saved.x || 1);
        }
        var haoshiAfter = SkillDomain.settleHaoshi(game, actor);
        if (haoshiAfter && haoshiAfter.suspendedForHaoshi) {
          return success('等待【好施】选择受赠角色。');
        }
        return finishDrawPhaseAndAdvance(game, actor);
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
        recordDiscardPhaseLoss(game, actor, discarded);
        return success('弃牌完成。');
      }

      // v15 V: 固政 (张昭张纮) 要"其于此阶段内因其弃置而失去过的手牌", 所以
      // 弃牌阶段的弃牌要按回合记账。存在 state.flags 上, 随 setPhase 进入
      // 弃牌阶段时清空 (见 setPhase), 由 onDiscardPhaseEnd 消费。
      function recordDiscardPhaseLoss(game, actor, cards) {
        var state = game[actor];
        if (!state || game.phase !== 'discard' || !cards || !cards.length) return;
        state.flags = state.flags || {};
        state.flags.discardPhaseCards = (state.flags.discardPhaseCards || []).concat(cards);
        notifyCardLoss(game, actor); // v15 V: 屯田 (回合外过滤在技能侧)
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
        recordDiscardPhaseLoss(game, actor, discarded);
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
          if (!game[actor].flags.skipDraw) {
            var drawStep = performDrawPhase(game, actor);
            // 评审收口: 突袭 ask 挂起时如实回报 (resolver 收尾时直接推进
            // 到出牌/弃牌阶段, 手动分步 API 无需再补 draw→play 一步)。
            if (drawStep && drawStep.suspended) return success('等待【突袭】决定。');
          }
          return success('进入摸牌阶段。');
        }
        if (game.phase === 'draw') {
          runBeforePlayPhaseHooks(game, actor);
          setPhase(game, actor, nextPlayablePhase(game[actor]));
          log(game, actorName(game, actor) + '进入' + (game.phase === 'play' ? '出牌' : '弃牌') + '阶段。');
          return success('进入' + (game.phase === 'play' ? '出牌' : '弃牌') + '阶段。');
        }
        if (game.phase === 'play') return finishPlayPhase(game);
        if (game.phase === 'discard') {
          if (needsDiscard(game, actor)) return fail('需要先弃置 ' + getDiscardCount(game, actor) + ' 张牌。');
          runDiscardPhaseEndHooks(game, actor);
          setPhase(game, actor, 'finish');
          log(game, actorName(game, actor) + '进入结束阶段。');
          return success('进入结束阶段。');
        }
        if (game.phase === 'finish') {
          return completeTurn(game, actor);
        }
        return fail('未知阶段。');
      }

      // v13 K2/K5: 【酒】"此回合内"过期收口 — shaBonus 可经他指挂在任意
      // 座席 (官方: 目标于使用酒的那个回合内的下一张杀), 回合结束统一
      // 清全席未消费加成, 防跨多回合存活 (resetEndOfTurnState 只复位
      // 回合结束者本席)。酒是 shaBonus 唯一写入方, 全清即"此回合内"语义。
      function clearAllShaBonus(game) {
        seatList(game).forEach(function (seat) {
          if (game[seat]) game[seat].shaBonus = 0;
        });
      }

      function completeTurn(game, ending) {
        // v12 H5: 阵亡角色的回合终止 — 不再触发其回合结束时机 (闭月/据守等)。
        if (game[ending] && game[ending].hp <= 0) {
          log(game, actorName(game, ending) + '的回合因阵亡终止。');
          // v13 K5 (review 修复): 阵亡早退同样是"回合结束" — 不清会让
          // 酒他指的加成泄漏到后续回合 (使用者饮酒喂人后本回合内反伤
          // 阵亡等场景)。
          clearAllShaBonus(game);
          // v15 V: 阵亡早退同样要派发已排队的额外回合 (放权 的受赠者可能
          // 正是杀死回合角色的人), 否则队列会一直压着不消费。
          var deadExtra = takeNextExtraTurn(game);
          if (deadExtra) {
            log(game, actorName(game, deadExtra) + '获得一个额外的回合。');
            game.extraTurnReturnSeat = game.extraTurnReturnSeat || nextSeat(game, ending);
            return startTurn(game, deadExtra);
          }
          var deadResume = game.extraTurnReturnSeat;
          if (deadResume) {
            game.extraTurnReturnSeat = null;
            return startTurn(game, deadResume);
          }
          return startTurn(game, nextSeat(game, ending));
        }
        SkillRuntime.runHook(skillRegistry, 'onTurnEnd', {
          game: game,
          actor: ending
        });
        // v15 V: 放权 的额外回合窗口开在"此回合结束时" → onTurnEnd 里可能
        // 挂起 (玩家选给谁)。挂起时不推进回合, 由 resolver 收尾后续跑。
        if (game.pendingChoice) {
          game.pauseState = game.pauseState || {};
          game.pauseState.turnEndPending = { actor: ending };
          return success('回合结束时机等待玩家选择…');
        }
        return finishTurnAndAdvance(game, ending);
      }

      // v15 V: 回合结束收尾 + 额外回合派发的单点。
      // 官方 放权: "其获得一个额外的回合" —— 额外回合插在本回合之后, 结束
      // 后回合仍从**原回合角色**的下家继续 (不改变座次环推进基准)。
      function finishTurnAndAdvance(game, ending) {
        resetEndOfTurnState(game[ending]);
        clearAllShaBonus(game);
        log(game, actorName(game, ending) + '结束回合。');
        var extra = takeNextExtraTurn(game);
        if (extra) {
          log(game, actorName(game, extra) + '获得一个额外的回合。');
          // 额外回合结束后回到原本的下家 —— 记在栈上, startTurn 结束时读。
          game.extraTurnReturnSeat = game.extraTurnReturnSeat || nextSeat(game, ending);
          return startTurn(game, extra);
        }
        var resume = game.extraTurnReturnSeat;
        if (resume) {
          game.extraTurnReturnSeat = null;
          return startTurn(game, resume);
        }
        return startTurn(game, nextSeat(game, ending));
      }

      function takeNextExtraTurn(game) {
        var queue = game.pendingExtraTurns;
        while (queue && queue.length) {
          var seat = queue.shift();
          if (game[seat] && game[seat].hp > 0) return seat;
        }
        return null;
      }

      // v15 V: 放权 的 onTurnEnd 挂起收尾后由 resolver 调用, 接着走原
      // completeTurn 的剩余步骤 (复位 → 额外回合 / 下家)。
      function resumeTurnEndAndAdvance(game) {
        var saved = game.pauseState && game.pauseState.turnEndPending;
        if (!saved) return null;
        game.pauseState.turnEndPending = null;
        return finishTurnAndAdvance(game, saved.actor);
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
        // 评审收口 [中]: 丈八两手当杀是**使用**【杀】的又一入口, 次数/禁用闸
        // 必须与 playCard / playCardAs / 诸葛连弩 同走 shaUseAllowed 单点 —
        // 否则天义两个方向都错 (没赢的"本回合不能使用【杀】"被绕过, 赢的
        // 额外次数用不上)。
        if (!StateRuntime.shaUseAllowed(self)) {
          return fail(self.flags && self.flags.tianyiLost
            ? '【天义】拼点没赢，本回合不能使用【杀】。' : '本回合已经使用过【杀】。');
        }
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
        // v8 PR-C1: 国色把方片当乐; v11 C3: 奇袭把黑牌当拆;
        // v15 T: 火计→火攻 / 连环→铁索连环 / 双雄→决斗 — 白名单改由
        // 转化牌工厂表驱动 (新增牌名只改一处)。
        if (asType !== 'sha' && !CARD_AS_TRICK_SPECS[asType]) {
          return fail('不支持转化为该牌名。');
        }
        var cardAsContext = { mode: 'proactive', game: game, actor: actor, state: self, card: original, asType: asType };
        var conversion = selectCardAsConversion(SkillRuntime.runHook(skillRegistry, 'onCardAs', cardAsContext));
        if (!conversion) return fail('当前武将不能这样转化。');
        // 路径分支：杀 走原有 canPlayCard 检查；乐/拆 走各自虚拟卡检查
        if (asType === 'sha') {
          if (!StateRuntime.shaUseAllowed(self)) {
            return fail(self.flags && self.flags.tianyiLost
              ? '【天义】拼点没赢，本回合不能使用【杀】。' : '本回合已经使用过【杀】。');
          }
          var playableSha = canPlayCard(game, actor, virtualShaFromCard(original));
          if (!playableSha.ok) return playableSha;
          playableSha.skillName = conversion.skillName;
          playableSha.message = '发动【' + conversion.skillName + '】，将【' + original.name + '】当【杀】使用。';
          return playableSha;
        }
        // v15 T: 锦囊/延时类一律走同一条 — 虚拟牌交给普通 canPlayCard
        // 把关 (目标存在性/阶段/距离/∃合法目标 等在那里统一判定)。
        var virtualTrick = virtualTrickFromCard(asType, original);
        var playableTrick = canPlayCard(game, actor, virtualTrick);
        if (!playableTrick.ok) return playableTrick;
        playableTrick.skillName = conversion.skillName;
        playableTrick.message = '发动【' + conversion.skillName + '】，将【' + original.name
          + '】当【' + virtualTrick.name + '】使用。';
        return playableTrick;
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
        // v13 K2 (结算加压自审): 转化牌目标此前硬编码 opponent(actor) —
        // 4/5 席身份场中非 player/enemy 座席发动国色/奇袭会把乐/拆错误
        // 指向二元 opponent() 解出的座席。改为与普通乐/拆同路:
        // resolveTrickTargetActor (显式 options.target 优先, 缺省敌对座席池,
        // 1v1 恒对手零回归); 目标解析前置于牌移出区域之前, 失败零副作用。
        var asTargetActor = null;
        // v15 T: 指向型锦囊 (乐/拆/火攻/决斗) 统一前置解析; 铁索连环无
        // 单目标面 (1-2 名或重铸), 目标在结算期由 handler 处理。
        if (asType !== 'sha' && asType !== 'tiesuo' && CARD_AS_TRICK_SPECS[asType]) {
          var asVirtual = virtualTrickFromCard(asType, original);
          // v15 U: 【酒】的缺省目标是**自己** (使用方法Ⅰ"你于此回合内使用的
          // 下一张【杀】伤害 +1")。resolveTrickTargetActor 的缺省是"感知敌对
          // 座席"—— 对指向型锦囊正确, 对酒是反的 (酒池会把 buff 送给敌人)。
          // 显式传 target 时仍走通用解析 (v13 K2 已按官方放开酒的他指)。
          if (asType === 'jiu' && !(options && (options.target
              || (options.targets && options.targets.length)))) {
            asTargetActor = actor;
          } else {
            asTargetActor = resolveTrickTargetActor(game, actor, asVirtual, options);
          }
          if (!asTargetActor) return fail('无效的【' + asVirtual.name + '】目标。');
        } else if (asType === 'sha') {
          // v13 K5 (review 修复): 杀转化同样前置解析 — playSha 的距离/保护
          // 校验失败时不退牌, 而此处来源牌已 removeOwnCardFromAnyZone 移出
          // (守恒破坏窗口); 且 canPlayCard 只保证 ∃ 合法目标, 缺省
          // defaultHostileTarget 取敌对池首位未必可达 (3p+ 距离差异)。
          // resolveTrickTargetActor 对杀走 isLegalCardTarget (含距离/保护),
          // 显式非法目标与缺省不可达池首位都在移牌前拒绝。
          // v14 P 评审收口: 多目标转化杀维持 K5 不变量 — 资格/上限/重复席/
          // 逐席合法性全部在移牌前预判 (opus 实证: 此前 playShaMultiTarget
          // 移牌后拒绝无回滚, 来源实体凭空消失)。
          if (Array.isArray(options && options.targets) && options.targets.length > 1) {
            // 评审收口 [中]: 上限此前硬编码方天 → 天义赢后的转化杀 (武圣/
            // 龙胆/火计…) 拿不到"额外目标数上限 +1"。改为与结算层
            // (normalizeMultiTargets) 同一算式: 方天资格 2 + 天义 1。
            var preFangtian = hit.zone === 'hand' && (self.hand || []).length === 1
              && hasEquipmentEffect(self, 'fangtianLastHandBonus');
            var preExtra = (preFangtian ? 2 : 0) + ShaFlowRuntime.tianyiExtraTargets(self);
            if (preExtra <= 0) return fail('【杀】目标数超过上限（额定 1）。');
            if (options.targets.length > 1 + preExtra) {
              return fail('【杀】目标数超过上限（额定 1 + 额外 ' + preExtra + '）。');
            }
            var preVirtualSha = virtualShaFromCard(original);
            var preSeen = {};
            for (var mtIdx = 0; mtIdx < options.targets.length; mtIdx += 1) {
              var mtSeat = resolveSeatOption(game, options.targets[mtIdx]);
              if (!mtSeat || mtSeat === actor || !game[mtSeat] || game[mtSeat].hp <= 0
                  || !isLegalCardTarget(game, actor, preVirtualSha, mtSeat)) {
                return fail('无效的【杀】目标。');
              }
              if (preSeen[mtSeat]) return fail('不能重复指定同一名角色为【杀】的目标。');
              preSeen[mtSeat] = true;
            }
          }
          asTargetActor = resolveTrickTargetActor(game, actor, virtualShaFromCard(original), options);
          if (!asTargetActor) return fail('无效的【杀】目标。');
        }
        // Remove from whichever zone the source card lived in. The slot is
        // cleared if it came from equipment (relevant for 关羽 卸下武器当杀).
        removeOwnCardFromAnyZone(self, cardId, game);
        log(game, actorName(game, actor) + playable.message);
        // v15 T: 其余锦囊转化统一交给已注册的结算 handler — 与普通出牌
        // 完全同路 (无懈链/逐目标/成本询问一律复用), 不再逐型手写。
        // (奇袭黑牌当拆的 v11 C3 路径即此条的特例, 行为逐字一致。)
        if (CARD_AS_TRICK_SPECS[asType]) {
          var virtualTrickCard = virtualTrickFromCard(asType, original);
          var trickOptions = Object.assign({}, options || {});
          if (asTargetActor) trickOptions.target = asTargetActor;
          var trickResult = playCardWithRegisteredHandler(game, actor, virtualTrickCard, trickOptions, self);
          // 守恒兜底: handler 拒绝且实体不在任何区域 → 退回原区域
          // (playCardAs 的杀分支同款不变量)。
          //
          // 评审收口 [中]: 判据改按**对象身份**。handler 的拒绝路径退的是
          // 它收到的虚拟牌 (与 original 同 id) — 按 id 的 findCardZone 会
          // 误判"来源已归位"而不回滚, 手牌里那张【杀】就被永久换成了
          // 【铁索连环】。铁索是唯一未在 playCardAs 前置解析目标的转化型,
          // 故当前只有它可达; 判据修在共用出口上, 新增转化型天然免疫。
          if (trickResult && !trickResult.ok) {
            CardRuntime.removeCardRefFromZones(game, virtualTrickCard);
            if (!CardRuntime.findCardZoneByRef(game, original)) {
              putCard(game, original, hit.zone === 'equipment'
                ? { zone: 'equipment', actor: actor, slot: hit.slot }
                : { zone: 'hand', actor: actor });
            }
          }
          return trickResult;
        }
        // v13 K2/K5: options 透传 + 前置解析出的合法目标显式传入 (缺省与
        // 显式路径均已过 isLegalCardTarget, playSha 内部校验恒通过,
        // 1v1 行为不变)。
        var conversionVirtualSha = virtualShaFromCard(original);
        var conversionShaResult = playSha(game, actor, conversionVirtualSha,
          Object.assign({}, options, { target: asTargetActor }));
        // v14 P 评审收口兜底: 预检已覆盖全部已知拒绝面; 若未来新增校验令
        // playSha 在移牌后仍拒绝, 来源实体退回原区域 (在途还原), 不留
        // 守恒泄漏 (playShaCardHandler 同款)。
        // v15 T 评审收口: 判据同上改按对象身份 (虚拟杀与来源同 id)。
        if (conversionShaResult && !conversionShaResult.ok) {
          CardRuntime.removeCardRefFromZones(game, conversionVirtualSha);
          if (!CardRuntime.findCardZoneByRef(game, original)) {
            putCard(game, original, hit.zone === 'equipment'
              ? { zone: 'equipment', actor: actor, slot: hit.slot }
              : { zone: 'hand', actor: actor });
          }
        }
        return conversionShaResult;
      }

      // v8 PR-C1: 国色把方片视为乐不思蜀 — 构造虚拟卡 (保留原 suit / rank /
      // physical card 以便弃牌正确; type/name/family 改为 lebusishu)
      // ═════ v15 T: 转化牌工厂表 ═════
      // 新增可转化牌名只需在此加一行 (火计→火攻 / 连环→铁索连环 /
      // 双雄→决斗)。既有三型 (杀/乐/拆) 的构造字段逐字保持不变 —
      // 杀走 makeTestCard 且名字带"（当杀）", 锦囊走字面对象。
      var CARD_AS_TRICK_SPECS = {
        lebusishu: { name: '乐不思蜀', family: 'delayed' },
        // v15 U: 断粮 (徐晃) 把非锦囊的黑色牌当【兵粮寸断】—— 与乐不思蜀
        // 同为延时锦囊, 走同一条 playDelayedCardHandler 路径。
        bingliang: { name: '兵粮寸断', family: 'delayed' },
        // v15 U: 酒池 (董卓) 把黑桃手牌当【酒】—— 基本牌, 走 registerPlayHandler
        // 注册的 playJiuCardHandler (与锦囊分支同一个 handler 派发出口)。
        jiu: { name: '酒', family: 'basic' },
        guohe: { name: '过河拆桥', family: 'trick' },
        // v15 V: 急袭 (邓艾, 凿险授予) 把一张"田"当【顺手牵羊】使用。
        shunshou: { name: '顺手牵羊', family: 'trick' },
        huogong: { name: '火攻', family: 'trick' },
        tiesuo: { name: '铁索连环', family: 'trick' },
        juedou: { name: '决斗', family: 'trick' }
      };

      function virtualTrickFromCard(asType, original) {
        var spec = CARD_AS_TRICK_SPECS[asType];
        if (!spec) return null;
        return {
          id: original.id,
          type: asType,
          name: spec.name,
          family: spec.family,
          suit: original.suit,
          color: original.color,
          rank: original.rank,
          physicalCard: original
        };
      }

      function virtualCardAs(asType, original) {
        if (asType === 'sha') return virtualShaFromCard(original);
        return virtualTrickFromCard(asType, original);
      }

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
        { asType: 'guohe', asName: '过河拆桥' },
        // v15 T (火包): 火计 → 火攻 / 连环 → 铁索连环 / 双雄 → 决斗
        { asType: 'huogong', asName: '火攻' },
        { asType: 'tiesuo', asName: '铁索连环' },
        { asType: 'juedou', asName: '决斗' },
        // v15 U (林包): 断粮 → 兵粮寸断 / 酒池 → 酒
        { asType: 'bingliang', asName: '兵粮寸断' },
        { asType: 'jiu', asName: '酒' },
        // v15 V (山包): 急袭 → 顺手牵羊 (来源是"田", 不是手牌)
        { asType: 'shunshou', asName: '顺手牵羊' }
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
      // v15 V: 制霸 (孙策) 同型 —— 技能在主公身上, 由其他吴势力角色在自己的
      // 出牌阶段发起拼点。势力/次数/主公拒绝拼点等资格由 handler 自校验。
      var LORD_WIDE_SKILLS = { huangtian: true, zhiba: true };

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
        // audit4-H2: 显式目标与 playCard 同一存活约束 — 座席名合法但已阵亡
        // 一律拒绝 (此前反间/结姻可对尸体生效, 重放濒死+死亡结算+奖惩)。
        // 缺省对手的存活校验由各消费 targetActor 的技能 trigger 把关
        // (无目标技能 zhiheng/guanxing 等不受 opponent 亡故牵连)。
        if (options.target) {
          var requestedSkillTarget = resolveSeatOption(game, options.target);
          if (!requestedSkillTarget) return fail('未知目标。');
          if (!game[requestedSkillTarget] || game[requestedSkillTarget].hp <= 0) return fail('目标已阵亡。');
        }
        if (Array.isArray(options.targets)) {
          for (var stIdx = 0; stIdx < options.targets.length; stIdx += 1) {
            var seatOfTargets = resolveSeatOption(game, options.targets[stIdx]);
            if (!seatOfTargets) return fail('未知目标。');
            if (!game[seatOfTargets] || game[seatOfTargets].hp <= 0) return fail('目标已阵亡。');
          }
        }
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
        // v14 R1 评审收口: 蛊惑不走 onActiveSkill (声明需牌型+盖置牌两参,
        // 面板/AI 直调 playGuhuoDeclare) — useSkill 面如实指路而非误报
        // "尚未实现"。
        if (skillId === 'guhuo') {
          return fail('【蛊惑】经声明面板发动（引擎面: playGuhuoDeclare(game, actor, { cardId, declareType, ... })）。');
        }
        return fail('这个技能的主动效果尚未实现。');
      }

      // v11 B1: AI 域拆分 — 评估/lookahead/runAITurn 整体迁往 ./ai.js,
      // v14 R1: 蛊惑域 (虚拟声明牌层 + 质疑链)。AI 质疑立场经晚绑定包装
      // 回环 (AIRuntime 在其后创建, 调用发生在运行期)。
      var GuhuoRuntime = createGuhuoRuntime({
        log: log,
        fail: fail,
        success: success,
        actorName: actorName,
        makeTestCard: makeTestCard,
        canPlayCard: canPlayCard,
        legalTargetsForCard: legalTargetsForCard,
        isLegalCardTarget: isLegalCardTarget,
        resolveSeatOption: resolveSeatOption,
        removeCardFromHand: removeCardFromHand,
        putCard: putCard,
        discardCard: discardCard,
        findCardZone: findCardZone,
        playCardWithRegisteredHandler: playCardWithRegisteredHandler,
        pendingChoiceGuard: pendingChoiceGuard,
        setPendingChoice: setPendingChoice,
        registerResponseKind: registerResponseKind,
        aiShouldChallengeGuhuo: function (game, seat, gh) {
          return AIRuntime.aiShouldChallengeGuhuo(game, seat, gh);
        },
        // v15 S1: 亮出为真后把窗口交还原 kind resolver 走正常打出/使用流程。
        responseResolverFor: function (kind) { return RESPONSE_KIND_RESOLVERS[kind]; }
      });
      var playGuhuoDeclare = GuhuoRuntime.playGuhuoDeclare;
      // v15 S1: 各响应窗口 gate 的开窗谓词 (于吉可背面朝上打出任意手牌 →
      // 手上没有所需牌型也要开窗)。晚绑定包装: 调用点在 sha-flow/tricks/
      // damage-dying 域, 装配早于本处。
      function guhuoResponsePossible(game, actor) {
        return GuhuoRuntime.guhuoResponsePossible(game, actor);
      }

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
        legalTargetsForCard: legalTargetsForCard,
        // v14 P2: 方天画戟额外目标前置查询 (AI 多目标启发)
        shaExtraTargetLimit: shaExtraTargetLimit,
        // v15 T: 拼点出牌启发用的点数比较 + 拼点资格 (天义/驱虎 目标挑选)
        cardRankValue: cardRankValue,
        pindianEligible: function (game, actor, targetActor) {
          return PindianRuntime.pindianEligible(game, actor, targetActor);
        },
        // v14 R1: 蛊惑声明 (AI 于吉 v1 无中启发)
        // v15 S2: 全型声明启发 — 目标枚举与借刀受害者候选同步注入
        playGuhuoDeclare: playGuhuoDeclare,
        guhuoAvailable: GuhuoRuntime.guhuoAvailable,
        guhuoLegalTargets: GuhuoRuntime.guhuoLegalTargets,
        jiedaoVictimCandidates: jiedaoVictimCandidates
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
        // v15 T 评审收口 [低 L2]: 攻击范围谓词的公开出口 — UI 的强袭座席
        // 高亮读的就是 `Engine.canReachWithSha`, 而它此前没在公开面上 →
        // 一路走 `: true` 兜底, 3+ 席场会把射程外座席也点亮 (点了才被拒)。
        canReachWithSha: canReachWithSha,
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
        // v15 T: 拼点资格查询 (UI 目标高亮 / AI 决策用)
        pindianEligible: PindianRuntime.pindianEligible,
        // v15 T: 重铸入口与可重铸谓词 (UI 手牌菜单 / AI 决策用)
        recastHandCard: recastHandCard,
        canRecastCard: function (game, actor, cardOrId) {
          var state = game && game[actor];
          var card = typeof cardOrId === 'string'
            ? (state && (state.hand || []).find(function (item) { return item.id === cardOrId; }))
            : cardOrId;
          return canRecastCard(game, actor, card);
        },
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
        // v14 R3: 玩家侧推断提示 UI 用 — 感知阵营路由 (自己/已翻明真值;
        // 暗置按 aggressionLog/stanceLog 行为推断, 证据不足 null; 恒不读
        // 未翻明 roles)。UI 只应以 viewer='player' 调用。
        perceivedSideOf: StateRuntime.perceivedSideOf,
        // v14 R1: 蛊惑 (于吉, 风包现行版) — 使用流程声明/可用性/目标枚举
        // (白名单常量留在 guhuo.js 模块内, 声明合法性经 playGuhuoDeclare
        // 校验, 不另设公开常量面)。
        playGuhuoDeclare: playGuhuoDeclare,
        guhuoAvailable: GuhuoRuntime.guhuoAvailable,
        guhuoLegalTargets: GuhuoRuntime.guhuoLegalTargets,
        // v15 S1: 响应窗口面 — 当前挂起窗口是否可声明 (UI 入口门禁) 与
        // 该窗口的可声明牌名 (声明入口经 resolvePendingChoice({guhuo:…}))。
        guhuoResponseAvailable: GuhuoRuntime.guhuoResponseAvailable,
        guhuoResponseTypes: function (game) {
          return GuhuoRuntime.guhuoResponseMenu(game);
        },
        // v14 P2: 方天画戟额外目标前置查询 (UI 多目标暂存 / AI 目标启发用) —
        // 手牌中仅剩这张【杀】且装备方天 → 2, 否则 0。
        shaExtraTargetLimit: shaExtraTargetLimit,
        // v13 J0-4: 座席级合法目标单点查询 (UI 高亮 / 测试断言用)。
        isLegalCardTarget: isLegalCardTarget,
        // v12 H 复核修复: 借刀受害者候选 (持刀者可 杀 到的座席) — UI 两段
        // 点选 (先选持刀者 An, 再从其候选中选受害者 Bn) 需要, 消除"UI 高亮
        // 合法持刀者但受害者恒缺省自己→点选必败"的不一致。
        jiedaoVictimCandidates: jiedaoVictimCandidates,
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
        // v12 I: AI 进阶第二轮 — profile 路由 / 诚实计数估计 / 目标评估 /
        // 两步 lookahead (供测试与基准对弈)
        aiProfileOf: AIRuntime.aiProfileOf,
        aiUnknownCounts: AIRuntime.aiUnknownCounts,
        aiEstimateShaCountFor: AIRuntime.aiEstimateShaCountFor,
        aiEstimateShanCountFor: AIRuntime.aiEstimateShanCountFor,
        aiEstimateTaoCountFor: AIRuntime.aiEstimateTaoCountFor,
        aiFoeEstimate: AIRuntime.aiFoeEstimate,
        aiHostilityToward: AIRuntime.aiHostilityToward,
        aiPickHostileTarget: AIRuntime.aiPickHostileTarget,
        aiPrimaryFoe: AIRuntime.aiPrimaryFoe,
        aiDeepTurnEval: AIRuntime.aiDeepTurnEval,
        runAITurn: runAITurn,
        opponent: opponent
      };

      if (typeof window !== 'undefined') {
        window.SanguoshaEngine = SanguoshaEngine;
      }
