// v14 P2: 方天画戟真实现 — "若你使用的【杀】是最后的手牌, 你使用此【杀】的
// 额外目标数上限+2" (card__equipment.md)。v7 PR-15 的占位 flag/log 路径删除,
// 本文件由"钉占位行为"反转为"钉真实现" (前置查询/多目标结算/上限校验/
// 1v1 单目标零变化)。
import assert from 'node:assert/strict';
import { Engine, c } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function fangtianWeapon(id) {
  return { id: id, type: 'fangtian', name: '方天画戟', family: 'equipment', slot: 'weapon', range: 4 };
}

function makeDuel() {
  const game = Engine.newGame({ seed: 92, startWithFirstTurn: true });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

function makeTrio(opts = {}) {
  const game = Engine.newGame({
    seed: opts.seed || 41001,
    seats: ['player', 'enemy', 'ally'],
    roles: opts.roles || { player: '主公', enemy: '反贼', ally: '反贼' },
    // 缺省武将避开杀链干扰技 (奸雄取牌/刚烈反击/无双双闪 — 交叉面
    // 在 v14_p_sha_chain 专测): 制衡/克己/闭月均与被杀结算无关。
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

// ───── 前置查询 shaExtraTargetLimit ─────────────────────────────────────

test('P2: 装备方天 + 手牌仅剩这张杀 → shaExtraTargetLimit = 2', () => {
  const game = makeDuel();
  game.player.equipment.weapon = fangtianWeapon('ft');
  game.player.hand = [c('sha', { id: 'last-sha' })];
  assert.equal(Engine.shaExtraTargetLimit(game, 'player', 'last-sha'), 2);
});

test('P2: 杀不是最后一张手牌 → shaExtraTargetLimit = 0', () => {
  const game = makeDuel();
  game.player.equipment.weapon = fangtianWeapon('ft2');
  game.player.hand = [c('sha', { id: 'sha-A' }), c('tao', { id: 'extra' })];
  assert.equal(Engine.shaExtraTargetLimit(game, 'player', 'sha-A'), 0);
});

test('P2: 非方天武器 / 非杀 → shaExtraTargetLimit = 0', () => {
  const game = makeDuel();
  game.player.equipment.weapon = { id: 'qg', type: 'qinggang', name: '青釭剑', family: 'equipment', slot: 'weapon', range: 2 };
  game.player.hand = [c('sha', { id: 'qg-sha' })];
  assert.equal(Engine.shaExtraTargetLimit(game, 'player', 'qg-sha'), 0);
  game.player.equipment.weapon = fangtianWeapon('ft3');
  game.player.hand = [c('tao', { id: 'lone-tao' })];
  assert.equal(Engine.shaExtraTargetLimit(game, 'player', 'lone-tao'), 0);
});

// ───── 1v1: 单目标行为零变化, 占位路径删除 ──────────────────────────────

test('P2: 1v1 最后手牌杀 — 单目标结算不变, 无占位 flag/触发 log', () => {
  const game = makeDuel();
  game.player.equipment.weapon = fangtianWeapon('ft4');
  game.player.hand = [c('sha', { id: 'noop-sha' })];
  const enemyHpBefore = game.enemy.hp;
  const logLenBefore = game.log.length;
  Engine.playCard(game, 'player', 'noop-sha');
  assert.equal(game.enemy.hp, enemyHpBefore - 1, '单目标照常 1 伤');
  assert.equal(game.player.flags.fangtianBonus, undefined, '占位 flag 已删除');
  const tail = game.log.slice(logLenBefore).join(' / ');
  assert.doesNotMatch(tail, /方天画戟/, '单目标使用无方天触发 log (额外目标是"可以"非"必须")');
});

// ───── 多目标结算 (3 席身份场) ──────────────────────────────────────────

test('P2: 最后手牌杀 + targets 双席 → 逐席各受 1 伤, 杀入弃牌堆恰一次', () => {
  const game = makeTrio();
  game.player.equipment.weapon = fangtianWeapon('ft5');
  const sha = c('sha', { id: 'multi-sha' });
  game.player.hand = [sha];
  const enemyHp = game.enemy.hp;
  const allyHp = game.ally.hp;
  assertCardConservation(game, () => {
    const result = Engine.playCard(game, 'player', 'multi-sha', { targets: ['enemy', 'ally'] });
    assert.equal(result.ok, true, result.message);
  });
  assert.equal(game.enemy.hp, enemyHp - 1);
  assert.equal(game.ally.hp, allyHp - 1);
  assert.equal(game.pauseState.shaChain, null, '链结算完毕自清');
  assert.equal(game.discard.filter((dc) => dc.id === 'multi-sha').length, 1, '杀恰好入弃牌堆一次');
  assert.equal(game.player.usedSha, true);
  assert.match(game.log.join(' / '), /方天画戟/, '多目标使用记录方天生效');
});

test('P2: 结算顺序按座次环 (从当前回合角色起) — targets 传入序不影响', () => {
  const game = makeTrio();
  game.player.equipment.weapon = fangtianWeapon('ft6');
  game.player.hand = [c('sha', { id: 'ring-sha' })];
  // 传入 [ally, enemy], 座次环 player→enemy→ally → enemy 先结算
  Engine.playCard(game, 'player', 'ring-sha', { targets: ['ally', 'enemy'] });
  const joined = game.log.join('\n');
  const enemyIdx = joined.indexOf(game.enemy.name + '因【杀】受到');
  const allyIdx = joined.indexOf(game.ally.name + '因【杀】受到');
  assert.ok(enemyIdx >= 0 && allyIdx >= 0, '两席都受伤');
  assert.ok(enemyIdx < allyIdx, '座次环序: enemy 先于 ally 结算');
});

test('P2: 目标数上限 — 非最后手牌多目标拒绝, 牌退回手牌 (守恒)', () => {
  const game = makeTrio();
  game.player.equipment.weapon = fangtianWeapon('ft7');
  game.player.hand = [c('sha', { id: 'deny-sha' }), c('tao', { id: 'spare' })];
  const result = Engine.playCard(game, 'player', 'deny-sha', { targets: ['enemy', 'ally'] });
  assert.equal(result.ok, false, '非最后手牌 → 无额外目标上限');
  assert.ok(game.player.hand.some((hc) => hc.id === 'deny-sha'), '拒绝路径牌退回手牌');
  assert.equal(game.enemy.hp, game.enemy.maxHp);
});

test('P2: 无方天时多目标拒绝; 重复指定同一席拒绝 (评审收口: 不再静默去重)', () => {
  const game = makeTrio();
  game.player.hand = [c('sha', { id: 'nak-sha' })];
  const noWeapon = Engine.playCard(game, 'player', 'nak-sha', { targets: ['enemy', 'ally'] });
  assert.equal(noWeapon.ok, false, '无方天 → 拒绝');
  assert.ok(game.player.hand.some((hc) => hc.id === 'nak-sha'));
  // 评审收口: 官方不允许重复指定同一角色 — {targets:[X,X]} 拒绝而非去重
  // (旧的静默去重会让普通杀绕过方天资格门混入链语义 + 伪造方天 log)。
  game.player.equipment.weapon = fangtianWeapon('ft8');
  const dup = Engine.playCard(game, 'player', 'nak-sha', { targets: ['enemy', 'enemy'] });
  assert.equal(dup.ok, false, '重复席拒绝');
  assert.ok(game.player.hand.some((hc) => hc.id === 'nak-sha'), '拒绝路径退牌');
  assert.equal(game.enemy.hp, game.enemy.maxHp, '未结算');
});

function makeFive(opts = {}) {
  const game = Engine.newGame({
    seed: opts.seed || 41051,
    seats: ['player', 'enemy', 'ally', 'ally2', 'ally3'],
    roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '反贼', ally3: '内奸' },
    playerHero: 'sunquan', enemyHero: 'lvmeng', allyHero: 'diaochan'
  });
  game.log = []; game.discard = []; game.deck = [];
  for (const seat of game.seats) {
    game[seat].hand = []; game[seat].judgeArea = [];
    game[seat].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[seat].hp = game[seat].maxHp; game[seat].skillPreferences = {};
    game[seat].flags = {}; game[seat].chuang = [];
  }
  game.turn = 'player'; game.phase = 'play';
  return game;
}

test('P2: 方天下 4 个互异目标超 1+2 上限拒绝 (5 席场)', () => {
  const game = makeFive();
  game.player.equipment.weapon = fangtianWeapon('ft9a');
  game.player.hand = [c('sha', { id: 'cap-sha' })];
  const result = Engine.playCard(game, 'player', 'cap-sha', { targets: ['enemy', 'ally', 'ally2', 'ally3'] });
  assert.equal(result.ok, false, '4 目标 > 1+2 上限');
  assert.match(result.message, /目标数超过上限/);
  assert.ok(game.player.hand.some((hc) => hc.id === 'cap-sha'), '拒绝路径退牌');
  assert.equal(game.player.usedSha, false, '未消耗出杀次数');
});

// 注: normalizeMultiTargets 的逐席距离分支 (canReachWithSha) 在 ≤5 席
// 场不可构造失败面 — 方天资格绑定 range 4 武器, 而 5 席环最远距离
// 2 (+1 马也仅 3) 恒可达; 该分支与单目标同款矩阵共享实现, 由单目标
// 距离测试保真 (评审收口: 标题如实化, 不再冒充距离用例)。

test('P2: 目标保护 (空城) 在多目标校验中逐席生效', () => {
  const game = makeTrio({ allyHero: 'zhugeliang' });
  game.player.equipment.weapon = fangtianWeapon('ft9');
  game.player.hand = [c('sha', { id: 'prot-sha' })];
  // 诸葛亮空城: 无手牌 → 不能成为杀目标 (cardTargetProtection)
  game.ally.hand = [];
  const result = Engine.playCard(game, 'player', 'prot-sha', { targets: ['enemy', 'ally'] });
  assert.equal(result.ok, false, '空城席位在多目标校验中同样受保护');
  assert.ok(game.player.hand.some((hc) => hc.id === 'prot-sha'));
});

test('P2: 转化虚拟杀口径 — 最后一张红色手牌经武圣当杀多目标生效', () => {
  const game = makeTrio({ playerHero: 'guanyu' });
  game.player.equipment.weapon = fangtianWeapon('ft10');
  game.player.hand = [c('tao', { id: 'red-src', suit: 'heart', rank: '9' })];
  const enemyHp = game.enemy.hp;
  const allyHp = game.ally.hp;
  const result = Engine.playCardAs(game, 'player', 'red-src', 'sha', { targets: ['enemy', 'ally'] });
  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, enemyHp - 1, '虚拟杀 (手牌来源) 方天多目标生效: enemy');
  assert.equal(game.ally.hp, allyHp - 1, '虚拟杀 (手牌来源) 方天多目标生效: ally');
});

await runTests();
