// v13 N2: 军争盘点销账 — 牌堆可达性与守恒。
//   (a) 目录⇄配方一致性守护: CARD_CATALOG 声明的每个牌型都必须进
//       buildDeck 配方 (寒冰/古锭/朱雀/银月 v8 起规则齐全却漏配方,
//       实战不可达的疏漏不得复发)。
//   (b) 新入配方四武器实际可摸 (146? → 142 张全量牌堆构建断言)。
//   (c) 奸雄 × 多目标 AOE 守恒回归: 先结算席奸雄取回万箭后, 后续席
//       收尾不得把已归属手牌的来源牌补入弃牌堆 (k4 soak seed
//       47201/47303 抓获的双区并存)。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine, CardRuntime, CARD_CATALOG } from './helpers/load-engine.mjs';
import { collectCardCensus } from './helpers/card-conservation.mjs';

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

test('N2a: CARD_CATALOG 每个牌型都进 buildDeck 配方 (目录⇄牌堆一致)', () => {
  const game = Engine.newGame({ seed: 50001 });
  const typesInPlay = new Set();
  for (const zone of [game.deck, game.discard, game.player.hand, game.enemy.hand]) {
    for (const card of zone) typesInPlay.add(card.type);
  }
  for (const seat of game.seats) {
    const eq = game[seat].equipment || {};
    for (const slot of ['weapon', 'armor', 'horseMinus', 'horsePlus']) {
      if (eq[slot]) typesInPlay.add(eq[slot].type);
    }
  }
  const missing = Object.keys(CARD_CATALOG).filter((type) => !typesInPlay.has(type));
  assert.deepEqual(missing, [],
    '目录声明但配方缺失 (实战不可达): ' + missing.join(', ')
    + ' — 新增牌型必须同时进 buildDeck 配方或在本测试显式豁免');
});

test('N2b: 寒冰/古锭/朱雀/银月 各 ×1 入牌堆, 全量 142 张', () => {
  const game = Engine.newGame({ seed: 50002 });
  const all = [...game.deck, ...game.player.hand, ...game.enemy.hand];
  for (const type of ['hanbing', 'guding', 'zhuque', 'yinyue']) {
    assert.equal(all.filter((card) => card.type === type).length, 1, type + ' ×1');
  }
  assert.equal(all.length, 142, '35 型 138 张 + 4 武器 = 142 (配方变更须同步本断言)');
});

test('N2c: 奸雄取回万箭后, 后续 AOE 席位收尾不补弃 (双区并存回归)', () => {
  // 3 席: player 出万箭; enemy=曹操 (奸雄 auto, 无闪必中先结算);
  // ally 无闪同样受伤 — 其收尾曾把已在曹操手里的万箭再补入弃牌堆。
  const game = Engine.newGame({
    seed: 50003,
    seats: ['player', 'enemy', 'ally'],
    playerHero: 'liubei', enemyHero: 'caocao', allyHero: 'guanyu'
  });
  for (const seat of game.seats) {
    game[seat].hand = [];
    game[seat].judgeArea = [];
    game[seat].hp = game[seat].maxHp;
    game[seat].skillPreferences = {};
    game[seat].flags = {};
  }
  game.deck = [c('shan', { id: 'n2-pad1' }), c('shan', { id: 'n2-pad2' })];
  game.discard = [];
  game.turn = 'player';
  game.phase = 'play';
  game.player.hand = [c('wanjian', { id: 'n2-wj' })];
  const result = Engine.playCard(game, 'player', 'n2-wj');
  assert.ok(result.ok, result.message);
  assert.ok(game.log.some((line) => line.includes('奸雄')), '曹操奸雄触发: ' + game.log.slice(-8).join(' | '));
  assert.ok(game.enemy.hand.some((card) => card.id === 'n2-wj'), '万箭归奸雄手牌');
  assert.equal(game.discard.filter((card) => card.id === 'n2-wj').length, 0, '弃牌堆无副本 (不补弃)');
  const census = collectCardCensus(game);
  assert.deepEqual(census.zoneDuplicates, [], '全场零双区并存');
});

test('N2c 对照: 无奸雄席时 AOE 牌照常留在弃牌堆 (收尾语义不变)', () => {
  const game = Engine.newGame({
    seed: 50004,
    seats: ['player', 'enemy', 'ally'],
    playerHero: 'liubei', enemyHero: 'guanyu', allyHero: 'zhangfei'
  });
  for (const seat of game.seats) {
    game[seat].hand = [];
    game[seat].judgeArea = [];
    game[seat].hp = game[seat].maxHp;
    game[seat].skillPreferences = {};
    game[seat].flags = {};
  }
  game.deck = [];
  game.discard = [];
  game.turn = 'player';
  game.phase = 'play';
  game.player.hand = [c('wanjian', { id: 'n2-wj2' })];
  const result = Engine.playCard(game, 'player', 'n2-wj2');
  assert.ok(result.ok, result.message);
  assert.equal(game.discard.filter((card) => card.id === 'n2-wj2').length, 1, '万箭在弃牌堆恰一份');
  assert.deepEqual(collectCardCensus(game).zoneDuplicates, []);
});
