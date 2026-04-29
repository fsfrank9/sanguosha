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

  modules.SkillRuntime = {
    annotateSkillStatus: annotateSkillStatus
  };
}());
