import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function makeGame() {
  const game = Engine.newGame({ seed: 91, startWithFirstTurn: true });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v7 PR-14: 丈八蛇矛 使用 path 已实现 (Engine.playZhangbaSha 旧路径不破坏)', () => {
  const game = makeGame();
  game.player.equipment.weapon = { id: 'zb', type: 'zhangba', name: '丈八蛇矛', family: 'equipment', slot: 'weapon', range: 3 };
  game.player.hand = [
    { id: 'h1', type: 'tao', name: '桃', suit: 'heart', color: 'red' },
    { id: 'h2', type: 'shan', name: '闪', suit: 'heart', color: 'red' }
  ];
  const hpBefore = game.enemy.hp;
  const result = Engine.playZhangbaSha(game, 'player', ['h1', 'h2']);
  assert.equal(result.ok, true);
  assert.equal(game.enemy.hp, hpBefore - 1, '丈八虚拟杀命中（enemy 无闪）');
  assert.ok(game.discard.some((c) => c.id === 'h1'));
  assert.ok(game.discard.some((c) => c.id === 'h2'));
});

test('v7 PR-14: 决斗响应 — 拥有 丈八 + 无杀 + 2 张手牌 → 自动当杀响应', () => {
  const game = makeGame();
  game.enemy.equipment.weapon = { id: 'zb-enemy', type: 'zhangba', name: '丈八蛇矛', family: 'equipment', slot: 'weapon', range: 3 };
  // enemy 无 sha，但有 2 张可弃手牌
  game.enemy.hand = [
    { id: 'foe-1', type: 'tao', name: '桃', suit: 'heart', color: 'red' },
    { id: 'foe-2', type: 'shan', name: '闪', suit: 'heart', color: 'red' }
  ];
  game.player.hand = [
    { id: 'duel', type: 'juedou', name: '决斗', family: 'trick', suit: 'spade', color: 'black' }
  ];
  const enemyHpBefore = game.enemy.hp;
  const playerHpBefore = game.player.hp;
  Engine.playCard(game, 'player', 'duel');
  // 决斗 由 enemy 先响应：无 sha 但 丈八+2手 → 自动弃 2 手当杀响应。
  // 然后轮到 player 响应：player 无 sha，无 丈八 → 不能响应 → 受到 1 点伤害。
  assert.equal(game.player.hp, playerHpBefore - 1, 'player 没杀响应，受到 1 dmg');
  assert.equal(game.enemy.hp, enemyHpBefore, 'enemy 用丈八响应成功，无伤');
  // 两张手牌进弃牌堆
  assert.ok(game.discard.some((c) => c.id === 'foe-1'));
  assert.ok(game.discard.some((c) => c.id === 'foe-2'));
  // enemy 手牌空
  assert.equal(game.enemy.hand.length, 0);
});

test('v7 PR-14: 决斗响应 — 拥有 丈八 + 只 1 张手牌 → 无法响应', () => {
  const game = makeGame();
  game.enemy.equipment.weapon = { id: 'zb-only-1', type: 'zhangba', name: '丈八蛇矛', family: 'equipment', slot: 'weapon', range: 3 };
  game.enemy.hand = [
    { id: 'only-1', type: 'tao', name: '桃', suit: 'heart', color: 'red' }
  ];
  game.player.hand = [
    { id: 'duel-vs-1', type: 'juedou', name: '决斗', family: 'trick', suit: 'spade', color: 'black' }
  ];
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'duel-vs-1');
  assert.equal(game.enemy.hp, enemyHpBefore - 1, 'enemy 只 1 手牌 → 丈八无法响应 → 受 1 dmg');
  // 那张手牌还在
  assert.ok(game.enemy.hand.some((c) => c.id === 'only-1'));
});

test('v7 PR-14: 决斗响应 — 拥有 丈八 + 真 sha → 优先用真 sha', () => {
  const game = makeGame();
  game.enemy.equipment.weapon = { id: 'zb-with-sha', type: 'zhangba', name: '丈八蛇矛', family: 'equipment', slot: 'weapon', range: 3 };
  game.enemy.hand = [
    { id: 'real-sha', type: 'sha', name: '杀', suit: 'spade', color: 'black' },
    { id: 'tao-keep', type: 'tao', name: '桃', suit: 'heart', color: 'red' },
    { id: 'shan-keep', type: 'shan', name: '闪', suit: 'heart', color: 'red' }
  ];
  game.player.hand = [
    { id: 'duel-priority', type: 'juedou', name: '决斗', family: 'trick', suit: 'spade', color: 'black' }
  ];
  Engine.playCard(game, 'player', 'duel-priority');
  // enemy 用真 sha 响应; player 无 sha → 受 1 dmg
  assert.ok(game.discard.some((c) => c.id === 'real-sha'), '真 sha 被使用');
  assert.ok(game.enemy.hand.some((c) => c.id === 'tao-keep'), '桃 仍保留');
  assert.ok(game.enemy.hand.some((c) => c.id === 'shan-keep'), '闪 仍保留');
});

test('v7 PR-14: skillPreferences.zhangba="decline" → 不走丈八响应路径', () => {
  const game = makeGame();
  game.enemy.equipment.weapon = { id: 'zb-decline', type: 'zhangba', name: '丈八蛇矛', family: 'equipment', slot: 'weapon', range: 3 };
  game.enemy.skillPreferences.zhangba = 'decline';
  game.enemy.hand = [
    { id: 'keep-1', type: 'tao', name: '桃', suit: 'heart', color: 'red' },
    { id: 'keep-2', type: 'shan', name: '闪', suit: 'heart', color: 'red' }
  ];
  game.player.hand = [
    { id: 'duel-decline', type: 'juedou', name: '决斗', family: 'trick', suit: 'spade', color: 'black' }
  ];
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'duel-decline');
  assert.equal(game.enemy.hp, enemyHpBefore - 1, 'decline → 不响应 → 受 1 dmg');
  assert.ok(game.enemy.hand.some((c) => c.id === 'keep-1'), '手牌保留');
  assert.ok(game.enemy.hand.some((c) => c.id === 'keep-2'), '手牌保留');
});

test('v7 PR-14: 南蛮入侵响应 — 丈八 同样可用 (需要打出杀响应)', () => {
  const game = makeGame();
  game.enemy.equipment.weapon = { id: 'zb-nm', type: 'zhangba', name: '丈八蛇矛', family: 'equipment', slot: 'weapon', range: 3 };
  game.enemy.hand = [
    { id: 'nm-1', type: 'tao', name: '桃', suit: 'heart', color: 'red' },
    { id: 'nm-2', type: 'tao', name: '桃', suit: 'heart', color: 'red' }
  ];
  game.player.hand = [
    { id: 'nm', type: 'nanman', name: '南蛮入侵', family: 'trick', suit: 'spade', color: 'black' }
  ];
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'nm');
  assert.equal(game.enemy.hp, enemyHpBefore, '南蛮被丈八响应成功 → 无伤');
  assert.equal(game.enemy.hand.length, 0, '2 张手牌被弃');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
