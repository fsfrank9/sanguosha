import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Engine, c, StateRuntime } from './helpers/load-engine.mjs';
import { test, runTests } from './helpers/harness.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

function gameWith(heroes = ['caocao', 'caocao', 'sunquan'], roles = { player: '主公', enemy: '反贼', ally: '忠臣' }) {
  const g = Engine.newGame({ seed: 162200, seats: ['player', 'enemy', 'ally'], roles,
    playerHero: heroes[0], enemyHero: heroes[1], allyHero: heroes[2] });
  for (const actor of g.seats) {
    Object.assign(g[actor], { hand: [], judgeArea: [], flags: {}, skillPreferences: {},
      equipment: { weapon: null, armor: null, horseMinus: null, horsePlus: null }, hp: g[actor].maxHp });
  }
  g.turn = 'player'; g.phase = 'play'; g.pauseState = {}; g.pendingChoice = null; g.pendingChoiceQueue = [];
  g.discard = []; g.log = []; g.deck = Array.from({ length: 30 }, (_, i) => c('shan', { id: 'deck-' + i, suit: 'spade', rank: '5' }));
  return g;
}
function override(state, attributes) { StateRuntime.setIdentityOverride(state, 'huashen', attributes); }

// The base fields deliberately remain contrary to the public override in every
// rule test. Passing only on mutated base fields would not exercise AA2.
test('AA2 effective attributes preserve original state and catalog, survive JSON copying and temporary Chanyuan', () => {
  const g = gameWith(); const originalCamp = g.player.camp, originalGender = g.player.gender;
  override(g.player, { camp: '吴', gender: 'female' });
  assert.equal(g.player.camp, originalCamp); assert.equal(g.player.gender, originalGender);
  assert.equal(Engine.effectiveCamp(g.player), '吴'); assert.equal(Engine.effectiveGender(g.player), 'female');
  const copied = JSON.parse(JSON.stringify(g.player)); copied.chanyuan = true; copied.hp = 1;
  assert.equal(StateRuntime.effectiveCamp(copied), '吴'); assert.equal(StateRuntime.effectiveGender(copied), 'female');
  StateRuntime.clearIdentityOverride(g.player, 'huashen');
  assert.equal(Engine.effectiveCamp(g.player), originalCamp); assert.equal(Engine.effectiveGender(g.player), originalGender);
  assert.equal(Engine.HERO_CATALOG.caocao.camp, '魏'); assert.equal(Engine.HERO_CATALOG.caocao.gender, 'male');
});

for (const [sourceGender, targetGender, fires] of [['female', 'male', true], ['female', 'female', false]]) {
  test(`AA2 Cixiong compares public genders ${sourceGender}/${targetGender}`, () => {
    const g = gameWith(); override(g.player, { gender: sourceGender }); override(g.enemy, { gender: targetGender });
    g.player.hand = [c('sha', { id: 'sha' })]; g.player.equipment.weapon = c('cixiong', { id: 'sword' });
    g.player.skillPreferences.cixiong = 'ask'; g.enemy.hand = [c('shan', { id: 'dodge' })];
    Engine.playCard(g, 'player', 'sha', { target: 'enemy' });
    assert.equal(g.pendingChoice && g.pendingChoice.kind, fires ? 'cixiong-fire' : null);
  });
}

for (const [heroes, sourceOverride, targetOverride, shanUsed] of [
  [['dongzhuo', 'caocao', 'sunquan'], null, 'female', 2],
  [['dongzhuo', 'zhenji', 'sunquan'], null, 'male', 1],
  [['caocao', 'dongzhuo', 'sunquan'], 'female', null, 2],
  [['zhenji', 'dongzhuo', 'sunquan'], 'male', null, 1]
]) {
  test(`AA2 Roulin ${heroes[0]}→${heroes[1]} follows current gender and consumes ${shanUsed} Shan`, () => {
    const g = gameWith(heroes);
    if (sourceOverride) override(g.player, { gender: sourceOverride });
    if (targetOverride) override(g.enemy, { gender: targetOverride });
    g.player.hand = [c('sha', { id: 'sha' })];
    g.enemy.hand = [c('shan', { id: 'first' }), c('shan', { id: 'second' })];
    assertCardConservation(g, () => Engine.playCard(g, 'player', 'sha', { target: 'enemy' }));
    assert.equal(g.enemy.hand.length, 2 - shanUsed); assert.equal(g.enemy.hp, g.enemy.maxHp);
  });
}

