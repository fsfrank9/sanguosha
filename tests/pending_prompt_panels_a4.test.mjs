import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const adapterSource = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test('v8 PR-A4: index.html 含 jiedaoDecisionPanel + 4 件套', () => {
  assert.match(htmlSource, /id="jiedaoDecisionPanel"[^>]*hidden/);
  assert.match(htmlSource, /id="jiedaoDecisionHint"/);
  assert.match(htmlSource, /id="jiedaoDecisionFireBtn"/);
  assert.match(htmlSource, /id="jiedaoDecisionDeclineBtn"/);
});

test('v8 PR-A4: jiedaoDecisionPanel 用通用框架类', () => {
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel[^"]*"\s+id="jiedaoDecisionPanel"/);
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel__hint[^"]*"\s+id="jiedaoDecisionHint"/);
});

test('v8 PR-A4: index.html 含 guohePickPanel + Hint + Equipment + Hand', () => {
  assert.match(htmlSource, /id="guohePickPanel"[^>]*hidden/);
  assert.match(htmlSource, /id="guohePickHint"/);
  assert.match(htmlSource, /id="guohePickEquipment"/);
  assert.match(htmlSource, /id="guohePickHand"/);
});

test('v8 PR-A4: guohePickPanel 用通用框架类（含两个 choices 容器）', () => {
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel[^"]*"\s+id="guohePickPanel"/);
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel__hint[^"]*"\s+id="guohePickHint"/);
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel__choices[^"]*"\s+id="guohePickEquipment"/);
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel__choices[^"]*"\s+id="guohePickHand"/);
});

test('v8 PR-A4: els 缓存新增 jiedaoDecision* + guohePick* (8 个 id)', () => {
  assert.match(adapterSource, /'jiedaoDecisionPanel',\s*'jiedaoDecisionHint',\s*'jiedaoDecisionFireBtn',\s*'jiedaoDecisionDeclineBtn'/);
  assert.match(adapterSource, /'guohePickPanel',\s*'guohePickHint',\s*'guohePickEquipment',\s*'guohePickHand'/);
});

test('v8 PR-A4: renderPendingChoice 含 jiedao-decision 分支 (actor=player)', () => {
  assert.match(adapterSource, /kind === 'jiedao-decision' && pending\.actor === 'player'/);
});

test('v8 PR-A4: jiedao-decision 文案展示 source 名 + 手中可用杀数', () => {
  assert.match(adapterSource, /actorDisplayName\(pending\.sourceActor\)/);
  // 数量描述
  assert.match(adapterSource, /手中可用/);
  // 包含三种 sha 类型 (sha / fire_sha / thunder_sha) 用于计数
  assert.match(adapterSource, /'fire_sha'/);
  assert.match(adapterSource, /'thunder_sha'/);
});

test('v8 PR-A4: renderPendingChoice 含 guohe-1v1-pick 分支 (actor=player)', () => {
  assert.match(adapterSource, /kind === 'guohe-1v1-pick' && pending\.actor === 'player'/);
});

test('v8 PR-A4: guohe-1v1-pick 渲染 equipment + hand 双区, 用 promptCardChoice', () => {
  // equipment 列表
  assert.match(adapterSource, /guoheZone:\s*'equipment'/);
  assert.match(adapterSource, /guoheCardId:\s*entry\.cardId/);
  // hand 列表
  assert.match(adapterSource, /guoheZone:\s*'hand'/);
  // spec 提示文案"观看"
  assert.match(adapterSource, /spec：观看后弃/);
});

test('v8 PR-A4: 事件绑定 — jiedaoDecisionFireBtn → resolvePendingChoice({fire:true})', () => {
  assert.match(adapterSource, /jiedaoDecisionFireBtn\.addEventListener[\s\S]{0,200}resolvePendingChoice\(game,\s*\{\s*fire:\s*true\s*\}/);
});

test('v8 PR-A4: 事件绑定 — jiedaoDecisionDeclineBtn → resolvePendingChoice({decline:true})', () => {
  assert.match(adapterSource, /jiedaoDecisionDeclineBtn\.addEventListener[\s\S]{0,200}resolvePendingChoice\(game,\s*\{\s*decline:\s*true\s*\}/);
});

test('v8 PR-A4: 共享 handleGuohePickClick 函数 + 两容器都绑', () => {
  assert.match(adapterSource, /function handleGuohePickClick\(event\)/);
  assert.match(adapterSource, /guohePickEquipment\.addEventListener\('click',\s*handleGuohePickClick\)/);
  assert.match(adapterSource, /guohePickHand\.addEventListener\('click',\s*handleGuohePickClick\)/);
});

test('v8 PR-A4 / v9 PR-E24: handleGuohePickClick → stage (kind:pending, payload {zone, cardId})', () => {
  // v9 PR-E24: 改两步化 — 点候选只 stage, #handConfirmBtn 才 resolvePendingChoice.
  assert.match(adapterSource, /function handleGuohePickClick\(event\)\s*\{[\s\S]{0,400}stagedModalChoice\s*=\s*\{[\s\S]{0,200}zone:\s*zone,\s*cardId:\s*cardId/);
});

console.log('\nPending prompt panels A4 (jiedao + guohe-1v1) tests passed.');
