// v11 C5 (批次 29): AI 锦囊类转化决策 — aiChooseCard/aiTakeAction 泛化,
// AI 大乔/甘宁会评估并使用 国色 (方片→乐不思蜀) / 奇袭 (黑牌→过河拆桥)。
// 与 UI 转化面板同源 (listCardConversions), 三方 (引擎/UI/AI) 口径一致。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function buildGame(playerHero, enemyHero) {
  const game = Engine.newGame({ seed: 29001, playerHero, enemyHero });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].flags = {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp;
    game[actor].skillPreferences = {};
  }
  game.turn = 'enemy';
  game.phase = 'play';
  return game;
}

// ───── 奇袭 (甘宁) ──────────────────────────────────────────────────

test('AI 甘宁: 黑闪 (原牌不可出) + 对方有装备 → 选择当拆', () => {
  const game = buildGame('liubei', 'ganning');
  game.enemy.hand = [c('shan', { id: 'black-shan', suit: 'spade', color: 'black' })];
  game.player.equipment.weapon = c('qinggang', { id: 'p-wpn' });
  const choice = Engine.aiChooseCard(game, 'enemy');
  assert.ok(choice, '有可执行选择');
  assert.equal(choice.card.id, 'black-shan');
  assert.equal(choice.mode, 'convert');
  assert.equal(choice.asType, 'guohe');
});

test('AI 甘宁: aiTakeAction 实际打出黑牌当拆 → 对方装备被弃', () => {
  const game = buildGame('liubei', 'ganning');
  game.enemy.hand = [c('shan', { id: 'black-shan', suit: 'spade', color: 'black' })];
  game.player.equipment.weapon = c('qinggang', { id: 'p-wpn' });
  assertCardConservation(game, () => {
    const result = Engine.aiTakeAction(game, 'enemy');
    assert.equal(result.ok, true, result.message);
  });
  assert.equal(game.player.equipment.weapon, null, '对方武器被拆');
  assert.ok(game.discard.some((x) => x.id === 'p-wpn'));
  assert.ok(game.discard.some((x) => x.id === 'black-shan' && x.type === 'shan'),
    '来源牌以原实体身份进弃牌堆');
  assert.ok(game.log.some((l) => l.includes('【奇袭】')), '有奇袭日志');
});

test('AI 甘宁 优先级: 拆高价值目标胜过低分杀', () => {
  const game = buildGame('liubei', 'ganning');
  game.enemy.hand = [c('sha', { id: 'black-sha', suit: 'spade', color: 'black' })];
  // 对方 2 张闪 (杀启发分降到 35) + 4 张区域牌 (拆启发分 70)
  game.player.hand = [
    c('shan', { id: 'p-shan1' }), c('shan', { id: 'p-shan2' }),
    c('tao', { id: 'p-tao' })
  ];
  game.player.equipment.weapon = c('qinggang', { id: 'p-wpn' });
  const choice = Engine.aiChooseCard(game, 'enemy');
  assert.ok(choice);
  assert.equal(choice.mode, 'convert', '转化拆 胜过 普通杀');
  assert.equal(choice.asType, 'guohe');
});

test('AI 甘宁 同型跳过: 真过河拆桥 → mode normal (不做无意义转化)', () => {
  const game = buildGame('liubei', 'ganning');
  game.enemy.hand = [c('guohe', { id: 'real-guohe', suit: 'spade', color: 'black' })];
  game.player.hand = [c('tao', { id: 'p-tao' })];
  const choice = Engine.aiChooseCard(game, 'enemy');
  assert.ok(choice);
  assert.equal(choice.mode, 'normal', '真拆按原牌使用');
});

test('AI 甘宁 反例: 红牌无转化候选 → 无可出 (null)', () => {
  const game = buildGame('liubei', 'ganning');
  game.enemy.hand = [c('shan', { id: 'red-shan', suit: 'heart', color: 'red' })];
  game.player.hand = [c('tao', { id: 'p-tao' })];
  assert.equal(Engine.aiChooseCard(game, 'enemy'), null);
});

test('AI 反例: 非甘宁的黑闪 → 无可出 (null)', () => {
  const game = buildGame('liubei', 'lvmeng');
  game.enemy.hand = [c('shan', { id: 'black-shan', suit: 'spade', color: 'black' })];
  game.player.hand = [c('tao', { id: 'p-tao' })];
  assert.equal(Engine.aiChooseCard(game, 'enemy'), null);
});

// ───── 国色 (大乔) ──────────────────────────────────────────────────

test('AI 大乔: 方片闪 (原牌不可出) → 选择当乐不思蜀', () => {
  const game = buildGame('liubei', 'daqiao');
  game.enemy.hand = [c('shan', { id: 'dia-shan', suit: 'diamond', color: 'red' })];
  const choice = Engine.aiChooseCard(game, 'enemy');
  assert.ok(choice, '有可执行选择');
  assert.equal(choice.mode, 'convert');
  assert.equal(choice.asType, 'lebusishu');
});

test('AI 大乔: aiTakeAction 实际打出方片当乐 → 入对方判定区', () => {
  const game = buildGame('liubei', 'daqiao');
  game.enemy.hand = [c('shan', { id: 'dia-shan', suit: 'diamond', color: 'red' })];
  assertCardConservation(game, () => {
    const result = Engine.aiTakeAction(game, 'enemy');
    assert.equal(result.ok, true, result.message);
  });
  assert.equal(game.player.judgeArea.length, 1, '乐入对方判定区');
  assert.equal(game.player.judgeArea[0].type, 'lebusishu');
  assert.equal(game.player.judgeArea[0].physicalCard.id, 'dia-shan', '保留原实体牌');
  assert.ok(game.log.some((l) => l.includes('【国色】')), '有国色日志');
});

test('AI 大乔 反例: 对方判定区已有乐 → 无转化候选 (同名禁叠)', () => {
  const game = buildGame('liubei', 'daqiao');
  game.enemy.hand = [c('shan', { id: 'dia-shan', suit: 'diamond', color: 'red' })];
  game.player.judgeArea = [c('lebusishu', { id: 'existing-le' })];
  assert.equal(Engine.aiChooseCard(game, 'enemy'), null, '同名延时禁叠 → 无候选');
});

// ───── lookahead 模拟路径 ───────────────────────────────────────────

test('aiSimulateCardPlay: mode 直接携带 asType → 模拟转化不崩溃且返回后置状态', () => {
  const game = buildGame('liubei', 'ganning');
  game.enemy.hand = [c('shan', { id: 'black-shan', suit: 'spade', color: 'black' })];
  game.player.equipment.weapon = c('qinggang', { id: 'p-wpn' });
  const sim = Engine.aiSimulateCardPlay(game, 'enemy', game.enemy.hand[0], 'guohe');
  assert.ok(sim, '模拟成功');
  assert.equal(sim.player.equipment.weapon, null, '模拟态中对方武器被拆');
  assert.equal(game.player.equipment.weapon.id, 'p-wpn', '原局面不受影响');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
