import assert from 'node:assert/strict';
import { Engine, StateRuntime as S, c } from './helpers/load-engine.mjs';
import { test, runTests } from './helpers/harness.mjs';

function fresh(playerHero='caocao',enemyHero='yuji') {
  const game=Engine.newGame({seed:164321,playerHero,enemyHero});
  game.turn='enemy';game.phase='play';game.log=[];
  for(const actor of game.seats) {
    game[actor].hand=[];game[actor].flags={};game[actor].hp=game[actor].maxHp;
    game[actor].equipment={weapon:null,armor:null,horsePlus:null,horseMinus:null};
  }
  game.deck=[c('tao',{id:'aa-draw-1'}),c('tao',{id:'aa-draw-2'})];
  return game;
}

test('AA1 granted Chanyuan without a legacy flag prevents human challenge and informs AI bluff assessment',()=>{
  const game=fresh();
  S.grantSkill(game.player,'chanyuan','缠怨');
  assert.equal(game.player.chanyuan,undefined);
  game.enemy.hand=[c('shan',{id:'aa-bluff'})];
  const action=Engine.aiTakeAction(game,'enemy');
  assert.equal(action.action,'guhuo');
  assert.equal(game.pendingChoice,null);
  assert.equal(game.enemy.hand.length,2);
  assert.equal(S.skillEnabled(game.player,'chanyuan',game),true);
});

test('AA1 effective acquired Chanyuan is excluded from AI challenge queues; loss restores eligibility',()=>{
  const game=fresh('yuji','caocao');game.turn='player';
  S.grantSkill(game.enemy,'chanyuan','缠怨');
  game.player.hand=[c('shan',{id:'aa-player-bluff'})];
  assert.equal(Engine.playGuhuoDeclare(game,'player',{cardId:'aa-player-bluff',declareType:'wuzhong'}).ok,true);
  assert.equal(game.player.hand.length,2);
  assert.ok(!game.log.some(line=>/质疑【蛊惑】！/.test(line)));
  S.stripAllSkills(game.enemy,game);
  game.player.flags.guhuoUsedThisTurn=false;
  game.player.hand=[c('shan',{id:'aa-bluff-after-loss'})];
  assert.equal(Engine.playGuhuoDeclare(game,'player',{cardId:'aa-bluff-after-loss',declareType:'wuzhong'}).ok,true);
  assert.ok(game.log.some(line=>/质疑【蛊惑】！/.test(line)));
});

await runTests();
