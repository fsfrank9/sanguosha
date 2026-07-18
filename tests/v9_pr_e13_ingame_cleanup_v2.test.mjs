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
// v12 F6: 战场渲染域迁往 panels/board-panels.js — adapter 源按域拼接
const adapter = fs.readFileSync(path.join(root, 'src/ui/panels/board-panels.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8');
const layoutCss = fs.readFileSync(path.join(stylesDir, 'layout.css'), 'utf8');
const zonesCss = fs.readFileSync(path.join(stylesDir, 'zones.css'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// PR-E17: .phase-prompt DOM 已删. PR-E20: .title-card + <header> + _toggleHeader
// 全部删除 (用户反馈"选将界面标题栏删了"). 相关守护已撤.

// ───── dom-adapter: renderStatus ─────────────────────────────────────

// PR-E17: renderStatus 内 phasePromptBrush.textContent 写入逻辑已删 (DOM 已 delete).
// 此守护改为弱化版: renderStatus 仍存在并被调用即可.
test('v9 PR-E13: renderStatus 函数存在 (PR-E17 后 phasePrompt 写入逻辑已删)', () => {
  assert.match(adapter, /function renderStatus\(\)\s*\{/);
});

// ───── CSS: 5 处隐藏 / 新增 / 透明化 ──────────────────────────────────

test('v9 PR-E13: layout.css .status-banner display:none (整个块隐藏)', () => {
  const block = layoutCss.match(/\.status-banner\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /display:\s*none/);
});

// PR-E17: .phase-prompt + .phase-prompt__brush CSS 已删除 (整个规则块).

test('v10 V2: .status-bar 三件套 (version/score/time) 整块删除 (display:none 后无 JS 用途)', () => {
  // PR-E13 隐藏 v9.0.0 与手牌重影; PR-E15 score/time 也移走; v10 V2 整块清.
  assert.doesNotMatch(layoutCss, /\.status-bar\s*\{/);
  assert.doesNotMatch(layoutCss, /\.status-bar__version/);
  assert.doesNotMatch(layoutCss, /\.status-bar__score/);
  assert.doesNotMatch(layoutCss, /\.status-bar__time/);
});

test('v9 PR-E13: zones.css .log-overlay display:none (整个隐藏, 数据仍在 game.log)', () => {
  const block = zonesCss.match(/\.log-overlay\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /display:\s*none/);
});

test('v9 PR-E13 (v13 UI修缮6 反转): .zone-panel/.zone-title 已随单卡化移除', () => {
  // v13 UI修缮6: 判定/装备分区面板并入角色卡, 两规则孤儿化后删除。
  assert.doesNotMatch(zonesCss, /\.zone-panel\s*\{/);
  assert.doesNotMatch(zonesCss, /\.zone-title\s*\{/);
});

// ───── 回归 ────────────────────────────────────────────────────────────

// PR-E17: loadAllStyles 不再含 .phase-prompt 规则 (DOM+CSS 已删).

test('v9 PR-E13: loadAllStyles() 拼接含 .log-overlay display:none + .status-banner display:none', () => {
  assert.match(css, /\.log-overlay\s*\{[\s\S]*?display:\s*none/);
  assert.match(css, /\.status-banner\s*\{[\s\S]*?display:\s*none/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
