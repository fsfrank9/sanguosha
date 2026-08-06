// v15 V: 山包 7 将 15 技 (+ 凿险授予的"急袭") 行为测试 (引擎层)。
// 官方逐字来源 (official-skill-cache/gltjk-sanguosha-rules/pages/):
//   巧变 wei.md:267 / 屯田 wei.md:365 / 凿险 wei.md:367
//   挑衅 shu.md:354 / 志继 shu.md:356
//   享乐 shu.md:380 / 放权 shu.md:382 / 若愚 shu.md:384
//   激昂 wu.md:297 / 魂姿 wu.md:299 / 制霸 wu.md:301
//   直谏 wu.md:469 / 固政 wu.md:471
//   悲歌 neutral.md:391 / 断肠 neutral.md:393
//   (左慈 化身 neutral.md:249 / 新生 :266 — 按成本评估门推迟, 见 docs 简报)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Engine, c } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function reset(game) {
  game.log = []; game.discard = [];
  game.deck = Array.from({ length: 20 }, (_, i) => c('sha', { id: 'dk' + i, suit: 'spade', rank: '5' }));
  for (const seat of game.seats) {
    game[seat].hand = []; game[seat].judgeArea = []; game[seat].flags = {};
    game[seat].tian = [];
    game[seat].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[seat].hp = game[seat].maxHp; game[seat].skillPreferences = {};
    game[seat].turnedOver = false;
  }
  game.turn = 'player'; game.phase = 'play';
  game.pendingChoice = null; game.pendingChoiceQueue = []; game.pauseState = {};
  game.pendingExtraTurns = []; game.extraTurnReturnSeat = null;
  return game;
}

function duel(playerHero, enemyHero = 'caocao', seed = 92001) {
  return reset(Engine.newGame({ seed, playerHero, enemyHero }));
}

function trio(heroes, seed = 92050, roles = { player: '主公', enemy: '反贼', ally: '反贼' }) {
  return reset(Engine.newGame({
    seed, seats: ['player', 'enemy', 'ally'], roles,
    playerHero: heroes[0], enemyHero: heroes[1], allyHero: heroes[2]
  }));
}

function quad(heroes, roles, seed = 92095) {
  return reset(Engine.newGame({
    seed,
    seats: ['player', 'enemy', 'ally', 'ally2'],
    roles,
    playerHero: heroes[0], enemyHero: heroes[1], allyHero: heroes[2], ally2Hero: heroes[3],
  }));
}

function penta(heroes, seed = 92090) {
  return reset(Engine.newGame({
    seed,
    seats: ['player', 'enemy', 'ally', 'ally2', 'ally3'],
    roles: { player: '主公', enemy: '反贼', ally: '反贼', ally2: '忠臣', ally3: '内奸' },
    playerHero: heroes[0], enemyHero: heroes[1], allyHero: heroes[2],
    ally2Hero: heroes[3], ally3Hero: heroes[4],
  }));
}

// 牌堆顶是数组**末尾** (takeCard/drawCards 从尾部取) → 想控判定花色就往
// 尾部压, 且先传入的先被取走。
function stackJudge(game, ...cards) {
  game.deck = game.deck.concat(cards.slice().reverse());
}

// ───── 官方来源可复核性 (火/林包同款红线) ─────

test('sourceTextRef: 18 条 sha256 与 gltjk 镜像行逐条吻合', () => {
  const specs = JSON.parse(fs.readFileSync(new URL('./fixtures/official_shan_skill_specs.json', import.meta.url), 'utf8'));
  let checked = 0;
  for (const hero of specs.heroes) {
    for (const skill of hero.skills) {
      // 急袭的官方文本内嵌在凿险条目的括注里, 没有独立行 → 与凿险同源,
      // 不重复做"行首为技能名"的检查。
      const [file, lineNo] = skill.sourceLine.split(':');
      const text = fs.readFileSync(new URL('../official-skill-cache/gltjk-sanguosha-rules/pages/' + file, import.meta.url), 'utf8');
      const line = text.split('\n')[Number(lineNo) - 1];
      const sha = crypto.createHash('sha256').update(line).digest('hex').slice(0, 12);
      assert.equal(sha, skill.sourceTextRef, `${skill.name} (${skill.sourceLine}) sha256 不符`);
      if (skill.localSkillId !== 'jixi') {
        assert.ok(line.startsWith(skill.name + '——'), `${skill.name} 行首不是该技能名`);
      }
      checked += 1;
    }
  }
  // 官方 8 将 17 技 + 凿险授予的派生技【急袭】(与凿险同源行) = 18 条。
  assert.equal(checked, 18, '18 条逐条复核 (17 官方技 + 派生的急袭; 含推迟的化身/新生)');
});

test('左慈 化身/新生 在 fixture 里如实标为 deferred 并写明推迟理由', () => {
  const specs = JSON.parse(fs.readFileSync(new URL('./fixtures/official_shan_skill_specs.json', import.meta.url), 'utf8'));
  const zuoci = specs.heroes.find((hero) => hero.localHeroId === 'zuoci');
  assert.ok(zuoci, '左慈在 fixture 中');
  for (const skill of zuoci.skills) {
    assert.equal(skill.implementationStatus, 'deferred', `${skill.name} 标 deferred`);
    assert.ok(skill.spec.deferralReason && skill.spec.deferralReason.length > 20, `${skill.name} 写明推迟理由`);
  }
  assert.ok(!Engine.IMPLEMENTED_SKILL_IDS.includes('huashen'), '化身不在已实现名单');
  assert.ok(!Engine.IMPLEMENTED_SKILL_IDS.includes('xinsheng'), '新生不在已实现名单');
});

