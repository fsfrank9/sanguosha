import assert from 'node:assert/strict';
import { FakeElement, installFakeDom } from './helpers/fake-dom.mjs';
import { makeStartGameViaUI } from './helpers/ui-game.mjs';
import { test, runTests } from './helpers/harness.mjs';
import { createGodChoicePanels } from '../src/ui/panels/god-choice-panels.js';
import { createLonghunResponsePanels } from '../src/ui/panels/longhun-response-panels.js';
import { StateRuntime } from '../src/engine/state.js';

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const card = (id, suit = 'heart', name = '桃') => ({ id, suit, name, rank: 7 });
const godIds = ['godChoicePanel', 'godChoiceHint', 'godChoiceOptions', 'godChoiceCards', 'godChoiceStars', 'godChoiceTargets', 'godChoiceConfirmBtn', 'godChoiceDeclineBtn'];
function godFixture(extra = {}) {
  const els = Object.fromEntries(godIds.map(id => [id, new FakeElement(id)]));
  const pending = { kind: 'god-choice', actor: 'player', choiceId: 71, title: '技能选择', ...extra };
  const game = { pendingChoice: pending }, submitted = [];
  Object.defineProperty(game, 'enemy', { get() { throw new Error('choice panels must not inspect hidden opponents'); } });
  let panel;
  const render = () => panel.render(game.pendingChoice?.kind, game.pendingChoice);
  const Engine = { getPendingChoice: value => value.pendingChoice, resolvePendingChoice(value, decision) {
    submitted.push(decision); value.pendingChoice = null; return { ok: true };
  } };
  panel = createGodChoicePanels({ els, Engine, getGame: () => game, render, escapeHtml, suitLabel: value => value });
  panel.bind(); render();
  const click = (id, attr, value) => els[id].dispatchClick({ [attr]: value });
  return { els, game, pending, submitted, render,
    option: id => click('godChoiceOptions', 'data-god-option-id', id),
    card: id => click('godChoiceCards', 'data-god-card-id', id),
    star: id => click('godChoiceStars', 'data-god-star-id', id),
    target: id => click('godChoiceTargets', 'data-god-target-actor', id) };
}

test('AB faction choice requires an explicit current option and cannot be cancelled', () => {
  const f = godFixture({ options: ['魏', '蜀', '吴', '群'].map(id => ({ id, label: id })) });
  assert.equal(f.els.godChoiceConfirmBtn.disabled, true);
  assert.equal(f.els.godChoiceDeclineBtn.hidden, true);
  f.option('神'); f.els.godChoiceConfirmBtn.click(); assert.equal(f.submitted.length, 0);
  f.option('蜀'); assert.equal(f.els.godChoiceConfirmBtn.disabled, false);
  f.els.godChoiceConfirmBtn.click(); assert.deepEqual(f.submitted, [{ optionId: '蜀', choiceId: 71 }]);
});

test('AB Qixing exchange requires equal nonzero hand and star selections', () => {
  const f = godFixture({ cards: [card('h1'), card('h2')], cardMin: 1, cardMax: 2,
    starCards: [card('s1'), card('s2')], starMin: 1, starMax: 2, equalCardStarCount: true, optional: true });
  f.card('h1'); assert.equal(f.els.godChoiceConfirmBtn.disabled, true);
  f.star('s2'); assert.equal(f.els.godChoiceConfirmBtn.disabled, false);
  f.card('h2'); assert.equal(f.els.godChoiceConfirmBtn.disabled, true);
  f.star('s1'); f.els.godChoiceConfirmBtn.click();
  assert.deepEqual(f.submitted, [{ cardIds: ['h1', 'h2'], starIds: ['s2', 's1'], choiceId: 71 }]);
});

test('AB Dawu costs one star for each explicitly selected target', () => {
  const f = godFixture({ starCards: [card('s1'), card('s2')], starMin: 1, starMax: 2,
    targets: [{ actor: 'player', name: '神诸葛亮' }, { actor: 'ally', name: '刘备' }],
    targetMin: 1, targetMax: 2, equalStarTargetCount: true });
  f.star('s1'); f.target('player'); assert.equal(f.els.godChoiceConfirmBtn.disabled, false);
  f.target('ally'); assert.equal(f.els.godChoiceConfirmBtn.disabled, true);
  f.star('s2'); f.els.godChoiceConfirmBtn.click();
  assert.deepEqual(f.submitted[0].targetActors, ['player', 'ally']);
});

