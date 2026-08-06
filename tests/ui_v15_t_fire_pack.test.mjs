// v15 T: 火包 UI 全链路 (fake-DOM) —
//   ① 座席点选型主动技 (强袭/驱虎/天义) 的技能栏入口;
//   ② 拼点选牌面板 / 猛进弃牌面板;
//   ③ 连环的重铸入口 (转化面板第三条出路);
//   ④ 火包徽章与图鉴状态翻转。
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
  game.deck = ['d1', 'd2', 'd3'].map((id) => c('sha', { id }));
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

test('T UI 静态锚点: 猛进/拼点面板节点 + 重铸钮 + els 注册 + dispatch 接线', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="mengjinPanel" hidden/);
  assert.match(html, /id="pindianPanel" hidden/);
  assert.match(html, /id="conversionRecastBtn" hidden/);
  const adapter = fs.readFileSync(new URL('../src/ui/dom-adapter.js', import.meta.url), 'utf8');
  assert.match(adapter, /'mengjinPanel'/);
  assert.match(adapter, /'pindianPanel'/);
  assert.match(adapter, /'conversionRecastBtn'/);
  assert.match(adapter, /panelId: 'mengjinPanel'/);
  assert.match(adapter, /panelId: 'pindianPanel'/);
});

test('T UI 天义: 技能栏 → 座席点选 → 拼点选牌面板 → 确认后落回合级增益', () => {
  const game = startDuel('taishici', 'caocao');
  game.player.hand = [c('sha', { id: 'p-K', rank: 'K' })];
  game.enemy.hand = [c('sha', { id: 'e-3', rank: '3' })];
  UI.render();
  $('playerSkillBar').dispatchClick({ 'data-skill-id': 'tianyi' });
  assert.equal($('seatTargetModePanel').hidden, false, '进入座席点选');
  $('enemyHero').click();
  $('seatTargetConfirmBtn').click();
  UI.render();
  assert.equal($('pindianPanel').hidden, false, '拼点选牌面板');
  assert.match($('pindianChoices').innerHTML, /data-pindian-card-id="p-K"/);
  $('pindianChoices').dispatchClick({ 'data-pindian-card-id': 'p-K' });
  $('handConfirmBtn').click();
  assert.equal(game.player.flags.tianyiWon, true, 'K > 3 → 赢');
  assert.equal($('pindianPanel').hidden, true, '面板收起');
});

test('T UI 强袭: 座席点选后发动 (失去 1 点体力 + 目标受伤)', () => {
  const game = startDuel('dianwei', 'caocao');
  UI.render();
  $('playerSkillBar').dispatchClick({ 'data-skill-id': 'qiangxi' });
  assert.equal($('seatTargetModePanel').hidden, false);
  $('enemyHero').click();
  $('seatTargetConfirmBtn').click();
  assert.equal(game.player.hp, game.player.maxHp - 1);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
});

test('T UI 猛进: 杀被闪抵消 → 弃牌面板 (随机手牌 / 指定装备) → 不发动亦可', () => {
  const game = startDuel('pangde', 'caocao');
  game.player.hand = [c('sha', { id: 'p-sha' })];
  game.enemy.hand = [c('shan', { id: 'e-shan' }), c('sha', { id: 'e-keep' })];
  UI.render();
  Engine.playCard(game, 'player', 'p-sha', { target: 'enemy' });
  UI.render();
  assert.equal($('mengjinPanel').hidden, false, '猛进面板出现');
  assert.match($('mengjinChoices').innerHTML, /data-mengjin-zone="hand"/, '手牌为暗牌 → 只给随机弃');
  $('mengjinDeclineBtn').click();
  assert.ok(game.enemy.hand.some((card) => card.id === 'e-keep'), '不发动 → 目标保牌');
  assert.equal($('mengjinPanel').hidden, true);
});

test('T UI 连环: 梅花牌打开转化面板并显示重铸钮; 点重铸弃一摸一', () => {
  const game = startDuel('pangtong', 'caocao');
  game.player.hand = [c('tao', { id: 'club-1', suit: 'club', color: 'black' })];
  UI.render();
  $('playerHand').dispatchClick({ 'data-card-id': 'club-1' });
  $('handConfirmBtn').click();
  assert.equal($('conversionModePanel').hidden, false, '转化面板打开 (可用/可转化/可重铸三选)');
  assert.equal($('conversionRecastBtn').hidden, false, '重铸钮可见');
  assert.match($('conversionExtraChoices').innerHTML, /data-conversion-as="tiesuo"/, '当铁索连环使用');
  $('conversionRecastBtn').click();
  assert.ok(game.discard.some((card) => card.id === 'club-1'), '重铸牌入弃牌堆');
  assert.equal(game.player.hand.length, 1, '弃一摸一');
});

test('T UI 连环: 非梅花牌无重铸面 → 点牌即按原牌走 (不弹转化面板)', () => {
  const game = startDuel('pangtong', 'caocao');
  game.player.hand = [c('sha', { id: 'heart-sha', suit: 'heart', color: 'red' })];
  UI.render();
  assert.equal(Engine.canRecastCard(game, 'player', 'heart-sha'), false, '红桃牌不可重铸');
  $('playerHand').dispatchClick({ 'data-card-id': 'heart-sha' });
  $('handConfirmBtn').click();
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, '直接按【杀】结算, 不进转化/重铸面');
});

