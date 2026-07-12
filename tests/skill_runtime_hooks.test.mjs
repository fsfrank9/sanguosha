import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SkillRuntime } from './helpers/load-engine.mjs';

const root = path.resolve(import.meta.dirname, '..');
const skillsSource = fs.readFileSync(path.join(root, 'src/engine/skills.js'), 'utf8');
assert.ok(SkillRuntime, 'ES module should export SkillRuntime');

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

  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]biyue['"]/, 'Biyue should be registered with SkillRuntime.registerSkill');
  assert.match(source, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onTurnEnd['"]/, 'turn completion should dispatch the onTurnEnd hook through SkillRuntime.runHook');
});

test('game engine dispatches Keji through onBeforeDiscardPhase hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const finishStart = source.indexOf('function finishPlayPhase(game)');
  const finishEnd = source.indexOf('function discardExcess(game, actor, cardIds)', finishStart);
  assert.ok(finishStart >= 0 && finishEnd > finishStart, 'finishPlayPhase source should be extractable');
  const finishPlayPhaseSource = source.slice(finishStart, finishEnd);

  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]keji['"]/, 'Keji should be registered with SkillRuntime.registerSkill');
  assert.match(skillsSource, /onBeforeDiscardPhase\s*:/, 'Keji should register an onBeforeDiscardPhase hook');
  assert.match(finishPlayPhaseSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onBeforeDiscardPhase['"]/, 'finishPlayPhase should dispatch onBeforeDiscardPhase before entering discard');
  assert.doesNotMatch(finishPlayPhaseSource, /hasSkill\(\s*state\s*,\s*['"]keji['"]/, 'finishPlayPhase should no longer directly own Keji skill detection');
});

test('game engine dispatches Jizhi through onCardUse hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const finishStart = source.indexOf('function finishTrickUse(game, actor, card, result, options)');
  const finishEnd = source.indexOf('function removeCardFromHand(state, cardId)', finishStart);
  // v10 V5: consumeWuxie signature 加了 4th param preferredCardId. 用宽松前缀 match.
  const wuxieStart = source.indexOf('function consumeWuxie(game, actor, reason');
  // v11 B1: 链框架已迁往 tricks.js, consumeWuxie 切片终点改为拆分 stub 注释。
  const wuxieEnd = source.indexOf('// v11 B1: 无懈链框架迁往 ./tricks.js', wuxieStart);
  assert.ok(finishStart >= 0 && finishEnd > finishStart, 'finishTrickUse source should be extractable');
  assert.ok(wuxieStart >= 0 && wuxieEnd > wuxieStart, 'consumeWuxie source should be extractable');
  const finishTrickUseSource = source.slice(finishStart, finishEnd);
  const consumeWuxieSource = source.slice(wuxieStart, wuxieEnd);

  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]jizhi['"]/, 'Jizhi should be registered with SkillRuntime.registerSkill');
  assert.match(skillsSource, /onCardUse\s*:/, 'Jizhi should register an onCardUse hook');
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

  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]yingzi['"]/, 'Yingzi should be registered with SkillRuntime.registerSkill');
  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]yingzi['"][\s\S]*?onDrawPhase\s*:/, 'Yingzi should register an onDrawPhase hook');
  assert.match(performDrawPhaseSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onDrawPhase['"]/, 'performDrawPhase should dispatch draw-stage skills through onDrawPhase');
  assert.doesNotMatch(performDrawPhaseSource, /hasSkill\([^)]*['"]yingzi['"]/, 'performDrawPhase should no longer directly own Yingzi skill detection');
});

test('game engine dispatches Tuxi through onDrawPhase hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const drawStart = source.indexOf('function performDrawPhase(game, actor)');
  const drawEnd = source.indexOf('function isArmorIgnoredBySha(game, sourceActor, card)', drawStart);
  assert.ok(drawStart >= 0 && drawEnd > drawStart, 'performDrawPhase source should be extractable');
  const performDrawPhaseSource = source.slice(drawStart, drawEnd);

  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]tuxi['"]/, 'Tuxi should be registered with SkillRuntime.registerSkill');
  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]tuxi['"][\s\S]*?onDrawPhase\s*:/, 'Tuxi should register an onDrawPhase hook');
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
  assert.equal(SkillRuntime.hasPassiveEffect({ skills: [{ id: 'qicai' }] }, 'ignoreTrickDistance'), true, 'Qicai should ignore trick-card distance limits');
});

test('state runtime resolves Paoxiao and Mashu through SkillRuntime passive effect seam', () => {
  const stateSource = fs.readFileSync(path.join(root, 'src/engine/state.js'), 'utf8');

  assert.match(stateSource, /SkillRuntime\.hasPassiveEffect\(\s*state\s*,\s*['"]unlimitedSha['"]/, 'canUseUnlimitedSha should query SkillRuntime passive effects');
  assert.match(stateSource, /SkillRuntime\.sumPassiveEffect\(\s*from\s*,\s*['"]outgoingDistance['"]/, 'distanceBetween should query SkillRuntime passive distance modifiers');
  assert.doesNotMatch(stateSource, /hasSkill\([^)]*['"]paoxiao['"]/, 'StateRuntime should not directly hard-code Paoxiao detection');
  assert.doesNotMatch(stateSource, /hasSkill\([^)]*['"]mashu['"]/, 'StateRuntime should not directly hard-code Mashu detection');
});

test('game engine resolves trick distance checks through 1V1-spec-compliant path (v7 PR-10/11)', () => {
  // v7 PR-10/11: 1V1 spec 把 顺手牵羊 / 兵粮寸断 的距离限制都去掉了，
  // 1V1 标准包内已无 distance-limited 锦囊牌。canPlayCard 仍然必须：
  //   - 不硬编码 hasSkill('qicai') 检测（保留 seam 给未来恢复时用）
  //   - 保留 1V1 spec 注释说明
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const canPlayStart = source.indexOf('function canPlayCard(game, actor, card)');
  // v12 F1: tieqi 迁往 skills.js — canPlayCard 切片终点改为其后继函数
  const canPlayEnd = source.indexOf('function defaultHostileTarget', canPlayStart);
  assert.ok(canPlayStart >= 0 && canPlayEnd > canPlayStart, 'canPlayCard source should be extractable');
  const canPlaySource = source.slice(canPlayStart, canPlayEnd);

  assert.doesNotMatch(canPlaySource, /hasSkill\([^)]*['"]qicai['"]/, 'canPlayCard should not directly hard-code Qicai detection');
  assert.match(canPlaySource, /1V1/, 'canPlayCard 应当带 1V1 spec 注释说明无距离限制锦囊的现状');
});

test('game engine dispatches Kongcheng through onCardTarget hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const canPlayStart = source.indexOf('function canPlayCard(game, actor, card)');
  const canPlayEnd = source.indexOf('function playSha(game, actor, card, options)', canPlayStart);
  const playShaStart = canPlayEnd;
  const playShaEnd = source.indexOf('function playDuel(game, actor, card)', playShaStart);
  assert.ok(canPlayStart >= 0 && canPlayEnd > canPlayStart, 'canPlayCard source should be extractable');
  assert.ok(playShaStart >= 0 && playShaEnd > playShaStart, 'playSha source should be extractable');
  const canPlaySource = source.slice(canPlayStart, canPlayEnd);
  const playShaSource = source.slice(playShaStart, playShaEnd);

  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]kongcheng['"]/, 'Kongcheng should be registered with SkillRuntime.registerSkill');
  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]kongcheng['"][\s\S]*?onCardTarget\s*:/, 'Kongcheng should register an onCardTarget hook');
  assert.match(source, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onCardTarget['"]/, 'target validation should dispatch through onCardTarget');
  assert.doesNotMatch(canPlaySource, /isKongchengProtected|hasSkill\([^)]*['"]kongcheng['"]/, 'canPlayCard should no longer directly own Kongcheng target protection');
  assert.doesNotMatch(playShaSource, /isKongchengProtected|hasSkill\([^)]*['"]kongcheng['"]/, 'playSha should no longer directly own Kongcheng target protection');
});

test('game engine dispatches Qianxun through onCardTarget hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const canPlayStart = source.indexOf('function canPlayCard(game, actor, card)');
  // v12 F1: tieqi 迁往 skills.js — canPlayCard 切片终点改为其后继函数
  const canPlayEnd = source.indexOf('function defaultHostileTarget', canPlayStart);
  const playCardStart = source.indexOf('function playCard(game, actor, cardId, options)');
  const playCardEnd = source.indexOf('function startTurn(game, actor)', playCardStart);
  assert.ok(canPlayStart >= 0 && canPlayEnd > canPlayStart, 'canPlayCard source should be extractable');
  assert.ok(playCardStart >= 0 && playCardEnd > playCardStart, 'playCard source should be extractable');
  const canPlaySource = source.slice(canPlayStart, canPlayEnd);
  const playCardSource = source.slice(playCardStart, playCardEnd);

  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]qianxun['"]/, 'Qianxun should be registered with SkillRuntime.registerSkill');
  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]qianxun['"][\s\S]*?onCardTarget\s*:/, 'Qianxun should register an onCardTarget hook');
  assert.match(skillsSource, /triggerQianxunCardTarget\(context\)/, 'Qianxun hook should delegate target-protection logic to an isolated helper');
  assert.match(canPlaySource, /cardTargetProtection\(game, actor, opponent\(actor\), card\)/, 'canPlayCard should use shared target protection for Qianxun-protected cards');
  assert.doesNotMatch(canPlaySource, /hasSkill\([^)]*['"]qianxun['"]/, 'canPlayCard should not directly hard-code Qianxun detection');
  assert.doesNotMatch(playCardSource, /hasSkill\([^)]*['"]qianxun['"]/, 'playCard should not directly hard-code Qianxun detection');
});

test('game engine dispatches Tieqi through onNeedResponse hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const playShaStart = source.indexOf('function playSha(game, actor, card, options)');
  const playShaEnd = source.indexOf('function playDuel(game, actor, card)', playShaStart);
  assert.ok(playShaStart >= 0 && playShaEnd > playShaStart, 'playSha source should be extractable');
  const playShaSource = source.slice(playShaStart, playShaEnd);

  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]tieqi['"]/, 'Tieqi should be registered with SkillRuntime.registerSkill');
  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]tieqi['"][\s\S]*?onNeedResponse\s*:/, 'Tieqi should register an onNeedResponse hook');
  assert.match(skillsSource, /triggerTieqiNeedResponse\(context\.game, context\.actor, context\.targetActor, context\.responseType, context\.card\)/, 'Tieqi hook should forward the triggering card for narrow response-window filtering');
  assert.match(skillsSource, /function triggerTieqiNeedResponse\(game, actor, targetActor, responseType, triggeringCard\)/, 'Tieqi response helper should accept the triggering card');
  assert.match(skillsSource, /!isShaCard\(triggeringCard\)/, 'Tieqi response helper should self-filter to Sha response windows only');
  assert.match(playShaSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onNeedResponse['"]/, 'playSha should dispatch the Shan response window through onNeedResponse');
  assert.doesNotMatch(playShaSource, /hasSkill\([^)]*['"]tieqi['"]|tieqiLocked/, 'playSha should no longer directly own Tieqi response locking');
});

test('game engine dispatches Jianxiong through onDamageAfter hook seam', () => {
  // v11 B1: damage 域已迁往 damage-dying.js — damage 切片读该模块 (到文件尾,
  // 覆盖 finishDamageAfter 的 onDamageAfter 派发); 技能注册/触发器断言仍读引擎。
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const damageModule = fs.readFileSync(path.join(root, 'src/engine/damage-dying.js'), 'utf8');
  const damageStart = damageModule.indexOf('function damage(game, targetActor, amount, sourceActor, reason, sourceCard, nature, opts)');
  const damageEnd = damageModule.length;
  assert.ok(damageStart >= 0 && damageEnd > damageStart, 'damage source should be extractable');
  const damageSource = damageModule.slice(damageStart, damageEnd);

  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]jianxiong['"]/, 'Jianxiong should be registered with SkillRuntime.registerSkill');
  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]jianxiong['"][\s\S]*?onDamageAfter\s*:/, 'Jianxiong should register an onDamageAfter hook');
  assert.match(skillsSource, /triggerJianxiongDamageAfter\(context\.game, context\.targetActor, context\.sourceCard\)/, 'Jianxiong hook should forward the damaged actor and damaging card');
  assert.match(skillsSource, /function triggerJianxiongDamageAfter\(game, targetActor, sourceCard\)/, 'Jianxiong helper should isolate the damage-after side effect');
  assert.match(damageSource, /var damageContext\s*=\s*\{[\s\S]*game:\s*game[\s\S]*targetActor:\s*targetActor[\s\S]*sourceActor:\s*sourceActor[\s\S]*reason:\s*reason[\s\S]*sourceCard:\s*sourceCard[\s\S]*amount:\s*amount[\s\S]*nature:\s*damageNature[\s\S]*\}/, 'damage should build a complete damage-after context');
  assert.match(damageSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onDamageAfter['"]\s*,\s*damageContext\s*\)/, 'damage should dispatch through onDamageAfter');
  assert.doesNotMatch(damageSource, /hasSkill\([^)]*['"]jianxiong['"]|发动【奸雄】/, 'damage should no longer directly own Jianxiong skill logic');
});

test('game engine dispatches Ganglie through onDamageAfter and finalizes its judgment card', () => {
  // v11 B1: damage 域已迁往 damage-dying.js — damage 切片读该模块 (到文件尾,
  // 覆盖 finishDamageAfter 的 onDamageAfter 派发); 技能注册/触发器断言仍读引擎。
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const damageModule = fs.readFileSync(path.join(root, 'src/engine/damage-dying.js'), 'utf8');
  const damageStart = damageModule.indexOf('function damage(game, targetActor, amount, sourceActor, reason, sourceCard, nature, opts)');
  const damageEnd = damageModule.length;
  // v12 F1: 技能 helper 迁往 skills.js — 切片改读 skillsSource, 终点为其后继函数
  const ganglieStart = skillsSource.indexOf('function triggerGanglieDamageAfter(context)');
  const ganglieEnd = skillsSource.indexOf('function triggerTianduJudgementAfterResolve(context)', ganglieStart);
  assert.ok(damageStart >= 0 && damageEnd > damageStart, 'damage source should be extractable');
  assert.ok(ganglieStart >= 0 && ganglieEnd > ganglieStart, 'Ganglie helper source should be extractable');
  const damageSource = damageModule.slice(damageStart, damageEnd);
  const ganglieSource = skillsSource.slice(ganglieStart, ganglieEnd);

  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]ganglie['"]/, 'Ganglie should be registered with SkillRuntime.registerSkill');
  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]ganglie['"][\s\S]*?onDamageAfter\s*:/, 'Ganglie should register an onDamageAfter hook');
  assert.match(skillsSource, /triggerGanglieDamageAfter\(context\)/, 'Ganglie hook should forward the damage context to an isolated helper');
  assert.match(ganglieSource, /judge\(\s*game\s*,\s*targetActor\s*,\s*['"]【刚烈】['"]\s*\)/, 'Ganglie should perform a judgment owned by the damaged Xiahou Dun actor');
  assert.match(ganglieSource, /resolveJudgementCard\(\s*game\s*,\s*targetActor\s*,\s*target\s*,\s*['"]【刚烈】['"]\s*,\s*ganglieJudge\s*\)/, 'Ganglie should route its judgment card through the shared finalizer');
  assert.match(ganglieSource, /ganglieJudge\.suit\s*!==\s*['"]heart['"]/, 'Ganglie should only retaliate when the judgment is not heart');
  assert.match(damageSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onDamageAfter['"]\s*,\s*damageContext\s*\)/, 'damage should dispatch through onDamageAfter');
  assert.doesNotMatch(damageSource, /hasSkill\([^)]*['"]ganglie['"]|发动【刚烈】/, 'damage should not directly own Ganglie skill logic');
});

test('game engine dispatches Fankui through onDamageAfter and gains a source-area card', () => {
  // v11 B1: damage 域已迁往 damage-dying.js — damage 切片读该模块 (到文件尾,
  // 覆盖 finishDamageAfter 的 onDamageAfter 派发); 技能注册/触发器断言仍读引擎。
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const damageModule = fs.readFileSync(path.join(root, 'src/engine/damage-dying.js'), 'utf8');
  const damageStart = damageModule.indexOf('function damage(game, targetActor, amount, sourceActor, reason, sourceCard, nature, opts)');
  const damageEnd = damageModule.length;
  // v12 F1: 技能 helper 迁往 skills.js — 切片改读 skillsSource, 终点为其后继函数
  const fankuiStart = skillsSource.indexOf('function triggerFankuiDamageAfter(context)');
  const fankuiEnd = skillsSource.indexOf('function resolveFankuiPickChoice(game, pending, decision)', fankuiStart);
  assert.ok(damageStart >= 0 && damageEnd > damageStart, 'damage source should be extractable');
  assert.ok(fankuiStart >= 0 && fankuiEnd > fankuiStart, 'Fankui helper source should be extractable');
  const damageSource = damageModule.slice(damageStart, damageEnd);
  const fankuiSource = skillsSource.slice(fankuiStart, fankuiEnd);

  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]fankui['"]/, 'Fankui should be registered with SkillRuntime.registerSkill');
  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]fankui['"][\s\S]*?onDamageAfter\s*:/, 'Fankui should register an onDamageAfter hook');
  assert.match(skillsSource, /triggerFankuiDamageAfter\(context\)/, 'Fankui hook should forward the damage context to an isolated helper');
  assert.match(fankuiSource, /sourceActor\s*===\s*targetActor|targetActor\s*===\s*sourceActor/, 'Fankui should ignore self-damage contexts instead of moving Sima Yi own cards');
  assert.match(fankuiSource, /removeTargetZoneCard\(\s*game\s*,\s*sourceActor\s*,\s*autoZone\s*\)/, 'Fankui should remove one gainable card from the damage source area');
  // v11 A2: 获得牌统一走 moveCard 原语 (putCard 入手牌), 不再裸 push。
  assert.match(fankuiSource, /putCard\(\s*game\s*,\s*gained\.card\s*,\s*\{\s*zone:\s*['"]hand['"]\s*,\s*actor:\s*targetActor\s*\}\s*\)/, 'Fankui should move the gained source card into Sima Yi hand via putCard');
  assert.match(damageSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onDamageAfter['"]\s*,\s*damageContext\s*\)/, 'damage should dispatch through onDamageAfter');
  assert.doesNotMatch(damageSource, /hasSkill\([^)]*['"]fankui['"]|发动【反馈】/, 'damage should not directly own Fankui skill logic');
});

test('game engine dispatches Wusheng, Longdan, and Qingguo card-as conversions through onCardAs hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const responseMatch = source.match(/function findResponseCard\([^)]*\)/);
  const responseStart = responseMatch ? responseMatch.index : -1;
  const responseEnd = source.indexOf('function consumeResponse(game, actor, type, reason', responseStart);
  const canPlayStart = source.indexOf('function canPlayCardAs(game, actor, cardOrId, asType)');
  // v11 C3 (批次 27): playCardAs 增加 options 形参 (奇袭 targetZone 透传)。
  const canPlayEnd = source.indexOf('function playCardAs(game, actor, cardId, asType, options)', canPlayStart);
  assert.ok(responseStart >= 0 && responseEnd > responseStart, 'findResponseCard source should be extractable');
  assert.ok(canPlayStart >= 0 && canPlayEnd > canPlayStart, 'canPlayCardAs source should be extractable');
  const responseSource = source.slice(responseStart, responseEnd);
  const canPlaySource = source.slice(canPlayStart, canPlayEnd);

  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]longdan['"]/, 'Longdan should be registered with SkillRuntime.registerSkill');
  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]wusheng['"]/, 'Wusheng should be registered with SkillRuntime.registerSkill');
  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]qingguo['"]/, 'Qingguo should be registered with SkillRuntime.registerSkill');
  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]longdan['"][\s\S]*?onCardAs\s*:/, 'Longdan should register an onCardAs hook');
  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]wusheng['"][\s\S]*?onCardAs\s*:/, 'Wusheng should register an onCardAs hook');
  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]qingguo['"][\s\S]*?onCardAs\s*:/, 'Qingguo should register an onCardAs hook');
  assert.match(skillsSource, /triggerLongdanCardAs\(context\)/, 'Longdan hook should delegate conversion decisions to an isolated helper');
  assert.match(skillsSource, /triggerWushengCardAs\(context\)/, 'Wusheng hook should delegate conversion decisions to an isolated helper');
  assert.match(skillsSource, /triggerQingguoCardAs\(context\)/, 'Qingguo hook should delegate conversion decisions to an isolated helper');
  assert.match(responseSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onCardAs['"]\s*,\s*responseContext\s*\)/, 'automatic response selection should dispatch conversion opportunities through onCardAs');
  assert.match(canPlaySource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onCardAs['"]\s*,\s*cardAsContext\s*\)/, 'proactive card-as validation should dispatch through onCardAs');
  assert.doesNotMatch(responseSource, /hasSkill\([^)]*['"](?:wusheng|longdan|qingguo)['"]/, 'findResponseCard should no longer directly own Wusheng, Longdan, or Qingguo detection');
  assert.doesNotMatch(canPlaySource, /hasSkill\([^)]*['"](?:wusheng|longdan|qingguo)['"]/, 'canPlayCardAs should no longer directly own Wusheng, Longdan, or Qingguo detection');
});

test('game engine dispatches implemented active skills through onActiveSkill hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const useStart = source.indexOf('function useSkill(game, actor, skillId, cardIds, options)');
  // v11 B1: scoreCardForAI 迁往 ai.js, 切片结束锚改为紧随其后的 AI 拆分注释。
  const useEnd = source.indexOf('// v11 B1: AI 域拆分', useStart);
  assert.ok(useStart >= 0 && useEnd > useStart, 'useSkill source should be extractable');
  const useSkillSource = source.slice(useStart, useEnd);

  const activeSkills = ['zhiheng', 'kurou', 'rende', 'fanjian', 'guanxing'];
  for (const skill of activeSkills) {
    assert.match(skillsSource, new RegExp(`SkillRuntime\\.registerSkill\\(\\s*skillRegistry\\s*,\\s*['"]${skill}['"]`), `${skill} should be registered with SkillRuntime.registerSkill`);
    assert.match(skillsSource, new RegExp(`SkillRuntime\\.registerSkill\\(\\s*skillRegistry\\s*,\\s*['"]${skill}['"][\\s\\S]*?onActiveSkill\\s*:`), `${skill} should register an onActiveSkill hook`);
  }
  assert.match(skillsSource, /triggerZhihengActiveSkill\(context\)/, 'Zhiheng active hook should delegate to an isolated helper');
  assert.match(skillsSource, /triggerKurouActiveSkill\(context\)/, 'Kurou active hook should delegate to an isolated helper');
  assert.match(skillsSource, /triggerRendeActiveSkill\(context\)/, 'Rende active hook should delegate to an isolated helper');
  assert.match(skillsSource, /triggerFanjianActiveSkill\(context\)/, 'Fanjian active hook should delegate to an isolated helper');
  assert.match(skillsSource, /triggerGuanxingActiveSkill\(context\)/, 'Guanxing active hook should delegate to an isolated helper');
  assert.match(useSkillSource, /var activeSkillContext\s*=\s*\{[\s\S]*game:\s*game[\s\S]*actor:\s*actor[\s\S]*state:\s*self[\s\S]*targetActor:\s*opponent\(actor\)[\s\S]*skillId:\s*skillId[\s\S]*cardIds:\s*cardIds[\s\S]*options:\s*options[\s\S]*\}/, 'useSkill should build a complete active-skill context');
  assert.match(useSkillSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onActiveSkill['"]\s*,\s*activeSkillContext\s*\)/, 'useSkill should dispatch active skills through onActiveSkill');
  assert.match(useSkillSource, /selectActiveSkillResult\(\s*activeSkillResults\s*,\s*skillId\s*\)/, 'useSkill should select the matching active skill hook result');
  assert.doesNotMatch(useSkillSource, /skillId\s*={2,3}\s*['"](?:zhiheng|kurou|rende|fanjian|guanxing)['"]/, 'useSkill should no longer directly branch on implemented active skill IDs');
});

test('game engine dispatches Guanxing preview through onSkillPreview hook seam', () => {
  // v12 F1: getGuanxingPreview 已迁往 skills.js (迁移块末尾, 其后是注册区)
  const previewStart = skillsSource.indexOf('function getGuanxingPreview(game, actor)');
  const previewEnd = skillsSource.indexOf("SkillRuntime.registerSkill(skillRegistry, 'biyue'", previewStart);
  assert.ok(previewStart >= 0 && previewEnd > previewStart, 'getGuanxingPreview source should be extractable');
  const previewSource = skillsSource.slice(previewStart, previewEnd);

  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]guanxing['"][\s\S]*?onSkillPreview\s*:/, 'Guanxing should register a non-consuming preview hook');
  assert.match(skillsSource, /triggerGuanxingPreview\(context\)/, 'Guanxing preview hook should delegate to an isolated helper');
  assert.match(previewSource, /var previewContext\s*=\s*\{[\s\S]*game:\s*game[\s\S]*actor:\s*actor[\s\S]*state:\s*self[\s\S]*skillId:\s*['"]guanxing['"][\s\S]*\}/, 'getGuanxingPreview should build a preview context');
  assert.match(previewSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onSkillPreview['"]\s*,\s*previewContext\s*\)/, 'getGuanxingPreview should dispatch preview through onSkillPreview');
  assert.match(previewSource, /selectActiveSkillResult\(\s*previewResults\s*,\s*['"]guanxing['"]\s*\)/, 'getGuanxingPreview should select Guanxing preview hook result');
  assert.doesNotMatch(previewSource, /hasSkill\([^)]*['"]guanxing['"]/, 'getGuanxingPreview should no longer directly own Guanxing skill detection');
});

test('game engine dispatches Tiandu judgement-card gain through onJudgementAfterResolve hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const judgeAreaSource = fs.readFileSync(path.join(root, 'src/engine/judge-area.js'), 'utf8');
  const judgeStart = judgeAreaSource.indexOf('function judge(game, actor, reason, opts)');
  const processStart = judgeAreaSource.indexOf('function processJudgeArea(game, actor)', judgeStart);
  const processEnd = judgeAreaSource.indexOf('return {', processStart);
  assert.ok(judgeStart >= 0 && processStart > judgeStart && processEnd > processStart, 'judgement source should be extractable');
  const judgementSource = judgeAreaSource.slice(judgeStart, processEnd);

  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]tiandu['"][\s\S]*?onJudgementAfterResolve\s*:/, 'Tiandu should register an onJudgementAfterResolve hook');
  assert.match(skillsSource, /triggerTianduJudgementAfterResolve\(context\)/, 'Tiandu hook should delegate to an isolated helper');
  assert.match(judgementSource, /var judgementContext\s*=\s*\{[\s\S]*game:\s*game[\s\S]*actor:\s*actor[\s\S]*state:\s*state[\s\S]*reason:\s*reason[\s\S]*card:\s*card[\s\S]*\}/, 'judge should build a judgement context before discarding the judgement card');
  assert.match(judgementSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onJudgementAfterResolve['"]\s*,\s*judgementContext\s*\)/, 'judge should dispatch judgement-card resolution through SkillRuntime');
  assert.match(judgementSource, /if \(!judgementContext\.claimed\) \{[\s\S]*discardCard\(game, card\);[\s\S]*\}/, 'unclaimed judgement cards should still enter discard');
});

test('game engine dispatches Yiji per-damage-point draw through onDamageAfter hook seam', () => {
  // v11 B1: damage 域已迁往 damage-dying.js — damage 切片读该模块 (到文件尾,
  // 覆盖 finishDamageAfter 的 onDamageAfter 派发); 技能注册/触发器断言仍读引擎。
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const damageModule = fs.readFileSync(path.join(root, 'src/engine/damage-dying.js'), 'utf8');
  const damageStart = damageModule.indexOf('function damage(game, targetActor, amount, sourceActor, reason, sourceCard, nature, opts)');
  const damageEnd = damageModule.length;
  assert.ok(damageStart >= 0 && damageEnd > damageStart, 'damage source should be extractable');
  const damageSource = damageModule.slice(damageStart, damageEnd);

  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]yiji['"][\s\S]*?onDamageAfter\s*:/, 'Yiji should register an onDamageAfter hook');
  assert.match(skillsSource, /triggerYijiDamageAfter\(context\)/, 'Yiji hook should delegate to an isolated helper');
  assert.match(skillsSource, /function triggerYijiDamageAfter\(context\) \{[\s\S]*var target = game\[targetActor\][\s\S]*hasSkill\(target, ['"]yiji['"]\)[\s\S]*for \(var i = 0; i < context\.amount; i \+= 1\) \{[\s\S]*drawCards\(game, targetActor, 2\);[\s\S]*\}/, 'Yiji helper should self-filter and draw two cards once per damage point');
  assert.match(damageSource, /var damageContext\s*=\s*\{[\s\S]*game:\s*game[\s\S]*targetActor:\s*targetActor[\s\S]*sourceActor:\s*sourceActor[\s\S]*reason:\s*reason[\s\S]*sourceCard:\s*sourceCard[\s\S]*amount:\s*amount[\s\S]*nature:\s*damageNature[\s\S]*\}/, 'damage should include damage amount in the hook context');
  assert.match(damageSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onDamageAfter['"]\s*,\s*damageContext\s*\)/, 'damage should dispatch damage-after skills through SkillRuntime');
});

test('game engine dispatches Luoyi through draw and damage-modifier hook seams', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const phaseSource = fs.readFileSync(path.join(root, 'src/engine/phases.js'), 'utf8');
  const drawStart = source.indexOf('function performDrawPhase(game, actor)');
  const drawHelperStart = source.indexOf('function triggerLuoyiDrawPhase(context)', drawStart);
  const drawEnd = drawHelperStart >= 0 ? drawHelperStart : source.indexOf('function isArmorIgnoredBySha(game, sourceActor, card)', drawStart);
  // v11 B1: damage 域已迁往 damage-dying.js, 切片改读该模块 (到文件尾)。
  const damageModule = fs.readFileSync(path.join(root, 'src/engine/damage-dying.js'), 'utf8');
  const damageStart = damageModule.indexOf('function damage(game, targetActor, amount, sourceActor, reason, sourceCard, nature, opts)');
  const damageEnd = damageModule.length;
  assert.ok(drawStart >= 0 && drawEnd > drawStart, 'draw phase source should be extractable');
  assert.ok(damageStart >= 0 && damageEnd > damageStart, 'damage source should be extractable');
  const drawSource = source.slice(drawStart, drawEnd);
  const damageSource = damageModule.slice(damageStart, damageEnd);

  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]luoyi['"][\s\S]*?onDrawPhase\s*:[\s\S]*?onDamageModify\s*:/, 'Luoyi should register draw and damage modifier hooks');
  assert.match(skillsSource, /triggerLuoyiDrawPhase\(context\)/, 'Luoyi draw hook should delegate to an isolated helper');
  assert.match(skillsSource, /triggerLuoyiDamageModify\(context\)/, 'Luoyi damage hook should delegate to an isolated helper');
  assert.doesNotMatch(drawSource, /hasSkill\([^)]*['"]luoyi['"]/, 'performDrawPhase should not directly own Luoyi skill detection');
  assert.match(skillsSource, /function triggerLuoyiDrawPhase\(context\) \{[\s\S]*hasSkill\(state, ['"]luoyi['"]\)[\s\S]*context\.drawCount\s*=\s*Math\.max\(0, context\.drawCount - 1\)[\s\S]*flags\.luoyi\s*=\s*true/, 'Luoyi draw helper should self-filter, draw one fewer, and set a turn flag');
  assert.match(skillsSource, /function triggerLuoyiDamageModify\(context\) \{[\s\S]*hasSkill\(source, ['"]luoyi['"]\)[\s\S]*source\.flags\.luoyi[\s\S]*isShaCard\(context\.sourceCard\)[\s\S]*\/决斗\/\.test\(context\.reason \|\| ['"]['"]\)[\s\S]*context\.amount\s*\+=\s*1/, 'Luoyi damage helper should self-filter and add one damage only for Sha or Duel damage');
  assert.match(damageSource, /var damageModifyContext\s*=\s*\{[\s\S]*game:\s*game[\s\S]*targetActor:\s*targetActor[\s\S]*sourceActor:\s*sourceActor[\s\S]*reason:\s*reason[\s\S]*sourceCard:\s*sourceCard[\s\S]*amount:\s*amount[\s\S]*nature:\s*damageNature[\s\S]*\}/, 'damage should build a mutable damage modifier context');
  var modifierIndex = damageSource.indexOf("SkillRuntime.runHook(skillRegistry, 'onDamageModify', damageModifyContext)");
  var hpLossIndex = damageSource.indexOf('target.hp =');
  assert.ok(modifierIndex >= 0 && modifierIndex < hpLossIndex, 'damage should dispatch onDamageModify before HP loss');
  assert.match(phaseSource, /flags\.luoyi\s*=\s*false/, 'turn reset should clear Luoyi bonus flag');
});

test('game engine dispatches Guicai through judgement before-resolve hook seam', () => {
  const source = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');
  const judgeAreaSource = fs.readFileSync(path.join(root, 'src/engine/judge-area.js'), 'utf8');
  const judgeStart = judgeAreaSource.indexOf('function judge(game, actor, reason, opts)');
  const judgeEnd = judgeAreaSource.indexOf('function resolveJudgementCard(game, actor, state, reason, card)', judgeStart);
  assert.ok(judgeStart >= 0 && judgeEnd > judgeStart, 'judge source should be extractable');
  const judgeSource = judgeAreaSource.slice(judgeStart, judgeEnd);

  assert.match(skillsSource, /SkillRuntime\.registerSkill\(\s*skillRegistry\s*,\s*['"]guicai['"][\s\S]*?onJudgementBeforeResolve\s*:/, 'Guicai should register an onJudgementBeforeResolve hook');
  assert.match(skillsSource, /triggerGuicaiJudgementBeforeResolve\(context\)/, 'Guicai hook should delegate to an isolated helper');
  // v6.1 (cross-actor fix): the holder may be either the judgement actor
  // (own-judgement case) or the opponent (司马懿 replacing opponent's
  // judgement). We accept `state` or `holderState` as the variable name.
  assert.match(skillsSource, /function triggerGuicaiJudgementBeforeResolve\(context\) \{[\s\S]*hasSkill\(\s*\w+\s*,\s*['"]guicai['"]\)[\s\S]*removeCardFromHand\(\s*\w+\s*,\s*replacement\.id\s*\)[\s\S]*discardCard\(game, originalCard\)[\s\S]*context\.card\s*=\s*replacement[\s\S]*context\.replaced\s*=\s*true/, 'Guicai helper should self-filter, pay a hand-card cost, discard the original judgement, and replace the context card');
  assert.match(judgeSource, /var judgementContext\s*=\s*\{[\s\S]*game:\s*game[\s\S]*actor:\s*actor[\s\S]*state:\s*state[\s\S]*reason:\s*reason[\s\S]*card:\s*card[\s\S]*originalCard:\s*card[\s\S]*replaced:\s*false[\s\S]*\}/, 'judge should build a mutable before-resolve judgement context');
  assert.match(judgeSource, /SkillRuntime\.runHook\(\s*skillRegistry\s*,\s*['"]onJudgementBeforeResolve['"]\s*,\s*judgementContext\s*\)/, 'judge should dispatch before-resolve judgement replacement through SkillRuntime');
  assert.match(judgeSource, /return judgementContext\.card/, 'judge should return the possibly replaced judgement card');
});
