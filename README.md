# 三国杀 · 规则合规版（1v1 + 3 人身份场）

纯 HTML/CSS/JavaScript 实现的三国杀。原生 ES 模块 + GitHub Pages 静态托管:`src/` 就是浏览器加载的源码本身,根 `index.html` 是手写的模块入口——没有打包步骤、没有 npm 运行时依赖。

**一览**:

- **双模式**:1v1 对弈 + 3 人身份场(主/忠/反,座次环结算)。
- **内容**:71 名武将 / 53 个已接入技能 / 标准+军争核心 39 张牌,全部数据驱动;结算对照 `official-skill-cache/` 官方规则集,历经三轮全量合规审计。
- **AI**:整回合深度模拟 + 可见信息诚实计数(不读暗牌)+ 多人目标评估;对 v11 冻结基线 700 局胜率 57.6%(≥55% 门禁 `tests/v12_i_benchmark` 常驻)。
- **当前版本 `v13-J`**:玩家实测 4 缺陷修复 + 第三轮全量合规审计(22 确认 → 20 修复 + 2 如实降级),详见 [`docs/audit/2026-07-16-third-round-compliance-audit.md`](docs/audit/2026-07-16-third-round-compliance-audit.md);下一阶段(K 5 人身份场与内奸)见 [v13 路线图](docs/plans/2026-07-16-sanguosha-v13-roadmap.md)。

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
npm run verify        # build:check + 全量测试(CI 门禁同款, ~30s)
```

测试无框架、无依赖:每个文件用 `node:assert/strict` 直跑。引擎层是行为测试(含全场牌数守恒回归),UI 层用 `tests/helpers/fake-dom.mjs` 零依赖 DOM 垫片做全链路行为测试;另有架构守护测试(裸区域操作/裸装备判断/AI 零全知等零容忍红线)。

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
  history.md          版本演进史(v4 → v13-J 的逐版档案)
  plans/              各版本计划与执行记录
  audit/              合规审计纪要(三轮)
```

## 内容现状

- 武将 71 名 / 技能条目 128 条 / 唯一技能 ID 123 个;已接入引擎 53 个(含主动/交互 11 个与风包 9 技),未实现技能在 UI 中明确标记,不会"看起来有但触发不了"。
- 多人专属技(激将/护驾/黄天/离间)随 3 人身份场激活,1v1 中保持惰性;蛊惑留待多人评估。
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
| v13-J | 清账 + 第三轮全量合规审计(进行中: J 收官) | `2026-07-16-…-v13-roadmap.md` + `docs/audit/` |

## 官方资料对照与缓存

官网资料分两层,避免重复拉取、也避免在公开仓库提交大段官网原文:

- `tests/fixtures/official_*_skills.json`:官网武将/技能名紧凑 fixture(标准包恒 27 将;风包 8 将 11 技,含 `implementationStatus` 如实标记,gid 为临时编号、核对进度见文件内 `gidPolicy`)。
- `tests/fixtures/official_*_skill_specs.json`:可提交的结构化实现规格(来源 URL + `sourceTextRef` 摘要,不含原文)。
- `.cache/sanguosha-official/`:本地原文缓存,已 gitignore 不入库。

继续实现技能时按 cache-first 流程:先读本地缓存与已提交 specs,缓存缺失/过期才重新请求官网。
