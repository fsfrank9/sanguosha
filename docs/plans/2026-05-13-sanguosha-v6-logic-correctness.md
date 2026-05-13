# v6.0 Game-Logic Correctness & Refactor Plan

> **方向锚定:** v5 把架构搬到了原生 ES 模块 + GitHub Pages，但游戏内部规则层面仍然存在三类问题：（a）实现行为与技能描述文案不一致（如【裸衣】描述是可选但实现是强制）；（b）实现与官方规则有出入；（c）频率/可选/消耗这类元规则全部硬编码在引擎里，加新技能必须改 `resetActorTurnState()` 等共享状态。v6 不再动架构，专门把"规则正确性"和"数据驱动"两件事做好。

**Goal:** 让现有 26 个已实现技能、所有牌效果与装备效果，与官方规则及 UI 描述三方对齐；把规则元数据从引擎硬编码迁到数据层，使官方规格 fixture 成为唯一 source of truth。

**Non-goals (v6 不做):**

- 不新增技能实现。当前只有 26 / 118 个唯一技能 ID 有引擎行为，v6 不扩展这个集合；新技能在 v6 完成后另开 v7 批量补。
- 不改 hook 形态本身（`onCardUse` / `onDamageAfter` / `onJudgementBeforeResolve` 等 seam 保持不变），只让更多规则通过 hook 走。
- 不动 v5 已经定型的模块边界（`src/data/`、`src/engine/*`、`src/ui/dom-adapter.js`）。
- 不引入打包器、运行时 npm 依赖、Service Worker。
- 不改 UI 布局或视觉。

**Tech Stack:** 浏览器原生 ES modules、Node ESM 测试、官方规格 fixture (`tests/fixtures/official_standard_skill_specs.json`) 作为可提交的结构化规则源。

**前置条件:** v5.0 已完成（PR #1–#5 已合并），仓库根 `index.html` 是手写 ES 模块入口，所有源码以 ES 模块加载。

---

## 现状 vs v6 目标差异

| 维度 | v5（现状） | v6（目标） |
| --- | --- | --- |
| 技能数据 schema | `{ id, name, desc }` | `{ id, name, desc, trigger, frequency, optional, cost, mandatory, hooks }` |
| 频率 / 可选 / 消耗 | per-skill 硬编码 flag（`zhihengUsed` / `rendeGiven` / `luoyi` 等） | 参数化 frequency / cost 注册表，引擎从 metadata 读 |
| 描述/实现一致性 | 无自动校验 | RED audit test：对每个已实现技能比对 `data.desc` ↔ 官方 spec ↔ 引擎实际触发条件 |
| 官方规格 fixture 覆盖率 | ~30 / 26 implemented，部分缺字段 | 26 / 26 implemented 100%，每条含 timing / condition / cost / effect / frequency / engineHooks |
| 装备被动效果 | 大部分缺失或硬编码（只有诸葛连弩的"无限杀"通过【咆哮】路径间接走） | StateRuntime 注册 `equipmentEffects`，weapon range / armor reduction / mount distance 统一查询 |
| 牌效果对照官方 | 行为测试存在但未系统对照官方规则；部分锦囊（火攻、铁索）有边角差异 | 每类牌（杀/闪/桃/酒/各锦囊）都有 fixture-driven 官方规则测试 |
| AI 技能感知 | `aiTakeAction` 只认【苦肉】【制衡】 | 26 个已实现技能全部接入 AI 评分/调度 |
| 【裸衣】 | 强制少摸 + 强制加伤 | 摸牌阶段玩家可选；选了才少摸并打开 luoyi flag |

---

## Phase 总览

每个 Phase 独立提交、独立验证（测试通过 + 浏览器 smoke），都对应一个 PR。

| Phase | 范围 | 风险 |
| --- | --- | --- |
| 6.0 | 本计划文档 + RED audit harness（默认 skip 的「描述/规格/实现」三方对照报告生成器） | 零 |
| 6A | 官方 spec fixture 扩到 26 / 26 100% 覆盖；`heroes.js` 技能 schema 新增 `trigger` / `frequency` / `optional` / `cost` / `mandatory` / `hooks` 字段；UI tooltip 改从 schema 派生而非纯 `desc` 字符串 | 低 |
| 6B | 参数化频率/可选/消耗：移除 `zhihengUsed` / `rendeGiven` / `luoyi` 等 ad-hoc per-skill flag，统一走 `SkillRuntime` 的 frequency registry；**【裸衣】改回可选**；触发时机、消耗都从 metadata 读 | 中 |
| 6C | 描述/实现 mismatch 修复 batch（按技能子 PR，每个 commit 修一条；预计 8–12 处 mismatch，由 6.0 的 audit harness 给出待办列表） | 中 |
| 6D | 装备被动效果体系：在 `StateRuntime` 注册 `equipmentEffects`；诸葛连弩、青龙偃月刀、丈八蛇矛、寒冰剑、藤甲、八卦阵、白银狮子、仁王盾等被动统一查询；删除"是否张飞"硬编码 | 中 |
| 6E | 牌效果对照官方规则修复（杀/闪/桃/酒/各锦囊/延时锦囊），以牌族为单位分子 PR；用 fixture 驱动测试 | 中 |
| 6F | AI 技能感知扩展：扩 `scoreCardForAI` 与 `aiTakeAction`，把 26 个已实现技能都教给 AI；考虑频率/可选/消耗对决策的影响 | 中 |
| 6G | 收尾：v6 计划标完成、README 更新「当前版本」到 v6.0、相关 cleanup | 低 |

