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

// ───── 延时锦囊 (v13 J0-2: 无懈时机移至判定阶段生效前) ─────────────────

test('乐 EV: 放置时不再询问; 判定前穷手牌 (仅无懈) → 保留', () => {
  const game = buildGame();
  game.player.hand = [c('lebusishu', { id: 'lbss' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' })];
  game.deck = [c('sha', { id: 'd1' }), c('sha', { id: 'd2' }),
    c('tao', { id: 'j-heart', suit: 'heart' })]; // 判定牌 (末位先取) 红桃 → 乐判定成功
  Engine.playCard(game, 'player', 'lbss');
  assert.ok(keptWuxie(game, 'e-wx'), '放置时无询问');
  assert.equal(game.enemy.judgeArea.length, 1, '乐直接入判定区');
  // 敌方回合判定阶段: 判定前开无懈窗口 — 穷手牌 EV → 保留
  Engine.startTurn(game, 'enemy');
  assert.ok(keptWuxie(game, 'e-wx'), '判定前 EV 保留无懈');
  assert.equal(game.enemy.judgeArea.length, 0, '乐已判定并弃置');
});

test('兵粮 EV: 判定前手牌拮据 (<=2) → 无懈护摸牌', () => {
  const game = buildGame();
  game.player.hand = [c('bingliang', { id: 'bl' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' })];
  game.deck = [c('sha', { id: 'd1' }), c('sha', { id: 'd2' }), c('sha', { id: 'd3' })];
  Engine.playCard(game, 'player', 'bl');
  assert.equal(game.enemy.judgeArea.length, 1, '放置时不询问, 兵粮入判定区');
  Engine.startTurn(game, 'enemy');
  assert.ok(game.discard.some((x) => x.id === 'e-wx'), '判定前无懈已用');
  assert.equal(game.enemy.judgeArea.length, 0, '兵粮被抵消弃置');
  assert.ok(!game.enemy.flags.skipDraw, '摸牌阶段未被跳过');
});

test('兵粮 EV: 判定前富手牌 → 保留无懈, 兵粮照常判定', () => {
  const game = buildGame();
  game.player.hand = [c('bingliang', { id: 'bl' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' }), c('tao', { id: 't1' }), c('tao', { id: 't2' })];
  game.deck = [c('sha', { id: 'd1' }), c('sha', { id: 'd2' }),
    c('sha', { id: 'j-spade', suit: 'spade' })]; // 判定黑桃 → 非梅花, 跳摸牌
  Engine.playCard(game, 'player', 'bl');
  Engine.startTurn(game, 'enemy');
  assert.ok(keptWuxie(game, 'e-wx'), '富手牌 → 保留');
  assert.ok(game.log.some((l) => l.includes('【兵粮寸断】判定失败')), '兵粮照常生效');
});

test('闪电 EV: 判定前受害者已确定 — 归属者一方无懈, 闪电移至下家', () => {
  const game = buildGame();
  game.turn = 'enemy';
  // 闪电已在敌方判定区 (上一轮移动而来的布局), 敌方有无懈 → 判定前自保
  game.enemy.judgeArea = [c('shandian', { id: 'e-sd' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' })];
  game.deck = [c('sha', { id: 'd1' }), c('sha', { id: 'd2' }), c('sha', { id: 'd3' })];
  const hp = game.enemy.hp;
  Engine.startTurn(game, 'enemy');
  assert.ok(game.discard.some((x) => x.id === 'e-wx'), '闪电高威胁 → 判定前无懈');
  assert.equal(game.enemy.hp, hp, '未受闪电伤害 (未判定)');
  assert.ok(game.player.judgeArea.some((x) => x.id === 'e-sd'),
    '被抵消的闪电按移动规则置入下家判定区 (card__scroll.md:207)');
});

test('闪电 EV: 敌方不会替对手挡雷 — 玩家判定区的闪电, 敌方保留无懈', () => {
  const game = buildGame();
  game.player.judgeArea = [c('shandian', { id: 'p-sd' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' })];
  // 判定牌黑桃 5 (2~9) → 闪电命中玩家
  game.deck = [c('sha', { id: 'd1' }), c('sha', { id: 'd2' }),
    c('sha', { id: 'j-hit', suit: 'spade', rank: '5' })];
  const hp = game.player.hp;
  Engine.startTurn(game, 'player');
  assert.ok(keptWuxie(game, 'e-wx'), '受害者是敌人 → 立场不符, 保留');
  assert.equal(game.player.hp, hp - 3, '闪电命中 3 点雷伤');
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
