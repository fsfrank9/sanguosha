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

> 注: 以上为 v8 时代的 31 技清单快照; v11 (31→40) 与 v12 H (→53) 新增技能的
> 接入说明见 `docs/plans/2026-06-09-sanguosha-v11-roadmap.md` 与
> `docs/plans/2026-07-05-sanguosha-v12-roadmap.md`。个别条目描述已被后续
> 审计修正 (如刚烈成本 v13 起限手牌、突袭 v13 起按官方"放弃摸牌"语义、
> 遗计 v13 起逐席分配), 以 v13 审计纪要为准。

## v11 — 守恒硬化 + 域拆分 + AI 期望值决策（#125–#150）

全场牌数守恒 census、引擎域模块拆分（damage-dying/response/tricks/
equipment/judge-area）、技能 31→40、AI 期望值决策与无懈 EV。详见
`docs/plans/2026-06-09-sanguosha-v11-roadmap.md`（含收尾盘点）。

## v12 — 双模式收官（F/G/H/I 四阶段）

路线图 `docs/plans/2026-07-05-sanguosha-v12-roadmap.md`。如实进度
（修复批核对后收官）：

1. **F 结构减重**：F1 技能域、F2 判定区、F3 PLAY_HANDLERS、F4 大厅面板、
   F5 牌结算链（杀链 sha-flow.js + 锦囊结算入 tricks.js）、F6 战场渲染域
   全部拆出；game-engine 1941 行（≤2200 ✓）/ dom-adapter 1135 行（≤1200 ✓）。
2. **G 扩展包技能**：风包 9/11 接入（据守/烈弓/狂骨/神速/红颜/天香/雷击/
   鬼道/不屈），fixture 扩至 8 将 11 技；黄天按计划随 H 激活跨"≥50"验收线，
   蛊惑留待多人评估。
3. **H 多人模式（3 人身份场，含 UI）**：座次环结算（无懈队列/AOE 逐席/
   决斗跨座/铁索环/闪电环/桃园五谷座次）、全牌类显式目标 + 座席级合法目标
   矩阵、identity3 距离规则、身份死亡结算与奖惩、主公技激活（激将/护驾/
   黄天）+ 离间（技能 49→53）、AI 阵营立场；三席 UI（模式选择/第三席渲染/
   座席点选/求助面板）。全程 1v1 行为零回归。
4. **I AI 进阶**：整回合深度模拟（胜率主引擎，独立贡献 ~+6-7pt）、可见
   信息诚实计数（去全知 + 响应空窗推断）、多人目标评估（敌意记账/胜负手/
   收割）、启发式状态机。验收：v12 对 v11 冻结基线固定种子自对弈，验收段
   61.0% / 四独立段 700 局合计 57.6%（≥55% ✓，tests/v12_i_benchmark
   常驻门禁）。

## v13-J — 清账与全局合规盘点（PR #167）

玩家实测 4 例定点缺陷修复（出牌暂存-确认 / 延时锦囊无懈时机迁至判定
生效前 + 判定阶段 LIFO / 藤甲仁王盾免疫短路与八卦先行 / 桃收口为仅自己
已受伤）；v12 记录在案三项清零（遗计逐席分牌 / 火攻成本挂起重选 / 天香
真 ask 伤害流暂停框架 + 伤害落点回调）；第三轮全量合规审计（8 并行维度 +
逐条对抗性复核）22 条确认 → 20 修复 + 2 如实降级；收官前 8 角度 code
review 再修 8 处。风包 gid 因环境网络策略如实降级。全程 1v1 与 3 人身份
场双红线保持。完整纪要：
`docs/audit/2026-07-16-third-round-compliance-audit.md`；执行记录：
`docs/plans/2026-07-16-sanguosha-v13-roadmap.md` 尾部。

## v13-K — 5 人身份场与内奸

4/5 人身份场全量落地：身份预设 4 人档（主/反/忠/内）与 5 人档（主/反/
忠/反/内）转正、内奸胜负条款（主公亡时仅剩内奸 → 内奸单独获胜；主公方
获胜收紧为反贼与内奸全灭）、死亡奖惩与回合环 4/5 席行为测试。结算加压
自审修出 3 处多席活跃缺陷（国色/奇袭转化目标硬编码 opponent() 错指玩家
席、铁索缺省目标二元残留、濒死队列亡席陪跑），16 例固定种子加压测试
入库。audit backlog 三项销账：advanceTargetQueue 逐目标无懈驱动泛化
（四份同型收敛、行为零变化）、酒使用方法Ⅰ他指（card__basic.md:58，
shaBonus 挂目标 + 回合结束全席过期）、天香/火攻面板 DOM 级测试（连带
发现并修复 huogongCostChoices id 重复 — 真实浏览器下 J2 重选候选渲染
进隐藏旧面板）。UI 座席环：预置槽位（ally2/ally3）+ setup 4/5 人模式 +
内奸紫徽章 + 按 game.seats 泛化渲染；修复身份场终局横幅恒显"败北"的
既有缺陷。K4 基准：4/5 席固定种子全 AI 自对弈入 verify 门禁（逐步守恒/
零挂起泄漏/终局可达，~2s）。内奸 AI 全敌对为已知简化（留 M 阶段身份
价值评估）。1v1 与 3p 双红线零回归。执行记录：
`docs/plans/2026-07-16-sanguosha-v13-roadmap.md` 尾部。

