  // v11 B1: AI 域模块 — 从 game-engine.js 整体迁出的评估/lookahead/回合驱动。
  // 引擎闭包能力 (出牌/技能/阶段推进等) 通过 createAIRuntime(deps) 依赖注入;
  // 纯只读助手直接取自 runtime seam 模块。函数体与迁出前逐行一致 (v8 PR-D1~D4)。
  import { Runtime } from './runtime.js';
  import { CardRuntime } from './card-runtime.js';
  import { StateRuntime } from './state.js';

  var makeRng = Runtime.makeRng;
  var isShaType = CardRuntime.isShaType;
  var hasSkill = StateRuntime.hasSkill;
  var opponent = StateRuntime.opponent;
  var canUseUnlimitedSha = StateRuntime.canUseUnlimitedSha;
  var hasEquipmentEffect = StateRuntime.hasEquipmentEffect;
  var handLimit = StateRuntime.handLimit;

  export function createAIRuntime(deps) {
    var success = deps.success;
    var fail = deps.fail;
    var playCard = deps.playCard;
    var playCardAs = deps.playCardAs;
    var canPlayCard = deps.canPlayCard;
    var canPlayCardAs = deps.canPlayCardAs;
    var useSkill = deps.useSkill;
    var startTurn = deps.startTurn;
    var endTurn = deps.endTurn;
    var advancePhase = deps.advancePhase;
    var finishPlayPhase = deps.finishPlayPhase;
    var discardSelected = deps.discardSelected;
    var needsDiscard = deps.needsDiscard;
    var getDiscardCount = deps.getDiscardCount;
    // v12 H5: 座席级合法目标矩阵 (出杀目标挑选)
    var legalTargetsForCard = deps.legalTargetsForCard;
    var getHuogongChoice = deps.getHuogongChoice;
    // v14 P2: 方天画戟额外目标前置查询
    var shaExtraTargetLimit = deps.shaExtraTargetLimit;
    // v11 C5 (批次 29): 锦囊类转化候选枚举 (与 UI 转化面板同源)
    var listCardConversions = deps.listCardConversions;

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
      if (hasEquipmentEffect(state, 'zhangbaTwoHandSha')
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

    // ═════ v12 I: AI profile — 'v12' (缺省, 本阶段新启发) / 'v11' (冻结旧
    // 路径, 供基准对弈与回退)。座席级 state.aiProfile 优先, 全局 game.aiProfile
    // 兜底。验收基准 (tests/v12_i_benchmark) 让两个 profile 同场对弈。═════
    function aiProfileOf(g, actor) {
      var st = g && g[actor];
      return (st && st.aiProfile) || (g && g.aiProfile) || 'v12';
    }

    // 特性门: v11 profile 全关; v12 可经 state.aiFeatureOff / game.aiFeatureOff
    // (数组) 逐项关闭 — 消融实验与线上回退用, 正常对局不设。特性名:
    //   'honestCount'  I2 诚实计数 (关闭回退全知直读)
    //   'lookahead2'   I1 两步精化
    //   'killPressure' 处决线/酒连招/压血线评估
    //   'discardHold'  弃牌保留值
    //   'multiTarget'  I3 多候选目标评分
    function aiFeatureOn(g, actor, feature) {
      if (aiProfileOf(g, actor) === 'v11') return false;
      var st = g && g[actor];
      var off = (st && st.aiFeatureOff) || (g && g.aiFeatureOff);
      return !(off && off.indexOf(feature) >= 0);
    }

    // ═════ v12 I2: 可见信息计数建模 ═════
    // 旧实现对"对手"的杀/闪估计直接读其暗置手牌 (全知作弊)。诚实模型:
    //   - 牌堆构成是公开信息 (全场牌型总量恒定, 由牌守恒断言背书);
    //   - 弃牌堆/所有装备区/判定区/"创" 公开可见; 自己手牌己方全知;
    //   - 未知池 = 牌堆 + 其他座席手牌 (viewer 视角);
    //   - 对手手牌的牌型期望 = 其手牌数 × 未知池中该牌型占比 (+ 转化技系数)。
    // 每次询问全量普查 (~150 张遍历, 无缓存 — 避免克隆携带陈旧缓存)。
    function aiNewCounts() {
      return { sha: 0, shan: 0, tao: 0, wuxie: 0, black: 0, red: 0, shaRed: 0, shanBlack: 0, total: 0 };
    }

    function aiCountInto(counts, card) {
      if (!card) return;
      if (isShaType(card.type)) {
        counts.sha += 1;
        if (card.color === 'red') counts.shaRed += 1;
      } else if (card.type === 'shan') {
        counts.shan += 1;
        if (card.color === 'black') counts.shanBlack += 1;
      } else if (card.type === 'tao') counts.tao += 1;
      else if (card.type === 'wuxie') counts.wuxie += 1;
      if (card.color === 'black') counts.black += 1;
      else if (card.color === 'red') counts.red += 1;
      counts.total += 1;
    }

    function aiSeatZonesEach(g, seat, includeHand, fn) {
      var st = g[seat];
      if (!st) return;
      if (includeHand) (st.hand || []).forEach(fn);
      ['weapon', 'armor', 'horsePlus', 'horseMinus'].forEach(function (slot) {
        if (st.equipment && st.equipment[slot]) fn(st.equipment[slot]);
      });
      (st.judgeArea || []).forEach(fn);
      (st.chuang || []).forEach(fn);
    }

    // viewer 视角的未知池计数: 全场总量 − 可见量。在途牌 (pauseState) 两边
    // 都不计, 差值一致 (期望占比偏差可忽略)。
    function aiUnknownCounts(g, viewer) {
      var totals = aiNewCounts();
      var visible = aiNewCounts();
      (g.deck || []).forEach(function (c) { aiCountInto(totals, c); });
      (g.discard || []).forEach(function (c) { aiCountInto(totals, c); aiCountInto(visible, c); });
      StateRuntime.seatList(g).forEach(function (seat) {
        aiSeatZonesEach(g, seat, true, function (c) { aiCountInto(totals, c); });
        aiSeatZonesEach(g, seat, seat === viewer, function (c) { aiCountInto(visible, c); });
      });
      var out = aiNewCounts();
      Object.keys(out).forEach(function (k) { out[k] = Math.max(0, totals[k] - visible[k]); });
      return out;
    }

    // 对 subject 座席的【杀】持有量估计 (viewer 视角, 返回浮点期望):
    // subject === viewer → 精确 (旧实现); 否则按未知池占比 × 手牌数,
    // 武圣 (红非杀)/龙胆 (闪) 转化按对应池占比折算, 丈八按余牌对半折算。
    function aiEstimateShaCountFor(g, viewer, subject) {
      var st = g[subject];
      if (!st) return 0;
      if (subject === viewer) return aiEstimateShaCount(st);
      // 响应空窗: 该座席在本窗口内拿不出杀 (含全部转化路径) 已被公开证明
      if (st.aiRevealed && st.aiRevealed.sha) return 0;
      var unknown = aiUnknownCounts(g, viewer);
      var hand = (st.hand || []).length;
      if (unknown.total <= 0 || hand <= 0) {
        // 无未知牌 → 只剩公开装备的转化面 (武圣红装备)
        return aiWushengEquipShaCount(st);
      }
      var perCard = unknown.sha / unknown.total;
      if (hasSkill(st, 'wusheng')) perCard += Math.max(0, unknown.red - unknown.shaRed) / unknown.total;
      if (hasSkill(st, 'longdan')) perCard += unknown.shan / unknown.total;
      var estimate = hand * Math.min(1, perCard) + aiWushengEquipShaCount(st);
      if (hasEquipmentEffect(st, 'zhangbaTwoHandSha') && hand >= 2) {
        estimate += Math.floor(Math.max(0, hand - estimate) / 2);
      }
      return estimate;
    }

    function aiWushengEquipShaCount(st) {
      if (!hasSkill(st, 'wusheng')) return 0;
      var count = 0;
      ['weapon', 'armor', 'horsePlus', 'horseMinus'].forEach(function (slot) {
        var eq = st.equipment && st.equipment[slot];
        if (eq && eq.color === 'red') count += 1;
      });
      return count;
    }

    // 对 subject 座席的【闪】持有量估计 — 龙胆 (杀)/倾国 (黑非闪) 转化折算。
    function aiEstimateShanCountFor(g, viewer, subject) {
      var st = g[subject];
      if (!st) return 0;
      if (subject === viewer) return aiEstimateShanCount(st);
      // 响应空窗: 该座席在本窗口内拿不出闪 (含全部转化路径) 已被公开证明
      if (st.aiRevealed && st.aiRevealed.shan) return 0;
      var unknown = aiUnknownCounts(g, viewer);
      var hand = (st.hand || []).length;
      if (unknown.total <= 0 || hand <= 0) return 0;
      var perCard = unknown.shan / unknown.total;
      if (hasSkill(st, 'longdan')) perCard += unknown.sha / unknown.total;
      if (hasSkill(st, 'qingguo')) perCard += Math.max(0, unknown.black - unknown.shanBlack) / unknown.total;
      return hand * Math.min(1, perCard);
    }

    // 对 subject 座席的【桃】持有量估计 (收割判断: 自救余量)。
    function aiEstimateTaoCountFor(g, viewer, subject) {
      var st = g[subject];
      if (!st) return 0;
      if (subject === viewer) {
        return (st.hand || []).filter(function (c) { return c.type === 'tao'; }).length;
      }
      var unknown = aiUnknownCounts(g, viewer);
      var hand = (st.hand || []).length;
      if (unknown.total <= 0 || hand <= 0) return 0;
      return hand * (unknown.tao / unknown.total);
    }

    // 按 viewer 的 profile 路由对 seat 的估计: v11 → 全知直读 (冻结旧行为);
    // v12 → 诚实计数。viewer === seat 时两者相同 (读自己)。
    function aiFoeEstimate(g, viewer, seat, kind) {
      if (!aiFeatureOn(g, viewer, 'honestCount')) {
        if (kind === 'sha') return aiEstimateShaCount(g[seat]);
        if (kind === 'shan') return aiEstimateShanCount(g[seat]);
        return (g[seat] && (g[seat].hand || []).filter(function (c) { return c.type === 'tao'; }).length) || 0;
      }
      if (kind === 'sha') return aiEstimateShaCountFor(g, viewer, seat);
      if (kind === 'shan') return aiEstimateShanCountFor(g, viewer, seat);
      return aiEstimateTaoCountFor(g, viewer, seat);
    }

    // v11 D1 (批次 33): 无懈期望值评估 — 替代"有无懈就自动用"。
    // 只对链的第一张无懈 (chain.wuxied=false) 做取舍; 反无懈 (夺回自己锦囊
    // 的结算权) 保持既有行为。skillPreferences.wuxiePolicy='always' 回退旧
    // 行为。规则按锦囊威胁度:
    //   南蛮/万箭  — 有对应响应牌或血线安全 (hp>2) 时吃 1 伤保无懈
    //   火攻      — 期望伤害 <1 (需同花色), 血线安全时保留
    //   决斗      — 杀数占优且血线安全时应战, 否则无懈
    //   拆/顺     — 有装备要护 或 手牌拮据 (<=2) 时才无懈
    //   乐/兵粮   — 乐: 手牌有阵容才护回合; 兵粮: 手牌拮据才护摸牌
    //   闪电      — v14 Q1: 归属者 hp<=3 才消 (1/4 命中 × 3 伤的期望面)
    //   无中      — v14 Q1: denial 高价值恒消, 仅自身濒危且手牌枯竭保留
    //   借刀      — v14 Q1: 受害者自己/危急友方必消, 仅持刀友方受累看手牌
    //   桃园/五谷 — v14 Q1: 受益席血线 <=2 / 奖池有桃或无中才拦截
    // v12 H5: 无懈立场 — 该锦囊当前净状态下"将结算的效果"落在谁身上, 决定
    // responder 是否有动机抵消。受害型锦囊: 结算伤友方 → 想无懈; 受益型
    // (无中/桃园/五谷): 结算利敌方 → 想无懈。wuxied=true 时净状态反转
    // (打出无懈会恢复结算)。1v1 双席下与旧行为逐步一致 (受害者想消、
    // 来源反消), 多席下阻止 AI 抵消友方的锦囊/增益。
    function aiWuxieStance(game, responder, chain) {
      var ctx = chain.ctx || {};
      var trick = chain.trickName;
      var beneficial = null; // 受益座席 (增益型)
      var victim = null;     // 受害座席 (打击型)
      if (trick === 'wuzhong') beneficial = ctx.wzTargetActor || ctx.actor;
      else if (trick === 'taoyuan-target') beneficial = ctx.targets && ctx.targets[ctx.idx];
      else if (trick === 'wugu-target') beneficial = ctx.order && ctx.order[ctx.idx];
      // v13 J0-2: 延时锦囊无懈窗口移至判定阶段生效前 — 受害者即判定区
      // 归属者 (含闪电, 落点此刻已确定, 不再"漂移")。
      else if (trick === 'delayed-judge') victim = ctx.ownerActor;
      // v13 审计三轮: 南蛮/万箭逐目标窗口 — 受害者 = 当前结算座席。
      else if (trick === 'aoe-target') victim = ctx.order && ctx.order[ctx.idx];
      // v13 审计三轮: 铁索使用分支逐目标窗口 — 受害者 = 当前目标座席。
      else if (trick === 'tiesuo-target') victim = ctx.targets && ctx.targets[ctx.idx];
      // v14 Q1: 借刀立场按真实受害面精确建模 (M4 信息性记录裁决落地) —
      // 持刀者 An (被迫出杀/失武器) 与 受害者 Bn (挨杀) 皆是受害面; 任一为
      // 自己/友方即有动机抵消 (此前 ctx.targetActor 兜底只近似到持刀者)。
      // 评审收口: 使用者本人恒支持自己的借刀结算 (1v1 引擎缺省受害者 =
      // 使用者本人, 自愿承担的受害面不构成抵消动机, 否则使用者会拒绝
      // 反无懈自己刚打出的借刀); 同理该自担面对第三方立场也不计。
      else if (trick === 'jiedao') {
        if (ctx.actor && responder === ctx.actor) return chain.wuxied === true;
        var jdHolder = ctx.targetActor;
        var jdVictim = ctx.victimActor === ctx.actor ? null : ctx.victimActor;
        var jdTouchesFriendly = (jdHolder && (jdHolder === responder
          || !StateRuntime.perceivedHostile(game, responder, jdHolder)))
          || (jdVictim && game[jdVictim] && (jdVictim === responder
          || !StateRuntime.perceivedHostile(game, responder, jdVictim)));
        return chain.wuxied ? !jdTouchesFriendly : jdTouchesFriendly;
      }
      else victim = ctx.targetActor || ctx.delayedSide || (ctx.actor ? opponent(ctx.actor) : null);
      var interested;
      // v13 M2: 立场判断走感知路由 (明置恒等直读; 暗置按已翻明/推断)。
      if (beneficial) {
        interested = StateRuntime.perceivedHostile(game, responder, beneficial); // 敌方受益 → 想消
      } else if (victim) {
        interested = victim === responder || !StateRuntime.perceivedHostile(game, responder, victim); // 友方受害 → 想消
      } else if (ctx.actor && game[ctx.actor]) {
        // v14 Q1: 未建模兜底改真推导 (此前恒 interested) — 无受害/受益面
        // 可判时, 按出牌者立场: 敌方使用的锦囊才有抵消动机。
        interested = StateRuntime.perceivedHostile(game, responder, ctx.actor);
      } else {
        interested = true; // 双兜底 (无 actor 信息) → 保守保留旧行为
      }
      // 净抵消态下动机反转: 想消的人已如愿 (不再出), 不想消的人想反无懈。
      return chain.wuxied ? !interested : interested;
    }

    function aiShouldUseWuxie(game, responder, chain) {
      if (!game || !chain) return true;
      var self = game[responder];
      if (!self) return true;
      // v13 张角三修: 立场过滤须先于 'always' 早退。延时锦囊判定改为"无使用者"
      // (actor:null) 后, 放置者也进入无懈队列 (不再被 skip=ctx.actor 硬剔除);
      // 若 'always' 先于立场过滤返回, AI 放置者会无条件取消自己打给敌方的延时
      // 锦囊 (自耗)。立场不符 (消己方增益 / 放置者消己方延时锦囊) 恒不出, 与任何
      // wuxiePolicy 无关; 受害者为自身/友方的场景 (如南蛮打到自己) 立场恒成立,
      // 'always' 回退旧行为不受影响。
      if (!aiWuxieStance(game, responder, chain)) return false; // v12 H5: 立场不符不出
      if (self.skillPreferences && self.skillPreferences.wuxiePolicy === 'always') return true;
      if (chain.wuxied) return true; // 反无懈: 保卫己方已投入的锦囊
      var opp = game[opponent(responder)];
      var trick = chain.trickName;
      var handCount = (self.hand || []).length;
      var equipCount = ['weapon', 'armor', 'horsePlus', 'horseMinus'].filter(function (slot) {
        return self.equipment && self.equipment[slot];
      }).length;
      // v13 审计三轮: 南蛮/万箭逐目标窗口 ('aoe-target') — 受害者是自己时
      // 沿用旧 EV 规则 (有响应牌或血线安全则吃 1 伤保无懈); 受害者是友方
      // 时保持恒用 (保护立场已由 aiWuxieStance 过滤)。
      if (trick === 'aoe-target') {
        var aoeVictim = chain.ctx && chain.ctx.order && chain.ctx.order[chain.ctx.idx];
        if (aoeVictim !== responder) return true;
        if (chain.ctx.responseType === 'sha') return aiEstimateShaCount(self) === 0 && self.hp <= 2;
        return aiEstimateShanCount(self) === 0 && self.hp <= 2;
      }
      // v13 审计三轮: 铁索使用分支 — 仅在自己将被横置且血线告急时消耗无懈。
      if (trick === 'tiesuo-target') {
        var tsVictim = chain.ctx && chain.ctx.targets && chain.ctx.targets[chain.ctx.idx];
        var tsState = tsVictim && game[tsVictim];
        return !!(tsState && !tsState.chained && tsState.hp <= 2);
      }
      if (trick === 'huogong') return self.hp <= 2;
      if (trick === 'juedou') {
        if (self.hp <= 2) return true;
        // v12 I2: 对手杀数按 profile 路由 (v12 诚实估计 / v11 全知直读)
        return aiEstimateShaCount(self) <= aiFoeEstimate(game, responder, opponent(responder), 'sha');
      }
      if (trick === 'guohe' || trick === 'shunshou') {
        return equipCount > 0 || handCount <= 2;
      }
      if (trick === 'delayed-judge') {
        // v13 J0-2: 判定前时点 — 威胁度启发不变 (乐: 手牌有阵容才护回合;
        // 兵粮: 手牌拮据才护摸牌)。
        var judgedType = chain.ctx && chain.ctx.trickType;
        if (judgedType === 'lebusishu') return handCount >= 2;
        if (judgedType === 'bingliang') return handCount <= 2;
        // v14 Q1: 闪电从恒取消改期望值 — 黑桃 2-9 命中率 1/4 × 3 点雷伤:
        // 归属者血线脆弱 (hp<=3, 命中即濒死/致死) 才值得消耗无懈; 血厚
        // 席位保留无懈应对必中型威胁 (决斗/AOE)。
        var dlOwner = chain.ctx && chain.ctx.ownerActor;
        var dlOwnerState = dlOwner && game[dlOwner];
        return !(dlOwnerState && dlOwnerState.hp > 3);
      }
      // v14 Q1: 恒用五类改期望值建模 ───────────────────────────────
      if (trick === 'wuzhong') {
        // 无中 denial 高价值 (1 无懈换敌 2 摸) — 仅自身濒危且手牌枯竭时
        // 留无懈应对致命锦囊。
        return !(self.hp <= 2 && handCount <= 1);
      }
      if (trick === 'jiedao') {
        // 受害者是自己 / 危急友方 → 必消; 仅持刀友方受累 (失武器或被迫
        // 出杀) → 手头宽裕才消耗。
        var jdV = chain.ctx && chain.ctx.victimActor;
        var jdVState = jdV && game[jdV];
        if (jdV === responder) return true;
        if (jdVState && jdVState.hp > 0
            && !StateRuntime.perceivedHostile(game, responder, jdV) && jdVState.hp <= 2) return true;
        return handCount >= 2;
      }
      if (trick === 'taoyuan-target') {
        // 桃园 denial: 只在敌方受益席回血有实质战果 (血线 <=2, 拦截等效
        // 濒死救援) 时消耗; 满编敌方回 1 血不值一张无懈。
        var tyBeneficiary = chain.ctx && chain.ctx.targets && chain.ctx.targets[chain.ctx.idx];
        var tyState = tyBeneficiary && game[tyBeneficiary];
        return !!(tyState && tyState.hp <= 2);
      }
      if (trick === 'wugu-target') {
        // 五谷 denial: 1 无懈换敌 1 摸恒亏 — 仅奖池仍有高价值牌 (桃/无中,
        // 公开信息) 时拦截敌方拿取。
        var wgPool = chain.ctx && chain.ctx.pool;
        return !!(wgPool && wgPool.some(function (poolCard) {
          return poolCard && (poolCard.type === 'tao' || poolCard.type === 'wuzhong');
        }));
      }
      return true; // 其余未建模窗口 → 保守保留旧行为
    }

    // ═════ v12 I3: 多人目标评估 — 敌意记账 + 集火/收割/胜负手 ═════
    // 敌意分: aggressionLog (damage() 纯遥测记账) 中 seat 对 viewer 阵营
    // 造成的累计伤害。开放身份下作平分决胜与"谁在集火我方"信号; 为 v13
    // 暗身份推断预留同一数据面。
    function aiHostilityToward(g, viewer, seat) {
      var ledger = g.aggressionLog || [];
      var total = 0;
      for (var i = 0; i < ledger.length; i += 1) {
        var entry = ledger[i];
        if (entry.source !== seat) continue;
        // v13 M2: "打到我方"按感知阵营判 (暗置下用已翻明/推断信息)。
        if (entry.target === viewer || !StateRuntime.perceivedHostile(g, viewer, entry.target)) {
          total += entry.amount || 0;
        }
      }
      return total;
    }

    // 敌对候选中挑目标: 反贼打主公是胜负手; 低血可收割 (兼看其桃/闪余量
    // 估计); 击杀反贼有摸三奖励; 敌意记账高者优先。单候选 / v11 profile
    // 保持旧行为 (对手优先) — 1v1 恒单候选, 目标选择零变化。
    function aiPickHostileTarget(g, actor, candidates) {
      if (!candidates.length) return null;
      if (candidates.length === 1) return candidates[0];
      if (!aiFeatureOn(g, actor, 'multiTarget')) {
        return candidates.indexOf(opponent(actor)) >= 0 ? opponent(actor) : candidates[0];
      }
      var roles = g.roles || {};
      var mySide = StateRuntime.sideOf(g, actor); // 自己身份自知 (暗置下亦合法)
      // v13 M3: 内奸骑墙初版 — 按感知阵营聚合两侧战力, 优先打压强势侧
      // (血线/资源均衡, 接 K4 记录的"全敌对无骑墙"简化)。明置下感知 =
      // 真值, 骑墙在开放身份场同样生效。
      var renegadeLean = null;
      // v14 Q2: 内奸高阶博弈所需的局面量 (m3 冻结基线只用 renegadeLean)。
      var renegadeV14 = false;
      var renegadeLordSeat = null;
      var renegadeRebelsMaybe = false;
      if (mySide === 'renegade') {
        var lordSum = 0;
        var rebelSum = 0;
        StateRuntime.aliveSeats(g).forEach(function (seat) {
          if (seat === actor) return;
          if (roles[seat] === '主公') renegadeLordSeat = seat; // 主公身份恒公开
          var perceived = StateRuntime.perceivedSideOf(g, actor, seat);
          if (perceived === 'lordSide') lordSum += aiSeatScore(g, seat);
          else if (perceived === 'rebelSide') { rebelSum += aiSeatScore(g, seat); renegadeRebelsMaybe = true; }
          // 评审收口: 暗置未知席位 (perceived=null) 视作"反贼可能仍在" —
          // 否则暗身份局开局零证据即误入收割模式 (+40 见人就打)。明置局
          // 感知恒非 null, 此分支不改变既有行为与 Q2 基准。
          else if (!perceived && roles[seat] !== '主公') renegadeRebelsMaybe = true;
        });
        if (lordSum !== rebelSum) renegadeLean = lordSum > rebelSum ? 'lordSide' : 'rebelSide';
        renegadeV14 = !(g[actor] && g[actor].aiRenegadeProfile === 'm3');
      }
      var best = null;
      candidates.forEach(function (seat) {
        var st = g[seat];
        if (!st) return;
        var score = 0;
        // 主公身份恒公开 (官方: 除主公外暗置), 直读合法。
        if (mySide === 'rebelSide' && roles[seat] === '主公') score += 50; // 主公倒下即反贼胜
        if (st.hp <= 1) score += 30;
        else if (st.hp === 2) score += 12;
        // v13 M2: 击杀反贼奖励 — 已翻明反贼直读 (+8 旧口径); 暗置未翻明
        // 但推断为反贼 → 折半 (+4, 信念非事实)。明置恒走直读分支零回归。
        if (StateRuntime.isRoleRevealed(g, seat) && roles[seat] === '反贼') score += 8; // 击杀反贼摸三张
        else if (g.hiddenRoles && StateRuntime.perceivedSideOf(g, actor, seat) === 'rebelSide') score += 4;
        // v13 M3: 内奸打压强势侧 (v14 Q2 保留为拆家平衡项)。
        if (renegadeLean && StateRuntime.perceivedSideOf(g, actor, seat) === renegadeLean) score += 15;
        // v14 Q2: 内奸高阶博弈 — 装忠节奏 + 拆家时机 + 终局收割序
        // (aiRenegadeProfile='m3' 冻结回 M3 单一骑墙, 供基准对照)。
        // 胜路约束: 主公亡时须仅剩内奸 → 其他人未清场前主公恒不可杀。
        if (mySide === 'renegade' && renegadeV14) {
          if (roles[seat] === '主公') {
            // 终局单挑 (othersAlive===0) 恒单候选, 已在函数头短路弑主 —
            // 此处只需未清场前的压制 (评审收口: 原 +60 分支不可达, 删除)。
            score += renegadeRebelsMaybe ? -25 : -40;          // 装忠期回避 / 收割期严防误杀
          } else if (!renegadeRebelsMaybe) {
            score += 40;                                       // 反贼确认已清 → 收割忠臣
          } else if (StateRuntime.perceivedSideOf(g, actor, seat) === 'rebelSide') {
            score += 10;                                       // 装忠: 打反贼立信 + 击杀奖励
            if (renegadeLordSeat && g[renegadeLordSeat]
                && g[renegadeLordSeat].hp <= 2) score += 25;   // 拆家阈值: 主公濒危先保主
          }
        }
        score -= aiEstimateShanCountFor(g, actor, seat) * 8;
        score -= aiEstimateTaoCountFor(g, actor, seat) * 6;
        score += Math.min(20, aiHostilityToward(g, actor, seat) * 4);
        if (seat === opponent(actor)) score += 1; // 平分沿用旧偏好
        if (!best || score > best.score) best = { seat: seat, score: score };
      });
      return best ? best.seat : candidates[0];
    }

    // v12 H5: AI 启发式评估的"对手"从 opponent() 二元假设改为阵营敌对
    // 主目标。v12 I3: 多候选按目标评分挑选 (1v1 恒为对手)。
    function aiPrimaryFoe(game, actor) {
      // v13 M2: 感知敌对路由 (明置恒等 hostileSeats)。
      // audit4 收口: 兜底不再落死板 opponent() 槽位 — 多席下该座席可能已亡,
      // useSkill/playSha 的存活校验会如实拒绝 (此前靠 H2/M1 漏洞"成功"打在
      // 尸体上), AI 不递交亡者目标。
      var candidates = StateRuntime.perceivedHostileSeats(game, actor);
      var aliveOthers = StateRuntime.aliveSeats(game).filter(function (s) { return s !== actor; });
      if (!candidates.length) candidates = aliveOthers;
      var picked = aiPickHostileTarget(game, actor, candidates);
      if (picked && game[picked] && game[picked].hp > 0) return picked;
      return aliveOthers.indexOf(opponent(actor)) >= 0 ? opponent(actor) : aliveOthers[0];
    }

    // v12 H5: AI 单目标牌的目标座席 — 合法目标矩阵 ∩ 敌对座席 (1v1 恒为
    // 对手)。canPlayCard 的 ∃-目标语义包含友方座席 (玩家可显式指定), AI
    // 必须另行确认存在"可达且敌对"的目标; 与引擎 resolveTrickTargetActor
    // 的缺省池同构, 供出杀候选门与火攻预览/出牌保持同一目标。
    // v12 I3: 多候选按目标评分挑选 (集火/收割/胜负手)。
    function aiShaTargetSeat(game, actor, card) {
      if (!legalTargetsForCard) return opponent(actor);
      // v13 M2: 感知敌对路由 (明置恒等直读)。
      var candidates = legalTargetsForCard(game, actor, card).filter(function (seat) {
        return StateRuntime.perceivedHostile(game, actor, seat);
      });
      return aiPickHostileTarget(game, actor, candidates);
    }

    // v8 PR-D1: 出牌/锦囊 score 精细化。对 桃 / 杀 / 决斗 / 锦囊 都按
    // 双方资源 + 自身受伤情况 给梯度分数, 替代原 v6 的 binary heuristic.
    // v12 I: 拆为 raw 分 + 血线状态调整层 — 自身危险区 (hp<=2) 而对手血线
    // 安全时收敛进攻 (对攻被反打即濒死, 实证败局的主要模式); 双方都进斩杀
    // 区间时保持先手进攻。
    var AI_AGGRESSIVE_TRICKS = ['juedou', 'nanman', 'wanjian', 'huogong', 'jiedao'];

    function scoreCardForAI(game, actor, card) {
      var base = aiScoreCardRaw(game, actor, card);
      if (!aiFeatureOn(game, actor, 'killPressure')) return base;
      var self = game[actor];
      var target = game[aiPrimaryFoe(game, actor)];
      var aggressive = isShaType(card.type) || AI_AGGRESSIVE_TRICKS.indexOf(card.type) >= 0;
      if (aggressive && self.hp <= 2 && target && target.hp >= 3) return base - 30;
      return base;
    }

    function aiScoreCardRaw(game, actor, card) {
      var self = game[actor];
      var foeSeat = aiPrimaryFoe(game, actor);
      var target = game[foeSeat];

      // 桃: hp 缺口梯度。critical (hp=1) > 多伤 > 轻伤; 满血给负分阻止 AI 用。
      // v12 I: 轻伤 (缺口 1 且血线安全) 不吃桃 — 桃是濒死窗口硬通货,
      // 平时慢回不如留作救命/抬处决期血线。
      if (card.type === 'tao') {
        if (self.hp >= self.maxHp) return -100;
        if (self.hp === 1) return 200;
        var deficit = self.maxHp - self.hp;
        if (deficit >= 2) return 120;
        if (aiFeatureOn(game, actor, 'killPressure') && self.hp >= 3) return 25;
        return 80;
      }

      // 无中生有: 永远值钱 (1 张换 2 张)
      if (card.type === 'wuzhong') return 90;

      // 酒: 仅当持手中有可用杀且本回合未出过杀 → buff 杀; 否则浪费。
      // v12 I1: 酒+杀 可致死目标 (hp<=2) → 处决连招优先级抬高。
      if (card.type === 'jiu') {
        var hasShaToBoost = StateRuntime.shaUseAllowed(self)
          && self.hand.some(function (c) { return isShaType(c.type); });
        if (!hasShaToBoost) return -10;
        if (aiFeatureOn(game, actor, 'killPressure') && target && target.hp <= 2
            && aiFoeEstimate(game, actor, foeSeat, 'shan') < 1) {
          return 140;
        }
        return 82;
      }

      // 杀: 看目标可响应闪数量 (含 longdan/qingguo 转化); 0 闪 → 高分, 多闪 → 低。
      // v12 I2: 对手闪数按 profile 路由 (v12 诚实估计返回浮点期望, 阈值改
      // 半开区间 — 对整数输入与旧 ===0/===1 判定逐值一致)。
      // v12 I1: 处决线 — 目标命悬 (含酒 buff 可致死) 且闪面稀薄 → 最高优先。
      if (isShaType(card.type)) {
        // 评审收口 [中]: 与引擎闸门同口径 (shaUseAllowed) — 否则天义赢后
        // 引擎放行第二张杀而 AI 评分恒 -100, 额外次数永远用不上。
        if (!StateRuntime.shaUseAllowed(self)) return -100;
        var targetShans = aiFoeEstimate(game, actor, foeSeat, 'shan');
        if (aiFeatureOn(game, actor, 'killPressure')) {
          var killReach = 1 + (self.shaBonus || 0);
          if (target && target.hp <= killReach && targetShans < 1) return 150;
        }
        if (targetShans < 0.5) return 85;
        if (targetShans < 1.5) return 60;
        return 35;
      }

      // 决斗: 估算双方"互响应杀"链。我方杀数 (精确) vs 对方杀数 (估计)。
      // 浮点估计下"持平"取 ±0.5 带宽 (整数输入时与旧 >/===/< 三分逐值一致)。
      if (card.type === 'juedou') {
        var ourSha = aiEstimateShaCount(self);
        var theirSha = aiFoeEstimate(game, actor, foeSeat, 'sha');
        if (ourSha > theirSha + 0.5) return 75;
        if (ourSha >= theirSha - 0.5) return 40;
        return 10;
      }

      // 南蛮: 对方无杀响应 → 1 dmg, 否则等于浪费 (chip 评分降低)
      if (card.type === 'nanman') {
        return aiFoeEstimate(game, actor, foeSeat, 'sha') < 0.5 ? 80 : 30;
      }

      // 万箭: 对方无闪响应 → 1 dmg
      if (card.type === 'wanjian') {
        return aiFoeEstimate(game, actor, foeSeat, 'shan') < 0.5 ? 80 : 30;
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
      // v12 I: 闪电挂入自己判定区, 自己下回合先判 (黑桃 2-9 约 23% 吃 3 伤)
      // — 期望值为负的自残轮盘, 不主动使用; 例外: 红颜 (小乔) 黑桃视为
      // 红桃 → 闪电对自己必不命中, 挂出去零风险纯威胁。
      if (card.type === 'shandian' && aiFeatureOn(game, actor, 'killPressure')
          && !hasSkill(self, 'hongyan')) {
        return -30;
      }
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

    // 单座席资源分 (多席评估的构件): hp 权重最高 + 手牌/装备, 判定区扣分。
    function aiSeatScore(g, seat) {
      var st = g[seat];
      if (!st) return 0;
      var slots = ['weapon', 'armor', 'horsePlus', 'horseMinus'];
      var eq = slots.filter(function (s) { return st.equipment && st.equipment[s]; }).length;
      return st.hp * 30 + (st.hand || []).length * 5 + eq * 8 - (st.judgeArea || []).length * 5;
    }

    // 状态评估: 自身 hp 与对方差为主, 加上 hand / equipment / judge 区差
    // game over 时给极大的 +/- bonus.
    // v12 I3: 多席 (identity3) 且 v12 profile → 阵营聚合评估: 友方 (自己 +
    // 0.6×盟友) − 敌方均值; 终局按阵营 (winner='lordSide'/'rebelSide')。
    // 1v1 双 profile 均保持旧公式逐字不变。
    function aiEvaluateState(g, actor) {
      var self = g[actor];
      if (!self) return 0;
      var seats = StateRuntime.seatList(g);
      if (seats.length > 2 && aiProfileOf(g, actor) !== 'v11') {
        if (g.phase === 'gameover') {
          var mySide = StateRuntime.sideOf(g, actor);
          if (g.winner && g.winner === mySide) return 100000;
          if (g.winner) return -100000;
        }
        var friendly = aiSeatScore(g, actor);
        if (self.hp <= 0) friendly -= 1000;
        else if (self.hp === 1) friendly -= 50;
        else if (self.hp === 2) friendly -= 10;
        var hostileSum = 0;
        var hostileCount = 0;
        seats.forEach(function (seat) {
          if (seat === actor) return;
          var st = g[seat];
          if (!st || st.hp <= 0) return;
          // v13 M2: 阵营聚合按感知路由 (明置恒等直读)。
          if (StateRuntime.perceivedHostile(g, actor, seat)) {
            hostileSum += aiSeatScore(g, seat);
            hostileCount += 1;
          } else {
            friendly += aiSeatScore(g, seat) * 0.6;
          }
        });
        // 敌方取均值保持与 1v1 同一量纲; 每存活敌席另计 -5 (人数劣势压力)
        var hostileAvg = hostileCount ? hostileSum / hostileCount : 0;
        return friendly - hostileAvg - hostileCount * 5;
      }
      var oppActor = opponent(actor);
      var opp = g[oppActor];
      if (!opp) return 0;
      if (g.phase === 'gameover') {
        if (g.winner === actor) return 100000;
        if (g.winner === oppActor) return -100000;
      }
      // hp 差权重最高
      var hpScore = (self.hp - opp.hp) * 30;
      if (self.hp <= 0) hpScore -= 1000;
      else if (self.hp === 1) hpScore -= 50;
      else if (self.hp === 2) hpScore -= 10;
      // v12 I1: 压血线 — 把对手压进斩杀区间的非线性收益 (v11 冻结无此项)
      if (aiFeatureOn(g, actor, 'killPressure')) {
        if (opp.hp <= 0) hpScore += 500;
        else if (opp.hp === 1) hpScore += 40;
        else if (opp.hp === 2) hpScore += 15;
      }
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
    // v11 C5 (批次 29): mode 泛化 — 'normal' 走 playCard, 'asSha' 走杀转化
    // (旧语义), 其余字符串直接作为 asType ('lebusishu' / 'guohe') 走 playCardAs。
    function aiSimulateCardPlay(g, actor, card, mode, options) {
      var clone = aiCloneGame(g);
      try {
        var result;
        if (mode === 'asSha') {
          result = playCardAs(clone, actor, card.id, 'sha');
        } else if (mode && mode !== 'normal') {
          result = playCardAs(clone, actor, card.id, mode);
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
    // v12 I2: 对手杀数按 profile 路由 (v12 诚实估计); I3: 多席 v12 下
    // 汇总全部存活敌席的杀数威胁。
    function aiEvaluateStateWithThreat(g, actor) {
      var base = aiEvaluateState(g, actor);
      if (g.phase === 'gameover') return base;
      var self = g[actor];
      if (!self) return base;
      var oppSha;
      var seats = StateRuntime.seatList(g);
      if (seats.length > 2 && aiProfileOf(g, actor) !== 'v11') {
        oppSha = 0;
        // v13 M2: 感知敌对路由 (明置恒等直读)。
        // v14 Q3: 简化复核落地 — ① 攻击范围外的敌席零威胁 (此前按全场
        // 敌席杀数直加); ② 非无限杀席位单回合至多倾泻 1 杀 (咆哮/连弩
        // 才按全部杀数计) — 修正多敌席叠加的系统性高估。1v1 双席分支
        // 保持原式 (恒相邻 + v11/v12 基准冻结轨迹, 记录为口径差异)。
        StateRuntime.perceivedHostileSeats(g, actor).forEach(function (seat) {
          if (!StateRuntime.canReachWithSha(g, seat, actor)) return;
          var seatSha = aiFoeEstimate(g, actor, seat, 'sha');
          oppSha += StateRuntime.canUseUnlimitedSha(g[seat]) ? seatSha : Math.min(seatSha, 1);
        });
      } else {
        var oppActor = opponent(actor);
        if (!g[oppActor]) return base;
        // 对方下回合能用几张杀 (含 武圣 红色 / 龙胆 闪 等转化)
        oppSha = aiFoeEstimate(g, actor, oppActor, 'sha');
      }
      // 我方能用几张闪 (estimateShanCount 含 龙胆 杀 / 倾国 黑 等)
      var selfShan = aiEstimateShanCount(self);
      // 预期入帐伤害 = max(0, 对方杀数 - 我方闪数). 简化 (忽略 paoxiao
      // 多杀重叠 / 距离等). 每点 dmg 减 25 (低于 hp 差权重 30 但显著).
      var incoming = Math.max(0, oppSha - selfShan);
      return base - incoming * 25;
    }

    // 转化模式按"转化后的虚拟牌形状"打启发分 — 杀/乐不思蜀/过河拆桥 各按
    // 其 scoreCardForAI 分支评估 (v11 C5, 自 aiScoreCardWithLookahead 抽出
    // 供两步精化复用)。
    function aiHeuristicForMode(g, actor, card, mode) {
      if (mode === 'asSha') {
        return scoreCardForAI(g, actor, { type: 'sha', family: 'basic', color: card.color });
      }
      if (mode === 'lebusishu') {
        return scoreCardForAI(g, actor, { type: 'lebusishu', family: 'delayed', color: card.color });
      }
      if (mode === 'guohe') {
        return scoreCardForAI(g, actor, { type: 'guohe', family: 'trick', color: card.color });
      }
      return scoreCardForAI(g, actor, card);
    }

    // 综合分: 启发 + lookahead delta. sim 失败时回退仅启发.
    // v8 PR-D4: 评估改用 threat-aware 版本, 让 AI 考虑下回合对手反击潜力.
    // v12 I1: 模拟世界内 (aiSimulating) 短路为纯启发 — 深度模拟里嵌套的
    // AI 决策不再逐候选克隆, 复杂度保持线性 (v11 无嵌套路径, 行为不变)。
    function aiScoreCardWithLookahead(g, actor, card, mode) {
      var heuristic = aiHeuristicForMode(g, actor, card, mode);
      if (g.aiSimulating) return heuristic;
      var preEval = aiEvaluateStateWithThreat(g, actor);
      var sim = aiSimulateCardPlay(g, actor, card, mode);
      if (!sim) return heuristic;
      var postEval = aiEvaluateStateWithThreat(sim, actor);
      var delta = postEval - preEval;
      return heuristic + delta;
    }

    // ═════ v12 I1: 两步 lookahead — "我方行动 → 对手最优回应 → 评估" ═════
    // sim 为"我方出这张牌后"的私有克隆。深度评估 = 在克隆世界里用真实引擎
    // 流程续跑: 我方按纯启发打完本回合剩余动作 (含弃牌/结束阶段), 座次下家
    // 整回合 (真实摸牌/判定/技能时机), 然后以 actor 视角评估。模拟内的 AI
    // 决策经 aiSimulating 短路为纯启发 (无嵌套克隆); ask 类偏好在克隆里一律
    // 转 auto (模拟中无人类)。任何挂起/失败回退到 sim 静态评估。
    function aiDeepTurnEval(sim, actor) {
      var fallback = aiEvaluateStateWithThreat(sim, actor);
      if (sim.phase === 'gameover') return fallback;
      try {
        StateRuntime.seatList(sim).forEach(function (seat) {
          var prefs = sim[seat] && sim[seat].skillPreferences;
          if (!prefs) return;
          Object.keys(prefs).forEach(function (k) { if (prefs[k] === 'ask') prefs[k] = 'auto'; });
        });
        var mine = runAITurn(sim, actor);
        if (!mine || !mine.ok || sim.pendingChoice) return fallback;
        if (sim.phase === 'gameover') return aiEvaluateStateWithThreat(sim, actor);
        var next = sim.turn;
        if (next !== actor) {
          var theirs = runAITurn(sim, next);
          if (!theirs || !theirs.ok || sim.pendingChoice) return fallback;
        }
        return aiEvaluateStateWithThreat(sim, actor);
      } catch (e) {
        return fallback;
      }
    }

    function aiChooseCard(game, actor) {
      if (game.turn !== actor || game.phase === 'gameover') return null;
      var self = game[actor];
      var candidates = [];
      self.hand.forEach(function (card) {
        // Original-card use.
        if (canPlayCard(game, actor, card).ok) {
          // v12 H5: 杀类另行确认存在可达敌对目标 (∃-目标语义含友方座席)
          if (!isShaType(card.type) || aiShaTargetSeat(game, actor, card)) {
            // v8 PR-D3: 用 lookahead 综合分; sim 失败回退到 scoreCardForAI
            var normalScore = aiScoreCardWithLookahead(game, actor, card, 'normal');
            if (normalScore > 0) candidates.push({ card: card, mode: 'normal', score: normalScore });
          }
        }
        // As-Sha conversion (武圣 / 龙胆). Skip cards that are already
        // 杀 — no conversion needed.
        if (!isShaType(card.type)) {
          if (canPlayCardAs(game, actor, card, 'sha').ok
              && aiShaTargetSeat(game, actor, { type: 'sha', name: '杀', color: card.color, suit: card.suit })) {
            var asScore = aiScoreCardWithLookahead(game, actor, card, 'asSha');
            if (asScore > 0) candidates.push({ card: card, mode: 'asSha', score: asScore });
          }
        }
        // v11 C5 (批次 29): 锦囊类转化 (国色 方片→乐 / 奇袭 黑牌→拆)。
        // 杀转化上面已单独处理; 同型转化 (真拆当拆) 无意义, 跳过。
        if (listCardConversions) {
          listCardConversions(game, actor, card).forEach(function (conv) {
            if (conv.asType === 'sha' || card.type === conv.asType) return;
            var convScore = aiScoreCardWithLookahead(game, actor, card, conv.asType);
            if (convScore > 0) {
              candidates.push({ card: card, mode: 'convert', asType: conv.asType, score: convScore });
            }
          });
        }
      });
      candidates.sort(function (a, b) { return b.score - a.score; });
      // v12 I1: 两步精化 — 对单步综合分 top-3 候选追加"对手最优回应"评估,
      // 重打分后再排序 (剪枝: 其余候选保持单步分)。基线取"我方 pass → 对手
      // 最优回应"的评估 (不出牌对手同样会回应, 用静态现状作基线会系统性
      // 压低一切出牌)。单候选无从取舍时跳过; v11 profile 冻结单步旧行为。
      // (aiSimulating 门: 深度模拟内部不再递归精化, 复杂度线性)
      if (!game.aiSimulating && candidates.length > 1 && aiFeatureOn(game, actor, 'lookahead2')) {
        var refineCount = Math.min(5, candidates.length);
        var refined = candidates.slice(0, refineCount);
        refined.forEach(function (cand) {
          var simMode = cand.mode === 'convert' ? cand.asType : cand.mode;
          var sim = aiSimulateCardPlay(game, actor, cand.card, simMode);
          // sim 失败 (挂起/异常) → 以现状静态分参与深度比较 ("效果未知≈现状")
          cand.deep = sim ? aiDeepTurnEval(sim, actor) : aiEvaluateStateWithThreat(game, actor);
        });
        // 深度分直接互比 (同一评估量纲, 无基线混刻度); 单步综合分作平分决胜。
        // 只在 top-3 内部重排, 未精化候选不越位。
        refined.sort(function (a, b) {
          if (b.deep !== a.deep) return b.deep - a.deep;
          return b.score - a.score;
        });
        candidates = refined.concat(candidates.slice(refineCount));
      }
      return candidates.length
        ? { card: candidates[0].card, mode: candidates[0].mode, asType: candidates[0].asType }
        : null;
    }

    function aiChooseSkillAction(game, actor) {
      if (!game || game.turn !== actor || game.phase !== 'play') return null;
      var self = game[actor];
      if (!self) return null;
      self.flags = self.flags || {};
      var primaryFoeSeat = aiPrimaryFoe(game, actor);
      var target = game[primaryFoeSeat];

      // ═════ v15 T (火包) 主动技启发 ═════
      // 强袭 (典韦): 弃武器成本优先 (无武器时才用血), 且只在能打死人或
      // 血线宽裕 (hp>=3) 时才用血; 目标取攻击范围内感知敌对血线最低者。
      if (hasSkill(self, 'qiangxi') && !self.flags.qiangxiUsed) {
        // 评审收口 [中]: 两种成本的攻击范围**不同** —
        // 弃装备区武器作成本时按 glossary__card.md:41 不能再用该武器的
        // 攻击范围 (引擎按 effectiveRange=1 校验)。此前启发一律按当前武器
        // 射程选目标 → 挑出的目标被引擎拒, aiTakeAction 返回 ok:false,
        // 整段出牌阶段就此中断 (200 局火包 soak 命中 5 次)。
        var qxReach = function (seat, useWeaponRange) {
          return StateRuntime.distanceBetween(game, actor, seat)
            <= (useWeaponRange ? StateRuntime.weaponRange(self) : 1);
        };
        var qxPool = function (useWeaponRange) {
          return StateRuntime.perceivedHostileFirstPool(game, actor,
            StateRuntime.aliveSeats(game).filter(function (seat) {
              return seat !== actor && game[seat] && game[seat].hp > 0 && qxReach(seat, useWeaponRange);
            })).slice().sort(function (a, b) { return game[a].hp - game[b].hp; });
        };
        var qxWeapon = self.equipment && self.equipment.weapon;
        // 弃武器档: 目标必须落在"去掉武器后"的范围 (距离 ≤ 1)。
        var qxWeaponTargets = qxWeapon ? qxPool(false) : [];
        if (qxWeapon && qxWeaponTargets.length) {
          return { skillId: 'qiangxi', cardIds: [qxWeapon.id], options: { target: qxWeaponTargets[0] } };
        }
        // 失体力档: 武器照常提供射程。
        var qxHpTargets = qxPool(true);
        if (qxHpTargets.length && (self.hp >= 3 || game[qxHpTargets[0]].hp <= 1)) {
          return { skillId: 'qiangxi', cardIds: [], options: { target: qxHpTargets[0] } };
        }
      }

      // v15 U (林包) 主动技启发 —— 只读公开信息 (手牌**数**/体力/势力/感知立场)。
      // 缔盟 (鲁肃): 把手牌最多的**感知敌对**座席与手牌最少的座席对调, 净损敌人;
      // 成本 X = 两人手牌差, 自己手牌不够就不发动。
      if (hasSkill(self, 'dimeng') && !self.flags.dimengUsed) {
        var dmOthers = StateRuntime.aliveSeats(game).filter(function (seat) { return seat !== actor; });
        if (dmOthers.length >= 2) {
          var dmSorted = dmOthers.slice().sort(function (a, b) {
            return (game[b].hand || []).length - (game[a].hand || []).length;
          });
          var richest = dmSorted[0];
          var poorest = dmSorted[dmSorted.length - 1];
          var dmCost = (game[richest].hand || []).length - (game[poorest].hand || []).length;
          // 只有"富者是敌、贫者是友"时才是净收益; 且成本不能压垮自己的手牌。
          if (dmCost > 0 && dmCost <= Math.max(0, (self.hand || []).length - 1)
              && StateRuntime.perceivedHostile(game, actor, richest)
              && !StateRuntime.perceivedHostile(game, actor, poorest)) {
            return { skillId: 'dimeng', cardIds: [], options: { targetA: richest, targetB: poorest } };
          }
        }
      }

      // 乱武 (贾诩): 限定技, 全场每人对最近者出杀否则掉血 —— 对自己零伤害。
      // 血线判据只读公开的体力值: 场上有至少两名感知敌对座席、且其中有人
      // 血线 <= 2 (掉 1 血就可能濒死) 时才值得烧掉限定技。
      if (hasSkill(self, 'luanwu') && !self.flags.luanwuUsed) {
        var lwFoes = StateRuntime.perceivedHostileSeats(game, actor).filter(function (seat) {
          return game[seat] && game[seat].hp > 0;
        });
        if (lwFoes.length >= 2 && lwFoes.some(function (seat) { return game[seat].hp <= 2; })) {
          return { skillId: 'luanwu', cardIds: [], options: {} };
        }
      }

      // 天义 (太史慈): 手上有【杀】才值得赌 (赢=多一次杀+无距离+多目标,
      // 没赢=本回合不能出杀); 手上没杀时拼点毫无收益, 不发动。
      if (hasSkill(self, 'tianyi') && !self.flags.tianyiUsed && !self.flags.tianyiLost) {
        var tyHasSha = (self.hand || []).some(function (card) { return isShaType(card.type); });
        var tyTargets = StateRuntime.perceivedHostileFirstPool(game, actor,
          StateRuntime.aliveSeats(game).filter(function (seat) {
            return seat !== actor && deps.pindianEligible && deps.pindianEligible(game, actor, seat);
          }));
        // 只读公开信息: 对手手牌数越少, 其能拿出的大牌越少 (期望点数更低)。
        if (tyHasSha && tyTargets.length) {
          var tyPick = tyTargets.slice().sort(function (a, b) {
            return (game[a].hand || []).length - (game[b].hand || []).length;
          })[0];
          return { skillId: 'tianyi', cardIds: [], options: { target: tyPick } };
        }
      }

      // 驱虎 (荀彧): 拼点赢 → 让体力大于己的角色去打别人; 没赢 → 自己吃
      // 1 伤害。血线见底 (hp<=1) 时不赌。
      if (hasSkill(self, 'quhu') && !self.flags.quhuUsed && self.hp > 1) {
        var qhTargets = StateRuntime.perceivedHostileFirstPool(game, actor,
          StateRuntime.aliveSeats(game).filter(function (seat) {
            return seat !== actor && game[seat].hp > self.hp
              && deps.pindianEligible && deps.pindianEligible(game, actor, seat);
          }));
        if (qhTargets.length) {
          var qhPick = qhTargets.slice().sort(function (a, b) {
            return (game[a].hand || []).length - (game[b].hand || []).length;
          })[0];
          return { skillId: 'quhu', cardIds: [], options: { target: qhPick } };
        }
      }

      // 乱击 (袁绍): 两张同花色手牌当【万箭齐发】 — 只在"敌方受伤面 >
      // 己方受伤面"时发动 (万箭打全场, 队友也吃)。
      if (hasSkill(self, 'luanji')) {
        var bySuit = {};
        (self.hand || []).forEach(function (card) {
          if (!card || !card.suit) return;
          bySuit[card.suit] = bySuit[card.suit] || [];
          bySuit[card.suit].push(card);
        });
        var luanjiPair = Object.keys(bySuit).map(function (suit) { return bySuit[suit]; })
          .filter(function (group) { return group.length >= 2; })[0];
        if (luanjiPair) {
          var foes = StateRuntime.aliveSeats(game).filter(function (seat) {
            return seat !== actor && StateRuntime.perceivedHostile(game, actor, seat);
          }).length;
          var friends = StateRuntime.aliveSeats(game).filter(function (seat) {
            return seat !== actor && !StateRuntime.perceivedHostile(game, actor, seat);
          }).length;
          if (foes > friends) {
            return { skillId: 'luanji', cardIds: [luanjiPair[0].id, luanjiPair[1].id], options: {} };
          }
        }
      }

      // ═════ v15 V (山包) 主动技启发 ═════
      // 挑衅 (姜维): 稳赚 —— 对方要么替你出一张【杀】(你随后可用闪/护甲应付,
      // 且消耗了对方一张杀), 要么白丢一张牌。血线见底时不主动招杀。
      if (hasSkill(self, 'tiaoxin') && !self.flags.tiaoxinUsed && self.hp > 1) {
        var txPool = StateRuntime.aliveSeats(game).filter(function (seat) {
          return seat !== actor && StateRuntime.canReachWithSha(game, seat, actor)
            && ((game[seat].hand || []).length > 0
              || Object.keys(game[seat].equipment || {}).some(function (slot) {
                return !!game[seat].equipment[slot];
              }));
        });
        var txPick = StateRuntime.perceivedHostileFirstPool(game, actor, txPool)[0];
        if (txPick) {
          return { skillId: 'tiaoxin', cardIds: [], options: { target: txPick } };
        }
      }

      // 直谏 (张昭张纮): 把手里的装备牌塞给**感知友方**换一张牌 —— 送给敌人
      // 等于资敌 (给他武器/防具), 所以没有友方就不发动。1v1 恒无友方 → no-op。
      if (hasSkill(self, 'zhijian')) {
        var zjEquip = (self.hand || []).find(function (card) { return card.family === 'equipment'; });
        var zjFriend = StateRuntime.aliveSeats(game).find(function (seat) {
          return seat !== actor && !StateRuntime.perceivedHostile(game, actor, seat);
        });
        if (zjEquip && zjFriend) {
          return { skillId: 'zhijian', cardIds: [zjEquip.id], options: { target: zjFriend } };
        }
      }

      // 制霸 (孙策主公技, 由其他吴势力角色发起): 没赢才有收益 —— 收益归主公,
      // 发起者只是"送牌"。所以只有感知友方的主公才值得发起, 且用最小的牌去拼
      // (故意输) 把两张牌塞给主公。手牌太少时不发起 (自身牌荒优先自用)。
      if (!self.flags.zhibaUsed && (self.hand || []).length >= 2) {
        var zbLord = StateRuntime.aliveSeats(game).find(function (seat) {
          return seat !== actor && game.roles && game.roles[seat] === '主公'
            && hasSkill(game[seat], 'zhiba');
        });
        if (zbLord && self.camp === '吴' && !StateRuntime.perceivedHostile(game, actor, zbLord)
            && deps.pindianEligible && deps.pindianEligible(game, actor, zbLord)) {
          return { skillId: 'zhiba', cardIds: [], options: {} };
        }
      }

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
          // audit4 收口: 显式存活目标 — 缺省 opponent() 槽位多席下可能已亡
          // (useSkill 存活校验会拒绝)。对手存活保持旧口径, 否则任一存活座席。
          var rendeTarget = game[opponent(actor)] && game[opponent(actor)].hp > 0
            ? opponent(actor)
            : StateRuntime.aliveSeats(game).filter(function (s) { return s !== actor; })[0];
          if (rendeTarget) {
            return { skillId: 'rende', cardIds: [rendeCandidates[0].card.id], options: { target: rendeTarget } };
          }
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

      // v11 C6 (批次 30): 结姻 — 与受伤男性对手"各回复 1", 也给敌方回血,
      // 净收益仅在自保紧急时成立: 自身 hp<=2 且受伤 + 目标男性受伤 +
      // 手牌足够 (>=3, 保留至少 1 张) 时弃两张最低分牌换自身 +1。
      if (hasSkill(self, 'jieyin') && !self.flags.jieyinUsed
          && self.hp < self.maxHp && self.hp <= 2 && self.hand.length >= 3
          && target && target.gender === 'male' && target.hp < target.maxHp) {
        var jieyinCandidates = self.hand
          .map(function (card) { return { card: card, score: scoreCardForAI(game, actor, card) }; })
          .sort(function (a, b) { return a.score - b.score; });
        // v12 H5: 显式目标座席 (评估与执行同一目标, 多席不误指友方)
        return { skillId: 'jieyin', cardIds: [jieyinCandidates[0].card.id, jieyinCandidates[1].card.id], options: { target: primaryFoeSeat } };
      }

      // 青囊: heal whenever 自身 is wounded and 有手牌可弃。优先自救；
      // 自己满血但对方受伤时不会触发（不应该给敌人回血）。
      if (hasSkill(self, 'qingnang') && !self.flags.qingnangUsed && self.hand.length > 0 && self.hp < self.maxHp) {
        var qingnangCandidates = self.hand
          .map(function (card) { return { card: card, score: scoreCardForAI(game, actor, card) }; })
          .sort(function (a, b) { return a.score - b.score; });
        return { skillId: 'qingnang', cardIds: [qingnangCandidates[0].card.id], options: { target: actor } };
      }

      // v12 H7: 离间 (貂蝉) — 场上有两名敌对男性时弃最低分牌挑起决斗。
      if (hasSkill(self, 'lijian') && !self.flags.lijianUsed && self.hand.length > 1) {
        // v13 M2: 感知敌对路由 (明置恒等直读)。
        var lijianMales = StateRuntime.perceivedHostileSeats(game, actor).filter(function (seat) {
          return game[seat] && game[seat].hp > 0 && game[seat].gender === 'male';
        });
        if (lijianMales.length >= 2) {
          var lijianCost = self.hand
            .map(function (card) { return { card: card, score: scoreCardForAI(game, actor, card) }; })
            .sort(function (a, b) { return a.score - b.score; })[0];
          // 杀多者先手 (targets[0] 视为使用决斗者), 杀少者先响应易败
          // v12 I2: 杀数按 profile 路由 (v12 诚实估计)
          var lijianPair = lijianMales.slice(0, 2).sort(function (a, b) {
            return aiFoeEstimate(game, actor, b, 'sha') - aiFoeEstimate(game, actor, a, 'sha');
          });
          return { skillId: 'lijian', cardIds: [lijianCost.card.id], options: { targets: lijianPair } };
        }
      }

      // v12 H7: 黄天 — 群势力 AI 在自己出牌阶段把多余【闪】交给同阵营主公张角。
      if (game.mode === 'identity3' && self.camp === '群' && !self.flags.huangtianUsed) {
        var htLordSeat = null;
        StateRuntime.seatList(game).forEach(function (seat) {
          if (htLordSeat || seat === actor) return;
          var st = game[seat];
          if (st && st.hp > 0 && hasSkill(st, 'huangtian')
              && game.roles && game.roles[seat] === '主公'
              && !StateRuntime.isHostileSeat(game, actor, seat)) {
            htLordSeat = seat;
          }
        });
        if (htLordSeat) {
          var spareShans = self.hand.filter(function (c) { return c.type === 'shan'; });
          var spareShandian = self.hand.find(function (c) { return c.type === 'shandian'; });
          if (spareShans.length >= 2) {
            return { skillId: 'huangtian', cardIds: [spareShans[0].id] };
          }
          if (spareShandian) {
            return { skillId: 'huangtian', cardIds: [spareShandian.id] };
          }
        }
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
          // v12 H5: 显式目标座席 (评估与执行同一目标, 多席不误指友方)
          return { skillId: 'fanjian', cardIds: [picked.card.id], options: { target: primaryFoeSeat } };
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
      // M6: 有挂起的玩家选择 (如 AI 出杀等玩家决定是否出闪) → AI 暂停而非
      // 继续行动; UI 轮询在 pendingChoice 解决后会再次调用。
      if (game.pendingChoice) {
        var pausedAction = success('等待玩家处理选择。');
        pausedAction.action = 'paused';
        return pausedAction;
      }

      // v14 R1: 蛊惑声明优先于常规技能/出牌 (每回合限一次, 声明后正常
      // 续跑; 玩家质疑窗挂起时由 runAITurn 的 paused 路径接管)。
      var guhuoDeclared = aiMaybeDeclareGuhuo(game, actor);
      if (guhuoDeclared) {
        guhuoDeclared.action = 'guhuo';
        return guhuoDeclared;
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
      } else if (choice.mode === 'convert') {
        // v11 C5 (批次 29): 锦囊类转化 (国色/奇袭) — 按 asType 走 playCardAs;
        // AI 侧 guohe 结算走 resolveGuohe1v1 的 auto 路径, 无需目标参数。
        cardResult = playCardAs(game, actor, card.id, choice.asType);
      } else {
        var cardOptions;
        // v12 H5: 铁索缺省横置敌对座席 (至多 2 名); 1v1 恒为 [对手]。
        // v13 M2: 感知敌对路由 (明置恒等直读)。
        if (card.type === 'tiesuo') cardOptions = { mode: 'chain', targets: StateRuntime.perceivedHostileSeats(game, actor).slice(0, 2) };
        // v12 H5: 杀显式目标 — playSha 缺省目标不做距离校验 (信息由显式
        // 指定承担), AI 传入自己确认过"可达且敌对"的座席。
        if (isShaType(card.type)) {
          var aiShaSeat = aiShaTargetSeat(game, actor, card);
          if (aiShaSeat) cardOptions = { target: aiShaSeat };
          // v14 P2: 方天画戟 — 最后手牌杀可额外指定至多 2 目标。启发:
          // 主目标之外, 追加感知敌对且可达的座席 (按 aiPickHostileTarget
          // 同源评分逐个挑, 不祸及同侧; 敌对候选不足则不凑数)。
          if (aiShaSeat && shaExtraTargetLimit) {
            var extraLimit = shaExtraTargetLimit(game, actor, card.id);
            if (extraLimit > 0) {
              var multiTargets = [aiShaSeat];
              var extraPool = legalTargetsForCard(game, actor, card).filter(function (seat) {
                return seat !== aiShaSeat && StateRuntime.perceivedHostile(game, actor, seat);
              });
              while (multiTargets.length < 1 + extraLimit && extraPool.length) {
                var nextPick = aiPickHostileTarget(game, actor, extraPool);
                if (!nextPick) break;
                multiTargets.push(nextPick);
                extraPool = extraPool.filter(function (seat) { return seat !== nextPick; });
              }
              if (multiTargets.length > 1) cardOptions = { targets: multiTargets };
            }
          }
        }
        if (card.type === 'huogong') {
          // v12 H5 修复: 预览与实际出牌须对同一目标 — 此前预览走
          // getHuogongChoice 内部的 opponent() 回退 (多席下 ally 的
          // "对手"是友方玩家), 而 playCard 结算却落在敌对座席, 花色
          // 成本按错误目标预挑 → 结算拒绝, runAITurn 整体失败。
          var huogongSeat = aiShaTargetSeat(game, actor, card) || opponent(actor);
          var fireChoice = getHuogongChoice(game, actor, huogongSeat);
          if (fireChoice.ok && fireChoice.usableCostIds.length) {
            cardOptions = { target: huogongSeat, huogongCostCardId: fireChoice.usableCostIds[0] };
          } else if (fireChoice.pendingTargetChoice) {
            // L1: 目标 (玩家, ask) 展示牌未定 — 展示后引擎自动弃同花色
            cardOptions = { target: huogongSeat };
          } else {
            cardOptions = { target: huogongSeat, declineHuogong: true };
          }
        }
        cardResult = playCard(game, actor, card.id, cardOptions);
      }
      cardResult.action = 'card';
      cardResult.cardId = card.id;
      cardResult.mode = choice.mode;
      return cardResult;
    }

    // v12 I2: 弃牌保留值 — 出牌分为 0 的响应牌 (闪/无懈) 在旧实现里最先被
    // 弃, 等于主动裁军。v12 按"防御持有价值"垫底分: 闪保命 > 无懈保结算 >
    // 桃已有高分; 受伤时闪/桃再加权。v11 profile 冻结旧行为 (纯出牌分)。
    function aiDiscardHoldValue(game, actor, card) {
      if (!aiFeatureOn(game, actor, 'discardHold')) return 0;
      var self = game[actor];
      var wounded = self.hp < self.maxHp;
      if (card.type === 'shan') return self.hp <= 2 ? 70 : 55;
      if (card.type === 'wuxie') return 45;
      if (card.type === 'tao' && wounded) return 40; // 叠加其出牌分
      if (isShaType(card.type)) return 15; // 决斗/南蛮/借刀 响应面
      return 0;
    }

    function aiDiscardCandidates(game, actor) {
      var state = game[actor];
      var count = getDiscardCount(game, actor);
      if (!state || count <= 0) return [];
      return state.hand
        .map(function (card) {
          return { card: card, score: scoreCardForAI(game, actor, card) + aiDiscardHoldValue(game, actor, card) };
        })
        .sort(function (a, b) { return a.score - b.score; })
        .slice(0, count)
        .map(function (item) { return item.card.id; });
    }

    function runAITurn(game, actor, maxActions) {
      if (!game || !game[actor]) return fail('未知角色。');
      maxActions = maxActions || 12;
      if (game.phase === 'gameover') return fail('游戏已经结束。');
      // v12 H5: 阵亡座席 — 若回合还挂在其名下 (死于自己回合中) 则终结该
      // 回合 (endTurn 内部经 completeTurn 走阵亡终止路径), 否则直接拒绝。
      if (game[actor].hp <= 0) {
        if (game.turn === actor && !game.pendingChoice) return endTurn(game);
        return fail('该角色已阵亡。');
      }

      // v12 G2 修复: 仅当回合不属于该 actor 时才开新回合。此前 phase 不在
      // prepare/judge/draw 也会重启 — 但 endTurn 内部已自动 startTurn 下一
      // 回合推进到出牌阶段, 且 pendingChoice 排空后的自动续跑也会把 phase
      // 推到 play/discard: 两种情况下再调 runAITurn 都会 resetActorTurnState
      // + 重跑准备阶段 (闭月/英姿/妄尊/神速 重复触发, 在途牌可被丢弃)。
      // 同回合一律按当前阶段续跑, 不重启。
      if (game.turn !== actor) {
        var started = startTurn(game, actor);
        if (!started.ok || game.phase === 'gameover') return started;
      }

      if (game.phase === 'play') {
        for (var i = 0; i < maxActions; i += 1) {
          var action = aiTakeAction(game, actor);
          if (!action.ok) return action;
          if (action.action === 'paused' || game.pendingChoice) return aiTurnPaused();
          if (action.action === 'none' || game.phase === 'gameover') break;
        }
        if (game.phase === 'play') finishPlayPhase(game);
      }
      if (game.pendingChoice) return aiTurnPaused();

      if (game.phase === 'discard' && needsDiscard(game, actor)) {
        var discarded = discardSelected(game, actor, aiDiscardCandidates(game, actor));
        if (!discarded.ok) return discarded;
      }

      if (game.phase === 'discard') {
        var advanced = advancePhase(game);
        if (!advanced.ok) return advanced;
      }
      if (game.pendingChoice) return aiTurnPaused();

      if (game.phase === 'finish') {
        var ended = endTurn(game);
        if (!ended.ok) return ended;
      }

      var done = success('AI 回合完成。');
      done.action = 'turn';
      return done;
    }

    // M6: AI 回合因等待玩家 pendingChoice 暂停。调用方 (UI 轮询 / 测试) 在
    // resolvePendingChoice 后重新调用 runAITurn 续跑。
    function aiTurnPaused() {
      var paused = success('AI 回合暂停，等待玩家处理选择。');
      paused.action = 'paused';
      return paused;
    }

    // ═════ v15 T: 拼点出牌启发 ═════
    // 只读自己的手牌 (不读对手手牌/暗牌 — 架构红线): 驱虎/天义 两个消费方
    // 都是"赢有收益、没赢有代价", 故一律出点数最大的牌争胜; 同点数时保留
    // 高价值牌 (桃/无懈/杀) — 拼点牌无论输赢都会离手, 能省则省。
    function aiPickPindianCard(game, seat, pd) {
      var state = game[seat];
      var hand = (state && state.hand) || [];
      if (!hand.length) return null;
      var best = null;
      var bestKey = null;
      hand.forEach(function (card) {
        var rank = deps.cardRankValue ? deps.cardRankValue(card) : 0;
        // 同点数时的让位序: 价值越低越优先拿去拼点。
        var value = card.type === 'tao' ? 3 : (card.type === 'wuxie' ? 2 : (card.type === 'shan' ? 1 : 0));
        var key = rank * 10 - value;
        if (bestKey === null || key > bestKey) { bestKey = key; best = card; }
      });
      return best;
    }

    // ═════ v14 R1: 蛊惑博弈 (v1 启发) ═════

    // 质疑立场: 缺省不质疑 (质疑真牌吃永久「缠怨」)。三个确定性触发面
    // (评审收口: 首版仅 保命+无中 两面, 15/16 型血线健康时恒放行, 质疑
    // 链对人形同虚设 — 扩到全部高价值资源面):
    // ① 保命赌假 — 声明的打击型落在自己且血线见底 (hp<=1, 若为真即濒死);
    // ② denial 赌假 — 敌对于吉声明高价值资源 (无中/桃园/五谷: 摸牌/
    //   群体回血) 且自己血线可承受缠怨久期风险 (hp>=3);
    // ③ 护财赌假 — 敌对于吉声明 拆/顺 指向自己且自己有牌可失。
    // 只读公开面: 声明型/目标/自身状态/感知敌对。
    // v15 S2 增补两面 (响应窗口接入后):
    // ④ 响应赌假 — 声明是对"我推进中的事件"的响应 (闪应我的杀/万箭/银月,
    //   杀应我发起的决斗, 桃救我正打死的人); 真牌打出我照样落空, 赌假的
    //   代价上限是缠怨久期, 故血线可承受 (hp>=2) 即开。
    // ⑤ 被抓包记忆 — 该声明者此前被质破的次数多于被验真的次数 (亮出是
    //   全场公开信息, 不读暗牌不读身份), 敌对且 hp>=2 时提高质疑意愿。
    function guhuoResponseBlocksMe(game, seat, gh) {
      if (gh.mode !== 'response') return false;
      var pending = gh.responsePending || {};
      if (pending.kind === 'dying-rescue') {
        // 桃/酒救援: 被救者与我敌对 → 这张响应是在拆我的战果。
        return !!pending.dyingActor
          && StateRuntime.perceivedHostile(game, seat, pending.dyingActor);
      }
      if (pending.kind === 'wuxie-response') {
        // 无懈抵消的是场上正在结算的锦囊 — 只在敌对时按 denial 面处理。
        return StateRuntime.perceivedHostile(game, seat, gh.actor);
      }
      return pending.sourceActor === seat || pending.starterActor === seat;
    }

    // 评审收口: "被我的事件挡住"只是必要条件, 不是充分条件 — 首版无条件
    // 恒质疑, 于吉用**真牌**声明即可稳定钓走缠怨 (零成本), 此后质疑队列
    // 恒空、全 16 型可无风险诈。补三条各自独立的赌假理由 (全部公开信息):
    //   ① 有前科 — 该声明者被质破次数多于被验真次数;
    //   ② 响应空窗记账 — 该席此前公开证明凑不出这一牌型 (consumeResponse
    //      的 aiRevealed 遥测, 真实对局中同为公开信息);
    //   ③ 高赌注 — 赌中即当场终结 (濒死救援) 或对手血线已见底 (打出成功
    //      他就活下来), 值得用缠怨久期换。
    function guhuoResponseWorthChallenging(game, seat, gh) {
      var st = game[seat];
      if (!st || st.hp < 2) return false; // 缠怨久期风险不可承受
      if (!guhuoResponseBlocksMe(game, seat, gh)) return false;
      var declarer = game[gh.actor] || {};
      if ((declarer.guhuoBusted || 0) > (declarer.guhuoProven || 0)) return true;
      var revealed = declarer.aiRevealed || {};
      var needed = (gh.declareType === 'fire_sha' || gh.declareType === 'thunder_sha')
        ? 'sha' : gh.declareType;
      if (revealed[needed]) return true;
      var pending = gh.responsePending || {};
      if (pending.kind === 'dying-rescue') return true;
      return declarer.hp <= 1;
    }

    function aiShouldChallengeGuhuo(game, seat, gh) {
      var st = game[seat];
      if (!st || st.chanyuan) return false;
      if (guhuoResponseWorthChallenging(game, seat, gh)) return true;
      var declarer = game[gh.actor] || {};
      if ((declarer.guhuoBusted || 0) > (declarer.guhuoProven || 0) && st.hp >= 2
          && StateRuntime.perceivedHostile(game, seat, gh.actor)) return true;
      var opts = gh.options || {};
      var targetsMe = opts.target === seat
        || (Array.isArray(opts.targets) && opts.targets.indexOf(seat) >= 0);
      var aoeStrike = gh.declareType === 'nanman' || gh.declareType === 'wanjian';
      var directStrike = gh.declareType === 'sha' || gh.declareType === 'fire_sha'
        || gh.declareType === 'thunder_sha' || gh.declareType === 'juedou'
        || gh.declareType === 'huogong';
      if ((aoeStrike || (directStrike && targetsMe)) && st.hp <= 1) return true;
      var denialValue = gh.declareType === 'wuzhong' || gh.declareType === 'taoyuan'
        || gh.declareType === 'wugu';
      if (denialValue && st.hp >= 3
          && StateRuntime.perceivedHostile(game, seat, gh.actor)) return true;
      var stealsMine = (gh.declareType === 'guohe' || gh.declareType === 'shunshou') && targetsMe;
      if (stealsMine && StateRuntime.perceivedHostile(game, seat, gh.actor)
          && ((st.hand || []).length > 0 || ['weapon', 'armor', 'horsePlus', 'horseMinus'].some(function (slot) {
            return st.equipment && st.equipment[slot];
          }))) return true;
      return false;
    }

    // v15 S2: AI 于吉声明启发 (全型) —
    // ① 真牌恒蛊惑: 手上有可直接使用的声明型真牌时走蛊惑而非直出 (无人
    //    质疑等价直出, 被质疑反赚缠怨, 严格不劣);
    // ② 诈声明: 无可用真牌时用"死牌" (闪/无懈 — 出牌阶段无主动使用时机)
    //    按型 EV 降序试, 且仅在按自身感知模型预判无人会质疑时才诈 (与
    //    质疑启发自洽, AI 生态内诈声明不送牌)。
    // 合法性/目标合法性一律交给 playGuhuoDeclare 判 (声明失败零副作用),
    // AI 侧只负责排序与目标挑选 — 单一真相源, 不复制规则。
    var GUHUO_DECLARE_PRIORITY = [
      'wuzhong', 'tao', 'shunshou', 'guohe', 'sha', 'fire_sha', 'thunder_sha',
      'juedou', 'huogong', 'nanman', 'wanjian', 'jiu', 'jiedao', 'wugu', 'taoyuan', 'tiesuo'
    ];
    var GUHUO_SEAT_TYPES = ['sha', 'fire_sha', 'thunder_sha', 'juedou', 'guohe',
      'shunshou', 'huogong', 'jiedao'];

    // 声明型 → 结算选项 (目标/受害者/横置座席)。取不到目标即返回 null,
    // 由调用方跳过该型。
    function aiGuhuoDeclareOptions(game, actor, type) {
      var opts = {};
      if (GUHUO_SEAT_TYPES.indexOf(type) >= 0) {
        var legal = (deps.guhuoLegalTargets ? deps.guhuoLegalTargets(game, actor, type) : [])
          .filter(function (seat) { return seat !== actor; });
        if (!legal.length) return null;
        var picked = aiPickHostileTarget(game, actor, legal) || legal[0];
        opts.target = picked;
        if (type === 'jiedao') {
          // 借刀: 持刀者攻击的受害者取"持刀者可及且与我敌对"的一席。
          var victims = deps.jiedaoVictimCandidates
            ? deps.jiedaoVictimCandidates(game, picked) : [];
          var victim = victims.filter(function (seat) {
            return seat !== actor && StateRuntime.perceivedHostile(game, actor, seat);
          })[0] || victims.filter(function (seat) { return seat !== actor; })[0];
          if (!victim) return null;
          opts.jiedaoVictim = victim;
        }
        return opts;
      }
      if (type === 'tiesuo') {
        var chainable = StateRuntime.aliveSeats(game).filter(function (seat) {
          return seat !== actor && StateRuntime.perceivedHostile(game, actor, seat);
        });
        if (chainable.length < 2) return null; // 只横置一名敌人收益近乎为零
        opts.targets = chainable.slice(0, 2);
      }
      return opts;
    }

    function firstHandCardOfType(hand, type) {
      for (var i = 0; i < hand.length; i += 1) {
        if (hand[i] && hand[i].type === type) return hand[i];
      }
      return null;
    }

    function aiGuhuoWouldBeChallenged(game, actor) {
      return StateRuntime.aliveSeats(game).some(function (seat) {
        var other = game[seat];
        return seat !== actor && other && !other.chanyuan && other.hp >= 3
          && StateRuntime.perceivedHostile(game, actor, seat);
      });
    }

    function aiMaybeDeclareGuhuo(game, actor) {
      if (!deps.guhuoAvailable || !deps.guhuoAvailable(game, actor)) return null;
      var st = game[actor];
      var hand = st.hand || [];
      // ① 真牌恒蛊惑 — 按 EV 序取第一张能声明其本名的真牌。
      for (var i = 0; i < GUHUO_DECLARE_PRIORITY.length; i += 1) {
        var type = GUHUO_DECLARE_PRIORITY[i];
        var real = firstHandCardOfType(hand, type);
        if (!real) continue;
        var trueOpts = aiGuhuoDeclareOptions(game, actor, type);
        if (!trueOpts) continue;
        trueOpts.cardId = real.id;
        trueOpts.declareType = type;
        var trueResult = deps.playGuhuoDeclare(game, actor, trueOpts);
        if (trueResult && trueResult.ok) return trueResult;
      }
      // ② 诈声明 — 死牌盖置, 预判有质疑者即不诈。
      var deadCard = hand.find(function (card) {
        return card.type === 'shan' || card.type === 'wuxie';
      });
      if (!deadCard) return null;
      if (aiGuhuoWouldBeChallenged(game, actor)) return null;
      for (var j = 0; j < GUHUO_DECLARE_PRIORITY.length; j += 1) {
        var fakeType = GUHUO_DECLARE_PRIORITY[j];
        if (fakeType === deadCard.type) continue; // 同名即真牌, 已在 ① 试过
        var fakeOpts = aiGuhuoDeclareOptions(game, actor, fakeType);
        if (!fakeOpts) continue;
        fakeOpts.cardId = deadCard.id;
        fakeOpts.declareType = fakeType;
        var fakeResult = deps.playGuhuoDeclare(game, actor, fakeOpts);
        if (fakeResult && fakeResult.ok) return fakeResult;
      }
      return null;
    }

    return {
      scoreCardForAI: scoreCardForAI,
      aiEstimateShaCount: aiEstimateShaCount,
      aiEstimateShanCount: aiEstimateShanCount,
      // v12 I2: 可见信息计数建模 (诚实估计) + profile 路由
      aiProfileOf: aiProfileOf,
      aiUnknownCounts: aiUnknownCounts,
      aiEstimateShaCountFor: aiEstimateShaCountFor,
      aiEstimateShanCountFor: aiEstimateShanCountFor,
      aiEstimateTaoCountFor: aiEstimateTaoCountFor,
      aiFoeEstimate: aiFoeEstimate,
      // v12 I3: 目标评估
      aiHostilityToward: aiHostilityToward,
      aiPickHostileTarget: aiPickHostileTarget,
      aiPrimaryFoe: aiPrimaryFoe,
      aiShouldUseWuxie: aiShouldUseWuxie,
      aiCloneGame: aiCloneGame,
      aiEvaluateState: aiEvaluateState,
      aiSimulateCardPlay: aiSimulateCardPlay,
      aiEvaluateStateWithThreat: aiEvaluateStateWithThreat,
      aiScoreCardWithLookahead: aiScoreCardWithLookahead,
      // v12 I1: 两步 lookahead (真实整回合深度模拟)
      aiDeepTurnEval: aiDeepTurnEval,
      aiChooseCard: aiChooseCard,
      aiChooseSkillAction: aiChooseSkillAction,
      aiTakeAction: aiTakeAction,
      aiDiscardCandidates: aiDiscardCandidates,
      // v15 T: 拼点出牌启发
      aiPickPindianCard: aiPickPindianCard,
      // v14 R1: 蛊惑博弈 (质疑立场 + 声明启发)
      aiShouldChallengeGuhuo: aiShouldChallengeGuhuo,
      aiMaybeDeclareGuhuo: aiMaybeDeclareGuhuo,
      runAITurn: runAITurn
    };
  }
