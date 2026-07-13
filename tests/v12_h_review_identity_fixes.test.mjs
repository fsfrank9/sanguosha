// v12 H 独立合规复核 (身份场侧) — 2 处已验证缺陷的回归锁定:
//   缺陷4 [高]: 黄天/离间 flags.huangtianUsed/lijianUsed 在 phases.js 的
//     resetActorTurnState/resetEndOfTurnState 未复位 (H7 新增时遗漏) → 实为
//     每局限一次而非官方"每回合限一次"。修复: 两处 reset 补复位。
//   缺陷5 [中高]: 护驾对无双 (吕布) 不像激将那样二次询问玩家代打第二张闪 →
//     玩家手握第二张真闪却被跳过, 主公无谓掉血。修复: resolveHujiaAidChoice
//     无双且玩家刚代打一张、仍有闪时再次挂起询问 (与激将侧对称)。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }
function c(type, overrides = {}) { return Engine.makeTestCard(type, overrides); }

function stockTao(game, n) { for (let i = 0; i < n; i += 1) game.deck.push(c('tao', { id: `t-${i}` })); }

// 驱动整整一轮回到 player (player→enemy→ally→player), 排空沿途 pendingChoice。
function advanceFullRound(game) {
  const prepares = () => (game.turnHistory || []).filter((e) => e.actor === 'player' && e.phase === 'prepare').length;
  const target = prepares() + 1;
  for (let guard = 0; guard < 80; guard += 1) {
    if (game.phase === 'gameover') return;
    if (game.turn === 'player' && prepares() >= target) return;
    if (game.pendingChoice) { Engine.resolvePendingChoice(game, { use: false }); continue; }
    if (game.turn !== 'player') { Engine.runAITurn(game, game.turn); continue; }
    Engine.endTurn(game);
  }
}

// ───── 缺陷4: 离间 / 黄天 每回合复位 ─────

test('缺陷4 离间: 跨一整轮后新回合可再发动 (每回合非每局一次)', () => {
  const game = Engine.newGame({
    seed: 70001, seats: ['player', 'enemy', 'ally'],
    playerHero: 'diaochan', enemyHero: 'guanyu', allyHero: 'zhangfei',
    roles: { player: '主公', enemy: '反贼', ally: '忠臣' }, startWithFirstTurn: true
  });
  game.deck = [];
  for (let i = 0; i < 40; i += 1) game.deck.push(c('shan', { id: `d-${i}`, suit: 'diamond' }));
  game.turn = 'player';
  game.phase = 'play';
  game.player.hand = [c('sha', { id: 'cost-1' }), c('sha', { id: 'cost-2' })];
  const r1 = Engine.useSkill(game, 'player', 'lijian', ['cost-1'], { targets: ['ally', 'enemy'] });
  assert.equal(r1.ok, true, '第 1 回合离间发动成功');
  assert.equal(game.player.flags.lijianUsed, true, '本回合标记已置');
  advanceFullRound(game);
  assert.equal(game.phase !== 'gameover', true, '一轮后游戏继续');
  assert.equal(game.turn, 'player', '回到 player 第 2 回合');
  assert.equal(game.player.flags.lijianUsed, false, '缺陷4修复: 新回合标记已复位');
  const r2 = Engine.useSkill(game, 'player', 'lijian', ['cost-2'], { targets: ['ally', 'enemy'] });
  assert.equal(r2.ok, true, '缺陷4修复: 新回合离间可再次发动 (修复前 fail 每局限一次)');
});

test('缺陷4 黄天: 回合结束复位 huangtianUsed (经引擎 endTurn 观测 reset 契约)', () => {
  const game = Engine.newGame({
    seed: 70003, seats: ['player', 'enemy', 'ally'],
    playerHero: 'zhangjiao', enemyHero: 'caocao', allyHero: 'guanyu',
    roles: { player: '主公', enemy: '反贼', ally: '忠臣' }, startWithFirstTurn: true
  });
  game.turn = 'player';
  game.phase = 'play';
  if (!game.player.flags) game.player.flags = {};
  game.player.flags.huangtianUsed = true;
  game.player.flags.lijianUsed = true;
  Engine.endTurn(game); // completeTurn → resetEndOfTurnState(player) + startTurn(enemy)
  assert.equal(game.player.flags.huangtianUsed, false, '缺陷4修复: 回合结束复位 huangtianUsed');
  assert.equal(game.player.flags.lijianUsed, false, '缺陷4修复: 回合结束复位 lijianUsed');
});

// ───── 缺陷5: 护驾无双二次询问玩家 ─────

