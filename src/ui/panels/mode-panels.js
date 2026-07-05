  // v11 B2: 出牌辅助/模式面板模块 — 铁索/目标区域/火攻成本/转化/观星
  // 六簇的显示/隐藏/结算/绑定与其模式状态, 从 dom-adapter.js 整体迁出,
  // 函数体逐行一致 (game 经 getGame() 前导取用, staged 经 get/setStaged
  // 双向共享)。zhiheng 模式面板属技能选牌框架, 留在主 adapter。
  export function createModePanels(ctx) {
    var els = ctx.els;
    var Engine = ctx.Engine;
    var getGame = ctx.getGame;
    var render = ctx.render;
    var escapeHtml = ctx.escapeHtml;
    var flashHero = ctx.flashHero;
    var findPlayerCard = ctx.findPlayerCard;
    var getStaged = ctx.getStaged;
    var setStaged = ctx.setStaged;
    var _highlightStaged = ctx.highlightStaged;
    // v11 C4 (批次 28): B2 迁出时漏注入 — 转化面板"按原牌"分支需要回到
    // 主 adapter 的常规出牌路由 (火攻/铁索等特殊牌照常弹各自面板)。
    var resolveNormalPlayerCard = ctx.resolveNormalPlayerCard;

    var pendingTiesuoCardId = null;
    var pendingTargetCardId = null;
    var pendingTargetZone = null;
    var pendingHuogongCardId = null;
    var pendingConversionCardId = null;
    // v6.1 guanxing pendingChoice tracking: three queues (unassigned / top /
    // bottom). `guanxingSelected` is the currently highlighted card id from
    // any zone; clicking 顶/底/取回 buttons moves it accordingly.
    var guanxingUnassignedIds = [];
    var guanxingTopIds = [];
    var guanxingBottomIds = [];
    var guanxingSelected = null;

    function showTiesuoPanel(cardId) {
      var game = getGame();
      pendingTiesuoCardId = cardId;
      if (els.tiesuoModePanel) els.tiesuoModePanel.hidden = false;
      if (els.handHint) els.handHint.textContent = '选择【铁索连环】：重铸，或横置/重置一至两名角色';
    }

    function hideTiesuoPanel() {
      var game = getGame();
      pendingTiesuoCardId = null;
      if (els.tiesuoModePanel) els.tiesuoModePanel.hidden = true;
    }

    function showTargetZonePanel(cardId) {
      var game = getGame();
      pendingTargetCardId = cardId;
      pendingTargetZone = null;
      if (els.targetZonePanel) els.targetZonePanel.hidden = false;
      if (els.targetCardChoices) els.targetCardChoices.innerHTML = '<span class="mini-card">先选择一个区域，再点具体目标牌</span>';
      if (els.handHint) els.handHint.textContent = '选择目标区域：手牌、装备区或延时锦囊区';
    }

    function hideTargetZonePanel() {
      var game = getGame();
      pendingTargetCardId = null;
      pendingTargetZone = null;
      if (getStaged() && getStaged().kind === 'target') setStaged(null);
      if (els.targetZonePanel) els.targetZonePanel.hidden = true;
      if (els.targetCardChoices) els.targetCardChoices.innerHTML = '<span class="mini-card">先选择一个区域，再点具体目标牌</span>';
    }

    function hideHuogongPanel() {
      var game = getGame();
      pendingHuogongCardId = null;
      if (getStaged() && getStaged().kind === 'huogong') setStaged(null);
      if (els.huogongModePanel) els.huogongModePanel.hidden = true;
      if (els.huogongRevealText) els.huogongRevealText.textContent = '火攻：等待展示目标手牌';
      if (els.huogongCostChoices) els.huogongCostChoices.innerHTML = '<span class="mini-card">同花色牌可用于造成火焰伤害</span>';
    }

    function showConversionPanel(cardId) {
      var game = getGame();
      pendingConversionCardId = cardId;
      var card = findPlayerCard(cardId);
      // v11 C4 (批次 28): 转化候选泛化 — 面板动态列出这张牌的全部可用转化:
      // 杀按钮按候选显隐, 锦囊类转化 (国色 方片→乐 / 奇袭 黑牌→拆) 动态成钮。
      var conversions = (game && card && Engine.listCardConversions)
        ? Engine.listCardConversions(game, 'player', card) : [];
      var hasSha = conversions.some(function (conv) { return conv.asType === 'sha'; });
      var extras = conversions.filter(function (conv) { return conv.asType !== 'sha'; });
      if (els.conversionShaBtn) els.conversionShaBtn.hidden = !hasSha;
      if (els.conversionExtraChoices) {
        els.conversionExtraChoices.innerHTML = extras.map(function (conv) {
          return '<button class="btn small" data-conversion-as="' + escapeHtml(conv.asType) + '">当【'
            + escapeHtml(conv.asName) + '】使用（' + escapeHtml(conv.skillName || '技能') + '）</button>';
        }).join('');
      }
      var optionNames = conversions.map(function (conv) { return '【' + conv.asName + '】'; }).join('、');
      if (els.conversionModePanel) els.conversionModePanel.hidden = false;
      if (els.conversionHint) els.conversionHint.textContent = card
        ? '【' + card.name + '】可按原牌使用，也可当' + (optionNames || '【杀】') + '使用'
        : '这张牌可按原牌使用，也可当【杀】使用';
      if (els.handHint) els.handHint.textContent = '请选择：按原牌使用，或发动技能转化使用';
    }

    function hideConversionPanel() {
      var game = getGame();
      pendingConversionCardId = null;
      // v10 V8: 与 hideTargetZonePanel / hideHuogongPanel 对称, 清掉 staged.
      if (getStaged() && getStaged().kind === 'conversion') setStaged(null);
      if (els.conversionModePanel) els.conversionModePanel.hidden = true;
      if (els.conversionShaBtn) els.conversionShaBtn.hidden = false;
      if (els.conversionExtraChoices) els.conversionExtraChoices.innerHTML = '';
      if (els.conversionHint) els.conversionHint.textContent = '这张牌可按原牌使用，也可当【杀】使用';
    }

    function guanxingCardMarkup(card, zone) {
      var game = getGame();
      var selected = guanxingSelected === card.id ? ' selected' : '';
      return '<button class="mini-card guanxing-card' + selected +
        '" data-guanxing-card-id="' + escapeHtml(card.id) +
        '" data-guanxing-zone="' + escapeHtml(zone) +
        '">【' + escapeHtml(card.name) + '】' + escapeHtml(suitName(card.suit)) + ' ' + escapeHtml(String(card.rank || '')) + '</button>';
    }

    function guanxingFindCard(id) {
      var game = getGame();
      var pending = game && Engine.getPendingChoice(game);
      if (!pending || pending.kind !== 'guanxing-reorder') return null;
      for (var i = 0; i < pending.cards.length; i += 1) {
        if (pending.cards[i].id === id) return pending.cards[i];
      }
      return null;
    }

    function renderGuanxingZones() {
      var game = getGame();
      var unassignedHtml = guanxingUnassignedIds.length
        ? guanxingUnassignedIds.map(function (id) { var c = guanxingFindCard(id); return c ? guanxingCardMarkup(c, 'unassigned') : ''; }).join('')
        : '<span class="mini-card">已全部分配</span>';
      var topHtml = guanxingTopIds.length
        ? guanxingTopIds.map(function (id, idx) { var c = guanxingFindCard(id); return c ? ('<span class="mini-card guanxing-position-tag">' + (idx + 1) + '</span>' + guanxingCardMarkup(c, 'top')) : ''; }).join('')
        : '<span class="mini-card">尚无</span>';
      var bottomHtml = guanxingBottomIds.length
        ? guanxingBottomIds.map(function (id, idx) { var c = guanxingFindCard(id); return c ? ('<span class="mini-card guanxing-position-tag">' + (idx + 1) + '</span>' + guanxingCardMarkup(c, 'bottom')) : ''; }).join('')
        : '<span class="mini-card">尚无</span>';
      if (els.guanxingUnassigned) els.guanxingUnassigned.innerHTML = unassignedHtml;
      if (els.guanxingTopZone) els.guanxingTopZone.innerHTML = topHtml;
      if (els.guanxingBottomZone) els.guanxingBottomZone.innerHTML = bottomHtml;
      if (els.guanxingConfirmBtn) els.guanxingConfirmBtn.disabled = guanxingUnassignedIds.length > 0;
    }

    function showGuanxingPanelFromPending() {
      var game = getGame();
      var pending = game && Engine.getPendingChoice(game);
      if (!pending || pending.kind !== 'guanxing-reorder' || pending.actor !== 'player') {
        hideGuanxingPanel();
        return;
      }
      guanxingUnassignedIds = pending.cards.map(function (c) { return c.id; });
      guanxingTopIds = [];
      guanxingBottomIds = [];
      guanxingSelected = null;
      if (els.guanxingModePanel) els.guanxingModePanel.hidden = false;
      if (els.guanxingHint) {
        els.guanxingHint.textContent =
          '观星（准备阶段）：' + pending.cards.length + ' 张待分配。先点一张牌再点 ↑顶 / ↓底 / ↩取回。';
      }
      if (els.handHint) els.handHint.textContent = '观星：请把每张牌分配到牌堆顶或牌堆底';
      renderGuanxingZones();
    }

    function hideGuanxingPanel() {
      var game = getGame();
      guanxingUnassignedIds = [];
      guanxingTopIds = [];
      guanxingBottomIds = [];
      guanxingSelected = null;
      if (els.guanxingModePanel) els.guanxingModePanel.hidden = true;
      if (els.guanxingHint) els.guanxingHint.textContent = '观星：准备阶段开始时分配预览牌';
    }

    function guanxingMoveSelectedTo(targetZone) {
      var game = getGame();
      if (!guanxingSelected) return;
      var id = guanxingSelected;
      var sources = [
        { name: 'unassigned', list: guanxingUnassignedIds },
        { name: 'top', list: guanxingTopIds },
        { name: 'bottom', list: guanxingBottomIds }
      ];
      for (var i = 0; i < sources.length; i += 1) {
        var pos = sources[i].list.indexOf(id);
        if (pos >= 0) sources[i].list.splice(pos, 1);
      }
      var target = targetZone === 'top' ? guanxingTopIds : targetZone === 'bottom' ? guanxingBottomIds : guanxingUnassignedIds;
      target.push(id);
      guanxingSelected = null;
      renderGuanxingZones();
    }

    function confirmGuanxing() {
      var game = getGame();
      if (!game || guanxingUnassignedIds.length > 0) return;
      var result = Engine.resolvePendingChoice(game, {
        topIds: guanxingTopIds.slice(),
        bottomIds: guanxingBottomIds.slice()
      });
      hideGuanxingPanel();
      if (!result.ok) game.log.push(result.message);
      render();
    }

    function declineGuanxing() {
      var game = getGame();
      if (!game) return;
      var result = Engine.resolvePendingChoice(game, { decline: true });
      hideGuanxingPanel();
      if (!result.ok) game.log.push(result.message);
      render();
    }

    function suitName(suit) {
      var game = getGame();
      var labels = { spade: '黑桃', heart: '红桃', club: '梅花', diamond: '方片' };
      return labels[suit] || suit || '未知花色';
    }

    function huogongCostButton(card, usable) {
      var game = getGame();
      return '<button class="mini-card huogong-cost-choice ' + (usable ? 'usable' : 'unusable') + '" data-huogong-cost-id="' + escapeHtml(card.id) + '" ' + (usable ? '' : 'disabled') + ' title="' + (usable ? '弃置这张牌造成火焰伤害' : '花色不符，不能弃置') + '">【' + escapeHtml(card.name) + '】' + escapeHtml(suitName(card.suit)) + (usable ? ' 可用' : ' 不可用') + '</button>';
    }

    function showHuogongPanel(cardId) {
      var game = getGame();
      pendingHuogongCardId = cardId;
      if (els.huogongModePanel) els.huogongModePanel.hidden = false;
      var choice = Engine.getHuogongChoice(game, 'player');
      if (!choice.ok || !choice.revealedCard) {
        if (els.huogongRevealText) els.huogongRevealText.textContent = '火攻：目标没有手牌，可直接结算无伤害';
        if (els.huogongCostChoices) els.huogongCostChoices.innerHTML = '<span class="mini-card">目标无手牌，无需弃牌</span>';
        return;
      }
      if (els.huogongRevealText) els.huogongRevealText.textContent = '对方展示【' + choice.revealedCard.name + '】· ' + suitName(choice.revealedCard.suit) + '，请选择是否弃同花色牌';
      var usable = choice.usableCards.filter(function (card) { return card.id !== cardId; });
      var unusable = choice.unusableCards.filter(function (card) { return card.id !== cardId; });
      var html = '<span class="badge">可用牌</span>' + (usable.length ? usable.map(function (card) { return huogongCostButton(card, true); }).join('') : '<span class="mini-card">没有同花色可用牌</span>');
      html += '<span class="badge">不可用</span>' + (unusable.length ? unusable.map(function (card) { return huogongCostButton(card, false); }).join('') : '<span class="mini-card">无</span>');
      if (els.huogongCostChoices) els.huogongCostChoices.innerHTML = html;
      if (els.handHint) els.handHint.textContent = '火攻：选择一张同花色手牌，或点“不弃牌结算”';
    }

    function targetZoneLabel(zone) {
      var game = getGame();
      var labels = { hand: '手牌区', equipment: '装备区', judge: '延时锦囊区' };
      return labels[zone] || '目标区';
    }

    function targetChoiceButton(entry) {
      var game = getGame();
      var label = entry.hidden ? (entry.label + '（未知）') : entry.label;
      return '<button class="mini-card target-card-choice" data-target-zone="' + escapeHtml(entry.zone) + '" data-target-card-id="' + escapeHtml(entry.card.id) + '" title="选择' + escapeHtml(label) + '">' + escapeHtml(label) + '</button>';
    }

    function showTargetCardChoices(zone) {
      var game = getGame();
      if (!pendingTargetCardId || !game || !els.targetCardChoices) return;
      // v9 PR-E23: 重选区域 → 旧 stage 失效
      if (getStaged() && getStaged().kind === 'target') setStaged(null);
      pendingTargetZone = zone;
      var choices = Engine.getTargetZoneCards(game, 'enemy', zone);
      var label = targetZoneLabel(zone);
      if (!choices.length) {
        els.targetCardChoices.innerHTML = '<span class="badge">' + escapeHtml(label) + '</span><span class="mini-card">该区域没有可选择的牌，请换一个区域</span>';
        if (els.handHint) els.handHint.textContent = label + '没有目标牌，请换一个区域';
        return;
      }
      els.targetCardChoices.innerHTML = '<span class="badge">选择' + escapeHtml(label) + '具体牌</span>' + choices.map(targetChoiceButton).join('');
      if (els.handHint) els.handHint.textContent = '已选' + label + '，现在点具体目标牌';
    }

    function resolveTargetZone(zone) {
      var game = getGame();
      if (!pendingTargetCardId || !game) return;
      showTargetCardChoices(zone);
    }

    function resolveTargetCard(zone, targetCardId) {
      var game = getGame();
      if (!pendingTargetCardId || !game || !targetCardId) return;
      var result = Engine.playCard(game, 'player', pendingTargetCardId, { targetZone: zone, targetCardId: targetCardId });
      hideTargetZonePanel();
      if (!result.ok) game.log.push(result.message);
      render();
    }

    function resolveHuogong(costCardId, decline) {
      var game = getGame();
      if (!pendingHuogongCardId || !game) return;
      var enemyHpBefore = game.enemy.hp;
      var result = Engine.playCard(game, 'player', pendingHuogongCardId, decline ? { declineHuogong: true } : { huogongCostCardId: costCardId });
      hideHuogongPanel();
      if (!result.ok) game.log.push(result.message);
      if (game.enemy.hp < enemyHpBefore) flashHero('enemy');
      render();
    }

    // v11 C4 (批次 28): asSha 形参泛化为转化载体 (沿用 v10 V8 staged 字段名
    // 保持 stage-then-confirm 守护不变) — false = 按原牌; true = 'sha'
    // (旧语义); 字符串 = 直接指定 asType ('lebusishu' / 'guohe')。
    function resolveConversion(asSha) {
      var game = getGame();
      if (!pendingConversionCardId || !game) return;
      var cardId = pendingConversionCardId;
      if (!asSha) {
        hideConversionPanel();
        resolveNormalPlayerCard(cardId);
        return;
      }
      var asType = asSha === true ? 'sha' : asSha;
      var enemyHpBefore = game.enemy.hp;
      var playerHpBefore = game.player.hp;
      var result = Engine.playCardAs(game, 'player', cardId, asType);
      hideConversionPanel();
      if (!result.ok) game.log.push(result.message);
      if (game.enemy.hp < enemyHpBefore) flashHero('enemy');
      if (game.player.hp < playerHpBefore) flashHero('player');
      render();
    }

    function resolveTiesuo(options) {
      var game = getGame();
      if (!pendingTiesuoCardId || !game) return;
      var playerHpBefore = game.player.hp;
      var enemyHpBefore = game.enemy.hp;
      var result = Engine.playCard(game, 'player', pendingTiesuoCardId, options);
      hideTiesuoPanel();
      if (!result.ok) game.log.push(result.message);
      if (game.enemy.hp < enemyHpBefore) flashHero('enemy');
      if (game.player.hp < playerHpBefore) flashHero('player');
      render();
    }

    // v11 B2: 观星模式面板渲染 (原 renderPendingChoice 内嵌块)。
    function renderModePanels(kind, pending) {
      var game = getGame();
      if (els.guanxingModePanel) {
        if (kind === 'guanxing-reorder' && pending.actor === 'player') {
          // Open the panel if this is a new pendingChoice (different cards
          // than the last we rendered). Otherwise keep current zone state.
          var pendingIds = pending.cards.map(function (c) { return c.id; }).sort().join(',');
          var localIds = guanxingUnassignedIds.concat(guanxingTopIds, guanxingBottomIds).sort().join(',');
          if (pendingIds !== localIds) showGuanxingPanelFromPending();
          else renderGuanxingZones();
        } else if (guanxingUnassignedIds.length || guanxingTopIds.length || guanxingBottomIds.length) {
          // pendingChoice cleared (resolved or declined) — close panel.
          hideGuanxingPanel();
        }
      }
    }

    function bindModePanels() {
      var game = getGame();
      if (els.tiesuoRecastBtn) els.tiesuoRecastBtn.addEventListener('click', function () { resolveTiesuo({ mode: 'recast' }); });
      if (els.tiesuoChainEnemyBtn) els.tiesuoChainEnemyBtn.addEventListener('click', function () { resolveTiesuo({ mode: 'chain', targets: ['enemy'] }); });
      if (els.tiesuoChainSelfBtn) els.tiesuoChainSelfBtn.addEventListener('click', function () { resolveTiesuo({ mode: 'chain', targets: ['player'] }); });
      if (els.tiesuoChainBothBtn) els.tiesuoChainBothBtn.addEventListener('click', function () { resolveTiesuo({ mode: 'chain', targets: ['player', 'enemy'] }); });
      if (els.tiesuoCancelBtn) els.tiesuoCancelBtn.addEventListener('click', function () { hideTiesuoPanel(); render(); });
      if (els.targetHandBtn) els.targetHandBtn.addEventListener('click', function () { resolveTargetZone('hand'); });
      if (els.targetEquipmentBtn) els.targetEquipmentBtn.addEventListener('click', function () { resolveTargetZone('equipment'); });
      if (els.targetJudgeBtn) els.targetJudgeBtn.addEventListener('click', function () { resolveTargetZone('judge'); });
      // v9 PR-E23: 二级面板候选改"选中→确认"两步 — 点候选只 stage + 高亮,
      // #handConfirmBtn 才 resolve.
      if (els.targetCardChoices) els.targetCardChoices.addEventListener('click', function (event) {
        var target = event.target.closest('[data-target-card-id]');
        if (!target) return;
        setStaged({
          kind: 'target',
          zone: target.getAttribute('data-target-zone'),
          cardId: target.getAttribute('data-target-card-id')
        });
        _highlightStaged(target);
        render();
      });
      if (els.huogongCostChoices) els.huogongCostChoices.addEventListener('click', function (event) {
        var cost = event.target.closest('[data-huogong-cost-id]');
        if (!cost || cost.disabled) return;
        setStaged({ kind: 'huogong', costId: cost.getAttribute('data-huogong-cost-id') });
        _highlightStaged(cost);
        render();
      });
      if (els.huogongDeclineBtn) els.huogongDeclineBtn.addEventListener('click', function () { resolveHuogong(null, true); });
      if (els.huogongCancelBtn) els.huogongCancelBtn.addEventListener('click', function () { hideHuogongPanel(); render(); });
      // v10 V8: card-as 一致性 — 转化面板也走 stage-then-confirm. 点 "按原牌使用"
      // 或 "当杀使用" 只 stage 高亮; 必须再按 #handConfirmBtn 才真正 resolve.
      // 与 target/huogong/响应面板 统一交互节奏.
      if (els.conversionNormalBtn) els.conversionNormalBtn.addEventListener('click', function () {
        setStaged({ kind: 'conversion', asSha: false });
        _highlightStaged(els.conversionNormalBtn);
        render();
      });
      if (els.conversionShaBtn) els.conversionShaBtn.addEventListener('click', function () {
        setStaged({ kind: 'conversion', asSha: true });
        _highlightStaged(els.conversionShaBtn);
        render();
      });
      // v11 C4 (批次 28): 锦囊类转化按钮 (动态生成) — staged.asSha 复用为
      // asType 字符串载体 ('lebusishu' / 'guohe'), 同走 stage-then-confirm。
      if (els.conversionExtraChoices) els.conversionExtraChoices.addEventListener('click', function (event) {
        var choice = event.target.closest('[data-conversion-as]');
        if (!choice) return;
        setStaged({ kind: 'conversion', asSha: choice.getAttribute('data-conversion-as') });
        _highlightStaged(choice);
        render();
      });
      if (els.conversionCancelBtn) els.conversionCancelBtn.addEventListener('click', function () { hideConversionPanel(); render(); });
      if (els.guanxingTopBtn) els.guanxingTopBtn.addEventListener('click', function () { guanxingMoveSelectedTo('top'); });
      if (els.guanxingBottomBtn) els.guanxingBottomBtn.addEventListener('click', function () { guanxingMoveSelectedTo('bottom'); });
      if (els.guanxingReturnBtn) els.guanxingReturnBtn.addEventListener('click', function () { guanxingMoveSelectedTo('unassigned'); });
      if (els.guanxingConfirmBtn) els.guanxingConfirmBtn.addEventListener('click', confirmGuanxing);
      if (els.guanxingDeclineBtn) els.guanxingDeclineBtn.addEventListener('click', declineGuanxing);
      // Card-click within any guanxing zone — set the highlight.
      ['guanxingUnassigned', 'guanxingTopZone', 'guanxingBottomZone'].forEach(function (zoneKey) {
        var el = els[zoneKey];
        if (!el) return;
        el.addEventListener('click', function (event) {
          var btn = event.target.closest('[data-guanxing-card-id]');
          if (!btn) return;
          guanxingSelected = btn.getAttribute('data-guanxing-card-id');
          renderGuanxingZones();
        });
      });
      if (els.targetCancelBtn) els.targetCancelBtn.addEventListener('click', function () { hideTargetZonePanel(); render(); });
    }


    return {
      showTiesuoPanel: showTiesuoPanel,
      hideTiesuoPanel: hideTiesuoPanel,
      showTargetZonePanel: showTargetZonePanel,
      hideTargetZonePanel: hideTargetZonePanel,
      showHuogongPanel: showHuogongPanel,
      hideHuogongPanel: hideHuogongPanel,
      showConversionPanel: showConversionPanel,
      hideConversionPanel: hideConversionPanel,
      showGuanxingPanelFromPending: showGuanxingPanelFromPending,
      hideGuanxingPanel: hideGuanxingPanel,
      renderGuanxingZones: renderGuanxingZones,
      guanxingMoveSelectedTo: guanxingMoveSelectedTo,
      confirmGuanxing: confirmGuanxing,
      declineGuanxing: declineGuanxing,
      resolveTiesuo: resolveTiesuo,
      resolveTargetZone: resolveTargetZone,
      resolveTargetCard: resolveTargetCard,
      resolveHuogong: resolveHuogong,
      resolveConversion: resolveConversion,
      showTargetCardChoices: showTargetCardChoices,
      render: renderModePanels,
      bind: bindModePanels
    };
  }
