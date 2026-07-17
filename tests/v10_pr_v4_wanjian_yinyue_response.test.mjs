// v10 V4 守护测试: 万箭齐发 + 银月枪 玩家闪响应 (V3 框架二度复用 + UI 复用面板).
// 端到端运行测试在 tests/wanjian_player_response.test.mjs + yinyue_player_response.test.mjs.
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
// v11 B1: 银月枪触发/响应已迁往 equipment.js (工厂内缩进 4 空格, 自注册)。
const equipmentSrc = fs.readFileSync(path.join(root, 'src/engine/equipment.js'), 'utf8');
// v11 B2: 闪/无懈/决斗响应面板已迁往 src/ui/panels/response-panels.js,
// adapter 源为主文件 + 面板模块拼接 (渲染/文案类断言两处皆可命中)。
const adapter = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(root, 'src/ui/panels/response-panels.js'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── 引擎: producer 走 V3 框架 ─────────────────────────────────────

test('v10 V4: playAOE shan 路径走 requestPlayerResponse(kind:wanjian-response, pauseKey:wanjianResponse)', () => {
  // v12 H2: AOE 逐座席化 — playAOE 建队列 (pauseState.aoe) 并委派
  // advanceAOETargets; 玩家 ask 暂停分支随结算循环迁入后者, 断言跟随。
  const entry = engineSrc.match(/function playAOE\(game, actor, card, responseType, title\)\s*\{[\s\S]*?\n {6}\}/);
  assert.ok(entry);
  assert.match(entry[0], /game\.pauseState\.aoe\s*=\s*\{/);
  assert.match(entry[0], /return advanceAOETargets\(game\)/);
  // v13 K2: 驱动泛化 (advanceTargetQueue) — 玩家 ask 暂停分支随效果体迁入
  // aoeEffectForCurrent (advanceAOETargets 改为委托泛化驱动), 守护契约
  // (AOE shan 路径走 requestPlayerResponse 三件套) 不变, 断言跟随定位。
  const driver = engineSrc.match(/function advanceAOETargets\(game\)\s*\{[\s\S]*?\n {6}\}/);
  assert.ok(driver);
  assert.match(driver[0], /advanceTargetQueue\(game,\s*aoe,\s*AOE_QUEUE_HOOKS\)/);
  const fn = engineSrc.match(/function aoeEffectForCurrent\(game, aoe, targetActor\)\s*\{[\s\S]*?\n {6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /requestPlayerResponse\(game,\s*\{/);
  assert.match(fn[0], /kind:\s*'wanjian-response'/);
  assert.match(fn[0], /pauseKey:\s*'wanjianResponse'/);
  assert.match(fn[0], /shanResponse\s*===\s*'ask'/);
  assert.match(fn[0], /hasShanResponseAvailable/);
});

test('v10 V4: triggerYinyueQiang 走 requestPlayerResponse(kind:yinyue-response, pauseKey:yinyueResponse)', () => {
  const fn = equipmentSrc.match(/function triggerYinyueQiang\(game, holderActor\)\s*\{[\s\S]*?\n {4}\}/);
  assert.ok(fn);
  assert.match(fn[0], /requestPlayerResponse\(game,\s*\{/);
  assert.match(fn[0], /kind:\s*'yinyue-response'/);
  assert.match(fn[0], /pauseKey:\s*'yinyueResponse'/);
  assert.match(fn[0], /shanResponse\s*===\s*'ask'/);
});

// ───── 引擎: 两 resolver 注册到 RESPONSE_KIND_RESOLVERS ───────────────

test('v10 V4: 两 resolver 注册 (wanjian-response / yinyue-response)', () => {
  assert.match(engineSrc, /registerResponseKind\(\s*'wanjian-response'\s*,\s*resolveWanjianResponseChoice\s*\)/);
  assert.match(equipmentSrc, /registerResponseKind\(\s*'yinyue-response'\s*,\s*resolveYinyueResponseChoice\s*\)/);
});

test('v10 V4: resolver 支持 decision.cardId / decision.use / 默认不出闪', () => {
  const wanjian = engineSrc.match(/function resolveWanjianResponseChoice[\s\S]*?\n {6}\}/);
  const yinyue = equipmentSrc.match(/function resolveYinyueResponseChoice[\s\S]*?\n {4}\}/);
  assert.ok(wanjian && yinyue);
  [wanjian[0], yinyue[0]].forEach(function (fnSrc, idx) {
    assert.match(fnSrc, /decision\.cardId/, ['wanjian','yinyue'][idx] + ': 缺 cardId 分支');
    assert.match(fnSrc, /decision\.use/, ['wanjian','yinyue'][idx] + ': 缺 use 分支');
    assert.match(fnSrc, /consumeResponse\(game,\s*'player',\s*'shan'/, ['wanjian','yinyue'][idx] + ': 缺 consumeResponse');
  });
});

// ───── UI: 面板复用 + 文案据 kind 区分 ──────────────────────────────

test('v10 V4: UI 用 SHAN_RESPONSE_KINDS 数组覆盖 3 kind, 复用 shanResponsePanel', () => {
  // SHAN_RESPONSE_KINDS 数组定义
  assert.match(adapter, /SHAN_RESPONSE_KINDS\s*=\s*\[[\s\S]*?'shan-response'[\s\S]*?'wanjian-response'[\s\S]*?'yinyue-response'/);
  // render 分支用 indexOf 判断
  assert.match(adapter, /SHAN_RESPONSE_KINDS\.indexOf\(kind\)\s*>=\s*0/);
});

test('v10 V4: UI hint 据 kind 选 动词 (银月:发动 / 其他:使用) + 文案用 sourceName/shaName', () => {
  assert.match(adapter, /kind\s*===\s*'yinyue-response'\s*\?\s*['"]发动['"]/);
  assert.match(adapter, /pending\.sourceName\s*\|\|\s*pending\.shaName/);
});

// ───── 运行时 (Engine 角度) — 框架双 dispatcher 都能 resolve ─────────

test('v10 V4: resolveResponseChoice 也能完成 wanjian-response (与 resolvePendingChoice 等价)', () => {
  const game = makeWanjianPending(94001);
  const hpBefore = game.player.hp;
  const res = Engine.resolveResponseChoice(game, { use: true });
  assert.equal(res.ok, true);
  assert.equal(game.player.hp, hpBefore, '化解 → 无伤害');
  assert.equal(game.pendingChoice, null);
  assert.equal(game.pauseState.wanjianResponse, null);
});

test('v10 V4: resolveResponseChoice 也能完成 yinyue-response', () => {
  const game = makeYinyuePending(94002);
  const hpBefore = game.player.hp;
  const res = Engine.resolveResponseChoice(game, { use: false });
  assert.equal(res.ok, true);
  assert.equal(game.player.hp, hpBefore - 1, '不出 → 受 1 点');
  assert.equal(game.pendingChoice, null);
  assert.equal(game.pauseState.yinyueResponse, null);
});

// ───── 默认行为零回归 (无 ask pref) ─────────────────────────────────

test('v10 V4 回归: 默认 (无 shanResponse=ask) 万箭 不暂停, 沿用旧自动响应', () => {
  const game = Engine.newGame({ seed: 94003, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.hand = [Engine.makeTestCard('shan', { id: 'pshan' })];
  game.enemy.hand = [Engine.makeTestCard('wanjian', { id: 'ewan' })];
  game.turn = 'enemy'; game.phase = 'play';
  const hpBefore = game.player.hp;
  Engine.playCard(game, 'enemy', 'ewan');
  assert.equal(game.pendingChoice, null, '默认不暂停');
  assert.equal(game.player.hp, hpBefore, '自动化解');
});

// ───── helpers ────────────────────────────────────────────────────────

function makeWanjianPending(seed) {
  const game = Engine.newGame({ seed: seed, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.skillPreferences = { shanResponse: 'ask' };
  game.player.hand = [Engine.makeTestCard('shan', { id: 'pshan' })];
  game.enemy.hand = [Engine.makeTestCard('wanjian', { id: 'ewan' })];
  game.turn = 'enemy'; game.phase = 'play';
  Engine.playCard(game, 'enemy', 'ewan');
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'wanjian-response');
  return game;
}

function makeYinyuePending(seed) {
  const game = Engine.newGame({ seed: seed, playerHero: 'liubei', enemyHero: 'caocao' });
  game.enemy.equipment.weapon = Engine.makeTestCard('yinyue', { id: 'eyinyue' });
  game.player.skillPreferences = { shanResponse: 'ask' };
  game.player.hand = [
    Engine.makeTestCard('sha', { id: 'psha' }),
    Engine.makeTestCard('shan', { id: 'pshan' })
  ];
  game.enemy.hand = [Engine.makeTestCard('shan', { id: 'eshan', suit: 'spade', color: 'black' })];
  game.turn = 'player'; game.phase = 'play';
  Engine.playCard(game, 'player', 'psha');
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'yinyue-response');
  return game;
}

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
