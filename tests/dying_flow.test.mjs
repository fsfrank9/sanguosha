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

// --- C1 + C2: 体力值可降至负数 + 同一响应者可连续出多张【桃】 ---
// gltjk flow__neardeath.md：1 体力角色受【闪电】3 点伤害后为 -2，需 3 张【桃】
// 才能回到 +1；同一响应者可连续出【桃】「直到将体力值首次回复至1点或以上」。

test('C1+C2: 【酒】+【杀】对 1 体力玩家造成 2 点伤害 → hp 降至 -1 (不再 clamp 到 0)', () => {
  const game = buildGame();
  game.player.hp = 1;
  game.player.hand = [tao('c1-tao-a'), tao('c1-tao-b')]; // 无【闪】, 无法闪避
  // player default = ask → 命中后暂停等救援, 可观察到负血
  game.enemy.hand = [jiu('c1-jiu'), sha('c1-sha')];
  game.turn = 'enemy';
  Engine.playCard(game, 'enemy', 'c1-jiu'); // 本回合下一张【杀】+1 伤害
  Engine.playCard(game, 'enemy', 'c1-sha'); // 2 点伤害命中
  assert.equal(game.player.hp, -1, 'hp 应为 -1 (1 - 2), 不再 clamp 到 0');
  assert.ok(game.pendingChoice, '应暂停等待玩家救援');
  assert.equal(game.pendingChoice.kind, 'dying-rescue');
  assert.deepEqual(game.pendingChoice.taoIds.sort(), ['c1-tao-a', 'c1-tao-b']);
});

test('C2: ask 路径 — 第一张【桃】只回到 0 → 再次询问同一响应者出第二张【桃】 → 存活', () => {
  const game = buildGame();
  game.player.hp = 1;
  game.player.hand = [tao('c2-tao-a'), tao('c2-tao-b')];
  game.enemy.hand = [jiu('c2-jiu'), sha('c2-sha')];
  game.turn = 'enemy';
  Engine.playCard(game, 'enemy', 'c2-jiu');
  Engine.playCard(game, 'enemy', 'c2-sha');
  assert.equal(game.player.hp, -1);

  // 第一张【桃】: -1 → 0, 仍未回到 1 → 应重新询问同一响应者 (再次 pendingChoice)
  const r1 = Engine.resolvePendingChoice(game, { cardId: 'c2-tao-a' });
  assert.equal(r1.ok, true);
  assert.equal(game.player.hp, 0, '第一张桃后 hp = 0, 仍濒死');
  assert.ok(game.pendingChoice, 'C2: 同一响应者被再次询问 (而非直接死亡)');
  assert.equal(game.pendingChoice.kind, 'dying-rescue');
  assert.deepEqual(game.pendingChoice.taoIds, ['c2-tao-b'], '剩余可用【桃】更新为第二张');
  assert.equal(game.phase, 'play', '尚未 game-over');

  // 第二张【桃】: 0 → 1 → 存活
  const r2 = Engine.resolvePendingChoice(game, { cardId: 'c2-tao-b' });
  assert.equal(r2.ok, true);
  assert.equal(game.player.hp, 1, '第二张桃后 hp = 1, 脱离濒死');
  assert.equal(game.phase, 'play');
  assert.ok(!game.pendingChoice, '濒死结算完成');
  assert.ok(game.discard.some((c) => c.id === 'c2-tao-a'), '第一张桃已消耗');
  assert.ok(game.discard.some((c) => c.id === 'c2-tao-b'), '第二张桃已消耗');
});

test('C2: auto 路径 — 深度致命伤自动连出 2 张【桃】救回', () => {
  const game = buildGame();
  game.player.hp = 1;
  game.player.hand = [tao('c2a-tao-a'), tao('c2a-tao-b')];
  game.player.skillPreferences.dying = 'auto';
  game.enemy.hand = [jiu('c2a-jiu'), sha('c2a-sha')];
  game.turn = 'enemy';
  Engine.playCard(game, 'enemy', 'c2a-jiu');
  Engine.playCard(game, 'enemy', 'c2a-sha');
  assert.equal(game.phase, 'play', 'auto 连续自救后存活');
  assert.equal(game.player.hp, 1, 'hp -1 → 0 → 1');
  assert.ok(game.discard.some((c) => c.id === 'c2a-tao-a'), '第一张桃已消耗');
  assert.ok(game.discard.some((c) => c.id === 'c2a-tao-b'), '第二张桃已消耗');
});

test('C1: 桃数量不足以抵消深度致命伤 → 死亡 (旧 clamp-to-0 下会错误存活)', () => {
  const game = buildGame();
  game.player.hp = 1;
  game.player.hand = [tao('c1d-tao')]; // 只有 1 张桃, 不足以从 -1 回到 1
  game.player.skillPreferences.dying = 'auto';
  game.enemy.hand = [jiu('c1d-jiu'), sha('c1d-sha')];
  game.turn = 'enemy';
  Engine.playCard(game, 'enemy', 'c1d-jiu');
  Engine.playCard(game, 'enemy', 'c1d-sha');
  // -1 → 用唯一的桃 → 0 → 无更多救援牌 → 死亡
  assert.equal(game.phase, 'gameover', '1 张桃无法抵消 2 点致命伤 (-1) → 死');
  assert.equal(game.winner, 'enemy');
  assert.ok(game.discard.some((c) => c.id === 'c1d-tao'), '唯一的桃仍被尝试使用');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
