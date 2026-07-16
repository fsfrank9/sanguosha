# 三国杀 · 1v1 规则合规版

纯 HTML/CSS/JavaScript 实现的三国杀 1v1。原生 ES 模块 + GitHub Pages 静态托管:`src/` 就是浏览器加载的源码本身,根 `index.html` 是手写的模块入口——没有打包步骤、没有 npm 运行时依赖。

**当前版本 `v12-I AI 进阶第二轮`**:在 H 阶段双模式(1v1 + 3 人身份场)之上完成 AI 决策升级——**整回合深度模拟**(top-5 候选在私有克隆世界用真实引擎流程续跑"我方剩余回合 + 下家整回合"再互比,嵌套决策短路为纯启发保持线性复杂度)、**可见信息诚实计数**(对手手牌估计不再直读暗牌:未知池占比 × 手牌数 + 转化技折算 + 响应空窗推断)、**多人目标评估**(敌意记账、反贼集火主公、收割与击杀奖励)与启发式状态机(处决线/压血线/留桃/闪电不自残/弃牌保响应牌)。座席级 `aiProfile` 保留 v11 冻结旧路径:**固定种子基准对弈 v12 对 v11 胜率 61.0%(验收段)/ 四独立段 700 局合计 57.6%,≥55% 验收线达成**(常驻门禁 tests/v12_i_benchmark)。53 个已实现技能、71 名武将,承接 F 域模块架构与全座席牌守恒 census。

## 运行

### 线上(GitHub Pages)

```
https://fsfrank9.github.io/sanguosha/
```

`main` 分支每次更新后由 `.github/workflows/pages.yml` 自动发布(部署产物只含 `index.html` + `src/`)。首次使用需要仓库 owner 在 Settings → Pages 把 Source 切换成 "GitHub Actions"。

### 本地开发

原生 ES 模块在 `file://` 下被浏览器 CORS 拦截,不支持双击直开。在仓库根目录起一个本地 HTTP 服务器即可:

```bash
python3 -m http.server 8000
# 浏览器访问 http://127.0.0.1:8000/
```

不需要 npm install、不需要打包、不需要联网。需要 Node ≥ 20.11(仅用于跑测试)。

## 测试

```bash
npm test              # 全量回归(逐文件执行 tests/*.mjs, 失败即停)
npm run build:check   # 仓库结构完整性检查
npm run verify        # build:check + 全量测试(CI 门禁同款)
```

测试无框架、无依赖:每个文件用 `node:assert/strict` 直跑。引擎层是行为测试(含全场牌数守恒回归),UI 层用 `tests/helpers/fake-dom.mjs` 零依赖 DOM 垫片做全链路行为测试。

## 仓库结构

```text
index.html            手写模块入口(无内联逻辑)
src/
  main.js             两行 side-effect import
  engine/             游戏引擎:game-engine.js 装配主体 + 域模块
                      (skills / sha-flow / tricks / judge-area / damage-dying / response / equipment / ai)
                      + runtime seam(card/state/skill/judgement/phases)
  ui/
    dom-adapter.js    DOM 适配层(渲染框架 + 面板注册表)
    panels/           面板模块(lobby / board / response / prompt / mode 五簇)
  data/               武将/技能/牌的结构化 catalog 与元数据
  styles/             CSS(main.css 为 @import 入口)
tests/                行为测试 + 架构守护测试(零依赖直跑)
tools/build.mjs       结构完整性检查(--check)
official-skill-cache/ 官方规格副本(audit harness 数据源)
docs/
  history.md          版本演进史(v4 → 两轮审计的浓缩档案)
  plans/              各版本计划与执行记录
  audit/              代码审计纪要
```

## 内容现状

- 武将 71 名 / 技能条目 128 条 / 唯一技能 ID 123 个。
- 已接入引擎逻辑的技能 53 个(主动/交互 11 个:制衡、苦肉、仁德、反间、观星、青囊、洛神、结姻、激将、黄天、离间;风包 9 技:据守、烈弓、狂骨、神速、红颜、天香、雷击、鬼道、不屈);未实现技能在 UI 中明确标记,不会"看起来有但触发不了"。多人专属技随 H 身份场激活:激将/护驾(主公技,同势力代打)、黄天(张角主公技)、离间(貂蝉)——1v1 中无同势力队友/凑不齐目标,保持惰性;蛊惑(多人质疑机制)留待评估;流离/同疾 reserved hook 保持座次环扫描。
- 标准 + 军争核心牌组 39 张牌全部数据驱动;濒死/判定/响应窗口/无懈链/铁索传导等结算对照 `official-skill-cache/gltjk-sanguosha-rules` 官方规则集。
- 技能逐项的引擎接入说明见 [`docs/history.md`](docs/history.md)。

## 版本演进

详细历史见 [`docs/history.md`](docs/history.md),各版本计划见 `docs/plans/`:

