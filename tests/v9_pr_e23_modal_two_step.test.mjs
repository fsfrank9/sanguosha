// v9 PR-E23 守护测试: 二级面板两步化 + 修 modal 误点 bug.
// 用户反馈: "很多牌使用时不走确认/取消按钮, 直接打出". 审计发现:
//   1. 二级面板 (目标选择 / 火攻弃牌) 点候选直接 resolve, 不走 confirm
//   2. bug: 二级面板开着时误点手牌 → 那张牌直接打出
// 本 PR: target / huogong 候选点击改为 stage (高亮), #handConfirmBtn 才 resolve;
//        modal 打开时点手牌被忽略.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllStyles } from './helpers/load-styles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = loadAllStyles();
// v11 B2: 目标区域/火攻成本面板已迁往 mode-panels.js, 源拼接。
const adapter = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(root, 'src/ui/panels/mode-panels.js'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── 1. modal 误点 bug 修复 ────────────────────────────────────────

test('v9 PR-E23: playerHand click — 有 visible modal 时直接 return (忽略手牌点击)', () => {
  const handler = adapter.match(/els\.playerHand\.addEventListener\('click',\s*function[\s\S]*?\n\s{8}\}\);/);
  assert.ok(handler);
  // v9 PR-E24: 守护从 _firstVisibleDispatch 改为 _anyModalVisible (覆盖全部面板).
  assert.match(handler[0], /if\s*\(_anyModalVisible\(\)\)\s*return;/);
});

// ───── 2. stagedModalChoice 状态 ─────────────────────────────────────

test('v9 PR-E23: dom-adapter 含 stagedModalChoice 状态变量', () => {
  assert.match(adapter, /var stagedModalChoice\s*=\s*null/);
});

test('v9 PR-E23: targetCardChoices 点击改为 stage (不再直接 resolveTargetCard)', () => {
  const handler = adapter.match(/els\.targetCardChoices\.addEventListener\('click',\s*function[\s\S]*?\n {6}\}\);/);
  assert.ok(handler);
  // v11 B2: 面板模块内经 setStaged() 写入。
  assert.match(handler[0], /setStaged\(\{[\s\S]*?kind:\s*'target'/);
  assert.match(handler[0], /_highlightStaged/);
  // 不再在点击时直接 resolve
  assert.doesNotMatch(handler[0], /resolveTargetCard\(/);
});

test('v9 PR-E23: huogongCostChoices 点击改为 stage (不再直接 resolveHuogong)', () => {
  const handler = adapter.match(/els\.huogongCostChoices\.addEventListener\('click',\s*function[\s\S]*?\n {6}\}\);/);
  assert.ok(handler);
  // v11 B2: 面板模块内经 setStaged() 写入。
  assert.match(handler[0], /setStaged\(\{[\s\S]*?kind:\s*'huogong'/);
  assert.match(handler[0], /_highlightStaged/);
  assert.doesNotMatch(handler[0], /resolveHuogong\(/);
});

// ───── 3. _handConfirm / _handCancel 处理 staged ─────────────────────

test('v9 PR-E23: _handConfirm 提交 stagedModalChoice (target → resolveTargetCard, huogong → resolveHuogong)', () => {
  const fn = adapter.match(/function _handConfirm\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /if\s*\(stagedModalChoice\)/);
  assert.match(fn[0], /staged\.kind\s*===\s*'target'[\s\S]*?resolveTargetCard/);
  assert.match(fn[0], /staged\.kind\s*===\s*'huogong'[\s\S]*?resolveHuogong/);
});

test('v9 PR-E23: _handCancel 撤销 stagedModalChoice (面板保持打开)', () => {
  const fn = adapter.match(/function _handCancel\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /if\s*\(stagedModalChoice\)\s*\{[\s\S]*?stagedModalChoice\s*=\s*null/);
});

test('v9 PR-E23: renderStatus — stagedModalChoice 存在时 confirm/cancel 按钮启用', () => {
  const fn = adapter.match(/function renderStatus\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /if\s*\(stagedModalChoice\)\s*\{[\s\S]*?canConfirm\s*=\s*true/);
});

test('v9 PR-E23: _highlightStaged 工具函数 — 切候选 .is-staged 高亮', () => {
  const fn = adapter.match(/function _highlightStaged\([\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /is-staged/);
});

// ───── 4. CSS ────────────────────────────────────────────────────────

test('v9 PR-E23: modals.css 含 .is-staged 金色描边高亮', () => {
  assert.match(css, /\.target-card-choice\.is-staged[\s\S]{0,160}outline:\s*3px\s+solid/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
