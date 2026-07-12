// v12 G2 行为测试: 风包第二批六技能 (神速·夏侯渊 / 天香+红颜·小乔 /
// 雷击+鬼道·张角 / 不屈·周泰) 的引擎接入回归。
//
// 只读引擎, 不改 src/。沿用 tests/v12_g_wind_repair.test.mjs 的
// buildGame/stockDeck/assertCardConservation 模式:
//   - buildGame: newGame 后清空手牌/判定区/装备/日志/牌堆, 满血, 清技能偏好,
//     turn='player'/phase='play' 待各测试自行铺牌; 需要走 startTurn 完整流程
//     (准备/判定/摸牌阶段) 的用例直接调用 Engine.startTurn(game, actor)
//     覆盖 buildGame 预设的 turn/phase。
//   - stockDeck: 追加 n 张占位杀 (spade-A) 到牌堆尾部。
//   - 牌堆顶方向: card-runtime.js takeCard({zone:'deck'}) 在 cardOrId===null
//     时走 `list.pop()` (position!=='bottom')，即数组尾部 = 牌堆顶。所以
//     "预置判定牌" 一律用 game.deck.push(...)，且要在任何占位填充牌之后
//     push，才会被最先摸到 / 判定到。
//   - assertCardConservation 包住每一次会移动牌的引擎调用，创区
//     (state.chuang) 已在 helpers/card-conservation.mjs 的普查范围内。
//
// 涉及的引擎入口 (src/engine/skills.js): triggerShensuPrepare /
// applyShensuOption / resolveShensuOptionsChoice / triggerTianxiangDamageModify /
// triggerLeijiShanUsed / triggerGuidaoJudgementBeforeResolve /
// resolveGuidaoReplaceChoice / triggerBuquDyingEnter；红颜视图层见
// src/engine/judge-area.js judge() 与 src/engine/state.js effectiveCardSuit /
// effectiveCardColor / handLimit 的"创"条款。
//
// 文末附"发现的引擎行为问题"清单 (D2 节, 鬼道 pendingChoice 重挂不一致)。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function buildGame(opts) {
  opts = opts || {};
  const game = Engine.newGame({
    seed: opts.seed || 22901,
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
    // v12 G2: 不屈 创区 — newGame/makePlayer 已初始化为 [], 这里显式重置
    // 便于阅读 (buildGame 语义: 一切非默认状态均由各测试自行铺设)。
    game[actor].chuang = [];
  }
  game.turn = 'player';
  game.phase = 'play';
  return game;
}

function stockDeck(game, n) {
  for (let i = 0; i < n; i += 1) game.deck.push(c('sha', { id: `deck-${i}` }));
}

// ═══════════════════ A. 神速 (shensu, 夏侯渊) ═══════════════════════════

test('A1: 神速 — 玩家回合开始挂 shensu-options, {options:[]} 不发动, 回合正常摸牌', () => {
  const game = buildGame({ playerHero: 'xiahouyuan', enemyHero: 'liubei' });
  stockDeck(game, 10);
  const startResult = assertCardConservation(game, () => Engine.startTurn(game, 'player'));
  assert.equal(startResult.ok, true, startResult.message);
  assert.ok(game.pendingChoice, '应挂起选择');
  assert.equal(game.pendingChoice.kind, 'shensu-options');
  const resolveResult = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { options: [] }));
  assert.equal(resolveResult.ok, true, resolveResult.message);
  assert.ok(game.log.some((l) => l.includes('选择不发动【神速】')));
  assert.equal(game.player.hand.length, 2, '未跳过摸牌阶段, 正常摸 2 张');
  assert.equal(game.phase, 'play', '回合正常进入出牌阶段');
  assert.equal(game.pendingChoice, null);
});

test('A2: 神速 选项一 — 跳过判定+摸牌, 视为无距离杀且不占出牌次数', () => {
  const game = buildGame({ playerHero: 'xiahouyuan', enemyHero: 'liubei' });
  game.player.hand = [c('sha', { id: 'real-sha' })];
  const startResult = assertCardConservation(game, () => Engine.startTurn(game, 'player'));
  assert.equal(startResult.ok, true, startResult.message);
  assert.equal(game.pendingChoice.kind, 'shensu-options');
  const handBefore = game.player.hand.length;
  const enemyHpBefore = game.enemy.hp;
  const resolveResult = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { options: [1] }));
  assert.equal(resolveResult.ok, true, resolveResult.message);
  assert.equal(game.player.flags.skipJudge, true, '选项一置 skipJudge');
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '虚拟杀命中, 对手掉血');
  assert.equal(game.player.hand.length, handBefore, '跳过摸牌阶段, 手牌数不变');
  assert.equal(game.phase, 'play', '未选选项二, 正常进入出牌阶段');
  assert.equal(game.player.usedSha, false, '虚拟杀不占出牌阶段使用次数');
  const playResult = assertCardConservation(game, () => Engine.playCard(game, 'player', 'real-sha'));
  assert.equal(playResult.ok, true, playResult.message);
  assert.equal(game.enemy.hp, enemyHpBefore - 2, '出牌阶段仍可再出一张真杀命中');
});

