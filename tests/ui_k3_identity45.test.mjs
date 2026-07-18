// v13 K3: 4/5 人身份场 UI — 模式选择 / 第四/五席预置槽位渲染 (含内奸
// 徽章) / 座席点选绑定扩容 / 酒座席点选 (K2 他指的 UI 面) / 身份场终局
// 横幅修复 / 1v1 与 3p 零回归。fake-DOM 全链路 (真实 lobby 流程开局)。
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';

const dom = installFakeDom();
const { Engine } = await import('./helpers/load-engine.mjs');
await import('../src/ui/dom-adapter.js');

const UI = globalThis.window.SanguoshaUI;
const $ = dom.$;

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

// identityN 开局 (真实 lobby → 模式切换 → 选将 → startGame), 然后整形成
// 确定性局面 (清各席手牌/装备/判定区, 玩家回合出牌阶段)。
// v13 UI修缮5: 暗身份默认开 — 本文件断言明置徽章 (暗置覆盖在 ui_m), 显式关闭。
// fake-dom 不解析初始标记: 原始按钮无 aria, 先点一次同步再判读。
function forceOpenRoles() {
  const btn = $('hiddenRolesToggleBtn');
  if (btn.getAttribute('aria-pressed') == null) btn.click();
  if (btn.getAttribute('aria-pressed') === 'true') btn.click();
}

function startIdentityViaUI(modeBtnId, heroBySelect = {}) {
  $('lobby1v1Btn').click();
  $(modeBtnId).click();
  forceOpenRoles();
  $('playerHeroSelect').value = heroBySelect.player || 'liubei';
  $('enemyHeroSelect').value = heroBySelect.enemy || 'caocao';
  $('allyHeroSelect').value = heroBySelect.ally || 'guanyu';
  if (heroBySelect.ally2 !== undefined) $('ally2HeroSelect').value = heroBySelect.ally2;
  if (heroBySelect.ally3 !== undefined) $('ally3HeroSelect').value = heroBySelect.ally3;
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
  }
  game.pendingChoice = null;
  game.pendingChoiceQueue = [];
  game.pauseState = {};
  UI.render();
  return game;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── 模式选择: 4/5 人档按钮与席位下拉显隐 ─────────────────────────

test('模式切换: 4人/5人身份场按钮 → 对应席位下拉逐档显示, 切回 1v1 全隐', () => {
  $('lobby1v1Btn').click();
  $('modeIdentity4Btn').click();
  assert.equal($('allyHeroPickRow').hidden, false, '第三席下拉显示');
  assert.equal($('ally2HeroPickRow').hidden, false, '第四席下拉显示');
  assert.equal($('ally3HeroPickRow').hidden, true, '第五席下拉隐藏 (4 人档)');
  assert.ok($('modeIdentity4Btn').classList.contains('is-active'));
  assert.ok(!$('modeIdentity3Btn').classList.contains('is-active'));

  $('modeIdentity5Btn').click();
  assert.equal($('ally3HeroPickRow').hidden, false, '第五席下拉显示 (5 人档)');
  assert.ok($('modeIdentity5Btn').classList.contains('is-active'));
  assert.ok(!$('modeIdentity4Btn').classList.contains('is-active'));

  $('modeDuelBtn').click();
  assert.equal($('allyHeroPickRow').hidden, true, '切回 1v1 → 全部席位下拉隐藏');
  assert.equal($('ally2HeroPickRow').hidden, true);
  assert.equal($('ally3HeroPickRow').hidden, true);
  assert.equal($('roleDraftPanel').hidden, false, '身份判定区恢复');
});

// ───── 5 人开局: 座次/身份/渲染/徽章/布局 class ─────────────────────

