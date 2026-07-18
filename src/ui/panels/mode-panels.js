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
    // v12 H6: identity3 座席点选完成后, 目标区域/火攻面板显式带上该座席
    // (null = 缺省 'enemy', 1v1 行为逐字不变)。showTargetZonePanel(cardId) /
    // showHuogongPanel(cardId) 的既有签名受守护测试锁定 (v29/v30), 不能加参
    // 数; 改用 ...ForSeat 包装入口先设本变量再调用原函数。
    var pendingTargetSeatActor = null;
    var pendingHuogongCardId = null;
    var pendingHuogongSeatActor = null;
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
      // v13 UI修缮1: 关面板同时清掉未确认的铁索暂存 (与 target/huogong 同约定)。
      if (getStaged() && getStaged().kind === 'tiesuo') setStaged(null);
    }

    function showTargetZonePanel(cardId) {
      var game = getGame();
      pendingTargetCardId = cardId;
      pendingTargetZone = null;
      if (els.targetZonePanel) els.targetZonePanel.hidden = false;
      if (els.targetCardChoices) els.targetCardChoices.innerHTML = '<span class="mini-card">先选择一个区域，再点具体目标牌</span>';
      if (els.handHint) els.handHint.textContent = '选择目标区域：手牌、装备区或延时锦囊区';
    }

    // v12 H6: identity3 座席点选后带显式目标进入目标区域面板 (过河拆桥/顺手
    // 牵羊在 identity3 复用同一套"选区域→选具体牌"富交互, 仅目标座席不同)。
    function showTargetZonePanelForSeat(cardId, seatActor) {
      pendingTargetSeatActor = seatActor || null;
      showTargetZonePanel(cardId);
    }

    function hideTargetZonePanel() {
      var game = getGame();
      pendingTargetCardId = null;
      pendingTargetZone = null;
      pendingTargetSeatActor = null;
      if (getStaged() && getStaged().kind === 'target') setStaged(null);
      if (els.targetZonePanel) els.targetZonePanel.hidden = true;
      if (els.targetCardChoices) els.targetCardChoices.innerHTML = '<span class="mini-card">先选择一个区域，再点具体目标牌</span>';
    }

    function hideHuogongPanel() {
      var game = getGame();
      pendingHuogongCardId = null;
      pendingHuogongSeatActor = null;
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
      // v12 H6: identity3 座席点选传入的显式目标 (缺省 undefined → 引擎/预览
      // 回退对手, 1v1 行为逐字不变)。
      var choice = Engine.getHuogongChoice(game, 'player', pendingHuogongSeatActor || undefined);
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

    // v12 H6: identity3 座席点选后带显式目标进入火攻成本面板。
    function showHuogongPanelForSeat(cardId, seatActor) {
      pendingHuogongSeatActor = seatActor || null;
      showHuogongPanel(cardId);
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
      // v12 H6: identity3 座席点选传入的显式目标 (缺省 'enemy', 1v1 不变)。
      var choices = Engine.getTargetZoneCards(game, pendingTargetSeatActor || 'enemy', zone);
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
      var options = { targetZone: zone, targetCardId: targetCardId };
      // v12 H6: identity3 座席点选的显式目标透传 (缺省不传 → 引擎回退对手,
      // 1v1 行为逐字不变)。
      if (pendingTargetSeatActor) options.target = pendingTargetSeatActor;
      var result = Engine.playCard(game, 'player', pendingTargetCardId, options);
      hideTargetZonePanel();
      if (!result.ok) game.log.push(result.message);
      render();
    }

    function resolveHuogong(costCardId, decline) {
      var game = getGame();
      if (!pendingHuogongCardId || !game) return;
      // v12 H6: identity3 座席点选的显式目标 (缺省 'enemy', 1v1 行为不变) —
      // hp-before 快照与 flashHero 跟着实际目标座席走, 而非硬编码 enemy。
      var targetActor = pendingHuogongSeatActor || 'enemy';
      var targetHpBefore = game[targetActor] ? game[targetActor].hp : 0;
      var options = decline ? { declineHuogong: true } : { huogongCostCardId: costCardId };
      if (pendingHuogongSeatActor) options.target = pendingHuogongSeatActor;
      var result = Engine.playCard(game, 'player', pendingHuogongCardId, options);
      hideHuogongPanel();
      if (!result.ok) game.log.push(result.message);
      if (game[targetActor] && game[targetActor].hp < targetHpBefore) flashHero(targetActor);
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

    // ───── v12 H6: identity3 座席点选 (通用骨架) ─────────────────────────
    // 卡牌单目标点选 (杀/决斗/拆/顺/火攻/乐/兵/借刀/桃/无中) 与主动技目标
    // 点选 (激将单座 / 离间双座顺序选) 共用同一套"高亮候选座席 → 点击英雄卡
    // → 完成"交互骨架: startSeatPicker 记录合法座席 + 还需点几个, 满足后
    // 回调 onComplete(pickedSeats), 未满足则继续等待下一次点击; 取消随时可
    // 退出 (cancelSeatPicker)。面板本身是 #seatTargetModePanel (hint + 取消),
    // 合法座席高亮由 board-panels.js 的 renderHero() 据
    // activeSeatPickerLegalSeats() 加 .is-target-selectable class。
    // v12 H 复核修复: 座席点选骨架泛化为 min/max。
    // v13 J0-1 (PR #165 缺陷 1): "有目标必过确认" — 点座席只是暂存 (再点
    // 取消暂存 / 单目标点其他座席改选), 须按"确定"(#seatTargetConfirmBtn,
    // 或 hand-confirm 快捷键) 才真正结算; 此前单目标点座席即直接打出。
    // opts.extraAction = { label, handler } 渲染一个附加按钮 (铁索的"重铸")。
    var seatPicker = null; // { legalSeats, min, max, picked, onComplete, hintText, extraAction }

    function activeSeatPickerLegalSeats() {
      return seatPicker ? seatPicker.legalSeats : null;
    }

    // v13 J0-1: 已暂存座席 (board-panels 据此加 .is-target-staged 高亮)。
    function activeSeatPickerPickedSeats() {
      return seatPicker ? seatPicker.picked : null;
    }

    function renderSeatPickerControls() {
      if (!seatPicker) return;
      var game = getGame();
      var canConfirm = seatPicker.picked.length >= seatPicker.min || !!seatPicker.extraStaged;
      // v13 J0-1: 满足最少目标数即显示"确定" (单目标也要确认)。
      // v13 UI修缮1: 附加动作暂存态同样经"确定"提交。
      if (els.seatTargetConfirmBtn) els.seatTargetConfirmBtn.hidden = !canConfirm;
      if (els.seatTargetExtraBtn) {
        els.seatTargetExtraBtn.hidden = !seatPicker.extraAction;
        if (seatPicker.extraAction) els.seatTargetExtraBtn.textContent = seatPicker.extraAction.label;
        els.seatTargetExtraBtn.classList.toggle('is-staged', !!seatPicker.extraStaged);
      }
      if (els.seatTargetModeHint) {
        var base = seatPicker.hintText || '选择目标：点击场上高亮的角色';
        if (seatPicker.picked.length) {
          var pickedNames = seatPicker.picked.map(function (seat) {
            return (game && game[seat] && game[seat].name) || seat;
          }).join('、');
          els.seatTargetModeHint.textContent = base + '（已选：' + pickedNames
            + (seatPicker.max > 1 ? '，至多 ' + seatPicker.max + ' 个' : '')
            + '，按"确定"结算）';
        } else {
          els.seatTargetModeHint.textContent = seatPicker.max > 1
            ? base + '（已选 0 / 至多 ' + seatPicker.max + '）'
            : base;
        }
      }
    }

    function startSeatPicker(opts) {
      var maxN = opts.max || opts.needed || 1;
      seatPicker = {
        legalSeats: opts.legalSeats,
        min: opts.min || 1,
        max: maxN,
        picked: [],
        onComplete: opts.onComplete,
        hintText: opts.hintText,
        extraAction: opts.extraAction || null
      };
      if (els.seatTargetModePanel) els.seatTargetModePanel.hidden = false;
      renderSeatPickerControls();
      render();
    }

    function cancelSeatPicker() {
      seatPicker = null;
      if (els.seatTargetModePanel) els.seatTargetModePanel.hidden = true;
      if (els.seatTargetConfirmBtn) els.seatTargetConfirmBtn.hidden = true;
      if (els.seatTargetExtraBtn) els.seatTargetExtraBtn.hidden = true;
    }

    function finishSeatPicker() {
      if (!seatPicker) return;
      // v13 UI修缮1: 附加动作 (重铸) 已暂存 → 确认时执行。
      if (seatPicker.extraStaged) {
        var extraHandler = seatPicker.extraAction && seatPicker.extraAction.handler;
        cancelSeatPicker();
        if (extraHandler) extraHandler();
        return;
      }
      if (seatPicker.picked.length < seatPicker.min) return;
      var picked = seatPicker.picked.slice();
      var onComplete = seatPicker.onComplete;
      cancelSeatPicker();
      onComplete(picked);
    }

    // 附加按钮 (铁索"重铸") — v13 UI修缮1: 改暂存, 与座席暂存互斥,
    // 须按"确定"(finishSeatPicker) 才执行 (此前点即打出)。再点取消暂存。
    function seatPickerExtraAction() {
      if (!seatPicker || !seatPicker.extraAction) return;
      seatPicker.extraStaged = !seatPicker.extraStaged;
      if (seatPicker.extraStaged) seatPicker.picked = [];
      renderSeatPickerControls();
      render();
    }

    // 点击一个座席的英雄卡 (由 dom-adapter 的 hero 元素 click 绑定调用)。
    // v13 J0-1: 点座席只暂存 — 重复点同席取消暂存; 单目标 (max=1) 已暂存
    // 时点其他合法座席直接改选; 不再"点满 max 自动结算", 一律等"确定"。
    function clickSeatForPicker(seat) {
      if (!seatPicker) return;
      if (seatPicker.legalSeats.indexOf(seat) < 0) return;
      seatPicker.extraStaged = false; // v13 UI修缮1: 点座席与"重铸"暂存互斥
      var pickedIdx = seatPicker.picked.indexOf(seat);
      if (pickedIdx >= 0) {
        seatPicker.picked.splice(pickedIdx, 1); // 再点取消暂存
      } else if (seatPicker.max === 1 && seatPicker.picked.length === 1) {
        seatPicker.picked = [seat];             // 单目标改选
      } else if (seatPicker.picked.length < seatPicker.max) {
        seatPicker.picked.push(seat);
      } else {
        return; // 多目标已满 → 先取消一个再选
      }
      renderSeatPickerControls();
      render();
    }

    // v12 H6: 单目标牌类型表 — 杀 (isShaCard 覆盖 sha/fire_sha/thunder_sha) +
    // 决斗/拆/顺/火攻/乐/兵/借刀/无中。铁索 (至多 2 目标) 与南蛮/万箭/
    // 桃园/五谷 等 AOE/无目标牌不在此列, identity3 下沿用引擎缺省
    // (照旧, 与 1v1 相同路径)。v13 J0-4: 桃收口为恒对自己, 不再座席点选。
    // v13 K2/K3 (座席泛化桶销账): 酒放开他指 (card__basic.md:58 "包括你在
    // 内的一名角色") — 入表走座席点选 (合法目标含自己, 点自己英雄卡即
    // 自饮); 1v1 不进座席点选, 直出自饮不变。
    var SEAT_TARGET_CARD_TYPES = ['juedou', 'guohe', 'shunshou', 'huogong', 'lebusishu', 'bingliang', 'jiedao', 'wuzhong', 'jiu'];

    function isSeatTargetCard(card) {
      return !!card && (Engine.isShaCard(card) || SEAT_TARGET_CARD_TYPES.indexOf(card.type) >= 0);
    }

    // identity3 下选中一张单目标手牌时尝试进入座席点选模式; 返回 false 表示
    // 不适用 (非 identity3 / 非单目标牌类型 / 无合法目标), 调用方应回退原
    // "点牌即出" 路径。
    function tryEnterSeatTargetMode(cardId) {
      var game = getGame();
      var card = findPlayerCard(cardId);
      if (!game || game.mode !== 'identity3' || !isSeatTargetCard(card)) return false;
      var legalSeats = Engine.legalTargetsForCard(game, 'player', card);
      if (!legalSeats.length) return false;
      startSeatPicker({
        legalSeats: legalSeats,
        needed: 1,
        hintText: '选择【' + card.name + '】的目标：点击场上高亮的角色',
        onComplete: function (seats) { resolveCardSeatTarget(cardId, seats[0]); }
      });
      return true;
    }

    // 拆/顺/火攻座席确定后转入既有富选择流程 (选区域/选具体牌, 或火攻自选
    // 成本牌) 而非直接结算, 保持与 1v1 同等交互深度; 借刀先选持刀者 (An)
    // 再从其可 杀 到的候选中选受害者 (Bn) — 两段点选, 消除"UI 高亮持刀者但
    // 受害者恒缺省自己→点选必败"的不一致; 其余单目标牌直接结算。
    function resolveCardSeatTarget(cardId, seat) {
      var game = getGame();
      var card = findPlayerCard(cardId);
      if (card && (card.type === 'guohe' || card.type === 'shunshou')) {
        showTargetZonePanelForSeat(cardId, seat);
        render();
        return;
      }
      if (card && card.type === 'huogong') {
        showHuogongPanelForSeat(cardId, seat);
        render();
        return;
      }
      if (card && card.type === 'jiedao') {
        // seat = 持刀者 An; 第二段选受害者 Bn (An 可 杀 到的座席)。
        var victims = Engine.jiedaoVictimCandidates
          ? Engine.jiedaoVictimCandidates(game, seat)
          : [];
        if (victims.length === 1) {
          finishJiedao(cardId, seat, victims[0]);
          return;
        }
        if (victims.length > 1) {
          var holderName = (game[seat] && game[seat].name) || '持刀者';
          startSeatPicker({
            legalSeats: victims,
            min: 1,
            max: 1,
            hintText: '借刀杀人：选择让' + holderName + '攻击的目标',
            onComplete: function (vs) { finishJiedao(cardId, seat, vs[0]); }
          });
          render();
          return;
        }
        // 理论不达 (legalTargetsForCard 已保证 An 有候选), 兜底缺省自己。
        finishJiedao(cardId, seat, 'player');
        return;
      }
      var hpBefore = {};
      Engine.seatList(game).forEach(function (s) { hpBefore[s] = game[s].hp; });
      var result = Engine.playCard(game, 'player', cardId, { target: seat });
      if (!result.ok) game.log.push(result.message);
      Engine.seatList(game).forEach(function (s) { if (game[s].hp < hpBefore[s]) flashHero(s); });
      render();
    }

    function finishJiedao(cardId, holderSeat, victimSeat) {
      var game = getGame();
      var hpBefore = {};
      Engine.seatList(game).forEach(function (s) { hpBefore[s] = game[s].hp; });
      var result = Engine.playCard(game, 'player', cardId, { target: holderSeat, jiedaoVictim: victimSeat });
      if (!result.ok) game.log.push(result.message);
      Engine.seatList(game).forEach(function (s) { if (game[s].hp < hpBefore[s]) flashHero(s); });
      render();
    }

    // v12 H 复核修复: identity3 铁索连环座席点选 (旧 tiesuoModePanel 硬编码
    // enemy/self/both, 无法选第三席)。改用泛化座席点选 (min1/max2 + "重铸"
    // 附加按钮); 1v1 仍走 showTiesuoPanel 原路径。
    function startTiesuoSeatPicker(cardId) {
      var game = getGame();
      var legalSeats = Engine.aliveSeats(game);
      startSeatPicker({
        legalSeats: legalSeats,
        min: 1,
        max: 2,
        hintText: '铁索连环：点选 1-2 名角色横置/重置，或点"重铸"摸牌',
        extraAction: {
          label: '重铸',
          handler: function () {
            var result = Engine.playCard(game, 'player', cardId, { mode: 'recast' });
            if (!result.ok) game.log.push(result.message);
            render();
          }
        },
        onComplete: function (seats) {
          var result = Engine.playCard(game, 'player', cardId, { targets: seats });
          if (!result.ok) game.log.push(result.message);
          render();
        }
      });
      render();
    }

    // v12 H6: 激将 (刘备主公技) — 出牌阶段选一名目标角色, 令蜀势力角色代出
    // 【杀】(引擎 triggerJijiangActiveSkill 处理代打/合法性)。1v1 中虽也可能
    // 持有该技能, 但同势力候选恒空, 沿用旧的通用 useSkill 直调路径 (仍会
    // 因缺目标失败, 与改动前行为一致); 本入口只在 identity3 接管。
    function tryEnterJijiangTargetMode() {
      var game = getGame();
      if (!game || game.mode !== 'identity3') return false;
      var legalSeats = Engine.aliveSeats(game).filter(function (s) { return s !== 'player'; });
      if (!legalSeats.length) return false;
      startSeatPicker({
        legalSeats: legalSeats,
        needed: 1,
        hintText: '激将：选择一名角色作为目标，令蜀势力角色代出【杀】',
        onComplete: function (seats) {
          var playerHpBefore = game.player.hp;
          var result = Engine.useSkill(game, 'player', 'jijiang', [], { target: seats[0] });
          if (!result.ok) game.log.push(result.message);
          if (game.player.hp < playerHpBefore) flashHero('player');
          render();
        }
      });
      return true;
    }

    // v12 H6: 离间 (貂蝉) — 弃 1 张成本牌 (由 dom-adapter 的 confirmCardSkill
    // 走既有 cardSkillConfig 流程先收好) 后, 依次选两名男性角色 (不含自己)。
    // 返回 false 表示无合法双人组合 (调用方回退旧的直调 useSkill, 会因目标
    // 不足报错, 与改动前行为一致)。
    function startLijianTargetPicker(costCardIds) {
      var game = getGame();
      if (!game) return false;
      var legalSeats = Engine.aliveSeats(game).filter(function (s) {
        return s !== 'player' && game[s] && game[s].gender === 'male';
      });
      if (legalSeats.length < 2) return false;
      startSeatPicker({
        legalSeats: legalSeats,
        needed: 2,
        hintText: '离间：依次选择两名男性角色（不含你自己），令他们决斗',
        onComplete: function (seats) {
          var playerHpBefore = game.player.hp;
          var result = Engine.useSkill(game, 'player', 'lijian', costCardIds, { targets: seats });
          if (!result.ok) game.log.push(result.message);
          if (game.player.hp < playerHpBefore) flashHero('player');
          render();
        }
      });
      return true;
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
      // v13 UI修缮1: 铁索 1v1 面板四选项改 stage-then-confirm — 此前点选项
      // 即打出, 是全 UI 唯一"最终生效不过确定"的出牌路径 (官方每张牌都要
      // 确认)。点选项只暂存 + 高亮, #handConfirmBtn 才 resolveTiesuo。
      function stageTiesuo(btn, options) {
        setStaged({ kind: 'tiesuo', options: options });
        _highlightStaged(btn);
        if (els.handHint) els.handHint.textContent = '已选择铁索方式，点「确定」打出';
        render();
      }
      if (els.tiesuoRecastBtn) els.tiesuoRecastBtn.addEventListener('click', function () { stageTiesuo(els.tiesuoRecastBtn, { mode: 'recast' }); });
      if (els.tiesuoChainEnemyBtn) els.tiesuoChainEnemyBtn.addEventListener('click', function () { stageTiesuo(els.tiesuoChainEnemyBtn, { mode: 'chain', targets: ['enemy'] }); });
      if (els.tiesuoChainSelfBtn) els.tiesuoChainSelfBtn.addEventListener('click', function () { stageTiesuo(els.tiesuoChainSelfBtn, { mode: 'chain', targets: ['player'] }); });
      if (els.tiesuoChainBothBtn) els.tiesuoChainBothBtn.addEventListener('click', function () { stageTiesuo(els.tiesuoChainBothBtn, { mode: 'chain', targets: ['player', 'enemy'] }); });
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
      // v12 H6: identity3 座席点选 — 取消按钮 + 三席英雄卡点击 (点选中的合法
      // 座席才生效, clickSeatForPicker 内部已校验)。
      if (els.seatTargetCancelBtn) els.seatTargetCancelBtn.addEventListener('click', function () { cancelSeatPicker(); render(); });
      // v12 H 复核修复: 多目标 (铁索) 的"确定"提前完成 + "重铸"附加动作。
      if (els.seatTargetConfirmBtn) els.seatTargetConfirmBtn.addEventListener('click', function () { finishSeatPicker(); render(); });
      if (els.seatTargetExtraBtn) els.seatTargetExtraBtn.addEventListener('click', function () { seatPickerExtraAction(); render(); });
      // v13 K3: 座席点选绑定扩容至 4/5 人档预置槽位 (缺席节点 guard 跳过)。
      ['player', 'enemy', 'ally', 'ally2', 'ally3'].forEach(function (seat) {
        var heroEl = els[seat + 'Hero'];
        if (!heroEl) return;
        heroEl.addEventListener('click', function () { clickSeatForPicker(seat); });
      });
    }


    return {
      showTiesuoPanel: showTiesuoPanel,
      hideTiesuoPanel: hideTiesuoPanel,
      showTargetZonePanel: showTargetZonePanel,
      showTargetZonePanelForSeat: showTargetZonePanelForSeat,
      hideTargetZonePanel: hideTargetZonePanel,
      showHuogongPanel: showHuogongPanel,
      showHuogongPanelForSeat: showHuogongPanelForSeat,
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
      // v12 H6: identity3 座席点选 API — 卡牌目标 / jijiang / lijian 三入口 +
      // 高亮查询 (board-panels 渲染用) + 取消。
      tryEnterSeatTargetMode: tryEnterSeatTargetMode,
      tryEnterJijiangTargetMode: tryEnterJijiangTargetMode,
      startLijianTargetPicker: startLijianTargetPicker,
      startTiesuoSeatPicker: startTiesuoSeatPicker,
      activeSeatPickerLegalSeats: activeSeatPickerLegalSeats,
      // v13 J0-1: 已暂存座席查询 (board-panels .is-target-staged 高亮用)。
      activeSeatPickerPickedSeats: activeSeatPickerPickedSeats,
      seatPickerActive: function () { return !!seatPicker; },
      cancelSeatPicker: cancelSeatPicker,
      render: renderModePanels,
      bind: bindModePanels
    };
  }