test('A3: 神速 选项二 — 候选装备存在时 canOptionTwo=true, 弃装备后 skipPlay 生效直接进弃牌阶段', () => {
  const game = buildGame({ playerHero: 'xiahouyuan', enemyHero: 'liubei' });
  stockDeck(game, 10);
  game.player.hand = [c('qinggang', { id: 'eq1' })];
  const startResult = assertCardConservation(game, () => Engine.startTurn(game, 'player'));
  assert.equal(startResult.ok, true, startResult.message);
  assert.equal(game.pendingChoice.canOptionTwo, true, '手牌区有装备牌 → canOptionTwo');
  assert.ok(game.pendingChoice.equipCandidates.some((x) => x.id === 'eq1'));
  const enemyHpBefore = game.enemy.hp;
  const resolveResult = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { options: [2], equipCardId: 'eq1' }));
  assert.equal(resolveResult.ok, true, resolveResult.message);
  assert.ok(!game.player.hand.some((x) => x.id === 'eq1'), '装备牌离开手牌');
  assert.ok(game.discard.some((x) => x.id === 'eq1'), '装备牌进弃牌堆');
  assert.equal(game.player.flags.skipPlay, true, 'skipPlay 生效');
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '虚拟杀仍然命中');
  assert.equal(game.phase, 'discard', '出牌阶段被跳过, 直接进入弃牌阶段');
});

test('A4: 神速 选项二 不带 equipCardId → 返回 fail 且 pendingChoice 重挂', () => {
  const game = buildGame({ playerHero: 'xiahouyuan', enemyHero: 'liubei' });
  game.player.hand = [c('qinggang', { id: 'eq1' })];
  const startResult = Engine.startTurn(game, 'player');
  assert.equal(startResult.ok, true, startResult.message);
  const resolveResult = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { options: [2] }));
  assert.notEqual(resolveResult.ok, true, '缺 equipCardId 应失败');
  assert.ok(game.pendingChoice, 'pendingChoice 应重新挂起');
  assert.equal(game.pendingChoice.kind, 'shensu-options');
  assert.ok(game.player.hand.some((x) => x.id === 'eq1'), '装备牌未被消耗');
});

test('A5a: 神速 AI — 对手(玩家)1血时, 敌方夏侯渊回合开始自动发动选项一', () => {
  const game = buildGame({ playerHero: 'liubei', enemyHero: 'xiahouyuan' });
  game.player.hp = 1;
  game.player.hand = [c('shan', { id: 'p-shan' })];
  const startResult = assertCardConservation(game, () => Engine.startTurn(game, 'enemy'));
  assert.equal(startResult.ok, true, startResult.message);
  assert.ok(game.log.some((l) => l.includes('神速')), '有神速日志');
  assert.equal(game.player.hp, 1, '闪化解, hp 不变');
  assert.ok(!game.player.hand.some((x) => x.id === 'p-shan'), '闪被消耗以响应虚拟杀');
});

test('A5b: 神速 AI — 对手(玩家)满血时不发动', () => {
  const game = buildGame({ playerHero: 'liubei', enemyHero: 'xiahouyuan' });
  stockDeck(game, 10);
  assert.equal(game.player.hp, game.player.maxHp, '前置: 满血');
  const startResult = assertCardConservation(game, () => Engine.startTurn(game, 'enemy'));
  assert.equal(startResult.ok, true, startResult.message);
  assert.ok(!game.log.some((l) => l.includes('神速')), '满血不触发神速');
});

// ═══════════════════ B. 天香 (tianxiang, 小乔) ═══════════════════════════

test('B1: 天香 — 受 2 点伤害自动转移给对手, 对手按已损体力补牌, 小乔不掉血', () => {
  const game = buildGame({ playerHero: 'xiaoqiao', enemyHero: 'liubei' });
  // 天香转移后对手要按已损体力补牌; 牌堆必须先垫够, 否则会在弃牌堆刚好只有
  // 天香成本牌 (+ 攻击者杀) 时触发洗牌, 把成本牌洗回牌堆甚至摸回手上,
  // 干扰下面"成本牌进入弃牌堆"的断言 (与技能是否正确无关, 纯测试前置)。
  stockDeck(game, 10);
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'atk-sha' })];
  game.enemy.shaBonus = 1; // 相当于已饮酒, 本次杀造成 2 点伤害
  game.player.hand = [c('sha', { id: 'cost1', suit: 'heart', rank: '5' })];
  const playerHpBefore = game.player.hp;
  const enemyHpBefore = game.enemy.hp;
  const playResult = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'atk-sha'));
  assert.equal(playResult.ok, true, playResult.message);
  assert.equal(game.player.hp, playerHpBefore, '小乔本人不掉血 (伤害转移)');
  assert.equal(game.enemy.hp, enemyHpBefore - 2, '对手代为承受 2 点伤害');
  assert.equal(game.enemy.hand.length, 2, '对手按已损体力 (2) 补摸 2 张牌');
  assert.ok(game.discard.some((x) => x.id === 'cost1'), '红桃成本进入弃牌堆');
  assert.ok(game.log.some((l) => l.includes('天香')));
});

