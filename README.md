# 三国杀 · 规则合规版（1v1 + 3/4/5 人身份场）

纯 HTML/CSS/JavaScript 实现的三国杀。原生 ES 模块 + GitHub Pages 静态托管:`src/` 就是浏览器加载的源码本身,根 `index.html` 是手写的模块入口——没有打包步骤、没有 npm 运行时依赖。

**一览**:

- **多模式**:1v1 对弈 + 3/4/5 人身份场(主/忠/反/内奸,座次环结算,内奸独立胜负);身份可选(主/忠/反/内/随机,AI 主公先手),玩家阵亡后旁观续跑。
- **内容**:71 名武将 / 101 个已接入技能 / 标准+军争核心 39 个牌型 142 张全可达,全部数据驱动;结算对照 `official-skill-cache/` 官方规则集,历经五轮全量合规审计;蛊惑(于吉,风包现行版)带质疑链与「缠怨」,使用流程 16 型 + 响应窗口打出流程八窗口全接入(v14 R1 + v15 S)。
- **AI**:整回合深度模拟 + 可见信息诚实计数(不读暗牌)+ 多人目标评估 + 暗身份行为推断(不读暗置身份,守护测试常驻)+ 无懈全类期望值 + 内奸装忠/拆家/收割序博弈(v14 Q,量化门禁 `tests/v14_q2_renegade_benchmark` 常驻);对 v11 冻结基线胜率 63.5%(200 局固定种子,≥55% 门禁 `tests/v12_i_benchmark` 常驻),暗身份推断准确率 5p 67.4% / 4p 69.1% 对随机基线 37.5%/33.3%(门禁 `tests/v13_m4_inference_benchmark` 常驻;数字随批次演进重测,当前为 2026-08-03 实跑值)。
- **历史版本 `v13-收官`**:路线图 J-N 全部完成后,又以九个实测驱动批收尾 — UI 修缮一~三批、武将图鉴及续批、第四轮全量审计 16 条修复、张角修缮一~三(雷击/鬼道语义与时机、面板花色可读、延时锦囊无懈询问),见 [v13 路线图](docs/plans/2026-07-16-sanguosha-v13-roadmap.md) 尾部执行记录。
- **上一版 `v14`(已收官)**:O 工程清账、P 多目标杀架构、Q AI 博弈深化、R 内容与模式决策门四阶段全部交付(多目标杀矩阵、无懈 EV 全类建模、内奸带量化门禁博弈、蛊惑风包现行版带质疑链与缠怨、推断提示徽章等);KOF 经裁定不立项留占位,战报回放/移动端/国际化收案,6 人以上大场收案(5 人封顶)。见 [v14 路线图](docs/plans/2026-07-31-sanguosha-v14-roadmap.md)。
- **当前版本 `v15`(已收官)**:五个阶段全部交付 —— **S** 蛊惑收尾(响应窗口打出流程八窗口、声明菜单 16/16、AI 全型声明启发与五面质疑,spec 缺口 14 条逐条裁定[简报](docs/audit/2026-08-05-guhuo-spec-gaps.md));**T** 火包 8 将 13 技 + 全新拼点框架([简报](docs/audit/2026-08-05-fire-pack-spec.md));**U** 林包 8 将 18 技([简报](docs/audit/2026-08-06-lin-pack-spec.md));**V** 山包 7 将 15 技 + 觉醒技骨架/"田"区/失牌时机/额外回合机制,左慈化身经独立成本评估门推迟([简报](docs/audit/2026-08-06-shan-pack-spec.md));**W** 清账收官 —— 散账六项二态归零 + 第五轮全量合规审计(10 域并行 · 27 agent · 16 候选 → 确证 11 · 驳倒 5,其中两条驳回打在本轮自己的修复上并已还原)+ 三条长期不变量与守恒 soak 固化入库([账本](docs/audit/2026-08-06-w-ledger.md))。见 [v15 路线图](docs/plans/2026-08-04-sanguosha-v15-roadmap.md)。

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
npm test              # 全档回归(逐文件执行 tests/*.mjs, 失败即停)
npm run test:quick    # 快档(秒级冒烟 + 守恒/架构红线, ~2s)
npm run build:check   # 仓库结构完整性检查
npm run verify        # build:check + 全档测试(CI 门禁同款, ~50s)
npm run verify:quick  # build:check + 快档(开发内循环即时反馈)
```

测试无框架、无依赖:每个文件从 `tests/helpers/harness.mjs` 引入统一 `test`/`runTests`(v14 O1 收敛样板,build:check 强制),用 `node:assert/strict` 直跑。引擎层是行为测试(含全场牌数守恒回归),UI 层用 `tests/helpers/fake-dom.mjs` 零依赖 DOM 垫片做全链路行为测试;另有架构守护测试(裸区域操作/裸装备判断/AI 零全知等零容忍红线)。分档约定:新增 soak/基准一律入全档,快档只收亚秒级红线文件(清单见 `tools/run-tests.mjs`)。

## 仓库结构

```text
index.html            手写模块入口(无内联逻辑)
src/
  main.js             两行 side-effect import
  engine/             游戏引擎:game-engine.js 装配主体 + 域模块
                      (skills / sha-flow / tricks / judge-area / damage-dying / response / equipment / ai / guhuo / pindian)
                      + runtime seam(card/state/skill/judgement/phases)
  ui/
    dom-adapter.js    DOM 适配层(渲染框架 + 面板注册表)
    panels/           面板模块(lobby / board / response / prompt / mode 五簇)
  data/               武将/技能/牌的结构化 catalog 与元数据
  styles/             CSS(main.css 为 @import 入口)
