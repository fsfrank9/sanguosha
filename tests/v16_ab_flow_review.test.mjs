import assert from 'node:assert/strict';
import { Engine, c, StateRuntime } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function fresh(options = {}) {
  const game = Engine.newGame({ seed: 168800,
    seats: ['player', 'enemy', 'ally', 'ally2', 'ally3'],
    playerHero: 'simayi', enemyHero: 'god_guanyu', allyHero: 'god_guanyu',
    ally2Hero: 'zhangfei', ally3Hero: 'zhaoyun',
    roles: { player: '主公', enemy: '反贼', ally: '反贼', ally2: '忠臣', ally3: '内奸' },
    godCamps: { player: '魏', enemy: '魏', ally: '蜀' }, ...options });
  for (const actor of game.seats) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].equipment = {};
    game[actor].flags = {};
    game[actor].skillPreferences = { dying: 'decline' };
    game[actor].chained = false;
  }
  game.pendingChoice = null; game.pendingChoiceQueue = []; game.pauseState = {};
  game.deck = Array.from({ length: 12 }, (_, i) => c('shan', { id: 'ab-review-deck-' + i }));
  game.discard = []; game.log = []; game.phase = 'play'; game.turn = 'ally2';
  game.enemy.hp = 1;
  game.ally.nightmare = 2;
  game.player.hand = [c('tao', { id: 'review-save', suit: 'heart' }), c('sha', { id: 'review-black', suit: 'club' })];
  game.ally2.equipment.weapon = c('qinggang', { id: 'review-range' });
  return game;
}
function strike(game, type = 'sha') {
  game.ally2.hand = [c(type, { id: 'review-kill' })];
  const result = assertCardConservation(game, () => Engine.playCard(game, 'ally2', 'review-kill', { target: 'enemy' }));
  assert.equal(result.ok, true, result.message);
}
function resolve(game, decision) {
  const result = assertCardConservation(game, () => Engine.resolvePendingChoice(game,
    { choiceId: game.pendingChoice && game.pendingChoice.choiceId, ...decision }));
  assert.equal(result.ok, true, result.message);
  return result;
}

test('AB 复核：武魂改判等待时死亡清理/奖励尚未发生；JSON续跑只清理一次', () => {
  let game = fresh();
  game.enemy.hand = [c('shan', { id: 'dead-retained-card' })];
  // An enemy Shan would defend the initial hit, so use a nonresponse card.
  game.enemy.hand = [c('guohe', { id: 'dead-retained-card' })];
  strike(game);
  assert.equal(game.pendingChoice.kind, 'guicai-replace');
  assert.equal(game.pendingChoice.reason, '【武魂】');
  assert.equal(game.enemy.hand.length, 1);
  assert.equal(game.ally2.hand.length, 0);
  game = JSON.parse(JSON.stringify(game));
  resolve(game, { cardId: 'review-save' });
  assert.ok(game.ally.hp > 0);
  assert.equal(game.enemy.hand.length, 0);
  assert.equal(game.ally2.hand.length, 3);
  assert.equal(game.log.filter(line => line.includes('击杀反贼，摸三张牌')).length, 1);
  assert.equal(game.pauseState.responseFlows.length, 0);
  assert.equal(game.pendingChoice, null);
});

test('AB 复核：武魂判死主公先终局，不能提前传导造成额外伤害', () => {
  const game = fresh();
  game.player.nightmare = 3;
  game.enemy.chained = true;
  game.ally.chained = true;
  const allyHp = game.ally.hp;
  strike(game, 'fire_sha');
  assert.equal(game.pendingChoice.kind, 'guicai-replace');
  assert.equal(game.pendingChoice.judgementActor, 'player');
  assert.equal(game.ally.hp, allyHp);
  resolve(game, {});
  assert.equal(game.phase, 'gameover');
  assert.equal(game.player.hp, 0);
  assert.equal(game.ally.hp, allyHp, 'death judgement must settle before chain transmission');
  assert.equal(game.ally.chained, true);
  assert.equal(game.pauseState.responseFlows.length, 0);
});

test('AB 复核：武魂嵌套杀死另一神关羽，再次武魂改判可JSON续跑且无重复奖励', () => {
  let game = fresh();
  game.player.nightmare = 1;
  game.ally.hand = [c('guohe', { id: 'nested-dead-card' })];
  strike(game);
  assert.equal(game.pendingChoice.judgementActor, 'ally');
  resolve(game, {});
  assert.equal(game.ally.hp, 0);
  assert.equal(game.pendingChoice.kind, 'guicai-replace');
  assert.equal(game.pendingChoice.judgementActor, 'player');
  assert.equal(game.ally.hand.length, 1, 'nested death has not completed cleanup before its own Wuhun');
  game = JSON.parse(JSON.stringify(game));
  resolve(game, { cardId: 'review-save' });
  assert.ok(game.player.hp > 0);
  assert.equal(game.enemy.hp, 0);
  assert.equal(game.ally.hp, 0);
  assert.equal(game.ally.hand.length, 0);
  assert.equal(game.ally2.hand.length, 3, 'direct Wuhun death grants no kill reward');
  assert.equal(game.log.filter(line => line.includes('击杀反贼，摸三张牌')).length, 1);
  assert.equal(game.pauseState.responseFlows.length, 0);
});

