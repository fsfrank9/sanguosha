// v9 PR-E19 守护测试: 角落菜单 game-only + 退出/重开 逻辑修正.
// 用户反馈 (PR-E18 #86 merged 后):
//   "左上角那个菜单 (含退出/重开) 应该进入游戏里才显示, 不是每一级页面都显示;
//    重开 = 回选将页, 退出 = 回一级页面 (大厅)"
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

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── 1. 角落按钮默认 hidden (game-only) ─────────────────────────────

test('v9 PR-E19: index.html frameMenuBtn / frameShareBtn 默认 hidden', () => {
  assert.match(html, /<button[^>]*id="frameMenuBtn"[^>]*\shidden[^>]*>/);
  assert.match(html, /<button[^>]*id="frameShareBtn"[^>]*\shidden[^>]*>/);
});

test('v9 PR-E19: layout.css .frame-corner-btn[hidden] display:none !important', () => {
  // .frame-corner-btn { display: inline-flex } 会覆盖 [hidden] 默认, 需显式规则
  assert.match(layoutCss, /\.frame-corner-btn\[hidden\]\s*\{[\s\S]{0,80}display:\s*none\s*!important/);
});

// ───── 2. _toggleCornerButtons 控制显隐 ───────────────────────────────

test('v9 PR-E19: dom-adapter 含 _toggleCornerButtons 函数 (切 frameMenuBtn/frameShareBtn hidden)', () => {
  const fn = adapter.match(/function _toggleCornerButtons\(show\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /frameMenuBtn\.hidden\s*=\s*!show/);
  assert.match(fn[0], /frameShareBtn\.hidden\s*=\s*!show/);
});

test('v9 PR-E19: showLobby / showSetup 调 _toggleCornerButtons(false), newGame 调 (true)', () => {
  const lobby = adapter.match(/function showLobby\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  const setup = adapter.match(/function showSetup\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  const newGameFn = adapter.match(/function newGame\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(lobby && setup && newGameFn);
  assert.match(lobby[0], /_toggleCornerButtons\(false\)/);
  assert.match(setup[0], /_toggleCornerButtons\(false\)/);
  assert.match(newGameFn[0], /_toggleCornerButtons\(true\)/);
});

// ───── 3. 重开 → setup; 退出 → lobby ─────────────────────────────────

test('v9 PR-E19: drawerRestartBtn click → showSetup (重开回选将页)', () => {
  assert.match(adapter, /els\.drawerRestartBtn[\s\S]{0,200}closeSideDrawer[\s\S]{0,80}showSetup/);
});

test('v9 PR-E19: exitConfirmYesBtn click → showLobby (退出回大厅一级页面, 不再 showSetup)', () => {
  const block = adapter.match(/els\.exitConfirmYesBtn\.addEventListener\('click',\s*function[\s\S]*?\}\);/);
  assert.ok(block);
  assert.match(block[0], /showLobby\(\)/);
  assert.doesNotMatch(block[0], /showSetup\(\)/);
});

test('v9 PR-E19: 退出确认 modal 文案改为"返回大厅" (原"返回选将界面")', () => {
  assert.match(html, /退出将返回大厅/);
  assert.doesNotMatch(html, /退出将返回选将界面/);
});

// ───── 回归 ────────────────────────────────────────────────────────────

test('v9 PR-E19: loadAllStyles() 拼接含 .frame-corner-btn[hidden] 规则', () => {
  assert.match(css, /\.frame-corner-btn\[hidden\]/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
