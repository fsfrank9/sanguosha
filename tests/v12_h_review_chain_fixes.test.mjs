// v12 H 独立合规复核 — 链/响应域 3 处已验证缺陷的回归锁定 (全部 3 人场
// 特有, 1v1 红线未破; 修复前 npm run verify 全绿 = 均未被既有测试覆盖)。
//   1. 第三席用装备牌转化响应 → 座席归属二人硬编码 (game.player===state?
//      'player':'enemy') 把 ally 误判为 enemy, takeCard 清错槽 → 装备牌
//      同时留在装备区与弃牌堆 (无界造牌 / 装备永不失去)。
//   2. 第三席用丈八蛇矛两手当杀响应 → 同一硬编码令 takeCard 从 enemy 手牌
//      取不到 ally 的牌 → null → zbFirst.id 抛 TypeError, 整回合崩溃。
//   3. 铁索传导环 + 并发濒死 → transmitChainDamage 同步循环不检 pendingChoice,
//      受害者#1 濒死 ask 暂停时继续打受害者#2, #2 的 enterDying 被
//      pauseState.dying 单槽守卫吞掉 → #2 永久搁浅在 hp≤0/存活/无濒死态。
// 修复: seatOfState 座席归属泛化 (#1/#2); transmitChainDamage 改可挂起队列 +
// resumeSuspendedTurnFlowIfReady 的 chainTransmit 分支续跑 (#3)。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation, collectCardCensus } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }
function c(type, overrides = {}) { return Engine.makeTestCard(type, overrides); }

function build3p(opts = {}) {
  const game = Engine.newGame({
    seed: opts.seed || 90001,
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
    game[seat].chained = false;
  }
  return game;
}

function build1p1(opts = {}) {
  const game = Engine.newGame({
    seed: opts.seed || 90501,
    playerHero: opts.playerHero || 'guanyu',
    enemyHero: opts.enemyHero || 'caocao'
  });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const seat of ['player', 'enemy']) {
    game[seat].hand = [];
    game[seat].judgeArea = [];
    game[seat].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[seat].hp = game[seat].maxHp;
    game[seat].skillPreferences = {};
    game[seat].flags = {};
    game[seat].chuang = [];
    game[seat].chained = false;
  }
  return game;
}

function stock(game, n) { for (let i = 0; i < n; i += 1) game.deck.push(c('shan', { id: `dk-${i}`, suit: 'diamond' })); }

// ───── 缺陷 1: 第三席装备牌转化响应 不造牌 ─────

test('缺陷1: ally(关羽)武圣把装备武器当杀响应南蛮 → 武器离装备区入弃牌堆, 无守恒破坏', () => {
  const game = build3p({ seed: 90002, allyHero: 'guanyu' });
  stock(game, 8);
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('nanman', { id: 'nm-1' })];
  game.ally.equipment.weapon = c('guanshi', { id: 'w-ally', suit: 'heart', color: 'red' }); // 红武器→武圣可当杀
  game.ally.hand = []; // 无手牌, 只能用装备武器
  const res = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'nm-1'));
  assert.equal(res.ok, true, res.message);
  const census = collectCardCensus(game);
  assert.equal(census.zoneDuplicates.length, 0, '无牌同时在两区 (修复前 w-ally 同时在 discard 与 ally 装备槽)');
  assert.equal(game.ally.equipment.weapon, null, '武器已离开装备槽 (真正失去)');
  assert.ok(game.discard.some((x) => x.id === 'w-ally'), '武器入弃牌堆');
});

test('缺陷1 对照: 1v1 player 武圣装备武器当杀响应 → 行为不变 (无守恒破坏)', () => {
  const game = build1p1({ seed: 90003, playerHero: 'guanyu' });
  stock(game, 8);
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('nanman', { id: 'nm-c' })];
  game.player.equipment.weapon = c('guanshi', { id: 'w-plr', suit: 'heart', color: 'red' });
  game.player.hand = [];
  const res = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'nm-c'));
  assert.equal(res.ok, true, res.message);
  assert.equal(collectCardCensus(game).zoneDuplicates.length, 0);
  assert.equal(game.player.equipment.weapon, null);
});

// ───── 缺陷 2: 第三席丈八响应 不崩溃 ─────

