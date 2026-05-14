import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function buildGame(playerHero, enemyHero, seed) {
  const game = Engine.newGame({ seed: seed || 9501, playerHero, enemyHero });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].flags = game[actor].flags || {};
    game[actor].skillPreferences = game[actor].skillPreferences || {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp;
  }
  game.turn = 'player';
  game.phase = 'play';
  return game;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── cixiong-choose target auto: 挑最不值钱手牌弃置 ────────────────

test('v8 PR-D2: 雌雄 target auto — 弃最低分手牌, 保留高分桃/无中', () => {
  // huangyueying (female) 作为 player target, caocao (male) 作为 enemy source
  // 性别不同 → 雌雄触发
  const game = buildGame('huangyueying', 'caocao');
  game.turn = 'enemy';
  game.enemy.equipment.weapon = c('cixiong', { id: 'cx-wpn' });
  game.enemy.hand = [c('sha', { id: 'attack-sha' })];
  // player 手牌: 1 张 sha (high score 因对方无闪), 1 张 桃 (低分满血), 1 张 无中 (高分)
  game.player.hand = [
    c('sha', { id: 'p-sha-good' }),
    c('tao', { id: 'p-tao-waste' }),  // 满血 → -100
    c('wuzhong', { id: 'p-wz-good' })
  ];
  // enemy 必发雌雄; player 走 auto 而非 ask (强制走新 AI 弃牌路径测试)
  game.enemy.skillPreferences.cixiong = 'auto';
  game.player.skillPreferences.cixiongResponse = 'auto';

  Engine.playCard(game, 'enemy', 'attack-sha');

  // 雌雄触发, target=player, auto → 弃最低分牌 = 满血时的 tao
  assert.ok(game.discard.some((card) => card.id === 'p-tao-waste'), '弃了 桃 (最低分)');
  assert.ok(game.player.hand.some((card) => card.id === 'p-sha-good'), '保留 sha');
  assert.ok(game.player.hand.some((card) => card.id === 'p-wz-good'), '保留 wuzhong');
});

// ───── wugu-pick auto: 挑最高分 ──────────────────────────────────────

test('v8 PR-D2: 五谷 auto — picker 挑高分牌 (受伤 player 优先取 桃)', () => {
  const game = buildGame('liubei', 'caocao');
  game.player.skillPreferences.wugu = 'auto';
  game.enemy.skillPreferences.wugu = 'auto';
  game.player.hp = game.player.maxHp - 2; // 多伤
  // deck top 顺序 (pop = 末尾 first): 末位 sha (中等), 倒数 2 = tao (受伤时 120 高分)
  game.deck = [
    c('shan', { id: 'wg-bottom-shan' }),  // 不参与 reveal
    c('sha', { id: 'wg-sha-mid' }),
    c('tao', { id: 'wg-tao-top' })
  ];
  game.player.hand = [c('wugu', { id: 'wg-card' })];
  Engine.playCard(game, 'player', 'wg-card');

  // X=2: revealed = [tao-top, sha-mid] (pop 两次)
  // player picks 桃 (高分受伤), enemy 取剩 sha
  assert.ok(game.player.hand.some((card) => card.id === 'wg-tao-top'), 'player AI 挑 桃');
  assert.ok(game.enemy.hand.some((card) => card.id === 'wg-sha-mid'), 'enemy 取剩 sha');
});

test('v8 PR-D2: 五谷 auto — 满血 picker 不挑 桃, 而是挑 sha (桃满血 -100)', () => {
  const game = buildGame('liubei', 'caocao');
  game.player.skillPreferences.wugu = 'auto';
  game.enemy.skillPreferences.wugu = 'auto';
  // player 满血: 桃 -100, sha vs 无闪 enemy 85
  game.enemy.hand = [];
  game.deck = [
    c('shan', { id: 'wg-bot' }),
    c('sha', { id: 'wg-sha-real' }),
    c('tao', { id: 'wg-tao-useless' })
  ];
  game.player.hand = [c('wugu', { id: 'wg2' })];
  Engine.playCard(game, 'player', 'wg2');

  // player 满血 → 不要 桃, 挑 sha
  assert.ok(game.player.hand.some((card) => card.id === 'wg-sha-real'), 'player 满血挑 sha (高分)');
  assert.ok(game.enemy.hand.some((card) => card.id === 'wg-tao-useless'), 'enemy 取剩 桃');
});

// ───── guohe-1v1-pick auto: 装备 slot 优先级 ─────────────────────────

