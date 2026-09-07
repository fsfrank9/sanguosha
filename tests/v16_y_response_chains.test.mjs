import assert from 'node:assert/strict';
import { Engine, c, CardRuntime } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

const red = (type, id) => c(type, { id, suit: 'heart', color: 'red', rank: '6' });
const black = (type, id) => c(type, { id, suit: 'spade', color: 'black', rank: '6' });
function gameFor(playerHero = 'liubei', enemyHero = 'sunquan', third = null) {
  const cfg = { seed: 160001, playerHero, enemyHero };
  if (third) Object.assign(cfg, { seats: ['player', 'enemy', 'ally'],
    roles: { player: '主公', enemy: '反贼', ally: '忠臣' }, allyHero: third });
  const game = Engine.newGame(cfg);
  for (const actor of game.seats) {
    Object.assign(game[actor], { hand: [], judgeArea: [], flags: {},
      equipment: { weapon: null, armor: null, horseMinus: null, horsePlus: null },
      hp: game[actor].maxHp, skillPreferences: { dying: 'decline', guicai: 'decline', guidao: 'decline' } });
  }
  Object.assign(game, { turn: 'player', phase: 'play', pendingChoice: null, pendingChoiceQueue: [],
    pauseState: {}, log: [], discard: [], deck: Array.from({ length: 20 }, (_, i) => red('tao', 'deck-' + i)) });
  return game;
}
function settle(game, decision = { decline: true, use: false, challenge: false }) {
  assert.ok(game.pendingChoice, 'has a real pending decision');
  assertCardConservation(game, () => {
    const result = Engine.resolvePendingChoice(game, decision);
    assert.equal(result.ok, true, result.message);
  });
}
function drained(game) {
  assert.equal(game.pendingChoice, null);
  assert.equal((game.pendingChoiceQueue || []).length, 0);
  assert.equal((game.pauseState.responseFlows || []).length, 0, 'all response frames drained');
  for (const key of ['shaResponseFlow', 'duelChain', 'aoe', 'wuxieChain', 'dying', 'guhuoResponse']) {
    assert.ok(!game.pauseState[key], key + ' is clear');
  }
}

for (const pref of ['auto', 'ask']) {
  test('Y1 双闪 ' + pref + ': 每张闪后的雷击先结算，后续闪不提前支付', () => {
    const game = gameFor('zhangjiao', 'lvbu');
    game.turn = 'enemy';
    Object.assign(game.player.skillPreferences, { shanResponse: pref, leiji: 'ask' });
    game.enemy.hand = [red('sha', 'attack')];
    game.player.hand = [red('shan', 'first'), red('shan', 'second')];
    assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'attack'));
    if (pref === 'ask') settle(game, { cardId: 'first' });
    assert.equal(game.pendingChoice.kind, 'leiji-ask');
    assert.deepEqual(game.player.hand.map(card => card.id), ['second']);
    assert.equal(game.pauseState.shaResponseFlow.shanRemaining, 1);
    assert.ok(!game.discard.some(card => card.id === 'attack'));
    settle(game);
    if (pref === 'ask') {
      assert.equal(game.pendingChoice.kind, 'shan-response');
      settle(game, { cardId: 'second' });
    }
    assert.equal(game.pendingChoice.kind, 'leiji-ask');
    settle(game);
    assert.equal(game.player.hp, game.player.maxHp);
    assert.equal(game.discard.filter(card => card.id === 'attack').length, 1);
    drained(game);
  });
  test('Y1 双闪 ' + pref + ': 雷击终局后保留第二张闪并清理在途杀', () => {
    const game = gameFor('zhangjiao', 'lvbu');
    game.turn = 'enemy'; game.enemy.hp = 1;
    Object.assign(game.player.skillPreferences, { shanResponse: pref, leiji: 'ask' });
    game.enemy.hand = [red('sha', 'attack')];
    game.player.hand = [red('shan', 'first'), red('shan', 'second')];
    game.deck.push(black('sha', 'leiji-spade'));
    Engine.playCard(game, 'enemy', 'attack');
    if (pref === 'ask') settle(game, { cardId: 'first' });
    settle(game, { target: 'enemy' });
    assert.equal(game.phase, 'gameover');
    assert.ok(game.player.hand.some(card => card.id === 'second'));
    assert.equal(game.discard.filter(card => card.id === 'attack').length, 1);
    drained(game);
  });
}

