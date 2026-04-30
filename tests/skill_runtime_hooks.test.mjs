import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const htmlPath = path.join(root, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script id="game-engine"[^>]*>([\s\S]*?)<\/script>/);
assert.ok(match, 'index.html should contain <script id="game-engine">');

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox, { filename: 'game-engine.js' });
const SkillRuntime = sandbox.window.SanguoshaEngineModules && sandbox.window.SanguoshaEngineModules.SkillRuntime;
assert.ok(SkillRuntime, 'built artifact should expose SkillRuntime');

function test(name, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

test('SkillRuntime exposes a minimal hook registry API', () => {
  assert.equal(typeof SkillRuntime.createRegistry, 'function', 'createRegistry should be exported');
  assert.equal(typeof SkillRuntime.registerSkill, 'function', 'registerSkill should be exported');
  assert.equal(typeof SkillRuntime.runHook, 'function', 'runHook should be exported');
});

test('runHook is a no-op for unregistered hooks', () => {
  const registry = SkillRuntime.createRegistry();
  const context = { game: {}, actor: 'player' };

  const results = SkillRuntime.runHook(registry, 'onTurnEnd', context);

  assert.ok(Array.isArray(results), 'runHook should always return an array');
  assert.deepEqual(normalize(results), []);
});

test('runHook executes matching hooks in registration order with shared context', () => {
  const registry = SkillRuntime.createRegistry();
  const context = { actor: 'player', events: [] };

  SkillRuntime.registerSkill(registry, 'first-skill', {
    onTurnEnd(ctx) {
      ctx.events.push('first:' + ctx.actor);
      return { drew: 1 };
    }
  });
  SkillRuntime.registerSkill(registry, 'ignored-skill', {
    onTurnStart(ctx) {
      ctx.events.push('should-not-run:' + ctx.actor);
    }
  });
  SkillRuntime.registerSkill(registry, 'second-skill', {
    onTurnEnd(ctx) {
      ctx.events.push('second:' + ctx.actor);
      return null;
    }
  });

  const results = SkillRuntime.runHook(registry, 'onTurnEnd', context);

  assert.deepEqual(context.events, ['first:player', 'second:player']);
  assert.deepEqual(normalize(results), [
    { skillId: 'first-skill', result: { drew: 1 } },
    { skillId: 'second-skill', result: null }
  ]);
});

test('game engine registers Biyue through the shared skill registry seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');

  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]biyue['"]/, 'Biyue should be registered with SkillRuntime.registerSkill');
  assert.match(source, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onTurnEnd['"]/, 'turn completion should dispatch the onTurnEnd hook through SkillRuntime.runHook');
});

test('game engine dispatches Keji through onBeforeDiscardPhase hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const finishStart = source.indexOf('function finishPlayPhase(game)');
  const finishEnd = source.indexOf('function discardExcess(game, actor, cardIds)', finishStart);
  assert.ok(finishStart >= 0 && finishEnd > finishStart, 'finishPlayPhase source should be extractable');
  const finishPlayPhaseSource = source.slice(finishStart, finishEnd);

  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]keji['"]/, 'Keji should be registered with SkillRuntime.registerSkill');
  assert.match(source, /onBeforeDiscardPhase\s*:/, 'Keji should register an onBeforeDiscardPhase hook');
  assert.match(finishPlayPhaseSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onBeforeDiscardPhase['"]/, 'finishPlayPhase should dispatch onBeforeDiscardPhase before entering discard');
  assert.doesNotMatch(finishPlayPhaseSource, /hasSkill\(\s*state\s*,\s*['"]keji['"]/, 'finishPlayPhase should no longer directly own Keji skill detection');
});

test('game engine dispatches Jizhi through onCardUse hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const finishStart = source.indexOf('function finishTrickUse(game, actor, card, result, options)');
  const finishEnd = source.indexOf('function removeCardFromHand(state, cardId)', finishStart);
  const wuxieStart = source.indexOf('function consumeWuxie(game, actor, reason)');
  const wuxieEnd = source.indexOf('function judge(game, actor, reason)', wuxieStart);
  assert.ok(finishStart >= 0 && finishEnd > finishStart, 'finishTrickUse source should be extractable');
  assert.ok(wuxieStart >= 0 && wuxieEnd > wuxieStart, 'consumeWuxie source should be extractable');
  const finishTrickUseSource = source.slice(finishStart, finishEnd);
  const consumeWuxieSource = source.slice(wuxieStart, wuxieEnd);

  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]jizhi['"]/, 'Jizhi should be registered with SkillRuntime.registerSkill');
  assert.match(source, /onCardUse\s*:/, 'Jizhi should register an onCardUse hook');
  assert.match(finishTrickUseSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onCardUse['"]/, 'finishTrickUse should dispatch successful trick use through onCardUse');
  assert.match(consumeWuxieSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onCardUse['"]/, 'consumeWuxie should dispatch response Wuxie through onCardUse');
  assert.doesNotMatch(finishTrickUseSource, /triggerJizhi\(/, 'finishTrickUse should no longer directly trigger Jizhi');
  assert.doesNotMatch(consumeWuxieSource, /triggerJizhi\(/, 'consumeWuxie should no longer directly trigger Jizhi');
});

test('game engine dispatches Yingzi through onDrawPhase hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const drawStart = source.indexOf('function performDrawPhase(game, actor)');
  const drawEnd = source.indexOf('function isArmorIgnoredBySha(game, sourceActor, card)', drawStart);
  assert.ok(drawStart >= 0 && drawEnd > drawStart, 'performDrawPhase source should be extractable');
  const performDrawPhaseSource = source.slice(drawStart, drawEnd);

  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]yingzi['"]/, 'Yingzi should be registered with SkillRuntime.registerSkill');
  assert.match(source, /onDrawPhase\s*:/, 'Yingzi should register an onDrawPhase hook');
  assert.match(performDrawPhaseSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onDrawPhase['"]/, 'performDrawPhase should dispatch draw-stage skills through onDrawPhase');
  assert.doesNotMatch(performDrawPhaseSource, /hasSkill\([^)]*['"]yingzi['"]/, 'performDrawPhase should no longer directly own Yingzi skill detection');
});
