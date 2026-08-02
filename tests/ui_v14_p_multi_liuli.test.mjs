// v14 P2/P3 UI 全链路行为测试 (fake-DOM): 方天多目标座席暂存-确认
// (座席点选骨架 min/max 多选, 铁索先例泛化到杀) + 流离转移面板
// (成本手牌/装备 + 候选座席 两段点选, 天香接线惯例)。
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { test, runTests } from './helpers/harness.mjs';

// 先装 fake-dom 再动态 import 引擎/适配层 (求值次序敏感, k3 惯例)。
const dom = installFakeDom();
const { Engine, c } = await import('./helpers/load-engine.mjs');
await import('../src/ui/dom-adapter.js');

const UI = globalThis.window.SanguoshaUI;
const $ = dom.$;

function forceOpenRoles() {
  const btn = $('hiddenRolesToggleBtn');
  if (btn.getAttribute('aria-pressed') == null) btn.click();
  if (btn.getAttribute('aria-pressed') === 'true') btn.click();
}

function startIdentity3ViaUI(playerHero = 'sunquan', enemyHero = 'lvmeng', allyHero = 'diaochan') {
  $('lobby1v1Btn').click();
  forceOpenRoles();
  $('modeIdentity3Btn').click();
  $('playerHeroSelect').value = playerHero;
  $('enemyHeroSelect').value = enemyHero;
  $('allyHeroSelect').value = allyHero;
  $('startGameBtn').click();
  $('exitConfirmModal').hidden = true;
  const game = UI.getGame();
  game.turn = 'player';
  game.phase = 'play';
  for (const seat of game.seats) {
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

function fangtianWeapon(id) {
  return { id: id, type: 'fangtian', name: '方天画戟', family: 'equipment', slot: 'weapon', range: 4 };
}

// ───── P2: 方天多目标暂存-确认 ─────────────────────────────────────────

test('P2 UI: 方天+最后手牌杀 → 座席点选可暂存两席, 确认后双席结算', () => {
  const game = startIdentity3ViaUI();
  game.player.equipment.weapon = fangtianWeapon('ui-ft1');
  game.player.hand = [c('sha', { id: 'ui-multi-sha' })];
  UI.render();
  $('playerHand').dispatchClick({ 'data-card-id': 'ui-multi-sha' });
  $('handConfirmBtn').click();
  assert.equal($('seatTargetModePanel').hidden, false, '进入座席点选');
  assert.match($('seatTargetModeHint').textContent, /方天画戟/, '多目标提示文案');
  $('enemyHero').click();
  $('allyHero').click();
  assert.ok($('enemyHero').classList.contains('is-target-staged'), '第一席暂存保留 (max>1 不改选)');
  assert.ok($('allyHero').classList.contains('is-target-staged'), '第二席同时暂存');
  assert.equal($('seatTargetConfirmBtn').hidden, false);
  const enemyHp = game.enemy.hp;
  const allyHp = game.ally.hp;
  $('seatTargetConfirmBtn').click();
  assert.equal(game.enemy.hp, enemyHp - 1, '确认后首席结算');
  assert.equal(game.ally.hp, allyHp - 1, '次席结算');
  assert.equal(game.player.hand.length, 0);
  assert.equal($('seatTargetModePanel').hidden, true, '面板关闭');
  assert.equal(game.pauseState.shaChain, null, '链自清');
});

test('P2 UI: 多目标模式下仅点一席确认 → 退化走单目标路径', () => {
  const game = startIdentity3ViaUI();
  game.player.equipment.weapon = fangtianWeapon('ui-ft2');
  game.player.hand = [c('sha', { id: 'ui-single-sha' })];
  UI.render();
  $('playerHand').dispatchClick({ 'data-card-id': 'ui-single-sha' });
  $('handConfirmBtn').click();
  $('enemyHero').click();
  $('seatTargetConfirmBtn').click();
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, '单席结算');
  assert.equal(game.ally.hp, game.ally.maxHp, '未点席位不受影响');
});

test('P2 UI: 非最后手牌 → 座席点选保持单选 (点第二席=改选)', () => {
  const game = startIdentity3ViaUI();
  game.player.equipment.weapon = fangtianWeapon('ui-ft3');
  game.player.hand = [c('sha', { id: 'ui-sha-a' }), c('tao', { id: 'ui-spare' })];
  UI.render();
  $('playerHand').dispatchClick({ 'data-card-id': 'ui-sha-a' });
  $('handConfirmBtn').click();
  assert.doesNotMatch($('seatTargetModeHint').textContent, /方天画戟/, '非最后手牌无多目标提示');
  $('enemyHero').click();
  $('allyHero').click();
  assert.ok(!$('enemyHero').classList.contains('is-target-staged'), '单选模式点第二席改选');
  assert.ok($('allyHero').classList.contains('is-target-staged'));
  $('seatTargetCancelBtn').click();
  assert.equal(game.player.hand.length, 2, '取消未结算');
});

// ───── P3: 流离转移面板 ───────────────────────────────────────────────

function triggerLiuliAsk() {
  const game = startIdentity3ViaUI('daqiao', 'sunquan', 'lvmeng');
  game.turn = 'enemy';
  game.player.hand = [c('tao', { id: 'ui-ll-cost', suit: 'heart', rank: '5' })];
  game.enemy.hand = [c('sha', { id: 'ui-ll-sha' })];
  const res = Engine.playCard(game, 'enemy', 'ui-ll-sha', { target: 'player' });
  assert.equal(res.ok, true, res.message);
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'liuli-transfer', '流离挂起');
  UI.render();
  return game;
}

