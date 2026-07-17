// v13 K1: 4/5 人身份场 — 预设分配 / 内奸胜负条款 / 死亡奖惩 / 回合环。
// 官方依据: 身份预设 4 人 主/忠/反/内、5 人 主/忠/反/反/内 (路线图 K1 口径,
// 本地 official-skill-cache 无身份局专章原文, 按通用官方规则实现并在
// docs 记录); 死亡奖惩 flow__death.md:41 (杀反摸三/主公误杀忠臣弃牌)。
// 胜负条款 (v13 K1 新增): 主公亡时仅剩内奸存活 → renegade 胜, 否则
// rebelSide 胜; lordSide 获胜收紧为反贼与内奸全灭。
import test from 'node:test';
import assert from 'node:assert/strict';
import { SanguoshaEngine as Engine } from '../src/engine/game-engine.js';

const SEATS4 = ['player', 'enemy', 'ally', 'ally2'];
const SEATS5 = ['player', 'enemy', 'ally', 'ally2', 'ally3'];

function build(seats, opts = {}) {
  const game = Engine.newGame({
    seed: opts.seed || 15001,
    seats: seats.slice(),
    ...(opts.roles ? { roles: opts.roles } : {}),
  });
  for (const seat of seats) {
    game[seat].hand = [];
    game[seat].judgeArea = [];
    game[seat].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[seat].hp = game[seat].maxHp;
    game[seat].skillPreferences = {};
    game[seat].flags = {};
  }
  game.deck = [];
  game.discard = [];
  game.log = [];
  game.turn = opts.turn || 'player';
  game.phase = 'play';
  return game;
}

test('K1: 4 人档预设 — 主/忠/反/内 逐席分配, 首位主公先手', () => {
  const game = Engine.newGame({ seed: 15002, seats: SEATS4 });
  // v13 K3: 座次顺序对齐座席语义 (enemy=反贼/ally=忠臣, 与 3 人档一致);
  // 构成仍为官方 1主1忠1反1内。
  assert.deepEqual(
    SEATS4.map((seat) => game.roles[seat]),
    ['主公', '反贼', '忠臣', '内奸'],
    '4 人档为官方 主/忠/反/内 各一 (座次: 主/反/忠/内)'
  );
  assert.equal(game.mode, 'identity3', '身份场模式标签覆盖 4 人档');
  assert.equal(game.firstActor, 'player', '首位 (主公) 先手');
  assert.deepEqual(Engine.aliveSeats(game), SEATS4);
  for (const seat of SEATS4) {
    assert.equal(game[seat].hand.length, 4, seat + ' 开局摸 4 张');
  }
});

test('K1: 5 人档预设 — 主/忠/反/反/内 逐席开局', () => {
  const game = Engine.newGame({ seed: 15003, seats: SEATS5 });
  // v13 K3: 座次对齐座席语义 (enemy=反贼/ally=忠臣); 构成 1主1忠2反1内。
  assert.deepEqual(
    SEATS5.map((seat) => game.roles[seat]),
    ['主公', '反贼', '忠臣', '反贼', '内奸']
  );
  assert.equal(game.roleSides[game.roles.ally3], 'renegade', '内奸阵营映射就绪');
  assert.deepEqual(Engine.aliveSeats(game), SEATS5);
  assert.equal(Engine.nextSeat(game, 'ally3'), 'player', '座次环闭合');
  for (const seat of SEATS5) {
    assert.equal(game[seat].hand.length, 4, seat + ' 开局摸 4 张');
  }
});

