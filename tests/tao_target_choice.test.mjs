// v13 J0-4 (PR #165 玩家实测缺陷 4): 出牌阶段【桃】收口 — 仅"自己已受伤"
// 可使用且目标恒为自己; 指定他人一律拒绝且牌不离手 (守恒)。濒死救援仍走
// 独立求桃队列 (dying-rescue), 不受影响 (见 dying_flow / jiuyuan_lord_tao)。
// 历史: v7 PR-1 按 gltjk 界限突破变体文本实现过"包括你在内的一名已受伤的
// 角色", v13 按玩家实测反馈收口为标准语义, 分歧记录于 docs/audit/ 三轮纪要。
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function makeGame() {
  const game = Engine.newGame({ seed: 71, startWithFirstTurn: true });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

function dealTao(state, id) {
  const card = { id, type: 'tao', name: '桃', suit: 'heart', color: 'red' };
  state.hand.push(card);
  return card;
}

const tests = [];
function test(name, fn) {
  tests.push([name, fn]);
}

test('J0-4: 自己受伤时可出桃, 目标为自己', () => {
  const game = makeGame();
  game.player.hp = game.player.maxHp - 1;
  dealTao(game.player, 'self-wounded');
  assert.equal(Engine.canPlayCard(game, 'player', game.player.hand[0]).ok, true);
  assert.equal(Engine.playCard(game, 'player', 'self-wounded').ok, true);
  assert.equal(game.player.hp, game.player.maxHp);
  assert.equal(game.enemy.hp, game.enemy.maxHp);
});

test('J0-4: 自己满血时不可出桃 (对手受伤也不行)', () => {
  const game = makeGame();
  game.enemy.hp = game.enemy.maxHp - 2;
  dealTao(game.player, 'self-full');
  const result = Engine.canPlayCard(game, 'player', game.player.hand[0]);
  assert.equal(result.ok, false, '出牌阶段桃限自己已受伤');
  assert.match(result.message, /体力已满/);
});

test('J0-4: 双方满血时不可出桃', () => {
  const game = makeGame();
  dealTao(game.player, 'both-full');
  assert.equal(Engine.canPlayCard(game, 'player', game.player.hand[0]).ok, false);
});

test('J0-4: 显式指定对手为目标被拒绝, 牌退回手牌', () => {
  const game = makeGame();
  game.player.hp = game.player.maxHp - 1;
  game.enemy.hp = game.enemy.maxHp - 2;
  dealTao(game.player, 'cross-heal');
  const result = Engine.playCard(game, 'player', 'cross-heal', { taoTarget: 'enemy' });
  assert.equal(result.ok, false, '出牌阶段桃只能对自己使用');
  assert.equal(game.enemy.hp, game.enemy.maxHp - 2, '对手血量不变');
  assert.equal(game.player.hand.length, 1, '桃退回手牌 (守恒)');
  assert.equal(game.player.hand[0].id, 'cross-heal');
});

test('J0-4: options.target 显式指定自己 → 正常使用', () => {
  const game = makeGame();
  game.player.hp = game.player.maxHp - 2;
  dealTao(game.player, 'explicit-self');
  const result = Engine.playCard(game, 'player', 'explicit-self', { target: 'player' });
  assert.equal(result.ok, true);
  assert.equal(game.player.hp, game.player.maxHp - 1, '回复 1 点');
});

test('J0-4: isLegalCardTarget — 桃对其他座席恒不合法, 对受伤的自己合法', () => {
  const game = makeGame();
  game.player.hp = game.player.maxHp - 1;
  game.enemy.hp = game.enemy.maxHp - 1;
  const tao = dealTao(game.player, 'matrix');
  assert.equal(Engine.isLegalCardTarget(game, 'player', tao, 'player'), true);
  assert.equal(Engine.isLegalCardTarget(game, 'player', tao, 'enemy'), false, '他人受伤也不是合法目标');
  const targets = Engine.legalTargetsForCard(game, 'player', tao);
  assert.deepEqual(targets, ['player'], '合法目标矩阵仅自己');
});

test('J0-4: 满血时 isLegalCardTarget 对自己也不合法', () => {
  const game = makeGame();
  const tao = dealTao(game.player, 'full-matrix');
  assert.equal(Engine.isLegalCardTarget(game, 'player', tao, 'player'), false);
});

for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}
