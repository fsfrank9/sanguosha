# AC1 基本牌、单体锦囊与群体锦囊／无懈审计

基线：`849c368`（AB / PR #199 合并后），工作分支 `codex/v16-ac-final-audit`。
本域审计现有 39 牌型中的 **6 基本牌 + 12 非延时锦囊，共 18 型**。
3 种延时锦囊的放置／判定与 18 种装备由其他域审计；本域只交叉核对它们进入杀、响应与无懈的接口，不把接口用例冒充装备／判定整域覆盖。

方法为实际 `Engine.playCard` → `Engine.resolvePendingChoice`，场景使用确定种子，明确座席、身份、手牌与偏好；不替换运行时、不手工调用锦囊 continuation、不在开窗后伪造角色死亡。跨窗口场景复制整个 game 为 JSON 再续行。每次实际动作核对实体牌 ID 守恒与重复占区。先记录红测试，再由根代理独立运行及核对官方源，授权后仅修改所属域。未改基准种子、阵容、阈值或原技能行为断言。

## 18 牌型覆盖矩阵

下列源均位于 `official-skill-cache/gltjk-sanguosha-rules/pages/`。新证据均在 `tests/v16_ac_response_audit.test.mjs`，表内给出可检索的测试标题前缀；既有测试列是交叉证据，不替代新场景。

| 类型 | 官方逐字来源 | 本轮真实动作／断言 | 既有交叉测试 |
| --- | --- | --- | --- |
| `sha` | `card__basic.md:9–27`; `flow__use.md:74–90` | `AC basic sha`：伤害、次数、自身／尸体拒绝；`AC Y sha`：双闪→雷击→JSON终局，第二闪未付、在途杀只弃一次 | `shan_response.test.mjs`; `wushuang_double_response.test.mjs` |
| `fire_sha` | `card__basic.md:9–27` | `AC basic fire_sha`：独立出口、次数、非法目标；酒后火杀伤害2；借刀保留火杀牌面 | `shan_response_conversion.test.mjs`; `jiedao_dual_legality.test.mjs` |
| `thunder_sha` | `card__basic.md:9–27` | `AC basic thunder_sha`：独立出口、次数与非法目标 | `tiesuo_chain_transmit.test.mjs` |
| `shan` | `card__basic.md:29–33` | `AC basic shan`：不能主动使用；真实响应窗JSON后提交不存在ID，保留合法闪且不记错误公开缺牌证据 | `shan_response.test.mjs`; `shan_response_conversion.test.mjs` |
| `tao` | `card__basic.md:37–51`; 保留 v13/J0-4 出牌仅自己裁定 | `AC basic tao`：满血、他人目标拒绝及自用回复1；救援／死亡嵌入 R3/R4 与Y终局 | `tao_target_choice.test.mjs`; `dying_flow.test.mjs` |
| `jiu` | `card__basic.md:53–73` | `AC basic jiu`：同阶段不能第二次饮酒，下一火杀一次性+1后清零 | `jiu_once_per_turn.test.mjs` |
| `wuzhong` | `card__scroll.md:62–66` | `AC instant wuzhong`：指定存活第三席摸2；R3：自身作为目标，在无懈期间死亡后即使反消也不能向尸体摸牌 | `wuzhong_target_choice.test.mjs`; `wuxie_coverage_h1.test.mjs` |
| `juedou` | `card__scroll.md:37–49` | `AC Y duel`：无双双杀第一张触发银月时第二张不提前支付，JSON后仅一次续行；R4：无懈期间终局收在途决斗牌 | `duel_player_response.test.mjs`; `v10_pr_v6_duel_response_framework.test.mjs` |
| `guohe` | `card__scroll.md:9–21` | `AC instant guohe`：身份场判定区可拆，1V1仅有判定牌时不能使用，两个版本分开断言 | `guohe_1v1_two_options.test.mjs` |
| `shunshou` | `card__scroll.md:23–35` | `AC instant shunshou`：1V1不受+1马距离限制，取得判定牌保持实体身份 | `shunshou_1v1_no_distance.test.mjs` |
| `jiedao` | `card__scroll.md:51–60` | `AC instant jiedao`：持刀者真实决定窗，出火杀／不出交武器两分支；无武器能力污染、实体各付一次 | `jiedao_dual_legality.test.mjs` |
| `huogong` | `card__scroll.md:241–247` | `AC instant huogong`：展示后JSON，错误展示ID及错花色成本重挂窗口，正确成本伤害1，展示牌不消耗 | `v13_j2_huogong_cost_repick.test.mjs` |
| `taoyuan` | `card__scroll.md:148–169` | `AC instant taoyuan`：满血无效果、逐目标无懈；R3：队列后位死亡及当前目标死亡均不能复活，含JSON | `taoyuan_wounded_only.test.mjs`; `taoyuan_per_target_wuxie_h1b.test.mjs` |
| `wugu` | `card__scroll.md:171–197` | `AC instant wugu`：池大小／选牌顺序／错误ID重挂／JSON守恒；R3死人不领牌但其余活人继续；R4终局池全部清算 | `wugu_reveal_pick.test.mjs`; `wugu_per_target_wuxie_h1b2.test.mjs` |
| `nanman` | `card__scroll.md:127–146` | `AC instant nanman`：一张无懈只消一个目标；`AC Y nanman`：AI蛊惑杀验假，JSON后当前席恰受一次伤害 | `v16_y_response_chains.test.mjs`; `wuxie_coverage_h1.test.mjs` |
| `wanjian` | `card__scroll.md:106–125` | `AC instant wanjian`：逐目标无懈，当前目标取消不波及后位；`AC Y wanjian`：AI蛊惑闪验假JSON续行 | `wanjian_player_response.test.mjs`; `bagua_wanjian_h2.test.mjs` |
| `wuxie` | `card__scroll.md:76–104` | `AC instant wuxie`：失效ID不偷用另一张；R2自身锦囊及自反无懈机会；R3/R4银月插入、奇偶恢复与终局资源清算 | `wuxie_player_response.test.mjs`; `v10_pr_v5_wuxie_response_framework.test.mjs` |
| `tiesuo` | `card__scroll.md:229–239`; `rule__principle.md:50–58` | `AC instant tiesuo`：重铸不产生无懈、只摸1且不动链状态；R1逆序点目标仍按当前回合角色起行动顺序结算 | `tiesuo_chain_transmit.test.mjs`; `v13_audit3_fixes.test.mjs` |

