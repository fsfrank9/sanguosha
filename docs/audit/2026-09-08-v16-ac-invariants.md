# v16 AC2：常驻不变量 #4 / #5 / #6

2026-09-08；基线 AB 合并提交 `849c368`，数字由当前正式数据和真实工厂安装捕获现算。新增 `tests/v16_ac_invariants.test.mjs`，加入全档自动枚举和快档清单；原三条不变量的约束保持，旧函数签名定位随明确接口变化更新。

## #4：非注册表接入逐条佐证

实测125个已实现ID中，100个有至少一个可调用的已注册hook，25个没有。真实工厂捕获共102个技能ID，包含`feiying`与`wumou`两条空对象注册；它们不能充当行为实现证据。W2所述22条现仍为22条：`paoxiao`、`mashu`、`qicai`、`jijiu`、`luoshen`、`wushuang`、`jiuyuan`、`lianying`、`xiaoji`、`wangzun`、`shensu`、`hongyan`、`guhuo`、`hujia`、`bazhen`、`kanpo`、`xueyi`、`huoshou`、`juxiang`、`wansha`、`weimu`、`roulin`。Z新增伪帝、AB新增飞影/无谋后，纯直接接入总数成为25。

初扫metadata得到43个有直接hook声明的ID／55项声明；逐函数审查又补齐此前漏记的`buqu.handLimit`、`tuntian.distanceBetween`、`duanliang.trickDistanceLimitFor`、`qixing.beginInitialHand/beginDrawPhaseEnd`与`longhun.longhunResponseOptions/takeResponse`。最终明确映射**48个ID／62项直接声明**：25个纯直接＋23个注册/直接混合。七星的注册函数会转发真实实现，但当前发牌/摸牌阶段实际直接调用这些入口，所以两条路径同时注明；不把“存在注册”当成“已从该时机派发”的证明。

映射文件`tests/fixtures/nonregistry-skill-paths.mjs`逐ID列出可执行函数范围、技能资格/成本/效果表达式及消费方或resolver接线。`tests/helpers/source-evidence.mjs`删除注释、按词法token和花括号截取实名函数／注册块，完整token序列匹配允许空白变化；`tests/helpers/ac-invariants.mjs`将所有直接声明集合与映射双向比较，同时复用`actualSkillRegistrations()`对注册hook逐ID双向比对。空注册、日志出现技能名、注释里的旧代码不能代替作用路径。这是结构常驻闸，复杂时序仍由对应真实引擎回归证明，并非静态证明全部游戏语义。