test('AB 复核：归心暂停必须先完成再发生火焰传导，JSON恢复保留顺序', () => {
  let game = fresh({ playerHero: 'god_caocao', enemyHero: 'zhangfei', allyHero: 'zhaoyun' });
  game.turn = 'enemy'; game.enemy.hp = game.enemy.maxHp;
  game.player.hand = [];
  game.player.chained = true; game.ally.chained = true;
  game.enemy.equipment.weapon = c('qinggang', { id: 'guixin-review-range' });
  game.enemy.hand = [c('fire_sha', { id: 'guixin-fire-hit' })];
  const allyHp = game.ally.hp;
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'guixin-fire-hit', { target: 'player' }));
  assert.equal(game.pendingChoice.godChoiceType, 'guixin-invoke');
  assert.equal(game.ally.hp, allyHp);
  game = JSON.parse(JSON.stringify(game));
  resolve(game, { optionId: 'decline' });
  assert.equal(game.ally.hp, allyHp - 1);
  assert.equal(game.ally.chained, false);
  assert.equal(game.pendingChoice, null);
  assert.equal(game.pauseState.responseFlows.length, 0);
});

test('AB 复核：极略鬼才拒绝窗口后新入手的牌不能先扣忍', () => {
  const game = fresh({ playerHero: 'god_simayi' });
  StateRuntime.grantSkill(game.player, 'jilue', '极略');
  game.player.godMarks = { nin: 2 };
  strike(game);
  assert.equal(game.pendingChoice.kind, 'guicai-replace');
  assert.equal(game.pendingChoice.jilueGuicai, true);
  game.player.hand.push(c('tao', { id: 'not-offered', suit: 'heart' }));
  const before = JSON.stringify(game);
  const result = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'not-offered' }));
  assert.equal(result.ok, false);
  assert.equal(game.player.godMarks.nin, 2, 'invalid replacement must not pay a mark');
  assert.equal(JSON.stringify(game), before);
});

test('AB 复核：武魂改判原技能失效后不能继续消耗手牌改判', () => {
  const game = fresh();
  strike(game);
  assert.equal(game.pendingChoice.kind, 'guicai-replace');
  StateRuntime.stripAllSkills(game.player);
  resolve(game, { cardId: 'review-save' });
  assert.ok(game.player.hand.some(card => card.id === 'review-save'));
  assert.equal(game.ally.hp, 0, 'expired Guicai cannot change the lethal judgement');
});

test('AB 复核：鬼道黑色装备改判按真实牌色校验，原牌获得且白银失去效果生效', () => {
  const game = fresh({ playerHero: 'zhangjiao' });
  game.player.equipment.armor = c('baiyin', { id: 'review-guidao-armor', suit: 'club' });
  game.player.hp = game.player.maxHp - 1;
  StateRuntime.grantSkill(game.ally, 'hongyan', '红颜');
  strike(game);
  assert.equal(game.pendingChoice.kind, 'guidao-replace');
  const originalId = game.pendingChoice.judgementCard.id;
  const original = game.pauseState.godJudgement.card;
  assert.equal(original.suit, 'heart');
  resolve(game, { cardId: 'review-guidao-armor' });
  assert.equal(game.player.equipment.armor, null);
  assert.equal(game.player.hp, game.player.maxHp);
  assert.ok(game.player.hand.some(card => card.id === originalId && card.suit === 'spade'));
  assert.ok(game.discard.some(card => card.id === 'review-guidao-armor' && card.suit === 'club'));
  assert.equal(game.ally.hp, 0);
  assert.equal(game.pauseState.responseFlows.length, 0);
});

test('AB 复核：终局取消武魂改判时在途牌还原红颜视图，保留未支付改判牌', () => {
  const game = fresh();
  StateRuntime.grantSkill(game.ally, 'hongyan', '红颜');
  strike(game);
  const id = game.pauseState.godJudgement.card.id;
  assert.equal(game.pauseState.godJudgement.card.suit, 'heart');
  game.phase = 'gameover';
  resolve(game, { cardId: 'review-save' });
  assert.ok(game.discard.some(card => card.id === id && card.suit === 'spade'));
  assert.ok(game.player.hand.some(card => card.id === 'review-save'));
  assert.equal(game.pauseState.responseFlows.length, 0);
});

test('AB 复核：武魂直接杀死1体力缠怨神关羽，不能因HP哨兵变零重新发动武魂', () => {
  const game = fresh();
  game.ally.hp = 1;
  game.player.nightmare = 1;
  StateRuntime.grantSkill(game.ally, 'chanyuan', '缠怨');
  strike(game);
  assert.equal(game.pendingChoice.judgementActor, 'ally');
  resolve(game, {});
  assert.equal(game.ally.hp, 0);
  assert.ok(game.player.hp > 0);
  assert.equal(game.pendingChoice, null, 'Chanyuan-suppressed Wuhun must not open another death judgement');
  assert.equal(game.log.filter(line => line.includes('进行【武魂】判定')).length, 1);
  assert.equal(game.ally.directDeathHp, undefined, 'settled death cleanup releases the temporary HP snapshot');
});

test('AB 复核：武魂直接死亡没有伤害来源，1体力缠怨蔡文姬不对原击杀者断肠', () => {
  const game = fresh({ allyHero: 'caiwenji' });
  game.ally.hp = 1;
  StateRuntime.grantSkill(game.ally, 'chanyuan', '缠怨');
  strike(game);
  resolve(game, {});
  assert.equal(game.ally.hp, 0);
  assert.equal(StateRuntime.skillEnabled(game.ally2, 'paoxiao', game), true);
  assert.equal(game.log.some(line => line.includes('发动【断肠】')), false);
  assert.equal(game.ally.directDeathHp, undefined);
});

await runTests({ collect: true });
