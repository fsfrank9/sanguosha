import assert from 'node:assert/strict';
import { Engine, c, StateRuntime, SkillRuntime, CardRuntime } from './helpers/load-engine.mjs';
import { installGodCardHandlers } from '../src/engine/god-cards.js';
import { createGodChoiceRuntime } from '../src/engine/god-choices.js';
import { createResponseRuntime } from '../src/engine/response.js';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function fresh(playerHero = 'god_lvmeng', enemyHero = 'zhangfei', extra = {}) {
  const game = Engine.newGame({ seed: 168214, playerHero, enemyHero,
    godCamps: { player: '吴', enemy: '魏' }, ...extra });
  game.pendingChoice = null;
  game.pendingChoiceQueue = [];
  game.pauseState = {};
  game.deck = [];
  game.discard = [];
  game.log = [];
  for (const actor of game.seats) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[actor].flags = {};
    game[actor].skillPreferences = {};
    game[actor].turnedOver = false;
    game[actor].hp = game[actor].maxHp;
  }
  game.turn = 'player'; game.phase = 'play';
  return game;
}
function choose(game, decision) {
  assert.ok(game.pendingChoice, 'expected a live choice');
  const result = assertCardConservation(game, () => Engine.resolvePendingChoice(game,
    { choiceId: game.pendingChoice.choiceId, ...decision }));
  assert.equal(result.ok, true, result.message);
  return result;
}
function deckFive(game) {
  game.deck = [
    c('sha', { id: 'under-five', suit: 'spade' }),
    c('tao', { id: 'heart-one', suit: 'heart' }),
    c('shan', { id: 'heart-two', suit: 'heart' }),
    c('sha', { id: 'diamond-one', suit: 'diamond' }),
    c('sha', { id: 'club-one', suit: 'club' }),
    c('sha', { id: 'spade-one', suit: 'spade' })
  ];
}

test('AB 涉猎先询问，牌堆尚未曝光；拒绝时保留其他摸牌修正', () => {
  const game = fresh(); deckFive(game);
  StateRuntime.grantSkill(game.player, 'yingzi', '英姿');
  assertCardConservation(game, () => Engine.startTurn(game, 'player'));
  assert.equal(game.phase, 'draw');
  assert.equal(game.pendingChoice.godChoiceType, 'shelie-invoke');
  assert.equal(game.deck.length, 6);
  assert.equal(game.pendingChoice.cards, undefined);
  choose(game, { optionId: 'decline' });
  assert.equal(game.player.hand.length, 3);
  assert.equal(game.phase, 'play');
});

test('AB 涉猎必须每种花色各一张，错误花色/重复ID原子拒绝', () => {
  const game = fresh(); deckFive(game);
  assertCardConservation(game, () => Engine.startTurn(game, 'player'));
  choose(game, { optionId: 'invoke' });
  assert.equal(game.pendingChoice.godChoiceType, 'shelie-pick');
  assert.equal(game.pendingChoice.cards.length, 5);
  assert.equal(game.deck.length, 1);
  for (const ids of [
    ['heart-one', 'heart-two', 'club-one', 'spade-one'],
    ['heart-one', 'heart-one', 'club-one', 'spade-one'],
    ['under-five', 'diamond-one', 'club-one', 'spade-one']
  ]) {
    const before = JSON.stringify(game);
    const result = assertCardConservation(game, () => Engine.resolvePendingChoice(game,
      { choiceId: game.pendingChoice.choiceId, cardIds: ids }));
    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(game), before);
  }
  choose(game, { cardIds: ['heart-two', 'diamond-one', 'club-one', 'spade-one'] });
  assert.equal(game.player.hand.length, 4);
  assert.deepEqual(game.discard.map(card => card.id), ['heart-one']);
  assert.equal(game.phase, 'play');
});

test('AB 涉猎选牌快照JSON续跑；已发动后技能丢失仍获得锁定选牌', () => {
  let game = fresh(); deckFive(game);
  Engine.startTurn(game, 'player');
  choose(game, { optionId: 'invoke' });
  game = JSON.parse(JSON.stringify(game));
  StateRuntime.stripAllSkills(game.player);
  choose(game, { cardIds: ['heart-one', 'diamond-one', 'club-one', 'spade-one'] });
  assert.equal(game.player.hand.length, 4);
  assert.equal(game.pendingChoice, null);
  assert.equal(game.pauseState.godShelie, null);
});

test('AB 涉猎自动路径同样只取各花色一张，无重复常规摸牌', () => {
  const game = fresh(); deckFive(game);
  game.player.skillPreferences.shelie = 'auto';
  assertCardConservation(game, () => Engine.startTurn(game, 'player'));
  assert.equal(game.player.hand.length, 4);
  assert.equal(new Set(game.player.hand.map(card => card.suit)).size, 4);
  assert.equal(game.deck.length, 1);
  assert.equal(game.discard.length, 1);
  assert.equal(game.pendingChoice, null);
});

