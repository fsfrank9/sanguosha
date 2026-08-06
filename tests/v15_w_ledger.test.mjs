// v15 W1: 散账清零的行为钉。
// 路线图 W1 要求"逐项 做/收案 二选一, 不许继续无声漂移" —— 凡裁定为"做"的,
// 这里各留一条会红的钉; 凡裁定为"收案"的, 裁定理由入
// docs/audit/2026-08-06-w-ledger.md, 不在此文件钉。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Engine, c } from './helpers/load-engine.mjs';
import { CARD_CATALOG } from '../src/data/cards.js';
import { test, runTests } from './helpers/harness.mjs';

const root = path.resolve(import.meta.dirname, '..');

function duel(playerHero, enemyHero = 'caocao', seed = 95001) {
  const game = Engine.newGame({ seed, playerHero, enemyHero });
  game.log = []; game.discard = [];
  game.deck = Array.from({ length: 12 }, (_, i) => c('sha', { id: 'wk' + i, suit: 'spade', rank: '5' }));
  for (const seat of ['player', 'enemy']) {
    game[seat].hand = []; game[seat].judgeArea = []; game[seat].flags = {};
    game[seat].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[seat].hp = game[seat].maxHp; game[seat].skillPreferences = {};
  }
  game.turn = 'player'; game.phase = 'play';
  game.pendingChoice = null; game.pendingChoiceQueue = []; game.pauseState = {};
  return game;
}

// ───── W1-a: AI 反间挂起的返回形状 (v14 P4 滚动候选回收) ─────

test('W1-a: AI 反间挂起时 runAITurn 返回带 ok 的正常结果 (此前裸返 {suspendedForFanjian})', () => {
  const game = duel('caocao', 'zhouyu', 95010);
  game.turn = 'enemy'; game.phase = 'play';
  game.enemy.hand = [c('tao', { id: 'fj-give', suit: 'heart' })];
  game.player.hp = 2; // oppLowHp → AI 启发会发动反间
  const result = Engine.runAITurn(game, 'enemy');
  assert.equal(typeof result.ok, 'boolean', 'runAITurn 的返回必须带 ok 字段');
  assert.equal(result.ok, true);
  assert.equal(result.action, 'paused', '挂起走 aiTurnPaused 的标准形状');
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'fanjian-guess');
});

test('W1-a: 反间挂起结果仍带 suspendedForFanjian 标记 (附加字段, 不替代 ok)', () => {
  const game = duel('caocao', 'zhouyu', 95011);
  game.turn = 'enemy'; game.phase = 'play';
  game.enemy.hand = [c('tao', { id: 'fj2', suit: 'heart' })];
  const direct = Engine.useSkill(game, 'enemy', 'fanjian', ['fj2'], { target: 'player' });
  assert.equal(direct.ok, true);
  assert.equal(direct.suspendedForFanjian, true);
});

// ───── W1-c ①: 克己可选 (官方 "你可以跳过弃牌阶段") ─────

test('W1-c①: 克己缺省仍跳过弃牌阶段 (零行为回归)', () => {
  const game = duel('lvmeng');
  game.player.hand = Array.from({ length: 8 }, (_, i) => c('sha', { id: 'kj' + i }));
  game.player.usedOrRespondedSha = false;
  Engine.finishPlayPhase(game);
  assert.equal(game.phase, 'finish', '未出杀 → 跳过弃牌阶段');
});

test('W1-c①: skillPreferences.keji = decline → 照常进入弃牌阶段', () => {
  const game = duel('lvmeng');
  game.player.hand = Array.from({ length: 8 }, (_, i) => c('sha', { id: 'kj2-' + i }));
  game.player.usedOrRespondedSha = false;
  game.player.skillPreferences.keji = 'decline';
  Engine.finishPlayPhase(game);
  assert.equal(game.phase, 'discard', '官方是"你可以"— 放弃发动就要真的进弃牌阶段');
  assert.ok(game.log.some((line) => line.includes('选择不发动【克己】')));
});

