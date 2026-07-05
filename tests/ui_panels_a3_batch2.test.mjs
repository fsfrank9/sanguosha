import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';

// v11 A3 批次二: 再补 6 个面板的全链路行为测试 (弹出 → 点选 → 引擎状态 → 关闭)。
// 覆盖: 刚烈发动 / 刚烈来源选择 / 麒麟弓 / 借刀杀人 / 过河拆桥 1V1 / 洛神。
// 模式同 tests/ui_panels_a3_batch1.test.mjs (fake-DOM 垫片, 真实 dom-adapter)。

const dom = installFakeDom();
const { Engine } = await import('./helpers/load-engine.mjs');
await import('../src/ui/dom-adapter.js');

const UI = globalThis.window.SanguoshaUI;
const $ = dom.$;

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

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

// ───── 刚烈发动面板 (kind: ganglie-fire) ──────────────────────────────

test('刚烈面板: 敌方杀伤夏侯惇 → 弹出 → 点"发动" → 判定生效敌方受罚', () => {
  const game = startGameViaUI('xiahoudun', 'caocao');
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'ui-gl-sha', suit: 'spade', color: 'black' })];
  game.deck = [c('sha', { id: 'ui-gl-judge', suit: 'club', color: 'black' })];
  const enemyHp = game.enemy.hp;

  Engine.playCard(game, 'enemy', 'ui-gl-sha');
  UI.render();
  assert.equal($('gangliePromptPanel').hidden, false, '刚烈发动面板弹出');

  $('ganglieFireBtn').click();
  assert.equal(game.pendingChoice, null, '发动已提交');
  assert.equal(game.enemy.hp, enemyHp - 1, '黑判定 + 敌方无 2 牌可弃 → 受 1 伤');
  assert.ok(game.discard.some((card) => card.id === 'ui-gl-judge'), '判定牌进弃牌堆');
  assert.equal($('gangliePromptPanel').hidden, true, '面板关闭');
});

test('刚烈面板: 点"不发动" → 无判定, 牌堆未动', () => {
  const game = startGameViaUI('xiahoudun', 'caocao');
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'ui-gl-sha2', suit: 'spade', color: 'black' })];
  game.deck = [c('sha', { id: 'ui-gl-stash', suit: 'club', color: 'black' })];
  const enemyHp = game.enemy.hp;

  Engine.playCard(game, 'enemy', 'ui-gl-sha2');
  UI.render();
  assert.equal($('gangliePromptPanel').hidden, false);

  $('ganglieDeclineBtn').click();
  assert.equal(game.pendingChoice, null);
  assert.equal(game.enemy.hp, enemyHp, '不发动 → 敌方无罚');
  assert.equal(game.deck.length, 1, '牌堆未动 (未判定)');
  assert.equal($('gangliePromptPanel').hidden, true, '面板关闭');
});

// ───── 刚烈来源选择面板 (kind: ganglie-source-choice) ─────────────────

test('刚烈来源面板: 玩家杀伤敌方夏侯惇 → 弹出 → 选满 2 张弃置确认', () => {
  const game = startGameViaUI('sunquan', 'xiahoudun');
  game.player.hand = [
    c('sha', { id: 'ui-gls-sha', suit: 'spade', color: 'black' }),
    c('shan', { id: 'ui-gls-keep', suit: 'heart', color: 'red' }),
    c('sha', { id: 'ui-gls-d1', suit: 'spade', color: 'black' }),
    c('sha', { id: 'ui-gls-d2', suit: 'club', color: 'black' })
  ];
  game.deck = [c('sha', { id: 'ui-gls-judge', suit: 'club', color: 'black' })];

  Engine.playCard(game, 'player', 'ui-gls-sha');
  UI.render();
  assert.equal($('ganglieSourcePanel').hidden, false, '来源选择面板弹出');
  assert.match($('ganglieSourceCandidates').innerHTML, /ui-gls-d1/, '手牌候选渲染');
  assert.equal($('ganglieSourceConfirmBtn').disabled, true, '未选满 2 张 → 确认禁用');

  $('ganglieSourceCandidates').dispatchClick({ 'data-ganglie-card-id': 'ui-gls-d1' });
  UI.render();
  assert.equal($('ganglieSourceConfirmBtn').disabled, true, '选 1 张仍禁用');
  $('ganglieSourceCandidates').dispatchClick({ 'data-ganglie-card-id': 'ui-gls-d2' });
  UI.render();
  assert.equal($('ganglieSourceConfirmBtn').disabled, false, '选满 2 张放行');

  $('ganglieSourceConfirmBtn').click();
  assert.equal(game.pendingChoice, null, '弃置已提交');
  assert.equal(game.player.hp, game.player.maxHp, '弃牌抵罚 → 无伤');
  assert.ok(game.player.hand.some((card) => card.id === 'ui-gls-keep'), '未选牌保留');
  assert.ok(game.discard.some((card) => card.id === 'ui-gls-d1'), '选中牌 1 进弃牌堆');
  assert.ok(game.discard.some((card) => card.id === 'ui-gls-d2'), '选中牌 2 进弃牌堆');
  assert.equal($('ganglieSourcePanel').hidden, true, '面板关闭');
});

