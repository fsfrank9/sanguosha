// v12 H 阶段行为测试: 显式目标 / 合法目标矩阵 / identity3 距离规则 —
//   决斗/过河拆桥/乐不思蜀/桃/无中生有/火攻/铁索连环 的显式跨座席目标;
//   identity3 顺手牵羊距离 ≤1 规则 (含非法目标拒绝不掉牌); 借刀杀人
//   A(持刀者)/B(受害者) 双显式目标; 1v1 缺省目标回退零回归。
//
// 素材来源: 冒烟脚本 h_slab2_3p_smoke.mjs (已跑通), 本文件将其正式化为
// `tests` 数组用例并补充边界 (标注 "边界:"): 铁索连环目标数上限 2 (裁剪),
// 以及 5 种牌类型的 legalTargetsForCard 距离矩阵抽查。只读引擎, 不改 src/。
//
// 涉及的引擎入口: Engine.playCard / Engine.legalTargetsForCard;
// 内部机制见 src/engine/game-engine.js isLegalCardTarget (per-card-type
// 距离/保护规则) 与 playTiesuoCardHandler (targets.slice(0,2))。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

function c(type, overrides = {}) { return Engine.makeTestCard(type, overrides); }

function buildGame(opts = {}) {
  const game = Engine.newGame({
    seed: opts.seed || 35001,
    seats: ['player', 'enemy', 'ally'],
    playerHero: opts.playerHero || 'liubei',
    enemyHero: opts.enemyHero || 'caocao',
    allyHero: opts.allyHero || 'guanyu'
  });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const seat of game.seats) {
    game[seat].hand = [];
    game[seat].judgeArea = [];
    game[seat].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[seat].hp = game[seat].maxHp;
    game[seat].skillPreferences = {};
    game[seat].flags = {};
    game[seat].chuang = [];
  }
  game.turn = 'player';
  game.phase = 'play';
  return game;
}

function stockDeck(game, n, prefix = 'dk') {
  for (let i = 0; i < n; i += 1) game.deck.push(c('shan', { id: `${prefix}-${i}`, suit: 'diamond' }));
}

// ═══════════════════ 1. 决斗 — 显式跨座席目标 ═══════════════════════════

test('1. 决斗显式目标 ally: 双方拼杀, enemy 不卷入 (伤害来源=对方非 opponent())', () => {
  const game = buildGame({ seed: 35002 });
  game.player.hand = [c('juedou', { id: 'jd-1' }), c('sha', { id: 'p-s1' }), c('sha', { id: 'p-s2' })];
  game.ally.hand = [c('sha', { id: 'a-s1' })];
  game.enemy.hand = [c('sha', { id: 'e-s1' })];
  const res = assertCardConservation(game, () => Engine.playCard(game, 'player', 'jd-1', { target: 'ally' }));
  assert.equal(res.ok, true, res.message);
  assert.equal(game.ally.hand.length, 0, 'ally 被迫出杀');
  assert.equal(game.enemy.hand.length, 1, 'enemy 未卷入决斗');
  assert.equal(game.ally.hp, game.ally.maxHp - 1, 'ally 杀尽后受 1 伤');
  assert.equal(game.player.hand.length, 1, 'player 拼掉一张杀');
});

// ═══════════════════ 2. 过河拆桥 — 显式目标 + 区域预校验 ═════════════════

test('2. 过河拆桥显式目标 ally 装备, enemy 手牌无恙', () => {
  const game = buildGame({ seed: 35003 });
  game.player.hand = [c('guohe', { id: 'gh-1' })];
  game.ally.equipment.weapon = c('qinggang', { id: 'a-weapon' });
  game.enemy.hand = [c('sha', { id: 'e-keep' })];
  const res = assertCardConservation(game, () =>
    Engine.playCard(game, 'player', 'gh-1', { target: 'ally', targetZone: 'equipment', targetCardId: 'a-weapon' }));
  assert.equal(res.ok, true, res.message);
  assert.equal(game.ally.equipment.weapon, null, 'ally 武器被拆');
  assert.equal(game.enemy.hand.length, 1, 'enemy 手牌无恙');
});

