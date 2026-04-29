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

test('phase runtime exposes phase helpers without removing public engine phase APIs', () => {
  const win = loadBuiltWindow();
  const PhaseRuntime = win.SanguoshaEngineModules && win.SanguoshaEngineModules.PhaseRuntime;
  const Engine = win.SanguoshaEngine;

  assert.ok(PhaseRuntime, 'built artifact should expose PhaseRuntime');
  assert.equal(typeof PhaseRuntime.recordPhase, 'function');
  assert.equal(typeof PhaseRuntime.setPhase, 'function');
  assert.equal(typeof PhaseRuntime.nextPlayablePhase, 'function');
  assert.equal(typeof PhaseRuntime.resetActorTurnState, 'function');
  assert.equal(typeof PhaseRuntime.resetEndOfTurnState, 'function');
  assert.equal(typeof Engine.startTurn, 'function', 'public startTurn API should remain available');
  assert.equal(typeof Engine.advancePhase, 'function', 'public advancePhase API should remain available');
  assert.equal(typeof Engine.finishPlayPhase, 'function', 'public finishPlayPhase API should remain available');
  assert.equal(typeof Engine.endTurn, 'function', 'public endTurn API should remain available');
});

test('phase runtime records phase history and sets the current phase', () => {
  const win = loadBuiltWindow();
  const PhaseRuntime = win.SanguoshaEngineModules.PhaseRuntime;
  const game = {};

  PhaseRuntime.recordPhase(game, 'player', 'prepare');
  assert.deepEqual(normalize(game.turnHistory), [{ actor: 'player', phase: 'prepare' }]);

  PhaseRuntime.setPhase(game, 'enemy', 'draw');
  assert.equal(game.phase, 'draw');
  assert.deepEqual(normalize(game.turnHistory), [
    { actor: 'player', phase: 'prepare' },
    { actor: 'enemy', phase: 'draw' },
  ]);
});

test('phase runtime chooses play or discard after draw based on skipPlay', () => {
  const win = loadBuiltWindow();
  const PhaseRuntime = win.SanguoshaEngineModules.PhaseRuntime;

  assert.equal(PhaseRuntime.nextPlayablePhase({ flags: { skipPlay: true } }), 'discard');
  assert.equal(PhaseRuntime.nextPlayablePhase({ flags: { skipPlay: false } }), 'play');
  assert.equal(PhaseRuntime.nextPlayablePhase({ flags: {} }), 'play');
  assert.equal(PhaseRuntime.nextPlayablePhase({}), 'play');
});

test('phase runtime resets actor turn state at the start of a turn', () => {
  const win = loadBuiltWindow();
  const PhaseRuntime = win.SanguoshaEngineModules.PhaseRuntime;
  const state = {
    usedSha: true,
    usedOrRespondedSha: true,
    shaBonus: 2,
    flags: {
      skipPlay: true,
      skipDraw: true,
      zhihengUsed: true,
      fanjianUsed: true,
      guanxingUsed: true,
      rendeGiven: 3,
      rendeHealed: true,
      aiKurouUsed: true,
      biyueTriggered: true,
    },
  };

  PhaseRuntime.resetActorTurnState(state);
  assert.equal(state.usedSha, false);
  assert.equal(state.usedOrRespondedSha, false);
  assert.equal(state.shaBonus, 0);
  assert.equal(state.flags.skipPlay, false);
  assert.equal(state.flags.skipDraw, false);
  assert.equal(state.flags.zhihengUsed, false);
  assert.equal(state.flags.fanjianUsed, false);
  assert.equal(state.flags.guanxingUsed, false);
  assert.equal(state.flags.rendeGiven, 0);
  assert.equal(state.flags.rendeHealed, false);
  assert.equal(state.flags.aiKurouUsed, false);
  assert.equal(state.flags.biyueTriggered, true, 'start-turn reset should not clear an unrelated end-stage guard');

  const missingFlags = { usedSha: true };
  PhaseRuntime.resetActorTurnState(missingFlags);
  assert.equal(missingFlags.usedSha, false);
  assert.equal(missingFlags.usedOrRespondedSha, false);
  assert.equal(missingFlags.shaBonus, 0);
  assert.deepEqual(normalize(missingFlags.flags), {
    skipPlay: false,
    skipDraw: false,
    zhihengUsed: false,
    fanjianUsed: false,
    guanxingUsed: false,
    rendeGiven: 0,
    rendeHealed: false,
    aiKurouUsed: false,
  });
});

test('phase runtime resets end-of-turn state without clearing skip phase flags', () => {
  const win = loadBuiltWindow();
  const PhaseRuntime = win.SanguoshaEngineModules.PhaseRuntime;
  const state = {
    usedSha: true,
    usedOrRespondedSha: true,
    shaBonus: 1,
    flags: {
      skipPlay: true,
      skipDraw: true,
      zhihengUsed: true,
      fanjianUsed: true,
      guanxingUsed: true,
      rendeGiven: 2,
      rendeHealed: true,
      aiKurouUsed: true,
      biyueTriggered: true,
    },
  };

  PhaseRuntime.resetEndOfTurnState(state);
  assert.equal(state.usedSha, false);
  assert.equal(state.usedOrRespondedSha, false);
  assert.equal(state.shaBonus, 0);
  assert.equal(state.flags.skipPlay, true, 'end-of-turn reset should preserve existing skipPlay behavior');
  assert.equal(state.flags.skipDraw, true, 'end-of-turn reset should preserve existing skipDraw behavior');
  assert.equal(state.flags.zhihengUsed, false);
  assert.equal(state.flags.fanjianUsed, false);
  assert.equal(state.flags.guanxingUsed, false);
  assert.equal(state.flags.rendeGiven, 0);
  assert.equal(state.flags.rendeHealed, false);
  assert.equal(state.flags.aiKurouUsed, false);
  assert.equal(state.flags.biyueTriggered, false);
});

console.log('\nPhase runtime tests passed.');
