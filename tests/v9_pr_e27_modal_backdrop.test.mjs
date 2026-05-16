// v9 PR-E27 守护测试: 修 pending-prompt-panel backdrop 挡住 hand-actions 按钮.
// 用户反馈: 闪响应面板候选选了用不了, 只能点"不出". 根因 —
// .pending-prompt-panel::before 全屏 backdrop (pointer-events:auto) 盖在
// .hand-dock 之上, 把 #handConfirmBtn / #handCancelBtn 点击拦截了.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllStyles } from './helpers/load-styles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = loadAllStyles();
const modalsCss = fs.readFileSync(path.join(root, 'src/styles/modals.css'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v9 PR-E27: .pending-prompt-panel::before backdrop pointer-events: none (不再拦截点击)', () => {
  const block = modalsCss.match(/\.pending-prompt-panel::before\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block, '.pending-prompt-panel::before 规则存在');
  assert.match(block[0], /pointer-events:\s*none/);
  assert.doesNotMatch(block[0], /pointer-events:\s*auto/);
});

test('v9 PR-E27: backdrop 仍保留视觉 dim + blur (仅改 pointer-events)', () => {
  const block = modalsCss.match(/\.pending-prompt-panel::before\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /background:\s*rgba\(0,\s*0,\s*0/);
  assert.match(block[0], /backdrop-filter:\s*blur/);
});

test('v9 PR-E27: loadAllStyles() 拼接含改后的 backdrop 规则', () => {
  assert.match(css, /\.pending-prompt-panel::before\s*\{[\s\S]*?pointer-events:\s*none/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
