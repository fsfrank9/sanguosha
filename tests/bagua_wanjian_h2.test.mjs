import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

assert.ok(Engine, 'engine module loaded');

// H2: 八卦阵 对【万箭齐发】兜底。审计前 playAOE 的【闪】响应没有八卦红判定
// 兜底 (八卦逻辑只存在于【杀】响应路径), 导致有八卦无闪的目标必中万箭。
// gltjk: 八卦阵在「需要使用 / 打出【闪】」时触发, 包括响应【万箭齐发】。
// 注: 八卦只对需【闪】的场景生效 → 【南蛮入侵】需【杀】, 不触发八卦。

function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function buildGame(opts) {
  opts = opts || {};
  const game = Engine.newGame({ seed: 55, playerHero: opts.playerHero || 'liubei', enemyHero: opts.enemyHero || 'caocao' });
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

// judge() 用 game.deck.pop() 取判定牌 → 牌堆末位即判定结果。
function redJudge(id) { return c('tao', { id: id || 'judge-red', suit: 'heart', rank: '5' }); }   // 红
function blackJudge(id) { return c('sha', { id: id || 'judge-black', suit: 'spade', rank: '5' }); } // 黑

// --- 万箭齐发 自动响应路径 (目标为 AI) ---

test('H2 万箭齐发: 目标八卦无闪, 红判定 → 视为打出闪, 不掉血', () => {
  const game = buildGame();
  game.player.hand = [c('wanjian', { id: 'wj-r' })];
  game.enemy.hand = []; // 无闪
  game.enemy.equipment.armor = c('bagua', { id: 'bg1' });
  game.deck = [redJudge()];
  const hp = game.enemy.hp;
  const r = Engine.playCard(game, 'player', 'wj-r');
  assert.equal(r.ok, true);
  assert.equal(game.enemy.hp, hp, '八卦红判定化解万箭 → 不掉血');
});

test('H2 万箭齐发: 目标八卦无闪, 黑判定 → 八卦失败 → 受 1 点伤害', () => {
  const game = buildGame();
  game.player.hand = [c('wanjian', { id: 'wj-b' })];
  game.enemy.hand = [];
  game.enemy.equipment.armor = c('bagua', { id: 'bg2' });
  game.deck = [blackJudge()];
  const hp = game.enemy.hp;
  const r = Engine.playCard(game, 'player', 'wj-b');
  assert.equal(r.ok, true);
  assert.equal(game.enemy.hp, hp - 1, '八卦黑判定不化解 → 受 1 点伤害');
});

test('H2 万箭齐发: 目标八卦且有闪 → 优先用闪 (不触发八卦判定)', () => {
  const game = buildGame();
  game.player.hand = [c('wanjian', { id: 'wj-shan' })];
  game.enemy.hand = [c('shan', { id: 'enemy-shan' })];
  game.enemy.equipment.armor = c('bagua', { id: 'bg3' });
  game.deck = [blackJudge('unused')]; // 即便是黑判定, 也应先用闪化解
  const hp = game.enemy.hp;
  const r = Engine.playCard(game, 'player', 'wj-shan');
  assert.equal(r.ok, true);
  assert.equal(game.enemy.hp, hp, '有闪 → 用闪化解 → 不掉血');
  assert.ok(game.discard.some((card) => card.id === 'enemy-shan'), '闪已消耗');
  assert.ok(game.deck.some((card) => card.id === 'unused'), '未进行八卦判定 → 判定牌仍在牌堆');
});

// --- 南蛮入侵: 八卦不触发 (需【杀】而非【闪】) ---

test('H2 南蛮入侵: 目标八卦无杀 → 八卦不触发 → 受 1 点伤害', () => {
  const game = buildGame();
  game.player.hand = [c('nanman', { id: 'nm-bg' })];
  game.enemy.hand = []; // 无杀
  game.enemy.equipment.armor = c('bagua', { id: 'bg4' });
  game.deck = [redJudge('nm-unused')]; // 即使红, 南蛮需杀, 八卦不应触发
  const hp = game.enemy.hp;
  const r = Engine.playCard(game, 'player', 'nm-bg');
  assert.equal(r.ok, true);
  assert.equal(game.enemy.hp, hp - 1, '南蛮需杀, 八卦(闪)不触发 → 受 1 点伤害');
  assert.ok(game.deck.some((card) => card.id === 'nm-unused'), '八卦未判定 → 判定牌仍在牌堆');
});

// --- 万箭齐发 玩家响应路径 (玩家放弃闪 → 八卦兜底) ---

test('H2 万箭齐发 玩家路径: 玩家有闪+八卦, 放弃闪, 红判定 → 化解, 不掉血', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('wanjian', { id: 'ai-wj-r' })];
  game.player.hand = [c('shan', { id: 'p-shan-keep' })];
  game.player.equipment.armor = c('bagua', { id: 'bg5' });
  game.player.skillPreferences.shanResponse = 'ask';
  game.deck = [redJudge()];
  const hp = game.player.hp;
  Engine.playCard(game, 'enemy', 'ai-wj-r');
  // H1 无懈窗口: 玩家无无懈 → 直接进入万箭闪响应暂停
  assert.ok(game.pendingChoice, '应暂停等待玩家闪响应');
  assert.equal(game.pendingChoice.kind, 'wanjian-response');
  // 玩家放弃打闪 → 八卦红判定兜底化解
  const r = Engine.resolvePendingChoice(game, {});
  assert.equal(r.ok, true);
  assert.equal(game.player.hp, hp, '放弃闪但八卦红判定 → 化解, 不掉血');
  assert.ok(game.player.hand.some((card) => card.id === 'p-shan-keep'), '放弃打闪 → 闪保留');
});

test('H2 万箭齐发 玩家路径: 玩家放弃闪, 黑判定 → 八卦失败 → 受 1 点伤害', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('wanjian', { id: 'ai-wj-b' })];
  game.player.hand = [c('shan', { id: 'p-shan-keep2' })];
  game.player.equipment.armor = c('bagua', { id: 'bg6' });
  game.player.skillPreferences.shanResponse = 'ask';
  game.deck = [blackJudge()];
  const hp = game.player.hp;
  Engine.playCard(game, 'enemy', 'ai-wj-b');
  assert.equal(game.pendingChoice.kind, 'wanjian-response');
  const r = Engine.resolvePendingChoice(game, {});
  assert.equal(r.ok, true);
  assert.equal(game.player.hp, hp - 1, '放弃闪 + 八卦黑判定 → 受 1 点伤害');
});

// --- 回归: 八卦 vs 杀 经 tryBaguaDodge 重构后仍正确 ---

test('H2 回归: 八卦 vs 杀 红判定仍化解 (重构后行为不变)', () => {
  const game = buildGame();
  game.player.hand = [c('sha', { id: 'sha-vs-bg' })];
  game.enemy.hand = []; // 无闪
  game.enemy.equipment.armor = c('bagua', { id: 'bg7' });
  game.deck = [redJudge()];
  const hp = game.enemy.hp;
  const r = Engine.playCard(game, 'player', 'sha-vs-bg');
  assert.equal(r.ok, true);
  assert.equal(game.enemy.hp, hp, '八卦红判定化解杀 → 不掉血');
});
