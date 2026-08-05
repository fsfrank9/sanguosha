// v15 T: 火包 8 将 13 技行为测试 (引擎层)。
// 官方逐字来源 (official-skill-cache/gltjk-sanguosha-rules/pages/):
//   强袭 wei.md:319 / 驱虎 wei.md:333 / 节命 wei.md:335
//   八阵 shu.md:336 / 火计 shu.md:338 / 看破 shu.md:340
//   连环 shu.md:322 / 涅槃 shu.md:324 / 天义 wu.md:355
//   猛进 neutral.md:225 / 双雄 neutral.md:161 / 乱击 neutral.md:149
//   血裔 neutral.md:151
import assert from 'node:assert/strict';
import { Engine, c } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function buildDuel(playerHero, enemyHero = 'caocao', seed = 78001) {
  const game = Engine.newGame({ seed, playerHero, enemyHero });
  game.log = [];
  game.discard = [];
  game.deck = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'].map((id) => c('sha', { id }));
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

function build3(heroes, seed = 78050) {
  const game = Engine.newGame({
    seed,
    seats: ['player', 'enemy', 'ally'],
    roles: { player: '主公', enemy: '反贼', ally: '忠臣' },
    playerHero: heroes.player, enemyHero: heroes.enemy, allyHero: heroes.ally
  });
  game.log = []; game.discard = [];
  game.deck = ['d1', 'd2', 'd3', 'd4'].map((id) => c('sha', { id }));
  for (const seat of game.seats) {
    game[seat].hand = []; game[seat].judgeArea = []; game[seat].flags = {};
    game[seat].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[seat].hp = game[seat].maxHp; game[seat].skillPreferences = {};
  }
  game.turn = 'player';
  game.phase = 'play';
  return game;
}

// ───── 典韦 强袭 ─────

test('强袭: 失去 1 点体力对攻击范围内一名角色造成 1 点伤害; 每回合限一次', () => {
  const game = buildDuel('dianwei');
  assertCardConservation(game, () => {
    const result = Engine.useSkill(game, 'player', 'qiangxi', [], { target: 'enemy' });
    assert.equal(result.ok, true);
  });
  assert.equal(game.player.hp, game.player.maxHp - 1, '成本: 失去 1 点体力');
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, '目标受到 1 点伤害');
  assert.equal(Engine.useSkill(game, 'player', 'qiangxi', [], { target: 'enemy' }).ok, false,
    '每回合限一次');
});

test('强袭: 弃置武器牌作为成本 (走失去装备时机), 不失体力', () => {
  const game = buildDuel('dianwei');
  game.player.equipment.weapon = c('qinggang', { id: 'w1' });
  assertCardConservation(game, () => {
    Engine.useSkill(game, 'player', 'qiangxi', ['w1'], { target: 'enemy' });
  });
  assert.equal(game.player.hp, game.player.maxHp, '弃武器则不失体力');
  assert.equal(game.player.equipment.weapon, null, '武器已弃');
  assert.ok(game.discard.some((card) => card.id === 'w1'), '武器入弃牌堆');
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
});

test('强袭门槛: 目标须在攻击范围内; 成本牌须是自己的武器', () => {
  const game = build3({ player: 'dianwei', enemy: 'caocao', ally: 'liubei' });
  game.player.equipment.horseMinus = null;
  // 3 人环: 距离恒 1 → 均在范围内; 用手牌当成本应被拒
  game.player.hand = [c('sha', { id: 'not-weapon' })];
  const rejected = Engine.useSkill(game, 'player', 'qiangxi', ['not-weapon'], { target: 'enemy' });
  assert.equal(rejected.ok, false, '成本只能是装备区的武器牌');
  assert.equal(game.player.hand.length, 1, '零副作用');
});

