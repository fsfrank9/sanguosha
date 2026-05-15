// v9 PR-E18 守护测试: 删除二级 splash 屏.
// 用户反馈: "最开始显示的这一级 (splash) 是不是完全没必要存在的".
// 用户选择 "只删 splash" — 启动直接进 lobby (lobby → setup → game 三级).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllStyles } from './helpers/load-styles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylesDir = path.join(root, 'src', 'styles');
const css = loadAllStyles();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8');
const entryCss = fs.readFileSync(path.join(stylesDir, 'entry.css'), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── splash HTML 真删 ──────────────────────────────────────────────

test('v9 PR-E18: index.html 不再含 splash-screen DOM (section / __bg / __messages / __enter)', () => {
  assert.doesNotMatch(html, /class="splash-screen"/);
  assert.doesNotMatch(html, /id="splashScreen"/);
  assert.doesNotMatch(html, /id="splashEnterBtn"/);
  assert.doesNotMatch(html, /splash-screen__/);
});

// ───── splash CSS 真删 ───────────────────────────────────────────────

test('v9 PR-E18: entry.css 不再含 .splash-screen 系列规则', () => {
  assert.doesNotMatch(entryCss, /\.splash-screen\s*\{/);
  assert.doesNotMatch(entryCss, /\.splash-screen__bg/);
  assert.doesNotMatch(entryCss, /\.splash-screen__messages/);
  assert.doesNotMatch(entryCss, /\.splash-screen__enter/);
});

test('v9 PR-E18: entry.css 仍保留 .lobby-screen 系列 (lobby 未删)', () => {
  assert.match(entryCss, /\.lobby-screen\s*\{/);
  assert.match(entryCss, /\.lobby-mode-card\s*\{/);
});

// ───── splash JS 真删 ────────────────────────────────────────────────

test('v9 PR-E18: dom-adapter 不再缓存 splashScreen / splashEnterBtn', () => {
  assert.doesNotMatch(adapter, /'splashScreen'/);
  assert.doesNotMatch(adapter, /'splashEnterBtn'/);
});

test('v9 PR-E18: dom-adapter 不再含 showSplash 函数', () => {
  assert.doesNotMatch(adapter, /function showSplash\(\)/);
});

test('v9 PR-E18: dom-adapter 不再含 splashEnterBtn / splashScreen click 监听', () => {
  assert.doesNotMatch(adapter, /splashEnterBtn\.addEventListener/);
  assert.doesNotMatch(adapter, /splashScreen\.addEventListener/);
});

test('v9 PR-E18: 启动入口改为 showLobby() (从 showSplash 改)', () => {
  const init = adapter.match(/initElements\(\);[\s\S]{0,260}bindEvents\(\);[\s\S]{0,200}showLobby\(\);/);
  assert.ok(init, '启动应调 showLobby()');
  assert.doesNotMatch(adapter, /showSplash\(\);/);
});

test('v9 PR-E18: showLobby 仍正常 (lobby hidden=false, setup/duelTable hidden=true)', () => {
  const fn = adapter.match(/function showLobby\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /lobbyScreen[\s\S]*?hidden\s*=\s*false/);
  assert.match(fn[0], /setupScreen[\s\S]*?hidden\s*=\s*true/);
  assert.match(fn[0], /duelTable[\s\S]*?hidden\s*=\s*true/);
});

test('v9 PR-E18: showSetup 不再引用 els.splashScreen (只隐藏 lobby)', () => {
  const fn = adapter.match(/function showSetup\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.doesNotMatch(fn[0], /splashScreen/);
  assert.match(fn[0], /lobbyScreen[\s\S]{0,80}hidden\s*=\s*true/);
});

// ───── 回归 ────────────────────────────────────────────────────────────

test('v9 PR-E18: loadAllStyles() 拼接不含 .splash-screen, 仍含 .lobby-screen', () => {
  assert.doesNotMatch(css, /\.splash-screen\s*\{/);
  assert.match(css, /\.lobby-screen\s*\{/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
