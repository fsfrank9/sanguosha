import assert from 'node:assert/strict';
import { Engine, StateRuntime, SKILL_METADATA, c } from './helpers/load-engine.mjs';
import { assertCardConservation, collectCardCensus } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function fresh(heroes = {}) {
  const game = Engine.newGame({ seed: 168090,
    seats: ['player', 'enemy', 'ally', 'ally2'],
    playerHero: 'god_simayi', enemyHero: 'guanyu', allyHero: 'zhaoyun', ally2Hero: 'liubei',
    godCamps: { player: '魏' },
    roles: { player: '忠臣', enemy: '反贼', ally: '反贼', ally2: '主公' }, ...heroes });
  for (const actor of game.seats) {
    game.discard.push(...game[actor].hand.splice(0));
    game[actor].skillPreferences = { dying: 'decline', shanResponse: 'auto',
      ganglie: 'auto', ganglieSource: 'auto', guicai: 'decline', guidao: 'decline',
      beige: 'auto', baonue: 'auto' };
  }
  StateRuntime.grantSkill(game.player, 'jilue', '极略', SKILL_METADATA.jilue);
  game.player.godMarks = { nin: 2 };
  game.player.skillPreferences.jilue = 'ask';
  game.turn = 'ally'; game.phase = 'play';
  game.player.hand.push(c('sha', { id: 'ab-paid-replacement', suit: 'heart', rank: 'K' }));
  game.ally.hand.push(c('sha', { id: 'ab-trigger-sha', suit: 'club', rank: '7' }));
  return game;
}

function trigger(game, originalSuit) {
  game.deck.push(c('sha', { id: 'ab-original-judgement', suit: originalSuit, rank: '4' }));
  const result = assertCardConservation(game,
    () => Engine.playCard(game, 'ally', 'ab-trigger-sha', { target: 'enemy' }));
  assert.ok(result?.ok || game.pendingChoice, result?.message);
  assert.equal(game.pendingChoice?.kind, 'guicai-replace');
  assert.equal(game.pendingChoice.jilueGuicai, true);
  assert.equal(game.player.godMarks.nin, 2, 'opening the choice has not paid the mark');
}

function answer(game, cardId = 'ab-paid-replacement') {
  const result = assertCardConservation(game, () => Engine.resolvePendingChoice(game,
    cardId ? { cardId } : { decline: true }));
  assert.equal(result.ok, true, result.message);
}

test('AB Jilue can change Ganglie before retaliation, including a JSON-restored pending window', () => {
  const game = fresh({ enemyHero: 'xiahoudun' });
  trigger(game, 'spade');
  assert.equal(game.pendingChoice.reason, '【刚烈】');
  const sourceHp = game.ally.hp;
  const clone = JSON.parse(JSON.stringify(game));
  const originalIds = collectCardCensus(game).ids;
  answer(clone); // heart prevents the retaliation
  assert.equal(clone.ally.hp, sourceHp);
  assert.equal(clone.player.godMarks.nin, 1);
  assert.deepEqual(collectCardCensus(clone).ids, originalIds);
  assert.equal(game.player.godMarks.nin, 2, 'the original pending game stays independent');
  assert.equal(game.pendingChoice.reason, '【刚烈】');
  answer(game, null); // decline retains the original non-heart result
  assert.equal(game.ally.hp, sourceHp - 1);
  assert.equal(game.player.godMarks.nin, 2);
});

test('AB Jilue can change Baonue before its lord heals', () => {
  const game = fresh({ allyHero: 'huaxiong', ally2Hero: 'dongzhuo' });
  game.ally2.hp = 3;
  game.player.hand[0].suit = 'spade'; game.player.hand[0].color = 'black';
  trigger(game, 'heart');
  assert.equal(game.pendingChoice.reason, '【暴虐】');
  assert.equal(game.ally2.hp, 3, 'the original result has not healed the lord behind the window');
  answer(game);
  assert.equal(game.ally2.hp, 4);
  assert.equal(game.player.godMarks.nin, 1);
});

test('AB Baonue judges its real lord and Weidi holder serially without passing through a pending choice', () => {
  const game = fresh({ seats: ['player', 'enemy', 'ally', 'ally2', 'ally3'],
    allyHero: 'huaxiong', ally2Hero: 'dongzhuo', ally3Hero: 'sp_yuanshu',
    roles: { player: '忠臣', enemy: '反贼', ally: '反贼', ally2: '主公', ally3: '内奸' } });
  game.ally2.hp = 3; game.ally3.hp = 2;
  game.player.hand[0].suit = 'spade'; game.player.hand[0].color = 'black';
  game.player.hand.push(c('sha', { id: 'ab-second-replacement', suit: 'spade', rank: 'Q' }));
  game.deck.push(c('sha', { id: 'ab-second-judgement', suit: 'heart', rank: '2' }));
  trigger(game, 'heart');
  const first = game.pendingChoice;
  assert.equal(game.ally2.hp, 3);
  assert.equal(game.ally3.hp, 2);
  answer(game);
  assert.equal(game.ally2.hp, 4);
  assert.equal(game.ally3.hp, 2, 'the second holder waits for its own judgement');
  assert.equal(game.pendingChoice.reason, '【暴虐】');
  assert.notEqual(game.pendingChoice, first);
  assert.equal(game.player.godMarks.nin, 1);
  answer(game, 'ab-second-replacement');
  assert.equal(game.ally2.hp, 4, 'the first reward is not repeated');
  assert.equal(game.ally3.hp, 3);
  assert.equal(game.player.godMarks.nin, 0);
});

