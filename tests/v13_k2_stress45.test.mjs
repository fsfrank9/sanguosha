// v13 K2: 结算加压 — 五大结算系统 (AOE 逐席/无懈座次链/铁索传导环/濒死
// 救援队列/桃园五谷) 在 4-5 席固定种子下的泛化加压 (挂起自清/全局守恒/
// 正确性), 以及本批自审修复的回归用例:
//   - 国色/奇袭转化目标硬编码 opponent() → resolveTrickTargetActor (活跃缺陷)
//   - 铁索缺省目标去二元化 (hostileSeats 池)
//   - 濒死队列亡席过滤
//   - 酒使用方法Ⅰ他指 (card__basic.md:58 "包括你在内的一名角色")
//   - distanceBetween 剔亡者的 4/5 席有区分度用例 (3 席退化无观测差)
//   - 闪电座次环多跳 (跨多个已占用判定区)
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }
function c(type, overrides = {}) { return Engine.makeTestCard(type, overrides); }

const SEATS4 = ['player', 'enemy', 'ally', 'ally2'];
const SEATS5 = ['player', 'enemy', 'ally', 'ally2', 'ally3'];

// 武将选无伤害流被动技的组合 (避免奸雄/遗计/刚烈等 on-damage 干扰断言):
// 刘备(仁德)/吕蒙(克己)/关羽(武圣)/黄盖(苦肉)/甘宁(奇袭) 均为主动技。
function buildGame(seats, opts = {}) {
  const params = {
    seed: opts.seed || 45001,
    seats: seats.slice(),
    playerHero: opts.playerHero || 'liubei',
    enemyHero: opts.enemyHero || 'lvmeng',
    allyHero: opts.allyHero || 'guanyu',
    ally2Hero: opts.ally2Hero || 'huanggai',
    ally3Hero: opts.ally3Hero || 'ganning'
  };
  if (opts.roles) params.roles = opts.roles;
  const game = Engine.newGame(params);
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
  game.turn = opts.turn || 'player';
  game.phase = 'play';
  return game;
}

function stockDeck(game, n, prefix = 'dk') {
  for (let i = 0; i < n; i += 1) game.deck.push(c('shan', { id: `${prefix}-${i}`, suit: 'diamond' }));
}

// ═══════════ 1. AOE 逐席队列 — 4 席南蛮 (挂起自清 + 守恒) ═══════════

test('K2-1. AOE 南蛮 4 席逐席: 有杀化解/无杀受伤, 队列完成自清', () => {
  const game = buildGame(SEATS4, { seed: 45002, turn: 'ally' });
  game.ally.hand = [c('nanman', { id: 'nm-1' })];
  game.ally2.hand = [c('sha', { id: 'a2-sha' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.player.hand = [];
  const hpBefore = game.player.hp;
  const res = assertCardConservation(game, () => Engine.playCard(game, 'ally', 'nm-1'));
  assert.equal(res.ok, true, res.message);
  assert.equal(game.ally2.hand.length, 0, 'ally2 用杀化解');
  assert.equal(game.enemy.hand.length, 0, 'enemy 用杀化解');
  assert.equal(game.ally2.hp, game.ally2.maxHp);
  assert.equal(game.enemy.hp, game.enemy.maxHp);
  assert.equal(game.player.hp, hpBefore - 1, 'player 无杀受 1 伤');
  assert.equal(game.pauseState.aoe, null, 'AOE 队列自清');
  assert.equal(game.pendingChoice, null, '零挂起残留');
});

// ═══════════ 2. AOE 万箭 5 席 + 濒死挂起中断续跑 (守恒) ═══════════

test('K2-2. AOE 万箭 5 席: 中途濒死挂起 (玩家救援询问) 排空后续跑剩余座席', () => {
  const game = buildGame(SEATS5, {
    seed: 45003,
    turn: 'enemy',
    roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '反贼', ally3: '内奸' }
  });
  game.enemy.hand = [c('wanjian', { id: 'wj-1' })];
  game.ally.hp = 1;
  game.ally.hand = [];
  game.ally2.hand = [c('shan', { id: 'a2-shan' })];
  game.ally3.hand = [];
  game.player.hand = [c('shan', { id: 'p-shan' }), c('tao', { id: 'p-tao' })];
  for (const seat of ['enemy', 'ally2', 'ally3']) game[seat].skillPreferences.dying = 'decline';
  const res = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'wj-1'));
  assert.equal(res.ok, true, res.message);
  assert.ok(game.pendingChoice && game.pendingChoice.kind === 'dying-rescue',
    'ally 濒死 → 队列排至持桃玩家挂起询问');
  assert.ok(game.pauseState.aoe, 'AOE 队列在濒死挂起期间保留');
  const res2 = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { decline: true }));
  assert.equal(res2.ok, true, res2.message);
  assert.ok(game.ally.hp <= 0, '无人救援, ally 阵亡');
  assert.notEqual(game.phase, 'gameover', '忠臣阵亡非终局, 对局继续');
  assert.equal(game.ally2.hand.length, 0, '续跑: ally2 用闪化解');
  assert.equal(game.ally3.hp, game.ally3.maxHp - 1, '续跑: ally3 无闪受 1 伤');
  assert.equal(game.player.hand.length, 1, '续跑: player 自动用闪化解 (桃保留)');
  assert.equal(game.player.hp, game.player.maxHp);
  assert.equal(game.pauseState.aoe, null, 'AOE 队列排空自清');
  assert.equal(game.pendingChoice, null, '零挂起残留');
});