test('K1/K5: 主公体力上限 — 5 人局 +1 (官方 glossary__value.md:23), 4 人及以下不加', () => {
  // 张角 maxHp=3: 5 人局主公应为 4/4 开局。
  const game5 = Engine.newGame({ seed: 15012, seats: SEATS5, playerHero: 'zhangjiao' });
  assert.equal(game5.roles.player, '主公');
  assert.equal(game5.player.maxHp, 4, '5 人局主公体力上限 +1');
  assert.equal(game5.player.hp, 4, '开局体力随之 +1');
  assert.equal(game5.enemy.maxHp, game5.enemy.hp, '非主公席不受影响');

  const game4 = Engine.newGame({ seed: 15013, seats: SEATS4, playerHero: 'zhangjiao' });
  assert.equal(game4.player.maxHp, 3, '4 人局不加 (官方: 人数不小于 5 才 +1)');

  const game3 = Engine.newGame({ seed: 15014, seats: ['player', 'enemy', 'ally'], playerHero: 'zhangjiao' });
  assert.equal(game3.player.maxHp, 3, '3 人局不加 (v12 行为零回归)');
});

test('K1: 逐席 Role 覆盖仍然生效 (显式 options 优先于预设)', () => {
  const game = Engine.newGame({ seed: 15004, seats: SEATS4, ally2Role: '反贼' });
  assert.equal(game.roles.ally2, '反贼', '显式覆盖第 4 席');
  assert.equal(game.roles.player, '主公', '其余席位仍按预设');
});

test('K1: 内奸单独获胜 — 主公亡时场上仅剩内奸', () => {
  const game = build(SEATS4, {
    seed: 15005,
    roles: { player: '主公', enemy: '内奸', ally: '忠臣', ally2: '反贼' },
    turn: 'enemy',
  });
  game.ally.hp = 0;
  game.ally2.hp = 0;
  game.player.hp = 1;
  game.enemy.hand = [Engine.makeTestCard('sha', { id: 'renegade-final' })];
  const res = Engine.playCard(game, 'enemy', 'renegade-final', { target: 'player' });
  assert.equal(res.ok, true);
  assert.equal(game.phase, 'gameover');
  assert.equal(game.winner, 'renegade', '仅剩内奸存活 → 内奸单独获胜');
  assert.ok(game.log.some((line) => line.includes('内奸获胜')), '终局日志宣告内奸获胜');
});

test('K1: 内奸败北 — 主公亡但场上尚有他人存活 → 反贼方胜', () => {
  const game = build(SEATS5, {
    seed: 15006,
    roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '反贼', ally3: '内奸' },
    turn: 'enemy',
  });
  game.player.hp = 1;
  game.enemy.hand = [Engine.makeTestCard('sha', { id: 'rebel-kill-lord' })];
  const res = Engine.playCard(game, 'enemy', 'rebel-kill-lord', { target: 'player' });
  assert.equal(res.ok, true);
  assert.equal(game.phase, 'gameover');
  assert.equal(game.winner, 'rebelSide', '忠臣/反贼/内奸尚存 → 反贼方胜 (内奸败北)');
});

test('K1: 主公方获胜收紧 — 反贼全灭而内奸存活时对局继续', () => {
  const game = build(SEATS4, {
    seed: 15007,
    roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '内奸' },
  });
  game.enemy.hp = 1;
  game.player.hand = [Engine.makeTestCard('sha', { id: 'kill-last-rebel' })];
  const res = Engine.playCard(game, 'player', 'kill-last-rebel', { target: 'enemy' });
  assert.equal(res.ok, true);
  assert.equal(game.phase, 'play', '内奸存活 → 不判 lordSide 胜, 对局继续');
  assert.equal(game.winner, null);
  // 击杀反贼奖惩: 任何角色击杀反贼 → 摸三张 (deck 为空时摸不到, 先补牌堆)。
  // build() 清空了 deck, 这里断言奖惩路径至少被触发 (日志)。
  assert.ok(game.log.some((line) => line.includes('击杀反贼，摸三张牌')), '杀反奖励触发');

  // 随后忠臣击杀内奸 → 反贼与内奸全灭, 主公方胜。
  game.turn = 'ally';
  game.phase = 'play';
  game.ally2.hp = 1;
  game.ally.hand = [Engine.makeTestCard('sha', { id: 'kill-renegade' })];
  const res2 = Engine.playCard(game, 'ally', 'kill-renegade', { target: 'ally2' });
  assert.equal(res2.ok, true);
  assert.equal(game.phase, 'gameover');
  assert.equal(game.winner, 'lordSide', '反贼与内奸全灭 → 主公方胜');
});

