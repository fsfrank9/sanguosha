// v15 S2: 蛊惑 AI 博弈 (全型声明启发 + 质疑面收官) —
//   ① 真牌恒蛊惑扩到全 16 型 (原 v1 仅无中生有); ② 诈声明按型 EV 序,
//   预判有质疑者即抑制; ③ 质疑面新增 响应赌假 与 被抓包记忆 (公开信息);
//   ④ 声明启发与质疑启发的自洽性 (AI 生态内诈声明不送牌)。
// 只读公开面: 声明型/目标/自身状态/感知敌对/已亮出过的牌 — 不读暗牌、
// 不读暗置身份 (架构红线 ai_zero_omniscience 同款约束)。
import assert from 'node:assert/strict';
import { Engine, c } from './helpers/load-engine.mjs';
import { test, runTests } from './helpers/harness.mjs';

function buildDuel(playerHero = 'caocao', enemyHero = 'yuji', seed = 75201) {
  const game = Engine.newGame({ seed, playerHero, enemyHero });
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
  game.turn = 'enemy';
  game.phase = 'play';
  return game;
}

// ───── 全型声明启发 ─────

test('S2 真牌恒蛊惑 (全型): 真【杀】/真【顺手牵羊】都走蛊惑声明, 不再只认无中', () => {
  const shaGame = buildDuel();
  shaGame.enemy.hand = [c('sha', { id: 'ai-sha' })];
  const shaAction = Engine.aiTakeAction(shaGame, 'enemy');
  assert.equal(shaAction.action, 'guhuo', '真杀走蛊惑');
  assert.ok(shaGame.log.some((line) => /背面朝上使用【杀】/.test(line)));

  const stealGame = buildDuel();
  stealGame.enemy.hand = [c('shunshou', { id: 'ai-ss' })];
  stealGame.player.hand = [c('sha', { id: 'p-hand' })];
  const stealAction = Engine.aiTakeAction(stealGame, 'enemy');
  assert.equal(stealAction.action, 'guhuo', '真顺手牵羊走蛊惑');
  assert.ok(stealGame.log.some((line) => /背面朝上使用【顺手牵羊】/.test(line)));
});

test('S2 真牌恒蛊惑: 该型当前不合法时跳过, 按 EV 序换下一个可声明型', () => {
  const game = buildDuel();
  // 真【桃】但自己满血 (桃不合法) + 真【杀】有合法目标 → 落到杀
  game.enemy.hand = [c('tao', { id: 'ai-tao' }), c('sha', { id: 'ai-sha2' })];
  const action = Engine.aiTakeAction(game, 'enemy');
  assert.equal(action.action, 'guhuo');
  assert.ok(game.log.some((line) => /背面朝上使用【杀】/.test(line)), '桃不合法 → 换杀');
  assert.ok(game.enemy.hand.some((card) => card.id === 'ai-tao'), '桃留在手里');
});

test('S2 诈声明: 预判无质疑者 → 用死牌诈; 预判有质疑者 → 抑制 (与质疑启发自洽)', () => {
  // 玩家 hp=2 → 按 AI 自身感知模型不构成质疑者 → 诈
  const bluff = buildDuel();
  bluff.enemy.hand = [c('shan', { id: 'dead-shan' })];
  bluff.player.hp = 2;
  bluff.deck = [c('tao', { id: 'd1' }), c('tao', { id: 'd2' })];
  const bluffAction = Engine.aiTakeAction(bluff, 'enemy');
  assert.equal(bluffAction.action, 'guhuo', '预判无质疑者 → 诈');
  // 玩家席恒开质疑窗 (人不受 AI 预判模型约束); 放弃后诈声明成立
  Engine.resolvePendingChoice(bluff, {});
  assert.equal(bluff.enemy.hand.length, 2, '无中生有诈成功摸 2');

  const suppressed = buildDuel();
  suppressed.enemy.hand = [c('shan', { id: 'dead-shan-2' })];
  const suppressedAction = Engine.aiTakeAction(suppressed, 'enemy');
  assert.notEqual(suppressedAction.action, 'guhuo', '玩家 hp>=3 敌对 → 预判会被质疑 → 不诈');
  assert.ok(!suppressed.enemy.flags.guhuoUsedThisTurn, '蛊惑未发动');
});