test('Y1 肉林：女性响应者的双闪也在雷击窗口停机', () => {
  const game = gameFor('zhangjiao', 'dongzhuo');
  game.player.gender = 'female'; game.turn = 'enemy';
  Object.assign(game.player.skillPreferences, { leiji: 'ask' });
  game.player.hand = [red('shan', 'one'), red('shan', 'two')];
  game.enemy.hand = [red('sha', 'attack')];
  Engine.playCard(game, 'enemy', 'attack');
  assert.equal(game.pendingChoice.kind, 'leiji-ask');
  assert.equal(game.player.hand.length, 1);
  settle(game); settle(game);
  assert.equal(game.player.hp, game.player.maxHp);
  drained(game);
});

test('Y1 八卦：第二次判定必须等待第一次视为闪的雷击结束', () => {
  const game = gameFor('zhangjiao', 'lvbu');
  game.turn = 'enemy'; game.player.skillPreferences.leiji = 'ask';
  game.player.equipment.armor = c('bagua', { id: 'armor' });
  game.enemy.hand = [red('sha', 'attack')];
  const deckBefore = game.deck.length;
  Engine.playCard(game, 'enemy', 'attack');
  assert.equal(game.pendingChoice.kind, 'leiji-ask');
  assert.equal(game.deck.length, deckBefore - 1);
  settle(game);
  assert.equal(game.deck.length, deckBefore - 2);
  assert.equal(game.pendingChoice.kind, 'leiji-ask');
  settle(game); drained(game);
});

test('Y1 双闪：雷击引出的铁索传导与救援全部结束后才消费第二张闪', () => {
  const game = gameFor('zhangjiao', 'lvbu', 'sunquan');
  game.turn = 'enemy';
  for (const actor of game.seats) game[actor].chained = true;
  game.ally.hp = 1;
  Object.assign(game.player.skillPreferences, { leiji: 'ask', dying: 'ask' });
  game.player.hand = [red('shan', 'first'), red('shan', 'second'), red('tao', 'rescue')];
  game.enemy.hand = [red('sha', 'attack')];
  game.deck.push(black('sha', 'leiji-spade'));
  Engine.playCard(game, 'enemy', 'attack');
  settle(game, { target: 'enemy' });
  assert.equal(game.pendingChoice.kind, 'dying-rescue');
  assert.equal(game.pendingChoice.dyingActor, 'ally');
  assert.equal(game.player.hp, game.player.maxHp, 'last chained seat has not been damaged yet');
  assert.ok(game.player.hand.some(card => card.id === 'second'));
  settle(game, { use: true, cardId: 'rescue' });
  assert.equal(game.player.hp, game.player.maxHp - 1, 'finish the inner chain before a second Shan / Leiji');
  assert.equal(game.pauseState.chainTransmit, null);
  assert.equal(game.pendingChoice.kind, 'leiji-ask');
  settle(game);
  drained(game);
});

for (const type of ['sha', 'juedou', 'wanjian', 'nanman']) {
  for (const challenge of [false, true]) {
    test('Y3 AI ' + type + ': ' + (challenge ? '验假后自动恢复失败响应' : '放弃质疑后正常响应'), () => {
      const game = gameFor('liubei', 'yuji');
      // Keep this a response-card test: no AI nullification before the named effect.
      if (type !== 'sha') game.enemy.skillPreferences.wuxieResponse = 'decline';
      game.player.hand = [red(type, 'attack')];
      game.enemy.hand = [red('wuzhong', 'cover')];
      const hp = game.enemy.hp;
      assertCardConservation(game, () => Engine.playCard(game, 'player', 'attack', { target: 'enemy' }));
      assert.equal(game.pendingChoice.kind, 'guhuo-challenge');
      assert.equal(game.pauseState.guhuo.declareType, type === 'sha' || type === 'wanjian' ? 'shan' : 'sha');
      assert.equal(game.enemy.hp, hp);
      settle(game, { challenge });
      assert.equal(game.enemy.hp, hp - (challenge ? 1 : 0));
      assert.ok(game.enemy.flags.guhuoUsedThisTurn);
      assert.equal(game.discard.filter(card => card.id === 'cover').length, 1);
      drained(game);
    });
  }
}

