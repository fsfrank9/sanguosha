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

test('版本标记跟随当前版本 (data-version 与 package.json 主次版本一致)', () => {
  // 审计二轮: index.html 此前停在 data-version="6.1" (实际已 v10), 改为与
  // package.json 的 major.minor 同步校验, 防止再次漂移。
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const majorMinor = pkg.version.split('.').slice(0, 2).join('.');
  assert.match(html, new RegExp('data-version="' + majorMinor.replace('.', '\\.') + '"'),
    'body data-version 应与 package.json 主次版本一致 (当前 ' + majorMinor + ')');
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
