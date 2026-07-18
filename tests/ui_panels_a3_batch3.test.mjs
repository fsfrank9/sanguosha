import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { makeStartGameViaUI } from './helpers/ui-game.mjs';

// v11 A3 批次三: 5 个面板的全链路行为测试 (弹出 → 点选 → 引擎状态 → 关闭)。
// 覆盖: 观星 (三区分配) / 反间 (花色盲猜) / 雌雄发动 / 雌雄应对 / 铁索模式。
// 模式同 tests/ui_panels_a3_batch1/2.test.mjs (fake-DOM 垫片, 真实 dom-adapter)。

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

// ───── 观星面板 (kind: guanxing-reorder) ──────────────────────────────

test('观星面板: 诸葛亮回合开始 → 弹出 → 逐张分配顶/底 → 确认后按序摸牌', () => {
  const game = startGameViaUI('zhugeliang', 'sunquan');
  game.deck = [
    c('sha', { id: 'gx-extra-a' }),
    c('sha', { id: 'gx-extra-b' }),
    c('sha', { id: 'gx-bottom' }),
    c('sha', { id: 'gx-top' })
  ];

  Engine.startTurn(game, 'player');
  UI.render();
  assert.equal($('guanxingModePanel').hidden, false, '观星面板弹出');
  assert.match($('guanxingUnassigned').innerHTML, /gx-top/, '待分配区渲染');
  assert.equal($('guanxingConfirmBtn').disabled, true, '未分配完 → 确认禁用');

  // 选中 gx-top → 放到牌堆顶; 选中 gx-bottom → 放到牌堆底
  $('guanxingUnassigned').dispatchClick({ 'data-guanxing-card-id': 'gx-top' });
  $('guanxingTopBtn').click();
  assert.equal($('guanxingConfirmBtn').disabled, true, '还剩 1 张 → 仍禁用');
  $('guanxingUnassigned').dispatchClick({ 'data-guanxing-card-id': 'gx-bottom' });
  $('guanxingBottomBtn').click();
  assert.equal($('guanxingConfirmBtn').disabled, false, '全部分配 → 确认放行');

  $('guanxingConfirmBtn').click();
  assert.equal(game.pendingChoice, null, '重排已提交');
  assert.ok(game.player.hand.some((card) => card.id === 'gx-top'), '顶置牌被摸走 (摸牌阶段)');
  assert.equal(game.deck[0].id, 'gx-bottom', '底置牌沉入牌堆底');
  assert.equal($('guanxingModePanel').hidden, true, '面板关闭');
});

test('观星面板: 点"跳过观星" → 不重排, 标记已用, 回合续跑', () => {
  const game = startGameViaUI('zhugeliang', 'sunquan');
  game.deck = [
    c('sha', { id: 'gx2-a' }),
    c('sha', { id: 'gx2-b' }),
    c('sha', { id: 'gx2-c' }),
    c('sha', { id: 'gx2-d' })
  ];

  Engine.startTurn(game, 'player');
  UI.render();
  assert.equal($('guanxingModePanel').hidden, false);

  $('guanxingDeclineBtn').click();
  assert.equal(game.pendingChoice, null);
  assert.equal(game.player.flags.guanxingUsed, true, '观星标记已用 (每回合一次)');
  assert.equal(game.phase, 'play', '回合续跑到出牌阶段');
  assert.equal(game.player.hand.length, 2, '摸牌阶段照常摸 2');
  assert.equal($('guanxingModePanel').hidden, true, '面板关闭');
});

// ───── 反间面板 (kind: fanjian-guess) ─────────────────────────────────

// 花色按钮在 index.html 上自带 data-fanjian-suit 属性; fake-DOM 惰性元素
// 不解析 HTML, 测试里手动补上同名属性再点击。
function armFanjianSuitButtons() {
  $('fanjianSpadeBtn').setAttribute('data-fanjian-suit', 'spade');
  $('fanjianHeartBtn').setAttribute('data-fanjian-suit', 'heart');
  $('fanjianClubBtn').setAttribute('data-fanjian-suit', 'club');
  $('fanjianDiamondBtn').setAttribute('data-fanjian-suit', 'diamond');
}

