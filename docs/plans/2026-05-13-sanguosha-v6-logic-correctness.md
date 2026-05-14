# v6.0 + v6.1 Game-Logic Correctness & Spec-Compliance Plan

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
| 6G | 收尾 + v6.0 cut | #16 |

---

## v6.1 — Mismatch fix series (spec-compliance re-audit)

**Status:** ✅ 已完成。

### 缘起

v6.0 收尾后做了一轮"逐字对照"per-skill spec audit（subagent 跑），结果声称全部 ✅。但用户随后**单点抽查【观星】**就发现 3 个真问题（预览张数硬编码 5、触发时机错位到出牌阶段、不支持顶/底独立排序）。这暴露 v6.0 audit 太表面，看到 hook 注册了就标 ✅，没真正逐字段解析。

随后做了一次手工**逐字段重审**（25 个技能 × 5 spec 字段：timing / condition / cost / effect / frequency），又找到 9 处真实 mismatch。v6.1 用 7 个独立 PR 把这 12 处全部修到与 spec 完全一致。**硬性要求**：修好的标准是引擎实际行为与官方技能描述里所说的效果一字不差。

### 完整 PR 时间线

| PR | 修了什么 | 关键基础设施 |
|---|---|---|
| #17 | 【观星】预览张数 = min(存活, 5, deck)；触发时机搬到准备阶段（pendingChoice）；新 API `{ topIds, bottomIds }` 支持任意排序+顶/底分配 | `aliveActorCount`、`processPreparePhase`、`continueTurnAfterPreparePhase`、pendingChoice kind `guanxing-reorder` |
| #18 | 【鬼才】跨 actor 触发 — 任何判定都能干预，不只是自己的；非 pausable 判定回退 auto-fire | `judge(game, actor, reason, { pausable })`；handler 扫全场找 holder |
| #19 | 【反间】目标方真·猜花色（不是出招方传 `options.guessedSuit`）；player UI 弹 4 花色选择；AI 盲随机；保留 legacy override 不破 v30 test | pendingChoice kind `fanjian-guess`；`applyFanjianGuess` helper |
| #20 | 【反馈】玩家挑区域 + 具体牌（hand 随机不可窥探/装备/判定区按 cardId）| pendingChoice kind `fankui-pick`；zone catalog 构造 |
| #21 | 【刚烈】4 子问题全修：（a）夏侯惇 可选触发 yes/no；（b）来源可选 弃 2 vs 受 1；（c）来源可选哪两张；（d）含装备区可弃 | pendingChoice kinds `ganglie-fire` + `ganglie-source-choice`；shortcut 当 source 可弃 < 2 时跳 prompt 直接 takeDamage |
| #22 | 【武圣】扫红色含装备牌（关羽 卸下红色武器当杀）；【制衡】可弃装备区牌；【苦肉】hp=1 允许（spec "存活"，1v1 立即 gameover）| `findOwnCardById` / `removeOwnCardFromAnyZone` / `firstMatchingOwnCard` 三个"自己的牌 = hand + equipment"helpers；`canPlayCardAs` / `playCardAs` / `findResponseCard` 都过此 helper |
| #23 | 【突袭】skillPreferences.tuxi=decline 让 张辽 可弃用；【遗计】"按伤害点数逐点处理"——多点伤害（闪电 3 点）逐点弹 prompt 而不再批处理 | `pauseState.yiji` 跟踪 remainingPoints；`fireNextYijiPoint` 续跑；pendingChoice 加 `currentPoint` / `totalPoints` 元数据 |

### v6.1 累计基础设施

