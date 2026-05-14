# v7 — 牌效果与流程规则对照官方 spec-compliance Series

> 历史延续：本文档承接 `2026-05-13-sanguosha-v6-logic-correctness.md` 中的 v6.1 阶段。v7 的"下一步方向"原本写在 v6 文档末尾，2026-05-14 拆分到独立文件。
> 下一代工作（v8 UI 集成、装备扩展、技能扩充）见 `2026-05-14-sanguosha-v8-ui-integration.md`。

## 缘起

v6.1 完成后，用户指出"目前里面很多牌的用法都是不对，规则很多也是有问题的"，并提供 https://gltjk.com/sanguosha/rules/ 作为权威规则参考。完整 55 页规则镜像通过 PR #26 合入 `official-skill-cache/gltjk-sanguosha-rules/` 作为本地资料源。

逐条对照 gltjk 镜像（`card__basic` / `card__scroll` / `card__equipment` / `flow__use` / `flow__damage` / `flow__judge` / `flow__neardeath` / `flow__condition` / `rule__principle`），audit 发现 16 项 spec 偏差，按硬伤 / 行为偏差 / 基础流程缺失分 3 个 tier 修复。

## 完整 PR 列表

### Tier 1：影响盘面的硬伤
| PR | 修复对象 | spec 引用 | 合并号 |
|---|---|---|---|
| PR-1 | 【桃】支持 target 选择（己方 / 受伤的对手） | `card__basic.md` "包括你在内的一名已受伤的角色" | #27 |
| PR-2 | 【桃园结义】对未受伤角色无效（不触发回血事件） | `card__scroll.md` "对未受伤的角色无效" | #28 |
| PR-3 | 【麒麟弓】只弃 1 匹马（含 pendingChoice 二选一） | `card__equipment.md` "弃置其装备区里的一张坐骑牌" | #29 |
| PR-4 | 【雌雄双股剑】目标二选一 + 性别检查 + 指定目标后时机 | `card__equipment.md` "指定与你性别不同的一个目标后，令其选择一项" | #30 |
| PR-5 | 【借刀杀人】双合法性检测（选 Bn 时 + An 用杀时）+ 目标决策 | `card__scroll.md` "须进行两次使用【杀】的合法性检测" | #31 |
| PR-6 | 延时锦囊同名禁叠（判定区已有同名 → 不合法目标） | `flow__condition.md` "判定区里有延时类锦囊牌的角色不是使用同名..." | #32 |
| PR-7 | 【五谷丰登】reveal-then-pick 结算流程 | `card__scroll.md` "亮出 X 张...获得这些牌中（剩余）的一张" | #33 |

### Tier 2：行为偏差
| PR | 修复对象 | spec 引用 | 合并号 |
|---|---|---|---|
| PR-8 | 【酒】每回合限一次 + shaBonus 绑回合 | `card__basic.md` "每回合限一次"；shaBonus 基于"声明【杀】的回合" | #34 |
| PR-9 | 【过河拆桥】1V1 二选项（弃装备区 / 看手并弃） | `card__scroll.md` "1V1 变体" | #35 |
| PR-10 | 【顺手牵羊】1V1 无距离限制（任意区域） | `card__scroll.md` "1V1 变体：有牌的对手" | #36 |
| PR-11 | 【兵粮寸断】1V1 无距离限制 | `card__scroll.md` "1V1 变体" | #37 |
| PR-12 | 【闪电】next-valid 链转 + 判定区冲突回退 | `card__scroll.md` "若其下家不是此【闪电】的合法目标..." | #38 |

### Tier 3：基础流程缺失 / 暂缓项
| PR | 修复对象 | spec 引用 | 合并号 |
|---|---|---|---|
| PR-13 | 濒死流程（hp≤0 → 进入处于濒死状态 → 双方按顺序提示 桃 / 酒） | `flow__neardeath.md` 完整结算流程 | #39 |
| PR-14 | 【丈八蛇矛】2 手牌当虚拟【杀】使用 / 响应 | `card__equipment.md` "你可以将两张手牌当【杀】使用或打出" | #40 |
| PR-15 | 【方天画戟】最后一张手牌时 +2 额外目标标记 | `card__equipment.md` "若你使用的【杀】是最后的手牌..." | #41 |
| PR-16 | 【无中生有】target 可选（含对手） | `card__scroll.md` "包括你在内的一名角色" | #42 |

---

## PR 落地详情（按时间顺序）

### PR-1 落地 — 桃 target 选择

**问题**：`game-engine.js:1797` 已经禁止满血用桃（这条 audit 报告误报），但 `playTao` (`:1998-2003`) 硬编码 `self.heal(1)`，不支持把【桃】用在受伤的对手身上——而 gltjk 明文是"包括你在内的一名已受伤的角色"。

