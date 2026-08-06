      var IMPLEMENTED_SKILL_IDS = [
        'zhiheng', 'kurou', 'rende', 'fanjian', 'guanxing',
        'paoxiao', 'wusheng', 'longdan', 'qingguo', 'jianxiong', 'ganglie', 'fankui', 'guicai', 'mashu', 'qicai', 'qianxun', 'tiandu', 'yiji', 'luoyi', 'tieqi', 'tuxi', 'yingzi', 'kongcheng',
        'biyue', 'keji', 'jizhi',
        // v8 方向 3 标准包技能扩充 (#55-#59):
        //   guose    PR-C1 — 大乔  方片 → 乐不思蜀 card-as
        //   liuli    PR-C2 — 大乔  杀转移 (1v1 候选恒空, 多人激活)
        //   jijiu    PR-C3 — 华佗  回合外红色当桃 (接濒死流程)
        //   qingnang PR-C4 — 华佗  出牌阶段限一次, 弃 1 牌令受伤角色回 1 hp
        //   luoshen  PR-C5 — 甄姬  准备阶段连续黑色判定获得
        'guose', 'liuli', 'jijiu', 'qingnang', 'luoshen',
        // v11 C1 被动技能接入 (批次 25):
        //   wushuang 吕布  杀/决斗需目标连续响应两张 (闪×2 / 杀×2)
        //   jiuyuan  孙权  主公技: 吴势力对濒死的孙权用桃回复量 +1
        'wushuang', 'jiuyuan',
        // v11 C2 (批次 26): 统一手牌失去事件 (CardRuntime handLossHandler)
        //   lianying 陆逊  失去最后一张手牌后摸一张牌
        'lianying',
        // v11 C3 (批次 27): card-as 泛化到锦囊 (playCardAs asType='guohe')
        //   qixi     甘宁  黑色牌当【过河拆桥】使用
        'qixi',
        // v11 C6 (批次 30): 标准包补员 孙尚香
        //   xiaoji   孙尚香  失去装备区牌后摸两张 (挂统一装备失去时机)
        //   jieyin   孙尚香  出牌阶段限一次, 弃两手牌与受伤男性各回复 1
        'xiaoji', 'jieyin',
        // v11 C7 (批次 31): 华雄 入编 + 新交互 kind 'yaowu-reward'
        //   yaowu    华雄   锁定技: 受红色杀伤害后, 来源选 回复 1 / 摸一张
        'yaowu',
        // v11 C8 (批次 32): 标准版袁术 入编
        //   wangzun  袁术   主公准备阶段: 袁术摸一张 + 主公本回合手牌上限 -1
        //   tongji   袁术   锁定技: 1v1 恒不拦截 (reserved, 多人激活, 同流离)
        'wangzun', 'tongji',
        // v12 G1 (修复批): 风包首批 — 据守 (曹仁) / 烈弓 (黄忠) / 狂骨 (魏延)。
        // 神速/红颜 曾被虚报为已实现 (神速 = 无成本虚拟杀、红颜 = 零实现),
        // 按"宁缺毋滥"撤出名单, 待阶段跳过框架 / 花色视同层落地后再接入。
        'jushou', 'liegong', 'kuanggu',
        // v12 G2 (风包第二批): 神速 (阶段跳过框架) / 红颜 (花色视同层) /
        // 天香 (伤害转移) / 雷击+鬼道 (张角) / 不屈 (周泰, 濒死"创"区)。
        'shensu', 'hongyan', 'tianxiang', 'leiji', 'guidao', 'buqu',
        // v14 R1 (用户裁定风包现行版立项): 蛊惑 (于吉) — 虚拟声明牌层 +
        // 质疑链 (guhuo.js 域模块)。v1 接入出牌阶段使用流程 (声明 16 型);
        // 响应窗口打出流程为已知局限, 见 R1 执行记录。缠怨为获得性技能
        // (质疑真牌惩罚), 不在 catalog, 运行期入 state.skills。
        'guhuo',
        // v12 H7 (身份场激活批): 主公技/多人技 —
        //   jijiang   刘备主公技  蜀势力代出【杀】(主动 + 决斗/南蛮响应求助)
        //   hujia     曹操主公技  魏势力代出【闪】(杀/万箭响应求助)
        //   huangtian 张角主公技  其他群势力交给张角【闪】/【闪电】
        //   lijian    貂蝉        弃一张牌令两名男性角色虚拟【决斗】
        // 1v1 中主公无同势力队友 / 离间凑不齐两名其他男性 → 全部 no-op,
        // 行为零回归; identity3 起激活。
        'jijiang', 'hujia', 'huangtian', 'lijian',
        // ═════ v15 T: 火包 8 将 13 技 ═════
        //   强袭 qiangxi   典韦   出牌阶段限一次: 失体力/弃武器 → 1 伤害
        //   驱虎 quhu      荀彧   出牌阶段限一次: 与体力大于己者拼点
        //   节命 jieming   荀彧   每受 1 点伤害后令一名角色补手牌至 X
        //   八阵 bazhen    卧龙   锁定技: 无防具时视为装备八卦阵
        //   火计 huoji     卧龙   红色手牌当火攻
        //   看破 kanpo     卧龙   黑色手牌当无懈可击
        //   连环 lianhuan  庞统   梅花手牌当铁索连环 + 可重铸梅花手牌
        //   涅槃 niepan    庞统   限定技: 濒死时复原
        //   天义 tianyi    太史慈 出牌阶段限一次拼点, 赢则杀增强
        //   猛进 mengjin   庞德   杀被闪抵消时弃目标一张牌
        //   双雄 shuangxiong 颜良文丑 摸牌阶段改判定并获得, 异色牌当决斗
        //   乱击 luanji    袁绍   两张同花色手牌当万箭齐发
        //   血裔 xueyi     袁绍   主公技锁定技: 手牌上限 +2X
        'qiangxi', 'quhu', 'jieming', 'bazhen', 'huoji', 'kanpo',
        'lianhuan', 'niepan', 'tianyi', 'mengjin', 'shuangxiong',
        'luanji', 'xueyi',
        // v15 U (林包 8 将 18 技):
        //   断粮 duanliang 徐晃 非锦囊黑色牌当兵粮寸断; 兵粮距离放宽到 2
        //   行殇 xingshang 曹丕 其他角色死亡时获得其所有牌
        //   放逐 fangzhu   曹丕 受伤后令一名其他角色摸 X 张并翻面
        //   颂威 songwei   曹丕 主公技: 其他魏势力黑色判定生效后你摸一张
        //   英魂 yinghun   孙坚 准备阶段 摸X弃一 / 摸一弃X 二选一
        //   好施 haoshi    鲁肃 摸牌阶段多摸两张, >5 张给一半
        //   缔盟 dimeng    鲁肃 弃 X 张令两名其他角色交换手牌
        //   祸首 huoshou   孟获 南蛮对你无效; 你代替成为南蛮伤害来源
        //   再起 zaiqi     孟获 放弃摸牌亮 X 张, 红桃回血其余获得
        //   巨象 juxiang   祝融 南蛮对你无效; 结算完毕的南蛮你获得之
        //   烈刃 lieren    祝融 杀造成伤害后拼点, 赢则获得其一张牌
        //   完杀 wansha    贾诩 你的回合内非濒死的其他角色不能用桃
        //   乱武 luanwu    贾诩 限定技: 所有其他角色对最近者用杀否则失血
        //   帷幕 weimu     贾诩 你不是黑色锦囊牌的合法目标
        //   酒池 jiuchi    董卓 黑桃手牌当酒
        //   肉林 roulin    董卓 与女性角色互相出杀时需两张闪抵消
        //   崩坏 benghuai  董卓 结束阶段非最小体力则失血或减上限
        //   暴虐 baonue    董卓 主公技: 群势力受伤后来源判定黑桃你回血
        'duanliang', 'xingshang', 'fangzhu', 'songwei', 'yinghun',
        'haoshi', 'dimeng', 'huoshou', 'zaiqi', 'juxiang', 'lieren',
        'wansha', 'luanwu', 'weimu', 'jiuchi', 'roulin', 'benghuai', 'baonue',
        // v15 V (山包 8 将 17 技 → 本批接入 7 将 15 技):
        //   巧变 qiaobian  张郃      弃一张手牌跳过摸牌阶段并拿两人各一张手牌
        //   屯田 tuntian   邓艾      回合外失去牌后判定, 非红桃置为"田"并缩距离
        //   凿险 zaoxian   邓艾      觉醒技: "田" ≥3 减 1 上限, 获得"急袭"
        //   急袭 jixi      (凿险授予) 一张"田"当【顺手牵羊】
        //   挑衅 tiaoxin   姜维      令攻击范围含你者出杀, 否则弃其一张牌
        //   志继 zhiji     姜维      觉醒技: 无手牌 → 回血/摸牌 + 减上限 + 观星
        //   享乐 xiangle   刘禅      锁定技: 来源不弃基本牌则此杀对你无效
        //   放权 fangquan  刘禅      跳过出牌阶段换一名其他角色的额外回合
        //   若愚 ruoyu     刘禅      主公技·觉醒技: 体力最小 → 加上限回血 + 激将
        //   激昂 jiang     孙策      决斗/红杀 指定或成为目标后摸一张
        //   魂姿 hunzi     孙策      觉醒技: 体力为 1 → 减上限, 获得英姿 + 英魂
        //   制霸 zhiba     孙策      主公技: 吴势力发起拼点, 其没赢你收两张牌
        //   直谏 zhijian   张昭张纮  手牌装备置入他人装备区并摸一张
        //   固政 guzheng   张昭张纮  他人弃牌阶段结束时还一张、余下归你
        //   悲歌 beige     蔡文姬    杀伤害后弃一张牌令其判定, 四花色四效果
        //   断肠 duanchang 蔡文姬    锁定技: 你死亡时杀死你的角色失去所有技能
        // 左慈 (化身/新生) 独立成本评估后本批不接入 —— 化身需要动态技能
        // 三态层 / 性别·势力覆写单点 / 场外武将牌堆三条横切基建, 见
        // docs/audit/2026-08-06-shan-pack-spec.md。
        'qiaobian', 'tuntian', 'zaoxian', 'jixi', 'tiaoxin', 'zhiji',
        'xiangle', 'fangquan', 'ruoyu', 'jiang', 'hunzi', 'zhiba',
        'zhijian', 'guzheng', 'beige', 'duanchang'
      ];
      // v8: qingnang 主动出牌阶段技; luoshen / guanxing 准备阶段自动 + ask
      // 走 pendingChoice. 其他 (guose / liuli / jijiu) 是 card-as / 触发型,
      // 不占技能按钮.
      // v11 C6: jieyin 为出牌阶段主动技 (占技能按钮, 选 2 张手牌)。
      // v12 H7: jijiang (主公主动求杀) / huangtian (群势力给牌, 全场型) /
      // lijian (弃牌挑决斗) 为出牌阶段主动技; hujia 纯响应型不占按钮。
      // v14 R1: guhuo 为出牌阶段主动技 (占技能按钮 → UI 声明面板)。
      // v15 T: 火包主动技 — 强袭/驱虎/天义 (出牌阶段主动发动) 与乱击
      // (选两张同花色手牌); 其余火包技能为触发/锁定/转化类。
      var ACTIVE_SKILL_IDS = ['zhiheng', 'kurou', 'rende', 'fanjian', 'guanxing', 'qingnang', 'luoshen', 'jieyin', 'jijiang', 'huangtian', 'lijian', 'guhuo',
        'qiangxi', 'quhu', 'tianyi', 'luanji',
        // v15 U: 林包主动技 — 缔盟 (选两名其他角色 + 弃 X 张) 与
        // 乱武 (限定技, 出牌阶段全场发动); 其余林包技能为触发/锁定/转化类。
        'dimeng', 'luanwu',
        // v15 V: 山包主动技 — 挑衅 (指定一名攻击范围含你的角色) /
        // 直谏 (选一张手牌装备 + 一名其他角色) / 制霸 (吴势力发起拼点);
        // 其余山包技能为触发/锁定/觉醒/转化类。
        'tiaoxin', 'zhijian', 'zhiba'];

      export { IMPLEMENTED_SKILL_IDS, ACTIVE_SKILL_IDS };
