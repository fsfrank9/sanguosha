// v15 S1: 蛊惑响应窗口【打出流程】/【响应中的使用流程】引擎行为 —
//   六个响应窗口 (闪应杀/万箭/银月, 杀应决斗, 桃·酒应濒死, 无懈应锦囊)
//   的声明→质疑→翻验; 验假"视为没有决定如何进行响应"→窗口原样重开;
//   打出流程无目标步骤; 缠怨在打出流程同样授予; 限次按回合全场复位。
// 官方文本: official-skill-cache/gltjk-sanguosha-rules/pages/
// card__hero__neutral.md:326 (正文) / :330 (使用流程 ◆) / :336 (打出流程 ◆);
// spec 缺口逐条裁定: docs/audit/2026-08-05-guhuo-spec-gaps.md。
import assert from 'node:assert/strict';
import { Engine, c } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

const ASK_PREFS = {
  shanResponse: 'ask',
  wuxieResponse: 'ask',
  shaDuelResponse: 'ask',
  dying: 'ask'
};

function buildDuel(playerHero = 'yuji', enemyHero = 'caocao', seed = 75101) {
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
    game[actor].skillPreferences = { ...ASK_PREFS };
  }
  game.turn = 'enemy';
  game.phase = 'play';
  return game;
}

// ───── 开窗门槛 (无所需牌型也要开窗) ─────

test('S1 开窗: 于吉手上没有【闪】, 杀的响应窗口仍然打开 (蛊惑可当闪打出)', () => {
  const game = buildDuel();
  game.player.hand = [c('wuzhong', { id: 'p-wz' })]; // 一张不能当闪的牌
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  Engine.playCard(game, 'enemy', 'e-sha', { target: 'player' });
  const pending = Engine.getPendingChoice(game);
  assert.ok(pending && pending.kind === 'shan-response', '无闪也开窗');
  assert.equal(Engine.guhuoResponseAvailable(game), true);
  assert.deepEqual(Engine.guhuoResponseTypes(game), ['shan'], '闪窗只能声明闪');
});

test('S1 开窗门禁: 非于吉 / 本回合已发动 / 无手牌 → 窗口不提供蛊惑', () => {
  const noSkill = buildDuel('caocao', 'liubei');
  noSkill.player.hand = [c('sha', { id: 'x1' })];
  noSkill.enemy.hand = [c('sha', { id: 'x2' })];
  Engine.playCard(noSkill, 'enemy', 'x2', { target: 'player' });
  assert.equal(Engine.guhuoResponseAvailable(noSkill), false, '非于吉无声明面');

  const used = buildDuel();
  used.player.hand = [c('sha', { id: 'y1' })];
  used.player.flags.guhuoUsedThisTurn = true;
  used.enemy.hand = [c('sha', { id: 'y2' })];
  Engine.playCard(used, 'enemy', 'y2', { target: 'player' });
  assert.equal(Engine.guhuoResponseAvailable(used), false, '本回合限次已用');
});

// ───── 打出流程三态 ─────

