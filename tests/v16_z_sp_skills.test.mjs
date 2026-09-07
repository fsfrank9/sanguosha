import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Engine, c } from './helpers/load-engine.mjs';
import { StateRuntime } from '../src/engine/state.js';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function game(heroes = ['sp_yuanshu', 'liushan', 'liubei'], roles = ['忠臣', '主公', '反贼']) {
  const seats = ['player', 'enemy', 'ally'];
  const g = Engine.newGame({ seed: 88031, seats, roles: Object.fromEntries(seats.map((s, i) => [s, roles[i]])),
    playerHero: heroes[0], enemyHero: heroes[1], allyHero: heroes[2] });
  for (const s of seats) {
    Object.assign(g[s], { hand: [], judgeArea: [], flags: {}, skillPreferences: { xiangle: 'decline', fangquan: 'decline', guicai: 'auto', guidao: 'decline' },
      equipment: { weapon: null, armor: null, horsePlus: null, horseMinus: null } });
    g[s].hp = g[s].maxHp;
  }
  Object.assign(g, { turn: 'player', phase: 'play', pendingChoice: null, pendingChoiceQueue: [], pauseState: {}, discard: [], log: [] });
  g.deck = Array.from({ length: 80 }, (_, i) => c('sha', { id: 'deck-' + i, suit: 'spade', rank: '5' }));
  return g;
}
const hand = (n, stem = 'h') => Array.from({ length: n }, (_, i) => c('shan', { id: stem + i }));

test('Z1 official source hashes pin three skills and BOTH full Ruoyu order examples plus response prohibition', () => {
  const spec = JSON.parse(fs.readFileSync(new URL('./fixtures/official_sp_skill_specs.json', import.meta.url)));
  const skills = spec.heroes.flatMap(hero => hero.skills);
  for (const ref of [...skills, ...spec.interactions]) {
    const [file, number] = ref.sourceLine.split(':');
    const line = fs.readFileSync(new URL('../official-skill-cache/gltjk-sanguosha-rules/pages/' + file, import.meta.url), 'utf8').split('\n')[Number(number) - 1];
    assert.equal(crypto.createHash('sha256').update(line).digest('hex'), ref.sourceTextSha256);
  }
  assert.equal(skills.length, 3);
  assert.equal(spec.interactions.length, 3);
});

test('单骑: exactly hand > hp plus Cao Cao lord; mandatory awakening grants Ma Shu once and clips hp', () => {
  const g = game(['sp_guanyu', 'caocao', 'liubei']);
  g.player.hand = hand(5); g.player.skillPreferences.danji = 'decline';
  const before = Engine.distanceBetween(g, 'player', 'enemy');
  Engine.startTurn(g, 'player');
  assert.equal(g.player.maxHp, 3); assert.equal(g.player.hp, 3);
  assert.equal(g.player.flags.danjiAwakened, true);
  assert.equal(StateRuntime.hasSkill(g.player, 'mashu'), true);
  assert.equal(Engine.distanceBetween(g, 'player', 'enemy'), Math.max(1, before - 1));
  Engine.startTurn(g, 'player'); assert.equal(g.player.maxHp, 3);
});
for (const [label, heroes, n] of [['equal hand', ['sp_guanyu','caocao','liubei'], 4], ['Cao Cao non-lord', ['sp_guanyu','liubei','caocao'], 5]]) {
  test('单骑 does not awaken: ' + label, () => {
    const g = game(heroes); g.player.hand = hand(n); Engine.startTurn(g, 'player');
    assert.equal(g.player.maxHp, 4); assert.ok(!g.player.flags.danjiAwakened);
  });
}

test('庸肆 draw X counts distinct living camps, ignores duplicate and dead camp', () => {
  const g = game(['sp_yuanshu', 'caocao', 'sp_guanyu']);
  g.turn = 'player'; g.phase = 'judge'; Engine.advancePhase(g);
  assert.equal(g.player.hand.length, 4);
  g.ally.hp = 0; g.enemy.camp = '群'; g.player.hand = []; g.phase = 'judge'; Engine.advancePhase(g);
  assert.equal(g.player.hand.length, 3);
});

