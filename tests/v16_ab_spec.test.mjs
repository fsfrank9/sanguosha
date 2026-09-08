import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { HERO_CATALOG, IMPLEMENTED_SKILL_IDS, SKILL_METADATA } from './helpers/load-engine.mjs';
import { GeneralCardRuntime } from '../src/engine/general-card-runtime.js';
import { actualSkillRegistrations } from './helpers/skill-registrations.mjs';
import { test, runTests } from './helpers/harness.mjs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const specs = JSON.parse(read('tests/fixtures/official_god_skill_specs.json'));
const compact = JSON.parse(read('tests/fixtures/official_god_skills.json'));
const cache = JSON.parse(read('official-skill-cache/sanguosha-god/official_god_skill_cache.json'));
const legacy = JSON.parse(read('tests/fixtures/v16_ab_legacy_catalog.json'));
const expectedHeroes = {
  god_guanyu: ['wushen', 'wuhun'],
  god_lvmeng: ['shelie', 'gongxin'],
  god_zhouyu: ['qinyin', 'yeyan'],
  god_zhugeliang: ['qixing', 'kuangfeng', 'dawu'],
  god_caocao: ['guixin', 'feiying'],
  god_lvbu: ['kuangbao', 'wumou', 'shenfen', 'wuqian'],
  god_zhaoyun: ['juejing', 'longhun'],
  god_simayi: ['renjie', 'baiyin', 'lianpo'],
};
const skills = specs.heroes.flatMap(hero => hero.skills);

