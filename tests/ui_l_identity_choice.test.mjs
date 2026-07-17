// v13 L: 可选身份 UI 全链路 (fake-DOM) —
//   L1: 身份选择面板 (按钮显隐/激活/3 人档无内奸/轮转开局) + 选将提示
//       文案泛化 + 玩家内奸徽章 + AI 主公先手经 enemyStep 定时器链自动
//       接管 (全仓库首个真正驱动 flushTimers 的时序测试) + 黄天按钮回归。
//   L2: 玩家于自己回合内阵亡 → 渲染层自动接管驱动 (不卡死), 亡席输入
//       守卫, 旁观文案。
//   零回归: 1v1 roleDraftPanel 随机身份不受影响; 身份场缺省仍主公。
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

// 驱动 enemyStep 定时器链直到轮到玩家/终局/无计时器 (带步数上限)。
function driveTimers(maxFlushes = 200) {
  let flushes = 0;
  while (dom.pendingTimerCount() > 0 && flushes < maxFlushes) {
    dom.flushTimers();
    flushes += 1;
    const game = UI.getGame();
    if (!game || game.phase === 'gameover') break;
    if (game.turn === 'player' && game.player.hp > 0 && !Engine.getPendingChoice(game)) break;
  }
  return flushes;
}

// 整形局面后排干残余 enemyStep 计时器: 存活玩家回合 + 无挂起时 enemyStep
// 会直接退出且不再续排 (同时把模块私有 enemyThinking 复位), 防止中断的
// AI 链残留 enemyThinking=true 拦截后续玩家输入。
function drainTimersAtPlayerIdle() {
  let guard = 0;
  while (dom.pendingTimerCount() > 0 && guard < 50) {
    dom.flushTimers();
    guard += 1;
  }
}

