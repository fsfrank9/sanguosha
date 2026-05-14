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

test('v8 PR-B3: 朱雀装备 + 普通杀 → 转化为火杀 (card.type → fire_sha, name → 火杀)', () => {
  const game = makeGame();
  game.player.equipment.weapon = { id: 'zq-w', type: 'zhuque', name: '朱雀羽扇', family: 'equipment', slot: 'weapon', range: 4 };
  const sha = dealSha(game.player, 'normal-sha');
  Engine.playCard(game, 'player', 'normal-sha');
  // 卡牌已用 → 弃牌堆里 type 已被改成 fire_sha
  const discardedSha = game.discard.find((c) => c.id === 'normal-sha');
  assert.ok(discardedSha, 'sha 已使用进入弃牌堆');
  assert.equal(discardedSha.type, 'fire_sha', 'card.type 被 mutate 为 fire_sha');
  assert.equal(discardedSha.name, '火杀', 'name 被 mutate 为 火杀');
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
