import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Engine } from './helpers/load-engine.mjs';

const root = path.resolve(import.meta.dirname, '..');
const heroesSrc = fs.readFileSync(path.join(root, 'src/data/heroes.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const adapterSrc = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8');
const skillStatusSrc = fs.readFileSync(path.join(root, 'src/data/skill-status.js'), 'utf8');

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function buildGame(playerHero, enemyHero, seed) {
  const game = Engine.newGame({ seed: seed || 8801, playerHero, enemyHero });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].flags = game[actor].flags || {};
    game[actor].skillPreferences = game[actor].skillPreferences || {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp;
  }
  return game;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// v11 A3 批次二: 洛神面板的渲染与接线正则断言已由
// tests/ui_panels_a3_batch2.test.mjs 的 fake-DOM 全链路行为测试取代。

test('v8 PR-C5: SKILL_METADATA 已注册 luoshen (preparePhase / onPreparePhase / judgement cost)', () => {
  assert.match(heroesSrc, /luoshen:\s*\{.*trigger:\s*'preparePhase'/);
  assert.match(heroesSrc, /luoshen:\s*\{.*cost:\s*\{\s*type:\s*'judgement'/);
  assert.match(heroesSrc, /luoshen:\s*\{.*hooks:\s*\[\s*'onPreparePhase'/);
});

test('v8 PR-C5: 甄姬 auto + deck=[黑黑红] → 获得 2 张黑色, 红色入弃, 进入 judge 阶段', () => {
  const game = buildGame('liubei', 'zhenji');
  game.enemy.skillPreferences.luoshen = 'auto';
  // deck.pop 顺序: 末位最先弹 → 前面 2 张是摸牌阶段的 pad, 后 3 张才是洛神判定
  game.deck = [
    c('sha', { id: 'pad-draw-1', suit: 'spade', color: 'black', rank: '7' }),
    c('sha', { id: 'pad-draw-2', suit: 'spade', color: 'black', rank: '8' }),
    c('shan', { id: 'ls-red-stop', suit: 'heart', color: 'red', rank: '5' }),
    c('sha', { id: 'ls-black-2', suit: 'spade', color: 'black', rank: '3' }),
    c('sha', { id: 'ls-black-1', suit: 'club', color: 'black', rank: '2' })
  ];

  Engine.startTurn(game, 'enemy');

  assert.ok(game.enemy.hand.some((card) => card.id === 'ls-black-1'), '黑色 1 入手');
  assert.ok(game.enemy.hand.some((card) => card.id === 'ls-black-2'), '黑色 2 入手');
  assert.ok(game.discard.some((card) => card.id === 'ls-red-stop'), '红色入弃牌堆');
  // 洛神得 2 + 摸牌阶段 2 = 4
  assert.equal(game.enemy.hand.length, 4, '总手牌 = 洛神 2 + 摸 2');
  assert.notEqual(game.phase, 'prepare', '已经进入下一阶段（auto 不暂停）');
});

test('v8 PR-C5: deck 首张就是红色 → 不获得任何牌, 该牌入弃', () => {
  const game = buildGame('liubei', 'zhenji');
  game.enemy.skillPreferences.luoshen = 'auto';
  // 后两张是摸牌阶段, 末位 (即将弹出的) 是红色
  game.deck = [
    c('sha', { id: 'pad-1', suit: 'spade', color: 'black', rank: '6' }),
    c('sha', { id: 'pad-2', suit: 'spade', color: 'black', rank: '8' }),
    c('tao', { id: 'ls-red-first', suit: 'heart', color: 'red', rank: '4' })
  ];

  Engine.startTurn(game, 'enemy');

  assert.ok(game.discard.some((card) => card.id === 'ls-red-first'), '红色入弃');
  assert.equal(game.enemy.hand.length, 2, '洛神 0 + 摸牌 2');
  assert.ok(!game.enemy.hand.some((card) => card.id === 'ls-red-first'), '红色不在手');
});

test('v8 PR-C5: pref = decline → 不发动洛神', () => {
  const game = buildGame('liubei', 'zhenji');
  game.enemy.skillPreferences.luoshen = 'decline';
  // 摸牌阶段会摸 2: pad-2, pad-1 (后弹), 洛神原本会判 should-stay-1, 但 decline 不会判
  game.deck = [
    c('shan', { id: 'pad-1', suit: 'heart', color: 'red', rank: '6' }),
    c('shan', { id: 'pad-2', suit: 'heart', color: 'red', rank: '9' }),
    c('sha', { id: 'should-stay-1', suit: 'spade', color: 'black', rank: '8' })
  ];

  Engine.startTurn(game, 'enemy');

  // 应当: 洛神判定 should-stay-1 (top) 直接被摸牌阶段当 draw 用
  assert.ok(game.enemy.hand.some((card) => card.id === 'should-stay-1'), 'top 牌作为摸牌阶段 draw 进入手牌');
  assert.ok(!game.discard.some((card) => card.id === 'should-stay-1'), '未作为洛神红色入弃');
  assert.ok(game.log.some((line) => /不发动【洛神】/.test(line)));
});

test('v8 PR-C5: player 甄姬 + ask + 首次设置 pendingChoice (luoshen-continue, actor=player)', () => {
  const game = buildGame('zhenji', 'liubei');
  game.player.skillPreferences.luoshen = 'ask';
  game.deck = [
    c('sha', { id: 'ls-black-only', suit: 'spade', color: 'black', rank: '9' })
  ];

  Engine.startTurn(game, 'player');

  assert.ok(game.pendingChoice, '设置了 pendingChoice');
  assert.equal(game.pendingChoice.kind, 'luoshen-continue');
  assert.equal(game.pendingChoice.actor, 'player');
  // 没有真的判定
  assert.equal(game.player.hand.length, 0);
  assert.equal(game.deck.length, 1, 'deck 未弹出');
});

test('v8 PR-C5: player ask → resolvePendingChoice(decline:true) → 不判定, 进入 judge 阶段', () => {
  const game = buildGame('zhenji', 'liubei');
  game.player.skillPreferences.luoshen = 'ask';
  // 仅一张待用 — 若 decline, 它应作为摸牌阶段 draw 而非洛神判定
  game.deck = [
    c('sha', { id: 'ls-stash', suit: 'spade', color: 'black', rank: '10' })
  ];

  Engine.startTurn(game, 'player');
  assert.equal(game.pendingChoice.kind, 'luoshen-continue');

  Engine.resolvePendingChoice(game, { decline: true });

  // ls-stash 此时作为 draw 入手, 不应在 discard
  assert.ok(!game.discard.some((card) => card.id === 'ls-stash'), 'top 牌未作为洛神判定丢弃');
  assert.ok(game.player.hand.some((card) => card.id === 'ls-stash'), 'top 牌作为摸牌阶段 draw 入手');
  assert.equal(game.pendingChoice, null, 'choice 已清');
  assert.notEqual(game.phase, 'prepare', '已离开准备阶段');
  assert.ok(game.log.some((line) => /停止【洛神】/.test(line)));
});

test('v8 PR-C5: player ask → resolve(continue) → 黑色入手 → 再次 ask (suspended again)', () => {
  const game = buildGame('zhenji', 'liubei');
  game.player.skillPreferences.luoshen = 'ask';
  game.deck = [
    c('shan', { id: 'pad-red', suit: 'heart', color: 'red', rank: 'A' }),
    c('sha', { id: 'first-black', suit: 'spade', color: 'black', rank: '2' })
  ];

  Engine.startTurn(game, 'player');
  // 第一次询问
  assert.equal(game.pendingChoice.kind, 'luoshen-continue');

  Engine.resolvePendingChoice(game, {}); // 默认 = 继续

  // 第一次判定: 黑色 → 入手
  assert.ok(game.player.hand.some((card) => card.id === 'first-black'), '黑色入手');
  // 接下来再次询问
  assert.ok(game.pendingChoice, '再次设置 pendingChoice');
  assert.equal(game.pendingChoice.kind, 'luoshen-continue');
});

test('v8 PR-C5: player ask → 连续 continue 直到红色 → 自动结束 + 进入 judge', () => {
  const game = buildGame('zhenji', 'liubei');
  game.player.skillPreferences.luoshen = 'ask';
  // 前两张是摸牌阶段, 后 3 张洛神
  game.deck = [
    c('sha', { id: 'pad-d-1', suit: 'spade', color: 'black', rank: 'K' }),
    c('sha', { id: 'pad-d-2', suit: 'spade', color: 'black', rank: 'Q' }),
    c('sha', { id: 'red-end', suit: 'heart', color: 'red', rank: 'J' }),
    c('sha', { id: 'black-2', suit: 'spade', color: 'black', rank: '3' }),
    c('sha', { id: 'black-1', suit: 'club', color: 'black', rank: '2' })
  ];

  Engine.startTurn(game, 'player');
  // ask 1
  Engine.resolvePendingChoice(game, {}); // continue → black-1 入手 → ask 2
  Engine.resolvePendingChoice(game, {}); // continue → black-2 入手 → ask 3
  // 第三次 continue 触发红色 → 自动结束
  Engine.resolvePendingChoice(game, {});

  assert.ok(game.player.hand.some((card) => card.id === 'black-1'));
  assert.ok(game.player.hand.some((card) => card.id === 'black-2'));
  assert.ok(game.discard.some((card) => card.id === 'red-end'), '红色入弃');
  assert.equal(game.pendingChoice, null, '无 pendingChoice');
  assert.notEqual(game.phase, 'prepare', '离开准备阶段');
});

test('v8 PR-C5: 非甄姬（无 luoshen 技能）→ 准备阶段不触发洛神', () => {
  const game = buildGame('liubei', 'caocao');
  game.enemy.skillPreferences.luoshen = 'auto'; // 即使 pref 设了, 没技能也不能触发
  game.deck = [
    c('sha', { id: 'not-judged', suit: 'spade', color: 'black', rank: '4' })
  ];

  Engine.startTurn(game, 'enemy');

  // 没有 luoshen 技能 → 不判定. top 牌作为摸牌阶段 draw 入手, 而非洛神弃
  assert.ok(!game.discard.some((card) => card.id === 'not-judged'), 'top 牌未作为洛神丢弃');
  assert.ok(game.enemy.hand.some((card) => card.id === 'not-judged'), 'top 牌作为 draw 进入手牌');
  assert.ok(!game.log.some((line) => /【洛神】/.test(line)), '日志无洛神相关');
});

test('v8 PR-C5: AI (enemy) 甄姬 pref undefined → 默认 auto, 自动连续判定', () => {
  const game = buildGame('liubei', 'zhenji');
  // 不设置 skillPreferences.luoshen → 默认 auto for enemy
  game.deck = [
    c('sha', { id: 'pad-1', suit: 'spade', color: 'black', rank: '7' }),
    c('sha', { id: 'pad-2', suit: 'spade', color: 'black', rank: '8' }),
    c('shan', { id: 'red-stop', suit: 'heart', color: 'red', rank: '5' }),
    c('sha', { id: 'black-claim', suit: 'spade', color: 'black', rank: '6' })
  ];

  Engine.startTurn(game, 'enemy');

  assert.ok(game.enemy.hand.some((card) => card.id === 'black-claim'), '黑色入手');
  assert.ok(game.discard.some((card) => card.id === 'red-stop'));
  assert.equal(game.pendingChoice, null, 'AI 不暂停');
});

test('v8 hotfix-2: luoshen / qingnang 已注册到 IMPLEMENTED_SKILL_IDS (不再"未实现")', () => {
  assert.match(skillStatusSrc, /'luoshen'/);
  assert.match(skillStatusSrc, /'qingnang'/);
  assert.match(skillStatusSrc, /'guose'/);
  assert.match(skillStatusSrc, /'liuli'/);
  assert.match(skillStatusSrc, /'jijiu'/);
  assert.ok(Engine.IMPLEMENTED_SKILL_IDS.includes('luoshen'));
  assert.ok(Engine.IMPLEMENTED_SKILL_IDS.includes('qingnang'));
  assert.ok(Engine.ACTIVE_SKILL_IDS.includes('qingnang'), 'qingnang 主动技 → 应在 ACTIVE');
  assert.ok(Engine.ACTIVE_SKILL_IDS.includes('luoshen'), 'luoshen 需要点击决定 → ACTIVE');
});

test('v8 hotfix-2: index.html 含 luoshenPromptPanel + 按钮', () => {
  assert.match(htmlSrc, /id="luoshenPromptPanel"/);
  assert.match(htmlSrc, /id="luoshenContinueBtn"/);
  assert.match(htmlSrc, /id="luoshenStopBtn"/);
  assert.match(htmlSrc, /pending-prompt-panel[^"]*"\s+id="luoshenPromptPanel"/);
});

test('v8 hotfix-2: qingnang cardSkillConfig 已在 dom-adapter 注册', () => {
  assert.match(adapterSrc, /qingnang:\s*\{[\s\S]{0,500}name:\s*'青囊'/);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