test('S1 打出流程 (闪): 无人质疑 → 亮出后按正常打出流程闪避, 实体牌入弃牌堆, 守恒', () => {
  const game = buildDuel();
  // 真【闪】盖置声明【闪】 → 亮出为真, 曹操 hp 满且无被抓包记录 → 不质疑
  game.player.hand = [c('shan', { id: 'p-shan', suit: 'heart', color: 'red' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  Engine.playCard(game, 'enemy', 'e-sha', { target: 'player' });
  assertCardConservation(game, () => {
    const result = Engine.resolvePendingChoice(game, {
      guhuo: { cardId: 'p-shan', declareType: 'shan' }
    });
    assert.equal(result.ok, true);
  });
  assert.equal(game.player.hp, game.player.maxHp, '闪避成功');
  assert.ok(game.discard.some((card) => card.id === 'p-shan'), '实体牌入弃牌堆');
  assert.equal(Engine.getPendingChoice(game), null, '响应窗口关闭');
  assert.ok(game.log.some((line) => /背面朝上打出【闪】进行响应/.test(line)));
});

test('S1 打出流程 (闪): 验假 → 终止 + 视为没有决定如何进行响应 → 窗口原样重开', () => {
  const game = buildDuel();
  // 声明闪盖置真【杀】; 曹操是这张【杀】的使用者且于吉有前科 (公开的
  // 被质破记录) → 响应赌假面触发质疑。
  game.player.guhuoBusted = 1;
  game.player.hand = [c('sha', { id: 'p-fake' }), c('shan', { id: 'p-real-shan' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  Engine.playCard(game, 'enemy', 'e-sha', { target: 'player' });
  assertCardConservation(game, () => {
    const result = Engine.resolvePendingChoice(game, {
      guhuo: { cardId: 'p-fake', declareType: 'shan' }
    });
    assert.equal(result.ok, true, '验假是结果不是错误');
    assert.equal(result.paused, true, '窗口重开 → 仍为暂停态');
  });
  assert.ok(game.discard.some((card) => card.id === 'p-fake'), '验假: 盖置牌入弃牌堆');
  assert.equal(game.enemy.chanyuan, undefined, '验假不给缠怨');
  const reopened = Engine.getPendingChoice(game);
  assert.ok(reopened && reopened.kind === 'shan-response', '响应窗口原样重开');
  assert.equal(Engine.guhuoResponseAvailable(game), false,
    '本回合限次已消耗 → 重开窗内不能再蛊惑');
  // 重开窗内打出真闪 → 照常闪避
  const again = Engine.resolvePendingChoice(game, { cardId: 'p-real-shan' });
  assert.equal(again.ok, true);
  assert.equal(game.player.hp, game.player.maxHp, '重开窗内真闪闪避成功');
});

test('S1 打出流程 (闪): 验真 → 质疑者获缠怨 (打出◆未复述缠怨条款, 按技能正文授予)', () => {
  const game = buildDuel();
  game.player.guhuoBusted = 1; // 有前科 → 曹操按响应赌假面质疑 (结果为真)
  game.player.hand = [c('shan', { id: 'p-true-shan' })];
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  Engine.playCard(game, 'enemy', 'e-sha', { target: 'player' });
  Engine.resolvePendingChoice(game, { guhuo: { cardId: 'p-true-shan', declareType: 'shan' } });
  assert.equal(game.enemy.chanyuan, true, '质疑真牌 → 缠怨 (与使用流程对称)');
  assert.equal(game.player.hp, game.player.maxHp, '真闪照常闪避');
});

test('S1 打出流程 (杀应决斗): 声明火杀属性 → 亮出为真则按打出流程续对拼', () => {
  const game = buildDuel();
  game.player.hand = [c('fire_sha', { id: 'p-fire' })];
  game.enemy.hand = [c('juedou', { id: 'e-juedou' })]; // 对方无杀可续 → 输掉对拼
  Engine.playCard(game, 'enemy', 'e-juedou', { target: 'player' });
  // 决斗先开无懈窗 (蛊惑接入后即便无【无懈】也开) → 放弃后进对拼窗
  assert.equal(Engine.getPendingChoice(game).kind, 'wuxie-response');
  Engine.resolvePendingChoice(game, { use: false });
  const pending = Engine.getPendingChoice(game);
  assert.ok(pending && pending.kind === 'sha-duel-response');
  assert.deepEqual(Engine.guhuoResponseTypes(game), ['sha', 'fire_sha', 'thunder_sha'],
    '声明杀须同时声明属性 → 三型分列');
  assertCardConservation(game, () => {
    Engine.resolvePendingChoice(game, { guhuo: { cardId: 'p-fire', declareType: 'fire_sha' } });
  });
  assert.ok(game.discard.some((card) => card.id === 'p-fire'), '声明牌打出入弃牌堆');
  assert.equal(game.player.hp, game.player.maxHp, '打出成功 → 决斗伤害不落自己');
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, '对方无杀可续 → 受 1 点伤害');
});

test('S1 打出流程 (闪应万箭): 万箭窗口同样可声明', () => {
  const game = buildDuel();
  game.player.hand = [c('shan', { id: 'p-shan-aoe' })];
  game.enemy.hand = [c('wanjian', { id: 'e-wanjian' })];
  Engine.playCard(game, 'enemy', 'e-wanjian', {});
  const pending = Engine.getPendingChoice(game);
  assert.ok(pending && (pending.kind === 'wanjian-response' || pending.kind === 'wuxie-response'),
    '万箭先无懈窗后闪窗');
  if (pending.kind === 'wuxie-response') Engine.resolvePendingChoice(game, { use: false });
  const shanWindow = Engine.getPendingChoice(game);
  assert.equal(shanWindow.kind, 'wanjian-response');
  assertCardConservation(game, () => {
    Engine.resolvePendingChoice(game, { guhuo: { cardId: 'p-shan-aoe', declareType: 'shan' } });
  });
  assert.equal(game.player.hp, game.player.maxHp, '万箭被化解');
});

// ───── 响应中的使用流程 (濒死桃/酒, 无懈) ─────

test('S1 使用流程 (濒死桃): 真桃声明被质疑 → 验真获缠怨 + 照常回血, 守恒', () => {
  const game = buildDuel();
  game.player.hp = 1;
  game.player.hand = [c('tao', { id: 'p-true-tao', suit: 'heart', color: 'red' })];
  game.enemy.hand = [c('sha', { id: 'e-kill' })];
  Engine.playCard(game, 'enemy', 'e-kill', { target: 'player' });
  Engine.resolvePendingChoice(game, { use: false }); // 不出闪 → 濒死
  const dying = Engine.getPendingChoice(game);
  assert.ok(dying && dying.kind === 'dying-rescue' && dying.actor === 'player');
  assert.deepEqual(Engine.guhuoResponseTypes(game).sort(), ['jiu', 'tao'],
    '自己濒死 → 桃与酒 (使用方法Ⅱ) 均可声明');
  assertCardConservation(game, () => {
    const result = Engine.resolvePendingChoice(game, {
      guhuo: { cardId: 'p-true-tao', declareType: 'tao' }
    });
    assert.equal(result.ok, true);
  });
  assert.equal(game.enemy.chanyuan, true, '质疑真牌 → 缠怨');
  assert.equal(game.player.hp, 1, '声明桃救回 1 点体力 (脱离濒死)');
  assert.ok(game.discard.some((card) => card.id === 'p-true-tao'), '实体牌入弃牌堆');
});

test('S1 使用流程 (濒死桃): 无桃无酒也开窗; 诈声明被质破 → 窗口重开 → 无牌可救则阵亡', () => {
  const game = buildDuel();
  game.player.hp = 1;
  game.player.hand = [c('sha', { id: 'p-cover-tao' })]; // 无桃无酒
  game.enemy.hand = [c('sha', { id: 'e-kill' })];
  Engine.playCard(game, 'enemy', 'e-kill', { target: 'player' });
  const shanWindow = Engine.getPendingChoice(game);
  assert.equal(shanWindow.kind, 'shan-response');
  Engine.resolvePendingChoice(game, { use: false });
  const dying = Engine.getPendingChoice(game);
  assert.ok(dying && dying.kind === 'dying-rescue', '无桃无酒也开救援窗 (蛊惑可当桃使用)');
  assertCardConservation(game, () => {
    const result = Engine.resolvePendingChoice(game, {
      guhuo: { cardId: 'p-cover-tao', declareType: 'tao' }
    });
    assert.equal(result.ok, true, '验假是结果不是错误');
  });
  assert.ok(game.discard.some((card) => card.id === 'p-cover-tao'), '验假: 盖置牌入弃牌堆');
  const reopened = Engine.getPendingChoice(game);
  assert.ok(reopened && reopened.kind === 'dying-rescue', '救援窗原样重开');
  Engine.resolvePendingChoice(game, { decline: true });
  assert.equal(game.player.hp <= 0, true, '无牌可救 → 阵亡');
});

test('S1 使用流程 (濒死): 救他人时【酒】不在声明面 (使用方法Ⅱ 仅自救)', () => {
  const game = Engine.newGame({
    seed: 75107,
    seats: ['player', 'enemy', 'ally'],
    roles: { player: '忠臣', enemy: '反贼', ally: '主公' },
    playerHero: 'yuji', enemyHero: 'lvbu', allyHero: 'liubei'
  });
  game.log = []; game.discard = []; game.deck = [];
  for (const seat of game.seats) {
    game[seat].hand = []; game[seat].judgeArea = []; game[seat].flags = {};
    game[seat].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[seat].hp = game[seat].maxHp;
    game[seat].skillPreferences = { ...ASK_PREFS };
  }
  game.turn = 'enemy';
  game.phase = 'play';
  game.ally.hp = 1;
  game.player.hand = [c('tao', { id: 'p-cover-rescue', suit: 'heart', color: 'red' })];
  game.enemy.hand = [c('sha', { id: 'e-kill-ally' })];
  Engine.playCard(game, 'enemy', 'e-kill-ally', { target: 'ally' });
  const dying = Engine.getPendingChoice(game);
  assert.ok(dying && dying.kind === 'dying-rescue' && dying.actor === 'player');
  assert.deepEqual(Engine.guhuoResponseTypes(game), ['tao'], '救他人只能声明桃');
  const rejected = Engine.resolvePendingChoice(game, {
    guhuo: { cardId: 'p-cover-rescue', declareType: 'jiu' }
  });
  assert.equal(rejected.ok, false, '救他人声明酒被拒');
  assert.ok(Engine.getPendingChoice(game), '声明失败 → 窗口不丢');
  assertCardConservation(game, () => {
    Engine.resolvePendingChoice(game, { guhuo: { cardId: 'p-cover-rescue', declareType: 'tao' } });
  });
  assert.equal(game.ally.hp, 1, '声明桃 (真牌) 救下主公');
});

test('S1 使用流程 (无懈): 无【无懈】也开窗; 声明无懈抵消锦囊', () => {
  const game = buildDuel();
  game.player.hand = [c('sha', { id: 'p-cover-wuxie' }), c('shan', { id: 'p-keep' })];
  game.enemy.hand = [c('guohe', { id: 'e-guohe' })];
  Engine.playCard(game, 'enemy', 'e-guohe', { target: 'player' });
  const pending = Engine.getPendingChoice(game);
  assert.ok(pending && pending.kind === 'wuxie-response', '无无懈也开窗');
  assert.deepEqual(Engine.guhuoResponseTypes(game), ['wuxie']);
  assertCardConservation(game, () => {
    Engine.resolvePendingChoice(game, { guhuo: { cardId: 'p-cover-wuxie', declareType: 'wuxie' } });
  });
  assert.ok(game.player.hand.some((card) => card.id === 'p-keep'),
    '过河拆桥被无懈抵消 → 手牌未失');
  assert.ok(game.discard.some((card) => card.id === 'p-cover-wuxie'));
});

// ───── 牌面确定 / 限次 / 门禁 ─────

test('S1 亮出即确定除牌名外的全部牌面: 打出黑色实体牌照常触发银月枪', () => {
  const game = buildDuel();
  // 玩家回合: 玩家出杀 → 敌方 (持银月枪) 打出黑闪 → 银月枪反打玩家,
  // 玩家在银月枪窗口以蛊惑声明闪 (盖置黑桃杀) → 亮出为假但无人质疑,
  // 实体牌面黑色照常入弃牌堆。
  game.turn = 'player';
  game.player.hand = [c('sha', { id: 'p-sha-open' }), c('sha', { id: 'p-cover-black', suit: 'spade', color: 'black' })];
  game.enemy.equipment.weapon = c('yinyue', { id: 'e-yinyue' });
  game.enemy.hand = [c('shan', { id: 'e-shan-black', suit: 'club', color: 'black' })];
  Engine.playCard(game, 'player', 'p-sha-open', { target: 'enemy' });
  const pending = Engine.getPendingChoice(game);
  assert.ok(pending && pending.kind === 'yinyue-response', '银月枪响应窗口开启');
  assert.equal(Engine.guhuoResponseAvailable(game), true);
  assertCardConservation(game, () => {
    Engine.resolvePendingChoice(game, {
      guhuo: { cardId: 'p-cover-black', declareType: 'shan' }
    });
  });
  assert.equal(game.player.hp, game.player.maxHp, '声明闪化解银月枪');
  const discarded = game.discard.find((card) => card.id === 'p-cover-black');
  assert.ok(discarded, '实体牌入弃牌堆');
  assert.equal(discarded.type, 'sha', '实体牌面未被声明型【闪】改写');
});

test('S1 限次: 响应中发动后本回合出牌阶段不能再发动; 回合切换全场复位', () => {
  const game = buildDuel();
  game.player.hand = [c('shan', { id: 'r-shan' }), c('wuzhong', { id: 'r-wz' })];
  game.enemy.hand = [c('sha', { id: 'e-sha-limit' })];
  Engine.playCard(game, 'enemy', 'e-sha-limit', { target: 'player' });
  Engine.resolvePendingChoice(game, { guhuo: { cardId: 'r-shan', declareType: 'shan' } });
  assert.equal(game.player.flags.guhuoUsedThisTurn, true, '响应中发动即计次');
  // 敌方回合内玩家不能再声明 (出牌阶段面同样锁住)
  game.turn = 'player';
  game.phase = 'play';
  assert.equal(Engine.guhuoAvailable(game, 'player'), false, '同一回合内额度已用尽');
  // 新回合开始 → 全场复位 (限次是"每名角色的回合内"的按回合额度)
  game.pendingChoice = null;
  game.pendingChoiceQueue = [];
  Engine.startTurn(game, 'player');
  game.pendingChoice = null;
  game.pendingChoiceQueue = [];
  game.phase = 'play';
  assert.equal(game.player.flags.guhuoUsedThisTurn, false, '回合切换复位');
  assert.equal(Engine.guhuoAvailable(game, 'player'), true);
});

test('S1 声明门: 窗口不支持的牌名 / 不在手牌的盖置牌 → 拒绝且窗口不丢, 零副作用', () => {
  const game = buildDuel();
  game.player.hand = [c('shan', { id: 'g-shan' })];
  game.enemy.hand = [c('sha', { id: 'e-sha-gate' })];
  Engine.playCard(game, 'enemy', 'e-sha-gate', { target: 'player' });
  const wrongType = Engine.resolvePendingChoice(game, {
    guhuo: { cardId: 'g-shan', declareType: 'wuzhong' }
  });
  assert.equal(wrongType.ok, false, '闪窗不能声明无中生有');
  const missing = Engine.resolvePendingChoice(game, {
    guhuo: { cardId: 'not-in-hand', declareType: 'shan' }
  });
  assert.equal(missing.ok, false, '盖置牌必须在手牌里');
  assert.equal(game.player.hand.length, 1, '零副作用');
  assert.equal(game.player.flags.guhuoUsedThisTurn, undefined, '发动次数未消耗');
  const stillOpen = Engine.getPendingChoice(game);
  assert.ok(stillOpen && stillOpen.kind === 'shan-response', '窗口仍在');
});

test('S1 已知局限钉: AI 席在响应窗口不声明蛊惑 (仅玩家席接入)', () => {
  const game = buildDuel('caocao', 'yuji');
  game.turn = 'player';
  game.player.hand = [c('sha', { id: 'ai-target-sha' })];
  game.enemy.hand = [c('wuzhong', { id: 'ai-nonshan' })]; // AI 于吉无闪
  const before = game.enemy.hp;
  Engine.playCard(game, 'player', 'ai-target-sha', { target: 'enemy' });
  assert.equal(Engine.getPendingChoice(game), null, 'AI 席不开响应窗口');
  assert.equal(game.enemy.hp, before - 1, 'AI 于吉照常受伤 (不声明蛊惑)');
  assert.ok(game.enemy.hand.some((card) => card.id === 'ai-nonshan'), '手牌未被当闪打出');
});

// ───── 评审收口回归钉 (opus 对抗端到端复现) ─────

test('S1 收口: 南蛮入侵 (需打出杀) 也开窗 — 此前玩家席走自动响应, 打出流程不可达', () => {
  const game = buildDuel();
  game.player.hand = [c('sha', { id: 'nm-true-sha' })];
  game.enemy.hand = [c('nanman', { id: 'e-nanman' })];
  Engine.playCard(game, 'enemy', 'e-nanman', {});
  assert.equal(Engine.getPendingChoice(game).kind, 'wuxie-response');
  Engine.resolvePendingChoice(game, { use: false });
  const window = Engine.getPendingChoice(game);
  assert.ok(window && window.kind === 'aoe-sha-response', '南蛮玩家窗口开启');
  assert.deepEqual(Engine.guhuoResponseTypes(game), ['sha', 'fire_sha', 'thunder_sha']);
  assertCardConservation(game, () => {
    Engine.resolvePendingChoice(game, { guhuo: { cardId: 'nm-true-sha', declareType: 'sha' } });
  });
  assert.equal(game.player.hp, game.player.maxHp, '打出【杀】化解南蛮');
});

test('S1 收口: 南蛮窗口零行为变更面 — 非蛊惑局面仍走自动响应 (不开窗)', () => {
  const game = buildDuel('caocao', 'liubei');
  game.player.hand = [c('sha', { id: 'auto-sha' })];
  game.enemy.hand = [c('nanman', { id: 'e-nanman-2' })];
  Engine.playCard(game, 'enemy', 'e-nanman-2', {});
  Engine.resolvePendingChoice(game, { use: false }); // 无懈窗
  assert.equal(Engine.getPendingChoice(game), null, '非于吉席不开南蛮窗口');
  assert.ok(game.discard.some((card) => card.id === 'auto-sha'), '自动打出真杀化解');
});

test('S1 收口: 借刀杀人 (持刀者使用杀) 也开决定窗 — 无杀也能声明', () => {
  const game = buildDuel();
  game.player.equipment.weapon = c('qinggang', { id: 'p-weapon' });
  game.player.hand = [c('shan', { id: 'jd-cover-shan' })]; // 手上无杀
  game.enemy.hand = [c('jiedao', { id: 'e-jiedao' })];
  Engine.playCard(game, 'enemy', 'e-jiedao', { target: 'player', jiedaoVictim: 'enemy' });
  Engine.resolvePendingChoice(game, { use: false }); // 无懈窗
  const window = Engine.getPendingChoice(game);
  assert.ok(window && window.kind === 'jiedao-decision', '无杀也进决定窗 (蛊惑可当杀使用)');
  assertCardConservation(game, () => {
    Engine.resolvePendingChoice(game, { guhuo: { cardId: 'jd-cover-shan', declareType: 'sha' } });
  });
  assert.ok(game.player.equipment.weapon, '声明成功 → 武器未被交出');
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, '持刀者的杀落在借刀指定的受害者');
});

test('S1 收口: 无双第二张【杀】的窗口同样提供蛊惑 (与闪路径对称)', () => {
  const game = buildDuel('yuji', 'lvbu');
  game.player.hand = [c('sha', { id: 'ws-sha' }), c('wuzhong', { id: 'ws-cover' })];
  game.enemy.hand = [c('juedou', { id: 'e-duel-ws' })];
  Engine.playCard(game, 'enemy', 'e-duel-ws', { target: 'player' });
  Engine.resolvePendingChoice(game, { use: false }); // 无懈窗
  assert.equal(Engine.getPendingChoice(game).kind, 'sha-duel-response');
  Engine.resolvePendingChoice(game, { cardId: 'ws-sha' }); // 第一张真杀
  const second = Engine.getPendingChoice(game);
  assert.ok(second && second.kind === 'sha-duel-response', '无双第二张窗口开启 (此前直接判负)');
  assert.equal(Engine.guhuoResponseAvailable(game), true, '第二张窗口可发动蛊惑');
});

test('S1 收口: AI 席不得经公开 dispatcher 越界发动响应蛊惑 (声明入口复用同一谓词)', () => {
  const game = buildDuel('caocao', 'yuji');
  game.enemy.skillPreferences.dying = 'ask'; // 引擎支持的旋钮 → AI 席也能拿到窗口
  game.enemy.hp = 1;
  // 有【桃】→ AI 席也能拿到 ask 救援窗 (评审复现的入口); 另备一张非桃牌
  // 作为越界声明的盖置牌。
  game.enemy.hand = [c('tao', { id: 'ai-tao', suit: 'heart', color: 'red' }),
    c('wuzhong', { id: 'ai-cover' })];
  game.turn = 'player';
  game.player.hand = [c('sha', { id: 'p-kill-ai' })];
  Engine.playCard(game, 'player', 'p-kill-ai', { target: 'enemy' });
  const dying = Engine.getPendingChoice(game);
  assert.ok(dying && dying.kind === 'dying-rescue' && dying.actor === 'enemy');
  assert.equal(Engine.guhuoResponseAvailable(game), false, 'UI 门禁: AI 席无声明面');
  assert.deepEqual(Engine.guhuoResponseTypes(game), [], '菜单谓词与门禁同口径');
  const rejected = Engine.resolvePendingChoice(game, {
    guhuo: { cardId: 'ai-cover', declareType: 'tao' }
  });
  assert.equal(rejected.ok, false, '直调 dispatcher 同样被拒');
  assert.ok(!game.enemy.flags.guhuoUsedThisTurn, '额度未消耗');
  assert.ok(game.enemy.hand.some((card) => card.id === 'ai-cover'), '手牌零副作用');
});

await runTests();

console.log('\nv15 S1 蛊惑响应窗口 (打出/使用流程) 用例通过。');
