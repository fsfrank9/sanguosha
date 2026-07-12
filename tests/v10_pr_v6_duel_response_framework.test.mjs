// v10 V6 守护: 决斗 玩家手动【杀】响应 框架 + UI panel.
// 端到端在 duel_player_response.test.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine } from './helpers/load-engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// v12 F5: 杀链/锦囊结算域拆分至 sha-flow.js / tricks.js — 牌结算域源码按域拼接
const engineSrc = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(root, 'src/engine/sha-flow.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(root, 'src/engine/tricks.js'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── 引擎: sha-option 枚举 ─────────────────────────────────────────

test('v10 V6: shaOptionForCard + listShaResponseOptions + hasShaResponseAvailable 存在', () => {
  assert.match(engineSrc, /function shaOptionForCard\(state, cardId\)/);
  assert.match(engineSrc, /function listShaResponseOptions\(state\)/);
  assert.match(engineSrc, /function hasShaResponseAvailable\(state\)/);
});

test('v10 V6: shaOptionForCard 识别 真杀 / 龙胆(闪→杀) / 武圣(红→杀)', () => {
  const fn = engineSrc.match(/function shaOptionForCard\(state, cardId\)\s*\{[\s\S]*?\n {6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /isShaCard\(card\)/);
  assert.match(fn[0], /hasSkill\(state,\s*'longdan'\)\s*&&\s*card\.type\s*===\s*'shan'/);
  assert.match(fn[0], /hasSkill\(state,\s*'wusheng'\)\s*&&\s*card\.color\s*===\s*'red'/);
});

test('v10 V6: findResponseCard 接受 preferredCardId for sha (与 shan 对称)', () => {
  // sha 分支应有 preferredCardId 路径
  const fn = engineSrc.match(/if\s*\(type\s*===\s*'sha'\)\s*\{[\s\S]*?return null;\s*\n\s*\}/);
  assert.ok(fn);
  assert.match(fn[0], /preferredCardId/);
  assert.match(fn[0], /shaOptionForCard\(state, preferredCardId\)/);
});

// ───── 引擎: 链状态机 ────────────────────────────────────────────────

test('v10 V6: playDuel 重构走 advanceDuelChain (不再含同步 while 循环)', () => {
  // v12 H2: playDuel 增 targetActor 显式目标参数 (未传回退 opponent(actor))
  const fn = engineSrc.match(/function playDuel\(game, actor, card, targetActor\)\s*\{[\s\S]*?\n {6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /game\.pauseState\.duelChain/);
  assert.match(fn[0], /targetActor\s*\|\|\s*opponent\(actor\)/, '目标缺省回退 1v1 对手');
  assert.match(fn[0], /advanceDuelChain\(game\)/);
  assert.doesNotMatch(fn[0], /while\s*\(/, '旧 sync while 循环应已删');
});

test('v10 V6: advanceDuelChain — 玩家 ask 走 requestPlayerResponse(kind:sha-duel-response)', () => {
  const fn = engineSrc.match(/function advanceDuelChain\(game\)\s*\{[\s\S]*?\n {6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /shaDuelResponse\s*===\s*'ask'/);
  assert.match(fn[0], /requestPlayerResponse\(game,\s*\{/);
  assert.match(fn[0], /kind:\s*'sha-duel-response'/);
  assert.match(fn[0], /pauseKey:\s*'duelChain'/);
  assert.match(fn[0], /listShaResponseOptions/);
});

test('v10 V6: advanceDuelChain — AI / 默认 走 consumeResponse 自动 + 切换 currentResponder + 尾递归', () => {
  const fn = engineSrc.match(/function advanceDuelChain\(game\)\s*\{[\s\S]*?\n {6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /consumeResponse\(game,\s*responder,\s*'sha'/);
  // v12 H2: 决斗限定 starter/target 两方 — 切换/伤害来源经 duelOtherParty
  // (双座席时即 opponent, 语义不变)。
  assert.match(fn[0], /chain\.currentResponder\s*=\s*duelOtherParty\(chain,\s*responder\)/);
  assert.match(fn[0], /return advanceDuelChain\(game\)/, '尾递归');
  // 无杀 → damage + clear chain
  assert.match(fn[0], /damage\(game,\s*loser,\s*1,\s*duelOtherParty\(chain,\s*loser\)/);
});

test('v10 V6: resolveDuelResponseChoice 注册到 RESPONSE_KIND_RESOLVERS', () => {
  assert.match(engineSrc, /registerResponseKind\(\s*'sha-duel-response'\s*,\s*resolveDuelResponseChoice\s*\)/);
});

test('v10 V6: resolveDuelResponseChoice — cardId / use / decline 三分支 + decline 走 damage', () => {
  const fn = engineSrc.match(/function resolveDuelResponseChoice[\s\S]*?\n {6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /decision\.cardId/);
  assert.match(fn[0], /decision\.use/);
  assert.match(fn[0], /consumeResponse\(game,\s*'player',\s*'sha',\s*chain\.reason,\s*decision\.cardId/);
  assert.match(fn[0], /damage\(game,\s*'player',\s*1/);
});

// ───── UI ────────────────────────────────────────────────────────────

test('v10 V6: index.html 含 duelResponsePanel (pending-prompt-panel 风格)', () => {
  assert.match(html, /class="[^"]*pending-prompt-panel[^"]*"\s+id="duelResponsePanel"/);
  assert.match(html, /id="duelResponseHint"/);
  assert.match(html, /id="duelResponseChoices"/);
  assert.match(html, /id="duelResponseDeclineBtn"[^>]*>不出/);
});

test('v10 V6: dom-adapter 缓存 duelResponse* 4 ids', () => {
  ['duelResponsePanel', 'duelResponseHint', 'duelResponseChoices', 'duelResponseDeclineBtn'].forEach(function (id) {
    const re = new RegExp("'" + id + "'");
    assert.match(adapter, re, id + ' 应缓存');
  });
});

test('v10 V6: PENDING_MODAL_DISPATCH 注册 duelResponsePanel (confirm=null, cancel=DeclineBtn)', () => {
  assert.match(adapter, /panelId:\s*'duelResponsePanel',\s*confirmBtnId:\s*null,\s*cancelBtnId:\s*'duelResponseDeclineBtn'/);
});

// v11 A3: 面板弹出/点选/关闭的接线断言已由 tests/ui_panels_a3_batch1.test.mjs
// 的 fake-DOM 全链路行为测试取代 (决斗面板: 出杀/不出两条路径)。

test('v10 V6: newGame 开启 shaDuelResponse=ask pref', () => {
  assert.match(adapter, /skillPreferences\.shaDuelResponse\s*=\s*'ask'/);
});

// ───── 运行时回归 ────────────────────────────────────────────────────

test('v10 V6 回归: 默认 (无 shaDuelResponse=ask) 决斗仍走旧 sync auto-consume 链', () => {
  const game = Engine.newGame({ seed: 96901, playerHero: 'liubei', enemyHero: 'caocao' });
  // 不设 shaDuelResponse pref
  game.player.hand = [Engine.makeTestCard('sha', { id: 'psha' })];
  game.enemy.hand = [Engine.makeTestCard('juedou', { id: 'ej' })];
  game.turn = 'enemy'; game.phase = 'play';

  const res = Engine.playCard(game, 'enemy', 'ej');
  assert.equal(res.ok, true);
  assert.equal(game.pendingChoice, null, '默认不暂停');
  // 玩家自动出杀, AI 无杀 → AI 受 1 伤
  assert.equal(game.player.hand.length, 0, '玩家杀自动消耗');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