// ═══════════ 3. 无懈座次责任链 — 4 席三连拉锯 ═══════════

test('K2-3. 无懈链 4 席拉锯: 目标自保 → 来源反无懈 → 第四席忠臣再反, 拆桥被抵消', () => {
  const game = buildGame(SEATS4, {
    seed: 45004,
    turn: 'enemy',
    roles: { player: '主公', enemy: '反贼', ally: '反贼', ally2: '忠臣' }
  });
  game.player.equipment.weapon = c('qinggang', { id: 'p-weapon' });
  game.enemy.hand = [c('guohe', { id: 'gh-1' }), c('wuxie', { id: 'e-wx' })];
  game.player.hand = [c('wuxie', { id: 'p-wx' })];
  game.ally2.hand = [c('wuxie', { id: 'a2-wx' })];
  const res = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'gh-1', { target: 'player' }));
  assert.equal(res.ok, true, res.message);
  assert.ok(game.player.equipment.weapon && game.player.equipment.weapon.id === 'p-weapon',
    '三连无懈后拆桥被抵消, 武器保住');
  assert.equal(game.player.hand.length, 0, 'player 无懈已用');
  assert.equal(game.enemy.hand.length, 0, 'enemy 反无懈已用');
  assert.equal(game.ally2.hand.length, 0, 'ally2 (第四席忠臣) 再反无懈已用');
  assert.equal(game.pauseState.wuxieChain, null, '无懈链自清');
});

// ═══════════ 4. 国色/奇袭转化目标 (本批活跃缺陷修复回归) ═══════════

test('K2-4a. 国色转化乐显式目标: ally 席大乔指定 ally2, 不再硬编码落玩家判定区', () => {
  const game = buildGame(SEATS4, { seed: 45005, turn: 'ally', allyHero: 'daqiao' });
  game.ally.hand = [c('shan', { id: 'diamond-src', suit: 'diamond' })];
  const res = assertCardConservation(game, () =>
    Engine.playCardAs(game, 'ally', 'diamond-src', 'lebusishu', { target: 'ally2' }));
  assert.equal(res.ok, true, res.message);
  assert.ok(game.ally2.judgeArea.some((j) => j.type === 'lebusishu'),
    '乐不思蜀落入显式目标 ally2 的判定区');
  assert.equal(game.player.judgeArea.length, 0, '玩家判定区不再被错误塞乐');
});

test('K2-4b. 国色转化乐缺省目标: 忠臣席大乔缺省走敌对池, 不落主公(玩家)', () => {
  const game = buildGame(SEATS4, {
    seed: 45006,
    turn: 'ally',
    allyHero: 'daqiao',
    roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '反贼' }
  });
  game.ally.hand = [c('shan', { id: 'diamond-src2', suit: 'diamond' })];
  const res = Engine.playCardAs(game, 'ally', 'diamond-src2', 'lebusishu', {});
  assert.equal(res.ok, true, res.message);
  assert.equal(game.player.judgeArea.length, 0,
    '缺省目标 = 敌对座席池 (忠臣不乐主公); 旧实现硬编码 opponent()=player');
  assert.ok(game.enemy.judgeArea.concat(game.ally2.judgeArea).some((j) => j.type === 'lebusishu'),
    '乐落入某个敌对 (反贼) 座席判定区');
});

test('K2-4c. 奇袭转化拆显式目标: ally3 席甘宁拆 ally 的牌, 玩家区零触碰', () => {
  const game = buildGame(SEATS5, { seed: 45007, turn: 'ally3' });
  game.ally3.hand = [c('sha', { id: 'black-src', suit: 'spade' })];
  game.ally.equipment.weapon = c('qinggang', { id: 'a-weapon' });
  game.player.hand = [c('shan', { id: 'p-keep' })];
  const res = assertCardConservation(game, () =>
    Engine.playCardAs(game, 'ally3', 'black-src', 'guohe', { target: 'ally' }));
  assert.equal(res.ok, true, res.message);
  assert.equal(game.ally.equipment.weapon, null, '显式目标 ally 的装备被拆');
  assert.equal(game.player.hand.length, 1, '玩家手牌零触碰');
});