**改动**：
- `canPlayCard`：放宽为"任一方受伤即可"（双方满血才拒绝）
- `resolve tao`：接受 `options.taoTarget = 'player' | 'enemy'`；缺省回退顺序 = 自己受伤 → 自己；否则 → 对手。Target 满血即 reject。
- `CARD_RULES.tao`：summary / targets / effect 三字段对齐 gltjk 文本
- 新增 `tests/tao_target_choice.test.mjs`（6 条断言）覆盖 canPlayCard / 自治 / 对治 / 双满血拒绝 / 单受伤回退

**回归**：`npm run verify` 全绿，包含原 `tests/game_engine.test.mjs` 的 "tao heals but never above max hp"——后者依赖默认 newGame 双方均为满血，所以二次出桃仍然被拒。

### PR-2 落地 — 桃园结义 对未受伤角色无效

**问题**：`game-engine.js:2074-2080` 旧实现 `['player', 'enemy'].forEach(side => game[side].hp = min(maxHp, hp+1))` 对所有角色无条件 +1（被 `Math.min` 截断）。gltjk 明文："对未受伤的角色无效"——这意味着对满血角色根本不触发"回复体力"事件，今后若加 仁心 / 节命 等"回复体力时"hook，触发集合会不一样。结算顺序也违反 `rule__principle.md` 多角色结算顺序原则 a.（"从当前回合角色开始按逆时针方向"，1v1 = 发动者先）。

**改动**：
- `resolve taoyuan`：循环顺序改成 `[actor, opponent(actor)]`；每个目标先判 `hp >= maxHp`——满血则记"对 X 无效"日志且跳过 heal；受伤才回血
- `CARD_RULES.taoyuan`：summary / effect 对齐 spec
- 新增 `tests/taoyuan_wounded_only.test.mjs`（5 条断言）：双方受伤 / 仅发动者受伤 / 仅对手受伤 / 双方满血 / 顺序检查

**保留行为**：原 `tests/cards_equipment.test.mjs` 用例（双方 hp=2 → 双方变 3）仍然通过。

### PR-3 落地 — 麒麟弓 弃 1 匹马 + pendingChoice

**问题**：`game-engine.js:1253-1255` 旧实现：
```js
if (weapon.type === 'qilin') {
  if (game[targetActor].equipment.horsePlus) loseEquipment(...);
  if (game[targetActor].equipment.horseMinus) loseEquipment(...);
}
```
**两匹马同时弃**——违反 gltjk `card__equipment.md` 明文 "弃置其装备区里的一张坐骑牌"。"你可以" 也意味着应该是 optional。

**改动**：
- 提取 `applyQilinDiscard(game, sourceActor, targetActor)`
  - 0 匹马 → 不触发
  - 1 匹马 → 直接弃（没有可选项）
  - 2 匹马 → 看 `skillPreferences.qilin`:
    - `'auto'` (AI 默认): 弃 +1 马（启发式默认）
    - `'ask'` (player 默认): 设 `pendingChoice = { kind: 'qilin-pick', actor, target, horseSlots }`
    - `'decline'`: 不触发
- 新增 `resolveQilinPickChoice` 处理 `{slot, decline}`
- `resolvePendingChoice` dispatch 添加 `qilin-pick`
- `CARD_RULES.qilin`：summary / effect / engineHooks 三字段对齐 spec + 新流程
- 新增 `tests/qilin_horse_pick.test.mjs`（9 条断言）覆盖 0/1/2 匹 × auto/ask/decline × player/enemy 路径
- 更新 `tests/cards_equipment.test.mjs` "Qilin weapon effects are playable" 用例：用 `pref='auto'` + 断言 +1 弃 / -1 保留（旧用例期望两匹都弃——那是旧 bug 行为）

### PR-4 落地 — 雌雄双股剑 完整 spec 合规

**问题三连**：gltjk `card__equipment.md` 原文 "每当你使用【杀】指定**与你性别不同的一个目标后**，你可以**令其选择一项**：1.弃置一张手牌；2.令你摸一张牌。" 旧实现 (`game-engine.js:1324-1332`) 全错：

1. **时机错**：`applyWeaponHitEffects` 在 **造成伤害后** 调用——sha 被闪躲时雌雄根本不触发；spec 是"指定目标后"，即响应窗口之前
2. **决策错**：源 + 目标都没有决策权，自动 `hand[0]` 弃或源摸——spec 是源 optional + 目标二选一
3. **性别检查缺失**：根本没有 gender 字段

**改动**：

新增 `gender` 数据：
- `heroes.js`：所有 26 个英雄加 `gender: 'male' | 'female'`，按 gltjk `card__hero__*.md` 镜像（甄姬 / 大乔 / 黄月英 / 貂蝉 = female；其余 = male）
- `runtime.js`：`makePlayer` 读 `hero.gender`，缺省 `'male'`