test('B2: 天香 — 致命 1 点伤害 (hp1) 即便 <2 也自动转移 (auto 阈值)', () => {
  const game = buildGame({ playerHero: 'xiaoqiao', enemyHero: 'liubei' });
  stockDeck(game, 10); // 避免转移后的补牌在空牌堆上触发洗牌 (见 B1 注释)
  game.turn = 'enemy';
  game.player.hp = 1;
  game.enemy.hand = [c('sha', { id: 'atk-sha' })];
  game.player.hand = [c('sha', { id: 'cost1', suit: 'heart', rank: '5' })];
  const enemyHpBefore = game.enemy.hp;
  const playResult = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'atk-sha'));
  assert.equal(playResult.ok, true, playResult.message);
  assert.equal(game.player.hp, 1, '小乔本人不掉血, 未进入濒死');
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '致命伤害转移给对手');
  assert.ok(game.log.some((l) => l.includes('天香')));
});

test('B3: 天香 — 非致命 1 点伤害 (hp3, 默认 auto) 不转移', () => {
  const game = buildGame({ playerHero: 'xiaoqiao', enemyHero: 'liubei' });
  game.turn = 'enemy';
  assert.equal(game.player.hp, 3, '前置: 满血 3');
  game.enemy.hand = [c('sha', { id: 'atk-sha' })];
  game.player.hand = [c('sha', { id: 'cost1', suit: 'heart', rank: '5' })];
  const playResult = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'atk-sha'));
  assert.equal(playResult.ok, true, playResult.message);
  assert.equal(game.player.hp, 2, '非致命 1 点伤害, 默认 auto 不转移, 小乔正常掉血');
  assert.ok(game.player.hand.some((x) => x.id === 'cost1'), '未消耗天香成本');
  assert.ok(!game.log.some((l) => l.includes('天香')));
});

test('B4: 天香 pref=always — 非致命 1 点伤害也转移', () => {
  const game = buildGame({ playerHero: 'xiaoqiao', enemyHero: 'liubei' });
  stockDeck(game, 10); // 避免转移后的补牌在空牌堆上触发洗牌 (见 B1 注释)
  game.turn = 'enemy';
  game.player.skillPreferences.tianxiang = 'always';
  game.enemy.hand = [c('sha', { id: 'atk-sha' })];
  game.player.hand = [c('sha', { id: 'cost1', suit: 'heart', rank: '5' })];
  const enemyHpBefore = game.enemy.hp;
  const playResult = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'atk-sha'));
  assert.equal(playResult.ok, true, playResult.message);
  assert.equal(game.player.hp, 3, 'always 偏好: 1 点也转移, 小乔不掉血');
  assert.equal(game.enemy.hp, enemyHpBefore - 1);
});

test('B5: 天香 pref=decline — 致命伤害也不转移, 无桃时正常濒死死亡', () => {
  const game = buildGame({ playerHero: 'xiaoqiao', enemyHero: 'liubei' });
  game.turn = 'enemy';
  game.player.hp = 1;
  game.player.skillPreferences.tianxiang = 'decline';
  game.enemy.hand = [c('sha', { id: 'atk-sha' })];
  game.player.hand = [c('sha', { id: 'cost1', suit: 'heart', rank: '5' })]; // 非桃, 无法自救
  const playResult = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'atk-sha'));
  assert.equal(playResult.ok, true, playResult.message);
  assert.equal(game.phase, 'gameover', 'decline: 不转移 → 正常进入濒死 → 无桃死亡');
  assert.ok(!game.log.some((l) => l.includes('天香')));
});

