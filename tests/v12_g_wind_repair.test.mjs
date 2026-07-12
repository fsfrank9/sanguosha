// v12 G1 (修复批) 回归测试: 风包三技能首批 (据守·曹仁 / 狂骨·魏延 /
// 烈弓·黄忠) 的规则修复, 以及同批的两个引擎 bug 修复。
//
//   据守 jushou   — 结束阶段可摸三张牌, 然后将武将牌翻面; 此前翻面只是
//                   置一个标记, 引擎没有任何消费点 (零代价白摸三张)。修复
//                   补上消费点: startTurn 开头检测 turnedOver, 轮到该角色
//                   回合时翻回正面并跳过整个回合 (回合直接转给下一位)。
//   狂骨 kuanggu  — 锁定技: 对距离 1 以内的角色造成伤害后回复体力。修复
//                   两处偏差: (a) 补上距离 <=1 的前置判定 (此前无距离
//                   约束，任意距离命中都回血)；(b) 回复量按实际伤害点数
//                   逐点计算 (此前恒定 +1，酒+杀 2 点伤害也只回 1 点)。
//   烈弓 liegong  — 出牌阶段内使用【杀】指定一个目标后，若目标手牌数
//                   >= 你的体力值 或 <= 你的攻击范围，可令其不能用【闪】
//                   响应此【杀】。修复三处: (a) 攻击范围分支此前读取不
//                   存在的 state.attackRange (恒 undefined，分支永不触
//                   发)，改读 weaponRange；(b) 补"限定自己回合内使用的
//                   杀" (借刀杀人逼对方出杀不算)；(c) 补 isShaCard 守卫，
//                   避免未来非杀响应场景误触发 (万箭齐发等 AOE 走独立的
//                   playAOE 路径，本就不经过这个 hook，用来做反例验证)。
//   seatsFrom off-by-one (state.js) — includeSelf=false 时此前循环上界
//                   比 includeSelf=true 多算一轮，最后一步绕回 actor 自
//                   己；修复为循环上界恒为 seats.length。
//   神速(夏侯渊)/红颜(小乔) 撤出实现名单 — 此前被虚报为"已实现"，但神速
//                   需要阶段跳过选择框架、红颜需要花色视同层，均未落地。
//                   按"宁缺毋滥"从 IMPLEMENTED_SKILL_IDS/ACTIVE_SKILL_IDS
//                   撤出；英雄与技能条目本身保留在 HERO_CATALOG 中 (只是
//                   技能状态标 todo)，useSkill 主动发动应返回失败。
import assert from 'node:assert/strict';
import { Engine, IMPLEMENTED_SKILL_IDS, ACTIVE_SKILL_IDS } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

// 2 人局通用构造器: 沿用 yuanshu_wangzun_tongji / yaowu_red_sha_reward 的
// buildGame 模式 — newGame 之后清空手牌/判定区/装备/日志/牌堆, 满血, 清
// 技能偏好, 由各测试自行铺好需要的手牌与牌堆。默认英雄用不含干扰技能的
// 刘备做白板对手。
function buildGame(opts) {
  opts = opts || {};
  const game = Engine.newGame({
    seed: opts.seed || 12801,
    playerHero: opts.playerHero || 'liubei',
    enemyHero: opts.enemyHero || 'liubei',
    playerRole: opts.playerRole,
    enemyRole: opts.enemyRole
  });
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
    game[actor].turnedOver = false;
  }
  game.turn = 'player';
  game.phase = 'play';
  return game;
}

function stockDeck(game, n) {
  for (let i = 0; i < n; i += 1) game.deck.push(c('sha', { id: `deck-${i}` }));
}

// ───── A. 据守 (jushou, 曹仁) + 翻面机制 ──────────────────────────────

