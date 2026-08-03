// v14 P1/P4: 多目标杀结算链 (方天画戟) — 链驱动三阶段 (流离→锁定→逐席
// 结算, 座次环序) 与交叉面: 奸雄取回 / 仁王盾逐席 / 铁骑锁定前置 (官方
// rule__principle.md 判例) / 濒死挂起续跑 / 玩家闪 ask 挂起续跑 / 流离
// 转移给既有目标 (连续两次结算判例) / 铁索传导 / 终局提前收束。
import assert from 'node:assert/strict';
import { Engine, c } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function fangtianWeapon(id) {
  return { id: id, type: 'fangtian', name: '方天画戟', family: 'equipment', slot: 'weapon', range: 4 };
}

function makeTrio(opts = {}) {
  const game = Engine.newGame({
    seed: opts.seed || 42001,
    seats: ['player', 'enemy', 'ally'],
    roles: opts.roles || { player: '主公', enemy: '反贼', ally: '反贼' },
    playerHero: opts.playerHero || 'sunquan',
    enemyHero: opts.enemyHero || 'lvmeng',
    allyHero: opts.allyHero || 'diaochan'
  });
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
  }
  game.turn = 'player';
  game.phase = 'play';
  return game;
}

function armMultiSha(game, id) {
  game.player.equipment.weapon = fangtianWeapon('ft-' + id);
  const sha = c('sha', { id: id });
  game.player.hand = [sha];
  return sha;
}

// ───── 奸雄取回 (P4 交叉: AOE 之外第二个同 sourceCard 多席结算面) ────────

test('P1×奸雄: 首席曹操奸雄取回杀后, 后续席照常结算且无双区并存', () => {
  const game = makeTrio({ enemyHero: 'caocao' });
  armMultiSha(game, 'jx-sha');
  const allyHp = game.ally.hp;
  assertCardConservation(game, () => {
    const result = Engine.playCard(game, 'player', 'jx-sha', { targets: ['enemy', 'ally'] });
    assert.equal(result.ok, true, result.message);
  });
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, '曹操受 1 伤');
  assert.ok(game.enemy.hand.some((hc) => hc.id === 'jx-sha'), '奸雄获得此杀 (实体入手)');
  assert.equal(game.ally.hp, allyHp - 1, '后续席位照常结算 (官方 flow__virtual 判例)');
  assert.equal(game.discard.filter((dc) => dc.id === 'jx-sha').length, 0, '已归属席位不补弃');
  assert.equal(game.pauseState.shaChain, null);
});

// ───── 仁王盾/藤甲 逐席独立 ────────────────────────────────────────────

test('P1: 仁王盾席位抵消黑杀, 其余席照常; 杀仍恰好弃置一次', () => {
  const game = makeTrio();
  armMultiSha(game, 'rw-sha');
  game.enemy.equipment.armor = { id: 'rw', type: 'renwang', name: '仁王盾', family: 'equipment', slot: 'armor' };
  const allyHp = game.ally.hp;
  assertCardConservation(game, () => {
    Engine.playCard(game, 'player', 'rw-sha', { targets: ['enemy', 'ally'] });
  });
  assert.equal(game.enemy.hp, game.enemy.maxHp, '仁王盾席位无伤');
  assert.equal(game.ally.hp, allyHp - 1, '无甲席位照常受伤');
  assert.equal(game.discard.filter((dc) => dc.id === 'rw-sha').length, 1, '链收尾恰好弃置一次');
  assert.match(game.log.join(' / '), /仁王盾/);
});

// ───── 铁骑锁定阶段前置 (官方判例: 全目标决定并结算完再开始使用结算) ────

