# 全方位代码审计与修复纪要 · 2026-06-09

对 `三国杀 1v1`(v10)做的一次全方位代码审计,以及随后的修复链(PR #105–#113,
均已合并入 `main`,零回归)。本文记录审计结论、已修复项、以及剩余 backlog
(含风险/价值评估),供后续拆 issue 参考。

## 审计范围与方法

- **代码**:`src/engine/game-engine.js`(~4800 行)、`src/ui/dom-adapter.js`
  (~2450 行)、`src/engine/{state,runtime,phases,judgement,card-runtime,
  skill-runtime}.js`、`src/data/*`、`index.html`、`src/styles/*`、`tests/*`(~118)。
- **维度**:安全、游戏规则正确性、测试质量、架构/技术债。
- **方法**:4 个并行专项审计 + 对 Critical/High 及关键 Medium 逐条**对照官方
  规则缓存**(`official-skill-cache/gltjk-sanguosha-rules`)复核后才采信。

## 总体评价

工程质量明显高于业余项目:数据驱动的牌/技能/装备元数据、干净无环的模块依赖、
一致的 `{ok,message}` 错误处理(引擎不抛异常)、确定性可复现的引擎测试、
几乎无安全面(`escapeHtml` 纪律 + 无自由文本输入 + 无网络/存储/eval)。
主要风险集中在**规则合规偏差**(与项目"规则合规版"定位冲突)和两个巨型文件
(`game-engine.js` / `dom-adapter.js`)的结构债。

## 已修复(PR #105–#113,全部合并)

### 规则合规(对照官方 spec,直接影响 1v1 胜负 / 牌身份)

| PR | 项 | 偏差 → 修复 |
|---|---|---|
| #105 | C1+C2 濒死 | 伤害 `Math.max(0,…)` clamp → 允许负血;每名响应者限一次救援 → 同一响应者可连续出多张【桃】/【酒】直至回复至 1 点。依据:`flow__neardeath.md` 法正例(1 体力受闪电 3 伤,一张桃后仍未回到 1) |
| #106 | H1 无懈覆盖(单目标) | 无懈仅 5 张锦囊可挡 → 补 无中生有 / 南蛮 / 万箭 / 延时锦囊放置(乐/兵/闪电)。1v1 中南蛮/万箭单目标,单窗口即合规 |
| #107 | H2 八卦 vs 万箭 | `playAOE` 的【闪】响应缺八卦红判定兜底 → 补;顺带统一【杀】与【万箭】两处八卦逻辑(`tryBaguaDodge`) |
| #108 | M1 朱雀羽扇 | 转火杀永久 `mutate card.type`(弃置洗回变永久火杀,污染牌堆) → 改为「本次使用」临时视为 + `discardCard` 还原物理牌身份 |
| #112 | H1b 桃园逐目标无懈 | 桃园对双方回血无法分别无懈 → 每名受伤目标独立开无懈窗口 |
| #113 | H1b-2 五谷逐目标无懈 | 五谷每人「获得一张」无法分别无懈 → 重构 `processWuguPick` 为逐目标驱动,`wuxie-response` / `wugu-pick` 两类暂停交错覆盖 |

> 至此审计中**所有规则正确性偏差(Critical/High/Medium)均已修复**,无懈时机全覆盖。

### 快赢 / 工程改进

| PR | 项 |
|---|---|
| #109 | 文档准确性:README/package.json 由 v6.1/26 技能 → v10/31 技能(7 主动)+ 审计修复;修正技能计数 |
| #110 | 完成 `resolvePendingChoice` 注册表迁移:15 个手写 `if (pending.kind===…)` 分支 → 统一 `RESPONSE_KIND_RESOLVERS` 派发(engine 净 −20 行) |
| #111 | PR 测试门禁:新增 `ci.yml`,`pull_request` 触发 `npm run verify`(此前仅 push main 跑测试,PR 不被测) |

### 安全审计结论:无可利用漏洞

无 XSS(每个插值 `innerHTML` 都过 `escapeHtml` + 无自由文本输入)、无 `eval`/
`new Function`、无网络 I/O、无 `localStorage`、无原型污染向量、CI 用 pinned
actions + 最小权限。`Math.random` 仅用于游戏机制,非安全相关。

## 审计中被否证的"问题"(核实后非真)

逐条复核时发现专项审计有数处**字面 grep 误报**,均已验证否证、未误删:

- **濒死响应顺序**:曾疑「应让濒死者先自救」,经查 `flow__neardeath.md`「从当前
  回合角色开始按逆时针」→ 引擎 `[turnActor, opponent]` **本就合规**。
- **"死 `els`"**(`enemyCamp`/`playerCamp`/`enemyRibbon`/`playerRibbon`):实际经
  **计算属性键** `els[actor+'Camp']` / `els[actor+'Ribbon']`(`renderHero`)在用,
  删了会让渲染崩溃。仅 `statusBanner` 是真未读取的单个 `els` 条目(其 HTML 仍是
  可见样式化 UI)。
- **"AI 近零耦合,可直接抽 `ai.js`"**:实际 AI 调用 ~13 个核心引擎函数
  (`playCard`/`useSkill`/`canPlayCard`/`startTurn`/`advancePhase`/…),需依赖注入
  工厂才能干净抽出,非 cut-paste。
- **"card-as 4 个 handler 结构相同可生成"**:实际 龙胆(双向)/武圣(含装备区源)/
  倾国/国色 差异显著,合并后更难读,属净负。

> 教训:删 UI / 重构前必须验证(尤其计算属性键、跨 actor 计算键),不能凭字面 grep。

## 剩余 Backlog(未做,含风险/价值评估)

| 项 | 风险 | 价值 | 备注 |
|---|---|---|---|
| jsdom UI 执行测试 | 中 + **破坏零依赖** | **高**(最大盲区:`dom-adapter.js` 2450 行从未被执行,52 个测试仅正则匹配源码) | 需引入 `jsdom` devDependency + CI 装依赖,或手写 DOM shim。唯一价值真正高的剩余项 |
| `renderPendingChoice` 表驱动 | **高**(441 行 UI,无执行测试守护,无法可视验证) | 组织(最大单点复杂度) | 建议等有 jsdom 测试后再做 |
| AI 抽 `src/engine/ai.js` | 中(DI 工厂改写 ~430 行) | 组织(god-file −9%) | 用 `createAI(deps)` 注入 ~15 个引擎函数 |
| `playCard` 派发表 | 中 | 组织(274 行 if 链) | 仿 `RESPONSE_KIND_RESOLVERS`,`cards.js` 加 `engineHandler` |
| test harness 去重 | 低 | 组织 | 114 份重复 `test()`(3 种变体)+ 29 份 `c()` 工厂 → `tests/helpers/{harness,fixtures}.mjs` |
| ES5 `var` → `let/const` | 低 | 组织 | 全引擎 703 `var`、0 `let/const`,与 ES module 形态不一致 |
| L1 克己可选 / L2 寒冰可选 | 低 | **极低** | 1v1 跳弃牌永远最优;寒冰已有 auto/decline 偏好。纯规则洁癖 |
| 分享按钮 stub | 低 | 低 | `dom-adapter.js` 角落分享按钮 click 仅 `console.info('…placeholder')`,实为未实现功能占位(非死代码) |
| `statusBanner` 死 `els` / `randomSuit` 的 `Math.random` 兜底 | 极低 | 极低 | 微清理 |

## 当前状态

- `main` @ #113:`build:check` + 全量 **119** 测试全绿。
- 新增 PR CI(`ci.yml`)门禁后续 PR。
- 规则层与文档已与 v10 + 审计修复对齐。
