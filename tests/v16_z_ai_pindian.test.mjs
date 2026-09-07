// Z4: 桃策略必须体现到真实行动; 拼点处理区须在后续效果(含终局)结束后收尾。
import assert from 'node:assert/strict';
import { Engine, CardRuntime, StateRuntime, c } from './helpers/load-engine.mjs';
import { createResponseRuntime } from '../src/engine/response.js';
import { createPindianRuntime } from '../src/engine/pindian.js';
import { assertCardConservation, collectCardCensus } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function gameOf(playerHero = 'caocao', enemyHero = 'caocao', thirdHero) {
  const game = Engine.newGame({
    seed: 92601, playerHero, enemyHero,
    ...(thirdHero ? {
      seats: ['player', 'enemy', 'ally'], allyHero: thirdHero,
      roles: { player: '主公', enemy: '反贼', ally: '忠臣' },
    } : {}),
  });
  game.log = []; game.discard = [];
  game.deck = Array.from({ length: 12 }, (_, i) => c('shan', { id: `deck-${i}` }));
  game.pendingChoice = null; game.pendingChoiceQueue = []; game.pauseState = {};
  game.turn = 'enemy'; game.phase = 'play';
  for (const seat of game.seats || ['player', 'enemy']) {
    game[seat].hand = []; game[seat].judgeArea = []; game[seat].flags = {};
    game[seat].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[seat].hp = game[seat].maxHp;
    game[seat].skillPreferences = { jieming: 'decline', jianxiong: 'decline' };
  }
  return game;
}

function resolve(game, decision, dispatcher = 'resolvePendingChoice') {
  return assertCardConservation(game, () => Engine[dispatcher](game, decision));
}

function assertPindianSettled(game, ids, zone = 'discard') {
  assert.equal(game.pauseState.pindianCards, null, '处理区挂账已清');
  const census = collectCardCensus(game);
  assert.deepEqual(census.zoneDuplicates, []);
  for (const id of ids) assert.deepEqual(census.zoneEntries.get(id), [zone], `${id} 恰有一个落点`);
}

test('Z4/C23: 轻伤安全血线的最后一桃留在手里, AI 实际行动不回血', () => {
  const game = gameOf();
  game.enemy.hp = 3;
  game.enemy.hand = [c('tao', { id: 'reserve' })];
  assert.ok(Engine.aiScoreCard(game, 'enemy', game.enemy.hand[0]) > 0, '仍有持有价值');
  const result = assertCardConservation(game, () => Engine.aiTakeAction(game, 'enemy'));
  assert.equal(result.action, 'none');
  assert.equal(game.enemy.hp, 3);
  assert.deepEqual(game.enemy.hand.map(card => card.id), ['reserve']);
  const clone = Engine.aiCloneGame(game);
  assert.equal(Engine.aiChooseCard(clone, 'enemy'), null, '模拟与真实候选门一致');
});

for (const [label, hp, maxHp] of [
  ['危急1血', 1, 4], ['低血轻伤', 2, 3], ['两点缺口', 2, 4], ['高上限多伤', 3, 5],
]) {
  test(`Z4/C23: ${label} 仍主动用桃回血`, () => {
    const game = gameOf();
    game.enemy.hp = hp; game.enemy.maxHp = maxHp;
    game.enemy.hand = [c('tao', { id: 'heal' })];
    const result = assertCardConservation(game, () => Engine.aiTakeAction(game, 'enemy'));
    assert.equal(result.cardId, 'heal');
    assert.equal(game.enemy.hp, hp + 1);
    assert.ok(game.discard.some(card => card.id === 'heal'));
  });
}

test('Z4/C23: 满血拒绝普通桃; 多伤、低血轻伤、安全轻伤保持优先级梯度', () => {
  const game = gameOf();
  const tao = c('tao');
  game.enemy.maxHp = 4;
  const scores = [1, 2, 3, 4].map(hp => {
    game.enemy.hp = hp;
    return Engine.aiScoreCard(game, 'enemy', tao);
  });
  assert.ok(scores[0] > scores[1] && scores[1] > scores[2] && scores[2] > scores[3]);
  game.enemy.hand = [tao];
  assert.equal(Engine.aiChooseCard(game, 'enemy'), null);
});

test('Z4/C23: 多余的桃可用于轻伤回血, 仍留下另一桃救援', () => {
  const game = gameOf();
  game.enemy.hp = 3;
  game.enemy.hand = [c('tao', { id: 'heal' }), c('tao', { id: 'reserve' })];
  const result = assertCardConservation(game, () => Engine.aiTakeAction(game, 'enemy'));
  assert.equal(result.action, 'card');
  assert.equal(game.enemy.hp, 4);
  assert.equal(game.enemy.hand.filter(card => card.type === 'tao').length, 1);
});

