// AA1 effect lifetimes: official rule__classification.md Xuchu/Duanchang
// (line 101) and Yanliang/Wenchou/Duanchang (line 126) retain paid effects.
// New Wind Buqu's hand-limit clause is a current locked skill, not a paid effect.
import assert from 'node:assert/strict';
import { Engine, StateRuntime, HERO_CATALOG, c } from './helpers/load-engine.mjs';
import { assertCardConservation } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function fresh() {
  const game = Engine.newGame({ seed: 163081, playerHero: 'zuoci', enemyHero: 'zhangfei' });
  game.deck = [...Array.from({ length: 12 }, (_, n) => c('sha', { id: 'deck-' + n })),
    c('tao', { id: 'judge-red', suit: 'heart', color: 'red', rank: '2' })];
  game.discard = [];
  game.player.hand = [];
  game.enemy.hand = [];
  game.enemy.hp = game.enemy.maxHp = 8;
  return game;
}

function borrow(game, heroId, skillId) {
  StateRuntime.activateSkillSource(game.player, 'huashen',
    HERO_CATALOG[heroId].skills.find(skill => skill.id === skillId));
}

function start(game) {
  assertCardConservation(game, () => assert.equal(Engine.startTurn(game, 'player').ok, true));
}

test('AA1 paid borrowed Luoyi continues to modify new Sha and Duel after its source switches', () => {
  const game = fresh();
  game.player.hand = [c('sha', { id: 'attack' }), c('juedou', { id: 'duel' })];
  borrow(game, 'xuchu', 'luoyi');
  start(game);
  assert.equal(game.player.hand.length, 3, 'actually paid the draw-one-fewer cost');
  assert.equal(game.player.flags.luoyi, true);
  borrow(game, 'machao', 'mashu');
  assert.equal(StateRuntime.skillEnabled(game.player, 'luoyi', game), false);
  assertCardConservation(game, () => assert.equal(Engine.playCard(game, 'player', 'attack', { target: 'enemy' }).ok, true));
  assert.equal(game.enemy.hp, 6, 'new Sha retains the paid +1');
  assertCardConservation(game, () => assert.equal(Engine.playCard(game, 'player', 'duel', { target: 'enemy' }).ok, true));
  assert.equal(game.enemy.hp, 4, 'new Duel retains the paid +1');
  Engine.endTurn(game);
  assert.equal(game.player.flags.luoyi, false, 'effect ends with its turn');
});

test('AA1 paid Luoyi survives complete skill loss and independently resumes in a JSON copy', () => {
  const original = fresh();
  original.player.hand = [c('juedou', { id: 'duel' })];
  borrow(original, 'xuchu', 'luoyi');
  start(original);
  const game = JSON.parse(JSON.stringify(original));
  StateRuntime.stripAllSkills(game.player, game);
  assertCardConservation(game, () => assert.equal(Engine.playCard(game, 'player', 'duel', { target: 'enemy' }).ok, true));
  assert.equal(game.enemy.hp, 6);
  assert.equal(original.enemy.hp, 8);
  assert.equal(original.player.hand.some(card => card.id === 'duel'), true);
});

test('AA1 inactive Luoyi cannot newly pay the draw cost or create a damage bonus', () => {
  const game = fresh();
  game.player.hand = [c('sha', { id: 'attack' })];
  borrow(game, 'xuchu', 'luoyi');
  borrow(game, 'machao', 'mashu');
  start(game);
  assert.equal(game.player.hand.length, 3, 'ordinary draw two');
  assert.equal(game.player.flags.luoyi, false);
  assertCardConservation(game, () => assert.equal(Engine.playCard(game, 'player', 'attack', { target: 'enemy' }).ok, true));
  assert.equal(game.enemy.hp, 7);
});

test('AA1 paid borrowed Shuangxiong permits new conversions after switch and complete loss', () => {
  const game = fresh();
  game.player.hand = [c('sha', { id: 'black-a', suit: 'spade', color: 'black' }),
    c('shan', { id: 'black-b', suit: 'club', color: 'black' })];
  borrow(game, 'yanliangwenchou', 'shuangxiong');
  game.player.skillPreferences.shuangxiong = 'always';
  start(game);
  assert.equal(game.player.hand.length, 3, 'paid normal draws, gained only the judged card');
  assert.equal(game.player.flags.shuangxiongColor, 'red');
  borrow(game, 'machao', 'mashu');
  assert.equal(StateRuntime.skillEnabled(game.player, 'shuangxiong', game), false);
  assert.equal(Engine.listCardConversions(game, 'player', 'black-a').some(entry => entry.asType === 'juedou'), true);
  assert.equal(Engine.canPlayCardAs(game, 'player', 'judge-red', 'juedou').ok, false, 'same color still disallowed');
  assertCardConservation(game, () => assert.equal(Engine.playCardAs(game, 'player', 'black-a', 'juedou', { target: 'enemy' }).ok, true));
  StateRuntime.stripAllSkills(game.player, game);
  assertCardConservation(game, () => assert.equal(Engine.playCardAs(game, 'player', 'black-b', 'juedou', { target: 'enemy' }).ok, true));
  assert.equal(game.enemy.hp, 6);
  Engine.endTurn(game);
  assert.equal(game.player.flags.shuangxiongColor, null, 'the turn authorization expires');
});

