# 三国杀进阶单文件版 Implementation Plan

> **SUPERSEDED / 已废弃:** 这份旧计划没有完成落盘，已由 `docs/plans/2026-04-28-sanguosha-upgrade-replan.md` 取代。后续执行必须以新计划为准。
>
> **For Hermes:** Implement directly with strict TDD. Keep it single-file HTML deliverable while keeping pure engine functions testable from `<script id="game-engine">`.

**Goal:** Upgrade the previous simplified 1v1 HTML game into a richer official-style 三国杀 duel: formal turn phases, standard/military-style card set, equipment and judgement zones, several classic hero skills, and a face-to-face UI with enemy on top and player hand at bottom.

**Architecture:** Keep `index.html` self-contained. The first script exports `window.SanguoshaEngine` with pure deterministic state transitions for tests. The second script binds DOM rendering, player clicks, hero selection, and enemy AI.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Node.js `vm` tests.

---

### Task 1: Advanced behavior tests

**Objective:** Add tests for card catalog, formal phases, equipment, delayed tricks, hero skills, and face-to-face DOM anchors.

**Files:**
- Create/modify: `tests/advanced_engine.test.mjs`
- Read target: `index.html`

**Verification:** Run `node tests/advanced_engine.test.mjs`; expected initially FAIL on old engine due missing catalog/rules.

### Task 2: Engine data model

**Objective:** Add official-style card catalog and classic hero list.

**Files:**
- Modify: `index.html` script `game-engine`

**Verification:** Tests assert presence of basic, trick, delayed, equipment, and skill metadata.

### Task 3: Formal turn phases

**Objective:** Implement judgement/draw/play/discard flow, hand limit, active state, and turn transition.

**Verification:** Tests cover `startTurn`, `finishPlayPhase`, `discardExcess`, skip play from 乐不思蜀.

### Task 4: Cards and equipment

**Objective:** Implement 杀/闪/桃/酒, standard tricks, delayed tricks, weapons, armor, horses.

**Verification:** Tests cover sha limit, Zhuge exception, Renwang/EightDiagram, delayed trick placement and judgement.

### Task 5: Hero skills

**Objective:** Implement several classic standard skills in a deterministic way: 咆哮、武圣、龙胆、制衡、苦肉、奸雄、铁骑、突袭、英姿、空城 etc.

**Verification:** Tests cover representative skills with direct engine calls.

### Task 6: UI upgrade

**Objective:** Redesign board as official-like face-to-face layout: opponent top, center arena/status/log, player hand bottom; richer card visuals and hero panels.

**Verification:** Browser smoke test and console check.

### Task 7: Final validation

**Objective:** Run all tests, serve locally, open in browser, click basic interactions, and deliver `index.html`.

**Commands:**
- `node tests/game_engine.test.mjs`
- `node tests/advanced_engine.test.mjs`
- `python3 -m http.server 8765`