test('P1: 铁骑对全部目标先行判定锁闪, 再逐席结算 (rule__principle 判例)', () => {
  const game = makeTrio({ playerHero: 'machao' });
  armMultiSha(game, 'tq-sha');
  game.enemy.hand = [c('shan', { id: 'e-shan' })];
  game.ally.hand = [c('shan', { id: 'a-shan' })];
  // judge 用 deck.pop(): 两席铁骑判定各一张红 → 双锁
  game.deck = [c('tao', { id: 'j2', suit: 'heart', rank: '3' }), c('tao', { id: 'j1', suit: 'diamond', rank: '4' })];
  Engine.playCard(game, 'player', 'tq-sha', { targets: ['enemy', 'ally'] });
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, '锁闪 → 命中');
  assert.equal(game.ally.hp, game.ally.maxHp - 1, '第二席独立判定同锁');
  assert.ok(game.enemy.hand.some((hc) => hc.id === 'e-shan'), '闪未被消耗 (不能打出)');
  assert.ok(game.ally.hand.some((hc) => hc.id === 'a-shan'));
  // 时序: 两次铁骑判定均在首个伤害之前 (锁定阶段前置)
  const joined = game.log.join('\n');
  const secondTieqi = joined.indexOf('【铁骑】', joined.indexOf('【铁骑】') + 4);
  const firstDamage = joined.indexOf('因【杀】受到');
  assert.ok(secondTieqi >= 0 && firstDamage >= 0 && secondTieqi < firstDamage,
    '第二席铁骑判定早于首席伤害 — 锁定阶段先于使用结算');
});

// ───── 濒死挂起 → 链续跑 ──────────────────────────────────────────────

test('P1: 首席濒死挂起救援询问, 拒绝后死亡结算, 链继续第二席', () => {
  const game = makeTrio();
  armMultiSha(game, 'dy-sha');
  game.enemy.hp = 1;
  // 出杀者手牌已空 (方天资格), 救援询问改由 ally 席 (带桃 + ask) 触发
  game.ally.hand = [c('tao', { id: 'rescue-tao' })];
  game.ally.skillPreferences.dying = 'ask';
  const allyHp = game.ally.hp;
  const result = Engine.playCard(game, 'player', 'dy-sha', { targets: ['enemy', 'ally'] });
  assert.equal(result.ok, true, result.message);
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'dying-rescue', 'ally 救援询问挂起');
  assert.ok(game.pauseState.shaChain, '链保留等待续跑');
  Engine.resolvePendingChoice(game, { decline: true });
  assert.equal(game.enemy.hp <= 0, true, '无人救援死亡');
  assert.equal(game.ally.hp, allyHp - 1, '救援排空后链续跑第二席');
  assert.equal(game.pauseState.shaChain, null, '链自清');
  assert.equal(game.pendingChoice, null);
});

// ───── 玩家闪响应 ask 挂起 → 链续跑 ───────────────────────────────────

test('P1: AI 多目标杀, 玩家席 ask 出闪 → 化解自身, 链完成', () => {
  const game = makeTrio();
  game.turn = 'enemy';
  game.enemy.equipment.weapon = fangtianWeapon('ft-eai');
  game.enemy.hand = [c('sha', { id: 'ai-sha' })];
  game.player.hand = [c('shan', { id: 'p-shan' })];
  game.player.skillPreferences.shanResponse = 'ask';
  const allyHp = game.ally.hp;
  // 座次环自 enemy 起: enemy→ally→player → ally 先结算, player 后挂起
  const result = Engine.playCard(game, 'enemy', 'ai-sha', { targets: ['player', 'ally'] });
  assert.equal(result.ok, true, result.message);
  assert.equal(game.ally.hp, allyHp - 1, 'ally 按环序先结算');
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'shan-response', '玩家席挂起');
  Engine.resolvePendingChoice(game, { use: true });
  assert.equal(game.player.hp, game.player.maxHp, '玩家出闪化解');
  assert.equal(game.player.hand.length, 0, '闪已消耗');
  assert.equal(game.pauseState.shaChain, null, '链完成自清');
  assert.equal(game.discard.filter((dc) => dc.id === 'ai-sha').length, 1);
});

// ───── 流离转移给既有目标 → 连续两次结算 (rule__principle 判例) ─────────

