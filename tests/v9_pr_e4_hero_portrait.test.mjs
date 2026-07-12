// v9 PR-E4 守护测试: 武将 portrait + HP 红方块 + 主公徽章 + 技能 framed tag.
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
const heroCss = fs.readFileSync(path.join(stylesDir, 'hero.css'), 'utf8');
const controlsCss = fs.readFileSync(path.join(stylesDir, 'controls.css'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── HP 红方块 ─────────────────────────────────────────────────────

test('v9 PR-E4: .heart 从原圆形改矩形块 (border-radius: 4px 不再 50%)', () => {
  const block = heroCss.match(/\.heart\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block, '.heart 块存在');
  assert.match(block[0], /border-radius:\s*4px/);
  assert.doesNotMatch(block[0], /border-radius:\s*50%/);
  // 矩形宽高
  assert.match(block[0], /width:\s*18px/);
  assert.match(block[0], /height:\s*22px/);
});

test('v9 PR-E4: .heart 用 linear-gradient 红色填充 + 多层 box-shadow 立体感', () => {
  const block = heroCss.match(/\.heart\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /background:\s*linear-gradient\([\s\S]*?#d52822/);
  // 多 box-shadow (inset + outer)
  assert.match(block[0], /inset[\s\S]*?,[\s\S]*?inset[\s\S]*?,/);
});

test('v9 PR-E4: .heart 隐藏 ♥ 字符 (font-size: 0 + color: transparent)', () => {
  const block = heroCss.match(/\.heart\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /font-size:\s*0/);
  assert.match(block[0], /color:\s*transparent/);
});

test('v9 PR-E4: .heart.empty 改 grayscale + brightness 弱化 + 灰 gradient', () => {
  const block = heroCss.match(/\.heart\.empty\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /filter:\s*grayscale\(1\)\s*brightness/);
  assert.match(block[0], /linear-gradient/);
});

// ───── 主公徽章 lord-badge ───────────────────────────────────────────

test('v9 PR-E4: hero.css 含 .lord-badge — 圆形 + 白边 + 红 radial-gradient + 绝对定位', () => {
  // PR-E14 把 position/size 等公共属性合并到 .lord-badge, .rebel-badge 共享规则,
  // 独立 .lord-badge 规则只剩 background. 改去整个 hero.css 范围内做断言.
  assert.match(heroCss, /\.lord-badge\s*\{/);
  // 绝对定位 (在共享规则块): 用 `.lord-badge,\n    .rebel-badge {` 匹配
  const shared = heroCss.match(/\.lord-badge,\s*\n\s*\.rebel-badge\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(shared, '共享规则块存在');
  assert.match(shared[0], /position:\s*absolute/);
  // PR-E14 改: top:6 left:6 (从 right 改 left, 避免 turn-badge 重叠)
  assert.match(shared[0], /top:\s*\d/);
  // 圆形 (共享)
  assert.match(shared[0], /border-radius:\s*50%/);
  // 白边 (共享)
  assert.match(shared[0], /border:\s*2px\s+solid\s+#fff4d0/);
  // 红 radial-gradient (独立 .lord-badge background)
  assert.match(heroCss, /\.lord-badge\s*\{\s*\n\s*background:\s*radial-gradient[^}]*#c12018/);
});

test('v9 PR-E4: .lord-badge[hidden] 用 display:none !important 强制隐藏', () => {
  // PR-E14 合并到 .lord-badge[hidden], .rebel-badge[hidden] { display: none !important }
  assert.match(heroCss, /\.lord-badge\[hidden\][\s\S]{0,80}display:\s*none\s*!important/);
});

test('v9 PR-E4: index.html 两个 hero 元素都有 lord-badge (player + enemy)', () => {
  assert.match(html, /id="playerLordBadge"[^>]*hidden[^>]*>主<\/span>/);
  assert.match(html, /id="enemyLordBadge"[^>]*hidden[^>]*>主<\/span>/);
  // 必须在 .hero 元素内 (player + enemy)
  assert.match(html, /<article class="hero enemy"[\s\S]{0,300}id="enemyLordBadge"/);
  assert.match(html, /<article class="hero player"[\s\S]{0,300}id="playerLordBadge"/);
});

test('v9 PR-E4: dom-adapter 缓存 playerLordBadge + enemyLordBadge', () => {
  assert.match(adapter, /'playerLordBadge'/);
  assert.match(adapter, /'enemyLordBadge'/);
});

test('v9 PR-E4: renderHero 根据 game.roles[actor] === "主公" 切换 lordBadge.hidden', () => {
  // renderHero 函数体应含 lordBadge logic
  const renderFn = adapter.match(/function renderHero\(actor\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(renderFn);
  assert.match(renderFn[0], /els\[actor \+ 'LordBadge'\]/);
  assert.match(renderFn[0], /game\.roles\[actor\]\s*===\s*'主公'/);
});

// ───── skill-button 橙色 framed tag ──────────────────────────────────

test('v9 PR-E4: controls.css .skill-button 重设计为橙色 gradient + 棕 border', () => {
  const block = controlsCss.match(/^\s*\.skill-button\s*\{[\s\S]*?\n\s{4}\}/m);
  assert.ok(block, '.skill-button 块存在');
  // 橙色 gradient
  assert.match(block[0], /background:\s*linear-gradient\([\s\S]*?#c25a1a/);
  // 棕色 border
  assert.match(block[0], /border:\s*1px\s+solid\s+#5b2f15/);
  // 浅文本色
  assert.match(block[0], /color:\s*#fff4d0/);
});

test('v9 PR-E4: .skill-button 有 :hover (brightness + transform) + :disabled (opacity)', () => {
  assert.match(controlsCss, /\.skill-button:hover/);
  assert.match(controlsCss, /\.skill-button:disabled/);
});

test('v9 PR-E4: .skill-status-todo / -display / -implemented 保留 (向后兼容)', () => {
  assert.match(controlsCss, /\.skill-button\.skill-status-todo\s*\{/);
  assert.match(controlsCss, /\.skill-button\.skill-status-display\s*\{/);
  assert.match(controlsCss, /\.skill-button\.skill-status-implemented\s*\{/);
});

// ───── 全套回归 ──────────────────────────────────────────────────────

test('v9 PR-E4: loadAllStyles() 拼接结果含新 hero 视觉规则', () => {
  assert.match(css, /\.lord-badge\s*\{/);
  assert.match(css, /\.heart\s*\{/);
  assert.match(css, /\.skill-button\s*\{/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
