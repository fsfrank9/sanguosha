// Independent Z review: a saved healing card must survive the coming discard stage.
import assert from 'node:assert/strict';
import { Engine, c } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function yongsiGame() {
  const game = Engine.newGame({ seed: 92901, playerHero: 'caocao', enemyHero: 'sp_yuanshu',
    seats: ['player', 'enemy', 'ally'], allyHero: 'guanyu',
    roles: { player: '主公', enemy: '反贼', ally: '忠臣' } });
  game.turn = 'enemy'; game.phase = 'play'; game.log = []; game.discard = [];
  game.pendingChoice = null; game.pendingChoiceQueue = []; game.pauseState = {};
  for (const seat of game.seats) {
    game[seat].hand = []; game[seat].flags = {}; game[seat].skillPreferences = {};
    game[seat].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
  }
  game.enemy.hp = 3; game.enemy.maxHp = 4;
  game.enemy.hand = [c('tao', { id: 'review-last-tao' })];
  return game;
}

test('Z review: 庸肆即将强制弃光全部牌时，AI 先用最后一桃回血', () => {
  const game = yongsiGame();
  const result = assertCardConservation(game, () => Engine.aiTakeAction(game, 'enemy'));
  assert.equal(result.cardId, 'review-last-tao');
  assert.equal(game.enemy.hp, 4, '不能为了保留救援桃而让庸肆直接弃掉它');
  assertCardConservation(game, () => Engine.finishPlayPhase(game));
  assert.equal(game.enemy.hp, 4);
  assert.equal(game.enemy.hand.length, 0);
});

test('Z review: 足够其他装备支付庸肆时，最后一桃仍可保留救援', () => {
  const game = yongsiGame();
  game.enemy.equipment.weapon = c('zhuge', { id: 'review-weapon' });
  game.enemy.equipment.armor = c('bagua', { id: 'review-armor' });
  game.enemy.equipment.horsePlus = c('plus_horse', { id: 'review-horse' });
  assert.equal(Engine.aiChooseCard(game, 'enemy'), null);
  assert.equal(game.enemy.hp, 3);
  assertCardConservation(game, () => Engine.finishPlayPhase(game));
  assert.equal(game.enemy.hand.length, 1, '庸肆弃牌应保留仍可留下的救援桃');
  assert.equal(game.enemy.hand[0].id, 'review-last-tao');
});

test('Z review: 拼点扣置触发连营先于亮牌，摸到的桃能救援驱虎主公且弃拼点牌不重复触发', () => {
  const game = Engine.newGame({ seed: 92902, playerHero: 'xunyu', enemyHero: 'luxun',
    seats: ['player', 'enemy', 'ally'], allyHero: 'caocao',
    roles: { player: '主公', enemy: '忠臣', ally: '反贼' } });
  game.turn = 'player'; game.phase = 'play'; game.log = []; game.discard = [];
  game.pendingChoice = null; game.pendingChoiceQueue = []; game.pauseState = {};
  for (const seat of game.seats) {
    game[seat].hand = []; game[seat].flags = {};
    game[seat].skillPreferences = { jieming: 'decline', jianxiong: 'decline' };
    game[seat].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
  }
  game.player.hp = 1;
  game.player.hand = [c('sha', { id: 'review-pd-high', rank: 'K' })];
  game.enemy.hand = [c('sha', { id: 'review-pd-low', rank: '2' })];
  game.deck = [c('shan', { id: 'review-after-rescue' }), c('tao', { id: 'review-before-reveal' })];
  assertCardConservation(game, () => Engine.useSkill(game, 'player', 'quhu', [], { target: 'enemy' }));
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'review-pd-high' }));
  assert.equal(game.pendingChoice.kind, 'quhu-victim');
  assert.deepEqual(game.enemy.hand.map(card => card.id), ['review-before-reveal']);
  const lianying = game.log.findIndex(line => line.includes('发动【连营】'));
  const reveal = game.log.findIndex(line => line.includes('亮出【'));
  assert.ok(lianying >= 0 && lianying < reveal, '先结算失牌触发，再亮出拼点牌');
  assert.equal(game.discard.length, 0, '驱虎后效果尚未完成，拼点牌仍在处理区');
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { victim: 'player' }));
  assert.equal(game.player.hp, 1, '陆逊用亮牌前摸到的桃救回主公');
  assert.notEqual(game.phase, 'gameover');
  assert.deepEqual(game.enemy.hand.map(card => card.id), ['review-after-rescue']);
  assert.equal(game.log.filter(line => line.includes('发动【连营】')).length, 2,
    '拼点失牌与桃救援各触发一次；拼点牌最终弃置不重复触发');
  assert.equal(game.pauseState.pindianCards, null);
});

await runTests();
