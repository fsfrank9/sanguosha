import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function makeGuoseGame() {
  // 大乔 (daqiao) 自带 guose 技能
  const game = Engine.newGame({ seed: 100, startWithFirstTurn: true, playerHero: 'daqiao', enemyHero: 'sunquan' });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

function diamondCard(id, type, name) {
  return { id, type: type || 'tao', name: name || '桃', suit: 'diamond', color: 'red', rank: '5' };
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v8 PR-C1: 大乔 + 方片牌 → canPlayCardAs(lebusishu) ok', () => {
  const game = makeGuoseGame();
  const card = diamondCard('diamond-tao', 'tao', '桃');
  game.player.hand.push(card);
  const result = Engine.canPlayCardAs(game, 'player', card, 'lebusishu');
  assert.equal(result.ok, true);
  assert.match(result.message, /国色/);
});

test('v8 PR-C1: 大乔 + 非方片牌 → canPlayCardAs(lebusishu) fail', () => {
  const game = makeGuoseGame();
  const heartTao = { id: 'heart-tao', type: 'tao', name: '桃', suit: 'heart', color: 'red', rank: '5' };
  game.player.hand.push(heartTao);
  const result = Engine.canPlayCardAs(game, 'player', heartTao, 'lebusishu');
  assert.equal(result.ok, false, '红桃不是方片 → 国色不触发');
});

test('v8 PR-C1: playCardAs(lebusishu) → 方片进对手判定区, 类型为乐, 源牌从手牌移除', () => {
  const game = makeGuoseGame();
  const card = diamondCard('p-diamond', 'wuzhong', '无中生有');
  game.player.hand.push(card);
  const result = Engine.playCardAs(game, 'player', 'p-diamond', 'lebusishu');
  assert.equal(result.ok, true);
  assert.equal(game.player.hand.length, 0, '源牌已从手牌移除');
  // 对手判定区有一张 lebusishu
  assert.equal(game.enemy.judgeArea.length, 1);
  const placed = game.enemy.judgeArea[0];
  assert.equal(placed.type, 'lebusishu');
  assert.equal(placed.name, '乐不思蜀');
  assert.equal(placed.family, 'delayed');
  // 物理 ID 和花色保留
  assert.equal(placed.id, 'p-diamond');
  assert.equal(placed.suit, 'diamond');
});

test('v8 PR-C1: 对手已有乐 → 国色再放 lebusishu canPlayCardAs 拒绝 (PR-6 同名禁叠)', () => {
  const game = makeGuoseGame();
  game.enemy.judgeArea.push({ id: 'existing-le', type: 'lebusishu', name: '乐不思蜀', family: 'delayed', suit: 'spade', color: 'black' });
  const card = diamondCard('second-le', 'tao', '桃');
  game.player.hand.push(card);
  const result = Engine.canPlayCardAs(game, 'player', card, 'lebusishu');
  assert.equal(result.ok, false, '同名禁叠 (PR-6) 仍生效');
});

test('v8 PR-C1: 非大乔角色 + 方片牌 → 不能用国色', () => {
  // 用刘备 (无国色技能)
  const game = Engine.newGame({ seed: 100, startWithFirstTurn: true, playerHero: 'liubei', enemyHero: 'sunquan' });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  const card = diamondCard('liubei-diamond', 'tao', '桃');
  game.player.hand.push(card);
  const result = Engine.canPlayCardAs(game, 'player', card, 'lebusishu');
  assert.equal(result.ok, false, '刘备无国色 → 不能转化');
});

test('v8 PR-C1: 大乔 仍可走 wuzhong 直接使用方片无中 (国色不影响原牌使用)', () => {
  const game = makeGuoseGame();
  game.deck = [
    { id: 'd1', type: 'sha', name: '杀', suit: 'spade', color: 'black' },
    { id: 'd2', type: 'sha', name: '杀', suit: 'spade', color: 'black' }
  ];
  const wuzhong = diamondCard('p-wz', 'wuzhong', '无中生有');
  game.player.hand.push(wuzhong);
  const result = Engine.playCard(game, 'player', 'p-wz');
  assert.equal(result.ok, true, '正常使用方片无中');
  assert.equal(game.player.hand.length, 2, '摸了 2 张牌');
});

test('v8 PR-C1: 大乔 + 方片sha → 国色 / 武圣?(她没武圣) → canPlayCardAs(sha) fail', () => {
  // 大乔无武圣, 方片杀 不能当 sha 转化 (她已经能直接出杀)
  const game = makeGuoseGame();
  const card = { id: 'diamond-sha', type: 'sha', name: '杀', suit: 'diamond', color: 'red', rank: '7' };
  game.player.hand.push(card);
  const result = Engine.canPlayCardAs(game, 'player', card, 'sha');
  assert.equal(result.ok, false, '大乔无 wusheng / longdan → 不能 card-as sha');
});

test('v8 PR-C1: 国色 触发后, lebusishu 判定流程仍正常 (非红桃 → 跳过 enemy 出牌阶段)', () => {
  const game = makeGuoseGame();
  const card = diamondCard('le-functional', 'tao', '桃');
  game.player.hand.push(card);
  Engine.playCardAs(game, 'player', 'le-functional', 'lebusishu');
  // 检查 enemy 判定区有 1 张 lebu
  assert.equal(game.enemy.judgeArea.length, 1);
  // 让 enemy 开始回合 → 判定 → 非红桃 → 跳过出牌阶段
  game.deck = [{ id: 'judge-spade', type: 'sha', name: '杀', suit: 'spade', color: 'black', rank: '7' }];
  Engine.startTurn(game, 'enemy');
  // 判定为黑桃 → enemy.flags.skipPlay 已设
  assert.equal(game.enemy.flags && game.enemy.flags.skipPlay, true);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
