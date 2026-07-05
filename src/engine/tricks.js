  // v11 B1: 锦囊域模块 (第一步: 无懈链框架) — WUXIE_CONTINUATIONS 注册表 /
  // checkWuxieAndContinue / advanceWuxieChain / settleWuxieChain /
  // resolveWuxieResponseChoice, 从 game-engine.js 整体迁出, 函数体逐行一致。
  // 各锦囊的 continuation (juedou/guohe/... 结算收尾) 暂留引擎, 经
  // registerWuxieContinuation 注册进来; 后续批次随锦囊结算函数一并迁入。
  import { StateRuntime } from './state.js';

  var actorName = StateRuntime.actorName;
  var opponent = StateRuntime.opponent;

  export function createTricksRuntime(deps) {
    var log = deps.log;
    var success = deps.success;
    var fail = deps.fail;
    var consumeWuxie = deps.consumeWuxie;
    var requestPlayerResponse = deps.requestPlayerResponse;
    var registerResponseKind = deps.registerResponseKind;

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

    return {
      registerWuxieContinuation: registerWuxieContinuation,
      listWuxieOptions: listWuxieOptions,
      hasWuxieResponseAvailable: hasWuxieResponseAvailable,
      checkWuxieAndContinue: checkWuxieAndContinue,
      advanceWuxieChain: advanceWuxieChain,
      settleWuxieChain: settleWuxieChain
    };
  }