test('Z4/C23: 手牌溢出时允许用桃抬血线和手牌上限', () => {
  const game = gameOf();
  game.enemy.hp = 3;
  game.enemy.hand = [c('tao', { id: 'heal' }), ...['a', 'b', 'c'].map(id => c('shan', { id }))];
  const result = assertCardConservation(game, () => Engine.aiTakeAction(game, 'enemy'));
  assert.equal(result.cardId, 'heal');
  assert.equal(game.enemy.hp, 4);
});

test('Z4/C23: v11 冻结策略仍吃轻伤桃; 武圣转化候选独立于普通回血门', () => {
  const frozen = gameOf();
  frozen.enemy.hp = 3; frozen.enemy.aiProfile = 'v11';
  frozen.enemy.hand = [c('tao', { id: 'old-tao' })];
  assert.equal(Engine.aiChooseCard(frozen, 'enemy').card.id, 'old-tao');
  const converted = gameOf('caocao', 'guanyu');
  converted.enemy.hp = 3; converted.player.hp = 1;
  converted.enemy.hand = [c('tao', { id: 'red-tao', suit: 'heart', color: 'red' })];
  assert.equal(Engine.aiChooseCard(converted, 'enemy').mode, 'asSha');
});

test('Z4/C23: 留下的桃在后续真实濒死链中自动自救', () => {
  const game = gameOf('zhangfei');
  game.enemy.hp = 3;
  game.enemy.hand = [c('tao', { id: 'rescue' }), c('shan', { id: 'defense' })];
  game.player.hand = ['s1', 's2', 's3', 's4'].map(id => c('sha', { id }));
  assert.equal(Engine.aiTakeAction(game, 'enemy').action, 'none');
  game.turn = 'player';
  for (const id of ['s1', 's2', 's3', 's4']) {
    const result = assertCardConservation(game, () => Engine.playCard(game, 'player', id, { target: 'enemy' }));
    assert.equal(result.ok, true);
  }
  assert.equal(game.enemy.hp, 1, '首杀用闪、其余三杀致濒死后用保留桃回到1血');
  assert.notEqual(game.phase, 'gameover');
  assert.ok(game.discard.some(card => card.id === 'rescue'));
  assert.equal(game.pendingChoice, null);
});

test('Z4/C23: 武圣也会消耗同一桃时保留回血比较, 不强迫被闪抵消的转化', () => {
  const game = gameOf('sunquan', 'guanyu');
  game.deck = [];
  game.enemy.hp = 3;
  game.enemy.hand = [c('tao', { id: 'heal', suit: 'heart', color: 'red' })];
  game.player.hand = [c('shan', { id: 'defense' })];
  const result = assertCardConservation(game, () => Engine.aiTakeAction(game, 'enemy'));
  assert.equal(result.mode, 'normal');
  assert.equal(game.enemy.hp, 4);
  assert.deepEqual(game.player.hand.map(card => card.id), ['defense']);
});

test('Z4/C23: 对手暗牌和牌堆互换不影响保桃或压力回血决定', () => {
  const game = gameOf();
  game.enemy.hp = 3;
  const unknown = ['sha', 'shan', 'tao', 'wuxie'].map(type => c(type, { id: `unknown-${type}` }));
  for (const defended of [true, false]) {
    game.enemy.hand = [c('tao', { id: 'reserve' }), ...(defended ? [c('shan', { id: 'defense' })] : [])];
    for (let i = 0; i < unknown.length; i += 1) {
      // 总牌构成与可见手牌数不变, 只置换对手手牌/牌堆这两个隐藏位置。
      game.player.hand = [unknown[i]];
      game.deck = unknown.filter((_, j) => j !== i);
      const choice = assertCardConservation(game, () => Engine.aiChooseCard(game, 'enemy'));
      assert.equal(choice && choice.card.id, defended ? null : 'reserve');
    }
  }
});

test('Z4/C23: 可达来杀而无防御时先回血, 有闪时留桃', () => {
  for (const defended of [false, true]) {
    const game = gameOf();
    game.enemy.hp = 3;
    game.enemy.hand = [c('tao', { id: 'reserve' }), ...(defended ? [c('shan', { id: 'defense' })] : [])];
    game.player.hand = [c('sha', { id: 'threat' })];
    const result = assertCardConservation(game, () => Engine.aiTakeAction(game, 'enemy'));
    assert.equal(result.action, defended ? 'none' : 'card');
    assert.equal(game.enemy.hp, defended ? 3 : 4);
  }
});

