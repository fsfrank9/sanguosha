# v8 — UI 集成 + 装备扩展 + 技能扩充 + AI 进阶

> 历史延续：本文档承接 `2026-05-14-sanguosha-v7-card-rule-compliance.md`。v7 把 gltjk 镜像里所有已实现牌/规则的 spec 偏差都修完了（16 PR / 116 测试）；v8 重心从"引擎合规"转向"玩家可感知" + "卡池/技能扩充"。

## 缘起

v7 把所有 spec 引擎逻辑写好了，但有两个客观存在的问题：

1. **玩家在浏览器里感受不到大半工作量**。v7 引入 7 个新 pendingChoice + 3 个 pauseState 槽位 + 8 个 skillPreferences 切换键，引擎 API 全跑通，但 `dom-adapter.js` 完全没接面板。所有 v7 的"完整 spec 合规"目前**只能通过 `resolvePendingChoice({...})` 代码路径触发**。
2. **卡牌面没花色 / 点数**。引擎一直有 `card.suit / card.rank / card.color`（火攻 / 倾国 / 武圣 / 闪电 判定 都依赖），但 UI 牌面只渲染 `name + label + desc + symbol`，玩家看不到花色 / 点数——所有"按花色 / 颜色"的决策都瞎做。**这是方向 1 的硬依赖**，已先于方向 1 落地（PR-0）。

## 候选方向（按"用户感知 × 工作量"投入产出比排序）

### 0. 牌面 suit + rank 可视化（**已落地 — PR #44**）

引擎一直有 `card.suit / card.rank / card.color`，但 UI 牌面只渲染 `name + label + desc + symbol`，玩家看不到花色 / 点数。

**落地内容（v8 PR-0 / PR #44）**：
- `dom-adapter.js`：新增 `suitColorClass(suit)` / `suitRankBadge(card)` helper；`renderCard`（玩家手牌）右上角渲染 `♠/♥/♣/♦ + RANK`；`zoneCards`（装备区 / 判定区）名字后加 `mini-card-suit` 标记
- `main.css`：新增 `.card-corner`（右上角定位 + 阴影）/ `.suit-red`（heart/diamond 红色）/ `.suit-black`（spade/club 浅色）/ `.mini-card-suit`
- 对手手牌仍走 `miniBacks`（隐私保护，spec 要求手牌私有）
- `tests/card_face_suit_rank.test.mjs`（7 条断言）覆盖 helper / 渲染调用 / CSS 类 / 红黑颜色 / 对手隐私

这是方向 1（pendingChoice 面板）的硬依赖：面板里展示对手手牌内容（如过河 1V1 / 火攻展示牌）必须能看到 suit。

### 1. UI 接 v7 新 pendingChoice 面板（**最高优先级 / 推荐起点**）

v7 引入 7 个新 pendingChoice，引擎 API 全跑通但 `dom-adapter.js` 没接面板。

| pendingChoice 类型 | 触发场景 | UI 需要展示 |
|---|---|---|
| `qilin-pick` | 装备麒麟弓 + 杀命中 + 对手有 2 匹马 | 列出 horseMinus / horsePlus，让 source 二选一或取消 |
| `cixiong-fire` | 装备雌雄双股剑 + 异性目标杀指定后 | 询问 source 是否发动雌雄 |
| `cixiong-choose` | 雌雄发动后 | 询问目标弃手牌 (展示手牌) 或令 source 摸 1 |
| `jiedao-decision` | 借刀杀人对玩家 | 询问 player 是否用 杀；展示当前手牌中的 杀 |
| `wugu-pick` | 五谷丰登 reveal 后 | 列出已亮出的 X 张牌，让 player 挑 1 张 |
| `guohe-1v1-pick` | 过河拆桥 1V1 | 展示装备列表 + 对手手牌内容，二选一 + 选具体牌 |
| `dying-rescue` | 玩家或 AI 进入濒死 | 列出可用 桃/酒，让 player 救援或放弃 |

**suggested PR cuts**：
- v8 PR-A1：通用 pendingChoice 面板框架（共用样式 / overlay / 关闭逻辑）
- v8 PR-A2：qilin-pick + dying-rescue 面板（最容易被玩家触发）
- v8 PR-A3：cixiong-fire / cixiong-choose 面板（双层）
- v8 PR-A4：jiedao-decision + guohe-1v1-pick 面板（手牌内容展示）
- v8 PR-A5：wugu-pick 面板（reveal 池）

