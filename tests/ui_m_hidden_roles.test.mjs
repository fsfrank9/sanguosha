// v13 M: 暗身份 UI 全链路 (fake-DOM) —
//   M1: setup 暗身份开关 (文案/is-active/aria-pressed 三态同步, 跨局粘滞
//       管理), 暗置开局 AI 座席问号徽章 + 身份徽章隐藏, 玩家恒见自己
//       身份, 死亡翻明后徽章切换, 终局全翻明。
//   零回归: 开关关闭 (缺省) → 明置徽章行为与 K3/L 恒等。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installFakeDom } from './helpers/fake-dom.mjs';

const dom = installFakeDom();
const { Engine } = await import('./helpers/load-engine.mjs');
await import('../src/ui/dom-adapter.js');

const UI = globalThis.window.SanguoshaUI;
const $ = dom.$;

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

// 暗身份开关为模块级粘滞状态 (跨局保持) — 每个用例经 ensureHiddenToggle
// 显式置位, 避免用例间顺序耦合。
function ensureHiddenToggle(on) {
  const btn = $('hiddenRolesToggleBtn');
  // v13 UI修缮5: 模块缺省已为"开", 但 fake-dom 不解析初始标记 — 原始按钮
  // 无 class/aria。先点一次让 DOM 视图与模块态同步, 再按 aria 判读。
  if (btn.getAttribute('aria-pressed') == null) btn.click();
  const active = btn.getAttribute('aria-pressed') === 'true';
  if (active !== on) btn.click();
}

function startIdentity5(hidden, roleBtnId) {
  $('lobby1v1Btn').click();
  $('modeIdentity5Btn').click();
  if (roleBtnId) $(roleBtnId).click();
  ensureHiddenToggle(hidden);
  $('playerHeroSelect').value = 'liubei';
  $('enemyHeroSelect').value = 'caocao';
  $('allyHeroSelect').value = 'guanyu';
  $('ally2HeroSelect').value = 'zhangfei';
  $('ally3HeroSelect').value = 'zhaoyun';
  $('startGameBtn').click();
  $('exitConfirmModal').hidden = true;
  return UI.getGame();
}

// 玩家非主公暗置开局 → AI 主公先手, newGame 会排入 enemyStep 定时器。
// 本文件不驱动 AI 时序 (那是 ui_l 的领域), 但残留计时器是潜在脚枪 —
// 未来任何 flushTimers 调用都会把陈旧 AI 链打进当时的 game。收官
// review: 排干口径 = 置终局 (enemyStep 见 gameover 立即退出且不再
// 续排, 确定性) + 有界冲刷; 文末哨兵断言零残留。
function drainPendingTimers() {
  const game = UI.getGame();
  if (game) game.phase = 'gameover';
  let guard = 0;
  while (dom.pendingTimerCount() > 0 && guard < 10) {
    dom.flushTimers();
    guard += 1;
  }
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── M1: setup 开关三态同步 ─────

test('M1: index.html 静态锚点 — 开关初始态 (开/aria-pressed=true, v13 UI修缮5 官方缺省) + 4 问号徽章', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="hiddenRolesToggleBtn"[^>]*aria-pressed="true"[^>]*>暗身份·开</,
    '开关初始文案与 aria 态 — 暗身份默认开启 (fake-dom 不解析标记, 静态锁定)');
  for (const seat of ['enemy', 'ally', 'ally2', 'ally3']) {
    assert.match(html, new RegExp(`<span class="secret-badge" id="${seat}SecretBadge" hidden`),
      seat + ' 问号徽章节点 (默认 hidden)');
  }
  assert.match(fs.readFileSync(new URL('../src/styles/hero.css', import.meta.url), 'utf8'),
    /\.secret-badge\s*\{/, 'hero.css 问号徽章独立规则块');
});

test('M1: 暗身份开关 — 文案/is-active/aria-pressed 三态同步切换', () => {
  $('lobby1v1Btn').click();
  $('modeIdentity5Btn').click();
  const btn = $('hiddenRolesToggleBtn');
  ensureHiddenToggle(false); // 粘滞态归零 (fake-dom 初始 textContent 为空, 不断言初值)
  btn.click();
  assert.equal(btn.textContent, '暗身份·开');
  assert.ok(btn.classList.contains('is-active'));
  assert.equal(btn.getAttribute('aria-pressed'), 'true');
  btn.click();
  assert.equal(btn.textContent, '暗身份·关');
  assert.ok(!btn.classList.contains('is-active'));
  assert.equal(btn.getAttribute('aria-pressed'), 'false');
});

// ───── M1: 暗置开局 — 问号徽章与身份徽章互斥 ─────

