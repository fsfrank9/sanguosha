  // v11 B1: 响应窗口框架域模块 — requestPlayerResponse / pendingChoice 队列
  // (H3 FIFO + H2 挂起续跑 + M6 冻结守卫) / RESPONSE_KIND_RESOLVERS 注册表 /
  // resolveResponseChoice 分发器, 从 game-engine.js 整体迁出, 函数体与迁出前
  // 逐行一致。各 resolver 留在各自领域, 经 registerResponseKind 注册进来。
  import { StateRuntime } from './state.js';

  var actorName = StateRuntime.actorName;

  export function createResponseRuntime(deps) {
    var continueTurnAfterPreparePhase = deps.continueTurnAfterPreparePhase;
    var log = deps.log;
    var success = deps.success;
    var fail = deps.fail;
    var processJudgeArea = deps.processJudgeArea;
    var continueTurnAfterJudgeArea = deps.continueTurnAfterJudgeArea;
    // v12 H2: AOE 逐座席队列续跑 (tricks 域后置装配, 包装注入)
    var resumeAOETargets = deps.resumeAOETargets;

    // v10 V3: 玩家响应窗口框架 — 统一暂停/恢复 API.
    //
    // 调用 (engine 侧): 触发暂停时, 不再手写 game.pauseState[xxx] +
    //   game.pendingChoice = {...} + log + return; 改用 requestPlayerResponse
    //   一行调用. 各 response kind 注册 continuation 到 RESPONSE_KIND_RESOLVERS.
    //
    // spec:
    //   kind         — pendingChoice.kind ('shan-response' | 'wuxie-response' | ...)
    //   actor        — 等待哪个 actor 响应 (UI 据此决定渲染哪边面板)
    //   pauseKey     — 写入 game.pauseState[pauseKey] 的 key
    //   source       — 暂停上下文 (resume 时用): { actor, card, amount, ... }
    //   options      — UI 候选列表 (写入 pendingChoice.options)
    //   meta         — 额外 UI 字段 (merge 进 pendingChoice, 如 shaName/sourceActor)
    //   logMessage   — 可选 log 行
    //   statusMessage— success() 的返回 message
    //
    // 恢复: 由 resolvePendingChoice / resolveResponseChoice 据 kind 查
    // RESPONSE_KIND_RESOLVERS 分发到对应 resolver. resolver 签名
    // (game, pending, decision), 自负责清 game.pauseState[pauseKey].
    function requestPlayerResponse(game, spec) {
      if (!game.pauseState) game.pauseState = {};
      game.pauseState[spec.pauseKey] = spec.source;
      var pending = { kind: spec.kind, actor: spec.actor };
      if (spec.options !== undefined) pending.options = spec.options;
      if (spec.meta) {
        Object.keys(spec.meta).forEach(function (k) { pending[k] = spec.meta[k]; });
      }
      setPendingChoice(game, pending);
      if (spec.logMessage) log(game, spec.logMessage);
      return success(spec.statusMessage || ('等待' + actorName(game, spec.actor) + '响应。'));
    }

    // v10 V3: response kind → resolver(game, pending, decision) 注册表.
    // 各 resolveXxxResponseChoice 函数声明后调 registerResponseKind 入册.
    var RESPONSE_KIND_RESOLVERS = {};

    function registerResponseKind(kind, resolver) {
      RESPONSE_KIND_RESOLVERS[kind] = resolver;
    }

    // H3 (审计二轮): pendingChoice 是单槽位, 此前并发触发的选择 (如【杀】致
    // 濒死的 dying-rescue 紧接着武器特效 qilin-pick) 会互相覆盖, 先到的选择
    // 连同其 pauseState 永久泄漏 → 软死锁。统一入口: 槽位空 → 设为当前;
    // 已占用 → 进入 FIFO 队列, 由 dispatcher 在前一个选择解决后依次弹出。
    function setPendingChoice(game, pending) {
      if (!game || !pending) return pending;
      if (game.pendingChoice && game.pendingChoice !== pending) {
        if (!game.pendingChoiceQueue) game.pendingChoiceQueue = [];
        game.pendingChoiceQueue.push(pending);
      } else {
        game.pendingChoice = pending;
      }
      return pending;
    }

    function shiftPendingChoiceQueue(game) {
      if (!game || game.pendingChoice) return;
      var queue = game.pendingChoiceQueue;
      if (queue && queue.length) game.pendingChoice = queue.shift();
    }

    // H2 (审计二轮): 判定阶段的延时锦囊结算 (如【闪电】命中) 把角色打入濒死
    // 并暂停等待救援时, processJudgeArea 会在 applyJudgeAreaOutcome 后挂起
    // (snapshot 带 outcomeApplied 标记)。该挂起没有专属 resolver (dying-rescue
    // / yiji-distribute 等各管各的), 统一由 dispatcher 在所有 pendingChoice
    // 排空后调用本函数续跑判定区剩余结算 + 摸牌/出牌阶段。
    function resumeSuspendedTurnFlowIfReady(game) {
      if (!game || game.pendingChoice || game.phase === 'gameover') return null;
      // v12 G2: 神速 — AI 座席在准备阶段发动神速, 虚拟【杀】向玩家开出
      // 闪响应窗口而挂起; 选择排空后从准备阶段末续跑 (判定→摸牌→出牌)。
      var savedPrepare = game.pauseState && game.pauseState.prepareResume;
      if (savedPrepare) {
        game.pauseState.prepareResume = null;
        if (game.phase === 'gameover') return success('游戏结束。');
        return continueTurnAfterPreparePhase(game, savedPrepare.actor);
      }
      // v12 H2: AOE (南蛮/万箭) 逐座席结算中某座席濒死暂停 → 救援选择排空后
      // 续跑队列剩余座席 (advanceAOETargets 完成后自清 pauseState.aoe)。
      var savedAOE = game.pauseState && game.pauseState.aoe;
      if (savedAOE && resumeAOETargets) {
        return resumeAOETargets(game);
      }
      var savedJudge = game.pauseState && game.pauseState.judgeArea;
      if (!savedJudge || !savedJudge.outcomeApplied) return null;
      var actor = savedJudge.actor;
      var resumeResult = processJudgeArea(game, actor);
      if (resumeResult && resumeResult.suspended) return success('回合暂停，等待玩家选择。');
      if (game.phase === 'gameover') return success('游戏结束。');
      return continueTurnAfterJudgeArea(game, actor);
    }

    // dispatcher 公共收尾: resolver 返回后弹出队列中的下一个选择; 若全部
    // 排空且存在被 H2 挂起的回合流程, 续跑之。
    function finishPendingChoiceResolution(game, result) {
      shiftPendingChoiceQueue(game);
      resumeSuspendedTurnFlowIfReady(game);
      return result;
    }

    // M6 (审计二轮): 全局挂起冻结守卫 — 任何 pendingChoice 未解决时, 拒绝
    // 一切推进游戏的公开入口 (出牌/技能/阶段推进/结束回合/弃牌)。此前可在
    // guohe-1v1-pick 等挂起时 endTurn, 甚至在对方回合 resolvePendingChoice。
    function pendingChoiceGuard(game) {
      if (game && game.pendingChoice) {
        return fail('有待处理的选择（' + game.pendingChoice.kind + '），请先调用 resolvePendingChoice。');
      }
      return null;
    }

    // v10 V3: response 专用 dispatcher (public 入口). 与 resolvePendingChoice
    // 区别: 此函数仅处理已注册的 response kind, 未注册 → fail.
    // V3 只迁移 shan-response; V4-V6 会陆续注册 wuxie / sha-duel 等.
    function resolveResponseChoice(game, decision) {
      var pending = game && game.pendingChoice;
      if (!pending) return fail('没有待处理的响应。');
      var resolver = RESPONSE_KIND_RESOLVERS[pending.kind];
      if (!resolver) return fail('未注册的响应类型：' + pending.kind);
      game.pendingChoice = null;
      return finishPendingChoiceResolution(game, resolver(game, pending, decision || {}));
    }

    return {
      requestPlayerResponse: requestPlayerResponse,
      RESPONSE_KIND_RESOLVERS: RESPONSE_KIND_RESOLVERS,
      registerResponseKind: registerResponseKind,
      setPendingChoice: setPendingChoice,
      shiftPendingChoiceQueue: shiftPendingChoiceQueue,
      resumeSuspendedTurnFlowIfReady: resumeSuspendedTurnFlowIfReady,
      finishPendingChoiceResolution: finishPendingChoiceResolution,
      pendingChoiceGuard: pendingChoiceGuard,
      resolveResponseChoice: resolveResponseChoice
    };
  }
