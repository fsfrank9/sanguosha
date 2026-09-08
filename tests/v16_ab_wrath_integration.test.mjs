import assert from 'node:assert/strict';
import { Engine, c, StateRuntime } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function setup(playerHero = 'god_lvbu', enemyHero = 'caocao', third = false) {
  const options = { seed: 920401, playerHero, enemyHero, godCamps: { player: '群', enemy: '魏', ally: '吴' } };
  if (third) Object.assign(options, { seats: ['player', 'enemy', 'ally'], allyHero: 'liubei',
    roles: { player: '忠臣', enemy: '主公', ally: '反贼' } });
  const game = Engine.newGame(options);
  for (const actor of Engine.seatList(game)) {
    game[actor].hand = []; game[actor].judgeArea = []; game[actor].flags = {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].skillPreferences = {}; game[actor].hp = game[actor].maxHp;
  }
  game.deck = Array.from({ length: 20 }, (_, i) => c('sha', { id: 'deck-' + i, suit: 'club' }));
  game.discard = []; game.log = []; game.pauseState = {}; game.pendingChoice = null; game.pendingChoiceQueue = [];
  game.turn = 'player'; game.phase = 'play';
  return game;
}
function answer(game, decision) {
  return Engine.resolvePendingChoice(game, { choiceId: game.pendingChoice.choiceId, ...decision });
}
function costs(game) {
  game.player.hand = ['spade', 'heart', 'club', 'diamond'].map((suit, i) => c('sha', { id: 'cost-' + i, suit }));
  return game.player.hand.map(card => card.id);
}

test('AB Engine：神吕布先选势力再发四牌，真开局狂暴给两标记', () => {
  const game = Engine.newGame({ seed: 920401, playerHero: 'god_lvbu', enemyHero: 'caocao' });
  assert.equal(game.pendingChoice.godChoiceType, 'faction');
  assert.equal(game.player.hand.length, 0); assert.equal(game.player.godMarks, undefined);
  assert.equal(answer(game, { optionId: '群' }).ok, true);
  assert.equal(game.player.hand.length, 4); assert.equal(game.player.godMarks.rage, 2);
  assert.equal(game.player.camp, '群'); assert.equal(game.phase, 'play');
});

test('AB Engine：无谋在无中效果前询问并先扣标记，再且仅摸两牌', () => {
  const game = setup(); game.player.hand = [c('wuzhong', { id: 'wuzhong' })];
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'wuzhong'));
  assert.equal(game.pendingChoice.godChoiceType, 'wumou');
  assert.equal(game.player.hand.length, 0); assert.equal(game.deck.length, 20);
  assertCardConservation(game, () => answer(game, { optionId: 'rage' }));
  assert.equal(game.player.godMarks.rage, 1); assert.equal(game.player.hand.length, 2);
  assert.equal(game.discard.filter(card => card.id === 'wuzhong').length, 1);
});

test('AB Engine：无谋不惩罚铁索重铸或延时锦囊的使用', () => {
  const game = setup(); game.player.hand = [c('tiesuo', { id: 'recast' }), c('lebusishu', { id: 'delay' })];
  const hp = game.player.hp; const rage = game.player.godMarks.rage;
  assert.equal(Engine.recastHandCard(game, 'player', 'recast').ok, true);
  assert.equal(Engine.playCard(game, 'player', 'delay', { target: 'enemy' }).ok, true);
  assert.equal(game.player.hp, hp); assert.equal(game.player.godMarks.rage, rage); assert.equal(game.pendingChoice, null);
});

test('AB Engine：无懈响应也触发无谋，在暴怒成本选择前不继续无懈链', () => {
  const game = setup(); game.turn = 'enemy';
  game.player.hand = [c('wuxie', { id: 'response' })];
  game.player.skillPreferences.wuxieResponse = 'ask';
  game.enemy.hand = [c('wuzhong', { id: 'enemy-trick' })];
  Engine.playCard(game, 'enemy', 'enemy-trick');
  assert.equal(game.pendingChoice.kind, 'wuxie-response');
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'response' }));
  assert.equal(game.pendingChoice.godChoiceType, 'wumou'); assert.equal(game.enemy.hand.length, 0);
  assertCardConservation(game, () => answer(game, { optionId: 'rage' }));
  assert.equal(game.player.godMarks.rage, 1); assert.equal(game.enemy.hand.length, 0);
  assert.equal(game.pauseState.responseFlows.length, 0);
});

test('AB Engine：无谋失体力救援可跨JSON恢复，无中只执行一次', () => {
  let game = setup(); game.player.hp = 1; game.player.skillPreferences.dying = 'ask';
  game.player.hand = [c('wuzhong', { id: 'trick' }), c('tao', { id: 'save' })];
  Engine.playCard(game, 'player', 'trick'); answer(game, { optionId: 'hp' });
  assert.equal(game.player.hp, 0); assert.equal(game.deck.length, 20);
  assert.equal(game.pendingChoice.kind, 'dying-rescue');
  game = JSON.parse(JSON.stringify(game));
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'save' }));
  assert.equal(game.player.hp, 1); assert.equal(game.player.hand.length, 2); assert.equal(game.deck.length, 18);
  assert.equal(game.player.godMarks.rage, 2); assert.equal(game.pendingChoice, null);
});