test('AA1 inactive Shuangxiong without a paid effect cannot start or offer a conversion', () => {
  const game = fresh();
  game.player.hand = [c('sha', { id: 'black-a', suit: 'spade', color: 'black' })];
  borrow(game, 'yanliangwenchou', 'shuangxiong');
  borrow(game, 'machao', 'mashu');
  start(game);
  assert.equal(game.pendingChoice, null);
  assert.equal(game.player.hand.length, 3);
  assert.equal(Engine.canPlayCardAs(game, 'player', 'black-a', 'juedou').ok, false);
});

test('AA1 an unaccepted Shuangxiong prompt rechecks availability before paying its cost', () => {
  const game = fresh();
  borrow(game, 'yanliangwenchou', 'shuangxiong');
  start(game);
  assert.equal(game.pendingChoice.kind, 'shuangxiong-ask');
  borrow(game, 'machao', 'mashu');
  assertCardConservation(game, () => assert.equal(Engine.resolvePendingChoice(game, {}).ok, true));
  assert.equal(game.player.hand.length, 2, 'lost qualification leaves ordinary draws intact');
  assert.equal(game.player.flags.shuangxiongColor, undefined);
});

test('AA1 inactive Buqu retains its scar cards but stops imposing a hand-limit view', () => {
  const game = fresh();
  game.player.hp = 1;
  game.player.maxHp = 4;
  game.player.chuang = [c('sha', { id: 'scar-a', rank: '3' }), c('sha', { id: 'scar-b', rank: '7' })];
  borrow(game, 'zhoutai', 'buqu');
  assert.equal(Engine.handLimit(game, 'player'), 2);
  assertCardConservation(game, () => borrow(game, 'machao', 'mashu'));
  assert.equal(Engine.handLimit(game, 'player'), 1);
  assert.equal(game.player.chuang.length, 2);
  borrow(game, 'zhoutai', 'buqu');
  assert.equal(Engine.handLimit(game, 'player'), 2, 'reactivation reads retained scars');
  StateRuntime.grantSkill(game.player, 'chanyuan');
  assert.equal(Engine.handLimit(game, 'player'), 1, 'temporary suppression also removes the current view');
});

test('AA1 real Buqu rescues establish hand limits of one and three scars, independent of max HP', () => {
  const game = fresh();
  borrow(game, 'zhoutai', 'buqu');
  game.player.hp = 1;
  game.player.maxHp = 4;
  game.enemy.hand = Array.from({ length: 3 }, (_, n) => c('sha', { id: 'attack-' + n }));
  game.deck = [c('sha', { id: 'scar-c', rank: '9' }), c('sha', { id: 'scar-b', rank: '6' }),
    c('sha', { id: 'scar-a', rank: '3' })];
  game.turn = 'enemy';
  for (let n = 0; n < 3; n++) {
    assertCardConservation(game, () => assert.equal(Engine.playCard(game, 'enemy', 'attack-' + n, { target: 'player' }).ok, true));
    assert.equal(game.player.hp, 1);
    assert.equal(game.player.chuang.length, n + 1);
    assert.equal(Engine.handLimit(game, 'player'), n + 1, 'base limit equals scars, not maxHp minus scars');
  }
  borrow(game, 'machao', 'mashu');
  assert.equal(Engine.handLimit(game, 'player'), 1);
  borrow(game, 'zhoutai', 'buqu');
  assert.equal(Engine.handLimit(game, 'player'), 3);
  game.player.handLimitDelta = -1;
  assert.equal(Engine.handLimit(game, 'player'), 2, 'independent turn modifiers still apply');
});

