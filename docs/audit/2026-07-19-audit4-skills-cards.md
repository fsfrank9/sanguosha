# audit4 — 已实现技能与全牌型逻辑全量审计 (2026-07-19)

应用户指令「检查目前已实现的技能以及所有牌的逻辑是否有 bug」执行。

## 方法

- 12 个分域并行清查 (基本牌/单目标锦囊/多目标锦囊/延时判定/武器×2/
  魏蜀吴群技能×4/跨系统矩阵/结算顺序专项), 对照 gltjk 规则页 +
  标准/风包官方缓存, 每条候选发现必须附实跑复现脚本 (观察≠期望)。
- 每条候选经对抗验证 (先试图驳倒: spec 误读/脚手架 artifact/已知偏差),
  复现强制重跑。18 确证 → 按根因去重 16 (高2/中9/低5); 2 驳倒;
  3 归档已知偏差。
- 覆盖度审查: IMPLEMENTED_SKILL_IDS 53/53、buildDeck 全部 33 牌型
  无对象级漏审。

## 确证 16 条与修复 (同批修复, 回归 tests/v13_audit4_fixes.test.mjs)

| # | 严重度 | 症状 | 修复 |
|---|---|---|---|
| H1 | 高 | 南蛮/万箭来源牌被洗回牌堆后二次弃置 (守恒破坏, fuzz seed 50/550) | discardSourceCardIfPending 改 findCardZone 全区域落地判定 (含新扫创区) |
| H2 | 高 | useSkill 目标不查存活 — 反间/结姻对尸体生效并重放死亡结算 | useSkill 显式目标/targets 存活校验 + fanjian/jieyin/qingnang/rende trigger 补 hp>0 |
| M1 | 中 | playSha 显式目标可指自己/尸体 (尸体重放死亡奖惩) | normalizeSingleTarget 复用 自己/亡者 排除; handler 层拒绝路径退牌收口 (三条既有 fail 路径在途泄漏一并堵住) |
| M2 | 中 | 过河拆桥 identity3 仍 1v1 二选项, 判定区不可拆 (与顺手不一致) | isLegalCardTarget/canPlayCard/resolveGuohe1v1 按 mode 分档; ask 面板/auto/soak 决策表补判定区 |
| M3 | 中 | 火攻可对空手牌角色使用 (白触发集智) | isLegalCardTarget + canPlayCard ∃-目标预检 |
| M4 | 中 | heroes.js 标准包外全缺 gender — 雌雄双股剑对风/SP 将永不触发 | 全目录 44 条补 gender |
| M5 | 中 | 神速②装备区候选 id 恒 undefined — 弃已装备牌不可用 | shensuEquipCandidates 解包 {slot,card} → 原始卡 |
| M6 | 中 | 奇才 ignoreTrickDistance 从未被消费 — identity3 距离仍拦 | isLegalCardTarget 顺手/兵粮分支接入 hasPassiveEffect |
| M7 | 中 | 马超 camp 误标群 — 激将永不能征召 | camp 蜀 (SP 马超保持群); U4 测试群势力改吕布 |
| M8 | 中 | 借刀交武器不触发枭姬 (裸 moveCard 漏失去时机) | transferWeaponJiedao 接 triggerEquipmentLoss (依赖注入) |
| M9 | 中 | 急救只认红色手牌 — 仅红装备时救不了 | 候选+执行+濒死面板支持装备区红牌 (失去时机照常) |
| L1 | 低 | 青龙续杀只扫物理杀 — 龙胆闪当杀不可达 | 续杀经 onCardAs 找转化, 虚拟杀+physicals 回滚 |
| L2 | 低 | 濒死黑酒 (方法Ⅱ) 不触发银月枪 (唯一遗漏分支) | executeDyingRescue jiu 分支接 triggerYinyueQiang |
| L3 | 低 | 离间成本收窄为仅手牌 | removeOwnCardFromAnyZone (含装备, 失去时机照常) |
| L4 | 低 | 主公误杀忠臣弃装备绕过失去时机 (白银②/枭姬不触发) | 惩罚弃装备逐件补 triggerEquipmentLoss (亡者裸弃不变) |
| L5 | 低 | 决斗链漏挂起守卫 — 银月枪挂起时越序结算, auto/ask 结果分歧 | advanceDuelChain 入口+逐张支付守卫 (resumePaid 快照) + 亡者中止 + resumeDuelChain 续跑分支 |

**连带收口** (修复过程发现):
- playSha 三条拒绝路径 (非法目标/目标保护/距离) 不回滚已离手的牌 —
  handler 层"真在途才退回"统一收口。
- AI 目标兜底落死板 opponent() 槽位 (多席可能已亡): aiPrimaryFoe 兜底
  改存活座席; 仁德 AI 补显式存活目标 — 此前靠 H2/M1 漏洞打在尸体上
  "成功", 新校验如实拒绝后 soak 抓获。

## 驳倒 (2) 与已知偏差归档 (3)

- 驳倒: 闪电顺移回落自身后判定阶段续跑口径 (spec 解读不成立);
  另一条为脚手架 artifact。
- 归档: 护驾候选叠身份敌对过滤 (设计); 流离多人局 no-op (既知欠账
  延伸); 杀·无双双闪路径 deferred-ask 口径 (与既定延迟询问架构一致,
  决斗链已修的越序属另一类 — 多次独立伤害结算交错)。

复现/验证脚本存 session scratchpad audit4/ (不入库)。
