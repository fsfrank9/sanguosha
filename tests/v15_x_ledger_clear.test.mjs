// v15 X: 第五轮审计留账清偿 (F8-F14) 的行为钉。
// 七条均在 docs/audit/2026-08-06-w-ledger.md "确证未修" 表逐项记录了根因、
// 官方出处与对抗验证点名的坑; 本批按账修复, 每条至少一钉一反例。
import assert from 'node:assert/strict';
import { Engine, c } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function duel(playerHero, enemyHero = 'caocao', seed = 96001) {
  const game = Engine.newGame({ seed, playerHero, enemyHero });
  game.log = []; game.discard = [];
  game.deck = Array.from({ length: 10 }, (_, i) => c('sha', { id: 'xd' + i, suit: 'spade', rank: '6' }));
  for (const seat of ['player', 'enemy']) {
    game[seat].hand = []; game[seat].judgeArea = []; game[seat].flags = {};
    game[seat].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[seat].hp = game[seat].maxHp; game[seat].skillPreferences = {};
  }
  game.turn = 'player'; game.phase = 'play';
  game.pendingChoice = null; game.pendingChoiceQueue = []; game.pauseState = {};
  return game;
}

function build3(heroes, seed = 96050) {
  const game = Engine.newGame({
    seed,
    seats: ['player', 'enemy', 'ally'],
    roles: { player: '主公', enemy: '反贼', ally: '忠臣' },
    playerHero: heroes.player, enemyHero: heroes.enemy, allyHero: heroes.ally
  });
  game.log = []; game.discard = [];
  game.deck = Array.from({ length: 12 }, (_, i) => c('sha', { id: 'x3d' + i, suit: 'spade', rank: '6' }));
  for (const seat of ['player', 'enemy', 'ally']) {
    game[seat].hand = []; game[seat].judgeArea = []; game[seat].flags = {};
    game[seat].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[seat].hp = game[seat].maxHp; game[seat].skillPreferences = {};
  }
  game.turn = 'player'; game.phase = 'play';
  game.pendingChoice = null; game.pendingChoiceQueue = []; game.pauseState = {};
  return game;
}

const jiedao = (id) => ({ id, type: 'jiedao', name: '借刀杀人', family: 'trick', suit: 'club', color: 'black' });
const weapon = (id, type, name, range) => ({ id, type, name, family: 'equipment', slot: 'weapon', range: range || 2 });

function logIndex(game, needle) {
  return game.log.findIndex((line) => line.includes(needle));
}

// ───── F8: 借刀转化面 — 闸口与点火同点收口 ─────

test('F8: 关羽只有红牌 → 武圣转化当【杀】被借刀驱使, 武器不被夺', () => {
  const game = duel('liubei', 'guanyu');
  game.player.hand = [jiedao('jd-wsg')];
  game.enemy.equipment.weapon = weapon('gy-weapon', 'qinggang', '青釭剑', 2);
  game.enemy.hand = [c('tao', { id: 'wsg-red', suit: 'heart', color: 'red' })];
  const hpBefore = game.player.hp;
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'player', 'jd-wsg', { target: 'enemy' });
    assert.equal(r.ok, true, r.message);
  });
  assert.ok(game.log.some((l) => l.includes('武圣')), '武圣转化日志');
  assert.ok(game.enemy.equipment.weapon, '有杀可用 → 武器不转移');
  assert.equal(game.player.hp, hpBefore - 1, '转化杀命中借刀使用者');
  assert.ok(game.discard.some((card) => card.id === 'wsg-red'), '红牌组成实体入弃牌堆');
});

test('F8 反例: 手上只有黑色非杀且无转化技 → 仍交武器 (闸口不误放)', () => {
  const game = duel('liubei', 'caocao');
  game.player.hand = [jiedao('jd-neg')];
  game.enemy.equipment.weapon = weapon('cc-weapon', 'qinggang', '青釭剑', 2);
  game.enemy.hand = [c('wuxie', { id: 'neg-wuxie', suit: 'club', color: 'black' })];
  Engine.playCard(game, 'player', 'jd-neg', { target: 'enemy' });
  assert.equal(game.enemy.equipment.weapon, null, '无杀可用 → 武器转移');
  assert.ok(game.player.hand.some((card) => card.id === 'cc-weapon'));
});

