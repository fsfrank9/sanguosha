// v12 H 阶段行为测试: 身份场 (identity3) / 死亡结算 / 主公技 —
//   阵营无懈立场 (忠臣不反无懈自家抵消) / 忠臣救主 / 死亡弃牌 + 击杀奖惩 /
//   激将 (决斗代打) / 护驾 (杀需闪代打) / 黄天 (群势力给张角闪) /
//   离间 (虚拟决斗) / 1v1 惰性 (主公技/离间零回归)。
//
// 素材来源: 冒烟脚本 h_slab3_3p_smoke.mjs (已跑通), 本文件将其正式化为
// `tests` 数组用例并补充边界 (标注 "边界:"): 主公误杀忠臣的弃牌惩罚,
// 以及回合角色在判定阶段阵亡时"回合终止"而非继续走完当回合。只读引擎,
// 不改 src/。
//
// 涉及的引擎入口: Engine.playCard / Engine.useSkill / Engine.resolvePendingChoice /
// Engine.startTurn; 内部机制见 src/engine/damage-dying.js (settleDeath /
// determineWinner / completeTurn 的阵亡终止分支) 与 game-engine.js 的
// 激将/护驾求助框架 (resolveJijiangAidChoice / resolveHujiaAidChoice)。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

function c(type, overrides = {}) { return Engine.makeTestCard(type, overrides); }

function resetSeats(game) {
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
}

// 默认身份预设 (座次顺序): player=主公, enemy=反贼, ally=忠臣。
function buildGame(opts = {}) {
  const game = Engine.newGame({
    seed: opts.seed || 36001,
    seats: ['player', 'enemy', 'ally'],
    playerHero: opts.playerHero || 'liubei',
    enemyHero: opts.enemyHero || 'caocao',
    allyHero: opts.allyHero || 'guanyu'
  });
  resetSeats(game);
  game.turn = 'player';
  game.phase = 'play';
  return game;
}

function stockDeck(game, n, prefix = 'dk') {
  for (let i = 0; i < n; i += 1) game.deck.push(c('shan', { id: `${prefix}-${i}`, suit: 'diamond' }));
}

// ═══════════════════ 1. 无懈立场 — 忠臣不帮敌人反无懈 ═══════════════════

test('1. 无懈阵营立场: 反贼拆主公装备, 忠臣持无懈但不反无懈自家抵消', () => {
  const game = buildGame({ seed: 36002 });
  game.turn = 'enemy';
  game.player.equipment.weapon = c('qinggang', { id: 'p-wp' });
  game.enemy.hand = [c('guohe', { id: 'gh' })];
  game.player.hand = [c('wuxie', { id: 'p-wx' })];
  game.ally.hand = [c('wuxie', { id: 'a-wx' })];
  const res = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'gh'));
  assert.equal(res.ok, true, res.message);
  assert.ok(game.player.equipment.weapon, '武器保住 (主公自己的无懈生效)');
  assert.equal(game.ally.hand.length, 1, '忠臣不反无懈自家抵消 (保留无懈)');
});

// ═══════════════════ 2. 阵营救援 — 忠臣桃救濒死主公 ═══════════════════════

