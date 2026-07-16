// v13 J3: 天香 ask 升级 — 伤害流暂停框架。玩家 (tianxiang='ask') 受到
// 伤害时, damage() 在任何 onDamageModify 钩子运行前挂起 pendingChoice
// 'tianxiang-ask' (弃红桃 + 选攻击范围内转移目标 / 放弃), resolver 以
// 原始参数 + 决策重入 damage() (钩子只跑一遍, 零重复副作用)。
// 同批: 伤害落点回调 afterDamageSettled — 天香转移后原目标未受伤害,
// 麒麟弓等武器命中特效不再对原目标触发 (修复 v12 已知偏差)。
// spec: 风包 天香 "弃置一张红桃手牌, 将此伤害转移给攻击范围内的一名
// 其他角色, 然后其摸 X 张牌 (X 为其已损失的体力值)"。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function build1v1(opts) {
  opts = opts || {};
  // enemy 用吕蒙 (无受伤钩子) — 曹操奸雄会在受转移伤害后收走来源牌, 干扰手牌计数断言
  const game = Engine.newGame({ seed: 13301, playerHero: 'xiaoqiao', enemyHero: 'lvmeng' });
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
  if (opts.ask !== false) game.player.skillPreferences.tianxiang = 'ask';
  return game;
}

function build3p() {
  const game = Engine.newGame({
    seed: 13302,
    seats: ['player', 'enemy', 'ally'],
    playerHero: 'xiaoqiao',
    enemyHero: 'caocao',
    allyHero: 'liubei'
  });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const actor of ['player', 'enemy', 'ally']) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].flags = {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp;
    game[actor].skillPreferences = {};
  }
  game.turn = 'enemy';
  game.phase = 'play';
  game.player.skillPreferences.tianxiang = 'ask';
  return game;
}

