  function ensureTurnHistory(game) {
    if (!game.turnHistory) game.turnHistory = [];
    return game.turnHistory;
  }

  function recordPhase(game, actor, phase) {
    ensureTurnHistory(game).push({ actor: actor, phase: phase });
  }

  function setPhase(game, actor, phase) {
    game.phase = phase;
    // v15 V: 固政 只认"于此阶段内因其弃置而失去过的手牌" → 每次进入弃牌
    // 阶段重置本阶段记账 (跨回合残留会让固政拿到上一回合的牌)。
    if (phase === 'discard' && game[actor]) {
      game[actor].flags = game[actor].flags || {};
      game[actor].flags.discardPhaseCards = [];
    }
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
    // v15 T: 天义"额外次数上限 +1"的回合级计数
    state.shaExtraUses = 0;
    // v12 I2: 响应空窗记账随新回合 (摸牌) 失效 — 见 consumeResponse。
    state.aiRevealed = null;
    // v11 C8 (批次 32): 妄尊 等回合级手牌上限修正复位
    state.handLimitDelta = 0;
    var flags = ensureFlags(state);
    // v15 V (山包): 固政的弃牌阶段记账 + 挑衅/制霸的"每回合限一次" +
    // 放权的"跳过出牌阶段"标记 (回合结束时机消费, 跨回合不得残留)。
    flags.discardPhaseCards = [];
    flags.tiaoxinUsed = false;
    flags.zhibaUsed = false;
    flags.fangquanSkipped = false;
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
    // (v14 P2: v7 PR-15 的 flags.fangtianBonus 占位标记随真实现删除 —
    // 方天额外目标为使用时点的目标数上限, 无跨回合状态。)
    // v8 PR-C4: 青囊 出牌阶段限一次
    flags.qingnangUsed = false;
    // v11 C8 (批次 32): 结姻 每回合限一次 (批次 30 遗漏复位 — 修复为
    // 每回合而非每局一次)
    flags.jieyinUsed = false;
    // v12 H 复核修复: 黄天/离间 每回合限一次 (H7 新增时遗漏复位 → 实为每局
    // 一次)。与 jieyinUsed 同类, 回合开始/结束两处均复位。
    flags.huangtianUsed = false;
    flags.lijianUsed = false;
    // v15 T (火包): 强袭 出牌阶段限一次 / 天义 出牌阶段限一次 +
    // 天义拼点结果的回合级增益 (赢: 杀次数/距离/目标上限; 没赢: 不能使用杀)
    flags.qiangxiUsed = false;
    flags.quhuUsed = false;
    flags.tianyiUsed = false;
    flags.tianyiWon = false;
    flags.tianyiLost = false;
    // v14 R1: 蛊惑 "每名角色的回合内限一次" — 回合主的复位在此;
    // v15 S1: 打出流程接入后蛊惑可在任何角色的回合内发动 (响应窗口),
    // 故全场每席都随回合切换复位 → resetGuhuoTurnLimit (startTurn 调用)。
    flags.guhuoUsedThisTurn = false;
  }

  // v15 S1: "每名角色的回合内限一次" — 限次是按回合刷新的全场额度, 不是
  // 回合主专属。每个回合开始时清空所有座席的蛊惑发动记号 (响应窗口声明
  // 发生在他人回合内, 只复位回合主会让额度永久卡死)。
  function resetGuhuoTurnLimit(game) {
    if (!game) return;
    var seats = Array.isArray(game.seats) && game.seats.length ? game.seats : ['player', 'enemy'];
    seats.forEach(function (seat) {
      var state = game[seat];
      if (state) ensureFlags(state).guhuoUsedThisTurn = false;
    });
  }

  function resetEndOfTurnState(state) {
    if (!state) return;
    if (state.flags) state.flags.skipJudge = false;
    state.usedSha = false;
    state.usedOrRespondedSha = false;
    state.shaBonus = 0;
    state.shaExtraUses = 0;
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
    // (v14 P2: flags.fangtianBonus 占位标记已随真实现删除。)
    // v8 PR-C4: 青囊 一次性标记复位
    flags.qingnangUsed = false;
    // v11 C8 (批次 32): 结姻 复位 (批次 30 遗漏修复)
    flags.jieyinUsed = false;
    // v12 H 复核修复: 黄天/离间 每回合限一次复位 (回合结束侧)。
    flags.huangtianUsed = false;
    flags.lijianUsed = false;
    // v15 T (火包): 强袭/天义 每回合限一次 (回合结束侧同步复位);
    // 天义的回合级增益 (次数/距离/目标上限, 或"不能使用杀") 一并清除。
    flags.qiangxiUsed = false;
    flags.quhuUsed = false;
    flags.tianyiUsed = false;
    flags.tianyiWon = false;
    flags.tianyiLost = false;
    // 双雄的回合级转化授权同样回合结束清除。
    flags.shuangxiongColor = null;
  }

  export const PhaseRuntime = {
    ensureTurnHistory: ensureTurnHistory,
    recordPhase: recordPhase,
    setPhase: setPhase,
    nextPlayablePhase: nextPlayablePhase,
    resetActorTurnState: resetActorTurnState,
    resetEndOfTurnState: resetEndOfTurnState,
    resetGuhuoTurnLimit: resetGuhuoTurnLimit
  };
