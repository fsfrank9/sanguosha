// v9 PR-E2 守护测试: 中央日志 overlay + 暂停 brush 横幅 + 底部状态条.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllStyles } from './helpers/load-styles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylesDir = path.join(root, 'src', 'styles');
const css = loadAllStyles();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// v12 F6: 战场渲染域迁往 panels/board-panels.js — adapter 源按域拼接
const adapter = fs.readFileSync(path.join(root, 'src/ui/panels/board-panels.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── HTML 结构 ─────────────────────────────────────────────────────

test('v9 PR-E2: index.html 在 .duel-table 内含 logOverlay (pauseBanner / statusBar 已删)', () => {
  assert.match(html, /id="logOverlay"/);
  // 必须在 .duel-table 内 (绝对定位锚).
  assert.match(html, /<section class="duel-table"[\s\S]{0,1200}id="logOverlay"/);
});

// PR-E16: pauseBanner DOM 已删除. v10 V2: statusBar 三件套也整块删除.

// ───── CSS 样式 ──────────────────────────────────────────────────────

test('v9 PR-E2: .duel-table 改 position: relative (overlay 锚)', () => {
  const layout = fs.readFileSync(path.join(stylesDir, 'layout.css'), 'utf8');
  // 抓 .duel-table { ... } 第一个 block
  const block = layout.match(/\.duel-table\s*\{[\s\S]*?\}/);
  assert.ok(block, '.duel-table 块存在');
  assert.match(block[0], /position:\s*relative/);
});

test('v9 PR-E2: zones.css 含 .log-overlay + __entry + __entry--phase + 进入动画', () => {
  const zones = fs.readFileSync(path.join(stylesDir, 'zones.css'), 'utf8');
  assert.match(zones, /\.log-overlay\s*\{/);
  assert.match(zones, /\.log-overlay__entry\s*\{/);
  assert.match(zones, /\.log-overlay__entry--phase\s*\{/);
  // 绝对定位 + 不拦截点击
  assert.match(zones, /\.log-overlay\s*\{[\s\S]{0,300}position:\s*absolute/);
  assert.match(zones, /\.log-overlay\s*\{[\s\S]{0,400}pointer-events:\s*none/);
  // 入场动画
  assert.match(zones, /@keyframes\s+log-overlay-in/);
});

// PR-E16: .pause-banner CSS 已删除. PR-E17: .phase-prompt CSS 也已删除.
// v10 V2: .status-bar CSS / DOM / JS 三件套整块删 (display:none 后无 JS 用途).

// ───── dom-adapter 接入 ──────────────────────────────────────────────

test('v9 PR-E2: dom-adapter 缓存 logOverlay (v10 V2: statusBar 三件套已删)', () => {
  assert.match(adapter, /'logOverlay'/);
  ['statusBar', 'statusBarVersion', 'statusBarScore', 'statusBarTime'].forEach(function (id) {
    const re = new RegExp("'" + id + "'");
    assert.doesNotMatch(adapter, re, id + ' 缓存应已清除');
  });
});

test('v9 PR-E2: dom-adapter 暴露 renderLogOverlay (v10 V2: renderPauseBanner/renderStatusBar/tickStatusBarTime 已删)', () => {
  assert.match(adapter, /function renderLogOverlay\(\)/);
  assert.doesNotMatch(adapter, /function renderPauseBanner\(/);
  assert.doesNotMatch(adapter, /function renderStatusBar\(/);
  assert.doesNotMatch(adapter, /function tickStatusBarTime\(/);
});

test('v9 PR-E2: renderLog 触发 overlay 渲染 (renderLog 内含 renderLogOverlay)', () => {
  const renderLog = adapter.match(/function renderLog\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(renderLog);
  assert.match(renderLog[0], /renderLogOverlay\(\)/);
});

test('v10 V2: bindEvents 不再含 setInterval(tickStatusBarTime) (status-bar 三件套全删)', () => {
  assert.doesNotMatch(adapter, /setInterval\(tickStatusBarTime/);
});

// ───── 全套回归 ──────────────────────────────────────────────────────

test('v9 PR-E2: loadAllStyles() 拼接结果含 .log-overlay 规则 (v10 V2: .status-bar 整块删除)', () => {
  assert.match(css, /\.log-overlay\s*\{/);
  assert.doesNotMatch(css, /\.status-bar\s*\{/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
