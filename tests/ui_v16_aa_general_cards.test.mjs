import assert from 'node:assert/strict';
import { FakeElement, installFakeDom } from './helpers/fake-dom.mjs';
import { makeStartGameViaUI } from './helpers/ui-game.mjs';
import { GeneralCardRuntime } from '../src/engine/general-card-runtime.js';
import { StateRuntime } from '../src/engine/state.js';
import { createGeneralCardPanels } from '../src/ui/panels/general-card-panels.js';
import { test, runTests } from './helpers/harness.mjs';

const panelIds = ['generalCardPanel', 'generalCardHint', 'generalCardCurrent', 'generalCardOptions',
  'generalCardSkills', 'generalCardConfirmBtn', 'generalCardDeclineBtn'];

function fixture(overrides = {}) {
  const els = Object.fromEntries(panelIds.map(id => [id, new FakeElement(id)]));
  const pending = {
    kind: 'general-card-choice', actor: 'player', choiceId: 'general-1', optional: true,
    reason: '选择武将牌与技能', activeHeroId: 'zhangfei', activeSkillId: 'paoxiao',
    options: [
      { heroId: 'zhangfei', name: '张飞', camp: '蜀', gender: 'male', skills: [{ id: 'paoxiao', name: '咆哮' }] },
      { heroId: 'sunshangxiang', name: '孙尚香', camp: '吴', gender: 'female',
        skills: [{ id: 'jieyin', name: '结姻' }, { id: 'xiaoji', name: '枭姬' }] },
      { heroId: 'zuoci', name: '左慈', camp: '群', gender: 'male', skills: [], disabledReason: '无可声明技能' }
    ], ...overrides
  };
  const game = { pendingChoice: pending };
  Object.defineProperty(game, 'generalCards', { get() { throw new Error('UI must not inspect hidden general cards'); } });
  const submitted = [];
  let panel;
  const render = () => panel.render(game.pendingChoice?.kind, game.pendingChoice);
  panel = createGeneralCardPanels({ els, getGame: () => game, render,
    escapeHtml: value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])),
    Engine: {
      getPendingChoice: value => value.pendingChoice,
      resolvePendingChoice(value, decision) { submitted.push(decision); value.pendingChoice = null; return { ok: true }; }
    }
  });
  panel.bind(); render();
  return { els, game, pending, submitted, render,
    hero: heroId => els.generalCardOptions.dispatchClick({ 'data-general-hero-id': heroId }),
    skill: skillId => els.generalCardSkills.dispatchClick({ 'data-general-skill-id': skillId }) };
}

test('AA3 UI explicitly selects a general then one of its skills before submitting', () => {
  const f = fixture();
  assert.equal(f.els.generalCardPanel.hidden, false);
  assert.match(f.els.generalCardCurrent.textContent, /当前：张飞 · 咆哮/);
  assert.equal(f.els.generalCardConfirmBtn.disabled, true);
  f.hero('sunshangxiang');
  assert.match(f.els.generalCardSkills.innerHTML, /结姻/);
  assert.match(f.els.generalCardSkills.innerHTML, /枭姬/);
  assert.equal(f.els.generalCardConfirmBtn.disabled, true);
  f.skill('xiaoji');
  assert.deepEqual(f.submitted, []);
  assert.equal(f.els.generalCardConfirmBtn.disabled, false);
  f.els.generalCardConfirmBtn.click();
  assert.deepEqual(f.submitted, [{ heroId: 'sunshangxiang', skillId: 'xiaoji', choiceId: 'general-1' }]);
  assert.equal(f.els.generalCardPanel.hidden, true);
});

test('AA3 UI choosing a different general clears the previous skill selection', () => {
  const f = fixture(); f.hero('sunshangxiang'); f.skill('xiaoji');
  f.hero('zhangfei');
  assert.equal(f.els.generalCardConfirmBtn.disabled, true);
  assert.doesNotMatch(f.els.generalCardSkills.innerHTML, /枭姬/);
  f.skill('xiaoji'); f.els.generalCardConfirmBtn.click();
  assert.equal(f.submitted.length, 0);
  f.skill('paoxiao'); f.els.generalCardConfirmBtn.click();
  assert.equal(f.submitted[0].skillId, 'paoxiao');
});

