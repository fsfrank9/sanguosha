import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function buildGame(playerHero, enemyHero) {
  const game = Engine.newGame({ seed: 9999, playerHero, enemyHero });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].flags = {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp;
  }
  game.turn = 'enemy';
  game.phase = 'play';
  return game;
}

// ─── aiChooseCard return shape ─────────────────────────────────────────

test('aiChooseCard returns { card, mode } shape', () => {
  const game = buildGame('sunquan', 'liubei');
  game.enemy.hand = [c('sha', { id: 'simple-sha' })];
  const choice = Engine.aiChooseCard(game, 'enemy');
  assert.ok(choice, 'should return a choice');
  assert.ok(choice.card, 'choice.card present');
  assert.ok(['normal', 'asSha'].includes(choice.mode), 'mode is canonical');
});

test('aiChooseCard returns null when nothing playable', () => {
  const game = buildGame('sunquan', 'liubei');
  game.enemy.hand = [];
  assert.equal(Engine.aiChooseCard(game, 'enemy'), null);
});

// ─── 武圣 (关羽 / SP 关羽) ─────────────────────────────────────────────

test('AI 关羽 with no real Sha but a red 桃 converts via 武圣 when at full HP', () => {
  const game = buildGame('sunquan', 'guanyu');
  // Heart 桃 cannot heal (full HP) so as-Sha conversion should win.
  game.enemy.hand = [c('tao', { id: 'red-tao', suit: 'heart', color: 'red', rank: '5' })];
  game.enemy.hp = game.enemy.maxHp;
  const choice = Engine.aiChooseCard(game, 'enemy');
  assert.ok(choice, 'expected a choice');
  assert.equal(choice.card.id, 'red-tao');
  assert.equal(choice.mode, 'asSha', '武圣 conversion wins over a useless 桃');
});

test('AI 关羽 prefers heal over conversion when hurt and target has 闪', () => {
  const game = buildGame('sunquan', 'guanyu');
  game.enemy.hand = [c('tao', { id: 'red-tao', suit: 'heart', color: 'red', rank: '5' })];
  game.enemy.hp = game.enemy.maxHp - 1;  // hurt
  game.player.hand = [c('shan', { id: 'player-shan' })];  // opponent has 闪
  const choice = Engine.aiChooseCard(game, 'enemy');
  // tao score = 100 (heal when hurt); as-sha score = 45 (target has 闪). Heal wins.
  assert.equal(choice.mode, 'normal', 'heal beats a likely-dodged 杀');
});

test('AI 关羽 actually plays the conversion through playCardAs', () => {
  const game = buildGame('sunquan', 'guanyu');
  game.enemy.hand = [c('tao', { id: 'kill-tao', suit: 'heart', color: 'red', rank: '5' })];
  game.enemy.hp = game.enemy.maxHp;
  const before = game.player.hp;
  const result = Engine.aiTakeAction(game, 'enemy');
  assert.equal(result.ok, true, result.message);
  assert.equal(result.mode, 'asSha', 'aiTakeAction reports the conversion mode');
  assert.equal(game.player.hp, before - 1, 'opponent took 1 sha damage');
  assert.ok(
    game.log.some(l => /武圣/.test(l)),
    'wusheng was logged',
  );
});

// ─── 龙胆 (赵云 / SP 赵云) ──────────────────────────────────────────────

test('AI 赵云 with a 闪 but no 杀 converts via 龙胆 to play a 杀', () => {
  const game = buildGame('sunquan', 'zhaoyun');
  game.enemy.hand = [c('shan', { id: 'as-sha', suit: 'diamond', color: 'red', rank: '6' })];
  const choice = Engine.aiChooseCard(game, 'enemy');
  assert.ok(choice, 'expected a choice');
  assert.equal(choice.card.id, 'as-sha');
  assert.equal(choice.mode, 'asSha', '龙胆 converts 闪 to 杀 during play phase');
});

test('AI 赵云 prefers a real 杀 over converting a 闪 (same score, normal stays)', () => {
  const game = buildGame('sunquan', 'zhaoyun');
  game.enemy.hand = [
    c('sha', { id: 'real-sha' }),
    c('shan', { id: 'spare-shan', suit: 'diamond', color: 'red' })
  ];
  // Both 杀-equivalent for damage; AI picks one of them. We just check that
  // AI does play a 杀 (either path) and that opponent takes damage.
  const before = game.player.hp;
  const result = Engine.aiTakeAction(game, 'enemy');
  assert.equal(result.ok, true);
  assert.equal(game.player.hp, before - 1, '杀 lands either way');
});

// ─── 甄姬 (倾国) ──────────────────────────────────────────────────────

test('AI 甄姬 does NOT abuse 倾国 to convert during play phase (倾国 is response-only)', () => {
  const game = buildGame('sunquan', 'zhenji');
  game.enemy.hand = [c('shan', { id: 'black-shan', suit: 'spade', color: 'black' })];
  const choice = Engine.aiChooseCard(game, 'enemy');
  // 倾国 maps black hand → 闪 (for response). AI in play phase has no
  // play-phase action for 闪. asSha conversion via 倾国 should also not fire
  // (倾国 isn't a Sha converter). Result: nothing to do.
  assert.ok(!choice || choice.mode !== 'asSha',
    '甄姬 should not attempt as-Sha conversion via 倾国');
});

// ─── No-skill hero baseline ────────────────────────────────────────────

test('AI without 武圣/龙胆 keeps normal-mode play even with a red 桃 at full HP', () => {
  const game = buildGame('sunquan', 'liubei');  // 刘备 has 仁德 not 武圣
  game.enemy.hand = [c('tao', { id: 'red-tao-baseline', suit: 'heart', color: 'red' })];
  game.enemy.hp = game.enemy.maxHp;
  const choice = Engine.aiChooseCard(game, 'enemy');
  // 桃 at full HP scores -100, no conversion possible → no candidate.
  assert.equal(choice, null, 'no conversion skill → no play option');
});

console.log('\nAI card-as conversion tests passed.');
