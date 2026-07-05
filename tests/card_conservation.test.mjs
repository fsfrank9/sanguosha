import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { countAllCards, assertCardConservation } from './helpers/card-conservation.mjs';

// H1 (审计二轮): 丈八蛇矛主动使用造出的虚拟【杀】曾被推入弃牌堆, 全场牌数
// 每用一次 +1, 洗牌后永久污染牌堆; 对手是曹操时【奸雄】还会把这张凭空牌
// 收进手牌。修复后: 虚拟牌不进弃牌堆, 奸雄改为获得组成虚拟杀的两张实体牌。
// M5: 奸雄获得被朱雀羽扇临时转化的【杀】时, 物理牌身份应还原为普通【杀】。
// v11 A1: countAllCards 抽到 tests/helpers/card-conservation.mjs 共享,
// 主断言升级为 assertCardConservation (唯一 ID 集合守恒 + 无跨区域重复)。

function makeGame(playerHero, enemyHero) {
  const game = Engine.newGame({ seed: 97, startWithFirstTurn: true, playerHero, enemyHero });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('H1: 丈八蛇矛主动使用 → 全场牌数守恒, 虚拟杀不进弃牌堆', () => {
  const game = makeGame('liubei', 'sunquan');
  game.player.equipment.weapon = { id: 'zb-w', type: 'zhangba', name: '丈八蛇矛', family: 'equipment', slot: 'weapon', range: 3 };
  game.player.hand = [
    { id: 'zb-a', type: 'tao', name: '桃', suit: 'heart', color: 'red' },
    { id: 'zb-b', type: 'tao', name: '桃', suit: 'heart', color: 'red' }
  ];
  const before = countAllCards(game);
  const result = assertCardConservation(game, () => Engine.playZhangbaSha(game, 'player', ['zb-a', 'zb-b']));
  assert.equal(result.ok, true);
  assert.equal(countAllCards(game), before, '使用前后全场牌数不变');
  assert.ok(!game.discard.some((c) => String(c.id).startsWith('zhangba-')), '弃牌堆中没有虚拟丈八杀');
  assert.ok(game.discard.some((c) => c.id === 'zb-a'), '组成牌 a 进入弃牌堆');
  assert.ok(game.discard.some((c) => c.id === 'zb-b'), '组成牌 b 进入弃牌堆');
});

test('H1: 丈八蛇矛 vs 奸雄 → 曹操获得两张组成实体牌而非虚拟牌, 牌数守恒', () => {
  const game = makeGame('liubei', 'caocao');
  game.player.equipment.weapon = { id: 'zb-w2', type: 'zhangba', name: '丈八蛇矛', family: 'equipment', slot: 'weapon', range: 3 };
  game.player.hand = [
    { id: 'jx-a', type: 'tao', name: '桃', suit: 'heart', color: 'red' },
    { id: 'jx-b', type: 'shan', name: '闪', suit: 'diamond', color: 'red' }
  ];
  const before = countAllCards(game);
  const result = assertCardConservation(game, () => Engine.playZhangbaSha(game, 'player', ['jx-a', 'jx-b']));
  assert.equal(result.ok, true);
  assert.equal(countAllCards(game), before, '奸雄获得后全场牌数不变');
  assert.ok(!game.enemy.hand.some((c) => String(c.id).startsWith('zhangba-')), '奸雄手牌中没有虚拟丈八杀');
  assert.ok(game.enemy.hand.some((c) => c.id === 'jx-a'), '奸雄获得组成牌 a');
  assert.ok(game.enemy.hand.some((c) => c.id === 'jx-b'), '奸雄获得组成牌 b');
  assert.ok(!game.discard.some((c) => c.id === 'jx-a' || c.id === 'jx-b'), '被奸雄获得的组成牌已离开弃牌堆');
});

test('M5: 朱雀转化的【杀】被奸雄获得 → 手牌中还原为普通【杀】, 无临时标记残留', () => {
  const game = makeGame('liubei', 'caocao');
  game.player.equipment.weapon = { id: 'zq-w', type: 'zhuque', name: '朱雀羽扇', family: 'equipment', slot: 'weapon', range: 4 };
  game.player.hand = [{ id: 'zq-sha', type: 'sha', name: '杀', suit: 'spade', color: 'black' }];
  const before = countAllCards(game);
  const result = assertCardConservation(game, () => Engine.playCard(game, 'player', 'zq-sha'));
  assert.equal(result.ok, true);
  assert.equal(countAllCards(game), before, '奸雄获得后全场牌数不变');
  const gained = game.enemy.hand.find((c) => c.id === 'zq-sha');
  assert.ok(gained, '奸雄获得了造成伤害的杀');
  assert.equal(gained.type, 'sha', '身份还原为普通杀 (不再是 fire_sha)');
  assert.equal(gained.name, '杀', '名称还原');
  assert.equal(gained.zhuqueOriginalType, undefined, '临时标记已清除');
  assert.equal(gained.zhuqueOriginalName, undefined, '临时标记已清除');
});

test('H1 回归: 丈八蛇矛响应路径 (决斗) 牌数守恒不被破坏', () => {
  const game = makeGame('liubei', 'sunquan');
  game.enemy.equipment.weapon = { id: 'zb-resp', type: 'zhangba', name: '丈八蛇矛', family: 'equipment', slot: 'weapon', range: 3 };
  game.enemy.hand = [
    { id: 'resp-a', type: 'tao', name: '桃', suit: 'heart', color: 'red' },
    { id: 'resp-b', type: 'tao', name: '桃', suit: 'heart', color: 'red' }
  ];
  game.player.hand = [{ id: 'duel-card', type: 'juedou', name: '决斗', suit: 'spade', color: 'black' }];
  const before = countAllCards(game);
  const result = assertCardConservation(game, () => Engine.playCard(game, 'player', 'duel-card', { target: 'enemy' }));
  assert.equal(result.ok, true);
  assert.equal(countAllCards(game), before, '决斗 + 丈八响应后全场牌数不变');
  assert.ok(!game.discard.some((c) => String(c.id).startsWith('zhangba-')), '弃牌堆中没有虚拟丈八杀');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
