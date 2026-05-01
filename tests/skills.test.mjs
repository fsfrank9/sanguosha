import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const htmlPath = path.resolve(import.meta.dirname, '../index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script id="game-engine"[^>]*>([\s\S]*?)<\/script>/);
assert.ok(match, 'index.html should contain <script id="game-engine">');

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox, { filename: 'game-engine.js' });
const Engine = sandbox.window.SanguoshaEngine;
assert.ok(Engine, 'engine should expose window.SanguoshaEngine');

function test(name, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function skillGame(playerHero, enemyHero = 'sunquan') {
  const game = Engine.newGame({ seed: 4242, playerHero, enemyHero });
  game.turn = 'player';
  game.phase = 'play';
  game.winner = null;
  game.log = [];
  game.discard = [];
  game.deck = [];
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = [];
    game[actor].judgeArea = [];
    game[actor].equipment = { weapon: null, armor: null, horseMinus: null, horsePlus: null };
    game[actor].flags = {};
    game[actor].usedSha = false;
    game[actor].usedOrRespondedSha = false;
    game[actor].shaBonus = 0;
    game[actor].hp = game[actor].maxHp;
  }
  return game;
}

function ids(cards) {
  return Array.from(cards).map((card) => card.id);
}

test('张飞【咆哮】 allows multiple Sha in one play phase without Zhuge crossbow', () => {
  const game = skillGame('zhangfei', 'sunquan');
  game.player.hand = [c('sha', { id: 'sha-1' }), c('sha', { id: 'sha-2' })];

  assert.equal(Engine.playCard(game, 'player', 'sha-1').ok, true);
  assert.equal(Engine.playCard(game, 'player', 'sha-2').ok, true);

  assert.equal(game.enemy.hp, game.enemy.maxHp - 2);
  assert.equal(game.player.usedSha, true);
});

test('关羽【武圣】 converts any red card to Sha', () => {
  const game = skillGame('guanyu', 'sunquan');
  game.player.hand = [c('tao', { id: 'red-tao', suit: 'heart', color: 'red' })];

  const result = Engine.playCardAs(game, 'player', 'red-tao', 'sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
  assert.equal(game.player.hand.length, 0);
});

test('赵云【龙胆】 converts Shan to Sha proactively', () => {
  const game = skillGame('zhaoyun', 'sunquan');
  game.player.hand = [c('shan', { id: 'longdan-shan' })];

  const result = Engine.playCardAs(game, 'player', 'longdan-shan', 'sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
});

test('赵云【龙胆】 converts Sha to Shan as automatic response', () => {
  const game = skillGame('zhaoyun', 'sunquan');
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'incoming-sha' })];
  game.player.hand = [c('sha', { id: 'longdan-response-sha' })];

  const result = Engine.playCard(game, 'enemy', 'incoming-sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.player.hp, game.player.maxHp, 'Longdan Sha-as-Shan should prevent Sha damage');
  assert.deepEqual(ids(game.player.hand), [], 'response Sha should be consumed');
});

test('甄姬【倾国】 converts a black hand card to Shan as automatic response', () => {
  const game = skillGame('zhenji', 'sunquan');
  game.turn = 'enemy';
  game.enemy.hand = [c('sha', { id: 'incoming-sha' })];
  game.player.hand = [c('guohe', { id: 'qingguo-black-card', suit: 'spade', color: 'black' })];

  const result = Engine.playCard(game, 'enemy', 'incoming-sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.player.hp, game.player.maxHp, 'Qingguo black-card-as-Shan should prevent Sha damage');
  assert.deepEqual(ids(game.player.hand), [], 'Qingguo black card should be consumed');
  assert.ok(ids(game.discard).includes('qingguo-black-card'), 'Qingguo physical card should go to discard');
  assert.ok(game.log.some((entry) => /倾国/.test(entry) && /当【闪】响应【杀】/.test(entry)), 'Qingguo response should be logged');
});

test('武圣/龙胆 converted Sha preserves the physical source card for damage-after skills', () => {
  const guanyu = skillGame('guanyu', 'caocao');
  guanyu.player.hand = [c('tao', { id: 'wusheng-physical-tao', suit: 'heart', color: 'red' })];

  const wushengResult = Engine.playCardAs(guanyu, 'player', 'wusheng-physical-tao', 'sha');

  assert.equal(wushengResult.ok, true, wushengResult.message);
  assert.equal(guanyu.enemy.hp, guanyu.enemy.maxHp - 1);
  assert.ok(ids(guanyu.enemy.hand).includes('wusheng-physical-tao'), 'Jianxiong should claim Wusheng\'s physical source card');
  assert.equal(ids(guanyu.discard).includes('wusheng-physical-tao'), false, 'claimed Wusheng source card should not also remain in discard');

  const zhaoyun = skillGame('zhaoyun', 'caocao');
  zhaoyun.player.hand = [c('shan', { id: 'longdan-physical-shan' })];

  const longdanResult = Engine.playCardAs(zhaoyun, 'player', 'longdan-physical-shan', 'sha');

  assert.equal(longdanResult.ok, true, longdanResult.message);
  assert.equal(zhaoyun.enemy.hp, zhaoyun.enemy.maxHp - 1);
  assert.ok(ids(zhaoyun.enemy.hand).includes('longdan-physical-shan'), 'Jianxiong should claim Longdan\'s physical source card');
});

test('武圣/龙胆 card-as validation rejects missing skills or invalid source cards', () => {
  const noSkill = skillGame('sunquan', 'caocao');
  noSkill.player.hand = [c('tao', { id: 'red-tao-no-skill', suit: 'heart', color: 'red' })];
  assert.equal(Engine.canPlayCardAs(noSkill, 'player', 'red-tao-no-skill', 'sha').ok, false, 'heroes without a conversion skill cannot card-as Sha');

  const blackWusheng = skillGame('guanyu', 'caocao');
  blackWusheng.player.hand = [c('tao', { id: 'black-tao-wusheng', suit: 'club', color: 'black' })];
  assert.equal(Engine.canPlayCardAs(blackWusheng, 'player', 'black-tao-wusheng', 'sha').ok, false, 'Wusheng should only convert red cards');

  const nonShanLongdan = skillGame('zhaoyun', 'caocao');
  nonShanLongdan.player.hand = [c('tao', { id: 'tao-longdan', suit: 'heart', color: 'red' })];
  assert.equal(Engine.canPlayCardAs(nonShanLongdan, 'player', 'tao-longdan', 'sha').ok, false, 'Longdan should only convert Shan to proactive Sha');
});

test('孙权【制衡】 discards selected cards and draws the same amount once per turn', () => {
  const game = skillGame('sunquan', 'caocao');
  game.player.hand = [c('sha', { id: 'old-1' }), c('shan', { id: 'old-2' })];
  game.deck = [c('tao', { id: 'draw-2' }), c('jiu', { id: 'draw-1' })];

  const result = Engine.useSkill(game, 'player', 'zhiheng', ['old-1', 'old-2']);

  assert.equal(result.ok, true, result.message);
  assert.deepEqual(ids(game.player.hand), ['draw-1', 'draw-2']);
  assert.equal(Engine.useSkill(game, 'player', 'zhiheng', ['draw-1']).ok, false, 'Zhiheng should be once per turn');
});

test('黄盖【苦肉】 loses 1 HP and draws two cards', () => {
  const game = skillGame('huanggai', 'sunquan');
  game.deck = [c('sha', { id: 'kurou-2' }), c('tao', { id: 'kurou-1' })];

  const result = Engine.useSkill(game, 'player', 'kurou');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.player.hp, game.player.maxHp - 1);
  assert.deepEqual(ids(game.player.hand), ['kurou-1', 'kurou-2']);
});