// ═══════════ 5. 铁索传导环 — 5 席多横置 ═══════════

test('K2-5. 铁索传导 5 席: 3 席横置, 火杀触发后传导环按当前回合角色起算', () => {
  const game = buildGame(SEATS5, { seed: 45008, turn: 'player' });
  game.player.hand = [c('fire_sha', { id: 'fs-1' })];
  game.enemy.chained = true;
  game.ally2.chained = true;
  game.ally3.chained = true;
  for (const seat of SEATS5) if (seat !== 'player') game[seat].hand = [];
  const res = assertCardConservation(game, () => Engine.playCard(game, 'player', 'fs-1', { target: 'enemy' }));
  assert.equal(res.ok, true, res.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, '直接目标受火杀 1 伤');
  assert.equal(game.enemy.chained, false, '受属性伤害解除横置');
  assert.equal(game.ally2.hp, game.ally2.maxHp - 1, '传导: ally2 受 1 火伤');
  assert.equal(game.ally2.chained, false);
  assert.equal(game.ally3.hp, game.ally3.maxHp - 1, '传导: ally3 受 1 火伤');
  assert.equal(game.ally3.chained, false);
  assert.equal(game.ally.hp, game.ally.maxHp, '未横置的 ally 不受传导');
  assert.ok(!game.pauseState.chainTransmit, '传导队列自清');
});

// ═══════════ 6. 濒死救援队列 — 5 席责任链位置 ═══════════

test('K2-6. 濒死队列 5 席: 濒死者排环中间, 前序同阵营座席先获救援机会并救起', () => {
  const game = buildGame(SEATS5, {
    seed: 45009,
    turn: 'enemy',
    roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '忠臣', ally3: '内奸' }
  });
  // 责任链锚点 = 当前回合角色 enemy: [enemy, ally, ally2(濒死), ally3, player]
  // → ally (忠臣, 持桃, auto) 在 ally2 自己的轮次之前先行救援。
  game.enemy.hand = [c('juedou', { id: 'jd-1' })];
  game.ally.hand = [c('tao', { id: 'a-tao' })];
  game.ally2.hp = 1;
  game.ally2.hand = [];
  game.enemy.skillPreferences.dying = 'decline';
  const res = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'jd-1', { target: 'ally2' }));
  assert.equal(res.ok, true, res.message);
  assert.equal(game.ally.hand.length, 0, '前序忠臣 ally 的桃被用于救援');
  assert.equal(game.ally2.hp, 1, 'ally2 被救回 1 体力');
  assert.ok(!game.pauseState.dying, '濒死队列自清');
  assert.ok(game.log.some((line) => line.includes('桃') && line.includes('救')
    || line.includes('脱离濒死')), '日志记录救援发生');
  assert.equal(game.pendingChoice, null, '零挂起残留');
});

// ═══════════ 7. 濒死队列亡席过滤 (本批修复回归) ═══════════

test('K2-7. 濒死队列 5 席亡席过滤: 先亡一席后再有人濒死, 队列静默跳过亡席无异常', () => {
  const game = buildGame(SEATS5, {
    seed: 45010,
    turn: 'enemy',
    roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '忠臣', ally3: '内奸' }
  });
  game.enemy.hand = [c('juedou', { id: 'jd-1' }), c('juedou', { id: 'jd-2' })];
  game.ally3.hp = 1;
  game.ally3.hand = [];
  game.ally2.hp = 1;
  game.ally2.hand = [];
  for (const seat of SEATS5) game[seat].skillPreferences.dying = 'decline';
  // 第一击: ally3 (内奸) 阵亡 — 非终局 (反贼/主公方均存活)。
  const res1 = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'jd-1', { target: 'ally3' }));
  assert.equal(res1.ok, true, res1.message);
  assert.ok(game.ally3.hp <= 0, 'ally3 阵亡');
  assert.notEqual(game.phase, 'gameover');
  // 第二击: ally2 濒死 — 队列不含亡席 ally3, 全员放弃后正常死亡结算。
  game.enemy.flags = {};
  const res2 = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'jd-2', { target: 'ally2' }));
  assert.equal(res2.ok, true, res2.message);
  assert.ok(game.ally2.hp <= 0, 'ally2 死亡结算正常完成');
  assert.ok(!game.pauseState.dying, '濒死队列自清');
  assert.equal(game.pendingChoice, null, '零挂起残留 (亡席未产生询问)');
  assert.notEqual(game.phase, 'gameover', '主公与反贼均存活, 对局继续');
});

