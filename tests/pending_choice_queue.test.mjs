import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

// 审计二轮 H2/H3/M6 — pendingChoice 暂停/恢复架构闭环:
//   H3: pendingChoice 单槽无队列, 杀致濒死 (dying-rescue) 后麒麟弓 (qilin-pick)
//       直接覆盖 → pauseState.dying 永久泄漏, 游戏软死锁。
//   H2: 判定阶段【闪电】命中致濒死时回合流程不冻结, 濒死角色照常摸牌行动。
//   M6: pendingChoice 挂起时可 endTurn / 继续出牌, 甚至跨回合 resolve。

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function makeGame(playerHero = 'liubei', enemyHero = 'sunquan') {
  const game = Engine.newGame({ seed: 97, startWithFirstTurn: true, playerHero, enemyHero });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('H3: 杀致濒死 + 麒麟弓双马 → dying-rescue 不被覆盖, qilin-pick 入队依次解决', () => {
  const game = makeGame();
  game.player.equipment.weapon = c('qilin', { id: 'ql-w' });
  game.enemy.equipment.horseMinus = c('minus_horse', { id: 'foe-hm' });
  game.enemy.equipment.horsePlus = c('plus_horse', { id: 'foe-hp' });
  game.enemy.hp = 1;
  game.enemy.hand = [c('tao', { id: 'foe-tao' })];
  game.player.hand = [c('sha', { id: 'atk-sha' }), c('tao', { id: 'p-tao' })];

  const result = Engine.playCard(game, 'player', 'atk-sha');
  assert.equal(result.ok, true);
  // 濒死求桃在前 (player 是首位响应者且默认 ask), 麒麟弓入队不覆盖
  assert.equal(game.pendingChoice.kind, 'dying-rescue', '当前选择是濒死救援');
  assert.equal(game.pendingChoiceQueue.length, 1, '麒麟弓选择已入队');
  assert.equal(game.pendingChoiceQueue[0].kind, 'qilin-pick');

  // player 不救 → enemy 自动用桃自救 → 濒死结束 → 队列弹出 qilin-pick
  const declined = Engine.resolvePendingChoice(game, { decline: true });
  assert.equal(declined.ok, true);
  assert.equal(game.enemy.hp, 1, 'enemy 用桃自救回到 1');
  assert.equal(game.pendingChoice.kind, 'qilin-pick', '队列中的麒麟弓选择弹出');
  assert.equal(game.pauseState.dying, null, '濒死 pauseState 无泄漏');

  const picked = Engine.resolvePendingChoice(game, { slot: 'horsePlus' });
  assert.equal(picked.ok, true);
  assert.equal(game.enemy.equipment.horsePlus, null, '+1 马被弃置');
  assert.equal(game.pendingChoice, null, '所有选择解决完毕');
  assert.notEqual(game.phase, 'gameover', '游戏未死锁未误判结束');
});

test('H2: 判定阶段闪电命中致濒死 → 冻结回合 (不摸牌), 救活后续跑摸牌/出牌', () => {
  const game = makeGame();
  game.enemy.hp = 2;
  game.enemy.judgeArea = [c('shandian', { id: 'ld-1' })];
  // deck.pop 顺序: 判定牌(黑桃5 → 闪电命中 3 dmg) 先出, 之后 d2/d1 供摸牌
  game.deck = [
    c('shan', { id: 'd1', suit: 'club' }),
    c('shan', { id: 'd2', suit: 'club' }),
    c('sha', { id: 'judge-spade-5', suit: 'spade', rank: '5' })
  ];
  game.player.hand = [c('tao', { id: 'rescue-1' }), c('tao', { id: 'rescue-2' })];

  Engine.endTurn(game); // player 结束 → enemy 回合开始 → 判定阶段闪电命中
  assert.equal(game.enemy.hp, -1, '闪电 3 dmg → hp -1');
  assert.equal(game.pendingChoice.kind, 'dying-rescue', '等待 player 救援');
  // H2 核心: 濒死未结算完毕, enemy 不得摸牌进入出牌阶段
  assert.equal(game.enemy.hand.length, 0, '濒死挂起期间 enemy 没有摸牌');
  assert.notEqual(game.phase, 'play', '回合流程被冻结在判定阶段');

  // 连续两张桃救回到 1 (hp -1 → 0 → 1)
  const first = Engine.resolvePendingChoice(game, { cardId: 'rescue-1' });
  assert.equal(first.ok, true);
  assert.equal(game.enemy.hp, 0);
  assert.equal(game.pendingChoice.kind, 'dying-rescue', '未回到 1 点, 继续求桃');
  const second = Engine.resolvePendingChoice(game, { cardId: 'rescue-2' });
  assert.equal(second.ok, true);
  assert.equal(game.enemy.hp, 1, '救回 1 点脱离濒死');
  // 濒死结算完毕 → 回合流程续跑: 摸牌 + 进入出牌阶段
  assert.equal(game.pendingChoice, null);
  assert.equal(game.enemy.hand.length, 2, '濒死结束后才执行摸牌阶段');
  assert.equal(game.phase, 'play', '回合续跑到出牌阶段');
  assert.equal(game.pauseState.judgeArea, null, '判定区挂起快照已清理');
  assert.equal(game.pauseState.dying, null, '濒死 pauseState 无泄漏');
});

test('H2: 判定阶段闪电直接致死 → 游戏正常结束 (不续跑回合)', () => {
  const game = makeGame();
  game.enemy.hp = 2;
  game.enemy.judgeArea = [c('shandian', { id: 'ld-die' })];
  game.deck = [c('sha', { id: 'judge-die', suit: 'spade', rank: '5' })];
  game.player.hand = []; // 无人能救

  Engine.endTurn(game);
  assert.equal(game.phase, 'gameover');
  assert.equal(game.winner, 'player');
  assert.equal(game.pendingChoice, null);
});

test('M6: pendingChoice 挂起时 endTurn / playCard / useSkill 被冻结, 解决后放行', () => {
  const game = makeGame();
  game.player.hand = [c('guohe', { id: 'gh-1' }), c('sha', { id: 'extra-sha' })];
  game.enemy.hand = [c('shan', { id: 'foe-shan' })];

  const played = Engine.playCard(game, 'player', 'gh-1');
  assert.equal(played.ok, true);
  assert.equal(game.pendingChoice.kind, 'guohe-1v1-pick');

  // 挂起期间一切推进入口被冻结
  assert.equal(Engine.endTurn(game).ok, false, 'endTurn 被冻结');
  assert.equal(Engine.playCard(game, 'player', 'extra-sha').ok, false, 'playCard 被冻结');
  assert.equal(Engine.advancePhase(game).ok, false, 'advancePhase 被冻结');
  assert.equal(Engine.finishPlayPhase(game).ok, false, 'finishPlayPhase 被冻结');
  assert.equal(game.enemy.hand.length, 1, '冻结期间对方手牌未被动过');

  const resolved = Engine.resolvePendingChoice(game, { zone: 'hand', cardId: 'foe-shan' });
  assert.equal(resolved.ok, true);
  assert.equal(game.enemy.hand.length, 0, '解决后弃置生效');
  assert.equal(Engine.endTurn(game).ok, true, '解决后 endTurn 放行');
});

test('M6: AI 出杀等待玩家闪响应时, aiTakeAction/runAITurn 暂停而非继续行动', () => {
  const game = makeGame();
  game.turn = 'enemy';
  game.player.skillPreferences.shanResponse = 'ask';
  game.player.hand = [c('shan', { id: 'p-shan' })];
  game.enemy.hand = [c('sha', { id: 'ai-sha-1' }), c('sha', { id: 'ai-sha-2' })];

  const played = Engine.playCard(game, 'enemy', 'ai-sha-1');
  assert.equal(played.ok, true);
  assert.equal(game.pendingChoice.kind, 'shan-response');

  const aiAction = Engine.aiTakeAction(game, 'enemy');
  assert.equal(aiAction.ok, true);
  assert.equal(aiAction.action, 'paused', 'AI 行动暂停等待玩家');
  assert.equal(game.enemy.hand.length, 1, 'AI 没有继续出第二张杀');

  const resolved = Engine.resolvePendingChoice(game, { cardId: 'p-shan' });
  assert.equal(resolved.ok, true);
  assert.equal(game.pendingChoice, null);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
