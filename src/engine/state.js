(function () {
  'use strict';

  var modules = window.SanguoshaEngineModules || (window.SanguoshaEngineModules = {});
  var SkillRuntime = modules.SkillRuntime;

  function actorName(game, actor) {
    return game[actor].name;
  }

  function opponent(actor) {
    return actor === 'player' ? 'enemy' : 'player';
  }

  function hasSkill(state, skillId) {
    return !!(state.skills || []).some(function (skill) { return skill.id === skillId; });
  }

  function canUseUnlimitedSha(state) {
    return SkillRuntime.hasPassiveEffect(state, 'unlimitedSha') || (state.equipment && state.equipment.weapon && state.equipment.weapon.type === 'zhuge');
  }

  function weaponRange(state) {
    return state && state.equipment && state.equipment.weapon && state.equipment.weapon.range ? state.equipment.weapon.range : 1;
  }

  function distanceBetween(game, fromActor, toActor) {
    var from = game[fromActor];
    var to = game[toActor];
    if (!from || !to) return Infinity;
    var distance = 1;
    if (to.equipment && to.equipment.horsePlus) distance += 1;
    if (from.equipment && from.equipment.horseMinus) distance -= 1;
    distance += SkillRuntime.sumPassiveEffect(from, 'outgoingDistance');
    return Math.max(1, distance);
  }

  function canReachWithSha(game, actor, targetActor) {
    return distanceBetween(game, actor, targetActor) <= weaponRange(game[actor]);
  }

  function firstActorFromRoles(roles, fallback) {
    if (roles.player === '主公') return 'player';
    if (roles.enemy === '主公') return 'enemy';
    return fallback || 'player';
  }

  function handLimit(game, actor) {
    var state = game[actor];
    return Math.max(0, state.hp || 0);
  }

  function getActorStatus(game, actor) {
    var state = game && game[actor];
    if (!state) return '未知';
    return state.chained ? '铁索横置' : '未横置';
  }

  modules.StateRuntime = {
    actorName: actorName,
    opponent: opponent,
    hasSkill: hasSkill,
    canUseUnlimitedSha: canUseUnlimitedSha,
    weaponRange: weaponRange,
    distanceBetween: distanceBetween,
    canReachWithSha: canReachWithSha,
    firstActorFromRoles: firstActorFromRoles,
    handLimit: handLimit,
    getActorStatus: getActorStatus
  };
}());