test('2. 阵营救援: 忠臣用桃救濒死主公, 对局不因此终止', () => {
  const game = buildGame({ seed: 36003 });
  game.turn = 'enemy';
  game.player.hp = 1;
  game.player.hand = [];
  game.player.skillPreferences.shanResponse = 'decline';
  game.player.skillPreferences.dying = 'auto';
  game.ally.hand = [c('tao', { id: 'a-tao' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  const res = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'e-sha'));
  assert.equal(res.ok, true, res.message);
  assert.notEqual(game.phase, 'gameover', '对局未结束');
  assert.equal(game.player.hp, 1, '主公被忠臣的桃救回');
  assert.equal(game.ally.hand.length, 0, '忠臣的桃已用');
});

// ═══════════════════ 3. 死亡结算 — 弃牌 + 击杀奖惩 + 胜负判定 ═══════════

test('3a. 忠臣阵亡弃置所有牌, 主忠双存活时对局继续', () => {
  const game = buildGame({ seed: 36004 });
  game.turn = 'enemy';
  game.ally.hp = 1;
  game.ally.hand = [c('sha', { id: 'a-h1' }), c('sha', { id: 'a-h2' })];
  game.ally.equipment.weapon = c('qinggang', { id: 'a-wp' });
  game.ally.skillPreferences.shanResponse = 'decline';
  game.ally.skillPreferences.dying = 'decline';
  game.player.skillPreferences.dying = 'decline';
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  const res = Engine.playCard(game, 'enemy', 'e-sha', { target: 'ally' });
  assert.equal(res.ok, true, res.message);
  assert.notEqual(game.phase, 'gameover', '忠臣死, 反贼/主公均存活 → 对局继续');
  assert.ok(game.ally.hp <= 0, '忠臣阵亡');
  assert.equal(game.ally.hand.length, 0, '阵亡弃置手牌');
  assert.equal(game.ally.equipment.weapon, null, '阵亡弃置装备');
  assert.ok(game.discard.some((x) => x.id === 'a-wp'), '装备入弃牌堆');
});

test('3b. 击杀反贼摸三张, 反贼全灭 → 主忠方胜 (winner=lordSide)', () => {
  const game = buildGame({ seed: 36005 });
  game.turn = 'player';
  game.enemy.hp = 1;
  game.enemy.hand = [];
  game.enemy.skillPreferences.dying = 'decline';
  game.player.hand = [c('sha', { id: 'p-sha' })];
  const res = Engine.playCard(game, 'player', 'p-sha', { target: 'enemy' });
  assert.equal(res.ok, true, res.message);
  assert.equal(game.phase, 'gameover', '反贼全灭 → 主忠方胜');
  assert.equal(game.winner, 'lordSide');
});

test('3c. 4 座席局: 击杀一名反贼摸三张, 仍有反贼存活时对局继续', () => {
  const game = Engine.newGame({
    seed: 36006,
    seats: ['player', 'enemy', 'ally', 'rebel2'],
    playerHero: 'liubei', enemyHero: 'caocao', allyHero: 'guanyu', rebel2Hero: 'zhangfei',
    rebel2Role: '反贼'
  });
  assert.equal(game.roles.rebel2, '反贼', '第四席显式反贼');
  resetSeats(game);
  game.turn = 'player';
  game.phase = 'play';
  stockDeck(game, 16); // 击杀反贼奖励摸三张需要牌堆有牌可摸
  game.enemy.hp = 1;
  game.enemy.hand = [];
  game.enemy.skillPreferences.dying = 'decline';
  game.rebel2.skillPreferences.dying = 'decline';
  game.player.hand = [c('sha', { id: 'p-sha' })];
  const res = assertCardConservation(game, () => Engine.playCard(game, 'player', 'p-sha', { target: 'enemy' }));
  assert.equal(res.ok, true, res.message);
  assert.notEqual(game.phase, 'gameover', '仍有反贼 (rebel2) 存活 → 对局继续');
  assert.equal(game.player.hand.length, 3, '击杀反贼 → 主公摸三张');
});

// ═══════════════════ 边界: 主公误杀忠臣 — 弃置所有手牌与装备 ═══════════

test('边界 3d: 主公误杀忠臣 → 击杀者(主公)弃置所有手牌与装备', () => {
  const game = buildGame({ seed: 36007 }); // 默认预设: player=主公, ally=忠臣
  game.turn = 'player';
  game.phase = 'play';
  game.ally.hp = 1;
  game.ally.hand = []; // 忠臣无桃可自救, 且 player 手牌不含桃 → 无人救援 (无需 ask)
  game.player.hand = [c('sha', { id: 'kill-sha' }), c('wuzhong', { id: 'p-keep' })];
  game.player.equipment.weapon = c('qinggang', { id: 'p-weapon' });
  game.player.equipment.armor = c('bagua', { id: 'p-armor' });
  const res = assertCardConservation(game, () =>
    Engine.playCard(game, 'player', 'kill-sha', { target: 'ally' }));
  assert.equal(res.ok, true, res.message);
  assert.ok(game.ally.hp <= 0, '忠臣阵亡');
  assert.notEqual(game.phase, 'gameover', '主公/反贼均存活 → 对局继续');
  assert.ok(game.log.some((l) => l.includes('误杀忠臣')), '日志记录误杀惩罚');
  assert.equal(game.player.hand.length, 0, '主公 (击杀者) 弃置所有手牌 (含未用于杀的 p-keep)');
  assert.equal(game.player.equipment.weapon, null, '主公武器被弃置');
  assert.equal(game.player.equipment.armor, null, '主公防具被弃置');
  assert.ok(game.discard.some((x) => x.id === 'p-keep'), '未使用的手牌进入弃牌堆');
  assert.ok(game.discard.some((x) => x.id === 'p-weapon'), '武器进入弃牌堆');
  assert.ok(game.discard.some((x) => x.id === 'p-armor'), '防具进入弃牌堆');
});

// ═══════════════════ 边界: 回合角色阵亡 → 回合终止, 直接传给下一座席 ═══

test('边界 3e: 回合角色在判定阶段阵亡 → 回合终止 (跳过摸牌/出牌), 对局继续', () => {
  const game = buildGame({ seed: 36008 });
  // ally (忠臣) 回合开始, 判定区闪电命中致死 (3 点伤害, hp=1 且无人可救) —
  // continueTurnAfterJudgeArea 检测到回合角色已阵亡 → completeTurn 直接
  // 终止本回合 (不进入摸牌/出牌/弃牌/结束阶段), 传给座次环下一位 (player)。
  game.ally.hp = 1;
  game.ally.judgeArea = [c('shandian', { id: 'sd-fatal', suit: 'spade' })];
  game.player.hand = []; // 无桃, 避免濒死救援 ask 挂起
  game.enemy.hand = [];
  game.ally.hand = [];
  stockDeck(game, 15);
  game.deck.push(c('sha', { id: 'sd-judge-hit', suit: 'spade', rank: '7' })); // 黑桃 2-9 → 命中
  const res = assertCardConservation(game, () => Engine.startTurn(game, 'ally'));
  assert.equal(res.ok, true, res.message);
  assert.ok(game.ally.hp <= 0, 'ally 判定阶段被闪电击杀');
  assert.notEqual(game.phase, 'gameover', 'ally 是忠臣, 主公/反贼尚存 → 对局继续');
  assert.ok(game.log.some((l) => l.includes('回合因阵亡终止')), '日志记录回合终止原因');
  assert.equal(game.turn, 'player', '回合终止后传给座次环下一位 (座次环: ally→player)');
  assert.equal(game.phase, 'play', '下一位 (player) 的回合已正常推进到出牌阶段');
});

// ═══════════════════ 4. 激将 — 决斗代打挂起询问 ═══════════════════════════

test('4. 激将响应: AI 主公决斗无杀 → 忠臣玩家挂起询问代打', () => {
  const g = Engine.newGame({
    seed: 36009,
    seats: ['player', 'enemy', 'ally'],
    playerHero: 'guanyu', enemyHero: 'caocao', allyHero: 'liubei',
    roles: { player: '忠臣', enemy: '反贼', ally: '主公' },
    firstActor: 'enemy'
  });
  resetSeats(g);
  g.turn = 'enemy';
  g.phase = 'play';
  g.enemy.hand = [c('juedou', { id: 'jd' })];
  g.ally.hand = [];
  g.player.hand = [c('sha', { id: 'p-sha' })];
  const res = Engine.playCard(g, 'enemy', 'jd', { target: 'ally' });
  assert.equal(res.ok, true, res.message);
  assert.ok(g.pendingChoice && g.pendingChoice.kind === 'jijiang-aid', '玩家收到激将求助询问');
  assert.equal(g.pendingChoice.lordActor, 'ally');
  const r2 = assertCardConservation(g, () => Engine.resolvePendingChoice(g, { use: true }));
  assert.equal(r2.ok, true, r2.message);
  assert.equal(g.player.hand.length, 0, '玩家的杀代主公打出');
  assert.equal(g.ally.hp, g.ally.maxHp, '主公未受决斗伤害 (代打成功)');
  assert.ok(g.enemy.hp < g.enemy.maxHp || g.enemy.hand.length === 0, '决斗转回反贼一方');
});

test('边界 4b: 激将响应 — 玩家拒绝代打 (decline) → 主公自行承受决斗伤害', () => {
  const g = Engine.newGame({
    seed: 36010,
    seats: ['player', 'enemy', 'ally'],
    playerHero: 'guanyu', enemyHero: 'caocao', allyHero: 'liubei',
    roles: { player: '忠臣', enemy: '反贼', ally: '主公' },
    firstActor: 'enemy'
  });
  resetSeats(g);
  g.turn = 'enemy';
  g.phase = 'play';
  g.enemy.hand = [c('juedou', { id: 'jd2' })];
  g.ally.hand = [];
  g.player.hand = [c('sha', { id: 'p-sha2' })];
  const res = Engine.playCard(g, 'enemy', 'jd2', { target: 'ally' });
  assert.equal(res.ok, true, res.message);
  assert.equal(g.pendingChoice.kind, 'jijiang-aid');
  const allyHpBefore = g.ally.hp;
  const r2 = assertCardConservation(g, () => Engine.resolvePendingChoice(g, {}));
  assert.equal(r2.ok, true, r2.message);
  assert.ok(g.player.hand.some((x) => x.id === 'p-sha2'), '玩家拒绝代打, 杀仍在手中');
  assert.equal(g.ally.hp, allyHpBefore - 1, '无人代打, 主公自行承受 1 点决斗伤害');
});

// ═══════════════════ 5. 护驾 — 杀需闪代打挂起询问 ═══════════════════════

test('5. 护驾响应: AI 主公被杀无闪 → 忠臣玩家挂起询问代打闪', () => {
  const g = Engine.newGame({
    seed: 36011,
    seats: ['player', 'enemy', 'ally'],
    playerHero: 'xiahoudun', enemyHero: 'guanyu', allyHero: 'caocao',
    roles: { player: '忠臣', enemy: '反贼', ally: '主公' },
    firstActor: 'enemy'
  });
  resetSeats(g);
  g.turn = 'enemy';
  g.phase = 'play';
  g.enemy.hand = [c('sha', { id: 'e-sha' })];
  g.ally.hand = [];
  g.player.hand = [c('shan', { id: 'p-shan' })];
  const res = Engine.playCard(g, 'enemy', 'e-sha', { target: 'ally' });
  assert.equal(res.ok, true, res.message);
  assert.ok(g.pendingChoice && g.pendingChoice.kind === 'hujia-aid', '玩家收到护驾求助询问');
  const r2 = assertCardConservation(g, () => Engine.resolvePendingChoice(g, { use: true }));
  assert.equal(r2.ok, true, r2.message);
  assert.equal(g.player.hand.length, 0, '玩家的闪代主公打出');
  assert.equal(g.ally.hp, g.ally.maxHp, '主公无伤 (护驾成功)');
});

// ═══════════════════ 6. 黄天 — 群势力主公技, 全场型给牌 ═══════════════════

test('6. 黄天: 群势力玩家给 AI 主公张角一张闪, 每回合限一次', () => {
  const g = Engine.newGame({
    seed: 36012,
    seats: ['player', 'enemy', 'ally'],
    playerHero: 'huaxiong', enemyHero: 'guanyu', allyHero: 'zhangjiao',
    roles: { player: '忠臣', enemy: '反贼', ally: '主公' },
    firstActor: 'player'
  });
  resetSeats(g);
  g.turn = 'player';
  g.phase = 'play';
  assert.equal(g.player.camp, '群', '华雄是群势力');
  g.player.hand = [c('shan', { id: 'give-shan' })];
  const res = assertCardConservation(g, () => Engine.useSkill(g, 'player', 'huangtian', ['give-shan'], {}));
  assert.equal(res.ok, true, res.message);
  assert.equal(g.player.hand.length, 0);
  assert.ok(g.ally.hand.some((x) => x.id === 'give-shan'), '闪进入张角手牌');
  const again = Engine.useSkill(g, 'player', 'huangtian', ['nope'], {});
  assert.notEqual(again.ok, true, '每回合限一次');
});

// ═══════════════════ 7. 离间 — 虚拟决斗, 可被无懈, 无来源牌 ═══════════════

test('7. 离间: 貂蝉令两名男性决斗, 虚拟牌不入弃牌堆, 每回合限一次', () => {
  const g = Engine.newGame({
    seed: 36013,
    seats: ['player', 'enemy', 'ally'],
    playerHero: 'diaochan', enemyHero: 'guanyu', allyHero: 'zhangfei',
    roles: { player: '主公', enemy: '反贼', ally: '忠臣' }
  });
  resetSeats(g);
  g.turn = 'player';
  g.phase = 'play';
  g.player.hand = [c('tao', { id: 'cost-1' })];
  g.enemy.hand = []; // 关羽无杀 → 决斗败
  g.ally.hand = [c('sha', { id: 'a-sha' })];
  const enemyHpBefore = g.enemy.hp;
  const res = assertCardConservation(g, () =>
    Engine.useSkill(g, 'player', 'lijian', ['cost-1'], { targets: ['ally', 'enemy'] }));
  assert.equal(res.ok, true, res.message);
  assert.equal(g.enemy.hp, enemyHpBefore - 1, '关羽无杀败北受 1 伤 (来源=张飞)');
  assert.equal(g.ally.hand.length, 1, '目标先响应: 关羽出不了杀直接败, 张飞无需拼杀');
  assert.ok(!g.discard.some((x) => String(x.id).startsWith('lijian-juedou')), '虚拟决斗牌不进弃牌堆');
  const again = Engine.useSkill(g, 'player', 'lijian', ['x'], { targets: ['ally', 'enemy'] });
  assert.notEqual(again.ok, true, '每回合限一次');
});

// ═══════════════════ 8. 1v1 惰性 — 主公技/离间零回归 ═══════════════════════

test('8. 1v1 惰性: 主公技/离间在 1v1 中全部 no-op', () => {
  const game = Engine.newGame({ seed: 36014, playerHero: 'liubei', enemyHero: 'guanyu' });
  game.turn = 'player';
  game.phase = 'play';
  game.player.hand = [];
  const jj = Engine.useSkill(game, 'player', 'jijiang', [], { target: 'enemy' });
  assert.notEqual(jj.ok, true, '1v1 激将无蜀势力响应者 (敌对) → 失败');
  const g2 = Engine.newGame({ seed: 36015, playerHero: 'diaochan', enemyHero: 'guanyu' });
  g2.turn = 'player';
  g2.phase = 'play';
  g2.player.hand = [c('tao', { id: 't' })];
  const lj = Engine.useSkill(g2, 'player', 'lijian', ['t'], { targets: ['enemy', 'enemy'] });
  assert.notEqual(lj.ok, true, '1v1 离间凑不齐两名其他男性 → 失败');
  assert.equal(g2.player.hand.length, 1, '失败不消耗成本');
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