test('刚烈来源面板: 点"受 1 点伤害" → 玩家掉血, 手牌保留', () => {
  const game = startGameViaUI('sunquan', 'xiahoudun');
  game.player.hand = [
    c('sha', { id: 'ui-gls2-sha', suit: 'spade', color: 'black' }),
    c('shan', { id: 'ui-gls2-a', suit: 'heart', color: 'red' }),
    c('sha', { id: 'ui-gls2-b', suit: 'club', color: 'black' })
  ];
  game.deck = [c('sha', { id: 'ui-gls2-judge', suit: 'club', color: 'black' })];
  const playerHp = game.player.hp;

  Engine.playCard(game, 'player', 'ui-gls2-sha');
  UI.render();
  assert.equal($('ganglieSourcePanel').hidden, false);

  $('ganglieSourceTakeDamageBtn').click();
  assert.equal(game.pendingChoice, null);
  assert.equal(game.player.hp, playerHp - 1, '选择受罚 → -1 hp');
  assert.equal(game.player.hand.length, 2, '手牌保留');
  assert.equal($('ganglieSourcePanel').hidden, true, '面板关闭');
});

// ───── 麒麟弓面板 (kind: qilin-pick) ──────────────────────────────────

test('麒麟弓面板: 杀命中双马目标 → 弹出 → 选 -1 马提交 → 弃置该马', () => {
  const game = startGameViaUI();
  game.player.skillPreferences.qilin = 'ask';
  game.player.equipment.weapon = c('qilin', { id: 'ui-ql-w' });
  game.player.hand = [c('sha', { id: 'ui-ql-sha' })];
  game.enemy.equipment.horseMinus = c('minus_horse', { id: 'ui-ql-mh' });
  game.enemy.equipment.horsePlus = c('plus_horse', { id: 'ui-ql-ph' });

  Engine.playCard(game, 'player', 'ui-ql-sha');
  UI.render();
  assert.equal($('qilinPickPanel').hidden, false, '麒麟弓面板弹出');
  assert.match($('qilinPickChoices').innerHTML, /horseMinus/, '-1 马候选渲染');
  assert.match($('qilinPickChoices').innerHTML, /horsePlus/, '+1 马候选渲染');

  $('qilinPickChoices').dispatchClick({ 'data-qilin-slot': 'horseMinus' });
  $('handConfirmBtn').click();
  assert.equal(game.pendingChoice, null, '选择已提交');
  assert.equal(game.enemy.equipment.horseMinus, null, '-1 马被弃置');
  assert.ok(game.enemy.equipment.horsePlus, '+1 马保留 (只弃一张)');
  assert.ok(game.discard.some((card) => card.id === 'ui-ql-mh'), '被弃马进弃牌堆');
  assert.equal($('qilinPickPanel').hidden, true, '面板关闭');
});