test('缺陷5 护驾: 无双下玩家代打第一张闪后, 仍有闪 → 二次询问, 凑齐则主公免伤', () => {
  const game = Engine.newGame({
    seed: 80001, seats: ['player', 'enemy', 'ally'],
    playerHero: 'zhangliao', enemyHero: 'lvbu', allyHero: 'caocao',
    roles: { player: '忠臣', enemy: '反贼', ally: '主公' }, startWithFirstTurn: true
  });
  game.deck = [];
  stockTao(game, 20);
  game.turn = 'enemy';
  game.phase = 'play';
  for (const s of game.seats) {
    game[s].judgeArea = [];
    game[s].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[s].hp = game[s].maxHp;
  }
  game.ally.hand = []; // 主公曹操自身无闪
  game.player.hand = [c('shan', { id: 'shan1' }), c('shan', { id: 'shan2' }), c('tao', { id: 'p-tao' })];
  game.enemy.hand = [c('sha', { id: 'lvbu-sha' })];
  const allyHpBefore = game.ally.hp;
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'lvbu-sha', { target: 'ally' }));
  assert.ok(game.pendingChoice && game.pendingChoice.kind === 'hujia-aid', '护驾代打询问挂起 (第 1 张)');
  Engine.resolvePendingChoice(game, { use: true, cardId: 'shan1' });
  assert.ok(game.pendingChoice && game.pendingChoice.kind === 'hujia-aid', '缺陷5修复: 无双第 2 张再次询问玩家');
  Engine.resolvePendingChoice(game, { use: true, cardId: 'shan2' });
  assert.equal(game.ally.hp, allyHpBefore, '缺陷5修复: 两张闪凑齐, 主公免伤 (修复前只问一次→白白掉血)');
  assert.equal(game.player.hand.filter((x) => x.type === 'shan').length, 0, '两张真闪均已代打');
});

test('缺陷5 护驾: 玩家代打一张后放弃第二张 → 主公受伤 (无双未凑齐)', () => {
  const game = Engine.newGame({
    seed: 80002, seats: ['player', 'enemy', 'ally'],
    playerHero: 'zhangliao', enemyHero: 'lvbu', allyHero: 'caocao',
    roles: { player: '忠臣', enemy: '反贼', ally: '主公' }, startWithFirstTurn: true
  });
  game.deck = [];
  stockTao(game, 20);
  game.turn = 'enemy';
  game.phase = 'play';
  for (const s of game.seats) {
    game[s].judgeArea = [];
    game[s].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[s].hp = game[s].maxHp;
  }
  game.ally.hand = [];
  game.player.hand = [c('shan', { id: 'shan1' }), c('shan', { id: 'shan2' })];
  game.enemy.hand = [c('sha', { id: 'lvbu-sha2' })];
  const allyHpBefore = game.ally.hp;
  Engine.playCard(game, 'enemy', 'lvbu-sha2', { target: 'ally' });
  Engine.resolvePendingChoice(game, { use: true, cardId: 'shan1' }); // 代打第 1 张
  assert.ok(game.pendingChoice && game.pendingChoice.kind === 'hujia-aid', '第 2 张询问');
  Engine.resolvePendingChoice(game, { use: false }); // 放弃第 2 张
  assert.equal(game.ally.hp, allyHpBefore - 1, '无双未凑齐两张 → 主公受 1 伤');
});

test('缺陷5 对照: 非无双普通杀 → 护驾一张闪即化解 (不多问)', () => {
  const game = Engine.newGame({
    seed: 80003, seats: ['player', 'enemy', 'ally'],
    playerHero: 'zhangliao', enemyHero: 'zhaoyun', allyHero: 'caocao',
    roles: { player: '忠臣', enemy: '反贼', ally: '主公' }, startWithFirstTurn: true
  });
  game.deck = [];
  stockTao(game, 20);
  game.turn = 'enemy';
  game.phase = 'play';
  for (const s of game.seats) {
    game[s].judgeArea = [];
    game[s].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[s].hp = game[s].maxHp;
  }
  game.ally.hand = [];
  game.player.hand = [c('shan', { id: 'shan1' }), c('shan', { id: 'shan2' })];
  game.enemy.hand = [c('sha', { id: 'zy-sha' })];
  const allyHpBefore = game.ally.hp;
  Engine.playCard(game, 'enemy', 'zy-sha', { target: 'ally' });
  assert.ok(game.pendingChoice && game.pendingChoice.kind === 'hujia-aid', '护驾询问');
  Engine.resolvePendingChoice(game, { use: true, cardId: 'shan1' });
  assert.equal(game.pendingChoice, null, '普通杀一张闪化解, 不再追问');
  assert.equal(game.ally.hp, allyHpBefore, '主公免伤');
  assert.equal(game.player.hand.filter((x) => x.type === 'shan').length, 1, '仅代打一张闪');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