引擎重构：
- 拆 `playSha` 为 `playSha`（指定目标后） + `continueShaAfterCixiong`（仁王/响应/八卦/贯石/青龙/伤害）
- 新增 `applyCixiongOnDesignate`：性别检查 → `skillPreferences.cixiong` (`auto`/`ask`/`decline`)
  - `ask` (player 默认): `pendingChoice = {kind:'cixiong-fire', actor, target}`
- 新增 `fireCixiongTargetChoice`：目标无手牌 → 强制源摸 1；否则按 `skillPreferences.cixiongResponse` 处理（`auto` = 弃 hand[0]；`ask` = `pendingChoice 'cixiong-choose'`）
- 新增 `resolveCixiongFireChoice` / `resolveCixiongChoose` / `resumePlayShaAfterCixiong`
- 暂停时 `pauseState.playSha = {actor, card, amount}`，resolve 后接续 `continueShaAfterCixiong`

`CARD_RULES.cixiong`：summary/effect/engineHooks 全部对齐 spec。

新增 `tests/cixiong_target_choice.test.mjs`（10 条）：同性 / AI auto / 目标无手牌 / 源 ask / decline / fire+target auto / target ask draw / target ask discard cardId / **闪躲后仍触发** / 源 decline。

**关键 spec 修复**：测试 9 "cixiong 在 sha 被闪躲后仍然触发"——这是旧实现完全做错的边缘行为，新实现按"指定目标后"时机已经正确放行。

### PR-5 落地 — 借刀杀人 双合法性检测

**问题**：gltjk `card__scroll.md`【借刀杀人】注：

> 注意：使用【借刀杀人】的过程中**须进行两次使用【杀】的合法性检测**：
> 第一次是在你选择 An 使用【杀】的目标 Bn 时（此时【杀】并未置入处理区，Bn 只是被选择为将要使用的【杀】的目标），因此你不能对攻击范围内没有使用【杀】的合法目标的角色使用【借刀杀人】；
> 第二次是在 An 选择是否对 Bn 使用【杀】时，须检测 Bn 是否为 An 使用【杀】的合法目标。

旧实现 (`game-engine.js:2356-2370`) 完全没做这两次检测：
1. canPlayCard 不查 An 的武器范围 / target-protection
2. resolve 时 `removeFirstCardOfType(weaponOwner, 'sha')` 直接拿出 sha 调 `playSha`，若 playSha 失败 sha 直接丢失
3. opponent 不能选择 decline（玩家无决策权）

**改动**：
- `canPlayCard`：第一次合法性检测——opponent 装备区有武器 + `canReachWithSha(opponent, source)` + `cardTargetProtection`（onCardTarget 钩子如 谦逊 / 空城）。装备效果（仁王 / 藤甲）不在 canPlayCard 拦截，因为 canPlayCard 不知道 opponent 具体出哪种【杀】，留给 resolve 阶段
- 新增 `resolveJiedaoDecision`：第二次合法性检测——opponent 有 sha + canReach + 无 onCardTarget protection；满足时按 `skillPreferences.jiedao` (`auto`/`ask`/`comply`(=`auto`)) 决定 fire / pendingChoice 'jiedao-decision' / decline
- 新增 `jiedaoFireOpponentSha`：取一张 sha 调 `playSha`；若 playSha 返回 fail（如 mid-resolve 距离/装备变化）→ 把 sha 放回手牌 + 交武器
- 新增 `transferWeaponJiedao`：把 opponent 武器移交 source 手牌
- 新增 `resolveJiedaoDecisionChoice`（resolvePendingChoice 加 `jiedao-decision` dispatch）
- `CARD_RULES.jiedao`：summary/effect/engineHooks 三字段对齐 spec

**spec 行为澄清（测试 10）**：opponent 用黑杀被 source 仁王盾抵消时，sha 仍视为"已使用"，weapon 留 An（spec: "An 需对 Bn 使用【杀】"，结果不影响）。

**新增** `tests/jiedao_dual_legality.test.mjs`（10 条断言）。

### PR-6 落地 — 延时锦囊同名禁叠

**问题**：gltjk `flow__condition.md` 共同合法性规则：

> 注意：使用延时类锦囊牌有一条共同的合法性检测规则：**判定区里有延时类锦囊牌的角色不是使用同名延时类锦囊牌的合法目标**。

旧实现（`game-engine.js:2307-2316`）只是 `judgeArea.push(card)`——若 opponent 已有【乐不思蜀】仍然会被叠第二张【乐不思蜀】，导致判定阶段重复结算。

**改动**：
- `canPlayCard` 加 `card.family === 'delayed'` 分支：根据延时锦囊种类确定 target（乐 / 兵 → opponent；闪电 → self），检查目标 `judgeArea` 是否已有同 `type` 卡，若有则 fail
- `CARD_RULES` 中【乐】【兵】【闪电】effect 字段补"v7 PR-6: 同判定区已有同名…时不合法"

