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

test('v8 PR-A5: index.html 含 wuguPickPanel + Hint + Choices', () => {
  assert.match(htmlSource, /id="wuguPickPanel"[^>]*hidden/);
  assert.match(htmlSource, /id="wuguPickHint"/);
  assert.match(htmlSource, /id="wuguPickChoices"/);
});

test('v8 PR-A5: wuguPickPanel 用通用框架类', () => {
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel[^"]*"\s+id="wuguPickPanel"/);
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel__hint[^"]*"\s+id="wuguPickHint"/);
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel__choices[^"]*"\s+id="wuguPickChoices"/);
});

test('v8 PR-A5: els 缓存新增 wuguPickPanel / wuguPickHint / wuguPickChoices', () => {
  assert.match(adapterSource, /'wuguPickPanel',\s*'wuguPickHint',\s*'wuguPickChoices'/);
});

// v11 A3: wugu-pick 渲染分支/候选渲染/点选接线断言已由
// tests/ui_panels_a3_batch1.test.mjs 的 fake-DOM 全链路行为测试取代。

test('v8 PR-A5: wugu-pick 文案区分 source=self vs source=opponent', () => {
  // 应当有 pending.sourceActor === pending.actor 分支判断 "你" vs actorDisplayName
  assert.match(adapterSource, /pending\.sourceActor === pending\.actor/);
  // 文案应当含 "亮出" + "请挑"
  assert.match(adapterSource, /亮出/);
  assert.match(adapterSource, /请挑/);
});

test('v8 PR-A5: wugu 无 decline 按钮（spec：必须挑一张）', () => {
  // 不应在 index.html 中存在 wuguPickDeclineBtn
  assert.doesNotMatch(htmlSource, /id="wuguPickDeclineBtn"/);
});

console.log('\nPending prompt panel A5 (wugu-pick) tests passed.');