test('反间面板: 敌方周瑜反间 → 弹出 → 猜对花色 → 无伤害, 猜后牌才入手 (v13)', () => {
  const game = startGameViaUI('liubei', 'zhouyu');
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'ui-fj-card', suit: 'heart', color: 'red' })];
  armFanjianSuitButtons();
  const playerHp = game.player.hp;

  Engine.useSkill(game, 'enemy', 'fanjian', ['ui-fj-card']);
  UI.render();
  assert.equal($('fanjianPromptPanel').hidden, false, '反间面板弹出');
  // v13 审计三轮: 官方顺序 = 先声明花色再获得牌 — 猜测落定前牌不进手牌区
  // (此前先入手, 人类目标可从手牌区读出真实花色永不猜错)。
  assert.ok(!game.player.hand.some((card) => card.id === 'ui-fj-card'), '猜测前牌不在手牌区');

  $('fanjianHeartBtn').click(); // stage {suit:'heart'}
  $('handConfirmBtn').click();
  assert.equal(game.pendingChoice, null, '猜测已提交');
  assert.equal(game.player.hp, playerHp, '猜对 (红桃) → 无伤害');
  assert.ok(game.player.hand.some((card) => card.id === 'ui-fj-card'), '猜后牌入手');
  assert.equal($('fanjianPromptPanel').hidden, true, '面板关闭');
});

test('反间面板: 猜错花色 → 受 1 点伤害', () => {
  const game = startGameViaUI('liubei', 'zhouyu');
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'ui-fj2-card', suit: 'heart', color: 'red' })];
  armFanjianSuitButtons();
  const playerHp = game.player.hp;

  Engine.useSkill(game, 'enemy', 'fanjian', ['ui-fj2-card']);
  UI.render();
  assert.equal($('fanjianPromptPanel').hidden, false);

  $('fanjianSpadeBtn').click(); // stage {suit:'spade'} — 实际是红桃
  $('handConfirmBtn').click();
  assert.equal(game.pendingChoice, null);
  assert.equal(game.player.hp, playerHp - 1, '猜错 → 受 1 伤');
  assert.ok(game.player.hand.some((card) => card.id === 'ui-fj2-card'), '牌保留在手');
  assert.equal($('fanjianPromptPanel').hidden, true, '面板关闭');
});

// ───── 雌雄发动面板 (kind: cixiong-fire) ──────────────────────────────

test('雌雄发动面板: 刘备杀甄姬 (异性) → 弹出 → 发动 → 目标 AI 弃牌', () => {
  const game = startGameViaUI('liubei', 'zhenji');
  game.player.equipment.weapon = c('cixiong', { id: 'ui-cx-w' });
  game.player.hand = [c('sha', { id: 'ui-cx-sha', suit: 'spade', color: 'black' })];
  game.enemy.hand = [c('tao', { id: 'ui-cx-sentinel', suit: 'heart', color: 'red' })]; // 红牌: 防倾国当闪
  const enemyHp = game.enemy.hp;

  Engine.playCard(game, 'player', 'ui-cx-sha');
  UI.render();
  assert.equal($('cixiongFirePanel').hidden, false, '雌雄发动面板弹出');

  $('cixiongFireBtn').click();
  assert.equal(game.pendingChoice, null, '发动已提交');
  assert.ok(game.discard.some((card) => card.id === 'ui-cx-sentinel'), '目标 AI 弃置手牌应对');
  assert.equal(game.enemy.hp, enemyHp - 1, '杀继续结算 → 无闪受伤');
  assert.equal($('cixiongFirePanel').hidden, true, '面板关闭');
});

test('雌雄发动面板: 点"不发动" → 目标手牌保留, 杀照常结算', () => {
  const game = startGameViaUI('liubei', 'zhenji');
  game.player.equipment.weapon = c('cixiong', { id: 'ui-cx2-w' });
  game.player.hand = [c('sha', { id: 'ui-cx2-sha', suit: 'spade', color: 'black' })];
  game.enemy.hand = [c('tao', { id: 'ui-cx2-sentinel', suit: 'heart', color: 'red' })]; // 红牌: 防倾国当闪
  const enemyHp = game.enemy.hp;

  Engine.playCard(game, 'player', 'ui-cx2-sha');
  UI.render();
  assert.equal($('cixiongFirePanel').hidden, false);

  $('cixiongFireDeclineBtn').click();
  assert.equal(game.pendingChoice, null);
  assert.ok(game.enemy.hand.some((card) => card.id === 'ui-cx2-sentinel'), '不发动 → 手牌保留');
  assert.equal(game.enemy.hp, enemyHp - 1, '杀照常结算');
  assert.equal($('cixiongFirePanel').hidden, true, '面板关闭');
});

// ───── 雌雄应对面板 (kind: cixiong-choose) ────────────────────────────