test('F8: 丈八两张手牌合成 — 二次合法性拒绝时组成实体退回手牌 (守恒)', () => {
  // An = player (ask 窗), source = enemy 诸葛亮。窗口挂起期间 enemy 手牌
  // 清空 → 空城激活 → resolve fire 时 playSha 二次合法性拒绝 → 回滚。
  const game = duel('liubei', 'zhugeliang', 96010);
  game.turn = 'enemy';
  game.enemy.hand = [jiedao('jd-zb'), c('tao', { id: 'kc-pad', suit: 'heart', color: 'red' })];
  game.player.equipment.weapon = weapon('p-zhangba', 'zhangba', '丈八蛇矛', 3);
  game.player.hand = [
    c('tao', { id: 'zb-1', suit: 'heart', color: 'red' }),
    c('tao', { id: 'zb-2', suit: 'diamond', color: 'red' })
  ];
  Engine.playCard(game, 'enemy', 'jd-zb', { target: 'player' });
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'jiedao-decision', '玩家 An 开窗');
  // 窗口挂起期间局面变化: 诸葛亮手牌清空 → 空城 (不能成为杀的目标)。
  game.enemy.hand = [];
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { fire: true }));
  assert.ok(game.player.hand.some((card) => card.id === 'zb-1'), '组成实体 1 退回手牌');
  assert.ok(game.player.hand.some((card) => card.id === 'zb-2'), '组成实体 2 退回手牌');
  assert.ok(!game.discard.some((card) => card.id === 'zb-1' || card.id === 'zb-2'), '不滞留弃牌堆');
  assert.equal(game.player.equipment.weapon, null, '二次检测失败 → 交出武器');
  assert.ok(game.enemy.hand.some((card) => card.id === 'p-zhangba'), '武器进 source 手牌');
});

test('F8 反例: 丈八在手仅一张手牌 → 凑不成两张, 闸口不放行', () => {
  const game = duel('liubei', 'caocao');
  game.player.hand = [jiedao('jd-zb1')];
  game.enemy.equipment.weapon = weapon('e-zhangba', 'zhangba', '丈八蛇矛', 3);
  game.enemy.hand = [c('tao', { id: 'only-one', suit: 'heart', color: 'red' })];
  Engine.playCard(game, 'player', 'jd-zb1', { target: 'enemy' });
  assert.equal(game.enemy.equipment.weapon, null, '一张手牌合不成丈八杀 → 交武器');
});

// ───── F9: 猛进 (武将技) 先于 贯石斧 (装备技) ─────

test('F9: AI 庞德持贯石斧, 杀被闪抵消 → 猛进与贯石斧都触发且猛进在前', () => {
  const game = duel('liubei', 'pangde', 96020);
  game.turn = 'enemy';
  game.enemy.equipment.weapon = weapon('e-guanshi', 'guanshi', '贯石斧', 3);
  game.enemy.hand = [
    c('sha', { id: 'pd-sha', suit: 'spade', color: 'black' }),
    ...Array.from({ length: 4 }, (_, i) => c('tao', { id: 'pd-pad' + i, suit: 'heart', color: 'red' }))
  ];
  game.player.hand = [
    c('shan', { id: 'p-shan', suit: 'diamond', color: 'red' }),
    c('tao', { id: 'p-loot', suit: 'heart', color: 'red' })
  ];
  const hpBefore = game.player.hp;
  assertCardConservation(game, () => {
    Engine.playCard(game, 'enemy', 'pd-sha', { target: 'player' });
  });
  const mengjinAt = logIndex(game, '【猛进】');
  const guanshiAt = logIndex(game, '【贯石斧】');
  assert.ok(mengjinAt >= 0, '猛进触发 (旧实现被贯石斧短路吞掉)');
  assert.ok(guanshiAt >= 0, '贯石斧仍触发');
  assert.ok(mengjinAt < guanshiAt, '武将技先于装备技: 猛进日志在贯石斧之前');
  assert.equal(game.player.hp, hpBefore - 1, '贯石斧强制命中');
});

test('F9: 玩家庞德连续双挂起 — mengjin-pick 收窗后 guanshi-discard 再开', () => {
  const game = duel('pangde', 'caocao', 96021);
  game.player.equipment.weapon = weapon('p-guanshi', 'guanshi', '贯石斧', 3);
  game.player.skillPreferences.guanshi = 'ask';
  game.player.hand = [
    c('sha', { id: 'px-sha', suit: 'spade', color: 'black' }),
    c('tao', { id: 'px-c1', suit: 'heart', color: 'red' }),
    c('tao', { id: 'px-c2', suit: 'diamond', color: 'red' })
  ];
  game.enemy.hand = [c('shan', { id: 'e-shan', suit: 'diamond', color: 'red' }), c('tao', { id: 'e-keep', suit: 'heart', color: 'red' })];
  Engine.playCard(game, 'player', 'px-sha', { target: 'enemy' });
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'mengjin-pick', '第一挂起: 猛进');
  Engine.resolvePendingChoice(game, { zone: 'hand' });
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'guanshi-discard', '第二挂起: 贯石斧 (猛进恢复后仍进闸门)');
  const hpBefore = game.enemy.hp;
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardIds: ['px-c1', 'px-c2'] }));
  assert.equal(game.enemy.hp, hpBefore - 1, '贯石斧强制命中');
});

