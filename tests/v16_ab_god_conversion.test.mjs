import assert from 'node:assert/strict';
import { Engine, c, StateRuntime } from './helpers/load-engine.mjs';
import { longhunResponseOptions, parseLonghunChoice } from '../src/engine/god-conversion.js';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function fresh(playerHero = 'god_zhaoyun', enemyHero = 'liubei', extra = {}) {
  const game = Engine.newGame({ seed: 90871, playerHero, enemyHero,
    godCamps: { player: '蜀', enemy: '魏', ally: '吴', ally2: '群', ally3: '魏' }, ...extra });
  for (const actor of game.seats || ['player', 'enemy']) {
    game[actor].hand = [];
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].judgeArea = [];
    game[actor].flags = {};
    game[actor].skillPreferences = { dying: 'auto', shan: 'auto', wuxie: 'decline' };
  }
  game.deck = [];
  game.discard = [];
  game.log = [];
  game.pauseState = {};
  game.pendingChoice = null;
  game.pendingChoiceQueue = [];
  game.phase = 'play';
  game.turn = 'player';
  return game;
}
const pair = (suit, prefix = suit) => [c('sha', { id: prefix + '-a', suit }), c('shan', { id: prefix + '-b', suit })];

test('AB 武神：红桃非基本手牌显示为杀，实体牌面与装备区不变', () => {
  const game = fresh('god_guanyu');
  const heart = c('qinglong', { id: 'heart-weapon', suit: 'heart' });
  game.player.hand = [heart];
  const view = StateRuntime.effectiveCardView(game.player, heart);
  assert.equal(view.type, 'sha');
  assert.equal(view.family, 'basic');
  assert.equal(view.physicalCard, heart);
  assert.equal(StateRuntime.effectiveCardView(game.player, view), view, 'view is idempotent');
  assert.equal(heart.type, 'qinglong');
  game.player.hand = [];
  game.player.equipment.weapon = heart;
  assert.equal(StateRuntime.effectiveCardView(game.player, heart), heart);
});

test('AB 武神：红桃桃只能作为杀使用，离区后仍是桃', () => {
  const game = fresh('god_guanyu');
  game.player.hp = 3;
  game.player.hand = [c('tao', { id: 'heart-tao', suit: 'heart' })];
  assertCardConservation(game, () => assert.equal(Engine.playCard(game, 'player', 'heart-tao', { target: 'enemy' }).ok, true));
  assert.equal(game.player.hp, 3);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
  assert.equal(game.discard.find(card => card.id === 'heart-tao').type, 'tao');
});

test('AB 武神：红桃闪不能继续作为闪响应', () => {
  const game = fresh('god_guanyu');
  game.turn = 'enemy';
  game.player.hand = [c('shan', { id: 'heart-shan', suit: 'heart' })];
  game.enemy.hand = [c('sha', { id: 'attack' })];
  Engine.playCard(game, 'enemy', 'attack', { target: 'player' });
  assert.equal(game.player.hp, game.player.maxHp - 1);
  assert.ok(game.player.hand.some(card => card.id === 'heart-shan'));
});

test('AB 武神：无限距离只适用于有红桃花色的杀，不改变攻击范围', () => {
  const game = fresh('god_guanyu', 'liubei', { seats: ['player', 'enemy', 'ally', 'ally2'] });
  assert.equal(StateRuntime.canReachWithSha(game, 'player', 'ally'), false);
  assert.equal(StateRuntime.shaUseReachAllowed(game, 'player', 'ally', c('sha', { suit: 'heart' })), true);
  assert.equal(StateRuntime.shaUseReachAllowed(game, 'player', 'ally', { type: 'sha', suit: null, color: 'red', virtual: true }), false);
  game.player.hand = [c('wuzhong', { id: 'long-range-heart', suit: 'heart' })];
  assert.equal(Engine.playCard(game, 'player', 'long-range-heart', { target: 'ally' }).ok, true);
  assert.equal(game.ally.hp, game.ally.maxHp - 1);
});

test('AB 绝境：满血仍加2手牌上限，受伤摸牌按已损失体力增加', () => {
  const game = fresh();
  assert.equal(StateRuntime.handLimit(game, 'player'), 4);
  game.player.hp = 1;
  assert.equal(StateRuntime.handLimit(game, 'player'), 3);
  game.deck = Array.from({ length: 8 }, (_, i) => c('shan', { id: 'draw-' + i }));
  Engine.startTurn(game, 'player');
  assert.equal(game.player.hand.length, 3);
});