test('B6: 天香 + 红颜联动 — 手牌只有黑桃, 仍可作天香成本', () => {
  const game = buildGame({ playerHero: 'xiaoqiao', enemyHero: 'liubei' });
  stockDeck(game, 10); // 避免转移后的补牌在空牌堆上触发洗牌 (见 B1 注释)
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'atk-sha' })];
  game.enemy.shaBonus = 1; // 2 点伤害, 确保满足 auto 转移门槛
  game.player.hand = [c('sha', { id: 'black-cost', suit: 'spade', rank: '5' })]; // 只有黑桃
  const enemyHpBefore = game.enemy.hp;
  const playResult = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'atk-sha'));
  assert.equal(playResult.ok, true, playResult.message);
  assert.equal(game.player.hp, game.player.maxHp, '小乔不掉血 (黑桃经红颜视为红桃, 成本有效)');
  assert.equal(game.enemy.hp, enemyHpBefore - 2);
  const paidCard = game.discard.find((x) => x.id === 'black-cost');
  assert.ok(paidCard, '黑桃成本进入弃牌堆');
  assert.equal(paidCard.suit, 'spade', '弃牌堆中的成本牌花色仍是黑桃 (视同只是视图层, 不改物理牌)');
});

test('B7: 天香 — 目标超出小乔攻击范围 (对手 +1 马) 不转移', () => {
  const game = buildGame({ playerHero: 'xiaoqiao', enemyHero: 'liubei' });
  game.turn = 'enemy';
  game.enemy.equipment.horsePlus = c('plus_horse', { id: 'hp1' });
  assert.equal(Engine.distanceBetween(game, 'player', 'enemy'), 2, '前置: 距离为 2, 超出小乔攻击范围 1');
  game.enemy.hand = [c('sha', { id: 'atk-sha' })];
  game.enemy.shaBonus = 1; // 2 点伤害, 若在范围内本会满足转移条件
  game.player.hand = [c('sha', { id: 'cost1', suit: 'heart', rank: '5' })];
  const playResult = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'atk-sha'));
  assert.equal(playResult.ok, true, playResult.message);
  assert.equal(game.player.hp, game.player.maxHp - 2, '距离超出攻击范围, 天香不触发, 正常受伤');
  assert.ok(game.player.hand.some((x) => x.id === 'cost1'), '成本未消耗');
  assert.ok(!game.log.some((l) => l.includes('天香')));
});

// ═══════════════════ C. 雷击 (leiji, 张角) ═══════════════════════════════

test('C1: 雷击 — 张角出闪响应杀, 判定黑桃 → 攻击者受 2 点雷电伤害', () => {
  const game = buildGame({ playerHero: 'zhangjiao', enemyHero: 'liubei' });
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'atk-sha' })];
  game.player.hand = [c('shan', { id: 'p-shan' })];
  game.deck.push(c('sha', { id: 'leiji-judge', suit: 'spade', rank: '4' }));
  const enemyHpBefore = game.enemy.hp;
  const playResult = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'atk-sha'));
  assert.equal(playResult.ok, true, playResult.message);
  assert.equal(game.player.hp, game.player.maxHp, '张角出闪化解, 未受伤');
  assert.equal(game.enemy.hp, enemyHpBefore - 2, '雷击判定黑桃, 攻击者受 2 点雷电伤害');
  assert.ok(game.log.some((l) => l.includes('雷击')), '有雷击日志');
  assert.ok(game.log.some((l) => l.includes('雷电')), '日志含雷电伤害描述');
});

test('C2a: 雷击 — 判定红桃 → 不命中不掉血', () => {
  const game = buildGame({ playerHero: 'zhangjiao', enemyHero: 'liubei' });
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'atk-sha' })];
  game.player.hand = [c('shan', { id: 'p-shan' })];
  game.deck.push(c('sha', { id: 'leiji-judge', suit: 'heart', rank: '4' }));
  const enemyHpBefore = game.enemy.hp;
  const playResult = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'atk-sha'));
  assert.equal(playResult.ok, true, playResult.message);
  assert.equal(game.enemy.hp, enemyHpBefore, '判定红桃, 雷击不命中');
  assert.ok(game.log.some((l) => l.includes('雷击】判定未中')));
});

test('C2b: 雷击 leiji=decline → 不判定, 牌堆不消耗', () => {
  const game = buildGame({ playerHero: 'zhangjiao', enemyHero: 'liubei' });
  game.turn = 'enemy';
  game.player.skillPreferences.leiji = 'decline';
  game.enemy.hand = [c('sha', { id: 'atk-sha' })];
  game.player.hand = [c('shan', { id: 'p-shan' })];
  game.deck.push(c('sha', { id: 'leiji-judge', suit: 'spade', rank: '4' }));
  const deckLenBefore = game.deck.length;
  const enemyHpBefore = game.enemy.hp;
  const playResult = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'atk-sha'));
  assert.equal(playResult.ok, true, playResult.message);
  assert.equal(game.enemy.hp, enemyHpBefore, '不发动雷击, 不掉血');
  assert.equal(game.deck.length, deckLenBefore, '未消耗判定牌 (根本没有判定)');
  assert.ok(game.log.some((l) => l.includes('选择不发动【雷击】')));
});

