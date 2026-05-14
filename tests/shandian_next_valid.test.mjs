import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function makeGame() {
  const game = Engine.newGame({ seed: 82, startWithFirstTurn: false });
  game.phase = 'play';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

function shandian(id, opts) {
  return Object.assign({ id, type: 'shandian', name: '闪电', family: 'delayed', suit: 'spade', color: 'black' }, opts || {});
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v7 PR-12: 闪电 非命中 → 移至对手判定区 (对手判定区为空)', () => {
  const game = makeGame();
  game.player.judgeArea.push(shandian('sd-move'));
  // 安全判定: 非黑桃 2-9 → 例如红桃 A
  game.deck = [{ id: 'safe-judge', type: 'tao', name: '桃', suit: 'heart', color: 'red', rank: 'A' }];
  game.turn = 'player';
  Engine.startTurn(game, 'player');
  assert.equal(game.player.judgeArea.length, 0, '闪电 离开 player 判定区');
  assert.equal(game.enemy.judgeArea.length, 1, '闪电 进 enemy 判定区');
  assert.equal(game.enemy.judgeArea[0].id, 'sd-move');
});

test('v7 PR-12: 闪电 非命中 + 对手判定区已有同名 → 留在自己 (spec next-of-next 回归)', () => {
  const game = makeGame();
  game.player.judgeArea.push(shandian('sd-loop'));
  // 对手判定区已经有一张 闪电（用一个独立 id 避免重复识别）
  game.enemy.judgeArea.push(shandian('sd-foe-existing'));
  // 安全判定
  game.deck = [{ id: 'safe-2', type: 'tao', name: '桃', suit: 'heart', color: 'red', rank: 'A' }];
  game.turn = 'player';
  Engine.startTurn(game, 'player');
  // 期望: sd-loop 留在 player 判定区（下家=对手非合法 → 下家的下家=自己）
  assert.ok(game.player.judgeArea.some((c) => c.id === 'sd-loop'),
    '对手已有同名 闪电，sd-loop 应回到自己判定区');
  // 对手原有的 sd-foe-existing 不变
  assert.ok(game.enemy.judgeArea.some((c) => c.id === 'sd-foe-existing'));
});

test('v7 PR-12: 闪电 命中 → 受 3 点雷电伤害，本牌不再留在判定区', () => {
  const game = makeGame();
  game.player.judgeArea.push(shandian('sd-hit'));
  const hpBefore = game.player.hp;
  // 命中: spade 2-9。补充足够的牌堆，避免 draw 阶段触发 reshuffle 把弃牌堆里的
  // 闪电洗回手牌（这是引擎正常行为；测试需要规避）
  game.deck = [
    { id: 'pad-1', type: 'tao', name: '桃', suit: 'heart', color: 'red', rank: '2' },
    { id: 'pad-2', type: 'tao', name: '桃', suit: 'heart', color: 'red', rank: '3' },
    { id: 'pad-3', type: 'tao', name: '桃', suit: 'heart', color: 'red', rank: '4' },
    { id: 'hit-judge', type: 'sha', name: '杀', suit: 'spade', color: 'black', rank: '5' }  // top
  ];
  game.turn = 'player';
  Engine.startTurn(game, 'player');
  assert.equal(game.player.hp, hpBefore - 3);
  assert.equal(game.player.judgeArea.length, 0, '闪电 离开判定区');
  // 闪电命中后按 spec 进弃牌堆 (discardTrick=true)
  assert.ok(game.discard.some((c) => c.id === 'sd-hit'),
    '命中后 闪电 进弃牌堆 (spec: 将此【闪电】置入弃牌堆)');
});

test('v7 PR-12: 闪电 在 enemy 判定区命中 → enemy 受伤', () => {
  const game = makeGame();
  game.enemy.judgeArea.push(shandian('sd-enemy'));
  const hpBefore = game.enemy.hp;
  game.deck = [
    { id: 'pad-a', type: 'tao', name: '桃', suit: 'heart', color: 'red', rank: '2' },
    { id: 'pad-b', type: 'tao', name: '桃', suit: 'heart', color: 'red', rank: '3' },
    { id: 'pad-c', type: 'tao', name: '桃', suit: 'heart', color: 'red', rank: '4' },
    { id: 'enemy-hit', type: 'sha', name: '杀', suit: 'spade', color: 'black', rank: '7' }
  ];
  game.turn = 'enemy';
  Engine.startTurn(game, 'enemy');
  assert.equal(game.enemy.hp, hpBefore - 3);
});

test('v7 PR-12: 闪电 在 enemy 判定区非命中 → 移回 player 判定区', () => {
  const game = makeGame();
  game.enemy.judgeArea.push(shandian('sd-from-enemy'));
  game.deck = [{ id: 'safe-from-enemy', type: 'tao', name: '桃', suit: 'heart', color: 'red', rank: 'K' }];
  game.turn = 'enemy';
  Engine.startTurn(game, 'enemy');
  assert.equal(game.enemy.judgeArea.length, 0);
  assert.ok(game.player.judgeArea.some((c) => c.id === 'sd-from-enemy'),
    '从对手判定区出发的安全 闪电 移到 player 判定区');
});

test('v7 PR-12: 闪电 在 enemy 非命中 + player 判定区已有同名 → 留在 enemy (loop)', () => {
  const game = makeGame();
  game.enemy.judgeArea.push(shandian('sd-stay-enemy'));
  game.player.judgeArea.push(shandian('sd-on-player'));
  game.deck = [{ id: 'safe-stay', type: 'tao', name: '桃', suit: 'heart', color: 'red', rank: '2' }];
  game.turn = 'enemy';
  Engine.startTurn(game, 'enemy');
  assert.ok(game.enemy.judgeArea.some((c) => c.id === 'sd-stay-enemy'),
    'player 已有同名 闪电 → sd-stay-enemy 应回到 enemy');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
