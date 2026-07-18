// v9 PR-E5 守护测试: 侧抽屉菜单 + 退出确认 modal (卷轴风).
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
const layoutCss = fs.readFileSync(path.join(stylesDir, 'layout.css'), 'utf8');
const modalsCss = fs.readFileSync(path.join(stylesDir, 'modals.css'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── HTML 结构 ─────────────────────────────────────────────────────

test('v9 PR-E5: index.html 含 <aside class="side-drawer" id="sideDrawer" hidden>', () => {
  assert.match(html, /<aside class="side-drawer" id="sideDrawer" hidden/);
});

test('v9 PR-E5 (v13 UI修缮3 收窄): 抽屉仅含已实现项 (退出/重开/帮助), 占位项清零', () => {
  // v13 UI修缮3: 等待/背景/变速 三个 disabled 占位按钮按用户反馈移除 —
  // 抽屉不再展示未实现功能。
  ['drawerExitBtn', 'drawerRestartBtn', 'drawerHelpBtn', 'drawerCloseBtn'].forEach(function (id) {
    const re = new RegExp('id="' + id + '"');
    assert.match(html, re, '应含 ' + id);
  });
  const placeholders = (html.match(/side-drawer__item\s+is-placeholder/g) || []).length;
  assert.equal(placeholders, 0, '抽屉占位项清零 (未实现功能不上菜单)');
  ['退出', '重开', '帮助'].forEach(function (label) {
    assert.match(html, new RegExp(label), '应含标签: ' + label);
  });
  ['等待', '背景', '变速'].forEach(function (label) {
    assert.doesNotMatch(html, new RegExp('side-drawer__label">' + label), '占位标签已移除: ' + label);
  });
});

test('v9 PR-E5: index.html 含退出确认 modal (卷轴 paper + 两端 roll + 标题/正文/按钮)', () => {
  assert.match(html, /<div class="scroll-modal" id="exitConfirmModal" hidden/);
  assert.match(html, /id="exitConfirmBackdrop"/);
  assert.match(html, /class="scroll-modal__paper"/);
  assert.match(html, /class="scroll-modal__roll scroll-modal__roll--left"/);
  assert.match(html, /class="scroll-modal__roll scroll-modal__roll--right"/);
  assert.match(html, /id="exitConfirmTitle"[^>]*>退出确认</);
  assert.match(html, /id="exitConfirmYesBtn"/);
  assert.match(html, /id="exitConfirmNoBtn"/);
});

test('v9 PR-E5: modal role="dialog" + aria-modal="true" (a11y)', () => {
  assert.match(html, /id="exitConfirmModal"[^>]*role="dialog"/);
  assert.match(html, /id="exitConfirmModal"[^>]*aria-modal="true"/);
});

// ───── CSS ───────────────────────────────────────────────────────────

test('v9 PR-E5: layout.css 含 .side-drawer + __item / __icon / __label / __close + [hidden] slide-out', () => {
  assert.match(layoutCss, /\.side-drawer\s*\{/);
  assert.match(layoutCss, /\.side-drawer__item\s*\{/);
  assert.match(layoutCss, /\.side-drawer__icon\s*\{/);
  assert.match(layoutCss, /\.side-drawer__label/);
  assert.match(layoutCss, /\.side-drawer__close\s*\{/);
  // [hidden] 用 transform 滑出 (而非 display:none)
  assert.match(layoutCss, /\.side-drawer\[hidden\]\s*\{[\s\S]*?transform:\s*translateX\(-100%\)/);
});

test('v9 PR-E5: .side-drawer 绝对定位左侧 + 棕木 gradient bg', () => {
  const block = layoutCss.match(/^\s*\.side-drawer\s*\{[\s\S]*?\n\s{4}\}/m);
  assert.ok(block);
  assert.match(block[0], /position:\s*absolute/);
  assert.match(block[0], /left:\s*0/);
  // 棕色 linear-gradient
  assert.match(block[0], /linear-gradient[\s\S]*?#6f3d18/);
});

test('v9 PR-E5: modals.css 含 .scroll-modal + __backdrop / __paper / __roll(--left/--right) / __title / __body / __actions', () => {
  assert.match(modalsCss, /\.scroll-modal\s*\{/);
  assert.match(modalsCss, /\.scroll-modal__backdrop\s*\{/);
  assert.match(modalsCss, /\.scroll-modal__paper\s*\{/);
  assert.match(modalsCss, /\.scroll-modal__roll\s*\{/);
  assert.match(modalsCss, /\.scroll-modal__roll--left\s*\{/);
  assert.match(modalsCss, /\.scroll-modal__roll--right\s*\{/);
  assert.match(modalsCss, /\.scroll-modal__title\s*\{/);
  assert.match(modalsCss, /\.scroll-modal__body\s*\{/);
  assert.match(modalsCss, /\.scroll-modal__actions\s*\{/);
});

test('v9 PR-E5: .scroll-modal[hidden] display:none !important (避免 grid 覆盖)', () => {
  assert.match(modalsCss, /\.scroll-modal\[hidden\]\s*\{[\s\S]*?display:\s*none\s*!important/);
});

test('v9 PR-E5: .scroll-modal 用 fixed + grid place-items: center 居中', () => {
  const block = modalsCss.match(/^\s*\.scroll-modal\s*\{[\s\S]*?\n\s{4}\}/m);
  assert.ok(block);
  assert.match(block[0], /position:\s*fixed/);
  assert.match(block[0], /display:\s*grid/);
  assert.match(block[0], /place-items:\s*center/);
});

test('v9 PR-E5: .scroll-modal__paper 米黄 cream gradient + 棕红 border', () => {
  const block = modalsCss.match(/\.scroll-modal__paper\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /linear-gradient[\s\S]*?#fef0c8/);
  assert.match(block[0], /border:\s*1px\s+solid\s+#b27632/);
});

test('v9 PR-E5: .scroll-modal__roll--left/right 绝对左右两侧', () => {
  assert.match(modalsCss, /\.scroll-modal__roll--left\s*\{[\s\S]*?left:\s*-/);
  assert.match(modalsCss, /\.scroll-modal__roll--right\s*\{[\s\S]*?right:\s*-/);
});

test('v9 PR-E5: .btn-frame 装饰按钮 + --cancel 绿色变体', () => {
  assert.match(modalsCss, /\.btn-frame\s*\{/);
  // 默认橙色 gradient
  const block = modalsCss.match(/^\s*\.btn-frame\s*\{[\s\S]*?\n\s{4}\}/m);
  assert.ok(block);
  assert.match(block[0], /linear-gradient[\s\S]*?#c25a1a/);
  // cancel 变体绿色
  assert.match(modalsCss, /\.btn-frame--cancel\s*\{[\s\S]*?linear-gradient[\s\S]*?#2f8b3a/);
});

// ───── dom-adapter 接入 ──────────────────────────────────────────────

test('v9 PR-E5: dom-adapter 缓存 9 个新 ids (drawer 5 + modal 4)', () => {
  ['sideDrawer', 'drawerExitBtn', 'drawerRestartBtn', 'drawerHelpBtn', 'drawerCloseBtn',
   'exitConfirmModal', 'exitConfirmBackdrop', 'exitConfirmYesBtn', 'exitConfirmNoBtn'].forEach(function (id) {
    const re = new RegExp("'" + id + "'");
    assert.match(adapter, re, '应缓存 ' + id);
  });
});

test('v9 PR-E5: dom-adapter 暴露 toggleSideDrawer / openExitConfirm / closeExitConfirm', () => {
  assert.match(adapter, /function toggleSideDrawer\(\)/);
  assert.match(adapter, /function openSideDrawer\(\)/);
  assert.match(adapter, /function closeSideDrawer\(\)/);
  assert.match(adapter, /function openExitConfirm\(\)/);
  assert.match(adapter, /function closeExitConfirm\(\)/);
});

test('v9 PR-E5: frameMenuBtn click 接入 toggleSideDrawer (替代 placeholder)', () => {
  // 不再有 placeholder console.info 行 (PR-E1 那条已移除)
  assert.doesNotMatch(adapter, /菜单 click — 侧抽屉将在 PR-E5 接入/);
  // 实际接入 toggleSideDrawer
  assert.match(adapter, /els\.frameMenuBtn\.addEventListener\('click',\s*toggleSideDrawer\)/);
});

test('v9 PR-E5: drawerExitBtn click → closeSideDrawer + openExitConfirm', () => {
  assert.match(adapter, /els\.drawerExitBtn[\s\S]{0,200}closeSideDrawer[\s\S]{0,100}openExitConfirm/);
});

test('v9 PR-E5: drawerRestartBtn click → showSetup (复用现有 setup 屏)', () => {
  assert.match(adapter, /els\.drawerRestartBtn[\s\S]{0,200}showSetup/);
});

test('v9 PR-E5/E19: exitConfirmYesBtn click → closeExitConfirm + showLobby (PR-E19 改: 退出回大厅)', () => {
  assert.match(adapter, /els\.exitConfirmYesBtn[\s\S]{0,200}closeExitConfirm[\s\S]{0,100}showLobby/);
});

test('v9 PR-E5: exitConfirmNoBtn + backdrop click → closeExitConfirm', () => {
  assert.match(adapter, /els\.exitConfirmNoBtn\.addEventListener\('click',\s*closeExitConfirm\)/);
  assert.match(adapter, /els\.exitConfirmBackdrop\.addEventListener\('click',\s*closeExitConfirm\)/);
});

test('v9 PR-E5: Esc 键 close modal 或 drawer (keydown listener)', () => {
  assert.match(adapter, /addEventListener\('keydown'/);
  assert.match(adapter, /e\.key\s*!==?\s*['"]Escape['"]/);
});

// ───── 全套回归 ──────────────────────────────────────────────────────

test('v9 PR-E5: loadAllStyles() 拼接结果含新 drawer + modal 规则 (回归)', () => {
  assert.match(css, /\.side-drawer\s*\{/);
  assert.match(css, /\.scroll-modal\s*\{/);
  assert.match(css, /\.btn-frame\s*\{/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