test('AB 绝境：技能被缠怨禁用时摸牌和上限均移除', () => {
  const game = fresh();
  game.player.hp = 1;
  StateRuntime.grantSkill(game.player, 'chanyuan', '缠怨');
  assert.equal(StateRuntime.handLimit(game, 'player'), 1);
  assert.deepEqual(longhunResponseOptions(game.player, 'sha'), []);
});

test('AB 龙魂：响应候选聚合全部同花色手牌和装备，X=当前HP', () => {
  const game = fresh();
  game.player.hand = pair('club');
  game.player.equipment.armor = c('baiyin', { id: 'club-armor', suit: 'club' });
  const [option] = longhunResponseOptions(game.player, 'shan');
  assert.equal(option.requiredCount, 2);
  assert.equal(option.candidateCards.length, 3);
  assert.deepEqual(parseLonghunChoice(option.cardId), option.cardIds);
  assert.deepEqual(parseLonghunChoice('longhun:bad'), []);
});

test('AB 龙魂：两张方片当火杀，材料保留原身份且仅消耗一次', () => {
  const game = fresh();
  game.player.hand = pair('diamond');
  game.enemy.equipment.armor = c('tengjia', { id: 'tengjia' });
  assertCardConservation(game, () => assert.equal(Engine.useSkill(game, 'player', 'longhun', game.player.hand.map(card => card.id), { target: 'enemy' }).ok, true));
  assert.equal(game.enemy.hp, game.enemy.maxHp - 2, '火杀受到藤甲加伤');
  assert.equal(game.player.hand.length, 0);
  assert.equal(game.discard.filter(card => card.id.startsWith('diamond')).length, 2);
  assert.equal(game.discard.find(card => card.id === 'diamond-b').type, 'shan');
});

test('AB 龙魂：重复、数量不足、花色不同均在付费前拒绝', () => {
  const game = fresh();
  game.player.hand = [c('sha', { id: 'a', suit: 'diamond' }), c('sha', { id: 'b', suit: 'heart' })];
  for (const ids of [['a'], ['a', 'a'], ['a', 'b']]) {
    assertCardConservation(game, () => assert.equal(Engine.useSkill(game, 'player', 'longhun', ids, { target: 'enemy' }).ok, false));
    assert.equal(game.player.hand.length, 2);
  }
});

test('AB 龙魂：手牌加装备同花色原子付费，白银失去回血只一次', () => {
  const game = fresh();
  game.player.maxHp = 3;
  game.player.hand = [c('sha', { id: 'diamond-cost', suit: 'diamond' })];
  game.player.equipment.armor = c('baiyin', { id: 'diamond-lion', suit: 'diamond' });
  assertCardConservation(game, () => assert.equal(Engine.useSkill(game, 'player', 'longhun', ['diamond-cost', 'diamond-lion'], { target: 'enemy' }).ok, true));
  assert.equal(game.player.hp, 3);
  assert.equal(game.player.equipment.armor, null);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
});

test('AB 龙魂：主动红桃为桃，回复自己且同回合不占杀次数', () => {
  const game = fresh();
  game.player.hp = 1;
  game.player.hand = [c('wuzhong', { id: 'heart-heal', suit: 'heart' })];
  assertCardConservation(game, () => assert.equal(Engine.useSkill(game, 'player', 'longhun', ['heart-heal']).ok, true));
  assert.equal(game.player.hp, 2);
  assert.equal(!!game.player.usedSha, false);
});

test('AB 龙魂：梅花多牌响应一次闪，不误当两张闪', () => {
  const game = fresh('god_zhaoyun', 'lvbu');
  game.turn = 'enemy';
  game.player.hand = [c('tao', { id: 'club-a', suit: 'club' }), c('jiu', { id: 'club-b', suit: 'club' })];
  game.enemy.hand = [c('sha', { id: 'lvbu-sha' })];
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'lvbu-sha'));
  assert.equal(game.player.hp, 1, '双闪只付出一个龙魂响应，仍受到伤害');
  assert.equal(game.player.hand.length, 0);
});

