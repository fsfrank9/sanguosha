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
