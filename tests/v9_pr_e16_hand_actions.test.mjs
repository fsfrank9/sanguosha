// v9 PR-E16 守护测试: 用户反馈 4 条 (PR-E15 #83 merged 后):
//   1. "重新选将"/"结束回合" 真删 (不是隐藏)
//   2. hand-dock 加 3 按钮 (确认/取消/弃牌) + select-then-confirm 模式
//   3. 删除 .pause-banner (别人回合/判定回合不该显示"游戏暂停")
//   4. hand 区 confirm/cancel 作为所有 pending modal 的统一入口
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
const controlsCss = fs.readFileSync(path.join(stylesDir, 'controls.css'), 'utf8');
const layoutCss = fs.readFileSync(path.join(stylesDir, 'layout.css'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── 1. top-actions 真删 ────────────────────────────────────────────

test('v9 PR-E16: index.html 不再含 <nav class="top-actions"> + 不含 id="newGameBtn" / id="endTurnBtn"', () => {
  assert.doesNotMatch(html, /<nav class="top-actions">/);
  assert.doesNotMatch(html, /id="newGameBtn"/);
  assert.doesNotMatch(html, /id="endTurnBtn"/);
});

test('v9 PR-E16: dom-adapter 不再缓存 newGameBtn / endTurnBtn id (避免 null deref)', () => {
  // 缓存数组中不应再出现 'newGameBtn' / 'endTurnBtn' 字串作为 id 名
  assert.doesNotMatch(adapter, /'newGameBtn'/);
  assert.doesNotMatch(adapter, /'endTurnBtn'/);
});

test('v9 PR-E16: controls.css .top-actions 规则已删 (不再含 absolute/right/bottom 样式)', () => {
  // .top-actions 不再被定义为 absolute (规则块整个删除)
  assert.doesNotMatch(controlsCss, /\.top-actions\s*\{[\s\S]*?position:\s*absolute/);
});

// ───── 2. hand-dock 3 按钮 + select-then-confirm ──────────────────────

test('v9 PR-E16: index.html .hand-actions 含 3 个 button (confirm / cancel / discard)', () => {
  // .hand-actions 容器
  assert.match(html, /<div class="hand-actions">/);
  // 3 按钮 id
  assert.match(html, /id="handConfirmBtn"[^>]*>确认</);
  assert.match(html, /id="handCancelBtn"[^>]*>取消</);
  assert.match(html, /id="handDiscardBtn"[^>]*>结束回合</);
});

test('v9 PR-E16: dom-adapter 缓存 handConfirmBtn / handCancelBtn / handDiscardBtn', () => {
  ['handConfirmBtn', 'handCancelBtn', 'handDiscardBtn'].forEach(function (id) {
    const re = new RegExp("'" + id + "'");
    assert.match(adapter, re, '应缓存 ' + id);
  });
});

test('v9 PR-E16: dom-adapter 含 selectedHandCardId state + _shouldSelectFirst 判断', () => {
  assert.match(adapter, /var selectedHandCardId\s*=\s*null/);
  assert.match(adapter, /function _shouldSelectFirst\(\)/);
});

test('v9 PR-E16: playerHand click 在 _shouldSelectFirst 为 true 时仅 set selectedHandCardId (不立即 usePlayerCard)', () => {
  const handlerBlock = adapter.match(/playerHand\.addEventListener\('click',\s*function[\s\S]*?\}\);/);
  assert.ok(handlerBlock);
  assert.match(handlerBlock[0], /_shouldSelectFirst\(\)/);
  assert.match(handlerBlock[0], /selectedHandCardId\s*=\s*\(selectedHandCardId\s*===\s*cardId\)\s*\?\s*null\s*:\s*cardId/);
});

test('v9 PR-E16: handDiscardBtn 绑定结束回合逻辑 (含 Engine.finishPlayPhase / endTurn)', () => {
  const block = adapter.match(/handDiscardBtn\.addEventListener\('click',[\s\S]*?\}\);/);
  assert.ok(block);
  assert.match(block[0], /Engine\.finishPlayPhase/);
  assert.match(block[0], /Engine\.endTurn/);
});

// ───── 3. pause-banner 真删 ──────────────────────────────────────────

test('v9 PR-E16: index.html 不再含 .pause-banner DOM', () => {
  assert.doesNotMatch(html, /<div class="pause-banner"/);
  assert.doesNotMatch(html, /id="pauseBanner"/);
});

test('v10 V2: dom-adapter 不再缓存 pauseBanner; renderPauseBanner no-op 整体删除', () => {
  assert.doesNotMatch(adapter, /'pauseBanner'/);
  // V2: no-op fn 整块删 (E16 暂留 fn 为 "safety"; V2 清债).
  assert.doesNotMatch(adapter, /function renderPauseBanner\(/);
});

test('v9 PR-E16: layout.css .pause-banner 规则块已删 (仅注释保留)', () => {
  // .pause-banner { ... } 规则不存在 (注释提到 OK)
  assert.doesNotMatch(layoutCss, /\.pause-banner\s*\{\s*\n\s*position/);
  assert.doesNotMatch(layoutCss, /\.pause-banner__brush\s*\{/);
});

// ───── 4. hand confirm/cancel 统一 dispatch ───────────────────────────

test('v9 PR-E16: dom-adapter 含 PENDING_MODAL_DISPATCH 注册表 (luoshen/guanxing/cixiong 等)', () => {
  assert.match(adapter, /var PENDING_MODAL_DISPATCH\s*=\s*\[/);
  // 至少覆盖 5 个关键 modal
  ['luoshenPromptPanel', 'guanxingModePanel', 'zhihengModePanel',
   'gangliePromptPanel', 'cixiongFirePanel'].forEach(function (panelId) {
    const re = new RegExp("panelId:\\s*'" + panelId + "'");
    assert.match(adapter, re, 'PENDING_MODAL_DISPATCH 应注册 ' + panelId);
  });
});

test('v9 PR-E16: _handConfirm / _handCancel 走 _firstVisibleDispatch + _clickIfEnabled', () => {
  const confirmFn = adapter.match(/function _handConfirm\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  const cancelFn = adapter.match(/function _handCancel\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(confirmFn && cancelFn);
  assert.match(confirmFn[0], /_firstVisibleDispatch/);
  assert.match(confirmFn[0], /_clickIfEnabled\(dispatch\.confirmBtnId\)/);
  assert.match(cancelFn[0], /_firstVisibleDispatch/);
  assert.match(cancelFn[0], /_clickIfEnabled\(dispatch\.cancelBtnId\)/);
});

test('v9 PR-E16: _handConfirm 在无 pending + selectedHandCardId 时调 usePlayerCard', () => {
  const fn = adapter.match(/function _handConfirm\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /selectedHandCardId\s*=\s*null/);
  assert.match(fn[0], /usePlayerCard\(cardId\)/);
});

// ───── 回归 ────────────────────────────────────────────────────────────

test('v9 PR-E16: loadAllStyles() 拼接含 .hand-actions + 不含 .pause-banner 规则', () => {
  assert.match(css, /\.hand-actions\s*\{/);
  assert.doesNotMatch(css, /\.pause-banner\s*\{\s*\n\s*position/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
