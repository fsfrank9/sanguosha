// v13 audit4 修复批回归 — 全量技能/牌逻辑审计 (12 域找→opus 对抗驳→汇总)
// 确证 16 条 (高2/中9/低5) 逐条钉死。发现编号对应 docs/audit/
// 2026-07-19-audit4-skills-cards.md。
import assert from 'node:assert/strict';
import { Engine, StateRuntime } from './helpers/load-engine.mjs';
import { assertCardConservation, collectCardCensus } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function buildNp(seats, opts = {}) {
  const game = Engine.newGame({
    seed: opts.seed || 61001,
    seats: seats.length > 2 ? seats.slice() : undefined,
    playerHero: opts.playerHero || 'lvmeng',
    enemyHero: opts.enemyHero || 'lvmeng',
    allyHero: opts.allyHero || (seats.length > 2 ? 'lvmeng' : undefined),
    ally2Hero: opts.ally2Hero
  });
  game.log = []; game.discard = []; game.deck = [];
  for (const a of game.seats) {
    game[a].hand = []; game[a].judgeArea = []; game[a].flags = {};
    game[a].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[a].hp = game[a].maxHp;
    game[a].skillPreferences = {};
    game[a].chained = false;
  }
  if (opts.roles) game.roles = opts.roles;
  game.turn = opts.turn || 'player';
  game.phase = 'play';
  return game;
}
const build2p = (opts = {}) => buildNp(['player', 'enemy'], opts);
const build3p = (opts = {}) => buildNp(['player', 'enemy', 'ally'], opts);

// ───── H1: AOE 来源牌洗回牌堆后不再二次弃置 (守恒) ─────────────────────

test('H1: 南蛮首目标死亡→奖励摸牌洗回来源牌→伤害收尾不补弃 (全场单份, 守恒)', () => {
  const game = build3p({ seed: 60001, turn: 'enemy', roles: { player: '主公', enemy: '反贼', ally: '反贼' } });
  game.enemy.hand = [c('nanman', { id: 'h1-nanman' })];
  game.ally.hp = 1; // 首目标 (enemy 下家) 无杀 → 死 → enemy 击杀反贼摸三
  for (let i = 0; i < 8; i += 1) game.discard.push(c('sha', { id: 'pad-' + i }));
  game.deck.push(c('shan', { id: 'deck-last' })); // 奖励摸 1 张即空 → 洗牌把南蛮洗回 deck
  const r = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'h1-nanman'));
  assert.equal(r.ok, true, r.message);
  // 前置条件证明: 南蛮确实被洗回牌堆 (旧代码在此局面二次弃置 → deck+discard 双份)
  const zones = ['deck', 'discard'].filter((z) => game[z].some((x) => x.id === 'h1-nanman')).length
    + game.seats.filter((a) => (game[a].hand || []).some((x) => x.id === 'h1-nanman')).length;
  assert.equal(zones, 1, '南蛮全场恰一份');
  assert.ok(game.deck.some((x) => x.id === 'h1-nanman'), '本种子下南蛮在牌堆 (洗回向量确实走到)');
  const census = collectCardCensus(game);
  assert.equal(census.zoneDuplicates.length, 0, '零双区并存');
});

// ───── H2: useSkill 目标须存活 ─────────────────────────────────────────

test('H2: 反间对尸体 (显式/缺省对手均) → fail, 不重放死亡结算', () => {
  // 双反贼: 击杀 enemy 后 ally 反贼仍存活 → 对局继续 (单反贼会直接终局)
  const game = build3p({ playerHero: 'zhouyu', roles: { player: '主公', enemy: '反贼', ally: '反贼' } });
  game.player.hand = [c('sha', { id: 'kill-sha' }), c('tao', { id: 'fj-card', suit: 'heart' })];
  game.enemy.hp = 1; game.enemy.hand = [];
  const kill = Engine.playCard(game, 'player', 'kill-sha');
  assert.equal(kill.ok, true, kill.message);
  for (let guard = 0; game.pendingChoice && guard < 10; guard += 1) {
    Engine.resolvePendingChoice(game, { decline: true }); // 排干濒死救援询问
  }
  assert.ok(game.enemy.hp <= 0 && game.phase !== 'gameover', '前置: enemy 已亡且对局继续');
  const deathLogs = game.log.filter((l) => l.includes('阵亡')).length;
  const explicit = Engine.useSkill(game, 'player', 'fanjian', ['fj-card'], { target: 'enemy', guessedSuit: 'spade' });
  assert.equal(explicit.ok, false, '显式尸体目标拒绝');
  assert.match(explicit.message, /阵亡/);
  const defaulted = Engine.useSkill(game, 'player', 'fanjian', ['fj-card'], { guessedSuit: 'spade' });
  assert.equal(defaulted.ok, false, '缺省对手为尸体同拒');
  assert.equal(game.log.filter((l) => l.includes('阵亡')).length, deathLogs, '死亡结算未重放');
  assert.ok(game.player.hand.some((x) => x.id === 'fj-card'), '成本零副作用');
});