test('P1×流离: 大乔转移给既有目标 ally → ally 连续两次结算共 2 伤', () => {
  const game = makeTrio({ enemyHero: 'daqiao', roles: { player: '主公', enemy: '反贼', ally: '忠臣' } });
  armMultiSha(game, 'll-sha');
  game.enemy.hand = [c('tao', { id: 'dq-cost' })]; // 流离成本
  const allyHp = game.ally.hp;
  assertCardConservation(game, () => {
    const result = Engine.playCard(game, 'player', 'll-sha', { targets: ['enemy', 'ally'] });
    assert.equal(result.ok, true, result.message);
  });
  assert.equal(game.enemy.hp, game.enemy.maxHp, '大乔转移后自身无伤');
  assert.equal(game.discard.some((dc) => dc.id === 'dq-cost'), true, '流离成本已弃置');
  assert.equal(game.ally.hp, allyHp - 2, '判例: 转移给既有目标 → 连续两次结算');
  assert.equal(game.discard.filter((dc) => dc.id === 'll-sha').length, 1, '杀仍只弃置一次');
  assert.match(game.log.join(' / '), /流离/);
});

// ───── 铁索传导交叉 ───────────────────────────────────────────────────

test('P1×铁索: 火杀双目标 + 双横置 — 首席传导后次席再被本杀结算', () => {
  const game = makeTrio();
  game.player.equipment.weapon = fangtianWeapon('ft-fire');
  game.player.hand = [c('fire_sha', { id: 'fire-multi' })];
  game.enemy.chained = true;
  game.ally.chained = true;
  assertCardConservation(game, () => {
    const result = Engine.playCard(game, 'player', 'fire-multi', { targets: ['enemy', 'ally'] });
    assert.equal(result.ok, true, result.message);
  });
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, '首席火伤 1, 解除连环');
  assert.equal(game.enemy.chained, false);
  assert.equal(game.ally.hp, game.ally.maxHp - 2, '传导 1 + 本杀逐席结算 1');
  assert.equal(game.ally.chained, false);
  assert.equal(game.pauseState.shaChain, null);
});

// ───── 终局提前收束 ───────────────────────────────────────────────────

test('P1: 链中途终局 (末位威胁倒下) → 链收束不再结算后续席, 牌守恒', () => {
  const game = makeTrio({ roles: { player: '主公', enemy: '反贼', ally: '忠臣' } });
  armMultiSha(game, 'go-sha');
  game.enemy.hp = 1; // 唯一反贼
  assertCardConservation(game, () => {
    Engine.playCard(game, 'player', 'go-sha', { targets: ['enemy', 'ally'] });
    if (game.pendingChoice && game.pendingChoice.kind === 'dying-rescue') {
      Engine.resolvePendingChoice(game, { decline: true });
    }
  });
  assert.equal(game.phase, 'gameover', '反贼全灭 → 主忠方胜');
  assert.equal(game.ally.hp, game.ally.maxHp, '终局后不再结算忠臣席');
  assert.equal(game.pauseState.shaChain, null, '链收束自清');
});

// ═════ 评审收口回归 (opus 对抗抓获项逐一钉死) ═════════════════════════

test('收口: 流离转移给奸雄席 → 同席双结算奸雄只取回一次, 无牌复制', () => {
  // opus 最小复现: 华佗(方天)对 [大乔, 曹操] 出杀, 大乔流离转给曹操 →
  // 曹操连续两次结算 — 修复前第二次奸雄把已在手牌的同一对象再推一次
  // (同一张牌双份, 守恒红线)。
  const game = Engine.newGame({
    seed: 42101,
    seats: ['player', 'enemy', 'ally', 'ally2'],
    roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '反贼' },
    playerHero: 'sunquan', enemyHero: 'caocao', allyHero: 'daqiao', ally2Hero: 'huatuo'
  });
  game.log = []; game.discard = []; game.deck = [];
  for (const seat of game.seats) {
    game[seat].hand = []; game[seat].judgeArea = [];
    game[seat].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[seat].hp = game[seat].maxHp; game[seat].skillPreferences = {};
    game[seat].flags = {}; game[seat].chuang = [];
  }
  game.turn = 'ally2'; game.phase = 'play';
  game.ally2.equipment.weapon = fangtianWeapon('ft-jx2');
  game.ally2.hand = [c('sha', { id: 'MS' })];
  game.ally.hand = [c('tao', { id: 'dq-jx-cost' })]; // 大乔流离成本
  assertCardConservation(game, () => {
    const result = Engine.playCard(game, 'ally2', 'MS', { targets: ['ally', 'enemy'] });
    assert.equal(result.ok, true, result.message);
  });
  assert.equal(game.enemy.hp, game.enemy.maxHp - 2, '曹操被连续两次结算');
  assert.equal(game.enemy.hand.filter((hc) => hc.id === 'MS').length, 1, '奸雄只获得一份 (归属守卫)');
  assert.equal(game.discard.filter((dc) => dc.id === 'MS').length, 0, '已归属不补弃');
  assert.equal(game.pauseState.shaChain, null);
});

