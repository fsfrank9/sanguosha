import assert from 'node:assert/strict';
import { assertPathEvidence, assertCode, functionBody, sourceBlock, codeTokens, hasCode } from './source-evidence.mjs';

export function assertDirectIntegrations({ implemented, metadata, registered, paths, read }) {
  const expected = implemented.filter(id => metadata[id].hooks.some(hook => !/^on[A-Z]/.test(hook))).sort();
  assert.deepEqual(Object.keys(paths).sort(), expected, 'every implemented direct integration needs a per-ID evidence entry');
  for (const id of implemented) {
    const declared = metadata[id].hooks;
    assert.deepEqual(registered.get(id) || [], declared.filter(hook => /^on[A-Z]/.test(hook)).sort(), `${id}: actual factory hooks disagree with metadata`);
    const direct = declared.filter(hook => !/^on[A-Z]/.test(hook)).sort();
    assert.deepEqual(Object.keys(paths[id] || {}).sort(), direct, `${id}: every direct hook needs explicit path evidence`);
    for (const hook of direct) {
      assert.ok(paths[id][hook].some(step => step.anchor), `${id}.${hook}: registration alone cannot prove a semantic path`);
      assertPathEvidence(read, paths[id][hook], `${id}.${hook}`);
    }
    assert.ok((registered.get(id) || []).length || direct.length, `${id}: empty registerSkill is not implementation evidence`);
  }
}

export function catalogCounts(catalog, implemented) {
  const heroes = Object.values(catalog);
  const slots = heroes.flatMap(hero => hero.skills || []);
  const native = new Set(slots.map(skill => skill.id));
  const implementedIds = new Set(implemented);
  assert.equal(implementedIds.size, implemented.length, 'implemented ID list has duplicates');
  const derived = [...implementedIds].filter(id => !native.has(id)).sort();
  const todoIds = [...native].filter(id => !implementedIds.has(id)).sort();
  for (const skill of slots) {
    assert.equal(skill.status, implementedIds.has(skill.id) ? 'implemented' : 'todo', `${skill.id}: actual catalog status disagrees with implementation inventory`);
  }
  return { heroes: heroes.length, slots: slots.length, nativeUnique: native.size,
    implemented: implementedIds.size, implementedNative: native.size - todoIds.length,
    derived, todo: todoIds.length, todoIds };
}