## 确证与修法

### AC-R1：铁索按点击顺序结算（规则／时机）

源：`rule__principle.md:50–58` 的一张牌多目标结算顺序，`card__scroll.md:229–239` 的铁索目标规则。3席 `[player, enemy, ally]`，当前回合 `enemy`，其使用铁索传入 `targets: ['player','ally']`。玩家持无懈且设 ask。实际第一窗的 `targetActor` 是 `player`，应为 `ally`，第二窗再是 `player`。

根因是 `playTiesuoCardHandler` 验目标后原样保留输入顺序。根代理独立运行红测试后，在 `game-engine.js` 按当前回合座次排序；本域未编辑该文件。新回归同时完成两个窗口并检查两个目标最终状态，未仅检查数组结构。

### AC-R2：使用者的无懈机会被策略直接排除（规则／交互）

源：`card__scroll.md:76–104` 对普通无懈的时机／目标均未排除原锦囊使用者，也未排除上张无懈使用者。`player` 持无中及1／2张无懈，偏好 ask，实际主动使用自己的无中后立即摸两张，没有自主无懈机会。

旧证据必须同时保留：v12 路线图第152行明确描述“净通过态跳过来源”；`docs/audit/2026-07-16-third-round-compliance-audit.md:120–121` 将来源被询问当成缺口；`tests/v13_audit3_fixes.test.mjs` 的AOE／五谷两条断言固化了同样行为。它们证明这是**旧错误裁定**，不能假装没有旧行为钉直接翻转。新回归按官方规则先写成红测试，根代理独立确证并授权修复：仅玩家 ask 保留自主机会，AI/auto 保持原来的不自我反消策略。

进一步复核发现无懈询问原来锚定锦囊目标，`rule__principle.md:50` 要求同一事件多人响应从当前回合角色起。新增3席实际反例：enemy回合，无中指定player，ally自动无懈、player ask；改前player先看到未抵消窗口，改后ally先无懈，player看到已抵消窗口。根代理读源授权后，队列改用 `game.turn`，没有当前回合才回退旧快照目标锚；没有为了保持旧断言而把玩家人为移至队尾。

旧测试改动精确为四个文件、五个用例：`v13_audit3_fixes.test.mjs` 的AOE／五谷两例翻转为“应询问→明确放弃→保留原效果”；`wuxie_player_response.test.mjs` 的指定pw2用例增加明确放弃pw1自反机会，原牌身份、保牌与取消结果断言原样保留；`v16_y_response_chains.test.mjs` 的无懈→银月用例先明确放弃当前回合使用者自己的无懈机会，之后的内层停机、队列空、伤害结果及帧清空断言原样保留。原玩家→AI反消→玩家再次响应三例在正确的当前回合顺序下直接通过，未修改它们。