| 技能ID | 实际入口类别 | metadata直接声明 | 实现函数／块（完整边与效果断言见fixture） |
| --- | --- | --- | --- |
| buqu | 注册＋直接 | `handLimit` | state.js / handLimit |
| tuntian | 注册＋直接 | `distanceBetween` | state.js / distanceBetween |
| duanliang | 注册＋直接 | `trickDistanceLimitFor` | game-engine.js / trickDistanceLimitFor；game-engine.js / withinTrickDistance |
| qixing | 注册＋直接 | `beginInitialHand`、`beginDrawPhaseEnd` | god-strategy.js / beginInitialHand；god-strategy.js / choices.register('qixing-initial', function；game-engine.js / ResponseRuntime.responseFlows.register('god-initial-hands',；god-strategy.js / beginDrawPhaseEnd；god-strategy.js / choices.register('qixing-exchange', function；game-engine.js / ResponseRuntime.responseFlows.register('god-draw-end', |
| longhun | 注册＋直接 | `longhunResponseOptions`、`takeResponse` | god-conversion.js / longhunResponseOptions；god-conversion.js / longhunMaterials；tricks.js / listWuxieOptions；god-conversion.js / takeResponse；god-conversion.js / validateMaterials；god-conversion.js / takeMaterials；game-engine.js / consumeWuxie |
| paoxiao | 纯直接 | `hasPassiveEffect` | skill-runtime.js / var PASSIVE_EFFECTS =；skill-runtime.js / skillEffectValue；skill-runtime.js / hasPassiveEffect；state.js / canUseUnlimitedSha |
| mashu | 纯直接 | `sumPassiveEffect` | skill-runtime.js / var PASSIVE_EFFECTS =；skill-runtime.js / sumPassiveEffect；state.js / distanceBetween |
| qicai | 纯直接 | `hasPassiveEffect` | skill-runtime.js / var PASSIVE_EFFECTS =；skill-runtime.js / skillEffectValue；skill-runtime.js / hasPassiveEffect；game-engine.js / ignoresTrickDistance |
| jijiu | 纯直接 | `attemptDyingRescue` | damage-dying.js / attemptDyingRescue；damage-dying.js / finishDyingRescueWithCard |
| luoshen | 纯直接 | `processPreparePhase` | game-engine.js / processPreparePhase；skills.js / triggerLuoshenPrepare；skills.js / startLuoshenStep；skills.js / runLuoshenJudge |
| wushuang | 纯直接 | `shanRequiredAgainstSha`、`duelShaRequired` | sha-flow.js / shanRequiredAgainstSha；tricks.js / duelShaRequired |
| jiuyuan | 纯直接 | `taoRecoverBonus` | game-engine.js / taoRecoverBonus；damage-dying.js / finishDyingRescueWithCard |
| lianying | 纯直接 | `handLossHandler` | game-engine.js / CardRuntime.setHandLossHandler(function；card-runtime.js / setHandLossHandler |
| xiaoji | 纯直接 | `triggerEquipmentLoss` | equipment.js / triggerEquipmentLoss；equipment.js / equipCard |
| wangzun | 纯直接 | `continueTurnAfterPreparePhase` | game-engine.js / continueTurnAfterPreparePhase |
| shensu | 纯直接 | `processPreparePhase`、`playSha` | game-engine.js / processPreparePhase；skills.js / triggerShensuPrepare；skills.js / applyShensuOption |
| hongyan | 纯直接 | `effectiveCardSuit`、`effectiveCardColor` | state.js / effectiveCardSuit；state.js / effectiveCardColor |
| guhuo | 纯直接 | `playGuhuoDeclare`、`guhuo-challenge` | guhuo.js / playGuhuoDeclare；guhuo.js / resolveGuhuoChallengeChoice；guhuo.js / revealAndSettleGuhuo |
| jijiang | 注册＋直接 | `advanceDuelChain`、`advanceAOETargets` | tricks.js / advanceDuelChain；tricks.js / flows.register('duel',；tricks.js / advanceDuelResponses；game-engine.js / tryLordAidSync；game-engine.js / lordAidEnabled；tricks.js / advanceAOETargets；tricks.js / flows.register('aoe',；tricks.js / var AOE_QUEUE_HOOKS =；tricks.js / aoeEffectForCurrent |
| hujia | 纯直接 | `advanceShaResponses`、`advanceAOETargets` | sha-flow.js / advanceShaResponses；game-engine.js / tryLordAidSync；game-engine.js / lordAidEnabled；game-engine.js / lordAidPlayerCanAid；tricks.js / advanceAOETargets；tricks.js / flows.register('aoe',；tricks.js / var AOE_QUEUE_HOOKS =；tricks.js / aoeEffectForCurrent |
| quhu | 注册＋直接 | `pindian:quhu` | skills.js / triggerQuhuActiveSkill；skills.js / registerPindianContinuation('quhu', function |
| bazhen | 纯直接 | `hasEquipmentEffect` | state.js / var VIRTUAL_EQUIPMENT_SKILLS =；state.js / virtualEquipmentTypes；state.js / hasEquipmentEffect |
| kanpo | 纯直接 | `wuxieOptionForCard`、`consumeWuxie` | tricks.js / wuxieOptionForCard；game-engine.js / consumeWuxie |
| tianyi | 注册＋直接 | `pindian:tianyi` | skills.js / triggerTianyiActiveSkill；skills.js / registerPindianContinuation('tianyi', function |
| mengjin | 注册＋直接 | `mengjin-pick` | skills.js / triggerMengjinShaDodged；skills.js / resolveMengjinPickChoice；skills.js / applyMengjinDiscard |
| xueyi | 纯直接 | `handLimit` | state.js / handLimit；state.js / xueyiHandLimitBonus |
| huoshou | 纯直接 | `skillEnabled` | tricks.js / resolveAoeDamageSource；tricks.js / var AOE_QUEUE_HOOKS =；tricks.js / playAOE |
| juxiang | 纯直接 | `skillEnabled` | tricks.js / var AOE_QUEUE_HOOKS =；tricks.js / settleJuxiangClaim |
| wansha | 纯直接 | `skillEnabled` | state.js / wanshaBlocksTaoUse；damage-dying.js / attemptDyingRescue |
| weimu | 纯直接 | `skillEnabled` | game-engine.js / weimuBlocksCard；game-engine.js / isLegalCardTarget |
| roulin | 纯直接 | `skillEnabled` | sha-flow.js / shanRequiredAgainstSha |
| tiaoxin | 注册＋直接 | `tiaoxin-demand` | skills.js / resolveTiaoxinDemand；skills.js / resolveTiaoxinDemandChoice；skills.js / playTiaoxinSha |
| zhiji | 注册＋直接 | `zhiji-choice` | skills.js / triggerZhijiPrepare；skills.js / resolveZhijiChoice；skills.js / applyZhijiOption |
| xiangle | 注册＋直接 | `xiangle-cost` | skills.js / triggerXiangleShaEffectiveness；sha-flow.js / resolveXiangleCostChoice |
| fangquan | 注册＋直接 | `fangquan-grant` | skills.js / triggerFangquanBeforePlayPhase；skills.js / triggerFangquanTurnEnd；skills.js / resolveFangquanGrantChoice；skills.js / applyFangquan |
| zhiba | 注册＋直接 | `pindian:zhiba` | skills.js / triggerZhibaActiveSkill；skills.js / settleZhibaPindian |
| yongsi | 注册＋直接 | `triggerYongsiDiscardStart` | skills.js / triggerYongsiDiscardStart；skills.js / resolveYongsiDiscardChoice |
| weidi | 纯直接 | `hasLordSkill` | skill-runtime.js / hasLordSkill；skill-runtime.js / skillState；skill-runtime.js / viewedSources |
| wushen | 注册＋直接 | `shaUseReachAllowed` | state.js / shaUseReachAllowed |
| kuangfeng | 注册＋直接 | `beginEndPhase`、`clearWeather`、`recordDeath` | god-strategy.js / beginEndPhase；god-strategy.js / choices.register('god-weather-order',；god-strategy.js / choices.register('god-weather-targets', function；game-engine.js / ResponseRuntime.responseFlows.register('god-end-phase',；god-strategy.js / clearWeather；god-strategy.js / resetTurn；game-engine.js / startTurn；god-strategy.js / recordDeath |
| dawu | 注册＋直接 | `beginEndPhase`、`clearWeather`、`recordDeath` | god-strategy.js / beginEndPhase；god-strategy.js / choices.register('god-weather-order',；god-strategy.js / choices.register('god-weather-targets', function；game-engine.js / ResponseRuntime.responseFlows.register('god-end-phase',；god-strategy.js / clearWeather；god-strategy.js / resetTurn；game-engine.js / startTurn；god-strategy.js / recordDeath |
| feiying | 纯直接 | `distanceBetween` | state.js / distanceBetween |
| kuangbao | 注册＋直接 | `afterInitialHands` | god-wrath.js / afterInitialHands；game-engine.js / finishInitialHands |
| wumou | 纯直接 | `beforeTrickUse` | god-wrath.js / beforeTrickUse；god-wrath.js / choices.register('wumou', function；game-engine.js / ResponseRuntime.responseFlows.register('god-card-use', |
| wuqian | 注册＋直接 | `clearTurnEffects`、`clearDeathEffects` | god-wrath.js / clearTurnEffects；god-wrath.js / clearDeathEffects |
| juejing | 注册＋直接 | `handLimit` | state.js / handLimit |
| lianpo | 注册＋直接 | `recordDeath` | god-strategy.js / recordDeath；god-strategy.js / afterTurnEnd |
| jilue | 注册＋直接 | `triggerGuicaiJudgementBeforeResolve` | skills.js / triggerGuicaiJudgementBeforeResolve；skills.js / findRingSkillHolder；skills.js / resolveGuicaiReplaceChoice |

修正三个历史路径名：妄尊`processPreparePhase → continueTurnAfterPreparePhase`（W2-F12已移位）；红颜`judgeSuitView → effectiveCardSuit`（前者已不存在）；护驾`resolveShaResponse → advanceShaResponses`（实际杀响应驱动）。护驾/激将再追至`lordAidEnabled → StateRuntime.hasLordSkill`、可代打席选择与`consumeResponse`，避免只确认窗口名字。未更改行为来迁就名字。

AC魏蜀审计另已确证的狂骨源侧触发修复同步metadata为`damageDealt/onDamageDealt`，风包cache/spec更新来源侧时机和造成伤害时距离快照说明。行殇林包cache/spec及原L4文档纠正为手牌＋装备；判定区不属于“其所有牌”。所有官方来源文本、sourceTextRef、SHA-256保持原值。七星/龙魂的缓存和规格补齐直接入口说明；不屈此处仅登记现有手牌上限出口，不在此裁定版本。

负向防漂移：删除飞影映射、伪造其metadata hook、移除飞影资格条件、无谋失体力效果、咆哮被动真值或护驾主公资格入口都会失败；把旧代码保留在注释里仍失败。没有新增依赖。

## #5：当前内容口径

AC完整卡复核发现AB基线的周泰漏挂奋激。主审按原SHAN007正文与wu.md:367补齐一个未实现技能槽，故AB的148槽／143唯一／20未实现修正为149／144／21，武将79和已实现125不变。AB历史fixture原样保留；AB整卡回归只允许周泰增加这一项有来源的奋激todo，其余70张旧卡逐字段严格一致。

| 项目 | 计算 | 实测 |
| --- | --- | --- |
| 武将 | Object.values(HERO_CATALOG).length | 79 |
| 挂将技能槽 | 每将skills长度之和 | 149 |
| 原生唯一技能 | 槽位ID去重 | 144 |
| 已实现原生唯一技能 | 原生集合∩IMPLEMENTED | 123 |
| 已实现总ID | IMPLEMENTED去重（并禁止重复） | 125 |
| 已实现派生ID | IMPLEMENTED减原生集合 | jixi、jilue（2） |
| 未实现原生唯一技能 | 原生集合减IMPLEMENTED | 21 |

未实现集合：`anxian`、`chongzhen`、`fanxiang`、`fenji`、`fenyong`、`huashen`、`jianchu`、`jianshu`、`junwei`、`liangzhu`、`lihun`、`lizhan`、`shichou`、`weikui`、`xinsheng`、`xuehen`、`yanxiao`、`yinling`、`yongdi`、`zhenlue`、`zhuiji`。每一实际武将槽的`status`还须与implemented/todo归属一致。

README仅解析唯一`内容现状`节内以`- 武将 `起头的当前行，并独立解析顶部唯一`- **内容**:`汇总。当前行保持`武将 79 名 / 技能条目 149 条 / 唯一挂将技能 ID 144 个;已接入引擎 125 个(...),挂将未接入唯一技能 21 个`的既有实际半角标点格式。不会用全文宽松数字正则让版本演进旧数字误过关；“当前错20／历史仍有21”、“当前行删除／移到历史”和顶部武将数改78三种反例均被拒绝。

## #6：五响应链统一暂停

| 链 | 正式驱动进入统一闸 | 消费／暂停证据 |
| --- | --- | --- |
| 杀 | continueShaAfterCixiong → flows.run('sha') → advanceShaResponses | 支付一闪并记stage后检查blocked；完成经finish；请求玩家共用requestPlayerResponse |
| 决斗 | advanceDuelChain → flows.run('duel') → advanceDuelResponses | 真杀和主公代杀两个分支各自记resumePaid后检查blocked |
| AOE | advanceAOETargets → flows.run('aoe') → advanceTargetQueue | effect固定接aoeEffectForCurrent，先记目标游标；子窗结果向队列传播，排空finish |
| 濒死 | processDyingNext → flows.run('dying') → advanceDyingResponses | 自救技能先记已触发，救援后的blocked/paused先于下一响应者，finish后才后续时机 |
| 无懈 | advanceWuxieChain → flows.run('wuxie') → advanceWuxieResponses | 每次消耗翻转净状态、重置队列再进统一闸；蛊惑子窗直接yield；settle先finish |

实名驱动禁止被域内直接调用绕过注册；共享runResponseFlow必须先处理gameover取消，再检查pending，再调用spec.advance。共享续跑必须取最内层帧、有停滞显式报错、JSON别名恢复付款快照。独立损坏源码副本覆盖五链绕过/丢守卫、中心pending和gameover守卫，以及保留名字/注册但掏空杀驱动，全部拒绝。原Y协议行为测试（双闪付款、JSON恢复、非法声明冻结）保持原样。

## 验证与AC-G1新度量

定向运行`node tests/v16_ac_invariants.test.mjs`：6个执行用例全绿（含多个独立负向副本）；`skill_schema`6例、`v16_ab_spec`4例全绿，后者74个cache引用＋74个spec引用重新现算hash通过。不跑守恒大档、不修改旧阈值或种子。

在新增C26和主审UI用例前，另外真实逐文件运行全部直接导入`helpers/fake-dom.mjs`的根测试：**29文件／275个执行用例全绿**（阶段性测量；最终新增UI文件另计）。这是关联测试文件的harness执行数，包含`ui_pending_kind_coverage`中的4个结构用例＋1个真实fake-DOM行为用例，不能写成275个浏览器原生交互场景。检索`tests/tools/package.json`无jsdom/Playwright/Puppeteer运行入口或依赖；唯一命中为fake-DOM说明注释。AC-G1据此由主审单独裁定，不沿用路线图旧23文件／210用例数字。
