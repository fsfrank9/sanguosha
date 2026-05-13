      var CARD_CATALOG = {
        sha: { name: '杀', family: 'basic', group: 'attack', label: '基本', symbol: '杀', desc: '出牌阶段使用。若目标没有【闪】，造成 1 点伤害。每回合限一次。' },
        fire_sha: { name: '火杀', family: 'basic', group: 'attack', label: '基本', symbol: '火', desc: '火属性【杀】，造成火焰伤害。' },
        thunder_sha: { name: '雷杀', family: 'basic', group: 'attack', label: '基本', symbol: '雷', desc: '雷属性【杀】，造成雷电伤害。' },
        shan: { name: '闪', family: 'basic', group: 'defense', label: '基本', symbol: '闪', desc: '响应【杀】或【万箭齐发】。本版会自动打出。' },
        tao: { name: '桃', family: 'basic', group: 'heal', label: '基本', symbol: '桃', desc: '回复 1 点体力，不能超过体力上限。' },
        jiu: { name: '酒', family: 'basic', group: 'buff', label: '基本', symbol: '酒', desc: '本回合下一张【杀】伤害 +1。' },

        wuzhong: { name: '无中生有', family: 'trick', group: 'trick', label: '锦囊', symbol: '谋', desc: '立即摸 2 张牌。' },
        juedou: { name: '决斗', family: 'trick', group: 'trick', label: '锦囊', symbol: '斗', desc: '双方轮流打出【杀】，先打不出的一方受到 1 点伤害。' },
        guohe: { name: '过河拆桥', family: 'trick', group: 'trick', label: '锦囊', symbol: '拆', desc: '选择对方手牌、装备或判定区的一张牌并弃置。' },
        shunshou: { name: '顺手牵羊', family: 'trick', group: 'trick', label: '锦囊', symbol: '牵', desc: '选择对方手牌、装备或判定区的一张牌并获得。' },
        jiedao: { name: '借刀杀人', family: 'trick', group: 'trick', label: '锦囊', symbol: '借', desc: '令有武器的角色对另一名角色使用【杀】。' },
        taoyuan: { name: '桃园结义', family: 'trick', group: 'heal', label: '锦囊', symbol: '园', desc: '所有角色回复 1 点体力。' },
        wugu: { name: '五谷丰登', family: 'trick', group: 'trick', label: '锦囊', symbol: '谷', desc: '亮出牌并依次获得。' },
        nanman: { name: '南蛮入侵', family: 'trick', group: 'trick', label: '锦囊', symbol: '蛮', desc: '对方需要打出一张【杀】，否则受到 1 点伤害。' },
        wanjian: { name: '万箭齐发', family: 'trick', group: 'trick', label: '锦囊', symbol: '箭', desc: '对方需要打出一张【闪】，否则受到 1 点伤害。' },
        wuxie: { name: '无懈可击', family: 'trick', group: 'defense', label: '锦囊', symbol: '懈', desc: '抵消一张锦囊牌。' },
        huogong: { name: '火攻', family: 'trick', group: 'trick', label: '锦囊', symbol: '火', desc: '展示目标手牌并弃同花色牌造成火焰伤害。' },
        tiesuo: { name: '铁索连环', family: 'trick', group: 'trick', label: '锦囊', symbol: '锁', desc: '横置/重置角色；可重铸。' },

        lebusishu: { name: '乐不思蜀', family: 'delayed', group: 'trick', label: '延时锦囊', symbol: '乐', desc: '判定不为红桃则跳过出牌阶段。' },
        bingliang: { name: '兵粮寸断', family: 'delayed', group: 'trick', label: '延时锦囊', symbol: '粮', desc: '判定不为梅花则跳过摸牌阶段。' },
        shandian: { name: '闪电', family: 'delayed', group: 'trick', label: '延时锦囊', symbol: '电', desc: '黑桃 2-9 判定造成雷电伤害。' },

        zhuge: { name: '诸葛连弩', family: 'equipment', slot: 'weapon', range: 1, group: 'buff', label: '武器', symbol: '弩', desc: '出牌阶段使用【杀】无次数限制。' },
        qinggang: { name: '青釭剑', family: 'equipment', slot: 'weapon', range: 2, group: 'buff', label: '武器', symbol: '剑', desc: '使用【杀】无视目标防具。' },
        cixiong: { name: '雌雄双股剑', family: 'equipment', slot: 'weapon', range: 2, group: 'buff', label: '武器', symbol: '雌', desc: '对异性目标使用【杀】可令其弃牌或你摸牌。' },
        qinglong: { name: '青龙偃月刀', family: 'equipment', slot: 'weapon', range: 3, group: 'buff', label: '武器', symbol: '龙', desc: '杀被闪避后可继续使用杀。' },
        zhangba: { name: '丈八蛇矛', family: 'equipment', slot: 'weapon', range: 3, group: 'buff', label: '武器', symbol: '矛', desc: '可将两张手牌当【杀】。' },
        guanshi: { name: '贯石斧', family: 'equipment', slot: 'weapon', range: 3, group: 'buff', label: '武器', symbol: '斧', desc: '杀被闪避后可弃两牌强制命中。' },
        fangtian: { name: '方天画戟', family: 'equipment', slot: 'weapon', range: 4, group: 'buff', label: '武器', symbol: '戟', desc: '最后手牌为杀时可额外指定目标。' },
        qilin: { name: '麒麟弓', family: 'equipment', slot: 'weapon', range: 5, group: 'buff', label: '武器', symbol: '弓', desc: '杀命中后可弃置目标坐骑。' },
        bagua: { name: '八卦阵', family: 'equipment', slot: 'armor', group: 'defense', label: '防具', symbol: '卦', desc: '需要出闪时可判定，红色视为出闪。' },
        renwang: { name: '仁王盾', family: 'equipment', slot: 'armor', group: 'defense', label: '防具', symbol: '盾', desc: '黑色【杀】对你无效。' },
        tengjia: { name: '藤甲', family: 'equipment', slot: 'armor', group: 'defense', label: '防具', symbol: '藤', desc: '普通杀/南蛮/万箭无效，火焰伤害 +1。' },
        baiyin: { name: '白银狮子', family: 'equipment', slot: 'armor', group: 'defense', label: '防具', symbol: '狮', desc: '受到多点伤害时防止至 1，失去后回复 1。' },
        minus_horse: { name: '-1 马', family: 'equipment', slot: 'horseMinus', group: 'buff', label: '坐骑', symbol: '进', desc: '你计算与其他角色距离 -1。' },
        plus_horse: { name: '+1 马', family: 'equipment', slot: 'horsePlus', group: 'buff', label: '坐骑', symbol: '守', desc: '其他角色计算与你距离 +1。' }
      };

      var CARD_INFO = CARD_CATALOG;
      var PHASES = ['prepare', 'judge', 'draw', 'play', 'discard', 'finish'];

      // v6E: paraphrased standard-pack rules for every catalog entry, used as
      // the source of truth for the card-rule audit (tests/card_rules.test.mjs)
      // and as a reference for future implementation fixes. Schema:
      //   summary        — one-sentence description (always required)
      //   timing         — when the card can be used / take effect
      //                    'playPhase' / 'response' / 'judgement' / 'passive' /
      //                    'playPhase+response' / 'dying'
      //   targets        — who it can be used on (omitted for passives)
      //                    'self' / 'opponent' / 'one-other' / 'all-others' /
      //                    'all-living' / 'one-target-card' / 'distance-1' /
      //                    'weapon-range' / 'dying-actor' / 'response-target'
      //   effect         — paraphrased rule effect on resolution / when equipped
      //   frequency      — 'oncePerTurn' / 'unlimited' / 'oncePerGame' /
      //                    'passive' / 'response-window'
      //   responseWindow — possible responses target/others can make
      //                    (e.g. ['shan'] for 杀; ['wuxie'] for tricks; []
      //                    for un-respondable like 桃 / 闪 / 酒). 'wuxie' is
      //                    always implicit for tricks; we list it anyway.
      //   engineHooks    — engine functions / SkillRuntime hooks that drive
      //                    the card's behavior, for cross-checking
      var CARD_RULES = {
        // ─── Basic cards ──────────────────────────────────────────────
        sha: {
          summary: '出牌阶段对距离内一名其他角色使用；目标须打出【闪】，否则受到 1 点伤害。',
          timing: 'playPhase',
          targets: 'weapon-range',
          effect: '目标须打出 1 张【闪】响应；未打出则受到发动者造成的 1 点普通伤害。',
          frequency: 'oncePerTurn',
          responseWindow: ['shan'],
          engineHooks: ['playSha', 'onNeedResponse', 'damage', 'consumeResponse']
        },
        fire_sha: {
          summary: '【杀】的火焰属性变种，伤害为火焰类型。',
          timing: 'playPhase',
          targets: 'weapon-range',
          effect: '同【杀】，伤害属性 = fire；藤甲受到时伤害 +1。',
          frequency: 'oncePerTurn',
          responseWindow: ['shan'],
          engineHooks: ['playSha', 'damage:nature=fire']
        },
        thunder_sha: {
          summary: '【杀】的雷电属性变种，伤害为雷电类型。',
          timing: 'playPhase',
          targets: 'weapon-range',
          effect: '同【杀】，伤害属性 = thunder；与铁索连锁可传导。',
          frequency: 'oncePerTurn',
          responseWindow: ['shan'],
          engineHooks: ['playSha', 'damage:nature=thunder']
        },
        shan: {
          summary: '仅作响应，抵消【杀】或【万箭齐发】对自己的效果。',
          timing: 'response',
          targets: 'self',
          effect: '在被指定为【杀】或【万箭齐发】目标的响应窗口中打出，抵消该牌对自己的伤害。',
          frequency: 'response-window',
          responseWindow: [],
          engineHooks: ['consumeResponse']
        },
        tao: {
          summary: '出牌阶段对包括自己在内的一名已受伤的角色使用；濒死阶段对濒死者使用。',
          timing: 'playPhase+dying',
          targets: 'any-wounded-or-dying',
          effect: '目标角色回复 1 点体力，不能超过体力上限；v7 PR-1: 支持通过 options.taoTarget 指定 player/enemy。',
          frequency: 'unlimited',
          responseWindow: [],
          engineHooks: ['playTao', 'options.taoTarget']
        },
        jiu: {
          summary: '出牌阶段限一次，本回合下一张【杀】伤害 +1；濒死时回复 1 点体力。',
          timing: 'playPhase+dying',
          targets: 'self',
          effect: 'v7 PR-8: 出牌阶段限一次 (flags.jiuUsedThisTurn) — canPlayCard 检查 + resolve 时设标记；shaBonus = 1 (不累加)；shaBonus 在 resetActorTurnState / resetEndOfTurnState 时清零，spec "此回合内使用的下一张【杀】" 通过 turn-bound 状态实现。Method II (濒死) 在 PR-13 加。',
          frequency: 'oncePerTurn',
          responseWindow: [],
          engineHooks: ['canPlayCard:jiu-once-per-turn', 'playJiu', 'flags.jiuUsedThisTurn', 'resetActorTurnState/resetEndOfTurnState']
        },

        // ─── Trick cards (instant) ────────────────────────────────────
        wuzhong: {
          summary: '立即摸 2 张牌。',
          timing: 'playPhase',
          targets: 'self',
          effect: '从牌堆摸 2 张牌。',
          frequency: 'unlimited',
          responseWindow: ['wuxie'],
          engineHooks: ['playWuzhong']
        },
        juedou: {
          summary: '对一名其他角色使用；双方轮流打出【杀】，先打不出的一方受到对方造成的 1 点伤害。',
          timing: 'playPhase',
          targets: 'one-other',
          effect: '目标先弃【杀】，发动者后弃，轮流到一方放弃；放弃方受到对方造成的 1 点普通伤害。',
          frequency: 'unlimited',
          responseWindow: ['wuxie', 'sha'],
          engineHooks: ['playJuedou', 'damage']
        },
        guohe: {
          summary: '1V1 变体：你选择一项 — 1) 弃置对手装备区一张牌；2) 观看对手手牌并弃置其中一张。',
          timing: 'playPhase',
          targets: 'opponent-with-hand-or-equip',
          effect: 'v7 PR-9: gltjk card__scroll.md 1V1 变体两选项。canPlayCard 要求对手手牌或装备区有牌（不再含判定区）。options.targetZone="equipment"|"hand" 直传可走旧 UI；未指定 → 按 skillPreferences.guohe (auto/ask/decline) 处理：auto 优先弃装备，ask 设 pendingChoice "guohe-1v1-pick" 暴露装备列表 + 手牌内容（spec: 选项 2 是观看手牌后弃）。',
          frequency: 'unlimited',
          responseWindow: ['wuxie'],
          engineHooks: ['canPlayCard:guohe-1v1', 'resolveGuohe1v1', 'executeGuohe1v1Pick', 'resolveGuohe1v1PickChoice', 'pendingChoice:guohe-1v1-pick']
        },
        shunshou: {
          summary: '获得距离 1 内一名其他角色的一张牌（手牌、装备区、判定区皆可）。',
          timing: 'playPhase',
          targets: 'distance-1',
          effect: '从目标选定区域中获得 1 张牌；不能对距离 > 1 使用（除非有【奇才】等无视距离效果）。',
          frequency: 'unlimited',
          responseWindow: ['wuxie'],
          engineHooks: ['playShunshou', 'removeTargetZoneCard']
        },
        jiedao: {
          summary: '令一名装备武器且攻击范围内有合法【杀】目标的其他角色对该目标使用【杀】；不出则将其武器交给你。',
          timing: 'playPhase',
          targets: 'one-other-with-weapon-and-legal-sha-target',
          effect: 'v7 PR-5: spec 要求两次合法性检测。canPlayCard 阶段检 An 武器范围覆盖 Bn (1v1: Bn=source) 且无 target-protection；resolve 阶段 opponent 决定 fire/decline，若 fire 则 playSha 入内再做第二次检测；任何环节失败 → 交武器。skillPreferences.jiedao = auto (AI) / ask (player) / decline 同义 comply.',
          frequency: 'unlimited',
          responseWindow: ['wuxie'],
          engineHooks: ['canPlayCard:jiedao', 'resolveJiedaoDecision', 'jiedaoFireOpponentSha', 'transferWeaponJiedao', 'resolveJiedaoDecisionChoice', 'pendingChoice:jiedao-decision']
        },
        taoyuan: {
          summary: '所有角色按发动者起逆时针顺序结算；已受伤的角色回复 1 点体力，未受伤的角色无效。',
          timing: 'playPhase',
          targets: 'all-living',
          effect: 'v7 PR-2: 从发动者开始按逆时针依次处理；hp == maxHp 的目标无效（spec："对未受伤的角色无效"）。',
          frequency: 'unlimited',
          responseWindow: ['wuxie'],
          engineHooks: ['playTaoyuan']
        },
        wugu: {
          summary: '亮出 X 张牌（X=目标数=存活角色数），从发动者起按逆时针每人选 1 张获得，结束后剩余入弃牌堆。',
          timing: 'playPhase',
          targets: 'all-living',
          effect: 'v7 PR-7: reveal-then-pick 完整结算。X = aliveActorCount；牌堆不足以亮出 X 张时按 spec 终止；多张可选时按 skillPreferences.wugu (auto/ask) 处理（ask → pendingChoice "wugu-pick"，pauseState.wugu 保留 pool / order / idx 续算）。结算结束后剩余牌进弃牌堆。',
          frequency: 'unlimited',
          responseWindow: ['wuxie'],
          engineHooks: ['playWugu', 'processWuguPick', 'resolveWuguPickChoice', 'pendingChoice:wugu-pick', 'pauseState.wugu']
        },
        nanman: {
          summary: '所有其他角色须各打出 1 张【杀】，否则受到 1 点伤害。',
          timing: 'playPhase',
          targets: 'all-others',
          effect: '依次结算；每名其他角色不出【杀】则受到 1 点普通伤害。',
          frequency: 'unlimited',
          responseWindow: ['wuxie', 'sha'],
          engineHooks: ['playNanman', 'damage']
        },
        wanjian: {
          summary: '所有其他角色须各打出 1 张【闪】，否则受到 1 点伤害。',
          timing: 'playPhase',
          targets: 'all-others',
          effect: '依次结算；每名其他角色不出【闪】则受到 1 点普通伤害。',
          frequency: 'unlimited',
          responseWindow: ['wuxie', 'shan'],
          engineHooks: ['playWanjian', 'damage']
        },
        wuxie: {
          summary: '抵消一张即将生效的锦囊牌（含延时锦囊判定）。',
          timing: 'response',
          targets: 'one-target-card',
          effect: '抵消一张锦囊对一名角色的效果；【无懈】可以抵消【无懈】（链式）。',
          frequency: 'response-window',
          responseWindow: [],
          engineHooks: ['consumeWuxie']
        },
        huogong: {
          summary: '对手牌不为空的一名其他角色使用；目标展示一张手牌，发动者可弃同花色手牌对其造成 1 点火焰伤害。',
          timing: 'playPhase',
          targets: 'one-other-with-hand',
          effect: '目标展示 1 张手牌；发动者可弃同花色手牌造成 1 点火焰伤害（若选择不弃则无效）。',
          frequency: 'unlimited',
          responseWindow: ['wuxie'],
          engineHooks: ['playHuogong', 'getHuogongChoice', 'damage:nature=fire']
        },
        tiesuo: {
          summary: '横置或重置 1-2 名角色；或弃此牌重铸（弃铁索并摸 1 张）。',
          timing: 'playPhase',
          targets: 'one-or-two-actors-or-self-recast',
          effect: '横置/重置选定 1-2 名角色（链状态翻转）；重铸：弃【铁索连环】并摸 1 张牌。横置角色受到属性伤害时连锁触发。',
          frequency: 'unlimited',
          responseWindow: ['wuxie'],
          engineHooks: ['playTiesuo', 'reforge']
        },

        // ─── Delayed tricks ───────────────────────────────────────────
        lebusishu: {
          summary: '置于目标判定区；目标判定阶段判定，非红桃则跳过本回合出牌阶段。',
          timing: 'playPhase',
          targets: 'one-other',
          effect: '置入目标判定区（v7 PR-6: 同判定区已有同名【乐不思蜀】时不合法）；判定花色非 heart → 跳过出牌阶段。',
          frequency: 'unlimited',
          responseWindow: ['wuxie'],
          engineHooks: ['canPlayCard:delayed-trick-dedup', 'playLebusishu', 'evaluateDelayedTrick.lebusishu']
        },
        bingliang: {
          summary: '置于距离 1 内目标判定区；目标判定阶段判定，非梅花则跳过本回合摸牌阶段。',
          timing: 'playPhase',
          targets: 'distance-1',
          effect: '置入目标判定区（v7 PR-6: 同判定区已有同名【兵粮寸断】时不合法）；判定花色非 club → 跳过摸牌阶段。',
          frequency: 'unlimited',
          responseWindow: ['wuxie'],
          engineHooks: ['canPlayCard:delayed-trick-dedup', 'playBingliang', 'evaluateDelayedTrick.bingliang']
        },
        shandian: {
          summary: '置于自己判定区；判定阶段判定，黑桃 2-9 受 3 点雷电伤害，否则移至下家。',
          timing: 'playPhase',
          targets: 'self',
          effect: '置入自己判定区（v7 PR-6: 自己判定区已有同名【闪电】时不合法）；判定 spade 2-9 → 受 3 点雷电伤害并弃【闪电】；否则移至下家判定区。',
          frequency: 'unlimited',
          responseWindow: ['wuxie'],
          engineHooks: ['canPlayCard:delayed-trick-dedup', 'playShandian', 'evaluateDelayedTrick.shandian', 'damage:nature=thunder']
        },

        // ─── Equipment: weapons ───────────────────────────────────────
        zhuge: {
          summary: '装备后【杀】无次数限制。',
          timing: 'passive',
          effect: '出牌阶段使用【杀】不再受每回合一次限制。',
          frequency: 'passive',
          engineHooks: ['StateRuntime.hasEquipmentEffect:unlimitedSha', 'canPlayCard']
        },
        qinggang: {
          summary: '【杀】无视目标防具。',
          timing: 'passive',
          effect: '装备者使用【杀】时无视目标的防具效果（八卦、仁王、藤甲等都失效）。',
          frequency: 'passive',
          engineHooks: ['StateRuntime.hasEquipmentEffect:ignoreArmorOnSha', 'isArmorIgnoredBySha']
        },
        cixiong: {
          summary: '使用【杀】指定与你性别不同的目标后，你可以令其选择：1) 弃 1 张手牌，2) 令你摸 1 张牌。',
          timing: 'passive',
          effect: 'v7 PR-4: 触发时机 = 指定目标后（响应窗口之前，gltjk flow__use.md step 5）。需要 source.gender !== target.gender。source 通过 skillPreferences.cixiong (auto/ask/decline) 决定是否发动；target 通过 skillPreferences.cixiongResponse (auto=弃手牌；ask=pendingChoice "cixiong-choose") 选择 discard/draw。任一暂停时 sha 状态保存在 pauseState.playSha 等候续算。',
          frequency: 'passive',
          engineHooks: ['playSha → applyCixiongOnDesignate', 'fireCixiongTargetChoice', 'resolveCixiongFireChoice', 'resolveCixiongChoose', 'continueShaAfterCixiong', 'pauseState.playSha']
        },
        qinglong: {
          summary: '【杀】被【闪】抵消后，可立即对同目标再次使用【杀】（不算次数）。',
          timing: 'passive',
          effect: '【杀】被【闪】抵消后，立即追加 1 张【杀】对同目标（不消耗每回合次数）。',
          frequency: 'passive',
          engineHooks: ['playSha:qinglongChain']
        },
        zhangba: {
          summary: '装备后，可将 2 张手牌当作 1 张【杀】使用或打出。',
          timing: 'passive',
          effect: '激活时弃 2 张手牌作为 1 张虚拟【杀】使用/打出，仍受所有【杀】限制。',
          frequency: 'passive',
          engineHooks: ['playZhangbaSha']
        },
        guanshi: {
          summary: '【杀】被【闪】抵消后，可弃 2 张牌令此【杀】强制命中。',
          timing: 'passive',
          effect: '【杀】被【闪】抵消后，发动者可弃 2 张牌（手牌/装备）使本次【杀】伤害仍然结算。',
          frequency: 'passive',
          engineHooks: ['playSha:guanshiForce']
        },
        fangtian: {
          summary: '使用【杀】时若手牌仅余此【杀】，可额外指定 1 个目标。',
          timing: 'passive',
          effect: '出牌阶段若【杀】是当前手牌唯一一张，方天画戟允许该【杀】指定 +1 目标。当前 1v1 引擎尚未实现多目标【杀】。',
          frequency: 'passive',
          engineHooks: ['playSha:fangtianTargets']
        },
        qilin: {
          summary: '【杀】对目标造成伤害时，你可以弃置其装备区里的一张坐骑牌。',
          timing: 'passive',
          effect: 'v7 PR-3: 触发时机为造成伤害（applyWeaponHitEffects 内）；目标 0 匹马则不触发；1 匹马默认弃；2 匹马按 skillPreferences.qilin = auto/ask/decline 处理（auto 缺省弃 +1 马，ask 发起 pendingChoice "qilin-pick"）。',
          frequency: 'passive',
          engineHooks: ['applyWeaponHitEffects → applyQilinDiscard', 'resolveQilinPickChoice', 'pendingChoice:qilin-pick']
        },

        // ─── Equipment: armor ─────────────────────────────────────────
        bagua: {
          summary: '需要打出【闪】时，可判定，红色视为打出了【闪】。',
          timing: 'passive',
          effect: '【杀】等需要响应【闪】的窗口中触发判定；判定为红色（heart/diamond）则视为打出【闪】。',
          frequency: 'passive',
          engineHooks: ['playSha:baguaAutoShan']
        },
        renwang: {
          summary: '黑色【杀】对你无效。',
          timing: 'passive',
          effect: '黑色【杀】被仁王盾直接抵消（不经过响应窗口），除非攻击者装备【青釭剑】穿透。',
          frequency: 'passive',
          engineHooks: ['StateRuntime.hasEquipmentEffect:blockBlackSha']
        },
        tengjia: {
          summary: '普通【杀】、【南蛮入侵】、【万箭齐发】对你无效；火焰伤害 +1。',
          timing: 'passive',
          effect: '普通属性的【杀】（不含火/雷）、【南蛮】、【万箭】对装备者无效；受到火焰伤害 +1 点。',
          frequency: 'passive',
          engineHooks: ['damage:tengjiaBranch']
        },
        baiyin: {
          summary: '受到大于 1 点伤害时防止至 1 点；离开装备区时回复 1 点体力。',
          timing: 'passive',
          effect: '受到 ≥ 2 点的单次伤害被防止至 1；从装备区被弃置时立即回复 1 点体力。',
          frequency: 'passive',
          engineHooks: ['damage:baiyinDampen', 'card-runtime:baiyinRecover']
        },

        // ─── Equipment: horses ────────────────────────────────────────
        minus_horse: {
          summary: '装备 -1 马：你计算与其他角色的距离 -1。',
          timing: 'passive',
          effect: '装备者计算与其他角色距离时 -1，最低为 1。',
          frequency: 'passive',
          engineHooks: ['StateRuntime.distanceBetween:horseMinus']
        },
        plus_horse: {
          summary: '装备 +1 马：其他角色计算与你的距离 +1。',
          timing: 'passive',
          effect: '其他角色计算与装备者距离时 +1。',
          frequency: 'passive',
          engineHooks: ['StateRuntime.distanceBetween:horsePlus']
        }
      };

      for (var _cardId in CARD_CATALOG) {
        if (Object.prototype.hasOwnProperty.call(CARD_CATALOG, _cardId)) {
          var _rule = CARD_RULES[_cardId];
          if (_rule) CARD_CATALOG[_cardId].rule = _rule;
        }
      }

      export { CARD_CATALOG, CARD_INFO, PHASES, CARD_RULES };