test('AB Engine：无谋濒死且真终局时无中效果取消，实体牌仍守恒', () => {
  const game = setup(); game.player.hp = 1; game.player.godMarks.rage = 0;
  game.player.hand = [c('wuzhong', { id: 'last-trick' })];
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'last-trick'));
  assert.equal(game.phase, 'gameover'); assert.equal(game.deck.length, 20);
  assert.equal(game.discard.filter(card => card.id === 'last-trick').length, 1);
});

test('AB Engine：无前无效八卦并给予无双，只有一张闪仍受伤', () => {
  const game = setup(); const hp = game.enemy.hp;
  game.player.hand = [c('sha', { id: 'attack' })];
  game.enemy.hand = [c('shan', { id: 'single-shan' })];
  game.enemy.equipment.armor = c('bagua', { id: 'armor' });
  assert.equal(Engine.useSkill(game, 'player', 'wuqian', [], { target: 'enemy' }).ok, true);
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'attack', { target: 'enemy' }));
  assert.equal(game.enemy.hp, hp - 1);
  assert.equal(game.log.some(line => line.includes('八卦阵') && line.includes('判定')), false);
  assert.equal(game.player.godMarks.rage, 1);
});

test('AB Engine：无前覆盖白银伤害上限，失去白银仍能回复体力', () => {
  const game = setup(); const hp = game.enemy.hp;
  game.player.hand = [c('fire_sha', { id: 'fire' })]; game.player.shaBonus = 1;
  game.enemy.equipment.armor = c('baiyin', { id: 'armor' });
  Engine.useSkill(game, 'player', 'wuqian', [], { target: 'enemy' });
  Engine.playCard(game, 'player', 'fire', { target: 'enemy' });
  assert.equal(game.enemy.hp, hp - 2);
  Engine.loseEquipment(game, 'enemy', 'armor');
  assert.equal(game.enemy.hp, hp - 1);
});

test('AB Engine：无前覆盖藤甲火伤加成，回合结束恢复防具和撤销派生无双', () => {
  const game = setup(); const hp = game.enemy.hp;
  game.player.hand = [c('fire_sha', { id: 'fire' })];
  game.enemy.equipment.armor = c('tengjia', { id: 'armor' });
  Engine.useSkill(game, 'player', 'wuqian', [], { target: 'enemy' });
  Engine.playCard(game, 'player', 'fire', { target: 'enemy' });
  assert.equal(game.enemy.hp, hp - 1);
  Engine.endTurn(game);
  assert.equal(StateRuntime.skillEnabled(game.player, 'wushuang'), false);
  assert.deepEqual(game.enemy.godArmorSuppressedBy, []);
  assert.equal(StateRuntime.hasEquipmentEffect(game.enemy, 'tengjiaImmuneNormalShaAOE'), true);
});

test('AB Engine：业炎逐次火伤正常触发铁索传导且守恒', () => {
  const game = setup('god_zhouyu', 'caocao', true); const ids = costs(game);
  game.enemy.hp = 5; game.ally.hp = 5; game.enemy.chained = true; game.ally.chained = true;
  assertCardConservation(game, () => Engine.useSkill(game, 'player', 'yeyan', ids, { allocations: [{ actor: 'enemy', amount: 2 }] }));
  assert.equal(game.player.hp, 1); assert.equal(game.enemy.hp, 3); assert.equal(game.ally.hp, 3);
  assert.equal(game.enemy.chained, false); assert.equal(game.ally.chained, false);
});

test('AB Engine：业炎付成本死亡后游戏继续，锁定火伤依然结算', () => {
  const game = setup('god_zhouyu', 'caocao', true); const ids = costs(game);
  game.player.hp = 1; game.enemy.hp = 5;
  assertCardConservation(game, () => Engine.useSkill(game, 'player', 'yeyan', ids, { allocations: [{ actor: 'enemy', amount: 3 }] }));
  assert.notEqual(game.phase, 'gameover'); assert.ok(game.player.hp <= 0); assert.equal(game.enemy.hp, 2);
  assert.equal(game.log.some(line => line.includes('业炎') && line.includes('3 点伤害')), true);
});

test('AB Engine：琴音弃牌后可选择回复，并在选择完成后才进入结束阶段', () => {
  const game = setup('god_zhouyu'); game.player.hp = 2; game.enemy.hp = 2;
  game.player.hand = ['a', 'b', 'c', 'd'].map(id => c('sha', { id }));
  Engine.finishPlayPhase(game); Engine.discardSelected(game, 'player', ['a', 'b']);
  Engine.advancePhase(game);
  assert.equal(game.pendingChoice.godChoiceType, 'qinyin'); assert.equal(game.phase, 'discard');
  assertCardConservation(game, () => answer(game, { optionId: 'recover' }));
  assert.equal(game.player.hp, 3); assert.equal(game.enemy.hp, 3); assert.equal(game.phase, 'finish');
});

