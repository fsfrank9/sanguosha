import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function makeGame() {
  const game = Engine.newGame({ seed: 79, startWithFirstTurn: true });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

function dealGuohe(state, id) {
  const card = { id, type: 'guohe', name: '过河拆桥', family: 'trick', suit: 'spade', color: 'black' };
  state.hand.push(card);
  return card;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v7 PR-9: canPlayCard 拒绝 — 对手手牌+装备区皆空（仅判定区有牌）', () => {
  const game = makeGame();
  game.enemy.judgeArea.push({ id: 'le-only', type: 'lebusishu', name: '乐不思蜀', family: 'delayed', suit: 'spade', color: 'black' });
  const card = dealGuohe(game.player, 'guohe-no-targets');
  const result = Engine.canPlayCard(game, 'player', card);
  assert.equal(result.ok, false);
  assert.match(result.message, /1V1.*手牌|装备/);
});

test('v7 PR-9: canPlayCard 通过 — 对手有装备', () => {
  const game = makeGame();
  game.enemy.equipment.weapon = { id: 'foe-w', type: 'qinggang', name: '青釭剑', family: 'equipment', slot: 'weapon', range: 2 };
  const card = dealGuohe(game.player, 'guohe-equip-only');
  assert.equal(Engine.canPlayCard(game, 'player', card).ok, true);
});

test('v7 PR-9: 显式 options.targetZone="judge" → 拒绝 (1V1 不允许)', () => {
  const game = makeGame();
  game.player.skillPreferences.guohe = 'auto';
  game.enemy.equipment.weapon = { id: 'foe-w2', type: 'qinggang', name: '青釭剑', family: 'equipment', slot: 'weapon', range: 2 };
  game.enemy.judgeArea.push({ id: 'le2', type: 'lebusishu', name: '乐不思蜀', family: 'delayed', suit: 'spade', color: 'black' });
  dealGuohe(game.player, 'guohe-judge');
  const result = Engine.playCard(game, 'player', 'guohe-judge', { targetZone: 'judge', targetCardId: 'le2' });
  assert.equal(result.ok, false);
  assert.match(result.message, /判定区/);
  // 判定区的卡未被弃
  assert.equal(game.enemy.judgeArea.length, 1);
});

test('v7 PR-9: options.targetZone="equipment" + cardId → 直接弃指定装备', () => {
  const game = makeGame();
  game.enemy.equipment.weapon = { id: 'wpn-target', type: 'qinggang', name: '青釭剑', family: 'equipment', slot: 'weapon', range: 2 };
  game.enemy.equipment.armor = { id: 'arm-keep', type: 'renwang', name: '仁王盾', family: 'equipment', slot: 'armor' };
  dealGuohe(game.player, 'guohe-equip-pick');
  const result = Engine.playCard(game, 'player', 'guohe-equip-pick', { targetZone: 'equipment', targetCardId: 'wpn-target' });
  assert.equal(result.ok, true);
  assert.equal(game.enemy.equipment.weapon, null);
  assert.ok(game.discard.some((c) => c.id === 'wpn-target'));
  assert.ok(game.enemy.equipment.armor, '另一件装备保留');
});

test('v7 PR-9: options.targetZone="hand" + cardId → 直接弃指定手牌', () => {
  const game = makeGame();
  game.enemy.hand.push(
    { id: 'h1', type: 'sha', name: '杀', suit: 'spade', color: 'black' },
    { id: 'h2', type: 'shan', name: '闪', suit: 'heart', color: 'red' }
  );
  dealGuohe(game.player, 'guohe-hand-pick');
  const result = Engine.playCard(game, 'player', 'guohe-hand-pick', { targetZone: 'hand', targetCardId: 'h2' });
  assert.equal(result.ok, true);
  assert.ok(game.discard.some((c) => c.id === 'h2'));
  assert.ok(game.enemy.hand.some((c) => c.id === 'h1'), '另一张手牌保留');
});

test('v7 PR-9: AI source (auto) + 对手有装备 → 优先弃装备', () => {
  const game = makeGame();
  game.turn = 'enemy';
  // enemy 默认 auto
  game.player.equipment.weapon = { id: 'p-wpn', type: 'qinggang', name: '青釭剑', family: 'equipment', slot: 'weapon', range: 2 };
  game.player.hand.push({ id: 'p-h', type: 'tao', name: '桃', suit: 'heart', color: 'red' });
  dealGuohe(game.enemy, 'guohe-ai');
  Engine.playCard(game, 'enemy', 'guohe-ai');
  assert.equal(game.player.equipment.weapon, null, 'AI 优先弃装备');
  assert.ok(game.player.hand.some((c) => c.id === 'p-h'), '手牌保留');
});