test('强袭: 弃装备区武器作成本时不能再用该武器的攻击范围 (glossary__card.md:41)', () => {
  const game = Engine.newGame({
    seed: 78011,
    seats: ['player', 'enemy', 'ally', 'ally2', 'ally3'],
    roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '反贼', ally3: '内奸' },
    playerHero: 'dianwei', enemyHero: 'caocao', allyHero: 'liubei',
    ally2Hero: 'guanyu', ally3Hero: 'lvbu'
  });
  game.log = []; game.discard = [];
  for (const seat of game.seats) {
    game[seat].hand = []; game[seat].flags = {}; game[seat].judgeArea = [];
    game[seat].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[seat].hp = game[seat].maxHp; game[seat].skillPreferences = {};
  }
  game.turn = 'player'; game.phase = 'play';
  game.player.equipment.weapon = c('zhangba', { id: 'w-range3' }); // 攻击范围 3
  assert.equal(Engine.distanceBetween(game, 'player', 'ally2'), 2, '远席距离 2');
  const rejected = Engine.useSkill(game, 'player', 'qiangxi', ['w-range3'], { target: 'ally2' });
  assert.equal(rejected.ok, false, '弃掉这把武器后攻击范围回落到 1 → 远席不再合法');
  assert.ok(game.player.equipment.weapon, '拒绝路径零副作用: 武器仍在装备区');
  assert.equal(game.ally2.hp, game.ally2.maxHp);
  // 同一把武器不作成本 (改用失体力) 时, 其攻击范围照常可用
  const viaHp = Engine.useSkill(game, 'player', 'qiangxi', [], { target: 'ally2' });
  assert.equal(viaHp.ok, true, '失体力成本 → 武器射程照常生效');
  assert.equal(game.ally2.hp, game.ally2.maxHp - 1);
});

test('强袭: 手牌里的武器牌同样可作成本 (官方未限定区域)', () => {
  const game = buildDuel('dianwei');
  game.player.hand = [c('zhangba', { id: 'hand-weapon' })];
  assertCardConservation(game, () => {
    const result = Engine.useSkill(game, 'player', 'qiangxi', ['hand-weapon'], { target: 'enemy' });
    assert.equal(result.ok, true);
  });
  assert.equal(game.player.hp, game.player.maxHp, '弃手牌武器 → 不失体力');
  assert.ok(game.discard.some((card) => card.id === 'hand-weapon'));
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
});

// ───── 荀彧 驱虎 / 节命 ─────

test('驱虎: 赢 → 拼点目标对其攻击范围内由荀彧选择的角色造成 1 伤害 (不自伤)', () => {
  const game = build3({ player: 'xunyu', enemy: 'lvbu', ally: 'guanyu' });
  game.player.hand = [c('sha', { id: 'p-K', rank: 'K' })];
  game.enemy.hand = [c('sha', { id: 'e-3', rank: '3' })];
  assert.ok(game.enemy.hp > game.player.hp, '门槛: 目标体力值大于荀彧');
  Engine.useSkill(game, 'player', 'quhu', [], { target: 'enemy' });
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'p-K' }));
  assert.equal(game.player.hp, game.player.maxHp, '赢 → 荀彧不受伤');
  assert.equal(game.ally.hp, game.ally.maxHp - 1, '伤害落在荀彧选择的角色身上');
});

test('驱虎: 没赢 → 拼点目标对荀彧造成 1 点伤害', () => {
  const game = build3({ player: 'xunyu', enemy: 'lvbu', ally: 'guanyu' });
  game.player.hand = [c('sha', { id: 'p-2', rank: '2' })];
  game.enemy.hand = [c('sha', { id: 'e-K', rank: 'K' })];
  Engine.useSkill(game, 'player', 'quhu', [], { target: 'enemy' });
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'p-2' }));
  assert.equal(game.player.hp, game.player.maxHp - 1, '没赢 → 荀彧受 1 伤');
});

test('驱虎门槛: 目标体力值必须大于自己', () => {
  const game = buildDuel('xunyu');
  game.player.hand = [c('sha', { id: 'x' })];
  game.enemy.hand = [c('sha', { id: 'y' })];
  game.enemy.hp = game.player.hp;
  assert.equal(Engine.useSkill(game, 'player', 'quhu', [], { target: 'enemy' }).ok, false);
});

