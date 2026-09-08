// AB: 所有神将选择共用当前窗口提供的公开候选，私有牌只在持有者窗口展示。
// 多段步骤认 pending 对象，不把前一轮或其他座席的选择带入新窗口。
export function createGodChoicePanels(ctx) {
  var els = ctx.els;
  var windowChoice = null;
  var selected = { optionId: null, cardIds: [], starIds: [], targetActors: [] };
  var groups = [
    { field: 'cards', selected: 'cardIds', id: 'id', prefix: 'card', element: 'godChoiceCards', attr: 'data-god-card-id', label: '牌' },
    { field: 'starCards', selected: 'starIds', id: 'id', prefix: 'star', element: 'godChoiceStars', attr: 'data-god-star-id', label: '星' },
    { field: 'targets', selected: 'targetActors', id: 'actor', prefix: 'target', element: 'godChoiceTargets', attr: 'data-god-target-actor', label: '目标' }
  ];
  function human(pending) { return pending && pending.kind === 'god-choice' && pending.actor === 'player'; }
  function current() {
    var game = ctx.getGame(), pending = game && ctx.Engine.getPendingChoice(game);
    return human(pending) && pending === windowChoice ? pending : null;
  }
  function idOf(entry, group) { return entry[group.id] === undefined ? entry.cardId : entry[group.id]; }
  function enabled(entry) { return entry && !entry.disabled && !entry.disabledReason; }
  function bounds(pending, group) {
    var option = (pending.options || []).find(function (entry) { return entry.id === selected.optionId; });
    pending = option ? Object.assign({}, pending, option) : pending;
    var list = pending[group.field] || [];
    return { min: pending[group.prefix + 'Min'] === undefined ? 0 : pending[group.prefix + 'Min'],
      max: pending[group.prefix + 'Max'] === undefined ? list.length : pending[group.prefix + 'Max'] };
  }
  function valid(pending) {
    if (!pending) return false;
    var options = pending.options || [];
    var chosen = options.find(function (option) { return option.id === selected.optionId && enabled(option); });
    if (options.length && !chosen) return false;
    if (chosen && chosen.skipSelection) return true;
    if (!groups.every(function (group) {
      var ids = selected[group.selected], range = bounds(pending, group);
      return ids.length >= range.min && ids.length <= range.max && ids.every(function (id) {
        return (pending[group.field] || []).some(function (entry) { return idOf(entry, group) === id && enabled(entry); });
      });
    })) return false;
    if (pending.equalCardStarCount && selected.cardIds.length !== selected.starIds.length) return false;
    if (pending.equalStarTargetCount && selected.starIds.length !== selected.targetActors.length) return false;
    var suits = selected.cardIds.map(function (id) {
      return (pending.cards || []).find(function (card) { return (card.id === undefined ? card.cardId : card.id) === id; }).suit;
    });
    if (pending.cardSuitRule === 'same' && suits.some(function (suit) { return suit !== suits[0]; })) return false;
    if (pending.cardSuitRule === 'distinct' && new Set(suits).size !== suits.length) return false;
    return true;
  }
  function button(attr, id, label, active, entry) {
    return '<button class="mini-card' + (active ? ' selected' : '') + '" ' + attr + '="' + ctx.escapeHtml(id)
      + '" aria-pressed="' + !!active + '"' + (enabled(entry) ? '' : ' disabled') + '>'
      + ctx.escapeHtml(label) + (entry.disabledReason ? ' · ' + ctx.escapeHtml(entry.disabledReason) : '') + '</button>';
  }
  function cardLabel(entry, group) {
    if (group.id === 'actor') return entry.name || entry.actor;
    return (entry.name || entry.label || idOf(entry, group)) + (entry.suit ? ' ' + (ctx.suitLabel ? ctx.suitLabel(entry.suit) : entry.suit) : '')
      + (entry.rank ? String(entry.rank).toUpperCase() : '') + ((entry.zone || entry.sourceZone) === 'equipment' ? ' · 装备' : '');
  }
  function render(kind, pending) {
    var open = kind === 'god-choice' && human(pending);
    if (!open || windowChoice !== pending) {
      windowChoice = open ? pending : null;
      selected = { optionId: null, cardIds: [], starIds: [], targetActors: [] };
    }
    if (!els.godChoicePanel) return;
    els.godChoicePanel.hidden = !open;
    if (!open) {
      ['godChoiceOptions', 'godChoiceCards', 'godChoiceStars', 'godChoiceTargets'].forEach(function (id) { if (els[id]) els[id].innerHTML = ''; });
      if (els.godChoiceHint) els.godChoiceHint.textContent = '';
      if (els.godChoiceConfirmBtn) els.godChoiceConfirmBtn.disabled = true;
      return;
    }
    var options = pending.options || [];
    if (!options.some(function (option) { return option.id === selected.optionId && enabled(option); })) selected.optionId = null;
    if (els.godChoiceHint) els.godChoiceHint.textContent = [pending.title, pending.prompt].filter(Boolean).join('：') || '选择技能效果';
    if (els.godChoiceOptions) els.godChoiceOptions.innerHTML = options.map(function (option) {
      return button('data-god-option-id', option.id, option.label || option.name || option.id, option.id === selected.optionId, option);
    }).join('');
    groups.forEach(function (group) {
      var entries = pending[group.field] || [];
      selected[group.selected] = selected[group.selected].filter(function (id) {
        return entries.some(function (entry) { return idOf(entry, group) === id && enabled(entry); });
      });
      if (els[group.element]) {
        var range = bounds(pending, group);
        els[group.element].innerHTML = entries.length ? '<span class="badge">' + group.label + '：已选 ' + selected[group.selected].length
          + ' / ' + range.min + (range.max === range.min ? '' : '–' + range.max) + '</span>' + entries.map(function (entry) {
            var id = idOf(entry, group);
            return button(group.attr, id, cardLabel(entry, group), selected[group.selected].indexOf(id) >= 0, entry);
          }).join('') : '';
      }
    });
    if (els.godChoiceConfirmBtn) {
      els.godChoiceConfirmBtn.disabled = !valid(pending);
      els.godChoiceConfirmBtn.textContent = pending.confirmLabel || '确定';
    }
    if (els.godChoiceDeclineBtn) {
      els.godChoiceDeclineBtn.hidden = !pending.optional;
      els.godChoiceDeclineBtn.disabled = !pending.optional;
      els.godChoiceDeclineBtn.textContent = pending.declineLabel || '不发动';
    }
  }
  function submit(pending, decision) {
    decision.choiceId = pending.choiceId;
    var result = ctx.Engine.resolvePendingChoice(ctx.getGame(), decision);
    if (!result.ok && ctx.renderLog) ctx.renderLog();
    ctx.render();
  }
  function bind() {
    if (els.godChoiceOptions) els.godChoiceOptions.addEventListener('click', function (event) {
      var pending = current(), target = event.target.closest('[data-god-option-id]');
      if (!pending || !target) return;
      var id = target.getAttribute('data-god-option-id');
      if (!(pending.options || []).some(function (option) { return option.id === id && enabled(option); })) return;
      selected.optionId = id; ctx.render();
    });
    groups.forEach(function (group) {
      if (!els[group.element]) return;
      els[group.element].addEventListener('click', function (event) {
        var pending = current(), target = event.target.closest('[' + group.attr + ']');
        if (!pending || !target) return;
        var id = target.getAttribute(group.attr);
        if (!(pending[group.field] || []).some(function (entry) { return idOf(entry, group) === id && enabled(entry); })) return;
        var ids = selected[group.selected], index = ids.indexOf(id), max = bounds(pending, group).max;
        if (index >= 0) ids.splice(index, 1);
        else if (max === 1) selected[group.selected] = [id];
        else if (ids.length < max) ids.push(id);
        ctx.render();
      });
    });
    if (els.godChoiceConfirmBtn) els.godChoiceConfirmBtn.addEventListener('click', function () {
      var pending = current();
      if (!valid(pending)) return;
      var decision = {};
      var option = (pending.options || []).find(function (entry) { return entry.id === selected.optionId; });
      if ((pending.options || []).length) decision.optionId = selected.optionId;
      groups.forEach(function (group) { if (pending[group.field]) decision[group.selected] = option && option.skipSelection ? [] : selected[group.selected].slice(); });
      submit(pending, decision);
    });
    if (els.godChoiceDeclineBtn) els.godChoiceDeclineBtn.addEventListener('click', function () {
      var pending = current();
      if (pending && pending.optional) submit(pending, { decline: true });
    });
  }
  return { render: render, bind: bind };
}
