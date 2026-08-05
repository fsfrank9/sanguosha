// v15 S: 蛊惑 UI 全链路 (fake-DOM) —
//   S1 响应声明面板: 闪/杀/桃/无懈 窗口内的"选牌名 + 盖置手牌 + 确认",
//     验假后窗口重开且蛊惑入口按限次收起;
//   S2 声明菜单 16/16: 拆/顺/火攻 转座席点选, 借刀两段点选, 铁索 1-2 名。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { test, runTests } from './helpers/harness.mjs';
import { c } from './helpers/load-engine.mjs';

const dom = installFakeDom();
const { Engine } = await import('./helpers/load-engine.mjs');
await import('../src/ui/dom-adapter.js');

const UI = globalThis.window.SanguoshaUI;
const $ = dom.$;

// R-B 教训: 随机身份令敌方主公先手时 enemyThinking 挂起点击 → 重掷至
// 玩家先手 (ui-game.mjs 惯例), 并显式置回合。
function startDuel(playerHero, enemyHero) {
  $('lobby1v1Btn').click();
  $('playerHeroSelect').value = playerHero;
  $('enemyHeroSelect').value = enemyHero;
  $('startGameBtn').click();
  for (let retry = 0; UI.getGame().turn !== 'player' && retry < 40; retry += 1) {
    $('lobby1v1Btn').click();
    $('playerHeroSelect').value = playerHero;
    $('enemyHeroSelect').value = enemyHero;
    $('startGameBtn').click();
  }
  $('exitConfirmModal').hidden = true;
  const game = UI.getGame();
  game.log = []; game.discard = []; game.deck = [];
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = []; game[actor].judgeArea = []; game[actor].flags = {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp;
  }
  game.turn = 'player';
  game.phase = 'play';
  game.pendingChoice = null;
  game.pendingChoiceQueue = [];
  game.pauseState = {};
  return game;
}

test('S1 UI 静态锚点: 响应声明面板节点 + els 注册', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="guhuoResponsePanel" hidden/);
  assert.match(html, /id="guhuoResponseTypes"/);
  assert.match(html, /id="guhuoResponseCovers"/);
  assert.match(html, /id="guhuoResponseConfirmBtn"/);
  const adapter = fs.readFileSync(new URL('../src/ui/dom-adapter.js', import.meta.url), 'utf8');
  assert.match(adapter, /'guhuoResponsePanel'/);
  // 蛊惑响应面板刻意不进 PENDING_MODAL_DISPATCH: hand-confirm 快捷键留给
  // 所在响应窗口的主确认 (打出真牌), 蛊惑走面板内自己的确认按钮。
  assert.ok(!/panelId: 'guhuoResponsePanel'/.test(adapter),
    '不抢所在响应窗口的 hand-confirm 路由');
});

test('S1 UI 闪响应窗: 无闪也弹蛊惑面板 → 选牌名+盖置牌确认 → 打出流程闪避', () => {
  const game = startDuel('yuji', 'caocao');
  game.turn = 'enemy';
  game.player.hand = [c('shan', { id: 'ui-true-shan' })];
  game.enemy.hand = [c('sha', { id: 'ui-e-sha' })];
  Engine.playCard(game, 'enemy', 'ui-e-sha', { target: 'player' });
  UI.render();
  assert.equal($('shanResponsePanel').hidden, false, '闪响应窗口');
  assert.equal($('guhuoResponsePanel').hidden, false, '蛊惑声明面板并列出现');
  assert.match($('guhuoResponseTypes').innerHTML, /data-guhuo-resp-type="shan"/, '只提供闪');
  assert.match($('guhuoResponseCovers').innerHTML, /data-guhuo-resp-cover="ui-true-shan"/);
  assert.equal($('guhuoResponseConfirmBtn').disabled, true, '未选齐前禁用');
  $('guhuoResponseTypes').dispatchClick({ 'data-guhuo-resp-type': 'shan' });
  assert.equal($('guhuoResponseConfirmBtn').disabled, true, '仅选牌名仍禁用');
  $('guhuoResponseCovers').dispatchClick({ 'data-guhuo-resp-cover': 'ui-true-shan' });
  assert.equal($('guhuoResponseConfirmBtn').disabled, false, '选齐可确认');
  $('guhuoResponseConfirmBtn').click();
  assert.equal(game.player.hp, game.player.maxHp, '打出流程闪避成功');
  assert.equal($('guhuoResponsePanel').hidden, true, '窗口关闭后面板收起');
});

