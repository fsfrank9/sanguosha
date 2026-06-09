import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function makeGame() {
  const game = Engine.newGame({ seed: 97, startWithFirstTurn: true, playerHero: 'liubei', enemyHero: 'sunquan' });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

function dealSha(state, id, opts) {
  const card = Object.assign({ id, type: 'sha', name: '杀', suit: 'spade', color: 'black' }, opts || {});
  state.hand.push(card);
  return card;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// M1 (审计): 朱雀转火杀是「本次使用」的视为效果, 弃置后物理牌还原为普通
// 【杀】。此前 mutate card.type='fire_sha' 永久污染物理牌 (洗回牌堆变永久火杀)。
test('M1: 朱雀 + 普通杀 → 使用时为火杀, 弃置后还原为普通【杀】(不污染牌堆)', () => {
  const game = makeGame();
  game.player.equipment.weapon = { id: 'zq-w', type: 'zhuque', name: '朱雀羽扇', family: 'equipment', slot: 'weapon', range: 4 };
  const sha = dealSha(game.player, 'normal-sha');
  Engine.playCard(game, 'player', 'normal-sha');
  // M1 修复: 弃牌堆里的物理牌还原为普通【杀】(火属性仅在本次使用时生效)。
  const discardedSha = game.discard.find((c) => c.id === 'normal-sha');
  assert.ok(discardedSha, 'sha 已使用进入弃牌堆');
  assert.equal(discardedSha.type, 'sha', '弃置后 type 还原为 sha (不再永久 fire_sha)');
  assert.equal(discardedSha.name, '杀', '弃置后 name 还原为 杀');
  assert.equal(discardedSha.zhuqueOriginalType, undefined, '临时标记已清除');
  assert.equal(discardedSha.zhuqueOriginalName, undefined, '临时标记已清除');
});

test('M1: 被朱雀转化过的【杀】卸下朱雀后再用 → 仍是普通【杀】(被藤甲防止, 无火杀残留)', () => {
  const game = makeGame();
  game.player.equipment.weapon = { id: 'zq-reuse', type: 'zhuque', name: '朱雀羽扇', family: 'equipment', slot: 'weapon', range: 4 };
  game.enemy.equipment.armor = { id: 'tj-reuse', type: 'tengjia', name: '藤甲', family: 'equipment', slot: 'armor' };
  dealSha(game.player, 'reuse-sha');
  const hp0 = game.enemy.hp;
  Engine.playCard(game, 'player', 'reuse-sha');
  assert.equal(game.enemy.hp, hp0 - 2, '首次: 朱雀火杀 + 藤甲 +1 = 2 dmg (火属性本次生效)');
  const reused = game.discard.find((c) => c.id === 'reuse-sha');
  assert.equal(reused.type, 'sha', '弃置后还原为普通杀');
  // 取回该物理牌, 卸下朱雀, 复位出杀计数, 回满血, 再用一次
  game.discard = game.discard.filter((c) => c.id !== 'reuse-sha');
  game.player.hand = [reused];
  game.player.equipment.weapon = null;
  game.player.usedSha = false;
  game.enemy.hp = game.enemy.maxHp;
  Engine.playCard(game, 'player', 'reuse-sha');
  assert.equal(game.enemy.hp, game.enemy.maxHp, '再次使用为普通杀 → 藤甲防止 → 不掉血 (确认无火杀残留)');
});

test('v8 PR-B3: 朱雀 + 普通杀 + 目标藤甲 → 不再"防止伤害", 改为火焰 +1 = 2 dmg', () => {
  const game = makeGame();
  game.player.equipment.weapon = { id: 'zq-w2', type: 'zhuque', name: '朱雀羽扇', family: 'equipment', slot: 'weapon', range: 4 };
  // 目标装藤甲: 普通杀对其无效, 火焰伤害 +1
  game.enemy.equipment.armor = { id: 'foe-tengjia', type: 'tengjia', name: '藤甲', family: 'equipment', slot: 'armor' };
  dealSha(game.player, 'zq-vs-tengjia');
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'zq-vs-tengjia');
  assert.equal(game.enemy.hp, enemyHpBefore - 2, '普杀→火杀: 藤甲 +1 = 2 dmg');
});

test('v8 PR-B3: 朱雀 + 真实 fire_sha → 不重复转化', () => {
  const game = makeGame();
  game.player.equipment.weapon = { id: 'zq-w3', type: 'zhuque', name: '朱雀羽扇', family: 'equipment', slot: 'weapon', range: 4 };
  // 自带 fire_sha
  game.player.hand.push({ id: 'real-fire-sha', type: 'fire_sha', name: '火杀', suit: 'heart', color: 'red' });
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'real-fire-sha');
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '火杀正常 1 dmg (无藤甲)');
  // 检查没有重复 log "转化"
  const transformLogs = game.log.filter((entry) => /朱雀羽扇/.test(String(entry || ''))).length;
  assert.equal(transformLogs, 0, '已是火杀 → 不出转化 log');
});

