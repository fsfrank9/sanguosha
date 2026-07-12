  // v11 B1: 锦囊域模块 (第一步: 无懈链框架) — WUXIE_CONTINUATIONS 注册表 /
  // checkWuxieAndContinue / advanceWuxieChain / settleWuxieChain /
  // resolveWuxieResponseChoice, 从 game-engine.js 整体迁出, 函数体逐行一致。
  // 各锦囊的 continuation (juedou/guohe/... 结算收尾) 暂留引擎, 经
  // registerWuxieContinuation 注册进来; 后续批次随锦囊结算函数一并迁入。
  import { CardRuntime } from './card-runtime.js';
  import { StateRuntime } from './state.js';

  var putCard = CardRuntime.putCard;
  var actorName = StateRuntime.actorName;
  var opponent = StateRuntime.opponent;
  var seatsFrom = StateRuntime.seatsFrom;

  export function createTricksRuntime(deps) {
    var log = deps.log;
    var success = deps.success;
    var fail = deps.fail;
    var consumeWuxie = deps.consumeWuxie;
    var requestPlayerResponse = deps.requestPlayerResponse;
    var registerResponseKind = deps.registerResponseKind;
    // v11 B1 第五步: 锦囊 continuation 迁入所需的引擎能力
    var setPendingChoice = deps.setPendingChoice;
    var damage = deps.damage;
    var discardCard = deps.discardCard;
    var drawCards = deps.drawCards;
    var finishTrickUse = deps.finishTrickUse;
    var removeCardFromHand = deps.removeCardFromHand;
    var removeFirstMatchingCard = deps.removeFirstMatchingCard;
    var removeTargetZoneCard = deps.removeTargetZoneCard;
    var scoreCardForAI = deps.scoreCardForAI;
    // v11 D1 (批次 33): AI 无懈期望值评估 (ai 域后置装配, 包装注入)
    var aiShouldUseWuxie = deps.aiShouldUseWuxie;
    // v12 F5: 锦囊结算函数迁入所需的引擎/杀链能力 (完成头注释既定计划)
    var tryBaguaDodge = deps.tryBaguaDodge;
    var isArmorIgnoredBySha = deps.isArmorIgnoredBySha;
    var listShanResponseOptions = deps.listShanResponseOptions;
    var hasShanResponseAvailable = deps.hasShanResponseAvailable;
    var shaOptionForCard = deps.shaOptionForCard;
    var listShaResponseOptions = deps.listShaResponseOptions;
    var findResponseCard = deps.findResponseCard;
    var consumeResponse = deps.consumeResponse;
    var cardTargetProtection = deps.cardTargetProtection;
    var moveCard = deps.moveCard;
    var takeCard = deps.takeCard;
    var getTargetZoneCards = deps.getTargetZoneCards;
    var removeOwnCardFromAnyZone = deps.removeOwnCardFromAnyZone;
    var equipmentList = deps.equipmentList;
    var hasSkill = deps.hasSkill;
    var canReachWithSha = deps.canReachWithSha;
    var hasEquipmentEffect = deps.hasEquipmentEffect;
    var hasShaResponseAvailable = deps.hasShaResponseAvailable;
    var randomHandIndex = deps.randomHandIndex;
    var removeFirstCardOfType = deps.removeFirstCardOfType;
    var playSha = deps.playSha;
    // v12 H7: 主公技·激将/护驾 求助 (决斗需杀 / AOE 需杀·闪)
    var tryLordAidSync = deps.tryLordAidSync;
    var lordAidPlayerCanAid = deps.lordAidPlayerCanAid;

    // v10 V5: 无懈可击 链式响应 框架.
    //   每张锦囊触发 wuxie 检查, 依次询问可响应者, 直至全员放弃或无牌.
    //   玩家方 (skillPreferences.wuxieResponse='ask') 暂停; AI 方按期望值决定.
    //
    //   pauseState.wuxieChain = {
    //     trickName,         // 'juedou' / 'guohe' / 'shunshou' / 'huogong' / ...
    //     ctx,               // 继续逻辑的上下文 (actor, card, options...)
    //     reason,            // 日志/文案用 (e.g. '【决斗】')
    //     wuxied,            // bool — 当前 net 抵消态 (false=锦囊通过, true=已被抵消)
    //     initialResponder,  // 首个被询问的座席 (受该锦囊影响者), 队列锚点
    //     lastWuxieBy,       // 最近打出无懈的座席 (被抵消态下跳过其反无懈询问)
    //     queue, idx,        // 当前询问队列 (座席名数组) 与游标
    //     currentResponder   // 当前轮到谁决定 (= queue[idx], 供 UI/调试观察)
    //   }
    //
    //   v12 H2: 多座席泛化 — 询问队列自 initialResponder 起顺时针含全部存活
    //   座席; 净通过态 (wuxied=false) 跳过来源 (不会无懈自己的锦囊, 与 1v1 旧
    //   行为一致), 净抵消态跳过 lastWuxieBy (刚打出无懈者不反自己的无懈)。
    //   每有人打出无懈: 翻转 wuxied + 重建队列 (新状态下所有人重新获得响应
    //   机会)。双座席时队列恰为 [对方单人] → 与旧 currentResponder 交替翻转
    //   行为逐步一致。链结束时 settleWuxieChain 调 WUXIE_CONTINUATIONS 结算.
    var WUXIE_CONTINUATIONS = {};

    function registerWuxieContinuation(trickName, fn) {
      WUXIE_CONTINUATIONS[trickName] = fn;
    }

    function listWuxieOptions(state) {
      if (!state || !state.hand) return [];
      var opts = [];
      state.hand.forEach(function (card) {
        if (card && card.type === 'wuxie') {
          opts.push({
            cardId: card.id, via: null, name: card.name,
            suit: card.suit, rank: card.rank
          });
        }
      });
      return opts;
    }

    function hasWuxieResponseAvailable(state) {
      return listWuxieOptions(state).length > 0;
    }

    // 入口: trick 调用此 fn 触发无懈检查链. ctx 是 trick 的继续上下文.
    // targetActor = 首个被询问者 (受该锦囊影响的座席)。
    function checkWuxieAndContinue(game, targetActor, reason, trickName, ctx) {
      if (!game.pauseState) game.pauseState = {};
      game.pauseState.wuxieChain = {
        trickName: trickName,
        ctx: ctx,
        reason: reason,
        wuxied: false,
        initialResponder: targetActor,
        lastWuxieBy: null,
        queue: null,
        idx: 0,
        currentResponder: targetActor
      };
      return advanceWuxieChain(game);
    }

    // v12 H2: 当前净状态下的询问队列 — 自 initialResponder 起顺时针全部存活
    // 座席, 净通过态跳过锦囊来源, 净抵消态跳过刚打出无懈的座席。
    function wuxieResponderQueue(game, chain) {
      var skip = chain.wuxied ? chain.lastWuxieBy : (chain.ctx && chain.ctx.actor);
      return seatsFrom(game, chain.initialResponder, true).filter(function (seat) {
        var state = game[seat];
        return state && state.hp > 0 && seat !== skip;
      });
    }

    // 链推进: 沿询问队列逐座席决定 暂停 (玩家 ask + 有无懈) / AI 期望值
    // auto-use / 跳过 (无无懈); 队列耗尽 → 结算.
    function advanceWuxieChain(game) {
      var chain = game.pauseState && game.pauseState.wuxieChain;
      if (!chain) return fail('无懈链状态丢失。');
      if (!chain.queue) {
        chain.queue = wuxieResponderQueue(game, chain);
        chain.idx = 0;
      }
      while (chain.idx < chain.queue.length) {
        var responder = chain.queue[chain.idx];
        chain.currentResponder = responder;
        var state = game[responder];
        var hasWuxie = state && state.hp > 0 && hasWuxieResponseAvailable(state);
        if (!hasWuxie) {
          chain.idx += 1;
          continue;
        }

        // 玩家 ask 路径 — 暂停等待玩家
        if (responder === 'player'
            && state.skillPreferences && state.skillPreferences.wuxieResponse === 'ask') {
          return requestPlayerResponse(game, {
            kind: 'wuxie-response',
            actor: 'player',
            pauseKey: 'wuxieChain',
            source: chain,  // 即 pauseState.wuxieChain 自身 (链状态)
            options: listWuxieOptions(state),
            meta: {
              reason: chain.reason,
              chainWuxied: chain.wuxied,
              trickName: chain.trickName
            },
            logMessage: '等待' + actorName(game, 'player') + '决定是否打出【无懈可击】响应' + chain.reason + '。',
            statusMessage: '等待玩家无懈响应。'
          });
        }

        // 非玩家 ask 路径: AI / 默认 auto — 有无懈则自动用
        // v11 D1 (批次 33): AI 座席不再"有无懈就用" — 期望值为负时保留
        // (aiShouldUseWuxie, 由 ai 域注入)。玩家默认 auto 座席保持旧行为
        // (UI 玩家走 ask 路径), 反无懈 (chain.wuxied) 亦保持旧行为。
        var evHold = responder !== 'player'
          && aiShouldUseWuxie && !aiShouldUseWuxie(game, responder, chain);
        if (evHold) {
          log(game, actorName(game, responder) + '保留【无懈可击】。');
          chain.idx += 1;
          continue;
        }
        consumeWuxie(game, responder, chain.reason);
        chain.wuxied = !chain.wuxied;
        chain.lastWuxieBy = responder;
        chain.queue = null;  // 新净状态 → 重建队列, 所有座席重新获得响应机会
        return advanceWuxieChain(game);
      }

      // 队列耗尽 (无人再响应) → 结算
      return settleWuxieChain(game);
    }

    function settleWuxieChain(game) {
      var chain = game.pauseState && game.pauseState.wuxieChain;
      if (!chain) return fail('无懈链状态丢失。');
      game.pauseState.wuxieChain = null;
      var cont = WUXIE_CONTINUATIONS[chain.trickName];
      if (!cont) return fail('未注册的无懈延续: ' + chain.trickName);
      return cont(game, chain.ctx, chain.wuxied);
    }

    // resolver — 玩家在 wuxie pendingChoice 上的决策.
    // v12 H2: 放弃/失效不再直接 settleWuxieChain — 游标 +1 交回队列推进
    // (后续座席仍可响应; 双座席时队列即耗尽, 行为与旧直接结算逐步一致)。
    function resolveWuxieResponseChoice(game, pending, decision) {
      var chain = game.pauseState && game.pauseState.wuxieChain;
      if (!chain) return fail('找不到无懈响应的暂停状态。');

      if (decision.cardId || decision.use) {
        var used = consumeWuxie(game, 'player', chain.reason, decision.cardId || null);
        if (!used) {
          log(game, actorName(game, 'player') + '没有可打出的【无懈可击】。');
          chain.idx += 1;
          return advanceWuxieChain(game);
        }
        chain.wuxied = !chain.wuxied;
        chain.lastWuxieBy = 'player';
        chain.queue = null;
        return advanceWuxieChain(game);
      }
      // 玩家放弃响应 → 队列下一位 (耗尽则由 advanceWuxieChain 调 settleWuxieChain(game) 结算)
      log(game, actorName(game, 'player') + '选择不打出【无懈可击】响应' + chain.reason + '。');
      chain.idx += 1;
      return advanceWuxieChain(game);
    }

    registerResponseKind('wuxie-response', resolveWuxieResponseChoice);

    // v10 V5: 无懈链 settle 时调用. ctx = { actor, card, options, targetActor? }.
    // wuxied: true → 锦囊被抵消; false → 锦囊照常结算.
    // v12 H1: 单目标锦囊经 ctx.targetActor 显式接目标; 未提供时回退
    // opponent(ctx.actor) (1v1 旧行为)。

    registerWuxieContinuation('juedou', function (game, ctx, wuxied) {
      if (wuxied) {
        discardCard(game, ctx.card);
        return finishTrickUse(game, ctx.actor, ctx.card, success('决斗被无懈可击。'), ctx.options);
      }
      return finishTrickUse(game, ctx.actor, ctx.card,
        playDuel(game, ctx.actor, ctx.card, ctx.targetActor), ctx.options);
    });

    registerWuxieContinuation('guohe', function (game, ctx, wuxied) {
      // 注意: guohe 在调 checkWuxieAndContinue 前已 discardCard. wuxied 仅影响后续动作.
      if (wuxied) {
        return finishTrickUse(game, ctx.actor, ctx.card, success('过河拆桥被无懈可击。'), ctx.options);
      }
      return finishTrickUse(game, ctx.actor, ctx.card,
        resolveGuohe1v1(game, ctx.actor, ctx.targetActor || opponent(ctx.actor), ctx.options), ctx.options);
    });

    registerWuxieContinuation('shunshou', function (game, ctx, wuxied) {
      if (wuxied) {
        return finishTrickUse(game, ctx.actor, ctx.card, success('顺手牵羊被无懈可击。'), ctx.options);
      }
      var self = game[ctx.actor];
      var opt = ctx.options || {};
      var ssTargetActor = ctx.targetActor || opponent(ctx.actor);
      var stolenInfo = removeTargetZoneCard(game, ssTargetActor, opt.targetZone, opt.targetCardId);
      if (stolenInfo && stolenInfo.card) {
        putCard(game, stolenInfo.card, { zone: 'hand', actor: ctx.actor });
        log(game, actorName(game, ctx.actor) + '使用【顺手牵羊】，获得了'
          + actorName(game, ssTargetActor) + stolenInfo.zone + '的一张牌。');
      }
      return finishTrickUse(game, ctx.actor, ctx.card, success('获得对方一张牌。'), ctx.options);
    });

    registerWuxieContinuation('huogong', function (game, ctx, wuxied) {
      if (wuxied) {
        return finishTrickUse(game, ctx.actor, ctx.card, success('火攻被无懈可击。'), ctx.options);
      }
      var hgTargetActor = ctx.targetActor || opponent(ctx.actor);
      var fireTarget = game[hgTargetActor];
      if (!fireTarget.hand.length) {
        return finishTrickUse(game, ctx.actor, ctx.card, success('目标没有手牌，火攻未造成伤害。'), ctx.options || {});
      }
      // L1: 目标选展示牌 — AI/auto 随机 (缓存保证与预览一致); 玩家 ask → 暂停。
      var revealed = peekHuogongReveal(game, hgTargetActor);
      if (!revealed) {
        game.pauseState.huogong = ctx;
        setPendingChoice(game, {
          kind: 'huogong-show',
          actor: hgTargetActor,
          cardIds: fireTarget.hand.map(function (c) { return c.id; })
        });
        return success('等待目标选择【火攻】展示牌。');
      }
      return runHuogongResolution(game, ctx, revealed);
    });

    function runHuogongResolution(game, ctx, revealed) {
      var self = game[ctx.actor];
      var opt = ctx.options || {};
      var hgTargetActor = ctx.targetActor || opponent(ctx.actor);
      game.pauseState.huogongReveal = null; // 本次结算已消费缓存
      log(game, actorName(game, hgTargetActor) + '展示【' + revealed.name + '】（' + revealed.suit + '）。');
      if (opt.declineHuogong) {
        log(game, actorName(game, ctx.actor) + '选择不弃置同花色牌，【火攻】未造成伤害。');
        return finishTrickUse(game, ctx.actor, ctx.card, success('火攻未追加弃牌。'), opt);
      }
      var cost = opt.huogongCostCardId
        ? removeCardFromHand(self, opt.huogongCostCardId)
        : removeFirstMatchingCard(self, function (item) { return item.suit === revealed.suit; });
      if (!cost) return finishTrickUse(game, ctx.actor, ctx.card, success('没有同花色牌可弃，火攻未造成伤害。'), opt);
      if (cost.suit !== revealed.suit) {
        putCard(game, cost, { zone: 'hand', actor: ctx.actor });
        return fail('请选择与展示牌同花色的手牌。');
      }
      discardCard(game, cost);
      log(game, actorName(game, ctx.actor) + '弃置同花色【' + cost.name + '】发动【火攻】。');
      damage(game, hgTargetActor, 1, ctx.actor, '【火攻】', ctx.card, 'fire');
      return finishTrickUse(game, ctx.actor, ctx.card, success('火攻结算完成。'), opt);
    }

    // L1: 玩家目标 (huogongShow='ask') 自选展示牌的 resolver。
    function resolveHuogongShowChoice(game, pending, decision) {
      var ctx = game.pauseState && game.pauseState.huogong;
      if (!ctx) return fail('找不到【火攻】的暂停状态。');
      var targetState = game[pending.actor];
      var cardId = decision && decision.cardId;
      var chosen = targetState && targetState.hand.find(function (c) { return c.id === cardId; });
      if (!chosen) {
        setPendingChoice(game, pending);
        return fail('请选择一张手牌展示。');
      }
      game.pauseState.huogong = null;
      game.pauseState.huogongReveal = { targetActor: pending.actor, cardId: cardId };
      return runHuogongResolution(game, ctx, chosen);
    }

    registerResponseKind('huogong-show', resolveHuogongShowChoice);

    registerWuxieContinuation('jiedao', function (game, ctx, wuxied) {
      if (wuxied) {
        return finishTrickUse(game, ctx.actor, ctx.card, success('借刀杀人被无懈可击。'), ctx.options);
      }
      var jdTargetActor = ctx.targetActor || opponent(ctx.actor);
      var weaponOwner = game[jdTargetActor];
      if (!weaponOwner.equipment.weapon) {
        return finishTrickUse(game, ctx.actor, ctx.card, success('目标没有武器，借刀杀人无效果。'), ctx.options);
      }
      return finishTrickUse(game, ctx.actor, ctx.card,
        resolveJiedaoDecision(game, ctx.actor, jdTargetActor, ctx.card, ctx.options, ctx.victimActor), ctx.options);
    });

    // H1: 新增 4 个无懈延续 — 无中生有 / 南蛮入侵 / 万箭齐发 / 延时锦囊放置。
    // wuxied=true → 锦囊被抵消; false → 照常结算。集智 (集智 onCardUse) 在
    // finishTrickUse 内对非延时锦囊照常触发 (即使被无懈, "使用" 仍成立)。
    // 延时锦囊放置不属于「非延时锦囊」, 故 delayed-place 不走 finishTrickUse。

    registerWuxieContinuation('wuzhong', function (game, ctx, wuxied) {
      if (wuxied) {
        return finishTrickUse(game, ctx.actor, ctx.card, success('无中生有被无懈可击。'), ctx.options);
      }
      log(game, actorName(game, ctx.wzTargetActor) + '摸两张牌。');
      drawCards(game, ctx.wzTargetActor, 2);
      return finishTrickUse(game, ctx.actor, ctx.card, success('摸两张牌。'), ctx.options);
    });

    registerWuxieContinuation('nanman', function (game, ctx, wuxied) {
      if (wuxied) {
        discardCard(game, ctx.card);
        return finishTrickUse(game, ctx.actor, ctx.card, success('南蛮入侵被无懈可击。'), ctx.options);
      }
      return finishTrickUse(game, ctx.actor, ctx.card,
        playAOE(game, ctx.actor, ctx.card, 'sha', '南蛮入侵'), ctx.options);
    });

    registerWuxieContinuation('wanjian', function (game, ctx, wuxied) {
      if (wuxied) {
        discardCard(game, ctx.card);
        return finishTrickUse(game, ctx.actor, ctx.card, success('万箭齐发被无懈可击。'), ctx.options);
      }
      return finishTrickUse(game, ctx.actor, ctx.card,
        playAOE(game, ctx.actor, ctx.card, 'shan', '万箭齐发'), ctx.options);
    });

    registerWuxieContinuation('delayed-place', function (game, ctx, wuxied) {
      if (wuxied) {
        discardCard(game, ctx.card);
        return success('延时锦囊被无懈可击。');
      }
      var side = ctx.delayedSide;
      putCard(game, ctx.card, { zone: 'judgeArea', actor: side });
      if (ctx.card.type === 'shandian') {
        log(game, actorName(game, ctx.actor) + '将【闪电】置入自己的判定区。');
      } else {
        log(game, actorName(game, ctx.actor) + '将【' + ctx.card.name + '】置入' + actorName(game, side) + '的判定区。');
      }
      return success('延时锦囊生效。');
    });

    // H1b: 桃园结义 逐目标无懈驱动。targets = 受伤角色 (按 [actor, opponent]
    // 顺序)。每名目标独立开无懈窗口, responder = opponent(目标) (即另一方可
    // 抵消该目标的回复)。全部目标结算后 finishTrickUse 触发集智等 onCardUse。
    function advanceTaoyuanTargets(game, ctx) {
      while (ctx.idx < ctx.targets.length) {
        var target = ctx.targets[ctx.idx];
        if (!game[target] || game[target].hp >= game[target].maxHp) {
          ctx.idx += 1; // 期间已被治满 (理论不出现) → 跳过
          continue;
        }
        return checkWuxieAndContinue(
          game, opponent(target),
          '【桃园结义】（' + actorName(game, target) + '）',
          'taoyuan-target', ctx
        );
      }
      return finishTrickUse(game, ctx.actor, ctx.card, success('桃园结义结算完成。'), ctx.options);
    }

    registerWuxieContinuation('taoyuan-target', function (game, ctx, wuxied) {
      var target = ctx.targets[ctx.idx];
      if (wuxied) {
        log(game, '【桃园结义】对' + actorName(game, target) + '的回复被【无懈可击】抵消。');
      } else if (game[target] && game[target].hp < game[target].maxHp) {
        game[target].hp = Math.min(game[target].maxHp, game[target].hp + 1);
        log(game, actorName(game, target) + '因【桃园结义】回复 1 点体力。');
      }
      ctx.idx += 1;
      return advanceTaoyuanTargets(game, ctx);
    });

    // H1b-2: 五谷丰登 逐目标无懈驱动。ctx = { sourceActor, wuguCardId, pool,
    // order, idx, options }。对每名 picker (order[idx]) 先开无懈窗口
    // (responder = opponent(picker), 另一方可抵消该 picker 的获得); 被无懈
    // 则跳过其选牌, 否则进入 wuguPickForCurrent 选牌 (auto 立即 / ask 暂停)。
    function advanceWuguTargets(game, ctx) {
      while (ctx.idx < ctx.order.length) {
        if (!ctx.pool.length) break; // 牌已分完
        var picker = ctx.order[ctx.idx];
        if (!game[picker]) { ctx.idx += 1; continue; }
        return checkWuxieAndContinue(
          game, opponent(picker),
          '【五谷丰登】（' + actorName(game, picker) + '）',
          'wugu-target', ctx
        );
      }
      return finishWugu(game, ctx);
    }

    registerWuxieContinuation('wugu-target', function (game, ctx, wuxied) {
      var picker = ctx.order[ctx.idx];
      if (wuxied) {
        log(game, '【五谷丰登】对' + actorName(game, picker) + '的获得被【无懈可击】抵消。');
        ctx.idx += 1;
        return advanceWuguTargets(game, ctx);
      }
      return wuguPickForCurrent(game, ctx);
    });

    // 单个 picker 选牌; pool 仅剩 1 张或 AI auto → 立即拿并推进; 玩家 ask →
    // 暂停为 wugu-pick (resolveWuguPickChoice 选完后回到 advanceWuguTargets)。
    function wuguPickForCurrent(game, ctx) {
      var picker = ctx.order[ctx.idx];
      var pool = ctx.pool;
      if (!pool.length) { ctx.idx += 1; return advanceWuguTargets(game, ctx); }
      if (pool.length === 1) {
        var only = pool.shift();  // pool 是在途池
        putCard(game, only, { zone: 'hand', actor: picker });
        log(game, actorName(game, picker) + '从【五谷丰登】获得【' + only.name + '】。');
        ctx.idx += 1;
        return advanceWuguTargets(game, ctx);
      }
      var pickerState = game[picker];
      var pref = (pickerState && pickerState.skillPreferences && pickerState.skillPreferences.wugu)
        || (picker === 'player' ? 'ask' : 'auto');
      if (pref === 'auto') {
        // v8 PR-D2: 取最高分 (scoreCardForAI 看自身受伤 / 已用杀 等)。
        var bestPoolIdx = 0;
        var bestPoolScore = -Infinity;
        for (var pi = 0; pi < pool.length; pi += 1) {
          var ps = scoreCardForAI(game, picker, pool[pi]);
          if (ps > bestPoolScore) { bestPoolScore = ps; bestPoolIdx = pi; }
        }
        var picked = pool.splice(bestPoolIdx, 1)[0];  // pool 是在途池
        putCard(game, picked, { zone: 'hand', actor: picker });
        log(game, actorName(game, picker) + '从【五谷丰登】获得【' + picked.name + '】。');
        ctx.idx += 1;
        return advanceWuguTargets(game, ctx);
      }
      if (!game.pauseState) game.pauseState = {};
      game.pauseState.wugu = {
        sourceActor: ctx.sourceActor,
        wuguCardId: ctx.wuguCardId,
        pool: pool,
        order: ctx.order,
        idx: ctx.idx,
        options: ctx.options
      };
      setPendingChoice(game, {
        kind: 'wugu-pick',
        actor: picker,
        sourceActor: ctx.sourceActor,
        cards: pool.map(function (c) {
          return { id: c.id, name: c.name, suit: c.suit, color: c.color, rank: c.rank };
        })
      });
      return success('【五谷丰登】等待 ' + actorName(game, picker) + ' 选牌…');
    }


    // ───── v12 F5: 以下锦囊结算函数自 game-engine.js 整体迁入 (verbatim) ─────

      function executeGuohe1v1Pick(game, sourceActor, targetActor, zone, cardId) {
        var info = removeTargetZoneCard(game, targetActor, zone, cardId);
        if (!info || !info.card) {
          return fail('指定牌不存在或已被移除。');
        }
        discardCard(game, info.card);
        log(game, actorName(game, sourceActor) + '使用【过河拆桥】，弃置了' + actorName(game, targetActor) + (zone === 'equipment' ? '装备区' : '手牌') + '的【' + info.card.name + '】。');
        return success('弃置对方一张牌。');
      }

      function transferWeaponJiedao(game, sourceActor, opponentActor) {
        var opponentState = game[opponentActor];
        var weapon = opponentState.equipment && opponentState.equipment.weapon;
        if (!weapon) return success('【借刀杀人】无效果（目标无武器）。');
        moveCard(game, weapon, { zone: 'equipment', actor: opponentActor, slot: 'weapon' }, { zone: 'hand', actor: sourceActor });
        log(game, actorName(game, sourceActor) + '因【借刀杀人】获得【' + weapon.name + '】，置入手牌。');
        return success('借刀杀人获得武器。');
      }

      // v7 PR-9: 过河拆桥 1V1 — gltjk card__scroll.md：
      //   "你选择一项：1.弃置目标角色的装备区里的一张牌；2.观看目标角色的手牌
      //    并弃置其中一张牌。"
      // 调用方可通过 options.targetZone ('equipment' | 'hand') 直接指定（向后
      // 兼容老 UI）；'judge' 在 1V1 不合法。无显式选择时按 skillPreferences.guohe
      // (auto / ask / decline) 决定 — auto = 装备优先 → 手牌；ask = pendingChoice
      // 'guohe-1v1-pick' 暴露对手装备列表 + 手牌内容（spec: 选项 2 是 "观看
      // 目标角色的手牌并弃置其中一张"）。
      function resolveGuohe1v1(game, sourceActor, targetActor, options) {
        var target = game[targetActor];
        if (!target) return fail('未知角色。');
        var requestedZone = options && options.targetZone;
        if (requestedZone === 'judge') {
          return fail('1V1【过河拆桥】不能弃置判定区。');
        }
        if (requestedZone === 'equipment' || requestedZone === 'hand') {
          return executeGuohe1v1Pick(game, sourceActor, targetActor, requestedZone, options && options.targetCardId);
        }
        var sourceState = game[sourceActor];
        var pref = (sourceState && sourceState.skillPreferences && sourceState.skillPreferences.guohe)
          || (sourceActor === 'player' ? 'ask' : 'auto');
        if (pref === 'decline') {
          // spec 没说可放弃，但保留这个 toggle 以便测试 / future 扩展
          log(game, actorName(game, sourceActor) + '放弃【过河拆桥】结算。');
          return success('过河拆桥已取消。');
        }
        if (pref === 'ask') {
          setPendingChoice(game, {
            kind: 'guohe-1v1-pick',
            actor: sourceActor,
            target: targetActor,
            equipment: equipmentList(target).map(function (e) {
              return { slot: e.slot, cardId: e.card.id, name: e.card.name, suit: e.card.suit, rank: e.card.rank };
            }),
            hand: target.hand.map(function (c) {
              return { cardId: c.id, name: c.name, suit: c.suit, color: c.color, rank: c.rank };
            })
          });
          return success('【过河拆桥】等待发动者选择…');
        }
        // v8 PR-D2: 'auto' → 装备优先, 按 slot 影响排 (weapon > armor >
        // horsePlus > horseMinus). 武器影响进攻最大, 防具次之, 马最末.
        // 无装备时弃手牌, 手牌为空才完全无效。手牌信息对 source 是隐藏的,
        // 所以 hand[0] 随机选可接受。
        var equips = equipmentList(target);
        if (equips.length) {
          var slotPriority = { weapon: 1, armor: 2, horsePlus: 3, horseMinus: 4 };
          var sortedEquips = equips.slice().sort(function (a, b) {
            return (slotPriority[a.slot] || 9) - (slotPriority[b.slot] || 9);
          });
          return executeGuohe1v1Pick(game, sourceActor, targetActor, 'equipment', sortedEquips[0].card.id);
        }
        if (target.hand.length) {
          return executeGuohe1v1Pick(game, sourceActor, targetActor, 'hand', target.hand[0].id);
        }
        return success('过河拆桥无效果（对方两区均空）。');
      }

      function resolveGuohe1v1PickChoice(game, pending, decision) {
        var sourceActor = pending.actor;
        var targetActor = pending.target;
        var zone = decision && decision.zone;
        var cardId = decision && decision.cardId;
        if (zone !== 'equipment' && zone !== 'hand') {
          setPendingChoice(game, pending);
          return fail('请选择 equipment 或 hand。');
        }
        if (!cardId) {
          setPendingChoice(game, pending);
          return fail('请通过 cardId 指定具体牌。');
        }
        var result = executeGuohe1v1Pick(game, sourceActor, targetActor, zone, cardId);
        if (!result.ok) {
          setPendingChoice(game, pending);
          return result;
        }
        return result;
      }

      // v7 PR-7: 五谷丰登 — 顺序选牌循环。每个 picker：pool 仅余 1 张时强制
      // 取走（无可选项）；多张时按 skillPreferences.wugu 决定 auto/ask。
      // 暂停时 pauseState.wugu 保存 sourceActor / wuguCard / pool / order /
      // idx / options，由 resolveWuguPickChoice 续算。
      function processWuguPick(game, sourceActor, wuguCard, pool, order, idx, options) {
        // H1b-2: 逐目标无懈驱动 — 每名 picker 选牌前先开无懈窗口 (无懈只抵消
        // 「对一个目标」的效果, 五谷有 2 名目标各自可被无懈)。具体逻辑见
        // advanceWuguTargets / wuguPickForCurrent (定义在无懈续延区附近)。
        return advanceWuguTargets(game, {
          sourceActor: sourceActor,
          wuguCardId: wuguCard && wuguCard.id,
          pool: pool,
          order: order,
          idx: idx,
          options: options
        });
      }

      function resolveWuguPickChoice(game, pending, decision) {
        var saved = game.pauseState && game.pauseState.wugu;
        if (!saved) return fail('找不到【五谷丰登】的暂停状态。');
        var picker = pending.actor;
        var cardId = decision && decision.cardId;
        if (!cardId) {
          setPendingChoice(game, pending);
          return fail('请从亮出的牌中选择一张（用 cardId 指定）。');
        }
        var pool = saved.pool;
        var poolIdx = pool.findIndex(function (c) { return c.id === cardId; });
        if (poolIdx < 0) {
          setPendingChoice(game, pending);
          return fail('该牌不在【五谷丰登】的亮出池中。');
        }
        var picked = pool.splice(poolIdx, 1)[0];  // pool 是在途池, 不是区域
        putCard(game, picked, { zone: 'hand', actor: picker });
        log(game, actorName(game, picker) + '从【五谷丰登】选择获得【' + picked.name + '】。');
        // H1b-2: 该 picker 选完 → idx+1 回到逐目标驱动 (下一名先开无懈窗口),
        // pool 引用沿用 (累计 splice)。
        game.pauseState.wugu = null;
        return advanceWuguTargets(game, {
          sourceActor: saved.sourceActor,
          wuguCardId: saved.wuguCardId,
          pool: pool,
          order: saved.order,
          idx: saved.idx + 1,
          options: saved.options
        });
      }

      // v7 PR-5: 借刀杀人 — 两次合法性检测中的第二次（An 决定是否用杀时）。
      // 在 1v1 中 An = opponent，Bn = source。v12 H1: Bn 经 victimActor 显式
      // 传入 (缺省 sourceActor, 1v1 行为不变)。流程:
      //   1) 若 An 手牌没 杀 → 强制交武器 (transferWeaponToSource);
      //   2) 若 An 有 杀 但当下 Bn 已经不是合法目标（spec 第二次检测
      //      —— 比如 借刀 期间双方距离改变 / 装备改变） → 交武器;
      //   3) An 决定 use / decline；'auto'(AI 默认) = 直接 use；
      //      'ask' (player 默认) = pendingChoice 'jiedao-decision'.
      function resolveJiedaoDecision(game, sourceActor, opponentActor, jiedaoCard, options, victimActor) {
        var opponentState = game[opponentActor];
        var jdVictim = victimActor || sourceActor;
        if (!opponentState || !opponentState.equipment.weapon) {
          return success('【借刀杀人】无效果（目标无武器）。');
        }
        var hasSha = opponentState.hand.some(function (c) {
          return c && (c.type === 'sha' || c.type === 'fire_sha' || c.type === 'thunder_sha');
        });
        var canHit = game[jdVictim] && game[jdVictim].hp > 0
          && canReachWithSha(game, opponentActor, jdVictim)
          && !cardTargetProtection(game, opponentActor, jdVictim, { type: 'sha', color: 'black', name: '杀' }, '杀');
        if (!hasSha || !canHit) {
          if (!hasSha) {
            log(game, actorName(game, opponentActor) + '没有【杀】可用，交出武器。');
          } else {
            log(game, actorName(game, opponentActor) + '无法对' + actorName(game, jdVictim) + '使用【杀】，交出武器。');
          }
          return transferWeaponJiedao(game, sourceActor, opponentActor);
        }
        var pref = (opponentState.skillPreferences && opponentState.skillPreferences.jiedao)
          || (opponentActor === 'player' ? 'ask' : 'auto');
        if (pref === 'comply') pref = 'auto'; // synonym
        if (pref === 'ask') {
          setPendingChoice(game, {
            kind: 'jiedao-decision',
            actor: opponentActor,
            sourceActor: sourceActor,
            victimActor: jdVictim
          });
          return success('【借刀杀人】等待目标决定…');
        }
        // 'auto' → fire sha.
        return jiedaoFireOpponentSha(game, sourceActor, opponentActor, jdVictim);
      }

      function jiedaoFireOpponentSha(game, sourceActor, opponentActor, victimActor) {
        var opponentState = game[opponentActor];
        var borrowedSha = removeFirstCardOfType(opponentState, 'sha')
          || removeFirstCardOfType(opponentState, 'fire_sha')
          || removeFirstCardOfType(opponentState, 'thunder_sha');
        if (!borrowedSha) {
          return transferWeaponJiedao(game, sourceActor, opponentActor);
        }
        log(game, actorName(game, opponentActor) + '被【借刀杀人】驱使使用【' + borrowedSha.name + '】。');
        // v12 H1: 显式受害目标 (缺省 sourceActor — 1v1 中 playSha 的
        // defaultHostileTarget 本就落在使用者身上, 行为一致)。
        var shaResult = playSha(game, opponentActor, borrowedSha, { target: victimActor || sourceActor });
        if (!shaResult || !shaResult.ok) {
          // Second legality check failed at playSha entry (target protection / distance
          // changed since canPlayCard). Return sha to opponent's hand and transfer weapon.
          putCard(game, borrowedSha, { zone: 'hand', actor: opponentActor });
          log(game, '【杀】不再合法（second legality check）；交出武器。');
          return transferWeaponJiedao(game, sourceActor, opponentActor);
        }
        return shaResult;
      }

      function resolveJiedaoDecisionChoice(game, pending, decision) {
        var sourceActor = pending.sourceActor;
        var opponentActor = pending.actor;
        if (!game[sourceActor] || !game[opponentActor]) return fail('未知角色。');
        if (decision && (decision.decline || decision.fire === false)) {
          log(game, actorName(game, opponentActor) + '选择不出【杀】，交出武器。');
          return transferWeaponJiedao(game, sourceActor, opponentActor);
        }
        return jiedaoFireOpponentSha(game, sourceActor, opponentActor, pending.victimActor);
      }

      // v12 H2: 无双需求量按"决斗的另一方"判定 — 显式传入 demanderActor
      // (链内为 duelOtherParty), 未传时回退 opponent(responder) (1v1 旧行为)。
      function duelShaRequired(game, responder, demanderActor) {
        return hasSkill(game[demanderActor || opponent(responder)], 'wushuang') ? 2 : 1;
      }

      // v10 V6: 决斗 链状态机 — playDuel 启动, advanceDuelChain 推进.
      //   pauseState.duelChain = { starterActor, targetActor, currentResponder, reason }
      //   每轮: currentResponder 出杀; 出得出 → 切换到另一方; 出不了 → 受 1 伤, 链结束.
      //   玩家 (skillPreferences.shaDuelResponse='ask' + 有杀响应选项) 暂停;
      //   AI / 默认 走 consumeResponse 自动消耗 (有 sha / 转化即用).
      //   v12 H2: 决斗严格限定在 starterActor 与 targetActor 两方之间 —
      //   targetActor 显式传入 (多座席), 未传时回退 opponent(actor) (1v1)。
      function playDuel(game, actor, card, targetActor) {
        discardCard(game, card);
        log(game, actorName(game, actor) + '发起【决斗】。');
        if (!game.pauseState) game.pauseState = {};
        game.pauseState.duelChain = {
          starterActor: actor,
          targetActor: targetActor || opponent(actor),
          currentResponder: targetActor || opponent(actor),
          reason: '【决斗】',
          // L2: 保留决斗牌引用 — 奸雄可获得"造成伤害的牌" (决斗/南蛮/万箭/火攻)
          // v12 H7: 离间的虚拟决斗无实体 — 伤害不携带来源牌 (奸雄无可获得)
          card: card && card.virtual ? null : card
        };
        return advanceDuelChain(game);
      }

      // 决斗中 responder 的对手方 (双方之一; responder 恒为 starter/target 之一)。
      function duelOtherParty(chain, responder) {
        return responder === chain.starterActor ? chain.targetActor : chain.starterActor;
      }

      function advanceDuelChain(game) {
        var chain = game.pauseState && game.pauseState.duelChain;
        if (!chain) return fail('决斗链状态丢失。');
        if (game.phase === 'gameover') {
          game.pauseState.duelChain = null;
          return success('决斗结算完成。');
        }
        var responder = chain.currentResponder;
        var state = game[responder];
        var hasSha = hasShaResponseAvailable(state);

        // 玩家 ask + 有杀响应 → 暂停
        if (responder === 'player'
            && state.skillPreferences && state.skillPreferences.shaDuelResponse === 'ask'
            && hasSha) {
          return requestPlayerResponse(game, {
            kind: 'sha-duel-response',
            actor: 'player',
            pauseKey: 'duelChain',
            source: chain,
            options: listShaResponseOptions(state),
            meta: {
              reason: chain.reason,
              starterActor: chain.starterActor
            },
            logMessage: '等待' + actorName(game, 'player') + '决定是否打出【杀】响应' + chain.reason + '。',
            statusMessage: '等待玩家响应【决斗】。'
          });
        }

        // 非玩家 ask 路径: AI / 默认 — 走原 consumeResponse 自动消耗
        // v11 C1: 无双 — 对方为吕布时每轮需依次打出两张【杀】。
        var duelNeeded = duelShaRequired(game, responder, duelOtherParty(chain, responder));
        var duelPaid = 0;
        while (duelPaid < duelNeeded && consumeResponse(game, responder, 'sha', chain.reason)) {
          duelPaid += 1;
        }
        if (duelPaid === duelNeeded) {
          chain.currentResponder = duelOtherParty(chain, responder);
          return advanceDuelChain(game);
        }
        // v12 H7: 激将 — AI 主公打不齐【杀】时求助蜀势力座席: 玩家可代打 →
        // 挂起询问 (链保留, resolver 收尾); AI 座席 → 同步接力。
        if (lordAidPlayerCanAid && lordAidPlayerCanAid(game, responder, 'jijiang')) {
          chain.aidPaid = duelPaid;
          chain.aidNeeded = duelNeeded;
          return requestPlayerResponse(game, {
            kind: 'jijiang-aid',
            actor: 'player',
            pauseKey: 'duelChain',
            source: chain,
            options: listShaResponseOptions(game.player),
            meta: { lordActor: responder, reason: chain.reason, aidSkill: 'jijiang' },
            logMessage: '等待' + actorName(game, 'player') + '决定是否响应【激将】代打【杀】。',
            statusMessage: '等待玩家护主响应。'
          });
        }
        while (duelPaid < duelNeeded && tryLordAidSync && tryLordAidSync(game, responder, 'jijiang', chain.reason)) {
          duelPaid += 1;
        }
        if (duelPaid === duelNeeded) {
          chain.currentResponder = duelOtherParty(chain, responder);
          return advanceDuelChain(game);
        }
        if (duelNeeded > 1) {
          log(game, '【无双】锁定：' + actorName(game, responder) + '未能打出两张【杀】。');
        }
        // 无杀 → 受 1 伤 (来源=决斗另一方), 链结束
        var loser = responder;
        game.pauseState.duelChain = null;
        damage(game, loser, 1, duelOtherParty(chain, loser), chain.reason, chain.card);
        return success('决斗结算完成。');
      }

      // resolver — 玩家 sha-duel-response pendingChoice 决定.
      // v12 H2: 对方/伤害来源 = duelOtherParty(chain, 'player') (跨座席决斗)。
      function resolveDuelResponseChoice(game, pending, decision) {
        var chain = game.pauseState && game.pauseState.duelChain;
        if (!chain) return fail('找不到决斗响应的暂停状态。');
        var duelFoe = duelOtherParty(chain, 'player');

        if (decision.cardId || decision.use) {
          var consumed = consumeResponse(game, 'player', 'sha', chain.reason, decision.cardId || null);
          if (!consumed) {
            // 罕见: 指定的 cardId 无效或库中此牌已不可用 → 视为放弃
            log(game, actorName(game, 'player') + '没有可打出的【杀】。');
            game.pauseState.duelChain = null;
            damage(game, 'player', 1, duelFoe, chain.reason, chain.card);
            return success('决斗结算完成。');
          }
          // v11 C1: 无双 — 玩家每轮需依次两张【杀】; 首张后剩余 >0 则再询问。
          if (chain.shaRemaining === undefined || chain.shaRemaining === null) {
            chain.shaRemaining = duelShaRequired(game, 'player', duelFoe);
          }
          chain.shaRemaining -= 1;
          if (chain.shaRemaining > 0) {
            if (hasShaResponseAvailable(game.player)) {
              log(game, '【无双】：' + actorName(game, 'player') + '需再打出一张【杀】。');
              return advanceDuelChain(game);
            }
            log(game, '【无双】锁定：' + actorName(game, 'player') + '无法打出第二张【杀】。');
            game.pauseState.duelChain = null;
            damage(game, 'player', 1, duelFoe, chain.reason, chain.card);
            return success('决斗结算完成。');
          }
          chain.shaRemaining = null;
          chain.currentResponder = duelFoe;
          return advanceDuelChain(game);
        }
        // 玩家放弃出杀 → v12 H7: 玩家为主公时先求助蜀势力 AI 座席 (激将);
        // 无人代打或非主公 → 受 1 伤
        log(game, actorName(game, 'player') + '选择不打出【杀】响应' + chain.reason + '。');
        if (tryLordAidSync) {
          var aidNeeded = duelShaRequired(game, 'player', duelFoe);
          var aidPaid = 0;
          while (aidPaid < aidNeeded && tryLordAidSync(game, 'player', 'jijiang', chain.reason)) {
            aidPaid += 1;
          }
          if (aidPaid === aidNeeded) {
            chain.shaRemaining = null;
            chain.currentResponder = duelFoe;
            return advanceDuelChain(game);
          }
        }
        game.pauseState.duelChain = null;
        damage(game, 'player', 1, duelFoe, chain.reason, chain.card);
        return success('决斗结算完成。');
      }

      // v12 H2: AOE 逐座席结算队列 — 目标 = 来源下家起顺时针全部存活座席
      // (官方 "所有其他角色")。playAOE 建队列, advanceAOETargets 推进; 玩家
      // 座席 ask 暂停 (kind/pauseKey 沿用 wanjian-response 三件套), 濒死暂停
      // 时挂起, 由 resumeSuspendedTurnFlowIfReady 的 aoe 分支续跑。
      // 1v1 队列恰为 [对方单人] → 与旧单目标行为逐步一致。
      function playAOE(game, actor, card, responseType, title) {
        discardCard(game, card);
        log(game, actorName(game, actor) + '使用【' + title + '】。');
        if (!game.pauseState) game.pauseState = {};
        game.pauseState.aoe = {
          sourceActor: actor,
          // L2: 保留实体牌引用 — 奸雄可获得造成伤害的南蛮/万箭实体牌
          card: card,
          responseType: responseType,
          title: title,
          order: seatsFrom(game, actor, false),
          idx: 0
        };
        return advanceAOETargets(game);
      }

      function advanceAOETargets(game) {
        var aoe = game.pauseState && game.pauseState.aoe;
        if (!aoe) return fail('AOE 结算状态丢失。');
        var responseType = aoe.responseType;
        var title = aoe.title;
        while (aoe.idx < aoe.order.length) {
          if (game.phase === 'gameover') break;
          var targetActor = aoe.order[aoe.idx];
          var targetState = game[targetActor];
          // 结算时点已死亡的座席不再是目标 (期间可能因铁索传导等倒下)
          if (!targetState || targetState.hp <= 0) {
            aoe.idx += 1;
            continue;
          }
          // v12 H1: 座席级目标保护 (谦逊类 onCardTarget) — 被保护座席跳过。
          // 现有钩子均不覆盖南蛮/万箭 (行为不变), 为同疾等 3p 技能预留。
          var aoeProtection = cardTargetProtection(game, aoe.sourceActor, targetActor, aoe.card);
          if (aoeProtection) {
            log(game, aoeProtection.message);
            aoe.idx += 1;
            continue;
          }
          // v10 V4: 万箭齐发 (responseType='shan') + 玩家为目标 + shanResponse=ask +
          // 有闪可响应 → 暂停, 让玩家自选闪 / 不出. 引擎默认仍走自动响应.
          if (responseType === 'shan' && targetActor === 'player') {
            var aoeTarget = game.player;
            if (aoeTarget.skillPreferences && aoeTarget.skillPreferences.shanResponse === 'ask'
                && hasShanResponseAvailable(aoeTarget)) {
              aoe.idx += 1;  // 玩家座席结果由 resolver 收尾, 游标先行越过
              return requestPlayerResponse(game, {
                kind: 'wanjian-response',
                actor: 'player',
                pauseKey: 'wanjianResponse',
                source: { sourceActor: aoe.sourceActor, title: title, card: aoe.card },
                options: listShanResponseOptions(aoeTarget),
                meta: { sourceActor: aoe.sourceActor, sourceName: title },
                logMessage: '等待' + actorName(game, 'player') + '决定是否打出【闪】响应【' + title + '】。',
                statusMessage: '等待玩家响应【' + title + '】。'
              });
            }
          }
          aoe.idx += 1;
          // v11 D2 (批次 34): AI 座席先试八卦判定 (免费闪机会), 成功则省下
          // 真闪应对后续威胁; 玩家 auto 座席保持旧顺序 (真闪优先)。
          if (responseType === 'shan' && targetActor !== 'player'
              && tryBaguaDodge(game, targetActor, false)) {
            log(game, actorName(game, targetActor) + '成功化解【' + title + '】。');
          } else if (consumeResponse(game, targetActor, responseType, '【' + title + '】')) {
            log(game, actorName(game, targetActor) + '成功化解【' + title + '】。');
          } else if (responseType === 'shan' && targetActor === 'player' && tryBaguaDodge(game, targetActor, false)) {
            // H2: 【万箭齐发】需打出【闪】, 八卦阵 红判定可化解。
            //      (【南蛮入侵】需【杀】, responseType==='sha', 不触发八卦)
            log(game, actorName(game, targetActor) + '成功化解【' + title + '】。');
          } else {
            // v12 H7: 激将/护驾 — 主公座席打不出所需牌时求助同势力:
            // AI 主公 + 玩家可代打 → 挂起询问; 其余 → AI 座席同步接力。
            var aoeAidSkill = responseType === 'sha' ? 'jijiang' : 'hujia';
            if (targetActor !== 'player' && lordAidPlayerCanAid
                && lordAidPlayerCanAid(game, targetActor, aoeAidSkill)) {
              return requestPlayerResponse(game, {
                kind: aoeAidSkill + '-aid',
                actor: 'player',
                pauseKey: 'lordAidAOE',
                source: { lordActor: targetActor, title: title, responseType: responseType, sourceActor: aoe.sourceActor, card: aoe.card },
                options: responseType === 'sha' ? listShaResponseOptions(game.player) : listShanResponseOptions(game.player),
                meta: { lordActor: targetActor, sourceName: title, aidSkill: aoeAidSkill },
                logMessage: '等待' + actorName(game, 'player') + '决定是否响应【' + (aoeAidSkill === 'jijiang' ? '激将' : '护驾') + '】。',
                statusMessage: '等待玩家护主响应。'
              });
            }
            if (tryLordAidSync && tryLordAidSync(game, targetActor, aoeAidSkill, '【' + title + '】')) {
              log(game, actorName(game, targetActor) + '成功化解【' + title + '】。');
            } else {
              damage(game, targetActor, 1, aoe.sourceActor, '【' + title + '】', aoe.card);
              // 濒死救援等选择挂起 → 保留 aoe 队列, 选择排空后续跑剩余座席
              if (game.pendingChoice) {
                return success('【' + title + '】等待濒死结算…');
              }
            }
          }
        }
        game.pauseState.aoe = null;
        return success(title + '结算完成。');
      }

      // v10 V4: 万箭齐发 闪响应 — 玩家 decision 决定 化解 / damage(1).
      // saved.sourceActor 是万箭来源, saved.title 是显示文案.
      // v12 H2: 玩家座席收尾后继续推进 AOE 队列剩余座席。
      function resolveWanjianResponseChoice(game, pending, decision) {
        var saved = game.pauseState && game.pauseState.wanjianResponse;
        if (!saved) return fail('找不到【万箭齐发】响应的暂停状态。');
        game.pauseState.wanjianResponse = null;
        var sourceActor = saved.sourceActor;
        var title = saved.title || '万箭齐发';
        var dodged = false;
        if (decision.cardId) {
          dodged = consumeResponse(game, 'player', 'shan', '【' + title + '】', decision.cardId);
          if (!dodged) log(game, actorName(game, 'player') + '指定的牌无法当【闪】。');
        } else if (decision.use) {
          dodged = consumeResponse(game, 'player', 'shan', '【' + title + '】');
          if (!dodged) log(game, actorName(game, 'player') + '没有可打出的【闪】。');
        } else {
          log(game, actorName(game, 'player') + '选择不打出【闪】响应【' + title + '】。');
        }
        // H2: 玩家未以【闪】化解 (放弃 / 无闪 / 指定牌无效) → 八卦阵 红判定可化解。
        if (!dodged && tryBaguaDodge(game, 'player', false)) {
          dodged = true;
        }
        // v12 H7: 玩家为主公时求助魏势力 AI 座席代打【闪】(护驾)。
        if (!dodged && tryLordAidSync && tryLordAidSync(game, 'player', 'hujia', '【' + title + '】')) {
          dodged = true;
        }
        if (dodged) {
          log(game, actorName(game, 'player') + '成功化解【' + title + '】。');
        } else {
          damage(game, 'player', 1, sourceActor, '【' + title + '】', saved.card);
        }
        // v12 H2: 队列尚有剩余座席且未被濒死等选择挂起 → 继续推进;
        // 挂起时交给 resumeSuspendedTurnFlowIfReady 的 aoe 分支续跑。
        if (game.pauseState.aoe && !game.pendingChoice && game.phase !== 'gameover') {
          return advanceAOETargets(game);
        }
        if (game.pauseState.aoe && game.phase === 'gameover') {
          game.pauseState.aoe = null;
        }
        return success(title + '响应完成。');
      }

      // L1 (审计二轮): 火攻 "目标展示一张手牌" 是目标的选择, 此前恒取
      // hand[0] (确定性泄露 + 目标无选择权)。现在: AI / 'auto' (默认) 目标用
      // 游戏 RNG 随机挑一张并缓存 (pauseState.huogongReveal), 同一次结算内
      // getHuogongChoice 预览 / playCard 校验 / 结算三处一致; 玩家目标可设
      // skillPreferences.huogongShow='ask' 经 pendingChoice 'huogong-show'
      // 自选 (默认 auto, 避免 UI 无对应面板时卡死)。
      function peekHuogongReveal(game, targetActor) {
        var targetState = game[targetActor];
        if (!targetState || !targetState.hand || !targetState.hand.length) return null;
        if (!game.pauseState) game.pauseState = {};
        var cached = game.pauseState.huogongReveal;
        if (cached && cached.targetActor === targetActor) {
          var cachedCard = targetState.hand.find(function (c) { return c.id === cached.cardId; });
          if (cachedCard) return cachedCard;
        }
        var pref = (targetState.skillPreferences && targetState.skillPreferences.huogongShow) || 'auto';
        if (targetActor === 'player' && pref === 'ask') return null;
        var picked = targetState.hand[randomHandIndex(game, targetState)];
        game.pauseState.huogongReveal = { targetActor: targetActor, cardId: picked.id };
        return picked;
      }

      // v12 H1: 可选 targetActor — UI/预校验按显式目标预览; 缺省 1v1 对手。
      function getHuogongChoice(game, actor, targetActor) {
        var hgTarget = targetActor || opponent(actor);
        var self = game && game[actor];
        var target = game && game[hgTarget];
        if (!self || !target || !target.hand || !target.hand.length) {
          return { ok: false, revealedCard: null, usableCostIds: [], unusableCostIds: [], usableCards: [], unusableCards: [], message: '目标没有手牌。' };
        }
        var revealed = peekHuogongReveal(game, hgTarget);
        if (!revealed) {
          return { ok: false, pendingTargetChoice: true, revealedCard: null, usableCostIds: [], unusableCostIds: [], usableCards: [], unusableCards: [], message: '等待目标选择展示牌。' };
        }
        var usableCards = [];
        var unusableCards = [];
        self.hand.forEach(function (card) {
          if (card.type === 'huogong') return;
          if (card.suit === revealed.suit) usableCards.push(card);
          else unusableCards.push(card);
        });
        return {
          ok: true,
          revealedCard: revealed,
          revealedSuit: revealed.suit,
          usableCards: usableCards,
          unusableCards: unusableCards,
          usableCostIds: usableCards.map(function (card) { return card.id; }),
          unusableCostIds: unusableCards.map(function (card) { return card.id; })
        };
      }

      // 全部目标处理完 → 剩余亮出牌进弃牌堆。
      function finishWugu(game, ctx) {
        if (ctx.pool.length) {
          ctx.pool.forEach(function (rem) {
            discardCard(game, rem);
            log(game, '【五谷丰登】剩余【' + rem.name + '】置入弃牌堆。');
          });
          ctx.pool.length = 0;
        }
        return success('五谷丰登结算完成。');
      }

    return {
      // v12 F5: 迁入的锦囊结算面
      playDuel: playDuel,
      advanceDuelChain: advanceDuelChain,
      resolveDuelResponseChoice: resolveDuelResponseChoice,
      playAOE: playAOE,
      advanceAOETargets: advanceAOETargets,
      resolveWanjianResponseChoice: resolveWanjianResponseChoice,
      peekHuogongReveal: peekHuogongReveal,
      getHuogongChoice: getHuogongChoice,
      resolveJiedaoDecision: resolveJiedaoDecision,
      resolveJiedaoDecisionChoice: resolveJiedaoDecisionChoice,
      jiedaoFireOpponentSha: jiedaoFireOpponentSha,
      resolveGuohe1v1: resolveGuohe1v1,
      resolveGuohe1v1PickChoice: resolveGuohe1v1PickChoice,
      resolveWuguPickChoice: resolveWuguPickChoice,
      processWuguPick: processWuguPick,
      finishWugu: finishWugu,
      duelShaRequired: duelShaRequired,
      registerWuxieContinuation: registerWuxieContinuation,
      listWuxieOptions: listWuxieOptions,
      hasWuxieResponseAvailable: hasWuxieResponseAvailable,
      checkWuxieAndContinue: checkWuxieAndContinue,
      advanceWuxieChain: advanceWuxieChain,
      settleWuxieChain: settleWuxieChain,
      advanceTaoyuanTargets: advanceTaoyuanTargets,
      advanceWuguTargets: advanceWuguTargets,
      wuguPickForCurrent: wuguPickForCurrent
    };
  }
