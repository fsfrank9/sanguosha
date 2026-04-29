    (function () {
      'use strict';

      var Engine = window.SanguoshaEngine;
      var game = null;
      var enemyThinking = false;
      var selectedDiscardIds = [];
      var pendingTiesuoCardId = null;
      var pendingTargetCardId = null;
      var pendingTargetZone = null;
      var pendingHuogongCardId = null;
      var pendingConversionCardId = null;
      var pendingGuanxingOrderIds = [];
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
          'guanxingHint', 'guanxingChoices', 'guanxingReverseBtn', 'guanxingConfirmBtn', 'guanxingCancelBtn', 'zhihengModePanel',
          'zhihengConfirmBtn', 'zhihengCancelBtn', 'zhihengHint', 'roleDraftPanel',
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

      function renderHero(actor) {
        var state = game[actor];
        els[actor + 'Name'].textContent = state.name;
        els[actor + 'Camp'].textContent = state.camp + ' · ' + state.title;
        els[actor + 'Quote'].textContent = state.quote;
        els[actor + 'Hp'].innerHTML = hpMarkup(state);
        els[actor + 'HandCount'].textContent = state.hand.length;
        els[actor + 'Hero'].setAttribute('data-camp', state.camp);
        els[actor + 'Hero'].classList.toggle('is-chained', !!state.chained);
        if (els[actor + 'Ribbon']) els[actor + 'Ribbon'].textContent = state.camp;
        if (actor === 'player' && els.playerSkillBar) {
          els.playerSkillBar.innerHTML = (state.skills || []).map(function (skill) {
            var isActiveSkill = Engine.ACTIVE_SKILL_IDS.indexOf(skill.id) >= 0;
            var active = game.turn === 'player' && game.phase === 'play' && !enemyThinking && !game.winner && isActiveSkill && skill.status === 'implemented';
            if (skill.id === 'zhiheng' && state.flags && state.flags.zhihengUsed) active = false;
            if (skill.id === 'fanjian' && state.flags && state.flags.fanjianUsed) active = false;
            if (skill.id === 'guanxing' && state.flags && state.flags.guanxingUsed) active = false;
            if ((skill.id === 'rende' || skill.id === 'fanjian') && !state.hand.length) active = false;
            if (skill.id === 'kurou' && state.hp <= 1) active = false;
            var statusClass = skill.status ? ' skill-status-' + skill.status : '';
            var statusText = skill.statusText || (skill.status === 'todo' ? '未实现' : '');
            var label = skill.name + (skill.status === 'todo' ? '·未实现' : '');
            var title = (skill.desc || '') + (statusText ? '｜' + statusText : '');
            return '<button class="mini-card skill-button' + statusClass + '" data-skill-id="' + escapeHtml(skill.id) + '" ' + (active ? '' : 'disabled') + ' title="' + escapeHtml(title) + '">' + escapeHtml(label) + '</button>';
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
      }

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
        return cards.map(function (card) { return '<span class="mini-card">' + escapeHtml(card.name) + '</span>'; }).join('');
      }

      function equipmentCards(equipment) {
        var cards = [];
        ['weapon', 'armor', 'horseMinus', 'horsePlus'].forEach(function (slot) {
          if (equipment && equipment[slot]) cards.push(equipment[slot]);
        });
        return zoneCards(cards, '未装备');
      }

      function renderZones() {
        if (els.playerEquipmentArea) els.playerEquipmentArea.innerHTML = equipmentCards(game.player.equipment);
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
        els.enemyHandBacks.innerHTML = miniBacks(game.enemy.hand.length);
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

      function guanxingCardMarkup(card, index) {
        return '<span class="mini-card" data-guanxing-card-id="' + escapeHtml(card.id) + '">' + (index + 1) + '.【' + escapeHtml(card.name) + '】' + escapeHtml(suitName(card.suit)) + '</span>';
      }

      function renderGuanxingChoices() {
        if (!els.guanxingChoices || !game) return;
        var preview = Engine.getGuanxingPreview(game, 'player');
        if (!preview.ok) {
          els.guanxingChoices.innerHTML = '<span class="mini-card">' + escapeHtml(preview.message) + '</span>';
          return;
        }
        var byId = {};
        preview.cards.forEach(function (card) { byId[card.id] = card; });
        var ordered = pendingGuanxingOrderIds.map(function (id) { return byId[id]; }).filter(Boolean);
        els.guanxingChoices.innerHTML = ordered.length ? ordered.map(guanxingCardMarkup).join('') : '<span class="mini-card">牌堆顶没有可观星的牌</span>';
      }

      function showGuanxingPanel() {
        var preview = Engine.getGuanxingPreview(game, 'player');
        if (!preview.ok) {
          game.log.push(preview.message);
          render();
          return;
        }
        pendingGuanxingOrderIds = preview.cards.map(function (card) { return card.id; });
        if (els.guanxingModePanel) els.guanxingModePanel.hidden = false;
        if (els.guanxingHint) els.guanxingHint.textContent = '观星：当前显示牌堆顶 ' + preview.cards.length + ' 张，可逆序后确认';
        renderGuanxingChoices();
        if (els.handHint) els.handHint.textContent = '观星：查看牌堆顶牌，确认前可点“逆序调整”';
      }

      function hideGuanxingPanel() {
        pendingGuanxingOrderIds = [];
        if (els.guanxingModePanel) els.guanxingModePanel.hidden = true;
        if (els.guanxingHint) els.guanxingHint.textContent = '观星：预览牌堆顶牌';
        if (els.guanxingChoices) els.guanxingChoices.innerHTML = '<span class="mini-card">发动观星后显示牌堆顶牌</span>';
      }

      function reverseGuanxingOrder() {
        pendingGuanxingOrderIds.reverse();
        renderGuanxingChoices();
      }

      function confirmGuanxing() {
        if (!game || !pendingGuanxingOrderIds.length) return;
        var result = Engine.useSkill(game, 'player', 'guanxing', [], { orderIds: pendingGuanxingOrderIds });
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
        if (skillId === 'guanxing') {
          showGuanxingPanel();
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
        if (els.setupScreen) els.setupScreen.hidden = false;
        if (els.duelTable) els.duelTable.hidden = true;
        if (els.endTurnBtn) els.endTurnBtn.disabled = true;
        if (els.newGameBtn) els.newGameBtn.textContent = '重新选将';
        populateHeroSelects();
        ensureDistinctHeroes('player');
        updateDraftUI();
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
        if (els.guanxingReverseBtn) els.guanxingReverseBtn.addEventListener('click', reverseGuanxingOrder);
        if (els.guanxingConfirmBtn) els.guanxingConfirmBtn.addEventListener('click', confirmGuanxing);
        if (els.guanxingCancelBtn) els.guanxingCancelBtn.addEventListener('click', function () { hideGuanxingPanel(); render(); });
        if (els.targetCancelBtn) els.targetCancelBtn.addEventListener('click', function () { hideTargetZonePanel(); render(); });
        if (els.zhihengConfirmBtn) els.zhihengConfirmBtn.addEventListener('click', confirmCardSkill);
        if (els.zhihengCancelBtn) els.zhihengCancelBtn.addEventListener('click', function () { exitSkillSelectMode(); render(); });
        if (els.playerSkillBar) els.playerSkillBar.addEventListener('click', function (event) {
          var skill = event.target.closest('[data-skill-id]');
          if (!skill || skill.disabled) return;
          usePlayerSkill(skill.getAttribute('data-skill-id'));
        });
      }

      initElements();
      populateHeroSelects();
      bindEvents();
      showSetup();
    }());
