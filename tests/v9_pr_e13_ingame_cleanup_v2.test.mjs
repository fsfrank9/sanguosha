// v9 PR-E13 守护测试: 进入游戏后界面清理 v2 — PR-E12 之后用户截图反馈仍乱.
// 对比参考截图后处理:
//   1. 游戏中隐藏 .title-card (h1 + .subtitle), 只保留 .top-actions 角落按钮
//   2. 隐藏 .status-banner 大棕色 "你的回合" 块
//   3. 新增中下 .phase-prompt 黄字黑笔触横幅 (复用 .pause-banner 风格)
//   4. 隐藏 .log-overlay (历史日志数据保留)
//   5. 隐藏 .status-bar__version (v9.0.0 与手牌重影)
//   6. zone-panel 背景半透明 (.78/.82 → .32/.42)
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
const zonesCss = fs.readFileSync(path.join(stylesDir, 'zones.css'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── HTML: 加 id + 新 phase-prompt ────────────────────────────────────

test('v9 PR-E13: index.html .title-card 加 id="titleCard"', () => {
  assert.match(html, /<section class="title-card" id="titleCard">/);
});

test('v9 PR-E13: index.html 在 .duel-table 内加 .phase-prompt + .phase-prompt__brush', () => {
  assert.match(html, /<div class="phase-prompt" id="phasePrompt"[^>]*>/);
  assert.match(html, /<span class="phase-prompt__brush" id="phasePromptBrush">/);
});

// ───── dom-adapter: 缓存 + _toggleHeader + renderStatus ────────────────

test('v9 PR-E13: dom-adapter 缓存 titleCard / phasePrompt / phasePromptBrush', () => {
  ['titleCard', 'phasePrompt', 'phasePromptBrush'].forEach(function (id) {
    const re = new RegExp("'" + id + "'");
    assert.match(adapter, re, '应缓存 ' + id);
  });
});

test('v9 PR-E13: _toggleHeader 加 mode 参数 — game 模式隐藏 titleCard', () => {
  const fn = adapter.match(/function _toggleHeader\([\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /function _toggleHeader\(show,\s*mode\)/);
  assert.match(fn[0], /titleCard\.hidden\s*=\s*!show\s*\|\|\s*mode\s*===\s*['"]game['"]/);
});

test('v9 PR-E13: newGame 调 _toggleHeader(true, "game"); showSetup 调 _toggleHeader(true, "setup")', () => {
  assert.match(adapter, /_toggleHeader\(true,\s*['"]game['"]\)/);
  assert.match(adapter, /_toggleHeader\(true,\s*['"]setup['"]\)/);
});

test('v9 PR-E13: renderStatus 写入 phasePromptBrush textContent + hidden 控制 (pause 时隐藏)', () => {
  const fn = adapter.match(/function renderStatus\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /phasePromptBrush\.textContent\s*=\s*title/);
  assert.match(fn[0], /phasePrompt\.hidden\s*=/);
  // 检测 pause guard (pendingChoice / enemyThinking)
  assert.match(fn[0], /getPendingChoice/);
  assert.match(fn[0], /enemyThinking/);
});

// ───── CSS: 5 处隐藏 / 新增 / 透明化 ──────────────────────────────────

test('v9 PR-E13: layout.css .status-banner display:none (整个块隐藏)', () => {
  const block = layoutCss.match(/\.status-banner\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /display:\s*none/);
});

test('v9 PR-E13: layout.css 新增 .phase-prompt + .phase-prompt__brush 黑底黄字 brush', () => {
  const wrap = layoutCss.match(/\.phase-prompt\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(wrap, '.phase-prompt 规则存在');
  assert.match(wrap[0], /position:\s*absolute/);
  assert.match(wrap[0], /bottom:\s*22%/);
  const brush = layoutCss.match(/\.phase-prompt__brush\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(brush);
  assert.match(brush[0], /color:\s*#ffd900/);
  assert.match(brush[0], /background:\s*rgba\(0,\s*0,\s*0,\s*0?\.78\)/);
  // brush 多 box-shadow 笔触感
  assert.match(brush[0], /box-shadow:[\s\S]*?,[\s\S]*?,/);
});

test('v9 PR-E13: layout.css .status-bar__version display:none (避免 v9.0.0 与手牌重影)', () => {
  // PR-E15 后, version/score/time 三选择器共享 display:none 规则.
  assert.match(layoutCss, /\.status-bar__version[,\s]*[\s\S]{0,80}display:\s*none/);
});

test('v9 PR-E13: zones.css .log-overlay display:none (整个隐藏, 数据仍在 game.log)', () => {
  const block = zonesCss.match(/\.log-overlay\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /display:\s*none/);
});

test('v9 PR-E13: zones.css .zone-panel 背景半透明 (.32 / .42, 从原 .78/.82 降)', () => {
  const block = zonesCss.match(/\.zone-panel\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /rgba\(33,\s*20,\s*15,\s*\.32\)/);
  assert.match(block[0], /rgba\(14,\s*10,\s*8,\s*\.42\)/);
});

// ───── 回归 ────────────────────────────────────────────────────────────

test('v9 PR-E13: loadAllStyles() 拼接含 .phase-prompt + .phase-prompt__brush 规则', () => {
  assert.match(css, /\.phase-prompt\s*\{/);
  assert.match(css, /\.phase-prompt__brush\s*\{/);
});

test('v9 PR-E13: loadAllStyles() 拼接含 .log-overlay display:none + .status-banner display:none', () => {
  assert.match(css, /\.log-overlay\s*\{[\s\S]*?display:\s*none/);
  assert.match(css, /\.status-banner\s*\{[\s\S]*?display:\s*none/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
