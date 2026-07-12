import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { makeStartGameViaUI } from './helpers/ui-game.mjs';

// v12 G2: 神速 (shensu-options) + 鬼道 (guidao-replace, 复用鬼才面板 DOM)
// 面板全链路 — 用 Engine.startTurn 触发真实回合开始 (prepare/judge 阶段),
// 而非 makeStartGameViaUI 惯用的"落地即 play 阶段"直接改写 (那会绕过
// prepare/judge 阶段, 两个新 kind 都恰好挂在那两个阶段, 必须走真实流程)。

const dom = installFakeDom();
const { Engine } = await import('./helpers/load-engine.mjs');
await import('../src/ui/dom-adapter.js');

const UI = globalThis.window.SanguoshaUI;
const $ = dom.$;

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

const startGameViaUI = makeStartGameViaUI($, UI);

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── 神速面板 (kind: shensu-options) ─────────────────────────────────

test('神速面板: 夏侯渊回合开始 → 面板可见 → 选"不发动" → 面板关闭且回合进入判定/摸牌流程', () => {
  const game = startGameViaUI('xiahouyuan', 'huaxiong');

  Engine.startTurn(game, 'player');
  UI.render();

  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'shensu-options', '回合开始即挂起神速面板');
  assert.equal($('shensuOptionsPanel').hidden, false, '神速面板可见');
  assert.match($('shensuOptionsHint').textContent, /神速/, '提示带技能名');

  $('shensuDeclineBtn').click();

  assert.equal(game.pendingChoice, null, '选择已提交');
  assert.equal($('shensuOptionsPanel').hidden, true, '面板关闭');
  assert.ok(game.log.some((line) => line.indexOf('不发动【神速】') >= 0), '日志记录不发动');
  assert.equal(game.player.hand.length, 2, '正常摸牌阶段摸了 2 张牌（回合已推进过判定/摸牌）');
});

test('神速面板: 选"仅选项一" → 跳过摸牌阶段 (手牌不增) 且虚拟【杀】命中对手', () => {
  const game = startGameViaUI('xiahouyuan', 'huaxiong');
  game.enemy.hand = []; // 无闪可出 → 必定受伤, 断言确定
  const enemyHpBefore = game.enemy.hp;

  Engine.startTurn(game, 'player');
  UI.render();
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'shensu-options');

  $('shensuOptionOneBtn').click();

  assert.equal(game.pendingChoice, null, '虚拟【杀】已由 AI 座席自动结算（无手动响应偏好）');
  assert.equal(game.player.hand.length, 0, '跳过摸牌阶段，手牌不增');
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '无距离限制虚拟【杀】命中，对手掉 1 血');
  assert.equal($('shensuOptionsPanel').hidden, true, '面板关闭');
});

test('神速面板: 选"仅选项二" → 展示装备候选 (未选禁止确认) → 选中确认 → 弃装备且跳过出牌阶段', () => {
  const game = startGameViaUI('xiahouyuan', 'huaxiong');
  game.player.hand = [c('zhuge', { id: 'ss-equip' })];
  game.enemy.hand = [];
  const enemyHpBefore = game.enemy.hp;

  Engine.startTurn(game, 'player');
  UI.render();
  assert.equal(game.pendingChoice.canOptionTwo, true, '手牌区装备可作候选');

  $('shensuOptionTwoBtn').click();
  assert.match($('shensuEquipCandidates').innerHTML, /ss-equip/, '装备候选渲染');
  assert.equal($('shensuConfirmEquipBtn').hidden, false, '进入选装备子步骤后确认按钮可见');
  assert.equal($('shensuConfirmEquipBtn').disabled, true, '未选装备前确认禁用');

  $('shensuEquipCandidates').dispatchClick({ 'data-shensu-equip-id': 'ss-equip' });
  assert.equal($('shensuConfirmEquipBtn').disabled, false, '选中装备后确认可用');

  $('shensuConfirmEquipBtn').click();

  assert.equal(game.pendingChoice, null, '选择已提交');
  assert.ok(!game.player.hand.some((card) => card.id === 'ss-equip'), '装备牌已弃置离手');
  assert.ok(game.discard.some((card) => card.id === 'ss-equip'), '装备牌进入弃牌堆');
  // v12 G2 修复回归: 仅选项二时 skipPlay 曾被 processJudgeArea 的"非续跑"
  // 分支复位覆盖 (回合级复位职责已归还 phases.js) — 修复后此处必须断言
  // 出牌阶段确实被跳过。
  assert.equal(game.player.flags.skipPlay, true, '选项二: skipPlay 存活到判定阶段之后');
  assert.equal(game.phase, 'discard', '选项二: 跳过出牌阶段直落弃牌阶段');
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '虚拟【杀】命中，对手掉 1 血');
  assert.equal($('shensuOptionsPanel').hidden, true, '面板关闭');
});

