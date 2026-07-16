// v11 C1 (批次 25): 无双 — 锁定技。吕布的【杀】需目标依次使用两张【闪】;
// 与吕布【决斗】的角色每轮需依次打出两张【杀】。
// 覆盖: 自动路径 (AI/默认同步响应, 含八卦兜底) + 玩家 ask 路径 (第二张
// 响应窗口 shan-response / sha-duel-response 的再询问与放弃分支)。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function buildGame(opts) {
  opts = opts || {};
  const game = Engine.newGame({ seed: opts.seed || 25001, playerHero: opts.playerHero || 'liubei', enemyHero: opts.enemyHero || 'lvbu' });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].flags = {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp;
    game[actor].skillPreferences = {};
  }
  game.turn = 'enemy';
  game.phase = 'play';
  return game;
}

// judge() 用 game.deck.pop() 取判定牌 → 牌堆末位即第一次判定结果。
function redJudge(id) { return c('tao', { id, suit: 'heart', rank: '5' }); }
function blackJudge(id) { return c('sha', { id, suit: 'spade', rank: '5' }); }

// ───── 杀: 自动响应路径 ─────────────────────────────────────────────

test('无双 杀: 目标只有 1 张闪 → 闪被消耗但仍命中', () => {
  const game = buildGame();
  game.enemy.hand = [c('sha', { id: 'esha' })];
  game.player.hand = [c('shan', { id: 'pshan' })];
  const hp = game.player.hp;
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'enemy', 'esha');
    assert.equal(r.ok, true);
  });
  assert.equal(game.player.hp, hp - 1, '一张闪不够 → 命中');
  assert.equal(game.player.hand.length, 0, '打出的闪照常消耗');
  assert.ok(game.log.some((l) => l.includes('【无双】')), '有无双日志');
});

test('无双 杀: 目标有 2 张闪 → 依次消耗两张, 闪避', () => {
  const game = buildGame();
  game.enemy.hand = [c('sha', { id: 'esha' })];
  game.player.hand = [c('shan', { id: 'pshan1' }), c('shan', { id: 'pshan2' })];
  const hp = game.player.hp;
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'esha'));
  assert.equal(game.player.hp, hp, '两张闪 → 闪避');
  assert.equal(game.player.hand.length, 0, '两张闪都被消耗');
});

test('回归: 非吕布的杀 1 张闪即可闪避', () => {
  const game = buildGame({ enemyHero: 'lvmeng' });
  game.enemy.hand = [c('sha', { id: 'esha' })];
  game.player.hand = [c('shan', { id: 'pshan1' }), c('shan', { id: 'pshan2' })];
  const hp = game.player.hp;
  Engine.playCard(game, 'enemy', 'esha');
  assert.equal(game.player.hp, hp);
  assert.equal(game.player.hand.length, 1, '只消耗 1 张闪');
});

test('无双 杀 + 八卦: 首判黑靠真闪、二判红顶第二张 → 闪避 (v13 J0-3 逐需求八卦先行)', () => {
  const game = buildGame();
  game.enemy.hand = [c('sha', { id: 'esha' })];
  game.player.hand = [c('shan', { id: 'pshan' })];
  game.player.equipment.armor = c('bagua', { id: 'bg1' });
  // deck.pop() 先取末位 → 第一需求判黑 (八卦失败→真闪), 第二需求判红 (八卦顶上)
  game.deck = [redJudge('j-red'), blackJudge('j-black')];
  const hp = game.player.hp;
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'esha'));
  assert.equal(game.player.hp, hp, '闪 + 八卦红判定 → 抵消两张需求');
  assert.equal(game.player.hand.length, 0);
});

test('无双 杀 + 八卦: 红判定顶第一张 + 真闪第二张 → 闪避且省一张闪 (八卦先行)', () => {
  const game = buildGame();
  game.enemy.hand = [c('sha', { id: 'esha' })];
  game.player.hand = [c('shan', { id: 'pshan' }), c('shan', { id: 'pshan-keep' })];
  game.player.equipment.armor = c('bagua', { id: 'bg1' });
  // 第一需求判红 (八卦先行省闪), 第二需求判黑 (真闪兜底)
  game.deck = [blackJudge('j-black'), redJudge('j-red')];
  const hp = game.player.hp;
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'esha'));
  assert.equal(game.player.hp, hp, '八卦红 + 真闪 → 闪避');
  assert.equal(game.player.hand.length, 1, '八卦先行省下一张闪');
});

test('无双 杀 + 八卦: 无闪, 两次红判定 → 闪避', () => {
  const game = buildGame();
  game.enemy.hand = [c('sha', { id: 'esha' })];
  game.player.equipment.armor = c('bagua', { id: 'bg1' });
  game.deck = [redJudge('j-red-1'), redJudge('j-red-2')];
  const hp = game.player.hp;
  Engine.playCard(game, 'enemy', 'esha');
  assert.equal(game.player.hp, hp, '两次八卦红判定 → 闪避');
});