test('AA2 Jieyin accepts base-female/current-male and rejects base-male/current-female', () => {
  for (const [hero, gender, accepted] of [['zhenji', 'male', true], ['caocao', 'female', false]]) {
    const g = gameWith(['sunshangxiang', hero, 'caocao']);
    override(g.enemy, { gender }); g.player.hp = 2; g.enemy.hp = 1;
    g.player.hand = [c('sha', { id: 'a' }), c('shan', { id: 'b' })];
    const result = Engine.useSkill(g, 'player', 'jieyin', ['a', 'b'], { target: 'enemy' });
    assert.equal(result.ok, accepted); assert.equal(g.player.hand.length, accepted ? 0 : 2);
    assert.equal(g.enemy.hp, accepted ? 2 : 1);
  }
});

test('AA2 Lijian checks both current target genders before spending cost', () => {
  const g = gameWith(['diaochan', 'zhenji', 'sunquan']); override(g.enemy, { gender: 'male' });
  g.player.hand = [c('sha', { id: 'cost' })];
  assert.equal(Engine.useSkill(g, 'player', 'lijian', ['cost'], { targets: ['enemy', 'ally'] }).ok, true);
  assert.equal(g.player.hand.length, 0);
  const bad = gameWith(['diaochan', 'caocao', 'sunquan']); override(bad.ally, { gender: 'female' });
  bad.player.hand = [c('sha', { id: 'cost' })];
  assert.equal(Engine.useSkill(bad, 'player', 'lijian', ['cost'], { targets: ['enemy', 'ally'] }).ok, false);
  assert.equal(bad.player.hand.length, 1);
});

test('AA2 Yongsi and Xueyi count currently effective camps, not original camps', () => {
  const g = gameWith(['sp_yuanshu', 'caocao', 'sunquan']); override(g.enemy, { camp: '群' });
  g.phase = 'judge'; Engine.advancePhase(g);
  assert.equal(g.player.hand.length, 4, '2 normal + 2 current camps');
  const lord = gameWith(['yuanshao', 'caocao', 'sunquan']);
  const base = Engine.handLimit(lord, 'player');
  override(lord.enemy, { camp: '群' }); override(lord.ally, { camp: '群' });
  assert.equal(Engine.handLimit(lord, 'player'), base + 4);
});

test('AA2 Songwei uses the judging character current camp', () => {
  for (const [hero, camp, draw] of [['sunquan', '魏', 1], ['caocao', '吴', 0]]) {
    const g = gameWith(['caopi', hero, 'liubei'], { player: '主公', enemy: '忠臣', ally: '反贼' });
    override(g.enemy, { camp }); g.enemy.judgeArea = [c('lebusishu', { id: 'judge-trick' })];
    g.turn = 'enemy'; g.phase = 'prepare'; Engine.advancePhase(g);
    assert.equal(g.player.hand.length, draw);
  }
});

test('AA2 Huangtian transfer uses current neutral camp and leaves base camp unchanged', () => {
  const g = gameWith(['zhangjiao', 'caocao', 'sunquan'], { player: '主公', enemy: '忠臣', ally: '反贼' });
  override(g.enemy, { camp: '群' }); g.turn = 'enemy'; g.enemy.hand = [c('shan', { id: 'gift' })];
  assert.equal(Engine.useSkill(g, 'enemy', 'huangtian', ['gift'], { target: 'player' }).ok, true);
  assert.equal(g.player.hand[0].id, 'gift'); assert.equal(g.enemy.camp, '魏');
});

test('AA2 Hujia response aid admits current Wei ally and excludes former Wei ally', () => {
  for (const [hero, camp, expectedHpLoss] of [['liubei', '魏', 0], ['caocao', '蜀', 1]]) {
    const g = gameWith(['caocao', 'sunquan', hero]); override(g.ally, { camp });
    g.turn = 'enemy'; g.enemy.hand = [c('sha', { id: 'attack' })]; g.ally.hand = [c('shan', { id: 'aid' })];
    const hp = g.player.hp; Engine.playCard(g, 'enemy', 'attack', { target: 'player' });
    assert.equal(g.player.hp, hp - expectedHpLoss); assert.equal(g.ally.hand.length, expectedHpLoss ? 1 : 0);
  }
});