test('P3 UI: 流离面板渲染 — hint/成本候选/目标候选/确认门禁', () => {
  const game = triggerLiuliAsk();
  assert.equal($('liuliAskPanel').hidden, false, '面板出现');
  assert.match($('liuliAskHint').textContent, /流离/, 'hint 含技能名');
  assert.match($('liuliCostChoices').innerHTML, /data-liuli-cost-id="ui-ll-cost"/, '成本候选渲染');
  assert.match($('liuliTargetChoices').innerHTML, /data-liuli-target="ally"/, '目标候选渲染');
  assert.equal($('liuliConfirmBtn').disabled, true, '未选齐前确认禁用');
  Engine.resolvePendingChoice(game, { decline: true });
  UI.render();
  assert.equal($('liuliAskPanel').hidden, true, '解决后面板关闭');
});

test('P3 UI: 点选成本+目标 → 确认转移, 杀落新目标', () => {
  const game = triggerLiuliAsk();
  $('liuliCostChoices').dispatchClick({ 'data-liuli-cost-id': 'ui-ll-cost' });
  $('liuliTargetChoices').dispatchClick({ 'data-liuli-target': 'ally' });
  assert.equal($('liuliConfirmBtn').disabled, false, '选齐后确认可用');
  const allyHp = game.ally.hp;
  $('liuliConfirmBtn').click();
  assert.equal(game.player.hp, game.player.maxHp, '大乔无伤');
  assert.equal(game.ally.hp, allyHp - 1, '杀落转移目标');
  assert.ok(game.discard.some((dc) => dc.id === 'ui-ll-cost'), '成本弃置');
  assert.equal(game.pendingChoice, null);
  assert.equal($('liuliAskPanel').hidden, true);
});

test('P3 UI: 不发动按钮 → 自己照常结算', () => {
  const game = triggerLiuliAsk();
  $('liuliDeclineBtn').click();
  assert.equal(game.player.hp, game.player.maxHp - 1, 'decline → 自己受杀');
  assert.equal(game.ally.hp, game.ally.maxHp);
  assert.equal($('liuliAskPanel').hidden, true);
});

await runTests();
