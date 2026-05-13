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

**Status:** 进行中。

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

**Status:** 待启动。

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

## Phase 6E — Card-rule audit against official rules

**Status:** 待启动。

### 设计要点

- 按牌族分子 PR：基本牌（杀/闪/桃/酒） → 即时锦囊（无中生有/借刀杀人/过河拆桥/顺手牵羊/决斗/南蛮/万箭/桃园/五谷/无懈/火攻/铁索/雷杀/火杀）→ 延时锦囊（乐不思蜀/兵粮寸断/闪电）。
- 每张牌新增 fixture 驱动测试：从 `tests/fixtures/official_card_rules.json`（新增）读官方规则要点，断言引擎行为符合。
- 修复时如果触及描述文案，同步更新 `src/data/cards.js` 的 `desc` 字段。

### 任务

- Task 1: 新增 `tests/fixtures/official_card_rules.json`，覆盖现有 40 个 CARD_CATALOG 条目。
- Task 2: 按牌族分子 PR 修复 mismatch。
- Task 3: 删除 `game-engine.js` 里对特定牌名的零散硬编码，改为查 metadata。

### 验收标准

- `npm test` 全绿；新增至少 20 条卡牌规则对照测试。
- 浏览器 smoke：常用对局流程（杀/闪/桃 → 锦囊 → 延时锦囊判定 → 装备）行为符合官方。

---

## Phase 6F — AI skill awareness

**Status:** 待启动。

### 设计要点

- 当前 `aiTakeAction` 只识别【苦肉】【制衡】两个主动技；扩展到 26 个：
  - 主动技（仁德、反间、观星、苦肉、制衡）：进入 AI 主动调度循环。
  - 转化/响应技（武圣、龙胆、倾国、铁骑、英姿、突袭、奇才）：扩 `findResponseCard` / `canPlayCardAs` 时 AI 也走转化路径。
  - 被动/伤后技（奸雄、反馈、刚烈、鬼才、天妒、遗计、闭月、克己、集智、空城、谦逊、咆哮、马术、裸衣）：原本就在 hook 里跑，AI 只需在评分时把"我有这些技能"作为正向权重。
- 引入 `aiSkillStrategy` 表，每个技能一个"该不该用 / 用了之后期望收益"配置；评分函数读这个表。

### 任务

- Task 1: 新增 `src/engine/ai-strategy.js`（与现有 game-engine.js AI 段独立，便于以后扩展）。
- Task 2: 把当前内嵌评分逻辑（杀=45–78、桃=100、酒=82 等）迁过去并扩展。
- Task 3: 新增 `tests/ai_skills.test.mjs`：26 条对照测试，每条断言"在 X 条件下，AI 应该用 / 不应该用 Y 技能"。

### 验收标准

- `npm test` 全绿。
- 浏览器 smoke：AI 控制黄盖时会主动使用【苦肉】（已有），AI 控制黄月英、孙权、刘备、周瑜、诸葛亮时都能看到技能被合理使用。

---

## Phase 6G — 收尾

**Status:** 待启动。

### 任务

- v6 计划文档把 6.0 → 6G 全部标 `✅ 已完成`。
- README「当前版本」从 v5.0 节升级到 v6.0 节，提"规则正确性 + 数据驱动元规则"。
- README「武将技能实现状态」节按 6A 后的 schema 重新生成。
- `docs/plans/2026-05-13-sanguosha-v5-architecture.md` 保持冻结状态不变。
- `package.json` version 升到 6.0.0。

### 验收标准

- 全量 `npm run verify`（构建 check + 全部测试）通过。
- 浏览器线上访问 `https://fsfrank9.github.io/sanguosha/` 完整对战 OK。

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