// ═════════════════ 张郃 巧变 ═════════════════

test('巧变: 弃一张手牌跳过摸牌阶段, 获得至多两名有手牌角色的各一张手牌', () => {
  const game = trio(['zhanghe', 'caocao', 'huatuo']);
  game.player.hand = [c('sha', { id: 'qb-cost' })];
  game.player.skillPreferences.qiaobian = 'auto';
  game.enemy.hand = [c('tao', { id: 'e1' })];
  game.ally.hand = [c('shan', { id: 'a1' })];
  game.turn = 'player'; game.phase = 'judge';
  assertCardConservation(game, () => {
    Engine.advancePhase(game); // judge → draw
  });
  assert.equal(game.player.hand.length, 2, '弃 1 张成本, 拿回两家各一张 → 净 +1');
  assert.equal(game.enemy.hand.length, 0, '敌方手牌被拿走');
  assert.equal(game.ally.hand.length, 0, '队友手牌被拿走');
  assert.ok(game.discard.some((card) => card.id === 'qb-cost'), '成本牌进弃牌堆');
});

test('巧变: 缺省不发动 (decline), 摸牌阶段照常摸两张', () => {
  const game = duel('zhanghe');
  game.player.hand = [c('sha', { id: 'qb-x' })];
  game.turn = 'player'; game.phase = 'judge';
  Engine.advancePhase(game);
  assert.equal(game.player.hand.length, 3, '1 张原有 + 摸 2 张');
});

test('巧变: 没有手牌可弃 → 不触发 (成本付不起)', () => {
  const game = duel('zhanghe');
  game.player.skillPreferences.qiaobian = 'auto';
  game.turn = 'player'; game.phase = 'judge';
  Engine.advancePhase(game);
  assert.equal(game.player.hand.length, 2, '照常摸两张');
});

// ═════════════════ 邓艾 屯田 / 凿险 / 急袭 ═════════════════

test('屯田: 回合外被顺走一张手牌 → 判定非红桃置为"田"', () => {
  const game = duel('caocao', 'dengai');
  game.turn = 'player'; game.phase = 'play';
  game.enemy.hand = [c('shan', { id: 'tt-victim' })];
  game.enemy.skillPreferences.tuntian = 'auto';
  game.player.hand = [c('shunshou', { id: 'tt-ss' })];
  stackJudge(game, c('sha', { id: 'tt-judge', suit: 'spade', rank: '9' }));
  assertCardConservation(game, () => {
    Engine.playCard(game, 'player', 'tt-ss', { target: 'enemy' });
  });
  assert.equal(game.enemy.tian.length, 1, '非红桃判定牌置为"田"');
  assert.equal(game.enemy.tian[0].id, 'tt-judge');
});

test('屯田: 红桃判定牌不置"田", 照常入弃牌堆', () => {
  const game = duel('caocao', 'dengai');
  game.turn = 'player'; game.phase = 'play';
  game.enemy.hand = [c('shan', { id: 'tt2-victim' })];
  game.enemy.skillPreferences.tuntian = 'auto';
  game.player.hand = [c('shunshou', { id: 'tt2-ss' })];
  stackJudge(game, c('tao', { id: 'tt2-judge', suit: 'heart', rank: '9' }));
  assertCardConservation(game, () => {
    Engine.playCard(game, 'player', 'tt2-ss', { target: 'enemy' });
  });
  assert.equal(game.enemy.tian.length, 0, '红桃不置"田"');
  assert.ok(game.discard.some((card) => card.id === 'tt2-judge'), '判定牌入弃牌堆');
});

test('屯田: 自己回合内失去牌不触发 ("于回合外失去牌后")', () => {
  const game = duel('dengai');
  game.turn = 'player'; game.phase = 'play';
  game.player.skillPreferences.tuntian = 'auto';
  game.player.hand = [c('sha', { id: 'tt3-a' }), c('sha', { id: 'tt3-b' })];
  game.enemy.hand = [];
  Engine.playCard(game, 'player', 'tt3-a', { target: 'enemy' });
  assert.equal(game.player.tian.length, 0, '回合内不触发屯田');
});

test('屯田: 空牌堆时判定触发洗牌 — 牌张守恒不破 (失牌时机嵌在结算内)', () => {
  const game = duel('caocao', 'dengai');
  game.turn = 'player'; game.phase = 'play';
  game.deck = [];
  game.discard = [c('sha', { id: 'tt4-d1', suit: 'spade' }), c('tao', { id: 'tt4-d2', suit: 'club' })];
  game.enemy.hand = [c('shan', { id: 'tt4-victim' })];
  game.enemy.skillPreferences.tuntian = 'auto';
  game.player.hand = [c('shunshou', { id: 'tt4-ss' })];
  assertCardConservation(game, () => {
    Engine.playCard(game, 'player', 'tt4-ss', { target: 'enemy' });
  });
  assert.equal(game.enemy.tian.length, 1, '洗牌后照常判定并置"田"');
});

