# v4.0 Modular Architecture Migration Plan

> **For Hermes:** Use subagent-driven-development for future phases. Keep every phase TDD-first and preserve the direct-open artifact.

**Goal:** Move the 三国杀 HTML game from single-source `index.html` to modular source files plus a reproducible single-file build artifact for the v4 transition.

**Architecture:** `src/` becomes the source of truth. `tools/build.mjs` injects modular CSS/engine/UI sources into `src/index.template.html`, then writes both root `index.html` and `dist/index.html`. The root artifact remains directly openable through `file://` so existing browser smoke and user workflow do not regress during v4. The v5 direction is different: no all-in-one single HTML as the architecture target, no bundling every data/code detail into one file, and access through GitHub-hosted release/publish links with real modules.

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

**Status:** In progress. Phase 4A–4J are complete: a minimal SkillRegistry/hook seam exists, 【闭月】 proves `onTurnEnd`, 【克己】 proves `onBeforeDiscardPhase`, 【集智】 proves `onCardUse` for successful normal-trick use and response-use paths, 【英姿】/【突袭】 now share the draw-phase `onDrawPhase` hook, 【咆哮】/【马术】 use a `SkillRuntime` passive-effect seam, 【空城】 uses an `onCardTarget` target-validity seam, 【铁骑】 uses `onNeedResponse`, 【奸雄】 uses `onDamageAfter`, and 【武圣】/【龙胆】 use `onCardAs` without changing gameplay behavior.

Introduce a hook-driven skill runtime before adding many more武将技能:

- `onPhaseStart`
- `onPhaseEnd`
- `onDrawPhase`
- `onBeforeDiscardPhase`
- `onCardUse`
- `onCardTarget`
- `onCardAs`
- `onDamageBefore`
- `onDamageAfter`
- `onNeedResponse`
- `onJudgeStart`
- `onJudgeResult`
- `onDiscard`
- `onDeath`

### Completed in Phase 4A

- Extended `src/engine/skill-runtime.js` with the minimal hook registry API:
  - `createRegistry()`
  - `registerSkill(registry, skillId, hooks)`
  - `runHook(registry, hookName, context)`
- Kept `annotateSkillStatus` and all existing `window.SanguoshaEngineModules.SkillRuntime` access compatible.
- Registered `biyue` through the shared registry with an `onTurnEnd` handler.
- Changed `completeTurn(game, ending)` to dispatch `SkillRuntime.runHook(skillRegistry, 'onTurnEnd', { game, actor: ending })` instead of calling `triggerBiyue` directly.
- Kept the actual 【闭月】 side effect in the existing `triggerBiyue(game, actor)` helper so Phase 4A changes only the trigger seam, not the skill behavior.
- Added `tests/skill_runtime_hooks.test.mjs` for registry exposure, no-op hooks, registration order, shared context, returned hook results, and the 【闭月】 seam.
- Expanded `tests/engine_modules.test.mjs` to guard the built-artifact exports for `createRegistry` / `registerSkill` / `runHook`.

Verification completed for Phase 4A:

- Targeted GREEN: `npm run build && node tests/engine_modules.test.mjs && node tests/skill_runtime_hooks.test.mjs && node tests/skills.test.mjs && node tests/phase_runtime.test.mjs`.
- Full GREEN: `npm run verify`.
- Direct-open smoke: `file:///Users/frankmei/.hermes/Workspace/sanguosha-html/index.html`, start game succeeds, browser console has zero JavaScript errors.
- Artifact parity: root `index.html` and `dist/index.html` are byte-identical after build.
- Static review: `git diff --check`, added-line security scan, and independent read-only review found no blocking issue.

### Completed in Phase 4B

- Registered `keji` through the shared registry with an `onBeforeDiscardPhase` handler.
- Added `triggerKejiBeforeDiscard(game, actor, context)` as the behavior-preserving side-effect helper for the existing skip-discard logic.
- Changed `finishPlayPhase(game)` to dispatch `SkillRuntime.runHook(skillRegistry, 'onBeforeDiscardPhase', { game, actor, ... })` before entering discard.
- Preserved the existing 【克己】 behavior contract: no use/response【杀】 skips discard and returns `克己跳过弃牌阶段。`; active-use or response【杀】 enters discard normally.
- Extended `tests/skill_runtime_hooks.test.mjs` to guard the 【克己】 seam while existing `tests/skills.test.mjs` continues to cover behavior regression.

