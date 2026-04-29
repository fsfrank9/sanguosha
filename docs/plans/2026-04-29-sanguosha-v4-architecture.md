# v4.0 Modular Architecture Migration Plan

> **For Hermes:** Use subagent-driven-development for future phases. Keep every phase TDD-first and preserve the direct-open artifact.

**Goal:** Move the 三国杀 HTML game from single-source `index.html` to modular source files plus a reproducible single-file build artifact.

**Architecture:** `src/` becomes the source of truth. `tools/build.mjs` injects modular CSS/engine/UI sources into `src/index.template.html`, then writes both root `index.html` and `dist/index.html`. The root artifact remains directly openable through `file://` so existing browser smoke and user workflow do not regress.

**Tech Stack:** Node ESM scripts, plain browser HTML/CSS/JavaScript, no runtime server, no external package dependencies.

---

## Phase 1 — Build scaffold and artifact parity

### Task 1: RED architecture test

- Create `tests/architecture_build.test.mjs`.
- Assert required files exist:
  - `package.json`
  - `tools/build.mjs`
  - `src/index.template.html`
  - `src/styles/main.css`
  - `src/engine/game-engine.js`
  - `src/ui/dom-adapter.js`
  - `dist/index.html`
- Assert `node tools/build.mjs --check` passes.
- Assert `dist/index.html` exactly matches root `index.html`.

### Task 2: Extract source modules without behavior changes

- Move the existing `<style>` body into `src/styles/main.css`.
- Move `<script id="game-engine">` body into `src/engine/game-engine.js`.
- Move the DOM/UI adapter `<script>` body into `src/ui/dom-adapter.js`.
- Replace those bodies in `src/index.template.html` with placeholders.
- Build output must reproduce the same direct-open HTML behavior.

**Status:** Completed in Phase 1.

### Task 3: Add build commands

- Add `package.json` with:
  - `npm run build`
  - `npm run build:check`
  - `npm test`
  - `npm run verify`
- Add `tools/build.mjs` with deterministic generation and stale-artifact checking.

### Task 4: Verification

- Run targeted architecture test.
- Run full `tests/*.mjs` regression suite.
- Open `file:///Users/frankmei/.hermes/Workspace/sanguosha-html/index.html` and check browser console.

---

## Phase 2 — Pure data extraction

**Status:** Completed. Static data now lives in dedicated source modules while the browser artifact remains a single direct-open HTML file.

### Task 1: RED data-module architecture test

- Create `tests/data_modules.test.mjs`.
- Assert these files exist and are listed as build inputs:
  - `src/data/heroes.js`
  - `src/data/cards.js`
  - `src/data/skill-status.js`
- Assert `src/engine/game-engine.js` no longer declares the large `HERO_CATALOG`、`CARD_CATALOG`、`IMPLEMENTED_SKILL_IDS`、`ACTIVE_SKILL_IDS` data blocks.

### Task 2: Extract pure data modules

- `src/data/heroes.js` owns `HERO_CATALOG` and writes it to `window.SanguoshaData.HERO_CATALOG`.
- `src/data/cards.js` owns `CARD_CATALOG`、`CARD_INFO` and `PHASES`.
- `src/data/skill-status.js` owns implemented/active skill ID lists.
- `src/engine/game-engine.js` reads `window.SanguoshaData` at startup and fails fast if required data modules are missing.

### Task 3: Bundle data before engine

- `tools/build.mjs` concatenates data modules before `src/engine/game-engine.js` inside `<script id="game-engine">`.
- The build still writes byte-identical `index.html` and `dist/index.html`.
- The built artifact does not rely on runtime `type="module"` imports, so `file://` direct-open remains supported.

Acceptance criteria:

- Engine tests can import/execute built output exactly as today.
- Public official fixtures still exclude `officialText` at all depths.
- Root/dist build parity remains exact.

---

## Phase 3 — Engine runtime modules

**Status:** In progress. Phase 3A–3E have introduced the first runtime-module seams without changing gameplay behavior.

### Completed in Phase 3A

- Added `src/engine/runtime.js` for shared engine helpers:
  - required data validation,
  - cloning,
  - seeded RNG,
  - player factory,
  - suit/rank/color helpers.
- Added `src/engine/skill-runtime.js` for skill runtime concerns, starting with skill-status annotation.
- Updated `tools/build.mjs` so bundled direct-open order is now:
  1. data modules,
  2. engine runtime modules,
  3. `src/engine/game-engine.js`,
  4. UI adapter.
- Added `tests/engine_modules.test.mjs` to guard module existence, build ordering, direct-open output, and `window.SanguoshaEngineModules` availability.

### Completed in Phase 3B

