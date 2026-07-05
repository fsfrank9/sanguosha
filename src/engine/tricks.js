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
    var finishWugu = deps.finishWugu;
    var peekHuogongReveal = deps.peekHuogongReveal;
    var playAOE = deps.playAOE;
    var playDuel = deps.playDuel;
    var removeCardFromHand = deps.removeCardFromHand;
    var removeFirstMatchingCard = deps.removeFirstMatchingCard;
    var removeTargetZoneCard = deps.removeTargetZoneCard;
    var resolveGuohe1v1 = deps.resolveGuohe1v1;
    var resolveJiedaoDecision = deps.resolveJiedaoDecision;
    var scoreCardForAI = deps.scoreCardForAI;

    // v10 V5: 无懈可击 链式响应 框架.
    //   每张锦囊触发 wuxie 检查: 先问 target 是否无懈; 若是, 再问 source 是否反无懈;
    //   依次交替, 直至某方放弃或无牌. 玩家方 (skillPreferences.wuxieResponse='ask')
    //   暂停; AI 方默认 auto-use (有无懈则用).
    //
    //   pauseState.wuxieChain = {
    //     trickName,         // 'juedou' / 'guohe' / 'shunshou' / 'huogong' / 'jiedao'
    //     ctx,               // 继续逻辑的上下文 (actor, card, options...)
    //     reason,            // 日志/文案用 (e.g. '【决斗】')
    //     currentResponder,  // 'player' | 'enemy' — 当前轮到谁决定
    //     wuxied             // bool — 当前 net 抵消态 (false=锦囊通过, true=已被抵消)
    //   }
    //
    //   每用一次无懈即翻转 wuxied + 切换 currentResponder.
    //   链结束时 settleWuxieChain 调 WUXIE_CONTINUATIONS[trickName] 完成结算.
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
    function checkWuxieAndContinue(game, targetActor, reason, trickName, ctx) {
      if (!game.pauseState) game.pauseState = {};
      game.pauseState.wuxieChain = {
        trickName: trickName,
        ctx: ctx,
        reason: reason,
        currentResponder: targetActor,
        wuxied: false
      };
      return advanceWuxieChain(game);
    }

    // 链推进: 据 chain.currentResponder 决定 暂停 (玩家 ask + 有无懈) /
    // AI auto-use (有无懈则用) / 结算 (无无懈).
    function advanceWuxieChain(game) {
      var chain = game.pauseState && game.pauseState.wuxieChain;
      if (!chain) return fail('无懈链状态丢失。');
      var responder = chain.currentResponder;
      var state = game[responder];
      var hasWuxie = hasWuxieResponseAvailable(state);

      // 玩家 ask 路径 — 暂停等待玩家
      if (responder === 'player'
          && state.skillPreferences && state.skillPreferences.wuxieResponse === 'ask'
          && hasWuxie) {
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
      if (hasWuxie) {
        consumeWuxie(game, responder, chain.reason);
        chain.wuxied = !chain.wuxied;
        chain.currentResponder = opponent(responder);
        return advanceWuxieChain(game);
      }

      // 无无懈 → 结算
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
    function resolveWuxieResponseChoice(game, pending, decision) {
      var chain = game.pauseState && game.pauseState.wuxieChain;
      if (!chain) return fail('找不到无懈响应的暂停状态。');

      if (decision.cardId || decision.use) {
        var used = consumeWuxie(game, 'player', chain.reason, decision.cardId || null);
        if (!used) {
          log(game, actorName(game, 'player') + '没有可打出的【无懈可击】。');
          return settleWuxieChain(game);
        }
        chain.wuxied = !chain.wuxied;
        chain.currentResponder = opponent('player');
        return advanceWuxieChain(game);
      }
      // 玩家放弃响应 → 结算
      log(game, actorName(game, 'player') + '选择不打出【无懈可击】响应' + chain.reason + '。');
      return settleWuxieChain(game);
    }

    registerResponseKind('wuxie-response', resolveWuxieResponseChoice);

    // v10 V5: 无懈链 settle 时调用. ctx = { actor, card, options }.
    // wuxied: true → 锦囊被抵消; false → 锦囊照常结算.

    registerWuxieContinuation('juedou', function (game, ctx, wuxied) {
      if (wuxied) {
        discardCard(game, ctx.card);
        return finishTrickUse(game, ctx.actor, ctx.card, success('决斗被无懈可击。'), ctx.options);
      }
      return finishTrickUse(game, ctx.actor, ctx.card, playDuel(game, ctx.actor, ctx.card), ctx.options);
    });

    registerWuxieContinuation('guohe', function (game, ctx, wuxied) {
      // 注意: guohe 在调 checkWuxieAndContinue 前已 discardCard. wuxied 仅影响后续动作.
      if (wuxied) {
        return finishTrickUse(game, ctx.actor, ctx.card, success('过河拆桥被无懈可击。'), ctx.options);
      }
      return finishTrickUse(game, ctx.actor, ctx.card,
        resolveGuohe1v1(game, ctx.actor, opponent(ctx.actor), ctx.options), ctx.options);
    });

    registerWuxieContinuation('shunshou', function (game, ctx, wuxied) {
      if (wuxied) {
        return finishTrickUse(game, ctx.actor, ctx.card, success('顺手牵羊被无懈可击。'), ctx.options);
      }
      var self = game[ctx.actor];
      var opt = ctx.options || {};
      var stolenInfo = removeTargetZoneCard(game, opponent(ctx.actor), opt.targetZone, opt.targetCardId);
      if (stolenInfo && stolenInfo.card) {
        putCard(game, stolenInfo.card, { zone: 'hand', actor: ctx.actor });
        log(game, actorName(game, ctx.actor) + '使用【顺手牵羊】，获得了'
          + actorName(game, opponent(ctx.actor)) + stolenInfo.zone + '的一张牌。');
      }
      return finishTrickUse(game, ctx.actor, ctx.card, success('获得对方一张牌。'), ctx.options);
    });

    registerWuxieContinuation('huogong', function (game, ctx, wuxied) {
      if (wuxied) {
        return finishTrickUse(game, ctx.actor, ctx.card, success('火攻被无懈可击。'), ctx.options);
      }
      var fireTarget = game[opponent(ctx.actor)];
      if (!fireTarget.hand.length) {
        return finishTrickUse(game, ctx.actor, ctx.card, success('目标没有手牌，火攻未造成伤害。'), ctx.options || {});
      }
      // L1: 目标选展示牌 — AI/auto 随机 (缓存保证与预览一致); 玩家 ask → 暂停。
      var revealed = peekHuogongReveal(game, opponent(ctx.actor));
      if (!revealed) {
        game.pauseState.huogong = ctx;
        setPendingChoice(game, {
          kind: 'huogong-show',
          actor: opponent(ctx.actor),
          cardIds: fireTarget.hand.map(function (c) { return c.id; })
        });
        return success('等待目标选择【火攻】展示牌。');
      }
      return runHuogongResolution(game, ctx, revealed);
    });

    function runHuogongResolution(game, ctx, revealed) {
      var self = game[ctx.actor];
      var opt = ctx.options || {};
      game.pauseState.huogongReveal = null; // 本次结算已消费缓存
      log(game, actorName(game, opponent(ctx.actor)) + '展示【' + revealed.name + '】（' + revealed.suit + '）。');
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
      damage(game, opponent(ctx.actor), 1, ctx.actor, '【火攻】', ctx.card, 'fire');
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
      var weaponOwner = game[opponent(ctx.actor)];
      if (!weaponOwner.equipment.weapon) {
        return finishTrickUse(game, ctx.actor, ctx.card, success('目标没有武器，借刀杀人无效果。'), ctx.options);
      }
      return finishTrickUse(game, ctx.actor, ctx.card,
        resolveJiedaoDecision(game, ctx.actor, opponent(ctx.actor), ctx.card, ctx.options), ctx.options);
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

    return {
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
