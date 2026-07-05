// v9 PR-E26: 闪响应支持选用哪张牌当【闪】 — 真闪 + 龙胆/倾国 转化候选.
// 用户反馈 PR-E25 后"有些技能可以用别的牌当闪的情况"有逻辑问题: 面板只能
// 出闪/不出, 引擎自动选第一张; 现改为列出所有候选让玩家选.
// v11 A1: 引擎变更调用统一接入 assertCardConservation 全局牌守恒断言.
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
function c(type, overrides = {}) { return Engine.makeTestCard(type, overrides); }

test('v9 PR-E26: shan-response pendingChoice 带 options (真闪枚举)', () => {
  const game = Engine.newGame({ seed: 720, playerHero: 'liubei', enemyHero: 'caocao' });
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.player.hand = [c('shan', { id: 'p-shan-a' }), c('shan', { id: 'p-shan-b' })];
  game.player.skillPreferences = { shanResponse: 'ask' };
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'e-sha'));
  const pc = Engine.getPendingChoice(game);
  assert.equal(pc.kind, 'shan-response');
  assert.ok(Array.isArray(pc.options), 'pendingChoice 应带 options 数组');
  assert.equal(pc.options.length, 2, '两张真闪 → 2 个候选');
  assert.ok(pc.options.every((o) => o.via === null), '真闪 via 为 null');
});

test('v9 PR-E26: resolvePendingChoice({cardId}) 指定用哪张闪', () => {
  const game = Engine.newGame({ seed: 721, playerHero: 'liubei', enemyHero: 'caocao' });
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.player.hand = [c('shan', { id: 'p-shan-a' }), c('shan', { id: 'p-shan-b' })];
  game.player.skillPreferences = { shanResponse: 'ask' };
  const hpBefore = game.player.hp;
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'e-sha'));
  const r = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'p-shan-b' }));
  assert.equal(r.ok, true);
  assert.equal(game.player.hp, hpBefore, '出闪 → 不受伤');
  assert.ok(game.discard.some((x) => x.id === 'p-shan-b'), '指定的 p-shan-b 进弃牌堆');
  assert.ok(game.player.hand.some((x) => x.id === 'p-shan-a'), '未选的 p-shan-a 仍在手牌');
});

test('v9 PR-E26: 龙胆 — 无真闪但有【杀】, options 含 龙胆转化候选', () => {
  const game = Engine.newGame({ seed: 722, playerHero: 'zhaoyun', enemyHero: 'caocao' });
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.player.hand = [c('sha', { id: 'p-sha-1' })];
  game.player.skillPreferences = { shanResponse: 'ask' };
  const hpBefore = game.player.hp;
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'e-sha'));
  const pc = Engine.getPendingChoice(game);
  assert.equal(pc.kind, 'shan-response');
  assert.ok(pc.options.some((o) => o.cardId === 'p-sha-1' && o.via === '龙胆'), 'options 含 龙胆 转化候选');
  const r = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'p-sha-1' }));
  assert.equal(r.ok, true);
  assert.equal(game.player.hp, hpBefore, '龙胆 将杀当闪 → 不受伤');
  assert.ok(game.discard.some((x) => x.id === 'p-sha-1'), '被转化的杀进弃牌堆');
});

test('v9 PR-E26: resolvePendingChoice({use:false}) 仍可不出 (受伤)', () => {
  const game = Engine.newGame({ seed: 723, playerHero: 'liubei', enemyHero: 'caocao' });
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.player.hand = [c('shan', { id: 'p-shan' })];
  game.player.skillPreferences = { shanResponse: 'ask' };
  const hpBefore = game.player.hp;
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'e-sha'));
  const r = assertCardConservation(game, () => Engine.resolvePendingChoice(game, { use: false }));
  assert.equal(r.ok, true);
  assert.equal(game.player.hp, hpBefore - 1, '不出 → 受 1 点伤害');
});

test('v9 PR-E26: listShanResponseOptions / shanOptionForCard 已导出且工作', () => {
  // 经 pendingChoice.options 间接验证 — 倾国 (甄姬) 黑色手牌当闪
  const game = Engine.newGame({ seed: 724, playerHero: 'zhenji', enemyHero: 'caocao' });
  game.turn = 'enemy';
  game.phase = 'play';
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.player.hand = [c('guohe', { id: 'p-blk', suit: 'spade', color: 'black' })];
  game.player.skillPreferences = { shanResponse: 'ask' };
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'e-sha'));
  const pc = Engine.getPendingChoice(game);
  assert.ok(pc && pc.kind === 'shan-response', '甄姬有黑牌 → 倾国可响应, 暂停');
  assert.ok(pc.options.some((o) => o.cardId === 'p-blk' && o.via === '倾国'), 'options 含 倾国 转化候选');
});

console.log('\nShan-response conversion (PR-E26) tests passed.');
