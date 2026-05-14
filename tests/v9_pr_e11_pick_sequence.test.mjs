// v9 PR-E11 守护测试: 修复用户反馈的选将 bug —
//   1. 选完不自动进游戏 → 现在 pickStep >= 2 时自动 newGame()
//   2. 双 tab 自由切换 → 顺序选将, 锁定 tab + 隐藏非当前 side
//   3. 系统应先随机身份 (主公先选) → assignRandomRoles 入 setup 时自动调
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
const setupCss = fs.readFileSync(path.join(stylesDir, 'setup.css'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── 顺序选将 state ────────────────────────────────────────────────

test('v9 PR-E11: dom-adapter 维护 pickStep + pickOrder 状态变量', () => {
  assert.match(adapter, /var pickStep\s*=\s*0/);
  assert.match(adapter, /var pickOrder\s*=\s*\[/);
});

test('v9 PR-E11: 暴露 resetPickSequence fn — 清空 selects + 重置 pickStep + 设 pickOrder', () => {
  const fn = adapter.match(/function resetPickSequence\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn, 'resetPickSequence fn 存在');
  // 重置 pickStep 到 0
  assert.match(fn[0], /pickStep\s*=\s*0/);
  // pickOrder 按 playerRole 计算 (主公先选)
  assert.match(fn[0], /pickOrder\s*=[\s\S]*?playerRole\s*===\s*['"]主公['"]/);
  // 清空 select.value
  assert.match(fn[0], /playerHeroSelect[\s\S]{0,80}value\s*=\s*['"]['"]/);
  assert.match(fn[0], /enemyHeroSelect[\s\S]{0,80}value\s*=\s*['"]['"]/);
});

test('v9 PR-E11: assignRandomRoles 内部调用 resetPickSequence + renderHeroPickGrid (重抽身份触发重置)', () => {
  const fn = adapter.match(/function assignRandomRoles\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /resetPickSequence\(\)/);
  assert.match(fn[0], /renderHeroPickGrid\(\)/);
});

test('v9 PR-E11: showSetup 入口自动调 assignRandomRoles (系统先随机身份)', () => {
  const fn = adapter.match(/function showSetup\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  // 必须在 showSetup 末尾调 assignRandomRoles (旧 updateDraftUI 已被它包了)
  assert.match(fn[0], /assignRandomRoles\(\)/);
});

// ───── handleHeroPickCardClick: 推进 + auto-start ───────────────────

test('v9 PR-E11: handleHeroPickCardClick 推进 pickStep, 完成时自动 newGame', () => {
  const fn = adapter.match(/function handleHeroPickCardClick\([\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  // 推进 pickStep
  assert.match(fn[0], /pickStep\s*\+=\s*1/);
  // pickStep >= pickOrder.length → newGame
  assert.match(fn[0], /pickStep\s*>=\s*pickOrder\.length/);
  assert.match(fn[0], /newGame\(\)/);
  // 用 setTimeout 让 UI 先 paint
  assert.match(fn[0], /setTimeout/);
});

test('v9 PR-E11: handleHeroPickCardClick 阻止选择对方已锁的 hero (otherSelect.value === heroId)', () => {
  const fn = adapter.match(/function handleHeroPickCardClick\([\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  // guard: otherSelect.value === heroId 时早 return
  assert.match(fn[0], /otherSelect[\s\S]{0,200}===\s*heroId/);
});

test('v9 PR-E11: handleHeroPickCardClick 未完成时仅推进 currentPickSide = pickOrder[pickStep]', () => {
  const fn = adapter.match(/function handleHeroPickCardClick\([\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /currentPickSide\s*=\s*pickOrder\[pickStep\]/);
});

// ───── randomizeHero 走统一流程 ─────────────────────────────────────

test('v9 PR-E11: randomizeHero 只允许当前 side (side !== currentPickSide 早 return)', () => {
  const fn = adapter.match(/function randomizeHero\([\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /side\s*!==?\s*currentPickSide/);
});

test('v9 PR-E11: randomizeHero 走 handleHeroPickCardClick 统一流程 (不再直接 select.value)', () => {
  const fn = adapter.match(/function randomizeHero\([\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /handleHeroPickCardClick/);
});

// ───── tab + 按钮 hidden 切换 ───────────────────────────────────────

test('v9 PR-E11: renderHeroPickGrid 用 [hidden] 切换非当前 side 的 tab + random btn', () => {
  const fn = adapter.match(/function renderHeroPickGrid\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  // tab hidden 逻辑
  assert.match(fn[0], /heroPickPlayerTab\.hidden\s*=\s*\(currentPickSide\s*!==?\s*['"]player['"]\)/);
  assert.match(fn[0], /heroPickEnemyTab\.hidden\s*=\s*\(currentPickSide\s*!==?\s*['"]enemy['"]\)/);
  // random btn hidden 逻辑
  assert.match(fn[0], /randomPlayerHeroBtn\.hidden\s*=/);
  assert.match(fn[0], /randomEnemyHeroBtn\.hidden\s*=/);
});

test('v9 PR-E11: renderHeroPickGrid 给被对方选走的 card 加 disabled + .is-locked', () => {
  const fn = adapter.match(/function renderHeroPickGrid\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /is-locked/);
  // disabled 属性 (locked 时)
  assert.match(fn[0], /locked\s*\?\s*['"]\s*disabled['"]/);
});

test('v9 PR-E11: handleHeroPickTabClick 顺序选将下锁定 tab 切换 (side !== currentPickSide 早 return)', () => {
  const fn = adapter.match(/function handleHeroPickTabClick\([\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /side\s*!==?\s*currentPickSide/);
});

// ───── CSS ───────────────────────────────────────────────────────────

test('v9 PR-E11: setup.css 含 .hero-pick-tab[hidden] display:none !important', () => {
  assert.match(setupCss, /\.hero-pick-tab\[hidden\]\s*\{[\s\S]{0,80}display:\s*none\s*!important/);
});

test('v9 PR-E11: setup.css 含 .hero-pick-card:disabled / .is-locked 灰化样式', () => {
  assert.match(setupCss, /\.hero-pick-card:disabled[\s\S]{0,200}\.hero-pick-card\.is-locked/);
  // 灰化 + cursor not-allowed
  assert.match(setupCss, /\.hero-pick-card:disabled[\s\S]*?\n[\s\S]*?cursor:\s*not-allowed/);
  assert.match(setupCss, /filter:\s*grayscale\(\.6\)/);
});

test('v9 PR-E11: setup.css 含 .hero-pick__tabs flex 布局 (替代 grid 2 列)', () => {
  const block = setupCss.match(/\.hero-pick__tabs\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /display:\s*flex/);
  assert.doesNotMatch(block[0], /grid-template-columns/);
});

test('v9 PR-E11: setup.css 含 .hero-pick__random-row .btn.small[hidden] display:none', () => {
  assert.match(setupCss, /\.hero-pick__random-row\s+\.btn\.small\[hidden\]\s*\{[\s\S]{0,80}display:\s*none\s*!important/);
});

// ───── HTML ──────────────────────────────────────────────────────────

test('v9 PR-E11: startGameBtn / confirmHeroPickBtn 加 hidden (auto-flow 替代)', () => {
  assert.match(html, /id="startGameBtn"[^>]*hidden/);
  assert.match(html, /id="confirmHeroPickBtn"[^>]*hidden/);
});

// ───── 回归 ──────────────────────────────────────────────────────────

test('v9 PR-E11: loadAllStyles() 含新 lock / tab[hidden] / disabled 规则', () => {
  assert.match(css, /\.hero-pick-card:disabled/);
  assert.match(css, /\.hero-pick-card\.is-locked/);
  assert.match(css, /\.hero-pick-tab\[hidden\]/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
