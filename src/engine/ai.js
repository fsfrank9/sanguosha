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
    //   闪电/无中/借刀/桃园与五谷的 denial 窗口 — 保持旧行为 (恒用)
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
      else victim = ctx.targetActor || ctx.delayedSide || (ctx.actor ? opponent(ctx.actor) : null);
      var interested;
      if (beneficial) {
        interested = StateRuntime.isHostileSeat(game, responder, beneficial); // 敌方受益 → 想消
      } else if (victim) {
        interested = victim === responder || !StateRuntime.isHostileSeat(game, responder, victim); // 友方受害 → 想消
      } else {
        interested = true; // 未建模 (闪电等) → 保持旧行为
      }
      // 净抵消态下动机反转: 想消的人已如愿 (不再出), 不想消的人想反无懈。
      return chain.wuxied ? !interested : interested;
    }

    function aiShouldUseWuxie(game, responder, chain) {
      if (!game || !chain) return true;
      var self = game[responder];
      if (!self) return true;
      if (self.skillPreferences && self.skillPreferences.wuxiePolicy === 'always') return true;
      if (!aiWuxieStance(game, responder, chain)) return false; // v12 H5: 立场不符不出
      if (chain.wuxied) return true; // 反无懈: 保卫己方已投入的锦囊
      var opp = game[opponent(responder)];
      var trick = chain.trickName;
      var handCount = (self.hand || []).length;
      var equipCount = ['weapon', 'armor', 'horsePlus', 'horseMinus'].filter(function (slot) {
        return self.equipment && self.equipment[slot];
      }).length;
      if (trick === 'nanman') return aiEstimateShaCount(self) === 0 && self.hp <= 2;
      if (trick === 'wanjian') return aiEstimateShanCount(self) === 0 && self.hp <= 2;
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
        // 兵粮: 手牌拮据才护摸牌; 闪电: 高威胁恒取消)。
        var judgedType = chain.ctx && chain.ctx.trickType;
        if (judgedType === 'lebusishu') return handCount >= 2;
        if (judgedType === 'bingliang') return handCount <= 2;
        return true; // 闪电等高威胁延时 → 保持取消
      }
      return true; // 无中/借刀/桃园与五谷 denial 窗口/未建模锦囊 → 保持旧行为
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
        if (entry.target === viewer || !StateRuntime.isHostileSeat(g, viewer, entry.target)) {
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
      var mySide = StateRuntime.sideOf(g, actor);
      var best = null;
      candidates.forEach(function (seat) {
        var st = g[seat];
        if (!st) return;
        var score = 0;
        if (mySide === 'rebelSide' && roles[seat] === '主公') score += 50; // 主公倒下即反贼胜
        if (st.hp <= 1) score += 30;
        else if (st.hp === 2) score += 12;
        if (roles[seat] === '反贼') score += 8; // 击杀反贼摸三张
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
      var candidates = StateRuntime.hostileSeats(game, actor);
      if (!candidates.length) return opponent(actor);
      return aiPickHostileTarget(game, actor, candidates) || opponent(actor);
    }

    // v12 H5: AI 单目标牌的目标座席 — 合法目标矩阵 ∩ 敌对座席 (1v1 恒为
    // 对手)。canPlayCard 的 ∃-目标语义包含友方座席 (玩家可显式指定), AI
    // 必须另行确认存在"可达且敌对"的目标; 与引擎 resolveTrickTargetActor
    // 的缺省池同构, 供出杀候选门与火攻预览/出牌保持同一目标。
    // v12 I3: 多候选按目标评分挑选 (集火/收割/胜负手)。
    function aiShaTargetSeat(game, actor, card) {
      if (!legalTargetsForCard) return opponent(actor);
      var candidates = legalTargetsForCard(game, actor, card).filter(function (seat) {
        return StateRuntime.isHostileSeat(game, actor, seat);
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
        var hasShaToBoost = !self.usedSha && self.hand.some(function (c) { return isShaType(c.type); });
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
        if (self.usedSha && !canUseUnlimitedSha(self)) return -100;
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
          if (StateRuntime.isHostileSeat(g, actor, seat)) {
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
        StateRuntime.hostileSeats(g, actor).forEach(function (seat) {
          oppSha += aiFoeEstimate(g, actor, seat, 'sha');
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
          return { skillId: 'rende', cardIds: [rendeCandidates[0].card.id] };
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
        var lijianMales = StateRuntime.hostileSeats(game, actor).filter(function (seat) {
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
        if (card.type === 'tiesuo') cardOptions = { mode: 'chain', targets: StateRuntime.hostileSeats(game, actor).slice(0, 2) };
        // v12 H5: 杀显式目标 — playSha 缺省目标不做距离校验 (信息由显式
        // 指定承担), AI 传入自己确认过"可达且敌对"的座席。
        if (isShaType(card.type)) {
          var aiShaSeat = aiShaTargetSeat(game, actor, card);
          if (aiShaSeat) cardOptions = { target: aiShaSeat };
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
      runAITurn: runAITurn
    };
  }
