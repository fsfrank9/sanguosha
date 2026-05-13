import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function makeGame() {
  const game = Engine.newGame({ seed: 76, startWithFirstTurn: true });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

function deal(state, type, id, name) {
  const card = { id, type, name, family: 'delayed', suit: 'spade', color: 'black' };
  state.hand.push(card);
  return card;
}

function judgeAreaPush(state, type, id, name) {
  const card = { id, type, name, family: 'delayed', suit: 'spade', color: 'black' };
  state.judgeArea.push(card);
  return card;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v7 PR-6: 乐不思蜀 — opponent 判定区已有 乐 → canPlayCard 拒绝', () => {
  const game = makeGame();
  judgeAreaPush(game.enemy, 'lebusishu', 'le-existing', '乐不思蜀');
  const card = deal(game.player, 'lebusishu', 'le-attempt', '乐不思蜀');
  const result = Engine.canPlayCard(game, 'player', card);
  assert.equal(result.ok, false);
  assert.match(result.message, /已有/);
});

test('v7 PR-6: 兵粮寸断 — opponent 判定区已有 兵粮 → canPlayCard 拒绝', () => {
  const game = makeGame();
  judgeAreaPush(game.enemy, 'bingliang', 'bl-existing', '兵粮寸断');
  const card = deal(game.player, 'bingliang', 'bl-attempt', '兵粮寸断');
  const result = Engine.canPlayCard(game, 'player', card);
  assert.equal(result.ok, false);
  assert.match(result.message, /已有/);
});

test('v7 PR-6: 闪电 — 发动者判定区已有 闪电 → canPlayCard 拒绝', () => {
  const game = makeGame();
  judgeAreaPush(game.player, 'shandian', 'sd-existing', '闪电');
  const card = deal(game.player, 'shandian', 'sd-attempt', '闪电');
  const result = Engine.canPlayCard(game, 'player', card);
  assert.equal(result.ok, false);
  assert.match(result.message, /已有/);
});

test('v7 PR-6: 乐不思蜀 — opponent 判定区有 兵粮（异名）→ 通过', () => {
  const game = makeGame();
  judgeAreaPush(game.enemy, 'bingliang', 'bl-other', '兵粮寸断');
  const card = deal(game.player, 'lebusishu', 'le-ok', '乐不思蜀');
  const result = Engine.canPlayCard(game, 'player', card);
  assert.equal(result.ok, true, '同判定区不同名延时锦囊允许并存');
});

test('v7 PR-6: 闪电 — opponent 判定区有 闪电 而 self 没有 → 通过', () => {
  // 闪电 的目标是 self，所以 opponent 判定区有 闪电 不应阻止
  const game = makeGame();
  judgeAreaPush(game.enemy, 'shandian', 'sd-foe', '闪电');
  const card = deal(game.player, 'shandian', 'sd-self', '闪电');
  const result = Engine.canPlayCard(game, 'player', card);
  assert.equal(result.ok, true, '闪电 的目标是 self；opponent 持有同名不阻止');
});

test('v7 PR-6: opponent 判定区为空 → 乐不思蜀 通过 (基线)', () => {
  const game = makeGame();
  const card = deal(game.player, 'lebusishu', 'le-baseline', '乐不思蜀');
  assert.equal(Engine.canPlayCard(game, 'player', card).ok, true);
  // 真正放进去后再尝试同名应被拒
  Engine.playCard(game, 'player', 'le-baseline');
  const second = deal(game.player, 'lebusishu', 'le-second', '乐不思蜀');
  const result = Engine.canPlayCard(game, 'player', second);
  assert.equal(result.ok, false, '已经放过一张乐 → 第二张被拒');
});

test('v7 PR-6: AI 选牌 (aiChooseCard) 不会选已经存在同名延时锦囊的目标', () => {
  // 给 AI 一张 乐不思蜀，但 player 判定区已有 乐 → AI 选不到
  const game = makeGame();
  game.turn = 'enemy';
  judgeAreaPush(game.player, 'lebusishu', 'le-on-player', '乐不思蜀');
  const aiAttempt = deal(game.enemy, 'lebusishu', 'le-ai-try', '乐不思蜀');
  // canPlayCard for enemy → opponent (player) judge area has 乐 → 拒绝
  const result = Engine.canPlayCard(game, 'enemy', aiAttempt);
  assert.equal(result.ok, false);
});

test('v7 PR-6: 弃置后判定区清空 → 同名延时锦囊可重新放置', () => {
  const game = makeGame();
  judgeAreaPush(game.enemy, 'lebusishu', 'le-then-cleared', '乐不思蜀');
  const card = deal(game.player, 'lebusishu', 'le-replacement', '乐不思蜀');
  // 模拟旧的乐被结算/弃置
  game.enemy.judgeArea = [];
  const result = Engine.canPlayCard(game, 'player', card);
  assert.equal(result.ok, true, '判定区清空后可以重新放置');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
