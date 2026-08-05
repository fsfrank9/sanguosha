// v14 R1: 蛊惑 (于吉, 风包现行版) — 虚拟声明牌层 + 质疑链域模块。
//
// 官方文本 (逐字来源 official-skill-cache/gltjk-sanguosha-rules/pages/
// card__hero__neutral.md:324-338): "你可以将一张手牌当一张基本牌或非延时
// 类锦囊牌背面朝上使用或打出, 其他角色可以质疑。若没有角色质疑, 你亮出
// 之, 取消不合法的目标。当有角色质疑, 你亮出之: 若为假, 终止此牌的结算
// 流程, 你将之置入弃牌堆; 若为真, 其获得'缠怨'(锁定技, 你不能对'蛊惑'
// 进行质疑; 锁定技, 若你的体力值为1, 你除'缠怨'外的技能无效), 然后取消
// 不合法的目标。每名角色的回合内限一次。"
//
// 质疑时序 (rule__principle.md:50 明文点名蛊惑): 从当前回合角色起按座次
// 环依次、每人限一次; ◆旁注: 一旦有一名角色质疑即终止质疑流程 (首质疑
// 即止)。声明期此牌视为没有颜色 (无色暂态), 亮出后以实际花色 + 声明
// 牌名结算; 验假时 "若在出牌阶段空闲时间点发动: 视为没有使用过为你声明
// 的牌名的牌" (声明牌限次不消耗 — 本实现中 usedSha 等在结算期才落账,
// 天然满足)。
//
// v15 S1 接入口径: 出牌阶段【使用流程】全量 (声明白名单 = 引擎全部可主动
// 使用的基本牌/非延时锦囊 16 型) + 响应窗口【打出流程/响应中的使用流程】
// (闪/杀/桃·酒/无懈 六个窗口, 玩家席)。现行版正文无质疑资格体力限制
// (对照经典版 "体力值大于0" — spec 缺口逐条裁定见
// docs/audit/2026-08-05-guhuo-spec-gaps.md), 按正文全体其他存活角色可
// 质疑, 缠怨持有者锁定除外。
import { StateRuntime } from './state.js';

