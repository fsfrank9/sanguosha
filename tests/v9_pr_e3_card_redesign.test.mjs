// v9 PR-E3 守护测试: 卡牌外观重设计 — cream 卡身 + 棕框 + 左上 corner
// (rank 在上, suit 在下) + 中央名字 + 底部右下类型 badge.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllStyles } from './helpers/load-styles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylesDir = path.join(root, 'src', 'styles');
const css = loadAllStyles();
const adapter = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8');
const cards = fs.readFileSync(path.join(stylesDir, 'cards.css'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── CSS 卡身 ──────────────────────────────────────────────────────

test('v9 PR-E3: .card 改 cream/yellow base background (linear-gradient #fff5d4 → #e3c577)', () => {
  const block = cards.match(/^\s*\.card\s*\{[\s\S]*?\n\s{4}\}/m);
  assert.ok(block, '.card 块存在');
  // cream gradient
  assert.match(block[0], /background:\s*linear-gradient\([\s\S]*#fff5d4/);
  assert.match(block[0], /#e3c577/);
});

test('v9 PR-E3: .card 加棕色 border + 双层 inset box-shadow (装饰框)', () => {
  const block = cards.match(/^\s*\.card\s*\{[\s\S]*?\n\s{4}\}/m);
  assert.ok(block);
  // 棕色 border
  assert.match(block[0], /border:\s*2px\s+solid\s+#5b2f15/);
  // 双层 inset box-shadow (装饰边缘)
  assert.match(block[0], /inset 0 0 0 1px[\s\S]*?,[\s\S]*?inset 0 0 0 3px/);
});

test('v9 PR-E3: 所有 group (attack/defense/heal/trick/buff) 都用 cream bg (覆写旧 dark gradient)', () => {
  // 集合选择器: 5 个 group 共享同一 cream gradient
  assert.match(
    cards,
    /\.card\.attack,\s*\.card\.defense,\s*\.card\.heal,\s*\.card\.trick,\s*\.card\.buff\s*\{[\s\S]*?background:\s*linear-gradient/
  );
});

test('v9 PR-E3: .card::before 被禁用 (content: none) — 旧黄色圆装饰不再适合 cream bg', () => {
  assert.match(cards, /\.card::before\s*\{[\s\S]*?content:\s*none/);
});

// ───── corner 列式排列 ───────────────────────────────────────────────

test('v9 PR-E3: .card-corner 改 左上 (left: ...) + flex-direction: column', () => {
  const block = cards.match(/\.card-corner\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block, '.card-corner 块存在');
  // 左上而非右上 — 必有 left:, right: auto
  assert.match(block[0], /left:\s*\d/);
  assert.match(block[0], /right:\s*auto/);
  // 列排
  assert.match(block[0], /flex-direction:\s*column/);
});

test('v9 PR-E3: cards.css 含 .card-corner__rank + .card-corner__suit 子样式', () => {
  assert.match(cards, /\.card-corner__rank\s*\{/);
  assert.match(cards, /\.card-corner__suit\s*\{/);
});

test('v9 PR-E3: .card 内 suit-red / suit-black 覆写为深色 (cream bg)', () => {
  // .card .suit-red { color: #c... } (深红)
  assert.match(cards, /\.card\s+\.suit-red\s*\{[\s\S]*?color:\s*#c4172a/);
  // .card .suit-black { color: #1... } (近黑)
  assert.match(cards, /\.card\s+\.suit-black\s*\{[\s\S]*?color:\s*#1a1a1a/);
});

test('v9 PR-E3: 根 .suit-red 仍是亮红 (mini-card-suit 在 dark bg 用) — 守 v8 PR-0', () => {
  // v8 PR-0 旧测试要求 .suit-red 颜色含 #ff…
  assert.match(cards, /^\s{4}\.suit-red\s*\{[^}]*color:\s*#ff7878/m);
});

// ───── 中央名字 + 底部 badge ─────────────────────────────────────────

test('v9 PR-E3: .card-name 绝对定位居中 (top:50% + left:50% + translate)', () => {
  const block = cards.match(/\.card-name\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /position:\s*absolute/);
  assert.match(block[0], /top:\s*50%/);
  assert.match(block[0], /left:\s*50%/);
  assert.match(block[0], /transform:\s*translate\(-50%,\s*-50%\)/);
});

test('v9 PR-E3: .card-type 底部右下 badge (bottom + right) + 5 group 颜色变体', () => {
  const block = cards.match(/^\s*\.card-type\s*\{[\s\S]*?\n\s{4}\}/m);
  assert.ok(block, '.card-type 块存在');
  assert.match(block[0], /position:\s*absolute/);
  assert.match(block[0], /bottom:/);
  assert.match(block[0], /right:/);
  // 5 group 颜色变体
  assert.match(cards, /\.card\.attack\s+\.card-type\s*\{/);
  assert.match(cards, /\.card\.defense\s+\.card-type\s*\{/);
  assert.match(cards, /\.card\.heal\s+\.card-type\s*\{/);
  assert.match(cards, /\.card\.trick\s+\.card-type\s*\{/);
  assert.match(cards, /\.card\.buff\s+\.card-type\s*\{/);
});

// ───── dom-adapter suitRankBadge 重构 ───────────────────────────────

test('v9 PR-E3: suitRankBadge 输出嵌套 span (.card-corner__rank + __suit)', () => {
  // suitRankBadge 函数应当输出含 card-corner__rank / card-corner__suit
  const fnMatch = adapter.match(/function suitRankBadge\([\s\S]*?\n\s{6}\}/);
  assert.ok(fnMatch);
  assert.match(fnMatch[0], /card-corner__rank/);
  assert.match(fnMatch[0], /card-corner__suit/);
});

test('v9 PR-E3: suitRankBadge 仍保留 .card-corner + suit-red/black 顶层 class (向后兼容)', () => {
  const fnMatch = adapter.match(/function suitRankBadge\([\s\S]*?\n\s{6}\}/);
  assert.ok(fnMatch);
  assert.match(fnMatch[0], /['"]card-corner /);  // 顶层 class
  assert.match(fnMatch[0], /suitColorClass/);    // 仍调用顶层 color helper
});

// ───── 选中态 + 全套回归 ─────────────────────────────────────────────

test('v9 PR-E3: .card.discard-selected 用红色 outline + 浮起 + shadow', () => {
  const block = cards.match(/\.card\.discard-selected\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /outline:\s*3px\s+solid\s+#ff5656/);
  assert.match(block[0], /transform:\s*translateY\(-10px\)/);
});

test('v9 PR-E3: loadAllStyles() 拼接结果含新 cream card 规则 (回归)', () => {
  assert.match(css, /\.card-corner__rank\s*\{/);
  assert.match(css, /\.card\s+\.suit-red\s*\{/);
  assert.match(css, /\.card\.attack\s+\.card-type\s*\{/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
