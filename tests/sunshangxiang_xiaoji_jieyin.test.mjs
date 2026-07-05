// v11 C6 (批次 30): 孙尚香 (标准包补员, 吴/女/3勾玉) — 枭姬 + 结姻。
// 枭姬: 失去装备区里的牌后摸两张 (挂 M2 统一装备失去时机, 替换/被拆/
// 被顺/主动卸下 全路径生效)。
// 结姻: 出牌阶段限一次, 弃两张手牌, 与一名已受伤男性角色各回复 1。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function buildGame(opts) {
  opts = opts || {};
  const game = Engine.newGame({ seed: opts.seed || 30001, playerHero: opts.playerHero || 'sunshangxiang', enemyHero: opts.enemyHero || 'liubei' });
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

function xiaojiLogs(game) {
  return game.log.filter((l) => l.includes('【枭姬】'));
}

// ───── 枭姬: 各装备失去路径 ─────────────────────────────────────────

test('枭姬 替换装备: 新装备顶掉旧装备 → 摸两张', () => {
  const game = buildGame();
  game.player.equipment.weapon = c('qinggang', { id: 'old-wpn' });
  game.player.hand = [c('cixiong', { id: 'new-wpn' })];
  game.deck = [c('tao', { id: 'd1' }), c('tao', { id: 'd2' })];
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'player', 'new-wpn');
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(xiaojiLogs(game).length, 1);
  assert.equal(game.player.hand.length, 2, '摸两张');
  assert.ok(game.discard.some((x) => x.id === 'old-wpn'));
});

test('枭姬 被拆: 敌方过河拆桥弃我装备 → 摸两张', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.player.equipment.armor = c('bagua', { id: 'my-armor' });
  game.enemy.hand = [c('guohe', { id: 'e-guohe' })];
  game.deck = [c('tao', { id: 'd1' }), c('tao', { id: 'd2' })];
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'e-guohe'));
  assert.equal(xiaojiLogs(game).length, 1);
  assert.equal(game.player.hand.length, 2);
  assert.equal(game.player.equipment.armor, null);
});