test('雌雄应对面板: 敌方雌雄杀刘备 → 弹出 → 选弃一张手牌', () => {
  const game = startGameViaUI('liubei', 'zhenji');
  game.turn = 'enemy';
  game.enemy.equipment.weapon = c('cixiong', { id: 'ui-cxc-w' });
  game.enemy.hand = [c('sha', { id: 'ui-cxc-sha', suit: 'spade', color: 'black' })];
  game.player.hand = [c('tao', { id: 'ui-cxc-keep' }), c('shan', { id: 'ui-cxc-drop', suit: 'club', color: 'black' })];

  Engine.playCard(game, 'enemy', 'ui-cxc-sha');
  UI.render();
  assert.equal($('cixiongChoosePanel').hidden, false, '雌雄应对面板弹出');
  assert.match($('cixiongChooseChoices').innerHTML, /ui-cxc-drop/, '手牌候选渲染');

  $('cixiongChooseChoices').dispatchClick({ 'data-cixiong-discard-card-id': 'ui-cxc-drop' });
  $('handConfirmBtn').click();
  assert.equal(game.pendingChoice, null, '应对已提交');
  assert.ok(game.discard.some((card) => card.id === 'ui-cxc-drop'), '所选手牌被弃');
  assert.ok(game.player.hand.some((card) => card.id === 'ui-cxc-keep'), '另一张保留');
  assert.equal($('cixiongChoosePanel').hidden, true, '面板关闭');
});

test('雌雄应对面板: 点"让对方摸一张" → 敌方 +1 牌, 己方手牌保留', () => {
  const game = startGameViaUI('liubei', 'zhenji');
  game.turn = 'enemy';
  game.enemy.equipment.weapon = c('cixiong', { id: 'ui-cxc2-w' });
  game.enemy.hand = [c('sha', { id: 'ui-cxc2-sha', suit: 'spade', color: 'black' })];
  game.player.hand = [c('tao', { id: 'ui-cxc2-keep' })];
  game.deck = [c('shan', { id: 'ui-cxc2-draw' })];

  Engine.playCard(game, 'enemy', 'ui-cxc2-sha');
  UI.render();
  assert.equal($('cixiongChoosePanel').hidden, false);

  $('cixiongChooseDrawBtn').click();
  assert.equal(game.pendingChoice, null);
  assert.ok(game.enemy.hand.some((card) => card.id === 'ui-cxc2-draw'), '对方摸 1 张');
  assert.ok(game.player.hand.some((card) => card.id === 'ui-cxc2-keep'), '己方手牌保留');
  assert.equal($('cixiongChoosePanel').hidden, true, '面板关闭');
});

// ───── 铁索连环模式面板 (出牌流程, 非 pendingChoice) ──────────────────

test('铁索面板: 点手牌铁索确认 → 弹出 → 选"横置对方" → 对方被连环', () => {
  const game = startGameViaUI();
  game.player.hand = [c('tiesuo', { id: 'ui-ts', suit: 'spade', color: 'black' })];
  UI.render();

  $('playerHand').dispatchClick({ 'data-card-id': 'ui-ts' }); // E16: 先选中
  $('handConfirmBtn').click(); // 确认打出 → 弹铁索模式面板
  assert.equal($('tiesuoModePanel').hidden, false, '铁索模式面板弹出');

  // v13 UI修缮1: 面板选项改 stage-then-confirm — 点选项只暂存, 不结算。
  $('tiesuoChainEnemyBtn').click();
  assert.equal(game.enemy.chained, undefined, '点选项仅暂存, 未结算');
  $('handConfirmBtn').click();
  assert.equal(game.enemy.chained, true, '对方被横置');
  assert.ok(game.discard.some((card) => card.id === 'ui-ts'), '铁索进弃牌堆');
  assert.equal($('tiesuoModePanel').hidden, true, '面板关闭');
});

test('铁索面板: 选"重铸" → 弃铁索摸 1 张, 双方均未连环', () => {
  const game = startGameViaUI();
  game.player.hand = [c('tiesuo', { id: 'ui-ts2', suit: 'spade', color: 'black' })];
  game.deck = [c('shan', { id: 'ui-ts2-draw' })];
  UI.render();

  $('playerHand').dispatchClick({ 'data-card-id': 'ui-ts2' });
  $('handConfirmBtn').click();
  assert.equal($('tiesuoModePanel').hidden, false);

  $('tiesuoRecastBtn').click();
  assert.ok(!game.discard.some((card) => card.id === 'ui-ts2'), 'v13 UI修缮1: 点重铸仅暂存');
  $('handConfirmBtn').click();
  assert.ok(game.discard.some((card) => card.id === 'ui-ts2'), '重铸: 铁索进弃牌堆');
  assert.ok(game.player.hand.some((card) => card.id === 'ui-ts2-draw'), '重铸: 摸 1 张');
  assert.ok(!game.player.chained, '己方未连环');
  assert.ok(!game.enemy.chained, '对方未连环');
  assert.equal($('tiesuoModePanel').hidden, true, '面板关闭');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