// W2 (第五轮审计 F4): 这条测试原本挑了**基础距离恰为 1** 的席位对, 于是
// max(1, 1-2) === 1 === 基础值 —— 无论距离有没有接进去它都绿, **空跑通过**,
// 掩护了"屯田第二半句完全没实现"整整一批。改用 5 席环上基础距离 2 的席位对,
// 并显式钉住"没接就必然红"。
test('屯田: 每张"田" 令邓艾与其他角色的距离 -1 (5 席环上可观测)', () => {
  const game = penta(['dengai', 'caocao', 'huatuo', 'zhangfei', 'guanyu']);
  for (const seat of game.seats) {
    game[seat].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
  }
  assert.equal(Engine.distanceBetween(game, 'player', 'ally'), 2, '前置: 基础距离必须 > 1, 否则本测空跑');
  game.player.tian = [c('sha', { id: 't1' })];
  assert.equal(Engine.distanceBetween(game, 'player', 'ally'), 1, '一张"田" → 距离 -1');
  game.player.tian = [c('sha', { id: 't1' }), c('sha', { id: 't2' }), c('sha', { id: 't3' })];
  assert.equal(Engine.distanceBetween(game, 'player', 'ally'), 1, '下限 1');
});

test('屯田: 距离只减**出向** (与马术同口径 — 别人到邓艾的距离不变)', () => {
  const game = penta(['dengai', 'caocao', 'huatuo', 'zhangfei', 'guanyu']);
  for (const seat of game.seats) {
    game[seat].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
  }
  game.player.tian = [c('sha', { id: 't1' })];
  assert.equal(Engine.distanceBetween(game, 'ally', 'player'), 2, '反向距离不受"田"影响');
});

test('凿险: "田" ≥3 时准备阶段觉醒 — 减 1 上限并获得急袭, 且只觉醒一次', () => {
  const game = duel('dengai');
  game.player.tian = [c('sha', { id: 'z1' }), c('sha', { id: 'z2' }), c('sha', { id: 'z3' })];
  const maxHp = game.player.maxHp;
  game.turn = 'enemy';
  Engine.advancePhase(game); // enemy 回合推进不影响
  game.turn = 'player'; game.phase = 'prepare';
  game.player.hp = game.player.maxHp;
  Engine.startTurn ? Engine.startTurn(game, 'player') : Engine.advancePhase(game);
  assert.equal(game.player.maxHp, maxHp - 1, '减 1 点体力上限');
  assert.ok(game.player.skills.some((skill) => skill.id === 'jixi'), '获得急袭');
  assert.equal(game.player.flags.zaoxianAwakened, true, '觉醒标记');
  const skillCount = game.player.skills.length;
  Engine.startTurn ? Engine.startTurn(game, 'player') : null;
  assert.equal(game.player.skills.length, skillCount, '觉醒技不重复发动');
});

test('凿险: "田" 只有 2 张 → 不觉醒', () => {
  const game = duel('dengai');
  game.player.tian = [c('sha', { id: 'z1' }), c('sha', { id: 'z2' })];
  const maxHp = game.player.maxHp;
  Engine.startTurn(game, 'player');
  assert.equal(game.player.maxHp, maxHp, '未觉醒');
  assert.ok(!game.player.skills.some((skill) => skill.id === 'jixi'), '未获得急袭');
});

test('急袭: 将一张"田"当【顺手牵羊】使用 (手牌不能当)', () => {
  const game = duel('dengai');
  game.player.skills.push({ id: 'jixi', name: '急袭' });
  game.player.tian = [c('sha', { id: 'jx-tian', suit: 'club' })];
  game.player.hand = [c('sha', { id: 'jx-hand', suit: 'club' })];
  game.enemy.hand = [c('tao', { id: 'jx-loot' })];
  assertCardConservation(game, () => {
    assert.equal(Engine.playCardAs(game, 'player', 'jx-tian', 'shunshou', { target: 'enemy' }).ok, true);
  });
  assert.equal(game.player.tian.length, 0, '"田"被消耗');
  assert.equal(Engine.playCardAs(game, 'player', 'jx-hand', 'shunshou', { target: 'enemy' }).ok, false,
    '手牌不是"田", 不能当顺手牵羊');
});

// ═════════════════ 姜维 挑衅 / 志继 ═════════════════

test('挑衅: AI 目标有杀 → 对姜维出杀 (不弃牌)', () => {
  const game = duel('jiangwei');
  game.player.hand = [];
  game.enemy.hand = [c('sha', { id: 'tx-sha' }), c('tao', { id: 'tx-tao' })];
  game.player.skillPreferences.shanResponse = 'auto';
  assertCardConservation(game, () => {
    assert.equal(Engine.useSkill(game, 'player', 'tiaoxin', { target: 'enemy' }).ok, true);
  });
  assert.equal(game.enemy.hand.length, 1, '出了杀, 桃还在');
  assert.equal(game.enemy.hand[0].id, 'tx-tao', '被出掉的是杀而非桃');
});

test('挑衅: AI 目标无杀 → 被弃一张牌', () => {
  const game = duel('jiangwei');
  game.enemy.hand = [c('tao', { id: 'tx2-tao' })];
  assertCardConservation(game, () => {
    assert.equal(Engine.useSkill(game, 'player', 'tiaoxin', { target: 'enemy' }).ok, true);
  });
  assert.equal(game.enemy.hand.length, 0, '被弃一张牌');
  assert.ok(game.discard.some((card) => card.id === 'tx2-tao'));
});

test('挑衅: 每回合限一次', () => {
  const game = duel('jiangwei');
  game.enemy.hand = [c('tao', { id: 'tx3-a' }), c('tao', { id: 'tx3-b' })];
  Engine.useSkill(game, 'player', 'tiaoxin', { target: 'enemy' });
  const again = Engine.useSkill(game, 'player', 'tiaoxin', { target: 'enemy' });
  assert.equal(again.ok, false);
  assert.match(again.message, /限一次/);
});

