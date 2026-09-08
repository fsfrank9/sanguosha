import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Engine, StateRuntime as S, HERO_CATALOG } from './helpers/load-engine.mjs';
import { GeneralCardRuntime as G } from '../src/engine/general-card-runtime.js';
import { collectCardCensus } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

test('AA1 production has no legacy query callers or aliases outside the counted compatibility shell', () => {
  const root = path.resolve('src');
  function files(dir) { return fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry =>
    entry.isDirectory() ? files(path.join(dir,entry.name)) : [path.join(dir,entry.name)]); }
  for (const file of files(root).filter(file => file.endsWith('.js'))) {
    let source = fs.readFileSync(file,'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,'');
    if (file === path.join(root,'engine/state.js')) {
      assert.match(source, /function hasSkill\(state, skillId, game\)\s*\{\s*return SkillRuntime\.legacyHasSkill\(state, skillId, game\);\s*\}/);
      source = source.replace(/function hasSkill\(state, skillId, game\)\s*\{[\s\S]*?\}/, '')
        .replace(/hasSkill:\s*hasSkill,/, '');
    }
    assert.doesNotMatch(source,/\bhasSkill\b/,path.relative(root,file));
  }
});

test('AA1 real seeded turns, AI estimates and responses use zero legacy calls', () => {
  S.resetLegacySkillQueryCount();
  const heroes=['caocao','guanyu','zhaoyun','xuchu','yuji','zhanghe','sp_yuanshu','zhoutai'];
  for (let i=0;i<heroes.length;i++) {
    const game=Engine.newGame({seed:164100+i,playerHero:heroes[i],enemyHero:heroes[(i+3)%heroes.length]});
    for (let step=0;step<5 && game.phase!=='gameover';step++) {
      if (game.pendingChoice) {
        const result=Engine.resolvePendingChoice(game,{decline:true});
        if (!result.ok) break;
      } else Engine.runAITurn(game,game.turn || 'enemy',4);
      for (const actor of game.seats) {
        Engine.skillsForActor(game,actor); Engine.handLimit(game,actor);
        Engine.aiEstimateShaCountFor(game,actor,actor);
        Engine.aiEstimateShanCountFor(game,actor,actor);
      }
    }
  }
  assert.equal(S.readLegacySkillQueryCount(),0);
});

// A foundation stress gate, not automatic Huashen/Xinsheng content. It uses the
// real selection dispatcher but does not change the catalog implementation list.
test('AA3 600 seeds conserve separate general and game-card resources across source switches and JSON resumes', () => {
  let operations=0;
  for (let seed=1;seed<=600;seed++) {
    const seats=['player','enemy','ally','ally2','ally3'].slice(0,3+seed%3);
    let game=Engine.newGame({seed:164200+seed,seats,playerHero:'zuoci',enemyHero:'caocao',
      allyHero:'guanyu',ally2Hero:'zhenji',ally3Hero:'zhouyu'});
    const cards=collectCardCensus(game).ids;
    const ordinaryDeck=game.deck.map(card=>card.id);
    const owners={};
    for (const actor of seats) {
      S.grantSkill(game[actor],'huashen','化身');
      owners[actor]=game[actor].heroId;
    }
    for (let step=0;step<30;step++) {
      const actor=seats[(seed+step)%seats.length];
      G.draw(game,actor,1+(seed+step)%3);
      G.assertConservation(game);
      const result=Engine.requestGeneralSelection(game,actor,{ask:true});
      if (result.ok && game.pendingChoice) {
        const pending=game.pendingChoice;
        const options=pending.options.filter(entry=>!entry.disabledReason && entry.skills?.length);
        const option=options[(seed+step)%options.length];
        const skill=option.skills[(seed+step)%option.skills.length];
        const previous=JSON.stringify(game);
        if (step%7===0) game=JSON.parse(previous);
        assert.equal(Engine.resolvePendingChoice(game,{choiceId:pending.choiceId,heroId:option.heroId,skillId:skill.id}).ok,true);
        assert.equal(S.skillEnabled(game[actor],skill.id,game),true);
        assert.equal(S.effectiveCamp(game[actor]),HERO_CATALOG[option.heroId].camp);
        assert.equal(game[actor].heroId,owners[actor]);
      }
      if (step%6===0) {
        S.stripAllSkills(game[actor],game);
        assert.equal(G.view(game,actor,actor).hiddenCount,0);
        assert.equal(G.view(game,actor,actor).activeId,null);
        S.grantSkill(game[actor],'huashen','化身');
      }
      G.assertConservation(game);
      const current=collectCardCensus(game);
      assert.deepEqual(current.ids,cards);
      assert.equal(current.zoneDuplicates.length,0);
      assert.deepEqual(game.deck.map(card=>card.id),ordinaryDeck);
      operations++;
    }
  }
  assert.equal(S.readLegacySkillQueryCount(),0);
  console.log(`AA3 foundation soak: 600 seeds / ${operations} operations; both resource sets conserved.`);
});

await runTests();
