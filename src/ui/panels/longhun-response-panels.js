// AB: 龙魂响应的实体成本由玩家逐张选择，仍通过原响应窗口提交编码后的 cardId。
export function createLonghunResponsePanels(ctx) {
  var els = ctx.els, windowChoice = null, optionId = null, selectedIds = [], targetActor = null;
  function options(pending) {
    return pending && pending.actor === 'player' ? (pending.options || []).concat(pending.longhunOptions || []).filter(function (option) {
      return option.via === '龙魂' && Array.isArray(option.candidateCards) && option.candidateCards.length >= option.requiredCount;
    }) : [];
  }
  function current() {
    var game = ctx.getGame(), pending = game && ctx.Engine.getPendingChoice(game);
    return pending && pending === windowChoice && pending.actor === 'player' ? pending : null;
  }
  function selectedOption(pending) { return options(pending).find(function (option) { return option.cardId === optionId; }); }
  function idOf(card) { return card.id === undefined ? card.cardId : card.id; }
  function valid(pending) {
    var option = selectedOption(pending);
    return !!option && selectedIds.length === option.requiredCount && selectedIds.every(function (id) {
      return option.candidateCards.some(function (card) { return idOf(card) === id; });
    }) && (pending.kind !== 'luanwu-sha' || (pending.targets || []).some(function (target) { return (target.actor || target.seat) === targetActor; }));
  }
  function payload(pending) {
    var decision = { cardId: 'longhun:' + JSON.stringify(selectedIds), choiceId: pending.choiceId };
    if (pending.kind === 'luanwu-sha') decision.target = targetActor;
    return decision;
  }
  function clear() { selectedIds = []; targetActor = null; }
  function stageSelection() {
    var pending = current();
    ctx.stage(valid(pending) ? payload(pending) : null, '[data-longhun-resp-ready="true"]');
  }
  function button(attr, id, label, selected) {
    return '<button class="mini-card' + (selected ? ' selected' : '') + '" ' + attr + '="' + ctx.escapeHtml(id)
      + '" aria-pressed="' + !!selected + '">' + ctx.escapeHtml(label) + '</button>';
  }
  function render(kind, pending) {
    var choices = options(pending), open = choices.length > 0;
    if (!els.longhunResponsePanel) return;
    if (!open || pending !== windowChoice) {
      windowChoice = open ? pending : null; optionId = choices.length === 1 ? choices[0].cardId : null; clear();
    }
    els.longhunResponsePanel.hidden = !open;
    if (!open) {
      ['longhunResponseCards', 'longhunResponseTypes', 'longhunResponseTargets'].forEach(function (id) { if (els[id]) els[id].innerHTML = ''; });
      if (els.longhunResponseHint) els.longhunResponseHint.textContent = '';
      if (els.longhunResponseConfirmBtn) els.longhunResponseConfirmBtn.disabled = true;
      return;
    }
    var option = selectedOption(pending);
    if (option) selectedIds = selectedIds.filter(function (id) { return option.candidateCards.some(function (card) { return idOf(card) === id; }); });
    else clear();
    if (els.longhunResponseHint) els.longhunResponseHint.textContent = option
      ? '龙魂：选择 ' + option.requiredCount + ' 张' + ctx.suitLabel(option.suit) + '牌当【' + option.name + '】响应（已选 ' + selectedIds.length + ' 张）。'
      : '龙魂：选择响应类型，再选同花色的手牌或装备牌。';
    if (els.longhunResponseTypes) els.longhunResponseTypes.innerHTML = choices.length > 1 ? choices.map(function (entry, index) {
      return button('data-longhun-resp-option', String(index), entry.name + ' · ' + ctx.suitLabel(entry.suit), entry.cardId === optionId);
    }).join('') : '';
    if (els.longhunResponseCards) els.longhunResponseCards.innerHTML = option ? option.candidateCards.map(function (card) {
      var id = idOf(card);
      return button('data-longhun-resp-card', id, (card.name || id) + ' ' + ctx.suitLabel(card.suit) + (card.rank || '')
        + ((card.zone || card.sourceZone) === 'equipment' ? ' · 装备' : ''), selectedIds.indexOf(id) >= 0);
    }).join('') : '';
    if (els.longhunResponseTargets) els.longhunResponseTargets.innerHTML = pending.kind === 'luanwu-sha' ? (pending.targets || []).map(function (target) {
      var actor = target.actor || target.seat;
      return button('data-longhun-resp-target', actor, target.name || actor, actor === targetActor);
    }).join('') : '';
    if (els.longhunResponseConfirmBtn) {
      els.longhunResponseConfirmBtn.disabled = !valid(pending);
      els.longhunResponseConfirmBtn.setAttribute('data-longhun-resp-ready', String(valid(pending)));
    }
  }
  function bind() {
    if (els.longhunResponseTypes) els.longhunResponseTypes.addEventListener('click', function (event) {
      var pending = current(), target = event.target.closest('[data-longhun-resp-option]');
      if (!pending || !target) return;
      var entry = options(pending)[Number(target.getAttribute('data-longhun-resp-option'))];
      if (!entry) return;
      optionId = entry.cardId; clear(); stageSelection();
    });
    if (els.longhunResponseCards) els.longhunResponseCards.addEventListener('click', function (event) {
      var pending = current(), target = event.target.closest('[data-longhun-resp-card]');
      if (!pending || !target) return;
      var option = selectedOption(pending), id = target.getAttribute('data-longhun-resp-card');
      if (!option || !option.candidateCards.some(function (card) { return idOf(card) === id; })) return;
      var index = selectedIds.indexOf(id);
      if (index >= 0) selectedIds.splice(index, 1);
      else if (selectedIds.length < option.requiredCount) selectedIds.push(id);
      stageSelection();
    });
    if (els.longhunResponseTargets) els.longhunResponseTargets.addEventListener('click', function (event) {
      var pending = current(), target = event.target.closest('[data-longhun-resp-target]');
      if (!pending || !target) return;
      var actor = target.getAttribute('data-longhun-resp-target');
      if (!(pending.targets || []).some(function (entry) { return (entry.actor || entry.seat) === actor; })) return;
      targetActor = actor; stageSelection();
    });
    if (els.longhunResponseConfirmBtn) els.longhunResponseConfirmBtn.addEventListener('click', function () {
      var pending = current();
      if (!valid(pending)) return;
      var result = ctx.Engine.resolvePendingChoice(ctx.getGame(), payload(pending));
      if (!result.ok && ctx.renderLog) ctx.renderLog();
      clear(); ctx.stage(null);
    });
  }
  return { render: render, bind: bind, clear: clear };
}