test('庸肆 mandatory equipment+hand discard precedes normal hand-limit discard; invalid payment atomic', () => {
  const g = game(['sp_yuanshu','caocao','sunquan']);
  g.player.hand = hand(7); g.player.equipment.weapon = c('zhuge', { id: 'bow' });
  Engine.finishPlayPhase(g); assert.equal(g.pendingChoice.kind, 'yongsi-discard'); assert.equal(g.pendingChoice.count, 3);
  assert.equal(Engine.resolvePendingChoice(g, { cardIds: ['h0','h0','bow'] }).ok, false);
  assert.equal(g.player.hand.length, 7); assert.equal(g.player.equipment.weapon.id, 'bow');
  assertCardConservation(g, () => Engine.resolvePendingChoice(g, { cardIds: ['h0','h1','bow'] }));
  assert.equal(g.player.equipment.weapon, null); assert.equal(g.player.hand.length, 5);
  assert.equal(Engine.getDiscardCount(g, 'player'), 1);
  assert.equal(Engine.advancePhase(g).ok, false);
  Engine.discardSelected(g, 'player', ['h2']); assert.equal(Engine.advancePhase(g).ok, true);
});

test('庸肆 samples fresh discard-start camps; cannot decline, shortage discards all without requesting extra cards', () => {
  const g = game(['sp_yuanshu','caocao','sunquan']);
  g.player.hand = hand(1); g.player.equipment.weapon = c('zhuge',{id:'only-equip'});
  assertCardConservation(g, () => Engine.finishPlayPhase(g));
  assert.equal(g.player.hand.length, 0); assert.equal(g.player.equipment.weapon, null); assert.equal(g.pendingChoice, null);
  const h = game(['sp_yuanshu','caocao','sunquan']); h.player.hand = hand(5); h.ally.hp = 0;
  Engine.finishPlayPhase(h); assert.equal(h.pendingChoice.count, 2);
  assert.equal(Engine.resolvePendingChoice(h, { decline: true }).ok, false);
});

test('庸肆 equipment loss triggers Xiaoji; newly drawn cards do not increase initial mandatory discard count', () => {
  const g = game(['sp_yuanshu','caocao','sunquan']);
  StateRuntime.grantSkill(g.player,'xiaoji','枭姬'); g.player.hand = hand(1);
  g.player.equipment.weapon = c('zhuge',{id:'xiaoji-equip'});
  assertCardConservation(g, () => Engine.finishPlayPhase(g));
  assert.equal(g.player.hand.length, 2); assert.equal(g.pendingChoice, null);
});

test('Weidi official example 1a: lord first awakens; borrowed Jijiang vanishes entirely when lord loses all', () => {
  const g = game(); g.enemy.hp = 1; Engine.startTurn(g, 'enemy');
  assert.equal(Engine.hasLordSkill(g,'player','jijiang'), true);
  assert.equal(g.player.skills.some(s => s.id === 'jijiang'), false);
  StateRuntime.stripAllSkills(g.enemy);
  assert.equal(Engine.hasLordSkill(g,'player','ruoyu'), false);
  assert.equal(Engine.skillsForActor(g,'player').some(s=>s.id==='jijiang'), false);
});

