import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  Engine,
  Runtime,
  SkillRuntime,
  CardRuntime,
  StateRuntime,
  PhaseRuntime,
  JudgementRuntime,
} from './helpers/load-engine.mjs';

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

test('v4 phase 3 introduces engine runtime modules before the game engine', () => {
  const requiredEngineModules = [
    'src/engine/runtime.js',
    'src/engine/skill-runtime.js',
    'src/engine/card-runtime.js',
    'src/engine/state.js',
    'src/engine/phases.js',
    'src/engine/judgement.js',
  ];

  for (const relativePath of requiredEngineModules) {
    assert.ok(exists(relativePath), `${relativePath} should exist`);
  }

  const buildSource = read('tools/build.mjs');
  assert.match(buildSource, /engineModules\s*:/, 'build script should have an explicit engineModules input list');
  for (const relativePath of requiredEngineModules) {
    assert.match(buildSource, new RegExp(relativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${relativePath} should be part of the build input list`);
  }
  var lastBuildIndex = -1;
  for (const relativePath of requiredEngineModules.concat(['src/engine/game-engine.js'])) {
    const nextBuildIndex = buildSource.indexOf(relativePath);
    assert.ok(nextBuildIndex > lastBuildIndex, `${relativePath} should be bundled after the previous engine source`);
    lastBuildIndex = nextBuildIndex;
  }

  const runtimeSource = read('src/engine/runtime.js');
  const skillRuntimeSource = read('src/engine/skill-runtime.js');
  const cardRuntimeSource = read('src/engine/card-runtime.js');
  const stateSource = read('src/engine/state.js');
  const phaseSource = read('src/engine/phases.js');
  const judgementSource = read('src/engine/judgement.js');
  assert.match(runtimeSource, /window\.SanguoshaEngineModules/, 'runtime module should attach to SanguoshaEngineModules');
  assert.match(skillRuntimeSource, /window\.SanguoshaEngineModules/, 'skill runtime module should attach to SanguoshaEngineModules');
  assert.match(cardRuntimeSource, /window\.SanguoshaEngineModules/, 'card runtime module should attach to SanguoshaEngineModules');
  assert.match(stateSource, /window\.SanguoshaEngineModules/, 'state runtime module should attach to SanguoshaEngineModules');
  assert.match(phaseSource, /window\.SanguoshaEngineModules/, 'phase runtime module should attach to SanguoshaEngineModules');
  assert.match(judgementSource, /window\.SanguoshaEngineModules/, 'judgement runtime module should attach to SanguoshaEngineModules');
  assert.match(cardRuntimeSource, /makeTestCard/, 'card runtime should own test-card construction');
  assert.match(cardRuntimeSource, /isShaCard/, 'card runtime should own Sha classification');
  assert.match(stateSource, /distanceBetween/, 'state runtime should own distance calculation');
  assert.match(stateSource, /hasSkill/, 'state runtime should own skill lookup');
  assert.match(phaseSource, /recordPhase/, 'phase runtime should own phase history recording');
  assert.match(phaseSource, /resetActorTurnState/, 'phase runtime should own actor turn-state reset');
  assert.match(phaseSource, /resetEndOfTurnState/, 'phase runtime should own end-of-turn reset');
  assert.match(judgementSource, /evaluateDelayedTrick/, 'judgement runtime should own delayed-trick judgement evaluation');
  assert.match(judgementSource, /isShandianHit/, 'judgement runtime should own lightning-hit rules');

  const engineSource = read('src/engine/game-engine.js');
  assert.match(engineSource, /import\s*\{\s*Runtime\s*\}\s*from\s*['"]\.\/runtime\.js['"]/, 'game engine should import Runtime module');
  assert.match(engineSource, /import\s*\{\s*JudgementRuntime\s*\}\s*from\s*['"]\.\/judgement\.js['"]/, 'game engine should import JudgementRuntime module');
  assert.doesNotMatch(engineSource, /function\s+annotateSkillStatus\s*\(/, 'skill status annotation should live outside the monolithic engine');
  assert.doesNotMatch(engineSource, /function\s+clone\s*\(/, 'generic clone helper should live in runtime module');
  assert.doesNotMatch(engineSource, /function\s+makeRng\s*\(/, 'generic RNG helper should live in runtime module');
  assert.doesNotMatch(engineSource, /function\s+makePlayer\s*\(/, 'state/player factory helper should live in runtime module');
  assert.doesNotMatch(engineSource, /function\s+makeTestCard\s*\(/, 'card test factory should live in card runtime module');
  assert.doesNotMatch(engineSource, /function\s+isShaCard\s*\(/, 'Sha classification should live in card runtime module');
  assert.doesNotMatch(engineSource, /function\s+isNormalTrickCard\s*\(/, 'normal-trick classification should live in card runtime module');
  assert.doesNotMatch(engineSource, /function\s+physicalCardOf\s*\(/, 'physical-card resolution should live in card runtime module');
  assert.doesNotMatch(engineSource, /function\s+actorName\s*\(/, 'actor name helper should live in state runtime module');
  assert.doesNotMatch(engineSource, /function\s+opponent\s*\(/, 'opponent helper should live in state runtime module');
  assert.doesNotMatch(engineSource, /function\s+hasSkill\s*\(/, 'skill lookup should live in state runtime module');
  assert.doesNotMatch(engineSource, /function\s+distanceBetween\s*\(/, 'distance calculation should live in state runtime module');
  assert.doesNotMatch(engineSource, /function\s+handLimit\s*\(/, 'hand-limit helper should live in state runtime module');
  assert.doesNotMatch(engineSource, /function\s+getActorStatus\s*\(/, 'actor status helper should live in state runtime module');
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

  const distHtml = read('dist/index.html');
  assert.doesNotMatch(distHtml, /^\s*(import|export)\s/m, 'legacy bundle should not contain unstripped ES module syntax');

  assert.ok(Runtime, 'Runtime should be importable as an ES module');
  assert.ok(SkillRuntime, 'SkillRuntime should be importable as an ES module');
  assert.ok(CardRuntime, 'CardRuntime should be importable as an ES module');
  assert.ok(StateRuntime, 'StateRuntime should be importable as an ES module');
  assert.ok(PhaseRuntime, 'PhaseRuntime should be importable as an ES module');
  assert.ok(JudgementRuntime, 'JudgementRuntime should be importable as an ES module');
  assert.equal(typeof Runtime.requireData, 'function');
  assert.equal(typeof SkillRuntime.annotateSkillStatus, 'function');
  assert.equal(typeof SkillRuntime.createRegistry, 'function');
  assert.equal(typeof SkillRuntime.registerSkill, 'function');
  assert.equal(typeof SkillRuntime.runHook, 'function');
  assert.equal(typeof CardRuntime.makeTestCard, 'function');
  assert.equal(typeof CardRuntime.isShaCard, 'function');
  assert.equal(typeof StateRuntime.distanceBetween, 'function');
  assert.equal(typeof StateRuntime.hasSkill, 'function');
  assert.equal(typeof PhaseRuntime.recordPhase, 'function');
  assert.equal(typeof PhaseRuntime.resetActorTurnState, 'function');
  assert.equal(typeof PhaseRuntime.resetEndOfTurnState, 'function');
  assert.equal(typeof PhaseRuntime.setPhase, 'function');
  assert.equal(typeof PhaseRuntime.nextPlayablePhase, 'function');
  assert.equal(typeof JudgementRuntime.evaluateDelayedTrick, 'function');
  assert.equal(typeof JudgementRuntime.isShandianHit, 'function');
  assert.ok(Engine, 'SanguoshaEngine should be importable as an ES module');
  assert.equal(Object.keys(Engine.HERO_CATALOG).length, 68, 'engine should preserve all local heroes');
  assert.ok(Engine.IMPLEMENTED_SKILL_IDS.includes('jizhi'), 'skill implementation status should survive ES module import');
});

console.log('\nEngine module architecture tests passed.');
