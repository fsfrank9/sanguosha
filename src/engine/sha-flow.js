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
    // v12 H7: 主公技·护驾 求助 (杀需闪)
    var tryLordAidSync = deps.tryLordAidSync;
    var lordAidPlayerCanAid = deps.lordAidPlayerCanAid;

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
        // v12 H5: 阵营感知 — 缺省目标只落在敌对座席上 (1v1 双方异阵营,
        // 候选恒为 [对手], 行为不变); 无身份信息时视所有非己座席为敌对。
        var candidates = StateRuntime.hostileSeats(game, actor);
        return candidates.indexOf(opponent(actor)) >= 0 ? opponent(actor) : candidates[0];
      }

      function normalizeSingleTarget(game, actor, options) {
        // v12 H1: 显式目标经座席校验 — 无效值返回 null, 由 playSha 优雅拒绝
        // (与旧版 game[garbage] === undefined 的拒绝路径行为一致)。
        var requested = options && (options.target || (options.targets && options.targets[0]));
        if (requested) return StateRuntime.resolveSeatOption(game, requested);
        return defaultHostileTarget(game, actor);
      }

      function playSha(game, actor, card, options) {
        options = options || {};
        var self = game[actor];
        var targetActor = normalizeSingleTarget(game, actor, options);
        // v12 G2 修复: 场上无存活对手时 defaultHostileTarget 返回 undefined —
        // 优雅拒绝而非 game[undefined] 崩溃 (防御深层重入/收官竞态)。
        if (!targetActor || !game[targetActor]) return fail('没有合法的【杀】目标。');
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

        // v13 J0-3 (PR #165 缺陷 3): 藤甲 — 锁定技"普通【杀】对你无效"
        // (gltjk card__equipment.md)。免疫属"对该目标无效", 与仁王盾同层:
        // 直接短路整个响应询问, 不再先问闪、伤害层事后防止。火/雷【杀】
        // 不在免疫列 (火焰另有 藤甲② +1, 留在伤害修正层); 朱雀转化已在
        // playSha 先行, 转化后的火杀照常走响应; 青釭剑无视防具时不短路。
        if (!ignoreArmor && card.type === 'sha' && hasEquipmentEffect(target, 'tengjiaImmuneNormalShaAOE')) {
          log(game, actorName(game, targetActor) + '的【藤甲】令普通【杀】无效。');
          discardCard(game, card);
          return success('藤甲免疫普通杀。');
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
          // v13 J0-3 (PR #165 缺陷 3): 八卦阵先行 — "需要使用/打出【闪】时"
          // 先给判定机会 (红=视为打出闪, 免出手牌; 可用 skillPreferences.bagua
          // ='decline' 关闭), 判定失败/无八卦才回到手牌响应窗口; 窗口内放弃
          // 后不再补试八卦 (机会已在窗前给过)。无双两张需求逐张先试八卦。
          var askShanNeeded = shanRequiredAgainstSha(game, actor);
          var askBaguaPaid = 0;
          while (askBaguaPaid < askShanNeeded && tryBaguaDodge(game, targetActor, ignoreArmor)) {
            askBaguaPaid += 1;
          }
          if (askBaguaPaid >= askShanNeeded) {
            return resolveShaAfterResponse(game, actor, card, amount, true, targetActor);
          }
          return requestPlayerResponse(game, {
            kind: 'shan-response',
            actor: 'player',
            pauseKey: 'shaResponse',
            // v11 C1: 无双 → shanRemaining=2, 首张闪后再开第二个响应窗口。
            // v13 J0-3: 八卦已顶掉的需求从 shanRemaining 中扣除。
            source: { actor: actor, targetActor: targetActor, card: card, amount: amount, shanRemaining: askShanNeeded - askBaguaPaid, baguaTried: true },
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
            // v13 J0-3: 全座席八卦先行 (此前玩家 auto 座席真闪优先) —
            // "需要使用/打出【闪】时"防具先给发动机会, 判定失败再出真闪。
            if (tryBaguaDodge(game, targetActor, ignoreArmor)) continue;
            if (consumeResponse(game, targetActor, 'shan', '【杀】')) continue;
            // v12 H7: 护驾 — 主公自身打不出【闪】时求助魏势力座席:
            // AI 主公 + 玩家可代打 → 挂起询问 (resolver 收尾杀结算);
            // 其余 → AI 座席同步接力。
            if (targetActor !== 'player' && lordAidPlayerCanAid
                && lordAidPlayerCanAid(game, targetActor, 'hujia')) {
              return requestPlayerResponse(game, {
                kind: 'hujia-aid',
                actor: 'player',
                pauseKey: 'shaResponse',
                source: { actor: actor, targetActor: targetActor, card: card, amount: amount, shanRemaining: shanNeeded - shanIndex, lordAid: true },
                options: listShanResponseOptions(game.player),
                meta: { lordActor: targetActor, sourceActor: actor, shaName: card.name },
                logMessage: '等待' + actorName(game, 'player') + '决定是否响应【护驾】代打【闪】。',
                statusMessage: '等待玩家护主响应。'
              });
            }
            if (tryLordAidSync && tryLordAidSync(game, targetActor, 'hujia', '【杀】')) continue;
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
        // v13 J0-3: "你可以判定" — 可选发动; decline 偏好整体关闭 (缺省 auto)。
        if (target.skillPreferences && target.skillPreferences.bagua === 'decline') return false;
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
        // v13 J3: 同 resolveShaAfterResponse — 落点回调守卫武器命中特效。
        damage(game, targetActor, amount, actor, '【' + card.name + '】', card, null, {
          afterDamageSettled: function (g, landed) {
            if (landed) applyWeaponHitEffects(g, actor, targetActor);
          }
        });
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

        // v13 J3: 伤害落点回调 — 被天香转移/被防止时目标未受伤害, 麒麟等
        // "对目标角色造成伤害时"的武器命中特效不触发 (修复 v12 已知偏差);
        // 天香 ask 挂起时回调随重入结算延迟触发, 时序与决策一致。
        damage(game, targetActor, amount, actor, '【' + card.name + '】', card, null, {
          afterDamageSettled: function (g, landed) {
            if (landed) applyWeaponHitEffects(g, actor, targetActor);
          }
        });
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
          // v13 J0-3: 八卦机会已在开窗前给过 (判定失败才开的窗), 放弃出闪
          // 不再补试八卦 → 未抵消。
          dodged = false;
          shanRemaining = 1;
        }
        // v11 C1: 无双 — 首张闪成功且仍有剩余需求 → 下一张需求产生:
        // v13 J0-3: 先给八卦机会 (新需求新判定), 失败再开第二个响应窗口。
        if (dodged && shanRemaining > 1) {
          if (tryBaguaDodge(game, 'player', isArmorIgnoredBySha(game, actor, card))) {
            shanRemaining -= 1;
          }
        }
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
          // 八卦已试过且无第二张可出 → 未抵消。
          dodged = false;
        }
        // v12 H7: 玩家为主公且未抵消 → 求助魏势力 AI 座席代打【闪】(护驾)。
        if (!dodged && tryLordAidSync && tryLordAidSync(game, 'player', 'hujia', '【杀】')) {
          dodged = true;
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
