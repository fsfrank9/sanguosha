(function () {
  'use strict';

  var modules = window.SanguoshaEngineModules || (window.SanguoshaEngineModules = {});

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
  }

  modules.PhaseRuntime = {
    ensureTurnHistory: ensureTurnHistory,
    recordPhase: recordPhase,
    setPhase: setPhase,
    nextPlayablePhase: nextPlayablePhase,
    resetActorTurnState: resetActorTurnState,
    resetEndOfTurnState: resetEndOfTurnState
  };
}());
