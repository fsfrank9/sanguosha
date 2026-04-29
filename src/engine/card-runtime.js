(function () {
  'use strict';

  var modules = window.SanguoshaEngineModules || (window.SanguoshaEngineModules = {});
  var Runtime = modules.Runtime;
  var data = window.SanguoshaData || {};
  var CARD_CATALOG = data.CARD_CATALOG;

  if (!Runtime || !CARD_CATALOG) {
    throw new Error('Sanguosha card runtime requires Runtime and card data modules to be loaded first.');
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

  modules.CardRuntime = {
    makeTestCard: makeTestCard,
    makeCard: makeCard,
    shuffle: shuffle,
    buildDeck: buildDeck,
    isShaType: isShaType,
    isShaCard: isShaCard,
    isNormalTrickCard: isNormalTrickCard,
    physicalCardOf: physicalCardOf
  };
}());
