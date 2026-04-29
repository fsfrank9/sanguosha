# v3.0 Official-flow UX and Hero Expansion Plan

> **For Hermes:** Implement in small TDD steps against the single-file artifact.

**Goal:** Fix v2.9 official-flow gaps: lord/rebel first turn order, first-turn Yingzi, manual Huogong choice, fixed card blocks, fuller existing hero skills, and expanded Standard/Wind/Forest/Fire/Mountain/SP hero packs.

**Architecture:** Keep `/Users/frankmei/.hermes/Workspace/sanguosha-html/index.html` as the only playable artifact. Add engine-level deterministic APIs for first-turn start and Huogong choices, then wire UI panels without a server. Expand hero catalog data in the engine and populate the setup selects from `Engine.HERO_CATALOG`.

**Tech Stack:** Single HTML file, embedded CSS/JS, Node ESM VM tests.

---

### Task 1: v3.0 regression tests
- Create `tests/v30_official_flow.test.mjs`.
- Cover role-based first actor, Zhou Yu Yingzi on first turn, Huogong manual choice APIs/UI hooks, fixed-width hand cards, existing heroes' missing skill metadata, and pack expansion.

### Task 2: Engine flow fixes
- Add `playerRole/enemyRole/firstActor/startWithFirstTurn` options to `Engine.newGame`.
- Use `startTurn(firstActor)` when requested so first-turn draw skills trigger.

### Task 3: Manual Huogong
- Add `Engine.getHuogongChoice(game, actor)`.
- Add `huogongCostCardId` / `declineHuogong` options to `playCard`.
- Add UI panel for revealed card + usable/unusable cost cards.

### Task 4: Card layout
- Change bottom hand layout from auto-fill grid to fixed-size card blocks with horizontal overflow.

### Task 5: Hero skills and packs
- Complete skill metadata for existing heroes.
- Implement meaningful 1v1 missing skill effects where practical: 马术、反间、仁德、观星 helpers.
- Expand hero catalog with Standard, Wind, Forest, Fire, Mountain, and SP entries.
- Populate setup selects dynamically from `Engine.HERO_CATALOG`.

### Task 6: Verification
- Run new test red/green, then full Node regression.
- Open `file:///Users/frankmei/.hermes/Workspace/sanguosha-html/index.html` directly and verify console 0 errors.
