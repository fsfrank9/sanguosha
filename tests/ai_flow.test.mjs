import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const htmlPath = path.resolve(import.meta.dirname, '../index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script id="game-engine"[^>]*>([\s\S]*?)<\/script>/);
assert.ok(match, 'index.html should contain <script id="game-engine">');

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox, { filename: 'game-engine.js' });
const Engine = sandbox.window.SanguoshaEngine;
assert.ok(Engine, 'engine should expose window.SanguoshaEngine');

function test(name, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function ids(cards) {
  return Array.from(cards).map((card) => card.id);
}

function flowGame({ playerHero = 'sunquan', enemyHero = 'huanggai' } = {}) {
  const game = Engine.newGame({ seed: 5252, playerHero, enemyHero });
  game.turn = 'player';
  game.phase = 'play';
  game.winner = null;
  game.log = [];
  game.discard = [];
  game.turnHistory = [];
  game.deck = [];
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[actor].flags = {};
    game[actor].usedSha = false;
    game[actor].shaBonus = 0;
    game[actor].hp = game[actor].maxHp;
  }
  return game;
}

test('engine exposes v2.5 AI and discard helpers', () => {
  for (const fn of ['runAITurn', 'aiTakeAction', 'aiChooseSkillAction', 'getDiscardCount', 'needsDiscard', 'discardSelected']) {
    assert.equal(typeof Engine[fn], 'function', `${fn} should be exported`);
  }
});

test('AI full turn runs official phases, attacks, discards, finishes, and returns control to player', () => {
  const game = flowGame({ playerHero: 'sunquan', enemyHero: 'caocao' });
  game.player.hp = 4;
  game.enemy.hp = 4;
  game.enemy.hand = [c('sha', { id: 'enemy-opening-sha' })];
  game.enemy.hp = 2;
  game.deck = [
    c('shan', { id: 'player-next-draw-2' }),
    c('sha', { id: 'player-next-draw-1' }),
    c('tao', { id: 'enemy-draw-2' }),
    c('shan', { id: 'enemy-draw-1' })
  ];

  const result = Engine.runAITurn(game, 'enemy');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.turn, 'player', 'AI should hand control back to player');
  assert.equal(game.phase, 'play', 'player should be left in a playable phase after AI finishes');
  assert.equal(game.player.hp, 3, 'enemy should have used Sha during its play phase');
  assert.equal(Engine.needsDiscard(game, 'enemy'), false, 'AI should not leave excess hand cards');

  const enemyPhases = Array.from(game.turnHistory)
    .filter((entry) => entry.actor === 'enemy')
    .map((entry) => entry.phase);
  for (const phase of ['prepare', 'judge', 'draw', 'play', 'discard', 'finish']) {
    assert.ok(enemyPhases.includes(phase), `enemy turn should include ${phase} phase`);
  }
  assert.ok(game.log.some((entry) => /判定阶段/.test(entry)), 'battle log should include judgment phase');
  assert.ok(game.log.some((entry) => /结束阶段/.test(entry)), 'battle log should include finish phase');
});

test('AI can choose and execute active hero skills deterministically', () => {
  const kurouGame = flowGame({ playerHero: 'sunquan', enemyHero: 'huanggai' });
  kurouGame.turn = 'enemy';
  kurouGame.phase = 'play';
  kurouGame.enemy.hp = 3;
  kurouGame.enemy.hand = [];
  kurouGame.deck = [c('shan', { id: 'kurou-draw-2' }), c('sha', { id: 'kurou-draw-1' })];

  const kurouAction = Engine.aiChooseSkillAction(kurouGame, 'enemy');
  assert.equal(kurouAction.skillId, 'kurou');
  const kurouResult = Engine.aiTakeAction(kurouGame, 'enemy');
  assert.equal(kurouResult.ok, true, kurouResult.message);
  assert.equal(kurouGame.enemy.hp, 2);
  assert.deepEqual(ids(kurouGame.enemy.hand), ['kurou-draw-1', 'kurou-draw-2']);

  const zhihengGame = flowGame({ playerHero: 'caocao', enemyHero: 'sunquan' });
  zhihengGame.turn = 'enemy';
  zhihengGame.phase = 'play';
  zhihengGame.enemy.hand = [c('shan', { id: 'weak-card' })];
  zhihengGame.deck = [c('sha', { id: 'fresh-sha' })];

  const zhihengAction = Engine.aiChooseSkillAction(zhihengGame, 'enemy');
  assert.equal(zhihengAction.skillId, 'zhiheng');
  assert.deepEqual(Array.from(zhihengAction.cardIds), ['weak-card']);
  const zhihengResult = Engine.aiTakeAction(zhihengGame, 'enemy');
  assert.equal(zhihengResult.ok, true, zhihengResult.message);
  assert.deepEqual(ids(zhihengGame.enemy.hand), ['fresh-sha']);
  assert.equal(zhihengGame.enemy.flags.zhihengUsed, true);
});

test('discard interaction helpers enforce hand limit before phase advances', () => {
  const game = flowGame({ playerHero: 'sunquan', enemyHero: 'caocao' });
  game.turn = 'player';
  game.phase = 'discard';
  game.player.hp = 2;
  game.player.hand = [
    c('sha', { id: 'discard-a' }),
    c('shan', { id: 'discard-b' }),
    c('tao', { id: 'keep-a' }),
    c('jiu', { id: 'keep-b' })
  ];

  assert.equal(Engine.getDiscardCount(game, 'player'), 2);
  assert.equal(Engine.needsDiscard(game, 'player'), true);
  assert.equal(Engine.advancePhase(game).ok, false, 'cannot leave discard phase before discarding excess cards');

  const result = Engine.discardSelected(game, 'player', ['discard-a', 'discard-b']);
  assert.equal(result.ok, true, result.message);
  assert.equal(Engine.getDiscardCount(game, 'player'), 0);
  assert.deepEqual(ids(game.player.hand), ['keep-a', 'keep-b']);
  assert.equal(Engine.advancePhase(game).ok, true, 'discard phase can advance after confirmed discard');
  assert.equal(game.phase, 'finish');
});

test('UI contains skill buttons, discard confirmation controls, and phase active hooks', () => {
  assert.match(html, /data-skill-id/, 'skill UI should render clickable buttons with data-skill-id');
  assert.match(html, /id="confirmDiscardBtn"/, 'discard mode should provide a confirm button');
  assert.match(html, /data-phase="discard"/, 'phase steps should expose data-phase hooks');
  assert.match(html, /discard-selected/, 'selected discard cards should have a visual class');
});
