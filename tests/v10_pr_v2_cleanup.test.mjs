// v10 V2 守护测试: 死变量/死代码清债 (按 docs/dev/dom-adapter-map.md §8).
// 确保以下 7 类残留不再回潮 — 任何回退都会让测试红.
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

// ───── §8.1 status-bar 三件套 整块删 ──────────────────────────────────

test('v10 V2: index.html 不再含 .status-bar / statusBar / 子 ids', () => {
  assert.doesNotMatch(html, /class="status-bar"/);
  assert.doesNotMatch(html, /id="statusBar"/);
  assert.doesNotMatch(html, /id="statusBarVersion"/);
  assert.doesNotMatch(html, /id="statusBarScore"/);
  assert.doesNotMatch(html, /id="statusBarTime"/);
});

test('v10 V2: layout.css 不再含 .status-bar* 任何规则', () => {
  assert.doesNotMatch(layoutCss, /\.status-bar\s*\{/);
  assert.doesNotMatch(layoutCss, /\.status-bar__version/);
  assert.doesNotMatch(layoutCss, /\.status-bar__score/);
  assert.doesNotMatch(layoutCss, /\.status-bar__time/);
});

test('v10 V2: dom-adapter 不再缓存 statusBar* 5 个 ids', () => {
  ['statusBar', 'statusBarVersion', 'statusBarScore', 'statusBarTime'].forEach(function (id) {
    const re = new RegExp("'" + id + "'");
    assert.doesNotMatch(adapter, re, id + ' 不应再被缓存');
  });
});

test('v10 V2: dom-adapter 不再含 renderStatusBar / tickStatusBarTime / 其 setInterval', () => {
  assert.doesNotMatch(adapter, /function renderStatusBar\(/);
  assert.doesNotMatch(adapter, /function tickStatusBarTime\(/);
  assert.doesNotMatch(adapter, /setInterval\(tickStatusBarTime/);
});

// ───── §8.2 renderPauseBanner no-op fn 整块删 ─────────────────────────

test('v10 V2: dom-adapter 不再含 renderPauseBanner fn 或调用', () => {
  assert.doesNotMatch(adapter, /function renderPauseBanner\(/);
  assert.doesNotMatch(adapter, /renderPauseBanner\(\)/);
});

// ───── §8.3 enterZhihengMode / confirmZhiheng 死函数双僵尸删 ──────────

test('v10 V2: dom-adapter 不再含 enterZhihengMode / confirmZhiheng', () => {
  assert.doesNotMatch(adapter, /function enterZhihengMode\(/);
  assert.doesNotMatch(adapter, /function confirmZhiheng\(/);
});

// ───── §8.4 handleHeroPickTabClick no-op 删 ───────────────────────────

test('v10 V2: dom-adapter 不再含 handleHeroPickTabClick fn 或调用', () => {
  assert.doesNotMatch(adapter, /function handleHeroPickTabClick\(/);
  assert.doesNotMatch(adapter, /handleHeroPickTabClick\(/);
});

// ───── §8.5 draftPicker / confirmHeroPick legacy 4 元件链 ─────────────

test('v10 V2: dom-adapter 不再含 draftPicker var / confirmHeroPick fn / 其绑定', () => {
  assert.doesNotMatch(adapter, /\bdraftPicker\b/);
  assert.doesNotMatch(adapter, /function confirmHeroPick\(/);
  assert.doesNotMatch(adapter, /els\.confirmHeroPickBtn\.addEventListener/);
});

test('v10 V2: index.html 不再含 confirmHeroPickBtn / firstPickBadge 元素', () => {
  assert.doesNotMatch(html, /id="confirmHeroPickBtn"/);
  assert.doesNotMatch(html, /id="firstPickBadge"/);
});

test('v10 V2: dom-adapter 不再缓存 confirmHeroPickBtn / firstPickBadge', () => {
  assert.doesNotMatch(adapter, /'confirmHeroPickBtn'/);
  assert.doesNotMatch(adapter, /'firstPickBadge'/);
});

// ───── 回归: PR-E11 顺序选将主流程仍在 ────────────────────────────────

test('v10 V2: PR-E11 顺序选将关键状态机仍存在 (currentPickSide / pickStep / pickOrder)', () => {
  assert.match(adapter, /var currentPickSide\s*=/);
  assert.match(adapter, /var pickStep\s*=/);
  assert.match(adapter, /var pickOrder\s*=/);
  assert.match(adapter, /function handleHeroPickCardClick\(/);
  assert.match(adapter, /function resetPickSequence\(/);
});

test('v10 V2: skill-select 模式仍 wired (enterCardSkillMode + confirmCardSkill + cardSkillConfig)', () => {
  assert.match(adapter, /function enterCardSkillMode\(skillId\)/);
  assert.match(adapter, /function confirmCardSkill\(\)/);
  assert.match(adapter, /function cardSkillConfig\(skillId\)/);
  // zhiheng 走通用入口
  assert.match(adapter, /zhiheng:\s*\{[\s\S]{0,200}name:\s*'制衡'/);
});

test('v10 V2: render() 不再调用已删的 renderPauseBanner / renderStatusBar', () => {
  const renderFn = adapter.match(/function render\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(renderFn);
  assert.doesNotMatch(renderFn[0], /renderPauseBanner\(/);
  assert.doesNotMatch(renderFn[0], /renderStatusBar\(/);
  // 关键调用链仍在
  assert.match(renderFn[0], /renderPendingChoice\(/);
  assert.match(renderFn[0], /_reapplyStagedHighlight\(/);
});

test('v10 V2: loadAllStyles() 拼接不再含 .status-bar* 规则', () => {
  assert.doesNotMatch(css, /\.status-bar\s*\{/);
  assert.doesNotMatch(css, /\.status-bar__time/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
