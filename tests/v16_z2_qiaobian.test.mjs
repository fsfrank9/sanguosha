import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Engine, c, StateRuntime } from './helpers/load-engine.mjs';
import { test, runTests } from './helpers/harness.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

function gameWith(heroes = ['zhanghe', 'caocao', 'sunquan']) {
  const g = Engine.newGame({ seed: 162020, seats: ['player', 'enemy', 'ally'],
    roles: { player: '主公', enemy: '反贼', ally: '忠臣' },
    playerHero: heroes[0], enemyHero: heroes[1], allyHero: heroes[2] });
  for (const actor of g.seats) {
    Object.assign(g[actor], { hand: [], judgeArea: [], flags: {}, skillPreferences: {},
      equipment: { weapon: null, armor: null, horseMinus: null, horsePlus: null }, hp: g[actor].maxHp });
  }
  g.turn = 'player'; g.phase = 'draw'; g.pauseState = {}; g.pendingChoice = null; g.pendingChoiceQueue = [];
  g.discard = []; g.log = [];
  g.player.hand = [c('sha', { id: 'cost' })];
  return g;
}
function open(g) { assert.equal(Engine.advancePhase(g).ok, true); return g.pendingChoice; }
function choose(g, fields = {}) {
  return Engine.resolvePendingChoice(g, { costCardId: 'cost', sourceActor: 'enemy',
    sourceZone: 'equipment', cardId: 'moving', targetActor: 'player', targetZone: 'equipment', ...fields });
}

test('Z2 empty board: real before-play ask can decline without paying or reopening', () => {
  const g = gameWith(); open(g);
  assert.equal(g.phase, 'draw'); assert.equal(g.pendingChoice.kind, 'qiaobian-play');
  assert.equal(Engine.advancePhase(g).ok, false);
  assert.equal(Engine.resolvePendingChoice(g, {}).ok, true);
  assert.equal(g.phase, 'play'); assert.equal(g.player.hand[0].id, 'cost'); assert.equal(g.pendingChoice, null);
});

test('Z2 optional movement: pay to skip even with no movable public cards', () => {
  const g = gameWith(); open(g);
  assertCardConservation(g, () => Engine.resolvePendingChoice(g, { costCardId: 'cost', skipOnly: true }));
  assert.equal(g.phase, 'discard'); assert.equal(g.player.flags.skipPlay, true);
  assert.equal(g.discard[0].id, 'cost'); assert.equal(g.pauseState.qiaobianPlay, null);
});

for (const [type, slot] of [['qinggang', 'weapon'], ['bagua', 'armor'], ['minus_horse', 'horseMinus'], ['plus_horse', 'horsePlus']]) {
  test('Z2 equipment movement preserves physical identity and matching slot: ' + type, () => {
    const g = gameWith(); const card = c(type, { id: 'moving' }); g.enemy.equipment[slot] = card;
    open(g); assertCardConservation(g, () => choose(g));
    assert.equal(g.player.equipment[slot], card); assert.equal(g.enemy.equipment[slot], null);
    assert.equal(g.phase, 'discard'); assert.equal(g.pendingChoice, null);
  });
}

test('Z2 occupied equipment destination rejects atomically, never replaces equipment', () => {
  const g = gameWith(); g.enemy.equipment.weapon = c('qinggang', { id: 'moving' });
  g.player.equipment.weapon = c('zhuge', { id: 'occupied' }); open(g);
  assert.equal(choose(g).ok, false); assert.equal(g.player.hand[0].id, 'cost');
  assert.equal(g.player.equipment.weapon.id, 'occupied'); assert.equal(g.enemy.equipment.weapon.id, 'moving');
  assert.equal(g.phase, 'draw');
});

test('Z2 stale source, target death, and stale cost all reject without partial payment', () => {
  for (const change of [g => { g.enemy.equipment.weapon = null; }, g => { g.player.hand = []; }, g => { g.ally.hp = 0; }]) {
    const g = gameWith(); g.enemy.equipment.weapon = c('qinggang', { id: 'moving' }); open(g); change(g);
    assert.equal(choose(g, { targetActor: 'ally' }).ok, false); assert.equal(g.discard.length, 0);
    assert.equal(g.phase, 'draw'); assert.equal(g.pendingChoice.kind, 'qiaobian-play');
  }
});

test('Z2 same-actor move and zone swaps reject atomically', () => {
  const g = gameWith(); g.enemy.equipment.weapon = c('qinggang', { id: 'moving' }); open(g);
  for (const patch of [{ targetActor: 'enemy' }, { targetZone: 'judgeArea' }, { sourceZone: 'judgeArea' }]) {
    assert.equal(choose(g, patch).ok, false); assert.equal(g.player.hand.length, 1);
  }
});

