import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test, runTests } from './helpers/harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('v5 architecture has modular source files, module entry HTML, and structural build:check', () => {
  const requiredFiles = [
    'package.json',
    'tools/build.mjs',
    'index.html',
    'src/main.js',
    'src/styles/main.css',
    'src/engine/game-engine.js',
    'src/ui/dom-adapter.js',
  ];

  for (const relativePath of requiredFiles) {
    assert.ok(fs.existsSync(path.join(root, relativePath)), `${relativePath} should exist`);
  }

  const pkg = readJson(path.join(root, 'package.json'));
  assert.equal(pkg.type, 'module', 'package.json should use ESM scripts');
  assert.equal(pkg.scripts?.build, 'node tools/build.mjs');
  assert.equal(pkg.scripts?.['build:check'], 'node tools/build.mjs --check');
  // v14 O2: test 命令由 shell for-loop 换为分档运行器 (tools/run-tests.mjs),
  // 断言随行为更新 — 全档语义不变 (tests/*.mjs 逐文件、失败即停), 新增快档。
  assert.equal(pkg.scripts?.test, 'node tools/run-tests.mjs', 'package.json test should run the tiered runner (full tier)');
  assert.equal(pkg.scripts?.['test:quick'], 'node tools/run-tests.mjs --quick', 'package.json should expose the quick tier');
  assert.ok(pkg.scripts?.verify?.includes('npm test'), 'verify should gate on the full tier');
});

test('v5 Phase 5C: root index.html is the hand-written module entry; dist/ and template are gone', () => {
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
  assert.match(rootHtml, /<script\s+type="module"\s+src="\.\/src\/main\.js"><\/script>/, 'root index.html should load ./src/main.js as a module');
  assert.match(rootHtml, /<link\s+rel="stylesheet"\s+href="\.\/src\/styles\/main\.css"\s*\/>/, 'root index.html should reference ./src/styles/main.css');
  assert.doesNotMatch(rootHtml, /<script id="game-engine"/, 'root index.html should no longer inline a bundled engine');
  assert.doesNotMatch(rootHtml, /__SANGUOSHA_/, 'root index.html should not contain template placeholders');

  assert.equal(fs.existsSync(path.join(root, 'dist')), false, 'dist/ should be removed in v5');
  assert.equal(fs.existsSync(path.join(root, 'src/index.template.html')), false, 'src/index.template.html should be removed in v5');
});
await runTests();

console.log('\nArchitecture build tests passed.');