test('F9 反例: 贯石 ask-decline 后闪避收尾照常 (杀入弃牌堆, 不悬空)', () => {
  const game = duel('pangde', 'caocao', 96022);
  game.player.equipment.weapon = weapon('p-gs2', 'guanshi', '贯石斧', 3);
  game.player.skillPreferences.guanshi = 'ask';
  game.player.skillPreferences.mengjin = 'decline';
  game.player.hand = [
    c('sha', { id: 'pd2-sha', suit: 'spade', color: 'black' }),
    c('tao', { id: 'pd2-c1', suit: 'heart', color: 'red' }),
    c('tao', { id: 'pd2-c2', suit: 'diamond', color: 'red' })
  ];
  game.enemy.hand = [c('shan', { id: 'e-shan2', suit: 'diamond', color: 'red' })];
  Engine.playCard(game, 'player', 'pd2-sha', { target: 'enemy' });
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'guanshi-discard');
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { decline: true }));
  assert.equal(game.enemy.hp, game.enemy.maxHp, '放弃贯石 → 无伤害');
  assert.ok(game.discard.some((card) => card.id === 'pd2-sha'), '杀正常入弃牌堆 (共用收尾)');
  assert.equal(game.pendingChoice, null);
});

// ───── F10: 闪电传递查帷幕 ─────

test('F10: 闪电非命中, 下家贾诩 (帷幕) → 跳过贾诩移至再下家', () => {
  const game = build3({ player: 'liubei', enemy: 'jiaxu', ally: 'caocao' }, 96030);
  game.player.judgeArea.push(c('shandian', { id: 'sd-weimu', suit: 'spade', color: 'black' }));
  // 安全判定 (非黑桃 2-9): 桃 A — 判定后进入摸牌, 牌堆余量在 build3 已备足。
  game.deck.push(c('tao', { id: 'safe-j', suit: 'heart', color: 'red', rank: 'A' }));
  Engine.startTurn(game, 'player');
  assert.equal(game.enemy.judgeArea.length, 0, '帷幕: 闪电不进贾诩判定区');
  assert.ok(game.ally.judgeArea.some((card) => card.id === 'sd-weimu'), '移至再下家');
});

test('F10: 1v1 对手是贾诩 → 全环不合法, 闪电留在自己判定区', () => {
  const game = duel('liubei', 'jiaxu', 96031);
  game.player.judgeArea.push(c('shandian', { id: 'sd-stay', suit: 'spade', color: 'black' }));
  game.deck.push(c('tao', { id: 'safe-j2', suit: 'heart', color: 'red', rank: 'A' }));
  Engine.startTurn(game, 'player');
  assert.equal(game.enemy.judgeArea.length, 0, '帷幕挡下');
  assert.ok(game.player.judgeArea.some((card) => card.id === 'sd-stay'), '回到自己判定区');
});

// ───── F11: 银月枪的"使用"半面 (借刀/挑衅逼出的杀) ─────

test('F11: 借刀驱使持银月枪者用黑杀 → 回合外使用黑色手牌, 银月枪触发', () => {
  const game = duel('liubei', 'caocao', 96040);
  game.player.hand = [jiedao('jd-yy')];
  game.enemy.equipment.weapon = weapon('e-yinyue', 'yinyue', '银月枪', 3);
  game.enemy.hand = [c('sha', { id: 'yy-black-sha', suit: 'spade', color: 'black' })];
  const hpBefore = game.player.hp;
  assertCardConservation(game, () => {
    Engine.playCard(game, 'player', 'jd-yy', { target: 'enemy' });
  });
  assert.ok(game.log.some((l) => l.includes('【银月枪】')), '银月枪触发');
  assert.equal(game.player.hp, hpBefore - 2, '杀 1 点 + 银月枪 1 点');
});

test('F11 反例: 借刀驱使用红杀 → 银月枪不触发', () => {
  const game = duel('liubei', 'caocao', 96041);
  game.player.hand = [jiedao('jd-yy2')];
  game.enemy.equipment.weapon = weapon('e-yinyue2', 'yinyue', '银月枪', 3);
  game.enemy.hand = [c('sha', { id: 'yy-red-sha', suit: 'heart', color: 'red' })];
  const hpBefore = game.player.hp;
  Engine.playCard(game, 'player', 'jd-yy2', { target: 'enemy' });
  assert.ok(!game.log.some((l) => l.includes('【银月枪】')), '红杀不触发银月枪');
  assert.equal(game.player.hp, hpBefore - 1, '只有杀本体的 1 点');
});

