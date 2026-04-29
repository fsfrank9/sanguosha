import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = path.resolve(import.meta.dirname, '..');
const fixturePath = path.join(repoRoot, 'tests/fixtures/official_standard_skills.json');
const specFixturePath = path.join(repoRoot, 'tests/fixtures/official_standard_skill_specs.json');
const gitignorePath = path.join(repoRoot, '.gitignore');
const htmlPath = path.join(repoRoot, 'index.html');

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script id="game-engine"[^>]*>([\s\S]*?)<\/script>/);
assert.ok(match, 'index.html should contain <script id="game-engine">');

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox, { filename: 'game-engine.js' });
const Engine = sandbox.window.SanguoshaEngine;
assert.ok(Engine, 'engine should expose window.SanguoshaEngine');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

function skillNames(hero) {
  return (hero.skills || []).map((skill) => skill.name);
}

function assertNoKey(value, forbiddenKey, message, pathParts = []) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoKey(item, forbiddenKey, message, [...pathParts, String(index)]));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assert.notEqual(key, forbiddenKey, `${message}: ${[...pathParts, key].join('.')}`);
    assertNoKey(child, forbiddenKey, message, [...pathParts, key]);
  }
}

test('official standard fixture is a compact regenerated source of truth', () => {
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.source.indexUrl, 'https://www.sanguosha.com/hero');
  assert.equal(fixture.source.detailUrlPattern, 'https://www.sanguosha.com/hero/{gid}');
  assert.equal(fixture.pack, '标准');
  assert.equal(fixture.heroes.length, 27, 'official 标准 pack should have 27 heroes');
  assert.equal(fixture.includeFullSkillText, false, 'fixture should avoid storing full official prose');

  const gids = new Set();
  const names = new Set();
  for (const hero of fixture.heroes) {
    assert.equal(typeof hero.gid, 'number');
    assert.equal(typeof hero.name, 'string');
    assert.ok(hero.name.length > 0);
    assert.ok(Array.isArray(hero.skills), `${hero.name} should have skills array`);
    assert.ok(hero.skills.length > 0, `${hero.name} should include at least one skill name`);
    assert.equal(gids.has(hero.gid), false, `duplicate gid ${hero.gid}`);
    assert.equal(names.has(hero.name), false, `duplicate hero ${hero.name}`);
    gids.add(hero.gid);
    names.add(hero.name);
  }
});

test('official skill specs preserve implementation detail without committing official prose', () => {
  assert.ok(fs.existsSync(specFixturePath), 'missing structured implementation spec fixture');
  const specFixture = JSON.parse(fs.readFileSync(specFixturePath, 'utf8'));
  const gitignore = fs.readFileSync(gitignorePath, 'utf8');

  assert.equal(specFixture.schemaVersion, 1);
  assert.equal(specFixture.pack, '标准');
  assert.equal(specFixture.includeFullSkillText, false, 'committed fixture must not store full official prose');
  assert.equal(specFixture.containsImplementationSpecs, true);
  assert.equal(specFixture.source.rawCachePath, '.cache/sanguosha-official/official_standard_skill_texts.json');
  assert.ok(/\.cache\/sanguosha-official\//.test(gitignore), 'raw official text cache must be gitignored');
  assert.ok(specFixture.source.rawCachePolicy.includes('cache-first'), 'fixture should document cache-first refresh policy');
  assert.equal(specFixture.heroes.length, fixture.heroes.length);
  assertNoKey(specFixture, 'officialText', 'structured spec fixture must not contain official prose anywhere');

  const compactByName = Object.fromEntries(fixture.heroes.map((hero) => [hero.name, hero]));
  const specsByName = Object.fromEntries(specFixture.heroes.map((hero) => [hero.name, hero]));

  for (const [heroName, compactHero] of Object.entries(compactByName)) {
    const specHero = specsByName[heroName];
    assert.ok(specHero, `missing structured specs for ${heroName}`);
    assert.equal(specHero.gid, compactHero.gid);
    const specNames = (specHero.skills || []).map((skill) => skill.name);
    assert.deepEqual(specNames, compactHero.skills, `${heroName} spec skills should match compact official skill names`);
    for (const skill of specHero.skills) {
      assert.ok(skill.localSkillId, `${heroName}【${skill.name}】 should map to a local skill id`);
      assert.ok(skill.spec, `${heroName}【${skill.name}】 should have structured implementation spec`);
      assert.ok(skill.spec.summary && skill.spec.summary.length >= 8, `${heroName}【${skill.name}】 should include a concise paraphrased summary`);
      assert.ok(skill.spec.timing && skill.spec.timing.length >= 2, `${heroName}【${skill.name}】 should include timing`);
      assert.ok(skill.spec.condition && skill.spec.condition.length >= 2, `${heroName}【${skill.name}】 should include condition`);
      assert.ok(skill.spec.cost && skill.spec.cost.length >= 2, `${heroName}【${skill.name}】 should include cost`);
      assert.ok(skill.spec.effect && skill.spec.effect.length >= 4, `${heroName}【${skill.name}】 should include effect`);
      assert.ok(skill.spec.frequency && skill.spec.frequency.length >= 2, `${heroName}【${skill.name}】 should include frequency`);
      assert.ok(Array.isArray(skill.spec.engineHooks), `${heroName}【${skill.name}】 should list engine hooks`);
      assert.ok(skill.spec.engineHooks.length > 0, `${heroName}【${skill.name}】 should identify at least one engine hook`);
      assert.ok(skill.sourceTextRef && /^[a-f0-9]{12}$/.test(skill.sourceTextRef), `${heroName}【${skill.name}】 should link to local raw text by digest prefix`);
      assert.equal(Object.hasOwn(skill, 'officialText'), false, `${heroName}【${skill.name}】 must not commit official prose`);
    }
  }
});

test('official fixture contains the current skill-audit batch', () => {
  const byName = Object.fromEntries(fixture.heroes.map((hero) => [hero.name, hero]));
  assert.deepEqual(byName['貂蝉'].skills, ['闭月', '离间']);
  assert.deepEqual(byName['吕蒙'].skills, ['克己']);
  assert.deepEqual(byName['黄月英'].skills, ['集智', '奇才']);
});

test('local catalog agrees with official skill names for the current batch', () => {
  const expectations = {
    diaochan: ['闭月', '离间'],
    lvmeng: ['克己'],
    huangyueying: ['集智', '奇才']
  };
  for (const [heroId, officialSkills] of Object.entries(expectations)) {
    const hero = Engine.HERO_CATALOG[heroId];
    assert.ok(hero, `missing local hero ${heroId}`);
    const localSkills = skillNames(hero);
    for (const name of officialSkills) {
      assert.ok(localSkills.includes(name), `${hero.name} should expose official skill ${name}`);
    }
  }
});

console.log('\nOfficial source tests passed.');
