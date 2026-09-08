# v16 AA 批前度量与 AA-G2 迁移范围依据

日期：2026-09-07。冻结对象：Z 阶段合并后的 `9c0ac5e1ae06e00bd7ebad68bb1e5d137e9125f5`（PR #197）。

本文记录批前事实与迁移建议，**不表示 AA 已实现或验证通过**。所有行号均指上述冻结提交；后续改动可能改变行号。

## 计数口径与结论

统计源目录 `src/` 的 JavaScript。先枚举文本命中，再逐个区分角色运行态读取、目录/初始化、非角色配置以及注释/说明文本。`hasSkill` 的调用数排除函数声明；同一行的两个调用分别计数。角色属性直读按成员表达式计数，同一行两次读取分别列明。

| 项目 | `src/engine` 原始成员/词法命中 | 真实引擎调用或角色读取 | 运行态 UI 读取 | 不需迁移的其他 `src` 命中 |
|---|---:|---:|---:|---:|
| `hasSkill(` | 157 次 / 156 行 | **156 次调用** | 0 | 函数声明 1 次 |
| `.gender` | 14 次 / 12 行 | **11 次 / 10 行** | 1 次合法性读取 | 目录初始化 1 次；注释/描述 4 次 |
| `.camp` | 14 次 / 13 行 | **12 次 / 12 行** | 3 次合法性读取、3 次战场显示 | 目录/初始化 7 次；规则参数 `spec.camp` 1 次 |

全 `src` 原始 `.gender` 为 **17 次 / 14 行**，`.camp` 为 **26 次 / 25 行**，合计 **43 次**。需要进入统一有效属性出口的是：

- 引擎规则与 AI：**23 次 / 22 行**，分布于 7 个文件。
- UI 操作合法性：**4 次 / 4 行**，分布于 2 个文件。
- 战场当前势力显示：**3 次 / 3 行**，分布于 1 个文件。
- 合计：**30 次 / 29 行，10 个文件**。余下 13 个原始命中并非运行态有效属性读取。

这里的“初始化写入”是 `runtime.js` 用 `hero.camp` / `hero.gender` 读取目录并构造角色的 `camp:` / `gender:` 字段。当前引擎没有 `.camp =` 或 `.gender =` 成员赋值；不能把这两个本体属性初始化表达式误当作需要读取覆写层的规则判断。

## 与 V 批和路线图数字对照

| 冻结节点 | `hasSkill` 文本命中行 | `hasSkill` 文本次数 | 排除声明后的调用次数 | 全 `src` `.gender` 次数 / 行 | 全 `src` `.camp` 次数 / 行 |
|---|---:|---:|---:|---:|---:|
| V 批前（`ed57635^`） | 138 | 139 | 138 | 17 / 14 | 20 / 19 |
| V 批交付文档提交（`ff48937`） | 157 | 158 | 157 | 17 / 14 | 22 / 21 |
| v16 路线图立项（`3287d65`） | 158 | 159 | 158 | 17 / 14 | 22 / 21 |
| Z 后、AA 批前（`9c0ac5e`） | 156 | 157 | 156 | 17 / 14 | 26 / 25 |

V 文档的 `138` 可复现为 **V 批前**数据，并非 V 交付后的数据。路线图的 `158` 也可复现为该提交的文本行数与实际调用数；两者相等是因为“一条函数声明”和“一行内第二个调用”恰好相抵，不能据此混用口径。

V 文档的“11 处性别/势力直读”没有逐位置清单或统计脚本，无法复现为当时全仓角色属性读取的总数。路线图草稿的 `.gender 14 / .camp 26` 也不是 `3287d65` 上同一范围、同一单位的可复现组合：当时 `.gender` 全仓为 14 **行**或 17 **次**；`.camp` 为 21 **行**或 22 **次**。当前 Z 后 `.camp` 才是 26 次。应以本次逐位置清单作为 AA-G2 的可核查起点，不应由旧混合口径推导增长倍数。

## 引擎 `hasSkill` 调用分布

