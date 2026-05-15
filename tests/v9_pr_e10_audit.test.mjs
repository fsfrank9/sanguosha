// v9 PR-E10 收官审计 + 集成验证: 清理旧 UI 元素 + 验证新 UI 逻辑.
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

// ───── 死代码清理 ────────────────────────────────────────────────────

test('v9 PR-E10: layout.css 删除 .layout / .side / .battlefield (HTML 未使用)', () => {
  // layout.css 中不应有 .layout / .side / .battlefield 选择器
  // (但允许在注释 / .side-drawer / .side-log-panel 等含 "side" 的子选择器)
  assert.doesNotMatch(layoutCss, /^\s*\.layout\s*\{/m, '.layout 块应已删');
  assert.doesNotMatch(layoutCss, /^\s*\.side\s*\{/m, '.side 块应已删');
  assert.doesNotMatch(layoutCss, /^\s*\.battlefield\s*\{/m, '.battlefield 块应已删');
});

test('v9 PR-E10: 全局 css 也不再有 .battlefield 选择器 (回归)', () => {
  // 除注释外, 任何 .battlefield { ... } 都不应出现
  // (但允许字符串 "battlefield" 在注释里)
  assert.doesNotMatch(css, /\.battlefield\s*\{/);
});

test('v9 PR-E10: <select> 不再硬编码 stale options (由 JS 动态填充)', () => {
  // <select id="playerHeroSelect"></select> 应是空标签 (没 <option>)
  const playerSel = html.match(/<select id="playerHeroSelect">[\s\S]*?<\/select>/);
  const enemySel = html.match(/<select id="enemyHeroSelect">[\s\S]*?<\/select>/);
  assert.ok(playerSel && enemySel);
  // 都不应包含 <option>
  assert.doesNotMatch(playerSel[0], /<option/);
  assert.doesNotMatch(enemySel[0], /<option/);
});

// ───── 屏切换逻辑 ────────────────────────────────────────────────────
// PR-E20: <header> + .title-card 整块删除, _toggleHeader 函数已移除.
// 原 "header 显隐逻辑" 3 条守护已撤.

// ───── 屏切换互斥逻辑 ────────────────────────────────────────────────

// PR-E18: showSplash 已删除. 屏切换互斥从 lobby 开始 (lobby / setup / game).

test('v9 PR-E10: showLobby 互斥 — lobby hidden=false, setup/duel-table hidden=true', () => {
  const fn = adapter.match(/function showLobby\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /lobbyScreen[\s\S]*?hidden\s*=\s*false/);
  assert.match(fn[0], /setupScreen[\s\S]*?hidden\s*=\s*true/);
  assert.match(fn[0], /duelTable[\s\S]*?hidden\s*=\s*true/);
});

test('v9 PR-E10: showSetup 互斥 — setup hidden=false, lobby/duel-table hidden=true', () => {
  const fn = adapter.match(/function showSetup\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /lobbyScreen[\s\S]*?hidden\s*=\s*true/);
  assert.match(fn[0], /setupScreen[\s\S]*?hidden\s*=\s*false/);
  assert.match(fn[0], /duelTable[\s\S]*?hidden\s*=\s*true/);
});

test('v9 PR-E10: newGame 切到 duel-table — setup hidden=true, duel-table hidden=false', () => {
  const fn = adapter.match(/function newGame\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /setupScreen[\s\S]*?hidden\s*=\s*true/);
  assert.match(fn[0], /duelTable[\s\S]*?hidden\s*=\s*false/);
});

// ───── 入口流程 click 链 ─────────────────────────────────────────────

test('v9 PR-E10/E18: 入口流程 init → showLobby (splash 已删, 启动直接进 lobby)', () => {
  assert.match(adapter, /bindEvents\(\);[\s\S]{0,200}showLobby\(\)/);
});

test('v9 PR-E10: lobby1v1Btn click → showSetup', () => {
  assert.match(adapter, /els\.lobby1v1Btn\.addEventListener\('click',\s*showSetup\)/);
});

test('v9 PR-E10: startGameBtn click → newGame (旧逻辑不破)', () => {
  assert.match(adapter, /els\.startGameBtn\.addEventListener\('click',\s*newGame\)/);
});

test('v9 PR-E10/E19: 退出 modal 确认 → showLobby (PR-E19 改: 退出回大厅一级页面)', () => {
  assert.match(adapter, /els\.exitConfirmYesBtn[\s\S]{0,200}closeExitConfirm[\s\S]{0,100}showLobby/);
});

// ───── 选将 grid click 路径完整 ──────────────────────────────────────

test('v9 PR-E10: hero grid click 委托正确 (closest [data-hero-id] → handleHeroPickCardClick)', () => {
  const handler = adapter.match(/els\.heroPickGrid\.addEventListener\('click',\s*function\s*\(event\)\s*\{[\s\S]*?\n\s{8}\}\);/);
  assert.ok(handler);
  assert.match(handler[0], /closest\(\s*['"]\[data-hero-id\]['"]\s*\)/);
  assert.match(handler[0], /handleHeroPickCardClick/);
});

test('v9 PR-E10: handleHeroPickCardClick 末尾调 renderHeroPickGrid (高亮同步)', () => {
  const fn = adapter.match(/function handleHeroPickCardClick\([\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /renderHeroPickGrid\(\)/);
});

test('v9 PR-E10/E11: handleHeroPickCardClick 推进 pickStep + 切换 currentPickSide', () => {
  const fn = adapter.match(/function handleHeroPickCardClick\([\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  // PR-E11 顺序选将逻辑
  assert.match(fn[0], /pickStep\s*\+=\s*1/);
  assert.match(fn[0], /currentPickSide\s*=\s*pickOrder\[pickStep\]/);
  // 完成后调用 newGame (auto-start)
  assert.match(fn[0], /newGame\(\)/);
});

// ───── 整合: 全屏 hidden 状态守护 ────────────────────────────────────

test('v9 PR-E10/E18: 3 个主屏 (lobby/setup/duel-table) 在 HTML 中都存在 (splash 已删)', () => {
  ['lobbyScreen', 'setupScreen', 'duelTable'].forEach(function (id) {
    const re = new RegExp('id="' + id + '"');
    assert.match(html, re, '应有 ' + id);
  });
  assert.doesNotMatch(html, /id="splashScreen"/);
});

test('v9 PR-E10/E18: 初始 HTML 3 屏都 hidden (showLobby 在启动时 unhide lobby)', () => {
  assert.match(html, /<section class="lobby-screen" id="lobbyScreen" hidden/);
  assert.match(html, /<section class="setup-screen" id="setupScreen" hidden/);
  assert.match(html, /<section class="duel-table" id="duelTable" hidden/);
});

// ───── 全套 + build 回归 ─────────────────────────────────────────────

test('v9 PR-E10: loadAllStyles() 仍含核心规则 (回归; PR-E18 splash 已删)', () => {
  assert.match(css, /\.duel-table\s*\{/);
  assert.match(css, /\.hero-pick\s*\{/);
  assert.match(css, /\.lobby-screen\s*\{/);
  assert.match(css, /\.game-frame\s*\{/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