export function createGuhuoRuntime(deps) {
  var log = deps.log;
  var fail = deps.fail;
  var success = deps.success;
  var actorName = deps.actorName;

  // 声明白名单: 基本牌 (有主动使用时机的: 杀/火杀/雷杀/桃/酒 — ◆旁注:
  // 声明杀须同时声明属性, 三型分列) + 非延时锦囊全 10 型。闪/无懈无主动
  // 使用时机, 使用流程天然不可声明; 延时锦囊/装备不在技能文本面。
  var GUHUO_DECLARABLE = ['sha', 'fire_sha', 'thunder_sha', 'tao', 'jiu',
    'wuzhong', 'juedou', 'nanman', 'wanjian', 'guohe', 'shunshou',
    'taoyuan', 'wugu', 'huogong', 'jiedao', 'tiesuo'];

  // 各声明型的结算选项面 (评审收口): required=声明期必给 (官方 ◆ "声明
  // 牌名的同时选择合法目标"), allowed=可透传给结算 handler 的白名单键 —
  // 其余键一律丢弃 (防 mode:'recast'/taoTarget 等绕出技能文本或打到
  // 退牌路径)。guohe/shunshou 的区域/具体牌、火攻成本经结算期
  // pendingChoice 自选, 不在声明面。jiedao/tiesuo 的附加座席字段在
  // 声明主体内单独校验后写入。
  var GUHUO_OPTION_SPEC = {
    sha: { required: ['target'], allowed: ['target'] },
    fire_sha: { required: ['target'], allowed: ['target'] },
    thunder_sha: { required: ['target'], allowed: ['target'] },
    tao: { required: [], allowed: [] },
    jiu: { required: [], allowed: ['target'] },
    wuzhong: { required: [], allowed: [] },
    juedou: { required: ['target'], allowed: ['target'] },
    nanman: { required: [], allowed: [] },
    wanjian: { required: [], allowed: [] },
    guohe: { required: ['target'], allowed: ['target'] },
    shunshou: { required: ['target'], allowed: ['target'] },
    taoyuan: { required: [], allowed: [] },
    wugu: { required: [], allowed: [] },
    huogong: { required: ['target'], allowed: ['target'] },
    jiedao: { required: ['target'], allowed: ['target'] },
    tiesuo: { required: [], allowed: [] }
  };

  // ═════ v15 S1: 响应窗口【打出流程】/【响应中的使用流程】 ═════
  //
  // 官方 ◆ (card__hero__neutral.md:336) 打出流程与使用流程分列, 逐字:
  // "你发动【蛊惑】声明打出的牌的牌名对某事件进行响应即你开始一个特殊的
  // 打出流程: 首先你在声明打出的牌的同时将一张手牌扣置入处理区, 然后其他
  // 角色依次决定是否质疑。若没有角色质疑, 你亮出之, 确定除牌名外的所有
  // 牌面信息, 然后进入'打出牌时', 之后此特殊的打出流程开始按照正常的打出
  // 流程进行。… 若验明为假, 终止此特殊的打出流程, 你将之置入弃牌堆, 视为
  // 你没有决定如何进行响应, 你可以打出为你声明的牌名的牌进行响应。"
  //
  // 与使用流程的三点差异 (spec 裁定见 docs/audit/2026-08-05-guhuo-spec-gaps.md):
  // ① 无"选择目标时"步骤、无"取消不合法的目标" — 打出没有目标面;
  // ② 目标由窗口自身确定 (濒死角色 / 被响应的锦囊), 声明期不另选;
  // ③ 验假 → "视为没有决定如何进行响应" = 响应窗口原样重开 (本回合限次
  //    已消耗 → 重开窗内不能再蛊惑, 只能打出真牌或放弃)。
  //
  // 濒死【桃】/【酒】与【无懈可击】走的是"响应中的使用流程" (使用流程 ◆
  // 末句同款: "若你是对某事件进行响应需要使用牌, 则视为你没有决定如何
  // 进行响应"), 验假后果与打出流程一致, 故同表驱动。
  var GUHUO_RESPONSE_WINDOWS = {
    'shan-response': { types: ['shan'], flow: 'playout' },
    'wanjian-response': { types: ['shan'], flow: 'playout' },
    'yinyue-response': { types: ['shan'], flow: 'playout' },
    'sha-duel-response': { types: ['sha', 'fire_sha', 'thunder_sha'], flow: 'playout' },
    // v15 S 评审收口: 南蛮入侵 (打出杀) 与 借刀杀人 (持刀者使用杀) —
    // 路线图 S1 明文含"南蛮/借刀应杀"; 借刀的受害目标由借刀本身确定,
    // 声明期不另选目标, 故与其他窗口同构。
    'aoe-sha-response': { types: ['sha', 'fire_sha', 'thunder_sha'], flow: 'playout' },
    'jiedao-decision': { types: ['sha', 'fire_sha', 'thunder_sha'], flow: 'use' },
    'wuxie-response': { types: ['wuxie'], flow: 'use' },
    // 酒 使用方法Ⅱ 仅自救 (executeDyingRescue 同款口径) → 自己濒死才入列。
    'dying-rescue': { types: ['tao'], selfTypes: ['jiu'], flow: 'use' }
  };

  // 该响应窗口可声明的牌名 (窗口所需牌型即声明面; 声明【杀】须同时声明
  // 属性 → 三型分列, 官方 ◆ "普通【杀】, 火【杀】和雷【杀】")。
  function guhuoResponseTypes(game, pending) {
    var spec = pending && GUHUO_RESPONSE_WINDOWS[pending.kind];
    if (!spec) return [];
    var types = spec.types.slice();
    if (spec.selfTypes && pending.actor === pending.dyingActor) {
      types = types.concat(spec.selfTypes);
    }
    return types;
  }

  // 响应窗口开窗门槛 (各窗口 gate 调用): 于吉 + 本回合次数未用 + 有手牌
  // → 即便手上没有窗口所需牌型也必须开窗 (蛊惑可背面朝上打出任意手牌;
  // 此前"无闪不开窗"会把蛊惑的响应面直接锁死)。
  // v1 口径: 仅玩家席 — AI 席在响应中声明会把玩家质疑窗挂进 consumeResponse
  // 的同步调用栈 (需要全响应链改造), 记录为已知局限。
  function guhuoResponsePossible(game, actor) {
    if (actor !== 'player') return false;
    var state = game && game[actor];
    if (!state || !StateRuntime.hasSkill(state, 'guhuo')) return false;
    if (state.flags && state.flags.guhuoUsedThisTurn) return false;
    return (state.hand || []).length > 0;
  }

  // 当前挂起的响应窗口是否可发动蛊惑 (UI 面板入口门禁)。
  function guhuoResponseAvailable(game) {
    var pending = game && game.pendingChoice;
    if (!pending || !GUHUO_RESPONSE_WINDOWS[pending.kind]) return false;
    if (!guhuoResponsePossible(game, pending.actor)) return false;
    return guhuoResponseTypes(game, pending).length > 0;
  }

  // 当前窗口可声明的牌名 (UI 用) — 不可发动时恒空, 与
  // guhuoResponseAvailable 同口径 (评审收口: 两个导出谓词不得互相矛盾)。
  function guhuoResponseMenu(game) {
    if (!guhuoResponseAvailable(game)) return [];
    return guhuoResponseTypes(game, game.pendingChoice);
  }

  // 响应窗口声明入口 — 由 resolvePendingChoice / resolveResponseChoice 在
  // decision.guhuo 存在时先于 kind resolver 拦截 (pendingChoice 仍在槽内,
  // 校验失败即原样退回, 窗口不丢)。
  function declareGuhuoResponse(game, pending, opts) {
    opts = opts || {};
    var spec = pending && GUHUO_RESPONSE_WINDOWS[pending.kind];
    if (!spec) return fail('当前响应窗口不能发动【蛊惑】。');
    var actor = pending.actor;
    var state = game[actor];
    if (!state) return fail('未知角色。');
    if (!StateRuntime.hasSkill(state, 'guhuo')) return fail('该角色没有【蛊惑】。');
    if (state.flags && state.flags.guhuoUsedThisTurn) return fail('【蛊惑】每名角色的回合内限一次。');
    // 评审收口: 与各窗口 gate / UI 门禁复用同一谓词 — 此前公开 dispatcher
    // 可绕过"仅玩家席"边界 (AI 席经 skillPreferences.dying='ask' 拿到窗口
    // 后直调即可发动), 落进本批明文声明不支持的区域。
    if (!guhuoResponsePossible(game, actor)) return fail('该角色当前不能在响应中发动【蛊惑】。');
    var allowed = guhuoResponseTypes(game, pending);
    if (allowed.indexOf(opts.declareType) < 0) return fail('此响应窗口不能声明该牌名。');
    var physical = (state.hand || []).find(function (item) { return item.id === opts.cardId; });
    if (!physical) return fail('找不到要盖置的手牌。');

    var declaredName = colorlessDeclaredCard(opts.declareType).name;
    // 盖置入处理区 (守恒在途面同使用流程), 发动即计次 (验假不返还)。
    deps.removeCardFromHand(state, physical.id);
    if (!state.flags) state.flags = {};
    state.flags.guhuoUsedThisTurn = true;
    game.pendingChoice = null; // 质疑期窗口暂离槽位 (响应决定尚未作出)
    if (!game.pauseState) game.pauseState = {};
    game.pauseState.guhuo = {
      actor: actor,
      declareType: opts.declareType,
      declaredName: declaredName,
      physical: physical,
      options: {},
      mode: 'response',
      flow: spec.flow,
      responsePending: pending,
      queue: buildChallengeQueue(game, actor),
      idx: 0
    };
    log(game, actorName(game, actor) + '发动【蛊惑】，背面朝上'
      + (spec.flow === 'use' ? '使用' : '打出') + '【' + declaredName + '】进行响应。');
    return advanceGuhuoChallenge(game);
  }

  // 亮出结算 (响应模式): 打出流程无目标合法性步骤, 验真/无质疑 → 把
  // "声明牌名 + 实体牌面" 注入 pauseState.guhuoResponse, 交回原窗口的
  // resolver 走正常打出/使用流程; 验假 → 弃置 + 窗口原样重开。
  function revealGuhuoResponse(game, challenger, gh) {
    game.pauseState.guhuo = null;
    var physical = gh.physical;
    var isTrue = physical.type === gh.declareType;
    var verb = gh.flow === 'use' ? '使用' : '打出';
    log(game, actorName(game, gh.actor) + '亮出盖置的牌：【' + physical.name + '】'
      + (physical.suitLabel || physical.suit || '') + (physical.rank || '') + '。');
    noteGuhuoReveal(game, gh.actor, isTrue, !!challenger);

    if (challenger && !isTrue) {
      deps.discardCard(game, physical);
      log(game, '验明为假 —【' + gh.declaredName + '】的' + verb
        + '流程终止，视为' + actorName(game, gh.actor) + '没有决定如何进行响应。');
      // "你可以打出为你声明的牌名的牌进行响应" — 窗口原样重开 (本回合
      // 蛊惑次数已消耗, 重开窗内只能打出真牌或放弃)。
      deps.setPendingChoice(game, gh.responsePending);
      var reopened = success('【蛊惑】被质破，请重新决定如何响应。');
      reopened.paused = true;
      return reopened;
    }
    if (challenger && isTrue) grantChanyuan(game, challenger);

    game.pauseState.guhuoResponse = {
      actor: gh.actor,
      declareType: gh.declareType,
      declaredName: gh.declaredName,
      physical: physical
    };
    var resolver = deps.responseResolverFor(gh.responsePending.kind);
    var result = resolver
      ? resolver(game, gh.responsePending, { use: true, guhuoResolved: true })
      : fail('未注册的响应类型：' + gh.responsePending.kind);
    // 兜底: 注入未被消费 (理论上不出现 — 各窗口消费出口已全覆盖) → 收回
    // 实体牌防漏牌 (守恒红线)。
    var leftover = game.pauseState && game.pauseState.guhuoResponse;
    if (leftover && leftover.physical === physical) {
      game.pauseState.guhuoResponse = null;
      if (!deps.findCardZone(game, physical)) {
        deps.putCard(game, physical, { zone: 'hand', actor: gh.actor });
      }
    }
    return result;
  }

  // v15 S2: 被抓包记忆 — 亮出是全场公开信息, 按声明者记公开账 (诈声明被
  // 抓 / 真牌被质疑各计一笔), 供 AI 质疑启发读取。不读暗牌、不读身份。
  function noteGuhuoReveal(game, actor, isTrue, challenged) {
    var st = game[actor];
    if (!st) return;
    if (!challenged) return; // 未被质疑 → 牌面虽亮出但无"诚信"证据落账
    if (isTrue) st.guhuoProven = (st.guhuoProven || 0) + 1;
    else st.guhuoBusted = (st.guhuoBusted || 0) + 1;
  }

  function guhuoAvailable(game, actor) {
    var state = game && game[actor];
    if (!state || !StateRuntime.hasSkill(state, 'guhuo')) return false;
    if (game.turn !== actor || game.phase !== 'play') return false;
    if (state.flags && state.flags.guhuoUsedThisTurn) return false;
    return (state.hand || []).length > 0;
  }

  // 声明期无色暂态牌 (◆: 亮出前视为没有颜色 — suit/rank/color=null 即
  // 无色语义本体) — 只用于合法性预检与 UI 目标枚举, 不进任何区域。
  function colorlessDeclaredCard(declareType) {
    return deps.makeTestCard(declareType, {
      id: 'guhuo-declare', suit: null, rank: null, color: null
    });
  }

  function guhuoLegalTargets(game, actor, declareType) {
    if (GUHUO_DECLARABLE.indexOf(declareType) < 0) return [];
    return deps.legalTargetsForCard(game, actor, colorlessDeclaredCard(declareType));
  }

  // 使用流程入口 — opts: { cardId (盖置手牌), declareType, target?,
  // targets?, jiedaoVictim?, ... (随声明型透传结算 options) }。
  function playGuhuoDeclare(game, actor, opts) {
    var pendingGuard = deps.pendingChoiceGuard(game);
    if (pendingGuard) return pendingGuard;
    var state = game[actor];
    opts = opts || {};
    if (!state) return fail('未知角色。');
    if (!StateRuntime.hasSkill(state, 'guhuo')) return fail('该角色没有【蛊惑】。');
    if (game.turn !== actor || game.phase !== 'play') return fail('只能在自己的出牌阶段发动【蛊惑】。');
    if (state.flags && state.flags.guhuoUsedThisTurn) return fail('【蛊惑】每名角色的回合内限一次。');
    if (GUHUO_DECLARABLE.indexOf(opts.declareType) < 0) return fail('【蛊惑】只能声明基本牌或非延时类锦囊牌。');
    var physical = (state.hand || []).find(function (item) { return item.id === opts.cardId; });
    if (!physical) return fail('找不到要盖置的手牌。');

    // 声明牌使用规则预检 (阶段/杀限次/桃体力满/酒限次/∃目标等) — 用无色
    // 暂态牌跑 canPlayCard; 显式目标再过座席合法性 (无色态不吃颜色类
    // 目标限制, 合官方 "选择目标时此牌视为没有颜色")。
    var declared = colorlessDeclaredCard(opts.declareType);
    var can = deps.canPlayCard(game, actor, declared);
    if (!can.ok) return can;
    // 评审收口: 官方 ◆ "声明牌名的同时为此牌选择合法目标" — 指向型声明
    // 必须在声明期显式给出目标 (缺省目标解析到不合法座席会走结算拒绝,
    // 白挂质疑链); 结算选项按声明型白名单收窄 (重铸等非"使用/打出"路径
    // 及未校验字段一律不透传 — 此前全量透传可经 mode:'recast' 绕出技能
    // 文本、经非法字段打到退牌路径)。
    var optionSpec = GUHUO_OPTION_SPEC[opts.declareType] || { required: [], allowed: [] };
    var explicitTarget = null;
    if (optionSpec.required.indexOf('target') >= 0 || opts.target != null) {
      explicitTarget = deps.resolveSeatOption(game, opts.target);
      if (!explicitTarget || !deps.isLegalCardTarget(game, actor, declared, explicitTarget)) {
        return fail('请为【' + declared.name + '】指定一个合法目标。');
      }
    }
    var resolvedOptions = {};
    optionSpec.allowed.forEach(function (key) {
      if (key !== 'target' && opts[key] != null) resolvedOptions[key] = opts[key];
    });
    if (explicitTarget) resolvedOptions.target = explicitTarget;
    if (opts.declareType === 'jiedao') {
      // 借刀受害者座席在声明期一并校验 (结算期 handler 仍会复检)。
      var jdVictim = deps.resolveSeatOption(game, opts.jiedaoVictim);
      if (!jdVictim || !game[jdVictim] || game[jdVictim].hp <= 0) {
        return fail('请为【借刀杀人】指定持刀者攻击的目标。');
      }
      resolvedOptions.jiedaoVictim = jdVictim;
    }
    if (opts.declareType === 'tiesuo') {
      // 铁索: 仅"使用" (1-2 名座席横置/重置) — 重铸不是使用/打出, 不在
      // 蛊惑技能文本内, mode 字段不透传即天然禁止。
      var tsTargets = Array.isArray(opts.targets) ? opts.targets.map(function (seat) {
        return deps.resolveSeatOption(game, seat);
      }) : [];
      tsTargets = tsTargets.filter(function (seat, idx) {
        return seat && game[seat] && game[seat].hp > 0 && tsTargets.indexOf(seat) === idx;
      });
      if (!tsTargets.length || tsTargets.length > 2) {
        return fail('请为【铁索连环】指定一至两名角色。');
      }
      resolvedOptions.targets = tsTargets;
      resolvedOptions.mode = 'chain';
    }

    // 盖置入处理区: 摘出手牌、锚定在 pauseState (守恒 census 在途面)。
    deps.removeCardFromHand(state, physical.id);
    if (!state.flags) state.flags = {};
    state.flags.guhuoUsedThisTurn = true; // 发动即计次 (验假不返还发动次数)
    if (!game.pauseState) game.pauseState = {};
    game.pauseState.guhuo = {
      actor: actor,
      declareType: opts.declareType,
      declaredName: declared.name,
      physical: physical,
      options: resolvedOptions,
      queue: buildChallengeQueue(game, actor),
      idx: 0
    };
    log(game, actorName(game, actor) + '发动【蛊惑】，背面朝上使用【' + declared.name + '】。');
    return advanceGuhuoChallenge(game);
  }

  // 质疑队列: 从当前回合角色起按座次环依次 (rule__principle.md:50; 声明
  // 者即当前回合角色 → 实际从其下家起), 跳过声明者/已阵亡/缠怨持有者。
  function buildChallengeQueue(game, actor) {
    return StateRuntime.seatsFrom(game, game.turn, true).filter(function (seat) {
      var st = game[seat];
      return seat !== actor && st && st.hp > 0 && !st.chanyuan;
    });
  }

  function advanceGuhuoChallenge(game) {
    var gh = game.pauseState && game.pauseState.guhuo;
    if (!gh) return fail('蛊惑状态丢失。');
    while (gh.idx < gh.queue.length) {
      var seat = gh.queue[gh.idx];
      var st = game[seat];
      if (!st || st.hp <= 0) { gh.idx += 1; continue; }
      if (seat === 'player') {
        // 评审收口: 目标是质疑决策前的公开信息 (官方 ◆ "声明牌名的同时
        // 选择合法目标…然后其他角色依次决定是否质疑") — 随窗带出,
        // 与 AI 侧 targetsMe 判据信息对等。
        deps.setPendingChoice(game, {
          kind: 'guhuo-challenge',
          actor: 'player',
          source: gh.actor,
          declareType: gh.declareType,
          declaredName: gh.declaredName,
          targetSeat: (gh.options && gh.options.target) || null,
          targetSeats: (gh.options && gh.options.targets) || null
        });
        log(game, '等待' + actorName(game, 'player') + '决定是否质疑【蛊惑】。');
        var paused = success('等待质疑决定。');
        paused.paused = true;
        return paused;
      }
      if (deps.aiShouldChallengeGuhuo(game, seat, gh)) {
        log(game, actorName(game, seat) + '质疑【蛊惑】！');
        return revealAndSettleGuhuo(game, seat); // 首质疑即止
      }
      gh.idx += 1;
    }
    return revealAndSettleGuhuo(game, null); // 无人质疑
  }

  function revealAndSettleGuhuo(game, challenger) {
    var gh = game.pauseState && game.pauseState.guhuo;
    if (!gh) return fail('蛊惑状态丢失。');
    // v15 S1: 响应窗口 (打出流程/响应中的使用流程) 走独立结算路径。
    if (gh.mode === 'response') return revealGuhuoResponse(game, challenger, gh);
    game.pauseState.guhuo = null;
    var physical = gh.physical;
    var actor = gh.actor;
    var isTrue = physical.type === gh.declareType;
    log(game, actorName(game, actor) + '亮出盖置的牌：【' + physical.name + '】'
      + (physical.suitLabel || physical.suit || '') + (physical.rank || '') + '。');
    noteGuhuoReveal(game, actor, isTrue, !!challenger);

    if (challenger && !isTrue) {
      // 验假: 终止结算, 置入弃牌堆; "视为没有使用过声明牌名的牌" —
      // usedSha/jiuUsedThisTurn 等在结算期才落账, 从未消耗, 天然满足。
      deps.discardCard(game, physical);
      log(game, '验明为假 —【' + gh.declaredName + '】的结算流程终止。');
      return success('蛊惑被质破。');
    }
    if (challenger && isTrue) grantChanyuan(game, challenger);

    // 无人质疑 / 验真: 确定除牌名外的所有牌面信息 (实际花色点数 + 声明
    // 牌名), 进入正常使用流程。目标合法性再检 ("取消不合法的目标") 由各
    // 型结算 handler 的既有目标校验承担 (非法目标拒绝时本层退牌兜底)。
    var resolved = deps.makeTestCard(gh.declareType, {
      id: physical.id,
      suit: physical.suit,
      rank: physical.rank,
      color: physical.color,
      physicalCard: physical
    });
    var result = deps.playCardWithRegisteredHandler(game, actor, resolved, gh.options || {}, game[actor]);
    // 守恒/牌面兜底 (评审收口): 结算拒绝路径中各 handler 的退牌兜底放回
    // 的是"声明型门面对象" (同 id 异牌面) — findCardZone 按 id 匹配会误
    // 判"已在区域"。先按 id 扫手牌把门面换回实体 (防实体牌面被声明型
    // 永久改写 = 伪造面, 守恒 census 按 id 集合察觉不到); 扫不到且实体
    // 不在任何区域才真正退牌。蛊惑发动次数不返还; 声明牌限次未落账。
    if (result && !result.ok) {
      var refundHand = (game[actor] && game[actor].hand) || [];
      var swapped = false;
      for (var i = 0; i < refundHand.length; i += 1) {
        if (refundHand[i] && refundHand[i].id === physical.id) {
          refundHand[i] = physical;
          swapped = true;
          break;
        }
      }
      if (!swapped && !deps.findCardZone(game, physical)) {
        deps.putCard(game, physical, { zone: 'hand', actor: actor });
      }
    }
    return result;
  }

  // 缠怨: 获得性锁定技 — 入 state.skills (UI 技能栏/图鉴外挂显示) + 快查
  // 旗标。效果两面: ① 不能质疑蛊惑 (buildChallengeQueue 过滤);
  // ② 体力值为 1 时除缠怨外技能无效 (state.js hasSkill / skill-runtime
  // hasPassiveEffect 双闸压制; 装备技不在武将技能面, 不受压制 — 口径
  // 记录于 R1 执行记录)。
  function grantChanyuan(game, seat) {
    var st = game[seat];
    if (!st || st.chanyuan) return;
    st.chanyuan = true;
    st.skills = st.skills || [];
    st.skills.push({
      id: 'chanyuan',
      name: '缠怨',
      desc: '锁定技，你不能对「蛊惑」进行质疑；若你的体力值为1，你除「缠怨」外的技能无效。',
      // 运行期获得性技能补齐标注字段 (catalog annotate 不覆盖) — 技能栏
      // 与图鉴样式路径按 implemented/锁定技呈现。
      status: 'implemented',
      statusText: '锁定技，自动生效'
    });
    log(game, actorName(game, seat) + '质疑为真，获得「缠怨」（锁定技：不能再质疑【蛊惑】；体力值为1时其余技能无效）。');
  }

  function resolveGuhuoChallengeChoice(game, pending, decision) {
    var gh = game.pauseState && game.pauseState.guhuo;
    if (!gh) return fail('找不到【蛊惑】质疑的暂停状态。');
    var d = decision || {};
    if (d.challenge) {
      log(game, actorName(game, 'player') + '质疑【蛊惑】！');
      return revealAndSettleGuhuo(game, 'player');
    }
    // 放弃质疑 (含 {} 空决策 soak 兜底) → 队列下一位。
    gh.idx += 1;
    log(game, actorName(game, 'player') + '不质疑。');
    return advanceGuhuoChallenge(game);
  }
  deps.registerResponseKind('guhuo-challenge', resolveGuhuoChallengeChoice);

  return {
    GUHUO_DECLARABLE: GUHUO_DECLARABLE,
    guhuoAvailable: guhuoAvailable,
    guhuoLegalTargets: guhuoLegalTargets,
    playGuhuoDeclare: playGuhuoDeclare,
    // v15 S1: 响应窗口面 (声明入口 / UI 门禁 / 各窗口 gate 谓词)
    guhuoResponseAvailable: guhuoResponseAvailable,
    guhuoResponseTypes: guhuoResponseTypes,
    guhuoResponseMenu: guhuoResponseMenu,
    guhuoResponsePossible: guhuoResponsePossible,
    declareGuhuoResponse: declareGuhuoResponse
  };
}
