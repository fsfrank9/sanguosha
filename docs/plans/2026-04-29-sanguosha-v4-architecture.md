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

Future small TDD batches should move static data out of the engine script:

- `src/data/heroes.js` for `HERO_CATALOG` and skill implementation status.
- `src/data/cards.js` for `CARD_CATALOG` and card helpers.
- `src/data/official-specs/` for public structured skill specs.

Acceptance criteria:

- Engine tests can import/execute built output exactly as today.
- Public official fixtures still exclude `officialText` at all depths.
- Root/dist build parity remains exact.

---

## Phase 3 — Engine runtime modules

Future batches should split pure engine behavior into modules while keeping browser output bundled:

- `src/engine/state.js`
- `src/engine/phases.js`
- `src/engine/cards.js`
- `src/engine/damage.js`
- `src/engine/response-window.js`
- `src/engine/judgement.js`
- `src/engine/skill-runtime.js`

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
