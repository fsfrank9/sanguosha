import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';

// v11 A3 批次一: 6 个存量面板的全链路行为测试 (弹出 → 点选 → 引擎状态 → 关闭)。
// 覆盖: 无懈可击响应 / 决斗杀响应 / 鬼才 / 反馈 / 遗计 / 五谷丰登。
// 取代 v8/v10 时期对应面板的"源码正则"断言 (清债见同 PR 删除的 regex 用例)。

const dom = installFakeDom();
const { Engine } = await import('./helpers/load-engine.mjs');
await import('../src/ui/dom-adapter.js');

const UI = globalThis.window.SanguoshaUI;
const $ = dom.$;

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

// 通过真实 UI 路径开一局 (武将可参数化), 然后整形成测试需要的局面。
function startGameViaUI(playerHero = 'liubei', enemyHero = 'sunquan') {
  $('lobby1v1Btn').click();
  $('playerHeroSelect').value = playerHero;
  $('enemyHeroSelect').value = enemyHero;
  $('startGameBtn').click();
  const game = UI.getGame();
  game.turn = 'player';
  game.phase = 'play';
  game.player.hand = [];
  game.enemy.hand = [];
  game.player.hp = game.player.maxHp;
  game.enemy.hp = game.enemy.maxHp;
  game.player.judgeArea = [];
  game.enemy.judgeArea = [];
  game.player.equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
  game.enemy.equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
  game.pendingChoice = null;
  game.pendingChoiceQueue = [];
  game.pauseState = {};
  UI.render();
  return game;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── 无懈可击响应面板 (v10 V5, kind: wuxie-response) ─────────────────

test('无懈面板: 敌方过河拆桥 → 弹出 → 选无懈提交 → 锦囊取消装备保留', () => {
  const game = startGameViaUI();
  game.turn = 'enemy';
  game.player.hand = [c('wuxie', { id: 'ui-wx' })];
  game.player.equipment.weapon = c('qinggang', { id: 'ui-qg' });
  game.enemy.hand = [c('guohe', { id: 'ui-gh' })];

  Engine.playCard(game, 'enemy', 'ui-gh');
  UI.render();
  assert.equal($('wuxieResponsePanel').hidden, false, '无懈响应面板弹出');
  assert.match($('wuxieResponseChoices').innerHTML, /ui-wx/, '无懈候选渲染');

  $('wuxieResponseChoices').dispatchClick({ 'data-wuxie-card-id': 'ui-wx' });
  $('handConfirmBtn').click();
  assert.equal(game.pendingChoice, null, '选择已提交');
  assert.equal(game.player.equipment.weapon && game.player.equipment.weapon.id, 'ui-qg', '锦囊被无懈 → 装备保留');
  assert.equal(game.player.hand.length, 0, '无懈已消耗');
  assert.equal($('wuxieResponsePanel').hidden, true, '面板关闭');
});

test('无懈面板: 点"不使用" → 锦囊照常结算装备被弃', () => {
  const game = startGameViaUI();
  game.turn = 'enemy';
  game.player.hand = [c('wuxie', { id: 'ui-wx2' })];
  game.player.equipment.weapon = c('qinggang', { id: 'ui-qg2' });
  game.enemy.hand = [c('guohe', { id: 'ui-gh2' })];

  Engine.playCard(game, 'enemy', 'ui-gh2');
  UI.render();
  assert.equal($('wuxieResponsePanel').hidden, false);

  $('wuxieResponseDeclineBtn').click();
  assert.equal(game.pendingChoice, null);
  assert.equal(game.player.equipment.weapon, null, '不使用 → 装备被拆');
  assert.ok(game.player.hand.some((card) => card.id === 'ui-wx2'), '无懈保留在手');
  assert.equal($('wuxieResponsePanel').hidden, true, '面板关闭');
});

// ───── 决斗杀响应面板 (v10 V6, kind: sha-duel-response) ────────────────

test('决斗面板: 敌方决斗 → 弹出 → 选杀提交 → 对方无杀受伤', () => {
  const game = startGameViaUI();
  game.turn = 'enemy';
  game.player.hand = [c('sha', { id: 'ui-duel-sha' })];
  game.enemy.hand = [c('juedou', { id: 'ui-duel' })];
  const enemyHp = game.enemy.hp;

  Engine.playCard(game, 'enemy', 'ui-duel');
  UI.render();
  assert.equal($('duelResponsePanel').hidden, false, '决斗响应面板弹出');
  assert.match($('duelResponseChoices').innerHTML, /ui-duel-sha/, '杀候选渲染');

  $('duelResponseChoices').dispatchClick({ 'data-duel-card-id': 'ui-duel-sha' });
  $('handConfirmBtn').click();
  assert.equal(game.pendingChoice, null);
  assert.equal(game.enemy.hp, enemyHp - 1, '玩家出杀 → 敌方无杀 → 敌方受 1 伤');
  assert.equal(game.player.hand.length, 0, '杀已消耗');
  assert.equal($('duelResponsePanel').hidden, true, '面板关闭');
});

test('决斗面板: 点"不出杀" → 玩家受 1 伤, 杀保留', () => {
  const game = startGameViaUI();
  game.turn = 'enemy';
  game.player.hand = [c('sha', { id: 'ui-duel-sha2' })];
  game.enemy.hand = [c('juedou', { id: 'ui-duel2' })];
  const playerHp = game.player.hp;

  Engine.playCard(game, 'enemy', 'ui-duel2');
  UI.render();
  assert.equal($('duelResponsePanel').hidden, false);

  $('duelResponseDeclineBtn').click();
  assert.equal(game.player.hp, playerHp - 1, '不出杀 → 受 1 伤');
  assert.ok(game.player.hand.some((card) => card.id === 'ui-duel-sha2'), '杀保留在手');
  assert.equal($('duelResponsePanel').hidden, true, '面板关闭');
});

// ───── 鬼才面板 (kind: guicai-replace) ────────────────────────────────

test('鬼才面板: 对手乐不思蜀判定 → 弹出 → 选红桃替换 → 判定被改写', () => {
  const game = startGameViaUI('simayi', 'liubei');
  game.player.hand = [c('tao', { id: 'ui-gc-heart', suit: 'heart', color: 'red', rank: '5' })];
  game.enemy.judgeArea = [c('lebusishu', { id: 'ui-gc-lebu', suit: 'club', color: 'black' })];
  game.deck = [
    c('sha', { id: 'gc-pad-1' }),
    c('sha', { id: 'gc-pad-2' }),
    c('sha', { id: 'ui-gc-orig', suit: 'spade', color: 'black', rank: '7' })
  ];

  Engine.startTurn(game, 'enemy');
  UI.render();
  assert.equal($('guicaiPromptPanel').hidden, false, '鬼才面板弹出');
  assert.match($('guicaiOriginalCard').innerHTML, /ui-gc-orig|spade|♠|黑桃/, '原判定牌展示');
  assert.match($('guicaiCandidates').innerHTML, /ui-gc-heart/, '手牌候选渲染');

  $('guicaiCandidates').dispatchClick({ 'data-guicai-card-id': 'ui-gc-heart' });
  $('handConfirmBtn').click();
  assert.equal(game.pendingChoice, null, '替换已提交');
  assert.equal(game.player.hand.length, 0, '替换牌离手');
  assert.equal(game.enemy.flags.skipPlay, false, '红桃判定 → 乐不思蜀不生效');
  assert.ok(game.discard.some((card) => card.id === 'ui-gc-orig'), '原判定牌进弃牌堆');
  UI.render();
  assert.equal($('guicaiPromptPanel').hidden, true, '面板关闭');
});

test('鬼才面板: 点"不发动" → 原判定生效 (乐不思蜀跳过出牌)', () => {
  const game = startGameViaUI('simayi', 'liubei');
  game.player.hand = [c('tao', { id: 'ui-gc-heart2', suit: 'heart', color: 'red' })];
  game.enemy.judgeArea = [c('lebusishu', { id: 'ui-gc-lebu2', suit: 'club', color: 'black' })];
  game.deck = [
    c('sha', { id: 'gc2-pad-1' }),
    c('sha', { id: 'gc2-pad-2' }),
    c('sha', { id: 'ui-gc-orig2', suit: 'spade', color: 'black', rank: '7' })
  ];

  Engine.startTurn(game, 'enemy');
  UI.render();
  assert.equal($('guicaiPromptPanel').hidden, false);

  $('guicaiDeclineBtn').click();
  assert.equal(game.pendingChoice, null);
  assert.equal(game.enemy.flags.skipPlay, true, '黑桃原判定 → 乐不思蜀生效');
  assert.ok(game.player.hand.some((card) => card.id === 'ui-gc-heart2'), '手牌保留');
  assert.equal($('guicaiPromptPanel').hidden, true, '面板关闭');
});

// ───── 反馈面板 (kind: fankui-pick) ───────────────────────────────────

test('反馈面板: 敌方杀伤司马懿 → 弹出 → 选装备提交 → 获得敌方武器', () => {
  const game = startGameViaUI('simayi', 'caocao');
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'ui-fk-sha', suit: 'spade', color: 'black' })];
  game.enemy.equipment.weapon = c('zhuge', { id: 'ui-fk-zhuge' });

  Engine.playCard(game, 'enemy', 'ui-fk-sha');
  UI.render();
  assert.equal($('fankuiPromptPanel').hidden, false, '反馈面板弹出');
  assert.match($('fankuiZones').innerHTML, /ui-fk-zhuge/, '装备候选渲染');

  $('fankuiZones').dispatchClick({ 'data-fankui-zone': 'equipment', 'data-fankui-card-id': 'ui-fk-zhuge' });
  $('handConfirmBtn').click();
  assert.equal(game.pendingChoice, null, '选择已提交');
  assert.ok(game.player.hand.some((card) => card.id === 'ui-fk-zhuge'), '武器进入司马懿手牌');
  assert.equal(game.enemy.equipment.weapon, null, '敌方武器槽清空');
  assert.equal($('fankuiPromptPanel').hidden, true, '面板关闭');
});

