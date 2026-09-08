# v16 AC 吴／群／神已实现技能逐项证据矩阵

口径：`IMPLEMENTED_SKILL_IDS` 与当前武将目录交集；吴、群原生重复 ID 合并为一行，神司马懿派生 `jilue` 单列。共 **75 个已实现技能 ID**（吴 25、群 29、神原生 20、神派生 1）。生产位置由真实安装器截获的文件、hook 和处理函数核对；非注册技能列运行态出口。测试列采用真实 Engine 行为测试；马术另用 StateRuntime/SkillRuntime 被动距离行为断言。排除仅静态与仅 UI 断言。每行是基本行为证据索引，并不声称穷尽技能组合。原生马术、龙胆亦出现在魏蜀域，全局计数必须按 ID 去重。

| 技能 ID / 名称 | 关联武将 | 选定整卡版本 | fixture 来源行或 URL | 生产文件 / function 或 hook | 现有行为测试文件 / testname |
|---|---|---|---|---|---|
| `zhiheng` 制衡 | `sunquan` | 标准包镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/8 | `src/engine/skills.js` onActiveSkill → triggerZhihengActiveSkill | `tests/skills.test.mjs` — `孙权【制衡】 discards selected cards and draws the same amount once per turn` |
| `jiuyuan` 救援 | `sunquan` | 标准包镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/8 | `src/engine/game-engine.js taoRecoverBonus → StateRuntime.hasLordSkill` | `tests/jiuyuan_lord_tao.test.mjs` — `救援 濒死: 吴势力(吕蒙) ask 用桃救主公孙权 → 回复 2, 脱离濒死` |
| `kurou` 苦肉 | `huanggai` | 标准包镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/11 | `src/engine/skills.js` onActiveSkill → triggerKurouActiveSkill | `tests/skills.test.mjs` — `黄盖【苦肉】 loses 1 HP and draws two cards` |
| `yingzi` 英姿 | `zhouyu` | 标准包镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/12 | `src/engine/skills.js` onDrawPhase | `tests/skills.test.mjs` — `周瑜【英姿】 draws three cards in draw phase` |
| `fanjian` 反间 | `zhouyu` | 标准包镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/12 | `src/engine/skills.js` onActiveSkill → triggerFanjianActiveSkill | `tests/v13_audit4_fixes.test.mjs` — `H2: 反间对尸体 (显式/缺省对手均) → fail, 不重放死亡结算` |
| `qixi` 奇袭 | `ganning` | 标准包镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/9 | `src/engine/skills.js` onCardAs → triggerQixiCardAs | `tests/qixi_black_to_guohe.test.mjs` — `奇袭 auto: 黑色手牌当拆, 弃掉对方装备 (装备优先)` |
| `jieyin` 结姻 | `sunshangxiang` | 标准包镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/25 | `src/engine/skills.js` onActiveSkill → triggerJieyinActiveSkill | `tests/sunshangxiang_xiaoji_jieyin.test.mjs` — `结姻: 弃两张手牌 → 双方各回复 1, 每回合限一次` |
| `xiaoji` 枭姬 | `sunshangxiang` | 标准包镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/25 | `src/engine/equipment.js triggerEquipmentLoss → skillEnabled(xiaoji)` | `tests/v13_audit4_fixes.test.mjs` — `M8: 借刀杀人交出武器 → 枭姬摸两张` |
| `keji` 克己 | `lvmeng` | 标准包镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/10 | `src/engine/skills.js` onBeforeDiscardPhase → triggerKejiBeforeDiscard | `tests/skills.test.mjs` — `吕蒙【克己】 does not skip discard after using Sha this turn` |
| `qianxun` 谦逊 | `luxun` | 标准包镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/14 | `src/engine/skills.js` onCardTarget → triggerQianxunCardTarget | `tests/skills.test.mjs` — `陆逊【谦逊】 prevents Shunshou and Le Bu Si Shu from targeting him` |
| `lianying` 连营 | `luxun` | 标准包镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/14 | `src/engine/game-engine.js CardRuntime.setHandLossHandler → drawCards` | `tests/lianying_hand_loss.test.mjs` — `连营 出牌: 使用最后一张手牌 (杀) → 摸一张` |
| `guose` 国色 | `daqiao` | 标准包镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/13 | `src/engine/skills.js` onCardAs → triggerGuoseCardAs | `tests/audit_batch6.test.mjs` — `L3: 国色方片当乐 (对方无无懈) → 正常入判定区` |
| `liuli` 流离 | `daqiao` | 标准包镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/13 | `src/engine/skills.js` onShaTargeted → triggerLiuliOnShaTargeted | `tests/v15_v_shan_pack.test.mjs` — `激昂: 一张杀对同一目标只结算一次 (流离重跑不重复摸牌)` |
| `jijiu` 急救 | `huatuo` | 标准包镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/22 | `src/engine/damage-dying.js attemptDyingRescue` 红色手牌/装备候选 → executeDyingRescue | `tests/jiuyuan_lord_tao.test.mjs` — `救援 濒死: 华佗(设为吴)【急救】视为桃 → 回复 2` |
| `qingnang` 青囊 | `huatuo` | 标准包镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/22 | `src/engine/skills.js` onActiveSkill → triggerQingnangActiveSkill | `tests/qingnang_heal_target.test.mjs` — `v8 PR-C4: 华佗 自救：弃 1 手牌 → 自己回 1 hp` |
| `wushuang` 无双 | `lvbu` | 标准包镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/23 | `src/engine/sha-flow.js shanRequiredAgainstSha`；`src/engine/tricks.js` 决斗锁定响应次数 | `tests/wushuang_double_response.test.mjs` — `无双 决斗 ask: 首张杀后再询问第二张` |
| `lijian` 离间 | `diaochan` | 标准包镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/24 | `src/engine/skills.js` onActiveSkill → triggerLijianActiveSkill | `tests/v13_audit4_fixes.test.mjs` — `L3: 貂蝉以装备区牌支付离间成本 → ok` |
| `biyue` 闭月 | `diaochan`, `sp_diaochan` | 标准包镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/24 | `src/engine/skills.js` onTurnEnd | `tests/skills.test.mjs` — `貂蝉【闭月】 draws one card before the next turn via endTurn and advancePhase` |
| `yaowu` 耀武 | `huaxiong` | 标准包镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/214 | `src/engine/skills.js` onDamageAfter → triggerYaowuDamageAfter | `tests/yaowu_red_sha_reward.test.mjs` — `耀武 反例: 黑色杀 → 不触发` |
| `wangzun` 妄尊 | `yuanshu` | 标准包镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/215 | `src/engine/game-engine.js processPreparePhase` → skillEnabled(wangzun), drawCards | `tests/yuanshu_wangzun_tongji.test.mjs` — `妄尊: 主公准备阶段 → 袁术摸一张, 主公本回合手牌上限 -1` |
| `tongji` 同疾 | `yuanshu` | 标准包镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/215 | `src/engine/skills.js` onCardTarget → triggerTongjiCardTarget | `tests/yuanshu_wangzun_tongji.test.mjs` — `同疾: 袁术自己出杀不受影响` |
| `tianxiang` 天香 | `xiaoqiao` | 风包镜像整卡 | `official_wind_skill_specs.json` / sourceTextRef `c5bc5863c64d` | `src/engine/skills.js` onDamageModify → triggerTianxiangDamageModify | `tests/v13_audit3_fixes.test.mjs` — `古锭刀不对天香转移落点重新判定 (+1 不再误触发)` |
| `hongyan` 红颜 | `xiaoqiao` | 风包镜像整卡 | `official_wind_skill_specs.json` / sourceTextRef `a7b1eafbfdf3` | `src/engine/state.js effectiveCardSuit / effectiveCardColor` | `tests/v13_j3_tianxiang_ask.test.mjs` — `J3: 红颜联动 — 黑桃手牌视为红桃可作 ask 成本` |
| `buqu` 不屈 | `zhoutai` | 风 WU 013；本次补回奋激TODO，未宣称整卡已实现 | `official_wind_skill_specs.json` / `card__hero__wu.md:365,367` | `src/engine/skills.js` onDyingEnter → triggerBuquDyingEnter | `tests/v13_audit3_fixes.test.mjs` — `不屈在濒死者自己的响应轮次结算 (排前座席先获救援机会)` |
| `leiji` 雷击 | `zhangjiao` | 风包镜像整卡 | `official_wind_skill_specs.json` / `card__hero__neutral.md:272` | `src/engine/skills.js` onShanUsed → triggerLeijiShanUsed | `tests/v16_y_response_chains.test.mjs` — `Y1 肉林：女性响应者的双闪也在雷击窗口停机` |
| `guidao` 鬼道 | `zhangjiao` | 风包镜像整卡 | `official_wind_skill_specs.json` / sourceTextRef `1ade23c9b31a` | `src/engine/skills.js` onJudgementBeforeResolve → triggerGuidaoJudgementBeforeResolve | `tests/v13_audit3_fixes.test.mjs` — `鬼道 3p: 第三席张角可替换他人判定牌` |
| `huangtian` 黄天 | `zhangjiao` | 风包镜像整卡 | `official_wind_skill_specs.json` / sourceTextRef `30f12509ddc5` | `src/engine/skills.js` onActiveSkill → triggerHuangtianActiveSkill | `tests/v12_h_identity.test.mjs` — `6. 黄天: 群势力玩家给 AI 主公张角一张闪, 每回合限一次` |
| `guhuo` 蛊惑 | `yuji` | 风包镜像整卡 | `official_wind_skill_specs.json` / sourceTextRef `c8a0d017a631` | `src/engine/game-engine.js playGuhuoDeclare / response.js guhuo-challenge` | `tests/v16_y_response_chains.test.mjs` — `Y3 AI 蛊惑不覆盖可正常使用的响应牌` |
| `yinghun` 英魂 | `sunjian` | 林包镜像整卡 | `official_lin_skill_specs.json` / `card__hero__wu.md:279` | `src/engine/skills.js` onPreparePhase → triggerYinghunPrepare | `tests/v15_u_lin_pack.test.mjs` — `英魂: 准备阶段已受伤时开窗; 选项① 摸 X 弃 1` |
| `haoshi` 好施 | `lusu` | 林包镜像整卡 | `official_lin_skill_specs.json` / `card__hero__wu.md:455` | `src/engine/skills.js` onDrawPhase → triggerHaoshiDrawPhase | `tests/v15_u_lin_pack.test.mjs` — `好施: 多摸两张; 手牌 >5 时交出一半 (奇数向下取整)` |
| `dimeng` 缔盟 | `lusu` | 林包镜像整卡 | `official_lin_skill_specs.json` / `card__hero__wu.md:457` | `src/engine/skills.js` onActiveSkill → triggerDimengActiveSkill → dimeng-payment | `tests/v16_ac_wu_qun_god_audit.test.mjs` — `AC Dimeng processing hands survive two serial Tuntian JSON windows and exchange only afterward`；`v16_ac_payment_crossreview.test.mjs` — 两装备枭姬洗回后失装事件仍完整 |
| `wansha` 完杀 | `jiaxu` | 林包镜像整卡 | `official_lin_skill_specs.json` / `card__hero__neutral.md:197` | `src/engine/state.js wanshaBlocksTaoUse` → skillEnabled | `tests/v15_u_lin_pack.test.mjs` — `完杀: 别人的回合不受限` |
| `luanwu` 乱武 | `jiaxu` | 林包镜像整卡 | `official_lin_skill_specs.json` / `card__hero__neutral.md:199` | `src/engine/skills.js` onActiveSkill → triggerLuanwuActiveSkill | `tests/v15_u_lin_pack.test.mjs` — `乱武: 限定技, 每名其他角色对最近者用杀否则失 1 体力; 本局仅一次` |
| `weimu` 帷幕 | `jiaxu` | 林包镜像整卡 | `official_lin_skill_specs.json` / `card__hero__neutral.md:201` | `src/engine/game-engine.js weimuBlocksCard` → canTargetCard | `tests/v16_y_response_chains.test.mjs` — `Y4 帷幕反例：实际红色 AOE 仍生效` |
| `jiuchi` 酒池 | `dongzhuo` | 林包镜像整卡 | `official_lin_skill_specs.json` / `card__hero__neutral.md:175` | `src/engine/skills.js` onCardAs → triggerJiuchiCardAs | `tests/v15_u_lin_pack.test.mjs` — `酒池: 黑桃手牌当【酒】(缺省目标为自己)` |
| `roulin` 肉林 | `dongzhuo` | 林包镜像整卡 | `official_lin_skill_specs.json` / `card__hero__neutral.md:177` | `src/engine/sha-flow.js shanRequiredAgainstSha` → skillEnabled / effectiveGender | `tests/v15_u_lin_pack.test.mjs` — `肉林: 董卓对女性目标出杀 → 需两张闪; 对男性照常一张` |
| `benghuai` 崩坏 | `dongzhuo` | 林包镜像整卡 | `official_lin_skill_specs.json` / `card__hero__neutral.md:183` | `src/engine/skills.js` onTurnEnd → triggerBenghuaiTurnEnd | `tests/v15_u_lin_pack.test.mjs` — `崩坏: 结束阶段非最小体力 → 二选一 (减上限时体力随之下降)` |
| `baonue` 暴虐 | `dongzhuo` | 林包镜像整卡 | `official_lin_skill_specs.json` / `card__hero__neutral.md:185` | `src/engine/skills.js` onDamageDealt → triggerBaonueDamageAfter | `tests/v15_u_lin_pack.test.mjs` — `暴虐: 群势力来源造成伤害后判定黑桃则董卓回血，与受伤者势力无关` |
| `tianyi` 天义 | `taishici` | 火包镜像整卡 | `official_fire_skill_specs.json` / `card__hero__wu.md:355` | `src/engine/skills.js` onActiveSkill → triggerTianyiActiveSkill | `tests/v15_t_fire_pack.test.mjs` — `天义: 没赢 → 本回合不能使用【杀】` |
| `mashu` 马术 | `machao`, `pangde`, `sp_pangde` | 火包镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/6 | `src/engine/skill-runtime.js PASSIVE_SKILL_EFFECTS.mashu → state.js distanceBetween` | `tests/skill_runtime_hooks.test.mjs` — `state runtime resolves Paoxiao and Mashu through SkillRuntime passive effect seam` |
| `mengjin` 猛进 | `pangde` | 火包镜像整卡 | `official_fire_skill_specs.json` / `card__hero__neutral.md:225` | `src/engine/skills.js` onShaDodged → triggerMengjinShaDodged | `tests/v15_t_fire_pack.test.mjs` — `猛进: 杀命中 (未被闪抵消) 不触发` |
| `shuangxiong` 双雄 | `yanliangwenchou` | 火包镜像整卡 | `official_fire_skill_specs.json` / `card__hero__neutral.md:161` | `src/engine/skills.js` onDrawPhase → triggerShuangxiongDrawPhase; onJudgementAfterResolve → triggerShuangxiongClaim; onCardAs → triggerShuangxiongCardAs | `tests/v15_t_review_closure.test.mjs` — `M6: 双雄玩家席开窗 — 发动则放弃摸牌并获得判定牌` |
| `luanji` 乱击 | `yuanshao` | 火包镜像整卡 | `official_fire_skill_specs.json` / `card__hero__neutral.md:149` | `src/engine/skills.js` onActiveSkill → triggerLuanjiActiveSkill | `tests/v15_t_fire_pack.test.mjs` — `乱击: 两张同花色手牌当【万箭齐发】; 异花色拒绝` |
| `xueyi` 血裔 | `yuanshao` | 火包镜像整卡 | `official_fire_skill_specs.json` / `card__hero__neutral.md:151` | `src/engine/state.js handLimit → hasLordSkill / effectiveCamp` | `tests/v15_t_fire_pack.test.mjs` — `血裔: 非主公时不生效 (主公技)` |
| `jiang` 激昂 | `sunce` | 山包镜像整卡 | `official_shan_skill_specs.json` / `card__hero__wu.md:297` | `src/engine/skills.js` onShaTargeted → triggerJiangShaTargeted; onTrickTargeted → triggerJiangTrickTargeted | `tests/v15_v_shan_pack.test.mjs` — `激昂: 使用红色杀指定目标后, 使用者与目标各摸一张` |
| `hunzi` 魂姿 | `sunce` | 山包镜像整卡 | `official_shan_skill_specs.json` / `card__hero__wu.md:299` | `src/engine/skills.js` onPreparePhase → triggerHunziPrepare | `tests/v15_v_shan_pack.test.mjs` — `魂姿: 体力值为 1 的准备阶段觉醒 — 减上限, 获得英姿 + 英魂` |
| `zhiba` 制霸 | `sunce` | 山包镜像整卡 | `official_shan_skill_specs.json` / `card__hero__wu.md:301` | `src/engine/skills.js` onActiveSkill → triggerZhibaActiveSkill | `tests/v15_v_shan_pack.test.mjs` — `制霸: 其他吴势力角色发起拼点, 没赢 → 主公获得两张拼点牌` |
| `zhijian` 直谏 | `erzhang` | 山包镜像整卡 | `official_shan_skill_specs.json` / `card__hero__wu.md:469` | `src/engine/skills.js` onActiveSkill → triggerZhijianActiveSkill | `tests/v15_v_shan_pack.test.mjs` — `直谏: 手牌装备置入他人装备区并摸一张` |
| `guzheng` 固政 | `erzhang` | 山包镜像整卡 | `official_shan_skill_specs.json` / `card__hero__wu.md:471` | `src/engine/skills.js` onDiscardPhaseEnd → triggerGuzhengDiscardEnd | `tests/v16_ac_wu_qun_god_audit.test.mjs` — `AC Qinyin JSON pause preserves following Guzheng discard entitlement` |
| `beige` 悲歌 | `caiwenji` | 山包镜像整卡 | `official_shan_skill_specs.json` / `card__hero__neutral.md:391` | `src/engine/skills.js` onDamageAfter → triggerBeigeDamageAfter | `tests/v16_ac_wu_qun_god_audit.test.mjs` — `AC Beige equipment loss pauses for Tuntian before judgement, with JSON-safe payment` |
| `duanchang` 断肠 | `caiwenji` | 山包镜像整卡 | `official_shan_skill_specs.json` / `card__hero__neutral.md:393` | `src/engine/skills.js` onDeath → triggerDuanchangDeath | `tests/v15_v_shan_pack.test.mjs` — `断肠: 蔡文姬死亡时杀死她的角色失去所有技能` |
| `longdan` 龙胆 | `zhaoyun`, `sp_zhaoyun` | SP 镜像整卡 | `official_standard_skill_specs.json` / https://www.sanguosha.com/hero/5 | `src/engine/skills.js` onCardAs → triggerLongdanCardAs | `tests/v13_audit4_fixes.test.mjs` — `L1: 赵云青龙续杀 — 无物理杀时用龙胆闪当杀` |
| `yongsi` 庸肆 | `sp_yuanshu` | SP 镜像整卡 | `official_sp_skill_specs.json` / `card__hero__neutral.md:621` | `src/engine/skills.js` onDrawPhase → triggerYongsiDraw | `tests/v16_z_sp_skills.test.mjs` — `庸肆 mandatory equipment+hand discard precedes normal hand-limit discard; invalid payment atomic` |
| `weidi` 伪帝 | `sp_yuanshu` | SP 镜像整卡 | `official_sp_skill_specs.json` / `card__hero__neutral.md:622` | `src/engine/state.js skillState / hasLordSkill` → `skill-runtime.js` 借技层 | `tests/v16_z_sp_skills.test.mjs` — `Weidi Zhiba quota is per holder and counts declined comparisons` |
| `wushen` 武神 | `god_guanyu` | 风 LE001 | `official_god_skill_specs.json` / `card__hero__legend.md:11` | `src/engine/god-conversion.js` onCardAs | `tests/v16_ab_god_conversion.test.mjs` — `AB 武神：红桃闪不能继续作为闪响应` |
| `wuhun` 武魂 | `god_guanyu` | 风 LE001 | `official_god_skill_specs.json` / `card__hero__legend.md:13` | `src/engine/god-conversion.js` onDamageAfter; onDeath | `tests/v16_ab_god_conversion.test.mjs` — `AB 武魂：受伤后按实际伤害增加来源梦魇` |
| `shelie` 涉猎 | `god_lvmeng` | 风 LE002 | `official_god_skill_specs.json` / `card__hero__legend.md:19` | `src/engine/god-cards.js` onDrawPhase → triggerShelie | `tests/v16_ab_god_cards.test.mjs` — `AB 涉猎终局清理在途亮牌，不留悬空帧` |
| `gongxin` 攻心 | `god_lvmeng` | 风 LE002 | `official_god_skill_specs.json` / `card__hero__legend.md:21` | `src/engine/god-cards.js` onActiveSkill → triggerGongxin | `tests/v16_ab_god_cards.test.mjs` — `AB 攻心查看后可放弃展示，仍消耗本阶段次数` |
| `qinyin` 琴音 | `god_zhouyu` | 火 LE003 | `official_god_skill_specs.json` / `card__hero__legend.md:27` | `src/engine/god-wrath.js` onDiscardPhaseEnd | `tests/v16_ac_wu_qun_god_audit.test.mjs` — `AC Qinyin cannot choose an impossible all-full recovery effect` |
| `yeyan` 业炎 | `god_zhouyu` | 火 LE003 | `official_god_skill_specs.json` / `card__hero__legend.md:29` | `src/engine/god-wrath.js` onActiveSkill | `tests/v16_ab_wrath_integration.test.mjs` — `AB Engine：业炎逐次火伤正常触发铁索传导且守恒` |
| `qixing` 七星 | `god_zhugeliang` | 火 LE004 | `official_god_skill_specs.json` / `card__hero__legend.md:35` | `src/engine/god-strategy.js` onInitialHand; onDrawPhaseEnd | `tests/v16_ab_strategy_integration.test.mjs` — `AB integrated Qixing draw-end pauses before play, exchanges, then resumes one phase exactly once` |
| `kuangfeng` 狂风 | `god_zhugeliang` | 火 LE004 | `official_god_skill_specs.json` / `card__hero__legend.md:41` | `src/engine/god-strategy.js modifyWind / beginEndPhase / clearWeather` | `tests/v16_ab_strategy_integration.test.mjs` — `AB integrated weather prevents damage before armor and amplifies fire before Silver Lion clamps it` |
| `dawu` 大雾 | `god_zhugeliang` | 火 LE004 | `official_god_skill_specs.json` / `card__hero__legend.md:43` | `src/engine/god-strategy.js modifyFog / beginEndPhase / clearWeather` | `tests/v16_ab_strategy_integration.test.mjs` — `AB integrated weather resolves before handing over turn, and clears at the owner next start` |
| `guixin` 归心 | `god_caocao` | 林 LE005（PR.LE005同正文） | `official_god_skill_specs.json` / `card__hero__legend.md:51` | `src/engine/god-cards.js` onDamageAfter → triggerGuixin | `tests/v16_ab_god_cards.test.mjs` — `AB 归心AI逐点两次发动翻回正面，无玩家归心窗口` |
| `feiying` 飞影 | `god_caocao` | 林 LE005（PR.LE005同正文） | `official_god_skill_specs.json` / `card__hero__legend.md:53` | `src/engine/state.js distanceBetween → skillEnabled(feiying)` | `tests/v16_ab_god_cards.test.mjs` — `AB 飞影只增加别人到自己的距离，动态失效/缠怨立即撤销` |
| `kuangbao` 狂暴 | `god_lvbu` | 林 LE006（SP022同正文） | `official_god_skill_specs.json` / `card__hero__legend.md:61` | `src/engine/god-wrath.js afterInitialHands / addRage` → onDamageAfter / onDamageDealt | `tests/v16_ab_wrath_integration.test.mjs` — `AB Engine：神吕布先选势力再发四牌，真开局狂暴给两标记` |
| `wumou` 无谋 | `god_lvbu` | 林 LE006（SP022同正文） | `official_god_skill_specs.json` / `card__hero__legend.md:63` | `src/engine/god-wrath.js beforeTrickUse` → game-engine.js 用锦囊前续接 | `tests/v16_ab_wrath_integration.test.mjs` — `AB Engine：无谋在无中效果前询问并先扣标记，再且仅摸两牌` |
| `shenfen` 神愤 | `god_lvbu` | 林 LE006（SP022同正文） | `official_god_skill_specs.json` / `card__hero__legend.md:65` | `src/engine/god-wrath.js` onActiveSkill | `tests/v16_ab_wrath_integration.test.mjs` — `AB Engine：神愤弃装备触发枭姬新摸的手牌也参与随后的弃四牌` |
| `wuqian` 无前 | `god_lvbu` | 林 LE006（SP022同正文） | `official_god_skill_specs.json` / `card__hero__legend.md:67` | `src/engine/god-wrath.js` onActiveSkill | `tests/v16_ab_wrath_integration.test.mjs` — `AB Engine：无前无效八卦并给予无双，只有一张闪仍受伤` |
| `juejing` 绝境 | `god_zhaoyun` | 山 LE007：体力X换牌版 | `official_god_skill_specs.json` / `card__hero__legend.md:73` | `src/engine/god-conversion.js` onDrawPhase | `tests/v16_ab_god_conversion.test.mjs` — `AB 绝境：满血仍加2手牌上限，受伤摸牌按已损失体力增加` |
| `longhun` 龙魂 | `god_zhaoyun` | 山 LE007：体力X换牌版 | `official_god_skill_specs.json` / `card__hero__legend.md:75` | `src/engine/god-conversion.js` onCardAs; onActiveSkill | `tests/v16_ab_god_conversion.test.mjs` — `AB 龙魂：方天最后两张手牌允许三个目标` |
| `renjie` 忍戒 | `god_simayi` | 山 LE008 | `official_god_skill_specs.json` / `card__hero__legend.md:81` | `src/engine/god-strategy.js` onDamageAfter → renjieDamage; onDiscardPhaseLoss | `tests/v16_ab_strategy_integration.test.mjs` — `AB integrated Renjie receives actual damage and discard marks, then Baiyin awakens before drawing` |
| `baiyin` 拜印 | `god_simayi` | 山 LE008 | `official_god_skill_specs.json` / `card__hero__legend.md:83` | `src/engine/god-strategy.js` onPreparePhase → baiyin | `tests/v16_ab_strategy_integration.test.mjs` — `AB integrated Renjie receives actual damage and discard marks, then Baiyin awakens before drawing` |
| `lianpo` 连破 | `god_simayi` | 山 LE008 | `official_god_skill_specs.json` / `card__hero__legend.md:85` | `src/engine/god-strategy.js` onAfterTurnEnd → afterTurnEnd | `tests/v16_ab_strategy_integration.test.mjs` — `AB integrated Lianpo uses settled kills and returns from an extra turn to the original next seat` |
| `jilue` 极略 | `god_simayi（拜印派生）` | 山 LE008 | `official_god_skill_specs.json` / `card__hero__legend.md:83` | `src/engine/god-strategy.js` onDamageAfter → jilueDamage; onCardUse; onActiveSkill | `tests/v16_ab_flow_review.test.mjs` — `AB 复核：极略鬼才拒绝窗口后新入手的牌不能先扣忍` |

