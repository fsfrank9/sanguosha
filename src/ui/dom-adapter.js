      import { SanguoshaEngine } from '../engine/game-engine.js';

      var Engine = SanguoshaEngine;
      var game = null;
      var enemyThinking = false;
      var selectedDiscardIds = [];
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
      // v6.1 ganglie source-choice picker: 2-card multi-select.
      var ganglieSelectedIds = [];
      var skillSelectMode = null;
      var selectedSkillCardIds = [];
      var enemyActionDelay = 650;
      var playerRole = '主公';
      var enemyRole = '反贼';
      var draftPicker = 'player';
      var els = {};

      function $(id) {
        return document.getElementById(id);
      }

      function initElements() {
        [
          'newGameBtn', 'endTurnBtn', 'startGameBtn', 'randomPlayerHeroBtn', 'randomEnemyHeroBtn',
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
          'conversionHint', 'conversionNormalBtn', 'conversionShaBtn', 'conversionCancelBtn', 'guanxingModePanel',
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
          'dyingRescuePanel', 'dyingRescueHint', 'dyingRescueChoices', 'dyingRescueDeclineBtn',
          'cixiongFirePanel', 'cixiongFireHint', 'cixiongFireBtn', 'cixiongFireDeclineBtn',
          'cixiongChoosePanel', 'cixiongChooseHint', 'cixiongChooseChoices', 'cixiongChooseDrawBtn',
          'jiedaoDecisionPanel', 'jiedaoDecisionHint', 'jiedaoDecisionFireBtn', 'jiedaoDecisionDeclineBtn',
          'guohePickPanel', 'guohePickHint', 'guohePickEquipment', 'guohePickHand',
          'wuguPickPanel', 'wuguPickHint', 'wuguPickChoices',
          // v8 hotfix-2: 洛神 (luoshen-continue) 面板 — 准备阶段连续判定决定
          'luoshenPromptPanel', 'luoshenPromptHint', 'luoshenContinueBtn', 'luoshenStopBtn',
          // v9 PR-E1: 装饰外框角落 widgets — 菜单 / 分享. placeholder 行为, 等
          // PR-E5 接入侧抽屉.
          'frameMenuBtn', 'frameShareBtn',
          // v9 PR-E2: 中央日志 overlay + 暂停 brush 横幅 + 底部状态条
          'logOverlay', 'pauseBanner', 'statusBar', 'statusBarVersion', 'statusBarScore', 'statusBarTime',
          // v9 PR-E4: 主公徽章 — 右上角红圆 "主". 由 renderHero 据
          // game.roles[actor] 切换 hidden.
          'playerLordBadge', 'enemyLordBadge',
          // v9 PR-E5: 侧抽屉菜单 + 退出确认 modal
          'sideDrawer', 'drawerExitBtn', 'drawerRestartBtn', 'drawerHelpBtn', 'drawerCloseBtn',
          'exitConfirmModal', 'exitConfirmBackdrop', 'exitConfirmYesBtn', 'exitConfirmNoBtn',
          // v9 PR-E8: 二级 splash + 一级 lobby
          'splashScreen', 'splashEnterBtn',
          'lobbyScreen', 'lobbyKofBtn', 'lobby1v1Btn', 'lobbyHellBtn',
          'randomRolesBtn', 'playerRoleBadge', 'enemyRoleBadge', 'firstPickBadge', 'confirmHeroPickBtn'
        ].forEach(function (id) { els[id] = $(id); });
        els.log = els.battleLog;
      }

      function hpMarkup(state) {
        var html = '';
        for (var i = 0; i < state.maxHp; i += 1) {
          html += '<span class="heart' + (i >= state.hp ? ' empty' : '') + '">♥</span>';
        }
        html += '<span class="badge">' + state.hp + ' / ' + state.maxHp + '</span>';
        return html;
      }

      function miniBacks(count) {
        if (!count) return '<span class="mini-card">无手牌</span>';
        var html = '';
        for (var i = 0; i < count; i += 1) html += '<span class="mini-card">牌</span>';
        return html;
      }

      function escapeHtml(text) {
        return String(text)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      var SKILL_TRIGGER_LABELS = {
        playPhase: '出牌阶段',
        drawPhase: '摸牌阶段',
        preparePhase: '准备阶段',
        discardPhase: '弃牌阶段',
        turnEnd: '结束阶段',
        damageAfter: '受伤后',
        beforeJudgement: '判定前',
        afterJudgement: '判定后',
        cardUse: '使用牌',
        cardConvert: '转化',
        targetValidation: '目标合法性',
        passive: '被动'
      };
      var SKILL_FREQUENCY_LABELS = {
        oncePerTurn: '每回合一次',
        unlimited: '无限制',
        passiveAlways: '锁定'
      };

      function formatSkillCost(cost) {
        if (!cost || cost.type === 'none') return '';
        var n = cost.count === 'any' ? '若干' : cost.count;
        switch (cost.type) {
          case 'discardOwn': return '弃' + n + '张牌';
          case 'giveHand':   return '交' + n + '张手牌';
          case 'playHand':   return '打出' + n + '张手牌';
          case 'loseHp':     return '失去 ' + cost.count + ' 体力';
          case 'reduceDraw': return '少摸' + n + '张';
          case 'judgement':  return '判定';
          default:           return '';
        }
      }

      function formatSkillTooltip(skill, statusText) {
        var parts = [];
        if (skill.desc) parts.push(skill.desc);
        var tags = [];
        var triggerLabel = SKILL_TRIGGER_LABELS[skill.trigger];
        var freqLabel = SKILL_FREQUENCY_LABELS[skill.frequency];
        var costLabel = formatSkillCost(skill.cost);
        if (skill.mandatory) tags.push('锁定技');
        if (triggerLabel) tags.push('时机：' + triggerLabel);
        if (freqLabel) tags.push('频率：' + freqLabel);
        if (costLabel) tags.push('消耗：' + costLabel);
        if (tags.length) parts.push(tags.join('　'));
        if (statusText) parts.push(statusText);
        return parts.join('｜');
      }

      function renderHero(actor) {
        var state = game[actor];
        els[actor + 'Name'].textContent = state.name;
        els[actor + 'Camp'].textContent = state.camp + ' · ' + state.title;
        els[actor + 'Quote'].textContent = state.quote;
        els[actor + 'Hp'].innerHTML = hpMarkup(state);
        els[actor + 'HandCount'].textContent = state.hand.length;
        els[actor + 'Hero'].setAttribute('data-camp', state.camp);
        els[actor + 'Hero'].classList.toggle('is-chained', !!state.chained);
        // v9 PR-E4: 主公徽章 — 由 game.roles[actor] === '主公' 决定显隐.
        var lordBadge = els[actor + 'LordBadge'];
        if (lordBadge) {
          var isLord = !!(game && game.roles && game.roles[actor] === '主公');
          lordBadge.hidden = !isLord;
        }
        if (els[actor + 'Ribbon']) els[actor + 'Ribbon'].textContent = state.camp;
        if (actor === 'player' && els.playerSkillBar) {
          els.playerSkillBar.innerHTML = (state.skills || []).map(function (skill) {
            var isActiveSkill = Engine.ACTIVE_SKILL_IDS.indexOf(skill.id) >= 0;
            var active = game.turn === 'player' && game.phase === 'play' && !enemyThinking && !game.winner && isActiveSkill && skill.status === 'implemented';
            if (skill.id === 'zhiheng' && state.flags && state.flags.zhihengUsed) active = false;
            if (skill.id === 'fanjian' && state.flags && state.flags.fanjianUsed) active = false;
            if (skill.id === 'guanxing' && state.flags && state.flags.guanxingUsed) active = false;
            if ((skill.id === 'rende' || skill.id === 'fanjian') && !state.hand.length) active = false;
            // v6.1: spec allows 苦肉 at hp=1 (hp→0 ends the game in 1v1 but
            // is a valid choice). Only block when truly dead.
            if (skill.id === 'kurou' && state.hp <= 0) active = false;
            var statusClass = skill.status ? ' skill-status-' + skill.status : '';
            var statusText = skill.statusText || (skill.status === 'todo' ? '未实现' : '');
            var label = skill.name + (skill.status === 'todo' ? '·未实现' : '');
            var title = formatSkillTooltip(skill, statusText);
            var dataAttrs = '';
            // v6B/6C-bis: officially-optional or auto-firing skills get a
            // toggle on the skill bar so the player can flip auto-fire vs
            // opt-out / opt-in. Click handler is special-cased downstream
            // so the button can be enabled outside of play.
            //   luoyi (default auto) ↔ 'decline'  — opt out of the trade
            //   tieqi (default auto) ↔ 'decline'  — opt out of the judge
            //   yiji  (default auto) ↔ 'ask'      — opt in to distribute
            if (skill.id === 'luoyi' && skill.status === 'implemented') {
              var luoyiPref = state.skillPreferences && state.skillPreferences.luoyi;
              var luoyiDeclined = luoyiPref === 'decline';
              active = !enemyThinking && !game.winner && game.turn === 'player';
              label = skill.name + '·' + (luoyiDeclined ? '本回合跳过' : '自动发动');
              title = formatSkillTooltip(skill, statusText) + '｜点击切换本回合是否发动';
              dataAttrs = ' data-skill-toggle="luoyi"';
              if (luoyiDeclined) statusClass += ' skill-toggle-off';
            } else if (skill.id === 'tieqi' && skill.status === 'implemented') {
              var tieqiPref = state.skillPreferences && state.skillPreferences.tieqi;
              var tieqiDeclined = tieqiPref === 'decline';
              active = !enemyThinking && !game.winner && game.turn === 'player';
              label = skill.name + '·' + (tieqiDeclined ? '不发动' : '自动发动');
              title = formatSkillTooltip(skill, statusText) + '｜点击切换本【杀】是否触发铁骑判定';
              dataAttrs = ' data-skill-toggle="tieqi"';
              if (tieqiDeclined) statusClass += ' skill-toggle-off';
            } else if (skill.id === 'yiji' && skill.status === 'implemented') {
              var yijiPref = state.skillPreferences && state.skillPreferences.yiji;
              var yijiAsk = yijiPref === 'ask';
              active = !enemyThinking && !game.winner && game.turn === 'player';
              label = skill.name + '·' + (yijiAsk ? '手动分配' : '全部留己');
              title = formatSkillTooltip(skill, statusText) + '｜点击切换：摸完后是否弹出分配面板';
              dataAttrs = ' data-skill-toggle="yiji"';
              if (yijiAsk) statusClass += ' skill-toggle-on';
            } else if (skill.id === 'tuxi' && skill.status === 'implemented') {
              var tuxiPref = state.skillPreferences && state.skillPreferences.tuxi;
              var tuxiDeclined = tuxiPref === 'decline';
              active = !enemyThinking && !game.winner && game.turn === 'player';
              label = skill.name + '·' + (tuxiDeclined ? '不发动' : '自动发动');
              title = formatSkillTooltip(skill, statusText) + '｜点击切换本回合摸牌阶段是否发动';
              dataAttrs = ' data-skill-toggle="tuxi"';
              if (tuxiDeclined) statusClass += ' skill-toggle-off';
            }
            return '<button class="mini-card skill-button' + statusClass + '" data-skill-id="' + escapeHtml(skill.id) + '"' + dataAttrs + ' ' + (active ? '' : 'disabled') + ' title="' + escapeHtml(title) + '">' + escapeHtml(label) + '</button>';
          }).join('') || '<span class="mini-card">无技能</span>';
        }
      }

      function playerCardAction(card) {
        var normal = Engine.canPlayCard(game, 'player', card);
        var asSha = Engine.canPlayCardAs(game, 'player', card, 'sha');
        if (normal.ok && asSha.ok) return { mode: 'choice', playable: { ok: true, message: '可按原牌使用，也可当【杀】使用。' }, normal: normal, asSha: asSha };
        if (normal.ok) return { mode: 'normal', playable: normal };
        if (asSha.ok) return { mode: 'asSha', playable: asSha };
        return { mode: 'blocked', playable: normal };
      }

      function activeCardSkillConfig() {
        return cardSkillConfig(skillSelectMode);
      }

      function cardButton(card) {
        var disabled = game.turn !== 'player' || game.phase === 'gameover' || enemyThinking;
        var discardMode = game.turn === 'player' && game.phase === 'discard' && Engine.needsDiscard(game, 'player') && !enemyThinking;
        var cardSkill = game.turn === 'player' && game.phase === 'play' && !enemyThinking ? activeCardSkillConfig() : null;
        var selected = selectedDiscardIds.indexOf(card.id) >= 0 || selectedSkillCardIds.indexOf(card.id) >= 0;
        var action = playerCardAction(card);
        var playable = discardMode || cardSkill ? { ok: true, message: cardSkill ? cardSkill.cardHint : '选择这张牌作为弃牌' } : action.playable;
        if (!discardMode && !cardSkill && !playable.ok) disabled = true;
        return [
          '<button class="card ', card.group, selected ? ' discard-selected' : '', '" data-card-id="', escapeHtml(card.id), '" ', disabled ? 'disabled' : '', ' title="', escapeHtml(playable.message), '">',
          // v8 PR-0: 牌面右上角 花色 + 点数
          suitRankBadge(card),
          '<div class="card-name">【', escapeHtml(card.name), '】</div>',
          '<div class="card-type">', escapeHtml(card.label), '</div>',
          '<div class="card-desc">', escapeHtml(card.desc), '</div>',
          '<div class="card-symbol">', escapeHtml(card.symbol), '</div>',
          '</button>'
        ].join('');
      }

      function renderHand() {
        if (!game.player.hand.length) {
          els.playerHand.innerHTML = '<div class="empty-hand">你没有手牌了。结束回合等待摸牌吧。</div>';
          return;
        }
        els.playerHand.innerHTML = game.player.hand.map(cardButton).join('');
      }

      function renderPhaseTrack() {
        if (!els.phaseTrack) return;
        Array.from(els.phaseTrack.querySelectorAll('[data-phase]')).forEach(function (step) {
          step.classList.toggle('active', step.getAttribute('data-phase') === game.phase);
        });
      }

      function scrollLogToBottom() {
        if (!els.log) return;
        var doScroll = function () {
          els.log.scrollTop = els.log.scrollHeight;
          if (els.log.lastElementChild) {
            els.log.lastElementChild.scrollIntoView({ block: 'end', inline: 'nearest' });
          }
        };
        if (window.requestAnimationFrame) window.requestAnimationFrame(doScroll);
        else doScroll();
      }

      function renderLog() {
        els.log.innerHTML = game.log.slice(-36).map(function (entry) {
          return '<div class="log-entry">' + escapeHtml(entry) + '</div>';
        }).join('');
        scrollLogToBottom();
        renderLogOverlay();
      }

      // v9 PR-E2: 中央日志 overlay — 渲染最近 6 条到大字 overlay.
      // 包含"阶段"或"回合"关键词的条目用 phase 高亮色 (浅金).
      function renderLogOverlay() {
        if (!els.logOverlay || !game) return;
        var recent = game.log.slice(-6);
        els.logOverlay.innerHTML = recent.map(function (entry) {
          var isPhase = /阶段|回合开始|回合结束/.test(entry);
          var cls = 'log-overlay__entry' + (isPhase ? ' log-overlay__entry--phase' : '');
          return '<div class="' + cls + '">' + escapeHtml(entry) + '</div>';
        }).join('');
      }

      // v9 PR-E2: 暂停 brush 横幅 — 等待玩家选择 (pendingChoice 存在)
      // 或 enemyThinking 中时显示。游戏结束时也复用作 game-over 提示。
      function renderPauseBanner() {
        if (!els.pauseBanner) return;
        var pending = game && Engine.getPendingChoice(game);
        var showPause = !!(game && (pending || enemyThinking) && game.phase !== 'gameover');
        els.pauseBanner.hidden = !showPause;
      }

      // v9 PR-E2: 底部状态条 — 版本 (硬编码 v9) / 分数占位 (用牌堆张数作
      // 视觉占位, 无经济系统) / 实时时钟. 时钟在 bindEvents 里通过
      // setInterval 每秒刷新, 此 fn 只渲染版本+score 部分。
      function renderStatusBar() {
        if (!els.statusBarScore || !game) return;
        // 分数占位: 显示牌堆 + 弃牌 总数 (visual filler, 无实际意义)
        var total = (game.deck ? game.deck.length : 0) + (game.discard ? game.discard.length : 0);
        els.statusBarScore.textContent = String(total);
      }

      function tickStatusBarTime() {
        if (!els.statusBarTime) return;
        var now = new Date();
        var hh = String(now.getHours()).padStart(2, '0');
        var mm = String(now.getMinutes()).padStart(2, '0');
        els.statusBarTime.textContent = hh + ':' + mm;
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

      function stateStatusMarkup(actor, base) {
        var chained = game && game[actor] && game[actor].chained;
        return escapeHtml(base) + (chained ? ' <span class="badge chain-status">铁索横置</span>' : '');
      }

      function renderStatus() {
        var isGameOver = game.phase === 'gameover';
        var isPlayerTurn = game.turn === 'player';
        var discardNeeded = isPlayerTurn && game.phase === 'discard' && Engine.needsDiscard(game, 'player');
        var title = '';
        var text = '';

        if (isGameOver) {
          title = game.winner === 'player' ? '胜利！' : '败北……';
          text = game.winner === 'player' ? '你平定了这场乱世对决。点击“新开一局”再战。' : '电脑赢下了这一局。调整出牌顺序再来一次。';
        } else if (discardNeeded) {
          title = '弃牌阶段';
          text = '你的手牌超过体力上限。点选需要弃置的牌，然后确认弃牌。';
        } else if (isPlayerTurn) {
          title = game.phase === 'finish' ? '结束阶段' : '你的回合';
          text = game.player.usedSha ? '你本回合已经出过【杀】，可以使用锦囊/桃，或结束回合。' : '点击手牌出牌。建议先用【无中生有】或【酒】，再寻找进攻机会。';
        } else {
          title = enemyThinking ? '电脑思考中' : '电脑回合';
          text = '电脑会按准备、判定、摸牌、出牌、弃牌、结束阶段自动行动。';
        }

        els.statusTitle.textContent = title;
        els.statusText.textContent = text;
        els.deckInfo.textContent = '牌堆 ' + game.deck.length + ' · 弃牌 ' + game.discard.length;
        els.endTurnBtn.disabled = !isPlayerTurn || isGameOver || enemyThinking || discardNeeded;
        els.endTurnBtn.textContent = game.phase === 'play' ? '结束出牌' : '结束回合';
        els.handHint.textContent = discardNeeded ? ('弃牌：已选 ' + selectedDiscardIds.length + ' / ' + Engine.getDiscardCount(game, 'player')) : (isPlayerTurn && !isGameOver ? '点击卡牌使用' : '等待回合');
        if (els.confirmDiscardBtn) {
          els.confirmDiscardBtn.hidden = !discardNeeded;
          els.confirmDiscardBtn.disabled = !discardNeeded || selectedDiscardIds.length < Engine.getDiscardCount(game, 'player');
        }
        els.playerState.innerHTML = stateStatusMarkup('player', isGameOver ? (game.winner === 'player' ? '胜利' : '败北') : (isPlayerTurn ? '行动' : '等待'));
        els.enemyState.innerHTML = stateStatusMarkup('enemy', isGameOver ? (game.winner === 'enemy' ? '胜利' : '败北') : (!isPlayerTurn ? '行动' : '等待'));
        els.playerTurnBadge.textContent = isPlayerTurn ? '当前回合' : '玩家';
        els.enemyTurnBadge.textContent = !isPlayerTurn && !isGameOver ? '当前回合' : '电脑';
      }

      function zoneCards(cards, emptyText) {
        if (!cards || !cards.length) return '<span class="mini-card">' + escapeHtml(emptyText) + '</span>';
        // v8 PR-0: 装备区 / 判定区 等公开区域 → 显示 花色 + 点数 (suit-class 颜色)
        return cards.map(function (card) {
          var suit = suitLabel(card.suit);
          var rank = card.rank ? String(card.rank).toUpperCase() : '';
          var meta = (suit || rank)
            ? ' <span class="mini-card-suit ' + suitColorClass(card.suit) + '">'
              + escapeHtml(suit) + (suit && rank ? ' ' : '') + escapeHtml(rank) + '</span>'
            : '';
          return '<span class="mini-card">' + escapeHtml(card.name) + meta + '</span>';
        }).join('');
      }

      function equipmentCards(equipment) {
        var cards = [];
        ['weapon', 'armor', 'horseMinus', 'horsePlus'].forEach(function (slot) {
          if (equipment && equipment[slot]) cards.push(equipment[slot]);
        });
        return zoneCards(cards, '未装备');
      }

      // v6.1: player-side equipment rendered as clickable buttons when in
      // a skill select mode that accepts equipment cards (currently 制衡).
      function playerEquipmentForZhiheng(equipment) {
        var cards = [];
        ['weapon', 'armor', 'horseMinus', 'horsePlus'].forEach(function (slot) {
          if (equipment && equipment[slot]) cards.push(equipment[slot]);
        });
        if (!cards.length) return '<span class="mini-card">未装备</span>';
        return cards.map(function (card) {
          var selected = selectedSkillCardIds.indexOf(card.id) >= 0;
          return '<button class="mini-card zhiheng-equip-pick' + (selected ? ' selected' : '') +
            '" data-card-id="' + escapeHtml(card.id) + '" title="点击切换是否弃置（含装备）">' +
            escapeHtml(card.name) + (selected ? ' ✓' : '') + '</button>';
        }).join('');
      }

      function renderZones() {
        if (els.playerEquipmentArea) {
          els.playerEquipmentArea.innerHTML = skillSelectMode === 'zhiheng'
            ? playerEquipmentForZhiheng(game.player.equipment)
            : equipmentCards(game.player.equipment);
        }
        if (els.enemyEquipmentArea) els.enemyEquipmentArea.innerHTML = equipmentCards(game.enemy.equipment);
        if (els.playerJudgeArea) els.playerJudgeArea.innerHTML = zoneCards(game.player.judgeArea, '空');
        if (els.enemyJudgeArea) els.enemyJudgeArea.innerHTML = zoneCards(game.enemy.judgeArea, '空');
      }

      function render() {
        renderHero('player');
        renderHero('enemy');
        renderHand();
        renderLog();
        renderStatus();
        renderPhaseTrack();
        renderZones();
        renderPendingChoice();
        // v9 PR-E2: 暂停横幅 + 状态条
        renderPauseBanner();
        renderStatusBar();
        els.enemyHandBacks.innerHTML = miniBacks(game.enemy.hand.length);
      }

      function suitLabel(suit) {
        return { spade: '♠', heart: '♥', club: '♣', diamond: '♦' }[suit] || suit || '';
      }

      // v8 PR-0: 牌面 花色 + 点数 可视化。spec 中所有牌都有 suit/rank/color，
      // 玩家做"火攻同花色弃"、"倾国黑色当闪"、"武圣红色当杀"等决策必须能看到。
      // 红 (heart/diamond) 用红色，黑 (spade/club) 用浅色；rank 用大写。
      function suitColorClass(suit) {
        return (suit === 'heart' || suit === 'diamond') ? 'suit-red' : 'suit-black';
      }

      // v9 PR-E3: corner 重构为列式 (rank 在上, suit 在下), 输出嵌套 span
      // 让 CSS 能分别控制 size / spacing. 兼容旧 .card-corner / .suit-red
      // / .suit-black class 选择器, 子 span 加 __rank / __suit 修饰.
      function suitRankBadge(card) {
        if (!card || (!card.suit && !card.rank)) return '';
        var suit = suitLabel(card.suit);
        var rank = card.rank ? String(card.rank).toUpperCase() : '';
        var rankSpan = rank ? '<span class="card-corner__rank">' + escapeHtml(rank) + '</span>' : '';
        var suitSpan = suit ? '<span class="card-corner__suit">' + escapeHtml(suit) + '</span>' : '';
        return '<span class="card-corner ' + suitColorClass(card.suit) + '">'
          + rankSpan + suitSpan
          + '</span>';
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

      var yijiGiveSelection = [];

      function renderPendingChoice() {
        var pending = game && Engine.getPendingChoice(game);
        var kind = pending && pending.kind;
        if (els.guicaiPromptPanel) {
          if (kind === 'guicai-replace' && pending.actor === 'player') {
            els.guicaiPromptPanel.hidden = false;
            if (els.guicaiPromptHint) {
              // v6.1: surface whose judgement is being replaced — when 司马懿
              // replaces opponent's judgement, the holder ≠ judgement actor.
              var whoseJudge = pending.judgementActor && pending.judgementActor !== pending.actor
                ? '对方'
                : '你';
              els.guicaiPromptHint.textContent =
                '鬼才：' + whoseJudge + '的判定牌【' + pending.judgementCard.name + '】' + suitLabel(pending.judgementCard.suit) +
                ' ' + (pending.judgementCard.rank || '') +
                '（' + (pending.reason || '判定') + '）— 选择手牌替换或跳过';
            }
            if (els.guicaiOriginalCard) {
              els.guicaiOriginalCard.innerHTML =
                '<span class="mini-card">原判定：【' + escapeHtml(pending.judgementCard.name) +
                '】' + escapeHtml(suitLabel(pending.judgementCard.suit)) +
                ' ' + escapeHtml(String(pending.judgementCard.rank || '')) + '</span>';
            }
            if (els.guicaiCandidates) {
              // v8 PR-A1: 用 promptCardChoice 统一模板（保留 .guicai-candidate
              // 类作向后兼容 — 事件绑定通过 data-guicai-card-id 走）
              els.guicaiCandidates.innerHTML = pending.candidates.map(function (card) {
                return promptCardChoice(card, {
                  dataAttrs: { guicaiCardId: card.id },
                  title: '选这张作为新的判定牌',
                  extraClass: 'guicai-candidate'
                });
              }).join('') || '<span class="mini-card">手牌为空，必须跳过</span>';
            }
          } else {
            els.guicaiPromptPanel.hidden = true;
          }
        }
        if (els.yijiPromptPanel) {
          if (kind === 'yiji-distribute' && pending.actor === 'player') {
            els.yijiPromptPanel.hidden = false;
            // Drop selections that no longer match this prompt's drawn IDs.
            yijiGiveSelection = yijiGiveSelection.filter(function (id) {
              return pending.drawnIds.indexOf(id) >= 0;
            });
            if (els.yijiPromptHint) {
              els.yijiPromptHint.textContent =
                '遗计：勾选要交给对方的牌（' + pending.cards.length + ' 张可分配，未勾选的留己）';
            }
            if (els.yijiCandidates) {
              els.yijiCandidates.innerHTML = pending.cards.map(function (card) {
                var selected = yijiGiveSelection.indexOf(card.id) >= 0;
                return '<button class="mini-card yiji-candidate' + (selected ? ' selected' : '') +
                  '" data-yiji-card-id="' + escapeHtml(card.id) +
                  '" title="切换：交给对方 / 留给自己">' +
                  escapeHtml('【' + card.name + '】' + suitLabel(card.suit) + ' ' + (card.rank || '')) +
                  (selected ? ' · 交给对方' : ' · 留己') +
                  '</button>';
              }).join('') || '<span class="mini-card">未摸到任何牌</span>';
            }
          } else {
            els.yijiPromptPanel.hidden = true;
            yijiGiveSelection = [];
          }
        }
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
        if (els.fanjianPromptPanel) {
          if (kind === 'fanjian-guess' && pending.actor === 'player') {
            els.fanjianPromptPanel.hidden = false;
            if (els.fanjianPromptHint) {
              // Show only the card NAME — suit is what the player must guess.
              els.fanjianPromptHint.textContent =
                '反间：对方给你一张【' + pending.cardName + '】，请猜花色（猜错你受 1 点伤害）。';
            }
          } else {
            els.fanjianPromptPanel.hidden = true;
          }
        }
        if (els.fankuiPromptPanel) {
          if (kind === 'fankui-pick' && pending.actor === 'player') {
            els.fankuiPromptPanel.hidden = false;
            if (els.fankuiPromptHint) {
              els.fankuiPromptHint.textContent =
                '反馈：选择获得' + (pending.sourceActor === 'enemy' ? '对方' : '来源') +
                '的一张牌（手牌随机；装备/判定区可指定）';
            }
            if (els.fankuiZones) {
              // v8 PR-A1: equipment / judge 走 promptCardChoice，hand 走特殊"随机"按钮
              els.fankuiZones.innerHTML = pending.zones.map(function (entry) {
                if (entry.zone === 'hand') {
                  return '<button class="mini-card prompt-card-choice fankui-zone-btn" data-fankui-zone="hand">'
                    + '手牌（随机 1 张，共 ' + entry.count + ' 张）</button>';
                }
                return promptCardChoice(
                  { name: entry.name, suit: entry.suit, rank: entry.rank },
                  {
                    dataAttrs: { fankuiZone: entry.zone, fankuiCardId: entry.cardId },
                    extraClass: 'fankui-zone-btn',
                    prefix: entry.zone === 'equipment' ? '装备区' : '判定区'
                  }
                );
              }).join('') || '<span class="mini-card">对方没有可获得的牌</span>';
            }
          } else {
            els.fankuiPromptPanel.hidden = true;
          }
        }
        // v6.1 ganglie: two distinct prompts.
        if (els.gangliePromptPanel) {
          if (kind === 'ganglie-fire' && pending.actor === 'player') {
            els.gangliePromptPanel.hidden = false;
            if (els.gangliePromptHint) {
              els.gangliePromptHint.textContent =
                '刚烈：' + pending.sourceName + ' 对你造成了伤害，是否发动判定反制？';
            }
          } else {
            els.gangliePromptPanel.hidden = true;
          }
        }
        if (els.ganglieSourcePanel) {
          if (kind === 'ganglie-source-choice' && pending.actor === 'player') {
            els.ganglieSourcePanel.hidden = false;
            // Reset selection if the candidate set changed (new prompt).
            var validIds = pending.candidates.map(function (e) { return e.id; });
            ganglieSelectedIds = ganglieSelectedIds.filter(function (id) { return validIds.indexOf(id) >= 0; });
            if (els.ganglieSourceHint) {
              els.ganglieSourceHint.textContent =
                '刚烈：选择 2 张牌弃置（手牌+装备区可选；已选 ' + ganglieSelectedIds.length + '/2），或选择直接受 1 点伤害。';
            }
            if (els.ganglieSourceCandidates) {
              els.ganglieSourceCandidates.innerHTML = pending.candidates.map(function (entry) {
                var selected = ganglieSelectedIds.indexOf(entry.id) >= 0;
                var zoneLabel = entry.zone === 'hand' ? '手牌' : '装备区';
                return '<button class="mini-card ganglie-candidate' + (selected ? ' selected' : '') +
                  '" data-ganglie-card-id="' + escapeHtml(entry.id) +
                  '" title="切换是否弃置">[' + zoneLabel + ']【' + escapeHtml(entry.name) +
                  '】' + escapeHtml(suitLabel(entry.suit)) + ' ' + escapeHtml(String(entry.rank || '')) +
                  (selected ? ' ✓' : '') +
                  '</button>';
              }).join('') || '<span class="mini-card">没有可弃置的牌</span>';
            }
            if (els.ganglieSourceConfirmBtn) {
              els.ganglieSourceConfirmBtn.disabled = ganglieSelectedIds.length !== 2;
            }
          } else {
            els.ganglieSourcePanel.hidden = true;
            ganglieSelectedIds = [];
          }
        }
        // v8 PR-A2: 麒麟弓 — source 在 2 马时挑一匹弃 (单匹自动走, 不会 pause)
        if (els.qilinPickPanel) {
          if (kind === 'qilin-pick' && pending.actor === 'player') {
            els.qilinPickPanel.hidden = false;
            if (els.qilinPickHint) {
              els.qilinPickHint.textContent =
                '麒麟弓：' + actorDisplayName(pending.target) + ' 装备区有 2 匹坐骑，选一匹弃置（spec：一张），或不发动。';
            }
            if (els.qilinPickChoices) {
              var qilinTargetState = game[pending.target];
              els.qilinPickChoices.innerHTML = (pending.horseSlots || []).map(function (slot) {
                var card = qilinTargetState && qilinTargetState.equipment && qilinTargetState.equipment[slot];
                if (!card) return '';
                return promptCardChoice(card, {
                  dataAttrs: { qilinSlot: slot },
                  title: '弃置这一匹坐骑',
                  extraClass: 'qilin-pick-choice',
                  prefix: slot === 'horsePlus' ? '+1 马 ' : '-1 马 '
                });
              }).join('') || '<span class="mini-card">没有可弃置的坐骑</span>';
            }
          } else {
            els.qilinPickPanel.hidden = true;
          }
        }
        // v8 PR-A3: 雌雄双股剑 fire — source 决定是否对异性发动
        if (els.cixiongFirePanel) {
          if (kind === 'cixiong-fire' && pending.actor === 'player') {
            els.cixiongFirePanel.hidden = false;
            if (els.cixiongFireHint) {
              els.cixiongFireHint.textContent =
                '雌雄双股剑：对' + actorDisplayName(pending.target) + '（异性）发动效果？目标二选一：弃 1 手牌 / 令你摸 1 张。';
            }
          } else {
            els.cixiongFirePanel.hidden = true;
          }
        }
        // v8 PR-A3: 雌雄双股剑 choose — target 选 弃手 或 让 source 摸 1
        if (els.cixiongChoosePanel) {
          if (kind === 'cixiong-choose' && pending.actor === 'player') {
            els.cixiongChoosePanel.hidden = false;
            if (els.cixiongChooseHint) {
              els.cixiongChooseHint.textContent =
                '雌雄双股剑：' + actorDisplayName(pending.sourceActor) +
                '发动，弃 1 张手牌或令其摸 1 张。';
            }
            if (els.cixiongChooseChoices) {
              var cxResponder = game[pending.actor];
              var cxHandIds = pending.handIds || [];
              els.cixiongChooseChoices.innerHTML = cxHandIds.map(function (cardId) {
                var card = cxResponder && (cxResponder.hand || []).find(function (c) { return c.id === cardId; });
                if (!card) return '';
                return promptCardChoice(card, {
                  dataAttrs: { cixiongDiscardCardId: cardId },
                  title: '弃这张手牌响应雌雄',
                  extraClass: 'cixiong-choose-card'
                });
              }).join('') || '<span class="mini-card">没有手牌可弃 → 必须让对方摸 1 张</span>';
            }
          } else {
            els.cixiongChoosePanel.hidden = true;
          }
        }
        // v8 PR-A4: 借刀杀人决策 — 出杀 or 交武器
        if (els.jiedaoDecisionPanel) {
          if (kind === 'jiedao-decision' && pending.actor === 'player') {
            els.jiedaoDecisionPanel.hidden = false;
            if (els.jiedaoDecisionHint) {
              var jdShas = ((game.player && game.player.hand) || []).filter(function (c) {
                return c && (c.type === 'sha' || c.type === 'fire_sha' || c.type === 'thunder_sha');
              });
              els.jiedaoDecisionHint.textContent =
                '借刀杀人：' + actorDisplayName(pending.sourceActor) +
                '令你对其出【杀】（手中可用 ' + jdShas.length + ' 张【杀】），否则把武器交给对方。';
            }
          } else {
            els.jiedaoDecisionPanel.hidden = true;
          }
        }
        // v8 PR-A4: 过河拆桥 1V1 — source 二选一（弃装备 / 看手并弃）
        if (els.guohePickPanel) {
          if (kind === 'guohe-1v1-pick' && pending.actor === 'player') {
            els.guohePickPanel.hidden = false;
            if (els.guohePickHint) {
              els.guohePickHint.textContent =
                '过河拆桥（1V1）：弃 ' + actorDisplayName(pending.target) +
                ' 装备区 1 张牌，或观看其手牌后弃其中 1 张。';
            }
            if (els.guohePickEquipment) {
              var equipList = pending.equipment || [];
              els.guohePickEquipment.innerHTML = equipList.length
                ? '<span class="mini-card">装备区：</span>' + equipList.map(function (entry) {
                    return promptCardChoice(entry, {
                      dataAttrs: { guoheZone: 'equipment', guoheCardId: entry.cardId },
                      title: '弃这张装备',
                      extraClass: 'guohe-equip-choice'
                    });
                  }).join('')
                : '<span class="mini-card">装备区：空</span>';
            }
            if (els.guohePickHand) {
              var handList = pending.hand || [];
              els.guohePickHand.innerHTML = handList.length
                ? '<span class="mini-card">手牌（spec：观看后弃）：</span>' + handList.map(function (entry) {
                    return promptCardChoice(entry, {
                      dataAttrs: { guoheZone: 'hand', guoheCardId: entry.cardId },
                      title: '弃这张手牌',
                      extraClass: 'guohe-hand-choice'
                    });
                  }).join('')
                : '<span class="mini-card">手牌：空</span>';
            }
          } else {
            els.guohePickPanel.hidden = true;
          }
        }
        // v8 PR-A5: 五谷丰登 reveal-then-pick — picker 从 pool 中选 1 张
        if (els.wuguPickPanel) {
          if (kind === 'wugu-pick' && pending.actor === 'player') {
            els.wuguPickPanel.hidden = false;
            if (els.wuguPickHint) {
              var wuguTotal = (pending.cards || []).length;
              var wuguSourceName = pending.sourceActor === pending.actor
                ? '你'
                : actorDisplayName(pending.sourceActor);
              els.wuguPickHint.textContent =
                '五谷丰登：' + wuguSourceName + '亮出 ' + wuguTotal + ' 张牌，请挑 1 张获得（spec: 剩余的入弃牌堆）。';
            }
            if (els.wuguPickChoices) {
              els.wuguPickChoices.innerHTML = (pending.cards || []).map(function (card) {
                return promptCardChoice(card, {
                  dataAttrs: { wuguCardId: card.id },
                  title: '获得这张牌',
                  extraClass: 'wugu-pick-choice'
                });
              }).join('') || '<span class="mini-card">池中没有可选牌</span>';
            }
          } else {
            els.wuguPickPanel.hidden = true;
          }
        }
        // v8 hotfix-2: 洛神 (luoshen-continue) — 准备阶段每次判定前询问
        if (els.luoshenPromptPanel) {
          if (kind === 'luoshen-continue' && pending.actor === 'player') {
            els.luoshenPromptPanel.hidden = false;
            if (els.luoshenPromptHint) {
              els.luoshenPromptHint.textContent =
                '洛神：是否进行判定？黑色获得入手, 红色结束流程';
            }
          } else {
            els.luoshenPromptPanel.hidden = true;
          }
        }
        // v8 PR-A2: 濒死救援 — responder 用 桃/酒 救援（酒仅自救）
        if (els.dyingRescuePanel) {
          if (kind === 'dying-rescue' && pending.actor === 'player') {
            els.dyingRescuePanel.hidden = false;
            var selfRescue = pending.actor === pending.dyingActor;
            if (els.dyingRescueHint) {
              els.dyingRescueHint.textContent = selfRescue
                ? '濒死救援：你已濒死，可用【桃】或【酒（方法Ⅱ）】自救，或放弃。'
                : '濒死救援：' + actorDisplayName(pending.dyingActor) + '濒死，你可用【桃】救援（仅自救可用【酒】），或不救。';
            }
            if (els.dyingRescueChoices) {
              var responderState = game[pending.actor];
              var taoIds = pending.taoIds || [];
              var jiuIds = pending.jiuIds || [];
              var jijiuIds = pending.jijiuIds || [];
              var allIds = taoIds.concat(jiuIds).concat(jijiuIds);
              els.dyingRescueChoices.innerHTML = allIds.map(function (cardId) {
                var card = responderState && (responderState.hand || []).find(function (c) { return c.id === cardId; });
                if (!card) return '';
                var isJiu = jiuIds.indexOf(cardId) >= 0;
                var isJijiu = jijiuIds.indexOf(cardId) >= 0;
                var title, suffix;
                if (isJiu) { title = '使用此酒（方法Ⅱ）自救'; suffix = ' · 酒Ⅱ'; }
                else if (isJijiu) { title = '发动急救：将此红牌当桃救援'; suffix = ' · 急救'; }
                else { title = '使用此桃救援'; suffix = ' · 桃'; }
                return promptCardChoice(card, {
                  dataAttrs: { dyingRescueCardId: cardId },
                  title: title,
                  extraClass: 'dying-rescue-choice',
                  suffix: suffix
                });
              }).join('') || '<span class="mini-card">手牌中没有可救援的牌</span>';
            }
          } else {
            els.dyingRescuePanel.hidden = true;
          }
        }
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

      function showTiesuoPanel(cardId) {
        pendingTiesuoCardId = cardId;
        if (els.tiesuoModePanel) els.tiesuoModePanel.hidden = false;
        if (els.handHint) els.handHint.textContent = '选择【铁索连环】：重铸，或横置/重置一至两名角色';
      }

      function hideTiesuoPanel() {
        pendingTiesuoCardId = null;
        if (els.tiesuoModePanel) els.tiesuoModePanel.hidden = true;
      }

      function showTargetZonePanel(cardId) {
        pendingTargetCardId = cardId;
        pendingTargetZone = null;
        if (els.targetZonePanel) els.targetZonePanel.hidden = false;
        if (els.targetCardChoices) els.targetCardChoices.innerHTML = '<span class="mini-card">先选择一个区域，再点具体目标牌</span>';
        if (els.handHint) els.handHint.textContent = '选择目标区域：手牌、装备区或延时锦囊区';
      }

      function hideTargetZonePanel() {
        pendingTargetCardId = null;
        pendingTargetZone = null;
        if (els.targetZonePanel) els.targetZonePanel.hidden = true;
        if (els.targetCardChoices) els.targetCardChoices.innerHTML = '<span class="mini-card">先选择一个区域，再点具体目标牌</span>';
      }

      function hideHuogongPanel() {
        pendingHuogongCardId = null;
        if (els.huogongModePanel) els.huogongModePanel.hidden = true;
        if (els.huogongRevealText) els.huogongRevealText.textContent = '火攻：等待展示目标手牌';
        if (els.huogongCostChoices) els.huogongCostChoices.innerHTML = '<span class="mini-card">同花色牌可用于造成火焰伤害</span>';
      }

      function showConversionPanel(cardId) {
        pendingConversionCardId = cardId;
        var card = findPlayerCard(cardId);
        if (els.conversionModePanel) els.conversionModePanel.hidden = false;
        if (els.conversionHint) els.conversionHint.textContent = card ? '【' + card.name + '】可按原牌使用，也可当【杀】使用' : '这张牌可按原牌使用，也可当【杀】使用';
        if (els.handHint) els.handHint.textContent = '请选择：按原牌使用，或发动技能当【杀】使用';
      }

      function hideConversionPanel() {
        pendingConversionCardId = null;
        if (els.conversionModePanel) els.conversionModePanel.hidden = true;
        if (els.conversionHint) els.conversionHint.textContent = '这张牌可按原牌使用，也可当【杀】使用';
      }

      function guanxingCardMarkup(card, zone) {
        var selected = guanxingSelected === card.id ? ' selected' : '';
        return '<button class="mini-card guanxing-card' + selected +
          '" data-guanxing-card-id="' + escapeHtml(card.id) +
          '" data-guanxing-zone="' + escapeHtml(zone) +
          '">【' + escapeHtml(card.name) + '】' + escapeHtml(suitName(card.suit)) + ' ' + escapeHtml(String(card.rank || '')) + '</button>';
      }

      function guanxingFindCard(id) {
        var pending = game && Engine.getPendingChoice(game);
        if (!pending || pending.kind !== 'guanxing-reorder') return null;
        for (var i = 0; i < pending.cards.length; i += 1) {
          if (pending.cards[i].id === id) return pending.cards[i];
        }
        return null;
      }

      function renderGuanxingZones() {
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
        guanxingUnassignedIds = [];
        guanxingTopIds = [];
        guanxingBottomIds = [];
        guanxingSelected = null;
        if (els.guanxingModePanel) els.guanxingModePanel.hidden = true;
        if (els.guanxingHint) els.guanxingHint.textContent = '观星：准备阶段开始时分配预览牌';
      }

      function guanxingMoveSelectedTo(targetZone) {
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
        if (!game) return;
        var result = Engine.resolvePendingChoice(game, { decline: true });
        hideGuanxingPanel();
        if (!result.ok) game.log.push(result.message);
        render();
      }

      function suitName(suit) {
        var labels = { spade: '黑桃', heart: '红桃', club: '梅花', diamond: '方片' };
        return labels[suit] || suit || '未知花色';
      }

      function huogongCostButton(card, usable) {
        return '<button class="mini-card huogong-cost-choice ' + (usable ? 'usable' : 'unusable') + '" data-huogong-cost-id="' + escapeHtml(card.id) + '" ' + (usable ? '' : 'disabled') + ' title="' + (usable ? '弃置这张牌造成火焰伤害' : '花色不符，不能弃置') + '">【' + escapeHtml(card.name) + '】' + escapeHtml(suitName(card.suit)) + (usable ? ' 可用' : ' 不可用') + '</button>';
      }

      function showHuogongPanel(cardId) {
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
        var labels = { hand: '手牌区', equipment: '装备区', judge: '延时锦囊区' };
        return labels[zone] || '目标区';
      }

      function targetChoiceButton(entry) {
        var label = entry.hidden ? (entry.label + '（未知）') : entry.label;
        return '<button class="mini-card target-card-choice" data-target-zone="' + escapeHtml(entry.zone) + '" data-target-card-id="' + escapeHtml(entry.card.id) + '" title="选择' + escapeHtml(label) + '">' + escapeHtml(label) + '</button>';
      }

      function showTargetCardChoices(zone) {
        if (!pendingTargetCardId || !game || !els.targetCardChoices) return;
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

      function enterZhihengMode() {
        skillSelectMode = 'zhiheng';
        return enterCardSkillMode(skillSelectMode);
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

      function confirmZhiheng() {
        if (!game || skillSelectMode !== 'zhiheng') return;
        if (!selectedSkillCardIds.length) {
          game.log.push('请选择至少一张牌发动【制衡】。');
          render();
          return;
        }
        var result = Engine.useSkill(game, 'player', 'zhiheng', selectedSkillCardIds);
        exitSkillSelectMode();
        if (!result.ok) game.log.push(result.message);
        render();
      }

      function resolveTargetZone(zone) {
        if (!pendingTargetCardId || !game) return;
        showTargetCardChoices(zone);
      }

      function resolveTargetCard(zone, targetCardId) {
        if (!pendingTargetCardId || !game || !targetCardId) return;
        var result = Engine.playCard(game, 'player', pendingTargetCardId, { targetZone: zone, targetCardId: targetCardId });
        hideTargetZonePanel();
        if (!result.ok) game.log.push(result.message);
        render();
      }

      function resolveHuogong(costCardId, decline) {
        if (!pendingHuogongCardId || !game) return;
        var enemyHpBefore = game.enemy.hp;
        var result = Engine.playCard(game, 'player', pendingHuogongCardId, decline ? { declineHuogong: true } : { huogongCostCardId: costCardId });
        hideHuogongPanel();
        if (!result.ok) game.log.push(result.message);
        if (game.enemy.hp < enemyHpBefore) flashHero('enemy');
        render();
      }

      function resolveConversion(asSha) {
        if (!pendingConversionCardId || !game) return;
        var cardId = pendingConversionCardId;
        if (!asSha) {
          hideConversionPanel();
          resolveNormalPlayerCard(cardId);
          return;
        }
        var enemyHpBefore = game.enemy.hp;
        var playerHpBefore = game.player.hp;
        var result = Engine.playCardAs(game, 'player', cardId, 'sha');
        hideConversionPanel();
        if (!result.ok) game.log.push(result.message);
        if (game.enemy.hp < enemyHpBefore) flashHero('enemy');
        if (game.player.hp < playerHpBefore) flashHero('player');
        render();
      }

      function resolveTiesuo(options) {
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
        if (action && action.mode === 'asSha') {
          hideTiesuoPanel();
          hideTargetZonePanel();
          hideHuogongPanel();
          hideGuanxingPanel();
          hideConversionPanel();
          var enemyHpBefore = game.enemy.hp;
          var playerHpBefore = game.player.hp;
          var result = Engine.playCardAs(game, 'player', cardId, 'sha');
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
        var playerHpBefore = game.player.hp;
        var enemyHpBefore = game.enemy.hp;

        if (game.phase === 'play') {
          var action = Engine.aiTakeAction(game, 'enemy');
          if (game.player.hp < playerHpBefore) flashHero('player');
          if (game.enemy.hp < enemyHpBefore) flashHero('enemy');
          render();
          if (action.ok && action.action !== 'none' && game.turn === 'enemy' && game.phase === 'play') {
            window.setTimeout(enemyStep, enemyActionDelay);
            return;
          }
          Engine.finishPlayPhase(game);
          render();
          window.setTimeout(enemyStep, enemyActionDelay);
          return;
        }

        if (game.phase === 'discard') {
          if (Engine.needsDiscard(game, 'enemy')) {
            var need = Engine.getDiscardCount(game, 'enemy');
            Engine.discardSelected(game, 'enemy', game.enemy.hand.slice(0, need).map(function (card) { return card.id; }));
          }
          Engine.advancePhase(game);
          render();
          window.setTimeout(enemyStep, enemyActionDelay);
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
        window.setTimeout(enemyStep, enemyActionDelay);
      }

      function maybeStartEnemyTurn() {
        if (game && game.turn === 'enemy' && game.phase !== 'gameover' && !enemyThinking) {
          enemyThinking = true;
          render();
          window.setTimeout(enemyStep, enemyActionDelay);
        }
      }

      function heroPackLabel(pack) {
        var labels = { standard: '标准', wind: '风', forest: '林', fire: '火', mountain: '山', sp: 'SP' };
        return labels[pack] || pack || '扩展';
      }

      function heroSortKey(hero) {
        var order = { standard: 1, wind: 2, forest: 3, fire: 4, mountain: 5, sp: 6 };
        return String(order[hero.pack] || 9) + '-' + hero.camp + '-' + hero.name;
      }

      function populateHeroSelects() {
        if (!els.playerHeroSelect || !els.enemyHeroSelect) return;
        var currentPlayer = els.playerHeroSelect.value || 'liubei';
        var currentEnemy = els.enemyHeroSelect.value || 'caocao';
        var heroes = Object.keys(Engine.HERO_CATALOG).map(function (id) { return Engine.HERO_CATALOG[id]; })
          .sort(function (a, b) { return heroSortKey(a).localeCompare(heroSortKey(b), 'zh-Hans-CN'); });
        function fill(select, selected) {
          select.innerHTML = heroes.map(function (hero) {
            return '<option value="' + escapeHtml(hero.id) + '">' + escapeHtml('[' + heroPackLabel(hero.pack) + '] ' + hero.name + ' · ' + hero.camp + ' · ' + (hero.skills || []).map(function (skill) { return skill.name; }).join('/')) + '</option>';
          }).join('');
          select.value = Engine.HERO_CATALOG[selected] ? selected : (select === els.playerHeroSelect ? 'liubei' : 'caocao');
        }
        fill(els.playerHeroSelect, currentPlayer);
        fill(els.enemyHeroSelect, currentEnemy);
        ensureDistinctHeroes('player');
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
        var select = side === 'player' ? els.playerHeroSelect : els.enemyHeroSelect;
        var other = side === 'player' ? els.enemyHeroSelect.value : els.playerHeroSelect.value;
        var pool = optionValues(select).filter(function (value) { return value !== other; });
        select.value = pool[Math.floor(Math.random() * pool.length)];
        ensureDistinctHeroes(side);
      }

      function updateDraftUI() {
        if (els.playerRoleBadge) els.playerRoleBadge.textContent = '我方：' + playerRole;
        if (els.enemyRoleBadge) els.enemyRoleBadge.textContent = '敌方：' + enemyRole;
        if (els.firstPickBadge) els.firstPickBadge.textContent = '主公先选 · 当前：' + (draftPicker === 'player' ? '我方' : draftPicker === 'enemy' ? '敌方' : '双方已确认');
      }

      function assignRandomRoles() {
        var playerIsLord = Math.random() >= 0.5;
        playerRole = playerIsLord ? '主公' : '反贼';
        enemyRole = playerIsLord ? '反贼' : '主公';
        draftPicker = playerIsLord ? 'player' : 'enemy';
        updateDraftUI();
      }

      function confirmHeroPick() {
        if (draftPicker === 'player') draftPicker = 'enemy';
        else if (draftPicker === 'enemy') draftPicker = 'done';
        updateDraftUI();
      }

      function showSetup() {
        enemyThinking = false;
        hideTiesuoPanel();
        hideTargetZonePanel();
        hideHuogongPanel();
        hideConversionPanel();
        hideGuanxingPanel();
        exitSkillSelectMode();
        // v9 PR-E8: 切到 setup 时, 隐藏 splash / lobby
        if (els.splashScreen) els.splashScreen.hidden = true;
        if (els.lobbyScreen) els.lobbyScreen.hidden = true;
        if (els.setupScreen) els.setupScreen.hidden = false;
        if (els.duelTable) els.duelTable.hidden = true;
        if (els.endTurnBtn) els.endTurnBtn.disabled = true;
        if (els.newGameBtn) els.newGameBtn.textContent = '重新选将';
        populateHeroSelects();
        ensureDistinctHeroes('player');
        updateDraftUI();
      }

      // v9 PR-E8: 入口屏切换 — splash → lobby → setup → game.
      function showSplash() {
        if (els.splashScreen) els.splashScreen.hidden = false;
        if (els.lobbyScreen) els.lobbyScreen.hidden = true;
        if (els.setupScreen) els.setupScreen.hidden = true;
        if (els.duelTable) els.duelTable.hidden = true;
      }
      function showLobby() {
        if (els.splashScreen) els.splashScreen.hidden = true;
        if (els.lobbyScreen) els.lobbyScreen.hidden = false;
        if (els.setupScreen) els.setupScreen.hidden = true;
        if (els.duelTable) els.duelTable.hidden = true;
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
        if (els.setupScreen) els.setupScreen.hidden = true;
        if (els.duelTable) els.duelTable.hidden = false;
        if (els.newGameBtn) els.newGameBtn.textContent = '重新选将';
        render();
        maybeStartEnemyTurn();
      }

      function bindEvents() {
        // v9 PR-E2: 实时时钟 — 启动 + 每分钟刷新一次 (秒级精度对玩家无意义).
        if (els.statusBarTime) {
          tickStatusBarTime();
          window.setInterval(tickStatusBarTime, 60 * 1000);
        }
        els.newGameBtn.addEventListener('click', showSetup);
        if (els.startGameBtn) els.startGameBtn.addEventListener('click', newGame);
        if (els.randomPlayerHeroBtn) els.randomPlayerHeroBtn.addEventListener('click', function () { randomizeHero('player'); });
        if (els.randomEnemyHeroBtn) els.randomEnemyHeroBtn.addEventListener('click', function () { randomizeHero('enemy'); });
        if (els.randomRolesBtn) els.randomRolesBtn.addEventListener('click', assignRandomRoles);
        if (els.confirmHeroPickBtn) els.confirmHeroPickBtn.addEventListener('click', confirmHeroPick);
        if (els.playerHeroSelect) els.playerHeroSelect.addEventListener('change', function () { ensureDistinctHeroes('player'); });
        if (els.enemyHeroSelect) els.enemyHeroSelect.addEventListener('change', function () { ensureDistinctHeroes('enemy'); });
        els.endTurnBtn.addEventListener('click', function () {
          if (!game || game.turn !== 'player' || game.phase === 'gameover') return;
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
        els.playerHand.addEventListener('click', function (event) {
          var card = event.target.closest('[data-card-id]');
          if (!card) return;
          usePlayerCard(card.getAttribute('data-card-id'));
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
        if (els.tiesuoRecastBtn) els.tiesuoRecastBtn.addEventListener('click', function () { resolveTiesuo({ mode: 'recast' }); });
        if (els.tiesuoChainEnemyBtn) els.tiesuoChainEnemyBtn.addEventListener('click', function () { resolveTiesuo({ mode: 'chain', targets: ['enemy'] }); });
        if (els.tiesuoChainSelfBtn) els.tiesuoChainSelfBtn.addEventListener('click', function () { resolveTiesuo({ mode: 'chain', targets: ['player'] }); });
        if (els.tiesuoChainBothBtn) els.tiesuoChainBothBtn.addEventListener('click', function () { resolveTiesuo({ mode: 'chain', targets: ['player', 'enemy'] }); });
        if (els.tiesuoCancelBtn) els.tiesuoCancelBtn.addEventListener('click', function () { hideTiesuoPanel(); render(); });
        if (els.targetHandBtn) els.targetHandBtn.addEventListener('click', function () { resolveTargetZone('hand'); });
        if (els.targetEquipmentBtn) els.targetEquipmentBtn.addEventListener('click', function () { resolveTargetZone('equipment'); });
        if (els.targetJudgeBtn) els.targetJudgeBtn.addEventListener('click', function () { resolveTargetZone('judge'); });
        if (els.targetCardChoices) els.targetCardChoices.addEventListener('click', function (event) {
          var target = event.target.closest('[data-target-card-id]');
          if (!target) return;
          resolveTargetCard(target.getAttribute('data-target-zone'), target.getAttribute('data-target-card-id'));
        });
        if (els.huogongCostChoices) els.huogongCostChoices.addEventListener('click', function (event) {
          var cost = event.target.closest('[data-huogong-cost-id]');
          if (!cost || cost.disabled) return;
          resolveHuogong(cost.getAttribute('data-huogong-cost-id'), false);
        });
        if (els.huogongDeclineBtn) els.huogongDeclineBtn.addEventListener('click', function () { resolveHuogong(null, true); });
        if (els.huogongCancelBtn) els.huogongCancelBtn.addEventListener('click', function () { hideHuogongPanel(); render(); });
        if (els.conversionNormalBtn) els.conversionNormalBtn.addEventListener('click', function () { resolveConversion(false); });
        if (els.conversionShaBtn) els.conversionShaBtn.addEventListener('click', function () { resolveConversion(true); });
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
        if (els.zhihengConfirmBtn) els.zhihengConfirmBtn.addEventListener('click', confirmCardSkill);
        if (els.zhihengCancelBtn) els.zhihengCancelBtn.addEventListener('click', function () { exitSkillSelectMode(); render(); });
        if (els.guicaiCandidates) els.guicaiCandidates.addEventListener('click', function (event) {
          var btn = event.target.closest('[data-guicai-card-id]');
          if (!btn) return;
          var cardId = btn.getAttribute('data-guicai-card-id');
          var result = Engine.resolvePendingChoice(game, { cardId: cardId });
          if (!result.ok) {
            renderLog();
          }
          render();
        });
        if (els.guicaiDeclineBtn) els.guicaiDeclineBtn.addEventListener('click', function () {
          var result = Engine.resolvePendingChoice(game, { cardId: null });
          if (!result.ok) renderLog();
          render();
        });
        // 反间 (v6.1): 4 suit buttons. Each emits a fanjian-guess resolve.
        ['fanjianSpadeBtn', 'fanjianHeartBtn', 'fanjianClubBtn', 'fanjianDiamondBtn'].forEach(function (key) {
          var el = els[key];
          if (!el) return;
          el.addEventListener('click', function () {
            var suit = el.getAttribute('data-fanjian-suit');
            var result = Engine.resolvePendingChoice(game, { suit: suit });
            if (!result.ok) renderLog();
            render();
          });
        });
        if (els.fankuiZones) els.fankuiZones.addEventListener('click', function (event) {
          var btn = event.target.closest('[data-fankui-zone]');
          if (!btn) return;
          var zone = btn.getAttribute('data-fankui-zone');
          var cardId = btn.getAttribute('data-fankui-card-id') || null;
          var result = Engine.resolvePendingChoice(game, { zone: zone, cardId: cardId });
          if (!result.ok) renderLog();
          render();
        });
        // 刚烈 (v6.1): two prompts. ganglie-fire = yes/no for 夏侯惇 to
        // trigger judgement. ganglie-source-choice = source picks 2 cards
        // or takes 1 damage.
        if (els.ganglieFireBtn) els.ganglieFireBtn.addEventListener('click', function () {
          Engine.resolvePendingChoice(game, { fire: true });
          render();
        });
        if (els.ganglieDeclineBtn) els.ganglieDeclineBtn.addEventListener('click', function () {
          Engine.resolvePendingChoice(game, { fire: false });
          render();
        });
        if (els.ganglieSourceCandidates) els.ganglieSourceCandidates.addEventListener('click', function (event) {
          var btn = event.target.closest('[data-ganglie-card-id]');
          if (!btn) return;
          var id = btn.getAttribute('data-ganglie-card-id');
          var idx = ganglieSelectedIds.indexOf(id);
          if (idx >= 0) {
            ganglieSelectedIds.splice(idx, 1);
          } else if (ganglieSelectedIds.length < 2) {
            ganglieSelectedIds.push(id);
          }
          render();
        });
        if (els.ganglieSourceConfirmBtn) els.ganglieSourceConfirmBtn.addEventListener('click', function () {
          if (ganglieSelectedIds.length !== 2) return;
          var ids = ganglieSelectedIds.slice();
          ganglieSelectedIds = [];
          var result = Engine.resolvePendingChoice(game, { mode: 'discard', cardIds: ids });
          if (!result.ok) renderLog();
          render();
        });
        if (els.ganglieSourceTakeDamageBtn) els.ganglieSourceTakeDamageBtn.addEventListener('click', function () {
          ganglieSelectedIds = [];
          var result = Engine.resolvePendingChoice(game, { mode: 'takeDamage' });
          if (!result.ok) renderLog();
          render();
        });
        // v8 PR-A2: 麒麟弓 pick 面板
        if (els.qilinPickChoices) els.qilinPickChoices.addEventListener('click', function (event) {
          var btn = event.target.closest('[data-qilin-slot]');
          if (!btn) return;
          var slot = btn.getAttribute('data-qilin-slot');
          var result = Engine.resolvePendingChoice(game, { slot: slot });
          if (!result.ok) renderLog();
          render();
        });
        if (els.qilinDeclineBtn) els.qilinDeclineBtn.addEventListener('click', function () {
          var result = Engine.resolvePendingChoice(game, { decline: true });
          if (!result.ok) renderLog();
          render();
        });
        // v8 PR-A3: 雌雄 fire 面板
        if (els.cixiongFireBtn) els.cixiongFireBtn.addEventListener('click', function () {
          var result = Engine.resolvePendingChoice(game, { fire: true });
          if (!result.ok) renderLog();
          render();
        });
        if (els.cixiongFireDeclineBtn) els.cixiongFireDeclineBtn.addEventListener('click', function () {
          var result = Engine.resolvePendingChoice(game, { decline: true });
          if (!result.ok) renderLog();
          render();
        });
        // v8 PR-A3: 雌雄 choose 面板 — 弃手牌 / 让对方摸 1
        if (els.cixiongChooseChoices) els.cixiongChooseChoices.addEventListener('click', function (event) {
          var btn = event.target.closest('[data-cixiong-discard-card-id]');
          if (!btn) return;
          var cardId = btn.getAttribute('data-cixiong-discard-card-id');
          var result = Engine.resolvePendingChoice(game, { option: 'discard', cardId: cardId });
          if (!result.ok) renderLog();
          render();
        });
        if (els.cixiongChooseDrawBtn) els.cixiongChooseDrawBtn.addEventListener('click', function () {
          var result = Engine.resolvePendingChoice(game, { option: 'draw' });
          if (!result.ok) renderLog();
          render();
        });
        // v8 PR-A4: 借刀杀人决策面板
        if (els.jiedaoDecisionFireBtn) els.jiedaoDecisionFireBtn.addEventListener('click', function () {
          var result = Engine.resolvePendingChoice(game, { fire: true });
          if (!result.ok) renderLog();
          render();
        });
        if (els.jiedaoDecisionDeclineBtn) els.jiedaoDecisionDeclineBtn.addEventListener('click', function () {
          var result = Engine.resolvePendingChoice(game, { decline: true });
          if (!result.ok) renderLog();
          render();
        });
        // v8 PR-A4: 过河拆桥 1V1 面板 — equipment + hand 共享同一 click handler
        function handleGuohePickClick(event) {
          var btn = event.target.closest('[data-guohe-zone]');
          if (!btn) return;
          var zone = btn.getAttribute('data-guohe-zone');
          var cardId = btn.getAttribute('data-guohe-card-id');
          var result = Engine.resolvePendingChoice(game, { zone: zone, cardId: cardId });
          if (!result.ok) renderLog();
          render();
        }
        if (els.guohePickEquipment) els.guohePickEquipment.addEventListener('click', handleGuohePickClick);
        if (els.guohePickHand) els.guohePickHand.addEventListener('click', handleGuohePickClick);
        // v8 PR-A5: 五谷丰登挑牌面板
        if (els.wuguPickChoices) els.wuguPickChoices.addEventListener('click', function (event) {
          var btn = event.target.closest('[data-wugu-card-id]');
          if (!btn) return;
          var cardId = btn.getAttribute('data-wugu-card-id');
          var result = Engine.resolvePendingChoice(game, { cardId: cardId });
          if (!result.ok) renderLog();
          render();
        });
        // v8 hotfix-2: 洛神 continue / stop 按钮
        if (els.luoshenContinueBtn) els.luoshenContinueBtn.addEventListener('click', function () {
          var result = Engine.resolvePendingChoice(game, {});
          if (!result.ok) renderLog();
          render();
        });
        if (els.luoshenStopBtn) els.luoshenStopBtn.addEventListener('click', function () {
          var result = Engine.resolvePendingChoice(game, { decline: true });
          if (!result.ok) renderLog();
          render();
        });
        // v9 PR-E8: splash click → lobby; lobby 1V1 → setup; KOF/炼狱 placeholder.
        if (els.splashEnterBtn) els.splashEnterBtn.addEventListener('click', showLobby);
        if (els.splashScreen) els.splashScreen.addEventListener('click', function (e) {
          if (e.target === els.splashEnterBtn) return;
          showLobby();
        });
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
        if (els.exitConfirmYesBtn) els.exitConfirmYesBtn.addEventListener('click', function () {
          closeExitConfirm();
          showSetup();
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
        // v8 PR-A2: 濒死救援面板
        if (els.dyingRescueChoices) els.dyingRescueChoices.addEventListener('click', function (event) {
          var btn = event.target.closest('[data-dying-rescue-card-id]');
          if (!btn) return;
          var cardId = btn.getAttribute('data-dying-rescue-card-id');
          var result = Engine.resolvePendingChoice(game, { cardId: cardId });
          if (!result.ok) renderLog();
          render();
        });
        if (els.dyingRescueDeclineBtn) els.dyingRescueDeclineBtn.addEventListener('click', function () {
          var result = Engine.resolvePendingChoice(game, { decline: true });
          if (!result.ok) renderLog();
          render();
        });
        if (els.yijiCandidates) els.yijiCandidates.addEventListener('click', function (event) {
          var btn = event.target.closest('[data-yiji-card-id]');
          if (!btn) return;
          var id = btn.getAttribute('data-yiji-card-id');
          var idx = yijiGiveSelection.indexOf(id);
          if (idx >= 0) yijiGiveSelection.splice(idx, 1);
          else yijiGiveSelection.push(id);
          render();
        });
        if (els.yijiConfirmBtn) els.yijiConfirmBtn.addEventListener('click', function () {
          Engine.resolvePendingChoice(game, { giveIds: yijiGiveSelection.slice() });
          yijiGiveSelection = [];
          render();
        });
        if (els.yijiKeepAllBtn) els.yijiKeepAllBtn.addEventListener('click', function () {
          Engine.resolvePendingChoice(game, { giveIds: [] });
          yijiGiveSelection = [];
          render();
        });
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
      // v9 PR-E8: 启动从 splash 屏开始, 点击进 lobby, 选 1V1 进 setup
      showSplash();
