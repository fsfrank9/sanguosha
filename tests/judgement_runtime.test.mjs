import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadBuiltWindow() {
  const html = read('index.html');
  const match = html.match(/<script id="game-engine"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(match, 'built root index.html should contain <script id="game-engine">');
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox, { filename: 'built-game-engine.js' });
  return sandbox.window;
}

function card(type, options = {}) {
  const win = loadBuiltWindow();
  return win.SanguoshaEngine.makeTestCard(type, options);
}

test('judgement runtime exposes delayed-trick rule helpers while preserving public engine APIs', () => {
  const win = loadBuiltWindow();
  const JudgementRuntime = win.SanguoshaEngineModules && win.SanguoshaEngineModules.JudgementRuntime;
  const Engine = win.SanguoshaEngine;

  assert.ok(JudgementRuntime, 'built artifact should expose JudgementRuntime');
  assert.equal(typeof JudgementRuntime.isLeBusishuSuccess, 'function');
  assert.equal(typeof JudgementRuntime.isBingliangSuccess, 'function');
  assert.equal(typeof JudgementRuntime.isShandianHit, 'function');
  assert.equal(typeof JudgementRuntime.evaluateDelayedTrick, 'function');
  assert.equal(typeof Engine.startTurn, 'function', 'public startTurn API should remain available');
  assert.equal(typeof Engine.advancePhase, 'function', 'public advancePhase API should remain available');
});

test('judgement runtime evaluates Le Bu Si Shu and Bing Liang skip flags from pure card rules', () => {
  const win = loadBuiltWindow();
  const JudgementRuntime = win.SanguoshaEngineModules.JudgementRuntime;

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
  const win = loadBuiltWindow();
  const JudgementRuntime = win.SanguoshaEngineModules.JudgementRuntime;

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