test('AB 龙魂：无双双闪每次重新取X，一共消耗四张材料', () => {
  const game = fresh('god_zhaoyun', 'lvbu');
  game.turn = 'enemy';
  game.player.hand = Array.from({ length: 4 }, (_, i) => c('tao', { id: 'club-' + i, suit: 'club' }));
  game.enemy.hand = [c('sha', { id: 'lvbu-sha' })];
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'lvbu-sha'));
  assert.equal(game.player.hp, 2);
  assert.equal(game.player.hand.length, 0);
});

test('AB 龙魂：装备白银当闪，青釭不禁止使用者自己失去装备回血', () => {
  const game = fresh();
  game.turn = 'enemy';
  game.player.hp = 1;
  game.player.equipment.armor = c('baiyin', { id: 'club-lion', suit: 'club' });
  game.enemy.equipment.weapon = c('qinggang', { id: 'qinggang' });
  game.enemy.hand = [c('sha', { id: 'qinggang-sha' })];
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'qinggang-sha'));
  assert.equal(game.player.hp, 2);
  assert.equal(game.player.equipment.armor, null);
});

test('AB 龙魂：南蛮打出两张方片组成的一张杀', () => {
  const game = fresh();
  game.turn = 'enemy';
  game.player.hand = [c('tao', { id: 'diamond-a', suit: 'diamond' }), c('jiu', { id: 'diamond-b', suit: 'diamond' })];
  game.enemy.hand = [c('nanman', { id: 'nanman' })];
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'nanman'));
  assert.equal(game.player.hp, 2);
  assert.equal(game.player.hand.length, 0);
});

test('AB 龙魂：黑桃多材料可用于无懈链，并触发一次使用锦囊', () => {
  const game = fresh();
  game.turn = 'enemy';
  game.player.skillPreferences.wuxie = 'auto';
  game.player.hand = [c('tao', { id: 'spade-a', suit: 'spade' }), c('jiu', { id: 'spade-b', suit: 'spade' })];
  game.enemy.hand = [c('guohe', { id: 'guohe' })];
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'guohe'));
  assert.equal(game.discard.filter(card => card.id.startsWith('spade')).length, 2);
  assert.ok(game.log.some(line => line.includes('龙魂') && line.includes('无懈')));
});

test('AB 龙魂：濒死时X至少为1，红桃非桃牌可自救', () => {
  const game = fresh('liubei', 'god_zhaoyun');
  game.enemy.hp = 1;
  game.enemy.hand = [c('wuzhong', { id: 'heart-rescue', suit: 'heart' })];
  game.player.hand = [c('sha', { id: 'lethal' })];
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'lethal'));
  assert.equal(game.enemy.hp, 1);
  assert.notEqual(game.phase, 'gameover');
  assert.ok(game.discard.some(card => card.id === 'heart-rescue'));
});

test('AB 龙魂：方天最后两张手牌允许三个目标', () => {
  const game = fresh('god_zhaoyun', 'liubei', { seats: ['player', 'enemy', 'ally', 'ally2'] });
  game.player.hand = pair('diamond');
  game.player.equipment.weapon = c('fangtian', { id: 'fangtian' });
  assertCardConservation(game, () => assert.equal(Engine.useSkill(game, 'player', 'longhun', ['diamond-a', 'diamond-b'], { targets: ['enemy', 'ally', 'ally2'] }).ok, true));
  for (const actor of ['enemy', 'ally', 'ally2']) assert.equal(game[actor].hp, game[actor].maxHp - 1);
});

test('AB 龙魂：手牌加装备不能冒充方天最后手牌，非法目标不花成本', () => {
  const game = fresh('god_zhaoyun', 'liubei', { seats: ['player', 'enemy', 'ally', 'ally2'] });
  game.player.hand = [c('sha', { id: 'diamond-hand', suit: 'diamond' })];
  game.player.equipment.weapon = c('fangtian', { id: 'fangtian' });
  game.player.equipment.armor = c('baiyin', { id: 'diamond-equip', suit: 'diamond' });
  assert.equal(Engine.useSkill(game, 'player', 'longhun', ['diamond-hand', 'diamond-equip'], { targets: ['enemy', 'ally'] }).ok, false);
  assert.equal(game.player.hand.length, 1);
  assert.ok(game.player.equipment.armor);
});