test('AA3 UI replacing a same-kind pending object clears both selection stages', () => {
  const f = fixture(); f.hero('zhangfei'); f.skill('paoxiao');
  f.game.pendingChoice = { ...f.pending, choiceId: 'general-2' }; f.render();
  assert.equal(f.els.generalCardConfirmBtn.disabled, true);
  assert.equal(f.els.generalCardSkills.innerHTML, '');
  f.els.generalCardConfirmBtn.click(); assert.equal(f.submitted.length, 0);
  f.hero('zhangfei'); f.skill('paoxiao'); f.els.generalCardConfirmBtn.click();
  assert.equal(f.submitted[0].choiceId, 'general-2');
});

test('AA3 UI stale clicks before a replacement window renders cannot submit or stage', () => {
  const f = fixture(); f.hero('zhangfei'); f.skill('paoxiao');
  f.game.pendingChoice = { ...f.pending, choiceId: 'general-2' };
  f.els.generalCardConfirmBtn.click(); f.els.generalCardDeclineBtn.click();
  f.hero('sunshangxiang'); f.skill('xiaoji');
  assert.equal(f.submitted.length, 0);
  f.render(); assert.equal(f.els.generalCardConfirmBtn.disabled, true);
  assert.equal(f.els.generalCardSkills.innerHTML, '');
});

test('AA3 UI disabled or forged general and skill choices never submit', () => {
  const f = fixture();
  assert.match(f.els.generalCardOptions.innerHTML, /disabled[^>]*>左慈.*无可声明技能/);
  f.hero('zuoci'); f.hero('enemy-secret'); f.skill('paoxiao'); f.els.generalCardConfirmBtn.click();
  assert.equal(f.submitted.length, 0);
  f.hero('zhangfei'); f.skill('forged'); f.els.generalCardConfirmBtn.click();
  assert.equal(f.submitted.length, 0);
  f.pending.options[0].skills.push({ id: 'disabled', name: '不可选', disabledReason: '当前无效' }); f.render();
  assert.match(f.els.generalCardSkills.innerHTML, /disabled[^>]*>不可选 · 当前无效/);
  f.skill('disabled'); f.els.generalCardConfirmBtn.click(); assert.equal(f.submitted.length, 0);
});

test('AA3 UI revalidates a staged option removed from the current window before confirm', () => {
  const f = fixture(); f.hero('zhangfei'); f.skill('paoxiao');
  f.pending.options[0].skills = [];
  f.els.generalCardConfirmBtn.click(); assert.equal(f.submitted.length, 0);
  f.render(); assert.equal(f.els.generalCardConfirmBtn.disabled, true);
  assert.match(f.els.generalCardOptions.innerHTML, /无可选技能/);
});

test('AA3 UI optional skip submits the current choice ID while required windows cannot decline', () => {
  const optional = fixture(); optional.els.generalCardDeclineBtn.click();
  assert.deepEqual(optional.submitted, [{ decline: true, choiceId: 'general-1' }]);
  const required = fixture({ optional: false });
  assert.equal(required.els.generalCardDeclineBtn.hidden, true);
  assert.equal(required.els.generalCardDeclineBtn.disabled, true);
  required.els.generalCardDeclineBtn._dispatch('click', {});
  assert.equal(required.submitted.length, 0);
});

test('AA3 UI allows general-only selection when the skills field is omitted', () => {
  const f = fixture({ options: [{ heroId: 'caocao', name: '曹操' }] });
  f.hero('caocao'); assert.equal(f.els.generalCardConfirmBtn.disabled, false);
  assert.equal(f.els.generalCardSkills.innerHTML, ''); f.els.generalCardConfirmBtn.click();
  assert.deepEqual(f.submitted, [{ heroId: 'caocao', choiceId: 'general-1' }]);
});

