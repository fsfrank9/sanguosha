// v15 T: 拼点 (rank compare) 框架 — 全新机制的独立行为测试。
// 官方流程: official-skill-cache/gltjk-sanguosha-rules/pages/
// flow__rankcompare.md (双方各扣置一张手牌 → 亮出比点数 → 点数相同双方
// 都没赢 → "赢/没赢后"效果 → 处理区拼点牌入弃牌堆)。
import assert from 'node:assert/strict';
import { Engine, c } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function buildDuel(playerHero = 'taishici', enemyHero = 'caocao', seed = 77001) {
  const game = Engine.newGame({ seed, playerHero, enemyHero });
  game.log = [];
  game.discard = [];
  game.deck = [c('sha', { id: 'deck-1' }), c('sha', { id: 'deck-2' })];
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].flags = {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp;
    game[actor].skillPreferences = {};
  }
  game.turn = 'player';
  game.phase = 'play';
  return game;
}

test('拼点: 点数大者赢 — 玩家席经 pendingChoice 选牌, AI 席同步选, 守恒', () => {
  const game = buildDuel();
  game.player.hand = [c('sha', { id: 'p-K', rank: 'K' }), c('sha', { id: 'p-2', rank: '2' })];
  game.enemy.hand = [c('sha', { id: 'e-5', rank: '5' })];
  const started = Engine.useSkill(game, 'player', 'tianyi', [], { target: 'enemy' });
  assert.equal(started.ok, true);
  const pending = Engine.getPendingChoice(game);
  assert.ok(pending && pending.kind === 'pindian-card', '玩家席选牌窗');
  assert.equal(pending.options.length, 2, '候选=全部手牌');
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'p-K' }));
  assert.equal(game.player.flags.tianyiWon, true, 'K > 5 → 赢');
  // "然后将处理区里所有拼点的牌置入弃牌堆"
  assert.ok(game.discard.some((card) => card.id === 'p-K'), '拼点牌入弃牌堆');
  assert.ok(game.discard.some((card) => card.id === 'e-5'), '对方拼点牌同样入弃牌堆');
  assert.equal(game.player.hand.length, 1, '只消耗拼点的那一张');
});

test('拼点: 点数相同 → 双方都没赢 (发起者按没赢结算)', () => {
  const game = buildDuel();
  game.player.hand = [c('sha', { id: 'p-7', rank: '7' })];
  game.enemy.hand = [c('sha', { id: 'e-7', rank: '7' })];
  Engine.useSkill(game, 'player', 'tianyi', [], { target: 'enemy' });
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'p-7' }));
  assert.equal(game.player.flags.tianyiWon, undefined, '点数相同不算赢');
  assert.equal(game.player.flags.tianyiLost, true, '发起者按没赢结算');
});

test('拼点: A 最小 K 最大 (点数序 A=1…K=13)', () => {
  const game = buildDuel();
  game.player.hand = [c('sha', { id: 'p-A', rank: 'A' })];
  game.enemy.hand = [c('sha', { id: 'e-2', rank: '2' })];
  Engine.useSkill(game, 'player', 'tianyi', [], { target: 'enemy' });
  Engine.resolvePendingChoice(game, { cardId: 'p-A' });
  assert.equal(game.player.flags.tianyiLost, true, 'A(1) < 2 → 没赢');
});

test('拼点门槛: 任一方无手牌 → 不能拼点 (发起被拒, 零副作用)', () => {
  const game = buildDuel();
  game.player.hand = [c('sha', { id: 'p-1' })];
  game.enemy.hand = [];
  const rejected = Engine.useSkill(game, 'player', 'tianyi', [], { target: 'enemy' });
  assert.equal(rejected.ok, false);
  assert.equal(game.player.hand.length, 1, '零副作用');
  assert.equal(game.player.flags.tianyiUsed, undefined, '限次未消耗');
});

test('拼点: 选牌挂起期间实体牌锚在 pauseState (守恒 census 在途面)', () => {
  const game = buildDuel();
  game.player.hand = [c('sha', { id: 'p-9', rank: '9' })];
  game.enemy.hand = [c('sha', { id: 'e-3', rank: '3' })];
  assertCardConservation(game, () => {
    Engine.useSkill(game, 'player', 'tianyi', [], { target: 'enemy' });
  });
  assert.ok(game.pauseState.pindian, '拼点状态挂起');
  Engine.resolvePendingChoice(game, { cardId: 'p-9' });
});

test('拼点: 空决策兜底 (soak) → 自动取点数最大的一张', () => {
  const game = buildDuel();
  game.player.hand = [c('sha', { id: 'p-3', rank: '3' }), c('sha', { id: 'p-Q', rank: 'Q' })];
  game.enemy.hand = [c('sha', { id: 'e-8', rank: '8' })];
  Engine.useSkill(game, 'player', 'tianyi', [], { target: 'enemy' });
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, {}));
  assert.equal(game.player.flags.tianyiWon, true, '兜底取 Q → 赢');
  assert.ok(game.player.hand.some((card) => card.id === 'p-3'), '小牌留在手里');
});

test('拼点: 双方都是 AI 席时同步跑完 (无挂起)', () => {
  const game = Engine.newGame({
    seed: 77007,
    seats: ['player', 'enemy', 'ally'],
    roles: { player: '主公', enemy: '反贼', ally: '忠臣' },
    playerHero: 'liubei', enemyHero: 'taishici', allyHero: 'guanyu'
  });
  game.log = []; game.discard = []; game.deck = [c('sha', { id: 'deck-1' })];
  for (const seat of game.seats) {
    game[seat].hand = []; game[seat].judgeArea = []; game[seat].flags = {};
    game[seat].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[seat].hp = game[seat].maxHp; game[seat].skillPreferences = {};
  }
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'ai-K', rank: 'K' }), c('sha', { id: 'ai-sha' })];
  game.ally.hand = [c('sha', { id: 'ally-4', rank: '4' })];
  assertCardConservation(game, () => {
    const result = Engine.useSkill(game, 'enemy', 'tianyi', [], { target: 'ally' });
    assert.equal(result.ok, true);
  });
  assert.equal(Engine.getPendingChoice(game), null, '双方均为引擎决策 → 无挂起');
  assert.equal(game.enemy.flags.tianyiWon, true);
  assert.ok(game.discard.some((card) => card.id === 'ai-K'), '拼点牌入弃牌堆');
  assert.ok(game.discard.some((card) => card.id === 'ally-4'));
});

test('拼点 AI 出牌启发: 只读自己手牌, 出点数最大的一张 (同点数让位低价值牌)', () => {
  const game = buildDuel('caocao', 'taishici');
  game.turn = 'enemy';
  // 同为 K: 桃 (高价值) 与 杀 (低价值) → 应拿杀去拼点
  game.enemy.hand = [c('tao', { id: 'ai-tao-K', rank: 'K' }), c('sha', { id: 'ai-sha-K', rank: 'K' })];
  game.player.hand = [c('sha', { id: 'p-2', rank: '2' })];
  Engine.useSkill(game, 'enemy', 'tianyi', [], { target: 'player' });
  assert.ok(game.enemy.hand.some((card) => card.id === 'ai-tao-K'), '桃留在手里');
  assert.equal(game.pauseState.pindian.cards.enemy.id, 'ai-sha-K', '拿杀去拼点');
  assert.ok(Engine.getPendingChoice(game), '轮到玩家席选牌 → 挂起');
});

await runTests();

console.log('\nv15 T 拼点框架用例通过。');
