import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HERO_CATALOG,
  IMPLEMENTED_SKILL_IDS,
  SKILL_METADATA,
} from './helpers/load-engine.mjs';
import { test, runTests } from './helpers/harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

// v12 G0 (修复批): 四方一致性审计按 pack 合并加载 — 风包条目从标准包
// fixture 分离为独立文件后, cache/specs 两侧都要覆盖全部已接入的包。
const CACHE_PATHS = [
  'official-skill-cache/sanguosha-standard/official_standard_skill_cache.json',
  'official-skill-cache/sanguosha-wind/official_wind_skill_cache.json',
  // v15 T: 火包接入 — 新包 cache/specs 成对追加
  'official-skill-cache/sanguosha-fire/official_fire_skill_cache.json',
  // v15 U: 林包接入
  'official-skill-cache/sanguosha-lin/official_lin_skill_cache.json',
  // v15 V: 山包接入
  'official-skill-cache/sanguosha-shan/official_shan_skill_cache.json',
];
const SPECS_PATHS = [
  'tests/fixtures/official_standard_skill_specs.json',
  'tests/fixtures/official_wind_skill_specs.json',
  'tests/fixtures/official_fire_skill_specs.json',
  'tests/fixtures/official_lin_skill_specs.json',
  'tests/fixtures/official_shan_skill_specs.json',
];

function indexByLocalId(docs, specKey) {
  const map = new Map();
  for (const doc of docs) {
    for (const hero of doc.heroes || []) {
      for (const skill of hero.skills || []) {
        if (!skill.localSkillId) continue;
        if (map.has(skill.localSkillId)) {
          throw new Error(`duplicate localSkillId across pack fixtures: ${skill.localSkillId}`);
        }
        map.set(skill.localSkillId, {
          heroLocalId: hero.localHeroId,
          heroName: hero.name,
          skillName: skill.name,
          sourceTextRef: skill.sourceTextRef,
          spec: skill[specKey],
        });
      }
    }
  }
  return map;
}

const cacheById = indexByLocalId(CACHE_PATHS.map(readJson), 'implementationSpec');
const specsById = indexByLocalId(SPECS_PATHS.map(readJson), 'spec');

const VALID_TRIGGERS = new Set([
  'playPhase',
  'drawPhase',
  'preparePhase',
  'discardPhase',
  'turnEnd',
  'damageAfter',
  'beforeJudgement',
  'afterJudgement',
  'cardUse',
  'cardConvert',
  'targetValidation',
  'passive',
  // v8 PR-C2: 流离触发时机 — "你成为【杀】的目标后"
  'shaTargetedAfter',
  // v11 C2 (批次 26): 连营触发时机 — "你失去最后一张手牌后"
  'handLoss',
  // v11 C6 (批次 30): 枭姬触发时机 — "你失去装备区里的牌后"
  'equipmentLoss',
  // v12 G2: 天香触发时机 — "当你受到伤害时" (onDamageModify 层)
  'damageTaken',
  // v12 G2: 不屈触发时机 — "当你处于濒死状态时"
  'dyingEnter',
  // v12 H7: 护驾触发时机 — "当你需要使用或打出【闪】时" (响应求助)
  'needResponse',
  // v15 T: 猛进触发时机 — "当你使用的【杀】被目标使用的【闪】抵消时"
  'shaDodged',
  // v15 U: 行殇触发时机 — "每当其他角色死亡时"
  'death',
  // v15 V: 屯田触发时机 — "每当你于回合外失去牌后" (连营的 handLoss 只认
  // "失去最后一张手牌", 屯田是任意失牌 → 另立时机名)
  'cardLost',
]);
const VALID_FREQUENCIES = new Set([
  'oncePerTurn',
  'unlimited',
  'passiveAlways',
  // v15 T: 涅槃是限定技 (每局一次) — flags.niepanUsed 永不复位
  'oncePerGame',
]);
const VALID_COST_TYPES = new Set([
  'none',
  'discardOwn',
  'giveHand',
  'playHand',
  'loseHp',
  'reduceDraw',
  'judgement',
  // v12 G1 (修复批): 据守的成本是将武将牌翻面 (跳过自己的下个回合)
  'turnOver',
  // v12 G2: 神速的成本是跳过阶段 (选项二另弃一张装备牌)
  'phaseSkip',
  // v15 V: 凿险/志继/魂姿 三个觉醒技的成本是减 1 点体力上限
  'reduceMaxHp',
  // v15 T: 驱虎/天义 的成本是与目标拼点 (双方各扣置一张手牌)
  'rankCompare',
]);

