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
    // v12 H5: 身份场死亡奖惩 (击杀反贼摸三张)
    var drawCards = deps.drawCards;

    function damage(game, targetActor, amount, sourceActor, reason, sourceCard, nature, opts) {
      if (game.phase === 'gameover') return false;
      var target = game[targetActor];
      if (!target) return false;
      amount = Number(amount) || 0;
      // v13 审计三轮: 天香转移的接续结算不再享受来源武器效果 (青釭无视
      // 防具 / 古锭 / 寒冰), 见 transferOpts.sourceWeaponExpired。
      var sourceWeaponExpired = !!(opts && opts.sourceWeaponExpired);
      // v13 J3: 天香 ask — 伤害流暂停框架。目标为 tianxiang='ask' 的小乔
      // 且有红桃成本与攻击范围内转移目标时, 在任何 onDamageModify 钩子运行
      // 前挂起 (钩子零重复副作用), resolver (resolveTianxiangAskChoice) 以
      // 原始参数 + 玩家决策重入本函数 (opts.tianxiangDecision / 放弃走
      // opts.noTianxiangAsk), 钩子在重入时只跑一遍。
      if (amount > 0
          && !(opts && (opts.noTianxiangTransfer || opts.noTianxiangAsk || opts.tianxiangDecision))
          && hasSkill(target, 'tianxiang')
          && target.skillPreferences && target.skillPreferences.tianxiang === 'ask') {
        var txCosts = (target.hand || []).filter(function (hc) {
          return StateRuntime.effectiveCardSuit(target, hc) === 'heart';
        });
        var txTargets = StateRuntime.seatsInShaRangeOf(game, targetActor);
        if (txCosts.length && txTargets.length) {
          if (!game.pauseState) game.pauseState = {};
          game.pauseState.tianxiangAsk = {
            targetActor: targetActor,
            amount: amount,
            sourceActor: sourceActor,
            reason: reason,
            sourceCard: sourceCard,
            nature: nature,
            opts: opts || null
          };
          setPendingChoice(game, {
            kind: 'tianxiang-ask',
            actor: targetActor,
            amount: amount,
            reason: reason,
            costIds: txCosts.map(function (hc) { return hc.id; }),
            cards: txCosts.map(function (hc) {
              return { id: hc.id, name: hc.name, suit: hc.suit, rank: hc.rank };
            }),
            targets: txTargets.map(function (seat) {
              return { seat: seat, name: game[seat].name };
            })
          });
          log(game, '等待' + actorName(game, targetActor) + '决定是否发动【天香】转移' + (reason || '伤害') + '。');
          return true; // 伤害在途, 由 resolver 重入结算
        }
      }
      var armor = target.equipment && target.equipment.armor;
      var ignoreArmor = !sourceWeaponExpired
        && !!(armor && sourceActor && sourceCard && isArmorIgnoredBySha(game, sourceActor, sourceCard));
      var damageNature = nature || 'normal';
      if (sourceCard && sourceCard.type === 'fire_sha') damageNature = 'fire';
      if (sourceCard && sourceCard.type === 'thunder_sha') damageNature = 'thunder';
      if (/火攻/.test(reason || '')) damageNature = 'fire';
      if (/闪电|雷/.test(reason || '')) damageNature = 'thunder';

      // v13 J3: 伤害落点回调 — 调用方 (杀链的武器命中特效等) 需要区分
      // "伤害真的落在目标身上" 与 "被天香转移/被防止": landed=false 时
      // 麒麟等命中特效不触发 (修复 v12 已知偏差: 转移后仍对原目标结算
      // 命中特效)。挂起-重入路径经 pauseState.tianxiangAsk.opts 原样携带。
      // 评审收口: damage() 是热路径 (基准每局数千次) — 仅调用方真的传入
      // 回调时才构造通知闭包, 其余路径零分配。
      var notifyDamageSettled = (opts && typeof opts.afterDamageSettled === 'function')
        ? function (landed, transferredTo) {
            opts.afterDamageSettled(game, landed, transferredTo || null);
          }
        : null;

      var damageModifyContext = {
        game: game,
        targetActor: targetActor,
        sourceActor: sourceActor,
        reason: reason,
        sourceCard: sourceCard,
        amount: amount,
        nature: damageNature,
        opts: opts || null
      };
      SkillRuntime.runHook(skillRegistry, 'onDamageModify', damageModifyContext);
      amount = Number(damageModifyContext.amount) || 0;

      // v12 G2: 天香 (小乔) — "受到伤害时"时机的伤害转移。handler (skills.js)
      // 在 onDamageModify 内完成 弃红桃成本 + 合法性校验 后置 transferTo;
      // 此处把整笔伤害改结算到转移目标 (其装备/濒死按自身结算), 完成后经
      // onTransferred 回调补摸 X 张 (X = 其已损失体力, 官方"然后其摸X张牌")。
      // 嵌套转移经 opts.noTianxiangTransfer 防递归。
      if (damageModifyContext.transferTo && game[damageModifyContext.transferTo]) {
        var transferee = damageModifyContext.transferTo;
        // v13 审计三轮: 来源武器效果随转移结束 — 官方 worked example
        // (card__equipment.md:50 "此时【青釭剑】的效果结束"): 青釭无视防具
        // 不得穿透转移落点的防具; 同理 古锭/寒冰 ("使用【杀】对目标角色
        // 造成伤害时") 的条件目标是杀的原目标, 不对转移接收者重新判定。
        // 接收者自己的防具 (藤甲② 火+1 / 白银 clamp) 照常生效。
        var transferOpts = { noTianxiangTransfer: true, sourceWeaponExpired: true };
        var transferResult = damage(game, transferee, amount, sourceActor, reason, sourceCard, damageNature, transferOpts);
        if (typeof damageModifyContext.onTransferred === 'function' && game.phase !== 'gameover') {
          // v12 G2 复核修复: 转移致命且濒死暂停等待救援时, 补牌回调若立即
          // 执行会因 hp<=0 被跳过且永不重触发 ("摸 X 张"永久丢失)。挂入
          // deferredAfterDying, 由 flushDeferredDamageAfter 在濒死结束后统一
          // 执行 (X 按救援后的已损体力计, 与官方"然后其摸X张牌"时序一致)。
          if (game.pauseState && game.pauseState.dying) {
            if (!game.pauseState.deferredAfterDying) game.pauseState.deferredAfterDying = [];
            game.pauseState.deferredAfterDying.push(function () {
              damageModifyContext.onTransferred(game, transferee);
            });
          } else {
            damageModifyContext.onTransferred(game, transferee);
          }
        }
        if (notifyDamageSettled) notifyDamageSettled(false, transferee);
        return transferResult;
      }

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
        ignoreArmor: ignoreArmor,
        sourceWeaponExpired: sourceWeaponExpired
      });
      if (equipModify.prevented) {
        if (sourceCard) discardSourceCardIfPending(game, sourceCard);
        if (notifyDamageSettled) notifyDamageSettled(false, null);
        return false;
      }
      amount = equipModify.amount;

      if (amount <= 0) {
        if (sourceCard) discardSourceCardIfPending(game, sourceCard);
        if (notifyDamageSettled) notifyDamageSettled(false, null);
        return false;
      }
      // C1: 体力值可降至负数 (gltjk flow__neardeath.md — 1 体力的法正受
      // 【闪电】3 点伤害后为 -2, 需 3 张【桃】方能回到 +1)。不再 clamp 到
      // 0, 否则深度致命伤被一张【桃】抹平, 严重削弱【闪电】/【酒】+【杀】等。
      target.hp = target.hp - amount;
      log(game, actorName(game, targetActor) + '因' + reason + '受到 ' + amount + ' 点伤害。');
      // v12 I3: 敌意记账 (AI 目标评估用, 纯遥测不影响规则) — 记录"谁伤了谁",
      // 供 aiHostilityToward 累计敌意分; 环形上限防无界增长。
      if (sourceActor && sourceActor !== targetActor && game[sourceActor]) {
        if (!game.aggressionLog) game.aggressionLog = [];
        game.aggressionLog.push({ source: sourceActor, target: targetActor, amount: amount });
        if (game.aggressionLog.length > 60) game.aggressionLog.shift();
      }
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
          if (notifyDamageSettled) notifyDamageSettled(true, null);
          return true;
        }
      }
      finishDamageAfter(game, damageContext);
      if (notifyDamageSettled) notifyDamageSettled(true, null);
      return true;
    }

    // v13 J3: 天香 ask resolver — decision {cardId, target} 弃红桃转移;
    // {decline} 放弃 (伤害以 noTianxiangAsk 重入照常结算)。挂起点在钩子
    // 运行前 (见 damage() 入口), 重入即完整补跑一遍伤害结算。
    function resolveTianxiangAskChoice(game, pending, decision) {
      var saved = game.pauseState && game.pauseState.tianxiangAsk;
      if (!saved) return fail('找不到【天香】询问的暂停状态。');
      var d = decision || {};
      var reOpts = {};
      if (saved.opts) {
        Object.keys(saved.opts).forEach(function (k) { reOpts[k] = saved.opts[k]; });
      }
      if (d.cardId && d.target && !d.decline) {
        var seat = StateRuntime.resolveSeatOption(game, d.target);
        var state = game[saved.targetActor];
        var chosen = state && (state.hand || []).find(function (hc) { return hc.id === d.cardId; });
        var costOk = chosen && StateRuntime.effectiveCardSuit(state, chosen) === 'heart';
        var targetOk = seat && seat !== saved.targetActor && game[seat] && game[seat].hp > 0
          && StateRuntime.canReachWithSha(game, saved.targetActor, seat);
        if (!costOk || !targetOk) {
          setPendingChoice(game, pending);
          return fail('请选择一张红桃手牌与攻击范围内的转移目标，或放弃发动【天香】。');
        }
        reOpts.tianxiangDecision = { costCardId: d.cardId, transferTo: seat };
      } else {
        log(game, actorName(game, saved.targetActor) + '选择不发动【天香】。');
        reOpts.noTianxiangAsk = true;
      }
      game.pauseState.tianxiangAsk = null;
      damage(game, saved.targetActor, saved.amount, saved.sourceActor,
        saved.reason, saved.sourceCard, saved.nature, reOpts);
      return success('【天香】询问已结算。');
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

    // H4: 铁索连环传导执行 — "其他处于连环状态的角色"逐一受传导。
    // 传导伤害: 等量、同属性、同来源, 无实体来源牌 (原牌已结算完毕),
    // 标记 chainTransmit 防止递归再传导。
    // v12 H2/H4: 泛化为座次环扫描 — 自受伤者下家起顺时针所有存活的横置
    // 角色依次受传导 (1v1 恒为 [对手单人], 行为不变)。
    // v12 H 复核修复: 改为可挂起队列 (pauseState.chainTransmit + 逐座席后
    // 检 pendingChoice)。此前同步循环在"某传导受害者濒死 ask 暂停"时会继续
    // 对下一座席造成伤害, 而下一座席的 enterDying 被 pauseState.dying 单槽
    // 守卫吞掉 → 该角色永久搁浅在 hp≤0、存活、无濒死态 (跳过救援/死亡/胜负
    // 判定)。现在遇 pendingChoice 即保留队列, 由 resumeSuspendedTurnFlowIfReady
    // 的 chainTransmit 分支在选择排空后续跑剩余座席。
    function transmitChainDamage(game, damageContext) {
      if (game.phase === 'gameover') return;
      if (!game.pauseState) game.pauseState = {};
      // v13 审计三轮: 传导顺序按官方"多角色同时结算从当前回合角色起顺时针"
      // (rule__principle.md) — 自当前回合角色起扫描 (排除本次受伤者自身);
      // 此前自受伤者下家起算。1v1 双席两种起算恒为 [对方单人], 行为不变。
      var chainAnchor = (game.turn && game[game.turn]) ? game.turn : damageContext.targetActor;
      game.pauseState.chainTransmit = {
        ringSeats: seatsFrom(game, chainAnchor, true).filter(function (seat) {
          return seat !== damageContext.targetActor;
        }),
        idx: 0,
        amount: damageContext.amount,
        sourceActor: damageContext.sourceActor,
        reason: damageContext.reason,
        nature: damageContext.nature
      };
      return advanceChainTransmit(game);
    }

    function advanceChainTransmit(game) {
      var ct = game.pauseState && game.pauseState.chainTransmit;
      if (!ct) return;
      var natureName = ct.nature === 'fire' ? '火焰' : '雷电';
      while (ct.idx < ct.ringSeats.length) {
        if (game.phase === 'gameover') break;
        var nextActor = ct.ringSeats[ct.idx];
        ct.idx += 1;
        var nextState = game[nextActor];
        if (!nextState || nextState.hp <= 0 || !nextState.chained) continue;
        log(game, '【铁索连环】传导：' + actorName(game, nextActor) + '受到等量' + natureName + '伤害。');
        damage(game, nextActor, ct.amount, ct.sourceActor,
          ct.reason + '（铁索连环传导）', null, ct.nature, { chainTransmit: true });
        // 某传导受害者濒死 ask 暂停 → 保留队列, 待救援结算后续跑剩余座席。
        if (game.pendingChoice) return;
      }
      game.pauseState.chainTransmit = null;
    }

    function flushDeferredDamageAfter(game) {
      var deferred = game.pauseState && game.pauseState.deferredDamageAfter;
      if (deferred && deferred.length) {
        game.pauseState.deferredDamageAfter = [];
        for (var i = 0; i < deferred.length; i += 1) {
          finishDamageAfter(game, deferred[i]);
          // v12 H 复核修复: finishDamageAfter 经铁索传导环可能触发新的濒死
          // ask 暂停 → 剩余 deferred 项留待选择排空后再冲刷 (随濒死结算
          // 再次调本函数), 避免暂停期间越序结算。
          if (game.pendingChoice) {
            var rest = deferred.slice(i + 1);
            if (rest.length) {
              game.pauseState.deferredDamageAfter =
                (game.pauseState.deferredDamageAfter || []).concat(rest);
            }
            return;
          }
        }
      }
      // v12 G2 复核修复: 濒死期间挂起的转移收尾回调 (天香补牌等) 一并冲刷。
      var deferredCallbacks = game.pauseState && game.pauseState.deferredAfterDying;
      if (deferredCallbacks && deferredCallbacks.length && game.phase !== 'gameover') {
        game.pauseState.deferredAfterDying = [];
        for (var j = 0; j < deferredCallbacks.length; j += 1) {
          deferredCallbacks[j]();
        }
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
      // v13 审计三轮: 不屈 (周泰) 等"处于濒死状态时"锁定技不再在入口抢先
      // 结算 — 官方将其与桃/酒响应归入同一顺时针责任链, 于濒死者自己的
      // 响应轮次触发 (见 processDyingNext 的 dyingEnterFired 分支)。此前
      // 在建队列前无条件先跑, 排在濒死者之前的座席 (如身份场队友) 失去
      // 先行救援的机会。1v1 中不屈结果不变 (队列另一人是 AI 攻击方, 恒
      // 不救援)。
      var turnActor = game.turn || dyingActor;
      // v13 K2: 队列排除已阵亡座席 (濒死者本人 hp<=0 仍须入队) — 此前只查
      // 座席存在, 亡席在环上"陪跑"(手牌已清空恒 skipped, 功能无害), 4/5 席
      // 多人阵亡后显式过滤, 防未来救援逻辑变化时死灰复燃。
      var responderQueue = seatsFrom(game, turnActor, true).filter(function (seat) {
        var seatState = game[seat];
        if (!seatState) return false;
        return seat === dyingActor || seatState.hp > 0;
      });
      game.pauseState.dying = {
        actor: dyingActor,
        source: sourceActor,
        responders: responderQueue,
        idx: 0,
        dyingEnterFired: false
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
        // v13 审计三轮: 轮到濒死者本人时, 先结算其"处于濒死状态时"锁定技
        // (不屈掀"创"), 回复至 1 即脱离濒死; 失败才进入其桃/酒自救。
        if (responder === dyingActor && !saved.dyingEnterFired) {
          saved.dyingEnterFired = true;
          SkillRuntime.runHook(skillRegistry, 'onDyingEnter', {
            game: game,
            dyingActor: dyingActor,
            sourceActor: saved.source
          });
          if (dyingState.hp >= 1) {
            log(game, actorName(game, dyingActor) + '脱离濒死状态。');
            game.pauseState.dying = null;
            flushDeferredDamageAfter(game);
            return { saved: true };
          }
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
      var killerActor = saved.source;
      var winner = determineWinner(game, dyingActor);
      if (winner) {
        game.phase = 'gameover';
        game.winner = winner;
        log(game, (winner === 'lordSide' ? '主忠方' : winner === 'rebelSide' ? '反贼方' : winner === 'renegade' ? '内奸' : actorName(game, winner)) + '获胜！');
      }
      game.pauseState.dying = null;
      // v12 H5: 对局继续 (身份场非终局死亡) → 阵亡结算 (弃置所有牌 + 奖惩)。
      if (!winner && game.phase !== 'gameover') {
        settleDeath(game, dyingActor, killerActor);
      }
      // M1: 角色死亡 → 跳过其 "受到伤害后" hooks (finishDamageAfter 内部按
      // gameover/存活判断), 但仍要把来源牌移入弃牌堆保持牌守恒。
      flushDeferredDamageAfter(game);
      return { died: true };
    }

    // v12 H5: 身份场死亡结算 (仅对局继续时; 1v1 死亡即终局不进此路径) —
    // 官方: 武将阵亡弃置其所有区域内的牌; 奖惩: 任何角色击杀反贼 →
    // 摸三张牌; 主公击杀忠臣 → 弃置所有手牌与装备。闪电等无来源死亡无奖惩。
    function settleDeath(game, deadActor, killerActor) {
      var deadState = game[deadActor];
      if (!deadState) return;
      var roles = game.roles || {};
      log(game, actorName(game, deadActor) + '阵亡（' + (roles[deadActor] || '未知身份') + '），弃置其所有牌。');
      discardAllZones(game, deadActor);
      deadState.chained = false;
      deadState.flags = {};
      var killer = killerActor && killerActor !== deadActor && game[killerActor] ? killerActor : null;
      if (killer && roles[deadActor] === '反贼' && game[killer].hp > 0) {
        log(game, actorName(game, killer) + '击杀反贼，摸三张牌。');
        drawCards(game, killer, 3);
      }
      if (killer && roles[deadActor] === '忠臣' && roles[killer] === '主公' && game[killer].hp > 0) {
        log(game, actorName(game, killer) + '误杀忠臣，弃置所有手牌与装备。');
        var killerState = game[killer];
        (killerState.hand || []).splice(0).forEach(function (punished) { discardCard(game, punished); });
        ['weapon', 'armor', 'horsePlus', 'horseMinus'].forEach(function (slot) {
          var equip = killerState.equipment && killerState.equipment[slot];
          if (equip) {
            discardCard(game, takeCard(game, equip, { zone: 'equipment', actor: killer, slot: slot }));
          }
        });
      }
    }

    function discardAllZones(game, seatActor) {
      var state = game[seatActor];
      if (!state) return;
      (state.hand || []).splice(0).forEach(function (c) { discardCard(game, c); });
      ['weapon', 'armor', 'horsePlus', 'horseMinus'].forEach(function (slot) {
        var equip = state.equipment && state.equipment[slot];
        if (equip) {
          discardCard(game, takeCard(game, equip, { zone: 'equipment', actor: seatActor, slot: slot }));
        }
      });
      (state.judgeArea || []).splice(0).forEach(function (c) { discardCard(game, c); });
      (state.chuang || []).splice(0).forEach(function (c) { discardCard(game, c); });
    }

    function determineWinner(game, deadActor) {
      var roles = game.roles || {};
      if (!Array.isArray(game.seats) || game.seats.length < 3) return opponent(deadActor);
      var alive = aliveSeats(game).filter(function (seat) { return seat !== deadActor; });
      var lord = game.seats.find(function (seat) { return roles[seat] === '主公'; });
      if (deadActor === lord || (lord && alive.indexOf(lord) < 0)) {
        // v13 K1: 主公阵亡 — 场上仅剩内奸存活 → 内奸单独获胜; 否则反贼方胜
        // (官方: 内奸胜利条件为最终一对一击杀主公, 即主公死亡时其余身份全灭)。
        var onlyRenegadeAlive = alive.length > 0 && alive.every(function (seat) {
          return roles[seat] === '内奸';
        });
        return onlyRenegadeAlive ? 'renegade' : 'rebelSide';
      }
      // v13 K1: 主公方获胜收紧 — 反贼与内奸须全部阵亡 (仅反贼全灭而内奸
      // 存活时对局继续)。3 人档无内奸, 行为与 v12 恒等。
      var threatsAlive = alive.some(function (seat) {
        return roles[seat] === '反贼' || roles[seat] === '内奸';
      });
      if (!threatsAlive) return 'lordSide';
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
      //   - 救他人: 1v1 AI 默认不救对手 (v8 PR-A2 行为不变 — 1v1 无同阵营
      //     他人)。v12 H5: 身份场 AI 用【桃】救同阵营濒死者 (忠救主等);
      //     无身份信息 / 敌对 → 照旧不救。玩家走 ask 路径。
      if (responder !== dyingActor) {
        var sameSide = StateRuntime.sideOf(game, responder) !== null
          && !StateRuntime.isHostileSeat(game, responder, dyingActor);
        if (sameSide && taoCards.length) {
          return executeDyingRescue(game, responder, dyingActor, 'tao', taoCards[0].id);
        }
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
      resolveDyingRescueChoice: resolveDyingRescueChoice,
      // v13 J3: 天香 ask 询问 resolver (引擎中央注册表登记)。
      resolveTianxiangAskChoice: resolveTianxiangAskChoice,
      // v12 H 复核修复: 铁索传导队列被濒死救援挂起后的续跑入口。
      advanceChainTransmit: advanceChainTransmit
    };
  }
