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
        // v11 D1 (批次 33): AI 座席不再"有无懈就用" — 期望值为负时保留
        // (aiShouldUseWuxie, 由 ai 域注入)。玩家默认 auto 座席保持旧行为
        // (UI 玩家走 ask 路径), 反无懈 (chain.wuxied) 亦保持旧行为。
        var evHold = responder !== 'player'
          && aiShouldUseWuxie && !aiShouldUseWuxie(game, responder, chain);
        if (evHold) {
          log(game, actorName(game, responder) + '保留【无懈可击】。');
          return settleWuxieChain(game);
        }
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
      // 在 1v1 中 An = opponent，Bn = source。 流程:
      //   1) 若 opponent 手牌没 杀 → 强制交武器 (transferWeaponToSource);
      //   2) 若 opponent 有 杀 但当下 source 已经不是合法目标（spec 第二次检测
      //      —— 比如 借刀 期间双方距离改变 / 装备改变） → 交武器;
      //   3) opponent 决定 use / decline；'auto'(AI 默认) = 直接 use；
      //      'ask' (player 默认) = pendingChoice 'jiedao-decision'.
      function resolveJiedaoDecision(game, sourceActor, opponentActor, jiedaoCard, options) {
        var opponentState = game[opponentActor];
        if (!opponentState || !opponentState.equipment.weapon) {
          return success('【借刀杀人】无效果（目标无武器）。');
        }
        var hasSha = opponentState.hand.some(function (c) {
          return c && (c.type === 'sha' || c.type === 'fire_sha' || c.type === 'thunder_sha');
        });
        var canHit = canReachWithSha(game, opponentActor, sourceActor)
          && !cardTargetProtection(game, opponentActor, sourceActor, { type: 'sha', color: 'black', name: '杀' }, '杀');
        if (!hasSha || !canHit) {
          if (!hasSha) {
            log(game, actorName(game, opponentActor) + '没有【杀】可用，交出武器。');
          } else {
            log(game, actorName(game, opponentActor) + '无法对' + actorName(game, sourceActor) + '使用【杀】，交出武器。');
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
            sourceActor: sourceActor
          });
          return success('【借刀杀人】等待目标决定…');
        }
        // 'auto' → fire sha.
        return jiedaoFireOpponentSha(game, sourceActor, opponentActor);
      }

      function jiedaoFireOpponentSha(game, sourceActor, opponentActor) {
        var opponentState = game[opponentActor];
        var borrowedSha = removeFirstCardOfType(opponentState, 'sha')
          || removeFirstCardOfType(opponentState, 'fire_sha')
          || removeFirstCardOfType(opponentState, 'thunder_sha');
        if (!borrowedSha) {
          return transferWeaponJiedao(game, sourceActor, opponentActor);
        }
        log(game, actorName(game, opponentActor) + '被【借刀杀人】驱使使用【' + borrowedSha.name + '】。');
        var shaResult = playSha(game, opponentActor, borrowedSha);
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
        return jiedaoFireOpponentSha(game, sourceActor, opponentActor);
      }

      function duelShaRequired(game, responder) {
        return hasSkill(game[opponent(responder)], 'wushuang') ? 2 : 1;
      }

      // v10 V6: 决斗 链状态机 — playDuel 启动, advanceDuelChain 推进.
      //   pauseState.duelChain = { starterActor, currentResponder, reason }
      //   每轮: currentResponder 出杀; 出不出 → 切换; 出不了 → 受 1 伤, 链结束.
      //   玩家 (skillPreferences.shaDuelResponse='ask' + 有杀响应选项) 暂停;
      //   AI / 默认 走 consumeResponse 自动消耗 (有 sha / 转化即用).
      function playDuel(game, actor, card) {
        discardCard(game, card);
        log(game, actorName(game, actor) + '发起【决斗】。');
        if (!game.pauseState) game.pauseState = {};
        game.pauseState.duelChain = {
          starterActor: actor,
          currentResponder: opponent(actor),
          reason: '【决斗】',
          // L2: 保留决斗牌引用 — 奸雄可获得"造成伤害的牌" (决斗/南蛮/万箭/火攻)
          card: card
        };
        return advanceDuelChain(game);
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
        // v11 C1: 无双 — 对手为吕布时每轮需依次打出两张【杀】。
        var duelNeeded = duelShaRequired(game, responder);
        var duelPaid = 0;
        while (duelPaid < duelNeeded && consumeResponse(game, responder, 'sha', chain.reason)) {
          duelPaid += 1;
        }
        if (duelPaid === duelNeeded) {
          chain.currentResponder = opponent(responder);
          return advanceDuelChain(game);
        }
        if (duelNeeded > 1) {
          log(game, '【无双】锁定：' + actorName(game, responder) + '未能打出两张【杀】。');
        }
        // 无杀 → 受 1 伤, 链结束
        var loser = responder;
        game.pauseState.duelChain = null;
        damage(game, loser, 1, opponent(loser), chain.reason, chain.card);
        return success('决斗结算完成。');
      }

      // resolver — 玩家 sha-duel-response pendingChoice 决定.
      function resolveDuelResponseChoice(game, pending, decision) {
        var chain = game.pauseState && game.pauseState.duelChain;
        if (!chain) return fail('找不到决斗响应的暂停状态。');

        if (decision.cardId || decision.use) {
          var consumed = consumeResponse(game, 'player', 'sha', chain.reason, decision.cardId || null);
          if (!consumed) {
            // 罕见: 指定的 cardId 无效或库中此牌已不可用 → 视为放弃
            log(game, actorName(game, 'player') + '没有可打出的【杀】。');
            var ploser = 'player';
            game.pauseState.duelChain = null;
            damage(game, ploser, 1, opponent(ploser), chain.reason, chain.card);
            return success('决斗结算完成。');
          }
          // v11 C1: 无双 — 玩家每轮需依次两张【杀】; 首张后剩余 >0 则再询问。
          if (chain.shaRemaining === undefined || chain.shaRemaining === null) {
            chain.shaRemaining = duelShaRequired(game, 'player');
          }
          chain.shaRemaining -= 1;
          if (chain.shaRemaining > 0) {
            if (hasShaResponseAvailable(game.player)) {
              log(game, '【无双】：' + actorName(game, 'player') + '需再打出一张【杀】。');
              return advanceDuelChain(game);
            }
            log(game, '【无双】锁定：' + actorName(game, 'player') + '无法打出第二张【杀】。');
            game.pauseState.duelChain = null;
            damage(game, 'player', 1, opponent('player'), chain.reason, chain.card);
            return success('决斗结算完成。');
          }
          chain.shaRemaining = null;
          chain.currentResponder = opponent('player');
          return advanceDuelChain(game);
        }
        // 玩家放弃出杀 → 受 1 伤
        log(game, actorName(game, 'player') + '选择不打出【杀】响应' + chain.reason + '。');
        game.pauseState.duelChain = null;
        damage(game, 'player', 1, opponent('player'), chain.reason, chain.card);
        return success('决斗结算完成。');
      }

      function playAOE(game, actor, card, responseType, title) {
        var targetActor = opponent(actor);
        discardCard(game, card);
        log(game, actorName(game, actor) + '使用【' + title + '】。');
        // v10 V4: 万箭齐发 (responseType='shan') + 玩家为目标 + shanResponse=ask +
        // 有闪可响应 → 暂停, 让玩家自选闪 / 不出. 引擎默认仍走自动响应.
        if (responseType === 'shan' && targetActor === 'player') {
          var aoeTarget = game.player;
          if (aoeTarget.skillPreferences && aoeTarget.skillPreferences.shanResponse === 'ask'
              && hasShanResponseAvailable(aoeTarget)) {
            return requestPlayerResponse(game, {
              kind: 'wanjian-response',
              actor: 'player',
              pauseKey: 'wanjianResponse',
              source: { sourceActor: actor, title: title, card: card },
              options: listShanResponseOptions(aoeTarget),
              meta: { sourceActor: actor, sourceName: title },
              logMessage: '等待' + actorName(game, 'player') + '决定是否打出【闪】响应【' + title + '】。',
              statusMessage: '等待玩家响应【' + title + '】。'
            });
          }
        }
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
          // L2: 传 card — 奸雄可获得造成伤害的南蛮/万箭实体牌
          damage(game, targetActor, 1, actor, '【' + title + '】', card);
        }
        return success(title + '结算完成。');
      }

      // v10 V4: 万箭齐发 闪响应 — 玩家 decision 决定 化解 / damage(1).
      // saved.sourceActor 是万箭来源, saved.title 是显示文案.
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
        if (dodged) {
          log(game, actorName(game, 'player') + '成功化解【' + title + '】。');
        } else {
          damage(game, 'player', 1, sourceActor, '【' + title + '】', saved.card);
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

      function getHuogongChoice(game, actor) {
        var self = game && game[actor];
        var target = game && game[opponent(actor)];
        if (!self || !target || !target.hand || !target.hand.length) {
          return { ok: false, revealedCard: null, usableCostIds: [], unusableCostIds: [], usableCards: [], unusableCards: [], message: '目标没有手牌。' };
        }
        var revealed = peekHuogongReveal(game, opponent(actor));
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
