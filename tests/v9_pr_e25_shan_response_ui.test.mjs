// v9 PR-E25 守护测试 (UI 侧): 玩家手动【闪】响应面板接入.
// 用户反馈: 被【杀】时该不该出【闪】应交给玩家, 不该被引擎自动接管.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllStyles } from './helpers/load-styles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = loadAllStyles();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// v11 B2: 闪/无懈/决斗响应面板已迁往 src/ui/panels/response-panels.js,
// adapter 源为主文件 + 面板模块拼接 (渲染/文案类断言两处皆可命中)。
const adapter = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(root, 'src/ui/panels/response-panels.js'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── HTML: shanResponsePanel ───────────────────────────────────────

test('v9 PR-E25/E26: index.html 含 shanResponsePanel — choices 容器 + 不出按钮', () => {
  // v9 PR-E26: 改为候选列表 (shanResponseChoices) + 不出按钮 (出闪按钮已删).
  assert.match(html, /<div class="shan-response-panel pending-prompt-panel" id="shanResponsePanel" hidden>/);
  assert.match(html, /id="shanResponseHint"/);
  assert.match(html, /id="shanResponseChoices"/);
  assert.match(html, /id="shanResponseDeclineBtn"[^>]*>不出/);
});

// ───── 引擎: shan-response 暂停机制 ──────────────────────────────────

test('v9 PR-E25: 引擎注册 shan-response kind (v10 V3 后走 RESPONSE_KIND_RESOLVERS 注册表)', () => {
  // V3 前: pending.kind === 'shan-response' 直接调 resolveShanResponseChoice;
  // V3 后: 经 registerResponseKind('shan-response', resolveShanResponseChoice) 注册.
  assert.match(engine, /registerResponseKind\(\s*'shan-response'\s*,\s*resolveShanResponseChoice\s*\)/);
});

test('v9 PR-E25: 引擎 continueShaAfterCixiong — 玩家是杀目标 + shanResponse=ask 时暂停 (v10 V3 后走 requestPlayerResponse)', () => {
  const fn = engine.match(/function continueShaAfterCixiong\(game, actor, card, amount\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /targetActor\s*===\s*'player'/);
  assert.match(fn[0], /skillPreferences\.shanResponse\s*===\s*'ask'/);
  assert.match(fn[0], /requestPlayerResponse\(game,\s*\{/);
  assert.match(fn[0], /kind:\s*'shan-response'/);
  assert.match(fn[0], /pauseKey:\s*'shaResponse'/);
});

test('v9 PR-E25: 引擎含 resolveShanResponseChoice + resolveShaAfterResponse + hasShanResponseAvailable', () => {
  assert.match(engine, /function resolveShanResponseChoice\(game, pending, decision\)/);
  assert.match(engine, /function resolveShaAfterResponse\(game, actor, card, amount, dodged\)/);
  assert.match(engine, /function hasShanResponseAvailable\(state\)/);
});

test('v9 PR-E25/E26: resolveShanResponseChoice — cardId 指定 / use 自动 / 否则不出', () => {
  const fn = engine.match(/function resolveShanResponseChoice\([\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /d\.cardId/);
  assert.match(fn[0], /consumeResponse\(game,\s*'player',\s*'shan'/);
  assert.match(fn[0], /resolveShaAfterResponse/);
});

// ───── dom-adapter 接入 ──────────────────────────────────────────────

test('v9 PR-E25/E26: dom-adapter 缓存 shanResponsePanel 4 个 id', () => {
  ['shanResponsePanel', 'shanResponseHint', 'shanResponseChoices', 'shanResponseDeclineBtn'].forEach(function (id) {
    assert.match(adapter, new RegExp("'" + id + "'"), '应缓存 ' + id);
  });
});

test('v9 PR-E25/E26: PENDING_MODAL_DISPATCH 注册 shanResponsePanel (confirm=null, 候选两步化)', () => {
  assert.match(adapter, /panelId:\s*'shanResponsePanel',\s*confirmBtnId:\s*null,\s*cancelBtnId:\s*'shanResponseDeclineBtn'/);
});

test('v9 PR-E25: renderPendingChoice 处理 shan-response kind (v10 V4: 走 SHAN_RESPONSE_KINDS 数组)', () => {
  // V4: shan-response / wanjian-response / yinyue-response 共用 shanResponsePanel
  assert.match(adapter, /SHAN_RESPONSE_KINDS\s*=\s*\[[\s\S]*?'shan-response'/);
  assert.match(adapter, /SHAN_RESPONSE_KINDS\.indexOf\(kind\)\s*>=\s*0[\s\S]{0,200}shanResponsePanel\.hidden\s*=\s*false/);
});

test('v9 PR-E25/E26: shanResponseChoices click → stage; DeclineBtn → resolvePendingChoice({use:false})', () => {
  // v9 PR-E26: 候选两步化 — 点候选 stage, 不出按钮直接 decline.
  // v11 B2: 面板模块内点候选经注入的 stage() 提交 (语义同 stagedModalChoice 赋值)。
  assert.match(adapter, /shanResponseChoices\.addEventListener\([\s\S]{0,300}stage\(\{\s*cardId:\s*cardId\s*\}/);
  assert.match(adapter, /shanResponseDeclineBtn\.addEventListener[\s\S]{0,160}resolvePendingChoice\(getGame\(\),\s*\{\s*use:\s*false\s*\}/);
});

test('v9 PR-E25: enemyStep 有 pendingChoice 时暂停轮询 (不推进 AI)', () => {
  const fn = adapter.match(/function enemyStep\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /Engine\.getPendingChoice\(game\)[\s\S]{0,160}setTimeout\(enemyStep/);
});

test('v9 PR-E25: newGame 开启 player.skillPreferences.shanResponse = ask', () => {
  const fn = adapter.match(/function newGame\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /skillPreferences\.shanResponse\s*=\s*'ask'/);
});

// ───── 回归 ──────────────────────────────────────────────────────────

test('v9 PR-E25: loadAllStyles() 含 pending-prompt-panel 框架 (shanResponsePanel 复用)', () => {
  assert.match(css, /\.pending-prompt-panel\s*\{/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