全档进一步暴露 `v12_h_identity.test.mjs` 首例原先隐含“被拆的主公先响应”。其实际意图是主公自行无懈后，忠臣不替敌人反消；原座次在正确当前回合顺序下变成反贼→忠臣→主公，先由忠臣抵消，再被旧玩家auto策略反消，已经不再进入待验证的局面。根代理要求保留该忠臣策略断言、禁止顺手改变玩家auto策略；本域独立重现12绿／1红后，仅此例明确设座次 `[player, ally, enemy]` 及不变的三人身份，使当前反贼回合按 enemy→player→ally 响应。武器保留、忠臣保留无懈的原断言全部保留，另加主公自己的无懈确已消耗断言；全文件13/13通过。三历史基准的阵容、种子与阈值均未因此改变。

### AC-R3：无懈期间真实死亡后仍领牌／回血（规则／死亡）

源：`flow__death.md:9–49` 的死亡与继续外层事件，`card__scroll.md` 对各牌目标效果，`rule__principle.md:87–98` 的来源死亡后仍继续其余事件。死亡不是濒死：本例先有明确阵亡日志、弃置及身份翻明，再发生错误效果。

共同3席为 `player=忠臣孙权`、`enemy=主公刘备`、`ally=反贼孙尚香`，均无救援。`ally` 持黑无懈与银月枪。真实无懈触发银月，对 `player` 造成致死伤害，主公与反贼仍存活，因此外层事件应继续：

| 真实入口 | 错误观测 | 应有结果 | 回归 |
| --- | --- | --- | --- |
| enemy hp2使用桃园，player hp1在后位 | 先记录孙权阵亡，后桃园将其从0回到1 | 后位死亡者退出；其余目标继续 | 同步及银月闪窗JSON两个用例 |
| player hp1自己使用无中，enemy红无懈反消ally的无懈 | player hp0却摸2张 | 不向死亡目标发牌 | 当前目标Wuzhong用例 |
| player hp1自己使用五谷，enemy红无懈反消 | player hp0领取1张池牌 | 跳过死亡当前目标，其他活人继续领取，剩余池牌入弃 | 当前目标Wugu用例 |
| player hp1自己使用桃园，enemy红无懈反消 | player死亡后又被回到1 | 不复活 | 当前目标Taoyuan用例 |

根代理独立跑首轮30例确证后，授权 `tricks.js` 窄修：桃园队列及效果均校验 hp>0；无中恢复效果前校验；五谷无懈后选牌入口校验并继续剩余队列。铁索同型效果入口也补存活守卫，但本轮未把这一防御分支虚报为另一条实证缺陷。

### AC-R4：无懈内终局丢失处理中的实体牌（P0／守恒）

1V1 `player hp1` 使用五谷／决斗；enemy 黑无懈 + 银月枪，wuxie auto/always，均 decline 救援。敌方无懈触发银月使 player 死亡终局。五谷已亮的两张牌从状态消失；决斗在无懈前尚未入弃，其来源牌同样消失。`assertCardConservation` 分别报“两张池牌凭空消失”与“trick凭空消失”。两类均有同步及真实银月闪窗JSON后放弃的独立回归。

根因：`wuxie` 帧没有终局 `cancel`，通用帧运行器只移除上下文；处于上下文内的五谷池／决斗来源没有资源出口。根代理独立确证四个红例并授权后，补 `wuxie.cancel` 只收尾资源：根代理注入共享 `discardSourceCardIfPending`，本域幂等收在途来源并复用 `finishWugu` 弃池；不调用目标效果或正常卡牌使用钩子。本轮同时试验火攻、铁索、桃园、无中、南蛮、万箭同样终局路径，其来源此前已入常规区，没有这项丢牌，未泛化成七类缺陷。

## 驳回及适用边界

- “无中只能对自己，第三席目标脚手架非法”的质疑已被逐字源驳回：采用的 `card__scroll.md:62–66`（界限突破／1V1／国-标）允许包括自己在内的一名角色，已有 `wuzhong_target_choice.test.mjs` 和 v7 PR-16 同口径。本轮仍额外将R3三例全部构造为自身目标，消除对死亡缺陷的版本歧义。
- “酒池允许向第三席使用酒是转化绕过目标合法性”的跨域质疑已驳回：`card__basic.md:58` 的酒方法Ⅰ允许包括自己在内的一名角色，`card__hero__neutral.md:175` 的酒池仅改材料。新增原生酒／酒池两条实际Engine动作均验证增益挂第三席、次数挂使用者；与既有v13 K2他指裁定一致，不按他版常见印象误修。
- 无效／过期响应ID不会自动偷用另一张合法闪或无懈：新测试真实提交无效ID后检查保牌及最终伤害／摸牌；不将“无效选择当作放弃”的既有API语义臆定为牌张消耗缺陷。
- 火攻展示／成本、五谷池的错误ID会重挂当前窗口，JSON后仍可用合法ID完成。展示牌不进入弃牌堆，错花色成本不扣除。
- 双闪、双杀及AI蛊惑的已支付进度在嵌套窗口JSON恢复后没有重复消费。双闪雷击终局保留第二张闪，外层来源杀幂等清算。R4是未登记终局资源收尾的无懈帧例外，不能据此否定全部Y协议。
- 当前目录的1V1拆桥／顺手变体与身份场版本分开测试；不拿国战或其他版本的目标／距离规则倒灌本次修法。桃主动目标保留v13/J0-4明确裁定，未借审计静默翻案。

