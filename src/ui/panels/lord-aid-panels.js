  // v12 H6/H7: 主公技求助响应面板 — 激将 (jijiang-aid, 代打【杀】) / 护驾
  // (hujia-aid, 代打【闪】)。AI 主公打不出所需的牌时向玩家 (同势力座席)
  // 求助; 结构上与 shan-response/duel-response 同构 (候选列表 + 不响应),
  // 复用 stage() 两步提交范式 — 因守护测试用严格正则锁定了那两个面板的既有
  // 断言 (kind 分支/文案), 新建独立面板承载, 走 PENDING_MODAL_DISPATCH
  // 统一分发, 不改动既有两个面板一个字。
  //
  // pending 形状随触发路径 (决斗链 / AOE 逐席 / 杀需闪) 略有差异, 携带的
  // "求助理由" 字段名不完全统一 (reason / sourceName / shaName), 文案取
  // 第一个存在的字段, 与 response-panels.js 里 shanResponsePanel 的
  // `pending.sourceName || pending.shaName` 兜底同一惯例。
  export function createLordAidPanels(ctx) {
    var els = ctx.els;
    var Engine = ctx.Engine;
    var getGame = ctx.getGame;
    var render = ctx.render;
    var renderLog = ctx.renderLog;
    var escapeHtml = ctx.escapeHtml;
    var suitLabel = ctx.suitLabel;
    var stage = ctx.stage;
    var actorDisplayName = ctx.actorDisplayName;

    var LORD_AID_SPECS = {
      'jijiang-aid': { skillName: '激将', cardLabel: '杀' },
      'hujia-aid': { skillName: '护驾', cardLabel: '闪' }
    };

    function lordAidReasonText(pending) {
      if (pending.reason) return pending.reason;
      if (pending.sourceName) return '【' + pending.sourceName + '】';
      if (pending.shaName) return '【' + pending.shaName + '】';
      return '';
    }

    function renderLordAidPanel(kind, pending) {
      if (!els.lordAidPanel) return;
      var spec = LORD_AID_SPECS[kind];
      if (spec && pending.actor === 'player') {
        els.lordAidPanel.hidden = false;
        if (els.lordAidHint) {
          var lordName = actorDisplayName(pending.lordActor);
          var reasonText = lordAidReasonText(pending);
          els.lordAidHint.textContent =
            '主公' + lordName + '发动【' + spec.skillName + '】求助' + (reasonText ? '（' + reasonText + '）' : '')
            + '，是否代打【' + spec.cardLabel + '】？';
        }
        if (els.lordAidChoices) {
          var opts = pending.options || [];
          els.lordAidChoices.innerHTML = opts.length
            ? opts.map(function (opt) {
                var suit = suitLabel(opt.suit);
                var rank = opt.rank ? String(opt.rank).toUpperCase() : '';
                var prefix = opt.via ? opt.via + '·' : '';
                return '<button class="mini-card lord-aid-choice" data-lord-aid-card-id="'
                  + escapeHtml(opt.cardId) + '" title="用此牌代打">'
                  + escapeHtml(prefix + opt.name) + ' ' + suit + rank + '</button>';
              }).join('')
            : '<span class="mini-card">无可用的【' + escapeHtml(spec.cardLabel) + '】</span>';
        }
      } else {
        els.lordAidPanel.hidden = true;
      }
    }

    function bindLordAidPanel() {
      if (els.lordAidChoices) els.lordAidChoices.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-lord-aid-card-id]');
        if (!btn) return;
        var cardId = btn.getAttribute('data-lord-aid-card-id');
        stage({ cardId: cardId }, '[data-lord-aid-card-id="' + cardId + '"]');
      });
      if (els.lordAidDeclineBtn) els.lordAidDeclineBtn.addEventListener('click', function () {
        var result = Engine.resolvePendingChoice(getGame(), { use: false });
        if (!result.ok) renderLog();
        render();
      });
    }

    return {
      render: renderLordAidPanel,
      bind: bindLordAidPanel
    };
  }
