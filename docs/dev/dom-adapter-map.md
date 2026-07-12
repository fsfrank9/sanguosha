# dom-adapter.js 责任块地图

> v10 V1 输出 — 纯文档. 不动代码.
> 对应文件: `src/ui/dom-adapter.js` (2409 行, 单 IIFE module).
> 目的: 给 v10 V2 (清债) / V3 (响应框架) / V8 (dispatch 注册表补全) 提供切分依据.
>
> **v12 F6 勘误 (2026-07-12)**: 本图为 v10 时代快照, 行号已过时。拆分现状:
> 大厅/选将 → `panels/lobby-panels.js` (F4); 响应/提示/模式面板 →
> `panels/{response,prompt,mode}-panels.js` (v11 B2); **战场渲染域**
> (renderHero/renderHand/renderStatus/renderZones/日志/花色徽章工具 等
> 20 函数) → `panels/board-panels.js` (F6, 可变状态经 uiView() 按次传入)。
> 主文件现 ≈1135 行, 只余: els 装配 / 事件绑定 / 出牌与技能流程 /
> pendingChoice 面板路由 (renderPendingChoice) / staged 高亮 / enemyStep
> 回合驱动 / uiView 与委托 shim。§10 的拆分建议至此全部落地或被取代。

---

## 0. TOC

1. 文件全貌 + 七大段落锚点
2. 顶层状态清单 (vars + els 缓存)
3. 公共基础设施 (formatter / suit-rank / DOM helper)
4. modal kind 责任块对照表 (按 pendingChoice.kind 聚合)
5. 二级面板责任块 (出牌面板, 非 pendingChoice 驱动)
6. 入口屏 / 屏切换 / 选将
7. 主渲染 + 回合驱动
8. 死变量 / 死代码清单 (V2 清债目标, ≥5 项)
9. PR-E 注释碎片清单 (V2 注释整理目标)
10. 子模块拆分建议 (V2 / V3 落地形状)
11. V2 准备 checklist

---

## 1. 文件全貌

| 段落                          | 行号        | 内容                                                              |
| ----------------------------- | ----------- | ----------------------------------------------------------------- |
| import + 顶层 var             | 1–39        | `Engine`, `game`, 30 余个 pending/staged/select 状态 + `els = {}` |
| `initElements()`              | 41–110      | 单次 `getElementById` 缓存表, 含 60+ id                           |
| 基础格式化                    | 112–185     | `hpMarkup` / `miniBacks` / `escapeHtml` / SKILL_*_LABELS / cost   |
| `renderHero` / `cardButton`   | 187–301     | 头像区 + skill bar + 手牌单卡渲染                                 |
| `renderHand` / phase / log    | 303–365     | 手牌列表 / 阶段指示 / log + log-overlay / status-bar              |
| `renderStatus`                | 385–469     | 中央 status 文案 + handHint / confirm/cancel 启用条件             |
| zone / equipment / `render()` | 471–540     | 装备区 / 判定区 / 主 render 编排                                  |
| 公共渲染 helper               | 542–612     | `_reapplyStagedHighlight`, suit/rank, `promptCardChoice`          |
| `renderPendingChoice`         | 614–992     | 11 个 pending 面板的显隐 + 候选 HTML                              |
| flash / `findPlayerCard`      | 994–1018    | 视觉抖动 + 手牌查找                                               |
| 出牌二级面板                  | 1020–1218   | tiesuo / target / huogong / conversion / guanxing show+hide       |
| skill-select 模式             | 1220–1329   | zhiheng/rende/fanjian/qingnang 选-后-确认                         |
| 出牌入口                      | 1331–1469   | `resolveTargetZone/Card/Huogong/Conversion/Tiesuo` + `usePlayerCard` |
| 弃牌 / 技能入口               | 1471–1529   | `confirmDiscardSelection` / `usePlayerSkill`                      |
| 回合驱动                      | 1531–1593   | `enemyStep` / `maybeStartEnemyTurn`                               |
| 选将 (PR-E11 顺序选将)        | 1595–1799   | `populateHeroSelects` / `renderHeroPickGrid` / `randomizeHero`    |
| 屏切换                        | 1781–1840   | `showSetup` / `showLobby` / `newGame` / corner btn 显隐           |
| dispatch + staged 工具         | 1842–1907   | `PENDING_MODAL_DISPATCH` + `_firstVisibleDispatch` + `_anyModalVisible` + `_shouldSelectFirst` |
| hand-confirm / hand-cancel    | 1909–1968   | `_handConfirm` / `_handCancel`                                    |
| `bindEvents`                  | 1970–2403   | 全部 click/keydown 绑定 (~430 行)                                 |
| 启动序列                      | 2405–2409   | `initElements` → `populateHeroSelects` → `bindEvents` → `showLobby` |

---

## 2. 顶层状态清单

### 2.1 状态 var

