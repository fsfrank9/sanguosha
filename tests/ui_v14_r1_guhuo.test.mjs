// v14 R1: 蛊惑 UI 全链路 (fake-DOM) —
//   ① 质疑窗面板: AI 于吉声明 → 面板渲染 (声明名可见/真牌不泄露) →
//     质疑/不质疑按钮结算; ② 声明面板: 玩家于吉 选型+盖置牌+确认门禁,
//     需目标型转座席点选; ③ 缠怨势力行附注。
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

function startDuel(playerHero, enemyHero) {
  // 评审收口: 随机身份令敌方主公先手时 enemyThinking 挂起手牌/技能点击
  // (~50% flaky) — 随 ui-game.mjs 惯例重掷身份直到玩家先手。
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
  return game;
}

test('R1 UI 静态锚点: 质疑窗/声明面板节点 + PENDING_MODAL_DISPATCH 接线', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="guhuoChallengePanel" hidden/);
  assert.match(html, /id="guhuoDeclarePanel" hidden/);
  const adapter = fs.readFileSync(new URL('../src/ui/dom-adapter.js', import.meta.url), 'utf8');
  assert.match(adapter, /panelId: 'guhuoChallengePanel'/);
  assert.match(adapter, /panelId: 'guhuoDeclarePanel'/);
});

test('R1 UI 质疑窗: AI 于吉声明 → 面板出现 (声明名可见, 真牌不泄露) → 质疑验真获缠怨', () => {
  const game = startDuel('caocao', 'yuji');
  game.turn = 'enemy';
  game.enemy.hand = [c('wuzhong', { id: 'ui-wz' })];
  game.deck = [c('shan', { id: 'd1' }), c('shan', { id: 'd2' })];
  Engine.playGuhuoDeclare(game, 'enemy', { cardId: 'ui-wz', declareType: 'wuzhong' });
  UI.render();
  assert.equal($('guhuoChallengePanel').hidden, false, '质疑窗出现');
  assert.match(String($('guhuoChallengeHint').textContent), /无中生有/, '声明牌名可见');
  assert.match(String($('guhuoChallengeHint').textContent), /缠怨/, '质疑风险如实提示');
  $('guhuoChallengeBtn').click();
  assert.equal(game.player.chanyuan, true, '质疑真 → 玩家获缠怨');
  assert.equal($('guhuoChallengePanel').hidden, true, '面板关闭');
  UI.render();
  assert.match(String($('playerCamp').textContent), /缠怨/, '缠怨势力行附注');
});

test('R1 UI 质疑窗: 不质疑按钮 → 队列续跑照常结算', () => {
  const game = startDuel('caocao', 'yuji');
  game.turn = 'enemy';
  game.enemy.hand = [c('shan', { id: 'ui-fake' })];
  game.deck = [c('tao', { id: 'd1' }), c('tao', { id: 'd2' })];
  Engine.playGuhuoDeclare(game, 'enemy', { cardId: 'ui-fake', declareType: 'wuzhong' });
  UI.render();
  $('guhuoPassBtn').click();
  assert.equal(game.enemy.hand.length, 2, '放弃质疑 → 假声明结算摸 2');
  assert.equal($('guhuoChallengePanel').hidden, true);
});

test('R1 UI 声明面板: 选型+盖置牌确认门禁; 无目标型直接声明', () => {
  const game = startDuel('yuji', 'caocao');
  game.turn = 'player';
  game.phase = 'play';
  game.player.hand = [c('wuzhong', { id: 'p-wz' })];
  game.enemy.hp = game.enemy.maxHp; // 敌方健康 → 但无中 denial 面: hp>=3 敌对
  game.deck = [c('shan', { id: 'd1' }), c('shan', { id: 'd2' })];
  UI.render();
  $('playerSkillBar').dispatchClick({ 'data-skill-id': 'guhuo' });
  assert.equal($('guhuoDeclarePanel').hidden, false, '声明面板打开');
  assert.match($('guhuoTypeChoices').innerHTML, /data-guhuo-type="wuzhong"/);
  assert.match($('guhuoCoverChoices').innerHTML, /data-guhuo-cover="p-wz"/);
  assert.equal($('guhuoConfirmBtn').disabled, true, '未选齐前禁用');
  $('guhuoTypeChoices').dispatchClick({ 'data-guhuo-type': 'wuzhong' });
  assert.equal($('guhuoConfirmBtn').disabled, true, '仅选型仍禁用');
  $('guhuoCoverChoices').dispatchClick({ 'data-guhuo-cover': 'p-wz' });
  assert.equal($('guhuoConfirmBtn').disabled, false, '选齐可确认');
  $('guhuoConfirmBtn').click();
  assert.equal($('guhuoDeclarePanel').hidden, true, '确认后面板关闭');
  // 1v1 敌方 AI (hp>=3 敌对) 质疑真无中 → 获缠怨, 无中照常结算
  assert.equal(game.enemy.chanyuan, true, 'AI 质疑真 → 缠怨');
  assert.equal(game.player.hand.length, 2, '无中照常摸 2');
});

test('R1 UI 声明面板: 需目标型 (杀) 确认后转座席点选 → 点席位完成声明', () => {
  const game = startDuel('yuji', 'caocao');
  game.turn = 'player';
  game.phase = 'play';
  const shaCard = c('sha', { id: 'p-sha', suit: 'spade', color: 'black' });
  game.player.hand = [shaCard];
  game.enemy.hand = [c('shan', { id: 'e-shan' })];
  UI.render();
  $('playerSkillBar').dispatchClick({ 'data-skill-id': 'guhuo' });
  $('guhuoTypeChoices').dispatchClick({ 'data-guhuo-type': 'sha' });
  $('guhuoCoverChoices').dispatchClick({ 'data-guhuo-cover': 'p-sha' });
  $('guhuoConfirmBtn').click();
  assert.equal($('guhuoDeclarePanel').hidden, true, '面板关闭转座席点选');
  assert.equal($('seatTargetModePanel').hidden, false, '座席点选出现');
  // 点敌方英雄卡 → 暂存 → 确定
  $('enemyHero').click();
  $('seatTargetConfirmBtn').click();
  assert.ok(game.discard.some((dc) => dc.id === 'e-shan'), '敌方闪响应 (声明杀结算)');
  assert.ok(game.discard.some((dc) => dc.id === 'p-sha'), '实体牌入弃牌堆');
});

test('R1 UI: 非于吉席位 guhuo 按钮不可用 (guhuoAvailable 门禁)', () => {
  const game = startDuel('caocao', 'yuji');
  game.turn = 'player';
  game.phase = 'play';
  game.player.hand = [c('sha', { id: 'x1' })];
  UI.render();
  $('playerSkillBar').dispatchClick({ 'data-skill-id': 'guhuo' });
  assert.equal($('guhuoDeclarePanel').hidden, true, '非于吉: 面板不打开');
});

await runTests();

console.log('\nv14 R1 蛊惑 UI 用例通过。');
