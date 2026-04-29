import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const htmlPath = path.resolve(import.meta.dirname, '../index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script id="game-engine"[^>]*>([\s\S]*?)<\/script>/);
assert.ok(match, 'index.html should contain <script id="game-engine">');

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox, { filename: 'game-engine.js' });
const Engine = sandbox.window.SanguoshaEngine;
assert.ok(Engine, 'game engine should expose window.SanguoshaEngine');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test('engine exposes advanced CARD_CATALOG with standard and military families', () => {
  assert.ok(Engine.CARD_CATALOG, 'CARD_CATALOG should be exposed');
  const required = [
    'sha', 'fire_sha', 'thunder_sha', 'shan', 'tao', 'jiu',
    'wuzhong', 'juedou', 'guohe', 'shunshou', 'jiedao', 'taoyuan', 'wugu', 'nanman', 'wanjian', 'wuxie',
    'lebusishu', 'bingliang', 'shandian', 'huogong', 'tiesuo',
    'zhuge', 'qinggang', 'cixiong', 'qinglong', 'zhangba', 'guanshi', 'fangtian', 'qilin',
    'bagua', 'renwang', 'tengjia', 'baiyin', 'minus_horse', 'plus_horse'
  ];
  for (const key of required) {
    assert.ok(Engine.CARD_CATALOG[key], `missing ${key}`);
    assert.ok(Engine.CARD_CATALOG[key].name, `${key} should have display name`);
    assert.ok(Engine.CARD_CATALOG[key].family, `${key} should have family`);
  }
});

test('engine exposes HERO_CATALOG with classic skill metadata', () => {
  assert.ok(Engine.HERO_CATALOG, 'HERO_CATALOG should be exposed');
  const expected = {
    liubei: '仁德', zhangfei: '咆哮', guanyu: '武圣', zhaoyun: '龙胆',
    sunquan: '制衡', huanggai: '苦肉', caocao: '奸雄', machao: '铁骑',
    zhangliao: '突袭', zhouyu: '英姿', zhugeliang: '空城'
  };
  for (const [heroId, skillName] of Object.entries(expected)) {
    assert.ok(Engine.HERO_CATALOG[heroId], `missing hero ${heroId}`);
    assert.ok(Engine.HERO_CATALOG[heroId].skills.some(skill => skill.name === skillName), `${heroId} should expose ${skillName}`);
  }
});

test('makeTestCard creates deterministic card metadata for tests', () => {
  assert.equal(typeof Engine.makeTestCard, 'function', 'makeTestCard should exist');
  const card = Engine.makeTestCard('fire_sha', { id: 'fixed', suit: 'heart', rank: 'A' });
  assert.equal(card.id, 'fixed');
  assert.equal(card.type, 'fire_sha');
  assert.equal(card.name, '火杀');
  assert.equal(card.suit, 'heart');
  assert.equal(card.rank, 'A');
  assert.equal(card.color, 'red');
  assert.equal(card.family, 'basic');
});

test('newGame accepts advanced hero ids while preserving playable start state', () => {
  const game = Engine.newGame({ seed: 101, playerHero: 'zhangfei', enemyHero: 'caocao' });
  assert.equal(game.player.heroId, 'zhangfei');
  assert.equal(game.enemy.heroId, 'caocao');
  assert.equal(game.player.skills.some(skill => skill.name === '咆哮'), true);
  assert.equal(game.enemy.skills.some(skill => skill.name === '奸雄'), true);
  assert.ok(game.deck.length >= 100, 'deck should use expanded official-style catalog');
  assert.equal(game.player.hand.length, 4);
  assert.equal(game.enemy.hand.length, 4);
});

console.log('\nCatalog tests passed.');
