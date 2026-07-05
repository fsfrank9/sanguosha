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
        'yaowu'
      ];
      // v8: qingnang 主动出牌阶段技; luoshen / guanxing 准备阶段自动 + ask
      // 走 pendingChoice. 其他 (guose / liuli / jijiu) 是 card-as / 触发型,
      // 不占技能按钮.
      // v11 C6: jieyin 为出牌阶段主动技 (占技能按钮, 选 2 张手牌)。
      var ACTIVE_SKILL_IDS = ['zhiheng', 'kurou', 'rende', 'fanjian', 'guanxing', 'qingnang', 'luoshen', 'jieyin'];

      export { IMPLEMENTED_SKILL_IDS, ACTIVE_SKILL_IDS };