---

## Phase 6.0 — Plan + RED audit harness（本次提交）

**Status:** ✅ 已完成（PR #6 合并）。

### Task 1: 计划文档

- 新增本文档 `docs/plans/2026-05-13-sanguosha-v6-logic-correctness.md`。
- README 「架构路线」末尾追加指向本文档的引用，但不修改 v5 完成状态。

### Task 2: RED audit harness（默认 skip）

- 新增 `tests/v6_skill_audit.test.mjs`，断言（仅在 `SANGUOSHA_V6=1` 时执行）：
  - 每个 `IMPLEMENTED_SKILL_IDS` 中的技能 ID 都在 `official_standard_skill_specs.json` 里有 spec；
  - 每个 spec 必须包含 `timing` / `condition` / `cost` / `effect` / `frequency` / `engineHooks` 字段；
  - 每个已实现技能在 `heroes.js` 数据里都有 `trigger` / `frequency` / `optional` / `cost` / `hooks` 五个字段（v6A 才会真正补齐，所以 6.0 这条预期 RED）；
  - audit harness 启动时输出一份 markdown 形式的"待办清单"到 stdout，列出每条规则的状态（✅ 已对齐 / ⚠️ 部分对齐 / ❌ 待补）。
- 默认 `process.env.SANGUOSHA_V6 !== '1'` 时直接 `process.exit(0)`，不计入 `npm test` 失败。Phase 6A/6B 完成后改为默认启用。

### 验收标准

- `npm test` 仍然全部通过（v6 audit 默认 skip）。
- `SANGUOSHA_V6=1 node tests/v6_skill_audit.test.mjs` 给出 RED：清晰列出哪些 spec 缺失 / 哪些字段缺失 / 哪些 schema 字段还没补。
- 浏览器 smoke 没有任何行为变化。
- 没有引擎/数据/UI 源码字节变化（只新增 plan 文档与 audit 测试）。

---

## Phase 6A — Skill metadata schema + official spec 100% coverage

**Status:** 待启动。

### 设计要点

1. **新数据 schema**：每个技能从 `{ id, name, desc }` 扩展为：

   ```js
   {
     id: 'zhiheng',
     name: '制衡',
     desc: '出牌阶段限一次，可弃置任意张手牌，摸等量牌。',
     trigger: 'playPhase',         // 时机标签：playPhase / drawPhase / damageAfter / judgement / responseWindow / cardUse / turnEnd / ...
     frequency: 'oncePerTurn',     // oncePerTurn / oncePerGame / unlimited / passiveAlways
     optional: true,               // 是否可选
     cost: { type: 'discard', count: 'any' }, // discard / showHand / loseHp / cards / none
     mandatory: false,             // 锁定技标记
     hooks: ['onActiveSkill'],     // 引擎当前调用的 hook 列表
   }
   ```

2. **官方 spec fixture 扩到 26 / 26**：补全 `tests/fixtures/official_standard_skill_specs.json`，每条至少含：
   - `timing`：触发时机的官方文案概要；
   - `condition`：触发条件；
   - `cost`：消耗；
   - `effect`：效果；
   - `frequency`：频率（"每回合限一次" / "锁定技" / "无限制"）；
   - `engineHooks`：当前实现挂载的 hook 列表；
   - 仍**不提交** `officialText` 原文，遵守现有合规约束。

3. **UI tooltip 改造**：`src/ui/dom-adapter.js` 的技能 tooltip 渲染从「拼接 `desc` 字符串」改为「按 schema 渲染分行：触发时机 / 频率 / 消耗 / 效果」。原 `desc` 仍作为 fallback。

### 任务

- Task 1: 6.0 audit harness 切到强校验模式（去掉 `SANGUOSHA_V6` 守卫的 6A 子集）。
- Task 2: 扩 `heroes.js` 技能 schema，为 26 个已实现技能补五字段。
- Task 3: 补 `official_standard_skill_specs.json` 到 26 / 26 覆盖。
- Task 4: `dom-adapter.js` tooltip 渲染从 schema 派生。
- Task 5: 新增 `tests/skill_schema.test.mjs`：断言每个 implemented skill 的 schema 字段完整，且 `hooks` 与官方 spec 的 `engineHooks` 一致。

