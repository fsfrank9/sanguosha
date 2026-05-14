// v9 PR-E0 守护测试: CSS 拆分结构.
// 验证:
//   1. 8 个分文件都存在
//   2. main.css 只包含 @import 行 (不再有具体 CSS 规则)
//   3. main.css @import 顺序正确 (tokens → layout → 组件 → setup)
//   4. helpers/load-styles.mjs 暴露 loadAllStyles + SPLIT_CSS_FILES
//   5. 每个分文件首行是注释 (file purpose)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllStyles, SPLIT_CSS_FILES } from './helpers/load-styles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylesDir = path.join(root, 'src', 'styles');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v9 PR-E0: 8 个分文件都存在', () => {
  const expected = ['tokens.css', 'layout.css', 'hero.css', 'cards.css', 'zones.css', 'modals.css', 'controls.css', 'setup.css'];
  for (const name of expected) {
    const full = path.join(stylesDir, name);
    assert.ok(fs.existsSync(full), `${name} should exist in src/styles/`);
  }
});

test('v9 PR-E0: SPLIT_CSS_FILES 暴露 8 个文件名 (与实际拆分一致)', () => {
  assert.equal(SPLIT_CSS_FILES.length, 8);
  assert.deepEqual(SPLIT_CSS_FILES, ['tokens.css', 'layout.css', 'hero.css', 'cards.css', 'zones.css', 'modals.css', 'controls.css', 'setup.css']);
});

test('v9 PR-E0: main.css 不再含具体 CSS 规则 (只剩 @import + 注释)', () => {
  const main = fs.readFileSync(path.join(stylesDir, 'main.css'), 'utf8');
  // 应该只有 @import 行和注释; 不应出现 selector + {
  // 简单规则: 行不能含 `{` 除非是注释行或 @import (后者末尾分号不带 `{`)
  const lines = main.split('\n');
  for (const line of lines) {
    if (line.includes('{')) {
      // 这是 selector — 不应存在
      assert.fail('main.css should not contain any CSS rule selectors after split; found: ' + line);
    }
  }
  // 必须含 8 个 @import
  assert.equal((main.match(/@import\s+['"]\.\//g) || []).length, 8, 'main.css should @import all 8 split files');
});

test('v9 PR-E0: main.css @import 顺序 (tokens 在第一, setup 在最后)', () => {
  const main = fs.readFileSync(path.join(stylesDir, 'main.css'), 'utf8');
  const importLines = main.split('\n').filter((l) => /^\s*@import\s+['"]/.test(l));
  assert.match(importLines[0], /tokens\.css/, '第一个 @import 应是 tokens.css (foundation)');
  assert.match(importLines[importLines.length - 1], /setup\.css/, '最后一个 @import 应是 setup.css (可能 override)');
});

test('v9 PR-E0: 每个分文件首行是 comment 标题 (说明职责)', () => {
  for (const name of SPLIT_CSS_FILES) {
    const content = fs.readFileSync(path.join(stylesDir, name), 'utf8');
    const firstLine = content.split('\n')[0];
    assert.match(firstLine, /^\/\*/, `${name} should start with a /* comment */ block describing its purpose`);
  }
});

test('v9 PR-E0: loadAllStyles() 返回拼接结果 + 含原始内容片段', () => {
  const all = loadAllStyles();
  // tokens 内容
  assert.match(all, /:root\s*\{/);
  assert.match(all, /--gold:/);
  // layout 内容
  assert.match(all, /\.layout\s*\{/);
  assert.match(all, /\.duel-table\s*\{/);
  // hero 内容
  assert.match(all, /\.hp-row\s*\{/);
  // cards 内容
  assert.match(all, /\.card-corner\s*\{/);
  // modals 内容
  assert.match(all, /\.pending-prompt-panel\s*\{/);
  assert.match(all, /\.pending-prompt-panel\[hidden\]/);
  // controls 内容
  assert.match(all, /\.btn\s*\{/);
  // setup 内容
  assert.match(all, /\.setup-screen\s*\{/);
});

test('v9 PR-E0: index.html 仍然引用 main.css (不动入口)', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /<link\s+rel="stylesheet"\s+href="\.\/src\/styles\/main\.css"/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
