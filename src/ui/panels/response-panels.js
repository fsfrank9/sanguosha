  // v11 B2: 响应类面板模块 — 闪/万箭/银月 (共用 shanResponsePanel) 与
  // 无懈/决斗响应面板的渲染 + 事件绑定, 从 dom-adapter.js 整体迁出,
  // 渲染函数体逐行一致; 点候选 stage 改经注入的 stage() 助手 (语义同
  // 原 stagedModalChoice 赋值 + render), 不出/不使用按钮直接 resolve。
  export function createResponsePanels(ctx) {
    var els = ctx.els;
    var Engine = ctx.Engine;
    var getGame = ctx.getGame;
    var render = ctx.render;
    var renderLog = ctx.renderLog;
    var escapeHtml = ctx.escapeHtml;
    var suitLabel = ctx.suitLabel;
    var stage = ctx.stage;

    function renderResponsePanels(kind, pending) {
      // v10 V5: 无懈可击 响应 — 锦囊 targeting 玩家时弹. 文案据 chainWuxied 区分:
      //   false="对方使用【X】，是否打出【无懈】？"
      //   true="对方对【X】打出【无懈】，是否再【无懈】？"
      if (els.wuxieResponsePanel) {
        if (kind === 'wuxie-response' && pending.actor === 'player') {
          els.wuxieResponsePanel.hidden = false;
          if (els.wuxieResponseHint) {
            var wxReason = pending.reason || '锦囊';
            // v13 三批-6: 目标是他人时明示"帮 X 解围" — 无懈本可救队友,
            // 旧文案恒写"对方使用X"看不出这是替他人挡的机会。
            var wxHelpOther = pending.targetActor && pending.targetActor !== 'player' && pending.targetName;
            els.wuxieResponseHint.textContent = pending.chainWuxied
              ? '对方对' + wxReason + '打出【无懈可击】，是否再【无懈】反制？'
              : (wxHelpOther
                ? wxReason + '即将对 ' + pending.targetName + ' 生效，你可打出【无懈可击】为其解围（也可跳过不帮）。'
                : '对方使用' + wxReason + '，是否打出【无懈可击】抵消？');
          }
          if (els.wuxieResponseChoices) {
            var wuxieOpts = pending.options || [];
            els.wuxieResponseChoices.innerHTML = wuxieOpts.length
              ? wuxieOpts.map(function (opt) {
                  var suit = suitLabel(opt.suit);
                  var rank = opt.rank ? String(opt.rank).toUpperCase() : '';
                  return '<button class="mini-card wuxie-response-choice" data-wuxie-card-id="'
                    + escapeHtml(opt.cardId) + '" title="用此【无懈】响应">'
                    + escapeHtml(opt.name) + ' ' + suit + rank + '</button>';
                }).join('')
              : '<span class="mini-card">无可用的【无懈可击】</span>';
          }
        } else {
          els.wuxieResponsePanel.hidden = true;
        }
      }
      // v10 V6: 决斗 响应 — 对方发起【决斗】, 玩家选用哪张牌当【杀】响应.
      // 候选含真【杀】 + 龙胆 / 武圣 转化. 不出 → 自己受 1 伤.
      if (els.duelResponsePanel) {
        if (kind === 'sha-duel-response' && pending.actor === 'player') {
          els.duelResponsePanel.hidden = false;
          if (els.duelResponseHint) {
            els.duelResponseHint.textContent =
              '对方对你发起' + (pending.reason || '【决斗】')
              + '，请选择一张牌当【杀】响应，或不出（受 1 点伤害）。';
          }
          if (els.duelResponseChoices) {
            var duelOpts = pending.options || [];
            els.duelResponseChoices.innerHTML = duelOpts.length
              ? duelOpts.map(function (opt) {
                  var suit = suitLabel(opt.suit);
                  var rank = opt.rank ? String(opt.rank).toUpperCase() : '';
                  var prefix = opt.via ? opt.via + '·' : '';
                  return '<button class="mini-card duel-response-choice" data-duel-card-id="'
                    + escapeHtml(opt.cardId) + '" title="用此牌当【杀】">'
                    + escapeHtml(prefix + opt.name) + ' ' + suit + rank + '</button>';
                }).join('')
              : '<span class="mini-card">无可用的【杀】</span>';
          }
        } else {
          els.duelResponsePanel.hidden = true;
        }
      }
      // v9 PR-E25/E26: 闪响应 — 被【杀】攻击时玩家选用哪张牌当【闪】.
      // v10 V4: 万箭齐发 (wanjian-response) + 银月枪 (yinyue-response) 复用此面板.
      // 各 kind 通过 pending.sourceName / shaName 决定文案 (V3 用 shaName, V4 用 sourceName).
      var SHAN_RESPONSE_KINDS = ['shan-response', 'wanjian-response', 'yinyue-response'];
      if (els.shanResponsePanel) {
        if (SHAN_RESPONSE_KINDS.indexOf(kind) >= 0 && pending.actor === 'player') {
          els.shanResponsePanel.hidden = false;
          if (els.shanResponseHint) {
            var srcLabel = pending.sourceName || pending.shaName || '杀';
            var verb = kind === 'yinyue-response' ? '发动' : '使用';
            els.shanResponseHint.textContent =
              '对方' + verb + '【' + srcLabel + '】，点选一张牌当【闪】后按下方【确认】，或点【不出【闪】】。';
          }
          if (els.shanResponseChoices) {
            var shanOpts = pending.options || [];
            els.shanResponseChoices.innerHTML = shanOpts.length
              ? shanOpts.map(function (opt) {
                  var suit = suitLabel(opt.suit);
                  var rank = opt.rank ? String(opt.rank).toUpperCase() : '';
                  var prefix = opt.via ? opt.via + '·' : '';
                  return '<button class="mini-card shan-response-choice" data-shan-card-id="'
                    + escapeHtml(opt.cardId) + '" title="用此牌当【闪】">'
                    + escapeHtml(prefix + opt.name) + ' ' + suit + rank + '</button>';
                }).join('')
              : '<span class="mini-card">无可用的【闪】</span>';
          }
        } else {
          els.shanResponsePanel.hidden = true;
        }
      }
    }

    function bindResponsePanels() {
      // v9 PR-E26: 闪响应 — 候选两步化. 点候选 (真闪/转化牌) 只 stage 高亮,
      // #handConfirmBtn 才 resolvePendingChoice({cardId}); 不出 → {use:false}.
      // resolvePendingChoice 后引擎完成【杀】结算, enemyStep 轮询自动续上.
      if (els.shanResponseChoices) els.shanResponseChoices.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-shan-card-id]');
        if (!btn) return;
        var cardId = btn.getAttribute('data-shan-card-id');
        stage({ cardId: cardId }, '[data-shan-card-id="' + cardId + '"]');
      });
      if (els.shanResponseDeclineBtn) els.shanResponseDeclineBtn.addEventListener('click', function () {
        var result = Engine.resolvePendingChoice(getGame(), { use: false });
        if (!result.ok) renderLog();
        render();
      });
      // v10 V5: 无懈可击 响应 — 候选两步化, decline 直接 resolve.
      if (els.wuxieResponseChoices) els.wuxieResponseChoices.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-wuxie-card-id]');
        if (!btn) return;
        var cardId = btn.getAttribute('data-wuxie-card-id');
        stage({ cardId: cardId }, '[data-wuxie-card-id="' + cardId + '"]');
      });
      if (els.wuxieResponseDeclineBtn) els.wuxieResponseDeclineBtn.addEventListener('click', function () {
        var result = Engine.resolvePendingChoice(getGame(), { use: false });
        if (!result.ok) renderLog();
        render();
      });
      // v10 V6: 决斗 响应 — 候选两步化, decline 直接 resolve {use:false}.
      if (els.duelResponseChoices) els.duelResponseChoices.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-duel-card-id]');
        if (!btn) return;
        var cardId = btn.getAttribute('data-duel-card-id');
        stage({ cardId: cardId }, '[data-duel-card-id="' + cardId + '"]');
      });
      if (els.duelResponseDeclineBtn) els.duelResponseDeclineBtn.addEventListener('click', function () {
        var result = Engine.resolvePendingChoice(getGame(), { use: false });
        if (!result.ok) renderLog();
        render();
      });
    }

    return {
      render: renderResponsePanels,
      bind: bindResponsePanels
    };
  }
