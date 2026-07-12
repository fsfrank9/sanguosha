// v12 H 阶段行为测试: 链式结算多人化 (identity3 3 座席) —
//   无懈可击座次队列 / AOE (南蛮入侵) 逐席响应 / 铁索连环座次环传导 /
//   闪电座次环移交 / 桃园结义+五谷丰登逐座席 / AOE 濒死暂停后续跑剩余座席。
//
// 素材来源: 冒烟脚本 h_slab1_3p_smoke.mjs (已跑通), 本文件将其正式化为
// `tests` 数组用例并补充少量边界 (标注 "边界:")。只读引擎, 不改 src/。
//
// 涉及的引擎入口: Engine.playCard / Engine.startTurn / Engine.resolvePendingChoice;
// 内部机制见 src/engine/tricks.js (advanceWuxieChain/advanceAOETargets),
// src/engine/damage-dying.js (transmitChainDamage), src/engine/judge-area.js
// (applyJudgeAreaOutcome 的 shandian moveToNext 座次环扫描)。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

function c(type, overrides = {}) { return Engine.makeTestCard(type, overrides); }

// 3 座席 identity3 局面: newGame 后清空手牌/判定区/装备/日志/牌堆, 满血,
// 清技能偏好, turn='player' 之外的场景各测试自行覆盖。默认身份预设
// (座次顺序): player=主公, enemy=反贼, ally=忠臣。
function buildGame(opts = {}) {
  const game = Engine.newGame({
    seed: opts.seed || 34001,
    seats: ['player', 'enemy', 'ally'],
    playerHero: opts.playerHero || 'liubei',
    enemyHero: opts.enemyHero || 'caocao',
    allyHero: opts.allyHero || 'guanyu'
  });
  assert.deepEqual(game.seats, ['player', 'enemy', 'ally']);
  assert.equal(game.mode, 'identity3');
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
  return game;
}

function stockDeck(game, n, prefix = 'dk') {
  for (let i = 0; i < n; i += 1) game.deck.push(c('shan', { id: `${prefix}-${i}`, suit: 'diamond' }));
}

// ═══════════════════ 1. AOE 南蛮入侵 — 逐席响应 ═══════════════════════════

test('1. AOE 南蛮逐席: enemy 出南蛮, ally 有杀化解无伤, player 无杀受 1 伤', () => {
  const game = buildGame({ seed: 34002 });
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('nanman', { id: 'nm-1' })];
  game.ally.hand = [c('sha', { id: 'al-sha' })];
  game.player.hand = [];
  const playerHpBefore = game.player.hp;
  const res = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'nm-1'));
  assert.equal(res.ok, true, res.message);
  assert.equal(game.ally.hand.length, 0, 'ally 的杀被消耗化解南蛮');
  assert.equal(game.ally.hp, game.ally.maxHp, 'ally 无伤');
  assert.equal(game.player.hp, playerHpBefore - 1, 'player 无杀受 1 伤');
  assert.equal(game.pauseState.aoe, null, 'AOE 队列完成后自清');
});

// ═══════════════════ 2. 无懈可击 — 三座席拉锯队列 ═══════════════════════════

test('2. 三方无懈拉锯: player+enemy+ally 各出一张无懈, 净抵消态过河拆桥被抵消', () => {
  const game = buildGame({ seed: 34003 });
  game.turn = 'enemy';
  game.phase = 'play';
  game.player.equipment.weapon = c('qinggang', { id: 'p-weapon' });
  game.enemy.hand = [c('guohe', { id: 'gh-1' }), c('wuxie', { id: 'e-wx' })];
  game.player.hand = [c('wuxie', { id: 'p-wx' })];
  game.ally.hand = [c('wuxie', { id: 'a-wx' })];
  const res = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'gh-1'));
  assert.equal(res.ok, true, res.message);
  assert.ok(game.player.equipment.weapon && game.player.equipment.weapon.id === 'p-weapon',
    '三连无懈后过河拆桥被抵消, 武器保住');
  assert.equal(game.player.hand.length, 0, 'player 无懈已用');
  assert.equal(game.enemy.hand.length, 0, 'enemy 反无懈已用');
  assert.equal(game.ally.hand.length, 0, 'ally 再反无懈已用');
  assert.equal(game.pauseState.wuxieChain, null, '无懈链自清');
});

