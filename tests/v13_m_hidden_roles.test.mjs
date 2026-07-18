// v13 M: 暗身份与推断 AI — 引擎面。
//   M1: hiddenRoles 暗置层 — 开关/逐席可见性表/死亡翻明先于胜负判定/
//       终局全翻明 (官方 glossary__card.md:11 "除主公外身份牌在死亡亮出
//       前不可见"; flow__death.md 亮出身份牌先于奖惩与胜负)。
//   M2: 去全知 — AI 知识层身份读取统一走 perceived* 感知路由; 明置恒等
//       (零回归); 暗置零全知 (未翻明座席身份互换不改变 AI 决策); 直读
//       零残留守护 (源码锚点, 白名单仅规则层/主公公开/自身自知)。
//   M3: 行为推断 — inferredLeaning 证据评分 (伤害方向/立场遥测) +
//       perceivedSideOf 阈值判读 + recordStance 记账口径 + 内奸骑墙。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SanguoshaEngine as Engine } from '../src/engine/game-engine.js';
import { StateRuntime } from '../src/engine/state.js';

const SEATS3 = ['player', 'enemy', 'ally'];
const SEATS5 = ['player', 'enemy', 'ally', 'ally2', 'ally3'];

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

// 默认预设 5 席: player=主公 enemy=反贼 ally=忠臣 ally2=反贼 ally3=内奸。
function newHidden5(seed = 61001, extra = {}) {
  return Engine.newGame(Object.assign({ seed, seats: SEATS5.slice(), hiddenRoles: true }, extra));
}

function reset(game) {
  for (const seat of game.seats) {
    game[seat].hand = [];
    game[seat].judgeArea = [];
    game[seat].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[seat].hp = game[seat].maxHp;
    game[seat].skillPreferences = {};
    game[seat].flags = {};
  }
  game.deck = [];
  game.discard = [];
  game.log = [];
  game.aggressionLog = [];
  game.stanceLog = [];
  game.turn = game.firstActor;
  game.phase = 'play';
  return game;
}

// ───── M1: 暗置层 — 开关与可见性表 ──────────────────────────────────

test('M1: hiddenRoles 开局 — 主公恒翻明, 其余座席暗置', () => {
  const game = newHidden5();
  assert.equal(game.hiddenRoles, true);
  assert.ok(game.roleRevealed, 'roleRevealed 逐席可见性表已建');
  for (const seat of game.seats) {
    const expected = game.roles[seat] === '主公';
    assert.equal(game.roleRevealed[seat], expected, `${seat}(${game.roles[seat]}) 可见性`);
    assert.equal(StateRuntime.isRoleRevealed(game, seat), expected);
  }
});

test('M1: 明置缺省 (未传 hiddenRoles) — 全员翻明, isRoleRevealed 恒 true', () => {
  const game = Engine.newGame({ seed: 61002, seats: SEATS5.slice() });
  assert.equal(game.hiddenRoles, false);
  for (const seat of game.seats) {
    assert.equal(game.roleRevealed[seat], true);
    assert.equal(StateRuntime.isRoleRevealed(game, seat), true);
  }
});

test('M1: 1v1 无身份场 — hiddenRoles 选项被强制关闭 (仅 ≥3 席身份场可开)', () => {
  const game = Engine.newGame({ seed: 61003, hiddenRoles: true });
  assert.equal(game.seats.length, 2);
  assert.equal(game.hiddenRoles, false);
});

