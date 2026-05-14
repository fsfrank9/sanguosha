// v9 PR-E6 守护测试: pendingChoice 13 个面板视觉统一升级为 center fixed
// 卷轴风 modal (cream paper + backdrop + 升级 prompt-card-choice / btn.small).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllStyles } from './helpers/load-styles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylesDir = path.join(root, 'src', 'styles');
const css = loadAllStyles();
const modalsCss = fs.readFileSync(path.join(stylesDir, 'modals.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── .pending-prompt-panel 升级 ────────────────────────────────────

test('v9 PR-E6: .pending-prompt-panel 改 position: fixed 居中 (top:50% left:50% translate)', () => {
  const block = modalsCss.match(/^\s*\.pending-prompt-panel\s*\{[\s\S]*?\n\s{4}\}/m);
  assert.ok(block, '.pending-prompt-panel 块存在');
  assert.match(block[0], /position:\s*fixed/);
  assert.match(block[0], /top:\s*50%/);
  assert.match(block[0], /left:\s*50%/);
  assert.match(block[0], /transform:\s*translate\(-50%,\s*-50%\)/);
  // z-index 上层
  assert.match(block[0], /z-index:\s*\d+/);
});

test('v9 PR-E6: .pending-prompt-panel 改 cream paper bg + 棕红 border', () => {
  const block = modalsCss.match(/^\s*\.pending-prompt-panel\s*\{[\s\S]*?\n\s{4}\}/m);
  assert.ok(block);
  // cream gradient (与 .scroll-modal__paper 同色板)
  assert.match(block[0], /linear-gradient[\s\S]*?#fef0c8/);
  assert.match(block[0], /#f5dca0/);
  // 棕红 border
  assert.match(block[0], /border:\s*1px\s+solid\s+#b27632/);
});

test('v9 PR-E6: .pending-prompt-panel::before backdrop (dim + blur 全屏)', () => {
  assert.match(modalsCss, /\.pending-prompt-panel::before\s*\{/);
  const block = modalsCss.match(/\.pending-prompt-panel::before\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  // fixed 全屏 + 暗黑 + blur
  assert.match(block[0], /position:\s*fixed/);
  assert.match(block[0], /inset:\s*0/);
  assert.match(block[0], /background:\s*rgba\(0,\s*0,\s*0,\s*\.45\)/);
  assert.match(block[0], /backdrop-filter:\s*blur/);
});

test('v9 PR-E6: .pending-prompt-panel__hint 改深红大字居中 + 下方虚线分隔', () => {
  const block = modalsCss.match(/\.pending-prompt-panel__hint\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /color:\s*#7a3a14/);
  assert.match(block[0], /text-align:\s*center/);
  assert.match(block[0], /border-bottom:[\s\S]*?dashed/);
});

test('v9 PR-E6: .pending-prompt-panel__choices/actions 改 flex 100% + 居中', () => {
  // choices
  const choicesBlock = modalsCss.match(/\.pending-prompt-panel__choices\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(choicesBlock);
  assert.match(choicesBlock[0], /flex:\s*1\s+1\s+100%/);
  assert.match(choicesBlock[0], /justify-content:\s*center/);
  // actions
  const actionsBlock = modalsCss.match(/\.pending-prompt-panel__actions\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(actionsBlock);
  assert.match(actionsBlock[0], /flex:\s*1\s+1\s+100%/);
  assert.match(actionsBlock[0], /justify-content:\s*center/);
});

// ───── prompt-card-choice 升级 ───────────────────────────────────────

test('v9 PR-E6: .prompt-card-choice 改 cream-on-cream 风 (背景 + 深棕 border + 深色字)', () => {
  const block = modalsCss.match(/^\s*\.prompt-card-choice\s*\{[\s\S]*?\n\s{4}\}/m);
  assert.ok(block);
  assert.match(block[0], /linear-gradient[\s\S]*?#fff5d4[\s\S]*?#f0c878/);
  assert.match(block[0], /border:\s*1px\s+solid\s+#8e5824/);
  assert.match(block[0], /color:\s*#3a2010/);
});

test('v9 PR-E6: .prompt-card-choice.selected 高亮金 (深 gradient + 浅文本 + 棕 border)', () => {
  const block = modalsCss.match(/\.prompt-card-choice\.selected\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /linear-gradient[\s\S]*?#ffd68a[\s\S]*?#d88427/);
  assert.match(block[0], /color:\s*#fff4d0/);
});

// ───── pending panel 范围 .btn.small 升级 .badge / .mini-card 覆写 ─

test('v9 PR-E6: .pending-prompt-panel .btn.small 升级为小 .btn-frame 风 (橙 gradient + 棕 border + 大字)', () => {
  const block = modalsCss.match(/\.pending-prompt-panel\s+\.btn\.small\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block, '面板内 .btn.small 升级块存在');
  assert.match(block[0], /linear-gradient[\s\S]*?#c25a1a/);
  assert.match(block[0], /border:\s*2px\s+solid\s+#5b2f15/);
  assert.match(block[0], /font-weight:\s*900/);
});

test('v9 PR-E6: 面板范围内 .badge / .mini-card 改深色 (适配 cream bg)', () => {
  // .pending-prompt-panel .badge
  const badgeBlock = modalsCss.match(/\.pending-prompt-panel\s+\.badge\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(badgeBlock);
  assert.match(badgeBlock[0], /color:\s*#5b2f15/);
  // .pending-prompt-panel .mini-card
  const miniBlock = modalsCss.match(/\.pending-prompt-panel\s+\.mini-card\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(miniBlock);
  assert.match(miniBlock[0], /border:\s*1px\s+solid\s+#b27632/);
  assert.match(miniBlock[0], /color:\s*#3a2010/);
});

// ───── 13 个面板都还在 HTML (向后兼容) ───────────────────────────────

test('v9 PR-E6: 13 个 pending-prompt-panel 元素都还在 (HTML 结构不动)', () => {
  ['guicaiPromptPanel', 'yijiPromptPanel', 'fanjianPromptPanel', 'fankuiPromptPanel',
   'gangliePromptPanel', 'ganglieSourcePanel', 'qilinPickPanel', 'dyingRescuePanel',
   'cixiongFirePanel', 'cixiongChoosePanel', 'jiedaoDecisionPanel', 'guohePickPanel',
   'wuguPickPanel', 'luoshenPromptPanel'].forEach(function (id) {
    const re = new RegExp('id="' + id + '"');
    assert.match(html, re, '应仍含 ' + id);
  });
});

test('v9 PR-E6: 13 个面板都还有 .pending-prompt-panel class (复用框架)', () => {
  // 用全局正则数 pending-prompt-panel" 出现次数 — 应该 >= 13 (HTML 中)
  const count = (html.match(/class="[^"]*pending-prompt-panel[^"]*"/g) || []).length;
  assert.ok(count >= 13, '至少 13 个 .pending-prompt-panel 元素, 找到 ' + count);
});

// ───── [hidden] override 仍生效 (守 HOTFIX #60) ──────────────────────

test('v9 PR-E6: .pending-prompt-panel[hidden] 仍 display:none !important (守 HOTFIX #60)', () => {
  // 把所有 [hidden] override 块捞出来, 必含 .pending-prompt-panel[hidden]
  assert.match(modalsCss, /\.pending-prompt-panel\[hidden\]\s*\{[\s\S]*?display:\s*none\s*!important/);
});

// ───── 全套回归 ──────────────────────────────────────────────────────

test('v9 PR-E6: loadAllStyles() 拼接结果含升级后的 pending 规则', () => {
  assert.match(css, /\.pending-prompt-panel\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(css, /\.pending-prompt-panel::before\s*\{/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
