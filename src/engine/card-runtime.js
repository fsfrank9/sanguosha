  import { Runtime } from './runtime.js';
  import { CARD_CATALOG } from '../data/cards.js';

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
      color: overrides.color || Runtime.colorOfSuit(suit)
    };
    Object.keys(overrides).forEach(function (key) { card[key] = overrides[key]; });
    if (!card.color && card.suit) card.color = Runtime.colorOfSuit(card.suit);
    return card;
  }

  function makeCard(game, type) {
    var nextIndex = game.nextId + 1;
    var suit = Runtime.suitForIndex(nextIndex);
    var rank = Runtime.rankForIndex(nextIndex);
    game.nextId += 1;
    return makeTestCard(type, {
      id: type + '-' + game.nextId,
      suit: suit,
      rank: rank,
      color: Runtime.colorOfSuit(suit)
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
      // v13 N2: 寒冰/古锭/朱雀/银月 v8 起规则齐全 (PR-B1~B4) 却漏出配方,
      // 实战不可达 — 军争盘点销账, 各 ×1 沿用唯一武器约定 (官方缓存无
      // 牌数表, 数量为项目约定非官方主张; 银月为 SP 目, 随catalog 保持
      // 目录⇄牌堆一致)。
      ['hanbing', 1], ['guding', 1], ['zhuque', 1], ['yinyue', 1],
      ['bagua', 2], ['renwang', 1], ['tengjia', 1], ['baiyin', 1], ['minus_horse', 4], ['plus_horse', 4]
    ];
    var deck = [];
    recipe.forEach(function (pair) {
      for (var i = 0; i < pair[1]; i += 1) {
        var card = makeCard(game, pair[0]);
        // v13 三批-5: 坐骑逐份轮配官方实名 (赤兔/的卢等) — 引擎按 type
        // 结算, 名字纯展示; 份数超变体表时循环复用。
        var variants = CARD_CATALOG[pair[0]] && CARD_CATALOG[pair[0]].nameVariants;
        if (variants && variants.length) card.name = variants[i % variants.length];
        deck.push(card);
      }
    });
    return shuffle(deck, random);
  }

  function isShaType(type) {
    return type === 'sha' || type === 'fire_sha' || type === 'thunder_sha';
  }

  function isShaCard(card) {
    if (!card) return false;
    return isShaType(typeof card === 'string' ? card : card.type);
  }

  function isNormalTrickCard(card) {
    return !!card && card.family === 'trick';
  }

  function physicalCardOf(card) {
    return card && card.physicalCard ? card.physicalCard : card;
  }

  // ======================================================================
  // v11 A2: 牌移动原语。"牌离开/进入某区域"收敛到单一受控出口, 任何新的
  // 获得/弃置/转移路径都必须走这里 (架构守护测试禁止引擎新增裸 push/splice),
  // 由 A1 的全局守恒断言护航。
  //
  // 区域描述符:
  //   { zone: 'deck', position?: 'top'|'bottom' }   数组尾部是牌堆顶
  //   { zone: 'discard' }
  //   { zone: 'hand', actor: 'player'|'enemy', index?: number }
  //   { zone: 'equipment', actor, slot: 'weapon'|'armor'|'horseMinus'|'horsePlus' }
  //   { zone: 'judgeArea', actor, position?: 'top'|'bottom' }
  //
  // "结算中"的牌 (响应窗口/五谷池/判定牌等在途状态) 不是区域: takeCard 之后、
  // putCard 之前, 牌由调用方 (pendingChoice/pauseState) 临时持有。
  // ======================================================================

  var EQUIP_SLOTS = ['weapon', 'armor', 'horseMinus', 'horsePlus'];

  // ======================================================================
  // v11 C2 (批次 26): 统一手牌失去事件 — 在原语层结算。
  //
  // takeCard 把牌移出手牌时, 在牌上打一个不可枚举的 _handOrigin 标记 (指向
  // 原持有者 state; 不可枚举 → JSON 深克隆 / census 深扫都看不到, 不会造成
  // 循环引用或双重计数)。putCard 落位时结算:
  //   - 回到同一 state 的手牌 = 在途还原 (火攻同花色不符退回 / 濒死救援
  //     校验失败退回等路径), 不算失去;
  //   - 落到其他任何区域 (弃牌堆/对方手牌/装备/判定区/牌堆) = 失去已提交,
  //     通知引擎注册的 handLossHandler (连营等技能在那里消费)。
  // 窄签名助手 (removeCardFromHand / removeFirstMatchingCard) 不经 takeCard,
  // 由 game-engine 在 splice 前调 markHandOrigin 补标记, 保证出口全覆盖。
  // ======================================================================

  var handLossHandler = null;

  function setHandLossHandler(fn) {
    handLossHandler = fn;
  }

  function markHandOrigin(state, card) {
    if (!state || !card || typeof card !== 'object') return card;
    Object.defineProperty(card, '_handOrigin', {
      value: state,
      writable: true,
      configurable: true,
      enumerable: false
    });
    return card;
  }

  function clearHandOrigin(card) {
    if (card && card._handOrigin) delete card._handOrigin;
  }

  function settleHandLoss(game, origin, to) {
    if (!origin || !handLossHandler) return;
    if (to.zone === 'hand' && game[to.actor] === origin) return; // 在途还原
    handLossHandler(game, origin);
  }

  function zoneArrayOf(game, ref) {
    if (!ref) return null;
    if (ref.zone === 'deck') return game.deck;
    if (ref.zone === 'discard') return game.discard;
    var state = game[ref.actor];
    if (!state) return null;
    if (ref.zone === 'hand') return state.hand;
    if (ref.zone === 'judgeArea') return state.judgeArea;
    // v12 G2: 不屈 — 武将牌上的"创" (state.chuang)
    if (ref.zone === 'chuang') return game[ref.actor] && game[ref.actor].chuang;
    return null;
  }

  function cardIdOf(card) {
    return card && typeof card === 'object' ? card.id : card;
  }

  // 定位一张牌当前所在的区域描述符; 在途 (不在任何区域) 返回 null。
  // v12 H 复核修复: 座席遍历泛化 (此前硬编码 player/enemy 两席, 对第三席的
  // 手牌/判定区/装备返回 null → moveCard(from=null) 用于第三席时静默失败;
  // 当前调用方均显式传 from 故不可达, 此为防御性加固)。
  function findCardZone(game, cardOrId) {
    var id = cardIdOf(cardOrId);
    var seats = (game && game.seats && game.seats.length) ? game.seats : ['player', 'enemy'];
    var refs = [{ zone: 'deck' }, { zone: 'discard' }];
    for (var a = 0; a < seats.length; a += 1) {
      refs.push({ zone: 'hand', actor: seats[a] });
      refs.push({ zone: 'judgeArea', actor: seats[a] });
    }
    for (var i = 0; i < refs.length; i += 1) {
      var list = zoneArrayOf(game, refs[i]);
      if (!list) continue;
      for (var j = 0; j < list.length; j += 1) {
        if (list[j].id === id) return refs[i];
      }
    }
    for (var b = 0; b < seats.length; b += 1) {
      var owner = seats[b];
      var equipment = game[owner] && game[owner].equipment;
      if (!equipment) continue;
      for (var s = 0; s < EQUIP_SLOTS.length; s += 1) {
        var slot = EQUIP_SLOTS[s];
        if (equipment[slot] && equipment[slot].id === id) {
          return { zone: 'equipment', actor: owner, slot: slot };
        }
      }
    }
    return null;
  }

  // 把牌从 from 区域移出并返回实体牌; 不在该区域返回 null。
  // card 传 null 且 from 为 deck 时取牌堆顶 (等价旧 deck.pop())。
  // 纯移动: 装备失去时机等副作用仍由调用方触发。
  function takeCard(game, cardOrId, from) {
    if (!from) return null;
    if (from.zone === 'equipment') {
      var state = game[from.actor];
      var held = state && state.equipment ? state.equipment[from.slot] : null;
      if (!held) return null;
      if (cardOrId !== null && held.id !== cardIdOf(cardOrId)) return null;
      state.equipment[from.slot] = null;
      return held;
    }
    var list = zoneArrayOf(game, from);
    if (!list || list.length === 0) return null;
    if (cardOrId === null) {
      if (from.zone !== 'deck') return null;
      return from.position === 'bottom' ? list.shift() : list.pop();
    }
    var id = cardIdOf(cardOrId);
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].id === id) {
        var taken = list.splice(i, 1)[0];
        // v11 C2: 手牌出口打在途标记, putCard 落位时结算失去事件。
        if (from.zone === 'hand') markHandOrigin(game[from.actor], taken);
        return taken;
      }
    }
    return null;
  }

  // 把实体牌放入 to 区域并返回它。虚拟牌禁止入区 (组成它的实体牌才可移动)。
  function putCard(game, card, to) {
    if (!card || !to) return null;
    if (card.virtual) throw new Error('putCard: 虚拟牌不能进入区域 (' + card.id + ')');
    var origin = card._handOrigin || null;
    if (to.zone === 'equipment') {
      game[to.actor].equipment[to.slot] = card;
      clearHandOrigin(card);
      settleHandLoss(game, origin, to);
      return card;
    }
    var list = zoneArrayOf(game, to);
    if (!list) return null;
    if (to.zone === 'hand' && typeof to.index === 'number') {
      list.splice(to.index, 0, card);
    } else if ((to.zone === 'deck' || to.zone === 'judgeArea') && to.position === 'bottom') {
      list.unshift(card);
    } else {
      list.push(card);
    }
    clearHandOrigin(card);
    settleHandLoss(game, origin, to);
    return card;
  }

  // moveCard(game, card, from, to): 单一受控的区域间移动。
  // from 传 null 时自动定位 (牌必须在某个区域, 在途牌应直接 putCard)。
  function moveCard(game, cardOrId, from, to) {
    var origin = from || findCardZone(game, cardOrId);
    var card = takeCard(game, cardOrId, origin);
    if (!card) return null;
    return putCard(game, card, to);
  }

  export const CardRuntime = {
    makeTestCard: makeTestCard,
    makeCard: makeCard,
    shuffle: shuffle,
    buildDeck: buildDeck,
    isShaType: isShaType,
    isShaCard: isShaCard,
    isNormalTrickCard: isNormalTrickCard,
    physicalCardOf: physicalCardOf,
    findCardZone: findCardZone,
    takeCard: takeCard,
    putCard: putCard,
    moveCard: moveCard,
    markHandOrigin: markHandOrigin,
    setHandLossHandler: setHandLossHandler
  };
