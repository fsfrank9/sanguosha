import assert from 'node:assert/strict';
import { SkillRuntime } from '../src/engine/skill-runtime.js';
import { StateRuntime } from '../src/engine/state.js';
import { test, runTests } from './helpers/harness.mjs';

const S = StateRuntime;
function state(skills = [], extras = {}) {
  return Object.assign({ hp: 3, maxHp: 3, camp: '群', gender: 'male', skills: skills.map(id => ({ id, name: id })), flags: {} }, extras);
}
function identityGame() {
  return { seats: ['player','enemy','ally'], roles: {player:'忠臣',enemy:'主公',ally:'反贼'},
    player: state(['weidi']), enemy: state(['ruoyu']), ally: state([]) };
}

test('AA1 native, absent, dynamic enabled and dynamic inactive states remain distinguishable', () => {
  const st = state(['mashu']);
  assert.equal(S.ownsSkill(st, 'mashu'), true);
  assert.equal(S.skillEnabled(st, 'mashu'), true);
  assert.equal(S.skillState(st, 'qicai').disabledReason, 'not-owned');
  assert.equal(S.activateSkillSource(st, 'huashen', {id:'qicai',name:'奇才'}), true);
  assert.equal(S.skillEnabled(st,'qicai'), true);
  S.activateSkillSource(st,'huashen',{id:'paoxiao',name:'咆哮'});
  assert.equal(S.ownsSkill(st,'qicai'),true);
  assert.equal(S.skillEnabled(st,'qicai'),false);
  assert.equal(S.skillState(st,'qicai').disabledReason,'source-inactive');
  assert.equal(S.skillEnabled(st,'paoxiao'),true);
  assert.equal(S.skillEnabled(st,'mashu'),true);
});

test('AA1 reselecting a historical Huashen skill reactivates without granting or resetting its counts', () => {
  const st=state(['huashen']);
  S.activateSkillSource(st,'huashen',{id:'zhiheng',name:'制衡'});
  st.flags.zhihengUsed=true;
  S.activateSkillSource(st,'huashen',{id:'qicai',name:'奇才'});
  assert.equal(S.activateSkillSource(st,'huashen',{id:'zhiheng',name:'制衡'}),false);
  assert.equal(st.dynamicSkills.length,2);
  assert.equal(st.flags.zhihengUsed,true);
  assert.equal(S.skillEnabled(st,'zhiheng'),true);
  assert.equal(S.skillEnabled(st,'qicai'),false);
});

test('AA1 native skill survives an inactive Huashen copy; passive modifiers count the ID once', () => {
  const st=state(['mashu']);
  S.activateSkillSource(st,'huashen',{id:'mashu'});
  assert.equal(S.skillEntries(st).filter(s=>s.id==='mashu').length,1);
  assert.equal(SkillRuntime.sumPassiveEffect(st,'outgoingDistance'),-1);
  S.activateSkillSource(st,'huashen',{id:'qicai'});
  assert.equal(S.skillEnabled(st,'mashu'),true);
  assert.equal(SkillRuntime.sumPassiveEffect(st,'outgoingDistance'),-1);
  assert.deepEqual(S.skillState(st,'mashu').sources.map(s=>[s.source,s.enabled]),[['native',true],['huashen',false]]);
});

test('AA1 independent source activation and clearing never disable another source or native grant', () => {
  const st=state([]);
  S.activateSkillSource(st,'huashen',{id:'mashu'});
  S.activateSkillSource(st,'temporary',{id:'mashu'});
  S.activateSkillSource(st,'huashen',{id:'qicai'});
  assert.equal(S.skillEnabled(st,'mashu'),true);
  assert.equal(S.grantSkill(st,'mashu','马术'),true);
  assert.equal(S.grantSkill(st,'mashu','马术'),false);
  assert.equal(S.clearSkillSource(st,'temporary'),1);
  assert.equal(S.skillEnabled(st,'mashu'),true);
  assert.equal(S.clearSkillSource(st,'huashen'),2);
  assert.equal(S.ownsSkill(st,'qicai'),false);
  assert.equal(S.skillState(st,'mashu').sources[0].source,'granted');
});