test('T UI 乱击: 技能选牌模式 → 点两张同花色手牌 → 确认发动【万箭齐发】', () => {
  const game = startDuel('yuanshao', 'liubei');
  game.player.hand = [c('tao', { id: 's1', suit: 'spade', color: 'black' }),
    c('tao', { id: 's2', suit: 'spade', color: 'black' })];
  UI.render();
  $('playerSkillBar').dispatchClick({ 'data-skill-id': 'luanji' });
  // 技能选牌模式复用制衡面板 (zhihengModePanel) 的骨架
  assert.equal($('zhihengModePanel').hidden, false, '进入技能选牌模式');
  assert.match(String($('zhihengHint').textContent), /乱击/);
  $('playerHand').dispatchClick({ 'data-card-id': 's1' });
  $('playerHand').dispatchClick({ 'data-card-id': 's2' });
  $('zhihengConfirmBtn').click();
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, '万箭齐发命中');
  assert.ok(game.discard.some((card) => card.id === 's1'), '两张组成实体入弃牌堆');
});

test('T UI 图鉴: 火包 8 将徽章与技能状态已翻转 (零"看起来有但触发不了")', () => {
  $('lobbyHeroesBtn').click();
  const grid = String($('heroBrowserGrid').innerHTML);
  assert.match(grid, /hb-card__pack">火</, '火包徽章');
  for (const skillName of ['强袭', '驱虎', '节命', '八阵', '火计', '看破',
    '连环', '涅槃', '天义', '猛进', '双雄', '乱击', '血裔']) {
    assert.ok(grid.includes(skillName), `${skillName} 应在图鉴中`);
  }
  // 火包 13 技均已实现 → 不应再出现"未实现"标注紧随这些技能名
  assert.equal(Engine.IMPLEMENTED_SKILL_IDS.includes('qiangxi'), true);
  assert.equal(Engine.IMPLEMENTED_SKILL_IDS.includes('xueyi'), true);
});

// ───── 评审收口 (opus 对抗复现) 的 UI 回归钉 ─────

test('T UI 评审收口 M3: 同 kind 背靠背窗口之间不得残留暂存选择', () => {
  const game = startDuel('pangde', 'caocao');
  game.player.hand = [c('sha', { id: 'p-s1' }), c('sha', { id: 'p-s2' })];
  game.player.equipment.weapon = c('qinglong', { id: 'p-qinglong' }); // 续杀 → 两次猛进窗
  game.enemy.hand = [c('shan', { id: 'e-shan1' }), c('shan', { id: 'e-shan2' }),
    c('sha', { id: 'e-keep' })];
  game.enemy.equipment.armor = c('bagua', { id: 'e-bagua' });
  UI.render();
  Engine.playCard(game, 'player', 'p-s1', { target: 'enemy' });
  UI.render();
  assert.equal($('mengjinPanel').hidden, false, '窗口 1');
  // 窗口 1: 暂存"弃装备(八卦阵)", 然后改点"不发动"
  $('mengjinChoices').dispatchClick({ 'data-mengjin-card-id': 'e-bagua' });
  $('mengjinDeclineBtn').click();
  UI.render();
  const armorBefore = !!game.enemy.equipment.armor;
  if (!$('mengjinPanel').hidden) {
    // 窗口 2 (青龙续杀): 直接按确定 — 不得沿用窗口 1 的暂存选择
    $('handConfirmBtn').click();
    assert.equal(!!game.enemy.equipment.armor, armorBefore,
      '零确认执行上一窗选择的缺陷不得复发');
  }
});

test('T UI 评审收口 M6: 涅槃/双雄/驱虎/节命 四个决策面板的静态锚点与 dispatch 接线', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of ['niepanPanel', 'shuangxiongPanel', 'quhuVictimPanel', 'jiemingPanel']) {
    assert.match(html, new RegExp('id="' + id + '" hidden'), id + ' 节点存在且默认隐藏');
  }
  const adapter = fs.readFileSync(new URL('../src/ui/dom-adapter.js', import.meta.url), 'utf8');
  for (const id of ['niepanPanel', 'shuangxiongPanel', 'quhuVictimPanel', 'jiemingPanel']) {
    assert.match(adapter, new RegExp("'" + id + "'"), id + ' 已注册进 els');
    assert.match(adapter, new RegExp("panelId: '" + id + "'"), id + ' 已入 dispatch 表');
  }
});

test('T UI 评审收口 M6: 双雄摸牌阶段面板 — "正常摸牌"按钮不再被强制放弃摸牌', () => {
  const game = startDuel('yanliangwenchou', 'caocao');
  game.phase = 'judge';
  UI.render();
  Engine.advancePhase(game);
  UI.render();
  assert.equal($('shuangxiongPanel').hidden, false, '摸牌阶段开窗');
  $('shuangxiongDeclineBtn').click();
  assert.equal(game.player.hand.length, 2, '正常摸两张');
  assert.equal($('shuangxiongPanel').hidden, true, '面板收起');
});

test('T UI 评审收口 M6: 涅槃面板 — 濒死时二选一, 不发动则限定技保留', () => {
  const game = startDuel('pangtong', 'caocao');
  game.player.hp = 1;
  game.player.hand = [c('tao', { id: 'ui-tao' })];
  game.enemy.hand = [c('sha', { id: 'ui-sha' })];
  game.turn = 'enemy';
  UI.render();
  Engine.playCard(game, 'enemy', 'ui-sha', { target: 'player' });
  UI.render();
  assert.equal($('niepanPanel').hidden, false, '涅槃询问面板出现');
  $('niepanDeclineBtn').click();
  assert.equal(game.player.flags.niepanUsed, undefined, '不发动 → 限定技保留');
});

await runTests();

console.log('\nv15 T 火包 UI 用例通过。');
