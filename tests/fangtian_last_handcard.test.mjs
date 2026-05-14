import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function makeGame() {
  const game = Engine.newGame({ seed: 92, startWithFirstTurn: true });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v7 PR-15: 装备方天 + 最后一张手牌为 杀 → flags.fangtianBonus=true + log', () => {
  const game = makeGame();
  game.player.equipment.weapon = { id: 'ft', type: 'fangtian', name: '方天画戟', family: 'equipment', slot: 'weapon', range: 4 };
  // 只有一张手牌：杀 → 使用后 hand.length === 0
  const sha = { id: 'last-sha', type: 'sha', name: '杀', suit: 'spade', color: 'black' };
  game.player.hand = [sha];
  const logLenBefore = game.log.length;
  Engine.playCard(game, 'player', 'last-sha');
  assert.equal(game.player.flags.fangtianBonus, true, '触发标记应为 true');
  // 检查 log 含方天触发提示
  const tail = game.log.slice(logLenBefore).join(' / ');
  assert.match(tail, /方天画戟/, 'log 应记录方天触发');
});

test('v7 PR-15: 装备方天 + 杀 不是最后一张 → 不触发', () => {
  const game = makeGame();
  game.player.equipment.weapon = { id: 'ft2', type: 'fangtian', name: '方天画戟', family: 'equipment', slot: 'weapon', range: 4 };
  // 多张手牌
  game.player.hand = [
    { id: 'sha-A', type: 'sha', name: '杀', suit: 'spade', color: 'black' },
    { id: 'extra-card', type: 'tao', name: '桃', suit: 'heart', color: 'red' }
  ];
  Engine.playCard(game, 'player', 'sha-A');
  assert.equal(game.player.flags.fangtianBonus, false, '不是最后一张 → 不触发');
});

test('v7 PR-15: 装备非方天 + 最后一张为杀 → 不触发', () => {
  const game = makeGame();
  game.player.equipment.weapon = { id: 'qg', type: 'qinggang', name: '青釭剑', family: 'equipment', slot: 'weapon', range: 2 };
  game.player.hand = [{ id: 'qg-sha', type: 'sha', name: '杀', suit: 'spade', color: 'black' }];
  Engine.playCard(game, 'player', 'qg-sha');
  assert.equal(game.player.flags.fangtianBonus, false, '非方天 → 不触发');
});

test('v7 PR-15: 1v1 中无额外目标可选 (功能 no-op, 触发标记但行为不变)', () => {
  const game = makeGame();
  game.player.equipment.weapon = { id: 'ft3', type: 'fangtian', name: '方天画戟', family: 'equipment', slot: 'weapon', range: 4 };
  game.player.hand = [{ id: 'noop-sha', type: 'sha', name: '杀', suit: 'spade', color: 'black' }];
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'noop-sha');
  // sha 仍只命中对手，1 点伤害
  assert.equal(game.enemy.hp, enemyHpBefore - 1);
  assert.equal(game.player.flags.fangtianBonus, true, '触发标记');
});

test('v7 PR-15: 多次 sha 同回合 — 每次进入 playSha 都重置 flag', () => {
  const game = makeGame();
  game.player.equipment.weapon = { id: 'ft4', type: 'fangtian', name: '方天画戟', family: 'equipment', slot: 'weapon', range: 4 };
  // 给一个不限次的方式：诸葛连弩 装备 — 但我们装的是方天。改用 paoxiao 跳过次数限制
  // 用 张飞 (咆哮) 角色 — 不再用 newGame 默认，直接装备 + 设 hp & flags
  // 简化方案: 加一张额外的 sha 让玩家可以连射；这需要 unlimited sha 能力
  // 此处用 player.usedSha = false 重置即可绕过 once-per-turn 限制（模拟咆哮）
  game.player.hand = [
    { id: 'shaA', type: 'sha', name: '杀', suit: 'spade', color: 'black' },
    { id: 'shaB', type: 'sha', name: '杀', suit: 'spade', color: 'black' }
  ];
  Engine.playCard(game, 'player', 'shaA');
  // 第一张时 hand.length=2 (含 shaB)，sha 使用后 hand.length=1 → 此时 != 0 → 不触发
  assert.equal(game.player.flags.fangtianBonus, false, '第一张时还有手牌 → 不触发');
  game.player.usedSha = false; // 模拟解除单次限制
  Engine.playCard(game, 'player', 'shaB');
  assert.equal(game.player.flags.fangtianBonus, true, '第二张是最后一张 → 触发');
});

test('v7 PR-15: 回合结束后 fangtianBonus 复位', () => {
  const game = makeGame();
  game.player.equipment.weapon = { id: 'ft5', type: 'fangtian', name: '方天画戟', family: 'equipment', slot: 'weapon', range: 4 };
  game.player.hand = [{ id: 'last-sha-eot', type: 'sha', name: '杀', suit: 'spade', color: 'black' }];
  Engine.playCard(game, 'player', 'last-sha-eot');
  assert.equal(game.player.flags.fangtianBonus, true);
  Engine.endTurn(game);
  assert.equal(game.player.flags.fangtianBonus, false, '回合结束复位');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