test('H2: 结姻对尸体 → fail (亡者 hp 0<maxHp 不再骗过"已受伤"检查)', () => {
  const game = build3p({ playerHero: 'sunshangxiang', enemyHero: 'guanyu', roles: { player: '主公', enemy: '反贼', ally: '忠臣' } });
  game.enemy.hp = 0;
  game.player.hand = [c('sha', { id: 'jy-1' }), c('shan', { id: 'jy-2' })];
  const r = Engine.useSkill(game, 'player', 'jieyin', ['jy-1', 'jy-2'], { target: 'enemy' });
  assert.equal(r.ok, false);
  assert.match(r.message, /阵亡/);
  assert.equal(game.enemy.hp, 0, '尸体未被回血');
});

// ───── M1: playSha 显式目标复用合法性 ─────────────────────────────────

test('M1: 对自己出杀 → fail 且不掉血', () => {
  const game = build2p({ playerHero: 'liubei' });
  game.player.hand = [c('sha', { id: 'self-sha' })];
  const r = Engine.playCard(game, 'player', 'self-sha', { target: 'player' });
  assert.equal(r.ok, false);
  assert.equal(game.player.hp, game.player.maxHp);
  assert.ok(game.player.hand.some((x) => x.id === 'self-sha'), '牌未消耗');
});

test('M1: 对已阵亡座席出杀 → fail, 不重放死亡结算', () => {
  const game = build3p({ roles: { player: '主公', enemy: '反贼', ally: '忠臣' } });
  game.ally.hp = 0;
  game.player.hand = [c('sha', { id: 'dead-sha' })];
  const deathLogs = game.log.length;
  const r = Engine.playCard(game, 'player', 'dead-sha', { target: 'ally' });
  assert.equal(r.ok, false);
  assert.equal(game.ally.hp, 0, '尸体 hp 不再变化');
  assert.equal(game.log.length, deathLogs, '零结算日志');
});

// ───── M2: 过河拆桥 identity3 界限突破版 (判定区可拆) ──────────────────

test('M2: identity3 判定区唯一有牌 → 过河合法且可拆走乐不思蜀', () => {
  const game = build3p({});
  game.player.hand = [c('guohe', { id: 'gh-1' })];
  game.enemy.hand = []; // 装备也空 — 仅判定区
  game.enemy.judgeArea = [c('lebusishu', { id: 'lebu-x', suit: 'club' })];
  assert.equal(Engine.isLegalCardTarget(game, 'player', game.player.hand[0], 'enemy'), true, '判定区有牌 → 合法目标 (与顺手一致)');
  const r = assertCardConservation(game, () => Engine.playCard(game, 'player', 'gh-1', { target: 'enemy', targetZone: 'judge', targetCardId: 'lebu-x' }));
  assert.equal(r.ok, true, r.message);
  assert.equal(game.enemy.judgeArea.length, 0, '乐不思蜀被拆');
  assert.ok(game.discard.some((x) => x.id === 'lebu-x'));
});

test('M2: 1v1 过河仍为官方 1V1 变体 — 判定区不可选', () => {
  const game = build2p({});
  game.player.hand = [c('guohe', { id: 'gh-2' })];
  game.enemy.hand = [c('sha', { id: 'eh-1' })];
  game.enemy.judgeArea = [c('lebusishu', { id: 'lebu-y' })];
  const r = Engine.playCard(game, 'player', 'gh-2', { target: 'enemy', targetZone: 'judge', targetCardId: 'lebu-y' });
  assert.equal(r.ok, false, '1v1 判定区拒绝');
  assert.equal(game.enemy.judgeArea.length, 1);
});