### 验收标准

- `npm test` 全绿。
- 6.0 audit harness 不再有 ❌ 项。
- 浏览器中悬停技能名显示分行的 tooltip，且与官方文案一致。

---

## Phase 6B — Headline mismatch fixes (audit-driven)

**Status:** 进行中。

### 修订说明（与原 6B 的差异）

原 6B 设计的是「先把所有 per-skill flag 搬进 frequency registry，再修 mismatch」。Phase 6A 后端到端 audit 的实际产出（见 Phase 6.0 audit harness + 一次性 implementation-vs-cache 比对）说明实际 mismatch 只有 1 处真硬错误 + 2 处架构性 prompt 缺失：

- ❌ **【裸衣】 强制 → 可选**（headline）— 引擎硬编码 `drawCount-1`，玩家无选择；cache 明确"许褚...选择发动"
- ⚠️ **【鬼才】 总是取 hand[0] → 玩家选**（架构性，需 pause-prompt）
- ⚠️ **【遗计】 分配机制缺失**（1v1 trivial — 唯一"其他角色"是对手，给对手是劣势策略）
- ⚠️ **【铁骑】 cache 文案模糊** — 实际引擎按 lock skill 行为，与 cache 的"选择触发"措辞不一致

考虑到 pause-prompt 是一个跨技能的基础设施（鬼才/遗计/未来 6E 牌效果都需要），不应该塞进 6B 一个 PR。所以 6B 实际范围收窄为：**修可以独立修的 mismatch（裸衣），其余加 1v1 minimal 标注 + 推到 Phase 6C 与 pause-prompt 基建一起做**。

### 任务

- Task 1: 新增 `state.skillPreferences` 容器与 `Engine.setSkillPreference` / `Engine.getSkillPreference` 公开 API；`Runtime.makePlayer` 默认初始化为空对象。
- Task 2: 【裸衣】hook 读 `skillPreferences.luoyi`：`'decline'` 时跳过减摸与伤害 flag，并记 `flags.luoyiDeclined` 供日志/AI 决策参考；默认行为不变。
- Task 3: UI 在玩家技能栏把【裸衣】渲染成 toggle（`data-skill-toggle="luoyi"`），点击切换 auto / decline，标签随状态更新；不影响其它技能的渲染与点击。
- Task 4: 新增 `tests/skill_preferences.test.mjs`：5 条覆盖 round-trip、默认自动发动、声明 decline 后摸满 2 张并未置 flag、auto 重置、未知 actor 拒绝。
- Task 5: 在 `triggerGuicaiJudgementBeforeResolve` / `triggerYijiDamageAfter` 加 1v1-minimal 注释，明确 Phase 6C 会接入 pause-prompt 走玩家选择路径。

### 验收标准

- `npm test` 全绿；`tests/skill_preferences.test.mjs` 5 条全部通过。
- 浏览器中玩家选许褚开局，技能栏出现【裸衣·自动发动】toggle；点击切到【裸衣·本回合跳过】后下个回合摸牌阶段摸满 2 张，伤害不再 +1。
- AI 玩许褚时行为与之前一致（不写偏好 → 走默认 auto-fire 路径）。

---

## Phase 6C — Pause-prompt infrastructure + 鬼才 prompt

**Status:** 进行中（鬼才 已完成，遗计/铁骑 推进到 6C-bis）。

### 实际交付（与最初设计的差异）

最初 6C 计划是「pause-prompt 基础设施 + 鬼才/遗计/铁骑 三处接入」。落地时把范围收窄为「基础设施 + 鬼才」，把遗计/铁骑的接入推迟到下一个 PR（6C-bis）。原因：

- 鬼才的中断点 (`onJudgementBeforeResolve` inside `judge()` inside `processJudgeArea` inside `startTurn`) 已经迫使我们把 `processJudgeArea` 重构为可再入函数 + 把 `startTurn` 拆出 `continueTurnAfterJudgeArea` 续跑入口。仅此一处就是约 200 行引擎改动 + UI panel + 7 条行为测试。
- 遗计/铁骑触发在 `damage()` / `playSha()` 调用链，复用同一套 `pendingChoice` API 但需要各自再加一组 resume + UI panel。把它们塞进同一个 PR 会让 diff 体量过大、回归面变宽。

### 已落地

