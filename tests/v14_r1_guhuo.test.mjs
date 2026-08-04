// v14 R1: 蛊惑 (于吉, 风包现行版) 引擎行为 —
//   声明→质疑→翻验 三态 (无人质疑/验真+缠怨/验假终止) + 首质疑即止 +
//   缠怨双效 (不能质疑 / hp1 技能压制) + 每回合限一次 + 守恒 + AI 启发。
// 官方文本: official-skill-cache/gltjk-sanguosha-rules/pages/
// card__hero__neutral.md:324-338; 质疑序 rule__principle.md:50。
import assert from 'node:assert/strict';
import { Engine, c } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function buildDuel(playerHero, enemyHero, seed) {
  const game = Engine.newGame({ seed: seed || 71001, playerHero: playerHero || 'yuji', enemyHero: enemyHero || 'caocao' });
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

// ───── 声明合法性 ─────

test('R1 声明门: 非白名单型 (闪/延时锦囊) 拒绝; 非出牌阶段拒绝; 每回合限一次', () => {
  const game = buildDuel();
  game.player.hand = [c('shan', { id: 'cover-1' }), c('sha', { id: 'cover-2' })];
  assert.equal(Engine.playGuhuoDeclare(game, 'player', { cardId: 'cover-1', declareType: 'shan' }).ok, false, '闪无主动使用时机');
  assert.equal(Engine.playGuhuoDeclare(game, 'player', { cardId: 'cover-1', declareType: 'lebusishu' }).ok, false, '延时锦囊不可声明');
  game.phase = 'draw';
  assert.equal(Engine.playGuhuoDeclare(game, 'player', { cardId: 'cover-1', declareType: 'wuzhong' }).ok, false, '非出牌阶段拒绝');
  game.phase = 'play';
  // 声明杀 (敌方健康 → AI 不质疑) → 成功; 同回合再声明 → 拒绝
  game.deck = [c('shan', { id: 'd1' })];
  const first = Engine.playGuhuoDeclare(game, 'player', { cardId: 'cover-2', declareType: 'sha', target: 'enemy' });
  assert.equal(first.ok, true, '首次声明成功');
  assert.equal(Engine.playGuhuoDeclare(game, 'player', { cardId: 'cover-1', declareType: 'wuzhong' }).ok, false, '每名角色的回合内限一次');
});

test('R1 声明门: 桃体力满拒绝 (声明牌使用规则预检); 杀已用拒绝', () => {
  const game = buildDuel();
  game.player.hand = [c('shan', { id: 'cover-3' })];
  assert.equal(Engine.playGuhuoDeclare(game, 'player', { cardId: 'cover-3', declareType: 'tao' }).ok, false, '体力满不能声明桃');
  game.player.usedSha = true;
  assert.equal(Engine.playGuhuoDeclare(game, 'player', { cardId: 'cover-3', declareType: 'sha', target: 'enemy' }).ok, false, '本回合已用杀 → 声明杀拒绝');
});

// ───── 三态结算 ─────

test('R1 无人质疑: 声明杀 (真) 照常结算, 实体牌入弃牌堆, 守恒', () => {
  const game = buildDuel();
  const shaCard = c('sha', { id: 'gh-sha', suit: 'spade', color: 'black' });
  game.player.hand = [shaCard];
  game.enemy.hand = [c('shan', { id: 'e-shan' })];
  // 敌方满血 → 保命/无中质疑面均不触发 → 不质疑
  assertCardConservation(game, () => {
    const result = Engine.playGuhuoDeclare(game, 'player', { cardId: 'gh-sha', declareType: 'sha', target: 'enemy' });
    assert.equal(result.ok, true);
  });
  assert.ok(game.discard.some((dc) => dc.id === 'e-shan'), '敌方闪响应 (杀照常结算)');
  assert.ok(game.discard.some((dc) => dc.id === 'gh-sha'), '实体牌结算后入弃牌堆');
  assert.equal(game.player.usedSha, true, '声明杀结算 → 杀限次落账');
  assert.ok(game.log.some((l) => /背面朝上使用【杀】/.test(l)), '声明日志不泄露真牌');
});

test('R1 质疑为真: 质疑者获缠怨 (skills 入列 + 旗标), 牌照常结算', () => {
  const game = buildDuel();
  game.player.hand = [c('wuzhong', { id: 'gh-wz' })];
  game.deck = [c('shan', { id: 'd1' }), c('shan', { id: 'd2' })];
  // 敌方 hp>=3 且敌对 → 无中 denial 质疑触发
  assertCardConservation(game, () => {
    const result = Engine.playGuhuoDeclare(game, 'player', { cardId: 'gh-wz', declareType: 'wuzhong' });
    assert.equal(result.ok, true);
  });
  assert.equal(game.enemy.chanyuan, true, '质疑真牌 → 缠怨旗标');
  assert.ok(game.enemy.skills.some((s) => s.id === 'chanyuan'), '缠怨入 skills (UI 可见)');
  assert.equal(game.player.hand.length, 2, '无中照常结算摸 2');
  assert.ok(game.discard.some((dc) => dc.id === 'gh-wz'), '实体牌入弃牌堆');
});

test('R1 质疑为假: 终止结算入弃牌堆; 声明牌限次未消耗 (仍可出真杀); 蛊惑发动次数已消耗', () => {
  const game = buildDuel();
  const realSha = c('sha', { id: 'real-sha' });
  game.player.hand = [c('shan', { id: 'fake-cover' }), realSha];
  game.deck = [c('shan', { id: 'd1' }), c('shan', { id: 'd2' })];
  // 声明无中 (盖闪) → 敌方质疑 → 验假
  assertCardConservation(game, () => {
    const result = Engine.playGuhuoDeclare(game, 'player', { cardId: 'fake-cover', declareType: 'wuzhong' });
    assert.equal(result.ok, true, '验假分支 API 面成功 (结算终止是结果而非错误)');
  });
  assert.ok(game.discard.some((dc) => dc.id === 'fake-cover'), '验假: 实体牌入弃牌堆');
  assert.equal(game.player.hand.length, 1, '未摸牌 (结算终止)');
  assert.equal(game.enemy.chanyuan, undefined, '验假不给缠怨');
  // "视为没有使用过声明牌名的牌": usedSha 未落账 → 真杀仍可出
  game.enemy.hand = [];
  const shaResult = Engine.playCard(game, 'player', 'real-sha', { target: 'enemy' });
  assert.equal(shaResult.ok, true, '验假后真杀照常可出 (声明牌限次未消耗)');
  // 蛊惑本身发动次数已消耗
  assert.equal(Engine.playGuhuoDeclare(game, 'player', { cardId: 'real-sha', declareType: 'wuzhong' }).ok, false);
});

// ───── 缠怨双效 ─────

test('R1 缠怨-①: 持有者退出质疑队列 — 再声明无中不再被质疑', () => {
  const game = buildDuel();
  game.player.hand = [c('wuzhong', { id: 'wz-1' })];
  game.deck = [c('shan', { id: 'd1' }), c('shan', { id: 'd2' }), c('tao', { id: 'd3' }), c('tao', { id: 'd4' })];
  Engine.playGuhuoDeclare(game, 'player', { cardId: 'wz-1', declareType: 'wuzhong' });
  assert.equal(game.enemy.chanyuan, true, '首轮质疑真 → 缠怨');
  // 下一回合再声明 (盖假牌) — 缠怨持有者不能质疑 → 无人质疑照常结算
  Engine.startTurn(game, 'enemy');
  game.pendingChoice = null; game.pendingChoiceQueue = [];
  Engine.startTurn(game, 'player');
  game.pendingChoice = null; game.pendingChoiceQueue = [];
  game.phase = 'play';
  game.player.hand = [c('shan', { id: 'fake-2' })];
  game.deck = [c('tao', { id: 'd5' }), c('tao', { id: 'd6' })];
  const result = Engine.playGuhuoDeclare(game, 'player', { cardId: 'fake-2', declareType: 'wuzhong' });
  assert.equal(result.ok, true);
  assert.equal(game.player.hand.length, 2, '缠怨封口 → 假声明畅通结算摸 2');
});

test('R1 缠怨-②: 体力值为 1 → 除缠怨外技能无效 (武圣压制 + 恢复)', () => {
  const game = buildDuel('yuji', 'guanyu');
  game.player.hand = [c('wuzhong', { id: 'wz-2' })];
  game.deck = [c('shan', { id: 'd1' }), c('shan', { id: 'd2' })];
  Engine.playGuhuoDeclare(game, 'player', { cardId: 'wz-2', declareType: 'wuzhong' });
  assert.equal(game.enemy.chanyuan, true, '关羽质疑真 → 缠怨');
  // 关羽 hp 降到 1 → 武圣被压制 (红牌不能当杀)
  const redCard = c('tao', { id: 'red-1', suit: 'heart', color: 'red' });
  game.enemy.hand = [redCard];
  game.turn = 'enemy';
  game.enemy.hp = 1;
  assert.equal(Engine.canPlayCardAs(game, 'enemy', 'red-1', 'sha').ok, false, 'hp=1: 武圣无效');
  game.enemy.hp = 2;
  assert.equal(Engine.canPlayCardAs(game, 'enemy', 'red-1', 'sha').ok, true, 'hp=2: 武圣恢复');
});

// ───── 玩家质疑窗 ─────

test('R1 玩家质疑窗: AI 于吉声明 → 玩家 pendingChoice; {challenge} 验真获缠怨; {} 放弃续跑', () => {
  const game = buildDuel('caocao', 'yuji');
  game.turn = 'enemy';
  game.enemy.hand = [c('wuzhong', { id: 'ai-wz' })];
  game.deck = [c('shan', { id: 'd1' }), c('shan', { id: 'd2' })];
  const declared = Engine.playGuhuoDeclare(game, 'enemy', { cardId: 'ai-wz', declareType: 'wuzhong' });
  assert.equal(declared.ok, true);
  const pending = Engine.getPendingChoice(game);
  assert.ok(pending && pending.kind === 'guhuo-challenge', '玩家质疑窗挂起');
  assert.equal(pending.declaredName, '无中生有', '面板可见声明牌名');
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { challenge: true }));
  assert.equal(game.player.chanyuan, true, '玩家质疑真 → 缠怨');
  assert.equal(game.enemy.hand.length, 2, 'AI 无中照常摸 2');
});