test('M2: identity3 AI auto 兜底 — 目标仅判定区有牌时拆最后置入的延时锦囊', () => {
  const game = build3p({ turn: 'ally' });
  game.ally.hand = [c('guohe', { id: 'gh-3' })];
  game.ally.skillPreferences.guohe = 'auto';
  game.enemy.hand = [];
  game.enemy.judgeArea = [c('lebusishu', { id: 'lebu-z' }), c('bingliang', { id: 'bl-z' })];
  const r = assertCardConservation(game, () => Engine.playCard(game, 'ally', 'gh-3', { target: 'enemy' }));
  assert.equal(r.ok, true, r.message);
  assert.ok(game.discard.some((x) => x.id === 'bl-z'), 'LIFO: 最后置入的兵粮被拆');
  assert.equal(game.enemy.judgeArea.length, 1);
});

// ───── M3: 火攻目标须有手牌 ───────────────────────────────────────────

test('M3: 空手牌角色非火攻合法目标; 全场无合法目标时 canPlayCard 拒绝且集智不触发', () => {
  const game = build2p({ playerHero: 'huangyueying' });
  game.player.hand = [c('huogong', { id: 'hg-1', suit: 'heart', color: 'red' })];
  game.enemy.hand = [];
  assert.equal(Engine.isLegalCardTarget(game, 'player', game.player.hand[0], 'enemy'), false);
  const can = Engine.canPlayCard(game, 'player', game.player.hand[0]);
  assert.equal(can.ok, false, 'canPlayCard 拒绝');
  const handBefore = game.player.hand.length;
  const r = Engine.playCard(game, 'player', 'hg-1');
  assert.equal(r.ok, false);
  assert.equal(game.player.hand.length, handBefore, '火攻未消耗且集智未白摸');
});

// ───── M4: gender 补全 → 雌雄双股剑对风包武将触发 ─────────────────────

test('M4: 风包武将有 gender; 雌雄双股剑对小乔 (女) 触发二选一', () => {
  assert.equal(Engine.HERO_CATALOG.xiaoqiao.gender, 'female');
  assert.equal(Engine.HERO_CATALOG.zhangjiao.gender, 'male');
  const game = build2p({ playerHero: 'liubei', enemyHero: 'xiaoqiao' });
  game.player.equipment.weapon = c('cixiong', { id: 'cx-1' });
  game.player.hand = [c('sha', { id: 'cx-sha' })];
  game.enemy.hand = [c('shan', { id: 'cx-shan' })];
  const r = Engine.playCard(game, 'player', 'cx-sha');
  assert.equal(r.ok, true, r.message);
  const cixiongSurfaced = (game.pendingChoice && String(game.pendingChoice.kind).indexOf('cixiong') === 0)
    || game.log.some((l) => l.includes('雌雄'));
  assert.ok(cixiongSurfaced, '性别不同 → 雌雄时机出现 (询问或结算日志)');
});

// ───── M5: 神速选项二可弃装备区已装备的牌 ─────────────────────────────

test('M5: 神速② 装备区坐骑可选 — 候选带真实 id, 弃置后虚拟杀发动', () => {
  const game = build2p({ playerHero: 'xiahouyuan' });
  game.player.equipment.horsePlus = c('plus_horse', { id: 'ss-horse' });
  game.enemy.hand = [];
  for (let i = 0; i < 6; i += 1) game.deck.push(c('sha', { id: 'ss-pad-' + i })); // 防摸牌阶段洗牌吞掉弃置的马
  const enemyHpBefore = game.enemy.hp;
  Engine.startTurn(game, 'player');
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'shensu-options');
  assert.ok(game.pendingChoice.equipCandidates.some((x) => x.id === 'ss-horse'), '装备区候选带真实 id (此前恒 undefined)');
  const r = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { options: [2], equipCardId: 'ss-horse' }));
  assert.equal(r.ok, true, r.message);
  assert.equal(game.player.equipment.horsePlus, null, '坐骑离开装备区');
  assert.ok(game.discard.some((x) => x.id === 'ss-horse'));
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '虚拟【杀】命中');
  assert.equal(game.player.flags.skipPlay, true, '跳过出牌阶段');
});

// ───── M6: 奇才 — 锦囊无距离限制真正生效 ──────────────────────────────

