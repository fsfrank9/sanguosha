# v10 方向: 稳定 + 扩展 — 收技术债 + 玩家响应框架 + 缺口补齐

**日期**: 2026-05-28
**起点**: v9 方向 D 完成 (PR #67-#95, 含 PLAN + E0-E27, 27 个实现 PR + 1 个 PLAN, 全部已合并)
**当前状态**: 852 测试 ✓, `build:check` 通过, 引擎默认行为零回归

## 缘起

v9-D 已完成整轮 UI 重制 + 技能/卡牌 UI 适配子阶段. 项目工程审计 (2026-05-28)
得出 3 个核心风险:

1. **`dom-adapter.js` 单文件 2409 行 + ~300 个顶层变量** — 27 个 PR-E 注释碎片散落,
   E18 删 splash / E20 删 header 等"删除型 PR"后遗留死变量/死 handler 未清.
   继续加功能成本逼近 O(n²); E27 才修一个**影响所有两步面板**的 backdrop bug
   (E23/E24/E26 三个 PR 期间一直 broken 没人察觉) — 证明代码块太散, review 看不全交互链.

2. **`game-engine.js` 4317 行 + 294 函数 + `pauseState` / `pendingChoice` 双轨制** —
   两个机制都表"游戏暂停待玩家决策" (前者存参数, 后者存类型), 但**没有统一入口**.
   E25 (闪响应) 是直接在 `continueShaAfterCixiong` 里插 pause 逻辑 — E28 (万箭/银月)、
   E29 (无懈) 会重复这个插入模式, 测试重复、维护成本累加.

3. **玩家响应路径缺口** (v9-D 文档明确标记):
   - 万箭齐发 / 银月枪 的【闪】响应 — 仍自动 (E25/E26 只覆盖了【杀】路径)
   - 无懈可击响应 — 仍自动
   - 决斗的【杀】响应 — 仍自动
   - 这些不是 bug 而是"未做的功能", 但要补齐就会撞上风险 #2.

继续盲目堆功能会爆炸. v10 的主线是**先收债 + 抽框架 + 用框架补齐缺口**.

## 总体策略

**从"迭代模式"切到"功能 + 清债"模式** — 每个 PR 同时做新功能 + 清理上一阶段
积累的对应碎片. 不再有纯"删除型 PR"留下变量孤儿.

### 阶段拆分

- **A. 清债 (V1-V2)**: 不动行为, 把 v9-D 累积的注释碎片、死变量、E18/E20 残留清掉
- **B. 响应框架 (V3)**: 引擎抽出统一 `requestPlayerResponse` API, 把 E25 闪响应迁移上做样本
- **C. 缺口补齐 (V4-V6)**: 用 V3 框架补齐万箭/银月、无懈、决斗 的玩家响应
- **D. 视觉收尾 (V7-V8)**: v9-D 遗留的 4 个旧 modal 升级卷轴风 + dispatch 注册表收尾

完成后, v10 主线收官, 为 v11+ (技能扩包 / AI 难度 / 多人模式) 提供干净接入点.

## 落地 PR 时间线

| PR | 范围 | 类型 | 复杂度 | 状态 |
|---|---|---|---|---|
| PLAN | 本文档 — v10 完整计划 | docs | — | 🟡 PR 待合并 |
| V1 | dom-adapter 责任块梳理 + 模块映射文档 | 纯文档 (不改代码) | S | 🔘 待开 |
| V2 | dom-adapter / game-engine 清债 — 死变量、E18/E20 残留、PR-E 注释合并 | 重构, 行为不变 | M | 🔘 待开 |
| V3 | 引擎响应框架原型 `requestPlayerResponse` + 把 E25 闪响应迁移上 | 引擎重构 + UI 适配 | L | 🔘 待开 |
| V4 | 万箭齐发 + 银月枪 玩家闪响应 (走 V3 框架) | 引擎 + UI | M | 🔘 待开 |
| V5 | 玩家手动【无懈可击】响应 | 引擎 + UI | L | 🔘 待开 |
| V6 | 决斗 玩家手动【杀】响应 | 引擎 + UI | M | 🔘 待开 |
| V7 | guanxing / zhiheng / huogong / tiesuo 4 个旧 modal 视觉升级卷轴风 | UI | M | 🔘 待开 |
| V8 | dispatch 注册表补全 + card-as 流程一致性收尾 | UI | S | 🔘 待开 |

总 **1 PLAN + 8 实现 = 9 个 PR**. 每个 PR 仍守"小而独立、配守护测试、引擎默认行为零回归"
的 v9-D 工程纪律.

## 各 PR 详细范围

### V1 — dom-adapter 责任块梳理 (纯文档)

**目标**: 不动代码, 先把 `dom-adapter.js` 内部组织搞清楚.

**输出**: 新增 `docs/dev/dom-adapter-map.md`, 内容包括:
- 顶层变量清单 + 每个变量的归属 modal/feature (e.g. `pendingTiesuoCardId` → tiesuo modal)
- 函数依赖图 (按 modal kind 聚合: tiesuo {show/hide/handlers/render}, target {...}, ...)
- **死变量清单** — 标出 E18/E20 等删除型 PR 后没清的变量
- **PR-E 注释碎片清单** — 标出可合并/可删的重复注释
- 子模块拆分建议 (但不立刻执行)

**验收**:
- 文档完整 (覆盖所有 modal kind)
- 死变量清单 ≥ 5 项 (基于审计的"~300 顶层变量"推测)
- 后续 V2 cleanup 的工作清单从此文档产生

### V2 — 清债 cleanup (重构, 行为不变)

**目标**: 基于 V1 清单, 删死代码 + 合并碎片注释 + 不改任何行为.

**改动**:
- 删 V1 标出的死变量 + 对应 handler / cache id
- 合并/精简 PR-E 注释碎片 (保留关键决策理由, 删冗余历史)
- 把同一 modal 的相关代码物理聚拢 (不拆文件, 只调顺序)
- 同步删 `index.html` 里 E18/E20 等删除的 placeholder 残留

**验收**:
- 全套 852 测试 ✓ 通过, build:check ✓
- `dom-adapter.js` 顶层变量数下降 ≥ 20% (从 ~300 → < 240)
- 文件总行数下降 ≥ 5%
- 引擎默认行为零回归 (所有现有引擎测试不动)

**风险**: 误删活代码 → 测试守护 + 小步多 commit

### V3 — 引擎响应框架原型

**目标**: 抽出统一的"玩家响应窗口"API, 把 E25 闪响应迁移上做样本验证.

**引擎改动**:
- 新增 `requestPlayerResponse(game, { kind, actor, source, options })` —
  统一暂停入口, 设 `pauseState[kind]` + `pendingChoice { kind, options }`,
  返回 `{ paused: true }`.
- 新增 `resolveResponseChoice(game, decision)` — 统一恢复入口, 据
  `pendingChoice.kind` 分发到各自的 continuation 函数.
- 把 E25 的 `continueShaAfterCixiong` 重构 — 不再直接写 `pauseState.shaResponse = ...`,
  改成 `requestPlayerResponse(game, { kind:'shan', source:{actor, card, amount}, options:[...] })`.
- `resolveShanResponseChoice` 重写成框架的 continuation.

**UI 改动**:
- `renderPendingChoice` 里 shan-response 处理逻辑归一到通用 response 渲染模板
- 候选两步化 / handConfirm 路径不变

**验收**:
- 全套测试 ✓, build:check ✓
- 闪响应实测仍正常 (PR-E25/E26 测试全过)
- 引擎里 E25 散插的 pauseState 代码量从 ~120 行 → 框架调用 ~30 行 (~75% reduction)
- 框架 API 有内联 JSDoc / 注释清晰, 供 V4-V6 借鉴

**风险**: 框架抽象错方向 → 先只迁移闪响应一条, 跑通再用于 V4-V6 (不一次性迁移所有 pause)

### V4 — 万箭齐发 + 银月枪 玩家闪响应

**目标**: 用 V3 框架补齐两个被 E25 漏掉的【闪】响应路径.

**引擎改动**:
- `playAOE` 在 responseType==='shan' + targetActor==='player' + 玩家 ask
  时调 `requestPlayerResponse`, 暂停; 恢复时按 `decision` 计算 化解 / damage(1)
- `triggerYinyueQiang` 同理

**UI 改动**:
- shan-response 面板复用 (V3 已抽框架, V4 几乎不动 UI)
- 提示文案据 `pending.kind` 区分 ("万箭齐发" / "银月枪" / "杀")

**测试**:
- 新增 `tests/wanjian_player_response.test.mjs` (4-5 条)
- 新增 `tests/yinyue_player_response.test.mjs` (3-4 条)

**验收**: 万箭/银月 对玩家时弹面板, 玩家自选 / 不出 流程正确

### V5 — 玩家手动【无懈可击】响应

**目标**: 玩家有【无懈可击】时, 任何对自己的锦囊都弹面板询问.

**复杂度**: L — 无懈是**链式响应** (无懈无懈、对方再无懈), 比单回合 闪 更复杂.

**引擎改动**:
- `consumeWuxie(game, actor, reason)` 重构, 走 `requestPlayerResponse`
- 设计无懈链的暂停/恢复模型: 玩家无懈后, 对方 AI 自动判断是否再无懈; 若 AI 无懈,
  玩家有无懈又是新一轮 pendingChoice
- pauseState.wuxieChain 存链的当前层

**UI 改动**:
- 新增 `wuxieResponsePanel` (pending-prompt-panel 风格, 候选列表 + 不无懈)
- renderPendingChoice 处理 `kind === 'wuxie-response'`
- 提示文案显示当前锦囊 + 链层数 (e.g. "对方对【过河拆桥】无懈可击, 是否再无懈?")

**测试**:
- `tests/wuxie_player_response.test.mjs` (6-8 条, 含链式)

**验收**: 无懈链流程正确, 玩家在每层都能决定

### V6 — 决斗 玩家手动【杀】响应

**目标**: 决斗时玩家可决定出不出【杀】.

**引擎改动**:
- `playDuel` 循环里, 当 current==='player' + ask + 有【杀】时调
  `requestPlayerResponse(game, { kind:'sha-duel', ... })`
- 玩家有龙胆 (闪→杀) 时, options 含转化候选

**UI 改动**:
- 新增 `duelResponsePanel` 或复用 shan-response 模板
- 候选列表: 真【杀】 + 龙胆转化

**测试**: `tests/duel_player_response.test.mjs`

**验收**: 决斗玩家自选用哪张【杀】对抗

### V7 — 4 个旧 modal 视觉升级 (UI)

**目标**: v9-D 子阶段遗留 — guanxing / zhiheng / huogong / tiesuo 升级 cream 卷轴风
(`pending-prompt-panel` 风格, 与 E21 conversion/target 一致).

**改动**:
- HTML: 4 个 modal 加 `pending-prompt-panel` class + 结构重组 (hint / actions / choices wrap)
- CSS: 旧 `.tiesuo-mode-panel` 等 4 个规则块从 dark 临时风升级为 cream
- guanxing 复杂内嵌结构 (3 zones + 多 row) — 仔细保留

**验收**: 4 个 modal 视觉与其他 pending modal 一致

### V8 — dispatch 注册表补全 + card-as 一致性

**目标**: v9-D Explore 调研发现的最后两个小尾巴.

**改动**:
- `PENDING_MODAL_DISPATCH` 注册表补齐 cixiongChoose / dyingRescue / fankui / fanjian / guohe 等遗漏项
- conversionModePanel 接入 dispatch (card-as 流程也走 hand-actions confirm/cancel)

**验收**: 所有 modal 都有 dispatch 入口, hand 区按钮 100% 覆盖

## 关键设计: 响应窗口框架 (V3)

### API

```js
// 引擎层
requestPlayerResponse(game, {
  kind,          // 'shan' | 'wuxie' | 'sha-duel' | ...
  actor,         // 'player'
  source,        // { actor, card, reason, ... } — 触发上下文
  options        // 候选列表 (如 listShanResponseOptions 输出)
}) // → { ok: true, message: '等待玩家响应...' } + 设 pauseState[kind] + pendingChoice

resolveResponseChoice(game, decision) // → 据 pendingChoice.kind 分发到 continuation
```

### 暂停模型

- `pauseState[kind]` 存恢复所需的全部参数 (actor, card, amount, etc.)
- `pendingChoice = { kind, actor, options, ... }` — UI 用 kind 决定渲染哪个 panel
- 双轨制保留 (vs 合一) — 因 pauseState 可能存大对象 (引擎内部), pendingChoice 只暴露 UI 必需的简化数据

### Continuation 模式

每个 response kind 注册一个 continuation:
```js
RESPONSE_RESOLVERS = {
  'shan': resolveShanResponse,
  'wuxie': resolveWuxieResponse,
  'sha-duel': resolveDuelResponse,
  ...
};
```

`resolveResponseChoice` 据 kind 查表 → 调对应 resolver → resolver 完成响应 + 恢复游戏流程.

## 整体验收标准

- 每个 PR: 全套测试 ≥ 起点通过、`build:check` 通过、引擎默认行为 (无 `skillPreferences.xxxResponse='ask'`) 零回归
- V2 完成后: dom-adapter 顶层变量数下降 ≥ 20%
- V3 完成后: E25 闪响应的引擎实现 LOC ↓ ≥ 50% (走框架后)
- V5 完成后: 玩家有【无懈】时, 任何对自己的锦囊都弹面板
- V8 完成后: 主线收官, 进入 v11+ 候选评估

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| V2 清债误删活代码 | 全套测试守护 + V1 映射文档先行 |
| V3 框架抽象错方向 | 先只迁移 E25 闪响应一条; 跑通再用于 V4-V6 |
| V5 无懈链复杂度爆炸 | 先单层 (一次无懈), 链式可拆 V5a/V5b |
| 引擎改动量大 (V3-V6) | 默认 pref 关闭新行为, engine 测试不破; UI 在 newGame 开启 pref |
| PR 串行依赖 | V1/V2 并行可能; V4-V6 必须 V3 后串行 |
| 工作量评估失准 (L 级 PR) | 每个 L 级 PR 允许拆成 2 个 sub-PR, 不强求一次开 |

## 不在范围

- 新技能 / 扩包 (留 v11+)
- AI 难度 / 策略调整
- ESLint / Prettier 引入 (代码风格已一致, 工具链反而成运维债)
- 多人模式
- 移动端适配 / 触屏优化
- 引擎重写 / 大规模架构调整

## 流程

- 每个 PR 我开 → 用户 merge → 我用 `mcp__github__pull_request_read` 确认 merge →
  拉新 branch 推下一个 (沿用 v9-D 工作流)
- 验收不通过 → fixup PR (承接 E27 修 bug 的模式)
- 每个 PR 严格遵守 v9-D 已建立的 process:
  1. 从最新 main 拉 branch
  2. 实现 + 测试 + build:check
  3. 文档同步 (本文档 PR 时间线表 + 子阶段段落)
  4. 守护测试新增 (UI / engine)
  5. 同步更新旧测试 (若行为变化)

## 已知后续 (v11+ 候选)

- **技能扩包**: 17 个 catalog 中已知未实现的技能
- **装备副作用体系**: 装备触发效果统一化 (与响应框架协同)
- **AI 难度分级**: easy/normal/hard, AI 策略可调
- **多人模式**: 3-8 人, 主忠反内
- **移动端 / 触屏适配**: 当前布局桌面优先, 触屏点击可用但 UX 未优化
- **战报回放 / 撤销**: 利用引擎 state 不可变性
- **国际化**: 英文版

---

**v10 PR 第 1 个 (本文档) 就绪. 后续 V1 dom-adapter 责任块梳理 — 纯文档 PR, 风险最低,
可在 PLAN merge 后立即开始.**
