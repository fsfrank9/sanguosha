// v13 J1: 遗计逐席分牌 — 官方 (card__hero__wei.md 标/1V1/3V3/国-标 变体):
// "每当你受到1点伤害后，你可以观看牌堆顶的两张牌，然后将其中的一张牌交给
// 一名角色，将另一张牌交给一名角色。" → 每张牌可分给任意存活座席 (含自留)。
// 此前 resolveYijiDistributeChoice 分配目标恒 opponent(actor) (v12 记录在案
// 的功能偏差)。decision.assignments = [{cardId, seat}]; 旧 giveIds 兼容
// (→ 全部交给 1v1 对手, 行为零回归)。AI auto 路径新增盟友补血线启发。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

// 3 人身份场: player=郭嘉(遗计) 主公, enemy 反贼, ally 忠臣。
function build3p(opts) {
  opts = opts || {};
  const game = Engine.newGame({
    seed: opts.seed || 13101,
    seats: ['player', 'enemy', 'ally'],
    playerHero: 'guojia',
    enemyHero: 'caocao',
    allyHero: 'liubei'
  });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const actor of ['player', 'enemy', 'ally']) {
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

function build1v1() {
  const game = Engine.newGame({ seed: 13102, playerHero: 'guojia', enemyHero: 'caocao' });
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

test('J1: ask 路径 pending 携带可分配座席清单 (3p 两席)', () => {
  const game = build3p();
  game.player.skillPreferences.yiji = 'ask';
  game.deck = [c('tao', { id: 'y1' }), c('shan', { id: 'y2' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  Engine.playCard(game, 'enemy', 'e-sha', { target: 'player' });
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'yiji-distribute');
  const seats = game.pendingChoice.seats.map((s) => s.seat).sort();
  assert.deepEqual(seats, ['ally', 'enemy'], '可分配座席 = 其他存活座席');
});

test('J1: assignments 逐席分配 — 一张给第三席, 一张自留', () => {
  const game = build3p();
  game.player.skillPreferences.yiji = 'ask';
  game.deck = [c('tao', { id: 'y-tao' }), c('shan', { id: 'y-shan' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  Engine.playCard(game, 'enemy', 'e-sha', { target: 'player' });
  const drawn = game.pendingChoice.drawnIds.slice();
  assertCardConservation(game, () => {
    const r = Engine.resolvePendingChoice(game, {
      assignments: [{ cardId: drawn[0], seat: 'ally' }]
    });
    assert.equal(r.ok, true, r.message);
  });
  assert.ok(game.ally.hand.some((x) => x.id === drawn[0]), '第一张交给 ally');
  assert.ok(game.player.hand.some((x) => x.id === drawn[1]), '第二张自留');
  assert.ok(game.log.some((l) => l.includes('交给') && l.includes(game.ally.name)), '逐席分配日志');
});

test('J1: assignments 校验 — 非法座席/亡者/非本批牌被忽略 (自留)', () => {
  const game = build3p();
  game.player.skillPreferences.yiji = 'ask';
  game.deck = [c('tao', { id: 'v1' }), c('shan', { id: 'v2' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.ally.hp = 0; // ally 亡者
  Engine.playCard(game, 'enemy', 'e-sha', { target: 'player' });
  const drawn = game.pendingChoice.drawnIds.slice();
  const r = Engine.resolvePendingChoice(game, {
    assignments: [
      { cardId: drawn[0], seat: 'ally' },      // 亡者 → 忽略
      { cardId: 'not-drawn', seat: 'enemy' },  // 非本批 → 忽略
      { cardId: drawn[1], seat: 'ghost' }      // 非法座席 → 忽略
    ]
  });
  assert.equal(r.ok, true, r.message);
  assert.equal(game.ally.hand.length, 0, '亡者未获牌');
  assert.ok(game.player.hand.some((x) => x.id === drawn[0]), '全部自留');
  assert.ok(game.player.hand.some((x) => x.id === drawn[1]), '全部自留');
});

test('J1 零回归: 1v1 旧 giveIds decision 形状 → 交给对手', () => {
  const game = build1v1();
  game.player.skillPreferences.yiji = 'ask';
  game.deck = [c('tao', { id: 'g1' }), c('shan', { id: 'g2' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  Engine.playCard(game, 'enemy', 'e-sha');
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'yiji-distribute');
  const drawn = game.pendingChoice.drawnIds.slice();
  const r = Engine.resolvePendingChoice(game, { giveIds: [drawn[0]] });
  assert.equal(r.ok, true, r.message);
  assert.ok(game.enemy.hand.some((x) => x.id === drawn[0]), 'giveIds → 对手 (旧行为)');
  assert.ok(game.player.hand.some((x) => x.id === drawn[1]), '未勾选自留');
});

test('J1: AI auto 启发 — 仅 AI 座席生效, 低血线盟友 (hp<=2) 获赠摸到的【桃】', () => {
  // 郭嘉坐 AI 第三席 (ally, 忠臣); 同阵营主公 player 血线告急 → 获赠桃。
  const game = Engine.newGame({
    seed: 13103,
    seats: ['player', 'enemy', 'ally'],
    playerHero: 'liubei',
    enemyHero: 'caocao',
    allyHero: 'guojia'
  });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const actor of ['player', 'enemy', 'ally']) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].flags = {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp;
    game[actor].skillPreferences = {};
  }
  game.turn = 'enemy';
  game.phase = 'play';
  game.player.hp = 1; // 主公濒危 (郭嘉的同阵营盟友)
  game.deck = [c('tao', { id: 'ai-tao' }), c('shan', { id: 'ai-shan' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  Engine.playCard(game, 'enemy', 'e-sha', { target: 'ally' });
  assert.ok(game.player.hand.some((x) => x.id === 'ai-tao'), '桃赠予低血线盟友 (主公)');
  assert.ok(game.ally.hand.some((x) => x.id === 'ai-shan'), '非桃自留');
});

test('J1 评审收口: 玩家席 auto 档不代做分牌 ("全部留己"承诺), 全部自留', () => {
  const game = build3p();
  // player 郭嘉 (人类席) 缺省 auto, ally 忠臣 hp=1 濒危 — 不得代玩家赠牌
  game.ally.hp = 1;
  game.deck = [c('tao', { id: 'ai-tao' }), c('shan', { id: 'ai-shan' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  Engine.playCard(game, 'enemy', 'e-sha', { target: 'player' });
  assert.ok(game.player.hand.some((x) => x.id === 'ai-tao'), '桃自留');
  assert.ok(game.player.hand.some((x) => x.id === 'ai-shan'), '全部自留');
  assert.equal(game.ally.hand.length, 0, '盟友未获赠 (玩家席不代决策)');
});

test('J1 零回归: 1v1 AI auto — 无盟友, 全部自留', () => {
  const game = build1v1();
  game.deck = [c('tao', { id: 'k-tao' }), c('shan', { id: 'k-shan' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.enemy.hp = 1; // 敌方低血也不送 (敌对座席)
  Engine.playCard(game, 'enemy', 'e-sha');
  assert.ok(game.player.hand.some((x) => x.id === 'k-tao'), '桃自留');
  assert.ok(game.player.hand.some((x) => x.id === 'k-shan'), '全部自留');
  assert.equal(game.enemy.hand.length, 0, '敌方未获牌');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