test('枭姬 被顺: 敌方顺手牵羊拿走装备 → 摸两张', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.player.equipment.weapon = c('qinggang', { id: 'my-wpn' });
  game.enemy.hand = [c('shunshou', { id: 'e-shun' })];
  game.deck = [c('tao', { id: 'd1' }), c('tao', { id: 'd2' })];
  assertCardConservation(game, () => {
    const r = Engine.playCard(game, 'enemy', 'e-shun', { targetZone: 'equipment', targetCardId: 'my-wpn' });
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(xiaojiLogs(game).length, 1);
  assert.equal(game.player.hand.length, 2);
  assert.ok(game.enemy.hand.some((x) => x.id === 'my-wpn'), '装备被顺走');
});

test('枭姬 主动卸下: loseEquipment → 摸两张', () => {
  const game = buildGame();
  game.player.equipment.horsePlus = c('plus_horse', { id: 'my-horse' });
  game.deck = [c('tao', { id: 'd1' }), c('tao', { id: 'd2' })];
  const r = Engine.loseEquipment(game, 'player', 'horsePlus');
  assert.equal(r.ok, true, r.message);
  assert.equal(xiaojiLogs(game).length, 1);
  assert.equal(game.player.hand.length, 2);
});

test('枭姬 decline 偏好: 不摸牌', () => {
  const game = buildGame();
  game.player.skillPreferences.xiaoji = 'decline';
  game.player.equipment.horsePlus = c('plus_horse', { id: 'my-horse' });
  game.deck = [c('tao', { id: 'd1' })];
  Engine.loseEquipment(game, 'player', 'horsePlus');
  assert.equal(xiaojiLogs(game).length, 0);
  assert.equal(game.player.hand.length, 0);
});

test('枭姬 反例: 非孙尚香失去装备不触发', () => {
  const game = buildGame({ playerHero: 'liubei', enemyHero: 'sunshangxiang' });
  game.player.equipment.weapon = c('qinggang', { id: 'p-wpn' });
  game.deck = [c('tao', { id: 'd1' })];
  Engine.loseEquipment(game, 'player', 'weapon');
  assert.equal(xiaojiLogs(game).length, 0);
  assert.equal(game.player.hand.length, 0);
});

// ───── 结姻 ─────────────────────────────────────────────────────────

test('结姻: 弃两张手牌 → 双方各回复 1, 每回合限一次', () => {
  const game = buildGame();
  game.player.hp = 1;
  game.enemy.hp = 2;
  game.player.hand = [c('sha', { id: 'j1' }), c('shan', { id: 'j2' }), c('tao', { id: 'keep' })];
  assertCardConservation(game, () => {
    const r = Engine.useSkill(game, 'player', 'jieyin', ['j1', 'j2']);
    assert.equal(r.ok, true, r.message);
  });
  assert.equal(game.player.hp, 2, '孙尚香回复 1');
  assert.equal(game.enemy.hp, 3, '目标回复 1');
  assert.deepEqual(game.player.hand.map((x) => x.id), ['keep'], '两张成本弃置');
  assert.ok(game.discard.some((x) => x.id === 'j1') && game.discard.some((x) => x.id === 'j2'));
  assert.ok(game.log.some((l) => l.includes('【结姻】')));

  game.player.hand.push(c('sha', { id: 'j3' }), c('shan', { id: 'j4' }));
  const again = Engine.useSkill(game, 'player', 'jieyin', ['j3', 'j4']);
  assert.equal(again.ok, false, '每回合限一次');
  assert.match(again.message, /限一次/);
});

test('结姻: 自身满血 → 只有目标受益 (封顶)', () => {
  const game = buildGame();
  game.enemy.hp = 1;
  game.player.hand = [c('sha', { id: 'j1' }), c('shan', { id: 'j2' })];
  Engine.useSkill(game, 'player', 'jieyin', ['j1', 'j2']);
  assert.equal(game.player.hp, game.player.maxHp, '自身封顶');
  assert.equal(game.enemy.hp, 2, '目标回复 1');
});

test('结姻 反例: 目标为女性 → 拒绝', () => {
  const game = buildGame({ enemyHero: 'daqiao' });
  game.enemy.hp = 1;
  game.player.hand = [c('sha', { id: 'j1' }), c('shan', { id: 'j2' })];
  const r = Engine.useSkill(game, 'player', 'jieyin', ['j1', 'j2']);
  assert.equal(r.ok, false);
  assert.match(r.message, /男性/);
  assert.equal(game.player.hand.length, 2, '成本未消耗');
});

test('结姻 反例: 目标未受伤 → 拒绝', () => {
  const game = buildGame();
  game.player.hp = 1;
  game.player.hand = [c('sha', { id: 'j1' }), c('shan', { id: 'j2' })];
  const r = Engine.useSkill(game, 'player', 'jieyin', ['j1', 'j2']);
  assert.equal(r.ok, false);
  assert.match(r.message, /未受伤/);
});

test('结姻 反例: 非两张 / 重复 / 不存在的手牌 → 拒绝且手牌不变', () => {
  const game = buildGame();
  game.enemy.hp = 1;
  game.player.hand = [c('sha', { id: 'j1' }), c('shan', { id: 'j2' })];
  assert.equal(Engine.useSkill(game, 'player', 'jieyin', ['j1']).ok, false, '只选一张');
  assert.equal(Engine.useSkill(game, 'player', 'jieyin', ['j1', 'j1']).ok, false, '重复同一张');
  assert.equal(Engine.useSkill(game, 'player', 'jieyin', ['j1', 'ghost']).ok, false, '含不存在的牌');
  assert.equal(game.player.hand.length, 2, '手牌不变');
  assert.equal(game.enemy.hp, 1, '未回复');
});

// ───── AI ───────────────────────────────────────────────────────────

test('AI 结姻: 自身危急 (hp<=2) + 男性对手受伤 + 手牌充足 → 发动', () => {
  const game = buildGame({ playerHero: 'liubei', enemyHero: 'sunshangxiang' });
  game.turn = 'enemy';
  game.enemy.hp = 1;
  game.player.hp = 2;
  game.enemy.hand = [c('sha', { id: 'a1' }), c('shan', { id: 'a2' }), c('tao', { id: 'a3' })];
  const action = Engine.aiChooseSkillAction(game, 'enemy');
  assert.ok(action, '有技能行动');
  assert.equal(action.skillId, 'jieyin');
  assert.equal(action.cardIds.length, 2);
});

test('AI 结姻: 自身健康 (hp=3) → 不发动 (不给对手白回血)', () => {
  const game = buildGame({ playerHero: 'liubei', enemyHero: 'sunshangxiang' });
  game.turn = 'enemy';
  game.enemy.hp = 3;
  game.player.hp = 2;
  game.enemy.hand = [c('sha', { id: 'a1' }), c('shan', { id: 'a2' }), c('tao', { id: 'a3' })];
  const action = Engine.aiChooseSkillAction(game, 'enemy');
  assert.ok(!action || action.skillId !== 'jieyin', '健康时不结姻');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
