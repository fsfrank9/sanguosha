// v13 张角修缮 — 用户实测缺陷回归 (雷击自动直发 / 鬼道 auto 乱换判定 /
// "黑桃不命中" 根因 / 描述措辞):
//   1. 雷击玩家侧默认询问 (leiji-ask pendingChoice): 闪结算同步走完后挂起,
//      玩家选目标 / decline / auto (soak 驱动兜底)。
//   2. 玩家鬼道/鬼才不再落 auto: 不可挂起判定时机 (八卦等内嵌判定) 明示
//      跳过, 不替玩家拿最低分牌乱换 (用户实测: 自己的雷击黑桃判定被自己的
//      鬼道自动换成梅花 → "黑桃不命中")。
//   3. 雷击内嵌判定可挂起 (pauseState.leiji): 鬼才/鬼道 ask 面板得以打开,
//      张角核心配合 (雷击判定非黑桃 → 鬼道补黑桃) 玩家侧可用; 改判
//      resolver 的雷击分支完成伤害结算。
//   4. AI 鬼道雷击判定护栏: 原判定已黑桃不动; 只在有黑桃手牌且目标无红颜
//      时替换 (此前无脑最低分黑牌, AI 张角亲手换掉自己的黑桃判定)。
//   5. 同一判定已有改判询问时后到 hook 退让 (双改判者叠问守卫)。
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
    seed: opts.seed || 26001,
    playerHero: opts.playerHero || 'zhangjiao',
    enemyHero: opts.enemyHero || 'liubei'
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
  }
  game.turn = 'player';
  game.phase = 'play';
  return game;
}

// 敌方对玩家张角出杀 → 玩家出闪 → 雷击时机。铺牌 (arm) 与出牌分离,
// assertCardConservation 包出牌调用时基线普查须在铺牌之后。
function armEnemySha(game) {
  game.turn = 'enemy';
  game.enemy.hand.push(c('sha', { id: 'atk-sha' }));
  game.player.hand.push(c('shan', { id: 'p-shan' }));
}
function enemyShaPlayerShan(game) {
  if (!game.enemy.hand.some((x) => x.id === 'atk-sha')) armEnemySha(game);
  return Engine.playCard(game, 'enemy', 'atk-sha');
}

// ───── 1. 雷击玩家侧默认询问 ─────────────────────────────────────────

test('R1: 玩家张角出闪 → 不再直发, 挂 leiji-ask (闪结算已同步走完)', () => {
  const game = buildGame();
  game.deck.push(c('sha', { id: 'leiji-judge', suit: 'spade', rank: '4' }));
  const enemyHpBefore = game.enemy.hp;
  armEnemySha(game);
  const playResult = assertCardConservation(game, () => enemyShaPlayerShan(game));
  assert.equal(playResult.ok, true, playResult.message);
  assert.equal(game.player.hp, game.player.maxHp, '闪已结算, 张角未受伤');
  assert.equal(game.enemy.hp, enemyHpBefore, '判定尚未进行, 攻击者未掉血');
  assert.ok(game.pendingChoice, '挂起选择');
  assert.equal(game.pendingChoice.kind, 'leiji-ask');
  assert.equal(game.pendingChoice.actor, 'player');
  assert.deepEqual(game.pendingChoice.candidates.map((x) => x.seat), ['enemy'], '1v1 候选 = 对手');
  assert.equal(game.deck.length, 1, '判定牌未消耗');
});

test('R2: leiji-ask decline → 不判定不掉血, 牌堆不消耗', () => {
  const game = buildGame();
  game.deck.push(c('sha', { id: 'leiji-judge', suit: 'spade', rank: '4' }));
  enemyShaPlayerShan(game);
  assert.equal(game.pendingChoice.kind, 'leiji-ask');
  const enemyHpBefore = game.enemy.hp;
  const resolveResult = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { decline: true }));
  assert.equal(resolveResult.ok, true, resolveResult.message);
  assert.equal(game.enemy.hp, enemyHpBefore);
  assert.equal(game.deck.length, 1, '未消耗判定牌');
  assert.equal(game.pendingChoice, null);
  assert.ok(game.log.some((l) => l.includes('选择不发动【雷击】')));
});