test('identity5 开局: 5 席座次 + 身份预设 (主/反/忠/反/内) + 各席渲染与徽章', () => {
  const game = startIdentityViaUI('modeIdentity5Btn');
  assert.equal(game.mode, 'identity3', '身份场模式标签 (覆盖 3-5 档)');
  assert.deepEqual(game.seats, ['player', 'enemy', 'ally', 'ally2', 'ally3']);
  assert.deepEqual(
    game.seats.map((seat) => game.roles[seat]),
    ['主公', '反贼', '忠臣', '反贼', '内奸'], '5 人档身份固定预设');
  assert.equal($('allyZone').hidden, false, '第三席区域显示');
  assert.equal($('ally2Zone').hidden, false, '第四席区域显示');
  assert.equal($('ally3Zone').hidden, false, '第五席区域显示');
  assert.ok($('duelTable').classList.contains('is-identity5'), '5 人布局 class');
  assert.ok(!$('duelTable').classList.contains('is-identity3'), '不带 3 人布局 class');
  assert.ok($('ally2Name').textContent.length > 0, '第四席武将名渲染');
  assert.ok($('ally3Name').textContent.length > 0, '第五席武将名渲染');
  assert.equal($('ally2RebelBadge').hidden, false, '第四席反贼徽章');
  assert.equal($('ally3RenegadeBadge').hidden, false, '第五席内奸徽章');
  assert.equal($('allyLoyalistBadge').hidden, false, '第三席忠臣徽章');
});

test('identity4 开局: 4 席 + 第五席保持隐藏 + 第四席内奸徽章', () => {
  const game = startIdentityViaUI('modeIdentity4Btn');
  assert.deepEqual(game.seats, ['player', 'enemy', 'ally', 'ally2']);
  assert.deepEqual(
    game.seats.map((seat) => game.roles[seat]),
    ['主公', '反贼', '忠臣', '内奸'], '4 人档身份固定预设');
  assert.equal($('ally2Zone').hidden, false, '第四席区域显示');
  assert.equal($('ally3Zone').hidden, true, '第五席区域隐藏');
  assert.ok($('duelTable').classList.contains('is-identity4'));
  assert.equal($('ally2RenegadeBadge').hidden, false, '第四席内奸徽章 (4 人档 ally2=内奸)');
});

test('identity5 开局: 席位武将同名 → 自动改选, 五席互异', () => {
  const game = startIdentityViaUI('modeIdentity5Btn', {
    player: 'liubei', enemy: 'caocao', ally: 'liubei', ally2: 'caocao', ally3: 'liubei'
  });
  const names = game.seats.map((seat) => game[seat].name);
  assert.equal(new Set(names).size, names.length, '五席武将互异: ' + names.join('/'));
});

// ───── 座席点选绑定扩容: 第五席英雄卡可点选 ─────────────────────────

test('座席点选 5 席: 杀可暂存-确认命中第五席 (新槽位点击绑定生效)', () => {
  const game = startIdentityViaUI('modeIdentity5Btn');
  game.player.hand = [c('sha', { id: 'k3-sha' })];
  game.ally3.hand = [];
  UI.render();
  $('playerHand').dispatchClick({ 'data-card-id': 'k3-sha' });
  $('handConfirmBtn').click();
  assert.equal($('seatTargetModePanel').hidden, false, '座席点选面板弹出');
  assert.ok($('ally3Hero').classList.contains('is-target-selectable'), '第五席 (距离 1) 高亮');
  const hpBefore = game.ally3.hp;
  $('ally3Hero').click();
  assert.equal(game.ally3.hp, hpBefore, '点座席仅暂存');
  assert.ok($('ally3Hero').classList.contains('is-target-staged'), '第五席暂存描边');
  $('seatTargetConfirmBtn').click();
  assert.equal(game.ally3.hp, hpBefore - 1, '确认后命中第五席');
  assert.equal(game.player.hand.length, 0);
});

// ───── 酒座席点选 (K2 他指的 UI 面) ─────────────────────────────────

