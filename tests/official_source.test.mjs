import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = path.resolve(import.meta.dirname, '..');
const fixturePath = path.join(repoRoot, 'tests/fixtures/official_standard_skills.json');
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