test('R3: leiji-ask 指定目标 → 判定黑桃, 目标受 2 点雷电伤害', () => {
  const game = buildGame();
  game.deck.push(c('sha', { id: 'leiji-judge', suit: 'spade', rank: '4' }));
  enemyShaPlayerShan(game);
  const enemyHpBefore = game.enemy.hp;
  const resolveResult = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { target: 'enemy' }));
  assert.equal(resolveResult.ok, true, resolveResult.message);
  assert.equal(game.enemy.hp, enemyHpBefore - 2, '判定黑桃 → 2 点雷电伤害');
  assert.ok(game.discard.some((x) => x.id === 'leiji-judge'), '判定牌进弃牌堆');
  assert.equal(game.pendingChoice, null);
  assert.ok(game.log.some((l) => l.includes('雷电')));
});

test('R4: leiji-ask {auto:true} (soak 驱动兜底) → 敌先池目标, 与旧直发口径一致', () => {
  const game = buildGame();
  game.deck.push(c('sha', { id: 'leiji-judge', suit: 'spade', rank: '4' }));
  enemyShaPlayerShan(game);
  const enemyHpBefore = game.enemy.hp;
  const resolveResult = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { auto: true }));
  assert.equal(resolveResult.ok, true, resolveResult.message);
  assert.equal(game.enemy.hp, enemyHpBefore - 2, 'auto → 敌对座席');
});

test('R5: leiji=auto 显式偏好 → 保留旧直发口径 (不挂 pendingChoice)', () => {
  const game = buildGame();
  game.player.skillPreferences.leiji = 'auto';
  game.deck.push(c('sha', { id: 'leiji-judge', suit: 'spade', rank: '4' }));
  const enemyHpBefore = game.enemy.hp;
  armEnemySha(game);
  const playResult = assertCardConservation(game, () => enemyShaPlayerShan(game));
  assert.equal(playResult.ok, true, playResult.message);
  assert.equal(game.pendingChoice, null, '不挂起');
  assert.equal(game.enemy.hp, enemyHpBefore - 2, '直发命中');
});

test('R6: 无效目标 → fail 且重挂 (选择不丢失)', () => {
  const game = buildGame();
  game.deck.push(c('sha', { id: 'leiji-judge', suit: 'spade', rank: '4' }));
  enemyShaPlayerShan(game);
  const resolveResult = Engine.resolvePendingChoice(game, { target: 'player' });
  assert.equal(resolveResult.ok, false, '不能指定自己');
  // resolver fail 后队列续推 — leiji-ask 属一次性时机, fail 即视为放弃
  // (决策约定: decline/空 decision 同义), 不应卡死游戏。
  assert.ok(!game.pendingChoice || game.pendingChoice.kind !== 'shan-response', '不回退到已结算的响应');
});

// ───── 2+3. 雷击内嵌判定 × 鬼道/鬼才 改判 ────────────────────────────

test('R7: 雷击判定红桃 → 鬼道 ask 挂起, 玩家打出黑桃替换 → 命中 2 点雷伤', () => {
  const game = buildGame();
  game.player.hand.push(c('sha', { id: 'g-spade', suit: 'spade', rank: '9' }));
  game.deck.push(c('sha', { id: 'leiji-judge', suit: 'heart', rank: '4' })); // 原判定红桃 → 不命中
  enemyShaPlayerShan(game);
  assert.equal(game.pendingChoice.kind, 'leiji-ask');
  const enemyHpBefore = game.enemy.hp;
  let resolveResult = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { target: 'enemy' }));
  assert.equal(resolveResult.ok, true, resolveResult.message);
  assert.ok(game.pendingChoice, '判定后挂起鬼道改判询问');
  assert.equal(game.pendingChoice.kind, 'guidao-replace');
  assert.equal(game.pendingChoice.reason, '【雷击】');
  assert.equal(game.enemy.hp, enemyHpBefore, '改判未决, 伤害未结算');
  resolveResult = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'g-spade' }));
  assert.equal(resolveResult.ok, true, resolveResult.message);
  assert.equal(game.enemy.hp, enemyHpBefore - 2, '黑桃替换后命中 → 2 点雷电伤害');
  assert.ok(game.discard.some((x) => x.id === 'leiji-judge'), '原判定牌进弃牌堆');
  assert.ok(game.discard.some((x) => x.id === 'g-spade'), '替换牌结算后进弃牌堆');
  assert.ok(!game.player.hand.some((x) => x.id === 'g-spade'), '替换牌离开手牌');
  assert.ok(game.log.some((l) => l.includes('【鬼道】') && l.includes('替换')));
});