- `game.pendingChoice = { kind, actor, ... }` 状态字段；`game.pauseState.judgeArea` 用于 judge-area 循环的可再入快照。
- `Engine.getPendingChoice` / `Engine.resolvePendingChoice` 公开 API。`resolvePendingChoice` 按 `kind` 派发，目前实现 `guicai-replace`。
- `processJudgeArea` 重构成 for-loop + 重入：可以从 `game.pauseState.judgeArea.idx` 处继续。
- `startTurn` 现在在 `processJudgeArea` 报 `{ suspended: true }` 时直接返回，把"后半段"放在 `continueTurnAfterJudgeArea` 里。`resolveGuicaiReplaceChoice` 处理完玩家选择、消化剩下的延时锦囊后调用 `continueTurnAfterJudgeArea`，把摸牌阶段/出牌阶段补齐。
- 鬼才 hook 行为：actor 为 player 时默认走 `'ask'` 路径设置 pendingChoice；actor 为 enemy（AI）时默认走 `'auto'` 路径，与 v5/v6B 一致。
- `setSkillPreference` 语义化为 `null → 删除`、其它值 → 存储。原来「`'auto'` == 删除」的简化被丢弃，因为鬼才需要 'ask' 和 'auto' 两个不同的显式值。
- UI 在 `index.html` 加 `#guicaiPromptPanel`，dom-adapter 渲染原判定牌 + 手牌候选；点击候选发 `resolvePendingChoice({ cardId })`，点 "不发动" 发 `{ cardId: null }`。
- `tests/pending_choice.test.mjs` 7 条覆盖 AI auto / player suspend / player resolve / player decline / `'auto'` 偏好 / `'decline'` 偏好 / 无 pending 时调用 resolve 报错。

### 验收

- `npm test` 全绿（30 个测试文件，鬼才行为测试 7 条新增）。
- 浏览器选司马懿，对方放乐不思蜀，回合开始时 #guicaiPromptPanel 弹出原判定牌与手牌候选；点候选 → 替换、继续摸牌；点"不发动" → 原判定 → 摸牌。

---

## Phase 6C-bis — 遗计 / 铁骑 接入既有 pause-prompt

**Status:** ✅ 已完成。

### 实际交付（与最初设计的差异）

- **【遗计】**：按计划，`pendingChoice.kind === 'yiji-distribute'` 暂停在 onDamageAfter 之后；`resolveYijiDistributeChoice` 把 `giveIds` 中的牌从郭嘉手牌移到对手手牌。`skillPreferences.yiji` 默认 `auto`（全部留己，保持 v5 行为），玩家可切到 `ask`（弹分配面板）或 `decline`（不摸牌不分配）。AI 永远走 `auto`。
- **【铁骑】**：原设计是"ask 模式下 player 用【杀】时先弹是否发动"，但要实现需要把 `playSha` 拆成可中断的两段（pauseState.playSha + continuePlaySha），增加面积超过其价值。改成**持久 toggle**：`skillPreferences.tieqi` 默认 `auto`，玩家可切 `decline` 即全局禁用铁骑判定（target 可正常打闪）。要让铁骑"再次自动触发"只需切回 default。语义上比 ask-each-sha 略弱，但完全满足"不想发动"的需求，且没动 playSha 体量。
- 6.0 audit harness 这里保持现状（schema 26/26 ✅，spec 26/26 ✅）；"⚠️ 部分对齐"目前没有专门的字段表达，留给后续 phase 在 audit harness 升级时再加。

### 落地范围

- `src/engine/game-engine.js`:
    * `triggerYijiDamageAfter` 读 `skillPreferences.yiji`，`'ask'` 时建 pendingChoice、`'decline'` 时跳过摸牌、`'auto'`/未设置时维持现行。
    * `triggerTieqiNeedResponse` 读 `skillPreferences.tieqi`，`'decline'` 时返回 null（不判定、不锁闪）。
    * `resolvePendingChoice` 新增 `yiji-distribute` 分支；`resolveYijiDistributeChoice` 处理 `decision.giveIds`，把选中牌从郭嘉手牌挪到对手。
- `index.html` + `src/ui/dom-adapter.js`:
    * 新 `#yijiPromptPanel` 列出可分配的牌，按钮切勾选状态；"确认分配" 与 "全部留己" 两条出口。
    * 技能栏 toggle 推广到 tieqi (`auto ↔ decline`) 与 yiji (`auto ↔ ask`)，与 6B 的 luoyi 共享同一段渲染/点击代码。
- `tests/pending_choice.test.mjs`:
    * 新增 7 条覆盖：yiji default / yiji ask suspend / yiji giveIds transfer / yiji keep-all / yiji decline / tieqi default auto / tieqi decline。

### 验收

- `npm test` 全绿（31 个测试文件，pending_choice 共 14 条断言）。
- 浏览器选郭嘉开局，技能栏点【遗计·全部留己】→ 切为【遗计·手动分配】。被对手【杀】命中后 `#yijiPromptPanel` 弹出，勾选若干牌后点"确认分配"会把所选牌移到对方手牌；点"全部留己"则全部留下。
- 浏览器选马超开局，技能栏点【铁骑·自动发动】→ 切为【铁骑·不发动】。再使用【杀】不再判定，对手可正常打【闪】。