test('C3: 雷击 + 八卦联动 — 八卦判定红视为出闪, 雷击照样触发', () => {
  const game = buildGame({ playerHero: 'zhangjiao', enemyHero: 'liubei' });
  game.turn = 'enemy';
  game.player.equipment.armor = c('bagua', { id: 'bagua1' });
  game.player.hand = []; // 无真闪, 必须靠八卦
  game.enemy.hand = [c('sha', { id: 'atk-sha' })];
  // push 顺序 = 摸牌顺序: 先 push 的后摸到。八卦先判 (第一次 judge), 雷击后判。
  game.deck.push(c('sha', { id: 'leiji-judge', suit: 'spade', rank: '4' })); // 第二张弹出: 雷击判定
  game.deck.push(c('sha', { id: 'bagua-judge', suit: 'heart', rank: '9' })); // 第一张弹出: 八卦判定
  const enemyHpBefore = game.enemy.hp;
  const playResult = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'atk-sha'));
  assert.equal(playResult.ok, true, playResult.message);
  assert.equal(game.player.hp, game.player.maxHp, '八卦判定红, 视为出闪, 未受伤');
  assert.equal(game.enemy.hp, enemyHpBefore - 2, '雷击随八卦"视为出闪"同样触发, 攻击者受 2 点雷电伤害');
  assert.ok(game.log.some((l) => l.includes('八卦阵')));
  assert.ok(game.log.some((l) => l.includes('雷击')));
});

test('C4: 雷击 + 红颜联动 — 对手是小乔, 黑桃判定视为红桃, 雷击不命中', () => {
  const game = buildGame({ playerHero: 'zhangjiao', enemyHero: 'xiaoqiao' });
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'atk-sha' })];
  game.player.hand = [c('shan', { id: 'p-shan' })];
  game.deck.push(c('sha', { id: 'leiji-judge', suit: 'spade', rank: '4' }));
  const enemyHpBefore = game.enemy.hp;
  const playResult = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'atk-sha'));
  assert.equal(playResult.ok, true, playResult.message);
  assert.equal(game.enemy.hp, enemyHpBefore, '小乔红颜: 黑桃判定视为红桃, 雷击不命中');
  const restored = game.discard.find((card) => card.id === 'leiji-judge');
  assert.ok(restored, '判定牌进入弃牌堆');
  assert.equal(restored.suit, 'spade', '弃牌堆中判定牌花色应还原为黑桃 (红颜只是视图层)');
});

// ═══════════════════ D. 鬼道 (guidao, 张角) ═══════════════════════════════

test('D1: 鬼道 — AI 张角(enemy) 持黑牌自动替换玩家的判定, 原判定牌进弃牌堆', () => {
  const game = buildGame({ playerHero: 'liubei', enemyHero: 'zhangjiao' });
  stockDeck(game, 10);
  game.deck.push(c('sha', { id: 'orig-judge', suit: 'heart', rank: '6' })); // 若不替换, 乐不思蜀本会成功
  game.player.judgeArea = [c('lebusishu', { id: 'le1' })];
  game.enemy.hand = [c('sha', { id: 'black1', suit: 'spade', rank: '3' })];
  const startResult = assertCardConservation(game, () => Engine.startTurn(game, 'player'));
  assert.equal(startResult.ok, true, startResult.message);
  assert.equal(game.player.flags.skipPlay, true, '被替换为黑牌 → 乐不思蜀判定失败 → 跳过出牌阶段');
  assert.ok(game.log.some((l) => l.includes('鬼道')));
  assert.ok(game.discard.some((x) => x.id === 'orig-judge'), '原判定牌进弃牌堆');
  assert.ok(game.discard.some((x) => x.id === 'black1'), '用于替换的黑牌也进弃牌堆');
  assert.ok(game.discard.some((x) => x.id === 'le1'), '乐不思蜀本体结算后进弃牌堆');
  assert.ok(!game.enemy.hand.some((x) => x.id === 'black1'), '黑牌离开张角手牌');
  assert.equal(game.player.judgeArea.length, 0);
  assert.equal(game.phase, 'discard', 'skipPlay 生效, 直接进入弃牌阶段');
});

