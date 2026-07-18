// v12 H6: 3人身份场 UI 三件套 — 模式选择 / 第三席渲染 / 座席点选交互 /
// 激将求助面板, 以及 1v1 零回归。fake-DOM 全链路 (真实 lobby 流程开局)。
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

// identity3 开局 (真实 lobby → 模式切换 → 选将 → startGame), 然后整形成
// 确定性局面 (清三席手牌/装备/判定区, 玩家回合出牌阶段)。
// v13 UI修缮5: 暗身份默认开 — 本文件断言明置徽章 (暗置覆盖在 ui_m), 显式关闭。
// fake-dom 不解析初始标记: 原始按钮无 aria, 先点一次同步再判读。
function forceOpenRoles() {
  const btn = $('hiddenRolesToggleBtn');
  if (btn.getAttribute('aria-pressed') == null) btn.click();
  if (btn.getAttribute('aria-pressed') === 'true') btn.click();
}

function startIdentity3ViaUI(playerHero = 'liubei', enemyHero = 'caocao', allyHero = 'guanyu') {
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
  }
  game.pendingChoice = null;
  game.pendingChoiceQueue = [];
  game.pauseState = {};
  UI.render();
  return game;
}

// 1v1 开局 (显式点回 duel 模式按钮, 防止前序 identity3 测试的粘滞状态)。
function startDuelViaUI(playerHero = 'liubei', enemyHero = 'caocao') {
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
  }
  game.pendingChoice = null;
  game.pendingChoiceQueue = [];
  game.pauseState = {};
  UI.render();
  return game;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── 模式选择 + 第三席渲染 ─────────────────────────────────────────

test('模式切换: 点 3人身份场 → 第三席下拉显示 + 身份判定区隐藏 + 按钮态切换', () => {
  $('lobby1v1Btn').click();
  $('modeIdentity3Btn').click();
  assert.equal($('allyHeroPickRow').hidden, false, '第三席武将下拉显示');
  assert.equal($('roleDraftPanel').hidden, true, '身份判定区隐藏 (身份固定预设)');
  assert.ok($('modeIdentity3Btn').classList.contains('is-active'), 'identity3 按钮激活');
  assert.ok(!$('modeDuelBtn').classList.contains('is-active'), 'duel 按钮取消激活');
  $('modeDuelBtn').click();
  assert.equal($('allyHeroPickRow').hidden, true, '切回 1v1 → 第三席下拉隐藏');
  assert.equal($('roleDraftPanel').hidden, false, '身份判定区恢复');
});

test('identity3 开局: mode/座次/身份预设正确, 第三席渲染 + 忠臣徽章 + 布局 class', () => {
  const game = startIdentity3ViaUI();
  assert.equal(game.mode, 'identity3');
  assert.deepEqual(game.seats, ['player', 'enemy', 'ally']);
  assert.deepEqual(
    [game.roles.player, game.roles.enemy, game.roles.ally],
    ['主公', '反贼', '忠臣'], '身份固定预设');
  assert.equal($('allyZone').hidden, false, '第三席区域显示');
  assert.ok($('duelTable').classList.contains('is-identity3'), '牌桌带 identity3 布局 class');
  assert.ok($('allyName').textContent.length > 0, '第三席武将名渲染');
  assert.equal($('allyLoyalistBadge').hidden, false, '第三席忠臣徽章显示');
  assert.equal($('playerLordBadge').hidden, false, '玩家主公徽章显示');
  assert.equal($('enemyRebelBadge').hidden, false, '敌方反贼徽章显示');
});

test('identity3 开局: 第三席武将与前两席同名 → 自动改选不冲突武将', () => {
  const game = startIdentity3ViaUI('liubei', 'caocao', 'liubei');
  assert.ok(game.ally, '第三席存在');
  assert.notEqual(game.ally.name, game.player.name, '第三席与我方不同名');
  assert.notEqual(game.ally.name, game.enemy.name, '第三席与敌方不同名');
});

// ───── 座席点选交互 (单目标牌) ────────────────────────────────────────