每个 PR 配 `visual_polish` 风格的 HTML 断言测试。

### 2. 装备扩展（中优先级）

gltjk `card__equipment.md` 列了 16 件武器/防具/坐骑/宝物；我们目前实现了 8 件，剩下 8 件全部缺：

| 装备 | 类型 | 攻击范围 | 技能描述 | 实现难度 |
|---|---|---|---|---|
| 寒冰剑 | 武器 | 2 | 杀命中目标造成伤害时，若其有牌，可防止此伤害并依次弃其两张牌 | 中（中断 damage 流程） |
| 古锭刀 | 武器 | 2 | 锁定技：杀命中目标无手牌时，伤害 +1 | 低（damage modify hook） |
| 朱雀羽扇 | 武器 | 4 | 可将普通杀当火杀使用 / 视为使用杀改为视为使用火杀 | 中（card-as 转化） |
| 银月枪 | 武器 | 3 | 回合外使用/打出黑色手牌时，可令攻击范围内一名角色面对 闪 检测 → 1dmg | 高（事件 hook） |
| 吴六剑 | 武器 | 2 | 锁定技：同势力角色攻击范围 +1 | 1v1 无效（势力概念） |
| 三尖两刃刀 | 武器 | 3 | 杀命中后，可弃 1 手牌选距离 1 内另一角色 1dmg | 1v1 无效（多目标） |
| 飞龙夺凤 | 武器 | 2 | 国战专属 | 跳过 |
| 太平要术 | 防具 | — | 国战专属 | 跳过 |
| 木牛流马 | 宝物 | — | 移出手牌当"粮"放入装备区 | 高（新装备槽） |

**suggested PR cuts**：
- v8 PR-B1：寒冰剑（防止 + 双弃，参考 cixiong-pick 模式）
- v8 PR-B2：古锭刀（damage modify hook 简单）
- v8 PR-B3：朱雀羽扇（普通杀 → 火杀转化）
- v8 PR-B4：银月枪（回合外触发 hook）

1V1 无效的（吴六剑 / 三尖 / 飞龙 / 太平 / 木牛）先跳过或仅占位。

### 3. 未实现的标准包技能（中长期）

v6 plan 列了 17 个尚未接入的标准包技能（cache 完整但引擎没实现）：
**激将 / 酒援 / 奇袭 / 国色 / 流离 / 连营 / 护驾 / 洛神 / 急救 / 青囊 / 巨象 / 烈刃 / 好施 / 缔盟 / 英魂 / 化身 / 新生**

每个 1 PR，模仿 v6 phase 6B/6C 的 SkillRuntime hook + skill metadata 模式。

**优先建议**：
- 国色 / 流离 / 急救 / 青囊 / 洛神 在 1v1 中实用度高（参与 sha / 桃 / 判定 链）→ 先做
- 激将 / 护驾 在 1v1 需要主公技或多人模式才有意义 → 缓做
- 化身 / 烈刃 / 巨象 涉及新机制（角色变换、拼点、连环）→ 按需

### 4. AI 进阶（横切优化）

当前 AI 默认 `auto` 走启发式分支；v7 的新 toggles（qilin / cixiong / jiedao / guohe / dying / etc.）AI 都用最保守的简单策略。

可以加：
- **濒死 valuation**：AI 把"留 1 桃自救"看作显著价值，避免在还有桃时盲目交换
- **借刀决策**：被借刀时如果"出杀+保武器"比"交武器"更有利就出杀；现在直接 `auto` 出杀
- **雌雄目标决策**：target 是 player 还是 AI 时差异化（AI 通常该选"令 source 摸 1"减少自己手牌损失）
- **expectimax 1-2 ply**：对仁德/反间/观星这类有显著状态变化的主动技用浅前瞻

### 5. 多人模式 / 国战扩展（远期 / v9+）

v5 架构是 1v1 hardcoded (`game.player` / `game.enemy`)。3+ 人需要一次性大重构：
- `game.actors = ['p1', 'p2', 'p3', ...]` 列表化
- `opponent()` 替换为 `nextActor()` / `prevActor()` / `allOthers()` 语义
- 距离 / 攻击范围按座次计算
- 身份系统（主公 / 忠臣 / 反贼 / 内奸）
- 触发顺序（多名角色同时触发同一 hook 的逆时针顺序）
- 濒死 spec 中 "嵌套循环" 和 "多名角色同时响应" 才有意义

这是 v9 级别的项目，建议在 v8 各方向落地后再启动。

