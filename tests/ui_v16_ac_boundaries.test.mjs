import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { makeStartGameViaUI } from './helpers/ui-game.mjs';
import { test, runTests } from './helpers/harness.mjs';
const dom = installFakeDom();
await import('../src/ui/dom-adapter.js');
const UI = window.SanguoshaUI, $ = dom.$;
const start = makeStartGameViaUI($, UI);

test('AC UI god faction setup has no active turn and does not label the enemy as acting', () => {
  $('lobby1v1Btn').click(); $('playerHeroSelect').value = 'god_guanyu';
  $('enemyHeroSelect').value = 'caocao'; $('startGameBtn').click();
  $('exitConfirmModal').hidden = true; UI.render();
  const game = UI.getGame();
  assert.equal(game.turn, null);
  assert.equal(game.pendingChoice.godChoiceType, 'faction');
  assert.equal($('playerTurnBadge').hidden, true);
  assert.equal($('enemyTurnBadge').hidden, true);
  assert.doesNotMatch($('enemyState').innerHTML, /行动/);
  $('godChoiceOptions').dispatchClick({ 'data-god-option-id': '蜀' });
  $('handConfirmBtn').click();
  assert.equal($('playerTurnBadge').hidden, game.turn !== 'player');
  assert.equal($('enemyTurnBadge').hidden, game.turn !== 'enemy');
});

test('AC UI ordinary turns and gameover display exactly the real active seat', () => {
  const game = start();
  for (const turn of ['player', 'enemy', null]) {
    game.turn = turn; UI.render();
    assert.equal($('playerTurnBadge').hidden, turn !== 'player');
    assert.equal($('enemyTurnBadge').hidden, turn !== 'enemy');
  }
  game.turn = 'enemy'; game.phase = 'gameover'; game.winner = 'player'; UI.render();
  assert.equal($('playerTurnBadge').hidden, true);
  assert.equal($('enemyTurnBadge').hidden, true);
});
await runTests();
