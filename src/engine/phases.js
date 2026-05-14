  function ensureTurnHistory(game) {
    if (!game.turnHistory) game.turnHistory = [];
    return game.turnHistory;
  }

  function recordPhase(game, actor, phase) {
    ensureTurnHistory(game).push({ actor: actor, phase: phase });
  }

  function setPhase(game, actor, phase) {
    game.phase = phase;
    recordPhase(game, actor, phase);
    return phase;
  }

  function nextPlayablePhase(state) {
    return state && state.flags && state.flags.skipPlay ? 'discard' : 'play';
  }

  function ensureFlags(state) {
    state.flags = state.flags || {};
    return state.flags;
  }

  function resetActorTurnState(state) {
    if (!state) return;
    state.usedSha = false;
    state.usedOrRespondedSha = false;
    state.shaBonus = 0;
    var flags = ensureFlags(state);
    flags.skipPlay = false;
    flags.skipDraw = false;
    flags.zhihengUsed = false;
    flags.fanjianUsed = false;
    flags.guanxingUsed = false;
    flags.rendeGiven = 0;
    flags.rendeHealed = false;
    flags.aiKurouUsed = false;
    flags.luoyi = false;
    // v7 PR-8: gltjk card__basic.md 酒 使用方法Ⅰ "出牌阶段。每回合限一次。"
    flags.jiuUsedThisTurn = false;
    // v7 PR-15: 方天画戟 额外目标 +2 触发标记 (per-sha, 清零是 defensive)
    flags.fangtianBonus = false;
  }

  function resetEndOfTurnState(state) {
    if (!state) return;
    state.usedSha = false;
    state.usedOrRespondedSha = false;
    state.shaBonus = 0;
    var flags = ensureFlags(state);
    flags.zhihengUsed = false;
    flags.fanjianUsed = false;
    flags.guanxingUsed = false;
    flags.rendeGiven = 0;
    flags.rendeHealed = false;
    flags.aiKurouUsed = false;
    flags.biyueTriggered = false;
    flags.luoyi = false;
    // v7 PR-8: 酒 使用次数也在回合结束时复位
    flags.jiuUsedThisTurn = false;
    // v7 PR-15: 方天画戟 标记也在回合结束时复位
    flags.fangtianBonus = false;
  }

  export const PhaseRuntime = {
    ensureTurnHistory: ensureTurnHistory,
    recordPhase: recordPhase,
    setPhase: setPhase,
    nextPlayablePhase: nextPlayablePhase,
    resetActorTurnState: resetActorTurnState,
    resetEndOfTurnState: resetEndOfTurnState
  };