---

## v8 推荐起点

按"用户感知 ÷ 工作量"投入产出比，建议先做 **方向 1（UI 集成）**——v7 已经把所有 spec-compliant 引擎逻辑写好，UI 是把这些价值翻译给玩家的最后一公里。每个 panel PR ≈ 100-200 行 dom-adapter 改动 + 一个 visual 测试，节奏快、效果立刻可见。

UI 接完后再选：
- 想继续做"卡池扩充感"→ **方向 2 装备**
- 想做"武将多样性"→ **方向 3 技能**
- 想"对战不那么僵硬"→ **方向 4 AI**

---

## 落地 PR 时间线

| PR | 范围 | 状态 |
|---|---|---|
| PR-0 | 牌面 suit + rank 可视化 (方向 0) | 🟢 PR #44 已合并 |
| PR-A1 | 通用 pendingChoice 面板框架 (方向 1 基础) | 🟢 PR #46 已合并 |
| PR-A2 | qilin-pick + dying-rescue 面板 | 🟢 PR #47 已合并 |
| PR-A3 | cixiong-fire + cixiong-choose 面板（双层） | 🟢 PR #48 已合并 |
| PR-A4 | jiedao-decision + guohe-1v1-pick 面板 | 🟢 PR #49 已合并 |
| PR-A5 | wugu-pick 面板（方向 1 收尾） | 🟢 PR #50 已合并 |
| PR-B1 | 寒冰剑（防止伤害 + 双弃牌） | 🟢 PR #51 已合并 |
| PR-B2 | 古锭刀（锁定技，无手牌伤害 +1） | 🟡 PR 待合并 |
| _其余_ | _v8 PR-B3..B4 + 方向 3/4_ | _按顺序推进_ |

### PR-B2 落地 — 古锭刀

v8 方向 2 第二件装备：**古锭刀**（军争）。

**spec**（gltjk `card__equipment.md`）：

> 攻击范围：2  
> 技能：锁定技，每当你使用【杀】对目标角色造成伤害时，若其没有手牌，你令伤害值 +1。

**改动**：

数据层：
- `cards.js` CARD_CATALOG：新增 `guding: { name:'古锭刀', range:2, ... }`
- `cards.js` CARD_RULES：summary / effect / engineHooks 完整 spec 引用
- `state.js` EQUIPMENT_EFFECTS：`guding: { gudingNoHandPlus1: true }` marker

引擎层：
- `damage()` 函数在 tengjia 检查后、baiyin 检查前，若 `amount > 0 && isShaCard(sourceCard)` 且 source 装古锭刀 + target.hand.length === 0 → `amount += 1`
- **锁定技** — 强制触发，无 `skillPreferences` 开关
- 时序选择：放在 baiyin 之前，使得"古锭刀 + 白银"互动按 spec 正确（2 点 → 被 baiyin clamp 回 1 点）

**新增** `tests/guding_no_hand_plus1.test.mjs`（8 条断言）：
- 目标无手牌 → 2 dmg
- 目标有手牌 → 1 dmg
- 古锭刀 + 白银狮子 → clamp 回 1 dmg
- 装备区有牌但 hand=0 → 触发（spec 仅看 hand）
- 判定区有牌但 hand=0 → 触发
- 非杀类伤害（闪电）→ 不触发
- 锁定技 — `skillPreferences.guding='decline'` 不起作用
- 非古锭刀武器 → 不触发

### PR-B1 落地 — 寒冰剑

v8 方向 2 启动。第一件新装备：寒冰剑（EX/1V1/3V3/国-标）。

**spec**（gltjk `card__equipment.md`）：

> 攻击范围：2
> 技能：每当你使用【杀】对目标角色造成伤害时，若其有牌，你可以防止此伤害，依次弃置其两张牌。

**改动**：

数据层：
- `cards.js` CARD_CATALOG：新增 `hanbing: { name:'寒冰剑', family:'equipment', slot:'weapon', range:2, ... }`
- `cards.js` CARD_RULES：summary / effect / engineHooks 完整 spec 引用
- `state.js` EQUIPMENT_EFFECTS：加 `hanbing: { hanbingPreventOnHit: true }` marker

