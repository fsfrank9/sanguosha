# 三国杀 v9 方向 D — UI 布局重制 (2026-05-14 起)

## 缘起

v8 主体完工后, 用户反馈"目前的整个 UI 我觉得不太行" + 给出了一组参考截图。差距点:

- 当前: 朴素 div + 渐变背景, 文字卡 (`【杀】♠5` 形式), emoji 武将
- 目标 (截图所示): 装饰外框 + 卷轴 modal + portrait frame + 大字日志, 卡牌有真实卡身设计 (corner 花色+点数 / 名字 / 类型 label), 武将 portrait + HP 红方块, 完整的 splash / lobby / 选将 / in-game 多层界面

用户决定 v9 起点 = **方向 D (UI / 美术升级)**。约束:

- 暂不引入武将 / 卡牌真实插画 (留 v9 后续或用户提供素材)
- 不引入 PNG, 用纯 CSS / Unicode / inline SVG
- 引擎接口零改动 — 全部 UI 层
- 多人 / 网络对战 (v9 方向 B) 不在本计划内

## 候选方向 (用户已选)

- ~~**A**. AI 深度搜索~~ (推迟)
- ~~**B**. 多人模式 / 网络对战~~ (推迟)
- ~~**C**. 更多扩展包技能~~ (推迟)
- ✅ **D. UI / 美术升级** ← v9 起点
- ~~**E**. 对局回放 / 训练模式~~ (推迟)

## 落地 PR 时间线

| PR | 范围 | 状态 |
|---|---|---|
| PLAN | 本文档 — v9 方向 D 完整计划 | 🟢 PR #67 已合并 |
| PR-E0 | CSS 拆分基础 (`main.css` 953 行 → 8 个职责文件 + 1 entry) | 🟢 PR #68 已合并 |
| PR-E1 | 整体布局重构 + 装饰外框 (橙红 striped border + 角落 widgets) | 🟢 PR #69 已合并 |
| PR-E2 | 中央日志 overlay + 状态条 + 暂停 brush 横幅 | 🟢 PR #70 已合并 |
| PR-E3 | 卡牌外观重设计 (corner 花色+点数 + 卡身色块 + 底部 label) | 🟢 PR #71 已合并 |
| PR-E4 | 武将 portrait + HP 红方块 + 装备/判定区 + 技能 framed tag | 🟢 PR #72 已合并 |
| PR-E5 | 左上"菜单"按钮 + 侧抽屉 + 退出确认 modal (卷轴风) | 🟢 PR #73 已合并 |
| PR-E6 | pendingChoice modals 统一卷轴风 (13 个面板) | 🟢 PR #74 已合并 |
| PR-E7 | action button 统一橙金装饰风 + 收尾细节 | 🟢 PR #75 已合并 |
| PR-E8 | **二级 splash + 一级 lobby** (3 模式卡, 仅 1V1 启用) | 🟢 PR #76 已合并 |
| PR-E9 | **选将界面重设计** (4×3 网格 + 势力 tag + 随机/点将 切换) | 🟢 PR #77 已合并 |
| PR-E10 | UI 审计 + 清理 (header 入口屏隐藏, 死代码 .layout/.side/.battlefield, 空 `<select>` options) + 20 条集成守护测试 | 🟢 PR #78 已合并 |
| PR-E11 | 选将流程 bug 修复 (用户反馈: 选完不自动进游戏 + 应顺序选将主公先选不可返回) | 🟢 PR #79 已合并 |
| PR-E12 | 进入游戏后界面清理 (隐藏与 v9 新元素重复 / 噪音的旧装饰: 双显日志, ::after 水印, ::before 大字, camp-ribbon, 武将台词) | 🟢 PR #80 已合并 |
| PR-E13 | 进入游戏后界面清理 v2 (隐藏 .title-card / .status-banner / .log-overlay / v9.0.0 重影 + 新增中下 phase-prompt 横幅 + zone-panel 半透明) | 🟢 PR #81 已合并 |
| PR-E14 | arena 清理 + 反贼徽章对称 + 手牌截断修复 + top-actions 浮顶 + 恢复滚动日志 | 🟢 PR #82 已合并 |
| PR-E15 | polish (top-actions 移角色卡上方 + stat-grid 隐藏 + deck info 移技能 panel + 删 time + 角落按钮往外) | 🟢 PR #83 已合并 |
| PR-E16 | hand-actions (真删 top-actions + 删 pause-banner + 加确认/取消/弃牌 3 按钮 + select-then-confirm + pending modal 统一 dispatch) | 🟢 PR #84 已合并 |
| PR-E17 | 真删 .phase-prompt 横幅 + .hand-dock overflow 修复 (containment) | 🟢 PR #85 已合并 |
| PR-E18 | 删除二级 splash 屏 (纯文字介绍无功能) — 启动直接进 lobby | 🟢 PR #86 已合并 |
| PR-E19 | 角落菜单 game-only + 退出回大厅 / 重开回选将 逻辑修正 | 🟢 PR #87 已合并 |
| PR-E20 | 删除顶部 header + title-card 标题栏 (各屏均不需要) | 🟢 PR #88 已合并 |
| PR-E21 | 技能/卡牌 modal 适配: modal 块移出 .hand-dock 修复 fixed 定位 + conversion/target 升级卷轴风 | 🟢 PR #89 已合并 |
| PR-E22 | 电脑回合节奏放慢 (enemyActionDelay 650→1300 + 拆 enemyPhaseDelay) | 🟢 PR #90 已合并 |
| PR-E23 | 二级面板两步化 (target/huogong 选中→确认) + 修 modal 误点手牌 bug | 🟢 PR #91 已合并 |
| PR-E24 | 两步化 batch 2 — 响应/技能面板 8 个候选点击改 select-then-confirm | 🟢 PR #92 已合并 |
| PR-E25 | 玩家手动【闪】响应 — 被【杀】时由玩家决定出不出闪 (首次动引擎) | 🟢 PR #93 已合并 |
| PR-E26 | 闪响应支持选用哪张牌当闪 (真闪 + 龙胆/倾国 转化候选) | 🟡 PR 待合并 |

总预估: **~2700-4200 LOC 变更**, 跨 26 个 review cycle。

### 子阶段: 技能/卡牌 UI 适配 (PR-E21+)

UI 重制 (E0-E20) 引擎零改动, 技能/卡牌**逻辑**未动. 收尾阶段把交互层适配到新 UI:
- E21: modal 块移出 .hand-dock (修复 backdrop-filter + overflow 导致的 fixed 定位 bug) + conversion/target 升级 ✅
- E22: 电脑回合节奏放慢 (用户反馈打断了 modal 子阶段, 优先做) ✅
- E23: 二级面板两步化 batch 1 — target/huogong 选中→确认 + 修 modal 误点 bug ✅
  (用户要求"全部统一两步": 所有面板候选点击改 select-then-confirm)
- E24: 两步化 batch 2 — 响应/技能面板 8 个 (guicai/fankui/fanjian/qilin/cixiongChoose/guohe/wugu/dyingRescue) ✅
- E25: 玩家手动【闪】响应 — **首次动引擎** (加 shan-response 暂停机制) ✅
- E26: 闪响应支持选用哪张牌当闪 (真闪 + 龙胆/倾国 转化候选, 玩家自选) ✅
- E27 (计划): 万箭齐发 / 银月枪 的玩家闪响应 (PR-E25/26 只覆盖了【杀】路径)
- E28 (计划): 玩家手动【无懈可击】响应
- E29 (计划): guanxing / zhiheng / huogong / tiesuo modal 视觉升级卷轴风

## 设计目标 (从参考截图提炼)

| 元素 | 目标 |
|---|---|
| 整体外框 | 橙红 striped decorative border 包整个 battlefield |
| 左上角 | "菜单" 书本 icon (点击展开侧抽屉) |
| 右上角 | "分享" 翅膀 icon (placeholder) |
| 顶部 | 对手 武将 portrait card (160×220) + HP 红方块 + 技能 tag |
| 中央 | 行动日志 overlay (大字白色, 最近 4-6 条, 半透明) |
| 右侧 actions | 弃牌 / 确定 / 取消 装饰橙色按钮 (棕色框) |
| 右下 | 玩家 武将 portrait + HP + 技能 + 主公徽章 |
| 底部 | 手牌横排 (5-6 张并排, corner 花色+点数, 黄卡身, 底部类型 label) |
| 暂停 | "游戏暂停中" 黑色 brush 横幅 |
| 底部状态条 | 版本 + 蚂蚁蛋占位 + 时间 |
| Modal | 卷轴风 (两端卷起), 金边按钮 |
| 侧抽屉 | 棕色木纹背景, 退出/重开/帮助/背景/变速 等图标列表 |

## 各 PR 详细范围

### PR-E26 落地 — 闪响应支持选用哪张牌当闪 ✅

**起因**: 用户反馈 PR-E25 后「测了一下可以触发, 但有时会有别的逻辑问题, 比如有些
技能可以用别的牌当【闪】的情况」. Explore agent 调研确认: PR-E25 的面板只有
「出闪/不出」, 玩家有龙胆 (杀→闪) / 倾国 (黑牌→闪) 转化技能时, 引擎自动
`firstMatchingCard` 选第一张, 玩家不能选用哪张牌.

**引擎改动 (`game-engine.js`)**:
- 新增 `shanOptionForCard(state, cardId)` — 判定一张手牌能否当【闪】(真闪 / 龙胆杀 / 倾国黑牌).
- 新增 `listShanResponseOptions(state)` — 枚举所有可作【闪】的手牌 (返回 `{cardId, via, name, suit, rank}`).
- `findResponseCard(state, type, preferredCardId)` — 加可选 `preferredCardId`: 玩家
  指定用哪张牌当【闪】时直接消耗那张. `consumeResponse` 透传该参数.
- `hasShanResponseAvailable` 改用 `listShanResponseOptions`.
- `shan-response` pendingChoice 带 `options: listShanResponseOptions(target)`.
- `resolveShanResponseChoice` 支持 `decision.cardId` (指定牌) / `decision.use` (自动取首张, 兼容) / 否则不出.

**UI 改动 (`index.html` / `dom-adapter.js`)**:
- 闪响应面板从「出闪/不出」2 按钮 → 候选列表 (`shanResponseChoices` 动态填充
  pending.options) + 「不出【闪】」按钮.
- 候选两步化 (与 PR-E24 一致): 点候选 stage 高亮, `#handConfirmBtn` 确认 →
  `resolvePendingChoice({cardId})`; 「不出」→ `{use:false}`.
- `renderPendingChoice` 渲染候选 (含 龙胆·/倾国· via 前缀).

**新增测试**: `tests/shan_response_conversion.test.mjs` (5 引擎) + `tests/v9_pr_e26_shan_conversion_ui.test.mjs` (6 UI).
**同步更新**: `skill_runtime_hooks` (函数签名 indexOf), `v9_pr_e25_shan_response_ui` (面板结构).

**Test status**: 838 → 849 ✓; `build:check` 通过.

**已知后续缺口** (Explore 调研发现, 留作 E27): 万箭齐发 / 银月枪 也是【闪】响应路径,
PR-E25/E26 只覆盖了【杀】的 `continueShaAfterCixiong`, 这两条仍自动响应.

