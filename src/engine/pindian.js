  // v15 T: 拼点 (rank compare) 域模块 — 全新机制, 火包 驱虎/天义 的前置,
  // 后续 林包烈刃 / 山包制霸 / SP 间书 同样依赖, 故做成通用框架。
  //
  // 官方流程 (逐字, flow__rankcompare.md):
  //   (1) 进行拼点时: 拼点的发起者选择拼点的目标。然后双方同时将一张手牌
  //       扣置入处理区, 再同时亮出双方拼点的牌, 最后确定拼点结果: 若两张
  //       牌点数不同, 则拼点的牌点数较大的角色赢, 点数较小的角色没赢;
  //       若两张牌点数相同, 则两名角色都没赢。
  //   (2) 赢/没赢后: (驱虎/天义/烈刃/制霸… 的效果在此时机结算)
  //       然后将处理区里所有拼点的牌置入弃牌堆, 至此拼点结算完毕。
  //   ◆ 若拼点的两名角色中有一名在亮出前死亡, 之后仍亮出其拼点的牌确定
  //     结果 (本实现: 出牌已在选牌期离手并锚在 pauseState, 死亡不影响)。
  //
  // 关键顺序: 弃置发生在"赢/没赢后"效果**之后** — 烈刃类"获得其拼点牌"
  // 必须能在效果窗口内把牌拿走。本实现的 flushPindianCards 只弃置"结算
  // 后仍不在任何区域"的拼点牌, 天然兼容认领。
  //
  // 挂起模型: 与既有响应框架同构 — 玩家席选牌经 pendingChoice
  // 'pindian-card' (单槽 + FIFO 队列), AI 席同步选; 双方都是 AI 时整个
  // 拼点同步跑完。选牌期实体牌锚在 pauseState.pindian (守恒 census 在途面)。
  import { StateRuntime } from './state.js';

  export function createPindianRuntime(deps) {
    var log = deps.log;
    var fail = deps.fail;
    var success = deps.success;
    var actorName = deps.actorName;

    // 效果注册表: 各技能按 key 注册"赢/没赢后"的延续 (无懈链 continuation
    // 同款), 拼点框架本身不认识任何技能。
    var PINDIAN_CONTINUATIONS = {};

    function registerPindianContinuation(key, handler) {
      PINDIAN_CONTINUATIONS[key] = handler;
    }

    function pindianEligible(game, actor, targetActor) {
      var self = game && game[actor];
      var target = game && game[targetActor];
      if (!self || !target || actor === targetActor) return false;
      if (self.hp <= 0 || target.hp <= 0) return false;
      // 双方各需一张手牌扣置入处理区。
      return (self.hand || []).length > 0 && (target.hand || []).length > 0;
    }

    // 发起拼点。opts: { key (效果注册键), reason (日志/面板文案), ctx }
    function startPindian(game, actor, targetActor, opts) {
      opts = opts || {};
      if (!pindianEligible(game, actor, targetActor)) {
        return fail('拼点需要双方各有至少一张手牌。');
      }
      if (!game.pauseState) game.pauseState = {};
      // v15 T 评审收口 [存疑 U1 转实做]: 单槽重入守卫。当前两个消费者
      // (驱虎/天义) 都是受 pendingChoiceGuard 保护的出牌阶段主动技, 走不到
      // 这里; 但本模块明写了要承载后续 烈刃/制霸/间书 — 那些是响应/受伤
      // 时机, 嵌套拼点可达, 静默覆写会让外层的拼点牌永久悬空。
      if (game.pauseState.pindian) return fail('已有拼点正在进行中。');
      game.pauseState.pindian = {
        actor: actor,
        target: targetActor,
        key: opts.key || null,
        reason: opts.reason || '拼点',
        ctx: opts.ctx || {},
        cards: {}
      };
      log(game, actorName(game, actor) + '与' + actorName(game, targetActor)
        + '进行' + (opts.reason || '拼点') + '。');
      return collectPindianCards(game);
    }

    // 逐方收集拼点牌 (官方"同时"扣置 — 实现为发起者先、目标后; 两张牌在
    // 亮出前都不公开, 顺序不产生信息差: AI 选牌启发只读自己的手牌)。
    function collectPindianCards(game) {
      var pd = game.pauseState && game.pauseState.pindian;
      if (!pd) return fail('拼点状态丢失。');
      var order = [pd.actor, pd.target];
      for (var i = 0; i < order.length; i += 1) {
        var seat = order[i];
        if (pd.cards[seat]) continue;
        var state = game[seat];
        if (!state || !(state.hand || []).length) {
          // 亮出前手牌被拿空 (拆/顺等) → 无牌可拼, 拼点中止。
          abortPindian(game, '拼点的角色没有手牌可扣置。');
          return success('拼点中止。');
        }
        if (seat === 'player') {
          deps.setPendingChoice(game, {
            kind: 'pindian-card',
            actor: 'player',
            opponentActor: seat === pd.actor ? pd.target : pd.actor,
            isInitiator: seat === pd.actor,
            reason: pd.reason,
            options: (state.hand || []).map(function (card) {
              return { cardId: card.id, name: card.name, suit: card.suit, rank: card.rank };
            })
          });
          log(game, '等待' + actorName(game, 'player') + '选择拼点的牌。');
          var paused = success('等待拼点选牌。');
          paused.paused = true;
          return paused;
        }
        var picked = deps.aiPickPindianCard(game, seat, pd);
        if (!picked) {
          abortPindian(game, '拼点的角色没有手牌可扣置。');
          return success('拼点中止。');
        }
        takePindianCard(game, seat, picked.id);
      }
      return revealPindian(game);
    }

    function takePindianCard(game, seat, cardId) {
      var pd = game.pauseState.pindian;
      var state = game[seat];
      var card = deps.removeCardFromHand(state, cardId);
      if (!card) return null;
      pd.cards[seat] = card;
      log(game, actorName(game, seat) + '扣置一张手牌作为拼点牌。');
      return card;
    }

    // 中止 (亮出前无牌可拼): 已扣置的牌照常入弃牌堆, 不产生拼点结果。
    function abortPindian(game, reason) {
      var pd = game.pauseState && game.pauseState.pindian;
      if (!pd) return;
      game.pauseState.pindian = null;
      Object.keys(pd.cards).forEach(function (seat) {
        deps.discardCard(game, pd.cards[seat]);
      });
      log(game, reason);
    }

    function revealPindian(game) {
      var pd = game.pauseState.pindian;
      game.pauseState.pindian = null;
      var initiatorCard = pd.cards[pd.actor];
      var targetCard = pd.cards[pd.target];
      var initiatorRank = deps.cardRankValue(initiatorCard);
      var targetRank = deps.cardRankValue(targetCard);
      log(game, actorName(game, pd.actor) + '亮出【' + initiatorCard.name + '】（点数 '
        + initiatorRank + '），' + actorName(game, pd.target) + '亮出【' + targetCard.name
        + '】（点数 ' + targetRank + '）。');
      // "点数相同则两名角色都没赢" — 发起者按"没赢"处理。
      var won = initiatorRank > targetRank;
      log(game, actorName(game, pd.actor) + (won ? '拼点赢。' : '拼点没赢。'));
      // 处理区里的拼点牌: 先挂账, 效果结算后再统一弃置 (未被认领的才弃)。
      game.pauseState.pindianCards = { cards: [initiatorCard, targetCard] };
      var outcome = {
        won: won,
        actor: pd.actor,
        target: pd.target,
        actorCard: initiatorCard,
        targetCard: targetCard,
        ctx: pd.ctx
      };
      var continuation = pd.key && PINDIAN_CONTINUATIONS[pd.key];
      var result = continuation ? continuation(game, outcome) : success('拼点结算完成。');
      // 官方顺序是「"赢/没赢后"效果 → 处理区拼点牌入弃牌堆」。效果挂起时
      // (驱虎赢后由荀彧选受伤角色 / 未来烈刃的"获得其拼点牌") 还不能弃 —
      // 否则认领面在窗口打开时就已经没牌可认。挂起时留账, 由
      // resumeSuspendedTurnFlowIfReady 在选择排空后 flush。
      if (game.pendingChoice) return result;
      flushPindianCards(game);
      return result;
    }

    // 官方: "然后将处理区里所有拼点的牌置入弃牌堆" — 只弃置结算后仍不在
    // 任何区域的牌 (烈刃类"获得其拼点牌"已把牌移走的天然跳过)。
    function flushPindianCards(game) {
      var pending = game.pauseState && game.pauseState.pindianCards;
      if (!pending) return;
      game.pauseState.pindianCards = null;
      pending.cards.forEach(function (card) {
        if (card && !deps.findCardZone(game, card)) deps.discardCard(game, card);
      });
    }

    // 玩家选牌 resolver。
    function resolvePindianCardChoice(game, pending, decision) {
      var pd = game.pauseState && game.pauseState.pindian;
      if (!pd) return fail('找不到拼点的暂停状态。');
      var d = decision || {};
      var state = game.player;
      var cardId = d.cardId;
      if (!cardId) {
        // 未指定 (soak 兜底) → 取点数最大的一张。
        var best = (state.hand || []).slice().sort(function (a, b) {
          return deps.cardRankValue(b) - deps.cardRankValue(a);
        })[0];
        cardId = best && best.id;
      }
      if (!cardId || !(state.hand || []).some(function (c) { return c.id === cardId; })) {
        deps.setPendingChoice(game, pending);
        return fail('请选择一张手牌作为拼点牌。');
      }
      takePindianCard(game, 'player', cardId);
      return collectPindianCards(game);
    }
    deps.registerResponseKind('pindian-card', resolvePindianCardChoice);

    return {
      startPindian: startPindian,
      pindianEligible: pindianEligible,
      registerPindianContinuation: registerPindianContinuation,
      // v15 T 评审收口: "赢/没赢后"效果挂起时留账, 选择排空后由
      // resumeSuspendedTurnFlowIfReady 补 flush (官方顺序: 效果在前)。
      flushPindianCards: flushPindianCards
    };
  }
