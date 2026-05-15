// v9 PR-E20 守护测试: 删除 <header> + .title-card 标题栏.
// 用户反馈 (PR-E19 #87 merged 后): "选将界面的最上面那个标题栏删了吧".
// title-card 在 game 屏 (PR-E13) 已隐藏, lobby 屏 header 整个隐, 现 setup
// 也删 → 各屏均不需要, 整个 <header> + .title-card 删除.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllStyles } from './helpers/load-styles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylesDir = path.join(root, 'src', 'styles');
const css = loadAllStyles();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8');
const setupCss = fs.readFileSync(path.join(stylesDir, 'setup.css'), 'utf8');
const layoutCss = fs.readFileSync(path.join(stylesDir, 'layout.css'), 'utf8');
const heroCss = fs.readFileSync(path.join(stylesDir, 'hero.css'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── HTML: header / title-card 真删 ────────────────────────────────

test('v9 PR-E20: index.html 不再含 <header> / .title-card / h1 / version-pill / subtitle', () => {
  assert.doesNotMatch(html, /<header>/);
  assert.doesNotMatch(html, /<\/header>/);
  assert.doesNotMatch(html, /class="title-card"/);
  assert.doesNotMatch(html, /id="titleCard"/);
  assert.doesNotMatch(html, /<h1>/);
  assert.doesNotMatch(html, /class="version-pill"/);
  assert.doesNotMatch(html, /class="subtitle"/);
});

// ───── JS: _toggleHeader / titleCard 真删 ────────────────────────────

test('v9 PR-E20: dom-adapter 不再含 _toggleHeader 函数 + 不再缓存 titleCard', () => {
  assert.doesNotMatch(adapter, /function _toggleHeader/);
  assert.doesNotMatch(adapter, /_toggleHeader\(/);
  assert.doesNotMatch(adapter, /'titleCard'/);
});

test('v9 PR-E20: dom-adapter 不再含 .game-frame > header querySelector', () => {
  assert.doesNotMatch(adapter, /\.game-frame\s*>\s*header/);
});

test('v9 PR-E20: showLobby / showSetup / newGame 不再调 _toggleHeader', () => {
  ['showLobby', 'showSetup', 'newGame'].forEach(function (fnName) {
    const fn = adapter.match(new RegExp('function ' + fnName + '\\([\\s\\S]*?\\n\\s{6}\\}'));
    assert.ok(fn, fnName + ' 函数存在');
    assert.doesNotMatch(fn[0], /_toggleHeader/);
  });
});

// ───── CSS: title-card / header 规则真删 ─────────────────────────────

test('v9 PR-E20: setup.css 不再含 .title-card / ::after / h1 / .subtitle 规则', () => {
  assert.doesNotMatch(setupCss, /\.title-card\s*\{/);
  assert.doesNotMatch(setupCss, /\.title-card::after\s*\{/);
  assert.doesNotMatch(setupCss, /\n\s*h1\s*\{/);
  assert.doesNotMatch(setupCss, /\.subtitle\s*\{/);
});

test('v9 PR-E20: layout.css 不再含 header 规则 + 共享 panel-base 不含 .title-card', () => {
  assert.doesNotMatch(layoutCss, /\n\s*header\s*\{/);
  // 共享 panel-base 选择器列表不含 .title-card
  const shared = layoutCss.match(/Shared panel-base[\s\S]*?\{/);
  assert.ok(shared);
  assert.doesNotMatch(shared[0], /\.title-card/);
});

test('v9 PR-E20: hero.css 不再含 .version-pill 规则', () => {
  assert.doesNotMatch(heroCss, /\.version-pill\s*\{/);
});

// ───── 回归 ────────────────────────────────────────────────────────────

test('v9 PR-E20: loadAllStyles() 拼接不含 .title-card / .version-pill / header 规则', () => {
  assert.doesNotMatch(css, /\.title-card\s*\{/);
  assert.doesNotMatch(css, /\.version-pill\s*\{/);
});

test('v9 PR-E20: .game-frame 仍存在 (容器未删, 仅 header 子元素删)', () => {
  assert.match(html, /<div class="game-frame">/);
  assert.match(css, /\.game-frame\s*\{/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