test('M1: 死亡翻明 — 暗置座席阵亡即亮出身份牌 (先于奖惩结算)', () => {
  const game = reset(newHidden5(61004));
  // ally2=反贼 (暗置) 被邻座 ally(忠臣) 杀死 → 翻明 + 日志 + 击杀奖励照常
  game.turn = 'ally';
  game.ally2.hp = 1;
  game.ally2.hand = [];
  game.deck = [c('shan', { id: 'm1-d1' }), c('shan', { id: 'm1-d2' }), c('shan', { id: 'm1-d3' })];
  game.ally.hand = [c('sha', { id: 'm1-sha' })];
  assert.equal(game.roleRevealed.ally2, false, '前置: ally2 暗置');
  const result = Engine.playCard(game, 'ally', 'm1-sha', { target: 'ally2' });
  assert.ok(result.ok, result.message);
  assert.equal(game.ally2.hp, 0);
  assert.equal(game.roleRevealed.ally2, true, '阵亡 → 翻明');
  assert.ok(game.log.some((line) => line.includes('亮出身份牌') && line.includes('反贼')),
    '日志含亮出身份牌: ' + game.log.slice(-6).join(' | '));
  assert.equal(game.ally.hand.length, 3, '击杀反贼摸三张 (奖惩在翻明之后照常结算)');
});

test('M1: 终局全翻明 — 胜负判定同步亮出所有在场身份牌', () => {
  // 3 席暗置: player=主公 enemy=反贼 ally=忠臣; 反贼死 → 主忠胜 + 全翻明。
  const game = reset(Engine.newGame({ seed: 61005, seats: SEATS3.slice(), hiddenRoles: true }));
  assert.equal(game.roleRevealed.ally, false, '前置: 忠臣暗置');
  game.turn = 'player';
  game.enemy.hp = 1;
  game.enemy.hand = [];
  game.player.hand = [c('sha', { id: 'm1-go' })];
  const result = Engine.playCard(game, 'player', 'm1-go', { target: 'enemy' });
  assert.ok(result.ok, result.message);
  assert.equal(game.phase, 'gameover');
  assert.equal(game.winner, 'lordSide');
  for (const seat of game.seats) {
    assert.equal(game.roleRevealed[seat], true, `终局 ${seat} 翻明`);
  }
});

// ───── M2: 直读零残留守护 (源码锚点) ────────────────────────────────
// AI 知识层不得直读 isHostileSeat/hostileSeats/hostileFirstPool — 统一走
// perceived* 感知路由。白名单 (计数锁定, 新增直读必须先过此测试评审):
//   ai.js ×1        — 黄天献闪: 目标为确认主公 (身份恒公开, 直读合法)
//   skills.js ×2    — 激将代打(发起者为主公)/黄天面板(目标主公) 同口径
//   game-engine.js ×1 — lordAidAiderSeats: 规则层求助资格 (对象恒为主公)
//   其余引擎文件 ×0

const SRC = new URL('../src/engine/', import.meta.url);
function srcText(name) {
  return fs.readFileSync(new URL(name, SRC), 'utf8');
}
function countOf(text, needle) {
  return text.split(needle).length - 1;
}

test('M2 守护: 引擎各文件直读计数锁定 (白名单外零残留)', () => {
  const budget = {
    'ai.js': { isHostileSeat: 1, hostileSeats: 0, hostileFirstPool: 0 },
    'skills.js': { isHostileSeat: 2, hostileSeats: 0, hostileFirstPool: 0 },
    'sha-flow.js': { isHostileSeat: 0, hostileSeats: 0, hostileFirstPool: 0 },
    'tricks.js': { isHostileSeat: 0, hostileSeats: 0, hostileFirstPool: 0 },
    'game-engine.js': { isHostileSeat: 1, hostileSeats: 0, hostileFirstPool: 0 },
    'damage-dying.js': { isHostileSeat: 0, hostileSeats: 0, hostileFirstPool: 0 },
  };
  for (const [file, limits] of Object.entries(budget)) {
    const text = srcText(file);
    for (const [fn, allowed] of Object.entries(limits)) {
      assert.equal(countOf(text, `StateRuntime.${fn}(`), allowed,
        `${file} 直读 StateRuntime.${fn} 计数应为 ${allowed} (白名单见本测试头注; 新增直读须先评审)`);
    }
  }
});

