import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HERO_CATALOG, IMPLEMENTED_SKILL_IDS, SKILL_METADATA } from './helpers/load-engine.mjs';
import { test, runTests } from './helpers/harness.mjs';
import { actualSkillRegistrations } from './helpers/skill-registrations.mjs';
import { NONREGISTRY_SKILL_PATHS } from './fixtures/nonregistry-skill-paths.mjs';
import { assertDirectIntegrations, catalogCounts, assertReadmeCounts, assertFiveResponseProtocols } from './helpers/ac-invariants.mjs';
import { assertPathEvidence, functionBody } from './helpers/source-evidence.mjs';

const read = file => fs.readFileSync(new URL('../src/engine/' + file, import.meta.url), 'utf8');
const registered = await actualSkillRegistrations();
const counts = catalogCounts(HERO_CATALOG, IMPLEMENTED_SKILL_IDS);
const input = { implemented: IMPLEMENTED_SKILL_IDS, metadata: SKILL_METADATA, registered, paths: NONREGISTRY_SKILL_PATHS, read };

test('AC2 #4 all implemented registry and direct hooks have exact per-ID executable evidence', () => {
  assertDirectIntegrations(input);
  const pure = IMPLEMENTED_SKILL_IDS.filter(id => !(registered.get(id) || []).length);
  assert.equal(pure.length, 25, 'W2 legacy22 + weidi + feiying + wumou');
  assert.equal(Object.keys(NONREGISTRY_SKILL_PATHS).length, 48);
  assert.equal(Object.values(NONREGISTRY_SKILL_PATHS).reduce((sum, hooks) => sum + Object.keys(hooks).length, 0), 62);
  assert.deepEqual(registered.get('feiying'), [], 'empty placeholder registration remains a direct integration');
  assert.deepEqual(registered.get('wumou'), [], 'empty placeholder registration remains a direct integration');
});

test('AC2 #4 omissions, invented metadata and empty implementations cannot satisfy the mapping', () => {
  const omitted = { ...NONREGISTRY_SKILL_PATHS };
  delete omitted.feiying;
  assert.throws(() => assertDirectIntegrations({ ...input, paths: omitted }), /every implemented direct integration/);
  const metadata = { ...SKILL_METADATA, feiying: { ...SKILL_METADATA.feiying, hooks: ['imaginaryDirectHook'] } };
  assert.throws(() => assertDirectIntegrations({ ...input, metadata }), /every direct hook/);
  for (const [id, file, before, after] of [
    ['feiying', 'state.js', "skillEnabled(to, 'feiying', game)", 'false'],
    ['wumou', 'god-wrath.js', "loseHp(game, actor, 1, '无谋')", 'undefined'],
    ['paoxiao', 'skill-runtime.js', 'unlimitedSha: true', 'unlimitedSha: false'],
    ['hujia', 'game-engine.js', 'StateRuntime.hasLordSkill(game, lordActor, skillId)', 'true'],
  ]) {
    const original = read(file);
    assert.ok(original.includes(before));
    const corrupted = original.replace(before, after) + '\n// ' + before;
    const corruptedRead = candidate => candidate === file ? corrupted : read(candidate);
    assert.throws(() => {
      for (const [hook, evidence] of Object.entries(NONREGISTRY_SKILL_PATHS[id])) assertPathEvidence(corruptedRead, evidence, `${id}.${hook}`);
    }, /missing executable/, `${id}: comments and empty registrations must not hide missing behavior`);
  }
});

test('AC2 #5 catalog statuses compute current README numbers and derived IDs', () => {
  assert.deepEqual({ heroes: counts.heroes, slots: counts.slots, nativeUnique: counts.nativeUnique,
    implemented: counts.implemented, implementedNative: counts.implementedNative, derived: counts.derived, todo: counts.todo },
  { heroes: 79, slots: 149, nativeUnique: 144, implemented: 125, implementedNative: 123, derived: ['jilue', 'jixi'], todo: 21 });
  assertReadmeCounts(fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8'), counts);
});

test('AC2 #5 historical correct numbers cannot hide a wrong or missing current count row', () => {
  const current = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const row = current.split('\n').find(line => line.startsWith('- 武将 '));
  const corrupt = current.replace(row, row.replace('未接入唯一技能 21 个', '未接入唯一技能 20 个'));
  assert.throws(() => assertReadmeCounts(corrupt + '\n## 历史数值副本\n' + row + '\n', counts), /current counts drift/);
  assert.throws(() => assertReadmeCounts(current.replace(row, '') + '\n## 历史数值副本\n' + row + '\n', counts), /exactly one current catalog count row/);
  assert.throws(() => assertReadmeCounts(current.replace('- **内容**:79 名武将', '- **内容**:78 名武将'), counts), /headline counts drift/);
});

test('AC2 #6 five response chains actually enter the shared pause gate and preserve paid progress', () => {
  assertFiveResponseProtocols(read);
});

test('AC2 #6 independent corrupt copies reject bypasses and missing per-chain or central pause guards', () => {
  for (const [file, before, after] of [
    ['sha-flow.js', "return flows.run(game, 'sha', {", 'return advanceShaResponses(game, {'],
    ['tricks.js', 'chain.resumePaid += 1;\n              if (flows.blocked(game))', 'chain.resumePaid += 1;\n              if (false)'],
    ['damage-dying.js', 'flows.blocked(game) || (attemptResult && attemptResult.paused)', 'false'],
    ['tricks.js', 'chain.queue = null;  // 新净状态 → 重建队列, 所有座席重新获得响应机会\n        return advanceWuxieChain(game);', 'chain.queue = null; return advanceWuxieResponses(game);'],
    ['tricks.js', "if (effectResult !== 'continue') return effectResult;", 'void effectResult;'],
    ['response.js', 'if (responseFlowBlocked(game)) {', 'if (false) {'],
    ['response.js', "if (game.phase === 'gameover') {", 'if (false) {'],
  ]) {
    const source = read(file);
    assert.ok(source.includes(before), `negative guard mutation anchor drift: ${file}`);
    const corrupted = source.replace(before, after);
    assert.throws(() => assertFiveResponseProtocols(candidate => candidate === file ? corrupted : read(candidate)), /missing executable|bypasses shared pause gate/, file + ': ' + before);
  }
  // Registration and name survive, but an empty driver cannot pass the gate.
  const source = read('sha-flow.js');
  const body = functionBody(source, 'advanceShaResponses');
  assert.ok(body.length > 100);
  assert.throws(() => assertFiveResponseProtocols(file => file === 'sha-flow.js'
    ? source.replace('function advanceShaResponses(game, saved) {', 'function advanceShaResponses(game, saved) { return null; } function removedShaDriver(game, saved) {') : read(file)), /missing executable/);
});

console.log('AC2 measured inventory: ' + JSON.stringify(counts));
await runTests();