test('Weidi official example 1b: lord then Yuan Shu awakens; intrinsic Jijiang remains but unusable after lord loses all', () => {
  const g = game(); g.enemy.hp = 1; Engine.startTurn(g, 'enemy');
  g.player.hp = 1; Engine.startTurn(g, 'player');
  assert.equal(g.player.flags.ruoyuAwakened, true); assert.equal(g.player.maxHp, 5);
  assert.equal(g.player.skills.some(s=>s.id==='jijiang'), true); assert.equal(Engine.hasLordSkill(g,'player','jijiang'), true);
  StateRuntime.stripAllSkills(g.enemy);
  assert.equal(StateRuntime.hasSkill(g.player,'jijiang'), true); assert.equal(Engine.hasLordSkill(g,'player','jijiang'), false);
  assert.equal(Engine.useSkill(g,'player','jijiang',[],{target:'ally'}).ok, false);
});

test('Weidi official example 2: Yuan Shu first gains dormant Jijiang, lord awakening enables it, later lord loss disables without stripping', () => {
  const g = game(); g.player.hp = 1; Engine.startTurn(g,'player');
  assert.equal(StateRuntime.hasSkill(g.player,'jijiang'), true); assert.equal(Engine.hasLordSkill(g,'player','jijiang'), false);
  g.enemy.hp = 1; Engine.startTurn(g,'enemy'); assert.equal(Engine.hasLordSkill(g,'player','jijiang'), true);
  StateRuntime.stripAllSkills(g.enemy); assert.equal(StateRuntime.hasSkill(g.player,'jijiang'), true);
  assert.equal(Engine.hasLordSkill(g,'player','jijiang'), false); assert.equal(Engine.hasLordSkill(g,'player','ruoyu'), false);
});

test('Weidi live view survives JSON clone; own Chanyuan disables it; losing Weidi removes all borrowed skills', () => {
  const g = game(['sp_yuanshu','caocao','liubei']);
  const copy = JSON.parse(JSON.stringify(g));
  assert.equal(Engine.hasLordSkill(copy,'player','hujia'), true);
  copy.player.chanyuan = true; copy.player.hp = 1; assert.equal(Engine.hasLordSkill(copy,'player','hujia'), false);
  copy.player.hp = 2; copy.player.skills = []; assert.equal(Engine.hasLordSkill(copy,'player','hujia'), false);
  assert.equal(Engine.hasLordSkill(g,'player','hujia'), true);
});

test('Weidi Hujia accepts ordinary lord card response but never invokes a second lord skill recursively', () => {
  const g = game(['sp_yuanshu','caocao','liubei'],['忠臣','主公','反贼']);
  g.enemy.hand = [c('shan',{id:'lord-shan'})]; g.ally.hand=[c('sha',{id:'strike'})]; g.turn='ally';
  const hp=g.player.hp; Engine.playCard(g,'ally','strike',{target:'player'});
  if (g.pendingChoice?.kind === 'shan-response') Engine.resolvePendingChoice(g,{decline:true});
  assert.equal(g.player.hp,hp); assert.equal(g.enemy.hand.length,0);
  const h = game(['sp_yuanshu','liubei','guanyu'],['忠臣','主公','忠臣']);
  h.enemy.hand=[]; h.ally.hand=[c('sha',{id:'ally-sha'})];
  Engine.useSkill(h,'player','jijiang',[],{target:'enemy'});
  assert.ok(h.log.some(line=>line.includes('响应【激将】'))); assert.equal(h.ally.hand.length,0);
});

test('Weidi Xueyi counts other living Qun from Yuan Shu; each Songwei holder receives own reward', () => {
  const g=game(['sp_yuanshu','yuanshao','huatuo']);
  assert.equal(Engine.handLimit(g,'player'), g.player.hp+4);
  g.ally.hp=0; assert.equal(Engine.handLimit(g,'player'),g.player.hp+2);
  const h=game(['sp_yuanshu','caopi','caocao']);
  h.ally.judgeArea=[c('lebusishu',{id:'delay',suit:'club'})];
  const p=h.player.hand.length, e=h.enemy.hand.length; Engine.startTurn(h,'ally');
  assert.equal(h.player.hand.length,p+1); assert.equal(h.enemy.hand.length,e+1);
});

