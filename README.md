# 三国杀 · 模块化源码 + 单文件离线版

一个可直接打开的离线 HTML 三国杀 1v1 原型。当前从 v4.0 开始采用专业化源码结构：开发时维护 `src/` 模块，发布/游玩仍保留可直接打开的单文件 `index.html`。

## 运行

最简单方式仍然是直接用浏览器打开：

```text
index.html
```

不需要服务器，也不需要联网。

如果修改了 `src/` 源码，先重新生成单文件产物：

```bash
node tools/build.mjs
# 或
npm run build
```

构建会同时写入：

- `index.html`：根目录直开版本，保持原来的使用习惯。
- `dist/index.html`：构建产物副本，便于后续发布/分发。

检查构建产物是否与源码一致：

```bash
node tools/build.mjs --check
# 或
npm run build:check
```

## 当前版本

`v4.0 模块化源码与单文件构建`

主要特性：

- `src/` 模块化源码是当前开发入口：
  - `src/index.template.html`：HTML 模板。
  - `src/styles/main.css`：样式源码。
  - `src/data/heroes.js`：武将 catalog 与技能元数据。
  - `src/data/cards.js`：卡牌 catalog、牌类信息与阶段常量。
  - `src/data/skill-status.js`：已实现技能与主动技能入口清单。
  - `src/engine/runtime.js`：引擎通用 runtime/helper 模块，负责数据校验、克隆、随机数、玩家工厂等基础能力。
  - `src/engine/skill-runtime.js`：技能 runtime 的第一层模块，当前承接技能状态标注，后续继续扩展 hook/注册表。
  - `src/engine/game-engine.js`：纯游戏引擎源码，继续暴露 `window.SanguoshaEngine`。
  - `src/ui/dom-adapter.js`：DOM/UI 适配层源码。
- `tools/build.mjs` 负责按 `data → engine runtime modules → engine → ui` 顺序把源码注入模板，生成可离线直开的单文件 HTML。
- `index.html` 与 `dist/index.html` 必须由构建脚本生成并保持一致。
- 1v1 选将、主公/反贼身份与主公先手流程。
- 标准包、风林火山、SP 武将池 catalog。
- 标准 + 军争核心牌组。
- 阶段、装备区、判定区、延时锦囊、部分武将技能和 AI 行动。
- 火攻、铁索连环、顺手牵羊、过河拆桥等交互选择流程。
- 技能实现状态可见：已实现技能可用；仅展示/待实现技能会明确标记为“未实现”，避免看起来有技能但实际无法触发。

## 架构路线

v4.0 不是重写，而是分批“安全拆源”：

1. 保留根目录 `index.html` 作为可直接打开的稳定产物。
2. 已将 CSS、数据模块、引擎、UI 适配层抽到 `src/`。
3. 用 `tools/build.mjs` 生成 `index.html` 和 `dist/index.html`。
4. 用 `tests/architecture_build.test.mjs`、`tests/data_modules.test.mjs` 和 `tests/engine_modules.test.mjs` 防止源码与产物漂移。
5. 已开始拆 `src/engine/*` runtime seam；后续继续拆 cards/phases/damage/response-window/skills/UI panels。

详细迁移计划见：

```text
docs/plans/2026-04-29-sanguosha-v4-architecture.md
```

## 武将技能实现状态

当前 catalog 统计：

- 武将：68 名。
- 技能条目：123 条。
- 唯一技能 ID：118 个。
- 已接入引擎逻辑的技能：17 个。
- 有主动按钮/交互入口的技能：5 个。
- 未实现/仅展示技能会在 UI 中标记为不可用或未实现。

已实现技能：

- 主动/交互技能：孙权【制衡】、黄盖【苦肉】、刘备【仁德】、周瑜【反间】、诸葛亮【观星】。
- 转化/被动/自动技能：张飞【咆哮】、关羽/SP 关羽【武圣】、赵云/SP 赵云【龙胆】、曹操【奸雄】、马超/庞德/SP 庞德【马术】、马超【铁骑】、张辽【突袭】、周瑜【英姿】、诸葛亮【空城】、貂蝉/SP 貂蝉【闭月】、吕蒙【克己】、黄月英【集智】。

近期补齐技能说明：

- 【闭月】：貂蝉结束阶段摸 1 张牌；`endTurn` 和阶段推进到结束阶段的路径都会触发。
- 【克己】：吕蒙本回合未使用/打出/响应过【杀】时，跳过弃牌阶段；主动使用【杀】与响应【杀】都会阻止触发。
- 【集智】：黄月英成功使用普通锦囊后摸 1 张牌；响应使用【无懈可击】成功抵消锦囊时也会触发；非法使用或非普通锦囊不触发。

## 官方资料对照与缓存

本仓库把官网资料分成两层，避免后续补技能时每次都重新拉官网，也避免在公开仓库提交大段官网原文：

- `tests/fixtures/official_standard_skills.json`：官网标准包武将/技能名的紧凑 fixture，用于校验本地 catalog 中当前批次技能名是否与官方资料源一致。
- `tests/fixtures/official_standard_skill_specs.json`：可提交的结构化实现规格 fixture。它包含来源 URL、`sourceTextRef` 摘要引用、技能触发时机/条件/成本/效果/频率/引擎 hook 等转述后的实现要点，不包含 `officialText` 原文字段。
- `.cache/sanguosha-official/official_standard_skill_texts.json`：本地原文缓存，只用于开发参考和重新生成结构化规格；该目录已加入 `.gitignore`，不提交到仓库。

后续继续实现技能时优先按 cache-first 流程工作：先读本地 `.cache/sanguosha-official/` 原文缓存与已提交的结构化 specs；只有缓存缺失、过期或需要刷新官方资料时，才重新请求 `https://www.sanguosha.com/hero` 与对应详情页。

## 测试

使用 Node 直接执行测试文件，例如：

```bash
node tests/architecture_build.test.mjs
node tests/data_modules.test.mjs
node tests/engine_modules.test.mjs
node tests/game_engine.test.mjs
node tests/skills.test.mjs
node tests/official_source.test.mjs
```

全量回归：

```bash
npm test
```

等价于：

```bash
for f in tests/*.mjs; do
  printf '\n===== %s\n' "$f"
  node "$f" || exit 1
done
```

完整验证（构建一致性 + 全量测试）：

```bash
npm run verify
```
