// v9 PR-E14 守护测试: arena 区域清理 + lord/rebel badge 对称 + 手牌截断修复
//                       + top-actions 重定位 + 滚动日志恢复.
// 用户反馈 (PR-E13 合并后浏览器实测截图):
//   1. 中间"阶段"框占地大却信息冗余 → 整个 .arena-phase-panel display:none
//   2. 手牌只显示半截, 文字被截断 → .hand-dock overflow visible + row min-height 180
//   3. 滚动日志被删 (参考图有) → 恢复 .side-log-panel display:flex
//   4. 顶部"主"徽章挡住 turn-badge "电脑" → lord-badge 移到 top-left + 加 hero-head padding-left
//   5. 反贼身份不显示 → 加 .rebel-badge (绿圆 "反") + dom-adapter 切换逻辑
//   6. 顶部留大空白只放两按钮 → .top-actions 移出 header + absolute 浮顶
//   7. 提交前先 check 前 PR merge 状态 (本 PR 已确认 #81 merged 后才开 PR-E14 branch)
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
const heroCss = fs.readFileSync(path.join(stylesDir, 'hero.css'), 'utf8');
const layoutCss = fs.readFileSync(path.join(stylesDir, 'layout.css'), 'utf8');
const controlsCss = fs.readFileSync(path.join(stylesDir, 'controls.css'), 'utf8');
const zonesCss = fs.readFileSync(path.join(stylesDir, 'zones.css'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── 1. 阶段 panel 整个隐藏 ─────────────────────────────────────────

test('v9 PR-E14: index.html .arena-phase-panel (原 .panel 含 phase-track) 加 id="arenaPhasePanel"', () => {
  assert.match(html, /<section class="panel arena-phase-panel" id="arenaPhasePanel">/);
});

test('v9 PR-E14: layout.css .arena-phase-panel display:none', () => {
  const block = layoutCss.match(/\.arena-phase-panel\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /display:\s*none/);
});

// ───── 2. 手牌截断修复 ────────────────────────────────────────────────

test('v9 PR-E14: .hand-dock 卡牌不再截断 (.duel-table 最后行 minmax(180, 1.2fr) 已给空间; PR-E17 改回 overflow:hidden)', () => {
  // PR-E14 originally overflow visible; PR-E17 changed back to hidden
  // because visible let .hand-actions 行的内容溢出影响其他区域. row min
  // 180 已给卡牌足够高度, 无需 visible.
  const block = layoutCss.match(/\.hand-dock\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /overflow:\s*hidden/);
});

test('v9 PR-E14: .duel-table grid 最后行 minmax(180px, 1.2fr) (留卡牌高度)', () => {
  const block = layoutCss.match(/\.duel-table\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /minmax\(180px,\s*1\.2fr\)/);
});

// ───── 3. side-log 恢复显示 ───────────────────────────────────────────

test('v9 PR-E14: zones.css .side-log-panel display:flex (恢复 PR-E12 隐藏)', () => {
  const block = zonesCss.match(/\.side-log-panel\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /display:\s*flex\s*!important/);
});

test('v9 PR-E14: layout.css .side-log-panel grid-column: 1 / -1 (跨 arena-zone 全宽)', () => {
  const block = layoutCss.match(/\.side-log-panel\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /grid-column:\s*1\s*\/\s*-1/);
});

// ───── 4. lord-badge 重定位 + 不挡 turn-badge ─────────────────────────

test('v9 PR-E14: hero.css .lord-badge / .rebel-badge 共享样式 (top:6 left:6 size 26)', () => {
  // 共享选择器: .lord-badge, .rebel-badge { ... }
  assert.match(heroCss, /\.lord-badge,\s*\n\s*\.rebel-badge\s*\{/);
  const block = heroCss.match(/\.lord-badge,\s*\n\s*\.rebel-badge\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /top:\s*6px/);
  assert.match(block[0], /left:\s*6px/);
  assert.match(block[0], /width:\s*26px/);
});

test('v9 PR-E14: hero.css .hero-head padding-left: 32px (给徽章留位)', () => {
  const block = heroCss.match(/\.hero-head\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /padding-left:\s*32px/);
});

// ───── 5. rebel-badge 元素 + JS 控制 ──────────────────────────────────

test('v9 PR-E14: index.html 含 .rebel-badge × 2 (player + enemy), 默认 hidden', () => {
  assert.match(html, /<span class="rebel-badge" id="enemyRebelBadge" hidden[^>]*>反</);
  assert.match(html, /<span class="rebel-badge" id="playerRebelBadge" hidden[^>]*>反</);
});

test('v9 PR-E14: hero.css .rebel-badge 独立规则 绿圆 background (radial-gradient #5fc77e)', () => {
  // 匹配独立 .rebel-badge { background: ... } 规则块 (不是 .lord-badge,.rebel-badge 共享)
  assert.match(heroCss, /\.rebel-badge\s*\{\s*\n\s*background:\s*radial-gradient[^}]*#5fc77e/);
});

test('v9 PR-E14: dom-adapter 缓存 playerRebelBadge / enemyRebelBadge', () => {
  ['playerRebelBadge', 'enemyRebelBadge'].forEach(function (id) {
    const re = new RegExp("'" + id + "'");
    assert.match(adapter, re, '应缓存 ' + id);
  });
});

test('v9 PR-E14: renderHero 据 roles[actor] === "反贼" 切换 rebelBadge.hidden', () => {
  const fn = adapter.match(/function renderHero\(actor\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /rebelBadge\.hidden\s*=\s*role\s*!==\s*['"]反贼['"]/);
  // lord 与 rebel 互斥
  assert.match(fn[0], /lordBadge\.hidden\s*=\s*role\s*!==\s*['"]主公['"]/);
});

// ───── 6. top-actions 移出 header + absolute 浮顶 ─────────────────────

test('v9 PR-E14: index.html .top-actions 从 <header> 内移出 (PR-E16 后整个删除)', () => {
  // PR-E14 把 .top-actions 移出 header (header 之后 sibling). PR-E16 整个删除.
  // header 内 / 整个 html 都不应再含 .top-actions.
  const headerBlock = html.match(/<header>[\s\S]*?<\/header>/);
  assert.ok(headerBlock);
  assert.doesNotMatch(headerBlock[0], /class="top-actions"/);
  assert.doesNotMatch(html, /<nav class="top-actions">/);
});

test('v9 PR-E14: controls.css .top-actions 规则已删除 (PR-E16; PR-E14 absolute → PR-E15 浮顶 → PR-E16 真删)', () => {
  assert.doesNotMatch(controlsCss, /\.top-actions\s*\{[\s\S]*?position:\s*absolute/);
});

test('v9 PR-E14: layout.css .game-frame position: relative (.top-actions absolute 锚)', () => {
  const block = layoutCss.match(/\.game-frame\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /position:\s*relative/);
});

// ───── turn-badge 默认 hidden ─────────────────────────────────────────

test('v9 PR-E14: renderStatus 仅 "当前回合" 时显示 turnBadge, 其余 hidden (避免 "电脑"/"玩家" 被 lord-badge 遮挡)', () => {
  const fn = adapter.match(/function renderStatus\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  // 仅 active 时设 textContent = '当前回合'
  assert.match(fn[0], /playerTurnBadge\.textContent\s*=\s*playerTurnActive\s*\?\s*['"]当前回合['"]\s*:\s*['"]['"]/);
  assert.match(fn[0], /enemyTurnBadge\.textContent\s*=\s*enemyTurnActive\s*\?\s*['"]当前回合['"]\s*:\s*['"]['"]/);
  // hidden 控制
  assert.match(fn[0], /playerTurnBadge\.hidden\s*=\s*!playerTurnActive/);
  assert.match(fn[0], /enemyTurnBadge\.hidden\s*=\s*!enemyTurnActive/);
});

// ───── 回归 ────────────────────────────────────────────────────────────

test('v9 PR-E14: loadAllStyles() 拼接含 .rebel-badge + .arena-phase-panel display:none', () => {
  assert.match(css, /\.rebel-badge\s*\{/);
  assert.match(css, /\.arena-phase-panel\s*\{[\s\S]*?display:\s*none/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
