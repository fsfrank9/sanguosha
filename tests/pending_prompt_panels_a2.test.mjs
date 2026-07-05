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

// v11 A3 批次二: qilin 面板的渲染分支与接线正则断言已由
// tests/ui_panels_a3_batch2.test.mjs 的 fake-DOM 全链路行为测试取代。

test('v8 PR-A2: index.html 含 qilinPickPanel + qilinPickHint + qilinPickChoices + qilinDeclineBtn', () => {
  assert.match(htmlSource, /id="qilinPickPanel"[^>]*hidden/);
  assert.match(htmlSource, /id="qilinPickHint"/);
  assert.match(htmlSource, /id="qilinPickChoices"/);
  assert.match(htmlSource, /id="qilinDeclineBtn"/);
});

test('v8 PR-A2: qilinPickPanel 用通用框架类 (pending-prompt-panel)', () => {
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel[^"]*"\s+id="qilinPickPanel"/);
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel__hint[^"]*"\s+id="qilinPickHint"/);
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel__choices[^"]*"\s+id="qilinPickChoices"/);
});

test('v8 PR-A2: index.html 含 dyingRescuePanel + dyingRescueHint + dyingRescueChoices + dyingRescueDeclineBtn', () => {
  assert.match(htmlSource, /id="dyingRescuePanel"[^>]*hidden/);
  assert.match(htmlSource, /id="dyingRescueHint"/);
  assert.match(htmlSource, /id="dyingRescueChoices"/);
  assert.match(htmlSource, /id="dyingRescueDeclineBtn"/);
});

test('v8 PR-A2: dyingRescuePanel 用通用框架类', () => {
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel[^"]*"\s+id="dyingRescuePanel"/);
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel__hint[^"]*"\s+id="dyingRescueHint"/);
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel__choices[^"]*"\s+id="dyingRescueChoices"/);
});

test('v8 PR-A2: dom-adapter els 缓存新增 6 个 id (qilin*: 4 / dyingRescue*: 4 实际写了 2+2)', () => {
  // els registration 中两个 panel 的 4 个 id 都要在列表里
  assert.match(adapterSource, /'qilinPickPanel',\s*'qilinPickHint',\s*'qilinPickChoices',\s*'qilinDeclineBtn'/);
  assert.match(adapterSource, /'dyingRescuePanel',\s*'dyingRescueHint',\s*'dyingRescueChoices',\s*'dyingRescueDeclineBtn'/);
});

test('v8 PR-A2: qilin-pick 渲染用 promptCardChoice + 标 +1/-1 马 prefix', () => {
  // 在 qilin-pick 分支内部应当调用 promptCardChoice + dataAttrs.qilinSlot
  assert.match(adapterSource, /qilinSlot:\s*slot/);
  assert.match(adapterSource, /'\+1 马 '/);
  assert.match(adapterSource, /'-1 马 '/);
});

test('v8 PR-A2: renderPendingChoice 含 dying-rescue 分支', () => {
  assert.match(adapterSource, /kind === 'dying-rescue' && pending\.actor === 'player'/);
});

test('v8 PR-A2: dying-rescue 文案根据 selfRescue 区分 (自救/救他人)', () => {
  assert.match(adapterSource, /selfRescue\s*=\s*pending\.actor === pending\.dyingActor/);
  // 至少有"自救"和"濒死"两个不同文案
  assert.match(adapterSource, /自救/);
  assert.match(adapterSource, /可用【桃】救援/);
});

test('v8 PR-A2: dying-rescue 渲染时 桃/酒 用 promptCardChoice + suffix 标识', () => {
  assert.match(adapterSource, /dyingRescueCardId:\s*cardId/);
  // 酒带 "酒Ⅱ" suffix, 桃带 "桃" suffix
  assert.match(adapterSource, /'\s*·\s*酒Ⅱ'/);
  assert.match(adapterSource, /'\s*·\s*桃'/);
});

test('v8 PR-A2 / v9 PR-E24: dyingRescueChoices click → stage (kind:pending, payload.cardId)', () => {
  assert.match(adapterSource, /dyingRescueChoices\.addEventListener\([\s\S]{0,300}data-dying-rescue-card-id/);
  // v11 B2: 面板模块内经注入的 stage() 提交。
  assert.match(adapterSource, /dyingRescueChoices\.addEventListener\([\s\S]{0,400}stage\(\{\s*cardId:\s*cardId\s*\}/);
});

test('v8 PR-A2: 事件绑定 — dyingRescueDeclineBtn click → resolvePendingChoice({decline:true})', () => {
  assert.match(adapterSource, /dyingRescueDeclineBtn\.addEventListener[\s\S]{0,200}resolvePendingChoice\(getGame\(\),\s*\{\s*decline:\s*true\s*\}/);
});

console.log('\nPending prompt panels A2 (qilin + dying) tests passed.');