test('M2 守护: 直读别名赋值零匹配 (防 var f = StateRuntime.isHostileSeat 绕过)', () => {
  // 计数锁只匹配 `StateRuntime.fn(` 调用形态 — 别名赋值后调用可绕过。
  // 本锚点封掉赋值形态 (当前全文件零匹配, 零误伤成本的加固)。
  const files = ['ai.js', 'skills.js', 'sha-flow.js', 'tricks.js', 'game-engine.js', 'damage-dying.js'];
  for (const file of files) {
    assert.doesNotMatch(srcText(file),
      /=\s*StateRuntime\.(isHostileSeat|hostileSeats|hostileFirstPool)\b/,
      `${file} 不得将直读函数赋值给别名`);
  }
});

test('M2 守护: ai.js 唯一直读位于黄天主公检查 (锚定上下文)', () => {
  const ai = srcText('ai.js');
  const idx = ai.indexOf('StateRuntime.isHostileSeat(');
  const context = ai.slice(Math.max(0, idx - 300), idx + 100);
  assert.ok(context.includes("roles[seat] === '主公'"),
    'ai.js 直读必须紧邻主公身份确认 (主公身份恒公开)');
});

test('M2 守护: 感知路由已接管 AI 知识层 (perceived* 存在性锚点)', () => {
  const ai = srcText('ai.js');
  assert.ok(countOf(ai, 'StateRuntime.perceivedHostileSeats(') >= 1, 'aiPrimaryFoe 等走感知敌对席位');
  assert.ok(countOf(ai, 'StateRuntime.perceivedHostile(') >= 2, '目标过滤走感知敌对');
  assert.ok(countOf(ai, 'StateRuntime.perceivedSideOf(') >= 2, '推断阵营参与目标评分');
  const skills = srcText('skills.js');
  assert.equal(countOf(skills, 'StateRuntime.perceivedHostileFirstPool('), 3, '天香/雷击/突袭 敌先池已路由');
  assert.ok(countOf(srcText('sha-flow.js'), 'StateRuntime.perceivedHostileSeats(') >= 1, '杀缺省目标已路由');
  assert.ok(countOf(srcText('damage-dying.js'), 'StateRuntime.perceivedHostile(') >= 1, '救援立场已路由');
});

// ───── M2: 明置恒等 (感知路由零回归) ────────────────────────────────

test('M2: 明置模式 perceived* 与真值直读全对恒等 (5 席全 viewer×seat)', () => {
  const game = reset(Engine.newGame({ seed: 62001, seats: SEATS5.slice() }));
  for (const viewer of game.seats) {
    assert.deepEqual(
      StateRuntime.perceivedHostileSeats(game, viewer),
      StateRuntime.hostileSeats(game, viewer), `${viewer} 敌对席位集恒等`);
    for (const seat of game.seats) {
      if (seat === viewer) continue;
      assert.equal(
        StateRuntime.perceivedHostile(game, viewer, seat),
        StateRuntime.isHostileSeat(game, viewer, seat), `${viewer}→${seat} 敌对判定恒等`);
      assert.equal(
        StateRuntime.perceivedSideOf(game, viewer, seat),
        StateRuntime.sideOf(game, seat), `${viewer}→${seat} 阵营感知恒等`);
    }
  }
});

// ───── M2: 暗置零全知 ───────────────────────────────────────────────