// ═══════════════════ 3. identity3 顺手牵羊 — 距离 ≤1 ═══════════════════════

test('3. identity3 顺手距离 ≤1: +1 马外的座席非法, 显式指定被拒且牌不离手', () => {
  const game = buildGame({ seed: 35004 });
  game.player.hand = [c('shunshou', { id: 'ss-1' })];
  game.ally.equipment.horsePlus = c('plus_horse', { id: 'a-horse' });
  game.ally.hand = [c('sha', { id: 'a-h1' })];
  game.enemy.hand = [c('sha', { id: 'e-h1' })];
  assert.equal(game.mode, 'identity3');
  const legalTargets = Engine.legalTargetsForCard(game, 'player', game.player.hand[0]);
  assert.ok(legalTargets.indexOf('enemy') >= 0, 'enemy 距离 1 → 合法');
  assert.ok(legalTargets.indexOf('ally') < 0, 'ally 因 +1 马距离 2 → 非法 (identity3 距离规则)');
  const bad = Engine.playCard(game, 'player', 'ss-1', { target: 'ally' });
  assert.notEqual(bad.ok, true, '显式指定距离外目标被拒');
  assert.equal(game.player.hand.length, 1, '牌未离手 (拒绝即恢复)');
  const good = assertCardConservation(game, () => Engine.playCard(game, 'player', 'ss-1', { target: 'enemy' }));
  assert.equal(good.ok, true, good.message);
  assert.equal(game.enemy.hand.length, 0, 'enemy 手牌被顺走');
  assert.equal(game.player.hand.length, 1, '顺来的牌入手');
});

// ═══════════════════ 4. 乐不思蜀 — 延时锦囊显式目标 ═══════════════════════

test('4. 乐不思蜀显式目标 ally, 不误置 enemy 判定区', () => {
  const game = buildGame({ seed: 35005 });
  game.player.hand = [c('lebusishu', { id: 'le-1' })];
  const res = assertCardConservation(game, () => Engine.playCard(game, 'player', 'le-1', { target: 'ally' }));
  assert.equal(res.ok, true, res.message);
  assert.ok(game.ally.judgeArea.some((x) => x.id === 'le-1'), '乐置入 ally 判定区');
  assert.equal(game.enemy.judgeArea.length, 0);
});

// ═══════════════════ 5. 借刀杀人 — A(持刀者)/B(受害者) 双显式目标 ═════════

test('5. 借刀杀人 A=enemy B=ally, 借刀者 player 全程未受伤', () => {
  const game = buildGame({ seed: 35006 });
  game.player.hand = [c('jiedao', { id: 'dao-1' })];
  game.enemy.equipment.weapon = c('qinggang', { id: 'e-weapon' });
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.ally.hand = [];
  game.ally.skillPreferences.shanResponse = 'decline';
  const allyHpBefore = game.ally.hp;
  const res = assertCardConservation(game, () =>
    Engine.playCard(game, 'player', 'dao-1', { target: 'enemy', jiedaoVictim: 'ally' }));
  assert.equal(res.ok, true, res.message);
  assert.equal(game.ally.hp, allyHpBefore - 1, 'ally 挨了 enemy 被驱使的杀');
  assert.equal(game.player.hp, game.player.maxHp, 'player (借刀者) 未受伤');
  assert.equal(game.enemy.hand.length, 0, 'enemy 的杀被借走打出');
});

// ═══════════════════ 6. 桃/无中/火攻/铁索 — 显式第三席目标 ═══════════════

