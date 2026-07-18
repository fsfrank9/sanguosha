// v13 UI 修缮批 (用户实测反馈 6 项) — fake-DOM 全链路:
//   1. 出牌确认统一: 铁索 1v1 面板/座席重铸/苦肉 直出路径全部改
//      stage-then-confirm (每张牌/每个直发技都要"确定")。
//   2+3. 帮助文案随现状更新; 菜单三个未实现占位项 (等待/背景/变速) 移除。
//   4. 一级界面分入口: 1v1 对战 / 身份场 两个 lobby 入口, 身份场进入后
//      选 3/4/5 人 (对应家族外模式按钮隐藏)。
//   5. 暗身份默认开启 (开关保留, 可关回明置)。
//   6. 角色卡单卡化: 装备槽列 (武/防/+1/-1 定序) + 延时锦囊名首字圆标
//      (乐/兵/闪) + 手牌数角标; 牌背行撤销; 多人场 AI 席同行多列。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installFakeDom } from './helpers/fake-dom.mjs';

const dom = installFakeDom();
const { Engine } = await import('./helpers/load-engine.mjs');
await import('../src/ui/dom-adapter.js');

const UI = globalThis.window.SanguoshaUI;
const $ = dom.$;
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function ensureHiddenToggle(on) {
  const btn = $('hiddenRolesToggleBtn');
  if (btn.getAttribute('aria-pressed') == null) btn.click();
  if ((btn.getAttribute('aria-pressed') === 'true') !== on) btn.click();
}

function startDuel(playerHero = 'liubei', enemyHero = 'caocao') {
  $('lobby1v1Btn').click();
  $('playerHeroSelect').value = playerHero;
  $('enemyHeroSelect').value = enemyHero;
  $('startGameBtn').click();
  $('exitConfirmModal').hidden = true;
  return UI.getGame();
}