Verification completed for Phase 4B:

- Targeted GREEN: `npm run build && node tests/engine_modules.test.mjs && node tests/skill_runtime_hooks.test.mjs && node tests/skills.test.mjs && node tests/phase_runtime.test.mjs`.
- Full GREEN: `npm run verify`.
- Direct-open smoke: `file:///Users/frankmei/.hermes/Workspace/sanguosha-html/index.html`, enter game succeeds, browser console has zero JavaScript errors.
- Artifact parity: root `index.html` and `dist/index.html` are byte-identical after build.
- Static review: `git diff --check`, added-line security scan, and independent read-only review found no blocking issue.

### Completed in Phase 4C

- Registered `jizhi` through the shared registry with an `onCardUse` handler.
- Kept the existing 【集智】 side-effect helper (`triggerJizhi`) and guard (`shouldTriggerJizhi`) so this batch only migrates the trigger seam.
- Changed `finishTrickUse(game, actor, card, result, options)` to dispatch `SkillRuntime.runHook(skillRegistry, 'onCardUse', { game, actor, card, result, options })` only when `result && result.ok`.
- Changed `consumeWuxie(game, actor, reason)` to dispatch the same `onCardUse` hook for successful response-use of 【无懈可击】 with `options: { response: true }`.
- Preserved the existing 【集智】 behavior contract: successful normal tricks draw 1, successful 【无懈可击】 response draws 1, and basic cards, equipment, delayed tricks, illegal/failed uses, and 【铁索连环】重铸 do not trigger.
- Extended `tests/skill_runtime_hooks.test.mjs` to guard the 【集智】 seam while existing `tests/skills.test.mjs`, `tests/v27_regression.test.mjs`, and `tests/card_runtime.test.mjs` continue to cover behavior regression.

Verification completed for Phase 4C:

- Targeted GREEN: `node tests/skill_runtime_hooks.test.mjs && npm run build && node tests/skill_runtime_hooks.test.mjs && node tests/skills.test.mjs && node tests/v27_regression.test.mjs && node tests/card_runtime.test.mjs && node tests/engine_modules.test.mjs`.
- Full GREEN: `npm run verify`.
- Direct-open smoke: `file:///Users/frankmei/.hermes/Workspace/sanguosha-html/index.html`, enter game succeeds, browser console has zero JavaScript errors.
- Artifact parity: root `index.html` and `dist/index.html` are byte-identical after build.
- Static review: `git diff --check`, added-line security scan, and independent read-only review found no blocking issue.

### Completed in Phase 4D

- Registered `yingzi` through the shared registry with an `onDrawPhase` handler.
- Changed `performDrawPhase(game, actor)` to dispatch `SkillRuntime.runHook(skillRegistry, 'onDrawPhase', drawContext)` before resolving draw-stage effects.
- Kept the 【英姿】 behavior contract unchanged: actors with `yingzi` draw 3 during draw phase and log the original message; actors without `yingzi` draw 2.
- Kept 【突袭】 on the existing draw-phase path for this batch so its steal-card/one-less-draw behavior remains unchanged while `onDrawPhase` proves the low-risk automatic draw hook seam.
- Extended `tests/skill_runtime_hooks.test.mjs` to guard the 【英姿】 seam and ensure `performDrawPhase` no longer directly owns the `yingzi` skill check.

Verification completed for Phase 4D:

- RED confirmed: the new seam test failed before implementation with `Yingzi should be registered with SkillRuntime.registerSkill`.
- Targeted GREEN: `node tests/skill_runtime_hooks.test.mjs && node tests/skills.test.mjs`.
- Targeted verification: `npm run build && node tests/skill_runtime_hooks.test.mjs && node tests/skills.test.mjs && node tests/v27_regression.test.mjs && node tests/card_runtime.test.mjs && node tests/engine_modules.test.mjs`.
- Full GREEN: `npm run verify`.
- Direct-open smoke: `file:///Users/frankmei/.hermes/Workspace/sanguosha-html/index.html`, enter game succeeds, browser console has zero JavaScript errors.
- Artifact parity: root `index.html` and `dist/index.html` are byte-identical after build.
- Static review: `git diff --check`, added-line security scan, and independent read-only review found no blocking issue.