| 文件 | 实际调用次数 | 文本命中次数 | 备注 |
|---|---:|---:|---|
| `src/engine/skills.js` | 87 | 87 | 技能触发、主动技与规则判断 |
| `src/engine/ai.js` | 29 | 29 | 已有技能估计与行动选择 |
| `src/engine/game-engine.js` | 12 | 12 | 调度、转化与进入技能的校验 |
| `src/engine/state.js` | 7 | 8 | 多出的 1 次为 `hasSkill` 函数声明 |
| `src/engine/sha-flow.js` | 6 | 6 | 无双、肉林所需响应数量与说明 |
| `src/engine/tricks.js` | 6 | 6 | 第 1432 行含火兽/巨象两次调用 |
| `src/engine/guhuo.js` | 4 | 4 | 主动/响应蛊惑可用性 |
| `src/engine/damage-dying.js` | 3 | 3 | 天香、急救 |
| `src/engine/judge-area.js` | 1 | 1 | 红颜 |
| `src/engine/equipment.js` | 1 | 1 | 枭姬 |
| **合计** | **156** | **157** | 所有实际调用均在引擎目录 |

迁移核查不能只数 `hasSkill` 字符串：`hasLordSkill`、`skillsForActor`、`weidiBorrowedSkills`、按 `state.skills` 扫描以及 `tian`/`chuang` 被动读口也必须由 AA1 一并检查。保存牌或标记，不等于对应技能当前有效；换离屯田/不屈后须保留存储，同时令其当前规则效果取决于有效技能状态。

## 角色运行态属性直读清单

### 引擎规则和 AI：23 次

| 文件及行号 | 属性 / 次数 | 读取对象与行为 | 建议出口 |
|---|---|---|---|
| `src/engine/ai.js:652` | camp / 1 | 庸肆弃牌启发的全场势力数 | `effectiveCamp(game[seat])` |
| `src/engine/ai.js:1137` | camp / 1 | 吴势力发起制霸 | `effectiveCamp(self)` |
| `src/engine/ai.js:1193` | gender / 1 | 结姻目标为受伤男性 | `effectiveGender(target)` |
| `src/engine/ai.js:1214` | gender / 1 | 离间的两名男性候选 | `effectiveGender(game[seat])` |
| `src/engine/ai.js:1230` | camp / 1 | 群势力黄天交牌 | `effectiveCamp(self)` |
| `src/engine/equipment.js:307` | gender / 1 | 雌雄双股剑来源性别 | `effectiveGender(source)` |
| `src/engine/equipment.js:308` | gender / 1 | 雌雄双股剑目标性别 | `effectiveGender(target)` |
| `src/engine/sha-flow.js:590` | gender / 1 | 肉林：持有者对女性出杀需双闪 | `effectiveGender(target)` |
| `src/engine/sha-flow.js:592` | gender / 1 | 肉林：女性对持有者出杀需双闪 | `effectiveGender(source)` |
| `src/engine/sha-flow.js:602` | gender / 1 | 对应肉林响应窗口说明 | 同实际计数出口 |
| `src/engine/sha-flow.js:603` | gender / 1 | 对应反向肉林响应窗口说明 | 同实际计数出口 |
| `src/engine/game-engine.js:1333` | camp / 1 | 激将/护驾求助者势力过滤 | `effectiveCamp(state)`；右侧 `spec.camp` 保留常量 |
| `src/engine/game-engine.js:1980` | camp / 1 | 救援加成的用桃者须为吴 | `effectiveCamp(user)` |
| `src/engine/damage-dying.js:183` | camp / 1 | 伤害扣血前为暴虐采集来源势力快照 | **此时**调用 `effectiveCamp`，仍保存快照 |
| `src/engine/state.js:503` | camp / 1 | 血裔统计其他存活群势力数 | `effectiveCamp(game[seat])` |
| `src/engine/skills.js:1618` | camp / 1 | 颂威判定者须为魏 | `effectiveCamp(state)` |
| `src/engine/skills.js:2215` | camp / 1 | 庸肆全场存活势力数 | `effectiveCamp(game[seat])` |
| `src/engine/skills.js:2743` | camp / 1 | 制霸发动者须为吴 | `effectiveCamp(self)` |
| `src/engine/skills.js:3624` | gender / 1 | 结姻目标合法性 | `effectiveGender(target)` |
| `src/engine/skills.js:5160` | camp / 1 | 主动激将候选蜀势力响应者 | `effectiveCamp(st)` |
| `src/engine/skills.js:5202` | camp / 1 | 黄天发动者须为群 | `effectiveCamp(self)` |
| `src/engine/skills.js:5238` | gender / **2** | 离间两目标分别须为男性 | 两目标分别走 `effectiveGender` |

### UI 合法性：4 次

| 文件及行号 | 属性 | 行为 | 要求 |
|---|---|---|---|
| `src/ui/panels/lobby-panels.js:225` | camp | 黄天交牌按钮资格 | 显示与引擎当前势力一致 |
| `src/ui/panels/lobby-panels.js:247` | camp | 借助全场制霸的按钮资格 | 显示与引擎当前势力一致 |
| `src/ui/panels/mode-panels.js:723` | camp | 制霸点选目标入口 | 与发动校验走同一出口 |
| `src/ui/panels/mode-panels.js:822` | gender | 离间男性目标选择器 | 显示当前性别合法候选，不读本体性别 |

