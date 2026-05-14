// v9 PR-E8 守护测试: 二级 splash 屏 + 一级 lobby 屏 (新入口流程).
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

// ───── HTML 结构 ─────────────────────────────────────────────────────

test('v9 PR-E8: index.html 含 <section class="splash-screen" id="splashScreen"> (默认显示)', () => {
  assert.match(html, /<section class="splash-screen" id="splashScreen">/);
  // splash 默认无 hidden (作为入口首屏)
  assert.doesNotMatch(html, /<section class="splash-screen" id="splashScreen"[^>]*hidden/);
});

test('v9 PR-E8: index.html 含 <section class="lobby-screen" id="lobbyScreen" hidden> (启动后由 splash click 唤起)', () => {
  assert.match(html, /<section class="lobby-screen" id="lobbyScreen" hidden>/);
});

test('v9 PR-E8: setup-screen 改 hidden (新流程 splash → lobby → setup)', () => {
  // PR-E8 之后 setup-screen 默认 hidden, 等 lobby 1V1 唤起
  assert.match(html, /<section class="setup-screen" id="setupScreen" hidden>/);
});

test('v9 PR-E8: splash 含 __bg / __messages / __enter 三块', () => {
  assert.match(html, /class="splash-screen__bg"/);
  assert.match(html, /class="splash-screen__messages"/);
  assert.match(html, /id="splashEnterBtn"/);
  assert.match(html, /class="splash-screen__enter"/);
});

test('v9 PR-E8: lobby 含 topbar (avatar + name + currency) + 3 模式卡 + 5 nav', () => {
  assert.match(html, /class="lobby-screen__topbar"/);
  assert.match(html, /class="lobby-screen__avatar"/);
  assert.match(html, /class="lobby-screen__currency"/);
  // 3 模式卡 ids
  assert.match(html, /id="lobbyKofBtn"/);
  assert.match(html, /id="lobby1v1Btn"/);
  assert.match(html, /id="lobbyHellBtn"/);
  // 5 nav items
  const navCount = (html.match(/class="lobby-nav-item"/g) || []).length;
  assert.equal(navCount, 5, 'lobby 底部 nav 应有 5 项');
});

test('v9 PR-E8: lobby 模式卡 — KOF/炼狱 用 --placeholder + disabled, 1V1 用 --active', () => {
  // 抓出每个 button 的完整标签 (class 和 id 出现顺序无关)
  const kof = html.match(/<button[^>]*id="lobbyKofBtn"[^>]*>/);
  const hell = html.match(/<button[^>]*id="lobbyHellBtn"[^>]*>/);
  const v1 = html.match(/<button[^>]*id="lobby1v1Btn"[^>]*>/);
  assert.ok(kof && hell && v1, '3 模式按钮都存在');
  assert.match(kof[0], /disabled/);
  assert.match(hell[0], /disabled/);
  assert.match(kof[0], /lobby-mode-card--placeholder/);
  assert.match(hell[0], /lobby-mode-card--placeholder/);
  assert.match(v1[0], /lobby-mode-card--active/);
  assert.doesNotMatch(v1[0], /disabled/);
});

// ───── CSS 入口屏样式 ───────────────────────────────────────────────