test('AB Shelie cannot submit duplicate suits, then permits one card of each suit', () => {
  const f = godFixture({ cards: [card('h1'), card('h2'), card('c1', 'club')], cardMin: 2, cardMax: 2, cardSuitRule: 'distinct' });
  f.card('h1'); f.card('h2'); assert.equal(f.els.godChoiceConfirmBtn.disabled, true);
  f.card('h2'); f.card('c1'); f.els.godChoiceConfirmBtn.click();
  assert.deepEqual(f.submitted[0].cardIds, ['h1', 'c1']);
});

test('AB Longhun active card selection cannot mix suits or overselect', () => {
  const f = godFixture({ cards: [card('h1'), card('h2'), card('c1', 'club')], cardMin: 2, cardMax: 2, cardSuitRule: 'same' });
  f.card('h1'); f.card('c1'); assert.equal(f.els.godChoiceConfirmBtn.disabled, true);
  f.card('h2'); assert.equal(f.els.godChoiceConfirmBtn.disabled, true);
  f.card('c1'); f.card('h2'); f.els.godChoiceConfirmBtn.click();
  assert.deepEqual(f.submitted[0].cardIds, ['h1', 'h2']);
});

test('AB Gongxin reveals only a selectable heart, while ending observation needs no card', () => {
  const f = godFixture({ cards: [card('h1'), { ...card('s1', 'spade'), disabled: true }], cardMin: 0, cardMax: 1,
    options: [{ id: 'reveal', label: '展示', cardMin: 1 }, { id: 'decline', label: '结束观看', skipSelection: true }] });
  f.option('reveal'); f.card('s1'); assert.equal(f.els.godChoiceConfirmBtn.disabled, true);
  f.card('h1'); assert.equal(f.els.godChoiceConfirmBtn.disabled, false);
  f.option('decline'); f.els.godChoiceConfirmBtn.click();
  assert.deepEqual(f.submitted, [{ optionId: 'decline', cardIds: [], choiceId: 71 }]);
});

test('AB same-kind consecutive choices discard staged cards and ignore stale clicks before rendering', () => {
  const f = godFixture({ cards: [card('h1')], cardMin: 1, cardMax: 1, optional: true });
  f.card('h1'); f.game.pendingChoice = { ...f.pending, choiceId: 72 };
  f.els.godChoiceConfirmBtn.click(); f.els.godChoiceDeclineBtn.click(); assert.equal(f.submitted.length, 0);
  f.render(); assert.equal(f.els.godChoiceConfirmBtn.disabled, true);
  f.card('h1'); f.els.godChoiceConfirmBtn.click(); assert.equal(f.submitted[0].choiceId, 72);
});

test('AB removed candidates and required decline cannot bypass current-window validation', () => {
  const f = godFixture({ cards: [card('h1')], cardMin: 1, cardMax: 1 });
  f.card('h1'); f.pending.cards = [];
  f.els.godChoiceConfirmBtn.click(); f.els.godChoiceDeclineBtn._dispatch('click', {});
  assert.equal(f.submitted.length, 0);
});

test('AB optional cancel retains the live choice token', () => {
  const f = godFixture({ optional: true, cards: [card('h1')], cardMin: 1, cardMax: 1 });
  f.els.godChoiceDeclineBtn.click(); assert.deepEqual(f.submitted, [{ decline: true, choiceId: 71 }]);
});

test('AB choice windows escape content and erase another actor’s private cards', () => {
  const f = godFixture({ cards: [card('x"onclick="bad', 'heart', '<img src=x>')], cardMin: 1, cardMax: 1 });
  assert.match(f.els.godChoiceCards.innerHTML, /&lt;img/); assert.doesNotMatch(f.els.godChoiceCards.innerHTML, /<img|"onclick="/);
  f.game.pendingChoice = { ...f.pending, actor: 'enemy', cards: [card('secret')] }; f.render();
  assert.equal(f.els.godChoicePanel.hidden, true); assert.equal(f.els.godChoiceCards.innerHTML, '');
  assert.equal(f.els.godChoiceHint.textContent, '');
});