test('Z4/C23: 龙胆手中杀可作防御闪, 出杀次数用完后仍可留桃', () => {
  const game = gameOf('caocao', 'zhaoyun');
  game.enemy.hp = 3; game.enemy.usedSha = true;
  game.enemy.hand = [c('tao', { id: 'reserve' }), c('sha', { id: 'longdan-defense' })];
  game.player.hand = [c('sha', { id: 'threat' })];
  const result = assertCardConservation(game, () => Engine.aiTakeAction(game, 'enemy'));
  assert.equal(result.action, 'none');
  assert.equal(game.enemy.hp, 3);
});

test('Z4/C28: 驱虎赢后选目标→濒死→救援的连续挂起均保留拼点牌, 效果完才弃', () => {
  const game = gameOf('xunyu', 'caocao', 'guanyu');
  game.turn = 'player'; game.player.hp = 1;
  game.player.hand = [c('sha', { id: 'pd-high', rank: 'K' }), c('tao', { id: 'save' })];
  game.enemy.hand = [c('sha', { id: 'pd-low', rank: '2' })];
  assertCardConservation(game, () => Engine.useSkill(game, 'player', 'quhu', [], { target: 'enemy' }));
  resolve(game, { cardId: 'pd-high' });
  assert.equal(game.pendingChoice.kind, 'quhu-victim');
  assert.equal(game.discard.length, 0);
  const choice = game.pendingChoice;
  assert.equal(resolve(game, { victim: 'missing' }).ok, false);
  assert.equal(game.pendingChoice, choice, '无效选择不越过效果');
  resolve(game, { victim: 'player' });
  assert.equal(game.pendingChoice.kind, 'dying-rescue');
  assert.equal(game.discard.length, 0, '救援尚未结算, 拼点牌仍在处理区');
  resolve(game, { use: true, cardId: 'save' });
  assert.equal(game.player.hp, 1);
  assertPindianSettled(game, ['pd-high', 'pd-low']);
});

for (const dispatcher of ['resolvePendingChoice', 'resolveResponseChoice']) {
  test(`Z4/C28: 驱虎没赢后的濒死放弃致终局, ${dispatcher} 仍清算拼点牌`, () => {
    const game = gameOf('xunyu');
    game.turn = 'player'; game.player.hp = 1;
    game.player.hand = [c('sha', { id: 'pd-low', rank: '2' }), c('tao', { id: 'save' })];
    game.enemy.hand = [c('sha', { id: 'pd-high', rank: 'K' })];
    assertCardConservation(game, () => Engine.useSkill(game, 'player', 'quhu', [], { target: 'enemy' }));
    resolve(game, { cardId: 'pd-low' }, dispatcher);
    assert.equal(game.pendingChoice.kind, 'dying-rescue');
    assert.equal(game.discard.length, 0);
    resolve(game, { decline: true, use: false }, dispatcher);
    assert.equal(game.phase, 'gameover');
    assert.equal(game.pendingChoice, null);
    assertPindianSettled(game, ['pd-low', 'pd-high']);
  });
}

for (const claim of ['auto', 'decline']) {
  test(`Z4/C28: 制霸 ${claim} 认领后实体牌唯一落区, 挂账彻底清空`, () => {
    const game = gameOf('sunce', 'sunquan', 'caocao');
    game.player.skillPreferences.zhibaClaim = claim;
    game.enemy.hand = [c('sha', { id: 'pd-low', rank: '2' })];
    game.player.hand = [c('sha', { id: 'pd-high', rank: 'K' })];
    assertCardConservation(game, () => Engine.useSkill(game, 'enemy', 'zhiba', []));
    assert.equal(game.pendingChoice.kind, 'pindian-card');
    assert.equal(collectCardCensus(game).inFlightIds.has('pd-low'), true);
    resolve(game, { cardId: 'pd-high' });
    assertPindianSettled(game, ['pd-low', 'pd-high'], claim === 'auto' ? 'player.hand' : 'discard');
  });
}