- Added `src/engine/card-runtime.js` for pure card helpers:
  - `makeTestCard`,
  - deterministic deck card construction and deck recipe/shuffle,
  - 【杀】 type/card classification,
  - normal trick classification,
  - virtual-card to physical-card resolution.
- `src/engine/game-engine.js` now consumes `window.SanguoshaEngineModules.CardRuntime` while preserving public exports such as `SanguoshaEngine.makeTestCard` and `SanguoshaEngine.isShaCard`.
- Added `tests/card_runtime.test.mjs` for card helper behavior and expanded `tests/engine_modules.test.mjs` to guard `CardRuntime` build wiring.

### Completed in Phase 3C

- Added `src/engine/state.js` for pure actor/state helpers:
  - `actorName` / `opponent`,
  - skill lookup and unlimited-【杀】 checks,
  - weapon range and distance calculation,
  - first-actor resolution from roles,
  - hand limit and actor status text.
- `src/engine/game-engine.js` now consumes `window.SanguoshaEngineModules.StateRuntime` while preserving public exports such as `SanguoshaEngine.opponent`, `distanceBetween`, `handLimit`, and `getActorStatus`.
- Added `tests/state_runtime.test.mjs` for state helper behavior and expanded `tests/engine_modules.test.mjs` to guard `StateRuntime` build wiring.

### Completed in Phase 3D

- Added `src/engine/phases.js` for small phase/turn-state helpers:
  - phase-history initialization and `recordPhase`,
  - `setPhase` for phase assignment plus history recording,
  - start/end turn-state reset helpers,
  - `nextPlayablePhase` for draw → play/discard transition.
- `src/engine/game-engine.js` now consumes `window.SanguoshaEngineModules.PhaseRuntime` while preserving public phase APIs such as `SanguoshaEngine.startTurn`, `advancePhase`, `finishPlayPhase`, and `endTurn`.
- Added `tests/phase_runtime.test.mjs` for PhaseRuntime behavior and expanded `tests/engine_modules.test.mjs` to guard build ordering and built-artifact exposure.

### Completed in Phase 3E

- Added `src/engine/judgement.js` for pure delayed-trick judgement rules:
  - 【乐不思蜀】 heart success / non-heart skip-play outcome,
  - 【兵粮寸断】 club success / non-club skip-draw outcome,
  - 【闪电】 spade 2–9 hit, damage, discard, and pass-to-next outcome.
- `src/engine/game-engine.js` now consumes `window.SanguoshaEngineModules.JudgementRuntime` while keeping judgement draw/discard/damage side effects inside the engine.
- Added `tests/judgement_runtime.test.mjs` for pure judgement rules and expanded `tests/engine_modules.test.mjs` to guard build wiring and built-artifact exposure.

Future batches should continue splitting pure engine behavior into modules while keeping browser output bundled:

- `src/engine/card-effects.js` or a later expansion of `src/engine/card-runtime.js` for gameplay card resolution
- `src/engine/damage.js`
- `src/engine/response-window.js`
- expanded `src/engine/skill-runtime.js`

Acceptance criteria:

- No DOM access from engine modules.
- Existing implemented skills do not regress.
- `window.SanguoshaEngine` remains available in the built artifact for tests and debugging.

---

## Phase 4 — Skill registry and hooks

Introduce a hook-driven skill runtime before adding many more武将技能:

- `onPhaseStart`
- `onPhaseEnd`
- `onCardUse`
- `onCardTarget`
- `onDamageBefore`
- `onDamageAfter`
- `onNeedResponse`
- `onJudgeStart`
- `onJudgeResult`
- `onDiscard`
- `onDeath`

Acceptance criteria:

- Implemented skills are registered through a common registry.
- Active UI skills still come from engine metadata.
- Unimplemented/display-only skills remain visibly disabled.

---

## Phase 5 — UI modules and panels

Split UI code after engine/data seams are stable:

- `src/ui/app.js`
- `src/ui/renderer.js`
- `src/ui/panels/`
- `src/ui/components/`
- `src/ui/driver.js`

Acceptance criteria:

- Browser smoke remains direct-open.
- Console has zero JavaScript errors.
- Existing one-screen/card interaction tests remain green.

---

## Non-negotiable regression guards

- `index.html` remains直接打开可运行.
- `dist/index.html` is reproducible from `src/`.
- No credentials or official prose caches are committed.
- Preserve current implemented skill behavior: `仁德`、`反间`、`观星`、`武圣`、`龙胆`、`制衡`、`苦肉`、`闭月`、`克己`、`集智` and other existing engine skills.
- Keep `enterZhihengMode()` and `confirmZhiheng()` legacy UI helpers compatible.
- Red dual-use cards such as red【火攻】 must still offer normal-vs-as-Sha choice before normal-use panels.