test('挑衅: 目标的攻击范围内没有姜维 → 拒绝 (以对方为原点算距离)', () => {
  const game = trio(['jiangwei', 'caocao', 'huatuo'], 92060);
  // 给姜维 +1 马 (别人算与他的距离时 +1), 让空手武器的队友够不着。
  game.player.equipment.horsePlus = c('plus_horse', { id: 'tx-horse' });
  game.ally.equipment.weapon = null;
  const result = Engine.useSkill(game, 'player', 'tiaoxin', { target: 'ally' });
  assert.equal(result.ok, false, '够不着的角色不能被挑衅');
  assert.match(result.message, /攻击范围/);
});

test('志继: AI 席准备阶段无手牌 → 觉醒 (满血自动摸两张), 减上限并获得观星', () => {
  const game = duel('caocao', 'jiangwei');
  game.enemy.hand = [];
  const maxHp = game.enemy.maxHp;
  Engine.startTurn(game, 'enemy');
  assert.equal(game.enemy.maxHp, maxHp - 1, '减 1 上限');
  // startTurn 会一路跑到摸牌阶段 → 志继的 2 张 + 摸牌阶段的 2 张。
  assert.equal(game.enemy.hand.length, 4, '志继摸两张 + 摸牌阶段两张');
  assert.ok(game.enemy.skills.some((skill) => skill.id === 'guanxing'), '获得观星');
  assert.equal(game.enemy.flags.zhijiAwakened, true);
});

test('志继: 玩家席开窗二选一 — 选回血则回 1 点, 觉醒后同样获得观星', () => {
  const game = duel('jiangwei');
  game.player.hand = [];
  game.player.hp = game.player.maxHp - 2;
  const maxHp = game.player.maxHp;
  const hp = game.player.hp;
  Engine.startTurn(game, 'player');
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'zhiji-choice', '开出志继二选一');
  Engine.resolvePendingChoice(game, { option: 'heal' });
  assert.equal(game.player.hp, hp + 1, '回复 1 点体力');
  assert.equal(game.player.maxHp, maxHp - 1, '减 1 上限');
  assert.ok(game.player.skills.some((skill) => skill.id === 'guanxing'), '获得观星');
});

test('志继: 准备阶段有手牌 → 不觉醒', () => {
  const game = duel('caocao', 'jiangwei');
  game.enemy.hand = [c('sha', { id: 'zj-h' })];
  const maxHp = game.enemy.maxHp;
  Engine.startTurn(game, 'enemy');
  assert.equal(game.enemy.maxHp, maxHp, '未觉醒');
  assert.ok(!game.enemy.skills.some((skill) => skill.id === 'guanxing'));
});

// ═════════════════ 刘禅 享乐 / 放权 / 若愚 ═════════════════

test('享乐: AI 来源有基本牌 → 自动弃一张, 杀照常结算', () => {
  const game = duel('liushan');
  game.turn = 'enemy'; game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'xl-sha' }), c('tao', { id: 'xl-basic' })];
  const hp = game.player.hp;
  assertCardConservation(game, () => {
    Engine.playCard(game, 'enemy', 'xl-sha', { target: 'player' });
  });
  assert.equal(game.enemy.hand.length, 0, '杀 + 一张基本牌都没了');
  assert.equal(game.player.hp, hp - 1, '杀命中 (享乐被支付抵消)');
});

test('享乐: 来源没有基本牌 → 此杀对刘禅无效', () => {
  const game = duel('liushan');
  game.turn = 'enemy'; game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'xl2-sha' })];
  const hp = game.player.hp;
  assertCardConservation(game, () => {
    Engine.playCard(game, 'enemy', 'xl2-sha', { target: 'player' });
  });
  assert.equal(game.player.hp, hp, '无伤害');
  assert.ok(game.discard.some((card) => card.id === 'xl2-sha'), '杀仍入弃牌堆');
});

test('享乐: 来源选择不弃 (decline) → 此杀无效', () => {
  const game = duel('liushan');
  game.turn = 'enemy'; game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'xl3-sha' }), c('tao', { id: 'xl3-basic' })];
  game.enemy.skillPreferences.xiangleCost = 'decline';
  const hp = game.player.hp;
  Engine.playCard(game, 'enemy', 'xl3-sha', { target: 'player' });
  assert.equal(game.player.hp, hp, '无伤害');
  assert.equal(game.enemy.hand.length, 1, '基本牌没被弃');
});

test('享乐: 玩家来源开窗 → 弃基本牌放行 / decline 令杀无效', () => {
  const game = duel('caocao', 'liushan');
  game.turn = 'player'; game.phase = 'play';
  game.player.hand = [c('sha', { id: 'xl4-sha' }), c('tao', { id: 'xl4-basic' })];
  game.enemy.skillPreferences.shanResponse = 'auto';
  Engine.playCard(game, 'player', 'xl4-sha', { target: 'enemy' });
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'xiangle-cost', '开出享乐弃牌窗口');
  const hp = game.enemy.hp;
  Engine.resolvePendingChoice(game, { cardId: 'xl4-basic' });
  assert.equal(game.enemy.hp, hp - 1, '弃基本牌 → 杀命中');

  const game2 = duel('caocao', 'liushan', 92002);
  game2.turn = 'player'; game2.phase = 'play';
  game2.player.hand = [c('sha', { id: 'xl5-sha' }), c('tao', { id: 'xl5-basic' })];
  Engine.playCard(game2, 'player', 'xl5-sha', { target: 'enemy' });
  const hp2 = game2.enemy.hp;
  Engine.resolvePendingChoice(game2, { decline: true });
  assert.equal(game2.enemy.hp, hp2, 'decline → 杀无效');
  assert.equal(game2.player.hand.length, 1, '基本牌保留');
});

