      import { SanguoshaEngine } from '../engine/game-engine.js';
      import { createResponsePanels } from './panels/response-panels.js';
      import { createPromptPanels } from './panels/prompt-panels.js';
      import { createModePanels } from './panels/mode-panels.js';
      import { createLobbyPanels } from './panels/lobby-panels.js';
      import { createBoardPanels } from './panels/board-panels.js';

      var Engine = SanguoshaEngine;
      var game = null;
      var enemyThinking = false;
      var selectedDiscardIds = [];
      // v9 PR-E16: play 阶段选-后-确认 模式. 点 hand-card 仅 set 此 id +
      // 高亮; #handConfirmBtn 触发后才真正 usePlayerCard. discard / skill /
      // pending response 等模式仍是即时行为 (sentinel 在 click handler 判断).
      var selectedHandCardId = null;
      // v9 PR-E23: 二级面板 (目标选择 / 火攻弃牌) 也走"选中→确认"两步.
      // 点候选只 stage (高亮), #handConfirmBtn 才真正 resolve.
      // 形如 { kind: 'target', zone, cardId } 或 { kind: 'huogong', costId }.
      var stagedModalChoice = null;
      // v11 B2: 模式面板状态 (pendingTiesuo/Target/Huogong/Conversion,
      // guanxing 三区) 已随面板迁往 ./panels/mode-panels.js。
      // v6.1 ganglie source-choice picker: 2-card multi-select.
      var skillSelectMode = null;
      var selectedSkillCardIds = [];
      // v9 PR-E22: 电脑回合节奏 — 用户反馈"自动出牌阶段过得太快, 来不及反应".
      // 拆两档: 出牌阶段的实质动作 (出杀/锦囊等) 用 enemyActionDelay 慢一些
      // 让玩家看清; 准备/判定/摸牌/弃牌/结束 等阶段切换用 enemyPhaseDelay.
      var enemyActionDelay = 1300;
      var enemyPhaseDelay = 700;
      var playerRole = '主公';
      var enemyRole = '反贼';
      var els = {};

      var lobbyPanels = createLobbyPanels({
        els: els,
        Engine: Engine,
        escapeHtml: escapeHtml
      });
      // v12 F6: 战场渲染域装配 — 稳定依赖注入, 可变状态经 uiView() 按次传入
      var boardPanels = createBoardPanels({
        els: els,
        Engine: Engine,
        escapeHtml: escapeHtml,
        lobbyPanels: lobbyPanels,
        cardSkillConfig: cardSkillConfig,
        firstVisibleDispatch: _firstVisibleDispatch
      });

      // v11 B2: 响应类面板装配 — els 为原地填充的稳定引用; render/renderLog/
      // escapeHtml/suitLabel 为函数声明 (提升); stage 语义 = 原 stagedModalChoice
      // 赋值 + render (两步化提交仍由 _handConfirm 的 'pending' 分支统一处理)。
      // v11 B2: 模式面板装配 — staged 经 get/setStaged 双向共享 (target/
      // huogong/conversion 三种 staged kind 仍由 _handConfirm 统一提交)。
      var modePanels = createModePanels({
        els: els,
        Engine: Engine,
        getGame: function () { return game; },
        render: function () { render(); },
        escapeHtml: function (text) { return escapeHtml(text); },
        flashHero: function (side) { return flashHero(side); },
        findPlayerCard: function (cardId) { return findPlayerCard(cardId); },
        getStaged: function () { return stagedModalChoice; },
        setStaged: function (value) { stagedModalChoice = value; },
        highlightStaged: function (el) { return _highlightStaged(el); },
        // v11 C4 (批次 28): 转化面板"按原牌"分支回接主 adapter 的常规出牌
        // 路由 (B2 迁出时漏注入, 由 C4 面板行为测试暴露)。
        resolveNormalPlayerCard: function (cardId) { return resolveNormalPlayerCard(cardId); }
      });
      var showTiesuoPanel = modePanels.showTiesuoPanel;
      var hideTiesuoPanel = modePanels.hideTiesuoPanel;
      var showTargetZonePanel = modePanels.showTargetZonePanel;
      var hideTargetZonePanel = modePanels.hideTargetZonePanel;
      var showHuogongPanel = modePanels.showHuogongPanel;
      var hideHuogongPanel = modePanels.hideHuogongPanel;
      var showConversionPanel = modePanels.showConversionPanel;
      var hideConversionPanel = modePanels.hideConversionPanel;
      var showGuanxingPanelFromPending = modePanels.showGuanxingPanelFromPending;
      var hideGuanxingPanel = modePanels.hideGuanxingPanel;
      var resolveTargetCard = modePanels.resolveTargetCard;
      var resolveHuogong = modePanels.resolveHuogong;
      var resolveConversion = modePanels.resolveConversion;
      // v11 B2: 提示类面板装配 (ctx 语义同 responsePanels)。
      var promptPanels = createPromptPanels({
        els: els,
        Engine: Engine,
        getGame: function () { return game; },
        render: function () { render(); },
        renderLog: function () { renderLog(); },
        escapeHtml: function (text) { return escapeHtml(text); },
        suitLabel: function (suit) { return suitLabel(suit); },
        promptCardChoice: function (card, opts) { return promptCardChoice(card, opts); },
        actorDisplayName: function (actor) { return actorDisplayName(actor); },
        stage: function (payload, selector) {
          stagedModalChoice = { kind: 'pending', payload: payload, selector: selector };
          render();
        }
      });
      var responsePanels = createResponsePanels({
        els: els,
        Engine: Engine,
        getGame: function () { return game; },
        render: function () { render(); },
        renderLog: function () { renderLog(); },
        escapeHtml: function (text) { return escapeHtml(text); },
        suitLabel: function (suit) { return suitLabel(suit); },
        stage: function (payload, selector) {
          stagedModalChoice = { kind: 'pending', payload: payload, selector: selector };
          render();
        }
      });

      function $(id) {
        return document.getElementById(id);
      }

      function initElements() {
        [
          'startGameBtn', 'randomPlayerHeroBtn', 'randomEnemyHeroBtn',
          'setupScreen', 'duelTable', 'enemyHero', 'playerHero', 'enemyName', 'playerName',
          'enemyCamp', 'playerCamp', 'enemyQuote', 'playerQuote', 'enemyHp', 'playerHp',
          'enemyHandCount', 'playerHandCount', 'enemyState', 'playerState', 'statusTitle',
          'statusText', 'deckInfo', 'playerHand', 'enemyHandBacks', 'battleLog', 'handHint',
          'enemyTurnBadge', 'playerTurnBadge', 'statusBanner', 'playerSkillBar', 'phaseTrack',
          'playerHeroSelect', 'enemyHeroSelect', 'playerEquipmentArea', 'enemyEquipmentArea',
          'playerJudgeArea', 'enemyJudgeArea', 'confirmDiscardBtn', 'enemyRibbon', 'playerRibbon',
          'tiesuoModePanel', 'tiesuoRecastBtn', 'tiesuoChainEnemyBtn', 'tiesuoChainSelfBtn',
          'tiesuoChainBothBtn', 'tiesuoCancelBtn', 'targetZonePanel', 'targetHandBtn',
          'targetEquipmentBtn', 'targetJudgeBtn', 'targetCancelBtn', 'targetCardChoices', 'huogongModePanel',
          'huogongRevealText', 'huogongCostChoices', 'huogongDeclineBtn', 'huogongCancelBtn', 'conversionModePanel',
          'conversionHint', 'conversionNormalBtn', 'conversionShaBtn', 'conversionExtraChoices', 'conversionCancelBtn', 'guanxingModePanel',
          'guanxingHint', 'guanxingUnassigned', 'guanxingTopZone', 'guanxingBottomZone',
          'guanxingTopBtn', 'guanxingBottomBtn', 'guanxingReturnBtn', 'guanxingConfirmBtn', 'guanxingDeclineBtn',
          'zhihengModePanel',
          'zhihengConfirmBtn', 'zhihengCancelBtn', 'zhihengHint', 'roleDraftPanel',
          'guicaiPromptPanel', 'guicaiPromptHint', 'guicaiOriginalCard', 'guicaiCandidates', 'guicaiDeclineBtn',
          'yijiPromptPanel', 'yijiPromptHint', 'yijiCandidates', 'yijiKeepAllBtn', 'yijiConfirmBtn',
          'fanjianPromptPanel', 'fanjianPromptHint',
          'fanjianSpadeBtn', 'fanjianHeartBtn', 'fanjianClubBtn', 'fanjianDiamondBtn',
          'fankuiPromptPanel', 'fankuiPromptHint', 'fankuiZones',
          'gangliePromptPanel', 'gangliePromptHint', 'ganglieFireBtn', 'ganglieDeclineBtn',
          'ganglieSourcePanel', 'ganglieSourceHint', 'ganglieSourceCandidates', 'ganglieSourceConfirmBtn', 'ganglieSourceTakeDamageBtn',
          'qilinPickPanel', 'qilinPickHint', 'qilinPickChoices', 'qilinDeclineBtn',
          // 审计二轮 PR-8: 贯石斧自选两张 + 火攻展示牌自选 面板
          'guanshiDiscardPanel', 'guanshiDiscardHint', 'guanshiDiscardChoices', 'guanshiConfirmBtn', 'guanshiDeclineBtn',
          'huogongShowPanel', 'huogongShowHint', 'huogongShowChoices',
          'dyingRescuePanel', 'dyingRescueHint', 'dyingRescueChoices', 'dyingRescueDeclineBtn',
          'cixiongFirePanel', 'cixiongFireHint', 'cixiongFireBtn', 'cixiongFireDeclineBtn',
          'cixiongChoosePanel', 'cixiongChooseHint', 'cixiongChooseChoices', 'cixiongChooseDrawBtn',
          'jiedaoDecisionPanel', 'jiedaoDecisionHint', 'jiedaoDecisionFireBtn', 'jiedaoDecisionDeclineBtn',
          'guohePickPanel', 'guohePickHint', 'guohePickEquipment', 'guohePickHand',
          'wuguPickPanel', 'wuguPickHint', 'wuguPickChoices',
          // v8 hotfix-2: 洛神 (luoshen-continue) 面板 — 准备阶段连续判定决定
          'luoshenPromptPanel', 'luoshenPromptHint', 'luoshenContinueBtn', 'luoshenStopBtn',
          // v12 G2: 神速 (shensu-options) 面板 — 准备阶段至多两项 + 选项二/
          // 一+二 的装备候选弃置子步骤 (鬼道复用鬼才面板, 无需新 id — 见下方
          // guicaiPromptPanel 注释)
          'shensuOptionsPanel', 'shensuOptionsHint', 'shensuDeclineBtn', 'shensuOptionOneBtn',
          'shensuOptionTwoBtn', 'shensuBothBtn', 'shensuEquipCandidates', 'shensuConfirmEquipBtn',
          // v11 C7 (批次 31): 耀武 (yaowu-reward) 面板 — 伤害来源奖励二选一
          'yaowuRewardPanel', 'yaowuRewardHint', 'yaowuRecoverBtn', 'yaowuDrawBtn',
          // v9 PR-E25/E26: 闪响应面板 — 被【杀】时玩家选用哪张牌当闪 (V4: 万箭/银月复用)
          'shanResponsePanel', 'shanResponseHint', 'shanResponseChoices', 'shanResponseDeclineBtn',
          // v10 V5: 无懈可击 响应面板 — 锦囊 targeting 玩家时弹
          'wuxieResponsePanel', 'wuxieResponseHint', 'wuxieResponseChoices', 'wuxieResponseDeclineBtn',
          // v10 V6: 决斗 响应面板 — 玩家被发起决斗, 手动选用哪张牌当杀
          'duelResponsePanel', 'duelResponseHint', 'duelResponseChoices', 'duelResponseDeclineBtn',
          // v9 PR-E1: 装饰外框角落 widgets — 菜单 / 分享. placeholder 行为, 等
          // PR-E5 接入侧抽屉.
          'frameMenuBtn', 'frameShareBtn',
          // v9 PR-E2: 中央日志 overlay (.duel-table 上, 最近 4-6 条 game.log).
          'logOverlay',
          // v9 PR-E4: 主公徽章 — 右上角红圆 "主". 由 renderHero 据
          // game.roles[actor] 切换 hidden.
          // v9 PR-E14: 反贼徽章 — 同位置绿圆 "反". 与 lord-badge 互斥显示.
          'playerLordBadge', 'enemyLordBadge', 'playerRebelBadge', 'enemyRebelBadge',
          // v9 PR-E5: 侧抽屉菜单 + 退出确认 modal
          'sideDrawer', 'drawerExitBtn', 'drawerRestartBtn', 'drawerHelpBtn', 'drawerCloseBtn',
          'exitConfirmModal', 'exitConfirmBackdrop', 'exitConfirmYesBtn', 'exitConfirmNoBtn',
          // v9 PR-E8: 一级 lobby
          'lobbyScreen', 'lobbyKofBtn', 'lobby1v1Btn', 'lobbyHellBtn',
          // v9 PR-E9: 选将网格 — 替代旧 <select> 下拉
          'heroPick', 'heroPickPrompt', 'heroPickPlayerTab', 'heroPickEnemyTab',
          'heroPickPlayerValue', 'heroPickEnemyValue', 'heroPickGrid',
          'randomRolesBtn', 'playerRoleBadge', 'enemyRoleBadge',
          // v9 PR-E15: 牌堆/弃牌 数字显示在玩家技能 panel-title 右侧
          'playerSkillDeckInfo',
          // v9 PR-E16: hand-dock 内 3 个按钮 (确认 / 取消 / 结束回合).
          'handConfirmBtn', 'handCancelBtn', 'handDiscardBtn'
        ].forEach(function (id) { els[id] = $(id); });
        els.log = els.battleLog;
      }

      function escapeHtml(text) {
        return String(text)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      // v9 PR-E5: 侧抽屉 + 退出确认 modal 显隐工具.
      function openSideDrawer() { if (els.sideDrawer) els.sideDrawer.hidden = false; }
      function closeSideDrawer() { if (els.sideDrawer) els.sideDrawer.hidden = true; }
      function toggleSideDrawer() {
        if (!els.sideDrawer) return;
        els.sideDrawer.hidden = !els.sideDrawer.hidden;
      }
      function openExitConfirm() { if (els.exitConfirmModal) els.exitConfirmModal.hidden = false; }
      function closeExitConfirm() { if (els.exitConfirmModal) els.exitConfirmModal.hidden = true; }

      // v12 F6: 渲染域 (英雄区/手牌/日志/状态栏/阶段条/装备判定区) 迁往
      // ./panels/board-panels.js — 可变状态经 uiView() 按次传入 (F4 房规),
      // pendingChoice 面板路由与 staged 高亮涉及 adapter 闭包写操作, 留驻。
      function uiView() {
        return {
          game: game,
          enemyThinking: enemyThinking,
          selectedDiscardIds: selectedDiscardIds,
          selectedHandCardId: selectedHandCardId,
          skillSelectMode: skillSelectMode,
          selectedSkillCardIds: selectedSkillCardIds,
          stagedModalChoice: stagedModalChoice
        };
      }
      function renderLog() { boardPanels.renderLog(uiView()); }
      function suitLabel(suit) { return boardPanels.suitLabel(suit); }
      function suitRankBadge(card) { return boardPanels.suitRankBadge(card); }
      function suitColorClass(suit) { return boardPanels.suitColorClass(suit); }
      function activeCardSkillConfig() { return boardPanels.activeCardSkillConfig(uiView()); }
      function playerCardAction(card) { return boardPanels.playerCardAction(uiView(), card); }
      function render() {
        boardPanels.renderBoard(uiView());
        renderPendingChoice();
        // v9 PR-E24: pendingChoice 已消失 (响应面板关闭) → 清掉 stale 的 staged.
        if (stagedModalChoice && stagedModalChoice.kind === 'pending' &&
            !(game && Engine.getPendingChoice(game))) {
          stagedModalChoice = null;
        }
        // v9 PR-E24: renderPendingChoice 每次重建候选 DOM, 重新套用 staged 高亮.
        _reapplyStagedHighlight();
      }

      // v9 PR-E24: render 重建 pending 面板候选后, 据 stagedModalChoice.selector
      // 重新加 .is-staged 高亮 (target/huogong 面板不重建, 不需要此机制).
      function _reapplyStagedHighlight() {
        if (stagedModalChoice && stagedModalChoice.selector) {
          _highlightStaged(document.querySelector(stagedModalChoice.selector));
        }
      }

      // v8 PR-A1: 通用 pendingChoice 牌按钮 — 所有面板都用统一模板。
      // opts: {
      //   dataAttrs: { camelCaseKey: value } → data-camel-case-key="value"
      //   title: button tooltip
      //   selected: bool — adds 'selected' class
      //   prefix: string before 【name】
      //   suffix: string after suit+rank
      //   extraClass: extra class names (space-separated)
      //   disabled: bool
      // }
      function promptCardChoice(card, opts) {
        opts = opts || {};
        var attrs = '';
        var dataAttrs = opts.dataAttrs || {};
        Object.keys(dataAttrs).forEach(function (k) {
          var kebab = k.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); });
          attrs += ' data-' + kebab + '="' + escapeHtml(String(dataAttrs[k])) + '"';
        });
        var cls = 'mini-card prompt-card-choice';
        if (opts.selected) cls += ' selected';
        if (opts.extraClass) cls += ' ' + opts.extraClass;
        var suit = suitLabel(card.suit);
        var rank = card.rank ? String(card.rank).toUpperCase() : '';
        var suitRank = (suit || rank)
          ? ' <span class="mini-card-suit ' + suitColorClass(card.suit) + '">'
            + escapeHtml(suit) + (suit && rank ? ' ' : '') + escapeHtml(rank) + '</span>'
          : '';
        return '<button class="' + cls + '"'
          + attrs
          + (opts.title ? ' title="' + escapeHtml(opts.title) + '"' : '')
          + (opts.disabled ? ' disabled' : '')
          + '>'
          + escapeHtml(opts.prefix || '')
          + '【' + escapeHtml(card.name) + '】'
          + suitRank
          + escapeHtml(opts.suffix || '')
          + '</button>';
      }

      // 审计二轮 PR-8: 贯石斧成本多选 (恰好 2 张, 手牌/装备混选)

      function renderPendingChoice() {
        var pending = game && Engine.getPendingChoice(game);
        var kind = pending && pending.kind;
        // v11 B2: 观星模式面板渲染已迁往 ./panels/mode-panels.js。
        modePanels.render(kind, pending);
        // v11 B2: 提示类面板渲染已迁往 ./panels/prompt-panels.js。
        promptPanels.render(kind, pending);
        // v11 B2: 无懈/决斗/闪族响应面板渲染已迁往 ./panels/response-panels.js。
        responsePanels.render(kind, pending);
      }

      // v8 PR-A2: actorDisplayName — 与 actorName 类似，但只用 hero name
      // 而非战报里的"我方/对方"。如果 actor === 'player'/'enemy' fall back
      // to game[actor].name 保证有可读字符串。
      function actorDisplayName(actor) {
        if (!game || !game[actor]) return actor;
        return game[actor].name || actor;
      }

      function flashHero(actor, label) {
        var hero = els[actor + 'Hero'];
        hero.classList.remove('shake');
        void hero.offsetWidth;
        hero.classList.add('shake');
        var float = document.createElement('span');
        float.className = 'damage-float';
        float.textContent = label || '命中';
        hero.appendChild(float);
        window.setTimeout(function () {
          if (float.parentNode) float.parentNode.removeChild(float);
        }, 900);
      }

      function findPlayerCard(cardId) {
        return game && game.player.hand.find(function (card) { return card.id === cardId; });
      }

      // v11 B2: 模式面板显示/隐藏与观星簇已迁往 ./panels/mode-panels.js。

      // v11 B2: 火攻/目标区域面板渲染助手已迁往 ./panels/mode-panels.js。

      function cardSkillConfig(skillId) {
        var configs = {
          zhiheng: {
            name: '制衡',
            min: 1,
            max: Infinity,
            cardHint: '选择这张牌用于【制衡】',
            startHint: '制衡：点选任意张手牌后确认',
            selectedHint: function (count) { return '制衡：已选 ' + count + ' 张'; },
            emptyMessage: '请选择至少一张牌发动【制衡】。'
          },
          rende: {
            name: '仁德',
            min: 1,
            max: Infinity,
            cardHint: '选择这张牌交给对方发动【仁德】',
            startHint: '仁德：点选要交给对方的手牌后确认；累计两张可回复 1 点体力',
            selectedHint: function (count) { return '仁德：已选 ' + count + ' 张'; },
            emptyMessage: '请选择至少一张牌发动【仁德】。'
          },
          fanjian: {
            name: '反间',
            min: 1,
            max: 1,
            cardHint: '选择一张牌交给对方发动【反间】',
            startHint: '反间：选择一张手牌交给对方；本版默认对方猜黑桃',
            selectedHint: function (count) { return '反间：已选 ' + count + ' / 1 张'; },
            emptyMessage: '请选择一张牌发动【反间】。',
            options: { guessedSuit: 'spade' }
          },
          // v8 PR-C4: 青囊 — 弃 1 手牌, target 默认走 engine 推断
          // (对方受伤 → 对方; 否则自己; 都满血则 fail)。多目标 picker UI
          // 留给方向 1 后续 panel PR.
          qingnang: {
            name: '青囊',
            min: 1,
            max: 1,
            cardHint: '选择一张手牌弃置发动【青囊】',
            startHint: '青囊：弃 1 手牌, 令一名受伤的角色回 1 体力 (默认对方受伤优先, 否则自己)',
            selectedHint: function (count) { return '青囊：已选 ' + count + ' / 1 张'; },
            emptyMessage: '请选择一张手牌发动【青囊】。'
          },
          // v11 C6 (批次 30): 结姻 — 弃 2 手牌, 与受伤男性对手各回 1
          jieyin: {
            name: '结姻',
            min: 2,
            max: 2,
            cardHint: '选择这张牌用于【结姻】',
            startHint: '结姻：弃 2 张手牌, 与受伤的男性对手各回复 1 点体力 (每回合限一次)',
            selectedHint: function (count) { return '结姻：已选 ' + count + ' / 2 张'; },
            emptyMessage: '请选择两张手牌发动【结姻】。'
          }
        };
        return configs[skillId] || null;
      }

      function enterCardSkillMode(skillId) {
        var config = cardSkillConfig(skillId);
        if (!config) return false;
        skillSelectMode = skillId;
        selectedSkillCardIds = [];
        if (els.zhihengModePanel) els.zhihengModePanel.hidden = false;
        if (els.zhihengHint) els.zhihengHint.textContent = config.startHint;
        if (els.zhihengConfirmBtn) els.zhihengConfirmBtn.textContent = '确认' + config.name;
        render();
        return true;
      }

      function exitSkillSelectMode() {
        skillSelectMode = null;
        selectedSkillCardIds = [];
        if (els.zhihengModePanel) els.zhihengModePanel.hidden = true;
        if (els.zhihengConfirmBtn) els.zhihengConfirmBtn.textContent = '确认制衡';
      }

      function toggleSkillCard(cardId) {
        var config = activeCardSkillConfig();
        if (!config) return;
        var index = selectedSkillCardIds.indexOf(cardId);
        if (index >= 0) selectedSkillCardIds.splice(index, 1);
        else if (config.max === 1) selectedSkillCardIds = [cardId];
        else selectedSkillCardIds.push(cardId);
        if (els.zhihengHint) els.zhihengHint.textContent = config.selectedHint(selectedSkillCardIds.length);
        render();
      }

      function confirmCardSkill() {
        var config = activeCardSkillConfig();
        if (!game || !config) return;
        if (selectedSkillCardIds.length < config.min) {
          game.log.push(config.emptyMessage);
          render();
          return;
        }
        var cardIds = config.max === 1 ? selectedSkillCardIds.slice(0, 1) : selectedSkillCardIds;
        var enemyHpBefore = game.enemy.hp;
        var result = Engine.useSkill(game, 'player', skillSelectMode, cardIds, config.options || {});
        exitSkillSelectMode();
        if (!result.ok) game.log.push(result.message);
        if (game.enemy.hp < enemyHpBefore) flashHero('enemy');
        render();
      }

      // v11 B2: 模式面板结算函数已迁往 ./panels/mode-panels.js (经别名回接)。

      function resolveNormalPlayerCard(cardId) {
        if (!game) return;
        var clickedCard = findPlayerCard(cardId);
        if (clickedCard && clickedCard.type === 'tiesuo' && game.phase === 'play') {
          hideTargetZonePanel();
          hideHuogongPanel();
          hideConversionPanel();
          hideGuanxingPanel();
          showTiesuoPanel(cardId);
          return;
        }
        if (clickedCard && (clickedCard.type === 'guohe' || clickedCard.type === 'shunshou') && game.phase === 'play') {
          hideTiesuoPanel();
          hideHuogongPanel();
          hideConversionPanel();
          hideGuanxingPanel();
          showTargetZonePanel(cardId);
          return;
        }
        if (clickedCard && clickedCard.type === 'huogong' && game.phase === 'play') {
          hideTiesuoPanel();
          hideTargetZonePanel();
          hideConversionPanel();
          hideGuanxingPanel();
          showHuogongPanel(cardId);
          return;
        }
        hideTiesuoPanel();
        hideTargetZonePanel();
        hideHuogongPanel();
        hideGuanxingPanel();
        hideConversionPanel();
        var enemyHpBefore = game.enemy.hp;
        var playerHpBefore = game.player.hp;
        var result = Engine.playCard(game, 'player', cardId);
        if (!result.ok) {
          game.log.push(result.message);
        }
        if (game.enemy.hp < enemyHpBefore) flashHero('enemy');
        if (game.player.hp < playerHpBefore) flashHero('player');
        render();
      }

      function usePlayerCard(cardId) {
        if (!game || game.turn !== 'player' || enemyThinking) return;
        if (activeCardSkillConfig()) {
          toggleSkillCard(cardId);
          return;
        }
        if (game.phase === 'discard' && Engine.needsDiscard(game, 'player')) {
          var index = selectedDiscardIds.indexOf(cardId);
          if (index >= 0) selectedDiscardIds.splice(index, 1);
          else selectedDiscardIds.push(cardId);
          render();
          return;
        }
        var clickedCard = findPlayerCard(cardId);
        var action = clickedCard ? playerCardAction(clickedCard) : null;
        if (action && action.mode === 'choice') {
          hideTiesuoPanel();
          hideTargetZonePanel();
          hideHuogongPanel();
          hideGuanxingPanel();
          showConversionPanel(cardId);
          render();
          return;
        }
        if (action && (action.mode === 'asSha' || action.mode === 'convert')) {
          // v11 C4 (批次 28): 原牌不可用 + 唯一转化候选 → 直接按该 asType
          // 转化 (asSha 为杀专用旧模式, convert 为锦囊类泛化模式)。
          hideTiesuoPanel();
          hideTargetZonePanel();
          hideHuogongPanel();
          hideGuanxingPanel();
          hideConversionPanel();
          var enemyHpBefore = game.enemy.hp;
          var playerHpBefore = game.player.hp;
          var result = action.mode === 'asSha'
            ? Engine.playCardAs(game, 'player', cardId, 'sha')
            : Engine.playCardAs(game, 'player', cardId, action.asType);
          if (!result.ok) {
            game.log.push(result.message);
          }
          if (game.enemy.hp < enemyHpBefore) flashHero('enemy');
          if (game.player.hp < playerHpBefore) flashHero('player');
          render();
          return;
        }
        resolveNormalPlayerCard(cardId);
      }

      function confirmDiscardSelection() {
        if (!game || game.turn !== 'player' || game.phase !== 'discard') return;
        var result = Engine.discardSelected(game, 'player', selectedDiscardIds);
        selectedDiscardIds = [];
        if (!result.ok) {
          game.log.push(result.message);
          render();
          return;
        }
        Engine.advancePhase(game);
        if (game.phase === 'finish') Engine.endTurn(game);
        render();
        maybeStartEnemyTurn();
      }

      function usePlayerSkill(skillId) {
        if (!game || game.turn !== 'player' || game.phase !== 'play' || enemyThinking) return;
        if (cardSkillConfig(skillId)) {
          hideTiesuoPanel();
          hideTargetZonePanel();
          hideHuogongPanel();
          hideConversionPanel();
          hideGuanxingPanel();
          enterCardSkillMode(skillId);
          return;
        }
        hideTiesuoPanel();
        hideTargetZonePanel();
        hideHuogongPanel();
        hideConversionPanel();
        // v6.1: 观星 no longer fires on play-phase click — it auto-triggers
        // in the prepare phase via pendingChoice. Clicking the (typically
        // disabled) button now just re-opens an in-progress panel if there
        // happens to be a pending guanxing-reorder choice.
        if (skillId === 'guanxing') {
          var pending = game && Engine.getPendingChoice(game);
          if (pending && pending.kind === 'guanxing-reorder' && pending.actor === 'player') {
            showGuanxingPanelFromPending();
          }
          render();
          return;
        }
        // v8 PR-C5: 洛神 — 准备阶段自动触发 + 走 pendingChoice (luoshen-continue).
        // 出牌阶段的按钮点击不做任何事（按钮通常 disabled, 此处是 defensive）。
        // luoshen-continue 面板由 dying-rescue 框架以后续 PR-A6 接入；目前
        // 若残留 pendingChoice 则提示玩家用 Engine.resolvePendingChoice 决定。
        if (skillId === 'luoshen') {
          render();
          return;
        }
        hideGuanxingPanel();
        var cardIds = [];
        var playerHpBefore = game.player.hp;
        var result = Engine.useSkill(game, 'player', skillId, cardIds);
        selectedDiscardIds = [];
        if (!result.ok) game.log.push(result.message);
        if (game.player.hp < playerHpBefore) flashHero('player');
        render();
      }

      function enemyStep() {
        if (!game || game.phase === 'gameover' || game.turn !== 'enemy') {
          enemyThinking = false;
          render();
          return;
        }
        // v9 PR-E25: 电脑回合中出现待玩家决策的 pendingChoice (如被【杀】要不要
        // 出【闪】) → 暂停 AI 推进, 轮询等玩家解决. 玩家 resolvePendingChoice 后
        // 下一轮 poll 发现无 pendingChoice 即继续.
        if (Engine.getPendingChoice(game)) {
          render();
          window.setTimeout(enemyStep, enemyPhaseDelay);
          return;
        }
        var playerHpBefore = game.player.hp;
        var enemyHpBefore = game.enemy.hp;

        if (game.phase === 'play') {
          var action = Engine.aiTakeAction(game, 'enemy');
          if (game.player.hp < playerHpBefore) flashHero('player');
          if (game.enemy.hp < enemyHpBefore) flashHero('enemy');
          render();
          if (action.ok && action.action !== 'none' && game.turn === 'enemy' && game.phase === 'play') {
            // v9 PR-E22: 出牌阶段实质动作 — 慢节奏让玩家看清
            window.setTimeout(enemyStep, enemyActionDelay);
            return;
          }
          Engine.finishPlayPhase(game);
          render();
          window.setTimeout(enemyStep, enemyPhaseDelay);
          return;
        }

        if (game.phase === 'discard') {
          if (Engine.needsDiscard(game, 'enemy')) {
            var need = Engine.getDiscardCount(game, 'enemy');
            Engine.discardSelected(game, 'enemy', game.enemy.hand.slice(0, need).map(function (card) { return card.id; }));
          }
          Engine.advancePhase(game);
          render();
          window.setTimeout(enemyStep, enemyPhaseDelay);
          return;
        }

        if (game.phase === 'finish') {
          Engine.endTurn(game);
          enemyThinking = false;
          render();
          return;
        }

        Engine.advancePhase(game);
        render();
        window.setTimeout(enemyStep, enemyPhaseDelay);
      }

      function maybeStartEnemyTurn() {
        if (game && game.turn === 'enemy' && game.phase !== 'gameover' && !enemyThinking) {
          enemyThinking = true;
          render();
          window.setTimeout(enemyStep, enemyPhaseDelay);
        }
      }

      function populateHeroSelects() {
        if (!els.playerHeroSelect || !els.enemyHeroSelect) return;
        var currentPlayer = els.playerHeroSelect.value || 'liubei';
        var currentEnemy = els.enemyHeroSelect.value || 'caocao';
        lobbyPanels.fillHeroSelect(els.playerHeroSelect, currentPlayer, 'liubei');
        lobbyPanels.fillHeroSelect(els.enemyHeroSelect, currentEnemy, 'caocao');
        ensureDistinctHeroes('player');
        renderHeroPickGrid();
      }

      // v9 PR-E11: 顺序选将 — 主公 先选, 反贼 后选, 不可返回. 状态:
      //   pickStep: 0 = 第一位 picking, 1 = 第二位 picking, 2 = done (触发
      //     auto-start)
      //   pickOrder: ['player'|'enemy', ...] 按 主公→反贼 顺序排
      //   currentPickSide: 当前 pick 的那一边 (= pickOrder[pickStep])
      // assignRandomRoles / showSetup 入口都会重置此状态.
      var currentPickSide = 'player';
      var pickStep = 0;
      var pickOrder = ['player', 'enemy'];

      function resetPickSequence() {
        pickStep = 0;
        pickOrder = playerRole === '主公' ? ['player', 'enemy'] : ['enemy', 'player'];
        currentPickSide = pickOrder[0];
        if (els.playerHeroSelect) els.playerHeroSelect.value = '';
        if (els.enemyHeroSelect) els.enemyHeroSelect.value = '';
      }

      function renderHeroPickGrid() {
        lobbyPanels.renderHeroPickGrid({
          currentPickSide: currentPickSide,
          playerVal: els.playerHeroSelect ? els.playerHeroSelect.value : '',
          enemyVal: els.enemyHeroSelect ? els.enemyHeroSelect.value : '',
          playerRole: playerRole,
          enemyRole: enemyRole
        });
      }

      function handleHeroPickCardClick(heroId) {
        if (!heroId) return;
        var targetSelect = currentPickSide === 'player' ? els.playerHeroSelect : els.enemyHeroSelect;
        if (!targetSelect) return;
        // v9 PR-E11: 不能选对方已锁定的 hero
        var otherSelect = currentPickSide === 'player' ? els.enemyHeroSelect : els.playerHeroSelect;
        if (otherSelect && otherSelect.value === heroId) return;
        targetSelect.value = heroId;
        ensureDistinctHeroes(currentPickSide);
        pickStep += 1;
        if (pickStep >= pickOrder.length) {
          // 双方都选完 → 自动进入游戏 (用 setTimeout 让 UI 先 paint 高亮态再切屏)
          renderHeroPickGrid();
          window.setTimeout(function () { newGame(); }, 120);
          return;
        }
        currentPickSide = pickOrder[pickStep];
        renderHeroPickGrid();
      }

      function optionValues(select) {
        return Array.from(select.options).map(function (option) { return option.value; });
      }

      function ensureDistinctHeroes(changedSide) {
        var playerValue = els.playerHeroSelect.value;
        var enemyValue = els.enemyHeroSelect.value;
        if (playerValue === enemyValue) {
          var targetSelect = changedSide === 'enemy' ? els.playerHeroSelect : els.enemyHeroSelect;
          var forbidden = changedSide === 'enemy' ? enemyValue : playerValue;
          var replacement = Array.from(targetSelect.options).find(function (option) { return option.value !== forbidden; });
          if (replacement) targetSelect.value = replacement.value;
        }
        playerValue = els.playerHeroSelect.value;
        enemyValue = els.enemyHeroSelect.value;
        Array.from(els.playerHeroSelect.options).forEach(function (option) {
          var otherValue = enemyValue;
          option.disabled = option.value === otherValue;
        });
        Array.from(els.enemyHeroSelect.options).forEach(function (option) {
          var otherValue = playerValue;
          option.disabled = option.value === otherValue;
        });
      }

      function randomizeHero(side) {
        // v9 PR-E11: 顺序选将 — 只允许随机当前 side, 走 handleHeroPickCardClick
        // 统一流程 (含 pickStep 推进 + 完成 auto-start).
        if (side !== currentPickSide) return;
        var select = side === 'player' ? els.playerHeroSelect : els.enemyHeroSelect;
        var otherSelect = side === 'player' ? els.enemyHeroSelect : els.playerHeroSelect;
        var other = otherSelect ? otherSelect.value : '';
        var pool = optionValues(select).filter(function (value) { return value && value !== other; });
        if (!pool.length) return;
        var picked = pool[Math.floor(Math.random() * pool.length)];
        handleHeroPickCardClick(picked);
      }

      function updateDraftUI() {
        if (els.playerRoleBadge) els.playerRoleBadge.textContent = '我方：' + playerRole;
        if (els.enemyRoleBadge) els.enemyRoleBadge.textContent = '敌方：' + enemyRole;
      }

      function assignRandomRoles() {
        var playerIsLord = Math.random() >= 0.5;
        playerRole = playerIsLord ? '主公' : '反贼';
        enemyRole = playerIsLord ? '反贼' : '主公';
        updateDraftUI();
        // v9 PR-E11: 重抽身份 → 重置选将状态 (pickStep + selects 清空)
        resetPickSequence();
        renderHeroPickGrid();
      }

      function showSetup() {
        enemyThinking = false;
        hideTiesuoPanel();
        hideTargetZonePanel();
        hideHuogongPanel();
        hideConversionPanel();
        hideGuanxingPanel();
        exitSkillSelectMode();
        if (els.lobbyScreen) els.lobbyScreen.hidden = true;
        if (els.setupScreen) els.setupScreen.hidden = false;
        if (els.duelTable) els.duelTable.hidden = true;
        _toggleCornerButtons(false);   // v9 PR-E19: setup 入口屏不显示菜单/分享
        populateHeroSelects();
        // v9 PR-E11: 入 setup 自动随机身份 (assignRandomRoles 内部已重置
        // 选将状态 + renderHeroPickGrid). 用户可点 "随机主公/反贼" 重抽.
        assignRandomRoles();
      }

      // v9 PR-E19: 角落 widget (菜单 / 分享) 仅游戏内显示 —
      // 菜单含退出/重开, 在 lobby/setup 入口屏无意义.
      function _toggleCornerButtons(show) {
        if (els.frameMenuBtn) els.frameMenuBtn.hidden = !show;
        if (els.frameShareBtn) els.frameShareBtn.hidden = !show;
      }
      function showLobby() {
        if (els.lobbyScreen) els.lobbyScreen.hidden = false;
        if (els.setupScreen) els.setupScreen.hidden = true;
        if (els.duelTable) els.duelTable.hidden = true;
        _toggleCornerButtons(false);
      }

      function newGame() {
        enemyThinking = false;
        selectedDiscardIds = [];
        hideTiesuoPanel();
        hideTargetZonePanel();
        hideHuogongPanel();
        hideConversionPanel();
        hideGuanxingPanel();
        exitSkillSelectMode();
        ensureDistinctHeroes('player');
        var playerHero = els.playerHeroSelect ? els.playerHeroSelect.value : 'liubei';
        var enemyHero = els.enemyHeroSelect ? els.enemyHeroSelect.value : 'caocao';
        game = Engine.newGame({ seed: Date.now(), playerHero: playerHero, enemyHero: enemyHero, playerRole: playerRole, enemyRole: enemyRole, startWithFirstTurn: true });
        // v9 PR-E25: 开启玩家手动【闪】响应 — 被【杀】/万箭/银月时由玩家决定出不出闪
        // v10 V5: 同时开启玩家手动【无懈可击】响应 — 锦囊 targeting 玩家时弹.
        // (引擎默认无 pref → 自动响应; UI 对局显式开启 ask 模式.)
        game.player.skillPreferences = game.player.skillPreferences || {};
        game.player.skillPreferences.shanResponse = 'ask';
        game.player.skillPreferences.wuxieResponse = 'ask';
        // v10 V6: 决斗 玩家手动出杀响应.
        game.player.skillPreferences.shaDuelResponse = 'ask';
        // 审计二轮 PR-8: 贯石斧自选两张成本 + 火攻展示牌自选 (引擎默认 auto
        // 保持测试/AI 行为不变, UI 对局显式开启 ask).
        game.player.skillPreferences.guanshi = 'ask';
        game.player.skillPreferences.huogongShow = 'ask';
        if (els.setupScreen) els.setupScreen.hidden = true;
        if (els.duelTable) els.duelTable.hidden = false;
        _toggleCornerButtons(true);   // v9 PR-E19: 游戏内才显示菜单/分享角落按钮
        render();
        maybeStartEnemyTurn();
      }

      // v9 PR-E16: pending modal 与 hand-confirm/cancel 的统一 dispatch 注册表.
      // 各 modal 显示时, hand-confirm 触发 .confirm 对应 button.click(),
      // hand-cancel 同理. 没注册的 modal 仍保留自己内部按钮 (兼容).
      // v10 V8: 6 个旧缺口面板 (fanjian/fankui/wugu/guohe/cixiongChoose 必选; dyingRescue 有 decline)
      // 全部入册. 必选面板无 cancel 语义, 此处仍登记为 confirmBtnId=null/cancelBtnId=null
      // 仅用于 _firstVisibleDispatch 命中 — handConfirm/Cancel 不再 fall-through 到手牌.
      var PENDING_MODAL_DISPATCH = [
        { panelId: 'shanResponsePanel',     confirmBtnId: null,                     cancelBtnId: 'shanResponseDeclineBtn' },
        { panelId: 'wuxieResponsePanel',    confirmBtnId: null,                     cancelBtnId: 'wuxieResponseDeclineBtn' },
        { panelId: 'duelResponsePanel',     confirmBtnId: null,                     cancelBtnId: 'duelResponseDeclineBtn' },
        { panelId: 'luoshenPromptPanel',    confirmBtnId: 'luoshenContinueBtn',     cancelBtnId: 'luoshenStopBtn' },
        // v11 C7 (批次 31): 耀武 — 必选二选一 (无 cancel 语义)
        { panelId: 'yaowuRewardPanel',      confirmBtnId: null,                     cancelBtnId: null },
        { panelId: 'guanxingModePanel',     confirmBtnId: 'guanxingConfirmBtn',     cancelBtnId: 'guanxingDeclineBtn' },
        { panelId: 'zhihengModePanel',      confirmBtnId: 'zhihengConfirmBtn',      cancelBtnId: 'zhihengCancelBtn' },
        { panelId: 'gangliePromptPanel',    confirmBtnId: 'ganglieFireBtn',         cancelBtnId: 'ganglieDeclineBtn' },
        { panelId: 'ganglieSourcePanel',    confirmBtnId: 'ganglieSourceConfirmBtn', cancelBtnId: 'ganglieSourceTakeDamageBtn' },
        { panelId: 'cixiongFirePanel',      confirmBtnId: 'cixiongFireBtn',         cancelBtnId: 'cixiongFireDeclineBtn' },
        { panelId: 'jiedaoDecisionPanel',   confirmBtnId: 'jiedaoDecisionFireBtn',  cancelBtnId: 'jiedaoDecisionDeclineBtn' },
        { panelId: 'yijiPromptPanel',       confirmBtnId: 'yijiConfirmBtn',         cancelBtnId: 'yijiKeepAllBtn' },
        { panelId: 'qilinPickPanel',        confirmBtnId: null,                     cancelBtnId: 'qilinDeclineBtn' },
        // v12 G2: guicaiPromptPanel 同时承载 'guicai-replace' 与 'guidao-replace'
        // 两个 kind (鬼道复用鬼才面板 DOM, 见 prompt-panels.js) — 一条 dispatch
        // 记录按 panelId 命中, 对两个 kind 同样生效, 无需重复注册。
        { panelId: 'guicaiPromptPanel',     confirmBtnId: null,                     cancelBtnId: 'guicaiDeclineBtn' },
        // v12 G2: 神速 — 四动作全部由面板自身按钮处理 (不发动/仅一 直接
        // resolve; 仅二/一+二 先进子步骤选装备, 专属确认按钮提交), 共享
        // Cancel 沿用"不发动"作为安全退出 (随时合法, 引擎当空选处理)。
        { panelId: 'shensuOptionsPanel',    confirmBtnId: null,                     cancelBtnId: 'shensuDeclineBtn' },
        { panelId: 'huogongModePanel',      confirmBtnId: null,                     cancelBtnId: 'huogongCancelBtn' },
        { panelId: 'tiesuoModePanel',       confirmBtnId: null,                     cancelBtnId: 'tiesuoCancelBtn' },
        { panelId: 'conversionModePanel',   confirmBtnId: null,                     cancelBtnId: 'conversionCancelBtn' },
        { panelId: 'targetZonePanel',       confirmBtnId: null,                     cancelBtnId: 'targetCancelBtn' },
        { panelId: 'exitConfirmModal',      confirmBtnId: 'exitConfirmYesBtn',      cancelBtnId: 'exitConfirmNoBtn' },
        // v10 V8 补齐: 以下 6 面板 visible 时, _firstVisibleDispatch 会命中此条,
        // _handConfirm/Cancel 不再 fall-through 误触手牌; 必选面板 (无 cancel 语义) 用 null.
        { panelId: 'dyingRescuePanel',      confirmBtnId: null,                     cancelBtnId: 'dyingRescueDeclineBtn' },
        { panelId: 'fanjianPromptPanel',    confirmBtnId: null,                     cancelBtnId: null },
        { panelId: 'fankuiPromptPanel',     confirmBtnId: null,                     cancelBtnId: null },
        { panelId: 'wuguPickPanel',         confirmBtnId: null,                     cancelBtnId: null },
        { panelId: 'guohePickPanel',        confirmBtnId: null,                     cancelBtnId: null },
        { panelId: 'cixiongChoosePanel',    confirmBtnId: null,                     cancelBtnId: 'cixiongChooseDrawBtn' },
        // 审计二轮 PR-8: 贯石斧 (可弃可不发动) + 火攻展示 (必选, stage 提交)
        { panelId: 'guanshiDiscardPanel',   confirmBtnId: 'guanshiConfirmBtn',      cancelBtnId: 'guanshiDeclineBtn' },
        { panelId: 'huogongShowPanel',      confirmBtnId: null,                     cancelBtnId: null }
      ];

      function _firstVisibleDispatch() {
        for (var i = 0; i < PENDING_MODAL_DISPATCH.length; i += 1) {
          var entry = PENDING_MODAL_DISPATCH[i];
          var panel = els[entry.panelId];
          if (panel && !panel.hidden) return entry;
        }
        return null;
      }

      function _clickIfEnabled(btnId) {
        if (!btnId) return false;
        var btn = els[btnId];
        if (!btn || btn.hidden || btn.disabled) return false;
        btn.click();
        return true;
      }

      // v9 PR-E23/E24: 候选 stage 高亮 — 全局清掉旧 .is-staged, 给当前加.
      // 单参数: 同一时刻只有一个 staged 候选, 全局清理即可 (跨多个面板/容器).
      function _highlightStaged(chosenEl) {
        var prev = document.querySelectorAll('.is-staged');
        for (var i = 0; i < prev.length; i += 1) prev[i].classList.remove('is-staged');
        if (chosenEl) chosenEl.classList.add('is-staged');
      }

      // v9 PR-E24: 是否有任意 modal / 面板可见 (含 PENDING_MODAL_DISPATCH 未注册的).
      // 用于 playerHand 误点防护 — 任何面板开着时忽略手牌点击.
      // v10 V7: 4 个旧 mode-panel 升级走 pending-prompt-panel 后, 选择器简化.
      function _anyModalVisible() {
        return !!document.querySelector(
          '.pending-prompt-panel:not([hidden]), .scroll-modal:not([hidden])');
      }

      // 何时点 hand-card 触发"选中-后-确认"模式 (而非直接 usePlayerCard).
      function _shouldSelectFirst() {
        if (!game || game.turn !== 'player' || enemyThinking) return false;
        if (game.phase !== 'play') return false;
        if (Engine.needsDiscard(game, 'player')) return false;
        if (activeCardSkillConfig()) return false;
        if (Engine.getPendingChoice(game)) return false;
        if (_firstVisibleDispatch()) return false;
        return true;
      }

      function _handConfirm() {
        // v9 PR-E23/E24: 已 stage 面板候选 → 此时提交.
        if (stagedModalChoice) {
          var staged = stagedModalChoice;
          stagedModalChoice = null;
          if (staged.kind === 'target') {
            resolveTargetCard(staged.zone, staged.cardId);
          } else if (staged.kind === 'huogong') {
            resolveHuogong(staged.costId, false);
          } else if (staged.kind === 'conversion') {
            // v10 V8: card-as 一致性 — 转化面板 stage 提交.
            resolveConversion(staged.asSha);
          } else if (staged.kind === 'pending') {
            // v9 PR-E24: 响应/技能面板候选 — 统一走 Engine.resolvePendingChoice.
            var pr = Engine.resolvePendingChoice(game, staged.payload);
            if (!pr.ok) renderLog();
            render();
          }
          return;
        }
        // 1. 任何 visible pending modal → 触发对应 confirm
        var dispatch = _firstVisibleDispatch();
        if (dispatch) {
          // v10 V8: dispatch 命中 (即使 confirmBtnId 为 null) → 必须 return,
          // 不能 fall-through 到弃牌/手牌 (modal 还开着, 误触会跨上下文).
          _clickIfEnabled(dispatch.confirmBtnId);
          return;
        }
        // 2. 弃牌阶段 → 提交弃牌
        if (game && game.turn === 'player' && game.phase === 'discard' &&
            Engine.needsDiscard(game, 'player')) {
          if (els.confirmDiscardBtn && !els.confirmDiscardBtn.hidden &&
              !els.confirmDiscardBtn.disabled) {
            els.confirmDiscardBtn.click();
            return;
          }
        }
        // 3. selected hand card → playCard
        if (selectedHandCardId) {
          var cardId = selectedHandCardId;
          selectedHandCardId = null;
          usePlayerCard(cardId);
        }
      }

      function _handCancel() {
        // v9 PR-E23/E24: 已 stage 面板候选 → 先撤销 stage (面板保持打开).
        if (stagedModalChoice) {
          stagedModalChoice = null;
          _highlightStaged(null);
          render();
          return;
        }
        // 1. 任何 visible pending modal → 触发对应 cancel
        var dispatch = _firstVisibleDispatch();
        if (dispatch) {
          // v10 V8: dispatch 命中 → 必须 return, 不能 fall-through 到手牌清.
          _clickIfEnabled(dispatch.cancelBtnId);
          return;
        }
        // 2. 清 hand-card 选中
        if (selectedHandCardId) {
          selectedHandCardId = null;
          render();
          return;
        }
        // 3. 弃牌阶段 清弃牌选中
        if (game && game.phase === 'discard' && selectedDiscardIds.length > 0) {
          selectedDiscardIds = [];
          render();
        }
      }

      function bindEvents() {
        if (els.startGameBtn) els.startGameBtn.addEventListener('click', newGame);
        if (els.randomPlayerHeroBtn) els.randomPlayerHeroBtn.addEventListener('click', function () { randomizeHero('player'); });
        if (els.randomEnemyHeroBtn) els.randomEnemyHeroBtn.addEventListener('click', function () { randomizeHero('enemy'); });
        if (els.randomRolesBtn) els.randomRolesBtn.addEventListener('click', assignRandomRoles);
        if (els.playerHeroSelect) els.playerHeroSelect.addEventListener('change', function () { ensureDistinctHeroes('player'); });
        if (els.enemyHeroSelect) els.enemyHeroSelect.addEventListener('change', function () { ensureDistinctHeroes('enemy'); });
        // v9 PR-E16: handDiscardBtn — 结束回合 → 弃牌 → 起牌 (对方回合)
        if (els.handDiscardBtn) els.handDiscardBtn.addEventListener('click', function () {
          if (!game || game.turn !== 'player' || game.phase === 'gameover') return;
          selectedHandCardId = null;
          selectedDiscardIds = [];
          hideTiesuoPanel();
          hideTargetZonePanel();
          hideHuogongPanel();
          hideConversionPanel();
          hideGuanxingPanel();
          exitSkillSelectMode();
          if (game.phase === 'play') Engine.finishPlayPhase(game);
          if (game.phase === 'discard' && Engine.needsDiscard(game, 'player')) {
            render();
            return;
          }
          if (game.phase === 'discard') Engine.advancePhase(game);
          if (game.phase === 'finish') Engine.endTurn(game);
          render();
          maybeStartEnemyTurn();
        });
        // v9 PR-E16: hand-confirm / hand-cancel — 选-后-确认 模式 +
        // pending modal 的统一确认/取消 dispatch.
        if (els.handConfirmBtn) els.handConfirmBtn.addEventListener('click', _handConfirm);
        if (els.handCancelBtn) els.handCancelBtn.addEventListener('click', _handCancel);
        els.playerHand.addEventListener('click', function (event) {
          var card = event.target.closest('[data-card-id]');
          if (!card) return;
          var cardId = card.getAttribute('data-card-id');
          // v9 PR-E23/E24: 有任意 modal 打开时, 点手牌被忽略 (玩家该跟 modal 交互).
          // 修旧 bug: modal 开着误点手牌 → 那张牌直接打出. 用 _anyModalVisible
          // 覆盖全部面板 (含 PENDING_MODAL_DISPATCH 未注册的 fankui/fanjian 等).
          if (_anyModalVisible()) return;
          // v9 PR-E16: play 阶段无 pending / 无 skill-select / 非 discard 时,
          // 点 hand-card 仅 set selectedHandCardId + 高亮. 用户必须按 #handConfirmBtn
          // 才真正 usePlayerCard. 其余模式 (discard / skill / response) 走原 immediate 流程.
          if (_shouldSelectFirst()) {
            selectedHandCardId = (selectedHandCardId === cardId) ? null : cardId;
            render();
            return;
          }
          usePlayerCard(cardId);
        });
        // v6.1: 制衡 may include equipment-area cards; clicking them in
        // zhiheng select mode toggles selection just like a hand card.
        if (els.playerEquipmentArea) els.playerEquipmentArea.addEventListener('click', function (event) {
          if (skillSelectMode !== 'zhiheng') return;
          var btn = event.target.closest('[data-card-id]');
          if (!btn) return;
          toggleSkillCard(btn.getAttribute('data-card-id'));
          render();
        });
        if (els.confirmDiscardBtn) els.confirmDiscardBtn.addEventListener('click', confirmDiscardSelection);
        // v11 B2: 铁索/目标区域/火攻/转化/观星 模式面板事件绑定已迁往
        // ./panels/mode-panels.js。
        modePanels.bind();
        if (els.zhihengConfirmBtn) els.zhihengConfirmBtn.addEventListener('click', confirmCardSkill);
        if (els.zhihengCancelBtn) els.zhihengCancelBtn.addEventListener('click', function () { exitSkillSelectMode(); render(); });
        // v11 B2: 提示类面板事件绑定已迁往 ./panels/prompt-panels.js。
        promptPanels.bind();
        // v11 B2: 闪/无懈/决斗响应面板事件绑定已迁往 ./panels/response-panels.js。
        responsePanels.bind();
        // v9 PR-E9: 选将网格 — card click → 设当前 pick side 的 hero.
        // (tab 在非当前 side 时 hidden, 不可点; 不再绑 click.)
        if (els.heroPickGrid) els.heroPickGrid.addEventListener('click', function (event) {
          var btn = event.target.closest('[data-hero-id]');
          if (!btn) return;
          handleHeroPickCardClick(btn.getAttribute('data-hero-id'));
        });
        // v9 PR-E8: lobby 1V1 → setup; KOF/炼狱 placeholder.
        if (els.lobby1v1Btn) els.lobby1v1Btn.addEventListener('click', showSetup);
        if (els.lobbyKofBtn) els.lobbyKofBtn.addEventListener('click', function () {
          if (window.alert) window.alert('KOF 模式 — 待开发 (v10+ 计划)');
        });
        if (els.lobbyHellBtn) els.lobbyHellBtn.addEventListener('click', function () {
          if (window.alert) window.alert('炼狱 KOF — 待开发 (v10+ 计划)');
        });
        // v9 PR-E5: 角落"菜单"按钮 — 切换侧抽屉显隐。"分享"仍是 placeholder.
        if (els.frameMenuBtn) els.frameMenuBtn.addEventListener('click', toggleSideDrawer);
        if (els.frameShareBtn) els.frameShareBtn.addEventListener('click', function () {
          if (window.console && window.console.info) {
            window.console.info('[v9 PR-E1] 分享 click — placeholder');
          }
        });
        // v9 PR-E5: 侧抽屉项 click handlers
        if (els.drawerExitBtn) els.drawerExitBtn.addEventListener('click', function () {
          closeSideDrawer();
          openExitConfirm();
        });
        // v9 PR-E19: 重开 → 回选将屏 (setup, 重新选将).
        if (els.drawerRestartBtn) els.drawerRestartBtn.addEventListener('click', function () {
          closeSideDrawer();
          showSetup();
        });
        if (els.drawerHelpBtn) els.drawerHelpBtn.addEventListener('click', function () {
          closeSideDrawer();
          if (window.alert) {
            window.alert('三国杀 1v1 · 在线版 (v9 UI 重制中)\\n源码: github.com/fsfrank9/sanguosha');
          }
        });
        if (els.drawerCloseBtn) els.drawerCloseBtn.addEventListener('click', closeSideDrawer);
        // v9 PR-E5: 退出确认 modal handlers
        // v9 PR-E19: 退出 → 回大厅 (lobby, 一级页面), 不再回选将屏.
        if (els.exitConfirmYesBtn) els.exitConfirmYesBtn.addEventListener('click', function () {
          closeExitConfirm();
          showLobby();
        });
        if (els.exitConfirmNoBtn) els.exitConfirmNoBtn.addEventListener('click', closeExitConfirm);
        if (els.exitConfirmBackdrop) els.exitConfirmBackdrop.addEventListener('click', closeExitConfirm);
        // Esc 键 关闭 modal / drawer
        window.addEventListener('keydown', function (e) {
          if (e.key !== 'Escape') return;
          if (els.exitConfirmModal && !els.exitConfirmModal.hidden) {
            closeExitConfirm();
          } else if (els.sideDrawer && !els.sideDrawer.hidden) {
            closeSideDrawer();
          }
        });
        // v11 B2: 濒死救援/遗计面板事件绑定已迁往 ./panels/prompt-panels.js。
        if (els.playerSkillBar) els.playerSkillBar.addEventListener('click', function (event) {
          var skill = event.target.closest('[data-skill-id]');
          if (!skill || skill.disabled) return;
          var toggle = skill.getAttribute('data-skill-toggle');
          if (toggle) {
            var current = Engine.getSkillPreference(game, 'player', toggle);
            // Each skill has its own opt-in/opt-out value vs the default.
            // null = default; flipping cycles to the skill-specific value.
            var flipValue = toggle === 'yiji' ? 'ask' : 'decline';
            Engine.setSkillPreference(game, 'player', toggle, current === flipValue ? null : flipValue);
            render();
            return;
          }
          usePlayerSkill(skill.getAttribute('data-skill-id'));
        });
      }

      initElements();
      populateHeroSelects();
      bindEvents();
      showLobby();

      // 审计二轮 PR-9: UI 行为测试钩子 — fake-DOM 测试需要访问模块私有的
      // game 引用与手动触发 render (浏览器对局不依赖此对象)。
      if (typeof window !== 'undefined') {
        window.SanguoshaUI = {
          getGame: function () { return game; },
          render: function () { render(); }
        };
      }