---

## Phase 6C-old (合并到上方 6C) — Description / implementation mismatch fixes

**Status:** 已并入新 6C / 6C-bis。

### 设计要点（保留参考）

- 由 6.0 audit harness 在 6A/6B 完成后给出的"mismatch 待办清单"驱动。
- 每个 mismatch 一个子 PR（commit on PR branch），commit 标题格式：`fix(skill): align <skillId> with official spec — <one-liner>`。
- 优先级排序：玩家可感知（如【裸衣】可选） > 频率/可选性 > 边角条件（如响应窗口的"红色判定"细则）。

### 任务（占位，最终条目以 audit 输出为准）

- 已知候选：
  - 【裸衣】可选化（在 6B 已完成）
  - 【铁骑】响应窗口锁定的 race condition
  - 【天妒】对自己判定牌生效顺序的边界
  - 【鬼才】是否限同回合
  - 【咆哮】与【马术】的叠加规则
  - 【集智】对【铁索连环】重铸触发与否

### 验收标准

- `npm test` 全绿，每个 mismatch 修复都有新增的行为测试。
- 6.0 audit harness 不再有 ⚠️ 项。

---

## Phase 6D — Equipment passive effects

**Status:** ✅ 已完成（首批）。

### 实际交付（与最初设计的差异）

最初的计划是把所有装备硬编码（包括诸葛连弩、青龙偃月刀、藤甲、八卦阵、白银狮子、寒冰剑、青釭剑、贯石斧等）都搬到 StateRuntime 的注册表里。落地时分了两类：

- **可声明式表达的（本 PR 交付）**：诸葛连弩（`unlimitedSha`）、青釭剑（`ignoreArmorOnSha`）、仁王盾（`blockBlackSha`）。这三个就是简单的布尔标志，引擎调用一次 `hasEquipmentEffect(state, name)` 就行，没有副作用。
- **带副作用的（留给后续 phase）**：八卦阵自动判定生【闪】、青龙偃月刀 miss 后再【杀】、藤甲 ±1 伤害与抗南蛮万箭、白银狮子降伤+回血、贯石斧弃 2 强制命中、寒冰剑双弃。这些都需要"事件 handler"或多步骤副作用，硬塞进 `EQUIPMENT_EFFECTS` 表会让 schema 含义混乱。先把 boolean 注册表跑通做样板，下次 phase 用一个真正的 equipment-hook 体系（类似 SkillRuntime.registerSkill）把这些 side-effect 装备搬进来。

### 落地范围

- `src/engine/state.js`:
    * 新增 `EQUIPMENT_EFFECTS` 表：`zhuge: { unlimitedSha: true }`、`qinggang: { ignoreArmorOnSha: true }`、`renwang: { blockBlackSha: true }`。
    * 新增 `hasEquipmentEffect(state, effectName)` 与 `sumEquipmentEffect(state, effectName)` 两个查询（API 形状与 `SkillRuntime.hasPassiveEffect` / `sumPassiveEffect` 对齐，便于将来 helper 统一）。
    * `canUseUnlimitedSha` 改成 `SkillRuntime.hasPassiveEffect(...) || hasEquipmentEffect(...)`，不再硬判 `weapon.type === 'zhuge'`。
- `src/engine/game-engine.js`:
    * `isArmorIgnoredBySha` 改成 `hasEquipmentEffect(source, 'ignoreArmorOnSha')`，不再硬判 `weapon.type === 'qinggang'`。
    * `renwang` 黑【杀】拦截改成 `!ignoreArmor && card.color === 'black' && hasEquipmentEffect(target, 'blockBlackSha')`，不再硬判 `armor.type === 'renwang'`。
- `tests/equipment_effects.test.mjs`（新增）：11 条覆盖 registry API + 三件装备的集成行为（含 qinggang 穿透 renwang 的优先级）。

### 验收

- `npm test` 全绿（32 个测试文件）。
- `cards_equipment.test.mjs` 中现有装备行为测试 0 改动通过 → 重构保持行为。
- 浏览器选周瑜/孙权对许褚等，装备诸葛/青釭/仁王后的实战行为与 6C-bis 之前一致。

### 设计要点

- 在 `src/engine/state.js` 增加 `equipmentEffects` 注册表，类似 `SkillRuntime.passiveEffects`。
- 每件武器/防具/坐骑注册自己的 passive：

  ```js
  StateRuntime.registerEquipmentEffect('zhugeNu', { unlimitedSha: true });
  StateRuntime.registerEquipmentEffect('qingLong', { onShaMiss: 'allowResha' });
  StateRuntime.registerEquipmentEffect('tengJia', { damageMod: { normal: -1, fire: +1, nanman: -1 } });
  StateRuntime.registerEquipmentEffect('renwang', { onTargetBlackSha: 'cancel' });
  ```

