// v10 V5 端到端: 无懈可击 链式响应 (走 requestPlayerResponse 框架).
// 引擎默认零回归 (无 wuxieResponse='ask' 时, 当前 target 有无懈则自动消耗, 锦囊取消).
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

function setup(seed) {
  const game = Engine.newGame({ seed: seed || 95001, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.skillPreferences = game.player.skillPreferences || {};
  game.player.skillPreferences.wuxieResponse = 'ask';
  game.turn = 'enemy';
  game.phase = 'play';
  return game;
}

// ───── 单层: 玩家是 target ────────────────────────────────────────────

test('v10 V5: 敌方对玩家【过河拆桥】 + 玩家有无懈 + ask → 暂停 wuxie-response', () => {
  const game = setup(95001);
  game.player.hand = [Engine.makeTestCard('wuxie', { id: 'pw1' })];
  game.player.equipment.weapon = Engine.makeTestCard('qinggang', { id: 'pqg' });
  game.enemy.hand = [Engine.makeTestCard('guohe', { id: 'eg' })];

  const res = Engine.playCard(game, 'enemy', 'eg');
  assert.equal(res.ok, true);
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'wuxie-response');
  assert.equal(game.pendingChoice.actor, 'player');
  assert.equal(game.pendingChoice.reason, '【过河拆桥】');
  assert.equal(game.pendingChoice.chainWuxied, false, '初始链未抵消');
  assert.deepEqual(game.pendingChoice.options.map(o => o.cardId), ['pw1']);
  assert.ok(game.pauseState.wuxieChain);
  assert.equal(game.pauseState.wuxieChain.trickName, 'guohe');
  // 装备区未动 (锦囊未结算)
  assert.equal(game.player.equipment.weapon && game.player.equipment.weapon.id, 'pqg');
});

test('v10 V5: 玩家打无懈 {use:true} → 锦囊取消, 装备未弃', () => {
  const game = setup(95002);
  game.player.hand = [Engine.makeTestCard('wuxie', { id: 'pw1' })];
  game.player.equipment.weapon = Engine.makeTestCard('qinggang', { id: 'pqg' });
  game.enemy.hand = [Engine.makeTestCard('guohe', { id: 'eg' })];
  Engine.playCard(game, 'enemy', 'eg');

  const res = Engine.resolvePendingChoice(game, { use: true });
  assert.equal(res.ok, true);
  assert.equal(game.pendingChoice, null);
  assert.equal(game.pauseState.wuxieChain, null);
  assert.equal(game.player.equipment.weapon && game.player.equipment.weapon.id, 'pqg', '装备未弃 (锦囊取消)');
  assert.equal(game.player.hand.length, 0, '无懈已消耗');
});

test('v10 V5: 玩家不打 {use:false} → 锦囊照常结算, 装备被弃', () => {
  const game = setup(95003);
  game.player.hand = [Engine.makeTestCard('wuxie', { id: 'pw1' })];
  game.player.equipment.weapon = Engine.makeTestCard('qinggang', { id: 'pqg' });
  game.enemy.hand = [Engine.makeTestCard('guohe', { id: 'eg' })];
  Engine.playCard(game, 'enemy', 'eg');

  const res = Engine.resolvePendingChoice(game, { use: false });
  assert.equal(res.ok, true);
  assert.equal(game.player.equipment.weapon, null, '装备被弃 (锦囊照常)');
  assert.equal(game.player.hand.length, 1, '无懈未消耗');
});

test('v10 V5: 玩家无无懈 → 不暂停, 锦囊直接结算', () => {
  const game = setup(95004);
  game.player.hand = [];
  game.player.equipment.weapon = Engine.makeTestCard('qinggang', { id: 'pqg' });
  game.enemy.hand = [Engine.makeTestCard('guohe', { id: 'eg' })];

  const res = Engine.playCard(game, 'enemy', 'eg');
  assert.equal(res.ok, true);
  assert.equal(game.pendingChoice, null, '无无懈 → 不暂停');
  assert.equal(game.player.equipment.weapon, null, '装备被弃');
});

test('v10 V5: 无 wuxieResponse pref → 自动响应 (target 有无懈自动消耗)', () => {
  const game = setup(95005);
  delete game.player.skillPreferences.wuxieResponse;
  game.player.hand = [Engine.makeTestCard('wuxie', { id: 'pw1' })];
  game.player.equipment.weapon = Engine.makeTestCard('qinggang', { id: 'pqg' });
  game.enemy.hand = [Engine.makeTestCard('guohe', { id: 'eg' })];

  const res = Engine.playCard(game, 'enemy', 'eg');
  assert.equal(res.ok, true);
  assert.equal(game.pendingChoice, null, '默认不暂停');
  assert.equal(game.player.equipment.weapon && game.player.equipment.weapon.id, 'pqg', '装备未弃 (自动无懈抵消)');
  assert.equal(game.player.hand.length, 0, '无懈被自动消耗');
});

// ───── 链式: 玩家无懈 → 对方反无懈 → 玩家又决定 ────────────────────

test('v10 V5 链: 玩家无懈 → AI 反无懈 → 玩家再次 wuxie-response (chainWuxied=true)', () => {
  const game = setup(95006);
  // 玩家 2 张无懈; AI 1 张无懈; AI 出过河拆桥
  game.player.hand = [
    Engine.makeTestCard('wuxie', { id: 'pw1' }),
    Engine.makeTestCard('wuxie', { id: 'pw2' })
  ];
  game.player.equipment.weapon = Engine.makeTestCard('qinggang', { id: 'pqg' });
  game.enemy.hand = [
    Engine.makeTestCard('guohe', { id: 'eg' }),
    Engine.makeTestCard('wuxie', { id: 'ew1' })
  ];

  Engine.playCard(game, 'enemy', 'eg');
  assert.equal(game.pendingChoice.chainWuxied, false, '第一层: 未抵消');

  // 玩家用无懈 → 链推进: AI 自动反无懈 → 玩家第二次决定
  Engine.resolvePendingChoice(game, { use: true });
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'wuxie-response', '第二层 wuxie pending');
  assert.equal(game.pendingChoice.chainWuxied, false, '玩家又一次决定 (AI 反无懈翻回未抵消)');
  // 玩家手中只剩 1 张无懈
  assert.deepEqual(game.pendingChoice.options.map(o => o.cardId), ['pw2']);
  assert.equal(game.player.hand.length, 1);
});

