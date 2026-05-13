import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

test('v4 architecture has modular source files and build scripts', () => {
  const requiredFiles = [
    'package.json',
    'tools/build.mjs',
    'src/index.template.html',
    'src/styles/main.css',
    'src/engine/game-engine.js',
    'src/ui/dom-adapter.js',
    'dist/index.html',
  ];

  for (const relativePath of requiredFiles) {
    assert.ok(fs.existsSync(path.join(root, relativePath)), `${relativePath} should exist`);
  }

  const pkg = readJson(path.join(root, 'package.json'));
  assert.equal(pkg.type, 'module', 'package.json should use ESM scripts');
  assert.equal(pkg.scripts?.build, 'node tools/build.mjs');
  assert.equal(pkg.scripts?.['build:check'], 'node tools/build.mjs --check');
  assert.ok(pkg.scripts?.test?.includes('tests/*.mjs'), 'package.json should expose full Node test command');
});

test('v5 Phase 5A: root index.html is a hand-written module entry; dist/index.html is the legacy bundle', () => {
  const result = spawnSync(process.execPath, ['tools/build.mjs', '--check'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(
    result.status,
    0,
    `node tools/build.mjs --check should pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );

  const rootHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const distHtml = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');

  assert.match(rootHtml, /<script\s+type="module"\s+src="\.\/src\/main\.js"><\/script>/, 'root index.html should load ./src/main.js as a module');
  assert.match(rootHtml, /<link\s+rel="stylesheet"\s+href="\.\/src\/styles\/main\.css"\s*\/>/, 'root index.html should reference ./src/styles/main.css');
  assert.doesNotMatch(rootHtml, /<script id="game-engine"/, 'root index.html should no longer inline the bundled engine');
  assert.doesNotMatch(rootHtml, /__SANGUOSHA_/, 'root index.html should not leak template placeholders');

  assert.match(distHtml, /<script id="game-engine"[^>]*>/, 'legacy bundle keeps the engine marker for browser debug snapshots');
  assert.match(distHtml, /window\.SanguoshaEngine/, 'legacy bundle exposes SanguoshaEngine');
  assert.doesNotMatch(distHtml, /__SANGUOSHA_/, 'legacy bundle should not leak template placeholders');
  assert.doesNotMatch(distHtml, /^\s*import\s/m, 'legacy bundle should have module imports stripped');
  assert.doesNotMatch(distHtml, /^\s*export\s+(const|let|var|function|class|\{|default)/m, 'legacy bundle should have module exports stripped');
});

console.log('\nArchitecture build tests passed.');
