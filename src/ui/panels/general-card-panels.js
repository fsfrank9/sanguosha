// AA3: 场外武将牌选择基础面板。候选完全取自当前窗口，不读取其他座席的
// 武将牌或目录。选择武将、选择技能与提交都绑定同一个 pending 对象。
export function createGeneralCardPanels(ctx) {
  var els = ctx.els;
  var Engine = ctx.Engine;
  var selectedWindow = null;
  var selectedHeroId = null;
  var selectedSkillId = null;

  function humanWindow(pending) {
    return pending && pending.kind === 'general-card-choice' && pending.actor === 'player';
  }

  function liveWindow() {
    var game = ctx.getGame();
    var pending = game && Engine.getPendingChoice(game);
    return humanWindow(pending) && pending === selectedWindow ? pending : null;
  }

  function optionById(pending, heroId) {
    return (pending.options || []).find(function (option) { return option.heroId === heroId; });
  }

  function disabledReason(option) {
    if (option.disabledReason) return option.disabledReason;
    if (Array.isArray(option.skills) && !option.skills.some(function (skill) { return !skill.disabledReason; })) {
      return '无可选技能';
    }
    return '';
  }

  function selectedOption(pending) {
    var option = optionById(pending, selectedHeroId);
    return option && !disabledReason(option) ? option : null;
  }

  function canConfirm(pending) {
    var option = selectedOption(pending);
    if (!option) return false;
    if (!Array.isArray(option.skills)) return true;
    return option.skills.some(function (skill) { return skill.id === selectedSkillId && !skill.disabledReason; });
  }

  function choiceButton(attr, id, label, selected, reason) {
    return '<button class="mini-card' + (selected ? ' selected' : '') + '" '
      + attr + '="' + ctx.escapeHtml(id) + '" aria-pressed="' + (selected ? 'true' : 'false') + '"'
      + (reason ? ' disabled title="' + ctx.escapeHtml(reason) + '"' : '') + '>'
      + ctx.escapeHtml(label) + (reason ? ' · ' + ctx.escapeHtml(reason) : '') + '</button>';
  }

  function render(kind, pending) {
    var visible = kind === 'general-card-choice' && humanWindow(pending);
    if (!visible || selectedWindow !== pending) {
      selectedWindow = visible ? pending : null;
      selectedHeroId = null;
      selectedSkillId = null;
    }
    if (!els.generalCardPanel) return;
    els.generalCardPanel.hidden = !visible;
    if (!visible) {
      if (els.generalCardOptions) els.generalCardOptions.innerHTML = '';
      if (els.generalCardSkills) els.generalCardSkills.innerHTML = '';
      if (els.generalCardCurrent) els.generalCardCurrent.textContent = '';
      if (els.generalCardConfirmBtn) els.generalCardConfirmBtn.disabled = true;
      return;
    }
    var options = pending.options || [];
    var option = selectedOption(pending);
    if (!option) {
      selectedHeroId = null;
      selectedSkillId = null;
    } else if (Array.isArray(option.skills) && !option.skills.some(function (skill) {
      return skill.id === selectedSkillId && !skill.disabledReason;
    })) {
      selectedSkillId = null;
    }
    if (els.generalCardHint) els.generalCardHint.textContent = pending.reason || '选择一张武将牌';
    if (els.generalCardOptions) {
      els.generalCardOptions.innerHTML = options.length ? options.map(function (entry) {
        var label = entry.name || entry.heroId;
        if (entry.camp) label += ' · ' + entry.camp;
        if (entry.gender) label += ' · ' + ({ male: '男', female: '女' }[entry.gender] || entry.gender);
        return choiceButton('data-general-hero-id', entry.heroId, label,
          entry.heroId === selectedHeroId, disabledReason(entry));
      }).join('') : '<span class="mini-card">没有可选武将牌</span>';
    }
    if (els.generalCardSkills) {
      els.generalCardSkills.innerHTML = option && Array.isArray(option.skills)
        ? option.skills.map(function (skill) {
            return choiceButton('data-general-skill-id', skill.id, skill.name || skill.id,
              skill.id === selectedSkillId, skill.disabledReason);
          }).join('')
        : '';
    }
    if (els.generalCardCurrent) {
      var active = optionById(pending, pending.activeHeroId);
      var activeSkill = active && Array.isArray(active.skills) && active.skills.find(function (skill) {
        return skill.id === pending.activeSkillId;
      });
      els.generalCardCurrent.textContent = active ? '当前：' + (active.name || active.heroId)
        + (activeSkill ? ' · ' + (activeSkill.name || activeSkill.id) : '') : '';
    }
    if (els.generalCardConfirmBtn) els.generalCardConfirmBtn.disabled = !canConfirm(pending);
    if (els.generalCardDeclineBtn) {
      els.generalCardDeclineBtn.hidden = !pending.optional;
      els.generalCardDeclineBtn.disabled = !pending.optional;
    }
  }

  function submit(pending, decision) {
    decision.choiceId = pending.choiceId;
    var result = Engine.resolvePendingChoice(ctx.getGame(), decision);
    if (!result.ok && ctx.renderLog) ctx.renderLog();
    ctx.render();
  }

  function bind() {
    if (els.generalCardOptions) els.generalCardOptions.addEventListener('click', function (event) {
      var pending = liveWindow();
      var button = event.target.closest('[data-general-hero-id]');
      if (!pending || !button) return;
      var option = optionById(pending, button.getAttribute('data-general-hero-id'));
      if (!option || disabledReason(option)) return;
      if (selectedHeroId !== option.heroId) selectedSkillId = null;
      selectedHeroId = option.heroId;
      ctx.render();
    });
    if (els.generalCardSkills) els.generalCardSkills.addEventListener('click', function (event) {
      var pending = liveWindow();
      var button = event.target.closest('[data-general-skill-id]');
      if (!pending || !button) return;
      var option = selectedOption(pending);
      var skillId = button.getAttribute('data-general-skill-id');
      if (!option || !Array.isArray(option.skills) || !option.skills.some(function (skill) {
        return skill.id === skillId && !skill.disabledReason;
      })) return;
      selectedSkillId = skillId;
      ctx.render();
    });
    if (els.generalCardConfirmBtn) els.generalCardConfirmBtn.addEventListener('click', function () {
      var pending = liveWindow();
      if (!pending || !canConfirm(pending)) return;
      var decision = { heroId: selectedHeroId };
      if (Array.isArray(selectedOption(pending).skills)) decision.skillId = selectedSkillId;
      submit(pending, decision);
    });
    if (els.generalCardDeclineBtn) els.generalCardDeclineBtn.addEventListener('click', function () {
      var pending = liveWindow();
      if (pending && pending.optional) submit(pending, { decline: true });
    });
  }

  return { render: render, bind: bind };
}