test('神速面板: 没有装备可弃 → 选项二/一+二 按钮禁用', () => {
  const game = startGameViaUI('xiahouyuan', 'huaxiong');
  game.player.hand = []; // 无手牌装备, 装备区已由 startGameViaUI 清空

  Engine.startTurn(game, 'player');
  UI.render();

  assert.equal(game.pendingChoice.canOptionTwo, false, '无装备可弃');
  assert.equal($('shensuOptionTwoBtn').disabled, true, '选项二禁用');
  assert.equal($('shensuBothBtn').disabled, true, '一+二禁用');

  $('shensuDeclineBtn').click();
  assert.equal(game.pendingChoice, null);
});

// ───── 鬼道复用鬼才面板 (kind: guidao-replace) ─────────────────────────

test('鬼道复用鬼才面板: 张角自己判定乐不思蜀 → guidao-replace 面板 → 选中黑牌确认 → 判定牌被替换', () => {
  const game = startGameViaUI('zhangjiao', 'liubei');
  game.player.hand = [c('sha', { id: 'ui-gd-black', suit: 'spade', color: 'black', rank: '9' })];
  game.player.judgeArea = [c('lebusishu', { id: 'ui-gd-lebu', suit: 'club', color: 'black' })];
  game.deck = [
    c('sha', { id: 'gd-pad-1' }),
    c('sha', { id: 'gd-pad-2' }),
    c('sha', { id: 'gd-pad-3' }),
    c('sha', { id: 'gd-pad-4' }),
    c('tao', { id: 'ui-gd-orig', suit: 'diamond', color: 'red', rank: '3' })
  ];

  Engine.startTurn(game, 'player');
  UI.render();

  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'guidao-replace', '鬼道挂起');
  assert.equal(game.pendingChoice.judgementActor, 'player', '判定归属为玩家自己');
  assert.equal($('guicaiPromptPanel').hidden, false, '复用鬼才面板弹出');
  assert.match($('guicaiPromptHint').textContent, /鬼道/, '提示文案标注鬼道（非鬼才）');
  assert.match($('guicaiCandidates').innerHTML, /ui-gd-black/, '候选黑牌渲染');

  $('guicaiCandidates').dispatchClick({ 'data-guicai-card-id': 'ui-gd-black' });
  $('handConfirmBtn').click();

  assert.equal(game.pendingChoice, null, '选择已提交');
  assert.ok(!game.player.hand.some((card) => card.id === 'ui-gd-black'), '替换牌离手');
  assert.ok(game.discard.some((card) => card.id === 'ui-gd-orig'), '原判定牌进弃牌堆');
  assert.ok(
    game.log.some((line) => line.indexOf('鬼道') >= 0 && line.indexOf('ui-gd-black') >= 0),
    '日志确认正是这张候选黑牌被打出替换判定牌'
  );
  assert.equal($('guicaiPromptPanel').hidden, true, '面板关闭');
});

test('鬼道复用鬼才面板: 点"不发动" → 原判定生效（面板 decline 路径与鬼才共用）', () => {
  const game = startGameViaUI('zhangjiao', 'liubei');
  game.player.hand = [c('sha', { id: 'ui-gd-black2', suit: 'club', color: 'black' })];
  game.player.judgeArea = [c('lebusishu', { id: 'ui-gd-lebu2', suit: 'club', color: 'black' })];
  game.deck = [
    c('sha', { id: 'gd2-pad-1' }),
    c('sha', { id: 'gd2-pad-2' }),
    c('sha', { id: 'gd2-pad-3' }),
    c('sha', { id: 'gd2-pad-4' }),
    c('sha', { id: 'ui-gd-orig2', suit: 'spade', color: 'black', rank: '7' })
  ];

  Engine.startTurn(game, 'player');
  UI.render();
  assert.equal($('guicaiPromptPanel').hidden, false);

  $('guicaiDeclineBtn').click();

  assert.equal(game.pendingChoice, null);
  assert.equal(game.player.flags.skipPlay, true, '黑桃原判定生效 → 乐不思蜀跳过出牌阶段');
  assert.ok(game.player.hand.some((card) => card.id === 'ui-gd-black2'), '手牌保留（未打出）');
  assert.equal($('guicaiPromptPanel').hidden, true, '面板关闭');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