test('AB 涉猎终局清理在途亮牌，不留悬空帧', () => {
  const game = fresh(); deckFive(game);
  Engine.startTurn(game, 'player');
  choose(game, { optionId: 'invoke' });
  game.phase = 'gameover';
  choose(game, { cardIds: ['heart-one', 'diamond-one', 'club-one', 'spade-one'] });
  assert.equal(game.player.hand.length, 0);
  assert.equal(game.discard.length, 5);
  assert.equal(game.pauseState.responseFlows.length, 0);
});

test('AB 攻心查看后可放弃展示，仍消耗本阶段次数', () => {
  const game = fresh();
  game.enemy.hand = [c('shan', { id: 'hidden-heart', suit: 'heart' })];
  assertCardConservation(game, () => Engine.useSkill(game, 'player', 'gongxin', [], { target: 'enemy' }));
  assert.equal(game.pendingChoice.godChoiceType, 'gongxin-look');
  assert.equal(game.pendingChoice.cards[0].id, 'hidden-heart');
  choose(game, { optionId: 'decline' });
  assert.equal(game.enemy.hand.length, 1);
  assert.equal(Engine.useSkill(game, 'player', 'gongxin', [], { target: 'enemy' }).ok, false);
  assert.ok(!game.log.some(line => line.includes('展示红桃')));
  game.player.skillPreferences.shelie = 'decline';
  Engine.startTurn(game, 'player');
  assert.equal(game.player.flags.gongxinUsed, false);
});

test('AB 攻心非红桃及非法行动原子拒绝；公开展示先于弃/顶选择', () => {
  const game = fresh();
  game.enemy.hand = [c('shan', { id: 'black', suit: 'club' }), c('tao', { id: 'heart', suit: 'heart' })];
  Engine.useSkill(game, 'player', 'gongxin', [], { target: 'enemy' });
  const before = JSON.stringify(game);
  assert.equal(Engine.resolvePendingChoice(game, {
    choiceId: game.pendingChoice.choiceId, optionId: 'reveal', cardIds: ['black']
  }).ok, false);
  assert.equal(JSON.stringify(game), before);
  choose(game, { optionId: 'reveal', cardIds: ['heart'] });
  assert.equal(game.pendingChoice.godChoiceType, 'gongxin-move');
  assert.equal(game.enemy.hand.length, 2);
  assert.ok(game.log.some(line => line.includes('展示红桃A【桃】')));
  const revealed = JSON.stringify(game);
  assert.equal(Engine.resolvePendingChoice(game, {
    choiceId: game.pendingChoice.choiceId, optionId: 'give-to-self'
  }).ok, false);
  assert.equal(JSON.stringify(game), revealed);
  choose(game, { optionId: 'discard' });
  assert.deepEqual(game.discard.map(card => card.id), ['heart']);
  assert.deepEqual(game.enemy.hand.map(card => card.id), ['black']);
});

test('AB 攻心按目标红颜视图可展示黑桃；JSON续跑顶牌保留物理黑桃身份', () => {
  let game = fresh('god_lvmeng', 'xiaoqiao');
  game.enemy.hand = [c('tao', { id: 'hongyan-spade', suit: 'spade' })];
  Engine.useSkill(game, 'player', 'gongxin', [], { target: 'enemy' });
  assert.equal(game.pendingChoice.cards[0].suit, 'heart');
  assert.equal(game.enemy.hand[0].suit, 'spade');
  choose(game, { optionId: 'reveal', cardIds: ['hongyan-spade'] });
  game = JSON.parse(JSON.stringify(game));
  StateRuntime.stripAllSkills(game.player);
  choose(game, { optionId: 'top' });
  assert.equal(game.deck.at(-1).id, 'hongyan-spade');
  assert.equal(game.deck.at(-1).suit, 'spade');
  assert.equal(game.enemy.hand.length, 0);
});

test('AB 攻心拒绝自身、无手牌目标和非出牌阶段，次数未消耗', () => {
  const game = fresh();
  game.player.hand = [c('tao', { id: 'own-heart', suit: 'heart' })];
  assert.equal(Engine.useSkill(game, 'player', 'gongxin', [], { target: 'player' }).ok, false);
  assert.equal(Engine.useSkill(game, 'player', 'gongxin', [], { target: 'enemy' }).ok, false);
  game.enemy.hand = [c('shan', { id: 'target-heart', suit: 'heart' })];
  game.phase = 'discard';
  assert.equal(Engine.useSkill(game, 'player', 'gongxin', [], { target: 'enemy' }).ok, false);
  assert.ok(!game.player.flags.gongxinUsed);
});

