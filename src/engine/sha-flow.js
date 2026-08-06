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
  var seatsFrom = StateRuntime.seatsFrom;
  var weaponRange = StateRuntime.weaponRange;
  var distanceBetween = StateRuntime.distanceBetween;
  var aliveSeats = StateRuntime.aliveSeats;
  var seatList = StateRuntime.seatList;
  var isShaCard = CardRuntime.isShaCard;
  var isShaType = CardRuntime.isShaType;
  var putCard = CardRuntime.putCard;

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
    // 评审收口: 青龙续杀转化选优与主动/响应路径同一裁决函数。
    var selectCardAsConversion = deps.selectCardAsConversion;
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
    // v14 P1: 多目标链收尾的幂等来源牌弃置 (全区域定位, 真在途才补弃)。
    var discardSourceCardIfPending = deps.discardSourceCardIfPending;

      // v15 T: 天义拼点赢 — "你于此回合内使用【杀】无距离限制且使用
      // 【杀】的额外目标数上限 +1" (card__hero__wu.md:355)。
      function tianyiIgnoresDistance(state) {
        return !!(state && state.flags && state.flags.tianyiWon);
      }

      function tianyiExtraTargets(state) {
        return (state && state.flags && state.flags.tianyiWon) ? 1 : 0;
      }

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
        // v13 M2: 感知敌对路由 (明置恒等直读)。
        var candidates = StateRuntime.perceivedHostileSeats(game, actor);
        return candidates.indexOf(opponent(actor)) >= 0 ? opponent(actor) : candidates[0];
      }

      function normalizeSingleTarget(game, actor, options) {
        // v12 H1: 显式目标经座席校验 — 无效值返回 null, 由 playSha 优雅拒绝
        // (与旧版 game[garbage] === undefined 的拒绝路径行为一致)。
        var requested = options && (options.target || (options.targets && options.targets[0]));
        if (requested) {
          var resolved = StateRuntime.resolveSeatOption(game, requested);
          // audit4-M1: 显式目标复用合法性矩阵的 自己/亡者 排除 — 此前只校验
          // 座席名, 公共 API 可对自己/尸体出【杀】(尸体路径会重放死亡结算
          // 与身份场奖惩)。官方: 杀目标为"攻击范围内的一名角色" (无"包括
          // 你在内"措辞, 对照桃/酒), 亡者不再参与结算。
          if (!resolved || resolved === actor) return null;
          if (!game[resolved] || game[resolved].hp <= 0) return null;
          return resolved;
        }
        return defaultHostileTarget(game, actor);
      }

      // ── v14 P2: 方天画戟 — "若你使用的【杀】是最后的手牌, 你使用此【杀】的
      // 额外目标数上限 +2" (card__equipment.md)。口径核定 (虚拟杀):
      //   - 物理杀 / 由手牌转化的虚拟杀 (武圣红牌当杀等): 组成实体全部来自
      //     手牌 (_handOrigin 指向使用者, card-runtime 统一手牌失去标记) 且
      //     使用后手牌为空 → 该杀"是最后的手牌", 生效;
      //   - 装备区来源的转化 (武圣可用装备区红牌) / 无实体的视为使用
      //     (神速): 所用之牌不是手牌 → 不生效。
      // playSha 时点牌已移出手牌, 故判 hand.length === 0 + 实体溯源。
      function fangtianShaEligible(game, actor, card) {
        var self = game[actor];
        if (!self || !hasEquipmentEffect(self, 'fangtianLastHandBonus')) return false;
        if (!card || (self.hand && self.hand.length > 0)) return false;
        // 实体溯源覆盖三种形态: 普通实体杀 [card] / 转化虚拟杀 physicalCard
        // (武圣/龙胆/playCardAs) / 组合虚拟杀 physicalCards (丈八/青龙转化)。
        // 装备区来源的转化实体无 _handOrigin (takeCard 仅对手牌打标) →
        // 天然不生效; 神速类无实体 → 不生效。
        var physicals = card.physicalCards
          || (card.physicalCard ? [card.physicalCard] : [card]);
        if (!physicals.length) return false;
        for (var pi = 0; pi < physicals.length; pi += 1) {
          if (!physicals[pi] || physicals[pi]._handOrigin !== self) return false;
        }
        return true;
      }

      // v14 P2: UI/AI 选目标时点的前置查询 — 牌尚在手牌中: 装备方天 + 该杀
      // 是仅剩的一张手牌 → 额外目标上限 2, 否则 0。(转化杀的 UI 侧暂不
      // 走多目标, 引擎侧由 fangtianShaEligible 在使用时点复核。)
      // v15 T 评审收口 [中]: 天义的"额外目标数上限 +1"此前只落在
      // normalizeMultiTargets 的结算层, 这条前置查询没接 → UI 多目标点选
      // 与 AI 的额外目标启发都拿不到天义加成 (裸 API 才用得上)。方天与
      // 天义可叠加 (两者都是"额外目标数上限 +N", 官方无互斥)。
      function shaExtraTargetLimit(game, actor, cardId) {
        var self = game[actor];
        if (!self) return 0;
        var hand = self.hand || [];
        if (hand.length !== 1 || !hand[0] || hand[0].id !== cardId || !isShaCard(hand[0])) {
          // 方天资格要求"仅剩的一张手牌", 天义不要求 — 非独张时只给天义。
          var loose = (hand || []).some(function (card) {
            return card && card.id === cardId && isShaCard(card);
          });
          return loose ? tianyiExtraTargets(self) : 0;
        }
        return (hasEquipmentEffect(self, 'fangtianLastHandBonus') ? 2 : 0)
          + tianyiExtraTargets(self);
      }

      // ── v14 P1: 多目标校验 — 逐席复用单目标合法性矩阵 (座席/自己/亡者/
      // 目标保护/距离), 全部通过才允许进入结算 (先验后改状态, 与单目标
      // playSha 的验证序一致); 重复席去重。返回 { targets } 或 { error }。
      function normalizeMultiTargets(game, actor, options, card) {
        var requested = options.targets;
        var seen = {};
        var targets = [];
        for (var i = 0; i < requested.length; i += 1) {
          var resolved = StateRuntime.resolveSeatOption(game, requested[i]);
          if (!resolved || resolved === actor) return { error: '没有合法的【杀】目标。' };
          if (!game[resolved] || game[resolved].hp <= 0) return { error: '没有合法的【杀】目标。' };
          // 评审收口: 官方"使用牌指定多个目标"不允许重复指定同一角色
          // (重复席位只能由流离等改目标效果产生) — 拒绝而非静默去重
          // (去重会让 {targets:[X,X]} 绕过方天资格门混入链语义)。
          if (seen[resolved]) return { error: '不能重复指定同一名角色为【杀】的目标。' };
          seen[resolved] = true;
          targets.push(resolved);
        }
        if (!targets.length) return { error: '没有合法的【杀】目标。' };
        // 评审收口 [低 L5]: 拒绝文案此前把额外数一律记在方天名下 — 只有
        // 天义加成时会写成"方天画戟额外 1"。改为逐来源列名。
        var fangtianExtra = fangtianShaEligible(game, actor, card) ? 2 : 0;
        var tianyiExtra = tianyiExtraTargets(game[actor]);
        var extraLimit = fangtianExtra + tianyiExtra;
        if (targets.length > 1 + extraLimit) {
          var sources = [];
          if (fangtianExtra) sources.push('方天画戟额外 ' + fangtianExtra);
          if (tianyiExtra) sources.push('天义额外 ' + tianyiExtra);
          return { error: '【杀】目标数超过上限（额定 1' + (sources.length ? ' + ' + sources.join(' + ') : '') + '）。' };
        }
        for (var vi = 0; vi < targets.length; vi += 1) {
          var protection = cardTargetProtection(game, actor, targets[vi], card, '杀');
          if (protection) return { error: protection.message };
          if (!options.ignoreDistance && !tianyiIgnoresDistance(game[actor])
              && !canReachWithSha(game, actor, targets[vi])) {
            return { error: '距离不足，当前武器范围无法对' + actorName(game, targets[vi]) + '使用【杀】。' };
          }
        }
        // 官方 rule__principle.md: 同一张牌对多目标结算"从当前回合角色开始
        // 按逆时针方向依次" — 指定/锁定/结算三阶段统一按座次环序推进。
        return { targets: sortTargetsByRing(game, actor, targets) };
      }

      // v14 P1: 目标按座次环排序 (锚点 = 当前回合角色, 铁索传导同款取锚;
      // 流离转移可产生重复席位 — 判例 rule__principle.md: 转移给既有目标 B
      // 则"对 B 连续进行两次结算", 稳定排序保重复席相邻)。
      function sortTargetsByRing(game, anchorActor, targets) {
        var anchor = (game.turn && game[game.turn]) ? game.turn : anchorActor;
        var ring = seatsFrom(game, anchor, true);
        var order = {};
        ring.forEach(function (seat, ringIdx) { order[seat] = ringIdx; });
        return targets.slice().sort(function (a, b) { return (order[a] || 0) - (order[b] || 0); });
      }

      function playSha(game, actor, card, options) {
        options = options || {};
        var self = game[actor];
        // v14 P1: 显式多目标 (方天画戟额外目标) → 目标队列结算路径; 其余
        // (含全部既有调用方) 保持单目标原路径 — 行为零漂移红线。
        if (Array.isArray(options.targets) && options.targets.length > 1) {
          return playShaMultiTarget(game, actor, card, options);
        }
        var targetActor = normalizeSingleTarget(game, actor, options);
        // v12 G2 修复: 场上无存活对手时 defaultHostileTarget 返回 undefined —
        // 优雅拒绝而非 game[undefined] 崩溃 (防御深层重入/收官竞态)。
        if (!targetActor || !game[targetActor]) return fail('没有合法的【杀】目标。');
        var target = game[targetActor];
        var targetProtection = cardTargetProtection(game, actor, targetActor, card, '杀');
        if (targetProtection) return fail(targetProtection.message);
        // v12 G2: 神速的视为使用【杀】"无距离限制" 且不计入出牌阶段次数。
        if (!options.ignoreDistance && !tianyiIgnoresDistance(self)
            && !canReachWithSha(game, actor, targetActor)) return fail('距离不足，当前武器范围无法使用【杀】。');
        if (!options.skipShaCount) {
          // v15 T: 天义"额外次数上限 +1" — 已用过时消耗一次额外次数,
          // 用尽后 usedSha 才恒真 (canPlayCard 的次数闸读同一状态)。
          if (self.usedSha && (self.shaExtraUses || 0) > 0) self.shaExtraUses -= 1;
          self.usedSha = true;
        }
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

        // (v14 P2: v7 PR-15 的方天占位 flag 路径删除 — 真实现为多目标入口的
        // 目标数上限 (normalizeMultiTargets/fangtianShaEligible)。单目标使用
        // 时方天无可观测效果, 与官方一致 — 额外目标是"可以"而非"必须"。)

        // v14 P3: 流离 (大乔) — 官方时机"成为目标时" (flow__use.md step 4)
        // 先于雌雄"指定目标后" (step 5); 自 v8 起挂在 cixiong 之后的占位
        // hook 前移至此 (旧位置在 cixiong 挂起路径上还会被整个跳过)。
        // 转移可连锁 (新目标重新过"成为目标时"); 玩家 ask 挂起走
        // pauseState.shaLiuli + 'liuli-transfer' resolver。
        var liuliOutcome = runLiuliStage(game, actor, card, targetActor);
        if (liuliOutcome.paused) {
          if (!game.pauseState) game.pauseState = {};
          game.pauseState.shaLiuli = {
            mode: 'single', actor: actor, card: card, amount: amount,
            targetActor: liuliOutcome.pendingTarget
          };
          return success('等待【流离】结算…');
        }
        targetActor = liuliOutcome.targetActor;

        return designateCixiongAndResolve(game, actor, card, amount, targetActor);
      }

      // v14 P3: 单目标"指定目标后"(雌雄) + 响应/伤害结算 — 自 playSha 尾部
      // 拆出, 供 流离 resolver 在转移收束后重入 (语句与拆出前逐行一致)。
      function designateCixiongAndResolve(game, actor, card, amount, targetActor) {
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
        return continueShaAfterCixiong(game, actor, card, amount, targetActor);
      }

      // ── v14 P3: 流离时机驱动 — 对当前目标跑 onShaTargeted hook; 技能侧
      // (skills.js) 负责 候选计算/偏好路由/AI 立场决策/玩家 setPendingChoice。
      // 同步转移 (AI auto) 后新目标重新过时机 (连锁, 每次转移弃一张牌 →
      // 必然收敛); 玩家 ask → { paused, pendingTarget } 由调用方存快照。
      // 候选不排除本杀的其他既有目标 — 判例 rule__principle.md: 转移给
      // 既有目标 B 合法, B 被连续结算两次。
      function runLiuliStage(game, actor, card, targetActor) {
        while (true) {
          var hookContext = {
            game: game,
            sourceActor: actor,
            targetActor: targetActor,
            target: game[targetActor],
            card: card
          };
          var results = SkillRuntime.runHook(skillRegistry, 'onShaTargeted', hookContext);
          // 评审收口: 挂起检测收窄到本时机自己的询问 kind — 未来其他
          // onShaTargeted 注册者/弃牌副作用产生异类 pending 时不误吞
          // 同步 transferTo, 也不写入无人消费的 shaLiuli 快照。
          if (game.pendingChoice && game.pendingChoice.kind === 'liuli-transfer') {
            return { paused: true, pendingTarget: targetActor };
          }
          var transferTo = null;
          for (var ri = 0; ri < results.length; ri += 1) {
            if (results[ri].result && results[ri].result.transferTo) {
              transferTo = results[ri].result.transferTo;
            }
          }
          if (!transferTo || !game[transferTo]) return { targetActor: targetActor };
          targetActor = transferTo;
        }
      }

      // v14 P1: step-5 "指定目标后"的响应锁定 (铁骑红判/烈弓距离) — 从
      // continueShaAfterCixiong 内联 hook 调用抽出, 供多目标链在锁定阶段
      // 按目标逐一预结算 (官方 rule__principle.md 铁骑判例: 对全部目标
      // 决定并结算完毕后, 再开始【杀】的使用结算)。
      function computeShaResponseLock(game, actor, card, targetActor) {
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
        return responseContext.responseLocked;
      }

      // ── v14 P1: 多目标杀结算链 (方天画戟) — 参照 advanceTargetQueue 范式:
      // pauseState.shaChain 快照 + 阶段游标 + "游标先行 + pendingChoice 即
      // 挂起" (AOE 同款), 恢复经 resumeSuspendedTurnFlowIfReady 的 shaChain
      // 分支 / resumePlayShaAfterCixiong 的 chain 分支。三阶段按官方
      // flow__use.md 时机序: liuli (step 4 成为目标时, 逐目标) → cixiong
      // (step 5 指定目标后, 逐目标) → resolve (逐目标 仁王/藤甲/闪/八卦/
      // 伤害, 复用单目标 continueShaAfterCixiong 全链)。
      // 注: 实战中方天占武器槽 → 链内雌雄/贯石/青龙 (皆武器) 不可达,
      // 但结构保持通用 — 阶段照跑, 逐席结算与单目标全等。
      function playShaMultiTarget(game, actor, card, options) {
        var self = game[actor];
        var normalized = normalizeMultiTargets(game, actor, options, card);
        if (normalized.error) return fail(normalized.error);
        var targets = normalized.targets;
        if (!options.skipShaCount) {
          // v15 T: 天义"额外次数上限 +1" — 已用过时消耗一次额外次数,
          // 用尽后 usedSha 才恒真 (canPlayCard 的次数闸读同一状态)。
          if (self.usedSha && (self.shaExtraUses || 0) > 0) self.shaExtraUses -= 1;
          self.usedSha = true;
        }
        self.usedOrRespondedSha = true;
        var amount = 1 + (self.shaBonus || 0);
        self.shaBonus = 0;
        // 朱雀转火杀 — 与单目标路径同语义 (见 playSha 内注释; "此杀"整体
        // 转化, 对全部目标生效)。
        if (hasEquipmentEffect(self, 'zhuqueShaToFire') && card.type === 'sha'
            && (!self.skillPreferences || self.skillPreferences.zhuque !== 'decline')) {
          card.zhuqueOriginalType = card.type;
          card.zhuqueOriginalName = card.name;
          card.type = 'fire_sha';
          card.name = '火杀';
          log(game, actorName(game, actor) + '发动【朱雀羽扇】，将【杀】转化为【火杀】。');
        }
        var targetNames = targets.map(function (seat) { return actorName(game, seat); });
        log(game, actorName(game, actor) + '对' + targetNames.join('、') + '使用【' + card.name + '】。');
        log(game, '【方天画戟】生效：最后的手牌【杀】额外目标数上限 +2，共指定 ' + targets.length + ' 个目标。');
        if (!game.pauseState) game.pauseState = {};
        game.pauseState.shaChain = {
          actor: actor,
          card: card,
          amount: amount,
          targets: targets,
          stage: 'liuli',
          liuliIdx: 0,
          lockIdx: 0,
          locks: [],
          cixiongIdx: 0,
          resolveIdx: 0
        };
        return advanceShaChain(game);
      }

      function advanceShaChain(game) {
        var chain = game.pauseState && game.pauseState.shaChain;
        if (!chain) return fail('【杀】多目标结算状态丢失。');
        // 评审收口: 终局即收束 — 挂起点结算触发终局时, resume 路径以此
        // 清链 + 幂等弃置 (AOE 的 wanjian resolver 终局兜底同款)。
        if (game.phase === 'gameover') return finishShaChain(game);
        // 阶段 1 — step 4 "成为目标时": 逐目标过流离 (可转移/可挂起)。
        if (chain.stage === 'liuli') {
          while (chain.liuliIdx < chain.targets.length) {
            var liuliSeat = chain.targets[chain.liuliIdx];
            if (!game[liuliSeat] || game[liuliSeat].hp <= 0) { chain.liuliIdx += 1; continue; }
            var liuliResult = runLiuliStage(game, chain.actor, chain.card, liuliSeat);
            if (liuliResult.paused) {
              // 游标停留本席 — resolver 收束后写回最终目标并推进。
              game.pauseState.shaLiuli = {
                mode: 'chain', chainIdx: chain.liuliIdx,
                actor: chain.actor, card: chain.card, amount: chain.amount,
                targetActor: liuliResult.pendingTarget
              };
              return success('等待【流离】结算…');
            }
            chain.targets[chain.liuliIdx] = liuliResult.targetActor;
            chain.liuliIdx += 1;
          }
          // 流离可改变目标构成 → 按座次环重排 (判例: 转移给既有目标 B 后
          // "先对A进行一次结算，再对B连续进行两次结算")。
          chain.targets = sortTargetsByRing(game, chain.actor, chain.targets);
          chain.stage = 'locks';
        }
        // 阶段 2 — step 5 "指定目标后": 武将技能 (铁骑/烈弓 响应锁定) 对
        // 全部目标结算完, 再装备技能 (雌雄) 对全部目标 — 两遍分跑, 对齐
        // 官方判例 (rule__principle 补充: 伏完须先对二人各结算武将技能,
        // 再各结算装备技能)。锁定按目标索引存 (流离重复席位各自独立判定)。
        // 实战中方天占武器槽 → 雌雄遍不可达, 结构保真保留。
        if (chain.stage === 'locks') {
          while (chain.lockIdx < chain.targets.length) {
            var lockSeat = chain.targets[chain.lockIdx];
            var lockIdxNow = chain.lockIdx;
            chain.lockIdx += 1;
            if (!game[lockSeat] || game[lockSeat].hp <= 0) { chain.locks[lockIdxNow] = false; continue; }
            chain.locks[lockIdxNow] = computeShaResponseLock(game, chain.actor, chain.card, lockSeat);
            if (game.pendingChoice) return success('等待响应结算…'); // 防御 (铁骑判定链上的改判挂起等)
          }
          chain.stage = 'cixiong';
        }
        if (chain.stage === 'cixiong') {
          while (chain.cixiongIdx < chain.targets.length) {
            var cxSeat = chain.targets[chain.cixiongIdx];
            chain.cixiongIdx += 1; // 游标先行 (雌雄挂起后恢复自下一席)
            if (!game[cxSeat] || game[cxSeat].hp <= 0) continue;
            var cxResult = applyCixiongOnDesignate(game, chain.actor, cxSeat);
            if (cxResult && cxResult.paused) return success('【雌雄双股剑】结算中…');
            if (game.pendingChoice) return success('等待响应结算…');
          }
          chain.stage = 'resolve';
        }
        // 阶段 3 — 逐目标使用结算 (座次环序; 复用单目标全链)。
        while (chain.resolveIdx < chain.targets.length) {
          if (game.phase === 'gameover') break;
          var seat = chain.targets[chain.resolveIdx];
          var resolveIdxNow = chain.resolveIdx;
          chain.resolveIdx += 1; // 游标先行 — 本席经 resolver 收尾后恢复自下一席
          if (!game[seat] || game[seat].hp <= 0) continue; // 结算期间倒下的席位不再是目标
          var seatResult = continueShaAfterCixiong(game, chain.actor, chain.card, chain.amount, seat,
            { responseLocked: !!chain.locks[resolveIdxNow] });
          // 本席挂起 (闪响应/护驾/濒死/天香/雷击…) → 保留链, 选择排空后续跑。
          if (game.pendingChoice) return seatResult || success('等待响应结算…');
        }
        return finishShaChain(game);
      }

      function finishShaChain(game) {
        var chain = game.pauseState.shaChain;
        game.pauseState.shaChain = null;
        // 全目标结算完毕 → 杀入弃牌堆。命中路径可能已由伤害收尾弃置 / 被
        // 奸雄获得 — 幂等全区域定位, 仅"真在途"补弃 (AOE 收尾同款)。
        if (chain && chain.card) discardSourceCardIfPending(game, chain.card);
        return success('【杀】结算完成。');
      }

      // v14 P1: 逐席结果 (仁王/藤甲/闪避/青龙前置) 的杀弃置 — 单目标路径
      // 原样立即弃置; 多目标链中该杀仍要对后续目标结算, 逐席不弃, 由
      // finishShaChain 统一收尾。
      function settleShaCardAfterOutcome(game, card) {
        var chain = game.pauseState && game.pauseState.shaChain;
        if (chain && chain.card === card) return;
        discardCard(game, card);
      }

      // v14 P3: 流离 resolver — decision { cardId, target } 弃一张牌 (手牌/
      // 装备) 转移; { decline } 放弃。非法输入按惯例重挂。转移后新目标重新
      // 过"成为目标时"时机 (连锁流离), 全部收束后按 mode 回到 单目标雌雄
      // 阶段 / 多目标链驱动。
      function resolveLiuliTransferChoice(game, pending, decision) {
        var saved = game.pauseState && game.pauseState.shaLiuli;
        if (!saved) return fail('找不到【流离】的暂停状态。');
        var holder = pending.actor;
        var holderState = game[holder];
        var d = decision || {};
        var finalTarget;
        if (d.decline || (!d.cardId && !d.target)) {
          log(game, actorName(game, holder) + '选择不发动【流离】。');
          finalTarget = saved.targetActor;
        } else {
          var costOk = holderState && (pending.costIds || []).indexOf(d.cardId) >= 0;
          var seat = d.target && StateRuntime.resolveSeatOption(game, d.target);
          var candidateSeats = (pending.candidates || []).map(function (c) { return c.seat; });
          var targetOk = seat && candidateSeats.indexOf(seat) >= 0 && game[seat] && game[seat].hp > 0;
          if (!costOk || !targetOk) {
            setPendingChoice(game, pending);
            return fail('请选择一张要弃置的牌与转移目标，或 decline 放弃发动【流离】。');
          }
          var costCard = removeOwnCardFromAnyZone(holderState, d.cardId, game);
          if (!costCard) {
            setPendingChoice(game, pending);
            return fail('所选弃置牌已不可用，请重新选择。');
          }
          discardCard(game, costCard);
          log(game, actorName(game, holder) + '发动【流离】，弃置【' + costCard.name
            + '】将【' + saved.card.name + '】转移给' + actorName(game, seat) + '。');
          // 新目标重新过"成为目标时"时机 (可再流离/再挂起)。
          var again = runLiuliStage(game, saved.actor, saved.card, seat);
          if (again.paused) {
            saved.targetActor = again.pendingTarget;
            return success('等待【流离】结算…');
          }
          finalTarget = again.targetActor;
        }
        game.pauseState.shaLiuli = null;
        if (saved.mode === 'chain') {
          var chain = game.pauseState.shaChain;
          if (!chain) return fail('【杀】多目标结算状态丢失。');
          chain.targets[saved.chainIdx] = finalTarget;
          chain.liuliIdx = saved.chainIdx + 1;
          return advanceShaChain(game);
        }
        return designateCixiongAndResolve(game, saved.actor, saved.card, saved.amount, finalTarget);
      }

      // v9 PR-E25/E26: 非消耗式探测 — 玩家是否有【闪】可作响应 (真闪 + 转化候选).
      function hasShanResponseAvailable(state) {
        if (!state) return false;
        return listShanResponseOptions(state).length > 0;
      }

      // v11 C1: 无双 — 锁定技。吕布的【杀】需目标依次两张【闪】; 决斗中
      // 吕布的对手每轮需依次打出两张【杀】。
      //
      // v15 U: 本函数是"抵消这张【杀】需要几张【闪】"的**单点**。签名补上
      // targetActor —— 无双只看来源, 但董卓【肉林】是**双向**的:
      //   肉林① 你(董卓)使用【杀】指定**女性**目标后 → 该目标需两张;
      //   肉林② 你(董卓)成为**女性角色**使用的【杀】的目标后 → 你需两张。
      // 两条都要同时读来源与目标, 只看来源的旧签名表达不了。
      // 与无双同场时取最大值 (官方无"叠加"表述, 两技都只是把需求置为 2)。
      function shanRequiredAgainstSha(game, sourceActor, targetActor) {
        var source = game[sourceActor];
        var target = targetActor ? game[targetActor] : null;
        var needed = hasSkill(source, 'wushuang') ? 2 : 1;
        if (target) {
          // 肉林①: 来源是董卓, 目标是女性。
          if (hasSkill(source, 'roulin') && target.gender === 'female') needed = Math.max(needed, 2);
          // 肉林②: 目标是董卓, 来源是女性。
          if (hasSkill(target, 'roulin') && source && source.gender === 'female') needed = Math.max(needed, 2);
        }
        return needed;
      }

      // 需两张【闪】时的日志文案 (无双/肉林 各自具名, 不再一律写"无双")。
      function doubleShanReasonLabel(game, sourceActor, targetActor) {
        var source = game[sourceActor];
        var target = targetActor ? game[targetActor] : null;
        if (hasSkill(source, 'wushuang')) return '无双';
        if (target && hasSkill(source, 'roulin') && target.gender === 'female') return '肉林';
        if (target && hasSkill(target, 'roulin') && source && source.gender === 'female') return '肉林';
        return '无双';
      }

      // v14 P1: presetLock — 多目标链在锁定阶段已按目标预结算 onNeedResponse
      // (铁骑/烈弓), 结算阶段经 { responseLocked } 传入, 不再重跑 hook
      // (避免铁骑二次判定); 单目标路径不传, 行为与拆分前逐行一致。
      function continueShaAfterCixiong(game, actor, card, amount, targetActor, presetLock) {
        var self = game[actor];
        targetActor = targetActor || opponent(actor);
        var target = game[targetActor];
        var ignoreArmor = isArmorIgnoredBySha(game, actor, card);

        // v14 Q3 (P 评审记录项复核落地): "指定目标后"锁定 (铁骑/烈弓) 前移至
        // 仁王盾/藤甲有效性检测之前 — 官方 flow__use.md 时机序: step 5 指定
        // 目标后 早于 使用结算内的有效性检测 (享乐判例); v7 起单目标路径把
        // onNeedResponse 留在护甲短路之后, 对注定被仁王/藤甲挡下的目标漏跑
        // 铁骑判定 (P1 链路径已按官方序, 两路自此在护甲时序上对齐)。
        // 评审收口口径: 铁骑×雌雄的相对序两路仍不同 — 单目标为 雌雄(装备
        // 技)→铁骑(武将技), 链路径为 locks(武将技)→cixiong(装备技); 后者
        // 合伏完判例, 但方天占武器槽使链内雌雄实战不可达, 无可观测冲突。
        var responseContext = { responseLocked: false };
        if (presetLock) {
          responseContext.responseLocked = !!presetLock.responseLocked;
        } else {
          responseContext.responseLocked = computeShaResponseLock(game, actor, card, targetActor);
        }

        // v12 G2: 红颜 — 攻击者 (小乔) 的黑桃【杀】视为红桃 → 仁王盾不挡。
        if (!ignoreArmor && StateRuntime.effectiveCardColor(self, card) === 'black' && hasEquipmentEffect(target, 'blockBlackSha')) {
          log(game, actorName(game, targetActor) + '的【仁王盾】抵消了黑色【杀】。');
          settleShaCardAfterOutcome(game, card);
          return success('仁王盾抵消。');
        }

        // v13 J0-3 (PR #165 缺陷 3): 藤甲 — 锁定技"普通【杀】对你无效"
        // (gltjk card__equipment.md)。免疫属"对该目标无效", 与仁王盾同层:
        // 直接短路整个响应询问, 不再先问闪、伤害层事后防止。火/雷【杀】
        // 不在免疫列 (火焰另有 藤甲② +1, 留在伤害修正层); 朱雀转化已在
        // playSha 先行, 转化后的火杀照常走响应; 青釭剑无视防具时不短路。
        if (!ignoreArmor && card.type === 'sha' && hasEquipmentEffect(target, 'tengjiaImmuneNormalShaAOE')) {
          log(game, actorName(game, targetActor) + '的【藤甲】令普通【杀】无效。');
          settleShaCardAfterOutcome(game, card);
          return success('藤甲免疫普通杀。');
        }

        // v9 PR-E25: 玩家是【杀】目标 + skillPreferences.shanResponse==='ask' +
        //   有【闪】可响应 → 暂停, 把"出不出闪"的决策交给玩家. 引擎默认 (无该
        //   pref) 仍走自动响应, 保证旧测试同步行为不变.
        // v10 V3: 走 requestPlayerResponse 框架 — pauseState.shaResponse + pendingChoice
        // 的设置统一. resolve 在 RESPONSE_KIND_RESOLVERS['shan-response'] 注册.
        // v15 S1: 于吉可背面朝上打出任意手牌当【闪】 → 手上没有闪也要开窗。
        if (targetActor === 'player' && !responseContext.responseLocked
            && target.skillPreferences && target.skillPreferences.shanResponse === 'ask'
            && (hasShanResponseAvailable(target)
              || (deps.guhuoResponsePossible && deps.guhuoResponsePossible(game, targetActor)))) {
          // v13 J0-3 (PR #165 缺陷 3): 八卦阵先行 — "需要使用/打出【闪】时"
          // 先给判定机会 (红=视为打出闪, 免出手牌; 可用 skillPreferences.bagua
          // ='decline' 关闭), 判定失败/无八卦才回到手牌响应窗口; 窗口内放弃
          // 后不再补试八卦 (机会已在窗前给过)。无双两张需求逐张先试八卦。
          var askShanNeeded = shanRequiredAgainstSha(game, actor, targetActor);
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
          var shanNeeded = shanRequiredAgainstSha(game, actor, targetActor);
          if (shanNeeded > 1) {
            log(game, '【' + doubleShanReasonLabel(game, actor, targetActor) + '】锁定：'
              + actorName(game, targetActor) + '需依次使用两张【闪】。');
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
          settleShaCardAfterOutcome(game, saved.card);
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
          // v15 T: 猛进 (庞德) — "每当你使用的【杀】被目标角色使用的【闪】
          // 抵消时, 你可以弃置其一张牌" (card__hero__neutral.md:225)。
          // 位序: 贯石斧之后 (贯石强制命中 → 杀未被抵消, 猛进不触发),
          // 青龙续杀之前 (抵消的瞬间先于"继续使用一张杀")。
          // 到此处的 dodged 恒为"闪抵消" — 仁王盾/藤甲免疫在开窗前已短路
          // 返回; 八卦"视为使用的闪"与护驾代打"视为你使用"均计 (官方
          // card__equipment.md:123 / card__hero__wei.md:13 逐字)。
          var dodgeHookResults = SkillRuntime.runHook(skillRegistry, 'onShaDodged', {
            game: game, actor: actor, targetActor: targetActor, card: card, amount: amount
          });
          // 玩家席猛进经 pendingChoice 选牌 → 挂起, 由 resolver 续跑本段
          // 剩余流程 (青龙续杀 + 结算收尾)。
          //
          // 评审收口 [高]: 判据必须是"本次钩子自己挂起了", 不能是
          // `game.pendingChoice` — 闪响应本身就可能已挂起一个与猛进无关的
          // 窗口 (consumeResponse 派发 onShanUsed → 张角雷击对玩家席开
          // 'leiji-ask')。以 pendingChoice 为判据时, **局内没有庞德也会早退**,
          // 而 shaDodgeResume 只有 resolveMengjinPickChoice 认 → 该【杀】永不
          // settleShaCardAfterOutcome, 从所有区域消失 (守恒 census 因深扫
          // pauseState 反而"通过"), 青龙续杀被静默吞掉。
          var mengjinSuspended = dodgeHookResults.some(function (entry) {
            return entry && entry.result && entry.result.suspendedForMengjin;
          });
          if (mengjinSuspended) {
            if (!game.pauseState) game.pauseState = {};
            game.pauseState.shaDodgeResume = {
              actor: actor, targetActor: targetActor, card: card, amount: amount
            };
            return success('等待【猛进】决定。');
          }
          return continueShaDodgeAfterSkills(game, actor, card, amount, targetActor);
        }
        return settleShaHit(game, actor, card, amount, targetActor);
      }

      // v15 T: 闪避分支的剩余流程 (青龙续杀 + 收尾) — 猛进 ask 挂起后由
      // resolver 重入本函数, 时序与同步路径一致。
      function continueShaDodgeAfterSkills(game, actor, card, amount, targetActor) {
        var self = game[actor];
        {
          // v13 审计三轮: 青龙偃月刀 — (a) "你可以"可选效果, 补 decline 偏好
          // (缺省 auto 发动, 沿用朱雀/银月惯例); (b) 续杀锁定为"相同的目标"
          // (官方 card__equipment.md — 此前无显式目标, 多席下 defaultHostileTarget
          // 可能改指他人); (c) 续杀被 playSha 拒绝 (目标保护等边界) 时退回
          // 手牌, 不再让实体牌滞留在途 (守恒)。
          if (hasEquipmentEffect(self, 'qinglongChase')
              && !(self.skillPreferences && self.skillPreferences.qinglong === 'decline')) {
            var follow = removeFirstCardOfType(self, 'sha');
            var followPhysicals = null;
            if (!follow) {
              // audit4-L1: 无物理杀时经 onCardAs 找可当杀的转化 (龙胆闪/武圣
              // 红牌…) — 官方"对其使用【杀】"含一切合法视为手段, 与主动出杀/
              // 响应杀路径一致 (此前只扫物理杀, 赵云龙胆追杀不可达)。
              var chaseAsResults = SkillRuntime.runHook(skillRegistry, 'onCardAs', {
                game: game, actor: actor, state: self, asType: 'sha', mode: 'response'
              });
              // 评审收口: 选优复用 selectCardAsConversion (与主动/响应转化
              // 同一裁决); 取牌走 removeOwnCardFromAnyZone — 武圣的转化候选
              // 可来自装备区 (firstMatchingOwnCard), 只扫手牌会静默漏掉,
              // 装备来源顺带走统一失去时机。
              var chaseBest = selectCardAsConversion(chaseAsResults);
              var chasePhysical = chaseBest && removeOwnCardFromAnyZone(self, chaseBest.card.id, game);
              if (chasePhysical) {
                discardCard(game, chasePhysical);
                log(game, actorName(game, actor) + '发动【' + (chaseBest.skillName || '转化')
                  + '】，将【' + chasePhysical.name + '】当【杀】用于续杀。');
                followPhysicals = [chasePhysical];
                follow = CardRuntime.makeTestCard('sha', {
                  id: 'qinglong-as-' + chasePhysical.id,
                  suit: chasePhysical.suit, rank: chasePhysical.rank,
                  color: chasePhysical.color, name: '杀',
                  virtual: true, physicalCards: followPhysicals
                });
              }
            }
            if (follow) {
              log(game, actorName(game, actor) + '发动【青龙偃月刀】，继续对' + actorName(game, targetActor) + '使用一张【杀】。');
              settleShaCardAfterOutcome(game, card);
              var chaseResult = playSha(game, actor, follow, { target: targetActor, skipShaCount: true });
              if (chaseResult && chaseResult.ok) return chaseResult;
              // 回滚: 转化杀退回组成实体 (已入弃牌堆), 物理杀原样退回。
              if (followPhysicals) {
                followPhysicals.forEach(function (pc) {
                  moveCard(game, pc, { zone: 'discard' }, { zone: 'hand', actor: actor });
                });
              } else {
                putCard(game, follow, { zone: 'hand', actor: actor });
              }
              log(game, '【青龙偃月刀】续杀不合法，收回所用之牌。');
              return success('目标闪避。');
            }
          }
          log(game, actorName(game, targetActor) + '闪避成功，没有受到伤害。');
          settleShaCardAfterOutcome(game, card);
          return success('目标闪避。');
        }
      }

      // v15 T: 命中分支 (原 resolveShaAfterResponse 的落点段, 函数体逐行
      // 不变 — 仅为闪避分支抽出续跑入口而拆分)。
      function settleShaHit(game, actor, card, amount, targetActor) {
        var target = game[targetActor];
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
          if (hasShanResponseAvailable(game.player)
              || (deps.guhuoResponsePossible && deps.guhuoResponsePossible(game, 'player'))) {
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
      // v15 T: 猛进 ask 挂起后的闪避分支续跑入口 (skills 域经包装回调)
      continueShaDodgeAfterSkills: continueShaDodgeAfterSkills,
      resolveGuanshiDiscardChoice: resolveGuanshiDiscardChoice,
      applyGuanshiForcedHit: applyGuanshiForcedHit,
      defaultHostileTarget: defaultHostileTarget,
      normalizeSingleTarget: normalizeSingleTarget,
      // v14 P1/P2/P3: 多目标链驱动 + 方天前置查询 + 流离 resolver
      advanceShaChain: advanceShaChain,
      shaExtraTargetLimit: shaExtraTargetLimit,
      fangtianShaEligible: fangtianShaEligible,
      // v15 T 评审收口: 转化杀多目标前置检查复用同一算式 (game-engine)
      tianyiExtraTargets: tianyiExtraTargets,
      resolveLiuliTransferChoice: resolveLiuliTransferChoice
    };
  }
