# v11 方向: 守恒硬化 + 技能批量接入 + 单体拆分

**日期**: 2026-06-09
**起点**: v10 + 两轮审计修复完成 (PR #105–#113, #115–#123 全部已合并)
**当前状态**: 1057 断言 ✓, `npm run verify` 通过, 引擎规则层两轮审计后无已知胜负级偏差

## 缘起

二轮审计 (PR #115–#123) 把规则正确性修到当前可知的上限, 同时留下三个明确的
结构性观察:

1. **"牌移动"仍无统一出口** — 丈八造牌 (H1)、白银旁路 (M2)、奸雄拿火杀 (M5)
   本质都是"牌离开某区域"没走单一受控函数。这轮用点对点修复 + 局部守恒测试
   兜住了, 但每新增一个"获得/弃置/转移"路径都可能再开一个洞。需要把
   `tests/card_conservation.test.mjs` 的 `countAllCards` 升级为**全局回归
   断言**, 并收敛 `moveCard` 原语。

2. **UI 行为测试刚起步** — #123 落地了 fake-DOM 垫片 + 8 条全链路测试, 但
   2600 行 dom-adapter 还有约 20 个面板只有"源码正则"断言 (观星/反间/反馈/
   五谷/过河/借刀/雌雄/鬼才/遗计/洛神/无懈/决斗...)。垫片已证明可行, 剩下的
   是逐面板补行为覆盖。

3. **两个单体仍在膨胀** — `game-engine.js` ~5100 行 / 340+ 函数,
   `dom-adapter.js` ~2600 行。v4 的 runtime seam 文件 (skill-runtime /
   card-runtime / state) 只是薄壳, 几乎全部规则逻辑仍在单体里。继续加技能
   (B 阶段 17 个) 会进一步恶化, 应在批量接入前先拆出域模块。

另有功能向的存量候选: **17 个 cache-ready 技能** (官方 spec 已入
`official-skill-cache/sanguosha-standard`, 引擎 hooks 已就绪)、装备复杂副作用
handler 体系、AI 响应决策深化、多人模式 (远期)。

## 总体策略

沿用 v10 的"功能 + 清债"模式: 先把守恒与测试地基打牢 (A), 再拆单体 (B),
然后在干净的结构上批量接入新技能 (C), AI 与玩法扩展殿后 (D/E)。
每个 PR 独立可合、`npm run verify` 全绿、不引入 npm 依赖。

## 阶段拆分

### A. 守恒与回归硬化 (P0, 2-3 个 PR)

- **A1 全局牌守恒断言**: 把 `countAllCards` 抽到 `tests/helpers/`, 提供
  `assertCardConservation(game, fn)` 包装器; 对引擎行为测试逐文件接入
  (优先伤害/濒死/获得牌/转化类场景)。凡是"牌凭空增减"的新 bug 在任何
  一条行为测试里都会立刻爆。
- **A2 `moveCard` 原语**: 引擎收敛 `moveCard(game, card, from, to)`
  (zones: deck / discard / hand(actor) / equipment(actor,slot) /
  judgeArea(actor) / processing), 先以适配层形式包住现有散落操作,
  再逐站点迁移; 行为零漂移, 由 A1 的守恒断言护航。
- **A3 UI 面板行为测试补全**: 用 #123 的 fake-DOM 垫片给存量面板逐个补
  "弹出 → 点选 → 引擎状态 → 关闭"全链路测试; 每 PR 覆盖 4-6 个面板,
  顺手删除被行为测试取代的源码正则断言 (清债)。

### B. 单体拆分 (P1, 3-5 个 PR)

- **B1 game-engine 域拆分**: 按域抽 ES 模块 — `damage-dying.js`
  (damage/enterDying/finishDamageAfter/铁索传导), `response.js`
  (requestPlayerResponse/RESPONSE_KIND_RESOLVERS/各 resolver),
  `tricks.js` (锦囊结算 + 无懈链), `equipment.js` (装备特效 +
  triggerEquipmentLoss), `ai.js` (评估/lookahead/runAITurn)。
  迁移顺序从依赖最少的 ai.js 开始; 公开 API (`SanguoshaEngine`) 形状不变,
  现有源码正则测试按需更新切片锚点。
- **B2 dom-adapter 面板拆分**: 面板渲染/绑定按 kind 拆到
  `src/ui/panels/*.js`, 主 adapter 只留注册表与通用框架; A3 的行为测试
  保证拆分零回归。

### C. 新技能批量接入 (P1, 4-6 个 PR)

- 17 个 cache-ready 技能按 hook 同类分批 (每 PR 3-5 个):
  被动/锁定技优先 (复用既有 seam), 需要新 pendingChoice kind 的交互技殿后
  (每个新 kind 同时落引擎 resolver + UI 面板 + 行为测试, 不再出现
  "引擎 ask 就绪但 UI 缺面板"的中间态)。
- 每批跑 v6 的四方一致性校验 (cache ↔ specs ↔ heroes.js ↔ 引擎)。

### D. AI 进阶 (P2, 2-3 个 PR)

- 响应决策评估 (出不出闪/无懈的期望值, 而非永远自动响应)。
- 主动技与转化的 lookahead 整合; 贯石斧/麒麟弓等武器选择接入评分。

### E. 玩法扩展 (P3, 远期)

- 装备复杂副作用 handler 体系收口 (八卦/藤甲/青龙已散落实现, 统一注册表)。
- 多人模式 (>2 角色): 座次/距离环、逆时针结算顺序、身份场 — 依赖 B1 拆分
  后的引擎结构, 不在 v11 内承诺。

## 验收标准

- A 阶段后: 任意引擎行为测试中的牌数不守恒立即失败; `moveCard` 覆盖
  ≥80% 的牌移动站点。
- B 阶段后: `game-engine.js` 主文件 ≤2000 行, `dom-adapter.js` ≤1200 行,
  公开 API 不变, 全量测试零回归。
- C 阶段后: 已实现技能 31 → 48, 全部通过四方一致性校验, 每个新交互
  引擎+UI+测试三件套齐备。
- 全程: 零 npm 依赖、PR 门禁 (`npm run verify`) 全绿、每 PR 行为级回归测试。

## 非目标

- 不引入打包器 / 框架 / jsdom (零依赖红线)。
- 不在 v11 做多人模式实装 (仅在 B1 拆分时预留座次抽象)。
- 不重写既有 UI 视觉 (v9 cream 卷轴风沿用)。

## v11 收尾盘点 (2026-07-05, 批次 11-35 / PR #125-#149)

### 各阶段完成情况

- **A 守恒硬化 — 完成** (批次 11-15):
  A1 `assertCardConservation` 全局守恒断言 (深扫在途/去重);
  A2 `moveCard/takeCard/putCard` 原语 + 裸操作白名单守护 (仅 4 条豁免);
  A3 33 项面板全链路行为测试 (fake-DOM + 真实 lobby 开局)。
- **B 单体拆分 — 完成** (批次 16-24):
  B1 五个域模块 (ai/damage-dying/response/tricks/equipment) 迁出,
  game-engine 5322 → 3777 行; B2 三个面板模块迁出, dom-adapter
  2601 → 1526 行。公开 API 形状不变。
- **C 技能批量接入 — 1v1 语境封顶** (批次 25-32):
  实现技能 31 → 40 (无双/救援/连营/奇袭/枭姬/结姻/耀武/妄尊/同疾),
  英雄 68 → 71 (孙尚香/华雄/标袁术); 四方一致性审计 40/40。
  配套基建: 统一手牌失去事件 (C2)、card-as 泛化到锦囊 (C3)、
  UI 转化面板泛化 (C4)、AI 转化决策 (C5)、回合级手牌上限修正 (C8)、
  新交互 kind 三件套范式 (C7 yaowu-reward)。
- **D AI 进阶 — 完成** (批次 29/33/34):
  转化 lookahead (C5/批次 29)、无懈期望值 (D1)、八卦优先省闪 +
  贯石斧 EV (D2); 麒麟弓 auto 已有 +1 马优先启发。
  "主动技 lookahead 整合"评估后放弃: 现有 eval 权重 (hp 30/牌 5)
  会系统性否决苦肉/仁德类"牌转价值"技能, 静态条件规则表现更好。
- **E 玩法扩展 — E1 完成, 多人模式按计划不实装** (批次 35):
  装备伤害修正 handler 有序表 (藤甲→古锭→白银→寒冰) + 布尔效果
  flag 化 + 零裸型号判断架构守护。

### 验收标准对照

- A: ✅ 守恒断言全接入; moveCard 覆盖全部牌移动站点 (白名单 4 条豁免)。
- B: ⚠️ 行数目标部分达成 — B 阶段末 game-engine 3777 / dom-adapter
  1526; C/D/E 批次新增功能后现为 4137 / 1559 (目标 ≤2000 / ≤1200)。
  域拆分与 API 稳定目标达成; 绝对行数目标低估了 C-E 阶段的引擎增量,
  如需继续压缩可在 v12 再拆 (候选: 判定区结算域 / playCard 分发表)。
- C: ⚠️ 40/48 — 差额 8 全部为 1v1 语境不可达或退化项:
  jijiang/hujia (主公技代出, 1v1 无同势力他人)、lijian (需两名其他
  男性角色) 未接入; 同疾/流离以 reserved hook 形式接入 (多人激活)。
  1v1 引擎的实际封顶即 40。
- 全程: ✅ 零 npm 依赖、verify 全绿 (断言 1074 → 1207)、每 PR 行为级
  回归测试、每批一 PR 等待后台 merge 的工作规范全程执行。

### v12 候选方向 (未承诺)

- 多人模式 (>2 角色): 座次/距离环/逆时针结算 — B1 拆分已铺垫。
- 行数压缩第二轮: 判定区结算域、playCard 分发表化。
- AI: 多步 lookahead / 对手手牌概率建模 (现为单步 + 计数启发)。
- 技能池: 风/火/林/山扩展包 spec 缓存补齐后按 C 阶段范式分批接入。
