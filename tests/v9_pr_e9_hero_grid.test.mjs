// v9 PR-E9 守护测试: 选将界面 4×3 网格重设计 (替代 <select> 下拉).
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

// ───── HTML 结构 ─────────────────────────────────────────────────────

test('v9 PR-E9: index.html 含 .hero-pick 容器 + prompt/tabs/grid/random-row', () => {
  assert.match(html, /<div class="hero-pick" id="heroPick">/);
  assert.match(html, /id="heroPickPrompt"/);
  assert.match(html, /class="hero-pick__tabs"/);
  assert.match(html, /id="heroPickGrid"/);
  assert.match(html, /class="hero-pick__random-row"/);
});

test('v9 PR-E9: hero-pick 含 2 个 tab (player + enemy), player 默认 .is-active', () => {
  // 抓两个 tab 完整 tag (attribute 顺序不约束)
  const playerTab = html.match(/<button[^>]*id="heroPickPlayerTab"[^>]*>/);
  const enemyTab = html.match(/<button[^>]*id="heroPickEnemyTab"[^>]*>/);
  assert.ok(playerTab && enemyTab, '两个 tab 标签都存在');
  // 都有 data-side 标记
  assert.match(playerTab[0], /data-side="player"/);
  assert.match(enemyTab[0], /data-side="enemy"/);
  // player tab 默认 is-active (我方先选)
  assert.match(playerTab[0], /is-active/);
  assert.doesNotMatch(enemyTab[0], /is-active/);
});

test('v9 PR-E9: tab 含 __label + __value 子元素 (显示已选武将名)', () => {
  assert.match(html, /id="heroPickPlayerValue"/);
  assert.match(html, /id="heroPickEnemyValue"/);
  // 默认 "未选"
  assert.match(html, /id="heroPickPlayerValue"[^>]*>未选</);
});

test('v9 PR-E9: hero-select-panel 仍存在但 inline style:display:none (旧 select state holder)', () => {
  assert.match(html, /id="heroSelectPanel"\s+style="display:none"/);
  // selects 仍可用 (newGame 读 .value)
  assert.match(html, /id="playerHeroSelect"/);
  assert.match(html, /id="enemyHeroSelect"/);
});

test('v9 PR-E9: random按钮 (随机我方/随机敌方) 移到 .hero-pick__random-row', () => {
  // 抓 random-row 区域, 应含两个 random 按钮
  const row = html.match(/class="hero-pick__random-row"[\s\S]*?<\/div>/);
  assert.ok(row);
  assert.match(row[0], /id="randomPlayerHeroBtn"/);
  assert.match(row[0], /id="randomEnemyHeroBtn"/);
});

// ───── CSS 样式 ──────────────────────────────────────────────────────

test('v9 PR-E9: setup.css 含 .hero-pick + 子样式 (prompt/tabs/tab/grid/card)', () => {
  ['.hero-pick', '.hero-pick__prompt', '.hero-pick__tabs', '.hero-pick-tab',
   '.hero-pick__grid', '.hero-pick-card'].forEach(function (sel) {
    const re = new RegExp(sel.replace(/[.]/g, '\\.') + '\\s*\\{');
    assert.match(setupCss, re, '应含 ' + sel);
  });
});