// ═══════════════════ 3. 铁索连环 — 座次环传导 ═══════════════════════════════

test('3. 铁索连环传导: player+ally 横置, enemy 火杀 player → 传导 ally', () => {
  const game = buildGame({ seed: 34004 });
  game.turn = 'enemy';
  game.phase = 'play';
  game.player.chained = true;
  game.ally.chained = true;
  game.enemy.hand = [c('fire_sha', { id: 'fs-1' })];
  game.player.hand = [];
  game.ally.hand = [];
  game.player.skillPreferences.shanResponse = 'decline';
  const playerHpBefore = game.player.hp;
  const allyHpBefore = game.ally.hp;
  const res = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'fs-1'));
  assert.equal(res.ok, true, res.message);
  assert.equal(game.player.hp, playerHpBefore - 1, 'player 受火杀 1 伤');
  assert.equal(game.ally.hp, allyHpBefore - 1, '铁索传导: ally 同受 1 点火伤');
  assert.equal(game.player.chained, false, 'player 受属性伤害解除连环');
  assert.equal(game.ally.chained, false, 'ally 受传导伤害解除连环');
});

test('边界 3b: 铁索连环传导环含攻击者本人 — 三席全横置时 player 自己也受传导', () => {
  // 三座席全横置: enemy(直接受击) 解除后, 座次环从 enemy 起顺时针为
  // [ally, player] (seatsFrom 排除 enemy 自身) —— player 虽是攻击者,
  // 只要处于横置状态同样在传导范围内, 并非豁免 (transmitChainDamage 只按
  // 座次环 + chained 判定, 不区分是否为伤害来源)。
  const game = buildGame({ seed: 34005 });
  game.turn = 'player';
  game.phase = 'play';
  game.player.chained = true;
  game.enemy.chained = true;
  game.ally.chained = true;
  game.player.hand = [c('fire_sha', { id: 'fs-self' })];
  game.enemy.hand = []; // 无闪, 保证直接命中触发传导
  const enemyHpBefore = game.enemy.hp;
  const allyHpBefore = game.ally.hp;
  const playerHpBefore = game.player.hp;
  const res = assertCardConservation(game, () =>
    Engine.playCard(game, 'player', 'fs-self', { target: 'enemy' }));
  assert.equal(res.ok, true, res.message);
  assert.equal(game.enemy.hp, enemyHpBefore - 1, 'enemy 直接受火杀 1 伤');
  assert.equal(game.ally.hp, allyHpBefore - 1, 'ally 传导受 1 点火伤');
  assert.equal(game.player.hp, playerHpBefore - 1, '攻击者自己横置时同样被传导, 非豁免');
  assert.equal(game.enemy.chained, false);
  assert.equal(game.ally.chained, false);
  assert.equal(game.player.chained, false);
});

// ═══════════════════ 4. 闪电 — 判定区座次环移交 ═══════════════════════════

test('4. 闪电座次环: 判定不命中且下家已有同名 → 移至下家的下家', () => {
  const game = buildGame({ seed: 34006 });
  game.player.judgeArea = [c('shandian', { id: 'sd-p', suit: 'spade' })];
  game.enemy.judgeArea = [c('shandian', { id: 'sd-e', suit: 'spade' })];
  game.deck.push(c('sha', { id: 'judge-miss', suit: 'heart', rank: '5' }));
  const res = assertCardConservation(game, () => Engine.startTurn(game, 'player'));
  assert.equal(res.ok, true, res.message);
  assert.ok(game.ally.judgeArea.some((x) => x.id === 'sd-p'),
    '闪电越过已有同名的 enemy, 移至 ally 判定区');
  assert.equal(game.player.judgeArea.length, 0);
  assert.equal(game.enemy.judgeArea.length, 1, 'enemy 原有的闪电不受影响');
});

