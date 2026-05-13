import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// v5 architecture enforcement. Phase 5C flipped this from default-skip to
// default-enforced. The GitHub Pages workflow assertion is deferred until
// Phase 5D adds the workflow.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

const SOURCE_MODULES = [
  'src/data/heroes.js',
  'src/data/cards.js',
  'src/data/skill-status.js',
  'src/engine/runtime.js',
  'src/engine/skill-runtime.js',
  'src/engine/card-runtime.js',
  'src/engine/state.js',
  'src/engine/phases.js',
  'src/engine/judgement.js',
  'src/engine/game-engine.js',
  'src/ui/dom-adapter.js',
];

test('src/main.js exists as the ES module entry', () => {
  assert.ok(exists('src/main.js'), 'src/main.js should exist');
  const src = read('src/main.js');
  assert.match(src, /import\s+/m, 'src/main.js should use ES module imports');
});

test('source modules use ES module syntax (export or top-level import)', () => {
  for (const rel of SOURCE_MODULES) {
    const src = read(rel);
    const hasExport = /^\s*export\s+(const|let|var|function|class|default|\{)/m.test(src);
    const hasImport = /^\s*import\s+(?:[^;]*\s+from\s*)?['"][^'"]+['"]/m.test(src);
    assert.ok(hasExport || hasImport, `${rel} should use ES module syntax (export or import)`);
    assert.doesNotMatch(src, /^\(function\s*\(\s*\)\s*\{\s*$/m, `${rel} should not be wrapped in an IIFE`);
  }
});

test('source modules no longer write to legacy window globals', () => {
  for (const rel of SOURCE_MODULES) {
    const src = read(rel);
    assert.doesNotMatch(src, /window\.SanguoshaData\s*=/, `${rel} should not assign window.SanguoshaData`);
    assert.doesNotMatch(src, /window\.SanguoshaEngineModules\s*=/, `${rel} should not assign window.SanguoshaEngineModules`);
    if (!rel.endsWith('game-engine.js')) {
      assert.doesNotMatch(src, /window\.SanguoshaEngine\s*=/, `${rel} should not assign window.SanguoshaEngine`);
    }
  }
});

test('index.html is a hand-written ES module entry, not a bundled artifact', () => {
  assert.ok(exists('index.html'), 'index.html should exist');
  const html = read('index.html');
  assert.match(html, /<script\s+type="module"\s+src="[^"]*main\.js"/, 'index.html should load main.js as a module');
  assert.match(html, /<link\s+rel="stylesheet"\s+href="[^"]*main\.css"/, 'index.html should reference src/styles/main.css');
  assert.doesNotMatch(html, /__SANGUOSHA_[A-Z_]+__/, 'index.html should not contain build placeholders');
  assert.doesNotMatch(html, /<script\s+id="game-engine"/, 'index.html should not inline a bundled engine script');
});

test('single-file artifact and template are gone', () => {
  assert.equal(exists('dist/index.html'), false, 'dist/index.html should be removed in v5');
  assert.equal(exists('dist'), false, 'dist/ directory should be removed in v5');
  assert.equal(exists('src/index.template.html'), false, 'src/index.template.html should be removed in v5');
});

test('GitHub Pages deployment workflow exists', () => {
  assert.ok(exists('.github/workflows/pages.yml'), '.github/workflows/pages.yml should exist');
  const wf = read('.github/workflows/pages.yml');
  assert.match(wf, /actions\/configure-pages/, 'workflow should configure Pages');
  assert.match(wf, /actions\/upload-pages-artifact/, 'workflow should upload a Pages artifact');
  assert.match(wf, /actions\/deploy-pages/, 'workflow should call deploy-pages');
  assert.match(wf, /pages:\s*write/, 'workflow should grant pages:write permission');
  assert.match(wf, /id-token:\s*write/, 'workflow should grant id-token:write for Pages deploy');
});

test('tools/build.mjs validates structure only and does not bundle', () => {
  const src = read('tools/build.mjs');
  assert.doesNotMatch(src, /__SANGUOSHA_[A-Z_]+__/, 'build.mjs should not reference template placeholders');
  assert.doesNotMatch(src, /writeFileSync\(.*['"]dist/, 'build.mjs should not write dist artifacts');
  assert.doesNotMatch(src, /buildEngineBundle|buildLegacyBundle|stripModuleSyntax/, 'build.mjs should not concatenate or strip module syntax');
});
