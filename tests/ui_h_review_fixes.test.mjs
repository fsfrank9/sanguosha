// v12 H 独立合规复核 (UI 侧) — 5 处已验证缺陷的回归锁定:
//   U1 [严重] setMatchMode('duel') 不恢复随机身份 → 点过 identity3 再回 1v1
//      后 playerRole/enemyRole 永久停在主公/反贼, 静默吃掉 1v1 随机身份特性
//      (红线: 1v1 行为不得被 identity3 污染)。
//   U2 [严重] 座席点选状态切换到别的操作 (技能按钮) 时不清理 → 悬空的 hero
//      点击绑定会用"之前那张牌"静默出牌。
//   U3 [高] 借刀 UI 高亮持刀者但受害者恒缺省玩家自己 → 玩家出射程时点选必败;
//      改为两段点选 (先持刀者 An, 再从其可杀到的候选选受害者 Bn)。
//   U4 [高] 黄天玩家主动交牌按钮在固定身份预设 (玩家恒主公) 下 100% 不可达
//      (死代码) → 移除, 避免"看似有实则触发不了"。
//   U5 [中] 铁索连环 identity3 无法选第三席 (旧面板硬编码 enemy/self/both) →
//      改用泛化座席点选 (1-2 目标 + 重铸)。
import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';

const dom = installFakeDom();
const { Engine } = await import('./helpers/load-engine.mjs');
await import('../src/ui/dom-adapter.js');

const UI = globalThis.window.SanguoshaUI;
const $ = dom.$;
function c(type, overrides = {}) { return Engine.makeTestCard(type, overrides); }

function shape3p(game) {
  game.turn = 'player';
  game.phase = 'play';
  for (const s of game.seats) {
    game[s].hand = [];
    game[s].judgeArea = [];
    game[s].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[s].hp = game[s].maxHp;
  }
  game.pendingChoice = null;
  game.pendingChoiceQueue = [];
  game.pauseState = {};
  UI.render();
  return game;
}

