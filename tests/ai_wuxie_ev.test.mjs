// v11 D1 (批次 33): AI 无懈期望值评估 — 替代"有无懈就自动用"。
// 规则: 南蛮/万箭 有响应牌或血线安全时吃 1 伤保无懈; 火攻 血线安全保留;
// 决斗 杀数占优且血线安全时应战; 拆/顺 有装备或手牌拮据才护; 乐 手牌有
// 阵容才护; 兵粮 手牌拮据才护; 反无懈与 denial 窗口保持旧行为;
// skillPreferences.wuxiePolicy='always' 回退。
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
  const game = Engine.newGame({ seed: opts.seed || 33001, playerHero: opts.playerHero || 'liubei', enemyHero: opts.enemyHero || 'lvmeng' });
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

function keptWuxie(game, id) {
  return game.enemy.hand.some((x) => x.id === id) && !game.discard.some((x) => x.id === id);
}

// ───── 南蛮 / 万箭 ──────────────────────────────────────────────────

test('南蛮 EV: 血线安全 (hp>2) → 保留无懈, 吃 1 伤', () => {
  const game = buildGame();
  game.player.hand = [c('nanman', { id: 'nm' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' })];
  const hp = game.enemy.hp;
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'nm'));
  assert.ok(keptWuxie(game, 'e-wx'), '无懈保留');
  assert.equal(game.enemy.hp, hp - 1, '吃 1 伤');
  assert.ok(game.log.some((l) => l.includes('保留【无懈可击】')));
});

test('南蛮 EV: 有杀可响应 → 保留无懈, 出杀化解', () => {
  const game = buildGame();
  game.player.hand = [c('nanman', { id: 'nm' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' }), c('sha', { id: 'e-sha' })];
  game.enemy.hp = 2;
  Engine.playCard(game, 'player', 'nm');
  assert.ok(keptWuxie(game, 'e-wx'), '无懈保留');
  assert.equal(game.enemy.hp, 2, '出杀化解, 不掉血');
  assert.ok(game.discard.some((x) => x.id === 'e-sha'), '杀已打出');
});

test('南蛮 EV: 无杀且 hp<=2 → 无懈 (旧行为)', () => {
  const game = buildGame();
  game.player.hand = [c('nanman', { id: 'nm' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' })];
  game.enemy.hp = 2;
  Engine.playCard(game, 'player', 'nm');
  assert.ok(game.discard.some((x) => x.id === 'e-wx'), '无懈已用');
  assert.equal(game.enemy.hp, 2, '被抵消不掉血');
});

test('万箭 EV: 血线安全 → 保留无懈, 吃 1 伤', () => {
  const game = buildGame();
  game.player.hand = [c('wanjian', { id: 'wj' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' })];
  const hp = game.enemy.hp;
  Engine.playCard(game, 'player', 'wj');
  assert.ok(keptWuxie(game, 'e-wx'));
  assert.equal(game.enemy.hp, hp - 1);
});

// ───── 决斗 ─────────────────────────────────────────────────────────

test('决斗 EV: 杀数占优且血线安全 → 应战不无懈', () => {
  const game = buildGame();
  game.player.hand = [c('juedou', { id: 'pj' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' }), c('sha', { id: 'e-sha1' }), c('sha', { id: 'e-sha2' })];
  const php = game.player.hp;
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'pj'));
  assert.ok(keptWuxie(game, 'e-wx'), '无懈保留');
  assert.equal(game.player.hp, php - 1, '应战: 敌出杀 → 玩家无杀受伤');
});

test('决斗 EV: 血线危险 (hp<=2) → 无懈', () => {
  const game = buildGame();
  game.player.hand = [c('juedou', { id: 'pj' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' }), c('sha', { id: 'e-sha1' }), c('sha', { id: 'e-sha2' })];
  game.enemy.hp = 2;
  const php = game.player.hp;
  Engine.playCard(game, 'player', 'pj');
  assert.ok(game.discard.some((x) => x.id === 'e-wx'), '无懈已用');
  assert.equal(game.player.hp, php, '决斗被抵消');
  assert.equal(game.enemy.hand.length, 2, '杀保留');
});

// ───── 拆 / 顺 ──────────────────────────────────────────────────────

test('拆 EV: 有装备要护 → 无懈', () => {
  const game = buildGame();
  game.player.hand = [c('guohe', { id: 'pg' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' }), c('tao', { id: 't1' }), c('tao', { id: 't2' })];
  game.enemy.equipment.weapon = c('qinggang', { id: 'e-wpn' });
  Engine.playCard(game, 'player', 'pg');
  assert.ok(game.discard.some((x) => x.id === 'e-wx'), '无懈已用');
  assert.equal(game.enemy.equipment.weapon.id, 'e-wpn', '装备保住');
});

test('拆 EV: 富手牌无装备 → 保留无懈, 让拆一张', () => {
  const game = buildGame();
  game.player.hand = [c('guohe', { id: 'pg' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' }), c('tao', { id: 't1' }), c('tao', { id: 't2' }), c('tao', { id: 't3' })];
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'player', 'pg', { targetZone: 'hand', targetCardId: 't1' });
    assert.equal(r.ok, true, r.message);
  });
  assert.ok(keptWuxie(game, 'e-wx'), '无懈保留');
  assert.ok(game.discard.some((x) => x.id === 't1'), '被拆一张手牌');
});

// ───── 延时锦囊 ─────────────────────────────────────────────────────

test('乐 EV: 穷手牌 (仅无懈) → 保留, 乐入判定区', () => {
  const game = buildGame();
  game.player.hand = [c('lebusishu', { id: 'lbss' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' })];
  Engine.playCard(game, 'player', 'lbss');
  assert.ok(keptWuxie(game, 'e-wx'));
  assert.equal(game.enemy.judgeArea.length, 1, '乐入判定区');
});

test('兵粮 EV: 手牌拮据 (<=2) → 无懈护摸牌', () => {
  const game = buildGame();
  game.player.hand = [c('bingliang', { id: 'bl' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' })];
  Engine.playCard(game, 'player', 'bl');
  assert.ok(game.discard.some((x) => x.id === 'e-wx'), '无懈已用');
  assert.equal(game.enemy.judgeArea.length, 0);
});

test('兵粮 EV: 富手牌 → 保留', () => {
  const game = buildGame();
  game.player.hand = [c('bingliang', { id: 'bl' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' }), c('tao', { id: 't1' }), c('tao', { id: 't2' })];
  Engine.playCard(game, 'player', 'bl');
  assert.ok(keptWuxie(game, 'e-wx'));
  assert.equal(game.enemy.judgeArea.length, 1, '兵粮入判定区');
});

test('闪电 EV: 高威胁延时 → 照旧无懈', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('shandian', { id: 'e-sd' })];
  game.player.hand = [];
  // 闪电放自己判定区, responder 是对手... 反向: 玩家放闪电, 敌方决定
  game.turn = 'player';
  game.player.hand = [c('shandian', { id: 'p-sd' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' })];
  Engine.playCard(game, 'player', 'p-sd');
  assert.ok(game.discard.some((x) => x.id === 'e-wx'), '闪电放置被无懈 (保持旧行为)');
});

// ───── 反无懈 / denial / 回退开关 ───────────────────────────────────

test('反无懈保持旧行为: 敌方锦囊被玩家无懈 → 敌方无条件反无懈', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('guohe', { id: 'eg' }), c('wuxie', { id: 'e-wx' })];
  game.player.hand = [c('wuxie', { id: 'p-wx' }), c('tao', { id: 'p-tao' })];
  // 玩家默认 auto 座席 → 自动无懈敌方拆; 敌方 chain.wuxied=true → 反无懈
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'eg'));
  assert.ok(game.discard.some((x) => x.id === 'p-wx'), '玩家无懈已用');
  assert.ok(game.discard.some((x) => x.id === 'e-wx'), '敌方反无懈已用');
  assert.ok(game.discard.some((x) => x.id === 'p-tao'), '拆最终生效');
});

test('无中生有 denial 保持旧行为: 恒无懈', () => {
  const game = buildGame();
  game.player.hand = [c('wuzhong', { id: 'wz' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' })];
  game.deck = [c('tao', { id: 'd1' }), c('tao', { id: 'd2' })];
  Engine.playCard(game, 'player', 'wz');
  assert.ok(game.discard.some((x) => x.id === 'e-wx'), '无懈已用');
  assert.equal(game.player.hand.length, 0, '未摸到牌');
});

test('wuxiePolicy=always 回退: 南蛮满血也照旧无懈', () => {
  const game = buildGame();
  game.enemy.skillPreferences.wuxiePolicy = 'always';
  game.player.hand = [c('nanman', { id: 'nm' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' })];
  Engine.playCard(game, 'player', 'nm');
  assert.ok(game.discard.some((x) => x.id === 'e-wx'), '回退旧行为: 无懈已用');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
