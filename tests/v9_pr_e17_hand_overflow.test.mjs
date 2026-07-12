// v9 PR-E17 守护测试: 用户反馈 (PR-E16 #84 merged 后):
//   1. "牌一多就变成这个样子了" — hand-dock 多卡 layout 出问题
//   2. "你的回合 那个位置太碍眼了 能不能去掉" — 删除 .phase-prompt 横幅
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

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── 1. phase-prompt 真删 ──────────────────────────────────────────

test('v9 PR-E17: index.html 不再含 .phase-prompt DOM (id="phasePrompt" / class="phase-prompt")', () => {
  assert.doesNotMatch(html, /<div class="phase-prompt"/);
  assert.doesNotMatch(html, /id="phasePrompt"/);
  assert.doesNotMatch(html, /id="phasePromptBrush"/);
});

test('v9 PR-E17: dom-adapter 不再缓存 phasePrompt / phasePromptBrush id', () => {
  assert.doesNotMatch(adapter, /'phasePrompt'/);
  assert.doesNotMatch(adapter, /'phasePromptBrush'/);
});

test('v9 PR-E17: renderStatus 内不再写入 phasePromptBrush.textContent (logic 已删)', () => {
  const fn = adapter.match(/function renderStatus\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.doesNotMatch(fn[0], /phasePromptBrush\.textContent/);
  assert.doesNotMatch(fn[0], /phasePrompt\.hidden/);
});

test('v9 PR-E17: layout.css .phase-prompt 规则已删 (不再含 position absolute + bottom 22%)', () => {
  assert.doesNotMatch(layoutCss, /\.phase-prompt\s*\{[\s\S]*?bottom:\s*22%/);
  assert.doesNotMatch(layoutCss, /\.phase-prompt__brush\s*\{/);
});

// ───── 2. hand-dock overflow 修复 ─────────────────────────────────────

test('v9 PR-E17: layout.css .hand-dock overflow: visible → hidden (恢复 containment)', () => {
  const block = layoutCss.match(/\.hand-dock\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /overflow:\s*hidden/);
  assert.doesNotMatch(block[0], /overflow:\s*visible/);
  // 还需要 min-width: 0 让 grid 子缩小, .hand overflow-x: auto 才生效
  assert.match(block[0], /min-width:\s*0/);
});

// ───── 回归 ────────────────────────────────────────────────────────────

test('v9 PR-E17: loadAllStyles() 拼接结果不含 .phase-prompt / .phase-prompt__brush 规则', () => {
  assert.doesNotMatch(css, /\.phase-prompt\s*\{\s*\n\s*position/);
  assert.doesNotMatch(css, /\.phase-prompt__brush\s*\{/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