test('D2a: 鬼道 — 玩家张角(ask) 用黑牌替换自己的判定 → 替换生效', () => {
  const game = buildGame({ playerHero: 'zhangjiao', enemyHero: 'liubei' });
  stockDeck(game, 10);
  game.deck.push(c('sha', { id: 'orig-judge', suit: 'heart', rank: '6' })); // 若不替换, 乐不思蜀本会成功
  game.player.judgeArea = [c('lebusishu', { id: 'le1' })];
  game.player.hand = [c('sha', { id: 'black1', suit: 'club', rank: '9' })];
  const startResult = assertCardConservation(game, () => Engine.startTurn(game, 'player'));
  assert.equal(startResult.ok, true, startResult.message);
  assert.ok(game.pendingChoice, '玩家 ask 偏好 (默认) → 挂起选择');
  assert.equal(game.pendingChoice.kind, 'guidao-replace');
  const resolveResult = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'black1' }));
  assert.equal(resolveResult.ok, true, resolveResult.message);
  assert.ok(game.log.some((l) => l.includes('鬼道')));
  assert.equal(game.player.flags.skipPlay, true, '替换为黑牌 → 判定失败');
  assert.ok(game.discard.some((x) => x.id === 'orig-judge'));
  assert.ok(game.discard.some((x) => x.id === 'black1'));
  assert.ok(game.discard.some((x) => x.id === 'le1'));
  assert.equal(game.phase, 'discard');
});

test('D2b: 鬼道 — {cardId:null} 不替换, 原判定 (红桃) 照常成功', () => {
  const game = buildGame({ playerHero: 'zhangjiao', enemyHero: 'liubei' });
  stockDeck(game, 10);
  game.deck.push(c('sha', { id: 'orig-judge', suit: 'heart', rank: '6' }));
  game.player.judgeArea = [c('lebusishu', { id: 'le1' })];
  game.player.hand = [c('sha', { id: 'black1', suit: 'club', rank: '9' })];
  const startResult = Engine.startTurn(game, 'player');
  assert.equal(startResult.ok, true, startResult.message);
  assert.equal(game.pendingChoice.kind, 'guidao-replace');
  const resolveResult = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: null }));
  assert.equal(resolveResult.ok, true, resolveResult.message);
  assert.ok(game.log.some((l) => l.includes('选择不发动【鬼道】')));
  assert.equal(game.player.flags.skipPlay, false, '未替换, 红桃判定成功 → 不跳过出牌阶段');
  assert.ok(game.player.hand.some((x) => x.id === 'black1'), '黑牌未被消耗');
  assert.ok(game.discard.some((x) => x.id === 'orig-judge'), '原判定牌 (红桃) 结算后仍进弃牌堆');
  assert.ok(game.discard.some((x) => x.id === 'le1'), '乐不思蜀本体结算后进弃牌堆');
  assert.equal(game.phase, 'play');
});

test('D2c: 鬼道 — 传入手牌中一张非黑牌 id → fail 且 pendingChoice 重挂, 可重新选择黑牌成功', () => {
  const game = buildGame({ playerHero: 'zhangjiao', enemyHero: 'liubei' });
  stockDeck(game, 10);
  game.deck.push(c('sha', { id: 'orig-judge', suit: 'heart', rank: '6' }));
  game.player.judgeArea = [c('lebusishu', { id: 'le1' })];
  game.player.hand = [
    c('sha', { id: 'red-card', suit: 'diamond', rank: '8' }),
    c('sha', { id: 'black-card', suit: 'club', rank: '9' })
  ];
  const startResult = Engine.startTurn(game, 'player');
  assert.equal(startResult.ok, true, startResult.message);
  assert.equal(game.pendingChoice.kind, 'guidao-replace');
  const badResult = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'red-card' }));
  assert.notEqual(badResult.ok, true, '非黑牌应失败');
  assert.ok(game.pendingChoice, 'pendingChoice 应重新挂起');
  assert.equal(game.pendingChoice.kind, 'guidao-replace');
  assert.ok(game.player.hand.some((x) => x.id === 'red-card'), '失败的尝试不消耗手牌');
  // 重挂后可以用黑牌重新尝试并成功。
  const goodResult = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'black-card' }));
  assert.equal(goodResult.ok, true, goodResult.message);
  assert.equal(game.player.flags.skipPlay, true, '黑牌替换成功, 判定失败');
});

test('D2d: 鬼道 — cardId 指向不存在的手牌 → fail 且重挂 (修复回归: 判定挂起不悬空)', () => {
  const game = buildGame({ playerHero: 'zhangjiao', enemyHero: 'liubei' });
  stockDeck(game, 10);
  game.deck.push(c('sha', { id: 'orig-judge', suit: 'heart', rank: '6' }));
  game.player.judgeArea = [c('lebusishu', { id: 'le1' })];
  game.player.hand = [c('sha', { id: 'black-card', suit: 'club', rank: '9' })];
  const startResult = Engine.startTurn(game, 'player');
  assert.equal(startResult.ok, true, startResult.message);
  assert.equal(game.pendingChoice.kind, 'guidao-replace');
  const badResult = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'does-not-exist' }));
  assert.notEqual(badResult.ok, true, '不存在的 cardId 应失败');
  // v12 G2 修复回归: 曾经 `if (!chosen) return fail(...)` 不重挂, 导致
  // pendingChoice 清空而 pauseState.judgeArea 挂起快照悬空 (回合卡死)。
  // 修复后与"颜色不对"分支一致: fail + 重挂, 玩家可重试或 decline。
  assert.ok(game.pendingChoice && game.pendingChoice.kind === 'guidao-replace',
    '未找到牌时 pendingChoice 重新挂起, 可重试');
  const retry = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'black-card' }));
  assert.equal(retry.ok, true, '重挂后用合法黑牌重试成功');
});

