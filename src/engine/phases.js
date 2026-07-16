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
    // v12 I2: 响应空窗记账随新回合 (摸牌) 失效 — 见 consumeResponse。
    state.aiRevealed = null;
    // v11 C8 (批次 32): 妄尊 等回合级手牌上限修正复位
    state.handLimitDelta = 0;
    var flags = ensureFlags(state);
    flags.skipPlay = false;
    flags.skipDraw = false;
    // v12 G2: 神速 选项一 — 跳过判定阶段标记 (回合级)
    flags.skipJudge = false;
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
    // v8 PR-C4: 青囊 出牌阶段限一次
    flags.qingnangUsed = false;
    // v11 C8 (批次 32): 结姻 每回合限一次 (批次 30 遗漏复位 — 修复为
    // 每回合而非每局一次)
    flags.jieyinUsed = false;
    // v12 H 复核修复: 黄天/离间 每回合限一次 (H7 新增时遗漏复位 → 实为每局
    // 一次)。与 jieyinUsed 同类, 回合开始/结束两处均复位。
    flags.huangtianUsed = false;
    flags.lijianUsed = false;
  }

  function resetEndOfTurnState(state) {
    if (!state) return;
    if (state.flags) state.flags.skipJudge = false;
    state.usedSha = false;
    state.usedOrRespondedSha = false;
    state.shaBonus = 0;
    // v11 C8 (批次 32): 回合结束同样清掉手牌上限修正
    state.handLimitDelta = 0;
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
    // v8 PR-C4: 青囊 一次性标记复位
    flags.qingnangUsed = false;
    // v11 C8 (批次 32): 结姻 复位 (批次 30 遗漏修复)
    flags.jieyinUsed = false;
    // v12 H 复核修复: 黄天/离间 每回合限一次复位 (回合结束侧)。
    flags.huangtianUsed = false;
    flags.lijianUsed = false;
  }

  export const PhaseRuntime = {
    ensureTurnHistory: ensureTurnHistory,
    recordPhase: recordPhase,
    setPhase: setPhase,
    nextPlayablePhase: nextPlayablePhase,
    resetActorTurnState: resetActorTurnState,
    resetEndOfTurnState: resetEndOfTurnState
  };
