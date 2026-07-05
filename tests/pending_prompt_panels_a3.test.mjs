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

// v11 A3 批次三: cixiong-fire / cixiong-choose 面板的渲染分支与接线正则断言
// 已由 tests/ui_panels_a3_batch3.test.mjs 的 fake-DOM 全链路行为测试取代。

test('v8 PR-A3: index.html 含 cixiongFirePanel + Hint + FireBtn + DeclineBtn', () => {
  assert.match(htmlSource, /id="cixiongFirePanel"[^>]*hidden/);
  assert.match(htmlSource, /id="cixiongFireHint"/);
  assert.match(htmlSource, /id="cixiongFireBtn"/);
  assert.match(htmlSource, /id="cixiongFireDeclineBtn"/);
});

test('v8 PR-A3: cixiongFirePanel 用通用框架类', () => {
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel[^"]*"\s+id="cixiongFirePanel"/);
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel__hint[^"]*"\s+id="cixiongFireHint"/);
});

test('v8 PR-A3: index.html 含 cixiongChoosePanel + Hint + Choices + DrawBtn', () => {
  assert.match(htmlSource, /id="cixiongChoosePanel"[^>]*hidden/);
  assert.match(htmlSource, /id="cixiongChooseHint"/);
  assert.match(htmlSource, /id="cixiongChooseChoices"/);
  assert.match(htmlSource, /id="cixiongChooseDrawBtn"/);
});

test('v8 PR-A3: cixiongChoosePanel 用通用框架类', () => {
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel[^"]*"\s+id="cixiongChoosePanel"/);
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel__hint[^"]*"\s+id="cixiongChooseHint"/);
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel__choices[^"]*"\s+id="cixiongChooseChoices"/);
});

test('v8 PR-A3: els 缓存新增 cixiongFire* + cixiongChoose* (8 个 id)', () => {
  assert.match(adapterSource, /'cixiongFirePanel',\s*'cixiongFireHint',\s*'cixiongFireBtn',\s*'cixiongFireDeclineBtn'/);
  assert.match(adapterSource, /'cixiongChoosePanel',\s*'cixiongChooseHint',\s*'cixiongChooseChoices',\s*'cixiongChooseDrawBtn'/);
});

test('v8 PR-A3: cixiong-fire 文案提及"异性"和 target 名', () => {
  // 文案应同时含 "异性" 和 actorDisplayName(pending.target)
  assert.match(adapterSource, /'雌雄双股剑：对'\s*\+\s*actorDisplayName\(pending\.target\)/);
  assert.match(adapterSource, /异性/);
});

console.log('\nPending prompt panels A3 (cixiong-fire + cixiong-choose) tests passed.');
