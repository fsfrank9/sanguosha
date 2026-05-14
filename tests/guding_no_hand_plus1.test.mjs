import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function makeGame() {
  const game = Engine.newGame({ seed: 96, startWithFirstTurn: true, playerHero: 'liubei', enemyHero: 'sunquan' });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

function dealSha(state, id) {
  const card = { id, type: 'sha', name: '杀', suit: 'spade', color: 'black' };
  state.hand.push(card);
  return card;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v8 PR-B2: 古锭刀 + 目标无手牌 → 杀伤害 +1 (2 dmg)', () => {
  const game = makeGame();
  game.player.equipment.weapon = { id: 'gd-w', type: 'guding', name: '古锭刀', family: 'equipment', slot: 'weapon', range: 2 };
  // enemy 完全无手牌
  dealSha(game.player, 'gd-sha');
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'gd-sha');
  assert.equal(game.enemy.hp, enemyHpBefore - 2, '古锭刀 +1 → 2 dmg');
});

test('v8 PR-B2: 古锭刀 + 目标有手牌 → 普通 1 dmg', () => {
  const game = makeGame();
  game.player.equipment.weapon = { id: 'gd-w2', type: 'guding', name: '古锭刀', family: 'equipment', slot: 'weapon', range: 2 };
  // enemy 有手牌 (非闪)
  game.enemy.hand.push({ id: 'foe-tao', type: 'tao', name: '桃', suit: 'heart', color: 'red' });
  dealSha(game.player, 'gd-sha2');
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'gd-sha2');
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '有手牌 → 不触发 → 1 dmg');
});

test('v8 PR-B2: 古锭刀 + 无手牌 + 白银狮子 → baiyin clamp 回 1 dmg', () => {
  const game = makeGame();
  game.player.equipment.weapon = { id: 'gd-w3', type: 'guding', name: '古锭刀', family: 'equipment', slot: 'weapon', range: 2 };
  // enemy 无手牌 + 装备白银狮子
  game.enemy.equipment.armor = { id: 'foe-baiyin', type: 'baiyin', name: '白银狮子', family: 'equipment', slot: 'armor' };
  dealSha(game.player, 'gd-sha3');
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'gd-sha3');
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '古锭刀+baiyin 互动 → 2 dmg 被 baiyin 截到 1');
});

test('v8 PR-B2: 古锭刀 + 装备区有牌但手牌为空 → 触发 (spec 仅看"手牌")', () => {
  const game = makeGame();
  game.player.equipment.weapon = { id: 'gd-w4', type: 'guding', name: '古锭刀', family: 'equipment', slot: 'weapon', range: 2 };
  // enemy 手牌 0, 但装备区有牌
  game.enemy.equipment.horseMinus = { id: 'foe-horse', type: 'minus_horse', name: '-1 马', family: 'equipment', slot: 'horseMinus' };
  dealSha(game.player, 'gd-sha4');
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'gd-sha4');
  assert.equal(game.enemy.hp, enemyHpBefore - 2, 'spec 只看 hand.length, 装备区不算 → +1 触发');
});

test('v8 PR-B2: 古锭刀 + 判定区有牌但手牌为空 → 触发', () => {
  const game = makeGame();
  game.player.equipment.weapon = { id: 'gd-w5', type: 'guding', name: '古锭刀', family: 'equipment', slot: 'weapon', range: 2 };
  game.enemy.judgeArea.push({ id: 'foe-lebu', type: 'lebusishu', name: '乐不思蜀', family: 'delayed', suit: 'spade', color: 'black' });
  dealSha(game.player, 'gd-sha5');
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'gd-sha5');
  assert.equal(game.enemy.hp, enemyHpBefore - 2);
});

test('v8 PR-B2: 非杀类伤害 (e.g. 闪电) → 不触发古锭刀', () => {
  const game = makeGame();
  game.player.equipment.weapon = { id: 'gd-w6', type: 'guding', name: '古锭刀', family: 'equipment', slot: 'weapon', range: 2 };
  // 给 player 自己装闪电, 模拟受到 闪电 雷电伤害
  game.player.judgeArea.push({ id: 'shandian-self', type: 'shandian', name: '闪电', family: 'delayed', suit: 'spade', color: 'black' });
  game.deck = [
    { id: 'pad-1', type: 'tao', name: '桃', suit: 'heart', color: 'red', rank: '2' },
    { id: 'pad-2', type: 'tao', name: '桃', suit: 'heart', color: 'red', rank: '3' },
    { id: 'pad-3', type: 'tao', name: '桃', suit: 'heart', color: 'red', rank: '4' },
    { id: 'hit', type: 'sha', name: '杀', suit: 'spade', color: 'black', rank: '5' }
  ];
  game.turn = 'player';
  // 注: 古锭刀 +1 condition 是 "你使用【杀】对目标"; 闪电 sourceCard 是闪电不是 杀 → 不触发
  // 玩家自己当 target 受 3 点雷电伤害 (player.hand 为 0 但 sourceCard 非杀)
  const playerHpBefore = game.player.hp;
  Engine.startTurn(game, 'player');
  assert.equal(game.player.hp, playerHpBefore - 3, '闪电 3 dmg, 不触发古锭刀+1 (sourceCard 非杀)');
});

test('v8 PR-B2: 锁定技 — 无 skillPreferences 钩子可关', () => {
  // 古锭刀 是锁定技, 即便 decline 也应触发
  const game = makeGame();
  game.player.equipment.weapon = { id: 'gd-w7', type: 'guding', name: '古锭刀', family: 'equipment', slot: 'weapon', range: 2 };
  game.player.skillPreferences.guding = 'decline'; // 不应被读取
  dealSha(game.player, 'gd-sha7');
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'gd-sha7');
  assert.equal(game.enemy.hp, enemyHpBefore - 2, '锁定技 不能被 skillPreferences 关闭');
});

test('v8 PR-B2: 非古锭刀武器 + 无手牌 → 不触发', () => {
  const game = makeGame();
  game.player.equipment.weapon = { id: 'qg-w', type: 'qinggang', name: '青釭剑', family: 'equipment', slot: 'weapon', range: 2 };
  dealSha(game.player, 'qg-sha');
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'qg-sha');
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '非古锭刀 → 不+1');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
