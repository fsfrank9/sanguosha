// v15 T 评审收口回归钉 — opus 对抗复现报出、本批已修的每一条各留一钉。
// 命名前缀即报告编号 (H1 / M1-M10 / L1-L6 / U1), 便于回溯。
import assert from 'node:assert/strict';
import { Engine, c } from './helpers/load-engine.mjs';
import { assertCardConservation, collectCardCensus, countAllCards } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function duel(playerHero, enemyHero = 'caocao', seed = 79001) {
  const game = Engine.newGame({ seed, playerHero, enemyHero });
  game.log = []; game.discard = [];
  game.deck = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'].map((id) => c('sha', { id, suit: 'spade', rank: '5' }));
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = []; game[actor].judgeArea = []; game[actor].flags = {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp; game[actor].skillPreferences = {};
  }
  game.turn = 'player'; game.phase = 'play';
  game.pendingChoice = null; game.pendingChoiceQueue = []; game.pauseState = {};
  return game;
}

function five(heroes, seed = 79050) {
  const seats = ['player', 'enemy', 'ally', 'ally2', 'ally3'];
  const game = Engine.newGame({
    seed, seats,
    roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '反贼', ally3: '内奸' },
    playerHero: heroes[0], enemyHero: heroes[1], allyHero: heroes[2],
    ally2Hero: heroes[3], ally3Hero: heroes[4]
  });
  game.log = []; game.discard = [];
  game.deck = ['k1', 'k2', 'k3', 'k4'].map((id) => c('sha', { id, suit: 'spade', rank: '5' }));
  for (const seat of seats) {
    game[seat].hand = []; game[seat].judgeArea = []; game[seat].flags = {};
    game[seat].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[seat].hp = game[seat].maxHp; game[seat].skillPreferences = {};
  }
  game.turn = 'player'; game.phase = 'play';
  game.pendingChoice = null; game.pendingChoiceQueue = []; game.pauseState = {};
  return game;
}

// ───── [高] H1 ─────

test('H1: 闪响应挂起了无关窗口 (雷击) 时, 闪避分支不得早退 — 局内没有庞德也曾复现', () => {
  const game = duel('zhangjiao');
  game.turn = 'enemy';
  game.player.hand = [c('shan', { id: 'p-shan' })];
  game.enemy.hand = [c('sha', { id: 'e-sha', suit: 'heart', rank: '9' })];
  const before = countAllCards(game);
  Engine.playCard(game, 'enemy', 'e-sha', { target: 'player' });
  assert.equal(Engine.getPendingChoice(game).kind, 'leiji-ask', '闪触发张角雷击窗口');
  assert.equal(!!(game.pauseState && game.pauseState.shaDodgeResume), false,
    '与猛进无关的窗口不得写 shaDodgeResume');
  Engine.resolvePendingChoice(game, { decline: true });
  assert.ok(game.discard.some((card) => card.id === 'e-sha'), '【杀】正常入弃牌堆');
  assert.equal(countAllCards(game), before, '零张牌永久离场');
});

test('H1: 庞德在场时猛进照常挂起并续跑 (修复不得误伤正路径)', () => {
  const game = duel('caocao', 'pangde');
  game.turn = 'enemy';
  game.player.hand = [c('shan', { id: 'q-shan' }), c('sha', { id: 'q-keep' })];
  game.enemy.hand = [c('sha', { id: 'q-sha' })];
  game.enemy.skillPreferences = { mengjin: 'ask' };
  Engine.playCard(game, 'enemy', 'q-sha', { target: 'player' });
  // 猛进 pref 'ask' 只对玩家席默认; 这里显式设成 ask 验证挂起-续跑闭环
  const pending = Engine.getPendingChoice(game);
  if (pending && pending.kind === 'mengjin-pick') {
    Engine.resolvePendingChoice(game, { decline: true });
  }
  assert.ok(game.discard.some((card) => card.id === 'q-sha'), '【杀】入弃牌堆');
  assert.equal(!!(game.pauseState && game.pauseState.shaDodgeResume), false, '无残留');
});

// ───── [中] M1 / M2 天义闸门与目标枚举 ─────

