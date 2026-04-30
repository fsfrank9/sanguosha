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
    game[actor].usedOrRespondedSha = false;
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

test('马超【铁骑】 non-red judgment keeps normal Shan response available', () => {
  const game = skillGame('machao', 'sunquan');
  game.player.hand = [c('sha', { id: 'tieqi-black-sha' })];
  game.enemy.hand = [c('shan', { id: 'tieqi-allowed-shan' })];
  game.deck = [c('sha', { id: 'tieqi-black-judge', suit: 'spade', color: 'black' })];

  const result = Engine.playCard(game, 'player', 'tieqi-black-sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp, 'non-red Tieqi judgment should still allow Shan to dodge');
  assert.deepEqual(ids(game.enemy.hand), [], 'target should consume Shan after non-red Tieqi');
  assert.ok(game.log.some((entry) => /铁骑/.test(entry) && /判定未命中/.test(entry)), 'non-red Tieqi miss should be logged');
});

test('马超【铁骑】 red judgment suppresses Bagua automatic Shan', () => {
  const game = skillGame('machao', 'sunquan');
  game.player.hand = [c('sha', { id: 'tieqi-bagua-sha' })];
  game.enemy.hand = [];
  game.enemy.equipment.armor = c('bagua', { id: 'tieqi-bagua' });
  game.deck = [
    c('tao', { id: 'bagua-red-judge-would-dodge', suit: 'heart', color: 'red' }),
    c('tao', { id: 'tieqi-red-judge-before-bagua', suit: 'heart', color: 'red' })
  ];

  const result = Engine.playCard(game, 'player', 'tieqi-bagua-sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, 'red Tieqi should force damage before Bagua can provide Shan');
  assert.deepEqual(game.deck.map((card) => card.id), ['bagua-red-judge-would-dodge'], 'Bagua should not consume a judgment after red Tieqi locks response');
  assert.ok(!game.log.some((entry) => /八卦阵/.test(entry)), 'Bagua should not trigger after red Tieqi locks response');
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

test('貂蝉【闭月】 draws one card before the next turn via endTurn and advancePhase', () => {
  const viaEndTurn = skillGame('diaochan', 'sunquan');
  viaEndTurn.phase = 'finish';
  viaEndTurn.deck = [c('sha', { id: 'biyue-endturn-draw' })];

  const endResult = Engine.endTurn(viaEndTurn);

  assert.equal(endResult.ok, true, endResult.message);
  assert.equal(viaEndTurn.turn, 'enemy');
  assert.deepEqual(ids(viaEndTurn.player.hand), ['biyue-endturn-draw']);
  assert.deepEqual(ids(viaEndTurn.enemy.hand), [], 'opponent should not take the Biyue card before their turn starts');
  assert.ok(viaEndTurn.log.some((entry) => /闭月/.test(entry)), 'Biyue trigger should be logged');

  const viaAdvance = skillGame('diaochan', 'sunquan');
  viaAdvance.phase = 'finish';
  viaAdvance.deck = [c('shan', { id: 'biyue-advance-draw' })];

  const advanceResult = Engine.advancePhase(viaAdvance);

  assert.equal(advanceResult.ok, true, advanceResult.message);
  assert.equal(viaAdvance.turn, 'enemy');
  assert.deepEqual(ids(viaAdvance.player.hand), ['biyue-advance-draw']);
  assert.deepEqual(ids(viaAdvance.enemy.hand), [], 'advancePhase should run Biyue before starting the opponent turn');
});

test('吕蒙【克己】 skips discard from finishPlayPhase and advancePhase if no Sha was used', () => {
  const direct = skillGame('lvmeng', 'sunquan');
  direct.turnHistory = [];
  direct.player.hp = 2;
  direct.player.hand = [
    c('sha', { id: 'keji-direct-1' }),
    c('shan', { id: 'keji-direct-2' }),
    c('tao', { id: 'keji-direct-3' }),
    c('jiu', { id: 'keji-direct-4' })
  ];

  const finishResult = Engine.finishPlayPhase(direct);

  assert.equal(finishResult.ok, true, finishResult.message);
  assert.equal(direct.phase, 'finish');
  assert.equal(Engine.needsDiscard(direct, 'player'), true, 'hand remains over limit, so only Keji can skip discard');
  assert.deepEqual(direct.turnHistory.map((entry) => entry.phase), ['finish']);
  assert.ok(direct.log.some((entry) => /克己/.test(entry)), 'Keji skip should be logged');

  const automatic = skillGame('lvmeng', 'sunquan');
  automatic.player.hp = 2;
  automatic.player.hand = [
    c('sha', { id: 'keji-auto-1' }),
    c('shan', { id: 'keji-auto-2' }),
    c('tao', { id: 'keji-auto-3' }),
    c('jiu', { id: 'keji-auto-4' })
  ];

  const advanceResult = Engine.advancePhase(automatic);

  assert.equal(advanceResult.ok, true, advanceResult.message);
  assert.equal(automatic.phase, 'finish');
});

test('吕蒙【克己】 does not skip discard after using Sha this turn', () => {
  const game = skillGame('lvmeng', 'sunquan');
  game.player.hp = 3;
  game.player.hand = [
    c('sha', { id: 'keji-used-sha' }),
    c('shan', { id: 'keji-over-limit-1' }),
    c('tao', { id: 'keji-over-limit-2' }),
    c('jiu', { id: 'keji-over-limit-3' }),
    c('shan', { id: 'keji-over-limit-4' })
  ];
  game.enemy.hand = [];

  const shaResult = Engine.playCard(game, 'player', 'keji-used-sha');
  const finishResult = Engine.finishPlayPhase(game);

  assert.equal(shaResult.ok, true, shaResult.message);
  assert.equal(game.player.usedSha, true);
  assert.equal(finishResult.ok, true, finishResult.message);
  assert.equal(game.phase, 'discard');
  assert.equal(Engine.needsDiscard(game, 'player'), true);
});

test('吕蒙【克己】 does not skip discard after responding with Sha this turn', () => {
  const game = skillGame('lvmeng', 'sunquan');
  game.player.hp = 2;
  game.player.hand = [
    c('juedou', { id: 'keji-duel' }),
    c('sha', { id: 'keji-response-sha' }),
    c('shan', { id: 'keji-response-over-1' }),
    c('tao', { id: 'keji-response-over-2' }),
    c('jiu', { id: 'keji-response-over-3' })
  ];
  game.enemy.hand = [c('sha', { id: 'enemy-duel-sha' })];

  const duelResult = Engine.playCard(game, 'player', 'keji-duel');
  const finishResult = Engine.finishPlayPhase(game);

  assert.equal(duelResult.ok, true, duelResult.message);
  assert.equal(game.player.usedSha, false, 'responding with Sha should not consume the normal Sha usage limit');
  assert.equal(game.player.usedOrRespondedSha, true, 'responding with Sha during your turn counts for Keji');
  assert.equal(finishResult.ok, true, finishResult.message);
  assert.equal(game.phase, 'discard');
  assert.equal(Engine.needsDiscard(game, 'player'), true);
});

test('responding with Sha during your Duel does not block a later normal Sha use', () => {
  const game = skillGame('sunquan', 'caocao');
  game.player.hand = [
    c('juedou', { id: 'duel-before-sha' }),
    c('sha', { id: 'duel-response-sha' }),
    c('sha', { id: 'normal-sha-after-response' })
  ];
  game.enemy.hand = [c('sha', { id: 'enemy-duel-response' })];

  const duelResult = Engine.playCard(game, 'player', 'duel-before-sha');
  const shaResult = Engine.playCard(game, 'player', 'normal-sha-after-response');

  assert.equal(duelResult.ok, true, duelResult.message);
  assert.equal(game.player.usedSha, true, 'normal Sha should consume the once-per-turn usage limit');
  assert.equal(shaResult.ok, true, shaResult.message);
  assert.equal(game.player.hand.length, 0);
});

test('黄月英【集智】 draws one extra card after a successful normal trick', () => {
  const game = skillGame('huangyueying', 'sunquan');
  game.player.hand = [c('wuzhong', { id: 'jizhi-wuzhong' })];
  game.deck = [
    c('shan', { id: 'wuzhong-draw-2' }),
    c('sha', { id: 'wuzhong-draw-1' }),
    c('tao', { id: 'jizhi-extra-draw' })
  ];

  const result = Engine.playCard(game, 'player', 'jizhi-wuzhong');

  assert.equal(result.ok, true, result.message);
  assert.deepEqual(ids(game.player.hand).sort(), ['jizhi-extra-draw', 'wuzhong-draw-1', 'wuzhong-draw-2'].sort());
  assert.ok(game.log.some((entry) => /集智/.test(entry)), 'Jizhi trigger should be logged');
});

test('黄月英【集智】 triggers when she uses Wuxie as a response', () => {
  const game = skillGame('sunquan', 'huangyueying');
  game.player.hand = [c('guohe', { id: 'jizhi-wuxie-target-trick' })];
  game.enemy.hand = [c('wuxie', { id: 'jizhi-wuxie-response' })];
  game.deck = [c('tao', { id: 'jizhi-wuxie-draw' })];

  const result = Engine.playCard(game, 'player', 'jizhi-wuxie-target-trick');

  assert.equal(result.ok, true, result.message);
  assert.deepEqual(ids(game.enemy.hand), ['jizhi-wuxie-draw']);
  assert.ok(game.log.some((entry) => /集智/.test(entry)), 'Wuxie response should trigger Jizhi');
});

test('黄月英【集智】 does not trigger for basic, equipment, delayed, or failed card use', () => {
  const basic = skillGame('huangyueying', 'sunquan');
  basic.player.hand = [c('sha', { id: 'jizhi-basic-sha' })];
  basic.enemy.hand = [];
  basic.deck = [c('tao', { id: 'should-stay-basic' })];
  assert.equal(Engine.playCard(basic, 'player', 'jizhi-basic-sha').ok, true);
  assert.deepEqual(ids(basic.player.hand), []);
  assert.equal(basic.deck.length, 1);

  const equipment = skillGame('huangyueying', 'sunquan');
  equipment.player.hand = [c('zhuge', { id: 'jizhi-equipment-zhuge' })];
  equipment.deck = [c('tao', { id: 'should-stay-equipment' })];
  assert.equal(Engine.playCard(equipment, 'player', 'jizhi-equipment-zhuge').ok, true);
  assert.deepEqual(ids(equipment.player.hand), []);
  assert.equal(equipment.deck.length, 1);

  const delayed = skillGame('huangyueying', 'sunquan');
  delayed.player.hand = [c('lebusishu', { id: 'jizhi-delayed-lebu' })];
  delayed.deck = [c('tao', { id: 'should-stay-delayed' })];
  assert.equal(Engine.playCard(delayed, 'player', 'jizhi-delayed-lebu').ok, true);
  assert.deepEqual(ids(delayed.player.hand), []);
  assert.equal(delayed.deck.length, 1);

  const illegal = skillGame('huangyueying', 'zhugeliang');
  illegal.player.hand = [c('juedou', { id: 'jizhi-illegal-duel' })];
  illegal.enemy.hand = [];
  illegal.deck = [c('tao', { id: 'should-stay-illegal' })];
  const illegalResult = Engine.playCard(illegal, 'player', 'jizhi-illegal-duel');
  assert.equal(illegalResult.ok, false);
  assert.deepEqual(ids(illegal.player.hand), ['jizhi-illegal-duel']);
  assert.equal(illegal.deck.length, 1);
});
