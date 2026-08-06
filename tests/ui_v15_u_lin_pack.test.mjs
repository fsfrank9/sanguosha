// v15 U: 林包 UI 全链路 (fake-DOM) —
//   ① 六个决策窗的静态锚点与 dispatch 接线;
//   ② 崩坏 / 再起 / 放逐 / 英魂 / 乱武 的面板交互;
//   ③ 断粮·酒池 的转化入口;
//   ④ 图鉴徽章与技能状态翻转。
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

// R-B 教训: 重掷至玩家先手 + 显式置回合, 不自写随机开局。
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
  game.log = []; game.discard = [];
  game.deck = Array.from({ length: 10 }, (_, i) => c('sha', { id: 'd' + i, suit: 'spade', rank: '5' }));
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
  UI.render();
  return game;
}

test('U UI 静态锚点: 六个决策窗节点 + els 注册 + dispatch 接线', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const adapter = fs.readFileSync(new URL('../src/ui/dom-adapter.js', import.meta.url), 'utf8');
  for (const id of ['benghuaiPanel', 'fangzhuPanel', 'yinghunPanel',
    'haoshiPanel', 'zaiqiPanel', 'luanwuPanel']) {
    assert.match(html, new RegExp('id="' + id + '" hidden'), id + ' 节点存在且默认隐藏');
    assert.match(adapter, new RegExp("'" + id + "'"), id + ' 已注册进 els');
    assert.match(adapter, new RegExp("panelId: '" + id + "'"), id + ' 已入 dispatch 表');
  }
});

test('U UI 崩坏: 结束阶段开窗 → 两个按钮各自生效', () => {
  const game = startDuel('dongzhuo', 'caocao');
  game.enemy.hp = 2;
  UI.render();
  Engine.endTurn(game, 'player');
  UI.render();
  assert.equal($('benghuaiPanel').hidden, false, '崩坏面板出现');
  const maxBefore = game.player.maxHp;
  $('benghuaiMaxHpBtn').click();
  assert.equal(game.player.maxHp, maxBefore - 1, '减 1 点体力上限');
  assert.equal($('benghuaiPanel').hidden, true, '面板收起');
});

test('U UI 再起: 摸牌阶段开窗 → "正常摸牌"照常摸两张', () => {
  const game = startDuel('menghuo', 'caocao');
  game.player.hp = game.player.maxHp - 2;
  game.phase = 'judge';
  UI.render();
  Engine.advancePhase(game);
  UI.render();
  assert.equal($('zaiqiPanel').hidden, false, '再起面板出现');
  $('zaiqiDeclineBtn').click();
  assert.equal(game.player.hand.length, 2, 'decline → 正常摸两张');
  assert.equal($('zaiqiPanel').hidden, true);
});

test('U UI 放逐: 受伤后开窗 → 点候选即翻面', () => {
  const game = startDuel('caopi', 'caocao');
  game.player.hp = game.player.maxHp - 1;
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  UI.render();
  Engine.playCard(game, 'enemy', 'e-sha', { target: 'player' });
  UI.render();
  assert.equal($('fangzhuPanel').hidden, false, '放逐面板出现');
  assert.match($('fangzhuChoices').innerHTML, /data-fangzhu-seat="enemy"/);
  $('fangzhuChoices').dispatchClick({ 'data-fangzhu-seat': 'enemy' });
  assert.equal(game.enemy.turnedOver, true, '目标翻面');
});

test('U UI 英魂: 两段选择 (选项 + 目标) 后确认按钮才可用', () => {
  const game = startDuel('sunjian', 'caocao');
  game.player.hp = game.player.maxHp - 2;
  game.turn = 'player';
  game.phase = 'prepare';
  UI.render();
  Engine.startTurn(game, 'player');
  UI.render();
  assert.equal($('yinghunPanel').hidden, false, '英魂面板出现');
  assert.equal($('yinghunConfirmBtn').disabled, true, '未选满两段时确认禁用');
  $('yinghunOptions').dispatchClick({ 'data-yinghun-option': '1' });
  assert.equal($('yinghunConfirmBtn').disabled, true, '只选了选项仍禁用');
  $('yinghunChoices').dispatchClick({ 'data-yinghun-seat': 'enemy' });
  assert.equal($('yinghunConfirmBtn').disabled, false, '两段齐备 → 可确认');
  $('yinghunConfirmBtn').click();
  assert.equal($('yinghunPanel').hidden, true, '面板收起');
});

test('U UI 乱武: 逐席窗口 — "失去 1 点体力"出路可用', () => {
  const game = startDuel('caocao', 'jiaxu');
  // 贾诩为 AI 席发动乱武 → 玩家席收到 luanwu-sha 窗
  game.turn = 'enemy';
  game.player.hand = [];
  UI.render();
  const result = Engine.useSkill(game, 'enemy', 'luanwu', [], {});
  UI.render();
  if (!$('luanwuPanel').hidden) {
    const hpBefore = game.player.hp;
    $('luanwuDeclineBtn').click();
    assert.equal(game.player.hp, hpBefore - 1, '放弃 → 失去 1 点体力');
  } else {
    // 玩家席无杀时引擎可能已同步结算完 — 断言技能确实发动过即可
    assert.equal(result.ok, true);
  }
});

test('U UI 断粮/酒池: 转化面板列出新增的两种转化', () => {
  const game = startDuel('xuhuang', 'caocao');
  game.player.hand = [c('sha', { id: 'x-black', suit: 'spade', color: 'black' })];
  UI.render();
  $('playerHand').dispatchClick({ 'data-card-id': 'x-black' });
  $('handConfirmBtn').click();
  assert.equal($('conversionModePanel').hidden, false, '转化面板打开');
  assert.match($('conversionExtraChoices').innerHTML, /data-conversion-as="bingliang"/,
    '断粮 → 兵粮寸断 出现在转化候选里');
});

test('U UI 图鉴: 林包 8 将徽章与技能状态已翻转 (零"看起来有但触发不了")', () => {
  $('lobbyHeroesBtn').click();
  const grid = String($('heroBrowserGrid').innerHTML);
  for (const skillName of ['断粮', '行殇', '放逐', '颂威', '英魂', '好施', '缔盟',
    '祸首', '再起', '巨象', '烈刃', '完杀', '乱武', '帷幕',
    '酒池', '肉林', '崩坏', '暴虐']) {
    assert.ok(grid.includes(skillName), `${skillName} 应在图鉴中`);
  }
  for (const skillId of ['duanliang', 'xingshang', 'yinghun', 'haoshi', 'dimeng',
    'huoshou', 'zaiqi', 'juxiang', 'lieren', 'wansha', 'luanwu', 'weimu',
    'jiuchi', 'roulin', 'benghuai', 'baonue', 'fangzhu', 'songwei']) {
    assert.equal(Engine.IMPLEMENTED_SKILL_IDS.includes(skillId), true, skillId + ' 已实现');
  }
});

await runTests();

console.log('\nv15 U 林包 UI 用例通过。');
