// AB: one serializable choice envelope for the god pack. Skill domains own
// semantic validation and continuations; the shared layer owns stale tokens.
export function createGodChoiceRuntime(deps) {
  var resolvers = {};

  function register(type, resolver) {
    if (!type || typeof resolver !== 'function' || resolvers[type]) {
      throw new Error('Invalid or duplicate god choice: ' + type);
    }
    resolvers[type] = resolver;
  }

  function resolve(game, pending, decision) {
    if (!decision || decision.choiceId !== pending.choiceId) {
      game.pendingChoice = pending;
      return deps.fail('此技能选择已失效，请按当前窗口重新选择。');
    }
    var resolver = resolvers[pending.godChoiceType];
    if (!resolver) {
      game.pendingChoice = pending;
      return deps.fail('未知技能选择。');
    }
    return resolver(game, pending, decision);
  }

  function request(game, actor, type, config, aiDecision) {
    config = config || {};
    if (!resolvers[type]) throw new Error('Unregistered god choice: ' + type);
    game.godChoiceSerial = (game.godChoiceSerial || 0) + 1;
    var pending = Object.assign({}, config, { kind: 'god-choice', godChoice: true,
      godChoiceType: type, actor: actor, choiceId: game.godChoiceSerial });
    delete pending.auto;
    var pref = config.skillId && game[actor] && game[actor].skillPreferences
      && game[actor].skillPreferences[config.skillId];
    if (pref === 'decline' && config.optional) {
      return resolve(game, pending, { choiceId: pending.choiceId, decline: true, optionId: 'decline' });
    }
    if (actor !== 'player' || game.aiSimulating || config.auto || pref === 'auto' || pref === 'always') {
      if (!aiDecision) throw new Error('Missing AI choice: ' + type);
      return resolve(game, pending, Object.assign({}, aiDecision, { choiceId: pending.choiceId }));
    }
    return deps.requestPlayerResponse(game, { kind: 'god-choice', actor: actor,
      pauseKey: 'godChoice', source: { choiceId: pending.choiceId },
      meta: pending, statusMessage: config.prompt || '等待技能选择。' });
  }

  deps.registerResponseKind('god-choice', resolve);
  return { register: register, request: request };
}