- `StateRuntime` 的 `hasUnlimitedSha` 等查询不再硬判技能 ID 或装备 ID，统一走注册表。
- `triggerPaoxiao` 不动；只是它的 unlimited Sha 来源不再独占该 seam，装备也能贡献。

### 任务

- Task 1: 新增 `src/engine/state.js` 内的装备 effects 注册表。
- Task 2: 迁移现有"硬判装备 ID"的代码（搜 `zhugeNu` / `qingLong` / `bagua` / `tengJia` 等字符串）。
- Task 3: 补行为测试覆盖：诸葛连弩 + 咆哮叠加、藤甲对火攻、青龙 miss 后再杀、寒冰剑双弃。

### 验收标准

- `npm test` 全绿，至少 6 条新增装备被动测试。
- 浏览器 smoke：装备区切换装备时 UI 状态文案随之改变。

---

## Phase 6E — Card-rule audit (metadata + coverage)

**Status:** ✅ 已完成（首批，audit-only）。

### 修订说明

最初的设计是「按牌族分子 PR 修 mismatch + 删 game-engine.js 硬编码」。落地时把 6E 的范围明确为「先把官方规则文档化 + audit harness 上线」，**不在本 phase 改任何引擎行为**。原因：

- 引擎本身没有现成的 official-card cache（Hermes 只做了 skills），需要先把规则写下来才有"标准"做比对；
- 之前几个 phase 的经验是：先把数据/审计基建建好，再做 mismatch 修复，分摊 review 面比塞一个大 PR 健康。

具体 mismatch 修复（火攻属性变种与铁索连环传导、雌雄/方天等暂未实现装备的标注、距离-1 与坐骑组合）放到后续 6E-A / 6E-B 子 phase，由 audit harness 报出来再批量收。

### 落地范围

- `src/data/cards.js`:
    * 新增 `CARD_RULES` 表，覆盖全部 35 个 CARD_CATALOG 条目（6 基本 + 12 即时锦囊 + 3 延时锦囊 + 14 装备）。每条至少含 `summary` / `timing` / `effect` / `frequency` / `engineHooks`；动作牌额外含 `targets` 和 `responseWindow`。
    * 在模块加载尾部把 `CARD_RULES[id]` merge 到 `CARD_CATALOG[id].rule`，与 6A 的 `SKILL_METADATA` 合并策略一致。
    * 导出新增 `CARD_RULES`。
- `tests/helpers/load-engine.mjs`:
    * re-export `CARD_RULES`，便于测试访问。
- `tests/card_rules.test.mjs`（新增）：6 条断言覆盖
    1. 每条 catalog 都有对应 rule
    2. 没有 orphan rule
    3. 每条 rule 字段齐全且 timing/frequency 在枚举集中
    4. 动作牌必须有 targets，装备可省略
    5. 合并到 catalog.rule 字段后保持一致
    6. responseWindow 取值在 canonical set 内
- 测试自动跑（不需要 env var）。

### 验收

- `npm test` 全绿（33 个测试文件）。
- `node tests/card_rules.test.mjs` 6/6 ✅，35 条 rule 全部通过 schema 校验。

### 后续待办（在 6E-A / 6E-B 处理）

由 CARD_RULES 与现有 `game-engine.js` 行为对照，已识别的潜在 mismatch / 未实现项：

- **【雌雄双股剑】**：当前 1v1 引擎未引入性别属性，cixiong 的"对异性目标弃牌/摸牌"分支未实现；rule 已显式标注 "尚未实现"。
- **【方天画戟】**：附加 +1 目标的【杀】当前 1v1 引擎未实现（永远只有 1 个目标）。
- **【火攻】属性传导**：火攻造成的伤害已是 fire，但与铁索连环的连锁传导未经过系统测试。
- **【铁索连环】**：横置状态在 1v1 实现，但属性伤害的"连锁传导"需要与 fire_sha / thunder_sha / shandian / huogong 联合 audit。
- **【借刀杀人】对距离的处理**：当前实现是否检查"目标武器距离内有合法第三方"需 audit。
- **【五谷丰登】/【桃园结义】**：1v1 只有 2 名存活角色，结算顺序与官方应一致，但需要测试明确覆盖。

---

## Phase 6F — AI skill awareness (active skills)

**Status:** ✅ 已完成（active skills 子批次）。

### 修订说明（与最初设计的差异）

最初的设计是「26 个技能全 AI 化 + 抽 ai-strategy.js 模块」。落地时把范围聚焦到**真正需要 AI 决策**的部分：