test('R1 玩家放弃质疑 ({} soak 兜底): 队列续跑至无人质疑结算', () => {
  const game = buildDuel('caocao', 'yuji');
  game.turn = 'enemy';
  game.enemy.hand = [c('shan', { id: 'ai-fake' })];
  game.deck = [c('tao', { id: 'd1' }), c('tao', { id: 'd2' })];
  Engine.playGuhuoDeclare(game, 'enemy', { cardId: 'ai-fake', declareType: 'wuzhong' });
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, {}));
  assert.equal(Engine.getPendingChoice(game), null);
  assert.equal(game.enemy.hand.length, 2, '玩家放弃 → 假声明结算成功摸 2');
});

// ───── 5 人场: 质疑序与首质疑即止 ─────

test('R1 首质疑即止 (5p): 环序首个符合质疑面的座席质疑后, 后位不再表态', () => {
  const game = Engine.newGame({
    seed: 71005,
    seats: ['player', 'enemy', 'ally', 'ally2', 'ally3'],
    roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '反贼', ally3: '内奸' },
    playerHero: 'liubei', enemyHero: 'caocao', allyHero: 'guanyu', ally2Hero: 'lvbu', ally3Hero: 'yuji'
  });
  game.log = []; game.discard = []; game.deck = [c('shan', { id: 'd1' }), c('shan', { id: 'd2' })];
  for (const seat of game.seats) {
    game[seat].hand = []; game[seat].judgeArea = [];
    game[seat].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[seat].hp = game[seat].maxHp; game[seat].skillPreferences = {}; game[seat].flags = {};
  }
  game.turn = 'ally3'; game.phase = 'play';
  // 内奸于吉声明真无中: 环序 (从 ally3 起) → player, enemy, ally, ally2。
  // player 挂窗放弃 → enemy (hp>=3, 感知敌对内奸) 首质疑 → ally/ally2 不再表态。
  game.ally3.hand = [c('wuzhong', { id: 'ren-wz' })];
  Engine.playGuhuoDeclare(game, 'ally3', { cardId: 'ren-wz', declareType: 'wuzhong' });
  Engine.resolvePendingChoice(game, {});
  const challengeLogs = game.log.filter((l) => /质疑【蛊惑】！/.test(l));
  assert.equal(challengeLogs.length, 1, '首质疑即止 — 恰一条质疑日志');
  assert.equal(game.enemy.chanyuan, true, '环序首位质疑者 (enemy) 获缠怨');
  assert.equal(game.ally.chanyuan, undefined, '后位不再表态');
  assert.equal(game.ally2.chanyuan, undefined);
  assert.equal(game.ally3.hand.length, 2, '验真照常结算');
});

