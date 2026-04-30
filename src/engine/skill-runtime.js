(function () {
  'use strict';

  var modules = window.SanguoshaEngineModules || (window.SanguoshaEngineModules = {});

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
    }
  };

  function skillEffectValue(skillId, effectName) {
    var effects = PASSIVE_EFFECTS[skillId];
    if (!effects) return undefined;
    return effects[effectName];
  }

  function hasPassiveEffect(state, effectName) {
    return !!(state && state.skills || []).some(function (skill) {
      return !!skillEffectValue(skill.id, effectName);
    });
  }

  function sumPassiveEffect(state, effectName) {
    return (state && state.skills || []).reduce(function (total, skill) {
      var value = skillEffectValue(skill.id, effectName);
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

  modules.SkillRuntime = {
    annotateSkillStatus: annotateSkillStatus,
    hasPassiveEffect: hasPassiveEffect,
    sumPassiveEffect: sumPassiveEffect,
    createRegistry: createRegistry,
    registerSkill: registerSkill,
    runHook: runHook
  };
}());
