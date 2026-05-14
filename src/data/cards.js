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
        hanbing: { name: '寒冰剑', family: 'equipment', slot: 'weapon', range: 2, group: 'buff', label: '武器', symbol: '冰', desc: '杀命中可防止伤害并依次弃目标两张牌。' },
        guding: { name: '古锭刀', family: 'equipment', slot: 'weapon', range: 2, group: 'buff', label: '武器', symbol: '锭', desc: '锁定技：杀命中目标无手牌时，伤害 +1。' },
        zhuque: { name: '朱雀羽扇', family: 'equipment', slot: 'weapon', range: 4, group: 'buff', label: '武器', symbol: '朱', desc: '可将普通【杀】当火【杀】使用。' },
        yinyue: { name: '银月枪', family: 'equipment', slot: 'weapon', range: 3, group: 'buff', label: '武器', symbol: '月', desc: '回合外打出黑色手牌可令攻击范围内角色出闪或受 1 dmg。' },
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
          summary: '出牌阶段对包括自己在内的一名已受伤的角色使用；濒死阶段任意角色对濒死者使用。',
          timing: 'playPhase+dying',
          targets: 'any-wounded-or-dying',
          effect: 'v7 PR-1: options.taoTarget 指定 player/enemy；v7 PR-13: 濒死阶段任意 responder 可在 pendingChoice "dying-rescue" 中用本牌救援濒死者。',
          frequency: 'unlimited',
          responseWindow: [],
          engineHooks: ['playTao', 'options.taoTarget', 'attemptDyingRescue:tao', 'executeDyingRescue:tao']
        },
        jiu: {
          summary: '出牌阶段限一次，本回合下一张【杀】伤害 +1；濒死时(仅 self) 回复 1 点体力。',
          timing: 'playPhase+dying',
          targets: 'self',
          effect: 'v7 PR-8: 出牌阶段限一次 (flags.jiuUsedThisTurn) + shaBonus=1 不累加；v7 PR-13: 使用方法Ⅱ — 仅濒死者本人可在 pendingChoice "dying-rescue" 中饮酒回 1 体力。',
          frequency: 'oncePerTurn',
          responseWindow: [],
          engineHooks: ['canPlayCard:jiu-once-per-turn', 'playJiu', 'attemptDyingRescue:jiu', 'executeDyingRescue:jiu']
        },

        // ─── Trick cards (instant) ────────────────────────────────────
        wuzhong: {
          summary: '对包括你在内的一名角色使用；目标摸 2 张牌。',
          timing: 'playPhase',
          targets: 'any-actor',
          effect: 'v7 PR-16: gltjk 1V1/界限突破/国-标 明文 "使用目标：包括你在内的一名角色"。options.wuzhongTarget 可指定 player/enemy；缺省=发动者。1v1 中给对手摸 2 是反直觉操作，AI 永不这样做；保留 API 仅为 spec 合规。',
          frequency: 'unlimited',
          responseWindow: ['wuxie'],
          engineHooks: ['playWuzhong', 'options.wuzhongTarget']
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
          summary: '1V1 变体：获得"有牌的对手"任意区域（手牌/装备/判定）的一张牌；无距离限制。',
          timing: 'playPhase',
          targets: 'opponent-with-any-card',
          effect: 'v7 PR-10: gltjk card__scroll.md 1V1 变体明文 "有牌的对手"，不再受距离 1 限制。任意区域 (手牌/装备/判定) 的牌均可获得；options.targetZone+targetCardId 直传指定，无指定则按 defaultTargetZone (优先手牌)。',
          frequency: 'unlimited',
          responseWindow: ['wuxie'],
          engineHooks: ['canPlayCard:shunshou-no-distance', 'playShunshou', 'removeTargetZoneCard']
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
          summary: '1V1 变体：置于对手判定区（无距离限制）；目标判定阶段判定，非梅花则跳过本回合摸牌阶段。',
          timing: 'playPhase',
          targets: 'opponent',
          effect: 'v7 PR-11: gltjk card__scroll.md 1V1 变体 "使用目标：对手"，不再受距离 1 限制。置入目标判定区 (PR-6: 同判定区已有同名时不合法)；判定花色非 club → 跳过摸牌阶段。',
          frequency: 'unlimited',
          responseWindow: ['wuxie'],
          engineHooks: ['canPlayCard:delayed-trick-dedup', 'playBingliang', 'evaluateDelayedTrick.bingliang']
        },
        shandian: {
          summary: '置于自己判定区；判定阶段判定，黑桃 2-9 受 3 点雷电伤害，否则按 next-valid 链转移到下家判定区。',
          timing: 'playPhase',
          targets: 'self',
          effect: 'v7 PR-12: 非命中时按 spec 链转。1v1 中 下家=对手；若对手判定区已有同名【闪电】(PR-6 定义为非合法目标)，则下家的下家=自己，闪电留在自己判定区。命中时受 3 点雷电伤害并弃【闪电】。',
          frequency: 'unlimited',
          responseWindow: ['wuxie'],
          engineHooks: ['canPlayCard:delayed-trick-dedup', 'playShandian', 'evaluateDelayedTrick.shandian', 'shandian-next-valid', 'damage:nature=thunder']
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
          effect: 'v7 PR-14: 使用 = Engine.playZhangbaSha(actor, [id1, id2]) 已存在；响应 = findResponseCard 在没有真实/转化 杀 时，consume 2 张手牌当 杀 响应（决斗/南蛮/借刀 等）。skillPreferences.zhangba="decline" 可禁用响应路径。',
          frequency: 'passive',
          engineHooks: ['playZhangbaSha', 'findResponseCard:zhangba-fallback']
        },
        guanshi: {
          summary: '【杀】被【闪】抵消后，可弃 2 张牌令此【杀】强制命中。',
          timing: 'passive',
          effect: '【杀】被【闪】抵消后，发动者可弃 2 张牌（手牌/装备）使本次【杀】伤害仍然结算。',
          frequency: 'passive',
          engineHooks: ['playSha:guanshiForce']
        },
        fangtian: {
          summary: '若使用的【杀】是最后的手牌，本【杀】额外目标数上限 +2。',
          timing: 'passive',
          effect: 'v7 PR-15: 已在 playSha 内做触发记录 (log + flags.fangtianBonus)；1v1 中只有 1 名对手 (额定 1 + 额外 0)，+2 上限无人可选，仅为多人/future trick 占位。turn-start/turn-end 复位 flags.fangtianBonus。',
          frequency: 'passive',
          engineHooks: ['playSha:fangtianTrigger', 'flags.fangtianBonus']
        },
        qilin: {
          summary: '【杀】对目标造成伤害时，你可以弃置其装备区里的一张坐骑牌。',
          timing: 'passive',
          effect: 'v7 PR-3: 触发时机为造成伤害（applyWeaponHitEffects 内）；目标 0 匹马则不触发；1 匹马默认弃；2 匹马按 skillPreferences.qilin = auto/ask/decline 处理（auto 缺省弃 +1 马，ask 发起 pendingChoice "qilin-pick"）。',
          frequency: 'passive',
          engineHooks: ['applyWeaponHitEffects → applyQilinDiscard', 'resolveQilinPickChoice', 'pendingChoice:qilin-pick']
        },
        hanbing: {
          summary: '【杀】对目标造成伤害时，若其有牌，你可以防止此伤害并依次弃置其两张牌（任意区域）。',
          timing: 'passive',
          effect: 'v8 PR-B1: gltjk card__equipment.md "每当你使用【杀】对目标角色造成伤害时, 若其有牌, 你可以防止此伤害, 依次弃置其两张牌"。触发时机=damage() 函数内 hp 扣减前。skillPreferences.hanbing: auto (AI 默认, 触发) / decline (不触发, 让伤害正常结算) — 二者目前均为 player 默认 = auto (即不会暴露 pendingChoice; UI 后续 PR 可补 ask 面板)。AI 弃牌优先级: 装备区 > 判定区 > 手牌。',
          frequency: 'passive',
          engineHooks: ['damage:hanbingPrevent', 'applyHanbingDiscard']
        },
        guding: {
          summary: '锁定技：使用【杀】对目标造成伤害时，若其没有手牌，伤害值 +1。',
          timing: 'passive',
          effect: 'v8 PR-B2: gltjk card__equipment.md "锁定技, 每当你使用【杀】对目标角色造成伤害时, 若其没有手牌, 你令伤害值+1"。锁定技 — 强制触发, 无 skillPreferences。在 damage() 流程内 tengjia 之后、baiyin 之前生效, 这样 baiyin 仍能把 2 点 clamp 回 1 点。',
          frequency: 'passive',
          engineHooks: ['damage:gudingNoHandPlus1']
        },
        zhuque: {
          summary: '可将普通【杀】当【火杀】使用；可将视为使用【杀】改为视为使用【火杀】。',
          timing: 'passive',
          effect: 'v8 PR-B3: gltjk card__equipment.md 朱雀羽扇 "你可以将一张普通【杀】当火【杀】使用; 你可以将视为使用【杀】改为视为使用火【杀】"。在 playSha 入口处, 装朱雀 + sourceCard.type === "sha" 时 mutate card.type → "fire_sha" 并改名称, 让 damage() 走 fire nature (藤甲变 +1 而非防止)。card-as 虚拟杀 (zhangba/wusheng/longdan) 也走此路径因为它们 card.type === "sha"。skillPreferences.zhuque = "decline" 可禁用。',
          frequency: 'passive',
          engineHooks: ['playSha:zhuqueShaToFire']
        },
        yinyue: {
          summary: '回合外使用/打出黑色手牌时，可令攻击范围内一名角色选打闪或受 1 dmg。',
          timing: 'passive',
          effect: 'v8 PR-B4: gltjk SP 010 银月枪 "每当你于回合外使用或打出黑色手牌时, 你可以令你攻击范围内的一名角色选择是否打出【闪】, 若其选择否, 你对其造成1点伤害"。在 consumeResponse / consumeWuxie 尾部检查 game.turn !== actor + 弃置卡颜色 === black + 装银月 → triggerYinyueQiang。 1v1 中目标 = opponent (即原事件 source)。skillPreferences.yinyue = "decline" 可禁用; 默认 auto。',
          frequency: 'passive',
          engineHooks: ['consumeResponse:yinyueTrigger', 'consumeWuxie:yinyueTrigger', 'triggerYinyueQiang']
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
