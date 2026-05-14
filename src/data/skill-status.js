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
        'guose', 'liuli', 'jijiu', 'qingnang', 'luoshen'
      ];
      // v8: qingnang 主动出牌阶段技; luoshen / guanxing 准备阶段自动 + ask
      // 走 pendingChoice. 其他 (guose / liuli / jijiu) 是 card-as / 触发型,
      // 不占技能按钮.
      var ACTIVE_SKILL_IDS = ['zhiheng', 'kurou', 'rende', 'fanjian', 'guanxing', 'qingnang', 'luoshen'];

      export { IMPLEMENTED_SKILL_IDS, ACTIVE_SKILL_IDS };