### Completed in Phase 4E

- Registered `tuxi` through the shared registry with an `onDrawPhase` handler.
- Kept the existing mutable draw context contract from Phase 4D: `performDrawPhase(game, actor)` creates `{ game, actor, drawCount: 2 }`, dispatches `SkillRuntime.runHook(skillRegistry, 'onDrawPhase', drawContext)`, then draws the final `drawContext.drawCount`.
- Moved the existing 【突袭】 behavior into the hook without changing its contract: actors with `tuxi` steal 1 opponent hand card during draw phase when the opponent has cards, then draw 1 fewer card; actors without `tuxi` or with an empty-handed opponent draw normally.
- Extended `tests/skill_runtime_hooks.test.mjs` to guard the 【突袭】 seam and ensure `performDrawPhase` no longer directly owns the `tuxi` skill check, while `tests/skills.test.mjs` continues to cover the steal-card plus one-less-draw behavior.

Verification completed for Phase 4E:

- RED confirmed: the new seam test failed before implementation because `tuxi` was not registered through `SkillRuntime.registerSkill` and `performDrawPhase` still directly owned the `tuxi` check.
- Targeted GREEN: `node tests/skill_runtime_hooks.test.mjs && node tests/skills.test.mjs`.
- Targeted verification: `npm run build && node tests/skill_runtime_hooks.test.mjs && node tests/skills.test.mjs && node tests/v27_regression.test.mjs && node tests/card_runtime.test.mjs && node tests/engine_modules.test.mjs`.
- Full GREEN: `npm run verify`.
- Direct-open smoke: `file:///Users/frankmei/.hermes/Workspace/sanguosha-html/index.html`, enter game succeeds, browser console has zero JavaScript errors.
- Artifact parity: root `index.html` and `dist/index.html` are byte-identical after build.
- Static review: `git diff --check`, added-line security scan, and independent read-only review found no blocking issue.

### Completed in Phase 4F

- Extended `src/engine/skill-runtime.js` with passive-effect lookup helpers:
  - `hasPassiveEffect(state, effectName)` for boolean locked-skill effects.
  - `sumPassiveEffect(state, effectName)` for numeric modifiers.
- Moved the existing 【咆哮】/`paoxiao` unlimited-【杀】 lookup behind `SkillRuntime.hasPassiveEffect(state, 'unlimitedSha')` while preserving Zhuge Crossbow unlimited-【杀】 behavior.
- Moved the existing 【马术】/`mashu` outgoing-distance -1 modifier behind `SkillRuntime.sumPassiveEffect(from, 'outgoingDistance')` while preserving horse modifiers and the minimum distance floor of 1.
- `src/engine/state.js` still owns state/distance/Sha-limit queries, but no longer directly hard-codes `paoxiao` or `mashu` skill detection.
- Extended `tests/skill_runtime_hooks.test.mjs` to guard the new passive-effect seam and `tests/state_runtime.test.mjs` / `tests/advanced_engine.test.mjs` continue to cover behavior regression.

Verification completed for Phase 4F:

- RED confirmed: the new seam test failed before implementation because `SkillRuntime.hasPassiveEffect` / `sumPassiveEffect` were not exported.
- Targeted GREEN: `npm run build && node tests/skill_runtime_hooks.test.mjs && node tests/state_runtime.test.mjs && node tests/skills.test.mjs`.
- Targeted verification: `npm run build && node tests/skill_runtime_hooks.test.mjs && node tests/state_runtime.test.mjs && node tests/advanced_engine.test.mjs && node tests/cards_equipment.test.mjs && node tests/skills.test.mjs && node tests/engine_modules.test.mjs`.
- Full GREEN: `npm run verify`.
- Direct-open smoke: `file:///Users/frankmei/.hermes/Workspace/sanguosha-html/index.html`, enter game succeeds, browser console has zero JavaScript errors.
- Artifact parity: root `index.html` and `dist/index.html` are byte-identical after build.
- Static review: `git diff --check`, added-line security scan, and independent read-only review found no blocking issue.

