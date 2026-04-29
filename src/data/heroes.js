(function () {
  'use strict';

  var data = window.SanguoshaData || (window.SanguoshaData = {});

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

      var HEROES = {
        player: HERO_CATALOG.liubei,
        enemy: HERO_CATALOG.caocao
      };

      data.HERO_CATALOG = HERO_CATALOG;
      data.HEROES = HEROES;
}());