test('AB 龙魂：材料武器离开后射程不足，声明在成本之前失败', () => {
  const game = fresh('god_zhaoyun', 'liubei', { seats: ['player', 'enemy', 'ally', 'ally2'] });
  game.player.hand = [c('sha', { id: 'diamond-hand', suit: 'diamond' })];
  game.player.equipment.weapon = c('qinglong', { id: 'diamond-weapon', suit: 'diamond' });
  assert.equal(Engine.useSkill(game, 'player', 'longhun', ['diamond-hand', 'diamond-weapon'], { target: 'ally' }).ok, false);
  assert.equal(game.player.hand.length, 1);
  assert.ok(game.player.equipment.weapon);
});

function withJilue(game, nin = 2) {
  StateRuntime.grantSkill(game.player, 'jilue', '极略');
  game.player.godMarks = { nin };
  game.player.skillPreferences.jilue = 'ask';
  return game;
}

test('AB 极略鬼才：八卦杀判定真正挂起，付忍改红后续算一次闪', () => {
  const game = withJilue(fresh('liubei'));
  game.turn = 'enemy';
  game.player.hand = [c('tao', { id: 'replace-red', suit: 'heart' })];
  game.player.equipment.armor = c('bagua', { id: 'bagua' });
  game.enemy.hand = [c('sha', { id: 'attack' })];
  game.deck = [c('sha', { id: 'black-judge', suit: 'spade' })];
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'attack'));
  assert.equal(game.pendingChoice.kind, 'guicai-replace');
  assert.equal(game.player.hp, game.player.maxHp);
  assert.equal(game.player.godMarks.nin, 2);
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'replace-red' }));
  assert.equal(game.player.godMarks.nin, 1);
  assert.equal(game.player.hp, game.player.maxHp);
  assert.equal(game.pendingChoice, null);
  assert.equal(game.log.filter(line => line.includes('进行【八卦阵】判定')).length, 1);
});

test('AB 极略鬼才：八卦万箭判定挂起后正确消费结果，不二次判定或多受伤', () => {
  const game = withJilue(fresh('liubei'));
  game.turn = 'enemy';
  game.player.hand = [c('tao', { id: 'replace-red', suit: 'heart' })];
  game.player.equipment.armor = c('bagua', { id: 'bagua' });
  game.enemy.hand = [c('wanjian', { id: 'aoe' })];
  game.deck = [c('sha', { id: 'black-judge', suit: 'spade' })];
  assertCardConservation(game, () => Engine.playCard(game, 'enemy', 'aoe'));
  assert.equal(game.pendingChoice.kind, 'guicai-replace');
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'replace-red' }));
  assert.equal(game.player.hp, game.player.maxHp);
  assert.equal(game.pendingChoice, null);
  assert.equal(game.log.filter(line => line.includes('进行【八卦阵】判定')).length, 1);
});

test('AB 极略鬼才：铁骑红判在单目标杀响应前完成，改红后锁闪', () => {
  const game = withJilue(fresh('machao'));
  game.player.hand = [c('sha', { id: 'attack' }), c('tao', { id: 'replace-red', suit: 'heart' })];
  game.enemy.hand = [c('shan', { id: 'defense' })];
  game.deck = [c('sha', { id: 'black-judge' })];
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'attack'));
  assert.equal(game.pendingChoice.kind, 'guicai-replace');
  assert.equal(game.enemy.hp, game.enemy.maxHp);
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'replace-red' }));
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
  assert.ok(game.enemy.hand.some(card => card.id === 'defense'));
  assert.equal(game.log.filter(line => line.includes('进行【铁骑】判定')).length, 1);
});

test('AB 武魂：受伤后按实际伤害增加来源梦魇', () => {
  const game = fresh('liubei', 'god_guanyu');
  game.player.hand = [c('sha', { id: 'hit' })];
  game.player.shaBonus = 1;
  Engine.playCard(game, 'player', 'hit');
  assert.equal(game.player.nightmare, 2);
});