test('AA1 Chanyuan suppresses native and acquired effects through the same reducer while preserving ownership', () => {
  const st=state(['mashu','chanyuan'],{hp:1});
  S.activateSkillSource(st,'huashen',{id:'qicai'});
  assert.equal(S.ownsSkill(st,'mashu'),true);
  assert.equal(S.ownsSkill(st,'qicai'),true);
  assert.equal(S.skillEnabled(st,'mashu'),false);
  assert.equal(S.skillEnabled(st,'qicai'),false);
  assert.equal(S.skillEnabled(st,'chanyuan'),true);
  assert.equal(SkillRuntime.sumPassiveEffect(st,'outgoingDistance'),0);
  assert.equal(SkillRuntime.hasPassiveEffect(st,'ignoreTrickDistance'),false);
  st.hp=2;
  assert.equal(SkillRuntime.sumPassiveEffect(st,'outgoingDistance'),-1);
  assert.equal(SkillRuntime.hasPassiveEffect(st,'ignoreTrickDistance'),true);
});

test('AA1 virtual equipment uses acquired effective skills and loses its effect on source switch', () => {
  const st=state([], {equipment:{armor:null}});
  S.activateSkillSource(st,'huashen',{id:'bazhen'});
  assert.equal(S.hasEquipmentEffect(st,'baguaShanJudge'),true);
  S.activateSkillSource(st,'huashen',{id:'qicai'});
  assert.equal(S.hasEquipmentEffect(st,'baguaShanJudge'),false);
  assert.equal(S.ownsSkill(st,'bazhen'),true);
});

test('AA1 Weidi joins the reducer as a live derived source and never writes granted rows', () => {
  const game=identityGame();
  assert.equal(S.skillEnabled(game.player,'ruoyu',game),true);
  assert.equal(S.skillState(game.player,'ruoyu',game).sources[0].source,'weidi');
  assert.equal(game.player.skills.length,1);
  S.grantSkill(game.enemy,'jijiang','激将',{lord:true});
  assert.equal(S.hasLordSkill(game,'player','jijiang'),true);
  assert.equal(S.skillsForActor(game,'player').filter(s=>s.id==='jijiang').length,1);
  S.stripAllSkills(game.enemy);
  assert.equal(S.ownsSkill(game.player,'ruoyu',game),false);
  assert.equal(S.ownsSkill(game.player,'jijiang',game),false);
});

test('AA1 Ruoyu gained Jijiang ownership persists while its lord qualification changes independently', () => {
  const game=identityGame();
  S.grantSkill(game.player,'jijiang','激将',{lord:true});
  assert.equal(S.ownsSkill(game.player,'jijiang',game),true);
  assert.equal(S.skillEnabled(game.player,'jijiang',game),false);
  assert.equal(S.skillState(game.player,'jijiang',game).disabledReason,'lord-ineligible');
  S.grantSkill(game.enemy,'jijiang','激将',{lord:true});
  assert.equal(S.skillEnabled(game.player,'jijiang',game),true);
  S.stripAllSkills(game.enemy);
  assert.equal(S.ownsSkill(game.player,'jijiang',game),true);
  assert.equal(S.skillEnabled(game.player,'jijiang',game),false);
});

test('AA1 Weidi copies lord ownership even when lord is suppressed; own suppression still disables it', () => {
  const game=identityGame();
  game.enemy.chanyuan=true;game.enemy.hp=1;
  assert.equal(S.skillEnabled(game.enemy,'ruoyu',game),false);
  assert.equal(S.skillEnabled(game.player,'ruoyu',game),true);
  game.player.chanyuan=true;game.player.hp=1;
  assert.equal(S.hasLordSkill(game,'player','ruoyu'),false);
  assert.equal(S.ownsSkill(game.player,'ruoyu',game),false,'suppressed Weidi no longer supplies a viewed ownership source');
});

test('AA1 intrinsic lord skill is usable only by actual lord or a qualified Weidi holder in game context', () => {
  const game=identityGame();
  game.ally.skills=[{id:'ruoyu',lord:true}];
  assert.equal(S.skillEnabled(game.enemy,'ruoyu',game),true);
  assert.equal(S.skillEnabled(game.ally,'ruoyu',game),false);
  assert.equal(S.hasLordSkill(game,'ally','ruoyu'),false);
  assert.equal(S.ownsSkill(game.ally,'ruoyu',game),true);
});