- **主动技（active skills, 5 个: 苦肉/制衡/仁德/反间/观星）**：AI 必须显式选用。原来已有 2 个（苦肉/制衡），本 phase 补齐另外 3 个。
- **被动/伤后/锁定技（约 15 个: 奸雄/反馈/刚烈/鬼才/天妒/遗计/闭月/克己/集智/空城/谦逊/咆哮/马术/奇才/英姿等）**：由引擎 SkillRuntime hooks 自动触发，**无论 player 还是 AI 都同样工作**。不需要 AI 额外决策代码，无需 6F 介入。
- **转化技（武圣/龙胆/倾国 = 3 个）**：当 AI 手里没有【杀】但有红色 / 黑色牌时，AI 应该考虑用 `playCardAs('sha')` / `playCardAs('shan')`。当前 `aiChooseCard` 只看 hand 原始牌型，没有走 `canPlayCardAs` 路径，确实是个 gap。**留到 Phase 6F-bis**。
- **响应锁定技（铁骑）**：6C-bis 已经做好默认 auto-fire + 玩家可 decline；AI 默认 auto。无 6F 决策代码。
- **裸衣**：6B 默认 auto-fire；AI 默认 auto，自动获得伤害加成。无 6F 决策代码。

抽 `ai-strategy.js` 单独模块的工作量与收益不成比例（当前 AI 逻辑 ~90 行，单独模块化为时尚早），留到决策面真的变大再考虑。

### 落地范围

- `src/engine/game-engine.js`:
    * `aiChooseSkillAction` 新增三段决策分支：
      - **观星**：deck 非空且本回合未用过 → 立即发动（不指定 orderIds，等同于纯预览）。
      - **仁德**：HP 不满且未触发 heal 时；条件 (a) `rendeGiven >= 1`（再给一张就触发回血）或 (b) HP <= 1 且手牌 >= 2（紧急启动 heal 链）。挑得分最低的一张牌给对方。
      - **反间**：本回合未用且 (a) 手牌超过 hand limit 或 (b) 对方 HP <= 2 才发动。挑非黑桃手牌（让默认黑桃 guess 大概率猜错触发 1 点伤害）。
    * 优先级顺序: 观星 → 仁德 → 苦肉 → 制衡 → 反间。先用免费/治疗，再用循环，最后才是赌博性伤害。
    * `aiTakeAction` 把 `skillAction.options` 串进 `useSkill(..., options)`，让 AI 可以传递 skill-specific 参数（目前主要给观星，将来 6F-bis 也会用到）。
- `tests/ai_skill_awareness.test.mjs`（新增）：11 条断言覆盖
    - 观星：available 时立即发动；同回合不重复触发。
    - 仁德：满血时不发动；rendeGiven=1 时发动；HP=1 时紧急发动；调用后 player 手牌+1 且 rendeHealed 置位。
    - 反间：健康对手不发动；低 HP 对手发动；优先选非黑桃手牌。
    - 优先级：观星先于仁德。
    - 司马懿（无 active skill）：不发动任何主动技。

### 验收

- `npm test` 全绿（34 个测试文件）。
- `node tests/ai_skill_awareness.test.mjs` 11/11 ✅。
- 浏览器选 AI = 诸葛亮/刘备/周瑜，AI 回合开始时会按上述条件分别使用观星/仁德/反间。

### Phase 6F-bis — Card-as conversions for AI

**Status:** ✅ 已完成（play-phase 转化）。

落地范围 = 让 AI 控制关羽/SP 关羽/赵云/SP 赵云时，在没有真【杀】但有可转化手牌时，主动走 `playCardAs` 路径出杀。具体：

- `aiChooseCard` 重构成返回 `{ card, mode }`，其中 `mode ∈ {'normal', 'asSha'}`。同一评分池里同时考察「原牌使用」与「武圣/龙胆 转化为杀」，挑总分最高者。
- AI 关羽满血+一张红桃 → 选 `asSha`（红桃当杀打掉对手 1 HP，而桃满血时 score = -100 没用）；AI 关羽受伤时若对方有闪 → 选 `normal` 回血（heal 100 > as-Sha 45）。
- AI 赵云 手牌只有闪 → 龙胆转化为杀；手牌有真【杀】+ 闪 → AI 直接打杀（任一路径都伤害）。
- AI 甄姬 黑色手牌不会触发 play-phase `asSha`（倾国是响应路径）。
- 响应路径（倾国把黑色手牌当闪、龙胆把杀当闪）已经由现有 `consumeResponse` / `findResponseCard` chain 自动处理，AI 不需要额外决策代码。
- `aiTakeAction` 根据 `choice.mode` dispatch：`'asSha'` → `playCardAs(actor, cardId, 'sha')`，`'normal'` → `playCard(...)`。