| var                      | 行   | 归属                | 用途                                                                                  |
| ------------------------ | ---- | ------------------- | ------------------------------------------------------------------------------------- |
| `Engine`                 | 3    | 全局                | 别名 `SanguoshaEngine`                                                                |
| `game`                   | 4    | 全局                | 当前 game state (`null` 当未开局)                                                     |
| `enemyThinking`          | 5    | 回合驱动            | AI 推进中 flag, 用于禁用玩家交互                                                      |
| `selectedDiscardIds`     | 6    | 弃牌阶段            | 弃牌阶段 selected 集合                                                                |
| `selectedHandCardId`     | 10   | 出牌 (PR-E16)       | play 阶段 "选-后-确认": 单张候选                                                      |
| `stagedModalChoice`      | 14   | 二级面板 (PR-E23/24) | `{kind:target/huogong/pending, payload, selector}` — 候选 stage                       |
| `pendingTiesuoCardId`    | 15   | 铁索面板             | 待结算的铁索牌 id                                                                     |
| `pendingTargetCardId`    | 16   | 目标区面板           | 待结算的过河/顺手牌 id                                                                |
| `pendingTargetZone`      | 17   | 目标区面板           | hand / equipment / judge                                                              |
| `pendingHuogongCardId`   | 18   | 火攻面板             | 待结算的火攻牌 id                                                                     |
| `pendingConversionCardId`| 19   | 转化面板             | 蛮族骑射类待转化 sha 的牌 id                                                          |
| `guanxingUnassignedIds`  | 23   | 观星 pending         | 三队列 — 待分配                                                                       |
| `guanxingTopIds`         | 24   | 观星 pending         | 三队列 — 顶                                                                           |
| `guanxingBottomIds`      | 25   | 观星 pending         | 三队列 — 底                                                                           |
| `guanxingSelected`       | 26   | 观星 pending         | 当前高亮的牌 id                                                                       |
| `ganglieSelectedIds`     | 28   | 刚烈 pending         | 刚烈 source-choice 已选 (max 2)                                                       |
| `skillSelectMode`        | 29   | 技能多选模式          | `zhiheng` / `rende` / `fanjian` / `qingnang` / null                                  |
| `selectedSkillCardIds`   | 30   | 技能多选模式          | 当前模式下已选的手牌 + 装备牌 id                                                      |
| `enemyActionDelay`       | 34   | 回合驱动 (PR-E22)    | 1300ms — 出牌阶段实质动作间隔                                                          |
| `enemyPhaseDelay`        | 35   | 回合驱动 (PR-E22)    | 700ms — 准备/判定/摸/弃/结束 阶段切换间隔                                              |
| `playerRole`             | 36   | 选将                 | "主公" / "反贼"                                                                       |
| `enemyRole`              | 37   | 选将                 | "主公" / "反贼"                                                                       |
| `draftPicker`            | 38   | 选将 (legacy)         | "player" / "enemy" / "done" — 仅由 `confirmHeroPick` 改, `updateDraftUI` 显示, **PR-E11 之后实质死** (见 §8.5) |
| `els`                    | 39   | 全局                  | `{ [id]: HTMLElement }` 缓存                                                          |
| `SKILL_TRIGGER_LABELS`   | 137  | 技能格式化            | trigger → 中文                                                                        |
| `SKILL_FREQUENCY_LABELS` | 151  | 技能格式化            | frequency → 中文                                                                      |
| `yijiGiveSelection`      | 614  | 遗计 pending          | 勾选 "交给对方" 的牌 id                                                                |
| `currentPickSide`        | 1629 | 选将 (PR-E11)         | 当前 pick side                                                                        |
| `pickStep`               | 1630 | 选将 (PR-E11)         | 0 / 1 / 2(done)                                                                       |
| `pickOrder`              | 1631 | 选将 (PR-E11)         | `[主, 反]` 顺序                                                                       |
| `PENDING_MODAL_DISPATCH` | 1845 | dispatch 注册表       | hand-confirm/cancel 路由 → 16 项                                                       |

### 2.2 els 缓存表 (60+ id)

按 §1 段落归属:

- **战场骨架** (`startGameBtn` ... `phaseTrack`): line 49–54
- **选将 (旧)**: `playerHeroSelect`, `enemyHeroSelect`, `confirmHeroPickBtn` (E11 后 hidden, 见 §8.5)
- **装备/判定区**: `playerEquipmentArea` 等: line 55
- **侧栏徽章** (`enemyRibbon` / `playerRibbon` / `lordBadge` / `rebelBadge`): line 56, 92–93
- **出牌二级面板** (tiesuo / target / huogong / conversion / guanxing): line 57–63
- **技能多选面板** (zhiheng): line 64
- **pending 面板** (guicai / yiji / fanjian / fankui / ganglie / qilin / cixiong / jiedao / guohe / wugu / luoshen / shanResponse / dyingRescue): line 66–83
- **入口屏 (PR-E5/E8/E9/E18/E19)**: lobby + drawer + exit-confirm + heroPick grid + hero pick prompt
- **角落 widget (PR-E1)**: `frameMenuBtn`, `frameShareBtn`
- **战报 overlay (PR-E2)**: `logOverlay`, `statusBar*` (**display:none, §8.1**)
- **手牌底部条 (PR-E16)**: `handConfirmBtn`, `handCancelBtn`, `handDiscardBtn`
- **technical**: `playerSkillDeckInfo` (PR-E15 牌堆数字位)

