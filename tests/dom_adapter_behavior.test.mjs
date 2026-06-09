import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';

// 审计二轮 PR-9: dom-adapter 的第一批真实行为测试。此前 2500 行 UI 适配层
// 只有"源码正则"断言 (grep 自己的源码), 对真实 UI 回归没有检出力。本文件用
// tests/helpers/fake-dom.mjs (零依赖 DOM 垫片) 真正 import 并驱动 dom-adapter:
// 点按钮 → 引擎状态变化 → render → 面板可见性, 全链路断言。

const dom = installFakeDom(); // 必须先装垫片, dom-adapter import 时立即触 DOM
const { Engine } = await import('./helpers/load-engine.mjs');
await import('../src/ui/dom-adapter.js');

const UI = globalThis.window.SanguoshaUI;
const $ = dom.$;

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

// 通过真实 UI 路径开一局, 然后把局面整形成测试需要的状态。
function startGameViaUI() {
  $('lobby1v1Btn').click();
  $('playerHeroSelect').value = 'liubei';
  $('enemyHeroSelect').value = 'sunquan';
  $('startGameBtn').click();
  const game = UI.getGame();
  game.turn = 'player';
  game.phase = 'play';
  game.player.hand = [];
  game.enemy.hand = [];
  game.player.hp = game.player.maxHp;
  game.enemy.hp = game.enemy.maxHp;
  game.player.judgeArea = [];
  game.enemy.judgeArea = [];
  game.player.equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
  game.enemy.equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
  game.pendingChoice = null;
  game.pendingChoiceQueue = [];
  game.pauseState = {};
  UI.render();
  return game;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('启动: import 即渲染 lobby, 牌桌隐藏', () => {
  assert.equal($('lobbyScreen').hidden, false, 'lobby 可见');
  assert.equal($('duelTable').hidden, true, '牌桌隐藏');
  assert.ok($('playerHeroSelect').options.length >= 60, '武将下拉已填充 (68 名)');
});

test('lobby → 选将 → 开始对局: 牌桌可见, 手牌/血量渲染', () => {
  const game = startGameViaUI();
  assert.equal($('setupScreen').hidden, true);
  assert.equal($('duelTable').hidden, false, '牌桌可见');
  assert.ok(game, 'UI 持有引擎对局');
  // 整形后重新发两张牌验证手牌渲染
  game.player.hand = [c('sha', { id: 'ui-sha' }), c('tao', { id: 'ui-tao' })];
  UI.render();
  assert.match($('playerHand').innerHTML, /ui-sha/, '手牌 DOM 含卡牌');
  assert.equal(String($('playerHandCount').textContent), '2', '手牌计数');
});

test('UI newGame 显式开启的 ask 偏好齐全 (闪/无懈/决斗杀/贯石/火攻展示)', () => {
  const game = startGameViaUI();
  for (const pref of ['shanResponse', 'wuxieResponse', 'shaDuelResponse', 'guanshi', 'huogongShow']) {
    assert.equal(game.player.skillPreferences[pref], 'ask', pref + ' = ask');
  }
});

test('闪响应面板: 敌方出杀 → 面板弹出 → 点"不出闪" → 受伤面板关闭', () => {
  const game = startGameViaUI();
  game.turn = 'enemy';
  game.player.hand = [c('shan', { id: 'p-shan' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  Engine.playCard(game, 'enemy', 'e-sha');
  UI.render();
  assert.equal($('shanResponsePanel').hidden, false, '闪响应面板弹出');

  const hpBefore = game.player.hp;
  $('shanResponseDeclineBtn').click(); // handler 内部 resolve + render
  assert.equal(game.player.hp, hpBefore - 1, '不出闪 → 受 1 伤');
  assert.equal(game.pendingChoice, null);
  assert.equal($('shanResponsePanel').hidden, true, '面板关闭');
});

test('贯石斧面板全流程: 选满 2 张才放行确认 → 弃置并强制命中', () => {
  const game = startGameViaUI();
  game.player.equipment.weapon = c('guanshi', { id: 'ui-gs-w' });
  game.player.equipment.horsePlus = c('plus_horse', { id: 'ui-gs-horse' });
  game.player.hand = [c('sha', { id: 'ui-gs-sha' }), c('tao', { id: 'ui-gs-tao' })];
  game.enemy.hand = [c('shan', { id: 'foe-shan' })];
  const enemyHp = game.enemy.hp;

  Engine.playCard(game, 'player', 'ui-gs-sha');
  UI.render();
  assert.equal($('guanshiDiscardPanel').hidden, false, '贯石斧面板弹出');
  assert.equal($('guanshiConfirmBtn').disabled, true, '未选满 2 张 → 确认禁用');
  assert.match($('guanshiDiscardChoices').innerHTML, /ui-gs-tao/, '手牌候选渲染');
  assert.match($('guanshiDiscardChoices').innerHTML, /ui-gs-horse/, '装备候选渲染');

  $('guanshiDiscardChoices').dispatchClick({ 'data-guanshi-card-id': 'ui-gs-tao' });
  assert.equal($('guanshiConfirmBtn').disabled, true, '选 1 张仍禁用');
  $('guanshiDiscardChoices').dispatchClick({ 'data-guanshi-card-id': 'ui-gs-horse' });
  assert.equal($('guanshiConfirmBtn').disabled, false, '选满 2 张放行');

  $('guanshiConfirmBtn').click();
  assert.equal(game.enemy.hp, enemyHp - 1, '强制命中 1 伤');
  assert.equal(game.player.equipment.horsePlus, null, '坐骑作为成本被弃');
  assert.equal($('guanshiDiscardPanel').hidden, true, '面板关闭');
});

test('贯石斧面板: 点"不发动" → 无伤害, 手牌保留', () => {
  const game = startGameViaUI();
  game.player.equipment.weapon = c('guanshi', { id: 'ui-gs-w2' });
  game.player.hand = [c('sha', { id: 'ui-gs-sha2' }), c('tao', { id: 't1' }), c('tao', { id: 't2' })];
  game.enemy.hand = [c('shan', { id: 'foe-shan2' })];
  const enemyHp = game.enemy.hp;

  Engine.playCard(game, 'player', 'ui-gs-sha2');
  UI.render();
  assert.equal($('guanshiDiscardPanel').hidden, false);
  $('guanshiDeclineBtn').click();
  assert.equal(game.enemy.hp, enemyHp, '放弃 → 目标闪避无伤');
  assert.equal(game.player.hand.length, 2, '手牌保留');
  assert.equal($('guanshiDiscardPanel').hidden, true);
});

test('火攻展示面板: stage 选牌 → hand-confirm 提交 → 展示异花色火攻落空', () => {
  const game = startGameViaUI();
  game.turn = 'enemy';
  game.player.hand = [
    c('tao', { id: 'show-heart', suit: 'heart', color: 'red' }),
    c('sha', { id: 'show-club', suit: 'club', color: 'black' })
  ];
  game.enemy.hand = [
    c('huogong', { id: 'ui-hg', suit: 'diamond', color: 'red' }),
    c('shan', { id: 'e-heart', suit: 'heart', color: 'red' })
  ];
  const playerHp = game.player.hp;

  Engine.playCard(game, 'enemy', 'ui-hg');
  UI.render();
  assert.equal($('huogongShowPanel').hidden, false, '展示面板弹出');
  assert.match($('huogongShowChoices').innerHTML, /show-club/, '手牌候选渲染');

  $('huogongShowChoices').dispatchClick({ 'data-huogong-show-card-id': 'show-club' });
  $('handConfirmBtn').click(); // stage 后经 hand-confirm 提交
  assert.equal(game.pendingChoice, null, '选择已提交');
  assert.equal(game.player.hp, playerHp, '展示草花 → 对方只有红桃 → 火攻无效');
  assert.ok(game.player.hand.some((card) => card.id === 'show-club'), '展示牌保留在手');
  assert.equal($('huogongShowPanel').hidden, true, '面板关闭');
});

test('濒死救援面板: 闪电致濒死 → 面板弹出 → 选桃救援 → 回合续跑', () => {
  const game = startGameViaUI();
  game.enemy.hp = 2;
  game.enemy.judgeArea = [c('shandian', { id: 'ui-ld' })];
  game.deck = [
    c('shan', { id: 'd1', suit: 'club' }),
    c('shan', { id: 'd2', suit: 'club' }),
    c('shan', { id: 'd3', suit: 'club' }),
    c('sha', { id: 'judge-spade', suit: 'spade', rank: '5' })
  ];
  game.player.hand = [c('tao', { id: 'rescue-1' }), c('tao', { id: 'rescue-2' })];

  Engine.endTurn(game);
  UI.render();
  assert.equal($('dyingRescuePanel').hidden, false, '濒死救援面板弹出');

  $('dyingRescueChoices').dispatchClick({ 'data-dying-rescue-card-id': 'rescue-1' });
  $('handConfirmBtn').click();
  assert.equal(game.enemy.hp, 0, '第一张桃 -1 → 0, 仍濒死');
  $('dyingRescueChoices').dispatchClick({ 'data-dying-rescue-card-id': 'rescue-2' });
  $('handConfirmBtn').click();
  assert.equal(game.enemy.hp, 1, '救回 1 点');
  assert.equal(game.phase, 'play', 'H2: 濒死结束后回合续跑到出牌阶段');
  UI.render();
  assert.equal($('dyingRescuePanel').hidden, true, '面板关闭');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