test('AA3 UI renders only provided human candidates and clears hidden-window data', () => {
  const f = fixture();
  assert.doesNotMatch(f.els.generalCardOptions.innerHTML, /enemy-secret/);
  f.game.pendingChoice = { ...f.pending, actor: 'enemy',
    options: [{ heroId: 'enemy-secret', name: '对方暗置武将' }], activeHeroId: 'enemy-secret' };
  f.render();
  assert.equal(f.els.generalCardPanel.hidden, true);
  assert.equal(f.els.generalCardOptions.innerHTML, '');
  assert.equal(f.els.generalCardSkills.innerHTML, '');
  assert.equal(f.els.generalCardCurrent.textContent, '');
});

test('AA3 UI escapes option names, attributes and disabled reasons', () => {
  const f = fixture({ options: [{ heroId: 'x"onclick="bad', name: '<img src=x>', skills: [], disabledReason: '<script>bad</script>' }] });
  assert.doesNotMatch(f.els.generalCardOptions.innerHTML, /<img|<script|"onclick="/);
  assert.match(f.els.generalCardOptions.innerHTML, /&lt;img src=x&gt;/);
});

const dom = installFakeDom();
const { Engine } = await import('./helpers/load-engine.mjs');
await import('../src/ui/dom-adapter.js');
const UI = window.SanguoshaUI;
const $ = dom.$;
const start = makeStartGameViaUI($, UI);

test('AA3 full UI confirms the engine selection request and applies its declared skill and identity', () => {
  const game = start('zuoci', 'caocao');
  GeneralCardRuntime.draw(game, 'player', 100);
  const before = GeneralCardRuntime.census(game);
  const result = Engine.requestGeneralSelection(game, 'player', { reason: '选择武将牌与技能', optional: true });
  assert.equal(result.ok, true); UI.render();
  assert.equal($('generalCardPanel').hidden, false);
  $('generalCardOptions').dispatchClick({ 'data-general-hero-id': 'sunshangxiang' });
  assert.equal($('generalCardConfirmBtn').disabled, true);
  $('generalCardSkills').dispatchClick({ 'data-general-skill-id': 'xiaoji' });
  assert.equal($('generalCardConfirmBtn').disabled, false);
  $('handConfirmBtn').click();
  assert.equal(Engine.getPendingChoice(game), null);
  assert.equal($('generalCardPanel').hidden, true);
  assert.equal(Engine.generalCardView(game, 'player', 'player').activeId, 'sunshangxiang');
  assert.equal(StateRuntime.skillEnabled(game.player, 'xiaoji', game), true);
  assert.equal(Engine.effectiveGender(game.player), 'female');
  assert.equal(Engine.effectiveCamp(game.player), '吴');
  const after = GeneralCardRuntime.assertConservation(game);
  assert.deepEqual(after.ids, before.ids);
});

test('AA3 full UI common cancel respects required requests and optional general-only selection', () => {
  const game = start('zuoci', 'caocao');
  GeneralCardRuntime.draw(game, 'player', 100);
  assert.equal(Engine.requestGeneralSelection(game, 'player', { optional: false, applySkill: false }).ok, true);
  UI.render(); const required = Engine.getPendingChoice(game);
  $('handCancelBtn').click();
  assert.equal(Engine.getPendingChoice(game), required);
  $('generalCardOptions').dispatchClick({ 'data-general-hero-id': 'zhangfei' });
  $('handConfirmBtn').click();
  assert.equal(Engine.getPendingChoice(game), null);
  assert.equal(Engine.generalCardView(game, 'player', 'player').activeId, 'zhangfei');
  assert.equal(Engine.requestGeneralSelection(game, 'player', { optional: true, applySkill: false }).ok, true);
  UI.render();
  assert.match($('generalCardCurrent').textContent, /当前：张飞/);
  $('handCancelBtn').click();
  assert.equal(Engine.getPendingChoice(game), null);
  assert.equal(Engine.generalCardView(game, 'player', 'player').activeId, 'zhangfei');
});

function displayedSkill(id) {
  return $('playerSkillBar').innerHTML.match(new RegExp('<button[^>]*data-skill-id="' + id + '"[^>]*>[^<]*</button>'))?.[0] || '';
}

