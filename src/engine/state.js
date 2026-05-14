  import { SkillRuntime } from './skill-runtime.js';

  // v6D: declarative equipment-passive-effect registry, mirroring
  // SkillRuntime's PASSIVE_EFFECTS. Each entry maps an equipment type to a
  // bag of named effects that other engine helpers query via
  // hasEquipmentEffect / sumEquipmentEffect. Only effects that fit a
  // boolean-or-numeric flag form belong here; side-effecting equipment
  // (bagua auto-judge, qinglong re-Sha, tengjia/baiyin damage maths) stays
  // as bespoke handlers in game-engine.js for now.
  var EQUIPMENT_EFFECTS = {
    zhuge:   { unlimitedSha: true },
    qinggang:{ ignoreArmorOnSha: true },
    renwang: { blockBlackSha: true },
    // v8 PR-B1: 寒冰剑 — marker; 实际逻辑在 game-engine.js damage() 内
    // (需要访问目标手牌/装备/判定区做 2 张挑选, 不适合纯 boolean flag)
    hanbing: { hanbingPreventOnHit: true },
    // v8 PR-B2: 古锭刀 — 锁定技, 杀命中目标无手牌时 伤害+1
    guding:  { gudingNoHandPlus1: true },
    // v8 PR-B3: 朱雀羽扇 — 可将普通杀转化为火杀 (marker; 实际在 playSha 内)
    zhuque:  { zhuqueShaToFire: true }
  };

  function equipmentSlots(state) {
    if (!state || !state.equipment) return [];
    return ['weapon', 'armor', 'horsePlus', 'horseMinus']
      .map(function (slot) { return state.equipment[slot]; })
      .filter(function (card) { return !!card; });
  }

  function equipmentEffectValue(equipmentType, effectName) {
    var effects = EQUIPMENT_EFFECTS[equipmentType];
    if (!effects) return undefined;
    return effects[effectName];
  }

  function hasEquipmentEffect(state, effectName) {
    return equipmentSlots(state).some(function (card) {
      return !!equipmentEffectValue(card.type, effectName);
    });
  }

  function sumEquipmentEffect(state, effectName) {
    return equipmentSlots(state).reduce(function (total, card) {
      var value = equipmentEffectValue(card.type, effectName);
      return total + (typeof value === 'number' ? value : 0);
    }, 0);
  }

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
    return SkillRuntime.hasPassiveEffect(state, 'unlimitedSha') || hasEquipmentEffect(state, 'unlimitedSha');
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

  function aliveActorCount(game) {
    if (!game) return 0;
    var actors = ['player', 'enemy'];
    var count = 0;
    for (var i = 0; i < actors.length; i += 1) {
      var s = game[actors[i]];
      if (s && typeof s.hp === 'number' && s.hp > 0) count += 1;
    }
    return count;
  }

  export const StateRuntime = {
    actorName: actorName,
    opponent: opponent,
    hasSkill: hasSkill,
    canUseUnlimitedSha: canUseUnlimitedSha,
    hasEquipmentEffect: hasEquipmentEffect,
    sumEquipmentEffect: sumEquipmentEffect,
    weaponRange: weaponRange,
    distanceBetween: distanceBetween,
    canReachWithSha: canReachWithSha,
    firstActorFromRoles: firstActorFromRoles,
    handLimit: handLimit,
    getActorStatus: getActorStatus,
    aliveActorCount: aliveActorCount
  };
