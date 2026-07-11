  // v11 B1: 伤害/濒死域模块 — damage / enterDying / 濒死救援 / 铁索传导
  // 从 game-engine.js 整体迁出, 函数体与迁出前逐行一致。引擎闭包能力经
  // createDamageDyingRuntime(deps) 注入; skillRegistry 原样注入, 使
  // SkillRuntime.runHook(skillRegistry, ...) 调用点保持不变。
  import { SkillRuntime } from './skill-runtime.js';
  import { CardRuntime } from './card-runtime.js';
  import { StateRuntime } from './state.js';

  var isShaCard = CardRuntime.isShaCard;
  var takeCard = CardRuntime.takeCard;
  var putCard = CardRuntime.putCard;
  var actorName = StateRuntime.actorName;
  var opponent = StateRuntime.opponent;
  var aliveSeats = StateRuntime.aliveSeats;
  var seatsFrom = StateRuntime.seatsFrom;
  var hasSkill = StateRuntime.hasSkill;

  export function createDamageDyingRuntime(deps) {
    var skillRegistry = deps.skillRegistry;
    var log = deps.log;
    var success = deps.success;
    var fail = deps.fail;
    var setPendingChoice = deps.setPendingChoice;
    var discardCard = deps.discardCard;
    var discardSourceCardIfPending = deps.discardSourceCardIfPending;
    // v11 E1 (批次 35): 装备伤害修正 handler 表 (装备域后置装配, 包装注入)
    var applyEquipmentDamageModifiers = deps.applyEquipmentDamageModifiers;
    var isArmorIgnoredBySha = deps.isArmorIgnoredBySha;
    // v11 C1 (批次 25): 救援 — 吴势力对濒死主公用桃回复量 +1 (由引擎注入)
    var taoRecoverBonus = deps.taoRecoverBonus;

    function damage(game, targetActor, amount, sourceActor, reason, sourceCard, nature, opts) {
      if (game.phase === 'gameover') return false;
      var target = game[targetActor];
      if (!target) return false;
      amount = Number(amount) || 0;
      var armor = target.equipment && target.equipment.armor;
      var ignoreArmor = !!(armor && sourceActor && sourceCard && isArmorIgnoredBySha(game, sourceActor, sourceCard));
      var damageNature = nature || 'normal';
      if (sourceCard && sourceCard.type === 'fire_sha') damageNature = 'fire';
      if (sourceCard && sourceCard.type === 'thunder_sha') damageNature = 'thunder';
      if (/火攻/.test(reason || '')) damageNature = 'fire';
      if (/闪电|雷/.test(reason || '')) damageNature = 'thunder';

      var damageModifyContext = {
        game: game,
        targetActor: targetActor,
        sourceActor: sourceActor,
        reason: reason,
        sourceCard: sourceCard,
        amount: amount,
        nature: damageNature
      };
      SkillRuntime.runHook(skillRegistry, 'onDamageModify', damageModifyContext);
      amount = Number(damageModifyContext.amount) || 0;

      // v11 E1 (批次 35): 装备伤害修正统一走 EquipmentRuntime 的有序
      // handler 表 (藤甲 火+1/防止 → 古锭 无手牌+1 → 白银 clamp → 寒冰
      // 弃两张防止, 顺序语义与各自 spec 注释见 equipment.js)。
      var equipModify = applyEquipmentDamageModifiers(game, {
        targetActor: targetActor,
        sourceActor: sourceActor,
        reason: reason,
        sourceCard: sourceCard,
        amount: amount,
        nature: damageNature,
        ignoreArmor: ignoreArmor
      });
      if (equipModify.prevented) {
        if (sourceCard) discardSourceCardIfPending(game, sourceCard);
        return false;
      }
      amount = equipModify.amount;

      if (amount <= 0) {
        if (sourceCard) discardSourceCardIfPending(game, sourceCard);
        return false;
      }
      // C1: 体力值可降至负数 (gltjk flow__neardeath.md — 1 体力的法正受
      // 【闪电】3 点伤害后为 -2, 需 3 张【桃】方能回到 +1)。不再 clamp 到
      // 0, 否则深度致命伤被一张【桃】抹平, 严重削弱【闪电】/【酒】+【杀】等。
      target.hp = target.hp - amount;
      log(game, actorName(game, targetActor) + '因' + reason + '受到 ' + amount + ' 点伤害。');
      // H4 (审计二轮): 铁索连环传导 — gltjk card__scroll.md: 处于连环状态的
      // 角色受到属性 (火/雷) 伤害时解除连环状态; 若此伤害不是传导伤害, 该
      // 角色伤害结算完毕后, 对其他处于连环状态的角色依次造成等量同属性的
      // 传导伤害 (传导伤害不再引发新的传导)。此前 chained 只是 UI 布尔,
      // damage() 无任何连环逻辑, 横置等于无效果。
      var chainTransmit = false;
      if (damageNature !== 'normal' && target.chained) {
        target.chained = false;
        log(game, actorName(game, targetActor) + '受到属性伤害，解除连环状态。');
        if (!(opts && opts.chainTransmit)) chainTransmit = true;
      }
      var damageContext = {
        game: game,
        targetActor: targetActor,
        sourceActor: sourceActor,
        reason: reason,
        sourceCard: sourceCard,
        amount: amount,
        nature: damageNature,
        chainTransmit: chainTransmit
      };
      // M1 (审计二轮): gltjk flow__decreaselife.md / flow__damage.md — 濒死
      // 结算嵌套在「扣减体力」内, "受到伤害后" 时机 (奸雄/反馈/刚烈/遗计)
      // 在其之后。此前 hooks 先跑: 1 体力的曹操先发动奸雄拿牌再求桃, 顺序
      // 与官方相反。现在先进入濒死; 若濒死暂停等待救援, 把 damage-after
      // 派发与来源牌弃置挂入 pauseState.deferredDamageAfter, 由
      // processDyingNext 在濒死结束后 flush。
      if (target.hp <= 0) {
        // v7 PR-13: gltjk flow__neardeath.md — 进入濒死结算，按顺序响应；
        // 任何一名响应者将 hp 回复到 1+ 即存活；全部响应完毕仍为 0 才死亡。
        enterDying(game, targetActor, sourceActor);
        if (game.pauseState && game.pauseState.dying) {
          if (!game.pauseState.deferredDamageAfter) game.pauseState.deferredDamageAfter = [];
          game.pauseState.deferredDamageAfter.push(damageContext);
          return true;
        }
      }
      finishDamageAfter(game, damageContext);
      return true;
    }

    // M1: "受到伤害后" 时机的统一收尾 — 派发 onDamageAfter hooks (目标存活
    // 且游戏未结束时), 再把未被技能获得的来源牌移入弃牌堆。同步路径由
    // damage() 直接调用; 濒死暂停路径由 flushDeferredDamageAfter 延迟调用。
    function finishDamageAfter(game, damageContext) {
      var targetState = game[damageContext.targetActor];
      var sourceCardClaimed = false;
      var targetAlive = targetState && targetState.hp > 0;
      if (game.phase !== 'gameover' && targetAlive) {
        var damageResults = SkillRuntime.runHook(skillRegistry, 'onDamageAfter', damageContext);
        for (var damageIndex = 0; damageIndex < damageResults.length; damageIndex += 1) {
          if (damageResults[damageIndex].result && damageResults[damageIndex].result.claimedSourceCard) {
            sourceCardClaimed = true;
          }
        }
      }
      if (damageContext.sourceCard && !sourceCardClaimed) {
        discardSourceCardIfPending(game, damageContext.sourceCard);
      }
      // H4: 该角色的伤害结算 (含嵌套濒死 — deferred 路径在 flush 时才到这)
      // 完毕后, 向其他横置角色传导属性伤害。
      if (damageContext.chainTransmit) {
        transmitChainDamage(game, damageContext);
      }
    }

    // H4: 铁索连环传导执行 — 1v1 中"其他处于连环状态的角色"只有对手。
    // 传导伤害: 等量、同属性、同来源, 无实体来源牌 (原牌已结算完毕),
    // 标记 chainTransmit 防止递归再传导。
    function transmitChainDamage(game, damageContext) {
      if (game.phase === 'gameover') return;
      var nextActor = opponent(damageContext.targetActor);
      var nextState = game[nextActor];
      if (!nextState || !nextState.chained) return;
      var natureName = damageContext.nature === 'fire' ? '火焰' : '雷电';
      log(game, '【铁索连环】传导：' + actorName(game, nextActor) + '受到等量' + natureName + '伤害。');
      damage(game, nextActor, damageContext.amount, damageContext.sourceActor,
        damageContext.reason + '（铁索连环传导）', null, damageContext.nature, { chainTransmit: true });
    }

    function flushDeferredDamageAfter(game) {
      var deferred = game.pauseState && game.pauseState.deferredDamageAfter;
      if (!deferred || !deferred.length) return;
      game.pauseState.deferredDamageAfter = [];
      for (var i = 0; i < deferred.length; i += 1) {
        finishDamageAfter(game, deferred[i]);
      }
    }

    // v7 PR-13: 濒死结算流程 (gltjk flow__neardeath.md)。在 1v1 中：
    //   - 响应者顺序 = 当前回合角色起按逆时针 = [turn-player, opponent]
    //   - 每名响应者一次机会，按 skillPreferences.dying (auto/ask) 处理：
    //     - 自救：可出【桃】或【酒】(使用方法Ⅱ, 仅 self)
    //     - 救人：可出【桃】(仅 1v1 中 player 救 enemy 这种反直觉场景；
    //              AI 永不救对手)
    //   - 任何一次回复使 hp >= 1 → 存活，pauseState.dying 清空
    //   - 全部响应完毕 hp 仍为 0 → 死亡 + game-over
    function enterDying(game, dyingActor, sourceActor) {
      if (!game.pauseState) game.pauseState = {};
      if (game.pauseState.dying) {
        // 既已在濒死结算中 (mid-rescue又出新濒死), 不重复进入
        return;
      }
      log(game, actorName(game, dyingActor) + '体力为 0，进入濒死状态。');
      var turnActor = game.turn || dyingActor;
      var responderQueue = seatsFrom(game, turnActor, true).filter(function (seat) { return !!game[seat]; });
      game.pauseState.dying = {
        actor: dyingActor,
        source: sourceActor,
        responders: responderQueue,
        idx: 0
      };
      processDyingNext(game);
    }

    function processDyingNext(game) {
      var saved = game.pauseState && game.pauseState.dying;
      if (!saved) return null;
      var dyingActor = saved.actor;
      var dyingState = game[dyingActor];
      if (!dyingState) return null;
      // 存活检测：hp >= 1 → 结束濒死
      if (dyingState.hp >= 1) {
        log(game, actorName(game, dyingActor) + '脱离濒死状态。');
        game.pauseState.dying = null;
        flushDeferredDamageAfter(game);
        return { saved: true };
      }
      // 全部响应完毕 → 死亡。从当前回合角色起按逆时针依次响应；C2: 同一
      // 名响应者可连续出多张【桃】/【酒】, 直到体力值首次回复至 1 点 (gltjk
      // flow__neardeath.md「直到A将体力值首次回复至1点或1点以上为止」)。仅当
      // 该响应者放弃 / 已无可用救援牌时才前进到下一名 (idx += 1)。
      while (saved.idx < saved.responders.length) {
        var responder = saved.responders[saved.idx];
        if (!game[responder]) {
          saved.idx += 1;
          continue;
        }
        var attemptResult = attemptDyingRescue(game, responder, dyingActor);
        if (attemptResult && attemptResult.paused) {
          return { paused: true };
        }
        if (attemptResult && attemptResult.healed) {
          // 回复后再次检查存活；未满 1 点则继续询问同一响应者 (不前进 idx)。
          if (dyingState.hp >= 1) {
            log(game, actorName(game, dyingActor) + '脱离濒死状态。');
            game.pauseState.dying = null;
            flushDeferredDamageAfter(game);
            return { saved: true };
          }
          continue;
        }
        // skipped (无【桃】/【酒】或放弃) → 进入下一名响应者
        saved.idx += 1;
      }
      // All responders exhausted, no save → die. H5: 身份场按阵营判胜，1v1 保持对手获胜。
      log(game, actorName(game, dyingActor) + '没有人救援，死亡。');
      var winner = determineWinner(game, dyingActor);
      if (winner) {
        game.phase = 'gameover';
        game.winner = winner;
        log(game, (winner === 'lordSide' ? '主忠方' : winner === 'rebelSide' ? '反贼方' : actorName(game, winner)) + '获胜！');
      }
      game.pauseState.dying = null;
      // M1: 角色死亡 → 跳过其 "受到伤害后" hooks (finishDamageAfter 内部按
      // gameover/存活判断), 但仍要把来源牌移入弃牌堆保持牌守恒。
      flushDeferredDamageAfter(game);
      return { died: true };
    }

    function determineWinner(game, deadActor) {
      var roles = game.roles || {};
      if (!Array.isArray(game.seats) || game.seats.length < 3) return opponent(deadActor);
      var alive = aliveSeats(game).filter(function (seat) { return seat !== deadActor; });
      var lord = game.seats.find(function (seat) { return roles[seat] === '主公'; });
      if (deadActor === lord || (lord && alive.indexOf(lord) < 0)) return 'rebelSide';
      var rebelsAlive = alive.some(function (seat) { return roles[seat] === '反贼'; });
      if (!rebelsAlive) return 'lordSide';
      return null;
    }

    function attemptDyingRescue(game, responder, dyingActor) {
      var responderState = game[responder];
      var dyingState = game[dyingActor];
      if (!responderState || !dyingState) return null;
      var pref = (responderState.skillPreferences && responderState.skillPreferences.dying)
        || (responder === 'player' ? 'ask' : 'auto');
      var taoCards = (responderState.hand || []).filter(function (c) { return c && c.type === 'tao'; });
      var jiuCards = (responder === dyingActor)
        ? (responderState.hand || []).filter(function (c) { return c && c.type === 'jiu'; })
        : [];
      // v8 PR-C3: 急救 (华佗) — 回合外可将红色牌当桃使用
      //   spec: gltjk card__hero__neutral.md 急救 "你于回合外可以将红色牌当桃使用"
      //   触发条件: responder 装 jijiu + game.turn !== responder + 手牌有非桃非酒的红色牌
      //   救援目标: 任意 (含他人)
      var jijiuCards = [];
      if (hasSkill(responderState, 'jijiu') && game.turn !== responder) {
        jijiuCards = (responderState.hand || []).filter(function (c) {
          return c && c.color === 'red' && c.type !== 'tao' && c.type !== 'jiu';
        });
      }
      if (!taoCards.length && !jiuCards.length && !jijiuCards.length) {
        log(game, actorName(game, responder) + '没有可用的【桃】/【酒】，无法救援。');
        return { skipped: true };
      }
      if (pref === 'decline') {
        log(game, actorName(game, responder) + '选择不救援。');
        return { skipped: true };
      }
      if (pref === 'ask') {
        setPendingChoice(game, {
          kind: 'dying-rescue',
          actor: responder,
          dyingActor: dyingActor,
          taoIds: taoCards.map(function (c) { return c.id; }),
          jiuIds: jiuCards.map(function (c) { return c.id; }),
          jijiuIds: jijiuCards.map(function (c) { return c.id; })
        });
        return { paused: true };
      }
      // 'auto':
      //   - 救自己优先：dying = self → 用 桃 优先 (桃便宜, 酒 Method II 次, 急救 最后)
      //   - 救他人 (含 华佗 急救): 1v1 AI 默认不救对手, 但若 jijiu 可用 +
      //     dying = 对手, 华佗 AI 仍然不救 (与原 v8 PR-A2 行为一致 — AI
      //     不主动救敌). 玩家走 ask 路径.
      if (responder !== dyingActor) {
        log(game, actorName(game, responder) + '选择不救援。');
        return { skipped: true };
      }
      if (taoCards.length) {
        return executeDyingRescue(game, responder, dyingActor, 'tao', taoCards[0].id);
      }
      if (jiuCards.length) {
        return executeDyingRescue(game, responder, dyingActor, 'jiu', jiuCards[0].id);
      }
      // 自救 — 急救 红色牌兜底
      return executeDyingRescue(game, responder, dyingActor, 'jijiu', jijiuCards[0].id);
    }

    function executeDyingRescue(game, responder, dyingActor, kind, cardId) {
      var responderState = game[responder];
      var dyingState = game[dyingActor];
      if (!responderState || !dyingState) return { skipped: true };
      var idx = responderState.hand.findIndex(function (c) { return c.id === cardId; });
      if (idx < 0) return { skipped: true };
      var card = takeCard(game, cardId, { zone: 'hand', actor: responder });
      if (kind === 'tao') {
        discardCard(game, card);
        // v11 C1 (批次 25): 救援 — 吴势力对濒死主公用桃回复量 +1
        var taoHeal = 1 + (taoRecoverBonus ? taoRecoverBonus(game, responder, dyingActor) : 0);
        dyingState.hp = Math.min(dyingState.maxHp, dyingState.hp + taoHeal);
        log(game, actorName(game, responder) + '对' + actorName(game, dyingActor) + '使用【桃】（濒死救援），回复 ' + taoHeal + ' 点体力。');
        return { healed: true };
      }
      if (kind === 'jiu') {
        // 酒 使用方法Ⅱ: 仅 self
        if (responder !== dyingActor) {
          // 不允许救他人时用酒；回退到不消耗
          putCard(game, card, { zone: 'hand', actor: responder, index: idx });
          return { skipped: true };
        }
        discardCard(game, card);
        dyingState.hp = Math.min(dyingState.maxHp, dyingState.hp + 1);
        log(game, actorName(game, responder) + '濒死时饮下【酒】（使用方法Ⅱ），回复 1 点体力。');
        return { healed: true };
      }
      // v8 PR-C3: 急救 — 华佗回合外把红色牌当桃 (条件: hasSkill jijiu +
      // turn !== responder + 卡是红色非桃非酒). source 卡 进 弃牌堆, 救
      // 1 hp. spec 允许救任意角色 (含他人), 但通过 attemptDyingRescue
      // auto path 已经过滤 — auto 不救他人; 玩家 ask 路径才可用此选项.
      if (kind === 'jijiu') {
        if (!hasSkill(responderState, 'jijiu') || game.turn === responder) {
          // 条件不满足时回退
          putCard(game, card, { zone: 'hand', actor: responder, index: idx });
          return { skipped: true };
        }
        if (card.color !== 'red' || card.type === 'tao' || card.type === 'jiu') {
          putCard(game, card, { zone: 'hand', actor: responder, index: idx });
          return { skipped: true };
        }
        discardCard(game, card);
        // v11 C1 (批次 25): 急救视为使用桃, 同样吃【救援】的 +1
        var jijiuHeal = 1 + (taoRecoverBonus ? taoRecoverBonus(game, responder, dyingActor) : 0);
        dyingState.hp = Math.min(dyingState.maxHp, dyingState.hp + jijiuHeal);
        log(game, actorName(game, responder) + '发动【急救】，将【' + card.name + '】当【桃】对' + actorName(game, dyingActor) + '使用，回复 ' + jijiuHeal + ' 点体力。');
        return { healed: true };
      }
      // 未知 kind
      putCard(game, card, { zone: 'hand', actor: responder, index: idx });
      return { skipped: true };
    }

    function resolveDyingRescueChoice(game, pending, decision) {
      var saved = game.pauseState && game.pauseState.dying;
      if (!saved) return fail('找不到濒死结算的暂停状态。');
      var responder = pending.actor;
      var dyingActor = pending.dyingActor;
      if (decision && (decision.decline || decision.skip)) {
        log(game, actorName(game, responder) + '选择不救援。');
        saved.idx += 1; // C2: 放弃 → 进入下一名响应者
        var nextOutcome = processDyingNext(game);
        return (nextOutcome && (nextOutcome.saved || nextOutcome.died)) ? success('濒死结算完成。') : success('继续濒死结算。');
      }
      var cardId = decision && decision.cardId;
      if (!cardId) {
        setPendingChoice(game, pending);
        return fail('请通过 cardId 指定要使用的【桃】/【酒】。');
      }
      var allowed = (pending.taoIds || []).concat(pending.jiuIds || []).concat(pending.jijiuIds || []);
      if (allowed.indexOf(cardId) < 0) {
        setPendingChoice(game, pending);
        return fail('该牌不在救援可用列表中。');
      }
      // v8 PR-C3: 三段 kind 判定 — 桃 / 酒 / 急救 (jijiu 红色当桃)
      var kind;
      if ((pending.taoIds || []).indexOf(cardId) >= 0) kind = 'tao';
      else if ((pending.jiuIds || []).indexOf(cardId) >= 0) kind = 'jiu';
      else kind = 'jijiu';
      var executeResult = executeDyingRescue(game, responder, dyingActor, kind, cardId);
      if (!executeResult.healed) {
        // 使用失败 (理论上不出现) → 跳过该响应者
        saved.idx += 1;
      }
      // C2: 救援成功后不前进 idx — 若仍未回复至 1 点, processDyingNext 会再次
      // 询问同一响应者 (再出一张【桃】); 已回复至 1 点则直接判存活。
      var outcome = processDyingNext(game);
      if (outcome && outcome.paused) return success('继续等待救援。');
      return success('濒死结算完成。');
    }

    return {
      damage: damage,
      enterDying: enterDying,
      resolveDyingRescueChoice: resolveDyingRescueChoice
    };
  }
