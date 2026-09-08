import assert from 'node:assert/strict';
import { Engine, c } from './helpers/load-engine.mjs';
import { GeneralCardRuntime as G } from '../src/engine/general-card-runtime.js';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function fresh(options = {}) {
  const game = Engine.newGame({ seed: 163035,
    seats: ['player', 'enemy', 'ally', 'ally2', 'ally3'],
    playerHero: 'zhangfei', enemyHero: 'zuoci', allyHero: 'machao',
    ally2Hero: 'guanyu', ally3Hero: 'zhaoyun',
    roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '反贼', ally3: '内奸' },
    ...options });
  for (const actor of game.seats) {
    game.discard.push(...game[actor].hand.splice(0));
    game[actor].skillPreferences.dying = actor === 'player' ? 'ask' : 'decline';
  }
  game.turn = 'player'; game.phase = 'play';
  return game;
}

function ownCards(game, actor = 'enemy') {
  const ids = G.draw(game, actor, 3);
  G.select(game, actor, ids[0]);
  return ids;
}

function strike(game, target = 'enemy') {
  game[target].hp = 1;
  const card = c('sha', { id: 'aa-death-sha-' + target });
  game.player.hand.push(card);
  const result = assertCardConservation(game, () => Engine.playCard(game, 'player', card.id, { target }));
  assert.equal(result.ok, true, result.message);
}

test('AA3 nonterminal death returns public/hidden generals and the body before play continues', () => {
  const game = fresh(), ids = ownCards(game);
  const normalRandom = game.random;
  let calls = 0;
  game.random = () => { calls += 1; return normalRandom(); };
  const generalRandom = game.generalCards.randomState;
  strike(game);
  assert.notEqual(game.phase, 'gameover');
  assert.equal(game.enemy.hp, 0);
  assert.equal(game.generalCards.holdings.enemy, undefined);
  for (const id of ids.concat('zuoci')) assert(game.generalCards.outsideIds.includes(id), id);
  assert(!game.generalCards.excludedIds.includes('zuoci'));
  assert.deepEqual(game.generalCards.deathReturnedSeats, ['enemy']);
  assert.equal(game.generalCards.randomState, generalRandom);
  assert.equal(calls, 0, 'death return does not shuffle either card resource');
  assert.equal(G.assertConservation(game).total, Object.keys(Engine.HERO_CATALOG).length);
  assert.equal(game.player.hand.length, 3, 'the existing rebel-kill reward still follows cleanup');
});

test('AA3 hp zero awaiting rescue and a successful rescue keep all general cards on the same seat', () => {
  const game = fresh(); ownCards(game);
  game.player.hand.push(c('tao', { id: 'aa-death-rescue' }));
  const before = JSON.stringify(game.generalCards);
  strike(game);
  assert.equal(game.enemy.hp, 0);
  assert.equal(game.pendingChoice.kind, 'dying-rescue');
  assert.equal(JSON.stringify(game.generalCards), before);
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'aa-death-rescue' }));
  assert.equal(game.enemy.hp, 1);
  assert.equal(JSON.stringify(game.generalCards), before);
  G.assertConservation(game);
});

test('AA3 JSON-cloned dying decision releases only the clone and repeated death cleanup is inert', () => {
  const original = fresh(), ids = ownCards(original);
  original.player.hand.push(c('tao', { id: 'aa-death-decline' }));
  strike(original);
  const before = JSON.stringify(original.generalCards);
  const clone = JSON.parse(JSON.stringify(original));
  assertCardConservation(clone, () => Engine.resolvePendingChoice(clone, { decline: true }));
  assert.equal(clone.generalCards.holdings.enemy, undefined);
  for (const id of ids.concat('zuoci')) assert(clone.generalCards.outsideIds.includes(id), id);
  assert.equal(JSON.stringify(original.generalCards), before);
  assert.equal(original.pendingChoice.kind, 'dying-rescue');
  const settled = JSON.stringify(clone.generalCards);
  assert.deepEqual(G.releaseOnDeath(clone, 'enemy'), []);
  assert.equal(JSON.stringify(clone.generalCards), settled);
  G.assertConservation(clone); G.assertConservation(original);
});

test('AA3 duplicate hero IDs stay excluded until every corresponding seat reaches death cleanup', () => {
  const game = fresh({ allyHero: 'zuoci' });
  ownCards(game, 'enemy'); ownCards(game, 'ally');
  // hp alone is not a death-settlement marker: this seat has not passed the rescue flow.
  game.ally.hp = 0;
  strike(game);
  assert(game.generalCards.excludedIds.includes('zuoci'));
  assert(!game.generalCards.outsideIds.includes('zuoci'));
  assert.deepEqual(game.generalCards.deathReturnedSeats, ['enemy']);
  G.assertConservation(game);
  // Existing alive-seat targeting needs a live target before the next real lethal event.
  strike(game, 'ally');
  assert.notEqual(game.phase, 'gameover');
  assert(!game.generalCards.excludedIds.includes('zuoci'));
  assert.equal(game.generalCards.outsideIds.filter(id => id === 'zuoci').length, 1);
  assert.deepEqual(game.generalCards.deathReturnedSeats, ['enemy', 'ally']);
  assert.equal(game.generalCards.holdings.ally, undefined);
  G.assertConservation(game);
});

test('AA3 death-returned seats cannot obtain or select general resources again', () => {
  const game = fresh(); const ids = ownCards(game);
  strike(game);
  const before = JSON.stringify(game.generalCards);
  assert.deepEqual(G.draw(game, 'enemy', 2), []);
  assert.equal(G.select(game, 'enemy', ids[0]), null);
  assert.deepEqual(G.releaseOnDeath(game, 'intruder'), []);
  assert.equal(JSON.stringify(game.generalCards), before);
  G.assertConservation(game);
});

test('AA3 an immediate gameover ends before the existing death-system processing stage', () => {
  const game = fresh({ seats: ['player', 'enemy'] });
  ownCards(game);
  const before = JSON.stringify(game.generalCards);
  strike(game);
  assert.equal(game.phase, 'gameover');
  assert.equal(JSON.stringify(game.generalCards), before);
  G.assertConservation(game);
});

test('AA3 general census rejects corrupt death-seat records and reintroduced dead holdings', () => {
  const game = fresh(); strike(game);
  for (const corrupt of [
    copy => copy.generalCards.deathReturnedSeats.push('enemy'),
    copy => copy.generalCards.deathReturnedSeats.push('intruder'),
    copy => { copy.generalCards.deathReturnedSeats = {}; },
    copy => { copy.generalCards.holdings.enemy = { hiddenIds: [], activeId: null }; },
  ]) {
    const copy = JSON.parse(JSON.stringify(game)); corrupt(copy);
    assert.throws(() => G.assertConservation(copy), /武将牌守恒失败/);
  }
  const premature = fresh();
  premature.generalCards.deathReturnedSeats.push('enemy');
  assert.throws(() => G.assertConservation(premature), /上场武将与排除区不一致/);
});

const { passed, total } = await runTests();
console.log(`${passed}/${total} AA3 death lifecycle tests passed.`);
