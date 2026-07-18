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
            // v13 L1: 身份场可选身份 — 我方提示泛化为任意身份 ('随机' 专属
            // 文案); 敌方席在身份场不再写死反贼 (实际身份随轮转)。duel 双态
            // 文案逐字保留。
            if (state.identityMode) {
              // v13 二批-4: 号位制 — 自己显身份+号位, 其他席按号位报导
              // (主公=1号位公开标注, 其余暗身份不泄漏)。
              var numText = state.seatNumber ? state.seatNumber + '号位' : '';
              els.heroPickPrompt.textContent = currentPickSide === 'player'
                ? (sideRole === '随机' ? '身份随机' : '您是' + sideRole) + (numText ? '（' + numText + '）' : '') + '，请选将'
                : '请为' + (numText || '下一') + (state.seatIsLord ? '（主公）' : '') + '选将';
            } else {
              els.heroPickPrompt.textContent = currentPickSide === 'player'
                ? (sideRole === '主公' ? '您是主公，请选将' : '您是反贼，请选将')
                : (sideRole === '主公' ? '请为对手 (主公) 选将' : '请为对手 (反贼) 选将');
            }
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

        // v13 L1: 黄天玩家主动交牌按钮回归 — v12 H 复核曾以"固定预设玩家
        // 恒主公 → 按钮 100% 不可达"为由移除 (死代码), 可选身份落地后
        // "玩家为群势力非主公 + 场上有持黄天的非敌对 AI 主公"真实可达。
        // 黄天是"全场型主公技"(不在群势力英雄自身 skills 表), 独立渲染;
        // 点击经既有 data-skill-id 分发 → usePlayerSkill('huangtian') →
        // cardSkillConfig 选牌框架 (孤儿配置就此接通)。敌对身份 (反贼/
        // 内奸) 不显示 — 引擎 triggerHuangtianActiveSkill 亦按 isHostileSeat
        // 拒绝, 此处口径与引擎一致 (忠臣与主公同阵营才非敌对)。
        function huangtianAidButtonHtml(state, game, enemyThinking) {
          if (!game || game.mode !== 'identity3' || !game.roles || !game.roleSides) return '';
          if (!state || state.camp !== '群') return '';
          if (game.roles.player === '主公') return '';
          if (game.roleSides[game.roles.player] !== 'lordSide') return '';
          if (state.flags && state.flags.huangtianUsed) return '';
          var lordSeat = (game.seats || []).find(function (seat) {
            var st = game[seat];
            return seat !== 'player' && st && st.hp > 0
              && game.roles[seat] === '主公'
              && (st.skills || []).some(function (s) { return s.id === 'huangtian'; });
          });
          if (!lordSeat) return '';
          var hasGivable = (state.hand || []).some(function (c) { return c.type === 'shan' || c.type === 'shandian'; });
          var active = game.turn === 'player' && game.phase === 'play'
            && !enemyThinking && !game.winner && hasGivable && state.hp > 0;
          return '<button class="mini-card skill-button" data-skill-id="huangtian" '
            + (active ? '' : 'disabled')
            + ' title="黄天：每回合限一次，将一张【闪】或【闪电】交给主公张角">黄天·交牌</button>';
        }

        function renderPlayerSkillBar(ctx) {
          if (!els.playerSkillBar) return;
          var state = ctx.state;
          var html = (state.skills || []).map(function (skill) {
            return skillButtonHtml(skill, state, ctx.game, ctx.enemyThinking);
          }).join('');
          // v13 L1: 黄天全场型按钮附加在英雄自身技能之后 (条件不满足时为空串)。
          html += huangtianAidButtonHtml(state, ctx.game, ctx.enemyThinking);
          els.playerSkillBar.innerHTML = html || '<span class="mini-card">无技能</span>';
        }

        return {
          heroPackLabel: heroPackLabel,
          heroSortKey: heroSortKey,
          fillHeroSelect: fillHeroSelect,
          renderHeroPickGrid: renderHeroPickGrid,
          renderPlayerSkillBar: renderPlayerSkillBar
        };
      }
