# 三国杀 HTML 进阶升级重新安排

> **For Hermes:** 这份计划取代 `2026-04-28-sanguosha-advanced.md`。严格执行 TDD：每个阶段先写/拆测试，确认失败，再实现，再跑全套测试。不得在测试与浏览器冒烟通过前声明完成。

**Goal:** 把当前简化版 `index.html` 升级成可玩的 1v1 三国杀进阶版：官方风格回合阶段、标准+军争核心牌组、装备区/判定区、武将技能、面对面对局 UI（敌方在上、战场中央、玩家手牌在下）。

**Architecture:** 为避免再次“只写计划没落盘”，本次采用小步落地：每个阶段都必须修改 `index.html` 并通过对应测试。最终交付仍是单文件 HTML；测试继续从 `<script id="game-engine">` 抽取纯引擎运行，浏览器测试验证 UI 与 console。

**Tech Stack:** 单文件 HTML/CSS/Vanilla JS + Node.js `vm` 测试 + 本地 `python3 -m http.server` 浏览器冒烟。

---

## 当前事实基线

当前目录：`/Users/frankmei/.hermes/Workspace/sanguosha-html`

已确认：

```bash
node tests/game_engine.test.mjs
# PASS: 当前基础版 7 个测试通过

node tests/advanced_engine.test.mjs
# FAIL: CARD_CATALOG should be exposed
```

也就是说当前 `index.html` 仍是旧简化版，不包含：

- `CARD_CATALOG`
- `enemyBoard` / `centerArena` / `playerBoard` / `playerHandDock`
- 武将技能：咆哮、武圣、龙胆、制衡、苦肉、奸雄等
- 装备区 / 判定区 / 正式阶段流

---

## 非协商交付门槛

完成前必须全部满足：

1. `node tests/game_engine.test.mjs` 通过。
2. `node tests/advanced_engine.test.mjs` 通过。
3. 新增拆分测试全部通过：
   - `tests/catalog.test.mjs`
   - `tests/phases.test.mjs`
   - `tests/cards_equipment.test.mjs`
   - `tests/skills.test.mjs`
   - `tests/ui_layout.test.mjs`
4. 浏览器打开 `index.html` 无 JS console error。
5. UI 结构必须是：敌方上方、战场中央、玩家区/手牌下方。
6. 最终答复必须附上真实测试输出摘要；如果任何测试失败，不得称完成。

---

## 范围重新切分

### v2.1：先落 UI 骨架 + 引擎 catalog

**目标:** 马上能看到“面对面桌面”而不是旧左右布局，同时暴露 `CARD_CATALOG`、`HERO_CATALOG`、`makeTestCard`。

**必须包含:**

- 顶部敌方区：`#enemyBoard`
- 中央战场：`#centerArena`
- 下方玩家区：`#playerBoard`
- 最底玩家手牌 dock：`#playerHandDock`
- `Engine.CARD_CATALOG`
- `Engine.HERO_CATALOG`
- `Engine.makeTestCard(type, overrides)`
- 旧基础测试仍通过

**测试:**

- `tests/catalog.test.mjs`
- `tests/ui_layout.test.mjs`
- 现有 `tests/game_engine.test.mjs`

**验收:**

```bash
node tests/catalog.test.mjs
node tests/ui_layout.test.mjs
node tests/game_engine.test.mjs
```

---

### v2.2：正式阶段与区域系统

**目标:** 游戏从“点牌直接结算”升级为正式流程：准备/判定/摸牌/出牌/弃牌/结束。

**必须包含:**

- `game.phase` 支持：`prepare` / `judge` / `draw` / `play` / `discard` / `finish` / `gameover`
- `startTurn(game, actor)`
- `advancePhase(game)`
- `finishPlayPhase(game)`
- `discardExcess(game, actor, cardIds)`
- 手牌上限 = 当前体力，弃牌阶段自动/手动弃牌
- 区域：`hand`、`equipment`、`judgeArea`、`discard`、`deck`
- 判定区基础结算框架

**测试:**

- `tests/phases.test.mjs`
- `tests/advanced_engine.test.mjs` 中 phase/judge 相关测试

**验收:**

```bash
node tests/phases.test.mjs
node tests/advanced_engine.test.mjs
```

---

### v2.3：标准+军争核心牌组与卡牌结算

**目标:** 牌组从演示牌升级为标准+军争核心玩法。

**牌组范围:**

基本牌：

- 杀
- 火杀
- 雷杀
- 闪
- 桃
- 酒

普通锦囊：

- 无中生有
- 决斗
- 过河拆桥
- 顺手牵羊
- 借刀杀人
- 桃园结义
- 五谷丰登
- 南蛮入侵
- 万箭齐发
- 无懈可击
- 火攻
- 铁索连环

延时锦囊：

- 乐不思蜀
- 兵粮寸断
- 闪电

装备：