test('S2 自洽性 (AI 生态): 声明启发预判无质疑 → 全部 AI 席的质疑启发确实放行', () => {
  const game = Engine.newGame({
    seed: 75213,
    seats: ['player', 'enemy', 'ally'],
    roles: { player: '主公', enemy: '反贼', ally: '忠臣' },
    playerHero: 'liubei', enemyHero: 'yuji', allyHero: 'guanyu'
  });
  game.log = []; game.discard = []; game.deck = [c('tao', { id: 'd1' }), c('tao', { id: 'd2' })];
  for (const seat of game.seats) {
    game[seat].hand = []; game[seat].judgeArea = []; game[seat].flags = {};
    game[seat].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[seat].hp = game[seat].maxHp; game[seat].skillPreferences = {};
  }
  game.turn = 'enemy';
  game.phase = 'play';
  // 玩家与忠臣都被打到 hp<=2 → 反贼于吉按自身感知模型预判无人质疑
  game.player.hp = 2;
  game.ally.hp = 2;
  game.enemy.hand = [c('shan', { id: 'eco-dead' })];
  const action = Engine.aiTakeAction(game, 'enemy');
  assert.equal(action.action, 'guhuo', '预判无质疑者 → 诈');
  Engine.resolvePendingChoice(game, {}); // 玩家席放弃
  assert.ok(!game.log.some((line) => /质疑【蛊惑】！/.test(line)),
    'AI 忠臣席按同一模型确实没有质疑 — 声明与质疑两侧自洽');
  assert.equal(game.enemy.hand.length, 2, '诈声明畅通结算');
});

test('S2 诈声明: 无死牌 (手牌全是能用的真牌) 时不硬诈', () => {
  const game = buildDuel();
  game.player.hp = 2; // 排除"预判有质疑者"这一抑制因素
  game.enemy.hand = [];
  const action = Engine.aiTakeAction(game, 'enemy');
  assert.notEqual(action.action, 'guhuo', '无手牌不可能声明');
});

// ───── 质疑面: 响应赌假 ─────

function buildResponseCase(seed, tweak) {
  const game = Engine.newGame({ seed, playerHero: 'yuji', enemyHero: 'caocao' });
  game.log = []; game.discard = []; game.deck = [];
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = []; game[actor].judgeArea = []; game[actor].flags = {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp;
    game[actor].skillPreferences = { shanResponse: 'ask', dying: 'ask' };
  }
  game.turn = 'enemy';
  game.phase = 'play';
  if (tweak) tweak(game);
  game.player.hand = game.player.hand.length ? game.player.hand : [c('sha', { id: 'resp-cover' })];
  game.enemy.hand = [c('sha', { id: 'resp-e-sha' })];
  Engine.playCard(game, 'enemy', 'resp-e-sha', { target: 'player' });
  Engine.resolvePendingChoice(game, {
    guhuo: { cardId: game.player.hand.length ? 'resp-cover' : 'resp-cover', declareType: 'shan' }
  });
  return game;
}

function challenged(game) {
  return game.log.some((line) => /质疑【蛊惑】！/.test(line));
}

test('S2 质疑面 响应赌假: "挡住我"只是必要条件 — 无赌假理由时不质疑 (真牌钓缠怨面已堵)', () => {
  // 评审收口回归钉: 首版无条件恒质疑 → 于吉用真牌声明即可稳定钓走缠怨,
  // 此后 1v1 质疑队列恒空、全型可无风险诈。
  const clean = buildResponseCase(75221);
  assert.equal(challenged(clean), false, '无前科/无空窗记账/血线健康 → 不赌');
  assert.equal(clean.enemy.chanyuan, undefined, '不送缠怨');
});

test('S2 质疑面 响应赌假 ①有前科: 被质破多于被验真 → 质疑', () => {
  const game = buildResponseCase(75222, (g) => { g.player.guhuoBusted = 1; });
  assert.equal(challenged(game), true);
});

test('S2 质疑面 响应赌假 ②响应空窗记账: 该席此前公开证明凑不出闪 → 质疑', () => {
  const game = buildResponseCase(75223, (g) => { g.player.aiRevealed = { shan: true }; });
  assert.equal(challenged(game), true);
});

test('S2 质疑面 响应赌假 ③高赌注: 声明者血线见底 (打出成功他就活了) → 质疑', () => {
  const game = buildResponseCase(75224, (g) => { g.player.hp = 1; });
  assert.equal(challenged(game), true);
});

test('S2 质疑面 响应赌假: 质疑者自己血线见底 (hp<=1) → 恒不赌 (缠怨久期不可承受)', () => {
  const game = buildResponseCase(75225, (g) => { g.enemy.hp = 1; g.player.guhuoBusted = 3; });
  assert.equal(challenged(game), false);
});