test('v9 PR-E8: entry.css 含 .splash-screen + __bg / __messages / __enter', () => {
  assert.match(entryCss, /\.splash-screen\s*\{/);
  assert.match(entryCss, /\.splash-screen__bg\s*\{/);
  assert.match(entryCss, /\.splash-screen__messages\s*\{/);
  assert.match(entryCss, /\.splash-screen__enter\s*\{/);
});

test('v9 PR-E8: splash __bg 用 polygon clip 模拟山景剪影 (::before + ::after)', () => {
  assert.match(entryCss, /\.splash-screen__bg::before/);
  assert.match(entryCss, /\.splash-screen__bg::after/);
  // 至少一个 clip-path: polygon
  assert.match(entryCss, /\.splash-screen__bg::before\s*\{[\s\S]*?clip-path:\s*polygon/);
});

test('v9 PR-E8: splash __enter 黑色 brush 横幅风 (与中央日志暂停横幅同源 box-shadow 偏移)', () => {
  const block = entryCss.match(/\.splash-screen__enter\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /background:\s*rgba\(0,\s*0,\s*0/);
  assert.match(block[0], /color:\s*#ffd900/);
  // 多 box-shadow 偏移
  assert.match(block[0], /box-shadow:[\s\S]*?,[\s\S]*?,/);
});

test('v9 PR-E8: entry.css 含 .lobby-screen + __topbar / __user / __avatar / __currency / __modes / __nav', () => {
  ['__topbar', '__user', '__avatar', '__user-name', '__user-vip', '__currency', '__modes', '__nav'].forEach(function (suffix) {
    const re = new RegExp('\\.lobby-screen' + suffix + '\\s*\\{');
    assert.match(entryCss, re, '应含 .lobby-screen' + suffix);
  });
});

test('v9 PR-E8: .lobby-mode-card + 2 变体 (--active / --placeholder) + 3 子元素', () => {
  assert.match(entryCss, /\.lobby-mode-card\s*\{/);
  assert.match(entryCss, /\.lobby-mode-card--active\s*\{/);
  assert.match(entryCss, /\.lobby-mode-card--placeholder\s*\{/);
  assert.match(entryCss, /\.lobby-mode-card__icon\s*\{/);
  assert.match(entryCss, /\.lobby-mode-card__title\s*\{/);
  assert.match(entryCss, /\.lobby-mode-card__sub\s*\{/);
});

test('v9 PR-E8: .lobby-mode-card 用金色 cream gradient + 棕金 border + 大字 title', () => {
  const block = entryCss.match(/^\s*\.lobby-mode-card\s*\{[\s\S]*?\n\s{4}\}/m);
  assert.ok(block);
  assert.match(block[0], /linear-gradient[\s\S]*?#fff5d4[\s\S]*?#c97f25/);
  assert.match(block[0], /border:\s*3px\s+solid/);
});

test('v9 PR-E8: .lobby-screen__modes 用 grid 3 列', () => {
  const block = entryCss.match(/\.lobby-screen__modes\s*\{[\s\S]*?\n\s{4}\}/);
  assert.ok(block);
  assert.match(block[0], /display:\s*grid/);
  assert.match(block[0], /grid-template-columns:\s*repeat\(3/);
});

test('v9 PR-E8: .splash-screen / .lobby-screen [hidden] display:none !important', () => {
  assert.match(entryCss, /\.splash-screen\[hidden\]\s*\{[\s\S]*?display:\s*none\s*!important/);
  assert.match(entryCss, /\.lobby-screen\[hidden\]\s*\{[\s\S]*?display:\s*none\s*!important/);
});

// ───── main.css @import 含 entry.css ────────────────────────────────

test('v9 PR-E8: main.css @import entry.css (放最后)', () => {
  const main = fs.readFileSync(path.join(stylesDir, 'main.css'), 'utf8');
  assert.match(main, /@import\s+['"]\.\/entry\.css['"]/);
});

// ───── dom-adapter 接入 ──────────────────────────────────────────────

test('v9 PR-E8: dom-adapter 缓存 splash + lobby 6 个 ids', () => {
  ['splashScreen', 'splashEnterBtn', 'lobbyScreen', 'lobbyKofBtn', 'lobby1v1Btn', 'lobbyHellBtn'].forEach(function (id) {
    const re = new RegExp("'" + id + "'");
    assert.match(adapter, re, '应缓存 ' + id);
  });
});

test('v9 PR-E8: dom-adapter 暴露 showSplash + showLobby (新增) + showSetup (旧, 已兼容)', () => {
  assert.match(adapter, /function showSplash\(\)/);
  assert.match(adapter, /function showLobby\(\)/);
  assert.match(adapter, /function showSetup\(\)/);
});

test('v9 PR-E8: showSetup 同时隐藏 splash + lobby (新流程兼容)', () => {
  const fn = adapter.match(/function showSetup\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /els\.splashScreen[\s\S]{0,80}hidden\s*=\s*true/);
  assert.match(fn[0], /els\.lobbyScreen[\s\S]{0,80}hidden\s*=\s*true/);
});

test('v9 PR-E8: 启动入口从 showSetup → showSplash (新入口流程)', () => {
  // 末尾的初始化调用应是 showSplash (允许中间夹注释)
  const init = adapter.match(/initElements\(\);[\s\S]{0,200}bindEvents\(\);[\s\S]{0,200}showSplash\(\);/);
  assert.ok(init, '入口应改为 showSplash');
  // 不应再有 bindEvents() 后直接 showSetup() 作为初始化
  assert.doesNotMatch(adapter, /bindEvents\(\);\s*showSetup\(\);/);
});

test('v9 PR-E8: splashEnterBtn / splashScreen click → showLobby', () => {
  assert.match(adapter, /els\.splashEnterBtn\.addEventListener\('click',\s*showLobby\)/);
  // splashScreen 整屏 click 也走 showLobby
  assert.match(adapter, /els\.splashScreen\.addEventListener\('click'/);
});

test('v9 PR-E8: lobby1v1Btn click → showSetup; KOF/炼狱 placeholder alert', () => {
  assert.match(adapter, /els\.lobby1v1Btn\.addEventListener\('click',\s*showSetup\)/);
  // KOF + 炼狱 click 显示 alert
  assert.match(adapter, /els\.lobbyKofBtn[\s\S]{0,200}KOF[\s\S]{0,80}待开发/);
  assert.match(adapter, /els\.lobbyHellBtn[\s\S]{0,200}炼狱[\s\S]{0,80}待开发/);
});

// ───── 全套回归 ──────────────────────────────────────────────────────

test('v9 PR-E8: loadAllStyles() 拼接结果含 entry.css 内容 (回归)', () => {
  assert.match(css, /\.splash-screen\s*\{/);
  assert.match(css, /\.lobby-screen\s*\{/);
  assert.match(css, /\.lobby-mode-card\s*\{/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