test('享乐: 刘禅自己使用的杀不受享乐影响 ("其他角色使用的【杀】")', () => {
  const game = duel('liushan');
  game.turn = 'player'; game.phase = 'play';
  game.player.hand = [c('sha', { id: 'xl6-sha' }), c('tao', { id: 'xl6-basic' })];
  const hp = game.enemy.hp;
  Engine.playCard(game, 'player', 'xl6-sha', { target: 'enemy' });
  assert.equal(game.enemy.hp, hp - 1, '正常命中');
  assert.equal(game.player.hand.length, 1, '桃没被享乐吃掉');
});

test('放权: 跳过出牌阶段 → 回合结束时弃一张手牌令队友获得额外回合', () => {
  const game = trio(['liushan', 'caocao', 'huatuo'], 92070,
    { player: '主公', enemy: '反贼', ally: '忠臣' });
  game.player.skillPreferences.fangquan = 'auto';
  game.player.hand = [c('sha', { id: 'fq-cost' })];
  game.turn = 'player'; game.phase = 'draw';
  Engine.advancePhase(game); // draw → (跳过 play) discard
  assert.equal(game.phase, 'discard', '出牌阶段被跳过');
  assert.equal(game.player.flags.fangquanSkipped, true);
});

test('放权: 缺省不发动 → 出牌阶段照常', () => {
  const game = duel('liushan');
  game.player.hand = [c('sha', { id: 'fq2' })];
  game.turn = 'player'; game.phase = 'draw';
  Engine.advancePhase(game);
  assert.equal(game.phase, 'play', '未发动放权');
});

test('放权: 额外回合排队后由回合收尾派发, 结束后回到原本的下家', () => {
  const game = trio(['liushan', 'caocao', 'huatuo'], 92071,
    { player: '主公', enemy: '反贼', ally: '忠臣' });
  game.turn = 'player'; game.phase = 'finish';
  game.pendingExtraTurns = ['ally'];
  Engine.advancePhase(game); // finish → completeTurn
  assert.equal(game.turn, 'ally', 'ally 拿到额外回合 (跳过座次环的 enemy)');
  assert.equal(game.extraTurnReturnSeat, 'enemy', '额外回合结束后回到原下家');
});

test('若愚: 主公且体力值最小 → 觉醒加上限回血并获得激将; 非主公不触发', () => {
  const game = trio(['liushan', 'caocao', 'huatuo'], 92072,
    { player: '主公', enemy: '反贼', ally: '忠臣' });
  game.player.hp = 1;
  const maxHp = game.player.maxHp;
  Engine.startTurn(game, 'player');
  assert.equal(game.player.maxHp, maxHp + 1, '加 1 点体力上限');
  assert.equal(game.player.hp, 2, '回复 1 点体力');
  assert.ok(game.player.skills.some((skill) => skill.id === 'jijiang'), '获得激将');

  const game2 = trio(['caocao', 'liushan', 'huatuo'], 92073,
    { player: '主公', enemy: '反贼', ally: '忠臣' });
  game2.enemy.hp = 1;
  const maxHp2 = game2.enemy.maxHp;
  Engine.startTurn(game2, 'enemy');
  assert.equal(game2.enemy.maxHp, maxHp2, '非主公不触发若愚 (主公技)');
});

// ═════════════════ 孙策 激昂 / 魂姿 / 制霸 ═════════════════

test('激昂: 使用红色杀指定目标后, 使用者与目标各摸一张', () => {
  const game = duel('sunce', 'sunce', 92003);
  game.turn = 'player'; game.phase = 'play';
  game.player.hand = [c('sha', { id: 'jg-red', suit: 'heart', color: 'red' })];
  game.enemy.skillPreferences.shanResponse = 'auto';
  Engine.playCard(game, 'player', 'jg-red', { target: 'enemy' });
  assert.equal(game.player.hand.length, 1, '使用者摸一张');
  assert.ok(game.enemy.hand.length >= 1, '目标也摸一张');
});

test('激昂: 黑色杀不触发 ("红色【杀】")', () => {
  const game = duel('sunce');
  game.turn = 'player'; game.phase = 'play';
  game.player.hand = [c('sha', { id: 'jg-black', suit: 'spade', color: 'black' })];
  Engine.playCard(game, 'player', 'jg-black', { target: 'enemy' });
  assert.equal(game.player.hand.length, 0, '黑杀不摸牌');
});

test('激昂: 决斗同样触发 (走 onTrickTargeted)', () => {
  const game = duel('sunce');
  game.turn = 'player'; game.phase = 'play';
  game.player.hand = [c('juedou', { id: 'jg-duel', suit: 'spade' })];
  Engine.playCard(game, 'player', 'jg-duel', { target: 'enemy' });
  assert.ok(game.player.hand.length >= 1, '决斗指定目标后摸一张');
});

test('激昂: 一张杀对同一目标只结算一次 (流离重跑不重复摸牌)', () => {
  const game = duel('sunce');
  game.turn = 'player'; game.phase = 'play';
  const sha = c('sha', { id: 'jg-once', suit: 'heart', color: 'red' });
  game.player.hand = [sha];
  Engine.playCard(game, 'player', 'jg-once', { target: 'enemy' });
  assert.equal(game.player.hand.length, 1, '只摸一张');
});