// ═══════════ 8. 桃园/五谷 — 5 席逐席 (守恒 + 座席透传) ═══════════

test('K2-8a. 桃园 5 席: 受伤者逐席回复, 满血席跳过, 队列自清', () => {
  const game = buildGame(SEATS5, { seed: 45011, turn: 'ally2' });
  game.ally2.hand = [c('taoyuan', { id: 'ty-1' })];
  game.player.hp -= 1;
  game.enemy.hp -= 2;
  game.ally3.hp -= 1;
  // ally 满血 → 跳过
  const res = assertCardConservation(game, () => Engine.playCard(game, 'ally2', 'ty-1'));
  assert.equal(res.ok, true, res.message);
  assert.equal(game.player.hp, game.player.maxHp, 'player 回复 1');
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, 'enemy 回复 1 (仍缺 1)');
  assert.equal(game.ally3.hp, game.ally3.maxHp, 'ally3 回复 1');
  assert.equal(game.ally.hp, game.ally.maxHp, '满血席跳过');
  assert.equal(game.pendingChoice, null, '零挂起残留');
});

test('K2-8b. 五谷 5 席: 展示池 = 存活席数, 逐席获得一张, 池清弃尽', () => {
  const game = buildGame(SEATS5, { seed: 45012, turn: 'ally3' });
  game.ally3.hand = [c('wugu', { id: 'wugu-card' })];
  stockDeck(game, 8, 'wgdk');
  game.player.skillPreferences.wugu = 'auto';
  const handBefore = {};
  for (const seat of SEATS5) handBefore[seat] = game[seat].hand.length;
  const res = assertCardConservation(game, () => Engine.playCard(game, 'ally3', 'wugu-card'));
  assert.equal(res.ok, true, res.message);
  for (const seat of SEATS5) {
    const expected = handBefore[seat] + 1 - (seat === 'ally3' ? 1 : 0);
    assert.equal(game[seat].hand.length, expected, seat + ' 获得一张 (来源席扣除已用五谷)');
  }
  assert.ok(!game.pauseState.wugu, '五谷选牌快照自清');
  assert.equal(game.pendingChoice, null, '零挂起残留');
});

// ═══════════ 9. distanceBetween 剔亡者 — 4/5 席有区分度用例 ═══════════

test('K2-9. 距离剔亡者 4/5 席: 亡席剔除后环收缩, 距离数值实际变化且骑术叠加正确', () => {
  const game4 = buildGame(SEATS4, { seed: 45013 });
  assert.equal(Engine.distanceBetween(game4, 'player', 'ally'), 2, '4 席全活: player→ally = 2');
  game4.enemy.hp = 0;
  assert.equal(Engine.distanceBetween(game4, 'player', 'ally'), 1, 'enemy 亡后环收缩 → 1 (有区分度)');

  const game5 = buildGame(SEATS5, { seed: 45014 });
  assert.equal(Engine.distanceBetween(game5, 'player', 'ally'), 2, '5 席全活: player→ally = 2');
  game5.enemy.hp = 0;
  assert.equal(Engine.distanceBetween(game5, 'player', 'ally'), 1, 'enemy 亡后 → 1');
  game5.ally.equipment.horsePlus = c('plus_horse', { id: 'a-plus' });
  assert.equal(Engine.distanceBetween(game5, 'player', 'ally'), 2, '+1 马在收缩后的新环上叠加');
});

// ═══════════ 10. 闪电座次环多跳 — 5 席跨已占用判定区 ═══════════

test('K2-10. 闪电 5 席多跳: 判定不中后跨 3 个已有闪电的判定区, 落唯一空闲席', () => {
  const game = buildGame(SEATS5, { seed: 45015 });
  const bolt = c('shandian', { id: 'bolt-live' });
  bolt.delayedSource = 'player';
  game.player.judgeArea = [bolt];
  game.enemy.judgeArea = [c('shandian', { id: 'bolt-e' })];
  game.ally.judgeArea = [c('shandian', { id: 'bolt-a' })];
  game.ally2.judgeArea = [c('shandian', { id: 'bolt-a2' })];
  stockDeck(game, 6, 'draw');
  // 判定牌 = deck 末元素: 红桃 10 → 闪电不中 (黑桃 2-9 才命中) → 移动。
  game.deck.push(c('shan', { id: 'judge-heart', suit: 'heart', rank: 10 }));
  const res = assertCardConservation(game, () => Engine.startTurn(game, 'player'));
  assert.ok(res === undefined || res.ok !== false);
  assert.equal(game.player.judgeArea.length, 0, '闪电离开 player 判定区');
  assert.ok(game.ally3.judgeArea.some((j) => j.id === 'bolt-live'),
    '跨过 enemy/ally/ally2 (已有闪电) 落入唯一空闲的 ally3');
  assert.equal(game.enemy.judgeArea.length, 1, '占用席闪电不受影响');
});