test('边界 4b: 闪电座次环全员已占用 → 移动失败, 留在原判定区', () => {
  const game = buildGame({ seed: 34007 });
  game.player.judgeArea = [c('shandian', { id: 'sd-p2' })];
  game.enemy.judgeArea = [c('shandian', { id: 'sd-e2' })];
  game.ally.judgeArea = [c('shandian', { id: 'sd-a2' })];
  game.deck.push(c('sha', { id: 'judge-miss2', suit: 'heart', rank: '5' }));
  const res = assertCardConservation(game, () => Engine.startTurn(game, 'player'));
  assert.equal(res.ok, true, res.message);
  assert.ok(game.player.judgeArea.some((x) => x.id === 'sd-p2'),
    '座次环所有座席均已有同名判定牌 → 移动失败, 回落原判定区');
  assert.equal(game.player.judgeArea.length, 1);
  assert.ok(game.log.some((l) => l.includes('留在')), '日志记录移动失败原因');
});

// ═══════════════════ 5. 桃园结义 / 五谷丰登 — 三座席逐一结算 ═══════════════

test('5a. 桃园结义三座席逐目标回满体力', () => {
  const game = buildGame({ seed: 34008 });
  game.turn = 'player';
  game.phase = 'play';
  for (const seat of game.seats) game[seat].hp = game[seat].maxHp - 1;
  game.player.hand = [c('taoyuan', { id: 'ty-1' })];
  const res = assertCardConservation(game, () => Engine.playCard(game, 'player', 'ty-1'));
  assert.equal(res.ok, true, res.message);
  for (const seat of game.seats) {
    assert.equal(game[seat].hp, game[seat].maxHp, `${seat} 桃园回复满`);
  }
});

test('5b. 五谷丰登三座席按座次各取一张', () => {
  const game = buildGame({ seed: 34009 });
  game.turn = 'player';
  game.phase = 'play';
  stockDeck(game, 10);
  game.player.hand = [c('wugu', { id: 'wg-1' })];
  game.player.skillPreferences.wugu = 'auto';
  const before = { e: game.enemy.hand.length, a: game.ally.hand.length };
  const res = assertCardConservation(game, () => Engine.playCard(game, 'player', 'wg-1'));
  assert.equal(res.ok, true, res.message);
  assert.equal(game.player.hand.length, 1, 'player 获得 1 张');
  assert.equal(game.enemy.hand.length, before.e + 1, 'enemy 获得 1 张');
  assert.equal(game.ally.hand.length, before.a + 1, 'ally 获得 1 张 (第三席入列)');
});

// ═══════════════════ 6. AOE 濒死暂停 → 续跑剩余座席 ═══════════════════════

test('6. AOE 濒死暂停: player 濒死挂起后救回, ally 万箭队列续跑命中 enemy', () => {
  const game = buildGame({ seed: 34010 });
  game.turn = 'ally';
  game.phase = 'play';
  game.ally.hand = [c('wanjian', { id: 'wj-1' })];
  game.player.hp = 1;
  game.player.hand = [c('tao', { id: 'p-tao' })];
  game.player.skillPreferences.dying = 'ask';
  game.enemy.hand = [c('shan', { id: 'e-shan' })];
  const res = Engine.playCard(game, 'ally', 'wj-1');
  assert.equal(res.ok, true, res.message);
  assert.ok(game.pendingChoice && game.pendingChoice.kind === 'dying-rescue',
    'player 濒死暂停 (队列挂起)');
  assert.ok(game.pauseState.aoe, 'AOE 队列保留待续跑');
  assert.equal(game.enemy.hand.length, 1, 'enemy 尚未响应 (暂停时序正确)');
  const r2 = assertCardConservation(game, () =>
    Engine.resolvePendingChoice(game, { use: true, cardId: 'p-tao' }));
  assert.equal(r2.ok, true, r2.message);
  assert.equal(game.player.hp, 1, 'player 桃救回 1 血');
  assert.equal(game.enemy.hand.length, 0, '救援后 AOE 续跑: enemy 出闪化解');
  assert.equal(game.enemy.hp, game.enemy.maxHp, 'enemy 化解无伤');
  assert.equal(game.pauseState.aoe, null, '队列完成自清');
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