| 版本 | 主题 | 计划文档 |
|------|------|----------|
| v4 | 安全拆源 + SkillRuntime hook seam(Phase 4A–4T) | `2026-04-29-sanguosha-v4-architecture.md` |
| v5 | 原生 ES 模块 + GitHub Pages 迁移 | `2026-05-13-sanguosha-v5-architecture.md` |
| v6 | 数据驱动基础设施 + per-skill spec audit | `2026-05-13-sanguosha-v6-logic-correctness.md` |
| v7 | 牌规则合规(16 PR) | `2026-05-14-sanguosha-v7-card-rule-compliance.md` |
| v8 | 标准包技能扩充 + AI lookahead | `2026-05-14-sanguosha-v8-ui-integration.md` |
| v9 | UI 全面改版(cream 卷轴风) | `2026-05-14-sanguosha-v9-ui-overhaul.md` |
| v10 | 响应框架 + dispatch 注册表 | `2026-05-28-sanguosha-v10-stabilize-and-expand.md` |
| 审计×2 | 两轮规则合规审计修复(#105–#113, #115–#123) | `docs/audit/` + `docs/history.md` |
| v11 | 守恒硬化 + 域拆分 + 技能 31→40 + AI 期望值决策(#125–#150) | `2026-06-09-sanguosha-v11-roadmap.md`(含收尾盘点) |

## v12(收官)

路线图见 [`docs/plans/2026-07-05-sanguosha-v12-roadmap.md`](docs/plans/2026-07-05-sanguosha-v12-roadmap.md)。**如实进度**(修复批核对后,四阶段收官):

1. **F 结构减重:收官,验收线双达标** — F1 技能域、F2 判定区、F3 PLAY_HANDLERS、F4 大厅面板、F5 牌结算链(杀链 sha-flow.js + 锦囊结算入 tricks.js)、F6 战场渲染域(board-panels.js)全部拆出;game-engine 1941 行(≤2200 ✓)/ dom-adapter 1135 行(≤1200 ✓)。
2. **G 扩展包技能:收官** — 风包 9/11 技能接入(G1 据守/烈弓/狂骨 + G2 神速/红颜/天香/雷击/鬼道/不屈),fixture 扩至 8 将 11 技;验收"≥50"差 1 技为黄天(按计划随 H 激活即跨线),蛊惑留待多人评估。
3. **H 多人模式:收官(含 UI)** — H1-H7 全部落地:座次环结算(无懈队列/AOE逐席/决斗跨座/铁索环/闪电环/桃园五谷座次)、全牌类显式目标 + 座席级合法目标矩阵、identity3 距离规则(顺手/兵粮≤1)、身份死亡结算(弃置所有牌+奖惩+回合终止)、主公技激活(激将/护驾/黄天)+ 离间(技能 49→53,跨 G"≥50"验收线)、AI 阵营立场;H6 三席 UI:对战模式选择、第三席渲染、座席点选(选牌→高亮→点选)、激将/护驾求助面板。全程 1v1 行为零回归(既有测试零改动)。
4. **I AI 进阶:收官,验收线达成** — I0 profile 基建(v12 缺省/v11 冻结 + 特性门消融)、I1 整回合深度模拟(胜率主引擎,独立贡献 ~+6-7pt)、I2 可见信息诚实计数(去全知作弊 + 响应空窗推断,信息税约 -2pt 被 I1 净覆盖)、I3 多人目标评估(敌意记账/胜负手/收割)、I4 启发式状态机(处决线/血线收敛/留桃/闪电/弃牌保留值)。验收:v12 对 v11 固定种子自对弈,验收新鲜段 **61.0%**、四独立段 700 局合计 **57.6%**(≥55% ✓,tests/v12_i_benchmark 常驻门禁);全量 verify 全绿(仅两个 v8 公式文档化测试钉至 v11 profile,语义不减)。

## 下一阶段(v13)

路线图见 [`docs/plans/2026-07-16-sanguosha-v13-roadmap.md`](docs/plans/2026-07-16-sanguosha-v13-roadmap.md),v12 各阶段记录在案的候选与已知简化全量移交。方向:**J v12 清账与全局合规盘点**(玩家实测 4 例定点缺陷:出牌确认/延时锦囊无懈时机/防具响应顺序/满血桃目标 + 第三轮全量规则审计;另有遗计逐席分牌/火攻挂起重选面板/天香 ask/风包 gid 核对)→ **K 5 人身份场与内奸**(`IDENTITY_PRESETS[5]` 与内奸阵营已预留,补内奸胜负判定与座席环 UI)→ **L 可选身份**(玩家非主公、阵亡旁观续跑、黄天给牌按钮回归)→ **M 暗身份与推断 AI**(`aggressionLog` 数据面已预留,"零直读暗置身份"守护 + 推断准确率量化门禁)→ **N 内容评估**(蛊惑/军争缺口盘点,宁缺毋滥)。全程双红线:1v1 与 3 人身份场行为零回归。

## 官方资料对照与缓存

官网资料分两层,避免重复拉取、也避免在公开仓库提交大段官网原文:

- `tests/fixtures/official_standard_skills.json`:官网标准包武将/技能名紧凑 fixture(校验 catalog 一致性,恒 27 将)。
- `tests/fixtures/official_standard_skill_specs.json`:可提交的结构化实现规格(来源 URL + `sourceTextRef` 摘要,不含原文)。
- `tests/fixtures/official_wind_skills.json` / `official_wind_skill_specs.json`:风包独立 fixture(pack='风',8 将 11 技,含 `implementationStatus` 如实标记;gid 为临时编号、官方页面爬取待补,见文件内 `gidPolicy`/`rawCachePolicy`)。
- `.cache/sanguosha-official/`:本地原文缓存,已 gitignore 不入库。

继续实现技能时按 cache-first 流程:先读本地缓存与已提交 specs,缓存缺失/过期才重新请求官网。