### UI 战场显示：3 次

| 文件及行号 | 属性 | 行为 | 要求 |
|---|---|---|---|
| `src/ui/panels/board-panels.js:29` | camp | 武将信息行 | 展示当前有效势力 |
| `src/ui/panels/board-panels.js:37` | camp | 武将卡 `data-camp` 样式属性 | 颜色/样式与当前势力一致 |
| `src/ui/panels/board-panels.js:85` | camp | 势力飘带 | 与信息行同步 |

当前战场没有性别文本展示点；AA 化身面板可展示公开选择的化身、技能与当前性别/势力。图鉴和选将仍显示武将目录的原始属性，不能因本局某角色化身而污染目录。同一窗口换化身后，战场及操作候选应在一次正常渲染中刷新。

## 无需改为有效属性读取的 13 次原始命中

| 文件及行号 | 成员 / 次数 | 类型与理由 |
|---|---|---|
| `src/engine/runtime.js:19` | `hero.camp` / 1 | 读取静态武将目录，初始化本体势力 |
| `src/engine/runtime.js:20` | `hero.gender` / 1 | 读取静态武将目录，初始化本体性别 |
| `src/engine/game-engine.js:1333` | `spec.camp` / 1 | 激将“蜀”/护驾“魏”的规则参数，不是角色 |
| `src/ui/panels/lobby-panels.js:8` | `hero.camp` / 1 | 目录排序 |
| `src/ui/panels/lobby-panels.js:74` | `hero.camp` / 1 | 选将选项文字 |
| `src/ui/panels/lobby-panels.js:89` | `hero.camp` / 1 | 选将势力筛选 |
| `src/ui/panels/lobby-panels.js:91` | `hero.camp` / 1 | 选将卡静态样式 |
| `src/ui/panels/lobby-panels.js:103` | `hero.camp` / 1 | 选将卡静态势力文字 |
| `src/ui/panels/lobby-panels.js:282` | `hero.camp` / 1 | 图鉴按武将本体势力分组 |
| `src/engine/equipment.js:296` | gender / **2** | 注释中的条件说明，不是执行代码；迁移后应顺手对齐说明 |
| `src/data/cards.js:286` | gender / **2** | 卡牌实现说明字符串，不是执行代码；迁移后应对齐文字 |

补查 `['camp']` / `["camp"]` / `['gender']` / `["gender"]` 未找到动态运行态读取；角色初始化键和 `LORD_AID_SPECS` 的静态 `camp:` 键单独保留。规则“身份阵营”使用 `roles` / `roleSides` / `sideOf`，不属于武将“势力”覆写，禁止把这些概念混在一起修改。

## AA-G2 建议：全量迁移运行态语义，保留静态资料

建议裁定**全量迁移上述 30 次运行态读取**，不限定在“发动化身”的代码路径。理由是化身改变后，普通杀、装备、主公技、AI 行动和 UI 操作都在化身函数之外执行；仅在选择化身时覆写，会让同一角色在不同路径被看作不同势力/性别。30 次读口分布在 10 个文件，边界明确，可通过静态守护与对应规则组合测试约束。

建议契约：

1. `effectiveGender(state)` / `effectiveCamp(state)` 是唯一公开当前属性出口。使用公开已选择的化身属性；没有有效覆写时返回本体值。**保留原始 `state.gender` / `state.camp`**，不原地改写目录或抹掉本体。
2. 此出口不暴露未选择的化身牌、私有化身池或隐藏身份；AI 与规则读取同一份公开当前属性。AI 原始字段直接读取应列为禁止项，目录初始化及规则参数逐条例外。
3. 暴虐的 `sourceCampBeforeDamage` 在扣血前采样当前有效势力，之后仍按既有事件快照跨濒死使用。不得为了统一出口改成触发暴虐时重读当前属性，否则会改写 Z 阶段已固定的时序。
4. 化身失效/失去全部技能与恢复本体的裁决由 AA1/AA4 管理；属性出口只消费明确的覆写状态，不自行推断技能所有权。`tian`/`chuang` 保留但技能无效的被动作用由 AA1 校验。
5. UI 当前势力文字、样式、飘带与操作候选统一刷新；选将与图鉴保留目录原始属性。暂时选择界面未提交时，不应提前改写有效属性。

