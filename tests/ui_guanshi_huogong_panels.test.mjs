import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Engine } from './helpers/load-engine.mjs';

// 审计二轮 PR-8: 贯石斧 (guanshi-discard) 与 火攻展示 (huogong-show) 的 UI
// 面板接线。引擎侧 ask 档在 #120 已落地, 本 PR 补 dom-adapter 面板并在 UI
// newGame 显式开启玩家 ask (引擎默认仍为 auto, AI/测试行为不变)。

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// v11 B2: 提示类/响应类面板已迁往 src/ui/panels/, 源为主文件 + 面板模块拼接。
const adapter = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(root, 'src/ui/panels/response-panels.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(root, 'src/ui/panels/prompt-panels.js'), 'utf8');

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ───── 面板标记存在 (index.html) ─────────────────────────────────────

test('index.html 含 guanshiDiscardPanel 完整结构 (hint/choices/confirm/decline)', () => {
  for (const id of ['guanshiDiscardPanel', 'guanshiDiscardHint', 'guanshiDiscardChoices', 'guanshiConfirmBtn', 'guanshiDeclineBtn']) {
    assert.match(html, new RegExp('id="' + id + '"'), id + ' 缺失');
  }
  assert.match(html, /guanshi-discard-panel pending-prompt-panel/, '复用 pending-prompt-panel 框架');
});

test('index.html 含 huogongShowPanel 完整结构 (hint/choices, 必选无 decline)', () => {
  for (const id of ['huogongShowPanel', 'huogongShowHint', 'huogongShowChoices']) {
    assert.match(html, new RegExp('id="' + id + '"'), id + ' 缺失');
  }
  assert.match(html, /huogong-show-panel pending-prompt-panel/);
});

// ───── dom-adapter 接线 ──────────────────────────────────────────────

test('dom-adapter: initElements 注册全部新面板元素', () => {
  for (const id of ['guanshiDiscardPanel', 'guanshiDiscardChoices', 'guanshiConfirmBtn', 'guanshiDeclineBtn', 'huogongShowPanel', 'huogongShowChoices']) {
    assert.match(adapter, new RegExp("'" + id + "'"), id + ' 未注册');
  }
});

test('dom-adapter: renderPendingChoice 处理两个新 kind 且仅对 player 弹出', () => {
  assert.match(adapter, /kind === 'guanshi-discard' && pending\.actor === 'player'/);
  assert.match(adapter, /kind === 'huogong-show' && pending\.actor === 'player'/);
});

test('dom-adapter: 贯石斧多选恰好 2 张 — 选满禁入 + confirm 按钮 2 张门控', () => {
  assert.match(adapter, /guanshiDiscardSelection\.length < 2\) guanshiDiscardSelection\.push/);
  assert.match(adapter, /guanshiConfirmBtn\.disabled = guanshiDiscardSelection\.length !== 2/);
  // v11 B2: 面板模块内经 getGame() 取当前对局。
  assert.match(adapter, /resolvePendingChoice\(getGame\(\), \{ cardIds: guanshiDiscardSelection\.slice\(\) \}\)/);
  assert.match(adapter, /guanshiDeclineBtn.*addEventListener[\s\S]*?\{ decline: true \}/);
});

test('dom-adapter: 火攻展示走 stage + hand-confirm 提交 (payload cardId)', () => {
  assert.match(adapter, /data-huogong-show-card-id/);
  assert.match(adapter, /stage\(\{\s*cardId:\s*cardId\s*\},\s*'\[data-huogong-show-card-id="/);
});

test('dom-adapter: PENDING_MODAL_DISPATCH 登记两个新面板', () => {
  assert.match(adapter, /\{ panelId: 'guanshiDiscardPanel',\s*confirmBtnId: 'guanshiConfirmBtn',\s*cancelBtnId: 'guanshiDeclineBtn' \}/);
  assert.match(adapter, /\{ panelId: 'huogongShowPanel',\s*confirmBtnId: null,\s*cancelBtnId: null \}/);
});

test('dom-adapter: UI newGame 显式开启 guanshi/huogongShow = ask', () => {
  assert.match(adapter, /skillPreferences\.guanshi = 'ask'/);
  assert.match(adapter, /skillPreferences\.huogongShow = 'ask'/);
});

// ───── 引擎契约: pending 字段与 UI 渲染/提交格式对齐 ─────────────────

test('引擎契约: guanshi-discard pending 暴露 handIds + equipment[{slot,cardId,name}]', () => {
  const game = Engine.newGame({ seed: 97, startWithFirstTurn: true, playerHero: 'liubei', enemyHero: 'sunquan' });
  game.phase = 'play';
  game.turn = 'player';
  game.player.equipment.weapon = c('guanshi', { id: 'gs-w' });
  game.player.equipment.horsePlus = c('plus_horse', { id: 'gs-h' });
  game.player.skillPreferences.guanshi = 'ask';
  game.player.hand = [c('sha', { id: 'gs-sha' }), c('tao', { id: 'gs-tao' })];
  game.enemy.hand = [c('shan', { id: 'foe-shan' })];

  Engine.playCard(game, 'player', 'gs-sha');
  const pending = Engine.getPendingChoice(game);
  assert.equal(pending.kind, 'guanshi-discard');
  assert.deepEqual(pending.handIds, ['gs-tao'], 'UI 按 handIds 渲染手牌候选');
  assert.equal(pending.equipment.length, 2, '装备候选含武器与坐骑');
  for (const entry of pending.equipment) {
    assert.ok(entry.cardId && entry.name, 'equipment entry 含 cardId/name (UI 渲染依赖)');
  }
  // UI confirm 提交格式 {cardIds: [两张]}
  const resolved = Engine.resolvePendingChoice(game, { cardIds: ['gs-tao', 'gs-h'] });
  assert.equal(resolved.ok, true);
});

test('引擎契约: huogong-show pending 暴露 cardIds, UI 提交 {cardId}', () => {
  const game = Engine.newGame({ seed: 97, startWithFirstTurn: true, playerHero: 'liubei', enemyHero: 'sunquan' });
  game.phase = 'play';
  game.turn = 'enemy';
  game.player.skillPreferences.huogongShow = 'ask';
  game.player.hand = [
    c('tao', { id: 'sh-1', suit: 'heart', color: 'red' }),
    c('sha', { id: 'sh-2', suit: 'club', color: 'black' })
  ];
  game.enemy.hand = [c('huogong', { id: 'hg-x', suit: 'diamond', color: 'red' }), c('shan', { id: 'e-heart', suit: 'heart', color: 'red' })];

  Engine.playCard(game, 'enemy', 'hg-x');
  const pending = Engine.getPendingChoice(game);
  assert.equal(pending.kind, 'huogong-show');
  assert.deepEqual([...pending.cardIds].sort(), ['sh-1', 'sh-2'], 'UI 按 cardIds 渲染全部手牌');
  const resolved = Engine.resolvePendingChoice(game, { cardId: 'sh-2' });
  assert.equal(resolved.ok, true);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
