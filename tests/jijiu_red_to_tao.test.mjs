import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

// v11 A1: 所有推进引擎状态的 Engine.* 调用均包上 assertCardConservation (全局牌守恒断言)。

const root = path.resolve(import.meta.dirname, '..');
const heroesSrc = fs.readFileSync(path.join(root, 'src/data/heroes.js'), 'utf8');
// v11 B2: 提示类/响应类面板已迁往 src/ui/panels/, 源为主文件 + 面板模块拼接。
const adapterSrc = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(root, 'src/ui/panels/response-panels.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(root, 'src/ui/panels/prompt-panels.js'), 'utf8');

function makeHuatuoGame() {
  // 华佗 自带 jijiu + qingnang 技能
  const game = Engine.newGame({ seed: 120, startWithFirstTurn: true, playerHero: 'liubei', enemyHero: 'huatuo' });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

function dealSha(state, id) {
  const card = { id, type: 'sha', name: '杀', suit: 'spade', color: 'black' };
  state.hand.push(card);
  return card;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v8 PR-C3: SKILL_METADATA 已注册 jijiu (cardConvert trigger)', () => {
  assert.match(heroesSrc, /jijiu:\s*\{.*trigger:\s*'cardConvert'/);
});

test('v8 PR-C3: 华佗 dying + 手中有 红色 闪 + auto pref → 急救自救', () => {
  const game = makeHuatuoGame();
  // 让 华佗 (enemy) 装备状态有红牌, 玩家攻击直接杀死
  game.enemy.hp = 1;
  game.enemy.hand.push({ id: 'red-shan', type: 'shan', name: '闪', suit: 'heart', color: 'red' });
  game.enemy.skillPreferences.dying = 'auto';
  // 但 红闪 会被 consumeResponse 当闪挡掉啊 — 改用 红色非闪牌
  game.enemy.hand = [{ id: 'red-juedou', type: 'juedou', name: '决斗', family: 'trick', suit: 'heart', color: 'red' }];
  dealSha(game.player, 'lethal-sha');
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'lethal-sha'));
  // 杀击中 华佗 hp=0 → dying → auto 路径用 急救 红色当桃 自救 → hp=1
  assert.equal(game.enemy.hp, 1, '急救 红决斗当桃 → hp=1');
  assert.equal(game.phase, 'play', '未死');
  // 红决斗 已弃 (急救成本)
  assert.ok(game.discard.some((c) => c.id === 'red-juedou'));
});

test('v8 PR-C3: 华佗 dying + 桃 优先 (auto 顺序: 桃 → 酒 → 急救)', () => {
  const game = makeHuatuoGame();
  game.enemy.hp = 1;
  game.enemy.skillPreferences.dying = 'auto';
  // 桃 + 红色其他 都在手, 自救应优先用桃
  game.enemy.hand = [
    { id: 'true-tao', type: 'tao', name: '桃', suit: 'heart', color: 'red' },
    { id: 'red-extra', type: 'wuzhong', name: '无中生有', family: 'trick', suit: 'heart', color: 'red' }
  ];
  dealSha(game.player, 'kill-sha');
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'kill-sha'));
  assert.equal(game.enemy.hp, 1, '桃自救');
  assert.ok(game.discard.some((c) => c.id === 'true-tao'), '桃被消耗');
  assert.ok(game.enemy.hand.some((c) => c.id === 'red-extra'), '红色其他牌保留');
});

test('v8 PR-C3: 华佗 dying + 仅黑色手牌 → 不能急救 → 死', () => {
  const game = makeHuatuoGame();
  game.enemy.hp = 1;
  game.enemy.skillPreferences.dying = 'auto';
  game.enemy.hand = [
    { id: 'black-only', type: 'wuzhong', name: '无中生有', family: 'trick', suit: 'spade', color: 'black' }
  ];
  dealSha(game.player, 'kill-no-rescue');
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'kill-no-rescue'));
  assert.equal(game.phase, 'gameover', '黑色不能急救 → 死');
  assert.equal(game.winner, 'player');
});