test('M6: identity3 黄月英对距离 2 座席 顺手/兵粮 不受距离拦截', () => {
  const game = build3p({ playerHero: 'huangyueying' });
  game.enemy.equipment.horsePlus = c('plus_horse', { id: 'q-horse' }); // 距离 1+1=2
  game.enemy.hand = [c('sha', { id: 'q-steal' })];
  game.player.hand = [c('shunshou', { id: 'q-ss' }), c('bingliang', { id: 'q-bl' })];
  assert.equal(Engine.isLegalCardTarget(game, 'player', game.player.hand[0], 'enemy'), true, '顺手无距离拦截');
  assert.equal(Engine.isLegalCardTarget(game, 'player', game.player.hand[1], 'enemy'), true, '兵粮无距离拦截');
  const r = assertCardConservation(game, () => Engine.playCard(game, 'player', 'q-ss', { target: 'enemy', targetZone: 'hand', targetCardId: 'q-steal' }));
  assert.equal(r.ok, true, r.message);
  // 对照: 无奇才的座席仍受距离 ≤1 拦截
  const game2 = build3p({});
  game2.enemy.equipment.horsePlus = c('plus_horse', { id: 'q2-horse' });
  game2.enemy.hand = [c('sha', { id: 'q2-steal' })];
  game2.player.hand = [c('shunshou', { id: 'q2-ss' })];
  assert.equal(Engine.isLegalCardTarget(game2, 'player', game2.player.hand[0], 'enemy'), false, '对照: 距离拦截仍在');
});

// ───── M7: 马超归蜀 → 激将可征召 ──────────────────────────────────────

test('M7: 马超 camp=蜀; 激将可令马超代出【杀】', () => {
  assert.equal(Engine.HERO_CATALOG.machao.camp, '蜀');
  assert.equal(Engine.HERO_CATALOG.sp_machao.camp, '群', 'SP 马超仍属群');
  const game = build3p({ playerHero: 'liubei', enemyHero: 'guanyu', allyHero: 'machao', roles: { player: '主公', enemy: '反贼', ally: '忠臣' } });
  game.ally.hand = [c('sha', { id: 'mc-sha' })];
  game.enemy.hand = [];
  const enemyHpBefore = game.enemy.hp;
  const r = Engine.useSkill(game, 'player', 'jijiang', [], { target: 'enemy' });
  assert.equal(r.ok, true, r.message);
  assert.ok(game.log.some((l) => l.includes('激将')), '激将发动');
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '马超代打的杀命中');
});

// ───── M8: 借刀交武器触发枭姬 (统一失去时机) ──────────────────────────

test('M8: 借刀杀人交出武器 → 枭姬摸两张', () => {
  const game = build2p({ playerHero: 'sunshangxiang', turn: 'enemy' });
  game.player.equipment.weapon = c('zhuge', { id: 'xj-weapon' });
  game.player.hand = []; // 无杀 → 只能交武器
  game.enemy.hand = [c('jiedao', { id: 'xj-jiedao' })];
  for (let i = 0; i < 4; i += 1) game.deck.push(c('sha', { id: 'xj-pad-' + i })); // 枭姬摸二需牌堆有货
  const r = assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'xj-jiedao', { target: 'player' }));
  assert.equal(r.ok, true, r.message);
  assert.ok(game.enemy.hand.some((x) => x.id === 'xj-weapon'), '武器已转移');
  assert.equal(game.player.hand.length, 2, '枭姬摸两张 (此前该路径不触发)');
  assert.ok(game.log.some((l) => l.includes('枭姬')));
});

// ───── M9: 急救可用红色装备牌 ─────────────────────────────────────────

test('M9: 华佗仅红色装备 → 濒死自救成功 (auto), 装备进弃牌堆', () => {
  const game = build3p({ allyHero: 'huatuo', roles: { player: '主公', enemy: '反贼', ally: '反贼' } });
  game.ally.hp = 1;
  game.ally.hand = [];
  game.ally.equipment.weapon = c('qinglong', { id: 'jj-red', suit: 'heart', color: 'red' });
  game.player.hand = [c('sha', { id: 'jj-sha' })];
  const r = assertCardConservation(game, () => Engine.playCard(game, 'player', 'jj-sha', { target: 'ally' }));
  assert.equal(r.ok, true, r.message);
  assert.equal(game.ally.hp, 1, '急救红装备当桃 → 脱离濒死回到 1 (此前直接阵亡)');
  assert.equal(game.ally.equipment.weapon, null);
  assert.ok(game.discard.some((x) => x.id === 'jj-red'));
  assert.ok(game.log.some((l) => l.includes('急救')));
});

// ───── L1: 青龙偃月刀续杀支持视为体系 (龙胆) ──────────────────────────

