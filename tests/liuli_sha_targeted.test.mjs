import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Engine } from './helpers/load-engine.mjs';

const root = path.resolve(import.meta.dirname, '..');
const heroesSrc = fs.readFileSync(path.join(root, 'src/data/heroes.js'), 'utf8');
// v12 F5: 杀链/锦囊结算域拆分至 sha-flow.js / tricks.js — 牌结算域源码按域拼接
const engineSrc = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(root, 'src/engine/sha-flow.js'), 'utf8');
const skillsSrc = fs.readFileSync(path.join(root, 'src/engine/skills.js'), 'utf8');

function makeDaqiaoGame() {
  const game = Engine.newGame({ seed: 110, startWithFirstTurn: true, playerHero: 'sunquan', enemyHero: 'daqiao' });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

function dealSha(state, id) {
  const card = { id, type: 'sha', name: '杀', suit: 'spade', color: 'black' };
  state.hand.push(card);
  return card;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v8 PR-C2: SKILL_METADATA 已注册 liuli (trigger=shaTargetedAfter)', () => {
  // 检查 SKILL_METADATA 表中 liuli 条目存在 + 关键字段
  assert.match(heroesSrc, /liuli:\s*\{.*trigger:\s*'shaTargetedAfter'/);
  assert.match(heroesSrc, /liuli:\s*\{.*hooks:\s*\[\s*'onShaTargeted'\s*\]/);
});

test('v8 PR-C2: 引擎注册 liuli onShaTargeted hook + 调用 triggerLiuliOnShaTargeted', () => {
  assert.match(skillsSrc, /SkillRuntime\.registerSkill\(skillRegistry,\s*'liuli'/);
  // v12 F1: 流离 helper 已迁往 skills.js
  assert.match(skillsSrc, /function triggerLiuliOnShaTargeted/);
});

test('v8 PR-C2: playSha 在 cixiong 后触发 onShaTargeted hook', () => {
  // 检查 playSha 末尾在 cixiong 后调 SkillRuntime.runHook(... 'onShaTargeted'
  assert.match(engineSrc, /runHook\(skillRegistry,\s*'onShaTargeted'/);
});

test('v8 PR-C2: 1v1 — 大乔成为杀目标 + 有手牌 → 流离静默不触发, 杀照常结算', () => {
  const game = makeDaqiaoGame();
  // enemy 是 大乔, 给她 1 张手牌 (可弃)
  game.enemy.hand.push({ id: 'foe-tao', type: 'tao', name: '桃', suit: 'heart', color: 'red' });
  dealSha(game.player, 'p-sha');
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'p-sha');
  // 1v1 无第三方可转 → 流离 silent → 大乔 受 1 dmg
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '1v1 流离 no-op → 杀照常造伤');
  // 大乔手牌没动 (流离 没弃)
  assert.ok(game.enemy.hand.some((c) => c.id === 'foe-tao'));
});

test('v8 PR-C2: 大乔 无可弃牌 → 流离 condition fail (helper 返回 null)', () => {
  const game = makeDaqiaoGame();
  // enemy 大乔 完全无牌 (无手牌 / 无装备 / 无判定)
  dealSha(game.player, 'p-sha2');
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'p-sha2');
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '无可弃 → 流离 不触发 → 1 dmg');
});

test('v8 PR-C2: 非大乔成为杀目标 → 流离不影响 (无技能)', () => {
  const game = Engine.newGame({ seed: 110, startWithFirstTurn: true, playerHero: 'sunquan', enemyHero: 'caocao' });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  game.enemy.hand.push({ id: 'foe-tao-non-dq', type: 'tao', name: '桃', suit: 'heart', color: 'red' });
  dealSha(game.player, 'p-sha-non-dq');
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'p-sha-non-dq');
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '非大乔 → 流离不触发');
});

test('v8 PR-C2: 大乔成为杀目标 + 闪 在手 → 闪正常生效 (流离 hook 不破坏响应流程)', () => {
  const game = makeDaqiaoGame();
  game.enemy.hand.push({ id: 'foe-shan', type: 'shan', name: '闪', suit: 'heart', color: 'red' });
  dealSha(game.player, 'p-sha-shan');
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'p-sha-shan');
  assert.equal(game.enemy.hp, enemyHpBefore, '闪挡杀 → 无伤; 流离 hook 不破坏 response');
});

test('v8 PR-C2: docs/data — daqiao 仍带 liuli skill descriptor', () => {
  // 验证 大乔 hero entry 还在; SKILL_METADATA 已经在第 1 条断言里覆盖
  assert.match(heroesSrc, /daqiao[^}]+skills:\s*\[[^\]]*liuli/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