test('AA2 proactive Jijiang accepts a current Shu ally with unchanged base Wei camp', () => {
  const g = gameWith(['liubei', 'sunquan', 'caocao']); override(g.ally, { camp: '蜀' });
  g.ally.hand = [c('sha', { id: 'aid' })]; const hp = g.enemy.hp;
  const result = Engine.useSkill(g, 'player', 'jijiang', [], { target: 'enemy' });
  assert.equal(result.ok, true); assert.equal(g.ally.hand.length, 0); assert.equal(g.enemy.hp, hp - 1);
});

test('AA2 Jiuyuan bonus uses rescue actor current Wu camp', () => {
  const g = gameWith(['sunquan', 'caocao', 'liubei']); override(g.enemy, { camp: '吴' });
  g.player.hp = 1; g.enemy.hand = [c('sha', { id: 'attack' }), c('tao', { id: 'rescue' })];
  g.enemy.skillPreferences.dying = 'ask'; g.turn = 'enemy';
  Engine.playCard(g, 'enemy', 'attack', { target: 'player' });
  assert.equal(g.pendingChoice.kind, 'dying-rescue'); Engine.resolvePendingChoice(g, { cardId: 'rescue' });
  assert.equal(g.player.hp, 2); assert.equal(g.enemy.camp, '魏');
});

test('AA2 Zhiba accepts current Wu actor even when base camp is Wei', () => {
  const g = gameWith(['sunce', 'caocao', 'sunquan'], { player: '主公', enemy: '忠臣', ally: '反贼' });
  override(g.enemy, { camp: '吴' }); g.turn = 'enemy';
  g.enemy.hand = [c('sha', { id: 'low', rank: '2' })]; g.player.hand = [c('shan', { id: 'high', rank: 'K' })];
  g.player.skillPreferences.pindian = 'auto';
  assert.equal(Engine.useSkill(g, 'enemy', 'zhiba', [], { target: 'player' }).ok, true);
  if (g.pendingChoice) Engine.resolvePendingChoice(g, { cardId: 'high' });
  assert.equal(g.enemy.flags.zhibaUsed, true); assert.equal(g.enemy.camp, '魏');
});

test('AA2 Baonue preserves effective pre-damage camp across dying pause and later override changes', () => {
  const g = gameWith(['dongzhuo', 'caocao', 'sunquan'], { player: '主公', enemy: '忠臣', ally: '反贼' });
  override(g.enemy, { camp: '群' }); g.player.hp = 2; g.ally.hp = 1;
  g.ally.hand = [c('tao', { id: 'save' })]; g.ally.skillPreferences.dying = 'ask';
  g.turn = 'enemy'; g.enemy.hand = [c('sha', { id: 'attack' })];
  Engine.playCard(g, 'enemy', 'attack', { target: 'ally' });
  assert.equal(g.pendingChoice.kind, 'dying-rescue'); override(g.enemy, { camp: '魏' });
  Engine.resolvePendingChoice(g, { cardId: 'save' });
  assert.equal(g.player.hp, 3, 'pre-damage public 群 snapshot still grants Baonue');
});

test('AA2 AI sees current genders for Jieyin; changing concealed base values does not change chosen action', () => {
  const g = gameWith(['caocao', 'sunshangxiang', 'zhenji']);
  g.turn = 'enemy'; g.enemy.hp = 1; g.player.hp = 1;
  g.enemy.hand = [c('sha', { id: 'a' }), c('shan', { id: 'b' }), c('sha', { id: 'c' })]; override(g.player, { gender: 'male' });
  const before = Engine.aiChooseSkillAction(g, 'enemy');
  assert.equal(before.skillId, 'jieyin');
  g.player.gender = 'female';
  assert.deepEqual(Engine.aiChooseSkillAction(g, 'enemy'), before);
  override(g.player, { gender: 'female' });
  assert.notEqual(Engine.aiChooseSkillAction(g, 'enemy')?.skillId, 'jieyin');
});

test('AA2 AI Huangtian eligibility follows public camp; changing base camp has no effect', () => {
  const g = gameWith(['zhangjiao', 'caocao', 'sunquan'], { player: '主公', enemy: '忠臣', ally: '反贼' });
  g.turn = 'enemy'; g.enemy.hand = [c('shan', { id: 'a' }), c('shan', { id: 'b' })];
  override(g.enemy, { camp: '群' }); const before = Engine.aiChooseSkillAction(g, 'enemy');
  assert.equal(before.skillId, 'huangtian'); g.enemy.camp = '蜀';
  assert.deepEqual(Engine.aiChooseSkillAction(g, 'enemy'), before);
  override(g.enemy, { camp: '魏' }); assert.notEqual(Engine.aiChooseSkillAction(g, 'enemy')?.skillId, 'huangtian');
});

