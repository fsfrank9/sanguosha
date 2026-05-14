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
const adapter = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── HTML 结构 ─────────────────────────────────────────────────────

test('v9 PR-E2: index.html 在 .duel-table 内含 logOverlay / pauseBanner / statusBar', () => {
  assert.match(html, /id="logOverlay"/);
  assert.match(html, /id="pauseBanner"/);
  assert.match(html, /id="statusBar"/);
  // 必须在 .duel-table 内 (绝对定位锚). PR-E13 加 .phase-prompt 后窗口扩到 1200.
  assert.match(html, /<section class="duel-table"[\s\S]{0,1200}id="logOverlay"/);
  assert.match(html, /<section class="duel-table"[\s\S]{0,1200}id="pauseBanner"/);
  assert.match(html, /<section class="duel-table"[\s\S]{0,1200}id="statusBar"/);
});

test('v9 PR-E2: pauseBanner 默认 hidden + 含 brush 文本', () => {
  assert.match(html, /<div class="pause-banner" id="pauseBanner" hidden>/);
  assert.match(html, /class="pause-banner__brush"[^>]*>游戏暂停中/);
});

test('v9 PR-E2: statusBar 含 3 子元素 (version / score / time)', () => {
  assert.match(html, /id="statusBarVersion"/);
  assert.match(html, /id="statusBarScore"/);
  assert.match(html, /id="statusBarTime"/);
});

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

test('v9 PR-E2: layout.css 含 .pause-banner + brush 多 box-shadow (笔触感)', () => {
  const layout = fs.readFileSync(path.join(stylesDir, 'layout.css'), 'utf8');
  assert.match(layout, /\.pause-banner\s*\{/);
  assert.match(layout, /\.pause-banner__brush\s*\{/);
  // 多 box-shadow 偏移 (笔触感)
  const brushBlock = layout.match(/\.pause-banner__brush\s*\{[\s\S]*?\}/);
  assert.ok(brushBlock);
  assert.match(brushBlock[0], /box-shadow:[\s\S]*?,[\s\S]*?,/);  // 至少 3 个 box-shadow 段
});

test('v9 PR-E2: layout.css 含 .status-bar + 3 子样式 (version/score/time)', () => {
  const layout = fs.readFileSync(path.join(stylesDir, 'layout.css'), 'utf8');
  assert.match(layout, /\.status-bar\s*\{/);
  // 绝对定位在底部
  assert.match(layout, /\.status-bar\s*\{[\s\S]{0,300}position:\s*absolute/);
  assert.match(layout, /\.status-bar\s*\{[\s\S]{0,300}bottom:/);
  // 子选择器
  assert.match(layout, /\.status-bar__version/);
  assert.match(layout, /\.status-bar__score/);
  assert.match(layout, /\.status-bar__time/);
});

// ───── dom-adapter 接入 ──────────────────────────────────────────────

test('v9 PR-E2: dom-adapter 缓存 6 个新 ids', () => {
  ['logOverlay', 'pauseBanner', 'statusBar', 'statusBarVersion', 'statusBarScore', 'statusBarTime'].forEach(function (id) {
    const re = new RegExp("'" + id + "'");
    assert.match(adapter, re, '应缓存 ' + id);
  });
});

test('v9 PR-E2: dom-adapter 暴露 renderLogOverlay / renderPauseBanner / renderStatusBar / tickStatusBarTime', () => {
  assert.match(adapter, /function renderLogOverlay\(\)/);
  assert.match(adapter, /function renderPauseBanner\(\)/);
  assert.match(adapter, /function renderStatusBar\(\)/);
  assert.match(adapter, /function tickStatusBarTime\(\)/);
});

test('v9 PR-E2: render() 调用新增的 renderPauseBanner + renderStatusBar', () => {
  // 抓 render 函数体
  const renderFn = adapter.match(/function render\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(renderFn);
  assert.match(renderFn[0], /renderPauseBanner\(\)/);
  assert.match(renderFn[0], /renderStatusBar\(\)/);
});

test('v9 PR-E2: renderLog 触发 overlay 渲染 (renderLog 内含 renderLogOverlay)', () => {
  const renderLog = adapter.match(/function renderLog\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(renderLog);
  assert.match(renderLog[0], /renderLogOverlay\(\)/);
});

test('v9 PR-E2: tickStatusBarTime 用 setInterval (60s) 启动', () => {
  // bindEvents 内含 setInterval(tickStatusBarTime, ...)
  assert.match(adapter, /setInterval\(tickStatusBarTime/);
});

// ───── 全套回归 ──────────────────────────────────────────────────────

test('v9 PR-E2: loadAllStyles() 拼接结果含新 overlay 规则 (回归)', () => {
  assert.match(css, /\.log-overlay\s*\{/);
  assert.match(css, /\.pause-banner\s*\{/);
  assert.match(css, /\.status-bar\s*\{/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