export function assertReadmeCounts(readme, counts) {
  // Restrict comparison to the CURRENT summary and the named content section.
  // Historical version counts elsewhere in README cannot accidentally satisfy it.
  const sections = [...readme.matchAll(/^## 内容现状\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)];
  assert.equal(sections.length, 1, 'README needs exactly one 内容现状 section');
  const rows = sections[0][1].split('\n').filter(line => line.startsWith('- 武将 '));
  assert.equal(rows.length, 1, 'README needs exactly one current catalog count row');
  const row = rows[0].match(/^- 武将 (\d+) 名 \/ 技能条目 (\d+) 条 \/ 唯一挂将技能 ID (\d+) 个;已接入引擎 (\d+) 个\([^\n]*\),挂将未接入唯一技能 (\d+) 个,/);
  assert.ok(row, 'README current count row has changed shape; update the precise parser explicitly');
  assert.deepEqual(row.slice(1).map(Number), [counts.heroes, counts.slots, counts.nativeUnique, counts.implemented, counts.todo], 'README current counts drift from executable catalog');
  const summaries = readme.split('\n').filter(line => line.startsWith('- **内容**:'));
  assert.equal(summaries.length, 1, 'README needs exactly one current content summary');
  const intro = summaries[0].match(/^- \*\*内容\*\*:(\d+) 名武将 \/ (\d+) 个已接入技能 \/ /);
  assert.ok(intro, 'README current content summary shape changed');
  assert.deepEqual(intro.slice(1).map(Number), [counts.heroes, counts.implemented], 'README headline counts drift');
}

const chainPaths = {
  sha: { file: 'sha-flow.js', driver: 'advanceShaResponses', key: 'shaResponseFlow', entry: 'continueShaAfterCixiong' },
  duel: { file: 'tricks.js', driver: 'advanceDuelResponses', key: 'duelChain', entry: 'advanceDuelChain' },
  aoe: { file: 'tricks.js', key: 'aoe', entry: 'advanceAOETargets' },
  dying: { file: 'damage-dying.js', driver: 'advanceDyingResponses', key: 'dying', entry: 'processDyingNext' },
  wuxie: { file: 'tricks.js', driver: 'advanceWuxieResponses', key: 'wuxieChain', entry: 'advanceWuxieChain' },
};
export function assertFiveResponseProtocols(read) {
  for (const [kind, path] of Object.entries(chainPaths)) {
    const source = read(path.file);
    assertCode(source, ['var flows = deps.responseFlows'], path.file);
    const spec = sourceBlock(source, `flows.register('${kind}',`);
    assertCode(spec, [`key: '${path.key}'`, ...(path.driver ? [`advance: ${path.driver}`] : ['return advanceTargetQueue(game, aoe, AOE_QUEUE_HOOKS)'])], kind);
    const entry = functionBody(source, path.entry);
    assertCode(entry, [`return flows.run(game, '${kind}',`], `${kind}: entry must enter the shared gate`);
    if (path.driver) {
      const tokens = codeTokens(source);
      let calls = 0;
      for (let index = 0; index < tokens.length - 1; index++) {
        if (tokens[index] === path.driver && tokens[index + 1] === '(') {
          assert.equal(tokens[index - 1], 'function', `${kind}: direct driver call bypasses shared pause gate`);
          calls++;
        }
      }
      assert.equal(calls, 1, `${kind}: exactly one driver definition`);
    }
  }
  const sha = functionBody(read('sha-flow.js'), 'advanceShaResponses');
  assertCode(sha, ["saved.shanRemaining -= 1; saved.stage = 'bagua';", 'if (flows.blocked(game)) return', "flows.finish(game, 'sha', saved)", 'return requestPlayerResponse(game, spec)'], 'sha: commit before pause');
  const duel = functionBody(read('tricks.js'), 'advanceDuelResponses');
  assertCode(duel, ['chain.resumePaid += 1; if (flows.blocked(game)) return', "flows.finish(game, 'duel', chain)", 'return requestPlayerResponse(game, spec)'], 'duel: no next payment before pause');
  assertCode(sourceBlock(duel, "if (consumeResponse(game, responder, 'sha', chain.reason))"), ['chain.resumePaid += 1; if (flows.blocked(game)) return'], 'duel: native payment yields');
  assertCode(sourceBlock(duel, "if (tryLordAidSync && tryLordAidSync(game, responder, 'jijiang', chain.reason))"), ['chain.resumePaid += 1; if (flows.blocked(game)) return'], 'duel: aid payment yields');
  const dying = functionBody(read('damage-dying.js'), 'advanceDyingResponses');
  assertCode(dying, ['saved.dyingEnterFired = true', 'var attemptResult = attemptDyingRescue(game, responder, dyingActor)', 'flows.blocked(game) || (attemptResult && attemptResult.paused)', "flows.finish(game, 'dying', saved)"], 'dying: child window yields before next responder');
  const wuxie = functionBody(read('tricks.js'), 'advanceWuxieResponses');
  assertCode(wuxie, ['if (ghResult) return ghResult', 'chain.wuxied = !chain.wuxied', 'chain.queue = null; return advanceWuxieChain(game)', 'return requestPlayerResponse(game,'], 'wuxie: each paid card re-enters shared gate');
  assertCode(functionBody(read('tricks.js'), 'settleWuxieChain'), ["flows.finish(game, 'wuxie', chain)"], 'wuxie finish');
  assertCode(sourceBlock(read('tricks.js'), 'var AOE_QUEUE_HOOKS ='), ['effect: aoeEffectForCurrent', "flows.finish(game, 'aoe', aoe)"], 'AOE effect and finish are wired');
  assertCode(functionBody(read('tricks.js'), 'advanceTargetQueue'), ["if (effectResult !== 'continue') return effectResult", 'return checkWuxieAndContinue('], 'AOE queue propagates yields');
  assertCode(functionBody(read('tricks.js'), 'aoeEffectForCurrent'), ['aoe.idx += 1; if (consumeResponse(', 'if (flows.blocked(game)) return', 'if (game.pendingChoice) { return', "return 'continue'"], 'AOE paid seat commits before yield');
  const response = read('response.js');
  const run = functionBody(response, 'runResponseFlow');
  assertCode(run, ["if (game.phase === 'gameover')", 'finishResponseFlow(game, kind, source)', 'if (spec.cancel) spec.cancel(game, source)', 'if (responseFlowBlocked(game))', 'paused: true, suspended: true', 'return spec.advance(game, source)'], 'shared terminal/pause gate');
  const gate = codeTokens(run).indexOf('responseFlowBlocked');
  const advance = codeTokens(run).lastIndexOf('advance');
  assert.ok(gate < advance, 'shared pending-choice guard must precede dispatch');
  assertCode(functionBody(response, 'responseFlowBlocked'), ['return !!game.pendingChoice'], 'shared pause predicate');
  assertCode(functionBody(response, 'resumeResponseFlows'), ['while (!responseFlowBlocked(game))', 'frames[frames.length - 1]', 'runResponseFlow(game, frame.kind, frame.source)', 'if (responseFlowBlocked(game)) break', "throw new Error('Response flow did not yield or finish: ' + frame.kind)"], 'inside-out resumable drain with stall guard');
  assertCode(functionBody(response, 'restoreResponseContext'), ['context.source = byId[context.source.responseFlowId]', 'game.pauseState[FLOW_KINDS[frame.kind].key] = frame.source'], 'JSON restores canonical paid state');
  assert.equal(hasCode(read('sha-flow.js'), 'game.pauseState.shaResponse = {'), false, 'sha windows must use shared requestPlayerResponse');
}
