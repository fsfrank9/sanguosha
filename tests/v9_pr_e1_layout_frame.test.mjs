// v9 PR-E1 守护测试: 装饰外框 + 角落 widgets.
// 验证:
//   1. tokens.css 含新的 frame design tokens (5 个)
//   2. layout.css 含 .game-frame 用 background-clip 技巧画条纹边框
//   3. layout.css 含 .frame-corner-btn + 两个变体 (--menu / --share)
//   4. index.html 含 frameMenuBtn / frameShareBtn 按钮
//   5. index.html 在 <main class="app"> 内 (在 setup-screen 和 duel-table
//      之外) 包裹了 .game-frame
//   6. dom-adapter 缓存 frameMenuBtn / frameShareBtn + 绑定 click handler
//   7. .app 改成 position: relative (角落 widgets 绝对定位锚)
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

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v9 PR-E1: tokens.css 含 5 个 frame design tokens', () => {
  const tokens = fs.readFileSync(path.join(stylesDir, 'tokens.css'), 'utf8');
  assert.match(tokens, /--frame-stripe-warm:/);
  assert.match(tokens, /--frame-stripe-bright:/);
  assert.match(tokens, /--frame-stripe-width:/);
  assert.match(tokens, /--frame-inner-radius:/);
  assert.match(tokens, /--frame-corner-wood:/);
  assert.match(tokens, /--frame-corner-gold:/);
});

test('v9 PR-E1: layout.css 含 .game-frame + background-clip 双层条纹技巧', () => {
  const layout = fs.readFileSync(path.join(stylesDir, 'layout.css'), 'utf8');
  assert.match(layout, /\.game-frame\s*\{/, '.game-frame 选择器存在');
  // 必须用 repeating-linear-gradient 画条纹
  assert.match(layout, /repeating-linear-gradient/);
  // 必须有 padding-box + border-box 双 clip
  assert.match(layout, /padding-box/);
  assert.match(layout, /border-box/);
  // 必须有 border 用 var(--frame-stripe-width)
  assert.match(layout, /border:\s*var\(--frame-stripe-width\)/);
});

test('v9 PR-E1: layout.css 含 .frame-corner-btn + --menu / --share 变体', () => {
  const layout = fs.readFileSync(path.join(stylesDir, 'layout.css'), 'utf8');
  assert.match(layout, /\.frame-corner-btn\s*\{/);
  assert.match(layout, /\.frame-corner-btn--menu\s*\{/);
  assert.match(layout, /\.frame-corner-btn--share\s*\{/);
  // 绝对定位
  assert.match(layout, /\.frame-corner-btn\s*\{[\s\S]{0,400}position:\s*absolute/);
  // hover / focus 样式
  assert.match(layout, /\.frame-corner-btn:hover/);
  assert.match(layout, /\.frame-corner-btn:focus-visible/);
});

test('v9 PR-E1: layout.css 把 .app 改成 position: relative (角落 widgets 锚)', () => {
  const layout = fs.readFileSync(path.join(stylesDir, 'layout.css'), 'utf8');
  // 抓 .app 块, 应含 position: relative
  const appBlock = layout.match(/\.app\s*\{[\s\S]*?\}/);
  assert.ok(appBlock, '.app 块存在');
  assert.match(appBlock[0], /position:\s*relative/);
});

test('v9 PR-E1: index.html 含 frameMenuBtn + frameShareBtn 按钮', () => {
  assert.match(html, /id="frameMenuBtn"/);
  assert.match(html, /id="frameShareBtn"/);
  assert.match(html, /class="frame-corner-btn frame-corner-btn--menu"/);
  assert.match(html, /class="frame-corner-btn frame-corner-btn--share"/);
});

test('v9 PR-E1: index.html 用 .game-frame 包裹各屏 (PR-E20: header 已删)', () => {
  // 验证 .game-frame 开标签出现在 main.app 内.
  // 注: v9 PR-E5 在 .app 内 .game-frame 前还塞了侧抽屉 + modal, 故 buffer
  // 放宽到 4000 char. PR-E20 删除 <header>, 改为验证 game-frame 内含 lobby-screen.
  assert.match(html, /<main class="app">[\s\S]{0,4000}<div class="game-frame">/);
  assert.match(html, /<div class="game-frame">[\s\S]{0,600}<section class="lobby-screen"/);
  // 验证闭合标签 (</main> 之前)
  assert.match(html, /<\/div><!-- \/\.game-frame -->\s*<\/main>/);
});

test('v9 PR-E1: 角落按钮在 .game-frame 之外 (作为 .app 直接子元素)', () => {
  // 顺序: <main class="app"> → frameMenuBtn → frameShareBtn → ...(drawer/modal v9 PR-E5)... → <div class="game-frame">
  assert.match(html, /<main class="app">[\s\S]{0,400}id="frameMenuBtn"[\s\S]{0,400}id="frameShareBtn"[\s\S]{0,4000}<div class="game-frame">/);
});

test('v9 PR-E1: dom-adapter 缓存 frameMenuBtn + frameShareBtn', () => {
  assert.match(adapter, /'frameMenuBtn'/);
  assert.match(adapter, /'frameShareBtn'/);
});

test('v9 PR-E1: dom-adapter 绑定 click handler 到角落按钮', () => {
  assert.match(adapter, /els\.frameMenuBtn[\s\S]{0,200}addEventListener\(\s*'click'/);
  assert.match(adapter, /els\.frameShareBtn[\s\S]{0,200}addEventListener\(\s*'click'/);
});

test('v9 PR-E1: loadAllStyles() 拼接结果含新 frame 规则 (回归)', () => {
  assert.match(css, /\.game-frame\s*\{/);
  assert.match(css, /\.frame-corner-btn\s*\{/);
  assert.match(css, /--frame-stripe-warm:/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
