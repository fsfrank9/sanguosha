# v15 X: 第五轮审计留账清偿 (F8-F14) — 2026-08-07

W 批收官时"确证未修"的八项留账 (`docs/audit/2026-08-06-w-ledger.md` F8-F14
表, 其中 F8 含被主动还原的半拉子修复) 本批一次性清零。每条按账本记录的
根因/官方出处/对抗验证点名的坑落地; 行为钉 `tests/v15_x_ledger_clear.test.mjs`
(17 例, 每条至少一钉一反例)。

## 逐项清偿

### F8 [高] 借刀转化面 — 闸口与点火同点收口

- **闸口** (`tricks.js resolveJiedaoDecision`): 手写字面牌型扫描 → 收口到
  `hasShaResponseAvailable` (真杀 + 武圣红牌/龙胆闪, 含装备区) + 丈八蛇矛
  (两张手牌合成) + 蛊惑, 与点火同一单点 — 闸口放行的牌点火时必然取得到。
- **点火** (`jiedaoFireOpponentSha`): `removeFirstCardOfType`×3 →
  `findResponseCard`。转化/合成走青龙续杀 (audit4-L1) 同款: 组成实体先入
  弃牌堆、虚拟【杀】流经结算 (`discardCard` 对 virtual 跳过, 守恒基线不变)。
- **坑 (对抗验证点名)**: 二次合法性拒绝时的回滚 —— 虚拟杀**不得** `putCard`
  回手 (凭空多牌破坏守恒), 组成实体自弃牌堆 `moveCard` 取回、物理杀原样退回。
  行为钉: 丈八两张手牌在窗口挂起期间空城激活 → fire 被拒 → 两张实体回手、
  弃牌堆无滞留、全区域 census 不变。

### F9 [高] 猛进 (武将技) 先于 贯石斧 (装备技)

- `resolveShaAfterResponse` 闪避分支: 贯石斧短路 `return` 早于 `onShaDodged`
  派发 → 钩子前移为分支首个动作 (官方 `flow__use.md:123` 两技同时机 +
  `rule__principle.md` 武将技先于装备技)。
- 贯石闸门移入 `continueShaDodgeAfterSkills` 头部 — 同步路径与猛进恢复路径
  共用: 猛进 ask 挂起收窗后仍进贯石, 贯石 ask 再挂起即**连续双挂起**链
  (单槽先后占用, 不冲突)。
- **坑**: `onShaDodged` 只在 `resolveShaAfterResponse` 单点派发, 贯石
  resolver **不回补**钩子 (回补会双跑猛进)。贯石 ask-decline 收尾收口到
  `continueShaDodgeAfterGuanshi` (青龙时机 + 弃置 + 闪避日志) — 实战贯石/
  青龙同占武器槽互斥, 该路径差异不可观测, 结构上仍收口。

### F10 [中] 闪电传递查帷幕

- `judge-area.js moveShandianOnward`: 候选过滤此前只查同名去重 → 增加
  `weimuBlocksCard(game, candActor, trick)` (贾诩帷幕是目标合法性类锁定技,
  `flow__condition.md:101`; 闪电为黑桃延时锦囊)。
- **坑**: 只能注入 `weimuBlocksCard` 窄谓词 (引擎装配处包装注入), **不得**
  改用 `isLegalCardTarget` — 后者对 shandian 恒 false (延时锦囊不经它使用)。
- 全环不合法 → 回到自己判定区 (官方移动规则原有分支, 复用)。

### F11 [中] 银月枪的"使用"半面

- SP 010 "每当你于回合外**使用或打出**黑色手牌时" — 此前只接了"打出"
  (`consumeResponse`/`consumeWuxie`) 与濒死黑酒; 借刀/挑衅**逼出的杀是
  "使用"**, 不触发。
- 落点: 账本警告 playSha 入口有实质危险 (虚拟牌无手牌来源 / 拒绝无法回滚)
  → 改在两处强制使用的**调用点**、二次合法性成立之后派发:
  `jiedaoFireOpponentSha` 与挑衅两分支 (`skills.js triggerTiaoxinYinyue`)。
  颜色按 `effectiveCardColor` (红颜口径), 转化组成牌逐张判; 由此开出的响应
  窗口经 pendingChoice 队列与杀自身的窗口先后排队。

### F12 [中] 妄尊排到回合角色准备阶段技能之后

- 同一时机"准备阶段开始时"按官方从当前回合角色起座次依次
  (`glossary__flow.md:30`, 与 F5 断肠/行殇同一判例) → 回合角色的观星/洛神/
  神速/英魂先于其他座席的妄尊; 此前妄尊固定排在最前。