test('R8: 雷击判定黑桃 → 鬼道 ask 放弃 ({cardId:null}) → 原判定生效命中', () => {
  const game = buildGame();
  game.player.hand.push(c('sha', { id: 'g-club', suit: 'club', rank: '9' }));
  game.deck.push(c('sha', { id: 'leiji-judge', suit: 'spade', rank: '4' }));
  enemyShaPlayerShan(game);
  Engine.resolvePendingChoice(game, { target: 'enemy' });
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'guidao-replace', '黑桃判定也会询问 (玩家可自愿换)');
  const enemyHpBefore = game.enemy.hp;
  const resolveResult = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: null }));
  assert.equal(resolveResult.ok, true, resolveResult.message);
  assert.equal(game.enemy.hp, enemyHpBefore - 2, '放弃改判, 原黑桃判定命中 — 用户实测"黑桃不命中"根因回归');
  assert.ok(game.player.hand.some((x) => x.id === 'g-club'), '手牌毫发无损 (不再被 auto 乱换)');
  assert.ok(game.log.some((l) => l.includes('选择不发动【鬼道】')));
});

test('R9: 鬼道雷击分支非法牌 (红色) → fail 重挂, 可重选', () => {
  const game = buildGame();
  game.player.hand.push(c('tao', { id: 'g-red', suit: 'heart', rank: '9' }));
  game.player.hand.push(c('sha', { id: 'g-spade', suit: 'spade', rank: '9' }));
  game.deck.push(c('sha', { id: 'leiji-judge', suit: 'heart', rank: '4' }));
  enemyShaPlayerShan(game);
  Engine.resolvePendingChoice(game, { target: 'enemy' });
  assert.equal(game.pendingChoice.kind, 'guidao-replace');
  const bad = Engine.resolvePendingChoice(game, { cardId: 'g-red' });
  assert.equal(bad.ok, false, '红色牌不可替换');
  assert.ok(game.pendingChoice && game.pendingChoice.kind === 'guidao-replace', '选择重挂未丢失');
  const good = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'g-spade' }));
  assert.equal(good.ok, true, good.message);
  assert.ok(game.discard.some((x) => x.id === 'g-spade'));
});

// ───── 4. AI 鬼道雷击护栏 ────────────────────────────────────────────

test('R10: AI 张角雷击判定已黑桃 → 鬼道不动 (不再亲手换掉自己的命中判定)', () => {
  const game = buildGame({ playerHero: 'liubei', enemyHero: 'zhangjiao' });
  game.enemy.hand.push(c('sha', { id: 'ai-club', suit: 'club', rank: '2' })); // 旧行为: 最低分黑牌无脑替换
  game.enemy.hand.push(c('shan', { id: 'ai-shan' }));
  game.player.hand.push(c('sha', { id: 'p-sha' }));
  game.deck.push(c('sha', { id: 'leiji-judge', suit: 'spade', rank: '4' }));
  const playerHpBefore = game.player.hp;
  const playResult = assertCardConservation(game, () => Engine.playCard(game, 'player', 'p-sha'));
  assert.equal(playResult.ok, true, playResult.message);
  assert.equal(game.player.hp, playerHpBefore - 2, '黑桃判定保留 → AI 雷击命中玩家');
  assert.ok(game.enemy.hand.some((x) => x.id === 'ai-club'), '梅花未被浪费');
  assert.ok(!game.log.some((l) => l.includes('【鬼道】')), '鬼道未发动');
});

test('R11: AI 张角雷击判定红桃且手有黑桃 → 鬼道替换成黑桃补命中', () => {
  const game = buildGame({ playerHero: 'liubei', enemyHero: 'zhangjiao' });
  game.enemy.hand.push(c('sha', { id: 'ai-spade', suit: 'spade', rank: '2' }));
  game.enemy.hand.push(c('shan', { id: 'ai-shan' }));
  game.player.hand.push(c('sha', { id: 'p-sha' }));
  game.deck.push(c('sha', { id: 'leiji-judge', suit: 'heart', rank: '4' }));
  const playerHpBefore = game.player.hp;
  const playResult = assertCardConservation(game, () => Engine.playCard(game, 'player', 'p-sha'));
  assert.equal(playResult.ok, true, playResult.message);
  assert.equal(game.player.hp, playerHpBefore - 2, '鬼道补黑桃 → 雷击命中');
  assert.ok(game.log.some((l) => l.includes('【鬼道】')));
  assert.ok(game.discard.some((x) => x.id === 'ai-spade'), '黑桃替换牌结算后进弃牌堆');
});