---

## 3. 公共基础设施

| fn                     | 行     | 说明                                                                  |
| ---------------------- | ------ | --------------------------------------------------------------------- |
| `$(id)`                | 41     | `getElementById` 别名                                                 |
| `initElements`         | 45     | 一次性填 `els`, 末尾 `els.log = els.battleLog`                        |
| `hpMarkup` / `miniBacks` | 112  | 心 + 手牌背面                                                         |
| `escapeHtml`           | 128    | HTML 转义                                                             |
| `formatSkillCost`      | 157    | 技能消耗中文化                                                         |
| `formatSkillTooltip`   | 171    | 技能 tooltip                                                          |
| `actorDisplayName`     | 997    | `game[actor].name`                                                    |
| `suitLabel`            | 550    | spade → ♠                                                             |
| `suitColorClass`       | 557    | suit-red / suit-black                                                 |
| `suitRankBadge`        | 564    | 卡面右上角 rank+suit (PR-E3 column)                                   |
| `suitName`             | 1167   | spade → "黑桃" 中文 (火攻 / guanxing 用)                              |
| `promptCardChoice`     | 585    | **统一 pending 候选 button 模板** (PR-A1) — 所有 pending 面板候选都走 |
| `playerCardAction`     | 266    | 手牌可用性判定 `{mode,playable,normal,asSha}`                          |
| `cardButton`           | 279    | 手牌单卡 HTML                                                         |
| `zoneCards` / `equipmentCards` | 471 | 装备 / 判定 mini-card 列表                                       |
| `playerEquipmentForZhiheng` | 495 | 制衡可点装备                                                          |
| `flashHero`            | 1002   | 视觉抖动 + 命中 floating                                              |
| `findPlayerCard`       | 1016   | by id 找玩家手牌                                                      |

### 3.1 staged + dispatch 工具 (1842–1907)

| fn                       | 行   | 说明                                                                                                  |
| ------------------------ | ---- | ----------------------------------------------------------------------------------------------------- |
| `PENDING_MODAL_DISPATCH` | 1845 | `{panelId, confirmBtnId, cancelBtnId}` 注册表, 顺序 = 优先级                                          |
| `_firstVisibleDispatch`  | 1864 | 首个 `!hidden` 注册项 — 决定 hand-confirm/cancel 路由谁                                              |
| `_clickIfEnabled`        | 1873 | `btn.click()` 仅在 `!hidden && !disabled`                                                            |
| `_highlightStaged`       | 1883 | 全局清旧 `.is-staged` → 给 `chosenEl` 加. 单态                                                       |
| `_anyModalVisible`       | 1891 | querySelector 检 5 类面板 class — 用于 playerHand 误点防护                                            |
| `_shouldSelectFirst`     | 1899 | play 阶段 + 无 pending + 无 modal 时 → 走 "选-后-确认"                                                |

---

## 4. modal kind 责任块 (pendingChoice 驱动)

每行: `kind` → `panelId` → render 分支行 → 候选 stage 通道 → confirm/cancel/decline 入口.

