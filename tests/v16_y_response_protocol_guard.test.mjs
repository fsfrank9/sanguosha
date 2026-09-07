import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Engine, c } from './helpers/load-engine.mjs';
import { test, runTests } from './helpers/harness.mjs';

const read = file => fs.readFileSync(new URL('../src/engine/' + file, import.meta.url), 'utf8');
const sources = ['sha-flow.js', 'tricks.js', 'damage-dying.js'].map(read).join('\n');

test('Y-G1(b): 五条链注册统一协议且 shaResponse 窗口不在域内手写', () => {
  for (const kind of ['sha', 'duel', 'aoe', 'dying', 'wuxie']) {
    assert.match(sources, new RegExp("flows\\.register\\('" + kind + "'"));
    assert.match(sources, new RegExp("flows\\.run\\(game, '" + kind + "'"));
  }
  assert.doesNotMatch(read('sha-flow.js'), /game\.pauseState\.shaResponse\s*=\s*\{/);
});

for (const dispatcher of ['resolvePendingChoice', 'resolveResponseChoice']) {
  test('Y 协议: JSON 复制暂停局面后，经 ' + dispatcher + ' 续跑不会重复支付双闪', () => {
    const source = Engine.newGame({ seed: 160123, playerHero: 'liubei', enemyHero: 'lvbu' });
    source.turn = 'enemy'; source.phase = 'play'; source.pendingChoice = null;
    source.pendingChoiceQueue = []; source.pauseState = {};
    source.player.skillPreferences.shanResponse = 'ask';
    source.player.hand = [c('shan', { id: 'first' }), c('shan', { id: 'second' })];
    source.enemy.hand = [c('sha', { id: 'attack' })];
    Engine.playCard(source, 'enemy', 'attack');
    const game = JSON.parse(JSON.stringify(source));
    game.random = () => 0.8;
    assert.equal(Engine[dispatcher](game, { cardId: 'first' }).ok, true);
    assert.equal(game.pauseState.shaResponseFlow.shanRemaining, 1);
    assert.equal(game.pendingChoice.kind, 'shan-response');
    assert.equal(Engine[dispatcher](game, { cardId: 'second' }).ok, true);
    assert.equal(game.pendingChoice, null);
    assert.equal(game.pauseState.responseFlows.length, 0);
    assert.equal(game.player.hp, game.player.maxHp);
    assert.equal(source.player.hand.length, 2, '复制品消费不污染原局');
  });
}

test('Y 协议: 非法质疑声明保持原窗口和帧进度', () => {
  const game = Engine.newGame({ seed: 160124, playerHero: 'yuji', enemyHero: 'lvbu' });
  game.turn = 'enemy'; game.phase = 'play'; game.pendingChoice = null;
  game.pendingChoiceQueue = []; game.pauseState = {};
  game.player.skillPreferences.shanResponse = 'ask';
  game.player.hand = [c('shan', { id: 'held' })];
  game.enemy.hand = [c('sha', { id: 'attack' })];
  Engine.playCard(game, 'enemy', 'attack');
  const pending = game.pendingChoice;
  assert.equal(Engine.resolvePendingChoice(game, { guhuo: { cardId: 'held', declareType: 'tao' } }).ok, false);
  assert.equal(game.pendingChoice, pending);
  assert.equal(game.pauseState.shaResponseFlow.shanRemaining, 2);
  assert.ok(!game.player.flags.guhuoUsedThisTurn);
});

await runTests();
