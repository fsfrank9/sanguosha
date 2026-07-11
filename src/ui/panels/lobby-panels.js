      function heroPackLabel(pack) {
        var labels = { standard: '标准', wind: '风', forest: '林', fire: '火', mountain: '山', sp: 'SP' };
        return labels[pack] || pack || '扩展';
      }

      function heroSortKey(hero) {
        var order = { standard: 1, wind: 2, forest: 3, fire: 4, mountain: 5, sp: 6 };
        return String(order[hero.pack] || 9) + '-' + hero.camp + '-' + hero.name;
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

        return {
          heroPackLabel: heroPackLabel,
          heroSortKey: heroSortKey,
          fillHeroSelect: fillHeroSelect,
          renderHeroPickGrid: renderHeroPickGrid
        };
      }
