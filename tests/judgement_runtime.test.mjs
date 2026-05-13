import assert from 'node:assert/strict';
import { Engine, JudgementRuntime } from './helpers/load-engine.mjs';

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

function card(type, options = {}) {
  return Engine.makeTestCard(type, options);
}

test('judgement runtime exposes delayed-trick rule helpers while preserving public engine APIs', () => {
  assert.ok(JudgementRuntime, 'ES module should export JudgementRuntime');
  assert.equal(typeof JudgementRuntime.isLeBusishuSuccess, 'function');
  assert.equal(typeof JudgementRuntime.isBingliangSuccess, 'function');
  assert.equal(typeof JudgementRuntime.isShandianHit, 'function');
  assert.equal(typeof JudgementRuntime.evaluateDelayedTrick, 'function');
  assert.equal(typeof Engine.startTurn, 'function', 'public startTurn API should remain available');
  assert.equal(typeof Engine.advancePhase, 'function', 'public advancePhase API should remain available');
});

test('judgement runtime evaluates Le Bu Si Shu and Bing Liang skip flags from pure card rules', () => {
  assert.equal(JudgementRuntime.isLeBusishuSuccess(card('sha', { suit: 'heart' })), true);
  assert.equal(JudgementRuntime.isLeBusishuSuccess(card('sha', { suit: 'diamond' })), false);
  assert.equal(JudgementRuntime.isLeBusishuSuccess(null), false);

  assert.equal(JudgementRuntime.isBingliangSuccess(card('sha', { suit: 'club' })), true);
  assert.equal(JudgementRuntime.isBingliangSuccess(card('sha', { suit: 'spade' })), false);
  assert.equal(JudgementRuntime.isBingliangSuccess(null), false);

  assert.deepEqual(normalize(JudgementRuntime.evaluateDelayedTrick(card('lebusishu'), card('shan', { suit: 'heart' }))), {
    type: 'lebusishu',
    discardTrick: true,
    moveToNext: false,
    skipPlay: false,
    skipDraw: false,
    damage: 0,
    hit: false,
    success: true,
  });
  assert.deepEqual(normalize(JudgementRuntime.evaluateDelayedTrick(card('lebusishu'), card('sha', { suit: 'club' }))).skipPlay, true);
  assert.deepEqual(normalize(JudgementRuntime.evaluateDelayedTrick(card('bingliang'), card('sha', { suit: 'club' }))).skipDraw, false);
  assert.deepEqual(normalize(JudgementRuntime.evaluateDelayedTrick(card('bingliang'), card('sha', { suit: 'heart' }))).skipDraw, true);
});

test('judgement runtime evaluates Shandian hit range and move/discard outcome', () => {
  assert.equal(JudgementRuntime.isShandianHit(card('sha', { suit: 'spade', rank: '2' })), true);
  assert.equal(JudgementRuntime.isShandianHit(card('sha', { suit: 'spade', rank: '9' })), true);
  assert.equal(JudgementRuntime.isShandianHit(card('sha', { suit: 'spade', rank: '10' })), false);
  assert.equal(JudgementRuntime.isShandianHit(card('sha', { suit: 'club', rank: '7' })), false);
  assert.equal(JudgementRuntime.isShandianHit(null), false);

  assert.deepEqual(normalize(JudgementRuntime.evaluateDelayedTrick(card('shandian'), card('sha', { suit: 'spade', rank: '7' }))), {
    type: 'shandian',
    discardTrick: true,
    moveToNext: false,
    skipPlay: false,
    skipDraw: false,
    damage: 3,
    hit: true,
    success: false,
  });
  assert.deepEqual(normalize(JudgementRuntime.evaluateDelayedTrick(card('shandian'), card('sha', { suit: 'heart', rank: '7' }))), {
    type: 'shandian',
    discardTrick: false,
    moveToNext: true,
    skipPlay: false,
    skipDraw: false,
    damage: 0,
    hit: false,
    success: true,
  });
});

console.log('\nJudgement runtime tests passed.');
