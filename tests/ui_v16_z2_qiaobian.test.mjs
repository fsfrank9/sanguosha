import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { makeStartGameViaUI } from './helpers/ui-game.mjs';
import { test, runTests } from './helpers/harness.mjs';
const dom = installFakeDom();
const { Engine, c } = await import('./helpers/load-engine.mjs');
await import('../src/ui/dom-adapter.js');
const UI = globalThis.window.SanguoshaUI, $ = dom.$;
const start = makeStartGameViaUI($, UI);
function open(g) { g.phase = 'draw'; Engine.advancePhase(g); UI.render(); }
function gameWith() {
  const g = start('zhanghe', 'caocao');
  g.player.hand = [c('sha', { id: 'cost' }), c('shan', { id: 'other-cost' })];
  g.enemy.equipment.weapon = c('qinggang', { id: 'weapon' });
  g.enemy.judgeArea = [c('lebusishu', { id: 'judge', suit: 'diamond' })];
  open(g); return g;
}
function select(key, value) {
  const ids = { cost: 'qiaobianCostCards', source: 'qiaobianSources', zone: 'qiaobianZones',
    card: 'qiaobianCards', target: 'qiaobianTargets' };
  $(ids[key]).dispatchClick({ ['data-qiaobian-' + key]: value });
}
function stagedEquipment() {
  select('cost', 'cost'); select('source', 'enemy'); select('zone', 'equipment');
  select('card', 'weapon'); select('target', 'player');
}

test('Z2 UI four-stage movement only enables confirm once cost and destination are selected', () => {
  const g = gameWith(); assert.equal($('qiaobianPanel').hidden, false);
  assert.equal($('qiaobianConfirmBtn').disabled, true);
  select('cost', 'cost'); assert.equal($('qiaobianSkipOnlyBtn').disabled, false);
  select('source', 'enemy'); assert.match($('qiaobianZones').innerHTML, /装备区/); assert.match($('qiaobianZones').innerHTML, /判定区/);
  select('zone', 'equipment'); assert.match($('qiaobianCards').innerHTML, /weapon/); assert.doesNotMatch($('qiaobianCards').innerHTML, /data-qiaobian-card="judge"/);
  select('card', 'weapon'); assert.match($('qiaobianTargets').innerHTML, /装备区/);
  assert.equal($('qiaobianConfirmBtn').disabled, true); select('target', 'player');
  assert.equal($('qiaobianConfirmBtn').disabled, false); $('qiaobianConfirmBtn').click();
  assert.equal(g.player.equipment.weapon.id, 'weapon'); assert.equal(g.phase, 'discard');
  assert.equal($('qiaobianPanel').hidden, true);
});

test('Z2 UI changing an upstream stage clears card and destination selection', () => {
  const g = gameWith(); stagedEquipment(); assert.equal($('qiaobianConfirmBtn').disabled, false);
  select('zone', 'judgeArea'); assert.equal($('qiaobianConfirmBtn').disabled, true);
  assert.doesNotMatch($('qiaobianTargets').innerHTML, /data-qiaobian-target/);
  select('card', 'judge'); select('target', 'player'); $('qiaobianConfirmBtn').click();
  assert.equal(g.player.judgeArea[0].id, 'judge'); assert.equal(g.enemy.equipment.weapon.id, 'weapon');
});

test('Z2 UI back-to-back same-kind window binds object identity and resets every staged value', () => {
  const g = gameWith(); stagedEquipment(); const oldWindow = g.pendingChoice;
  Engine.resolvePendingChoice(g, {}); // no render between close and new window
  open(g); assert.notEqual(g.pendingChoice, oldWindow);
  assert.equal($('qiaobianConfirmBtn').disabled, true); assert.equal($('qiaobianSkipOnlyBtn').disabled, true);
  assert.doesNotMatch($('qiaobianZones').innerHTML, /data-qiaobian-zone/);
  assert.doesNotMatch($('qiaobianCards').innerHTML, /data-qiaobian-card/);
  assert.doesNotMatch($('qiaobianTargets').innerHTML, /data-qiaobian-target/);
  $('qiaobianDeclineBtn').click(); assert.equal(g.phase, 'play'); assert.equal(g.player.hand.length, 2);
});

test('Z2 UI stale click before rendering replacement window cannot submit or stage', () => {
  const g = gameWith(); stagedEquipment(); const old = g.pendingChoice;
  Engine.resolvePendingChoice(g, {}); g.phase = 'draw'; Engine.advancePhase(g);
  assert.notEqual(g.pendingChoice, old); $('qiaobianConfirmBtn').click();
  assert.equal(g.phase, 'draw'); assert.equal(g.player.hand.length, 2); assert.equal(g.player.equipment.weapon, null);
  UI.render(); assert.equal($('qiaobianConfirmBtn').disabled, true);
});

test('Z2 UI permits paid skip without any movement; decline pays nothing', () => {
  const g = gameWith(); select('cost', 'other-cost'); $('qiaobianSkipOnlyBtn').click();
  assert.equal(g.phase, 'discard'); assert.equal(g.enemy.equipment.weapon.id, 'weapon');
  assert.ok(g.discard.some(card => card.id === 'other-cost'));
  open(g); $('qiaobianDeclineBtn').click(); assert.equal(g.player.hand.length, 1);
});

test('Z2 UI static guard: anchors, common confirm/cancel dispatch and identity protection', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const adapter = fs.readFileSync(new URL('../src/ui/dom-adapter.js', import.meta.url), 'utf8');
  const panel = fs.readFileSync(new URL('../src/ui/panels/prompt-panels.js', import.meta.url), 'utf8');
  assert.match(html, /id="qiaobianPanel" hidden/);
  assert.match(adapter, /panelId: 'qiaobianPanel'.*confirmBtnId: 'qiaobianConfirmBtn'.*cancelBtnId: 'qiaobianDeclineBtn'/);
  assert.match(panel, /qiaobianWindow !== pending/); assert.match(panel, /pending !== qiaobianWindow/);
  assert.match(panel, /choice.choiceId = pending.choiceId/);
});

runTests();