test('座席点选: 选杀确认 → 点座席暂存 → 再确认才结算 (v13 J0-1)', () => {
  const game = startIdentity3ViaUI();
  game.player.hand = [c('sha', { id: 'ui3-sha' })];
  UI.render();

  $('playerHand').dispatchClick({ 'data-card-id': 'ui3-sha' });
  $('handConfirmBtn').click();

  assert.equal($('seatTargetModePanel').hidden, false, '座席点选面板弹出');
  assert.match($('seatTargetModeHint').textContent, /杀/, '提示带牌名');
  assert.ok($('enemyHero').classList.contains('is-target-selectable'), '敌方座席高亮');
  assert.ok($('allyHero').classList.contains('is-target-selectable'), '第三席也是合法目标 (可高亮)');

  const enemyHpBefore = game.enemy.hp;
  $('enemyHero').click();

  // v13 J0-1: 点座席只暂存, 不直接结算 ("有目标必过确认")
  assert.equal(game.enemy.hp, enemyHpBefore, '点座席仅暂存, 未结算');
  assert.equal($('seatTargetModePanel').hidden, false, '面板保持打开等待确认');
  assert.ok($('enemyHero').classList.contains('is-target-staged'), '暂存座席加粗高亮');
  assert.equal($('seatTargetConfirmBtn').hidden, false, '确定按钮出现');

  $('seatTargetConfirmBtn').click();

  assert.equal(game.enemy.hp, enemyHpBefore - 1, '确认后杀命中所点座席 (AI 无闪)');
  assert.equal(game.player.hand.length, 0, '杀已打出');
  assert.equal($('seatTargetModePanel').hidden, true, '点选面板关闭');
  assert.ok(!$('enemyHero').classList.contains('is-target-selectable'), '高亮清理');
});

test('座席点选: 暂存可改选/取消暂存 (v13 J0-1)', () => {
  const game = startIdentity3ViaUI();
  game.player.hand = [c('sha', { id: 'ui3-sha2' })];
  UI.render();
  $('playerHand').dispatchClick({ 'data-card-id': 'ui3-sha2' });
  $('handConfirmBtn').click();

  $('enemyHero').click();
  assert.ok($('enemyHero').classList.contains('is-target-staged'), 'enemy 暂存');
  $('allyHero').click(); // 单目标改选
  assert.ok(!$('enemyHero').classList.contains('is-target-staged'), 'enemy 暂存被替换');
  assert.ok($('allyHero').classList.contains('is-target-staged'), 'ally 暂存');
  $('allyHero').click(); // 再点取消暂存
  assert.ok(!$('allyHero').classList.contains('is-target-staged'), '再点取消暂存');
  assert.equal($('seatTargetConfirmBtn').hidden, true, '无暂存 → 确定按钮隐藏');
  assert.equal(game.player.hand.length, 1, '全程未结算');
});

test('座席点选: 取消按钮 → 退出点选, 手牌保留可再操作', () => {
  const game = startIdentity3ViaUI();
  game.player.hand = [c('juedou', { id: 'ui3-jd' })];
  UI.render();

  $('playerHand').dispatchClick({ 'data-card-id': 'ui3-jd' });
  $('handConfirmBtn').click();
  assert.equal($('seatTargetModePanel').hidden, false, '决斗进入座席点选');

  $('seatTargetCancelBtn').click();
  assert.equal($('seatTargetModePanel').hidden, true, '取消后面板关闭');
  assert.equal(game.player.hand.length, 1, '手牌未消耗');
  assert.ok(!$('allyHero').classList.contains('is-target-selectable'), '高亮清理');
});

