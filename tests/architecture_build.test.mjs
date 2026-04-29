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

test('build output is reproducible for root and dist single-file artifacts', () => {
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
  assert.equal(distHtml, rootHtml, 'dist/index.html should match the direct-open root artifact');
  assert.match(rootHtml, /<script id="game-engine"[^>]*>/, 'built artifact keeps the engine marker used by tests');
  assert.match(rootHtml, /window\.SanguoshaEngine/, 'built artifact exposes SanguoshaEngine');
  assert.doesNotMatch(rootHtml, /__SANGUOSHA_/, 'built artifact should not leak template placeholders');
});

console.log('\nArchitecture build tests passed.');
