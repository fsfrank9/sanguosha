import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

function loadBuiltEngineScript() {
  const html = read('index.html');
  const match = html.match(/<script id="game-engine"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(match, 'built root index.html should contain <script id="game-engine">');
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox, { filename: 'built-game-engine.js' });
  return sandbox.window;
}

test('v4 phase 3 introduces engine runtime modules before the game engine', () => {
  const requiredEngineModules = [
    'src/engine/runtime.js',
    'src/engine/skill-runtime.js',
  ];

  for (const relativePath of requiredEngineModules) {
    assert.ok(exists(relativePath), `${relativePath} should exist`);
  }

  const buildSource = read('tools/build.mjs');
  assert.match(buildSource, /engineModules\s*:/, 'build script should have an explicit engineModules input list');
  for (const relativePath of requiredEngineModules) {
    assert.match(buildSource, new RegExp(relativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${relativePath} should be part of the build input list`);
  }

  const runtimeSource = read('src/engine/runtime.js');
  const skillRuntimeSource = read('src/engine/skill-runtime.js');
  assert.match(runtimeSource, /window\.SanguoshaEngineModules/, 'runtime module should attach to SanguoshaEngineModules');
  assert.match(skillRuntimeSource, /window\.SanguoshaEngineModules/, 'skill runtime module should attach to SanguoshaEngineModules');

  const engineSource = read('src/engine/game-engine.js');
  assert.match(engineSource, /SanguoshaEngineModules/, 'game engine should consume runtime modules');
  assert.doesNotMatch(engineSource, /function\s+annotateSkillStatus\s*\(/, 'skill status annotation should live outside the monolithic engine');
  assert.doesNotMatch(engineSource, /function\s+clone\s*\(/, 'generic clone helper should live in runtime module');
  assert.doesNotMatch(engineSource, /function\s+makeRng\s*\(/, 'generic RNG helper should live in runtime module');
  assert.doesNotMatch(engineSource, /function\s+makePlayer\s*\(/, 'state/player factory helper should live in runtime module');
});

test('engine runtime modules are bundled into the direct-open artifact', () => {
  const result = spawnSync(process.execPath, ['tools/build.mjs', '--check'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    0,
    `node tools/build.mjs --check should pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );

  const rootHtml = read('index.html');
  const distHtml = read('dist/index.html');
  assert.equal(distHtml, rootHtml, 'dist/index.html should stay byte-identical to root index.html');
  assert.doesNotMatch(rootHtml, /<script\s+type="module"|import\s+\{/, 'direct-open artifact should not depend on runtime ES modules');

  const win = loadBuiltEngineScript();
  assert.ok(win.SanguoshaData, 'data bundle should still be available');
  assert.ok(win.SanguoshaEngineModules, 'built artifact should expose engine runtime modules for debugging');
  assert.ok(win.SanguoshaEngineModules.Runtime, 'built artifact should expose Runtime module');
  assert.ok(win.SanguoshaEngineModules.SkillRuntime, 'built artifact should expose SkillRuntime module');
  assert.equal(typeof win.SanguoshaEngineModules.Runtime.requireData, 'function');
  assert.equal(typeof win.SanguoshaEngineModules.SkillRuntime.annotateSkillStatus, 'function');
  assert.ok(win.SanguoshaEngine, 'built artifact should still expose SanguoshaEngine');
  assert.equal(Object.keys(win.SanguoshaEngine.HERO_CATALOG).length, 68, 'engine should preserve all local heroes');
  assert.ok(win.SanguoshaEngine.IMPLEMENTED_SKILL_IDS.includes('jizhi'), 'skill implementation status should survive runtime extraction');
});

console.log('\nEngine module architecture tests passed.');