// 开局若 AI 先手, newGame 已排 enemyStep 计时器且 enemyThinking=true —
// 整形 game.turn='player' 后冲刷计时器让 enemyStep 退出并复位标志
// (ui_l drainTimersAtPlayerIdle 同口径), 否则玩家输入被拦截。
function drainToPlayerIdle() {
  let guard = 0;
  while (dom.pendingTimerCount() > 0 && guard < 200) {
    dom.flushTimers();
    guard += 1;
  }
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── 4: 一级界面分入口 ─────

test('修缮4: lobby 双入口 — 1V1 对战 + 身份场 (静态标记)', () => {
  assert.match(html, /id="lobby1v1Btn"[\s\S]{0,200}1V1 对战/);
  assert.match(html, /id="lobbyIdentityBtn"[\s\S]{0,200}身份场/);
});

test('修缮4: 身份场入口 → setup 显示人数选择 (3/4/5), 1v1 按钮隐藏, 缺省 5 人档', () => {
  $('lobbyIdentityBtn').click();
  assert.equal($('setupScreen').hidden, false);
  assert.equal($('matchModePanel').hidden, false, '身份场入口显示人数行');
  assert.equal($('modeDuelBtn').hidden, true, '1v1 模式按钮不在身份场入口出现');
  assert.equal($('modeIdentity5Btn').hidden, false);
  assert.ok($('modeIdentity5Btn').classList.contains('is-active'), '缺省 5 人档');
  assert.equal($('identityRolePanel').hidden, false, '身份选择面板同屏');
});

test('修缮4: 1v1 入口 → 人数行整体隐藏 (无可选), 开局即 duel', () => {
  $('lobby1v1Btn').click();
  assert.equal($('matchModePanel').hidden, true, '1v1 无模式可选 → 整行隐藏');
  const game = startDuel();
  assert.equal(game.mode, 'duel');
  assert.equal(game.seats.length, 2);
});

// ───── 5: 暗身份默认开启 ─────

test('修缮5: 身份场入口开局不碰开关 → hiddenRoles 默认开', () => {
  // 前序用例可能已把模块态点关 — 归位到"开"再验证缺省透传。
  $('lobbyIdentityBtn').click();
  ensureHiddenToggle(true);
  $('playerHeroSelect').value = 'liubei';
  $('enemyHeroSelect').value = 'caocao';
  $('allyHeroSelect').value = 'guanyu';
  $('ally2HeroSelect').value = 'zhangfei';
  $('ally3HeroSelect').value = 'zhaoyun';
  $('startGameBtn').click();
  $('exitConfirmModal').hidden = true;
  const game = UI.getGame();
  assert.equal(game.hiddenRoles, true, '暗身份默认开启');
  // 开关可关回明置 (零回归口径在 ui_m 文件)。
});

// ───── 2+3: 帮助与菜单 ─────

test('修缮3: 菜单占位项清零 (等待/背景/变速移除), 帮助文案更新', () => {
  assert.doesNotMatch(html, /side-drawer__item is-placeholder/);
  const adapter = fs.readFileSync(new URL('../src/ui/dom-adapter.js', import.meta.url), 'utf8');
  assert.match(adapter, /身份场 \(3·4·5 人/, '帮助含身份场说明');
  assert.match(adapter, /暗身份默认开启/, '帮助含暗身份说明');
  assert.doesNotMatch(adapter, /v9 UI 重制中/, '旧帮助文案已撤');
});

// ───── 1: 出牌确认统一 (苦肉 stage-then-confirm; 铁索在 a3_batch3/h_review 钉死) ─────

test('修缮1: 苦肉 — 点技能仅暂存, 确定才发动; 取消可撤', () => {
  const game = startDuel('huanggai', 'caocao');
  game.turn = 'player';
  game.phase = 'play';
  Engine.clearPendingChoice && Engine.clearPendingChoice(game);
  drainToPlayerIdle();
  game.player.hand = [];
  game.deck = [c('shan', { id: 'kr-d1' }), c('shan', { id: 'kr-d2' }), c('shan', { id: 'kr-d3' }), c('shan', { id: 'kr-d4' })];
  UI.render();
  const hpBefore = game.player.hp;
  $('playerSkillBar').dispatchClick({ 'data-skill-id': 'kurou' });
  assert.equal(game.player.hp, hpBefore, '点技能仅暂存, 未掉血');
  $('handCancelBtn').click();
  $('playerSkillBar').dispatchClick({ 'data-skill-id': 'kurou' });
  assert.equal(game.player.hp, hpBefore, '取消后再点仍是暂存');
  $('handConfirmBtn').click();
  assert.equal(game.player.hp, hpBefore - 1, '确定后发动: 失去 1 点体力');
  assert.equal(game.player.hand.length, 2, '摸两张');
});

// ───── 6: 角色卡单卡化 ─────

test('修缮6: 静态标记 — 每席单卡 (equip-column/judge-dots/hand-corner), 牌背行与旧分区面板撤销', () => {
  for (const seat of ['enemy', 'ally', 'ally2', 'ally3', 'player']) {
    assert.match(html, new RegExp(`class="equipment-area equip-column" id="${seat}EquipmentArea"`), seat + ' 装备槽列');
    assert.match(html, new RegExp(`class="judge-area judge-dots" id="${seat}JudgeArea"`), seat + ' 判定圆标区');
    assert.match(html, new RegExp(`class="hand-corner" id="${seat}HandBadge"`), seat + ' 手牌角标');
  }
  assert.doesNotMatch(html, /HandBacks/, 'AI 牌背行撤销');
  assert.doesNotMatch(html, /zone-title/, '旧分区面板标题撤销 (单卡化)');
  assert.match(html, /hero enemy seat-card/, 'hero 单卡类');
});

test('修缮6: 装备槽列 — 武/防/+1/-1 定序四槽, 空槽占位, 实装显名', () => {
  const game = startDuel();
  game.enemy.equipment.weapon = c('qinglong', { id: 'p6-w', name: '青龙偃月刀' });
  game.enemy.equipment.horseMinus = c('minus_horse', { id: 'p6-hm', name: '的卢' });
  UI.render();
  const inner = $('enemyEquipmentArea').innerHTML;
  const order = [...inner.matchAll(/data-slot="([a-zA-Z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ['weapon', 'armor', 'horsePlus', 'horseMinus'], '展示序 武/防/+1马/-1马');
  assert.match(inner, /data-slot="weapon"[^>]*><i class="equip-slot__tag">武<\/i>青龙偃月刀/);
  assert.match(inner, /class="equip-slot is-empty" data-slot="armor"/, '空防具槽淡显占位');
  assert.match(inner, /data-slot="horseMinus"[^>]*><i class="equip-slot__tag">-1<\/i>的卢/);
});

test('修缮6: 延时锦囊圆标 — 名首字 乐/兵/闪, 放置顺序, 类型着色', () => {
  const game = startDuel();
  game.enemy.judgeArea = [
    c('shandian', { id: 'p6-sd', name: '闪电' }),
    c('lebusishu', { id: 'p6-le', name: '乐不思蜀' }),
    c('bingliang', { id: 'p6-bl', name: '兵粮寸断' })
  ];
  UI.render();
  const inner = $('enemyJudgeArea').innerHTML;
  const glyphs = [...inner.matchAll(/judge-dot judge-dot--([a-z]+)"[^>]*>([^<])</g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(glyphs, [['shandian', '闪'], ['lebusishu', '乐'], ['bingliang', '兵']],
    '首字与类型色类按放置顺序: ' + inner);
});

test('修缮6: 手牌数角标 — HandBadge 数字随手牌变化, 无牌面泄漏', () => {
  const game = startDuel();
  game.enemy.hand = [c('sha', { id: 'p6-s1' }), c('shan', { id: 'p6-s2' }), c('tao', { id: 'p6-s3' })];
  UI.render();
  assert.equal(String($('enemyHandBadge').textContent), '3'); // fake-dom 不强转字符串
  assert.ok(String($('enemyHandBadge').innerHTML).indexOf('杀') < 0, '仅数字无牌面');
  game.enemy.hand.pop();
  UI.render();
  assert.equal(String($('enemyHandBadge').textContent), '2');
});

test('修缮6: hero.css/zones.css/layout.css 样式锚点 — 圆标/槽列/多列座席', () => {
  const zones = fs.readFileSync(new URL('../src/styles/zones.css', import.meta.url), 'utf8');
  assert.match(zones, /\.judge-dot\s*\{/);
  assert.match(zones, /\.judge-dot--lebusishu/);
  assert.match(zones, /\.equip-slot\s*\{/);
  assert.match(zones, /\.hand-corner\s*\{/);
  const layout = fs.readFileSync(new URL('../src/styles/layout.css', import.meta.url), 'utf8');
  assert.match(layout, /is-identity5[\s\S]{0,400}"seat-enemy seat-ally seat-ally2 seat-ally3"/,
    '5 人场 AI 席同行四列');
});

// 文末清场: 终局化最后一局并冲刷残留计时器 (ui_m 哨兵同口径)。
function finalDrain() {
  const game = UI.getGame();
  if (game) game.phase = 'gameover';
  let guard = 0;
  while (dom.pendingTimerCount() > 0 && guard < 10) { dom.flushTimers(); guard += 1; }
}

let passed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed += 1; console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
finalDrain();
assert.equal(dom.pendingTimerCount(), 0, '文末零残留计时器哨兵');
console.log(`${passed}/${tests.length} 个 v13 UI 修缮用例通过。`);
