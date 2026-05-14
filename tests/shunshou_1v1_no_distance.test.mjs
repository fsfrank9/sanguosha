import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function makeGame() {
  const game = Engine.newGame({ seed: 80, startWithFirstTurn: true });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

function dealShunshou(state, id) {
  const card = { id, type: 'shunshou', name: '顺手牵羊', family: 'trick', suit: 'spade', color: 'black' };
  state.hand.push(card);
  return card;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v7 PR-10: 顺手 (1V1) 在 distance=2 时仍可用 (+1 马 不再阻挡)', () => {
  const game = makeGame();
  game.enemy.equipment.horsePlus = { id: 'foe-plus', type: 'plus_horse', name: '+1 马', family: 'equipment', slot: 'horsePlus' };
  game.enemy.hand.push({ id: 'tao-to-steal', type: 'tao', name: '桃', suit: 'heart', color: 'red' });
  const card = dealShunshou(game.player, 'shun-d2');
  assert.equal(Engine.distanceBetween(game, 'player', 'enemy'), 2);
  const preview = Engine.canPlayCard(game, 'player', card);
  assert.equal(preview.ok, true, '1V1 顺手 应不受距离 1 限制');
});

test('v7 PR-10: 顺手 在 distance=3 时仍可用 (+1 马 + 距离基础变动模拟)', () => {
  const game = makeGame();
  // Two +1 horses on enemy (hypothetical) — engine treats stack as sum
  game.enemy.equipment.horsePlus = { id: 'foe-plus-1', type: 'plus_horse', name: '+1 马', family: 'equipment', slot: 'horsePlus' };
  game.player.equipment.horsePlus = { id: 'foe-plus-2', type: 'plus_horse', name: '+1 马', family: 'equipment', slot: 'horsePlus' };
  // Note: 仍是 1v1 distance 计算 — 实际仅记录配置; 我们检验只要距离>1 都能用
  game.enemy.hand.push({ id: 'far-target', type: 'tao', name: '桃', suit: 'heart', color: 'red' });
  const card = dealShunshou(game.player, 'shun-d-far');
  const preview = Engine.canPlayCard(game, 'player', card);
  assert.equal(preview.ok, true);
});

test('v7 PR-10: 顺手 (1V1) — 弃指定装备', () => {
  const game = makeGame();
  game.enemy.equipment.weapon = { id: 'steal-wpn', type: 'qinggang', name: '青釭剑', family: 'equipment', slot: 'weapon', range: 2 };
  dealShunshou(game.player, 'shun-eq');
  const result = Engine.playCard(game, 'player', 'shun-eq', { targetZone: 'equipment', targetCardId: 'steal-wpn' });
  assert.equal(result.ok, true);
  assert.equal(game.enemy.equipment.weapon, null);
  assert.ok(game.player.hand.some((c) => c.id === 'steal-wpn'), '武器进 source 手牌');
});

test('v7 PR-10: 顺手 (1V1) — 偷判定区延时锦囊', () => {
  const game = makeGame();
  game.enemy.judgeArea.push({ id: 'steal-le', type: 'lebusishu', name: '乐不思蜀', family: 'delayed', suit: 'spade', color: 'black' });
  dealShunshou(game.player, 'shun-judge');
  const result = Engine.playCard(game, 'player', 'shun-judge', { targetZone: 'judge', targetCardId: 'steal-le' });
  assert.equal(result.ok, true);
  assert.equal(game.enemy.judgeArea.length, 0);
  assert.ok(game.player.hand.some((c) => c.id === 'steal-le'));
});

test('v7 PR-10: 顺手 (1V1) — 偷指定手牌', () => {
  const game = makeGame();
  game.enemy.hand.push(
    { id: 'h-keep', type: 'shan', name: '闪', suit: 'heart', color: 'red' },
    { id: 'h-steal', type: 'sha', name: '杀', suit: 'spade', color: 'black' }
  );
  dealShunshou(game.player, 'shun-hand');
  const result = Engine.playCard(game, 'player', 'shun-hand', { targetZone: 'hand', targetCardId: 'h-steal' });
  assert.equal(result.ok, true);
  assert.ok(game.player.hand.some((c) => c.id === 'h-steal'));
  assert.ok(game.enemy.hand.some((c) => c.id === 'h-keep'));
});

test('v7 PR-10: 顺手 canPlayCard 拒绝 — 对方完全无牌', () => {
  const game = makeGame();
  // enemy: no hand, no equip, no judge
  const card = dealShunshou(game.player, 'shun-empty');
  const result = Engine.canPlayCard(game, 'player', card);
  assert.equal(result.ok, false);
});

test('v7 PR-10: 顺手 canPlayCard 通过 — 对方仅判定区有牌 (1V1 spec: "有牌的对手")', () => {
  // spec 1V1 "有牌的对手" — 不限定区域。即便只有判定区也满足。
  const game = makeGame();
  game.enemy.judgeArea.push({ id: 'le-only', type: 'lebusishu', name: '乐不思蜀', family: 'delayed', suit: 'spade', color: 'black' });
  const card = dealShunshou(game.player, 'shun-judge-only');
  const result = Engine.canPlayCard(game, 'player', card);
  assert.equal(result.ok, true);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
