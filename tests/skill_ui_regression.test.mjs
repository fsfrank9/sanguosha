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

function collectSkills() {
  return Object.values(Engine.HERO_CATALOG).flatMap((hero) => (hero.skills || []).map((skill) => ({ hero, skill })));
}

test('engine exposes explicit skill implementation status for every catalog skill', () => {
  assert.ok(Array.isArray(Engine.IMPLEMENTED_SKILL_IDS), 'engine should expose implemented skill ids');
  assert.ok(Array.isArray(Engine.ACTIVE_SKILL_IDS), 'engine should expose clickable active skill ids');
  for (const required of ['zhiheng', 'kurou', 'rende', 'fanjian', 'guanxing']) {
    assert.ok(Engine.ACTIVE_SKILL_IDS.includes(required), `${required} should be a clickable active skill`);
    assert.ok(Engine.IMPLEMENTED_SKILL_IDS.includes(required), `${required} should be marked implemented`);
  }
  for (const required of ['wusheng', 'longdan', 'qingguo', 'paoxiao', 'jianxiong', 'mashu', 'qicai', 'qianxun', 'tieqi', 'tuxi', 'yingzi', 'kongcheng']) {
    assert.ok(Engine.IMPLEMENTED_SKILL_IDS.includes(required), `${required} should be marked implemented/passive`);
    assert.equal(Engine.ACTIVE_SKILL_IDS.includes(required), false, `${required} should not be a clickable active skill`);
  }
  const missingStatus = collectSkills().filter(({ skill }) => !skill.status);
  assert.deepEqual(missingStatus.map(({ hero, skill }) => `${hero.id}:${skill.id}`), [], 'every skill should be annotated as implemented/display/todo');
});

test('unimplemented skills are visible but explicitly disabled as todo, not silently clickable', () => {
  const todoSkills = collectSkills().filter(({ skill }) => skill.status === 'todo');
  assert.ok(todoSkills.length >= 80, 'expanded hero pool should still mark not-yet-implemented skills as todo');
  assert.equal(Engine.HERO_CATALOG.xiahoudun.skills[0].status, 'todo');
  assert.equal(Engine.HERO_CATALOG.liubei.skills.find((skill) => skill.id === 'jijiang').status, 'display');
  assert.match(html, /skill-status-todo/, 'UI should render a todo style for unimplemented skills');
  assert.match(html, /未实现/, 'UI should tell the player a skill is not implemented yet');
});

test('player skill bar uses the engine active-skill list instead of hard-coding only Zhiheng and Kurou', () => {
  assert.match(html, /Engine\.ACTIVE_SKILL_IDS\.indexOf\(skill\.id\) >= 0/, 'UI should ask engine active skill metadata');
  assert.doesNotMatch(html, /skill\.id === 'zhiheng' \|\| skill\.id === 'kurou'/, 'UI must not only enable Zhiheng and Kurou');
  assert.match(html, /function enterCardSkillMode\(skillId\)/, 'UI should use a generic card-select skill mode');
  assert.match(html, /function confirmCardSkill\(\)/, 'UI should confirm card-select skills generically');
  assert.match(html, /rende[\s\S]*fanjian/, 'generic skill config should include Rende and Fanjian');
});

test('engine and UI expose card-as-Sha conversion affordance for Wusheng and Longdan', () => {
  assert.equal(typeof Engine.canPlayCardAs, 'function', 'engine should expose canPlayCardAs for UI previews');
  const guanyu = Engine.newGame({ seed: 7101, playerHero: 'guanyu', enemyHero: 'caocao' });
  guanyu.turn = 'player';
  guanyu.phase = 'play';
  guanyu.player.hand = [c('tao', { id: 'red-tao', suit: 'heart', color: 'red' })];
  guanyu.player.hp = guanyu.player.maxHp;
  assert.equal(Engine.canPlayCardAs(guanyu, 'player', guanyu.player.hand[0], 'sha').ok, true);

  const zhaoyun = Engine.newGame({ seed: 7102, playerHero: 'zhaoyun', enemyHero: 'caocao' });
  zhaoyun.turn = 'player';
  zhaoyun.phase = 'play';
  zhaoyun.player.hand = [c('shan', { id: 'longdan-shan' })];
  assert.equal(Engine.canPlayCardAs(zhaoyun, 'player', zhaoyun.player.hand[0], 'sha').ok, true);

  assert.match(html, /function playerCardAction\(card\)/, 'UI should choose normal play vs skill conversion per card');
  assert.match(html, /Engine\.playCardAs\(game, 'player', cardId, 'sha'\)/, 'UI should call playCardAs when a card is used as Sha');
});

