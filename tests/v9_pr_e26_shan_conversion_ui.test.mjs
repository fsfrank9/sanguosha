// v9 PR-E26 守护测试 (UI 侧): 闪响应面板列出候选 (真闪 + 转化牌) 让玩家选.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// v11 B2: 闪/无懈/决斗响应面板已迁往 src/ui/panels/response-panels.js,
// adapter 源为主文件 + 面板模块拼接 (渲染/文案类断言两处皆可命中)。
const adapter = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(root, 'src/ui/panels/response-panels.js'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'src/engine/game-engine.js'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v9 PR-E26: 引擎含 shanOptionForCard + listShanResponseOptions', () => {
  assert.match(engine, /function shanOptionForCard\(state, cardId\)/);
  assert.match(engine, /function listShanResponseOptions\(state\)/);
});

test('v9 PR-E26: shanOptionForCard 识别 真闪 / 龙胆 / 倾国', () => {
  const fn = engine.match(/function shanOptionForCard\([\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /card\.type\s*===\s*'shan'/);
  assert.match(fn[0], /hasSkill\(state,\s*'longdan'\)/);
  assert.match(fn[0], /hasSkill\(state,\s*'qingguo'\)/);
});

test('v9 PR-E26: findResponseCard 支持 preferredCardId (指定牌当闪)', () => {
  assert.match(engine, /function findResponseCard\(state, type, preferredCardId, game\)/);
  assert.match(engine, /if\s*\(preferredCardId\)/);
});

test('v9 PR-E26: shan-response 请求带 options (listShanResponseOptions; v10 V3 后从 requestPlayerResponse 调用传入)', () => {
  assert.match(engine, /kind:\s*'shan-response'[\s\S]{0,300}options:\s*listShanResponseOptions/);
});

test('v9 PR-E26: renderPendingChoice 渲染 shanResponseChoices 候选 (data-shan-card-id)', () => {
  assert.match(adapter, /shanResponseChoices\.innerHTML[\s\S]{0,400}data-shan-card-id/);
  // 候选标签含 via 前缀 (龙胆·/倾国·) 来源
  assert.match(adapter, /opt\.via\s*\?\s*opt\.via/);
});

test('v9 PR-E26: shanResponseChoices click → stage (kind:pending, payload.cardId)', () => {
  const win = adapter.match(/els\.shanResponseChoices\.addEventListener\('click',[\s\S]{0,400}/);
  assert.ok(win);
  // v11 B2: 面板模块内经注入的 stage() 提交 (语义同 stagedModalChoice 赋值)。
  assert.match(win[0], /stage\(\{\s*cardId:\s*cardId\s*\}/);
  assert.match(win[0], /data-shan-card-id/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
