  // v11 B1: 装备域模块 — 装备穿/卸/失去时机 (M2 白银全路径) 与武器特效
  // (麒麟/寒冰/雌雄/贯石斧命中派发/银月枪), 从 game-engine.js 整体迁出,
  // 函数体逐行一致。qilin/cixiong 系 resolver 由引擎中央注册表登记;
  // yinyue-response 在工厂内自注册。
  import { CARD_CATALOG } from '../data/cards.js';
  import { CardRuntime } from './card-runtime.js';
  import { StateRuntime } from './state.js';

  var takeCard = CardRuntime.takeCard;
  var putCard = CardRuntime.putCard;
  var actorName = StateRuntime.actorName;
  var opponent = StateRuntime.opponent;
  var canReachWithSha = StateRuntime.canReachWithSha;
  var hasSkill = StateRuntime.hasSkill;

  export function createEquipmentRuntime(deps) {
    var log = deps.log;
    var success = deps.success;
    var fail = deps.fail;
    var setPendingChoice = deps.setPendingChoice;
    var requestPlayerResponse = deps.requestPlayerResponse;
    var registerResponseKind = deps.registerResponseKind;
    var damage = deps.damage;
    var discardCard = deps.discardCard;
    var drawCards = deps.drawCards;
    var equipmentList = deps.equipmentList;
    var removeCardFromHand = deps.removeCardFromHand;
    var resumePlayShaAfterCixiong = deps.resumePlayShaAfterCixiong;
    var scoreCardForAI = deps.scoreCardForAI;
    var consumeResponse = deps.consumeResponse;
    var hasShanResponseAvailable = deps.hasShanResponseAvailable;
    var listShanResponseOptions = deps.listShanResponseOptions;

    // M2 (审计二轮): "当你失去装备区里的【白银狮子】时, 你回复1点体力" —
    // 任何失去方式 (弃置/被拆/被顺/替换/作为技能或转化成本) 都应触发。
    // 此前回血只在 loseEquipment 一条路径生效, equipCard 替换 / 过河拆桥 /
    // 制衡弃装备 / 刚烈弃置 等全部绕过。所有装备离开装备区的路径统一调本函数。
    function triggerEquipmentLoss(game, actor, card) {
      if (!card || !game) return;
      var self = game[actor];
      if (!self) return;
      if (card.type === 'baiyin' && self.hp < self.maxHp && game.phase !== 'gameover') {
        self.hp += 1;
        log(game, actorName(game, actor) + '因失去【白银狮子】回复 1 点体力。');
      }
      // v11 C6 (批次 30): 枭姬 (孙尚香) — "失去装备区里的牌后, 摸两张牌"。
      // 挂在统一装备失去时机上: 替换/被拆/被顺/制衡成本/刚烈弃置 全部生效。
      if (hasSkill(self, 'xiaoji') && game.phase !== 'gameover'
          && !(self.skillPreferences && self.skillPreferences.xiaoji === 'decline')) {
        log(game, actorName(game, actor) + '发动【枭姬】，摸两张牌。');
        drawCards(game, actor, 2);
      }
    }

    function equipCard(game, actor, card) {
      var self = game[actor];
      if (!self) return fail('未知角色。');
      if (!card || card.family !== 'equipment') return fail('这不是装备牌。');
      var slot = card.slot || (CARD_CATALOG[card.type] && CARD_CATALOG[card.type].slot);
      if (!slot) return fail('装备槽位未知。');
      removeCardFromHand(self, card.id);
      if (self.equipment[slot]) {
        var replaced = takeCard(game, self.equipment[slot], { zone: 'equipment', actor: actor, slot: slot });
        discardCard(game, replaced);
        log(game, actorName(game, actor) + '替换并弃置了原有装备【' + replaced.name + '】。');
        triggerEquipmentLoss(game, actor, replaced);
      }
      putCard(game, card, { zone: 'equipment', actor: actor, slot: slot });
      log(game, actorName(game, actor) + '装备了【' + card.name + '】。');
      return success('装备成功。');
    }

    function loseEquipment(game, actor, slot) {
      var self = game[actor];
      if (!self || !self.equipment) return fail('未知角色。');
      var card = takeCard(game, self.equipment[slot], { zone: 'equipment', actor: actor, slot: slot });
      if (!card) return fail('该槽位没有装备。');
      discardCard(game, card);
      log(game, actorName(game, actor) + '失去了【' + card.name + '】。');
      triggerEquipmentLoss(game, actor, card);
      return success('失去装备。');
    }

    // v7 PR-3: 麒麟弓 — gltjk card__equipment.md：
    //   "每当你使用【杀】对目标角色造成伤害时，你可以弃置其装备区里的
    //    一张坐骑牌。"
    // 关键：弃【一张】，而非两张；且 "你可以" → 可选。
    //
    // skillPreferences.qilin（写入发动者 state）：
    //   'auto'    (AI/enemy 默认): 总是触发；目标有 2 匹马时默认弃 +1 马
    //   'ask'     (player 默认):   2 匹马时 pendingChoice 让 source 选；
    //                              1 匹马仍自动弃（没的选）
    //   'decline':                 完全不触发
    function applyQilinDiscard(game, sourceActor, targetActor) {
      var target = game[targetActor];
      if (!target || !target.equipment) return;
      var slots = [];
      if (target.equipment.horseMinus) slots.push('horseMinus');
      if (target.equipment.horsePlus) slots.push('horsePlus');
      if (slots.length === 0) return;
      var source = game[sourceActor];
      var pref = (source && source.skillPreferences && source.skillPreferences.qilin)
        || (sourceActor === 'player' ? 'ask' : 'auto');
      if (pref === 'decline') {
        log(game, actorName(game, sourceActor) + '选择不发动【麒麟弓】。');
        return;
      }
      if (slots.length === 1) {
        loseEquipment(game, targetActor, slots[0]);
        log(game, actorName(game, sourceActor) + '发动【麒麟弓】，弃置' + actorName(game, targetActor) + '的坐骑牌。');
        return;
      }
      // slots.length === 2
      if (pref === 'ask') {
        setPendingChoice(game, {
          kind: 'qilin-pick',
          actor: sourceActor,
          target: targetActor,
          horseSlots: slots.slice()
        });
        return;
      }
      // 'auto': default heuristic — kill +1 马 first（多数情况对目标更具威胁）。
      loseEquipment(game, targetActor, 'horsePlus');
      log(game, actorName(game, sourceActor) + '发动【麒麟弓】，弃置' + actorName(game, targetActor) + '的【+1 马】。');
    }

    function resolveQilinPickChoice(game, pending, decision) {
      var sourceActor = pending.actor;
      var targetActor = pending.target;
      var sourceState = game[sourceActor];
      var targetState = game[targetActor];
      if (!sourceState || !targetState) return fail('未知角色。');
      if (decision && decision.decline) {
        log(game, actorName(game, sourceActor) + '选择不发动【麒麟弓】。');
        return success('麒麟弓已取消。');
      }
      var slot = decision && decision.slot;
      if (['horseMinus', 'horsePlus'].indexOf(slot) < 0) {
        setPendingChoice(game, pending);
        return fail('请选择要弃置的坐骑（horseMinus / horsePlus）。');
      }
      if (pending.horseSlots.indexOf(slot) < 0
        || !targetState.equipment || !targetState.equipment[slot]) {
        setPendingChoice(game, pending);
        return fail('该坐骑已不在装备区。');
      }
      loseEquipment(game, targetActor, slot);
      log(game, actorName(game, sourceActor) + '发动【麒麟弓】，弃置' + actorName(game, targetActor) + '的【' + (slot === 'horsePlus' ? '+1 马' : '-1 马') + '】。');
      return success('麒麟弓结算完成。');
    }

    // ==================================================================
    // v11 E1 (批次 35): 装备伤害修正 handler 收口 — 藤甲/古锭/白银/寒冰
    // 从 damage() 的内联块整体迁入, 按固定顺序执行 (顺序即 spec 互动语义:
    // 藤甲 火+1/防止 → 古锭 无手牌+1 → 白银 clamp 到 1 → 寒冰 弃两张防止)。
    // handler 契约: (game, ctx) → null | { amount } | { prevented: true };
    // ctx = { targetActor, sourceActor, reason, sourceCard, amount, nature,
    // ignoreArmor }。prevented 的来源牌弃置由调用方 (damage) 统一收尾。
    // ==================================================================

    function applyTengjiaModifier(game, ctx) {
      var target = game[ctx.targetActor];
      var armor = target && target.equipment && target.equipment.armor;
      if (!armor || ctx.ignoreArmor || armor.type !== 'tengjia') return null;
      if (ctx.nature === 'fire') {
        log(game, actorName(game, ctx.targetActor) + '的【藤甲】令火焰伤害 +1。');
        return { amount: ctx.amount + 1 };
      }
      if ((ctx.sourceCard && ctx.sourceCard.type === 'sha') || /南蛮入侵|万箭齐发/.test(ctx.reason || '')) {
        log(game, actorName(game, ctx.targetActor) + '的【藤甲】防止了这次伤害。');
        return { prevented: true };
      }
      return null;
    }

    // v8 PR-B2: 古锭刀 — "锁定技, 每当你使用【杀】对目标角色造成伤害时,
    // 若其没有手牌, 你令伤害值+1"。时机=藤甲之后、白银之前 (白银仍能把
    // 2 点 clamp 回 1 点, 符合两件装备同时生效的 spec 互动)。
    function applyGudingModifier(game, ctx) {
      if (!ctx.sourceActor || !ctx.sourceCard || !CardRuntime.isShaCard(ctx.sourceCard) || ctx.amount <= 0) return null;
      var source = game[ctx.sourceActor];
      var target = game[ctx.targetActor];
      var weapon = source && source.equipment && source.equipment.weapon;
      if (!weapon || weapon.type !== 'guding') return null;
      if (target && (target.hand || []).length === 0) {
        log(game, actorName(game, ctx.sourceActor) + '的【古锭刀】令' + actorName(game, ctx.targetActor) + '无手牌伤害 +1。');
        return { amount: ctx.amount + 1 };
      }
      return null;
    }

    function applyBaiyinModifier(game, ctx) {
      var target = game[ctx.targetActor];
      var armor = target && target.equipment && target.equipment.armor;
      if (!armor || ctx.ignoreArmor || armor.type !== 'baiyin' || ctx.amount <= 1) return null;
      log(game, actorName(game, ctx.targetActor) + '的【白银狮子】将伤害防止至 1 点。');
      return { amount: 1 };
    }

    // v8 PR-B1: 寒冰剑 — "每当你使用【杀】对目标角色造成伤害时, 若其有牌,
    // 你可以防止此伤害, 依次弃置其两张牌"。时机=hp 扣减前、白银之后。
    function applyHanbingModifier(game, ctx) {
      if (ctx.amount <= 0 || !ctx.sourceActor || !ctx.sourceCard || !CardRuntime.isShaCard(ctx.sourceCard)) return null;
      var hbResult = applyHanbingPrevent(game, ctx.sourceActor, ctx.targetActor);
      if (hbResult && hbResult.prevented) return { prevented: true };
      return null;
    }

    var EQUIPMENT_DAMAGE_MODIFIERS = [
      { name: 'tengjia', apply: applyTengjiaModifier },
      { name: 'guding', apply: applyGudingModifier },
      { name: 'baiyin', apply: applyBaiyinModifier },
      { name: 'hanbing', apply: applyHanbingModifier }
    ];

    function applyEquipmentDamageModifiers(game, ctx) {
      for (var i = 0; i < EQUIPMENT_DAMAGE_MODIFIERS.length; i += 1) {
        var result = EQUIPMENT_DAMAGE_MODIFIERS[i].apply(game, ctx);
        if (result && result.prevented) return { prevented: true, amount: ctx.amount };
        if (result && typeof result.amount === 'number') ctx.amount = result.amount;
      }
      return { prevented: false, amount: ctx.amount };
    }

    // v8 PR-B1: 寒冰剑 — 由 damage() 在 hp 扣减前调用。源装寒冰且
    // sourceCard 是杀类时尝试触发。skillPreferences.hanbing:
    //   'auto'  (默认): 触发 → 按 装备 > 判定 > 手牌优先级弃 2 张, 防止伤害
    //   'decline':      不触发, 让伤害正常结算
    // 返回 {prevented:true} 表示防止伤害成功; 否则返回 null。
    // UI ask 模式待 PR-B1-bis 接入 pendingChoice 面板。
    function applyHanbingPrevent(game, sourceActor, targetActor) {
      var source = game[sourceActor];
      var target = game[targetActor];
      if (!source || !target) return null;
      var weapon = source.equipment && source.equipment.weapon;
      if (!weapon || weapon.type !== 'hanbing') return null;
      // M3 (审计二轮): gltjk glossary__zone.md 明文反例 — "执行【寒冰剑】的
      // 效果不可以弃置目标角色判定区里的牌" (判定区牌不是该角色的牌)。
      // 此前把判定区计入并弃置, 弃掉对方的【乐不思蜀】反而帮了对方。
      // 数有效牌总数 (手牌 + 装备)
      var equipsCount = equipmentList(target).length;
      var handCount = (target.hand || []).length;
      if (equipsCount + handCount === 0) return null;
      var pref = (source.skillPreferences && source.skillPreferences.hanbing) || 'auto';
      if (pref === 'decline') {
        log(game, actorName(game, sourceActor) + '选择不发动【寒冰剑】。');
        return null;
      }
      // auto / 其它: 按 装备 > 手牌 顺序弃 2 张
      var discarded = 0;
      var equips = equipmentList(target).slice();
      for (var ei = 0; ei < equips.length && discarded < 2; ei += 1) {
        loseEquipment(game, targetActor, equips[ei].slot);
        discarded += 1;
      }
      while (discarded < 2 && (target.hand || []).length > 0) {
        var hcard = takeCard(game, target.hand[0], { zone: 'hand', actor: targetActor });
        if (hcard) {
          discardCard(game, hcard);
          log(game, '【寒冰剑】依次弃置' + actorName(game, targetActor) + '手牌【' + hcard.name + '】。');
          discarded += 1;
        }
      }
      log(game, actorName(game, sourceActor) + '发动【寒冰剑】，防止本次伤害并依次弃置' + actorName(game, targetActor) + ' ' + discarded + ' 张牌。');
      return { prevented: true, discarded: discarded };
    }

    function applyWeaponHitEffects(game, actor, targetActor) {
      var weapon = game[actor].equipment && game[actor].equipment.weapon;
      if (!weapon) return;
      if (weapon.type === 'qilin') {
        applyQilinDiscard(game, actor, targetActor);
      }
      // v7 PR-4: 雌雄双股剑 已经迁移到 "指定目标后" 时机 (applyCixiongOnDesignate)，
      // 不再于 applyWeaponHitEffects (post-damage) 触发——这样即便目标用闪
      // 闪避，雌雄仍按 spec 触发。
    }

    // v7 PR-4: 雌雄双股剑 — gltjk card__equipment.md：
    //   "每当你使用【杀】指定与你性别不同的一个目标后，
    //    你可以令其选择一项：1.弃置一张手牌；2.令你摸一张牌。"
    //
    // 时机：use-event step 5 "指定目标后"（响应窗口之前）。
    // 性别检查：source.gender !== target.gender 才触发。
    // 两个决策：
    //   1) source 可以选择是否发动（skillPreferences.cixiong）
    //   2) target 选择一项（skillPreferences.cixiongResponse）
    // 任一暂停 → pendingChoice + pauseState.playSha 保存 sha 上下文。
    function applyCixiongOnDesignate(game, sourceActor, targetActor) {
      var source = game[sourceActor];
      var target = game[targetActor];
      if (!source || !target) return null;
      var weapon = source.equipment && source.equipment.weapon;
      if (!weapon || weapon.type !== 'cixiong') return null;
      var sourceGender = source.gender;
      var targetGender = target.gender;
      if (!sourceGender || !targetGender || sourceGender === targetGender) return null;
      var sourcePref = (source.skillPreferences && source.skillPreferences.cixiong)
        || (sourceActor === 'player' ? 'ask' : 'auto');
      if (sourcePref === 'decline') {
        log(game, actorName(game, sourceActor) + '选择不发动【雌雄双股剑】。');
        return null;
      }
      if (sourcePref === 'ask') {
        setPendingChoice(game, {
          kind: 'cixiong-fire',
          actor: sourceActor,
          target: targetActor
        });
        return { paused: true };
      }
      // 'auto' → fire immediately, proceed to target's choice.
      return fireCixiongTargetChoice(game, sourceActor, targetActor);
    }

    function fireCixiongTargetChoice(game, sourceActor, targetActor) {
      var source = game[sourceActor];
      var target = game[targetActor];
      log(game, actorName(game, sourceActor) + '发动【雌雄双股剑】，令' + actorName(game, targetActor) + '二选一。');
      if (!target.hand || target.hand.length === 0) {
        // No handcards → forced to option 2 (source draws 1).
        drawCards(game, sourceActor, 1);
        log(game, actorName(game, targetActor) + '没有手牌，' + actorName(game, sourceActor) + '摸一张牌。');
        return null;
      }
      var targetPref = (target.skillPreferences && target.skillPreferences.cixiongResponse)
        || (targetActor === 'player' ? 'ask' : 'auto');
      if (targetPref === 'auto') {
        // v8 PR-D2: 不再 deterministic 取 hand[0], 而是按 scoreCardForAI
        // 挑最不值钱的牌弃置 (受 hp/对方资源情况影响). 这样 target 留下
        // 真正有威胁的牌 (高分: 桃/无中/未用杀/酒).
        var sortedCixiong = target.hand
          .map(function (card) { return { card: card, score: scoreCardForAI(game, targetActor, card) }; })
          .sort(function (a, b) { return a.score - b.score; });
        var worstCard = sortedCixiong[0].card;
        var dropped = takeCard(game, worstCard, { zone: 'hand', actor: targetActor });
        discardCard(game, dropped);
        log(game, actorName(game, targetActor) + '因【雌雄双股剑】弃置【' + dropped.name + '】。');
        return null;
      }
      // 'ask' → pendingChoice for target.
      setPendingChoice(game, {
        kind: 'cixiong-choose',
        actor: targetActor,
        sourceActor: sourceActor,
        handIds: target.hand.map(function (c) { return c.id; })
      });
      return { paused: true };
    }

    function resolveCixiongFireChoice(game, pending, decision) {
      var sourceActor = pending.actor;
      var targetActor = pending.target;
      if (!game[sourceActor] || !game[targetActor]) return fail('未知角色。');
      if (decision && (decision.decline || decision.fire === false)) {
        log(game, actorName(game, sourceActor) + '选择不发动【雌雄双股剑】。');
        return resumePlayShaAfterCixiong(game);
      }
      var targetResult = fireCixiongTargetChoice(game, sourceActor, targetActor);
      if (targetResult && targetResult.paused) {
        return success('等待目标选择…');
      }
      return resumePlayShaAfterCixiong(game);
    }

    function resolveCixiongChoose(game, pending, decision) {
      var targetActor = pending.actor;
      var sourceActor = pending.sourceActor;
      var target = game[targetActor];
      if (!target || !game[sourceActor]) return fail('未知角色。');
      var option = decision && decision.option;
      if (option === 'draw') {
        drawCards(game, sourceActor, 1);
        log(game, actorName(game, targetActor) + '选择让' + actorName(game, sourceActor) + '摸一张牌。');
      } else if (option === 'discard') {
        if (!target.hand.length) {
          drawCards(game, sourceActor, 1);
          log(game, actorName(game, targetActor) + '没有手牌，' + actorName(game, sourceActor) + '摸一张牌。');
        } else {
          var cardId = decision && decision.cardId;
          var idx = cardId ? target.hand.findIndex(function (c) { return c.id === cardId; }) : 0;
          if (idx < 0) idx = 0;
          var dropped = takeCard(game, target.hand[idx], { zone: 'hand', actor: targetActor });
          discardCard(game, dropped);
          log(game, actorName(game, targetActor) + '弃置【' + dropped.name + '】响应【雌雄双股剑】。');
        }
      } else {
        setPendingChoice(game, pending);
        return fail('请选择 discard 或 draw。');
      }
      return resumePlayShaAfterCixiong(game);
    }

    // v8 PR-B4: 银月枪 — gltjk SP 010：
    //   "每当你于回合外使用或打出黑色手牌时, 你可以令你攻击范围内的一名
    //    角色选择是否打出【闪】, 若其选择否, 你对其造成1点伤害"。
    // 1v1 中: 目标 = opponent (即原事件 source); 攻击范围检测用
    // canReachWithSha (银月 range=3, 1v1 默认距离 1 ≤ 3 → 总成立)。
    // skillPreferences.yinyue = 'auto' (默认触发) / 'decline' (跳过)。
    function triggerYinyueQiang(game, holderActor) {
      var holder = game[holderActor];
      if (!holder) return;
      var weapon = holder.equipment && holder.equipment.weapon;
      if (!weapon || weapon.type !== 'yinyue') return;
      var targetActor = opponent(holderActor);
      if (!targetActor || !game[targetActor]) return;
      if (!canReachWithSha(game, holderActor, targetActor)) return;
      var pref = (holder.skillPreferences && holder.skillPreferences.yinyue) || 'auto';
      if (pref === 'decline') {
        log(game, actorName(game, holderActor) + '选择不发动【银月枪】。');
        return;
      }
      log(game, actorName(game, holderActor) + '发动【银月枪】，令' + actorName(game, targetActor) + '出闪或受 1 点伤害。');
      // v10 V4: 银月枪 触发 + 玩家为目标 + shanResponse=ask + 有闪 → 暂停.
      if (targetActor === 'player') {
        var yinyueTarget = game.player;
        if (yinyueTarget.skillPreferences && yinyueTarget.skillPreferences.shanResponse === 'ask'
            && hasShanResponseAvailable(yinyueTarget)) {
          requestPlayerResponse(game, {
            kind: 'yinyue-response',
            actor: 'player',
            pauseKey: 'yinyueResponse',
            source: { holderActor: holderActor },
            options: listShanResponseOptions(yinyueTarget),
            meta: { sourceActor: holderActor, sourceName: '银月枪' },
            logMessage: '等待' + actorName(game, 'player') + '决定是否打出【闪】响应【银月枪】。',
            statusMessage: '等待玩家响应【银月枪】。'
          });
          return;
        }
      }
      if (!consumeResponse(game, targetActor, 'shan', '【银月枪】')) {
        damage(game, targetActor, 1, holderActor, '【银月枪】');
      }
    }

    // v10 V4: 银月枪 闪响应 — 玩家 decision 决定 化解 / damage(1).
    function resolveYinyueResponseChoice(game, pending, decision) {
      var saved = game.pauseState && game.pauseState.yinyueResponse;
      if (!saved) return fail('找不到【银月枪】响应的暂停状态。');
      game.pauseState.yinyueResponse = null;
      var holderActor = saved.holderActor;
      var dodged = false;
      if (decision.cardId) {
        dodged = consumeResponse(game, 'player', 'shan', '【银月枪】', decision.cardId);
        if (!dodged) log(game, actorName(game, 'player') + '指定的牌无法当【闪】。');
      } else if (decision.use) {
        dodged = consumeResponse(game, 'player', 'shan', '【银月枪】');
        if (!dodged) log(game, actorName(game, 'player') + '没有可打出的【闪】。');
      } else {
        log(game, actorName(game, 'player') + '选择不打出【闪】响应【银月枪】。');
      }
      if (!dodged) {
        damage(game, 'player', 1, holderActor, '【银月枪】');
      }
      return success('银月枪响应完成。');
    }

    registerResponseKind('yinyue-response', resolveYinyueResponseChoice);

    return {
      equipCard: equipCard,
      loseEquipment: loseEquipment,
      triggerEquipmentLoss: triggerEquipmentLoss,
      applyQilinDiscard: applyQilinDiscard,
      resolveQilinPickChoice: resolveQilinPickChoice,
      applyHanbingPrevent: applyHanbingPrevent,
      applyEquipmentDamageModifiers: applyEquipmentDamageModifiers,
      applyWeaponHitEffects: applyWeaponHitEffects,
      applyCixiongOnDesignate: applyCixiongOnDesignate,
      fireCixiongTargetChoice: fireCixiongTargetChoice,
      resolveCixiongFireChoice: resolveCixiongFireChoice,
      resolveCixiongChoose: resolveCixiongChoose,
      triggerYinyueQiang: triggerYinyueQiang,
      resolveYinyueResponseChoice: resolveYinyueResponseChoice
    };
  }
