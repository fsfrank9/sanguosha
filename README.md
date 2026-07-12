# 三国杀 · 1v1 规则合规版

纯 HTML/CSS/JavaScript 实现的三国杀 1v1。原生 ES 模块 + GitHub Pages 静态托管:`src/` 就是浏览器加载的源码本身,根 `index.html` 是手写的模块入口——没有打包步骤、没有 npm 运行时依赖。

**当前版本 `v12-F1 收尾`**:技能域整体迁往 `skills.js`——33 个触发器 + 20 个技能 resolver/辅助共 1338 行 verbatim 迁移,game-engine 从 4009 行收敛到 2698 行,引擎经 deps 注入原语、SkillDomain 面回绑直调函数。承接 v12 修复批(修复 codex 批次的规则违规与虚报:据守翻面、烈弓/狂骨官方条件、神速/红颜撤下、风包 fixture 分包)。43 个已实现技能(8 个主动)和 71 名武将;1v1 行为有测试护航。牌移动统一走 `moveCard` 原语并由全局牌数守恒断言护航;AI 具备转化 lookahead 与无懈/闪响应期望值决策。

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
                      (skills / judge-area / damage-dying / response / tricks / equipment / ai)
                      + runtime seam(card/state/skill/judgement/phases)
  ui/
    dom-adapter.js    DOM 适配层(渲染框架 + 面板注册表)
    panels/           面板模块(lobby / response / prompt / mode 四簇)
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
- 已接入引擎逻辑的技能 43 个(主动/交互 8 个:制衡、苦肉、仁德、反间、观星、青囊、洛神、结姻;风包首批:据守、烈弓、狂骨);未实现技能在 UI 中明确标记,不会"看起来有但触发不了"。标准包在 1v1 语境已封顶(余下激将/护驾/离间为多人专属,流离/同疾以 reserved hook 待多人激活);风包的神速/红颜/天香待专门框架(阶段跳过选择、花色视同层、伤害转移)后接入。
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

## 下一阶段(v12)

路线图见 [`docs/plans/2026-07-05-sanguosha-v12-roadmap.md`](docs/plans/2026-07-05-sanguosha-v12-roadmap.md)。**如实进度**(修复批核对后):

1. **F 结构减重:F1-F4 拆分项全部完成** — 技能域(注册表 + 53 个函数本体)、判定区、PLAY_HANDLERS 分发、大厅面板均已拆出;game-engine 2698 行 / dom-adapter 1405 行。原验收线 ≤2200/≤1200 因低估非技能域体量未达,是追加"牌结算链/渲染域"拆分批冲线还是修订验收线,待决策(见路线图 F 节)。
2. **G 扩展包技能:首批 3 个落地**(据守/烈弓/狂骨,经修复批对齐官方规则);G0 风包 spec 独立 fixture 就位(5 将 6 技,官方页面爬取与 gid 核对待补);神速/红颜/天香待实现。
3. **H 多人模式:引擎侧最小骨架** — 座次工具、距离环、濒死救援座次队列、【杀】显式目标、3 人身份胜负判定;响应链多人化、其余牌类目标选择、多座 UI、身份技激活均未开始。
4. **I AI 进阶:未开始**。

## 官方资料对照与缓存

官网资料分两层,避免重复拉取、也避免在公开仓库提交大段官网原文:

- `tests/fixtures/official_standard_skills.json`:官网标准包武将/技能名紧凑 fixture(校验 catalog 一致性,恒 27 将)。
- `tests/fixtures/official_standard_skill_specs.json`:可提交的结构化实现规格(来源 URL + `sourceTextRef` 摘要,不含原文)。
- `tests/fixtures/official_wind_skills.json` / `official_wind_skill_specs.json`:风包独立 fixture(pack='风',5 将 6 技,含 `implementationStatus` 如实标记;gid 为临时编号、官方页面爬取待补,见文件内 `gidPolicy`/`rawCachePolicy`)。
- `.cache/sanguosha-official/`:本地原文缓存,已 gitignore 不入库。

继续实现技能时按 cache-first 流程:先读本地缓存与已提交 specs,缓存缺失/过期才重新请求官网。
