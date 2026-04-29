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
    createRegistry: createRegistry,
    registerSkill: registerSkill,
    runHook: runHook
  };
}());
