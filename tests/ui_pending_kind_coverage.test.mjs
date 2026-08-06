// v15 W1: pendingChoice kind → UI 渲染路径的**覆盖度不变量**。
//
// 缘起 (第五轮审计 F1): 引擎的 `aoe-sha-response` 窗口 (南蛮入侵/借刀需要
// 玩家打出【杀】时开) 在 UI 里**一个面板都没有** —— 引擎给了 options (含真
// 【杀】), UI 一个都不渲染; 蛊惑面板的取消钮只清自己的暂存、不收窗口。
// 结果是玩家 (于吉) 被南蛮指定后既打不出真杀也放弃不了, 整局卡死在
// pendingChoiceGuard 上。这类缺陷此前没有任何东西能发现: 新增一个 kind 时
// 忘了配面板, 测试与类型系统都不会吭声。
//
// 本文件把"每个会向玩家开的 kind 都必须有渲染路径"做成硬账:
//   ① 引擎侧: 扫 registerResponseKind 拿到全部已注册 kind;
//   ② UI 侧: 扫四个面板模块的三种渲染路径 (注册表条目 / kind === 直判 /
//      kind 数组成员);
//   ③ 差集必须为空, 或落在下方**显式豁免表**里 (豁免要写理由)。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test, runTests } from './helpers/harness.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const ENGINE_FILES = [
  'src/engine/game-engine.js', 'src/engine/sha-flow.js', 'src/engine/tricks.js',
  'src/engine/response.js', 'src/engine/equipment.js', 'src/engine/judge-area.js',
  'src/engine/damage-dying.js', 'src/engine/skills.js', 'src/engine/guhuo.js',
  'src/engine/pindian.js',
];
const UI_FILES = [
  'src/ui/dom-adapter.js',
  'src/ui/panels/prompt-panels.js', 'src/ui/panels/response-panels.js',
  'src/ui/panels/mode-panels.js', 'src/ui/panels/lord-aid-panels.js',
  'src/ui/panels/board-panels.js',
];

// 不需要专属面板的 kind, 每条写明为什么。
const EXEMPT = {
  // 蛊惑质疑/声明两窗共用蛊惑面板簇, 由 guhuoResponseAvailable 谓词开合,
  // 不按 kind 判 (同一个 kind 也可能不该开 —— 于吉没蛊惑额度时)。
  'wuxie-response': '无懈响应面板按 kind === 判定, 见 response-panels.js',
};

