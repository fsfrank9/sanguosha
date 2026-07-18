      import { SkillRuntime } from './skill-runtime.js';
      import { StateRuntime } from './state.js';

      export function installStandardSkillHandlers(skillRegistry, deps) {
        var hasSkill = deps.hasSkill;
        var opponent = deps.opponent;
        var actorName = deps.actorName;
        var seatList = deps.seatList;
        var isShaType = deps.isShaType;
        var isShaCard = deps.isShaCard;
        // v12 H7: 离间 — 虚拟决斗走无懈链
        var checkWuxieAndContinue = deps.checkWuxieAndContinue;
        var log = deps.log;
        var fail = deps.fail;
        var success = deps.success;
        var clone = deps.clone;
        var takeHandCard = deps.takeHandCard;
        var randomHandIndex = deps.randomHandIndex;
        var firstMatchingCard = deps.firstMatchingCard;
        var firstMatchingOwnCard = deps.firstMatchingOwnCard;
        var equipmentList = deps.equipmentList;
        var drawCards = deps.drawCards;
        var damage = deps.damage;
        var discardCard = deps.discardCard;
        var moveCard = deps.moveCard;
        var removeCardFromHand = deps.removeCardFromHand;
        var putCard = deps.putCard;
        var markHandOrigin = deps.markHandOrigin;
        var judge = deps.judge;
        var resolveJudgementCard = deps.resolveJudgementCard;
        var setPendingChoice = deps.setPendingChoice;
        var requestPlayerResponse = deps.requestPlayerResponse;
        var cardTargetProtection = deps.cardTargetProtection;
        var canReachWithSha = deps.canReachWithSha;
        var weaponRange = deps.weaponRange;
        var distanceBetween = deps.distanceBetween;
        var physicalCardOf = deps.physicalCardOf;
        var applyJudgeAreaOutcome = deps.applyJudgeAreaOutcome;
        var processJudgeArea = deps.processJudgeArea;
        var continueTurnAfterJudgeArea = deps.continueTurnAfterJudgeArea;
        var continueTurnAfterPreparePhase = deps.continueTurnAfterPreparePhase;
        var enterDying = deps.enterDying;
        var isNormalTrickCard = deps.isNormalTrickCard;
        var randomSuit = deps.randomSuit;
        var removeOwnCardFromAnyZone = deps.removeOwnCardFromAnyZone;
        var removeTargetZoneCard = deps.removeTargetZoneCard;
        var restoreZhuqueIdentity = deps.restoreZhuqueIdentity;
        var selectActiveSkillResult = deps.selectActiveSkillResult;
        var setPhase = deps.setPhase;
        var takeCard = deps.takeCard;
        var triggerEquipmentLoss = deps.triggerEquipmentLoss;
        var useSkill = deps.useSkill;
        var reshuffleIfNeeded = deps.reshuffleIfNeeded;
        var playSha = deps.playSha;
        var applyHongyanJudgementView = deps.applyHongyanJudgementView;
        var restoreHongyanJudgementView = deps.restoreHongyanJudgementView;
        var handLimit = deps.handLimit;
        var CARD_INFO = deps.CARD_INFO;
        var scoreCardForAI = deps.scoreCardForAI;

      // ───── v12 F1: 以下技能域函数群自 game-engine.js 整体迁入 ─────
      // 迁移原则: 函数体逐行一致 (verbatim), 依赖经 deps 注入。

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
        // v12 H 骨架修复: reserved hook 改为按座次环扫描 — 此前硬编码
        // ['player','enemy'], 3 人局根本扫不到第三席, "多人激活后自动生效"
        // 的承诺落空。1v1 时 seatList 恒等旧值, 行为不变。
        var others = seatList(game).filter(function (a) {
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

      function shouldTriggerJizhi(card, options) {
        return isNormalTrickCard(card) && !(card.type === 'tiesuo' && options && options.mode === 'recast');
      }

      function triggerJizhi(game, actor, card, options) {
        var state = game[actor];
        if (!state || !hasSkill(state, 'jizhi') || !shouldTriggerJizhi(card, options) || game.phase === 'gameover') return;
        log(game, actorName(game, actor) + '发动【集智】，使用普通锦囊后摸 1 张牌。');
        drawCards(game, actor, 1);
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
        // Auto path: batched draw 2 × amount, keep by default.
        for (var i = 0; i < context.amount; i += 1) {
          var yijiBatch = drawCards(game, targetActor, 2);
          log(game, actorName(game, targetActor) + '发动【遗计】（第 ' + (i + 1) + ' / ' + context.amount + ' 点），摸两张牌。');
          // v13 J1: AI 盟友补血线启发 — 官方语义"将其中的一张牌交给一名角色"
          // (card__hero__wei.md 标/1V1 变体) 允许分给任意座席; 摸到【桃】且
          // 存在低血线 (hp<=2) 友方座席时相赠。1v1 无友方座席 → 恒自留
          // (旧行为零回归)。评审收口: 仅 AI 座席启用 — 玩家席的 auto 档在
          // 大厅按钮语义为"全部留己", 不得代玩家做分牌决策。
          if (targetActor !== 'player') {
            aiYijiGiveToAlly(game, targetActor, yijiBatch);
          }
        }
        return { triggeredYiji: true, drawPairs: context.amount };
      }

      // v13 J1: 遗计 AI 分牌启发 — 找最低血线的存活友方座席 (身份已知且非
      // 敌对), 血线 <=2 时把本点摸到的【桃】交给他。
      function aiYijiGiveToAlly(game, actor, batch) {
        if (!batch || !batch.length) return;
        var allies = StateRuntime.aliveSeats(game).filter(function (seat) {
          return seat !== actor
            && StateRuntime.sideOf(game, seat) !== null
            // v13 M2: 感知路由 (暗置下按已翻明/推断判友方, 明置恒等)。
            && !StateRuntime.perceivedHostile(game, actor, seat);
        });
        if (!allies.length) return;
        var needy = allies.sort(function (a, b) { return game[a].hp - game[b].hp; })[0];
        if (game[needy].hp > 2) return;
        var state = game[actor];
        for (var bi = 0; bi < batch.length; bi += 1) {
          var drawn = batch[bi] && state.hand.find(function (c) { return c.id === batch[bi].id; });
          if (drawn && drawn.type === 'tao') {
            moveCard(game, drawn.id, { zone: 'hand', actor: actor }, { zone: 'hand', actor: needy });
            log(game, actorName(game, actor) + '将【遗计】所摸的【' + drawn.name + '】交给' + actorName(game, needy) + '。');
            return;
          }
        }
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
          // v13 J1: 可分配座席清单 (官方"交给一名角色"含任意存活座席) —
          // 面板据此渲染逐牌座席轮换; 1v1 恒 [对手单席]。
          seats: StateRuntime.aliveSeats(game).filter(function (seat) {
            return seat !== targetActor;
          }).map(function (seat) {
            return { seat: seat, name: game[seat].name };
          }),
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

      // v12 G1 (修复批): 据守 (曹仁·风) — gltjk wind spec: "结束阶段开始时,
      // 你可以摸三张牌, 然后将你的武将牌翻面"。翻面由 startTurn 消费: 轮到
      // 武将牌被翻面的角色时翻回正面并跳过该回合。此前实现只置 turnedOver
      // 标记而引擎无任何消费点 — 摸三张零代价, 修复补上跳过回合机制。
      // 默认自动发动, skillPreferences.jushou='decline' 可关 (妄尊同款)。
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
        log(game, actorName(game, actor) + '发动【据守】，摸三张牌并将武将牌' + (state.turnedOver ? '翻面。' : '翻回正面。'));
        return { triggeredJushou: true };
      }

      // v12 G1 (修复批): 狂骨 (魏延·风) — 锁定技: "当你对距离 1 以内的一名
      // 角色造成 1 点伤害后, 你回复 1 点体力"。修复两处规则偏差: 补距离 ≤1
      // 前置判定 (此前无距离约束), 回复量按伤害点数逐点计 (此前恒 +1)。
      // 锁定技不设 pref 开关。1v1 中"击杀后不回复"边界不可达 (目标死亡即
      // gameover, finishDamageAfter 不再派发 hooks), 不建模。
      function triggerKuangguDamageAfter(context) {
        var game = context.game;
        var sourceActor = context.sourceActor;
        var targetActor = context.targetActor;
        var source = game[sourceActor];
        if (!source || !hasSkill(source, 'kuanggu') || game.phase === 'gameover') return null;
        if (distanceBetween(game, sourceActor, targetActor) > 1) return null;
        var heal = Math.min(source.maxHp - source.hp, context.amount || 0);
        if (heal <= 0) return null;
        source.hp += heal;
        log(game, actorName(game, sourceActor) + '的【狂骨】发动，回复 ' + heal + ' 点体力。');
        return { triggeredKuanggu: true };
      }

      // v12 G1 (修复批): 烈弓 (黄忠·风) — "当你于出牌阶段内使用【杀】指定一个
      // 目标后, 若该角色的手牌数不小于你的体力值或不大于你的攻击范围, 你可以
      // 令其不能使用【闪】响应此【杀】"。修复三处: 攻击范围改用 weaponRange
      // (此前读不存在的 state.attackRange, 恒 undefined → 该分支永不触发);
      // 限定"自己回合内使用的【杀】" (借刀强制出杀不在自己出牌阶段, 不触发);
      // 补 isShaCard 守卫防未来非杀响应场景误触发。铁骑同款 pref:
      // skillPreferences.liegong='decline' 跳过。
      function triggerLiegongNeedResponse(game, actor, targetActor, responseType, triggeringCard) {
        var source = game[actor];
        var target = game[targetActor];
        if (responseType !== 'shan' || !isShaCard(triggeringCard)) return null;
        if (!source || !target || !hasSkill(source, 'liegong')) return null;
        if (game.turn !== actor) return null;
        var pref = source.skillPreferences && source.skillPreferences.liegong;
        if (pref === 'decline') {
          log(game, actorName(game, actor) + '选择不发动【烈弓】。');
          return null;
        }
        var targetHand = (target.hand || []).length;
        if (targetHand < source.hp && targetHand > weaponRange(source)) return null;
        log(game, actorName(game, actor) + '发动【烈弓】，' + actorName(game, targetActor) + '不能使用【闪】响应此【杀】。');
        return { responseLocked: true };
      }

      // v11 C7 (批次 31): 耀武 (华雄) — 锁定技。gltjk skill cache:
      //   "当你受到红色【杀】造成的伤害后, 伤害来源选择一项:
      //    回复 1 点体力, 或摸一张牌。"
      // 选择权在伤害来源: AI/auto 来源按 受伤→回血 否则→摸牌; 玩家来源
      // 经 pendingChoice 'yaowu-reward' 面板二选一 (体力满时只能摸牌)。
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
        // v13 审计三轮: 刚烈成本为"弃置两张手牌" (card__hero__wei.md 各变体
        // 措辞一致) — 仅手牌可作候选; 此前误把装备区牌一并列入 (手牌与
        // 装备是不同区域, 装备不能顶替手牌成本)。手牌不足两张时无此选项,
        // 只能受 1 点伤害 (runGanglieJudgement 的 <2 门槛沿用本清单)。
        var list = [];
        if (source.hand) {
          source.hand.forEach(function (c) {
            list.push({ zone: 'hand', id: c.id, name: c.name, suit: c.suit, rank: c.rank });
          });
        }
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
      // v13 评审收口: 判定改判技持有者座次环扫描 (鬼才/鬼道共用) —
      // 自判定归属者起顺时针, 首个存活、持技且付得起成本的座席。
      function findRingSkillHolder(game, anchorActor, skillId, canPay) {
        var order = StateRuntime.seatsFrom(game, anchorActor, true);
        for (var i = 0; i < order.length; i += 1) {
          var s = game[order[i]];
          if (s && s.hp > 0 && hasSkill(s, skillId) && canPay(s)) return order[i];
        }
        return null;
      }

      function triggerGuicaiJudgementBeforeResolve(context) {
        var game = context.game;
        var judgementActor = context.actor;
        var originalCard = context.originalCard || context.card;
        if (!game || !originalCard || context.replaced) return null;
        // Find any actor at the table who can fire 鬼才.
        // v13 审计三轮: 座次环扫描 (判定归属者起顺时针) — 此前二元
        // [judgementActor, opponent(judgementActor)], 3p 第三席的鬼才恒不可达。
        var holder = findRingSkillHolder(game, judgementActor, 'guicai', function (s) {
          return s.hand && s.hand.length > 0;
        });
        if (!holder) return null;
        var holderState = game[holder];
        var pref = (holderState.skillPreferences && holderState.skillPreferences.guicai)
          || (holder === 'player' ? 'ask' : 'auto');
        if (pref === 'decline') {
          log(game, actorName(game, holder) + '选择不发动【鬼才】。');
          return { declinedGuicai: true };
        }
        // v13 张角修缮-3: 同一判定已有改判询问挂起时不再叠问 (双改判者同场
        // 时后到者退让 — 单快照架构不支持对同一在途判定的连环改判)。
        var guicaiAlreadyAsking = game.pendingChoice
          && (game.pendingChoice.kind === 'guicai-replace' || game.pendingChoice.kind === 'guidao-replace')
          && game.pendingChoice.judgementActor === judgementActor;
        if (pref === 'ask' && context.pausable && !guicaiAlreadyAsking) {
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
        // v13 张角修缮-2: 玩家鬼才不落 auto — 不可挂起的判定时机 (八卦/刚烈/
        // 铁骑等内嵌判定) 无法开面板时明示跳过, 不替玩家烧手牌乱换 (与鬼道
        // 同款加固)。显式 guicai='auto' 保留旧口径。
        if (holder === 'player' && pref !== 'auto') {
          log(game, actorName(game, holder) + '的【鬼才】时机不可挂起，本次跳过。');
          return { skippedGuicai: true };
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
        // v12 H 骨架修复: 按 game.seats 座次环遍历 (1v1 恒等旧值)。
        seatList(game).forEach(function (a) {
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
        log(game, actorName(game, actor) + '发动【苦肉】，失去 1 点体力。');
        // v13 审计三轮: 官方顺序 — 扣减体力事件内嵌濒死结算 (体力至 0 立即
        // 濒死, flow__decreaselife.md), 完整落定后才执行"然后摸两张牌";
        // 濒死中死亡则不再摸牌; 濒死 ask 挂起时摸牌挂入 deferredAfterDying
        // 延后回调 (v12 G2 天香补牌同款), 救回后续跑。此前先摸牌后濒死,
        // 顺序与官方相反。
        if (self.hp <= 0 && game.phase !== 'gameover') {
          enterDying(game, actor, actor);
          if (game.pauseState && game.pauseState.dying) {
            if (!game.pauseState.deferredAfterDying) game.pauseState.deferredAfterDying = [];
            game.pauseState.deferredAfterDying.push(function () {
              if (game.phase !== 'gameover' && self.hp > 0) {
                log(game, actorName(game, actor) + '因【苦肉】摸两张牌。');
                drawCards(game, actor, 2);
              }
            });
            return success('苦肉：等待濒死结算。');
          }
          if (game.phase === 'gameover' || self.hp <= 0) {
            return success('苦肉：角色未能脱离濒死。');
          }
        }
        log(game, actorName(game, actor) + '因【苦肉】摸两张牌。');
        drawCards(game, actor, 2);
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
        // v12 H5: 目标经 context.targetActor (options.target 校验后缺省对手)
        var targetActor = context.targetActor || opponent(actor);
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
        self.flags.fanjianUsed = true;
        // v13 审计三轮: 官方顺序 = 目标先声明花色, 然后才获得牌并展示
        // (card__hero__wu.md "选择一种花色…先获得…再展示之")。此前先
        // putCard 进目标手牌再询问 — 人类目标可直接从手牌区读出真实花色,
        // 永不猜错。现牌在猜测落定前保持在途 (pauseState.fanjian)。
        log(game, actorName(game, actor) + '发动【反间】，令' + actorName(game, targetActor) + '猜测所交牌的花色。');

        // Backward-compat override: explicit guess from caller skips the prompt.
        if (options.guessedSuit) {
          return applyFanjianGuess(game, actor, targetActor, fanjianCard, options.guessedSuit);
        }

        if (targetActor === 'player') {
          // pendingChoice 只暴露牌名不暴露花色; 实体牌在途暂存。
          if (!game.pauseState) game.pauseState = {};
          game.pauseState.fanjian = { card: fanjianCard, sourceActor: actor, targetActor: targetActor };
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

      function applyFanjianGuess(game, sourceActor, targetActor, fanjianCard, guessedSuit) {
        // 猜测落定 → 目标获得牌并展示 → 比对花色。
        putCard(game, fanjianCard, { zone: 'hand', actor: targetActor });
        log(game, actorName(game, targetActor) + '猜测花色为「' + guessedSuit + '」，获得并展示【' + fanjianCard.name + '】（实际：' + fanjianCard.suit + '）。');
        if (guessedSuit !== fanjianCard.suit) {
          log(game, '猜错，' + actorName(game, targetActor) + '受到 1 点伤害。');
          damage(game, targetActor, 1, sourceActor, '【反间】', null, 'normal');
        } else {
          log(game, '猜对，无伤害。');
        }
        return success('反间完成。');
      }

      function resolveFanjianGuessChoice(game, pending, decision) {
        var saved = game.pauseState && game.pauseState.fanjian;
        if (!saved) return fail('找不到【反间】的暂停状态。');
        var guess = decision && decision.suit;
        if (['spade', 'heart', 'club', 'diamond'].indexOf(guess) < 0) {
          // Restore pending so UI can keep prompting on invalid input.
          setPendingChoice(game, pending);
          return fail('请选择有效的花色（spade/heart/club/diamond）。');
        }
        game.pauseState.fanjian = null;
        return applyFanjianGuess(game, saved.sourceActor, saved.targetActor, saved.card, guess);
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
        // v13 J1: 逐席分配 — decision.assignments = [{cardId, seat}] 可把
        // 每张牌交给任意其他存活座席 (官方 "将其中的一张牌交给一名角色",
        // card__hero__wei.md 标/1V1 变体; 未分配 = 留给自己)。旧 decision
        // 形状 giveIds 兼容保留: 等价于全部交给 1v1 对手 (行为零回归)。
        var assignments;
        if (Array.isArray(decision.assignments)) {
          assignments = decision.assignments;
        } else {
          var giveIds = Array.isArray(decision.giveIds) ? decision.giveIds : [];
          assignments = giveIds.map(function (id) { return { cardId: id, seat: opponent(actor) }; });
        }
        var movedBySeat = {};
        var movedAny = false;
        for (var i = 0; i < assignments.length; i += 1) {
          var entry = assignments[i];
          if (!entry || pending.drawnIds.indexOf(entry.cardId) < 0) continue;
          var seat = StateRuntime.resolveSeatOption(game, entry.seat);
          if (!seat || seat === actor || !game[seat] || game[seat].hp <= 0) continue;
          var card = moveCard(game, entry.cardId, { zone: 'hand', actor: actor }, { zone: 'hand', actor: seat });
          if (!card) continue;
          (movedBySeat[seat] = movedBySeat[seat] || []).push(card.name);
          movedAny = true;
        }
        if (!movedAny) {
          log(game, actorName(game, actor) + '将【遗计】本点所摸的牌全部留给自己。');
        } else {
          Object.keys(movedBySeat).forEach(function (seat) {
            var names = movedBySeat[seat];
            log(game, actorName(game, actor) + '将【遗计】本点所摸的 ' + names.length + ' 张牌交给' + actorName(game, seat) + '：' + names.join('、') + '。');
          });
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
        // v13 张角修缮-3: 雷击内嵌判定的挂起走独立快照 (pauseState.leiji)。
        var leijiResolved = resolveJudgementReplaceForLeiji(game, pending, decision, {
          requireBlack: false, skillLabel: '鬼才', playVerb: '用', replaceVerb: '代替'
        });
        if (leijiResolved) return leijiResolved;
        var saved = game.pauseState && game.pauseState.judgeArea;
        if (!saved || saved.actor !== judgementActor) return fail('找不到挂起的判定。');
        var originalCard = saved.currentJudgementCard;
        var resolvedCard = originalCard;
        var declined = !decision.cardId;
        if (!declined) {
          var replacement = takeCard(game, decision.cardId, { zone: 'hand', actor: holder });
          // v12 G2 修复: 与鬼道同款 — 未找到牌必须重挂, 否则判定挂起悬空。
          if (!replacement) {
            setPendingChoice(game, pending);
            return fail('找不到这张牌。');
          }
          // v12 G2 复核修复: 原判定牌不经 resolveJudgementCard 离场 — 弃置前
          // 还原红颜视图, 否则物理牌花色被永久改写 (牌堆完整性)。
          if (originalCard) discardCard(game, restoreHongyanJudgementView(originalCard));
          resolvedCard = replacement;
          // 替换牌成为新判定牌, 未经 judge() → 在此补施红颜视图 (判定归属者)。
          applyHongyanJudgementView(game, judgementActor, resolvedCard);
          log(game, actorName(game, holder) + '发动【鬼才】，用【' + replacement.name + '】' + replacement.suit + ' ' + replacement.rank + '（' + replacement.id + '）代替' + actorName(game, judgementActor) + '的判定牌。');
        } else {
          log(game, actorName(game, holder) + '选择不发动【鬼才】。');
        }
        applyJudgeAreaOutcome(game, judgementActor, judgementActorState, saved.currentTrick, saved.currentReason, resolvedCard);
        // Resume the iteration from the trick AFTER the one we just resolved.
        // v13 评审收口: 保留 J0-2 无懈簿记字段 (快照形状与主循环一致)。
        game.pauseState.judgeArea = {
          actor: judgementActor,
          pending: saved.pending,
          idx: saved.idx + 1,
          wuxieDoneIdx: saved.wuxieDoneIdx,
          wuxieResults: saved.wuxieResults || {}
        };
        // v13 评审收口: outcome 结算本身可产生待玩家选择 (闪电命中致濒死
        // 求桃等) — 此前不检查直接续跑, 濒死挂起时回合被双推进。挂起并
        // 标记 outcomeApplied, 由 resumeSuspendedTurnFlowIfReady 在选择
        // 排空后续跑 (与 processJudgeArea 主循环 H2 分支同款)。
        if (game.pendingChoice) {
          game.pauseState.judgeArea.outcomeApplied = true;
          return success('继续等待玩家选择。');
        }
        var resumeResult = processJudgeArea(game, judgementActor);
        if (resumeResult && resumeResult.suspended) {
          return success('继续等待玩家选择。');
        }
        if (game.phase === 'gameover') return success('游戏结束。');
        // Judge area fully resolved — continue the turn flow (draw + play).
        return continueTurnAfterJudgeArea(game, judgementActor);
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

      function triggerBiyue(game, actor) {
        var state = game[actor];
        if (!state || !hasSkill(state, 'biyue') || game.phase === 'gameover') return;
        state.flags = state.flags || {};
        if (state.flags.biyueTriggered) return;
        state.flags.biyueTriggered = true;
        log(game, actorName(game, actor) + '发动【闭月】，结束阶段摸 1 张牌。');
        drawCards(game, actor, 1);
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

        // ───── v12 G2: 风包第二批 — 神速/天香/雷击/鬼道/不屈 (红颜为
        // judge-area/state 花色视同层, 无 handler) ─────

        // 神速 (夏侯渊) — gltjk wind spec: "你可以选择一至两项: 1.跳过判定
        // 阶段和摸牌阶段; 2.跳过出牌阶段并弃置一张装备牌。你每选择一项,
        // 视为你使用一张无距离限制的【杀】"。判定阶段开始前声明; 该杀不占
        // 出牌阶段使用次数 (playSha options.skipShaCount)。
        function shensuVirtualSha(game, actor, seq) {
          return { id: 'virtual-shensu-' + actor + '-' + (game.turnHistory ? game.turnHistory.length : 0) + '-' + seq,
                   name: '杀', type: 'sha', suit: 'none', rank: '-', color: 'none', virtual: true };
        }

        function shensuEquipCandidates(state) {
          var equipped = equipmentList(state);
          var handEquips = (state.hand || []).filter(function (c) {
            var info = CARD_INFO[c.type];
            return info && info.family === 'equipment';
          });
          return equipped.concat(handEquips);
        }

        function applyShensuOption(game, actor, optionIndex, equipCardId) {
          var state = game[actor];
          if (optionIndex === 2) {
            var equipCard = removeOwnCardFromAnyZone(state, equipCardId, game);
            if (!equipCard) return fail('【神速】选项二需要弃置一张装备牌。');
            discardCard(game, equipCard);
            state.flags.skipPlay = true;
            log(game, actorName(game, actor) + '发动【神速】(选项二)：跳过出牌阶段并弃置【' + equipCard.name + '】。');
          } else {
            state.flags.skipJudge = true;
            state.flags.skipDraw = true;
            log(game, actorName(game, actor) + '发动【神速】(选项一)：跳过判定阶段和摸牌阶段。');
          }
          log(game, actorName(game, actor) + '视为使用一张无距离限制的【杀】。');
          return playSha(game, actor, shensuVirtualSha(game, actor, optionIndex), { ignoreDistance: true, skipShaCount: true });
        }

        function triggerShensuPrepare(game, actor) {
          var state = game[actor];
          if (!state || !hasSkill(state, 'shensu') || game.phase === 'gameover') return null;
          var pref = state.skillPreferences && state.skillPreferences.shensu;
          if (pref === 'decline') return null;
          if (actor === 'player') {
            var candidates = shensuEquipCandidates(state);
            setPendingChoice(game, {
              kind: 'shensu-options',
              actor: actor,
              canOptionTwo: candidates.length > 0,
              equipCandidates: candidates.map(function (c) {
                return { id: c.id, name: c.name, type: c.type, suit: c.suit, rank: c.rank };
              })
            });
            return { suspended: true };
          }
          // AI 座席: 保守启发 — 仅当对手 1 血时用选项一抢斩 (选项二弃装备
          // 换杀期望值普遍为负, 不启用)。虚拟杀若为玩家开出闪响应窗口,
          // 挂 prepareResume 交由选择排空后续跑回合。
          var foe = opponent(actor);
          // v12 G2 修复: hp <= 1 会把已死 (hp 0) 对手也算进来 — 收紧为恰好
          // 1 血 (存活) 才抢斩。
          if (game[foe] && game[foe].hp === 1) {
            applyShensuOption(game, actor, 1);
            if (game.pendingChoice) {
              if (!game.pauseState) game.pauseState = {};
              game.pauseState.prepareResume = { actor: actor };
              return { suspended: true };
            }
          }
          return null;
        }

        function resolveShensuOptionsChoice(game, pending, decision) {
          var actor = pending.actor;
          var state = game[actor];
          if (!state) return fail('未知角色。');
          var options = decision && Array.isArray(decision.options) ? decision.options.slice() : [];
          // v12 G2 复核修复: 先全量校验、后逐一应用 — 此前"选项一已发动、
          // 选项二非法"时原决策整包重挂, 重试会重放已成功的选项一 (违反
          // "每回合每个选项至多一次", 多打一张无距离杀)。校验通过后应用
          // 阶段不再存在可失败路径, 也就不再需要中途重挂。
          var invalid = options.some(function (o) { return o !== 1 && o !== 2; });
          if (invalid) {
            setPendingChoice(game, pending);
            return fail('【神速】选项只能是 1 或 2。');
          }
          if (options.indexOf(2) >= 0) {
            if (!decision.equipCardId) {
              setPendingChoice(game, pending);
              return fail('【神速】选项二需要指定要弃置的装备牌。');
            }
            var equipOk = shensuEquipCandidates(state).some(function (c) { return c.id === decision.equipCardId; });
            if (!equipOk) {
              setPendingChoice(game, pending);
              return fail('【神速】选项二指定的装备牌不存在或不是装备牌。');
            }
          }
          if (!options.length) {
            log(game, actorName(game, actor) + '选择不发动【神速】。');
          } else {
            // 官方顺序: 选项一 (跳判定+摸牌) 先于 选项二 (跳出牌) 结算。
            options.sort();
            for (var i = 0; i < options.length; i += 1) {
              applyShensuOption(game, actor, options[i], decision.equipCardId);
              if (game.phase === 'gameover') return success('游戏结束。');
            }
          }
          if (game.pendingChoice) {
            // 虚拟杀开出了新的响应窗口 (罕见: 玩家杀 → AI 暂停不会发生;
            // 防御性兜底) — 挂 prepareResume 由排空后续跑。
            if (!game.pauseState) game.pauseState = {};
            game.pauseState.prepareResume = { actor: actor };
            return success('【神速】结算中，等待响应。');
          }
          return continueTurnAfterPreparePhase(game, actor);
        }

        // 天香 (小乔) — gltjk wind spec: "当你受到伤害时, 你可以弃置一张
        // 红桃手牌, 将此伤害转移给你攻击范围内的一名其他角色, 然后其摸
        // X 张牌 (X 为其已损失的体力值)"。
        // v13 J3: ask 升级 — 玩家 (tianxiang='ask') 由 damage() 入口挂起
        // 询问 (伤害流暂停框架), resolver 以 opts.tianxiangDecision 重入本
        // 钩子强制执行; 放弃以 opts.noTianxiangAsk 重入 (本钩子跳过)。
        // AI 沿用 auto (伤害≥2 或致命时转移) / always / decline 三态; 转移
        // 目标泛化为攻击范围内任意其他存活座席 (敌对优先, 1v1 恒为对手)。
        // 红颜联动: 黑桃手牌经 effectiveCardSuit 视为红桃, 可作成本。
        function tianxiangTransferContext(context, transferee, cost) {
          var game = context.game;
          var targetActor = context.targetActor;
          var state = game[targetActor];
          removeCardFromHand(state, cost.id);
          discardCard(game, cost);
          log(game, actorName(game, targetActor) + '发动【天香】，弃置【' + cost.name + '】' + cost.suit + ' ' + cost.rank + '，将伤害转移给' + actorName(game, transferee) + '。');
          context.transferTo = transferee;
          context.onTransferred = function (g, t) {
            var ts = g[t];
            if (!ts || ts.hp <= 0) return;
            var lost = Math.max(0, (ts.maxHp || 0) - ts.hp);
            if (lost > 0) {
              drawCards(g, t, lost);
              log(g, actorName(g, t) + '因【天香】摸 ' + lost + ' 张牌。');
            }
          };
          return { triggeredTianxiang: true };
        }

        function triggerTianxiangDamageModify(context) {
          var game = context.game;
          var targetActor = context.targetActor;
          var state = game[targetActor];
          if (!state || !hasSkill(state, 'tianxiang') || game.phase === 'gameover') return null;
          var opts = context.opts || {};
          if (opts.noTianxiangTransfer) return null;
          var amount = Number(context.amount) || 0;
          if (amount <= 0) return null;
          // v13 J3: resolver 重入 — 按玩家决策强制执行 (跳过偏好/期望值)。
          if (opts.tianxiangDecision) {
            var dec = opts.tianxiangDecision;
            var decCost = (state.hand || []).find(function (c) { return c.id === dec.costCardId; });
            var decTarget = game[dec.transferTo];
            if (!decCost || !decTarget || decTarget.hp <= 0) return null;
            return tianxiangTransferContext(context, dec.transferTo, decCost);
          }
          if (opts.noTianxiangAsk) return null; // 玩家已放弃
          var pref = (state.skillPreferences && state.skillPreferences.tianxiang) || 'auto';
          if (pref === 'decline') return null;
          if (pref === 'ask') return null; // ask 挂起由 damage() 入口负责
          // v13 J3: 转移目标泛化 — 攻击范围内其他存活座席, 敌对优先;
          // 1v1 恒为 [对手], 行为不变 (候选谓词与 damage() ask 面板共用
          // StateRuntime.seatsInShaRangeOf, 消除漂移风险)。
          var candidates = StateRuntime.seatsInShaRangeOf(game, targetActor);
          if (!candidates.length) return null;
          var pool = StateRuntime.perceivedHostileFirstPool(game, targetActor, candidates);
          var transferee = pool.indexOf(opponent(targetActor)) >= 0 ? opponent(targetActor) : pool[0];
          var lethal = state.hp - amount <= 0;
          if (pref !== 'always' && !(amount >= 2 || lethal)) return null;
          var costs = (state.hand || []).filter(function (c) {
            return StateRuntime.effectiveCardSuit(state, c) === 'heart';
          });
          if (!costs.length) return null;
          var cost = costs
            .map(function (c) { return { card: c, score: scoreCardForAI(game, targetActor, c) }; })
            .sort(function (a, b) { return a.score - b.score; })[0].card;
          return tianxiangTransferContext(context, transferee, cost);
        }

        // 雷击 (张角) — gltjk wind spec: "当你使用或打出【闪】时, 你可以令
        // 一名其他角色进行判定: 若结果为黑桃, 你对该角色造成 2 点雷电伤害"。
        // v13 审计三轮: 目标泛化为任意其他存活座席 (敌对优先, 1v1 恒对手;
        // 此前二元 opponent(), 3p 下张角非 player/enemy 席时恒指错)。判定
        // 归目标 (红颜小乔判雷击 黑桃视为红桃 → 永不命中, 由 judge() 视同
        // 层自然覆盖)。auto/decline 偏好 (铁骑惯例); options.target 可显式
        // 指定 (供 future ask 面板)。
        function leijiCandidates(game, actor) {
          return StateRuntime.aliveSeats(game).filter(function (seat) {
            return seat !== actor && game[seat].hp > 0;
          });
        }

        function leijiAutoTarget(game, actor, candidates, requested) {
          var pool = StateRuntime.perceivedHostileFirstPool(game, actor, candidates);
          return (requested && requested !== actor && candidates.indexOf(requested) >= 0)
            ? requested
            : (pool.indexOf(opponent(actor)) >= 0 ? opponent(actor) : pool[0]);
        }

        function executeLeijiJudgement(game, actor, targetActor) {
          var target = game[targetActor];
          if (!target || target.hp <= 0) return null;
          log(game, actorName(game, actor) + '发动【雷击】，令' + actorName(game, targetActor) + '进行判定。');
          // v13 张角修缮-3: 雷击判定可挂起 — 改判 (鬼才/鬼道) 的 ask 面板得以
          // 打开 (张角核心配合: 雷击判定非黑桃时用鬼道补成黑桃)。雷击判定不在
          // 判定阶段主循环内, 挂起快照落 pauseState.leiji (而非 judgeArea),
          // 由改判 resolver 的雷击分支 (resolveJudgementReplaceForLeiji) 完成
          // 伤害结算。已有 pendingChoice 时不可挂起 (改判 hook 落 skip/auto)。
          var canPause = !game.pendingChoice;
          var leijiJudge = judge(game, targetActor, '【雷击】', { pausable: canPause });
          var pendingKind = game.pendingChoice && game.pendingChoice.kind;
          if ((pendingKind === 'guicai-replace' || pendingKind === 'guidao-replace')
              && game.pendingChoice.judgementActor === targetActor) {
            if (!game.pauseState) game.pauseState = {};
            game.pauseState.leiji = {
              sourceActor: actor,
              targetActor: targetActor,
              currentJudgementCard: leijiJudge
            };
            return { suspendedForLeijiJudgement: true };
          }
          return finishLeijiJudgement(game, actor, targetActor, leijiJudge);
        }

        function finishLeijiJudgement(game, actor, targetActor, leijiJudge) {
          var target = game[targetActor];
          var hit = !!(leijiJudge && leijiJudge.suit === 'spade');
          resolveJudgementCard(game, targetActor, target, '【雷击】', leijiJudge);
          if (hit) {
            log(game, '【雷击】判定为黑桃，' + actorName(game, targetActor) + '受到 2 点雷电伤害。');
            damage(game, targetActor, 2, actor, '【雷击】', null, 'thunder');
          } else {
            log(game, '【雷击】判定未中。');
          }
          return { triggeredLeiji: true };
        }

        // v13 张角修缮-3: 雷击内嵌判定的改判续跑 — 鬼才/鬼道 resolver 共用
        // 分支。挂起快照在 pauseState.leiji; 替换/放弃后在此完成雷击伤害
        // 结算。返回 null = 无雷击挂起, 调用方继续走判定阶段 (judgeArea) 分支。
        function resolveJudgementReplaceForLeiji(game, pending, decision, opts) {
          var saved = game.pauseState && game.pauseState.leiji;
          var judgementActor = pending.judgementActor || pending.actor;
          if (!saved || saved.targetActor !== judgementActor) return null;
          var holder = pending.actor;
          var holderState = game[holder];
          if (!holderState) return fail('未知角色。');
          var originalCard = saved.currentJudgementCard;
          var resolvedCard = originalCard;
          if (decision.cardId) {
            var chosen = (holderState.hand || []).find(function (c) { return c.id === decision.cardId; });
            if (!chosen) {
              setPendingChoice(game, pending);
              return fail('找不到这张牌。');
            }
            if (opts.requireBlack && chosen.color !== 'black') {
              setPendingChoice(game, pending);
              return fail('【' + opts.skillLabel + '】只能打出黑色牌。');
            }
            var replacement = takeCard(game, decision.cardId, { zone: 'hand', actor: holder });
            if (!replacement) {
              setPendingChoice(game, pending);
              return fail('找不到这张牌。');
            }
            // 同 judge-area 分支: 原判定牌还原红颜视图后弃置, 替换牌补施视图。
            if (originalCard) discardCard(game, restoreHongyanJudgementView(originalCard));
            resolvedCard = replacement;
            applyHongyanJudgementView(game, judgementActor, resolvedCard);
            log(game, actorName(game, holder) + '发动【' + opts.skillLabel + '】，' + opts.playVerb + '【' + replacement.name + '】' + replacement.suit + ' ' + replacement.rank + '（' + replacement.id + '）' + opts.replaceVerb + actorName(game, judgementActor) + '的判定牌。');
          } else {
            log(game, actorName(game, holder) + '选择不发动【' + opts.skillLabel + '】。');
          }
          game.pauseState.leiji = null;
          finishLeijiJudgement(game, saved.sourceActor, judgementActor, resolvedCard);
          if (game.phase === 'gameover') return success('游戏结束。');
          return success('【雷击】判定结算完成。');
        }

        function triggerLeijiShanUsed(context) {
          var game = context.game;
          var actor = context.actor;
          var state = game[actor];
          if (!state || !hasSkill(state, 'leiji') || game.phase === 'gameover') return null;
          var pref = state.skillPreferences && state.skillPreferences.leiji;
          if (pref === 'decline') {
            log(game, actorName(game, actor) + '选择不发动【雷击】。');
            return null;
          }
          var candidates = leijiCandidates(game, actor);
          if (!candidates.length) return null;
          // v13 张角修缮-1: 官方"可以"= 可选发动 — 玩家缺省询问 (延迟到当前
          // 结算同步走完: 这里只挂 pendingChoice, 既有队列/轮询机制会在结算
          // 后暂停等玩家; 显式 leiji='auto' 保留旧直发口径)。AI 席位照旧
          // 直发 (敌先池目标)。
          if (actor === 'player' && pref !== 'auto') {
            setPendingChoice(game, {
              kind: 'leiji-ask',
              actor: actor,
              candidates: candidates.map(function (seat) {
                return { seat: seat, name: actorName(game, seat) };
              })
            });
            return { suspendedForLeiji: true };
          }
          var requested = StateRuntime.resolveSeatOption(game, context.options && context.options.target);
          return executeLeijiJudgement(game, actor, leijiAutoTarget(game, actor, candidates, requested));
        }

        // v13 张角修缮-1: 雷击询问 resolver — decline 跳过; target 显式指定;
        // auto (soak 驱动) 沿用旧敌先池目标。
        function resolveLeijiAskChoice(game, pending, decision) {
          var actor = pending.actor;
          var candidates = leijiCandidates(game, actor);
          if (!decision || decision.decline || (!decision.target && !decision.auto) || !candidates.length) {
            log(game, actorName(game, actor) + '选择不发动【雷击】。');
            return success('已跳过【雷击】。');
          }
          var targetActor = decision.auto
            ? leijiAutoTarget(game, actor, candidates, null)
            : StateRuntime.resolveSeatOption(game, decision.target);
          if (!targetActor || candidates.indexOf(targetActor) < 0) return fail('无效的【雷击】目标。');
          var executed = executeLeijiJudgement(game, actor, targetActor);
          if (executed && executed.suspendedForLeijiJudgement) return success('等待改判选择。');
          return success('【雷击】结算完成。');
        }

        // 鬼道 (张角) — gltjk wind spec: "当一名角色的判定牌生效前, 你可以
        // 打出一张黑色牌替换之"。机制与 鬼才 同构, 候选限黑色手牌; 玩家默认
        // ask (pausable 判定挂面板), AI auto 取最低分黑牌。
        function guidaoBlackHand(state) {
          return (state.hand || []).filter(function (c) { return c.color === 'black'; });
        }

        function triggerGuidaoJudgementBeforeResolve(context) {
          var game = context.game;
          var judgementActor = context.actor;
          var originalCard = context.originalCard || context.card;
          if (!game || !originalCard || context.replaced) return null;
          // v13 审计三轮: 座次环扫描 (与鬼才共用 findRingSkillHolder) —
          // 此前二元 opponent(), 3p 第三席的鬼道持有者恒不可达。
          var holder = findRingSkillHolder(game, judgementActor, 'guidao', function (s) {
            return guidaoBlackHand(s).length > 0;
          });
          if (!holder) return null;
          var holderState = game[holder];
          var pref = (holderState.skillPreferences && holderState.skillPreferences.guidao)
            || (holder === 'player' ? 'ask' : 'auto');
          if (pref === 'decline') {
            log(game, actorName(game, holder) + '选择不发动【鬼道】。');
            return { declinedGuidao: true };
          }
          var blackCards = guidaoBlackHand(holderState);
          // v13 张角修缮-3: 同一判定已有改判询问挂起时不再叠问 (同鬼才 hook)。
          var guidaoAlreadyAsking = game.pendingChoice
            && (game.pendingChoice.kind === 'guicai-replace' || game.pendingChoice.kind === 'guidao-replace')
            && game.pendingChoice.judgementActor === judgementActor;
          if (pref === 'ask' && context.pausable && !guidaoAlreadyAsking) {
            setPendingChoice(game, {
              kind: 'guidao-replace',
              actor: holder,
              judgementActor: judgementActor,
              reason: context.reason || '',
              judgementCard: {
                id: originalCard.id, name: originalCard.name,
                type: originalCard.type, suit: originalCard.suit,
                rank: originalCard.rank
              },
              candidates: blackCards.map(function (c) {
                return { id: c.id, name: c.name, type: c.type, suit: c.suit, rank: c.rank };
              })
            });
            return { suspendedForGuidao: true };
          }
          // v13 张角修缮-2: 玩家鬼道永不 auto — 非可挂起判定时机 (八卦/
          // 刚烈/铁骑/雷击内嵌判定) 无法开面板时明示跳过, 而不是替玩家拿
          // 最低分黑牌乱换 (用户实测: 自己的雷击黑桃判定被自己的鬼道自动
          // 换成梅花 → "黑桃不命中")。显式 guidao='auto' 保留旧口径。
          if (holder === 'player' && pref !== 'auto') {
            log(game, actorName(game, holder) + '的【鬼道】时机不可挂起，本次跳过。');
            return { skippedGuidao: true };
          }
          // v13 张角修缮-3: 雷击判定的 AI 鬼道 — 只在能把非黑桃改成黑桃时发动
          // (原判定已黑桃则不动; 目标有红颜则黑桃视为红桃恒不命中, 白弃不发;
          // 此前无脑最低分黑牌替换, AI 张角会亲手换掉自己雷击的黑桃判定)。
          if (context.reason === '【雷击】') {
            if (originalCard.suit === 'spade') return null;
            if (hasSkill(game[judgementActor], 'hongyan')) return null;
            var guidaoSpades = blackCards.filter(function (c) { return c.suit === 'spade'; });
            if (!guidaoSpades.length) return null;
            blackCards = guidaoSpades;
          }
          var sortedGuidao = blackCards
            .map(function (card) { return { card: card, score: scoreCardForAI(game, holder, card) }; })
            .sort(function (a, b) { return a.score - b.score; });
          var replacement = sortedGuidao[0].card;
          var paidCard = removeCardFromHand(holderState, replacement.id);
          if (!paidCard) return null;
          discardCard(game, originalCard);
          context.card = replacement;
          context.replaced = true;
          log(game, actorName(game, holder) + '发动【鬼道】，打出【' + replacement.name + '】' + replacement.suit + ' ' + replacement.rank + '（' + replacement.id + '）替换' + actorName(game, judgementActor) + '的判定牌。');
          return { replacedJudgementCard: true, holder: holder, originalCard: originalCard, replacementCard: replacement };
        }

        function resolveGuidaoReplaceChoice(game, pending, decision) {
          var holder = pending.actor;
          var judgementActor = pending.judgementActor || holder;
          var holderState = game[holder];
          var judgementActorState = game[judgementActor];
          if (!holderState || !judgementActorState) return fail('未知角色。');
          // v13 张角修缮-3: 雷击内嵌判定的挂起走独立快照 (pauseState.leiji)。
          var leijiResolved = resolveJudgementReplaceForLeiji(game, pending, decision, {
            requireBlack: true, skillLabel: '鬼道', playVerb: '打出', replaceVerb: '替换'
          });
          if (leijiResolved) return leijiResolved;
          var saved = game.pauseState && game.pauseState.judgeArea;
          if (!saved || saved.actor !== judgementActor) return fail('找不到挂起的判定。');
          var originalCard = saved.currentJudgementCard;
          var resolvedCard = originalCard;
          var declined = !decision.cardId;
          if (!declined) {
            var chosen = (holderState.hand || []).find(function (c) { return c.id === decision.cardId; });
            // v12 G2 修复: 未找到牌也必须重挂 — 否则 pendingChoice 被清空而
            // pauseState.judgeArea 挂起快照悬空, 判定永远无法续跑 (回合卡死)。
            if (!chosen) {
              setPendingChoice(game, pending);
              return fail('找不到这张牌。');
            }
            if (chosen.color !== 'black') {
              setPendingChoice(game, pending);
              return fail('【鬼道】只能打出黑色牌。');
            }
            var replacement = takeCard(game, decision.cardId, { zone: 'hand', actor: holder });
            if (!replacement) {
              setPendingChoice(game, pending);
              return fail('找不到这张牌。');
            }
            // v12 G2 复核修复: 同鬼才 — 原判定牌还原视图后弃置; 替换牌补施视图。
            if (originalCard) discardCard(game, restoreHongyanJudgementView(originalCard));
            resolvedCard = replacement;
            applyHongyanJudgementView(game, judgementActor, resolvedCard);
            log(game, actorName(game, holder) + '发动【鬼道】，打出【' + replacement.name + '】' + replacement.suit + ' ' + replacement.rank + '（' + replacement.id + '）替换' + actorName(game, judgementActor) + '的判定牌。');
          } else {
            log(game, actorName(game, holder) + '选择不发动【鬼道】。');
          }
          applyJudgeAreaOutcome(game, judgementActor, judgementActorState, saved.currentTrick, saved.currentReason, resolvedCard);
          // v13 评审收口: 快照形状与主循环一致 (保留 J0-2 无懈簿记) +
          // outcome 挂起检查 (闪电致濒死求桃时不得双推进; 同鬼才 resolver)。
          game.pauseState.judgeArea = {
            actor: judgementActor,
            pending: saved.pending,
            idx: saved.idx + 1,
            wuxieDoneIdx: saved.wuxieDoneIdx,
            wuxieResults: saved.wuxieResults || {}
          };
          if (game.pendingChoice) {
            game.pauseState.judgeArea.outcomeApplied = true;
            return success('继续等待玩家选择。');
          }
          var resumeResult = processJudgeArea(game, judgementActor);
          if (resumeResult && resumeResult.suspended) {
            return success('继续等待玩家选择。');
          }
          if (game.phase === 'gameover') return success('游戏结束。');
          return continueTurnAfterJudgeArea(game, judgementActor);
        }

        // 不屈 (周泰) — gltjk wind spec: "锁定技, 当你处于濒死状态时, 你将
        // 牌堆顶的一张牌置于你的武将牌上, 称为'创': 若此牌的点数与已有'创'
        // 的点数均不相同, 你将体力回复至 1 点; 若与其中一张相同, 将此牌置入
        // 弃牌堆。若你的武将牌上有'创', 你的手牌上限等于 X (X 为体力上限减
        // 去'创'的数量)"。手牌上限条款在 state.handLimit; "创"为独立计数牌区
        // (state.chuang), 入全局守恒普查。
        function triggerBuquDyingEnter(context) {
          var game = context.game;
          var dyingActor = context.dyingActor;
          var state = game[dyingActor];
          if (!state || !hasSkill(state, 'buqu') || game.phase === 'gameover') return null;
          reshuffleIfNeeded(game);
          var card = takeCard(game, null, { zone: 'deck' });
          if (!card) {
            log(game, '牌堆已空，【不屈】无牌可置。');
            return null;
          }
          var dup = (state.chuang || []).some(function (c) { return String(c.rank) === String(card.rank); });
          if (dup) {
            log(game, actorName(game, dyingActor) + '的【不屈】置出【' + card.name + '】' + card.suit + ' ' + card.rank + '，与已有"创"点数相同，置入弃牌堆。');
            discardCard(game, card);
            return { triggeredBuqu: true, saved: false };
          }
          if (!state.chuang) state.chuang = [];
          putCard(game, card, { zone: 'chuang', actor: dyingActor });
          state.hp = 1;
          log(game, actorName(game, dyingActor) + '的【不屈】置"创"【' + card.name + '】' + card.suit + ' ' + card.rank + '（共 ' + state.chuang.length + ' 创），点数均不相同，体力回复至 1 点。');
          return { triggeredBuqu: true, saved: true };
        }

        SkillRuntime.registerSkill(skillRegistry, 'biyue', {
        onTurnEnd: function (context) {
          triggerBiyue(context.game, context.actor);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'jushou', {
        onTurnEnd: function (context) {
          return triggerJushouTurnEnd(context);
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
          var pref = state.skillPreferences && state.skillPreferences.tuxi;
          if (pref === 'decline') {
            log(game, actorName(game, actor) + '选择本回合不发动【突袭】。');
            return;
          }
          // v13 审计三轮: 官方语义 — "放弃摸牌, 改为获得一至两名角色的各
          // 一张手牌" (card__hero__wei.md): 发动即放弃全部常规摸牌; 候选
          // 泛化为其他存活且有手牌的座席 (座次环序, 敌对优先; 此前恒偷
          // 二元 opponent 且仅 -1 摸牌 = 偷1+摸1, 系语义误读)。AI 期望值
          // 门: 可偷满 2 张才发动 (偷 1 弃 2 摸恒亏); pref='always' 强制。
          var candidates = StateRuntime.seatsFrom(game, actor, false).filter(function (seat) {
            return game[seat] && game[seat].hp > 0 && (game[seat].hand || []).length > 0;
          });
          if (!candidates.length) return;
          var pool = StateRuntime.perceivedHostileFirstPool(game, actor, candidates);
          var picks = pool.slice(0, 2);
          if (picks.length < 2 && pref !== 'always') return;
          picks.forEach(function (seat) {
            takeHandCard(game, seat, actor, '发动【突袭】，获得');
          });
          context.drawCount = 0;
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
        // v11 C8 (批次 32): 同疾 (标袁术) — 1v1 恒不拦截的 reserved hook
        SkillRuntime.registerSkill(skillRegistry, 'tongji', {
        onCardTarget: function (context) {
          return triggerTongjiCardTarget(context);
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
        // v11 C7 (批次 31): 耀武 (华雄) — 受红色杀伤害后, 来源二选一奖励
        SkillRuntime.registerSkill(skillRegistry, 'yaowu', {
        onDamageAfter: function (context) {
          return triggerYaowuDamageAfter(context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'kuanggu', {
        onDamageAfter: function (context) {
          return triggerKuangguDamageAfter(context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'liegong', {
        onNeedResponse: function (context) {
          return triggerLiegongNeedResponse(context.game, context.actor, context.targetActor, context.responseType, context.card);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'tianxiang', {
        onDamageModify: function (context) {
          return triggerTianxiangDamageModify(context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'leiji', {
        onShanUsed: function (context) {
          return triggerLeijiShanUsed(context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'guidao', {
        onJudgementBeforeResolve: function (context) {
          return triggerGuidaoJudgementBeforeResolve(context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'buqu', {
        onDyingEnter: function (context) {
          return triggerBuquDyingEnter(context);
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
        // v11 C3 (批次 27): 奇袭 (甘宁) onCardAs (黑色牌 → 过河拆桥, proactive only)
        SkillRuntime.registerSkill(skillRegistry, 'qixi', {
        onCardAs: function (context) {
          return triggerQixiCardAs(context);
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
        // v11 C6 (批次 30): 结姻 (孙尚香) — 出牌阶段限一次的主动技
        SkillRuntime.registerSkill(skillRegistry, 'jieyin', {
        onActiveSkill: function (context) {
          return triggerJieyinActiveSkill(context);
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

        // ───── v12 H7: 主公技 / 多人技 ─────
        // 激将 (主公刘备) — 主动时机: 出牌阶段令蜀势力 AI 座席交出【杀】,
        // 视为主公使用 (占出牌阶段次数, 距离/合法性以主公计)。响应时机
        // (决斗/南蛮需打出杀) 在 tricks 域经 tryLordAidSync 接入。
        // 主动路径仅人类主公可触达 (AI 主公不主动发动, 见 ai 域注释),
        // 代打者恒为 AI 座席 → 同步扫描, 无需挂起。
        function triggerJijiangActiveSkill(context) {
          if (context.skillId !== 'jijiang') return null;
          var game = context.game;
          var actor = context.actor;
          var self = context.state;
          if (!self || !hasSkill(self, 'jijiang')) return null;
          if (!game.roles || game.roles[actor] !== '主公') return fail('【激将】是主公技，须为主公才能发动。');
          if (self.usedSha && !StateRuntime.canUseUnlimitedSha(self)) return fail('本回合已经使用过【杀】。');
          var target = StateRuntime.resolveSeatOption(game, context.options && context.options.target);
          if (!target || target === actor) return fail('请为【激将】指定一名目标角色。');
          if (!game[target] || game[target].hp <= 0) return fail('目标已阵亡。');
          // 依座次向蜀势力同阵营 AI 座席借【杀】
          var jjAiders = StateRuntime.seatsFrom(game, actor, false).filter(function (seat) {
            var st = game[seat];
            return st && st.hp > 0 && seat !== 'player' && st.camp === '蜀'
              && StateRuntime.sideOf(game, seat) !== null
              && !StateRuntime.isHostileSeat(game, seat, actor);
          });
          for (var jj = 0; jj < jjAiders.length; jj += 1) {
            var aiderState = game[jjAiders[jj]];
            var shaCard = firstMatchingCard(aiderState, function (c) { return isShaType(c.type); });
            if (!shaCard) continue;
            removeCardFromHand(aiderState, shaCard.id);
            log(game, actorName(game, jjAiders[jj]) + '响应【激将】，交出【' + shaCard.name + '】由' + actorName(game, actor) + '使用。');
            var shaResult = playSha(game, actor, shaCard, { target: target });
            if (!shaResult || !shaResult.ok) {
              // 二次合法性失败 (距离/保护) → 牌归还代打者
              putCard(game, shaCard, { zone: 'hand', actor: jjAiders[jj] });
              return shaResult || fail('【激将】的【杀】不再合法。');
            }
            return shaResult;
          }
          return fail('没有蜀势力角色响应【激将】。');
        }

        // 黄天 (主公张角) — 其他群势力角色于其出牌阶段限一次, 将一张【闪】
        // 或【闪电】交给主公张角。发动者是"给牌者" (useSkill 经 LORD_WIDE
        // 网关放行无此技能的给牌者)。
        function triggerHuangtianActiveSkill(context) {
          if (context.skillId !== 'huangtian') return null;
          var game = context.game;
          var actor = context.actor;
          var self = context.state;
          var cardIds = context.cardIds || [];
          var htLord = null;
          StateRuntime.seatList(game).forEach(function (seat) {
            if (htLord) return;
            var st = game[seat];
            if (st && st.hp > 0 && seat !== actor && hasSkill(st, 'huangtian')
                && game.roles && game.roles[seat] === '主公') {
              htLord = seat;
            }
          });
          if (!htLord) return fail('场上没有可响应【黄天】的主公张角。');
          if (self.camp !== '群') return fail('只有群势力角色可以发动【黄天】。');
          if (StateRuntime.isHostileSeat(game, actor, htLord)) return fail('敌对阵营不会响应【黄天】。');
          if (self.flags.huangtianUsed) return fail('【黄天】每回合限一次。');
          if (cardIds.length !== 1) return fail('请选择一张【闪】或【闪电】交给主公。');
          var giveCard = (self.hand || []).find(function (c) { return c.id === cardIds[0]; });
          if (!giveCard) return fail('选择的手牌不存在。');
          if (giveCard.type !== 'shan' && giveCard.type !== 'shandian') {
            return fail('【黄天】只能交出【闪】或【闪电】。');
          }
          removeCardFromHand(self, cardIds[0]);
          putCard(game, giveCard, { zone: 'hand', actor: htLord });
          self.flags.huangtianUsed = true;
          log(game, actorName(game, actor) + '发动【黄天】，将【' + giveCard.name + '】交给' + actorName(game, htLord) + '。');
          return success('黄天完成。');
        }

        // 离间 (貂蝉) — 出牌阶段限一次: 弃置一张手牌, 令一名男性角色视为对
        // 另一名男性角色使用【决斗】(虚拟牌, 可被无懈; 无实体, 奸雄无可得)。
        function triggerLijianActiveSkill(context) {
          if (context.skillId !== 'lijian') return null;
          var game = context.game;
          var actor = context.actor;
          var self = context.state;
          var cardIds = context.cardIds || [];
          if (!self || !hasSkill(self, 'lijian')) return null;
          if (self.flags.lijianUsed) return fail('【离间】每回合限一次。');
          if (cardIds.length !== 1) return fail('请弃置一张手牌发动【离间】。');
          var targets = (context.options && context.options.targets) || [];
          var seatA = StateRuntime.resolveSeatOption(game, targets[0]);
          var seatB = StateRuntime.resolveSeatOption(game, targets[1]);
          if (!seatA || !seatB || seatA === seatB || seatA === actor || seatB === actor) {
            return fail('请选择两名其他男性角色。');
          }
          if (game[seatA].hp <= 0 || game[seatB].hp <= 0) return fail('目标已阵亡。');
          if (game[seatA].gender !== 'male' || game[seatB].gender !== 'male') {
            return fail('【离间】只能指定男性角色。');
          }
          // v13 审计三轮: 虚拟决斗须过目标合法性 — 空城等"不能成为【决斗】
          // 目标"的保护对离间的视为决斗同样生效 (此前绕过, 与真决斗路径
          // isLegalCardTarget → cardTargetProtection 不一致)。成本未弃置前
          // 校验, 拒绝时零副作用。
          var lijianProtection = cardTargetProtection(game, seatA, seatB,
            { type: 'juedou', name: '决斗', virtual: true }, '决斗');
          if (lijianProtection) return fail(lijianProtection.message);
          var lijianCost = removeCardFromHand(self, cardIds[0]);
          if (!lijianCost) return fail('选择的手牌不存在。');
          discardCard(game, lijianCost);
          self.flags.lijianUsed = true;
          log(game, actorName(game, actor) + '发动【离间】，弃置【' + lijianCost.name + '】，令'
            + actorName(game, seatA) + '视为对' + actorName(game, seatB) + '使用【决斗】。');
          var lijianJuedou = {
            id: 'lijian-juedou-' + lijianCost.id,
            virtual: true,
            physicalCards: [],
            type: 'juedou',
            name: '决斗',
            family: 'trick',
            suit: null,
            rank: null,
            color: null
          };
          return checkWuxieAndContinue(game, seatB, '【离间】（决斗）', 'juedou', {
            actor: seatA, card: lijianJuedou, options: {}, targetActor: seatB
          });
        }

        SkillRuntime.registerSkill(skillRegistry, 'jijiang', {
        onActiveSkill: function (context) {
          return triggerJijiangActiveSkill(context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'huangtian', {
        onActiveSkill: function (context) {
          return triggerHuangtianActiveSkill(context);
        }
      });
        SkillRuntime.registerSkill(skillRegistry, 'lijian', {
        onActiveSkill: function (context) {
          return triggerLijianActiveSkill(context);
        }
      });

        // v12 F1: 引擎流程仍需直调的技能域函数面 (回绑为引擎内同名 var)
        return {
          triggerShensuPrepare: triggerShensuPrepare,
          resolveShensuOptionsChoice: resolveShensuOptionsChoice,
          resolveGuidaoReplaceChoice: resolveGuidaoReplaceChoice,
          resolveLeijiAskChoice: resolveLeijiAskChoice,
          triggerGuanxingPreview: triggerGuanxingPreview,
          triggerLuoshenPrepare: triggerLuoshenPrepare,
          getGuanxingPreview: getGuanxingPreview,
          resolveFankuiPickChoice: resolveFankuiPickChoice,
          resolveYaowuRewardChoice: resolveYaowuRewardChoice,
          resolveGanglieFireChoice: resolveGanglieFireChoice,
          resolveGanglieSourceChoice: resolveGanglieSourceChoice,
          resolveFanjianGuessChoice: resolveFanjianGuessChoice,
          resolveGuanxingChoice: resolveGuanxingChoice,
          resolveYijiDistributeChoice: resolveYijiDistributeChoice,
          resolveGuicaiReplaceChoice: resolveGuicaiReplaceChoice,
          resolveLuoshenContinueChoice: resolveLuoshenContinueChoice
        };
      }

      export const PLAY_PHASE_ACTIVE_SKILLS = {
        zhiheng: true,
        kurou: true,
        rende: true,
        fanjian: true,
        qingnang: true,
          // v11 C6 (批次 30): 结姻
        jieyin: true,
        // v12 H7: 主公技/多人技 (激将主动·黄天给牌·离间 — 均限出牌阶段)
        jijiang: true,
        huangtian: true,
        lijian: true
      };

