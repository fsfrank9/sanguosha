import assert from 'node:assert/strict';
import { Engine, CardRuntime } from './helpers/load-engine.mjs';

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

test('card runtime exposes pure card helpers while preserving public engine APIs', () => {
  assert.ok(CardRuntime, 'ES module should export CardRuntime');
  assert.equal(typeof CardRuntime.makeTestCard, 'function');
  assert.equal(typeof CardRuntime.isShaCard, 'function');
  assert.equal(typeof CardRuntime.isNormalTrickCard, 'function');
  assert.equal(typeof CardRuntime.physicalCardOf, 'function');
  assert.equal(Engine.makeTestCard, CardRuntime.makeTestCard, 'public engine API should delegate to CardRuntime.makeTestCard');
  assert.equal(Engine.isShaCard, CardRuntime.isShaCard, 'public engine API should delegate to CardRuntime.isShaCard');
});

test('card runtime preserves card metadata, classification, and physical-card resolution', () => {
  const fireSha = CardRuntime.makeTestCard('fire_sha', { id: 'fire-1', suit: 'heart', rank: 'Q' });
  assert.equal(fireSha.type, 'fire_sha');
  assert.equal(fireSha.name, '火杀');
  assert.equal(fireSha.family, 'basic');
  assert.equal(fireSha.color, 'red');
  assert.equal(fireSha.rank, 'Q');
  assert.equal(fireSha.id, 'fire-1');

  const blackWuzhong = CardRuntime.makeTestCard('wuzhong', { suit: 'spade' });
  assert.equal(blackWuzhong.color, 'black');
  assert.equal(blackWuzhong.label, '锦囊');

  assert.equal(CardRuntime.isShaCard('sha'), true);
  assert.equal(CardRuntime.isShaCard('fire_sha'), true);
  assert.equal(CardRuntime.isShaCard('thunder_sha'), true);
  assert.equal(CardRuntime.isShaCard(fireSha), true);
  assert.equal(CardRuntime.isShaCard(CardRuntime.makeTestCard('shan')), false);

  assert.equal(CardRuntime.isNormalTrickCard(blackWuzhong), true);
  assert.equal(CardRuntime.isNormalTrickCard(CardRuntime.makeTestCard('bingliang')), false, 'delayed tricks are not normal tricks');

  const physical = CardRuntime.makeTestCard('tao', { id: 'original-tao', suit: 'diamond' });
  const virtual = CardRuntime.makeTestCard('sha', { id: 'virtual-sha', physicalCard: physical });
  assert.equal(CardRuntime.physicalCardOf(virtual), physical);
  assert.equal(CardRuntime.physicalCardOf(physical), physical);
});

console.log('\nCard runtime tests passed.');
