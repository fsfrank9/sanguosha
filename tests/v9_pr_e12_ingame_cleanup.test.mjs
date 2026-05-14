// v9 PR-E12 守护测试: 进入游戏后界面清理 (隐藏与新 v9 元素重复 / 噪音的旧装饰).
// 用户反馈截图显示:
//   - 中央 overlay + 右侧 side-log 双显日志
//   - title-card 大字水印 "魏 蜀 吴 群" 与 v9 装饰边框 + 角落 widgets 重复
//   - hero ::before 大字 "蜀"/"魏" 水印 + 倾斜 .camp-ribbon 带状
//     与 PR-E4 圆主公徽章 + 卡片右下角 camp tag 重复, 大字尺寸压头
//   - 武将 .quote 台词文字 (凌波微步 / 惟贤惟德) 是文字噪音, 不增信息
// 本测试守护这些旧元素被 CSS 隐藏 + log-overlay 重新定位居中收窄.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllStyles } from './helpers/load-styles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylesDir = path.join(root, 'src', 'styles');
const css = loadAllStyles();
const heroCss = fs.readFileSync(path.join(stylesDir, 'hero.css'), 'utf8');
const setupCss = fs.readFileSync(path.join(stylesDir, 'setup.css'), 'utf8');
const zonesCss = fs.readFileSync(path.join(stylesDir, 'zones.css'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── hero.css: 三处隐藏 ──────────────────────────────────────────────

test('v9 PR-E12: hero.css 隐藏 .camp-ribbon (与 PR-E4 主公徽章 + camp tag 重复)', () => {
  const block = heroCss.match(/\.camp-ribbon\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block, 'hero.css 应保留 .camp-ribbon 规则块');
  assert.match(block[0], /display:\s*none/);
});

test('v9 PR-E12: hero.css 隐藏 .hero::before (大字水印 "蜀"/"魏")', () => {
  const block = heroCss.match(/\.hero::before\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block, 'hero.css 应保留 .hero::before 规则块');
  assert.match(block[0], /content:\s*none/);
});

test('v9 PR-E12: hero.css 隐藏 .quote (武将台词文字噪音)', () => {
  const block = heroCss.match(/\.quote\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block, 'hero.css 应保留 .quote 规则块');
  assert.match(block[0], /display:\s*none/);
});

// ───── setup.css: title-card watermark ────────────────────────────────

test('v9 PR-E12: setup.css 隐藏 .title-card::after (旧版 "魏 蜀 吴 群" 大字水印)', () => {
  const block = setupCss.match(/\.title-card::after\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block, 'setup.css 应保留 .title-card::after 规则块');
  assert.match(block[0], /content:\s*none/);
});

// ───── zones.css: side-log + log-overlay 调整 ─────────────────────────

test('v9 PR-E12: zones.css 隐藏 .side-log-panel (与 PR-E2 中央 overlay 双显)', () => {
  const block = zonesCss.match(/\.side-log-panel\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block, 'zones.css 应含 .side-log-panel 规则块');
  assert.match(block[0], /display:\s*none\s*!important/);
});

test('v9 PR-E12: .log-overlay 居中收窄 (left/right 22% + top 32% + max-height 28%)', () => {
  const block = zonesCss.match(/\.log-overlay\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block, '.log-overlay 规则块存在');
  assert.match(block[0], /left:\s*22%/);
  assert.match(block[0], /right:\s*22%/);
  assert.match(block[0], /top:\s*32%/);
  assert.match(block[0], /max-height:\s*28%/);
});

// ───── 拼装回归: 全套 CSS 仍包含必要规则 ──────────────────────────────

test('v9 PR-E12: loadAllStyles() 拼接含 .side-log-panel + .camp-ribbon + .quote 隐藏 (回归)', () => {
  assert.match(css, /\.side-log-panel\s*\{[\s\S]*?display:\s*none\s*!important/);
  assert.match(css, /\.camp-ribbon\s*\{[\s\S]*?display:\s*none/);
  assert.match(css, /\.quote\s*\{[\s\S]*?display:\s*none/);
});

test('v9 PR-E12: loadAllStyles() 拼接含 .title-card::after + .hero::before content:none (回归)', () => {
  assert.match(css, /\.title-card::after\s*\{[\s\S]*?content:\s*none/);
  assert.match(css, /\.hero::before\s*\{[\s\S]*?content:\s*none/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
