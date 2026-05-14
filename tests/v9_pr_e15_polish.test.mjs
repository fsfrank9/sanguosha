// v9 PR-E15 守护测试: PR-E14 合并后用户截图反馈 5 处 polish.
// 用户反馈:
//   1. "重新选将 / 结束出牌" 位置应在我的角色卡上面一点
//   2. 角色卡内 "手牌"/"状态" stat-grid 文字半截显示, 信息冗余 → 隐藏
//   3. 底部数字应在武将技能卡最右边往上一点 (deck info)
//   4. 右下角时间没必要 → 删除
//   5. 菜单/分享按钮再往外一点
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

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── 1. top-actions 重定位到角色卡上方 ───────────────────────────────

test('v9 PR-E15: controls.css .top-actions 改 bottom 定位 (top:auto, bottom 约 320px, right 28)', () => {
  const block = controlsCss.match(/\.top-actions\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /top:\s*auto/);
  assert.match(block[0], /bottom:\s*320px/);
  assert.match(block[0], /right:\s*28px/);
});

// ───── 2. stat-grid 隐藏 ──────────────────────────────────────────────

test('v9 PR-E15: hero.css .stat-grid display:none (手牌/状态信息冗余)', () => {
  const block = heroCss.match(/\.stat-grid\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /display:\s*none/);
});

// ───── 3. deck info 移到玩家技能 panel-title 右侧 ──────────────────────

test('v9 PR-E15: index.html 玩家技能 panel-title 加 #playerSkillDeckInfo badge', () => {
  // panel-title 含 span "武将技能" + badge id="playerSkillDeckInfo"
  assert.match(html, /<span>武将技能<\/span>[\s\S]{0,300}id="playerSkillDeckInfo"/);
  assert.match(html, /id="playerSkillDeckInfo"[^>]*>牌堆\s*0\s*·\s*弃牌\s*0</);
});

test('v9 PR-E15: dom-adapter 缓存 playerSkillDeckInfo + renderStatus 写入', () => {
  assert.match(adapter, /'playerSkillDeckInfo'/);
  const fn = adapter.match(/function renderStatus\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /playerSkillDeckInfo\.textContent\s*=\s*deckText/);
});

// ───── 4. time 删除 ───────────────────────────────────────────────────

test('v9 PR-E15: layout.css .status-bar__time display:none (与 version/score 一同隐藏)', () => {
  // 现在 3 个 selector 共享同一规则 (display: none)
  assert.match(layoutCss, /\.status-bar__version,\s*\n\s*\.status-bar__score,\s*\n\s*\.status-bar__time\s*\{[\s\S]{0,80}display:\s*none/);
});

// ───── 5. frame-corner-btn 再往外 ─────────────────────────────────────

test('v9 PR-E15: .frame-corner-btn--menu / --share 位置 top:-8 + left/right:6 (更靠外)', () => {
  const menu = layoutCss.match(/\.frame-corner-btn--menu\s*\{[\s\S]*?\n\s{4}\}/);
  const share = layoutCss.match(/\.frame-corner-btn--share\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(menu && share);
  assert.match(menu[0], /top:\s*-8px/);
  assert.match(menu[0], /left:\s*6px/);
  assert.match(share[0], /top:\s*-8px/);
  assert.match(share[0], /right:\s*6px/);
});

// ───── 回归 ────────────────────────────────────────────────────────────

test('v9 PR-E15: loadAllStyles() 拼接含 .stat-grid display:none + .top-actions 新定位', () => {
  assert.match(css, /\.stat-grid\s*\{[\s\S]*?display:\s*none/);
  assert.match(css, /\.top-actions\s*\{[\s\S]*?bottom:\s*320px/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