tests/                行为测试 + 架构守护测试(零依赖直跑;helpers/harness.mjs 统一样板)
tools/                build.mjs 结构完整性检查(--check) + run-tests.mjs 分档测试运行器
official-skill-cache/ 官方规格副本(audit harness 数据源)
docs/
  history.md          版本演进史(v4 → v13 的逐版档案,含 v13 尾部实测修缮批)
  plans/              各版本计划与执行记录
  audit/              合规审计纪要(第一/三/四轮;第二轮档案见 history.md)
                      + 官方文本 spec 缺口裁定简报(如蛊惑 14 条)
```

## 内容现状

- 武将 71 名 / 技能条目 128 条 / 唯一技能 ID 123 个;已接入引擎 101 个(含主动/交互 21 个、风包 10 技、火包 13 技、林包 18 技与山包 15 技 + 觉醒授予的「急袭」),未实现技能在 UI 中明确标记,不会"看起来有但触发不了"。
- 多人专属技(激将/护驾/黄天/离间)随身份场(3/4/5 人)激活,1v1 中保持惰性;蛊惑(风包现行版)已全流程接入 — 出牌阶段使用流程 16 型声明 + 响应窗口打出流程(闪应杀/万箭/银月、杀应决斗/南蛮/借刀、桃·酒应濒死、无懈应锦囊,共八个窗口)+ 全场质疑链 + 缠怨,1v1 与身份场均可用;AI 席在响应窗口不声明蛊惑为已知局限(见 v15 路线图 S 记录)。
- 逐技能接入说明与历次修正见 [`docs/history.md`](docs/history.md) 与 `docs/audit/`。

## 版本演进

详细历史见 [`docs/history.md`](docs/history.md),各版本计划与执行记录见 `docs/plans/`:

| 版本 | 主题 | 计划/记录 |
|------|------|----------|
| v4 | 安全拆源 + SkillRuntime hook seam | `2026-04-29-…-v4-architecture.md` |
| v5 | 原生 ES 模块 + GitHub Pages 迁移 | `2026-05-13-…-v5-architecture.md` |
| v6 | 数据驱动基础设施 + per-skill spec audit | `2026-05-13-…-v6-logic-correctness.md` |
| v7 | 牌规则合规(16 PR) | `2026-05-14-…-v7-card-rule-compliance.md` |
| v8 | 标准包技能扩充 + AI lookahead | `2026-05-14-…-v8-ui-integration.md` |
| v9 | UI 全面改版(cream 卷轴风) | `2026-05-14-…-v9-ui-overhaul.md` |
| v10 | 响应框架 + dispatch 注册表 | `2026-05-28-…-v10-stabilize-and-expand.md` |
| 审计×2 | 两轮规则合规审计修复 | `docs/audit/` + `docs/history.md` |
| v11 | 守恒硬化 + 域拆分 + 技能 31→40 + AI 期望值 | `2026-06-09-…-v11-roadmap.md` |
| v12 | F 结构减重 / G 风包 / H 3 人身份场 / I AI 进阶 | `2026-07-05-…-v12-roadmap.md` |
| v13-J | 清账 + 第三轮全量合规审计 | `2026-07-16-…-v13-roadmap.md` + `docs/audit/` |
| v13-K | 4/5 人身份场与内奸 + backlog 三项销账 | `2026-07-16-…-v13-roadmap.md`(K 执行记录) |
| v13-L | 可选身份 + 阵亡旁观续跑 | `2026-07-16-…-v13-roadmap.md`(L 执行记录) |
| v13-M | 暗身份可选模式 + AI 去全知与推断 + 内奸骑墙 | `2026-07-16-…-v13-roadmap.md`(M 执行记录) |
| v13-N | 内容评估批:军争盘点销账 + 四武器入堆 + 蛊惑评估 | `2026-07-16-…-v13-roadmap.md`(N 执行记录) |
| v13-UI修缮 | 出牌确认统一 + 分入口 + 暗身份默认开 + 角色卡单卡化 | `2026-07-16-…-v13-roadmap.md`(UI 修缮记录) |
| v13-实测修缮 | UI 二/三批 + 武将图鉴及续批 + 第四轮审计 16 修 + 张角鬼道三修 | `2026-07-16-…-v13-roadmap.md`(尾部) + `docs/audit/` |
| v14-O | 工程清账:harness 统一 + 测试快/全分档 + 卫生清零 + gid 收案 | `2026-07-31-…-v14-roadmap.md`(O 执行记录) |
| v14-P | 多目标杀架构:目标队列 + 方天画戟/流离销账 | `2026-07-31-…-v14-roadmap.md`(P 执行记录) |
| v14-Q | AI 博弈深化:无懈 EV 全类 + 内奸带门槛博弈 + 突袭真 ask | `2026-07-31-…-v14-roadmap.md`(Q 执行记录) |
| v14-R-A | R 决策门裁定 + 收尾批:推断提示徽章 + 座席环压缩 + 死钮清理 | `2026-07-31-…-v14-roadmap.md`(R 执行记录) |
| v14-R-B | 蛊惑(于吉,风包现行版):虚拟声明牌层 + 质疑链 + 缠怨 | `2026-07-31-…-v14-roadmap.md`(R1 执行记录) |
| v15-S | 蛊惑收尾:响应窗口打出流程 + 声明菜单 16/16 + AI 全型启发 | `2026-08-04-…-v15-roadmap.md`(S 执行记录)+ `docs/audit/2026-08-05-guhuo-spec-gaps.md` |
| v15-T | 火包 8 将 13 技接入 + 拼点框架(全新机制) | `2026-08-04-…-v15-roadmap.md`(T 执行记录)+ `docs/audit/2026-08-05-fire-pack-spec.md` |
| v15-U | 林包 8 将 18 技接入(祸首/巨象 南蛮生命周期、乱武逐席链、帷幕目标合法性) | `2026-08-04-…-v15-roadmap.md`(U 执行记录)+ `docs/audit/2026-08-06-lin-pack-spec.md` |
| v15-V | 山包 7 将 15 技接入(觉醒技骨架、"田"区、失牌时机、额外回合机制);左慈化身按成本评估门推迟 | `2026-08-04-…-v15-roadmap.md`(V 执行记录)+ `docs/audit/2026-08-06-shan-pack-spec.md` |
| v15-W | 清账收官:散账六项二态归零 + 第五轮全量合规审计(27 agent / 16 候选 → 确证 11 · 驳倒 5)+ 三条长期不变量 + 守恒 soak 固化 | `2026-08-04-…-v15-roadmap.md`(W 执行记录)+ `docs/audit/2026-08-06-w-ledger.md` |

## 官方资料对照与缓存

官网资料分两层,避免重复拉取、也避免在公开仓库提交大段官网原文:

- `tests/fixtures/official_*_skills.json`:官网武将/技能名紧凑 fixture(标准包恒 27 将;风包 8 将 11 技,含 `implementationStatus` 如实标记,gid 为临时编号、核对进度见文件内 `gidPolicy`)。
- `tests/fixtures/official_*_skill_specs.json`:可提交的结构化实现规格(来源 URL + `sourceTextRef` 摘要,不含原文)。
- `.cache/sanguosha-official/`:本地原文缓存,已 gitignore 不入库。

继续实现技能时按 cache-first 流程:先读本地缓存与已提交 specs,缓存缺失/过期才重新请求官网。