test('反馈面板: 选手牌区 → 随机获得一张敌方手牌', () => {
  const game = startGameViaUI('simayi', 'caocao');
  game.turn = 'enemy';
  game.enemy.hand = [
    c('sha', { id: 'ui-fk-sha2', suit: 'spade', color: 'black' }),
    c('tao', { id: 'ui-fk-loot' })
  ];

  Engine.playCard(game, 'enemy', 'ui-fk-sha2');
  UI.render();
  assert.equal($('fankuiPromptPanel').hidden, false, '反馈面板弹出');
  assert.match($('fankuiZones').innerHTML, /data-fankui-zone="hand"/, '手牌区按钮渲染');

  $('fankuiZones').dispatchClick({ 'data-fankui-zone': 'hand' });
  $('handConfirmBtn').click();
  assert.equal(game.pendingChoice, null);
  assert.ok(game.player.hand.some((card) => card.id === 'ui-fk-loot'), '获得敌方唯一剩余手牌');
  assert.equal(game.enemy.hand.length, 0);
  assert.equal($('fankuiPromptPanel').hidden, true, '面板关闭');
});

// ───── 遗计面板 (kind: yiji-distribute) ───────────────────────────────

test('遗计面板: 郭嘉受伤 → 弹出 → 点选一张给对方 → 确认分配', () => {
  const game = startGameViaUI('guojia', 'caocao');
  Engine.setSkillPreference(game, 'player', 'yiji', 'ask');
  game.turn = 'enemy';
  game.deck = [c('sha', { id: 'ui-yj-a' }), c('shan', { id: 'ui-yj-b' })];
  game.enemy.hand = [c('sha', { id: 'ui-yj-attack', suit: 'spade', color: 'black' })];
  const enemyHandBefore = game.enemy.hand.length;

  Engine.playCard(game, 'enemy', 'ui-yj-attack');
  UI.render();
  assert.equal($('yijiPromptPanel').hidden, false, '遗计面板弹出');
  assert.match($('yijiCandidates').innerHTML, /ui-yj-a/, '摸到的牌渲染为候选');
  assert.match($('yijiCandidates').innerHTML, /ui-yj-b/);

  $('yijiCandidates').dispatchClick({ 'data-yiji-card-id': 'ui-yj-a' });
  UI.render();
  assert.match($('yijiCandidates').innerHTML, /selected/, '点选后高亮');

  $('yijiConfirmBtn').click();
  assert.equal(game.pendingChoice, null, '分配已提交');
  assert.ok(game.enemy.hand.some((card) => card.id === 'ui-yj-a'), '选中的牌给了对方');
  assert.equal(game.enemy.hand.length, enemyHandBefore, '对方 -1 杀 +1 遗计牌');
  assert.ok(game.player.hand.some((card) => card.id === 'ui-yj-b'), '未选牌留给自己');
  assert.equal($('yijiPromptPanel').hidden, true, '面板关闭');
});

