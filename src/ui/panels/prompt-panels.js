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

    // v15 U (林包): 两个两段选择面板的本地暂存 (英魂 选项+目标 / 乱武 杀+目标)。
    // 窗口收起时清零 —— 见 refresh* 里的 pending 身份校验 (v15 T M3 教训:
    // 同 kind 背靠背窗口之间不得残留暂存)。
    var yinghunOption = null;
    var yinghunSeat = null;
    var yinghunWindow = null;
    var luanwuCardId = null;
    var luanwuSeat = null;
    var luanwuWindow = null;

    function refreshYinghunConfirm() {
      if (els.yinghunConfirmBtn) {
        els.yinghunConfirmBtn.disabled = !(yinghunOption && yinghunSeat);
      }
    }

    function refreshLuanwuConfirm() {
      if (els.luanwuConfirmBtn) {
        els.luanwuConfirmBtn.disabled = !(luanwuCardId && luanwuSeat);
      }
    }
    var stage = ctx.stage;
    var promptCardChoice = ctx.promptCardChoice;
    var actorDisplayName = ctx.actorDisplayName;

    // v13 J1: 遗计逐席分配 — cardId → 座席 (undefined = 留己); 点牌在
    // [留己 → 座席1 → 座席2 → …] 间轮换 (1v1 恒 留己/交给对方 两态)。
    var yijiAssignments = {};
    // v13 J3: 天香 ask 面板本地态 — 已选成本牌 / 转移目标。
    var tianxiangCostId = null;
    var tianxiangTargetSeat = null;
    // v14 P3: 流离 ask 面板本地态 — 已选弃置牌 / 转移目标。
    var liuliCostId = null;
    var liuliTargetSeat = null;
    // v14 Q3: 突袭 ask 面板本地态 — 已选目标座席 (至多 2)。
    var tuxiPickSelection = [];
    var ganglieSelectedIds = [];
    var guanshiDiscardSelection = [];
    // v12 G2: 神速 面板本地态 — shensuOptionMode 记录用户点了"选项二"还是
    // "一+二" (null = 尚未进入装备弃置子步骤); shensuEquipCardId 记录已选中
    // 的装备候选。两者随 guanshi 惯例落在本模块闭包, 面板隐藏/kind 不匹配时复位。
    var shensuOptionMode = null;
    var shensuEquipCardId = null;

    // 张角二修 (#3/#5): 花色以带色形状呈现 — ♠♣ 黑、♥♦ 红, 决策提示里
    // 不再用不着色的黑色符号 (♠/♥ 易看错)。
    function suitHtml(suit) {
      var sym = suitLabel(suit);
      if (!sym) return '';
      var red = (suit === 'heart' || suit === 'diamond');
      return '<span class="mini-card-suit ' + (red ? 'suit-red' : 'suit-black') + '">' + escapeHtml(sym) + '</span>';
    }
    function judgeCardHtml(jc) {
      return '【' + escapeHtml(jc.name) + '】' + suitHtml(jc.suit)
        + (jc.rank ? ' ' + escapeHtml(String(jc.rank)) : '');
    }

    function renderPromptPanels(kind, pending) {
      var game = getGame();
    if (els.guicaiPromptPanel) {
      // 鬼才 (司马懿) — 张角二修: 鬼道已拆出独立面板, 本面板只承载 guicai。
      if (kind === 'guicai-replace' && pending.actor === 'player') {
        els.guicaiPromptPanel.hidden = false;
        if (els.guicaiPromptHint) {
          // v6.1: surface whose judgement is being replaced — when 司马懿
          // replaces opponent's judgement, the holder ≠ judgement actor.
          var whoseJudge = pending.judgementActor && pending.judgementActor !== pending.actor
            ? '对方'
            : '你';
          els.guicaiPromptHint.innerHTML =
            '鬼才：' + escapeHtml(whoseJudge) + '的判定牌' + judgeCardHtml(pending.judgementCard) +
            '（' + escapeHtml(pending.reason || '判定') + '）— 选择手牌代替，或跳过';
        }
        if (els.guicaiOriginalCard) {
          els.guicaiOriginalCard.innerHTML =
            '<span class="mini-card">原判定：' + judgeCardHtml(pending.judgementCard) + '</span>';
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
    // 张角二修: 鬼道独立面板 — 措辞"替换"、候选含装备黑牌 (带"装备"前缀)、
    // 花色带色形状。
    if (els.guidaoPromptPanel) {
      if (kind === 'guidao-replace' && pending.actor === 'player') {
        els.guidaoPromptPanel.hidden = false;
        if (els.guidaoPromptHint) {
          var gdWhose = pending.judgementActor && pending.judgementActor !== pending.actor ? '对方' : '你';
          els.guidaoPromptHint.innerHTML =
            '鬼道：' + escapeHtml(gdWhose) + '的判定牌' + judgeCardHtml(pending.judgementCard) +
            '（' + escapeHtml(pending.reason || '判定') + '）生效前 — 打出一张黑色牌替换之，或跳过';
        }
        if (els.guidaoOriginalCard) {
          els.guidaoOriginalCard.innerHTML =
            '<span class="mini-card">原判定：' + judgeCardHtml(pending.judgementCard) + '</span>';
        }
        if (els.guidaoCandidates) {
          els.guidaoCandidates.innerHTML = pending.candidates.map(function (card) {
            return promptCardChoice(card, {
              dataAttrs: { guidaoCardId: card.id },
              title: '打出这张黑色牌替换判定牌',
              extraClass: 'guidao-candidate',
              prefix: card.zone === 'equipment' ? '装备 ' : ''
            });
          }).join('') || '<span class="mini-card">没有黑色牌，必须跳过</span>';
        }
      } else {
        els.guidaoPromptPanel.hidden = true;
      }
    }
    // v13 张角修缮: 雷击 ask — 闪结算完后挂起, 选一名其他角色判定或不发动。
    // 点座席候选 stage (高亮), hand-confirm 提交; 不发动直提 decline。
    if (els.leijiAskPanel) {
      if (kind === 'leiji-ask' && pending.actor === 'player') {
        els.leijiAskPanel.hidden = false;
        if (els.leijiAskHint) {
          els.leijiAskHint.textContent =
            '雷击：你使用/打出了【闪】，可令一名其他角色进行判定——黑桃则其受到 2 点雷电伤害，或不发动。';
        }
        if (els.leijiAskChoices) {
          els.leijiAskChoices.innerHTML = (pending.candidates || []).map(function (entry) {
            return '<button class="mini-card leiji-target-choice" data-leiji-target="' +
              escapeHtml(entry.seat) + '" title="令其进行雷击判定">' +
              escapeHtml(entry.name) + '</button>';
          }).join('') || '<span class="mini-card">没有可指定的角色</span>';
        }
      } else {
        els.leijiAskPanel.hidden = true;
      }
    }
    if (els.yijiPromptPanel) {
      if (kind === 'yiji-distribute' && pending.actor === 'player') {
        els.yijiPromptPanel.hidden = false;
        // Drop selections that no longer match this prompt's drawn IDs.
        Object.keys(yijiAssignments).forEach(function (id) {
          if (pending.drawnIds.indexOf(id) < 0) delete yijiAssignments[id];
        });
        var yijiSeats = pending.seats || [];
        if (els.yijiPromptHint) {
          els.yijiPromptHint.textContent =
            '遗计：点牌轮换分配对象（' + pending.cards.length + ' 张可分配，未分配的留己）';
        }
        if (els.yijiCandidates) {
          els.yijiCandidates.innerHTML = pending.cards.map(function (card) {
            var assignedSeat = yijiAssignments[card.id];
            var seatEntry = assignedSeat ? yijiSeats.filter(function (s) { return s.seat === assignedSeat; })[0] : null;
            var stateLabel = seatEntry ? ' · 交给' + seatEntry.name : ' · 留己';
            return '<button class="mini-card yiji-candidate' + (seatEntry ? ' selected' : '') +
              '" data-yiji-card-id="' + escapeHtml(card.id) +
              '" title="点击轮换：留己 / 交给某座席">' +
              escapeHtml('【' + card.name + '】' + suitLabel(card.suit) + ' ' + (card.rank || '')) +
              escapeHtml(stateLabel) +
              '</button>';
          }).join('') || '<span class="mini-card">未摸到任何牌</span>';
        }
      } else {
        els.yijiPromptPanel.hidden = true;
        yijiAssignments = {};
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
    // v13 J3: 天香 ask — 受伤挂起: 选红桃成本 + 攻击范围内转移目标。
    if (els.tianxiangAskPanel) {
      if (kind === 'tianxiang-ask' && pending.actor === 'player') {
        els.tianxiangAskPanel.hidden = false;
        if (tianxiangCostId && (pending.costIds || []).indexOf(tianxiangCostId) < 0) tianxiangCostId = null;
        if (tianxiangTargetSeat && !(pending.targets || []).some(function (t) { return t.seat === tianxiangTargetSeat; })) tianxiangTargetSeat = null;
        // 单一转移目标 → 预选 (1v1 恒对手)。
        if (!tianxiangTargetSeat && (pending.targets || []).length === 1) tianxiangTargetSeat = pending.targets[0].seat;
        if (els.tianxiangAskHint) {
          els.tianxiangAskHint.textContent =
            '天香：受到 ' + (pending.amount || 1) + ' 点伤害（' + (pending.reason || '') + '）。'
            + '弃置一张红桃手牌并选择转移目标，或不发动。';
        }
        if (els.tianxiangCostChoices) {
          els.tianxiangCostChoices.innerHTML = (pending.cards || []).map(function (card) {
            return promptCardChoice(card, {
              dataAttrs: { tianxiangCostId: card.id },
              title: '弃置这张红桃手牌',
              extraClass: 'tianxiang-cost-choice' + (tianxiangCostId === card.id ? ' selected' : '')
            });
          }).join('') || '<span class="mini-card">没有红桃手牌</span>';
        }
        if (els.tianxiangTargetChoices) {
          els.tianxiangTargetChoices.innerHTML = '<span class="badge">转移给</span>' + (pending.targets || []).map(function (t) {
            return '<button class="mini-card tianxiang-target-choice' + (tianxiangTargetSeat === t.seat ? ' selected' : '') +
              '" data-tianxiang-target="' + escapeHtml(t.seat) + '">' + escapeHtml(t.name) + '</button>';
          }).join('');
        }
        if (els.tianxiangConfirmBtn) els.tianxiangConfirmBtn.disabled = !(tianxiangCostId && tianxiangTargetSeat);
      } else {
        els.tianxiangAskPanel.hidden = true;
        tianxiangCostId = null;
        tianxiangTargetSeat = null;
      }
    }
    // v14 Q3: 突袭摸牌 ask 面板 — 候选座席多选 (至多 2), 确认发动 (放弃
    // 摸牌) 或不发动照常摸牌。
    if (els.tuxiPickPanel) {
      if (kind === 'tuxi-pick' && pending.actor === 'player') {
        els.tuxiPickPanel.hidden = false;
        var tuxiLegal = (pending.candidates || []).map(function (cd) { return cd.seat; });
        tuxiPickSelection = tuxiPickSelection.filter(function (seat) { return tuxiLegal.indexOf(seat) >= 0; });
        if (els.tuxiPickHint) {
          els.tuxiPickHint.textContent =
            '突袭：放弃本回合摸牌，改为获得一至两名角色各一张手牌（已选 '
            + tuxiPickSelection.length + '/2），或不发动照常摸牌。';
        }
        if (els.tuxiPickChoices) {
          els.tuxiPickChoices.innerHTML = (pending.candidates || []).map(function (cd) {
            return '<button class="mini-card tuxi-pick-choice' + (tuxiPickSelection.indexOf(cd.seat) >= 0 ? ' selected' : '') +
              '" data-tuxi-target="' + escapeHtml(cd.seat) + '">' + escapeHtml(cd.name)
              + '（手牌 ' + cd.handCount + '）</button>';
          }).join('');
        }
        if (els.tuxiConfirmBtn) els.tuxiConfirmBtn.disabled = !(tuxiPickSelection.length >= 1 && tuxiPickSelection.length <= 2);
      } else {
        els.tuxiPickPanel.hidden = true;
        tuxiPickSelection = [];
      }
    }
    // v15 T: 猛进 (庞德) 弃牌选择 — 手牌为暗牌 (只给"随机弃一张手牌"),
    // 装备区逐张可指定; "不发动"走取消钮。
    if (els.mengjinPanel) {
      if (kind === 'mengjin-pick' && pending.actor === 'player') {
        els.mengjinPanel.hidden = false;
        var mjTargetState = getGame() && getGame()[pending.targetActor];
        if (els.mengjinHint) {
          els.mengjinHint.textContent = '猛进：你的【杀】被【闪】抵消，可弃置'
            + ((mjTargetState && mjTargetState.name) || '目标') + '的一张牌。';
        }
        if (els.mengjinChoices) {
          els.mengjinChoices.innerHTML = (pending.zones || []).map(function (zone) {
            if (zone.zone === 'hand') {
              return '<button class="mini-card" data-mengjin-zone="hand">随机弃一张手牌（'
                + zone.count + ' 张）</button>';
            }
            return '<button class="mini-card" data-mengjin-zone="equipment" data-mengjin-card-id="'
              + escapeHtml(zone.cardId) + '">' + escapeHtml(zone.name) + ' '
              + suitLabel(zone.suit) + (zone.rank || '') + '</button>';
          }).join('');
        }
      } else {
        els.mengjinPanel.hidden = true;
      }
    }
    // v15 T: 拼点选牌 — 双方各扣置一张手牌比点数 (点数大者赢)。
    if (els.pindianPanel) {
      if (kind === 'pindian-card' && pending.actor === 'player') {
        els.pindianPanel.hidden = false;
        if (els.pindianHint) {
          var pdFoeState = getGame() && getGame()[pending.opponentActor];
          els.pindianHint.textContent = (pending.reason || '拼点') + '：与'
            + ((pdFoeState && pdFoeState.name) || '对方') + '拼点，点选一张手牌扣置（点数大者赢）。';
        }
        if (els.pindianChoices) {
          els.pindianChoices.innerHTML = (pending.options || []).map(function (opt) {
            return '<button class="mini-card" data-pindian-card-id="' + escapeHtml(opt.cardId) + '">'
              + escapeHtml(opt.name) + ' ' + suitLabel(opt.suit)
              + (opt.rank ? String(opt.rank).toUpperCase() : '') + '</button>';
          }).join('');
        }
      } else {
        els.pindianPanel.hidden = true;
      }
    }
    // ═════ v15 T 评审收口: 官方"你可以 / 你选择"的四个决策面 ═════
    // 涅槃 (濒死限定技) — 二选一按钮, 无候选。
    if (els.niepanPanel) {
      if (kind === 'niepan-ask' && pending.actor === 'player') {
        els.niepanPanel.hidden = false;
        if (els.niepanHint) {
          els.niepanHint.textContent = '涅槃（限定技，每局一次）：弃置你区域里的所有牌（手牌 '
            + (pending.handCount || 0) + ' 张 / 装备 ' + (pending.equipmentCount || 0)
            + ' 张 / 判定区 ' + (pending.judgeAreaCount || 0)
            + ' 张），武将牌复原，摸三张牌，体力回复至 3 点。';
        }
      } else {
        els.niepanPanel.hidden = true;
      }
    }
    // 双雄 (摸牌阶段放不放弃摸牌) — 二选一按钮, 无候选。
    if (els.shuangxiongPanel) {
      if (kind === 'shuangxiong-ask' && pending.actor === 'player') {
        els.shuangxiongPanel.hidden = false;
        if (els.shuangxiongHint) {
          els.shuangxiongHint.textContent = '双雄：可放弃摸牌（' + (pending.drawCount || 0)
            + ' 张）改为判定并获得判定牌，本回合可将与之颜色不同的一张手牌当【决斗】使用。';
        }
      } else {
        els.shuangxiongPanel.hidden = true;
      }
    }
    // 驱虎赢后的受伤角色 — 必选 (伤害已成事实, 只是选谁), 点候选即提交。
    if (els.quhuVictimPanel) {
      if (kind === 'quhu-victim' && pending.actor === 'player') {
        els.quhuVictimPanel.hidden = false;
        if (els.quhuVictimHint) {
          var qhTargetState = getGame() && getGame()[pending.targetActor];
          els.quhuVictimHint.textContent = '驱虎：拼点赢 — 选择'
            + ((qhTargetState && qhTargetState.name) || '拼点目标')
            + '攻击范围内受到 1 点伤害的角色。';
        }
        if (els.quhuVictimChoices) {
          els.quhuVictimChoices.innerHTML = (pending.candidates || []).map(function (entry) {
            return '<button class="mini-card" data-quhu-victim="' + escapeHtml(entry.seat) + '">'
              + escapeHtml(entry.name) + '（' + entry.hp + ' 血）</button>';
          }).join('');
        }
      } else {
        els.quhuVictimPanel.hidden = true;
      }
    }
    // 节命 (逐点选受益者) — 点候选 stage, hand-confirm 提交; 可逐点放弃。
    if (els.jiemingPanel) {
      if (kind === 'jieming-pick' && pending.actor === 'player') {
        els.jiemingPanel.hidden = false;
        if (els.jiemingHint) {
          els.jiemingHint.textContent = '节命（第 ' + (pending.pointIndex || 1) + ' / '
            + (pending.totalPoints || 1) + ' 点）：可令一名角色将手牌补至其体力上限（至多 5）张。';
        }
        if (els.jiemingChoices) {
          els.jiemingChoices.innerHTML = (pending.candidates || []).map(function (entry) {
            return '<button class="mini-card" data-jieming-seat="' + escapeHtml(entry.seat) + '">'
              + escapeHtml(entry.name) + '（补 ' + entry.gain + ' 张 → ' + entry.limit + '）</button>';
          }).join('');
        }
      } else {
        els.jiemingPanel.hidden = true;
      }
    }
    // ═════ v15 U (林包) 六个决策窗 ═════
    if (els.benghuaiPanel) {
      if (kind === 'benghuai-choice' && pending.actor === 'player') {
        els.benghuaiPanel.hidden = false;
        if (els.benghuaiHint) {
          els.benghuaiHint.textContent = '崩坏（锁定技）：你不是体力值最小的角色（体力 '
            + pending.hp + ' / 上限 ' + pending.maxHp + '），须选择一项。';
        }
      } else { els.benghuaiPanel.hidden = true; }
    }
    if (els.fangzhuPanel) {
      if (kind === 'fangzhu-pick' && pending.actor === 'player') {
        els.fangzhuPanel.hidden = false;
        if (els.fangzhuHint) {
          els.fangzhuHint.textContent = '放逐：可令一名其他角色摸 ' + (pending.drawCount || 0)
            + ' 张牌，然后将其武将牌翻面。';
        }
        if (els.fangzhuChoices) {
          els.fangzhuChoices.innerHTML = (pending.candidates || []).map(function (entry) {
            return '<button class="mini-card" data-fangzhu-seat="' + escapeHtml(entry.seat) + '">'
              + escapeHtml(entry.name) + '（' + entry.hp + ' 血'
              + (entry.turnedOver ? '，已翻面' : '') + '）</button>';
          }).join('');
        }
      } else { els.fangzhuPanel.hidden = true; }
    }
    if (els.yinghunPanel) {
      if (kind === 'yinghun-choice' && pending.actor === 'player') {
        if (yinghunWindow !== pending) { yinghunWindow = pending; yinghunOption = null; yinghunSeat = null; }
        els.yinghunPanel.hidden = false;
        var yhX = pending.x || 1;
        if (els.yinghunHint) {
          els.yinghunHint.textContent = '英魂（X = ' + yhX + '）：先选一项，再选目标。';
        }
        if (els.yinghunOptions) {
          els.yinghunOptions.innerHTML =
            '<button class="mini-card" data-yinghun-option="1">① 摸 ' + yhX + ' 张，弃 1 张</button>'
            + '<button class="mini-card" data-yinghun-option="2">② 摸 1 张，弃 ' + yhX + ' 张</button>';
        }
        if (els.yinghunChoices) {
          els.yinghunChoices.innerHTML = (pending.candidates || []).map(function (entry) {
            return '<button class="mini-card" data-yinghun-seat="' + escapeHtml(entry.seat) + '">'
              + escapeHtml(entry.name) + '（手牌 ' + entry.handCount + '）</button>';
          }).join('');
        }
        refreshYinghunConfirm();
      } else { els.yinghunPanel.hidden = true; }
    }
    if (els.haoshiPanel) {
      if (kind === 'haoshi-give' && pending.actor === 'player') {
        els.haoshiPanel.hidden = false;
        if (els.haoshiHint) {
          els.haoshiHint.textContent = '好施：多名角色并列手牌最少，选择一名接受你的 '
            + (pending.giveCount || 0) + ' 张手牌。';
        }
        if (els.haoshiChoices) {
          els.haoshiChoices.innerHTML = (pending.candidates || []).map(function (entry) {
            return '<button class="mini-card" data-haoshi-seat="' + escapeHtml(entry.seat) + '">'
              + escapeHtml(entry.name) + '（手牌 ' + entry.handCount + '）</button>';
          }).join('');
        }
      } else { els.haoshiPanel.hidden = true; }
    }
    if (els.zaiqiPanel) {
      if (kind === 'zaiqi-ask' && pending.actor === 'player') {
        els.zaiqiPanel.hidden = false;
        if (els.zaiqiHint) {
          els.zaiqiHint.textContent = '再起：可放弃摸牌（' + (pending.drawCount || 0)
            + ' 张），改为亮出牌堆顶 ' + (pending.x || 0)
            + ' 张，按其中红桃张数回复体力并获得其余的牌。';
        }
      } else { els.zaiqiPanel.hidden = true; }
    }
    if (els.luanwuPanel) {
      if (kind === 'luanwu-sha' && pending.actor === 'player') {
        if (luanwuWindow !== pending) { luanwuWindow = pending; luanwuCardId = null; luanwuSeat = null; }
        els.luanwuPanel.hidden = false;
        if (els.luanwuHint) {
          els.luanwuHint.textContent = '乱武：需对距离最小的角色使用一张【杀】，否则失去 1 点体力。';
        }
        if (els.luanwuTargets) {
          els.luanwuTargets.innerHTML = (pending.targets || []).map(function (entry) {
            return '<button class="mini-card" data-luanwu-seat="' + escapeHtml(entry.seat) + '">'
              + escapeHtml(entry.name) + '（' + entry.hp + ' 血）</button>';
          }).join('');
        }
        if (els.luanwuChoices) {
          els.luanwuChoices.innerHTML = (pending.options || []).map(function (opt) {
            return '<button class="mini-card" data-luanwu-card-id="' + escapeHtml(opt.cardId) + '">'
              + escapeHtml(opt.name) + ' ' + suitLabel(opt.suit)
              + (opt.rank ? String(opt.rank).toUpperCase() : '') + '</button>';
          }).join('') || '<span class="mini-card">没有可用的【杀】</span>';
        }
        refreshLuanwuConfirm();
      } else { els.luanwuPanel.hidden = true; }
    }
    // v14 R1: 蛊惑质疑窗 — AI 于吉背面声明, 玩家决定是否质疑 (质疑真牌
    // 获「缠怨」, 提示如实告知风险; 只显示声明牌名, 不泄露真牌)。
    if (els.guhuoChallengePanel) {
      if (kind === 'guhuo-challenge' && pending.actor === 'player') {
        els.guhuoChallengePanel.hidden = false;
        if (els.guhuoChallengeHint) {
          var ghSourceState = pending.source && game[pending.source];
          // 评审收口: 目标是质疑前公开信息 (官方时序), 随文案带出。
          var ghTargets = pending.targetSeats || (pending.targetSeat ? [pending.targetSeat] : []);
          var ghTargetText = ghTargets.length
            ? '（目标：' + ghTargets.map(function (seat) {
              return (game[seat] && game[seat].name) || seat;
            }).join('、') + '）' : '';
          els.guhuoChallengeHint.textContent =
            '蛊惑：' + ((ghSourceState && ghSourceState.name) || '对方')
            + ' 背面朝上使用【' + (pending.declaredName || '?') + '】' + ghTargetText + '。'
            + '质疑为假可终止结算；质疑为真则你获得「缠怨」（不能再质疑，体力为1时其余技能无效）。';
        }
      } else {
        els.guhuoChallengePanel.hidden = true;
      }
    }
    // v14 P3: 流离转移面板 — 成本 (手牌/装备任一) + 转移目标 两段选择,
    // 结构随天香惯例; 装备成本候选带槽位标注。
    if (els.liuliAskPanel) {
      if (kind === 'liuli-transfer' && pending.actor === 'player') {
        els.liuliAskPanel.hidden = false;
        if (liuliCostId && (pending.costIds || []).indexOf(liuliCostId) < 0) liuliCostId = null;
        if (liuliTargetSeat && !(pending.candidates || []).some(function (c) { return c.seat === liuliTargetSeat; })) liuliTargetSeat = null;
        // 单一转移候选 → 预选。
        if (!liuliTargetSeat && (pending.candidates || []).length === 1) liuliTargetSeat = pending.candidates[0].seat;
        if (els.liuliAskHint) {
          els.liuliAskHint.textContent =
            '流离：你成为【' + (pending.shaName || '杀') + '】的目标。'
            + '弃置一张牌（手牌或装备）并选择攻击范围内的转移目标，或不发动。';
        }
        if (els.liuliCostChoices) {
          els.liuliCostChoices.innerHTML = (pending.cards || []).map(function (card) {
            return promptCardChoice(card, {
              dataAttrs: { liuliCostId: card.id },
              title: card.zone === 'equipment' ? '弃置这张装备牌（' + (card.slot || '') + '）' : '弃置这张手牌',
              extraClass: 'liuli-cost-choice' + (liuliCostId === card.id ? ' selected' : '')
                + (card.zone === 'equipment' ? ' liuli-cost-equip' : '')
            });
          }).join('') || '<span class="mini-card">没有可弃置的牌</span>';
        }
        if (els.liuliTargetChoices) {
          els.liuliTargetChoices.innerHTML = '<span class="badge">转移给</span>' + (pending.candidates || []).map(function (c) {
            return '<button class="mini-card liuli-target-choice' + (liuliTargetSeat === c.seat ? ' selected' : '') +
              '" data-liuli-target="' + escapeHtml(c.seat) + '">' + escapeHtml(c.name) + '</button>';
          }).join('');
        }
        if (els.liuliConfirmBtn) els.liuliConfirmBtn.disabled = !(liuliCostId && liuliTargetSeat);
      } else {
        els.liuliAskPanel.hidden = true;
        liuliCostId = null;
        liuliTargetSeat = null;
      }
    }
    // v13 J2: 火攻成本挂起重选 — 显式成本在结算中途失效 (无懈拉锯 ×
    // 展示缓存消耗 × 重展示花色变化) 时, 玩家重选同花色成本或不弃置。
    if (els.huogongCostPanel) {
      if (kind === 'huogong-cost' && pending.actor === 'player') {
        els.huogongCostPanel.hidden = false;
        if (els.huogongCostHint) {
          els.huogongCostHint.textContent =
            '火攻：目标现展示【' + (pending.revealed && pending.revealed.name || '') + '】（'
            + suitLabel(pending.revealed && pending.revealed.suit) + '），重选要弃置的同花色手牌，或不弃置（无伤结算）。';
        }
        // v13 K3 (缺陷修复): 写入唯一 id 的重选容器 — 原 huogongCostChoices
        // 与 huogongModePanel 内同名, 真实浏览器下候选渲染进隐藏的旧面板。
        if (els.huogongCostRepickChoices) {
          els.huogongCostRepickChoices.innerHTML = (pending.cards || []).map(function (card) {
            return promptCardChoice(card, {
              dataAttrs: { huogongCostCardId: card.id },
              title: '弃置这张同花色手牌',
              extraClass: 'huogong-cost-choice'
            });
          }).join('') || '<span class="mini-card">没有同花色手牌</span>';
        }
      } else {
        els.huogongCostPanel.hidden = true;
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
    // v12 G2: 神速 (夏侯渊) — 准备阶段开始前声明至多两项。四个按钮常驻:
    // 不发动/仅一/仅二/一+二; 二与一+二 需 canOptionTwo (有装备可弃) 才可点,
    // 点击后进入"选装备"子步骤 (本模块局部态), 选中候选后专属确认按钮才可
    // 点亮 — 未选装备禁止提交, 与 guanshi 弃两张牌的"选够才能确认"惯例一致。
    if (els.shensuOptionsPanel) {
      if (kind === 'shensu-options' && pending.actor === 'player') {
        els.shensuOptionsPanel.hidden = false;
        // 候选集变化 (新一轮 prompt) 或选项二不可用时, 复位子步骤本地态。
        if (!pending.canOptionTwo) shensuOptionMode = null;
        if (shensuEquipCardId && !(pending.equipCandidates || []).some(function (c) { return c.id === shensuEquipCardId; })) {
          shensuEquipCardId = null;
        }
        if (els.shensuOptionsHint) {
          els.shensuOptionsHint.textContent =
            '【神速】可选择至多两项：选项一——跳过判定阶段和摸牌阶段；' +
            '选项二——跳过出牌阶段并弃置一张装备牌。每选一项，视为使用一张' +
            '无距离限制的【杀】。' +
            (pending.canOptionTwo ? '' : '（没有装备牌可弃，选项二不可用）');
        }
        if (els.shensuOptionTwoBtn) els.shensuOptionTwoBtn.disabled = !pending.canOptionTwo;
        if (els.shensuBothBtn) els.shensuBothBtn.disabled = !pending.canOptionTwo;
        if (els.shensuEquipCandidates) {
          els.shensuEquipCandidates.innerHTML = shensuOptionMode
            ? (pending.equipCandidates || []).map(function (card) {
                return promptCardChoice(card, {
                  dataAttrs: { shensuEquipId: card.id },
                  title: '选这张作为要弃置的装备牌',
                  selected: shensuEquipCardId === card.id,
                  extraClass: 'shensu-equip-candidate'
                });
              }).join('') || '<span class="mini-card">没有可弃置的装备牌</span>'
            : '';
        }
        if (els.shensuConfirmEquipBtn) {
          els.shensuConfirmEquipBtn.hidden = !shensuOptionMode;
          els.shensuConfirmEquipBtn.disabled = !shensuEquipCardId;
        }
      } else {
        els.shensuOptionsPanel.hidden = true;
        shensuOptionMode = null;
        shensuEquipCardId = null;
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
            // audit4-M9: 急救候选可来自装备区红牌 ("红色牌"含装备) — 手牌
            // 找不到时查装备槽, 加"装备"前缀标注。
            var fromEquip = false;
            if (!card && responderState && responderState.equipment) {
              ['weapon', 'armor', 'horsePlus', 'horseMinus'].forEach(function (slot) {
                var held = responderState.equipment[slot];
                if (!card && held && held.id === cardId) { card = held; fromEquip = true; }
              });
            }
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
              prefix: fromEquip ? '装备 ' : '',
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
    // 张角二修: 鬼道独立面板 — 点候选 stage, hand-confirm 提交; 不发动直提。
    if (els.guidaoCandidates) els.guidaoCandidates.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-guidao-card-id]');
      if (!btn) return;
      var cardId = btn.getAttribute('data-guidao-card-id');
      stage({ cardId: cardId }, '[data-guidao-card-id="' + cardId + '"]');
    });
    if (els.guidaoDeclineBtn) els.guidaoDeclineBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), { cardId: null });
      if (!result.ok) renderLog();
      render();
    });
    // v13 张角修缮: 雷击 ask — 点座席候选 stage, hand-confirm 提交; 不发动直提。
    if (els.leijiAskChoices) els.leijiAskChoices.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-leiji-target]');
      if (!btn) return;
      var seat = btn.getAttribute('data-leiji-target');
      stage({ target: seat }, '[data-leiji-target="' + seat + '"]');
    });
    if (els.leijiDeclineBtn) els.leijiDeclineBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), { decline: true });
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
    // v13 J3: 天香 ask — 点成本/目标记录本地态, 确认后提交; 不发动直提。
    if (els.tianxiangCostChoices) els.tianxiangCostChoices.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-tianxiang-cost-id]');
      if (!btn) return;
      tianxiangCostId = btn.getAttribute('data-tianxiang-cost-id');
      render();
    });
    if (els.tianxiangTargetChoices) els.tianxiangTargetChoices.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-tianxiang-target]');
      if (!btn) return;
      tianxiangTargetSeat = btn.getAttribute('data-tianxiang-target');
      render();
    });
    if (els.tianxiangConfirmBtn) els.tianxiangConfirmBtn.addEventListener('click', function () {
      if (!tianxiangCostId || !tianxiangTargetSeat) return;
      var result = Engine.resolvePendingChoice(getGame(), { cardId: tianxiangCostId, target: tianxiangTargetSeat });
      tianxiangCostId = null;
      tianxiangTargetSeat = null;
      if (!result.ok) renderLog();
      render();
    });
    if (els.tianxiangDeclineBtn) els.tianxiangDeclineBtn.addEventListener('click', function () {
      tianxiangCostId = null;
      tianxiangTargetSeat = null;
      var result = Engine.resolvePendingChoice(getGame(), { decline: true });
      if (!result.ok) renderLog();
      render();
    });
    // v14 Q3: 突袭面板事件 (座席多选 toggle + 确认/不发动)。
    if (els.tuxiPickChoices) els.tuxiPickChoices.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-tuxi-target]');
      if (!btn) return;
      var seat = btn.getAttribute('data-tuxi-target');
      var idx = tuxiPickSelection.indexOf(seat);
      if (idx >= 0) tuxiPickSelection.splice(idx, 1);
      else if (tuxiPickSelection.length < 2) tuxiPickSelection.push(seat);
      render();
    });
    if (els.tuxiConfirmBtn) els.tuxiConfirmBtn.addEventListener('click', function () {
      if (!tuxiPickSelection.length || tuxiPickSelection.length > 2) return;
      var result = Engine.resolvePendingChoice(getGame(), { targets: tuxiPickSelection.slice() });
      tuxiPickSelection = [];
      if (!result.ok) renderLog();
      render();
    });
    if (els.tuxiDeclineBtn) els.tuxiDeclineBtn.addEventListener('click', function () {
      tuxiPickSelection = [];
      var result = Engine.resolvePendingChoice(getGame(), { decline: true });
      if (!result.ok) renderLog();
      render();
    });
    // v15 T: 猛进弃牌 (候选两步化 — 点候选 stage, hand-confirm 提交) 与
    // 拼点选牌 (同款)。
    if (els.mengjinChoices) els.mengjinChoices.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-mengjin-zone]');
      if (!btn) return;
      var zone = btn.getAttribute('data-mengjin-zone');
      var payload = { zone: zone };
      if (zone === 'equipment') payload.cardId = btn.getAttribute('data-mengjin-card-id');
      stage(payload, zone === 'equipment'
        ? '[data-mengjin-card-id="' + payload.cardId + '"]' : '[data-mengjin-zone="hand"]');
    });
    if (els.mengjinDeclineBtn) els.mengjinDeclineBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), { decline: true });
      if (!result.ok) renderLog();
      render();
    });
    if (els.pindianChoices) els.pindianChoices.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-pindian-card-id]');
      if (!btn) return;
      var cardId = btn.getAttribute('data-pindian-card-id');
      stage({ cardId: cardId }, '[data-pindian-card-id="' + cardId + '"]');
    });
    // v15 T 评审收口: 涅槃 / 双雄 / 驱虎受害者 / 节命 的四个决策面事件。
    if (els.niepanConfirmBtn) els.niepanConfirmBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), {});
      if (!result.ok) renderLog();
      render();
    });
    if (els.niepanDeclineBtn) els.niepanDeclineBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), { decline: true });
      if (!result.ok) renderLog();
      render();
    });
    if (els.shuangxiongConfirmBtn) els.shuangxiongConfirmBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), {});
      if (!result.ok) renderLog();
      render();
    });
    if (els.shuangxiongDeclineBtn) els.shuangxiongDeclineBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), { decline: true });
      if (!result.ok) renderLog();
      render();
    });
    if (els.quhuVictimChoices) els.quhuVictimChoices.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-quhu-victim]');
      if (!btn) return;
      // 必选面: 点即提交 (没有"不选"这个出路, 与耀武/五谷同款)。
      var result = Engine.resolvePendingChoice(getGame(),
        { victim: btn.getAttribute('data-quhu-victim') });
      if (!result.ok) renderLog();
      render();
    });
    if (els.jiemingChoices) els.jiemingChoices.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-jieming-seat]');
      if (!btn) return;
      var seat = btn.getAttribute('data-jieming-seat');
      stage({ target: seat }, '[data-jieming-seat="' + seat + '"]');
    });
    if (els.jiemingDeclineBtn) els.jiemingDeclineBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), { decline: true });
      if (!result.ok) renderLog();
      render();
    });
    // ═════ v15 U (林包) 六个决策窗事件 ═════
    // 崩坏: 锁定技二选一, 点即提交。
    if (els.benghuaiHpBtn) els.benghuaiHpBtn.addEventListener('click', function () {
      var r = Engine.resolvePendingChoice(getGame(), { choice: 'hp' });
      if (!r.ok) renderLog();
      render();
    });
    if (els.benghuaiMaxHpBtn) els.benghuaiMaxHpBtn.addEventListener('click', function () {
      var r = Engine.resolvePendingChoice(getGame(), { choice: 'maxHp' });
      if (!r.ok) renderLog();
      render();
    });
    // 放逐 / 好施: 点候选即提交 (单段选择)。
    if (els.fangzhuChoices) els.fangzhuChoices.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-fangzhu-seat]');
      if (!btn) return;
      var r = Engine.resolvePendingChoice(getGame(), { target: btn.getAttribute('data-fangzhu-seat') });
      if (!r.ok) renderLog();
      render();
    });
    if (els.fangzhuDeclineBtn) els.fangzhuDeclineBtn.addEventListener('click', function () {
      var r = Engine.resolvePendingChoice(getGame(), { decline: true });
      if (!r.ok) renderLog();
      render();
    });
    if (els.haoshiChoices) els.haoshiChoices.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-haoshi-seat]');
      if (!btn) return;
      var r = Engine.resolvePendingChoice(getGame(), { target: btn.getAttribute('data-haoshi-seat') });
      if (!r.ok) renderLog();
      render();
    });
    // 英魂: 两段暂存 (选项 + 目标) 后按确认。
    if (els.yinghunOptions) els.yinghunOptions.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-yinghun-option]');
      if (!btn) return;
      yinghunOption = Number(btn.getAttribute('data-yinghun-option')) === 2 ? 2 : 1;
      refreshYinghunConfirm();
    });
    if (els.yinghunChoices) els.yinghunChoices.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-yinghun-seat]');
      if (!btn) return;
      yinghunSeat = btn.getAttribute('data-yinghun-seat');
      refreshYinghunConfirm();
    });
    if (els.yinghunConfirmBtn) els.yinghunConfirmBtn.addEventListener('click', function () {
      var r = Engine.resolvePendingChoice(getGame(), { option: yinghunOption, target: yinghunSeat });
      yinghunOption = null; yinghunSeat = null;
      if (!r.ok) renderLog();
      render();
    });
    if (els.yinghunDeclineBtn) els.yinghunDeclineBtn.addEventListener('click', function () {
      yinghunOption = null; yinghunSeat = null;
      var r = Engine.resolvePendingChoice(getGame(), { decline: true });
      if (!r.ok) renderLog();
      render();
    });
    // 再起: 二选一。
    if (els.zaiqiConfirmBtn) els.zaiqiConfirmBtn.addEventListener('click', function () {
      var r = Engine.resolvePendingChoice(getGame(), {});
      if (!r.ok) renderLog();
      render();
    });
    if (els.zaiqiDeclineBtn) els.zaiqiDeclineBtn.addEventListener('click', function () {
      var r = Engine.resolvePendingChoice(getGame(), { decline: true });
      if (!r.ok) renderLog();
      render();
    });
    // 乱武: 两段暂存 (目标 + 杀) 后按确认; 取消 = 失去 1 点体力。
    if (els.luanwuTargets) els.luanwuTargets.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-luanwu-seat]');
      if (!btn) return;
      luanwuSeat = btn.getAttribute('data-luanwu-seat');
      refreshLuanwuConfirm();
    });
    if (els.luanwuChoices) els.luanwuChoices.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-luanwu-card-id]');
      if (!btn) return;
      luanwuCardId = btn.getAttribute('data-luanwu-card-id');
      refreshLuanwuConfirm();
    });
    if (els.luanwuConfirmBtn) els.luanwuConfirmBtn.addEventListener('click', function () {
      var r = Engine.resolvePendingChoice(getGame(), { cardId: luanwuCardId, target: luanwuSeat });
      luanwuCardId = null; luanwuSeat = null;
      if (!r.ok) renderLog();
      render();
    });
    if (els.luanwuDeclineBtn) els.luanwuDeclineBtn.addEventListener('click', function () {
      luanwuCardId = null; luanwuSeat = null;
      var r = Engine.resolvePendingChoice(getGame(), { decline: true });
      if (!r.ok) renderLog();
      render();
    });
    // v14 R1: 蛊惑质疑窗事件 (质疑 / 不质疑)。
    if (els.guhuoChallengeBtn) els.guhuoChallengeBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), { challenge: true });
      if (!result.ok) renderLog();
      render();
    });
    if (els.guhuoPassBtn) els.guhuoPassBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), {});
      if (!result.ok) renderLog();
      render();
    });
    // v14 P3: 流离转移面板事件 (成本/目标两段点选 + 确认/不发动, 随天香惯例)。
    if (els.liuliCostChoices) els.liuliCostChoices.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-liuli-cost-id]');
      if (!btn) return;
      liuliCostId = btn.getAttribute('data-liuli-cost-id');
      render();
    });
    if (els.liuliTargetChoices) els.liuliTargetChoices.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-liuli-target]');
      if (!btn) return;
      liuliTargetSeat = btn.getAttribute('data-liuli-target');
      render();
    });
    if (els.liuliConfirmBtn) els.liuliConfirmBtn.addEventListener('click', function () {
      if (!liuliCostId || !liuliTargetSeat) return;
      var result = Engine.resolvePendingChoice(getGame(), { cardId: liuliCostId, target: liuliTargetSeat });
      liuliCostId = null;
      liuliTargetSeat = null;
      if (!result.ok) renderLog();
      render();
    });
    if (els.liuliDeclineBtn) els.liuliDeclineBtn.addEventListener('click', function () {
      liuliCostId = null;
      liuliTargetSeat = null;
      var result = Engine.resolvePendingChoice(getGame(), { decline: true });
      if (!result.ok) renderLog();
      render();
    });
    // v13 J2: 火攻成本重选 — 点候选 stage 后 hand-confirm 提交; 不弃置按钮直提。
    // v13 K3: 监听挂唯一 id 容器 (原 huogongCostChoices 为 huogongModePanel
    // 的节点, 重选面板打开时旧面板 hidden, 候选实际不可点)。
    if (els.huogongCostRepickChoices) els.huogongCostRepickChoices.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-huogong-cost-card-id]');
      if (!btn) return;
      var cardId = btn.getAttribute('data-huogong-cost-card-id');
      stage({ cardId: cardId }, '[data-huogong-cost-card-id="' + cardId + '"]');
    });
    if (els.huogongCostDeclineBtn) els.huogongCostDeclineBtn.addEventListener('click', function () {
      var result = Engine.resolvePendingChoice(getGame(), { decline: true });
      if (!result.ok) renderLog();
      render();
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
    // v12 G2: 神速 四个动作按钮。"不发动"/"仅选项一" 无需装备成本, 直接
    // resolve; "仅选项二"/"一+二" 先进入本地"选装备"子步骤 (记录 mode),
    // 装备候选点击只切换选中态, 专属确认按钮凑齐后才真正 resolve — 未选
    // 装备/未进子步骤时确认按钮 hidden/disabled (渲染侧已处理)。
    if (els.shensuDeclineBtn) els.shensuDeclineBtn.addEventListener('click', function () {
      shensuOptionMode = null;
      shensuEquipCardId = null;
      var result = Engine.resolvePendingChoice(getGame(), { options: [] });
      if (!result.ok) renderLog();
      render();
    });
    if (els.shensuOptionOneBtn) els.shensuOptionOneBtn.addEventListener('click', function () {
      shensuOptionMode = null;
      shensuEquipCardId = null;
      var result = Engine.resolvePendingChoice(getGame(), { options: [1] });
      if (!result.ok) renderLog();
      render();
    });
    if (els.shensuOptionTwoBtn) els.shensuOptionTwoBtn.addEventListener('click', function () {
      if (els.shensuOptionTwoBtn.disabled) return;
      shensuOptionMode = 'two';
      shensuEquipCardId = null;
      render();
    });
    if (els.shensuBothBtn) els.shensuBothBtn.addEventListener('click', function () {
      if (els.shensuBothBtn.disabled) return;
      shensuOptionMode = 'both';
      shensuEquipCardId = null;
      render();
    });
    if (els.shensuEquipCandidates) els.shensuEquipCandidates.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-shensu-equip-id]');
      if (!btn) return;
      shensuEquipCardId = btn.getAttribute('data-shensu-equip-id');
      render();
    });
    if (els.shensuConfirmEquipBtn) els.shensuConfirmEquipBtn.addEventListener('click', function () {
      if (!shensuOptionMode || !shensuEquipCardId) return;
      var options = shensuOptionMode === 'both' ? [1, 2] : [2];
      var equipCardId = shensuEquipCardId;
      shensuOptionMode = null;
      shensuEquipCardId = null;
      var result = Engine.resolvePendingChoice(getGame(), { options: options, equipCardId: equipCardId });
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
      // v13 J1: 轮换分配 — 留己 → seats[0] → seats[1] → … → 留己。
      var game = getGame();
      var pending = game && Engine.getPendingChoice(game);
      var seats = (pending && pending.seats) || [];
      var current = yijiAssignments[id];
      if (!current) {
        if (seats.length) yijiAssignments[id] = seats[0].seat;
      } else {
        var idx = seats.map(function (s) { return s.seat; }).indexOf(current);
        if (idx >= 0 && idx + 1 < seats.length) yijiAssignments[id] = seats[idx + 1].seat;
        else delete yijiAssignments[id];
      }
      render();
    });
    if (els.yijiConfirmBtn) els.yijiConfirmBtn.addEventListener('click', function () {
      var assignments = Object.keys(yijiAssignments).map(function (id) {
        return { cardId: id, seat: yijiAssignments[id] };
      });
      Engine.resolvePendingChoice(getGame(), { assignments: assignments });
      yijiAssignments = {};
      render();
    });
    if (els.yijiKeepAllBtn) els.yijiKeepAllBtn.addEventListener('click', function () {
      Engine.resolvePendingChoice(getGame(), { assignments: [] });
      yijiAssignments = {};
      render();
    });
    }

    return {
      render: renderPromptPanels,
      bind: bindPromptPanels
    };
  }