test('酒座席点选: 身份场选酒 → 座席点选 (含自己), 点他席确认 → shaBonus 挂目标', () => {
  const game = startIdentityViaUI('modeIdentity4Btn');
  game.player.hand = [c('jiu', { id: 'k3-jiu' })];
  UI.render();
  $('playerHand').dispatchClick({ 'data-card-id': 'k3-jiu' });
  $('handConfirmBtn').click();
  assert.equal($('seatTargetModePanel').hidden, false, '酒进入座席点选');
  assert.ok($('playerHero').classList.contains('is-target-selectable'), '自己是合法目标 (自饮)');
  assert.ok($('allyHero').classList.contains('is-target-selectable'), '他席合法 (官方"包括你在内的一名角色")');
  $('allyHero').click();
  $('seatTargetConfirmBtn').click();
  assert.equal(game.ally.shaBonus, 1, 'shaBonus 挂目标席');
  assert.equal(game.player.flags.jiuUsedThisTurn, true, '限次挂使用者');
  assert.equal(game.player.hand.length, 0, '酒已打出');
});

test('酒座席点选: 点自己英雄卡自饮 (自指路径保持可达)', () => {
  const game = startIdentityViaUI('modeIdentity4Btn');
  game.player.hand = [c('jiu', { id: 'k3-jiu2' })];
  UI.render();
  $('playerHand').dispatchClick({ 'data-card-id': 'k3-jiu2' });
  $('handConfirmBtn').click();
  $('playerHero').click();
  $('seatTargetConfirmBtn').click();
  assert.equal(game.player.shaBonus, 1, '自饮 shaBonus 挂自己');
  assert.equal(game.player.hand.length, 0);
});

// ───── 身份场终局横幅 (缺陷修复) ────────────────────────────────────

test('终局横幅: 身份场主忠方胜 → 玩家 (主公) 显示胜利 (此前恒败北)', () => {
  const game = startIdentityViaUI('modeIdentity5Btn');
  game.phase = 'gameover';
  game.winner = 'lordSide';
  UI.render();
  assert.equal($('statusTitle').textContent, '胜利！', '主忠方胜 → 玩家胜利横幅');
  assert.match($('playerState').innerHTML, /胜利/, '玩家席状态条同步');
});

test('终局横幅: 内奸单独获胜 → 玩家败北且文案标注内奸', () => {
  const game = startIdentityViaUI('modeIdentity4Btn');
  game.phase = 'gameover';
  game.winner = 'renegade';
  UI.render();
  assert.equal($('statusTitle').textContent, '败北……');
  assert.match($('statusText').textContent, /内奸/, '败方文案标注内奸获胜');
});

// ───── 1v1 与 3p 零回归 ─────────────────────────────────────────────

test('1v1 零回归: 新席位区域保持隐藏, 无 identityN class, 胜负横幅按座席名', () => {
  $('lobby1v1Btn').click();
  $('modeDuelBtn').click();
  $('playerHeroSelect').value = 'liubei';
  $('enemyHeroSelect').value = 'caocao';
  $('startGameBtn').click();
  $('exitConfirmModal').hidden = true;
  const game = UI.getGame();
  UI.render();
  assert.equal(game.mode, 'duel');
  assert.equal($('ally2Zone').hidden, true, '第四席隐藏');
  assert.equal($('ally3Zone').hidden, true, '第五席隐藏');
  assert.ok(!$('duelTable').classList.contains('is-identity4'));
  assert.ok(!$('duelTable').classList.contains('is-identity5'));
  game.phase = 'gameover';
  game.winner = 'player';
  UI.render();
  assert.equal($('statusTitle').textContent, '胜利！', '1v1 胜负横幅行为不变');
});

test('3p 零回归: identity3 开局第四/五席保持隐藏, 布局 class 仍为 is-identity3', () => {
  const game = startIdentityViaUI('modeIdentity3Btn');
  assert.deepEqual(game.seats, ['player', 'enemy', 'ally']);
  assert.ok($('duelTable').classList.contains('is-identity3'));
  assert.equal($('ally2Zone').hidden, true);
  assert.equal($('ally3Zone').hidden, true);
});

let passed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed += 1; console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
console.log(`${passed}/${tests.length} 个 K3 UI 用例通过。`);