test('v7 PR-9: AI source (auto) + 对手只有手牌 → 弃手牌 hand[0]', () => {
  const game = makeGame();
  game.turn = 'enemy';
  game.player.hand.push(
    { id: 'p-h-1', type: 'tao', name: '桃', suit: 'heart', color: 'red' },
    { id: 'p-h-2', type: 'shan', name: '闪', suit: 'heart', color: 'red' }
  );
  dealGuohe(game.enemy, 'guohe-ai-hand');
  Engine.playCard(game, 'enemy', 'guohe-ai-hand');
  assert.ok(game.discard.some((c) => c.id === 'p-h-1'), 'auto 弃 hand[0]');
  assert.ok(game.player.hand.some((c) => c.id === 'p-h-2'));
});

test('v7 PR-9: player source ask 默认 → pendingChoice "guohe-1v1-pick" 暴露装备列表 + 手牌内容', () => {
  const game = makeGame();
  // player default pref = ask
  game.enemy.equipment.weapon = { id: 'expose-wpn', type: 'qinggang', name: '青釭剑', family: 'equipment', slot: 'weapon', range: 2 };
  game.enemy.hand.push(
    { id: 'expose-h-1', type: 'tao', name: '桃', suit: 'heart', color: 'red' },
    { id: 'expose-h-2', type: 'sha', name: '杀', suit: 'spade', color: 'black' }
  );
  dealGuohe(game.player, 'guohe-ask');
  Engine.playCard(game, 'player', 'guohe-ask');
  assert.ok(game.pendingChoice);
  assert.equal(game.pendingChoice.kind, 'guohe-1v1-pick');
  assert.equal(game.pendingChoice.actor, 'player');
  assert.equal(game.pendingChoice.target, 'enemy');
  assert.equal(game.pendingChoice.equipment.length, 1);
  assert.equal(game.pendingChoice.equipment[0].cardId, 'expose-wpn');
  assert.equal(game.pendingChoice.hand.length, 2);
  // spec: "观看目标角色的手牌" — 牌名应该可见
  assert.deepEqual(game.pendingChoice.hand.map((c) => c.cardId).sort(), ['expose-h-1', 'expose-h-2']);
  assert.ok(game.pendingChoice.hand.every((c) => c.name && c.suit));
  // 还没弃任何牌
  assert.ok(game.enemy.equipment.weapon);
  assert.equal(game.enemy.hand.length, 2);
});

test('v7 PR-9: resolve {zone:"equipment", cardId} → 弃该装备', () => {
  const game = makeGame();
  game.enemy.equipment.weapon = { id: 'res-wpn', type: 'qinggang', name: '青釭剑', family: 'equipment', slot: 'weapon', range: 2 };
  game.enemy.hand.push({ id: 'res-h', type: 'tao', name: '桃', suit: 'heart', color: 'red' });
  dealGuohe(game.player, 'guohe-resolve-eq');
  Engine.playCard(game, 'player', 'guohe-resolve-eq');
  const result = Engine.resolvePendingChoice(game, { zone: 'equipment', cardId: 'res-wpn' });
  assert.equal(result.ok, true);
  assert.equal(game.enemy.equipment.weapon, null);
  assert.ok(game.discard.some((c) => c.id === 'res-wpn'));
  assert.equal(game.pendingChoice, null);
});

test('v7 PR-9: resolve {zone:"hand", cardId} → 弃指定手牌', () => {
  const game = makeGame();
  game.enemy.hand.push(
    { id: 'res-h-keep', type: 'shan', name: '闪', suit: 'heart', color: 'red' },
    { id: 'res-h-drop', type: 'sha', name: '杀', suit: 'spade', color: 'black' }
  );
  dealGuohe(game.player, 'guohe-resolve-hand');
  Engine.playCard(game, 'player', 'guohe-resolve-hand');
  const result = Engine.resolvePendingChoice(game, { zone: 'hand', cardId: 'res-h-drop' });
  assert.equal(result.ok, true);
  assert.ok(game.discard.some((c) => c.id === 'res-h-drop'));
  assert.ok(game.enemy.hand.some((c) => c.id === 'res-h-keep'));
});

test('v7 PR-9: resolve 错误 zone → fail，pendingChoice 重置', () => {
  const game = makeGame();
  game.enemy.equipment.weapon = { id: 'rew', type: 'qinggang', name: '青釭剑', family: 'equipment', slot: 'weapon', range: 2 };
  dealGuohe(game.player, 'guohe-bad-zone');
  Engine.playCard(game, 'player', 'guohe-bad-zone');
  const result = Engine.resolvePendingChoice(game, { zone: 'judge', cardId: 'rew' });
  assert.equal(result.ok, false);
  assert.ok(game.pendingChoice, '失败后 pendingChoice 应被重置');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
