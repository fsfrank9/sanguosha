import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

function makeGame(opts) {
  opts = opts || {};
  const game = Engine.newGame({
    seed: 74,
    startWithFirstTurn: true,
    playerHero: opts.playerHero || 'liubei',  // male
    enemyHero: opts.enemyHero || 'zhenji',    // female
    ...opts.engineOpts
  });
  game.phase = 'play';
  game.turn = 'player';
  game.player.hand = [];
  game.enemy.hand = [];
  game.player.equipment.weapon = { id: 'cx-w', type: 'cixiong', name: '雌雄双股剑', family: 'equipment', slot: 'weapon', range: 2 };
  return game;
}

function dealSha(state, id) {
  const card = { id, type: 'sha', name: '杀', suit: 'spade', color: 'black' };
  state.hand.push(card);
  return card;
}

function dealShan(state, id) {
  const card = { id, type: 'shan', name: '闪', suit: 'heart', color: 'red' };
  state.hand.push(card);
  return card;
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('v7 PR-4: same gender (male vs male) → cixiong 不触发', () => {
  const game = makeGame({ enemyHero: 'caocao' });  // both male
  game.player.skillPreferences.cixiong = 'auto';
  dealSha(game.player, 'same-sha');
  // Enemy has one hand card we can detect — if cixiong fires it'd be discarded.
  const sentinel = dealSha(game.enemy, 'enemy-sentinel');
  Engine.playCard(game, 'player', 'same-sha');
  assert.ok(game.enemy.hand.some((c) => c.id === 'enemy-sentinel') || game.discard.some((c) => c.id === 'enemy-sentinel'),
    '同性 → 雌雄不触发；sentinel 应该还在某个 zone（如果触发了就会被弃，但保留在 hand 时也算未弃）');
  // Strict check: sentinel must NOT be in discard solely from cixiong.
  // (sha damage also moves the sha to discard but sentinel is different card)
  assert.equal(game.discard.some((c) => c.id === 'enemy-sentinel'), false,
    '同性 → 不应弃 enemy 手牌');
});

test('v7 PR-4: AI source (auto) → fires → target (auto) discards hand[0]', () => {
  const game = makeGame();
  game.turn = 'enemy';
  game.enemy.equipment.weapon = { id: 'cx-enemy', type: 'cixiong', name: '雌雄双股剑', family: 'equipment', slot: 'weapon', range: 2 };
  game.player.equipment.weapon = null;
  // Source = enemy (zhenji, female), Target = player (liubei, male) → 异性
  // both pref defaults make this scenario: enemy=auto, player=ask (player is target)
  // So target=ask → pendingChoice 'cixiong-choose'. Test the path where we
  // force target auto for legacy AI behavior:
  game.player.skillPreferences.cixiongResponse = 'auto';
  dealSha(game.enemy, 'auto-sha');
  const handCard = dealShan(game.player, 'p-shan');  // target has 1 hand card
  Engine.playCard(game, 'enemy', 'auto-sha');
  assert.equal(game.discard.some((c) => c.id === 'p-shan'), true,
    'target auto pref → 弃 hand[0]');
});

test('v7 PR-4: AI source + target has 0 hand → source draws 1', () => {
  const game = makeGame();
  game.turn = 'enemy';
  game.enemy.equipment.weapon = { id: 'cx-enemy2', type: 'cixiong', name: '雌雄双股剑', family: 'equipment', slot: 'weapon', range: 2 };
  game.player.equipment.weapon = null;
  game.player.skillPreferences.cixiongResponse = 'auto';
  dealSha(game.enemy, 'no-hand-sha');
  const sourceHandBefore = game.enemy.hand.length;
  Engine.playCard(game, 'enemy', 'no-hand-sha');
  // Source should have drawn 1
  assert.equal(game.enemy.hand.length, sourceHandBefore - 1 + 1,
    '无手牌强制让 source 摸 1（sourceHand 减 1 用掉 sha，+1 来自 cixiong）');
});

test('v7 PR-4: player source with default pref="ask" → pendingChoice cixiong-fire', () => {
  const game = makeGame();
  // default pref for 'player' is 'ask'
  dealSha(game.player, 'ask-sha');
  dealShan(game.enemy, 'e-shan-hand');
  Engine.playCard(game, 'player', 'ask-sha');
  assert.ok(game.pendingChoice, 'cixiong-fire pendingChoice 应当设置');
  assert.equal(game.pendingChoice.kind, 'cixiong-fire');
  assert.equal(game.pendingChoice.actor, 'player');
  assert.equal(game.pendingChoice.target, 'enemy');
  // sha has not progressed yet — enemy's hand should still have the shan
  assert.equal(game.enemy.hand.some((c) => c.id === 'e-shan-hand'), true);
});

test('v7 PR-4: resolve cixiong-fire {decline:true} → 不触发，sha 继续结算', () => {
  const game = makeGame();
  dealSha(game.player, 'decline-sha');
  // No shan in enemy hand → sha will hit
  const enemyHpBefore = game.enemy.hp;
  Engine.playCard(game, 'player', 'decline-sha');
  assert.equal(game.pendingChoice.kind, 'cixiong-fire');
  const result = Engine.resolvePendingChoice(game, { decline: true });
  assert.equal(result.ok, true);
  // After decline, sha proceeds — no shan, so damage applied
  assert.equal(game.enemy.hp, enemyHpBefore - 1, 'sha 在 cixiong decline 后正常造成 1 点伤害');
});

test('v7 PR-4: resolve cixiong-fire {fire:true} → 进入 target 选择 (target=enemy AI auto)', () => {
  const game = makeGame();
  dealSha(game.player, 'fire-sha');
  dealShan(game.enemy, 'e-discard-cx');
  Engine.playCard(game, 'player', 'fire-sha');
  // enemy (AI) target defaults to 'auto' → discards hand[0]
  const result = Engine.resolvePendingChoice(game, { fire: true });
  assert.equal(result.ok, true);
  assert.equal(game.discard.some((c) => c.id === 'e-discard-cx'), true);
});

test('v7 PR-4: target ask → cixiong-choose pendingChoice; option=draw makes source draw', () => {
  const game = makeGame();
  // Source=enemy (auto), Target=player (ask by default)
  game.turn = 'enemy';
  game.enemy.equipment.weapon = { id: 'cx-en', type: 'cixiong', name: '雌雄双股剑', family: 'equipment', slot: 'weapon', range: 2 };
  game.player.equipment.weapon = null;
  dealSha(game.enemy, 'target-ask-sha');
  dealShan(game.player, 'p-hand-1');
  dealShan(game.player, 'p-hand-2');
  Engine.playCard(game, 'enemy', 'target-ask-sha');
  assert.ok(game.pendingChoice, 'should pause for target choice');
  assert.equal(game.pendingChoice.kind, 'cixiong-choose');
  assert.equal(game.pendingChoice.actor, 'player');
  assert.equal(game.pendingChoice.sourceActor, 'enemy');
  const sourceHandBefore = game.enemy.hand.length;
  const result = Engine.resolvePendingChoice(game, { option: 'draw' });
  assert.equal(result.ok, true);
  assert.equal(game.enemy.hand.length, sourceHandBefore + 1, 'source 摸 1');
  // After cixiong resolves, sha continues; player auto-uses one 闪 to dodge.
  // So player.hand goes from 2 → 1 (consumed 1 shan for dodge); both p-hand-1/-2
  // are valid shan, one of them is now in discard.
  assert.equal(game.player.hand.length, 1, 'target 没弃手牌；但 sha 继续后 player 用 1 闪闪避');
  assert.equal(game.player.hp, game.player.maxHp, '闪闪避成功后 player 未受伤');
});

test('v7 PR-4: target ask + option=discard with specific cardId', () => {
  const game = makeGame();
  game.turn = 'enemy';
  game.enemy.equipment.weapon = { id: 'cx-en3', type: 'cixiong', name: '雌雄双股剑', family: 'equipment', slot: 'weapon', range: 2 };
  game.player.equipment.weapon = null;
  dealSha(game.enemy, 'choose-discard-sha');
  // Use a non-defensive hand card (tao) so it won't be auto-consumed for dodge.
  const taoCard = { id: 'p-hand-drop', type: 'tao', name: '桃', suit: 'heart', color: 'red' };
  const taoKeep = { id: 'p-hand-keep', type: 'tao', name: '桃', suit: 'heart', color: 'red' };
  // We need player wounded so 桃 in hand passes canPlayCard later in unrelated paths,
  // but for this test we don't play tao — only the cixiong choice and the resulting sha
  // damage matter. Reduce player hp so the 杀 hit is observable.
  game.player.hp = game.player.maxHp - 1;
  game.player.hand.push(taoCard, taoKeep);
  Engine.playCard(game, 'enemy', 'choose-discard-sha');
  const result = Engine.resolvePendingChoice(game, { option: 'discard', cardId: 'p-hand-drop' });
  assert.equal(result.ok, true);
  assert.equal(game.discard.some((c) => c.id === 'p-hand-drop'), true, '指定的手牌被弃');
  assert.equal(game.player.hand.some((c) => c.id === 'p-hand-keep'), true, '另一张手牌保留（tao 不能用于响应 杀）');
});

test('v7 PR-4: cixiong 在 sha 被闪躲后仍然触发 (spec: 指定目标后)', () => {
  const game = makeGame();
  game.player.skillPreferences.cixiong = 'auto';
  game.enemy.skillPreferences.cixiongResponse = 'auto';
  dealSha(game.player, 'dodged-sha');
  dealShan(game.enemy, 'dodge-shan');
  dealShan(game.enemy, 'cx-target-card');
  const playerHpBefore = game.player.hp;
  Engine.playCard(game, 'player', 'dodged-sha');
  // shan should dodge the sha → no damage
  assert.equal(game.player.hp, playerHpBefore, 'sha 被闪躲，伤害未结算');
  // But cixiong still fired before response window → one of enemy's hand cards was discarded
  // The shan used for dodge is also moved to discard, so we need to check that
  // cx-target-card or another card was discarded by cixiong (not the dodge shan).
  // Since auto picks hand[0] = first remaining card. Both shans are interchangeable here.
  // Easier check: at minimum, one of {dodge-shan, cx-target-card} ended up in discard.
  const discarded = ['dodge-shan', 'cx-target-card'].filter((id) => game.discard.some((c) => c.id === id));
  assert.ok(discarded.length >= 2, 'cixiong fires even on dodge → 弃 1 + 闪躲弃 1 = 共 2 张应在弃牌堆');
});

test('v7 PR-4: skillPreferences.cixiong="decline" 永不触发 (源不开)', () => {
  const game = makeGame();
  game.player.skillPreferences.cixiong = 'decline';
  dealSha(game.player, 'src-decline-sha');
  // Use a non-defensive card so it won't be consumed for dodge.
  game.enemy.hand.push({ id: 'e-preserve', type: 'tao', name: '桃', suit: 'heart', color: 'red' });
  Engine.playCard(game, 'player', 'src-decline-sha');
  assert.equal(game.discard.some((c) => c.id === 'e-preserve'), false,
    '源 decline → 雌雄不触发，目标手牌保留（非闪牌不会被自动响应消耗）');
  assert.equal(game.pendingChoice, null);
});

for (const [name, fn] of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
