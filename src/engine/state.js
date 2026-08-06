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
    zhangba: { zhangbaTwoHandSha: true },
    // v13 J0-3: 藤甲① "南蛮入侵/万箭齐发/普通杀对你无效" — 免疫短路在
    // 响应询问前 (sha-flow.js / tricks.js 查此 flag); 藤甲② 火伤 +1 仍在
    // equipment.js EQUIPMENT_DAMAGE_MODIFIERS。
    tengjia: { tengjiaImmuneNormalShaAOE: true }
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

  // v15 T: 虚拟装备层 — "视为装备着某装备牌"的锁定技。挂在
  // hasEquipmentEffect 这个单点上 (装备判断零容忍红线要求所有装备效果
  // 查询都过此出口), 因此这类技能对既有装备面 (八卦判定/青釭无视防具/
  // 乐不思蜀等) 自动一致, 无需逐处补判。
  //   bazhen 八阵 (卧龙诸葛亮): 锁定技, 装备区里没有防具牌时视为装备
  //   着【八卦阵】(card__hero__shu.md:336 逐字)。
  var VIRTUAL_EQUIPMENT_SKILLS = [
    { skill: 'bazhen', as: 'bagua', slot: 'armor' }
  ];

  function virtualEquipmentTypes(state) {
    if (!state) return [];
    return VIRTUAL_EQUIPMENT_SKILLS.filter(function (entry) {
      // "装备区里没有防具牌" — 真实防具在位时虚拟层让位 (官方口径);
      // hasSkill 走统一出口 → 缠怨 hp1 压制等对锁定技照常生效。
      if (!hasSkill(state, entry.skill)) return false;
      return !(state.equipment && state.equipment[entry.slot]);
    }).map(function (entry) { return entry.as; });
  }

  function hasEquipmentEffect(state, effectName) {
    var equipped = equipmentSlots(state).some(function (card) {
      return !!equipmentEffectValue(card.type, effectName);
    });
    if (equipped) return true;
    return virtualEquipmentTypes(state).some(function (type) {
      return !!equipmentEffectValue(type, effectName);
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

  // v12 H3: 座席选项校验 — options.target 等外部传入值必须是当前对局的
  // 合法座席名, 否则返回 null (调用方决定回退默认或拒绝)。
  function resolveSeatOption(game, value) {
    if (!value) return null;
    return normalizeSeats(game).indexOf(value) >= 0 && game[value] ? value : null;
  }

  // v12 H5: 身份阵营 — 主公/忠臣 同阵营 (lordSide), 反贼 同阵营 (rebelSide),
  // 内奸 (renegade) 与所有人互为敌对。roles/roleSides 缺失 (手搓局面) 时
  // 返回 null, 调用方按"所有非己座席敌对"处理 (1v1 兼容)。
  function sideOf(game, seat) {
    if (!game || !game.roles || !game.roleSides) return null;
    var role = game.roles[seat];
    return (role && game.roleSides[role]) || null;
  }

  function isHostileSeat(game, actor, seat) {
    if (seat === actor) return false;
    var actorSide = sideOf(game, actor);
    var seatSide = sideOf(game, seat);
    if (!actorSide || !seatSide) return true; // 无身份信息 → 敌对 (1v1 兼容)
    if (actorSide === 'renegade' || seatSide === 'renegade') return true;
    return actorSide !== seatSide;
  }

  // 敌对存活座席; 全场无敌对 (理论不出现) 时回退所有其他存活座席。
  function hostileSeats(game, actor) {
    var hostile = aliveSeats(game).filter(function (seat) { return isHostileSeat(game, actor, seat); });
    if (hostile.length) return hostile;
    return aliveSeats(game).filter(function (seat) { return seat !== actor; });
  }

  // v13 评审收口: 候选内敌对优先池 — 候选中有敌对座席则只留敌对, 否则
  // 原样返回 (天香转移/雷击/突袭等"敌对优先"目标挑选共用, 消除三处复制)。
  function hostileFirstPool(game, actor, candidates) {
    var hostiles = (candidates || []).filter(function (seat) { return isHostileSeat(game, actor, seat); });
    return hostiles.length ? hostiles : (candidates || []);
  }

  // v13 评审收口: actor 攻击范围内的其他存活座席 (天香 ask 面板候选与
  // AI auto 转移候选共用, 消除两处谓词漂移风险)。
  function seatsInShaRangeOf(game, actor) {
    return aliveSeats(game).filter(function (seat) {
      return seat !== actor && game[seat] && game[seat].hp > 0
        && canReachWithSha(game, actor, seat);
    });
  }

  // ───── v13 M: 暗身份 — 可见性/立场遥测/推断/感知路由 ─────────────────
  // 官方 glossary__card.md:11 "除了主公外, 一名角色的身份牌在其因死亡而
  // 亮出前对其他角色不可见"。规则层 (胜负/奖惩/求助资格/救援加成) 仍读
  // 真实身份 (结算发生在公开事件后或判定对象恒为公开主公); AI 知识层
  // (目标评估/立场判断) 一律经下方 perceived* 路由 — 明置模式恒等直读
  // (零回归), 暗置模式只允许 自己/已翻明 直读, 其余走行为推断。

  function isRoleRevealed(game, seat) {
    if (!game || !game.hiddenRoles) return true; // 明置模式全公开
    if (!game.roleRevealed) return true;
    return !!game.roleRevealed[seat];
  }

  // v13 M3: 立场遥测 (纯记账, 规则层零读取) — 救援/无懈方向/求助响应。
  // entry: { type: 'rescue'|'wuxie'|'aid', source, beneficiary? , against? }
  // 环形上限 60 (与 aggressionLog 同口径)。
  function recordStance(game, entry) {
    if (!game || !entry || !entry.source) return;
    if (entry.beneficiary === entry.source || entry.against === entry.source) return; // 自利不算立场证据
    if (!game.stanceLog) game.stanceLog = [];
    game.stanceLog.push(entry);
    if (game.stanceLog.length > 60) game.stanceLog.shift();
  }

  function lordSeatOf(game) {
    var seats = normalizeSeats(game);
    for (var i = 0; i < seats.length; i += 1) {
      if (game.roles && game.roles[seats[i]] === '主公') return seats[i];
    }
    return null;
  }

  // v13 M3: 行为推断 — seat 的阵营倾向分 (>0 反贼倾向, <0 主忠倾向)。
  // 证据面: aggressionLog (伤害方向: 打主公/已翻明席) + stanceLog (救援/
  // 无懈/求助的受益方向)。纯读取无缓存 (双 log 环形上限 60, 扫描可忽略)。
  function inferredLeaning(game, seat) {
    var lord = lordSeatOf(game);
    var score = 0;
    var agg = game.aggressionLog || [];
    for (var a = 0; a < agg.length; a += 1) {
      var hit = agg[a];
      if (hit.source === seat) {
        if (hit.target === lord) {
          score += hit.amount * 3; // 对主公出伤害 → 强反贼信号
        } else if (isRoleRevealed(game, hit.target)) {
          var hitSide = sideOf(game, hit.target);
          if (hitSide === 'lordSide') score += hit.amount * 2;
          else if (hitSide === 'rebelSide') score -= hit.amount * 2;
        }
      } else if (hit.target === seat && hit.source === lord) {
        score += hit.amount; // 主公针对谁, 谁嫌疑微增
      }
    }
    var st = game.stanceLog || [];
    for (var s = 0; s < st.length; s += 1) {
      var ev = st[s];
      if (ev.source !== seat) continue;
      var w = ev.type === 'aid' ? 4 : ev.type === 'rescue' ? 3 : 2;
      var helped = ev.beneficiary || null;
      var harmed = ev.against || null;
      var helpedSide = helped ? (helped === lord ? 'lordSide' : (isRoleRevealed(game, helped) ? sideOf(game, helped) : null)) : null;
      var harmedSide = harmed ? (harmed === lord ? 'lordSide' : (isRoleRevealed(game, harmed) ? sideOf(game, harmed) : null)) : null;
      if (helpedSide === 'lordSide') score -= w;
      else if (helpedSide === 'rebelSide') score += w;
      if (harmedSide === 'lordSide') score += w;
      else if (harmedSide === 'rebelSide') score -= w;
    }
    return score;
  }

  // v13 M2/M3: viewer 视角的座席阵营感知 — 自己/已翻明 → 真值;
  // 暗置 → 推断 (证据不足返回 null = 未知)。明置模式恒真值。
  var INFER_THRESHOLD = 2;
  function perceivedSideOf(game, viewer, seat) {
    if (seat === viewer || isRoleRevealed(game, seat)) return sideOf(game, seat);
    var lean = inferredLeaning(game, seat);
    if (lean >= INFER_THRESHOLD) return 'rebelSide';
    if (lean <= -INFER_THRESHOLD) return 'lordSide';
    return null;
  }

  // v13 M2: 感知敌对 — AI 知识层的 isHostileSeat 替身。暗置下未知座席
  // 按"无身份信息 → 敌对"缺省 (与 1v1 兜底同口径, 保持进攻性; 反贼间
  // 互殴直至证据出现属官方暗身份局的真实信息态)。viewer 为内奸时全敌对
  // (骑墙偏好在 aiPickHostileTarget 打分层)。
  function perceivedHostile(game, viewer, seat) {
    if (seat === viewer) return false;
    if (!game || !game.hiddenRoles) return isHostileSeat(game, viewer, seat);
    if (isRoleRevealed(game, seat)) return isHostileSeat(game, viewer, seat);
    var mySide = sideOf(game, viewer); // 自己身份自知
    if (!mySide || mySide === 'renegade') return true;
    var guessed = perceivedSideOf(game, viewer, seat);
    if (!guessed || guessed === 'renegade') return true;
    return guessed !== mySide;
  }

  function perceivedHostileSeats(game, viewer) {
    var hostile = aliveSeats(game).filter(function (seat) { return perceivedHostile(game, viewer, seat); });
    if (hostile.length) return hostile;
    return aliveSeats(game).filter(function (seat) { return seat !== viewer; });
  }

  function perceivedHostileFirstPool(game, viewer, candidates) {
    var hostiles = (candidates || []).filter(function (seat) { return perceivedHostile(game, viewer, seat); });
    return hostiles.length ? hostiles : (candidates || []);
  }

  function hasSkill(state, skillId) {
    // v14 R1 缠怨 (蛊惑质疑真牌惩罚): 锁定技 — 体力值为 1 时除「缠怨」外
    // 技能无效。武将技能归属统一经本闸判定, 此处单点压制即全局生效
    // (装备技走 hasEquipmentEffect, 不在压制面 — 口径见 R1 执行记录;
    // 被动效果面 skill-runtime.hasPassiveEffect 同步双闸)。
    if (state && state.chanyuan && state.hp === 1 && skillId !== 'chanyuan') return false;
    return !!(state.skills || []).some(function (skill) { return skill.id === skillId; });
  }

  function canUseUnlimitedSha(state) {
    return SkillRuntime.hasPassiveEffect(state, 'unlimitedSha') || hasEquipmentEffect(state, 'unlimitedSha');
  }

  // v15 T: 本回合还能不能再使用【杀】 — 咆哮/诸葛连弩 无限, 天义赢的
  // "额外次数上限 +1" 走 shaExtraUses 计数, 天义没赢的"本回合内不能使用
  // 【杀】"是硬闸 (优先于一切次数面)。
  function shaUseAllowed(state) {
    if (!state) return false;
    if (state.flags && state.flags.tianyiLost) return false;
    if (!state.usedSha) return true;
    if (canUseUnlimitedSha(state)) return true;
    return (state.shaExtraUses || 0) > 0;
  }

  function weaponRange(state) {
    return state && state.equipment && state.equipment.weapon && state.equipment.weapon.range ? state.equipment.weapon.range : 1;
  }

  function distanceBetween(game, fromActor, toActor) {
    var from = game[fromActor];
    var to = game[toActor];
    if (!from || !to) return Infinity;
    // v13 审计三轮: 座次环距离剔除已阵亡座席 (官方: 计算距离时跳过已死亡
    // 角色)。3 席死 1 人时两种算法同值, 4-5 席 (v13 K) 起才有可观测差异。
    var seats = normalizeSeats(game).filter(function (seat) {
      return seat === fromActor || seat === toActor
        || (game[seat] && typeof game[seat].hp === 'number' && game[seat].hp > 0);
    });
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

  // v15 T 评审收口 [中]: **使用【杀】** 的距离面 ≠ 攻击范围面。
  // 天义拼点赢是"于此回合内使用【杀】无距离限制" (card__hero__wu.md:355) —
  // 只放宽前者; 强袭/驱虎/借刀/濒死求助那类"攻击范围内的角色"仍读裸的
  // canReachWithSha。此前该加成只落在 playSha 的结算层, 目标枚举面
  // (isLegalCardTarget → UI 高亮 / AI aiShaTargetSeat) 没接 → 官方三项
  // 收益里 UI/AI 实际只拿得到"额外次数 +1"。
  function shaUseReachAllowed(game, actor, targetActor) {
    var self = game[actor];
    if (self && self.flags && self.flags.tianyiWon) return true;
    return canReachWithSha(game, actor, targetActor);
  }

  // v13 L1 (硬缺陷修复): 此前只查 player/enemy 两个字面键 — 身份轮转后
  // 主公可落任意座席 (ally/ally2/ally3), 先手会错判回 fallback。改为按
  // seats 座次序扫描 (兼容旧 2 参调用: seats 传数组之外的值时走缺省环)。
  function firstActorFromRoles(roles, seats, fallback) {
    var order = Array.isArray(seats) && seats.length ? seats : ['player', 'enemy'];
    if (!Array.isArray(seats) && typeof seats === 'string' && fallback === undefined) fallback = seats;
    for (var i = 0; i < order.length; i += 1) {
      if (roles && roles[order[i]] === '主公') return order[i];
    }
    return fallback || 'player';
  }

  function handLimit(game, actor) {
    var state = game[actor];
    // v12 G2: 不屈 — 武将牌上有"创"时, 手牌上限 = 体力上限 - "创"数
    // (gltjk wind spec), 妄尊等回合级修正照常叠加。
    if (state.chuang && state.chuang.length > 0) {
      return Math.max(0, (state.maxHp || 0) - state.chuang.length + (state.handLimitDelta || 0));
    }
    // v11 C8 (批次 32): handLimitDelta — 回合级手牌上限修正 (妄尊 -1 等),
    // 由 resetActorTurnState / resetEndOfTurnState 复位。
    // v15 T: 血裔 (袁绍) — 主公技锁定技, 手牌上限 +2X。
    return Math.max(0, (state.hp || 0) + (state.handLimitDelta || 0) + xueyiHandLimitBonus(game, actor));
  }

  // v15 T: 血裔 — "主公技，锁定技，你的手牌上限+2X（X为其他群势力角色数）"
  // (card__hero__neutral.md:151 逐字)。主公技随身份场激活 (1v1 无身份 →
  // 恒 0, 与激将/护驾/妄尊同惯例); X 按**存活**的其他群势力角色计
  // (阵亡角色不再是场上角色)。锁定技 → 无开关, 但走 hasSkill 统一出口
  // (缠怨 hp1 压制照常)。
  function xueyiHandLimitBonus(game, actor) {
    var state = game && game[actor];
    if (!state || !hasSkill(state, 'xueyi')) return 0;
    if (!game.roles || game.roles[actor] !== '主公') return 0;
    var others = aliveSeats(game).filter(function (seat) {
      return seat !== actor && game[seat] && game[seat].camp === '群';
    });
    return 2 * others.length;
  }

  // v12 G2: 红颜 (小乔) — 锁定技"你的黑桃牌视为红桃牌"的花色视同层。
  // 只做"读取视图", 不改物理牌 (朱雀教训: 判定/弃置的物理牌不可污染)。
  function effectiveCardSuit(state, card) {
    if (!card) return null;
    if (state && hasSkill(state, 'hongyan') && card.suit === 'spade') return 'heart';
    return card.suit;
  }

  function effectiveCardColor(state, card) {
    if (!card) return null;
    if (state && hasSkill(state, 'hongyan') && card.suit === 'spade') return 'red';
    return card.color;
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
    resolveSeatOption: resolveSeatOption,
    sideOf: sideOf,
    isHostileSeat: isHostileSeat,
    hostileSeats: hostileSeats,
    hostileFirstPool: hostileFirstPool,
    // v13 M: 暗身份 — 可见性/遥测/推断/感知路由 (AI 知识层统一入口)。
    isRoleRevealed: isRoleRevealed,
    recordStance: recordStance,
    lordSeatOf: lordSeatOf,
    inferredLeaning: inferredLeaning,
    perceivedSideOf: perceivedSideOf,
    perceivedHostile: perceivedHostile,
    perceivedHostileSeats: perceivedHostileSeats,
    perceivedHostileFirstPool: perceivedHostileFirstPool,
    seatsInShaRangeOf: seatsInShaRangeOf,
    opponent: opponent,
    hasSkill: hasSkill,
    canUseUnlimitedSha: canUseUnlimitedSha,
    shaUseAllowed: shaUseAllowed,
    hasEquipmentEffect: hasEquipmentEffect,
    sumEquipmentEffect: sumEquipmentEffect,
    weaponRange: weaponRange,
    distanceBetween: distanceBetween,
    canReachWithSha: canReachWithSha,
    shaUseReachAllowed: shaUseReachAllowed,
    firstActorFromRoles: firstActorFromRoles,
    handLimit: handLimit,
    effectiveCardSuit: effectiveCardSuit,
    effectiveCardColor: effectiveCardColor,
    getActorStatus: getActorStatus,
    aliveActorCount: aliveActorCount
  };
