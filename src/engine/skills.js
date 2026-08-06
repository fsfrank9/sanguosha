      import { SkillRuntime } from './skill-runtime.js';
      import { StateRuntime } from './state.js';
      import { CardRuntime } from './card-runtime.js';
      // v15 V: 觉醒技授予新技能时需要写入技能描述 —— data/heroes.js 是叶子模块
      // (自身无 import),从引擎侧引用不会成环。
      import { SKILL_METADATA } from '../data/heroes.js';

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
        // v15 U: 乱武逐席取杀
        var removeFirstCardOfType = deps.removeFirstCardOfType;
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
        var d = decision || {};
        // W2 (第五轮审计 F2): 反馈官方逐字是"每当你受到伤害后, 你**可以**获得
        // 来源的一张牌" (card__hero__wei.md:61, sha256 前 12 位 c11735ad316a
        // 为同族的 :53 行)。此前窗口一开就下不来 —— resolver 只认
        // zone: hand/equipment, 别的一律重挂; UI 面板也只有区域钮没有"不发动"。
        // 唯一的放弃出路是**伤害发生前**就把 skillPreferences.fankui 设成
        // 'decline', 窗口内无路可退。身份场里这不是纯洁癖: 司马懿被队友误伤时
        // 会被迫去偷队友的牌。补 decline 分支。
        if (d.decline || d.skip) {
          log(game, actorName(game, holder) + '选择不发动【反馈】。');
          return success('反馈未发动。');
        }
        var zone = d.zone;
        // M3: 判定区牌不为任何角色所拥有, 反馈不可获得 (glossary__zone.md)。
        if (['hand', 'equipment'].indexOf(zone) < 0) {
          setPendingChoice(game, pending);
          return fail('请选择有效的区域（hand / equipment），或放弃发动。');
        }
        // For hand zone we deliberately ignore decision.cardId — engine
        // picks a random hand card, preserving the "opponent's hand
        // contents are hidden when 反馈 is choosing" semantic. equipment
        // zone uses the specific cardId the player clicked.
        var gained = removeTargetZoneCard(game, sourceActor, zone, zone === 'hand' ? null : d.cardId);
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

      // v15 U: 烈刃 (祝融) — "当你赢后，你获得其一张牌"。没赢无效果。
      // "其一张牌" = 目标区域里的一张牌 (手牌为暗牌 → 随机; 装备区可指定),
      // 与猛进"弃置其一张牌"同一取牌出口, 只是落点从弃牌堆改为自己手牌。
      registerPindianContinuation('lieren', function (game, outcome) {
        if (!outcome.won) return success('烈刃拼点没赢。');
        var actor = outcome.actor;
        var targetActor = outcome.target;
        if (!game[targetActor] || game[targetActor].hp <= 0) {
          return success('烈刃：拼点目标已阵亡。');
        }
        var zones = [];
        if ((game[targetActor].hand || []).length) zones.push('hand');
        if (equipmentList(game[targetActor]).length) zones.push('equipment');
        if (!zones.length) return success('烈刃：目标没有牌可获得。');
        // 缺省优先装备区 (公开信息, 确定性收益 > 随机手牌) — 与猛进同款启发。
        var zone = zones.indexOf('equipment') >= 0 ? 'equipment' : 'hand';
        var removed = removeTargetZoneCard(game, targetActor, zone, null);
        if (!removed || !removed.card) return success('烈刃：没有取到牌。');
        putCard(game, removed.card, { zone: 'hand', actor: actor });
        log(game, actorName(game, actor) + '发动【烈刃】拼点赢，获得'
          + actorName(game, targetActor) + '的一张' + zoneLabel(removed.zone) + '。');
        return success('烈刃结算完成。');
      });

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
          // 评审收口 [中]: 官方"其对其攻击范围内**你选择**的一名角色造成
          // 1 点伤害" —— 选择发生在**赢之后** (拼点前谁也不知道会不会赢),
          // 所以玩家席在这里开窗, 而不是靠事先传 victim。候选唯一时直接
          // 成局 (无可选内容, 不打断节奏)。
          var pickable = candidates.filter(function (seat) { return seat !== actor; });
          if (!pickable.length) pickable = candidates;
          if (actor === 'player' && candidates.length > 1
              && !(game[actor].skillPreferences && game[actor].skillPreferences.quhu === 'auto')) {
            setPendingChoice(game, {
              kind: 'quhu-victim',
              actor: actor,
              targetActor: targetActor,
              candidates: candidates.map(function (seat) {
                return { seat: seat, name: game[seat].name, hp: game[seat].hp };
              })
            });
            log(game, '等待' + actorName(game, actor) + '选择【驱虎】的受伤角色。');
            return success('等待【驱虎】选择受伤角色。');
          }
          // 缺省挑选序 (AI / auto): 只读公开信息 — 感知敌对优先 → 血线最低。
          // 荀彧自己虽在官方可选面内 (文本未排除), 但缺省绝不自伤。
          var pool = StateRuntime.perceivedHostileFirstPool(game, actor, pickable);
          victim = pool.slice().sort(function (a, b) { return game[a].hp - game[b].hp; })[0];
        }
        damage(game, victim, 1, targetActor, '【驱虎】');
        return success('驱虎结算完成。');
      });

      // 驱虎受害者选择 resolver — decision: { victim: seat }。
      // 非法/缺省一律重挂 (与突袭同款), 不静默兜底。
      function resolveQuhuVictimChoice(game, pending, decision) {
        var legal = (pending.candidates || []).map(function (entry) { return entry.seat; });
        var victim = StateRuntime.resolveSeatOption(game, decision && decision.victim);
        if (!victim || legal.indexOf(victim) < 0 || !game[victim] || game[victim].hp <= 0) {
          setPendingChoice(game, pending);
          return fail('请从【驱虎】的候选中选择一名角色。');
        }
        damage(game, victim, 1, pending.targetActor, '【驱虎】');
        return success('驱虎结算完成。');
      }

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
        log(game, actorName(game, actor) + '发动【乱击】，将两张' + CardRuntime.suitLabelOf(picked[0])
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
        // 评审收口 [中]: 官方"摸牌阶段开始时，你**可以**放弃摸牌…"
        // (card__hero__neutral.md:161)。此前 'ask' 档不开窗、还跳过了 auto
        // 的门槛判断 → 玩家席**每回合被强制**放弃摸牌。改为与突袭同款的
        // 真 ask (pendingChoice 'shuangxiong-ask', 摸牌由 resolver 收尾);
        // 显式 'auto'/'always' 保留直发路径 (soak/基准不受扰)。
        if (pref === 'ask') {
          if (!game.pauseState) game.pauseState = {};
          game.pauseState.shuangxiongAsk = { actor: actor, drawCount: context.drawCount };
          setPendingChoice(game, {
            kind: 'shuangxiong-ask',
            actor: actor,
            handCount: (self.hand || []).length,
            drawCount: context.drawCount
          });
          log(game, '等待' + actorName(game, actor) + '决定是否发动【双雄】。');
          return { suspendedForShuangxiong: true };
        }
        // auto: 手上已有可当决斗的异色牌越多, 放弃摸牌的收益越高 — 简化为
        // "手牌数 < 3 时不换" (摸两张的确定性收益更高)。
        if (pref === 'auto' && (self.hand || []).length < 3) return null;
        return applyShuangxiongDrawPhase(game, actor, context);
      }

      // 双雄的效果体 (判定 → 放弃摸牌 → 认领判定牌 → 授权异色当决斗)。
      // ask 档由 resolveShuangxiongAskChoice 调用 (context 为轻量壳)。
      function applyShuangxiongDrawPhase(game, actor, context) {
        var self = game[actor];
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
        // 评审收口 [中]: 官方"限定技，当你处于濒死状态时，你**可以**…"
        // (card__hero__shu.md:324)。此前玩家席也是 auto → 濒死一进就把限定技
        // 烧掉、连手上那张【桃】一起弃光, 玩家全程无提示。玩家席默认开窗询问
        // (与突袭/遗计同款 ask 档), AI 席仍走 auto。
        var pref = (self.skillPreferences && self.skillPreferences.niepan)
          || (dyingActor === 'player' ? 'ask' : 'auto');
        if (pref === 'decline') {
          log(game, actorName(game, dyingActor) + '选择不发动【涅槃】。');
          return null;
        }
        if (pref === 'ask') {
          setPendingChoice(game, {
            kind: 'niepan-ask',
            actor: dyingActor,
            handCount: (self.hand || []).length,
            equipmentCount: ['weapon', 'armor', 'horseMinus', 'horsePlus']
              .filter(function (slot) { return self.equipment && self.equipment[slot]; }).length,
            judgeAreaCount: (self.judgeArea || []).length
          });
          log(game, '等待' + actorName(game, dyingActor) + '决定是否发动【涅槃】。');
          return { suspendedForNiepan: true };
        }
        return applyNiepan(game, dyingActor);
      }

      // 涅槃的效果体 (限定技标记 → 弃区域所有牌 → 武将牌复原 → 摸三 →
      // 体力回复至 3)。ask 档由 resolveNiepanAskChoice 调用。
      function applyNiepan(game, dyingActor) {
        var self = game[dyingActor];
        if (!self) return null;
        self.flags = self.flags || {};
        if (self.flags.niepanUsed) return null;
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
        // 评审收口 [中]: 判定阶段里, 本角色尚未结算的延时锦囊已被
        // processJudgeArea 整批 splice 成"在途" —— 但按官方它们仍在其判定区。
        // 不认领就会出现"涅槃弃置了区域内所有牌, 然后那张【乐不思蜀】照常
        // 生效"。认领后记进 claimed, 判定循环跳过它们。
        var inFlight = game.pauseState && game.pauseState.judgeAreaInFlight;
        if (inFlight && inFlight.actor === dyingActor) {
          inFlight.pending.forEach(function (card) {
            if (!card || inFlight.claimed.indexOf(card) >= 0) return;
            if (CardRuntime.findCardZoneByRef(game, card)) return; // 已落回某区域, 上面已处理
            inFlight.claimed.push(card);
            discardCard(game, card);
          });
        }
        // ② 武将牌恢复至游戏开始时的状态 (翻回正面 + 解除横置)
        self.turnedOver = false;
        self.chained = false;
        // ③ 摸三张 ④ 体力回复至 3 点
        drawCards(game, dyingActor, 3);
        // 评审收口 [低 L6]: 官方逐字"将体力值**回复至3点**" — 体力值上限是
        // 体力上限, 故取 min(maxHp, 3) 是对的; 但"回复"不应倒扣, 现有写法在
        // hp 已 > 3 时会把体力打下来 (涅槃只在濒死即 hp<=0 时可发动, 当前
        // 不可达; 变体 maxHp<3 时 min 同样正确)。改为只升不降。
        self.hp = Math.max(self.hp, Math.min(self.maxHp, 3));
        log(game, actorName(game, dyingActor)
          + '发动【涅槃】：弃置区域内所有牌，武将牌复原，摸三张牌，体力回复至 ' + self.hp + ' 点。');
        return { niepanApplied: true };
      }

      // 涅槃 ask resolver — decision: { decline: true } / 其他即发动。
      // 收尾后重入濒死循环 (dyingEnterFired 已置位, 不会重复开窗)。
      function resolveNiepanAskChoice(game, pending, decision) {
        var dyingActor = pending.actor;
        if (decision && (decision.decline || decision.skip)) {
          log(game, actorName(game, dyingActor) + '选择不发动【涅槃】。');
        } else {
          applyNiepan(game, dyingActor);
        }
        if (deps.processDyingNext) {
          var outcome = deps.processDyingNext(game);
          if (outcome && outcome.paused) return success('继续濒死结算。');
        }
        return success('涅槃结算完成。');
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
        // W2 (第五轮审计 F6 的**反例**, 记录以免后人重踩):
        // 本轮曾据 card__hero__wei.md:295 的（风）曹仁「摸**一张**牌」把这里
        // 改成 1, 随后被对抗验证驳回 —— **（风）曹仁是另一张武将牌**: 它是
        // 据守(摸一张) + **【解围】** 的双技重做版 (:297)。摸三张对应的是
        // 单技曹仁 (旧风/1V1/3V3/国-标 四个版本一致, :301/:305/:309/:313),
        // 而本仓的曹仁正是单技卡。只挑技能行不看整张牌的技能集去换版本,
        // 得到的是一个**任何官方版本都不存在**的弱化曹仁。已还原为摸三张。
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
      // ═════ v15 U (林包): 曹丕 行殇 / 放逐 / 颂威 ═════
      // 行殇 (card__hero__wei.md:349): "每当其他角色死亡时，你可以获得其所有牌。"
      // 时机在死亡结算**弃置其所有牌之前** (damage-dying.js settleDeath →
      // discardAllZones), 由该处派发 onDeath 钩子。"所有牌" = 手牌 + 装备区 +
      // 判定区 (判定区的牌不为角色所拥有, 但官方"其所有牌"在死亡结算语境下
      // 指其区域里的牌 — 与 discardAllZones 的覆盖面一致, 取同一集合)。
      function triggerXingshangDeath(context) {
        var game = context.game;
        var deadActor = context.deadActor;
        var results = [];
        StateRuntime.aliveSeats(game).forEach(function (seat) {
          // W2 F5: 死亡时机改为按官方轮转序逐席派发 → 只处理轮到的那一席。
          if (context.resolvingSeat && seat !== context.resolvingSeat) return;
          var state = game[seat];
          if (seat === deadActor || !state || !hasSkill(state, 'xingshang')) return;
          var pref = (state.skillPreferences && state.skillPreferences.xingshang)
            || 'auto'; // "你可以" — 但获得牌恒为正收益, 缺省发动 (含玩家席)
          if (pref === 'decline') {
            log(game, actorName(game, seat) + '选择不发动【行殇】。');
            return;
          }
          var dead = game[deadActor];
          if (!dead) return;
          var gained = 0;
          (dead.hand || []).slice().forEach(function (card) {
            var taken = takeCard(game, card, { zone: 'hand', actor: deadActor });
            if (taken) { putCard(game, taken, { zone: 'hand', actor: seat }); gained += 1; }
          });
          ['weapon', 'armor', 'horseMinus', 'horsePlus'].forEach(function (slot) {
            var equip = dead.equipment && dead.equipment[slot];
            if (!equip) return;
            var taken = takeCard(game, equip, { zone: 'equipment', actor: deadActor, slot: slot });
            if (taken) { putCard(game, taken, { zone: 'hand', actor: seat }); gained += 1; }
          });
          (dead.judgeArea || []).slice().forEach(function (card) {
            var taken = takeCard(game, card, { zone: 'judgeArea', actor: deadActor });
            if (taken) { putCard(game, taken, { zone: 'hand', actor: seat }); gained += 1; }
          });
          if (gained > 0) {
            log(game, actorName(game, seat) + '发动【行殇】，获得'
              + actorName(game, deadActor) + '的所有牌（' + gained + ' 张）。');
          }
          results.push({ xingshangGained: gained });
        });
        return results.length ? { xingshangApplied: true } : null;
      }

      // 放逐 (card__hero__wei.md:351): "每当你受到伤害后，你可以令一名其他角色
      // 摸X张牌（X为你已损失的体力值），然后其翻面。"
      // X 可能为 0 (满血受伤后立刻被回满等边界) — 官方未排除 X=0, 此时"摸 0 张
      // 然后翻面"仍成立, 故不以 X>0 作门槛。
      function triggerFangzhuDamageAfter(context) {
        var game = context.game;
        var targetActor = context.targetActor;
        var self = game[targetActor];
        if (!self || !hasSkill(self, 'fangzhu') || game.phase === 'gameover') return null;
        if (context.amount <= 0 || self.hp <= 0) return null;
        var pref = (self.skillPreferences && self.skillPreferences.fangzhu)
          || (targetActor === 'player' ? 'ask' : 'auto');
        if (pref === 'decline') {
          log(game, actorName(game, targetActor) + '选择不发动【放逐】。');
          return null;
        }
        var candidates = StateRuntime.aliveSeats(game).filter(function (seat) {
          return seat !== targetActor;
        });
        if (!candidates.length) return null;
        var lost = Math.max(0, (self.maxHp || 0) - self.hp);
        if (pref === 'ask') {
          setPendingChoice(game, {
            kind: 'fangzhu-pick',
            actor: targetActor,
            drawCount: lost,
            candidates: candidates.map(function (seat) {
              return { seat: seat, name: game[seat].name, hp: game[seat].hp,
                turnedOver: !!game[seat].turnedOver };
            })
          });
          log(game, '等待' + actorName(game, targetActor) + '决定是否发动【放逐】。');
          return { suspendedForFangzhu: true };
        }
        // AI 启发: 只读公开信息 — 优先翻**未翻面的感知敌对**座席 (翻面 = 跳过
        // 其下个回合, 对敌人是净损失); 全场无敌对候选时不发动 (摸牌白送)。
        var pool = candidates.filter(function (seat) { return !game[seat].turnedOver; });
        var hostile = StateRuntime.perceivedHostileFirstPool(game, targetActor, pool);
        if (!pool.length || !hostile.length) return null;
        return applyFangzhu(game, targetActor, hostile[0], lost);
      }

      function applyFangzhu(game, actor, targetSeat, drawCount) {
        var target = game[targetSeat];
        if (!target) return null;
        if (drawCount > 0) drawCards(game, targetSeat, drawCount);
        target.turnedOver = !target.turnedOver;
        log(game, actorName(game, actor) + '发动【放逐】，令' + actorName(game, targetSeat)
          + '摸 ' + drawCount + ' 张牌并将武将牌'
          + (target.turnedOver ? '翻面。' : '翻回正面。'));
        return { fangzhuApplied: true };
      }

      function resolveFangzhuPickChoice(game, pending, decision) {
        var actor = pending.actor;
        var d = decision || {};
        if (d.decline || d.skip) {
          log(game, actorName(game, actor) + '选择不发动【放逐】。');
          return success('放逐结算完成。');
        }
        var legal = (pending.candidates || []).map(function (entry) { return entry.seat; });
        var seat = StateRuntime.resolveSeatOption(game, d.target);
        if (!seat || legal.indexOf(seat) < 0) {
          setPendingChoice(game, pending);
          return fail('请指定一名其他角色发动【放逐】，或 decline 放弃。');
        }
        applyFangzhu(game, actor, seat, pending.drawCount || 0);
        return success('放逐结算完成。');
      }

      // 颂威 (card__hero__wei.md:353): "主公技，每当其他魏势力角色的黑色判定牌
      // 生效后，其可以令你摸一张牌。"
      // 注意三点: ① 主公技 → 仅当曹丕为主公时生效; ② 触发者是**其他魏势力
      // 角色**的判定, 曹丕自己的判定不触发; ③ 决定权在**判定者**而非曹丕
      // ("其可以令你摸") —— 判定者是玩家席时才需要询问, 但收益全归曹丕且对
      // 判定者零成本, 故按"恒发动"处理并如实记录 (见 spec 简报 L 裁定)。
      function triggerSongweiJudgementAfterResolve(context) {
        var game = context.game;
        var actor = context.actor;
        var state = context.state || game[actor];
        var card = physicalCardOf(context.card);
        if (!state || !card) return null;
        if (StateRuntime.effectiveCardColor(state, card) !== 'black') return null;
        if (state.camp !== '魏') return null;
        var roles = game.roles || {};
        var lord = StateRuntime.aliveSeats(game).find(function (seat) {
          return roles[seat] === '主公' && hasSkill(game[seat], 'songwei');
        });
        if (!lord || lord === actor) return null;
        var lordPref = game[lord].skillPreferences && game[lord].skillPreferences.songwei;
        if (lordPref === 'decline') return null;
        drawCards(game, lord, 1);
        log(game, actorName(game, actor) + '的黑色判定牌生效，发动【颂威】令'
          + actorName(game, lord) + '摸一张牌。');
        return { songweiApplied: true };
      }

      // ═════ v15 U (林包): 孙坚 英魂 ═════
      // 官方逐字 (card__hero__wu.md:279): "准备阶段开始时，若你已受伤，你可以
      // 选择一项：1.令一名其他角色摸X张牌，然后其弃置一张牌；2.令一名其他角色
      // 摸一张牌，然后其弃置X张牌。（X为你已损失的体力值）"
      function triggerYinghunPrepare(context) {
        var game = context.game;
        var actor = context.actor;
        var self = game[actor];
        if (!self || !hasSkill(self, 'yinghun') || game.phase === 'gameover') return null;
        var lost = Math.max(0, (self.maxHp || 0) - self.hp);
        if (lost <= 0) return null; // "若你已受伤"
        var pref = (self.skillPreferences && self.skillPreferences.yinghun)
          || (actor === 'player' ? 'ask' : 'auto');
        if (pref === 'decline') {
          log(game, actorName(game, actor) + '选择不发动【英魂】。');
          return null;
        }
        var candidates = StateRuntime.aliveSeats(game).filter(function (seat) {
          return seat !== actor;
        });
        if (!candidates.length) return null;
        if (pref === 'ask') {
          setPendingChoice(game, {
            kind: 'yinghun-choice',
            actor: actor,
            x: lost,
            candidates: candidates.map(function (seat) {
              return { seat: seat, name: game[seat].name,
                handCount: (game[seat].hand || []).length };
            })
          });
          log(game, '等待' + actorName(game, actor) + '决定【英魂】的选项与目标。');
          return { suspendedForYinghun: true };
        }
        // AI 启发 (只读公开信息): 对敌对座席选"摸一弃X" (X>1 时净损其 X-1 张),
        // 对友方选"摸X弃一" (净得 X-1 张)。X=1 时两项等价, 取选项 1 喂友方。
        var hostile = StateRuntime.perceivedHostileFirstPool(game, actor, candidates);
        var foe = hostile[0];
        var isHostile = foe && StateRuntime.perceivedHostile(game, actor, foe);
        if (lost > 1 && isHostile) return applyYinghun(game, actor, foe, 2, lost);
        var ally = candidates.find(function (seat) {
          return !StateRuntime.perceivedHostile(game, actor, seat);
        }) || foe;
        return applyYinghun(game, actor, ally, 1, lost);
      }

      // option 1: 摸 X 弃 1 / option 2: 摸 1 弃 X。
      function applyYinghun(game, actor, targetSeat, option, x) {
        var target = game[targetSeat];
        if (!target) return null;
        var drawCount = option === 2 ? 1 : x;
        var discardCount = option === 2 ? x : 1;
        drawCards(game, targetSeat, drawCount);
        // 弃置由目标自己选牌 — AI 席走弃牌估值, 玩家席同样走该出口 (与
        // 五谷/铁索那类"令其弃置"同款: 本仓对被动弃牌统一用 AI 估值挑,
        // 不为被动方开窗; 如实记录为已知局限)。
        var actuallyDiscarded = 0;
        for (var i = 0; i < discardCount; i += 1) {
          var hand = target.hand || [];
          if (!hand.length) break;
          var pickId = deps.aiDiscardCandidates
            ? (deps.aiDiscardCandidates(game, targetSeat) || [])[0]
            : null;
          var picked = pickId
            ? hand.find(function (c) { return c.id === pickId; })
            : hand[0];
          var removed = removeCardFromHand(target, (picked || hand[0]).id);
          if (removed) { discardCard(game, removed); actuallyDiscarded += 1; }
        }
        log(game, actorName(game, actor) + '发动【英魂】，令' + actorName(game, targetSeat)
          + '摸 ' + drawCount + ' 张牌并弃置 ' + actuallyDiscarded + ' 张牌。');
        return { yinghunApplied: true };
      }

      function resolveYinghunChoice(game, pending, decision) {
        var actor = pending.actor;
        var d = decision || {};
        if (d.decline || d.skip) {
          log(game, actorName(game, actor) + '选择不发动【英魂】。');
          return success('英魂结算完成。');
        }
        var legal = (pending.candidates || []).map(function (entry) { return entry.seat; });
        var seat = StateRuntime.resolveSeatOption(game, d.target);
        var option = d.option === 2 ? 2 : 1;
        if (!seat || legal.indexOf(seat) < 0) {
          setPendingChoice(game, pending);
          return fail('请指定一名其他角色发动【英魂】，或 decline 放弃。');
        }
        applyYinghun(game, actor, seat, option, pending.x || 1);
        return success('英魂结算完成。');
      }

      // ═════ v15 U (林包): 鲁肃 好施 / 缔盟 ═════
      // 好施 (card__hero__wu.md:455): "摸牌阶段，你可以多摸两张牌，然后若你的
      // 手牌数大于5，你将一半的手牌交给一名手牌最少的其他角色。"
      // 官方裁定两条:
      //  - "一半": glossary__value.md:166 "一个数值若为奇数，则它的一半默认
      //    向下取整。"
      //  - 并列最少: rule__element.md:91 判例 "全场若有至少两名其他角色手牌数
      //    同为最少，鲁肃发动【好施】后可以选择对其中任意一名执行…" → 由鲁肃选。
      function triggerHaoshiDrawPhase(context) {
        var game = context.game;
        var actor = context.actor;
        var self = game[actor];
        if (!self || !hasSkill(self, 'haoshi')) return null;
        var pref = (self.skillPreferences && self.skillPreferences.haoshi) || 'auto';
        if (pref === 'decline') {
          log(game, actorName(game, actor) + '选择不发动【好施】。');
          return null;
        }
        // "多摸两张牌" — 改的是本阶段摸牌数, 不是额外 drawCards (否则会多打
        // 一行摸牌日志且与其他改摸牌数的钩子叠加口径不一致)。
        context.drawCount = (context.drawCount || 0) + 2;
        self.flags = self.flags || {};
        self.flags.haoshiPending = true; // 摸完之后才判手牌数, 见 settleHaoshi
        log(game, actorName(game, actor) + '发动【好施】，多摸两张牌。');
        return { haoshiApplied: true };
      }

      // 好施的"然后"段 — 必须在**摸牌完成之后**结算 (手牌数要含刚摸的牌)。
      // 由引擎在 performDrawPhase 摸完后调用。
      function settleHaoshi(game, actor) {
        var self = game[actor];
        if (!self || !self.flags || !self.flags.haoshiPending) return null;
        self.flags.haoshiPending = false;
        var hand = self.hand || [];
        if (hand.length <= 5) return null; // "若你的手牌数大于5"
        var others = StateRuntime.aliveSeats(game).filter(function (seat) { return seat !== actor; });
        if (!others.length) return null;
        var minCount = others.reduce(function (acc, seat) {
          return Math.min(acc, (game[seat].hand || []).length);
        }, Infinity);
        var tied = others.filter(function (seat) { return (game[seat].hand || []).length === minCount; });
        var half = Math.floor(hand.length / 2); // 官方: 奇数向下取整
        if (tied.length > 1 && actor === 'player') {
          setPendingChoice(game, {
            kind: 'haoshi-give',
            actor: actor,
            giveCount: half,
            candidates: tied.map(function (seat) {
              return { seat: seat, name: game[seat].name, handCount: (game[seat].hand || []).length };
            })
          });
          log(game, '等待' + actorName(game, actor) + '选择【好施】的受赠角色（并列手牌最少）。');
          return { suspendedForHaoshi: true };
        }
        // 缺省 (AI 席 / 无并列): 感知友方优先 —— 送牌是净资敌, 只读公开信息。
        var friendly = tied.filter(function (seat) {
          return !StateRuntime.perceivedHostile(game, actor, seat);
        });
        return applyHaoshiGive(game, actor, (friendly[0] || tied[0]), half);
      }

      // 交牌: 走 CardRuntime 移动出口 (手牌失去时机照常派发)。牌由鲁肃自选,
      // 缺省取"最不值钱的 half 张" (AI 弃牌估值), 与被动弃牌同一出口。
      function applyHaoshiGive(game, actor, targetSeat, count) {
        var self = game[actor];
        var target = game[targetSeat];
        if (!self || !target || count <= 0) return null;
        var ordered = (self.hand || []).slice();
        var ranked = deps.aiDiscardCandidates ? (deps.aiDiscardCandidates(game, actor) || []) : [];
        if (ranked.length) {
          ordered.sort(function (a, b) {
            var ia = ranked.indexOf(a.id); var ib = ranked.indexOf(b.id);
            return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
          });
        }
        var given = 0;
        for (var i = 0; i < ordered.length && given < count; i += 1) {
          var moved = moveCard(game, ordered[i], { zone: 'hand', actor: actor },
            { zone: 'hand', actor: targetSeat });
          if (moved) given += 1;
        }
        log(game, actorName(game, actor) + '发动【好施】，将一半手牌（' + given
          + ' 张）交给' + actorName(game, targetSeat) + '。');
        return { haoshiGiven: given };
      }

      // 缔盟 (card__hero__wu.md:457): "出牌阶段限一次，你可以选择两名其他角色
      // 并弃置X张牌（X为这两名角色手牌数的差），令这两名角色交换手牌。"
      // X 可能为 0 (两人手牌数相同) → 零成本发动, 官方未排除。
      function triggerDimengActiveSkill(context) {
        if (context.skillId !== 'dimeng') return null;
        var game = context.game;
        var actor = context.actor;
        var self = context.state;
        if (!self || !hasSkill(self, 'dimeng')) return null;
        if (self.flags.dimengUsed) return fail('【缔盟】每回合限一次。');
        var opts = context.options || {};
        var seatA = StateRuntime.resolveSeatOption(game, opts.targetA || opts.target);
        var seatB = StateRuntime.resolveSeatOption(game, opts.targetB);
        if (!seatA || !seatB) {
          // 缺省: 手牌差最大的一对其他角色 (只读公开的手牌**数**)。
          var others = StateRuntime.aliveSeats(game).filter(function (seat) { return seat !== actor; });
          if (others.length < 2) return fail('【缔盟】需要两名其他角色。');
          var best = null;
          for (var i = 0; i < others.length; i += 1) {
            for (var j = i + 1; j < others.length; j += 1) {
              var diff = Math.abs((game[others[i]].hand || []).length - (game[others[j]].hand || []).length);
              if (!best || diff > best.diff) best = { a: others[i], b: others[j], diff: diff };
            }
          }
          seatA = seatA || best.a;
          seatB = seatB || best.b;
        }
        if (seatA === seatB) return fail('【缔盟】须选择两名不同的其他角色。');
        if (seatA === actor || seatB === actor) return fail('【缔盟】不能选择自己。');
        if (!game[seatA] || game[seatA].hp <= 0 || !game[seatB] || game[seatB].hp <= 0) {
          return fail('【缔盟】的目标已阵亡。');
        }
        var countA = (game[seatA].hand || []).length;
        var countB = (game[seatB].hand || []).length;
        var cost = Math.abs(countA - countB);
        if ((self.hand || []).length < cost) {
          return fail('【缔盟】需要弃置 ' + cost + ' 张牌，你的手牌不足。');
        }
        // 先付成本再交换 (成本不足在上面已拒, 零副作用)。
        var costIds = Array.isArray(context.cardIds) ? context.cardIds.slice(0, cost) : [];
        if (costIds.length < cost) {
          var ranked = deps.aiDiscardCandidates ? (deps.aiDiscardCandidates(game, actor) || []) : [];
          (self.hand || []).slice()
            .sort(function (a, b) {
              var ia = ranked.indexOf(a.id); var ib = ranked.indexOf(b.id);
              return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
            })
            .forEach(function (card) {
              if (costIds.length < cost && costIds.indexOf(card.id) < 0) costIds.push(card.id);
            });
        }
        for (var ci = 0; ci < costIds.length; ci += 1) {
          var removed = removeCardFromHand(self, costIds[ci]);
          if (removed) discardCard(game, removed);
        }
        self.flags.dimengUsed = true;
        swapHands(game, seatA, seatB);
        log(game, actorName(game, actor) + '发动【缔盟】，弃置 ' + cost + ' 张牌，令'
          + actorName(game, seatA) + '与' + actorName(game, seatB) + '交换手牌。');
        return success('缔盟结算完成。');
      }

      // 整手牌交换 — 必须走 CardRuntime 移动出口 (守恒红线)。先把两边手牌
      // 都取出到在途数组, 再交叉放回; 中途不经弃牌堆 (交换不是弃置)。
      function swapHands(game, seatA, seatB) {
        var a = game[seatA];
        var b = game[seatB];
        if (!a || !b) return;
        var fromA = (a.hand || []).slice().map(function (card) {
          return takeCard(game, card, { zone: 'hand', actor: seatA });
        }).filter(Boolean);
        var fromB = (b.hand || []).slice().map(function (card) {
          return takeCard(game, card, { zone: 'hand', actor: seatB });
        }).filter(Boolean);
        fromA.forEach(function (card) { putCard(game, card, { zone: 'hand', actor: seatB }); });
        fromB.forEach(function (card) { putCard(game, card, { zone: 'hand', actor: seatA }); });
      }

      // ═════ v15 U (林包): 孟获 再起 ═════
      // 官方逐字 (card__hero__shu.md:406): "摸牌阶段开始时，若你已受伤，你可以
      // 放弃摸牌，亮出牌堆顶的X张牌（X为你已损失的体力值），然后回复等同于其中
      // 红桃牌数的体力，将这些红桃牌置入弃牌堆，获得其余的牌。"
      function triggerZaiqiDrawPhase(context) {
        var game = context.game;
        var actor = context.actor;
        var self = game[actor];
        if (!self || !hasSkill(self, 'zaiqi')) return null;
        var lost = Math.max(0, (self.maxHp || 0) - self.hp);
        if (lost <= 0) return null; // "若你已受伤"
        var pref = (self.skillPreferences && self.skillPreferences.zaiqi)
          || (actor === 'player' ? 'ask' : 'auto');
        if (pref === 'decline') {
          log(game, actorName(game, actor) + '选择不发动【再起】。');
          return null;
        }
        if (pref === 'ask') {
          if (!game.pauseState) game.pauseState = {};
          game.pauseState.zaiqiAsk = { actor: actor, drawCount: context.drawCount, x: lost };
          setPendingChoice(game, { kind: 'zaiqi-ask', actor: actor, x: lost,
            drawCount: context.drawCount });
          log(game, '等待' + actorName(game, actor) + '决定是否发动【再起】。');
          return { suspendedForZaiqi: true };
        }
        // AI: 亮 X 张里期望约 1/4 是红桃 — 已损体力 >= 2 时发动 (期望回血 >= 0.5
        // 且额外得牌 X-红桃数 >= 摸两张的一半), 否则照常摸牌。
        if (lost < 2) return null;
        context.drawCount = 0;
        applyZaiqi(game, actor, lost);
        return { zaiqiApplied: true };
      }

      function applyZaiqi(game, actor, x) {
        var self = game[actor];
        if (!self) return null;
        var revealed = [];
        for (var i = 0; i < x; i += 1) {
          if (deps.reshuffleIfNeeded) deps.reshuffleIfNeeded(game);
          if (!game.deck.length) break;
          var card = takeCard(game, null, { zone: 'deck' });
          if (!card) break;
          revealed.push(card);
        }
        var hearts = revealed.filter(function (card) { return card.suit === 'heart'; });
        var rest = revealed.filter(function (card) { return card.suit !== 'heart'; });
        log(game, actorName(game, actor) + '发动【再起】，放弃摸牌并亮出牌堆顶 '
          + revealed.length + ' 张牌（红桃 ' + hearts.length + ' 张）。');
        hearts.forEach(function (card) { discardCard(game, card); });
        rest.forEach(function (card) { putCard(game, card, { zone: 'hand', actor: actor }); });
        if (hearts.length > 0) {
          self.hp = Math.min(self.maxHp, self.hp + hearts.length);
          log(game, actorName(game, actor) + '回复 ' + hearts.length + ' 点体力（现为 ' + self.hp + '）。');
        }
        if (rest.length > 0) {
          log(game, actorName(game, actor) + '获得其余 ' + rest.length + ' 张牌。');
        }
        return { zaiqiApplied: true, hearts: hearts.length, gained: rest.length };
      }

      // ═════ v15 U (林包): 祝融 烈刃 ═════
      // 官方逐字 (card__hero__shu.md:456): "每当你使用【杀】对目标角色造成伤害后，
      // 你可以与其拼点，当你赢后，你获得其一张牌。"
      //
      // **口径更正 (对 v15 T 执行记录的勘误)**: T 阶段的拼点框架注释写的是
      // "为林包【烈刃】'获得其拼点牌'预留认领面"。逐字复核官方文本后确认那句
      // 转述有误 —— 烈刃赢后获得的是"**其一张牌**"(目标区域里的一张牌),
      // 不是拼点牌。T 阶段做的"效果在前、弃置在后 + 挂起留账"仍然正确且必要
      // (效果窗口期间拼点牌不得提前入弃牌堆), 只是它服务的不是烈刃的认领面。
      // 拼点牌照常在效果结算后入弃牌堆。
      function triggerLierenShaDamageDealt(context) {
        var game = context.game;
        var actor = context.actor;
        var targetActor = context.targetActor;
        var self = game[actor];
        var target = game[targetActor];
        if (!self || !target || actor === targetActor) return null;
        if (!hasSkill(self, 'lieren') || game.phase === 'gameover') return null;
        if (target.hp <= 0) return null;
        var pref = (self.skillPreferences && self.skillPreferences.lieren)
          || (actor === 'player' ? 'auto' : 'auto');
        if (pref === 'decline') {
          log(game, actorName(game, actor) + '选择不发动【烈刃】。');
          return null;
        }
        if (!pindianEligible || !pindianEligible(game, actor, targetActor)) return null;
        // 拼点框架有单槽重入守卫 (v15 T 评审收口) —— 已有拼点在进行中时
        // startPindian 会拒绝, 此处不重复判断, 直接把结果透传。
        return startPindian(game, actor, targetActor, {
          key: 'lieren',
          reason: '【烈刃】拼点',
          ctx: {}
        });
      }

      // ═════ v15 U (林包): 董卓 暴虐 ═════
      // 官方逐字 (card__hero__neutral.md:185): "主公技，每当其他角色造成伤害后，
      // 若其于受到此伤害的角色因受到此伤害而扣减体力前为群势力角色，来源可以
      // 判定，若结果为黑桃，你回复1点体力。"
      //
      // 三个角色别弄混: **来源**造成伤害并进行判定, 条件看**受伤者**在扣血前
      // 的势力 (须为群), 回复体力的是**董卓**(主公)。"其他角色"= 来源不是董卓。
      function triggerBaonueDamageAfter(context) {
        var game = context.game;
        var sourceActor = context.sourceActor;
        var targetActor = context.targetActor;
        if (!sourceActor || !game[sourceActor] || game.phase === 'gameover') return null;
        if (context.amount <= 0) return null;
        var roles = game.roles || {};
        var lord = StateRuntime.aliveSeats(game).find(function (seat) {
          return roles[seat] === '主公' && hasSkill(game[seat], 'baonue');
        });
        if (!lord) return null;
        if (sourceActor === lord) return null; // "每当**其他**角色造成伤害后"
        // 条件读的是**受伤者**的势力。伤害已结算完毕, 但势力是静态属性
        // (本仓无变更势力的技能), 扣血前后同值 —— 逐字条款在此等价, 记档。
        var victim = game[targetActor];
        if (!victim || victim.camp !== '群') return null;
        var source = game[sourceActor];
        var pref = source.skillPreferences && source.skillPreferences.baonue;
        if (pref === 'decline') return null; // "来源**可以**判定"
        var result = judge(game, sourceActor, '【暴虐】');
        if (!result) return null;
        resolveJudgementCard(game, sourceActor, source, '【暴虐】', result);
        if (result.suit === 'spade') {
          var lordState = game[lord];
          if (lordState.hp < lordState.maxHp) {
            lordState.hp += 1;
            log(game, '【暴虐】判定为黑桃，' + actorName(game, lord) + '回复 1 点体力（现为 ' + lordState.hp + '）。');
          } else {
            log(game, '【暴虐】判定为黑桃，但' + actorName(game, lord) + '体力已满。');
          }
        }
        return { baonueApplied: true };
      }

      // ═════ v15 U (林包): 贾诩 乱武 ═════
      // 官方逐字 (card__hero__neutral.md:199): "限定技，出牌阶段，你可以选择
      // 所有其他角色，这些角色各需对距离最小的另一名角色使用【杀】，否则失去
      // 1点体力。"
      //
      // 口径四点:
      //  ① 限定技 → flags.luanwuUsed 永不复位 (涅槃 niepanUsed 先例);
      //  ② "距离最小的**另一名**角色" —— 距离以**该角色自己**为原点算, 不是
      //     以贾诩; 且排除其自身。并列最小时由该角色选 (官方"选择"归属行动者);
      //  ③ 是"**使用**【杀】"而非"打出" —— 走 playSha 使用流程 (借刀先例),
      //     且目标由距离决定而非攻击范围 → 传 ignoreDistance 绕开射程闸;
      //  ④ 逐席推进要能挂起 (玩家席需开窗选牌与目标), 用 pauseState.luanwu
      //     链 (与 aoe/shaChain/duelChain 同款)。
      function triggerLuanwuActiveSkill(context) {
        if (context.skillId !== 'luanwu') return null;
        var game = context.game;
        var actor = context.actor;
        var self = context.state;
        if (!self || !hasSkill(self, 'luanwu')) return null;
        if (self.flags.luanwuUsed) return fail('【乱武】是限定技，每局限一次。');
        var order = StateRuntime.seatsFrom(game, actor, false).filter(function (seat) {
          return game[seat] && game[seat].hp > 0;
        });
        if (!order.length) return fail('【乱武】没有其他角色可选。');
        self.flags.luanwuUsed = true;
        log(game, actorName(game, actor) + '发动限定技【乱武】，所有其他角色需对距离最小的另一名角色使用【杀】。');
        if (!game.pauseState) game.pauseState = {};
        game.pauseState.luanwu = { actor: actor, order: order, idx: 0 };
        return advanceLuanwu(game);
      }

      // 该角色的"距离最小的另一名角色"候选 (可能并列)。
      function luanwuNearestTargets(game, seat) {
        var others = StateRuntime.aliveSeats(game).filter(function (other) { return other !== seat; });
        if (!others.length) return [];
        var min = others.reduce(function (acc, other) {
          return Math.min(acc, StateRuntime.distanceBetween(game, seat, other));
        }, Infinity);
        return others.filter(function (other) {
          return StateRuntime.distanceBetween(game, seat, other) === min;
        });
      }

      function advanceLuanwu(game) {
        var chain = game.pauseState && game.pauseState.luanwu;
        if (!chain) return success('乱武结算完成。');
        while (chain.idx < chain.order.length) {
          if (game.phase === 'gameover') { game.pauseState.luanwu = null; return success('游戏结束。'); }
          var seat = chain.order[chain.idx];
          var state = game[seat];
          if (!state || state.hp <= 0) { chain.idx += 1; continue; }
          var targets = luanwuNearestTargets(game, seat);
          if (!targets.length) { chain.idx += 1; continue; }
          if (seat === 'player') {
            // 玩家席开窗: 选一张可用的【杀】与一名距离最小的目标, 或放弃 (失 1 体力)。
            var shaOptions = (state.hand || []).filter(function (card) {
              return isShaType(card.type);
            }).map(function (card) {
              return { cardId: card.id, name: card.name, suit: card.suit, rank: card.rank };
            });
            setPendingChoice(game, {
              kind: 'luanwu-sha',
              actor: seat,
              options: shaOptions,
              targets: targets.map(function (t) {
                return { seat: t, name: game[t].name, hp: game[t].hp };
              })
            });
            log(game, '等待' + actorName(game, seat) + '决定【乱武】的响应。');
            return success('等待【乱武】响应。');
          }
          applyLuanwuForSeat(game, seat, null, null);
          chain.idx += 1;
          if (game.pendingChoice) return success('【乱武】等待结算…');
        }
        game.pauseState.luanwu = null;
        return success('乱武结算完成。');
      }

      // 单座席的乱武结算: 能用杀就用 (目标限距离最小者), 否则失去 1 点体力。
      function applyLuanwuForSeat(game, seat, cardId, targetSeat) {
        var state = game[seat];
        if (!state) return null;
        var targets = luanwuNearestTargets(game, seat);
        var target = targetSeat && targets.indexOf(targetSeat) >= 0 ? targetSeat : null;
        if (!target) {
          // 缺省: 感知敌对优先 (只读公开信息)。
          target = StateRuntime.perceivedHostileFirstPool(game, seat, targets)[0] || targets[0];
        }
        var shaCard = null;
        if (cardId) {
          shaCard = (state.hand || []).find(function (card) { return card.id === cardId && isShaType(card.type); });
          if (shaCard) shaCard = removeCardFromHand(state, cardId);
        } else {
          shaCard = removeFirstCardOfType(state, 'sha')
            || removeFirstCardOfType(state, 'fire_sha')
            || removeFirstCardOfType(state, 'thunder_sha');
        }
        if (shaCard && target) {
          log(game, actorName(game, seat) + '被【乱武】驱使，对' + actorName(game, target)
            + '使用【' + shaCard.name + '】。');
          // 评审收口: 原先传了 ignoreDistance —— **无官方依据**。
          // flow__condition.md:99 列举"对使用牌的距离合法性能产生影响的技能",
          // 乱武不在其中; 而 :107 的判例更是明说 "A 受到【同疾】的影响不能
          // 对马岱使用【杀】, **必须执行失去1点体力的效果**" —— 用不出去就
          // 掉血, 而不是绕开合法性硬用。故按普通使用流程走。
          var result = deps.playSha(game, seat, shaCard, { target: target, skipShaCount: true });
          if (result && result.ok) return result;
          // 使用被拒 (距离/目标保护等) → 退牌并按"否则"失去 1 点体力。
          putCard(game, shaCard, { zone: 'hand', actor: seat });
          log(game, '【乱武】：' + actorName(game, seat) + '的【杀】不合法，改为失去 1 点体力。');
        } else if (shaCard) {
          // 评审收口 [牌守恒红线]: 摸到了杀但没有合法目标 —— 此前直接落到
          // 掉血分支, 那张已离手的杀**凭空消失**。必须退回手牌。
          putCard(game, shaCard, { zone: 'hand', actor: seat });
        }
        state.hp -= 1;
        log(game, actorName(game, seat) + '未对距离最小的角色使用【杀】，因【乱武】失去 1 点体力。');
        if (state.hp <= 0) enterDying(game, seat);
        return { luanwuLostHp: true };
      }

      // 乱武玩家席 resolver — { cardId, target } 使用杀 / { decline } 失 1 体力。
      function resolveLuanwuShaChoice(game, pending, decision) {
        var seat = pending.actor;
        var d = decision || {};
        var chain = game.pauseState && game.pauseState.luanwu;
        if (d.decline || d.skip || !d.cardId) {
          applyLuanwuForSeat(game, seat, null, StateRuntime.resolveSeatOption(game, d.target));
        } else {
          var legalTargets = (pending.targets || []).map(function (t) { return t.seat; });
          var target = StateRuntime.resolveSeatOption(game, d.target);
          if (target && legalTargets.indexOf(target) < 0) {
            setPendingChoice(game, pending);
            return fail('【乱武】只能对距离最小的角色使用【杀】。');
          }
          applyLuanwuForSeat(game, seat, d.cardId, target || legalTargets[0]);
        }
        if (chain) chain.idx += 1;
        if (game.pendingChoice) return success('【乱武】等待结算…');
        return advanceLuanwu(game);
      }

      // ═════ v15 V (山包): 觉醒技共用骨架 ═════
      // 4 个觉醒技 (凿险/志继/若愚/魂姿) 形状完全一致:
      //   准备阶段开始时 → 若<条件> → <代价/收益> → 获得<新技能>。
      // 觉醒技是**一次性**的 (flags.<id>Awakened 永不复位, 与限定技同款),
      // 且是**锁定**的 —— 条件满足就必须觉醒, 没有"不发动"这条出路。
      function runAwakening(game, actor, spec) {
        var state = game[actor];
        if (!state || !hasSkill(state, spec.skillId)) return null;
        state.flags = state.flags || {};
        var flag = spec.skillId + 'Awakened';
        if (state.flags[flag]) return null;
        if (!spec.condition(game, actor, state)) return null;
        state.flags[flag] = true;
        var applied = spec.apply(game, actor, state);
        if (applied && applied.suspended) return applied;
        (spec.grants || []).forEach(function (grant) {
          if (StateRuntime.grantSkill(state, grant.id, grant.name, SKILL_METADATA[grant.id])) {
            log(game, actorName(game, actor) + '因【' + spec.label + '】觉醒，获得【' + grant.name + '】。');
          }
        });
        return { awakened: spec.skillId };
      }

      // 减体力上限的共用出口 (凿险/志继/魂姿 三技共用; 崩坏另有自己的路径)。
      // 官方: 体力值不得大于体力上限 → 上限降到当前体力之下时体力随之下降。
      function reduceMaxHp(game, actor, amount) {
        var state = game[actor];
        if (!state) return;
        state.maxHp = Math.max(0, (state.maxHp || 0) - amount);
        if (state.hp > state.maxHp) state.hp = state.maxHp;
        log(game, actorName(game, actor) + '减 ' + amount + ' 点体力上限（现为 ' + state.maxHp + '）。');
        if (state.hp <= 0) enterDying(game, actor);
      }

      // ── 邓艾 屯田 / 凿险 ──
      // 屯田 (wei.md:365): "每当你于回合外失去牌后，你可以判定，当非红桃的
      // 判定牌生效后，你将之置于武将牌上，称为"田"；你与其他角色的距离-X
      // (X为"田"数)。"
      function triggerTuntianHandLoss(context) {
        var game = context.game;
        var actor = context.actor;
        var state = game[actor];
        if (!state || !hasSkill(state, 'tuntian') || game.phase === 'gameover') return null;
        if (game.turn === actor) return null; // "于**回合外**失去牌后"
        var pref = (state.skillPreferences && state.skillPreferences.tuntian) || 'auto';
        if (pref === 'decline') return null;
        var result = judge(game, actor, '【屯田】');
        if (!result) return null;
        if (result.suit === 'heart') {
          // 红桃 → 不置"田", 判定牌照常入弃牌堆 (走 claimed 通道的默认分支)。
          resolveJudgementCard(game, actor, state, '【屯田】', result);
          return { tuntianMissed: true };
        }
        // 非红桃 → 置于武将牌上称为"田"。经 claimed 通道认领 (天妒同一单点)。
        state.flags = state.flags || {};
        state.flags.tuntianClaimPending = true;
        resolveJudgementCard(game, actor, state, '【屯田】', result);
        state.flags.tuntianClaimPending = false;
        return { tuntianPlaced: true };
      }

      function triggerTuntianClaim(context) {
        var game = context.game;
        var actor = context.actor;
        var state = context.state;
        var physicalCard = physicalCardOf(context.card);
        if (!state || !physicalCard || !hasSkill(state, 'tuntian')) return null;
        if (!state.flags || !state.flags.tuntianClaimPending) return null;
        if (context.claimed) return null;
        if (!state.tian) state.tian = [];
        putCard(game, physicalCard, { zone: 'tian', actor: actor });
        context.claimed = true;
        log(game, actorName(game, actor) + '发动【屯田】，将【' + physicalCard.name
          + '】置于武将牌上称为"田"（共 ' + state.tian.length + ' 张）。');
        return { claimedJudgementCard: true };
      }

      // 凿险 (wei.md:367): "觉醒技，准备阶段开始时，若"田"数不小于3，你减1点
      // 体力上限，然后获得"急袭"（你可以将一张"田"当【顺手牵羊】使用）。"
      function triggerZaoxianPrepare(context) {
        return runAwakening(context.game, context.actor, {
          skillId: 'zaoxian',
          label: '凿险',
          condition: function (game, actor, state) { return (state.tian || []).length >= 3; },
          apply: function (game, actor) { reduceMaxHp(game, actor, 1); },
          grants: [{ id: 'jixi', name: '急袭' }]
        });
      }

      // 急袭 (凿险授予): "你可以将一张"田"当【顺手牵羊】使用"。
      function triggerJixiCardAs(context) {
        var state = context.state;
        if (!state || !hasSkill(state, 'jixi')) return null;
        if (context.mode !== 'proactive' || context.asType !== 'shunshou') return null;
        var card = context.card;
        if (!card || !(state.tian || []).some(function (item) { return item.id === card.id; })) return null;
        return { card: card, asName: '顺手牵羊', skillName: '急袭', priority: 10 };
      }

      // ── 姜维 挑衅 / 志继 ──
      // 挑衅 (shu.md:354): "出牌阶段限一次，你可以令攻击范围内含有你的一名
      // 角色选择是否对你使用【杀】，若其选择否，你弃置其一张牌。"
      function triggerTiaoxinActiveSkill(context) {
        if (context.skillId !== 'tiaoxin') return null;
        var game = context.game;
        var actor = context.actor;
        var self = context.state;
        if (!self || !hasSkill(self, 'tiaoxin')) return null;
        if (self.flags.tiaoxinUsed) return fail('【挑衅】每回合限一次。');
        // "**攻击范围内含有你**的一名角色" —— 以对方为原点算, 不是以姜维。
        var candidates = StateRuntime.aliveSeats(game).filter(function (seat) {
          return seat !== actor && StateRuntime.canReachWithSha(game, seat, actor);
        });
        var target = StateRuntime.resolveSeatOption(game, (context.options || {}).target);
        if (target && candidates.indexOf(target) < 0) return fail('该角色的攻击范围内没有你。');
        if (!target) {
          target = StateRuntime.perceivedHostileFirstPool(game, actor, candidates)[0];
        }
        if (!target) return fail('没有攻击范围内含有你的角色。');
        self.flags.tiaoxinUsed = true;
        log(game, actorName(game, actor) + '发动【挑衅】，令' + actorName(game, target)
          + '选择是否对其使用【杀】。');
        return resolveTiaoxinDemand(game, actor, target);
      }

      // 被挑衅者的抉择: 用杀 (走正常使用流程) 或不用 (被弃一张牌)。
      function resolveTiaoxinDemand(game, actor, target) {
        var targetState = game[target];
        if (!targetState) return success('挑衅结算完成。');
        if (target === 'player') {
          var shaOptions = (targetState.hand || []).filter(function (card) {
            return isShaType(card.type);
          }).map(function (card) {
            return { cardId: card.id, name: card.name, suit: card.suit, rank: card.rank };
          });
          setPendingChoice(game, {
            kind: 'tiaoxin-demand',
            actor: target,
            sourceActor: actor,
            options: shaOptions
          });
          log(game, '等待' + actorName(game, target) + '决定是否对' + actorName(game, actor) + '使用【杀】。');
          return success('等待【挑衅】响应。');
        }
        // AI 席: 手上有杀就打 (对姜维用杀通常优于白丢一张牌)。
        var shaCard = removeFirstCardOfType(targetState, 'sha')
          || removeFirstCardOfType(targetState, 'fire_sha')
          || removeFirstCardOfType(targetState, 'thunder_sha');
        if (shaCard) {
          var result = deps.playSha(game, target, shaCard, { target: actor, skipShaCount: true });
          if (result && result.ok) return result;
          putCard(game, shaCard, { zone: 'hand', actor: target });
        }
        return applyTiaoxinDiscard(game, actor, target);
      }

      function applyTiaoxinDiscard(game, actor, target) {
        var removed = removeTargetZoneCard(game, target, null, null);
        if (removed && removed.card) {
          discardCard(game, removed.card);
          log(game, actorName(game, target) + '选择不使用【杀】，' + actorName(game, actor)
            + '弃置其一张' + removed.zone + '牌。');
        } else {
          log(game, actorName(game, target) + '选择不使用【杀】，但其没有牌可弃。');
        }
        return success('挑衅结算完成。');
      }

      function resolveTiaoxinDemandChoice(game, pending, decision) {
        var target = pending.actor;
        var actor = pending.sourceActor;
        var d = decision || {};
        if (d.cardId) {
          var state = game[target];
          var card = (state.hand || []).find(function (item) {
            return item.id === d.cardId && isShaType(item.type);
          });
          if (!card) {
            setPendingChoice(game, pending);
            return fail('请选择一张【杀】，或放弃 (将被弃置一张牌)。');
          }
          var shaCard = removeCardFromHand(state, d.cardId);
          var result = deps.playSha(game, target, shaCard, { target: actor, skipShaCount: true });
          if (result && result.ok) return result;
          putCard(game, shaCard, { zone: 'hand', actor: target });
        }
        return applyTiaoxinDiscard(game, actor, target);
      }

      // 志继 (shu.md:356): "觉醒技，准备阶段开始时，若你没有手牌，你选择一项：
      // 1.回复1点体力；2.摸两张牌。然后你减1点体力上限，获得"观星"。"
      function triggerZhijiPrepare(context) {
        var game = context.game;
        var actor = context.actor;
        return runAwakening(game, actor, {
          skillId: 'zhiji',
          label: '志继',
          condition: function (g, a, state) { return (state.hand || []).length === 0; },
          apply: function (g, a, state) {
            // "选择一项" —— 玩家席开窗; AI 席按血线取值。
            if (a === 'player') {
              setPendingChoice(g, { kind: 'zhiji-choice', actor: a, hp: state.hp, maxHp: state.maxHp });
              log(g, '【志继】觉醒：等待' + actorName(g, a) + '选择回复体力或摸牌。');
              return { suspended: true };
            }
            applyZhijiOption(g, a, state.hp < state.maxHp ? 'heal' : 'draw');
            return null;
          },
          grants: [{ id: 'guanxing', name: '观星' }]
        });
      }

      function applyZhijiOption(game, actor, option) {
        var state = game[actor];
        if (option === 'heal') {
          state.hp = Math.min(state.maxHp, state.hp + 1);
          log(game, actorName(game, actor) + '因【志继】回复 1 点体力（现为 ' + state.hp + '）。');
        } else {
          drawCards(game, actor, 2);
        }
        reduceMaxHp(game, actor, 1);
      }

      function resolveZhijiChoice(game, pending, decision) {
        var actor = pending.actor;
        applyZhijiOption(game, actor, (decision && decision.option === 'draw') ? 'draw' : 'heal');
        var state = game[actor];
        if (StateRuntime.grantSkill(state, 'guanxing', '观星', SKILL_METADATA.guanxing)) {
          log(game, actorName(game, actor) + '因【志继】觉醒，获得【观星】。');
        }
        return success('志继结算完成。');
      }

      // ── 刘禅 享乐 / 放权 / 若愚 ──
      // 享乐 (shu.md:380): "锁定技，每当你成为其他角色使用【杀】的目标时，你令
      // 其选择是否弃置一张基本牌，若其选择否或其已死亡，此次对你结算的此【杀】
      // 对你无效。"
      function triggerXiangleShaEffectiveness(context) {
        var game = context.game;
        var targetActor = context.targetActor;
        var sourceActor = context.sourceActor;
        var target = game[targetActor];
        var source = game[sourceActor];
        if (!target || !hasSkill(target, 'xiangle')) return null;
        if (sourceActor === targetActor) return null; // "其他角色使用的【杀】"
        if (!source || source.hp <= 0) return { cancelSha: true }; // "其已死亡"
        var basics = (source.hand || []).filter(function (card) { return card.family === 'basic'; });
        if (!basics.length) {
          log(game, actorName(game, sourceActor) + '没有基本牌可弃，【享乐】令此【杀】对'
            + actorName(game, targetActor) + '无效。');
          return { cancelSha: true };
        }
        var pref = (source.skillPreferences && source.skillPreferences.xiangleCost)
          || (sourceActor === 'player' ? 'ask' : 'auto');
        if (pref === 'decline') {
          log(game, actorName(game, sourceActor) + '选择不弃置基本牌，【享乐】令此【杀】无效。');
          return { cancelSha: true };
        }
        if (pref === 'ask') {
          // "令其选择是否弃置一张基本牌" —— 抉择权在**来源**, 玩家来源开窗。
          // 挂起信号自带 (不看 pendingChoice 槽位, v15 T H1 的教训)。
          requestPlayerResponse(game, {
            kind: 'xiangle-cost',
            actor: sourceActor,
            pauseKey: 'xiangleCost',
            source: {
              actor: sourceActor, targetActor: targetActor, card: context.card,
              amount: context.amount, responseLocked: !!context.responseLocked
            },
            options: basics.map(function (card) {
              return { cardId: card.id, name: card.name, suit: card.suit, rank: card.rank };
            }),
            meta: { targetActor: targetActor, shaName: context.card && context.card.name },
            logMessage: '【享乐】：等待' + actorName(game, sourceActor)
              + '决定是否弃置一张基本牌。',
            statusMessage: '等待【享乐】的弃牌决定。'
          });
          return { suspendedForXiangle: true };
        }
        // 缺省: 弃最不值钱的一张基本牌 (AI 弃牌估值单点)。
        var ranked = deps.aiDiscardCandidates ? (deps.aiDiscardCandidates(game, sourceActor) || []) : [];
        var pick = basics.slice().sort(function (a, b) {
          var ia = ranked.indexOf(a.id); var ib = ranked.indexOf(b.id);
          return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
        })[0];
        var removed = removeCardFromHand(source, pick.id);
        if (!removed) return { cancelSha: true };
        discardCard(game, removed);
        log(game, actorName(game, sourceActor) + '弃置一张基本牌【' + removed.name
          + '】以抵消【享乐】。');
        return null;
      }

      // 放权 (shu.md:382): "你可以跳过出牌阶段，若如此做，此回合结束时，你可以
      // 弃置一张手牌并选择一名其他角色，若如此做，其获得一个额外的回合。"
      function triggerFangquanBeforePlayPhase(context) {
        var game = context.game;
        var actor = context.actor;
        var state = game[actor];
        if (!state || !hasSkill(state, 'fangquan')) return null;
        var pref = (state.skillPreferences && state.skillPreferences.fangquan) || 'decline';
        if (pref === 'decline') return null;
        state.flags = state.flags || {};
        // skipPlay 是引擎既有的跳过出牌阶段单点 (nextPlayablePhase 读它);
        // fangquanSkipped 只是"本回合确实跳过了"的凭据, 供回合结束时机核对。
        state.flags.skipPlay = true;
        state.flags.fangquanSkipped = true;
        log(game, actorName(game, actor) + '发动【放权】，跳过出牌阶段。');
        return { fangquanSkipPlay: true };
      }

      function triggerFangquanTurnEnd(context) {
        var game = context.game;
        var actor = context.actor;
        var state = game[actor];
        if (!state || !hasSkill(state, 'fangquan') || game.phase === 'gameover') return null;
        if (!state.flags || !state.flags.fangquanSkipped) return null;
        state.flags.fangquanSkipped = false;
        if (!(state.hand || []).length) return null;
        var others = StateRuntime.aliveSeats(game).filter(function (seat) { return seat !== actor; });
        if (!others.length) return null;
        if (actor === 'player') {
          setPendingChoice(game, {
            kind: 'fangquan-grant',
            actor: actor,
            candidates: others.map(function (seat) {
              return { seat: seat, name: game[seat].name, hp: game[seat].hp };
            }),
            cards: (state.hand || []).map(function (card) {
              return { cardId: card.id, name: card.name, suit: card.suit, rank: card.rank };
            })
          });
          log(game, '等待' + actorName(game, actor) + '决定是否发动【放权】的额外回合。');
          return { suspendedForFangquan: true };
        }
        // AI: 送额外回合给感知友方 (给敌人等于资敌)。
        var ally = others.find(function (seat) {
          return !StateRuntime.perceivedHostile(game, actor, seat);
        });
        if (!ally) return null;
        return applyFangquan(game, actor, ally, null);
      }

      function applyFangquan(game, actor, targetSeat, cardId) {
        var state = game[actor];
        var hand = state.hand || [];
        if (!hand.length || !game[targetSeat]) return null;
        var pickId = cardId && hand.some(function (c) { return c.id === cardId; })
          ? cardId : hand[0].id;
        var removed = removeCardFromHand(state, pickId);
        if (removed) discardCard(game, removed);
        game.pendingExtraTurns = game.pendingExtraTurns || [];
        game.pendingExtraTurns.push(targetSeat);
        log(game, actorName(game, actor) + '发动【放权】，弃置一张手牌，令'
          + actorName(game, targetSeat) + '获得一个额外的回合。');
        return { fangquanGranted: targetSeat };
      }

      function resolveFangquanGrantChoice(game, pending, decision) {
        var d = decision || {};
        if (d.decline || d.skip || !d.target) {
          log(game, actorName(game, pending.actor) + '选择不发动【放权】的额外回合。');
          return success('放权结算完成。');
        }
        var legal = (pending.candidates || []).map(function (entry) { return entry.seat; });
        var seat = StateRuntime.resolveSeatOption(game, d.target);
        if (!seat || legal.indexOf(seat) < 0) {
          setPendingChoice(game, pending);
          return fail('请选择一名其他角色获得额外回合，或 decline 放弃。');
        }
        applyFangquan(game, pending.actor, seat, d.cardId);
        return success('放权结算完成。');
      }

      // 若愚 (shu.md:384): "主公技，觉醒技，准备阶段开始时，若你是体力值最小的
      // 角色，你加1点体力上限，然后回复1点体力，获得"激将"。"
      function triggerRuoyuPrepare(context) {
        var game = context.game;
        var actor = context.actor;
        if (!game.roles || game.roles[actor] !== '主公') return null; // 主公技
        return runAwakening(game, actor, {
          skillId: 'ruoyu',
          label: '若愚',
          condition: function (g, a, state) {
            var minHp = StateRuntime.aliveSeats(g).reduce(function (acc, seat) {
              return Math.min(acc, g[seat].hp);
            }, Infinity);
            return state.hp <= minHp;
          },
          apply: function (g, a, state) {
            state.maxHp += 1;
            state.hp = Math.min(state.maxHp, state.hp + 1);
            log(g, actorName(g, a) + '因【若愚】加 1 点体力上限并回复 1 点体力（现为 '
              + state.hp + ' / ' + state.maxHp + '）。');
          },
          grants: [{ id: 'jijiang', name: '激将' }]
        });
      }

      // ── 孙策 激昂 / 魂姿 / 制霸 ──
      // 激昂 (wu.md:297): "每当你使用【决斗】或红色【杀】指定目标后，或成为一张
      // 【决斗】或红色【杀】的目标后，你可以摸一张牌。"
      function jiangQualifies(card) {
        if (!card) return false;
        if (card.type === 'juedou') return true;
        return isShaType(card.type) && card.color === 'red';
      }

      function triggerJiangShaTargeted(context) {
        var game = context.game;
        if (!jiangQualifies(context.card)) return null;
        // "指定目标后"每张牌对每名目标只结算一次。流离链会让本时机重跑, 且
        // 转移可能绕回已过时机的座席 → 按调用方给的链内已见座席去重
        // (不往牌对象上挂标记, 那会永久残留并静默吞掉这张牌的下一次激昂)。
        if ((context.previousTargets || []).indexOf(context.targetActor) >= 0) return null;
        [context.sourceActor, context.targetActor].forEach(function (seat) {
          var state = game[seat];
          if (!state || state.hp <= 0 || !hasSkill(state, 'jiang')) return;
          var pref = (state.skillPreferences && state.skillPreferences.jiang) || 'auto';
          if (pref === 'decline') return;
          drawCards(game, seat, 1);
          log(game, actorName(game, seat) + '发动【激昂】，摸一张牌。');
        });
        return null;
      }

      // 决斗分支: 走 onTrickTargeted ("指定目标后", flow__use.md step 5)。
      // 与 onShaTargeted 分工互斥 —— 那边只放红【杀】过, 这边只放【决斗】过,
      // 不会双触发。
      function triggerJiangTrickTargeted(context) {
        var game = context.game;
        var card = context.card;
        if (!card || card.type !== 'juedou') return null;
        [context.sourceActor, context.targetActor].forEach(function (seat) {
          var state = game[seat];
          if (!state || state.hp <= 0 || !hasSkill(state, 'jiang')) return;
          var pref = (state.skillPreferences && state.skillPreferences.jiang) || 'auto';
          if (pref === 'decline') return;
          drawCards(game, seat, 1);
          log(game, actorName(game, seat) + '发动【激昂】，摸一张牌。');
        });
        return null;
      }

      // 魂姿 (wu.md:299): "觉醒技，准备阶段开始时，若你的体力值为1，你减1点体力
      // 上限，然后获得"英姿"和"英魂"。"
      function triggerHunziPrepare(context) {
        return runAwakening(context.game, context.actor, {
          skillId: 'hunzi',
          label: '魂姿',
          condition: function (g, a, state) { return state.hp === 1; },
          apply: function (g, a) { reduceMaxHp(g, a, 1); },
          grants: [{ id: 'yingzi', name: '英姿' }, { id: 'yinghun', name: '英魂' }]
        });
      }

      // 制霸 (wu.md:301): "主公技，其他吴势力角色的出牌阶段限一次，其可以与你
      // 拼点（若你发动过"魂姿"，你可以拒绝此拼点），当其没赢后，你可以获得两张
      // 拼点的牌。"
      function triggerZhibaActiveSkill(context) {
        if (context.skillId !== 'zhiba') return null;
        var game = context.game;
        var actor = context.actor;   // 发起者 = 其他吴势力角色
        var self = context.state;
        var roles = game.roles || {};
        var lord = StateRuntime.aliveSeats(game).find(function (seat) {
          return roles[seat] === '主公' && hasSkill(game[seat], 'zhiba');
        });
        if (!lord) return fail('场上没有拥有【制霸】的主公。');
        if (lord === actor) return fail('【制霸】由其他吴势力角色发起。');
        if (self.camp !== '吴') return fail('【制霸】只有吴势力角色可以发起。');
        if (self.flags.zhibaUsed) return fail('【制霸】每回合限一次。');
        if (!pindianEligible || !pindianEligible(game, actor, lord)) {
          return fail('拼点需要双方各有至少一张手牌。');
        }
        // 官方判例 (card__hero__wu.md:305): "吴势力角色发动【制霸】与你拼点
        // **被拒绝**计入其出牌阶段限制的发动次数。" → 次数在拒绝分支之前记。
        self.flags.zhibaUsed = true;
        // "若你发动过'魂姿'，你可以拒绝此拼点"
        var lordState = game[lord];
        if (lordState.flags && lordState.flags.hunziAwakened) {
          var lordPref = lordState.skillPreferences && lordState.skillPreferences.zhiba;
          if (lordPref === 'decline') {
            log(game, actorName(game, lord) + '发动过【魂姿】，拒绝【制霸】拼点。');
            return success('制霸拼点被拒绝。');
          }
        }
        return startPindian(game, actor, lord, {
          key: 'zhiba', reason: '【制霸】拼点', ctx: { lord: lord }
        });
      }

      // 制霸的拼点收尾: "当其没赢后，你可以获得两张拼点的牌"。
      // won 是**发起者** (吴势力角色) 视角 → 没赢 = !outcome.won, 收牌的是主公。
      // 拼点牌此刻在处理区挂账 (pauseState.pindianCards), putCard 走掉即视为
      // 认领, flushPindianCards 会跳过 —— 与烈刃同一通道。
      function settleZhibaPindian(game, outcome) {
        var lord = (outcome.ctx && outcome.ctx.lord) || outcome.target;
        var lordState = game[lord];
        if (outcome.won) return success('制霸：拼点发起者赢，主公不获得拼点牌。');
        if (!lordState || lordState.hp <= 0) return success('制霸：主公已阵亡。');
        var pref = (lordState.skillPreferences && lordState.skillPreferences.zhibaClaim) || 'auto';
        if (pref === 'decline') {
          log(game, actorName(game, lord) + '选择不获得【制霸】的拼点牌。');
          return success('制霸结算完成。');
        }
        [outcome.actorCard, outcome.targetCard].forEach(function (card) {
          if (card) putCard(game, card, { zone: 'hand', actor: lord });
        });
        log(game, actorName(game, lord) + '发动【制霸】，获得两张拼点的牌。');
        return success('制霸结算完成。');
      }
      registerPindianContinuation('zhiba', settleZhibaPindian);

      // ── 张昭张纮 直谏 / 固政 ──
      // 直谏 (wu.md:469): "出牌阶段，你可以将手牌区里的一张装备牌置入一名其他
      // 角色的装备区，摸一张牌。"
      function triggerZhijianActiveSkill(context) {
        if (context.skillId !== 'zhijian') return null;
        var game = context.game;
        var actor = context.actor;
        var self = context.state;
        if (!self || !hasSkill(self, 'zhijian')) return null;
        var cardIds = context.cardIds || [];
        var card = cardIds.length
          ? (self.hand || []).find(function (item) { return item.id === cardIds[0]; })
          : (self.hand || []).find(function (item) { return item.family === 'equipment'; });
        if (!card || card.family !== 'equipment') return fail('【直谏】需要一张手牌区里的装备牌。');
        var target = StateRuntime.resolveSeatOption(game, (context.options || {}).target);
        if (!target) {
          target = StateRuntime.aliveSeats(game).find(function (seat) {
            return seat !== actor && !StateRuntime.perceivedHostile(game, actor, seat);
          }) || StateRuntime.aliveSeats(game).find(function (seat) { return seat !== actor; });
        }
        if (!target || target === actor) return fail('【直谏】须指定一名其他角色。');
        if (!game[target] || game[target].hp <= 0) return fail('目标已阵亡。');
        var removed = removeCardFromHand(self, card.id);
        if (!removed) return fail('找不到这张牌。');
        // 置入其装备区 (走装备出口, 顶替同槽位的旧装备照常入弃牌堆)。
        var equipped = deps.equipCard(game, target, removed);
        if (!equipped || !equipped.ok) {
          putCard(game, removed, { zone: 'hand', actor: actor });
          return fail('无法置入该角色的装备区。');
        }
        log(game, actorName(game, actor) + '发动【直谏】，将【' + removed.name + '】置入'
          + actorName(game, target) + '的装备区并摸一张牌。');
        drawCards(game, actor, 1);
        return success('直谏结算完成。');
      }

      // 固政 (wu.md:471): "其他角色的弃牌阶段结束时，你可以将弃牌堆里的一张其于
      // 此阶段内因其弃置而失去过的手牌交给该角色，若如此做，你可以获得弃牌堆里
      // 的所有于此阶段内因弃置而置入弃牌堆的牌。"
      function triggerGuzhengDiscardEnd(context) {
        var game = context.game;
        var discarder = context.actor;
        var discarded = context.discardedCards || [];
        if (!discarded.length || game.phase === 'gameover') return null;
        var holder = StateRuntime.aliveSeats(game).find(function (seat) {
          return seat !== discarder && hasSkill(game[seat], 'guzheng');
        });
        if (!holder) return null;
        var pref = (game[holder].skillPreferences && game[holder].skillPreferences.guzheng) || 'auto';
        if (pref === 'decline') return null;
        // 只认此刻仍在弃牌堆里的那批 (中途被别的技能拿走的不算)。
        var stillInDiscard = discarded.filter(function (card) {
          return game.discard.indexOf(card) >= 0;
        });
        if (!stillInDiscard.length) return null;
        // 归还一张给弃牌者, 其余全归固政持有者。
        var giveBack = stillInDiscard[0];
        moveCard(game, giveBack, { zone: 'discard' }, { zone: 'hand', actor: discarder });
        var gained = 0;
        stillInDiscard.slice(1).forEach(function (card) {
          if (game.discard.indexOf(card) < 0) return;
          moveCard(game, card, { zone: 'discard' }, { zone: 'hand', actor: holder });
          gained += 1;
        });
        log(game, actorName(game, holder) + '发动【固政】，将【' + giveBack.name + '】交还给'
          + actorName(game, discarder) + '，并获得其余 ' + gained + ' 张弃牌。');
        return { guzhengApplied: true };
      }

      // ── 蔡文姬 悲歌 / 断肠 ──
      // 悲歌 (neutral.md:391): "每当一名角色受到【杀】造成的伤害后，若其存活，
      // 你可以弃置一张牌，令其判定，若结果为：红桃，其回复1点体力；方块，其摸
      // 两张牌；梅花，来源弃置两张牌；黑桃，来源翻面。"
      function triggerBeigeDamageAfter(context) {
        var game = context.game;
        var victim = context.targetActor;
        var sourceActor = context.sourceActor;
        var card = context.sourceCard;
        if (!card || !isShaCard(card) || game.phase === 'gameover') return null;
        var victimState = game[victim];
        if (!victimState || victimState.hp <= 0) return null; // "若其存活"
        var holder = StateRuntime.aliveSeats(game).find(function (seat) {
          return hasSkill(game[seat], 'beige');
        });
        if (!holder) return null;
        var holderState = game[holder];
        var pref = (holderState.skillPreferences && holderState.skillPreferences.beige) || 'auto';
        if (pref === 'decline') return null;
        // 成本: 弃置一张牌 (手牌或装备区; 缺省取最不值钱的手牌)。
        if (!(holderState.hand || []).length) return null;
        var ranked = deps.aiDiscardCandidates ? (deps.aiDiscardCandidates(game, holder) || []) : [];
        var costId = ranked[0] || holderState.hand[0].id;
        var cost = removeCardFromHand(holderState, costId);
        if (!cost) return null;
        discardCard(game, cost);
        log(game, actorName(game, holder) + '发动【悲歌】，弃置【' + cost.name + '】。');
        var result = judge(game, victim, '【悲歌】');
        if (!result) return null;
        resolveJudgementCard(game, victim, victimState, '【悲歌】', result);
        applyBeigeOutcome(game, holder, victim, sourceActor, result.suit);
        return { beigeApplied: true };
      }

      function applyBeigeOutcome(game, holder, victim, sourceActor, suit) {
        var victimState = game[victim];
        var source = sourceActor ? game[sourceActor] : null;
        if (suit === 'heart') {
          victimState.hp = Math.min(victimState.maxHp, victimState.hp + 1);
          log(game, '【悲歌】判定为红桃，' + actorName(game, victim) + '回复 1 点体力。');
        } else if (suit === 'diamond') {
          drawCards(game, victim, 2);
          log(game, '【悲歌】判定为方片，' + actorName(game, victim) + '摸两张牌。');
        } else if (suit === 'club') {
          if (source && source.hp > 0) {
            var discarded = 0;
            for (var i = 0; i < 2; i += 1) {
              var removed = removeTargetZoneCard(game, sourceActor, null, null);
              if (!removed || !removed.card) break;
              discardCard(game, removed.card);
              discarded += 1;
            }
            log(game, '【悲歌】判定为梅花，' + actorName(game, sourceActor) + '弃置 ' + discarded + ' 张牌。');
          }
        } else if (suit === 'spade') {
          if (source && source.hp > 0) {
            source.turnedOver = !source.turnedOver;
            log(game, '【悲歌】判定为黑桃，' + actorName(game, sourceActor) + '的武将牌'
              + (source.turnedOver ? '翻面。' : '翻回正面。'));
          }
        }
      }

      // 断肠 (neutral.md:393): "锁定技，当你死亡时，你令杀死你的角色失去其所有
      // 技能。"
      function triggerDuanchangDeath(context) {
        var game = context.game;
        var deadActor = context.deadActor;
        var killer = context.killerActor;
        // W2 F5: 断肠的持有者就是死者本人 —— 只在轮到他那一席时结算。
        if (context.resolvingSeat && context.resolvingSeat !== deadActor) return null;
        var dead = game[deadActor];
        if (!dead || !hasSkill(dead, 'duanchang')) return null;
        if (!killer || killer === deadActor || !game[killer]) return null;
        var removed = StateRuntime.stripAllSkills(game[killer]);
        if (removed > 0) {
          log(game, actorName(game, deadActor) + '的【断肠】令' + actorName(game, killer)
            + '失去其所有技能（' + removed + ' 个）。');
        }
        return { duanchangApplied: true };
      }

      // ── 张郃 巧变 ──
      // 巧变 (wei.md:267): "你可以弃置一张手牌，跳过一个阶段（准备阶段和结束
      // 阶段除外），然后若你以此法：跳过摸牌阶段，你可以选择一至两名有手牌的
      // 其他角色，然后获得这些角色的各一张手牌；跳过出牌阶段，你可以将一名角色
      // 判定区/装备区里的一张牌置入另一名角色的判定区/装备区。"
      function triggerQiaobianDrawPhase(context) {
        var game = context.game;
        var actor = context.actor;
        var state = game[actor];
        if (!state || !hasSkill(state, 'qiaobian')) return null;
        if (!(state.hand || []).length) return null;
        var pref = (state.skillPreferences && state.skillPreferences.qiaobian) || 'decline';
        if (pref === 'decline') return null;
        // 成本: 弃置一张手牌
        var ranked = deps.aiDiscardCandidates ? (deps.aiDiscardCandidates(game, actor) || []) : [];
        var costId = ranked[0] || state.hand[0].id;
        var cost = removeCardFromHand(state, costId);
        if (!cost) return null;
        discardCard(game, cost);
        context.drawCount = 0; // 跳过摸牌阶段
        log(game, actorName(game, actor) + '发动【巧变】，弃置一张手牌跳过摸牌阶段。');
        // "选择一至两名有手牌的其他角色，获得这些角色的各一张手牌"
        var candidates = StateRuntime.aliveSeats(game).filter(function (seat) {
          return seat !== actor && (game[seat].hand || []).length > 0;
        });
        var picks = StateRuntime.perceivedHostileFirstPool(game, actor, candidates).slice(0, 2);
        picks.forEach(function (seat) {
          takeHandCard(game, seat, actor, '发动【巧变】，获得');
        });
        return { qiaobianApplied: true };
      }

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

      // ═════ v15 U (林包): 转化类技能 ═════
      // 酒池 (董卓, card__hero__neutral.md:175): "你可以将一张黑桃手牌当
      // 【酒】使用。" — 限黑桃、限手牌。【酒】不是锦囊, 走基本牌转化面。
      function triggerJiuchiCardAs(context) {
        var state = context.state;
        if (!state || !hasSkill(state, 'jiuchi')) return null;
        if (context.asType !== 'jiu') return null;
        if (!context.card || !isHandCardOf(state, context.card)) return null;
        // 花色按"实际花色"读 (红颜等改花色技能经 effectiveCardSuit 单点)。
        if (StateRuntime.effectiveCardSuit(state, context.card) !== 'spade') return null;
        return { card: context.card, asName: '酒', skillName: '酒池', priority: 10 };
      }

      // 断粮 (徐晃, card__hero__wei.md:277): "你可以将一张不为锦囊牌的黑色牌
      // 当【兵粮寸断】使用；你能对距离为2的角色使用【兵粮寸断】。"
      //
      // 逐字口径三点:
      //  ① "不为**锦囊牌**的黑色牌" —— 排除全部锦囊 (普通锦囊 family==='trick'
      //     与延时锦囊 family==='delayed' 都是锦囊牌, glossary__gamecard.md:41
      //     明写"延时类锦囊牌"), 即只剩 基本牌 与 装备牌。
      //  ② 措辞是"黑色**牌**"而非"黑色**手牌**" —— 对照火计的"红色手牌"
      //     (限手牌) 与武圣的"红色牌" (含装备区), 断粮属后者, **含装备区**。
      //  ③ "能对距离为 2 的角色使用"是把兵粮的距离上限从 1 **放宽到 2**,
      //     不是"无视距离" (缜略那类) —— 见 duanliangTrickRange。
      function triggerDuanliangCardAs(context) {
        var state = context.state;
        if (!state || !hasSkill(state, 'duanliang')) return null;
        if (context.mode !== 'proactive' || context.asType !== 'bingliang') return null;
        var card = context.card;
        if (!card) return null;
        // 含装备区 → 用"自己任一区域的牌"判据, 不用 isHandCardOf。
        if (!firstMatchingOwnCard(state, function (item) { return item.id === card.id; })) return null;
        if (card.family === 'trick' || card.family === 'delayed') return null;
        if (StateRuntime.effectiveCardColor(state, card) !== 'black') return null;
        return { card: card, asName: '兵粮寸断', skillName: '断粮', priority: 10 };
      }

      // ═════ v15 U (林包): 崩坏 (董卓) ═════
      // 官方逐字 (card__hero__neutral.md:183): "锁定技，结束阶段开始时，
      // 若你不是体力值最小的角色，你选择一项：1.失去1点体力；2.减1点体力上限。"
      // 锁定技 = 满足条件必须发动 (无 decline), 但"选择一项"仍是发动者的决策 →
      // 玩家席开窗, AI 席走启发。
      function triggerBenghuaiTurnEnd(context) {
        var game = context.game;
        var actor = context.actor;
        var state = game[actor];
        if (!state || !hasSkill(state, 'benghuai') || game.phase === 'gameover') return null;
        if (state.hp <= 0) return null;
        // "若你不是体力值最小的角色" — 与全场存活角色比 (含自己)。并列最小时
        // 自己**也是**最小之一 → 不发动。
        var alive = StateRuntime.aliveSeats(game);
        var minHp = alive.reduce(function (acc, seat) {
          return Math.min(acc, game[seat].hp);
        }, Infinity);
        if (state.hp <= minHp) return null;
        if (actor === 'player') {
          setPendingChoice(game, {
            kind: 'benghuai-choice',
            actor: actor,
            hp: state.hp,
            maxHp: state.maxHp
          });
          log(game, '【崩坏】锁定：等待' + actorName(game, actor) + '选择失去 1 点体力或减 1 点体力上限。');
          return { suspendedForBenghuai: true };
        }
        // AI 启发: 体力上限还够高 (> 4) 时优先减上限保住当前体力; 否则掉血 —
        // 只读自己的公开量。
        return applyBenghuai(game, actor, state.maxHp > 4 ? 'maxHp' : 'hp');
      }

      // 崩坏的效果体。choice: 'hp' 失去 1 点体力 / 'maxHp' 减 1 点体力上限。
      function applyBenghuai(game, actor, choice) {
        var state = game[actor];
        if (!state) return null;
        if (choice === 'maxHp') {
          state.maxHp = Math.max(0, (state.maxHp || 0) - 1);
          log(game, actorName(game, actor) + '发动【崩坏】，减 1 点体力上限（现为 ' + state.maxHp + '）。');
          // 官方: 体力值不能大于体力上限 — 上限降到当前体力之下时体力随之下降。
          if (state.hp > state.maxHp) {
            state.hp = state.maxHp;
            log(game, actorName(game, actor) + '的体力值随体力上限降至 ' + state.hp + '。');
          }
          // 体力上限归零 → 直接进入濒死 (无体力可失)。
          if (state.hp <= 0) enterDying(game, actor);
          return { benghuaiApplied: 'maxHp' };
        }
        state.hp -= 1;
        log(game, actorName(game, actor) + '发动【崩坏】，失去 1 点体力。');
        if (state.hp <= 0) enterDying(game, actor);
        return { benghuaiApplied: 'hp' };
      }

      // 崩坏 resolver — decision: { choice: 'hp' | 'maxHp' }。锁定技无放弃出路,
      // 缺省 (soak 决策表 {} 兜底) 按"失去 1 点体力"处理。
      function resolveBenghuaiChoice(game, pending, decision) {
        var choice = decision && decision.choice === 'maxHp' ? 'maxHp' : 'hp';
        applyBenghuai(game, pending.actor, choice);
        return success('崩坏结算完成。');
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
        // 成本: 指定了牌 → 弃武器牌 (手牌或装备区均可 — 官方只写"弃置
        // 一张武器牌", 未限定区域); 不指定 → 失去 1 点体力。
        var equippedWeapon = self.equipment && self.equipment.weapon;
        var costCard = null;
        var costFromEquipment = false;
        if (cardIds.length > 0) {
          if (equippedWeapon && cardIds[0] === equippedWeapon.id) {
            costCard = equippedWeapon;
            costFromEquipment = true;
          } else {
            costCard = (self.hand || []).find(function (item) {
              return item.id === cardIds[0] && item.family === 'equipment' && item.slot === 'weapon';
            }) || null;
          }
          if (!costCard) return fail('【强袭】的成本只能是一张武器牌。');
        }
        // 官方 glossary__card.md:41: "弃置武器牌…作为发动技能的消耗时，
        // 不能同时用到该武器牌提供的距离、攻击范围或技能" — 弃的是装备区
        // 那把武器时, 目标须落在**去掉该武器后**的攻击范围内 (缺省 1)。
        var effectiveRange = costFromEquipment ? 1 : StateRuntime.weaponRange(self);
        var inRange = function (seat) {
          return StateRuntime.distanceBetween(game, actor, seat) <= effectiveRange;
        };
        var targetActor = context.targetActor
          || StateRuntime.perceivedHostileSeats(game, actor).filter(inRange)[0];
        if (!targetActor || !game[targetActor]) return fail('请选择攻击范围内的一名角色。');
        // glossary__value.md:114 "所有其他角色都在 A 的攻击范围内" +
        // rule__classification.md:69 (存在"攻击范围内没有角色的角色") →
        // 攻击范围关系只定义在他人之间, 自己不在自己的攻击范围内。
        if (targetActor === actor) return fail('【强袭】不能选择自己。');
        if (game[targetActor].hp <= 0) return fail('目标已阵亡。');
        if (!inRange(targetActor)) {
          return fail(costFromEquipment
            ? '弃置该武器后目标已不在你的攻击范围内。' : '目标不在你的攻击范围内。');
        }
        var wantsWeaponCost = !!costCard;
        if (wantsWeaponCost) {
          if (costFromEquipment) {
            takeCard(game, costCard, { zone: 'equipment', actor: actor, slot: 'weapon' });
            discardCard(game, costCard);
            // 失去装备区的牌 → 照常结算失去时机 (枭姬等)。
            if (triggerEquipmentLoss) triggerEquipmentLoss(game, actor, costCard);
          } else {
            var removedWeapon = removeCardFromHand(self, costCard.id);
            if (removedWeapon) discardCard(game, removedWeapon);
          }
          log(game, actorName(game, actor) + '发动【强袭】，弃置武器【' + costCard.name + '】。');
        } else {
          self.hp -= 1;
          log(game, actorName(game, actor) + '发动【强袭】，失去 1 点体力。');
        }
        self.flags.qiangxiUsed = true;
        // 失去体力可能致自身濒死 → 濒死结算先跑 (loseHp 语义); 伤害在其后。
        if (!wantsWeaponCost && self.hp <= 0) {
          enterDying(game, actor);
          // 评审收口 [中]: 濒死结算挂起 (求桃窗口) 时不能就这么把伤害打
          // 出去 —— 官方是"先付成本 (含其引发的濒死结算), 再造成伤害"。
          // 挂起后由 resumeSuspendedTurnFlowIfReady 的 qiangxiDamage 分支续跑。
          if (game.pendingChoice) {
            if (!game.pauseState) game.pauseState = {};
            game.pauseState.qiangxiDamage = { actor: actor, targetActor: targetActor };
            return success('等待【强袭】成本引发的濒死结算。');
          }
        }
        return applyQiangxiDamage(game, actor, targetActor);
      }

      // 强袭的伤害段 (成本已付) — 同步路径直调, 濒死挂起路径由
      // resumeSuspendedTurnFlowIfReady 经 resumeQiangxiDamage 续跑。
      function applyQiangxiDamage(game, actor, targetActor) {
        if (game.phase === 'gameover') return success('强袭结算完成。');
        if (!game[actor] || game[actor].hp <= 0) return success('强袭发动者已阵亡。');
        if (!game[targetActor] || game[targetActor].hp <= 0) return success('强袭目标已不在场。');
        damage(game, targetActor, 1, actor, '【强袭】');
        return success('强袭完成。');
      }

      function resumeQiangxiDamage(game, saved) {
        return applyQiangxiDamage(game, saved.actor, saved.targetActor);
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
        // 评审收口 [中]: 官方"你**可以**令**一名角色**将手牌补至 X 张" —
        // 发动与否、给谁, 都是发动者的选择。玩家席改逐点开窗 (与遗计同款
        // 的 pauseState 逐点迭代), AI 席仍走 auto 启发。
        var pref = (self.skillPreferences && self.skillPreferences.jieming)
          || (targetActor === 'player' ? 'ask' : 'auto');
        if (pref === 'decline') {
          log(game, actorName(game, targetActor) + '选择不发动【节命】。');
          return null;
        }
        if (pref === 'ask') {
          game.pauseState = game.pauseState || {};
          game.pauseState.jieming = {
            actor: targetActor,
            remainingPoints: context.amount,
            totalPoints: context.amount
          };
          return fireNextJiemingPoint(game);
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

      // 节命逐点开窗 (遗计 fireNextYijiPoint 同构)。候选 = 全部存活座席
      // (官方"一名角色"含自己、含敌人), 面板只带公开信息 (手牌数/体力上限)。
      function fireNextJiemingPoint(game) {
        var saved = game.pauseState && game.pauseState.jieming;
        if (!saved) return null;
        var actor = saved.actor;
        if (!game[actor] || game.phase === 'gameover' || saved.remainingPoints <= 0) {
          game.pauseState.jieming = null;
          return { jiemingApplied: true };
        }
        var candidates = StateRuntime.aliveSeats(game).map(function (seat) {
          var st = game[seat];
          var limit = Math.min(st.maxHp, 5);
          return {
            seat: seat, name: st.name, limit: limit,
            handCount: (st.hand || []).length,
            gain: Math.max(0, limit - (st.hand || []).length)
          };
        });
        setPendingChoice(game, {
          kind: 'jieming-pick',
          actor: actor,
          pointIndex: saved.totalPoints - saved.remainingPoints + 1,
          totalPoints: saved.totalPoints,
          candidates: candidates
        });
        log(game, '等待' + actorName(game, actor) + '决定是否发动【节命】（第 '
          + (saved.totalPoints - saved.remainingPoints + 1) + ' / ' + saved.totalPoints + ' 点）。');
        return { suspendedForJieming: true };
      }

      // 节命的单点效果 (令 beneficiary 把手牌补至 min(体力上限, 5))。
      function applyJiemingPoint(game, actor, beneficiary) {
        var st = game[beneficiary];
        if (!st) return false;
        var limit = Math.min(st.maxHp, 5);
        var need = limit - (st.hand || []).length;
        if (need <= 0) {
          log(game, actorName(game, actor) + '发动【节命】，' + actorName(game, beneficiary)
            + '的手牌已达 ' + limit + ' 张，无需补牌。');
          return true;
        }
        drawCards(game, beneficiary, need);
        log(game, actorName(game, actor) + '发动【节命】，令' + actorName(game, beneficiary)
          + '将手牌补至 ' + limit + ' 张。');
        return true;
      }

      // 节命 ask resolver — decision: { target: seat } 发动本点 /
      // { decline: true } 本点放弃 (逐点独立, 与遗计同款)。
      function resolveJiemingPickChoice(game, pending, decision) {
        var saved = game.pauseState && game.pauseState.jieming;
        if (!saved) return fail('找不到【节命】询问的暂停状态。');
        var actor = pending.actor;
        var d = decision || {};
        if (d.decline || d.skip) {
          log(game, actorName(game, actor) + '选择本点不发动【节命】。');
        } else {
          var legal = (pending.candidates || []).map(function (entry) { return entry.seat; });
          var beneficiary = StateRuntime.resolveSeatOption(game, d.target);
          if (!beneficiary || legal.indexOf(beneficiary) < 0) {
            setPendingChoice(game, pending);
            return fail('请指定一名角色发动【节命】，或 decline 放弃本点。');
          }
          applyJiemingPoint(game, actor, beneficiary);
        }
        saved.remainingPoints -= 1;
        if (saved.remainingPoints > 0) {
          var next = fireNextJiemingPoint(game);
          if (next && next.suspendedForJieming) return success('继续【节命】下一点。');
        }
        game.pauseState.jieming = null;
        return success('节命结算完成。');
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
          // W1 (v14 P4 滚动候选回收): 此处原本裸返 { suspendedForFanjian: true }
          // —— 没有 ok 字段。useSkill 经 selectActiveSkillResult 原样上抛,
          // aiTakeAction 的 `skillResult.ok` 读到 undefined, runAITurn 的
          // `if (!action.ok) return action` 就把这个畸形对象当成失败结果返回
          // 给调用方 (1200 种子 fuzz 复现面在案, 基线 2c56ed0 同现)。
          // onActiveSkill 的返回值是**结果**不是 hook 信号 —— 与其余主动技
          // 一致改为 success(), 挂起标记作为附加字段随行。
          var fanjianPaused = success('等待' + actorName(game, targetActor) + '猜测【反间】的花色。');
          fanjianPaused.suspendedForFanjian = true;
          return fanjianPaused;
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

      // W1 (2026-06-09 审计 backlog:81 显式裁决 → **做**): 官方逐字是
      // "若你未于出牌阶段内使用或打出过【杀】, 你**可以**跳过弃牌阶段"
      // (card__hero__wu.md:61) —— 是可选技。此前引擎无条件跳过, 与"可以"
      // 不符。2026-06-09 的评估("1v1 跳弃牌永远最优, 纯规则洁癖")在 3-5 人
      // 身份场下已不再是全部图景 (例: 想留在弃牌阶段把牌喂给对手的固政,
      // 或单纯不想暴露"我这回合没出杀"), 且成本只有一个偏好闸。
      function triggerKejiBeforeDiscard(game, actor, context) {
        var state = game[actor];
        if (!state || !hasSkill(state, 'keji') || state.usedOrRespondedSha) return false;
        var kejiPref = (state.skillPreferences && state.skillPreferences.keji) || 'auto';
        if (kejiPref === 'decline') {
          log(game, actorName(game, actor) + '选择不发动【克己】，照常进入弃牌阶段。');
          return false;
        }
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
          // W2 (F6 同源): 雷击原按**旧风/3V3/国-标**版落地 (黑桃 / 2 点雷电);
          // 张角的**风**版是 card__hero__neutral.md:272
          // 「…令一名其他角色判定，若结果为**黑色**，你对其造成 **1** 点雷电
          //   伤害，若如此做，当你造成此伤害时，你**回复 1 点体力**。」
          // 三处差异 (花色闸 / 伤害量 / 回血) 一并按风版更正。
          // 花色读裸 color: judge() 已对判定归属者施加过红颜视图 (黑桃视红桃),
          // 这里再走 effectiveCardColor 会二次施加。与旧代码读裸 .suit 同口径。
          var hit = !!(leijiJudge && leijiJudge.color === 'black');
          resolveJudgementCard(game, targetActor, target, '【雷击】', leijiJudge);
          if (hit) {
            log(game, '【雷击】判定为黑色，' + actorName(game, targetActor) + '受到 1 点雷电伤害。');
            damage(game, targetActor, 1, actor, '【雷击】', null, 'thunder');
            var source = game[actor];
            if (source && source.hp > 0 && source.hp < source.maxHp) {
              source.hp += 1;
              log(game, actorName(game, actor) + '因【雷击】回复 1 点体力（现为 ' + source.hp + '）。');
            }
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
        // ═════ v15 V (山包) 注册 ═════
        // 张郃 巧变
        SkillRuntime.registerSkill(skillRegistry, 'qiaobian', {
        onDrawPhase: function (context) { return triggerQiaobianDrawPhase(context); }
      });
        // 邓艾 屯田 / 凿险 / (凿险授予) 急袭
        SkillRuntime.registerSkill(skillRegistry, 'tuntian', {
        onCardLost: function (context) { return triggerTuntianHandLoss(context); },
        onJudgementAfterResolve: function (context) { return triggerTuntianClaim(context); }
      });
        SkillRuntime.registerSkill(skillRegistry, 'zaoxian', {
        onPreparePhase: function (context) { return triggerZaoxianPrepare(context); }
      });
        SkillRuntime.registerSkill(skillRegistry, 'jixi', {
        onCardAs: function (context) { return triggerJixiCardAs(context); }
      });
        // 姜维 挑衅 / 志继
        SkillRuntime.registerSkill(skillRegistry, 'tiaoxin', {
        onActiveSkill: function (context) { return triggerTiaoxinActiveSkill(context); }
      });
        SkillRuntime.registerSkill(skillRegistry, 'zhiji', {
        onPreparePhase: function (context) { return triggerZhijiPrepare(context); }
      });
        // 刘禅 享乐 / 放权 / 若愚
        SkillRuntime.registerSkill(skillRegistry, 'xiangle', {
        onShaEffectiveness: function (context) { return triggerXiangleShaEffectiveness(context); }
      });
        SkillRuntime.registerSkill(skillRegistry, 'fangquan', {
        onBeforePlayPhase: function (context) { return triggerFangquanBeforePlayPhase(context); },
        onTurnEnd: function (context) { return triggerFangquanTurnEnd(context); }
      });
        SkillRuntime.registerSkill(skillRegistry, 'ruoyu', {
        onPreparePhase: function (context) { return triggerRuoyuPrepare(context); }
      });
        // 孙策 激昂 / 魂姿 / 制霸
        SkillRuntime.registerSkill(skillRegistry, 'jiang', {
        onShaTargeted: function (context) { return triggerJiangShaTargeted(context); },
        onTrickTargeted: function (context) { return triggerJiangTrickTargeted(context); }
      });
        SkillRuntime.registerSkill(skillRegistry, 'hunzi', {
        onPreparePhase: function (context) { return triggerHunziPrepare(context); }
      });
        SkillRuntime.registerSkill(skillRegistry, 'zhiba', {
        onActiveSkill: function (context) { return triggerZhibaActiveSkill(context); }
      });
        // 张昭张纮 直谏 / 固政
        SkillRuntime.registerSkill(skillRegistry, 'zhijian', {
        onActiveSkill: function (context) { return triggerZhijianActiveSkill(context); }
      });
        SkillRuntime.registerSkill(skillRegistry, 'guzheng', {
        onDiscardPhaseEnd: function (context) { return triggerGuzhengDiscardEnd(context); }
      });
        // 蔡文姬 悲歌 / 断肠
        SkillRuntime.registerSkill(skillRegistry, 'beige', {
        onDamageAfter: function (context) { return triggerBeigeDamageAfter(context); }
      });
        // v15 V 曾靠注册序 (断肠先于行殇) 定顺序, 并把它写成官方判例 ——
        // W2 F5 复核后确认那是**没有出处且方向判反**的断言。真正的官方规则是
        // 同一时机从当前回合角色起按逆时针依次 (glossary__flow.md:30),
        // 现由 damage-dying.js 的 runDeathTimingHooks 逐席派发决定,
        // **注册序不再承载任何语义**。
        SkillRuntime.registerSkill(skillRegistry, 'duanchang', {
        onDeath: function (context) { return triggerDuanchangDeath(context); }
      });
        // ═════ v15 U (林包) 注册 ═════
        SkillRuntime.registerSkill(skillRegistry, 'xingshang', {
        onDeath: function (context) { return triggerXingshangDeath(context); }
      });
        SkillRuntime.registerSkill(skillRegistry, 'fangzhu', {
        onDamageAfter: function (context) { return triggerFangzhuDamageAfter(context); }
      });
        SkillRuntime.registerSkill(skillRegistry, 'songwei', {
        onJudgementAfterResolve: function (context) { return triggerSongweiJudgementAfterResolve(context); }
      });
        SkillRuntime.registerSkill(skillRegistry, 'luanwu', {
        onActiveSkill: function (context) { return triggerLuanwuActiveSkill(context); }
      });
        SkillRuntime.registerSkill(skillRegistry, 'lieren', {
        onShaDamageDealt: function (context) { return triggerLierenShaDamageDealt(context); }
      });
        // W2 (F7): 暴虐是**来源侧**"造成伤害后"时机 → 挂 onDamageDealt
        // (不受"受害者存活"闸约束), 而不是受害侧的 onDamageAfter。
        SkillRuntime.registerSkill(skillRegistry, 'baonue', {
        onDamageDealt: function (context) { return triggerBaonueDamageAfter(context); }
      });
        SkillRuntime.registerSkill(skillRegistry, 'haoshi', {
        onDrawPhase: function (context) { return triggerHaoshiDrawPhase(context); }
      });
        SkillRuntime.registerSkill(skillRegistry, 'zaiqi', {
        onDrawPhase: function (context) { return triggerZaiqiDrawPhase(context); }
      });
        SkillRuntime.registerSkill(skillRegistry, 'dimeng', {
        onActiveSkill: function (context) { return triggerDimengActiveSkill(context); }
      });
        SkillRuntime.registerSkill(skillRegistry, 'yinghun', {
        onPreparePhase: function (context) { return triggerYinghunPrepare(context); }
      });
        SkillRuntime.registerSkill(skillRegistry, 'jiuchi', {
        onCardAs: function (context) { return triggerJiuchiCardAs(context); }
      });
        SkillRuntime.registerSkill(skillRegistry, 'duanliang', {
        onCardAs: function (context) { return triggerDuanliangCardAs(context); }
      });
        SkillRuntime.registerSkill(skillRegistry, 'benghuai', {
        onTurnEnd: function (context) { return triggerBenghuaiTurnEnd(context); }
      });
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
          // 评审收口 [中]: 与丈八同因 — 出杀入口一律走 shaUseAllowed 单点
          // (激将与天义不同将, 当前不可达, 但闸门口径必须一致, 否则下一个
          // 「本回合不能使用【杀】」类技能接进来时又会漏一处)。
          if (!StateRuntime.shaUseAllowed(self)) {
            return fail(self.flags && self.flags.tianyiLost
              ? '【天义】拼点没赢，本回合不能使用【杀】。' : '本回合已经使用过【杀】。');
          }
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
          resolveNiepanAskChoice: resolveNiepanAskChoice,
          resumeQiangxiDamage: resumeQiangxiDamage,
          applyShuangxiongDrawPhase: applyShuangxiongDrawPhase,
          resolveQuhuVictimChoice: resolveQuhuVictimChoice,
          resolveJiemingPickChoice: resolveJiemingPickChoice,
          // v15 U (林包)
          resolveBenghuaiChoice: resolveBenghuaiChoice,
          resolveFangzhuPickChoice: resolveFangzhuPickChoice,
          resolveYinghunChoice: resolveYinghunChoice,
          applyHaoshiGive: applyHaoshiGive,
          settleHaoshi: settleHaoshi,
          applyZaiqi: applyZaiqi,
          resolveLuanwuShaChoice: resolveLuanwuShaChoice,
          advanceLuanwu: advanceLuanwu,
          resolveYaowuRewardChoice: resolveYaowuRewardChoice,
          resolveGanglieFireChoice: resolveGanglieFireChoice,
          resolveGanglieSourceChoice: resolveGanglieSourceChoice,
          resolveFanjianGuessChoice: resolveFanjianGuessChoice,
          resolveGuanxingChoice: resolveGuanxingChoice,
          resolveYijiDistributeChoice: resolveYijiDistributeChoice,
          resolveGuicaiReplaceChoice: resolveGuicaiReplaceChoice,
          resolveLuoshenContinueChoice: resolveLuoshenContinueChoice,
          // v15 V (山包)
          resolveTiaoxinDemandChoice: resolveTiaoxinDemandChoice,
          resolveZhijiChoice: resolveZhijiChoice,
          resolveFangquanGrantChoice: resolveFangquanGrantChoice,
          applyZhijiOption: applyZhijiOption,
          applyFangquan: applyFangquan,
          settleZhibaPindian: settleZhibaPindian
        };
      }

      export const PLAY_PHASE_ACTIVE_SKILLS = {
        // v15 V (山包): 挑衅 (限一次) / 直谏 (装备牌给人) / 制霸 (吴势力发起拼点)
        tiaoxin: true,
        zhijian: true,
        zhiba: true,
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

