// v9 PR-E21 守护测试: modal 系统适配 — pendingChoice / 技能 modal 从
// .hand-dock 移出 (修复 position:fixed 定位) + conversion / target 升级卷轴风.
//
// 背景: 14 个 modal 原都在 .hand-dock 内. .hand-dock 有 backdrop-filter
// (建立 fixed 定位 containing block) + overflow:hidden → position:fixed
// modal 被错误锚到 hand-dock 并裁剪. 移到 .duel-table 直属 (无 filter) 修复.
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

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── 1. modal 块移出 .hand-dock ────────────────────────────────────

test('v9 PR-E21: modal 块不再在 .hand-dock 内 (hand-dock 只剩 hand-title + .hand)', () => {
  // 抓 .hand-dock <section> ... </section> 内容
  const dock = html.match(/<section class="hand-dock"[\s\S]*?<\/section>/);
  assert.ok(dock);
  // hand-dock 内不应再含任何 modal panel
  assert.doesNotMatch(dock[0], /tiesuo-mode-panel/);
  assert.doesNotMatch(dock[0], /pending-prompt-panel/);
  assert.doesNotMatch(dock[0], /conversion-mode-panel/);
  // hand-dock 内应仍含 .hand
  assert.match(dock[0], /<div class="hand" id="playerHand">/);
});

test('v9 PR-E21: modal 块现为 .duel-table 直属 (hand-dock 之后, duel-table 之内)', () => {
  // 顺序: </section> (hand-dock 收尾) → 注释 → tiesuo-mode-panel → ... → </section> (duel-table 收尾)
  assert.match(html, /id="playerHand"><\/div>\s*<\/section>[\s\S]{0,400}<div class="tiesuo-mode-panel"/);
  // luoshen (modal 块末) 之后紧跟 duel-table 收尾
  assert.match(html, /id="luoshenPromptPanel"[\s\S]*?<\/div>\s*<\/section>\s*<\/div><!-- \/\.game-frame -->/);
});

// ───── 2. conversion / target 升级 pending-prompt-panel ──────────────

test('v9 PR-E21: conversionModePanel 加 pending-prompt-panel class + __hint / __actions 结构', () => {
  assert.match(html, /<div class="conversion-mode-panel pending-prompt-panel" id="conversionModePanel"/);
  assert.match(html, /<span class="pending-prompt-panel__hint" id="conversionHint">/);
  // 3 按钮包在 __actions 内
  assert.match(html, /conversion-mode-panel pending-prompt-panel[\s\S]*?pending-prompt-panel__actions[\s\S]*?conversionNormalBtn[\s\S]*?conversionShaBtn[\s\S]*?conversionCancelBtn/);
});

test('v9 PR-E21: targetZonePanel 加 pending-prompt-panel class + __hint / __actions / __choices 结构', () => {
  assert.match(html, /<div class="target-zone-panel pending-prompt-panel" id="targetZonePanel"/);
  assert.match(html, /<span class="pending-prompt-panel__hint">选择目标区域<\/span>/);
  assert.match(html, /pending-prompt-panel__actions[\s\S]*?targetHandBtn[\s\S]*?targetEquipmentBtn[\s\S]*?targetJudgeBtn[\s\S]*?targetCancelBtn/);
  assert.match(html, /class="target-card-choices pending-prompt-panel__choices" id="targetCardChoices"/);
});

// ───── 3. CSS: conversion/target 移出旧扁平组, 4 旧 modal 改 fixed ────

test('v9 PR-E21: modals.css 旧组只剩 tiesuo/huogong/guanxing/zhiheng, 改 position:fixed 居中', () => {
  // conversion / target 不再在旧 *-mode-panel 扁平组里
  const oldGroup = modalsCss.match(/\.tiesuo-mode-panel,\s*\n\s*\.huogong-mode-panel,\s*\n\s*\.guanxing-mode-panel,\s*\n\s*\.zhiheng-mode-panel\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(oldGroup, '4-modal 旧组规则存在');
  assert.match(oldGroup[0], /position:\s*fixed/);
  assert.match(oldGroup[0], /transform:\s*translate\(-50%,\s*-50%\)/);
  // conversion / target 不在该组
  assert.doesNotMatch(oldGroup[0], /conversion-mode-panel/);
  assert.doesNotMatch(oldGroup[0], /target-zone-panel/);
});

// ───── 回归 ────────────────────────────────────────────────────────────

test('v9 PR-E21: loadAllStyles() 仍含 .pending-prompt-panel framework (回归)', () => {
  assert.match(css, /\.pending-prompt-panel\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(css, /\.pending-prompt-panel::before/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
