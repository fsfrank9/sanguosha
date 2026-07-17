// v13 L: 可选身份 — 引擎面矩阵 (身份 × 3/4/5 席)。
//   L1: firstActorFromRoles 全环扫描修复 (主公落任意座席先手正确);
//       轮转 roles 下 主公体力上限+1 落 AI 座席; 死亡奖惩镜像 (AI 主公
//       误杀玩家忠臣); 激将求助 4/5 席可达; 救援濒死路径 (玩家吴势力
//       救 AI 主公孙权 +1); 黄天 4 席可达。
//   L2: 玩家阵亡后对局继续 — 回合环跳过亡席玩家, AI 续跑至终局可达。
import test from 'node:test';
import assert from 'node:assert/strict';
import { SanguoshaEngine as Engine } from '../src/engine/game-engine.js';

const SEATS3 = ['player', 'enemy', 'ally'];
const SEATS4 = ['player', 'enemy', 'ally', 'ally2'];
const SEATS5 = ['player', 'enemy', 'ally', 'ally2', 'ally3'];

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function reset(game, opts = {}) {
  for (const seat of game.seats) {
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
  game.turn = opts.turn || game.firstActor;
  game.phase = 'play';
  return game;
}

// 预设阵型内轮转 (与 dom-adapter computeIdentityRoles 同算法): 玩家席取
// 所选身份在预设中的下标为偏移, 其余身份沿座次环顺延。
const PRESETS = {
  3: ['主公', '反贼', '忠臣'],
  4: ['主公', '反贼', '忠臣', '内奸'],
  5: ['主公', '反贼', '忠臣', '反贼', '内奸'],
};
function rotatedRoles(seats, playerRole) {
  const preset = PRESETS[seats.length];
  const offset = preset.indexOf(playerRole);
  const roles = {};
  seats.forEach((seat, i) => { roles[seat] = preset[(i + offset) % preset.length]; });
  return roles;
}

// ───── L1: 矩阵 — 轮转分配 + 先手归属 (firstActorFromRoles 修复) ─────

const MATRIX = [
  { seats: SEATS3, role: '忠臣' }, { seats: SEATS3, role: '反贼' },
  { seats: SEATS4, role: '忠臣' }, { seats: SEATS4, role: '反贼' }, { seats: SEATS4, role: '内奸' },
  { seats: SEATS5, role: '忠臣' }, { seats: SEATS5, role: '反贼' }, { seats: SEATS5, role: '内奸' },
];

for (const { seats, role } of MATRIX) {
  test(`L1 矩阵: ${seats.length} 席 玩家=${role} — 轮转构成不变 + 主公座席先手`, () => {
    const roles = rotatedRoles(seats, role);
    const game = Engine.newGame({ seed: 16000 + seats.length * 10 + role.charCodeAt(0) % 10, seats: seats.slice(), roles });
    assert.equal(game.roles.player, role, '玩家席身份 = 所选身份');
    // 构成不变: 与预设的身份多重集合一致。
    assert.deepEqual(
      seats.map((s) => game.roles[s]).slice().sort(),
      PRESETS[seats.length].slice().sort(), '轮转保持预设构成');
    const lordSeat = seats.find((s) => game.roles[s] === '主公');
    assert.notEqual(lordSeat, 'player', '玩家非主公 → 主公在 AI 座席');
    assert.equal(game.firstActor, lordSeat, '先手 = 主公座席 (firstActorFromRoles 全环扫描修复)');
    assert.equal(game.turn, lordSeat);
    if (seats.length >= 5) {
      assert.equal(game[lordSeat].maxHp, game[lordSeat].hp, 'AI 主公满血开局');
      assert.equal(game.player.maxHp, game.player.hp);
    }
  });
}

test('L1: 5 席玩家=内奸 — 主公体力上限 +1 落 AI 主公座席, 玩家不加', () => {
  const roles = rotatedRoles(SEATS5, '内奸');
  const lordSeat = SEATS5.find((s) => roles[s] === '主公');
  // 主公座席配 maxHp=3 的张角, 玩家配 maxHp=4 的吕蒙作对照。
  const options = { seed: 16101, seats: SEATS5.slice(), roles, playerHero: 'lvmeng' };
  options[lordSeat + 'Hero'] = 'zhangjiao';
  const game = Engine.newGame(options);
  assert.equal(game[lordSeat].maxHp, 4, 'AI 主公张角 3+1=4');
  assert.equal(game.player.maxHp, 4, '玩家吕蒙保持 4 (非主公不加)');
});

// ───── L1: 死亡奖惩镜像 — AI 主公误杀玩家忠臣 ─────

test('L1: AI 主公误杀玩家忠臣 → AI 主公弃置所有手牌与装备 (奖惩镜像)', () => {
  const game = Engine.newGame({
    seed: 16102, seats: SEATS4.slice(),
    roles: rotatedRoles(SEATS4, '忠臣'),
  });
  // 玩家=忠臣时 4p 轮转: player=忠, enemy=内, ally=主, ally2=反。
  assert.equal(game.roles.ally, '主公');
  reset(game, { turn: 'ally' });
  game.player.hp = 1;
  game.ally.hand = [c('sha', { id: 'lord-sha' }), c('tao', { id: 'lord-keep' })];
  game.ally.equipment.weapon = c('qinggang', { id: 'lord-weapon' });
  game.player.hand = [];
  for (const seat of game.seats) game[seat].skillPreferences.dying = 'decline';
  // ally(主公)→player(忠臣) 距离 1? 环 [P,E,A,A2]: A(idx2)→P(idx0) = min(2,2)=2 → 配 -1 马。
  game.ally.equipment.horseMinus = c('minus_horse', { id: 'lord-horse' });
  const res = Engine.playCard(game, 'ally', 'lord-sha', { target: 'player' });
  assert.equal(res.ok, true, res.message);
  assert.ok(game.player.hp <= 0, '玩家忠臣阵亡');
  assert.notEqual(game.phase, 'gameover', '反贼/内奸仍存活 → 对局继续 (玩家阵亡旁观)');
  assert.equal(game.ally.hand.length, 0, 'AI 主公误杀忠臣 → 弃置所有手牌');
  assert.equal(game.ally.equipment.weapon, null, '→ 弃置装备');
});

// ───── L1: 激将求助 4 席可达 (玩家忠臣 + AI 主公) ─────

test('L1: 4 席激将求助 — AI 主公决斗无杀, 玩家忠臣挂起询问代打', () => {
  const game = Engine.newGame({
    seed: 16103, seats: SEATS4.slice(),
    roles: { player: '忠臣', enemy: '反贼', ally: '主公', ally2: '内奸' },
    playerHero: 'guanyu', allyHero: 'liubei', enemyHero: 'caocao', ally2Hero: 'lvbu',
    firstActor: 'enemy',
  });
  reset(game, { turn: 'enemy' });
  game.enemy.hand = [c('juedou', { id: 'jd' })];
  game.player.hand = [c('sha', { id: 'p-sha' })];
  const res = Engine.playCard(game, 'enemy', 'jd', { target: 'ally' });
  assert.equal(res.ok, true, res.message);
  assert.ok(game.pendingChoice && game.pendingChoice.kind === 'jijiang-aid', '4 席下玩家收到激将求助');
  assert.equal(game.pendingChoice.lordActor, 'ally');
  const r2 = Engine.resolvePendingChoice(game, { use: true });
  assert.equal(r2.ok, true, r2.message);
  assert.equal(game.player.hand.length, 0, '玩家的杀代主公打出');
  assert.equal(game.ally.hp, game.ally.maxHp, '主公无伤');
});

// ───── L1: 救援 — 玩家吴势力救濒死 AI 主公孙权 +1 ─────

test('L1: 救援濒死路径 — 玩家吴势力用桃救 AI 主公孙权, 回复 1+1', () => {
  const game = Engine.newGame({
    seed: 16104, seats: SEATS3.slice(),
    roles: { player: '忠臣', enemy: '反贼', ally: '主公' },
    playerHero: 'zhouyu', allyHero: 'sunquan', enemyHero: 'caocao',
    firstActor: 'enemy',
  });
  assert.equal(game.player.camp, '吴');
  reset(game, { turn: 'enemy' });
  game.ally.hp = 1;
  game.ally.hand = [];
  game.enemy.hand = [c('sha', { id: 'kill-lord' })];
  game.player.hand = [c('tao', { id: 'rescue-tao' })];
  game.enemy.skillPreferences.dying = 'decline';
  const res = Engine.playCard(game, 'enemy', 'kill-lord', { target: 'ally' });
  assert.equal(res.ok, true, res.message);
  assert.ok(game.pendingChoice && game.pendingChoice.kind === 'dying-rescue', '玩家被询问救援');
  const r2 = Engine.resolvePendingChoice(game, { cardId: 'rescue-tao' });
  assert.equal(r2.ok, true, r2.message);
  assert.equal(game.ally.hp, 2, '救援: 吴势力对主公孙权用桃 回复量 +1 (0→2)');
  assert.notEqual(game.phase, 'gameover');
});

// ───── L1: 黄天 4 席可达 (玩家群势力忠臣 + AI 主公张角在第四席) ─────

test('L1: 4 席黄天 — 玩家群势力忠臣给第四席 AI 主公张角一张闪', () => {
  const game = Engine.newGame({
    seed: 16105, seats: SEATS4.slice(),
    roles: { player: '忠臣', enemy: '反贼', ally: '内奸', ally2: '主公' },
    playerHero: 'huaxiong', ally2Hero: 'zhangjiao', enemyHero: 'guanyu', allyHero: 'lvbu',
    firstActor: 'player',
  });
  reset(game, { turn: 'player' });
  assert.equal(game.player.camp, '群');
  game.player.hand = [c('shan', { id: 'give-shan' })];
  const res = Engine.useSkill(game, 'player', 'huangtian', ['give-shan'], {});
  assert.equal(res.ok, true, res.message);
  assert.ok(game.ally2.hand.some((x) => x.id === 'give-shan'), '闪进入第四席主公张角手牌');
});

// ───── L2: 玩家阵亡后对局继续 — 回合环续跑至终局可达 ─────

test('L2: 玩家反贼阵亡 → 对局继续, 回合环跳过亡席, AI 续跑至终局', () => {
  const game = Engine.newGame({
    seed: 16106, seats: SEATS4.slice(),
    roles: rotatedRoles(SEATS4, '反贼'),
    startWithFirstTurn: false,
  });
  // 玩家=反贼时 4p 轮转: player=反, enemy=忠, ally=内, ally2=主。
  assert.equal(game.roles.ally2, '主公');
  reset(game, { turn: 'ally2' });
  game.deck = Array.from({ length: 30 }, (_, i) => c('shan', { id: 'l2-d' + i }));
  game.player.hp = 1;
  game.player.hand = [];
  game.ally2.hand = [c('sha', { id: 'lord-kills-rebel' })];
  game.ally2.equipment.horseMinus = c('minus_horse', { id: 'l2-horse' });
  for (const seat of game.seats) game[seat].skillPreferences.dying = 'decline';
  const res = Engine.playCard(game, 'ally2', 'lord-kills-rebel', { target: 'player' });
  assert.equal(res.ok, true, res.message);
  assert.ok(game.player.hp <= 0, '玩家反贼阵亡');
  assert.notEqual(game.phase, 'gameover', '另一威胁 (内奸) 存活 → 对局继续');
  assert.ok(game.log.some((l) => l.includes('击杀反贼，摸三张牌')), '击杀玩家反贼的奖励发放');
  // 回合环跳过亡席玩家: 环 [P,E,A,A2], ally2 的下家越过亡席 P → enemy。
  assert.equal(Engine.nextSeat(game, 'ally2'), 'enemy', 'nextSeat 跳过亡席玩家');
});

test('L2: 玩家阵亡后 nextSeat/startTurn 跳过亡席, 全 AI 推进到终局 (soak-lite)', () => {
  const game = Engine.newGame({
    seed: 16107, seats: SEATS4.slice(),
    roles: rotatedRoles(SEATS4, '反贼'),
    startWithFirstTurn: true,
  });
  // 全席 auto 偏好 (玩家等价 AI), 直接把玩家打死后续跑。
  for (const seat of game.seats) {
    game[seat].skillPreferences = {
      dying: 'auto', wuxieResponse: 'auto', shanResponse: 'auto',
      shaDuelResponse: 'auto', jijiangAid: 'decline', hujiaAid: 'decline',
    };
  }
  game.player.hp = 0;
  game.player.hand.splice(0).forEach((card) => game.discard.push(card));
  assert.equal(Engine.nextSeat(game, 'ally2'), 'enemy', 'nextSeat 环跳过亡席玩家 (ally2→enemy 经 player)');
  let guard = 0;
  let leaks = 0;
  while (game.phase !== 'gameover' && guard < 400) {
    guard += 1;
    if (game.pendingChoice) {
      leaks += 1;
      Engine.resolvePendingChoice(game, { decline: true });
      continue;
    }
    assert.notEqual(game.turn, 'player', '亡席玩家不再获得回合');
    const r = Engine.runAITurn(game, game.turn);
    assert.ok(r && r.ok, 'runAITurn ok: ' + (r && r.message));
  }
  assert.equal(game.phase, 'gameover', '玩家阵亡后 AI 续跑至终局可达 (guard=' + guard + ', leaks=' + leaks + ')');
  assert.ok(['lordSide', 'rebelSide', 'renegade'].includes(game.winner), '终局归属合法: ' + game.winner);
});
