import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { makeStartGameViaUI } from './helpers/ui-game.mjs';

// v11 C7 (批次 31): 耀武 yaowu-reward 面板全链路 — 玩家作为伤害来源,
// 红杀命中华雄后面板弹出, 二选一按钮直接 resolve (必选, 无 cancel)。

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

test('耀武面板: 玩家红杀命中华雄 → 弹出 (满血 → 回复钮禁用) → 选摸牌', () => {
  const game = startGameViaUI('lvmeng', 'huaxiong');
  game.player.hand = [c('sha', { id: 'ui-red-sha', suit: 'heart', color: 'red' })];
  game.deck = [c('tao', { id: 'ui-reward' })];
  UI.render();

  $('playerHand').dispatchClick({ 'data-card-id': 'ui-red-sha' });
  $('handConfirmBtn').click(); // 出杀 → 华雄无闪 → 命中 → yaowu-reward 挂起
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'yaowu-reward');
  assert.equal($('yaowuRewardPanel').hidden, false, '耀武面板弹出');
  assert.equal($('yaowuRecoverBtn').disabled, true, '满血 → 回复钮禁用');
  assert.match($('yaowuRewardHint').textContent, /华雄/, '提示带目标名');

  $('yaowuDrawBtn').click();
  assert.equal(game.pendingChoice, null, '选择已提交');
  assert.ok(game.player.hand.some((card) => card.id === 'ui-reward'), '摸到奖励牌');
  assert.equal($('yaowuRewardPanel').hidden, true, '面板关闭');
});

test('耀武面板: 玩家受伤 → 回复钮可用 → 选回复 +1 体力', () => {
  const game = startGameViaUI('lvmeng', 'huaxiong');
  game.player.hp = 2;
  game.player.hand = [c('sha', { id: 'ui-red-sha2', suit: 'heart', color: 'red' })];
  UI.render();

  $('playerHand').dispatchClick({ 'data-card-id': 'ui-red-sha2' });
  $('handConfirmBtn').click();
  assert.equal($('yaowuRewardPanel').hidden, false);
  assert.equal($('yaowuRecoverBtn').disabled, false, '受伤 → 回复钮可用');

  $('yaowuRecoverBtn').click();
  assert.equal(game.pendingChoice, null);
  assert.equal(game.player.hp, 3, '回复 1');
  assert.equal($('yaowuRewardPanel').hidden, true, '面板关闭');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