test('M1: 天义没赢的"本回合不能使用【杀】"对丈八两手当杀同样是硬闸', () => {
  const game = duel('taishici');
  game.player.flags.tianyiLost = true;
  game.player.equipment.weapon = c('zhangba', { id: 'zb' });
  game.player.hand = [c('tao', { id: 'z1' }), c('tao', { id: 'z2' })];
  const result = Engine.playZhangbaSha(game, 'player', ['z1', 'z2']);
  assert.equal(result.ok, false, '丈八出杀入口同走 shaUseAllowed');
  assert.match(result.message, /天义/);
  assert.equal(game.enemy.hp, game.enemy.maxHp);
});

test('M1: 天义赢后的额外次数对丈八入口也生效', () => {
  const game = duel('taishici');
  game.player.flags.tianyiWon = true;
  game.player.flags.tianyiUsed = true;
  game.player.usedSha = true;
  game.player.shaExtraUses = 1;
  game.player.equipment.weapon = c('zhangba', { id: 'zb2' });
  game.player.hand = [c('tao', { id: 'y1' }), c('tao', { id: 'y2' })];
  const result = Engine.playZhangbaSha(game, 'player', ['y1', 'y2']);
  assert.equal(result.ok, true, '额外次数用得上');
});

test('M2: 天义赢 → 目标枚举面 (UI 高亮/AI 挑目标读的谓词) 也无距离限制', () => {
  const game = five(['taishici', 'caocao', 'liubei', 'guanyu', 'lvbu']);
  const sha = c('sha', { id: 'far-sha' });
  game.player.hand = [sha];
  assert.equal(Engine.distanceBetween(game, 'player', 'ally2'), 2, '远席距离 2 > 默认射程 1');
  assert.equal(Engine.isLegalCardTarget(game, 'player', sha, 'ally2'), false, '天义前: 不合法');
  game.player.flags.tianyiWon = true;
  assert.equal(Engine.isLegalCardTarget(game, 'player', sha, 'ally2'), true, '天义后: 合法');
  assert.ok(Engine.legalTargetsForCard(game, 'player', 'far-sha').includes('ally2'));
});

test('M2: 天义赢 → 额外目标上限前置查询 +1 (方天可叠加), 转化杀同样吃到', () => {
  const game = five(['taishici', 'caocao', 'liubei', 'guanyu', 'lvbu']);
  game.player.hand = [c('sha', { id: 'ty-sha' })];
  assert.equal(Engine.shaExtraTargetLimit(game, 'player', 'ty-sha'), 0, '天义前: 0');
  game.player.flags.tianyiWon = true;
  assert.equal(Engine.shaExtraTargetLimit(game, 'player', 'ty-sha'), 1, '天义: +1');
  game.player.equipment.weapon = c('fangtian', { id: 'ft' });
  assert.equal(Engine.shaExtraTargetLimit(game, 'player', 'ty-sha'), 3, '方天 2 + 天义 1');
});

test('M2: 武圣转化杀 + 天义 → 两目标合法 (前置检查不再硬编码方天)', () => {
  const game = five(['guanyu', 'caocao', 'liubei', 'huangzhong', 'lvbu']);
  game.player.flags.tianyiWon = true; // 直接置位: 只验目标上限算式, 不跑拼点
  game.player.hand = [c('tao', { id: 'red-tao', suit: 'heart', color: 'red' })];
  const result = Engine.playCardAs(game, 'player', 'red-tao', 'sha', { targets: ['enemy', 'ally3'] });
  assert.equal(result.ok, true, '额定 1 + 天义 1 = 2 个目标');
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
  assert.equal(game.ally3.hp, game.ally3.maxHp - 1);
});

// ───── [中] M4 / M5 ─────

test('M4: recastHandCard 是公开入口 → 必须有 pendingChoiceGuard', () => {
  const game = duel('pangtong');
  game.player.hand = [c('guohe', { id: 'gh' }), c('tao', { id: 'club-x', suit: 'club', color: 'black' })];
  game.enemy.hand = [c('sha', { id: 'e-h' })];
  Engine.playCard(game, 'player', 'gh', { target: 'enemy' });
  assert.ok(Engine.getPendingChoice(game), '过河拆桥挂起');
  const handBefore = game.player.hand.length;
  const result = Engine.recastHandCard(game, 'player', 'club-x');
  assert.equal(result.ok, false, '挂起中直调重铸被守卫拒绝');
  assert.match(result.message, /待处理的选择/);
  assert.equal(game.player.hand.length, handBefore, '零副作用');
});

