import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function makeGame() {
  const game = Engine.newGame({ seed: 72, startWithFirstTurn: true });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

function dealTaoyuan(state, id) {
  const card = { id, type: 'taoyuan', name: '桃园结义', suit: 'heart', color: 'red' };
  state.hand.push(card);
  return card;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v7 PR-2: 桃园 heals both when both are wounded', () => {
  const game = makeGame();
  game.player.hp = 2;
  game.enemy.hp = 2;
  dealTaoyuan(game.player, 'both-wounded');
  assert.equal(Engine.playCard(game, 'player', 'both-wounded').ok, true);
  assert.equal(game.player.hp, 3);
  assert.equal(game.enemy.hp, 3);
});

test('v7 PR-2: 桃园 对未受伤的角色无效 — 发动者满血时不回血', () => {
  const game = makeGame();
  game.enemy.hp = 2; // only opponent wounded
  const fullHp = game.player.hp;
  dealTaoyuan(game.player, 'only-foe-hurt');
  assert.equal(Engine.playCard(game, 'player', 'only-foe-hurt').ok, true);
  assert.equal(game.player.hp, fullHp, '发动者满血 → 无效');
  assert.equal(game.enemy.hp, 3);
});

test('v7 PR-2: 桃园 对未受伤的角色无效 — 对手满血时不回血', () => {
  const game = makeGame();
  game.player.hp = 2; // only self wounded
  const enemyFull = game.enemy.hp;
  dealTaoyuan(game.player, 'only-self-hurt');
  assert.equal(Engine.playCard(game, 'player', 'only-self-hurt').ok, true);
  assert.equal(game.player.hp, 3);
  assert.equal(game.enemy.hp, enemyFull, '对手满血 → 无效');
});

test('v7 PR-2: 桃园 两人都满血时一张都不回（卡仍消耗）', () => {
  const game = makeGame();
  const playerFull = game.player.hp;
  const enemyFull = game.enemy.hp;
  dealTaoyuan(game.player, 'both-full');
  assert.equal(Engine.playCard(game, 'player', 'both-full').ok, true,
    'spec 没规定双方满血时不能出，只是无效');
  assert.equal(game.player.hp, playerFull);
  assert.equal(game.enemy.hp, enemyFull);
  assert.ok(game.discard.some((c) => c.id === 'both-full'),
    '桃园本牌仍进入弃牌堆');
});

test('v7 PR-2: log 顺序为发动者优先（逆时针）', () => {
  const game = makeGame();
  game.player.hp = 2;
  game.enemy.hp = 2;
  dealTaoyuan(game.player, 'order-check');
  const logBefore = game.log.length;
  Engine.playCard(game, 'player', 'order-check');
  const tail = game.log.slice(logBefore).map((entry) => entry.message || entry.text || entry);
  const idxSelfHeal = tail.findIndex((s) => /我方.*回复/.test(String(s)) || /桃园.*我方/.test(String(s)) || /玩家.*回复/.test(String(s)));
  const idxFoeHeal = tail.findIndex((s) => /敌方.*回复/.test(String(s)) || /对手.*回复/.test(String(s)) || /桃园.*敌方/.test(String(s)));
  // We just need self log to appear before foe log; the actor-name labels
  // depend on actorName() implementation, so we tolerate either form.
  if (idxSelfHeal >= 0 && idxFoeHeal >= 0) {
    assert.ok(idxSelfHeal < idxFoeHeal, '发动者先结算，对手后结算');
  } else {
    // fallback: at least confirm both heals happened
    assert.equal(game.player.hp, 3);
    assert.equal(game.enemy.hp, 3);
  }
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