function collectEngineKinds() {
  const kinds = new Set();
  for (const f of ENGINE_FILES) {
    const src = read(f);
    for (const m of src.matchAll(/registerResponseKind\('([a-z0-9-]+)'/g)) kinds.add(m[1]);
  }
  return kinds;
}

function collectUiKinds() {
  const kinds = new Set();
  for (const f of UI_FILES) {
    const src = read(f);
    // ① 提示面板注册表条目: { panelId: 'xPanel', kind: 'k', ... }
    for (const m of src.matchAll(/kind: '([a-z0-9-]+)'/g)) kinds.add(m[1]);
    // ② 直判: kind === 'k'
    for (const m of src.matchAll(/kind === '([a-z0-9-]+)'/g)) kinds.add(m[1]);
    // ③ kind 数组成员: var XXX_KINDS = ['a', 'b', ...]
    for (const m of src.matchAll(/_KINDS = \[([^\]]*)\]/g)) {
      for (const q of m[1].matchAll(/'([a-z0-9-]+)'/g)) kinds.add(q[1]);
    }
    // ④ kind → 配置映射表 (lord-aid-panels 的 LORD_AID_*): 'k': { ... }
    for (const m of src.matchAll(/'([a-z0-9-]+)': \{ skillName:/g)) kinds.add(m[1]);
  }
  return kinds;
}

test('W1 不变量: 每个已注册的 pendingChoice kind 都有 UI 渲染路径', () => {
  const engineKinds = collectEngineKinds();
  const uiKinds = collectUiKinds();
  assert.ok(engineKinds.size >= 45, `引擎侧 kind 数异常偏少 (${engineKinds.size}) — 扫描口径可能失效`);

  const uncovered = [...engineKinds].filter((k) => !uiKinds.has(k) && !EXEMPT[k]).sort();
  assert.deepEqual(uncovered, [],
    '这些 kind 会向玩家开窗但没有任何面板渲染它们 (玩家将无从操作也无法关闭 → 卡死); '
    + '请补面板, 或在 EXEMPT 里写明豁免理由: ' + uncovered.join(', '));
});

test('W1 不变量: 豁免表里的 kind 确实还存在于引擎 (防止豁免条目烂掉)', () => {
  const engineKinds = collectEngineKinds();
  for (const k of Object.keys(EXEMPT)) {
    assert.ok(engineKinds.has(k), `豁免表里的 ${k} 已不再是引擎注册的 kind, 请删除该豁免条目`);
  }
});

test('W1 回归钉: aoe-sha-response 走决斗响应面板 (第五轮审计 F1)', () => {
  const src = read('src/ui/panels/response-panels.js');
  assert.match(src, /SHA_RESPONSE_KINDS = \['sha-duel-response', 'aoe-sha-response'\]/,
    '南蛮/借刀的打出杀窗口与决斗响应共用面板 — 两者 resolver 决策形状相同');
});

test('W1: 提示面板注册表是唯一的显示/隐藏出口 (没有漏写 else 的可能)', () => {
  const src = read('src/ui/panels/prompt-panels.js');
  assert.match(src, /var PROMPT_PANEL_SPECS = \[/, '注册表存在');
  assert.match(src, /panel\.hidden = !hit;/, '驱动器统一决定显隐');
  // 表驱动后, 提示面板模块里不应再有逐条手写的 `els.xxxPanel.hidden = true;`
  // (那正是"漏写一处就永久挂着"的病根)。
  const strayHides = src.split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .filter((line) => /els\.[A-Za-z0-9_]+Panel\.hidden = true;/.test(line));
  assert.deepEqual(strayHides, [],
    '提示面板模块里仍有逐条手写的隐藏语句 — 应由驱动器统一处理');
});

// ───── 行为回归: 第五轮审计 F1 的两条出路都要真的能走 ─────
// (源码正则只能证明"接线在", 走不走得通得真跑一遍。)
test('W1 行为: 于吉被南蛮指定 → 决斗响应面板列出真【杀】, 打出即化解', async () => {
  const { installFakeDom } = await import('./helpers/fake-dom.mjs');
  const { c } = await import('./helpers/load-engine.mjs');
  const dom = installFakeDom();
  const { Engine } = await import('./helpers/load-engine.mjs');
  await import('../src/ui/dom-adapter.js');
  const UI = globalThis.window.SanguoshaUI;
  const $ = dom.$;

  function nanmanAtYuji() {
    $('lobby1v1Btn').click();
    $('playerHeroSelect').value = 'yuji';
    $('enemyHeroSelect').value = 'caocao';
    $('startGameBtn').click();
    $('exitConfirmModal').hidden = true;
    const game = UI.getGame();
    game.log = []; game.discard = [];
    game.deck = Array.from({ length: 10 }, (_, i) => c('sha', { id: 'nk' + i }));
    for (const seat of ['player', 'enemy']) {
      game[seat].hand = []; game[seat].judgeArea = []; game[seat].flags = {};
      game[seat].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
      game[seat].hp = game[seat].maxHp; game[seat].skillPreferences = {};
    }
    game.player.hand = [c('sha', { id: 'nm-real-sha' })];
    game.enemy.hand = [c('nanman', { id: 'nm-card' })];
    game.turn = 'enemy'; game.phase = 'play';
    game.pendingChoice = null; game.pendingChoiceQueue = []; game.pauseState = {};
    Engine.playCard(game, 'enemy', 'nm-card', {});
    UI.render();
    return game;
  }

  const game = nanmanAtYuji();
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'aoe-sha-response');
  assert.equal($('duelResponsePanel').hidden, false, '打出【杀】的窗口必须有面板');
  assert.match(String($('duelResponseChoices').innerHTML), /data-duel-card-id="nm-real-sha"/,
    '真【杀】要出现在候选里 (此前引擎给了 options 而 UI 一张都不渲染)');
  const hp = game.player.hp;
  $('duelResponseChoices').dispatchClick({ 'data-duel-card-id': 'nm-real-sha' });
  if ($('handConfirmBtn')) $('handConfirmBtn').click();
  assert.equal(game.pendingChoice, null, '窗口已收');
  assert.equal(game.player.hp, hp, '打出【杀】化解南蛮, 不掉血');
  assert.equal(game.player.hand.length, 0, '【杀】已打出');

  const game2 = nanmanAtYuji();
  const hp2 = game2.player.hp;
  $('duelResponseDeclineBtn').click();
  assert.equal(game2.pendingChoice, null, '"不出"同样能收窗口 (此前无路可退, 整局卡死)');
  assert.equal(game2.player.hp, hp2 - 1, '不出【杀】受 1 点伤害');
});

runTests(import.meta.url);
