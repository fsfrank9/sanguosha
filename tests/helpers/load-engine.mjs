// v5 Phase 5B test harness: tests load the engine via native ES module imports
// instead of extracting <script id="game-engine"> from dist/index.html and
// running it inside a vm sandbox. Phase 5C will drop the legacy bundle entirely.

export { SanguoshaEngine as Engine } from '../../src/engine/game-engine.js';
export { Runtime } from '../../src/engine/runtime.js';
export { SkillRuntime } from '../../src/engine/skill-runtime.js';
export { CardRuntime } from '../../src/engine/card-runtime.js';
export { StateRuntime } from '../../src/engine/state.js';
export { PhaseRuntime } from '../../src/engine/phases.js';
export { JudgementRuntime } from '../../src/engine/judgement.js';
export { HERO_CATALOG, HEROES } from '../../src/data/heroes.js';
export { CARD_CATALOG, CARD_INFO, PHASES } from '../../src/data/cards.js';
export { IMPLEMENTED_SKILL_IDS, ACTIVE_SKILL_IDS } from '../../src/data/skill-status.js';
