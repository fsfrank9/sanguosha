import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadAllStyles } from './helpers/load-styles.mjs';

const root = path.resolve(import.meta.dirname, '..');
const cssSource = loadAllStyles();
const adapterSource = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test('v8 PR-A1: CSS 含通用 pendingChoice 面板框架四件套', () => {
  assert.match(cssSource, /\.pending-prompt-panel\s*\{/);
  assert.match(cssSource, /\.pending-prompt-panel__hint\s*\{/);
  assert.match(cssSource, /\.pending-prompt-panel__choices\s*\{/);
  assert.match(cssSource, /\.pending-prompt-panel__actions\s*\{/);
});

test('v8 PR-A1: CSS 含 .prompt-card-choice + selected + disabled 状态', () => {
  assert.match(cssSource, /\.prompt-card-choice\s*\{/);
  assert.match(cssSource, /\.prompt-card-choice\.selected\s*\{/);
  assert.match(cssSource, /\.prompt-card-choice:disabled\s*\{/);
  assert.match(cssSource, /\.prompt-card-choice:hover/);
});

test('v8 PR-A1: dom-adapter 暴露 promptCardChoice helper', () => {
  assert.match(adapterSource, /function promptCardChoice\(card, opts\)/);
});

test('v8 PR-A1: promptCardChoice 支持 dataAttrs / title / selected / extraClass', () => {
  // 简单 grep helper 内部实现关键字
  const fnMatch = adapterSource.match(/function promptCardChoice\([^)]+\)\s*\{[\s\S]*?^      \}/m);
  assert.ok(fnMatch, 'promptCardChoice 函数体应可定位');
  const body = fnMatch[0];
  assert.match(body, /dataAttrs/);
  assert.match(body, /opts\.title/);
  assert.match(body, /opts\.selected/);
  assert.match(body, /opts\.extraClass/);
});

test('v8 PR-A1: guicai 面板已迁移用 promptCardChoice (保留 guicai-candidate 兼容类)', () => {
  assert.match(adapterSource, /els\.guicaiCandidates\.innerHTML\s*=\s*pending\.candidates\.map\([\s\S]{0,200}promptCardChoice/);
  // 旧 data-guicai-card-id 属性仍生成
  assert.match(adapterSource, /guicaiCardId:\s*card\.id/);
});

test('v8 PR-A1: fankui 面板装备/判定区项目用 promptCardChoice', () => {
  assert.match(adapterSource, /promptCardChoice\([\s\S]{0,200}fankuiZone:\s*entry\.zone/);
});

test('v8 PR-A1: index.html 既有面板容器都追加 pending-prompt-panel 类', () => {
  // 现有 6 个 *PromptPanel 容器都应当带新类
  const panels = ['guicaiPromptPanel', 'yijiPromptPanel', 'fanjianPromptPanel', 'fankuiPromptPanel', 'gangliePromptPanel', 'ganglieSourcePanel'];
  panels.forEach(function (id) {
    const re = new RegExp('class="[^"]*pending-prompt-panel[^"]*"\\s+id="' + id + '"');
    assert.match(htmlSource, re, id + ' 应带 pending-prompt-panel 类');
  });
});

test('v8 PR-A1: 既有 *PromptHint 元素都追加 pending-prompt-panel__hint 类', () => {
  const hints = ['guicaiPromptHint', 'yijiPromptHint', 'fanjianPromptHint', 'fankuiPromptHint', 'gangliePromptHint', 'ganglieSourceHint'];
  hints.forEach(function (id) {
    const re = new RegExp('class="[^"]*pending-prompt-panel__hint[^"]*"\\s+id="' + id + '"');
    assert.match(htmlSource, re, id + ' 应带 pending-prompt-panel__hint 类');
  });
});

test('v8 PR-A1: 既有 choices 容器追加 pending-prompt-panel__choices', () => {
  // guicaiCandidates / yijiCandidates / fankuiZones / ganglieSourceCandidates 都是 choices 容器
  const choices = ['guicaiCandidates', 'yijiCandidates', 'fankuiZones', 'ganglieSourceCandidates'];
  choices.forEach(function (id) {
    const re = new RegExp('class="[^"]*pending-prompt-panel__choices[^"]*"\\s+id="' + id + '"');
    assert.match(htmlSource, re, id + ' 应带 pending-prompt-panel__choices 类');
  });
});

// v8 hotfix: PR-A1 introduced `.pending-prompt-panel { display: flex; }`
// which overrides the `hidden` HTML attribute. Without an explicit
// `[hidden] { display: none !important; }` override, ALL pending-choice
// panels (guicai / yiji / fankui / qilin / cixiong-* / jiedao /
// wugu / guohe-1v1 / dying-rescue) are visible at once and cover the
// hand area. Regression guard.
test('v8 hotfix: .pending-prompt-panel[hidden] 必须有 display:none !important override', () => {
  // 必须在 hidden-override block 中包含 .pending-prompt-panel[hidden]
  // 否则所有 pendingChoice 面板会永远可见 (盖住手牌区)
  assert.match(cssSource, /\.pending-prompt-panel\[hidden\][\s\S]{0,200}display:\s*none\s*!important/);
});

console.log('\nPending prompt framework (v8 PR-A1) tests passed.');