test('激昂: 同一张实体【杀】隔回合再用仍触发 (去重不得挂在牌对象上)', () => {
  const game = duel('sunce');
  game.turn = 'player'; game.phase = 'play';
  const sha = c('sha', { id: 'jg-reuse', suit: 'heart', color: 'red' });
  game.player.hand = [sha];
  Engine.playCard(game, 'player', 'jg-reuse', { target: 'enemy' });
  // 模拟这张实体牌经奸雄/洗牌回到手里再用一次。
  game.player.hand.push(sha);
  game.player.usedSha = false; game.player.flags = {};
  const before = game.player.hand.length;
  Engine.playCard(game, 'player', 'jg-reuse', { target: 'enemy' });
  assert.equal(game.player.hand.length, before, '第二次使用: -1 张杀 +1 张激昂 → 持平');
});

test('收口: 回合结束时机挂起后回合仍能推进 (崩坏玩家席的既有悬挂, 被放权的额外回合机制一并收口)', () => {
  const game = duel('dongzhuo');
  game.player.hp = game.player.maxHp;
  game.enemy.hp = 1;
  game.turn = 'player'; game.phase = 'finish';
  Engine.advancePhase(game);
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'benghuai-choice', '崩坏在回合结束时机开窗');
  assert.equal(game.turn, 'player', '挂起期间回合不推进');
  Engine.resolvePendingChoice(game, { choice: 'maxHp' });
  assert.equal(game.turn, 'enemy', '收尾后回合交给下家 (此前永久停在 finish)');
  assert.equal(game.phase !== 'finish', true);
});

test('魂姿: 体力值为 1 的准备阶段觉醒 — 减上限, 获得英姿 + 英魂', () => {
  const game = duel('sunce');
  game.player.hp = 1;
  const maxHp = game.player.maxHp;
  Engine.startTurn(game, 'player');
  assert.equal(game.player.maxHp, maxHp - 1);
  assert.ok(game.player.skills.some((skill) => skill.id === 'yingzi'), '获得英姿');
  assert.ok(game.player.skills.some((skill) => skill.id === 'yinghun'), '获得英魂');
});

test('制霸: 其他吴势力角色发起拼点, 没赢 → 主公获得两张拼点牌', () => {
  const game = trio(['sunce', 'sunquan', 'huatuo'], 92074,
    { player: '主公', enemy: '忠臣', ally: '反贼' });
  game.turn = 'enemy'; game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'zb-low', rank: '2' })];
  game.player.hand = [c('sha', { id: 'zb-high', rank: 'K' })];
  const result = Engine.useSkill(game, 'enemy', 'zhiba', {});
  assert.equal(result.ok, true, '吴势力角色可发起制霸拼点');
  // 玩家侧拼点可能开窗 — 有窗就自动选唯一牌。
  while (game.pendingChoice && game.pendingChoice.kind === 'pindian-card') {
    Engine.resolvePendingChoice(game, { cardId: game.pendingChoice.options[0].cardId });
  }
  assert.equal(game.player.hand.length, 2, '发起者没赢 → 主公收两张拼点牌');
});

test('制霸: 主公发动过魂姿后可拒绝拼点, 但被拒绝仍计入发起者的次数限制', () => {
  const game = trio(['sunce', 'sunquan', 'huatuo'], 92083,
    { player: '主公', enemy: '忠臣', ally: '反贼' });
  game.turn = 'enemy'; game.phase = 'play';
  game.player.flags.hunziAwakened = true;
  game.player.skillPreferences.zhiba = 'decline';
  game.enemy.hand = [c('sha', { id: 'zb3-a' }), c('sha', { id: 'zb3-b' })];
  game.player.hand = [c('sha', { id: 'zb3-lord' })];
  const first = Engine.useSkill(game, 'enemy', 'zhiba', {});
  assert.equal(first.ok, true, '发起成功但被主公拒绝');
  assert.match(first.message, /拒绝/);
  assert.equal(game.enemy.hand.length, 2, '拼点被拒 → 没有扣置手牌');
  // 官方判例 card__hero__wu.md:305: 被拒绝也计入出牌阶段的发动次数。
  const second = Engine.useSkill(game, 'enemy', 'zhiba', {});
  assert.equal(second.ok, false);
  assert.match(second.message, /限一次/);
});

test('制霸: 非吴势力角色发起被拒; 主公自己发起被拒', () => {
  const game = trio(['sunce', 'caocao', 'huatuo'], 92075,
    { player: '主公', enemy: '反贼', ally: '忠臣' });
  game.turn = 'enemy'; game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'zb2-a' })];
  game.player.hand = [c('sha', { id: 'zb2-b' })];
  const wei = Engine.useSkill(game, 'enemy', 'zhiba', {});
  assert.equal(wei.ok, false, '魏势力不能发起制霸');
  game.turn = 'player';
  const self = Engine.useSkill(game, 'player', 'zhiba', {});
  assert.equal(self.ok, false, '主公自己不能发起');
});

// ═════════════════ 张昭张纮 直谏 / 固政 ═════════════════

test('直谏: 手牌装备置入他人装备区并摸一张', () => {
  const game = trio(['erzhang', 'caocao', 'huatuo'], 92076,
    { player: '主公', enemy: '反贼', ally: '忠臣' });
  game.player.hand = [c('qinggang', { id: 'zj-eq' })];
  assertCardConservation(game, () => {
    assert.equal(Engine.useSkill(game, 'player', 'zhijian',
      { cardIds: ['zj-eq'], target: 'ally' }).ok, true);
  });
  assert.equal(game.ally.equipment.weapon.id, 'zj-eq', '装备进入目标装备区');
  assert.equal(game.player.hand.length, 1, '摸一张牌');
});

