// v13 K3 (audit backlog 销账): 天香 ask 面板 + 火攻成本重选面板的
// fake-DOM 全链路行为测试 — J2/J3 引擎级 resolver 测试已覆盖决策正确性,
// 本文件补 UI 差集: 渲染出现/hint 文案/候选枚举/门禁态/两种提交模型
// (天香=面板自带确认直提, 火攻=stage 后 hand-confirm 两段式)/放弃路径/
// 面板关闭与局部状态复位。
// 附带回归哨兵: huogongCostRepickChoices 唯一 id (v13 K3 修复 —— 原
// huogongCostChoices 与 huogongModePanel 内重复, 真实浏览器 getElementById
// 取文档序首个, 重选候选渲染进隐藏旧面板; fake-dom 注册表语义不建模文档
// 序, 故以 index.html 源码文本断言唯一性)。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakeDom } from './helpers/fake-dom.mjs';

const dom = installFakeDom();
const { Engine } = await import('./helpers/load-engine.mjs');
await import('../src/ui/dom-adapter.js');

const UI = globalThis.window.SanguoshaUI;
const $ = dom.$;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

// 真实 lobby 流程开局 (dom-adapter 会给玩家席设 tianxiang/huogongCost='ask'
// 等 UI 偏好), 然后整形成确定性局面。
function startDuelViaUI(playerHero, enemyHero) {
  $('lobby1v1Btn').click();
  $('modeDuelBtn').click();
  $('playerHeroSelect').value = playerHero;
  $('enemyHeroSelect').value = enemyHero;
  $('startGameBtn').click();
  for (let retry = 0; UI.getGame().turn !== 'player' && retry < 40; retry += 1) {
    $('lobby1v1Btn').click();
    $('modeDuelBtn').click();
    $('playerHeroSelect').value = playerHero;
    $('enemyHeroSelect').value = enemyHero;
    $('startGameBtn').click();
  }
  $('exitConfirmModal').hidden = true;
  const game = UI.getGame();
  game.turn = 'player';
  game.phase = 'play';
  for (const seat of ['player', 'enemy']) {
    game[seat].hand = [];
    game[seat].judgeArea = [];
    game[seat].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[seat].hp = game[seat].maxHp;
    game[seat].flags = {};
  }
  game.log = [];
  game.discard = [];
  game.deck = [];
  game.pendingChoice = null;
  game.pendingChoiceQueue = [];
  game.pauseState = {};
  UI.render();
  return game;
}

// 天香挂起局面: 小乔玩家持红桃, 吕蒙敌方出杀 (敌方出牌走引擎 API — 敌方
// 行动不经 UI 点击路径), 伤害流在 onDamageModify 钩子前挂起 tianxiang-ask。
function triggerTianxiangAsk() {
  const game = startDuelViaUI('xiaoqiao', 'lvmeng');
  game.turn = 'enemy';
  game.phase = 'play';
  game.deck = [c('shan', { id: 'tx-d1' }), c('shan', { id: 'tx-d2' }), c('shan', { id: 'tx-d3' }), c('shan', { id: 'tx-d4' })];
  game.player.hand = [c('tao', { id: 'p-heart', suit: 'heart', color: 'red' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  const res = Engine.playCard(game, 'enemy', 'e-sha');
  assert.equal(res.ok, true, res.message);
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'tianxiang-ask', '天香挂起');
  UI.render();
  return game;
}

// 火攻三重巧合挂起局面 (布局复用 v13_j2_huogong_cost_repick): 显式 club
// 成本 × 展示缓存被无懈拉锯消耗 × 重展示只剩 heart → 成本失效挂起重选。
function triggerHuogongCost() {
  const game = startDuelViaUI('liubei', 'caocao');
  game.player.hand = [
    c('huogong', { id: 'hg' }),
    c('sha', { id: 'c-club', suit: 'club', color: 'black' }),
    c('sha', { id: 'c-heart', suit: 'heart', color: 'red' }),
    c('wuxie', { id: 'p-wx', suit: 'diamond', color: 'red' })
  ];
  game.enemy.hand = [
    c('wuxie', { id: 'e-wx', suit: 'club', color: 'black' }),
    c('shan', { id: 'e-heart', suit: 'heart', color: 'red' })
  ];
  game.enemy.hp = 2; // 火攻 EV: hp<=2 才无懈
  game.pauseState.huogongReveal = { targetActor: 'enemy', cardId: 'e-wx' };
  // UI 缺省 wuxieResponse='ask' 会让玩家反无懈也挂起; 本场景要走确定性
  // 无懈拉锯 (敌无懈→玩家自动反无懈), 收敛为 auto。
  game.player.skillPreferences.wuxieResponse = 'auto';
  const res = Engine.playCard(game, 'player', 'hg', { huogongCostCardId: 'c-club' });
  assert.equal(res.ok, true, res.message);
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'huogong-cost', '火攻成本重选挂起');
  UI.render();
  return game;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── 回归哨兵: id 唯一性 (真实浏览器语义) ─────────────────────────

test('哨兵: index.html 内 huogongCostRepickChoices 唯一且旧 huogongCostChoices 仅存于 huogongModePanel', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const repickHits = html.match(/id="huogongCostRepickChoices"/g) || [];
  const oldHits = html.match(/id="huogongCostChoices"/g) || [];
  assert.equal(repickHits.length, 1, '重选候选容器 id 全文唯一');
  assert.equal(oldHits.length, 1, '旧 id 仅剩 huogongModePanel 一处 (id 冲突已修)');
});

// ───── 天香 ask 面板 ────────────────────────────────────────────────

test('天香: 面板弹出 + 候选/目标枚举 + 确认门禁 (未选成本时禁用)', () => {
  triggerTianxiangAsk();
  assert.equal($('tianxiangAskPanel').hidden, false, '面板弹出');
  assert.equal($('huogongCostPanel').hidden, true, '互斥面板保持隐藏');
  assert.match($('tianxiangCostChoices').innerHTML, /data-tianxiang-cost-id="p-heart"/, '红桃成本候选渲染');
  assert.match($('tianxiangTargetChoices').innerHTML, /data-tianxiang-target="enemy"/, '转移目标候选渲染');
  assert.match($('tianxiangTargetChoices').innerHTML, /selected/, '1v1 唯一目标自动预选');
  assert.equal($('tianxiangConfirmBtn').disabled, true, '未选成本 → 确认禁用');
});

test('天香: 点成本 → 确认放行 → 直提转移 (伤害落点/弃牌/面板关闭)', () => {
  const game = triggerTianxiangAsk();
  const enemyHpBefore = game.enemy.hp;
  $('tianxiangCostChoices').dispatchClick({ 'data-tianxiang-cost-id': 'p-heart' });
  assert.equal($('tianxiangConfirmBtn').disabled, false, '成本+目标齐 → 确认放行');
  $('tianxiangConfirmBtn').click();
  assert.equal(game.pendingChoice, null, '决策落地');
  assert.equal($('tianxiangAskPanel').hidden, true, '面板关闭');
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '伤害转移落敌方');
  assert.equal(game.player.hp, game.player.maxHp, '玩家未掉血');
  assert.ok(game.discard.some((x) => x.id === 'p-heart'), '红桃成本弃置');
});

