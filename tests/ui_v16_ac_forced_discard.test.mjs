import assert from 'node:assert/strict';
import { FakeElement } from './helpers/fake-dom.mjs';
import { Engine, c, StateRuntime as S } from './helpers/load-engine.mjs';
import { createGodChoicePanels } from '../src/ui/panels/god-choice-panels.js';
import { test, runTests } from './helpers/harness.mjs';

test('C26 real Yinghun discard panel lets the player keep a hand card and choose an equipment card', () => {
  const g = Engine.newGame({ seed: 169261, playerHero: 'zhangfei', enemyHero: 'sunjian' });
  g.player.skills = []; g.enemy.skills = []; S.grantSkill(g.enemy, 'yinghun');
  Object.assign(g, { pendingChoice: null, pendingChoiceQueue: [], pauseState: {}, phase: 'play' });
  g.enemy.hp = 2; g.player.hp = 2;
  g.player.hand = [c('tao', { id: 'hand-pay' })];
  g.player.equipment = { armor: c('baiyin', { id: 'armor-pay' }) };
  Engine.startTurn(g, 'enemy');
  assert.equal(g.pendingChoice?.godChoiceType, 'effect-discard');
  const controls = ['godChoicePanel', 'godChoiceHint', 'godChoiceOptions', 'godChoiceCards', 'godChoiceStars',
    'godChoiceTargets', 'godChoiceConfirmBtn', 'godChoiceDeclineBtn'];
  const els = Object.fromEntries(controls.map(id => [id, new FakeElement(id)]));
  let panel;
  const render = () => panel.render(g.pendingChoice?.kind, g.pendingChoice);
  panel = createGodChoicePanels({ els, Engine, getGame: () => g, render, escapeHtml: String, suitLabel: String });
  panel.bind(); render();
  assert.equal(els.godChoicePanel.hidden, false);
  assert.equal(els.godChoiceConfirmBtn.disabled, true);
  assert.equal(els.godChoiceDeclineBtn.hidden, true);
  assert.match(els.godChoiceCards.innerHTML, /装备/);
  els.godChoiceCards.dispatchClick({ 'data-god-card-id': 'armor-pay' });
  assert.equal(els.godChoiceConfirmBtn.disabled, true, 'two cards are required');
  els.godChoiceCards.dispatchClick({ 'data-god-card-id': 'hand-pay' });
  assert.equal(els.godChoiceConfirmBtn.disabled, false);
  els.godChoiceConfirmBtn.click();
  assert.equal(g.pendingChoice, null);
  assert.equal(els.godChoicePanel.hidden, true);
  assert.equal(g.player.hp, 3);
  assert.equal(g.player.hand.length, 1);
  assert.equal(g.player.equipment.armor, null);
  assert.equal(g.phase, 'play');
});

await runTests();