- **坑**: 字面"把 seatsFrom 循环移到 guanxing 分支之后"会让妄尊被观星挂起
  吞掉 (`processPreparePhase` 在观星玩家分支就 return) → 移到
  `continueTurnAfterPreparePhase` 头部: 它是全部准备阶段路径 (同步完成 +
  观星/洛神/神速 resolver + prepareResume 排空) 的唯一收束点, 每回合恰好
  进入一次, 妄尊在此不重不漏。

### F13 [中] 铁骑 (武将技) 先于 雌雄 (装备技)

- 单目标路径此前为 雌雄→铁骑, 与多目标链的 locks(武将技)→cixiong(装备技)
  相反 (W 批已记录该口径差) → `computeShaResponseLock` 前移到
  `designateCixiongAndResolve` (雌雄之前), 锁定结果随 `pauseState.playSha`
  快照携带, 雌雄挂起恢复经 presetLock 传入, 不重跑 hook (铁骑不二次判定)。
- **复核 (账本要求)**: 多目标链两遍分跑口径不动 (本就合序); 享乐快照
  (`xiangleCost.source.responseLocked`) 本就携带锁定, 重入路径一致。
  行为钉: 雌雄 ask 挂起恢复后红判锁定不丢 — 目标持闪 + ask 也不开闪窗。

### F14 [低] AOE 逐目标无懈窗口的展示目标

- `advanceWuxieChain` 的窗口 meta 此前只认 `currentTarget/targetActor/
  victimActor`, 逐目标窗口 (南蛮/万箭/五谷: `order+idx`; 桃园/铁索:
  `targets+idx`) 三字段全空 → 抽 `wuxieWindowTargetSeat(chain)` 与
  `recordWuxieStance` 的逐 trick 提取同映射 (delayed-judge 补 `ownerActor`)。
  纯展示字段, 三条红线不涉。

## 评审收口 (opus 对抗端到端复现, 方法论①)

七项裁定: **六项 CONFIRMED-OK, F11 被驳倒后已修**。全部结论有脚本实证
(census 前后比对 / head-base 对照 / 12 类无懈窗口全量 diff)。

**[高, 驳倒→已修] F11 银月枪"使用"面缺终局/濒死守卫**: 受害者濒死 ask
挂起 (杀致 hp 0) 时旧接线同步插入 1 点伤害把 hp 打到 -1, 救援的桃只能补回
0 → **"能救活"变"死"** (head/base 对照实证); 终局后仍触发并留悬空响应窗。
收口在 `triggerYinyueQiang` 单点: ① gameover 闸 (与同类钩子一致);
② 濒死进行中挂 `deferredAfterDying` (该出口自带 gameover 闸), 濒死收束后
作为独立事件触发 — 濒死黑酒路径 (audit4-L2) 同样受益; ③ 持枪者/目标已
倒下不触发。补两条钉 (濒死救援先收束 / 终局零残留)。钉子当初没抓到的
原因如实记录: 三条 F11 用例受害者全满血, 从不进濒死/终局。

**确证 OK 的六项要点**: F8 守恒六场景全过 (含武圣装备区来源/丈八回滚/
蛊惑不双弃/虚拟杀×奸雄); F9 `onShaDodged` 全仓唯一派发点 (grep 实证),
双挂起两 pauseState 不共存, 雷击占槽的三挂起链亦收敛; F10 全环帷幕回到
自己 (与官方左慈判例逐字一致); F12 收束点调用穷举 + AI 主公 prepareResume
路径实测恰好一次; F13 多目标链 hunk 零触碰、鬼道在铁骑判定 (non-pausable)
恒 auto 不开窗、锁定管道 (享乐/雌雄快照) 完整; F14 12 类窗口 diff 仅
意图内 5 行, 借刀展示不变。

**低项留账 (评审点名, 本批不修)**:
- F11 队列窗口 options 快照过期 — 银月窗先于杀的闪窗快照候选, 同一张闪
  被杀消耗后仍列出 (假选项, 选中仅提示无效; 引擎不崩守恒不破)。
- F10 `moveShandianOnward` 全环不合法的兜底日志写死"对手判定区已有同名牌",
  帷幕挡下时文案与实因不符 (cosmetic)。
- F10 `weimuBlocksCard` 按候选者自己的 `effectiveCardColor` 判色 → 红颜
  持有者的黑桃闪电被视为红、帷幕失效 — 谓词既有 (AOE 共用), 非本批引入。
- F8 武圣把已装备红武器转化后遭二次合法性拒绝时, 回滚退回**手牌**而非
  装备槽 (青龙续杀同款精度), 且此时交武器兜底会变"无效果"; 守恒不破,
  极罕见组合, 留账。

## 门禁

- 全档 **206 文件绿** (205 + 新增 `v15_x_ledger_clear`, 19 例); `build:check` 过。
- 守恒 soak 600 种子零失败 (本批加档实跑); 三基准不降 (v12_i 64.0% /
  M4 5p 67.9% · 4p 69.1% / Q2 分布可测移动)。
