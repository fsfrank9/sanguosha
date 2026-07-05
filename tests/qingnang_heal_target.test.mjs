import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

// v11 A1: 引擎变更调用已接入全局牌守恒断言 (assertCardConservation)。

const root = path.resolve(import.meta.dirname, '..');
const heroesSrc = fs.readFileSync(path.join(root, 'src/data/heroes.js'), 'utf8');

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function buildGame(playerHero, enemyHero, seed) {
  const game = Engine.newGame({ seed: seed || 7702, playerHero, enemyHero, startWithFirstTurn: true });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].flags = game[actor].flags || {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp;
  }
  game.turn = 'player';
  game.phase = 'play';
  return game;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v8 PR-C4: SKILL_METADATA 已注册 qingnang (playPhase / oncePerTurn / discardOwn 1)', () => {
  assert.match(heroesSrc, /qingnang:\s*\{[^}]*trigger:\s*'playPhase'/);
  assert.match(heroesSrc, /qingnang:\s*\{[^}]*frequency:\s*'oncePerTurn'/);
  assert.match(heroesSrc, /qingnang:\s*\{[^}]*cost:\s*\{\s*type:\s*'discardOwn'/);
});

test('v8 PR-C4: 华佗 自救：弃 1 手牌 → 自己回 1 hp', () => {
  const game = buildGame('huatuo', 'caocao');
  game.player.hp = 2;
  game.player.hand = [c('sha', { id: 'qn-cost' })];

  const result = assertCardConservation(game, () => Engine.useSkill(game, 'player', 'qingnang', ['qn-cost'], { target: 'player' }));

  assert.equal(result.ok, true, '青囊成功');
  assert.equal(game.player.hp, 3, '自身 hp 2 → 3');
  assert.equal(game.player.hand.length, 0, '弃牌 cost 离手');
  assert.ok(game.discard.some((card) => card.id === 'qn-cost'), '弃置牌进 discard');
  assert.equal(game.player.flags.qingnangUsed, true, 'oncePerTurn 标记');
});

test('v8 PR-C4: 每回合限一次：第二次失败', () => {
  const game = buildGame('huatuo', 'caocao');
  game.player.hp = 1;
  game.player.hand = [c('sha', { id: 'qn-1' }), c('sha', { id: 'qn-2' })];

  const r1 = assertCardConservation(game, () => Engine.useSkill(game, 'player', 'qingnang', ['qn-1'], { target: 'player' }));
  assert.equal(r1.ok, true);
  assert.equal(game.player.hp, 2);

  // 再受伤 → 第二次发动
  game.player.hp = 1;
  const r2 = assertCardConservation(game, () => Engine.useSkill(game, 'player', 'qingnang', ['qn-2'], { target: 'player' }));
  assert.equal(r2.ok, false, '已用过, 失败');
  assert.match(r2.message, /每回合限一次/);
  assert.equal(game.player.hp, 1, 'hp 未变');
});

test('v8 PR-C4: 目标未受伤 → 失败 (满血不能回血)', () => {
  const game = buildGame('huatuo', 'caocao');
  // player 满血, enemy 满血
  game.player.hand = [c('sha', { id: 'qn-fail' })];
  const result = assertCardConservation(game, () => Engine.useSkill(game, 'player', 'qingnang', ['qn-fail'], { target: 'player' }));
  assert.equal(result.ok, false);
  assert.match(result.message, /未受伤|没有已受伤/);
  assert.ok(game.player.hand.some((card) => card.id === 'qn-fail'), '失败时手牌未弃');
});

test('v8 PR-C4: 救助对方：选 enemy 目标 → enemy 回 1 hp', () => {
  const game = buildGame('huatuo', 'caocao');
  game.player.hand = [c('sha', { id: 'qn-heal-enemy' })];
  game.enemy.hp = 1;

  const result = assertCardConservation(game, () => Engine.useSkill(game, 'player', 'qingnang', ['qn-heal-enemy'], { target: 'enemy' }));

  assert.equal(result.ok, true, '青囊救对方成功');
  assert.equal(game.enemy.hp, 2, 'enemy hp 1 → 2');
  assert.equal(game.player.hand.length, 0);
});