**Process 遵守**:
- PR-E25 (#93) merge 状态已通过 `mcp__github__pull_request_read` 确认
  (`merged_at: 2026-05-16T11:03:53Z`) 后才从最新 main 拉新 branch `claude/v9-pr-e26-shan-conversion`.

---

### PR-E25 落地 — 玩家手动【闪】响应 (首次动引擎) ✅

**起因**: 用户反馈「我方应对响应时没经过确认/取消, 被 AI 自动接管, 这判断应交给我」.
调研 (Explore agent) 确认: 引擎 `consumeResponse()` 自动查找+消耗玩家的【闪】,
**完全没有暂停、不问玩家**; 引擎甚至明确禁止手动打出【闪】/【无懈】. 唯一有"问玩家"
的是濒死救援. 用户经 AskUserQuestion 选「先做【闪】响应」.

**这是 v9 UI 重制 (E0-E24) 以来首次改 `src/engine/`** — 加"响应窗口暂停"机制.

**引擎改动 (`game-engine.js`)**:
- `continueShaAfterCixiong` 拆分: 仁王盾 + onNeedResponse hook 后, 若
  `targetActor === 'player'` + `skillPreferences.shanResponse === 'ask'` +
  `hasShanResponseAvailable` → 设 `pauseState.shaResponse` + `pendingChoice
  { kind:'shan-response' }`, 返回 (暂停). 否则走原同步路径.
- 新增 `resolveShaAfterResponse` (从原函数拆出的"响应后结算" — 贯石/青龙/伤害).
- 新增 `resolveShanResponseChoice` — `decision.use` 决定出不出闪 (不出时 八卦 兜底).
- 新增 `hasShanResponseAvailable` — 非消耗式探测玩家有无【闪】/转化.
- `resolvePendingChoice` 注册 `shan-response` kind.
- **引擎默认 (无 shanResponse pref) 仍自动响应** → 现有 820 测试同步行为不变.

**UI 改动 (`index.html` / `dom-adapter.js`)**:
- 新增 `shanResponsePanel` (pending-prompt-panel) — 出【闪】/ 不出 两按钮.
- `PENDING_MODAL_DISPATCH` 注册; `renderPendingChoice` 处理 `shan-response`.
- 按钮 → `resolvePendingChoice({use:true/false})`.
- `enemyStep` 加 pendingChoice 轮询 guard — AI 回合出现玩家待决策时暂停轮询,
  玩家 resolve 后下一轮自动继续.
- `newGame` 开启 `game.player.skillPreferences.shanResponse = 'ask'`.

**新增测试**: `tests/shan_response.test.mjs` (6 条引擎) + `tests/v9_pr_e25_shan_response_ui.test.mjs` (12 条 UI).

**Test status**: 820 → 838 ✓; `build:check` 通过. 引擎同步路径零回归.

**Process 遵守**:
- PR-E24 (#92) merge 状态已通过 `mcp__github__pull_request_read` 确认
  (`merged_at: 2026-05-16T08:36:37Z`) 后才从最新 main 拉新 branch `claude/v9-pr-e25-shan-response`.

---

### PR-E24 落地 — 两步化 batch 2 (响应/技能面板) ✅

**起因**: 用户「全部统一两步」需求的 batch 2. batch 1 (E23) 已做 target/huogong.
本 PR 处理 8 个响应/技能面板的候选点击 (原本一点即 `Engine.resolvePendingChoice`).

**改动 (引擎零改动)**:
- 8 个面板候选点击改 stage: guicai / fankui / fanjian (4 花色按钮) / qilin /
  cixiongChoose / guohe / wugu / dyingRescue — 点候选只设
  `stagedModalChoice = { kind:'pending', payload, selector }`, 不 resolve;
  `#handConfirmBtn` (`_handConfirm` 'pending' 分支) 才 `Engine.resolvePendingChoice(payload)`.
- `_highlightStaged` 重构为单参数 (全局清 `.is-staged` + 高亮 chosen).
- `_reapplyStagedHighlight` — `renderPendingChoice` 每次重建候选 DOM, render 末尾据
  `stagedModalChoice.selector` 重新套 `.is-staged` 高亮.
- render 清掉 stale staged (pendingChoice 已消失时).
- `_anyModalVisible()` — 完整面板可见检测 (pending-prompt-panel + 旧 mode-panel +
  scroll-modal), playerHand 误点防护从 `_firstVisibleDispatch` 改用它 (覆盖
  PENDING_MODAL_DISPATCH 未注册的 fankui/fanjian/guohe 等).
- 注: ganglieSource / yiji 已是多选+确认按钮模式 (本就两步), 不动; 二元决策按钮
  (luoshen 判定/结束 / cixiongFire 发动/不发动 / 各 decline 按钮) 是明确动作按钮, 保留.

**新增测试** `tests/v9_pr_e24_response_two_step.test.mjs` (12 条守护).
**同步更新旧测试**: `pending_prompt_panels_a2/a3/a4/a5` — 候选 click 断言从
`resolvePendingChoice` 改为 `stagedModalChoice` stage; `v9_pr_e23` 的 `_anyModalVisible` 断言.

**Test status**: 808 → 820 ✓; `build:check` 通过.

**Process 遵守**:
- PR-E23 (#91) merge 状态已通过 `mcp__github__pull_request_read` 确认
  (`merged_at: 2026-05-16T06:38:23Z`) 后才从最新 main 拉新 branch `claude/v9-pr-e24-response-two-step`.

---

### PR-E23 落地 — 二级面板两步化 + 修 modal 误点 bug ✅

**起因**: 用户反馈「很多牌使用时不走确认/取消按钮, 直接打出」. 审计 (Explore agent
全路径追踪) 结论:
- 主动出牌阶段单纯牌 (杀/桃/酒/锦囊等) 已走 select-then-confirm ✓
- 但二级面板 (目标选择 / 火攻弃牌 等) 点候选**直接 resolve**, 不走 confirm
- bug: 二级面板开着时误点手牌 → 那张手牌直接打出

用户经 AskUserQuestion 选择「全部统一两步」: 所有面板候选点击都改 select-then-confirm.
工程量大 (~14 modal), 分批做. **本 PR 是 batch 1** — 主动出牌的 target / huogong.

**改动 (引擎零改动)**:
1. **修 modal 误点 bug** — `playerHand` click handler 开头加 `if (_firstVisibleDispatch()) return;`,
   任何 modal 打开时忽略手牌点击.
2. **target / huogong 候选两步化** — 新增 `stagedModalChoice` 状态; 点候选只 stage
   (金色 `.is-staged` 描边高亮) + render, 不 resolve; `#handConfirmBtn` (`_handConfirm`)
   才提交 resolve; `#handCancelBtn` (`_handCancel`) 撤销 stage (面板保持打开).
3. `renderStatus`: `stagedModalChoice` 存在时启用 confirm/cancel 按钮.
4. `_highlightStaged` 工具函数切 `.is-staged`; modals.css 加 `.is-staged` 金色描边
   (cream / dark 面板底色上都清晰).
5. `hideTargetZonePanel` / `hideHuogongPanel` / `showTargetCardChoices` 清 stage.

**新增测试** `tests/v9_pr_e23_modal_two_step.test.mjs` (9 条守护).

**Test status**: 799 → 808 ✓; `build:check` 通过.

**Process 遵守**:
- PR-E22 (#90) merge 状态已通过 `mcp__github__pull_request_read` 确认
  (`merged_at: 2026-05-16T06:16:49Z`) 后才从最新 main 拉新 branch `claude/v9-pr-e23-modal-two-step`.

---

### PR-E22 落地 — 电脑回合节奏放慢 ✅

**起因**: 用户反馈「自动出牌阶段过得太快, 来不及反应, 很多动作就完成了, 没有体验感」.

电脑回合由 `enemyStep` 递归驱动, 每步 `setTimeout(enemyStep, enemyActionDelay)`,
原 `enemyActionDelay = 650ms` 统一用于所有步骤 (阶段切换 + 出牌动作).

**改动 (引擎零改动, 纯 dom-adapter 节奏)**:
- `enemyActionDelay` 650 → **1300ms** — 出牌阶段实质动作 (出杀/锦囊等) 之间的延时, 让玩家看清
- 新增 `enemyPhaseDelay = 700ms` — 准备/判定/摸牌/弃牌/结束 等阶段切换延时 (无实质动作, 不必太慢)
- `enemyStep`: play 阶段动作分支用 `enemyActionDelay`; finishPlayPhase / discard / 默认 advancePhase 分支用 `enemyPhaseDelay`; `maybeStartEnemyTurn` 起步用 `enemyPhaseDelay`

**新增测试** `tests/v9_pr_e22_ai_pacing.test.mjs` (4 条守护).

**Test status**: 795 → 799 ✓; `build:check` 通过.

**Process 遵守**:
- PR-E21 (#89) merge 状态已通过 `mcp__github__pull_request_read` 确认
  (`merged_at: 2026-05-16T06:05:10Z`) 后才从最新 main 拉新 branch `claude/v9-pr-e22-ai-pacing`.

---

### PR-E21 落地 — 技能/卡牌 modal 适配 (定位修复 + conversion/target 升级) ✅

**起因**: 用户「把武将技能 + 卡牌逻辑适配到新 UI」需求. 调研发现一个结构性 bug:

14 个 pendingChoice / 技能 modal 原都嵌在 `.hand-dock` 内. `.hand-dock` 有
`backdrop-filter: blur(12px)` (CSS 规范: filter/backdrop-filter 会为 `position:fixed`
后代建立 containing block) + `overflow: hidden` (PR-E17). 结果: 8 个
`.pending-prompt-panel` (position:fixed) modal 被错误锚到 `.hand-dock` 而非视口,
并被 hand-dock 的 overflow 裁剪. 6 个旧 modal (position:static) 则在 hand-dock 内
inline-flow, 也偏离屏幕中心.

**改动 (引擎零改动)**:

1. **modal 块移出 `.hand-dock`** — index.html 把 14 个 modal `<div>` 块从
   `.hand-dock` 内移到 `.duel-table` 直属 (hand-dock 之后, duel-table 之内).
   `.duel-table` 无 transform/filter/backdrop-filter → `position:fixed` 正确锚到视口,
   不被裁剪. (`.hand` 手牌容器仍留在 `.hand-dock` 内.)
2. **conversion / target modal 升级卷轴风** — 加 `pending-prompt-panel` class +
   `__hint` / `__actions` / `__choices` 结构包装, 与 8 个新风格 modal 视觉统一.
3. **CSS modals.css** — conversion / target 从旧扁平 `*-mode-panel` 组移出;
   旧组只剩 tiesuo/huogong/guanxing/zhiheng, 改 `position: fixed` 居中
   (深色临时风格, 后续 E22/E23 升级为 cream pending-prompt-panel).

**新增测试** `tests/v9_pr_e21_modal_relocate.test.mjs` (6 条守护).

**Test status**: 789 → 795 ✓; `build:check` 通过.

**Process 遵守**:
- PR-E20 (#88) merge 状态已通过 `mcp__github__pull_request_read` 确认
  (`merged_at: 2026-05-15T09:54:55Z`) 后才从最新 main 拉新 branch
  `claude/v9-pr-e21-modal-conversion-target`.

---

### PR-E20 落地 — 删除顶部 header + title-card 标题栏 ✅

**用户反馈** (PR-E19 合并后):
> 选将界面的最上面那个标题栏删了吧

`<header>` 内只剩 `.title-card` (h1 "三国杀·1v1 模块化版 v6.1 规则合规版" + `.subtitle` 长描述; `.top-actions` 已在 PR-E16 删). title-card 在 game 屏 (PR-E13) 已隐藏, lobby 屏 `_toggleHeader(false)` 整个 header 隐, 现 setup 也要删 → 各屏均不需要, 整个 `<header>` + `.title-card` 删除.

**改动 (引擎零改动)**:

- **HTML** `index.html`: `<header>` + `<section class="title-card">` (h1 + `.version-pill` + `.subtitle`) 整块删除
- **CSS**:
  - `setup.css`: `.title-card` / `.title-card::after` / `h1` / `.subtitle` 规则删除
  - `layout.css`: `header` 规则删除; 共享 panel-base 选择器列表移出 `.title-card`; `@media (max-width:980px)` 块删除 (内含 `header` + `.top-actions`, 两 DOM 都已删); `@media 560px` 内 `.title-card` 移出
  - `hero.css`: `.version-pill` 规则删除 (仅 title-card h1 用)
- **JS** `dom-adapter.js`:
  - `_toggleHeader(show, mode)` 函数删除 (无 header/titleCard 可切)
  - `'titleCard'` 移出 id 缓存
  - `showLobby` / `showSetup` / `newGame` 内 3 处 `_toggleHeader(...)` 调用删除

**新增测试** `tests/v9_pr_e20_drop_header.test.mjs` (9 条守护):
- 1 HTML header/title-card/h1/version-pill/subtitle 真删
- 3 JS _toggleHeader / titleCard / querySelector 真删
- 3 CSS (setup / layout / hero) 规则真删
- 2 loadAllStyles 回归 + .game-frame 保留

**同步更新旧测试**:
- `v9_pr_e1_layout_frame`: game-frame 包裹断言改为 lobby-screen (原 header)
- `v9_pr_e10_audit`: `_toggleHeader` 3 条 header 显隐守护撤
- `v9_pr_e12_ingame_cleanup`: `.title-card::after` 2 条守护撤
- `v9_pr_e13_ingame_cleanup_v2`: title-card id / `_toggleHeader` 3 条守护撤
- `v9_pr_e14_arena_cleanup`: `<header>` block 断言改为纯 top-actions 真删

**Test status**: 788 → 789 ✓; `build:check` 通过.

**Process 遵守**:
- PR-E19 (#87) merge 状态已通过 `mcp__github__pull_request_read` 确认 (`merged: true, merged_at: 2026-05-15T09:39:12Z`) 后才从最新 main 拉新 branch `claude/v9-pr-e20-drop-header`. 不在已 merge PR 上加 commit.

---

### PR-E19 落地 — 角落菜单 game-only + 退出/重开 逻辑修正 ✅

**用户反馈** (PR-E18 合并后):
> 左上角那个菜单里面有退出和重开, 那个菜单应该是要进入到游戏里面才对外显示的,
> 而不是在每一级页面都显示. 而且逻辑不一样, 重开是回到选将页面,
> 退出应该是回到现在的一级页面 (大厅) 才对

**问题**:
1. `.frame-corner-btn` (左上菜单 + 右上分享) absolute 浮在 .app 上, lobby/setup/game 每一级都显示. 菜单含退出/重开, 在入口屏无意义
2. 退出 (`exitConfirmYesBtn`) 当前 `showSetup()` — 回选将屏. 应回大厅 (lobby)
3. 重开 (`drawerRestartBtn`) 当前 `showSetup()` — 回选将屏. ✅ 已正确, 保持

**改动 (引擎零改动)**:

- **HTML** `index.html`:
  - `#frameMenuBtn` + `#frameShareBtn` 加 `hidden` 属性 (启动 lobby, 默认隐藏)
  - 退出确认 modal 文案 "退出将返回选将界面" → "退出将返回大厅"
- **CSS** `layout.css`: 加 `.frame-corner-btn[hidden] { display: none !important }` (因 `.frame-corner-btn { display: inline-flex }` 会覆盖 `[hidden]` 默认的 `display:none`)
- **JS** `dom-adapter.js`:
  - 新增 `_toggleCornerButtons(show)` — 切 frameMenuBtn + frameShareBtn 的 hidden
  - `showLobby()` / `showSetup()` → `_toggleCornerButtons(false)`; `newGame()` → `_toggleCornerButtons(true)`
  - `exitConfirmYesBtn` click handler: `showSetup()` → `showLobby()` (退出回大厅)
  - `drawerRestartBtn` 保持 `showSetup()` (重开回选将, 已正确)

注: 分享按钮与菜单一起 game-only (一对 frame 装饰 widget, 行为一致; 入口屏单留分享突兀).

**新增测试** `tests/v9_pr_e19_menu_scope.test.mjs` (8 条守护):
- 2 corner 按钮 hidden + CSS [hidden] 规则
- 2 _toggleCornerButtons 函数 + 调用站点
- 3 重开/退出 流向 + modal 文案
- 1 loadAllStyles() 回归

**同步更新旧测试**:
- `v9_pr_e10_audit`: 退出 modal → showLobby (原 showSetup)
- `v9_pr_e5_drawer_modal`: exitConfirmYesBtn → showLobby (原 showSetup)

**Test status**: 780 → 788 ✓; `build:check` 通过.

**Process 遵守**:
- PR-E18 (#86) merge 状态已通过 `mcp__github__pull_request_read` 确认 (`merged: true, merged_at: 2026-05-15T09:16:30Z`) 后才从最新 main 拉新 branch `claude/v9-pr-e19-menu-scope`. 不在已 merge PR 上加 commit.

---

### PR-E18 落地 — 删除二级 splash 屏 ✅

**用户反馈** (PR-E17 合并后, 探讨性问题):
> 目前这个游戏是不是有好多级界面, 最开始显示的这一级 (splash) 是不是完全没必要存在的

界面层级原为 4 级: **splash (纯文字介绍) → lobby (3 模式卡) → setup (选将) → game**.
splash 屏只展示文字 + "请点击屏幕开始游戏" 按钮, 无任何功能, 纯粹多一次点击.

用户经 AskUserQuestion 选择 **"只删 splash"** (lobby 保留, 以后 KOF/地狱 模式做出来还能用).

**改动 (引擎零改动)**:

- HTML `index.html`: `<section class="splash-screen" id="splashScreen">` 整块删除 (含 `__bg` / `__messages` / `__enter` / `#splashEnterBtn`)
- CSS `entry.css`: `.splash-screen` + `__bg` (+ `::before`/`::after`) + `__messages` (+ `p`) + `__enter` (+ `:hover`) + `[hidden]` 全部规则删除; 文件头注释更新
- JS `dom-adapter.js`:
  - `'splashScreen'` / `'splashEnterBtn'` 移出 id 缓存
  - `showSplash()` 函数删除
  - `showSetup()` 内 `els.splashScreen.hidden` 引用删除
  - `splashEnterBtn` / `splashScreen` click 监听删除
  - 启动入口 `showSplash()` → `showLobby()`

**新增测试** `tests/v9_pr_e18_drop_splash.test.mjs` (10 条守护):
- 1 splash HTML 真删
- 2 splash CSS 真删 + lobby 保留
- 5 splash JS (缓存 / showSplash / 监听 / 启动入口 / showSetup) 真删
- 1 showLobby 正常
- 1 loadAllStyles() 回归

**同步更新旧测试** (splash 删除):
- `v9_pr_e8_splash_lobby`: 整文件重写 — 移除全部 splash 守护, 保留 lobby 守护 + 加 splash 真删反向断言
- `v9_pr_e10_audit`: showSplash / splash 互斥 / 入口流程 / 4 主屏 等 5 条断言改为 lobby-only

**Test status**: 774 → 780 ✓; `build:check` 通过.

**Process 遵守**:
- PR-E17 (#85) merge 状态已通过 `mcp__github__pull_request_read` 确认 (`merged: true, merged_at: 2026-05-15T02:10:26Z`) 后才从最新 main 拉新 branch `claude/v9-pr-e18-drop-splash`. 不在已 merge PR 上加 commit.

---

### PR-E17 落地 — 真删 phase-prompt + hand-dock overflow 修复 ✅

**用户反馈截图** (PR-E16 合并后浏览器实测, 2 条):
> 这是怎么回事, 怎么牌一多就变成这个样子了
> 还有那个你的回合能不能去掉, 那个位置太碍眼了

**2 处改动**:

1. **真删 `.phase-prompt`** — index.html `<div class="phase-prompt" id="phasePrompt">` 块删除. dom-adapter `'phasePrompt'`/`'phasePromptBrush'` 移出缓存, renderStatus 内的 phase 写入逻辑删除. layout.css `.phase-prompt` + `.phase-prompt__brush` 规则块删除. 当前回合方信息已由 `.hero-head` 内 `.turn-badge` "当前回合" 文字展示 (PR-E14)
2. **.hand-dock overflow visible → hidden** — PR-E14 改为 visible 给卡牌底部 label 留位, 但导致 `.hand-actions` 行内容溢出影响其他区域. .duel-table 最后行 `minmax(180px, 1.2fr)` (PR-E14) 已给卡牌足够高度, overflow 改回 hidden 维持 containment. 加 `min-width: 0` 让 grid item 可缩小, `.hand` 子元素自有 `overflow-x: auto`, 多卡时横向滚动

**新增测试** `tests/v9_pr_e17_hand_overflow.test.mjs` (6 条守护):
- 1 phase-prompt HTML 真删
- 2 phase-prompt JS (缓存 + renderStatus) 真删
- 1 phase-prompt CSS 真删
- 1 hand-dock overflow hidden + min-width 0
- 1 loadAllStyles() 回归

**同步更新旧测试** (PR-E17 真删):
- `v9_pr_e13_ingame_cleanup_v2`: 5 条 phase-prompt 断言 (HTML / dom-adapter / CSS / loadAllStyles 全弱化或撤)
- `v9_pr_e2_center_log`: 1 条 brush 风格断言撤 (.phase-prompt__brush 也删了)
- `v9_pr_e14_arena_cleanup`: 1 条 .hand-dock overflow 断言 (visible → hidden)

**Test status**: 772 → 774 ✓; `build:check` 通过.

**Process 遵守**:
- PR-E16 (#84) merge 状态已通过 `mcp__github__pull_request_read` 确认 (`merged: true, merged_at: 2026-05-15T01:51:47Z`) 后才从最新 main 拉新 branch `claude/v9-pr-e17-hand-overflow`. 不在已 merge PR 上加 commit.

---

### PR-E16 落地 — hand-actions 重构 ✅

**用户反馈截图** (PR-E15 合并后浏览器实测, 4 条; 语气强烈"越改越乱""真的过分"):
> 1. 重新选将和结束回合这两个按钮干脆删除得了, 我说的是真正那种删除, 不是隐藏
> 2. 我的手牌区那个点击卡牌使用换成三个按钮: 确认, 取消, 弃牌; 点了牌之后要点确认才会使用; 弃牌就是结束回合进入起牌阶段
> 3. 在别人回合或者判定回合为什么我这里要显示游戏已暂停, 这个逻辑不对
> 4. 所有要确认的技能的确认和取消用第 2 步里加的确认和取消按钮

**4 处改动 (引擎零改动)**:

1. **真删 .top-actions** — `index.html` 整个 `<nav class="top-actions">` 块删除 (含 `#newGameBtn` + `#endTurnBtn`). dom-adapter 移除两个 id 缓存; 删除 `els.newGameBtn.addEventListener('click', showSetup)` / `els.endTurnBtn.addEventListener('click', ...)` 监听; `renderStatus` 内 `els.endTurnBtn.disabled / textContent` 引用迁移到 `els.handDiscardBtn`. CSS `controls.css` `.top-actions` 规则删除. 重开局功能走 `drawerRestartBtn` (PR-E5 side-drawer 已有), 结束回合走新 `#handDiscardBtn`.

2. **hand-dock 加 3 按钮 + select-then-confirm**:
   - HTML: `.hand-actions` 容器 + `#handConfirmBtn`/`#handCancelBtn`/`#handDiscardBtn` 3 按钮
   - JS: 加 `selectedHandCardId` state; `playerHand` click 在 `_shouldSelectFirst()` 为 true (play 阶段无 pending / 无 skill-select / 非 discard) 时仅 set `selectedHandCardId` + 高亮 + render (不立即 usePlayerCard); 复用 `.discard-selected` CSS 高亮选中
   - JS: `handConfirmBtn` click → `_handConfirm()`; `handCancelBtn` click → `_handCancel()`; `handDiscardBtn` click → 原 endTurn 流程 (finishPlayPhase + advancePhase + endTurn)
   - CSS `controls.css` `.hand-actions { display: flex; gap: 8px }`
   - handHint 文本: "点击卡牌选中, 再按'确认'" / "已选, 点'确认'使用"

3. **删除 .pause-banner**:
   - HTML: `<div class="pause-banner" id="pauseBanner">` 块删除
   - dom-adapter: `'pauseBanner'` 移出缓存; `renderPauseBanner` 改为 no-op (避免删除调用站点风险, render() 仍调用)
   - CSS `layout.css` `.pause-banner` + `.pause-banner__brush` 规则块删除. `.phase-prompt__brush` (PR-E13, 复用同笔触风格) 仍保留作 phase 提示

4. **pending modal 统一 dispatch**:
   - dom-adapter: `PENDING_MODAL_DISPATCH` 注册表 (15 项), 每项 `{ panelId, confirmBtnId, cancelBtnId }`
     - 覆盖 luoshen / guanxing / zhiheng / ganglie (+ ganglieSource) / cixiongFire / jiedaoDecision / yiji / qilin / guicai / huogong / tiesuo / conversion / target / exitConfirm
   - `_firstVisibleDispatch()` 找第一个 `!panel.hidden` 的注册项
   - `_clickIfEnabled(btnId)` 安全调用 `btn.click()` (检查 hidden/disabled)
   - `_handConfirm` / `_handCancel`: 先 dispatch 到 visible modal 对应 button, 否则 fallback (confirm 走 confirmDiscardBtn / playCard; cancel 走清选中)
   - modal 内原按钮 (luoshenContinueBtn 等) **保留** 作为兼容入口; hand 区按钮仅作为统一 dispatch

**新增测试** `tests/v9_pr_e16_hand_actions.test.mjs` (15 条守护):
- 3 条 top-actions 真删 (HTML + JS 缓存 + CSS)
- 5 条 hand-actions HTML + JS state + 绑定 + dispatch
- 3 条 pause-banner 真删 (HTML + JS no-op + CSS)
- 3 条 dispatch 注册表 + _handConfirm/_handCancel 内部走 dispatch
- 1 条 loadAllStyles() 回归

**同步更新旧测试** (PR-E16 反转 / 删除):
- `v9_pr_e2_center_log`: 5 条断言 (pauseBanner / brush / cache id / loadAllStyles)
- `v9_pr_e14_arena_cleanup`: 2 条 top-actions 断言
- `v9_pr_e15_polish`: 2 条 top-actions 断言

**Test status**: 758 → 772 ✓ (+14 净); `build:check` 通过.

**Process 遵守**:
- PR-E15 (#83) merge 状态已通过 `mcp__github__pull_request_read` 确认 (`merged: true, merged_at: 2026-05-14T23:56:23Z`) 后才从最新 main 拉新 branch `claude/v9-pr-e16-hand-actions`. 不在已 merge PR 上加 commit.

**不在范围**:
- 不动 engine, 不动 game.log, 不动 phase 流程
- 复杂 multi-button modal (fanjian 4 花色 / tiesuo 4 选项 / yiji 分配) 保留 modal 内按钮作为主入口; hand 区 confirm/cancel 只处理"是/否"二选一 modal 类型
- 真实立绘 / 卡牌插画 (无 PNG 约束)

---

### PR-E15 落地 — 5 处 polish ✅

**用户反馈截图** (PR-E14 合并后浏览器实测, 5 条):
> 1. 重新选将和结束出牌这两个按钮的位置是不是不对, 应该在我的角色卡上面一点的位置才合理吧
> 2. 双方角色卡里的手牌和状态是用来干什么的, 为什么文字只显示了半截
> 3. 最下面那个数字 (132)... 应该显示在武将技能卡最右边往上一点
> 4. 最右下角的时间没必要了吧, 直接删了
> 5. 分享和菜单的按钮是不是应该再往外一点呢

**5 处改动 (引擎零改动)**:

1. **top-actions 移到角色卡上方** — `controls.css .top-actions { top: auto; bottom: 320px; right: 28px }` (从 PR-E14 的 `top:18 right:86` 改). anchor 仍是 .game-frame (relative). bottom = hand-dock min 180 + player-zone min 110 + gap 24 ≈ 320, 让按钮浮在 .player-zone 顶上方右侧.
2. **stat-grid 隐藏** — `hero.css .stat-grid { display: none }` (从 grid + columns + margin → display:none). 信息冗余 — hand count 已在敌方 .small-card-row 显示, state text 已被 turn-badge + phase-prompt 替代.
3. **deck info 移到玩家技能 panel-title** — index.html 在 `<div class="panel-title">武将技能 + #playerSkillDeckInfo</div>`; dom-adapter 缓存 `playerSkillDeckInfo` + `renderStatus` 写入 `'牌堆 X · 弃牌 Y'`. .panel-title 是 flex space-between, badge 自动右对齐.
4. **时间删除** — `.status-bar__time` 加入 `.status-bar__version, .status-bar__score, .status-bar__time { display: none }` 共享规则. 整个底部 .status-bar 三元素全 hide. score 已重定位 (改动 3).
5. **frame-corner-btn 再往外** — `.frame-corner-btn--menu { top: -8px; left: 6px }` / `--share { top: -8px; right: 6px }` (从 `top:4 left/right:22` 改). 按钮浮到 frame 条纹边框之上, 紧贴 .app 边缘.

**新增测试** `tests/v9_pr_e15_polish.test.mjs` (7 条守护):
- 1 top-actions 新定位
- 1 stat-grid hide
- 2 deck info HTML + dom-adapter
- 1 status-bar 三元素 hide
- 1 frame-corner-btn 往外
- 1 loadAllStyles() 回归

**同步更新旧测试**:
- `v9_pr_e13_ingame_cleanup_v2`: `.status-bar__version` 断言 (改为共享规则匹配)
- `v9_pr_e14_arena_cleanup`: `.top-actions` 位置具体值不再精确断言 (改由 PR-E15 守护)

**Test status**: 751 → 758 ✓ (+7 新守护); 现有 751 条无 regression. `build:check` 通过.

**Process 遵守**:
- PR-E14 (#82) merge 状态已通过 `mcp__github__pull_request_read` 确认 (`merged: true, merged_at: 2026-05-14T23:37:23Z`) 后才从最新 main 拉新 branch `claude/v9-pr-e15-polish`. 不在已 merge PR 上加 commit.

---

### PR-E14 落地 — arena 清理 + 反贼徽章对称 + 手牌修复 ✅

**用户反馈截图** (PR-E13 合并后浏览器实测, 仍乱; 语气强烈):
> 中间阶段那个框的内容能不能删掉, 占了那么大块面积什么用都没有
> 最底下我的手牌区每张牌能不能显示全, 只有半截, 连文字都被截断我怎么知道是什么牌
> 为什么把滚动日志删掉了, 明明参考图都有, 你删掉了我怎么知道状态
> 最上面的那个主把文字挡住了你知道吗
> 我方角色的身份去哪了, 你把主公的身份显示了却不显示反贼是什么逻辑
> 最顶层留那么多空白干什么, 就放两个按钮吗
> 所有改动提交之前先检查前一个 pr 的 merge 状态

**7 处改动**:

1. **阶段 panel 整个隐藏** — index.html .panel 改 `class="panel arena-phase-panel"` 加 id; layout.css `.arena-phase-panel { display: none }`. phase 提示信息已由 PR-E13 .phase-prompt 中下横幅展示. JS (renderPhaseTrack) 仍跑, 只是不可见
2. **手牌截断修复** — layout.css `.hand-dock { overflow: hidden → visible }`; `.duel-table` grid 最后行 `minmax(128px, .9fr) → minmax(180px, 1.2fr)` 给卡牌高度; `height: calc(100vh - 92px) → calc(100vh - 36px)` (header 已 absolute 出, 不再占顶部)
3. **滚动日志恢复** — zones.css `.side-log-panel { display: none !important → display: flex !important }`; layout.css `.side-log-panel grid-column: 2 → 1 / -1` (跨 arena-zone 全宽). PR-E13 已让 .log-overlay 彻底 display:none, 现 side-log 是唯一日志载体
4. **lord-badge 重定位** — hero.css `.lord-badge` `top:8 right:8 w:30` → 共享规则 `.lord-badge, .rebel-badge { top:6 left:6 w:26 }`; `.hero-head { padding-left: 32px }` 给徽章留位. 解决 lord-badge 右上压 turn-badge "电脑" 文字问题
5. **反贼徽章** — index.html 加 `.rebel-badge` × 2 (player + enemy, 默认 hidden); hero.css `.rebel-badge { background: radial-gradient(#5fc77e, #1f7a3a) }` 绿圆 "反"; dom-adapter `renderHero` `rebelBadge.hidden = role !== '反贼'` (与 lord 互斥). dom-adapter 缓存 2 新 id
6. **top-actions 浮顶** — index.html `<nav class="top-actions">` 从 `<header>` 内移出 (放 header 之后, .game-frame 内); controls.css `.top-actions { position: absolute; top: 18; right: 86; z-index: 7 }` (避开右上 frame-share-btn at right:16); layout.css `.game-frame { position: relative }` (absolute 锚)
7. **turn-badge 默认 hidden** — dom-adapter renderStatus: `"电脑" / "玩家"` 默认文字是冗余 (1v1 位置一目了然), 改为仅 "当前回合" 显示; 其余 hidden. 避免 lord-badge 改位后跟其他文字撞

**新增测试** `tests/v9_pr_e14_arena_cleanup.test.mjs` (17 条守护):
- 1 条 arena-phase-panel hide
- 2 条 hand-dock overflow + duel-table grid
- 2 条 side-log-panel display + grid-column
- 2 条 lord/rebel-badge 共享规则 + hero-head padding
- 3 条 rebel-badge HTML + CSS 绿色 + dom-adapter 缓存
- 1 条 renderHero rebel/lord 互斥
- 3 条 top-actions 移出 header + absolute 定位 + game-frame position:relative
- 1 条 turn-badge 仅 "当前回合" 显示
- 2 条 loadAllStyles() 回归

**同步更新旧测试** (PR-E14 反转 / 重构):
- `v9_pr_e12_ingame_cleanup`: 取消对 `.side-log-panel display:none` 的断言 (PR-E14 已恢复)
- `v9_pr_e4_hero_portrait`: `.lord-badge` 拆分为共享规则 + 独立 background, 测试分别匹配

**Test status**: 734 → 751 ✓ (+17 新守护); 现有 734 条无 regression. `build:check` 通过.

**Process 遵守**:
- PR-E13 (#81) merge 状态已通过 `mcp__github__pull_request_read` 确认 (`merged: true, merged_by: fsfrank9, merged_at: 2026-05-14T23:13:54Z`) 后才从最新 main 拉新 branch `claude/v9-pr-e14-arena-cleanup`. 不在已 merge PR 上加 commit.

---

### PR-E13 落地 — 进入游戏后界面清理 v2 ✅

**用户反馈截图** (PR-E12 合并后浏览器实测, 仍乱):
> 还是很乱, 你去对比一下别人的

**对比参考截图找到的问题** (PR-E12 之外):

1. `<header>` 内 `.title-card` (h1 + .subtitle 长描述) 占顶部 ~12% 高度, 参考图游戏屏完全没有这一坨, 只剩角落 menu/share
2. `.status-banner` 大棕色"你的回合"块 + 长解释文字 "点击底部手牌出牌..." 是冗余, 参考图改成简短黄字黑笔触横幅
3. 中央 `.log-overlay` 仍与左侧 status-banner + 中间 skill-bar 重叠 (PR-E12 只调位置, 没彻底解决)
4. `.status-bar__version` v9.0.0 与手牌 dock 重叠形成水印重影
5. `.zone-panel` 深棕渐变 (rgba .78/.82) 不透明背景压视觉, 参考图 widget 半透明融入背景

**实际改动** (引擎零改动 / DOM 仅加 1 个新元素):

HTML `index.html`:
- `.title-card` 加 `id="titleCard"` 以便 hidden 控制
- 在 `.duel-table` 内 (pause-banner 旁) 加新 `.phase-prompt` + `.phase-prompt__brush` 元素

JS `src/ui/dom-adapter.js`:
- 缓存 3 个新 id: `titleCard` / `phasePrompt` / `phasePromptBrush`
- `_toggleHeader(show, mode)` 加 mode 参数; mode === 'game' 时隐藏 titleCard, 仅留 .top-actions 角落按钮
- `newGame` 调 `_toggleHeader(true, 'game')`; `showSetup` 调 `_toggleHeader(true, 'setup')`
- `renderStatus` 末尾写入 `phasePromptBrush.textContent = title`; pendingChoice / enemyThinking 时 phasePrompt hidden (由 .pause-banner 接管, 避免双显)

CSS `src/styles/layout.css`:
- `.status-banner { display: none }` (整个块隐藏; deckInfo 数据仍写, 等价信息已由 status-bar__score 在底部展示)
- 新增 `.phase-prompt` (absolute, bottom: 22%, z-index: 6) + `.phase-prompt__brush` (黑底 #ffd900 黄字, 多 box-shadow 笔触感, 复用 .pause-banner__brush 同源风格)
- `.status-bar__version { display: none }` (避免 v9.0.0 与手牌重影)

CSS `src/styles/zones.css`:
- `.log-overlay { display: none }` (彻底隐藏, 历史日志数据仍在 game.log)
- `.zone-panel` 背景 rgba 从 `.78/.82` 降到 `.32/.42` (半透明融入背景)

**新增测试** `tests/v9_pr_e13_ingame_cleanup_v2.test.mjs` (13 条守护):
- 2 条 HTML 结构 (titleCard id + phase-prompt 元素)
- 4 条 dom-adapter (id 缓存 + _toggleHeader 签名 + 调用站点 + renderStatus 写入)
- 5 条 CSS hide / 新增 / 透明化
- 2 条 loadAllStyles() 回归

**同步更新旧测试** (signature 改动):
- `tests/v9_pr_e10_audit.test.mjs`: `_toggleHeader(show)` → `_toggleHeader(show, mode)` + 两 call site 改 `(true, 'setup')` / `(true, 'game')`
- `tests/v9_pr_e2_center_log.test.mjs`: duel-table 内 lookup 窗口 800 → 1200 (.phase-prompt 加入后字符数增加)

**Test status**: 721 → 734 ✓ (+13 新守护); 现有 721 条无 regression. `build:check` 通过.

**显式不在范围**:
- 不加真实武将立绘 / 卡牌插画 (违反"无 PNG"约束, 留给 v10+ 立绘方向)
- 不动 game.log 数据写入 (renderLog 仍 push, 只是 overlay 不显示)
- 不动 engine, 不动 newGame / phase 流程

---

### PR-E12 落地 — 进入游戏后界面清理 ✅

**用户反馈截图** (PR-E11 合并后浏览器实测):
> 这是进入游戏后的界面，乱七八糟的

**找到的问题**:

1. **双显日志** — 中央 `.log-overlay` (PR-E2) 与右侧 `.side-log-panel` 都显示最近几条 game.log, 视觉冲突
2. **`.title-card::after` 大字水印 "魏 蜀 吴 群"** — 在 PR-E1 装饰外框 + 角落 widgets 之上重复装饰
3. **`.hero::before` 大字水印 "蜀" / "魏"** — 与 PR-E4 圆形主公徽章 + 卡片右下角 camp tag 重复, 且大字尺寸压头
4. **`.camp-ribbon` 倾斜带状** — 同样与 PR-E4 主公徽章 + camp tag 重复装饰
5. **武将台词 `.quote` ("凌波微步, 罗袜生尘" / "惟贤惟德, 能服于人")** — 是文字噪音, 不增加游戏信息
6. **`.log-overlay` 位置** — 原 left/right/top 偏侧 (与已隐藏的 side-log 错开), side-log 隐藏后应居中收窄

**实际改动 (CSS-only, 引擎 + DOM 结构零改动)**:

- `src/styles/hero.css`:
  - `.camp-ribbon { display: none }` (PR-E12 注释)
  - `.hero::before { content: none }` (PR-E12 注释)
  - `.quote { display: none }` (PR-E12 注释; 数据仍在 state.quote, 后续可改 hover tooltip)
- `src/styles/setup.css`:
  - `.title-card::after { content: none }` (PR-E12 注释)
- `src/styles/zones.css`:
  - `.side-log-panel { display: none !important }` (PR-E12 注释; 历史日志数据仍在 game.log)
  - `.log-overlay` 重新定位: `left: 22%; right: 22%; top: 32%; max-height: 28%` (居中 + 收窄, 避免覆盖 opponent/player zone-panel)

**新增测试** `tests/v9_pr_e12_ingame_cleanup.test.mjs` (8 条守护):
- 5 条 selector 隐藏断言 (.camp-ribbon / .hero::before / .quote / .title-card::after / .side-log-panel)
- 1 条 .log-overlay 重新定位断言 (left/right/top/max-height)
- 2 条 loadAllStyles() 拼接回归 (确保拆分文件加进总 CSS)

**Test status**: 713 → 721 ✓ (+8 新守护); 现有 713 条无 regression.

**显式不在范围**:
- 不动 .side-log-panel 的 JS 写入逻辑 (renderLog 仍 push, 后续如需 hover 展开 modal 再说)
- 不动 game.quote 数据 (仅隐藏 .quote DOM, 数据保留)
- 不动 .log-overlay 的 JS 渲染逻辑 (renderLogOverlay 不变, 只调 CSS 位置)

---

### PR-E11 落地 — 选将流程 bug 修复 ✅

**用户反馈截图** (PR-E9/E10 合并后浏览器实测):
> 这个界面直接卡住了，选完了不会自动进入游戏，还有逻辑应该是首先系统随机身份，分配到主公的先选，选完之后跳到反贼的选择，这个时候不可返回，而且每个身份选将的时候都不应该出现别的身份的吧

**找到的问题**:

1. **选完不自动进游戏** — PR-E9 设计成等用户点 `startGameBtn`, 但 iPad 视图下按钮滚出视窗用户看不到 → 卡死
2. **双 tab 自由切换** — 用户能在我方/敌方间任意来回切, 与"主公先选, 反贼后选, 不可返回"的规则不符
3. **每个 side 选将时不该看到另一 side 的 tab/按钮**
4. **入 setup 不自动随机身份** — 默认 playerRole='主公', 用户期望"首先系统随机身份"

**改动**:

`src/ui/dom-adapter.js`:
- 新增 state: `pickStep` (0 / 1 / 2) + `pickOrder` (按 主公→反贼 顺序排列的 `['player'|'enemy', ...]`)
- 新增 `resetPickSequence()` — 清空 selects + 重置 pickStep + 按 `playerRole` 设 pickOrder + 设 `currentPickSide = pickOrder[0]`
- `assignRandomRoles()` 末尾调 `resetPickSequence + renderHeroPickGrid` (重抽身份 = 重置选将)
- `showSetup()` 末尾改调 `assignRandomRoles()` (入 setup 自动随机身份)
- `handleHeroPickCardClick(heroId)`:
  - 阻止选对方已锁 hero (`otherSelect.value === heroId` 早 return)
  - 推进 `pickStep += 1`
  - `pickStep >= pickOrder.length` (2): 渲染 + `setTimeout(newGame, 120)` 自动进游戏
  - 未完成: `currentPickSide = pickOrder[pickStep]` 切到下一 side
- `handleHeroPickTabClick(side)`: 顺序选将下锁定 tab 切换 (`side !== currentPickSide` 早 return)
- `randomizeHero(side)`: 只允许 `currentPickSide`, 改走 `handleHeroPickCardClick` 统一流程
- `renderHeroPickGrid()`:
  - 用 `[hidden]` 切换非当前 side 的 tab + random btn (而非仅 `.is-active` class)
  - 给被对方选走的 hero card 加 `disabled` 属性 + `.is-locked` class (灰化锁定)

`src/styles/setup.css`:
- `.hero-pick__tabs` 改 `display: flex` (替代 grid 2 列), 让单 tab 占满
- `.hero-pick-tab[hidden]` `display: none !important`
- `.hero-pick-card:disabled` + `.hero-pick-card.is-locked`: `cursor: not-allowed` + `filter: grayscale(.6) brightness(.7)`
- `.hero-pick__random-row .btn.small[hidden]` `display: none !important`

`index.html`:
- `<button id="startGameBtn" hidden>` — auto-flow 后此按钮不再需要 (fallback)
- `<button id="confirmHeroPickBtn" hidden>` — 同上

**新增** `tests/v9_pr_e11_pick_sequence.test.mjs` (18 条守护):
- pickStep + pickOrder 状态变量
- resetPickSequence fn (清空 + 重置 + 按 role 排序)
- assignRandomRoles 调 resetPickSequence + render
- showSetup 调 assignRandomRoles
- handleHeroPickCardClick 推进 + auto newGame + 阻止对方锁定 hero
- randomizeHero 限 currentPickSide + 走统一流程
- renderHeroPickGrid 用 [hidden] 切 tab/btn + 锁定 card disabled+.is-locked
- handleHeroPickTabClick 锁定 tab 切换
- CSS: flex tabs / [hidden] display:none / :disabled+.is-locked 灰化
- HTML: startGameBtn / confirmHeroPickBtn hidden

更新 `tests/v9_pr_e9_hero_grid.test.mjs` + `tests/v9_pr_e10_audit.test.mjs`: handleHeroPickCardClick / randomizeHero 测试改为新流程断言.

**Test status**: 695 → 713 ✓ (+18 新守护; 现有 695 条无 regression — v9 PR-E9/E10 相关测试已同步更新).

### PR-E10 落地 — UI 审计 + 清理 + 集成守护 ✅

用户反馈 PR-E9 "都还没检查旧的 ui 元素有没有清理干净, 都还没验收新的 ui 逻辑是否正确" — 本 PR 专门做这一轮审计 + 清理 + 集成守护 (是否通过验收由用户在浏览器实际验证后决定).

**找到的问题**:

1. **`<header>` 在所有屏都可见** — 含 "新开一局" / "结束回合" 按钮 + dev blurb, 在 splash / lobby 入口屏不该出现
2. **死代码 CSS**: `.layout`, `.side`, `.battlefield` — 在 layout.css 定义但 HTML 不再使用 (v9 重构后)
3. **过时 `<select>` options** — 硬编码 11 个标准包武将, 但 `populateHeroSelects()` init 时已用 31 个武将重新填充, 静态 options 是 stale

**修复**:

`src/ui/dom-adapter.js`:
- 新增 `_toggleHeader(show)` 工具 fn — `document.querySelector('.game-frame > header').hidden = !show`
- `showSplash()` / `showLobby()` 调 `_toggleHeader(false)`
- `showSetup()` / `newGame()` 调 `_toggleHeader(true)`

`src/styles/layout.css`:
- 删除 `.layout { ... }`, `.side { ... }`, `.battlefield { ... }` 块
- 响应式 @media 中也清理对应引用
- 文件头注释更新

`index.html`:
- 旧 `<select id="playerHeroSelect">` 11 个 stale options → 空标签 `<select id="playerHeroSelect"></select>` (populateHeroSelects 动态填)
- enemy select 同理

`tests/css_split.test.mjs`:
- 内容回归检查 `\.layout` 改为 `\.duel-table` / `\.game-frame` (.layout 已删)

`tests/v27_regression.test.mjs`:
- "双方英雄池一致" 测试改为检查 JS populateHeroSelects 用同一 fill 函数到两 select (而非静态 HTML option 比对)

**新增** `tests/v9_pr_e10_audit.test.mjs` (20 条集成 + 清理守护):
- 死代码清理: layout.css 不再有 .layout/.side/.battlefield 块 / 全局 css 无 .battlefield / `<select>` 无 stale options
- header 显隐: `_toggleHeader` fn + showSplash/Lobby 调 false / showSetup/newGame 调 true
- 屏互斥: showSplash/Lobby/Setup 4 屏 hidden 状态正确 / newGame 切到 duel-table
- 入口流程: init → showSplash → splashEnter → showLobby / lobby1V1 → showSetup / startGameBtn → newGame / exitConfirm → showSetup
- 选将 grid click 路径: 委托 closest [data-hero-id] / handleHeroPickCardClick 末尾调 renderHeroPickGrid / 首次选我方自动切到敌方
- 4 主屏 HTML 都存在 + 初始 only splash unhidden
- loadAllStyles 回归 (.duel-table / .hero-pick / .splash-screen / .game-frame 都在)

**Test status**: 675 → 695 ✓ (+20 新守护); 现有 675 条无 regression (含 v27 + css_split 已同步).

---

## v9 方向 D 当前进度 (21 PR 已提交; 待用户验收)

PLAN + E0-E20 共 21 PR (1 PLAN + 20 实现) 已提交; 是否达成 v9-D 整体目标由用户在浏览器实际验收后决定:

| 子目标 | 提交 PR |
|---|---|
| CSS 拆分基础 | PR-E0 |
| 装饰外框 + 角落 widgets | PR-E1 |
| 中央日志 + 状态条 + 暂停横幅 | PR-E2 |
| 卡牌外观 (cream 卡身) | PR-E3 |
| 武将 portrait + HP + 主公徽章 | PR-E4 |
| 侧抽屉 + 退出 modal | PR-E5 |
| pendingChoice 13 面板卷轴化 | PR-E6 |
| action button 统一 | PR-E7 |
| splash + lobby (新入口) | PR-E8 |
| 选将 4×3 网格 | PR-E9 |
| 审计 + 清理 + 集成守护 | PR-E10 |
| 选将流程 bug (顺序选 + auto-start) | PR-E11 |
| 进入游戏后清理 (双显日志 + 旧水印) | PR-E12 |
| 进入游戏后清理 v2 (title-card / status-banner / phase-prompt / 半透明) | PR-E13 |
| arena 清理 + 反贼徽章 + 手牌修复 + top-actions 浮顶 + 恢复日志 | PR-E14 |
| 5 处 polish (按钮移位 / stat-grid / deck info / 删 time / 角落) | PR-E15 |
| hand-actions 重构 (top-actions/pause-banner 真删 + 3 按钮 + 统一 dispatch) | PR-E16 |
| 真删 .phase-prompt + .hand-dock overflow 修复 | PR-E17 |
| 删除二级 splash 屏 (启动直接进 lobby) | PR-E18 |
| 角落菜单 game-only + 退出回大厅 / 重开回选将 | PR-E19 |
| **删除顶部 header + title-card 标题栏** | **PR-E20** |

数据点:
- 20 实现 PR + 1 PLAN, ~3700 LOC (CSS + HTML + JS + tests)
- 789 测试 ✓ 全套通过 (起点 529 → 789, 新增 ~260 条守护)
- 引擎零改动 (`src/engine/*` 全程不动)
- 无 PNG 素材 (纯 CSS / Unicode / inline SVG / polygon clip)

注: 测试 ✓ 不等于视觉/交互合格, 用户验收前都按"待验收"算.

### PR-E9 落地 — 选将界面 4×3 网格重设计 ✅

**实际改动**:

HTML (`index.html`) 在 `.setup-card` 内, `role-draft-panel` 之后, 新增 `<div class="hero-pick">`:
- `.hero-pick__prompt` 黑底黄字 brush 横幅 ("您是主公，请选将" / "请选择您的对手!")
- `.hero-pick__tabs` 我方/敌方 两 tab (默认 player `.is-active`, 显示已选 hero 名)
- `.hero-pick__grid` 4 列武将网格 (max-height + 滚动)
- `.hero-pick__random-row` 随机我方/随机敌方 按钮

旧 `.hero-select-panel` 仍存在但加 `style="display:none"` (保留作 state holder, `newGame` 仍读 `<select>.value`).

CSS (`src/styles/setup.css`):
- `.hero-pick__prompt` 黑底 + 黄字 + brush 多 box-shadow (与 splash `__enter` 同源)
- `.hero-pick-tab` 暗底 + 金边, `.is-active` 高亮 (`#ffd68a` border + var(--gold) 文本)
- `.hero-pick__grid` `display: grid; grid-template-columns: repeat(4, minmax(0, 1fr))` + `max-height: 320px` + `overflow-y: auto`
- `.hero-pick-card` cream gradient + 2px 棕 border + 双层 shadow + camp tag (绝对定位左上)
- 4 个 camp 配色: `--camp-魏` 蓝 `#2a648c` / `--camp-蜀` 绿 `#2d8c4c` / `--camp-吴` 红 `#b54322` / `--camp-群` 灰 `#5a4830`
- `.is-player-selected` 蓝光 inset shadow / `.is-enemy-selected` 红光 inset shadow

dom-adapter (`src/ui/dom-adapter.js`):
- els 缓存追加 7 个新 ids
- 新增 `currentPickSide` 状态变量 (默认 `'player'`)
- `renderHeroPickGrid()`: 从 `Engine.HERO_CATALOG` 渲染所有武将 → card; 标记 selected; 更新 tab values + prompt
- `handleHeroPickCardClick(heroId)`: 设当前 side 的 `<select>.value` + `ensureDistinctHeroes` + 重渲染; 第一次选完我方自动切到敌方
- `handleHeroPickTabClick(side)`: 切换 `currentPickSide`
- `populateHeroSelects()` 末尾调 `renderHeroPickGrid()` (showSetup 时同步)
- `randomizeHero()` 末尾调 `renderHeroPickGrid()` (高亮同步)
- bindEvents 接入 heroPickGrid click (event delegation) + 两 tab click

**新增** `tests/v9_pr_e9_hero_grid.test.mjs` (20 条守护):
- HTML: `.hero-pick` + 4 子部分 / 两 tab + data-side + is-active 默认 player / __label+__value / 旧 hero-select-panel display:none / random 按钮移到 random-row
- CSS: `.hero-pick` 全套 selectors / `.hero-pick__prompt` brush 风 / `.hero-pick-tab.is-active` 高亮 / `.hero-pick__grid` 4 列 grid + 滚动 / `.hero-pick-card` cream + 4 camp 颜色 / 选中态蓝/红光
- dom-adapter: 7 ids + 3 fn + currentPickSide / renderHeroPickGrid 从 Catalog 取 / cardClick 改 select.value + 重渲染 / populate 末尾调 / randomize 末尾调 / bindEvents 接入 3 click
- 回归 loadAllStyles

**Test status**: 655 → 675 ✓ (+20 新守护); 现有 655 条无 regression.

---

### PR-E8 落地 — 二级 splash + 一级 lobby ✅

**实际改动**:

新流程: **app 启动 → splash 屏 → lobby 屏 → setup 屏 → 游戏**. 旧流程是 启动 → setup 屏 → 游戏, PR-E8 在前面插入了 2 个新屏。

HTML (`index.html`):
- 新增 `<section class="splash-screen" id="splashScreen">` (默认显示, 无 hidden) 含:
  - `.splash-screen__bg` 山景背景容器 (CSS-only polygon clip)
  - `.splash-screen__messages` 中央促销/介绍多行文字
  - `.splash-screen__enter` 底部黑色 brush 横幅按钮 (与 PR-E2 暂停横幅同源风格)
- 新增 `<section class="lobby-screen" id="lobbyScreen" hidden>` 含:
  - `.lobby-screen__topbar` (avatar 圆头像 + name + VIP + 货币占位)
  - `.lobby-screen__modes` 3 列 grid:
    - `lobbyKofBtn` (KOF 模式) — `.lobby-mode-card--placeholder` + `disabled`
    - `lobby1v1Btn` (1V1 对战) — `.lobby-mode-card--active`
    - `lobbyHellBtn` (炼狱 KOF) — `--placeholder` + `disabled`
  - `.lobby-screen__nav` 5 项 (排行榜/设置/武将/素材/福利) 均 disabled
- `<section class="setup-screen">` 加 `hidden` (改默认隐藏, 由 lobby 1V1 click 唤起)

CSS (新增 `src/styles/entry.css`, ~220 行):
- `.splash-screen`: flex 居中, 山景 gradient bg
- `.splash-screen__bg::before/::after` 用 `clip-path: polygon` 画山脉剪影
- `.splash-screen__enter` 黑底黄字 brush 横幅 (与 `.pause-banner__brush` 同源 box-shadow 偏移)
- `.lobby-screen` flex column, 顶部 topbar + 中部 grid 3 模式 + 底部 5 nav
- `.lobby-mode-card` 金色 cream gradient + 3px 棕金 border + 大字 title + 双层 box-shadow
- `--active` 更亮金, `--placeholder` grayscale + brightness .78
- `.lobby-screen__currency` / `.lobby-screen__avatar` 配色与 frame 一致

主 `main.css` `@import` 加 `entry.css` (最后, 适合 specific page override).

dom-adapter (`src/ui/dom-adapter.js`):
- els 缓存追加 6 个新 ids
- 新增 `showSplash()` / `showLobby()` 工具 fn
- `showSetup()` 扩展: 显示 setup 同时隐藏 splash + lobby
- **入口初始化** 改为 `showSplash()` (替代旧 `showSetup()`)
- `bindEvents()` 接入:
  - `splashEnterBtn` click / `splashScreen` 整屏 click → `showLobby()`
  - `lobby1v1Btn` click → `showSetup()`
  - `lobbyKofBtn` / `lobbyHellBtn` click → alert "待开发 v10+"

测试调整 `tests/css_split.test.mjs`:
- 文件数 8 → 9 (含 entry.css)
- `@import` 最后一个从 setup.css → entry.css
- 文件存在检查覆盖 entry.css

**新增** `tests/v9_pr_e8_splash_lobby.test.mjs` (22 条守护):
- HTML 结构: splash 默认显示 / lobby hidden / setup 改 hidden / splash 三块 / lobby 5 部分 / 3 模式卡变体
- CSS: entry.css 全套 selectors + polygon clip + brush button + lobby grid 3列 + 2 mode 变体 + [hidden] !important
- main.css 含 entry.css @import
- dom-adapter: 6 ids 缓存 + showSplash/Lobby fn / showSetup 扩展隐藏 splash+lobby / init 改 showSplash / 4 click handlers
- loadAllStyles 回归

**Test status**: 633 → 655 ✓ (+22 新守护); 现有 633 条无 regression (含 PR-E0 守护已同步更新到 9 文件).

### PR-E7 落地 — action button 统一橙金装饰风 + utility 收尾 ✅

**实际改动** (只动 CSS):

`controls.css` 重写 `.btn` 基类:
- 橙金 gradient (`#f0a33a → #c25a1a → #8b3c10`) — 与 `.btn-frame` 同色板
- 1px 棕色 border (`#5b2f15`)
- 浅文本 `#fff4d0` + 800 字重 + 0.08em letter-spacing + text-shadow
- 双层 box-shadow (inset 高光 + outer 阴影)
- `:hover` `brightness(1.1)` + translateY -1px
- `:active` translateY 1px (按下反馈)
- `:disabled` opacity .48 + grayscale .4

`.btn.primary` 改更亮的金色 (`#ffe4a3 → #e69a39 → #b9532d`) + 深文本 `#2a120a` + 更亮 inset, 适合"新开一局"等主操作。

`.btn.small`: 紧凑变体 `min-height: 30px / padding: 6px 14px / border-radius: 6px / letter-spacing: .12em`.

`hero.css` `.badge` 微调:
- 12px 字 + 700 字重 + 0.04em letter-spacing
- 边框 alpha 从 .28 → .38 (与 `.btn` 协调)
- 文本 `#f3deb2`, 底 `rgba(0,0,0,.24)`

`cards.css` `.mini-card` 微调 (顶级, 非 pending 范围内):
- `display: inline-flex` 配 suit/rank 子元素
- gradient 暗棕底 (`rgba(43,24,17,.65) → rgba(20,12,8,.8)`)
- 金边 + 700 字重 + 8px 圆角

**保持不冲突**:
- `.pending-prompt-panel .btn.small` 范围覆写仍生效 (cream 风 modal 内)
- `.pending-prompt-panel .mini-card` 范围覆写仍生效

**新增** `tests/v9_pr_e7_button_unify.test.mjs` (13 条守护):
- `.btn` 橙金 gradient + 棕 border + 浅文本 + 双 shadow
- `:hover` / `:active` / `:disabled` 状态
- `.btn.primary` 更亮金色 + 深文本
- `.btn.small` 紧凑变体
- `.badge` / `.mini-card` 收尾值
- pending panel 内覆写仍生效 (回归)
- `loadAllStyles()` 含新 `.btn` 规则

**Test status**: 620 → 633 ✓ (+13 新守护); 现有 620 条无 regression (所有 v8/v9 旧测试都还过).

### PR-E6 落地 — pendingChoice modals 统一卷轴风 ✅

**实际改动**:

只动 `src/styles/modals.css`. HTML / dom-adapter 不动 (13 个面板的 `.pending-prompt-panel` class 已经在; 复用 CSS 改样式即可全部升级).

`.pending-prompt-panel` 升级:
- 从原 inline 贴附手牌上方 → `position: fixed` + `top:50% left:50%` + `translate(-50%,-50%)` **center modal**
- `z-index: 40`, `width: min(520px, 84vw)`, `max-height: 76vh; overflow-y: auto`
- Cream paper bg (`linear-gradient(#fef0c8 → #f5dca0)`) + 1px `#b27632` 棕红 border + 0.55 大阴影 + inset 白边

`.pending-prompt-panel::before` 充当**全屏 dim backdrop**:
- `position: fixed; inset: 0`
- `background: rgba(0,0,0,.45)` + `backdrop-filter: blur(2px)`
- `z-index: -1` (在 panel 内容之后, 因 panel 是 fixed 创建 stacking context — backdrop 视觉位置仍在 panel 之下)

子样式调整 (适配 cream bg):
- `.pending-prompt-panel__hint`: 深红 `#7a3a14` 大字 15px + 居中 + 下方虚线分隔
- `.__choices` / `.__actions`: `flex: 1 1 100%` + `justify-content: center`
- `.prompt-card-choice`: cream-on-cream gradient (`#fff5d4 → #f0c878`) + 深棕 border + 深色字; `.selected` 金色高亮 (`#ffd68a → #d88427`) + 浅文本
- 范围内 `.btn.small` 升级为小 `.btn-frame` 风 (橙 gradient + 棕 border + 900 大字)
- 范围内 `.badge` / `.mini-card` 改深色 (适配 cream bg)

`.pending-prompt-panel[hidden] { display: none !important }` **保留** (守 v8 HOTFIX #60 — 否则 13 面板全部永远可见盖手牌).

**新增** `tests/v9_pr_e6_pending_scroll.test.mjs` (13 条守护):
- 位置: `position: fixed` 居中
- 卡身: cream paper + 棕红 border
- backdrop: `::before` 全屏 + dim + blur
- 子样式: hint 深红居中 + 虚线分隔 / choices/actions 100% flex + 居中
- prompt-card-choice cream-on-cream + selected 金高亮
- 范围内 `.btn.small` 升级 + `.badge` / `.mini-card` 覆写
- 13 个 panel HTML 元素仍在 (向后兼容)
- `[hidden]` override 仍生效 (守 HOTFIX #60)
- 回归 loadAllStyles

**Test status**: 607 → 620 ✓ (+13 新守护); 现有 607 条无 regression (含 PR-A1..A5 等老 pending 面板测试都还过 — 因为 class 名 + DOM 结构未变).

### PR-E5 落地 — 侧抽屉菜单 + 退出确认 modal (卷轴风) ✅

**实际改动**:

HTML (`index.html`) 在 `.app` 内 (`.game-frame` 之前) 加 2 个新组件:
- `<aside class="side-drawer" id="sideDrawer" hidden>` — 含 6 项: 退出 / 重开 / 等待 / 背景 / 变速 / 帮助 + 1 个收起按钮. 等待/背景/变速 用 `.is-placeholder` + `disabled` 标记 (待实现)
- `<div class="scroll-modal" id="exitConfirmModal" hidden role="dialog">` — 含 backdrop + paper (两端 roll 装饰) + 标题/正文/按钮 (确定/取消)

CSS:
- **`layout.css`**:
  - `.side-drawer` 绝对定位左侧 (`top:56 left:0 bottom:40 width:94`), 棕木 gradient (`#6f3d18 → #4d2a10`), 右下圆角, 重 box-shadow
  - `[hidden]` 用 `transform: translateX(-100%)` 滑出 + `visibility:hidden`, 而非 display:none (保留滑入动画)
  - `.side-drawer__item` 列式 (icon + label), `:hover` 半透明亮 + 右移 2px
  - `.is-placeholder / :disabled` 灰化
  - `.side-drawer__close` 底部收起按钮
- **`modals.css`**:
  - `.scroll-modal` 用 `position: fixed` + `grid place-items: center` 居中
  - `.scroll-modal[hidden] { display: none !important }` (覆盖 grid)
  - `.scroll-modal__paper` 米黄 cream gradient (`#fef0c8 → #f5dca0`) + 棕红 border + 大阴影
  - `.scroll-modal__roll--left/right` 左右两端 26px 宽 卷起圆柱 gradient
  - `.scroll-modal__title` 棕红大字 / `__body` 灰红正文 / `__actions` 按钮组
  - **新增** `.btn-frame` 装饰按钮基类: 橙色 gradient + 棕 border + 双层 shadow; `--cancel` 绿色变体

dom-adapter (`src/ui/dom-adapter.js`):
- els 缓存追加 9 个新 ids (drawer 5 + modal 4)
- 工具 fn: `openSideDrawer / closeSideDrawer / toggleSideDrawer / openExitConfirm / closeExitConfirm`
- `frameMenuBtn` click **从 PR-E1 placeholder 替换为** `toggleSideDrawer`
- `drawerExitBtn` click → `closeSideDrawer` + `openExitConfirm`
- `drawerRestartBtn` click → `closeSideDrawer` + `showSetup` (复用现有 setup 屏)
- `drawerHelpBtn` click → `closeSideDrawer` + alert (待 v10 接帮助文档)
- `drawerCloseBtn` click → `closeSideDrawer`
- `exitConfirmYesBtn` click → `closeExitConfirm` + `showSetup`
- `exitConfirmNoBtn` / `exitConfirmBackdrop` click → `closeExitConfirm`
- **Esc 键** keydown listener: 优先关 modal, 否则关 drawer

更新 `tests/v9_pr_e1_layout_frame.test.mjs`: 把"main → game-frame"buffer 从 800 → 4000 (因 PR-E5 在中间塞了抽屉 + modal)

**新增** `tests/v9_pr_e5_drawer_modal.test.mjs` (21 条守护):
- HTML: aside.side-drawer + 6 项 + modal (paper/roll/title/body/actions) + role="dialog" + aria-modal
- CSS layout: .side-drawer 全部子类 + [hidden] transform 滑出 + 绝对定位 + 棕木 gradient
- CSS modals: .scroll-modal 全套 + [hidden] display:none !important + fixed/grid 居中 + paper cream + roll 左右两侧 + .btn-frame + --cancel
- dom-adapter: 9 ids 缓存 / 5 工具 fn / frameMenuBtn 替换 placeholder / 各 click handler / Esc keydown
- 回归 loadAllStyles

**Test status**: 586 → 607 ✓ (+21 新守护); 现有 586 条无 regression。

### PR-E4 落地 — 武将 portrait + HP 红方块 + 主公徽章 + 技能 framed tag ✅

**实际改动**:

CSS:
- **`hero.css`**:
  - `.heart` 从圆形 ♥ 改 18×22 矩形块: red linear-gradient + 多层 inset/outer box-shadow 立体感, `font-size: 0 / color: transparent` 隐藏原 ♥ 字符 (保留语义)
  - `.heart.empty` grayscale + brightness 弱化 + 灰 gradient
  - **新增** `.lord-badge`: 绝对定位右上 (top:8px right:8px) 30×30 圆形, 红色 radial-gradient + 2px 白边 + 红光阴影; `[hidden]` 用 `display: none !important` 强制隐藏
- **`controls.css`**:
  - `.skill-button` 重设计为橙色 gradient (`#f0a33a → #c25a1a → #8b3c10`) + 棕色 border + 浅文本色 (类似截图 行殇 / 放逐 风格)
  - `:hover` brightness + transform / `:disabled` opacity / `skill-status-todo` 灰 dashed / `-display` 灰蓝 / `-implemented` 加金 inset (向后兼容旧 modifier)

HTML (`index.html`):
- 两个 `<article class="hero">` 元素都加 `<span class="lord-badge" hidden aria-label="主公">主</span>` (放在 `.hero-aura` 之后, `.camp-ribbon` 之前)

dom-adapter (`src/ui/dom-adapter.js`):
- els 缓存追加 `playerLordBadge` / `enemyLordBadge`
- `renderHero(actor)` 加 lord badge 切换: `lordBadge.hidden = !(game.roles[actor] === '主公')`

**新增** `tests/v9_pr_e4_hero_portrait.test.mjs` (13 条守护):
- `.heart` 矩形块 (border-radius 4px / 18×22 / 红 gradient / 多 box-shadow)
- `.heart` 隐藏 ♥ 字符 (font-size:0 + color:transparent)
- `.heart.empty` 灰化
- `.lord-badge` 右上红圆白边 + `[hidden]` 强制隐
- 两 hero 元素都有 lord-badge
- dom-adapter 缓存 + renderHero 切换逻辑
- `.skill-button` 橙色 gradient + 棕 border + `:hover` / `:disabled`
- 3 个 skill-status 修饰类保留
- 回归 `loadAllStyles()`

**Test status**: 573 → 586 ✓ (+13 新守护); 现有 573 条无 regression。

### PR-E3 落地 — 卡牌外观重设计 ✅

**实际改动**:

CSS (`src/styles/cards.css`) 全量重写 .card 视觉:
- 卡身: cream/yellow 渐变 (`#fff5d4 → #f9e4a8 → #e3c577`) 替代旧 dark gradient
- 棕色装饰边框: `border: 2px solid #5b2f15` + 双层 `inset box-shadow` (内白边 + 中棕环) 模拟装饰边
- 5 个 group (attack/defense/heal/trick/buff) 用集合选择器统一覆写为 cream bg (旧 group 颜色已不适合)
- `.card::before { content: none }` — 关闭旧黄色圆形装饰
- 中央 `.card-name`: 绝对定位 `top:50% left:50% translate(-50%,-50%)`, 16px 大字深色 `#2a160a` + 浅金 text-shadow
- 底部右下 `.card-type`: `position: absolute; bottom: 4px; right: 6px`, 11px 小 badge, 5 group 颜色:
  - attack `#c84527` (红) / defense `#2a648c` (蓝) / heal `#2d8c4c` (绿) / trick `#7d3b8c` (紫) / buff `#a06520` (棕黄)
- 描述行 `.card-desc`: 底部小灰字, 2 行截断
- 背景水印 `.card-symbol`: 右中半透明大字
- 左上 corner: `.card-corner` 从原 right 改 left, `flex-direction: column` 排
- 新增子类 `.card-corner__rank` (17px) + `.card-corner__suit` (14px)
- `.card .suit-red` 覆写为 `#c4172a` (深红, cream bg 用); `.card .suit-black` 为 `#1a1a1a` (近黑)
- 根 `.suit-red` 保持 `#ff7878` (亮红, mini-card-suit 在 dark bg 用 — 守 v8 PR-0 规则)
- `.card.discard-selected`: 红 outline + 浮起 + 红光 shadow

dom-adapter (`src/ui/dom-adapter.js`):
- `suitRankBadge()` 输出嵌套 span: `<span class="card-corner suit-red"><span class="card-corner__rank">5</span><span class="card-corner__suit">♥</span></span>`
- 仍保留顶层 `.card-corner` + `suit-red/black` class (向后兼容)

**新增** `tests/v9_pr_e3_card_redesign.test.mjs` (14 条守护):
- .card cream bg / 棕 border + 双 inset shadow
- 5 group 共享 cream bg / `.card::before content:none`
- .card-corner 左上 + column 排
- `.card-corner__rank` + `__suit` 子样式
- `.card .suit-red` 深红 / `.card .suit-black` 近黑
- 根 `.suit-red` 仍亮红 (守 v8 PR-0)
- .card-name 居中定位
- .card-type 底部右下 + 5 group 颜色变体
- suitRankBadge 输出嵌套 span + 仍保 .card-corner 顶层 class
- .card.discard-selected outline + transform + shadow
- 回归 loadAllStyles

**Test status**: 559 → 573 ✓ (+14 新守护); 现有 559 条无 regression。

### PR-E2 落地 — 中央日志 + 暂停横幅 + 底部状态条 ✅

**实际改动**:

HTML (`index.html`) 在 `.duel-table` 顶部加 3 个 overlay 元素:
- `<div class="log-overlay" id="logOverlay" aria-live="polite">` — 中央日志容器
- `<div class="pause-banner" id="pauseBanner" hidden>` — 暂停 brush 横幅 (内含 `.pause-banner__brush` 文本)
- `<div class="status-bar" id="statusBar">` — 底部状态条 (`statusBarVersion` / `statusBarScore` / `statusBarTime`)

CSS:
- `layout.css`: `.duel-table` 加 `position: relative` (overlay 锚); `.pause-banner` + `.pause-banner__brush` (多 `box-shadow` 偏移模拟笔触不规则边缘); `.status-bar` + 3 子样式
- `zones.css`: `.log-overlay` 绝对定位 (`top: 24%`), `.log-overlay__entry` 大字白色 (clamp 15-21px) + 多层 text-shadow, `.log-overlay__entry--phase` 阶段名浅金高亮, `@keyframes log-overlay-in` 进入动画 (.25s fade-up)

dom-adapter:
- els 缓存追加 6 个新 ids
- 新增 `renderLogOverlay()` — 取 `game.log.slice(-6)`, 用正则 `/阶段|回合开始|回合结束/` 给阶段名加 `--phase` 类
- 新增 `renderPauseBanner()` — `pendingChoice || enemyThinking` 时显示 (gameover 排除)
- 新增 `renderStatusBar()` — 把 `deck.length + discard.length` 作为占位分数
- 新增 `tickStatusBarTime()` — 用 `Date()` 渲染 HH:MM
- `renderLog()` 末尾调 `renderLogOverlay()`
- `render()` 末尾调 `renderPauseBanner()` + `renderStatusBar()`
- `bindEvents()` 启动 `setInterval(tickStatusBarTime, 60_000)`

**新增** `tests/v9_pr_e2_center_log.test.mjs` (13 条守护):
- HTML: 3 个 overlay 在 `.duel-table` 内 / pauseBanner 默认 hidden + brush 文本 / statusBar 3 子元素
- CSS: `.duel-table` position relative / log-overlay 绝对定位 + pointer-events:none + 进入动画 / pause-banner brush 多 box-shadow / status-bar 3 子样式
- dom-adapter: 6 ids 缓存 / 4 个新 fn / render 调用 / setInterval 接入
- 回归: loadAllStyles 含新规则

**Test status**: 546 → 559 ✓ (+13 新守护); 现有 546 条无 regression。

### PR-E1 落地 — 装饰外框 + 角落 widgets ✅

**实际改动**:

设计 tokens (`tokens.css`):
- `--frame-stripe-warm: #d44a18` (主红橙)
- `--frame-stripe-bright: #f6c43c` (亮金黄)
- `--frame-stripe-width: 14px` (边框厚度)
- `--frame-inner-radius: 14px`
- `--frame-corner-wood` (左上 菜单 木质 gradient)
- `--frame-corner-gold` (右上 分享 金边 gradient)

布局 (`layout.css`):
- `.app` 改 `position: relative` (角落 widgets 绝对定位锚)
- 新增 `.game-frame` — 用 background-clip 双层技巧 (padding-box 显示内层深色,
  border-box 显示外层 `repeating-linear-gradient` 45° 红橙金黄条纹) 画装饰
  边框。`flex: 1 1 auto`, `min-height: 0`, 包裹 header / setup-screen / duel-table。
- 新增 `.frame-corner-btn` 基类 + `--menu` / `--share` 变体, 绝对定位
  `top: 4px; left: 22px` / `right: 22px`。点击有 `:hover` brightness + transform 反馈。

HTML (`index.html`):
- `<main class="app">` 下: 先放 `frameMenuBtn` + `frameShareBtn` 两个按钮
  (绝对定位浮在边框上), 然后 `<div class="game-frame">` 包裹原 `<header>` /
  `<section.setup-screen>` / `<section.duel-table>`, 闭合于 `</main>` 前。

dom-adapter (`src/ui/dom-adapter.js`):
- els 缓存追加 `frameMenuBtn` / `frameShareBtn`
- bindEvents 加 2 个 placeholder click handler (console.info trace, 等
  PR-E5 接入侧抽屉)

**新增** `tests/v9_pr_e1_layout_frame.test.mjs` (10 条):
- tokens 含 5 个 frame design vars
- layout.css `.game-frame` 用 repeating-linear-gradient + padding-box + border-box
- `.frame-corner-btn` + `--menu`/`--share` 变体 + hover / focus 状态
- `.app` 改 position: relative
- HTML 含 frameMenuBtn / frameShareBtn
- HTML 用 `.game-frame` 包裹 header → duel-table
- 角落按钮在 `.game-frame` 之外 (作为 .app 直接子元素, 浮在 border 上)
- dom-adapter 缓存 + click handler 绑定
- `loadAllStyles()` 拼接结果含新 frame 规则 (回归)

**Test status**: 536 → 546 ✓ (+10 新守护); 现有 536 条无 regression。

### PR-E0 落地 — CSS 拆分基础 ✅

**实际结果**:

8 文件 (`src/styles/` 下) + 1 entry:

| 文件 | LOC | 内容 |
|---|---|---|
| `tokens.css` | 52 | `:root` vars + `body`/`html`/font + `button,select font:inherit` |
| `layout.css` | 182 | `.app`/`header`/`.layout`/`.panel`/`.battlefield`/`.duel-table`/`.status-banner`/`.hand-dock` + 共享 panel-base block + 响应式 `@media` |
| `hero.css` | 190 | `.hero*`/`.hp-row`/`.heart`/`.camp-ribbon`/`.stat-grid`/`.damage-float` + `@keyframes floatDamage` + 链状态 |
| `cards.css` | 150 | `.hand`/`.card*`/`.card-corner`/`.suit-*`/`.mini-card*`/`.empty-hand` |
| `zones.css` | 69 | `.log*`/`.zone-panel`/`.judge-area`/`.equipment-area`/`.skill-bar`/`.phase-track`/`.phase-step` |
| `modals.css` | 149 | `.pending-prompt-*` + 6 `*-mode-panel` + `[hidden]` override (含 HOTFIX #60) + `.target-card-choices`/`.huogong-*` |
| `controls.css` | 93 | `.btn` + 变种 + `.skill-button` + `.skill-status-*` + `.discard-controls` + `.shake` + `@keyframes shake` |
| `setup.css` | 105 | `.title-card` + `h1` + `.subtitle` + `.setup-*` + `.hero-select-panel` + `.rules` |
| **`main.css`** | **14** | 仅 8 个 `@import` (顺序: tokens → layout → 组件 → setup) |

总: 1004 lines (原 953, +51 来自文件标题注释)。

**测试辅助** `tests/helpers/load-styles.mjs`:
- 暴露 `loadAllStyles()` 把 8 个分文件按顺序拼成单字符串
- 暴露 `SPLIT_CSS_FILES` 数组
- 10 个原读取 `main.css` 的 test 文件改用 `loadAllStyles()` (零行为差异)

**新增** `tests/css_split.test.mjs` (7 条守护):
- 8 分文件都存在
- `SPLIT_CSS_FILES` 与实际一致
- `main.css` 不含具体 CSS 规则 (仅 `@import` + 注释)
- `@import` 顺序 (tokens 第一 / setup 最后)
- 每个分文件首行是 `/* ... */` 说明注释
- `loadAllStyles()` 返回拼接结果含原内容片段
- `index.html` 仍引用 `main.css` (入口不动)

**Test status**: 529 → 536 ✓ (+7 新守护); 现有 528 条无 regression。`build:check` 通过。

### PR-E0 — CSS 拆分基础
**目标**: 把 953 行的单一 `main.css` 拆成职责单一的文件, 为后续视觉重构留余地。

**拆分方案** (8 个文件 + 1 entry):

| 文件 | 内容 | 预估 LOC |
|---|---|---|
| `tokens.css` | `:root` vars + `body`/`html`/字体 + `.app` 容器 | ~50 |
| `layout.css` | `.layout` / `.battlefield` / `.duel-table` / `.panel` / `.status-banner` / `.hand-dock` / 三大区 (opponent/arena/player) + 响应式 `@media` | ~120 |
| `hero.css` | `.hero*` / `.hp-row` / `.heart` / `.camp-ribbon` / `.stat-grid` / `.damage-float` + 链状态 | ~200 |
| `cards.css` | `.hand` / `.card*` / `.card-corner` / `.suit-*` / `.mini-card*` / `.small-card-row` / `.empty-hand` | ~200 |
| `zones.css` | `.zone-panel` / `.judge-area` / `.equipment-area` / `.skill-bar` / `.phase-track` / `.phase-step` / `.log*` / panel-title | ~100 |
| `modals.css` | `.pending-prompt-*` / `.prompt-card-choice` / 6 个 `*-mode-panel` (tiesuo/target/huogong/conversion/guanxing/zhiheng) + `[hidden]` override + 配套 card-choices | ~250 |
| `controls.css` | `.btn` / `.btn.primary` / `.btn.small` / `.top-actions` / `.skill-button` / `.skill-status-*` / `.badge` / `.discard-controls` | ~120 |
| `setup.css` | `.setup-screen` / `.setup-card` / `.setup-grid` / `.setup-side` / `.hero-select-panel` / `.title-card` / `.subtitle` / `.rules` / `.shake` | ~120 |
| `main.css` | 只剩 `@import` 8 行 | ~15 |

**加载方式**: `main.css` 用 `@import` 串起来。`index.html` 的 `<link rel="stylesheet" href="./src/styles/main.css" />` **不动**, build:check 还能过。

**测试守护**: 加 1 条新测试断言 8 个新文件都存在 + `main.css` 含对应 `@import`。现有 CSS regex 测试不变 (内容仍在 main.css 通过 @import 链)。

**风险**: 极低 — 纯文本重组, CSS cascade 顺序保持原样。

### PR-E1 — 整体布局重构 + 装饰外框
**目标**: 主 layout 重设 + 装饰外框包裹。

**改动**:
- CSS tokens 扩展 (橙红 / 金 / 棕 / 绿 色板, 字体 stack, spacing scale)
- 装饰外框: striped border (CSS gradient + repeating-linear-gradient) 包 battlefield
- Layout 重排: `top-enemy` / `center-log-and-zones` / `bottom-player` 三段, 替换现有 `.battlefield` grid
- 角落 widgets:
  - 左上 "菜单" (棕色书本 emoji + 文字 placeholder)
  - 右上 "分享" (翅膀 emoji + 文字 placeholder)
- 不动具体面板内容, 只是重排
- 现有 13 个 pending-prompt-panel 需要在新 layout 里重新定位 (作为子元素插入对应区)

**LOC**: ~400 CSS + 100 HTML + 50 JS

**风险**: 中 — 现有面板定位 / hidden-attribute / 13 个 `.pending-prompt-panel` 都要重新检查

### PR-E2 — 中央日志 + 状态条
**目标**: 替换右侧滚动 log box 为中央大字 overlay。

**改动**:
- 替换 `.log` 滚动 box → 半透明 overlay, 最近 4-6 条
- 阶段名突显 (如 `10:曹丕回合开始` `11:判定阶段`)
- 底部状态条: 版本号 (`A20.10.05` 风格) + 蚂蚁蛋分数占位 + 时间
- 暂停时显示 "游戏暂停中" 黑色 brush 横幅 (CSS box-shadow 模拟笔触)

**LOC**: ~200 CSS + 30 JS

**风险**: 低

### PR-E3 — 卡牌外观重设计
**目标**: 手牌单卡视觉升级到截图风格 (corner 花色+点数 + 卡身 + 底部 label)。

**改动**:
- 单卡 frame: 黄色卡身 + 棕框 + corner ♥5/♦A/♣K + 中央名字 + 底部 `武/锦` 类型 label
- 卡身按 group 区分色 (attack 红 / defense 蓝 / heal 绿 / trick 紫 / buff 棕黄)
- 不加插画 (中央仍是文字)
- 卡片选中态 (`.discard-selected`) 重新设计

**LOC**: ~250 CSS + 50 JS (cardButton 渲染调整)

**风险**: 中 — 手牌点击 / 选择 / 弃牌模式需要回归测试

### PR-E4 — 武将 portrait + HP + 装备/判定区
**目标**: player + enemy 用统一 portrait component, HP / 装备 / 判定区按截图布局。

**改动**:
- portrait component: CSS frame + emoji/首字 placeholder
- HP 改红方块系列 (右侧排列, 满血 4 灰 / 受伤红 / 危急闪烁)
- 技能 label 改 framed orange tag (`行殇` `放逐` 风格)
- 装备区紧贴 portrait 下方
- 判定区贴 portrait 上方
- 主公徽章 `主` (右上角圆形)

**LOC**: ~300 CSS + 100 JS

**风险**: 中

### PR-E5 — 侧抽屉菜单 + 退出确认 modal
**目标**: 左上"菜单"按钮 → 抽屉从左滑出, 退出确认 modal 卷轴风。

**改动**:
- 左上 "菜单" 按钮触发抽屉
- 抽屉项 (placeholder 部分): 退出 / 重开 / 等待 / 背景 / 变速 / 帮助
- 退出确认 modal: 卷轴风, 金边按钮 (确定/取消)
- 1V1 中 "重开" = 跳转到选将屏

**LOC**: ~250 CSS + 100 JS + 30 HTML

**风险**: 中

### PR-E6 — pendingChoice modals 统一卷轴风
**目标**: 13 个 `.pending-prompt-panel` 视觉升级为 scroll-paper modal。

**改动**:
- 弹出位置改 center fixed (替代当前贴附手牌上方)
- CSS 卷轴 frame (两端卷起, 中间纸张色)
- 标题区 + 内容区 + 按钮区
- 旧 class 保留 (向后兼容), 新增 `.pending-prompt-scroll` modifier

**LOC**: ~300 CSS

**风险**: 高 — 13 个面板都涉及, 易出 regression

### PR-E7 — action button 统一 + 收尾细节
**目标**: 全局按钮统一装饰风, mini-card 等 utility refactor。

**改动**:
- 全局按钮 (确定/取消/弃牌/制衡确认/铁索/...) 统一橙金装饰
- `.mini-card` / `.badge` utility refactor
- 视觉细节最终调整

**LOC**: ~150 CSS

**风险**: 低

### PR-E8 — 二级 splash + 一级 lobby
**目标**: 新增入口屏 (splash) + 主菜单 (lobby), 让用户在选将前有完整的入口流程。

**改动**:

**Splash 屏 (二级)**:
- 显示提示文本 + "请点击屏幕开始游戏" 黑色 brush
- 山景背景 (CSS gradient + svg path 模拟剪影)
- 左上 "菜单" / 右上 "分享" widget
- 底部版本号 + 占位 score + 时间
- 点击任意位置进入 lobby

**Lobby 屏 (一级)**:
- 顶部用户信息条: 头像 (placeholder 首字) + 名字 + VIP 徽章 + 货币 (蚂蚁蛋占位)
- 中部 3 个模式卡片 (金边装饰 frame): KOF模式 / 1V1对战 / 炼狱KOF
- 底部 nav (5 项): 排行榜 / 设置 / 武将 / 素材 / 福利
- **仅 1V1对战 可点**, 其余显示"待开发"提示
- 点 1V1对战 → 进入选将 (E9)

**LOC**: ~250 CSS + 100 HTML + 100 JS

**风险**: 中 — 新增整套屏幕需要测试导航流

### PR-E9 — 选将界面重设计
**目标**: 替换现有 `.setup-screen` 的 `<select>` 下拉为视觉化 4×3 武将网格。

**改动**:
- 4×3 武将网格, 每格显示 势力 tag (魏=蓝 / 蜀=绿 / 吴=红 / 群=灰) + 武将名 (大字)
- 顶部 "随机武将 / 自由点将(N)" tabs (N 显示可选数量)
- 状态 prompt:
  - 第一步: "您是主公，请选将" (选 player)
  - 第二步: "请选择您的对手!" (选 enemy)
- 右下角 已选预览卡 (武将 portrait + 主公徽章 + 技能 tag)
- 多页翻页 (左右箭头, 因为武将 > 12)
- 确定 / 取消 按钮 (复用 PR-E7 装饰风)

**LOC**: ~300 CSS + 150 HTML + 100 JS

**风险**: 中 — 替换现有 setup-screen 的 `<select>` 交互需要全套回归

## 不在 v9-D 范围

- 武将真实插画 (留 v9 后续或用户提供素材)
- 卡牌真实插画 (同上)
- 出牌 / 受伤 / 翻牌 动画 (留 v10)
- 音效 (留 v10)
- KOF / 炼狱 模式实际玩法 (E8 只做 lobby placeholder)
- 排行榜 / 武将 / 素材 / 福利 子界面 (lobby 底 nav 只是 placeholder)
- 多人 / 网络对战 (v9 方向 B, 后续独立计划)

## 技术决策

| 问题 | 决策 |
|---|---|
| 装饰元素材料 | 纯 CSS / Unicode / inline SVG (无 PNG) |
| CSS 文件 | 拆 8 文件 + 1 entry, `@import` 加载, `index.html` 不动 |
| 字体 | 系统字体 (中文 `PingFang SC, 思源宋体, Source Han Serif`, 西文 `system-ui, sans-serif`) |
| Modal 弹出位置 | center fixed (替代当前贴附手牌上方) |
| 兼容性 | 保留所有现有 ID + class 选择器, 新增不删除, 仅在 PR-E6 把旧 panel 标 deprecated |
| 引擎接口 | **零改动** — 全部 UI 层 (`src/engine/*` 不动) |
| 测试断言 | regex 验证 class / id / 结构在 index.html + 对应 CSS 文件存在 (不依赖渲染) |

## 测试策略

- 每个 PR 加 5-10 条新断言守护新结构 (按 v8 PR-A1 / PR-C5 等模式)
- 全套 `npm test` 必须保持 ✓ (零 regression)
- 现有 529 条测试是 lower bound, v9-D 完成时应 ≈ 600+

## 流程

1. **plan PR (本 PR)**: 仅 docs, 把本文档合入 (无 code 改动)
2. 等用户确认 → **PR-E0 (CSS 拆分)** 开始, 零视觉变化
3. 之后按 E1 → E9 顺序逐一推进, 每个 PR 独立可 review/merge
4. 每合并 1 个 PR, 本文档加 `### PR-EN 落地段` 详细记录 (按 v8 PR-C5 等的方式)

## 已知后续 (v10+ 候选)

- 武将插画 / 卡牌插画 (素材或 AI 生图)
- 动画 (出牌 / 受伤 / 翻牌)
- 音效
- AI 深度搜索 (v9 方向 A 推迟)
- 多人 / 网络对战 (v9 方向 B 推迟)
- 对局回放 / 训练模式 (v9 方向 E 推迟)