test('F11: 挑衅逼出的黑杀 → 银月枪触发 (使用面, AI 席)', () => {
  const game = duel('jiangwei', 'caocao', 96042);
  game.enemy.equipment.weapon = weapon('e-yinyue3', 'yinyue', '银月枪', 3);
  game.enemy.hand = [c('sha', { id: 'tx-black-sha', suit: 'club', color: 'black' })];
  const hpBefore = game.player.hp;
  assertCardConservation(game, () => {
    const r = Engine.useSkill(game, 'player', 'tiaoxin', { target: 'enemy' });
    assert.equal(r.ok, true, r.message);
  });
  assert.ok(game.log.some((l) => l.includes('【银月枪】')), '银月枪触发');
  assert.equal(game.player.hp, hpBefore - 2, '挑衅杀 1 点 + 银月枪 1 点');
});

test('F11 评审收口: 受害者濒死 ask 挂起时银月枪不插入 — 桃救援先收束', () => {
  // 对抗复现驳倒项: 旧接线在濒死结算未收束时同步插入 1 点伤害, hp 被打到
  // -1, 救援的桃只能补回 0 → "能救活"变"死"。守卫后: 救援先收束 (hp 0→1),
  // 银月枪经 deferredAfterDying 在濒死结束后作为独立事件触发。
  const game = duel('liubei', 'caocao', 96043);
  game.player.hp = 1;
  game.player.skillPreferences.dying = 'ask';
  game.player.hand = [jiedao('jd-dying'), c('tao', { id: 'rescue-tao', suit: 'heart', color: 'red' })];
  game.enemy.equipment.weapon = weapon('e-yy-dying', 'yinyue', '银月枪', 3);
  game.enemy.hand = [c('sha', { id: 'yyd-sha', suit: 'spade', color: 'black' })];
  Engine.playCard(game, 'player', 'jd-dying', { target: 'enemy' });
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'dying-rescue', '杀致濒死开窗');
  assert.equal(game.player.hp, 0, '濒死窗口时 hp=0 — 银月枪未插入 (旧接线此处已是 -1)');
  Engine.resolvePendingChoice(game, { cardId: 'rescue-tao' });
  const rescueAt = logIndex(game, '脱离濒死');
  const yinyueAt = logIndex(game, '【银月枪】');
  assert.ok(rescueAt >= 0, '桃救援成功收束');
  assert.ok(yinyueAt > rescueAt, '银月枪在濒死收束之后才触发 (独立事件)');
});

test('F11 评审收口: 终局后银月枪不触发、不留悬空窗口', () => {
  const game = duel('liubei', 'caocao', 96044);
  game.player.hp = 1;
  game.player.hand = [jiedao('jd-go')]; // 无桃无闪 → 杀致死, 1v1 直接终局
  game.enemy.equipment.weapon = weapon('e-yy-go', 'yinyue', '银月枪', 3);
  game.enemy.hand = [c('sha', { id: 'go-sha', suit: 'spade', color: 'black' })];
  Engine.playCard(game, 'player', 'jd-go', { target: 'enemy' });
  assert.equal(game.phase, 'gameover', '对局已终结');
  assert.ok(!game.log.some((l) => l.includes('【银月枪】')), '终局后不触发');
  assert.equal(game.pendingChoice, null, '无悬空响应窗口');
  assert.ok(!(game.pauseState && game.pauseState.yinyueResponse), '无残留 pauseState');
});

// ───── F12: 妄尊排在回合角色准备阶段技能之后 ─────

test('F12: 主公观星挂起期间妄尊不先跑; 观星收窗后妄尊补上 (座次环时序)', () => {
  const game = duel('zhugeliang', 'yuanshu', 96045);
  Engine.startTurn(game, 'player');
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'guanxing-reorder', '观星开窗');
  assert.equal(game.enemy.hand.length, 0, '观星挂起期间妄尊未跑 (旧实现此时已摸牌)');
  Engine.resolvePendingChoice(game, { decline: true });
  assert.equal(game.enemy.hand.length, 1, '观星收窗后妄尊触发');
  assert.equal(Engine.handLimit(game, 'player'), game.player.hp - 1, '主公手牌上限 -1');
  const guanxingAt = logIndex(game, '观星');
  const wangzunAt = logIndex(game, '【妄尊】');
  assert.ok(guanxingAt >= 0 && wangzunAt >= 0 && guanxingAt < wangzunAt,
    '回合角色技能 (观星) 先于其他座席的妄尊');
});