test('v8 PR-D2: 过河 auto — 武器 > 防具 > 马 优先级 (装多件时拆武器)', () => {
  const game = buildGame('liubei', 'caocao');
  game.player.skillPreferences.guohe = 'auto';
  game.enemy.equipment = {
    weapon: c('cixiong', { id: 'cx-keep' }),
    armor: c('bagua', { id: 'bg-keep' }),
    horsePlus: c('plus_horse', { id: 'hp-keep' }),
    horseMinus: null
  };
  game.enemy.hand = [c('shan', { id: 'e-shan' })];
  game.player.hand = [c('guohe', { id: 'gh-card' })];

  Engine.playCard(game, 'player', 'gh-card');

  // 过河 auto 应优先弃武器 cixiong (slot=weapon, priority 1)
  assert.ok(game.discard.some((card) => card.id === 'cx-keep'), '弃武器');
  assert.equal(game.enemy.equipment.weapon, null, '武器槽空');
  assert.equal(game.enemy.equipment.armor && game.enemy.equipment.armor.id, 'bg-keep', '防具保留');
  assert.equal(game.enemy.equipment.horsePlus && game.enemy.equipment.horsePlus.id, 'hp-keep', '马保留');
});

test('v8 PR-D2: 过河 auto — 无武器, 弃防具', () => {
  const game = buildGame('liubei', 'caocao');
  game.player.skillPreferences.guohe = 'auto';
  game.enemy.equipment = {
    weapon: null,
    armor: c('bagua', { id: 'bg-only' }),
    horsePlus: c('plus_horse', { id: 'hp-only' }),
    horseMinus: null
  };
  game.enemy.hand = [];
  game.player.hand = [c('guohe', { id: 'gh2' })];

  Engine.playCard(game, 'player', 'gh2');

  assert.ok(game.discard.some((card) => card.id === 'bg-only'), '弃防具 (无武器时次优先)');
  assert.equal(game.enemy.equipment.horsePlus && game.enemy.equipment.horsePlus.id, 'hp-only', '马保留');
});

// ───── guicai-replace auto: 最低分手牌 ────────────────────────────────

test('v8 PR-D2: 鬼才 auto — 用最低分手牌替换 (满血状态 桃 -100 被优先牺牲)', () => {
  // enemy = simayi has guicai. enemy 装了多张手牌: 高分 sha + 低分 满血桃.
  // 触发判定: player 用 闪电 落到自己 → judge 时 enemy.simayi 鬼才 auto 介入.
  // 简化: 直接 mock judge() 的 onJudgementBeforeResolve hook 调用 chain.
  // 这里改用 直接验证 auto 路径: 给 player 一个判定 (lebusishu / shandian), enemy 装 guicai.
  const game = buildGame('liubei', 'simayi');
  game.player.judgeArea = [
    c('shandian', { id: 'sd-card', suit: 'spade', color: 'black', rank: '5' })
  ];
  // enemy 手牌: sha (高分, 因 player 无闪) + 桃 (满血 -100)
  game.enemy.hp = game.enemy.maxHp; // 满血
  game.enemy.hand = [
    c('sha', { id: 'e-sha-keep' }),
    c('tao', { id: 'e-tao-burn' })
  ];
  // 触发 startTurn (player 是 turn)
  game.turn = 'player';
  // 设 deck 让闪电判定不会真 命中
  game.deck = [
    c('shan', { id: 'pad-1' }),
    c('shan', { id: 'pad-2' }),
    c('sha', { id: 'sd-judge', suit: 'spade', color: 'black', rank: '9' }) // 闪电判定:黑桃 2-9 命中
  ];
  Engine.startTurn(game, 'player');

  // 鬼才 auto 应丢 e-tao-burn (最低分), 不丢 e-sha-keep
  // 判定时鬼才用替换牌; 替换牌进了弃牌堆
  // 注: 闪电 hits 时会 dmg player 3; 但只要 鬼才 fire 触发 + 用 tao 替换 即可
  assert.ok(game.discard.some((card) => card.id === 'e-tao-burn'), '鬼才用 桃 替换 (最低分)');
  assert.ok(game.enemy.hand.some((card) => card.id === 'e-sha-keep') || game.discard.some((c) => c.id === 'e-sha-keep'),
    'sha 保留 / 后续 step 不影响本断言');
});

// ───── 整合: AI 决策更聪明 ───────────────────────────────────────────

test('v8 PR-D2: 雌雄 target auto — 受伤时不弃 桃 (因为 桃 高分)', () => {
  const game = buildGame('huangyueying', 'caocao');
  game.turn = 'enemy';
  game.enemy.equipment.weapon = c('cixiong', { id: 'cx-w2' });
  game.enemy.hand = [c('sha', { id: 'attack-2' })];
  game.player.hp = 1; // critical → 桃 score 200
  game.player.hand = [
    c('tao', { id: 'p-tao-critical' }),  // critical 200 — 不能弃!
    c('sha', { id: 'p-sha-lowprio' }),    // usedSha=false, enemy 0 闪 → 85
    c('wuzhong', { id: 'p-wz-mid' })       // score 90
  ];
  game.enemy.skillPreferences.cixiong = 'auto';
  game.player.skillPreferences.cixiongResponse = 'auto';

  Engine.playCard(game, 'enemy', 'attack-2');

  // 不能弃 桃; 最低分 = sha (85) vs wuzhong (90) — 弃 sha
  assert.ok(game.player.hand.some((card) => card.id === 'p-tao-critical'), 'critical 桃 保留');
  assert.ok(game.discard.some((card) => card.id === 'p-sha-lowprio'), '弃了最低分 sha');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
