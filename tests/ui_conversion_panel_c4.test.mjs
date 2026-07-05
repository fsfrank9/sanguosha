import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { makeStartGameViaUI } from './helpers/ui-game.mjs';

// v11 C4 (批次 28): 转化面板泛化全链路测试 — 面板按 listCardConversions
// 动态列按钮: 杀按钮显隐 + 锦囊类转化 (国色 方片→乐 / 奇袭 黑牌→拆) 动态
// 成钮, staged.asSha 复用为 asType 载体走 stage-then-confirm。

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

// ───── 国色: 方片牌 → 乐不思蜀 ──────────────────────────────────────

test('国色面板: 方片杀双用 → 选"当乐不思蜀" → 提交 → 入对方判定区', () => {
  const game = startGameViaUI('daqiao', 'lvmeng');
  game.player.hand = [c('sha', { id: 'ui-dia-sha', suit: 'diamond', color: 'red' })];
  UI.render();

  $('playerHand').dispatchClick({ 'data-card-id': 'ui-dia-sha' });
  $('handConfirmBtn').click(); // 双用 → 弹转化面板
  assert.equal($('conversionModePanel').hidden, false, '转化面板弹出');
  assert.equal($('conversionShaBtn').hidden, true, '大乔无杀转化 → 杀按钮隐藏');
  assert.match($('conversionExtraChoices').innerHTML, /data-conversion-as="lebusishu"/, '乐转化按钮渲染');
  assert.match($('conversionExtraChoices').innerHTML, /国色/, '按钮标注技能名');

  $('conversionExtraChoices').dispatchClick({ 'data-conversion-as': 'lebusishu' });
  $('handConfirmBtn').click(); // stage-then-confirm 提交
  assert.equal($('conversionModePanel').hidden, true, '面板关闭');
  assert.equal(game.enemy.judgeArea.length, 1, '乐入对方判定区');
  assert.equal(game.enemy.judgeArea[0].type, 'lebusishu');
  assert.equal(game.enemy.judgeArea[0].physicalCard.id, 'ui-dia-sha', '保留原实体牌');
  assert.equal(game.player.hand.length, 0, '来源牌离手');
});

test('国色面板: 选"按原牌使用" → 方片杀照常结算', () => {
  const game = startGameViaUI('daqiao', 'lvmeng');
  game.player.hand = [c('sha', { id: 'ui-dia-sha2', suit: 'diamond', color: 'red' })];
  const enemyHp = game.enemy.hp;
  UI.render();

  $('playerHand').dispatchClick({ 'data-card-id': 'ui-dia-sha2' });
  $('handConfirmBtn').click();
  assert.equal($('conversionModePanel').hidden, false);

  $('conversionNormalBtn').click();
  $('handConfirmBtn').click();
  assert.equal($('conversionModePanel').hidden, true, '面板关闭');
  assert.equal(game.enemy.hp, enemyHp - 1, '按原牌 → 杀命中 (敌无闪)');
  assert.equal(game.enemy.judgeArea.length, 0, '未当乐使用');
});

// ───── 奇袭: 黑色牌 → 过河拆桥 ──────────────────────────────────────

test('奇袭面板: 黑杀双用 → 选"当过河拆桥" (auto) → 对方装备被拆', () => {
  const game = startGameViaUI('ganning', 'lvmeng');
  game.player.skillPreferences.guohe = 'auto';
  game.player.hand = [c('sha', { id: 'ui-black-sha', suit: 'spade', color: 'black' })];
  game.enemy.equipment.weapon = c('qinggang', { id: 'ui-e-wpn' });
  UI.render();

  $('playerHand').dispatchClick({ 'data-card-id': 'ui-black-sha' });
  $('handConfirmBtn').click();
  assert.equal($('conversionModePanel').hidden, false, '转化面板弹出');
  assert.equal($('conversionShaBtn').hidden, true, '甘宁无杀转化 → 杀按钮隐藏');
  assert.match($('conversionExtraChoices').innerHTML, /data-conversion-as="guohe"/, '拆转化按钮渲染');
  assert.match($('conversionExtraChoices').innerHTML, /奇袭/, '按钮标注技能名');

  $('conversionExtraChoices').dispatchClick({ 'data-conversion-as': 'guohe' });
  $('handConfirmBtn').click();
  assert.equal($('conversionModePanel').hidden, true, '面板关闭');
  assert.equal(game.enemy.equipment.weapon, null, '对方武器被拆');
  assert.ok(game.discard.some((card) => card.id === 'ui-black-sha' && card.type === 'sha'),
    '来源牌以原实体身份进弃牌堆');
});