// ───── AI 启发 ─────

test('R1 AI 声明: 真无中恒走蛊惑; 诈声明在预判有质疑者时抑制', () => {
  // 真无中: aiTakeAction 首选蛊惑声明
  const game = buildDuel('caocao', 'yuji');
  game.turn = 'enemy';
  game.enemy.hand = [c('wuzhong', { id: 'ai-wz2' })];
  game.deck = [c('shan', { id: 'd1' }), c('shan', { id: 'd2' })];
  const action = Engine.aiTakeAction(game, 'enemy');
  assert.equal(action.action, 'guhuo', 'AI 真无中走蛊惑声明');
  assert.ok(Engine.getPendingChoice(game), '玩家质疑窗挂起 (AI 回合暂停)');
  Engine.resolvePendingChoice(game, {});
  // 诈声明抑制: 手里只有闪 (死牌), 但玩家 hp>=3 敌对 → 预判会被质疑 → 不诈
  const g2 = buildDuel('caocao', 'yuji');
  g2.turn = 'enemy';
  g2.enemy.hand = [c('shan', { id: 'ai-dead' })];
  const a2 = Engine.aiTakeAction(g2, 'enemy');
  assert.notEqual(a2.action, 'guhuo', '预判有质疑者 → 不诈');
  assert.ok(!g2.enemy.flags.guhuoUsedThisTurn, '蛊惑未发动');
});

