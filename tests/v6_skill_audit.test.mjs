import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HERO_CATALOG, IMPLEMENTED_SKILL_IDS } from './helpers/load-engine.mjs';

// v6 skill-audit harness. Default-enforced as of Phase 6A. The harness prints
// a markdown report of schema completeness vs official-spec coverage for every
// implemented skill, then asserts both sides are complete.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SPEC_FIXTURE_PATHS = [
  path.join(root, 'tests/fixtures/official_standard_skill_specs.json'),
  path.join(root, 'tests/fixtures/official_expansion_skill_specs.json'),
];
const REQUIRED_SPEC_FIELDS = [
  'summary',
  'timing',
  'condition',
  'cost',
  'effect',
  'frequency',
  'engineHooks',
];
const REQUIRED_SCHEMA_FIELDS = [
  'trigger',
  'frequency',
  'optional',
  'cost',
  'hooks',
];

function loadSpecsByLocalId() {
  const docs = SPEC_FIXTURE_PATHS.map((fixturePath) =>
    JSON.parse(fs.readFileSync(fixturePath, 'utf8')),
  );
  const byId = new Map();
  for (const hero of docs.flatMap((json) => json.heroes || [])) {
    for (const skill of hero.skills || []) {
      if (skill.localSkillId) {
        byId.set(skill.localSkillId, { hero: hero.localHeroId || hero.name, ...skill });
      }
    }
  }
  return byId;
}

function findSkillInCatalog(skillId) {
  for (const heroId of Object.keys(HERO_CATALOG)) {
    const hero = HERO_CATALOG[heroId];
    const skill = hero.skills?.find((s) => s.id === skillId);
    if (skill) return { heroId, skill };
  }
  return null;
}

function specStatus(spec) {
  if (!spec) return { status: '❌', missing: ['<entire spec>'] };
  const missing = REQUIRED_SPEC_FIELDS.filter((f) => {
    const v = spec.spec?.[f];
    if (v === undefined || v === null) return true;
    if (typeof v === 'string' && v.trim() === '') return true;
    if (Array.isArray(v) && v.length === 0) return true;
    return false;
  });
  if (missing.length === 0) return { status: '✅', missing: [] };
  if (missing.length === REQUIRED_SPEC_FIELDS.length) return { status: '❌', missing };
  return { status: '⚠️', missing };
}

function schemaStatus(skill) {
  if (!skill) return { status: '❌', missing: ['<skill not found in HERO_CATALOG>'] };
  const missing = REQUIRED_SCHEMA_FIELDS.filter((f) => skill[f] === undefined);
  if (missing.length === 0) return { status: '✅', missing: [] };
  if (missing.length === REQUIRED_SCHEMA_FIELDS.length) return { status: '❌', missing };
  return { status: '⚠️', missing };
}

const specsById = loadSpecsByLocalId();
const rows = [];
for (const skillId of IMPLEMENTED_SKILL_IDS) {
  const catalogEntry = findSkillInCatalog(skillId);
  const spec = specsById.get(skillId);
  rows.push({
    skillId,
    heroId: catalogEntry?.heroId ?? '<unknown>',
    name: catalogEntry?.skill?.name ?? '<unknown>',
    schema: schemaStatus(catalogEntry?.skill),
    spec: specStatus(spec),
  });
}

const fmtFields = (fields) => (fields.length ? `(missing: ${fields.join(', ')})` : '');

console.log('\n## v6 skill-audit report');
console.log('');
console.log(`Implemented skills: ${IMPLEMENTED_SKILL_IDS.length}`);
console.log(`Official-spec entries: ${specsById.size}`);
console.log('');
console.log('| skill | hero | schema | official spec |');
console.log('| --- | --- | --- | --- |');
for (const r of rows) {
  console.log(
    `| ${r.name} (${r.skillId}) | ${r.heroId} | ${r.schema.status} ${fmtFields(r.schema.missing)} | ${r.spec.status} ${fmtFields(r.spec.missing)} |`,
  );
}
console.log('');

const schemaFailures = rows.filter((r) => r.schema.status !== '✅');
const specFailures = rows.filter((r) => r.spec.status !== '✅');

console.log(`Schema-incomplete skills: ${schemaFailures.length} / ${rows.length}`);
console.log(`Spec-incomplete skills:   ${specFailures.length} / ${rows.length}`);
console.log('');

// These assertions are expected to RED until Phase 6A/6B completes.
assert.equal(
  schemaFailures.length,
  0,
  `v6A: ${schemaFailures.length} implemented skills are missing schema fields. See report above.`,
);
assert.equal(
  specFailures.length,
  0,
  `v6A: ${specFailures.length} implemented skills are missing official-spec fields. See report above.`,
);

console.log('v6 skill audit passed.');