test('座席点选: 过河拆桥点第三席 → 转入目标区域面板, 显式目标透传', () => {
  const game = startIdentity3ViaUI();
  game.player.hand = [c('guohe', { id: 'ui3-gh' })];
  game.ally.hand = [c('sha', { id: 'ally-keep' })];
  UI.render();

  $('playerHand').dispatchClick({ 'data-card-id': 'ui3-gh' });
  $('handConfirmBtn').click();
  assert.equal($('seatTargetModePanel').hidden, false, '先进座席点选');

  $('allyHero').click();
  $('seatTargetConfirmBtn').click(); // v13 J0-1: 暂存后确认
  assert.equal($('targetZonePanel').hidden, false, '选定座席后转入目标区域面板');

  $('targetHandBtn').click();
  $('targetCardChoices').dispatchClick({ 'data-target-zone': 'hand', 'data-target-card-id': 'ally-keep' });
  $('handConfirmBtn').click();

  assert.equal(game.ally.hand.length, 0, '第三席手牌被拆 (显式目标生效)');
  assert.ok(game.discard.some((x) => x.id === 'ally-keep'), '被拆牌入弃牌堆');
});

// ───── 激将求助面板 (jijiang-aid) ────────────────────────────────────

function shapeJijiangAidScene() {
  // 重构局面: 第三席刘备为主公 (AI), 玩家关羽为蜀忠臣; 敌方对主公决斗,
  // 主公无杀 → 挂起玩家代打询问。
  const game = startIdentity3ViaUI('guanyu', 'caocao', 'liubei');
  game.roles = { player: '忠臣', enemy: '反贼', ally: '主公' };
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('juedou', { id: 'aid-jd' })];
  game.ally.hand = [];
  game.player.hand = [c('sha', { id: 'aid-sha' })];
  const res = Engine.playCard(game, 'enemy', 'aid-jd', { target: 'ally' });
  assert.equal(res.ok, true, res.message);
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'jijiang-aid', '激将代打询问挂起');
  UI.render();
  return game;
}

test('激将求助: 面板弹出 → 选杀代打 → 主公免伤, 决斗打回敌方', () => {
  const game = shapeJijiangAidScene();
  assert.equal($('lordAidPanel').hidden, false, '求助面板弹出');
  assert.match($('lordAidHint').textContent, /激将/, '提示带技能名');
  assert.match($('lordAidChoices').innerHTML, /aid-sha/, '代打候选渲染');

  const allyHpBefore = game.ally.hp;
  const enemyHpBefore = game.enemy.hp;
  $('lordAidChoices').dispatchClick({ 'data-lord-aid-card-id': 'aid-sha' });
  $('handConfirmBtn').click();

  assert.equal(game.pendingChoice, null, '选择已提交');
  assert.equal(game.player.hand.length, 0, '玩家的杀被代打消耗');
  assert.equal(game.ally.hp, allyHpBefore, '主公免伤');
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '决斗打回敌方 (敌无杀受 1 伤)');
  assert.ok(game.log.some((line) => line.indexOf('响应【激将】') >= 0), '日志记录代打');
  UI.render();
  assert.equal($('lordAidPanel').hidden, true, '面板关闭');
});

test('激将求助: 不响应 → 主公受决斗伤害', () => {
  const game = shapeJijiangAidScene();
  const allyHpBefore = game.ally.hp;
  $('lordAidDeclineBtn').click();

  assert.equal(game.pendingChoice, null, '选择已提交');
  assert.equal(game.player.hand.length, 1, '玩家的杀保留');
  assert.equal(game.ally.hp, allyHpBefore - 1, '无人代打 → 主公受 1 伤');
  UI.render();
  assert.equal($('lordAidPanel').hidden, true, '面板关闭');
});

// ───── 1v1 零回归 ────────────────────────────────────────────────────

test('1v1 零回归: duel 模式下无第三席/无座席点选, 出杀即时结算', () => {
  const game = startDuelViaUI();
  assert.equal(game.mode, 'duel');
  assert.equal(game.ally, undefined, '无第三席');
  assert.equal($('allyZone').hidden, true, '第三席区域隐藏');
  assert.ok(!$('duelTable').classList.contains('is-identity3'), '无 identity3 布局 class');

  game.player.hand = [c('sha', { id: 'ui1-sha' })];
  UI.render();
  const enemyHpBefore = game.enemy.hp;
  $('playerHand').dispatchClick({ 'data-card-id': 'ui1-sha' });
  $('handConfirmBtn').click();

  assert.equal($('seatTargetModePanel').hidden, true, '1v1 不进座席点选');
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '点牌确认即时结算 (旧流程)');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