test('AA1 Wushuang remains locked for later Fangtian targets after Caiwenji removes every skill', () => {
  // Exact official rule__classification.md:124 counterexample.
  const game = Engine.newGame({ seed: 163099, seats: ['player', 'enemy', 'ally'],
    roles: { player: '主公', enemy: '反贼', ally: '反贼' },
    playerHero: 'lvbu', enemyHero: 'caiwenji', allyHero: 'liubei' });
  game.player.hand = [c('sha', { id: 'multi' })];
  game.player.equipment.weapon = c('fangtian', { id: 'fang' });
  game.enemy.hand = []; game.enemy.hp = 1;
  game.ally.hand = [c('shan', { id: 'only-shan' })];
  const allyHp = game.ally.hp;
  assertCardConservation(game, () => assert.equal(Engine.playCard(game, 'player', 'multi', { targets: ['enemy', 'ally'] }).ok, true));
  assert.equal(game.enemy.hp, 0);
  assert.equal(StateRuntime.ownsSkill(game.player, 'wushuang', game), false);
  assert.equal(game.ally.hp, allyHp - 1, 'one Shan cannot meet the already locked two-Shan requirement');
  assert.equal(game.pauseState.shaChain, null);
});

for (const initiallyEnabled of [true, false]) {
  test('AA1 Xiangle pause preserves the designated Wushuang requirement when later ' + (initiallyEnabled ? 'lost' : 'gained'), () => {
    const original = Engine.newGame({ seed: 163100, playerHero: 'zuoci', enemyHero: 'liushan' });
    original.player.hand = [c('sha', { id: 'attack' }), c('tao', { id: 'cost' })];
    original.enemy.hand = [c('shan', { id: 'only-shan' })];
    if (initiallyEnabled) borrow(original, 'lvbu', 'wushuang');
    assertCardConservation(original, () => assert.equal(Engine.playCard(original, 'player', 'attack', { target: 'enemy' }).ok, true));
    assert.equal(original.pendingChoice.kind, 'xiangle-cost');
    const game = JSON.parse(JSON.stringify(original));
    if (initiallyEnabled) borrow(game, 'machao', 'mashu'); else borrow(game, 'lvbu', 'wushuang');
    const enemyHp = game.enemy.hp;
    assertCardConservation(game, () => assert.equal(Engine.resolvePendingChoice(game, { cardId: 'cost' }).ok, true));
    assert.equal(game.enemy.hp, enemyHp - (initiallyEnabled ? 1 : 0));
    assert.equal(original.enemy.hp, enemyHp, 'resuming a clone leaves the original pending effect untouched');
    assert.equal(original.pendingChoice.kind, 'xiangle-cost');
  });
}

test('AA1 Cixiong pause preserves Roulin requirement and label despite skill and gender changes', () => {
  const game = Engine.newGame({ seed: 163101, playerHero: 'zuoci', enemyHero: 'huangyueying' });
  game.player.hand = [c('sha', { id: 'attack' })];
  game.player.equipment.weapon = c('cixiong', { id: 'swords' });
  game.enemy.hand = [c('shan', { id: 'only-shan' })];
  borrow(game, 'dongzhuo', 'roulin');
  assertCardConservation(game, () => assert.equal(Engine.playCard(game, 'player', 'attack', { target: 'enemy' }).ok, true));
  assert.equal(game.pendingChoice.kind, 'cixiong-fire');
  borrow(game, 'machao', 'mashu');
  StateRuntime.setIdentityOverride(game.player, 'huashen', { gender: 'female' });
  const enemyHp = game.enemy.hp;
  assertCardConservation(game, () => assert.equal(Engine.resolvePendingChoice(game, { decline: true }).ok, true));
  assert.equal(game.enemy.hp, enemyHp - 1);
  assert(game.log.some(line => line.includes('【肉林】锁定')));
});

test('AA1 Liuli completes before response requirements are locked for the final target', () => {
  const game = Engine.newGame({ seed: 163102, seats: ['player', 'enemy', 'ally'],
    roles: { player: '反贼', enemy: '主公', ally: '忠臣' },
    playerHero: 'daqiao', enemyHero: 'zuoci', allyHero: 'liubei' });
  game.turn = 'enemy';
  game.player.hand = [c('tao', { id: 'liuli-cost' })];
  game.enemy.hand = [c('sha', { id: 'attack' })];
  game.ally.hand = [c('shan', { id: 'only-shan' })];
  StateRuntime.activateSkillSource(game.enemy, 'huashen', HERO_CATALOG.lvbu.skills[0]);
  assertCardConservation(game, () => assert.equal(Engine.playCard(game, 'enemy', 'attack', { target: 'player' }).ok, true));
  assert.equal(game.pendingChoice.kind, 'liuli-transfer');
  StateRuntime.activateSkillSource(game.enemy, 'huashen', HERO_CATALOG.machao.skills[0]);
  const allyHp = game.ally.hp;
  assertCardConservation(game, () => assert.equal(Engine.resolvePendingChoice(game, { cardId: 'liuli-cost', target: 'ally' }).ok, true));
  assert.equal(game.ally.hp, allyHp, 'new final target is designated after Wushuang was lost');
});

await runTests();