test('6. 无中生有/火攻/铁索连环 显式第三席目标走通; 桃跨席被拒 (v13 J0-4)', () => {
  const game = buildGame({ seed: 35007 });
  stockDeck(game, 15); // 无中生有令 ally 摸 2 张; 牌堆需先垫够避免空牌堆洗牌污染布局
  game.ally.hp = game.ally.maxHp - 2;
  game.player.hp = game.player.maxHp - 1; // 自己受伤, 桃 canPlayCard 放行
  game.player.hand = [c('tao', { id: 't-1' }), c('huogong', { id: 'hg-1' }),
    c('wuzhong', { id: 'wz-1' }), c('tiesuo', { id: 'ts-1' }), c('sha', { id: 'cost-x', suit: 'heart' })];
  game.ally.hand = [c('sha', { id: 'a-reveal', suit: 'heart' })];

  // v13 J0-4: 出牌阶段桃目标恒为自己 — 显式第三席目标被拒绝且牌不离手。
  const r1 = assertCardConservation(game, () => Engine.playCard(game, 'player', 't-1', { target: 'ally' }));
  assert.equal(r1.ok, false, '桃跨席目标被拒');
  assert.equal(game.ally.hp, game.ally.maxHp - 2, 'ally 血量不变');
  assert.ok(game.player.hand.some((x) => x.id === 't-1'), '桃退回手牌');
  // 桃对自己正常使用 (第三席在场零干扰)。
  const r1b = assertCardConservation(game, () => Engine.playCard(game, 'player', 't-1'));
  assert.equal(r1b.ok, true, r1b.message);
  assert.equal(game.player.hp, game.player.maxHp, '桃恒对自己回复');

  // 火攻先于无中生有结算: 此时 ally 手牌仅 'a-reveal' 一张 (heart), 展示
  // 结果确定, 避免无中生有摸牌后候选变多导致展示牌不确定 (fixture 顺序,
  // 与显式目标机制本身无关)。
  const r2 = assertCardConservation(game, () => Engine.playCard(game, 'player', 'hg-1', { target: 'ally' }));
  assert.equal(r2.ok, true, r2.message);
  assert.ok(game.log.some((l) => l.includes('展示')), '火攻对 ally 展示流程走通');
  assert.ok(game.discard.some((x) => x.id === 'cost-x'), '同花色成本牌 (heart) 被正确弃置');
  assert.ok(game.player.hand.some((x) => x.id === 'ts-1'), '不同花色的 ts-1 未被误弃');

  const r3 = assertCardConservation(game, () => Engine.playCard(game, 'player', 'wz-1', { target: 'ally' }));
  assert.equal(r3.ok, true, r3.message);
  assert.equal(game.ally.hand.length, 1 + 2, '无中令 ally 摸两张');

  const r4 = assertCardConservation(game, () => Engine.playCard(game, 'player', 'ts-1', { targets: ['enemy', 'ally'] }));
  assert.equal(r4.ok, true, r4.message);
  assert.equal(game.enemy.chained, true, 'enemy 横置');
  assert.equal(game.ally.chained, true, 'ally 横置 (第三席可选)');
});

// ═══════════════════ 7. 1v1 — 缺省目标回退零回归 ═══════════════════════════

test('7. 1v1 决斗无显式目标 → 缺省回退对手 (零回归抽查)', () => {
  const game = Engine.newGame({ seed: 35008, playerHero: 'liubei', enemyHero: 'caocao' });
  game.turn = 'player';
  game.phase = 'play';
  game.player.hand = [c('juedou', { id: 'jd-x' })];
  game.enemy.hand = [];
  const enemyHpBefore = game.enemy.hp;
  const res = assertCardConservation(game, () => Engine.playCard(game, 'player', 'jd-x'));
  assert.equal(res.ok, true, res.message);
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '缺省目标回退对手');
});

// ═══════════════════ 边界: 铁索连环目标数上限裁剪至 2 (4 座席) ═══════════

