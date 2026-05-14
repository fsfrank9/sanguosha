import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadAllStyles } from './helpers/load-styles.mjs';

const root = path.resolve(import.meta.dirname, '..');
const html = [
  fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
  loadAllStyles(),
  fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8'),
].join('\n');

function test(name, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test('v6.1 marks the deliverable as the current spec-compliance version', () => {
  assert.match(html, /data-version="6\.1"/, 'body should expose the current v6.1 version');
  assert.match(html, /v6\.1 规则合规版/, 'header should show v6.1 spec-compliance status');
  assert.match(html, /GitHub Pages/, 'copy should mention the static-hosted delivery channel');
});

test('visual polish adds official-style camp ribbons and animated combat feedback hooks', () => {
  assert.match(html, /class="camp-ribbon"/, 'hero cards should include a camp ribbon element');
  assert.match(html, /damage-float/, 'CSS/JS should include floating damage or heal feedback');
  assert.match(html, /hero-aura/, 'hero cards should include an aura polish layer');
});

test('final UI keeps responsive and accessible battle feedback hooks', () => {
  assert.match(html, /aria-live="polite"/, 'battle log should announce updates politely');
  assert.match(html, /aria-label="战报"/, 'battle log should have an accessible label');
  assert.match(html, /@media \(max-width: 560px\)/, 'mobile responsive rules should remain present');
});
