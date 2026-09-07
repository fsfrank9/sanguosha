import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { makeStartGameViaUI } from './helpers/ui-game.mjs';
import { test, runTests } from './helpers/harness.mjs';
import { Engine, c } from './helpers/load-engine.mjs';
const dom = installFakeDom();
await import('../src/ui/dom-adapter.js');
const UI = window.SanguoshaUI;
const $ = dom.$;
const start = makeStartGameViaUI($, UI);
const red = (type, id) => c(type, { id, suit: 'heart', color: 'red', rank: '6' });
function setup(player, enemy) {
  const game = start(player, enemy);
  game.log = []; game.discard = [];
  game.deck = Array.from({ length: 10 }, (_, i) => red('tao', 'yd-' + i));
  for (const seat of ['player', 'enemy']) game[seat].flags = {};
  return game;
}

for (const challenge of [false, true]) {
  test('Y UI: AI 声明闪后玩家点击' + (challenge ? '质疑' : '不质疑') + '，原杀只结算一次', () => {
    const game = setup('liubei', 'yuji');
    game.player.hand = [red('sha', 'attack')];
    game.enemy.hand = [red('wuzhong', 'covered')];
    const hp = game.enemy.hp;
    Engine.playCard(game, 'player', 'attack'); UI.render();
    assert.equal($('guhuoChallengePanel').hidden, false);
    assert.equal($('shanResponsePanel').hidden, true, '玩家不会替 AI 选响应牌');
    assert.equal(game.enemy.hp, hp);
    $(challenge ? 'guhuoChallengeBtn' : 'guhuoPassBtn').click();
    assert.equal(game.enemy.hp, hp - (challenge ? 1 : 0));
    assert.equal(game.pendingChoice, null);
    assert.equal($('guhuoChallengePanel').hidden, true);
    assert.equal(game.discard.filter(card => card.id === 'attack').length, 1);
  });
}

test('Y UI: 双闪的两个雷击窗口与闪窗口依次出现，候选不复用旧牌', () => {
  const game = setup('zhangjiao', 'lvbu');
  game.turn = 'enemy';
  Object.assign(game.player.skillPreferences, { leiji: 'ask', shanResponse: 'ask', guidao: 'decline' });
  game.player.hand = [red('shan', 'first'), red('shan', 'second')];
  game.enemy.hand = [red('sha', 'attack')];
  Engine.playCard(game, 'enemy', 'attack'); UI.render();
  $('shanResponseChoices').dispatchClick({ 'data-shan-card-id': 'first' });
  $('handConfirmBtn').click();
  assert.equal(game.pendingChoice.kind, 'leiji-ask');
  assert.equal($('shanResponsePanel').hidden, true);
  $('leijiDeclineBtn').click();
  assert.equal(game.pendingChoice.kind, 'shan-response');
  assert.match($('shanResponseChoices').innerHTML, /data-shan-card-id="second"/);
  assert.doesNotMatch($('shanResponseChoices').innerHTML, /data-shan-card-id="first"/);
  $('shanResponseChoices').dispatchClick({ 'data-shan-card-id': 'second' });
  $('handConfirmBtn').click();
  assert.equal(game.pendingChoice.kind, 'leiji-ask');
  $('leijiDeclineBtn').click();
  assert.equal(game.pendingChoice, null);
  assert.equal(game.player.hp, game.player.maxHp);
});

test('Y UI: 借刀闪窗之后的银月窗不再显示已消费的闪', () => {
  const game = setup('liubei', 'sunquan');
  game.player.hand = [red('jiedao', 'attack'), red('shan', 'only-shan')];
  game.enemy.hand = [c('sha', { id: 'black-sha', suit: 'spade', color: 'black' })];
  game.enemy.equipment.weapon = c('yinyue', { id: 'weapon' });
  Engine.playCard(game, 'player', 'attack', { target: 'enemy' }); UI.render();
  $('shanResponseChoices').dispatchClick({ 'data-shan-card-id': 'only-shan' });
  $('handConfirmBtn').click();
  assert.equal(game.pendingChoice.kind, 'yinyue-response');
  assert.doesNotMatch($('shanResponseChoices').innerHTML, /data-shan-card-id="only-shan"/);
  $('shanResponseDeclineBtn').click();
  assert.equal(game.pendingChoice, null);
  assert.equal(game.player.hp, game.player.maxHp - 1);
});

await runTests();
