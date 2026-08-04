// v14 Q: AI 博弈深化 — Q3 突袭摸牌阶段真 ask (三轮审计降级项销账) +
// Q2 内奸高阶博弈单元行为 (装忠回避主公/终局收割序/濒死救主 + m3 冻结)。
// Q1 无懈 EV 见 ai_wuxie_ev; Q2 量化验收见 v14_q2_renegade_benchmark。
import assert from 'node:assert/strict';
import { Engine, c } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

// ───── Q3: 突袭真 ask ─────────────────────────────────────────────────

function makeTuxiGame() {
  const game = Engine.newGame({ seed: 49001, startWithFirstTurn: false, playerHero: 'zhangliao', enemyHero: 'lvmeng' });
  game.log = [];
  game.discard = [];
  for (const seat of ['player', 'enemy']) {
    game[seat].judgeArea = [];
    game[seat].flags = {};
    game[seat].skillPreferences = {};
  }
  game.player.hand = [];
  game.enemy.hand = [c('shan', { id: 'e-h1' }), c('tao', { id: 'e-h2' })];
  game.deck = [c('sha', { id: 'dk1' }), c('sha', { id: 'dk2' }), c('sha', { id: 'dk3' })];
  return game;
}

test('Q3 突袭 ask: 玩家张辽摸牌阶段挂起询问, 候选带手牌数', () => {
  const game = makeTuxiGame();
  Engine.startTurn(game, 'player');
  const pending = game.pendingChoice;
  assert.equal(pending && pending.kind, 'tuxi-pick', '缺省挂 ask');
  assert.equal(game.phase, 'draw', '停在摸牌阶段');
  assert.deepEqual(pending.candidates.map((cd) => cd.seat), ['enemy']);
  assert.equal(pending.candidates[0].handCount, 2);
  assert.ok(game.pauseState.tuxiAsk, '快照在位');
});

test('Q3 突袭 ask: 发动 → 获得目标手牌, 放弃摸牌, 推进出牌阶段', () => {
  const game = makeTuxiGame();
  Engine.startTurn(game, 'player');
  assertCardConservation(game, () => {
    const result = Engine.resolvePendingChoice(game, { targets: ['enemy'] });
    assert.equal(result.ok, true, result.message);
  });
  assert.equal(game.player.hand.length, 1, '获得一张 (放弃摸牌)');
  assert.equal(game.enemy.hand.length, 1);
  assert.equal(game.deck.length, 3, '未摸牌');
  assert.equal(game.phase, 'play', '推进出牌阶段');
  assert.equal(game.pauseState.tuxiAsk, null);
  assert.match(game.log.join(' / '), /发动【突袭】，放弃摸牌/);
});

test('Q3 突袭 ask: 3 席双目标 → 各获得一张', () => {
  const game = Engine.newGame({
    seed: 49002, seats: ['player', 'enemy', 'ally'],
    roles: { player: '主公', enemy: '反贼', ally: '反贼' },
    playerHero: 'zhangliao', enemyHero: 'lvmeng', allyHero: 'diaochan'
  });
  game.log = []; game.discard = [];
  for (const seat of game.seats) {
    game[seat].judgeArea = []; game[seat].flags = {}; game[seat].skillPreferences = {};
  }
  game.player.hand = [];
  game.enemy.hand = [c('shan', { id: 'q-e1' })];
  game.ally.hand = [c('tao', { id: 'q-a1' })];
  game.deck = [c('sha', { id: 'q-d1' }), c('sha', { id: 'q-d2' })];
  Engine.startTurn(game, 'player');
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'tuxi-pick');
  Engine.resolvePendingChoice(game, { targets: ['enemy', 'ally'] });
  assert.equal(game.player.hand.length, 2, '双目标各一张');
  assert.equal(game.deck.length, 2, '未摸牌');
  assert.equal(game.phase, 'play');
});