test('边界 8: 铁索连环 4 座席传入 3 个显式目标 → 只对前 2 个生效 (裁剪)', () => {
  const game = Engine.newGame({
    seed: 35009,
    seats: ['player', 'enemy', 'ally', 'rebel2'],
    playerHero: 'liubei', enemyHero: 'caocao', allyHero: 'guanyu', rebel2Hero: 'zhangfei',
    rebel2Role: '反贼'
  });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const seat of game.seats) {
    game[seat].hand = [];
    game[seat].judgeArea = [];
    game[seat].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[seat].hp = game[seat].maxHp;
    game[seat].skillPreferences = {};
    game[seat].flags = {};
    game[seat].chuang = [];
  }
  game.turn = 'player';
  game.phase = 'play';
  game.player.hand = [c('tiesuo', { id: 'ts-cap' })];
  const res = assertCardConservation(game, () =>
    Engine.playCard(game, 'player', 'ts-cap', { targets: ['enemy', 'ally', 'rebel2'] }));
  assert.equal(res.ok, true, res.message);
  assert.equal(game.enemy.chained, true, '第 1 个显式目标生效');
  assert.equal(game.ally.chained, true, '第 2 个显式目标生效');
  assert.ok(!game.rebel2.chained, '第 3 个显式目标被裁剪 (官方规则: 至多 2 名角色)');
});

// ═══════════════════ 边界: 合法目标矩阵 — 距离限制按牌类型区分 ═══════════

test('边界 9: 合法目标矩阵 — 杀/顺手/兵粮受距离限制, 决斗/过河拆桥不受限', () => {
  const game = buildGame({ seed: 35010 });
  game.ally.equipment.horsePlus = c('plus_horse', { id: 'ally-plus' });
  assert.equal(Engine.distanceBetween(game, 'player', 'ally'), 2, '前置: +1 马令距离变 2');
  assert.equal(Engine.distanceBetween(game, 'player', 'enemy'), 1, '前置: enemy 距离仍为 1');
  // 各卡自身需要的最低前置条件: guohe/shunshou 要求目标有可拿的牌;
  // bingliang 要求目标判定区无同名; enemy 也配一张手牌保证候选一致。
  game.ally.hand = [c('sha', { id: 'ally-card' })];
  game.enemy.hand = [c('sha', { id: 'enemy-card' })];

  const shaTargets = Engine.legalTargetsForCard(game, 'player', c('sha', { id: 'probe-sha' }));
  assert.ok(shaTargets.indexOf('enemy') >= 0, '杀: enemy 距离 1 → 合法');
  assert.ok(shaTargets.indexOf('ally') < 0, '杀: ally 距离 2 超出默认武器范围 1 → 非法');

  const duelTargets = Engine.legalTargetsForCard(game, 'player', c('juedou', { id: 'probe-jd' }));
  assert.ok(duelTargets.indexOf('ally') >= 0, '决斗: 无距离限制, ally 仍合法');

  const guoheTargets = Engine.legalTargetsForCard(game, 'player', c('guohe', { id: 'probe-gh' }));
  assert.ok(guoheTargets.indexOf('ally') >= 0, '过河拆桥: 无距离限制, ally 仍合法');

  const shunshouTargets = Engine.legalTargetsForCard(game, 'player', c('shunshou', { id: 'probe-ss' }));
  assert.ok(shunshouTargets.indexOf('ally') < 0, '顺手牵羊: identity3 距离 ≤1, ally 非法');
  assert.ok(shunshouTargets.indexOf('enemy') >= 0, '顺手牵羊: enemy 距离 1 → 合法');

  const bingliangTargets = Engine.legalTargetsForCard(game, 'player', c('bingliang', { id: 'probe-bl' }));
  assert.ok(bingliangTargets.indexOf('ally') < 0, '兵粮寸断: identity3 距离 ≤1, ally 非法');
  assert.ok(bingliangTargets.indexOf('enemy') >= 0, '兵粮寸断: enemy 距离 1 → 合法');
});

let failures = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`✗ ${name}`);
    console.error(error && error.stack ? error.stack : error);
  }
}
if (failures > 0) {
  console.error(`\n${failures}/${tests.length} 个测试失败。`);
  process.exit(1);
} else {
  console.log(`\n全部 ${tests.length} 个测试通过。`);
}
