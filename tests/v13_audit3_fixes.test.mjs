// v13 第三轮全量合规审计 — 修复批回归测试 (docs/audit/2026-07-16 纪要)。
// 覆盖: 铁索无懈窗口 / AOE 逐目标无懈 / 青龙锁目标+可选 / 来源武器效果随
// 天香转移过期 (青釭/古锭/寒冰) / 银月枪过八卦 / 雷击-鬼道 3p 座次泛化 /
// 离间过目标保护 / 不屈入濒死责任链 / 距离剔除亡者 / 酒矩阵自洽。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function build(opts) {
  opts = opts || {};
  const seats = opts.seats || ['player', 'enemy'];
  const game = Engine.newGame({
    seed: opts.seed || 13401,
    seats: seats.length > 2 ? seats : undefined,
    playerHero: opts.playerHero || 'liubei',
    enemyHero: opts.enemyHero || 'lvmeng',
    allyHero: opts.allyHero || (seats.length > 2 ? 'huangzhong' : undefined)
  });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const actor of seats) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].flags = {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp;
    game[actor].skillPreferences = {};
  }
  game.turn = opts.turn || 'player';
  game.phase = 'play';
  return game;
}

// ───── 铁索连环: 无懈窗口 ────────────────────────────────────────────

test('铁索连环使用可被无懈抵消 (逐目标); 重铸不开窗', () => {
  const game = build();
  game.player.hand = [c('tiesuo', { id: 'ts-1' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' })];
  game.enemy.hp = 2; // AI EV: 将被横置且血线告急 → 无懈
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'player', 'ts-1', { targets: ['enemy'] });
    assert.equal(r.ok, true, r.message);
  });
  assert.ok(!game.enemy.chained, '横置被无懈抵消');
  assert.ok(game.discard.some((x) => x.id === 'e-wx'), '无懈已消耗');

  // 重铸: 不开无懈窗口
  const game2 = build();
  game2.player.hand = [c('tiesuo', { id: 'ts-2' })];
  game2.enemy.hand = [c('wuxie', { id: 'e-wx2' })];
  game2.enemy.hp = 2;
  game2.deck = [c('sha', { id: 'd1' })];
  Engine.playCard(game2, 'player', 'ts-2', { mode: 'recast' });
  assert.ok(game2.enemy.hand.some((x) => x.id === 'e-wx2'), '重铸不是使用 → 无懈未询问');
});

