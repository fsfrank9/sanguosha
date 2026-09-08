// Reproduce AC3's added empirical pool. The three historical benchmark scripts,
// their seeds, rosters and gates are intentionally not imported or modified.
import fs from 'node:fs';
import { CATALOG, GOD_CATALOG, runControlled, runGapControls, runMixed } from '../tests/helpers/v16-ac-ai-evaluation.mjs';

const output = new URL('../docs/audit/2026-09-08-v16-ac-ai-evaluation.json', import.meta.url);
const report = new URL('../docs/audit/2026-09-08-v16-ac-ai-evaluation.md', import.meta.url);
const precomputed = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2])) : null;
const data = { schemaVersion: 1, date: '2026-09-08', engine: 'real SanguoshaEngine; native non-player defaults',
  scope: { tuvNative: 46, tuvDerived: ['jixi'], z: 3, abNative: 20, abDerived: ['jilue'], deferredExcluded: ['huashen', 'xinsheng'] },
  baseline: JSON.parse(fs.readFileSync(new URL('../tests/fixtures/v16_ac_ai_baseline.json', import.meta.url))),
  controlled: runControlled(), interventions: runGapControls(),
  mixed: precomputed?.mixed || runMixed(), godMixed: precomputed?.godMixed || runMixed(24, GOD_CATALOG, 169601) };
const signed = n => n > 0 ? '+' + n : String(n);
function totals(row, group, extra = false) {
  const d = extra ? row.additional.delta : row.delta;
  return ['hp', 'cards'].map(key => signed(row.groups[group].reduce((sum, seat) => sum + d[seat][key], 0))).join('/');
}
function metrics(row, extra = false) {
  return ['self', 'friends', 'foes'].map(group => totals(row, group, extra)).join('；');
}
const locked = new Set(['bazhen', 'xueyi', 'huoshou', 'wansha', 'weimu', 'roulin', 'benghuai', 'zaoxian', 'zhiji', 'xiangle', 'ruoyu', 'hunzi', 'duanchang', 'danji', 'yongsi', 'weidi']);
const sections = [
  '# v16 AC3：跨包 AI 使用与局部后果实测',
  '',
  'T/U/V 实际范围为 **46 个已实现原生技能 + 派生急袭 = 47 个技能 ID**。火包13、林包18、山包15原生+急袭；化身/新生仍 deferred，不进入分母。Z 新增单骑、庸肆、伪帝另列3行；AB 20原生+极略另列21行，不拿旧三基准冒充神将强度。',
  '',
  '本轮50个核心/Z技能各有真实受控机会，共53个机会；最终每个技能至少观察到一次使用或锁定效果。连环、酒池和驱虎各保留一个应当跳过的场景，并追加有明确战术目的的场景，分别为1/2。每行的1/1是构造机会的通过率，**不是自然对局发动概率或武将强度排名**。',
  '',
  '## 取样与度量',
  '',
  '- 受控场景：固定种子169301、4席、明确身份，技能持有者为非玩家AI席；主动行为调用 `Engine.aiTakeAction`，反应/锁定技能由真实用牌、摸牌、准备、弃牌或死亡流程提供触发。技能偏好保持原生默认；只有人类席的响应由确定性测试策略解决。7个干预对照明确标为人工指定转换或auto偏好，不冒充AI自己选择。',
  '- 表中“己/友/敌”在动作前由真实身份与感知关系确定。“HP/牌”是这一次完整Engine调用及其子窗口前后的差；牌数=手牌+装备，另保留田、上限、翻面等原始字段。正常摸牌、伤害触发、击杀奖惩也包含在窗口内，**不能把整窗差额全部归因于该技能**。正负数是后果，不是统一收益分。',
  '- 连环重置、兵粮入判定区、天义授权、放权额外回合等由日志/状态验证，不硬换算成HP或牌价。崩坏为强制负面技；强袭的HP支出、涅槃前濒死、断肠前死亡、觉醒减上限都不自动归为AI滥用。',
  `- 核心混合样本：${data.mixed.seeds}种子（${data.mixed.firstSeed}起），4席、25名核心/Z武将轮换，明/暗身份交替，主公席也轮换。${data.mixed.actions}个外部推进窗口，${data.mixed.finished}局终局，${data.mixed.truncated}局达到${data.mixed.maxActions}窗口上限。`,
  '- 混合表的“日志窗口”=一个推进窗口内出现该技能可识别效果日志，最多记一次；它不是触发次数，也不包括没有专名日志的锁定效果。“持技行动窗口”包括该持有者回合中响应挂起后的续跑，不能叫完整回合数。混合场景没有为所有被动条件建立精确机会计数；0日志只能叫未观察到信号，不能宣称AI有机会却从不使用。受控机会负责区分这两者。',
  '- 7个修前记录保留在 `tests/fixtures/v16_ac_ai_baseline.json`：是在AC共享工作树、AI文件尚未修改时截取，并非一次干净AB整树消融。其余领域同期有独立修复，因此不把混合终局变化归因于本轮AI改动。',
  '',
  '## 发现、对照与修复',
  '',
  '| 技能/问题 | 修前真实AI | 明确干预的局部后果 | 最終策略 |',
  '|---|---|---|---|',
  '| 火计 | 红闪可转换且有付款牌仍不动 | 消耗2牌、敌方−1HP | 按火攻身份评估；只检查自身付款资源与公开合法目标 |',
  '| 连环 | 梅花闪不被列为有值候选 | 消耗1牌、角色横置/重置 | 无目的横置仍跳过；友方已横置时转换解链，或自身有元素攻击时考虑敌方连锁 |',
  '| 断粮 | 黑闪按原来的闪评分，候选为0 | 消耗1牌，敌方判定区获得兵粮 | 按延时锦囊身份及合法敌方目标评估 |',
  '| 酒池 | 普通机会优先使用未加酒的杀 | 消耗1牌，自己下一杀获得+1 | 普通机会允许原攻击；敌方2HP击杀线选酒池，再保留杀 |',
  '| 巧变摸牌 | 默认decline，自己摸2，敌牌不动 | 成本1、获得2：自己+1牌、两敌各−1牌 | 仅两名可取牌敌方且实际付款牌不是桃/杀/无懈时考虑；否则保留正常摸牌 |',
  '| 急袭 | 空手有田且有合法敌方牌仍none | 消耗1田、自己+1牌、敌方−1牌 | 枚举本人的田，用同一转换门及同一合法目标评估/执行 |',
  '| 放权 | 仅闪且有友方可用额外回合仍decline | 自己−1牌，友方得到额外回合并开始摸2 | 自己没有正收益普通用牌，保留成本，实际第一友方未翻面且有可达敌方才考虑 |',
  '| 驱虎友方伤害 | 拼点必赢，但目标射程内只有自己和友方；赢后友方−1HP | 给拼点目标长距离武器后可令另一敌方−1HP | 仅当目标攻击范围内存在感知敌对的合法受害者才发起 |',
  '| 天义成本空耗 | 唯一手牌杀K被用于拼点；赢后空手，没有杀可用授权 | 同场直接出杀可对敌方造成1伤害 | 按真实拼点选牌器预选成本，支付后必须仍有原生杀；两手牌有独立高点成本时仍发动 |',
  '',
  '天义这一行是可重现的资源机会成本问题；不宣称所有“用杀拼点”的局势都劣，也没有把一局胜负包装为因果强度证据。所有新选择只读取自己的具体牌以及公开手牌数、装备、田、状态与感知身份。',
  '',
  '## T/U/V 与 Z 逐技能记录',
  '',
  '“整窗差”顺序为 **己HP/牌；友HP/牌；敌HP/牌**。“机会/使用”写作使用数/机会数。“混合”写作有日志窗口/持技行动窗口（括号为参与局数）。锁定效果不受AI自由决策控制。',
  '',
  '| 包 / 技能 | 机会与可观察效果 | 使用/机会 | 整窗差 | 混合日志/行动窗（局） |',
  '|---|---|---:|---|---:|'
];
for (const row of data.controlled) {
  const mixed = data.mixed.rows[row.id];
  const note = [locked.has(row.id) ? '锁定/持续效果' : '', row.note].filter(Boolean).join('；');
  const effect = row.opportunity + (row.additional ? '；追加：' + row.additional.opportunity : '') + (note ? '。' + note : '');
  const metric = metrics(row) + (row.additional ? '；追加[' + metrics(row, true) + ']' : '');
  sections.push(`| ${row.pack} / ${row.name} \`${row.id}\` | ${effect} | ${row.uses}/${row.opportunities} | ${metric} | ${mixed.intervalsWithSkillLog}/${mixed.decisionIntervals}（${mixed.games}） |`);
}
sections.push('', '## AB 神将附加样本', '',
  `单独${data.godMixed.seeds}种子（${data.godMixed.firstSeed}起）、八神将轮换，4席，明暗身份与主公角色轮换；${data.godMixed.actions}推进窗口，${data.godMixed.finished}终局，${data.godMixed.truncated}截断。该附表是额外探索，**没有宣称完成21技能各分支的受控强度评估**。无日志的觉醒/死亡/特殊条件不记作AI从不使用。七星开局分牌发生于采样循环前，表中只会计入后续交换日志。`, '',
  '| AB 技能 | 参与局 | 持技行动窗 | 有日志窗口 | 有日志窗口中的持有者HP/牌差合计 |', '|---|---:|---:|---:|---:|');