const longhunIds = ['longhunResponsePanel', 'longhunResponseHint', 'longhunResponseTypes', 'longhunResponseCards', 'longhunResponseTargets', 'longhunResponseConfirmBtn'];
function longhunFixture(extra = {}) {
  const els = Object.fromEntries(longhunIds.map(id => [id, new FakeElement(id)]));
  const option = { via: '龙魂', cardId: 'longhun:["c1","c2"]', name: '闪', suit: 'club', requiredCount: 2,
    candidateCards: [card('c1', 'club'), card('c2', 'club'), { ...card('c3', 'club'), sourceZone: 'equipment' }] };
  const pending = { kind: 'shan-response', actor: 'player', choiceId: 81, options: [option], ...extra };
  const game = { pendingChoice: pending }, submitted = [];
  let panel, staged;
  const render = () => panel.render(game.pendingChoice?.kind, game.pendingChoice);
  const Engine = { getPendingChoice: value => value.pendingChoice, resolvePendingChoice(value, decision) {
    submitted.push(decision); value.pendingChoice = null; return { ok: true };
  } };
  panel = createLonghunResponsePanels({ els, Engine, getGame: () => game, render, escapeHtml, suitLabel: value => value,
    stage(payload) { staged = payload; render(); } });
  panel.bind(); render();
  return { els, game, pending, submitted, render, staged: () => staged,
    card: id => els.longhunResponseCards.dispatchClick({ 'data-longhun-resp-card': id }),
    target: id => els.longhunResponseTargets.dispatchClick({ 'data-longhun-resp-target': id }) };
}

for (const kind of ['shan-response', 'wanjian-response', 'sha-duel-response', 'aoe-sha-response', 'wuxie-response', 'hujia-aid', 'jijiang-aid', 'tiaoxin-demand']) {
  test('AB Longhun explicitly chooses any legal combination in ' + kind, () => {
    const f = longhunFixture({ kind });
    assert.match(f.els.longhunResponseCards.innerHTML, /装备/);
    f.card('c2'); assert.equal(f.els.longhunResponseConfirmBtn.disabled, true);
    f.card('c3'); assert.equal(f.els.longhunResponseConfirmBtn.disabled, false);
    assert.equal(f.submitted.length, 0); assert.equal(f.staged().cardId, 'longhun:["c2","c3"]');
    f.els.longhunResponseConfirmBtn.click();
    assert.deepEqual(f.submitted, [{ cardId: 'longhun:["c2","c3"]', choiceId: 81 }]);
  });
}

test('AB Longhun rescue options work without the ordinary response options field', () => {
  const f = longhunFixture();
  f.game.pendingChoice = { ...f.pending, kind: 'dying-rescue', options: undefined, longhunOptions: f.pending.options }; f.render();
  f.card('c1'); f.card('c3'); f.els.longhunResponseConfirmBtn.click();
  assert.equal(f.submitted[0].cardId, 'longhun:["c1","c3"]');
});

test('AB Longhun under Luanwu requires a legal explicit target', () => {
  const f = longhunFixture({ kind: 'luanwu-sha', targets: [{ seat: 'enemy', name: '神吕布' }, { seat: 'ally', name: '刘备' }] });
  f.card('c1'); f.card('c3'); assert.equal(f.els.longhunResponseConfirmBtn.disabled, true);
  f.target('player'); assert.equal(f.els.longhunResponseConfirmBtn.disabled, true);
  f.target('ally'); f.els.longhunResponseConfirmBtn.click(); assert.equal(f.submitted[0].target, 'ally');
});