test('K1: 死亡奖惩 4 席 — 击杀反贼摸三张 (含内奸作为击杀者)', () => {
  const game = build(SEATS4, {
    seed: 15008,
    roles: { player: '内奸', enemy: '反贼', ally: '主公', ally2: '忠臣' },
  });
  // 补牌堆让奖励可实际摸到 3 张。
  game.deck = [
    Engine.makeTestCard('shan', { id: 'd1' }),
    Engine.makeTestCard('shan', { id: 'd2' }),
    Engine.makeTestCard('shan', { id: 'd3' }),
    Engine.makeTestCard('shan', { id: 'd4' }),
  ];
  game.enemy.hp = 1;
  game.enemy.hand = [];
  game.player.hand = [Engine.makeTestCard('sha', { id: 'renegade-kills-rebel' })];
  const res = Engine.playCard(game, 'player', 'renegade-kills-rebel', { target: 'enemy' });
  assert.equal(res.ok, true);
  assert.equal(game.phase, 'play', '主公与内奸均存活 → 对局继续');
  assert.equal(game.player.hand.length, 3, '内奸击杀反贼同样摸三张');
});

test('K1: 死亡奖惩 5 席 — 主公误杀忠臣弃置所有手牌与装备', () => {
  const game = build(SEATS5, {
    seed: 15009,
    roles: { player: '主公', enemy: '忠臣', ally: '反贼', ally2: '反贼', ally3: '内奸' },
  });
  game.enemy.hp = 1;
  game.enemy.hand = [];
  // keep 用【闪】而非【桃】: 桃会让主公成为忠臣濒死的救援候选而挂起询问。
  const keep = Engine.makeTestCard('shan', { id: 'lord-keep' });
  const weapon = Engine.makeTestCard('zhangba', { id: 'lord-weapon' });
  game.player.hand = [Engine.makeTestCard('sha', { id: 'lord-kills-loyal' }), keep];
  game.player.equipment.weapon = weapon;
  const res = Engine.playCard(game, 'player', 'lord-kills-loyal', { target: 'enemy' });
  assert.equal(res.ok, true);
  assert.equal(game.phase, 'play', '反贼/内奸存活 → 对局继续');
  assert.equal(game.player.hand.length, 0, '误杀忠臣 → 弃置所有手牌');
  assert.equal(game.player.equipment.weapon, null, '误杀忠臣 → 弃置装备');
  assert.ok(game.discard.some((c) => c.id === 'lord-keep'), '手牌进弃牌堆');
  assert.ok(game.discard.some((c) => c.id === 'lord-weapon'), '装备进弃牌堆');
});

test('K1: 5 席回合环 — 阵亡座席不再拥有回合, 直接传给下一存活席', () => {
  const game = build(SEATS5, { seed: 15010 });
  // 给全员补空牌堆防摸牌越界。
  game.deck = Array.from({ length: 12 }, (_, i) => Engine.makeTestCard('shan', { id: 'ring-d' + i }));
  game.ally3.hp = 0;
  assert.equal(Engine.nextSeat(game, 'ally2'), 'player', 'nextSeat 跳过阵亡的 ally3');
  Engine.startTurn(game, 'ally3');
  assert.equal(game.turn, 'player', '阵亡座席的回合直接传给下一存活席');
});

test('K1: 3 人档零回归 — 无内奸时胜负行为与 v12 恒等', () => {
  const game = build(['player', 'enemy', 'ally'], {
    seed: 15011,
    roles: { player: '主公', enemy: '反贼', ally: '忠臣' },
  });
  game.enemy.hp = 1;
  game.player.hand = [Engine.makeTestCard('sha', { id: 'regress-kill' })];
  const res = Engine.playCard(game, 'player', 'regress-kill', { target: 'enemy' });
  assert.equal(res.ok, true);
  assert.equal(game.phase, 'gameover', '3 人档反贼全灭即主公方胜 (无内奸收紧影响)');
  assert.equal(game.winner, 'lordSide');
});