test('AA2 Hongyan card view and temporary skill suppression remain separate from public identity override', () => {
  const g = gameWith(['xiaoqiao', 'caocao', 'sunquan']);
  override(g.player, { camp: '魏', gender: 'male' }); const spade = c('shan', { suit: 'spade' });
  assert.equal(StateRuntime.effectiveCardSuit(g.player, spade), 'heart');
  assert.equal(spade.suit, 'spade'); assert.equal(StateRuntime.effectiveGender(g.player), 'male');
  g.player.chanyuan = true; g.player.hp = 1;
  assert.equal(StateRuntime.effectiveCardSuit(g.player, spade), 'spade');
  assert.equal(StateRuntime.effectiveCamp(g.player), '魏'); assert.equal(StateRuntime.effectiveGender(g.player), 'male');
});

test('AA2 AI Lijian includes a current-male base-female enemy', () => {
  const g = gameWith(['zhenji', 'diaochan', 'caocao']); g.turn = 'enemy';
  g.enemy.hand = [c('sha', { id: 'a' }), c('shan', { id: 'b' })]; override(g.player, { gender: 'male' });
  const choice = Engine.aiChooseSkillAction(g, 'enemy');
  assert.equal(choice.skillId, 'lijian'); assert.ok(choice.options.targets.includes('player'));
  g.player.gender = 'male'; assert.deepEqual(Engine.aiChooseSkillAction(g, 'enemy'), choice);
  override(g.player, { gender: 'female' }); assert.notEqual(Engine.aiChooseSkillAction(g, 'enemy')?.skillId, 'lijian');
});

test('AA2 AI Zhiba follows current Wu identity instead of its original camp', () => {
  const g = gameWith(['sunce', 'caocao', 'liubei'], { player: '主公', enemy: '忠臣', ally: '反贼' });
  g.turn = 'enemy'; g.enemy.hand = [c('sha', { id: 'a' }), c('shan', { id: 'b' })];
  g.player.hand = [c('shan', { id: 'lord-card' })]; override(g.enemy, { camp: '吴' });
  const before = Engine.aiChooseSkillAction(g, 'enemy'); assert.equal(before.skillId, 'zhiba');
  g.enemy.camp = '蜀'; assert.deepEqual(Engine.aiChooseSkillAction(g, 'enemy'), before);
  override(g.enemy, { camp: '魏' }); assert.notEqual(Engine.aiChooseSkillAction(g, 'enemy')?.skillId, 'zhiba');
});

test('AA2 AI Yongsi healing decision uses current count of public camps', () => {
  const g = gameWith(['caocao', 'sp_yuanshu', 'liubei']); g.turn = 'enemy';
  g.enemy.hp = 3; g.enemy.maxHp = 4; g.enemy.hand = [c('tao', { id: 'last-tao' })];
  g.enemy.equipment.armor = c('bagua', { id: 'armor' });
  override(g.player, { camp: '群' }); override(g.ally, { camp: '群' });
  assert.equal(Engine.aiChooseCard(g, 'enemy'), null, 'only one effective camp: discard armor and retain Tao');
  override(g.player, { camp: '魏' }); override(g.ally, { camp: '蜀' });
  assert.equal(Engine.aiChooseCard(g, 'enemy').card.id, 'last-tao', 'three effective camps: heal before unavoidable discard');
});

test('AA2 all runtime attribute consumers route through effective getters; explicit static exceptions remain', () => {
  for (const file of ['engine/ai.js', 'engine/equipment.js', 'engine/sha-flow.js', 'engine/skills.js',
    'engine/damage-dying.js', 'ui/panels/board-panels.js', 'ui/panels/mode-panels.js']) {
    const source = fs.readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\.(?:camp|gender)\b/, file + ' must not read original identity fields');
  }
  const engine = fs.readFileSync(new URL('../src/engine/game-engine.js', import.meta.url), 'utf8');
  assert.deepEqual(engine.match(/\b\w+\.(?:camp|gender)\b/g), ['spec.camp']);
  const lobby = fs.readFileSync(new URL('../src/ui/panels/lobby-panels.js', import.meta.url), 'utf8');
  assert.ok((lobby.match(/\b\w+\.(?:camp|gender)\b/g) || []).every(ref => ref === 'hero.camp'));
});

runTests();
