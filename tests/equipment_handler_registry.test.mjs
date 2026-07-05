// v11 E1 (批次 35): 装备副作用 handler 收口守护 —
// 1) 引擎规则文件 (game-engine/damage-dying/ai/tricks/response) 不再出现
//    裸 `.type === '装备型号'` 判断: 布尔类效果一律经 EQUIPMENT_EFFECTS
//    flag 查询, 伤害修正类经 equipment.js 的 EQUIPMENT_DAMAGE_MODIFIERS。
// 2) 伤害修正表顺序固定 (藤甲 → 古锭 → 白银 → 寒冰, 顺序即 spec 互动)。
// 3) 修正叠加行为: 古锭 +1 后白银 clamp 回 1; 藤甲火 +1 后白银 clamp。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine, CARD_CATALOG } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

// ───── 架构守护 ─────────────────────────────────────────────────────

const RULE_FILES = [
  'src/engine/game-engine.js',
  'src/engine/damage-dying.js',
  'src/engine/response.js',
  'src/engine/tricks.js',
  'src/engine/ai.js',
];

test('引擎规则文件不含裸装备型号判断 (收口到 flag/handler 注册表)', () => {
  const equipmentTypes = Object.keys(CARD_CATALOG)
    .filter((type) => CARD_CATALOG[type].family === 'equipment');
  assert.ok(equipmentTypes.length >= 12, '装备类型清单来自 CARD_CATALOG');
  const pattern = new RegExp(String.raw`\.type\s*[!=]==\s*'(${equipmentTypes.join('|')})'`);
  for (const rel of RULE_FILES) {
    const source = fs.readFileSync(path.join(root, rel), 'utf8');
    const offenders = source.split('\n')
      .map((line, i) => ({ line, no: i + 1 }))
      .filter(({ line }) => !line.trim().startsWith('//') && pattern.test(line));
    assert.deepEqual(
      offenders.map(({ no, line }) => `${rel}:${no}: ${line.trim()}`), [],
      `${rel} 不应出现裸装备型号判断 (改走 EQUIPMENT_EFFECTS flag 或 equipment.js handler)`);
  }
});

test('伤害修正 handler 表存在且顺序固定: 藤甲 → 古锭 → 白银 → 寒冰', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/equipment.js'), 'utf8');
  const tableMatch = source.match(/var EQUIPMENT_DAMAGE_MODIFIERS = \[([\s\S]*?)\];/);
  assert.ok(tableMatch, 'equipment.js 应声明 EQUIPMENT_DAMAGE_MODIFIERS 有序表');
  const order = [...tableMatch[1].matchAll(/name:\s*'([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(order, ['tengjia', 'guding', 'baiyin', 'hanbing'], '顺序即 spec 互动语义');
});

test('damage() 经注册表结算装备伤害修正 (不再内联)', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/damage-dying.js'), 'utf8');
  assert.match(source, /applyEquipmentDamageModifiers\(game, \{/, 'damage 应调用 handler 表');
  assert.doesNotMatch(source, /【藤甲】|【白银狮子】将伤害|【古锭刀】/, '修正日志文案应随 handler 迁往 equipment.js');
});

// ───── 修正叠加行为 ─────────────────────────────────────────────────

function buildGame(opts) {
  opts = opts || {};
  const game = Engine.newGame({ seed: opts.seed || 35001, playerHero: 'liubei', enemyHero: 'lvmeng' });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].flags = {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp;
    game[actor].skillPreferences = {};
  }
  game.turn = 'player';
  game.phase = 'play';
  return game;
}

test('叠加: 古锭 +1 (无手牌) → 白银 clamp 回 1', () => {
  const game = buildGame();
  game.player.equipment.weapon = c('guding', { id: 'p-guding' });
  game.player.hand = [c('sha', { id: 'p-sha' })];
  game.enemy.equipment.armor = c('baiyin', { id: 'e-baiyin' });
  game.enemy.hand = []; // 无手牌 → 古锭 +1
  const hp = game.enemy.hp;
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'p-sha'));
  assert.equal(game.enemy.hp, hp - 1, '2 点被白银 clamp 回 1');
  assert.ok(game.log.some((l) => l.includes('【古锭刀】')), '古锭已触发');
  assert.ok(game.log.some((l) => l.includes('【白银狮子】')), '白银已触发');
});

test('叠加: 藤甲火杀 +1 → 白银不在场时实打 2 点', () => {
  const game = buildGame();
  game.player.hand = [c('fire_sha', { id: 'p-fsha' })];
  game.enemy.equipment.armor = c('tengjia', { id: 'e-tengjia' });
  const hp = game.enemy.hp;
  Engine.playCard(game, 'player', 'p-fsha');
  assert.equal(game.enemy.hp, hp - 2, '火杀 1+1 = 2 点');
  assert.ok(game.log.some((l) => l.includes('【藤甲】令火焰伤害')));
});

test('藤甲防止普通杀: 经 handler 表仍然生效', () => {
  const game = buildGame();
  game.player.hand = [c('sha', { id: 'p-sha', suit: 'heart', color: 'red' })];
  game.enemy.equipment.armor = c('tengjia', { id: 'e-tengjia' });
  const hp = game.enemy.hp;
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'p-sha'));
  assert.equal(game.enemy.hp, hp, '普通杀被藤甲防止');
  assert.ok(game.discard.some((x) => x.id === 'p-sha'), '来源杀照常入弃牌堆');
});

test('寒冰防止: 经 handler 表仍然生效 (弃两张, 伤害防止)', () => {
  const game = buildGame();
  game.player.equipment.weapon = c('hanbing', { id: 'p-hanbing' });
  game.player.hand = [c('sha', { id: 'p-sha' })];
  game.enemy.hand = [c('tao', { id: 'e-t1' }), c('tao', { id: 'e-t2' })];
  const hp = game.enemy.hp;
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'p-sha'));
  assert.equal(game.enemy.hp, hp, '寒冰防止伤害');
  assert.equal(game.enemy.hand.length, 0, '弃两张');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