| 类别 | 内容 |
|---|---|
| **pendingChoice kinds** (7) | `guicai-replace` (6C) · `yiji-distribute` (6C-bis) · `guanxing-reorder` (6.1 #17) · `fanjian-guess` (#19) · `fankui-pick` (#20) · `ganglie-fire` (#21) · `ganglie-source-choice` (#21) |
| **skillPreferences** (6) | `luoyi`、`tieqi`、`guicai`、`yiji`、`tuxi`、`ganglie`（外加 `ganglieSource`）|
| **own-card helpers** | `findOwnCardById` / `removeOwnCardFromAnyZone` / `firstMatchingOwnCard` 跨 hand + equipment |
| **判定相关** | `judge(opts.pausable)` flag；processJudgeArea 可中断/恢复 |
| **多点处理** | `pauseState.yiji.{ remainingPoints, totalPoints }`；`fireNextYijiPoint` 续跑机制 |

### 测试增量

| 文件 | 断言数 | PR |
|---|---:|---|
| `tests/guanxing.test.mjs` | 14 | #17 |
| `tests/guicai_cross_actor.test.mjs` | 6 | #18 |
| `tests/fanjian_target_guess.test.mjs` | 7 | #19 |
| `tests/fankui_pick.test.mjs` | 8 | #20 |
| `tests/ganglie_choices.test.mjs` | 9 | #21 |
| `tests/wusheng_zhiheng_kurou_edge.test.mjs` | 9 | #22 |
| `tests/tuxi_yiji_perpoint.test.mjs` | 7 | #23 |
| 合计 | **60** 条 spec-compliance behavior 测试 | |

加上更新的 `tests/skills.test.mjs`（刚烈 3 条改写）和 `tests/pending_choice.test.mjs`（遗计 amount=1 不变），现有测试全部仍然 green。

### 验收（v6.1 全量）

- `npm run verify` —— 41 个测试文件全绿；6.0 audit harness 仍 26/26 ✅。
- 浏览器线上 `https://fsfrank9.github.io/sanguosha/` 完整对战流程，每个修复的技能都按官方规则交互。

---

## 下一步方向（v7 候选）

v6.1 把"现有 26 个已实现技能与 spec 完全对齐"做完了。还没碰、可作为后续主题的事：

### 1. 未实现的标准包技能 (17 个)
官方 cache 已经覆盖但引擎没接入：激将、酒援、奇袭、国色、流离、连营、护驾、洛神、急救、青囊、巨象、烈刃、好施、缔盟、英魂、化身、新生…… 每个都有完整 implementationSpec 可直接照抄。

### 2. 装备的"复杂副作用" handler 体系
6D 只把 **3 件 boolean 装备**（诸葛连弩 / 青釭剑 / 仁王盾）搬到 `EQUIPMENT_EFFECTS` 注册表。带副作用的装备仍硬编码在 `damage()` / `playSha()` 里：
- **八卦阵** 自动判定生闪
- **藤甲** -1 普通 +1 火 + 抗南蛮/万箭
- **白银狮子** 单次伤害降到 1 + 离场回血
- **青龙偃月刀** miss 后再杀
- **贯石斧** 弃 2 强制命中
- **寒冰剑** 双弃
- **雌雄双股剑** 性别效果（需先加性别属性）
- **方天画戟** +1 目标（需先支持多目标杀）

这些可以模仿 SkillRuntime hook 模型搞一套 `EquipmentRuntime.registerHook`，让装备的副作用也走 declarative 注册而不是硬编码。

### 3. 牌效果对照官方规则
6E 把 35 张牌的 spec 写到 `CARD_RULES` 里了，但没真正对照每张牌的实际引擎行为。已识别（但未修）的 5 个候选：
- 火攻属性是否通过铁索连环正确传导
- 借刀杀人 第三方距离校验是否到位
- 桃园结义 / 五谷丰登 在 1v1 的结算顺序
- 万箭齐发 在带【藤甲】时的伤害链
- 铁索连环 横置 + 火/雷链式触发的完整路径

每个可以走"先 audit 后修"的小 PR 流程，类似 v6.1 的节奏。

### 4. AI 进阶
- 把 6F 加的 5 个主动技 AI 决策从规则启发式升级到 expectimax 1-2 ply（特别是 仁德/反间 的目标价值评估）
- 加入 card-as 响应路径的 AI（当 AI 是 杀 目标时优先用 龙胆 转 闪、用 倾国 转 闪）
- 难度调节（保守/标准/激进）

### 5. 多人模式（3+ players）
v5 的架构是 1v1 hardcoded（`game.player` / `game.enemy`）。如果要做 3 人以上：
- 重构成 `game.actors = ['p1', 'p2', 'p3']` 列表
- `opponent()` helper 改成"下家"/"上家"/"所有其他"语义
- 修改身份系统（主公/忠臣/反贼/内奸）
- 距离计算从"恒为 1"改为座次
- 触发顺序（多人 同时触发 onDamageAfter 等）
- 这是一次性大重构，可能需要单独的 v7 major version

### 6. 牌组扩展
风林火山、SP 包目前只有 catalog 没有完整实现。可以按"技能就绪后再 enable 该武将"的顺序推进。

### 推荐优先级

如果让我建议：**(2) → (3) → (1) → (4) → (6) → (5)**。
- (2) 装备体系是当前最大的硬编码债务，影响其他技能交互（藤甲挡杀、青釭穿透、白银防止）
- (3) 牌规则是用户最先能感知到的"为什么这张牌不按官方走"问题
- (1) 新技能给玩家更多可选武将
- (5) 多人是最大改造，最后再做

---

## v7 — 牌效果与流程规则对照官方 spec-compliance Series

### 缘起

v6.1 完成后，用户指出"目前里面很多牌的用法都是不对，规则很多也是有问题的"，并提供 https://gltjk.com/sanguosha/rules/ 作为权威规则参考。完整 55 页规则镜像已通过 PR #26 合入 `official-skill-cache/gltjk-sanguosha-rules/` 作为本地资料源。

逐条对照 gltjk 镜像（card__basic / card__scroll / card__equipment / flow__use / flow__damage / flow__judge / flow__neardeath / flow__condition / rule__principle），audit 发现 16 项 spec 偏差，按硬伤 / 行为偏差 / 基础流程缺失分 3 个 tier 修复。

### 计划 PR 列表

#### Tier 1：影响盘面的硬伤
| PR | 修复对象 | spec 引用 | 状态 |
|---|---|---|---|
| PR-1 | 【桃】支持 target 选择（己方 / 受伤的对手） | `card__basic.md` "包括你在内的一名已受伤的角色" | 🟢 PR #27 已合并 |
| PR-2 | 【桃园结义】对未受伤角色无效（不触发回血事件） | `card__scroll.md` "对未受伤的角色无效" | 🟢 PR #28 已合并 |
| PR-3 | 【麒麟弓】只弃 1 匹马（含 pendingChoice 二选一） | `card__equipment.md` "弃置其装备区里的一张坐骑牌" | 🟢 PR #29 已合并 |
| PR-4 | 【雌雄双股剑】目标二选一 + 性别检查 + 指定目标后时机 | `card__equipment.md` "指定与你性别不同的一个目标后，令其选择一项" | 🟢 PR #30 已合并 |
| PR-5 | 【借刀杀人】双合法性检测（选 Bn 时 + An 用杀时）+ 目标决策 | `card__scroll.md` "须进行两次使用【杀】的合法性检测" | 🟢 PR #31 已合并 |
| PR-6 | 延时锦囊同名禁叠（判定区已有同名 → 不合法目标） | `flow__condition.md` "判定区里有延时类锦囊牌的角色不是使用同名..." | 🟢 PR #32 已合并 |
| PR-7 | 【五谷丰登】reveal-then-pick 结算流程 | `card__scroll.md` "亮出 X 张...获得这些牌中（剩余）的一张" | 🟢 PR #33 已合并 |

#### Tier 2：行为偏差
| PR | 修复对象 | spec 引用 | 状态 |
|---|---|---|---|
| PR-8 | 【酒】每回合限一次 + shaBonus 绑回合 | `card__basic.md` "每回合限一次"；shaBonus 基于"声明【杀】的回合" | 🟢 PR #34 已合并 |
| PR-9 | 【过河拆桥】1V1 二选项（弃装备区 / 看手并弃） | `card__scroll.md` "1V1 变体" | 🟢 PR #35 已合并 |
| PR-10 | 【顺手牵羊】1V1 无距离限制（任意区域） | `card__scroll.md` "1V1 变体：有牌的对手" | 🟢 PR #36 已合并 |
| PR-11 | 【兵粮寸断】1V1 无距离限制 | `card__scroll.md` "1V1 变体" | 🟢 PR #37 已合并 |
| PR-12 | 【闪电】next-valid 链转 + 判定区冲突回退 | `card__scroll.md` "若其下家不是此【闪电】的合法目标..." | 🟢 PR #38 已合并 |

#### Tier 3：基础流程缺失
| PR | 修复对象 | spec 引用 | 状态 |
|---|---|---|---|
| PR-13 | 濒死流程（hp≤0 → 进入处于濒死状态 → 双方按顺序提示 桃 / 酒） | `flow__neardeath.md` 完整结算流程 | 🟢 PR #39 已合并 |
| PR-14 | 【丈八蛇矛】2 手牌当虚拟【杀】使用 / 响应 | `card__equipment.md` "你可以将两张手牌当【杀】使用或打出" | 🟢 PR #40 已合并 |
| PR-15 | 【方天画戟】最后一张手牌时 +2 额外目标标记 | `card__equipment.md` "若你使用的【杀】是最后的手牌..." | 🟡 PR 待合并 |
| PR-16 | 【无中生有】target 可选（含对手） | `card__scroll.md` "包括你在内的一名角色" | ⏳ 待开 |

### PR-15 落地 — 方天画戟 触发标记

**问题**：gltjk `card__equipment.md`【方天画戟】：

> 技能：若你使用的【杀】是最后的手牌，你使用此【杀】的额外目标数上限+2。

旧实现完全没有 方天 触发检测 (`CARD_RULES.fangtian.engineHooks` 标 "playSha:fangtianTargets" 但代码里压根没这分支)。

**1v1 注**：在 1v1 中只有 1 名对手 (额定 1 + 额外 0)，即便额外目标数上限+2 也无人可选；本 PR 仅做触发记录 (`log + flags.fangtianBonus`) 作为多人模式 / future trick 的占位。

**改动**：
- `playSha` 进入时先清 `flags.fangtianBonus = false`；若装备方天 + `self.hand.length === 0`（即上一刻该 sha 是最后一张），置 `flags.fangtianBonus = true` 并记 log
- `phases.js`：`resetActorTurnState` / `resetEndOfTurnState` 都加 `flags.fangtianBonus = false`（防御性复位）
- `CARD_RULES.fangtian`：summary / effect / engineHooks 三字段对齐
- `tests/phase_runtime.test.mjs`：期望对象补 `fangtianBonus: false`

**新增** `tests/fangtian_last_handcard.test.mjs`（6 条断言）：
- 装备方天 + 最后一张为 杀 → flag=true + log
- 装备方天 + 杀 不是最后一张 → 不触发
- 装备非方天 → 不触发
- 1v1 中行为 no-op（仍只命中对手 1 dmg）
- 多次 sha 同回合 — 每次重置
- 回合结束后复位

### PR-14 落地 — 丈八蛇矛 (使用 + 响应)

**问题**：gltjk `card__equipment.md`【丈八蛇矛】：

> 技能：你可以将两张手牌当【杀】**使用或打出**。

旧实现里 `Engine.playZhangbaSha(actor, [id1, id2])` 已经支持"使用"路径（line 3124），但**响应路径完全缺失**——`findResponseCard` 在没有真实 杀 / 武圣 / 倾国 / 龙胆 转化的情况下直接返回 null，即便目标装备 丈八 + 手牌 ≥ 2 也无法响应 决斗 / 南蛮 / 借刀 等需要打出 杀 的事件。

**改动**：
- `findResponseCard` 的 `type === 'sha'` 分支末尾加 丈八 兜底：装备 丈八 + 手牌 ≥ 2 + `skillPreferences.zhangba !== 'decline'` 时，consume 前两张手牌生成虚拟 杀
- `consumeResponse` 加 `response.extraCards` 处理：丈八响应弃两张物理手牌；虚拟杀对象不进弃牌堆（含 `physicalCard: null` 和 `virtual: true` 标记）
- log 形式 "发动【丈八蛇矛】，将【桃】、【闪】当【杀】响应【决斗】"
- `CARD_RULES.zhangba`：summary/effect/engineHooks 对齐

**新增** `tests/zhangba_response.test.mjs`（6 条断言）：
- `playZhangbaSha` 旧使用路径仍工作
- 决斗响应：装备丈八+无杀+2手 → 自动当杀响应
- 决斗响应：装备丈八+只 1 张手牌 → 无法响应 → 受 1 dmg
- 决斗响应：装备丈八+真 sha → 优先用真 sha（不弃手牌）
- `skillPreferences.zhangba='decline'` → 不走丈八响应路径
- 南蛮入侵响应同款（任何需要打出杀的事件）

### PR-13 落地 — 濒死流程 (Tier 3 基础流程)

**问题**：gltjk `flow__neardeath.md` 完整流程：

> ## 濒死事件的结算流程
> 处于濒死状态时：从当前回合角色开始按逆时针方向依次进行响应，直到 A 将体力值首次回复至 1 点或 1 点以上为止...
> 能使用的牌：【桃】、【酒】。

旧实现 (`game-engine.js:1005, 1777`) 直接把 hp ≤ 0 视作 game-over，**完全不模拟濒死结算**——即便玩家手里有【桃】也无救援机会，与 spec 严重违背。

**改动**：

引擎核心：
- `damage()` 末尾 hp≤0 时调用 `enterDying(actor, source)` 而不是直接 game-over
- `kurou` 路径 hp≤0 时也调用 `enterDying(actor, actor)`
- 新增 5 个函数：
  - `enterDying(dyingActor, sourceActor)`：初始化 `pauseState.dying = {actor, source, responders:[turn-player, opponent(turn-player)], idx:0, actedOnce:{}}`，立即 `processDyingNext`
  - `processDyingNext`：按顺序遍历 responders，每名通过 `attemptDyingRescue` 尝试救援；hp≥1 即结束；全部遍历无救 → game-over (winner = opponent(dyingActor))
  - `attemptDyingRescue(responder, dying)`：检查响应者手牌中可用的 桃 / 酒（酒仅 self），按 `skillPreferences.dying` 决定 auto/ask/decline；ask → pendingChoice 'dying-rescue'
  - `executeDyingRescue`：消耗指定 桃 / 酒，给 dyingActor + 1 hp
  - `resolveDyingRescueChoice`：处理 player decision (cardId 或 decline)，回到 processDyingNext
- `resolvePendingChoice` dispatch 加 `dying-rescue`

数据层：
- `CARD_RULES.tao` 加 PR-13 注：濒死阶段任意 responder 可救援
- `CARD_RULES.jiu` 加 PR-13 注：使用方法Ⅱ（仅濒死者本人）

**行为关键**：
- AI 永不救对手（仅救自己）
- player 收到 pendingChoice 'dying-rescue'，可选 `{cardId}` 或 `{decline:true}`
- 1v1 中 responder 顺序 = [turn-player, opponent]；spec 中 "上家" 在 1v1 = 对手

**新增** `tests/dying_flow.test.mjs`（8 条断言）：
- 玩家受致命伤有桃 auto → 自救存活
- 无桃无酒 → 死亡
- 有酒 auto → 用酒 Method II 自救
- player default ask → pendingChoice 'dying-rescue'
- resolve {cardId} → 救活
- resolve {decline} + 对手不救 → 死
- 苦肉 hp=1 + 有桃 → 自救存活
- AI 对手默认不救玩家（responder !== dyingActor + auto → skip）

### PR-12 落地 — 闪电 next-valid 链转 + 判定区冲突回退

**问题**：gltjk `card__scroll.md`【闪电】注：

> ◆【闪电】在使用结算结束后/目标角色被取消后，若对应的实体牌在处理区/判定区里，须将对应的实体牌置入其下家的判定区。**若其下家不是此【闪电】的合法目标，则将对应的实体牌置入其下家的下家的判定区，以此类推。若所有角色都不是此【闪电】的合法目标，则将对应的实体牌置入其判定区**。

旧实现 (`game-engine.js applyJudgeAreaOutcome`) 非命中时无条件 `game[opponent(actor)].judgeArea.push(trick)` —— 没考虑 PR-6 定义的"判定区有同名延时锦囊 = 非合法目标"。在 1v1 中若两人都已有 闪电，第二张应当回到原判定区而不是叠到对手。

**改动**：
- `applyJudgeAreaOutcome` 中 `outcome.moveToNext` 分支加 next-valid 检查：若 opponent.judgeArea 已有同名 闪电 → 留在当前 actor 判定区；否则才推到 opponent。
- `CARD_RULES.shandian`：effect 字段补 PR-12 链转语义说明。

**新增** `tests/shandian_next_valid.test.mjs`（6 条断言）：
- 非命中 + 对手判定区空 → 移到对手
- 非命中 + 对手判定区已有同名 → 留在自己 (next-of-next 回归)
- 命中 → 受 3 点雷电伤害 + 闪电进弃牌堆
- 在 enemy 判定区命中 → enemy 受伤
- 在 enemy 判定区非命中 → 移回 player
- enemy 非命中 + player 已有同名 → 留在 enemy (对称 loop)

注：测试中命中场景需要在 `deck` 中放足够 padding 卡，避免 draw 阶段的 reshuffleIfNeeded 把弃牌堆里的 闪电 洗回手牌（引擎正常行为，但测试需规避）。

### PR-11 落地 — 兵粮寸断 1V1 无距离限制

**问题**：gltjk `card__scroll.md`【兵粮寸断】1V1 变体：

> ### 【兵粮寸断】（1V1）
> - 使用时机：出牌阶段。
> - 使用目标：**对手**。
> - 作用效果：目标角色判定，若结果不为梅花，其跳过摸牌阶段。

标准【兵粮】是"距离为 1 的一名其他角色"，1V1 变体去掉距离限制。

PR-10 已把 `canPlayCard` 中距离检查缩到 `bingliang` only；PR-11 把这条也去掉。

**改动**：
- `canPlayCard`：删除 `card.type === 'bingliang'` 的距离判断分支，留下注释说明 1V1 标准包内已无距离限制锦囊
- `CARD_RULES.bingliang`：summary / effect / engineHooks 对齐 1V1 spec
- `tests/skill_runtime_hooks.test.mjs` 中 "Qicai trick-distance" 测试改写：原断言要求 `canPlayCard` 引用 `SkillRuntime.hasPassiveEffect(..., 'ignoreTrickDistance')` 与 `distanceBetween(...)`，现在两条都不在 canPlayCard 里（顺手 / 兵粮 1V1 都没了距离）。改为：不硬编码 `hasSkill('qicai')` + 必须有 1V1 spec 注释，保留 seam 给未来恢复时用。

**新增** `tests/bingliang_1v1_no_distance.test.mjs`（6 条断言）：
- distance=2 可用
- distance=3 可用
- 实际放入对手判定区
- 同名禁叠（PR-6）仍生效
- 梅花判定 → 不跳过摸牌（spec 正常路径）
- 非梅花判定 → 跳过摸牌

至此 **PR-10/11 完成 1V1 距离规范化**：1V1 标准包内已无 distance-limited 锦囊牌；【奇才】在 1V1 中保留数据但实际为 no-op。

### PR-10 落地 — 顺手牵羊 1V1 无距离限制

**问题**：gltjk `card__scroll.md`【顺手牵羊】1V1 变体：

> ### 【顺手牵羊】（1V1）
> - 使用时机：出牌阶段。
> - 使用目标：**有牌的对手**。
> - 作用效果：你获得目标角色的一张牌。

标准【顺手】是"距离为 1 的一名区域里有牌的其他角色"，1V1 变体去掉了距离限制。

旧实现 `canPlayCard`：
```js
if ((card.type === 'shunshou' || card.type === 'bingliang') && !hasPassive(self, 'ignoreTrickDistance') && distance > 1) {
  return fail('距离不足...');
}
```
仍按标准包检查距离 1，违反 1V1 spec。

**改动**：
- `canPlayCard`：把距离检查从 `shunshou || bingliang` 缩到只剩 `bingliang`（PR-11 再去掉 bingliang）
- `CARD_RULES.shunshou`：summary/effect/engineHooks 对齐 1V1 spec

**测试更新**：
- `tests/skills.test.mjs` "黄月英【奇才】 ignores distance limits..." 旧用例假设无【奇才】时距离 2 阻挡 顺手——这与 1V1 spec 冲突。改写为 "v7 PR-10: 顺手牵羊 (1V1) 无距离限制 — 任何角色（含/不含奇才）都能在距离 >1 时使用"，验证两种身份都能在距离=2 下顺利出 顺手。
- 注：奇才 在 1V1 中无实际意义（所有原距离限制的标准包锦囊在 1V1 都没了距离限制），保留技能数据但实际为 no-op。

**新增** `tests/shunshou_1v1_no_distance.test.mjs`（7 条断言）：distance=2/3 可用 / 弃指定装备 / 偷判定区延时锦囊 / 偷指定手牌 / 对方完全无牌时 canPlayCard 拒绝 / 仅判定区有牌也通过（spec "有牌的对手" 不限区域）。

### PR-9 落地 — 过河拆桥 1V1 二选项

**问题**：gltjk `card__scroll.md`【过河拆桥】1V1 变体：

> ### 【过河拆桥】（1V1）
> - 使用时机：出牌阶段。
> - 使用目标：区域里有牌的对手。
> - 作用效果：你选择一项：1.弃置目标角色的装备区里的一张牌；2.观看目标角色的手牌并弃置其中一张牌。

旧实现 (`game-engine.js`) 用通用 `removeTargetZoneCard(targetActor, options.targetZone, options.targetCardId)` —— `targetZone` 接受 `'hand'`/`'equipment'`/`'judge'`，违反 1V1 spec 限定（不允许判定区）；玩家也无法看到对手手牌内容（spec 明文 "观看目标角色的手牌"）。

**改动**：
- `canPlayCard`：guohe 在 1V1 中只要求对手 hand 或 equipment 有牌；判定区有牌但其它两区皆空 → 拒绝
- `resolveGuohe1v1(sourceActor, targetActor, options)`：
  - `options.targetZone === 'judge'` → 显式拒绝
  - 显式 `'equipment'` / `'hand'` + cardId → 直走 `executeGuohe1v1Pick`（向后兼容老 UI）
  - 未指定 → 按 `skillPreferences.guohe`（`auto` / `ask` / `decline`）：
    - `auto` (AI 默认): 装备优先 → 手牌
    - `ask` (player 默认): `pendingChoice = {kind:'guohe-1v1-pick', actor, target, equipment:[…], hand:[…手牌内容…]}` （spec 选项 2 暴露手牌）
- 新增 `executeGuohe1v1Pick` + `resolveGuohe1v1PickChoice`
- `resolvePendingChoice` dispatch 加 `guohe-1v1-pick`
- `CARD_RULES.guohe`: summary/effect/engineHooks 三字段对齐 1V1 spec

**新增** `tests/guohe_1v1_two_options.test.mjs`（11 条断言）：canPlayCard 边界 / 显式 judge 拒绝 / equipment 直传 / hand 直传 / AI auto 优先装备 / AI auto 仅手牌 / player ask pendingChoice 暴露 hand 内容 / resolve equipment / resolve hand / resolve 错误 zone。

### PR-8 落地 — 酒 每回合限一次 + shaBonus 绑回合

**问题**：gltjk `card__basic.md`【酒】使用方法Ⅰ：

> - 使用时机：出牌阶段。**每回合限一次**。
> - 作用效果：目标角色于此回合内使用的下一张【杀】的伤害值基数 +1。
> > ◆一名角色使用的【杀】是否会受到【酒】的影响是根据其声明使用的牌的牌名（【杀】）时是否为**其使用【酒】的那个回合内**来判断的。

旧实现：
- `canPlayCard` 不查每回合限制 → 同回合可叠喝多次
- `resolve jiu` 用 `self.shaBonus = (self.shaBonus || 0) + 1` 累加 → 多张酒可叠 +N 伤害
- shaBonus 跨回合表面上由 `resetActorTurnState` / `resetEndOfTurnState` 复位（已存在），所以"绑回合"基本工作；但 `+= 1` 仍是 bug

**改动**：
- `phases.js`：`resetActorTurnState` / `resetEndOfTurnState` 都加 `flags.jiuUsedThisTurn = false`
- `canPlayCard`：`card.type === 'jiu'` 时检查 `flags.jiuUsedThisTurn` → fail "本回合已经使用过【酒】。"
- `resolve jiu`：`self.flags.jiuUsedThisTurn = true`；`self.shaBonus = 1`（不累加）
- `CARD_RULES.jiu`：summary/effect/engineHooks 对齐 spec
- `tests/phase_runtime.test.mjs`：补 `jiuUsedThisTurn: false` 期望键

**新增** `tests/jiu_once_per_turn.test.mjs`（6 条断言）：
- 第二张酒同回合被 canPlayCard 拒
- 酒+杀 → 2 dmg
- shaBonus 用一次清零，第二张杀回到 1 dmg
- 酒喝完不出杀 → 回合结束 shaBonus 归零
- 新回合可再次喝
- 不会累加（设 `shaBonus=5` 模拟，喝酒后变 1）

### PR-7 落地 — 五谷丰登 reveal-then-pick

**问题**：gltjk `card__scroll.md`【五谷丰登】

> - 执行动作：当此牌指定目标后，你**亮出**牌堆顶的 X 张牌（X 为目标数）。
> - 作用效果：目标角色获得这些牌中（剩余）的一张牌。
> > ◆若你未将执行动作完整执行完毕，终止此牌的使用结算。
> > ◆使用结算结束后，将这些牌中剩余的牌置入弃牌堆。

旧实现 (`game-engine.js:2422-2432`) 仅做 `[actor, opponent].forEach { game.deck.pop() → state.hand.push }`，**没有 reveal 步骤**，**没有可选**——只是把牌堆顶两张分发给两人。1v1 中目标 = 2 时不会有 leftover 入弃牌堆，但语义不符 spec。

**改动**：
- `resolve wugu`：先 `aliveActorCount` 取 X，然后 reshuffleIfNeeded 多次直到 `deck.length >= X`，仍不够则按 spec 终止使用结算（"未将执行动作完整执行完毕"）。
- 一次性 reveal X 张到 pool 池，记 log。
- 新增 `processWuguPick(game, sourceActor, wuguCard, pool, order, idx, options)` 顺序循环：
  - pool 仅余 1 张时强制取走（无可选项）；
  - 多张时按 `skillPreferences.wugu` 决定 (`auto` / `ask`)；
  - `ask` → `pendingChoice = {kind:'wugu-pick', actor:picker, sourceActor, cards:[…]}` + `pauseState.wugu = {sourceActor, wuguCardId, pool, order, idx, options}` 续算上下文。
- 新增 `resolveWuguPickChoice` 处理 `decision.cardId`，从 pool 中 splice 该卡进 picker 手牌，然后 `processWuguPick` 续算下一 picker。
- 全部选完 → leftover (1v1 X=2 实际无 leftover) 入弃牌堆 → `success`。
- `resolvePendingChoice` dispatch 加 `wugu-pick`。
- `CARD_RULES.wugu`：summary/effect/engineHooks 三字段对齐 spec + 新流程。

**测试**：新增 `tests/wugu_reveal_pick.test.mjs`（7 条断言）：auto / ask / resolve / 错误 cardId / 牌堆不足终止 / enemy AI / 1v1 X=2 无 leftover。

**legacy fix**：`tests/cards_equipment.test.mjs` 的 "core trick cards resolve" 用例切到 `skillPreferences.wugu='auto'` 走旧的"按顺序自动取"路径（player 默认 `ask` 现在会 pause）。

### PR-6 落地 — 延时锦囊同名禁叠

**问题**：gltjk `flow__condition.md` 共同合法性规则：

> 注意：使用延时类锦囊牌有一条共同的合法性检测规则：**判定区里有延时类锦囊牌的角色不是使用同名延时类锦囊牌的合法目标**。

旧实现（`game-engine.js:2307-2316`）只是 `judgeArea.push(card)`——若 opponent 已有【乐不思蜀】仍然会被叠第二张【乐不思蜀】，导致判定阶段重复结算。

**改动**：
- `canPlayCard` 加 `card.family === 'delayed'` 分支：根据延时锦囊种类确定 target（乐 / 兵 → opponent；闪电 → self），检查目标 `judgeArea` 是否已有同 `type` 卡，若有则 fail。
- `CARD_RULES` 中【乐】【兵】【闪电】effect 字段补"v7 PR-6: 同判定区已有同名…时不合法"。

**新增** `tests/delayed_trick_dedup.test.mjs`（8 条断言）：
- 乐已存在 → 拒绝
- 兵粮已存在 → 拒绝
- 闪电（self）已存在 → 拒绝
- 异名延时锦囊不冲突
- 闪电的目标是 self，opponent 持有同名不阻止
- 已放置一张后再放第二张被拒
- AI canPlayCard 同样检查
- 判定区清空后可重放

`npm run verify` exit 0。

### PR-5 落地 — 借刀杀人 双合法性检测

**问题**：gltjk `card__scroll.md`【借刀杀人】注：

> 注意：使用【借刀杀人】的过程中**须进行两次使用【杀】的合法性检测**：
> 第一次是在你选择 An 使用【杀】的目标 Bn 时（此时【杀】并未置入处理区，Bn 只是被选择为将要使用的【杀】的目标），因此你不能对攻击范围内没有使用【杀】的合法目标的角色使用【借刀杀人】；
> 第二次是在 An 选择是否对 Bn 使用【杀】时，须检测 Bn 是否为 An 使用【杀】的合法目标。

旧实现 (`game-engine.js:2356-2370`) 完全没做这两次检测：
1. canPlayCard 不查 An 的武器范围 / target-protection；
2. resolve 时 `removeFirstCardOfType(weaponOwner, 'sha')` 直接拿出 sha 调 `playSha`，若 playSha 失败 sha 直接丢失；
3. opponent 不能选择 decline（玩家无决策权）。

**改动**：
- `canPlayCard`：第一次合法性检测——opponent 装备区有武器 + `canReachWithSha(opponent, source)` + `cardTargetProtection`（onCardTarget 钩子如 谦逊 / 空城）。装备效果（仁王 / 藤甲）不在 canPlayCard 拦截，因为 canPlayCard 不知道 opponent 具体出哪种【杀】，留给 resolve 阶段。
- 新增 `resolveJiedaoDecision`：第二次合法性检测——opponent 有 sha + canReach + 无 onCardTarget protection；满足时按 `skillPreferences.jiedao` (`auto`/`ask`/`comply`(=`auto`)) 决定 fire / pendingChoice 'jiedao-decision' / decline。
- 新增 `jiedaoFireOpponentSha`：取一张 sha 调 `playSha`；若 playSha 返回 fail（如 mid-resolve 距离/装备变化）→ 把 sha 放回手牌 + 交武器。
- 新增 `transferWeaponJiedao`：把 opponent 武器移交 source 手牌。
- 新增 `resolveJiedaoDecisionChoice`（resolvePendingChoice 加 `jiedao-decision` dispatch）。
- `CARD_RULES.jiedao`：summary/effect/engineHooks 三字段对齐 spec。

**spec 行为澄清（测试 10）**：opponent 用黑杀被 source 仁王盾抵消时，sha 仍视为"已使用"，weapon 留 An（spec: "An 需对 Bn 使用【杀】"，结果不影响）。

**新增** `tests/jiedao_dual_legality.test.mjs`（10 条断言）。

### PR-4 落地 — 雌雄双股剑 完整 spec 合规

**问题三连**：gltjk `card__equipment.md` 原文 "每当你使用【杀】指定**与你性别不同的一个目标后**，你可以**令其选择一项**：1.弃置一张手牌；2.令你摸一张牌。" 旧实现 (`game-engine.js:1324-1332`) 全错：

1. **时机错**：`applyWeaponHitEffects` 在 **造成伤害后** 调用——sha 被闪躲时雌雄根本不触发；spec 是"指定目标后"，即响应窗口之前。
2. **决策错**：源 + 目标都没有决策权，自动 `hand[0]` 弃或源摸——spec 是源 optional + 目标二选一。
3. **性别检查缺失**：根本没有 gender 字段。

**改动**：

新增 `gender` 数据：
- `heroes.js`：所有 26 个英雄加 `gender: 'male' | 'female'`，按 gltjk `card__hero__*.md` 镜像（甄姬 / 大乔 / 黄月英 / 貂蝉 = female；其余 = male）
- `runtime.js`：`makePlayer` 读 `hero.gender`，缺省 `'male'`

引擎重构：
- 拆 `playSha` 为 `playSha`（指定目标后） + `continueShaAfterCixiong`（仁王/响应/八卦/贯石/青龙/伤害）
- 新增 `applyCixiongOnDesignate`：性别检查 → `skillPreferences.cixiong` (`auto`/`ask`/`decline`)
  - `ask` (player 默认): `pendingChoice = {kind:'cixiong-fire', actor, target}`
- 新增 `fireCixiongTargetChoice`：目标无手牌 → 强制源摸 1；否则按 `skillPreferences.cixiongResponse` 处理（`auto` = 弃 hand[0]；`ask` = `pendingChoice 'cixiong-choose'`）
- 新增 `resolveCixiongFireChoice` / `resolveCixiongChoose` / `resumePlayShaAfterCixiong`
- 暂停时 `pauseState.playSha = {actor, card, amount}`，resolve 后接续 `continueShaAfterCixiong`

`CARD_RULES.cixiong`：summary/effect/engineHooks 全部对齐 spec。

新增 `tests/cixiong_target_choice.test.mjs`（10 条）：同性 / AI auto / 目标无手牌 / 源 ask / decline / fire+target auto / target ask draw / target ask discard cardId / **闪躲后仍触发** / 源 decline。

**关键 spec 修复**：测试 9 "cixiong 在 sha 被闪躲后仍然触发"——这是旧实现完全做错的边缘行为，新实现按"指定目标后"时机已经正确放行。

### PR-3 落地 — 麒麟弓 弃 1 匹马 + pendingChoice

**问题**：`game-engine.js:1253-1255` 旧实现：
```js
if (weapon.type === 'qilin') {
  if (game[targetActor].equipment.horsePlus) loseEquipment(...);
  if (game[targetActor].equipment.horseMinus) loseEquipment(...);
}
```
**两匹马同时弃**——违反 gltjk `card__equipment.md` 明文 "弃置其装备区里的一张坐骑牌"。"你可以" 也意味着应该是 optional。

**改动**：
- 提取 `applyQilinDiscard(game, sourceActor, targetActor)`
  - 0 匹马 → 不触发
  - 1 匹马 → 直接弃（没有可选项）
  - 2 匹马 → 看 `skillPreferences.qilin`:
    - `'auto'` (AI 默认): 弃 +1 马（启发式默认）
    - `'ask'` (player 默认): 设 `pendingChoice = { kind: 'qilin-pick', actor, target, horseSlots }`
    - `'decline'`: 不触发
- 新增 `resolveQilinPickChoice` 处理 `{slot, decline}`
- `resolvePendingChoice` dispatch 添加 `qilin-pick`
- `CARD_RULES.qilin`：summary / effect / engineHooks 三字段对齐 spec + 新流程
- 新增 `tests/qilin_horse_pick.test.mjs`（9 条断言）覆盖 0/1/2 匹 × auto/ask/decline × player/enemy 路径
- 更新 `tests/cards_equipment.test.mjs` "Qilin weapon effects are playable" 用例：用 `pref='auto'` + 断言 +1 弃 / -1 保留（旧用例期望两匹都弃——那是旧 bug 行为）

### PR-2 落地 — 桃园结义 对未受伤角色无效

**问题**：`game-engine.js:2074-2080` 旧实现 `['player', 'enemy'].forEach(side => game[side].hp = min(maxHp, hp+1))` 对所有角色无条件 +1（被 `Math.min` 截断）。gltjk 明文："对未受伤的角色无效"——这意味着对满血角色根本不触发"回复体力"事件，今后若加 仁心 / 节命 等"回复体力时"hook，触发集合会不一样。结算顺序也违反 `rule__principle.md` 多角色结算顺序原则 a.（"从当前回合角色开始按逆时针方向"，1v1 = 发动者先）。

**改动**：
- `resolve taoyuan`：循环顺序改成 `[actor, opponent(actor)]`；每个目标先判 `hp >= maxHp`——满血则记"对 X 无效"日志且跳过 heal；受伤才回血。
- `CARD_RULES.taoyuan`：summary / effect 对齐 spec。
- 新增 `tests/taoyuan_wounded_only.test.mjs`（5 条断言）：双方受伤 / 仅发动者受伤 / 仅对手受伤 / 双方满血 / 顺序检查。

**保留行为**：原 `tests/cards_equipment.test.mjs` 用例（双方 hp=2 → 双方变 3）仍然通过。

### PR-1 落地 — 桃 target 选择

**问题**：`game-engine.js:1797` 已经禁止满血用桃（这条 audit 报告误报），但 `playTao` (`:1998-2003`) 硬编码 `self.heal(1)`，不支持把【桃】用在受伤的对手身上——而 gltjk 明文是"包括你在内的一名已受伤的角色"。

**改动**：
- `canPlayCard`：放宽为"任一方受伤即可"（双方满血才拒绝）。
- `resolve tao`：接受 `options.taoTarget = 'player' | 'enemy'`；缺省回退顺序 = 自己受伤 → 自己；否则 → 对手。Target 满血即 reject。
- `CARD_RULES.tao`：summary / targets / effect 三字段对齐 gltjk 文本。
- 新增 `tests/tao_target_choice.test.mjs`（6 条断言）覆盖 canPlayCard / 自治 / 对治 / 双满血拒绝 / 单受伤回退。

**回归**：`npm run verify` 全绿，包含原 `tests/game_engine.test.mjs` 的 "tao heals but never above max hp"——后者依赖默认 newGame 双方均为满血，所以二次出桃仍然被拒。

### 测试增量

| 文件 | 断言数 | PR |
|---|---:|---|
| `tests/tao_target_choice.test.mjs` | 6 | PR-1 |
| `tests/taoyuan_wounded_only.test.mjs` | 5 | PR-2 |
| `tests/qilin_horse_pick.test.mjs` | 9 | PR-3 |
| `tests/cixiong_target_choice.test.mjs` | 10 | PR-4 |
| `tests/jiedao_dual_legality.test.mjs` | 10 | PR-5 |
| `tests/delayed_trick_dedup.test.mjs` | 8 | PR-6 |
| `tests/wugu_reveal_pick.test.mjs` | 7 | PR-7 |
| `tests/jiu_once_per_turn.test.mjs` | 6 | PR-8 |
| `tests/guohe_1v1_two_options.test.mjs` | 11 | PR-9 |
| `tests/shunshou_1v1_no_distance.test.mjs` | 7 | PR-10 |
| `tests/bingliang_1v1_no_distance.test.mjs` | 6 | PR-11 |
| `tests/shandian_next_valid.test.mjs` | 6 | PR-12 |
| `tests/dying_flow.test.mjs` | 8 | PR-13 |
| `tests/zhangba_response.test.mjs` | 6 | PR-14 |
| `tests/fangtian_last_handcard.test.mjs` | 6 | PR-15 |
| _其余 PR 待开_ | — | — |

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
