  // v12 F6: 战场渲染域 — 英雄区/手牌/战报日志/中央状态栏/阶段条/装备判定区
  // 的纯渲染函数群, 自 dom-adapter.js 迁出。可变 UI 状态 (game/选择态) 经
  // renderBoard(view)/renderLog(view) 按次传入 (同 F4 lobby-panels 房规),
  // 迁移文本除 view.* 前缀外逐行一致。稳定依赖 (els/Engine/工具/面板) 经
  // createBoardPanels(ctx) 注入。
  export function createBoardPanels(ctx) {
    var els = ctx.els;
    var Engine = ctx.Engine;
    var escapeHtml = ctx.escapeHtml;
    var lobbyPanels = ctx.lobbyPanels;
    var cardSkillConfig = ctx.cardSkillConfig;
    var _firstVisibleDispatch = ctx.firstVisibleDispatch;
    var view = null;

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

      function renderHero(actor) {
        var state = view.game[actor];
        els[actor + 'Name'].textContent = state.name;
        els[actor + 'Camp'].textContent = state.camp + ' · ' + state.title;
        els[actor + 'Quote'].textContent = state.quote;
        els[actor + 'Hp'].innerHTML = hpMarkup(state);
        els[actor + 'HandCount'].textContent = state.hand.length;
        els[actor + 'Hero'].setAttribute('data-camp', state.camp);
        els[actor + 'Hero'].classList.toggle('is-chained', !!state.chained);
        // v9 PR-E4: 主公徽章 — 由 view.game.roles[actor] === '主公' 决定显隐.
        // v9 PR-E14: 反贼徽章 — 同样由 view.game.roles[actor] === '反贼' 决定显隐.
        //   用户反馈: 之前只显主公不显反贼, 信息不对称.
        var role = view.game && view.game.roles && view.game.roles[actor];
        var lordBadge = els[actor + 'LordBadge'];
        if (lordBadge) lordBadge.hidden = role !== '主公';
        var rebelBadge = els[actor + 'RebelBadge'];
        if (rebelBadge) rebelBadge.hidden = role !== '反贼';
        if (els[actor + 'Ribbon']) els[actor + 'Ribbon'].textContent = state.camp;
        if (actor === 'player') {
          lobbyPanels.renderPlayerSkillBar({
            state: state,
            game: view.game,
            enemyThinking: view.enemyThinking
          });
        }
      }

      function playerCardAction(card) {
        var normal = Engine.canPlayCard(view.game, 'player', card);
        // v11 C4 (批次 28): 转化候选泛化 — 杀/乐不思蜀/过河拆桥 统一探测,
        // 面板据 conversions 动态列按钮; 唯一候选时直接按该 asType 转化。
        var conversions = Engine.listCardConversions(view.game, 'player', card);
        if (normal.ok && conversions.length) {
          return { mode: 'choice', playable: { ok: true, message: '可按原牌使用，也可发动技能转化使用。' }, normal: normal, conversions: conversions };
        }
        if (normal.ok) return { mode: 'normal', playable: normal };
        if (conversions.length === 1 && conversions[0].asType === 'sha') {
          return { mode: 'asSha', playable: conversions[0].playable };
        }
        if (conversions.length === 1) {
          return { mode: 'convert', playable: conversions[0].playable, asType: conversions[0].asType };
        }
        if (conversions.length > 1) {
          return { mode: 'choice', playable: { ok: true, message: '选择要发动的转化技能。' }, conversions: conversions };
        }
        return { mode: 'blocked', playable: normal };
      }

      function activeCardSkillConfig() {
        return cardSkillConfig(view.skillSelectMode);
      }

      function cardButton(card) {
        var disabled = view.game.turn !== 'player' || view.game.phase === 'gameover' || view.enemyThinking;
        var discardMode = view.game.turn === 'player' && view.game.phase === 'discard' && Engine.needsDiscard(view.game, 'player') && !view.enemyThinking;
        var cardSkill = view.game.turn === 'player' && view.game.phase === 'play' && !view.enemyThinking ? activeCardSkillConfig() : null;
        // v9 PR-E16: play-confirm 选中态 (view.selectedHandCardId) 也走 .discard-selected
        // class 高亮 (复用现有样式, 避免新增 CSS).
        var selected = view.selectedDiscardIds.indexOf(card.id) >= 0 ||
                       view.selectedSkillCardIds.indexOf(card.id) >= 0 ||
                       (view.selectedHandCardId === card.id);
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
        if (!view.game.player.hand.length) {
          els.playerHand.innerHTML = '<div class="empty-hand">你没有手牌了。结束回合等待摸牌吧。</div>';
          return;
        }
        els.playerHand.innerHTML = view.game.player.hand.map(cardButton).join('');
      }

      function renderPhaseTrack() {
        if (!els.phaseTrack) return;
        Array.from(els.phaseTrack.querySelectorAll('[data-phase]')).forEach(function (step) {
          step.classList.toggle('active', step.getAttribute('data-phase') === view.game.phase);
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
        els.log.innerHTML = view.game.log.slice(-36).map(function (entry) {
          return '<div class="log-entry">' + escapeHtml(entry) + '</div>';
        }).join('');
        scrollLogToBottom();
        renderLogOverlay();
      }

      // v9 PR-E2: 中央日志 overlay — 渲染最近 6 条到大字 overlay.
      // 包含"阶段"或"回合"关键词的条目用 phase 高亮色 (浅金).
      function renderLogOverlay() {
        if (!els.logOverlay || !view.game) return;
        var recent = view.game.log.slice(-6);
        els.logOverlay.innerHTML = recent.map(function (entry) {
          var isPhase = /阶段|回合开始|回合结束/.test(entry);
          var cls = 'log-overlay__entry' + (isPhase ? ' log-overlay__entry--phase' : '');
          return '<div class="' + cls + '">' + escapeHtml(entry) + '</div>';
        }).join('');
      }

      function stateStatusMarkup(actor, base) {
        var chained = view.game && view.game[actor] && view.game[actor].chained;
        return escapeHtml(base) + (chained ? ' <span class="badge chain-status">铁索横置</span>' : '');
      }

      function renderStatus() {
        var isGameOver = view.game.phase === 'gameover';
        var isPlayerTurn = view.game.turn === 'player';
        var discardNeeded = isPlayerTurn && view.game.phase === 'discard' && Engine.needsDiscard(view.game, 'player');
        var title = '';
        var text = '';

        if (isGameOver) {
          title = view.game.winner === 'player' ? '胜利！' : '败北……';
          text = view.game.winner === 'player' ? '你平定了这场乱世对决。点击“新开一局”再战。' : '电脑赢下了这一局。调整出牌顺序再来一次。';
        } else if (discardNeeded) {
          title = '弃牌阶段';
          text = '你的手牌超过体力上限。点选需要弃置的牌，然后确认弃牌。';
        } else if (isPlayerTurn) {
          title = view.game.phase === 'finish' ? '结束阶段' : '你的回合';
          text = view.game.player.usedSha ? '你本回合已经出过【杀】，可以使用锦囊/桃，或结束回合。' : '点击手牌出牌。建议先用【无中生有】或【酒】，再寻找进攻机会。';
        } else {
          title = view.enemyThinking ? '电脑思考中' : '电脑回合';
          text = '电脑会按准备、判定、摸牌、出牌、弃牌、结束阶段自动行动。';
        }

        els.statusTitle.textContent = title;
        els.statusText.textContent = text;
        var deckText = '牌堆 ' + view.game.deck.length + ' · 弃牌 ' + view.game.discard.length;
        els.deckInfo.textContent = deckText;
        // v9 PR-E15: 用户反馈数字应在 "武将技能卡最右边往上一点".
        if (els.playerSkillDeckInfo) els.playerSkillDeckInfo.textContent = deckText;
        if (els.handDiscardBtn) {
          els.handDiscardBtn.disabled = !isPlayerTurn || isGameOver || view.enemyThinking;
          els.handDiscardBtn.textContent = view.game.phase === 'play' ? '结束出牌' : '结束回合';
        }
        // v9 PR-E16: hand-confirm / hand-cancel 启用条件
        // confirm: 有 visible modal 注册 / 有 view.selectedHandCardId / 弃牌阶段已选够
        // cancel: 有 visible modal 注册 / 有 view.selectedHandCardId / 弃牌阶段已选
        var pendingDispatch = _firstVisibleDispatch();
        var canConfirm = false;
        var canCancel = false;
        if (view.stagedModalChoice) {
          // v9 PR-E23: 二级面板已 stage 一个候选 → 确认 提交, 取消 撤销.
          canConfirm = true;
          canCancel = true;
        } else if (pendingDispatch) {
          canConfirm = !!(pendingDispatch.confirmBtnId && els[pendingDispatch.confirmBtnId] &&
                          !els[pendingDispatch.confirmBtnId].hidden && !els[pendingDispatch.confirmBtnId].disabled);
          canCancel = !!(pendingDispatch.cancelBtnId && els[pendingDispatch.cancelBtnId] &&
                         !els[pendingDispatch.cancelBtnId].hidden && !els[pendingDispatch.cancelBtnId].disabled);
        } else if (isPlayerTurn && !isGameOver && !view.enemyThinking) {
          if (discardNeeded) {
            canConfirm = view.selectedDiscardIds.length >= Engine.getDiscardCount(view.game, 'player');
            canCancel = view.selectedDiscardIds.length > 0;
          } else {
            canConfirm = !!view.selectedHandCardId;
            canCancel = !!view.selectedHandCardId;
          }
        }
        if (els.handConfirmBtn) els.handConfirmBtn.disabled = !canConfirm;
        if (els.handCancelBtn) els.handCancelBtn.disabled = !canCancel;
        els.handHint.textContent = discardNeeded ? ('弃牌：已选 ' + view.selectedDiscardIds.length + ' / ' + Engine.getDiscardCount(view.game, 'player')) : (isPlayerTurn && !isGameOver ? (view.selectedHandCardId ? '已选, 点"确认"使用' : '点击卡牌选中, 再按"确认"') : '等待回合');
        if (els.confirmDiscardBtn) {
          els.confirmDiscardBtn.hidden = !discardNeeded;
          els.confirmDiscardBtn.disabled = !discardNeeded || view.selectedDiscardIds.length < Engine.getDiscardCount(view.game, 'player');
        }
        els.playerState.innerHTML = stateStatusMarkup('player', isGameOver ? (view.game.winner === 'player' ? '胜利' : '败北') : (isPlayerTurn ? '行动' : '等待'));
        els.enemyState.innerHTML = stateStatusMarkup('enemy', isGameOver ? (view.game.winner === 'enemy' ? '胜利' : '败北') : (!isPlayerTurn ? '行动' : '等待'));
        // v9 PR-E14: 之前默认显示 "电脑" / "玩家" 是冗余信息 (1v1 位置一目了然),
        // 而且 turn-badge 在 hero-head 右侧与右上 lord/rebel-badge 重叠造成文字
        // 被遮挡. 改成: 仅 "当前回合" 时显示, 其余 hidden.
        var playerTurnActive = isPlayerTurn && !isGameOver;
        var enemyTurnActive = !isPlayerTurn && !isGameOver;
        els.playerTurnBadge.textContent = playerTurnActive ? '当前回合' : '';
        els.playerTurnBadge.hidden = !playerTurnActive;
        els.enemyTurnBadge.textContent = enemyTurnActive ? '当前回合' : '';
        els.enemyTurnBadge.hidden = !enemyTurnActive;
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
          var selected = view.selectedSkillCardIds.indexOf(card.id) >= 0;
          return '<button class="mini-card zhiheng-equip-pick' + (selected ? ' selected' : '') +
            '" data-card-id="' + escapeHtml(card.id) + '" title="点击切换是否弃置（含装备）">' +
            escapeHtml(card.name) + (selected ? ' ✓' : '') + '</button>';
        }).join('');
      }

      function renderZones() {
        if (els.playerEquipmentArea) {
          els.playerEquipmentArea.innerHTML = view.skillSelectMode === 'zhiheng'
            ? playerEquipmentForZhiheng(view.game.player.equipment)
            : equipmentCards(view.game.player.equipment);
        }
        if (els.enemyEquipmentArea) els.enemyEquipmentArea.innerHTML = equipmentCards(view.game.enemy.equipment);
        if (els.playerJudgeArea) els.playerJudgeArea.innerHTML = zoneCards(view.game.player.judgeArea, '空');
        if (els.enemyJudgeArea) els.enemyJudgeArea.innerHTML = zoneCards(view.game.enemy.judgeArea, '空');
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

    function renderBoard(viewState) {
      view = viewState;
      renderHero('player');
      renderHero('enemy');
      renderHand();
      renderLog();
      renderStatus();
      renderPhaseTrack();
      renderZones();
      els.enemyHandBacks.innerHTML = miniBacks(view.game.enemy.hand.length);
    }

    function renderLogWithView(viewState) {
      view = viewState;
      renderLog();
    }

    return {
      renderBoard: renderBoard,
      renderLog: renderLogWithView,
      suitLabel: suitLabel,
      suitRankBadge: suitRankBadge,
      suitColorClass: suitColorClass,
      activeCardSkillConfig: function (viewState) { view = viewState; return activeCardSkillConfig(); },
      playerCardAction: function (viewState, card) { view = viewState; return playerCardAction(card); }
    };
  }