test('Q3 突袭 ask: 不发动 → 照常摸牌 (含空决策 {} 的 soak 兜底契约)', () => {
  const game = makeTuxiGame();
  Engine.startTurn(game, 'player');
  Engine.resolvePendingChoice(game, {});
  assert.equal(game.player.hand.length, 2, '{} = 放弃 → 照常摸 2');
  assert.equal(game.enemy.hand.length, 2, '未偷牌');
  assert.equal(game.deck.length, 1);
  assert.equal(game.phase, 'play');
  assert.match(game.log.join(' / '), /选择不发动【突袭】/);
});

test('Q3 突袭 ask: 非法目标重挂; pref=auto 保留旧直发路径', () => {
  const game = makeTuxiGame();
  Engine.startTurn(game, 'player');
  const bad = Engine.resolvePendingChoice(game, { targets: ['player'] });
  assert.equal(bad.ok, false);
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'tuxi-pick', '非法重挂');
  Engine.resolvePendingChoice(game, { decline: true });
  // pref=auto: 玩家保留旧 AI 期望值门 (可偷满 2 才发动; 单候选 → 不发动直摸)
  const g2 = makeTuxiGame();
  g2.player.skillPreferences.tuxi = 'auto';
  Engine.startTurn(g2, 'player');
  assert.equal(g2.pendingChoice, null, 'auto 不询问');
  assert.equal(g2.player.hand.length, 2, '单候选不满 2 → 直摸');
});

// ───── Q2: 内奸行为单元 ───────────────────────────────────────────────

function makeFiveQ2(opts = {}) {
  const game = Engine.newGame({
    seed: opts.seed || 49011,
    seats: ['player', 'enemy', 'ally', 'ally2', 'ally3'],
    roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '反贼', ally3: '内奸' },
    playerHero: 'liubei', enemyHero: 'caocao', allyHero: 'guanyu', ally2Hero: 'lvbu', ally3Hero: 'simayi'
  });
  game.log = []; game.discard = []; game.deck = [];
  for (const seat of game.seats) {
    game[seat].hand = []; game[seat].judgeArea = [];
    game[seat].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[seat].hp = game[seat].maxHp; game[seat].skillPreferences = {};
    game[seat].flags = {}; game[seat].chuang = [];
  }
  game.turn = 'ally3'; game.phase = 'play';
  return game;
}

test('Q2 装忠: 反贼在场时内奸回避主公 (主公血健康, 候选含主公也不选)', () => {
  const game = makeFiveQ2();
  // 候选 [主公, 反贼] 条件对齐 — 装忠: 反贼 +10 且主公 -25
  const pick = Engine.aiPickHostileTarget(game, 'ally3', ['player', 'enemy']);
  assert.equal(pick, 'enemy', '装忠期打反贼不动主公');
});

test('Q2 终局收割序: 反贼全灭后先清忠臣, 主公未到最后一人不误杀', () => {
  const game = makeFiveQ2();
  game.enemy.hp = 0;
  game.ally2.hp = 0; // 反贼全灭
  const pick = Engine.aiPickHostileTarget(game, 'ally3', ['player', 'ally']);
  assert.equal(pick, 'ally', '先收割忠臣 (主公 -40 防误杀)');
  game.ally.hp = 0; // 仅剩主公与内奸
  // 评审收口: 终局恒单候选, 弑主经函数头短路达成 (评分层无 +60 分支)。
  const finalPick = Engine.aiPickHostileTarget(game, 'ally3', ['player']);
  assert.equal(finalPick, 'player', '终局单挑弑主 (单候选短路)');
});