function start3p(p = 'diaochan', e = 'caocao', a = 'zhangfei') {
  $('lobby1v1Btn').click();
  $('modeIdentity3Btn').click();
  $('playerHeroSelect').value = p;
  $('enemyHeroSelect').value = e;
  $('allyHeroSelect').value = a;
  $('startGameBtn').click();
  $('exitConfirmModal').hidden = true;
  return shape3p(UI.getGame());
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── U1: 模式切换不污染 1v1 随机身份 ─────

test('U1: 点 identity3 再点回 1v1 → 恢复随机身份 (不永久粘滞主公/反贼)', () => {
  // 多次采样: 反复 进 setup→切 identity3→切回 duel, 统计我方主公占比。
  // 修复前恒为 100% (被 identity3 强制值粘滞); 修复后应回到 ~随机。
  let lordCount = 0;
  const N = 60;
  for (let i = 0; i < N; i += 1) {
    $('lobby1v1Btn').click();     // showSetup → assignRandomRoles
    $('modeIdentity3Btn').click();
    $('modeDuelBtn').click();     // 切回 duel → 必须恢复随机
    if ($('playerRoleBadge').textContent.indexOf('主公') >= 0) lordCount += 1;
  }
  assert.ok(lordCount > 5 && lordCount < N - 5, `切回 1v1 身份应随机, 实测 ${lordCount}/${N} (修复前恒 ${N}/${N})`);
  // 且实际开局的 game.roles 也随机 (非仅徽章文案)
  $('lobby1v1Btn').click();
  $('modeIdentity3Btn').click();
  $('modeDuelBtn').click();
  $('playerHeroSelect').value = 'liubei';
  $('enemyHeroSelect').value = 'caocao';
  $('startGameBtn').click();
  assert.equal(UI.getGame().mode, 'duel', '切回 duel 后开局是 1v1');
});

// ───── U2: 座席点选切换到技能 → 清理, 不静默出牌 ─────

test('U2: 座席点选中途改点技能按钮 → 点选清理, 点英雄卡不出旧牌', () => {
  const game = start3p('diaochan', 'caocao', 'zhangfei');
  game.player.hand = [c('sha', { id: 'sha1' }), c('sha', { id: 'cost1' })];
  UI.render();
  $('playerHand').dispatchClick({ 'data-card-id': 'sha1' });
  $('handConfirmBtn').click();
  assert.equal($('seatTargetModePanel').hidden, false, '进入座席点选');
  $('playerSkillBar').dispatchClick({ 'data-skill-id': 'lijian' });
  assert.equal($('seatTargetModePanel').hidden, true, '切技能后座席点选面板关闭');
  const enemyHp = game.enemy.hp;
  $('enemyHero').click();
  assert.equal(game.enemy.hp, enemyHp, '点英雄不再静默出旧杀');
  assert.equal(game.player.hand.length, 2, '手牌未被静默消耗');
});

// ───── U3: 借刀两段点选 (持刀者 → 受害者) ─────

test('U3: 借刀 — 持刀者可达多个受害者 → 第二段点选受害者', () => {
  const game = start3p('liubei', 'caocao', 'machao');
  // ally 持无距离限制武器 (可达 enemy 和 player 两名) → 两名受害者候选
  game.ally.equipment.weapon = c('zhangba', { id: 'ally-w' }); // range 3, 3p 环距离≤2 → 都可达
  game.player.hand = [c('jiedao', { id: 'jd1' })];
  UI.render();
  const legal = Engine.legalTargetsForCard(game, 'player', game.player.hand[0]);
  assert.ok(legal.indexOf('ally') >= 0, 'ally 是合法持刀者');
  $('playerHand').dispatchClick({ 'data-card-id': 'jd1' });
  $('handConfirmBtn').click();
  assert.equal($('seatTargetModePanel').hidden, false, '第一段: 选持刀者');
  $('allyHero').click(); // 选 ally 作持刀者 An (v13 J0-1: 暂存)
  $('seatTargetConfirmBtn').click();
  // ally 可达 enemy + player → 进入第二段选受害者 (面板仍开)
  assert.equal($('seatTargetModePanel').hidden, false, '第二段: 选受害者 Bn');
  $('enemyHero').click(); // 让 ally 攻击 enemy (暂存)
  $('seatTargetConfirmBtn').click();
  assert.ok(!game.log.some((l) => l.includes('无效')), '无"无效受害目标"报错 (UI 高亮的目标可提交成功)');
});

test('U3: 借刀 — 持刀者仅一名可达受害者 → 自动完成不报错', () => {
  const game = start3p('liubei', 'caocao', 'machao');
  game.ally.equipment.weapon = c('zhuge', { id: 'ally-w2' }); // range 1
  game.player.equipment.horsePlus = c('plus_horse', { id: 'p-horse' }); // 玩家出 ally 射程
  game.player.hand = [c('jiedao', { id: 'jd2' })];
  UI.render();
  $('playerHand').dispatchClick({ 'data-card-id': 'jd2' });
  $('handConfirmBtn').click();
  $('allyHero').click(); // v13 J0-1: 暂存
  $('seatTargetConfirmBtn').click(); // ally 只能打 enemy (玩家出射程) → 自动选 enemy
  assert.ok(!game.log.some((l) => l.includes('无效受害')), '受害者自动落在合法的 enemy, 不报错');
});

// ───── U4: 黄天玩家按钮 — v13 L1 随可选身份回归 (原"永不出现"守护改正向) ─────

test('U4: 黄天按钮 — 玩家主公时不出现; 玩家忠臣(群) + AI 主公张角时出现 (v13 L1)', () => {
  const game = start3p('machao', 'caocao', 'zhangjiao'); // ally 张角(持黄天), player 群势力马超
  game.player.hand = [c('shan', { id: 'give-shan' })];
  UI.render();
  assert.equal(game.roles.player, '主公', '缺省预设: 玩家主公');
  assert.ok($('playerSkillBar').innerHTML.indexOf('data-skill-id="huangtian"') < 0,
    '玩家为主公 → 无黄天按钮 (自己就是主公, 无给牌方语义)');
  // v13 L1 可选身份: 玩家轮转为忠臣, AI 张角为主公 → 按钮可达。
  game.roles = { player: '忠臣', enemy: '反贼', ally: '主公' };
  UI.render();
  assert.ok($('playerSkillBar').innerHTML.indexOf('data-skill-id="huangtian"') >= 0,
    '玩家群势力忠臣 + AI 主公张角 → 黄天·交牌按钮出现');
});

// ───── U5: 铁索 identity3 可选第三席 ─────

test('U5: identity3 铁索 → 座席点选可选第三席横置', () => {
  const game = start3p('diaochan', 'caocao', 'zhangfei');
  game.player.hand = [c('tiesuo', { id: 'ts1' })];
  UI.render();
  $('playerHand').dispatchClick({ 'data-card-id': 'ts1' });
  $('handConfirmBtn').click();
  assert.equal($('seatTargetModePanel').hidden, false, '铁索进座席点选 (非旧 tiesuoModePanel)');
  $('allyHero').click();          // 选第三席
  $('seatTargetConfirmBtn').click(); // 确定 (仅 1 目标)
  assert.equal(game.ally.chained, true, '第三席 ally 被横置');
});

test('U5: identity3 铁索 → 可选 2 名目标 (v13 J0-1: 点满仍需确认)', () => {
  const game = start3p('diaochan', 'caocao', 'zhangfei');
  game.player.hand = [c('tiesuo', { id: 'ts2' })];
  UI.render();
  $('playerHand').dispatchClick({ 'data-card-id': 'ts2' });
  $('handConfirmBtn').click();
  $('enemyHero').click();
  $('allyHero').click();
  assert.equal($('seatTargetModePanel').hidden, false, 'v13 J0-1: 点满 2 目标仍等确认');
  assert.ok(!game.enemy.chained, '确认前未结算');
  $('seatTargetConfirmBtn').click();
  assert.equal(game.enemy.chained, true, 'enemy 横置');
  assert.equal(game.ally.chained, true, 'ally 横置');
  assert.equal($('seatTargetModePanel').hidden, true, '确认后面板关闭');
});

test('U5: identity3 铁索 → "重铸"附加按钮弃牌摸牌', () => {
  const game = start3p('diaochan', 'caocao', 'zhangfei');
  game.deck = [];
  for (let i = 0; i < 5; i += 1) game.deck.push(c('shan', { id: `dk-${i}`, suit: 'diamond' }));
  game.player.hand = [c('tiesuo', { id: 'ts3' })];
  UI.render();
  const handBefore = game.player.hand.length;
  $('playerHand').dispatchClick({ 'data-card-id': 'ts3' });
  $('handConfirmBtn').click();
  assert.equal($('seatTargetExtraBtn').hidden, false, '重铸附加按钮显示');
  // v13 UI修缮1: 点"重铸"仅暂存, 须按座席面板"确定"执行。
  $('seatTargetExtraBtn').click();
  assert.ok(game.player.hand.some((card) => card.id === 'ts3'), '点重铸仅暂存, 铁索未弃');
  $('seatTargetConfirmBtn').click();
  assert.equal(game.player.hand.length, handBefore, '重铸: 弃铁索 + 摸 1 张 (净手牌不变)');
  assert.ok(game.log.some((l) => l.includes('重铸')), '日志记录重铸');
});

test('U5 对照: 1v1 铁索仍走旧 tiesuoModePanel (零回归)', () => {
  $('lobby1v1Btn').click();
  $('modeDuelBtn').click();
  $('playerHeroSelect').value = 'liubei';
  $('enemyHeroSelect').value = 'caocao';
  $('startGameBtn').click();
  for (let retry = 0; UI.getGame().turn !== 'player' && retry < 40; retry += 1) {
    $('lobby1v1Btn').click(); $('modeDuelBtn').click();
    $('playerHeroSelect').value = 'liubei'; $('enemyHeroSelect').value = 'caocao';
    $('startGameBtn').click();
  }
  $('exitConfirmModal').hidden = true;
  const game = UI.getGame();
  game.turn = 'player'; game.phase = 'play';
  game.player.hand = [c('tiesuo', { id: 'ts-1v1' })];
  UI.render();
  $('playerHand').dispatchClick({ 'data-card-id': 'ts-1v1' });
  $('handConfirmBtn').click();
  assert.equal($('tiesuoModePanel').hidden, false, '1v1: 旧铁索面板 (enemy/self/both/重铸)');
  assert.equal($('seatTargetModePanel').hidden, true, '1v1: 不进座席点选');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