test('节命: 每受到 1 点伤害后令一名角色补手牌至 min(体力上限, 5)', () => {
  const game = buildDuel('xunyu');
  game.turn = 'enemy';
  game.player.hand = [];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'e-sha', { target: 'player' }));
  assert.equal(game.player.hand.length, Math.min(game.player.maxHp, 5), '补至体力上限张');
  assert.ok(game.log.some((line) => /发动【节命】/.test(line)));
});

test('节命: 手牌已达上限时不摸 ("补至"只摸不弃)', () => {
  const game = buildDuel('xunyu');
  game.turn = 'enemy';
  game.player.hand = ['h1', 'h2', 'h3', 'h4'].map((id) => c('shan', { id }));
  game.enemy.hand = [c('sha', { id: 'e-sha2' })];
  const before = game.player.hand.length;
  Engine.playCard(game, 'enemy', 'e-sha2', { target: 'player' });
  assert.ok(game.player.hand.length <= before, '不因节命弃牌, 也不超额补');
});

// ───── 卧龙诸葛亮 八阵 / 火计 / 看破 ─────

test('八阵: 装备区无防具 → 视为装备八卦阵 (需要闪时可判定)', () => {
  const game = buildDuel('wolong');
  game.turn = 'enemy';
  game.player.hand = [];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  // 判定牌为红 → 八阵视为打出闪
  game.deck = [c('tao', { id: 'judge-red', suit: 'heart', color: 'red' })];
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'e-sha', { target: 'player' }));
  assert.equal(game.player.hp, game.player.maxHp, '八阵判定红 → 闪避');
  assert.ok(game.log.some((line) => /【八卦阵】判定为红色/.test(line)));
});

test('八阵: 装备区有防具时让位 (官方"若你的装备区里没有防具牌")', () => {
  const game = buildDuel('wolong');
  game.player.equipment.armor = c('tengjia', { id: 'armor-1' });
  game.turn = 'enemy';
  game.player.hand = [];
  game.enemy.hand = [c('fire_sha', { id: 'e-fire' })]; // 火杀绕开藤甲免疫
  game.deck = [c('tao', { id: 'judge-red-2', suit: 'heart', color: 'red' })];
  Engine.playCard(game, 'enemy', 'e-fire', { target: 'player' });
  assert.ok(!game.log.some((line) => /【八卦阵】判定/.test(line)), '真防具在位 → 八阵不生效');
});

test('火计: 红色手牌当【火攻】使用 (限手牌)', () => {
  const game = buildDuel('wolong');
  game.player.hand = [c('tao', { id: 'red-1', suit: 'heart', color: 'red' }),
    c('sha', { id: 'black-1', suit: 'spade', color: 'black' })];
  game.enemy.hand = [c('sha', { id: 'e-hand', suit: 'heart', color: 'red' })];
  assert.deepEqual(Engine.listCardConversions(game, 'player', 'red-1').map((x) => x.asType),
    ['huogong'], '红牌可当火攻');
  assert.equal(Engine.listCardConversions(game, 'player', 'black-1').some((x) => x.asType === 'huogong'),
    false, '黑牌不可');
  assertCardConservation(game, () => {
    const result = Engine.playCardAs(game, 'player', 'red-1', 'huogong', { target: 'enemy' });
    assert.equal(result.ok, true);
  });
  assert.ok(game.log.some((line) => /发动【火计】/.test(line)));
});

test('看破: 黑色手牌当【无懈可击】使用 (候选/门槛/消费三处一致)', () => {
  const game = buildDuel('wolong');
  game.turn = 'enemy';
  game.player.skillPreferences.wuxieResponse = 'ask';
  game.player.hand = [c('sha', { id: 'black-sha', suit: 'spade', color: 'black' }),
    c('tao', { id: 'keep-red', suit: 'heart', color: 'red' })];
  game.enemy.hand = [c('guohe', { id: 'e-guohe' })];
  Engine.playCard(game, 'enemy', 'e-guohe', { target: 'player' });
  const pending = Engine.getPendingChoice(game);
  assert.ok(pending && pending.kind === 'wuxie-response');
  assert.deepEqual(pending.options.map((o) => o.cardId), ['black-sha'], '只有黑牌进候选');
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'black-sha' }));
  assert.ok(game.player.hand.some((card) => card.id === 'keep-red'), '过河拆桥被抵消');
  assert.ok(game.log.some((line) => /发动【看破】/.test(line)));
});