test('AB Longhun new response windows clear selections and reject stale or removed material', () => {
  const f = longhunFixture(); f.card('c1'); f.card('c2');
  f.game.pendingChoice = { ...f.pending, choiceId: 82 };
  f.els.longhunResponseConfirmBtn.click(); assert.equal(f.submitted.length, 0);
  f.render(); assert.equal(f.els.longhunResponseConfirmBtn.disabled, true);
  f.card('c1'); f.card('c2'); f.game.pendingChoice.options[0].candidateCards = [card('c1', 'club'), card('c3', 'club')];
  f.els.longhunResponseConfirmBtn.click(); assert.equal(f.submitted.length, 0);
  f.game.pendingChoice = { ...f.pending, actor: 'enemy' }; f.render();
  assert.equal(f.els.longhunResponseCards.innerHTML, '');
});

const dom = installFakeDom();
const { Engine, c } = await import('./helpers/load-engine.mjs');
await import('../src/ui/dom-adapter.js');
const UI = window.SanguoshaUI, $ = dom.$, start = makeStartGameViaUI($, UI);

test('AB hero browser and picker distinguish all eight gods from original heroes', () => {
  $('lobbyHeroesBtn').click();
  $('heroBrowserFilter').dispatchClick({ 'data-camp': '神' });
  assert.equal(($('heroBrowserGrid').innerHTML.match(/data-hero-id=/g) || []).length, 8);
  for (const name of ['神关羽', '神吕蒙', '神周瑜', '神诸葛亮', '神曹操', '神吕布', '神赵云', '神司马懿']) assert.match($('heroBrowserGrid').innerHTML, new RegExp(name));
  $('lobby1v1Btn').click(); $('heroPickCampFilter').dispatchClick({ 'data-camp': '神' });
  assert.equal(($('heroPickGrid').innerHTML.match(/data-hero-id=/g) || []).length, 8);
  assert.match($('playerHeroSelect').innerHTML, /\[神将\] 神吕蒙/);
});

test('AB the real lobby asks god faction before dealing hands and common confirm completes it', () => {
  $('lobby1v1Btn').click(); $('playerHeroSelect').value = 'god_guanyu'; $('enemyHeroSelect').value = 'caocao'; $('startGameBtn').click();
  $('exitConfirmModal').hidden = true; UI.render();
  const game = UI.getGame();
  assert.equal(game.pendingChoice.godChoiceType, 'faction'); assert.equal(game.player.hand.length, 0);
  assert.equal($('godChoicePanel').hidden, false); assert.equal($('handConfirmBtn').disabled, true);
  $('godChoiceOptions').dispatchClick({ 'data-god-option-id': '蜀' }); $('handConfirmBtn').click();
  assert.equal(Engine.effectiveCamp(game.player), '蜀'); assert.equal(game.player.hand.length >= 4, true);
  assert.equal($('playerName').textContent, '神关羽'); assert.match($('playerCamp').textContent, /^蜀/);
});

test('AB board shows public marks and star counts but renders star identities only for the player', () => {
  const game = start('liubei', 'caocao');
  game.player.godMarks = { rage: 6, nin: 3 }; game.player.nightmare = 2; game.player.stars = [c('sha', { id: 'self-star' })];
  game.enemy.stars = [{ id: 'secret-star', name: '<enemy-secret-card>', suit: 'heart' }]; UI.render();
  assert.match($('playerCamp').textContent, /暴怒 6.*忍 3.*梦魇 2.*星 1/);
  assert.match($('enemyCamp').textContent, /星 1/); assert.match($('playerStarCards').innerHTML, /杀/);
  assert.doesNotMatch($('playerStarCards').innerHTML, /enemy-secret/);
  assert.doesNotMatch($('enemyCamp').textContent, /enemy-secret/);
});

test('AB Wushen displays a heart trick as Sha and plays it without opening a trick picker', () => {
  const game = start('liubei', 'caocao'); StateRuntime.grantSkill(game.player, 'wushen', '武神');
  const physical = c('huogong', { id: 'wushen-heart', suit: 'heart' }); game.player.hand = [physical];
  game.enemy.hand = []; game.enemy.skills = []; UI.render();
  assert.match($('playerHand').innerHTML, /【杀】/); assert.match($('playerHand').innerHTML, /基本 · 武神/);
  assert.doesNotMatch($('playerHand').innerHTML, /【火攻】/);
  const hp = game.enemy.hp;
  $('playerHand').dispatchClick({ 'data-card-id': physical.id }); $('handConfirmBtn').click();
  assert.equal($('huogongModePanel').hidden, true); assert.equal(game.enemy.hp, hp - 1);
  assert.equal(physical.type, 'huogong');
});

