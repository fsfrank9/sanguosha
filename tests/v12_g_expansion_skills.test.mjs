import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

const G_SKILLS = ['shensu', 'jushou', 'liegong', 'kuanggu', 'hongyan', 'buqu', 'leiji', 'guidao', 'mengjin', 'qiangxi'];

test('v12 G status: expansion skill pool reaches 50 implemented skills', () => {
  assert.equal(Engine.IMPLEMENTED_SKILL_IDS.length, 50);
  for (const skillId of G_SKILLS) assert.ok(Engine.IMPLEMENTED_SKILL_IDS.includes(skillId), `${skillId} should be implemented`);
  assert.ok(Engine.ACTIVE_SKILL_IDS.includes('shensu'));
  assert.ok(Engine.ACTIVE_SKILL_IDS.includes('qiangxi'));
});

test('神速: 夏侯渊出牌阶段可视为使用一张杀', () => {
  const game = Engine.newGame({ seed: 12001, playerHero: 'xiahouyuan', enemyHero: 'caocao' });
  game.turn = 'player';
  game.phase = 'play';
  game.enemy.hand = [];
  const result = Engine.useSkill(game, 'player', 'shensu');
  assert.equal(result.ok, true);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
  assert.match(game.log.join('\n'), /发动【神速】/);
});

test('据守: 曹仁结束阶段摸三张并翻面', () => {
  const game = Engine.newGame({ seed: 12002, playerHero: 'caoren', enemyHero: 'caocao' });
  game.turn = 'player';
  game.phase = 'finish';
  const before = game.player.hand.length;
  Engine.endTurn(game);
  assert.equal(game.player.hand.length - before, 3);
  assert.equal(game.player.turnedOver, true);
  assert.match(game.log.join('\n'), /发动【据守】/);
});

test('烈弓: 黄忠杀满足手牌条件时目标不能出闪', () => {
  const game = Engine.newGame({ seed: 12003, playerHero: 'huangzhong', enemyHero: 'caocao' });
  game.turn = 'player';
  game.phase = 'play';
  game.player.hand = [c('sha', { id: 'liegong-sha' })];
  game.enemy.hand = [c('shan', { id: 'shan-only' })];
  const result = Engine.playCard(game, 'player', 'liegong-sha');
  assert.equal(result.ok, true);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
  assert.match(game.log.join('\n'), /【烈弓】生效/);
});

test('狂骨: 魏延造成伤害后回复一点体力', () => {
  const game = Engine.newGame({ seed: 12004, playerHero: 'weiyan', enemyHero: 'caocao' });
  game.turn = 'player';
  game.phase = 'play';
  game.player.hp = game.player.maxHp - 1;
  game.player.hand = [c('sha', { id: 'kuanggu-sha' })];
  game.enemy.hand = [];
  Engine.playCard(game, 'player', 'kuanggu-sha');
  assert.equal(game.player.hp, game.player.maxHp);
  assert.match(game.log.join('\n'), /发动【狂骨】/);
});

test('红颜: 小乔黑桃判定牌视为红桃', () => {
  const game = Engine.newGame({ seed: 12005, playerHero: 'xiaoqiao', enemyHero: 'caocao' });
  game.turn = 'player';
  game.player.judgeArea = [c('lebusishu', { id: 'lebu' })];
  game.deck = [c('sha', { id: 'hongyan-judge', suit: 'spade', color: 'black', rank: 'A' })];
  Engine.startTurn(game, 'player');
  assert.notEqual(game.player.skipPlay, true);
  assert.match(game.log.join('\n'), /【红颜】生效/);
  assert.match(game.log.join('\n'), /判定：【杀】heart A/);
});

test('雷击: 张角打出闪后黑桃判定对对手造成雷电伤害', () => {
  const game = Engine.newGame({ seed: 12006, playerHero: 'zhangjiao', enemyHero: 'caocao' });
  game.turn = 'enemy';
  game.phase = 'play';
  game.player.skillPreferences.shanResponse = 'auto';
  game.player.hand = [c('shan', { id: 'leiji-shan' })];
  game.enemy.hand = [c('sha', { id: 'leiji-sha' })];
  game.deck = [c('sha', { id: 'leiji-judge', suit: 'spade', color: 'black', rank: 'A' })];
  Engine.playCard(game, 'enemy', 'leiji-sha');
  assert.equal(game.enemy.hp, game.enemy.maxHp - 2);
  assert.match(game.log.join('\n'), /发动【雷击】/);
});

test('鬼道: 张角用黑色牌替换判定牌', () => {
  const game = Engine.newGame({ seed: 12007, playerHero: 'zhangjiao', enemyHero: 'caocao' });
  game.turn = 'enemy';
  game.enemy.judgeArea = [c('lebusishu', { id: 'lebu' })];
  game.player.hand = [c('shan', { id: 'guidao-card', suit: 'club', color: 'black', rank: '2' })];
  game.deck = [c('sha', { id: 'red-judge', suit: 'heart', color: 'red', rank: 'A' })];
  Engine.startTurn(game, 'enemy');
  assert.equal(game.phase, 'discard');
  assert.match(game.log.join('\n'), /发动【鬼道】/);
  assert.match(game.log.join('\n'), /跳过出牌阶段/);
});

test('不屈: 周泰濒死无人救援后亮出唯一点数不死亡', () => {
  const game = Engine.newGame({ seed: 12008, playerHero: 'zhoutai', enemyHero: 'caocao' });
  game.turn = 'enemy';
  game.phase = 'play';
  game.player.hp = 1;
  game.player.hand = [];
  game.enemy.hand = [c('sha', { id: 'buqu-sha' })];
  game.deck = [c('tao', { id: 'buqu-card', rank: '7' })];
  Engine.playCard(game, 'enemy', 'buqu-sha');
  assert.notEqual(game.phase, 'gameover');
  assert.deepEqual(game.player.buquCards.map((card) => card.id), ['buqu-card']);
  assert.match(game.log.join('\n'), /发动【不屈】/);
});

test('猛进: 庞德的杀被闪抵消后弃置目标一张牌', () => {
  const game = Engine.newGame({ seed: 12009, playerHero: 'pangde', enemyHero: 'caocao' });
  game.turn = 'player';
  game.phase = 'play';
  game.player.hand = [c('sha', { id: 'mengjin-sha' })];
  game.enemy.hand = [c('shan', { id: 'mengjin-shan' }), c('tao', { id: 'mengjin-tao' })];
  Engine.playCard(game, 'player', 'mengjin-sha');
  assert.equal(game.enemy.hand.length, 0);
  assert.match(game.log.join('\n'), /发动【猛进】/);
});

test('强袭: 典韦出牌阶段失去体力对对手造成一点伤害', () => {
  const game = Engine.newGame({ seed: 12010, playerHero: 'dianwei', enemyHero: 'caocao' });
  game.turn = 'player';
  game.phase = 'play';
  const result = Engine.useSkill(game, 'player', 'qiangxi');
  assert.equal(result.ok, true);
  assert.equal(game.player.hp, game.player.maxHp - 1);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
  assert.match(game.log.join('\n'), /发动【强袭】|失去 1 点体力发动【强袭】/);
});
