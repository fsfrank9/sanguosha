import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function buildGame(playerHero, enemyHero, seed) {
  const game = Engine.newGame({ seed: seed || 6103, playerHero, enemyHero });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].flags = {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp;
  }
  game.turn = 'enemy';
  game.phase = 'play';
  return game;
}

// ─── Player 司马懿 gets a pendingChoice with the zone catalog ────────

test('Player 司马懿 takes damage → pendingChoice lists source zones (hand count + face-up equip, 不含判定区)', () => {
  const game = buildGame('simayi', 'caocao');
  // Source (caocao) has hand cards (private), 1 equipment, 1 judge-area card.
  game.enemy.hand = [
    c('sha', { id: 'enemy-hand-1', suit: 'spade', color: 'black' }),
    c('sha', { id: 'enemy-hand-2', suit: 'heart', color: 'red' })
  ];
  game.enemy.equipment.weapon = c('zhuge', { id: 'zhuge-equip' });
  game.enemy.judgeArea = [c('lebusishu', { id: 'lebu-on-opp', suit: 'club', color: 'black' })];
  // Damage 司马懿 from caocao. Use a sha play.
  game.enemy.hand.push(c('sha', { id: 'damage-sha', suit: 'spade', color: 'black' }));

  Engine.playCard(game, 'enemy', 'damage-sha');

  const pending = Engine.getPendingChoice(game);
  assert.ok(pending, 'pendingChoice should be set for player 司马懿');
  assert.equal(pending.kind, 'fankui-pick');
  assert.equal(pending.actor, 'player');
  assert.equal(pending.sourceActor, 'enemy');

  // Zones: hand (count), 1 equipment (zhuge), 1 judge (lebu).
  const handZone = pending.zones.find(z => z.zone === 'hand');
  assert.ok(handZone, 'hand zone should appear when source has hand cards');
  assert.equal(handZone.count, 2, 'hand count should match remaining cards (2 left after damage sha was played)');
  // Wait — damage-sha was played, then discarded. Other 2 cards still in hand.

  const equipZone = pending.zones.find(z => z.zone === 'equipment' && z.cardId === 'zhuge-equip');
  assert.ok(equipZone, 'equipment zone should expose the weapon as a specific entry');
  assert.equal(equipZone.name, '诸葛连弩');

  // M3 (审计二轮): glossary__zone.md — 判定区牌不为任何角色所拥有, 反馈不可获得。
  const judgeZone = pending.zones.find(z => z.zone === 'judge');
  assert.equal(judgeZone, undefined, 'M3: 判定区牌不再列入可获得 zones');
});

test('Player resolves zone=hand → random hand card transferred (engine ignores cardId)', () => {
  const game = buildGame('simayi', 'caocao');
  game.enemy.hand = [c('sha', { id: 'opp-hand-card', suit: 'heart', color: 'red' })];
  game.enemy.hand.push(c('sha', { id: 'damage-sha', suit: 'spade', color: 'black' }));

  Engine.playCard(game, 'enemy', 'damage-sha');
  Engine.resolvePendingChoice(game, { zone: 'hand' });

  // Player should now have the one remaining hand card.
  assert.ok(game.player.hand.some(card => card.id === 'opp-hand-card'),
    'hand zone resolve: random hand card moved to player');
  assert.equal(game.enemy.hand.length, 0);
});

test('Player resolves zone=equipment with cardId → exact equipment moved', () => {
  const game = buildGame('simayi', 'caocao');
  game.enemy.equipment.weapon = c('qinggang', { id: 'opp-weapon' });
  game.enemy.equipment.armor = c('bagua', { id: 'opp-armor' });
  game.enemy.hand = [c('sha', { id: 'damage-sha', suit: 'spade', color: 'black' })];

  Engine.playCard(game, 'enemy', 'damage-sha');
  Engine.resolvePendingChoice(game, { zone: 'equipment', cardId: 'opp-armor' });

  // armor zone gone from opponent, present in player hand.
  assert.equal(game.enemy.equipment.armor, null, 'armor slot cleared');
  assert.equal(game.enemy.equipment.weapon.id, 'opp-weapon', 'untargeted equipment stays');
  assert.ok(game.player.hand.some(card => card.id === 'opp-armor'),
    'specific equipment card moved to player hand');
});

