# 版本演进史

> 本文件收纳从 README 移出的历史细节。各版本的完整计划与执行记录见
> `docs/plans/` 对应文档；本文只保留"发生了什么"的浓缩档案。

## v4 — 安全拆源（已冻结）

v4.0 不是重写，而是分批"安全拆源"：保留根目录 `index.html` 作为可直接打开的
稳定产物，把 CSS、数据模块、引擎、UI 适配层逐步抽到 `src/`，用
`tools/build.mjs` 生成产物，用 `tests/architecture_build.test.mjs` 等防止源码
与产物漂移。

Phase 4A–4T 把 26 个已实现技能逐个迁入 `SkillRuntime` hook seam（每个 Phase
一个技能/一组技能，保持行为零漂移）：

| Phase | 技能 | seam |
|-------|------|------|
| 4A | 闭月 | `onTurnEnd` |
| 4B | 克己 | `onBeforeDiscardPhase` |
| 4C | 集智 | `onCardUse` |
| 4D | 英姿 | `onDrawPhase` |
| 4E | 突袭 | `onDrawPhase` |
| 4F | 咆哮 / 马术 | `hasPassiveEffect` / `sumPassiveEffect` |
| 4G | 空城 | `onCardTarget` |
| 4H | 铁骑 | `onNeedResponse` |
| 4I | 奸雄 | `onDamageAfter` |
| 4J | 武圣 / 龙胆 | `onCardAs` |
| 4K | 制衡 / 苦肉 / 仁德 / 反间 / 观星 | `onActiveSkill`（观星预览走 `onSkillPreview`） |
| 4L | 倾国 | `onCardAs`（响应转化） |
| 4M | 奇才 | `hasPassiveEffect('ignoreTrickDistance')` |
| 4N | 谦逊 | `onCardTarget` |
| 4O | 天妒 | `onJudgementAfterResolve` |
| 4P | 刚烈 | `onDamageAfter` + judgement finalizer |
| 4Q | 反馈 | `onDamageAfter` |
| 4R | 遗计 | `onDamageAfter`（逐点摸牌） |
| 4S | 裸衣 | `onDrawPhase` + `onDamageModify` |
| 4T | 鬼才 | `onJudgementBeforeResolve` |

详见 `docs/plans/2026-04-29-sanguosha-v4-architecture.md`。

## v5 — 原生 ES 模块 + GitHub Pages（已完成）

Phase 5A–5E 完成「单文件 IIFE + window globals → 原生 ES 模块 + GitHub Pages
静态托管」全量迁移。`dist/` 与单 HTML 产物不再维护，`src/` 即浏览器加载的
资产本身。详见 `docs/plans/2026-05-13-sanguosha-v5-architecture.md`。

## v6.0 — 数据驱动 + 暂停/恢复机制

- **结构化技能元数据**（`src/data/heroes.js` 的 `SKILL_METADATA`）：每个已实现
  技能各有 `{ trigger, frequency, optional, mandatory, cost, hooks }` 六字段，
  跨武将共享的同名技能（mashu / wusheng / longdan / biyue / paoxiao）自动保持
  一致；UI tooltip 从结构化字段派生。
- **结构化牌规则**（`src/data/cards.js` 的 `CARD_RULES`）：每张牌各有
  `{ summary, timing, targets, effect, frequency, responseWindow, engineHooks }`，
  自动 merge 到 `CARD_CATALOG[id].rule`。
- **官方规格 cache + audit harness**：
  `official-skill-cache/sanguosha-standard/official_standard_skill_cache.json`
  保存已实现技能的官方规格副本（带 sourceTextSha256）；
  `tests/v6_skill_audit.test.mjs` + `tests/skill_schema.test.mjs` +
  `tests/card_rules.test.mjs` 持续校验「cache ↔ specs fixture ↔ heroes.js ↔
  cards.js」四方一致。