**新增** `tests/delayed_trick_dedup.test.mjs`（8 条断言）：
- 乐已存在 → 拒绝
- 兵粮已存在 → 拒绝
- 闪电（self）已存在 → 拒绝
- 异名延时锦囊不冲突
- 闪电的目标是 self，opponent 持有同名不阻止
- 已放置一张后再放第二张被拒
- AI canPlayCard 同样检查
- 判定区清空后可重放

### PR-7 落地 — 五谷丰登 reveal-then-pick

**问题**：gltjk `card__scroll.md`【五谷丰登】

> - 执行动作：当此牌指定目标后，你**亮出**牌堆顶的 X 张牌（X 为目标数）
> - 作用效果：目标角色获得这些牌中（剩余）的一张牌
> > ◆若你未将执行动作完整执行完毕，终止此牌的使用结算
> > ◆使用结算结束后，将这些牌中剩余的牌置入弃牌堆

旧实现 (`game-engine.js:2422-2432`) 仅做 `[actor, opponent].forEach { game.deck.pop() → state.hand.push }`，**没有 reveal 步骤**，**没有可选**——只是把牌堆顶两张分发给两人。1v1 中目标 = 2 时不会有 leftover 入弃牌堆，但语义不符 spec。

**改动**：
- `resolve wugu`：先 `aliveActorCount` 取 X，然后 reshuffleIfNeeded 多次直到 `deck.length >= X`，仍不够则按 spec 终止使用结算（"未将执行动作完整执行完毕"）
- 一次性 reveal X 张到 pool 池，记 log
- 新增 `processWuguPick(game, sourceActor, wuguCard, pool, order, idx, options)` 顺序循环：
  - pool 仅余 1 张时强制取走（无可选项）
  - 多张时按 `skillPreferences.wugu` 决定 (`auto` / `ask`)
  - `ask` → `pendingChoice = {kind:'wugu-pick', actor:picker, sourceActor, cards:[…]}` + `pauseState.wugu = {sourceActor, wuguCardId, pool, order, idx, options}` 续算上下文
- 新增 `resolveWuguPickChoice` 处理 `decision.cardId`，从 pool 中 splice 该卡进 picker 手牌，然后 `processWuguPick` 续算下一 picker
- 全部选完 → leftover (1v1 X=2 实际无 leftover) 入弃牌堆 → `success`
- `resolvePendingChoice` dispatch 加 `wugu-pick`
- `CARD_RULES.wugu`：summary/effect/engineHooks 三字段对齐 spec + 新流程

**测试**：新增 `tests/wugu_reveal_pick.test.mjs`（7 条断言）：auto / ask / resolve / 错误 cardId / 牌堆不足终止 / enemy AI / 1v1 X=2 无 leftover。

**legacy fix**：`tests/cards_equipment.test.mjs` 的 "core trick cards resolve" 用例切到 `skillPreferences.wugu='auto'` 走旧的"按顺序自动取"路径（player 默认 `ask` 现在会 pause）。

### PR-8 落地 — 酒 每回合限一次 + shaBonus 绑回合

**问题**：gltjk `card__basic.md`【酒】使用方法Ⅰ：

> - 使用时机：出牌阶段。**每回合限一次**
> - 作用效果：目标角色于此回合内使用的下一张【杀】的伤害值基数 +1
> > ◆一名角色使用的【杀】是否会受到【酒】的影响是根据其声明使用的牌的牌名（【杀】）时是否为**其使用【酒】的那个回合内**来判断的

旧实现：
- `canPlayCard` 不查每回合限制 → 同回合可叠喝多次
- `resolve jiu` 用 `self.shaBonus = (self.shaBonus || 0) + 1` 累加 → 多张酒可叠 +N 伤害
- shaBonus 跨回合表面上由 `resetActorTurnState` / `resetEndOfTurnState` 复位（已存在），所以"绑回合"基本工作；但 `+= 1` 仍是 bug

**改动**：
- `phases.js`：`resetActorTurnState` / `resetEndOfTurnState` 都加 `flags.jiuUsedThisTurn = false`
- `canPlayCard`：`card.type === 'jiu'` 时检查 `flags.jiuUsedThisTurn` → fail "本回合已经使用过【酒】。"
- `resolve jiu`：`self.flags.jiuUsedThisTurn = true`；`self.shaBonus = 1`（不累加）
- `CARD_RULES.jiu`：summary/effect/engineHooks 对齐 spec
- `tests/phase_runtime.test.mjs`：补 `jiuUsedThisTurn: false` 期望键

**新增** `tests/jiu_once_per_turn.test.mjs`（6 条断言）：
- 第二张酒同回合被 canPlayCard 拒
- 酒+杀 → 2 dmg
- shaBonus 用一次清零，第二张杀回到 1 dmg
- 酒喝完不出杀 → 回合结束 shaBonus 归零
- 新回合可再次喝
- 不会累加（设 `shaBonus=5` 模拟，喝酒后变 1）