test('v8 PR-C3: 华佗 自己回合 dying (e.g. 苦肉) → 急救 不触发 (限定回合外)', () => {
  // 这个 case: 华佗 在自己回合 hp 降到 0 (e.g. 受 反伤 / 自伤), 急救
  // 不应触发 because game.turn === 华佗
  // 用一个具体场景: 华佗 受到 闪电 雷电伤害 (自己回合判定阶段)
  const game = Engine.newGame({ seed: 120, startWithFirstTurn: false, playerHero: 'liubei', enemyHero: 'huatuo' });
  game.phase = 'play';
  game.turn = 'enemy';  // huatuo 的回合
  game.enemy.hp = 1;
  game.enemy.hand = [{ id: 'red-non-tao', type: 'wuzhong', name: '无中生有', family: 'trick', suit: 'heart', color: 'red' }];
  game.enemy.judgeArea.push({ id: 'sd-self', type: 'shandian', name: '闪电', family: 'delayed', suit: 'spade', color: 'black' });
  game.deck = [
    { id: 'pad-1', type: 'tao', name: '桃', suit: 'heart', color: 'red', rank: '2' },
    { id: 'pad-2', type: 'tao', name: '桃', suit: 'heart', color: 'red', rank: '3' },
    { id: 'pad-3', type: 'tao', name: '桃', suit: 'heart', color: 'red', rank: '4' },
    { id: 'hit', type: 'sha', name: '杀', suit: 'spade', color: 'black', rank: '5' }
  ];
  assertCardConservation(game, () => Engine.startTurn(game, 'enemy'));
  // 闪电命中 → 华佗 受 3 dmg → hp 从 1 → -2 (clamped 0) → 濒死
  // 此时 game.turn === 'enemy' (= 华佗), 急救 不触发 → 红牌 不能当桃
  // → 应该死
  assert.equal(game.phase, 'gameover', '自己回合 急救不能触发 → 死');
});

test('v8 PR-C3: 华佗 + player ask + dying → pendingChoice.jijiuIds 包含红色非桃非酒牌', () => {
  const game = makeHuatuoGame();
  // 把 华佗 设为 player; player 是 ask
  const g2 = Engine.newGame({ seed: 121, startWithFirstTurn: true, playerHero: 'huatuo', enemyHero: 'liubei' });
  g2.phase = 'play';
  g2.turn = 'enemy';  // enemy 的回合, player(华佗) 是回合外
  g2.player.hand = [
    { id: 'red-wz', type: 'wuzhong', name: '无中生有', family: 'trick', suit: 'heart', color: 'red' }
  ];
  g2.enemy.hand = [];
  g2.player.hp = 1;
  dealSha(g2.enemy, 'enemy-kill');
  assertCardConservation(g2, () => Engine.playCard(g2, 'enemy', 'enemy-kill'));
  // player(华佗) 被杀 hp=0 → dying → ask → pendingChoice 应含 jijiuIds
  assert.ok(g2.pendingChoice);
  assert.equal(g2.pendingChoice.kind, 'dying-rescue');
  assert.ok(g2.pendingChoice.jijiuIds && g2.pendingChoice.jijiuIds.indexOf('red-wz') >= 0);
});

test('v8 PR-C3: resolve {cardId: jijiuId} → 红牌当桃救援', () => {
  const g = Engine.newGame({ seed: 122, startWithFirstTurn: true, playerHero: 'huatuo', enemyHero: 'liubei' });
  g.phase = 'play';
  g.turn = 'enemy';
  g.player.hand = [
    { id: 'red-juedou-resolve', type: 'juedou', name: '决斗', family: 'trick', suit: 'heart', color: 'red' }
  ];
  g.enemy.hand = [];
  g.player.hp = 1;
  dealSha(g.enemy, 'enemy-kill-2');
  assertCardConservation(g, () => Engine.playCard(g, 'enemy', 'enemy-kill-2'));
  assert.ok(g.pendingChoice && g.pendingChoice.kind === 'dying-rescue');
  const result = assertCardConservation(g, () => Engine.resolvePendingChoice(g, { cardId: 'red-juedou-resolve' }));
  assert.equal(result.ok, true);
  assert.equal(g.player.hp, 1, '急救 救活');
  assert.ok(g.discard.some((c) => c.id === 'red-juedou-resolve'));
});

test('v8 PR-C3: dying-rescue 面板 UI 渲染 jijiuIds 用 · 急救 suffix', () => {
  // 通过源码扫描验证 UI 改动
  assert.match(adapterSrc, /pending\.jijiuIds\s*\|\|\s*\[\]/);
  assert.match(adapterSrc, /'\s*·\s*急救'/);
});

test('v8 PR-C3: 非华佗 + dying + 红色非桃手牌 → 急救不触发, 死', () => {
  const game = makeHuatuoGame();
  // 用 enemy=sunquan (无 jijiu)
  const g2 = Engine.newGame({ seed: 123, startWithFirstTurn: true, playerHero: 'liubei', enemyHero: 'sunquan' });
  g2.phase = 'play';
  g2.turn = 'player';
  g2.player.hand = [];
  g2.enemy.hand = [
    { id: 'red-non-tao-nh', type: 'wuzhong', name: '无中生有', family: 'trick', suit: 'heart', color: 'red' }
  ];
  g2.enemy.hp = 1;
  g2.enemy.skillPreferences.dying = 'auto';
  dealSha(g2.player, 'kill-non-huatuo');
  assertCardConservation(g2, () => Engine.playCard(g2, 'player', 'kill-non-huatuo'));
  assert.equal(g2.phase, 'gameover', '非华佗无急救 → 死');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
