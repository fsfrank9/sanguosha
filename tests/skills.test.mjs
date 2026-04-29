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

function skillGame(playerHero, enemyHero = 'sunquan') {
  const game = Engine.newGame({ seed: 4242, playerHero, enemyHero });
  game.turn = 'player';
  game.phase = 'play';
  game.winner = null;
  game.log = [];
  game.discard = [];
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

function ids(cards) {
  return Array.from(cards).map((card) => card.id);
}

test('张飞【咆哮】 allows multiple Sha in one play phase without Zhuge crossbow', () => {
  const game = skillGame('zhangfei', 'sunquan');
  game.player.hand = [c('sha', { id: 'sha-1' }), c('sha', { id: 'sha-2' })];

  assert.equal(Engine.playCard(game, 'player', 'sha-1').ok, true);
  assert.equal(Engine.playCard(game, 'player', 'sha-2').ok, true);

  assert.equal(game.enemy.hp, game.enemy.maxHp - 2);
  assert.equal(game.player.usedSha, true);
});

test('关羽【武圣】 converts any red card to Sha', () => {
  const game = skillGame('guanyu', 'sunquan');
  game.player.hand = [c('tao', { id: 'red-tao', suit: 'heart', color: 'red' })];

  const result = Engine.playCardAs(game, 'player', 'red-tao', 'sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
  assert.equal(game.player.hand.length, 0);
});

test('赵云【龙胆】 converts Shan to Sha proactively', () => {
  const game = skillGame('zhaoyun', 'sunquan');
  game.player.hand = [c('shan', { id: 'longdan-shan' })];

  const result = Engine.playCardAs(game, 'player', 'longdan-shan', 'sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
});

test('赵云【龙胆】 converts Sha to Shan as automatic response', () => {
  const game = skillGame('zhaoyun', 'sunquan');
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'incoming-sha' })];
  game.player.hand = [c('sha', { id: 'longdan-response-sha' })];

  const result = Engine.playCard(game, 'enemy', 'incoming-sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.player.hp, game.player.maxHp, 'Longdan Sha-as-Shan should prevent Sha damage');
  assert.deepEqual(ids(game.player.hand), [], 'response Sha should be consumed');
});

test('孙权【制衡】 discards selected cards and draws the same amount once per turn', () => {
  const game = skillGame('sunquan', 'caocao');
  game.player.hand = [c('sha', { id: 'old-1' }), c('shan', { id: 'old-2' })];
  game.deck = [c('tao', { id: 'draw-2' }), c('jiu', { id: 'draw-1' })];

  const result = Engine.useSkill(game, 'player', 'zhiheng', ['old-1', 'old-2']);

  assert.equal(result.ok, true, result.message);
  assert.deepEqual(ids(game.player.hand), ['draw-1', 'draw-2']);
  assert.equal(Engine.useSkill(game, 'player', 'zhiheng', ['draw-1']).ok, false, 'Zhiheng should be once per turn');
});

test('黄盖【苦肉】 loses 1 HP and draws two cards', () => {
  const game = skillGame('huanggai', 'sunquan');
  game.deck = [c('sha', { id: 'kurou-2' }), c('tao', { id: 'kurou-1' })];

  const result = Engine.useSkill(game, 'player', 'kurou');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.player.hp, game.player.maxHp - 1);
  assert.deepEqual(ids(game.player.hand), ['kurou-1', 'kurou-2']);
});

test('曹操【奸雄】 gains the card that caused damage', () => {
  const game = skillGame('sunquan', 'caocao');
  game.player.hand = [c('sha', { id: 'jianxiong-sha' })];

  const result = Engine.playCard(game, 'player', 'jianxiong-sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
  assert.ok(ids(game.enemy.hand).includes('jianxiong-sha'), 'Cao Cao should gain the damaging Sha');
});

test('马超【铁骑】 red judgment prevents target from playing Shan', () => {
  const game = skillGame('machao', 'sunquan');
  game.player.hand = [c('sha', { id: 'tieqi-sha' })];
  game.enemy.hand = [c('shan', { id: 'blocked-shan' })];
  game.deck = [c('tao', { id: 'tieqi-red-judge', suit: 'heart', color: 'red' })];

  const result = Engine.playCard(game, 'player', 'tieqi-sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, 'red Tieqi judgment should force Sha damage');
  assert.deepEqual(ids(game.enemy.hand), ['blocked-shan'], 'target should not consume Shan after red Tieqi');
});

test('张辽【突袭】 steals one enemy hand card and draws one fewer card during draw phase', () => {
  const game = skillGame('zhangliao', 'sunquan');
  game.enemy.hand = [c('shan', { id: 'stolen-by-tuxi' })];
  game.deck = [c('tao', { id: 'normal-draw' })];

  const result = Engine.startTurn(game, 'player');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.phase, 'play');
  assert.deepEqual(ids(game.enemy.hand), []);
  assert.deepEqual(ids(game.player.hand).sort(), ['normal-draw', 'stolen-by-tuxi'].sort());
});

test('周瑜【英姿】 draws three cards in draw phase', () => {
  const game = skillGame('zhouyu', 'sunquan');
  game.deck = [c('sha', { id: 'yingzi-3' }), c('shan', { id: 'yingzi-2' }), c('tao', { id: 'yingzi-1' })];

  const result = Engine.startTurn(game, 'player');

  assert.equal(result.ok, true, result.message);
  assert.deepEqual(ids(game.player.hand), ['yingzi-1', 'yingzi-2', 'yingzi-3']);
});

test('诸葛亮【空城】 prevents Sha and Duel targeting while he has no hand cards', () => {
  const game = skillGame('sunquan', 'zhugeliang');
  game.player.hand = [c('sha', { id: 'kongcheng-sha' }), c('juedou', { id: 'kongcheng-duel' })];
  game.enemy.hand = [];

  const shaCheck = Engine.canPlayCard(game, 'player', game.player.hand[0]);
  assert.equal(shaCheck.ok, false, 'Sha should not be playable against empty-hand Kongcheng');
  assert.match(shaCheck.message, /空城/);

  const duelCheck = Engine.canPlayCard(game, 'player', game.player.hand[1]);
  assert.equal(duelCheck.ok, false, 'Duel should not be playable against empty-hand Kongcheng');
  assert.match(duelCheck.message, /空城/);

  assert.equal(Engine.playCard(game, 'player', 'kongcheng-sha').ok, false);
  assert.equal(game.enemy.hp, game.enemy.maxHp);
  assert.deepEqual(ids(game.player.hand), ['kongcheng-sha', 'kongcheng-duel']);
});
