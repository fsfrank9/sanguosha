import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { makeStartGameViaUI } from './helpers/ui-game.mjs';
import { test, runTests } from './helpers/harness.mjs';
const dom = installFakeDom();
const { Engine, c, StateRuntime } = await import('./helpers/load-engine.mjs');
await import('../src/ui/dom-adapter.js');
const UI = globalThis.window.SanguoshaUI, $ = dom.$;
const startDuel = makeStartGameViaUI($, UI);
function override(state, values) { StateRuntime.setIdentityOverride(state, 'huashen', values); }
function startThree(playerHero, enemyHero, allyHero) {
  $('lobby1v1Btn').click(); $('modeIdentity3Btn').click(); $('roleLordBtn').click();
  const rolesToggle = $('hiddenRolesToggleBtn');
  if (rolesToggle.getAttribute('aria-pressed') == null) rolesToggle.click();
  if (rolesToggle.getAttribute('aria-pressed') === 'true') rolesToggle.click();
  $('playerHeroSelect').value = playerHero; $('enemyHeroSelect').value = enemyHero; $('allyHeroSelect').value = allyHero;
  $('startGameBtn').click(); $('exitConfirmModal').hidden = true;
  const g = UI.getGame();
  g.turn = 'player'; g.phase = 'play'; g.roles = { player: '主公', enemy: '反贼', ally: '忠臣' };
  for (const actor of g.seats) {
    Object.assign(g[actor], { hand: [], judgeArea: [], flags: {}, skillPreferences: {},
      equipment: { weapon: null, armor: null, horseMinus: null, horsePlus: null }, hp: g[actor].maxHp });
  }
  g.pendingChoice = null; g.pendingChoiceQueue = []; g.pauseState = {}; UI.render(); return g;
}

test('AA2 UI all three battlefield camp views follow current override and restore base', () => {
  const g = startDuel('caocao', 'sunquan'); override(g.player, { camp: '蜀', gender: 'female' }); UI.render();
  assert.match($('playerCamp').textContent, /^蜀/);
  assert.equal($('playerHero').getAttribute('data-camp'), '蜀'); assert.equal($('playerRibbon').textContent, '蜀');
  assert.equal(g.player.camp, '魏'); assert.equal(Engine.HERO_CATALOG.caocao.camp, '魏');
  StateRuntime.clearIdentityOverride(g.player, 'huashen'); UI.render();
  assert.match($('playerCamp').textContent, /^魏/);
  assert.equal($('playerHero').getAttribute('data-camp'), '魏'); assert.equal($('playerRibbon').textContent, '魏');
});

test('AA2 UI Huangtian button uses current camp, transfers a Shan, and disappears after override changes', () => {
  const g = startThree('caocao', 'zhangjiao', 'liubei');
  g.roles = { player: '忠臣', enemy: '主公', ally: '反贼' };
  g.player.hand = [c('shan', { id: 'gift' })]; override(g.player, { camp: '群' }); UI.render();
  assert.match($('playerSkillBar').innerHTML, /data-skill-id="huangtian"/);
  $('playerSkillBar').dispatchClick({ 'data-skill-id': 'huangtian' });
  $('playerHand').dispatchClick({ 'data-card-id': 'gift' }); $('handConfirmBtn').click();
  assert.equal(g.enemy.hand[0].id, 'gift'); assert.equal(g.player.camp, '魏');
  override(g.player, { camp: '吴' }); UI.render();
  assert.doesNotMatch($('playerSkillBar').innerHTML, /data-skill-id="huangtian"/);
});

test('AA2 UI Zhiba button and target picker agree on current Wu camp', () => {
  const g = startThree('caocao', 'sunce', 'liubei');
  g.roles = { player: '忠臣', enemy: '主公', ally: '反贼' };
  g.player.hand = [c('sha', { id: 'cost', rank: 'K' })]; g.enemy.hand = [c('shan', { id: 'lord-card', rank: '2' })];
  override(g.player, { camp: '吴' }); UI.render();
  assert.match($('playerSkillBar').innerHTML, /data-skill-id="zhiba"/);
  $('playerSkillBar').dispatchClick({ 'data-skill-id': 'zhiba' });
  assert.equal($('seatTargetModePanel').hidden, false);
  $('enemyHero').click(); $('seatTargetConfirmBtn').click();
  assert.equal(g.pendingChoice.kind, 'pindian-card');
  $('pindianChoices').dispatchClick({ 'data-pindian-card-id': 'cost' }); $('handConfirmBtn').click();
  assert.equal(g.player.flags.zhibaUsed, true);
  override(g.player, { camp: '魏' }); UI.render();
  assert.doesNotMatch($('playerSkillBar').innerHTML, /data-skill-id="zhiba"/);
});

test('AA2 UI Lijian includes current-male base-female target and executes both selected targets', () => {
  const g = startThree('diaochan', 'zhenji', 'caocao');
  g.player.hand = [c('shan', { id: 'cost' })]; override(g.enemy, { gender: 'male' }); UI.render();
  $('playerSkillBar').dispatchClick({ 'data-skill-id': 'lijian' });
  $('playerHand').dispatchClick({ 'data-card-id': 'cost' }); $('handConfirmBtn').click();
  assert.equal($('seatTargetModePanel').hidden, false);
  $('enemyHero').click(); $('allyHero').click(); $('seatTargetConfirmBtn').click();
  assert.equal(g.player.hand.length, 0); assert.ok(g.log.some(line => /离间/.test(line)));
  assert.equal(g.enemy.gender, 'female');
});

runTests();