// ═══════════════════ E. 不屈 (buqu, 周泰) ═════════════════════════════════

test('E1: 不屈 — 濒死时置入唯一点数的创, hp 回到 1, 游戏未结束', () => {
  const game = buildGame({ playerHero: 'zhoutai', enemyHero: 'liubei' });
  game.turn = 'enemy';
  game.player.hp = 1;
  game.player.hand = []; // 无桃/闪
  game.enemy.hand = [c('sha', { id: 'atk-sha' })];
  game.deck.push(c('sha', { id: 'chuang1', suit: 'spade', rank: '7' }));
  const playResult = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'atk-sha'));
  assert.equal(playResult.ok, true, playResult.message);
  assert.equal(game.player.hp, 1, '不屈救回体力至 1');
  assert.equal(game.player.chuang.length, 1, '武将牌上多了一张"创"');
  assert.equal(game.player.chuang[0].id, 'chuang1');
  assert.notEqual(game.phase, 'gameover', '游戏未结束');
  assert.ok(game.log.some((l) => l.includes('不屈')));
});

test('E2: 不屈 — 第二次濒死掀出同点数的创 → 弃置, 无桃继续濒死至死亡', () => {
  const game = buildGame({ playerHero: 'zhoutai', enemyHero: 'liubei' });
  game.turn = 'enemy';
  game.player.hp = 1;
  game.player.hand = [];
  game.enemy.hand = [c('sha', { id: 'atk-sha-1' })];
  game.deck.push(c('sha', { id: 'chuang1', suit: 'spade', rank: '7' }));
  const first = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'atk-sha-1'));
  assert.equal(first.ok, true, first.message);
  assert.equal(game.player.hp, 1, '第一次不屈生效');
  assert.equal(game.player.chuang.length, 1);

  game.enemy.usedSha = false;
  game.enemy.hand = [c('sha', { id: 'atk-sha-2' })];
  game.deck.push(c('sha', { id: 'chuang2-dup', suit: 'heart', rank: '7' })); // 同点数 7
  const second = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'atk-sha-2'));
  assert.equal(second.ok, true, second.message);
  assert.equal(game.player.chuang.length, 1, '同点数, 不新增创');
  assert.ok(game.discard.some((x) => x.id === 'chuang2-dup'), '同点数的牌进入弃牌堆');
  assert.equal(game.phase, 'gameover', '无桃救援, 濒死至死亡');
  assert.equal(game.winner, 'enemy', '周泰死亡, 对手获胜');
});

test('E3: 不屈 — 武将牌上有 2 张创时, 手牌上限 = maxHp - 创数', () => {
  const game = buildGame({ playerHero: 'zhoutai', enemyHero: 'liubei' });
  game.player.chuang = [c('sha', { id: 'ch-a', rank: '2' }), c('sha', { id: 'ch-b', rank: '9' })];
  assert.equal(game.player.maxHp, 4);
  assert.equal(Engine.handLimit(game, 'player'), 2, '手牌上限 = 4 - 2 = 2');
  game.player.hand = ['h1', 'h2', 'h3', 'h4', 'h5'].map((id) => c('sha', { id }));
  assert.equal(Engine.getDiscardCount(game, 'player'), 3, '5 张手牌 - 上限 2 = 需弃 3 张');
  assert.equal(Engine.needsDiscard(game, 'player'), true);
});

test('E4: 不屈 — hp1 受 2 点伤害 (hp=-1) 仍救回 hp=1', () => {
  const game = buildGame({ playerHero: 'zhoutai', enemyHero: 'liubei' });
  game.turn = 'enemy';
  game.player.hp = 1;
  game.player.hand = [];
  game.enemy.hand = [c('sha', { id: 'atk-sha' })];
  game.enemy.shaBonus = 1; // 2 点伤害
  game.deck.push(c('sha', { id: 'chuang1', suit: 'spade', rank: '3' }));
  const playResult = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'atk-sha'));
  assert.equal(playResult.ok, true, playResult.message);
  assert.equal(game.player.hp, 1, '无论伤害多深, 不屈都只回到 1 点体力');
  assert.equal(game.player.chuang.length, 1);
});

