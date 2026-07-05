import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

// M1 (审计二轮): gltjk flow__decreaselife.md / flow__damage.md — "受到伤害后"
// 时机 (奸雄/反馈/刚烈/遗计) 在扣减体力 (含嵌套濒死结算) 之后, 此前引擎先派发
// hooks 再进入濒死, 与官方顺序相反。
// v11 A1: 引擎变更调用统一包 assertCardConservation (全局牌 ID 守恒断言)。

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

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

test('M1: 1 血曹操受杀致濒死 → 先桃自救脱离濒死, 后发动奸雄获得杀', () => {
  const game = makeGame('liubei', 'caocao');
  game.enemy.hp = 1;
  game.enemy.hand = [c('tao', { id: 'cc-tao' })];
  game.player.hand = [c('sha', { id: 'lethal-sha' })];

  const result = assertCardConservation(game, () => Engine.playCard(game, 'player', 'lethal-sha'));
  assert.equal(result.ok, true);
  assert.equal(game.enemy.hp, 1, '曹操桃自救回到 1');
  assert.ok(game.enemy.hand.some((card) => card.id === 'lethal-sha'), '奸雄在濒死结算后获得杀');
  assert.ok(game.discard.some((card) => card.id === 'cc-tao'), '救援桃进弃牌堆');
  // log 顺序: 濒死/桃救援 在 奸雄 之前
  const logText = game.log.join('\n');
  const dyingIdx = logText.indexOf('濒死');
  const jianxiongIdx = logText.indexOf('奸雄');
  assert.ok(dyingIdx >= 0 && jianxiongIdx >= 0, '两段 log 都存在');
  assert.ok(dyingIdx < jianxiongIdx, 'M1: 濒死结算 log 在奸雄发动 log 之前');
});

test('M1: 曹操无救援牌死亡 → 奸雄不触发, 来源杀仍进弃牌堆 (牌守恒)', () => {
  const game = makeGame('liubei', 'caocao');
  game.enemy.hp = 1;
  game.player.hand = [c('sha', { id: 'kill-sha' })];

  const result = assertCardConservation(game, () => Engine.playCard(game, 'player', 'kill-sha'));
  assert.equal(result.ok, true);
  assert.equal(game.phase, 'gameover');
  assert.equal(game.winner, 'player');
  assert.ok(!game.log.some((entry) => /奸雄/.test(entry)), '死亡后奸雄不触发');
  assert.ok(game.discard.some((card) => card.id === 'kill-sha'), '来源杀进入弃牌堆 (不滞留)');
});

test('M1: 玩家救援暂停期间 hooks 延迟 — 救活后才派发奸雄', () => {
  // turn=player → 濒死响应者顺序 [player, enemy]; player 有桃且默认 ask →
  // dying-rescue 挂起。此时奸雄不得先拿牌 (deferredDamageAfter)。
  const game = makeGame('liubei', 'caocao');
  game.enemy.hp = 1;
  game.enemy.hand = [];
  game.player.hand = [c('sha', { id: 'pause-sha' }), c('tao', { id: 'p-tao' })];

  const result = assertCardConservation(game, () => Engine.playCard(game, 'player', 'pause-sha'));
  assert.equal(result.ok, true);
  assert.equal(game.pendingChoice.kind, 'dying-rescue');
  assert.ok(!game.enemy.hand.some((card) => card.id === 'pause-sha'), '濒死挂起期间奸雄未拿牌');

  const rescued = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'p-tao' }));
  assert.equal(rescued.ok, true);
  assert.equal(game.enemy.hp, 1, '刘备的桃救回曹操');
  assert.ok(game.enemy.hand.some((card) => card.id === 'pause-sha'), '濒死结束后奸雄获得杀');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