test('据守: 结束阶段发动 → 摸三张牌, 武将牌翻面, 回合交给对手', () => {
  const game = buildGame({ playerHero: 'caoren', enemyHero: 'liubei' });
  stockDeck(game, 20);
  const handBefore = game.player.hand.length;
  assertCardConservation(game, () => {
    const r = Engine.endTurn(game);
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.player.hand.length, handBefore + 3, '摸三张牌');
  assert.equal(game.player.turnedOver, true, '武将牌翻面');
  assert.equal(game.turn, 'enemy', '回合交给对手');
  assert.ok(game.log.some((l) => l.includes('【据守】')), '有据守日志');
});

test('据守 翻面消费: 下一次轮到曹仁时跳过回合并翻回正面', () => {
  const game = buildGame({ playerHero: 'caoren', enemyHero: 'liubei' });
  stockDeck(game, 30);
  // 曹仁结束回合 → 据守发动, 摸三张并翻面, 回合交给 enemy。
  assertCardConservation(game, () => {
    const r = Engine.endTurn(game);
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.player.turnedOver, true);
  assert.equal(game.turn, 'enemy');
  // enemy 结束回合 → 轮到曹仁时应翻回正面并跳过整个回合, 回合再次落到 enemy。
  assertCardConservation(game, () => {
    const r = Engine.endTurn(game);
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.player.turnedOver, false, '翻回正面');
  assert.equal(game.turn, 'enemy', '曹仁回合被跳过, 回合再次落到 enemy');
  assert.ok(game.log.some((l) => l.includes('翻回正面，跳过此回合')), '日志含跳过文案');
});

test('据守 decline 偏好: 回合结束不摸牌不翻面', () => {
  const game = buildGame({ playerHero: 'caoren', enemyHero: 'liubei' });
  game.player.skillPreferences.jushou = 'decline';
  stockDeck(game, 10);
  const handBefore = game.player.hand.length;
  assertCardConservation(game, () => {
    const r = Engine.endTurn(game);
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.player.hand.length, handBefore, '不摸牌');
  assert.equal(game.player.turnedOver, false, '不翻面');
  assert.equal(game.turn, 'enemy');
  assert.ok(game.log.some((l) => l.includes('选择不发动【据守】')));
});

test('翻面机制通用性: 非据守角色手动翻面同样被 startTurn 消费', () => {
  const game = buildGame(); // 双方都不带据守
  game.enemy.turnedOver = true;
  stockDeck(game, 10);
  // player 结束回合 → 轮到 enemy 时应翻回正面并跳过回合, 回合回到 player。
  assertCardConservation(game, () => {
    const r = Engine.endTurn(game);
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.enemy.turnedOver, false, '翻回正面');
  assert.equal(game.turn, 'player', 'enemy 回合被跳过, 回合回到 player');
  assert.ok(game.log.some((l) => l.includes('翻回正面，跳过此回合')));
});

// ───── B. 狂骨 (kuanggu, 魏延) ─────────────────────────────────────────

test('狂骨: 对距离 1 的目标造成 1 点杀伤害 → 回复 1 点体力', () => {
  const game = buildGame({ playerHero: 'weiyan', enemyHero: 'liubei' });
  game.player.hp = 2; // 受伤状态 (maxHp 4)
  game.enemy.hand = []; // 保证命中 (无闪可响应)
  game.player.hand = [c('sha', { id: 's1' })];
  const enemyHpBefore = game.enemy.hp;
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'player', 's1');
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '命中 1 点伤害');
  assert.equal(game.player.hp, 3, '狂骨回复 1 点体力');
  assert.ok(game.log.some((l) => l.includes('【狂骨】')), '有狂骨日志');
});

test('狂骨 反例: 对手 +1 马拉开距离到 2 → 不回复', () => {
  const game = buildGame({ playerHero: 'weiyan', enemyHero: 'liubei' });
  game.player.hp = 2;
  game.player.equipment.weapon = c('qinggang', { id: 'qg1' }); // 武器范围 2, 保证杀仍能命中
  game.enemy.equipment.horsePlus = c('plus_horse', { id: 'hp1' });
  game.enemy.hand = [];
  game.player.hand = [c('sha', { id: 's1' })];
  assert.equal(Engine.distanceBetween(game, 'player', 'enemy'), 2, '前置: 距离确实为 2');
  const enemyHpBefore = game.enemy.hp;
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'player', 's1');
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '杀仍然命中');
  assert.equal(game.player.hp, 2, '距离超过 1, 狂骨不回复');
});

test('狂骨 按点数回复: 2 点伤害 (相当于酒加成) → 回复 2 点体力', () => {
  const game = buildGame({ playerHero: 'weiyan', enemyHero: 'liubei' });
  game.player.hp = 1;
  game.player.shaBonus = 1; // 相当于已饮酒, 下一张杀伤害 +1 → 本次杀造成 2 点伤害
  game.enemy.hand = [];
  game.player.hand = [c('sha', { id: 's1' })];
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'player', 's1');
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.player.hp, 3, '按 2 点伤害回复 2 点体力 (而非恒定 1 点)');
});