test('R12: AI 张角雷击判定红桃、只有梅花 (换了也不命中) → 鬼道不发动', () => {
  const game = buildGame({ playerHero: 'liubei', enemyHero: 'zhangjiao' });
  game.enemy.hand.push(c('sha', { id: 'ai-club', suit: 'club', rank: '2' }));
  game.enemy.hand.push(c('shan', { id: 'ai-shan' }));
  game.player.hand.push(c('sha', { id: 'p-sha' }));
  game.deck.push(c('sha', { id: 'leiji-judge', suit: 'heart', rank: '4' }));
  const playerHpBefore = game.player.hp;
  Engine.playCard(game, 'player', 'p-sha');
  assert.equal(game.player.hp, playerHpBefore, '红桃未中且不替换');
  assert.ok(game.enemy.hand.some((x) => x.id === 'ai-club'), '梅花保留 (白弃不发)');
  assert.ok(!game.log.some((l) => l.includes('【鬼道】')));
});

// ───── 2. 玩家鬼才/鬼道不可挂起时机明示跳过 ──────────────────────────

test('R13: 玩家司马懿 + 八卦判定 (不可挂起) → 鬼才明示跳过, 手牌不被烧', () => {
  const game = buildGame({ playerHero: 'simayi', enemyHero: 'liubei' });
  game.turn = 'enemy';
  game.player.equipment.armor = c('bagua', { id: 'bagua1' });
  game.player.hand = [c('tao', { id: 'keep-1', suit: 'heart' })];
  game.enemy.hand = [c('sha', { id: 'atk-sha' })];
  game.deck.push(c('sha', { id: 'bagua-judge', suit: 'heart', rank: '9' })); // 红 → 视为闪
  const playResult = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'atk-sha'));
  assert.equal(playResult.ok, true, playResult.message);
  assert.equal(game.player.hp, game.player.maxHp, '八卦红判定视为闪');
  assert.ok(game.player.hand.some((x) => x.id === 'keep-1'), '手牌未被 auto 烧掉');
  assert.ok(game.log.some((l) => l.includes('【鬼才】时机不可挂起，本次跳过')));
});

test('R14: 玩家张角 + 八卦判定 (不可挂起) → 鬼道明示跳过, 黑牌不被乱换', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.player.equipment.armor = c('bagua', { id: 'bagua1' });
  game.player.hand = [c('sha', { id: 'keep-black', suit: 'club', rank: '3' })];
  game.player.skillPreferences.leiji = 'decline'; // 只验鬼道跳过, 剥离雷击
  game.enemy.hand = [c('sha', { id: 'atk-sha' })];
  game.deck.push(c('sha', { id: 'bagua-judge', suit: 'heart', rank: '9' }));
  const playResult = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'atk-sha'));
  assert.equal(playResult.ok, true, playResult.message);
  assert.ok(game.player.hand.some((x) => x.id === 'keep-black'), '黑牌未被 auto 乱换');
  assert.ok(game.log.some((l) => l.includes('【鬼道】时机不可挂起，本次跳过')));
});

test('R15: guicai=auto 显式偏好 → 旧 auto 口径保留 (八卦判定自动替换)', () => {
  const game = buildGame({ playerHero: 'simayi', enemyHero: 'liubei' });
  game.turn = 'enemy';
  game.player.skillPreferences.guicai = 'auto';
  game.player.equipment.armor = c('bagua', { id: 'bagua1' });
  game.player.hand = [c('sha', { id: 'burn-1', suit: 'spade', rank: '2' })];
  game.enemy.hand = [c('sha', { id: 'atk-sha' })];
  game.deck.push(c('sha', { id: 'bagua-judge', suit: 'heart', rank: '9' }));
  Engine.playCard(game, 'enemy', 'atk-sha');
  assert.ok(!game.player.hand.some((x) => x.id === 'burn-1'), '显式 auto → 照旧替换');
  assert.ok(game.log.some((l) => l.includes('【鬼才】')));
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
