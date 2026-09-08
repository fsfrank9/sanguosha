import assert from 'node:assert/strict';
import { GeneralCardRuntime as G } from '../src/engine/general-card-runtime.js';
import { Engine, Runtime, HERO_CATALOG } from './helpers/load-engine.mjs';
import { collectCardCensus, assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function gameOf(seed = 16301, heroes = ['zuoci', 'caocao'], catalog = HERO_CATALOG) {
  const seats = ['player', 'enemy', 'ally', 'fourth', 'fifth'].slice(0, heroes.length);
  const game = { seats, random: Runtime.makeRng(seed) };
  seats.forEach((actor, i) => { game[actor] = { id: heroes[i], heroId: heroes[i] }; });
  G.initialize(game, { seed, catalog });
  return game;
}

function change(game, action) { return G.assertConservation(game, action); }
function snapshot(game) { return JSON.stringify(game); }

test('AA3: 完整 71 将目录按上场 ID 排除, SP 版本独立且未实现技能不筛掉', () => {
  const game = gameOf(16301, ['zuoci', 'guanyu', 'sp_guanyu']);
  const state = game.generalCards;
  assert.equal(state.catalogIds.length, 71);
  assert.deepEqual(state.catalogIds, Object.keys(HERO_CATALOG).sort());
  assert.deepEqual(state.excludedIds, ['guanyu', 'sp_guanyu', 'zuoci']);
  assert.equal(state.outsideIds.length, 68);
  for (const id of ['sp_machao', 'sp_jiaxu', 'sp_caoren', 'sp_ganning',
    'sp_daqiao', 'sp_xiahoudun', 'sp_sunshangxiang']) {
    assert.ok(state.outsideIds.includes(id), `${id} 仍是合法目录资源`);
  }
  assert.equal(G.assertConservation(game).total, 71);
});

test('AA3: 多席同一武将只排除一次, 濒死体力或外部标记不代替死亡结算', () => {
  const game = gameOf(16301, ['caocao', 'caocao', 'zuoci']);
  assert.deepEqual(game.generalCards.excludedIds, ['caocao', 'zuoci']);
  game.enemy.dead = true;
  game.enemy.hp = 0;
  const drawn = change(game, () => G.draw(game, 'player', 100));
  assert.equal(drawn.length, 69);
  assert.ok(!drawn.includes('caocao') && !drawn.includes('zuoci'));
  assert.deepEqual(G.release(game, 'enemy', ['caocao']), []);
  G.assertConservation(game);
});

test('AA3: 相同种子和操作得到相同抽取, 不同种子有独立排列', () => {
  const first = gameOf(111), second = gameOf(111), other = gameOf(222);
  const a = change(first, () => G.draw(first, 'player', 30));
  const b = change(second, () => G.draw(second, 'player', 30));
  assert.deepEqual(a, b);
  assert.deepEqual(first.generalCards, second.generalCards);
  assert.notDeepEqual(a, G.draw(other, 'player', 30));
  assert.equal(new Set(a).size, 30);
});

test('AA3: 武将抽取与归还不调用普通牌堆的随机数流', () => {
  const game = gameOf(44);
  const expectedRandom = Runtime.makeRng(44);
  assert.equal(game.random(), expectedRandom());
  change(game, () => {
    const ids = G.draw(game, 'player', 9);
    G.select(game, 'player', ids[0]);
    G.releaseAll(game, 'player');
    G.draw(game, 'enemy', 3);
  });
  for (let i = 0; i < 6; i += 1) assert.equal(game.random(), expectedRandom());
});

test('AA3: JSON 快照可独立续抽, 换牌和归还不污染原局', () => {
  const game = gameOf(73);
  const originalIds = G.draw(game, 'player', 3);
  G.select(game, 'player', originalIds[0]);
  const saved = snapshot(game);
  const clone = JSON.parse(saved);
  const cloneDraw = change(clone, () => G.draw(clone, 'enemy', 4));
  change(clone, () => G.select(clone, 'player', originalIds[1]));
  change(clone, () => G.releaseAll(clone, 'player'));
  assert.equal(snapshot(game), saved, '克隆拥有独立的区列表和 RNG 进度');
  const originalDraw = change(game, () => G.draw(game, 'enemy', 4));
  assert.deepEqual(originalDraw, cloneDraw);
  assert.equal(game.generalCards.holdings.player.activeId, originalIds[0]);
  assert.equal(clone.generalCards.holdings.player, undefined);
});

test('AA3: 跨席抽光只有一次落位, 空池抽取不改 RNG, 归还牌可再抽', () => {
  const game = gameOf();
  const first = change(game, () => G.draw(game, 'player', 20));
  const second = change(game, () => G.draw(game, 'enemy', 100));
  assert.equal(second.length, 49);
  assert.equal(new Set(first.concat(second)).size, 69);
  const exhausted = snapshot(game);
  assert.deepEqual(G.draw(game, 'player', 2), []);
  assert.equal(snapshot(game), exhausted);
  const returned = [first[3], first[8]];
  change(game, () => G.release(game, 'player', returned));
  const drawn = change(game, () => G.draw(game, 'enemy', 3));
  assert.deepEqual(drawn.slice().sort(), returned.slice().sort());
  assert.equal(game.generalCards.outsideIds.length, 0);
});

test('AA3: 换公开武将时旧牌回自己暗置区, 当前公开牌也可重选', () => {
  const game = gameOf();
  const [first, second] = G.draw(game, 'player', 2);
  assert.deepEqual(change(game, () => G.select(game, 'player', first)),
    { activeId: first, previousId: null });
  assert.deepEqual(change(game, () => G.select(game, 'player', second)),
    { activeId: second, previousId: first });
  assert.deepEqual(game.generalCards.holdings.player, { hiddenIds: [first], activeId: second });
  assert.deepEqual(G.choiceOptions(game, 'player'), [
    { generalId: second, active: true }, { generalId: first, active: false },
  ]);
  const before = snapshot(game);
  assert.deepEqual(G.select(game, 'player', second), { activeId: second, previousId: second });
  assert.equal(snapshot(game), before, '同牌重选不轮换资源或推进 RNG');
});

test('AA3: 己方可见暗牌, 其他座席与旁观者只见公开牌和暗牌数量', () => {
  const game = gameOf();
  const [active, hidden] = G.draw(game, 'player', 2);
  G.select(game, 'player', active);
  assert.deepEqual(G.view(game, 'player'), { owner: 'player', activeId: active, hiddenCount: 1, hiddenIds: [hidden] });
  const publicView = { owner: 'player', activeId: active, hiddenCount: 1 };
  assert.deepEqual(G.view(game, 'enemy', 'player'), publicView);
  assert.deepEqual(G.view(game, null, 'player'), publicView);
  G.view(game, 'player').hiddenIds.length = 0;
  G.choiceOptions(game, 'player')[0].generalId = 'not-a-general';
  assert.deepEqual(game.generalCards.holdings.player, { hiddenIds: [hidden], activeId: active });
});

test('AA3: 非法座席、数量与跨席选牌全部写前拒绝', () => {
  const game = gameOf();
  const ids = G.draw(game, 'enemy', 2);
  const before = snapshot(game);
  for (const count of [-1, 0, 1.5, Infinity, NaN, '2', Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(G.draw(game, 'player', count), []);
  }
  assert.deepEqual(G.draw(game, 'intruder', 2), []);
  assert.equal(G.select(game, 'player', ids[0]), null);
  assert.equal(G.select(game, 'enemy', 'zuoci'), null);
  assert.equal(G.select(game, 'enemy', game.generalCards.outsideIds[0]), null);
  assert.equal(G.select(game, 'enemy', null), null);
  assert.deepEqual(G.releaseAll(game, 'intruder'), []);
  assert.equal(G.view(game, 'player', 'intruder'), null);
  assert.deepEqual(G.choiceOptions(game, 'intruder'), []);
  assert.equal(snapshot(game), before);
});

test('AA3: 归还混合非法 ID 整批拒绝, 不提前归还其中合法牌', () => {
  const game = gameOf();
  const ids = G.draw(game, 'player', 3), other = G.draw(game, 'enemy', 1)[0];
  G.select(game, 'player', ids[0]);
  const before = snapshot(game);
  for (const requested of [[ids[0], other], [ids[1], 'zuoci'], [ids[1], ids[1]],
    [ids[1], game.generalCards.outsideIds[0]], [ids[1], null], ids[1], []]) {
    assert.deepEqual(G.release(game, 'player', requested), []);
    assert.equal(snapshot(game), before);
  }
});

test('AA3: 归还全部同时收回暗牌和公开牌, 重复清理幂等且其他席保留', () => {
  const game = gameOf();
  const ids = G.draw(game, 'player', 3), other = G.draw(game, 'enemy', 2);
  G.select(game, 'player', ids[0]);
  const returned = change(game, () => G.releaseAll(game, 'player'));
  assert.deepEqual(returned.slice().sort(), ids.slice().sort());
  assert.equal(game.generalCards.holdings.player, undefined);
  assert.deepEqual(game.generalCards.holdings.enemy.hiddenIds, other);
  assert.deepEqual(G.view(game, 'player'), { owner: 'player', activeId: null, hiddenCount: 0, hiddenIds: [] });
  const cleaned = snapshot(game);
  assert.deepEqual(G.releaseAll(game, 'player'), []);
  assert.equal(snapshot(game), cleaned);
});

test('AA3: 自定义目录对象可用于最小局面, 再次初始化不会重置持有牌', () => {
  const catalog = { alpha: { id: 'alpha' }, beta: { id: 'beta' }, gamma: { id: 'gamma' } };
  const game = gameOf(4, ['alpha', 'alpha'], catalog);
  assert.deepEqual(game.generalCards.catalogIds, ['alpha', 'beta', 'gamma']);
  assert.deepEqual(game.generalCards.excludedIds, ['alpha']);
  const ids = G.draw(game, 'player', 2);
  assert.deepEqual(ids.slice().sort(), ['beta', 'gamma']);
  const before = snapshot(game);
  assert.equal(G.initialize(game, { seed: 999, catalog }), game.generalCards);
  assert.equal(snapshot(game), before);
  assert.equal(G.assertConservation(game).total, 3);
});

test('AA3: 初始化无效目录或目录外上场武将时不留下半成状态', () => {
  for (const catalog of [[], {}, { caocao: { id: 'other' } }, { caocao: { id: 'caocao' } }]) {
    const game = { player: { heroId: 'caocao' }, enemy: { heroId: 'zuoci' } };
    const before = snapshot(game);
    assert.throws(() => G.initialize(game, { seed: 1, catalog }), TypeError);
    assert.equal(snapshot(game), before);
  }
});

test('AA3: census 检出重复落位、消失资源、未知 ID 与非法 RNG 进度', () => {
  const duplicate = gameOf();
  const [id] = G.draw(duplicate, 'player', 1);
  duplicate.generalCards.outsideIds.push(id);
  assert.equal(G.census(duplicate).zoneDuplicates.length, 1);
  assert.throws(() => G.assertConservation(duplicate), /武将牌守恒失败/);

  const missing = gameOf(), missingId = missing.generalCards.outsideIds.pop();
  assert.deepEqual(G.census(missing).missingIds, [missingId]);
  assert.throws(() => G.assertConservation(missing), /缺失/);

  const unknown = gameOf();
  unknown.generalCards.outsideIds.push('not-a-general');
  assert.deepEqual(G.census(unknown).unknownIds, ['not-a-general']);
  assert.throws(() => G.assertConservation(unknown), /未知/);

  const badRandom = gameOf();
  badRandom.generalCards.randomState = 0;
  assert.throws(() => G.assertConservation(badRandom), /随机数进度无效/);
});

test('AA3: 守恒检查拒绝排除区与上场本体互换, 包装器防止删除目录掩盖失牌', () => {
  const swapped = gameOf();
  const id = swapped.generalCards.outsideIds[0];
  swapped.generalCards.outsideIds[0] = 'zuoci';
  swapped.generalCards.excludedIds[swapped.generalCards.excludedIds.indexOf('zuoci')] = id;
  assert.throws(() => G.assertConservation(swapped), /上场武将与排除区不一致/);

  const game = gameOf();
  assert.throws(() => change(game, () => {
    const removed = game.generalCards.outsideIds.pop();
    game.generalCards.catalogIds.splice(game.generalCards.catalogIds.indexOf(removed), 1);
  }), /改变了目录资源集合/);
});

test('AA3: 引擎实体游戏牌 census 与牌堆顺序不受武将池操作影响', () => {
  const game = Engine.newGame({ seed: 16661, playerHero: 'caocao', enemyHero: 'guanyu' });
  const before = collectCardCensus(game);
  const deck = game.deck.map(card => card.id);
  assertCardConservation(game, () => {
    G.initialize(game, { seed: 16661, catalog: HERO_CATALOG });
    change(game, () => {
      const [id] = G.draw(game, 'player', 2);
      G.select(game, 'player', id);
      G.releaseAll(game, 'player');
      G.draw(game, 'enemy', 4);
    });
  });
  const after = collectCardCensus(game);
  assert.deepEqual(after.ids, before.ids);
  assert.deepEqual(after.zoneEntries, before.zoneEntries);
  assert.deepEqual(game.deck.map(card => card.id), deck);
  assert.deepEqual(after.zoneDuplicates, []);
  assert.equal(G.assertConservation(game).total, 71);
});

const result = await runTests();
console.log(`\n${result.passed}/${result.total} AA3 general-card runtime tests passed.`);
