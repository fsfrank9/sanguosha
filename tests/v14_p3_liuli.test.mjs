// v14 P3: 流离 (大乔) 真实现 — 单目标杀路径的 成为目标时 转移: AI 立场
// 启发 (auto) / 玩家 ask 面板决策 (liuli-transfer resolver) / 成本口径
// (手牌+装备, 不含判定区) / 攻击范围候选 / 1v1 恒 no-op (见
// liuli_sha_targeted 零回归钉)。
import assert from 'node:assert/strict';
import { Engine, c } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function makeTrio(opts = {}) {
  const game = Engine.newGame({
    seed: opts.seed || 43001,
    seats: ['player', 'enemy', 'ally'],
    roles: opts.roles || { player: '主公', enemy: '反贼', ally: '忠臣' },
    playerHero: opts.playerHero || 'sunquan',
    enemyHero: opts.enemyHero || 'daqiao',
    allyHero: opts.allyHero || 'lvmeng'
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

function playerSha(game, id) {
  const sha = c('sha', { id: id });
  game.player.hand.push(sha);
  return sha;
}

// ───── AI auto 立场启发 ───────────────────────────────────────────────

test('P3: AI 大乔 auto — 敌对候选存在 → 弃最低分手牌转移, 原目标无伤', () => {
  // 大乔(反贼) 的敌对候选 = ally(忠臣); 成本 = 手牌
  const game = makeTrio();
  game.enemy.hand = [c('tao', { id: 'dq-c1' })];
  playerSha(game, 'll-1');
  const allyHp = game.ally.hp;
  assertCardConservation(game, () => {
    const result = Engine.playCard(game, 'player', 'll-1', { target: 'enemy' });
    assert.equal(result.ok, true, result.message);
  });
  assert.equal(game.enemy.hp, game.enemy.maxHp, '大乔转移后无伤');
  assert.equal(game.ally.hp, allyHp - 1, '杀落在转移目标');
  assert.ok(game.discard.some((dc) => dc.id === 'dq-c1'), '流离成本入弃牌堆');
  assert.match(game.log.join(' / '), /发动【流离】/);
});

test('P3: AI 大乔 auto — 候选皆同侧 → 不祸水, 放弃转移', () => {
  // 大乔与 ally 同为反贼 → 唯一候选同侧 → decline
  const game = makeTrio({ roles: { player: '主公', enemy: '反贼', ally: '反贼' } });
  game.enemy.hand = [c('tao', { id: 'dq-c2' })];
  playerSha(game, 'll-2');
  Engine.playCard(game, 'player', 'll-2', { target: 'enemy' });
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, '不转移 → 自己受伤');
  assert.equal(game.ally.hp, game.ally.maxHp, '同侧候选未被祸及');
  assert.ok(game.enemy.hand.some((hc) => hc.id === 'dq-c2'), '成本未弃');
});

test('P3: AI 大乔 auto — 仅装备无手牌 → 不自动弃装备, 放弃转移', () => {
  const game = makeTrio();
  game.enemy.equipment.armor = { id: 'dq-armor', type: 'bagua', name: '八卦阵', family: 'equipment', slot: 'armor' };
  game.enemy.skillPreferences.bagua = 'decline'; // 隔离八卦判定面
  playerSha(game, 'll-3');
  Engine.playCard(game, 'player', 'll-3', { target: 'enemy' });
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, '不弃装备 → 自己受伤');
  assert.ok(game.enemy.equipment.armor, '装备保留');
});

// ───── 玩家 ask 面板决策 ──────────────────────────────────────────────

function makePlayerDaqiao(opts = {}) {
  const game = makeTrio(Object.assign({
    playerHero: 'daqiao', enemyHero: 'sunquan',
    roles: { player: '反贼', enemy: '主公', ally: '忠臣' }
  }, opts));
  game.turn = 'enemy';
  return game;
}

test('P3: 玩家大乔被杀指定 → liuli-transfer 挂起, 面板数据含手牌+装备成本与候选', () => {
  const game = makePlayerDaqiao();
  game.player.hand = [c('tao', { id: 'p-cost-hand' })];
  // 成本装备用武器槽 (不影响他人到大乔的距离; +1 马会把源拉出攻击范围)
  game.player.equipment.weapon = { id: 'p-cost-weapon', type: 'qinggang', name: '青釭剑', family: 'equipment', slot: 'weapon', range: 2 };
  game.enemy.hand = [c('sha', { id: 'e-sha-1' })];
  const result = Engine.playCard(game, 'enemy', 'e-sha-1', { target: 'player' });
  assert.equal(result.ok, true, result.message);
  const pending = game.pendingChoice;
  assert.equal(pending && pending.kind, 'liuli-transfer');
  assert.equal(pending.actor, 'player');
  assert.deepEqual(pending.costIds.sort(), ['p-cost-hand', 'p-cost-weapon'].sort(), '成本池 = 手牌 + 装备');
  assert.ok(pending.cards.some((pc) => pc.zone === 'equipment' && pc.id === 'p-cost-weapon'));
  assert.deepEqual(pending.candidates.map((cd) => cd.seat), ['ally'], '候选 = 攻击范围内非源他人');
  assert.ok(game.pauseState.shaLiuli, '单目标流离快照');
});

test('P3: 玩家 decline → 自己照常结算; 快照清空', () => {
  const game = makePlayerDaqiao();
  game.player.hand = [c('tao', { id: 'p-cost-d' })];
  game.enemy.hand = [c('sha', { id: 'e-sha-2' })];
  Engine.playCard(game, 'enemy', 'e-sha-2', { target: 'player' });
  Engine.resolvePendingChoice(game, { decline: true });
  assert.equal(game.player.hp, game.player.maxHp - 1, 'decline → 自己受伤');
  assert.equal(game.pauseState.shaLiuli, null);
  assert.ok(game.player.hand.some((hc) => hc.id === 'p-cost-d'), '成本未弃');
});

test('P3: 玩家弃手牌转移 → 目标改指, 杀对新目标结算', () => {
  const game = makePlayerDaqiao();
  game.player.hand = [c('tao', { id: 'p-cost-t' })];
  game.enemy.hand = [c('sha', { id: 'e-sha-3' })];
  const allyHp = game.ally.hp;
  assertCardConservation(game, () => {
    Engine.playCard(game, 'enemy', 'e-sha-3', { target: 'player' });
    Engine.resolvePendingChoice(game, { cardId: 'p-cost-t', target: 'ally' });
  });
  assert.equal(game.player.hp, game.player.maxHp, '转移后玩家无伤');
  assert.equal(game.ally.hp, allyHp - 1, '新目标受杀');
  assert.ok(game.discard.some((dc) => dc.id === 'p-cost-t'));
  assert.equal(game.pauseState.shaLiuli, null);
});

test('P3: 玩家弃装备转移 → 装备弃置 + 失去时机 (白银狮子回血)', () => {
  const game = makePlayerDaqiao();
  game.player.hp = game.player.maxHp - 1;
  game.player.equipment.armor = { id: 'p-baiyin', type: 'baiyin', name: '白银狮子', family: 'equipment', slot: 'armor' };
  game.enemy.hand = [c('sha', { id: 'e-sha-4' })];
  Engine.playCard(game, 'enemy', 'e-sha-4', { target: 'player' });
  Engine.resolvePendingChoice(game, { cardId: 'p-baiyin', target: 'ally' });
  assert.equal(game.player.equipment.armor, null, '装备成本弃置');
  assert.ok(game.discard.some((dc) => dc.id === 'p-baiyin'));
  assert.equal(game.player.hp, game.player.maxHp, '白银失去时机回 1 血 (统一失去时机)');
  assert.equal(game.ally.hp, game.ally.maxHp - 1, '杀落新目标');
});

test('P3: 非法决策 (成本/目标不在候选) → 按惯例重挂', () => {
  const game = makePlayerDaqiao();
  game.player.hand = [c('tao', { id: 'p-cost-x' })];
  game.enemy.hand = [c('sha', { id: 'e-sha-5' })];
  Engine.playCard(game, 'enemy', 'e-sha-5', { target: 'player' });
  const bad = Engine.resolvePendingChoice(game, { cardId: 'nonexistent', target: 'ally' });
  assert.equal(bad.ok, false);
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'liuli-transfer', '非法输入重挂');
  const bad2 = Engine.resolvePendingChoice(game, { cardId: 'p-cost-x', target: 'enemy' });
  assert.equal(bad2.ok, false, '源不在候选 (不能转回使用者)');
  Engine.resolvePendingChoice(game, { decline: true });
  assert.equal(game.player.hp, game.player.maxHp - 1);
});