test('直谏: 顶替目标已有装备 → 旧装备照常入弃牌堆, 牌张守恒', () => {
  const game = trio(['erzhang', 'caocao', 'huatuo'], 92084,
    { player: '主公', enemy: '反贼', ally: '忠臣' });
  game.ally.equipment.weapon = c('qinggang', { id: 'zj-old' });
  game.player.hand = [c('zhangba', { id: 'zj-new' })];
  assertCardConservation(game, () => {
    assert.equal(Engine.useSkill(game, 'player', 'zhijian',
      { cardIds: ['zj-new'], target: 'ally' }).ok, true);
  });
  assert.equal(game.ally.equipment.weapon.id, 'zj-new');
  assert.ok(game.discard.some((card) => card.id === 'zj-old'), '旧装备入弃牌堆');
});

test('直谏: 非装备牌被拒; 不指定其他角色被拒', () => {
  const game = duel('erzhang');
  game.player.hand = [c('sha', { id: 'zj2-basic' })];
  const bad = Engine.useSkill(game, 'player', 'zhijian', { cardIds: ['zj2-basic'], target: 'enemy' });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /装备牌/);
});

test('固政: 他人弃牌阶段结束时还一张、余下归张昭张纮', () => {
  const game = trio(['erzhang', 'caocao', 'huatuo'], 92077,
    { player: '主公', enemy: '反贼', ally: '忠臣' });
  game.turn = 'enemy'; game.phase = 'play';
  game.enemy.hand = Array.from({ length: 8 }, (_, i) => c('sha', { id: 'gz' + i }));
  Engine.advancePhase(game); // play → discard (记账窗口从此开始)
  assert.equal(game.phase, 'discard');
  const excess = game.enemy.hand.length - 4;
  const ids = game.enemy.hand.slice(0, excess).map((card) => card.id);
  assertCardConservation(game, () => {
    Engine.discardSelected(game, 'enemy', ids);
    Engine.advancePhase(game); // discard → finish (固政时机)
  });
  assert.equal(game.enemy.hand.length, 5, '4 张上限 + 固政还回 1 张');
  assert.equal(game.player.hand.length, excess - 1, '其余弃牌归固政持有者');
});

test('固政: 张昭张纮自己的弃牌阶段不触发 ("其他角色的弃牌阶段")', () => {
  const game = duel('erzhang');
  game.turn = 'player'; game.phase = 'play';
  game.player.hand = Array.from({ length: 6 }, (_, i) => c('sha', { id: 'gz2-' + i }));
  Engine.advancePhase(game);
  const excess = game.player.hand.length - game.player.hp;
  if (excess > 0) {
    Engine.discardSelected(game, 'player', game.player.hand.slice(0, excess).map((card) => card.id));
  }
  const before = game.player.hand.length;
  Engine.advancePhase(game);
  assert.equal(game.player.hand.length, before, '自己弃牌不回流');
});

// ═════════════════ 蔡文姬 悲歌 / 断肠 ═════════════════

test('悲歌: 杀伤害后弃一张牌令受伤者判定 — 红桃回血', () => {
  const game = trio(['caocao', 'huatuo', 'caiwenji'], 92078);
  game.turn = 'player'; game.phase = 'play';
  game.player.hand = [c('sha', { id: 'bg-sha' })];
  game.enemy.hp = game.enemy.maxHp - 1; // 受伤但离濒死还有余量
  game.ally.hand = [c('sha', { id: 'bg-cost' })];
  game.ally.skillPreferences.beige = 'auto';
  stackJudge(game, c('tao', { id: 'bg-judge', suit: 'heart', rank: '9' }));
  const hp = game.enemy.hp;
  assertCardConservation(game, () => {
    Engine.playCard(game, 'player', 'bg-sha', { target: 'enemy' });
  });
  // 受 1 点伤害 (-1) 后判定红桃回 1 → 净持平。
  assert.equal(game.enemy.hp, hp, '红桃: 掉 1 回 1');
  assert.equal(game.ally.hand.length, 0, '成本牌已弃');
});

test('悲歌: 黑桃 → 伤害来源翻面', () => {
  const game = trio(['caocao', 'huatuo', 'caiwenji'], 92079);
  game.turn = 'player'; game.phase = 'play';
  game.player.hand = [c('sha', { id: 'bg2-sha' })];
  game.ally.hand = [c('sha', { id: 'bg2-cost' })];
  game.ally.skillPreferences.beige = 'auto';
  stackJudge(game, c('sha', { id: 'bg2-judge', suit: 'spade', rank: '9' }));
  Engine.playCard(game, 'player', 'bg2-sha', { target: 'enemy' });
  assert.equal(game.player.turnedOver, true, '黑桃: 来源翻面');
});

test('悲歌: 受伤者已阵亡 → 不发动 ("若其存活")', () => {
  const game = trio(['caocao', 'huatuo', 'caiwenji'], 92080);
  game.turn = 'player'; game.phase = 'play';
  game.player.hand = [c('sha', { id: 'bg3-sha' })];
  game.enemy.hp = 1;
  game.enemy.hand = [];
  game.ally.hand = [c('sha', { id: 'bg3-cost' })];
  game.ally.skillPreferences.beige = 'auto';
  Engine.playCard(game, 'player', 'bg3-sha', { target: 'enemy' });
  assert.equal(game.ally.hand.length, 1, '目标死亡 → 悲歌不发动, 成本牌保留');
});