| kind                  | panelId               | render 分支 | 候选 stage 通道                | dispatch.confirm        | dispatch.cancel              | direct btn                                                                |
| --------------------- | --------------------- | ----------- | ------------------------------ | ----------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| `guicai-replace`      | `guicaiPromptPanel`   | 619         | `guicaiCandidates` (2093)      | — (单候选直接 stage)    | `guicaiDeclineBtn` (2104)    | —                                                                         |
| `yiji-distribute`     | `yijiPromptPanel`     | 654         | `yijiCandidates` (2369) **多选 toggle, 不走 staged** | `yijiConfirmBtn` (2378)  | `yijiKeepAllBtn` (2383)      | —                                                                         |
| `guanxing-reorder`    | `guanxingModePanel`   | 681         | **不走 staged** — 3 队列 + 顶/底/取回 btn (2072–2087) | `guanxingConfirmBtn` (2075) | `guanxingDeclineBtn` (2076) | top/bottom/return btn                                                     |
| `fanjian-guess`       | `fanjianPromptPanel`  | 694         | 4 suit btn (2110)              | — (suit btn 直接 stage) | — (无 cancel)                | —                                                                         |
| `fankui-pick`         | `fankuiPromptPanel`   | 706         | `fankuiZones` (2123)           | — (zone/card 直接 stage)| —                            | —                                                                         |
| `ganglie-fire`        | `gangliePromptPanel`  | 736         | **不走 staged** — fire/decline 直接 resolve (2140/2144) | `ganglieFireBtn`        | `ganglieDeclineBtn`           | —                                                                         |
| `ganglie-source-choice` | `ganglieSourcePanel` | 747         | **多选 toggle (ganglieSelectedIds)** (2148–2159) | `ganglieSourceConfirmBtn` (2160) | `ganglieSourceTakeDamageBtn` (2168) | —                                                                         |
| `qilin-pick`          | `qilinPickPanel`      | 778         | `qilinPickChoices` (2175)      | —                       | `qilinDeclineBtn` (2186)     | —                                                                         |
| `cixiong-fire`        | `cixiongFirePanel`    | 803         | **不走 staged** — fire/decline 直接 resolve (2192/2197) | `cixiongFireBtn`        | `cixiongFireDeclineBtn`      | —                                                                         |
| `cixiong-choose`      | `cixiongChoosePanel`  | 815         | `cixiongChooseChoices` (2203)  | — (单候选直接 stage)    | — (无 cancel; **直接 btn**)  | `cixiongChooseDrawBtn` (2214) — 不走 dispatch (**未注册**, 见 §8.7)         |
| `jiedao-decision`     | `jiedaoDecisionPanel` | 841         | **不走 staged** — fire/decline 直接 (2220/2225) | `jiedaoDecisionFireBtn`  | `jiedaoDecisionDeclineBtn`    | —                                                                         |
| `guohe-1v1-pick`      | `guohePickPanel`      | 858         | `guohePickEquipment` + `guohePickHand` (2231) | — (单候选 stage)        | — **无 cancel/decline** (**未注册**, 见 §8.7) | —                                                                         |
| `wugu-pick`           | `wuguPickPanel`       | 894         | `wuguPickChoices` (2248)       | — (单候选 stage)        | — **无 cancel/decline** (**未注册**, 见 §8.7) | —                                                                         |
| `luoshen-continue`    | `luoshenPromptPanel`  | 919         | **无候选** — continue/stop 直接 resolve (2260/2265) | `luoshenContinueBtn`     | `luoshenStopBtn`              | —                                                                         |
| `shan-response`       | `shanResponsePanel`   | 931         | `shanResponseChoices` (2273) — **PR-E25/E26** | — (单候选 stage)         | `shanResponseDeclineBtn` (2284)| —                                                                         |
| `dying-rescue`        | `dyingRescuePanel`    | 956         | `dyingRescueChoices` (2353)    | — (单候选 stage)         | `dyingRescueDeclineBtn` (2364) | —                                                                         |

### 4.1 通用 staged 提交路径 (PR-E24)

```
点候选 → stagedModalChoice = {kind:'pending', payload, selector} → render()
点 #handConfirmBtn → _handConfirm() → Engine.resolvePendingChoice(game, payload)
点 #handCancelBtn → _handCancel() → 清 staged, 面板保持
点 panel.declineBtn → 直接 Engine.resolvePendingChoice(game, {decline:true} or {use:false})
```

`stagedModalChoice.selector` 用于 `_reapplyStagedHighlight` (render 重建 DOM 后重套 `.is-staged`).

### 4.2 staged 通道 vs 直接通道分类

- **走 staged**: guicai / fankui / fanjian / qilin / cixiong-choose / wugu / guohe / dying-rescue / shan-response (PR-E24/E25/E26 改造完毕)
- **不走 staged (多选)**: yiji / guanxing / ganglie-source — UI 本身就是 toggle 列表
- **不走 staged (单选直接 resolve)**: ganglie-fire / cixiong-fire / jiedao / luoshen — 只有 2 个按钮 (fire/decline), 无候选

---

## 5. 二级面板责任块 (非 pendingChoice 驱动)

出牌阶段玩家主动出牌触发的二级面板. 与 pendingChoice 无关.

| 面板               | panelId               | show fn                  | hide fn                  | resolve 入口                                  | staged.kind   |
| ------------------ | --------------------- | ------------------------ | ------------------------ | --------------------------------------------- | ------------- |
| 铁索连环           | `tiesuoModePanel`     | `showTiesuoPanel` (1020) | `hideTiesuoPanel` (1026) | `resolveTiesuo({mode,targets})` (1372) — 4 子按钮直接 | — (无候选)    |
| 目标区 (过河/顺手) | `targetZonePanel`     | `showTargetZonePanel` (1031) | `hideTargetZonePanel` (1039) | `resolveTargetZone` (1331) → `showTargetCardChoices` (1204) → staged → `resolveTargetCard` (1336) | `target`      |
| 火攻               | `huogongModePanel`    | `showHuogongPanel` (1176) | `hideHuogongPanel` (1047) | 候选 staged → `resolveHuogong(costId, false)` (1344); 不弃牌 → `resolveHuogong(null, true)` (decline btn 直接) | `huogong`     |
| 转化 (当杀)        | `conversionModePanel` | `showConversionPanel` (1055) | `hideConversionPanel` (1063) | `resolveConversion(false/true)` (1354) — normal/sha btn 直接 | — (无候选)    |
| 观星 (准备阶段)     | `guanxingModePanel`   | `showGuanxingPanelFromPending` (1102) | `hideGuanxingPanel` (1121) | `confirmGuanxing` (1148) / `declineGuanxing` (1159) | — (走 3 队列) |