// ───── 评审收口回归钉 ─────

test('R1 收口: 指向型声明必须显式给目标 (官方: 声明牌名的同时选择合法目标)', () => {
  const game = buildDuel();
  game.player.hand = [c('sha', { id: 'nt-sha' })];
  const r = Engine.playGuhuoDeclare(game, 'player', { cardId: 'nt-sha', declareType: 'sha' });
  assert.equal(r.ok, false, '无目标声明杀拒绝');
  assert.equal(game.player.hand.length, 1, '声明失败零副作用');
  assert.ok(!game.player.flags.guhuoUsedThisTurn, '发动次数未消耗');
});

test('R1 收口: 结算选项白名单 — 重铸旁路禁止, 未校验字段不透传', () => {
  const game = buildDuel();
  game.player.hand = [c('shan', { id: 'wl-cover' })];
  game.deck = [c('tao', { id: 'wl-d1' })];
  // mode:'recast' 被丢弃 → 铁索声明按"使用"走, 无 targets → 声明期拒绝
  const r1 = Engine.playGuhuoDeclare(game, 'player', { cardId: 'wl-cover', declareType: 'tiesuo', mode: 'recast' });
  assert.equal(r1.ok, false, '重铸不是使用/打出, 不在蛊惑文本内');
  assert.equal(game.player.hand[0].type, 'shan', '实体牌面未被改写');
  // taoTarget 不透传: 声明桃 (己方受伤) → 恒对自己结算
  game.player.hp = game.player.maxHp - 1;
  const r2 = Engine.playGuhuoDeclare(game, 'player', { cardId: 'wl-cover', declareType: 'tao', taoTarget: 'enemy' });
  assert.equal(r2.ok, true);
  assert.equal(game.player.hp, game.player.maxHp, 'taoTarget 被丢弃 → 桃恒对自己');
});