### Completed in Phase 4G

- Registered `kongcheng` through the shared registry with an `onCardTarget` handler.
- Replaced the direct `isKongchengProtected` path with a generic `cardTargetProtection(game, actor, targetActor, card, displayName)` helper that dispatches `SkillRuntime.runHook(skillRegistry, 'onCardTarget', context)` and consumes the first `{ protected: true, message }` result.
- Changed both `canPlayCard(game, actor, card)` and `playSha(game, actor, card)` to use the shared target-protection seam instead of directly owning 【空城】 target checks.
- Preserved the existing 【空城】 behavior contract: an empty-handed actor with `kongcheng` cannot be targeted by 【杀】 or 【决斗】; failed checks happen before hand removal; existing non-empty / non-Sha-Duel paths remain self-filtered by the hook.
- Extended `tests/skill_runtime_hooks.test.mjs` to guard the 【空城】 seam and ensure `canPlayCard` / `playSha` no longer directly own Kongcheng target protection, while `tests/skills.test.mjs` continues to cover the Sha/Duel behavior regression.

Verification completed for Phase 4G:

- RED confirmed: the new seam test failed before implementation because `kongcheng` was not registered through `SkillRuntime.registerSkill` and the target checks still used the direct protection helper.
- Targeted GREEN: `npm run build && node tests/skill_runtime_hooks.test.mjs && node tests/skills.test.mjs`.
- Targeted verification: `npm run build && node tests/skill_runtime_hooks.test.mjs && node tests/skills.test.mjs && node tests/advanced_engine.test.mjs && node tests/skill_ui_regression.test.mjs && node tests/card_runtime.test.mjs && node tests/engine_modules.test.mjs`.
- Full GREEN: `npm run verify`.
- Direct-open smoke: `file:///Users/frankmei/.hermes/Workspace/sanguosha-html/index.html`, enter game succeeds, browser console has zero JavaScript errors.
- Artifact parity: root `index.html` and `dist/index.html` are byte-identical after build.
- Static review: `git diff --check`, added-line security scan, and independent read-only review found no blocking issue.

### Completed in Phase 4H

- Registered `tieqi` through the shared registry with an `onNeedResponse` handler.
- Added `triggerTieqiNeedResponse(game, actor, targetActor, responseType, triggeringCard)` as the behavior-preserving helper for the existing response-lock logic.
- Changed `playSha(game, actor, card)` to create a response-window context and dispatch `SkillRuntime.runHook(skillRegistry, 'onNeedResponse', responseContext)` before asking the target for 【闪】.
- Preserved the existing 【铁骑】 behavior contract: 马超使用【杀】指定目标后判定，红色判定令目标不能打出【闪】，黑色判定不锁定响应，非【杀】/非【闪】响应窗口不触发。
- Extended `tests/skill_runtime_hooks.test.mjs` to guard the 【铁骑】 seam and ensure `playSha` no longer directly owns `tieqi` / `tieqiLocked` logic, while `tests/skills.test.mjs` continues to cover behavior regression.

Verification completed for Phase 4H:

- RED confirmed: the new seam test failed before implementation because `tieqi` was not registered through `SkillRuntime.registerSkill` and `playSha` still directly owned the response-lock path.
- Targeted GREEN: `node tests/skill_runtime_hooks.test.mjs && node tests/skills.test.mjs`.
- Full GREEN: `npm run verify`.
- Direct-open smoke: `file:///Users/frankmei/.hermes/Workspace/sanguosha-html/index.html`, enter game succeeds, browser console has zero JavaScript errors.
- Artifact parity: root `index.html` and `dist/index.html` are byte-identical after build.
- Static review: `git diff --check`, added-line security scan, and independent read-only review found no blocking issue.

### Completed in Phase 4I