test('Z4/C28: 拼点效果挂起状态经 JSON 模拟复制后仍能救援并清账', () => {
  const original = gameOf('xunyu', 'caocao', 'guanyu');
  original.turn = 'player'; original.player.hp = 1;
  original.player.hand = [c('sha', { id: 'pd-high', rank: 'K' }), c('tao', { id: 'save' })];
  original.enemy.hand = [c('sha', { id: 'pd-low', rank: '2' })];
  Engine.useSkill(original, 'player', 'quhu', [], { target: 'enemy' });
  resolve(original, { cardId: 'pd-high' });
  assert.equal(original.pendingChoice.kind, 'quhu-victim');
  const clone = Engine.aiCloneGame(original);
  resolve(clone, { victim: 'player' });
  assert.equal(clone.pendingChoice.kind, 'dying-rescue');
  resolve(clone, { use: true, cardId: 'save' });
  assert.equal(clone.player.hp, 1);
  assertPindianSettled(clone, ['pd-low', 'pd-high']);
  assert.equal(original.pendingChoice.kind, 'quhu-victim', '原局仍挂起');
  assert.equal(original.discard.length, 0, '复制续跑不污染原局');
});

test('Z4/C28: 驱虎濒死快照无循环回指, 克隆局救援后的节命钩子仅修改克隆局', () => {
  const original = gameOf('xunyu');
  original.turn = 'player'; original.player.hp = 1;
  original.player.skillPreferences = { jieming: 'auto', jiemingTarget: 'player' };
  original.player.hand = [c('sha', { id: 'pd-low', rank: '2' }), c('tao', { id: 'save' })];
  original.enemy.hand = [c('sha', { id: 'pd-high', rank: 'K' })];
  Engine.useSkill(original, 'player', 'quhu', [], { target: 'enemy' });
  resolve(original, { cardId: 'pd-low' });
  assert.equal(original.pendingChoice.kind, 'dying-rescue');
  const before = JSON.stringify(original);
  const clone = Engine.aiCloneGame(original);
  // 同一公开模拟入口过去在 try 之前 clone 就抛错; 有选择未决时现在安全返回null。
  assert.equal(Engine.aiSimulateCardPlay(original, 'player', original.player.hand[0], 'normal'), null);
  resolve(clone, { use: true, cardId: 'save' });
  assert.equal(clone.player.hp, 1);
  assert.equal(clone.player.hand.length, clone.player.maxHp, '节命在克隆局摸牌');
  assert.equal(clone.deck.length, original.deck.length - clone.player.maxHp);
  assertPindianSettled(clone, ['pd-low', 'pd-high']);
  assert.equal(JSON.stringify(original), before, '原局血量/手牌/牌堆/暂停账本均未改动');
});

test('Z4/C28: 先扣双方牌再连营, 选牌快照复制后制霸认领不重复失牌', () => {
  const original = gameOf('sunce', 'luxun', 'caocao');
  original.enemy.hand = [c('sha', { id: 'pd-low', rank: '2' })];
  original.player.hand = [c('sha', { id: 'pd-high', rank: 'K' })];
  assertCardConservation(original, () => Engine.useSkill(original, 'enemy', 'zhiba', []));
  assert.equal(original.pendingChoice.kind, 'pindian-card');
  assert.equal(original.enemy.hand.length, 0, '另一方尚未扣置, 不抢跑连营');
  assert.equal(original.log.some(line => line.includes('发动【连营】')), false);
  const clone = Engine.aiCloneGame(original);
  resolve(clone, { cardId: 'pd-high' });
  assert.equal(clone.enemy.hand.length, 1, '克隆丢失非枚举来源标记仍准确提交连营');
  assert.equal(clone.log.filter(line => line.includes('发动【连营】')).length, 1);
  assertPindianSettled(clone, ['pd-low', 'pd-high'], 'player.hand');
  assert.equal(clone.pauseState.pindian, null);
  assert.deepEqual(clone.pauseState.responseFlows, []);
  assert.equal(original.enemy.hand.length, 0, '原局仍在选牌阶段');
});

test('Z4/C28: 拼点回合外失牌的屯田及自动改判在亮牌前只执行一次', () => {
  const game = gameOf('taishici', 'dengai', 'simayi');
  game.turn = 'player';
  game.player.hand = [c('sha', { id: 'pd-high', rank: 'K' })];
  game.enemy.hand = [c('sha', { id: 'pd-low', rank: '2' })];
  game.ally.hand = [c('shan', { id: 'replacement', suit: 'club', rank: '5' })];
  game.ally.skillPreferences.guicai = 'auto';
  game.deck.push(c('shan', { id: 'original-judge', suit: 'heart' }));
  assertCardConservation(game, () => Engine.useSkill(game, 'player', 'tianyi', [], { target: 'enemy' }));
  resolve(game, { cardId: 'pd-high' });
  assert.deepEqual(game.enemy.tian.map(card => card.id), ['replacement']);
  assert.equal(game.log.filter(line => line.includes('进行【屯田】判定')).length, 1);
  assert.equal(game.log.filter(line => line.includes('发动【鬼才】')).length, 1);
  assert.ok(game.log.findIndex(line => line.includes('发动【鬼才】'))
    < game.log.findIndex(line => line.includes('亮出')));
  assertPindianSettled(game, ['pd-low', 'pd-high']);
  assert.deepEqual(game.pauseState.responseFlows, []);
});