- **装备被动效果注册表**（`src/engine/state.js` 的 `EQUIPMENT_EFFECTS`）。
- **玩家选择暂停/恢复机制**：`game.pendingChoice` + `game.pauseState` + 公开
  API `setSkillPreference` / `getSkillPreference` / `getPendingChoice` /
  `resolvePendingChoice`。
- **AI 主动技能感知**：AI 识别全部 5 个主动技 + 2 个出牌期转化（武圣/龙胆），
  其余被动/触发/锁定技通过引擎 hooks 自动生效。

## v6.1 — per-skill spec audit 修复链（7 个 PR）

v6.0 收尾后"逐字对照"官方 spec，发现 12 处真实 mismatch，7 个 PR 修完：

- **观星 #17**：预览张数 = min(存活角色数, 5, deck)；触发时机搬到准备阶段；
  `{ topIds, bottomIds }` 支持任意排序 + 顶/底独立分配。
- **鬼才 #18**：跨 actor 触发（任何判定都能干预）；非 pausable 判定回退 auto-fire。
- **反间 #19**：目标方真·猜花色；player UI 弹 4 花色选择；AI 盲随机。
- **反馈 #20**：玩家挑区域 + 具体牌。
- **刚烈 #21**：可选触发 / 来源选弃 2 vs 受 1 / 选哪两张 / 含装备可弃。
- **武圣+制衡+苦肉 #22**：装备区可作牌源；制衡可弃装备；苦肉 hp=1 允许。
- **突袭+遗计 #23**：突袭可不发动；遗计按伤害点数逐点处理。

累计基础设施：7 个 pendingChoice kinds、6 个 skillPreferences toggles、
3 个 "自己的牌 = hand + equipment" helpers（`findOwnCardById` /
`removeOwnCardFromAnyZone` / `firstMatchingOwnCard`）、判定 `pausable` flag、
多点伤害逐点处理、60 条新 behavior 测试。
详见 `docs/plans/2026-05-13-sanguosha-v6-logic-correctness.md`。

## v7 — 牌规则合规（16 个 PR #27–#42）

杀/闪响应窗口、桃/酒限制、距离与范围、即时/延时锦囊交互、装备特效
（青釭/诸葛连弩/方天/麒麟/古锭/雌雄/寒冰/朱雀）、濒死流程。
详见 `docs/plans/2026-05-14-sanguosha-v7-card-rule-compliance.md`。

## v8 — UI 集成 + 标准包技能扩充

补齐大乔【国色】【流离】、华佗【急救】【青囊】、甄姬【洛神】
（已实现技能 26 → 31）；AI 评估 1-ply lookahead + 威胁感知。
详见 `docs/plans/2026-05-14-sanguosha-v8-ui-integration.md`。

## v9 — UI 全面改版

布局重构、cream 卷轴风、modal/响应两步式、CSS 拆分为 10 个文件。
详见 `docs/plans/2026-05-14-sanguosha-v9-ui-overhaul.md`。

## v10 — 稳定化与扩展

响应窗口框架（无懈/万箭/银月/决斗杀统一暂停/恢复）、dispatch 注册表、
card-as 一致性。详见 `docs/plans/2026-05-28-sanguosha-v10-stabilize-and-expand.md`。

## 一轮审计修复（post-v10，PR #105–#113）

逐条对照 `official-skill-cache/gltjk-sanguosha-rules` 的全方位审计：

