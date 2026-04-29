(function () {
  'use strict';

  var data = window.SanguoshaData || (window.SanguoshaData = {});

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

      data.CARD_CATALOG = CARD_CATALOG;
      data.CARD_INFO = CARD_INFO;
      data.PHASES = PHASES;
}());
