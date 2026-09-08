import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Engine } from './helpers/load-engine.mjs';
import { CATALOG, GOD_CATALOG, controlledGame, card, settle, runControlled, runGapControls, runMixed } from './helpers/v16-ac-ai-evaluation.mjs';
import { test, runTests } from './helpers/harness.mjs';

test('AC3 scope recalc is 46 native T/U/V + derived Jixi, 3 distinct Z, and 21 separate AB IDs', () => {
  assert.equal(CATALOG.filter(s => s.pack !== 'sp').length, 47);
  assert.equal(CATALOG.filter(s => s.pack !== 'sp' && s.id !== 'jixi').length, 46);
  assert.equal(CATALOG.filter(s => s.pack === 'sp').length, 3);
  assert.equal(new Set(CATALOG.map(s => s.id)).size, 50);
  assert.equal(GOD_CATALOG.length, 21);
  assert.ok(!CATALOG.some(s => s.id === 'huashen' || s.id === 'xinsheng'));
});

test('AC3 each implemented T/U/V and Z skill gets an actual controlled native-default opportunity and effect record', () => {
  const rows = runControlled();
  assert.equal(rows.length, 50);
  for (const row of rows) {
    assert.ok(row.opportunity.length > 5, row.id);
    assert.ok(row.opportunities >= 1 && row.uses > 0 && row.uses <= row.opportunities, row.id);
    assert.ok(Object.values(row.delta).every(d => Object.values(d).every(Number.isFinite)), row.id);
    assert.ok(Array.isArray(row.logs), row.id);
  }
  assert.equal(rows.find(r => r.id === 'lianhuan').uses, 1, 'decline purposeless chaining; use for chained ally');
  assert.equal(rows.find(r => r.id === 'jiuchi').uses, 1, 'ordinary attack remains an option; use wine at the kill line');
});

test('AC3 all seven before/control gap interventions are legal and observable in the real engine', () => {
  const controls = runGapControls();
  assert.equal(controls.length, 7);
  assert.ok(controls.every(row => row.uses === 1));
});

test('AC3 Jixi uses its field material and the selected legal hostile target when the primary foe is empty', () => {
  const g = controlledGame('dengai');
  g.enemy.skills.push({ id: 'jixi', name: '急袭', granted: true });
  const field = card('shan'), prize = card('shan');
  g.enemy.tian = [field]; g.ally.hand = [prize];
  assert.equal(Engine.aiTakeAction(g, 'enemy').ok, true); settle(g);
  assert.equal(g.enemy.tian.length, 0);
  assert.ok(g.enemy.hand.some(c => c.id === prize.id));
  assert.ok(g.discard.some(c => c.id === field.id));
});

test('AC3 conversion heuristic leaves a skill with no legal target unused', () => {
  const g = controlledGame('dengai');
  g.enemy.skills.push({ id: 'jixi', name: '急袭', granted: true });
  g.enemy.tian = [card('shan')];
  assert.equal(Engine.aiTakeAction(g, 'enemy').action, 'none');
  assert.equal(g.enemy.tian.length, 1);
});

test('AC3 Jixi does not spend its last field when losing that distance reduction invalidates the target', () => {
  const g = controlledGame('dengai');
  g.enemy.skills.push({ id: 'jixi', name: '急袭', granted: true });
  const field = card('shan'); g.enemy.tian = [field];
  g.ally.hand = [card('shan')]; g.ally.equipment.horsePlus = card('plus_horse');
  assert.equal(Engine.distanceBetween(g, 'enemy', 'ally'), 1);
  assert.equal(Engine.aiTakeAction(g, 'enemy').action, 'none');
  assert.equal(g.enemy.tian[0].id, field.id);
  assert.equal(g.ally.hand.length, 1);
});

test('AC3 Tianyi preserves its sole attack instead of paying it for unusable temporary attack benefits', () => {
  const g = controlledGame('taishici'); g.enemy.hand = [card('sha', 'spade', 'K')];
  g.ally.hand = [card('shan', 'club', '2')];
  const hp = g.player.hp;
  assert.equal(Engine.aiTakeAction(g, 'enemy').ok, true); settle(g);
  assert.ok(!g.enemy.flags.tianyiUsed);
  assert.equal(g.player.hp, hp - 1, 'the retained attack is actually used');
});