// ───── 庞统 连环 / 涅槃 ─────

test('连环: 梅花手牌当【铁索连环】使用', () => {
  const game = buildDuel('pangtong');
  game.player.hand = [c('tao', { id: 'club-1', suit: 'club', color: 'black' })];
  assertCardConservation(game, () => {
    const result = Engine.playCardAs(game, 'player', 'club-1', 'tiesuo', { targets: ['enemy'] });
    assert.equal(result.ok, true);
  });
  assert.equal(game.enemy.chained, true, '目标被横置');
});

test('连环: 可重铸梅花手牌 (弃置并摸一张); 非梅花不可重铸', () => {
  const game = buildDuel('pangtong');
  game.player.hand = [c('tao', { id: 'club-2', suit: 'club', color: 'black' }),
    c('tao', { id: 'heart-2', suit: 'heart', color: 'red' })];
  assert.equal(Engine.canRecastCard(game, 'player', 'club-2'), true);
  assert.equal(Engine.canRecastCard(game, 'player', 'heart-2'), false);
  assertCardConservation(game, () => {
    const result = Engine.playCard(game, 'player', 'club-2', { mode: 'recast' });
    assert.equal(result.ok, true);
  });
  assert.ok(game.discard.some((card) => card.id === 'club-2'), '重铸牌入弃牌堆');
  assert.equal(game.player.hand.length, 2, '弃一摸一');
});

test('连环: 非庞统不能重铸普通牌 (铁索自带重铸不受影响)', () => {
  const game = buildDuel('caocao', 'liubei');
  game.player.hand = [c('tao', { id: 'club-3', suit: 'club', color: 'black' }),
    c('tiesuo', { id: 'ts-1' })];
  assert.equal(Engine.canRecastCard(game, 'player', 'club-3'), false);
  assert.equal(Engine.canRecastCard(game, 'player', 'ts-1'), true, '铁索恒可重铸');
});

test('涅槃: 限定技 — 濒死时弃区域所有牌, 武将牌复原, 摸三张, 体力回复至 3', () => {
  const game = buildDuel('pangtong');
  game.player.hp = 1;
  game.player.hand = [c('tao', { id: 'h1' }), c('sha', { id: 'h2' })];
  game.player.equipment.weapon = c('qinggang', { id: 'w1' });
  game.player.judgeArea = [c('lebusishu', { id: 'j1' })];
  game.player.chained = true;
  game.player.turnedOver = true;
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'e-kill' })];
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'e-kill', { target: 'player' }));
  assert.equal(game.player.hp, 3, '体力回复至 3');
  assert.equal(game.player.hand.length, 3, '摸三张');
  assert.equal(game.player.equipment.weapon, null, '装备区清空');
  assert.equal(game.player.judgeArea.length, 0, '判定区清空');
  assert.equal(game.player.chained, false, '武将牌复原 (解除横置)');
  assert.equal(game.player.turnedOver, false, '武将牌复原 (翻回正面)');
  assert.equal(game.player.flags.niepanUsed, true, '限定技已用');
});

test('涅槃: 限定技每局一次 — 第二次濒死不再触发', () => {
  const game = buildDuel('pangtong');
  game.player.flags.niepanUsed = true;
  game.player.hp = 1;
  game.turn = 'enemy';
  game.player.hand = [];
  game.enemy.hand = [c('sha', { id: 'e-kill2' })];
  Engine.playCard(game, 'enemy', 'e-kill2', { target: 'player' });
  assert.ok(game.player.hp <= 0, '限定技已用尽 → 无法自救');
});

// ───── 太史慈 天义 ─────