引擎层：
- `damage()` 函数在 baiyin 检查后、hp 扣减前，若 `amount > 0 && isShaCard(sourceCard)`，调 `applyHanbingPrevent(sourceActor, targetActor)`
- 新增 `applyHanbingPrevent`：
  - 检测 source 装寒冰 + target 任意区域有牌
  - 按 `source.skillPreferences.hanbing`（`auto` 默认 / `decline`）决定
  - `auto` 路径：按 装备 > 判定区 > 手牌 优先级弃 2 张（或目标牌总数不足 2 张时全弃）
  - 返回 `{prevented:true, discarded:N}` → damage() 弃 sourceCard 并 `return false`

**注**：spec 中 "你可以" 暗示 source 可选；本 PR 暂用 auto-fire-only 模型（player 默认 = auto，开 `decline` 可禁用）。UI ask 面板 = future PR-B1-bis（pause-during-damage 的 pendingChoice 是较大改造，先不做）。

**新增** `tests/hanbing_prevent.test.mjs`（8 条断言）：
- 3 手牌 → 弃前 2 张, hp 不变
- 装备 2 件 → 优先弃 2 件装备, 手牌保留
- 装备 1 + 手牌 1 → 各弃 1
- 判定区 1 + 手牌 1 → 各弃 1（无装备）
- 目标完全无牌 → 不触发，受 1 dmg
- `skillPreferences.hanbing='decline'` → 不触发，受 1 dmg
- 非寒冰武器（青釭） → 不触发
- catalog 已注册的占位

### PR-A5 落地 — wugu-pick 面板（方向 1 收尾）

**pending = `{kind, actor:picker, sourceActor, cards:[{id,name,suit,color,rank},...]}`**

- 触发：五谷丰登发动后，按 [actor, opponent] 顺序选 pool 中剩余的 1 张；多张时 `skillPreferences.wugu === 'ask'`（player 默认）会暂停
- 文案区分自己用五谷（`你亮出 X 张牌...`）vs 对手用五谷（`<对方名>亮出 X 张牌...`）
- choices：pool 中每张牌一个 `promptCardChoice`，`dataAttrs wuguCardId` → `resolvePendingChoice({cardId})`
- **无 decline 按钮** — spec 规定必须挑一张（选完所有 picker 后剩余的 pool 入弃牌堆）

**改动**：
- `index.html`：新增 `#wuguPickPanel`（hint + choices）
- `dom-adapter.js`：`els` 新增 3 个 id；`renderPendingChoice` 增 wugu-pick 分支；事件绑定 1 个 delegated click handler

**新增** `tests/pending_prompt_panels_a5.test.mjs`（8 条断言）：HTML 容器 / 框架类 / els 缓存 / render 分支 / 自/敌方 source 文案差异 / dataAttrs / click → `{cardId}` / 无 decline 按钮。

---

## 方向 1 完整收尾汇总（v8 PR-A1..A5）

v8 方向 1 完成。v7 引擎里的 7 个新 pendingChoice 全部接入浏览器 UI：

| pendingChoice | UI 面板 | PR |
|---|---|---|
| `qilin-pick` | `#qilinPickPanel` (选弃哪匹马) | PR-A2 |
| `dying-rescue` | `#dyingRescuePanel` (选桃/酒救援) | PR-A2 |
| `cixiong-fire` | `#cixiongFirePanel` (是否发动) | PR-A3 |
| `cixiong-choose` | `#cixiongChoosePanel` (弃手牌/源摸 1) | PR-A3 |
| `jiedao-decision` | `#jiedaoDecisionPanel` (出杀/交武器) | PR-A4 |
| `guohe-1v1-pick` | `#guohePickPanel` (装备区 + 手牌内容) | PR-A4 |
| `wugu-pick` | `#wuguPickPanel` (reveal pool) | PR-A5 |

**累计基础设施**：
- 通用 CSS 框架（PR-A1）：`.pending-prompt-panel` / `__hint` / `__choices` / `__actions` + `.prompt-card-choice` 含 hover/selected/:disabled
- 通用 helper `promptCardChoice(card, opts)` — 统一牌按钮生成（PR-A1）
- 7 个新 panel 元素 + 22 个新 els cache id + 11 个新 click handler
- 旧 6 个 v6.1 面板（guicai/yiji/fanjian/fankui/ganglie-fire/ganglie-source）追加新框架类
- helper `actorDisplayName(actor)` 用于面板文案（直接显示英雄名，区别于战报的"我方/对方"措辞）

**测试增量（方向 1）**：