技能多选模式 (与 `skillSelectMode` 耦合, 共用 `zhihengModePanel`):

| 技能    | enter            | exit                    | confirm           | toggle              |
| ------- | ---------------- | ----------------------- | ----------------- | ------------------- |
| zhiheng | `enterCardSkillMode('zhiheng')` (1266) | `exitSkillSelectMode` (1283) | `confirmCardSkill` (1301) | `toggleSkillCard` (1290) |
| rende   | 同上              | 同上                    | 同上              | 同上                |
| fanjian | 同上              | 同上                    | 同上              | 同上 (max:1)        |
| qingnang| 同上              | 同上                    | 同上              | 同上 (max:1)        |

`cardSkillConfig(skillId)` (1220) 是 4 配置中心. `enterZhihengMode` (1278) / `confirmZhiheng` (1318) 都是 legacy 残留 (见 §8.3).

---

## 6. 入口屏 / 屏切换 / 选将

### 6.1 屏切换 (3 屏: lobby → setup → duelTable)

| 屏             | id               | 入口 fn                     | 退出 fn                |
| -------------- | ---------------- | --------------------------- | ---------------------- |
| 大厅 (一级)     | `lobbyScreen`    | `showLobby` (1810)         | `showSetup` 中 hide    |
| 选将屏 (二级)   | `setupScreen`    | `showSetup` (1781)         | `newGame` 中 hide      |
| 对局           | `duelTable`      | `newGame` (1817)           | `showLobby` 中 hide    |

启动 (line 2409) 直入 lobby (PR-E18: splash 已删).

`_toggleCornerButtons(show)` (1806) — `frameMenuBtn` / `frameShareBtn` 仅 game 内可见 (PR-E19).

### 6.2 侧抽屉 + 退出确认 (PR-E5/E19)

- `openSideDrawer` / `closeSideDrawer` / `toggleSideDrawer` (376–381)
- `openExitConfirm` / `closeExitConfirm` (382–383)
- drawer 内: `drawerExitBtn` → 弹 exit-confirm → `showLobby`; `drawerRestartBtn` → `showSetup`; `drawerHelpBtn` → alert; `drawerCloseBtn`.
- Esc 键先关 exit-confirm 再关 drawer (2344).
- `exitConfirmModal` 已注册 `PENDING_MODAL_DISPATCH` 末尾 (2025 PR-E16, btn click 自动派发).

### 6.3 选将 (PR-E11 顺序选将)

| fn                         | 行   | 角色                                                                        |
| -------------------------- | ---- | --------------------------------------------------------------------------- |
| `populateHeroSelects`      | 1605 | 填两个 `<select>` (legacy DOM, 仍存) + `renderHeroPickGrid`                  |
| `renderHeroPickGrid`       | 1641 | 主渲染 — grid + tab 显隐 + prompt 文案                                      |
| `handleHeroPickCardClick`  | 1692 | 卡 click → set select.value + 推 pickStep; pickStep ≥ pickOrder.length → `newGame()` |
| `handleHeroPickTabClick`   | 1712 | **几乎 no-op** — 仅 defensive return (见 §8.4)                              |
| `ensureDistinctHeroes`     | 1722 | 双方不可同将                                                                |
| `randomizeHero(side)`      | 1743 | 当前 side 随机 → 走 `handleHeroPickCardClick`                                 |
| `updateDraftUI`            | 1756 | 显 `playerRoleBadge` / `enemyRoleBadge` / `firstPickBadge` (legacy, §8.5)    |
| `assignRandomRoles`        | 1762 | 主公/反贼 随机 → `resetPickSequence` + `renderHeroPickGrid`                  |
| `confirmHeroPick`          | 1773 | **legacy 残留** — 仅推 `draftPicker` 标签 (§8.5)                            |
| `resetPickSequence`        | 1633 | 重置 `pickStep` + select.value 清空                                          |

---

## 7. 主渲染 + 回合驱动

### 7.1 主 render() (520)

调用顺序: `renderHero('player') → renderHero('enemy') → renderHand → renderLog → renderStatus → renderPhaseTrack → renderZones → renderPendingChoice → (清 stale staged) → _reapplyStagedHighlight → renderPauseBanner [no-op] → renderStatusBar → enemyHandBacks`.