for (const challenge of [false, true]) {
  test('Y3 AI 无懈：质疑' + challenge + '后奇偶状态与锦囊结果一致', () => {
    const game = gameFor('liubei', 'yuji');
    game.player.hand = [red('juedou', 'attack')]; game.enemy.hand = [red('wuzhong', 'cover')];
    Engine.playCard(game, 'player', 'attack');
    assert.equal(game.pendingChoice.kind, 'guhuo-challenge');
    assert.equal(game.pauseState.guhuo.declareType, 'wuxie');
    settle(game, { challenge });
    assert.equal(game.enemy.hp, game.enemy.maxHp - (challenge ? 1 : 0));
    drained(game);
  });
}

test('Y3 AI 蛊惑不覆盖可正常使用的响应牌', () => {
  const game = gameFor('liubei', 'yuji');
  game.player.hand = [red('sha', 'attack')]; game.enemy.hand = [red('shan', 'native'), red('wuzhong', 'cover')];
  Engine.playCard(game, 'player', 'attack');
  assert.ok(!game.enemy.flags.guhuoUsedThisTurn);
  assert.deepEqual(game.enemy.hand.map(card => card.id), ['cover']);
  drained(game);
});

test('Y3 限次：双闪第一张蛊惑抵消后，第二张不足仍命中且不重开质疑', () => {
  const game = gameFor('lvbu', 'yuji');
  game.player.hand = [red('sha', 'attack')]; game.enemy.hand = [red('wuzhong', 'cover'), red('tao', 'keep')];
  Engine.playCard(game, 'player', 'attack');
  settle(game, { challenge: false });
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
  assert.equal(game.enemy.hand.length, 1);
  drained(game);
});

test('Y3 AI 声明只取自身手牌：替换对手隐藏手牌不会改变盖置选择', () => {
  function choose(hidden) {
    const game = gameFor('liubei', 'yuji');
    game.hiddenRoles = true;
    game.player.hand = [red('sha', 'attack'), red(hidden, 'hidden')];
    game.enemy.hand = [red('wuzhong', 'cover-a'), red('juedou', 'cover-b')];
    Engine.playCard(game, 'player', 'attack');
    return [game.pauseState.guhuo.physical.id, game.pauseState.guhuo.declareType];
  }
  assert.deepEqual(choose('tao'), choose('shan'));
});

for (const challenge of [false, true]) {
  test('Y3 AI 濒死自救：' + challenge + '质疑决定后才救活或死亡', () => {
    const game = gameFor('liubei', 'yuji');
    game.enemy.hp = 1;
    game.enemy.skillPreferences.dying = 'auto';
    game.player.hand = [red('sha', 'attack')];
    game.enemy.hand = [red('wuzhong', 'cover')];
    // 铁骑锁响应 avoids consuming the turn's guhuo quota on 闪.
    game.player.skills.push({ id: 'liegong' });
    game.player.hp = 4;
    Engine.playCard(game, 'player', 'attack');
    assert.equal(game.pendingChoice.kind, 'guhuo-challenge');
    assert.equal(game.pauseState.guhuo.declareType, 'tao');
    assert.equal(game.enemy.hp, 0);
    settle(game, { challenge });
    assert.equal(game.enemy.hp, challenge ? 0 : 1);
    assert.equal(game.phase === 'gameover', challenge);
    drained(game);
  });
}

test('Y1 AOE：当前座席雷击挂起时后续座席不受伤', () => {
  const game = gameFor('zhangjiao', 'sunquan', 'liubei');
  game.turn = 'ally'; game.player.skillPreferences.leiji = 'ask';
  game.player.hand = [red('shan', 'respond')]; game.ally.hand = [red('wanjian', 'attack')];
  Engine.playCard(game, 'ally', 'attack');
  assert.equal(game.pendingChoice.kind, 'leiji-ask');
  assert.equal(game.enemy.hp, game.enemy.maxHp);
  settle(game);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
  drained(game);
});