test('M1: 暗置开局 (玩家=主公) — AI 座席全问号, 身份徽章隐藏, 玩家自见主公', () => {
  const game = startIdentity5(true, 'roleLordBtn');
  assert.equal(game.hiddenRoles, true, 'UI 开关透传 newGame');
  UI.render();
  for (const seat of ['enemy', 'ally', 'ally2', 'ally3']) {
    assert.equal($(seat + 'SecretBadge').hidden, false, seat + ' 问号徽章可见');
    assert.equal($(seat + 'LordBadge').hidden, true, seat + ' 主公徽章隐藏');
    assert.equal($(seat + 'RebelBadge').hidden, true, seat + ' 反贼徽章隐藏');
    assert.equal($(seat + 'LoyalistBadge').hidden, true, seat + ' 忠臣徽章隐藏');
    assert.equal($(seat + 'RenegadeBadge').hidden, true, seat + ' 内奸徽章隐藏');
  }
  // 玩家席无问号节点 (恒见自己身份), 主公徽章照常。
  assert.equal($('playerLordBadge').hidden, false, '玩家自见主公徽章');
});

test('M1: 暗置开局 (玩家=反贼) — 玩家自见反贼徽章, AI 主公徽章公开可见', () => {
  const game = startIdentity5(true, 'roleRebelBtn');
  assert.equal(game.hiddenRoles, true);
  assert.equal(game.roles.player, '反贼');
  UI.render();
  assert.equal($('playerRebelBadge').hidden, false, '玩家恒见自己身份');
  const lordSeat = game.seats.find((s) => game.roles[s] === '主公');
  assert.notEqual(lordSeat, 'player');
  assert.equal($(lordSeat + 'LordBadge').hidden, false, 'AI 主公身份恒公开 (官方: 除主公外暗置)');
  assert.equal($(lordSeat + 'SecretBadge').hidden, true, '主公席无问号');
  for (const seat of game.seats) {
    if (seat === 'player' || seat === lordSeat) continue;
    assert.equal($(seat + 'SecretBadge').hidden, false, seat + ' 非主公 AI 席问号');
  }
  drainPendingTimers(); // AI 主公先手排入的 enemyStep 计时器不外泄
});

// ───── M1: 死亡翻明 → 徽章切换 ─────

test('M1: 死亡翻明 — 暗置反贼阵亡后问号换真身份徽章', () => {
  const game = startIdentity5(true, 'roleLordBtn');
  // 预设: enemy=反贼 (暗置, 邻座)。玩家杀死 enemy → 翻明。
  game.turn = 'player';
  game.phase = 'play';
  game.player.hand = [c('sha', { id: 'm-ui-sha' })];
  game.enemy.hp = 1;
  game.enemy.hand = [];
  game.deck = [c('shan', { id: 'm-ui-d1' }), c('shan', { id: 'm-ui-d2' }), c('shan', { id: 'm-ui-d3' })];
  const result = Engine.playCard(game, 'player', 'm-ui-sha', { target: 'enemy' });
  assert.ok(result.ok, result.message);
  assert.equal(game.roleRevealed.enemy, true, '阵亡翻明');
  UI.render();
  assert.equal($('enemySecretBadge').hidden, true, '问号撤下');
  assert.equal($('enemyRebelBadge').hidden, false, '反贼徽章亮出');
});

test('M1: 终局全翻明 — gameover 渲染后所有座席显示真实身份徽章', () => {
  const game = startIdentity5(true, 'roleLordBtn');
  game.phase = 'gameover';
  game.winner = 'lordSide';
  if (game.roleRevealed) {
    for (const seat of game.seats) game.roleRevealed[seat] = true;
  }
  UI.render();
  const badgeOf = { 主公: 'LordBadge', 忠臣: 'LoyalistBadge', 反贼: 'RebelBadge', 内奸: 'RenegadeBadge' };
  for (const seat of ['enemy', 'ally', 'ally2', 'ally3']) {
    assert.equal($(seat + 'SecretBadge').hidden, true, seat + ' 问号撤下');
    assert.equal($(seat + badgeOf[game.roles[seat]]).hidden, false,
      seat + ' 真实身份徽章 (' + game.roles[seat] + ') 亮出');
  }
});

// ───── 零回归: 开关关闭 → 明置恒等 ─────

test('零回归: 开关关闭 (缺省) → hiddenRoles=false, 问号全隐, 身份徽章明置', () => {
  const game = startIdentity5(false, 'roleLordBtn');
  assert.equal(game.hiddenRoles, false);
  UI.render();
  const badgeOf = { 主公: 'LordBadge', 忠臣: 'LoyalistBadge', 反贼: 'RebelBadge', 内奸: 'RenegadeBadge' };
  for (const seat of ['enemy', 'ally', 'ally2', 'ally3']) {
    assert.equal($(seat + 'SecretBadge').hidden, true, seat + ' 明置无问号');
    assert.equal($(seat + badgeOf[game.roles[seat]]).hidden, false, seat + ' 身份徽章明置');
  }
});

let passed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed += 1; console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
assert.equal(dom.pendingTimerCount(), 0,
  '文末零残留计时器哨兵 — 新用例若引入 AI 先手开局, 须在用例内 drainPendingTimers()');
console.log(`${passed}/${tests.length} 个 M 阶段 UI 用例通过。`);