test('狂骨 边界: 满血造成伤害 → 不超过体力上限', () => {
  const game = buildGame({ playerHero: 'weiyan', enemyHero: 'liubei' });
  assert.equal(game.player.hp, game.player.maxHp, '前置: 满血');
  game.enemy.hand = [];
  game.player.hand = [c('sha', { id: 's1' })];
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'player', 's1');
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.player.hp, game.player.maxHp, '满血不超过上限');
});

// ───── C. 烈弓 (liegong, 黄忠) ─────────────────────────────────────────

test('烈弓: 目标手牌数不小于黄忠体力值 → 锁闪命中且闪未被消耗', () => {
  const game = buildGame({ playerHero: 'huangzhong', enemyHero: 'liubei' });
  assert.equal(game.player.hp, 4, '前置: 黄忠体力 4');
  game.enemy.hand = [
    c('shan', { id: 'e-shan' }),
    c('sha', { id: 'f1' }),
    c('sha', { id: 'f2' }),
    c('sha', { id: 'f3' })
  ]; // 4 张 >= 体力 4
  const enemyHpBefore = game.enemy.hp;
  game.player.hand = [c('sha', { id: 's1' })];
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'player', 's1');
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '烈弓锁闪, 杀命中');
  assert.equal(game.enemy.hand.length, 4, '闪没有被消耗');
  assert.ok(game.enemy.hand.some((x) => x.id === 'e-shan'), '闪牌仍在手上');
  assert.ok(game.log.some((l) => l.includes('【烈弓】')), '有烈弓日志');
});

test('烈弓: 攻击范围分支 — 目标手牌数不大于攻击范围 (无武器=1) → 锁闪命中', () => {
  const game = buildGame({ playerHero: 'huangzhong', enemyHero: 'liubei' });
  game.enemy.hand = [c('shan', { id: 'e-shan' })]; // 1 张 <= weaponRange(1)
  const enemyHpBefore = game.enemy.hp;
  game.player.hand = [c('sha', { id: 's1' })];
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'player', 's1');
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '烈弓锁闪, 杀命中');
  assert.equal(game.enemy.hand.length, 1, '闪没有被消耗');
});

test('烈弓 反例: 手牌数介于攻击范围与体力值之间 → 正常闪避不掉血', () => {
  const game = buildGame({ playerHero: 'huangzhong', enemyHero: 'liubei' });
  game.enemy.hand = [c('shan', { id: 'e-shan' }), c('sha', { id: 'f1' })]; // 2 张: 2<4 且 2>1
  const enemyHpBefore = game.enemy.hp;
  game.player.hand = [c('sha', { id: 's1' })];
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'player', 's1');
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.enemy.hp, enemyHpBefore, '正常闪避, 不掉血');
  assert.equal(game.enemy.hand.length, 1, '闪已被消耗化解');
  assert.ok(!game.log.some((l) => l.includes('【烈弓】')), '烈弓未发动');
});

test('烈弓 decline 偏好: 条件满足但不发动 → 正常闪避', () => {
  const game = buildGame({ playerHero: 'huangzhong', enemyHero: 'liubei' });
  game.player.skillPreferences.liegong = 'decline';
  game.enemy.hand = [
    c('shan', { id: 'e-shan' }),
    c('sha', { id: 'f1' }),
    c('sha', { id: 'f2' }),
    c('sha', { id: 'f3' })
  ]; // 满足"手牌数 >= 体力"条件, 但偏好关闭
  const enemyHpBefore = game.enemy.hp;
  game.player.hand = [c('sha', { id: 's1' })];
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'player', 's1');
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.enemy.hp, enemyHpBefore, '不发动 → 正常闪避');
  assert.ok(game.log.some((l) => l.includes('选择不发动【烈弓】')));
});

test('烈弓 反例: 万箭齐发不受烈弓锁闪影响 (烈弓只锁【杀】的闪)', () => {
  const game = buildGame({ playerHero: 'huangzhong', enemyHero: 'liubei' });
  game.enemy.hand = [c('shan', { id: 'e-shan' })]; // 若是杀会命中攻击范围分支被锁闪
  const enemyHpBefore = game.enemy.hp;
  game.player.hand = [c('wanjian', { id: 'w1' })];
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'player', 'w1');
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.enemy.hp, enemyHpBefore, '万箭仍可正常用闪化解');
  assert.equal(game.enemy.hand.length, 0, '闪已被消耗化解万箭');
});