test('F12 回归: 无准备阶段技能的主公 → 妄尊照常且只触发一次', () => {
  const game = duel('liubei', 'yuanshu', 96046);
  Engine.startTurn(game, 'player');
  assert.equal(game.enemy.hand.filter((card) => true).length >= 1, true);
  const wangzunLogs = game.log.filter((l) => l.includes('【妄尊】'));
  assert.equal(wangzunLogs.length, 1, '妄尊恰好一次 (收口点不重不漏)');
  assert.equal(Engine.handLimit(game, 'player'), game.player.hp - 1);
});

// ───── F13: 铁骑 (武将技) 先于 雌雄 (装备技) ─────

test('F13: 马超持雌雄对异性出杀 → 铁骑判定日志在雌雄之前', () => {
  const game = duel('machao', 'zhenji', 96060);
  game.player.equipment.weapon = weapon('p-cixiong', 'cixiong', '雌雄双股剑', 2);
  game.player.skillPreferences.cixiong = 'auto'; // 源侧不开 fire 询问窗, 直接发动
  game.player.hand = [c('sha', { id: 'mc-sha', suit: 'spade', color: 'black' })];
  game.enemy.hand = [c('tao', { id: 'zj-pad', suit: 'heart', color: 'red' })];
  game.deck.push(c('tao', { id: 'tieqi-red', suit: 'heart', color: 'red', rank: '7' })); // 铁骑判定 (deck 顶)
  Engine.playCard(game, 'player', 'mc-sha', { target: 'enemy' });
  const tieqiAt = logIndex(game, '【铁骑】');
  const cixiongAt = logIndex(game, '【雌雄双股剑】');
  assert.ok(tieqiAt >= 0, '铁骑触发');
  assert.ok(cixiongAt >= 0, '雌雄触发');
  assert.ok(tieqiAt < cixiongAt, '武将技先于装备技: 铁骑在雌雄之前');
});

test('F13: 雌雄挂起恢复后铁骑锁定不丢 — 红判后目标无闪窗直接受伤', () => {
  const game = duel('zhenji', 'machao', 96061);
  game.turn = 'enemy';
  game.enemy.equipment.weapon = weapon('e-cixiong', 'cixiong', '雌雄双股剑', 2);
  game.enemy.hand = [c('sha', { id: 'mc2-sha', suit: 'spade', color: 'black' })];
  game.player.hand = [c('shan', { id: 'zj-shan', suit: 'diamond', color: 'red' })];
  game.player.skillPreferences.shanResponse = 'ask';
  game.deck.push(c('tao', { id: 'tieqi-red2', suit: 'heart', color: 'red', rank: '7' })); // 铁骑红判 (deck 顶)
  Engine.playCard(game, 'enemy', 'mc2-sha', { target: 'player' });
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'cixiong-choose', '雌雄二选一挂起');
  const hpBefore = game.player.hp;
  Engine.resolvePendingChoice(game, { option: 'draw' });
  assert.notEqual(game.pendingChoice && game.pendingChoice.kind, 'shan-response',
    '铁骑红判锁定经快照携带 — 恢复后不开闪窗');
  assert.equal(game.player.hp, hpBefore - 1, '锁定 → 直接受伤');
  assert.ok(game.player.hand.some((card) => card.id === 'zj-shan'), '闪留在手上');
});

// ───── F14: AOE 逐目标无懈窗口的展示目标 ─────

test('F14: 南蛮逐目标无懈窗口 meta.targetActor = 当前结算目标 (此前恒 null)', () => {
  const game = build3({ player: 'liubei', enemy: 'caocao', ally: 'sunquan' }, 96070);
  game.turn = 'enemy';
  game.enemy.hand = [c('nanman', { id: 'nm-1', suit: 'spade', color: 'black' })];
  game.player.hand = [c('wuxie', { id: 'p-wx', suit: 'club', color: 'black' })];
  game.player.skillPreferences.wuxieResponse = 'ask';
  Engine.playCard(game, 'enemy', 'nm-1');
  const pending = game.pendingChoice;
  assert.equal(pending && pending.kind, 'wuxie-response', '逐目标无懈窗口');
  const chain = game.pauseState.wuxieChain;
  const expected = chain.ctx.order[chain.ctx.idx];
  assert.ok(expected, '链 ctx 携带当前目标');
  assert.equal(pending.targetActor, expected, 'meta.targetActor (平铺) 补齐为当前结算目标');
  assert.ok(pending.targetName, 'targetName 同步补齐');
});

runTests(import.meta.url);