test('v9 PR-E9: .hero-pick__prompt 黑底黄字 brush 横幅 (与 splash __enter 同风)', () => {
  const block = setupCss.match(/\.hero-pick__prompt\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /background:\s*rgba\(0,\s*0,\s*0,\s*\.78\)/);
  assert.match(block[0], /color:\s*#ffd900/);
  // 多 box-shadow 偏移 (笔触感)
  assert.match(block[0], /box-shadow:[\s\S]*?,[\s\S]*?,/);
});

test('v9 PR-E9: .hero-pick-tab.is-active 高亮 (金色 border + gold 文本)', () => {
  const block = setupCss.match(/\.hero-pick-tab\.is-active\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /border-color:\s*#ffd68a/);
  assert.match(block[0], /color:\s*var\(--gold\)/);
});

test('v9 PR-E9: .hero-pick__grid 用 grid 4 列 + 最大高度 + 滚动', () => {
  const block = setupCss.match(/\.hero-pick__grid\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /display:\s*grid/);
  assert.match(block[0], /grid-template-columns:\s*repeat\(4/);
  assert.match(block[0], /max-height:/);
  assert.match(block[0], /overflow-y:\s*auto/);
});

test('v9 PR-E9: .hero-pick-card cream gradient + 棕 border + 4 种势力 tag 配色 (魏/蜀/吴/群)', () => {
  const baseBlock = setupCss.match(/^\s*\.hero-pick-card\s*\{[\s\S]*?\n\s{4}\}/m);
  assert.ok(baseBlock);
  assert.match(baseBlock[0], /linear-gradient[\s\S]*?#fff5d4/);
  assert.match(baseBlock[0], /border:\s*2px\s+solid\s+#5b2f15/);
  // 4 个 camp tag 配色
  assert.match(setupCss, /\.hero-pick-card--camp-魏\s+\.hero-pick-card__camp[\s\S]*?#2a648c/);
  assert.match(setupCss, /\.hero-pick-card--camp-蜀\s+\.hero-pick-card__camp[\s\S]*?#2d8c4c/);
  assert.match(setupCss, /\.hero-pick-card--camp-吴\s+\.hero-pick-card__camp[\s\S]*?#b54322/);
  assert.match(setupCss, /\.hero-pick-card--camp-群\s+\.hero-pick-card__camp[\s\S]*?#5a4830/);
});

test('v9 PR-E9: .hero-pick-card 选中态 — .is-player-selected 蓝光, .is-enemy-selected 红光', () => {
  assert.match(setupCss, /\.hero-pick-card\.is-player-selected\s*\{[\s\S]*?#4a90d9/);
  assert.match(setupCss, /\.hero-pick-card\.is-enemy-selected\s*\{[\s\S]*?#d95050/);
});

// ───── dom-adapter 接入 ──────────────────────────────────────────────

test('v9 PR-E9: dom-adapter 缓存 7 个新 ids (heroPick + 6 子)', () => {
  ['heroPick', 'heroPickPrompt', 'heroPickPlayerTab', 'heroPickEnemyTab',
   'heroPickPlayerValue', 'heroPickEnemyValue', 'heroPickGrid'].forEach(function (id) {
    const re = new RegExp("'" + id + "'");
    assert.match(adapter, re, '应缓存 ' + id);
  });
});

test('v9 PR-E9: dom-adapter 暴露 renderHeroPickGrid / handleHeroPickCardClick (v10 V2: tab click no-op fn 已删)', () => {
  assert.match(adapter, /function renderHeroPickGrid\(\)/);
  assert.match(adapter, /function handleHeroPickCardClick\(/);
  assert.doesNotMatch(adapter, /function handleHeroPickTabClick\(/);
});

test('v9 PR-E9: 维护 currentPickSide 状态 (player/enemy 切换)', () => {
  assert.match(adapter, /var currentPickSide\s*=\s*['"]player['"]/);
});

test('v9 PR-E9: renderHeroPickGrid 从 Engine.HERO_CATALOG 取数据生成 card', () => {
  const fn = adapter.match(/function renderHeroPickGrid\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /Engine\.HERO_CATALOG/);
  assert.match(fn[0], /hero-pick-card--camp-/);
  assert.match(fn[0], /is-player-selected/);
  assert.match(fn[0], /is-enemy-selected/);
});

test('v9 PR-E9: handleHeroPickCardClick 更新对应 <select>.value + 重渲染', () => {
  const fn = adapter.match(/function handleHeroPickCardClick\([\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /els\.playerHeroSelect|els\.enemyHeroSelect/);
  assert.match(fn[0], /\.value\s*=\s*heroId/);
  assert.match(fn[0], /renderHeroPickGrid\(\)/);
});

test('v9 PR-E9: populateHeroSelects 末尾调用 renderHeroPickGrid (showSetup 时同步)', () => {
  const fn = adapter.match(/function populateHeroSelects\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /renderHeroPickGrid\(\)/);
});

test('v9 PR-E9/E11: randomizeHero 走 handleHeroPickCardClick 统一流程 (含 pickStep 推进)', () => {
  const fn = adapter.match(/function randomizeHero\([\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  // PR-E11 改走 handleHeroPickCardClick (内部会 renderHeroPickGrid + 推进 pickStep)
  assert.match(fn[0], /handleHeroPickCardClick/);
});

test('v9 PR-E9: bindEvents 接入 heroPickGrid click (v10 V2: tab click 绑定已删, tab 用 hidden 锁)', () => {
  assert.match(adapter, /els\.heroPickGrid\.addEventListener\('click'/);
  assert.doesNotMatch(adapter, /els\.heroPickPlayerTab\.addEventListener\('click'/);
  assert.doesNotMatch(adapter, /els\.heroPickEnemyTab\.addEventListener\('click'/);
});

// ───── 全套回归 ──────────────────────────────────────────────────────

test('v9 PR-E9: loadAllStyles() 拼接结果含 .hero-pick + .hero-pick-card 规则 (回归)', () => {
  assert.match(css, /\.hero-pick\s*\{/);
  assert.match(css, /\.hero-pick-card\s*\{/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
