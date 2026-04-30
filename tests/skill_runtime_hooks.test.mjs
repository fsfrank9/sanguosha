import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const htmlPath = path.join(root, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script id="game-engine"[^>]*>([\s\S]*?)<\/script>/);
assert.ok(match, 'index.html should contain <script id="game-engine">');

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox, { filename: 'game-engine.js' });
const SkillRuntime = sandbox.window.SanguoshaEngineModules && sandbox.window.SanguoshaEngineModules.SkillRuntime;
assert.ok(SkillRuntime, 'built artifact should expose SkillRuntime');

function test(name, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

test('SkillRuntime exposes a minimal hook registry API', () => {
  assert.equal(typeof SkillRuntime.createRegistry, 'function', 'createRegistry should be exported');
  assert.equal(typeof SkillRuntime.registerSkill, 'function', 'registerSkill should be exported');
  assert.equal(typeof SkillRuntime.runHook, 'function', 'runHook should be exported');
});

test('runHook is a no-op for unregistered hooks', () => {
  const registry = SkillRuntime.createRegistry();
  const context = { game: {}, actor: 'player' };

  const results = SkillRuntime.runHook(registry, 'onTurnEnd', context);

  assert.ok(Array.isArray(results), 'runHook should always return an array');
  assert.deepEqual(normalize(results), []);
});

test('runHook executes matching hooks in registration order with shared context', () => {
  const registry = SkillRuntime.createRegistry();
  const context = { actor: 'player', events: [] };

  SkillRuntime.registerSkill(registry, 'first-skill', {
    onTurnEnd(ctx) {
      ctx.events.push('first:' + ctx.actor);
      return { drew: 1 };
    }
  });
  SkillRuntime.registerSkill(registry, 'ignored-skill', {
    onTurnStart(ctx) {
      ctx.events.push('should-not-run:' + ctx.actor);
    }
  });
  SkillRuntime.registerSkill(registry, 'second-skill', {
    onTurnEnd(ctx) {
      ctx.events.push('second:' + ctx.actor);
      return null;
    }
  });

  const results = SkillRuntime.runHook(registry, 'onTurnEnd', context);

  assert.deepEqual(context.events, ['first:player', 'second:player']);
  assert.deepEqual(normalize(results), [
    { skillId: 'first-skill', result: { drew: 1 } },
    { skillId: 'second-skill', result: null }
  ]);
});

test('game engine registers Biyue through the shared skill registry seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');

  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]biyue['"]/, 'Biyue should be registered with SkillRuntime.registerSkill');
  assert.match(source, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onTurnEnd['"]/, 'turn completion should dispatch the onTurnEnd hook through SkillRuntime.runHook');
});

test('game engine dispatches Keji through onBeforeDiscardPhase hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const finishStart = source.indexOf('function finishPlayPhase(game)');
  const finishEnd = source.indexOf('function discardExcess(game, actor, cardIds)', finishStart);
  assert.ok(finishStart >= 0 && finishEnd > finishStart, 'finishPlayPhase source should be extractable');
  const finishPlayPhaseSource = source.slice(finishStart, finishEnd);

  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]keji['"]/, 'Keji should be registered with SkillRuntime.registerSkill');
  assert.match(source, /onBeforeDiscardPhase\s*:/, 'Keji should register an onBeforeDiscardPhase hook');
  assert.match(finishPlayPhaseSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onBeforeDiscardPhase['"]/, 'finishPlayPhase should dispatch onBeforeDiscardPhase before entering discard');
  assert.doesNotMatch(finishPlayPhaseSource, /hasSkill\(\s*state\s*,\s*['"]keji['"]/, 'finishPlayPhase should no longer directly own Keji skill detection');
});

test('game engine dispatches Jizhi through onCardUse hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const finishStart = source.indexOf('function finishTrickUse(game, actor, card, result, options)');
  const finishEnd = source.indexOf('function removeCardFromHand(state, cardId)', finishStart);
  const wuxieStart = source.indexOf('function consumeWuxie(game, actor, reason)');
  const wuxieEnd = source.indexOf('function judge(game, actor, reason)', wuxieStart);
  assert.ok(finishStart >= 0 && finishEnd > finishStart, 'finishTrickUse source should be extractable');
  assert.ok(wuxieStart >= 0 && wuxieEnd > wuxieStart, 'consumeWuxie source should be extractable');
  const finishTrickUseSource = source.slice(finishStart, finishEnd);
  const consumeWuxieSource = source.slice(wuxieStart, wuxieEnd);

  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]jizhi['"]/, 'Jizhi should be registered with SkillRuntime.registerSkill');
  assert.match(source, /onCardUse\s*:/, 'Jizhi should register an onCardUse hook');
  assert.match(finishTrickUseSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onCardUse['"]/, 'finishTrickUse should dispatch successful trick use through onCardUse');
  assert.match(consumeWuxieSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onCardUse['"]/, 'consumeWuxie should dispatch response Wuxie through onCardUse');
  assert.doesNotMatch(finishTrickUseSource, /triggerJizhi\(/, 'finishTrickUse should no longer directly trigger Jizhi');
  assert.doesNotMatch(consumeWuxieSource, /triggerJizhi\(/, 'consumeWuxie should no longer directly trigger Jizhi');
});

test('game engine dispatches Yingzi through onDrawPhase hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const drawStart = source.indexOf('function performDrawPhase(game, actor)');
  const drawEnd = source.indexOf('function isArmorIgnoredBySha(game, sourceActor, card)', drawStart);
  assert.ok(drawStart >= 0 && drawEnd > drawStart, 'performDrawPhase source should be extractable');
  const performDrawPhaseSource = source.slice(drawStart, drawEnd);

  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]yingzi['"]/, 'Yingzi should be registered with SkillRuntime.registerSkill');
  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]yingzi['"][\s\S]*?onDrawPhase\s*:/, 'Yingzi should register an onDrawPhase hook');
  assert.match(performDrawPhaseSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onDrawPhase['"]/, 'performDrawPhase should dispatch draw-stage skills through onDrawPhase');
  assert.doesNotMatch(performDrawPhaseSource, /hasSkill\([^)]*['"]yingzi['"]/, 'performDrawPhase should no longer directly own Yingzi skill detection');
});

test('game engine dispatches Tuxi through onDrawPhase hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const drawStart = source.indexOf('function performDrawPhase(game, actor)');
  const drawEnd = source.indexOf('function isArmorIgnoredBySha(game, sourceActor, card)', drawStart);
  assert.ok(drawStart >= 0 && drawEnd > drawStart, 'performDrawPhase source should be extractable');
  const performDrawPhaseSource = source.slice(drawStart, drawEnd);

  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]tuxi['"]/, 'Tuxi should be registered with SkillRuntime.registerSkill');
  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]tuxi['"][\s\S]*?onDrawPhase\s*:/, 'Tuxi should register an onDrawPhase hook');
  assert.match(performDrawPhaseSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onDrawPhase['"]/, 'performDrawPhase should dispatch draw-stage skills through onDrawPhase');
  assert.doesNotMatch(performDrawPhaseSource, /hasSkill\([^)]*['"]tuxi['"]/, 'performDrawPhase should no longer directly own Tuxi skill detection');
});

test('SkillRuntime exposes passive effect helpers for locked skill seams', () => {
  assert.equal(typeof SkillRuntime.hasPassiveEffect, 'function', 'hasPassiveEffect should be exported');
  assert.equal(typeof SkillRuntime.sumPassiveEffect, 'function', 'sumPassiveEffect should be exported');

  assert.equal(SkillRuntime.hasPassiveEffect({ skills: [{ id: 'paoxiao' }] }, 'unlimitedSha'), true, 'Paoxiao should grant unlimited Sha effect');
  assert.equal(SkillRuntime.hasPassiveEffect({ skills: [] }, 'unlimitedSha'), false, 'missing Paoxiao should not grant unlimited Sha effect');
  assert.equal(SkillRuntime.sumPassiveEffect({ skills: [{ id: 'mashu' }] }, 'outgoingDistance'), -1, 'Mashu should reduce outgoing distance by 1');
  assert.equal(SkillRuntime.sumPassiveEffect({ skills: [] }, 'outgoingDistance'), 0, 'missing Mashu should not change outgoing distance');
});

test('state runtime resolves Paoxiao and Mashu through SkillRuntime passive effect seam', () => {
  const stateSource = fs.readFileSync(path.join(root, 'src/engine/state.js'), 'utf8');

  assert.match(stateSource, /SkillRuntime\.hasPassiveEffect\(\s*state\s*,\s*['"]unlimitedSha['"]/, 'canUseUnlimitedSha should query SkillRuntime passive effects');
  assert.match(stateSource, /SkillRuntime\.sumPassiveEffect\(\s*from\s*,\s*['"]outgoingDistance['"]/, 'distanceBetween should query SkillRuntime passive distance modifiers');
  assert.doesNotMatch(stateSource, /hasSkill\([^)]*['"]paoxiao['"]/, 'StateRuntime should not directly hard-code Paoxiao detection');
  assert.doesNotMatch(stateSource, /hasSkill\([^)]*['"]mashu['"]/, 'StateRuntime should not directly hard-code Mashu detection');
});

test('game engine dispatches Kongcheng through onCardTarget hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const canPlayStart = source.indexOf('function canPlayCard(game, actor, card)');
  const canPlayEnd = source.indexOf('function playSha(game, actor, card)', canPlayStart);
  const playShaStart = canPlayEnd;
  const playShaEnd = source.indexOf('function playDuel(game, actor, card)', playShaStart);
  assert.ok(canPlayStart >= 0 && canPlayEnd > canPlayStart, 'canPlayCard source should be extractable');
  assert.ok(playShaStart >= 0 && playShaEnd > playShaStart, 'playSha source should be extractable');
  const canPlaySource = source.slice(canPlayStart, canPlayEnd);
  const playShaSource = source.slice(playShaStart, playShaEnd);

  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]kongcheng['"]/, 'Kongcheng should be registered with SkillRuntime.registerSkill');
  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]kongcheng['"][\s\S]*?onCardTarget\s*:/, 'Kongcheng should register an onCardTarget hook');
  assert.match(source, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onCardTarget['"]/, 'target validation should dispatch through onCardTarget');
  assert.doesNotMatch(canPlaySource, /isKongchengProtected|hasSkill\([^)]*['"]kongcheng['"]/, 'canPlayCard should no longer directly own Kongcheng target protection');
  assert.doesNotMatch(playShaSource, /isKongchengProtected|hasSkill\([^)]*['"]kongcheng['"]/, 'playSha should no longer directly own Kongcheng target protection');
});

test('game engine dispatches Tieqi through onNeedResponse hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const playShaStart = source.indexOf('function playSha(game, actor, card)');
  const playShaEnd = source.indexOf('function playDuel(game, actor, card)', playShaStart);
  assert.ok(playShaStart >= 0 && playShaEnd > playShaStart, 'playSha source should be extractable');
  const playShaSource = source.slice(playShaStart, playShaEnd);

  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]tieqi['"]/, 'Tieqi should be registered with SkillRuntime.registerSkill');
  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]tieqi['"][\s\S]*?onNeedResponse\s*:/, 'Tieqi should register an onNeedResponse hook');
  assert.match(source, /triggerTieqiNeedResponse\(context\.game, context\.actor, context\.targetActor, context\.responseType, context\.card\)/, 'Tieqi hook should forward the triggering card for narrow response-window filtering');
  assert.match(source, /function triggerTieqiNeedResponse\(game, actor, targetActor, responseType, triggeringCard\)/, 'Tieqi response helper should accept the triggering card');
  assert.match(source, /!isShaCard\(triggeringCard\)/, 'Tieqi response helper should self-filter to Sha response windows only');
  assert.match(playShaSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onNeedResponse['"]/, 'playSha should dispatch the Shan response window through onNeedResponse');
  assert.doesNotMatch(playShaSource, /hasSkill\([^)]*['"]tieqi['"]|tieqiLocked/, 'playSha should no longer directly own Tieqi response locking');
});

test('game engine dispatches Jianxiong through onDamageAfter hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const damageStart = source.indexOf('function damage(game, targetActor, amount, sourceActor, reason, sourceCard, nature)');
  const damageEnd = source.indexOf('function findResponseCard(', damageStart);
  assert.ok(damageStart >= 0 && damageEnd > damageStart, 'damage source should be extractable');
  const damageSource = source.slice(damageStart, damageEnd);

  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]jianxiong['"]/, 'Jianxiong should be registered with SkillRuntime.registerSkill');
  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]jianxiong['"][\s\S]*?onDamageAfter\s*:/, 'Jianxiong should register an onDamageAfter hook');
  assert.match(source, /triggerJianxiongDamageAfter\(context\.game, context\.targetActor, context\.sourceCard\)/, 'Jianxiong hook should forward the damaged actor and damaging card');
  assert.match(source, /function triggerJianxiongDamageAfter\(game, targetActor, sourceCard\)/, 'Jianxiong helper should isolate the damage-after side effect');
  assert.match(damageSource, /var damageContext\s*=\s*\{[\s\S]*game:\s*game[\s\S]*targetActor:\s*targetActor[\s\S]*sourceActor:\s*sourceActor[\s\S]*reason:\s*reason[\s\S]*sourceCard:\s*sourceCard[\s\S]*amount:\s*amount[\s\S]*nature:\s*damageNature[\s\S]*\}/, 'damage should build a complete damage-after context');
  assert.match(damageSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onDamageAfter['"]\s*,\s*damageContext\s*\)/, 'damage should dispatch through onDamageAfter');
  assert.doesNotMatch(damageSource, /hasSkill\([^)]*['"]jianxiong['"]|发动【奸雄】/, 'damage should no longer directly own Jianxiong skill logic');
});

test('game engine dispatches Wusheng, Longdan, and Qingguo card-as conversions through onCardAs hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const responseMatch = source.match(/function findResponseCard\([^)]*\)/);
  const responseStart = responseMatch ? responseMatch.index : -1;
  const responseEnd = source.indexOf('function consumeResponse(game, actor, type, reason)', responseStart);
  const canPlayStart = source.indexOf('function canPlayCardAs(game, actor, cardOrId, asType)');
  const canPlayEnd = source.indexOf('function playCardAs(game, actor, cardId, asType)', canPlayStart);
  assert.ok(responseStart >= 0 && responseEnd > responseStart, 'findResponseCard source should be extractable');
  assert.ok(canPlayStart >= 0 && canPlayEnd > canPlayStart, 'canPlayCardAs source should be extractable');
  const responseSource = source.slice(responseStart, responseEnd);
  const canPlaySource = source.slice(canPlayStart, canPlayEnd);

  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]longdan['"]/, 'Longdan should be registered with SkillRuntime.registerSkill');
  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]wusheng['"]/, 'Wusheng should be registered with SkillRuntime.registerSkill');
  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]qingguo['"]/, 'Qingguo should be registered with SkillRuntime.registerSkill');
  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]longdan['"][\s\S]*?onCardAs\s*:/, 'Longdan should register an onCardAs hook');
  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]wusheng['"][\s\S]*?onCardAs\s*:/, 'Wusheng should register an onCardAs hook');
  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]qingguo['"][\s\S]*?onCardAs\s*:/, 'Qingguo should register an onCardAs hook');
  assert.match(source, /triggerLongdanCardAs\(context\)/, 'Longdan hook should delegate conversion decisions to an isolated helper');
  assert.match(source, /triggerWushengCardAs\(context\)/, 'Wusheng hook should delegate conversion decisions to an isolated helper');
  assert.match(source, /triggerQingguoCardAs\(context\)/, 'Qingguo hook should delegate conversion decisions to an isolated helper');
  assert.match(responseSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onCardAs['"]\s*,\s*responseContext\s*\)/, 'automatic response selection should dispatch conversion opportunities through onCardAs');
  assert.match(canPlaySource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onCardAs['"]\s*,\s*cardAsContext\s*\)/, 'proactive card-as validation should dispatch through onCardAs');
  assert.doesNotMatch(responseSource, /hasSkill\([^)]*['"](?:wusheng|longdan|qingguo)['"]/, 'findResponseCard should no longer directly own Wusheng, Longdan, or Qingguo detection');
  assert.doesNotMatch(canPlaySource, /hasSkill\([^)]*['"](?:wusheng|longdan|qingguo)['"]/, 'canPlayCardAs should no longer directly own Wusheng, Longdan, or Qingguo detection');
});

test('game engine dispatches implemented active skills through onActiveSkill hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const useStart = source.indexOf('function useSkill(game, actor, skillId, cardIds, options)');
  const useEnd = source.indexOf('function scoreCardForAI(game, actor, card)', useStart);
  assert.ok(useStart >= 0 && useEnd > useStart, 'useSkill source should be extractable');
  const useSkillSource = source.slice(useStart, useEnd);

  const activeSkills = ['zhiheng', 'kurou', 'rende', 'fanjian', 'guanxing'];
  for (const skill of activeSkills) {
    assert.match(source, new RegExp(`SkillRuntime\\.registerSkill\\(\\s*skillRegistry\\s*,\\s*['"]${skill}['"]`), `${skill} should be registered with SkillRuntime.registerSkill`);
    assert.match(source, new RegExp(`SkillRuntime\\.registerSkill\\(\\s*skillRegistry\\s*,\\s*['"]${skill}['"][\\s\\S]*?onActiveSkill\\s*:`), `${skill} should register an onActiveSkill hook`);
  }
  assert.match(source, /triggerZhihengActiveSkill\(context\)/, 'Zhiheng active hook should delegate to an isolated helper');
  assert.match(source, /triggerKurouActiveSkill\(context\)/, 'Kurou active hook should delegate to an isolated helper');
  assert.match(source, /triggerRendeActiveSkill\(context\)/, 'Rende active hook should delegate to an isolated helper');
  assert.match(source, /triggerFanjianActiveSkill\(context\)/, 'Fanjian active hook should delegate to an isolated helper');
  assert.match(source, /triggerGuanxingActiveSkill\(context\)/, 'Guanxing active hook should delegate to an isolated helper');
  assert.match(useSkillSource, /var activeSkillContext\s*=\s*\{[\s\S]*game:\s*game[\s\S]*actor:\s*actor[\s\S]*state:\s*self[\s\S]*targetActor:\s*opponent\(actor\)[\s\S]*skillId:\s*skillId[\s\S]*cardIds:\s*cardIds[\s\S]*options:\s*options[\s\S]*\}/, 'useSkill should build a complete active-skill context');
  assert.match(useSkillSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onActiveSkill['"]\s*,\s*activeSkillContext\s*\)/, 'useSkill should dispatch active skills through onActiveSkill');
  assert.match(useSkillSource, /selectActiveSkillResult\(\s*activeSkillResults\s*,\s*skillId\s*\)/, 'useSkill should select the matching active skill hook result');
  assert.doesNotMatch(useSkillSource, /skillId\s*={2,3}\s*['"](?:zhiheng|kurou|rende|fanjian|guanxing)['"]/, 'useSkill should no longer directly branch on implemented active skill IDs');
});

test('game engine dispatches Guanxing preview through onSkillPreview hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const previewStart = source.indexOf('function getGuanxingPreview(game, actor)');
  const previewEnd = source.indexOf('function useSkill(game, actor, skillId, cardIds, options)', previewStart);
  assert.ok(previewStart >= 0 && previewEnd > previewStart, 'getGuanxingPreview source should be extractable');
  const previewSource = source.slice(previewStart, previewEnd);

  assert.match(source, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]guanxing['"][\s\S]*?onSkillPreview\s*:/, 'Guanxing should register a non-consuming preview hook');
  assert.match(source, /triggerGuanxingPreview\(context\)/, 'Guanxing preview hook should delegate to an isolated helper');
  assert.match(previewSource, /var previewContext\s*=\s*\{[\s\S]*game:\s*game[\s\S]*actor:\s*actor[\s\S]*state:\s*self[\s\S]*skillId:\s*['"]guanxing['"][\s\S]*\}/, 'getGuanxingPreview should build a preview context');
  assert.match(previewSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onSkillPreview['"]\s*,\s*previewContext\s*\)/, 'getGuanxingPreview should dispatch preview through onSkillPreview');
  assert.match(previewSource, /selectActiveSkillResult\(\s*previewResults\s*,\s*['"]guanxing['"]\s*\)/, 'getGuanxingPreview should select Guanxing preview hook result');
  assert.doesNotMatch(previewSource, /hasSkill\([^)]*['"]guanxing['"]/, 'getGuanxingPreview should no longer directly own Guanxing skill detection');
});
