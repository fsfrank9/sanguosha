import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { makeStartGameViaUI } from './helpers/ui-game.mjs';
import { test, runTests } from './helpers/harness.mjs';
import { c } from './helpers/load-engine.mjs';
import { StateRuntime } from '../src/engine/state.js';
const dom=installFakeDom();
const { Engine }=await import('./helpers/load-engine.mjs');
await import('../src/ui/dom-adapter.js');
const UI=window.SanguoshaUI, $=dom.$, start=makeStartGameViaUI($,UI);

test('SP UI catalog marks 单骑 庸肆 伪帝 implemented without changing 71-hero boundary',()=>{
  assert.equal(Object.keys(Engine.HERO_CATALOG).length,71);
  for(const [hero,id] of [['sp_guanyu','danji'],['sp_yuanshu','yongsi'],['sp_yuanshu','weidi']])
    assert.equal(Engine.HERO_CATALOG[hero].skills.find(s=>s.id===id).status,'implemented');
  start('sp_guanyu','caocao'); $('lobbyHeroesBtn').click();
  assert.match($('heroBrowserGrid').innerHTML,/单骑/);
});

test('SP UI Yongsi selects hand and equipment then confirms before ordinary hand-limit discard',()=>{
  const g=start('sp_yuanshu','caocao');
  g.player.hand=Array.from({length:6},(_,i)=>c('shan',{id:'ui-h'+i}));
  g.player.equipment.weapon=c('zhuge',{id:'ui-equip'});
  Engine.finishPlayPhase(g); UI.render();
  assert.equal(g.pendingChoice.kind,'yongsi-discard'); assert.equal($('yongsiPanel').hidden,false);
  assert.equal($('yongsiConfirmBtn').disabled,true);
  assert.match($('yongsiChoices').innerHTML,/ui-equip/);
  $('yongsiChoices').dispatchClick({'data-yongsi-card-id':'ui-equip'});
  $('yongsiChoices').dispatchClick({'data-yongsi-card-id':'ui-h0'});
  assert.equal($('yongsiConfirmBtn').disabled,false); $('yongsiConfirmBtn').click();
  assert.equal(g.player.equipment.weapon,null); assert.equal(g.player.hand.length,5);
  assert.equal($('yongsiPanel').hidden,true); assert.equal(Engine.needsDiscard(g,'player'),true);
});

test('SP UI Yongsi back-to-back same-kind windows clear staged card IDs by object identity',()=>{
  const g=start('sp_yuanshu','caocao');
  g.player.hand=Array.from({length:5},(_,i)=>c('shan',{id:'stale'+i}));
  Engine.finishPlayPhase(g); UI.render();
  $('yongsiChoices').dispatchClick({'data-yongsi-card-id':'stale0'});
  $('yongsiChoices').dispatchClick({'data-yongsi-card-id':'stale1'});
  assert.equal($('yongsiConfirmBtn').disabled,false);
  g.pendingChoice={...g.pendingChoice}; UI.render();
  assert.equal($('yongsiConfirmBtn').disabled,true);
});

test('SP UI Weidi displays live borrowed Jijiang, removes it on lord loss, disables retained intrinsic Jijiang',()=>{
  const g=start('sp_yuanshu','liubei');
  g.roles={player:'忠臣',enemy:'主公'}; UI.render();
  let html=$('playerSkillBar').innerHTML;
  assert.match(html,/data-skill-id="jijiang"/);
  assert.doesNotMatch(html, /data-skill-id="jijiang"[^>]*disabled/);
  StateRuntime.stripAllSkills(g.enemy); UI.render();
  assert.doesNotMatch($('playerSkillBar').innerHTML,/data-skill-id="jijiang"/);
  StateRuntime.grantSkill(g.player,'jijiang','激将'); UI.render();
  assert.match($('playerSkillBar').innerHTML,/data-skill-id="jijiang"[^>]*disabled/);
});

await runTests();
