import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

// 审计二轮批次 6: M4 五谷洗牌 / M7 贯石斧选择权 / L1 火攻展示选择 /
// L2 奸雄获得锦囊伤害牌 / L3 国色乐走无懈链 / L4 discardExcess 事务化。

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function makeGame(playerHero = 'liubei', enemyHero = 'sunquan') {
  const game = Engine.newGame({ seed: 97, startWithFirstTurn: true, playerHero, enemyHero });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('M4: 牌堆仅 1 张但弃牌堆充足 → 五谷洗牌后正常亮出 2 张', () => {
  const game = makeGame();
  game.deck = [c('tao', { id: 'last-deck' })];
  game.discard = [c('sha', { id: 'dis-1' }), c('shan', { id: 'dis-2' }), c('tao', { id: 'dis-3' })];
  game.player.hand = [c('wugu', { id: 'wugu-1' })];
  game.player.skillPreferences.wugu = 'auto';

  const result = Engine.playCard(game, 'player', 'wugu-1');
  assert.equal(result.ok, true);
  assert.ok(!game.log.some((entry) => /结算终止/.test(entry)), 'M4: 不再错误终止');
  assert.equal(game.player.hand.length, 1, 'player 获得 1 张');
  assert.equal(game.enemy.hand.length, 1, 'enemy 获得 1 张');
});

test('M4: 牌堆+弃牌堆合计不足 → 终止结算, 已亮牌入弃牌堆 (守恒)', () => {
  const game = makeGame();
  game.deck = [c('tao', { id: 'only-card' })];
  game.discard = [];
  game.player.hand = [c('wugu', { id: 'wugu-2' })];
  game.player.skillPreferences.wugu = 'auto';

  const result = Engine.playCard(game, 'player', 'wugu-2');
  assert.equal(result.ok, true);
  assert.ok(game.log.some((entry) => /结算终止/.test(entry)));
  assert.equal(game.player.hand.length, 0);
  assert.equal(game.enemy.hand.length, 0);
  assert.ok(game.discard.some((card) => card.id === 'only-card'), '已亮出的牌进弃牌堆');
  assert.ok(game.discard.some((card) => card.id === 'wugu-2'), '五谷自身进弃牌堆');
});

test('M7: skillPreferences.guanshi=decline → 不强制命中, 正常闪避', () => {
  const game = makeGame();
  game.player.equipment.weapon = c('guanshi', { id: 'gs-w' });
  game.player.skillPreferences.guanshi = 'decline';
  game.player.hand = [c('sha', { id: 'gs-sha' }), c('tao', { id: 'keep-1' }), c('tao', { id: 'keep-2' })];
  game.enemy.hand = [c('shan', { id: 'foe-shan' })];
  const enemyHp = game.enemy.hp;

  Engine.playCard(game, 'player', 'gs-sha');
  assert.equal(game.enemy.hp, enemyHp, 'decline → 目标闪避成功');
  assert.equal(game.player.hand.length, 2, '手牌未被强制弃置');
});

test('M7: guanshi=ask → pendingChoice 自选两张 (含装备) 强制命中', () => {
  const game = makeGame();
  game.player.equipment.weapon = c('guanshi', { id: 'gs-w2' });
  game.player.equipment.horsePlus = c('plus_horse', { id: 'gs-horse' });
  game.player.skillPreferences.guanshi = 'ask';
  game.player.hand = [c('sha', { id: 'gs-sha2' }), c('tao', { id: 'gs-tao' })];
  game.enemy.hand = [c('shan', { id: 'foe-shan2' })];
  const enemyHp = game.enemy.hp;

  Engine.playCard(game, 'player', 'gs-sha2');
  assert.equal(game.pendingChoice.kind, 'guanshi-discard');
  assert.ok(game.pendingChoice.equipment.some((e) => e.cardId === 'gs-horse'), '装备区牌可选');

  const resolved = Engine.resolvePendingChoice(game, { cardIds: ['gs-tao', 'gs-horse'] });
  assert.equal(resolved.ok, true);
  assert.equal(game.enemy.hp, enemyHp - 1, '强制命中 1 dmg');
  assert.equal(game.player.equipment.horsePlus, null, '+1 马作为成本被弃');
  assert.ok(game.discard.some((card) => card.id === 'gs-tao'));
});

test('M7: guanshi=ask + decline 决定 → 放弃发动, 目标闪避', () => {
  const game = makeGame();
  game.player.equipment.weapon = c('guanshi', { id: 'gs-w3' });
  game.player.skillPreferences.guanshi = 'ask';
  game.player.hand = [c('sha', { id: 'gs-sha3' }), c('tao', { id: 't1' }), c('tao', { id: 't2' })];
  game.enemy.hand = [c('shan', { id: 'foe-shan3' })];
  const enemyHp = game.enemy.hp;

  Engine.playCard(game, 'player', 'gs-sha3');
  const resolved = Engine.resolvePendingChoice(game, { decline: true });
  assert.equal(resolved.ok, true);
  assert.equal(game.enemy.hp, enemyHp, '放弃 → 无伤害');
  assert.equal(game.player.hand.length, 2, '手牌保留');
  assert.equal(game.pauseState.guanshi, null, '暂停状态清理');
});

test('L1: 玩家目标 huogongShow=ask → 自选展示牌, 决定火攻成败', () => {
  const game = makeGame();
  game.turn = 'enemy';
  game.player.skillPreferences.huogongShow = 'ask';
  game.player.hand = [
    c('tao', { id: 'show-heart', suit: 'heart', color: 'red' }),
    c('sha', { id: 'show-club', suit: 'club', color: 'black' })
  ];
  // enemy 只有红桃可弃 → player 展示草花即可让火攻落空
  game.enemy.hand = [
    c('huogong', { id: 'hg-1', suit: 'diamond', color: 'red' }),
    c('shan', { id: 'foe-heart', suit: 'heart', color: 'red' })
  ];
  const playerHp = game.player.hp;

  Engine.playCard(game, 'enemy', 'hg-1');
  assert.equal(game.pendingChoice.kind, 'huogong-show', '等待玩家选择展示牌');

  const resolved = Engine.resolvePendingChoice(game, { cardId: 'show-club' });
  assert.equal(resolved.ok, true);
  assert.equal(game.player.hp, playerHp, '展示草花 → 对方无同花色 → 火攻无效');
  assert.ok(game.player.hand.some((card) => card.id === 'show-club'), '展示牌保留在手');
});

test('L2: 决斗致伤 → 奸雄获得决斗牌 (从弃牌堆取回, 不重复)', () => {
  const game = makeGame('liubei', 'caocao');
  game.player.hand = [c('juedou', { id: 'duel-1' }), c('sha', { id: 'p-sha' })];
  game.enemy.hand = []; // 曹操无杀 → 受 1 伤

  Engine.playCard(game, 'player', 'duel-1');
  assert.ok(game.enemy.hand.some((card) => card.id === 'duel-1'), '奸雄获得决斗牌');
  assert.ok(!game.discard.some((card) => card.id === 'duel-1'), '弃牌堆无重复');
});

test('L2: 万箭齐发致伤 → 奸雄获得万箭牌', () => {
  const game = makeGame('liubei', 'caocao');
  game.player.hand = [c('wanjian', { id: 'wj-1' })];
  game.enemy.hand = []; // 无闪

  Engine.playCard(game, 'player', 'wj-1');
  assert.ok(game.enemy.hand.some((card) => card.id === 'wj-1'), '奸雄获得万箭牌');
  assert.ok(!game.discard.some((card) => card.id === 'wj-1'), '弃牌堆无重复');
});

test('L3/v13 J0-2: 国色方片当乐 → 判定阶段生效前可被无懈抵消', () => {
  const game = makeGame('daqiao', 'sunquan');
  game.player.hand = [c('sha', { id: 'dia-sha', suit: 'diamond', color: 'red' })];
  // v11 D1 (批次 33): AI 无懈走期望值 — 乐只在手牌有阵容 (>=2) 时才护,
  // 补一张手牌满足条件, 保持本测试对无懈链的覆盖意图。
  game.enemy.hand = [c('wuxie', { id: 'foe-wuxie', suit: 'spade', color: 'black' }), c('tao', { id: 'foe-filler' })];
  game.deck = [c('sha', { id: 'd1' }), c('sha', { id: 'd2' }), c('sha', { id: 'd3' })];

  const result = Engine.playCardAs(game, 'player', 'dia-sha', 'lebusishu');
  assert.equal(result.ok, true, result.message);
  // v13 J0-2: 放置时不再开无懈窗口 — 直接入判定区
  assert.equal(game.enemy.judgeArea.length, 1, '放置时直接入判定区');
  // 目标判定阶段生效前开无懈窗口 → 敌方 (手牌有阵容) 自保
  Engine.startTurn(game, 'enemy');
  assert.equal(game.enemy.judgeArea.length, 0, '判定前被无懈抵消');
  assert.ok(game.discard.some((card) => card.id === 'foe-wuxie'), '无懈已打出');
  assert.ok(game.discard.some((card) => card.id === 'dia-sha'), '被抵消的乐 (物理方片) 进弃牌堆');
  assert.ok(!game.enemy.flags.skipPlay, '出牌阶段未被跳过');
});

test('L3: 国色方片当乐 (对方无无懈) → 正常入判定区', () => {
  const game = makeGame('daqiao', 'sunquan');
  game.player.hand = [c('sha', { id: 'dia-sha2', suit: 'diamond', color: 'red' })];

  const result = Engine.playCardAs(game, 'player', 'dia-sha2', 'lebusishu');
  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.judgeArea.length, 1, '入判定区');
  assert.equal(game.enemy.judgeArea[0].type, 'lebusishu');
});

test('L4: discardExcess 传重复/无效 cardId → fail 且手牌原封不动', () => {
  const game = makeGame();
  game.player.hand = [
    c('sha', { id: 'h1' }), c('sha', { id: 'h2' }), c('sha', { id: 'h3' }),
    c('sha', { id: 'h4' }), c('sha', { id: 'h5' }), c('sha', { id: 'h6' })
  ];
  game.player.hp = 4; // 手牌上限 4 → 需弃 2
  const result = Engine.discardExcess(game, 'player', ['h1', 'h1']);
  assert.equal(result.ok, false, '重复 id 不足额 → fail');
  assert.equal(game.player.hand.length, 6, 'L4: 失败时不部分弃牌');

  const ok = Engine.discardExcess(game, 'player', ['h1', 'h2']);
  assert.equal(ok.ok, true);
  assert.equal(game.player.hand.length, 4);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
