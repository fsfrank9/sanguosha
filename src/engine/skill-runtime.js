  function annotateSkillStatus(heroCatalog, implementedSkillIds, activeSkillIds) {
    Object.keys(heroCatalog).forEach(function (heroId) {
      (heroCatalog[heroId].skills || []).forEach(function (skill) {
        if (implementedSkillIds.indexOf(skill.id) >= 0) {
          skill.status = 'implemented';
          skill.statusText = activeSkillIds.indexOf(skill.id) >= 0 ? '可主动发动' : '已实现：自动/锁定触发';
        } else if (skill.lord) {
          skill.status = 'display';
          skill.statusText = '1v1 展示技';
        } else {
          skill.status = 'todo';
          skill.statusText = '未实现';
        }
      });
    });
  }

  var PASSIVE_EFFECTS = {
    paoxiao: {
      unlimitedSha: true
    },
    mashu: {
      outgoingDistance: -1
    },
    qicai: {
      ignoreTrickDistance: true
    }
  };

  function skillEffectValue(skillId, effectName) {
    var effects = PASSIVE_EFFECTS[skillId];
    if (!effects) return undefined;
    return effects[effectName];
  }

  // AA1: 技能拥有、来源与有效性的唯一裁决。所有状态均为普通 JSON 数据；
  // 不保存 game/owner 引用，也不依赖 WeakMap，克隆后的查询只读当前副本。
  var LORD_SKILL_IDS = { hujia: true, jijiang: true, jiuyuan: true, huangtian: true,
    xueyi: true, songwei: true, baonue: true, ruoyu: true, zhiba: true };
  var legacySkillQueryCount = 0;
  var allSkillsLostHandler = null;

  function localSkillSources(state, skillId) {
    if (!state) return [];
    var records = (state.skills || []).filter(function (entry) { return entry.id === skillId; })
      .map(function (entry) {
        return { source: entry.granted ? 'granted' : 'native', enabled: true, skill: entry };
      });
    (state.dynamicSkills || []).forEach(function (entry) {
      if (entry.id === skillId) records.push({ source: entry.source,
        enabled: entry.enabled !== false, skill: entry });
    });
    // 兼容既有只设置旗标的存档/测试；正常蛊惑授予同时写入技能记录。
    if (skillId === 'chanyuan' && state.chanyuan && !records.length) {
      records.push({ source: 'granted', enabled: true, skill: { id: 'chanyuan', name: '缠怨' } });
    }
    return records;
  }

  function isSuppressed(state, skillId) {
    // 武魂直接死亡不先失去体力；死亡时技能仍按原体力值判缠怨。
    // hp=0只是当前座席存活索引的内部标志，不能因此解除原HP1禁用。
    var hp = state && state.directDeathHp !== undefined ? state.directDeathHp : state && state.hp;
    return !!(state && hp === 1 && skillId !== 'chanyuan'
      && localSkillSources(state, 'chanyuan').some(function (entry) { return entry.enabled; }));
  }

  function gameSeats(game) {
    return game && game.seats && game.seats.length ? game.seats : ['player', 'enemy'];
  }

  function realLordState(game) {
    if (!game || !game.roles) return null;
    var seat = gameSeats(game).find(function (entry) { return game.roles[entry] === '主公'; });
    return seat ? game[seat] : null;
  }

  function viewedSources(state, skillId, game) {
    var lord = realLordState(game);
    if (!state || !lord || lord === state || isSuppressed(state, 'weidi')
        || !localSkillSources(state, 'weidi').some(function (entry) { return entry.enabled; })) return [];
    // 伪帝依赖主公“拥有”，不把主公本人的暂时技能无效复制到袁术。
    return localSkillSources(lord, skillId).filter(function (entry) {
      return LORD_SKILL_IDS[skillId] || entry.skill.lord;
    }).map(function (entry) {
      return { source: 'weidi', enabled: true, skill: entry.skill };
    });
  }

  function skillState(state, skillId, game) {
    // 查询只描述“现在”的技能：新时机/下一张响应牌均重算。已经发动的效果
    // 由调用域的 flags/响应帧保留（天义、双雄、无双等），本层不撤销、不重算
    // 已付成本或已经锁定的响应次数。完杀等持续资格自然随此查询实时变化。
    var sources = localSkillSources(state, skillId).concat(viewedSources(state, skillId, game));
    var owned = sources.length > 0;
    var sourceEnabled = sources.some(function (entry) { return entry.enabled; });
    var suppressed = isSuppressed(state, skillId);
    var lordSkill = !!LORD_SKILL_IDS[skillId] || sources.some(function (entry) { return !!entry.skill.lord; });
    // 无 game 的纯角色查询可判来源和缠怨，主公技发动必须从带 game 的入口查询。
    var lordEligible = !lordSkill || !game || realLordState(game) === state
      || sources.some(function (entry) { return entry.source === 'weidi'; });
    var enabled = owned && sourceEnabled && !suppressed && lordEligible;
    return { id: skillId, owned: owned, enabled: enabled, sources: sources,
      lord: lordSkill, lordEligible: lordEligible,
      // 仅供已弃用兼容壳维持旧“自有激将仍在”语义，不供规则代码使用。
      legacyEnabled: owned && sourceEnabled && !suppressed,
      disabledReason: !owned ? 'not-owned' : !sourceEnabled ? 'source-inactive'
        : suppressed ? 'chanyuan' : !lordEligible ? 'lord-ineligible' : null };
  }

  function skillEnabled(state, skillId, game) { return skillState(state, skillId, game).enabled; }
  function ownsSkill(state, skillId, game) { return skillState(state, skillId, game).owned; }

  function skillEntries(state, game) {
    var candidates = (state && state.skills || []).concat(state && state.dynamicSkills || []);
    var lord = realLordState(game);
    if (lord && lord !== state) candidates = candidates.concat(lord.skills || [], lord.dynamicSkills || []);
    if (state && state.chanyuan) candidates = candidates.concat([{ id: 'chanyuan', name: '缠怨' }]);
    var ids = [];
    candidates.forEach(function (entry) { if (ids.indexOf(entry.id) < 0) ids.push(entry.id); });
    return ids.map(function (id) {
      var status = skillState(state, id, game);
      if (!status.owned) return null;
      var preferred = status.sources.find(function (entry) { return entry.enabled; }) || status.sources[0];
      return Object.assign({}, preferred.skill, { id: id, owned: true, enabled: status.enabled,
        disabledReason: status.disabledReason,
        sources: status.sources.map(function (entry) { return { source: entry.source, enabled: entry.enabled }; }),
        viewedByWeidi: status.sources.some(function (entry) { return entry.source === 'weidi'; }) });
    }).filter(Boolean);
  }

  function activateSkillSource(state, source, skillMeta) {
    if (!state || !source || !skillMeta || !skillMeta.id) return false;
    state.dynamicSkills = state.dynamicSkills || [];
    var found = null;
    state.dynamicSkills.forEach(function (entry) {
      if (entry.source !== source) return;
      entry.enabled = entry.id === skillMeta.id;
      if (entry.enabled) found = entry;
    });
    if (found) return false; // 重新有效不是重新获得，不重置任何技能次数/标记。
    var entry = JSON.parse(JSON.stringify(skillMeta));
    entry.source = source;
    entry.enabled = true;
    state.dynamicSkills.push(entry);
    return true;
  }

  function clearSkillSource(state, source) {
    if (!state) return 0;
    var before = (state.dynamicSkills || []).length;
    state.dynamicSkills = (state.dynamicSkills || []).filter(function (entry) { return entry.source !== source; });
    return before - state.dynamicSkills.length;
  }

  function grantSkill(state, skillId, skillName, meta) {
    if (!state || !skillId) return false;
    state.skills = state.skills || [];
    if (state.skills.some(function (entry) { return entry.id === skillId; })) return false;
    var entry = meta ? JSON.parse(JSON.stringify(meta)) : {};
    Object.assign(entry, { id: skillId, name: skillName || skillId, granted: true });
    state.skills.push(entry);
    return true;
  }

  function stripAllSkills(state, game) {
    if (!state) return 0;
    var removed = skillEntries(state).length;
    // 场外武将牌释放由 AA3 域接入；先通知仍可读取旧形态的回调，再清技能。
    if (allSkillsLostHandler) allSkillsLostHandler(state, game);
    state.skills = [];
    state.dynamicSkills = [];
    delete state.chanyuan;
    delete state.identityOverride;
    return removed;
  }

  function legacyHasSkill(state, skillId, game) {
    legacySkillQueryCount += 1;
    return skillState(state, skillId, game).legacyEnabled;
  }

  function hasLordSkill(game, actor, skillId) {
    if (!game || !game[actor] || !game.roles) return false;
    var result = skillState(game[actor], skillId, game);
    return result.lord && result.enabled;
  }

  function viewedLordSkills(game, actor) {
    return skillEntries(game && game[actor], game).filter(function (entry) { return entry.viewedByWeidi; });
  }

  function hasPassiveEffect(state, effectName, game) {
    return skillEntries(state, game).some(function (skill) {
      return skill.enabled && !!skillEffectValue(skill.id, effectName);
    });
  }

  function sumPassiveEffect(state, effectName, game) {
    return skillEntries(state, game).reduce(function (total, skill) {
      var value = skill.enabled ? skillEffectValue(skill.id, effectName) : undefined;
      return total + (typeof value === 'number' ? value : 0);
    }, 0);
  }

  function createRegistry() {
    return {
      skills: [],
      hooks: {}
    };
  }

  function registerSkill(registry, skillId, hooks) {
    if (!registry) return null;
    registry.skills = registry.skills || [];
    registry.hooks = registry.hooks || {};
    hooks = hooks || {};

    var entry = {
      id: skillId,
      hooks: hooks
    };
    registry.skills.push(entry);

    Object.keys(hooks).forEach(function (hookName) {
      if (typeof hooks[hookName] !== 'function') return;
      registry.hooks[hookName] = registry.hooks[hookName] || [];
      registry.hooks[hookName].push({
        skillId: skillId,
        handler: hooks[hookName]
      });
    });

    return entry;
  }

  function runHook(registry, hookName, context) {
    if (!registry || !registry.hooks || !registry.hooks[hookName]) return [];
    return registry.hooks[hookName].map(function (hook) {
      return {
        skillId: hook.skillId,
        result: hook.handler(context || {})
      };
    });
  }

  export const SkillRuntime = {
    annotateSkillStatus: annotateSkillStatus,
    skillState: skillState,
    skillEnabled: skillEnabled,
    ownsSkill: ownsSkill,
    skillEntries: skillEntries,
    activateSkillSource: activateSkillSource,
    clearSkillSource: clearSkillSource,
    grantSkill: grantSkill,
    stripAllSkills: stripAllSkills,
    hasLordSkill: hasLordSkill,
    viewedLordSkills: viewedLordSkills,
    legacyHasSkill: legacyHasSkill,
    resetLegacySkillQueryCount: function () { legacySkillQueryCount = 0; },
    readLegacySkillQueryCount: function () { return legacySkillQueryCount; },
    setAllSkillsLostHandler: function (handler) { allSkillsLostHandler = handler; },
    hasPassiveEffect: hasPassiveEffect,
    sumPassiveEffect: sumPassiveEffect,
    createRegistry: createRegistry,
    registerSkill: registerSkill,
    runHook: runHook
  };