test('AB 武魂：非终局死亡先判定并直接杀死目标，不产生普通击杀奖惩', () => {
  const game = fresh('liubei', 'god_guanyu', {
    seats: ['player', 'enemy', 'ally', 'ally2', 'ally3'],
    allyHero: 'zhangfei', ally2Hero: 'guanyu', ally3Hero: 'zhaoyun',
    roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '反贼', ally3: '内奸' }
  });
  game.enemy.hp = 1;
  game.ally.nightmare = 2;
  game.player.hand = [c('sha', { id: 'lethal' }), c('shan', { id: 'keep-card' })];
  game.deck = [c('sha', { id: 'reward-1' }), c('sha', { id: 'reward-2' }), c('sha', { id: 'reward-3' }), c('sha', { id: 'wuhun-bad' })];
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'lethal'));
  assert.equal(game.ally.hp, 0);
  assert.equal(game.player.nightmare || 0, 0, '致死伤害后不再添加梦魇');
  assert.ok(game.player.hand.some(card => card.id === 'keep-card'), '武魂没有普通杀人来源，主公不因其惩罚');
  assert.equal(game.player.hand.length, 4, '只有实际击杀神关羽的反贼奖励');
  assert.ok(!game.log.some(line => line.includes('误杀忠臣')));
});

test('AB 武魂：桃判定保留被选目标且判断牌只入弃牌堆一次', () => {
  const game = fresh('liubei', 'god_guanyu', {
    seats: ['player', 'enemy', 'ally', 'ally2'], allyHero: 'zhangfei', ally2Hero: 'guanyu',
    roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '反贼' }
  });
  game.enemy.hp = 1;
  game.ally.nightmare = 2;
  game.player.hand = [c('sha', { id: 'lethal' })];
  game.deck = [c('sha', { id: 'reward-1' }), c('sha', { id: 'reward-2' }), c('sha', { id: 'reward-3' }), c('tao', { id: 'wuhun-good', suit: 'heart' })];
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'lethal'));
  assert.equal(game.ally.hp, game.ally.maxHp);
  assert.equal(game.discard.filter(card => card.id === 'wuhun-good').length, 1);
});

test('AB 龙魂：询问可取消，非法多牌选择保留当前窗口', () => {
  const game = fresh();
  game.player.hand = pair('diamond');
  Engine.useSkill(game, 'player', 'longhun');
  const pending = game.pendingChoice;
  assert.equal(pending.godChoiceType, 'longhun-use');
  assert.equal(Engine.resolvePendingChoice(game, { choiceId: pending.choiceId, optionId: 'use', cardIds: ['diamond-a'] }).ok, false);
  assert.equal(game.pendingChoice.choiceId, pending.choiceId);
  assert.equal(Engine.resolvePendingChoice(game, { choiceId: pending.choiceId, decline: true }).ok, true);
  assert.equal(game.pendingChoice, null);
  assert.equal(game.player.hand.length, 2);
});

test('AB 极略鬼才：多目标铁骑先完成两次判定，再分别执行锁闪', () => {
  const game = withJilue(fresh('machao', 'liubei', { seats: ['player', 'enemy', 'ally'], allyHero: 'zhangfei' }));
  game.player.flags.tianyiWon = true;
  game.player.hand = [c('sha', { id: 'attack' }), c('tao', { id: 'red-1', suit: 'heart' }), c('tao', { id: 'red-2', suit: 'heart' })];
  game.enemy.hand = [c('shan', { id: 'defense-1' })];
  game.ally.hand = [c('shan', { id: 'defense-2' })];
  game.deck = [c('sha', { id: 'black-1' }), c('sha', { id: 'black-2' })];
  Engine.playCard(game, 'player', 'attack', { targets: ['enemy', 'ally'] });
  assert.equal(game.pendingChoice.kind, 'guicai-replace');
  Engine.resolvePendingChoice(game, { cardId: 'red-1' });
  assert.equal(game.pendingChoice.kind, 'guicai-replace');
  assert.equal(game.enemy.hp, game.enemy.maxHp, '不能在后续目标铁骑判定之前结算杀');
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'red-2' }));
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
  assert.equal(game.ally.hp, game.ally.maxHp - 1);
  assert.equal(game.enemy.hand.length, 1);
  assert.equal(game.ally.hand.length, 1);
  assert.equal(game.log.filter(line => line.includes('进行【铁骑】判定')).length, 2);
});

test('AB 极略鬼才：银月枪内八卦改判挂起后回到外层杀，牌守恒', () => {
  const game = withJilue(fresh('liubei'));
  game.player.hand = [c('sha', { id: 'attack' }), c('tao', { id: 'red-replace', suit: 'heart' })];
  game.player.equipment.armor = c('bagua', { id: 'bagua' });
  game.enemy.hand = [c('shan', { id: 'black-shan', suit: 'club' })];
  game.enemy.equipment.weapon = c('yinyue', { id: 'yinyue' });
  game.deck = [c('sha', { id: 'black-judge' })];
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'attack'));
  assert.equal(game.pendingChoice.kind, 'guicai-replace');
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'red-replace' }));
  assert.equal(game.player.hp, game.player.maxHp);
  assert.equal(game.enemy.hp, game.enemy.maxHp);
  assert.equal(game.pendingChoice, null);
  assert.equal((game.pauseState.responseFlows || []).length, 0);
});

