import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  Engine,
  HERO_CATALOG,
  CARD_CATALOG,
  IMPLEMENTED_SKILL_IDS,
  ACTIVE_SKILL_IDS,
} from './helpers/load-engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
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

  const distHtml = read('dist/index.html');
  assert.doesNotMatch(distHtml, /^\s*(import|export)\s/m, 'legacy bundle should not contain unstripped ES module syntax');

  assert.ok(HERO_CATALOG, 'data module should export HERO_CATALOG');
  assert.ok(CARD_CATALOG, 'data module should export CARD_CATALOG');
  assert.ok(IMPLEMENTED_SKILL_IDS, 'data module should export IMPLEMENTED_SKILL_IDS');
  assert.ok(ACTIVE_SKILL_IDS, 'data module should export ACTIVE_SKILL_IDS');
  assert.equal(HERO_CATALOG, Engine.HERO_CATALOG, 'engine should reuse the hero catalog object');
  assert.equal(CARD_CATALOG, Engine.CARD_CATALOG, 'engine should reuse the card catalog object');
  assert.equal(Object.keys(Engine.HERO_CATALOG).length, 68, 'engine should preserve all local heroes');
  assert.ok(Engine.HERO_CATALOG.liubei.skills.some((skill) => skill.id === 'rende' && skill.status === 'implemented'));
  assert.equal(Engine.HERO_CATALOG.sunquan.skills.find((skill) => skill.id === 'jiuyuan').status, 'display');
  assert.ok(Engine.CARD_CATALOG.sha, 'engine should preserve basic card catalog');
  assert.ok(Engine.CARD_CATALOG.huogong, 'engine should preserve trick card catalog');
  assert.ok(Engine.IMPLEMENTED_SKILL_IDS.includes('jizhi'), 'implemented skill status should survive ES module import');
  assert.ok(Engine.ACTIVE_SKILL_IDS.includes('guanxing'), 'active skill status should survive ES module import');
});

console.log('\nData module architecture tests passed.');