function guixinGame() {
  const game = fresh('god_caocao', 'zhangfei', {
    seats: ['player', 'enemy', 'ally'], allyHero: 'zhaoyun'
  });
  game.turn = 'enemy';
  game.enemy.equipment.weapon = c('qinggang', { id: 'range-two' });
  game.enemy.hand = [c('shan', { id: 'secret-hand-a' }), c('tao', { id: 'secret-hand-b' })];
  game.ally.judgeArea = [c('lebusishu', { id: 'ally-judge' })];
  return game;
}
function hitGuixin(game, amount = 1) {
  game.enemy.hand.push(c('sha', { id: 'guixin-hit' }));
  game.enemy.shaBonus = amount - 1;
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'guixin-hit', { target: 'player' }));
  assert.equal(game.pendingChoice.godChoiceType, 'guixin-invoke');
}

test('AB 归心每伤害点分别选择，逐人获得后翻面；手牌候选不泄露身份', () => {
  const game = guixinGame(); hitGuixin(game, 2);
  choose(game, { optionId: 'invoke' });
  assert.ok(game.pendingChoice.title.includes(game.enemy.name));
  assert.ok(!JSON.stringify(game.pendingChoice).includes('secret-hand-a'));
  assert.ok(!JSON.stringify(game.pendingChoice).includes('secret-hand-b'));
  choose(game, { optionId: 'hand' });
  assert.equal(game.player.hand.length, 1);
  assert.ok(game.pendingChoice.title.includes(game.ally.name));
  assert.equal(game.player.turnedOver, false);
  choose(game, { optionId: 'judge:ally-judge' });
  assert.equal(game.player.turnedOver, true);
  assert.equal(game.pendingChoice.godChoiceType, 'guixin-invoke');
  choose(game, { optionId: 'decline' });
  assert.equal(game.player.turnedOver, true);
  assert.equal(game.pendingChoice, null);
  assert.equal(game.player.hand.length, 2);
});

test('AB 归心选择装备走白银狮子失去效果，获得后继续其他角色', () => {
  const game = guixinGame();
  game.enemy.equipment.armor = c('baiyin', { id: 'silver' });
  game.enemy.hp -= 1;
  hitGuixin(game);
  choose(game, { optionId: 'invoke' });
  const before = JSON.stringify(game);
  assert.equal(Engine.resolvePendingChoice(game, {
    choiceId: game.pendingChoice.choiceId, optionId: 'equipment:fake'
  }).ok, false);
  assert.equal(JSON.stringify(game), before);
  choose(game, { optionId: 'equipment:silver' });
  assert.equal(game.enemy.hp, game.enemy.maxHp);
  assert.equal(game.enemy.equipment.armor, null);
  assert.ok(game.player.hand.some(card => card.id === 'silver'));
  choose(game, { optionId: 'judge:ally-judge' });
  assert.equal(game.player.turnedOver, true);
});

test('AB 归心JSON续跑已发动本次保留；失去技能取消余下伤害点', () => {
  let game = guixinGame(); hitGuixin(game, 2);
  choose(game, { optionId: 'invoke' });
  game = JSON.parse(JSON.stringify(game));
  StateRuntime.stripAllSkills(game.player);
  choose(game, { optionId: 'equipment:range-two' });
  choose(game, { optionId: 'judge:ally-judge' });
  assert.equal(game.player.hand.length, 2);
  assert.equal(game.player.turnedOver, true);
  assert.equal(game.pendingChoice, null);
  assert.equal(game.pauseState.godGuixin, null);
});

test('AB 归心AI逐点两次发动翻回正面，无玩家归心窗口', () => {
  const game = guixinGame();
  game.player.skillPreferences.guixin = 'auto';
  game.enemy.hand.push(c('sha', { id: 'auto-guixin-hit' }));
  game.enemy.shaBonus = 1;
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'auto-guixin-hit', { target: 'player' }));
  assert.equal(game.player.turnedOver, false);
  assert.equal(game.player.hand.length, 3);
  assert.equal(game.pendingChoice, null);
});

test('AB 归心逐人获得按当前回合角色起始，而非技能持有者起始', () => {
  const game = guixinGame();
  game.turn = 'ally';
  game.ally.judgeArea = [];
  game.ally.equipment.weapon = c('qinggang', { id: 'ally-range' });
  game.ally.hand = [c('sha', { id: 'ally-hit' })];
  assertCardConservation(game, () => Engine.playCard(game, 'ally', 'ally-hit', { target: 'player' }));
  choose(game, { optionId: 'invoke' });
  assert.ok(game.pendingChoice.title.includes(game.ally.name));
  choose(game, { optionId: 'equipment:ally-range' });
  assert.ok(game.pendingChoice.title.includes(game.enemy.name));
  choose(game, { optionId: 'equipment:range-two' });
  assert.equal(game.player.turnedOver, true);
});