test('AA1 UI keeps acquired inactive skills visible and disables them while the selected skill stays enabled', () => {
  const game = start('zuoci', 'caocao');
  const kurou = Engine.HERO_CATALOG.huanggai.skills.find(skill => skill.id === 'kurou');
  const zhiheng = Engine.HERO_CATALOG.sunquan.skills.find(skill => skill.id === 'zhiheng');
  StateRuntime.activateSkillSource(game.player, 'huashen', kurou); UI.render();
  assert.match(displayedSkill('kurou'), /已获得，当前有效/);
  assert.doesNotMatch(displayedSkill('kurou'), / disabled/);
  StateRuntime.activateSkillSource(game.player, 'huashen', zhiheng); UI.render();
  assert.match(displayedSkill('kurou'), / disabled/);
  assert.match(displayedSkill('kurou'), /已获得，当前无效/);
  assert.match(displayedSkill('kurou'), /苦肉·当前无效/);
  assert.doesNotMatch(displayedSkill('zhiheng'), / disabled/);
});

test('AA1 UI preference toggles cannot re-enable an inactive acquired skill', () => {
  const game = start('zuoci', 'caocao');
  const luoyi = Engine.HERO_CATALOG.xuchu.skills.find(skill => skill.id === 'luoyi');
  const paoxiao = Engine.HERO_CATALOG.zhangfei.skills.find(skill => skill.id === 'paoxiao');
  StateRuntime.activateSkillSource(game.player, 'huashen', luoyi); UI.render();
  assert.match(displayedSkill('luoyi'), /data-skill-toggle="luoyi"/);
  assert.doesNotMatch(displayedSkill('luoyi'), / disabled/);
  StateRuntime.activateSkillSource(game.player, 'huashen', paoxiao); UI.render();
  assert.match(displayedSkill('luoyi'), / disabled/);
  assert.match(displayedSkill('luoyi'), /当前未选用此技能/);
});

test('AA1 UI keeps native skill labels intact and disables suppressed native preference toggles', () => {
  const game = start('xuchu', 'caocao');
  assert.match(displayedSkill('luoyi'), />裸衣·自动发动<\/button>/);
  assert.doesNotMatch(displayedSkill('luoyi'), / disabled|已获得/);
  game.player.chanyuan = true; game.player.hp = 1; UI.render();
  assert.match(displayedSkill('luoyi'), / disabled/);
  assert.match(displayedSkill('luoyi'), /受到缠怨限制/);
  game.player.hp = 2; UI.render();
  assert.doesNotMatch(displayedSkill('luoyi'), / disabled|当前无效/);
  assert.match(displayedSkill('luoyi'), />裸衣·自动发动<\/button>/);
});

test('AA1 UI stale preference clicks recheck current ownership and effectiveness', () => {
  const game = start('zuoci', 'caocao');
  const luoyi = Engine.HERO_CATALOG.xuchu.skills.find(skill => skill.id === 'luoyi');
  const paoxiao = Engine.HERO_CATALOG.zhangfei.skills.find(skill => skill.id === 'paoxiao');
  const click = () => $('playerSkillBar').dispatchClick({ 'data-skill-id': 'luoyi', 'data-skill-toggle': 'luoyi' });
  StateRuntime.activateSkillSource(game.player, 'huashen', luoyi); UI.render();
  StateRuntime.activateSkillSource(game.player, 'huashen', paoxiao);
  click();
  assert.equal(Engine.getSkillPreference(game, 'player', 'luoyi'), null);
  assert.match(displayedSkill('luoyi'), / disabled/);
  StateRuntime.activateSkillSource(game.player, 'huashen', luoyi); UI.render();
  click();
  assert.equal(Engine.getSkillPreference(game, 'player', 'luoyi'), 'decline');
  StateRuntime.clearSkillSource(game.player, 'huashen');
  click();
  assert.equal(Engine.getSkillPreference(game, 'player', 'luoyi'), 'decline');
  assert.equal(displayedSkill('luoyi'), '');
});

await runTests();
