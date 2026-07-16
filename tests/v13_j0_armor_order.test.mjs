// v13 J0-3 (PR #165 玩家实测缺陷 3): 防具响应顺序 — 免疫类防具 (藤甲对
// 普通杀/南蛮/万箭, 仁王盾对黑杀) 在响应询问前短路整个结算; 判定类防具
// (八卦) 先给发动机会, 红判定视为已打出闪免出手牌, 失败才回到手牌响应
// 窗口 (窗口内放弃不再补试)。对照 gltjk card__equipment.md:
//   藤甲: "锁定技，【南蛮入侵】、【万箭齐发】和普通【杀】对你无效"
//   仁王盾: "锁定技，黑色【杀】对你无效"
//   八卦阵: "每当你需要使用/打出【闪】时，你可以判定，若结果为红色，
//           你视为使用/打出一张【闪】"
import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function buildGame(opts) {
  opts = opts || {};
  const game = Engine.newGame({
    seed: opts.seed || 13031,
    playerHero: opts.playerHero || 'liubei',
    enemyHero: opts.enemyHero || 'caocao'
  });
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].flags = {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp;
    game[actor].skillPreferences = {};
  }
  game.turn = 'player';
  game.phase = 'play';
  return game;
}

function redJudge(id) { return c('tao', { id: id || 'j-red', suit: 'heart', rank: '5' }); }
function blackJudge(id) { return c('sha', { id: id || 'j-black', suit: 'spade', rank: '5' }); }

// ───── 藤甲: 免疫类短路 (响应询问前) ────────────────────────────────

test('藤甲 vs 普通杀: 不开响应窗口即无效 — 玩家 ask 目标零询问, 闪保留', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.player.hand = [c('shan', { id: 'p-shan' })];
  game.player.equipment.armor = c('tengjia', { id: 'p-tj' });
  game.player.skillPreferences.shanResponse = 'ask';
  const hp = game.player.hp;
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'e-sha'));
  assert.equal(game.pendingChoice, null, '免疫类防具短路 → 无响应询问');
  assert.equal(game.player.hp, hp, '不掉血');
  assert.equal(game.player.hand.length, 1, '闪保留');
  assert.ok(game.discard.some((x) => x.id === 'e-sha'), '杀进弃牌堆');
  assert.ok(game.log.some((l) => l.includes('【藤甲】令普通【杀】无效')));
});

test('藤甲 vs 火杀: 不免疫 — 照常询问, 放弃后火伤 +1 = 2', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('fire_sha', { id: 'e-fsha' })];
  game.player.hand = [c('shan', { id: 'p-shan' })];
  game.player.equipment.armor = c('tengjia', { id: 'p-tj' });
  game.player.skillPreferences.shanResponse = 'ask';
  const hp = game.player.hp;
  Engine.playCard(game, 'enemy', 'e-fsha');
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'shan-response', '火杀照常开窗');
  Engine.resolvePendingChoice(game, {});
  assert.equal(game.player.hp, hp - 2, '火伤 1 + 藤甲② 1 = 2');
});

test('藤甲 vs 雷杀: 不免疫 — 无闪时正常受 1 点雷伤', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('thunder_sha', { id: 'e-tsha' })];
  game.player.equipment.armor = c('tengjia', { id: 'p-tj' });
  const hp = game.player.hp;
  Engine.playCard(game, 'enemy', 'e-tsha');
  assert.equal(game.player.hp, hp - 1, '雷杀不在藤甲免疫列');
});

test('青釭剑无视防具: 藤甲不短路, 普通杀正常结算', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.enemy.equipment.weapon = c('qinggang', { id: 'e-qg' });
  game.player.equipment.armor = c('tengjia', { id: 'p-tj' });
  const hp = game.player.hp;
  Engine.playCard(game, 'enemy', 'e-sha');
  assert.equal(game.player.hp, hp - 1, '青釭无视藤甲 → 命中');
});

test('藤甲 vs 南蛮入侵: 座席免疫跳过 — 不询问出杀, 不掉血', () => {
  const game = buildGame();
  game.player.hand = [c('nanman', { id: 'p-nm' })];
  game.enemy.hand = [c('sha', { id: 'e-sha-keep' })];
  game.enemy.equipment.armor = c('tengjia', { id: 'e-tj' });
  const hp = game.enemy.hp;
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'p-nm'));
  assert.equal(game.enemy.hp, hp, '南蛮对藤甲无效');
  assert.equal(game.enemy.hand.length, 1, '杀未被消耗 (根本没被询问)');
  assert.ok(game.log.some((l) => l.includes('【藤甲】令【南蛮入侵】无效')));
});

test('藤甲 vs 万箭齐发: 玩家 ask 目标零询问, 不掉血', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('wanjian', { id: 'e-wj' })];
  game.player.hand = [c('shan', { id: 'p-shan' })];
  game.player.equipment.armor = c('tengjia', { id: 'p-tj' });
  game.player.skillPreferences.shanResponse = 'ask';
  const hp = game.player.hp;
  Engine.playCard(game, 'enemy', 'e-wj');
  assert.equal(game.pendingChoice, null, '万箭对藤甲无效 → 无询问');
  assert.equal(game.player.hp, hp);
  assert.equal(game.player.hand.length, 1, '闪保留');
});

