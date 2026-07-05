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
    var getHuogongChoice = deps.getHuogongChoice;

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
      if (state.equipment && state.equipment.weapon && state.equipment.weapon.type === 'zhangba'
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

    // v8 PR-D1: 出牌/锦囊 score 精细化。对 桃 / 杀 / 决斗 / 锦囊 都按
    // 双方资源 + 自身受伤情况 给梯度分数, 替代原 v6 的 binary heuristic.
    function scoreCardForAI(game, actor, card) {
      var self = game[actor];
      var target = game[opponent(actor)];

      // 桃: hp 缺口梯度。critical (hp=1) > 多伤 > 轻伤; 满血给负分阻止 AI 用。
      if (card.type === 'tao') {
        if (self.hp >= self.maxHp) return -100;
        if (self.hp === 1) return 200;
        var deficit = self.maxHp - self.hp;
        if (deficit >= 2) return 120;
        return 80;
      }

      // 无中生有: 永远值钱 (1 张换 2 张)
      if (card.type === 'wuzhong') return 90;

      // 酒: 仅当持手中有可用杀且本回合未出过杀 → buff 杀; 否则浪费
      if (card.type === 'jiu') {
        var hasShaToBoost = !self.usedSha && self.hand.some(function (c) { return isShaType(c.type); });
        return hasShaToBoost ? 82 : -10;
      }

      // 杀: 看目标可响应闪数量 (含 longdan/qingguo 转化); 0 闪 → 高分, 多闪 → 低
      if (isShaType(card.type)) {
        if (self.usedSha && !canUseUnlimitedSha(self)) return -100;
        var targetShans = aiEstimateShanCount(target);
        if (targetShans === 0) return 85;
        if (targetShans === 1) return 60;
        return 35;
      }

      // 决斗: 估算双方"互响应杀"链。我方杀数 vs 对方杀数 (含 武圣/龙胆 转化)。
      if (card.type === 'juedou') {
        var ourSha = aiEstimateShaCount(self);
        var theirSha = aiEstimateShaCount(target);
        if (ourSha > theirSha) return 75;
        if (ourSha === theirSha) return 40;
        return 10;
      }

      // 南蛮: 对方无杀响应 → 1 dmg, 否则等于浪费 (chip 评分降低)
      if (card.type === 'nanman') {
        return aiEstimateShaCount(target) === 0 ? 80 : 30;
      }

      // 万箭: 对方无闪响应 → 1 dmg
      if (card.type === 'wanjian') {
        return aiEstimateShanCount(target) === 0 ? 80 : 30;
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

    // 状态评估: 自身 hp 与对方差为主, 加上 hand / equipment / judge 区差
    // game over 时给极大的 +/- bonus.
    function aiEvaluateState(g, actor) {
      var self = g[actor];
      var oppActor = opponent(actor);
      var opp = g[oppActor];
      if (!self || !opp) return 0;
      if (g.phase === 'gameover') {
        if (g.winner === actor) return 100000;
        if (g.winner === oppActor) return -100000;
      }
      // hp 差权重最高
      var hpScore = (self.hp - opp.hp) * 30;
      if (self.hp <= 0) hpScore -= 1000;
      else if (self.hp === 1) hpScore -= 50;
      else if (self.hp === 2) hpScore -= 10;
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
    function aiSimulateCardPlay(g, actor, card, mode, options) {
      var clone = aiCloneGame(g);
      try {
        var result;
        if (mode === 'asSha') {
          result = playCardAs(clone, actor, card.id, 'sha');
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
    function aiEvaluateStateWithThreat(g, actor) {
      var base = aiEvaluateState(g, actor);
      if (g.phase === 'gameover') return base;
      var self = g[actor];
      var oppActor = opponent(actor);
      var opp = g[oppActor];
      if (!self || !opp) return base;
      // 对方下回合能用几张杀 (estimateShaCount 含 武圣 红色 / 龙胆 闪 等)
      var oppSha = aiEstimateShaCount(opp);
      // 我方能用几张闪 (estimateShanCount 含 龙胆 杀 / 倾国 黑 等)
      var selfShan = aiEstimateShanCount(self);
      // 预期入帐伤害 = max(0, 对方杀数 - 我方闪数). 简化 (忽略 paoxiao
      // 多杀重叠 / 距离等). 每点 dmg 减 25 (低于 hp 差权重 30 但显著).
      var incoming = Math.max(0, oppSha - selfShan);
      return base - incoming * 25;
    }

    // 综合分: 启发 + lookahead delta. sim 失败时回退仅启发.
    // v8 PR-D4: 评估改用 threat-aware 版本, 让 AI 考虑下回合对手反击潜力.
    function aiScoreCardWithLookahead(g, actor, card, mode) {
      var heuristic = (mode === 'asSha')
        ? scoreCardForAI(g, actor, { type: 'sha', family: 'basic', color: card.color })
        : scoreCardForAI(g, actor, card);
      var preEval = aiEvaluateStateWithThreat(g, actor);
      var sim = aiSimulateCardPlay(g, actor, card, mode);
      if (!sim) return heuristic;
      var postEval = aiEvaluateStateWithThreat(sim, actor);
      var delta = postEval - preEval;
      return heuristic + delta;
    }

    function aiChooseCard(game, actor) {
      if (game.turn !== actor || game.phase === 'gameover') return null;
      var self = game[actor];
      var candidates = [];
      self.hand.forEach(function (card) {
        // Original-card use.
        if (canPlayCard(game, actor, card).ok) {
          // v8 PR-D3: 用 lookahead 综合分; sim 失败回退到 scoreCardForAI
          var normalScore = aiScoreCardWithLookahead(game, actor, card, 'normal');
          if (normalScore > 0) candidates.push({ card: card, mode: 'normal', score: normalScore });
        }
        // As-Sha conversion (武圣 / 龙胆). Skip cards that are already
        // 杀 — no conversion needed.
        if (!isShaType(card.type)) {
          if (canPlayCardAs(game, actor, card, 'sha').ok) {
            var asScore = aiScoreCardWithLookahead(game, actor, card, 'asSha');
            if (asScore > 0) candidates.push({ card: card, mode: 'asSha', score: asScore });
          }
        }
      });
      candidates.sort(function (a, b) { return b.score - a.score; });
      return candidates.length ? { card: candidates[0].card, mode: candidates[0].mode } : null;
    }

    function aiChooseSkillAction(game, actor) {
      if (!game || game.turn !== actor || game.phase !== 'play') return null;
      var self = game[actor];
      if (!self) return null;
      self.flags = self.flags || {};
      var target = game[opponent(actor)];

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

      // 青囊: heal whenever 自身 is wounded and 有手牌可弃。优先自救；
      // 自己满血但对方受伤时不会触发（不应该给敌人回血）。
      if (hasSkill(self, 'qingnang') && !self.flags.qingnangUsed && self.hand.length > 0 && self.hp < self.maxHp) {
        var qingnangCandidates = self.hand
          .map(function (card) { return { card: card, score: scoreCardForAI(game, actor, card) }; })
          .sort(function (a, b) { return a.score - b.score; });
        return { skillId: 'qingnang', cardIds: [qingnangCandidates[0].card.id], options: { target: actor } };
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
          return { skillId: 'fanjian', cardIds: [picked.card.id] };
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
      } else {
        var cardOptions;
        if (card.type === 'tiesuo') cardOptions = { mode: 'chain', targets: [opponent(actor)] };
        if (card.type === 'huogong') {
          var fireChoice = getHuogongChoice(game, actor);
          if (fireChoice.ok && fireChoice.usableCostIds.length) {
            cardOptions = { huogongCostCardId: fireChoice.usableCostIds[0] };
          } else if (fireChoice.pendingTargetChoice) {
            // L1: 目标 (玩家, ask) 展示牌未定 — 展示后引擎自动弃同花色
            cardOptions = {};
          } else {
            cardOptions = { declineHuogong: true };
          }
        }
        cardResult = playCard(game, actor, card.id, cardOptions);
      }
      cardResult.action = 'card';
      cardResult.cardId = card.id;
      cardResult.mode = choice.mode;
      return cardResult;
    }

    function aiDiscardCandidates(game, actor) {
      var state = game[actor];
      var count = getDiscardCount(game, actor);
      if (!state || count <= 0) return [];
      return state.hand
        .map(function (card) { return { card: card, score: scoreCardForAI(game, actor, card) }; })
        .sort(function (a, b) { return a.score - b.score; })
        .slice(0, count)
        .map(function (item) { return item.card.id; });
    }

    function runAITurn(game, actor, maxActions) {
      if (!game || !game[actor]) return fail('未知角色。');
      maxActions = maxActions || 12;
      if (game.phase === 'gameover') return fail('游戏已经结束。');

      if (game.turn !== actor || ['prepare', 'judge', 'draw'].indexOf(game.phase) < 0) {
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
      aiCloneGame: aiCloneGame,
      aiEvaluateState: aiEvaluateState,
      aiSimulateCardPlay: aiSimulateCardPlay,
      aiEvaluateStateWithThreat: aiEvaluateStateWithThreat,
      aiScoreCardWithLookahead: aiScoreCardWithLookahead,
      aiChooseCard: aiChooseCard,
      aiChooseSkillAction: aiChooseSkillAction,
      aiTakeAction: aiTakeAction,
      aiDiscardCandidates: aiDiscardCandidates,
      runAITurn: runAITurn
    };
  }