test('天义: 赢 → 本回合杀次数上限 +1 / 无距离限制 / 额外目标上限 +1', () => {
  const game = buildDuel('taishici');
  game.player.hand = [c('sha', { id: 'p-K', rank: 'K' })];
  game.enemy.hand = [c('sha', { id: 'e-3', rank: '3' })];
  Engine.useSkill(game, 'player', 'tianyi', [], { target: 'enemy' });
  Engine.resolvePendingChoice(game, { cardId: 'p-K' });
  assert.equal(game.player.flags.tianyiWon, true);
  game.player.hand = [c('sha', { id: 's1' }), c('sha', { id: 's2' }), c('sha', { id: 's3' })];
  assert.equal(Engine.playCard(game, 'player', 's1', { target: 'enemy' }).ok, true, '第一张杀');
  assert.equal(Engine.playCard(game, 'player', 's2', { target: 'enemy' }).ok, true, '额外次数 +1');
  assert.equal(Engine.playCard(game, 'player', 's3', { target: 'enemy' }).ok, false, '超出上限');
});

test('天义: 没赢 → 本回合不能使用【杀】', () => {
  const game = buildDuel('taishici');
  game.player.hand = [c('sha', { id: 'p-2', rank: '2' })];
  game.enemy.hand = [c('sha', { id: 'e-K', rank: 'K' })];
  Engine.useSkill(game, 'player', 'tianyi', [], { target: 'enemy' });
  Engine.resolvePendingChoice(game, { cardId: 'p-2' });
  assert.equal(game.player.flags.tianyiLost, true);
  game.player.hand = [c('sha', { id: 'blocked-sha' })];
  const blocked = Engine.playCard(game, 'player', 'blocked-sha', { target: 'enemy' });
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /天义/, '拒绝理由指明天义');
});

// ───── 庞德 猛进 ─────

test('猛进: 杀被闪抵消 → 弃置目标一张牌 (AI 席自动, 装备区优先)', () => {
  const game = buildDuel('caocao', 'pangde');
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.player.hand = [c('shan', { id: 'p-shan' })];
  game.player.equipment.armor = c('bagua', { id: 'p-armor' });
  game.player.skillPreferences.bagua = 'decline';
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'e-sha', { target: 'player' }));
  assert.equal(game.player.hp, game.player.maxHp, '闪抵消了杀');
  assert.equal(game.player.equipment.armor, null, '猛进弃了装备 (auto 优先装备区)');
});

test('猛进: 玩家席经 mengjin-pick 选牌; 不发动则目标保牌', () => {
  const game = buildDuel('pangde');
  game.player.hand = [c('sha', { id: 'p-sha' })];
  game.enemy.hand = [c('shan', { id: 'e-shan' }), c('sha', { id: 'e-keep' })];
  Engine.playCard(game, 'player', 'p-sha', { target: 'enemy' });
  const pending = Engine.getPendingChoice(game);
  assert.ok(pending && pending.kind === 'mengjin-pick', '玩家席选牌窗');
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { decline: true }));
  assert.ok(game.enemy.hand.some((card) => card.id === 'e-keep'), '放弃 → 目标保牌');
});

test('猛进: 杀命中 (未被闪抵消) 不触发', () => {
  const game = buildDuel('pangde');
  game.player.hand = [c('sha', { id: 'p-sha-hit' })];
  game.enemy.hand = [c('sha', { id: 'e-keep2' })]; // 无闪
  Engine.playCard(game, 'player', 'p-sha-hit', { target: 'enemy' });
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, '杀命中');
  assert.ok(game.enemy.hand.some((card) => card.id === 'e-keep2'), '命中不触发猛进');
});

// ───── 颜良文丑 双雄 ─────