test('Y1 决斗：第一张杀触发银月时第二张杀不提前消费', () => {
  const game = gameFor('lvbu', 'sunquan');
  game.player.hand = [red('juedou', 'attack'), red('shan', 'defend')];
  game.player.skillPreferences.shanResponse = 'ask';
  game.enemy.hand = [black('sha', 'first'), red('sha', 'second')];
  game.enemy.equipment.weapon = c('yinyue', { id: 'weapon' });
  Engine.playCard(game, 'player', 'attack');
  assert.equal(game.pendingChoice.kind, 'yinyue-response');
  assert.deepEqual(game.enemy.hand.map(card => card.id), ['second']);
  assert.equal(game.pauseState.duelChain.resumePaid, 1);
  settle(game, { cardId: 'defend' });
  assert.equal(game.player.hp, game.player.maxHp - 1, '只受到决斗失败的一次伤害');
  drained(game);
});

test('Y1 无懈：银月插入结算完成前不推进反无懈询问', () => {
  const game = gameFor('liubei', 'sunquan');
  Object.assign(game.player.skillPreferences, { shanResponse: 'ask', wuxieResponse: 'ask' });
  game.player.hand = [red('juedou', 'attack'), red('shan', 'defend'), black('wuxie', 'counter')];
  game.enemy.hand = [black('wuxie', 'nullify')];
  game.enemy.equipment.weapon = c('yinyue', { id: 'weapon' });
  Engine.playCard(game, 'player', 'attack');
  assert.equal(game.pendingChoice.kind, 'yinyue-response');
  assert.equal(game.pendingChoiceQueue.length, 0, '反无懈窗口尚未产生');
  settle(game, { cardId: 'defend' });
  assert.equal(game.pendingChoice.kind, 'wuxie-response');
  settle(game, { use: false });
  assert.equal(game.enemy.hp, game.enemy.maxHp);
  drained(game);
});

test('Y4 队列：借刀杀先消耗闪，之后银月窗口刷新候选', () => {
  const game = gameFor('liubei', 'sunquan');
  game.player.skillPreferences.shanResponse = 'ask';
  game.player.hand = [red('jiedao', 'attack'), red('shan', 'only-shan')];
  game.enemy.hand = [black('sha', 'borrowed')]; game.enemy.equipment.weapon = c('yinyue', { id: 'weapon' });
  Engine.playCard(game, 'player', 'attack', { target: 'enemy' });
  assert.equal(game.pendingChoice.kind, 'shan-response');
  assert.equal(game.pendingChoiceQueue[0].kind, 'yinyue-response');
  settle(game, { cardId: 'only-shan' });
  assert.equal(game.pendingChoice.kind, 'yinyue-response');
  assert.deepEqual(game.pendingChoice.options, []);
  settle(game);
  assert.equal(game.player.hp, game.player.maxHp - 1);
  drained(game);
});

test('Y4 同 kind 排队：每个银月窗口保留自己的伤害来源', () => {
  const game = gameFor('liubei', 'sunquan', 'caocao');
  for (const holderActor of ['enemy', 'ally']) Engine.requestPlayerResponse(game, {
    kind: 'yinyue-response', actor: 'player', pauseKey: 'yinyueResponse',
    source: { holderActor }, options: []
  });
  settle(game);
  assert.equal(game.player.hp, game.player.maxHp - 1);
  assert.equal(game.pendingChoice.responseContext.source.holderActor, 'ally');
  settle(game);
  assert.equal(game.player.hp, game.player.maxHp - 2);
  drained(game);
});

for (const type of ['wanjian', 'nanman']) {
  test('Y4 帷幕 ' + type + '：目标红颜不改变外来黑色锦囊的合法性', () => {
    const game = gameFor('liubei', 'jiaxu');
    game.enemy.skills.push({ id: 'hongyan' });
    game.player.hand = [black(type, 'attack')];
    Engine.playCard(game, 'player', 'attack');
    assert.equal(game.enemy.hp, game.enemy.maxHp);
    assert.equal(game.pendingChoice, null);
  });
}

test('Y4 帷幕反例：实际红色 AOE 仍生效', () => {
  const game = gameFor('liubei', 'jiaxu');
  game.player.hand = [red('wanjian', 'attack')];
  Engine.playCard(game, 'player', 'attack');
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
});