test('AB real Qixing initial deal lets the player choose four of eleven and keeps seven private stars', () => {
  $('lobby1v1Btn').click(); $('playerHeroSelect').value = 'god_zhugeliang'; $('enemyHeroSelect').value = 'caocao'; $('startGameBtn').click();
  $('exitConfirmModal').hidden = true; UI.render();
  const game = UI.getGame();
  $('godChoiceOptions').dispatchClick({ 'data-god-option-id': '蜀' }); $('handConfirmBtn').click();
  assert.equal(game.pendingChoice.godChoiceType, 'qixing-initial');
  assert.equal(game.pendingChoice.cards.length, 11); assert.equal(game.player.hand.length, 0);
  const chosen = game.pendingChoice.cards.slice(-4).map(card => card.id);
  chosen.slice(0, 3).forEach(id => $('godChoiceCards').dispatchClick({ 'data-god-card-id': id }));
  assert.equal($('godChoiceConfirmBtn').disabled, true);
  $('godChoiceCards').dispatchClick({ 'data-god-card-id': chosen[3] }); $('handConfirmBtn').click();
  assert.equal(game.player.stars.length, 7);
  assert.ok(chosen.every(id => game.player.hand.some(card => card.id === id)));
  assert.equal($('playerStarCards').hidden, false);
});

test('AB real Longhun response pays the two chosen cards, including equipment, and common cancel clears selection', () => {
  const game = start('liubei', 'caocao'); StateRuntime.grantSkill(game.player, 'longhun', '龙魂');
  game.player.hp = 2; game.player.hand = [c('tao', { id: 'lh-a', suit: 'club' }), c('shan', { id: 'lh-b', suit: 'club' })];
  game.player.equipment.weapon = c('zhuge', { id: 'lh-e', suit: 'club' });
  game.enemy.hand = [c('sha', { id: 'lh-attack' })]; game.turn = 'enemy';
  assert.equal(Engine.playCard(game, 'enemy', 'lh-attack').ok, true); UI.render();
  assert.equal(game.pendingChoice.kind, 'shan-response'); assert.equal($('longhunResponsePanel').hidden, false);
  assert.doesNotMatch($('shanResponseChoices').innerHTML, /longhun:/);
  $('longhunResponseCards').dispatchClick({ 'data-longhun-resp-card': 'lh-a' });
  $('longhunResponseCards').dispatchClick({ 'data-longhun-resp-card': 'lh-e' });
  assert.equal($('handConfirmBtn').disabled, false); $('handCancelBtn').click();
  assert.equal($('longhunResponseConfirmBtn').disabled, true);
  $('longhunResponseCards').dispatchClick({ 'data-longhun-resp-card': 'lh-a' });
  $('longhunResponseCards').dispatchClick({ 'data-longhun-resp-card': 'lh-e' }); $('handConfirmBtn').click();
  assert.equal(game.player.hp, 2); assert.equal(game.player.equipment.weapon, null);
  assert.deepEqual(game.player.hand.map(card => card.id), ['lh-b']); assert.equal(game.pendingChoice, null);
});