test('R1 收口: 结算拒绝退牌换回实体 — 实体牌面不被声明型改写 (防伪造面)', () => {
  // 声明期目标合法, 玩家质疑窗挂起期间目标阵亡 → 结算拒绝 → handler
  // 退回的是声明型门面对象; 收口后按 id 换回实体。
  const game = buildDuel('caocao', 'yuji');
  game.turn = 'enemy';
  const cover = c('tao', { id: 'forge-cover', suit: 'heart' });
  game.enemy.hand = [cover];
  const r = Engine.playGuhuoDeclare(game, 'enemy', { cardId: 'forge-cover', declareType: 'sha', target: 'player' });
  assert.equal(r.ok, true);
  assert.ok(Engine.getPendingChoice(game), '玩家质疑窗挂起');
  game.player.hp = 0; // 挂起期间目标阵亡 → 结算期杀拒绝
  Engine.resolvePendingChoice(game, {});
  const back = game.enemy.hand.find((hc) => hc.id === 'forge-cover');
  assert.ok(back, '实体牌退回手牌');
  assert.equal(back.type, 'tao', '牌面仍是桃 — 未被声明型【杀】改写');
  assert.equal(back, cover, '退回的是实体对象本身');
});

test('R1 收口: AI 质疑面扩展 — 桃园/五谷 denial 与 拆/顺 护财', () => {
  const game = buildDuel();
  game.player.hand = [c('shan', { id: 'ai-f1' }), c('shan', { id: 'ai-f2' })];
  game.deck = [c('tao', { id: 'd1' })];
  // 假声明桃园 → 敌方 hp>=3 敌对 → denial 质疑 → 验假弃置
  const r1 = Engine.playGuhuoDeclare(game, 'player', { cardId: 'ai-f1', declareType: 'taoyuan' });
  assert.equal(r1.ok, true);
  assert.ok(game.discard.some((dc) => dc.id === 'ai-f1'), '桃园假声明被质破');
  assert.equal(game.enemy.chanyuan, undefined, '验假不给缠怨');
  // 下一回合: 假声明顺手牵羊指向敌方 (其有手牌) → 护财质疑
  Engine.startTurn(game, 'enemy');
  game.pendingChoice = null; game.pendingChoiceQueue = [];
  Engine.startTurn(game, 'player');
  game.pendingChoice = null; game.pendingChoiceQueue = [];
  game.phase = 'play';
  game.player.hand = [c('shan', { id: 'ai-f3' })];
  game.enemy.hand = [c('sha', { id: 'e-h1' })];
  const r2 = Engine.playGuhuoDeclare(game, 'player', { cardId: 'ai-f3', declareType: 'shunshou', target: 'enemy' });
  assert.equal(r2.ok, true);
  assert.ok(game.discard.some((dc) => dc.id === 'ai-f3'), '顺手假声明被护财质破');
  assert.ok(game.enemy.hand.some((hc) => hc.id === 'e-h1'), '敌方手牌未失');
});

test('R1 守恒: 声明挂起期间实体牌锚定在 pauseState (census 在途面)', () => {
  const game = buildDuel('caocao', 'yuji');
  game.turn = 'enemy';
  game.enemy.hand = [c('wuzhong', { id: 'anchor-wz' })];
  game.deck = [c('shan', { id: 'd1' }), c('shan', { id: 'd2' })];
  assertCardConservation(game, () => {
    Engine.playGuhuoDeclare(game, 'enemy', { cardId: 'anchor-wz', declareType: 'wuzhong' });
  });
  assert.ok(game.pauseState.guhuo && game.pauseState.guhuo.physical.id === 'anchor-wz',
    '盖置牌在 pauseState.guhuo 锚定');
  Engine.resolvePendingChoice(game, {});
});

await runTests();

console.log('\nv14 R1 蛊惑引擎行为用例通过。');