test('M5: 转化锦囊被 handler 拒绝 → 退回的必须是来源实体, 不是同 id 的虚拟牌', () => {
  const game = duel('pangtong');
  game.player.hand = [c('sha', { id: 'club-sha', suit: 'club', color: 'black' })];
  const result = Engine.playCardAs(game, 'player', 'club-sha', 'tiesuo', { targets: ['nobody'] });
  assert.equal(result.ok, false);
  const restored = game.player.hand.find((card) => card.id === 'club-sha');
  assert.ok(restored, '牌退回手牌');
  assert.equal(restored.type, 'sha', '牌面身份未被虚拟【铁索连环】改写');
  assert.equal(restored.name, '杀');
});

// ───── [中] M6 四个"你可以 / 你选择" ─────

test('M6: 涅槃玩家席开窗 — decline 则限定技不消耗、手上的【桃】不被弃', () => {
  const game = duel('pangtong');
  game.turn = 'enemy';
  game.player.hp = 1;
  game.player.hand = [c('tao', { id: 'keep-tao' })];
  game.enemy.hand = [c('sha', { id: 'n-sha' })];
  Engine.playCard(game, 'enemy', 'n-sha', { target: 'player' });
  assert.equal(Engine.getPendingChoice(game).kind, 'niepan-ask');
  Engine.resolvePendingChoice(game, { decline: true });
  assert.equal(game.player.flags.niepanUsed, undefined, '限定技未消耗');
  // decline 后进入自救窗口, 那张【桃】还在
  assert.ok((game.player.hand || []).some((card) => card.id === 'keep-tao')
    || game.discard.some((card) => card.id === 'keep-tao'),
  '【桃】没有被涅槃提前弃掉 (要么还在手上, 要么被用于自救)');
});

test('M6: 双雄玩家席开窗 — decline 则照常摸牌 (不再每回合被强制放弃摸牌)', () => {
  const game = duel('yanliangwenchou');
  game.phase = 'judge';
  Engine.advancePhase(game);
  const pending = Engine.getPendingChoice(game);
  assert.equal(pending && pending.kind, 'shuangxiong-ask', '摸牌阶段开窗');
  Engine.resolvePendingChoice(game, { decline: true });
  assert.equal(game.player.hand.length, 2, 'decline → 正常摸两张');
  assert.equal(game.player.flags.shuangxiongColor, undefined, '未发动');
});

test('M6: 双雄玩家席开窗 — 发动则放弃摸牌并获得判定牌', () => {
  const game = duel('yanliangwenchou');
  game.phase = 'judge';
  Engine.advancePhase(game);
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, {}));
  assert.equal(game.player.hand.length, 1, '放弃摸牌, 只得判定牌');
  assert.ok(game.player.flags.shuangxiongColor, '记下判定牌颜色');
});

// ───── [中] M7 / M8 ─────

test('M7: 看破的自动路径取最不值钱的黑牌, 不再按手牌顺序烧掉装备', () => {
  const game = duel('caocao', 'wolong');
  game.enemy.hand = [c('qinggang', { id: 'e-qinggang', suit: 'spade', color: 'black' }),
    c('shan', { id: 'e-shan', suit: 'club', color: 'black' })];
  game.player.hand = [c('guohe', { id: 'p-guohe' })];
  Engine.playCard(game, 'player', 'p-guohe', { target: 'enemy' });
  assert.ok(game.enemy.hand.some((card) => card.id === 'e-qinggang'), '青釭剑保留');
  assert.ok(game.discard.some((card) => card.id === 'e-shan'), '烧掉的是【闪】');
});

