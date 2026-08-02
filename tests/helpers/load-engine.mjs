// v5 Phase 5B test harness: tests load the engine via native ES module imports
// instead of extracting <script id="game-engine"> from dist/index.html and
// running it inside a vm sandbox. Phase 5C will drop the legacy bundle entirely.

export { SanguoshaEngine as Engine } from '../../src/engine/game-engine.js';
import { SanguoshaEngine } from '../../src/engine/game-engine.js';

// v14 O1: 共享牌工厂 — 收敛各测试文件重复定义的 c() 样板 (87 处中 86 处
// 与此恒等; advanced_engine 的带 makeTestCard 存在性断言变体保留本地)。
export function c(type, overrides = {}) {
  return SanguoshaEngine.makeTestCard(type, overrides);
}
export { Runtime } from '../../src/engine/runtime.js';
export { SkillRuntime } from '../../src/engine/skill-runtime.js';
export { CardRuntime } from '../../src/engine/card-runtime.js';
export { StateRuntime } from '../../src/engine/state.js';
export { PhaseRuntime } from '../../src/engine/phases.js';
export { JudgementRuntime } from '../../src/engine/judgement.js';
export { HERO_CATALOG, HEROES, SKILL_METADATA } from '../../src/data/heroes.js';
export { CARD_CATALOG, CARD_INFO, PHASES, CARD_RULES } from '../../src/data/cards.js';
export { IMPLEMENTED_SKILL_IDS, ACTIVE_SKILL_IDS } from '../../src/data/skill-status.js';
