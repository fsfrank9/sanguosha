// v9 PR-E7 守护测试: 全局 .btn 统一橙金装饰风 + .badge / .mini-card 收尾.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllStyles } from './helpers/load-styles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylesDir = path.join(root, 'src', 'styles');
const css = loadAllStyles();
const controlsCss = fs.readFileSync(path.join(stylesDir, 'controls.css'), 'utf8');
const heroCss = fs.readFileSync(path.join(stylesDir, 'hero.css'), 'utf8');
const cardsCss = fs.readFileSync(path.join(stylesDir, 'cards.css'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── .btn 统一橙金装饰风 ───────────────────────────────────────────

test('v9 PR-E7: .btn 改橙金 gradient (#f0a33a → #c25a1a → #8b3c10) + 棕 border', () => {
  // 抓 .btn { ... } 第一个块 (不含 .btn.primary / .btn.small 修饰)
  const block = controlsCss.match(/^\s*\.btn\s*\{[\s\S]*?\n\s{4}\}/m);
  assert.ok(block, '.btn 基类块存在');
  assert.match(block[0], /linear-gradient[\s\S]*?#f0a33a[\s\S]*?#c25a1a[\s\S]*?#8b3c10/);
  assert.match(block[0], /border:\s*1px\s+solid\s+#5b2f15/);
});

test('v9 PR-E7: .btn 文本浅色 + 800 字重 + 0.08em letter-spacing', () => {
  const block = controlsCss.match(/^\s*\.btn\s*\{[\s\S]*?\n\s{4}\}/m);
  assert.ok(block);
  assert.match(block[0], /color:\s*#fff4d0/);
  assert.match(block[0], /font-weight:\s*800/);
  assert.match(block[0], /letter-spacing:\s*\.08em/);
});

test('v9 PR-E7: .btn 双层 box-shadow (inset 高光 + outer 阴影)', () => {
  const block = controlsCss.match(/^\s*\.btn\s*\{[\s\S]*?\n\s{4}\}/m);
  assert.ok(block);
  assert.match(block[0], /inset 0 1px[\s\S]*?,[\s\S]*?0 4px 10px/);
});

test('v9 PR-E7: .btn:hover brightness 1.1 + translateY -1px / :active translateY 1px', () => {
  assert.match(controlsCss, /\.btn:hover:not\(:disabled\)\s*\{[\s\S]*?filter:\s*brightness\(1\.1\)/);
  assert.match(controlsCss, /\.btn:hover:not\(:disabled\)\s*\{[\s\S]*?transform:\s*translateY\(-1px\)/);
  assert.match(controlsCss, /\.btn:active:not\(:disabled\)\s*\{[\s\S]*?transform:\s*translateY\(1px\)/);
});

test('v9 PR-E7: .btn:disabled opacity .48 + grayscale .4', () => {
  const block = controlsCss.match(/^\s*\.btn:disabled\s*\{[\s\S]*?\n\s{4}\}/m);
  assert.ok(block);
  assert.match(block[0], /opacity:\s*\.48/);
  assert.match(block[0], /filter:\s*grayscale\(\.4\)/);
});

test('v9 PR-E7: .btn.primary 更亮的金色 (#ffe4a3 → #e69a39 → #b9532d) + 深字', () => {
  const block = controlsCss.match(/\.btn\.primary\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /linear-gradient[\s\S]*?#ffe4a3[\s\S]*?#e69a39[\s\S]*?#b9532d/);
  assert.match(block[0], /color:\s*#2a120a/);
});

test('v9 PR-E7: .btn.small 紧凑变体 (min-height 30 + padding 6 14 + 6px border-radius)', () => {
  const block = controlsCss.match(/\.btn\.small\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /min-height:\s*30px/);
  assert.match(block[0], /padding:\s*6px\s+14px/);
  assert.match(block[0], /border-radius:\s*6px/);
});

// ───── .badge / .mini-card 收尾 ──────────────────────────────────────

test('v9 PR-E7: .badge 收尾 — 12px 字 + 700 字重 + 金边稍亮', () => {
  // hero.css 里 .badge
  const block = heroCss.match(/^\s*\.badge\s*\{[\s\S]*?\n\s{4}\}/m);
  assert.ok(block);
  assert.match(block[0], /font-size:\s*12px/);
  assert.match(block[0], /font-weight:\s*700/);
  assert.match(block[0], /border:\s*1px\s+solid\s+rgba\(255,\s*214,\s*138,\s*\.38\)/);
});

test('v9 PR-E7: .mini-card 收尾 — gradient 暗棕底 + 金边 + 800 字重', () => {
  // cards.css 里 .mini-card (顶级, 非 pending 范围内)
  const block = cardsCss.match(/^\s*\.mini-card\s*\{[\s\S]*?\n\s{4}\}/m);
  assert.ok(block, '.mini-card 块存在');
  assert.match(block[0], /linear-gradient[\s\S]*?rgba\(43,\s*24,\s*17/);
  assert.match(block[0], /border:\s*1px\s+solid\s+rgba\(255,\s*214,\s*138,\s*\.38\)/);
  assert.match(block[0], /font-weight:\s*700/);
});

test('v9 PR-E7: .mini-card display: inline-flex (允许配 suit/rank 子元素)', () => {
  const block = cardsCss.match(/^\s*\.mini-card\s*\{[\s\S]*?\n\s{4}\}/m);
  assert.ok(block);
  assert.match(block[0], /display:\s*inline-flex/);
});

// ───── 与 PR-E6 pending panel 内的覆写不冲突 ─────────────────────────

test('v9 PR-E7: pending-prompt-panel 范围内 .mini-card 覆写仍生效 (cream bg)', () => {
  // modals.css 应仍含 .pending-prompt-panel .mini-card 覆写
  assert.match(css, /\.pending-prompt-panel\s+\.mini-card\s*\{[\s\S]*?#fff5d4/);
});

test('v9 PR-E7: pending-prompt-panel 范围内 .btn.small 覆写仍生效 (橙 frame 风)', () => {
  // modals.css 应仍含 .pending-prompt-panel .btn.small 覆写
  assert.match(css, /\.pending-prompt-panel\s+\.btn\.small\s*\{[\s\S]*?#c25a1a/);
});

// ───── 全套回归 ──────────────────────────────────────────────────────

test('v9 PR-E7: loadAllStyles() 拼接结果含新 .btn 规则', () => {
  // 整合后必含统一 orange .btn
  assert.match(css, /\.btn\s*\{[\s\S]*?#c25a1a/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