test('Weidi Huangtian selects Yuan Shu as recipient and respects other-role relation', () => {
  const g=game(['sp_yuanshu','zhangjiao','huatuo'],['忠臣','主公','忠臣']);
  g.turn='ally'; g.ally.hand=[c('shan',{id:'gift'})];
  assert.equal(Engine.useSkill(g,'ally','huangtian',['gift'],{target:'player'}).ok,true);
  assert.equal(g.player.hand[0].id,'gift'); assert.equal(g.enemy.hand.length,0);
});

test('Weidi Jiuyuan increases Wu rescue recovery for Yuan Shu and disappears with lord skill loss', () => {
  const g=game(['sp_yuanshu','sunquan','lvbu'],['忠臣','主公','反贼']);
  g.player.hp=1; g.enemy.hand=[c('tao',{id:'wu-rescue'})];
  g.ally.hand=[c('sha',{id:'rescue-strike'})]; g.turn='ally';
  Engine.playCard(g,'ally','rescue-strike',{target:'player'});
  if(g.pendingChoice?.kind==='shan-response') Engine.resolvePendingChoice(g,{decline:true});
  assert.equal(g.player.hp,2); assert.equal(g.enemy.hand.length,0);
  StateRuntime.stripAllSkills(g.enemy); assert.equal(Engine.hasLordSkill(g,'player','jiuyuan'),false);
});

test('Weidi Baonue resolves one judgement for each eligible holder and heals them separately', () => {
  const g=game(['sp_yuanshu','dongzhuo','huaxiong']);
  g.player.hp=3; g.enemy.hp=5; g.ally.hand=[c('sha',{id:'baonue-strike'})]; g.turn='ally';
  Engine.playCard(g,'ally','baonue-strike',{target:'player'});
  if(g.pendingChoice?.kind==='shan-response') Engine.resolvePendingChoice(g,{decline:true});
  assert.equal(g.player.hp,3); assert.equal(g.enemy.hp,6);
  assert.equal(g.log.filter(line=>line.includes('【暴虐】判定为黑桃')).length,2);
});

test('Weidi Zhiba accepts alternate holder and awards both comparison cards to Yuan Shu', () => {
  const g=game(['sp_yuanshu','sunce','sunquan'],['忠臣','主公','忠臣']);
  g.player.hand=[c('sha',{id:'zb-high',rank:'K'})]; g.ally.hand=[c('sha',{id:'zb-low',rank:'2'})]; g.turn='ally';
  assert.equal(Engine.useSkill(g,'ally','zhiba',[],{target:'player'}).ok,true);
  while(g.pendingChoice?.kind==='pindian-card') Engine.resolvePendingChoice(g,{cardId:g.pendingChoice.options[0].cardId});
  assert.equal(g.player.hand.length,2); assert.equal(g.enemy.hand.length,0);
});

test('Weidi Huangtian quota is per holder: lord and Yuan Shu once each, repeat same holder rejected', () => {
  const g=game(['sp_yuanshu','zhangjiao','huatuo'],['忠臣','主公','忠臣']);
  g.turn='ally'; g.ally.hand=hand(3,'quota');
  assert.equal(Engine.useSkill(g,'ally','huangtian',['quota0'],{target:'enemy'}).ok,true);
  assert.equal(Engine.useSkill(g,'ally','huangtian',['quota1'],{target:'enemy'}).ok,false);
  assert.equal(Engine.useSkill(g,'ally','huangtian',['quota1'],{target:'player'}).ok,true);
  assert.equal(g.ally.hand.length,1);
});

