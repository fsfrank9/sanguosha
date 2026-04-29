import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const htmlPath = path.resolve(import.meta.dirname, '../index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script id="game-engine"[^>]*>([\s\S]*?)<\/script>/);
assert.ok(match, 'index.html should contain <script id="game-engine">');

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox, { filename: 'game-engine.js' });
const Engine = sandbox.window.SanguoshaEngine;
assert.ok(Engine, 'engine should expose window.SanguoshaEngine');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function ids(cards) {
  return Array.from(cards).map((card) => card.id);
}

test('借刀杀人：目标不出杀时武器进入使用者手牌而不是直接装备', () => {
  const game = Engine.newGame({ seed: 701, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.hand = [c('jiedao', { id: 'jiedao-fix' })];
  game.player.equipment.weapon = null;
  game.enemy.hand = [];
  game.enemy.equipment.weapon = c('zhuge', { id: 'borrowed-zhuge' });

  const result = Engine.playCard(game, 'player', 'jiedao-fix');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.equipment.weapon, null);
  assert.equal(game.player.equipment.weapon, null, 'weapon should not auto-equip');
  assert.ok(ids(game.player.hand).includes('borrowed-zhuge'), 'borrowed weapon should be in hand for later choice');
});

test('铁索连环：支持重铸，重铸只弃置铁索并摸一张，不横置任何角色', () => {
  const game = Engine.newGame({ seed: 702, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.hand = [c('tiesuo', { id: 'tiesuo-recast' })];
  game.deck = [c('sha', { id: 'recast-draw' })];
  game.player.chained = false;
  game.enemy.chained = false;

  const result = Engine.playCard(game, 'player', 'tiesuo-recast', { mode: 'recast' });

  assert.equal(result.ok, true, result.message);
  assert.deepEqual(ids(game.player.hand), ['recast-draw']);
  assert.equal(game.player.chained, false);
  assert.equal(game.enemy.chained, false);
  assert.ok(ids(game.discard).includes('tiesuo-recast'));
});

test('铁索连环：支持选择单人或两人横置/重置，并暴露状态文案', () => {
  const game = Engine.newGame({ seed: 703, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.hand = [c('tiesuo', { id: 'tiesuo-chain' })];

  const result = Engine.playCard(game, 'player', 'tiesuo-chain', { mode: 'chain', targets: ['player', 'enemy'] });

  assert.equal(result.ok, true, result.message);
  assert.equal(game.player.chained, true);
  assert.equal(game.enemy.chained, true);
  assert.equal(typeof Engine.getActorStatus, 'function', 'getActorStatus should be exported for UI status badges');
  assert.match(Engine.getActorStatus(game, 'player'), /铁索|横置/);
  assert.match(Engine.getActorStatus(game, 'enemy'), /铁索|横置/);
});

test('一级选将界面与二级游戏界面分离，并提供随机按钮', () => {
  assert.match(html, /id="setupScreen"/, 'setup screen should exist before gameplay');
  assert.match(html, /id="startGameBtn"/, 'setup screen should have a start button');
  assert.match(html, /id="randomPlayerHeroBtn"/, 'player random hero button should exist');
  assert.match(html, /id="randomEnemyHeroBtn"/, 'enemy random hero button should exist');
  assert.match(html, /id="duelTable"[^>]*hidden/, 'game table should be hidden until heroes are confirmed');
  assert.ok(html.indexOf('id="setupScreen"') < html.indexOf('id="duelTable"'), 'setup should be the first-level screen');
});

test('双方英雄池一致且 UI 有去重逻辑，禁止同英雄对战', () => {
  const playerSelect = html.match(/<select id="playerHeroSelect"[\s\S]*?<\/select>/)?.[0] || '';
  const enemySelect = html.match(/<select id="enemyHeroSelect"[\s\S]*?<\/select>/)?.[0] || '';
  const playerOptions = Array.from(playerSelect.matchAll(/value="([^"]+)"/g)).map((m) => m[1]).sort();
  const enemyOptions = Array.from(enemySelect.matchAll(/value="([^"]+)"/g)).map((m) => m[1]).sort();
  assert.deepEqual(playerOptions, enemyOptions, 'player and enemy hero pools should be identical');
  assert.ok(playerOptions.length >= 10, 'both sides should have the full classic hero pool');
  assert.match(html, /function ensureDistinctHeroes/, 'UI should enforce different heroes');
  assert.match(html, /option\.disabled = option\.value === otherValue/, 'same hero option should be disabled on the opposite side');
});

test('主游戏界面应按一屏布局约束页面滚动，并提供铁索选择控件和状态样式', () => {
  assert.match(html, /body[\s\S]*overflow:\s*hidden/, 'page-level scrolling should be disabled for one-screen gameplay');
  assert.match(html, /\.duel-table[\s\S]*height:\s*calc\(100vh/, 'duel table should be constrained to viewport height');
  assert.match(html, /\.tiesuo-mode-panel\[hidden\]/, 'hidden Tiesuo chooser must really disappear before selecting a Tiesuo card');
  assert.match(html, /id="tiesuoModePanel"/, 'UI should expose Tiesuo action choices');
  assert.match(html, /id="tiesuoRecastBtn"/, 'Tiesuo recast button should exist');
  assert.match(html, /id="tiesuoChainBothBtn"/, 'Tiesuo chain-both button should exist');
  assert.match(html, /chain-status/, 'UI should include chained status styling');
});

console.log('\nv2.7 regression tests passed.');