| 文件 | 断言数 | PR |
|---|---:|---|
| `tests/pending_prompt_framework.test.mjs` | 9 | A1 |
| `tests/pending_prompt_panels_a2.test.mjs` | 14 | A2 |
| `tests/pending_prompt_panels_a3.test.mjs` | 13 | A3 |
| `tests/pending_prompt_panels_a4.test.mjs` | 13 | A4 |
| `tests/pending_prompt_panels_a5.test.mjs` | 8 | A5 |
| 方向 1 小计 | **57 条** | |

**下一步**：方向 2（装备扩展：寒冰剑 / 古锭刀 / 朱雀羽扇 / 银月枪）或方向 3（标准包技能：国色 / 流离 / 急救 / 青囊 / 洛神）。

### PR-A4 落地 — jiedao-decision + guohe-1v1-pick 面板

把 v7 引擎里两个"手牌内容展示"型 pendingChoice 接入 UI。

**jiedao-decision**（pending = `{kind, actor:opponentActor, sourceActor}`）：
- 文案展示 source 名 + 玩家手中可用 杀 / 火杀 / 雷杀 的张数（从 `game.player.hand` 现查）
- 2 个按钮：`出杀` → `{fire:true}` / `不出，交武器` → `{decline:true}`
- spec 提示：不交武器就要出杀；出杀后引擎走标准 sha 流程

**guohe-1v1-pick**（pending = `{kind, actor:sourceActor, target, equipment:[...], hand:[...]}`）：
- 双区域 choices：装备区列表 + 手牌列表（spec 选项 2 "观看目标角色的手牌"，pending 中已暴露完整手牌内容）
- 每张牌一个 `promptCardChoice`，`dataAttrs guoheZone='equipment'|'hand'` + `guoheCardId`
- 共享 `handleGuohePickClick` handler，两容器绑同一函数 → `{zone, cardId}`
- 文案说明 `观看后弃` 语义对应 spec

**改动**：
- `index.html`：新增 `#jiedaoDecisionPanel`（hint + 2 btn）+ `#guohePickPanel`（hint + equipment 列表 + hand 列表）
- `dom-adapter.js`：`els` 缓存新增 8 个 id；`renderPendingChoice` 增 2 个分支；事件绑定增 4 个监听器（fire/decline + 共享 click handler）

**新增** `tests/pending_prompt_panels_a4.test.mjs`（13 条断言）：HTML 容器 / 框架类 / els 缓存 / 2 个 render 分支 / 文案关键字 / 共享 handler / `{zone, cardId}` payload。

### PR-A3 落地 — cixiong-fire + cixiong-choose 面板（双层）

雌雄双股剑触发时两个 pendingChoice 都接入 UI，串成完整双层交互流程。

**cixiong-fire**（pending = `{kind, actor:sourceActor, target}`）：
- 文案：`雌雄双股剑：对<对方>（异性）发动效果？目标二选一：弃 1 手牌 / 令你摸 1 张。`
- 2 个按钮：`发动` → `{fire:true}` / `不发动` → `{decline:true}`

**cixiong-choose**（pending = `{kind, actor:targetActor, sourceActor, handIds}`）：
- 文案：`雌雄双股剑：<source 名>发动，弃 1 张手牌或令其摸 1 张。`
- choices：手牌中每张牌一个 `promptCardChoice`，`dataAttrs cixiongDiscardCardId` → `{option:'discard', cardId}`
- actions：`令对方摸 1 张` 按钮 → `{option:'draw'}`

**双层串接**：source 选 fire → 引擎自动进 target 选 → 玩家选 discard/draw → 引擎续算 sha 流程（仁王/响应/八卦/贯石/青龙/伤害）。两个面板之间不需要额外编排，由 `pauseState.playSha` + `resolvePendingChoice` dispatch 接力。

**改动**：
- `index.html`：新增 `#cixiongFirePanel` + `#cixiongChoosePanel`，用 PR-A1 通用框架类
- `dom-adapter.js`：`els` 缓存新增 8 个 id；`renderPendingChoice` 增 2 个分支；事件绑定增 4 个监听器

**新增** `tests/pending_prompt_panels_a3.test.mjs`（13 条断言）：HTML 容器 / 框架类 / els 缓存 / 2 个 render 分支 / 文案关键字 / promptCardChoice 用法 / 4 个事件绑定 payload。

### PR-A2 落地 — qilin-pick + dying-rescue 面板

把 v7 引擎里两个最常被玩家触发的 pendingChoice 接到浏览器 UI 上，用 PR-A1 的通用框架与 helper。