## 验证状态

新文件最终 **40例全绿**。首轮30例修前24绿／6红（R1一例、R3五例），根代理独立复现；其后R4四例与R2自身机会两例也经根代理独立运行红测试再授权。Y双闪JSON终局、酒／酒池第三席两例为反驳证据；最后的3席无懈响应次序先红后绿。没有删除失败用例或把错误观测写成正确预期。

R3窄修后的既有相关回归先跑34文件全绿；R2/R4及当前回合次序修复后扩为 **35文件全部通过**，覆盖基本牌、拆桥／顺手／借刀／火攻、五谷／桃园、决斗、无懈、Y引擎／UI／协议守护、蛊惑响应及上述v13规则纠错。完整逐文件输出为本次临时执行日志。此处不宣称已跑全仓或三历史基准，全档由根代理统一执行。

## 独立支付跨域复核

响应域完成后，根代理指定追加复核本批其他作者的缔盟、悲歌与英魂／悲歌强制弃牌帧，范围限支付完整性、挂起、JSON、失技及终局清算。新增 `tests/v16_ac_payment_crossreview.test.mjs`，由本域独立作者持有；没有直接改写其他作者的生产实现。

**AC-P1 已确证并由原作者修复**：两个装备一并支付后，第一件的枭姬摸牌可将第二件成本从弃牌堆洗回手牌，已提交的第二个失装事件不能因此消失。官方 `card__hero__wu.md:255` 每失去一件装备可摸2张，`card__equipment.md:192–196` 明确白银回复为已触发效果的执行。两条真实Engine路径均复现：

- 缔盟使用者 hp2，以青釭剑＋白银狮子支付两张成本，deck/discard初始为空。第一枭姬把两装备洗回手，旧代码第二次 `discard.find` 找不到白银，因此hp仍2、枭姬只发动1次，应hp3且发动2次。
- 英魂“摸一弃X”令同样持装的玩家弃2张，首次摸1张后牌堆空，付款两装备重现完全相同的漏事件。

两实现原作者分别独立确认，根代理要求先红测试再窄修；现在保存付款时的装备事件快照并按游标逐件派发，不以材料的当前区域决定事件是否仍存在，不再移动／复制成本实体。新跨审前两例均绿，依旧逐动作核对ID守恒。

**AC-P2 已确证并由根代理修复**：同一真实英魂弃牌窗口经JSON复制后付款，第一枭姬需要重洗牌堆；`game.random`函数已被JSON丢弃，`reshuffleIfNeeded → shuffle` 抛 `TypeError: random is not a function`。此例没有在脚手架补回随机函数或放宽断言，固定在跨审第3例。根代理独立重现后，洗牌入口保留原有注入RNG；缺失时使用确定性的 `Runtime.makeRng(discard.length)` 后备生成器。此约定保证数据快照可恢复执行及重复输入可复现，**不承诺恢复外部闭包中未记录的随机数内部状态，也不宣称JSON后轨迹与原局精确重放一致**。原有保留函数的真实对局／基准仍走原RNG。

另外两条新反驳证据均通过：付过两件装备的缔盟在双方旧手牌都置于处理状态后开屯田改判窗，JSON后来源失去全部技能，仍只交换一次、成本只弃一次；悲歌已经付白银成本并回复后，在屯田改判窗JSON复制、持有者失去技能，已发动的悲歌仍完成判定，既不退款也不重复回复。强制弃牌的过期choiceId、重复ID与缺失ID在付款前均被拒绝，窗口与所有装备保留；其后JSON空牌堆付款最初暴露上面的P2，修后完整续行。最终独立跨审 **5/5例通过**，事件快照只用于派发，实际成本实体仍只在常规区域保存。

终局边界还核对了帧结构：缔盟 `cancelDimengPayment` 会把仍在处理状态的双方旧手牌逐张弃置；悲歌与强制弃牌在挂起前已把成本提交常规区域，不把成本悬在仅有ID的记录中。新原生付费副作用在本组场景中只产生摸牌、回复与判定，没有伪造额外致死技能来声称跑过终局。真实无懈／银月终局守恒已由本域R4的四个实际动作场景覆盖；此处的支付取消审阅保留为结构复核，未冒充另一条端到端终局证据。