test('麒麟弓面板: 点"不发动" → 双马保留', () => {
  const game = startGameViaUI();
  game.player.skillPreferences.qilin = 'ask';
  game.player.equipment.weapon = c('qilin', { id: 'ui-ql2-w' });
  game.player.hand = [c('sha', { id: 'ui-ql2-sha' })];
  game.enemy.equipment.horseMinus = c('minus_horse', { id: 'ui-ql2-mh' });
  game.enemy.equipment.horsePlus = c('plus_horse', { id: 'ui-ql2-ph' });

  Engine.playCard(game, 'player', 'ui-ql2-sha');
  UI.render();
  assert.equal($('qilinPickPanel').hidden, false);

  $('qilinDeclineBtn').click();
  assert.equal(game.pendingChoice, null);
  assert.ok(game.enemy.equipment.horseMinus, '不发动 → -1 马保留');
  assert.ok(game.enemy.equipment.horsePlus, '+1 马保留');
  assert.equal($('qilinPickPanel').hidden, true, '面板关闭');
});

// ───── 借刀杀人面板 (kind: jiedao-decision) ───────────────────────────

test('借刀面板: 敌方借刀 → 弹出 → 点"出杀" → 杀消耗, 武器保留', () => {
  const game = startGameViaUI();
  game.turn = 'enemy';
  game.player.equipment.weapon = c('qinggang', { id: 'ui-jd-w' });
  game.player.hand = [c('sha', { id: 'ui-jd-sha' })];
  game.enemy.hand = [c('jiedao', { id: 'ui-jd' })];
  const enemyHp = game.enemy.hp;

  Engine.playCard(game, 'enemy', 'ui-jd');
  UI.render();
  assert.equal($('jiedaoDecisionPanel').hidden, false, '借刀决定面板弹出');

  $('jiedaoDecisionFireBtn').click();
  assert.equal(game.pendingChoice, null, '决定已提交');
  assert.equal(game.player.hand.length, 0, '杀被打出');
  assert.equal(game.enemy.hp, enemyHp - 1, '敌方无闪 → 受 1 伤');
  assert.ok(game.player.equipment.weapon, '出杀 → 武器保留');
  assert.equal($('jiedaoDecisionPanel').hidden, true, '面板关闭');
});

test('借刀面板: 点"交出武器" → 武器进敌方手牌, 杀保留', () => {
  const game = startGameViaUI();
  game.turn = 'enemy';
  game.player.equipment.weapon = c('qinggang', { id: 'ui-jd2-w' });
  game.player.hand = [c('sha', { id: 'ui-jd2-sha' })];
  game.enemy.hand = [c('jiedao', { id: 'ui-jd2' })];

  Engine.playCard(game, 'enemy', 'ui-jd2');
  UI.render();
  assert.equal($('jiedaoDecisionPanel').hidden, false);

  $('jiedaoDecisionDeclineBtn').click();
  assert.equal(game.pendingChoice, null);
  assert.equal(game.player.equipment.weapon, null, '武器槽清空');
  assert.ok(game.enemy.hand.some((card) => card.id === 'ui-jd2-w'), '武器进敌方手牌');
  assert.ok(game.player.hand.some((card) => card.id === 'ui-jd2-sha'), '杀保留在手');
  assert.equal($('jiedaoDecisionPanel').hidden, true, '面板关闭');
});

// ───── 过河拆桥 1V1 面板 (kind: guohe-1v1-pick) ───────────────────────

test('过河面板: 弹出 → 选装备提交 → 敌方武器被弃', () => {
  const game = startGameViaUI();
  game.player.hand = [c('guohe', { id: 'ui-gh-card' })];
  game.enemy.equipment.weapon = c('qinggang', { id: 'ui-gh-wpn' });
  game.enemy.hand = [c('tao', { id: 'ui-gh-h1' })];

  Engine.playCard(game, 'player', 'ui-gh-card');
  UI.render();
  assert.equal($('guohePickPanel').hidden, false, '过河面板弹出');
  assert.match($('guohePickEquipment').innerHTML, /ui-gh-wpn/, '装备候选渲染');
  assert.match($('guohePickHand').innerHTML, /ui-gh-h1/, '手牌内容可见 (spec: 观看)');

  $('guohePickEquipment').dispatchClick({ 'data-guohe-zone': 'equipment', 'data-guohe-card-id': 'ui-gh-wpn' });
  $('handConfirmBtn').click();
  assert.equal(game.pendingChoice, null, '选择已提交');
  assert.equal(game.enemy.equipment.weapon, null, '敌方武器被拆');
  assert.ok(game.discard.some((card) => card.id === 'ui-gh-wpn'), '武器进弃牌堆');
  assert.ok(game.enemy.hand.some((card) => card.id === 'ui-gh-h1'), '手牌未动');
  assert.equal($('guohePickPanel').hidden, true, '面板关闭');
});

