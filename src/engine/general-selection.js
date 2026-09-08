import { StateRuntime } from './state.js';
import { GeneralCardRuntime } from './general-card-runtime.js';

// AA3: callbacks live in the runtime; only identifiers and completed work live
// in the game. A JSON copy therefore resumes the same boundary independently.
export function createGeneralSelectionRuntime(deps) {
  var flows = deps.responseFlows;
  var boundaryHooks = {};
  var hookSerial = 0;
  var BOUNDARIES = ['onGameStart', 'onTurnStart', 'onAfterTurnEnd'];

  function registerBoundaryHook(hookName, skillId, handler) {
    if (BOUNDARIES.indexOf(hookName) < 0 || !skillId || typeof handler !== 'function') {
      throw new Error('Invalid lifecycle boundary hook');
    }
    var id = ++hookSerial;
    boundaryHooks[id] = { hookName: hookName, skillId: skillId, handler: handler };
    return function () { delete boundaryHooks[id]; };
  }

  function advanceBoundary(game, source) {
    while (!game.pendingChoice && game.phase !== 'gameover') {
      // Recheck all unconsumed registrations after each effect. A skill gained
      // at this very timing is eligible; a lost skill cannot trigger anew.
      var next = source.candidates.find(function (candidate) {
        var hook = boundaryHooks[candidate.hookId];
        return source.completed.indexOf(candidate.key) < 0 && hook
          && game[candidate.actor] && game[candidate.actor].hp > 0
          && StateRuntime.skillEnabled(game[candidate.actor], hook.skillId, game);
      });
      if (!next) break;
      source.completed.push(next.key); // invocation is paid before a nested ask
      var hook = boundaryHooks[next.hookId];
      hook.handler({ game: game, actor: next.actor, boundaryActor: source.actor,
        hookName: source.hookName, requestGeneralSelection: requestGeneralSelection });
      if (game.pendingChoice) return { ok: true, suspended: true };
    }
    flows.finish(game, 'lifecycle-boundary', source);
    if (game.phase === 'gameover') return deps.success('游戏结束。');
    return deps.continueBoundary(game, source);
  }

  flows.register('lifecycle-boundary', { key: 'lifecycleBoundary', advance: advanceBoundary });

  function runBoundary(game, hookName, actor, continuation) {
    var seats = StateRuntime.seatsFrom(game, actor || game.firstActor || game.seats[0], true);
    var hooks = Object.keys(boundaryHooks).filter(function (id) {
      return boundaryHooks[id].hookName === hookName;
    });
    var candidates = [];
    seats.forEach(function (owner) {
      hooks.forEach(function (id) {
        candidates.push({ key: owner + ':' + id, actor: owner, hookId: id });
      });
    });
    return flows.run(game, 'lifecycle-boundary', { hookName: hookName,
      actor: actor, continuation: continuation, candidates: candidates, completed: [] });
  }

  function currentOptions(game, actor, applySkill) {
    return GeneralCardRuntime.choiceOptions(game, actor).map(function (entry) {
      var hero = deps.catalog[entry.generalId];
      if (!hero) return null;
      var option = { heroId: entry.generalId, name: hero.name, camp: hero.camp,
        gender: hero.gender, active: entry.active };
      if (applySkill !== false) {
        // The foundation exposes only executable ordinary skills. Missing
        // classification is never evidence that a skill may be borrowed.
        // Official card__hero__neutral.md:253/262 also excludes skills granting
        // unquoted skills, explicitly including Weidi and Xiaode. Keep every
        // general in the pool even when it has no executable eligible skill.
        // The full Huashen/Xinsheng content gate remains separate.
        option.skills = (hero.skills || []).filter(function (skill) {
          return skill.status === 'implemented' && skill.frequency && !skill.lord
            && !skill.awakening && !skill.limited && skill.frequency !== 'oncePerGame'
            && skill.id !== 'weidi' && skill.id !== 'xiaode';
        }).map(function (skill) { return JSON.parse(JSON.stringify(skill)); });
        if (!option.skills.length) option.disabledReason = '没有已实现的非主公、非限定、非觉醒技能';
      }
      return option;
    }).filter(Boolean);
  }

  function rejection(game, pending, message) {
    game.pendingChoice = pending;
    return deps.fail(message);
  }

  function cancelExpiredSelection(game) {
    game.pauseState.generalSelection = null;
    return deps.success('武将牌选择已失效，跳过此次选择。');
  }

  function resolveGeneralSelection(game, pending, decision) {
    if (decision.choiceId !== pending.choiceId) return rejection(game, pending, '此武将牌选择已失效。');
    var state = game[pending.actor];
    if (!state || state.hp <= 0 || !StateRuntime.skillEnabled(state, pending.source, game)) {
      // A real state change can remove the entire choice while another nested
      // effect resolves. Do not trap the response chain in an unanswerable
      // window: the paid boundary remains consumed, but no effect is applied.
      return cancelExpiredSelection(game);
    }
    var options = currentOptions(game, pending.actor, pending.applySkill);
    var legal = options.filter(function (option) {
      var original = pending.options.find(function (entry) { return entry.heroId === option.heroId; });
      return original && !original.disabledReason && !option.disabledReason
        && (!option.skills || option.skills.some(function (skill) {
          return (original.skills || []).some(function (entry) { return entry.id === skill.id; });
        }));
    });
    if (!legal.length) return cancelExpiredSelection(game);
    if (decision.decline) {
      if (!pending.optional) return rejection(game, pending, '此时必须选择一张武将牌。');
      game.pauseState.generalSelection = null;
      return deps.success('不更换武将牌。');
    }
    var original = pending.options.find(function (entry) { return entry.heroId === decision.heroId; });
    var current = options
      .find(function (entry) { return entry.heroId === decision.heroId; });
    if (!original || !current || current.disabledReason || original.disabledReason) {
      return rejection(game, pending, '武将牌不属于当前可选范围。');
    }
    var skill = null;
    if (current.skills) {
      skill = current.skills.find(function (entry) { return entry.id === decision.skillId && !entry.disabledReason; });
      if (!skill || !(original.skills || []).some(function (entry) { return entry.id === decision.skillId; })) {
        return rejection(game, pending, '请选择此武将牌当前可用的技能。');
      }
    } else if (decision.skillId) return rejection(game, pending, '此窗口不选择技能。');
    // Ownership, availability and the entire decision are checked before any
    // pool, dynamic-skill or identity mutation. A rejected answer is atomic.
    var selected = GeneralCardRuntime.select(game, pending.actor, decision.heroId);
    if (!selected || selected.ok === false) return rejection(game, pending, '武将牌选择已失效。');
    if (skill) {
      StateRuntime.activateSkillSource(state, pending.source, skill);
      StateRuntime.setIdentityOverride(state, pending.source, { camp: current.camp, gender: current.gender });
    }
    game.pauseState.generalSelection = null;
    return deps.success('已选择' + current.name + (skill ? '的【' + skill.name + '】。' : '。'));
  }

  function requestGeneralSelection(game, actor, options) {
    options = options || {};
    var source = options.source || 'huashen';
    if (!game || game.phase === 'gameover' || !game[actor] || game[actor].hp <= 0
        || !StateRuntime.skillEnabled(game[actor], source, game)) return deps.fail('技能当前不可发动。');
    var choices = currentOptions(game, actor, options.applySkill);
    if (!choices.some(function (entry) { return !entry.disabledReason && (!entry.skills || entry.skills.length); })) {
      return deps.fail('没有可选的武将牌。');
    }
    game.generalSelectionSerial = (game.generalSelectionSerial || 0) + 1;
    var pending = { kind: 'general-card-choice', actor: actor,
      choiceId: game.generalSelectionSerial, reason: options.reason || '选择武将牌',
      optional: !!options.optional, source: source, applySkill: options.applySkill !== false,
      options: choices };
    var active = GeneralCardRuntime.view(game, actor, actor);
    pending.activeHeroId = active && active.activeId;
    var activeSkill = (game[actor].dynamicSkills || []).find(function (entry) {
      return entry.source === source && entry.enabled !== false;
    });
    pending.activeSkillId = activeSkill && activeSkill.id;
    if (actor !== 'player' && !options.ask) {
      // This deterministic fallback inspects only the holder's own choices.
      // It neither peeks at opponents' hidden general cards nor consumes RNG.
      var first = choices.find(function (entry) { return !entry.disabledReason && (!entry.skills || entry.skills.length); });
      return resolveGeneralSelection(game, pending, { choiceId: pending.choiceId,
        heroId: first.heroId, skillId: first.skills && first.skills[0].id });
    }
    return deps.requestPlayerResponse(game, { kind: pending.kind, actor: actor,
      pauseKey: 'generalSelection', source: { choiceId: pending.choiceId },
      options: choices, meta: pending, statusMessage: '等待选择武将牌。' });
  }

  deps.registerResponseKind('general-card-choice', resolveGeneralSelection);
  return { registerBoundaryHook: registerBoundaryHook, runBoundary: runBoundary,
    requestGeneralSelection: requestGeneralSelection };
}
