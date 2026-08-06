// v15 V: 山包 UI 全链路 (fake-DOM) —
//   ① 四个决策窗的静态锚点与 dispatch 接线;
//   ② 挑衅 / 志继 / 放权 / 享乐 的面板交互;
//   ③ 急袭 ("田" → 顺手牵羊) 的转化入口;
//   ④ 图鉴徽章与技能状态翻转 (巧变已实现 / 化身仍未实现)。
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
  game.deck = Array.from({ length: 12 }, (_, i) => c('sha', { id: 'd' + i, suit: 'spade', rank: '5' }));
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = []; game[actor].judgeArea = []; game[actor].flags = {};
    game[actor].tian = [];
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp;
  }
  game.turn = 'player';
  game.phase = 'play';
  game.pendingChoice = null;
  game.pendingChoiceQueue = [];
  game.pauseState = {};
  game.pendingExtraTurns = [];
  UI.render();
  return game;
}

test('V UI 静态锚点: 四个决策窗节点 + els 注册 + dispatch 接线', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const adapter = fs.readFileSync(new URL('../src/ui/dom-adapter.js', import.meta.url), 'utf8');
  for (const id of ['tiaoxinPanel', 'zhijiPanel', 'fangquanPanel', 'xianglePanel']) {
    assert.match(html, new RegExp('id="' + id + '" hidden'), id + ' 节点存在且默认隐藏');
    assert.match(adapter, new RegExp("'" + id + "'"), id + ' 已注册进 els');
    assert.match(adapter, new RegExp("panelId: '" + id + "'"), id + ' 已入 dispatch 表');
  }
});

test('V UI 挑衅: 敌方姜维挑衅玩家 → 面板列出可用【杀】, 点牌即出杀', () => {
  const game = startDuel('caocao', 'jiangwei');
  game.turn = 'enemy'; game.phase = 'play';
  game.player.hand = [c('sha', { id: 'ui-tx-sha' }), c('tao', { id: 'ui-tx-tao' })];
  Engine.useSkill(game, 'enemy', 'tiaoxin', { target: 'player' });
  UI.render();
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'tiaoxin-demand');
  assert.equal($('tiaoxinPanel').hidden, false, '挑衅面板弹出');
  assert.match(String($('tiaoxinChoices').innerHTML), /data-tiaoxin-card-id="ui-tx-sha"/, '列出可用的杀');
  assert.doesNotMatch(String($('tiaoxinChoices').innerHTML), /ui-tx-tao/, '桃不是【杀】, 不列出');
  $('tiaoxinChoices').dispatchClick({ 'data-tiaoxin-card-id': 'ui-tx-sha' });
  assert.equal(game.player.hand.length, 1, '杀已被使用');
  assert.equal(game.player.hand[0].id, 'ui-tx-tao', '桃保留');
  assert.equal($('tiaoxinPanel').hidden, true, '窗口关闭');
});

test('V UI 挑衅: 点"不使用【杀】" → 被弃一张牌', () => {
  const game = startDuel('caocao', 'jiangwei');
  game.turn = 'enemy'; game.phase = 'play';
  game.player.hand = [c('sha', { id: 'ui-tx2-sha' })];
  Engine.useSkill(game, 'enemy', 'tiaoxin', { target: 'player' });
  UI.render();
  $('tiaoxinDeclineBtn').click();
  assert.equal(game.player.hand.length, 0, '被弃了唯一那张牌');
  assert.equal($('tiaoxinPanel').hidden, true);
});

test('V UI 志继: 觉醒开窗 → 两个按钮分别走回血/摸牌', () => {
  const game = startDuel('jiangwei', 'caocao');
  game.player.hand = [];
  game.player.hp = game.player.maxHp - 2;
  const hp = game.player.hp;
  Engine.startTurn(game, 'player');
  UI.render();
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'zhiji-choice');
  assert.equal($('zhijiPanel').hidden, false, '志继面板弹出');
  $('zhijiHealBtn').click();
  assert.equal(game.player.hp, hp + 1, '回复 1 点体力');
  assert.equal($('zhijiPanel').hidden, true);

  const game2 = startDuel('jiangwei', 'caocao');
  game2.player.hand = [];
  Engine.startTurn(game2, 'player');
  UI.render();
  $('zhijiDrawBtn').click();
  assert.ok(game2.player.hand.length >= 2, '摸两张牌');
});

test('V UI 放权: 两段选择 (弃牌 + 目标) 才放行确认', () => {
  const game = startDuel('liushan', 'caocao');
  game.player.hand = [c('sha', { id: 'ui-fq-cost' })];
  game.player.skillPreferences = game.player.skillPreferences || {};
  game.player.flags.fangquanSkipped = true;
  game.turn = 'player'; game.phase = 'finish';
  Engine.advancePhase(game);
  UI.render();
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'fangquan-grant');
  assert.equal($('fangquanPanel').hidden, false, '放权面板弹出');
  assert.equal($('fangquanConfirmBtn').disabled, true, '两段都没选 → 确认不可用');
  $('fangquanCards').dispatchClick({ 'data-fangquan-card-id': 'ui-fq-cost' });
  assert.equal($('fangquanConfirmBtn').disabled, true, '只选了牌 → 仍不可用');
  $('fangquanChoices').dispatchClick({ 'data-fangquan-seat': 'enemy' });
  assert.equal($('fangquanConfirmBtn').disabled, false, '牌 + 目标齐 → 放行');
  $('fangquanConfirmBtn').click();
  assert.equal($('fangquanPanel').hidden, true, '窗口关闭');
});

