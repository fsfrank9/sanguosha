(function () {
  'use strict';

  var modules = window.SanguoshaEngineModules || (window.SanguoshaEngineModules = {});

  function requireData(requiredKeys) {
    var data = window.SanguoshaData || {};
    var missing = requiredKeys.filter(function (key) { return !data[key]; });
    if (missing.length) {
      throw new Error('Sanguosha data modules must be loaded before the game engine: ' + missing.join(', '));
    }
    return data;
  }

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

  modules.Runtime = {
    requireData: requireData,
    clone: clone,
    makeRng: makeRng,
    makePlayer: makePlayer,
    colorOfSuit: colorOfSuit,
    suitForIndex: suitForIndex,
    rankForIndex: rankForIndex
  };
}());