test('AB 归心可拒绝第一点再发动第二点，不把拒绝当作整次伤害取消', () => {
  const game = guixinGame(); hitGuixin(game, 2);
  choose(game, { optionId: 'decline' });
  assert.equal(game.pendingChoice.godChoiceType, 'guixin-invoke');
  choose(game, { optionId: 'invoke' });
  choose(game, { optionId: 'equipment:range-two' });
  choose(game, { optionId: 'judge:ally-judge' });
  assert.equal(game.player.turnedOver, true);
  assert.equal(game.player.hand.length, 2);
  assert.equal(game.pendingChoice, null);
});

test('AB 归心角色离场或游戏结束时停止未执行获得/翻面', () => {
  for (const gameover of [false, true]) {
    const game = guixinGame(); hitGuixin(game);
    choose(game, { optionId: 'invoke' });
    if (gameover) game.phase = 'gameover';
    else game.player.hp = 0;
    choose(game, { optionId: 'equipment:range-two' });
    assert.equal(game.enemy.equipment.weapon.id, 'range-two');
    assert.equal(game.player.hand.length, 0);
    assert.equal(game.player.turnedOver, false);
    assert.equal(game.pendingChoice, null);
    assert.equal(game.pauseState.godGuixin, null);
  }
});

test('AB 归心装备失去嵌套窗口前已完成移动；JSON续跑不重复获得或提前翻面', () => {
  let game = guixinGame();
  const ok = message => ({ ok: true, message });
  const response = createResponseRuntime({ log: (g, line) => g.log.push(line), success: ok,
    fail: message => ({ ok: false, message }) });
  const godChoices = createGodChoiceRuntime({ requestPlayerResponse: response.requestPlayerResponse,
    registerResponseKind: response.registerResponseKind, success: ok,
    fail: message => ({ ok: false, message }) });
  const registry = SkillRuntime.createRegistry();
  let equipmentLosses = 0;
  response.registerResponseKind('test-god-loss', g => {
    g.pauseState.testGodLoss = null;
    return ok('nested loss completed');
  });
  installGodCardHandlers(registry, {
    responseFlows: response.responseFlows, godChoices, success: ok,
    fail: message => ({ ok: false, message }), log: (g, line) => g.log.push(line),
    discardCard: (g, card) => CardRuntime.putCard(g, card, { zone: 'discard' }),
    randomHandIndex: () => 0,
    triggerEquipmentLoss: (g, actor, card) => {
      equipmentLosses += 1;
      assert.ok(g.player.hand.some(entry => entry.id === card.id), 'transfer precedes nested loss');
      response.requestPlayerResponse(g, { kind: 'test-god-loss', actor: 'player',
        pauseKey: 'testGodLoss', source: { actor, cardId: card.id } });
    }
  });
  const resolve = decision => assertCardConservation(game, () => {
    const result = response.resolveResponseChoice(game,
      { choiceId: game.pendingChoice.choiceId, ...decision });
    assert.equal(result.ok, true, result.message);
    return result;
  });
  SkillRuntime.runHook(registry, 'onDamageAfter', { game, targetActor: 'player', sourceActor: 'enemy', amount: 1 });
  resolve({ optionId: 'invoke' });
  resolve({ optionId: 'equipment:range-two' });
  assert.equal(game.pendingChoice.kind, 'test-god-loss');
  assert.equal(game.player.turnedOver, false);
  assert.equal(game.ally.judgeArea.length, 1);
  game = JSON.parse(JSON.stringify(game));
  resolve({});
  assert.equal(game.pendingChoice.godChoiceType, 'guixin-card');
  resolve({ optionId: 'judge:ally-judge' });
  assert.equal(equipmentLosses, 1);
  assert.equal(game.player.hand.length, 2);
  assert.equal(game.player.turnedOver, true);
  assert.equal(game.pauseState.responseFlows.length, 0);
});

test('AB 飞影只增加别人到自己的距离，动态失效/缠怨立即撤销', () => {
  const game = fresh('god_caocao', 'zhangfei');
  assert.equal(Engine.distanceBetween(game, 'enemy', 'player'), 2);
  assert.equal(Engine.distanceBetween(game, 'player', 'enemy'), 1);
  game.player.hp = 1;
  StateRuntime.grantSkill(game.player, 'chanyuan', '缠怨');
  assert.equal(Engine.distanceBetween(game, 'enemy', 'player'), 1);
  game.player.hp = 2;
  assert.equal(Engine.distanceBetween(game, 'enemy', 'player'), 2);
  StateRuntime.stripAllSkills(game.player);
  assert.equal(Engine.distanceBetween(game, 'enemy', 'player'), 1);
});

await runTests();
