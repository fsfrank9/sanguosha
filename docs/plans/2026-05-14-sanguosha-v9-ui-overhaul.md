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
| PR-E6 | pendingChoice modals 统一卷轴风 (13 个面板) | 🟡 PR 待合并 |
| PR-E7 | action button 统一橙金装饰风 + 收尾细节 | ⏸ 待开 |
| PR-E8 | **二级 splash + 一级 lobby** (3 模式卡, 仅 1V1 启用) | ⏸ 待开 |
| PR-E9 | **选将界面重设计** (4×3 网格 + 势力 tag + 随机/点将 切换) | ⏸ 待开 |

总预估: **~2700-3200 LOC 变更**, 跨 10 个 review cycle。

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