test('M2: 零全知 — 未翻明座席身份互换, AI 感知与目标决策不变', () => {
  const game = reset(newHidden5(62002));
  // 无任何证据: 双 log 空。viewer=enemy(反贼, 自知): ally(忠)/ally2(反)
  // 均暗置 → 感知一律 未知→敌对, 阵营感知 null。
  const snapshot = (g) => ({
    sideAlly: StateRuntime.perceivedSideOf(g, 'enemy', 'ally'),
    sideAlly2: StateRuntime.perceivedSideOf(g, 'enemy', 'ally2'),
    hostileAlly: StateRuntime.perceivedHostile(g, 'enemy', 'ally'),
    hostileAlly2: StateRuntime.perceivedHostile(g, 'enemy', 'ally2'),
    pick: Engine.aiPickHostileTarget(g, 'enemy', ['ally', 'ally2']),
  });
  // 等资源候选 (血线/手牌/装备全同, reset 已归一): 评分并列时严格大于
  // 比较保留顺位首候选 — pick 仅可能被身份泄漏分移动 (+8 已翻明反贼 /
  // +4 推断反贼)。若感知层误直读暗置身份, 泄漏分跟着真实身份走, 互换
  // 后 pick 必从 ally 翻到 ally2 (或反向), 本 deepEqual 即失败。收官
  // review: 此前用血线差 (+12) 挑确定目标, 反而盖过 ±8 泄漏信号。
  const before = snapshot(game);
  assert.equal(before.sideAlly, null, '无证据 → 阵营未知');
  assert.equal(before.sideAlly2, null);
  assert.equal(before.hostileAlly, true, '未知 → 敌对缺省');
  assert.equal(before.hostileAlly2, true);
  assert.equal(before.pick, 'ally', '等资源并列 → 顺位首候选');
  // 互换两暗置座席的真实身份 (忠↔反) — 全知 AI 会改变判断, 零全知不会。
  const tmp = game.roles.ally;
  game.roles.ally = game.roles.ally2;
  game.roles.ally2 = tmp;
  assert.deepEqual(snapshot(game), before, '身份互换后感知/决策逐项不变 (零全知)');
});

test('M2: 暗置翻明后 → 感知回落真值直读 (忠臣视角识别已翻明反贼)', () => {
  const game = reset(newHidden5(62003));
  game.roleRevealed.ally2 = true; // ally2=反贼 翻明
  assert.equal(StateRuntime.perceivedSideOf(game, 'ally', 'ally2'), 'rebelSide');
  assert.equal(StateRuntime.perceivedHostile(game, 'ally', 'ally2'), true, '忠臣 vs 已翻明反贼');
  assert.equal(StateRuntime.perceivedHostile(game, 'enemy', 'ally2'), false, '反贼 vs 已翻明同伙 → 非敌对');
});

test('M2: 内奸视角 — 暗置下全场敌对 (骑墙偏好在目标评分层)', () => {
  const game = reset(newHidden5(62004));
  for (const seat of game.seats) {
    if (seat === 'ally3') continue;
    assert.equal(StateRuntime.perceivedHostile(game, 'ally3', seat), true, `内奸→${seat}`);
  }
  assert.deepEqual(
    StateRuntime.perceivedHostileSeats(game, 'ally3').slice().sort(),
    game.seats.filter((s) => s !== 'ally3').sort());
});

// ───── M3: 推断证据评分 ─────────────────────────────────────────────

test('M3: inferredLeaning — 对主公出伤害 ×3 (强反贼信号) → 感知反贼', () => {
  const game = reset(newHidden5(63001));
  game.aggressionLog.push({ source: 'ally', target: 'player', amount: 1 }); // 主公=player
  assert.equal(StateRuntime.inferredLeaning(game, 'ally'), 3);
  assert.equal(StateRuntime.perceivedSideOf(game, 'enemy', 'ally'), 'rebelSide', '≥阈值2 → 判反');
  // 忠臣 viewer (ally 已被打包换位? 不 — viewer=ally2 反贼): 判为同侧非敌对
  assert.equal(StateRuntime.perceivedHostile(game, 'ally2', 'ally'), false, '反贼视角: 推断同伙 → 非敌对');
});

test('M3: inferredLeaning — 打已翻明反贼 ×2 (主忠信号) → 感知主忠侧', () => {
  const game = reset(newHidden5(63002));
  game.roleRevealed.ally2 = true; // 反贼翻明
  game.aggressionLog.push({ source: 'ally', target: 'ally2', amount: 1 });
  assert.equal(StateRuntime.inferredLeaning(game, 'ally'), -2);
  assert.equal(StateRuntime.perceivedSideOf(game, 'enemy', 'ally'), 'lordSide', '≤-2 → 判主忠');
  assert.equal(StateRuntime.perceivedHostile(game, 'enemy', 'ally'), true, '反贼视角: 推断主忠 → 敌对');
});