test('v10 V5 链: 玩家二次无懈后 AI 无更多无懈 → 链结束, 锦囊取消', () => {
  const game = setup(95007);
  game.player.hand = [
    Engine.makeTestCard('wuxie', { id: 'pw1' }),
    Engine.makeTestCard('wuxie', { id: 'pw2' })
  ];
  game.player.equipment.weapon = Engine.makeTestCard('qinggang', { id: 'pqg' });
  game.enemy.hand = [
    Engine.makeTestCard('guohe', { id: 'eg' }),
    Engine.makeTestCard('wuxie', { id: 'ew1' })
  ];
  Engine.playCard(game, 'enemy', 'eg');
  Engine.resolvePendingChoice(game, { use: true });  // 玩家第一次无懈
  // AI 已自动反无懈; 现在玩家第二次决定
  Engine.resolvePendingChoice(game, { use: true });  // 玩家第二次无懈 → AI 没了 → 链结束

  assert.equal(game.pendingChoice, null);
  assert.equal(game.pauseState.wuxieChain, null);
  assert.equal(game.player.equipment.weapon && game.player.equipment.weapon.id, 'pqg', '装备未弃 (锦囊最终被抵消)');
  assert.equal(game.player.hand.length, 0, '玩家 2 张无懈用尽');
});

test('v10 V5 链: 玩家二次决定不反 → 链结束 (锦囊未取消)', () => {
  const game = setup(95008);
  game.player.hand = [
    Engine.makeTestCard('wuxie', { id: 'pw1' }),
    Engine.makeTestCard('wuxie', { id: 'pw2' })
  ];
  game.player.equipment.weapon = Engine.makeTestCard('qinggang', { id: 'pqg' });
  game.enemy.hand = [
    Engine.makeTestCard('guohe', { id: 'eg' }),
    Engine.makeTestCard('wuxie', { id: 'ew1' })
  ];
  Engine.playCard(game, 'enemy', 'eg');
  Engine.resolvePendingChoice(game, { use: true });  // 玩家第一次无懈
  Engine.resolvePendingChoice(game, { use: false }); // 玩家不再反无懈 → 链结束

  assert.equal(game.pendingChoice, null);
  assert.equal(game.player.equipment.weapon, null, '装备被弃 (链 net wuxied=false)');
  assert.equal(game.player.hand.length, 1, '玩家剩 1 张无懈');
});

test('v10 V5 链: cardId 指定具体无懈 (面板候选选定)', () => {
  const game = setup(95009);
  game.player.hand = [
    Engine.makeTestCard('wuxie', { id: 'pw1' }),
    Engine.makeTestCard('wuxie', { id: 'pw2' })
  ];
  game.player.equipment.weapon = Engine.makeTestCard('qinggang', { id: 'pqg' });
  game.enemy.hand = [Engine.makeTestCard('guohe', { id: 'eg' })];
  Engine.playCard(game, 'enemy', 'eg');
  const res = Engine.resolvePendingChoice(game, { cardId: 'pw2' });

  assert.equal(res.ok, true);
  assert.equal(game.pendingChoice, null);
  assert.equal(game.player.equipment.weapon && game.player.equipment.weapon.id, 'pqg');
  // 检查是 pw2 被弃, pw1 仍在手
  assert.deepEqual(game.player.hand.map(c => c.id), ['pw1']);
});

test('v10 V5: 决斗也走 wuxie 链 (trickName="juedou")', () => {
  const game = setup(95010);
  game.player.hand = [Engine.makeTestCard('wuxie', { id: 'pw1' })];
  game.enemy.hand = [Engine.makeTestCard('juedou', { id: 'ej' })];

  const res = Engine.playCard(game, 'enemy', 'ej');
  assert.equal(res.ok, true);
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'wuxie-response');
  assert.equal(game.pendingChoice.reason, '【决斗】');
  assert.equal(game.pendingChoice.trickName, 'juedou');
  assert.equal(game.pauseState.wuxieChain.trickName, 'juedou');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