test('AB source audit verifies every full line digest against the existing mirror', () => {
  assert.equal(specs.includeFullSkillText, false);
  assert.equal(cache.containsOfficialText, false);
  assert.equal(specs.heroes.length, 8);
  assert.equal(skills.length, 21);
  assert.equal(new Set(skills.map(skill => skill.localSkillId)).size, 21);
  assert.equal(skills.filter(skill => !skill.derivedFrom).length, 20);
  assert.equal(specs.interactions.length, 43, 'every accepted cross-rule boundary retains its evidence');
  assert.deepEqual(cache.interactions, specs.interactions, 'cache preserves all cross-rule references');
  let checked = 0;
  function verify(node) {
    if (!node || typeof node !== 'object') return;
    assert.equal(Object.hasOwn(node, 'officialText'), false, 'safe fixtures contain structured summaries');
    assert.equal(Object.hasOwn(node, 'gid'), false, 'local mirror extraction must not fabricate an official gid');
    if (node.sourceLine) {
      const [file, lineNumber] = node.sourceLine.split(':');
      const line = read('official-skill-cache/gltjk-sanguosha-rules/pages/' + file).split(/\r?\n/)[Number(lineNumber) - 1];
      assert.equal(typeof line, 'string', node.sourceLine);
      assert.ok(line.length, node.sourceLine + ' must identify substantive evidence');
      const digest = crypto.createHash('sha256').update(line, 'utf8').digest('hex');
      assert.equal(node.sourceTextSha256, digest, node.sourceLine);
      assert.equal(node.sourceTextRef, digest.slice(0, 12), node.sourceLine);
      checked += 1;
    }
    for (const value of Object.values(node)) verify(value);
  }
  verify(specs);
  assert.equal(checked, 74, '21 skill, 8 header, 2 artwork and 43 interaction references');
  checked = 0;
  verify(cache);
  assert.equal(checked, 74, 'the independently stored cache retains and verifies every reference');
  for (const hero of specs.heroes) {
    const cachedHero = cache.heroes.find(entry => entry.localHeroId === hero.localHeroId);
    assert.deepEqual(cachedHero?.headerSource, hero.headerSource, hero.localHeroId + ': complete-card version source');
    assert.deepEqual(cachedHero?.alternatePrintings, hero.alternatePrintings, hero.localHeroId + ': artwork-only versions');
  }
  const mirror = read('official-skill-cache/gltjk-sanguosha-rules/pages/card__hero__legend.md');
  assert.equal([...mirror.matchAll(/^#### /gm)].length, 12, '12 headings include two artwork duplicates and two Hulao forms');
  assert.equal([...mirror.matchAll(/^[^#\n—]+——/gm)].length, 27, '20 native skill paragraphs plus 7 Hulao paragraphs');
});

test('AB catalog expands by eight complete cards while preserving all original 71 entries', () => {
  assert.equal(legacy.heroes.length, 71);
  assert.equal(Object.keys(HERO_CATALOG).length, 79);
  for (const old of legacy.heroes) {
    const current = HERO_CATALOG[old.id];
    assert.ok(current, old.id);
    for (const key of ['id', 'name', 'camp', 'gender', 'maxHp']) {
      assert.equal(current[key], old[key], old.id + '.' + key);
    }
    assert.deepEqual(current.skills.map(({ id, name }) => ({ id, name })), old.skills,
      old.id + ' must not be upgraded to a different card version');
  }
  assert.deepEqual(specs.heroes.map(hero => hero.localHeroId).sort(), Object.keys(expectedHeroes).sort());
  for (const spec of specs.heroes) {
    const hero = HERO_CATALOG[spec.localHeroId];
    const brief = compact.heroes.find(entry => entry.localHeroId === spec.localHeroId);
    assert.equal(hero.name, spec.name);
    assert.equal(hero.maxHp, spec.maxHp);
    assert.equal(hero.gender, 'male');
    assert.equal(hero.camp, '神', 'catalog keeps the printed camp, runtime selects one of the four camps');
    assert.equal(hero.pack, 'god');
    assert.deepEqual(hero.skills.map(skill => skill.id), expectedHeroes[hero.id]);
    assert.deepEqual(hero.skills.map(skill => skill.name), brief.skills);
    assert.match(spec.version, /LE00[1-8]/);
  }
  assert.equal(HERO_CATALOG.god_zhaoyun.maxHp, 2, 'LE007 is the HP-X conversion version');
  assert.equal(HERO_CATALOG.god_simayi.skills.some(skill => skill.id === 'jilue'), false,
    'derived Jilue is gained through Baiyin, never a starting skill');
  assert.equal(SKILL_METADATA.jilue.grantedBy, 'baiyin');
});

test('AB skill status, safe cache, structured specs and real registry installation agree', async () => {
  const registrations = await actualSkillRegistrations();
  assert.ok(registrations.size >= 70, 'the old registry audit remains active');
  const cached = new Map(cache.heroes.flatMap(hero => hero.skills).map(skill => [skill.localSkillId, skill]));
  for (const skill of skills) {
    const id = skill.localSkillId;
    assert.equal(skill.implementationStatus, 'implemented', id + ': fixture may flip only after delivery');
    assert.equal(cached.get(id)?.implementationStatus, 'implemented', id + ': cache status');
    assert.ok(IMPLEMENTED_SKILL_IDS.includes(id), id + ': implementation registry');
    assert.deepEqual(cached.get(id)?.implementationSpec, skill.spec, id + ': cached contract');
    assert.equal(cached.get(id)?.sourceTextSha256, skill.sourceTextSha256, id + ': source identity');
    const meta = SKILL_METADATA[id];
    assert.ok(meta, id + ': metadata');
    const declared = meta.hooks.filter(hook => /^on[A-Z]/.test(hook)).sort();
    assert.deepEqual(registrations.get(id) || [], declared, id + ': actual registered hooks');
    for (const field of ['summary', 'timing', 'condition', 'cost', 'effect', 'frequency']) {
      assert.ok(typeof skill.spec[field] === 'string' && skill.spec[field].length >= 2, id + '.' + field);
    }
    assert.ok(skill.spec.boundaries.length >= 2, id + ': concrete edge cases');
  }
  assert.equal(IMPLEMENTED_SKILL_IDS.length, 125, '104 existing plus 21 AB skill IDs');
  const native = Object.values(HERO_CATALOG).flatMap(hero => hero.skills);
  assert.equal(native.length, 148);
  assert.equal(new Set(native.map(skill => skill.id)).size, 143);
});

test('AB adds god cards to the full outside-general resource without filtering deferred skills', () => {
  const game = { seats: ['player', 'enemy'],
    player: { heroId: 'god_guanyu' }, enemy: { heroId: 'guanyu' } };
  GeneralCardRuntime.initialize(game, { seed: 160801 });
  assert.deepEqual(game.generalCards.catalogIds, Object.keys(HERO_CATALOG).sort());
  assert.deepEqual(game.generalCards.excludedIds, ['god_guanyu', 'guanyu']);
  const drawn = GeneralCardRuntime.draw(game, 'player', 100);
  assert.equal(drawn.length, 77);
  for (const id of ['sp_guanyu', 'god_simayi', 'god_zhaoyun', 'god_zhugeliang', 'zuoci', 'sp_machao']) {
    assert.ok(drawn.includes(id), id + ': stays in the source pool');
  }
  assert.equal(GeneralCardRuntime.assertConservation(game).total, 79);
  for (const skill of HERO_CATALOG.zuoci.skills) assert.equal(skill.status, 'todo', skill.id);
});

await runTests();