function pausingLossProtocol() {
  const success = message => ({ ok: true, message });
  const fail = message => ({ ok: false, message });
  const log = (game, message) => game.log.push(message);
  const responses = createResponseRuntime({ success, fail, log });
  const pindian = createPindianRuntime({
    success, fail, log, actorName: StateRuntime.actorName,
    responseFlows: responses.responseFlows,
    setPendingChoice: responses.setPendingChoice,
    registerResponseKind: responses.registerResponseKind,
    cardRankValue: CardRuntime.cardRankValue,
    findCardZone: CardRuntime.findCardZone,
    discardCard: (game, card) => CardRuntime.putCard(game, card, { zone: 'discard' }),
    removeCardFromHand: (state, id) => {
      const index = state.hand.findIndex(card => card.id === id);
      const card = state.hand.splice(index, 1)[0];
      return CardRuntime.markHandOrigin(state, card);
    },
    aiPickPindianCard: (game, actor) => game[actor].hand[0],
    notifyCardLoss: (game, actor) => {
      assert.equal(Object.keys(game.pauseState.pindian.cards).length, 2, '两方牌均已扣置');
      (game.lossEvents || (game.lossEvents = [])).push(actor);
      responses.setPendingChoice(game, { kind: 'test-loss-effect', actor });
    },
  });
  responses.registerResponseKind('test-loss-effect', (game, pending, decision) => {
    if (decision.endGame) game.phase = 'gameover';
    return success('失牌效果完成');
  });
  return { responses, pindian };
}

test('Z4/C28 协议: 失牌效果连续挂起及JSON复制后无重复提交, 最后才亮牌', () => {
  // 注入可挂起的失牌消费者验证协议; 不宣称既有非pausable屯田支持人工改判。
  const { responses, pindian } = pausingLossProtocol();
  const original = gameOf('caocao', 'luxun', 'caocao');
  original.enemy.hand = [c('sha', { id: 'pd-high', rank: 'K' })];
  original.ally.hand = [c('sha', { id: 'pd-low', rank: '2' })];
  assertCardConservation(original, () => pindian.startPindian(original, 'enemy', 'ally'));
  assert.deepEqual(original.lossEvents, ['enemy']);
  assert.equal(original.enemy.hand.length, 1, '第一方连营只摸一次');
  assert.equal(original.log.some(line => line.includes('亮出')), false);
  const clone = Engine.aiCloneGame(original);
  assertCardConservation(clone, () => responses.resolveResponseChoice(clone, {}));
  assert.deepEqual(clone.lossEvents, ['enemy', 'ally']);
  assert.equal(clone.enemy.hand.length, 1);
  assert.equal(clone.log.some(line => line.includes('亮出')), false);
  assertCardConservation(clone, () => responses.resolveResponseChoice(clone, {}));
  assert.deepEqual(clone.lossEvents, ['enemy', 'ally']);
  assertPindianSettled(clone, ['pd-high', 'pd-low']);
  assert.equal(clone.pauseState.pindian, null);
  assert.deepEqual(clone.pauseState.responseFlows, []);
  assert.equal(original.pendingChoice.kind, 'test-loss-effect');
});

test('Z4/C28 协议: 亮牌前的失牌效果致终局时取消帧并收完处理区牌', () => {
  const { responses, pindian } = pausingLossProtocol();
  const game = gameOf('caocao', 'caocao', 'caocao');
  game.enemy.hand = [c('sha', { id: 'pd-high', rank: 'K' })];
  game.ally.hand = [c('sha', { id: 'pd-low', rank: '2' })];
  assertCardConservation(game, () => pindian.startPindian(game, 'enemy', 'ally'));
  assertCardConservation(game, () => responses.resolveResponseChoice(game, { endGame: true }));
  assert.equal(game.phase, 'gameover');
  assert.equal(game.pauseState.pindian, null);
  assert.deepEqual(game.pauseState.responseFlows, []);
  const zones = collectCardCensus(game).zoneEntries;
  for (const id of ['pd-high', 'pd-low']) assert.deepEqual(zones.get(id), ['discard']);
});

await runTests();