test('无双 杀 + 八卦: 首判红二判黑 → 命中', () => {
  const game = buildGame();
  game.enemy.hand = [c('sha', { id: 'esha' })];
  game.player.equipment.armor = c('bagua', { id: 'bg1' });
  // deck.pop() 先取末位 → 第一判红, 第二判黑
  game.deck = [blackJudge('j-black'), redJudge('j-red')];
  const hp = game.player.hp;
  Engine.playCard(game, 'enemy', 'esha');
  assert.equal(game.player.hp, hp - 1, '第二张需求判黑 → 命中');
});

// ───── 杀: 玩家 ask 路径 (shan-response 第二窗口) ────────────────────

function askShaSetup() {
  const game = buildGame();
  game.player.skillPreferences.shanResponse = 'ask';
  game.enemy.hand = [c('sha', { id: 'esha' })];
  return game;
}

test('无双 杀 ask: 首张闪后再开第二个 shan-response 窗口', () => {
  const game = askShaSetup();
  game.player.hand = [c('shan', { id: 'pshan1' }), c('shan', { id: 'pshan2' })];
  Engine.playCard(game, 'enemy', 'esha');
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'shan-response');
  assert.equal(game.pauseState.shaResponse.shanRemaining, 2, '首窗口带 shanRemaining=2');

  const r1 = Engine.resolvePendingChoice(game, { cardId: 'pshan1' });
  assert.equal(r1.ok, true);
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'shan-response', '第二窗口');
  assert.equal(game.pauseState.shaResponse.shanRemaining, 1);
  assert.ok(game.log.some((l) => l.includes('【无双】')), '第二窗口有无双日志');

  const hp = game.player.hp;
  const r2 = Engine.resolvePendingChoice(game, { cardId: 'pshan2' });
  assert.equal(r2.ok, true);
  assert.equal(game.pendingChoice, null);
  assert.equal(game.player.hp, hp, '两张闪 → 闪避');
  assert.equal(game.player.hand.length, 0);
});

test('无双 杀 ask: 首张闪后放弃第二张 → 命中', () => {
  const game = askShaSetup();
  game.player.hand = [c('shan', { id: 'pshan1' }), c('shan', { id: 'pshan2' })];
  Engine.playCard(game, 'enemy', 'esha');
  Engine.resolvePendingChoice(game, { cardId: 'pshan1' });
  const hp = game.player.hp;
  Engine.resolvePendingChoice(game, {}); // 第二窗口放弃
  assert.equal(game.pendingChoice, null);
  assert.equal(game.player.hp, hp - 1, '第二张放弃 → 命中');
  assert.equal(game.player.hand.length, 1, '第二张闪保留');
});

test('无双 杀 ask: 只有 1 张闪, 打出后无第二张 → 命中 (窗口不再开)', () => {
  const game = askShaSetup();
  game.player.hand = [c('shan', { id: 'pshan1' })];
  Engine.playCard(game, 'enemy', 'esha');
  const hp = game.player.hp;
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'pshan1' }));
  assert.equal(game.pendingChoice, null, '无第二张可出 → 不再开窗口');
  assert.equal(game.player.hp, hp - 1);
});

test('无双 杀 ask: 首窗口直接放弃 → 命中 (与单张需求一致)', () => {
  const game = askShaSetup();
  game.player.hand = [c('shan', { id: 'pshan1' })];
  Engine.playCard(game, 'enemy', 'esha');
  const hp = game.player.hp;
  Engine.resolvePendingChoice(game, {});
  assert.equal(game.player.hp, hp - 1);
  assert.equal(game.player.hand.length, 1, '闪保留');
});

test('无双 杀 ask + 八卦: 1 张闪打出 + 红判定顶第二张 → 闪避', () => {
  const game = askShaSetup();
  game.player.hand = [c('shan', { id: 'pshan1' })];
  game.player.equipment.armor = c('bagua', { id: 'bg1' });
  game.deck = [redJudge('j-red')];
  Engine.playCard(game, 'enemy', 'esha');
  const hp = game.player.hp;
  Engine.resolvePendingChoice(game, { cardId: 'pshan1' });
  assert.equal(game.player.hp, hp, '闪 + 八卦红判定 → 闪避');
});

test('无双 杀 ask + 八卦: 首窗口放弃 → 需连续两次红判定', () => {
  const game = askShaSetup();
  game.player.hand = [c('shan', { id: 'pshan1' })];
  game.player.equipment.armor = c('bagua', { id: 'bg1' });
  game.deck = [redJudge('j-red-1'), redJudge('j-red-2')];
  Engine.playCard(game, 'enemy', 'esha');
  const hp = game.player.hp;
  Engine.resolvePendingChoice(game, {});
  assert.equal(game.player.hp, hp, '两次红判定 → 闪避');
  assert.equal(game.player.hand.length, 1, '闪未消耗');
});

