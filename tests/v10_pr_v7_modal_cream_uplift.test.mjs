// v10 V7 守护: 4 旧 mode-panel (tiesuo / huogong / guanxing / zhiheng) 升级
// 为 pending-prompt-panel cream 卷轴风, 与其他 13 个 pending 面板视觉统一.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllStyles } from './helpers/load-styles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylesDir = path.join(root, 'src', 'styles');
const css = loadAllStyles();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const modalsCss = fs.readFileSync(path.join(stylesDir, 'modals.css'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── HTML: 4 panels 升级 ──────────────────────────────────────────

test('v10 V7: tiesuoModePanel 升级为 pending-prompt-panel + __hint + __actions 结构', () => {
  assert.match(html, /class="tiesuo-mode-panel pending-prompt-panel" id="tiesuoModePanel"/);
  assert.match(html, /<span class="pending-prompt-panel__hint">铁索连环/);
  assert.match(html, /tiesuo-mode-panel pending-prompt-panel[\s\S]*?pending-prompt-panel__actions[\s\S]*?tiesuoRecastBtn[\s\S]*?tiesuoChainEnemyBtn[\s\S]*?tiesuoCancelBtn/);
});

test('v10 V7: huogongModePanel 升级 pending-prompt-panel + reveal hint + __actions + __choices', () => {
  assert.match(html, /class="huogong-mode-panel pending-prompt-panel" id="huogongModePanel"/);
  // reveal text 复用 __hint (兼容 huogong-reveal cream 样式)
  assert.match(html, /<span class="pending-prompt-panel__hint huogong-reveal" id="huogongRevealText"/);
  assert.match(html, /huogong-mode-panel pending-prompt-panel[\s\S]*?pending-prompt-panel__actions[\s\S]*?huogongDeclineBtn[\s\S]*?huogongCancelBtn/);
  assert.match(html, /class="huogong-cost-choices pending-prompt-panel__choices" id="huogongCostChoices"/);
});

test('v10 V7: guanxingModePanel 升级 pending-prompt-panel + __hint + 3 zone + 2 row + __actions', () => {
  assert.match(html, /class="guanxing-mode-panel pending-prompt-panel" id="guanxingModePanel"/);
  assert.match(html, /<span class="pending-prompt-panel__hint" id="guanxingHint">/);
  // 3 zone 保留
  assert.match(html, /id="guanxingUnassigned"/);
  assert.match(html, /id="guanxingTopZone"/);
  assert.match(html, /id="guanxingBottomZone"/);
  // 移牌 btn 仍在
  assert.match(html, /id="guanxingTopBtn"/);
  assert.match(html, /id="guanxingBottomBtn"/);
  assert.match(html, /id="guanxingReturnBtn"/);
  // 末行 confirm / decline 包在 __actions
  assert.match(html, /pending-prompt-panel__actions[\s\S]*?guanxingConfirmBtn[\s\S]*?guanxingDeclineBtn/);
});

test('v10 V7: zhihengModePanel 升级 pending-prompt-panel + __hint + __actions', () => {
  assert.match(html, /class="zhiheng-mode-panel pending-prompt-panel" id="zhihengModePanel"/);
  assert.match(html, /<span class="pending-prompt-panel__hint" id="zhihengHint">/);
  assert.match(html, /zhiheng-mode-panel pending-prompt-panel[\s\S]*?pending-prompt-panel__actions[\s\S]*?zhihengConfirmBtn[\s\S]*?zhihengCancelBtn/);
});

// ───── CSS: 旧 dark 组规则全删, cream cascade 接管 ──────────────────

test('v10 V7: modals.css 旧 4-modal dark 组规则块整块删除', () => {
  // 旧组: position:fixed + dark gradient 背景 (rgba(48,28,18,.98) 等)
  assert.doesNotMatch(modalsCss, /\.tiesuo-mode-panel,\s*\n\s*\.huogong-mode-panel,\s*\n\s*\.guanxing-mode-panel,\s*\n\s*\.zhiheng-mode-panel\s*\{/);
  // 也不应有 dark gradient 在 4 panel 任意之一上独立出现
  assert.doesNotMatch(modalsCss, /\.tiesuo-mode-panel\s*\{[\s\S]{0,200}rgba\(48,\s*28,\s*18/);
});

test('v10 V7: [hidden] override 块简化为 pending-prompt-panel[hidden]', () => {
  // V7 后 4 旧 mode-panel 的 [hidden] 选择器可移除 (pending-prompt-panel cascade 接管)
  const block = modalsCss.match(/\.duel-table\[hidden\][\s\S]*?display:\s*none\s*!important/);
  assert.ok(block);
  assert.doesNotMatch(block[0], /\.tiesuo-mode-panel\[hidden\]/);
  assert.doesNotMatch(block[0], /\.huogong-mode-panel\[hidden\]/);
  assert.doesNotMatch(block[0], /\.guanxing-mode-panel\[hidden\]/);
  assert.doesNotMatch(block[0], /\.zhiheng-mode-panel\[hidden\]/);
  assert.match(block[0], /\.pending-prompt-panel\[hidden\]/);
});

test('v10 V7: .pending-prompt-panel scoped 内部支持样式 — guanxing-zone / huogong-reveal cream', () => {
  // guanxing-zone 用 dashed brown border + cream bg (而非 dark)
  assert.match(modalsCss, /\.pending-prompt-panel \.guanxing-zone\s*\{/);
  assert.match(modalsCss, /\.pending-prompt-panel \.guanxing-zone-row\s*\{/);
  assert.match(modalsCss, /\.pending-prompt-panel \.guanxing-card\s*\{/);
  // huogong-reveal cream 化 (旧 dark gradient → cream/brown)
  assert.match(modalsCss, /\.huogong-reveal\s*\{[\s\S]{0,200}color:\s*#5b2f15/);
});

test('v10 V7: _anyModalVisible 选择器简化 (4 旧 panel 不再分列)', () => {
  const fn = adapter.match(/function _anyModalVisible\(\)\s*\{[\s\S]*?\n {6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /pending-prompt-panel:not\(\[hidden\]\)/);
  assert.match(fn[0], /scroll-modal:not\(\[hidden\]\)/);
  // 4 旧 selector 应全清
  ['tiesuo-mode-panel', 'huogong-mode-panel', 'guanxing-mode-panel', 'zhiheng-mode-panel'].forEach(function (cls) {
    const re = new RegExp(cls + ':not\\(\\[hidden\\]\\)');
    assert.doesNotMatch(fn[0], re);
  });
});

// ───── 回归 ──────────────────────────────────────────────────────────

test('v10 V7 回归: pending-prompt-panel framework 仍存在 (cream + position fixed)', () => {
  assert.match(css, /\.pending-prompt-panel\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(css, /\.pending-prompt-panel\s*\{[\s\S]*?background:[\s\S]*?#fef0c8/);
});

test('v10 V7 回归: 4 panel 的 button IDs 全部保留 (JS dom-adapter 通过 id 绑定)', () => {
  [
    'tiesuoRecastBtn', 'tiesuoChainEnemyBtn', 'tiesuoChainSelfBtn',
    'tiesuoChainBothBtn', 'tiesuoCancelBtn',
    'huogongDeclineBtn', 'huogongCancelBtn',
    'guanxingTopBtn', 'guanxingBottomBtn', 'guanxingReturnBtn',
    'guanxingConfirmBtn', 'guanxingDeclineBtn',
    'zhihengConfirmBtn', 'zhihengCancelBtn'
  ].forEach(function (id) {
    const re = new RegExp('id="' + id + '"');
    assert.match(html, re, id + ' 应仍存在');
  });
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