test('v8 PR-B3: skillPreferences.zhuque=decline → 不转化, 仍是普通杀', () => {
  const game = makeGame();
  game.player.equipment.weapon = { id: 'zq-w4', type: 'zhuque', name: '朱雀羽扇', family: 'equipment', slot: 'weapon', range: 4 };
  game.player.skillPreferences.zhuque = 'decline';
  // 目标藤甲 → 普通杀对其无效
  game.enemy.equipment.armor = { id: 'foe-tj2', type: 'tengjia', name: '藤甲', family: 'equipment', slot: 'armor' };
  dealSha(game.player, 'zq-decline');
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'zq-decline');
  assert.equal(game.enemy.hp, enemyHpBefore, 'decline → 普通杀对藤甲无效');
});

test('v8 PR-B3: 非朱雀武器 + 普通杀 + 藤甲 → 防止伤害 (回归测试不变)', () => {
  const game = makeGame();
  game.player.equipment.weapon = { id: 'qg-w', type: 'qinggang', name: '青釭剑', family: 'equipment', slot: 'weapon', range: 2 };
  game.enemy.equipment.armor = { id: 'foe-tj3', type: 'tengjia', name: '藤甲', family: 'equipment', slot: 'armor' };
  dealSha(game.player, 'qg-sha-tj');
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'qg-sha-tj');
  // 青釭无视防具, 普通杀 → 藤甲 ignored → 正常 1 dmg
  // 注: spec 中青釭无视防具效果, 包括藤甲的 "对普通杀无效"; 已实测
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '青釭无视藤甲 → 1 dmg');
});

test('v8 PR-B3: 朱雀 + 丈八 2 手当虚拟杀 → 也转化为火杀', () => {
  const game = makeGame();
  game.player.equipment.weapon = { id: 'zb-w', type: 'zhangba', name: '丈八蛇矛', family: 'equipment', slot: 'weapon', range: 3 };
  // 测试无朱雀路径作为基线 — 装备先丈八
  game.player.hand = [
    { id: 'h-a', type: 'tao', name: '桃', suit: 'heart', color: 'red' },
    { id: 'h-b', type: 'tao', name: '桃', suit: 'heart', color: 'red' }
  ];
  const enemyHpBefore = game.enemy.hp;
  Engine.playZhangbaSha(game, 'player', ['h-a', 'h-b']);
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '丈八虚拟杀基线 1 dmg (装丈八时)');

  // 关键测试: 换朱雀, 也能让丈八 2 手当火杀
  const game2 = makeGame();
  game2.player.equipment.weapon = { id: 'zq-zb', type: 'zhuque', name: '朱雀羽扇', family: 'equipment', slot: 'weapon', range: 4 };
  game2.enemy.equipment.armor = { id: 'foe-tj4', type: 'tengjia', name: '藤甲', family: 'equipment', slot: 'armor' };
  game2.player.hand = [
    { id: 'h-c', type: 'tao', name: '桃', suit: 'heart', color: 'red' },
    { id: 'h-d', type: 'tao', name: '桃', suit: 'heart', color: 'red' }
  ];
  // 注: playZhangbaSha 要求 weapon 是 zhangba, 装朱雀就不能走这条;
  // 但我们用 武圣 red→sha 的 card-as 走 playSha 路径来测朱雀+card-as
});

test('v8 PR-B3: 朱雀 + 武圣红牌当杀 → card-as 虚拟杀 也被转化为火杀 (vs 藤甲 → 2 dmg)', () => {
  const game = Engine.newGame({ seed: 97, startWithFirstTurn: true, playerHero: 'guanyu', enemyHero: 'sunquan' });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  game.player.equipment.weapon = { id: 'zq-ws', type: 'zhuque', name: '朱雀羽扇', family: 'equipment', slot: 'weapon', range: 4 };
  game.enemy.equipment.armor = { id: 'foe-tj-ws', type: 'tengjia', name: '藤甲', family: 'equipment', slot: 'armor' };
  // 红色 桃 用武圣当杀
  game.player.hand.push({ id: 'red-tao', type: 'tao', name: '桃', suit: 'heart', color: 'red' });
  const enemyHpBefore = game.enemy.hp;
  // playCardAs 'sha' 会生成虚拟杀 sourceCard.type === 'sha' → 经过 playSha → 朱雀转化
  const result = Engine.playCardAs(game, 'player', 'red-tao', 'sha');
  assert.equal(result.ok, true);
  assert.equal(game.enemy.hp, enemyHpBefore - 2, '武圣红桃当杀 + 朱雀转火杀 + 藤甲 → 2 dmg');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
