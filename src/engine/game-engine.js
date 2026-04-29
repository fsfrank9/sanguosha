    (function () {
      'use strict';

      var HERO_CATALOG = {
        liubei: { id: 'liubei', name: '刘备', camp: '蜀', title: '乱世的枭雄', maxHp: 4, quote: '惟贤惟德，能服于人。', pack: 'standard', skills: [
          { id: 'rende', name: '仁德', desc: '出牌阶段可交给对方任意张牌；累计给出两张后回复 1 点体力。' },
          { id: 'jijiang', name: '激将', desc: '主公技：可令蜀势力角色代出【杀】；1v1 中作为身份技展示。', lord: true }
        ] },
        zhangfei: { id: 'zhangfei', name: '张飞', camp: '蜀', title: '万夫不当', maxHp: 4, quote: '燕人张飞在此！', pack: 'standard', skills: [{ id: 'paoxiao', name: '咆哮', desc: '锁定技：出牌阶段使用【杀】无次数限制。' }] },
        guanyu: { id: 'guanyu', name: '关羽', camp: '蜀', title: '武圣', maxHp: 4, quote: '关某义字当先。', pack: 'standard', skills: [{ id: 'wusheng', name: '武圣', desc: '可将红色牌当【杀】使用或打出。' }] },
        zhaoyun: { id: 'zhaoyun', name: '赵云', camp: '蜀', title: '虎威将军', maxHp: 4, quote: '进退自如，游刃有余。', pack: 'standard', skills: [{ id: 'longdan', name: '龙胆', desc: '可将【杀】当【闪】、【闪】当【杀】使用或打出。' }] },
        sunquan: { id: 'sunquan', name: '孙权', camp: '吴', title: '年轻的贤君', maxHp: 4, quote: '容我三思。', pack: 'standard', skills: [
          { id: 'zhiheng', name: '制衡', desc: '出牌阶段限一次，弃任意牌摸等量牌。' },
          { id: 'jiuyuan', name: '救援', desc: '主公技：吴势力角色对濒死的你使用【桃】回复量 +1；1v1 中作为身份技展示。', lord: true }
        ] },
        huanggai: { id: 'huanggai', name: '黄盖', camp: '吴', title: '轻身为国', maxHp: 4, quote: '请鞭挞我吧，公瑾！', pack: 'standard', skills: [{ id: 'kurou', name: '苦肉', desc: '出牌阶段可失去 1 点体力，摸两张牌。' }] },
        caocao: { id: 'caocao', name: '曹操', camp: '魏', title: '魏武帝', maxHp: 4, quote: '宁教我负天下人，休教天下人负我。', pack: 'standard', skills: [
          { id: 'jianxiong', name: '奸雄', desc: '受到伤害后可获得造成伤害的牌。' },
          { id: 'hujia', name: '护驾', desc: '主公技：可令魏势力角色代出【闪】；1v1 中作为身份技展示。', lord: true }
        ] },
        machao: { id: 'machao', name: '马超', camp: '群', title: '一骑当千', maxHp: 4, quote: '全军突击！', pack: 'standard', skills: [
          { id: 'mashu', name: '马术', desc: '锁定技：你计算与其他角色的距离 -1。' },
          { id: 'tieqi', name: '铁骑', desc: '杀指定目标后判定，红色则目标不能闪。' }
        ] },
        zhangliao: { id: 'zhangliao', name: '张辽', camp: '魏', title: '前将军', maxHp: 4, quote: '没想到吧？', pack: 'standard', skills: [{ id: 'tuxi', name: '突袭', desc: '摸牌阶段可少摸并从对方获得手牌。' }] },
        zhouyu: { id: 'zhouyu', name: '周瑜', camp: '吴', title: '大都督', maxHp: 3, quote: '哈哈哈哈！', pack: 'standard', skills: [
          { id: 'yingzi', name: '英姿', desc: '摸牌阶段额外摸一张牌。' },
          { id: 'fanjian', name: '反间', desc: '出牌阶段限一次，交给对方一张牌并猜花色；猜错则其受到 1 点伤害。' }
        ] },
        zhugeliang: { id: 'zhugeliang', name: '诸葛亮', camp: '蜀', title: '迟暮的丞相', maxHp: 3, quote: '观今夜天象，知天下大事。', pack: 'standard', skills: [
          { id: 'guanxing', name: '观星', desc: '准备阶段可观看并调整牌堆顶牌。' },
          { id: 'kongcheng', name: '空城', desc: '锁定技：无手牌时不能成为【杀】或【决斗】目标。' }
        ] }
      };

      function addHeroPack(pack, heroes) {
        heroes.forEach(function (hero) {
          hero.pack = hero.pack || pack;
          hero.skills = hero.skills || [];
          HERO_CATALOG[hero.id] = hero;
        });
      }

      addHeroPack('standard', [
        { id: 'xiahoudun', name: '夏侯惇', camp: '魏', title: '独眼的罗刹', maxHp: 4, quote: '刚烈之躯，岂惧刀兵。', skills: [{ id: 'ganglie', name: '刚烈', desc: '受到伤害后可判定反制来源。' }] },
        { id: 'xuchu', name: '许褚', camp: '魏', title: '虎痴', maxHp: 4, quote: '谁来与我大战三百回合！', skills: [{ id: 'luoyi', name: '裸衣', desc: '摸牌阶段可少摸以提升杀/决斗伤害。' }] },
        { id: 'simayi', name: '司马懿', camp: '魏', title: '狼顾之鬼', maxHp: 3, quote: '天命？哈哈哈哈！', skills: [{ id: 'fankui', name: '反馈', desc: '受到伤害后可获得来源一张牌。' }, { id: 'guicai', name: '鬼才', desc: '可打出牌修改判定。' }] },
        { id: 'guojia', name: '郭嘉', camp: '魏', title: '早终的先知', maxHp: 3, quote: '就这样吧。', skills: [{ id: 'tiandu', name: '天妒', desc: '判定牌生效后可获得。' }, { id: 'yiji', name: '遗计', desc: '受到伤害后可摸牌并分配。' }] },
        { id: 'zhenji', name: '甄姬', camp: '魏', title: '薄幸的美人', maxHp: 3, quote: '凌波微步，罗袜生尘。', skills: [{ id: 'luoshen', name: '洛神', desc: '准备阶段可连续判定获得黑色牌。' }, { id: 'qingguo', name: '倾国', desc: '可将黑色手牌当【闪】使用或打出。' }] },
        { id: 'ganning', name: '甘宁', camp: '吴', title: '锦帆游侠', maxHp: 4, quote: '接招吧！', skills: [{ id: 'qixi', name: '奇袭', desc: '可将黑色牌当【过河拆桥】使用。' }] },
        { id: 'lvmeng', name: '吕蒙', camp: '吴', title: '白衣渡江', maxHp: 4, quote: '克己复礼。', skills: [{ id: 'keji', name: '克己', desc: '若未使用/打出杀，可跳过弃牌阶段。' }] },
        { id: 'luxun', name: '陆逊', camp: '吴', title: '儒生雄才', maxHp: 3, quote: '牌不是万能的，但是没牌是万万不能的。', skills: [{ id: 'qianxun', name: '谦逊', desc: '不能成为顺手牵羊和乐不思蜀目标。' }, { id: 'lianying', name: '连营', desc: '失去最后手牌后可摸一张。' }] },
        { id: 'daqiao', name: '大乔', camp: '吴', title: '矜持之花', maxHp: 3, quote: '请休息吧。', skills: [{ id: 'guose', name: '国色', desc: '可将方片牌当【乐不思蜀】使用。' }, { id: 'liuli', name: '流离', desc: '被杀指定时可转移目标。' }] },
        { id: 'huangyueying', name: '黄月英', camp: '蜀', title: '归隐的杰女', maxHp: 3, quote: '哼，谁说女子不如男？', skills: [{ id: 'jizhi', name: '集智', desc: '使用锦囊牌时可摸一张。' }, { id: 'qicai', name: '奇才', desc: '锦囊牌距离无限。' }] },
        { id: 'huatuo', name: '华佗', camp: '群', title: '神医', maxHp: 3, quote: '早睡早起，方能养生。', skills: [{ id: 'jijiu', name: '急救', desc: '回合外可将红色牌当【桃】。' }, { id: 'qingnang', name: '青囊', desc: '出牌阶段可弃一牌令一名角色回复。' }] },
        { id: 'lvbu', name: '吕布', camp: '群', title: '武的化身', maxHp: 4, quote: '谁能挡我！', skills: [{ id: 'wushuang', name: '无双', desc: '杀/决斗需要目标连续响应两张。' }] },
        { id: 'diaochan', name: '貂蝉', camp: '群', title: '绝世的舞姬', maxHp: 3, quote: '失礼了。', skills: [{ id: 'lijian', name: '离间', desc: '出牌阶段可令两名男性角色决斗。' }, { id: 'biyue', name: '闭月', desc: '结束阶段摸一张牌。' }] }
      ]);

      addHeroPack('wind', [
        { id: 'xiahouyuan', name: '夏侯渊', camp: '魏', title: '疾行的猎豹', maxHp: 4, quote: '取汝首级犹探囊取物。', skills: [{ id: 'shensu', name: '神速', desc: '可跳过阶段视为使用杀。' }] },
        { id: 'caoren', name: '曹仁', camp: '魏', title: '大将军', maxHp: 4, quote: '固若金汤。', skills: [{ id: 'jushou', name: '据守', desc: '结束阶段可摸牌并翻面。' }] },
        { id: 'huangzhong', name: '黄忠', camp: '蜀', title: '老当益壮', maxHp: 4, quote: '百步穿杨！', skills: [{ id: 'liegong', name: '烈弓', desc: '满足条件时目标不能闪。' }] },
        { id: 'weiyan', name: '魏延', camp: '蜀', title: '嗜血的独狼', maxHp: 4, quote: '谁敢杀我？', skills: [{ id: 'kuanggu', name: '狂骨', desc: '造成伤害后可回复体力。' }] },
        { id: 'xiaoqiao', name: '小乔', camp: '吴', title: '矫情之花', maxHp: 3, quote: '接着哦。', skills: [{ id: 'tianxiang', name: '天香', desc: '受到伤害时可弃红桃转移。' }, { id: 'hongyan', name: '红颜', desc: '黑桃牌视为红桃。' }] },
        { id: 'zhoutai', name: '周泰', camp: '吴', title: '历战之躯', maxHp: 4, quote: '还不够！', skills: [{ id: 'buqu', name: '不屈', desc: '濒死时以不屈牌维持生存。' }] },
        { id: 'zhangjiao', name: '张角', camp: '群', title: '天公将军', maxHp: 3, quote: '苍天已死，黄天当立！', skills: [{ id: 'leiji', name: '雷击', desc: '打出闪后可判定造成雷伤害。' }, { id: 'guidao', name: '鬼道', desc: '可用黑色牌修改判定。' }, { id: 'huangtian', name: '黄天', desc: '主公技：群势力可给你闪/闪电。', lord: true }] },
        { id: 'yuji', name: '于吉', camp: '群', title: '太平道人', maxHp: 3, quote: '猜猜看哪。', skills: [{ id: 'guhuo', name: '蛊惑', desc: '可声明任意基本牌/锦囊。' }] }
      ]);

      addHeroPack('forest', [
        { id: 'xuhuang', name: '徐晃', camp: '魏', title: '周亚夫之风', maxHp: 4, quote: '兵粮寸断，粮草先行。', skills: [{ id: 'duanliang', name: '断粮', desc: '可将黑色基本/装备当兵粮寸断。' }] },
        { id: 'caopi', name: '曹丕', camp: '魏', title: '霸业的继承者', maxHp: 3, quote: '来，管杀还管埋。', skills: [{ id: 'xingshang', name: '行殇', desc: '角色死亡时可获得其牌。' }, { id: 'fangzhu', name: '放逐', desc: '受伤后可令一名角色翻面摸牌。' }, { id: 'songwei', name: '颂威', desc: '主公技：魏势力黑色判定后你可摸牌。', lord: true }] },
        { id: 'sunjian', name: '孙坚', camp: '吴', title: '武烈帝', maxHp: 4, quote: '以吾魂魄，保佑吾儿。', skills: [{ id: 'yinghun', name: '英魂', desc: '准备阶段可令一名角色摸弃或弃摸。' }] },
        { id: 'lusu', name: '鲁肃', camp: '吴', title: '独断的外交家', maxHp: 3, quote: '以和为贵。', skills: [{ id: 'haoshi', name: '好施', desc: '摸牌阶段可多摸并分牌。' }, { id: 'dimeng', name: '缔盟', desc: '可交换两名角色手牌。' }] },
        { id: 'menghuo', name: '孟获', camp: '蜀', title: '南蛮王', maxHp: 4, quote: '背黑锅我来，送死你去。', skills: [{ id: 'huoshou', name: '祸首', desc: '南蛮入侵视为由你造成。' }, { id: 'zaiqi', name: '再起', desc: '摸牌阶段可弃判定牌回复/摸牌。' }] },
        { id: 'zhurong', name: '祝融', camp: '蜀', title: '野性的女王', maxHp: 4, quote: '尝尝我飞刀的厉害！', skills: [{ id: 'juxiang', name: '巨象', desc: '南蛮入侵对你无效并可获得。' }, { id: 'lieren', name: '烈刃', desc: '杀造成伤害后可拼点获得牌。' }] },
        { id: 'jiaxu', name: '贾诩', camp: '群', title: '冷酷的毒士', maxHp: 3, quote: '神仙难救，神仙难救啊。', skills: [{ id: 'wansha', name: '完杀', desc: '你的回合濒死只能由本人用桃。' }, { id: 'luanwu', name: '乱武', desc: '限定技：所有角色依次使用杀或失血。' }, { id: 'weimu', name: '帷幕', desc: '不能成为黑色锦囊目标。' }] },
        { id: 'dongzhuo', name: '董卓', camp: '群', title: '魔王', maxHp: 8, quote: '酒池肉林，快活快活！', skills: [{ id: 'jiuchi', name: '酒池', desc: '可将黑桃牌当酒。' }, { id: 'roulin', name: '肉林', desc: '与女性角色杀/闪响应加倍。' }, { id: 'benghuai', name: '崩坏', desc: '结束阶段体力不是最少则失去体力或上限。' }, { id: 'baonue', name: '暴虐', desc: '主公技：群势力造成伤害后可令你判定回复。', lord: true }] }
      ]);

      addHeroPack('fire', [
        { id: 'dianwei', name: '典韦', camp: '魏', title: '古之恶来', maxHp: 4, quote: '吃我一戟！', skills: [{ id: 'qiangxi', name: '强袭', desc: '出牌阶段可失血或弃武器对距离 1 角色造成伤害。' }] },
        { id: 'xunyu', name: '荀彧', camp: '魏', title: '王佐之才', maxHp: 3, quote: '驱虎吞狼。', skills: [{ id: 'quhu', name: '驱虎', desc: '拼点令强者伤害他人。' }, { id: 'jieming', name: '节命', desc: '受伤后可令一名角色补手牌至体力上限。' }] },
        { id: 'wolong', name: '卧龙诸葛亮', camp: '蜀', title: '卧龙', maxHp: 3, quote: '此阵可挡精兵十万。', skills: [{ id: 'bazhen', name: '八阵', desc: '无防具时视为装备八卦阵。' }, { id: 'huoji', name: '火计', desc: '可将红色牌当火攻。' }, { id: 'kanpo', name: '看破', desc: '可将黑色牌当无懈可击。' }] },
        { id: 'pangtong', name: '庞统', camp: '蜀', title: '凤雏', maxHp: 3, quote: '伤一敌可连其百。', skills: [{ id: 'lianhuan', name: '连环', desc: '可将梅花牌当铁索连环重铸/使用。' }, { id: 'niepan', name: '涅槃', desc: '限定技：濒死时复原并摸牌。' }] },
        { id: 'taishici', name: '太史慈', camp: '吴', title: '笃烈之士', maxHp: 4, quote: '大丈夫生于乱世，当带三尺剑立不世之功！', skills: [{ id: 'tianyi', name: '天义', desc: '拼点成功后杀次数/目标/距离增强。' }] },
        { id: 'pangde', name: '庞德', camp: '群', title: '抬榇之悟', maxHp: 4, quote: '抬棺而战，不死不休！', skills: [{ id: 'mashu', name: '马术', desc: '锁定技：你计算与其他角色距离 -1。' }, { id: 'mengjin', name: '猛进', desc: '杀被闪抵消后可弃目标一张牌。' }] },
        { id: 'yanliangwenchou', name: '颜良文丑', camp: '群', title: '虎狼兄弟', maxHp: 4, quote: '快来与我等决一死战！', skills: [{ id: 'shuangxiong', name: '双雄', desc: '摸牌阶段判定后可将异色牌当决斗。' }] },
        { id: 'yuanshao', name: '袁绍', camp: '群', title: '高贵的名门', maxHp: 4, quote: '弓箭手，准备放箭！', skills: [{ id: 'luanji', name: '乱击', desc: '可将两张同花色手牌当万箭齐发。' }, { id: 'xueyi', name: '血裔', desc: '主公技：手牌上限增加。', lord: true }] }
      ]);

      addHeroPack('mountain', [
        { id: 'zhanghe', name: '张郃', camp: '魏', title: '料敌机先', maxHp: 4, quote: '兵无常势，水无常形。', skills: [{ id: 'qiaobian', name: '巧变', desc: '可弃手牌跳过阶段并移动牌。' }] },
        { id: 'dengai', name: '邓艾', camp: '魏', title: '矫然的壮士', maxHp: 4, quote: '屯田日久，当建奇功。', skills: [{ id: 'tuntian', name: '屯田', desc: '回合外失牌后判定为田。' }, { id: 'zaoxian', name: '凿险', desc: '觉醒技：田达到条件后获得急袭。' }] },
        { id: 'liushan', name: '刘禅', camp: '蜀', title: '无为的真命主', maxHp: 3, quote: '享乐太平，有何不可？', skills: [{ id: 'xiangle', name: '享乐', desc: '杀指定你时需弃基本牌。' }, { id: 'fangquan', name: '放权', desc: '可跳过出牌阶段令他人额外回合。' }, { id: 'ruoyu', name: '若愚', desc: '主公觉醒技。', lord: true }] },
        { id: 'jiangwei', name: '姜维', camp: '蜀', title: '龙的衣钵', maxHp: 4, quote: '丞相遗志，不敢忘却。', skills: [{ id: 'tiaoxin', name: '挑衅', desc: '令目标对你使用杀，否则你弃其牌。' }, { id: 'zhiji', name: '志继', desc: '觉醒技：无手牌时减上限并获得观星。' }] },
        { id: 'sunce', name: '孙策', camp: '吴', title: '江东的小霸王', maxHp: 4, quote: '吾乃江东小霸王孙伯符！', skills: [{ id: 'jiang', name: '激昂', desc: '红色杀/决斗相关时摸牌。' }, { id: 'hunzi', name: '魂姿', desc: '觉醒技：体力低时减上限得英姿英魂。' }, { id: 'zhiba', name: '制霸', desc: '主公技：吴势力可与你拼点。', lord: true }] },
        { id: 'erzhang', name: '张昭张纮', camp: '吴', title: '经天纬地', maxHp: 3, quote: '为将军计，当从容图之。', skills: [{ id: 'zhijian', name: '直谏', desc: '可将装备置入他人装备区并摸牌。' }, { id: 'guzheng', name: '固政', desc: '弃牌阶段结束时可归还弃牌并获得其余。' }] },
        { id: 'caiwenji', name: '蔡文姬', camp: '群', title: '异乡的孤女', maxHp: 3, quote: '胡笳十八拍，拍拍断人肠。', skills: [{ id: 'beige', name: '悲歌', desc: '角色受杀伤害后可弃牌判定辅助。' }, { id: 'duanchang', name: '断肠', desc: '死亡后杀死你的角色失去技能。' }] },
        { id: 'zuoci', name: '左慈', camp: '群', title: '迷之仙人', maxHp: 3, quote: '幻化之术，存乎一心。', skills: [{ id: 'huashen', name: '化身', desc: '获得化身牌并拥有其技能。' }, { id: 'xinsheng', name: '新生', desc: '受到伤害后获得化身。' }] }
      ]);

      addHeroPack('sp', [
        { id: 'sp_zhaoyun', name: 'SP 赵云', camp: '群', title: '白马先锋', maxHp: 3, quote: '龙胆在身，进退无惧。', skills: [{ id: 'longdan', name: '龙胆', desc: '杀/闪互转。' }, { id: 'chongzhen', name: '冲阵', desc: '发动龙胆时可获得对方牌。' }] },
        { id: 'sp_diaochan', name: 'SP 貂蝉', camp: '群', title: '暗黑的傀儡师', maxHp: 3, quote: '这场戏才刚刚开始。', skills: [{ id: 'lihun', name: '离魂', desc: '可获得男性角色手牌后交还。' }, { id: 'biyue', name: '闭月', desc: '结束阶段摸一张。' }] },
        { id: 'sp_machao', name: 'SP 马超', camp: '群', title: '西凉的猛狮', maxHp: 4, quote: '西凉铁骑，踏破山河！', skills: [{ id: 'zhuiji', name: '追击', desc: '距离相关锁定技。' }, { id: 'shichou', name: '誓仇', desc: '主公技/限定技展示。' }] },
        { id: 'sp_guanyu', name: 'SP 关羽', camp: '魏', title: '汉寿亭侯', maxHp: 4, quote: '单刀赴会，义薄云天。', skills: [{ id: 'wusheng', name: '武圣', desc: '红牌当杀。' }, { id: 'danji', name: '单骑', desc: '觉醒技：条件达成后获得马术。' }] },
        { id: 'sp_jiaxu', name: 'SP 贾诩', camp: '魏', title: '算无遗策', maxHp: 3, quote: '一切尽在算计。', skills: [{ id: 'zhenlue', name: '缜略', desc: '锦囊不受距离/无懈影响。' }, { id: 'jianshu', name: '间书', desc: '限定技：交给牌并令二人拼点。' }, { id: 'yongdi', name: '拥嫡', desc: '限定技：令男性角色加上限。' }] },
        { id: 'sp_caoren', name: 'SP 曹仁', camp: '魏', title: '险不辞难', maxHp: 4, quote: '据守城池，以待援军。', skills: [{ id: 'weikui', name: '伪溃', desc: '可失体力观看并弃牌。' }, { id: 'lizhan', name: '励战', desc: '结束阶段令角色摸牌。' }] },
        { id: 'sp_ganning', name: 'SP 甘宁', camp: '吴', title: '铃铛游侠', maxHp: 4, quote: '锦帆夜袭，片甲不留。', skills: [{ id: 'yinling', name: '银铃', desc: '可将黑色牌置为锦。' }, { id: 'junwei', name: '军威', desc: '结束阶段可弃锦令目标选择。' }] },
        { id: 'sp_pangde', name: 'SP 庞德', camp: '魏', title: '决死抬榇', maxHp: 4, quote: '今日不是你死，就是我亡。', skills: [{ id: 'mashu', name: '马术', desc: '距离 -1。' }, { id: 'jianchu', name: '鞬出', desc: '杀指定后可弃目标牌。' }] },
        { id: 'sp_yuanshu', name: 'SP 袁术', camp: '群', title: '仲家帝', maxHp: 4, quote: '玉玺在手，天下我有。', skills: [{ id: 'yongsi', name: '庸肆', desc: '摸牌/弃牌数与势力数相关。' }, { id: 'weidi', name: '伪帝', desc: '拥有当前主公技。' }] },
        { id: 'sp_daqiao', name: 'SP 大乔', camp: '吴', title: '韶光易逝', maxHp: 3, quote: '伯符，我去了。', skills: [{ id: 'yanxiao', name: '言笑', desc: '可将方片牌置入判定区抵消判定牌。' }, { id: 'anxian', name: '安娴', desc: '出牌/被杀时摸弃。' }] },
        { id: 'sp_xiahoudun', name: 'SP 夏侯惇', camp: '魏', title: '啖睛的苍狼', maxHp: 4, quote: '以彼之道，还施彼身。', skills: [{ id: 'fenyong', name: '愤勇', desc: '受到伤害后防止下一次伤害。' }, { id: 'xuehen', name: '雪恨', desc: '准备阶段可弃置来源牌。' }] },
        { id: 'sp_sunshangxiang', name: 'SP 孙尚香', camp: '蜀', title: '梦醉良缘', maxHp: 3, quote: '夫君，身体要紧。', skills: [{ id: 'liangzhu', name: '良助', desc: '角色回复后可摸牌或令其摸牌。' }, { id: 'fanxiang', name: '返乡', desc: '觉醒技：获得枭姬。' }] }
      ]);

      var IMPLEMENTED_SKILL_IDS = [
        'zhiheng', 'kurou', 'rende', 'fanjian', 'guanxing',
        'paoxiao', 'wusheng', 'longdan', 'jianxiong', 'mashu', 'tieqi', 'tuxi', 'yingzi', 'kongcheng',
        'biyue', 'keji', 'jizhi'
      ];
      var ACTIVE_SKILL_IDS = ['zhiheng', 'kurou', 'rende', 'fanjian', 'guanxing'];

      function annotateSkillStatus() {
        Object.keys(HERO_CATALOG).forEach(function (heroId) {
          (HERO_CATALOG[heroId].skills || []).forEach(function (skill) {
            if (IMPLEMENTED_SKILL_IDS.indexOf(skill.id) >= 0) {
              skill.status = 'implemented';
              skill.statusText = ACTIVE_SKILL_IDS.indexOf(skill.id) >= 0 ? '可主动发动' : '已实现：自动/锁定触发';
            } else if (skill.lord) {
              skill.status = 'display';
              skill.statusText = '1v1 展示技';
            } else {
              skill.status = 'todo';
              skill.statusText = '未实现';
            }
          });
        });
      }

      annotateSkillStatus();

      var HEROES = {
        player: HERO_CATALOG.liubei,
        enemy: HERO_CATALOG.caocao
      };

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

      function clone(value) {
        return JSON.parse(JSON.stringify(value));
      }

      function makeRng(seed) {
        var state = Math.floor(Math.abs(Number(seed) || 1)) % 2147483647;
        if (state === 0) state = 1;
        return function random() {
          state = state * 16807 % 2147483647;
          return (state - 1) / 2147483646;
        };
      }

      function makePlayer(hero) {
        return {
          id: hero.id,
          heroId: hero.id,
          name: hero.name,
          camp: hero.camp,
          title: hero.title,
          quote: hero.quote,
          skills: clone(hero.skills || []),
          maxHp: hero.maxHp,
          hp: hero.maxHp,
          hand: [],
          equipment: { weapon: null, armor: null, horseMinus: null, horsePlus: null },
          judgeArea: [],
          flags: {},
          usedSha: false,
          usedOrRespondedSha: false,
          shaBonus: 0
        };
      }

      function colorOfSuit(suit) {
        return suit === 'heart' || suit === 'diamond' ? 'red' : 'black';
      }

      function suitForIndex(index) {
        return ['spade', 'heart', 'club', 'diamond'][index % 4];
      }

      function rankForIndex(index) {
        return ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][index % 13];
      }

      function makeTestCard(type, overrides) {
        overrides = overrides || {};
        var info = CARD_CATALOG[type];
        if (!info) throw new Error('Unknown card type: ' + type);
        var suit = overrides.suit || 'spade';
        var card = {
          id: overrides.id || type + '-test',
          type: type,
          name: info.name,
          family: info.family,
          group: info.group,
          label: info.label,
          symbol: info.symbol,
          desc: info.desc,
          slot: info.slot || null,
          range: info.range || null,
          suit: suit,
          rank: overrides.rank || 'A',
          color: overrides.color || colorOfSuit(suit)
        };
        Object.keys(overrides).forEach(function (key) { card[key] = overrides[key]; });
        if (!card.color && card.suit) card.color = colorOfSuit(card.suit);
        return card;
      }

      function makeCard(game, type) {
        var nextIndex = game.nextId + 1;
        var suit = suitForIndex(nextIndex);
        var rank = rankForIndex(nextIndex);
        game.nextId += 1;
        return makeTestCard(type, {
          id: type + '-' + game.nextId,
          suit: suit,
          rank: rank,
          color: colorOfSuit(suit)
        });
      }

      function shuffle(cards, random) {
        for (var i = cards.length - 1; i > 0; i -= 1) {
          var j = Math.floor(random() * (i + 1));
          var tmp = cards[i];
          cards[i] = cards[j];
          cards[j] = tmp;
        }
        return cards;
      }

      function buildDeck(game, random) {
        var recipe = [
          ['sha', 22], ['fire_sha', 5], ['thunder_sha', 5], ['shan', 18], ['tao', 10], ['jiu', 6],
          ['wuzhong', 4], ['juedou', 3], ['guohe', 6], ['shunshou', 5], ['jiedao', 2], ['taoyuan', 1], ['wugu', 2],
          ['nanman', 3], ['wanjian', 2], ['wuxie', 6], ['huogong', 3], ['tiesuo', 6],
          ['lebusishu', 3], ['bingliang', 2], ['shandian', 2],
          ['zhuge', 2], ['qinggang', 1], ['cixiong', 1], ['qinglong', 1], ['zhangba', 1], ['guanshi', 1], ['fangtian', 1], ['qilin', 1],
          ['bagua', 2], ['renwang', 1], ['tengjia', 1], ['baiyin', 1], ['minus_horse', 4], ['plus_horse', 4]
        ];
        var deck = [];
        recipe.forEach(function (pair) {
          for (var i = 0; i < pair[1]; i += 1) {
            deck.push(makeCard(game, pair[0]));
          }
        });
        return shuffle(deck, random);
      }

      function actorName(game, actor) {
        return game[actor].name;
      }

      function opponent(actor) {
        return actor === 'player' ? 'enemy' : 'player';
      }

      function hasSkill(state, skillId) {
        return !!(state.skills || []).some(function (skill) { return skill.id === skillId; });
      }

      function isShaType(type) {
        return type === 'sha' || type === 'fire_sha' || type === 'thunder_sha';
      }

      function isShaCard(card) {
        if (!card) return false;
        return isShaType(typeof card === 'string' ? card : card.type);
      }

      function canUseUnlimitedSha(state) {
        return hasSkill(state, 'paoxiao') || (state.equipment && state.equipment.weapon && state.equipment.weapon.type === 'zhuge');
      }

      function weaponRange(state) {
        return state && state.equipment && state.equipment.weapon && state.equipment.weapon.range ? state.equipment.weapon.range : 1;
      }

      function distanceBetween(game, fromActor, toActor) {
        var from = game[fromActor];
        var to = game[toActor];
        if (!from || !to) return Infinity;
        var distance = 1;
        if (to.equipment && to.equipment.horsePlus) distance += 1;
        if (from.equipment && from.equipment.horseMinus) distance -= 1;
        if (hasSkill(from, 'mashu')) distance -= 1;
        return Math.max(1, distance);
      }

      function canReachWithSha(game, actor, targetActor) {
        return distanceBetween(game, actor, targetActor) <= weaponRange(game[actor]);
      }

      function isKongchengProtected(game, targetActor, cardType) {
        var target = game[targetActor];
        return !!(target && hasSkill(target, 'kongcheng') && target.hand.length === 0 && (isShaType(cardType) || cardType === 'juedou'));
      }

      function takeHandCard(game, fromActor, toActor, reason) {
        var from = game[fromActor];
        var to = game[toActor];
        if (!from || !to || !from.hand.length) return null;
        var index = randomHandIndex(game, from);
        var card = from.hand.splice(index, 1)[0];
        to.hand.push(card);
        log(game, actorName(game, toActor) + (reason || '获得') + actorName(game, fromActor) + '的一张手牌。');
        return card;
      }

      function performDrawPhase(game, actor) {
        var state = game[actor];
        var drawCount = hasSkill(state, 'yingzi') ? 3 : 2;
        if (hasSkill(state, 'yingzi')) log(game, actorName(game, actor) + '发动【英姿】，摸牌阶段额外摸一张牌。');
        if (hasSkill(state, 'tuxi') && game[opponent(actor)].hand.length > 0) {
          takeHandCard(game, opponent(actor), actor, '发动【突袭】，获得');
          drawCount = Math.max(0, drawCount - 1);
        }
        return drawCards(game, actor, drawCount);
      }

      function isArmorIgnoredBySha(game, sourceActor, card) {
        var source = game[sourceActor];
        return !!(source && isShaCard(card) && source.equipment && source.equipment.weapon && source.equipment.weapon.type === 'qinggang');
      }

      function log(game, text) {
        game.log.push(text);
        if (game.log.length > 80) game.log.shift();
      }

      function reshuffleIfNeeded(game) {
        if (game.deck.length > 0 || game.discard.length === 0) return;
        log(game, '牌堆耗尽，洗混弃牌堆形成新的牌堆。');
        game.deck = shuffle(game.discard.splice(0), game.random);
      }

      function drawCards(game, actor, count) {
        var drawn = [];
        for (var i = 0; i < count; i += 1) {
          reshuffleIfNeeded(game);
          if (game.deck.length === 0) break;
          var card = game.deck.pop();
          game[actor].hand.push(card);
          drawn.push(card);
        }
        if (drawn.length > 0) {
          log(game, actorName(game, actor) + '摸了 ' + drawn.length + ' 张牌。');
        }
        return drawn;
      }

      function isNormalTrickCard(card) {
        return !!card && card.family === 'trick';
      }

      function shouldTriggerJizhi(card, options) {
        return isNormalTrickCard(card) && !(card.type === 'tiesuo' && options && options.mode === 'recast');
      }

      function triggerJizhi(game, actor, card, options) {
        var state = game[actor];
        if (!state || !hasSkill(state, 'jizhi') || !shouldTriggerJizhi(card, options) || game.phase === 'gameover') return;
        log(game, actorName(game, actor) + '发动【集智】，使用普通锦囊后摸 1 张牌。');
        drawCards(game, actor, 1);
      }

      function finishTrickUse(game, actor, card, result, options) {
        if (result && result.ok) triggerJizhi(game, actor, card, options);
        return result;
      }

      function removeCardFromHand(state, cardId) {
        var index = state.hand.findIndex(function (card) { return card.id === cardId; });
        if (index < 0) return null;
        return state.hand.splice(index, 1)[0];
      }

      function removeFirstMatchingCard(state, predicate) {
        var index = state.hand.findIndex(predicate);
        if (index < 0) return null;
        return state.hand.splice(index, 1)[0];
      }

      function removeFirstCardOfType(state, type) {
        return removeFirstMatchingCard(state, function (card) { return type === 'sha' ? isShaCard(card) : card.type === type; });
      }

      function physicalCardOf(card) {
        return card && card.physicalCard ? card.physicalCard : card;
      }

      function discardCard(game, card) {
        var physicalCard = physicalCardOf(card);
        if (physicalCard) game.discard.push(physicalCard);
      }

      function equipCard(game, actor, card) {
        var self = game[actor];
        if (!self) return fail('未知角色。');
        if (!card || card.family !== 'equipment') return fail('这不是装备牌。');
        var slot = card.slot || (CARD_CATALOG[card.type] && CARD_CATALOG[card.type].slot);
        if (!slot) return fail('装备槽位未知。');
        removeCardFromHand(self, card.id);
        if (self.equipment[slot]) {
          discardCard(game, self.equipment[slot]);
          log(game, actorName(game, actor) + '替换并弃置了原有装备【' + self.equipment[slot].name + '】。');
        }
        self.equipment[slot] = card;
        log(game, actorName(game, actor) + '装备了【' + card.name + '】。');
        return success('装备成功。');
      }

      function loseEquipment(game, actor, slot) {
        var self = game[actor];
        if (!self || !self.equipment) return fail('未知角色。');
        var card = self.equipment[slot];
        if (!card) return fail('该槽位没有装备。');
        self.equipment[slot] = null;
        discardCard(game, card);
        log(game, actorName(game, actor) + '失去了【' + card.name + '】。');
        if (card.type === 'baiyin' && self.hp > 0 && self.hp < self.maxHp) {
          self.hp = Math.min(self.maxHp, self.hp + 1);
          log(game, actorName(game, actor) + '因失去【白银狮子】回复 1 点体力。');
        }
        return success('失去装备。');
      }

      function applyWeaponHitEffects(game, actor, targetActor) {
        var weapon = game[actor].equipment && game[actor].equipment.weapon;
        if (!weapon) return;
        if (weapon.type === 'qilin') {
          if (game[targetActor].equipment.horsePlus) loseEquipment(game, targetActor, 'horsePlus');
          if (game[targetActor].equipment.horseMinus) loseEquipment(game, targetActor, 'horseMinus');
        } else if (weapon.type === 'cixiong') {
          if (game[targetActor].hand.length) {
            var dropped = game[targetActor].hand.splice(0, 1)[0];
            discardCard(game, dropped);
            log(game, actorName(game, targetActor) + '因【雌雄双股剑】弃置一张牌。');
          } else {
            drawCards(game, actor, 1);
            log(game, actorName(game, actor) + '因【雌雄双股剑】摸一张牌。');
          }
        }
      }

      function randomHandIndex(game, state) {
        if (!state.hand.length) return -1;
        return Math.floor(game.random() * state.hand.length);
      }

      function fail(message) {
        return { ok: false, message: message };
      }

      function success(message) {
        return { ok: true, message: message };
      }

      function damage(game, targetActor, amount, sourceActor, reason, sourceCard, nature) {
        if (game.phase === 'gameover') return false;
        var target = game[targetActor];
        if (!target) return false;
        amount = Number(amount) || 0;
        var armor = target.equipment && target.equipment.armor;
        var ignoreArmor = !!(armor && sourceActor && sourceCard && isArmorIgnoredBySha(game, sourceActor, sourceCard));
        var damageNature = nature || 'normal';
        if (sourceCard && sourceCard.type === 'fire_sha') damageNature = 'fire';
        if (sourceCard && sourceCard.type === 'thunder_sha') damageNature = 'thunder';
        if (/火攻/.test(reason || '')) damageNature = 'fire';
        if (/闪电|雷/.test(reason || '')) damageNature = 'thunder';

        if (armor && !ignoreArmor && armor.type === 'tengjia') {
          if (damageNature === 'fire') {
            amount += 1;
            log(game, actorName(game, targetActor) + '的【藤甲】令火焰伤害 +1。');
          } else if ((sourceCard && sourceCard.type === 'sha') || /南蛮入侵|万箭齐发/.test(reason || '')) {
            log(game, actorName(game, targetActor) + '的【藤甲】防止了这次伤害。');
            if (sourceCard) discardCard(game, sourceCard);
            return false;
          }
        }

        if (armor && !ignoreArmor && armor.type === 'baiyin' && amount > 1) {
          amount = 1;
          log(game, actorName(game, targetActor) + '的【白银狮子】将伤害防止至 1 点。');
        }

        if (amount <= 0) {
          if (sourceCard) discardCard(game, sourceCard);
          return false;
        }
        target.hp = Math.max(0, target.hp - amount);
        log(game, actorName(game, targetActor) + '因' + reason + '受到 ' + amount + ' 点伤害。');
        var physicalSourceCard = physicalCardOf(sourceCard);
        if (sourceCard && physicalSourceCard && hasSkill(target, 'jianxiong')) {
          target.hand.push(physicalSourceCard);
          log(game, actorName(game, targetActor) + '发动【奸雄】，获得了造成伤害的【' + physicalSourceCard.name + '】。');
        } else if (sourceCard) {
          discardCard(game, sourceCard);
        }
        if (target.hp <= 0) {
          game.phase = 'gameover';
          game.winner = sourceActor || opponent(targetActor);
          log(game, actorName(game, game.winner) + '获胜！');
        }
        return true;
      }

      function findResponseCard(state, type) {
        var card = null;
        if (type === 'shan') {
          card = removeFirstCardOfType(state, 'shan');
          if (card) return { card: card, asName: '闪', skillName: null };
          if (hasSkill(state, 'longdan')) {
            card = removeFirstMatchingCard(state, function (item) { return isShaCard(item); });
            if (card) return { card: card, asName: '闪', skillName: '龙胆' };
          }
          return null;
        }
        if (type === 'sha') {
          card = removeFirstCardOfType(state, 'sha');
          if (card) return { card: card, asName: '杀', skillName: null };
          if (hasSkill(state, 'longdan')) {
            card = removeFirstCardOfType(state, 'shan');
            if (card) return { card: card, asName: '杀', skillName: '龙胆' };
          }
          if (hasSkill(state, 'wusheng')) {
            card = removeFirstMatchingCard(state, function (item) { return item.color === 'red'; });
            if (card) return { card: card, asName: '杀', skillName: '武圣' };
          }
          return null;
        }
        card = removeFirstCardOfType(state, type);
        return card ? { card: card, asName: card.name, skillName: null } : null;
      }

      function consumeResponse(game, actor, type, reason) {
        var response = findResponseCard(game[actor], type);
        if (!response) return false;
        if (type === 'sha' && actor === game.turn) game[actor].usedOrRespondedSha = true;
        discardCard(game, response.card);
        if (response.skillName) {
          log(game, actorName(game, actor) + '发动【' + response.skillName + '】，将【' + response.card.name + '】当【' + response.asName + '】响应' + reason + '。');
        } else {
          log(game, actorName(game, actor) + '打出【' + response.card.name + '】响应' + reason + '。');
        }
        return true;
      }

      function consumeWuxie(game, actor, reason) {
        var card = removeFirstCardOfType(game[actor], 'wuxie');
        if (!card) return false;
        discardCard(game, card);
        log(game, actorName(game, actor) + '打出【无懈可击】抵消' + reason + '。');
        triggerJizhi(game, actor, card, { response: true });
        return true;
      }

      function judge(game, actor, reason) {
        reshuffleIfNeeded(game);
        var card = game.deck.pop();
        if (!card) return null;
        discardCard(game, card);
        log(game, actorName(game, actor) + '进行' + reason + '判定：【' + card.name + '】' + card.suit + ' ' + card.rank + '。');
        return card;
      }

      function processJudgeArea(game, actor) {
        var state = game[actor];
        state.flags.skipPlay = false;
        state.flags.skipDraw = false;
        if (!state.judgeArea) state.judgeArea = [];
        var pending = state.judgeArea.splice(0);
        pending.forEach(function (trick) {
          if (trick.type === 'lebusishu') {
            var lebuJudge = judge(game, actor, '【乐不思蜀】');
            if (!lebuJudge || lebuJudge.suit !== 'heart') {
              state.flags.skipPlay = true;
              log(game, actorName(game, actor) + '【乐不思蜀】判定失败，跳过出牌阶段。');
            }
            discardCard(game, trick);
          } else if (trick.type === 'bingliang') {
            var bingJudge = judge(game, actor, '【兵粮寸断】');
            if (!bingJudge || bingJudge.suit !== 'club') {
              state.flags.skipDraw = true;
              log(game, actorName(game, actor) + '【兵粮寸断】判定失败，跳过摸牌阶段。');
            }
            discardCard(game, trick);
          } else if (trick.type === 'shandian') {
            var shanJudge = judge(game, actor, '【闪电】');
            if (shanJudge && shanJudge.suit === 'spade' && ['2','3','4','5','6','7','8','9'].indexOf(String(shanJudge.rank)) >= 0) {
              damage(game, actor, 3, opponent(actor), '【闪电】');
              discardCard(game, trick);
            } else {
              game[opponent(actor)].judgeArea.push(trick);
              log(game, '【闪电】移至' + actorName(game, opponent(actor)) + '的判定区。');
            }
          } else {
            discardCard(game, trick);
          }
        });
      }

      function firstActorFromRoles(roles, fallback) {
        if (roles.player === '主公') return 'player';
        if (roles.enemy === '主公') return 'enemy';
        return fallback || 'player';
      }

      function newGame(options) {
        options = options || {};
        var random = makeRng(options.seed || Date.now());
        var roles = {
          player: options.playerRole || '主公',
          enemy: options.enemyRole || '反贼'
        };
        var firstActor = options.firstActor || firstActorFromRoles(roles, 'player');
        var game = {
          version: '3.0.0',
          random: random,
          nextId: 0,
          turn: firstActor,
          phase: 'play',
          winner: null,
          deck: [],
          discard: [],
          log: [],
          turnHistory: [],
          roles: roles,
          firstActor: firstActor,
          player: makePlayer(clone(HERO_CATALOG[options.playerHero] || HEROES.player)),
          enemy: makePlayer(clone(HERO_CATALOG[options.enemyHero] || HEROES.enemy))
        };
        game.deck = buildDeck(game, random);
        drawCards(game, 'player', 4);
        drawCards(game, 'enemy', 4);
        log(game, '乱世开局：' + actorName(game, firstActor) + '为主公先手。');
        if (options.startWithFirstTurn) startTurn(game, firstActor);
        return game;
      }

      function equipmentSlots() {
        return ['weapon', 'armor', 'horseMinus', 'horsePlus'];
      }

      function equipmentSlotLabel(slot) {
        var labels = { weapon: '武器', armor: '防具', horseMinus: '-1 马', horsePlus: '+1 马' };
        return labels[slot] || '装备';
      }

      function equipmentList(state) {
        return equipmentSlots().map(function (slot) {
          return state.equipment && state.equipment[slot] ? { slot: slot, card: state.equipment[slot] } : null;
        }).filter(Boolean);
      }

      function hasAnyTargetableCard(state) {
        return !!(state && ((state.hand && state.hand.length) || (state.judgeArea && state.judgeArea.length) || equipmentList(state).length));
      }

      function defaultTargetZone(state) {
        if (state.hand && state.hand.length) return 'hand';
        if (equipmentList(state).length) return 'equipment';
        if (state.judgeArea && state.judgeArea.length) return 'judge';
        return 'hand';
      }

      function getTargetZoneCards(game, targetActor, zone) {
        var target = game && game[targetActor];
        if (!target) return [];
        zone = zone || defaultTargetZone(target);
        if (zone === 'hand') {
          return target.hand.map(function (card, index) {
            return { zone: 'hand', zoneLabel: '手牌区', index: index, card: card, label: '手牌 ' + (index + 1), hidden: true };
          });
        }
        if (zone === 'equipment') {
          return equipmentList(target).map(function (entry) {
            return { zone: 'equipment', zoneLabel: '装备区', slot: entry.slot, card: entry.card, label: equipmentSlotLabel(entry.slot) + '【' + entry.card.name + '】' };
          });
        }
        if (zone === 'judge') {
          return target.judgeArea.map(function (card, index) {
            return { zone: 'judge', zoneLabel: '延时锦囊区', index: index, card: card, label: '判定 ' + (index + 1) + '【' + card.name + '】' };
          });
        }
        return [];
      }

      function removeTargetZoneCard(game, targetActor, zone, cardId) {
        var target = game[targetActor];
        zone = zone || defaultTargetZone(target);
        var choices = getTargetZoneCards(game, targetActor, zone);
        if (!choices.length) return null;
        var picked;
        if (cardId) {
          picked = choices.find(function (entry) { return entry.card.id === cardId; });
          if (!picked) return null;
        } else if (zone === 'hand') {
          picked = choices[randomHandIndex(game, target)];
        } else {
          picked = choices[0];
        }
        if (!picked || !picked.card) return null;
        if (zone === 'hand') {
          return { card: target.hand.splice(picked.index, 1)[0], zone: '手牌' };
        }
        if (zone === 'equipment') {
          target.equipment[picked.slot] = null;
          return { card: picked.card, zone: '装备区' };
        }
        if (zone === 'judge') {
          return { card: target.judgeArea.splice(picked.index, 1)[0], zone: '判定区' };
        }
        return null;
      }

      function canPlayCard(game, actor, card) {
        if (!card) return fail('找不到这张牌。');
        if (game.phase === 'gameover') return fail('游戏已经结束。');
        if (game.turn !== actor) return fail('还没有轮到你行动。');
        if (game.phase !== 'play') return fail('当前不是出牌阶段。');
        var self = game[actor];
        if (card.type === 'shan' || card.type === 'wuxie') return fail('【' + card.name + '】只能用于响应，本版会自动打出。');
        if (isKongchengProtected(game, opponent(actor), card.type)) return fail(actorName(game, opponent(actor)) + '处于【空城】状态，不能成为【' + card.name + '】目标。');
        if (isShaCard(card) && !canReachWithSha(game, actor, opponent(actor))) return fail('距离不足，当前武器范围无法使用【杀】。');
        if (isShaCard(card) && self.usedSha && !canUseUnlimitedSha(self)) return fail('本回合已经使用过【杀】。');
        if (card.type === 'tao' && self.hp >= self.maxHp) return fail('体力已满，不能使用【桃】。');
        if ((card.type === 'guohe' || card.type === 'shunshou') && !hasAnyTargetableCard(game[opponent(actor)])) {
          return fail('对方没有可操作的牌。');
        }
        return success('可以使用。');
      }

      function playSha(game, actor, card) {
        var self = game[actor];
        var targetActor = opponent(actor);
        var target = game[targetActor];
        if (isKongchengProtected(game, targetActor, card.type)) return fail(actorName(game, targetActor) + '处于【空城】状态，不能成为【杀】目标。');
        if (!canReachWithSha(game, actor, targetActor)) return fail('距离不足，当前武器范围无法使用【杀】。');
        self.usedSha = true;
        self.usedOrRespondedSha = true;
        var amount = 1 + (self.shaBonus || 0);
        self.shaBonus = 0;
        var weapon = self.equipment && self.equipment.weapon;
        var armor = target.equipment && target.equipment.armor;
        var ignoreArmor = isArmorIgnoredBySha(game, actor, card);
        log(game, actorName(game, actor) + '对' + actorName(game, targetActor) + '使用【' + card.name + '】。');

        if (armor && !ignoreArmor && armor.type === 'renwang' && card.color === 'black') {
          log(game, actorName(game, targetActor) + '的【仁王盾】抵消了黑色【杀】。');
          discardCard(game, card);
          return success('仁王盾抵消。');
        }

        var dodged = false;
        var tieqiLocked = false;
        if (hasSkill(self, 'tieqi')) {
          var tieqiJudge = judge(game, targetActor, '【铁骑】');
          if (tieqiJudge && tieqiJudge.color === 'red') {
            tieqiLocked = true;
            log(game, actorName(game, actor) + '发动【铁骑】，红色判定令' + actorName(game, targetActor) + '不能打出【闪】。');
          } else {
            log(game, actorName(game, actor) + '发动【铁骑】，判定未命中。');
          }
        }
        if (!tieqiLocked && consumeResponse(game, targetActor, 'shan', '【杀】')) {
          dodged = true;
        } else if (!tieqiLocked && armor && !ignoreArmor && armor.type === 'bagua') {
          var baguaJudge = judge(game, targetActor, '【八卦阵】');
          if (baguaJudge && baguaJudge.color === 'red') {
            log(game, actorName(game, targetActor) + '的【八卦阵】判定为红色，视为打出【闪】。');
            dodged = true;
          }
        }

        if (dodged) {
          if (weapon && weapon.type === 'guanshi' && self.hand.length >= 2) {
            var costA = self.hand.shift();
            var costB = self.hand.shift();
            discardCard(game, costA);
            discardCard(game, costB);
            log(game, actorName(game, actor) + '发动【贯石斧】，弃置两张牌令【杀】强制命中。');
            if (damage(game, targetActor, amount, actor, '【' + card.name + '】', card)) applyWeaponHitEffects(game, actor, targetActor);
            return success('贯石斧强制命中。');
          }
          if (weapon && weapon.type === 'qinglong') {
            var follow = removeFirstCardOfType(self, 'sha');
            if (follow) {
              log(game, actorName(game, actor) + '发动【青龙偃月刀】，继续使用一张【杀】。');
              discardCard(game, card);
              return playSha(game, actor, follow);
            }
          }
          log(game, actorName(game, targetActor) + '闪避成功，没有受到伤害。');
          discardCard(game, card);
          return success('目标闪避。');
        }

        if (damage(game, targetActor, amount, actor, '【' + card.name + '】', card)) applyWeaponHitEffects(game, actor, targetActor);
        return success(target.name + '受到攻击。');
      }

      function playDuel(game, actor, card) {
        var current = opponent(actor);
        discardCard(game, card);
        log(game, actorName(game, actor) + '发起【决斗】。');
        while (game.phase !== 'gameover') {
          if (consumeResponse(game, current, 'sha', '【决斗】')) {
            current = opponent(current);
          } else {
            damage(game, current, 1, opponent(current), '【决斗】');
            break;
          }
        }
        return success('决斗结算完成。');
      }

      function playAOE(game, actor, card, responseType, title) {
        var targetActor = opponent(actor);
        discardCard(game, card);
        log(game, actorName(game, actor) + '使用【' + title + '】。');
        if (consumeResponse(game, targetActor, responseType, '【' + title + '】')) {
          log(game, actorName(game, targetActor) + '成功化解【' + title + '】。');
        } else {
          damage(game, targetActor, 1, actor, '【' + title + '】');
        }
        return success(title + '结算完成。');
      }

      function getHuogongChoice(game, actor) {
        var self = game && game[actor];
        var target = game && game[opponent(actor)];
        if (!self || !target || !target.hand || !target.hand.length) {
          return { ok: false, revealedCard: null, usableCostIds: [], unusableCostIds: [], usableCards: [], unusableCards: [], message: '目标没有手牌。' };
        }
        var revealed = target.hand[0];
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

      function playCard(game, actor, cardId, options) {
        var self = game[actor];
        options = options || {};
        if (!self) return fail('未知角色。');
        var card = self.hand.find(function (item) { return item.id === cardId; });
        var playable = canPlayCard(game, actor, card);
        if (!playable.ok) return playable;
        if (card && (card.type === 'guohe' || card.type === 'shunshou') && (options.targetZone || options.targetCardId)) {
          var requestedZone = options.targetZone || defaultTargetZone(game[opponent(actor)]);
          var targetChoices = getTargetZoneCards(game, opponent(actor), requestedZone);
          if (!targetChoices.length) return fail('目标区域没有可操作的牌。');
          if (options.targetCardId && !targetChoices.some(function (entry) { return entry.card.id === options.targetCardId; })) {
            return fail('指定的目标牌不存在。');
          }
        }
        if (card && card.type === 'huogong' && options.huogongCostCardId) {
          var huogongChoice = getHuogongChoice(game, actor);
          if (!huogongChoice.ok) return fail(huogongChoice.message);
          if (huogongChoice.usableCostIds.indexOf(options.huogongCostCardId) < 0) return fail('请选择与展示牌同花色的手牌。');
        }
        card = removeCardFromHand(self, cardId);

        if (isShaCard(card)) return playSha(game, actor, card);

        if (card.family === 'equipment') return equipCard(game, actor, card);

        if (card.family === 'delayed') {
          if (card.type === 'shandian') {
            self.judgeArea.push(card);
            log(game, actorName(game, actor) + '将【闪电】置入自己的判定区。');
          } else {
            var delayedTarget = game[opponent(actor)];
            delayedTarget.judgeArea.push(card);
            log(game, actorName(game, actor) + '将【' + card.name + '】置入' + actorName(game, opponent(actor)) + '的判定区。');
          }
          return success('延时锦囊生效。');
        }

        if (card.type === 'tao') {
          discardCard(game, card);
          self.hp = Math.min(self.maxHp, self.hp + 1);
          log(game, actorName(game, actor) + '使用【桃】，回复 1 点体力。');
          return success('回复体力。');
        }

        if (card.type === 'jiu') {
          discardCard(game, card);
          self.shaBonus = (self.shaBonus || 0) + 1;
          log(game, actorName(game, actor) + '饮下【酒】，下一张【杀】伤害 +1。');
          return success('下一张杀伤害提升。');
        }

        if (card.type === 'wuzhong') {
          discardCard(game, card);
          log(game, actorName(game, actor) + '使用【无中生有】。');
          drawCards(game, actor, 2);
          return finishTrickUse(game, actor, card, success('摸两张牌。'), options);
        }

        if (card.type === 'juedou') {
          if (consumeWuxie(game, opponent(actor), '【决斗】')) {
            discardCard(game, card);
            return finishTrickUse(game, actor, card, success('决斗被无懈可击。'), options);
          }
          return finishTrickUse(game, actor, card, playDuel(game, actor, card), options);
        }
        if (card.type === 'nanman') return finishTrickUse(game, actor, card, playAOE(game, actor, card, 'sha', '南蛮入侵'), options);
        if (card.type === 'wanjian') return finishTrickUse(game, actor, card, playAOE(game, actor, card, 'shan', '万箭齐发'), options);

        if (card.type === 'guohe') {
          var target = game[opponent(actor)];
          discardCard(game, card);
          if (consumeWuxie(game, opponent(actor), '【过河拆桥】')) return finishTrickUse(game, actor, card, success('过河拆桥被无懈可击。'), options);
          var droppedInfo = removeTargetZoneCard(game, opponent(actor), options.targetZone, options.targetCardId);
          if (droppedInfo && droppedInfo.card) {
            discardCard(game, droppedInfo.card);
            log(game, actorName(game, actor) + '使用【过河拆桥】，弃置了' + actorName(game, opponent(actor)) + droppedInfo.zone + '的【' + droppedInfo.card.name + '】。');
          }
          return finishTrickUse(game, actor, card, success('弃置对方一张牌。'), options);
        }

        if (card.type === 'shunshou') {
          discardCard(game, card);
          if (consumeWuxie(game, opponent(actor), '【顺手牵羊】')) return finishTrickUse(game, actor, card, success('顺手牵羊被无懈可击。'), options);
          var stolenInfo = removeTargetZoneCard(game, opponent(actor), options.targetZone, options.targetCardId);
          if (stolenInfo && stolenInfo.card) {
            self.hand.push(stolenInfo.card);
            log(game, actorName(game, actor) + '使用【顺手牵羊】，获得了' + actorName(game, opponent(actor)) + stolenInfo.zone + '的一张牌。');
          }
          return finishTrickUse(game, actor, card, success('获得对方一张牌。'), options);
        }

        if (card.type === 'taoyuan') {
          discardCard(game, card);
          ['player', 'enemy'].forEach(function (side) {
            game[side].hp = Math.min(game[side].maxHp, game[side].hp + 1);
          });
          log(game, actorName(game, actor) + '使用【桃园结义】，所有角色回复 1 点体力。');
          return finishTrickUse(game, actor, card, success('桃园结义结算完成。'), options);
        }

        if (card.type === 'wugu') {
          discardCard(game, card);
          [actor, opponent(actor)].forEach(function (side) {
            reshuffleIfNeeded(game);
            if (game.deck.length) {
              var gained = game.deck.pop();
              game[side].hand.push(gained);
              log(game, actorName(game, side) + '从【五谷丰登】获得【' + gained.name + '】。');
            }
          });
          return finishTrickUse(game, actor, card, success('五谷丰登结算完成。'), options);
        }

        if (card.type === 'huogong') {
          var fireTarget = game[opponent(actor)];
          discardCard(game, card);
          if (consumeWuxie(game, opponent(actor), '【火攻】')) return finishTrickUse(game, actor, card, success('火攻被无懈可击。'), options);
          if (!fireTarget.hand.length) return finishTrickUse(game, actor, card, success('目标没有手牌，火攻未造成伤害。'), options);
          var revealed = fireTarget.hand[0];
          log(game, actorName(game, opponent(actor)) + '展示【' + revealed.name + '】（' + revealed.suit + '）。');
          if (options.declineHuogong) {
            log(game, actorName(game, actor) + '选择不弃置同花色牌，【火攻】未造成伤害。');
            return finishTrickUse(game, actor, card, success('火攻未追加弃牌。'), options);
          }
          var cost = options.huogongCostCardId ? removeCardFromHand(self, options.huogongCostCardId) : removeFirstMatchingCard(self, function (item) { return item.suit === revealed.suit; });
          if (!cost) return finishTrickUse(game, actor, card, success('没有同花色牌可弃，火攻未造成伤害。'), options);
          if (cost.suit !== revealed.suit) {
            self.hand.push(cost);
            return fail('请选择与展示牌同花色的手牌。');
          }
          discardCard(game, cost);
          log(game, actorName(game, actor) + '弃置同花色【' + cost.name + '】发动【火攻】。');
          damage(game, opponent(actor), 1, actor, '【火攻】', null, 'fire');
          return finishTrickUse(game, actor, card, success('火攻结算完成。'), options);
        }

        if (card.type === 'tiesuo') {
          discardCard(game, card);
          if (options.mode === 'recast') {
            log(game, actorName(game, actor) + '重铸【铁索连环】，摸一张牌。');
            drawCards(game, actor, 1);
            return success('铁索连环重铸完成。');
          }
          var targets = Array.from(options.targets || [opponent(actor)]).filter(function (side, index, array) {
            return (side === 'player' || side === 'enemy') && array.indexOf(side) === index;
          }).slice(0, 2);
          if (!targets.length) return fail('请选择要横置或重置的角色。');
          targets.forEach(function (side) {
            game[side].chained = !game[side].chained;
            log(game, actorName(game, actor) + '使用【铁索连环】，' + actorName(game, side) + (game[side].chained ? '横置。' : '重置。'));
          });
          return finishTrickUse(game, actor, card, success('铁索连环结算完成。'), options);
        }

        if (card.type === 'jiedao') {
          var weaponOwner = game[opponent(actor)];
          discardCard(game, card);
          if (consumeWuxie(game, opponent(actor), '【借刀杀人】')) return finishTrickUse(game, actor, card, success('借刀杀人被无懈可击。'), options);
          if (!weaponOwner.equipment.weapon) return finishTrickUse(game, actor, card, success('目标没有武器，借刀杀人无效果。'), options);
          var borrowedSha = removeFirstCardOfType(weaponOwner, 'sha');
          if (borrowedSha) {
            log(game, actorName(game, opponent(actor)) + '被【借刀杀人】驱使使用【杀】。');
            return finishTrickUse(game, actor, card, playSha(game, opponent(actor), borrowedSha), options);
          }
          var borrowedWeapon = weaponOwner.equipment.weapon;
          weaponOwner.equipment.weapon = null;
          self.hand.push(borrowedWeapon);
          log(game, actorName(game, actor) + '因【借刀杀人】获得【' + borrowedWeapon.name + '】，置入手牌。');
          return finishTrickUse(game, actor, card, success('借刀杀人获得武器。'), options);
        }

        discardCard(game, card);
        return success('卡牌已使用。');
      }

      function recordPhase(game, actor, phase) {
        if (!game.turnHistory) game.turnHistory = [];
        game.turnHistory.push({ actor: actor, phase: phase });
      }

      function handLimit(game, actor) {
        var state = game[actor];
        return Math.max(0, state.hp || 0);
      }

      function getActorStatus(game, actor) {
        var state = game && game[actor];
        if (!state) return '未知';
        return state.chained ? '铁索横置' : '未横置';
      }

      function startTurn(game, actor) {
        if (game.phase === 'gameover') return fail('游戏已经结束。');
        if (!game[actor]) return fail('未知角色。');
        game.turn = actor;
        var state = game[actor];
        state.usedSha = false;
        state.usedOrRespondedSha = false;
        state.shaBonus = 0;
        state.flags = state.flags || {};
        state.flags.skipPlay = false;
        state.flags.skipDraw = false;
        state.flags.zhihengUsed = false;
        state.flags.fanjianUsed = false;
        state.flags.guanxingUsed = false;
        state.flags.rendeGiven = 0;
        state.flags.rendeHealed = false;
        state.flags.aiKurouUsed = false;

        game.phase = 'prepare';
        recordPhase(game, actor, 'prepare');
        log(game, actorName(game, actor) + '的准备阶段。');

        game.phase = 'judge';
        recordPhase(game, actor, 'judge');
        log(game, actorName(game, actor) + '的判定阶段。');
        processJudgeArea(game, actor);
        if (game.phase === 'gameover') return success('游戏结束。');

        game.phase = 'draw';
        recordPhase(game, actor, 'draw');
        log(game, actorName(game, actor) + '的摸牌阶段。');
        if (!state.flags.skipDraw) {
          performDrawPhase(game, actor);
        } else {
          log(game, actorName(game, actor) + '跳过摸牌阶段。');
        }

        if (state.flags.skipPlay) {
          game.phase = 'discard';
          recordPhase(game, actor, 'discard');
        } else {
          game.phase = 'play';
          recordPhase(game, actor, 'play');
        }
        log(game, actorName(game, actor) + '进入' + (game.phase === 'play' ? '出牌' : '弃牌') + '阶段。');
        return success('回合开始。');
      }

      function finishPlayPhase(game) {
        if (game.phase === 'gameover') return fail('游戏已经结束。');
        var actor = game.turn;
        var state = game[actor];
        if (state && hasSkill(state, 'keji') && !state.usedOrRespondedSha) {
          game.phase = 'finish';
          recordPhase(game, actor, 'finish');
          log(game, actorName(game, actor) + '发动【克己】，本回合未使用或打出【杀】，跳过弃牌阶段。');
          return success('克己跳过弃牌阶段。');
        }
        game.phase = 'discard';
        recordPhase(game, actor, 'discard');
        log(game, actorName(game, actor) + '结束出牌，进入弃牌阶段。');
        return success('进入弃牌阶段。');
      }

      function discardExcess(game, actor, cardIds) {
        var state = game[actor];
        if (!state) return fail('未知角色。');
        cardIds = cardIds || [];
        var excess = Math.max(0, state.hand.length - handLimit(game, actor));
        if (excess === 0) return success('无需弃牌。');
        if (cardIds.length < excess) return fail('需要弃置 ' + excess + ' 张牌。');
        var discarded = [];
        for (var i = 0; i < cardIds.length && discarded.length < excess; i += 1) {
          var card = removeCardFromHand(state, cardIds[i]);
          if (card) {
            discarded.push(card);
            discardCard(game, card);
          }
        }
        if (state.hand.length > handLimit(game, actor)) return fail('弃牌数量不足。');
        log(game, actorName(game, actor) + '弃置 ' + discarded.length + ' 张牌，满足手牌上限。');
        return success('弃牌完成。');
      }

      function getDiscardCount(game, actor) {
        var state = game[actor];
        if (!state) return 0;
        return Math.max(0, state.hand.length - handLimit(game, actor));
      }

      function needsDiscard(game, actor) {
        return getDiscardCount(game, actor) > 0;
      }

      function discardSelected(game, actor, cardIds) {
        var state = game[actor];
        if (!state) return fail('未知角色。');
        cardIds = Array.from(cardIds || []);
        var needed = getDiscardCount(game, actor);
        if (needed === 0) return success('无需弃牌。');
        if (cardIds.length < needed) return fail('需要弃置 ' + needed + ' 张牌。');

        var unique = [];
        cardIds.forEach(function (id) {
          if (unique.indexOf(id) < 0) unique.push(id);
        });
        var valid = unique.filter(function (id) {
          return state.hand.some(function (card) { return card.id === id; });
        });
        if (valid.length < needed) return fail('请选择 ' + needed + ' 张有效手牌弃置。');

        var discarded = [];
        for (var i = 0; i < valid.length && discarded.length < needed; i += 1) {
          var card = removeCardFromHand(state, valid[i]);
          if (card) {
            discarded.push(card);
            discardCard(game, card);
          }
        }
        log(game, actorName(game, actor) + '弃置 ' + discarded.length + ' 张牌，满足手牌上限。');
        return success('弃牌完成。');
      }

      function advancePhase(game) {
        if (game.phase === 'gameover') return fail('游戏已经结束。');
        var actor = game.turn;
        if (game.phase === 'prepare') {
          game.phase = 'judge';
          recordPhase(game, actor, 'judge');
          log(game, actorName(game, actor) + '的判定阶段。');
          processJudgeArea(game, actor);
          return success('进入判定阶段。');
        }
        if (game.phase === 'judge') {
          game.phase = 'draw';
          recordPhase(game, actor, 'draw');
          log(game, actorName(game, actor) + '的摸牌阶段。');
          if (!game[actor].flags.skipDraw) performDrawPhase(game, actor);
          return success('进入摸牌阶段。');
        }
        if (game.phase === 'draw') {
          game.phase = game[actor].flags.skipPlay ? 'discard' : 'play';
          recordPhase(game, actor, game.phase);
          log(game, actorName(game, actor) + '进入' + (game.phase === 'play' ? '出牌' : '弃牌') + '阶段。');
          return success('进入' + (game.phase === 'play' ? '出牌' : '弃牌') + '阶段。');
        }
        if (game.phase === 'play') return finishPlayPhase(game);
        if (game.phase === 'discard') {
          if (needsDiscard(game, actor)) return fail('需要先弃置 ' + getDiscardCount(game, actor) + ' 张牌。');
          game.phase = 'finish';
          recordPhase(game, actor, 'finish');
          log(game, actorName(game, actor) + '进入结束阶段。');
          return success('进入结束阶段。');
        }
        if (game.phase === 'finish') {
          return completeTurn(game, actor);
        }
        return fail('未知阶段。');
      }

      function resetEndOfTurnState(state) {
        if (!state) return;
        state.usedSha = false;
        state.usedOrRespondedSha = false;
        state.shaBonus = 0;
        state.flags = state.flags || {};
        state.flags.zhihengUsed = false;
        state.flags.fanjianUsed = false;
        state.flags.guanxingUsed = false;
        state.flags.rendeGiven = 0;
        state.flags.rendeHealed = false;
        state.flags.aiKurouUsed = false;
        state.flags.biyueTriggered = false;
      }

      function triggerBiyue(game, actor) {
        var state = game[actor];
        if (!state || !hasSkill(state, 'biyue') || game.phase === 'gameover') return;
        state.flags = state.flags || {};
        if (state.flags.biyueTriggered) return;
        state.flags.biyueTriggered = true;
        log(game, actorName(game, actor) + '发动【闭月】，结束阶段摸 1 张牌。');
        drawCards(game, actor, 1);
      }

      function completeTurn(game, ending) {
        triggerBiyue(game, ending);
        resetEndOfTurnState(game[ending]);
        log(game, actorName(game, ending) + '结束回合。');
        return startTurn(game, opponent(ending));
      }

      function endTurn(game) {
        if (game.phase === 'gameover') return fail('游戏已经结束。');
        var ending = game.turn;
        return completeTurn(game, ending);
      }

      function playZhangbaSha(game, actor, cardIds) {
        var self = game[actor];
        cardIds = cardIds || [];
        if (!self) return fail('未知角色。');
        if (!self.equipment || !self.equipment.weapon || self.equipment.weapon.type !== 'zhangba') return fail('未装备【丈八蛇矛】。');
        if (self.usedSha && !canUseUnlimitedSha(self)) return fail('本回合已经使用过【杀】。');
        if (cardIds.length !== 2) return fail('需要选择两张手牌。');
        var first = removeCardFromHand(self, cardIds[0]);
        var second = removeCardFromHand(self, cardIds[1]);
        if (!first || !second) {
          if (first) self.hand.push(first);
          if (second) self.hand.push(second);
          return fail('选择的手牌不存在。');
        }
        discardCard(game, first);
        discardCard(game, second);
        var virtualSha = makeTestCard('sha', {
          id: 'zhangba-' + first.id + '-' + second.id,
          suit: first.suit,
          rank: first.rank,
          color: first.color,
          name: '丈八蛇矛杀'
        });
        log(game, actorName(game, actor) + '发动【丈八蛇矛】，将两张手牌当【杀】使用。');
        return playSha(game, actor, virtualSha);
      }

      function virtualShaFromCard(original) {
        return makeTestCard('sha', {
          id: original.id,
          suit: original.suit,
          rank: original.rank,
          color: original.color,
          name: original.name + '（当杀）',
          physicalCard: original
        });
      }

      function canPlayCardAs(game, actor, cardOrId, asType) {
        var self = game[actor];
        if (!self) return fail('未知角色。');
        var original = typeof cardOrId === 'string' ? self.hand.find(function (item) { return item.id === cardOrId; }) : cardOrId;
        if (!original) return fail('找不到这张牌。');
        if (asType !== 'sha') return fail('当前只支持转化为【杀】。');
        var skillName = null;
        if (hasSkill(self, 'wusheng') && original.color === 'red') skillName = '武圣';
        if (hasSkill(self, 'longdan') && original.type === 'shan') skillName = '龙胆';
        if (!skillName) return fail('当前武将不能这样转化。');
        if (self.usedSha && !canUseUnlimitedSha(self)) return fail('本回合已经使用过【杀】。');
        var playable = canPlayCard(game, actor, virtualShaFromCard(original));
        if (!playable.ok) return playable;
        playable.skillName = skillName;
        playable.message = '发动【' + skillName + '】，将【' + original.name + '】当【杀】使用。';
        return playable;
      }

      function playCardAs(game, actor, cardId, asType) {
        var self = game[actor];
        if (!self) return fail('未知角色。');
        var original = self.hand.find(function (item) { return item.id === cardId; });
        var playable = canPlayCardAs(game, actor, original, asType);
        if (!playable.ok) return playable;
        removeCardFromHand(self, cardId);
        log(game, actorName(game, actor) + playable.message);
        return playSha(game, actor, virtualShaFromCard(original));
      }

      function getGuanxingPreview(game, actor) {
        var self = game[actor];
        if (!self) return fail('未知角色。');
        if (!hasSkill(self, 'guanxing')) return fail('没有【观星】。');
        var count = Math.min(5, game.deck.length);
        var preview = success('观星预览完成。');
        preview.cards = game.deck.slice(game.deck.length - count);
        return preview;
      }

      function useSkill(game, actor, skillId, cardIds, options) {
        var self = game[actor];
        cardIds = cardIds || [];
        options = options || {};
        if (!self) return fail('未知角色。');
        if (!hasSkill(self, skillId)) return fail('没有这个技能。');
        if (game.phase === 'gameover') return fail('游戏已经结束。');
        if (game.turn !== actor) return fail('还没有轮到你行动。');
        if ((skillId === 'zhiheng' || skillId === 'kurou' || skillId === 'rende' || skillId === 'fanjian') && game.phase !== 'play') return fail('主动技能只能在出牌阶段发动。');
        self.flags = self.flags || {};
        if (skillId === 'zhiheng') {
          if (self.flags.zhihengUsed) return fail('【制衡】每回合限一次。');
          if (!cardIds.length) return fail('请选择要弃置的牌。');
          var discarded = [];
          for (var i = 0; i < cardIds.length; i += 1) {
            var card = removeCardFromHand(self, cardIds[i]);
            if (card) {
              discarded.push(card);
              discardCard(game, card);
            }
          }
          if (!discarded.length) return fail('没有成功弃置任何牌。');
          self.flags.zhihengUsed = true;
          log(game, actorName(game, actor) + '发动【制衡】，弃置 ' + discarded.length + ' 张牌并摸等量牌。');
          drawCards(game, actor, discarded.length);
          return success('制衡完成。');
        }
        if (skillId === 'kurou') {
          if (self.hp <= 1) return fail('体力不足，不能发动【苦肉】。');
          self.hp -= 1;
          log(game, actorName(game, actor) + '发动【苦肉】，失去 1 点体力并摸两张牌。');
          drawCards(game, actor, 2);
          return success('苦肉完成。');
        }
        if (skillId === 'rende') {
          if (!cardIds.length) return fail('请选择要给出的牌。');
          var given = [];
          cardIds.forEach(function (id) {
            var giveCard = removeCardFromHand(self, id);
            if (giveCard) {
              given.push(giveCard);
              game[opponent(actor)].hand.push(giveCard);
            }
          });
          if (!given.length) return fail('没有成功给出任何牌。');
          self.flags.rendeGiven = (self.flags.rendeGiven || 0) + given.length;
          log(game, actorName(game, actor) + '发动【仁德】，交给' + actorName(game, opponent(actor)) + ' ' + given.length + ' 张牌。');
          if (self.flags.rendeGiven >= 2 && !self.flags.rendeHealed && self.hp < self.maxHp) {
            self.hp = Math.min(self.maxHp, self.hp + 1);
            self.flags.rendeHealed = true;
            log(game, actorName(game, actor) + '因【仁德】回复 1 点体力。');
          }
          return success('仁德完成。');
        }
        if (skillId === 'fanjian') {
          if (self.flags.fanjianUsed) return fail('【反间】每回合限一次。');
          if (!cardIds.length) return fail('请选择一张交给对方的牌。');
          var fanjianCard = removeCardFromHand(self, cardIds[0]);
          if (!fanjianCard) return fail('选择的牌不存在。');
          game[opponent(actor)].hand.push(fanjianCard);
          self.flags.fanjianUsed = true;
          var guessedSuit = options.guessedSuit || 'spade';
          log(game, actorName(game, actor) + '发动【反间】，' + actorName(game, opponent(actor)) + '获得一张牌并猜测' + guessedSuit + '。');
          if (guessedSuit !== fanjianCard.suit) damage(game, opponent(actor), 1, actor, '【反间】', null, 'normal');
          return success('反间完成。');
        }
        if (skillId === 'guanxing') {
          if (self.flags.guanxingUsed) return fail('【观星】每回合限一次。');
          var preview = getGuanxingPreview(game, actor);
          if (!preview.ok) return preview;
          var count = preview.cards.length;
          var visibleCards = preview.cards.slice();
          var top = preview.cards.slice();
          if (options.orderIds && options.orderIds.length) {
            var chosen = [];
            options.orderIds.forEach(function (id) {
              var index = top.findIndex(function (card) { return card.id === id; });
              if (index >= 0) chosen.push(top.splice(index, 1)[0]);
            });
            game.deck.splice(game.deck.length - count, count);
            game.deck = game.deck.concat(top).concat(chosen);
          }
          log(game, actorName(game, actor) + '发动【观星】，观看牌堆顶 ' + count + ' 张牌。');
          self.flags.guanxingUsed = true;
          var guanxingResult = success('观星完成。');
          guanxingResult.cards = visibleCards;
          return guanxingResult;
        }
        return fail('这个技能的主动效果尚未实现。');
      }

      function scoreCardForAI(game, actor, card) {
        var self = game[actor];
        var target = game[opponent(actor)];
        if (card.type === 'tao') return self.hp < self.maxHp ? 100 : -100;
        if (card.type === 'wuzhong') return 90;
        if (card.type === 'jiu') return (!self.usedSha && self.hand.some(function (c) { return isShaType(c.type); })) ? 82 : -10;
        if (isShaType(card.type)) return (self.usedSha && !canUseUnlimitedSha(self)) ? -100 : (target.hand.some(function (c) { return c.type === 'shan'; }) ? 45 : 78);
        if (card.type === 'juedou') return self.hand.filter(function (c) { return isShaType(c.type); }).length >= target.hand.filter(function (c) { return isShaType(c.type); }).length ? 70 : 15;
        if (card.type === 'nanman') return target.hand.some(function (c) { return isShaType(c.type); }) ? 35 : 72;
        if (card.type === 'wanjian') return target.hand.some(function (c) { return c.type === 'shan'; }) ? 35 : 72;
        if (card.type === 'guohe') return target.hand.length ? 62 : -100;
        if (card.type === 'shunshou') return target.hand.length ? 66 : -100;
        if (card.family === 'equipment') return 50;
        if (card.family === 'delayed') return 48;
        return 0;
      }

      function aiChooseCard(game, actor) {
        if (game.turn !== actor || game.phase === 'gameover') return null;
        var candidates = game[actor].hand
          .map(function (card) { return { card: card, score: scoreCardForAI(game, actor, card) }; })
          .filter(function (item) { return item.score > 0 && canPlayCard(game, actor, item.card).ok; })
          .sort(function (a, b) { return b.score - a.score; });
        return candidates.length ? candidates[0].card : null;
      }

      function aiChooseSkillAction(game, actor) {
        if (!game || game.turn !== actor || game.phase !== 'play') return null;
        var self = game[actor];
        if (!self) return null;
        self.flags = self.flags || {};

        if (hasSkill(self, 'kurou') && !self.flags.aiKurouUsed && self.hp > 1) {
          var hasPlayable = !!aiChooseCard(game, actor);
          if (!hasPlayable || self.hand.length <= 1) return { skillId: 'kurou', cardIds: [] };
        }

        if (hasSkill(self, 'zhiheng') && !self.flags.zhihengUsed && self.hand.length > 0 && game.deck.length > 0) {
          var candidates = self.hand
            .map(function (card) { return { card: card, score: scoreCardForAI(game, actor, card) }; })
            .filter(function (item) { return item.score <= 0 || !canPlayCard(game, actor, item.card).ok; })
            .sort(function (a, b) { return a.score - b.score; });
          if (!candidates.length && self.hand.length > handLimit(game, actor)) {
            candidates = self.hand.map(function (card) { return { card: card, score: scoreCardForAI(game, actor, card) }; })
              .sort(function (a, b) { return a.score - b.score; });
          }
          if (candidates.length) return { skillId: 'zhiheng', cardIds: [candidates[0].card.id] };
        }

        return null;
      }

      function aiTakeAction(game, actor) {
        if (!game || game.turn !== actor || game.phase !== 'play') {
          var blocked = success('当前不是出牌阶段。');
          blocked.action = 'none';
          return blocked;
        }

        var skillAction = aiChooseSkillAction(game, actor);
        if (skillAction) {
          var skillResult = useSkill(game, actor, skillAction.skillId, skillAction.cardIds);
          if (skillResult.ok && skillAction.skillId === 'kurou') game[actor].flags.aiKurouUsed = true;
          skillResult.action = skillAction.skillId;
          return skillResult;
        }

        var card = aiChooseCard(game, actor);
        if (!card) {
          var idle = success('没有可执行的行动。');
          idle.action = 'none';
          return idle;
        }
        var cardOptions;
        if (card.type === 'tiesuo') cardOptions = { mode: 'chain', targets: [opponent(actor)] };
        if (card.type === 'huogong') {
          var fireChoice = getHuogongChoice(game, actor);
          cardOptions = fireChoice.ok && fireChoice.usableCostIds.length ? { huogongCostCardId: fireChoice.usableCostIds[0] } : { declineHuogong: true };
        }
        var cardResult = playCard(game, actor, card.id, cardOptions);
        cardResult.action = 'card';
        cardResult.cardId = card.id;
        return cardResult;
      }

      function aiDiscardCandidates(game, actor) {
        var state = game[actor];
        var count = getDiscardCount(game, actor);
        if (!state || count <= 0) return [];
        return state.hand
          .map(function (card) { return { card: card, score: scoreCardForAI(game, actor, card) }; })
          .sort(function (a, b) { return a.score - b.score; })
          .slice(0, count)
          .map(function (item) { return item.card.id; });
      }

      function runAITurn(game, actor, maxActions) {
        if (!game || !game[actor]) return fail('未知角色。');
        maxActions = maxActions || 12;
        if (game.phase === 'gameover') return fail('游戏已经结束。');

        if (game.turn !== actor || ['prepare', 'judge', 'draw'].indexOf(game.phase) < 0) {
          var started = startTurn(game, actor);
          if (!started.ok || game.phase === 'gameover') return started;
        }

        if (game.phase === 'play') {
          for (var i = 0; i < maxActions; i += 1) {
            var action = aiTakeAction(game, actor);
            if (!action.ok) return action;
            if (action.action === 'none' || game.phase === 'gameover') break;
          }
          if (game.phase === 'play') finishPlayPhase(game);
        }

        if (game.phase === 'discard' && needsDiscard(game, actor)) {
          var discarded = discardSelected(game, actor, aiDiscardCandidates(game, actor));
          if (!discarded.ok) return discarded;
        }

        if (game.phase === 'discard') {
          var advanced = advancePhase(game);
          if (!advanced.ok) return advanced;
        }

        if (game.phase === 'finish') {
          var ended = endTurn(game);
          if (!ended.ok) return ended;
        }

        var done = success('AI 回合完成。');
        done.action = 'turn';
        return done;
      }

      window.SanguoshaEngine = {
        HEROES: HEROES,
        HERO_CATALOG: HERO_CATALOG,
        IMPLEMENTED_SKILL_IDS: IMPLEMENTED_SKILL_IDS.slice(),
        ACTIVE_SKILL_IDS: ACTIVE_SKILL_IDS.slice(),
        CARD_INFO: CARD_INFO,
        CARD_CATALOG: CARD_CATALOG,
        PHASES: PHASES,
        makeTestCard: makeTestCard,
        newGame: newGame,
        distanceBetween: distanceBetween,
        equipCard: equipCard,
        loseEquipment: loseEquipment,
        getTargetZoneCards: getTargetZoneCards,
        getHuogongChoice: getHuogongChoice,
        getGuanxingPreview: getGuanxingPreview,
        isShaCard: isShaCard,
        playZhangbaSha: playZhangbaSha,
        canPlayCard: canPlayCard,
        canPlayCardAs: canPlayCardAs,
        playCard: playCard,
        playCardAs: playCardAs,
        useSkill: useSkill,
        startTurn: startTurn,
        advancePhase: advancePhase,
        finishPlayPhase: finishPlayPhase,
        discardExcess: discardExcess,
        getDiscardCount: getDiscardCount,
        needsDiscard: needsDiscard,
        discardSelected: discardSelected,
        handLimit: handLimit,
        getActorStatus: getActorStatus,
        endTurn: endTurn,
        drawCards: drawCards,
        aiChooseCard: aiChooseCard,
        aiChooseSkillAction: aiChooseSkillAction,
        aiTakeAction: aiTakeAction,
        runAITurn: runAITurn,
        opponent: opponent
      };
    }());