test('藤甲 vs 决斗: 不免疫 — 无杀时正常受 1 点伤害', () => {
  const game = buildGame();
  game.player.hand = [c('juedou', { id: 'p-jd' })];
  game.enemy.equipment.armor = c('tengjia', { id: 'e-tj' });
  const hp = game.enemy.hp;
  Engine.playCard(game, 'player', 'p-jd');
  assert.equal(game.enemy.hp, hp - 1, '决斗不在藤甲免疫列');
});

// ───── 仁王盾: 已有短路的回归确认 ────────────────────────────────────

test('仁王盾 vs 黑杀: 响应询问前短路 — 玩家 ask 目标零询问', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'e-sha', suit: 'spade', color: 'black' })];
  game.player.hand = [c('shan', { id: 'p-shan' })];
  game.player.equipment.armor = c('renwang', { id: 'p-rw' });
  game.player.skillPreferences.shanResponse = 'ask';
  const hp = game.player.hp;
  Engine.playCard(game, 'enemy', 'e-sha');
  assert.equal(game.pendingChoice, null, '仁王盾短路 → 无询问');
  assert.equal(game.player.hp, hp);
  assert.equal(game.player.hand.length, 1, '闪保留');
});

test('仁王盾 vs 红杀: 不挡 — 照常开响应窗口', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'e-sha', suit: 'heart', color: 'red' })];
  game.player.hand = [c('shan', { id: 'p-shan' })];
  game.player.equipment.armor = c('renwang', { id: 'p-rw' });
  game.player.skillPreferences.shanResponse = 'ask';
  Engine.playCard(game, 'enemy', 'e-sha');
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'shan-response');
  Engine.resolvePendingChoice(game, { cardId: 'p-shan' });
  assert.equal(game.player.hp, game.player.maxHp, '红杀被闪化解');
});

// ───── 八卦: 先给发动机会, 失败才回手牌窗口 ─────────────────────────

test('八卦 vs 杀 (玩家 ask): 红判定先行 → 免出手牌, 不开窗', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.player.hand = [c('shan', { id: 'p-shan' })];
  game.player.equipment.armor = c('bagua', { id: 'p-bg' });
  game.player.skillPreferences.shanResponse = 'ask';
  game.deck = [redJudge()];
  const hp = game.player.hp;
  Engine.playCard(game, 'enemy', 'e-sha');
  assert.equal(game.pendingChoice, null, '判定成功视为已响应 → 不开窗');
  assert.equal(game.player.hp, hp);
  assert.equal(game.player.hand.length, 1, '闪保留');
});

test('八卦 vs 杀 (玩家 ask): 黑判定失败 → 回到手牌窗口; 放弃不补试八卦', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.player.hand = [c('shan', { id: 'p-shan' })];
  game.player.equipment.armor = c('bagua', { id: 'p-bg' });
  game.player.skillPreferences.shanResponse = 'ask';
  // deck.pop() 先取末位 → 黑判定先出 (八卦失败), 'would-be-red' 留在牌堆
  game.deck = [redJudge('would-be-red'), blackJudge()];
  const hp = game.player.hp;
  Engine.playCard(game, 'enemy', 'e-sha');
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'shan-response', '八卦失败 → 开窗');
  Engine.resolvePendingChoice(game, {});
  assert.equal(game.player.hp, hp - 1, '放弃出闪 → 命中 (八卦机会已用过, 不再判定)');
  assert.ok(game.deck.some((x) => x.id === 'would-be-red'), '第二张判定牌未被消耗');
});

test('八卦 vs 杀 (玩家 ask): 黑判定失败后仍可出真闪', () => {
  const game = buildGame();
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.player.hand = [c('shan', { id: 'p-shan' })];
  game.player.equipment.armor = c('bagua', { id: 'p-bg' });
  game.player.skillPreferences.shanResponse = 'ask';
  game.deck = [blackJudge()];
  Engine.playCard(game, 'enemy', 'e-sha');
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'shan-response');
  Engine.resolvePendingChoice(game, { cardId: 'p-shan' });
  assert.equal(game.player.hp, game.player.maxHp, '真闪化解');
});

test('无双杀 (玩家 ask) + 八卦: 首需求红判定顶掉 → 窗口 shanRemaining=1', () => {
  const game = buildGame({ enemyHero: 'lvbu' });
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  game.player.hand = [c('shan', { id: 'p-shan' })];
  game.player.equipment.armor = c('bagua', { id: 'p-bg' });
  game.player.skillPreferences.shanResponse = 'ask';
  // 第一需求判红 (八卦顶), 第二需求判黑 (失败 → 开窗)
  game.deck = [blackJudge(), redJudge()];
  Engine.playCard(game, 'enemy', 'e-sha');
  assert.equal(game.pendingChoice && game.pendingChoice.kind, 'shan-response');
  assert.equal(game.pauseState.shaResponse.shanRemaining, 1, '八卦顶掉一张需求');
  Engine.resolvePendingChoice(game, { cardId: 'p-shan' });
  assert.equal(game.player.hp, game.player.maxHp, '八卦 + 真闪 → 闪避');
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