test('AC3 Tianyi still initiates when the actual high-rank payment leaves a Sha', () => {
  const g = controlledGame('taishici');
  g.enemy.hand = [card('sha', 'spade', '3'), card('shan', 'club', 'K')];
  g.ally.hand = [card('shan', 'heart', '2')];
  assert.equal(Engine.aiTakeAction(g, 'enemy').action, 'tianyi'); settle(g);
  assert.ok(g.enemy.flags.tianyiWon);
  assert.equal(g.enemy.hand[0].type, 'sha');
});

test('AC3 Quhu avoids guaranteed friendly fire when the winning target can only reach our side', () => {
  const g = controlledGame('xunyu'); g.enemy.hp = 2;
  g.enemy.hand = [card('shan', 'spade', 'K')]; g.ally.hand = [card('shan', 'heart', '2')];
  const friendlyHp = g.ally2.hp;
  assert.equal(Engine.aiTakeAction(g, 'enemy').action, 'none');
  assert.ok(!g.enemy.flags.quhuUsed);
  assert.equal(g.ally2.hp, friendlyHp);
  assert.equal(g.enemy.hand.length, 1);
});

test('AC3 Quhu still initiates when the winning target can reach a perceived hostile victim', () => {
  const g = controlledGame('xunyu'); g.enemy.hp = 2;
  g.enemy.hand = [card('shan', 'spade', 'K')]; g.ally.hand = [card('shan', 'heart', '2')];
  g.ally.equipment.weapon = card('zhangba');
  const hostileHp = g.player.hp, friendlyHp = g.ally2.hp;
  assert.equal(Engine.aiTakeAction(g, 'enemy').action, 'quhu'); settle(g);
  assert.equal(g.player.hp, hostileHp - 1);
  assert.equal(g.ally2.hp, friendlyHp);
});

for (const [label, mutate] of [
  ['only one enemy has a card', g => { g.player.hand = []; }],
  ['first payment is a peach', g => { g.enemy.hand.unshift(card('tao', 'heart')); }],
  ['explicit decline', g => { g.enemy.skillPreferences.qiaobian = 'decline'; }]
]) test('AC3 Qiaobian conservative native default: ' + label, () => {
  const g = controlledGame('zhanghe'); g.enemy.hand = [card('shan')];
  g.player.hand = [card('shan')]; g.ally.hand = [card('shan')]; mutate(g);
  const before = g.enemy.hand.length; g.phase = 'judge'; Engine.advancePhase(g); settle(g);
  assert.equal(g.enemy.hand.length, before + 2);
  assert.ok(!g.log.some(line => line.includes('发动【巧变】')));
});

for (const [label, mutate] of [
  ['no friendly seat', g => { g.roles.ally2 = '忠臣'; }],
  ['recipient turned over', g => { g.ally2.turnedOver = true; }],
  ['discard would change the later payment', g => { g.enemy.hand.push(...Array.from({ length: 5 }, () => card('shan'))); }],
  ['own useful attack', g => { g.enemy.hand.unshift(card('sha')); }],
  ['retain peach', g => { g.enemy.hand.unshift(card('tao', 'heart')); }],
  ['explicit decline', g => { g.enemy.skillPreferences.fangquan = 'decline'; }]
]) test('AC3 Fangquan conservative native default: ' + label, () => {
  const g = controlledGame('liushan'); g.enemy.hand = [card('shan')]; mutate(g);
  g.phase = 'draw'; Engine.advancePhase(g); settle(g);
  assert.equal(g.phase, 'play');
  assert.ok(!g.enemy.flags.fangquanSkipped);
});

test('AC3 additional mixed sample is real progress, with every selected pool hero entering games', () => {
  const data = runMixed(26);
  assert.ok(data.actions > data.seeds * 2);
  assert.equal(data.finished + data.truncated, data.seeds);
  for (const row of Object.values(data.rows)) assert.ok(row.games > 0);
});

test('AC3 durable empirical report and dataset cover the same skill IDs with explicit denominators', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../docs/audit/2026-09-08-v16-ac-ai-evaluation.json', import.meta.url)));
  assert.deepEqual(data.controlled.map(row => row.id).sort(), CATALOG.map(row => row.id).sort());
  assert.equal(data.mixed.seeds, 96);
  assert.equal(data.godMixed.seeds, 24);
  assert.ok(data.controlled.every(row => row.opportunities >= row.uses && row.opportunities > 0));
  const report = fs.readFileSync(new URL('../docs/audit/2026-09-08-v16-ac-ai-evaluation.md', import.meta.url), 'utf8');
  for (const skill of [...CATALOG, ...GOD_CATALOG]) assert.ok(report.includes('`' + skill.id + '`'), skill.id);
});

await runTests();