test('遗计面板: 点"全部留己" → 两张都留在手', () => {
  const game = startGameViaUI('guojia', 'caocao');
  Engine.setSkillPreference(game, 'player', 'yiji', 'ask');
  game.turn = 'enemy';
  game.deck = [c('sha', { id: 'ui-yj2-a' }), c('shan', { id: 'ui-yj2-b' })];
  game.enemy.hand = [c('sha', { id: 'ui-yj2-attack', suit: 'spade', color: 'black' })];

  Engine.playCard(game, 'enemy', 'ui-yj2-attack');
  UI.render();
  assert.equal($('yijiPromptPanel').hidden, false);

  $('yijiKeepAllBtn').click();
  assert.equal(game.pendingChoice, null);
  assert.ok(game.player.hand.some((card) => card.id === 'ui-yj2-a'), '牌 a 留己');
  assert.ok(game.player.hand.some((card) => card.id === 'ui-yj2-b'), '牌 b 留己');
  assert.equal($('yijiPromptPanel').hidden, true, '面板关闭');
});

// ───── 五谷丰登面板 (kind: wugu-pick) ─────────────────────────────────

test('五谷面板: 玩家使用五谷 → 亮出池弹出 → 选牌提交 → 获得所选, AI 拿剩余', () => {
  const game = startGameViaUI();
  game.player.hand = [c('wugu', { id: 'ui-wg' })];
  game.deck = [
    c('tao', { id: 'ui-wg-pad' }),
    c('shan', { id: 'ui-wg-pool-b' }),
    c('sha', { id: 'ui-wg-pool-a' })
  ];

  Engine.playCard(game, 'player', 'ui-wg');
  UI.render();
  assert.equal($('wuguPickPanel').hidden, false, '五谷面板弹出');
  assert.match($('wuguPickChoices').innerHTML, /ui-wg-pool-a/, '亮出池渲染');
  assert.match($('wuguPickChoices').innerHTML, /ui-wg-pool-b/);

  $('wuguPickChoices').dispatchClick({ 'data-wugu-card-id': 'ui-wg-pool-b' });
  $('handConfirmBtn').click();
  assert.equal(game.pendingChoice, null, '选择已提交, 结算完成');
  assert.ok(game.player.hand.some((card) => card.id === 'ui-wg-pool-b'), '玩家获得所选牌');
  assert.ok(game.enemy.hand.some((card) => card.id === 'ui-wg-pool-a'), '对方自动获得剩余牌');
  assert.ok(game.discard.some((card) => card.id === 'ui-wg'), '五谷本体进弃牌堆');
  assert.equal($('wuguPickPanel').hidden, true, '面板关闭');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
