// v9 PR-E8 守护测试: 一级 lobby 屏 (入口流程).
// v9 PR-E18: 二级 splash 屏已删除 — 相关守护已撤, 仅保留 lobby 守护.
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

test('v9 PR-E8/E18: index.html 含 <section class="lobby-screen" id="lobbyScreen"> (启动首屏)', () => {
  assert.match(html, /<section class="lobby-screen" id="lobbyScreen"[^>]*>/);
});

test('v9 PR-E18: index.html 不再含 splash-screen (二级 splash 已删)', () => {
  assert.doesNotMatch(html, /class="splash-screen"/);
  assert.doesNotMatch(html, /id="splashScreen"/);
  assert.doesNotMatch(html, /id="splashEnterBtn"/);
});

test('v9 PR-E8: setup-screen 默认 hidden (新流程 lobby → setup)', () => {
  assert.match(html, /<section class="setup-screen" id="setupScreen" hidden>/);
});

test('v9 PR-E8: lobby 含 topbar (avatar + name + currency) + 3 模式卡 + 5 nav', () => {
  assert.match(html, /class="lobby-screen__topbar"/);
  assert.match(html, /class="lobby-screen__avatar"/);
  assert.match(html, /class="lobby-screen__currency"/);
  assert.match(html, /id="lobbyKofBtn"/);
  assert.match(html, /id="lobby1v1Btn"/);
  assert.match(html, /id="lobbyHellBtn"/);
  const navCount = (html.match(/class="lobby-nav-item"/g) || []).length;
  assert.equal(navCount, 5, 'lobby 底部 nav 应有 5 项');
});

test('v9 PR-E8: lobby 模式卡 — KOF/炼狱 用 --placeholder + disabled, 1V1 用 --active', () => {
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

test('v9 PR-E18: entry.css 不再含 .splash-screen 系列规则', () => {
  assert.doesNotMatch(entryCss, /\.splash-screen\s*\{/);
  assert.doesNotMatch(entryCss, /\.splash-screen__bg/);
  assert.doesNotMatch(entryCss, /\.splash-screen__enter/);
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

test('v9 PR-E8: .lobby-screen [hidden] display:none !important', () => {
  assert.match(entryCss, /\.lobby-screen\[hidden\]\s*\{[\s\S]*?display:\s*none\s*!important/);
});

// ───── main.css @import 含 entry.css ────────────────────────────────

test('v9 PR-E8: main.css @import entry.css (放最后)', () => {
  const main = fs.readFileSync(path.join(stylesDir, 'main.css'), 'utf8');
  assert.match(main, /@import\s+['"]\.\/entry\.css['"]/);
});

// ───── dom-adapter 接入 ──────────────────────────────────────────────

test('v9 PR-E8/E18: dom-adapter 缓存 lobby 4 个 ids (splash 2 个已删)', () => {
  ['lobbyScreen', 'lobbyKofBtn', 'lobby1v1Btn', 'lobbyHellBtn'].forEach(function (id) {
    const re = new RegExp("'" + id + "'");
    assert.match(adapter, re, '应缓存 ' + id);
  });
});

test('v9 PR-E18: dom-adapter 不再缓存 splashScreen / splashEnterBtn, 不再含 showSplash', () => {
  assert.doesNotMatch(adapter, /'splashScreen'/);
  assert.doesNotMatch(adapter, /'splashEnterBtn'/);
  assert.doesNotMatch(adapter, /function showSplash\(\)/);
});

test('v9 PR-E8: dom-adapter 暴露 showLobby + showSetup', () => {
  assert.match(adapter, /function showLobby\(\)/);
  assert.match(adapter, /function showSetup\(\)/);
});

test('v9 PR-E8: showSetup 隐藏 lobby', () => {
  const fn = adapter.match(/function showSetup\(\)\s*\{[\s\S]*?\n\s{6}\}/);
  assert.ok(fn);
  assert.match(fn[0], /els\.lobbyScreen[\s\S]{0,80}hidden\s*=\s*true/);
});

test('v9 PR-E18: 启动入口为 showLobby (splash 已删)', () => {
  const init = adapter.match(/initElements\(\);[\s\S]{0,200}bindEvents\(\);[\s\S]{0,200}showLobby\(\);/);
  assert.ok(init, '入口应为 showLobby');
  assert.doesNotMatch(adapter, /bindEvents\(\);\s*showSplash\(\);/);
});

test('v9 PR-E8 (v13 UI修缮4 分入口): lobby1v1Btn 预选 duel 入 setup; 身份场独立入口; KOF/炼狱 placeholder', () => {
  // v13 UI修缮4: 一级入口分流 — lobby1v1Btn 先 setMatchMode('duel') 再
  // showSetup; 新增 lobbyIdentityBtn (缺省 identity5)。旧"直绑 showSetup"
  // 正则随行为更新。
  assert.match(adapter, /els\.lobby1v1Btn\.addEventListener\('click',\s*function\s*\(\)\s*\{\s*setMatchMode\('duel'\);\s*showSetup\(\);/);
  assert.match(adapter, /els\.lobbyIdentityBtn\.addEventListener\('click',\s*function\s*\(\)\s*\{\s*if\s*\(matchMode === 'duel'\)\s*setMatchMode\('identity5'\);\s*showSetup\(\);/);
  assert.match(adapter, /els\.lobbyKofBtn[\s\S]{0,200}KOF[\s\S]{0,80}待开发/);
  assert.match(adapter, /els\.lobbyHellBtn[\s\S]{0,200}炼狱[\s\S]{0,80}待开发/);
});

// ───── 全套回归 ──────────────────────────────────────────────────────

test('v9 PR-E8/E18: loadAllStyles() 拼接结果含 lobby 规则, 不含 splash 规则', () => {
  assert.match(css, /\.lobby-screen\s*\{/);
  assert.match(css, /\.lobby-mode-card\s*\{/);
  assert.doesNotMatch(css, /\.splash-screen\s*\{/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