`tests/ai_card_as.test.mjs` 9 条覆盖：返回 shape / null / 关羽满血红桃转化 / 关羽受伤选 heal / 端到端打 1 点伤害 + 武圣 log / 赵云只剩闪转化 / 赵云有杀照常打 / 甄姬不滥用倾国 / 无武圣武将不转化。

至此 26 个已实现技能里 AI 真正需要决策的部分（5 个 active + 武圣/龙胆 转化）全部覆盖。

---

## Phase 6G — 收尾

**Status:** ✅ 已完成。

### 落地

- `package.json` version 升到 `6.0.0`，描述串补上「data-driven skill / card / equipment metadata and pause-prompt player choice for optional skills」。
- README「当前版本」整段重写为 v6.0 描述：列出 SKILL_METADATA / CARD_RULES / EQUIPMENT_EFFECTS 三个数据源，pendingChoice 暂停/恢复机制，AI 主动技扩展。
- README 顶部的 v6 plan 引用从 `[进行中]` 改为 `[已完成]`。
- 本计划文档：6.0 → 6G 全部标 `✅ 已完成`。
- `docs/plans/2026-05-13-sanguosha-v5-architecture.md` 保持冻结不变。
- 「武将技能实现状态」节保持原样：v5 列的状态本来就准确（26 个已实现技能），v6 没有新增技能，只是把 AI 决策面补齐 + 玩家可选化。

### 验收

- 全量 `npm run verify`（结构 check + 35 个测试文件）全部通过。
- 浏览器线上 `https://fsfrank9.github.io/sanguosha/` 可整局对战；AI 行动呈现：观星预览、仁德/反间机会触发、武圣/龙胆 主动转化为杀。

### v6 完整时间线

| Phase | 交付 | PR |
|---|---|---|
| 6.0 | 计划文档 + RED audit harness | #6 |
| 6A | SKILL_METADATA schema + 官方 spec 100% 覆盖 + UI tooltip 结构化 | #8 |
| 6B | 【裸衣】可选化 + skillPreferences 容器 | #9 |
| 6C | pause-prompt 基建 + 【鬼才】 | #10 |
| 6C-bis | 【遗计】分配 + 【铁骑】 toggle | #11 |
| 6D | EQUIPMENT_EFFECTS 注册表（zhuge/qinggang/renwang） | #12 |
| 6E | CARD_RULES 元数据 + audit harness | #13 |
| 6F | AI 主动技扩展（仁德 / 反间 / 观星） | #14 |
| 6F-bis | AI card-as conversions（武圣 / 龙胆） | #15 |
| 6G | 收尾 + v6.0 cut | （本 PR） |

---

## 风险与回滚

- **风险 1: schema 扩展引发的级联改动。** 6A 给 26 个技能补 5 个新字段会触及 `heroes.js` 大量 entries。**应对：** 6.0 audit harness 在 6A 期间作为 RED 灯指引；schema 字段在 6B/6C 真正用到之前保持纯数据形态，不影响行为。
- **风险 2: per-skill flag 迁移破坏已有行为。** 6B 把 `zhihengUsed` / `rendeGiven` 等迁到 registry 是一次性大改。**应对：** 旧字段保留一个版本作 fallback，registry 与旧字段双写一段时间；6C 验证稳定后再删旧字段。
- **风险 3: 装备被动改造冲击 hardcoded 路径。** 6D 删 `zhugeNu` / `bagua` 字符串判断时容易踩到边角逻辑。**应对：** 每个装备一个 commit，提供 before/after 行为测试。
- **风险 4: AI 改造导致单元测试 deterministic RNG 漂移。** 6F 扩 AI 评分可能让旧 AI 路径测试输出变化。**应对：** 锁定 RNG 种子并对受影响的测试更新预期；AI 测试单独成文件以隔离影响面。

---

## 测试矩阵

| 测试 | 6.0 | 6A | 6B | 6C | 6D | 6E | 6F | 6G |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `tests/v6_skill_audit.test.mjs` | skip | partial | green | green | green | green | green | green |
| `tests/skill_schema.test.mjs`（6A 新增） | n/a | green | green | green | green | green | green | green |
| `tests/skills.test.mjs`（现有） | green | green | green | green | green | green | green | green |
| `tests/skill_runtime_hooks.test.mjs`（现有） | green | green | green（改写）| green | green | green | green | green |
| `tests/cards_equipment.test.mjs`（现有） | green | green | green | green | green（改写）| green | green | green |
| `tests/ai_skills.test.mjs`（6F 新增） | n/a | n/a | n/a | n/a | n/a | n/a | green | green |
| 其余测试 | green | green | green | green | green | green | green | green |
| 浏览器 smoke | green | green | green | green | green | green | green | green |
