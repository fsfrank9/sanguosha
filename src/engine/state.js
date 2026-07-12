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
    zhuque:  { zhuqueShaToFire: true },
    // v8 PR-B4: 银月枪 — 回合外用/打出黑色手牌时, 可令攻击范围内一名角色
    // 选打闪或受 1 dmg (marker; 实际在 consumeResponse / consumeWuxie 内)
    yinyue:  { yinyueOutOfTurnBlackHit: true },
    // v11 E1 (批次 35): 装备副作用 handler 收口 — 引擎规则文件不再出现
    // 裸 `.type === 'xxx'` 装备判断, 一律经此注册表查 flag; 复杂伤害修正
    // (藤甲/古锭/白银/寒冰) 的 handler 本体收进 equipment.js 的
    // EQUIPMENT_DAMAGE_MODIFIERS 有序表。
    bagua:   { baguaShanJudge: true },
    guanshi: { guanshiForceHit: true },
    qinglong:{ qinglongChase: true },
    fangtian:{ fangtianLastHandBonus: true },
    zhangba: { zhangbaTwoHandSha: true }
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

  function normalizeSeats(game) {
    if (game && Array.isArray(game.seats) && game.seats.length) return game.seats.slice();
    return ['player', 'enemy'];
  }

  function seatList(game) {
    return normalizeSeats(game);
  }

  function aliveSeats(game) {
    return normalizeSeats(game).filter(function (actor) {
      var state = game && game[actor];
      return state && typeof state.hp === 'number' && state.hp > 0;
    });
  }

  function nextSeat(game, actor, includeDead) {
    var seats = normalizeSeats(game);
    var idx = seats.indexOf(actor);
    if (idx < 0) return seats[0] || null;
    for (var step = 1; step <= seats.length; step += 1) {
      var candidate = seats[(idx + step) % seats.length];
      if (includeDead || aliveSeats(game).indexOf(candidate) >= 0) return candidate;
    }
    return actor;
  }

  function seatsFrom(game, actor, includeSelf) {
    var seats = normalizeSeats(game);
    var idx = seats.indexOf(actor);
    if (idx < 0) return seats.slice();
    var ordered = [];
    // v12 修复: 循环上界恒为 seats.length — 此前 includeSelf=false 时上界
    // 为 seats.length+1, 最后一步 (idx+len)%len 绕回 actor 自己 (off-by-one)。
    for (var step = includeSelf ? 0 : 1; step < seats.length; step += 1) {
      ordered.push(seats[(idx + step) % seats.length]);
    }
    return ordered;
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
    var seats = normalizeSeats(game);
    var fromIdx = seats.indexOf(fromActor);
    var toIdx = seats.indexOf(toActor);
    var ring = seats.length > 1 && fromIdx >= 0 && toIdx >= 0
      ? Math.min((toIdx - fromIdx + seats.length) % seats.length, (fromIdx - toIdx + seats.length) % seats.length)
      : 1;
    var distance = Math.max(1, ring);
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
    // v11 C8 (批次 32): handLimitDelta — 回合级手牌上限修正 (妄尊 -1 等),
    // 由 resetActorTurnState / resetEndOfTurnState 复位。
    return Math.max(0, (state.hp || 0) + (state.handLimitDelta || 0));
  }

  function getActorStatus(game, actor) {
    var state = game && game[actor];
    if (!state) return '未知';
    return state.chained ? '铁索横置' : '未横置';
  }

  function aliveActorCount(game) {
    if (!game) return 0;
    var actors = normalizeSeats(game);
    var count = 0;
    for (var i = 0; i < actors.length; i += 1) {
      var s = game[actors[i]];
      if (s && typeof s.hp === 'number' && s.hp > 0) count += 1;
    }
    return count;
  }

  export const StateRuntime = {
    actorName: actorName,
    seatList: seatList,
    aliveSeats: aliveSeats,
    nextSeat: nextSeat,
    seatsFrom: seatsFrom,
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