test('铁索连环 3p 双目标: 一张无懈只抵消一个目标, 另一目标照常横置', () => {
  const game = build({ seats: ['player', 'enemy', 'ally'], seed: 13402 });
  game.player.hand = [c('tiesuo', { id: 'ts-3' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' })];
  game.enemy.hp = 2;
  game.ally.hand = [];
  const r = Engine.playCard(game, 'player', 'ts-3', { targets: ['enemy', 'ally'] });
  assert.equal(r.ok, true, r.message);
  assert.ok(!game.enemy.chained, 'enemy 的横置被其无懈抵消');
  assert.ok(game.ally.chained, 'ally 照常横置 (无懈只消一个目标)');
});

// ───── AOE 逐目标无懈 (3p) ───────────────────────────────────────────

test('南蛮 3p: 一张无懈只抵消持有者自己的目标效果, 其余座席照常结算', () => {
  const game = build({ seats: ['player', 'enemy', 'ally'], seed: 13403 });
  game.player.hand = [c('nanman', { id: 'nm-1' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' })]; // 无杀, hp<=2 → EV 无懈
  game.enemy.hp = 2;
  game.ally.hand = []; // 无杀无无懈 → 受伤
  const allyHp = game.ally.hp;
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'player', 'nm-1');
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.enemy.hp, 2, 'enemy 用无懈抵消自己的目标效果');
  assert.equal(game.ally.hp, allyHp - 1, 'ally 照常受南蛮 1 伤 (无懈不再全场抵消)');
});

test('评审收口: AOE 逐目标无懈链跳过来源 — 出牌者不被询问无懈自己的南蛮', () => {
  const game = build({ seed: 13421 });
  game.player.hand = [c('nanman', { id: 'nm-src' }), c('wuxie', { id: 'p-wx' })];
  game.player.skillPreferences.wuxieResponse = 'ask';
  game.enemy.hand = [];
  const hp = game.enemy.hp;
  const r = Engine.playCard(game, 'player', 'nm-src');
  assert.equal(r.ok, true, r.message);
  assert.equal(game.pendingChoice, null, '出牌者不被询问无懈自己的牌');
  assert.equal(game.enemy.hp, hp - 1, '南蛮照常结算');
  assert.ok(game.player.hand.some((x) => x.id === 'p-wx'), '无懈保留');
});

test('评审收口: 五谷出牌者不被询问无懈自己的牌 (首询锚点=picker 后的既有缺口)', () => {
  const game = build({ seed: 13422 });
  game.player.hand = [c('wugu', { id: 'wg-src' }), c('wuxie', { id: 'p-wx' })];
  game.player.skillPreferences.wuxieResponse = 'ask';
  game.player.skillPreferences.wugu = 'auto';
  game.enemy.hand = [];
  game.deck = [c('sha', { id: 'r1' }), c('shan', { id: 'r2' })];
  const r = Engine.playCard(game, 'player', 'wg-src');
  assert.equal(r.ok, true, r.message);
  assert.equal(game.pendingChoice, null, '出牌者 (首个 picker) 不被询问无懈自己的五谷');
});

test('评审收口: 天香 ask × 万箭 — 挂起转移后 AOE 队列续跑剩余座席', () => {
  const game = build({ seats: ['player', 'enemy', 'ally'], seed: 13423, playerHero: 'xiaoqiao' });
  game.turn = 'enemy';
  game.enemy.hand = [c('wanjian', { id: 'e-wj' })];
  game.player.hand = [c('tao', { id: 'p-heart', suit: 'heart', color: 'red' })];
  game.player.skillPreferences.tianxiang = 'ask';
  game.ally.hand = []; // 无闪 → 受 1 伤
  game.deck = [c('shan', { id: 'd1' }), c('shan', { id: 'd2' }), c('shan', { id: 'd3' })];
  const allyHp = game.ally.hp;
  const enemyHp = game.enemy.hp;
  Engine.playCard(game, 'enemy', 'e-wj');
  // AOE 首席 (座次环 enemy 下家 = ally 或 player, 依座次; player 受击时挂起)
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'tianxiang-ask', '万箭对小乔的伤害挂起天香询问');
  const r = Engine.resolvePendingChoice(game, { cardId: 'p-heart', target: 'enemy' });
  assert.equal(r.ok, true, r.message);
  assert.equal(game.player.hp, game.player.maxHp, '小乔转移未受伤');
  assert.equal(game.enemy.hp, enemyHp - 1, '伤害转移到 enemy');
  assert.equal(game.ally.hp, allyHp - 1, 'AOE 队列续跑, ally 照常结算');
  assert.equal(game.pauseState.aoe, null, 'AOE 队列收敛清空');
});

test('南蛮 1v1 零回归: 无懈抵消唯一目标 → 无人受伤', () => {
  const game = build({ seed: 13404 });
  game.player.hand = [c('nanman', { id: 'nm-2' })];
  game.enemy.hand = [c('wuxie', { id: 'e-wx' })];
  game.enemy.hp = 2;
  Engine.playCard(game, 'player', 'nm-2');
  assert.equal(game.enemy.hp, 2, '唯一目标被无懈 → 不受伤');
  assert.ok(game.discard.some((x) => x.id === 'nm-2'), '南蛮进弃牌堆');
});

// ───── 青龙偃月刀 ────────────────────────────────────────────────────

test('青龙续杀锁定同一目标 (3p 不改指他人)', () => {
  const game = build({ seats: ['player', 'enemy', 'ally'], seed: 13405 });
  game.player.equipment.weapon = c('qinglong', { id: 'p-ql' });
  game.player.hand = [c('sha', { id: 's1' }), c('sha', { id: 's2' })];
  // ally 是目标: 有一闪挡首杀, 续杀命中; enemy 满血旁观
  game.ally.hand = [c('shan', { id: 'a-shan' })];
  const enemyHp = game.enemy.hp;
  const allyHp = game.ally.hp;
  const r = Engine.playCard(game, 'player', 's1', { target: 'ally' });
  assert.equal(r.ok, true, r.message);
  assert.equal(game.ally.hp, allyHp - 1, '续杀仍指向原目标 ally');
  assert.equal(game.enemy.hp, enemyHp, 'enemy 未被改指');
});

test('青龙 skillPreferences.qinglong=decline → 不续杀 (可选效果)', () => {
  const game = build({ seed: 13406 });
  game.player.equipment.weapon = c('qinglong', { id: 'p-ql' });
  game.player.skillPreferences.qinglong = 'decline';
  game.player.hand = [c('sha', { id: 's1' }), c('sha', { id: 's2' })];
  game.enemy.hand = [c('shan', { id: 'e-shan' })];
  const hp = game.enemy.hp;
  Engine.playCard(game, 'player', 's1');
  assert.equal(game.enemy.hp, hp, '闪避后不续杀');
  assert.ok(game.player.hand.some((x) => x.id === 's2'), '第二张杀保留');
});

// ───── 来源武器效果随天香转移过期 ────────────────────────────────────

test('青釭剑无视防具不穿透天香转移落点的藤甲 (官方: 转移时青釭效果结束)', () => {
  const game = build({ playerHero: 'xiaoqiao', enemyHero: 'lvmeng', seed: 13407 });
  game.turn = 'enemy';
  game.enemy.equipment.weapon = c('qinggang', { id: 'e-qg' });
  game.enemy.equipment.armor = c('tengjia', { id: 'e-tj' }); // 转移落点自己有藤甲
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.player.hand = [c('tao', { id: 'p-heart', suit: 'heart', color: 'red' })];
  game.player.skillPreferences.tianxiang = 'always';
  const hp = game.enemy.hp;
  Engine.playCard(game, 'enemy', 'e-sha');
  // 小乔 always 转移给对手 (攻击者自己) — 普通杀 vs 藤甲: 青釭已过期 →
  // 藤甲防止 (转移落点按自身防具结算)
  assert.equal(game.enemy.hp, hp, '藤甲防止转移伤害 (青釭不再无视)');
  assert.ok(game.log.some((l) => l.includes('【天香】')), '天香已发动');
});

test('古锭刀不对天香转移落点重新判定 (+1 不再误触发)', () => {
  const game = build({ playerHero: 'xiaoqiao', enemyHero: 'lvmeng', seed: 13408 });
  game.turn = 'enemy';
  game.enemy.equipment.weapon = c('guding', { id: 'e-gd' });
  game.enemy.hand = [c('sha', { id: 'e-sha' })]; // 出杀后 enemy 零手牌
  game.player.hand = [c('tao', { id: 'p-heart', suit: 'heart', color: 'red' })];
  game.player.skillPreferences.tianxiang = 'always';
  game.deck = [c('shan', { id: 'd1' }), c('shan', { id: 'd2' }), c('shan', { id: 'd3' })];
  const hp = game.enemy.hp;
  Engine.playCard(game, 'enemy', 'e-sha');
  // 转移给攻击者 (零手牌): 古锭若误判转移落点会 +1 → 2 伤; 修复后 1 伤
  assert.equal(game.enemy.hp, hp - 1, '转移伤害不吃古锭 +1');
});

// ───── 银月枪过八卦 ──────────────────────────────────────────────────

test('银月枪的打闪需求给八卦先行判定机会', () => {
  const game = build({ seed: 13409 });
  game.turn = 'enemy';
  game.enemy.equipment.weapon = c('yinyue', { id: 'e-yy' });
  game.player.equipment.armor = c('bagua', { id: 'p-bg' });
  game.player.hand = []; // 无真闪
  // 银月触发源: enemy 回合外打出黑牌 — 直接驱动 triggerYinyueQiang 场景:
  // 玩家回合出杀, enemy 用黑闪响应 → 触发银月
  game.turn = 'player';
  game.player.hand = [c('sha', { id: 'p-sha' })];
  game.enemy.hand = [c('shan', { id: 'e-shan', suit: 'spade', color: 'black' })];
  game.deck = [c('tao', { id: 'j-red', suit: 'heart' })]; // 八卦红判定
  const hp = game.player.hp;
  Engine.playCard(game, 'player', 'p-sha');
  assert.equal(game.player.hp, hp, '八卦红判定视为打出闪 → 银月不造成伤害');
  assert.ok(game.log.some((l) => l.includes('【八卦阵】判定为红色')), '八卦已判定');
});

// ───── 雷击 / 鬼道 3p 座次泛化 ───────────────────────────────────────

test('雷击 3p: 张角为第三席时目标不再恒为 player (敌对优先)', () => {
  const game = build({ seats: ['player', 'enemy', 'ally'], allyHero: 'zhangjiao', seed: 13410 });
  game.roles = { player: '主公', enemy: '反贼', ally: '忠臣' };
  // ally 张角使用闪 → 雷击。敌对座席 = enemy (反贼)。
  game.turn = 'player';
  game.player.hand = [c('sha', { id: 'p-sha' })];
  game.ally.hand = [c('shan', { id: 'a-shan' })];
  // 判定牌黑桃 → 雷击命中
  game.deck = [c('sha', { id: 'j-spade', suit: 'spade', rank: '7' })];
  const enemyHp = game.enemy.hp;
  const playerHp = game.player.hp;
  const r = Engine.playCard(game, 'player', 'p-sha', { target: 'ally' });
  assert.equal(r.ok, true, r.message);
  assert.equal(game.enemy.hp, enemyHp - 2, '雷击目标 = 敌对座席 enemy (2 点雷伤)');
  assert.equal(game.player.hp, playerHp, 'player (同阵营) 未被误指');
});

test('鬼道 3p: 第三席张角可替换他人判定牌', () => {
  const game = build({ seats: ['player', 'enemy', 'ally'], allyHero: 'zhangjiao', seed: 13411 });
  // player 判定区有乐 → 判定; ally 张角持黑牌 auto 改判
  game.player.judgeArea = [c('lebusishu', { id: 'p-lbss' })];
  game.ally.hand = [c('sha', { id: 'a-black', suit: 'spade', color: 'black' })];
  // 原判定红桃 (乐判定成功不跳过); 张角 AI auto 替换为黑牌 → 跳过出牌
  game.deck = [c('sha', { id: 'd1' }), c('sha', { id: 'd2' }),
    c('tao', { id: 'j-heart', suit: 'heart' })];
  Engine.startTurn(game, 'player');
  assert.ok(game.log.some((l) => l.includes('【鬼道】')), '第三席鬼道可达');
});

// ───── 离间过目标保护 (空城) ─────────────────────────────────────────

test('离间: 空城 (零手牌诸葛亮) 不能被指定为视为决斗的目标', () => {
  const game = build({ seats: ['player', 'enemy', 'ally'], seed: 13412, playerHero: 'diaochan', enemyHero: 'zhugeliang', allyHero: 'guanyu' });
  game.player.hand = [c('sha', { id: 'cost-1' })];
  game.enemy.hand = []; // 诸葛亮空城
  const r = Engine.useSkill(game, 'player', 'lijian', ['cost-1'], { targets: ['ally', 'enemy'] });
  assert.equal(r.ok, false, '空城保护对离间的视为决斗同样生效');
  assert.match(r.message, /空城/);
  assert.ok(game.player.hand.some((x) => x.id === 'cost-1'), '成本未弃置 (零副作用)');
});

// ───── 不屈入濒死责任链 ──────────────────────────────────────────────

test('不屈在濒死者自己的响应轮次结算 (排前座席先获救援机会)', () => {
  const game = build({ seats: ['player', 'enemy', 'ally'], allyHero: 'zhoutai', seed: 13413 });
  game.roles = { player: '主公', enemy: '反贼', ally: '忠臣' };
  // player 回合对 ally 周泰出致命杀; 责任链 [player, enemy, ally] —
  // player (dying=ask, 有桃) 应先被询问, 之后才轮到周泰的不屈
  game.player.hand = [c('sha', { id: 'p-sha' }), c('tao', { id: 'p-tao' })];
  game.player.skillPreferences.dying = 'ask';
  game.ally.hp = 1;
  game.ally.hand = [];
  game.deck = [c('sha', { id: 'chuang-1', rank: '9' })];
  Engine.playCard(game, 'player', 'p-sha', { target: 'ally' });
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'dying-rescue',
    '排在周泰前的 player 先获救援询问 (不屈未抢跑)');
  assert.ok(!game.log.some((l) => l.includes('不屈')), '不屈尚未结算');
  // player 放弃 → enemy (AI 不救) → 轮到周泰 → 不屈掀创 (单张创无重复
  // 点数 → 回复至 1 脱离濒死)
  Engine.resolvePendingChoice(game, { decline: true });
  assert.ok(game.log.some((l) => l.includes('不屈')), '轮到周泰后不屈按序结算');
  assert.equal(game.ally.hp, 1, '创点数无重复 → 回复至 1 脱离濒死');
});

// ───── 距离: 亡者剔除 ────────────────────────────────────────────────

test('distanceBetween 剔除亡者 (3 席死 1 人时两存活席距离为 1)', () => {
  const game = build({ seats: ['player', 'enemy', 'ally'], seed: 13414 });
  game.ally.hp = 0;
  // player→enemy: 环 [player, enemy] (ally 已亡) → 距离 1。经
  // legalTargetsForCard 对顺手牵羊 (identity3 距离 ≤1) 断言可达。
  game.turn = 'player';
  game.phase = 'play';
  const ss = c('shunshou', { id: 'ss-1' });
  game.player.hand = [ss];
  game.enemy.hand = [c('sha', { id: 'e-keep' })];
  const targets = Engine.legalTargetsForCard(game, 'player', ss);
  assert.ok(targets.indexOf('enemy') >= 0, '亡者剔除后 enemy 距离 1 → 顺手可达');
});

// ───── 酒: 目标矩阵自洽 (仅自己变体, 已知分歧记录) ───────────────────

test('酒: isLegalCardTarget 自洽 — 自己合法 (未用过), 他人不合法', () => {
  const game = build({ seed: 13415 });
  const jiu = c('jiu', { id: 'j-1' });
  game.player.hand = [jiu];
  assert.equal(Engine.isLegalCardTarget(game, 'player', jiu, 'player'), true);
  assert.equal(Engine.isLegalCardTarget(game, 'player', jiu, 'enemy'), false, '本实现为仅自己变体 (分歧已记录)');
  game.player.flags.jiuUsedThisTurn = true;
  assert.equal(Engine.isLegalCardTarget(game, 'player', jiu, 'player'), false, '本回合已用过');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