// ───── 决斗: 自动路径 ───────────────────────────────────────────────

test('无双 决斗 auto: 对手只有 1 张杀 → 打出后仍受伤', () => {
  const game = buildGame({ playerHero: 'lvbu', enemyHero: 'lvmeng' });
  game.turn = 'player';
  game.player.hand = [c('juedou', { id: 'pj' })];
  game.enemy.hand = [c('sha', { id: 'esha' })];
  const hp = game.enemy.hp;
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'player', 'pj');
    assert.equal(r.ok, true);
  });
  assert.equal(game.enemy.hp, hp - 1, '1 张杀不够 → 受伤');
  assert.equal(game.enemy.hand.length, 0, '打出的杀照常消耗');
  assert.ok(game.log.some((l) => l.includes('【无双】')), '有无双日志');
});

test('无双 决斗 auto: 对手 2 张杀顶过一轮 → 轮回吕布 (无杀 → 吕布受伤)', () => {
  const game = buildGame({ playerHero: 'lvbu', enemyHero: 'lvmeng' });
  game.turn = 'player';
  game.player.hand = [c('juedou', { id: 'pj' })];
  game.enemy.hand = [c('sha', { id: 'esha1' }), c('sha', { id: 'esha2' })];
  const php = game.player.hp;
  const ehp = game.enemy.hp;
  Engine.playCard(game, 'player', 'pj');
  assert.equal(game.enemy.hp, ehp, '两张杀顶过 → 对手不受伤');
  assert.equal(game.enemy.hand.length, 0);
  assert.equal(game.player.hp, php - 1, '轮回吕布无杀 → 吕布受伤');
});

test('回归: 非吕布决斗 1 张杀即顶过一轮', () => {
  const game = buildGame({ playerHero: 'liubei', enemyHero: 'lvmeng' });
  game.turn = 'player';
  game.player.hand = [c('juedou', { id: 'pj' })];
  game.enemy.hand = [c('sha', { id: 'esha1' }), c('sha', { id: 'esha2' })];
  const php = game.player.hp;
  Engine.playCard(game, 'player', 'pj');
  assert.equal(game.enemy.hand.length, 1, '只消耗 1 张杀');
  assert.equal(game.player.hp, php - 1, '轮回玩家无杀 → 玩家受伤');
});

// ───── 决斗: 玩家 ask 路径 (sha-duel-response 再询问) ────────────────

function askDuelSetup() {
  const game = buildGame({ playerHero: 'liubei', enemyHero: 'lvbu' });
  game.player.skillPreferences.shaDuelResponse = 'ask';
  game.enemy.hand = [c('juedou', { id: 'ej' })];
  return game;
}

test('无双 决斗 ask: 首张杀后再询问第二张', () => {
  const game = askDuelSetup();
  game.player.hand = [c('sha', { id: 'psha1' }), c('sha', { id: 'psha2' })];
  Engine.playCard(game, 'enemy', 'ej');
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'sha-duel-response');

  const r1 = Engine.resolvePendingChoice(game, { use: true });
  assert.equal(r1.ok, true);
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'sha-duel-response', '第二张询问');
  assert.ok(game.log.some((l) => l.includes('【无双】')), '有无双日志');

  const ehp = game.enemy.hp;
  const r2 = Engine.resolvePendingChoice(game, { use: true });
  assert.equal(r2.ok, true);
  assert.equal(game.pendingChoice, null);
  assert.equal(game.pauseState.duelChain, null);
  assert.equal(game.player.hand.length, 0, '两张杀都被消耗');
  assert.equal(game.enemy.hp, ehp - 1, '轮到吕布无杀 → 吕布受伤');
});

test('无双 决斗 ask: 只有 1 张杀 → 打出后无第二张, 玩家受伤', () => {
  const game = askDuelSetup();
  game.player.hand = [c('sha', { id: 'psha1' })];
  Engine.playCard(game, 'enemy', 'ej');
  const hp = game.player.hp;
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { use: true }));
  assert.equal(game.pendingChoice, null);
  assert.equal(game.pauseState.duelChain, null);
  assert.equal(game.player.hp, hp - 1, '无法凑齐两张 → 受伤');
  assert.equal(game.player.hand.length, 0, '打出的杀照常消耗');
});

test('无双 决斗 ask: 第二张询问时放弃 → 玩家受伤, 第二张保留', () => {
  const game = askDuelSetup();
  game.player.hand = [c('sha', { id: 'psha1' }), c('sha', { id: 'psha2' })];
  Engine.playCard(game, 'enemy', 'ej');
  Engine.resolvePendingChoice(game, { use: true });
  const hp = game.player.hp;
  Engine.resolvePendingChoice(game, { use: false });
  assert.equal(game.pendingChoice, null);
  assert.equal(game.player.hp, hp - 1);
  assert.equal(game.player.hand.length, 1, '第二张杀保留');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
