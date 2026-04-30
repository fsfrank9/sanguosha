# 三国杀 · 模块化源码 + 单文件离线版

一个可直接打开的离线 HTML 三国杀 1v1 原型。当前从 v4.0 开始采用专业化源码结构：开发时维护 `src/` 模块，发布/游玩仍保留可直接打开的单文件 `index.html`。v4 是迁移过渡版本；v5 计划不再把全部源码/数据塞进单 HTML，而是走 GitHub 托管发布链接访问和真正模块化架构。

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
  - `src/engine/skill-runtime.js`：技能 runtime 模块，当前承接技能状态标注、被动效果查询 seam，以及最小 SkillRegistry 与 hook 分发 API（`createRegistry` / `registerSkill` / `runHook`）。
  - `src/engine/card-runtime.js`：卡牌 runtime 的第一层模块，负责测试卡生成、牌堆生成、【杀】/普通锦囊分类与虚拟牌实体牌解析。
  - `src/engine/state.js`：状态/角色 runtime 模块，负责角色名、对手、技能查询、距离/攻击范围、先手、手牌上限与状态文案等纯查询。
  - `src/engine/phases.js`：阶段 runtime 模块，负责阶段历史记录、回合状态重置、阶段切换 helper 与摸牌后进入出牌/弃牌的判断。
  - `src/engine/judgement.js`：判定 runtime 模块，负责【乐不思蜀】、【兵粮寸断】、【闪电】等延时锦囊判定规则。
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
5. 已开始拆 `src/engine/*` runtime seam；`runtime`、`skill-runtime`、`card-runtime`、`state`、`phases`、`judgement` 已落地，其中 `skill-runtime` 正在 Phase 4 逐个迁移已实现技能的触发入口与被动效果入口。
6. Phase 4A 已把【闭月】作为第一条证明链路迁入 `onTurnEnd` hook：`completeTurn` 统一派发 hook，具体技能效果仍复用原 `triggerBiyue`，避免行为漂移。
7. Phase 4B 已把吕蒙【克己】迁入 `onBeforeDiscardPhase` hook：`finishPlayPhase` 先派发进入弃牌前 hook，原有跳过弃牌行为与日志/返回值保持不变。
8. Phase 4C 已把黄月英【集智】迁入 `onCardUse` hook：普通锦囊成功使用与响应【无懈可击】统一通过 `SkillRuntime.runHook` 派发，非普通锦囊、非法使用与【铁索连环】重铸仍不触发。
9. Phase 4D 已把周瑜【英姿】迁入 `onDrawPhase` hook：摸牌阶段统一派发 draw-phase hook，默认摸 2、【英姿】额外摸 1 的既有行为保持不变。
10. Phase 4E 已把张辽【突袭】迁入同一个 `onDrawPhase` hook seam：对手有手牌时从对方获得 1 张手牌，并把本次摸牌数减少 1；`performDrawPhase` 不再直接持有 `tuxi` 技能判断。
11. Phase 4F 已把张飞【咆哮】与马超/庞德/SP 庞德【马术】接入 `SkillRuntime` 被动效果 seam：`StateRuntime` 通过 `hasPassiveEffect` / `sumPassiveEffect` 查询无限【杀】与出距 -1，不再直接硬编码 `paoxiao` / `mashu` 判断。
12. Phase 4G 已把诸葛亮【空城】接入 `SkillRuntime.onCardTarget` target-validity seam：`canPlayCard` 与 `playSha` 通过统一目标保护 helper 派发 `onCardTarget`，不再直接持有 `kongcheng` 目标保护判断。
13. Phase 4H 已把马超【铁骑】迁入 `SkillRuntime.onNeedResponse` response-window seam：`playSha` 只派发【闪】响应窗口，红色判定锁定响应的逻辑由【铁骑】hook 处理。
14. Phase 4I 已把曹操【奸雄】迁入 `SkillRuntime.onDamageAfter` damage-after seam：`damage` 只负责伤害结算与统一派发，获得造成伤害实体牌的逻辑由【奸雄】hook 处理。
15. Phase 4J 已把关羽/SP 关羽【武圣】与赵云/SP 赵云【龙胆】迁入 `SkillRuntime.onCardAs` card-as/conversion seam：响应窗口与主动“当【杀】使用”入口统一派发转化 hook，原有红牌/【闪】/【杀】转化行为保持不变。
16. Phase 4K 已把孙权【制衡】、黄盖【苦肉】、刘备【仁德】、周瑜【反间】和诸葛亮【观星】迁入 `SkillRuntime.onActiveSkill` 主动技 dispatcher seam；【观星】预览额外走 `onSkillPreview`。
17. Phase 4L 已把甄姬【倾国】接入 `SkillRuntime.onCardAs` 响应转化 seam：无真实【闪】时可将黑色手牌当【闪】响应。
18. Phase 4M 已把黄月英【奇才】接入被动效果 seam：距离受限锦囊（当前【顺手牵羊】/【兵粮寸断】）会正常校验距离，拥有【奇才】时忽略该距离限制。
19. Phase 4N 已把陆逊【谦逊】接入 `SkillRuntime.onCardTarget` target-validity seam：陆逊不能成为【顺手牵羊】或【乐不思蜀】目标。
20. Phase 4O 已把郭嘉【天妒】接入 `SkillRuntime.onJudgementAfterResolve` judgement-after-resolve seam：郭嘉自己的判定牌结算后、进入弃牌堆前会获得该判定牌。
21. Phase 4P 已把夏侯惇【刚烈】接入 `SkillRuntime.onDamageAfter` + judgement finalizer seam：夏侯惇受到伤害后进行判定，非红桃时伤害来源自动弃置两张手牌，否则受到 1 点伤害；判定牌统一走 `resolveJudgementCard`。
22. Phase 4Q 已把司马懿【反馈】接入 `SkillRuntime.onDamageAfter` source-card gain seam：司马懿受到伤害后从伤害来源的手牌/装备/判定区获得一张可获得牌，不会错误获得已经打出的伤害来源牌。
23. v4 继续保证根目录 `index.html` 与 `dist/index.html` 可直接 `file://` 打开且字节级一致；v5 方向则是 GitHub 托管访问、模块化加载，不再维护 all-in-one 单 HTML 作为架构目标。