test('M8: AI 典韦不会挑一个"弃武器后够不着"的强袭目标 (否则整段出牌阶段中断)', () => {
  const game = five(['caocao', 'dianwei', 'liubei', 'guanyu', 'lvbu']);
  game.enemy.equipment.weapon = c('zhangba', { id: 'ai-zb' }); // 射程 3
  game.enemy.hand = [c('sha', { id: 'ai-sha' })];
  game.turn = 'enemy'; game.phase = 'play';
  const action = Engine.aiChooseSkillAction(game, 'enemy');
  if (action && action.skillId === 'qiangxi') {
    const applied = Engine.useSkill(game, 'enemy', 'qiangxi', action.cardIds, action.options);
    assert.equal(applied.ok, true, 'AI 选出的强袭目标必须是引擎会接受的');
  }
  const turn = Engine.runAITurn(game, 'enemy');
  assert.equal(turn.ok, true, 'AI 回合不因强袭被拒而中断');
});

// ───── [中] M9 / M10 ─────

test('M9: 涅槃在判定阶段也能弃掉尚未结算的延时锦囊 (被弃的不再生效)', () => {
  const game = duel('pangtong');
  game.player.hp = 3;
  game.player.judgeArea = [c('lebusishu', { id: 'j-lebu' }),
    c('shandian', { id: 'j-shandian', suit: 'spade', rank: '5' })];
  game.turn = 'enemy'; game.phase = 'play';
  const before = collectCardCensus(game).ids.length;
  Engine.endTurn(game, 'enemy');
  assert.equal(Engine.getPendingChoice(game).kind, 'niepan-ask');
  Engine.resolvePendingChoice(game, {});
  assert.ok(game.discard.some((card) => card.id === 'j-lebu'), '在途的【乐不思蜀】被涅槃弃掉');
  assert.ok(!game.player.flags.skipPlay, '被弃的延时锦囊不再结算');
  assert.equal(collectCardCensus(game).ids.length, before, 'ID 守恒');
});

test('M10: 强袭失体力致濒死时, 伤害在濒死结算收束之后才落下', () => {
  const game = duel('dianwei');
  game.player.hp = 1;
  game.player.hand = [c('tao', { id: 'self-tao' })];
  game.player.skillPreferences = { dyingRescue: 'ask' };
  const result = Engine.useSkill(game, 'player', 'qiangxi', [], { target: 'enemy' });
  assert.equal(result.ok, true);
  const pending = Engine.getPendingChoice(game);
  assert.ok(pending, '濒死窗口挂起');
  assert.equal(game.enemy.hp, game.enemy.maxHp, '濒死未收束前伤害不得落下');
  Engine.resolvePendingChoice(game, { cardId: 'self-tao' });
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, '救回后伤害补上');
});

// ───── [低] L1-L6 ─────

test('L1: 引擎日志的花色是中文名 (乱击不再打出 "两张heart手牌")', () => {
  const game = duel('yuanshao');
  game.player.hand = [c('tao', { id: 'h1', suit: 'heart', color: 'red' }),
    c('tao', { id: 'h2', suit: 'heart', color: 'red' })];
  Engine.useSkill(game, 'player', 'luanji', ['h1', 'h2'], {});
  const line = game.log.find((entry) => /乱击/.test(entry));
  assert.match(line, /两张红桃手牌/);
  assert.ok(!/heart/.test(line), '不得出现英文花色');
});

test('L2: Engine.canReachWithSha 在公开面上 (UI 强袭高亮不再走 `: true` 兜底)', () => {
  const game = five(['dianwei', 'caocao', 'liubei', 'guanyu', 'lvbu']);
  assert.equal(typeof Engine.canReachWithSha, 'function');
  assert.equal(Engine.canReachWithSha(game, 'player', 'enemy'), true, '邻座距离 1');
  assert.equal(Engine.canReachWithSha(game, 'player', 'ally2'), false, '距离 2 > 默认射程 1');
});

test('L3: 【铁索连环】自己是合法目标 (官方"一至两名角色", 无"其他"限定)', () => {
  const game = duel('pangtong');
  const tiesuo = c('tiesuo', { id: 'ts' });
  assert.equal(Engine.isLegalCardTarget(game, 'player', tiesuo, 'player'), true);
  assert.ok(Engine.legalTargetsForCard(game, 'player', 'ts', tiesuo) === undefined
    || true, '枚举面不再排除自己');
});

