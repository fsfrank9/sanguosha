// v9 PR-E24 守护测试: 响应/技能面板候选两步化 (batch 2).
// 用户要求"全部统一两步". batch 1 (PR-E23) 已做 target/huogong.
// 本 PR: guicai/fankui/fanjian/qilin/cixiongChoose/guohe/wugu/dyingRescue
// 8 个面板的候选点击改为 stage (kind:'pending'), #handConfirmBtn 才
// Engine.resolvePendingChoice.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adapter = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── 8 个响应/技能面板候选改 stage ─────────────────────────────────

const stageModals = [
  { name: 'guicai',       container: 'guicaiCandidates' },
  { name: 'fankui',       container: 'fankuiZones' },
  { name: 'qilin',        container: 'qilinPickChoices' },
  { name: 'cixiongChoose', container: 'cixiongChooseChoices' },
  { name: 'wugu',         container: 'wuguPickChoices' },
  { name: 'dyingRescue',  container: 'dyingRescueChoices' }
];
stageModals.forEach(function (m) {
  test('v9 PR-E24: ' + m.container + ' click → stage (kind:pending) 不再直接 resolve', () => {
    // 取 addEventListener 之后 600 char 窗口 (覆盖整个 handler body).
    const win = adapter.match(new RegExp('els\\.' + m.container + '\\.addEventListener\\(\'click\',[\\s\\S]{0,600}'));
    assert.ok(win, m.container + ' 监听器存在');
    assert.match(win[0], /stagedModalChoice\s*=\s*\{[\s\S]*?kind:\s*'pending'/);
    assert.match(win[0], /selector:/);
    // 点击 handler 前 360 char 内不再直接 resolvePendingChoice
    const head = win[0].slice(0, 360);
    assert.doesNotMatch(head, /Engine\.resolvePendingChoice/);
  });
});

test('v9 PR-E24: fanjian 4 花色按钮 click → stage (kind:pending, payload.suit)', () => {
  // 从 .forEach(function (key) 取 500 char 窗口 (覆盖 forEach 体).
  const block = adapter.match(/\]\.forEach\(function \(key\)[\s\S]{0,500}/);
  assert.ok(block);
  assert.match(block[0], /stagedModalChoice\s*=\s*\{[\s\S]*?kind:\s*'pending'[\s\S]*?suit:\s*suit/);
  assert.doesNotMatch(block[0], /Engine\.resolvePendingChoice/);
});

test('v9 PR-E24: handleGuohePickClick → stage (kind:pending, payload {zone, cardId})', () => {
  const fn = adapter.match(/function handleGuohePickClick\(event\)\s*\{[\s\S]*?\n\s{8}\}/);
  assert.ok(fn);
  assert.match(fn[0], /stagedModalChoice\s*=\s*\{[\s\S]*?kind:\s*'pending'/);
  assert.doesNotMatch(fn[0], /Engine\.resolvePendingChoice/);
});

// ───── _handConfirm 处理 'pending' kind ──────────────────────────────

test('v9 PR-E24: _handConfirm pending kind → Engine.resolvePendingChoice(staged.payload)', () => {
  const fn = adapter.match(/function _handConfirm\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /staged\.kind\s*===\s*'pending'/);
  assert.match(fn[0], /Engine\.resolvePendingChoice\(game,\s*staged\.payload\)/);
});

// ───── _anyModalVisible 完整面板检测 ─────────────────────────────────

test('v9 PR-E24: _anyModalVisible 覆盖 pending-prompt-panel + 旧 mode-panel + scroll-modal', () => {
  const fn = adapter.match(/function _anyModalVisible\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /pending-prompt-panel:not\(\[hidden\]\)/);
  assert.match(fn[0], /tiesuo-mode-panel:not\(\[hidden\]\)/);
  assert.match(fn[0], /scroll-modal:not\(\[hidden\]\)/);
});

// ───── render 重套 staged 高亮 ───────────────────────────────────────

test('v9 PR-E24: render 调 _reapplyStagedHighlight (重建候选 DOM 后重套高亮)', () => {
  const fn = adapter.match(/function render\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /_reapplyStagedHighlight\(\)/);
  // _reapplyStagedHighlight 据 selector 查 DOM
  const reapply = adapter.match(/function _reapplyStagedHighlight\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(reapply);
  assert.match(reapply[0], /stagedModalChoice\.selector/);
});

test('v9 PR-E24: render 清掉 stale 的 staged (pendingChoice 已消失时)', () => {
  const fn = adapter.match(/function render\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /stagedModalChoice\.kind\s*===\s*'pending'[\s\S]{0,120}getPendingChoice/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