test('S2 质疑面 响应赌假 ③高赌注: 濒死救援恒质疑 (赌中即当场终结)', () => {
  const game = Engine.newGame({ seed: 75226, playerHero: 'yuji', enemyHero: 'caocao' });
  game.log = []; game.discard = []; game.deck = [];
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = []; game[actor].judgeArea = []; game[actor].flags = {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp;
    game[actor].skillPreferences = { shanResponse: 'ask', dying: 'ask' };
  }
  game.turn = 'enemy';
  game.phase = 'play';
  game.player.hp = 1;
  game.player.hand = [c('tao', { id: 'dy-tao', suit: 'heart', color: 'red' })];
  game.enemy.hand = [c('sha', { id: 'dy-sha' })];
  Engine.playCard(game, 'enemy', 'dy-sha', { target: 'player' });
  Engine.resolvePendingChoice(game, { use: false }); // 不出闪 → 濒死
  Engine.resolvePendingChoice(game, { guhuo: { cardId: 'dy-tao', declareType: 'tao' } });
  assert.equal(challenged(game), true, '救援声明恒质疑');
  assert.equal(game.enemy.chanyuan, true, '这次是真桃 → 质疑者吃缠怨');
});

// ───── 质疑面: 被抓包记忆 ─────

test('S2 被抓包记忆: 亮出结果按声明者记公开账 (验假 busted / 验真 proven)', () => {
  const game = buildDuel();
  game.enemy.hand = [c('shan', { id: 'busted-cover' })];
  game.player.hp = 2; // 不构成 AI 预判中的质疑者 → 允许诈
  game.deck = [c('tao', { id: 'd1' }), c('tao', { id: 'd2' })];
  Engine.playGuhuoDeclare(game, 'enemy', { cardId: 'busted-cover', declareType: 'wuzhong' });
  assert.ok(Engine.getPendingChoice(game), '玩家质疑窗');
  Engine.resolvePendingChoice(game, { challenge: true });
  assert.equal(game.enemy.guhuoBusted, 1, '验假 → 被抓包计数 +1');
  assert.equal(game.enemy.guhuoProven, undefined, '验假不计诚信');
  assert.equal(game.player.chanyuan, undefined, '验假不给缠怨');
});

test('S2 被抓包记忆: 记录在案的声明者 → 敌对席在原三面之外也质疑', () => {
  // 声明者=玩家于吉, 质疑者=AI 曹操 (质疑决策走启发而非窗口)
  const clean = buildDuel('yuji', 'caocao');
  clean.turn = 'player';
  clean.player.hand = [c('jiu', { id: 'clean-jiu' })];
  Engine.playGuhuoDeclare(clean, 'player', { cardId: 'clean-jiu', declareType: 'jiu' });
  assert.ok(!clean.log.some((line) => /质疑【蛊惑】！/.test(line)),
    '基线: 酒不在 保命/denial/护财 三面 → 放行');

  const busted = buildDuel('yuji', 'caocao');
  busted.turn = 'player';
  busted.player.guhuoBusted = 2; // 此前两次被质破 (公开信息)
  busted.player.hand = [c('jiu', { id: 'busted-jiu' })];
  Engine.playGuhuoDeclare(busted, 'player', { cardId: 'busted-jiu', declareType: 'jiu' });
  assert.ok(busted.log.some((line) => /质疑【蛊惑】！/.test(line)), '有前科 → 质疑');
  assert.equal(busted.enemy.chanyuan, true, '这次是真牌 → 质疑者吃缠怨 (记忆有代价)');
  assert.equal(busted.player.guhuoProven, 1, '验真 → 诚信计数 +1');
});

test('S2 被抓包记忆 平衡: 诚信次数不低于被抓包次数时不因记忆质疑', () => {
  const game = buildDuel('yuji', 'caocao');
  game.turn = 'player';
  game.player.guhuoBusted = 1;
  game.player.guhuoProven = 1;
  game.player.hand = [c('jiu', { id: 'even-jiu' })];
  Engine.playGuhuoDeclare(game, 'player', { cardId: 'even-jiu', declareType: 'jiu' });
  assert.ok(!game.log.some((line) => /质疑【蛊惑】！/.test(line)), '战绩持平 → 不因记忆开质疑');
});

await runTests();

console.log('\nv15 S2 蛊惑 AI 博弈 (全型声明 + 质疑面收官) 用例通过。');
