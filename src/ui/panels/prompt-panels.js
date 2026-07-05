  // v11 B2: 提示类面板模块 — renderPendingChoice 中除响应三面板外的全部
  // pendingChoice 面板 (鬼才/遗计/反间/反馈/刚烈x2/雌雄x2/麒麟/贯石斧/
  // 火攻展示/借刀/过河/五谷/洛神/濒死救援) 的渲染 + 事件绑定, 从
  // dom-adapter.js 整体迁出, 渲染函数体逐行一致; 点候选提交经注入的
  // stage() 助手 (语义同原 stagedModalChoice 赋值 + render)。
  // 面板本地多选态 (yiji/ganglie/guanshi) 随面板迁入本模块。
  export function createPromptPanels(ctx) {
    var els = ctx.els;
    var Engine = ctx.Engine;
    var getGame = ctx.getGame;
    var render = ctx.render;
    var renderLog = ctx.renderLog;
    var escapeHtml = ctx.escapeHtml;
    var suitLabel = ctx.suitLabel;
    var stage = ctx.stage;
    var promptCardChoice = ctx.promptCardChoice;
    var actorDisplayName = ctx.actorDisplayName;

    var yijiGiveSelection = [];
    var ganglieSelectedIds = [];
    var guanshiDiscardSelection = [];

    function renderPromptPanels(kind, pending) {
      var game = getGame();
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
    // (观星模式面板状态仍在主 adapter, 其渲染保留在 renderPendingChoice; 批次三迁移)
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
    // 审计二轮 PR-8: 贯石斧 — 杀被闪后, 玩家自选两张牌 (手牌/装备) 弃置
    // 令【杀】强制命中, 或不发动。
    if (els.guanshiDiscardPanel) {
      if (kind === 'guanshi-discard' && pending.actor === 'player') {
        els.guanshiDiscardPanel.hidden = false;
        var gsAllowedIds = (pending.handIds || []).concat((pending.equipment || []).map(function (e) { return e.cardId; }));
        guanshiDiscardSelection = guanshiDiscardSelection.filter(function (id) {
          return gsAllowedIds.indexOf(id) >= 0;
        });
        if (els.guanshiDiscardHint) {
          els.guanshiDiscardHint.textContent =
            '贯石斧：选 2 张牌弃置令【杀】强制命中（已选 ' + guanshiDiscardSelection.length + '/2），或不发动。';
        }
        if (els.guanshiDiscardChoices) {
          var gsHandHtml = (pending.handIds || []).map(function (cardId) {
            var card = (game.player.hand || []).find(function (c) { return c.id === cardId; });
            if (!card) return '';
            return promptCardChoice(card, {
              dataAttrs: { guanshiCardId: cardId },
              title: '切换选中：这张手牌作为贯石斧成本',
              selected: guanshiDiscardSelection.indexOf(cardId) >= 0,
              extraClass: 'guanshi-discard-choice'
            });
          }).join('');
          var gsEquipHtml = (pending.equipment || []).map(function (entry) {
            return promptCardChoice({ name: entry.name }, {
              dataAttrs: { guanshiCardId: entry.cardId },
              title: '切换选中：这件装备作为贯石斧成本',
              selected: guanshiDiscardSelection.indexOf(entry.cardId) >= 0,
              prefix: '装备 ',
              extraClass: 'guanshi-discard-choice'
            });
          }).join('');
          els.guanshiDiscardChoices.innerHTML = (gsHandHtml + gsEquipHtml)
            || '<span class="mini-card">没有可弃置的牌</span>';
        }
        if (els.guanshiConfirmBtn) els.guanshiConfirmBtn.disabled = guanshiDiscardSelection.length !== 2;
      } else {
        els.guanshiDiscardPanel.hidden = true;
        guanshiDiscardSelection = [];
      }
    }
    // 审计二轮 PR-8: 火攻 — 玩家为目标时自选展示哪张手牌 (官方: 展示是
    // 目标的选择)。必选面板: 点牌 stage 后经 hand-confirm 提交。
    if (els.huogongShowPanel) {
      if (kind === 'huogong-show' && pending.actor === 'player') {
        els.huogongShowPanel.hidden = false;
        if (els.huogongShowHint) {
          els.huogongShowHint.textContent =
            '火攻：选择展示一张手牌（对方弃同花色手牌才能造成 1 点火焰伤害）。';
        }
        if (els.huogongShowChoices) {
          els.huogongShowChoices.innerHTML = (pending.cardIds || []).map(function (cardId) {
            var card = (game.player.hand || []).find(function (c) { return c.id === cardId; });
            if (!card) return '';
            return promptCardChoice(card, {
              dataAttrs: { huogongShowCardId: cardId },
              title: '展示这张手牌',
              extraClass: 'huogong-show-choice'
            });
          }).join('') || '<span class="mini-card">没有手牌可展示</span>';
        }
      } else {
        els.huogongShowPanel.hidden = true;
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
    // v11 C7 (批次 31): 耀武 (yaowu-reward) — 玩家作为伤害来源二选一;
    // 体力满时回复不可选 (resolver 同步校验)。
    if (els.yaowuRewardPanel) {
      if (kind === 'yaowu-reward' && pending.actor === 'player') {
        els.yaowuRewardPanel.hidden = false;
        if (els.yaowuRewardHint) {
          els.yaowuRewardHint.textContent =
            '耀武：你对' + (pending.targetName || '华雄') + '造成了红色【杀】伤害，选择一项奖励。';
        }
        if (els.yaowuRecoverBtn) els.yaowuRecoverBtn.disabled = !pending.canRecover;
      } else {
        els.yaowuRewardPanel.hidden = true;
        if (els.yaowuRecoverBtn) els.yaowuRecoverBtn.disabled = false;
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

    function bindPromptPanels() {
    // v9 PR-E24: 响应/技能面板候选两步化 — 点候选只 stage (高亮),
    // #handConfirmBtn 才 resolvePendingChoice. selector 供 render 重建后重套高亮.
    if (els.guicaiCandidates) els.guicaiCandidates.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-guicai-card-id]');
      if (!btn) return;
      var cardId = btn.getAttribute('data-guicai-card-id');
      stage({ cardId: cardId }, '[data-guicai-card-id="' + cardId + '"]');
    });
    if (els.guicaiDeclineBtn) els.guicaiDeclineBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), { cardId: null });
      if (!result.ok) renderLog();
      render();
    });
    // 反间 (v6.1): 4 suit buttons. Each emits a fanjian-guess resolve.
    ['fanjianSpadeBtn', 'fanjianHeartBtn', 'fanjianClubBtn', 'fanjianDiamondBtn'].forEach(function (key) {
      var el = els[key];
      if (!el) return;
      el.addEventListener('click', function () {
        var suit = el.getAttribute('data-fanjian-suit');
        stage({ suit: suit }, '[data-fanjian-suit="' + suit + '"]');
      });
    });
    if (els.fankuiZones) els.fankuiZones.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-fankui-zone]');
      if (!btn) return;
      var zone = btn.getAttribute('data-fankui-zone');
      var cardId = btn.getAttribute('data-fankui-card-id') || null;
      stage({ zone: zone, cardId: cardId }, cardId ? '[data-fankui-card-id="' + cardId + '"]' : '[data-fankui-zone="' + zone + '"]');
    });
    // 刚烈 (v6.1): two prompts. ganglie-fire = yes/no for 夏侯惇 to
    // trigger judgement. ganglie-source-choice = source picks 2 cards
    // or takes 1 damage.
    if (els.ganglieFireBtn) els.ganglieFireBtn.addEventListener('click', function () {
      Engine.resolvePendingChoice(getGame(), { fire: true });
      render();
    });
    if (els.ganglieDeclineBtn) els.ganglieDeclineBtn.addEventListener('click', function () {
      Engine.resolvePendingChoice(getGame(), { fire: false });
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
      var result = Engine.resolvePendingChoice(getGame(), { mode: 'discard', cardIds: ids });
      if (!result.ok) renderLog();
      render();
    });
    if (els.ganglieSourceTakeDamageBtn) els.ganglieSourceTakeDamageBtn.addEventListener('click', function () {
      ganglieSelectedIds = [];
      var result = Engine.resolvePendingChoice(getGame(), { mode: 'takeDamage' });
      if (!result.ok) renderLog();
      render();
    });
    // v8 PR-A2: 麒麟弓 pick 面板
    if (els.qilinPickChoices) els.qilinPickChoices.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-qilin-slot]');
      if (!btn) return;
      var slot = btn.getAttribute('data-qilin-slot');
      stage({ slot: slot }, '[data-qilin-slot="' + slot + '"]');
    });
    if (els.qilinDeclineBtn) els.qilinDeclineBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), { decline: true });
      if (!result.ok) renderLog();
      render();
    });
    // 审计二轮 PR-8: 贯石斧 自选两张面板 — 点击切换选中, 凑满 2 张后确认
    if (els.guanshiDiscardChoices) els.guanshiDiscardChoices.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-guanshi-card-id]');
      if (!btn) return;
      var id = btn.getAttribute('data-guanshi-card-id');
      var idx = guanshiDiscardSelection.indexOf(id);
      if (idx >= 0) guanshiDiscardSelection.splice(idx, 1);
      else if (guanshiDiscardSelection.length < 2) guanshiDiscardSelection.push(id);
      render();
    });
    if (els.guanshiConfirmBtn) els.guanshiConfirmBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), { cardIds: guanshiDiscardSelection.slice() });
      guanshiDiscardSelection = [];
      if (!result.ok) renderLog();
      render();
    });
    if (els.guanshiDeclineBtn) els.guanshiDeclineBtn.addEventListener('click', function () {
      guanshiDiscardSelection = [];
      var result = Engine.resolvePendingChoice(getGame(), { decline: true });
      if (!result.ok) renderLog();
      render();
    });
    // 审计二轮 PR-8: 火攻 展示牌面板 — stage 后经 hand-confirm 提交
    if (els.huogongShowChoices) els.huogongShowChoices.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-huogong-show-card-id]');
      if (!btn) return;
      var cardId = btn.getAttribute('data-huogong-show-card-id');
      stage({ cardId: cardId }, '[data-huogong-show-card-id="' + cardId + '"]');
    });
    // v8 PR-A3: 雌雄 fire 面板
    if (els.cixiongFireBtn) els.cixiongFireBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), { fire: true });
      if (!result.ok) renderLog();
      render();
    });
    if (els.cixiongFireDeclineBtn) els.cixiongFireDeclineBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), { decline: true });
      if (!result.ok) renderLog();
      render();
    });
    // v8 PR-A3: 雌雄 choose 面板 — 弃手牌 / 让对方摸 1
    if (els.cixiongChooseChoices) els.cixiongChooseChoices.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-cixiong-discard-card-id]');
      if (!btn) return;
      var cardId = btn.getAttribute('data-cixiong-discard-card-id');
      stage({ option: 'discard', cardId: cardId }, '[data-cixiong-discard-card-id="' + cardId + '"]');
    });
    if (els.cixiongChooseDrawBtn) els.cixiongChooseDrawBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), { option: 'draw' });
      if (!result.ok) renderLog();
      render();
    });
    // v8 PR-A4: 借刀杀人决策面板
    if (els.jiedaoDecisionFireBtn) els.jiedaoDecisionFireBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), { fire: true });
      if (!result.ok) renderLog();
      render();
    });
    if (els.jiedaoDecisionDeclineBtn) els.jiedaoDecisionDeclineBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), { decline: true });
      if (!result.ok) renderLog();
      render();
    });
    // v8 PR-A4: 过河拆桥 1V1 面板 — equipment + hand 共享同一 click handler
    function handleGuohePickClick(event) {
      var btn = event.target.closest('[data-guohe-zone]');
      if (!btn) return;
      var zone = btn.getAttribute('data-guohe-zone');
      var cardId = btn.getAttribute('data-guohe-card-id');
      stage({ zone: zone, cardId: cardId }, cardId ? '[data-guohe-card-id="' + cardId + '"]' : '[data-guohe-zone="' + zone + '"]');
    }
    if (els.guohePickEquipment) els.guohePickEquipment.addEventListener('click', handleGuohePickClick);
    if (els.guohePickHand) els.guohePickHand.addEventListener('click', handleGuohePickClick);
    // v8 PR-A5: 五谷丰登挑牌面板
    if (els.wuguPickChoices) els.wuguPickChoices.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-wugu-card-id]');
      if (!btn) return;
      var cardId = btn.getAttribute('data-wugu-card-id');
      stage({ cardId: cardId }, '[data-wugu-card-id="' + cardId + '"]');
    });
    // v8 hotfix-2: 洛神 continue / stop 按钮
    if (els.luoshenContinueBtn) els.luoshenContinueBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), {});
      if (!result.ok) renderLog();
      render();
    });
    if (els.luoshenStopBtn) els.luoshenStopBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), { decline: true });
      if (!result.ok) renderLog();
      render();
    });
    // v11 C7 (批次 31): 耀武 奖励二选一
    if (els.yaowuRecoverBtn) els.yaowuRecoverBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), { choice: 'recover' });
      if (!result.ok) renderLog();
      render();
    });
    if (els.yaowuDrawBtn) els.yaowuDrawBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), { choice: 'draw' });
      if (!result.ok) renderLog();
      render();
    });

    // v8 PR-A2: 濒死救援面板
    if (els.dyingRescueChoices) els.dyingRescueChoices.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-dying-rescue-card-id]');
      if (!btn) return;
      var cardId = btn.getAttribute('data-dying-rescue-card-id');
      stage({ cardId: cardId }, '[data-dying-rescue-card-id="' + cardId + '"]');
    });
    if (els.dyingRescueDeclineBtn) els.dyingRescueDeclineBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), { decline: true });
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
      Engine.resolvePendingChoice(getGame(), { giveIds: yijiGiveSelection.slice() });
      yijiGiveSelection = [];
      render();
    });
    if (els.yijiKeepAllBtn) els.yijiKeepAllBtn.addEventListener('click', function () {
      Engine.resolvePendingChoice(getGame(), { giveIds: [] });
      yijiGiveSelection = [];
      render();
    });
    }

    return {
      render: renderPromptPanels,
      bind: bindPromptPanels
    };
  }