test('W1-c①: 出过杀则本就不满足条件, 与偏好无关', () => {
  const game = duel('lvmeng');
  game.player.hand = [c('sha', { id: 'kj3' })];
  game.player.usedOrRespondedSha = true;
  Engine.finishPlayPhase(game);
  assert.equal(game.phase, 'discard');
});

// ───── W1-c ②: randomSuit 确定性兜底 ─────

test('W1-c②: randomSuit 无 game.random 时确定性 (同态必然同花色)', () => {
  // 反间对 AI 目标走 randomSuit; 抹掉 game.random 模拟兜底路径。
  function guessOnce() {
    const game = duel('zhouyu', 'caocao', 95020);
    game.random = null;
    game.enemy.hand = [];
    game.player.hand = [c('tao', { id: 'rs-give', suit: 'heart' })];
    Engine.useSkill(game, 'player', 'fanjian', ['rs-give'], { target: 'enemy' });
    return game.log.join('|');
  }
  const a = guessOnce();
  const b = guessOnce();
  assert.equal(a, b, '同一局面下兜底必须复现同一结果 (此前 Math.random 会漂)');
});

test('W1-c②: 引擎里不再有 Math.random 作为随机源兜底', () => {
  const engineDir = path.join(root, 'src/engine');
  const offenders = [];
  for (const file of fs.readdirSync(engineDir)) {
    if (!file.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(engineDir, file), 'utf8');
    src.split('\n').forEach((line, i) => {
      if (line.trim().startsWith('//')) return;
      if (line.includes('Math.random')) offenders.push(`${file}:${i + 1} ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [],
    '引擎的随机源必须恒为 game.random (种子可复现是守恒 fuzz 档的前提)');
});

// ───── W1-c ②(续): 隐藏横幅的写入不再是必需节点 ─────

test('W1-c②: #statusBanner 三处写入已加存在性守卫 (装饰性, 不该带崩渲染)', () => {
  const src = fs.readFileSync(path.join(root, 'src/ui/panels/board-panels.js'), 'utf8');
  for (const el of ['statusTitle', 'statusText', 'deckInfo']) {
    assert.match(src, new RegExp('if \\(els\\.' + el + '\\) els\\.' + el + '\\.textContent'),
      el + ' 的写入应有存在性守卫');
  }
});

// ───── W2 F2: 反馈是"你可以" — 窗口内必须留放弃出路 ─────
// 官方逐字 card__hero__wei.md:61「每当你受到伤害后，你**可以**获得来源的
// 一张牌」。此前唯一的放弃路径是伤害发生**前**把 skillPreferences.fankui
// 设成 decline; 窗口一开 resolver 只认 zone: hand/equipment, 别的一律重挂,
// UI 面板也只有区域钮。身份场里这不是洁癖: 司马懿被队友误伤会被迫偷队友的牌。

test('W2-F2: 反馈玩家窗口可以放弃 (decline), 来源的牌一张不动', () => {
  const game = duel('simayi', 'caocao', 95030);
  game.turn = 'enemy'; game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'fk-sha' }), c('tao', { id: 'fk-loot' })];
  game.player.skillPreferences.shanResponse = 'auto';
  Engine.playCard(game, 'enemy', 'fk-sha', { target: 'player' });
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'fankui-pick', '反馈开窗');
  const enemyHandBefore = game.enemy.hand.length;
  const playerHandBefore = game.player.hand.length;
  const result = Engine.resolvePendingChoice(game, { decline: true });
  assert.equal(result.ok, true);
  assert.equal(game.pendingChoice, null, '放弃后窗口收掉 (此前无路可退)');
  assert.equal(game.enemy.hand.length, enemyHandBefore, '来源手牌不动');
  assert.equal(game.player.hand.length, playerHandBefore, '自己也没多牌');
  assert.ok(game.log.some((line) => line.includes('选择不发动【反馈】')));
});

test('W2-F2: 反馈照常发动仍能获得来源一张牌 (零行为回归)', () => {
  const game = duel('simayi', 'caocao', 95031);
  game.turn = 'enemy'; game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'fk2-sha' }), c('tao', { id: 'fk2-loot' })];
  game.player.skillPreferences.shanResponse = 'auto';
  Engine.playCard(game, 'enemy', 'fk2-sha', { target: 'player' });
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'fankui-pick');
  const playerHandBefore = game.player.hand.length;
  Engine.resolvePendingChoice(game, { zone: 'hand' });
  assert.equal(game.player.hand.length, playerHandBefore + 1, '获得来源一张手牌');
  assert.equal(game.enemy.hand.length, 0);
});

test('W2-F2: 非法 zone 仍按惯例重挂并报错 (放弃分支不吞掉输入校验)', () => {
  const game = duel('simayi', 'caocao', 95032);
  game.turn = 'enemy'; game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'fk3-sha' }), c('tao', { id: 'fk3-loot' })];
  game.player.skillPreferences.shanResponse = 'auto';
  Engine.playCard(game, 'enemy', 'fk3-sha', { target: 'player' });
  const bad = Engine.resolvePendingChoice(game, { zone: 'judge' });
  assert.equal(bad.ok, false);
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'fankui-pick', '重挂等待重选');
});

test('W2-F2: UI 反馈面板有"不发动"钮且入 dispatch 表', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="fankuiDeclineBtn"/, '面板有放弃钮');
  const adapter = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8');
  assert.match(adapter, /panelId: 'fankuiPromptPanel',[^\n]*cancelBtnId: 'fankuiDeclineBtn'/,
    '放弃钮登记为该面板的取消钮');
});

// ───── W2 覆盖度审查: 全牌型必须有可达的使用出口 ─────
// audit4 方法论的"覆盖度审查"一环 (当时是 53 技 + 33 牌型零漏审), 本轮
// 101 技 + 39 牌型。技能侧的覆盖不变量在 skill_schema (W2-F3) 与
// ui_pending_kind_coverage (W1) 里; 这里补牌型侧。
test('W2 覆盖度: 39 个牌型逐个有使用出口 (自有 handler / 族共用 / 显式仅响应)', () => {
  const engineSrc = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const registered = new Set(
    [...engineSrc.matchAll(/registerPlayHandler\('([a-z_]+)'/g)].map((m) => m[1]),
  );
  // playHandlerKey 的族级归并: 杀类 → 'sha', 装备 → 'equipment', 延时 → 'delayed'。
  const familyKey = { equipment: 'equipment', delayed: 'delayed' };
  // 仅响应牌: 从不主动使用 (playCard 显式拒绝), 因此不需要 handler。
  const RESPONSE_ONLY = new Set(['shan', 'wuxie']);

  const missing = [];
  for (const [type, info] of Object.entries(CARD_CATALOG)) {
    if (RESPONSE_ONLY.has(type)) continue;
    const key = /sha$/.test(type) ? 'sha' : (familyKey[info.family] || type);
    if (!registered.has(key)) missing.push(`${type} (family=${info.family}, 期望 handler key=${key})`);
  }
  assert.deepEqual(missing, [],
    '这些牌型没有任何使用出口 — 玩家拿到了也打不出去: ' + missing.join(', '));

  // 反向: 仅响应牌确实被 playCard 显式拒绝 (而不是悄悄走 default handler)。
  for (const type of RESPONSE_ONLY) {
    assert.ok(!registered.has(type), `${type} 是仅响应牌, 不该注册使用 handler`);
  }
  assert.match(engineSrc, /只能用于响应，本版会自动打出/, 'playCard 对仅响应牌有显式拒绝');
});

runTests(import.meta.url);
