  // v12 F5: 杀结算链域 — playSha 主链 (雌雄指定 → 闪响应窗口 → 八卦判定 →
  // 贯石斧强制命中 → 伤害收尾) 与 shan-response/guanshi-discard resolver。
  // 自 game-engine.js verbatim 迁出, 依赖经 createShaFlowRuntime(deps) 注入;
  // skillRegistry 由引擎传入以派发 onNeedResponse/onShaTargeted hooks。
  import { SkillRuntime } from './skill-runtime.js';
  import { StateRuntime } from './state.js';
  import { CardRuntime } from './card-runtime.js';
  import { CARD_INFO } from '../data/cards.js';

  var actorName = StateRuntime.actorName;
  var opponent = StateRuntime.opponent;
  var hasSkill = StateRuntime.hasSkill;
  var hasEquipmentEffect = StateRuntime.hasEquipmentEffect;
  var canUseUnlimitedSha = StateRuntime.canUseUnlimitedSha;
  var canReachWithSha = StateRuntime.canReachWithSha;
  var weaponRange = StateRuntime.weaponRange;
  var distanceBetween = StateRuntime.distanceBetween;
  var aliveSeats = StateRuntime.aliveSeats;
  var seatList = StateRuntime.seatList;
  var isShaCard = CardRuntime.isShaCard;
  var isShaType = CardRuntime.isShaType;

  export function createShaFlowRuntime(deps) {
    var log = deps.log;
    var fail = deps.fail;
    var success = deps.success;
    var damage = deps.damage;
    var discardCard = deps.discardCard;
    var drawCards = deps.drawCards;
    var moveCard = deps.moveCard;
    var removeCardFromHand = deps.removeCardFromHand;
    var removeOwnCardFromAnyZone = deps.removeOwnCardFromAnyZone;
    var consumeResponse = deps.consumeResponse;
    var findResponseCard = deps.findResponseCard;
    var requestPlayerResponse = deps.requestPlayerResponse;
    var setPendingChoice = deps.setPendingChoice;
    var cardTargetProtection = deps.cardTargetProtection;
    var applyCixiongOnDesignate = deps.applyCixiongOnDesignate;
    var applyWeaponHitEffects = deps.applyWeaponHitEffects;
    var restoreZhuqueIdentity = deps.restoreZhuqueIdentity;
    var physicalCardOf = deps.physicalCardOf;
    var markHandOrigin = deps.markHandOrigin;
    var judge = deps.judge;
    var resolveJudgementCard = deps.resolveJudgementCard;
    var skillRegistry = deps.skillRegistry;
    var scoreCardForAI = deps.scoreCardForAI;
    var equipmentList = deps.equipmentList;
    var removeFirstCardOfType = deps.removeFirstCardOfType;
    var shanOptionForCard = deps.shanOptionForCard;

      function isArmorIgnoredBySha(game, sourceActor, card) {
        var source = game[sourceActor];
        return !!(source && isShaCard(card) && hasEquipmentEffect(source, 'ignoreArmorOnSha'));
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

      function defaultHostileTarget(game, actor) {
        var candidates = aliveSeats(game).filter(function (seat) { return seat !== actor; });
        return candidates.indexOf(opponent(actor)) >= 0 ? opponent(actor) : candidates[0];
      }

      function normalizeSingleTarget(game, actor, options) {
        var requested = options && (options.target || (options.targets && options.targets[0]));
        var targetActor = requested || defaultHostileTarget(game, actor);
        return targetActor;
      }

      function playSha(game, actor, card, options) {
        options = options || {};
        var self = game[actor];
        var targetActor = normalizeSingleTarget(game, actor, options);
        var target = game[targetActor];
        var targetProtection = cardTargetProtection(game, actor, targetActor, card, '杀');
        if (targetProtection) return fail(targetProtection.message);
        // v12 G2: 神速的视为使用【杀】"无距离限制" 且不计入出牌阶段次数。
        if (!options.ignoreDistance && !canReachWithSha(game, actor, targetActor)) return fail('距离不足，当前武器范围无法使用【杀】。');
        if (!options.skipShaCount) self.usedSha = true;
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
          game.pauseState.playSha = { actor: actor, targetActor: targetActor, card: card, amount: amount };
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

        return continueShaAfterCixiong(game, actor, card, amount, targetActor);
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

      function continueShaAfterCixiong(game, actor, card, amount, targetActor) {
        var self = game[actor];
        targetActor = targetActor || opponent(actor);
        var target = game[targetActor];
        var ignoreArmor = isArmorIgnoredBySha(game, actor, card);

        // v12 G2: 红颜 — 攻击者 (小乔) 的黑桃【杀】视为红桃 → 仁王盾不挡。
        if (!ignoreArmor && StateRuntime.effectiveCardColor(self, card) === 'black' && hasEquipmentEffect(target, 'blockBlackSha')) {
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
            source: { actor: actor, targetActor: targetActor, card: card, amount: amount, shanRemaining: shanRequiredAgainstSha(game, actor) },
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
        return resolveShaAfterResponse(game, actor, card, amount, dodged, targetActor);
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
          // v12 G2: 八卦"视为打出【闪】"同样触发 雷击 等 onShanUsed 时机。
          SkillRuntime.runHook(skillRegistry, 'onShanUsed', { game: game, actor: targetActor });
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

      // v9 PR-E25: 【杀】响应窗口结束后的结算 (贯石/青龙/伤害). 从原
      // continueShaAfterCixiong 拆出, 供同步路径 + shan-response 暂停恢复共用.
      function resolveShaAfterResponse(game, actor, card, amount, dodged, targetActor) {
        var self = game[actor];
        targetActor = targetActor || opponent(actor);
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
              source: { actor: actor, targetActor: saved.targetActor, card: card, amount: amount, shanRemaining: shanRemaining - 1 },
              options: listShanResponseOptions(game.player),
              meta: { sourceActor: actor, shaName: card.name },
              logMessage: '【无双】：' + actorName(game, 'player') + '需再使用一张【闪】。',
              statusMessage: '等待玩家响应【杀】(无双第二张)。'
            });
          }
          // 无第二张可出 → 尝试八卦顶上, 否则未抵消。
          dodged = tryBaguaDodge(game, 'player', isArmorIgnoredBySha(game, actor, card));
        }
        return resolveShaAfterResponse(game, actor, card, amount, dodged, saved.targetActor);
      }

    return {
      playSha: playSha,
      continueShaAfterCixiong: continueShaAfterCixiong,
      resolveShaAfterResponse: resolveShaAfterResponse,
      tryBaguaDodge: tryBaguaDodge,
      listShanResponseOptions: listShanResponseOptions,
      hasShanResponseAvailable: hasShanResponseAvailable,
      shanRequiredAgainstSha: shanRequiredAgainstSha,
      isArmorIgnoredBySha: isArmorIgnoredBySha,
      resolveShanResponseChoice: resolveShanResponseChoice,
      resolveGuanshiDiscardChoice: resolveGuanshiDiscardChoice,
      applyGuanshiForcedHit: applyGuanshiForcedHit,
      defaultHostileTarget: defaultHostileTarget,
      normalizeSingleTarget: normalizeSingleTarget
    };
  }
