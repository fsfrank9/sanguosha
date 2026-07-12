      function heroPackLabel(pack) {
        var labels = { standard: '标准', wind: '风', forest: '林', fire: '火', mountain: '山', sp: 'SP' };
        return labels[pack] || pack || '扩展';
      }

      function heroSortKey(hero) {
        var order = { standard: 1, wind: 2, forest: 3, fire: 4, mountain: 5, sp: 6 };
        return String(order[hero.pack] || 9) + '-' + hero.camp + '-' + hero.name;
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

      export function createLobbyPanels(deps) {
        var Engine = deps.Engine;
        var escapeHtml = deps.escapeHtml;
        var els = deps.els;

        function sortedHeroes() {
          return Object.keys(Engine.HERO_CATALOG).map(function (id) { return Engine.HERO_CATALOG[id]; })
            .sort(function (a, b) { return heroSortKey(a).localeCompare(heroSortKey(b), 'zh-Hans-CN'); });
        }

        function heroOptionHtml(hero) {
          return '<option value="' + escapeHtml(hero.id) + '">' + escapeHtml('[' + heroPackLabel(hero.pack) + '] ' + hero.name + ' · ' + hero.camp + ' · ' + (hero.skills || []).map(function (skill) { return skill.name; }).join('/')) + '</option>';
        }

        function fillHeroSelect(select, selected, fallback) {
          select.innerHTML = sortedHeroes().map(heroOptionHtml).join('');
          select.value = Engine.HERO_CATALOG[selected] ? selected : fallback;
        }

        function heroPickGridHtml(state) {
          var currentPickSide = state.currentPickSide;
          var playerVal = state.playerVal || '';
          var enemyVal = state.enemyVal || '';
          return sortedHeroes().map(function (hero) {
            var classes = ['hero-pick-card', 'hero-pick-card--camp-' + (hero.camp || '?')];
            var isPlayerPicked = hero.id === playerVal && playerVal !== '';
            var isEnemyPicked = hero.id === enemyVal && enemyVal !== '';
            if (isPlayerPicked) classes.push('is-player-selected');
            if (isEnemyPicked) classes.push('is-enemy-selected');
            var locked = (currentPickSide === 'player' && isEnemyPicked)
                      || (currentPickSide === 'enemy' && isPlayerPicked);
            if (locked) classes.push('is-locked');
            return '<button type="button" class="' + classes.join(' ') + '" data-hero-id="' + escapeHtml(hero.id) + '"' + (locked ? ' disabled' : '') + '>'
              + '<span class="hero-pick-card__camp">' + escapeHtml(hero.camp || '?') + '</span>'
              + '<span class="hero-pick-card__name">' + escapeHtml(hero.name) + '</span>'
              + '</button>';
          }).join('');
        }

        function updateHeroPickChrome(state) {
          var currentPickSide = state.currentPickSide;
          var playerVal = state.playerVal || '';
          var enemyVal = state.enemyVal || '';
          if (els.heroPickPlayerValue) {
            var pH = playerVal ? Engine.HERO_CATALOG[playerVal] : null;
            els.heroPickPlayerValue.textContent = pH ? pH.name : '未选';
          }
          if (els.heroPickEnemyValue) {
            var eH = enemyVal ? Engine.HERO_CATALOG[enemyVal] : null;
            els.heroPickEnemyValue.textContent = eH ? eH.name : '未选';
          }
          if (els.heroPickPlayerTab) {
            els.heroPickPlayerTab.hidden = (currentPickSide !== 'player');
            els.heroPickPlayerTab.classList.toggle('is-active', currentPickSide === 'player');
          }
          if (els.heroPickEnemyTab) {
            els.heroPickEnemyTab.hidden = (currentPickSide !== 'enemy');
            els.heroPickEnemyTab.classList.toggle('is-active', currentPickSide === 'enemy');
          }
          if (els.randomPlayerHeroBtn) els.randomPlayerHeroBtn.hidden = (currentPickSide !== 'player');
          if (els.randomEnemyHeroBtn) els.randomEnemyHeroBtn.hidden = (currentPickSide !== 'enemy');
          if (els.heroPickPrompt) {
            var sideRole = currentPickSide === 'player' ? state.playerRole : state.enemyRole;
            els.heroPickPrompt.textContent = currentPickSide === 'player'
              ? (sideRole === '主公' ? '您是主公，请选将' : '您是反贼，请选将')
              : (sideRole === '主公' ? '请为对手 (主公) 选将' : '请为对手 (反贼) 选将');
          }
        }

        function renderHeroPickGrid(state) {
          if (!els.heroPickGrid) return;
          els.heroPickGrid.innerHTML = heroPickGridHtml(state);
          updateHeroPickChrome(state);
        }

        function skillButtonHtml(skill, state, game, enemyThinking) {
          var isActiveSkill = Engine.ACTIVE_SKILL_IDS.indexOf(skill.id) >= 0;
          var active = game.turn === 'player' && game.phase === 'play' && !enemyThinking && !game.winner && isActiveSkill && skill.status === 'implemented';
          if (skill.id === 'zhiheng' && state.flags && state.flags.zhihengUsed) active = false;
          if (skill.id === 'fanjian' && state.flags && state.flags.fanjianUsed) active = false;
          if (skill.id === 'guanxing' && state.flags && state.flags.guanxingUsed) active = false;
          if ((skill.id === 'rende' || skill.id === 'fanjian') && !state.hand.length) active = false;
          if (skill.id === 'kurou' && state.hp <= 0) active = false;
          var statusClass = skill.status ? ' skill-status-' + skill.status : '';
          var statusText = skill.statusText || (skill.status === 'todo' ? '未实现' : '');
          var label = skill.name + (skill.status === 'todo' ? '·未实现' : '');
          var title = formatSkillTooltip(skill, statusText);
          var dataAttrs = '';
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
        }

        // v12 H6: 黄天 (张角主公技) — 技能挂在张角身上, 但由其他群势力座席
        // 发动 (LORD_WIDE_SKILLS 网关, 见 game-engine.js useSkill)。发动者
        // 自己的 state.skills 里没有这条, 正常按 state.skills 渲染永远不会
        // 出现按钮, 需要额外判定后注入合成技能项。条件: identity3 + 玩家是
        // 群势力 + 场上存在另一名持有 huangtian 的主公。
        function huangtianButtonAvailable(game, state) {
          if (!game || game.mode !== 'identity3' || !state || state.camp !== '群' || !Engine.seatList) return false;
          return Engine.seatList(game).some(function (seat) {
            var seatState = game[seat];
            return seatState && seatState !== state && seatState.hp > 0
              && game.roles && game.roles[seat] === '主公'
              && (seatState.skills || []).some(function (sk) { return sk && sk.id === 'huangtian'; });
          });
        }

        function renderPlayerSkillBar(ctx) {
          if (!els.playerSkillBar) return;
          var state = ctx.state;
          var skillList = (state.skills || []).slice();
          if (huangtianButtonAvailable(ctx.game, state)) {
            skillList.push({ id: 'huangtian', name: '黄天', desc: '主公技：可将一张【闪】或【闪电】交给主公张角（每回合限一次）。', lord: true, status: 'implemented' });
          }
          els.playerSkillBar.innerHTML = skillList.map(function (skill) {
            return skillButtonHtml(skill, state, ctx.game, ctx.enemyThinking);
          }).join('') || '<span class="mini-card">无技能</span>';
        }

        return {
          heroPackLabel: heroPackLabel,
          heroSortKey: heroSortKey,
          fillHeroSelect: fillHeroSelect,
          renderHeroPickGrid: renderHeroPickGrid,
          renderPlayerSkillBar: renderPlayerSkillBar
        };
      }