test('AB 龙魂：响应时由玩家选择任意合法组合，JSON恢复仍逐ID消费', () => {
  let game = fresh();
  game.turn = 'enemy';
  game.player.skillPreferences.shanResponse = 'ask';
  game.player.hand = Array.from({ length: 4 }, (_, i) => c('tao', { id: 'club-' + i, suit: 'club' }));
  game.enemy.hand = [c('sha', { id: 'attack' })];
  Engine.playCard(game, 'enemy', 'attack');
  assert.equal(game.pendingChoice.kind, 'shan-response');
  game = JSON.parse(JSON.stringify(game));
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'longhun:' + JSON.stringify(['club-2', 'club-3']) }));
  assert.equal(game.player.hp, 2);
  assert.deepEqual(game.player.hand.map(card => card.id), ['club-0', 'club-1']);
});

test('AB 龙魂：借刀驱使使用火杀，完整材料由处理区保留至结束', () => {
  const game = fresh('liubei', 'god_zhaoyun');
  game.player.hand = [c('jiedao', { id: 'jiedao' })];
  game.player.equipment.armor = c('tengjia', { id: 'tengjia' });
  game.enemy.hand = [c('tao', { id: 'diamond-a', suit: 'diamond' }), c('jiu', { id: 'diamond-b', suit: 'diamond' })];
  game.enemy.equipment.weapon = c('qinglong', { id: 'qinglong' });
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'jiedao', { target: 'enemy', victim: 'player' }));
  assert.equal(game.player.hp, game.player.maxHp - 2);
  assert.equal(game.enemy.hand.length, 0);
  assert.ok(game.enemy.equipment.weapon);
});

test('AB 龙魂：挑衅允许玩家用完整方片组合出火杀', () => {
  const game = fresh('god_zhaoyun', 'jiangwei');
  game.turn = 'enemy';
  game.player.hand = [c('tao', { id: 'diamond-a', suit: 'diamond' }), c('jiu', { id: 'diamond-b', suit: 'diamond' })];
  Engine.useSkill(game, 'enemy', 'tiaoxin', [], { target: 'player' });
  assert.equal(game.pendingChoice.kind, 'tiaoxin-demand');
  assert.ok(game.pendingChoice.options.some(option => option.via === '龙魂'));
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'longhun:' + JSON.stringify(['diamond-a', 'diamond-b']) }));
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
  assert.equal(game.player.hand.length, 0);
});

test('AB 武神：红桃装备手牌可以作为享乐要求弃置的基本牌', () => {
  const game = fresh('god_guanyu', 'liushan');
  game.player.hand = [c('sha', { id: 'attack' }), c('qinglong', { id: 'heart-equip-cost', suit: 'heart' })];
  Engine.playCard(game, 'player', 'attack');
  assert.equal(game.pendingChoice.kind, 'xiangle-cost');
  assert.ok(game.pendingChoice.options.some(option => option.cardId === 'heart-equip-cost'));
  assertCardConservation(game, () => Engine.resolvePendingChoice(game, { cardId: 'heart-equip-cost' }));
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
  assert.equal(game.discard.find(card => card.id === 'heart-equip-cost').type, 'qinglong');
});

test('AB 龙魂：青龙续杀可使用两张方片，保持火杀性质与物理材料', () => {
  const game = fresh();
  game.player.hand = [c('sha', { id: 'attack' }), c('tao', { id: 'diamond-a', suit: 'diamond' }), c('jiu', { id: 'diamond-b', suit: 'diamond' })];
  game.player.equipment.weapon = c('qinglong', { id: 'qinglong' });
  game.enemy.hand = [c('shan', { id: 'defense' })];
  assertCardConservation(game, () => Engine.playCard(game, 'player', 'attack'));
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
  assert.equal(game.player.hand.length, 0);
  assert.equal(game.discard.filter(card => card.id.startsWith('diamond-')).length, 2);
  assert.ok(game.log.some(line => line.includes('龙魂') && line.includes('火杀')));
});

runTests();
