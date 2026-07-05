// v11 D2 (批次 34): AI 响应决策期望值 (第二批) —
// 1) 八卦优先: AI 座席需要闪时先试八卦判定 (免费闪机会), 红判定省下真闪;
//    黑判定失败仍可出真闪兜底。玩家 auto 座席保持旧顺序 (真闪优先)。
// 2) 贯石斧 EV: AI 来源只在 斩杀压力 (目标血线<=伤害+1) 或 手牌充裕 (>=4)
//    时才弃两张强制命中; 玩家 auto 座席保持旧行为。
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
  const game = Engine.newGame({ seed: opts.seed || 34001, playerHero: opts.playerHero || 'liubei', enemyHero: opts.enemyHero || 'lvmeng' });
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
  game.turn = 'player';
  game.phase = 'play';
  return game;
}

function redJudge(id) { return c('tao', { id, suit: 'heart', rank: '5' }); }
function blackJudge(id) { return c('sha', { id, suit: 'spade', rank: '5' }); }

// ───── 八卦优先 (省闪) ──────────────────────────────────────────────

test('杀 vs AI 八卦+闪: 红判定 → 省下真闪', () => {
  const game = buildGame();
  game.player.hand = [c('sha', { id: 'p-sha' })];
  game.enemy.hand = [c('shan', { id: 'e-shan' })];
  game.enemy.equipment.armor = c('bagua', { id: 'e-bg' });
  game.deck = [redJudge('j-red')];
  const hp = game.enemy.hp;
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'p-sha'));
  assert.equal(game.enemy.hp, hp, '八卦红判定化解');
  assert.ok(game.enemy.hand.some((x) => x.id === 'e-shan'), '真闪保留');
});

test('杀 vs AI 八卦+闪: 黑判定失败 → 真闪兜底, 仍闪避', () => {
  const game = buildGame();
  game.player.hand = [c('sha', { id: 'p-sha' })];
  game.enemy.hand = [c('shan', { id: 'e-shan' })];
  game.enemy.equipment.armor = c('bagua', { id: 'e-bg' });
  game.deck = [blackJudge('j-black')];
  const hp = game.enemy.hp;
  Engine.playCard(game, 'player', 'p-sha');
  assert.equal(game.enemy.hp, hp, '兜底闪化解');
  assert.ok(game.discard.some((x) => x.id === 'e-shan'), '真闪消耗');
  assert.ok(game.discard.some((x) => x.id === 'j-black'), '判定牌消耗');
});

test('无双杀 vs AI 八卦: 两次红判定 → 两张需求全由八卦顶, 真闪保留', () => {
  const game = buildGame({ playerHero: 'lvbu' });
  game.player.hand = [c('sha', { id: 'p-sha' })];
  game.enemy.hand = [c('shan', { id: 'e-shan' })];
  game.enemy.equipment.armor = c('bagua', { id: 'e-bg' });
  game.deck = [redJudge('j-red-1'), redJudge('j-red-2')];
  const hp = game.enemy.hp;
  Engine.playCard(game, 'player', 'p-sha');
  assert.equal(game.enemy.hp, hp, '双需求全由八卦化解');
  assert.ok(game.enemy.hand.some((x) => x.id === 'e-shan'), '真闪保留');
});

test('万箭 vs AI 八卦+闪: 红判定 → 省下真闪', () => {
  const game = buildGame();
  game.player.hand = [c('wanjian', { id: 'p-wj' })];
  game.enemy.hand = [c('shan', { id: 'e-shan' })];
  game.enemy.equipment.armor = c('bagua', { id: 'e-bg' });
  game.deck = [redJudge('j-red')];
  const hp = game.enemy.hp;
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'p-wj'));
  assert.equal(game.enemy.hp, hp);
  assert.ok(game.enemy.hand.some((x) => x.id === 'e-shan'), '真闪保留');
});

test('玩家 auto 座席保持旧序: 真闪优先, 八卦不判定', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.player.hand = [c('shan', { id: 'p-shan' })];
  game.player.equipment.armor = c('bagua', { id: 'p-bg' });
  game.deck = [redJudge('p-unused')];
  const hp = game.player.hp;
  Engine.playCard(game, 'enemy', 'e-sha');
  assert.equal(game.player.hp, hp, '闪化解');
  assert.ok(game.discard.some((x) => x.id === 'p-shan'), '真闪消耗 (旧序)');
  assert.ok(game.deck.some((x) => x.id === 'p-unused'), '八卦未判定 → 判定牌仍在牌堆');
});

// ───── 贯石斧 EV (AI 来源) ──────────────────────────────────────────

test('贯石斧 AI: 无斩杀压力且手牌拮据 → 保留手牌不发动', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.equipment.weapon = c('guanshi', { id: 'e-gs' });
  game.enemy.hand = [c('sha', { id: 'e-sha' }), c('tao', { id: 'keep-1' }), c('tao', { id: 'keep-2' })];
  game.player.hand = [c('shan', { id: 'p-shan' })];
  const hp = game.player.hp;
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'e-sha'));
  assert.equal(game.player.hp, hp, '闪避成立 (未强制命中)');
  assert.equal(game.enemy.hand.length, 2, '两张手牌保留');
  assert.ok(game.log.some((l) => l.includes('不发动【贯石斧】')));
});

test('贯石斧 AI: 斩杀压力 (目标 hp<=2) → 照旧发动强制命中', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.player.hp = 2;
  game.enemy.equipment.weapon = c('guanshi', { id: 'e-gs' });
  game.enemy.hand = [c('sha', { id: 'e-sha' }), c('tao', { id: 'cost-1' }), c('tao', { id: 'cost-2' })];
  game.player.hand = [c('shan', { id: 'p-shan' })];
  Engine.playCard(game, 'enemy', 'e-sha');
  assert.equal(game.player.hp, 1, '强制命中');
  assert.equal(game.enemy.hand.length, 0, '两张成本弃置');
});

test('贯石斧 AI: 手牌充裕 (>=4) → 照旧发动', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.equipment.weapon = c('guanshi', { id: 'e-gs' });
  game.enemy.hand = [
    c('sha', { id: 'e-sha' }),
    c('tao', { id: 'c1' }), c('tao', { id: 'c2' }), c('tao', { id: 'c3' }), c('tao', { id: 'c4' })
  ];
  game.player.hand = [c('shan', { id: 'p-shan' })];
  const hp = game.player.hp;
  Engine.playCard(game, 'enemy', 'e-sha');
  assert.equal(game.player.hp, hp - 1, '强制命中');
  assert.equal(game.enemy.hand.length, 2, '弃两张后剩两张');
});

test('贯石斧 玩家 auto 座席保持旧行为: 无条件发动', () => {
  const game = buildGame();
  game.player.equipment.weapon = c('guanshi', { id: 'p-gs' });
  game.player.hand = [c('sha', { id: 'p-sha' }), c('tao', { id: 'c1' }), c('tao', { id: 'c2' })];
  game.enemy.hand = [c('shan', { id: 'e-shan' })];
  const hp = game.enemy.hp;
  Engine.playCard(game, 'player', 'p-sha');
  assert.equal(game.enemy.hp, hp - 1, '玩家 auto 座席照旧强制命中');
  assert.equal(game.player.hand.length, 0);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