test('AB Jilue can change Beige after its cost without prematurely applying either outcome', () => {
  const game = fresh({ ally2Hero: 'caiwenji' });
  game.ally2.hand.push(c('shan', { id: 'ab-beige-cost', suit: 'diamond', rank: '2' }));
  const beforeHp = game.enemy.hp;
  trigger(game, 'spade');
  assert.equal(game.pendingChoice.reason, '【悲歌】');
  assert.equal(game.enemy.hp, beforeHp - 1);
  assert.equal(!!game.ally.turnedOver, false);
  assert.equal(game.ally2.hand.length, 0, 'the skill cost was paid exactly once');
  answer(game);
  assert.equal(game.enemy.hp, beforeHp, 'the replacement heart heals after the judgement finishes');
  assert.equal(!!game.ally.turnedOver, false, 'the original spade never flipped the source');
  assert.equal(game.discard.filter(card => card.id === 'ab-beige-cost').length, 1);
});

test('AB Jilue changes Tieqi before Shan is consumed, and resumes the same single-target Sha', () => {
  const game = fresh({ allyHero: 'machao' });
  game.enemy.hand.push(c('shan', { id: 'ab-unspent-shan', suit: 'diamond', rank: '2' }));
  const beforeHp = game.enemy.hp;
  trigger(game, 'spade');
  assert.equal(game.pendingChoice.reason, '【铁骑】');
  assert.equal(game.enemy.hp, beforeHp);
  assert.ok(game.enemy.hand.some(card => card.id === 'ab-unspent-shan'));
  const clone = JSON.parse(JSON.stringify(game));
  answer(clone);
  assert.equal(clone.enemy.hp, beforeHp - 1, 'red Tieqi locks the pending Sha response');
  assert.ok(clone.enemy.hand.some(card => card.id === 'ab-unspent-shan'), 'the locked Shan is not consumed');
  assert.equal(clone.player.godMarks.nin, 1);
  assert.equal(game.enemy.hp, beforeHp, 'resuming the clone does not mutate the source game');
});

test('AB multi-target Tieqi stores each pending result at its own target index', () => {
  const game = fresh({ allyHero: 'machao' });
  game.ally.equipment.weapon = c('fangtian', { id: 'ab-fangtian', suit: 'diamond', rank: 'Q' });
  game.enemy.hand.push(c('shan', { id: 'ab-first-target-shan', suit: 'diamond', rank: '2' }));
  game.ally2.hand.push(c('shan', { id: 'ab-second-target-shan', suit: 'diamond', rank: '3' }));
  game.player.hand.push(c('sha', { id: 'ab-second-replacement', suit: 'spade', rank: 'Q' }));
  game.deck.push(c('sha', { id: 'ab-multi-judge-2', suit: 'spade', rank: '2' }),
    c('sha', { id: 'ab-multi-judge-1', suit: 'spade', rank: '3' }));
  const hpEnemy = game.enemy.hp, hpLord = game.ally2.hp;
  const result = assertCardConservation(game, () => Engine.playCard(game, 'ally', 'ab-trigger-sha',
    { targets: ['enemy', 'ally2'] }));
  assert.ok(result.ok || game.pendingChoice);
  assert.equal(game.pendingChoice.reason, '【铁骑】');
  answer(game); // red: locks the first actual action-order target (the lord)
  assert.equal(game.pendingChoice.reason, '【铁骑】', 'second target must receive a distinct judgement');
  assert.equal(game.enemy.hp, hpEnemy, 'all target locks precede resolution');
  assert.equal(game.ally2.hp, hpLord);
  answer(game, 'ab-second-replacement'); // black: second target can dodge
  assert.equal(game.ally2.hp, hpLord - 1);
  assert.ok(game.ally2.hand.some(card => card.id === 'ab-second-target-shan'));
  assert.equal(game.enemy.hp, hpEnemy);
  assert.equal(game.enemy.hand.some(card => card.id === 'ab-first-target-shan'), false);
  assert.equal(game.player.godMarks.nin, 0);
});

await runTests();