- **濒死流程 (#105)**：体力值可降至负数；同一响应者可连续出多张【桃】/【酒】
  直到回复至 1 点。
- **无懈可击覆盖 (#106)**：无中生有 / 南蛮入侵 / 万箭齐发 / 延时锦囊放置补齐
  无懈窗口。
- **八卦阵对万箭 (#107)**：万箭的【闪】响应补八卦红判定兜底。
- **朱雀羽扇 (#108)**：转火杀改为「本次使用」的临时视为，弃置时还原物理牌身份。

审计纪要见 `docs/audit/2026-06-09-code-audit-and-remediation.md`。

## 二轮审计修复（PR #115–#123）

第二轮独立代码审计后的修复，按批次拆 PR：

- **丈八蛇矛牌守恒 (#115)**：虚拟【杀】不再凭空进弃牌堆；奸雄改为获得组成
  实体牌；朱雀临时火杀入手前还原身份。
- **暂停/恢复架构闭环 (#116)**：pendingChoice FIFO 队列化；判定阶段濒死冻结
  回合流程；挂起时冻结全部公开入口。
- **伤害后时机 (#117)**：奸雄/反馈/刚烈/遗计移到濒死结算之后；死亡后技能
  不再触发。
- **铁索连环传导 (#118)**：横置角色受属性伤害解除连环并传导等量同属性伤害。
- **白银狮子 + 判定区归属 (#119)**：任何失去白银狮子的路径都回血；寒冰剑/反馈
  不再把判定区牌当作角色的牌。
- **牌规则杂项 (#120)**：五谷逐张亮出按需洗牌；贯石斧可选发动且成本可含装备；
  火攻展示牌由目标选择；奸雄可获得决斗/南蛮/万箭/火攻实体牌；国色转化乐走
  无懈链；discardExcess 事务化。
- **文档与工程卫生 (#121)**：README 数字、版本标记、Node 下限、CI 双跑、
  Pages 产物瘦身。
- **UI 面板补全 (#122)**：贯石斧自选两张 + 火攻展示牌自选面板，UI 对局默认 ask。
- **UI 行为测试基建 (#123)**：零依赖 fake-DOM 垫片 + dom-adapter 首批 8 条
  全链路行为测试。

## 已实现技能引擎接入说明（31 个）

主动/交互技能（7 个）：孙权【制衡】、黄盖【苦肉】、刘备【仁德】、周瑜【反间】、
诸葛亮【观星】、华佗【青囊】、甄姬【洛神】。

转化/被动/自动技能：

- 【闭月】：貂蝉结束阶段摸 1 张牌；`endTurn` 与阶段推进路径都触发。
- 【克己】：本回合未使用/打出/响应过【杀】时跳过弃牌阶段。
- 【集智】：成功使用普通锦囊后摸 1 张；响应【无懈可击】成功抵消也触发；
  非法使用、非普通锦囊、铁索重铸不触发。
- 【英姿】：摸牌阶段额外摸 1 张（`onDrawPhase` seam）。
- 【突袭】：对手有手牌时获得 1 张并少摸 1 张。
- 【咆哮】/【马术】：无限【杀】与出距 -1，走被动效果 seam。
- 【空城】：无手牌时不能成为【杀】/【决斗】目标。
- 【铁骑】：杀指定目标后判定，红色令目标不能打出【闪】。
- 【奸雄】：获得造成伤害的实体牌（含决斗/南蛮/万箭/火攻；虚拟合成牌取组成
  实体牌；在濒死结算之后触发）。
- 【武圣】/【龙胆】：红牌当杀 / 杀闪互转，含装备区牌源与响应窗口。
- 【倾国】：无真实【闪】时黑色手牌当【闪】响应。
- 【奇才】：使用距离受限锦囊时忽略距离限制。
- 【谦逊】：不能成为【顺手牵羊】/【乐不思蜀】目标。
- 【天妒】：自己的判定牌结算后获得之。
- 【刚烈】：受伤后判定，非红桃时来源弃两张（可含装备）或受 1 伤；在濒死
  结算之后触发（死亡不触发）。
- 【反馈】：受伤后从来源手牌/装备区获得一张牌（判定区牌不可获得）。
- 【遗计】：每受 1 点伤害摸两张，按点逐点 prompt 分配。
- 【裸衣】：摸牌少 1，本回合【杀】/【决斗】伤害 +1。
- 【鬼才】：判定牌生效前可用手牌替换（跨 actor）。
- 【国色】：方片当【乐不思蜀】（走 delayed-place 无懈链）。
- 【流离】/【急救】：见 v8 计划文档。