**qilin-pick**（pending = `{kind, actor, target, horseSlots:[...]}`）：
- 文案：`麒麟弓：<对方名> 装备区有 2 匹坐骑，选一匹弃置（spec：一张），或不发动`
- choices：每匹坐骑一个 `promptCardChoice`，prefix 标 `+1 马` / `-1 马`，dataAttrs `qilinSlot`
- actions：`不发动` 按钮 → `resolvePendingChoice({decline:true})`

**dying-rescue**（pending = `{kind, actor, dyingActor, taoIds, jiuIds}`）：
- 文案根据 `actor === dyingActor` 区分自救 vs 救他人
- choices：从 responder 手牌中按 taoIds + jiuIds 渲染，suffix 标 ` · 桃` / ` · 酒Ⅱ`，dataAttrs `dyingRescueCardId`
- actions：`不救援` 按钮 → `resolvePendingChoice({decline:true})`

**改动**：
- `index.html`：新增 `#qilinPickPanel` + `#dyingRescuePanel`（含 hint / choices / decline 子元素），用 PR-A1 通用框架类
- `dom-adapter.js`：`els` 缓存新增 8 个 id；`renderPendingChoice` 末尾增 2 个分支；事件绑定增 4 个监听器
- 新增 helper `actorDisplayName(actor)` 用于面板文案（区别于 `actorName()` 的"我方/对方"措辞）

**新增** `tests/pending_prompt_panels_a2.test.mjs`（14 条断言）：HTML 容器 / 框架类 / els 缓存 / render 分支 / 文案差异 / suffix 标识 / 4 个事件绑定 payload 正确。

### PR-A1 落地 — 通用 pendingChoice 面板框架

为方向 1 后续 4 个面板 PR (A2..A5) 立 foundation。引入共享 CSS / HTML / JS 模板，避免给 7 个新 pendingChoice 类型各自硬编码 7 套 markup。

**改动**：
- `main.css`：新增 `.pending-prompt-panel` (容器) / `.__hint` (顶部提示) / `.__choices` (牌列表) / `.__actions` (按钮行) / `.prompt-card-choice` (统一牌按钮，含 `hover` / `selected` / `:disabled` 状态)
- `dom-adapter.js`：新增 `promptCardChoice(card, opts)` helper — 接受 `{dataAttrs, title, selected, prefix, suffix, extraClass, disabled}`；输出 `<button class="mini-card prompt-card-choice [extraClass] [selected]" data-...>[prefix]【name】♠ 5[suffix]</button>`
- `dom-adapter.js`：重构 guicai 候选 + fankui 装备/判定区项目用上 `promptCardChoice`（保留旧 per-kind 类 `guicai-candidate` / `fankui-zone-btn` 作向后兼容，事件 binding 不变）
- `index.html`：6 个既有 `*PromptPanel` 容器追加 `pending-prompt-panel` 类；6 个 `*PromptHint` 追加 `pending-prompt-panel__hint` 类；4 个 choices 容器（guicaiCandidates / yijiCandidates / fankuiZones / ganglieSourceCandidates）追加 `pending-prompt-panel__choices` 类

**新增** `tests/pending_prompt_framework.test.mjs`（9 条断言）：CSS 四件套 + 状态类 / helper 存在 + 选项完整 / guicai 已迁移 / fankui 已迁移 / 6 容器追加新类 / 6 hint 追加新类 / 4 choices 追加新类。

下一步 PR-A2 (qilin-pick + dying-rescue) 直接复用这套样式 + helper，预计每个新面板 ≈ 50-80 行 dom-adapter 代码。

## 测试增量

| 文件 | 断言数 | PR |
|---|---:|---|
| `tests/card_face_suit_rank.test.mjs` | 7 | PR-0 |
| `tests/pending_prompt_framework.test.mjs` | 9 | PR-A1 |
| `tests/pending_prompt_panels_a2.test.mjs` | 14 | PR-A2 |
| `tests/pending_prompt_panels_a3.test.mjs` | 13 | PR-A3 |
| `tests/pending_prompt_panels_a4.test.mjs` | 13 | PR-A4 |
| `tests/pending_prompt_panels_a5.test.mjs` | 8 | PR-A5 |
| _方向 1 小计_ | **57** | A1..A5 |
| `tests/hanbing_prevent.test.mjs` | 8 | PR-B1 |
| `tests/guding_no_hand_plus1.test.mjs` | 8 | PR-B2 |
| _其余 PR 待开_ | — | — |