test('V UI 放权: 点"不发动" → 不弃牌也不派发额外回合', () => {
  const game = startDuel('liushan', 'caocao');
  game.player.hand = [c('sha', { id: 'ui-fq2-cost' })];
  game.player.flags.fangquanSkipped = true;
  game.turn = 'player'; game.phase = 'finish';
  Engine.advancePhase(game);
  UI.render();
  $('fangquanDeclineBtn').click();
  assert.equal($('fangquanPanel').hidden, true);
  assert.ok(!(game.pendingExtraTurns || []).length, '没有排队额外回合');
});

test('V UI 享乐: 玩家对刘禅出杀 → 弃基本牌面板; 点牌放行, 不弃则杀无效', () => {
  const game = startDuel('caocao', 'liushan');
  game.player.hand = [c('sha', { id: 'ui-xl-sha' }), c('tao', { id: 'ui-xl-basic' })];
  Engine.playCard(game, 'player', 'ui-xl-sha', { target: 'enemy' });
  UI.render();
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'xiangle-cost');
  assert.equal($('xianglePanel').hidden, false, '享乐面板弹出');
  assert.match(String($('xiangleChoices').innerHTML), /data-xiangle-card-id="ui-xl-basic"/, '列出基本牌');
  const hp = game.enemy.hp;
  $('xiangleChoices').dispatchClick({ 'data-xiangle-card-id': 'ui-xl-basic' });
  assert.equal(game.enemy.hp, hp - 1, '弃基本牌 → 杀命中');
  assert.equal($('xianglePanel').hidden, true);

  const game2 = startDuel('caocao', 'liushan');
  game2.player.hand = [c('sha', { id: 'ui-xl2-sha' }), c('tao', { id: 'ui-xl2-basic' })];
  Engine.playCard(game2, 'player', 'ui-xl2-sha', { target: 'enemy' });
  UI.render();
  const hp2 = game2.enemy.hp;
  $('xiangleDeclineBtn').click();
  assert.equal(game2.enemy.hp, hp2, '不弃 → 此杀无效');
  assert.equal(game2.player.hand.length, 1, '基本牌保留');
});

test('V UI 急袭: "田"进入转化菜单当【顺手牵羊】, 手牌不进', () => {
  const game = startDuel('dengai', 'caocao');
  game.player.skills.push({ id: 'jixi', name: '急袭' });
  game.player.tian = [c('sha', { id: 'ui-jx-tian', suit: 'club' })];
  game.player.hand = [c('sha', { id: 'ui-jx-hand', suit: 'club' })];
  game.enemy.hand = [c('tao', { id: 'ui-jx-loot' })]; // 顺手牵羊需要对方有牌可拿
  const conversions = Engine.listCardConversions(game, 'player', 'ui-jx-tian');
  assert.ok(conversions.some((entry) => entry.asType === 'shunshou'), '"田"可转顺手牵羊');
  const handConversions = Engine.listCardConversions(game, 'player', 'ui-jx-hand');
  assert.ok(!handConversions.some((entry) => entry.asType === 'shunshou'), '手牌不可转');
});

test('V UI 图鉴: 山包 7 将标已实现, 左慈化身仍标未实现', () => {
  $('lobbyHeroesBtn').click();
  const grid = String($('heroBrowserGrid').innerHTML);
  const cardOf = (heroId) => {
    const start = grid.indexOf('data-hero-id="' + heroId + '"');
    const end = grid.indexOf('</article>', start);
    return grid.slice(start, end);
  };
  const samples = [
    ['zhanghe', '巧变'], ['dengai', '屯田'], ['jiangwei', '挑衅'],
    ['liushan', '享乐'], ['sunce', '激昂'], ['erzhang', '直谏'], ['caiwenji', '悲歌'],
  ];
  for (const [heroId, skillName] of samples) {
    assert.ok(new RegExp(skillName + '[\\s\\S]{0,80}is-done').test(cardOf(heroId)),
      heroId + ' ' + skillName + ' 标已实现');
  }
  assert.ok(/化身[\s\S]{0,80}is-pending/.test(cardOf('zuoci')), '左慈化身仍标未实现');
  assert.ok(/新生[\s\S]{0,80}is-pending/.test(cardOf('zuoci')), '左慈新生仍标未实现');
  $('heroBrowserBackBtn').click();
});

test('V UI 图鉴: 挑衅/直谏/制霸 带主动技徽章', () => {
  $('lobbyHeroesBtn').click();
  const grid = String($('heroBrowserGrid').innerHTML);
  const cardOf = (heroId) => {
    const start = grid.indexOf('data-hero-id="' + heroId + '"');
    const end = grid.indexOf('</article>', start);
    return grid.slice(start, end);
  };
  assert.ok(/挑衅[\s\S]{0,120}is-active-skill/.test(cardOf('jiangwei')), '挑衅带主动标');
  assert.ok(/直谏[\s\S]{0,120}is-active-skill/.test(cardOf('erzhang')), '直谏带主动标');
  assert.ok(/制霸[\s\S]{0,120}is-active-skill/.test(cardOf('sunce')), '制霸带主动标');
  $('heroBrowserBackBtn').click();
});

runTests(import.meta.url);