### PR-9 落地 — 过河拆桥 1V1 二选项

**问题**：gltjk `card__scroll.md`【过河拆桥】1V1 变体：

> ### 【过河拆桥】（1V1）
> - 使用目标：区域里有牌的对手
> - 作用效果：你选择一项：1.弃置目标角色的装备区里的一张牌；2.观看目标角色的手牌并弃置其中一张牌

旧实现 (`game-engine.js`) 用通用 `removeTargetZoneCard(targetActor, options.targetZone, options.targetCardId)` —— `targetZone` 接受 `'hand'`/`'equipment'`/`'judge'`，违反 1V1 spec 限定（不允许判定区）；玩家也无法看到对手手牌内容（spec 明文 "观看目标角色的手牌"）。

**改动**：
- `canPlayCard`：guohe 在 1V1 中只要求对手 hand 或 equipment 有牌；判定区有牌但其它两区皆空 → 拒绝
- `resolveGuohe1v1(sourceActor, targetActor, options)`：
  - `options.targetZone === 'judge'` → 显式拒绝
  - 显式 `'equipment'` / `'hand'` + cardId → 直走 `executeGuohe1v1Pick`（向后兼容老 UI）
  - 未指定 → 按 `skillPreferences.guohe`（`auto` / `ask` / `decline`）：
    - `auto` (AI 默认): 装备优先 → 手牌
    - `ask` (player 默认): `pendingChoice = {kind:'guohe-1v1-pick', actor, target, equipment:[…], hand:[…手牌内容…]}` （spec 选项 2 暴露手牌）
- 新增 `executeGuohe1v1Pick` + `resolveGuohe1v1PickChoice`
- `resolvePendingChoice` dispatch 加 `guohe-1v1-pick`
- `CARD_RULES.guohe`: summary/effect/engineHooks 三字段对齐 1V1 spec

**新增** `tests/guohe_1v1_two_options.test.mjs`（11 条断言）：canPlayCard 边界 / 显式 judge 拒绝 / equipment 直传 / hand 直传 / AI auto 优先装备 / AI auto 仅手牌 / player ask pendingChoice 暴露 hand 内容 / resolve equipment / resolve hand / resolve 错误 zone。

### PR-10 落地 — 顺手牵羊 1V1 无距离限制

**问题**：gltjk `card__scroll.md`【顺手牵羊】1V1 变体：

> ### 【顺手牵羊】（1V1）
> - 使用目标：**有牌的对手**
> - 作用效果：你获得目标角色的一张牌

标准【顺手】是"距离为 1 的一名区域里有牌的其他角色"，1V1 变体去掉了距离限制。

旧实现 `canPlayCard`：
```js
if ((card.type === 'shunshou' || card.type === 'bingliang') && !hasPassive(self, 'ignoreTrickDistance') && distance > 1) {
  return fail('距离不足...');
}
```
仍按标准包检查距离 1，违反 1V1 spec。

**改动**：
- `canPlayCard`：把距离检查从 `shunshou || bingliang` 缩到只剩 `bingliang`（PR-11 再去掉 bingliang）
- `CARD_RULES.shunshou`：summary/effect/engineHooks 对齐 1V1 spec

**测试更新**：
- `tests/skills.test.mjs` "黄月英【奇才】 ignores distance limits..." 旧用例假设无【奇才】时距离 2 阻挡 顺手——这与 1V1 spec 冲突。改写为 "v7 PR-10: 顺手牵羊 (1V1) 无距离限制 — 任何角色（含/不含奇才）都能在距离 >1 时使用"，验证两种身份都能在距离=2 下顺利出 顺手
- 注：奇才 在 1V1 中无实际意义（所有原距离限制的标准包锦囊在 1V1 都没了距离限制），保留技能数据但实际为 no-op

**新增** `tests/shunshou_1v1_no_distance.test.mjs`（7 条断言）：distance=2/3 可用 / 弃指定装备 / 偷判定区延时锦囊 / 偷指定手牌 / 对方完全无牌时 canPlayCard 拒绝 / 仅判定区有牌也通过（spec "有牌的对手" 不限区域）。

### PR-11 落地 — 兵粮寸断 1V1 无距离限制

**问题**：gltjk `card__scroll.md`【兵粮寸断】1V1 变体：

> ### 【兵粮寸断】（1V1）
> - 使用目标：**对手**
> - 作用效果：目标角色判定，若结果不为梅花，其跳过摸牌阶段

标准【兵粮】是"距离为 1 的一名其他角色"，1V1 变体去掉距离限制。

PR-10 已把 `canPlayCard` 中距离检查缩到 `bingliang` only；PR-11 把这条也去掉。

