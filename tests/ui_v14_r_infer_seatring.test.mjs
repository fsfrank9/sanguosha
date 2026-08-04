// v14 R3 (用户点单两项):
//   ① 玩家侧推断提示徽章 — 暗身份未翻明席右上角「疑反/疑忠」, 取值只经
//     Engine.perceivedSideOf (viewer='player') 行为推断路由; 证据不足恒隐,
//     与"?"徽章共存; 明置/已翻明/自己席恒隐 (零回归)。
//   ② 座席环横排压缩 (K3 遗留销账) — is-identity4/5 首行列 minmax(0,1fr)
//     覆写 + 席卡 clamp 收窄, CSS 锚点守护。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { test, runTests } from './helpers/harness.mjs';

const dom = installFakeDom();
const { Engine } = await import('./helpers/load-engine.mjs');
await import('../src/ui/dom-adapter.js');

const UI = globalThis.window.SanguoshaUI;
const $ = dom.$;

function ensureHiddenToggle(on) {
  const btn = $('hiddenRolesToggleBtn');
  if (btn.getAttribute('aria-pressed') == null) btn.click();
  const active = btn.getAttribute('aria-pressed') === 'true';
  if (active !== on) btn.click();
}

function startIdentity5(hidden) {
  $('lobby1v1Btn').click();
  $('modeIdentity5Btn').click();
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

// ui_m_hidden_roles 同款残留计时器排干 (玩家非主公时 newGame 排入 AI 链)。
function drainPendingTimers() {
  const game = UI.getGame();
  if (game) game.phase = 'gameover';
  let guard = 0;
  while (dom.pendingTimerCount() > 0 && guard < 10) {
    dom.flushTimers();
    guard += 1;
  }
}

// ───── ① 推断提示徽章 ─────

test('R3 静态锚点: 4 席推断徽章节点 (默认 hidden) + hero.css 独立规则块', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const seat of ['enemy', 'ally', 'ally2', 'ally3']) {
    assert.match(html, new RegExp(`<span class="suspect-badge" id="${seat}SuspectBadge" hidden>`),
      seat + ' 推断徽章节点 (默认 hidden)');
  }
  const css = fs.readFileSync(new URL('../src/styles/hero.css', import.meta.url), 'utf8');
  assert.match(css, /\.suspect-badge\s*\{[\s\S]{0,400}dashed/, '虚线描边 (与实锤徽章视觉区分)');
  assert.match(css, /\.suspect-badge--rebel/, '疑反配色变体');
  assert.match(css, /\.suspect-badge--lord/, '疑忠配色变体');
});

test('R3 推断徽章: 证据不足 → 恒隐 (只显 "?"); 达阈值 → 疑反显示且 "?" 共存', () => {
  const game = startIdentity5(true);
  UI.render();
  assert.equal($('enemySecretBadge').hidden, false, '暗置未翻明: "?" 徽章可见');
  assert.equal($('enemySuspectBadge').hidden, true, '零证据: 推断徽章恒隐, 不编造方向');

  // 喂公开攻击证据: enemy 打主公 1 点 → inferredLeaning=+3 ≥ 阈值 2 → 疑反。
  game.aggressionLog = [{ source: 'enemy', target: 'player', amount: 1 }];
  UI.render();
  assert.equal($('enemySuspectBadge').hidden, false, '达阈值: 疑反徽章显示');
  assert.equal($('enemySuspectBadge').textContent, '疑反');
  assert.match($('enemySuspectBadge').className, /suspect-badge--rebel/);
  assert.equal($('enemySecretBadge').hidden, false, '"?" 徽章共存不互斥 (身份仍未确认)');
  drainPendingTimers();
});