test('every implemented skill has structured metadata with valid tag values', () => {
  for (const skillId of IMPLEMENTED_SKILL_IDS) {
    const meta = SKILL_METADATA[skillId];
    assert.ok(meta, `${skillId}: SKILL_METADATA entry is missing`);
    assert.ok(
      VALID_TRIGGERS.has(meta.trigger),
      `${skillId}: trigger ${meta.trigger} is not in the canonical set`,
    );
    assert.ok(
      VALID_FREQUENCIES.has(meta.frequency),
      `${skillId}: frequency ${meta.frequency} is not in the canonical set`,
    );
    assert.equal(typeof meta.optional, 'boolean', `${skillId}: optional must be boolean`);
    assert.equal(typeof meta.mandatory, 'boolean', `${skillId}: mandatory must be boolean`);
    assert.ok(meta.cost && typeof meta.cost === 'object', `${skillId}: cost must be an object`);
    assert.ok(
      VALID_COST_TYPES.has(meta.cost.type),
      `${skillId}: cost.type ${meta.cost.type} is not in the canonical set`,
    );
    assert.ok(Array.isArray(meta.hooks) && meta.hooks.length > 0, `${skillId}: hooks must be a non-empty array`);
  }
});

test('mandatory skills are not optional and vice versa for lock skills', () => {
  for (const skillId of IMPLEMENTED_SKILL_IDS) {
    const meta = SKILL_METADATA[skillId];
    if (meta.mandatory) {
      assert.equal(meta.optional, false, `${skillId}: lock skill cannot also be optional`);
      // v15 V: 觉醒技 (凿险/志继/若愚/魂姿) 同样没有"不发动"这条出路 (条件
      // 满足即必须觉醒), 但只发动一次且此后永久失效 —— 与"每次都生效"的
      // 锁定技频率不同。用显式 awakening 标记区分, 而不是把它们错标成
      // passiveAlways 或假装可选。
      assert.equal(
        meta.frequency,
        meta.awakening ? 'oncePerGame' : 'passiveAlways',
        `${skillId}: ${meta.awakening ? 'awakening skill must be oncePerGame' : 'lock skill must have passiveAlways frequency'}`,
      );
    }
    if (meta.awakening) {
      assert.equal(meta.mandatory, true, `${skillId}: awakening skill is mandatory (条件满足必须觉醒)`);
      assert.equal(meta.trigger, 'preparePhase', `${skillId}: 本作已实现的觉醒技均在准备阶段开始时检定`);
    }
  }
});

test('SKILL_METADATA is merged into every HERO_CATALOG entry that carries the skill', () => {
  for (const heroId of Object.keys(HERO_CATALOG)) {
    const skills = HERO_CATALOG[heroId].skills || [];
    for (const skill of skills) {
      const meta = SKILL_METADATA[skill.id];
      if (!meta) continue;
      for (const field of ['trigger', 'frequency', 'optional', 'mandatory', 'cost', 'hooks']) {
        assert.deepEqual(
          skill[field],
          meta[field],
          `${heroId}.${skill.id}: ${field} should equal SKILL_METADATA value`,
        );
      }
    }
  }
});

test('cache and specs fixtures cover every implemented skill', () => {
  for (const skillId of IMPLEMENTED_SKILL_IDS) {
    assert.ok(cacheById.has(skillId), `${skillId} missing from official_standard_skill_cache.json`);
    assert.ok(specsById.has(skillId), `${skillId} missing from official_standard_skill_specs.json`);
  }
});

test('cache and specs fixtures agree on every shared skill', () => {
  for (const [skillId, cacheEntry] of cacheById) {
    const specEntry = specsById.get(skillId);
    if (!specEntry) continue;
    assert.equal(
      specEntry.sourceTextRef,
      cacheEntry.sourceTextRef,
      `${skillId}: sourceTextRef differs between cache and specs`,
    );
    for (const field of ['summary', 'timing', 'condition', 'cost', 'effect', 'frequency']) {
      assert.equal(
        specEntry.spec?.[field],
        cacheEntry.spec?.[field],
        `${skillId}: spec.${field} differs between cache and specs`,
      );
    }
    assert.deepEqual(
      specEntry.spec?.engineHooks,
      cacheEntry.spec?.engineHooks,
      `${skillId}: engineHooks array differs between cache and specs`,
    );
  }
});
await runTests();

console.log('\nSkill schema and fixture consistency tests passed.');