test('v8 PR-C4: 非华佗 (无 qingnang 技能) 调用失败', () => {
  const game = buildGame('liubei', 'caocao');
  game.player.hp = 2;
  game.player.hand = [c('sha', { id: 'qn-no-skill' })];

  const result = assertCardConservation(game, () => Engine.useSkill(game, 'player', 'qingnang', ['qn-no-skill'], { target: 'player' }));

  assert.equal(result.ok, false, '没有 qingnang 技能');
  assert.equal(game.player.hp, 2, 'hp 未变');
  assert.equal(game.player.hand.length, 1, '手牌未弃');
});

test('v8 PR-C4: 必须在出牌阶段 (play) → 准备阶段 fail', () => {
  const game = buildGame('huatuo', 'caocao');
  game.player.hp = 2;
  game.player.hand = [c('sha', { id: 'qn-bad-phase' })];
  game.phase = 'prepare';

  const result = assertCardConservation(game, () => Engine.useSkill(game, 'player', 'qingnang', ['qn-bad-phase'], { target: 'player' }));

  assert.equal(result.ok, false);
  assert.equal(game.player.hp, 2);
});

test('v8 PR-C4: 必须是自己的回合 (game.turn === actor)', () => {
  const game = buildGame('huatuo', 'caocao');
  game.player.hp = 2;
  game.player.hand = [c('sha', { id: 'qn-bad-turn' })];
  game.turn = 'enemy';

  const result = assertCardConservation(game, () => Engine.useSkill(game, 'player', 'qingnang', ['qn-bad-turn'], { target: 'player' }));

  assert.equal(result.ok, false);
  assert.equal(game.player.hp, 2);
});

test('v8 PR-C4: 未指定 target 时默认对方受伤优先, 否则自身', () => {
  // case A: 对方受伤, 默认 target = enemy
  const gA = buildGame('huatuo', 'caocao');
  gA.enemy.hp = 1;
  gA.player.hand = [c('sha', { id: 'qn-default-1' })];
  const rA = assertCardConservation(gA, () => Engine.useSkill(gA, 'player', 'qingnang', ['qn-default-1']));
  assert.equal(rA.ok, true);
  assert.equal(gA.enemy.hp, 2, '对方受伤 → 默认救对方');

  // case B: 仅自身受伤, 默认 target = self
  const gB = buildGame('huatuo', 'caocao');
  gB.player.hp = 2;
  gB.player.hand = [c('sha', { id: 'qn-default-2' })];
  const rB = assertCardConservation(gB, () => Engine.useSkill(gB, 'player', 'qingnang', ['qn-default-2']));
  assert.equal(rB.ok, true);
  assert.equal(gB.player.hp, 3, '仅自身受伤 → 默认救自己');
});

test('v8 PR-C4: 回合切换后 qingnangUsed 复位 → 下回合可再用', () => {
  const game = buildGame('huatuo', 'caocao');
  game.player.hp = 2;
  game.player.hand = [c('sha', { id: 'qn-t1' })];

  const r1 = assertCardConservation(game, () => Engine.useSkill(game, 'player', 'qingnang', ['qn-t1'], { target: 'player' }));
  assert.equal(r1.ok, true);
  assert.equal(game.player.flags.qingnangUsed, true);

  // 推进到 end + 下一回合 start
  game.deck = [c('tao', { id: 'pad-1' }), c('tao', { id: 'pad-2' })];
  assertCardConservation(game, () => Engine.endTurn(game, 'player'));
  assertCardConservation(game, () => Engine.startTurn(game, 'player'));

  assert.equal(game.player.flags.qingnangUsed, false, '回合切换后标记复位');

  game.player.hp = 2;
  const card2 = c('sha', { id: 'qn-t2' });
  game.player.hand.push(card2);
  const r2 = assertCardConservation(game, () => Engine.useSkill(game, 'player', 'qingnang', ['qn-t2'], { target: 'player' }));
  assert.equal(r2.ok, true, '下回合可再用');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