test('Q2 濒死救主: 反贼在场 + 内奸有桃 → 救主公; m3 冻结不救', () => {
  const game = makeFiveQ2();
  game.turn = 'enemy';
  game.player.hp = 1;
  game.ally.hand = []; // 忠臣无桃
  game.ally3.hand = [c('tao', { id: 'ren-tao' })];
  const enemySha = c('sha', { id: 'kill-lord' });
  game.enemy.hand = [enemySha];
  Engine.playCard(game, 'enemy', 'kill-lord', { target: 'player' });
  assert.ok(game.player.hp >= 1, '内奸救主 (主公先亡=内奸败)');
  assert.ok(game.discard.some((dc) => dc.id === 'ren-tao'), '桃已用');
  // m3 冻结: 同布局不救 → 主公死, 反贼胜
  const g2 = makeFiveQ2({ seed: 49012 });
  g2.turn = 'enemy';
  g2.player.hp = 1;
  g2.ally.hand = [];
  g2.ally3.hand = [c('tao', { id: 'ren-tao2' })];
  g2.ally3.aiRenegadeProfile = 'm3';
  g2.enemy.hand = [c('sha', { id: 'kill-lord2' })];
  Engine.playCard(g2, 'enemy', 'kill-lord2', { target: 'player' });
  assert.equal(g2.phase, 'gameover', 'm3 不救 → 终局');
  assert.equal(g2.winner, 'rebelSide');
  assert.ok(g2.ally3.hand.some((hc) => hc.id === 'ren-tao2'), '桃保留');
});

test('Q2 濒死救主评审收口: 收割期 (反贼全灭仅剩忠臣) 主公濒死仍必救', () => {
  // 首版按感知阵营过滤第三方 ("非 lordSide 存活才救") — 收割期忠臣皆
  // lordSide → 漏救, 而 determineWinner 判主公亡+忠臣存活=反贼胜, 内奸
  // 当场败北。收口后判据 = 除内奸与主公外任一座席存活。
  const game = makeFiveQ2();
  game.enemy.hp = 0;
  game.ally2.hp = 0; // 反贼全灭, 忠臣 ally 存活
  game.turn = 'ally';
  game.player.hp = 1;
  game.ally.hand = [c('sha', { id: 'loyal-sha' })]; // 构造第三方致死路径
  game.ally.equipment.horseMinus = c('minus_horse', { id: 'loyal-horse' }); // 环距 2 → 1 入杀程
  game.ally3.hand = [c('tao', { id: 'harvest-tao' })];
  Engine.playCard(game, 'ally', 'loyal-sha', { target: 'player' });
  assert.notEqual(game.phase, 'gameover', '主公被救, 对局继续');
  assert.ok(game.player.hp >= 1, '内奸救主 (忠臣存活时主公亡=反贼胜=内奸败)');
  assert.ok(game.discard.some((dc) => dc.id === 'harvest-tao'), '桃已用');
});

test('Q2 暗身份评审收口: 开局零证据不误入收割模式 (未知席位视作反贼可能仍在)', () => {
  // 首版 renegadeRebelsAlive 只认"感知为反贼"的席位 — 暗置开局全 null →
  // 误判反贼已清, 对非主公席全挂 +40 收割分。收口后未知席位计入
  // "反贼可能仍在", 内奸回到骑墙观望而非见人就打。
  const game = makeFiveQ2();
  game.hiddenRoles = true;
  // 主公恒公开; 其余席位无任何行为证据 → perceivedSideOf = null。
  // 候选 [忠臣(未知), 主公]: 若误入收割模式, 忠臣 +40 / 主公 -40 分差 80
  // 使敌意/血线信号全部失效; 收口后主公 -25、忠臣无收割分, 血线差可翻盘。
  game.ally.hp = 1;   // 未知席位低血 (+30)
  game.player.hp = 1; // 主公同等低血 (+30) — 排除血线差干扰
  const pick = Engine.aiPickHostileTarget(game, 'ally3', ['player', 'ally']);
  assert.equal(pick, 'ally', '暗置零证据: 不打主公 (胜路约束仍生效)');
  // 对照: 明置同布局 (反贼真存活) 行为一致 — 收口不改明置行为
  const g2 = makeFiveQ2({ seed: 49013 });
  g2.ally.hp = 1;
  g2.player.hp = 1;
  const pick2 = Engine.aiPickHostileTarget(g2, 'ally3', ['player', 'ally']);
  assert.equal(pick2, 'ally', '明置对照: 同样回避主公');
});

await runTests();