**改动**：
- `canPlayCard`：删除 `card.type === 'bingliang'` 的距离判断分支，留下注释说明 1V1 标准包内已无距离限制锦囊
- `CARD_RULES.bingliang`：summary / effect / engineHooks 对齐 1V1 spec
- `tests/skill_runtime_hooks.test.mjs` 中 "Qicai trick-distance" 测试改写：原断言要求 `canPlayCard` 引用 `SkillRuntime.hasPassiveEffect(..., 'ignoreTrickDistance')` 与 `distanceBetween(...)`，现在两条都不在 canPlayCard 里（顺手 / 兵粮 1V1 都没了距离）。改为：不硬编码 `hasSkill('qicai')` + 必须有 1V1 spec 注释，保留 seam 给未来恢复时用

**新增** `tests/bingliang_1v1_no_distance.test.mjs`（6 条断言）：distance=2/3 可用 / 实际放入对手判定区 / 同名禁叠（PR-6）仍生效 / 梅花判定 → 不跳过摸牌 / 非梅花判定 → 跳过摸牌。

至此 **PR-10/11 完成 1V1 距离规范化**：1V1 标准包内已无 distance-limited 锦囊牌；【奇才】在 1V1 中保留数据但实际为 no-op。

### PR-12 落地 — 闪电 next-valid 链转 + 判定区冲突回退

**问题**：gltjk `card__scroll.md`【闪电】注：

> ◆【闪电】在使用结算结束后/目标角色被取消后，若对应的实体牌在处理区/判定区里，须将对应的实体牌置入其下家的判定区。**若其下家不是此【闪电】的合法目标，则将对应的实体牌置入其下家的下家的判定区，以此类推。若所有角色都不是此【闪电】的合法目标，则将对应的实体牌置入其判定区**

旧实现 (`game-engine.js applyJudgeAreaOutcome`) 非命中时无条件 `game[opponent(actor)].judgeArea.push(trick)` —— 没考虑 PR-6 定义的"判定区有同名延时锦囊 = 非合法目标"。在 1v1 中若两人都已有 闪电，第二张应当回到原判定区而不是叠到对手。

**改动**：
- `applyJudgeAreaOutcome` 中 `outcome.moveToNext` 分支加 next-valid 检查：若 opponent.judgeArea 已有同名 闪电 → 留在当前 actor 判定区；否则才推到 opponent
- `CARD_RULES.shandian`：effect 字段补 PR-12 链转语义说明

**新增** `tests/shandian_next_valid.test.mjs`（6 条断言）：
- 非命中 + 对手判定区空 → 移到对手
- 非命中 + 对手判定区已有同名 → 留在自己 (next-of-next 回归)
- 命中 → 受 3 点雷电伤害 + 闪电进弃牌堆
- 在 enemy 判定区命中 → enemy 受伤
- 在 enemy 判定区非命中 → 移回 player
- enemy 非命中 + player 已有同名 → 留在 enemy (对称 loop)

注：测试中命中场景需要在 `deck` 中放足够 padding 卡，避免 draw 阶段的 reshuffleIfNeeded 把弃牌堆里的 闪电 洗回手牌（引擎正常行为，但测试需规避）。

### PR-13 落地 — 濒死流程 (Tier 3 基础流程)

**问题**：gltjk `flow__neardeath.md` 完整流程：

> ## 濒死事件的结算流程
> 处于濒死状态时：从当前回合角色开始按逆时针方向依次进行响应，直到 A 将体力值首次回复至 1 点或 1 点以上为止...
> 能使用的牌：【桃】、【酒】

旧实现 (`game-engine.js:1005, 1777`) 直接把 hp ≤ 0 视作 game-over，**完全不模拟濒死结算**——即便玩家手里有【桃】也无救援机会，与 spec 严重违背。

**改动**：

引擎核心：
- `damage()` 末尾 hp≤0 时调用 `enterDying(actor, source)` 而不是直接 game-over
- `kurou` 路径 hp≤0 时也调用 `enterDying(actor, actor)`
- 新增 5 个函数：
  - `enterDying(dyingActor, sourceActor)`：初始化 `pauseState.dying = {actor, source, responders:[turn-player, opponent(turn-player)], idx:0, actedOnce:{}}`，立即 `processDyingNext`
  - `processDyingNext`：按顺序遍历 responders，每名通过 `attemptDyingRescue` 尝试救援；hp≥1 即结束；全部遍历无救 → game-over (winner = opponent(dyingActor))
  - `attemptDyingRescue(responder, dying)`：检查响应者手牌中可用的 桃 / 酒（酒仅 self），按 `skillPreferences.dying` 决定 auto/ask/decline；ask → pendingChoice 'dying-rescue'
  - `executeDyingRescue`：消耗指定 桃 / 酒，给 dyingActor + 1 hp
  - `resolveDyingRescueChoice`：处理 player decision (cardId 或 decline)，回到 processDyingNext
