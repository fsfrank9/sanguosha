// v9 PR-E22 守护测试: 电脑回合节奏放慢.
// 用户反馈: "自动出牌阶段过得太快, 来不及反应, 没有体验感".
// 拆两档延时: 出牌阶段实质动作 enemyActionDelay (慢), 阶段切换 enemyPhaseDelay.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adapter = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v9 PR-E22: enemyActionDelay 放慢到 >= 1200ms (原 650 太快)', () => {
  const m = adapter.match(/var enemyActionDelay\s*=\s*(\d+)/);
  assert.ok(m, 'enemyActionDelay 变量存在');
  assert.ok(Number(m[1]) >= 1200, 'enemyActionDelay 应 >= 1200, 实际 ' + m[1]);
});

test('v9 PR-E22: 新增 enemyPhaseDelay (阶段切换延时, 比 action 短)', () => {
  const phase = adapter.match(/var enemyPhaseDelay\s*=\s*(\d+)/);
  assert.ok(phase, 'enemyPhaseDelay 变量存在');
  const action = adapter.match(/var enemyActionDelay\s*=\s*(\d+)/);
  assert.ok(Number(phase[1]) < Number(action[1]), 'enemyPhaseDelay 应短于 enemyActionDelay');
});

test('v9 PR-E22: enemyStep 出牌动作分支用 enemyActionDelay (慢节奏)', () => {
  const fn = adapter.match(/function enemyStep\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  // play 阶段实质动作 → enemyActionDelay
  assert.match(fn[0], /setTimeout\(enemyStep,\s*enemyActionDelay\)/);
  // 阶段切换 → enemyPhaseDelay
  assert.match(fn[0], /setTimeout\(enemyStep,\s*enemyPhaseDelay\)/);
});

test('v9 PR-E22: maybeStartEnemyTurn 用 enemyPhaseDelay 起步', () => {
  const fn = adapter.match(/function maybeStartEnemyTurn\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /setTimeout\(enemyStep,\s*enemyPhaseDelay\)/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
