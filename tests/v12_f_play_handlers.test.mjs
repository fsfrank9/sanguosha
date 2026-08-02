import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test, runTests } from './helpers/harness.mjs';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');

test('v12 F3 playCard uses concrete registered handlers instead of a legacy if-chain bucket', () => {
  assert.match(source, /var PLAY_HANDLERS = \{\};/, 'play handler registry should exist');
  assert.match(source, /function playShaCardHandler\(/, 'sha should have its own registered handler');
  assert.match(source, /function playTaoCardHandler\(/, 'tao should have its own registered handler');
  assert.match(source, /registerPlayHandler\('sha', playShaCardHandler\);/, 'sha should not route through a legacy catch-all');
  assert.match(source, /registerPlayHandler\('default', playDefaultCardHandler\);/, 'default handler should be explicit');
  assert.doesNotMatch(source, /playCardLegacyDispatch/, 'F3 should not keep a legacy dispatch bucket');
});
await runTests();