// ═══════════ 11. 酒他指 (座席泛化桶销账) ═══════════

test('K2-11a. 酒指定他人: shaBonus 挂目标, 限次挂使用者, 目标同回合杀伤害 +1', () => {
  const game = buildGame(SEATS4, { seed: 45016 });
  game.player.hand = [c('jiu', { id: 'j-1' })];
  game.ally.hand = [c('sha', { id: 'a-sha' })];
  game.ally2.hand = [];
  const res = assertCardConservation(game, () => Engine.playCard(game, 'player', 'j-1', { target: 'ally' }));
  assert.equal(res.ok, true, res.message);
  assert.equal(game.ally.shaBonus, 1, 'shaBonus 挂在目标 ally');
  assert.ok(!game.player.shaBonus, '使用者自己不吃加成');
  assert.equal(game.player.flags.jiuUsedThisTurn, true, '限次挂使用者');
  // 目标使用杀 → 伤害 2 (借刀在酒使用者回合内驱使目标出杀共享同一
  // shaBonus 读路径; playCard 有回合归属校验, 这里切 turn 做引擎级验证)。
  game.turn = 'ally';
  game.phase = 'play';
  const res2 = Engine.playCard(game, 'ally', 'a-sha', { target: 'ally2' });
  assert.equal(res2.ok, true, res2.message);
  assert.equal(game.ally2.hp, game.ally2.maxHp - 2, '目标的下一张杀伤害 1+1');
  assert.equal(game.ally.shaBonus, 0, '加成单次消费');
});

test('K2-11b. 酒他指过期: 使用者回合结束时未消费的跨席 shaBonus 统一清零', () => {
  const game = buildGame(SEATS4, { seed: 45017 });
  stockDeck(game, 12, 'et');
  game.player.hand = [c('jiu', { id: 'j-2' })];
  const res = Engine.playCard(game, 'player', 'j-2', { target: 'ally' });
  assert.equal(res.ok, true, res.message);
  assert.equal(game.ally.shaBonus, 1);
  const endRes = Engine.endTurn(game);
  assert.equal(endRes.ok, true, endRes.message);
  assert.equal(game.ally.shaBonus, 0, '"此回合内"过期: 回合结束统一清全席未消费加成');
});

test('K2-11c. 酒他指 + 使用者本回合内阵亡: 回合因阵亡终止同样清全席 shaBonus (review 修复)', () => {
  const game = buildGame(SEATS4, { seed: 45019 });
  stockDeck(game, 12, 'dt');
  game.player.hand = [c('jiu', { id: 'j-3' })];
  const res = Engine.playCard(game, 'player', 'j-3', { target: 'ally' });
  assert.equal(res.ok, true, res.message);
  assert.equal(game.ally.shaBonus, 1);
  // 使用者随后于本回合内阵亡 (刚烈反伤/借刀反噬等), completeTurn 走
  // 阵亡早退分支 — 修复前该分支跳过全清, 加成泄漏到后续回合。
  game.player.hp = 0;
  const endRes = Engine.endTurn(game);
  assert.equal(endRes.ok, true, endRes.message);
  assert.equal(game.ally.shaBonus, 0, '阵亡终止的回合结束同样过期全席 shaBonus');
});

// ═══════════ 12. 铁索缺省目标去二元化 (本批修复回归) ═══════════

test('K2-12. 铁索缺省目标: 忠臣席直调无显式 targets → 敌对池首位, 不再错指玩家', () => {
  const game = buildGame(SEATS4, {
    seed: 45018,
    turn: 'ally',
    roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '反贼' }
  });
  game.ally.hand = [c('tiesuo', { id: 'ts-1' })];
  const res = assertCardConservation(game, () => Engine.playCard(game, 'ally', 'ts-1'));
  assert.equal(res.ok, true, res.message);
  assert.equal(game.player.chained, false, '主公 (玩家) 不再被二元 opponent() 缺省锁定');
  assert.ok(game.enemy.chained || game.ally2.chained, '敌对池首位 (反贼) 被横置');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
console.log(`${tests.length} 个 K2 加压用例通过。`);
