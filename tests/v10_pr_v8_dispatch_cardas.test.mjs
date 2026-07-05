// v10 V8 守护: PENDING_MODAL_DISPATCH 补齐 6 缺口面板 + conversion 走 stage-then-confirm
// (card-as 一致性). _handConfirm / _handCancel 在 modal 命中时 必 return 不下穿.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// v11 B2: 转化面板已迁往 mode-panels.js, adapter 源为主文件 + 模式面板拼接。
const adapter = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(root, 'src/ui/panels/mode-panels.js'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── dispatch 注册表补齐 ───────────────────────────────────────────

test('v10 V8: dispatch 表新增 dyingRescuePanel (cancel=DeclineBtn — 唯一有真 decline 语义)', () => {
  assert.match(adapter, /panelId:\s*'dyingRescuePanel'[\s\S]{0,120}cancelBtnId:\s*'dyingRescueDeclineBtn'/);
});

test('v10 V8: dispatch 表新增 5 个必选面板 stub 条目 (fanjian/fankui/wugu/guohe/cixiongChoose)', () => {
  ['fanjianPromptPanel', 'fankuiPromptPanel', 'wuguPickPanel', 'guohePickPanel'].forEach(function (panelId) {
    const re = new RegExp("panelId:\\s*'" + panelId + "'");
    assert.match(adapter, re, panelId + ' 应入册');
  });
  // cixiongChoosePanel 用 drawBtn 作 cancel 等效 (语义 "另一选项" 但作 dispatch fall-back)
  assert.match(adapter, /panelId:\s*'cixiongChoosePanel'[\s\S]{0,120}cancelBtnId:\s*'cixiongChooseDrawBtn'/);
});

test('v10 V8: 总 dispatch 条目数 ≥ 24 (V6 时 18 + V8 +6 = 24)', () => {
  // 用 regex 计数 panelId:
  const matches = adapter.match(/panelId:\s*'[A-Za-z]+'/g);
  assert.ok(matches);
  assert.ok(matches.length >= 24, '当前 ' + matches.length + ' 条, 期望 ≥ 24');
});

// ───── _handConfirm / _handCancel 不下穿 ─────────────────────────────

test('v10 V8: _handConfirm 命中 dispatch → 必 return (不 fall-through 到弃牌/手牌)', () => {
  const fn = adapter.match(/function _handConfirm\(\)\s*\{[\s\S]*?\n {6}\}/);
  assert.ok(fn);
  // 旧形态: if (dispatch && _clickIfEnabled(...)) return;
  // V8 形态: if (dispatch) { _clickIfEnabled(...); return; }  ← 无论 btn 是否能点都 return
  assert.match(fn[0], /if\s*\(dispatch\)\s*\{[\s\S]{0,150}_clickIfEnabled\(dispatch\.confirmBtnId\);\s*\n\s*return;/);
});

test('v10 V8: _handCancel 命中 dispatch → 必 return (不 fall-through 到手牌选中清理)', () => {
  const fn = adapter.match(/function _handCancel\(\)\s*\{[\s\S]*?\n {6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /if\s*\(dispatch\)\s*\{[\s\S]{0,150}_clickIfEnabled\(dispatch\.cancelBtnId\);\s*\n\s*return;/);
});

// ───── conversion 走 stage-then-confirm (card-as 一致性) ──────────────

test('v10 V8: conversionNormalBtn / conversionShaBtn click → stage (kind:conversion, asSha:false/true)', () => {
  // 必须是 stage 写入而非直接 resolveConversion 调用
  // v11 B2: 面板模块内经 setStaged() 写入 (语义同 stagedModalChoice 赋值)。
  assert.match(adapter, /els\.conversionNormalBtn\.addEventListener\([\s\S]{0,400}setStaged\(\{\s*kind:\s*'conversion',\s*asSha:\s*false\s*\}\)/);
  assert.match(adapter, /els\.conversionShaBtn\.addEventListener\([\s\S]{0,400}setStaged\(\{\s*kind:\s*'conversion',\s*asSha:\s*true\s*\}\)/);
});

test('v10 V8: _handConfirm stage 提交分支处理 kind=conversion → resolveConversion(staged.asSha)', () => {
  const fn = adapter.match(/function _handConfirm\(\)\s*\{[\s\S]*?\n {6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /staged\.kind\s*===\s*'conversion'/);
  assert.match(fn[0], /resolveConversion\(staged\.asSha\)/);
});

test('v10 V8: hideConversionPanel 与 hideTargetZonePanel / hideHuogongPanel 对称 — 清 staged conversion', () => {
  const fn = adapter.match(/function hideConversionPanel\(\)\s*\{[\s\S]*?\n {4}\}/);
  assert.ok(fn);
  // v11 B2: 面板模块内经 getStaged/setStaged 访问。
  assert.match(fn[0], /getStaged\(\)\.kind\s*===\s*'conversion'/);
  assert.match(fn[0], /setStaged\(null\)/);
});

test('v10 V8: 直接 resolveConversion 调用从 click handler 中清除 (改为 stage)', () => {
  // 不应再有 conversionNormalBtn ... resolveConversion(false) 直接调用 pattern
  assert.doesNotMatch(adapter, /els\.conversionNormalBtn\.addEventListener\([^)]*\{[^}]*resolveConversion\(false\)/);
  assert.doesNotMatch(adapter, /els\.conversionShaBtn\.addEventListener\([^)]*\{[^}]*resolveConversion\(true\)/);
});

// ───── 回归 ──────────────────────────────────────────────────────────

test('v10 V8 回归: 旧 dispatch 18 条 (V6) 全部保留', () => {
  // 检查 V6 已有的关键条目
  ['shanResponsePanel', 'wuxieResponsePanel', 'duelResponsePanel',
   'luoshenPromptPanel', 'guanxingModePanel', 'zhihengModePanel',
   'conversionModePanel', 'targetZonePanel', 'exitConfirmModal'].forEach(function (panelId) {
    const re = new RegExp("panelId:\\s*'" + panelId + "'");
    assert.match(adapter, re, panelId + ' 旧条目应保留');
  });
});

test('v10 V8 回归: _handConfirm 仍处理 stage 4 种 (target/huogong/conversion/pending)', () => {
  const fn = adapter.match(/function _handConfirm\(\)\s*\{[\s\S]*?\n {6}\}/);
  assert.ok(fn);
  ['target', 'huogong', 'conversion', 'pending'].forEach(function (kind) {
    const re = new RegExp("staged\\.kind\\s*===\\s*'" + kind + "'");
    assert.match(fn[0], re, 'stage kind ' + kind + ' 应处理');
  });
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
