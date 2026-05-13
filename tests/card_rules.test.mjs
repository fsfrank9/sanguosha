import assert from 'node:assert/strict';
import { CARD_CATALOG, CARD_RULES } from './helpers/load-engine.mjs';

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

const VALID_TIMINGS = new Set([
  'playPhase',
  'response',
  'judgement',
  'passive',
  'playPhase+response',
  'playPhase+dying',
  'dying'
]);

const VALID_FREQUENCIES = new Set([
  'oncePerTurn',
  'unlimited',
  'oncePerGame',
  'passive',
  'response-window'
]);

// Required fields for every CARD_RULES entry.
const REQUIRED_FIELDS = ['summary', 'timing', 'effect', 'frequency', 'engineHooks'];

test('every CARD_CATALOG entry has a corresponding CARD_RULES entry', () => {
  for (const id of Object.keys(CARD_CATALOG)) {
    assert.ok(
      CARD_RULES[id],
      `card ${id} (${CARD_CATALOG[id].name}) is missing from CARD_RULES`,
    );
  }
});

test('every CARD_RULES entry corresponds to a real catalog card (no orphan rules)', () => {
  for (const id of Object.keys(CARD_RULES)) {
    assert.ok(
      CARD_CATALOG[id],
      `CARD_RULES has orphan entry ${id} not present in CARD_CATALOG`,
    );
  }
});

test('every CARD_RULES entry has all required fields with valid values', () => {
  for (const id of Object.keys(CARD_RULES)) {
    const rule = CARD_RULES[id];
    for (const f of REQUIRED_FIELDS) {
      const v = rule[f];
      assert.ok(
        v !== undefined && v !== null && v !== '',
        `card ${id}: required field "${f}" is empty`,
      );
    }
    assert.ok(
      VALID_TIMINGS.has(rule.timing),
      `card ${id}: timing "${rule.timing}" is not in the canonical set`,
    );
    assert.ok(
      VALID_FREQUENCIES.has(rule.frequency),
      `card ${id}: frequency "${rule.frequency}" is not in the canonical set`,
    );
    assert.ok(
      Array.isArray(rule.engineHooks) && rule.engineHooks.length > 0,
      `card ${id}: engineHooks must be a non-empty array`,
    );
  }
});

test('action cards (basic / trick / delayed) have a "targets" field; equipment may omit', () => {
  for (const id of Object.keys(CARD_RULES)) {
    const family = CARD_CATALOG[id].family;
    const rule = CARD_RULES[id];
    if (family === 'basic' || family === 'trick' || family === 'delayed') {
      assert.ok(
        typeof rule.targets === 'string' && rule.targets.length > 0,
        `${family} card ${id}: targets field required`,
      );
    }
    // Equipment family rules don't need targets (passives have no targeting).
  }
});

test('CARD_RULES are merged into CARD_CATALOG entries at module load', () => {
  for (const id of Object.keys(CARD_RULES)) {
    assert.deepEqual(
      CARD_CATALOG[id].rule,
      CARD_RULES[id],
      `${id}: catalog entry should have .rule === CARD_RULES[${id}]`,
    );
  }
});

test('every "responseWindow" entry, where present, uses canonical card type strings', () => {
  const valid = new Set(['sha', 'shan', 'wuxie', 'tao', 'jiu']);
  for (const id of Object.keys(CARD_RULES)) {
    const rw = CARD_RULES[id].responseWindow;
    if (!rw) continue;
    assert.ok(Array.isArray(rw), `${id}: responseWindow must be an array if present`);
    for (const r of rw) {
      assert.ok(valid.has(r), `${id}: responseWindow contains unknown response "${r}"`);
    }
  }
});

console.log('\nCard-rule audit tests passed.');