test('天香: 放弃 → 伤害原地结算 + 红桃保留 + 二次挂起无残留预选', () => {
  const game = triggerTianxiangAsk();
  $('tianxiangDeclineBtn').click();
  assert.equal(game.pendingChoice, null);
  assert.equal($('tianxiangAskPanel').hidden, true);
  assert.equal(game.player.hp, game.player.maxHp - 1, '放弃 → 伤害原地结算');
  assert.ok(game.player.hand.some((x) => x.id === 'p-heart'), '红桃保留');
  // 二次触发同 kind — 模块级成本选择应已复位 (确认门禁重新禁用)。
  const game2 = triggerTianxiangAsk();
  assert.equal($('tianxiangConfirmBtn').disabled, true, '无残留预选');
  assert.ok(game2.pendingChoice, '二次挂起正常');
  $('tianxiangDeclineBtn').click();
});

// ───── 火攻成本重选面板 (stage → hand-confirm 两段式) ───────────────

test('火攻重选: 面板弹出 + hint 带重展示牌 + 候选渲染进唯一 id 容器', () => {
  triggerHuogongCost();
  assert.equal($('huogongCostPanel').hidden, false, '重选面板弹出');
  assert.equal($('huogongModePanel').hidden, true, '旧火攻模式面板保持隐藏');
  assert.match($('huogongCostHint').textContent, /闪/, 'hint 含重展示牌名');
  assert.match($('huogongCostHint').textContent, /♥/, 'hint 含花色');
  assert.match($('huogongCostRepickChoices').innerHTML, /data-huogong-cost-card-id="c-heart"/,
    '同花色候选渲染进唯一 id 容器');
  assert.doesNotMatch($('huogongCostRepickChoices').innerHTML, /c-club/, '失效花色不入候选');
});

test('火攻重选: 点候选仅 stage (不直提) → hand-confirm 才结算', () => {
  const game = triggerHuogongCost();
  $('huogongCostRepickChoices').dispatchClick({ 'data-huogong-cost-card-id': 'c-heart' });
  assert.ok(game.pendingChoice, '点候选仅暂存, pendingChoice 未消');
  assert.equal(game.enemy.hp, 2, '未结算伤害');
  $('handConfirmBtn').click();
  assert.equal(game.pendingChoice, null, 'hand-confirm 提交决策');
  assert.equal($('huogongCostPanel').hidden, true, '面板关闭');
  assert.equal(game.enemy.hp, 1, '重选成本后火攻命中 1 点');
  assert.ok(game.discard.some((x) => x.id === 'c-heart'), '重选成本弃置');
});

test('火攻重选: 不弃置按钮直提 → 无伤结算 + 两张成本保留', () => {
  const game = triggerHuogongCost();
  $('huogongCostDeclineBtn').click();
  assert.equal(game.pendingChoice, null);
  assert.equal($('huogongCostPanel').hidden, true);
  assert.equal(game.enemy.hp, 2, '不弃置 → 无伤结算');
  assert.ok(game.player.hand.some((x) => x.id === 'c-heart'), 'heart 保留');
  assert.ok(game.player.hand.some((x) => x.id === 'c-club'), 'club 保留');
});

let passed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed += 1; console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
console.log(`${passed}/${tests.length} 个面板 DOM 用例通过。`);