test('R3 推断徽章: 主忠向证据 → 疑忠; 证据消退 → 回落恒隐', () => {
  const game = startIdentity5(true);
  // stanceLog: ally 救主公 (rescue w=3, beneficiary=主公) → -3 ≤ -2 → 疑忠。
  game.stanceLog = [{ type: 'rescue', source: 'ally', beneficiary: 'player' }];
  UI.render();
  assert.equal($('allySuspectBadge').hidden, false, '疑忠徽章显示');
  assert.equal($('allySuspectBadge').textContent, '疑忠');
  assert.match($('allySuspectBadge').className, /suspect-badge--lord/);
  game.stanceLog = [];
  UI.render();
  assert.equal($('allySuspectBadge').hidden, true, '证据清空 → 推断徽章回落隐藏');
  drainPendingTimers();
});

test('R3 推断徽章: 已翻明席恒隐 (真实徽章接管); 达阈值也不显示', () => {
  const game = startIdentity5(true);
  game.aggressionLog = [{ source: 'enemy', target: 'player', amount: 2 }];
  game.roleRevealed.enemy = true; // 翻明 (如阵亡亮出)
  UI.render();
  assert.equal($('enemySuspectBadge').hidden, true, '已翻明: 推断徽章恒隐');
  assert.equal($('enemySecretBadge').hidden, true, '"?" 徽章同隐');
  assert.equal($('enemyRebelBadge').hidden, false, '真实身份徽章接管');
  drainPendingTimers();
});

test('R3 零回归: 明置模式推断徽章恒隐 (即便证据达阈值)', () => {
  const game = startIdentity5(false);
  game.aggressionLog = [{ source: 'enemy', target: 'player', amount: 3 }];
  UI.render();
  assert.equal($('enemySuspectBadge').hidden, true, '明置: 推断徽章恒隐');
  assert.equal($('enemyRebelBadge').hidden, false, '明置: 真实徽章照常');
  drainPendingTimers();
});

test('R3 引擎面: Engine.perceivedSideOf 已导出且不读未翻明 roles (行为验证)', () => {
  const game = startIdentity5(true);
  // 未翻明零证据 → null; 直读 roles 的实现会返回真实阵营, 此断言抓旁路。
  assert.equal(Engine.perceivedSideOf(game, 'player', 'enemy'), null,
    '零证据未翻明席 → null (恒不读暗置身份)');
  game.aggressionLog = [{ source: 'enemy', target: 'player', amount: 1 }];
  assert.equal(Engine.perceivedSideOf(game, 'player', 'enemy'), 'rebelSide');
  drainPendingTimers();
});

// ───── ② 座席环横排压缩 CSS 锚点 ─────

test('R3 座席环压缩: is-identity4/5 列收缩覆写 + 席卡 clamp 收窄 (K3 遗留销账)', () => {
  const layout = fs.readFileSync(new URL('../src/styles/layout.css', import.meta.url), 'utf8');
  assert.match(layout, /\.duel-table\.is-identity4\s*\{\s*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
    '4 人首行列 minmax(0,1fr) 收缩覆写');
  assert.match(layout, /\.duel-table\.is-identity5\s*\{\s*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/,
    '5 人首行列 minmax(0,1fr) 收缩覆写');
  assert.match(layout, /is-identity5 \.ally-zone \.hero\.seat-card[\s\S]{0,200}clamp\(172px,\s*100%,\s*236px\)/,
    '席卡 clamp 收窄 (地板 172px / 官方规格上限 236px)');
  // 原 K3 行模板块保持原文 (守护正则依赖 400 字符窗口锚定)。
  assert.match(layout, /is-identity5[\s\S]{0,400}"seat-enemy seat-ally seat-ally2 seat-ally3"/,
    'K3 原 grid-template-areas 块未被改写');
  // 官方口径守护: 收缩规则对全部非玩家席同栅格同规则 (恒等宽)。
  assert.match(layout, /is-identity4 \.opponent-zone,\s*\n\s*\.duel-table\.is-identity4 \.ally-zone/,
    '敌方席与 ally 席同规则收缩');
});

await runTests();

console.log('\nv14 R3 推断提示徽章 + 座席环压缩 用例通过。');