建议后续验证的具体风险：肉林双向双闪与雌雄条件随公开化身性别变化；结姻/离间 UI 与引擎候选一致；庸肆/血裔计数随势力变化；激将/护驾/颂威/救援/黄天/制霸资格变化；暴虐跨濒死仍用扣血前快照；切换与移除覆写能恢复本体且不改变其他角色目录；AI 对未选择的私有化身牌变化保持同一可见决策。以上是验证计划，本文未宣称其已经完成。

## 重现度量

以下 Python 只读取 Git 冻结对象；即使工作树开始迁移，重跑仍对应本报告基线。

```python
import re
import subprocess
from collections import Counter

rev = '9c0ac5e1ae06e00bd7ebad68bb1e5d137e9125f5'
files = subprocess.check_output(
    ['git', 'ls-tree', '-r', '--name-only', rev, 'src'], text=True
).splitlines()
counts = Counter()
for file in files:
    if not file.endswith('.js'):
        continue
    source = subprocess.check_output(['git', 'show', rev + ':' + file], text=True)
    for label, pattern in [('hasSkill', r'\bhasSkill\s*\('),
                           ('gender', r'\.gender\b'), ('camp', r'\.camp\b')]:
        hits = list(re.finditer(pattern, source))
        counts[label + ':occurrences'] += len(hits)
        counts[label + ':lines'] += sum(bool(re.search(pattern, line))
                                        for line in source.splitlines())
        for hit in hits:
            print(label, file, source.count('\n', 0, hit.start()) + 1)
print(counts)
# hasSkill 要排除 state.js:332 的函数声明；其余成员读取按上表人工语义分类。
```

## 冻结基线调用位置附表

下列行号对应上文156次真实调用，不含函数声明；同一行有两个调用时明确标记。

| 文件 | `hasSkill` 调用行号 |
|---|---|
| `src/engine/ai.js` | 47, 57, 65, 66, 78, 82, 181, 182, 191, 211, 212, 632, 646, 982, 1014, 1035, 1046, 1063, 1079, 1104, 1120, 1144, 1153, 1171, 1176, 1191, 1203, 1211, 1257 |
| `src/engine/damage-dying.js` | 54, 667, 835 |
| `src/engine/equipment.js` | 50 |
| `src/engine/game-engine.js` | 544, 563, 564, 588, 589, 1829, 1839, 2462, 2488, 2496, 2515, 3267 |
| `src/engine/guhuo.js` | 119, 175, 277, 304 |
| `src/engine/judge-area.js` | 57 |
| `src/engine/sha-flow.js` | 587, 590, 592, 601, 602, 603 |
| `src/engine/skills.js` | 79, 104, 119, 139, 154, 161, 221, 318, 432, 476, 520, 575, 595, 706, 794, 924, 952, 981, 1001, 1025, 1239, 1270, 1348, 1366, 1381, 1405, 1478, 1502, 1543, 1641, 1737, 1819, 1897, 1966, 2041, 2173, 2219, 2235, 2287, 2311, 2337, 2352, 2508, 2564, 2580, 2682, 2700, 2797, 2834, 2872, 2931, 2950, 2993, 2994, 3014, 3111, 3123, 3135, 3156, 3176, 3235, 3251, 3263, 3289, 3337, 3384, 3476, 3619, 3651, 3700, 3777, 3800, 4003, 4030, 4088, 4105, 4171, 4281, 4439, 4585, 4675, 4718, 4728, 4784, 4872, 5145, 5228 |
| `src/engine/state.js` | 67, 300, 310, 422, 454, 512, 518 |
| `src/engine/tricks.js` | 95, 1076, 1264, 1432（2次）, 1468 |

## AA2 局部迁移记录（后续增补）

2026-09-07：按上述清单将30次运行态读取迁至 `effectiveCamp` / `effectiveGender`；`state.js` 血裔点由核心层代理同步迁移，其余规则与UI读口按窄块修改。静态目录/构造与 `spec.camp` 保留，雌雄注释与卡牌实现说明同步更新。

新增 `tests/v16_aa2_identity_attributes.test.mjs` 24例（含静态守护）、`tests/ui_v16_aa2_identity_attributes.test.mjs` 4例，本地专项执行通过。覆盖公开覆写不改本体、红颜/缠怨隔离、肉林双向响应、雌雄、结姻/离间、庸肆/血裔/颂威、主公技资格、暴虐伤前快照、AI无本体属性旁路、UI操作与当前势力显示。未修改任何旧行为断言；AA全阶段门禁与合并部署仍由主任务统一验证，此处不作完成声明。