test('AA1 JSON clones keep independent skill source history, skill metadata and live Weidi lookup', () => {
  const game=identityGame();
  S.activateSkillSource(game.player,'huashen',{id:'mashu',hooks:['passive']});
  const copy=JSON.parse(JSON.stringify(game));
  S.activateSkillSource(copy.player,'huashen',{id:'qicai'});
  S.stripAllSkills(copy.enemy);
  assert.equal(S.skillEnabled(game.player,'mashu',game),true);
  assert.equal(S.skillEnabled(copy.player,'mashu',copy),false);
  assert.equal(S.hasLordSkill(game,'player','ruoyu'),true);
  assert.equal(S.hasLordSkill(copy,'player','ruoyu'),false);
  assert.doesNotThrow(()=>JSON.stringify(copy));
});

test('AA1 losing all skills removes every source and Chanyuan but preserves marks and already activated effects', () => {
  const tian=[{id:'field'}],chuang=[{id:'scar'}];
  const st=state(['huashen','chanyuan'],{chanyuan:true,tian,chuang,flags:{tianyiWon:true,shuangxiongColor:'red'}});
  S.activateSkillSource(st,'huashen',{id:'mashu'});
  S.activateSkillSource(st,'huashen',{id:'qicai'});
  S.setIdentityOverride(st,'huashen',{camp:'魏',gender:'female'});
  assert.equal(S.stripAllSkills(st),4);
  assert.equal(S.skillEntries(st).length,0);
  assert.equal(st.chanyuan,undefined);
  assert.equal(st.identityOverride,undefined);
  assert.equal(st.tian,tian);assert.equal(st.chuang,chuang);
  assert.equal(st.flags.tianyiWon,true);assert.equal(st.flags.shuangxiongColor,'red');
  S.grantSkill(st,'mashu','马术');st.hp=1;
  assert.equal(S.skillEnabled(st,'mashu'),true,'removed Chanyuan cannot suppress later newly granted skills');
});

test('AA1 loss integration callback observes previous form without storing game references', () => {
  const st=state(['huashen']);const game={player:st};let called=0;
  S.setAllSkillsLostHandler((lost,current)=>{assert.equal(lost,st);assert.equal(current,game);assert.equal(S.ownsSkill(lost,'huashen'),true);called++;});
  try {S.stripAllSkills(st,game);} finally {S.setAllSkillsLostHandler(null);}
  assert.equal(called,1);assert.doesNotThrow(()=>JSON.stringify(game));
});

test('AA1 legacy hasSkill compatibility is counted while canonical queries never increment the counter', () => {
  const game=identityGame();S.grantSkill(game.player,'jijiang','激将',{lord:true});
  S.resetLegacySkillQueryCount();
  S.skillState(game.player,'jijiang',game);S.ownsSkill(game.player,'jijiang',game);S.skillEntries(game.player,game);S.hasLordSkill(game,'player','jijiang');
  assert.equal(S.readLegacySkillQueryCount(),0);
  assert.equal(S.hasSkill(game.player,'jijiang',game),true,'old compatibility reports retained intrinsic grant');
  assert.equal(S.readLegacySkillQueryCount(),1);
  S.resetLegacySkillQueryCount();assert.equal(S.readLegacySkillQueryCount(),0);
});

test('AA2 identity override is a JSON view; suppression retains chosen form and clearing restores native fields', () => {
  const st=state(['huashen']);
  S.setIdentityOverride(st,'huashen',{camp:'魏',gender:'female'});
  assert.equal(st.camp,'群');assert.equal(st.gender,'male');
  assert.equal(S.effectiveCamp(st),'魏');assert.equal(S.effectiveGender(st),'female');
  st.chanyuan=true;st.hp=1;
  assert.equal(S.effectiveCamp(st),'魏');assert.equal(S.effectiveGender(st),'female');
  const copy=JSON.parse(JSON.stringify(st));
  assert.equal(S.clearIdentityOverride(copy,'different-source'),false);
  assert.equal(S.clearIdentityOverride(copy,'huashen'),true);
  assert.equal(S.effectiveCamp(copy),'群');assert.equal(S.effectiveGender(copy),'male');
  assert.equal(S.effectiveCamp(st),'魏');
});

test('AA2 partial override leaves unspecified native attributes available', () => {
  const st=state([]);
  S.setIdentityOverride(st,'huashen',{camp:'蜀'});
  assert.equal(S.effectiveCamp(st),'蜀');assert.equal(S.effectiveGender(st),'male');
  S.setIdentityOverride(st,'huashen',{gender:'female'});
  assert.equal(S.effectiveCamp(st),'群');assert.equal(S.effectiveGender(st),'female');
});

await runTests();