test('奇袭面板: ask 偏好 → 转化提交后走 guohe-1v1-pick 既有面板', () => {
  const game = startGameViaUI('ganning', 'lvmeng');
  game.player.hand = [c('sha', { id: 'ui-black-sha2', suit: 'spade', color: 'black' })];
  game.enemy.hand = [c('tao', { id: 'ui-e-tao' })];
  UI.render();

  $('playerHand').dispatchClick({ 'data-card-id': 'ui-black-sha2' });
  $('handConfirmBtn').click();
  $('conversionExtraChoices').dispatchClick({ 'data-conversion-as': 'guohe' });
  $('handConfirmBtn').click();
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'guohe-1v1-pick', '进入既有拆牌选择');
  const r = Engine.resolvePendingChoice(game, { zone: 'hand', cardId: 'ui-e-tao' });
  assert.equal(r.ok, true);
  assert.equal(game.enemy.hand.length, 0, '对方手牌被弃');
});

test('奇袭直接转化: 本回合已用杀 → 唯一候选 → 点击直接当拆 (mode convert)', () => {
  const game = startGameViaUI('ganning', 'lvmeng');
  game.player.skillPreferences.guohe = 'auto';
  game.player.usedSha = true; // 原牌杀不可用
  game.player.hand = [c('sha', { id: 'ui-black-sha3', suit: 'spade', color: 'black' })];
  game.enemy.equipment.armor = c('bagua', { id: 'ui-e-armor' });
  UI.render();

  $('playerHand').dispatchClick({ 'data-card-id': 'ui-black-sha3' });
  $('handConfirmBtn').click(); // 唯一候选 → 不弹面板, 直接转化
  assert.equal($('conversionModePanel').hidden, true, '未弹转化面板');
  assert.equal(game.enemy.equipment.armor, null, '对方防具被拆');
  assert.ok(game.discard.some((card) => card.id === 'ui-black-sha3'));
});

// ───── 回归: 武圣杀转化 (杀按钮可见, 旧语义不变) ────────────────────

test('回归 武圣面板: 红桃受伤双用 → 杀按钮可见 + 无锦囊按钮 → 当杀命中', () => {
  const game = startGameViaUI('guanyu', 'lvmeng');
  game.player.hp = game.player.maxHp - 1; // 桃可按原牌用
  game.player.hand = [c('tao', { id: 'ui-red-tao', suit: 'heart', color: 'red' })];
  const enemyHp = game.enemy.hp;
  UI.render();

  $('playerHand').dispatchClick({ 'data-card-id': 'ui-red-tao' });
  $('handConfirmBtn').click();
  assert.equal($('conversionModePanel').hidden, false, '转化面板弹出');
  assert.equal($('conversionShaBtn').hidden, false, '武圣 → 杀按钮可见');
  assert.equal($('conversionExtraChoices').innerHTML, '', '无锦囊类转化按钮');

  $('conversionShaBtn').click();
  $('handConfirmBtn').click();
  assert.equal($('conversionModePanel').hidden, true, '面板关闭');
  assert.equal(game.enemy.hp, enemyHp - 1, '当杀命中');
  assert.equal(game.player.hp, game.player.maxHp - 1, '未按桃回复');
});

test('回归: 取消按钮关闭面板, 牌保留在手', () => {
  const game = startGameViaUI('daqiao', 'lvmeng');
  game.player.hand = [c('sha', { id: 'ui-dia-sha3', suit: 'diamond', color: 'red' })];
  UI.render();

  $('playerHand').dispatchClick({ 'data-card-id': 'ui-dia-sha3' });
  $('handConfirmBtn').click();
  assert.equal($('conversionModePanel').hidden, false);

  $('conversionCancelBtn').click();
  assert.equal($('conversionModePanel').hidden, true, '面板关闭');
  assert.equal(game.player.hand.length, 1, '牌未消耗');
  assert.equal(game.enemy.judgeArea.length, 0);
});

// ───── listCardConversions 引擎侧行为 ───────────────────────────────

test('listCardConversions: 按 asType 表枚举, 含 skillName 与 playable', () => {
  const game = startGameViaUI('ganning', 'lvmeng');
  game.enemy.hand = [c('tao', { id: 'ui-e-x' })];
  const black = c('shan', { id: 'ui-black-shan', suit: 'club', color: 'black' });
  game.player.hand = [black];
  const list = Engine.listCardConversions(game, 'player', black);
  assert.equal(list.length, 1);
  assert.equal(list[0].asType, 'guohe');
  assert.equal(list[0].asName, '过河拆桥');
  assert.equal(list[0].skillName, '奇袭');
  assert.equal(list[0].playable.ok, true);

  const red = c('shan', { id: 'ui-red-shan', suit: 'heart', color: 'red' });
  game.player.hand = [red];
  assert.deepEqual(Engine.listCardConversions(game, 'player', red), [], '红牌无候选');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