test('S1 UI 验假重开: 面板随窗口重开但蛊惑入口按限次收起', () => {
  const game = startDuel('yuji', 'caocao');
  game.turn = 'enemy';
  game.player.hand = [c('sha', { id: 'ui-fake-cover' }), c('shan', { id: 'ui-backup-shan' })];
  game.enemy.hand = [c('sha', { id: 'ui-e-sha2' })];
  Engine.playCard(game, 'enemy', 'ui-e-sha2', { target: 'player' });
  UI.render();
  $('guhuoResponseTypes').dispatchClick({ 'data-guhuo-resp-type': 'shan' });
  $('guhuoResponseCovers').dispatchClick({ 'data-guhuo-resp-cover': 'ui-fake-cover' });
  $('guhuoResponseConfirmBtn').click();
  assert.equal($('shanResponsePanel').hidden, false, '验假 → 闪窗原样重开');
  assert.equal($('guhuoResponsePanel').hidden, true, '本回合限次已用 → 蛊惑入口收起');
  assert.match($('shanResponseChoices').innerHTML, /data-shan-card-id="ui-backup-shan"/,
    '重开窗内仍可打出真闪');
});

test('S1 UI 濒死窗: 蛊惑面板提供 桃/酒 (自己濒死), 声明后脱离濒死', () => {
  const game = startDuel('yuji', 'caocao');
  game.turn = 'enemy';
  game.player.hp = 1;
  game.player.hand = [c('tao', { id: 'ui-true-tao', suit: 'heart', color: 'red' })];
  game.enemy.hand = [c('sha', { id: 'ui-kill' })];
  Engine.playCard(game, 'enemy', 'ui-kill', { target: 'player' });
  UI.render();
  $('shanResponseDeclineBtn').click(); // 不出闪 → 濒死
  UI.render();
  assert.equal($('dyingRescuePanel').hidden, false, '濒死救援窗');
  assert.equal($('guhuoResponsePanel').hidden, false, '蛊惑声明面板并列出现');
  assert.match($('guhuoResponseTypes').innerHTML, /data-guhuo-resp-type="tao"/);
  assert.match($('guhuoResponseTypes').innerHTML, /data-guhuo-resp-type="jiu"/);
  $('guhuoResponseTypes').dispatchClick({ 'data-guhuo-resp-type': 'tao' });
  $('guhuoResponseCovers').dispatchClick({ 'data-guhuo-resp-cover': 'ui-true-tao' });
  $('guhuoResponseConfirmBtn').click();
  assert.equal(game.player.hp, 1, '声明桃救回 1 点体力');
});

test('S1 UI: 非于吉席位的响应窗口不出现蛊惑面板', () => {
  const game = startDuel('caocao', 'liubei');
  game.turn = 'enemy';
  game.player.hand = [c('shan', { id: 'nx-shan' })];
  game.enemy.hand = [c('sha', { id: 'nx-sha' })];
  Engine.playCard(game, 'enemy', 'nx-sha', { target: 'player' });
  UI.render();
  assert.equal($('shanResponsePanel').hidden, false);
  assert.equal($('guhuoResponsePanel').hidden, true, '无蛊惑技能 → 无声明面板');
});

// ───── S2: 声明菜单 16/16 ─────

test('S2 UI 声明菜单 16/16: 出牌阶段面板覆盖引擎全部可声明牌名', () => {
  const game = startDuel('yuji', 'caocao');
  game.player.hand = [c('shan', { id: 'menu-cover' })];
  UI.render();
  $('playerSkillBar').dispatchClick({ 'data-skill-id': 'guhuo' });
  const menu = $('guhuoTypeChoices').innerHTML;
  const expected = ['sha', 'fire_sha', 'thunder_sha', 'tao', 'jiu', 'wuzhong', 'juedou',
    'nanman', 'wanjian', 'taoyuan', 'wugu', 'guohe', 'shunshou', 'huogong', 'jiedao', 'tiesuo'];
  for (const type of expected) {
    assert.match(menu, new RegExp('data-guhuo-type="' + type + '"'), type + ' 应在菜单内');
  }
  assert.equal((menu.match(/data-guhuo-type=/g) || []).length, 16, '恰好 16 型');
});

test('S2 UI 声明 顺手牵羊: 确认后转座席点选 → 完成声明 (区域/具体牌留结算期)', () => {
  const game = startDuel('yuji', 'caocao');
  game.player.hand = [c('shan', { id: 'ss-cover' })];
  game.enemy.hand = [c('sha', { id: 'ss-loot' })];
  game.enemy.hp = 2; // 压低 AI 质疑面 (护财面仍在 → 用于验证结算真的发生)
  UI.render();
  $('playerSkillBar').dispatchClick({ 'data-skill-id': 'guhuo' });
  $('guhuoTypeChoices').dispatchClick({ 'data-guhuo-type': 'shunshou' });
  $('guhuoCoverChoices').dispatchClick({ 'data-guhuo-cover': 'ss-cover' });
  $('guhuoConfirmBtn').click();
  assert.equal($('guhuoDeclarePanel').hidden, true, '转入座席点选');
  assert.equal($('seatTargetModePanel').hidden, false, '座席点选面板打开');
  $('enemyHero').click();
  $('seatTargetConfirmBtn').click();
  assert.equal(game.player.flags.guhuoUsedThisTurn, true, '声明已发动');
  assert.ok(game.log.some((line) => /背面朝上使用【顺手牵羊】/.test(line)));
});