test('E5: 不屈 — 连续两次不同点数的濒死救援, 创区持续入账且全程卡牌守恒', () => {
  const game = buildGame({ playerHero: 'zhoutai', enemyHero: 'liubei' });
  game.turn = 'enemy';
  game.player.hp = 1;
  game.player.hand = [];
  game.enemy.hand = [c('sha', { id: 'atk-1' })];
  game.deck.push(c('sha', { id: 'chuang-a', suit: 'spade', rank: '3' }));
  const first = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'atk-1'));
  assert.equal(first.ok, true, first.message);
  assert.equal(game.player.chuang.length, 1);
  assert.equal(game.player.hp, 1);

  game.enemy.usedSha = false;
  game.enemy.hand = [c('sha', { id: 'atk-2' })];
  game.deck.push(c('sha', { id: 'chuang-b', suit: 'club', rank: '9' })); // 不同点数
  const second = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'atk-2'));
  assert.equal(second.ok, true, second.message);
  assert.equal(game.player.chuang.length, 2, '不同点数, 新增第二张创');
  assert.equal(game.player.hp, 1);
  assert.equal(Engine.handLimit(game, 'player'), 2, '手牌上限随创数同步更新为 4-2=2');
  assert.notEqual(game.phase, 'gameover');
});

// ═══════════════════ F. 红颜 (hongyan, 小乔) ══════════════════════════════

test('F1: 红颜 + 闪电 — 判定区放闪电, 黑桃判定视为红桃 → 不命中, 判定牌回弃牌堆时恢复黑桃', () => {
  const game = buildGame({ playerHero: 'xiaoqiao', enemyHero: 'liubei' });
  stockDeck(game, 10);
  game.deck.push(c('sha', { id: 'sd-judge', suit: 'spade', rank: '4' }));
  game.player.judgeArea = [c('shandian', { id: 'sd1' })];
  const hpBefore = game.player.hp;
  const startResult = assertCardConservation(game, () => Engine.startTurn(game, 'player'));
  assert.equal(startResult.ok, true, startResult.message);
  assert.equal(game.player.hp, hpBefore, '红颜视图: 黑桃判定视为红桃, 闪电不命中, hp 不变');
  assert.equal(game.player.judgeArea.length, 0, '闪电已移出小乔判定区');
  assert.ok(game.enemy.judgeArea.some((x) => x.id === 'sd1'), '闪电移至对手判定区 (未命中=非法目标, 移交下家)');
  const discarded = game.discard.find((x) => x.id === 'sd-judge');
  assert.ok(discarded, '判定牌进入弃牌堆');
  assert.equal(discarded.suit, 'spade', '弃牌堆中判定牌应还原为黑桃, 不应污染为红桃');
});

test('F2: 红颜 + 八卦 — 小乔八卦判定黑桃仍视为红桃 → 视为出闪不掉血', () => {
  const game = buildGame({ playerHero: 'xiaoqiao', enemyHero: 'liubei' });
  game.turn = 'enemy';
  game.player.equipment.armor = c('bagua', { id: 'bagua1' });
  game.player.hand = []; // 无真闪
  game.enemy.hand = [c('sha', { id: 'atk-sha' })];
  game.deck.push(c('sha', { id: 'bagua-judge', suit: 'spade', rank: '7' })); // 黑桃, 若无红颜本应判定失败
  const hpBefore = game.player.hp;
  const playResult = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'atk-sha'));
  assert.equal(playResult.ok, true, playResult.message);
  assert.equal(game.player.hp, hpBefore, '红颜视图: 八卦判定黑桃仍视为红桃 → 视为出闪, 不掉血');
  assert.ok(game.log.some((l) => l.includes('八卦阵')));
  const discarded = game.discard.find((x) => x.id === 'bagua-judge');
  assert.ok(discarded && discarded.suit === 'spade', '弃牌堆中判定牌花色还原为黑桃');
});

test('F3: 红颜 — 小乔出黑桃杀 vs 装仁王盾对手, 不被抵消', () => {
  const game = buildGame({ playerHero: 'xiaoqiao', enemyHero: 'liubei' });
  game.enemy.equipment.armor = c('renwang', { id: 'renwang1' });
  game.enemy.hand = []; // 无闪, 必须掉血或抵消
  game.player.hand = [c('sha', { id: 'black-sha', suit: 'spade', rank: '5' })];
  const enemyHpBefore = game.enemy.hp;
  const playResult = assertCardConservation(game, () => Engine.playCard(game, 'player', 'black-sha'));
  assert.equal(playResult.ok, true, playResult.message);
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '红颜视图: 黑桃杀在小乔手中视为红色, 仁王盾未能抵消');
  assert.ok(!game.log.some((l) => l.includes('仁王盾】抵消')), '未触发仁王盾抵消日志');
});

// ═══════════════════ 运行 ══════════════════════════════════════════════

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
