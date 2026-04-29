(function () {
  'use strict';

  var modules = window.SanguoshaEngineModules || (window.SanguoshaEngineModules = {});

  function baseOutcome(type) {
    return {
      type: type,
      discardTrick: true,
      moveToNext: false,
      skipPlay: false,
      skipDraw: false,
      damage: 0,
      hit: false,
      success: true
    };
  }

  function isLeBusishuSuccess(card) {
    return !!(card && card.suit === 'heart');
  }

  function isBingliangSuccess(card) {
    return !!(card && card.suit === 'club');
  }

  function isShandianHit(card) {
    if (!card || card.suit !== 'spade') return false;
    return ['2', '3', '4', '5', '6', '7', '8', '9'].indexOf(String(card.rank)) >= 0;
  }

  function evaluateDelayedTrick(trick, judgementCard) {
    var type = trick && trick.type;
    var outcome = baseOutcome(type || 'unknown');

    if (type === 'lebusishu') {
      outcome.success = isLeBusishuSuccess(judgementCard);
      outcome.skipPlay = !outcome.success;
      return outcome;
    }

    if (type === 'bingliang') {
      outcome.success = isBingliangSuccess(judgementCard);
      outcome.skipDraw = !outcome.success;
      return outcome;
    }

    if (type === 'shandian') {
      outcome.hit = isShandianHit(judgementCard);
      outcome.success = !outcome.hit;
      if (outcome.hit) {
        outcome.damage = 3;
      } else {
        outcome.discardTrick = false;
        outcome.moveToNext = true;
      }
      return outcome;
    }

    return outcome;
  }

  modules.JudgementRuntime = {
    isLeBusishuSuccess: isLeBusishuSuccess,
    isBingliangSuccess: isBingliangSuccess,
    isShandianHit: isShandianHit,
    evaluateDelayedTrick: evaluateDelayedTrick
  };
}());
