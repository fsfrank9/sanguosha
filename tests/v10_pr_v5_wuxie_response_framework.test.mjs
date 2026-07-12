// v10 V5 守护: 无懈可击 链式响应 框架 + UI panel (端到端在 wuxie_player_response.test.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine } from './helpers/load-engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engineSrc = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
// v11 B1: 无懈链框架已迁往 tricks.js — 框架形状断言改读该模块 (工厂内缩进
// 4 空格); 各 trick 调用点与 continuation 注册断言仍读引擎源。
const tricksSrc = fs.readFileSync(path.join(root, 'src/engine/tricks.js'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── 引擎: 链状态机 ────────────────────────────────────────────────

test('v10 V5: WUXIE_CONTINUATIONS 注册表 + registerWuxieContinuation', () => {
  assert.match(tricksSrc, /var WUXIE_CONTINUATIONS\s*=\s*\{\s*\}/);
  assert.match(tricksSrc, /function registerWuxieContinuation\(trickName, fn\)/);
});

test('v10 V5: 5 个 trick 注册 wuxie continuation (juedou/guohe/shunshou/huogong/jiedao)', () => {
  // v11 B1 第五步: continuation 已随框架迁入 tricks.js。
  ['juedou', 'guohe', 'shunshou', 'huogong', 'jiedao'].forEach(function (trick) {
    const re = new RegExp("registerWuxieContinuation\\(\\s*'" + trick + "'\\s*,");
    assert.match(tricksSrc, re, trick + ': 应注册');
  });
});

test('v10 V5: checkWuxieAndContinue 入口 + advanceWuxieChain 推进 + settleWuxieChain 结算', () => {
  assert.match(tricksSrc, /function checkWuxieAndContinue\(game, targetActor, reason, trickName, ctx\)/);
  assert.match(tricksSrc, /function advanceWuxieChain\(game\)/);
  assert.match(tricksSrc, /function settleWuxieChain\(game\)/);
});

test('v10 V5: advanceWuxieChain — 玩家 ask 走 requestPlayerResponse(kind:wuxie-response)', () => {
  const fn = tricksSrc.match(/function advanceWuxieChain\(game\)\s*\{[\s\S]*?\n {4}\}/);
  assert.ok(fn);
  assert.match(fn[0], /wuxieResponse\s*===\s*'ask'/);
  assert.match(fn[0], /requestPlayerResponse\(game,\s*\{/);
  assert.match(fn[0], /kind:\s*'wuxie-response'/);
  assert.match(fn[0], /pauseKey:\s*'wuxieChain'/);
});

test('v10 V5: advanceWuxieChain — AI 自动 use (有无懈则消耗 + 翻转 + 递归)', () => {
  const fn = tricksSrc.match(/function advanceWuxieChain\(game\)\s*\{[\s\S]*?\n {4}\}/);
  assert.ok(fn);
  assert.match(fn[0], /consumeWuxie\(game,\s*responder,\s*chain\.reason\)/);
  assert.match(fn[0], /chain\.wuxied\s*=\s*!chain\.wuxied/);
  // v12 H2: 交替翻转泛化为座次队列 — 打出无懈后记录 lastWuxieBy 并重建
  // 队列 (双座席时下一位恰为 opponent(responder), 语义不变)。
  assert.match(fn[0], /chain\.lastWuxieBy\s*=\s*responder/);
  assert.match(fn[0], /chain\.queue\s*=\s*null/);
  assert.match(fn[0], /return advanceWuxieChain\(game\)/, '尾递归');
});

test('v10 V5: resolveWuxieResponseChoice 注册到 RESPONSE_KIND_RESOLVERS', () => {
  assert.match(tricksSrc, /registerResponseKind\(\s*'wuxie-response'\s*,\s*resolveWuxieResponseChoice\s*\)/);
});

test('v10 V5: resolveWuxieResponseChoice — cardId / use / 默认 decline 三分支', () => {
  const fn = tricksSrc.match(/function resolveWuxieResponseChoice[\s\S]*?\n {4}\}/);
  assert.ok(fn);
  assert.match(fn[0], /decision\.cardId/);
  assert.match(fn[0], /decision\.use/);
  assert.match(fn[0], /consumeWuxie\(game,\s*'player',\s*chain\.reason,\s*decision\.cardId/);
  // v12 H2: decline 不再直接 settle — 游标 +1 交回队列推进 (耗尽即 settle,
  // 双座席行为不变); 结算职责在 advanceWuxieChain 尾部。
  assert.match(fn[0], /chain\.idx\s*\+=\s*1/);
  assert.match(fn[0], /return advanceWuxieChain\(game\)/);
});

// ───── 引擎: 5 trick 重构走 checkWuxieAndContinue ──────────────────────

test('v10 V5: 5 个 trick 调用 checkWuxieAndContinue (而非旧 consumeWuxie 单调用)', () => {
  ['juedou', 'guohe', 'shunshou', 'huogong', 'jiedao'].forEach(function (trick) {
    const re = new RegExp("checkWuxieAndContinue\\(game,\\s*opponent\\(actor\\),\\s*['【】一-鿿·]+,\\s*'" + trick + "'");
    assert.match(engineSrc, re, trick + ': 应走 checkWuxieAndContinue');
  });
});

test('v10 V5: 旧 consumeWuxie 直接 if 调用全部清除 (5 trick 已重构)', () => {
  // 旧 pattern: if (consumeWuxie(game, opponent(actor), '【xxx】'))
  // 重构后此 pattern 应仅在 advanceWuxieChain / resolveWuxieResponseChoice 内的 AI auto / 玩家 use 路径出现.
  const playCardFn = engineSrc.match(/function playCard\(game, actor, cardId, options\)\s*\{[\s\S]*?\n {6}\}/);
  assert.ok(playCardFn);
  assert.doesNotMatch(playCardFn[0], /if\s*\(consumeWuxie\(/, 'playCard 内不应再有 if (consumeWuxie(...))');
});

// ───── 引擎: consumeWuxie 接受 preferredCardId ───────────────────────

test('v10 V5: consumeWuxie 接受 preferredCardId 4th 参数 (面板候选指定)', () => {
  assert.match(engineSrc, /function consumeWuxie\(game, actor, reason, preferredCardId\)/);
});

// ───── UI: 面板 + render + dispatch + click ─────────────────────────

test('v10 V5: index.html 含 wuxieResponsePanel (复用 pending-prompt-panel 风格)', () => {
  // 属性顺序 class 在前 id 在后 (项目惯例)
  assert.match(html, /class="[^"]*pending-prompt-panel[^"]*"\s+id="wuxieResponsePanel"/);
  assert.match(html, /id="wuxieResponseHint"/);
  assert.match(html, /id="wuxieResponseChoices"/);
  assert.match(html, /id="wuxieResponseDeclineBtn"[^>]*>不无懈/);
});

test('v10 V5: dom-adapter 缓存 wuxieResponse* 4 ids', () => {
  ['wuxieResponsePanel', 'wuxieResponseHint', 'wuxieResponseChoices', 'wuxieResponseDeclineBtn'].forEach(function (id) {
    const re = new RegExp("'" + id + "'");
    assert.match(adapter, re, id + ' 应缓存');
  });
});

test('v10 V5: PENDING_MODAL_DISPATCH 注册 wuxieResponsePanel (confirm=null, cancel=wuxieResponseDeclineBtn)', () => {
  assert.match(adapter, /panelId:\s*'wuxieResponsePanel',\s*confirmBtnId:\s*null,\s*cancelBtnId:\s*'wuxieResponseDeclineBtn'/);
});

// v11 A3: 面板渲染/接线断言已由 tests/ui_panels_a3_batch1.test.mjs 的
// fake-DOM 全链路行为测试取代 (无懈面板: 打出/不使用两条路径)。
// 保留下方 chainWuxied 文案断言之外的引擎结构断言。

test('v10 V5: newGame 开启 wuxieResponse=ask pref', () => {
  assert.match(adapter, /skillPreferences\.wuxieResponse\s*=\s*'ask'/);
});

// ───── 运行时回归 ────────────────────────────────────────────────────

test('v10 V5 回归: 默认 (无 wuxieResponse=ask) 锦囊响应仍走旧 auto-consume 路径', () => {
  const game = Engine.newGame({ seed: 95901, playerHero: 'liubei', enemyHero: 'caocao' });
  // 不设 wuxieResponse pref
  game.player.hand = [Engine.makeTestCard('wuxie', { id: 'pw1' })];
  game.player.equipment.weapon = Engine.makeTestCard('qinggang', { id: 'pqg' });
  game.enemy.hand = [Engine.makeTestCard('guohe', { id: 'eg' })];
  game.turn = 'enemy'; game.phase = 'play';

  Engine.playCard(game, 'enemy', 'eg');
  assert.equal(game.pendingChoice, null, '默认不暂停');
  assert.equal(game.player.equipment.weapon && game.player.equipment.weapon.id, 'pqg', '装备未弃 (自动无懈)');
  assert.equal(game.player.hand.length, 0, '无懈被自动消耗');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