- `resolvePendingChoice` dispatch 加 `dying-rescue`

数据层：
- `CARD_RULES.tao` 加 PR-13 注：濒死阶段任意 responder 可救援
- `CARD_RULES.jiu` 加 PR-13 注：使用方法Ⅱ（仅濒死者本人）

**行为关键**：
- AI 永不救对手（仅救自己）
- player 收到 pendingChoice 'dying-rescue'，可选 `{cardId}` 或 `{decline:true}`
- 1v1 中 responder 顺序 = [turn-player, opponent]；spec 中 "上家" 在 1v1 = 对手

**新增** `tests/dying_flow.test.mjs`（8 条断言）：
- 玩家受致命伤有桃 auto → 自救存活
- 无桃无酒 → 死亡
- 有酒 auto → 用酒 Method II 自救
- player default ask → pendingChoice 'dying-rescue'
- resolve {cardId} → 救活
- resolve {decline} + 对手不救 → 死
- 苦肉 hp=1 + 有桃 → 自救存活
- AI 对手默认不救玩家（responder !== dyingActor + auto → skip）

### PR-14 落地 — 丈八蛇矛 (使用 + 响应)

**问题**：gltjk `card__equipment.md`【丈八蛇矛】：

> 技能：你可以将两张手牌当【杀】**使用或打出**

旧实现里 `Engine.playZhangbaSha(actor, [id1, id2])` 已经支持"使用"路径（line 3124），但**响应路径完全缺失**——`findResponseCard` 在没有真实 杀 / 武圣 / 倾国 / 龙胆 转化的情况下直接返回 null，即便目标装备 丈八 + 手牌 ≥ 2 也无法响应 决斗 / 南蛮 / 借刀 等需要打出 杀 的事件。

**改动**：
- `findResponseCard` 的 `type === 'sha'` 分支末尾加 丈八 兜底：装备 丈八 + 手牌 ≥ 2 + `skillPreferences.zhangba !== 'decline'` 时，consume 前两张手牌生成虚拟 杀
- `consumeResponse` 加 `response.extraCards` 处理：丈八响应弃两张物理手牌；虚拟杀对象不进弃牌堆（含 `physicalCard: null` 和 `virtual: true` 标记）
- log 形式 "发动【丈八蛇矛】，将【桃】、【闪】当【杀】响应【决斗】"
- `CARD_RULES.zhangba`：summary/effect/engineHooks 对齐

**新增** `tests/zhangba_response.test.mjs`（6 条断言）：
- `playZhangbaSha` 旧使用路径仍工作
- 决斗响应：装备丈八+无杀+2手 → 自动当杀响应
- 决斗响应：装备丈八+只 1 张手牌 → 无法响应 → 受 1 dmg
- 决斗响应：装备丈八+真 sha → 优先用真 sha（不弃手牌）
- `skillPreferences.zhangba='decline'` → 不走丈八响应路径
- 南蛮入侵响应同款（任何需要打出杀的事件）

### PR-15 落地 — 方天画戟 触发标记

**问题**：gltjk `card__equipment.md`【方天画戟】：

> 技能：若你使用的【杀】是最后的手牌，你使用此【杀】的额外目标数上限+2

旧实现完全没有 方天 触发检测（`CARD_RULES.fangtian.engineHooks` 标 "playSha:fangtianTargets" 但代码里压根没这分支）。

**1v1 注**：在 1v1 中只有 1 名对手（额定 1 + 额外 0），即便额外目标数上限+2 也无人可选；本 PR 仅做触发记录（`log + flags.fangtianBonus`）作为多人模式 / future trick 的占位。

**改动**：
- `playSha` 进入时先清 `flags.fangtianBonus = false`；若装备方天 + `self.hand.length === 0`（即上一刻该 sha 是最后一张），置 `flags.fangtianBonus = true` 并记 log
- `phases.js`：`resetActorTurnState` / `resetEndOfTurnState` 都加 `flags.fangtianBonus = false`（防御性复位）
- `CARD_RULES.fangtian`：summary / effect / engineHooks 三字段对齐
- `tests/phase_runtime.test.mjs`：期望对象补 `fangtianBonus: false`

**新增** `tests/fangtian_last_handcard.test.mjs`（6 条断言）：
- 装备方天 + 最后一张为 杀 → flag=true + log
- 装备方天 + 杀 不是最后一张 → 不触发
- 装备非方天 → 不触发
- 1v1 中行为 no-op（仍只命中对手 1 dmg）
- 多次 sha 同回合 — 每次重置
- 回合结束后复位

### PR-16 落地 — 无中生有 target 可选 (v7 series 收尾)

**问题**：gltjk `card__scroll.md`【无中生有】(1V1 / 界限突破 / 国-标)：