- Registered `jianxiong` through the shared registry with an `onDamageAfter` handler.
- Added `triggerJianxiongDamageAfter(game, targetActor, sourceCard)` as the behavior-preserving helper for the existing damage-source-card gain logic.
- Changed `damage(game, targetActor, amount, sourceActor, reason, sourceCard, nature)` to build a damage context and dispatch `SkillRuntime.runHook(skillRegistry, 'onDamageAfter', damageContext)` after HP loss and before source-card cleanup.
- Preserved the existing 【奸雄】 behavior contract: 曹操受到有实体来源牌造成的伤害后获得该实体牌；没有【奸雄】的受伤目标仍把来源牌置入弃牌堆；无实体来源牌的伤害不会生成或获得牌。
- Extended `tests/skill_runtime_hooks.test.mjs` to guard the 【奸雄】 seam and ensure `damage` no longer directly owns `jianxiong` detection, while `tests/skills.test.mjs` covers physical-source and no-source regression cases.

Verification completed for Phase 4I:

- RED confirmed: the new seam test failed before implementation because `jianxiong` was not registered through `SkillRuntime.registerSkill` and `damage` still directly owned the 【奸雄】 path.
- Targeted GREEN: `node tests/skill_runtime_hooks.test.mjs && node tests/skills.test.mjs`.
- Full GREEN: `npm run verify`.
- Direct-open smoke: `file:///Users/frankmei/.hermes/Workspace/sanguosha-html/index.html`, enter game succeeds, browser console has zero JavaScript errors.
- Artifact parity: root `index.html` and `dist/index.html` are byte-identical after build.
- Static review: `git diff --check`, added-line security scan, and independent read-only review found no blocking issue.

### Completed in Phase 4J

- Registered `wusheng` and `longdan` through the shared registry with `onCardAs` handlers.
- Added `triggerWushengCardAs(context)` and `triggerLongdanCardAs(context)` as behavior-preserving helpers for existing card-as/conversion logic.
- Changed `findResponseCard(state, type)` to keep native response cards first, then dispatch `SkillRuntime.runHook(skillRegistry, 'onCardAs', responseContext)` for response-window conversions.
- Changed `canPlayCardAs(game, actor, cardOrId, asType)` to dispatch `SkillRuntime.runHook(skillRegistry, 'onCardAs', cardAsContext)` for proactive card-as-Sha UI affordances instead of directly owning `wusheng` / `longdan` checks.
- Preserved the existing conversion contract: 【武圣】 converts red cards to 【杀】, 【龙胆】 converts 【闪】 to 【杀】 and 【杀】 to 【闪】 in the appropriate windows, native response cards remain preferred, and virtual cards keep the original physical card for downstream ownership effects.
- Extended `tests/skill_runtime_hooks.test.mjs` to guard the `onCardAs` seam and ensure response/proactive conversion paths no longer directly own `wusheng` / `longdan` checks, while `tests/skills.test.mjs` covers response-window conversion regression.

Verification completed for Phase 4J:

- RED confirmed: the new seam test failed before implementation because `longdan` / `wusheng` were not registered through `SkillRuntime.registerSkill` and conversion paths still directly owned those checks.
- Targeted GREEN: `node tests/skill_runtime_hooks.test.mjs && node tests/skills.test.mjs`.
- Full GREEN: `npm run verify`.
- Direct-open smoke: `file:///Users/frankmei/.hermes/Workspace/sanguosha-html/index.html`, enter game succeeds, browser console has zero JavaScript errors.
- Artifact parity: root `index.html` and `dist/index.html` are byte-identical after build.
- Static review: `git diff --check`, added-line security scan, and independent read-only review found no blocking issue.

Next Phase 4 batches should migrate one skill or one trigger family at a time. Good follow-ups are remaining direct active-skill dispatch paths and selected `onPhaseStart`/`onPhaseEnd` automatic skills once those side effects are isolated.

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
- Preserve current implemented skill behavior: `仁德`、`反间`、`观星`、`武圣`、`龙胆`、`制衡`、`苦肉`、`咆哮`、`马术`、`闭月`、`克己`、`集智`、`英姿`、`突袭`、`空城`、`铁骑`、`奸雄` and other existing engine skills.
- Keep `enterZhihengMode()` and `confirmZhiheng()` legacy UI helpers compatible.
- Red dual-use cards such as red【火攻】 must still offer normal-vs-as-Sha choice before normal-use panels.
