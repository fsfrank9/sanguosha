import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function buildGame(opts) {
  opts = opts || {};
  const game = Engine.newGame({ seed: 90, playerHero: opts.playerHero || 'liubei', enemyHero: opts.enemyHero || 'caocao' });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].flags = {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp;
  }
  game.turn = 'player';
  game.phase = 'play';
  return game;
}

function tao(id) {
  return { id, type: 'tao', name: '桃', suit: 'heart', color: 'red' };
}
function jiu(id) {
  return { id, type: 'jiu', name: '酒', suit: 'spade', color: 'black' };
}
function sha(id) {
  return { id, type: 'sha', name: '杀', suit: 'spade', color: 'black' };
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v7 PR-13: 玩家受致命伤但有【桃】+ auto pref → 自救存活', () => {
  const game = buildGame();
  game.player.hp = 1;
  game.player.hand = [tao('rescue-tao')];
  game.player.skillPreferences.dying = 'auto';
  game.enemy.hand = [sha('killing-sha')];
  game.turn = 'enemy';
  // 直接调用 damage 模拟攻击
  // 用 Engine 内部 damage 不容易；改用 playCard 让 enemy 打杀
  game.phase = 'play';
  Engine.playCard(game, 'enemy', 'killing-sha');
  // 杀命中 player; player.hp 0 → 进入濒死 → auto 用 桃 自救
  assert.equal(game.phase, 'play', '未 game-over');
  assert.equal(game.player.hp, 1, '回复到 1');
  assert.ok(game.discard.some((c) => c.id === 'rescue-tao'), '桃 已消耗');
});

test('v7 PR-13: 玩家致命伤但没有【桃】/【酒】→ 死亡', () => {
  const game = buildGame();
  game.player.hp = 1;
  game.player.hand = [sha('no-rescue')];
  game.enemy.hand = [sha('lethal-sha')];
  game.turn = 'enemy';
  Engine.playCard(game, 'enemy', 'lethal-sha');
  assert.equal(game.phase, 'gameover');
  assert.equal(game.winner, 'enemy');
});

test('v7 PR-13: 玩家有【酒】+ auto pref → 用酒(使用方法Ⅱ) 自救', () => {
  const game = buildGame();
  game.player.hp = 1;
  game.player.hand = [jiu('rescue-jiu')];
  game.player.skillPreferences.dying = 'auto';
  game.enemy.hand = [sha('killing-sha-2')];
  game.turn = 'enemy';
  Engine.playCard(game, 'enemy', 'killing-sha-2');
  assert.equal(game.phase, 'play');
  assert.equal(game.player.hp, 1);
  assert.ok(game.discard.some((c) => c.id === 'rescue-jiu'), '酒 已消耗 (Method II)');
});

test('v7 PR-13: 玩家有【桃】+ player default ask → pendingChoice "dying-rescue"', () => {
  const game = buildGame();
  game.player.hp = 1;
  game.player.hand = [tao('ask-tao')];
  // player default = ask
  game.enemy.hand = [sha('cause-lethal')];
  game.turn = 'enemy';
  Engine.playCard(game, 'enemy', 'cause-lethal');
  assert.ok(game.pendingChoice, '应当 pause 等玩家选');
  assert.equal(game.pendingChoice.kind, 'dying-rescue');
  assert.equal(game.pendingChoice.actor, 'player');
  assert.equal(game.pendingChoice.dyingActor, 'player');
  assert.deepEqual(game.pendingChoice.taoIds, ['ask-tao']);
  assert.equal(game.phase, 'play', '未 game-over (等响应)');
  assert.equal(game.player.hp, 0, 'hp 仍为 0 (尚未救援)');
});

test('v7 PR-13: resolve {cardId:tao-id} → 救活', () => {
  const game = buildGame();
  game.player.hp = 1;
  game.player.hand = [tao('resolve-tao')];
  game.enemy.hand = [sha('rs-lethal')];
  game.turn = 'enemy';
  Engine.playCard(game, 'enemy', 'rs-lethal');
  const result = Engine.resolvePendingChoice(game, { cardId: 'resolve-tao' });
  assert.equal(result.ok, true);
  assert.equal(game.player.hp, 1);
  assert.equal(game.phase, 'play');
});

test('v7 PR-13: resolve {decline:true} → player 跳过响应；enemy auto → 不救 → 死', () => {
  const game = buildGame();
  game.player.hp = 1;
  game.player.hand = [tao('declined-tao')];
  game.enemy.hand = [sha('decl-lethal')];
  game.turn = 'enemy';
  Engine.playCard(game, 'enemy', 'decl-lethal');
  const result = Engine.resolvePendingChoice(game, { decline: true });
  assert.equal(result.ok, true);
  assert.equal(game.phase, 'gameover', 'player 选不救 + enemy 不救 → 死');
  assert.equal(game.winner, 'enemy');
});

test('v7 PR-13: 苦肉 hp=1 → 0，有【桃】自救 (auto) → 存活', () => {
  const game = buildGame({ playerHero: 'huanggai' });
  game.player.hp = 1;
  game.player.hand = [tao('kurou-rescue')];
  game.player.skillPreferences.dying = 'auto';
  // 苦肉 摸 2 张牌
  game.deck = [sha('k1'), sha('k2')];
  const result = Engine.useSkill(game, 'player', 'kurou');
  assert.equal(result.ok, true);
  // hp goes 1→0 → dying → auto 桃 → hp=1
  assert.equal(game.player.hp, 1);
  assert.equal(game.phase, 'play');
});

test('v7 PR-13: AI 对手不救玩家 (responder !== dyingActor + auto → skip)', () => {
  const game = buildGame();
  // 让 player 拿不动桃但 enemy 有桃；测 enemy 不会救
  game.player.hp = 1;
  game.player.hand = [sha('no-tao')];
  game.enemy.hand = [tao('foe-tao'), sha('foe-lethal')];
  game.turn = 'enemy';
  Engine.playCard(game, 'enemy', 'foe-lethal');
  // player no rescue → skip; enemy has tao but pref=auto + responder!=dyingActor → skip
  assert.equal(game.phase, 'gameover');
  assert.equal(game.winner, 'enemy');
  // enemy's tao should still be in hand
  assert.ok(game.enemy.hand.some((c) => c.id === 'foe-tao'), 'enemy 不会自动救 player → 桃 保留');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
