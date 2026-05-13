import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// v5 architecture scaffold. Default-skip until Phase 5A flips to enforce.
// Run explicitly with SANGUOSHA_V5=1 to track migration progress.
if (process.env.SANGUOSHA_V5 !== '1') {
  console.log('• v5 architecture test skipped (set SANGUOSHA_V5=1 to enforce)');
  process.exit(0);
}

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

test('source modules use top-level export statements', () => {
  for (const rel of SOURCE_MODULES) {
    const src = read(rel);
    assert.match(src, /^export\s+(const|function|class)\s+/m, `${rel} should use top-level export`);
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
});

test('tools/build.mjs --check validates module structure only', () => {
  const src = read('tools/build.mjs');
  assert.doesNotMatch(src, /__SANGUOSHA_[A-Z_]+__/, 'build.mjs should not reference template placeholders');
  assert.doesNotMatch(src, /writeFileSync\(.*['"]dist/, 'build.mjs should not write dist artifacts');
});