for (const e of GOD_CATALOG) {
  const row = data.godMixed.rows[e.id];
  sections.push(`| ${e.name} \`${e.id}\` | ${row.games} | ${row.decisionIntervals} | ${row.intervalsWithSkillLog} | ${signed(row.hpDelta)}/${signed(row.cardDelta)} |`);
}
sections.push('', '## 回归与复现', '',
  '- `node tests/v16_ac_ai_evaluation.test.mjs`：范围/逐行机会、真实干预合法性、田材料守恒、无目标保留、巧变与放权保守反例、天义成本/驱虎友伤正反例、报告覆盖。',
  '- `node tools/evaluate-v16-ac-ai.mjs`：重建此Markdown及相邻JSON，保留完整原始日志与每席HP/牌/上限/田/翻面差。临时缺少新挂起类型的测试响应时脚本硬失败，不计为成功终局。',
  '- 三个历史基准脚本、阵容、种子和阈值均未修改：v12 I 64.0%（128/200，门槛55%）；M4 5席67.9%、4席69.1%；Q2 v14为主公侧9/反贼14/内奸1，对照m3为7/17/0。最终AC整树门禁以收官记录为准。',
  '', '本评估识别了新技能候选遗漏、相位偏好从不发动和两项具体不利后果，并回钉修复。自然样本中低频觉醒/主公/死亡时机的机会不足仍然如实显示；它们的规则正确性由对应专项回归与AC1审计负责。', '');
fs.writeFileSync(output, JSON.stringify(data, null, 2) + '\n');
fs.writeFileSync(report, sections.join('\n'));
console.log(`AC3: ${data.controlled.length} skill rows / ${data.controlled.reduce((sum, r) => sum + r.opportunities, 0)} opportunities; mixed ${data.mixed.actions} + gods ${data.godMixed.actions} windows`);