test('L1: 赵云青龙续杀 — 无物理杀时用龙胆闪当杀', () => {
  const game = build2p({ playerHero: 'zhaoyun' });
  game.player.equipment.weapon = c('qinglong', { id: 'ql-1' });
  game.player.hand = [c('sha', { id: 'ql-sha' }), c('shan', { id: 'ql-shan' })];
  game.enemy.hand = [c('shan', { id: 'e-shan' })]; // 首杀被闪 → 续杀窗口
  const enemyHpBefore = game.enemy.hp;
  const r = assertCardConservation(game, () => Engine.playCard(game, 'player', 'ql-sha'));
  assert.equal(r.ok, true, r.message);
  assert.ok(game.log.some((l) => l.includes('青龙偃月刀')), '续杀发动');
  assert.ok(game.log.some((l) => l.includes('龙胆')), '龙胆转化参与续杀 (此前只扫物理杀不可达)');
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '续杀命中');
  assert.ok(!game.player.hand.some((x) => x.id === 'ql-shan'), '闪作为转化载体离手');
});

// ───── L2: 濒死黑酒 (使用方法Ⅱ) 触发银月枪 ────────────────────────────

test('L2: 敌方银月枪+黑酒自救 → 银月枪对玩家触发 1 点', () => {
  const game = build2p({});
  game.enemy.hp = 1;
  game.enemy.equipment.weapon = c('yinyue', { id: 'yy-1' });
  game.enemy.hand = [c('jiu', { id: 'yy-jiu', suit: 'spade', color: 'black' })];
  game.player.hand = [c('sha', { id: 'yy-sha' })]; // 无闪 → 银月枪 1 伤必中
  const playerHpBefore = game.player.hp;
  const r = assertCardConservation(game, () => Engine.playCard(game, 'player', 'yy-sha'));
  assert.equal(r.ok, true, r.message);
  assert.equal(game.enemy.hp, 1, '黑酒自救回到 1');
  assert.ok(game.log.some((l) => l.includes('银月枪')), '银月枪触发 (此前唯此分支遗漏)');
  assert.equal(game.player.hp, playerHpBefore - 1, '玩家无闪受 1 点');
});

// ───── L3: 离间成本可用装备区牌 ───────────────────────────────────────

test('L3: 貂蝉以装备区牌支付离间成本 → ok', () => {
  const game = build3p({ playerHero: 'diaochan', enemyHero: 'guanyu', allyHero: 'zhangfei' });
  game.player.hand = [];
  game.player.equipment.weapon = c('qinglong', { id: 'lj-cost' });
  game.enemy.hand = [c('sha', { id: 'lj-e' })];
  game.ally.hand = [c('sha', { id: 'lj-a' })];
  const r = assertCardConservation(game, () => Engine.useSkill(game, 'player', 'lijian', ['lj-cost'], { targets: ['enemy', 'ally'] }));
  assert.equal(r.ok, true, r.message);
  assert.ok(game.discard.some((x) => x.id === 'lj-cost'), '装备成本进弃牌堆');
  assert.ok(game.log.some((l) => l.includes('离间')));
});

// ───── L4: 死亡奖惩弃装备走统一失去时机 ───────────────────────────────

test('L4: 主公误杀忠臣弃白银狮子 → 白银② 回复 1 点', () => {
  const game = build3p({ roles: { player: '主公', enemy: '反贼', ally: '忠臣' } });
  game.player.hp = 3; // maxHp 4, 受伤态 — 白银②可回
  game.player.equipment.armor = c('baiyin', { id: 'by-1' });
  game.ally.hp = 1; game.ally.hand = [];
  game.player.hand = [c('sha', { id: 'by-sha' })];
  const r = assertCardConservation(game, () => Engine.playCard(game, 'player', 'by-sha', { target: 'ally' }));
  assert.equal(r.ok, true, r.message);
  assert.equal(game.player.equipment.armor, null, '惩罚弃置生效');
  assert.equal(game.player.hp, 4, '失去白银狮子回复 1 (此前裸弃不触发)');
  assert.ok(game.log.some((l) => l.includes('白银狮子')));
});

// ───── L5: 决斗链插入结算挂起守卫 ─────────────────────────────────────

