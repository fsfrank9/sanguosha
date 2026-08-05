      import { SkillRuntime } from './skill-runtime.js';
      import { StateRuntime } from './state.js';
      import { CardRuntime } from './card-runtime.js';

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
        // v15 T: 拼点 (驱虎/天义)
        var startPindian = deps.startPindian;
        var registerPindianContinuation = deps.registerPindianContinuation;
        var pindianEligible = deps.pindianEligible;
        // v15 T: 乱击 — 双牌合成虚拟【万箭齐发】走普通使用校验与结算入口
        var canPlayCard = deps.canPlayCard;
        var playCardWithRegisteredHandler = deps.playCardWithRegisteredHandler;
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
        // v14 P 评审收口 (opus 对抗最小复现钉死): 多目标杀链下同一来源牌可
        // 对同一奸雄座席结算多次 (流离转移给既有目标 → 连续两次伤害) —
        // 此前 takeCard 返回值被忽略 + 无条件 putCard, 第二次取回把已在
        // 手牌的同一对象再推一次 → 同一张牌双份 (守恒红线)。归属守卫:
        // 牌已落在 弃牌堆之外的任何区域 (先前取回入手/入装备等) → 已归属,
        // 本次不再获得 (虚拟牌分支经 moveCard 返回值天然有同款守卫)。
        var currentZone = CardRuntime.findCardZone(game, physicalSourceCard);
        if (currentZone && currentZone.zone !== 'discard') return null;
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
        log(game, actorName(game, targetActor) + '发动【反馈】，获得' + actorName(game, sourceActor) + '的一张' + zoneLabel(gained.zone) + '。');
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
        log(game, actorName(game, holder) + '发动【反馈】，获得' + actorName(game, sourceActor) + '的一张' + zoneLabel(gained.zone) + '。');
        return success('反馈完成。');
      }

      // v15 T: 区域名 → 日志措辞 ('手牌' 已含"牌"字, 装备区/判定区需补)。
      // 顺带勘正反馈的同款叠字 ("一张手牌牌")。
      function zoneLabel(zone) {
        return zone === '手牌' ? '手牌' : zone + '牌';
      }

      // ═════ v15 T (火包): 驱虎 (荀彧) ═════
      // 官方逐字 (card__hero__wei.md:333): "出牌阶段限一次，你可以与一名
      // 体力值大于你的角色拼点：当你赢后，其对其攻击范围内你选择的一名
      // 角色造成1点伤害；当你没赢后，其对你造成1点伤害。"
      // 注意伤害来源恒为**拼点目标** (荀彧只是选受害者), 且赢的分支里
      // 受害者必须在拼点目标的攻击范围内。
      function triggerQuhuActiveSkill(context) {
        if (context.skillId !== 'quhu') return null;
        var game = context.game;
        var actor = context.actor;
        var self = context.state;
        if (!self || !hasSkill(self, 'quhu')) return null;
        if (self.flags.quhuUsed) return fail('【驱虎】每回合限一次。');
        var targetActor = context.targetActor;
        if (!targetActor) {
          // 缺省: 体力值大于自己且可拼点的敌对席首位。
          targetActor = StateRuntime.perceivedHostileFirstPool(game, actor,
            StateRuntime.aliveSeats(game).filter(function (seat) {
              return seat !== actor && game[seat].hp > self.hp && pindianEligible(game, actor, seat);
            }))[0];
        }
        if (!targetActor || !game[targetActor]) return fail('请选择一名体力值大于你的角色。');
        if (game[targetActor].hp <= self.hp) return fail('【驱虎】的目标体力值必须大于你。');
        if (!pindianEligible(game, actor, targetActor)) return fail('拼点需要双方各有至少一张手牌。');
        self.flags.quhuUsed = true;
        return startPindian(game, actor, targetActor, {
          key: 'quhu',
          reason: '【驱虎】拼点',
          ctx: { victimHint: context.options && context.options.victim }
        });
      }

      registerPindianContinuation('quhu', function (game, outcome) {
        var actor = outcome.actor;
        var targetActor = outcome.target;
        if (!game[targetActor] || game[targetActor].hp <= 0) return success('驱虎结算完成（拼点目标已阵亡）。');
        if (!outcome.won) {
          // "当你没赢后，其对你造成1点伤害"
          damage(game, actor, 1, targetActor, '【驱虎】');
          return success('驱虎结算完成。');
        }
        // "当你赢后，其对其攻击范围内你选择的一名角色造成1点伤害"
        var candidates = StateRuntime.aliveSeats(game).filter(function (seat) {
          return seat !== targetActor && StateRuntime.canReachWithSha(game, targetActor, seat);
        });
        if (!candidates.length) return success('驱虎：拼点目标的攻击范围内没有角色。');
        var hint = outcome.ctx && outcome.ctx.victimHint
          && StateRuntime.resolveSeatOption(game, outcome.ctx.victimHint);
        var victim = (hint && candidates.indexOf(hint) >= 0) ? hint : null;
        if (!victim) {
          // 由荀彧选择受害者 — 只读公开信息。缺省挑选序: 感知敌对优先 →
          // 血线最低。荀彧自己虽在官方可选面内 (文本未排除), 但缺省绝不
          // 自伤: 先剔除自己, 只有"射程内只剩荀彧"时才回退到自己。
          var pickable = candidates.filter(function (seat) { return seat !== actor; });
          if (!pickable.length) pickable = candidates;
          var pool = StateRuntime.perceivedHostileFirstPool(game, actor, pickable);
          victim = pool.slice().sort(function (a, b) { return game[a].hp - game[b].hp; })[0];
        }
        damage(game, victim, 1, targetActor, '【驱虎】');
        return success('驱虎结算完成。');
      });

      // ═════ v15 T (火包): 天义 (太史慈) ═════
      // 官方逐字 (card__hero__wu.md:355): "出牌阶段限一次，你可以与一名角色
      // 拼点：当你赢后，你于此回合内使用【杀】的额外次数上限+1且使用【杀】
      // 无距离限制且使用【杀】的额外目标数上限+1；当你没赢后，你于此回合内
      // 不能使用【杀】。"
      function triggerTianyiActiveSkill(context) {
        if (context.skillId !== 'tianyi') return null;
        var game = context.game;
        var actor = context.actor;
        var self = context.state;
        if (!self || !hasSkill(self, 'tianyi')) return null;
        if (self.flags.tianyiUsed) return fail('【天义】每回合限一次。');
        var targetActor = context.targetActor;
        if (!targetActor) {
          targetActor = StateRuntime.perceivedHostileFirstPool(game, actor,
            StateRuntime.aliveSeats(game).filter(function (seat) {
              return seat !== actor && pindianEligible(game, actor, seat);
            }))[0];
        }
        if (!targetActor || !game[targetActor]) return fail('请选择一名角色拼点。');
        if (!pindianEligible(game, actor, targetActor)) return fail('拼点需要双方各有至少一张手牌。');
        self.flags.tianyiUsed = true;
        return startPindian(game, actor, targetActor, { key: 'tianyi', reason: '【天义】拼点' });
      }

      registerPindianContinuation('tianyi', function (game, outcome) {
        var self = game[outcome.actor];
        if (!self) return success('天义结算完成。');
        self.flags = self.flags || {};
        if (outcome.won) {
          self.flags.tianyiWon = true;
          // "使用【杀】的额外次数上限 +1" — 次数闸读 shaExtraUses
          // (state.shaUseAllowed), 回合复位由 phases 清零。
          self.shaExtraUses = (self.shaExtraUses || 0) + 1;
          log(game, actorName(game, outcome.actor)
            + '【天义】拼点赢：本回合【杀】的使用次数上限 +1、无距离限制、额外目标数上限 +1。');
        } else {
          self.flags.tianyiLost = true;
          log(game, actorName(game, outcome.actor) + '【天义】拼点没赢：本回合不能使用【杀】。');
        }
        return success('天义结算完成。');
      });

      // ═════ v15 T (火包): 乱击 (袁绍) ═════
      // 官方逐字 (card__hero__neutral.md:149): "你可以将两张花色相同的手牌
      // 当【万箭齐发】使用。" 两张牌合成一张虚拟【万箭齐发】 (丈八蛇矛
      // 的双牌虚拟先例): 组成实体在转化时弃置, 虚拟牌带 virtual 标记 →
      // discardCard 不再二次入堆 (守恒 H1 口径)。
      function triggerLuanjiActiveSkill(context) {
        if (context.skillId !== 'luanji') return null;
        var game = context.game;
        var actor = context.actor;
        var self = context.state;
        var cardIds = context.cardIds || [];
        if (!self || !hasSkill(self, 'luanji')) return null;
        if (cardIds.length !== 2 || cardIds[0] === cardIds[1]) {
          return fail('【乱击】需要两张花色相同的手牌。');
        }
        var picked = cardIds.map(function (id) {
          return (self.hand || []).find(function (item) { return item.id === id; });
        });
        if (!picked[0] || !picked[1]) return fail('选择的手牌不存在。');
        // "花色相同" — 走 effectiveCardColor 的同源花色视同层 (红颜把黑桃
        // 视为红桃只改颜色不改花色, 故此处直接比 suit)。
        if (picked[0].suit !== picked[1].suit) return fail('【乱击】的两张手牌花色必须相同。');
        var virtualWanjian = {
          id: 'luanji-' + picked[0].id + '-' + picked[1].id,
          type: 'wanjian',
          name: '万箭齐发',
          family: 'trick',
          suit: picked[0].suit,
          color: picked[0].color,
          rank: picked[0].rank,
          virtual: true,
          physicalCards: [picked[0], picked[1]]
        };
        var playable = canPlayCard(game, actor, virtualWanjian);
        if (!playable.ok) return playable;
        // 先弃组成实体再进结算 (与丈八/转化牌同序: 牌离手 → 使用)。
        picked.forEach(function (card) {
          var removed = removeCardFromHand(self, card.id);
          if (removed) discardCard(game, removed);
        });
        log(game, actorName(game, actor) + '发动【乱击】，将两张' + (picked[0].suitLabel || picked[0].suit)
          + '手牌当【万箭齐发】使用。');
        return playCardWithRegisteredHandler(game, actor, virtualWanjian, context.options || {}, self);
      }

      // ═════ v15 T (火包): 双雄 (颜良文丑) ═════
      // 官方逐字 (card__hero__neutral.md:161): "摸牌阶段开始时，你可以放弃
      // 摸牌，判定，当判定牌生效后，你获得之，若如此做，你于此回合内可以
      // 将与之颜色不同的一张手牌当【决斗】使用。"
      // 判定牌"生效后你获得之" → 判定牌进手牌 (不入弃牌堆); 颜色记在
      // flags.shuangxiongColor, 回合结束由 resetEndOfTurnState 清除。
      function triggerShuangxiongDrawPhase(context) {
        var game = context.game;
        var actor = context.actor;
        var self = game[actor];
        if (!self || !hasSkill(self, 'shuangxiong')) return null;
        var pref = (self.skillPreferences && self.skillPreferences.shuangxiong)
          || (actor === 'player' ? 'ask' : 'auto');
        if (pref === 'decline') return null;
        // ask 档留待 UI 批接入 (与突袭同款 pendingChoice); 当前 auto:
        // 手上已有可当决斗的异色牌越多, 放弃摸牌的收益越高 — 简化为
        // "手牌数 < 3 时不换" (摸两张的确定性收益更高)。
        if (pref === 'ask' || pref === 'auto') {
          if ((self.hand || []).length < 3 && pref === 'auto') return null;
        }
        var judgeResult = judge(game, actor, '【双雄】');
        if (!judgeResult) return null;
        context.drawCount = 0; // 放弃摸牌
        self.flags = self.flags || {};
        self.flags.shuangxiongColor = judgeResult.color;
        // "当判定牌生效后，你获得之" — 认领经 onJudgementAfterResolve 的
        // claimed 通道 (天妒同款单点), 未认领的判定牌才入弃牌堆。
        self.flags.shuangxiongClaimPending = true;
        resolveJudgementCard(game, actor, self, '【双雄】', judgeResult);
        self.flags.shuangxiongClaimPending = false;
        log(game, actorName(game, actor) + '发动【双雄】，放弃摸牌并获得判定牌【'
          + judgeResult.name + '】，本回合可将' + (judgeResult.color === 'red' ? '黑色' : '红色')
          + '手牌当【决斗】使用。');
        return { shuangxiongApplied: true };
      }

      // 双雄的判定牌认领 (与天妒同一 claimed 通道; 只在本次双雄判定的
      // 结算窗口内认领, 其他判定不受影响)。
      function triggerShuangxiongClaim(context) {
        var game = context.game;
        var actor = context.actor;
        var state = context.state;
        var physicalCard = physicalCardOf(context.card);
        if (!state || !physicalCard || !hasSkill(state, 'shuangxiong')) return null;
        if (!state.flags || !state.flags.shuangxiongClaimPending) return null;
        if (context.claimed) return null; // 已被其他技能认领 (如天妒)
        putCard(game, physicalCard, { zone: 'hand', actor: actor });
        context.claimed = true;
        return { claimedJudgementCard: true };
      }

      // ═════ v15 T (火包): 涅槃 (庞统) ═════
      // 官方逐字 (card__hero__shu.md:324): "限定技，当你处于濒死状态时，
      // 你可以弃置你的区域里的所有牌，然后将武将牌恢复至游戏开始时的状态，
      // 摸三张牌，将体力值回复至3点。"
      // (:330 的变体写作"恢复至平置状态并重置" — 同义, 取通用版。)
      // 限定技 = 每局一次 → flags.niepanUsed 永不复位 (不进 phases 复位表)。
      // "你的区域里的所有牌" = 手牌 + 装备区 + 判定区 (判定区的牌不为角色
      // 所拥有, 但官方"你的区域里的牌"含判定区 — glossary__zone.md)。
      function triggerNiepanDyingEnter(context) {
        var game = context.game;
        var dyingActor = context.dyingActor;
        var self = game[dyingActor];
        if (!self || !hasSkill(self, 'niepan')) return null;
        self.flags = self.flags || {};
        if (self.flags.niepanUsed) return null;
        var pref = (self.skillPreferences && self.skillPreferences.niepan) || 'auto';
        if (pref === 'decline') {
          log(game, actorName(game, dyingActor) + '选择不发动【涅槃】。');
          return null;
        }
        self.flags.niepanUsed = true;
        // ① 弃置区域里的所有牌
        (self.hand || []).slice().forEach(function (card) {
          var removed = removeCardFromHand(self, card.id);
          if (removed) discardCard(game, removed);
        });
        ['weapon', 'armor', 'horseMinus', 'horsePlus'].forEach(function (slot) {
          var equipped = self.equipment && self.equipment[slot];
          if (!equipped) return;
          takeCard(game, equipped, { zone: 'equipment', actor: dyingActor, slot: slot });
          discardCard(game, equipped);
          if (triggerEquipmentLoss) triggerEquipmentLoss(game, dyingActor, equipped);
        });
        (self.judgeArea || []).slice().forEach(function (card) {
          var removed = takeCard(game, card, { zone: 'judgeArea', actor: dyingActor });
          if (removed) discardCard(game, removed);
        });
        // ② 武将牌恢复至游戏开始时的状态 (翻回正面 + 解除横置)
        self.turnedOver = false;
        self.chained = false;
        // ③ 摸三张 ④ 体力回复至 3 点
        drawCards(game, dyingActor, 3);
        self.hp = Math.min(self.maxHp, 3);
        log(game, actorName(game, dyingActor)
          + '发动【涅槃】：弃置区域内所有牌，武将牌复原，摸三张牌，体力回复至 ' + self.hp + ' 点。');
        return { niepanApplied: true };
      }

      // ═════ v15 T (火包): 猛进 (庞德) ═════
      // 官方逐字 (card__hero__neutral.md:225): "每当你使用的【杀】被目标
      // 角色使用的【闪】抵消时，你可以弃置其一张牌。"
      // (:231 的 1V1 变体把"目标角色"写成"对手" — 本仓同时支持 1v1 与
      //  3/4/5 人身份场, 取通用版, 目标即该【杀】的目标座席。)
      // 可弃面 = 目标的手牌与装备区 (判定区的牌不为任何角色所拥有,
      // glossary__zone.md — 与反馈同口径); 手牌为暗牌 → 随机取一张
      // (removeTargetZoneCard 的既有语义), 装备区可指定具体牌。
      function triggerMengjinShaDodged(context) {
        var game = context.game;
        var actor = context.actor;
        var targetActor = context.targetActor;
        var self = game[actor];
        var target = game[targetActor];
        if (!self || !target || actor === targetActor) return null;
        if (!hasSkill(self, 'mengjin') || game.phase === 'gameover') return null;
        if (target.hp <= 0) return null;
        var pref = (self.skillPreferences && self.skillPreferences.mengjin)
          || (actor === 'player' ? 'ask' : 'auto');
        if (pref === 'decline') {
          log(game, actorName(game, actor) + '选择不发动【猛进】。');
          return null;
        }
        var zones = [];
        if (target.hand && target.hand.length > 0) {
          zones.push({ zone: 'hand', count: target.hand.length });
        }
        ['weapon', 'armor', 'horseMinus', 'horsePlus'].forEach(function (slot) {
          var card = target.equipment && target.equipment[slot];
          if (card) zones.push({
            zone: 'equipment', slot: slot, cardId: card.id,
            name: card.name, suit: card.suit, rank: card.rank
          });
        });
        if (!zones.length) return null; // 目标无牌可弃 → 静默不触发
        if (pref === 'ask') {
          setPendingChoice(game, {
            kind: 'mengjin-pick',
            actor: actor,
            targetActor: targetActor,
            zones: zones
          });
          log(game, '等待' + actorName(game, actor) + '决定是否发动【猛进】。');
          return { suspendedForMengjin: true };
        }
        // auto: 装备区优先 (公开信息, 确定性收益 > 随机手牌)
        var equipEntry = zones.find(function (entry) { return entry.zone === 'equipment'; });
        return applyMengjinDiscard(game, actor, targetActor,
          equipEntry ? 'equipment' : 'hand', equipEntry ? equipEntry.cardId : null);
      }

      function applyMengjinDiscard(game, actor, targetActor, zone, cardId) {
        var removed = removeTargetZoneCard(game, targetActor, zone, cardId);
        if (!removed || !removed.card) return null;
        discardCard(game, removed.card);
        log(game, actorName(game, actor) + '发动【猛进】，弃置'
          + actorName(game, targetActor) + '的一张' + zoneLabel(removed.zone) + '。');
        return { mengjinDiscarded: true };
      }

      // 玩家席猛进选牌 resolver — decision: { zone: 'hand'|'equipment',
      // cardId? } / { decline: true }。收尾后由引擎续跑闪避分支剩余流程。
      function resolveMengjinPickChoice(game, pending, decision) {
        var actor = pending.actor;
        var targetActor = pending.targetActor;
        var d = decision || {};
        if (d.decline || d.skip) {
          log(game, actorName(game, actor) + '选择不发动【猛进】。');
        } else {
          var zone = d.zone;
          if (['hand', 'equipment'].indexOf(zone) < 0) {
            setPendingChoice(game, pending);
            return fail('请选择有效的区域（hand / equipment）。');
          }
          var applied = applyMengjinDiscard(game, actor, targetActor, zone,
            zone === 'hand' ? null : d.cardId);
          if (!applied) {
            setPendingChoice(game, pending);
            return fail('找不到目标牌，请重新选择。');
          }
        }
        // 续跑闪避分支剩余流程 (青龙续杀 + 结算收尾)。
        var resume = game.pauseState && game.pauseState.shaDodgeResume;
        if (resume && deps.continueShaDodgeAfterSkills) {
          game.pauseState.shaDodgeResume = null;
          return deps.continueShaDodgeAfterSkills(game, resume.actor, resume.card,
            resume.amount, resume.targetActor);
        }
        return success('猛进结算完成。');
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
        // v13 张角修缮-3 (评审收口): 同一判定已有改判询问挂起时后到者彻底
        // 退让 — 含 auto 路径: 否则 AI 在玩家询问面板背后换牌, 面板展示的
        // 原判定牌变陈旧误导玩家 (对抗验证实证: 面板显红桃、实际已被换成
        // 黑桃, 玩家据此放弃改判而吃伤)。单快照架构亦不支持连环改判。
        var guicaiAlreadyAsking = game.pendingChoice
          && (game.pendingChoice.kind === 'guicai-replace' || game.pendingChoice.kind === 'guidao-replace')
          && game.pendingChoice.judgementActor === judgementActor;
        if (guicaiAlreadyAsking) return { deferredGuicai: true };
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

      // v8 PR-C2 / v14 P3 真实现: 流离 (大乔) — gltjk card__hero__wu.md：
      //   "每当你成为【杀】的目标时, 你可以弃置一张牌并选择你攻击范围内的一名
      //    角色, 将此【杀】转移给该角色。"
      // ◆ 目标须为源此【杀】的合法目标 (不检测距离)。
      // ◆ 成本"弃置一张牌" = 手牌或装备区牌 (官方"一名角色的牌"不含判定区 —
      //   v8 脚手架误把判定区计入可弃池, P3 修正)。
      // ◆ 候选不排除本杀的其他既有目标 (判例 rule__principle.md: 转移给
      //   既有目标 B 合法, B 被连续结算两次)。
      // 1v1 注: 攻击范围内除大乔外只剩源, 而源不能用杀指自己 → 候选恒空 →
      // 返回 null, 流离静默不触发 (行为与 v8 起恒等)。
      // 返回契约 (sha-flow runLiuliStage 消费):
      //   { transferTo: seat }  同步转移 (AI/auto, 成本已弃置)
      //   null + pendingChoice  玩家 ask 挂起 (kind 'liuli-transfer',
      //                         resolver 在 sha-flow, 快照 pauseState.shaLiuli
      //                         由 runLiuliStage 调用方写入)
      //   null                  不触发 / 放弃
      function triggerLiuliOnShaTargeted(context) {
        var target = context.target;
        if (!target || !hasSkill(target, 'liuli')) return null;
        if (target.hp <= 0) return null;
        var game = context.game;
        var targetActor = context.targetActor;
        var sourceActor = context.sourceActor;
        // 成本池 = 手牌 + 装备区 (判定区牌不是"你的牌")。
        var costHand = (target.hand || []).slice();
        var costEquips = equipmentList(target);
        if (costHand.length + costEquips.length === 0) return null;
        // 候选 = 大乔攻击范围内 & 非自己 & 非源 & 源此杀的合法目标
        var candidates = [];
        // v12 H 骨架修复: 按 game.seats 座次环遍历 (1v1 恒等旧值)。
        seatList(game).forEach(function (a) {
          if (a === targetActor) return;
          if (a === sourceActor) return;  // spec 限定: 须为源的杀合法目标; 源对自己永远非法
          if (!game[a] || game[a].hp <= 0) return;
          // 攻击范围检测: target 的 weaponRange 覆盖 a (距离 ≤ range)
          if (!canReachWithSha(game, targetActor, a)) return;
          // 须为源此杀的合法目标 (sourceCard 的 onCardTarget 检测)
          var protection = cardTargetProtection(game, sourceActor, a, context.card, '杀');
          if (protection) return;
          candidates.push(a);
        });
        if (candidates.length === 0) return null;
        var pref = (target.skillPreferences && target.skillPreferences.liuli)
          || (targetActor === 'player' ? 'ask' : 'auto');
        if (pref === 'decline') return null;
        if (pref === 'ask') {
          setPendingChoice(game, {
            kind: 'liuli-transfer',
            actor: targetActor,
            sourceActor: sourceActor,
            shaName: context.card ? context.card.name : '杀',
            costIds: costHand.map(function (c) { return c.id; })
              .concat(costEquips.map(function (e) { return e.card.id; })),
            cards: costHand.map(function (c) {
              return { id: c.id, name: c.name, suit: c.suit, rank: c.rank, zone: 'hand' };
            }).concat(costEquips.map(function (e) {
              return { id: e.card.id, name: e.card.name, suit: e.card.suit, rank: e.card.rank, zone: 'equipment', slot: e.slot };
            })),
            candidates: candidates.map(function (seat) {
              return { seat: seat, name: game[seat].name };
            })
          });
          log(game, '等待' + actorName(game, targetActor) + '决定是否发动【流离】转移【'
            + (context.card ? context.card.name : '杀') + '】。');
          return null; // 挂起信号 = pendingChoice 存在 (runLiuliStage 检测)
        }
        // auto (AI): 立场启发 — 仅转移给感知敌对候选 (不祸水同侧); 优先
        // 血线最低者 (处决压力)。成本只用手牌评分最低的一张, 无手牌不弃
        // 装备 (装备价值高, 对齐鬼道 AI 不自动弃装备惯例) → 放弃。
        var hostiles = candidates.filter(function (seat) {
          return StateRuntime.perceivedHostile(game, targetActor, seat);
        });
        if (!hostiles.length || !costHand.length) return null;
        hostiles.sort(function (a, b) { return game[a].hp - game[b].hp; });
        var pick = hostiles[0];
        var scoredCost = costHand
          .map(function (c) { return { card: c, score: scoreCardForAI(game, targetActor, c) }; })
          .sort(function (a, b) { return a.score - b.score; });
        var costCard = removeOwnCardFromAnyZone(target, scoredCost[0].card.id, game);
        if (!costCard) return null;
        discardCard(game, costCard);
        log(game, actorName(game, targetActor) + '发动【流离】，弃置【' + costCard.name
          + '】将【' + (context.card ? context.card.name : '杀') + '】转移给' + actorName(game, pick) + '。');
        return { transferTo: pick };
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
      // ═════ v15 T (火包): 转化类技能 ═════
      // 火计 (卧龙诸葛亮, card__hero__shu.md:338): "你可以将一张红色手牌当
      // 【火攻】使用。" — 限手牌 (对照武圣的"红色牌"含装备区)。
      function triggerHuojiCardAs(context) {
        var state = context.state;
        if (!state || !hasSkill(state, 'huoji')) return null;
        if (context.mode !== 'proactive' || context.asType !== 'huogong') return null;
        if (!context.card || !isHandCardOf(state, context.card)) return null;
        if (StateRuntime.effectiveCardColor(state, context.card) !== 'red') return null;
        return { card: context.card, asName: '火攻', skillName: '火计', priority: 10 };
      }

      // 连环 (庞统, card__hero__shu.md:322): "你可以将一张梅花手牌当【铁索
      // 连环】使用；你能重铸梅花手牌。" — 转化面走 onCardAs; 重铸面见
      // lianhuanCanRecast (引擎重铸入口查此谓词)。
      function triggerLianhuanCardAs(context) {
        var state = context.state;
        if (!state || !hasSkill(state, 'lianhuan')) return null;
        if (context.mode !== 'proactive' || context.asType !== 'tiesuo') return null;
        if (!context.card || !isHandCardOf(state, context.card)) return null;
        if (context.card.suit !== 'club') return null;
        return { card: context.card, asName: '铁索连环', skillName: '连环', priority: 10 };
      }

      // 双雄 (颜良文丑, card__hero__neutral.md:161): 摸牌阶段放弃摸牌改判定
      // 并获得判定牌后, "你于此回合内可以将与之颜色不同的一张手牌当
      // 【决斗】使用" — 回合级授权, 颜色由 flags.shuangxiongColor 记录。
      function triggerShuangxiongCardAs(context) {
        var state = context.state;
        if (!state || !hasSkill(state, 'shuangxiong')) return null;
        if (context.mode !== 'proactive' || context.asType !== 'juedou') return null;
        var judgedColor = state.flags && state.flags.shuangxiongColor;
        if (!judgedColor) return null;
        if (!context.card || !isHandCardOf(state, context.card)) return null;
        if (StateRuntime.effectiveCardColor(state, context.card) === judgedColor) return null;
        return { card: context.card, asName: '决斗', skillName: '双雄', priority: 10 };
      }

      // 转化面统一的"限手牌"谓词 (武圣/龙胆等含装备区的转化不用此闸)。
      function isHandCardOf(state, card) {
        return (state.hand || []).some(function (item) { return item && item.id === card.id; });
      }

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
        // v14 P4 连带收口 (守恒 fuzz seed 60536 抓获的预存缺陷): 座席判定
        // 泛化 — 此前只认 'player'/'enemy' 字面, ally* 座席的显式目标 (含
        // 华佗在第三席自疗) 被误路由进 1v1 二元 opponent() 缺省回退 (亡席
        // 报错 / 错疗他席)。显式合法座席一律直接采用, 缺省回退仅在无显式
        // 目标时生效 (1v1 行为恒等)。评审收口: 座席合法性经 resolveSeatOption
        // 判定 — options.targetActor 路径绕过 useSkill 入口校验, 裸
        // `game[key]` 会把 'discard'/'deck' 等对象键误当座席。
        if (targetActor) targetActor = StateRuntime.resolveSeatOption(game, targetActor);
        if (!targetActor || !game[targetActor]) {
          var opp = game[opponent(actor)];
          if (opp && opp.hp < opp.maxHp) targetActor = opponent(actor);
          else if (self.hp < self.maxHp) targetActor = actor;
          else return fail('没有已受伤的角色，无法发动【青囊】。');
        }
        var target = game[targetActor];
        if (!target) return fail('目标无效。');
        // audit4-H2: 亡者 hp 0 < maxHp 会骗过"已受伤"检查 → 给尸体回血。
        if (target.hp <= 0) return fail('目标已阵亡。');
        if (target.hp >= target.maxHp) return fail('目标未受伤，不能发动【青囊】。');
        var costCard = removeCardFromHand(self, cardIds[0]);
        if (!costCard) return fail('选择的手牌不存在。');
        discardCard(game, costCard);
        self.flags.qingnangUsed = true;
        target.hp = Math.min(target.maxHp, target.hp + 1);
        log(game, actorName(game, actor) + '发动【青囊】，弃置【' + costCard.name + '】，令' + actorName(game, targetActor) + '回复 1 点体力。');
        return success('青囊完成。');
      }

      // ═════ v15 T (火包): 强袭 (典韦) ═════
      // 官方逐字 (card__hero__wei.md:319): "出牌阶段限一次，你可以失去1点
      // 体力或弃置一张武器牌，并选择你攻击范围内的一名角色，对其造成1点
      // 伤害。" (:323 的 1V1 变体把目标写死为"对手" — 取通用版, 目标经
      // 攻击范围矩阵解析, 1v1 中候选恒为对手, 行为等价。)
      // 成本二选一: cardIds 给出武器牌 id → 弃武器; 不给 → 失去 1 点体力。
      // 顺序: 官方"失去体力或弃武器"在"选择目标"之前 → 先付成本再造成
      // 伤害 (典韦成本致自己濒死时伤害仍结算, 与官方一致)。
      function triggerQiangxiActiveSkill(context) {
        if (context.skillId !== 'qiangxi') return null;
        var game = context.game;
        var actor = context.actor;
        var self = context.state;
        var cardIds = context.cardIds || [];
        if (!self || !hasSkill(self, 'qiangxi')) return null;
        if (self.flags.qiangxiUsed) return fail('【强袭】每回合限一次。');
        var targetActor = context.targetActor
          || StateRuntime.perceivedHostileSeats(game, actor).filter(function (seat) {
            return StateRuntime.canReachWithSha(game, actor, seat);
          })[0];
        if (!targetActor || !game[targetActor]) return fail('请选择攻击范围内的一名角色。');
        if (targetActor === actor) return fail('【强袭】不能选择自己。');
        if (game[targetActor].hp <= 0) return fail('目标已阵亡。');
        // "你攻击范围内的一名角色" — 攻击范围 = 距离 <= 武器射程。
        if (!StateRuntime.canReachWithSha(game, actor, targetActor)) {
          return fail('目标不在你的攻击范围内。');
        }
        // 成本: 指定了武器牌 → 弃武器; 否则失去 1 点体力。
        var weapon = self.equipment && self.equipment.weapon;
        var wantsWeaponCost = cardIds.length > 0;
        if (wantsWeaponCost) {
          if (!weapon || cardIds[0] !== weapon.id) return fail('【强袭】的成本只能是你装备区里的武器牌。');
          takeCard(game, weapon, { zone: 'equipment', actor: actor, slot: 'weapon' });
          discardCard(game, weapon);
          // 失去装备区的牌 → 照常结算失去时机 (枭姬等)。
          if (triggerEquipmentLoss) triggerEquipmentLoss(game, actor, weapon);
          log(game, actorName(game, actor) + '发动【强袭】，弃置武器【' + weapon.name + '】。');
        } else {
          self.hp -= 1;
          log(game, actorName(game, actor) + '发动【强袭】，失去 1 点体力。');
        }
        self.flags.qiangxiUsed = true;
        // 失去体力可能致自身濒死 → 濒死结算先跑 (loseHp 语义); 伤害在其后。
        if (!wantsWeaponCost && self.hp <= 0) enterDying(game, actor);
        if (game.phase === 'gameover') return success('强袭结算完成。');
        if (!game[targetActor] || game[targetActor].hp <= 0) return success('强袭目标已不在场。');
        damage(game, targetActor, 1, actor, '【强袭】');
        return success('强袭完成。');
      }

      // ═════ v15 T (火包): 节命 (荀彧) ═════
      // 官方逐字 (card__hero__wei.md:335): "每当你受到1点伤害后，你可以令
      // 一名角色将手牌补至X张（X为其体力上限且至多为5）。"
      // 逐点处理 (与遗计同款"每受到1点伤害"口径): amount 点伤害触发 amount 次。
      // "补至" = 只摸不弃 — 手牌已达/超过 X 时不摸。
      function triggerJiemingDamageAfter(context) {
        var game = context.game;
        var targetActor = context.targetActor;
        var self = game[targetActor];
        if (!self || !hasSkill(self, 'jieming') || game.phase === 'gameover') return null;
        if (context.amount <= 0) return null;
        var pref = (self.skillPreferences && self.skillPreferences.jieming) || 'auto';
        if (pref === 'decline') {
          log(game, actorName(game, targetActor) + '选择不发动【节命】。');
          return null;
        }
        for (var point = 0; point < context.amount; point += 1) {
          if (self.hp <= 0 && game.phase !== 'gameover') {
            // 濒死中仍可发动 (官方无限制), 但阵亡后不再触发。
            if (!game[targetActor]) break;
          }
          var beneficiary = jiemingPickBeneficiary(game, targetActor);
          if (!beneficiary) break;
          var beneficiaryState = game[beneficiary];
          var limit = Math.min(beneficiaryState.maxHp, 5);
          var need = limit - (beneficiaryState.hand || []).length;
          if (need <= 0) continue;
          drawCards(game, beneficiary, need);
          log(game, actorName(game, targetActor) + '发动【节命】，令' + actorName(game, beneficiary)
            + '将手牌补至 ' + limit + ' 张。');
        }
        return { jiemingApplied: true };
      }

      // 受益者挑选: 显式偏好座席优先 (skillPreferences.jiemingTarget), 否则
      // 取"补牌收益最大且非敌对"的座席 — 只读公开信息 (手牌数是公开的,
      // 体力上限是公开的), 不读暗牌不读暗置身份。
      function jiemingPickBeneficiary(game, actor) {
        var explicit = game[actor].skillPreferences && game[actor].skillPreferences.jiemingTarget;
        if (explicit) {
          var resolved = StateRuntime.resolveSeatOption(game, explicit);
          if (resolved && game[resolved] && game[resolved].hp > 0) return resolved;
        }
        var best = null;
        var bestGain = 0;
        StateRuntime.aliveSeats(game).forEach(function (seat) {
          if (seat !== actor && StateRuntime.perceivedHostile(game, actor, seat)) return;
          var st = game[seat];
          var gain = Math.min(st.maxHp, 5) - (st.hand || []).length;
          if (gain > bestGain) { bestGain = gain; best = seat; }
        });
        return best;
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
        // audit4-H2: 亡者 hp 0 < maxHp 会骗过"已受伤"检查 → 给尸体回血。
        if (target.hp <= 0) return fail('目标已阵亡。');
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
        // audit4-H2: 不向亡者交牌 (缺省对手可能已亡)。
        if (target.hp <= 0) return fail('目标已阵亡。');
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
        // audit4-H2: 缺省对手可能已亡 (身份场对局未终) — 对尸体发动会重放
        // 濒死/死亡结算与奖惩, 与 playCard 的存活约束对齐。
        if (target.hp <= 0) return fail('目标已阵亡。');
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
          // audit4-M5: equipmentList 返回 {slot, card} 包装对象 — 直接与手牌
          // 原始卡 concat 会让装备区候选顶层 id 恒 undefined, 面板渲染全空、
          // 校验永假 → 神速②最典型用法 (弃已装备的坐骑/防具) 完全不可用。
          // 统一解包为原始卡; 执行层 removeOwnCardFromAnyZone 本就支持装备区。
          var equipped = equipmentList(state).map(function (entry) { return entry.card; });
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
            // 张角二修: 鬼道 (allowEquip) 候选覆盖手牌+装备黑牌; 鬼才仅手牌。
            var chosen = opts.allowEquip
              ? (function () { var e = guidaoBlackCards(holderState).find(function (x) { return x.card.id === decision.cardId; }); return e && e.card; })()
              : (holderState.hand || []).find(function (c) { return c.id === decision.cardId; });
            if (!chosen) {
              setPendingChoice(game, pending);
              return fail('找不到这张牌。');
            }
            if (opts.requireBlack && chosen.color !== 'black') {
              setPendingChoice(game, pending);
              return fail('【' + opts.skillLabel + '】只能打出黑色牌。');
            }
            // 鬼道装备来源经统一出口走失去时机; 鬼才恒手牌 (同样兼容)。
            var replacement = opts.allowEquip
              ? removeOwnCardFromAnyZone(holderState, decision.cardId, game)
              : takeCard(game, decision.cardId, { zone: 'hand', actor: holder });
            if (!replacement) {
              setPendingChoice(game, pending);
              return fail('找不到这张牌。');
            }
            // 张角三修: 鬼道="替换" (glossary: A 入 B 区 + 获得 B) → 原判定牌
            // 还原红颜视图后进持有者手牌 (获得); 鬼才="代替" → 弃置。
            resolvedCard = replacement;
            applyHongyanJudgementView(game, judgementActor, resolvedCard);
            log(game, actorName(game, holder) + '发动【' + opts.skillLabel + '】，' + opts.playVerb + '【' + replacement.name + '】' + replacement.suit + ' ' + replacement.rank + '（' + replacement.id + '）' + opts.replaceVerb + actorName(game, judgementActor) + '的判定牌。');
            settleReplacedOriginal(game, holder, originalCard, opts);
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
          // 评审收口: 非法目标按本文件惯例重挂, 玩家可重选 (UI 只发合法座席,
          // 此路径护引擎 API 直调)。
          if (!targetActor || candidates.indexOf(targetActor) < 0) {
            setPendingChoice(game, pending);
            return fail('无效的【雷击】目标。');
          }
          var executed = executeLeijiJudgement(game, actor, targetActor);
          if (executed && executed.suspendedForLeijiJudgement) return success('等待改判选择。');
          return success('【雷击】结算完成。');
        }

        // 鬼道 (张角) — gltjk wind spec: "任意角色的判定牌生效前, 可打出一张
        // 黑色牌替换之" (summary 用"黑色牌"非"黑色手牌")。张角二修: 候选放开
        // 到黑色手牌 + 黑色装备牌 (removeOwnCardFromAnyZone 统一出口, 装备
        // 来源顺带走失去时机)。玩家默认 ask (pausable 判定挂面板), AI auto
        // 取最低分黑牌。zone 标注供面板显示"装备"前缀。
        function guidaoBlackCards(state) {
          var out = (state.hand || []).filter(function (c) { return c.color === 'black'; })
            .map(function (c) { return { card: c, zone: 'hand' }; });
          var eq = (state && state.equipment) || {};
          ['weapon', 'armor', 'horsePlus', 'horseMinus'].forEach(function (slot) {
            if (eq[slot] && eq[slot].color === 'black') out.push({ card: eq[slot], zone: 'equipment' });
          });
          return out;
        }
        function guidaoCandidateOf(entry) {
          var c = entry.card;
          return { id: c.id, name: c.name, type: c.type, suit: c.suit, rank: c.rank, zone: entry.zone };
        }

        // 张角三修: 原判定牌落位 — 鬼道 (opts.gainOriginal) "替换" → 持有者获得
        // (进手牌); 鬼才 "代替" → 弃置。均先还原红颜视图 (物理牌花色不被永久
        // 改写)。glossary__gamecard: 替换=A 入 B 区同时获得 B; 代替=B 入弃牌堆。
        function settleReplacedOriginal(game, holder, originalCard, opts) {
          if (!originalCard) return;
          var restored = restoreHongyanJudgementView(originalCard);
          if (opts && opts.gainOriginal) {
            putCard(game, restored, { zone: 'hand', actor: holder });
            log(game, actorName(game, holder) + '获得原判定牌【' + restored.name + '】。');
          } else {
            discardCard(game, restored);
          }
        }

        function triggerGuidaoJudgementBeforeResolve(context) {
          var game = context.game;
          var judgementActor = context.actor;
          var originalCard = context.originalCard || context.card;
          if (!game || !originalCard || context.replaced) return null;
          // v13 审计三轮: 座次环扫描 (与鬼才共用 findRingSkillHolder) —
          // 此前二元 opponent(), 3p 第三席的鬼道持有者恒不可达。
          // 评审收口: canPay 与实际可用集对齐 — 黑色装备牌仅 ask 面板 (玩家)
          // 可用, AI/auto 只用手牌; 故"仅黑装备"的非玩家座席不算可发动, 不占
          // holder 名额挡住后座真正能自动改判者。张角当前为唯一鬼道持有者,
          // 此为多持有者场景的前瞻性对齐 (decline 仍由下方统一处理)。
          var holder = findRingSkillHolder(game, judgementActor, 'guidao', function (s) {
            var entries = guidaoBlackCards(s);
            // 黑手牌任意座席可用; 仅黑装备只有玩家 (走 ask 面板) 可用。
            return entries.some(function (e) { return e.zone === 'hand'; })
              || (s === game.player && entries.length > 0);
          });
          if (!holder) return null;
          var holderState = game[holder];
          var pref = (holderState.skillPreferences && holderState.skillPreferences.guidao)
            || (holder === 'player' ? 'ask' : 'auto');
          if (pref === 'decline') {
            log(game, actorName(game, holder) + '选择不发动【鬼道】。');
            return { declinedGuidao: true };
          }
          var blackEntries = guidaoBlackCards(holderState);
          // v13 张角修缮-3 (评审收口): 同一判定已有改判询问挂起时后到者彻底
          // 退让, 含 auto 路径 (同鬼才 hook — 防 AI 在玩家询问面板背后换牌)。
          var guidaoAlreadyAsking = game.pendingChoice
            && (game.pendingChoice.kind === 'guicai-replace' || game.pendingChoice.kind === 'guidao-replace')
            && game.pendingChoice.judgementActor === judgementActor;
          if (guidaoAlreadyAsking) return { deferredGuidao: true };
          if (pref === 'ask' && context.pausable) {
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
              candidates: blackEntries.map(guidaoCandidateOf)
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
          // 张角二修: auto (AI 缺省 / 显式 guidao='auto') 只用黑色手牌 —
          // 不自动弃置装备牌 (装备成本重, 是否舍弃交玩家 ask 面板手动决定)。
          var autoEntries = blackEntries.filter(function (e) { return e.zone === 'hand'; });
          if (!autoEntries.length) return null;
          if (context.reason === '【雷击】') {
            if (originalCard.suit === 'spade') return null;
            if (hasSkill(game[judgementActor], 'hongyan')) return null;
            autoEntries = autoEntries.filter(function (e) { return e.card.suit === 'spade'; });
            if (!autoEntries.length) return null;
          }
          var sortedGuidao = autoEntries
            .map(function (e) { return { card: e.card, score: scoreCardForAI(game, holder, e.card) }; })
            .sort(function (a, b) { return a.score - b.score; });
          var replacement = sortedGuidao[0].card;
          // 张角二修: 装备来源经统一出口 (removeOwnCardFromAnyZone) 走失去时机。
          var paidCard = removeOwnCardFromAnyZone(holderState, replacement.id, game);
          if (!paidCard) return null;
          context.card = replacement;
          context.replaced = true;
          log(game, actorName(game, holder) + '发动【鬼道】，打出【' + replacement.name + '】' + replacement.suit + ' ' + replacement.rank + '（' + replacement.id + '）替换' + actorName(game, judgementActor) + '的判定牌。');
          // 张角三修: 鬼道 "替换" → 持有者获得原判定牌 (AI 同样获得)。
          settleReplacedOriginal(game, holder, originalCard, { gainOriginal: true });
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
            requireBlack: true, allowEquip: true, gainOriginal: true, skillLabel: '鬼道', playVerb: '打出', replaceVerb: '替换'
          });
          if (leijiResolved) return leijiResolved;
          var saved = game.pauseState && game.pauseState.judgeArea;
          if (!saved || saved.actor !== judgementActor) return fail('找不到挂起的判定。');
          var originalCard = saved.currentJudgementCard;
          var resolvedCard = originalCard;
          var declined = !decision.cardId;
          if (!declined) {
            // 张角二修: 候选覆盖黑色手牌 + 装备牌; 取牌走统一出口 (装备来源
            // 顺带走失去时机)。
            var chosenEntry = guidaoBlackCards(holderState).find(function (e) { return e.card.id === decision.cardId; });
            // v12 G2 修复: 未找到牌也必须重挂 — 否则 pendingChoice 被清空而
            // pauseState.judgeArea 挂起快照悬空, 判定永远无法续跑 (回合卡死)。
            if (!chosenEntry) {
              setPendingChoice(game, pending);
              return fail('找不到这张牌。');
            }
            var replacement = removeOwnCardFromAnyZone(holderState, decision.cardId, game);
            if (!replacement) {
              setPendingChoice(game, pending);
              return fail('找不到这张牌。');
            }
            // 张角三修: 鬼道 "替换" → 持有者获得原判定牌 (进手牌); 替换牌补视图。
            resolvedCard = replacement;
            applyHongyanJudgementView(game, judgementActor, resolvedCard);
            log(game, actorName(game, holder) + '发动【鬼道】，打出【' + replacement.name + '】' + replacement.suit + ' ' + replacement.rank + '（' + replacement.id + '）替换' + actorName(game, judgementActor) + '的判定牌。');
            settleReplacedOriginal(game, holder, originalCard, { gainOriginal: true });
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
          // v14 Q3 (三轮审计降级项销账): 玩家张辽摸牌阶段真 ask — 缺省挂
          // tuxi-pick (候选/放弃自选), 摸牌在 resolver 收尾 (performDrawPhase
          // 检 pauseState.tuxiAsk 挂起, 出牌阶段推进由 resolver 补齐)。
          // 显式 'auto'/'always' 保留旧直发路径 (soak/基准逐键 auto 不受扰)。
          if (context.actor === 'player' && pref !== 'auto' && pref !== 'always') {
            if (!game.pauseState) game.pauseState = {};
            game.pauseState.tuxiAsk = { actor: actor, drawCount: context.drawCount };
            setPendingChoice(game, {
              kind: 'tuxi-pick',
              actor: actor,
              candidates: candidates.map(function (seat) {
                return { seat: seat, name: game[seat].name, handCount: (game[seat].hand || []).length };
              })
            });
            log(game, '等待' + actorName(game, actor) + '决定是否发动【突袭】。');
            // 已知局限 (评审收口记录): runHook 无早退, 注册在 tuxi 之后的
            // onDrawPhase hook (如裸衣) 在挂起期间照跑, 不受"发动后
            // drawCount 归零"抑制 — 现役武将无 tuxi+裸衣 组合, 若未来
            // 出现需给 runHook 增加挂起短路。
            return;
          }
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
        // v15 T: 驱虎 (荀彧) — 出牌阶段限一次, 与体力值大于己者拼点
        SkillRuntime.registerSkill(skillRegistry, 'quhu', {
        onActiveSkill: function (context) {
          return triggerQuhuActiveSkill(context);
        }
      });
        // v15 T: 天义 (太史慈) — 出牌阶段限一次拼点, 赢则杀增强
        SkillRuntime.registerSkill(skillRegistry, 'tianyi', {
        onActiveSkill: function (context) {
          return triggerTianyiActiveSkill(context);
        }
      });
        // v15 T: 乱击 (袁绍) — 两张同花色手牌当万箭齐发
        SkillRuntime.registerSkill(skillRegistry, 'luanji', {
        onActiveSkill: function (context) {
          return triggerLuanjiActiveSkill(context);
        }
      });
        // v15 T: 双雄 (颜良文丑) — 摸牌阶段改判定并获得判定牌
        SkillRuntime.registerSkill(skillRegistry, 'shuangxiong', {
        onDrawPhase: function (context) {
          return triggerShuangxiongDrawPhase(context);
        },
        onJudgementAfterResolve: function (context) {
          return triggerShuangxiongClaim(context);
        },
        onCardAs: function (context) {
          return triggerShuangxiongCardAs(context);
        }
      });
        // v15 T: 涅槃 (庞统) — 限定技, 濒死时复原
        SkillRuntime.registerSkill(skillRegistry, 'niepan', {
        onDyingEnter: function (context) {
          return triggerNiepanDyingEnter(context);
        }
      });
        // v15 T: 火计 (卧龙诸葛亮) — 红色手牌当火攻
        SkillRuntime.registerSkill(skillRegistry, 'huoji', {
        onCardAs: function (context) {
          return triggerHuojiCardAs(context);
        }
      });
        // v15 T: 连环 (庞统) — 梅花手牌当铁索连环 + 梅花手牌可重铸
        SkillRuntime.registerSkill(skillRegistry, 'lianhuan', {
        onCardAs: function (context) {
          return triggerLianhuanCardAs(context);
        },
        onCanRecast: function (context) {
          var state = context.state;
          if (!state || !hasSkill(state, 'lianhuan')) return null;
          return !!(context.card && context.card.suit === 'club');
        }
      });
        // v15 T: 强袭 (典韦) — 出牌阶段限一次, 失体力/弃武器换 1 点伤害
        SkillRuntime.registerSkill(skillRegistry, 'qiangxi', {
        onActiveSkill: function (context) {
          return triggerQiangxiActiveSkill(context);
        }
      });
        // v15 T: 节命 (荀彧) — 每受到 1 点伤害后令一名角色补手牌至 X
        SkillRuntime.registerSkill(skillRegistry, 'jieming', {
        onDamageAfter: function (context) {
          return triggerJiemingDamageAfter(context);
        }
      });
        // v15 T: 猛进 (庞德) — 杀被闪抵消时弃目标一张牌
        SkillRuntime.registerSkill(skillRegistry, 'mengjin', {
        onShaDodged: function (context) {
          return triggerMengjinShaDodged(context);
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
          // audit4-L3: 官方成本"弃置一张牌" (非"手牌") — 手牌与装备区皆可
          // 支付 (removeOwnCardFromAnyZone 统一出口, 装备失去时机照常)。
          var lijianCost = removeOwnCardFromAnyZone(self, cardIds[0], game);
          if (!lijianCost) return fail('选择的牌不存在。');
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
          resolveMengjinPickChoice: resolveMengjinPickChoice,
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
        // v15 T (火包): 强袭/驱虎/天义 (出牌阶段限一次) / 乱击 (双牌当万箭)
        qiangxi: true,
        quhu: true,
        tianyi: true,
        luanji: true,
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