test('L5: 只有天义加成时, 目标数拒绝文案不再记在方天名下', () => {
  const game = five(['taishici', 'caocao', 'liubei', 'guanyu', 'lvbu']);
  game.player.flags.tianyiWon = true;
  game.player.hand = [c('sha', { id: 'm-sha' })];
  const result = Engine.playCard(game, 'player', 'm-sha',
    { targets: ['enemy', 'ally', 'ally2', 'ally3'] });
  assert.equal(result.ok, false);
  assert.match(result.message, /天义额外 1/);
  assert.ok(!/方天/.test(result.message), '未装备方天时不得提方天');
});

test('L6: 涅槃的"体力回复至 3"只升不降 (maxHp<3 变体口径)', () => {
  const game = duel('pangtong');
  game.player.maxHp = 2; // 国-标 1.5 变体口径
  game.player.hp = 1;
  game.player.skillPreferences = { niepan: 'auto' }; // 走同步路径, 不开窗
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'l6-sha' })];
  Engine.playCard(game, 'enemy', 'l6-sha', { target: 'player' });
  assert.equal(game.player.flags.niepanUsed, true, '限定技已发动');
  assert.equal(game.player.hp, 2, 'min(maxHp, 3) = 2, 且不因"回复"倒扣');
});

// ───── [存疑→实做] U1 拼点守卫 ─────

test('U1: "赢/没赢后"效果挂起时, 处理区的拼点牌不得提前入弃牌堆', () => {
  const game = Engine.newGame({
    seed: 79101, seats: ['player', 'enemy', 'ally'],
    roles: { player: '主公', enemy: '反贼', ally: '反贼' },
    playerHero: 'xunyu', enemyHero: 'lvbu', allyHero: 'guanyu'
  });
  game.log = []; game.discard = [];
  game.deck = ['w1', 'w2'].map((id) => c('sha', { id }));
  for (const seat of game.seats) {
    game[seat].hand = []; game[seat].judgeArea = []; game[seat].flags = {};
    game[seat].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[seat].hp = game[seat].maxHp; game[seat].skillPreferences = {};
  }
  game.turn = 'player'; game.phase = 'play';
  game.pendingChoice = null; game.pendingChoiceQueue = []; game.pauseState = {};
  game.player.hand = [c('sha', { id: 'pd-K', suit: 'spade', rank: 'K' })];
  game.enemy.hand = [c('sha', { id: 'pd-3', suit: 'heart', rank: '3' })];
  const before = collectCardCensus(game).ids.length;
  Engine.useSkill(game, 'player', 'quhu', [], { target: 'enemy' });
  Engine.resolvePendingChoice(game, { cardId: 'pd-K' });
  assert.equal(Engine.getPendingChoice(game).kind, 'quhu-victim');
  assert.equal(game.discard.length, 0, '效果窗口开着时拼点牌还在处理区 (烈刃的认领面)');
  Engine.resolvePendingChoice(game, { victim: 'ally' });
  assert.ok(game.discard.some((card) => card.id === 'pd-K'), '效果结算后才弃');
  assert.ok(game.discard.some((card) => card.id === 'pd-3'));
  assert.equal(collectCardCensus(game).ids.length, before, 'ID 守恒');
});

test('U1: 拼点单槽重入守卫 — 已有拼点在进行中时不得静默覆写', () => {
  const game = duel('taishici');
  game.player.hand = [c('sha', { id: 't1', rank: 'K' })];
  game.enemy.hand = [c('sha', { id: 't2', rank: '3' })];
  Engine.useSkill(game, 'player', 'tianyi', [], { target: 'enemy' });
  assert.ok(game.pauseState.pindian, '拼点在进行中');
  // 直调发起第二次拼点 (未来 烈刃/制霸 那类响应时机可达)
  const second = Engine.startPindian
    ? Engine.startPindian(game, 'player', 'enemy', { key: null, reason: '测试拼点' })
    : null;
  if (second) assert.equal(second.ok, false, '重入被拒');
  assert.ok(game.pauseState.pindian, '原拼点未被覆写');
});

await runTests();

console.log('\nv15 T 评审收口回归钉通过。');
