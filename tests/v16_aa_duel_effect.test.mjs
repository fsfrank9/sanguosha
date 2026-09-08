import assert from 'node:assert/strict';
import { Engine, c } from './helpers/load-engine.mjs';
import { StateRuntime } from '../src/engine/state.js';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

const skill = id => Object.values(Engine.HERO_CATALOG).flatMap(hero => hero.skills).find(entry => entry.id === id);
const activate = (game, actor, id) => StateRuntime.activateSkillSource(game[actor], 'huashen', skill(id));
const card = (type, id) => c(type, { id, suit: 'heart', color: 'red', rank: '6' });

function setup() {
  const game = Engine.newGame({ seed: 161100, playerHero: 'caoren', enemyHero: 'caoren' });
  for (const actor of game.seats) {
    Object.assign(game[actor], { hand: [], judgeArea: [], flags: {}, hp: game[actor].maxHp,
      equipment: { weapon: null, armor: null, horseMinus: null, horsePlus: null },
      skillPreferences: { shaDuelResponse: actor === 'player' ? 'ask' : 'auto', dying: 'decline' } });
  }
  Object.assign(game, { turn: 'enemy', phase: 'play', pendingChoice: null, pendingChoiceQueue: [],
    pauseState: {}, discard: [], log: [] });
  return game;
}

function play(game) {
  assertCardConservation(game, () => assert.equal(Engine.playCard(game, 'enemy', 'duel').ok, true));
}

function respond(game, decision) {
  assert.ok(game.pendingChoice, 'a real response window is open');
  assertCardConservation(game, () => assert.equal(Engine.resolvePendingChoice(game, decision).ok, true));
}

function need(game, amount) {
  assert.equal(game.pendingChoice?.kind, 'sha-duel-response');
  assert.equal(game.pauseState.duelChain.shaRemaining, amount);
}

test('AA1 Duel preserves the starter Wushuang requirement on later exchanges after its source becomes inactive', () => {
  const game = setup();
  activate(game, 'enemy', 'wushuang');
  game.enemy.hand = [card('juedou', 'duel'), card('sha', 'enemy-sha')];
  game.player.hand = [1, 2, 3, 4].map(i => card('sha', 'player-' + i));
  play(game); need(game, 2);
  activate(game, 'enemy', 'qicai');
  assert.equal(StateRuntime.skillEnabled(game.enemy, 'wushuang', game), false);
  respond(game, { cardId: 'player-1' }); need(game, 1);
  respond(game, { cardId: 'player-2' }); need(game, 2);
  assert.equal(game.enemy.hand.length, 0, 'the other party only owed one Sha');
  respond(game, { cardId: 'player-3' }); need(game, 1);
  assert.equal(game.enemy.hp, game.enemy.maxHp, 'one Sha has not paid the later two-Sha requirement');
  respond(game, { cardId: 'player-4' });
  assert.equal(game.pendingChoice, null);
  assert.equal(game.pauseState.duelChain, null);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
});

test('AA1 Duel locks each direction independently when the target also has Wushuang', () => {
  const game = setup();
  activate(game, 'enemy', 'wushuang'); activate(game, 'player', 'wushuang');
  game.enemy.hand = [card('juedou', 'duel'), ...[1, 2, 3, 4].map(i => card('sha', 'enemy-' + i))];
  game.player.hand = [1, 2, 3, 4, 5].map(i => card('sha', 'player-' + i));
  play(game);
  activate(game, 'enemy', 'qicai'); activate(game, 'player', 'qicai');
  respond(game, { cardId: 'player-1' }); respond(game, { cardId: 'player-2' });
  need(game, 2);
  assert.deepEqual(game.enemy.hand.map(entry => entry.id), ['enemy-3', 'enemy-4']);
  respond(game, { cardId: 'player-3' }); respond(game, { cardId: 'player-4' });
  need(game, 2);
  assert.equal(game.enemy.hand.length, 0, 'target-triggered Wushuang still requires two on the next enemy exchange');
  respond(game, { decline: true });
  assert.equal(game.player.hp, game.player.maxHp - 1);
});

for (const initialWushuang of [true, false]) {
  test('AA1 Duel retains pre-Wuxie requirements through JSON pause when Wushuang is ' + (initialWushuang ? 'lost' : 'gained'), () => {
    let game = setup();
    activate(game, 'enemy', initialWushuang ? 'wushuang' : 'qicai');
    game.enemy.hand = [card('juedou', 'duel'), card('sha', 'enemy-sha')];
    game.player.hand = [card('wuxie', 'counter'), ...[1, 2, 3, 4].map(i => card('sha', 'player-' + i))];
    game.player.skillPreferences.wuxieResponse = 'ask';
    play(game);
    assert.equal(game.pendingChoice?.kind, 'wuxie-response');
    game = JSON.parse(JSON.stringify(game));
    activate(game, 'enemy', initialWushuang ? 'qicai' : 'wushuang');
    respond(game, { decline: true }); need(game, initialWushuang ? 2 : 1);
    respond(game, { cardId: 'player-1' });
    game = JSON.parse(JSON.stringify(game));
    if (initialWushuang) {
      need(game, 1);
      respond(game, { cardId: 'player-2' });
    }
    need(game, initialWushuang ? 2 : 1);
    respond(game, { decline: true });
    assert.equal(game.player.hp, game.player.maxHp - 1);
    assert.equal(game.pauseState.duelChain, null);
  });
}

test('AA1 Duel keeps the locked cost but rechecks conversion validity before consuming each later Sha', () => {
  const game = setup();
  activate(game, 'enemy', 'wushuang'); activate(game, 'player', 'longdan');
  game.enemy.hand = [card('juedou', 'duel')];
  game.player.hand = [card('sha', 'first'), card('shan', 'convert')];
  play(game); need(game, 2);
  respond(game, { cardId: 'first' }); need(game, 1);
  assert.ok(game.pendingChoice.options.some(option => option.cardId === 'convert'));
  activate(game, 'player', 'qicai');
  respond(game, { cardId: 'convert' });
  assert.equal(game.player.hp, game.player.maxHp - 1);
  assert.deepEqual(game.player.hand.map(entry => entry.id), ['convert'], 'inactive Longdan cannot pay from a stale option');
  assert.equal(game.pauseState.duelChain, null);
});

await runTests();