test('L5: 决斗中银月枪挂起 → 决斗停机不越序; 攻击方死亡 → 决斗中止, 对手无伤', () => {
  const game = build2p({ playerHero: 'zhaoyun', enemyHero: 'guanyu' });
  game.player.hp = 1;
  game.player.skillPreferences.shanResponse = 'ask'; // 银月枪目标 → 挂起询问
  game.player.hand = [c('juedou', { id: 'l5-duel' }), c('sha', { id: 'l5-sha', suit: 'heart' }), c('shan', { id: 'l5-shan', suit: 'heart' })];
  game.enemy.equipment.weapon = c('yinyue', { id: 'l5-yy' });
  game.enemy.hand = [c('sha', { id: 'l5-esha', suit: 'spade' })]; // 决斗黑杀 → 触发银月枪
  const r = Engine.playCard(game, 'player', 'l5-duel');
  assert.equal(r.ok, true, r.message);
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'yinyue-response', '银月枪询问挂起');
  assert.equal(game.enemy.hp, game.enemy.maxHp, '决斗停机, 未越序结算 (此前关羽已白掉 1 血)');
  const r2 = assertCardConservation(game, () => Engine.resolvePendingChoice(game, {})); // decline → 玩家受 1 → 死
  assert.equal(r2.ok, true, r2.message);
  assert.ok(game.player.hp <= 0, '赵云 1hp 被银月枪杀死');
  assert.equal(game.enemy.hp, game.enemy.maxHp, '决斗中止, 关羽全程无伤');
  // 1v1 玩家阵亡即终局 — 链快照与 pauseState.aoe 同口径允许终局残留
  // (resumeSuspendedTurnFlowIfReady 顶层 gameover 短路, 对抗验证判无害);
  // 非终局则必须清空。
  assert.ok(game.phase === 'gameover' || !(game.pauseState && game.pauseState.duelChain), '非终局不悬空决斗链');
  assert.equal(game.phase, 'gameover', '对局按银月枪先行结算的正确时序终局');
});

// ───── 评审收口 (sonnet 常规 + opus 对抗验证) ─────────────────────────

test('收口: 青龙续杀转化候选可来自装备区 (武圣红色坐骑当杀)', () => {
  const game = build2p({ playerHero: 'guanyu' });
  game.player.equipment.weapon = c('qinglong', { id: 'sk-ql' });
  game.player.equipment.horsePlus = c('plus_horse', { id: 'sk-red-horse', suit: 'heart', color: 'red' });
  game.player.hand = [c('sha', { id: 'sk-sha' })]; // 唯一物理杀, 被闪后手牌无转化候选
  game.enemy.hand = [c('shan', { id: 'sk-eshan' })];
  const enemyHpBefore = game.enemy.hp;
  const r = assertCardConservation(game, () => Engine.playCard(game, 'player', 'sk-sha'));
  assert.equal(r.ok, true, r.message);
  assert.ok(game.log.some((l) => l.includes('武圣')), '武圣从装备区取红牌当杀续杀 (此前只扫手牌静默漏掉)');
  assert.equal(game.player.equipment.horsePlus, null, '红色坐骑离开装备区');
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '续杀命中');
});

test('收口: 红颜持有者黑桃酒自救 → 银月枪不触发 (effectiveCardColor 口径)', () => {
  const game = build2p({ enemyHero: 'xiaoqiao' });
  game.enemy.hp = 1;
  // 隔离天香: 红颜令黑桃酒视为红桃 → 天香会把它当转移成本抢走场景
  game.enemy.skillPreferences.tianxiang = 'decline';
  game.enemy.equipment.weapon = c('yinyue', { id: 'sk-yy' });
  game.enemy.hand = [c('jiu', { id: 'sk-jiu', suit: 'spade', color: 'black' })];
  game.player.hand = [c('sha', { id: 'sk-atk' })];
  const playerHpBefore = game.player.hp;
  const r = assertCardConservation(game, () => Engine.playCard(game, 'player', 'sk-atk'));
  assert.equal(r.ok, true, r.message);
  assert.equal(game.enemy.hp, 1, '黑酒自救成功');
  assert.ok(!game.log.some((l) => l.includes('银月枪')), '红颜: 黑桃视为红桃 → 银月枪不触发 (与另两处出口同口径)');
  assert.equal(game.player.hp, playerHpBefore);
});

test('收口: 1v1 显式 targetZone=judge 的过河提前拒绝, 牌不白损', () => {
  const game = build2p({});
  game.player.hand = [c('guohe', { id: 'sk-gh' })];
  game.enemy.hand = [c('sha', { id: 'sk-eh' })];
  game.enemy.judgeArea = [c('lebusishu', { id: 'sk-lebu' })];
  const r = Engine.playCard(game, 'player', 'sk-gh', { target: 'enemy', targetZone: 'judge', targetCardId: 'sk-lebu' });
  assert.equal(r.ok, false);
  assert.ok(game.player.hand.some((x) => x.id === 'sk-gh'), '过河留手 (此前已入弃牌堆白损)');
  assert.equal(game.enemy.judgeArea.length, 1);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
