import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function makeGame() {
  const game = Engine.newGame({ seed: 98, startWithFirstTurn: true, playerHero: 'liubei', enemyHero: 'sunquan' });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  return game;
}

function dealSha(state, id, opts) {
  const card = Object.assign({ id, type: 'sha', name: '杀', suit: 'spade', color: 'black' }, opts || {});
  state.hand.push(card);
  return card;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v8 PR-B4: enemy 装银月 + player 出黑杀 + enemy 用黑闪响应 → 银月触发 → player 受 1 dmg', () => {
  const game = makeGame();
  // game.turn = 'player' (player 的回合); enemy 装银月; 此时 enemy 是"回合外"
  game.enemy.equipment.weapon = { id: 'yy-w', type: 'yinyue', name: '银月枪', family: 'equipment', slot: 'weapon', range: 3 };
  // enemy 手中有 1 张黑闪用于响应, 还有 1 张黑闪给银月触发时备用
  game.enemy.hand.push(
    { id: 'foe-black-shan-1', type: 'shan', name: '闪', suit: 'spade', color: 'black' },
    { id: 'foe-black-shan-2', type: 'shan', name: '闪', suit: 'spade', color: 'black' }
  );
  dealSha(game.player, 'p-sha');
  // player 出杀 → enemy 自动出第一张闪响应 → 这张是黑色手牌 + 回合外 → 银月触发 →
  // enemy 令 player 出闪或受 1 dmg → player 无闪 → 受 1 dmg
  const playerHpBefore = game.player.hp;
  Engine.playCard(game, 'player', 'p-sha');
  assert.equal(game.player.hp, playerHpBefore - 1, '银月命中 player → 1 dmg');
  // enemy 弃 1 张闪 (响应) + 0 张 (银月不需自身出); 共剩 1 张
  assert.equal(game.enemy.hand.length, 1);
});

test('v8 PR-B4: enemy 装银月 + 红色闪响应 → 不触发 (色不黑)', () => {
  const game = makeGame();
  game.enemy.equipment.weapon = { id: 'yy-w2', type: 'yinyue', name: '银月枪', family: 'equipment', slot: 'weapon', range: 3 };
  game.enemy.hand.push({ id: 'foe-red-shan', type: 'shan', name: '闪', suit: 'heart', color: 'red' });
  dealSha(game.player, 'p-sha2');
  const playerHpBefore = game.player.hp;
  Engine.playCard(game, 'player', 'p-sha2');
  assert.equal(game.player.hp, playerHpBefore, '红闪响应 → 银月不触发, player 不受伤');
});

test('v8 PR-B4: holder 自己回合内打出黑色 → 不触发 (限定回合外)', () => {
  const game = makeGame();
  // 改成 enemy 的回合, 让 player 装银月; player 在自己回合外应该能触发, 但这里我们换成
  // 同回合 player 装银月并出黑杀的场景 → 自己回合, 不触发银月 (即便用了黑牌)
  game.player.equipment.weapon = { id: 'yy-w3', type: 'yinyue', name: '银月枪', family: 'equipment', slot: 'weapon', range: 3 };
  // 给 enemy 一张黑闪, 让 enemy 响应 player 的杀; enemy 出黑闪不触发 (enemy 装备无银月)
  // 我们只验证 player 装银月时, 自己回合打出黑色 (= 主动用杀) 不应触发自己的银月
  game.enemy.hand.push({ id: 'foe-shan-self', type: 'shan', name: '闪', suit: 'spade', color: 'black' });
  dealSha(game.player, 'p-sha3', { suit: 'spade', color: 'black' });
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'p-sha3');
  // enemy 用闪响应; player 的银月在他自己回合不触发; player 出杀本身是 use 不是 "打出"
  // 因此 enemy 不受额外银月伤害 (player.turn === player); 只用了 1 杀被 1 闪抵消, hp 不变
  assert.equal(game.enemy.hp, enemyHpBefore, '回合内 不触发银月; enemy 闪挡, hp 不变');
});

test('v8 PR-B4: skillPreferences.yinyue=decline → 不触发', () => {
  const game = makeGame();
  game.enemy.equipment.weapon = { id: 'yy-w4', type: 'yinyue', name: '银月枪', family: 'equipment', slot: 'weapon', range: 3 };
  game.enemy.skillPreferences.yinyue = 'decline';
  game.enemy.hand.push({ id: 'foe-black-decline', type: 'shan', name: '闪', suit: 'spade', color: 'black' });
  dealSha(game.player, 'p-sha4');
  const playerHpBefore = game.player.hp;
  Engine.playCard(game, 'player', 'p-sha4');
  assert.equal(game.player.hp, playerHpBefore, 'decline → 银月不触发');
});

test('v8 PR-B4: player 攻击 enemy + enemy 用黑闪 → 银月触发 + player 有闪 → 银月被闪 → 不受伤', () => {
  const game = makeGame();
  game.enemy.equipment.weapon = { id: 'yy-w5', type: 'yinyue', name: '银月枪', family: 'equipment', slot: 'weapon', range: 3 };
  game.enemy.hand.push({ id: 'foe-bsh-trigger', type: 'shan', name: '闪', suit: 'spade', color: 'black' });
  // player 手中有黑闪可用于响应银月触发
  game.player.hand.push({ id: 'p-shan-defend', type: 'shan', name: '闪', suit: 'spade', color: 'black' });
  dealSha(game.player, 'p-sha5');
  const playerHpBefore = game.player.hp;
  Engine.playCard(game, 'player', 'p-sha5');
  // enemy 用 foe-bsh-trigger 闪掉 p-sha5; 银月触发, enemy 让 player 出闪;
  // player 出 p-shan-defend; player 不受伤
  assert.equal(game.player.hp, playerHpBefore);
  // player 手牌空 (闪被消耗)
  assert.equal(game.player.hand.length, 0);
});

test('v8 PR-B4: 非银月武器 → 不触发', () => {
  const game = makeGame();
  game.enemy.equipment.weapon = { id: 'qg-w-ctl', type: 'qinggang', name: '青釭剑', family: 'equipment', slot: 'weapon', range: 2 };
  game.enemy.hand.push({ id: 'foe-bsh-non-yy', type: 'shan', name: '闪', suit: 'spade', color: 'black' });
  dealSha(game.player, 'p-sha6');
  const playerHpBefore = game.player.hp;
  Engine.playCard(game, 'player', 'p-sha6');
  assert.equal(game.player.hp, playerHpBefore, '非银月 → player 不受伤');
});

test('v8 PR-B4: 武圣红牌当闪响应 → response.card.color === red → 不触发银月', () => {
  // guanyu 武圣 把红牌当闪响应; 红色不触发银月
  const game = Engine.newGame({ seed: 98, startWithFirstTurn: true, playerHero: 'liubei', enemyHero: 'guanyu' });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  game.enemy.equipment.weapon = { id: 'yy-w-ws', type: 'yinyue', name: '银月枪', family: 'equipment', slot: 'weapon', range: 3 };
  // enemy (guanyu) 手中只有红桃, 武圣把红牌当闪
  game.enemy.hand.push({ id: 'foe-red-tao', type: 'tao', name: '桃', suit: 'heart', color: 'red' });
  dealSha(game.player, 'p-sha7');
  const playerHpBefore = game.player.hp;
  Engine.playCard(game, 'player', 'p-sha7');
  // 武圣 红牌当闪 → response.card.color === 'red' → 不触发银月
  assert.equal(game.player.hp, playerHpBefore, '武圣红牌当闪 不触发银月');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