### 7.2 出牌入口

- `usePlayerCard(cardId)` (1427) — 主入口. skill-select / 弃牌 / 转化 / 当杀 / 普通 5 个分支.
- `resolveNormalPlayerCard(cardId)` (1384) — tiesuo / guohe / shunshou / huogong → 拉对应二级面板; 其余直接 `Engine.playCard`.

### 7.3 回合驱动

- `maybeStartEnemyTurn` (1587) — 启动 AI loop
- `enemyStep` (1531) — 单步 → `setTimeout(enemyStep, delay)`. **PR-E25**: 顶部检 `Engine.getPendingChoice` 阻 AI 推进, 轮询等玩家 resolve.

### 7.4 hand-confirm/cancel 决策树

`_handConfirm` (1909) 优先级:
1. `stagedModalChoice` → 对应 kind resolve
2. `_firstVisibleDispatch` → 点对应 confirm btn
3. 弃牌阶段 → 点 `confirmDiscardBtn`
4. `selectedHandCardId` → `usePlayerCard`

`_handCancel` (1946) 优先级:
1. `stagedModalChoice` → 撤 stage
2. dispatch → 点 cancel btn
3. `selectedHandCardId` → 清
4. `selectedDiscardIds` → 清

---

## 8. 死变量 / 死代码清单 (V2 清债目标)

### 8.1 `statusBar` 三件套全 display:none, JS 仍写文本 ← **建议直接整块删**

- HTML: `index.html:179` `<div class="status-bar">` 含 `statusBarVersion` (v9.0.0 硬编码) / `statusBarScore` / `statusBarTime`
- CSS: `layout.css:303–307` 三个子元素 `display: none` (PR-E15 注释解释为 "用户反馈 没必要")
- JS:
  - `els.statusBar*` 缓存 (line 89) — 全 dead
  - `renderStatusBar` (360) — 每帧写 `statusBarScore.textContent` (display:none)
  - `tickStatusBarTime` (367) + `setInterval` (1973) — 每分钟写 `statusBarTime.textContent`
- **建议**: 删 HTML `.status-bar` 整块 + CSS 选择器 + dom-adapter 3 fn + render() 调用 + setInterval. 删 5 个 cache id.

### 8.2 `renderPauseBanner` 整 fn no-op

- line 353–355: 函数体仅 `return;` 一行 + 注释 "保留以避免删除调用站点风险"
- 调用站点只有 1 处 (`render()` line 537)
- 缓存 `pauseBanner` id 已不存在 (E16 删了)
- **建议**: 删 fn + 删 render() 内调用.

### 8.3 `enterZhihengMode` / `confirmZhiheng` 双僵尸

- `enterZhihengMode` (1278) — 无调用者. 被 `enterCardSkillMode('zhiheng')` 完全替代.
- `confirmZhiheng` (1318) — 无调用者. `zhihengConfirmBtn.click → confirmCardSkill` (line 2089).
- **建议**: 直接删 2 fn.

### 8.4 `handleHeroPickTabClick` 实质 no-op

- line 1712: 函数体 `if (side !== currentPickSide) return;` — 然后什么都不做.
- 调用站点: `heroPickPlayerTab.click` / `heroPickEnemyTab.click` (2296/2299) — tab 在非当前 side 时 `hidden = true`, 实际不可点.
- **建议**: 删 fn + 2 个 click 绑定. Tab 仅显示用.

### 8.5 选将 legacy `draftPicker` 系链 (4 元件)

PR-E11 顺序选将上线后被 `currentPickSide` + `pickStep` 替代, 但旧机制 4 元件未清:

- `draftPicker` (var, line 38) — 仅由 `assignRandomRoles` 写 + `confirmHeroPick` 推, 没读其行为, 只在 `updateDraftUI` 拼 badge 字串
- `confirmHeroPick` (fn, 1773) — 自描述 "保留 fn 以兼容旧绑定; 仅推进 draftPicker 标签"
- `confirmHeroPickBtn` (cache + 绑定 line 1982) — `<button hidden>` (index.html:133)
- `firstPickBadge` (cache + html badge index.html:130) — 文案 "主公先选 · 当前: 我方/敌方/双方已确认" 与 PR-E11 `heroPickPrompt` ("您是主公, 请选将") 信息重复
- **建议**: 删 var + fn + 按钮缓存 + 按钮 HTML + badge HTML + `updateDraftUI` 中相关行. `playerRoleBadge` / `enemyRoleBadge` 是否一并清留给 V2 决定 (它们与 `heroPickPrompt` 也部分重复).

### 8.6 各 `hideXxx` fn 中 `els.xxxHint.textContent = '默认提示'` 重置