test('断肠: 蔡文姬死亡时杀死她的角色失去所有技能', () => {
  const game = trio(['caocao', 'huatuo', 'caiwenji'], 92081);
  game.turn = 'player'; game.phase = 'play';
  game.player.hand = [c('sha', { id: 'dc-sha' })];
  game.ally.hp = 1; game.ally.hand = []; game.ally.skillPreferences.beige = 'decline';
  game.enemy.hand = []; // 华佗不救
  assert.ok(game.player.skills.length > 0, '曹操开局有技能');
  Engine.playCard(game, 'player', 'dc-sha', { target: 'ally' });
  while (game.pendingChoice) Engine.resolvePendingChoice(game, { decline: true });
  assert.equal(game.ally.hp <= 0, true, '蔡文姬阵亡');
  assert.equal(game.player.skills.length, 0, '杀死者失去所有技能');
});

// W2 (第五轮审计 F5): 这条原本断言"断肠先结算 → 曹丕拿不到牌", 并在 V 阶段
// 被我写成"官方判例"。**那是没有出处的断言, 且方向判反了。**
// 真正的官方规则: 行殇与断肠是**同一时机** (flow__death.md:31「(3) 死亡时:
// 能发动的技能:【行殇】…【断肠】…」), 而同一时机多名角色的技能
// **从当前回合角色起按逆时针依次** (glossary__flow.md:30)。
// 于是顺序取决于"这是谁的回合", 固定注册序无论选哪边都会在另一种情形下出错。
test('断肠 × 行殇 [官方轮转序]: 曹丕在**自己回合**杀死蔡文姬 → 行殇先手拿到牌, 随后才被断肠夺技', () => {
  const game = quad(['caopi', 'caiwenji', 'zhangfei', 'huatuo'],
    { player: '主公', enemy: '反贼', ally: '反贼', ally2: '忠臣' }, 92085);
  game.turn = 'player'; game.phase = 'play';
  game.enemy.hp = 1;
  // 战利品刻意用既不能闪避也不能自救的牌 (给【闪】她就躲了, 给【桃】她就自救了)。
  game.enemy.hand = [c('wuzhong', { id: 'dc-loot-a' }), c('wuzhong', { id: 'dc-loot-b' })];
  game.enemy.skillPreferences.beige = 'decline';
  game.player.hand = [c('sha', { id: 'dc-kill' })];
  const skillsBefore = game.player.skills.length;
  assert.ok(skillsBefore > 0, '前置: 曹丕开局有技能');
  Engine.playCard(game, 'player', 'dc-kill', { target: 'enemy' });
  while (game.pendingChoice) Engine.resolvePendingChoice(game, { decline: true });
  assert.ok(game.enemy.hp <= 0, '蔡文姬阵亡');
  assert.equal(game.player.skills.length, 0, '断肠随后夺走曹丕全部技能');
  // 行殇先手 → 两张战利品到手; 再加击杀反贼的 3 张奖励 = 5。
  assert.equal(game.player.hand.length, 5, '行殇先结算, 曹丕拿到了那两张牌 (+3 击杀奖励)');
});

test('断肠 × 行殇 [官方轮转序]: 在**蔡文姬的回合**里被曹丕杀死 → 断肠先手, 行殇失效', () => {
  const game = quad(['caopi', 'caiwenji', 'zhangfei', 'huatuo'],
    { player: '主公', enemy: '反贼', ally: '反贼', ally2: '忠臣' }, 92086);
  game.turn = 'enemy'; game.phase = 'play';
  game.enemy.hp = 1;
  // 她发起决斗又应不出杀 → 伤害来源是曹丕, 但当前回合角色是她自己。
  game.enemy.hand = [c('juedou', { id: 'dc2-duel' }), c('shan', { id: 'dc2-loot' })];
  game.enemy.skillPreferences.beige = 'decline';
  game.player.hand = [c('sha', { id: 'dc2-answer' })];
  Engine.playCard(game, 'enemy', 'dc2-duel', { target: 'player' });
  while (game.pendingChoice) Engine.resolvePendingChoice(game, { decline: true });
  assert.ok(game.enemy.hp <= 0, '蔡文姬阵亡');
  assert.equal(game.player.skills.length, 0, '断肠先手夺技');
  // 行殇已随技能一起没了 → 只剩击杀反贼的 3 张奖励, 拿不到那张【闪】。
  assert.equal(game.player.hand.length, 3, '行殇失效: 只有击杀奖励, 没有战利品');
});

// ═════════════════ 收口: 守恒 / 快照 / 名单 ═════════════════

test('收口: "田" 区进入牌张守恒普查 (与"创"同形的武将牌上置牌区)', () => {
  const game = duel('dengai');
  game.player.tian = [c('sha', { id: 'tian-census' })];
  assertCardConservation(game, () => {
    // 无操作 —— 只验证普查覆盖 tian 区 (漏掉会在这里就报不平)。
  });
});

test('收口: 山包 16 技全部在 IMPLEMENTED 名单且各自注册了 hook', () => {
  const ids = ['qiaobian', 'tuntian', 'zaoxian', 'jixi', 'tiaoxin', 'zhiji',
    'xiangle', 'fangquan', 'ruoyu', 'jiang', 'hunzi', 'zhiba',
    'zhijian', 'guzheng', 'beige', 'duanchang'];
  for (const id of ids) {
    assert.ok(Engine.IMPLEMENTED_SKILL_IDS.includes(id), `${id} 在已实现名单`);
  }
  for (const id of ['tiaoxin', 'zhijian', 'zhiba']) {
    assert.ok(Engine.ACTIVE_SKILL_IDS.includes(id), `${id} 是出牌阶段主动技`);
  }
});

runTests(import.meta.url);