test('J3: 受杀伤害 → 挂起 tianxiang-ask (钩子运行前, 未掉血)', () => {
  const game = build1v1();
  game.player.hand = [c('tao', { id: 'p-heart', suit: 'heart', color: 'red' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  const r = Engine.playCard(game, 'enemy', 'e-sha');
  assert.equal(r.ok, true, r.message);
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'tianxiang-ask', '挂起询问');
  assert.equal(game.pendingChoice.actor, 'player');
  assert.deepEqual(game.pendingChoice.costIds, ['p-heart'], '红桃成本候选');
  assert.deepEqual(game.pendingChoice.targets.map((t) => t.seat), ['enemy'], '1v1 转移目标恒对手');
  assert.equal(game.player.hp, game.player.maxHp, '挂起期间未掉血');
});

test('J3: 确认转移 → 伤害落在对手, 弃红桃, 对手按已损体力摸牌', () => {
  const game = build1v1();
  game.player.hand = [c('tao', { id: 'p-heart', suit: 'heart', color: 'red' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.deck = [c('shan', { id: 'd1' }), c('shan', { id: 'd2' }), c('shan', { id: 'd3' })];
  Engine.playCard(game, 'enemy', 'e-sha');
  assertCardConservation(game, () => {
    const r = Engine.resolvePendingChoice(game, { cardId: 'p-heart', target: 'enemy' });
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.player.hp, game.player.maxHp, '小乔未受伤');
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, '伤害转移到对手');
  assert.ok(game.discard.some((x) => x.id === 'p-heart'), '红桃成本弃置');
  assert.equal(game.enemy.hand.length, 1, '对手摸 X=1 张 (已损失 1 点体力)');
  assert.ok(game.log.some((l) => l.includes('因【天香】摸 1 张牌')), '补牌日志');
});

test('J3: 放弃 → 伤害照常落在小乔 (钩子只跑一遍, 无重复日志)', () => {
  const game = build1v1();
  game.player.hand = [c('tao', { id: 'p-heart', suit: 'heart', color: 'red' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  Engine.playCard(game, 'enemy', 'e-sha');
  const r = Engine.resolvePendingChoice(game, { decline: true });
  assert.equal(r.ok, true, r.message);
  assert.equal(game.player.hp, game.player.maxHp - 1, '放弃 → 伤害落在小乔');
  assert.ok(game.player.hand.some((x) => x.id === 'p-heart'), '红桃保留');
  const dmgLogs = game.log.filter((l) => l.includes('受到 1 点伤害'));
  assert.equal(dmgLogs.length, 1, '伤害结算只跑一遍');
});

test('J3: 红颜联动 — 黑桃手牌视为红桃可作 ask 成本', () => {
  const game = build1v1();
  game.player.hand = [c('sha', { id: 'p-spade', suit: 'spade', color: 'black' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  Engine.playCard(game, 'enemy', 'e-sha');
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'tianxiang-ask', '黑桃(红颜视为红桃)可发动');
  assert.deepEqual(game.pendingChoice.costIds, ['p-spade']);
});

test('J3: 无红桃成本 → 不挂起, 伤害直接结算', () => {
  const game = build1v1();
  game.player.hand = [c('sha', { id: 'p-club', suit: 'club', color: 'black' })];
  // 红颜会把黑桃视为红桃, 故用草花牌
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  Engine.playCard(game, 'enemy', 'e-sha');
  assert.equal(game.pendingChoice, null, '无成本 → 不挂起');
  assert.equal(game.player.hp, game.player.maxHp - 1);
});

test('J3: 3p 多席 — 转移目标含攻击范围内全部其他座席, 可转给第三席', () => {
  const game = build3p();
  game.player.hand = [c('tao', { id: 'p-heart', suit: 'heart', color: 'red' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.deck = [c('shan', { id: 'd1' }), c('shan', { id: 'd2' }), c('shan', { id: 'd3' })];
  Engine.playCard(game, 'enemy', 'e-sha', { target: 'player' });
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'tianxiang-ask');
  const seats = game.pendingChoice.targets.map((t) => t.seat).sort();
  assert.deepEqual(seats, ['ally', 'enemy'], '3p 两个候选目标 (环距 1 均在攻击范围)');
  const r = Engine.resolvePendingChoice(game, { cardId: 'p-heart', target: 'ally' });
  assert.equal(r.ok, true, r.message);
  assert.equal(game.ally.hp, game.ally.maxHp - 1, '伤害转移到第三席');
  assert.equal(game.player.hp, game.player.maxHp, '小乔未受伤');
});

test('J3: 无效决策 (非红桃/非法目标) → 重挂面板', () => {
  const game = build1v1();
  game.player.hand = [c('tao', { id: 'p-heart', suit: 'heart', color: 'red' }), c('sha', { id: 'p-club', suit: 'club' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  Engine.playCard(game, 'enemy', 'e-sha');
  const r1 = Engine.resolvePendingChoice(game, { cardId: 'p-club', target: 'enemy' });
  assert.equal(r1.ok, false, '非红桃成本被拒');
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'tianxiang-ask', '面板重挂');
  const r2 = Engine.resolvePendingChoice(game, { cardId: 'p-heart', target: 'enemy' });
  assert.equal(r2.ok, true, r2.message);
});

test('J3: 麒麟弓 — 转移后不对原目标 (小乔) 触发命中特效', () => {
  const game = build1v1();
  game.enemy.equipment.weapon = c('qilin', { id: 'e-qilin' });
  game.player.equipment.horsePlus = c('plus_horse', { id: 'p-horse' });
  game.player.hand = [c('tao', { id: 'p-heart', suit: 'heart', color: 'red' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.deck = [c('shan', { id: 'd1' }), c('shan', { id: 'd2' })];
  Engine.playCard(game, 'enemy', 'e-sha');
  Engine.resolvePendingChoice(game, { cardId: 'p-heart', target: 'enemy' });
  assert.equal(game.player.equipment.horsePlus.id, 'p-horse', '转移后麒麟不触发, 马保留');
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, '伤害落在对手');
});

test('J3: 麒麟弓 — 放弃转移 (伤害落在小乔) → 命中特效照常触发', () => {
  const game = build1v1();
  game.enemy.equipment.weapon = c('qilin', { id: 'e-qilin' });
  game.player.equipment.horsePlus = c('plus_horse', { id: 'p-horse' });
  game.player.hand = [c('tao', { id: 'p-heart', suit: 'heart', color: 'red' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  Engine.playCard(game, 'enemy', 'e-sha');
  Engine.resolvePendingChoice(game, { decline: true });
  assert.equal(game.player.hp, game.player.maxHp - 1, '伤害落在小乔');
  assert.equal(game.player.equipment.horsePlus, null, '麒麟弓照常弃置坐骑');
});

test('J3 零回归: AI auto 座席 (非 ask) 沿用期望值三态, 不挂起', () => {
  const game = build1v1({ ask: false });
  // auto 启发: 伤害 1 且非致命 → 不转移
  game.player.hand = [c('tao', { id: 'p-heart', suit: 'heart', color: 'red' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  Engine.playCard(game, 'enemy', 'e-sha');
  assert.equal(game.pendingChoice, null, 'auto 不挂起');
  assert.equal(game.player.hp, game.player.maxHp - 1, '轻伤自吃 (auto 启发)');
  // 致命伤 → auto 转移
  const game2 = build1v1({ ask: false });
  game2.player.hp = 1;
  game2.player.hand = [c('tao', { id: 'p-heart2', suit: 'heart', color: 'red' })];
  game2.enemy.hand = [c('sha', { id: 'e-sha2' })];
  game2.deck = [c('shan', { id: 'd1' }), c('shan', { id: 'd2' }), c('shan', { id: 'd3' })];
  Engine.playCard(game2, 'enemy', 'e-sha2');
  assert.equal(game2.pendingChoice, null);
  assert.equal(game2.player.hp, 1, '致命伤 auto 转移, 小乔存活');
  assert.equal(game2.enemy.hp, game2.enemy.maxHp - 1, '伤害转移到对手');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