test('Z2 judge placement ignores distance and self-use condition, respects duplicates', () => {
  const g = gameWith(); const card = c('bingliang', { id: 'moving' }); g.enemy.judgeArea = [card]; open(g);
  assertCardConservation(g, () => choose(g, { sourceZone: 'judgeArea', targetZone: 'judgeArea' }));
  assert.equal(g.player.judgeArea[0], card); assert.equal(g.enemy.judgeArea.length, 0);
  const duplicate = gameWith(); duplicate.enemy.judgeArea = [c('bingliang', { id: 'moving' })];
  duplicate.player.judgeArea = [c('bingliang', { id: 'duplicate' })]; open(duplicate);
  assert.equal(choose(duplicate, { sourceZone: 'judgeArea', targetZone: 'judgeArea' }).ok, false);
  assert.equal(duplicate.discard.length, 0);
});

test('Z2 converted Guanshifu remains Lebu in judgement; cannot move to equipment or Qianxun', () => {
  const g = gameWith(['daqiao', 'caocao', 'luxun']);
  g.phase = 'play'; g.player.hand = [c('guanshi', { id: 'moving', suit: 'diamond' })];
  assert.equal(Engine.playCardAs(g, 'player', 'moving', 'lebusishu', { target: 'enemy' }).ok, true);
  const placed = g.enemy.judgeArea[0];
  StateRuntime.grantSkill(g.player, 'qiaobian', '巧变'); g.player.hand = [c('sha', { id: 'cost' })]; g.phase = 'draw'; open(g);
  assert.equal(choose(g, { sourceZone: 'judgeArea', targetZone: 'equipment' }).ok, false);
  assert.equal(choose(g, { sourceZone: 'judgeArea', targetZone: 'judgeArea', targetActor: 'ally' }).ok, false);
  assertCardConservation(g, () => choose(g, { sourceZone: 'judgeArea', targetZone: 'judgeArea' }));
  assert.equal(g.player.judgeArea[0], placed); assert.equal(placed.type, 'lebusishu');
  assert.equal(g.player.equipment.weapon, null);
});

test('Z2 Weimu rejects black judgement movement; Hongyan does not recolor incoming cards', () => {
  const g = gameWith(['zhanghe', 'caocao', 'jiaxu']);
  StateRuntime.grantSkill(g.ally, 'hongyan', '红颜'); g.enemy.judgeArea = [c('bingliang', { id: 'moving', suit: 'spade' })];
  open(g); assert.equal(choose(g, { sourceZone: 'judgeArea', targetZone: 'judgeArea', targetActor: 'ally' }).ok, false);
  assert.equal(g.player.hand.length, 1);
});

test('Z2 red judgement can move to Weimu and never opens Wuxie', () => {
  const g = gameWith(['zhanghe', 'caocao', 'jiaxu']);
  g.ally.hand = [c('wuxie', { id: 'wx' })]; g.ally.skillPreferences.wuxieResponse = 'ask';
  g.enemy.judgeArea = [c('lebusishu', { id: 'moving', suit: 'heart' })]; open(g);
  assert.equal(choose(g, { sourceZone: 'judgeArea', targetZone: 'judgeArea', targetActor: 'ally' }).ok, true);
  assert.equal(g.ally.judgeArea[0].id, 'moving'); assert.equal(g.ally.hand[0].id, 'wx'); assert.equal(g.pendingChoice, null);
});

test('Z2 already-skipped play can pay, but cannot move a card', () => {
  const g = gameWith(); g.player.flags.skipPlay = true; g.enemy.equipment.weapon = c('qinggang', { id: 'moving' });
  open(g); assert.equal(g.pendingChoice.allowMove, false); assert.equal(choose(g).ok, false);
  assert.equal(Engine.resolvePendingChoice(g, { costCardId: 'cost', skipOnly: true }).ok, true);
  assert.equal(g.phase, 'discard'); assert.equal(g.enemy.equipment.weapon.id, 'moving');
});

test('Z2 play skipped by another effect after the window opens also blocks movement', () => {
  const g = gameWith(); g.enemy.equipment.weapon = c('qinggang', { id: 'moving' }); open(g);
  g.player.flags.skipPlay = true;
  assert.equal(choose(g).ok, false); assert.equal(g.player.hand.length, 1);
  assert.equal(g.pendingChoice.allowMove, false);
  assert.equal(Engine.resolvePendingChoice(g, { costCardId: 'cost', skipOnly: true }).ok, true);
  assert.equal(g.enemy.equipment.weapon.id, 'moving');
});