详细迁移计划见：

```text
docs/plans/2026-04-29-sanguosha-v4-architecture.md
```

## 武将技能实现状态

当前 catalog 统计：

- 武将：68 名。
- 技能条目：123 条。
- 唯一技能 ID：118 个。
- 已接入引擎逻辑的技能：23 个。
- 有主动按钮/交互入口的技能：5 个。
- 未实现/仅展示技能会在 UI 中标记为不可用或未实现。

已实现技能：

- 主动/交互技能：孙权【制衡】、黄盖【苦肉】、刘备【仁德】、周瑜【反间】、诸葛亮【观星】。
- 转化/被动/自动技能：张飞【咆哮】、关羽/SP 关羽【武圣】、赵云/SP 赵云【龙胆】、甄姬【倾国】、曹操【奸雄】、夏侯惇【刚烈】、司马懿【反馈】、郭嘉【天妒】、马超/庞德/SP 庞德【马术】、马超【铁骑】、张辽【突袭】、周瑜【英姿】、诸葛亮【空城】、陆逊【谦逊】、貂蝉/SP 貂蝉【闭月】、吕蒙【克己】、黄月英【集智】、黄月英【奇才】。

近期补齐技能说明：

- 【闭月】：貂蝉结束阶段摸 1 张牌；`endTurn` 和阶段推进到结束阶段的路径都会触发。
- 【克己】：吕蒙本回合未使用/打出/响应过【杀】时，跳过弃牌阶段；主动使用【杀】与响应【杀】都会阻止触发。
- 【集智】：黄月英成功使用普通锦囊后摸 1 张牌；响应使用【无懈可击】成功抵消锦囊时也会触发；非法使用、非普通锦囊或【铁索连环】重铸不触发。该触发入口已迁到 Phase 4C 的 `onCardUse` hook seam，实际摸牌效果仍复用原有行为 helper 以降低迁移风险。
- 【英姿】：周瑜摸牌阶段额外摸 1 张牌。该触发入口已迁到 Phase 4D 的 `onDrawPhase` hook seam，`performDrawPhase` 只负责派发 draw-phase hook 与执行摸牌。
- 【突袭】：张辽摸牌阶段在对手有手牌时获得对手 1 张手牌，并少摸 1 张。该触发入口已迁到 Phase 4E 的 `onDrawPhase` hook seam，行为测试继续覆盖偷牌与少摸牌的回归。
- 【咆哮】/【马术】：张飞【咆哮】提供无限使用【杀】效果，马超/庞德/SP 庞德【马术】提供出距 -1；Phase 4F 将这类锁定被动效果迁到 `SkillRuntime.hasPassiveEffect` / `sumPassiveEffect` seam，`StateRuntime` 继续负责距离与次数查询但不再直接硬编码对应技能 ID。
- 【空城】：诸葛亮无手牌时不能成为【杀】或【决斗】目标；Phase 4G 将该目标合法性保护迁到 `SkillRuntime.onCardTarget` seam，`canPlayCard` 和 `playSha` 统一通过 target protection helper 派发，行为测试继续覆盖失败后手牌不被移除与目标不受伤。
- 【铁骑】：马超使用【杀】指定目标后进行判定，红色判定令目标不能打出【闪】且保留原有伤害结算；Phase 4H 将该响应锁定逻辑迁到 `SkillRuntime.onNeedResponse` seam，`playSha` 不再直接持有 `tieqi` 判断或 `tieqiLocked` 状态。
- 【奸雄】：曹操受到有实体来源牌造成的伤害后获得该牌；Phase 4I 将该伤害后触发迁到 `SkillRuntime.onDamageAfter` seam，`damage` 不再直接持有 `jianxiong` 判断，且无实体来源牌的伤害不会错误获得牌。
- 【武圣】/【龙胆】：关羽/SP 关羽可将红色牌当【杀】使用/响应，赵云/SP 赵云可在【杀】/【闪】间互相转化；Phase 4J 将这些 card-as/conversion 入口迁到 `SkillRuntime.onCardAs` seam，`findResponseCard` 与 `canPlayCardAs` 不再直接持有 `wusheng` / `longdan` 判断，同时保留响应窗口、主动 UI affordance 与实体牌来源追踪。
- 【制衡】/【苦肉】/【仁德】/【反间】/【观星】：Phase 4K 将这些主动技能统一迁入 `SkillRuntime.onActiveSkill` dispatcher seam；【观星】的非消耗预览迁入 `onSkillPreview`。
- 【倾国】：甄姬无真实【闪】时可将黑色手牌当【闪】响应；Phase 4L 将该响应转化迁入 `SkillRuntime.onCardAs` seam，并保持真实【闪】优先。
- 【奇才】：黄月英使用距离受限锦囊时忽略距离限制；Phase 4M 将该锁定被动迁入 `SkillRuntime.hasPassiveEffect(..., 'ignoreTrickDistance')`，同时为普通角色补上【顺手牵羊】/【兵粮寸断】距离校验。
- 【谦逊】：陆逊不能成为【顺手牵羊】或【乐不思蜀】目标；Phase 4N 将该目标保护迁入 `SkillRuntime.onCardTarget` seam，失败时不会消耗来源牌，也不会移动目标手牌/判定区。
- 【天妒】：郭嘉自己的判定牌结算后、进入弃牌堆前获得该判定牌；Phase 4O 将判定牌结算后入口迁入 `SkillRuntime.onJudgementAfterResolve` seam，未被技能获得的判定牌仍会正常进入弃牌堆。
- 【刚烈】：夏侯惇受到伤害后进行【刚烈】判定，非红桃时伤害来源若有至少两张手牌则自动弃置两张，否则受到 1 点伤害；Phase 4P 复用 `SkillRuntime.onDamageAfter` 并把【刚烈】判定牌接入共享 `resolveJudgementCard` finalizer。

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
node tests/card_runtime.test.mjs
node tests/state_runtime.test.mjs
node tests/phase_runtime.test.mjs
node tests/skill_runtime_hooks.test.mjs
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