// ───── 候选口径 ───────────────────────────────────────────────────────

test('P3: 候选限大乔攻击范围 — 5 席环上超出武器范围的座席不入候选', () => {
  const game = Engine.newGame({
    seed: 43012,
    seats: ['player', 'enemy', 'ally', 'ally2', 'ally3'],
    roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '反贼', ally3: '内奸' },
    playerHero: 'daqiao', enemyHero: 'sunquan', allyHero: 'lvmeng'
  });
  game.log = []; game.discard = []; game.deck = [];
  for (const seat of game.seats) {
    game[seat].hand = []; game[seat].judgeArea = [];
    game[seat].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[seat].hp = game[seat].maxHp; game[seat].skillPreferences = {};
    game[seat].flags = {}; game[seat].chuang = [];
  }
  game.turn = 'enemy'; game.phase = 'play';
  // 5 席环 player→enemy→ally→ally2→ally3: 大乔(player) 无武器攻击范围 1 →
  // 仅相邻 enemy/ally3 可达; enemy 是源被排除 → 候选仅 ally3
  game.player.hand = [c('tao', { id: 'p5-cost' })];
  game.enemy.hand = [c('sha', { id: 'e5-sha' })];
  Engine.playCard(game, 'enemy', 'e5-sha', { target: 'player' });
  const pending = game.pendingChoice;
  assert.equal(pending && pending.kind, 'liuli-transfer');
  assert.deepEqual(pending.candidates.map((cd) => cd.seat), ['ally3'], '候选仅攻击范围内非源座席');
  Engine.resolvePendingChoice(game, { decline: true });
});

test('P3: 判定区牌不是可弃成本 — 仅判定区有牌时流离不触发', () => {
  const game = makePlayerDaqiao();
  game.player.judgeArea = [c('lebusishu', { id: 'p-judge-card' })];
  game.enemy.hand = [c('sha', { id: 'e-sha-6' })];
  Engine.playCard(game, 'enemy', 'e-sha-6', { target: 'player' });
  assert.equal(game.pendingChoice, null, '无可弃成本 (判定区不计) → 不询问');
  assert.equal(game.player.hp, game.player.maxHp - 1, '杀照常结算');
});

await runTests();
