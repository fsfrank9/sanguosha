import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const htmlPath = path.resolve(import.meta.dirname, '../index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function test(name, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test('v3.0 marks the deliverable as a direct-open offline single-file build', () => {
  assert.match(html, /data-version="3\.0"/, 'body should expose the current v3.0 version');
  assert.match(html, /v3\.0 正式流程扩展版/, 'header should show v3.0 official-flow status');
  assert.match(html, /无需服务器/, 'copy should explicitly say no server is required');
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