test('收口: playCardAs 多目标转化杀 — 无资格拒绝前置于摘牌, 零副作用', () => {
  const game = makeTrio({ playerHero: 'guanyu' });
  // 装备区红牌当杀 + 多目标: 资格要求手牌来源 → 移牌前拒绝, 装备原位
  game.player.equipment.weapon = fangtianWeapon('ft-as1');
  game.player.equipment.armor = c('bagua', { id: 'red-armor', suit: 'diamond', color: 'red' });
  const eqResult = Engine.playCardAs(game, 'player', 'red-armor', 'sha', { targets: ['enemy', 'ally'] });
  assert.equal(eqResult.ok, false, '装备来源多目标拒绝');
  assert.ok(game.player.equipment.armor && game.player.equipment.armor.id === 'red-armor', '装备未被摘走 (K5 不变量)');
  // 手牌来源但无方天: 同样移牌前拒绝
  game.player.equipment.weapon = null;
  game.player.hand = [c('tao', { id: 'ws-red', suit: 'heart' })];
  const handResult = Engine.playCardAs(game, 'player', 'ws-red', 'sha', { targets: ['enemy', 'ally'] });
  assert.equal(handResult.ok, false, '无方天多目标拒绝');
  assert.ok(game.player.hand.some((hc) => hc.id === 'ws-red'), '手牌原位');
});

test('收口: 链未收束前来源杀不入弃牌堆 (在途), 收尾统一弃置恰一次', () => {
  const game = makeTrio();
  game.turn = 'enemy';
  game.enemy.equipment.weapon = fangtianWeapon('ft-late');
  game.enemy.hand = [c('sha', { id: 'late-sha' })];
  game.player.hand = [c('shan', { id: 'ld-shan' })];
  game.player.skillPreferences.shanResponse = 'ask';
  // 环序 ally 先命中 → 修复前此刻杀已入弃牌堆 (使用结算未结束)
  Engine.playCard(game, 'enemy', 'late-sha', { targets: ['player', 'ally'] });
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'shan-response');
  assert.equal(game.discard.some((dc) => dc.id === 'late-sha'), false, '挂起时来源杀仍在途 (不早弃)');
  Engine.resolvePendingChoice(game, { use: true });
  assert.equal(game.pauseState.shaChain, null);
  assert.equal(game.discard.filter((dc) => dc.id === 'late-sha').length, 1, '收尾统一弃置恰一次');
});

test('收口: 挂起点结算触发终局 → resume 清理悬空链 (无泄漏)', () => {
  const game = makeTrio({ roles: { player: '主公', enemy: '反贼', ally: '忠臣' } });
  armMultiSha(game, 'go2-sha');
  game.enemy.hp = 1; // 唯一反贼, 死亡即终局
  game.ally.hand = [c('tao', { id: 'go2-tao' })];
  game.ally.skillPreferences.dying = 'ask'; // 救援询问挂起链
  Engine.playCard(game, 'player', 'go2-sha', { targets: ['enemy', 'ally'] });
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'dying-rescue');
  assert.ok(game.pauseState.shaChain, '链挂起等待');
  Engine.resolvePendingChoice(game, { decline: true }); // → 终局于 resolver 内
  assert.equal(game.phase, 'gameover');
  assert.equal(game.pauseState.shaChain, null, '终局 resume 路径清链 (修复前永久悬空)');
  assert.equal(game.discard.filter((dc) => dc.id === 'go2-sha').length, 1, '收束幂等弃置');
});

await runTests();