test('S2 UI 声明 铁索连环: 1-2 名座席点选 (使用分支, 无重铸入口)', () => {
  const game = startDuel('yuji', 'caocao');
  game.player.hand = [c('shan', { id: 'ts-cover' })];
  game.enemy.hp = 2;
  UI.render();
  $('playerSkillBar').dispatchClick({ 'data-skill-id': 'guhuo' });
  $('guhuoTypeChoices').dispatchClick({ 'data-guhuo-type': 'tiesuo' });
  $('guhuoCoverChoices').dispatchClick({ 'data-guhuo-cover': 'ts-cover' });
  $('guhuoConfirmBtn').click();
  assert.equal($('seatTargetModePanel').hidden, false, '座席点选 (1-2 名)');
  $('enemyHero').click();
  $('seatTargetConfirmBtn').click();
  assert.equal(game.player.flags.guhuoUsedThisTurn, true);
  assert.ok(game.log.some((line) => /背面朝上使用【铁索连环】/.test(line)));
});

test('S2 UI 声明 借刀杀人 (1v1): 受害者候选唯一 → 直接成局 (同既有借刀出牌流)', () => {
  const game = startDuel('yuji', 'caocao');
  game.player.hand = [c('shan', { id: 'jd-cover' })];
  game.enemy.equipment.weapon = c('qinggang', { id: 'jd-weapon' });
  game.enemy.hp = 2;
  UI.render();
  $('playerSkillBar').dispatchClick({ 'data-skill-id': 'guhuo' });
  $('guhuoTypeChoices').dispatchClick({ 'data-guhuo-type': 'jiedao' });
  $('guhuoCoverChoices').dispatchClick({ 'data-guhuo-cover': 'jd-cover' });
  $('guhuoConfirmBtn').click();
  assert.equal($('seatTargetModePanel').hidden, false, '第一段: 选持刀者');
  $('enemyHero').click();
  $('seatTargetConfirmBtn').click();
  assert.equal(game.player.flags.guhuoUsedThisTurn, true, '受害者唯一 → 直接完成声明');
  assert.ok(game.log.some((line) => /背面朝上使用【借刀杀人】/.test(line)));
});

test('S2 UI 声明 借刀杀人 (3p): 受害者多候选 → 第二段点选', () => {
  $('lobby1v1Btn').click();
  $('modeIdentity3Btn').click();
  $('playerHeroSelect').value = 'yuji';
  $('enemyHeroSelect').value = 'caocao';
  $('allyHeroSelect').value = 'liubei';
  $('startGameBtn').click();
  $('exitConfirmModal').hidden = true;
  const game = UI.getGame();
  game.log = []; game.discard = []; game.deck = [];
  for (const seat of game.seats) {
    game[seat].hand = []; game[seat].judgeArea = []; game[seat].flags = {};
    game[seat].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[seat].hp = game[seat].maxHp;
  }
  game.turn = 'player';
  game.phase = 'play';
  game.pendingChoice = null;
  game.pendingChoiceQueue = [];
  game.pauseState = {};
  game.player.hand = [c('shan', { id: 'jd3-cover' })];
  game.enemy.equipment.weapon = c('zhangba', { id: 'jd3-weapon' }); // 攻击范围 3 → 多候选
  UI.render();
  $('playerSkillBar').dispatchClick({ 'data-skill-id': 'guhuo' });
  $('guhuoTypeChoices').dispatchClick({ 'data-guhuo-type': 'jiedao' });
  $('guhuoCoverChoices').dispatchClick({ 'data-guhuo-cover': 'jd3-cover' });
  $('guhuoConfirmBtn').click();
  assert.equal($('seatTargetModePanel').hidden, false, '第一段: 选持刀者');
  $('enemyHero').click();
  $('seatTargetConfirmBtn').click();
  assert.equal($('seatTargetModePanel').hidden, false, '第二段: 选受害者');
  $('allyHero').click();
  $('seatTargetConfirmBtn').click();
  assert.equal(game.player.flags.guhuoUsedThisTurn, true, '两段点选完成声明');
  assert.ok(game.log.some((line) => /背面朝上使用【借刀杀人】/.test(line)));
});

await runTests();

console.log('\nv15 S 蛊惑 UI (响应声明面板 + 菜单 16/16) 用例通过。');
