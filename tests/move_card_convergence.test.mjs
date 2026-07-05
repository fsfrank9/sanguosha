import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// v11 A2 架构守护: 引擎中"牌离开/进入区域"必须走 CardRuntime 的
// moveCard/takeCard/putCard 原语。除下方白名单外, game-engine.js 不允许
// 出现对 hand/deck/discard/judgeArea/equipment 槽位的裸 push/splice/
// shift/pop/赋值 —— 新增裸站点会在这里立刻爆, 防止再开"牌凭空增减"的洞。

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// v11 B1: 域拆分后, 引擎规则代码分布在主文件 + 各域模块, 守护一并覆盖。
const ENGINE_RULE_FILES = [
  'src/engine/game-engine.js',
  'src/engine/damage-dying.js',
  'src/engine/ai.js',
];
const engineSource = ENGINE_RULE_FILES
  .map((rel) => fs.readFileSync(path.join(root, rel), 'utf8'))
  .join('\n');

// 允许保留的裸操作 (逐行精确匹配, 语义见各行注释):
const ALLOWED_RAW_LINES = [
  // reshuffleIfNeeded: 唯一的整堆搬移 (弃牌堆→洗混→新牌堆)
  'game.deck = shuffle(game.discard.splice(0), game.random);',
  // removeCardFromHand / removeFirstMatchingCard: state 签名的手牌移出适配器
  // (调用方无一例外持有 game, 但两个助手保持窄签名, 是受控的单一出口)
  'return state.hand.splice(index, 1)[0];',
  // removeOwnCardFromAnyZone 的 game=null 兜底分支 (无 game 无法走原语)
  'state.equipment[hit.slot] = null;',
  // processJudgeArea: 整批取出判定区待结算牌进入在途结算
  'pending = state.judgeArea.splice(0);',
];

const RAW_MUTATION = new RegExp(
  String.raw`\.hand\.(push|splice|shift|pop|unshift)\(`
  + String.raw`|\bdeck\.(push|splice|shift|pop|unshift)\(`
  + String.raw`|\bdiscard\.(push|splice|shift|pop|unshift)\(`
  + String.raw`|\.judgeArea\.(push|splice|shift|pop|unshift)\(`
  + String.raw`|\.equipment\[[^\]]*\]\s*=[^=]`
  + String.raw`|\.equipment\.(weapon|armor|horseMinus|horsePlus)\s*=[^=]`
);

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('game-engine 不含白名单之外的裸区域操作', () => {
  const offenders = [];
  engineSource.split('\n').forEach((line, i) => {
    const code = line.trim();
    if (code.startsWith('//') || code.startsWith('*')) return;
    if (!RAW_MUTATION.test(line)) return;
    if (ALLOWED_RAW_LINES.some((allowed) => code.startsWith(allowed))) return;
    offenders.push(`${i + 1}: ${code}`);
  });
  assert.deepEqual(offenders, [], '发现白名单之外的裸区域操作 (应改走 moveCard/takeCard/putCard)');
});

test('白名单行仍然存在 (防止改动后白名单腐化为死条目)', () => {
  for (const allowed of ALLOWED_RAW_LINES) {
    assert.ok(engineSource.includes(allowed), `白名单条目已不存在, 请同步清理: ${allowed}`);
  }
});

test('game-engine 绑定了 CardRuntime 的四个牌移动原语', () => {
  for (const name of ['findCardZone', 'takeCard', 'putCard', 'moveCard']) {
    assert.match(engineSource, new RegExp(`var ${name} = CardRuntime\\.${name};`),
      `game-engine 应从 CardRuntime 绑定 ${name}`);
  }
});

test('UI 层不直接操作牌区域', () => {
  const uiSource = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8');
  assert.doesNotMatch(uiSource, RAW_MUTATION, 'dom-adapter 不应裸操作 hand/deck/discard/judgeArea/equipment');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