test('Y4 武圣：借刀二次拒绝先归还红武器原槽，再正确交给使用者', () => {
  const game = gameFor('guanyu', 'zhugeliang');
  game.turn = 'enemy'; game.player.skillPreferences.jiedao = 'ask';
  game.enemy.hand = [red('jiedao', 'attack'), red('tao', 'kc-pad')];
  game.player.equipment.weapon = red('qinglong', 'red-weapon');
  Engine.playCard(game, 'enemy', 'attack', { target: 'player' });
  assert.equal(game.pendingChoice.kind, 'jiedao-decision');
  CardRuntime.moveCard(game, 'kc-pad', { zone: 'hand', actor: 'enemy' }, { zone: 'discard' });
  settle(game, { fire: true });
  assert.equal(game.player.equipment.weapon, null);
  assert.ok(!game.player.hand.some(card => card.id === 'red-weapon'));
  assert.ok(game.enemy.hand.some(card => card.id === 'red-weapon'));
});

test('Y4 闪电：帷幕阻挡的全环回退日志包含真实原因', () => {
  const game = gameFor('liubei', 'jiaxu');
  game.enemy.skills.push({ id: 'hongyan' });
  game.player.judgeArea = [black('shandian', 'lightning')];
  game.turn = 'enemy';
  Engine.endTurn(game);
  assert.ok(game.player.judgeArea.some(card => card.id === 'lightning'));
  assert.ok(game.log.some(line => line.includes('移动失败') && line.includes('帷幕限制')));
  assert.ok(!game.log.some(line => line.includes('移动失败') && line.includes('已有同名牌')));
});

for (const challenge of [false, true]) {
  test('Y3 AI 借刀：' + challenge + '质疑后正确使用声明杀或交出武器', () => {
    const game = gameFor('liubei', 'yuji');
    game.enemy.skillPreferences.wuxieResponse = 'decline';
    game.enemy.equipment.weapon = c('qinggang', { id: 'weapon' });
    game.enemy.hand = [red('wuzhong', 'cover')];
    game.player.hand = [red('jiedao', 'attack')];
    Engine.playCard(game, 'player', 'attack', { target: 'enemy' });
    assert.equal(game.pendingChoice.kind, 'guhuo-challenge');
    assert.equal(game.pauseState.guhuo.declareType, 'sha');
    settle(game, { challenge });
    assert.equal(game.player.hp, game.player.maxHp - (challenge ? 0 : 1));
    assert.equal(!!game.enemy.equipment.weapon, !challenge);
    assert.ok(!game.pauseState.jiedaoResponse);
    assert.equal(game.discard.filter(card => card.id === 'cover').length, 1);
    if (!challenge) assert.ok(game.log.some(line => line.includes('驱使使用【杀】')));
    drained(game);
  });
  test('Y3 AI 银月：' + challenge + '质疑后原杀等待武器响应完成', () => {
    const game = gameFor('liubei', 'yuji');
    game.turn = 'enemy';
    game.player.equipment.weapon = c('yinyue', { id: 'weapon' });
    game.player.hand = [black('shan', 'respond')];
    game.enemy.hand = [red('sha', 'attack'), red('wuzhong', 'cover')];
    Engine.playCard(game, 'enemy', 'attack');
    assert.equal(game.pendingChoice.kind, 'guhuo-challenge');
    assert.equal(game.pauseState.guhuo.responsePending.kind, 'yinyue-response');
    assert.ok(!game.discard.some(card => card.id === 'attack'));
    settle(game, { challenge });
    assert.equal(game.player.hp, game.player.maxHp);
    assert.equal(game.enemy.hp, game.enemy.maxHp - (challenge ? 1 : 0));
    drained(game);
  });
}

test('Y3 完杀：AI 忠臣即使有蛊惑也不能声明桃救其他濒死角色', () => {
  const game = gameFor('jiaxu', 'yuji', 'liubei');
  game.roles = { player: '反贼', enemy: '忠臣', ally: '主公' };
  game.ally.hp = 1; game.enemy.skillPreferences.dying = 'auto';
  game.player.hand = [red('sha', 'attack')]; game.enemy.hand = [red('wuzhong', 'cover')];
  Engine.playCard(game, 'player', 'attack', { target: 'ally' });
  assert.equal(game.pendingChoice, null);
  assert.ok(!game.enemy.flags.guhuoUsedThisTurn);
  assert.ok(game.enemy.hand.some(card => card.id === 'cover'));
  assert.equal(game.ally.hp, 0);
  drained(game);
});

await runTests();
