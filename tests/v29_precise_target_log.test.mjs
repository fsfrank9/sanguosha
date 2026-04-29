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

test('顺手牵羊/过河拆桥应暴露可精确选择的目标牌列表', () => {
  assert.equal(typeof Engine.getTargetZoneCards, 'function', 'engine should expose getTargetZoneCards(game, targetActor, zone)');

  const game = Engine.newGame({ seed: 901, playerHero: 'liubei', enemyHero: 'caocao' });
  game.enemy.hand = [c('sha', { id: 'enemy-hand-1' }), c('shan', { id: 'enemy-hand-2' })];
  game.enemy.equipment.weapon = c('zhuge', { id: 'enemy-weapon' });
  game.enemy.equipment.armor = c('renwang', { id: 'enemy-armor' });
  game.enemy.judgeArea = [c('lebusishu', { id: 'enemy-lebu' }), c('bingliang', { id: 'enemy-bing' })];

  assert.deepEqual(ids(Engine.getTargetZoneCards(game, 'enemy', 'hand').map((entry) => entry.card)), ['enemy-hand-1', 'enemy-hand-2']);
  assert.deepEqual(ids(Engine.getTargetZoneCards(game, 'enemy', 'equipment').map((entry) => entry.card)), ['enemy-weapon', 'enemy-armor']);
  assert.deepEqual(ids(Engine.getTargetZoneCards(game, 'enemy', 'judge').map((entry) => entry.card)), ['enemy-lebu', 'enemy-bing']);
});

test('玩家 UI 选择顺手/过拆目标区后必须继续选择具体目标牌，而不是随机结算', () => {
  assert.match(html, /id="targetCardChoices"/, 'target panel should include a concrete target-card choice area');
  assert.match(html, /function showTargetCardChoices\(zone\)/, 'UI should render concrete card choices after selecting a zone');
  assert.match(html, /data-target-card-id/, 'target card buttons should carry exact card ids');
  assert.match(html, /function resolveTargetCard\(zone,\s*targetCardId\)/, 'UI should resolve a specific target card');
  assert.match(html, /targetCardId:\s*targetCardId/, 'Engine.playCard should receive targetCardId from the clicked target card');
  assert.doesNotMatch(html, /guohe:[\s\S]*?随机弃置对方一张手牌/, 'Guohe copy should not describe a random hand discard');
  assert.doesNotMatch(html, /shunshou:[\s\S]*?随机获得对方一张手牌/, 'Shunshou copy should not describe a random hand steal');

  const resolveZoneMatch = html.match(/function resolveTargetZone\(zone\) \{[\s\S]*?\n      \}/);
  assert.ok(resolveZoneMatch, 'resolveTargetZone should exist');
  assert.doesNotMatch(
    resolveZoneMatch[0],
    /Engine\.playCard\(game, 'player', pendingTargetCardId, \{ targetZone: zone \}\)/,
    'selecting only a zone must not immediately play a random/first card'
  );
});

test('战报侧栏底部必须预留可见空间，并在布局完成后滚到最后一句', () => {
  assert.match(html, /\.side-log-panel \.log\s*\{[\s\S]*padding-bottom:\s*(?:18|20|24|28|32)px/, 'log scroller needs bottom padding so the last entry is not clipped');
  assert.match(html, /\.side-log-panel \.log\s*\{[\s\S]*scroll-padding-bottom:\s*(?:18|20|24|28|32)px/, 'log scroller needs scroll-padding-bottom for last-entry alignment');
  assert.match(html, /function scrollLogToBottom\(\)/, 'rendering should use a dedicated scrollLogToBottom helper');
  assert.match(html, /lastElementChild\.scrollIntoView\(\{\s*block:\s*'end'/, 'latest log entry should be scrolled fully into view after render');
});

console.log('\nv2.9 precise target/log tests passed.');