test('AB real Gongxin completes target, reveal and discard decisions through the shared panel', () => {
  const game = start('liubei', 'caocao'); StateRuntime.grantSkill(game.player, 'gongxin', '攻心');
  game.enemy.hand = [c('tao', { id: 'gx-heart', suit: 'heart' }), c('sha', { id: 'gx-spade', suit: 'spade' })]; UI.render();
  $('playerSkillBar').dispatchClick({ 'data-skill-id': 'gongxin' });
  assert.equal(game.pendingChoice.godChoiceType, 'gongxin-target');
  $('godChoiceTargets').dispatchClick({ 'data-god-target-actor': 'enemy' }); $('handConfirmBtn').click();
  assert.equal(game.pendingChoice.godChoiceType, 'gongxin-look');
  $('godChoiceOptions').dispatchClick({ 'data-god-option-id': 'reveal' });
  assert.equal($('godChoiceConfirmBtn').disabled, true);
  $('godChoiceCards').dispatchClick({ 'data-god-card-id': 'gx-spade' }); assert.equal($('godChoiceConfirmBtn').disabled, true);
  $('godChoiceCards').dispatchClick({ 'data-god-card-id': 'gx-heart' }); $('handConfirmBtn').click();
  assert.equal(game.pendingChoice.godChoiceType, 'gongxin-move');
  $('godChoiceOptions').dispatchClick({ 'data-god-option-id': 'discard' }); $('handConfirmBtn').click();
  assert.deepEqual(game.enemy.hand.map(card => card.id), ['gx-spade']); assert.equal(game.pendingChoice, null);
  assert.equal(game.player.flags.gongxinUsed, true);
});

test('AB Shenfen skill button waits for confirmation before paying rage or damaging opponents', () => {
  const game = start('liubei', 'caocao'); StateRuntime.grantSkill(game.player, 'shenfen', '神愤');
  game.player.godMarks = { rage: 6 }; game.enemy.hand = []; game.enemy.skills = []; UI.render();
  const hp = game.enemy.hp;
  $('playerSkillBar').dispatchClick({ 'data-skill-id': 'shenfen' });
  assert.equal(game.player.godMarks.rage, 6); assert.equal(game.enemy.hp, hp);
  $('handConfirmBtn').click(); assert.equal(game.player.godMarks.rage, 0); assert.equal(game.enemy.hp, hp - 1);
  assert.equal(game.player.flags.shenfenUsed, true);
});

test('AB Longhun active wizard submits chosen material and an explicit fire Sha target', () => {
  const game = start('liubei', 'caocao'); StateRuntime.grantSkill(game.player, 'longhun', '龙魂');
  game.player.hp = 1; game.player.hand = [c('tao', { id: 'lh-active', suit: 'diamond' })];
  game.enemy.hand = []; game.enemy.skills = []; UI.render();
  const hp = game.enemy.hp;
  $('playerSkillBar').dispatchClick({ 'data-skill-id': 'longhun' });
  assert.equal(game.pendingChoice.godChoiceType, 'longhun-use');
  $('godChoiceOptions').dispatchClick({ 'data-god-option-id': 'use' });
  $('godChoiceCards').dispatchClick({ 'data-god-card-id': 'lh-active' });
  $('godChoiceTargets').dispatchClick({ 'data-god-target-actor': 'enemy' }); $('handConfirmBtn').click();
  assert.equal(game.enemy.hp, hp - 1); assert.equal(game.player.hand.length, 0);
});

test('AB derived Jilue is visible and usable after Baiyin, and consumes one nin for Zhiheng', () => {
  const game = start('liubei', 'caocao');
  StateRuntime.grantSkill(game.player, 'baiyin', '拜印'); game.player.godMarks = { nin: 4 };
  Engine.startTurn(game, 'player'); UI.render();
  assert.equal(game.player.flags.baiyinAwakened, true);
  assert.match($('playerSkillBar').innerHTML, /拜印·已觉醒/);
  assert.match($('playerSkillBar').innerHTML, /data-skill-id="jilue"/);
  assert.match($('playerSkillBar').innerHTML, /可弃1枚忍/);
  $('playerSkillBar').dispatchClick({ 'data-skill-id': 'jilue' });
  assert.equal(game.pendingChoice.godChoiceType, 'jilue-mode');
  $('godChoiceOptions').dispatchClick({ 'data-god-option-id': 'zhiheng' }); $('handConfirmBtn').click();
  assert.equal(game.pendingChoice.godChoiceType, 'jilue-zhiheng');
  const selected = game.pendingChoice.cards[0].id;
  $('godChoiceCards').dispatchClick({ 'data-god-card-id': selected }); $('handConfirmBtn').click();
  assert.equal(game.player.godMarks.nin, 3); assert.equal(game.player.flags.jilueZhihengUsed, true);
});

await runTests();