- `hideTiesuoPanel` 不重置 (OK), `hideTargetZonePanel` 重置 (1044), `hideHuogongPanel` 重置 (1051/1052), `hideConversionPanel` 重置 (1066), `hideGuanxingPanel` 重置 (1127).
- 这些默认提示在面板 hidden 时也不可见 → 重置没意义. (轻量级 dead code; 不紧急)

### 8.7 `PENDING_MODAL_DISPATCH` 缺口

V8 任务的输入. 当前 16 项. 但下列面板 visible 时 `_firstVisibleDispatch` 返回 `null` → hand-confirm/cancel 失灵, 玩家被迫点面板内按钮:

- `fanjianPromptPanel` — 4 suit btn, 无 cancel
- `fankuiPromptPanel` — zone btn, 无 cancel
- `wuguPickPanel` — pick choice, 无 cancel/decline
- `guohePickPanel` — equipment/hand choice, 无 cancel/decline
- `dyingRescuePanel` — choice, 仅 `dyingRescueDeclineBtn` 注册为 cancel 走 staged 路径

(注: `cixiongChoosePanel` 有 `cixiongChooseDrawBtn` 但语义是 "另一选项" 不是 cancel — V8 需明确语义.)

**V8 输出**: 各面板补 confirm/cancel/decline 三按钮统一规则, dispatch 表覆盖全部 modal kind.

---

## 9. PR-E 注释碎片清单 (V2 注释整理目标)

按行号分组, 注释碎片含历史 PR 标签但描述的事件 (DOM 删 / 状态新增 / 用户反馈) 已成既定事实, 部分可压缩或删除.

### 9.1 历史删除事件 (≥ 6 处, 全部可删)

- line 47–48: `// newGameBtn / endTurnBtn 已删 (PR-E16 真删)`
- line 87–88: `// pauseBanner 已删 (HTML). renderPauseBanner 仍存在但 no-op`  
  → §8.2 一起清
- line 97–98: `// 一级 lobby (v9 PR-E18: 二级 splash 已删除)`
- line 103: `// titleCard 已从 HTML 删除 (含整个顶部 header), 缓存移出`
- line 351–352: `// .pause-banner DOM 已删, 该函数保留为 no-op` → §8.2 同上
- line 467–468: `// phase-prompt 横幅已删除 (用户反馈 "你的回合那个位置太碍眼")`
- line 1789–1795: `// 切到 setup 时 ... v9 PR-E18: splash 已删` / `endTurnBtn DOM 已删` / `titleCard 已删`
- line 1794–1795: `// endTurnBtn / newGameBtn DOM 已删` / `顶部 header 已删`
- line 1836: `// newGameBtn DOM 已删. v9 PR-E20: 顶部 header 已删`
- line 1976–1977: `// 删除 newGameBtn / endTurnBtn 监听 (DOM 已真删)`
- line 1985–1986: `// handDiscardBtn 替代 endTurnBtn`

**建议**: 当前注释承担了 "v9 PR-E 时间轴" 文档功能; V2 中可改为引一句 `// see docs/dev/dom-adapter-map.md`, 注释只留 WHY-not-obvious 信息.

### 9.2 用户反馈引文 (≥ 4 处, 价值高, 保留)

- line 31–35: `用户反馈"自动出牌阶段过得太快, 来不及反应" → 拆 actionDelay/phaseDelay 两档`
- line 197–198: `用户反馈: 之前只显主公不显反贼, 信息不对称`
- line 415–417: `用户反馈数字应在 "武将技能卡最右边往上一点"`
- line 467: `用户反馈"你的回合那个位置太碍眼"`
- line 2015–2017: `修旧 bug: modal 开着误点手牌 → 那张牌直接打出`

**建议**: 保留 — 表达了 WHY 决策.

### 9.3 自描述 legacy 注释 (≥ 3 处, 应随代码一起清)

- line 1773–1779 `// 旧 "确认当前选择" 按钮已 hidden (顺序选将自动确认). 保留 fn 以兼容旧绑定` → §8.5 清
- line 1714–1716 `// 顺序选将锁定 tab 切换 ... 这里是 defensive` → §8.4 清
- line 1513–1520 `// 出牌阶段的按钮点击不做任何事 ... 是 defensive` (luoshen 出牌阶段空 click 守卫) — 保留 (在用)

### 9.4 PR-A 系列残留注释 (v8 时代)

- line 80–81 `// v8 hotfix-2: 洛神 (luoshen-continue) 面板`
- line 575–583 `// v8 PR-A1: 通用 pendingChoice 牌按钮 — 统一模板`
- 各 pending 渲染分支前的 `// v8 PR-AN: ...` 注释 (line 717, 736, 778, 803, 815, 841, 856, 893, 918, 955)

**建议**: V2 可改写为 "// pending: <kind>" 一行, PR 标签去掉. 历史交给 git blame.

---

## 10. 子模块拆分建议

