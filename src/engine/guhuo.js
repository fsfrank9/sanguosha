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
// v1 接入口径 (R1 执行记录): 出牌阶段【使用流程】全量 (声明白名单 = 引擎
// 全部可主动使用的基本牌/非延时锦囊 16 型); 响应窗口【打出流程】(乱武/
// 濒死蛊惑桃等判例面) 未接入, 如实记录为已知局限留待后续批。现行版正文
// 无质疑资格体力限制 (对照经典版 "体力值大于0" — spec 缺口已在调研简报
// 标注), 按正文全体其他存活角色可质疑, 缠怨持有者锁定除外。
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
    game.pauseState.guhuo = null;
    var physical = gh.physical;
    var actor = gh.actor;
    var isTrue = physical.type === gh.declareType;
    log(game, actorName(game, actor) + '亮出盖置的牌：【' + physical.name + '】'
      + (physical.suitLabel || physical.suit || '') + (physical.rank || '') + '。');

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
    playGuhuoDeclare: playGuhuoDeclare
  };
}