> - 使用目标：**包括你在内的一名角色**
> - 作用效果：目标角色摸两张牌

旧实现 `drawCards(game, actor, 2)` 硬编码给 actor — 不支持 spec "包括你在内的一名角色" 的 target 选择。

**改动**：
- `resolve wuzhong`：接受 `options.wuzhongTarget = 'player' | 'enemy'`；缺省 = actor；无效值回退到 actor
- log 形式：`"使用【无中生有】令<对方>摸两张牌"`（cross-target）或简单 `"使用【无中生有】"`（self）
- `CARD_RULES.wuzhong`：summary/effect/engineHooks 对齐

**新增** `tests/wuzhong_target_choice.test.mjs`（5 条断言）：
- 无目标参数 → 默认 actor 摸 2 (旧行为)
- `wuzhongTarget='player'` 显式 self
- `wuzhongTarget='enemy'` → 对手摸 2 (spec 合规)
- 无效值回退到 actor
- enemy 回合 + wuzhongTarget='player' → player 收到 2

**1v1 实际意义**：把无中生有用在对手身上 = 反直觉操作（让对手多摸 2 张），AI 永不这样做；保留 API 仅为 spec 合规。

---

## v7 完整收尾汇总

### 新增 pendingChoice 类型 (7 个)

- `qilin-pick` / `cixiong-fire` / `cixiong-choose` / `jiedao-decision` / `wugu-pick` / `guohe-1v1-pick` / `dying-rescue`

### 新增 pauseState 槽位 (3 个)

- `pauseState.playSha` (PR-4 引入，cixiong 暂停 sha 流程续算用)
- `pauseState.wugu` (PR-7 引入，五谷 reveal-pool 续算用)
- `pauseState.dying` (PR-13 引入，濒死 responder 队列续算用)

### 新增 skillPreferences 切换键 (8 个)

`qilin` / `cixiong` / `cixiongResponse` / `jiedao` / `wugu` / `guohe` / `zhangba` / `dying`（每项 `auto` / `ask` / `decline`）。

### 新增 hero 字段

- `gender` ('male' / 'female') — 26 个英雄全部补全 (PR-4)

### 新增 flags 复位项

- `jiuUsedThisTurn` (PR-8)
- `fangtianBonus` (PR-15)

### v7 测试增量（合计 116 条断言）

| 文件 | 断言数 | PR |
|---|---:|---|
| `tests/tao_target_choice.test.mjs` | 6 | PR-1 |
| `tests/taoyuan_wounded_only.test.mjs` | 5 | PR-2 |
| `tests/qilin_horse_pick.test.mjs` | 9 | PR-3 |
| `tests/cixiong_target_choice.test.mjs` | 10 | PR-4 |
| `tests/jiedao_dual_legality.test.mjs` | 10 | PR-5 |
| `tests/delayed_trick_dedup.test.mjs` | 8 | PR-6 |
| `tests/wugu_reveal_pick.test.mjs` | 7 | PR-7 |
| `tests/jiu_once_per_turn.test.mjs` | 6 | PR-8 |
| `tests/guohe_1v1_two_options.test.mjs` | 11 | PR-9 |
| `tests/shunshou_1v1_no_distance.test.mjs` | 7 | PR-10 |
| `tests/bingliang_1v1_no_distance.test.mjs` | 6 | PR-11 |
| `tests/shandian_next_valid.test.mjs` | 6 | PR-12 |
| `tests/dying_flow.test.mjs` | 8 | PR-13 |
| `tests/zhangba_response.test.mjs` | 6 | PR-14 |
| `tests/fangtian_last_handcard.test.mjs` | 6 | PR-15 |
| `tests/wuzhong_target_choice.test.mjs` | 5 | PR-16 |
| **合计** | **116** | |

## 已知遗留 / 后续方向

- **UI 面板**: 7 个新 pendingChoice 的 dom-adapter 面板还没接；玩家通过 `resolvePendingChoice({...})` API 走代码路径可用，UI 未给入口。**v8 方向 1 处理**（见 `2026-05-14-sanguosha-v8-ui-integration.md`）
- **多目标【杀】**: 方天画戟 / 雌雄 / 青釭剑 等 spec 中的 "per-target" 语义在 1v1 单目标场景下都简化掉了。多人模式重构时需扩展
- **濒死多轮**: spec 中 "处于濒死状态时" 嵌套循环 (mid-rescue 回血未满 1 触发新循环) 在 1v1 不会触发 (每次 +1 必定 = 1)，多人模式需扩展 `processDyingNext`
- **丈八响应选牌**: 当前自动消耗前 2 张手牌；spec 允许玩家挑哪 2 张。响应窗口 pendingChoice 化是大改造，留作后续
- **奇才**: 1V1 中没有距离限制锦囊了，技能数据保留但实际 no-op
