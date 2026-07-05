import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// v11 B2: 提示类/响应类面板已迁往 src/ui/panels/, 源为主文件 + 面板模块拼接。
const adapterSource = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(root, 'src/ui/panels/response-panels.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(root, 'src/ui/panels/prompt-panels.js'), 'utf8');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

// v11 A3 批次二: jiedao/guohe 面板的渲染分支与接线正则断言已由
// tests/ui_panels_a3_batch2.test.mjs 的 fake-DOM 全链路行为测试取代。

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

test('v8 PR-A4: jiedao-decision 文案展示 source 名 + 手中可用杀数', () => {
  assert.match(adapterSource, /actorDisplayName\(pending\.sourceActor\)/);
  // 数量描述
  assert.match(adapterSource, /手中可用/);
  // 包含三种 sha 类型 (sha / fire_sha / thunder_sha) 用于计数
  assert.match(adapterSource, /'fire_sha'/);
  assert.match(adapterSource, /'thunder_sha'/);
});

console.log('\nPending prompt panels A4 (jiedao + guohe-1v1) tests passed.');