test('过河面板: 选手牌提交 → 该手牌被弃', () => {
  const game = startGameViaUI();
  game.player.hand = [c('guohe', { id: 'ui-gh2-card' })];
  game.enemy.hand = [c('tao', { id: 'ui-gh2-h1' }), c('shan', { id: 'ui-gh2-h2' })];

  Engine.playCard(game, 'player', 'ui-gh2-card');
  UI.render();
  assert.equal($('guohePickPanel').hidden, false);

  $('guohePickHand').dispatchClick({ 'data-guohe-zone': 'hand', 'data-guohe-card-id': 'ui-gh2-h2' });
  $('handConfirmBtn').click();
  assert.equal(game.pendingChoice, null);
  assert.ok(game.discard.some((card) => card.id === 'ui-gh2-h2'), '指定手牌进弃牌堆');
  assert.ok(game.enemy.hand.some((card) => card.id === 'ui-gh2-h1'), '另一张保留');
  assert.equal($('guohePickPanel').hidden, true, '面板关闭');
});

// ───── 洛神面板 (kind: luoshen-continue) ──────────────────────────────

test('洛神面板: 甄姬回合开始 → 弹出 → 连续两次"继续" → 黑牌入手红牌止', () => {
  const game = startGameViaUI('zhenji', 'liubei');
  game.player.skillPreferences.luoshen = 'ask';
  game.deck = [
    c('shan', { id: 'ls-pad-1', suit: 'club', color: 'black' }),
    c('shan', { id: 'ls-pad-2', suit: 'club', color: 'black' }),
    c('tao', { id: 'ls-red', suit: 'heart', color: 'red' }),
    c('sha', { id: 'ls-black', suit: 'spade', color: 'black' })
  ];

  Engine.startTurn(game, 'player');
  UI.render();
  assert.equal($('luoshenPromptPanel').hidden, false, '洛神面板弹出 (判定前询问)');

  $('luoshenContinueBtn').click(); // 第一次判定: 黑 → 获得, 再次询问
  UI.render();
  assert.ok(game.player.hand.some((card) => card.id === 'ls-black'), '黑判定牌入手');
  assert.equal($('luoshenPromptPanel').hidden, false, '黑判定后再次询问');

  $('luoshenContinueBtn').click(); // 第二次判定: 红 → 终止
  assert.equal(game.pendingChoice, null, '洛神结束');
  assert.ok(game.discard.some((card) => card.id === 'ls-red'), '红判定牌进弃牌堆');
  UI.render();
  assert.equal($('luoshenPromptPanel').hidden, true, '面板关闭');
});

test('洛神面板: 点"见好就收" → 不判定, 直接进入后续阶段', () => {
  const game = startGameViaUI('zhenji', 'liubei');
  game.player.skillPreferences.luoshen = 'ask';
  game.deck = [
    c('shan', { id: 'ls2-pad-1', suit: 'club', color: 'black' }),
    c('shan', { id: 'ls2-pad-2', suit: 'club', color: 'black' }),
    c('sha', { id: 'ls2-black', suit: 'spade', color: 'black' })
  ];

  Engine.startTurn(game, 'player');
  UI.render();
  assert.equal($('luoshenPromptPanel').hidden, false, '洛神面板弹出');
  const deckBefore = game.deck.length;

  $('luoshenStopBtn').click();
  assert.equal(game.pendingChoice, null, '洛神跳过');
  assert.ok(game.deck.length < deckBefore, '回合续跑 (摸牌阶段消耗牌堆)');
  assert.ok(!game.discard.some((card) => card.id === 'ls2-black'), '没有发生判定 (无判定弃牌)');
  UI.render();
  assert.equal($('luoshenPromptPanel').hidden, true, '面板关闭');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