test('双雄: 摸牌阶段放弃摸牌改判定并获得判定牌; 本回合异色手牌可当决斗', () => {
  const game = buildDuel('yanliangwenchou');
  game.player.skillPreferences.shuangxiong = 'auto';
  game.player.hand = ['a', 'b', 'cc'].map((id) => c('sha', { id, suit: 'spade', color: 'black' }));
  game.deck = [c('tao', { id: 'judge-red', suit: 'heart', color: 'red' })];
  game.phase = 'judge';
  assertCardConservation(game, () => Engine.advancePhase(game));
  assert.ok(game.player.hand.some((card) => card.id === 'judge-red'), '获得判定牌');
  assert.equal(game.player.flags.shuangxiongColor, 'red', '记录判定牌颜色');
  Engine.advancePhase(game); // → 出牌阶段
  assert.ok(Engine.listCardConversions(game, 'player', 'a').some((x) => x.asType === 'juedou'),
    '黑色手牌 (与红色判定牌异色) 可当决斗');
  assert.equal(Engine.listCardConversions(game, 'player', 'judge-red').some((x) => x.asType === 'juedou'),
    false, '同色牌不可');
});

// ───── 袁绍 乱击 / 血裔 ─────

test('乱击: 两张同花色手牌当【万箭齐发】; 异花色拒绝', () => {
  const game = buildDuel('yuanshao', 'liubei');
  game.player.hand = [c('tao', { id: 's1', suit: 'spade', color: 'black' }),
    c('tao', { id: 's2', suit: 'spade', color: 'black' }),
    c('tao', { id: 'h1', suit: 'heart', color: 'red' })];
  assert.equal(Engine.useSkill(game, 'player', 'luanji', ['s1', 'h1']).ok, false, '异花色拒绝');
  assert.equal(game.player.hand.length, 3, '零副作用');
  assertCardConservation(game, () => {
    const result = Engine.useSkill(game, 'player', 'luanji', ['s1', 's2']);
    assert.equal(result.ok, true);
  });
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, '万箭齐发命中');
  assert.ok(game.discard.some((card) => card.id === 's1'), '两张组成实体入弃牌堆');
  assert.ok(game.discard.some((card) => card.id === 's2'));
});

test('血裔: 主公技锁定技 — 手牌上限 +2X (X=存活的其他群势力角色数)', () => {
  const game = build3({ player: 'yuanshao', enemy: 'lvbu', ally: 'guanyu' });
  // 袁绍为主公 (群); 吕布=群, 关羽=蜀 → X=1 → 上限 +2
  assert.equal(game.enemy.camp, '群');
  assert.equal(Engine.handLimit(game, 'player'), game.player.hp + 2, '+2X (X=1)');
  game.enemy.hp = 0; // 群势力角色阵亡 → X=0
  assert.equal(Engine.handLimit(game, 'player'), game.player.hp, '阵亡角色不计入 X');
});

test('血裔: X 只数群势力 — 非群对手 → +0; 1v1 中袁绍为主公时照常按 X 计', () => {
  // 1v1 同样分配身份 (player=主公 / enemy=反贼), 血裔不需要同势力队友,
  // 故在 1v1 中按规则照常生效 — 与激将/护驾那类"需要同势力座席"的主公技
  // 天然惰性不同。
  const qunFoe = buildDuel('yuanshao', 'lvbu');
  assert.equal(qunFoe.enemy.camp, '群');
  assert.equal(Engine.handLimit(qunFoe, 'player'), qunFoe.player.hp + 2, '群对手 → X=1');

  const shuFoe = buildDuel('yuanshao', 'liubei');
  assert.equal(shuFoe.enemy.camp, '蜀');
  assert.equal(Engine.handLimit(shuFoe, 'player'), shuFoe.player.hp, '非群 → X=0');
});

test('血裔: 非主公时不生效 (主公技)', () => {
  const game = build3({ player: 'liubei', enemy: 'yuanshao', ally: 'lvbu' });
  // 袁绍在此局为反贼 → 主公技不生效 (其他群势力角色: 吕布)
  assert.equal(game.roles.enemy !== '主公', true);
  assert.equal(Engine.handLimit(game, 'enemy'), game.enemy.hp, '非主公 → +0');
});

await runTests();

console.log('\nv15 T 火包 13 技行为用例通过。');
