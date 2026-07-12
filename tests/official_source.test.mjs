import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Engine } from './helpers/load-engine.mjs';

assert.ok(Engine, 'game engine should expose SanguoshaEngine via ES module export');

const repoRoot = path.resolve(import.meta.dirname, '..');
const fixturePath = path.join(repoRoot, 'tests/fixtures/official_standard_skills.json');
const specFixturePath = path.join(repoRoot, 'tests/fixtures/official_standard_skill_specs.json');
const windFixturePath = path.join(repoRoot, 'tests/fixtures/official_wind_skills.json');
const windSpecFixturePath = path.join(repoRoot, 'tests/fixtures/official_wind_skill_specs.json');
const gitignorePath = path.join(repoRoot, '.gitignore');

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

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
  // v12 G0 (修复批): 恢复精确断言 — 标准包恒为 27 将; 扩展包条目一律走
  // 独立 pack fixture (official_wind_skills.json 等), 不得再混入本文件。
  assert.equal(fixture.heroes.length, 27, 'official 标准 pack should have exactly 27 heroes');
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

// v12 G0 (修复批): 风包独立 fixture — 与标准包同构的 compact + specs 双文件,
// pack='风'。gid 为本地临时编号 (source.gidPolicy 说明), 官方页面爬取待补,
// 因此不断言 detailUrl; 其余七字段 spec 契约与标准包完全一致。
test('wind pack fixture is a separate pack with the same spec contract', () => {
  assert.ok(fs.existsSync(windFixturePath), 'missing wind compact fixture');
  assert.ok(fs.existsSync(windSpecFixturePath), 'missing wind structured spec fixture');
  const windFixture = JSON.parse(fs.readFileSync(windFixturePath, 'utf8'));
  const windSpecs = JSON.parse(fs.readFileSync(windSpecFixturePath, 'utf8'));

  assert.equal(windFixture.schemaVersion, 1);
  assert.equal(windFixture.pack, '风');
  assert.equal(windFixture.includeFullSkillText, false);
  assert.ok(windFixture.source.gidPolicy && windFixture.source.gidPolicy.includes('provisional-local'),
    'wind gid values must be documented as provisional until the official crawl lands');
  assert.equal(windFixture.heroes.length, 5, 'wind repair batch tracks the 5 heroes touched by v12 G');

  const gids = new Set();
  for (const hero of windFixture.heroes) {
    assert.equal(typeof hero.gid, 'number');
    assert.ok(hero.skills.length > 0, `${hero.name} should include at least one skill name`);
    assert.equal(gids.has(hero.gid), false, `duplicate gid ${hero.gid}`);
    gids.add(hero.gid);
  }
  const windByName = Object.fromEntries(windFixture.heroes.map((hero) => [hero.name, hero]));
  assert.deepEqual(windByName['夏侯渊'].skills, ['神速']);
  assert.deepEqual(windByName['曹仁'].skills, ['据守']);
  assert.deepEqual(windByName['黄忠'].skills, ['烈弓']);
  assert.deepEqual(windByName['魏延'].skills, ['狂骨']);
  assert.deepEqual(windByName['小乔'].skills, ['天香', '红颜']);

  assert.equal(windSpecs.pack, '风');
  assert.equal(windSpecs.containsImplementationSpecs, true);
  assert.equal(windSpecs.includeFullSkillText, false);
  assert.equal(windSpecs.source.rawCachePath, '.cache/sanguosha-official/official_wind_skill_texts.json');
  assert.ok(windSpecs.source.rawCachePolicy.includes('cache-first'));
  assert.equal(windSpecs.heroes.length, windFixture.heroes.length);
  assertNoKey(windSpecs, 'officialText', 'wind spec fixture must not contain official prose anywhere');

  const windSpecsByName = Object.fromEntries(windSpecs.heroes.map((hero) => [hero.name, hero]));
  for (const hero of windFixture.heroes) {
    const specHero = windSpecsByName[hero.name];
    assert.ok(specHero, `missing structured specs for ${hero.name}`);
    assert.equal(specHero.gid, hero.gid);
    assert.deepEqual(specHero.skills.map((skill) => skill.name), hero.skills);
    for (const skill of specHero.skills) {
      assert.ok(skill.localSkillId, `${hero.name}【${skill.name}】 should map to a local skill id`);
      assert.ok(['implemented', 'pending'].includes(skill.implementationStatus),
        `${hero.name}【${skill.name}】 should declare an honest implementationStatus`);
      assert.ok(skill.spec.summary && skill.spec.summary.length >= 8);
      assert.ok(skill.spec.timing && skill.spec.timing.length >= 2);
      assert.ok(skill.spec.condition && skill.spec.condition.length >= 2);
      assert.ok(skill.spec.cost && skill.spec.cost.length >= 2);
      assert.ok(skill.spec.effect && skill.spec.effect.length >= 4);
      assert.ok(skill.spec.frequency && skill.spec.frequency.length >= 2);
      assert.ok(Array.isArray(skill.spec.engineHooks) && skill.spec.engineHooks.length > 0);
      assert.ok(/^[a-f0-9]{12}$/.test(skill.sourceTextRef));
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