> 不在 V1 内执行. 给 V2 / V3 做形状参考.

当前 2409 行单文件. 候选拆分:

1. **`ui/dom-cache.js`** — `initElements` + `els` (~70 行)
2. **`ui/render-core.js`** — render() 编排 + `renderHero` / `renderHand` / `renderStatus` / `renderLog` / `renderZones` / `renderPhaseTrack` (~300 行)
3. **`ui/render-pending.js`** — `renderPendingChoice` + 11 个 kind 分支 (~400 行)
4. **`ui/modals/`** 目录, 每个二级面板 1 文件:
   - `tiesuo-panel.js` (show/hide/resolve)
   - `target-panel.js`
   - `huogong-panel.js`
   - `conversion-panel.js`
   - `guanxing-panel.js`
   - `skill-select-modal.js` (zhiheng/rende/fanjian/qingnang 共用)
5. **`ui/hand-dock.js`** — `_handConfirm`, `_handCancel`, `_shouldSelectFirst`, `PENDING_MODAL_DISPATCH`, `selectedHandCardId`, `stagedModalChoice`, 工具 (~150 行)
6. **`ui/hero-pick.js`** — 选将 PR-E11 (~200 行) + 入口屏 (`showLobby`/`showSetup`/`newGame`/drawer/exit-confirm)
7. **`ui/turn-driver.js`** — `enemyStep` + `maybeStartEnemyTurn` (~80 行)
8. **`ui/bind-events.js`** — `bindEvents` (~430 行) — 拆分对应到上述模块各自的 `init(els)` 内
9. **`ui/format.js`** — `escapeHtml` / `suitLabel` / `suitName` / `suitColorClass` / `suitRankBadge` / `promptCardChoice` / `hpMarkup` / `miniBacks` / SKILL_*_LABELS / `formatSkillCost` / `formatSkillTooltip` (~150 行)

依赖关系: cache → format → (render-core, render-pending, modals/) → hand-dock → bind-events → turn-driver.

**注意**: 当前是 `<script type="module">` inline 在 `index.html` 里 (line 1: `import {SanguoshaEngine} from '../engine/game-engine.js'`). 拆模块后仍可静态 import, GitHub Pages 静态托管不受影响.

**V2 不必一次拆完**. 优先级:
1. (V2) 删 §8.1–8.5 死代码; 9.1/9.3 注释碎片同步清.
2. (V3) 引入 `requestPlayerResponse(game, opts)` 时, 将 `renderPendingChoice` + dispatch + staged 抽出到 `render-pending.js` + `hand-dock.js`.
3. (V8) 拆 `bindEvents` 时同步抽 `modals/` 目录.

---

## 11. V2 准备 checklist

V2 (实际清债) 目标动作清单:

- [ ] 删 `.status-bar` HTML 整块 (index.html:179–185)
- [ ] 删 `layout.css` 内 `.status-bar*` 相关规则 (`.status-bar`, `__version`, `__score`, `__time`, line 270–313)
- [ ] 删 `els` cache 列表中 `statusBar`, `statusBarVersion`, `statusBarScore`, `statusBarTime` (line 89)
- [ ] 删 `renderStatusBar` fn + 在 render() 中的调用 (line 360 / 538)
- [ ] 删 `tickStatusBarTime` fn + `setInterval` 绑定 (line 367 / 1973)
- [ ] 删 `renderPauseBanner` fn + render() 调用 (line 353 / 537)
- [ ] 删 `enterZhihengMode` (line 1278)
- [ ] 删 `confirmZhiheng` (line 1318)
- [ ] 删 `handleHeroPickTabClick` fn + 2 click 绑定 (line 1712 / 2296 / 2299)
- [ ] 删 `draftPicker` var + `confirmHeroPick` fn + 其点击绑定 (line 38 / 1773 / 1982)
- [ ] 删 `confirmHeroPickBtn` HTML (`index.html:133`) + 缓存 (line 102)
- [ ] 删 `firstPickBadge` HTML (`index.html:130`) + 缓存 (line 102) + `updateDraftUI` 中相关行 (line 1759)
- [ ] 评估 `playerRoleBadge` / `enemyRoleBadge` 是否一并清 (UX 决定)
- [ ] 压缩 §9.1 历史删除注释 (12 处) → 一句 "see docs/dev/dom-adapter-map.md"
- [ ] 测试守护: 加 1 个 v10 PR-V2 守护测试 (源码 grep 确保以上 fn 名不再出现)
- [ ] 通跑 `node tests/run-all.mjs` 全绿

预估 V2 清债减行: ~150 行 (含 HTML + CSS + JS).

---

> 维护: V3 起每新增 modal kind, 在 §4 表 + §2 表追加一行.
> 完整 PR 路线见 `docs/plans/2026-05-28-sanguosha-v10-stabilize-and-expand.md`.
