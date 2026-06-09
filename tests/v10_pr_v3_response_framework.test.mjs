// v10 V3 守护测试: 引擎响应窗口框架 (requestPlayerResponse + RESPONSE_KIND_RESOLVERS).
// 范围: 框架 API 形态 + shan-response 作为首个 reference migration.
// 不覆盖运行时端到端 (那些由 shan_response.test.mjs / shan_response_conversion.test.mjs 守).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine } from './helpers/load-engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const engineSrc = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── 框架 API 暴露 (engine exports) ────────────────────────────────

test('v10 V3: Engine 暴露 requestPlayerResponse / resolveResponseChoice / registerResponseKind', () => {
  assert.equal(typeof Engine.requestPlayerResponse, 'function', 'requestPlayerResponse 缺失');
  assert.equal(typeof Engine.resolveResponseChoice, 'function', 'resolveResponseChoice 缺失');
  assert.equal(typeof Engine.registerResponseKind, 'function', 'registerResponseKind 缺失');
});

// ───── 框架代码形状 ──────────────────────────────────────────────────

test('v10 V3: requestPlayerResponse 写 pauseState[pauseKey] + pendingChoice + 返回 success', () => {
  const fn = engineSrc.match(/function requestPlayerResponse\(game, spec\)\s*\{[\s\S]*?\n {6}\}/);
  assert.ok(fn, 'requestPlayerResponse fn 存在');
  assert.match(fn[0], /game\.pauseState\[spec\.pauseKey\]\s*=\s*spec\.source/);
  assert.match(fn[0], /setPendingChoice\(game, pending\)/);
  assert.match(fn[0], /return success\(/);
});

test('v10 V3: RESPONSE_KIND_RESOLVERS 注册表 + registerResponseKind 写入', () => {
  assert.match(engineSrc, /var RESPONSE_KIND_RESOLVERS\s*=\s*\{\s*\}/);
  const reg = engineSrc.match(/function registerResponseKind\(kind, resolver\)\s*\{[\s\S]*?\n {6}\}/);
  assert.ok(reg);
  assert.match(reg[0], /RESPONSE_KIND_RESOLVERS\[kind\]\s*=\s*resolver/);
});

test('v10 V3: resolveResponseChoice 仅处理注册的 kind, 未注册 → fail', () => {
  const fn = engineSrc.match(/function resolveResponseChoice\(game, decision\)\s*\{[\s\S]*?\n {6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /RESPONSE_KIND_RESOLVERS\[pending\.kind\]/);
  assert.match(fn[0], /未注册的响应类型/);
});

test('注册表迁移收官: resolvePendingChoice 统一经 RESPONSE_KIND_RESOLVERS 分发 (无旧分支)', () => {
  const fn = engineSrc.match(/function resolvePendingChoice\(game, decision\)\s*\{[\s\S]*?\n {6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /var resolver\s*=\s*RESPONSE_KIND_RESOLVERS\[pending\.kind\]/);
  assert.match(fn[0], /if\s*\(!resolver\)\s*return fail/);
  // H3: resolver 返回后经 finishPendingChoiceResolution 弹出队列 + 续跑挂起回合
  assert.match(fn[0], /finishPendingChoiceResolution\(game, resolver\(game, pending, decision \|\| \{\}\)\)/);
});

// ───── shan-response 迁移到框架 (reference impl) ──────────────────────

test('v10 V3: shan-response 通过 registerResponseKind 注册到 resolveShanResponseChoice', () => {
  assert.match(engineSrc, /registerResponseKind\(\s*'shan-response'\s*,\s*resolveShanResponseChoice\s*\)/);
});

test('v10 V3: continueShaAfterCixiong 调 requestPlayerResponse 替代手写 pauseState/pendingChoice', () => {
  const fn = engineSrc.match(/function continueShaAfterCixiong[\s\S]*?\n {6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /requestPlayerResponse\(game,\s*\{/);
  assert.match(fn[0], /pauseKey:\s*'shaResponse'/);
  // 旧的手写 game.pauseState.shaResponse = ... 已删 (在 continueShaAfterCixiong 内)
  assert.doesNotMatch(fn[0], /game\.pauseState\.shaResponse\s*=\s*\{\s*actor:/);
});

test('v10 V3: resolvePendingChoice 内不再含 shan-response 显式分支 (注册表接管)', () => {
  const fn = engineSrc.match(/function resolvePendingChoice\(game, decision\)\s*\{[\s\S]*?\n {6}\}/);
  assert.ok(fn);
  assert.doesNotMatch(fn[0], /pending\.kind\s*===\s*'shan-response'/);
});

// ───── 运行时回归: 框架走通 shan-response 流程 ───────────────────────

test('v10 V3: requestPlayerResponse 设 pendingChoice 完整 (kind/actor/options/meta)', () => {
  const game = makeGameWithShanContext();
  const enemyShaCard = game.enemy.hand[0];
  game.enemy.hand = []; // 走简化路径
  const res = Engine.requestPlayerResponse(game, {
    kind: 'shan-response',
    actor: 'player',
    pauseKey: 'shaResponse',
    source: { actor: 'enemy', card: enemyShaCard, amount: 1 },
    options: [{ cardId: 'opt-1', via: null, name: '闪', suit: 'heart', rank: 5 }],
    meta: { sourceActor: 'enemy', shaName: '杀' },
    statusMessage: 'wait'
  });
  assert.equal(res.ok, true);
  assert.equal(game.pauseState.shaResponse.actor, 'enemy');
  assert.equal(game.pauseState.shaResponse.card, enemyShaCard);
  assert.equal(game.pendingChoice.kind, 'shan-response');
  assert.equal(game.pendingChoice.actor, 'player');
  assert.equal(game.pendingChoice.sourceActor, 'enemy');
  assert.equal(game.pendingChoice.shaName, '杀');
  assert.equal(game.pendingChoice.options.length, 1);
});

test('v10 V3: resolveResponseChoice 与 resolvePendingChoice 行为等价 (shan-response)', () => {
  // 双 dispatcher 都应 OK 通 — 同一 resolver, 通过两条路径调用.
  const gameA = makePauseGameWithShanResponse();
  const resA = Engine.resolvePendingChoice(gameA, { use: false });
  assert.equal(resA.ok, true, 'resolvePendingChoice 路径成功');
  assert.equal(gameA.pendingChoice, null);
  assert.equal(gameA.pauseState.shaResponse, null);

  const gameB = makePauseGameWithShanResponse();
  const resB = Engine.resolveResponseChoice(gameB, { use: false });
  assert.equal(resB.ok, true, 'resolveResponseChoice 路径成功');
  assert.equal(gameB.pendingChoice, null);
  assert.equal(gameB.pauseState.shaResponse, null);
});

test('v10 V3: resolveResponseChoice 未注册 kind → fail (不破坏 pendingChoice)', () => {
  // 注: 注册表迁移收官后 ganglie-fire 等已注册, 这里改用一个根本不存在的
  // kind 来验证未注册 → fail 且保留 pendingChoice 的分支。
  const game = Engine.newGame({ seed: 91003, playerHero: 'liubei', enemyHero: 'caocao' });
  game.pendingChoice = { kind: 'definitely-not-a-registered-kind', actor: 'player' };
  const res = Engine.resolveResponseChoice(game, {});
  assert.equal(res.ok, false);
  assert.match(res.message, /未注册的响应类型/);
  assert.ok(game.pendingChoice, '未注册 → 不清空 pendingChoice');
});

test('注册表迁移收官: 旧 pendingChoice kinds 已注册到 RESPONSE_KIND_RESOLVERS, resolvePendingChoice 不再有 if 链', () => {
  // 迁移前这些 kind 是 resolvePendingChoice 内的手写 if 分支; 现统一注册并由
  // dispatcher 分发。形态校验: registerResponseKind 注册存在, 且函数体内不再有
  // pending.kind === ... 分支。
  assert.match(engineSrc, /registerResponseKind\(\s*'guanxing-reorder'\s*,\s*resolveGuanxingChoice\s*\)/);
  assert.match(engineSrc, /registerResponseKind\(\s*'yiji-distribute'\s*,\s*resolveYijiDistributeChoice\s*\)/);
  assert.match(engineSrc, /registerResponseKind\(\s*'fanjian-guess'\s*,\s*resolveFanjianGuessChoice\s*\)/);
  assert.match(engineSrc, /registerResponseKind\(\s*'dying-rescue'\s*,\s*resolveDyingRescueChoice\s*\)/);
  const fn = engineSrc.match(/function resolvePendingChoice\(game, decision\)\s*\{[\s\S]*?\n {6}\}/);
  assert.ok(fn);
  assert.doesNotMatch(fn[0], /pending\.kind\s*===/);
});

// ───── helpers ────────────────────────────────────────────────────────

function makeGameWithShanContext() {
  const game = Engine.newGame({ seed: 91001, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.skillPreferences = game.player.skillPreferences || {};
  game.player.skillPreferences.shanResponse = 'ask';
  return game;
}

// 触发 shan-response pending 状态: 用 Engine 自己的 path —
// 敌人出杀 + 玩家有闪 + ask pref.
function makePauseGameWithShanResponse() {
  const game = Engine.newGame({ seed: 91002, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.skillPreferences = game.player.skillPreferences || {};
  game.player.skillPreferences.shanResponse = 'ask';
  game.player.hand = [Engine.makeTestCard('shan', { id: 'pshan' })];
  game.enemy.hand = [Engine.makeTestCard('sha', { id: 'esha' })];
  game.turn = 'enemy';
  game.phase = 'play';
  // 敌人直接出杀 (引擎路径会走到 continueShaAfterCixiong → requestPlayerResponse)
  const res = Engine.playCard(game, 'enemy', 'esha');
  assert.equal(res.ok, true, 'enemy 出杀: ' + res.message);
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'shan-response');
  assert.ok(game.pauseState && game.pauseState.shaResponse, 'pauseState.shaResponse 应设');
  return game;
}

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