- 武器：诸葛连弩、青釭剑、雌雄双股剑、青龙偃月刀、丈八蛇矛、贯石斧、方天画戟、麒麟弓
- 防具：八卦阵、仁王盾、藤甲、白银狮子
- 坐骑：+1 马、-1 马

**规则范围:**

- 杀每回合一次，张飞/诸葛连弩例外
- 距离计算：基础 1，武器范围，+1/-1 马
- 防具结算：仁王盾挡黑杀、八卦阵红判定出闪、藤甲火焰增伤/普通杀无效、白银狮子减伤/失去回复
- 延时锦囊判定：乐不思蜀、兵粮寸断、闪电
- 无懈可击：先做可用牌响应框架，AI 自动响应

**测试:**

- `tests/cards_equipment.test.mjs`
- `tests/advanced_engine.test.mjs` 中 card/equipment/delayed trick 相关测试

**验收:**

```bash
node tests/cards_equipment.test.mjs
node tests/advanced_engine.test.mjs
```

---

### v2.4：经典武将技能

**目标:** 至少实现 10 个 1v1 可玩的经典技能，不再只是白板。

**第一批武将:**

- 张飞：咆哮 —— 出杀无限制
- 关羽：武圣 —— 红色牌当杀
- 赵云：龙胆 —— 杀/闪互转
- 孙权：制衡 —— 出牌阶段限一次，弃任意牌摸等量牌
- 黄盖：苦肉 —— 失去 1 体力摸 2 张牌
- 曹操：奸雄 —— 受到伤害后获得造成伤害的牌
- 马超：铁骑 —— 杀指定目标后判定，红色则目标不能闪
- 张辽：突袭 —— 摸牌阶段可少摸并从对方获得手牌
- 周瑜：英姿 —— 摸牌阶段额外摸 1 张
- 诸葛亮：空城 —— 无手牌时不能成为杀/决斗目标

**测试:**

- `tests/skills.test.mjs`
- `tests/advanced_engine.test.mjs` 中 skill 相关测试

**验收:**

```bash
node tests/skills.test.mjs
node tests/advanced_engine.test.mjs
```

---

### v2.5：AI 与交互完整化

**目标:** 从“电脑随便出牌”升级为能走完整阶段的 AI。

**必须包含:**

- AI 会按阶段行动：判定→摸牌→出牌→弃牌→结束
- AI 出牌优先级：回血 > 摸牌 > 装备 > 直接伤害 > 干扰 > 结束
- AI 会使用可用技能：苦肉、制衡、突袭、英姿、咆哮等
- 玩家按钮：开始新局、选择武将、结束出牌、弃牌确认、技能按钮
- 战报清晰显示阶段、判定牌、技能触发、伤害来源

**测试:**

- `tests/ai_flow.test.mjs`
- 浏览器冒烟

**验收:**

```bash
node tests/ai_flow.test.mjs
python3 -m http.server 8765
# browser open http://127.0.0.1:8765/index.html
# browser_console must show 0 JS errors
```

---

### v2.6：视觉精修与最终验收

**目标:** 界面看起来像桌游对局，而不是普通表单。

**必须包含:**

- 桌面背景、上下对阵、卡牌扇形/横向手牌区
- 武将牌大卡，势力色：魏/蜀/吴/群
- 装备区与判定区明确可见
- 当前阶段高亮
- 伤害/回血/判定动画或视觉反馈
- 移动端可用，但优先桌面体验

**最终验收命令:**

```bash
node tests/game_engine.test.mjs
node tests/catalog.test.mjs
node tests/phases.test.mjs
node tests/cards_equipment.test.mjs
node tests/skills.test.mjs
node tests/ai_flow.test.mjs
node tests/ui_layout.test.mjs
node tests/advanced_engine.test.mjs
```

浏览器验收：

```text
打开页面 → 新局 → 出杀 → 结束回合 → AI 行动 → 技能按钮可用 → console 无错误
```

---

## 执行顺序与防翻车机制

### 顺序

1. 先补测试，不直接动大 UI。
2. 每完成一个 v2.x 阶段，马上跑对应测试。
3. 每阶段都让 `index.html` 保持可打开可玩，不做半成品长期悬空。
4. 任何失败先修失败，不继续叠功能。
5. 最终只交付通过验收的 `index.html`。

### 防翻车机制

- 每次回复只报告真实完成项。
- 如果只完成测试，就说“测试已完成，功能未完成”。
- 如果某阶段失败，贴失败点，不说完成。
- 不再用“已实现/全通过”这类未经工具验证的话。

---

## 当前下一步

立即执行 v2.1：

1. 拆出 `tests/catalog.test.mjs` 和 `tests/ui_layout.test.mjs`。
2. 运行并确认失败。
3. 修改 `index.html`：加入 catalog、hero catalog、面对面 DOM 结构。
4. 跑：

```bash
node tests/catalog.test.mjs
node tests/ui_layout.test.mjs
node tests/game_engine.test.mjs
```

只有这三条都过，才报告 v2.1 完成。