## 排除：目录存在但尚未实现（含本次整卡补正）

| 技能 ID / 名称 | 武将 | 原因 |
|---|---|---|
| `fenji` 奋激 | `zhoutai` | `wu.md:367` 新风整卡本次补正；移牌原因事件尚未接入，明确TODO |
| `huashen` 化身 | `zuoci` | 不在 `IMPLEMENTED_SKILL_IDS`，不得计入已实现盘点 |
| `xinsheng` 新生 | `zuoci` | 不在 `IMPLEMENTED_SKILL_IDS`，不得计入已实现盘点 |
| `chongzhen` 冲阵 | `sp_zhaoyun` | 不在 `IMPLEMENTED_SKILL_IDS`，不得计入已实现盘点 |
| `lihun` 离魂 | `sp_diaochan` | 不在 `IMPLEMENTED_SKILL_IDS`，不得计入已实现盘点 |
| `zhuiji` 追击 | `sp_machao` | 不在 `IMPLEMENTED_SKILL_IDS`，不得计入已实现盘点 |
| `shichou` 誓仇 | `sp_machao` | 不在 `IMPLEMENTED_SKILL_IDS`，不得计入已实现盘点 |
| `yinling` 银铃 | `sp_ganning` | 不在 `IMPLEMENTED_SKILL_IDS`，不得计入已实现盘点 |
| `junwei` 军威 | `sp_ganning` | 不在 `IMPLEMENTED_SKILL_IDS`，不得计入已实现盘点 |
| `yanxiao` 言笑 | `sp_daqiao` | 不在 `IMPLEMENTED_SKILL_IDS`，不得计入已实现盘点 |
| `anxian` 安娴 | `sp_daqiao` | 不在 `IMPLEMENTED_SKILL_IDS`，不得计入已实现盘点 |

## 计数

- 吴：25 个已实现唯一技能 ID；5 个未实现。
- 群：29 个已实现唯一技能 ID（30 个技能槽，`biyue` 两名武将共用）；6 个未实现。
- 神：20 个原生已实现技能 ID，加派生 `jilue`，合计 21。
- 表内合计：75 个已实现唯一技能 ID；排除 11 个未实现技能槽/ID。

奋激来源对齐裁定：保留现有新风不屈，补回完整卡技能名【奋激】为未实现；没有混入旧风负体力机制，也没有把新增目录槽计入125已实现技能。详见主审报告。