test('烈弓 反例: 借刀杀人逼迫黄忠在非自己回合使用杀 → 不触发烈弓锁闪', () => {
  const game = buildGame({ playerHero: 'liubei', enemyHero: 'huangzhong' });
  // enemy(黄忠) 装备武器 + 手持杀, 被【借刀杀人】逼迫对 player 使用杀;
  // 此时 game.turn 仍是 'player', 并非黄忠自己的回合。
  game.enemy.equipment.weapon = c('zhuge', { id: 'wpn1' }); // 范围 1, 覆盖 1v1 固定距离 1
  game.enemy.hand = [c('sha', { id: 'forced-sha' })];
  game.player.hand = [c('jiedao', { id: 'jd1' }), c('shan', { id: 'p-shan' })];
  const playerHpBefore = game.player.hp;
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'player', 'jd1');
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.player.hp, playerHpBefore, '闪正常生效, 未被烈弓锁闪');
  assert.ok(!game.log.some((l) => l.includes('【烈弓】')), '烈弓未发动 (并非黄忠自己的回合)');
});

// ───── D. seatsFrom off-by-one 修复 (state.js) ────────────────────────

test('seatsFrom: 3 人局 includeSelf/excludeSelf 均不含多余绕回的自己', () => {
  const game = Engine.newGame({
    seed: 15701,
    seats: ['player', 'enemy', 'ally'],
    roles: { player: '主公', enemy: '反贼', ally: '忠臣' }
  });
  assert.deepEqual(Engine.seatsFrom(game, 'enemy', true), ['enemy', 'ally', 'player'], 'includeSelf: 首位是自己, 长度 3');
  assert.deepEqual(Engine.seatsFrom(game, 'enemy', false), ['ally', 'player'], 'excludeSelf: 长度 2, 不含 enemy 自己');
});

test('seatsFrom: 1v1 局 excludeSelf → 只含对手, 不会绕回自己', () => {
  const game = Engine.newGame({ seed: 15702 });
  assert.deepEqual(Engine.seatsFrom(game, 'player', false), ['enemy'], '长度 1, 只有对手');
});

// ───── E. 神速/红颜 撤除 (宁缺毋滥, 待阶段跳过/花色视同层落地后再接入) ──

// v12 G2 反转: G1 修复批曾按"宁缺毋滥"撤下神速/红颜; G2 落地阶段跳过
// 框架与花色视同层后二者正式接入 (详见 v12_g2_wind_batch2.test.mjs)。
test('v12 G2: 神速/红颜已随框架落地重新接入实现名单', () => {
  assert.ok(IMPLEMENTED_SKILL_IDS.includes('shensu'), 'shensu 已实现 (阶段跳过框架)');
  assert.ok(IMPLEMENTED_SKILL_IDS.includes('hongyan'), 'hongyan 已实现 (花色视同层)');
  assert.ok(!ACTIVE_SKILL_IDS.includes('shensu'), '神速是回合开始选项, 不占出牌阶段技能按钮');
});

test('useSkill(shensu): 非出牌阶段主动技 → useSkill 入口仍返回失败', () => {
  const game = buildGame({ playerHero: 'xiahouyuan', enemyHero: 'liubei' });
  const r = Engine.useSkill(game, 'player', 'shensu', [], {});
  assert.notEqual(r.ok, true, '神速走准备阶段 pendingChoice, 不走 useSkill 主动入口');
});

test('HERO_CATALOG: 夏侯渊/小乔仍保留英雄与技能条目 (仅技能未实现)', () => {
  assert.ok(Engine.HERO_CATALOG.xiahouyuan, '夏侯渊仍在英雄列表中');
  assert.ok(Engine.HERO_CATALOG.xiahouyuan.skills.some((s) => s.id === 'shensu'), '神速技能条目仍在');
  assert.ok(Engine.HERO_CATALOG.xiaoqiao, '小乔仍在英雄列表中');
  assert.ok(Engine.HERO_CATALOG.xiaoqiao.skills.some((s) => s.id === 'hongyan'), '红颜技能条目仍在');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