## v13-L — 可选身份与阵亡旁观

setup 身份选择五档 (主/忠/反/内/随机, 预设阵型内轮转构成不变); 引擎
firstActorFromRoles 全环扫描修复 (主公落任意座席先手正确, 旧实现只查
player/enemy 字面键); AI 主公先手经 enemyStep 定时器链自动接管; 黄天
给牌死钮回归; 激将/护驾双向化 4/5 席验证; 三席内奸徽章与文案中性化。
玩家阵亡旁观: 自己回合内阵亡不再卡死 (亡席回合按 AI 驱动 + render
幂等接管), 亡席输入守卫, 旁观横幅, 终局按真实身份结算。救援
play-phase 复议裁定维持 J0-4 桃收口。矩阵测试 8 格 + soak 可选身份
3 局 + 全仓库首个 flushTimers 时序 UI 测试。执行记录:
`docs/plans/2026-07-16-sanguosha-v13-roadmap.md` 尾部。

## v13-M — 暗身份与推断 AI

暗身份转正为可选模式 (官方规则: 除主公外身份牌死亡亮出前不可见, 既有
明置降级为记录在案的简化): hiddenRoles + roleRevealed 逐席可见性表,
死亡翻明先于胜负判定, 终局全翻明, UI 问号徽章与 setup 开关。去全知
第二轮 (I2 方法论): 规则层 (胜负/奖惩/求助资格/救援+1) 保持真实身份
直读, AI 知识层统一 perceived* 感知路由 — 明置恒等 (零回归), 暗置仅
自己/已翻明直读, 未知按敌对缺省; 零直读守护测试常驻 (逐文件计数锁定,
白名单 4 处皆主公公开或规则层) + 零全知行为断言 (未翻明座席身份互换
决策不变)。推断模型: aggressionLog 伤害方向 + stanceLog 立场遥测
(救援/无懈方向/求助响应, aid4/rescue3/wuxie2) → inferredLeaning 阈值
±2 判读; 击杀反贼奖励暗置折半 (信念非事实); 内奸骑墙初版 (感知阵营
聚合战力, +15 打压强势侧 — K4 简化销账)。M4 基准入 verify 门禁: 暗置
6 局 soak (守恒/终局可达/全翻明) + 推断准确率 5p 64.1% vs 随机基线
37.5%、4p 60.1% vs 33.3% (门禁 ≥50%/≥45%); 明置同种子对照 6 局 3 局
终局翻转 (胜率差可测)。执行记录:
`docs/plans/2026-07-16-sanguosha-v13-roadmap.md` 尾部。

## v13-N — 内容评估批

三子项裁决收官: 蛊惑 (于吉) 评估后本批不接入 — spec 文本完整 (gltjk
镜像含流程与判例) 但两个官方版本实质分歧无裁定基准, 且为横切全部
基本/锦囊结算路径的虚拟声明牌层 (成本≈独立阶段), 记录为立项候选;
军争盘点 — 官方缓存无任何牌数/花色/点数表 (该维度如实降级), 名录
对照军争零缺口 (8 张军争标签牌全在库; 缺席 9 名均非军争 — 1v1/
国战/界限突破专属), 销账一处真实可达性
缺口: 寒冰/古锭/朱雀/银月规则齐全却漏 buildDeck 配方 (实战不可摸),
各 ×1 入堆 (138→142) + 目录⇄配方守护测试常驻; 配方重排令 k4 soak
守恒红线抓获预存 bug — 奸雄从弃牌堆取回多目标 AOE 来源牌后, 后续
席位收尾误补弃致双区并存 (AOE 为唯一同来源牌多席结算面) → 已归属席位不补弃 + 回归
钉死; 基准重测 200 局胜率 62.5%、M4 推断 5p 54.9%/4p 47.9%, 门禁
全数保持。火/林/山无 spec 源, 零接入维持。执行记录:
`docs/plans/2026-07-16-sanguosha-v13-roadmap.md` 尾部。

## v13-UI修缮 — 用户实测反馈 6 项

出牌确认统一 (铁索面板/重铸/苦肉三处直出清零, 全 UI 无零确认结算
入口); 帮助文案随现状更新; 菜单未实现占位项移除; 一级界面分入口
(1v1/身份场, 二级选人数, 缺省 5 人档); 暗身份默认开启 (开关保留);
角色卡单卡化 — 装备定序四槽纵列 + 延时锦囊名首字着色圆标 (乐/兵/闪)
+ 手牌数角标, AI 牌背行撤销 (隐私更严), 多人场 AI 席同行多列解压。
执行记录: `docs/plans/2026-07-16-sanguosha-v13-roadmap.md` 尾部。
