import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

assert.ok(Engine, 'game engine should expose SanguoshaEngine via ES module export');


import fs from 'node:fs';
import path from 'node:path';
import { loadAllStyles } from './helpers/load-styles.mjs';

const root = path.resolve(import.meta.dirname, '..');
const html = [
  fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
  loadAllStyles(),
  fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8'),
  // v11 B2: 面板已拆往 src/ui/panels/, 拼接一并纳入。
  fs.readFileSync(path.join(root, 'src/ui/panels/response-panels.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'src/ui/panels/prompt-panels.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'src/ui/panels/mode-panels.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'src/ui/panels/lobby-panels.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'src/data/cards.js'), 'utf8'),
].join('\n');

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
  // v8 PR-C4 qingnang + PR-C5 luoshen 走 pendingChoice 主动/询问路径 → ACTIVE
  for (const required of ['zhiheng', 'kurou', 'rende', 'fanjian', 'guanxing', 'qingnang', 'luoshen']) {
    assert.ok(Engine.ACTIVE_SKILL_IDS.includes(required), `${required} should be a clickable active skill`);
    assert.ok(Engine.IMPLEMENTED_SKILL_IDS.includes(required), `${required} should be marked implemented`);
  }
  // v8 PR-C1 guose / PR-C2 liuli / PR-C3 jijiu 是触发型 / card-as 转化 → 不占按钮
  for (const required of ['wusheng', 'longdan', 'qingguo', 'paoxiao', 'jianxiong', 'ganglie', 'fankui', 'mashu', 'qicai', 'qianxun', 'tiandu', 'yiji', 'luoyi', 'guicai', 'tieqi', 'tuxi', 'yingzi', 'kongcheng', 'guose', 'liuli', 'jijiu']) {
    assert.ok(Engine.IMPLEMENTED_SKILL_IDS.includes(required), `${required} should be marked implemented/passive`);
    assert.equal(Engine.ACTIVE_SKILL_IDS.includes(required), false, `${required} should not be a clickable active skill`);
  }
  const missingStatus = collectSkills().filter(({ skill }) => !skill.status);
  assert.deepEqual(missingStatus.map(({ hero, skill }) => `${hero.id}:${skill.id}`), [], 'every skill should be annotated as implemented/display/todo');
});

test('unimplemented skills are visible but explicitly disabled as todo, not silently clickable', () => {
  const todoSkills = collectSkills().filter(({ skill }) => skill.status === 'todo');
  // v8 PR-C1..C5 升级 5 个标准包技能 (guose/liuli/jijiu/qingnang/luoshen)
  // 为 implemented, 所以 todo 下限从 80 降至 70 (剩余未实现仍多于此).
  assert.ok(todoSkills.length >= 70, 'expanded hero pool should still mark not-yet-implemented skills as todo');
  assert.equal(Engine.HERO_CATALOG.xuchu.skills[0].status, 'implemented');
  assert.equal(Engine.HERO_CATALOG.liubei.skills.find((skill) => skill.id === 'jijiang').status, 'display');
  assert.match(html, /skill-status-todo/, 'UI should render a todo style for unimplemented skills');
  assert.match(html, /未实现/, 'UI should tell the player a skill is not implemented yet');
});

test('player skill bar uses the engine active-skill list instead of hard-coding only Zhiheng and Kurou', () => {
  assert.match(html, /Engine\.ACTIVE_SKILL_IDS\.indexOf\(skill\.id\) >= 0/, 'UI should ask engine active skill metadata');
  assert.match(html, /function renderPlayerSkillBar\(ctx\)/, 'lobby panel should own player skill bar rendering');
  assert.match(html, /lobbyPanels\.renderPlayerSkillBar/, 'dom adapter should delegate player skill bar rendering to lobbyPanels');
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

test('Guanxing previews min(aliveActorCount, 5, deckSize) cards and reorders via topIds/bottomIds (v6.1)', () => {
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
  // 1v1 ⇒ aliveActorCount = 2 ⇒ preview is the top 2 cards only.
  assert.deepEqual(Array.from(preview.cards).map((card) => card.id), ['top-2', 'top-1']);
  assert.equal(game.player.flags.guanxingUsed, undefined, 'preview must not consume Guanxing');

  // New API: topIds[0] is drawn first. With topIds=['top-1','top-2'], deck
  // top after reorder should be top-1 (drawn next), then top-2.
  assert.equal(Engine.useSkill(game, 'player', 'guanxing', [], { topIds: ['top-1', 'top-2'], bottomIds: [] }).ok, true);
  assert.deepEqual(game.deck.slice(-2).map((card) => card.id), ['top-2', 'top-1'], 'topIds[0] should end up at deck top (pop() first)');

  assert.match(html, /id="guanxingModePanel"/, 'UI should expose a Guanxing panel');
  assert.match(html, /function showGuanxingPanelFromPending\(\)/, 'UI should preview Guanxing cards from pendingChoice');
  assert.match(html, /id="guanxingTopBtn"/, 'UI should offer a "place on top" action (v6.1)');
  assert.match(html, /id="guanxingBottomBtn"/, 'UI should offer a "place on bottom" action (v6.1)');
  assert.match(html, /function confirmGuanxing\(\)/, 'UI should confirm Guanxing after preview/reorder');
});

console.log('\nSkill UI regression tests passed.');
