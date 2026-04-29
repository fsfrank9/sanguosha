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

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

function loadBuiltEngine() {
  const html = read('index.html');
  const match = html.match(/<script id="game-engine"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(match, 'built root index.html should contain <script id="game-engine">');

  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox, { filename: 'built-game-engine.js' });
  assert.ok(sandbox.window.SanguoshaData, 'built artifact should keep SanguoshaData available for debugging');
  assert.ok(sandbox.window.SanguoshaEngine, 'built artifact should expose SanguoshaEngine');
  return { Data: sandbox.window.SanguoshaData, Engine: sandbox.window.SanguoshaEngine };
}

test('v4 phase 2 keeps catalog and skill-status data in dedicated source modules', () => {
  const requiredFiles = [
    'src/data/heroes.js',
    'src/data/cards.js',
    'src/data/skill-status.js',
  ];

  for (const relativePath of requiredFiles) {
    assert.ok(fs.existsSync(path.join(root, relativePath)), `${relativePath} should exist`);
  }

  const buildSource = read('tools/build.mjs');
  for (const relativePath of requiredFiles) {
    assert.match(buildSource, new RegExp(relativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${relativePath} should be part of the build input list`);
  }

  const engineSource = read('src/engine/game-engine.js');
  assert.doesNotMatch(engineSource, /var\s+HERO_CATALOG\s*=\s*\{/, 'hero catalog data should live outside the engine source');
  assert.doesNotMatch(engineSource, /var\s+CARD_CATALOG\s*=\s*\{/, 'card catalog data should live outside the engine source');
  assert.doesNotMatch(engineSource, /var\s+IMPLEMENTED_SKILL_IDS\s*=\s*\[/, 'implemented skill status data should live outside the engine source');
  assert.doesNotMatch(engineSource, /var\s+ACTIVE_SKILL_IDS\s*=\s*\[/, 'active skill status data should live outside the engine source');

  assert.match(read('src/data/heroes.js'), /var\s+HERO_CATALOG\s*=\s*\{/, 'heroes data module should declare HERO_CATALOG');
  assert.match(read('src/data/cards.js'), /var\s+CARD_CATALOG\s*=\s*\{/, 'cards data module should declare CARD_CATALOG');
  assert.match(read('src/data/skill-status.js'), /var\s+IMPLEMENTED_SKILL_IDS\s*=\s*\[/, 'skill status module should declare IMPLEMENTED_SKILL_IDS');
  assert.match(read('src/data/skill-status.js'), /var\s+ACTIVE_SKILL_IDS\s*=\s*\[/, 'skill status module should declare ACTIVE_SKILL_IDS');
});

test('data module build preserves direct-open single-file engine exports', () => {
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

  const { Data, Engine } = loadBuiltEngine();
  assert.ok(Data.HERO_CATALOG, 'built data bundle should expose HERO_CATALOG');
  assert.ok(Data.CARD_CATALOG, 'built data bundle should expose CARD_CATALOG');
  assert.ok(Data.IMPLEMENTED_SKILL_IDS, 'built data bundle should expose IMPLEMENTED_SKILL_IDS');
  assert.ok(Data.ACTIVE_SKILL_IDS, 'built data bundle should expose ACTIVE_SKILL_IDS');
  assert.equal(Data.HERO_CATALOG, Engine.HERO_CATALOG, 'engine should reuse the hero catalog object from SanguoshaData');
  assert.equal(Data.CARD_CATALOG, Engine.CARD_CATALOG, 'engine should reuse the card catalog object from SanguoshaData');
  assert.equal(Object.keys(Engine.HERO_CATALOG).length, 68, 'built engine should preserve all local heroes');
  assert.ok(Engine.HERO_CATALOG.liubei.skills.some((skill) => skill.id === 'rende' && skill.status === 'implemented'));
  assert.equal(Engine.HERO_CATALOG.sunquan.skills.find((skill) => skill.id === 'jiuyuan').status, 'display');
  assert.ok(Engine.CARD_CATALOG.sha, 'built engine should preserve basic card catalog');
  assert.ok(Engine.CARD_CATALOG.huogong, 'built engine should preserve trick card catalog');
  assert.ok(Engine.IMPLEMENTED_SKILL_IDS.includes('jizhi'), 'implemented skill status should survive build');
  assert.ok(Engine.ACTIVE_SKILL_IDS.includes('guanxing'), 'active skill status should survive build');
});

console.log('\nData module architecture tests passed.');