test('AB Engine：神愤弃装备触发枭姬新摸的手牌也参与随后的弃四牌', () => {
  const game = setup('god_lvbu', 'sunshangxiang'); game.player.godMarks.rage = 6;
  game.enemy.hand = [c('sha', { id: 'held' })];
  game.enemy.equipment.weapon = c('qinggang', { id: 'weapon' });
  game.enemy.equipment.armor = c('baiyin', { id: 'armor' });
  assertCardConservation(game, () => Engine.useSkill(game, 'player', 'shenfen'));
  assert.equal(game.enemy.hand.length, 1); assert.equal(game.enemy.equipment.weapon, null); assert.equal(game.enemy.equipment.armor, null);
  assert.equal(game.deck.length, 16); assert.equal(game.player.turnedOver, true);
});

test('AB AI：武神红桃桃/闪按杀估计评分，不保留为救命桃', () => {
  const game = setup('god_guanyu'); game.player.hp = 1;
  game.player.hand = [c('tao', { id: 'heart-tao', suit: 'heart' }), c('shan', { id: 'heart-shan', suit: 'heart' }), c('shan', { id: 'club-shan', suit: 'club' })];
  assert.equal(Engine.aiEstimateShaCount(game.player), 2);
  assert.equal(Engine.aiEstimateShanCount(game.player), 1);
  assert.equal(Engine.aiEstimateTaoCountFor(game, 'player', 'player'), 0);
  const choice = Engine.aiChooseCard(game, 'player');
  assert.equal(choice.card.type, 'sha');
  assert.equal(game.player.hand.find(card => card.id === 'heart-tao').type, 'tao');
});

test('AB AI：龙魂同花色束计入装备且不重复计算原生闪/杀', () => {
  const game = setup('god_zhaoyun'); game.player.hp = 2;
  game.player.hand = [c('shan', { id: 'native', suit: 'club' }), c('sha', { id: 'club-sha', suit: 'club' }),
    c('tao', { id: 'club-tao', suit: 'club' }), c('fire_sha', { id: 'native-fire', suit: 'diamond' }), c('shan', { id: 'diamond-shan', suit: 'diamond' })];
  game.player.equipment.weapon = c('qinggang', { id: 'weapon', suit: 'diamond' });
  assert.equal(Engine.aiEstimateShanCount(game.player), 3, '两张原生闪，另两梅花当一闪');
  assert.equal(Engine.aiEstimateShaCount(game.player), 3, '两张原生杀，方片手牌+装备当一火杀');
  game.player.hp = 1;
  assert.equal(Engine.aiEstimateShanCount(game.player), 4);
});

test('AB AI：神将对手未知手牌与牌堆互换，估计不泄漏实际持牌', () => {
  const game = setup('caocao', 'god_guanyu');
  game.player.hand = []; game.enemy.hand = [c('shan', { id: 'unseen-a', suit: 'heart' })];
  game.deck = [c('sha', { id: 'unseen-b', suit: 'spade' }), c('tao', { id: 'unseen-c', suit: 'heart' })];
  const before = ['sha', 'shan', 'tao'].map(type => Engine.aiFoeEstimate(game, 'player', 'enemy', type));
  [game.enemy.hand[0], game.deck[0]] = [game.deck[0], game.enemy.hand[0]];
  const after = ['sha', 'shan', 'tao'].map(type => Engine.aiFoeEstimate(game, 'player', 'enemy', type));
  assert.deepEqual(after, before); assert.equal(before[0], 1); assert.equal(before[1], 0); assert.equal(before[2], 0);
});

test('AB AI：神周瑜真实行动入口可发动业炎，神吕布入口可发动神愤', () => {
  const zhou = setup('god_zhouyu');
  assert.equal(Engine.aiTakeAction(zhou, 'player').action, 'god-skill'); assert.equal(zhou.player.flags.yeyanUsed, true);
  const lvbu = setup(); lvbu.player.godMarks.rage = 6;
  assert.equal(Engine.aiTakeAction(lvbu, 'player').action, 'god-skill'); assert.equal(lvbu.player.flags.shenfenUsed, true);
});

test('AB AI：火攻没有感知敌对目标时不把已阵亡的固定对手当作目标', () => {
  const game = setup('god_simayi', 'god_zhouyu', true);
  game.roles = { player: '主公', enemy: '反贼', ally: '忠臣' };
  game.enemy.hp = 0; game.ally.hand = [c('shan', { id: 'friend-hand' })];
  StateRuntime.grantSkill(game.player, 'jilue', '极略');
  game.player.hand = [c('huogong', { id: 'fire-attack' })];
  assert.deepEqual(Engine.legalTargetsForCard(game, 'player', game.player.hand[0]), ['ally']);
  assert.equal(Engine.aiChooseCard(game, 'player'), null);
  const result = Engine.aiTakeAction(game, 'player');
  assert.equal(result.ok, true); assert.equal(result.action, 'none');
  assert.equal(game.player.hand[0].id, 'fire-attack');
});

const result = await runTests();
console.log(`${result.passed}/${result.total} AB 神周瑜 / 神吕布完整引擎及AI测试通过。`);