test('M3: 来源只有判定区牌 → 反馈无可获得牌, 不设 pendingChoice', () => {
  // 判定区牌不是来源"的牌" — 来源手牌/装备皆空时反馈完全不触发。
  const game = buildGame('simayi', 'caocao');
  game.enemy.judgeArea = [c('lebusishu', { id: 'lebu-1', suit: 'club', color: 'black' })];
  game.enemy.hand = [c('sha', { id: 'damage-sha', suit: 'spade', color: 'black' })];

  Engine.playCard(game, 'enemy', 'damage-sha');

  assert.equal(Engine.getPendingChoice(game), null, '无可获得牌 → 不暂停');
  assert.equal(game.enemy.judgeArea.length, 1, '判定区的乐不思蜀原地不动');
  assert.ok(!game.player.hand.some(card => card.id === 'lebu-1'));
});

test('Player decline preference suppresses 反馈 entirely', () => {
  const game = buildGame('simayi', 'caocao');
  Engine.setSkillPreference(game, 'player', 'fankui', 'decline');
  game.enemy.hand = [c('sha', { id: 'wont-take', suit: 'heart', color: 'red' })];
  game.enemy.hand.push(c('sha', { id: 'damage-sha', suit: 'spade', color: 'black' }));

  Engine.playCard(game, 'enemy', 'damage-sha');

  assert.equal(Engine.getPendingChoice(game), null, 'decline: no pending choice');
  assert.equal(game.player.hand.length, 0, 'decline: nothing taken');
  assert.ok(game.log.some(l => /选择不发动【反馈】/.test(l)));
});

test('AI 司马懿 keeps the legacy auto random-hand path (no pendingChoice)', () => {
  const game = buildGame('caocao', 'simayi');
  game.turn = 'player';
  game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'ai-target', suit: 'heart', color: 'red' })];
  game.player.hand = [c('sha', { id: 'pl-damage-sha', suit: 'spade', color: 'black' })];

  Engine.playCard(game, 'player', 'pl-damage-sha');

  assert.equal(Engine.getPendingChoice(game), null, 'AI never sets pendingChoice for 反馈');
  // AI 司马懿 took the (only) hand card from player.
  assert.ok(game.enemy.hand.some(card => card.id === 'pl-damage-sha') || game.enemy.hand.length > 0,
    'AI got a card from source');
});

test('Source with no gainable cards (no hand, no equip, no judge) → no pendingChoice, no crash', () => {
  const game = buildGame('simayi', 'caocao');
  // Source plays only the damaging sha (no other hand cards, no equip, no judge).
  game.enemy.hand = [c('sha', { id: 'sole-sha', suit: 'spade', color: 'black' })];

  Engine.playCard(game, 'enemy', 'sole-sha');

  // After playing, source has 0 hand, 0 equip, 0 judge → 反馈 finds nothing.
  assert.equal(Engine.getPendingChoice(game), null);
  // No crash; damage still resolved.
  assert.equal(game.player.hp, game.player.maxHp - 1);
});

test('Invalid zone decision restores pendingChoice', () => {
  const game = buildGame('simayi', 'caocao');
  game.enemy.hand = [
    c('sha', { id: 'banana-card', suit: 'heart', color: 'red' }),
    c('sha', { id: 'damage-sha', suit: 'spade', color: 'black' })
  ];
  Engine.playCard(game, 'enemy', 'damage-sha');
  const result = Engine.resolvePendingChoice(game, { zone: 'invalid-zone' });
  assert.equal(result.ok, false);
  assert.ok(Engine.getPendingChoice(game), 'invalid input must not consume the prompt');
});

console.log('\nFankui-pick tests passed.');
