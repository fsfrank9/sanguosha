import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function buildGame(playerHero, enemyHero, seed) {
  const game = Engine.newGame({ seed: seed || 9001, playerHero, enemyHero });
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

// ───── aiEstimateShaCount ────────────────────────────────────────────

test('v8 PR-D1: aiEstimateShaCount — 纯 sha 手牌数量', () => {
  const game = buildGame('liubei', 'caocao');
  game.player.hand = [c('sha', { id: 's1' }), c('sha', { id: 's2' }), c('shan', { id: 'h1' })];
  assert.equal(Engine.aiEstimateShaCount(game.player), 2);
});

test('v8 PR-D1: aiEstimateShaCount — 武圣 红色非杀手牌 + 红色装备 计入', () => {
  const game = buildGame('guanyu', 'caocao'); // 关羽 wusheng
  game.player.hand = [
    c('sha', { id: 's-red', suit: 'heart', color: 'red' }),       // sha 本身
    c('tao', { id: 'tao-red', suit: 'heart', color: 'red' }),     // 红色非杀 → 武圣
    c('wuzhong', { id: 'wz-red', suit: 'heart', color: 'red' }),  // 红色非杀 → 武圣
    c('sha', { id: 's-black', suit: 'spade', color: 'black' })    // 黑杀 (sha 已计入)
  ];
  game.player.equipment.weapon = c('cixiong', { id: 'eq-red', suit: 'heart', color: 'red' });
  // 2 (sha) + 2 (red non-sha 手牌) + 1 (red 装备) = 5
  assert.equal(Engine.aiEstimateShaCount(game.player), 5);
});

test('v8 PR-D1: aiEstimateShaCount — 龙胆 闪 转化', () => {
  const game = buildGame('zhaoyun', 'caocao'); // 赵云 longdan
  game.player.hand = [
    c('sha', { id: 'real-sha' }),
    c('shan', { id: 'shan-1' }),
    c('shan', { id: 'shan-2' })
  ];
  // 1 sha + 2 shan→sha = 3
  assert.equal(Engine.aiEstimateShaCount(game.player), 3);
});

test('v8 PR-D1: aiEstimateShaCount — 丈八 双手当杀 (剩余手牌 / 2)', () => {
  const game = buildGame('liubei', 'caocao');
  game.player.hand = [
    c('shan', { id: 'h1' }),
    c('shan', { id: 'h2' }),
    c('shan', { id: 'h3' }),
    c('shan', { id: 'h4' })
  ];
  game.player.equipment.weapon = c('zhangba', { id: 'eq-zb' });
  // 0 sha + floor(4/2) = 2
  assert.equal(Engine.aiEstimateShaCount(game.player), 2);
});

// ───── aiEstimateShanCount ───────────────────────────────────────────

test('v8 PR-D1: aiEstimateShanCount — 纯闪数量', () => {
  const game = buildGame('liubei', 'caocao');
  game.player.hand = [c('shan', { id: 'h1' }), c('shan', { id: 'h2' }), c('sha', { id: 's1' })];
  assert.equal(Engine.aiEstimateShanCount(game.player), 2);
});

test('v8 PR-D1: aiEstimateShanCount — 倾国 黑色非闪 转化', () => {
  const game = buildGame('zhenji', 'caocao'); // 甄姬 qingguo
  game.player.hand = [
    c('shan', { id: 'h-real' }),
    c('sha', { id: 's-black', suit: 'spade', color: 'black' }),
    c('wuzhong', { id: 'wz-black', suit: 'club', color: 'black' }),
    c('tao', { id: 'tao-red', suit: 'heart', color: 'red' })  // 红色 → 倾国不能转
  ];
  // 1 闪 + 2 黑色非闪 = 3
  assert.equal(Engine.aiEstimateShanCount(game.player), 3);
});

test('v8 PR-D1: aiEstimateShanCount — 龙胆 杀 转闪', () => {
  const game = buildGame('zhaoyun', 'caocao');
  game.player.hand = [
    c('shan', { id: 'real-shan' }),
    c('sha', { id: 's1' }),
    c('sha', { id: 's2' })
  ];
  // 1 闪 + 2 杀→闪 = 3
  assert.equal(Engine.aiEstimateShanCount(game.player), 3);
});

// ───── scoreCardForAI: 桃 梯度 ───────────────────────────────────────

test('v8 PR-D1: 桃 score — 满血 -100', () => {
  const game = buildGame('liubei', 'caocao');
  const score = Engine.aiScoreCard(game, 'player', c('tao'));
  assert.equal(score, -100);
});

test('v8 PR-D1: 桃 score — hp=1 critical 200', () => {
  const game = buildGame('liubei', 'caocao');
  game.player.hp = 1;
  const score = Engine.aiScoreCard(game, 'player', c('tao'));
  assert.equal(score, 200);
});

test('v8 PR-D1: 桃 score — 多伤 (hp=maxHp-2) 120, 比轻伤 80 高', () => {
  const game = buildGame('liubei', 'caocao'); // maxHp=4
  game.player.hp = 2;
  const heavy = Engine.aiScoreCard(game, 'player', c('tao'));
  assert.equal(heavy, 120);
  game.player.hp = 3;
  const light = Engine.aiScoreCard(game, 'player', c('tao'));
  assert.equal(light, 80);
  assert.ok(heavy > light);
});

// ───── scoreCardForAI: 杀 vs target 闪 ───────────────────────────────

test('v8 PR-D1: 杀 score — 对方无闪 85, 有 1 闪 60, 有 2+ 闪 35', () => {
  const game = buildGame('liubei', 'caocao');
  // 对方 0 闪
  game.enemy.hand = [];
  assert.equal(Engine.aiScoreCard(game, 'player', c('sha')), 85);
  // 对方 1 闪
  game.enemy.hand = [c('shan', { id: 'e-s1' })];
  assert.equal(Engine.aiScoreCard(game, 'player', c('sha')), 60);
  // 对方 2 闪
  game.enemy.hand = [c('shan', { id: 'e-s1' }), c('shan', { id: 'e-s2' })];
  assert.equal(Engine.aiScoreCard(game, 'player', c('sha')), 35);
});

test('v8 PR-D1: 杀 score — 已出过杀 + 无 paoxiao → -100', () => {
  const game = buildGame('liubei', 'caocao');
  game.player.usedSha = true;
  game.enemy.hand = [];
  assert.equal(Engine.aiScoreCard(game, 'player', c('sha')), -100);
});

test('v8 PR-D1: 杀 score — paoxiao 已出过杀 仍可 → 不 -100', () => {
  const game = buildGame('zhangfei', 'caocao'); // 张飞 paoxiao
  game.player.usedSha = true;
  game.enemy.hand = [];
  const score = Engine.aiScoreCard(game, 'player', c('sha'));
  assert.ok(score > 0, '咆哮可以继续出杀, score > 0');
});

test('v8 PR-D1: 杀 score 计入 龙胆 转化 — 对方装龙胆 + 杀手 → shan 数量翻倍', () => {
  const game = buildGame('liubei', 'zhaoyun'); // 敌人=赵云 longdan
  game.enemy.hand = [c('sha', { id: 'e-s' }), c('sha', { id: 'e-s2' })];
  // 龙胆 让 2 张杀 也算 闪 → 闪>=2 → score 35
  assert.equal(Engine.aiScoreCard(game, 'player', c('sha')), 35);
});

// ───── scoreCardForAI: 决斗 双方杀数 ─────────────────────────────────

test('v8 PR-D1: 决斗 score — 我方杀多 75, 持平 40, 少则 10', () => {
  const game = buildGame('liubei', 'caocao');
  game.player.hand = [c('sha', { id: 'p-s1' }), c('sha', { id: 'p-s2' })];
  // 对方 1 sha → we win → 75
  game.enemy.hand = [c('sha', { id: 'e-s1' })];
  assert.equal(Engine.aiScoreCard(game, 'player', c('juedou')), 75);
  // 对方 2 sha → tied → 40
  game.enemy.hand = [c('sha', { id: 'e-s1' }), c('sha', { id: 'e-s2' })];
  assert.equal(Engine.aiScoreCard(game, 'player', c('juedou')), 40);
  // 对方 3 sha → lose → 10
  game.enemy.hand = [c('sha', { id: 'e-s1' }), c('sha', { id: 'e-s2' }), c('sha', { id: 'e-s3' })];
  assert.equal(Engine.aiScoreCard(game, 'player', c('juedou')), 10);
});

test('v8 PR-D1: 决斗 score 计入 武圣 红色转化 — 对手关羽红手 → 我方决斗 低分', () => {
  const game = buildGame('liubei', 'guanyu');
  game.player.hand = [c('sha', { id: 'p-s' })]; // 1 sha
  // 对方 (关羽) 武圣: 红色手牌当杀。3 张红色非杀 + 0 真杀 → 估算 3 sha
  game.enemy.hand = [
    c('tao', { id: 'e-tao', suit: 'heart', color: 'red' }),
    c('shan', { id: 'e-shan', suit: 'heart', color: 'red' }),
    c('wuzhong', { id: 'e-wz', suit: 'diamond', color: 'red' })
  ];
  // 我 1 sha vs 对方 3 sha → score 10 (我方决斗失败概率高)
  assert.equal(Engine.aiScoreCard(game, 'player', c('juedou')), 10);
});

// ───── scoreCardForAI: 锦囊 ──────────────────────────────────────────

test('v8 PR-D1: 南蛮 score — 对方无 sha 响应 80, 有则 30', () => {
  const game = buildGame('liubei', 'caocao');
  game.enemy.hand = [];
  assert.equal(Engine.aiScoreCard(game, 'player', c('nanman')), 80);
  game.enemy.hand = [c('sha', { id: 'e-s' })];
  assert.equal(Engine.aiScoreCard(game, 'player', c('nanman')), 30);
});

test('v8 PR-D1: 万箭 score — 对方无闪 80, 有则 30', () => {
  const game = buildGame('liubei', 'caocao');
  game.enemy.hand = [];
  assert.equal(Engine.aiScoreCard(game, 'player', c('wanjian')), 80);
  game.enemy.hand = [c('shan', { id: 'e-h' })];
  assert.equal(Engine.aiScoreCard(game, 'player', c('wanjian')), 30);
});

test('v8 PR-D1: 过河 score — 对方 hand+equipment 总数 0 → -100, 3+ → 70, 中间 50', () => {
  const game = buildGame('liubei', 'caocao');
  game.enemy.hand = [];
  game.enemy.equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
  assert.equal(Engine.aiScoreCard(game, 'player', c('guohe')), -100);
  game.enemy.hand = [c('shan', { id: 'e1' })];
  assert.equal(Engine.aiScoreCard(game, 'player', c('guohe')), 50);
  game.enemy.hand = [c('shan', { id: 'e1' }), c('shan', { id: 'e2' }), c('shan', { id: 'e3' })];
  assert.equal(Engine.aiScoreCard(game, 'player', c('guohe')), 70);
});

// ───── 整合 aiChooseCard ─────────────────────────────────────────────

test('v8 PR-D1: aiChooseCard — hp 危急时桃优先于杀', () => {
  const game = buildGame('liubei', 'caocao');
  game.player.hp = 1;
  game.enemy.hand = [];
  game.player.hand = [
    c('sha', { id: 'p-sha' }),
    c('tao', { id: 'p-tao' })
  ];
  const choice = Engine.aiChooseCard(game, 'player');
  assert.equal(choice.card.id, 'p-tao', 'critical hp → 桃 优先');
});

test('v8 PR-D1: aiChooseCard — 对方多闪时 改出 锦囊 而非 杀', () => {
  const game = buildGame('liubei', 'caocao');
  game.enemy.hand = [c('shan', { id: 's1' }), c('shan', { id: 's2' })]; // 2 闪
  game.player.hand = [
    c('sha', { id: 'p-sha' }),         // 杀 vs 多闪 → score 35
    c('nanman', { id: 'p-nm' })        // 南蛮 vs 0 sha → score 80
  ];
  const choice = Engine.aiChooseCard(game, 'player');
  assert.equal(choice.card.id, 'p-nm', '应选 南蛮 (高分)');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