test('曹操【奸雄】 gains the card that caused damage', () => {
  const game = skillGame('sunquan', 'caocao');
  game.player.hand = [c('sha', { id: 'jianxiong-sha' })];

  const result = Engine.playCard(game, 'player', 'jianxiong-sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
  assert.ok(ids(game.enemy.hand).includes('jianxiong-sha'), 'Cao Cao should gain the damaging Sha');
});

test('曹操【奸雄】 only claims physical damaging cards from the damage-after flow', () => {
  const noSkill = skillGame('sunquan', 'lvmeng');
  noSkill.player.hand = [c('sha', { id: 'non-jianxiong-sha' })];

  const noSkillResult = Engine.playCard(noSkill, 'player', 'non-jianxiong-sha');

  assert.equal(noSkillResult.ok, true, noSkillResult.message);
  assert.equal(noSkill.enemy.hp, noSkill.enemy.maxHp - 1);
  assert.deepEqual(ids(noSkill.enemy.hand), [], 'non-Jianxiong targets should not gain the damaging card');
  assert.ok(ids(noSkill.discard).includes('non-jianxiong-sha'), 'non-Jianxiong damaging cards should still be discarded');

  const noPhysicalSource = skillGame('sunquan', 'caocao');
  noPhysicalSource.player.hand = [
    c('huogong', { id: 'jianxiong-huogong', suit: 'heart', color: 'red' }),
    c('shan', { id: 'huogong-cost', suit: 'spade', color: 'black' })
  ];
  noPhysicalSource.enemy.hand = [c('sha', { id: 'revealed-spade', suit: 'spade', color: 'black' })];

  const noPhysicalResult = Engine.playCard(noPhysicalSource, 'player', 'jianxiong-huogong', { huogongCostCardId: 'huogong-cost' });

  assert.equal(noPhysicalResult.ok, true, noPhysicalResult.message);
  assert.equal(noPhysicalSource.enemy.hp, noPhysicalSource.enemy.maxHp - 1);
  assert.deepEqual(ids(noPhysicalSource.enemy.hand), ['revealed-spade'], 'Jianxiong should not gain cards when the damage event has no physical source card');
  assert.ok(ids(noPhysicalSource.discard).includes('jianxiong-huogong'), 'the Huogong card itself should remain discarded');
});

test('司马懿【反馈】 gains a remaining hand card from the damage source', () => {
  const game = skillGame('sunquan', 'simayi');
  game.player.hand = [
    c('sha', { id: 'fankui-sha' }),
    c('tao', { id: 'fankui-source-hand' })
  ];

  const result = Engine.playCard(game, 'player', 'fankui-sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
  assert.deepEqual(ids(game.enemy.hand), ['fankui-source-hand'], 'Sima Yi should gain one card from the damage source');
  assert.deepEqual(ids(game.player.hand), [], 'the gained source hand card should leave the source hand');
  assert.ok(ids(game.discard).includes('fankui-sha'), 'Fankui should not claim the already-used damaging Sha itself');
  assert.ok(game.log.some((entry) => /反馈/.test(entry) && /获得/.test(entry)), 'Fankui trigger should be logged');
});

test('司马懿【反馈】 can gain source equipment when the source has no remaining hand cards', () => {
  const game = skillGame('sunquan', 'simayi');
  game.player.hand = [c('sha', { id: 'fankui-equipment-sha' })];
  game.player.equipment.weapon = c('zhuge', { id: 'fankui-source-weapon' });

  const result = Engine.playCard(game, 'player', 'fankui-equipment-sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.player.equipment.weapon, null, 'Fankui should remove the gained equipment from the source');
  assert.deepEqual(ids(game.enemy.hand), ['fankui-source-weapon'], 'Sima Yi should gain source equipment if no hand card is available');
  assert.ok(ids(game.discard).includes('fankui-equipment-sha'), 'the damaging Sha should still be discarded normally');
});

test('司马懿【反馈】 does not gain a card when the damage source has no gainable cards', () => {
  const game = skillGame('sunquan', 'simayi');
  game.player.hand = [c('sha', { id: 'fankui-no-source-card-sha' })];

  const result = Engine.playCard(game, 'player', 'fankui-no-source-card-sha');

  assert.equal(result.ok, true, result.message);
  assert.deepEqual(ids(game.enemy.hand), [], 'Fankui should not gain the already-used damaging Sha as a source-area card');
  assert.ok(ids(game.discard).includes('fankui-no-source-card-sha'), 'damaging Sha should still be discarded when Fankui has no source card to gain');
});

test('司马懿【反馈】 does not trigger for source-less Shandian lightning damage', () => {
  const game = skillGame('simayi', 'sunquan');
  game.player.judgeArea = [c('shandian', { id: 'fankui-shandian' })];
  game.enemy.hand = [c('tao', { id: 'fankui-lightning-enemy-hand' })];
  game.deck = [c('sha', { id: 'fankui-lightning-judge', suit: 'spade', color: 'black', rank: '7' })];

  const result = Engine.startTurn(game, 'player');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.player.hp, 0, 'Shandian should still deal thunder damage to Sima Yi');
  assert.deepEqual(ids(game.player.hand), [], 'Fankui should not gain cards from an opponent when lightning has no damage source');
  assert.deepEqual(ids(game.enemy.hand), ['fankui-lightning-enemy-hand'], 'source-less lightning should not move the opponent hand card');
  assert.equal(game.player.judgeArea.length, 0, 'resolved lightning should leave Sima Yi judge area');
  assert.equal(game.log.some((entry) => /反馈/.test(entry)), false, 'source-less lightning should not log a Fankui trigger');
});

test('郭嘉【遗计】 draws two cards into his hand after taking 1 damage', () => {
  const game = skillGame('sunquan', 'guojia');
  game.player.hand = [c('sha', { id: 'yiji-single-sha' })];
  game.deck = [
    c('tao', { id: 'yiji-single-draw-2' }),
    c('shan', { id: 'yiji-single-draw-1' })
  ];

  const result = Engine.playCard(game, 'player', 'yiji-single-sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
  assert.deepEqual(ids(game.enemy.hand), ['yiji-single-draw-1', 'yiji-single-draw-2'], 'Yiji should draw two cards for the damaged Guo Jia by default');
  assert.ok(ids(game.discard).includes('yiji-single-sha'), 'Yiji should not claim the damaging Sha source card');
  assert.ok(game.log.some((entry) => /遗计/.test(entry) && /摸两张牌/.test(entry)), 'Yiji trigger should be logged');
});

test('郭嘉【遗计】 resolves once per damage point from boosted Sha damage', () => {
  const game = skillGame('guojia', 'sunquan');
  game.turn = 'enemy';
  game.enemy.hand = [
    c('jiu', { id: 'yiji-boost-jiu' }),
    c('sha', { id: 'yiji-boost-sha' })
  ];
  game.deck = [
    c('sha', { id: 'yiji-boost-draw-4' }),
    c('tao', { id: 'yiji-boost-draw-3' }),
    c('shan', { id: 'yiji-boost-draw-2' }),
    c('jiu', { id: 'yiji-boost-draw-1' })
  ];

  const jiuResult = Engine.playCard(game, 'enemy', 'yiji-boost-jiu');
  const shaResult = Engine.playCard(game, 'enemy', 'yiji-boost-sha');

  assert.equal(jiuResult.ok, true, jiuResult.message);
  assert.equal(shaResult.ok, true, shaResult.message);
  assert.equal(game.player.hp, game.player.maxHp - 2, 'boosted Sha should deal 2 damage to Guo Jia');
  assert.deepEqual(ids(game.player.hand), [
    'yiji-boost-draw-1',
    'yiji-boost-draw-2',
    'yiji-boost-draw-3',
    'yiji-boost-draw-4'
  ], 'Yiji should draw two cards for each point of damage');
  assert.equal(game.log.filter((entry) => /遗计/.test(entry)).length, 2, 'Yiji should log once per damage point');
});

test('夏侯惇【刚烈】 non-heart judgment makes the damage source discard two hand cards', () => {
  const game = skillGame('sunquan', 'xiahoudun');
  game.player.hand = [
    c('sha', { id: 'ganglie-discard-sha' }),
    c('shan', { id: 'ganglie-source-card-1' }),
    c('tao', { id: 'ganglie-source-card-2' })
  ];
  game.deck = [c('sha', { id: 'ganglie-black-judge', suit: 'club', color: 'black' })];

  const result = Engine.playCard(game, 'player', 'ganglie-discard-sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, 'original Sha damage should still land on Xiahou Dun');
  assert.equal(game.player.hp, game.player.maxHp, 'source should avoid Ganglie damage by discarding two hand cards');
  assert.deepEqual(ids(game.player.hand), [], 'Ganglie should discard the source\'s remaining two hand cards');
  assert.ok(ids(game.discard).includes('ganglie-black-judge'), 'Ganglie judgment card should be finalized to discard');
  assert.ok(ids(game.discard).includes('ganglie-source-card-1'), 'first source hand card should be discarded for Ganglie');
  assert.ok(ids(game.discard).includes('ganglie-source-card-2'), 'second source hand card should be discarded for Ganglie');
  assert.ok(game.log.some((entry) => /刚烈/.test(entry) && /弃置两张手牌/.test(entry)), 'Ganglie discard choice should be logged');
});

test('夏侯惇【刚烈】 non-heart judgment damages the source when two hand cards are unavailable', () => {
  const game = skillGame('sunquan', 'xiahoudun');
  game.player.hand = [c('sha', { id: 'ganglie-damage-sha' })];
  game.deck = [c('shan', { id: 'ganglie-spade-judge', suit: 'spade', color: 'black' })];

  const result = Engine.playCard(game, 'player', 'ganglie-damage-sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, 'original Sha damage should still land before Ganglie retaliation');
  assert.equal(game.player.hp, game.player.maxHp - 1, 'source should lose 1 HP when unable to discard two hand cards');
  assert.ok(ids(game.discard).includes('ganglie-spade-judge'), 'Ganglie judgment card should be discarded after the result is used');
  assert.ok(game.log.some((entry) => /刚烈/.test(entry) && /受到 1 点伤害/.test(entry)), 'Ganglie damage choice should be logged');
});

test('夏侯惇【刚烈】 lethal retaliation wins once and is not overwritten by the original damage', () => {
  const game = skillGame('sunquan', 'xiahoudun');
  game.player.hp = 1;
  game.enemy.hp = 1;
  game.player.hand = [c('sha', { id: 'ganglie-lethal-sha' })];
  game.deck = [c('shan', { id: 'ganglie-lethal-judge', suit: 'spade', color: 'black' })];

  const result = Engine.playCard(game, 'player', 'ganglie-lethal-sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.phase, 'gameover');
  assert.equal(game.winner, 'enemy', 'nested Ganglie lethal damage should not be overwritten by the outer damage winner check');
  assert.equal(game.player.hp, 0);
  assert.equal(game.enemy.hp, 0);
  const victoryLogs = game.log.filter((entry) => /获胜/.test(entry));
  assert.deepEqual(victoryLogs, ['夏侯惇获胜！'], 'Ganglie mutual lethal flow should log a single consistent winner');
});

test('夏侯惇【刚烈】 heart judgment does not punish the damage source', () => {
  const game = skillGame('sunquan', 'xiahoudun');
  game.player.hand = [
    c('sha', { id: 'ganglie-heart-sha' }),
    c('shan', { id: 'ganglie-heart-source-card-1' }),
    c('tao', { id: 'ganglie-heart-source-card-2' })
  ];
  game.deck = [c('tao', { id: 'ganglie-heart-judge', suit: 'heart', color: 'red' })];

  const result = Engine.playCard(game, 'player', 'ganglie-heart-sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1);
  assert.equal(game.player.hp, game.player.maxHp, 'heart judgment should not damage the source');
  assert.deepEqual(ids(game.player.hand), ['ganglie-heart-source-card-1', 'ganglie-heart-source-card-2'], 'heart judgment should not discard source hand cards');
  assert.ok(ids(game.discard).includes('ganglie-heart-judge'), 'heart Ganglie judgment should still be finalized');
  assert.ok(game.log.some((entry) => /刚烈/.test(entry) && /红桃/.test(entry)), 'heart no-effect result should be logged');
});

test('马超【铁骑】 red judgment prevents target from playing Shan', () => {
  const game = skillGame('machao', 'sunquan');
  game.player.hand = [c('sha', { id: 'tieqi-sha' })];
  game.enemy.hand = [c('shan', { id: 'blocked-shan' })];
  game.deck = [c('tao', { id: 'tieqi-red-judge', suit: 'heart', color: 'red' })];

  const result = Engine.playCard(game, 'player', 'tieqi-sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, 'red Tieqi judgment should force Sha damage');
  assert.deepEqual(ids(game.enemy.hand), ['blocked-shan'], 'target should not consume Shan after red Tieqi');
  assert.ok(ids(game.discard).includes('tieqi-red-judge'), 'non-Tiandu Tieqi judgment card should enter discard after the result is used');
});

test('郭嘉【天妒】 does not gain an opponent source\'s Tieqi judgment card', () => {
  const game = skillGame('machao', 'guojia');
  game.player.hand = [c('sha', { id: 'tiandu-tieqi-sha' })];
  game.enemy.hand = [c('shan', { id: 'tiandu-tieqi-blocked-shan' })];
  game.deck = [
    c('tao', { id: 'tiandu-tieqi-yiji-draw-2' }),
    c('shan', { id: 'tiandu-tieqi-yiji-draw-1' }),
    c('tao', { id: 'tiandu-tieqi-judge-heart', suit: 'heart', color: 'red' })
  ];

  const result = Engine.playCard(game, 'player', 'tiandu-tieqi-sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, 'red Tieqi judgment should still force Sha damage');
  assert.deepEqual(ids(game.enemy.hand), [
    'tiandu-tieqi-blocked-shan',
    'tiandu-tieqi-yiji-draw-1',
    'tiandu-tieqi-yiji-draw-2'
  ], 'target Guo Jia may draw from Yiji but should not claim the Tieqi source\'s judgment card');
  assert.equal(ids(game.enemy.hand).includes('tiandu-tieqi-judge-heart'), false, 'Yiji should not put the source-owned Tieqi judgment card directly into Guo Jia\'s hand');
  assert.ok(ids(game.discard).includes('tiandu-tieqi-judge-heart'), 'source-owned Tieqi judgment should enter discard when the source has no Tiandu');
  assert.equal(game.log.some((entry) => /天妒/.test(entry)), false, 'Tiandu should not trigger for another actor\'s Tieqi judgment');
});

test('郭嘉【天妒】 gains his own Tieqi judgment card before discard', () => {
  const game = skillGame('machao', 'sunquan');
  game.player.skills.push({ id: 'tiandu', name: '天妒' });
  game.player.hand = [c('sha', { id: 'tiandu-own-tieqi-sha' })];
  game.enemy.hand = [c('shan', { id: 'tiandu-own-tieqi-blocked-shan' })];
  game.deck = [c('tao', { id: 'tiandu-own-tieqi-judge-heart', suit: 'heart', color: 'red' })];

  const result = Engine.playCard(game, 'player', 'tiandu-own-tieqi-sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, 'red Tieqi judgment should still force Sha damage');
  assert.deepEqual(ids(game.player.hand), ['tiandu-own-tieqi-judge-heart'], 'Tiandu should claim the Tieqi source\'s own judgment card');
  assert.equal(ids(game.discard).includes('tiandu-own-tieqi-judge-heart'), false, 'Tiandu-claimed Tieqi judgment should not enter discard');
  assert.ok(game.log.some((entry) => /天妒/.test(entry)), 'Tiandu trigger should be logged for Tieqi judgment');
});

test('马超【铁骑】 non-red judgment keeps normal Shan response available', () => {
  const game = skillGame('machao', 'sunquan');
  game.player.hand = [c('sha', { id: 'tieqi-black-sha' })];
  game.enemy.hand = [c('shan', { id: 'tieqi-allowed-shan' })];
  game.deck = [c('sha', { id: 'tieqi-black-judge', suit: 'spade', color: 'black' })];

  const result = Engine.playCard(game, 'player', 'tieqi-black-sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp, 'non-red Tieqi judgment should still allow Shan to dodge');
  assert.deepEqual(ids(game.enemy.hand), [], 'target should consume Shan after non-red Tieqi');
  assert.ok(game.log.some((entry) => /铁骑/.test(entry) && /判定未命中/.test(entry)), 'non-red Tieqi miss should be logged');
});

test('马超【铁骑】 red judgment suppresses Bagua automatic Shan', () => {
  const game = skillGame('machao', 'sunquan');
  game.player.hand = [c('sha', { id: 'tieqi-bagua-sha' })];
  game.enemy.hand = [];
  game.enemy.equipment.armor = c('bagua', { id: 'tieqi-bagua' });
  game.deck = [
    c('tao', { id: 'bagua-red-judge-would-dodge', suit: 'heart', color: 'red' }),
    c('tao', { id: 'tieqi-red-judge-before-bagua', suit: 'heart', color: 'red' })
  ];

  const result = Engine.playCard(game, 'player', 'tieqi-bagua-sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, 'red Tieqi should force damage before Bagua can provide Shan');
  assert.deepEqual(game.deck.map((card) => card.id), ['bagua-red-judge-would-dodge'], 'Bagua should not consume a judgment after red Tieqi locks response');
  assert.ok(!game.log.some((entry) => /八卦阵/.test(entry)), 'Bagua should not trigger after red Tieqi locks response');
});

test('张辽【突袭】 steals one enemy hand card and draws one fewer card during draw phase', () => {
  const game = skillGame('zhangliao', 'sunquan');
  game.enemy.hand = [c('shan', { id: 'stolen-by-tuxi' })];
  game.deck = [c('tao', { id: 'normal-draw' })];

  const result = Engine.startTurn(game, 'player');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.phase, 'play');
  assert.deepEqual(ids(game.enemy.hand), []);
  assert.deepEqual(ids(game.player.hand).sort(), ['normal-draw', 'stolen-by-tuxi'].sort());
});

test('周瑜【英姿】 draws three cards in draw phase', () => {
  const game = skillGame('zhouyu', 'sunquan');
  game.deck = [c('sha', { id: 'yingzi-3' }), c('shan', { id: 'yingzi-2' }), c('tao', { id: 'yingzi-1' })];

  const result = Engine.startTurn(game, 'player');

  assert.equal(result.ok, true, result.message);
  assert.deepEqual(ids(game.player.hand), ['yingzi-1', 'yingzi-2', 'yingzi-3']);
});

test('许褚【裸衣】 draws one fewer card and boosts Sha damage this turn', () => {
  const game = skillGame('xuchu', 'sunquan');
  game.player.hand = [c('sha', { id: 'luoyi-sha' })];
  game.deck = [c('tao', { id: 'luoyi-draw-2' }), c('shan', { id: 'luoyi-draw-1' })];

  const startResult = Engine.startTurn(game, 'player');
  const shaResult = Engine.playCard(game, 'player', 'luoyi-sha');

  assert.equal(startResult.ok, true, startResult.message);
  assert.equal(shaResult.ok, true, shaResult.message);
  assert.deepEqual(ids(game.player.hand), ['luoyi-draw-1'], 'Luoyi should make Xu Chu draw one fewer card in draw phase');
  assert.deepEqual(ids(game.deck), ['luoyi-draw-2'], 'one draw card should remain in deck after Luoyi cost');
  assert.equal(game.enemy.hp, game.enemy.maxHp - 2, 'Luoyi should add 1 damage to Sha caused this turn');
  assert.ok(game.log.some((entry) => /裸衣/.test(entry) && /少摸一张牌/.test(entry)), 'Luoyi draw-phase trigger should be logged');
  assert.ok(game.log.some((entry) => /裸衣/.test(entry) && /伤害 \+1/.test(entry)), 'Luoyi damage boost should be logged');
});

test('许褚【裸衣】 boosts Duel damage caused by Xu Chu this turn', () => {
  const game = skillGame('xuchu', 'sunquan');
  game.player.hand = [c('juedou', { id: 'luoyi-duel' })];
  game.enemy.hand = [];
  game.deck = [c('tao', { id: 'luoyi-duel-draw-2' }), c('shan', { id: 'luoyi-duel-draw-1' })];

  const startResult = Engine.startTurn(game, 'player');
  const duelResult = Engine.playCard(game, 'player', 'luoyi-duel');

  assert.equal(startResult.ok, true, startResult.message);
  assert.equal(duelResult.ok, true, duelResult.message);
  assert.deepEqual(ids(game.player.hand), ['luoyi-duel-draw-1'], 'Luoyi should still cost one draw before Duel');
  assert.equal(game.enemy.hp, game.enemy.maxHp - 2, 'Luoyi should add 1 damage to Duel damage caused by Xu Chu');
});

test('许褚【裸衣】 does not boost non-Sha or non-Duel damage', () => {
  const game = skillGame('xuchu', 'sunquan');
  game.player.hand = [
    c('huogong', { id: 'luoyi-huogong', suit: 'heart', color: 'red' }),
    c('shan', { id: 'luoyi-huogong-cost', suit: 'spade', color: 'black' })
  ];
  game.enemy.hand = [c('sha', { id: 'luoyi-huogong-revealed', suit: 'spade', color: 'black' })];
  game.deck = [c('tao', { id: 'luoyi-huogong-draw-2' }), c('shan', { id: 'luoyi-huogong-draw-1' })];

  const startResult = Engine.startTurn(game, 'player');
  const fireResult = Engine.playCard(game, 'player', 'luoyi-huogong', { huogongCostCardId: 'luoyi-huogong-cost' });

  assert.equal(startResult.ok, true, startResult.message);
  assert.equal(fireResult.ok, true, fireResult.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, 'Luoyi should not boost Fire Attack damage');
});

test('许褚【裸衣】 damage bonus expires after his turn ends', () => {
  const game = skillGame('xuchu', 'sunquan');
  game.player.hand = [c('sha', { id: 'luoyi-expire-response-sha' })];
  game.deck = [
    c('tao', { id: 'enemy-start-draw-2' }),
    c('shan', { id: 'enemy-start-draw-1' }),
    c('sha', { id: 'luoyi-expire-draw-1' })
  ];

  const startResult = Engine.startTurn(game, 'player');
  const endResult = Engine.endTurn(game);
  game.enemy.hand = [c('juedou', { id: 'luoyi-expire-duel' })];
  game.player.hand = [c('sha', { id: 'luoyi-expire-response-sha' })];
  const duelResult = Engine.playCard(game, 'enemy', 'luoyi-expire-duel');

  assert.equal(startResult.ok, true, startResult.message);
  assert.equal(endResult.ok, true, endResult.message);
  assert.equal(duelResult.ok, true, duelResult.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp - 1, 'expired Luoyi should not boost Xu Chu response damage on another turn');
});

test('诸葛亮【空城】 prevents Sha and Duel targeting while he has no hand cards', () => {
  const game = skillGame('sunquan', 'zhugeliang');
  game.player.hand = [c('sha', { id: 'kongcheng-sha' }), c('juedou', { id: 'kongcheng-duel' })];
  game.enemy.hand = [];

  const shaCheck = Engine.canPlayCard(game, 'player', game.player.hand[0]);
  assert.equal(shaCheck.ok, false, 'Sha should not be playable against empty-hand Kongcheng');
  assert.match(shaCheck.message, /空城/);

  const duelCheck = Engine.canPlayCard(game, 'player', game.player.hand[1]);
  assert.equal(duelCheck.ok, false, 'Duel should not be playable against empty-hand Kongcheng');
  assert.match(duelCheck.message, /空城/);

  assert.equal(Engine.playCard(game, 'player', 'kongcheng-sha').ok, false);
  assert.equal(game.enemy.hp, game.enemy.maxHp);
  assert.deepEqual(ids(game.player.hand), ['kongcheng-sha', 'kongcheng-duel']);
});

test('貂蝉【闭月】 draws one card before the next turn via endTurn and advancePhase', () => {
  const viaEndTurn = skillGame('diaochan', 'sunquan');
  viaEndTurn.phase = 'finish';
  viaEndTurn.deck = [c('sha', { id: 'biyue-endturn-draw' })];

  const endResult = Engine.endTurn(viaEndTurn);

  assert.equal(endResult.ok, true, endResult.message);
  assert.equal(viaEndTurn.turn, 'enemy');
  assert.deepEqual(ids(viaEndTurn.player.hand), ['biyue-endturn-draw']);
  assert.deepEqual(ids(viaEndTurn.enemy.hand), [], 'opponent should not take the Biyue card before their turn starts');
  assert.ok(viaEndTurn.log.some((entry) => /闭月/.test(entry)), 'Biyue trigger should be logged');

  const viaAdvance = skillGame('diaochan', 'sunquan');
  viaAdvance.phase = 'finish';
  viaAdvance.deck = [c('shan', { id: 'biyue-advance-draw' })];

  const advanceResult = Engine.advancePhase(viaAdvance);

  assert.equal(advanceResult.ok, true, advanceResult.message);
  assert.equal(viaAdvance.turn, 'enemy');
  assert.deepEqual(ids(viaAdvance.player.hand), ['biyue-advance-draw']);
  assert.deepEqual(ids(viaAdvance.enemy.hand), [], 'advancePhase should run Biyue before starting the opponent turn');
});

test('吕蒙【克己】 skips discard from finishPlayPhase and advancePhase if no Sha was used', () => {
  const direct = skillGame('lvmeng', 'sunquan');
  direct.turnHistory = [];
  direct.player.hp = 2;
  direct.player.hand = [
    c('sha', { id: 'keji-direct-1' }),
    c('shan', { id: 'keji-direct-2' }),
    c('tao', { id: 'keji-direct-3' }),
    c('jiu', { id: 'keji-direct-4' })
  ];

  const finishResult = Engine.finishPlayPhase(direct);

  assert.equal(finishResult.ok, true, finishResult.message);
  assert.equal(direct.phase, 'finish');
  assert.equal(Engine.needsDiscard(direct, 'player'), true, 'hand remains over limit, so only Keji can skip discard');
  assert.deepEqual(direct.turnHistory.map((entry) => entry.phase), ['finish']);
  assert.ok(direct.log.some((entry) => /克己/.test(entry)), 'Keji skip should be logged');

  const automatic = skillGame('lvmeng', 'sunquan');
  automatic.player.hp = 2;
  automatic.player.hand = [
    c('sha', { id: 'keji-auto-1' }),
    c('shan', { id: 'keji-auto-2' }),
    c('tao', { id: 'keji-auto-3' }),
    c('jiu', { id: 'keji-auto-4' })
  ];

  const advanceResult = Engine.advancePhase(automatic);

  assert.equal(advanceResult.ok, true, advanceResult.message);
  assert.equal(automatic.phase, 'finish');
});

test('吕蒙【克己】 does not skip discard after using Sha this turn', () => {
  const game = skillGame('lvmeng', 'sunquan');
  game.player.hp = 3;
  game.player.hand = [
    c('sha', { id: 'keji-used-sha' }),
    c('shan', { id: 'keji-over-limit-1' }),
    c('tao', { id: 'keji-over-limit-2' }),
    c('jiu', { id: 'keji-over-limit-3' }),
    c('shan', { id: 'keji-over-limit-4' })
  ];
  game.enemy.hand = [];

  const shaResult = Engine.playCard(game, 'player', 'keji-used-sha');
  const finishResult = Engine.finishPlayPhase(game);

  assert.equal(shaResult.ok, true, shaResult.message);
  assert.equal(game.player.usedSha, true);
  assert.equal(finishResult.ok, true, finishResult.message);
  assert.equal(game.phase, 'discard');
  assert.equal(Engine.needsDiscard(game, 'player'), true);
});

test('吕蒙【克己】 does not skip discard after responding with Sha this turn', () => {
  const game = skillGame('lvmeng', 'sunquan');
  game.player.hp = 2;
  game.player.hand = [
    c('juedou', { id: 'keji-duel' }),
    c('sha', { id: 'keji-response-sha' }),
    c('shan', { id: 'keji-response-over-1' }),
    c('tao', { id: 'keji-response-over-2' }),
    c('jiu', { id: 'keji-response-over-3' })
  ];
  game.enemy.hand = [c('sha', { id: 'enemy-duel-sha' })];

  const duelResult = Engine.playCard(game, 'player', 'keji-duel');
  const finishResult = Engine.finishPlayPhase(game);

  assert.equal(duelResult.ok, true, duelResult.message);
  assert.equal(game.player.usedSha, false, 'responding with Sha should not consume the normal Sha usage limit');
  assert.equal(game.player.usedOrRespondedSha, true, 'responding with Sha during your turn counts for Keji');
  assert.equal(finishResult.ok, true, finishResult.message);
  assert.equal(game.phase, 'discard');
  assert.equal(Engine.needsDiscard(game, 'player'), true);
});

test('responding with Sha during your Duel does not block a later normal Sha use', () => {
  const game = skillGame('sunquan', 'caocao');
  game.player.hand = [
    c('juedou', { id: 'duel-before-sha' }),
    c('sha', { id: 'duel-response-sha' }),
    c('sha', { id: 'normal-sha-after-response' })
  ];
  game.enemy.hand = [c('sha', { id: 'enemy-duel-response' })];

  const duelResult = Engine.playCard(game, 'player', 'duel-before-sha');
  const shaResult = Engine.playCard(game, 'player', 'normal-sha-after-response');

  assert.equal(duelResult.ok, true, duelResult.message);
  assert.equal(game.player.usedSha, true, 'normal Sha should consume the once-per-turn usage limit');
  assert.equal(shaResult.ok, true, shaResult.message);
  assert.equal(game.player.hand.length, 0);
});

test('黄月英【集智】 draws one extra card after a successful normal trick', () => {
  const game = skillGame('huangyueying', 'sunquan');
  game.player.hand = [c('wuzhong', { id: 'jizhi-wuzhong' })];
  game.deck = [
    c('shan', { id: 'wuzhong-draw-2' }),
    c('sha', { id: 'wuzhong-draw-1' }),
    c('tao', { id: 'jizhi-extra-draw' })
  ];

  const result = Engine.playCard(game, 'player', 'jizhi-wuzhong');

  assert.equal(result.ok, true, result.message);
  assert.deepEqual(ids(game.player.hand).sort(), ['jizhi-extra-draw', 'wuzhong-draw-1', 'wuzhong-draw-2'].sort());
  assert.ok(game.log.some((entry) => /集智/.test(entry)), 'Jizhi trigger should be logged');
});

test('黄月英【集智】 triggers when she uses Wuxie as a response', () => {
  const game = skillGame('sunquan', 'huangyueying');
  game.player.hand = [c('guohe', { id: 'jizhi-wuxie-target-trick' })];
  game.enemy.hand = [c('wuxie', { id: 'jizhi-wuxie-response' })];
  game.deck = [c('tao', { id: 'jizhi-wuxie-draw' })];

  const result = Engine.playCard(game, 'player', 'jizhi-wuxie-target-trick');

  assert.equal(result.ok, true, result.message);
  assert.deepEqual(ids(game.enemy.hand), ['jizhi-wuxie-draw']);
  assert.ok(game.log.some((entry) => /集智/.test(entry)), 'Wuxie response should trigger Jizhi');
});

test('黄月英【集智】 does not trigger for basic, equipment, delayed, or failed card use', () => {
  const basic = skillGame('huangyueying', 'sunquan');
  basic.player.hand = [c('sha', { id: 'jizhi-basic-sha' })];
  basic.enemy.hand = [];
  basic.deck = [c('tao', { id: 'should-stay-basic' })];
  assert.equal(Engine.playCard(basic, 'player', 'jizhi-basic-sha').ok, true);
  assert.deepEqual(ids(basic.player.hand), []);
  assert.equal(basic.deck.length, 1);

  const equipment = skillGame('huangyueying', 'sunquan');
  equipment.player.hand = [c('zhuge', { id: 'jizhi-equipment-zhuge' })];
  equipment.deck = [c('tao', { id: 'should-stay-equipment' })];
  assert.equal(Engine.playCard(equipment, 'player', 'jizhi-equipment-zhuge').ok, true);
  assert.deepEqual(ids(equipment.player.hand), []);
  assert.equal(equipment.deck.length, 1);

  const delayed = skillGame('huangyueying', 'sunquan');
  delayed.player.hand = [c('lebusishu', { id: 'jizhi-delayed-lebu' })];
  delayed.deck = [c('tao', { id: 'should-stay-delayed' })];
  assert.equal(Engine.playCard(delayed, 'player', 'jizhi-delayed-lebu').ok, true);
  assert.deepEqual(ids(delayed.player.hand), []);
  assert.equal(delayed.deck.length, 1);

  const illegal = skillGame('huangyueying', 'zhugeliang');
  illegal.player.hand = [c('juedou', { id: 'jizhi-illegal-duel' })];
  illegal.enemy.hand = [];
  illegal.deck = [c('tao', { id: 'should-stay-illegal' })];
  const illegalResult = Engine.playCard(illegal, 'player', 'jizhi-illegal-duel');
  assert.equal(illegalResult.ok, false);
  assert.deepEqual(ids(illegal.player.hand), ['jizhi-illegal-duel']);
  assert.equal(illegal.deck.length, 1);
});

test('黄月英【奇才】 ignores distance limits for distance-limited trick cards', () => {
  const blocked = skillGame('sunquan', 'caocao');
  blocked.player.hand = [c('shunshou', { id: 'blocked-shunshou' })];
  blocked.enemy.hand = [c('tao', { id: 'blocked-target-tao' })];
  blocked.enemy.equipment.horsePlus = c('plus_horse', { id: 'blocked-plus-horse' });

  const blockedPreview = Engine.canPlayCard(blocked, 'player', blocked.player.hand[0]);

  assert.equal(Engine.distanceBetween(blocked, 'player', 'enemy'), 2, 'target +1 horse should put Shunshou target out of normal distance');
  assert.equal(blockedPreview.ok, false, 'non-Qicai actors should not use distance-limited tricks beyond distance 1');
  assert.match(blockedPreview.message, /距离不足/);
  assert.deepEqual(ids(blocked.player.hand), ['blocked-shunshou']);
  assert.deepEqual(ids(blocked.enemy.hand), ['blocked-target-tao']);

  const game = skillGame('huangyueying', 'caocao');
  game.player.hand = [c('shunshou', { id: 'qicai-shunshou' })];
  game.enemy.hand = [c('tao', { id: 'qicai-target-tao' })];
  game.enemy.equipment.horsePlus = c('plus_horse', { id: 'qicai-plus-horse' });
  game.deck = [c('sha', { id: 'qicai-jizhi-draw' })];

  const preview = Engine.canPlayCard(game, 'player', game.player.hand[0]);
  const result = Engine.playCard(game, 'player', 'qicai-shunshou', { targetZone: 'hand', targetCardId: 'qicai-target-tao' });

  assert.equal(Engine.distanceBetween(game, 'player', 'enemy'), 2);
  assert.equal(preview.ok, true, preview.message);
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(ids(game.player.hand).sort(), ['qicai-jizhi-draw', 'qicai-target-tao'].sort());
  assert.ok(game.log.some((entry) => /顺手牵羊/.test(entry)), 'Qicai-enabled Shunshou should still resolve as the original trick');
});

test('陆逊【谦逊】 prevents Shunshou and Le Bu Si Shu from targeting him', () => {
  const shunshouGame = skillGame('sunquan', 'luxun');
  shunshouGame.player.hand = [c('shunshou', { id: 'qianxun-shunshou' })];
  shunshouGame.enemy.hand = [c('tao', { id: 'qianxun-target-tao' })];

  const shunshouPreview = Engine.canPlayCard(shunshouGame, 'player', shunshouGame.player.hand[0]);
  const shunshouResult = Engine.playCard(shunshouGame, 'player', 'qianxun-shunshou', { targetZone: 'hand', targetCardId: 'qianxun-target-tao' });

  assert.equal(shunshouPreview.ok, false, 'Shunshou should not be able to target Qianxun');
  assert.match(shunshouPreview.message, /谦逊/);
  assert.equal(shunshouResult.ok, false, 'failed Qianxun targeting should not consume the trick');
  assert.deepEqual(ids(shunshouGame.player.hand), ['qianxun-shunshou']);
  assert.deepEqual(ids(shunshouGame.enemy.hand), ['qianxun-target-tao']);

  const lebuGame = skillGame('sunquan', 'luxun');
  lebuGame.player.hand = [c('lebusishu', { id: 'qianxun-lebu' })];

  const lebuPreview = Engine.canPlayCard(lebuGame, 'player', lebuGame.player.hand[0]);
  const lebuResult = Engine.playCard(lebuGame, 'player', 'qianxun-lebu');

  assert.equal(lebuPreview.ok, false, 'Le Bu Si Shu should not be able to target Qianxun');
  assert.match(lebuPreview.message, /谦逊/);
  assert.equal(lebuResult.ok, false, 'failed Qianxun delayed-trick targeting should not consume the card');
  assert.deepEqual(ids(lebuGame.player.hand), ['qianxun-lebu']);
  assert.equal(lebuGame.enemy.judgeArea.length, 0);
});

test('郭嘉【天妒】 gains his resolved judgement card before it enters discard', () => {
  const game = skillGame('guojia', 'sunquan');
  const judgementCard = c('shan', { id: 'tiandu-judge-heart', suit: 'heart', color: 'red', rank: 'A' });
  const delayedTrick = c('lebusishu', { id: 'tiandu-lebu' });
  game.player.judgeArea.push(delayedTrick);
  game.deck.push(judgementCard);
  game.turn = 'player';
  game.phase = 'prepare';

  Engine.advancePhase(game);

  assert.deepEqual(ids(game.player.hand), ['tiandu-judge-heart']);
  assert.equal(ids(game.discard).includes('tiandu-judge-heart'), false, 'Tiandu should claim the judgement card instead of discarding it');
  assert.ok(game.log.some((entry) => /天妒/.test(entry)), 'Tiandu trigger should be visible in the battle log');
});

test('【八卦阵】 non-Tiandu judgement card enters discard after auto Shan result', () => {
  const game = skillGame('sunquan', 'liubei');
  game.player.hand = [c('sha', { id: 'bagua-discard-sha' })];
  game.enemy.hand = [];
  game.enemy.equipment.armor = c('bagua', { id: 'bagua-discard-armor' });
  game.deck = [c('tao', { id: 'bagua-red-judge-discard', suit: 'heart', color: 'red' })];

  const result = Engine.playCard(game, 'player', 'bagua-discard-sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp, 'red Bagua judgment should still dodge Sha');
  assert.ok(ids(game.discard).includes('bagua-red-judge-discard'), 'non-Tiandu Bagua judgment card should enter discard after the result is used');
});

test('郭嘉【天妒】 gains his own Bagua judgement card after it provides Shan', () => {
  const game = skillGame('sunquan', 'guojia');
  game.player.hand = [c('sha', { id: 'tiandu-bagua-sha' })];
  game.enemy.hand = [];
  game.enemy.equipment.armor = c('bagua', { id: 'tiandu-bagua-armor' });
  game.deck = [c('tao', { id: 'tiandu-bagua-judge-heart', suit: 'heart', color: 'red' })];

  const result = Engine.playCard(game, 'player', 'tiandu-bagua-sha');

  assert.equal(result.ok, true, result.message);
  assert.equal(game.enemy.hp, game.enemy.maxHp, 'red Bagua judgment should still dodge Sha before Tiandu claims it');
  assert.deepEqual(ids(game.enemy.hand), ['tiandu-bagua-judge-heart'], 'Tiandu should claim Guo Jia\'s own Bagua judgment card');
  assert.equal(ids(game.discard).includes('tiandu-bagua-judge-heart'), false, 'Tiandu-claimed Bagua judgment should not enter discard');
  assert.ok(game.log.some((entry) => /八卦阵/.test(entry)), 'Bagua result should still be logged');
  assert.ok(game.log.some((entry) => /天妒/.test(entry)), 'Tiandu trigger should be logged for Bagua judgment');
});