test('Z2 Baiyin and Xiaoji loss settle after successful move and retain conservation', () => {
  const g = gameWith(['zhanghe', 'sunshangxiang', 'sunquan']);
  g.enemy.hp = 1; const card = c('baiyin', { id: 'moving' }); g.enemy.equipment.armor = card;
  open(g); assertCardConservation(g, () => choose(g));
  assert.equal(g.player.equipment.armor, card); assert.equal(g.enemy.hp, 2); assert.equal(g.enemy.hand.length, 2);
});

test('Z2 judgement movement does not cause Tuntian ownership loss', () => {
  const g = gameWith(['zhanghe', 'dengai', 'sunquan']);
  g.enemy.skillPreferences.tuntian = 'auto'; g.enemy.judgeArea = [c('lebusishu', { id: 'moving', suit: 'diamond' })];
  const deckSize = g.deck.length; open(g);
  choose(g, { sourceZone: 'judgeArea', targetZone: 'judgeArea' });
  assert.equal(g.deck.length, deckSize); assert.equal((g.enemy.tian || []).length, 0);
});

test('Z2 choice serial rejects prior window submissions and repeated resolution', () => {
  const g = gameWith(); g.enemy.equipment.weapon = c('qinggang', { id: 'moving' });
  const first = open(g); Engine.resolvePendingChoice(g, {}); g.phase = 'draw'; const second = open(g);
  assert.notEqual(first, second); assert.equal(choose(g, { choiceId: first.choiceId }).ok, false);
  assert.equal(g.pendingChoice, second); assert.equal(choose(g, { choiceId: second.choiceId }).ok, true);
  assert.equal(choose(g).ok, false); assert.equal(g.discard.filter(card => card.id === 'cost').length, 1);
});

test('Z2 AI moves hostile equipment to self with one discard, no player prompt', () => {
  const g = gameWith(['caocao', 'zhanghe', 'sunquan']); g.turn = 'enemy';
  g.enemy.hand = [c('sha', { id: 'ai-cost' })]; g.player.equipment.weapon = c('qinggang', { id: 'moving' });
  assertCardConservation(g, () => Engine.advancePhase(g));
  assert.equal(g.enemy.equipment.weapon.id, 'moving'); assert.equal(g.phase, 'discard');
  assert.equal(g.pendingChoice, null); assert.equal(g.discard.filter(card => card.id === 'ai-cost').length, 1);
});

test('Z2 AI declines when every movement benefits enemies', () => {
  const g = gameWith(['caocao', 'zhanghe', 'sunquan']); g.turn = 'enemy';
  g.enemy.hand = [c('sha', { id: 'ai-cost' })]; g.enemy.equipment.weapon = c('qinggang', { id: 'moving' });
  Engine.advancePhase(g); assert.equal(g.phase, 'play'); assert.equal(g.enemy.hand[0].id, 'ai-cost');
});

test('Z2 automatic turn entry waits for play decision after normal draws, no hand means no ask', () => {
  const g = gameWith(); Engine.startTurn(g, 'player');
  assert.equal(g.phase, 'draw'); assert.equal(g.pendingChoice.kind, 'qiaobian-play');
  assert.equal(g.player.hand.length, 3); Engine.resolvePendingChoice(g, {}); assert.equal(g.phase, 'play');
  const empty = gameWith(); empty.player.hand = []; Engine.advancePhase(empty);
  assert.equal(empty.phase, 'play'); assert.equal(empty.pendingChoice, null);
});

test('Z2 draw and play skips are independently payable in the same turn', () => {
  const g = gameWith(); g.phase = 'judge'; g.player.skillPreferences.qiaobian = 'auto';
  g.enemy.hand = [c('shan', { id: 'stolen-cost' })];
  g.enemy.equipment.weapon = c('qinggang', { id: 'moving' });
  assertCardConservation(g, () => Engine.advancePhase(g));
  assert.equal(g.player.hand[0].id, 'stolen-cost'); open(g);
  assertCardConservation(g, () => choose(g, { costCardId: 'stolen-cost' }));
  assert.equal(g.phase, 'discard'); assert.equal(g.discard.length, 2);
});

test('Z2 public metadata/spec delivered together and entry uses single continuation', () => {
  const spec = JSON.parse(fs.readFileSync(new URL('./fixtures/official_shan_skill_specs.json', import.meta.url))).heroes[0].skills[0].spec;
  assert.equal(Object.hasOwn(spec, 'deviations'), false); assert.ok(spec.engineHooks.includes('onBeforePlayPhase'));
  const source = fs.readFileSync(new URL('../src/engine/skills.js', import.meta.url), 'utf8');
  assert.match(source, /moveCard\(game, move.cardId/); assert.match(source, /saved.stage = 'advance'/);
  assert.match(source, /decision.choiceId !== pending.choiceId/);
});

runTests();