test('M3: inferredLeaning — 主公针对谁, 谁嫌疑微增 (+amount, 单独不过阈值)', () => {
  const game = reset(newHidden5(63003));
  game.aggressionLog.push({ source: 'player', target: 'ally', amount: 1 });
  assert.equal(StateRuntime.inferredLeaning(game, 'ally'), 1);
  assert.equal(StateRuntime.perceivedSideOf(game, 'enemy', 'ally'), null, '证据不足仍未知');
});

test('M3: 立场遥测权重 — aid=4 / rescue=3 / wuxie=2, 方向按受益/受害侧', () => {
  const game = reset(newHidden5(63004));
  // 救主公 → -3 (主忠信号)
  StateRuntime.recordStance(game, { type: 'rescue', source: 'ally', beneficiary: 'player' });
  assert.equal(StateRuntime.inferredLeaning(game, 'ally'), -3);
  // 替主公求助响应 → -4, 累计 -7
  StateRuntime.recordStance(game, { type: 'aid', source: 'ally', beneficiary: 'player' });
  assert.equal(StateRuntime.inferredLeaning(game, 'ally'), -7);
  // 无懈指向主公 (against) → +2: 反贼信号部分抵消
  StateRuntime.recordStance(game, { type: 'wuxie', source: 'ally', against: 'player' });
  assert.equal(StateRuntime.inferredLeaning(game, 'ally'), -5);
  assert.equal(StateRuntime.perceivedSideOf(game, 'enemy', 'ally'), 'lordSide');
});

test('M3: recordStance 记账口径 — 自利不记, 环形 60 上限', () => {
  const game = reset(newHidden5(63005));
  StateRuntime.recordStance(game, { type: 'rescue', source: 'ally', beneficiary: 'ally' });
  assert.equal((game.stanceLog || []).length, 0, '自救不算立场证据');
  StateRuntime.recordStance(game, { type: 'wuxie', source: 'ally', against: 'ally' });
  assert.equal((game.stanceLog || []).length, 0, '自保无懈不算');
  for (let i = 0; i < 65; i += 1) {
    StateRuntime.recordStance(game, { type: 'wuxie', source: 'ally', against: 'player' });
  }
  assert.equal(game.stanceLog.length, 60, '环形上限 60 (与 aggressionLog 同口径)');
});

test('M3: 暗置证据不指向未翻明座席 — 打暗置席不产生阵营信号', () => {
  const game = reset(newHidden5(63006));
  game.aggressionLog.push({ source: 'ally', target: 'ally2', amount: 2 }); // ally2 暗置
  assert.equal(StateRuntime.inferredLeaning(game, 'ally'), 0, '受害者身份未知 → 无信号');
});

// ───── M3: 玩家代打求助遥测 (收官 review 修复回归) ──────────────────
// 非 AOE 两分支 (激将决斗链 / 护驾杀响应) 此前漏记玩家 aid 立场证据
// (AOE 双分支与 AI 接力路径均有记账) — 镜像补齐后此处钉死。

test('M3 遥测: 玩家激将代打 (决斗链分支) → stanceLog 记 aid 证据', () => {
  const g = Engine.newGame({
    seed: 63009,
    seats: SEATS3.slice(),
    playerHero: 'guanyu', enemyHero: 'caocao', allyHero: 'liubei',
    roles: { player: '忠臣', enemy: '反贼', ally: '主公' },
    firstActor: 'enemy'
  });
  reset(g);
  g.turn = 'enemy';
  g.enemy.hand = [c('juedou', { id: 'm3-jd' })];
  g.ally.hand = [];
  g.player.hand = [c('sha', { id: 'm3-sha' })];
  const res = Engine.playCard(g, 'enemy', 'm3-jd', { target: 'ally' });
  assert.ok(res.ok, res.message);
  assert.equal(g.pendingChoice && g.pendingChoice.kind, 'jijiang-aid');
  const r2 = Engine.resolvePendingChoice(g, { use: true });
  assert.ok(r2.ok, r2.message);
  assert.equal(g.player.hand.length, 0, '玩家的杀已代打');
  assert.ok((g.stanceLog || []).some((e) => e.type === 'aid' && e.source === 'player' && e.beneficiary === 'ally'),
    '决斗链代打记 aid 立场证据: ' + JSON.stringify(g.stanceLog));
});