function startIdentityWithRole(modeBtnId, roleBtnId) {
  $('lobby1v1Btn').click();
  $(modeBtnId).click();
  if (roleBtnId) $(roleBtnId).click();
  $('playerHeroSelect').value = 'liubei';
  $('enemyHeroSelect').value = 'caocao';
  $('allyHeroSelect').value = 'guanyu';
  $('startGameBtn').click();
  $('exitConfirmModal').hidden = true;
  return UI.getGame();
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── L1: 身份选择面板显隐与状态 ─────

test('L1: 身份面板 — 身份场显示/1v1 隐藏, 3 人档无内奸按钮, 选中态切换', () => {
  $('lobby1v1Btn').click();
  $('modeIdentity4Btn').click();
  assert.equal($('identityRolePanel').hidden, false, '身份场显示身份面板');
  assert.equal($('roleRenegadeBtn').hidden, false, '4 人档有内奸按钮');
  $('roleRebelBtn').click();
  assert.ok($('roleRebelBtn').classList.contains('is-active'), '反贼选中');
  assert.ok(!$('roleLordBtn').classList.contains('is-active'));
  $('modeIdentity3Btn').click();
  assert.equal($('roleRenegadeBtn').hidden, true, '3 人档隐藏内奸按钮');
  $('roleRenegadeBtn').hidden = true;
  $('modeDuelBtn').click();
  assert.equal($('identityRolePanel').hidden, true, '1v1 隐藏身份面板');
  assert.equal($('roleDraftPanel').hidden, false, '1v1 身份判定区恢复 (零回归)');
});

test('L1: 3 人档已选内奸时切入 → 回退主公 (3p 无内奸)', () => {
  $('lobby1v1Btn').click();
  $('modeIdentity4Btn').click();
  $('roleRenegadeBtn').click();
  assert.ok($('roleRenegadeBtn').classList.contains('is-active'));
  $('modeIdentity3Btn').click();
  assert.ok($('roleLordBtn').classList.contains('is-active'), '切 3 人档后回退主公');
});

// ───── L1: 轮转开局 + AI 主公先手自动接管 (首个 flushTimers 时序测试) ─────

test('L1: 玩家=反贼开局 — 轮转正确 + AI 主公先手 + 定时器链驱动到玩家回合', () => {
  const game = startIdentityWithRole('modeIdentity4Btn', 'roleRebelBtn');
  assert.equal(game.roles.player, '反贼', '玩家=所选身份');
  assert.deepEqual(
    game.seats.map((s) => game.roles[s]).slice().sort(),
    ['主公', '内奸', '反贼', '忠臣'], '构成不变 (1主1忠1反1内)');
  const lordSeat = game.seats.find((s) => game.roles[s] === '主公');
  assert.notEqual(lordSeat, 'player');
  assert.equal(game.firstActor, lordSeat, 'AI 主公先手');
  // v13 L review 修复: 原 OR 断言 (到玩家/挂起/终局) 在约 1/3-2/3 的随机
  // 种子下被"AI 出杀攻击玩家 → shanResponse ask 挂起"分支满足, 多跳 AI
  // 链未被真正行使。改为确定性布局: 清空全席手牌/判定区与牌堆 (AI 无牌
  // 可出、摸不到牌), enemyStep 链必须逐席空转 3 个 AI 回合后交回玩家。
  for (const seat of game.seats) {
    game[seat].hand = [];
    game[seat].judgeArea = [];
  }
  game.deck = [];
  const flushes = driveTimers(300);
  assert.ok(flushes > 0, '定时器链确实被驱动');
  const after = UI.getGame();
  assert.equal(after.turn, 'player',
    '多跳 AI 链 (主公起 3 个 AI 座席) 逐席推进后交回玩家回合 (flushes=' + flushes + ')');
  assert.equal(Engine.getPendingChoice(after), null, '无挂起残留');
});

test('L1: 玩家=内奸 4 人档 — 玩家席内奸徽章显示 (新补 DOM 节点)', () => {
  const game = startIdentityWithRole('modeIdentity4Btn', 'roleRenegadeBtn');
  assert.equal(game.roles.player, '内奸');
  UI.render();
  assert.equal($('playerRenegadeBadge').hidden, false, '玩家席内奸徽章显示');
  assert.equal($('playerLordBadge').hidden, true);
  driveTimers(300); // 清空 AI 先手链, 防污染后续用例
});

test('L1: 选将提示文案 — 身份场显示"您是反贼，请选将"', () => {
  $('lobby1v1Btn').click();
  $('modeIdentity4Btn').click();
  $('roleRebelBtn').click();
  assert.match($('heroPickPrompt').textContent, /您是反贼/, '提示文案 = 所选身份');
  $('roleRandomBtn').click();
  assert.match($('heroPickPrompt').textContent, /身份随机/, '随机档专属文案');
  $('roleLordBtn').click();
});

// ───── L1: 黄天按钮全链路 (玩家群势力忠臣 + AI 主公张角) ─────

test('L1: 黄天按钮 — 忠臣华雄给 AI 主公张角交闪 (按钮 → 选牌 → 结算)', () => {
  $('lobby1v1Btn').click();
  $('modeIdentity3Btn').click();
  $('roleLoyalBtn').click();
  $('playerHeroSelect').value = 'huaxiong';
  $('enemyHeroSelect').value = 'caocao';
  $('allyHeroSelect').value = 'zhangjiao';
  $('startGameBtn').click();
  $('exitConfirmModal').hidden = true;
  const game = UI.getGame();
  assert.equal(game.roles.player, '忠臣');
  // 3p 玩家=忠臣轮转: [忠,主,反] → 主公=enemy? 预设 [主,反,忠] offset 2:
  // player=忠, enemy=主, ally=反。张角必须坐主公席 → 换 enemy 席武将。
  driveTimers(300);
  const lordSeat = game.seats.find((s) => game.roles[s] === '主公');
  // 把主公席武将换成张角 (UI 下拉只有敌方/第三席, 直接改 state 等价布局)。
  if (game[lordSeat].name !== '张角') {
    const zj = Engine.newGame({ seed: 9, playerHero: 'zhangjiao' }).player;
    game[lordSeat].name = zj.name;
    game[lordSeat].camp = zj.camp;
    game[lordSeat].skills = zj.skills;
  }
  game.turn = 'player';
  game.phase = 'play';
  game.pendingChoice = null;
  game.pendingChoiceQueue = [];
  game.pauseState = {};
  game.player.hp = game.player.maxHp;
  game.player.hand = [c('shan', { id: 'ht-shan' })];
  game.player.flags = {};
  drainTimersAtPlayerIdle(); // 复位 enemyThinking (中断的 AI 链可能残留 true)
  UI.render();
  assert.ok($('playerSkillBar').innerHTML.indexOf('data-skill-id="huangtian"') >= 0,
    '黄天·交牌按钮出现 (玩家群势力忠臣 + AI 主公张角)');
  const before = game[lordSeat].hand.length;
  $('playerSkillBar').dispatchClick({ 'data-skill-id': 'huangtian' });
  $('playerHand').dispatchClick({ 'data-card-id': 'ht-shan' });
  $('handConfirmBtn').click();
  assert.equal(game[lordSeat].hand.length, before + 1, '闪交给主公张角');
  assert.equal(game.player.hand.length, 0);
});

// ───── L2: 玩家于自己回合内阵亡 → 自动接管不卡死 + 旁观态 ─────

test('L2: 玩家自己回合内阵亡 — 渲染层自动接管驱动, 回合交给存活座席 (不卡死)', () => {
  // v13 L review 修复: 身份选择跨用例粘滞 (模块级 identityPlayerRole),
  // 显式点回主公档让"玩家先手"前提真实成立 (本用例目标是亡席接管, 但
  // 注释前提不应撒谎)。
  const game = startIdentityWithRole('modeIdentity4Btn', 'roleLordBtn');
  driveTimers(300);
  game.turn = 'player';
  game.phase = 'play';
  game.pendingChoice = null;
  game.pendingChoiceQueue = [];
  game.pauseState = {};
  // 模拟苦肉/决斗反噬式自阵亡: 亡席滞留自己的出牌阶段。
  game.player.hp = 0;
  game.player.hand = [];
  UI.render();
  const flushes = driveTimers(300);
  const after = UI.getGame();
  assert.ok(flushes > 0, '接管驱动确实发生 (修复前无人推进, 卡死)');
  assert.ok(after.phase === 'gameover' || after.turn !== 'player',
    '亡席玩家的回合被自动推完, 交给存活座席 (turn=' + after.turn + ')');
});

test('L2: 亡席输入守卫 + 旁观文案', () => {
  const game = startIdentityWithRole('modeIdentity4Btn', 'roleLordBtn'); // 显式复位身份 (粘滞)
  driveTimers(300);
  game.turn = 'player';
  game.phase = 'play';
  game.pendingChoice = null;
  game.pauseState = {};
  game.player.hp = 0;
  game.player.hand = [c('sha', { id: 'dead-sha' })];
  const enemyHp = game.enemy.hp;
  // 亡席出牌被守卫拦截 (即便牌还在手上/回合标记还没推走)。
  globalThis.window.SanguoshaUI.render();
  $('playerHand').dispatchClick({ 'data-card-id': 'dead-sha' });
  $('handConfirmBtn').click();
  assert.equal(game.enemy.hp, enemyHp, '亡席玩家出牌被拦截');
  // 旁观文案 (回合推走后)。
  driveTimers(300);
  const after = UI.getGame();
  if (after.phase !== 'gameover') {
    assert.match($('statusTitle').textContent, /阵亡|旁观/, '旁观期状态横幅');
  }
});

// ───── 零回归 ─────

test('零回归: 身份场主公档 (缺省值) → v12 固定预设行为恒等', () => {
  // 身份选择与武将下拉同样跨局粘滞 (前序用例选过忠臣), 显式点回缺省主公。
  const game = startIdentityWithRole('modeIdentity5Btn', 'roleLordBtn');
  assert.equal(game.roles.player, '主公', '缺省主公');
  assert.equal(game.firstActor, 'player', '玩家先手');
  assert.deepEqual(
    game.seats.map((s) => game.roles[s]),
    ['主公', '反贼', '忠臣', '反贼', '内奸'], '缺省 = 预设原序');
});

let passed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed += 1; console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
console.log(`${passed}/${tests.length} 个 L 阶段 UI 用例通过。`);