test('缺陷2: ally(张飞)装备丈八, 两手当杀响应南蛮 → 正常化解不崩溃', () => {
  const game = build3p({ seed: 90004, allyHero: 'zhangfei' });
  stock(game, 8);
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('nanman', { id: 'nm-2' })];
  game.ally.equipment.weapon = c('zhangba', { id: 'zb-ally' });
  game.ally.hand = [c('shan', { id: 'h1', suit: 'club', color: 'black' }), c('shan', { id: 'h2', suit: 'spade', color: 'black' })];
  const allyHpBefore = game.ally.hp;
  const res = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'nm-2'));
  assert.equal(res.ok, true, res.message);
  assert.equal(game.ally.hp, allyHpBefore, 'ally 丈八两手当杀化解南蛮, 无伤 (修复前此处 TypeError 崩溃)');
  assert.equal(game.ally.hand.length, 0, '两张手牌作为丈八成本弃出');
});

// ───── 缺陷 3: 铁索环 + 并发濒死 无搁浅 ─────

test('缺陷3: 三席全横置, 火杀致环传导, 濒死挂起后续跑收敛无搁浅 (v13 传导起算序=当前回合角色)', () => {
  // v13 审计三轮: 传导顺序按官方"多角色同时结算从当前回合角色起顺时针"
  // (rule__principle.md) — 回合角色 player 自己也横置时最先受传导 (此前
  // 自受害者下家起算, ally 先受)。本测试同时保留原意图: 传导中濒死 ask
  // 挂起 → 救援 → 续跑剩余座席, 全程无 "0血却存活" 的搁浅角色。
  const game = build3p({ seed: 90005, playerHero: 'liubei', enemyHero: 'caocao', allyHero: 'huangzhong' });
  stock(game, 6);
  game.turn = 'player';
  game.phase = 'play';
  for (const seat of game.seats) game[seat].chained = true;
  game.enemy.hp = 4; // 直接受火杀存活
  game.ally.hp = 1;  // 传导致濒死, 无救牌
  game.ally.hand = [];
  game.player.hp = 1; // 主公, 传导致濒死
  game.player.hand = [c('fire_sha', { id: 'fs-1' }), c('tao', { id: 'p-tao' })];
  game.player.skillPreferences.dying = 'ask';
  const res = Engine.playCard(game, 'player', 'fs-1', { target: 'enemy' });
  assert.equal(res.ok, true, res.message);
  // player (回合角色) 先受传导致濒死 → ask 暂停; 用唯一的桃自救
  assert.ok(game.pendingChoice && game.pendingChoice.kind === 'dying-rescue', 'player 濒死暂停等待救援');
  assert.equal(game.pendingChoice.dyingActor, 'player', '传导自当前回合角色起 → player 先受');
  assert.ok(game.pauseState.chainTransmit, '传导队列保留待续跑 (ally 尚未受传导)');
  Engine.resolvePendingChoice(game, { use: true, cardId: 'p-tao' });
  // 续跑: ally 受传导致濒死, 无救 → 忠臣阵亡, 对局继续 (主公存活)
  const strandedAlive = game.seats.some((s) => game[s].hp <= 0 && game.phase !== 'gameover' && s !== 'ally');
  assert.equal(strandedAlive, false, '无 0血却存活且游戏继续的搁浅角色');
  assert.equal(game.player.hp, 1, '主公自救存活');
  assert.ok(game.ally.hp <= 0, 'ally 传导致死');
  assert.notEqual(game.phase, 'gameover', '忠臣阵亡, 对局继续');
  assert.equal(game.pauseState.chainTransmit, null, '传导队列已清');
});

test('缺陷3 对照: 1v1 铁索传导 (单一其他座席) 行为不变', () => {
  const game = build1p1({ seed: 90006, playerHero: 'liubei', enemyHero: 'caocao' });
  stock(game, 6);
  game.turn = 'player';
  game.phase = 'play';
  game.player.chained = true;
  game.enemy.chained = true;
  game.enemy.hp = 4;
  game.player.hand = [c('fire_sha', { id: 'fs-c' })];
  game.enemy.skillPreferences = { shanResponse: 'decline' };
  const enemyHpBefore = game.enemy.hp;
  const res = assertCardConservation(game, () => Engine.playCard(game, 'player', 'fs-c', { target: 'enemy' }));
  assert.equal(res.ok, true, res.message);
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '1v1: 对手受火杀 1 伤 (无第二座席可传导, 且自身已解连环)');
  assert.equal(game.pauseState.chainTransmit, null, '传导队列已清');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
