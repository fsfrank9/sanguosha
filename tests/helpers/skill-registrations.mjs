import { SkillRuntime } from '../../src/engine/skill-runtime.js';

// Capture the real installation calls, including split domain modules. The
// previous regex only saw skills.js and silently missed every new AB module.
// Importing a fresh engine module reruns installation without creating a game.
let captured;
export function actualSkillRegistrations() {
  if (captured) return captured;
  captured = (async () => {
    const register = SkillRuntime.registerSkill;
    const records = new Map();
    SkillRuntime.registerSkill = function (registry, skillId, hooks) {
      const actual = records.get(skillId) || new Set();
      for (const [hook, handler] of Object.entries(hooks || {})) {
        if (typeof handler === 'function') actual.add(hook);
      }
      records.set(skillId, actual);
      return register(registry, skillId, hooks);
    };
    try {
      await import('../../src/engine/game-engine.js?ab-registration-audit');
    } finally {
      SkillRuntime.registerSkill = register;
    }
    return new Map([...records].map(([id, hooks]) => [id, [...hooks].sort()]));
  })();
  return captured;
}