test('M3 遥测: 玩家护驾代闪 (杀响应分支) → stanceLog 记 aid 证据', () => {
  const g = Engine.newGame({
    seed: 63010,
    seats: SEATS3.slice(),
    playerHero: 'xiahoudun', enemyHero: 'guanyu', allyHero: 'caocao',
    roles: { player: '忠臣', enemy: '反贼', ally: '主公' },
    firstActor: 'enemy'
  });
  reset(g);
  g.turn = 'enemy';
  g.enemy.hand = [c('sha', { id: 'm3-esha' })];
  g.ally.hand = [];
  g.player.hand = [c('shan', { id: 'm3-shan' })];
  const res = Engine.playCard(g, 'enemy', 'm3-esha', { target: 'ally' });
  assert.ok(res.ok, res.message);
  assert.equal(g.pendingChoice && g.pendingChoice.kind, 'hujia-aid');
  const r2 = Engine.resolvePendingChoice(g, { use: true });
  assert.ok(r2.ok, r2.message);
  assert.equal(g.ally.hp, g.ally.maxHp, '护驾成功主公无伤');
  assert.ok((g.stanceLog || []).some((e) => e.type === 'aid' && e.source === 'player' && e.beneficiary === 'ally'),
    '杀响应代闪记 aid 立场证据: ' + JSON.stringify(g.stanceLog));
});

// ───── M3: 内奸骑墙 (打压感知强势侧 +15) ────────────────────────────

test('M3: 内奸骑墙 — 主忠侧强势 → 打忠臣; 反贼侧强势 → 打反贼', () => {
  // 明置 5 席 (感知=真值, 骑墙在开放身份场同样生效)。内奸=ally3。
  // 候选 ally(忠臣) vs ally2(反贼) 血线/手牌全同 — 反贼有 +8 击杀奖励
  // 基线, 骑墙 +15 应能翻转。
  const game = reset(Engine.newGame({ seed: 63007, seats: SEATS5.slice() }));
  assert.equal(game.roles.ally3, '内奸');
  // 主忠侧强势: 主公满装高血 → lordSum > rebelSum
  game.player.hp = 5;
  game.player.hand = [c('shan'), c('shan'), c('shan'), c('shan')];
  game.enemy.hp = 1;
  game.enemy.hand = [];
  const pickLordStrong = Engine.aiPickHostileTarget(game, 'ally3', ['ally', 'ally2']);
  assert.equal(pickLordStrong, 'ally', '主忠强势 → 骑墙打压忠臣 (+15 胜过反贼 +8)');
  // 反贼侧强势: 反转资源
  game.player.hp = 1;
  game.player.hand = [];
  game.enemy.hp = 4;
  game.enemy.hand = [c('shan'), c('shan'), c('shan'), c('shan')];
  game.ally2.hp = 4;
  const pickRebelStrong = Engine.aiPickHostileTarget(game, 'ally3', ['ally', 'ally2']);
  assert.equal(pickRebelStrong, 'ally2', '反贼强势 → 骑墙打压反贼 (15+8)');
});

test('M3: 非内奸不骑墙 — 反贼多候选仍按旧口径评分 (集火低血线)', () => {
  const game = reset(Engine.newGame({ seed: 63008, seats: SEATS5.slice() }));
  game.ally.hp = 1; // 忠臣残血
  game.ally3.hp = 4;
  const pick = Engine.aiPickHostileTarget(game, 'enemy', ['ally', 'ally3']);
  assert.equal(pick, 'ally', '反贼视角无骑墙分量, 收割残血 (hp1 +30)');
});
