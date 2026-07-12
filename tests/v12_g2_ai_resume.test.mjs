// v12 G2 修复回归 — runAITurn 同回合续跑不重启:
//   此前守卫 `game.turn !== actor || phase 不在 [prepare,judge,draw]` 会在
//   两种常见场景下重启整个回合 (resetActorTurnState + 重跑准备阶段):
//   (a) endTurn 内部已自动 startTurn 下一回合并推进到出牌阶段, 驱动方再调
//       runAITurn 时 phase==='play' → 重启 (准备阶段技能每回合双触发);
//   (b) 出牌阶段 pendingChoice 排空后按文档契约重调 runAITurn 续跑 → 重启
//       (加压测试实测: 神速向已死对手出杀崩溃 / 兵粮在途牌丢失)。
//   修复后: 仅当回合不属于该 actor 时才 startTurn, 同回合按阶段续跑。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function prepareCount(game, actor) {
  return (game.turnHistory || []).filter((e) => e.actor === actor && e.phase === 'prepare').length;
}

test('runAITurn: endTurn 已自动开启的同回合再调 → 不重启 (准备阶段不重复)', () => {
  const game = Engine.newGame({ seed: 424201, playerHero: 'liubei', enemyHero: 'diaochan', startWithFirstTurn: true });
  // 玩家回合直接结束 → completeTurn 自动 startTurn(enemy) 推进到 play
  Engine.finishPlayPhase(game);
  if (Engine.needsDiscard(game, 'player')) {
    Engine.discardSelected(game, 'player', game.player.hand.slice(0, Engine.getDiscardCount(game, 'player')).map((x) => x.id));
  }
  Engine.advancePhase(game);
  Engine.endTurn(game);
  assert.equal(game.turn, 'enemy', 'endTurn 已自动开启敌方回合');
  const preparesBefore = prepareCount(game, 'enemy');
  assert.equal(preparesBefore, 1, '敌方准备阶段已跑过一次');
  const handBefore = game.enemy.hand.length;
  assertCardConservation(game, () => Engine.runAITurn(game, 'enemy'));
  // 修复前: runAITurn 重启回合 → 第二次 prepare + 第二次摸牌阶段
  assert.equal(prepareCount(game, 'enemy'), 1, '同回合续跑不得重跑准备阶段');
  assert.ok(game.enemy.hand.length <= handBefore + 2 + 1, '摸牌阶段未双跑 (闭月在结束阶段另 +1)');
});

test('runAITurn: 出牌阶段暂停 → resolve → 再调续跑, 不重启且回合正常完成', () => {
  const game = Engine.newGame({ seed: 424202, playerHero: 'liubei', enemyHero: 'guanyu' });
  game.player.skillPreferences.shanResponse = 'ask';
  game.player.hand = [c('shan', { id: 'p-shan' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' }), c('sha', { id: 'e-sha2' })];
  game.deck = [];
  for (let i = 0; i < 12; i += 1) game.deck.push(c('sha', { id: `dk-${i}`, suit: 'diamond' }));
  const first = Engine.runAITurn(game, 'enemy');
  assert.equal(first.action, 'paused', 'AI 出杀被玩家 ask 闪暂停');
  assert.equal(game.pendingChoice.kind, 'shan-response');
  const prepares = prepareCount(game, 'enemy');
  Engine.resolvePendingChoice(game, { use: true, cardId: 'p-shan' });
  const resumed = assertCardConservation(game, () => Engine.runAITurn(game, 'enemy'));
  assert.equal(resumed.ok, true, resumed.message);
  assert.equal(prepareCount(game, 'enemy'), prepares, '续跑不得重跑准备阶段');
  assert.notEqual(game.turn === 'enemy' && game.phase === 'prepare', true, '回合未被重置回准备阶段');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