test('Weidi Zhiba quota is per holder and counts declined comparisons', () => {
  const g=game(['sp_yuanshu','sunce','sunquan'],['忠臣','主公','忠臣']);
  g.turn='ally'; g.player.hand=hand(1,'py'); g.enemy.hand=hand(1,'ey'); g.ally.hand=hand(1,'ay');
  g.player.flags.hunziAwakened=true; g.enemy.flags.hunziAwakened=true;
  g.player.skillPreferences.zhiba='decline'; g.enemy.skillPreferences.zhiba='decline';
  assert.equal(Engine.useSkill(g,'ally','zhiba',[],{target:'enemy'}).ok,true);
  assert.equal(Engine.useSkill(g,'ally','zhiba',[],{target:'enemy'}).ok,false);
  assert.equal(Engine.useSkill(g,'ally','zhiba',[],{target:'player'}).ok,true);
});

test('庸肆 + 固政 returns a discarded HAND card then acquires other discarded equipment', () => {
  const g=game(['sp_yuanshu','erzhang','caocao']);
  g.player.hand=hand(1,'gz');g.player.equipment.weapon=c('zhuge',{id:'gz-equip'});
  assertCardConservation(g,()=>{Engine.finishPlayPhase(g);Engine.advancePhase(g);});
  assert.equal(g.player.hand[0].id,'gz0'); assert.equal(g.enemy.hand[0].id,'gz-equip');
  const h=game(['sp_yuanshu','erzhang','caocao']);h.player.equipment.weapon=c('zhuge',{id:'no-hand'});
  Engine.finishPlayPhase(h);Engine.advancePhase(h);
  assert.equal(h.enemy.hand.length,0);assert.equal(h.discard[0].id,'no-hand');
});

test('庸肆 AI uses defensive discard value to retain wounded Tao when equipment can fund cost', () => {
  const g=game(['liubei','sp_yuanshu','caocao'],['主公','反贼','忠臣']);g.turn='enemy';
  g.enemy.hp=3;g.enemy.hand=[c('tao',{id:'keep-tao'})];
  g.enemy.equipment={weapon:c('zhuge',{id:'pay-w'}),armor:c('bagua',{id:'pay-a'}),horsePlus:c('plus_horse',{id:'pay-h'}),horseMinus:null};
  Engine.finishPlayPhase(g);
  assert.equal(g.enemy.hand.length,1);assert.equal(g.enemy.hand[0].id,'keep-tao');
  assert.equal(g.enemy.equipment.weapon,null);assert.equal(g.enemy.equipment.armor,null);assert.equal(g.enemy.equipment.horsePlus,null);
});

test('Baonue retains source camp sampled before damage across a dying-response pause', () => {
  const g=game(['sp_yuanshu','dongzhuo','huaxiong']);
  g.player.hp=1;g.player.hand=[c('tao',{id:'camp-save'})];g.enemy.hp=5;
  g.ally.hand=[c('sha',{id:'camp-strike'})];g.turn='ally';
  Engine.playCard(g,'ally','camp-strike',{target:'player'});
  if(g.pendingChoice?.kind==='shan-response')Engine.resolvePendingChoice(g,{decline:true});
  assert.equal(g.pendingChoice.kind,'dying-rescue');
  g.ally.camp='魏';
  Engine.resolvePendingChoice(g,{use:true,cardId:'camp-save'});
  assert.equal(g.player.hp,2);assert.equal(g.enemy.hp,6);
});

test('Weidi Huangtian AI cannot infer an unrevealed recipient role through gift choice', () => {
  const g=game(['zhangjiao','huatuo','sp_yuanshu'],['主公','反贼','反贼']);
  g.turn='enemy';g.hiddenRoles=true;g.roleRevealed={player:true,enemy:false,ally:false};g.aggressionLog=[];g.stanceLog=[];
  g.enemy.hand=hand(2,'hidden-gift');
  g.enemy.flags.huangtianUsed=true;g.enemy.flags.huangtianUsedAgainst={player:true};
  const first=Engine.aiChooseSkillAction(g,'enemy');
  g.roles.ally='忠臣';
  const second=Engine.aiChooseSkillAction(g,'enemy');
  assert.deepEqual(first,second);assert.notEqual(first?.skillId,'huangtian');
});

await runTests();