test('dual-use Wusheng cards open an explicit normal-vs-as-Sha choice instead of forcing normal play', () => {
  const guanyu = Engine.newGame({ seed: 7103, playerHero: 'guanyu', enemyHero: 'caocao' });
  guanyu.turn = 'player';
  guanyu.phase = 'play';
  guanyu.player.hp = guanyu.player.maxHp - 1;
  guanyu.player.hand = [c('tao', { id: 'wounded-red-tao', suit: 'heart', color: 'red' })];
  assert.equal(Engine.canPlayCard(guanyu, 'player', guanyu.player.hand[0]).ok, true, 'red Tao should be normally playable when wounded');
  assert.equal(Engine.canPlayCardAs(guanyu, 'player', guanyu.player.hand[0], 'sha').ok, true, 'same red Tao should also be playable as Sha via Wusheng');

  const redHuogong = Engine.newGame({ seed: 7105, playerHero: 'guanyu', enemyHero: 'caocao' });
  redHuogong.turn = 'player';
  redHuogong.phase = 'play';
  redHuogong.player.hand = [c('huogong', { id: 'red-huogong', suit: 'heart', color: 'red' }), c('sha', { id: 'huogong-cost', suit: 'heart', color: 'red' })];
  redHuogong.enemy.hand = [c('shan', { id: 'reveal-heart', suit: 'heart', color: 'red' })];
  assert.equal(Engine.canPlayCard(redHuogong, 'player', redHuogong.player.hand[0]).ok, true, 'red Huogong should be normally playable');
  assert.equal(Engine.canPlayCardAs(redHuogong, 'player', redHuogong.player.hand[0], 'sha').ok, true, 'same red Huogong should also be playable as Sha via Wusheng');

  assert.match(html, /id="conversionModePanel"/, 'UI should expose a conversion choice panel');
  assert.match(html, /function showConversionPanel\(cardId\)/, 'UI should show conversion choice for dual-use cards');
  assert.match(html, /function resolveConversion\(asSha\)/, 'UI should resolve either normal play or as-Sha conversion');
  assert.match(html, /function usePlayerCard\(cardId\)[\s\S]*action && action\.mode === 'choice'[\s\S]*showConversionPanel\(cardId\)[\s\S]*resolveNormalPlayerCard\(cardId\)/, 'conversion choice should be checked before normal special-card routing');
  assert.match(html, /function resolveNormalPlayerCard\(cardId\)/, 'normal branch from the conversion panel should reuse normal card UI routing');
  assert.match(html, /!asSha[\s\S]*resolveNormalPlayerCard\(cardId\)/, 'choosing original card from conversion panel must still open special normal-use panels like Huogong');
  assert.match(html, /当【杀】使用/, 'conversion panel should include an explicit as-Sha action');
});

test('converted Wusheng damage keeps the original physical card for Jianxiong/discard', () => {
  const game = Engine.newGame({ seed: 7106, playerHero: 'guanyu', enemyHero: 'caocao' });
  game.turn = 'player';
  game.phase = 'play';
  game.enemy.hand = [];
  game.player.hand = [c('tao', { id: 'physical-red-tao', suit: 'heart', color: 'red' })];
  const result = Engine.playCardAs(game, 'player', 'physical-red-tao', 'sha');
  assert.equal(result.ok, true, result.message);
  const gained = game.enemy.hand.find((card) => card.id === 'physical-red-tao');
  assert.ok(gained, 'Cao Cao should gain the original converted physical card via Jianxiong');
  assert.equal(gained.type, 'tao', 'Jianxiong should not receive a synthetic Sha');
  assert.equal(gained.name, '桃');
});

test('Guanxing shows top cards in the UI and supports reordering before the skill is consumed', () => {
  assert.equal(typeof Engine.getGuanxingPreview, 'function', 'engine should expose a non-consuming Guanxing preview');
  const game = Engine.newGame({ seed: 7104, playerHero: 'zhugeliang', enemyHero: 'caocao' });
  game.turn = 'player';
  game.phase = 'play';
  game.deck = [
    c('sha', { id: 'bottom' }),
    c('shan', { id: 'top-5' }),
    c('tao', { id: 'top-4' }),
    c('wuzhong', { id: 'top-3' }),
    c('sha', { id: 'top-2' }),
    c('shan', { id: 'top-1' })
  ];
  const preview = Engine.getGuanxingPreview(game, 'player');
  assert.equal(preview.ok, true, preview.message);
  assert.deepEqual(Array.from(preview.cards).map((card) => card.id), ['top-5', 'top-4', 'top-3', 'top-2', 'top-1']);
  assert.equal(game.player.flags.guanxingUsed, undefined, 'preview must not consume Guanxing');
  assert.equal(Engine.useSkill(game, 'player', 'guanxing', [], { orderIds: ['top-1', 'top-2', 'top-3', 'top-4', 'top-5'] }).ok, true);
  assert.deepEqual(game.deck.slice(-5).map((card) => card.id), ['top-1', 'top-2', 'top-3', 'top-4', 'top-5'], 'orderIds should reorder the deck top');

  assert.match(html, /id="guanxingModePanel"/, 'UI should expose a Guanxing panel');
  assert.match(html, /function showGuanxingPanel\(\)/, 'UI should preview Guanxing cards before confirming');
  assert.match(html, /id="guanxingReverseBtn"/, 'UI should offer at least one reorder action');
  assert.match(html, /function confirmGuanxing\(\)/, 'UI should confirm Guanxing after preview/reorder');
});

console.log('\nSkill UI regression tests passed.');
