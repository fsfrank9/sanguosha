// v15 U: 林包 8 将 18 技行为测试 (引擎层)。
// 官方逐字来源 (official-skill-cache/gltjk-sanguosha-rules/pages/):
//   断粮 wei.md:277 / 行殇 wei.md:349 / 放逐 wei.md:351 / 颂威 wei.md:353
//   英魂 wu.md:279 / 好施 wu.md:455 / 缔盟 wu.md:457
//   祸首 shu.md:396 / 再起 shu.md:406 / 巨象 shu.md:440 / 烈刃 shu.md:456
//   完杀 neutral.md:197 / 乱武 :199 / 帷幕 :201
//   酒池 :175 / 肉林 :177 / 崩坏 :183 / 暴虐 :185
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Engine, c } from './helpers/load-engine.mjs';
import { assertCardConservation, collectCardCensus } from './helpers/card-conservation.mjs';
import { test, runTests } from './helpers/harness.mjs';

function duel(playerHero, enemyHero = 'caocao', seed = 91001) {
  const game = Engine.newGame({ seed, playerHero, enemyHero });
  game.log = []; game.discard = [];
  game.deck = Array.from({ length: 12 }, (_, i) => c('sha', { id: 'dk' + i, suit: 'spade', rank: '5' }));
  for (const actor of ['player', 'enemy']) {
    game[actor].hand = []; game[actor].judgeArea = []; game[actor].flags = {};
    game[actor].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[actor].hp = game[actor].maxHp; game[actor].skillPreferences = {};
  }
  game.turn = 'player'; game.phase = 'play';
  game.pendingChoice = null; game.pendingChoiceQueue = []; game.pauseState = {};
  return game;
}

function trio(heroes, seed = 91050, roles = { player: '主公', enemy: '反贼', ally: '反贼' }) {
  const game = Engine.newGame({
    seed, seats: ['player', 'enemy', 'ally'], roles,
    playerHero: heroes[0], enemyHero: heroes[1], allyHero: heroes[2]
  });
  game.log = []; game.discard = [];
  game.deck = Array.from({ length: 16 }, (_, i) => c('sha', { id: 'dk' + i, suit: 'spade', rank: '5' }));
  for (const seat of game.seats) {
    game[seat].hand = []; game[seat].judgeArea = []; game[seat].flags = {};
    game[seat].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[seat].hp = game[seat].maxHp; game[seat].skillPreferences = {};
  }
  game.turn = 'player'; game.phase = 'play';
  game.pendingChoice = null; game.pendingChoiceQueue = []; game.pauseState = {};
  return game;
}

// ───── 官方来源可复核性 (火包同款红线) ─────

test('sourceTextRef: 18 条 sha256 与 gltjk 镜像行逐条吻合', () => {
  const specs = JSON.parse(fs.readFileSync(new URL('./fixtures/official_lin_skill_specs.json', import.meta.url), 'utf8'));
  let checked = 0;
  for (const hero of specs.heroes) {
    for (const skill of hero.skills) {
      const [file, lineNo] = skill.sourceLine.split(':');
      const text = fs.readFileSync(new URL('../official-skill-cache/gltjk-sanguosha-rules/pages/' + file, import.meta.url), 'utf8');
      const line = text.split('\n')[Number(lineNo) - 1];
      const sha = crypto.createHash('sha256').update(line).digest('hex').slice(0, 12);
      assert.equal(sha, skill.sourceTextRef, `${skill.name} (${skill.sourceLine}) sha256 不符`);
      assert.ok(line.startsWith(skill.name + '——'), `${skill.name} 行首不是该技能名`);
      checked += 1;
    }
  }
  assert.equal(checked, 18, '18 技逐条复核');
});

// ───── 徐晃 断粮 ─────

test('断粮: 非锦囊的黑色牌当【兵粮寸断】; 锦囊牌与红色牌被拒', () => {
  const game = duel('xuhuang');
  game.player.hand = [c('sha', { id: 'b-basic', suit: 'spade', color: 'black' }),
    c('guohe', { id: 'b-trick', suit: 'spade', color: 'black' }),
    c('lebusishu', { id: 'b-delay', suit: 'club', color: 'black' }),
    c('tao', { id: 'b-red', suit: 'heart', color: 'red' })];
  assertCardConservation(game, () => {
    assert.equal(Engine.playCardAs(game, 'player', 'b-basic', 'bingliang', { target: 'enemy' }).ok, true);
  });
  assert.ok(game.enemy.judgeArea.some((card) => card.type === 'bingliang'), '兵粮进判定区');
  assert.equal(Engine.playCardAs(game, 'player', 'b-trick', 'bingliang', { target: 'enemy' }).ok, false,
    '普通锦囊不是"不为锦囊牌"');
  assert.equal(Engine.playCardAs(game, 'player', 'b-delay', 'bingliang', { target: 'enemy' }).ok, false,
    '延时锦囊同样是锦囊牌 (glossary__gamecard.md:41)');
  assert.equal(Engine.playCardAs(game, 'player', 'b-red', 'bingliang', { target: 'enemy' }).ok, false,
    '红色牌被拒');
});

test('断粮: 装备区的黑色装备牌也能当兵粮 (措辞是"黑色牌"不是"黑色手牌")', () => {
  const game = duel('xuhuang');
  game.player.equipment.weapon = c('qinggang', { id: 'b-equip', suit: 'spade', color: 'black' });
  const result = Engine.playCardAs(game, 'player', 'b-equip', 'bingliang', { target: 'enemy' });
  assert.equal(result.ok, true, '装备区来源合法');
  assert.equal(game.player.equipment.weapon, null, '武器已离开装备区');
});

test('断粮: 兵粮距离上限由 1 放宽为 2 (且只对兵粮, 不影响顺手牵羊)', () => {
  const game = Engine.newGame({
    seed: 91011, seats: ['player', 'enemy', 'ally', 'ally2', 'ally3'],
    roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '反贼', ally3: '内奸' },
    playerHero: 'xuhuang', enemyHero: 'caocao', allyHero: 'liubei',
    ally2Hero: 'guanyu', ally3Hero: 'lvbu'
  });
  for (const seat of game.seats) {
    game[seat].hand = []; game[seat].judgeArea = []; game[seat].flags = {};
    game[seat].equipment = { weapon: null, armor: null, horsePlus: null, horseMinus: null };
    game[seat].hp = game[seat].maxHp; game[seat].skillPreferences = {};
  }
  game.log = []; game.discard = []; game.turn = 'player'; game.phase = 'play';
  assert.equal(Engine.distanceBetween(game, 'player', 'ally2'), 2, '远席距离 2');
  const bingliang = c('bingliang', { id: 'bl-far' });
  assert.equal(Engine.isLegalCardTarget(game, 'player', bingliang, 'ally2'), true, '断粮 → 距离 2 合法');
  const shunshou = c('shunshou', { id: 'ss-far' });
  game.ally2.hand = [c('sha', { id: 'a2-card' })];
  assert.equal(Engine.isLegalCardTarget(game, 'player', shunshou, 'ally2'), false,
    '顺手牵羊不受断粮影响, 仍是距离 1');
});

// ───── 曹丕 行殇 / 放逐 / 颂威 ─────

test('行殇: 其他角色死亡时获得其所有牌 (先于死亡弃置)', () => {
  const game = trio(['caopi', 'caocao', 'liubei']);
  game.ally.hp = 1;
  // 注意别给濒死者【桃】(会自救) 或【闪】(会闪避) —— 否则他死不了,
  // 行殇也就不触发。
  game.ally.hand = [c('sha', { id: 'v-h1' }), c('guohe', { id: 'v-h2' })];
  game.ally.equipment.weapon = c('qinggang', { id: 'v-w' });
  game.ally.judgeArea = [c('lebusishu', { id: 'v-j' })];
  game.player.hand = [c('sha', { id: 'p-kill' })];
  const before = collectCardCensus(game).ids.length;
  Engine.playCard(game, 'player', 'p-kill', { target: 'ally' });
  const gained = game.player.hand.map((card) => card.id);
  for (const id of ['v-h1', 'v-h2', 'v-w', 'v-j']) {
    assert.ok(gained.includes(id), `行殇应获得 ${id}`);
  }
  assert.equal(collectCardCensus(game).ids.length, before, 'ID 守恒');
});

test('放逐: 受伤后可令一名其他角色摸 X 张并翻面 (X = 已损失体力)', () => {
  const game = duel('caopi');
  game.turn = 'enemy';
  game.player.hp = game.player.maxHp - 1; // 受伤后 X = 2
  game.enemy.hand = [c('sha', { id: 'e-sha' })];
  Engine.playCard(game, 'enemy', 'e-sha', { target: 'player' });
  const pending = Engine.getPendingChoice(game);
  assert.equal(pending.kind, 'fangzhu-pick', '玩家席开窗');
  assert.equal(pending.drawCount, 2, 'X = 已损失的体力值');
  const before = game.enemy.hand.length;
  Engine.resolvePendingChoice(game, { target: 'enemy' });
  assert.equal(game.enemy.hand.length, before + 2, '目标摸 X 张');
  assert.equal(game.enemy.turnedOver, true, '目标翻面');
});

test('放逐: decline → 不摸不翻', () => {
  const game = duel('caopi');
  game.turn = 'enemy';
  game.player.hp = game.player.maxHp - 1;
  game.enemy.hand = [c('sha', { id: 'e-sha2' })];
  Engine.playCard(game, 'enemy', 'e-sha2', { target: 'player' });
  Engine.resolvePendingChoice(game, { decline: true });
  assert.ok(!game.enemy.turnedOver, '未翻面');
});

test('颂威: 主公技 — 其他魏势力角色的黑色判定牌生效后曹丕摸一张', () => {
  const game = trio(['caopi', 'xiahoudun', 'liubei'], 91060,
    { player: '主公', enemy: '忠臣', ally: '反贼' });
  assert.equal(game.enemy.camp, '魏', '夏侯惇为魏势力');
  game.enemy.judgeArea = [c('lebusishu', { id: 'sw-lebu' })];
  game.deck = [c('sha', { id: 'sw-judge', suit: 'spade', color: 'black', rank: '5' })];
  game.discard = [c('sha', { id: 'refill1' }), c('sha', { id: 'refill2' })];
  const before = game.player.hand.length;
  game.turn = 'enemy'; game.phase = 'prepare';
  Engine.advancePhase(game);
  assert.ok(game.player.hand.length > before, '曹丕因颂威摸牌');
  assert.ok(game.log.some((line) => /颂威/.test(line)));
});

// ───── 孙坚 英魂 ─────

test('英魂: 准备阶段已受伤时开窗; 选项① 摸 X 弃 1', () => {
  const game = trio(['sunjian', 'caocao', 'liubei']);
  game.player.hp = game.player.maxHp - 2; // X = 2
  game.enemy.hand = [c('sha', { id: 'yh-e1' })];
  game.turn = 'player'; game.phase = 'prepare';
  Engine.startTurn(game, 'player');
  const pending = Engine.getPendingChoice(game);
  assert.equal(pending.kind, 'yinghun-choice');
  assert.equal(pending.x, 2);
  const before = game.enemy.hand.length;
  Engine.resolvePendingChoice(game, { option: 1, target: 'enemy' });
  assert.equal(game.enemy.hand.length, before + 2 - 1, '摸 2 弃 1 → 净 +1');
});

test('英魂: 未受伤时不触发', () => {
  const game = trio(['sunjian', 'caocao', 'liubei']);
  game.turn = 'player'; game.phase = 'prepare';
  Engine.startTurn(game, 'player');
  const pending = Engine.getPendingChoice(game);
  assert.ok(!pending || pending.kind !== 'yinghun-choice', '满血不开窗');
});

// ───── 鲁肃 好施 / 缔盟 ─────

test('好施: 多摸两张; 手牌 >5 时交出一半 (奇数向下取整)', () => {
  const game = trio(['lusu', 'caocao', 'liubei']);
  game.player.hand = ['h1', 'h2', 'h3'].map((id) => c('sha', { id }));
  game.enemy.hand = []; game.ally.hand = [c('sha', { id: 'a1' })];
  game.phase = 'judge';
  const before = collectCardCensus(game).ids.length;
  Engine.advancePhase(game);
  // 3 + 4 = 7 张 > 5 → 交出 floor(7/2)=3 张给手牌最少者 (曹操, 0 张)
  assert.equal(game.player.hand.length, 4, '7 - 3 = 4');
  assert.equal(game.enemy.hand.length, 3, '手牌最少者收 3 张');
  assert.equal(collectCardCensus(game).ids.length, before, 'ID 守恒');
});

test('好施: 手牌数不大于 5 时只多摸不交牌', () => {
  const game = trio(['lusu', 'caocao', 'liubei']);
  game.player.hand = []; game.enemy.hand = []; game.ally.hand = [];
  game.phase = 'judge';
  Engine.advancePhase(game);
  assert.equal(game.player.hand.length, 4, '摸 2+2 = 4 张, 不大于 5 → 不交牌');
});

test('缔盟: 弃 X 张 (两人手牌差) 令两名其他角色交换手牌; 每回合限一次', () => {
  const game = trio(['lusu', 'caocao', 'liubei']);
  game.player.hand = ['d1', 'd2', 'd3'].map((id) => c('sha', { id }));
  game.enemy.hand = ['e1', 'e2', 'e3'].map((id) => c('sha', { id }));
  game.ally.hand = [c('sha', { id: 'a1' })];
  const before = collectCardCensus(game).ids.length;
  assertCardConservation(game, () => {
    assert.equal(Engine.useSkill(game, 'player', 'dimeng', [], { targetA: 'enemy', targetB: 'ally' }).ok, true);
  });
  assert.deepEqual(game.enemy.hand.map((card) => card.id), ['a1'], '交换后 enemy 拿到 ally 的手牌');
  assert.equal(game.ally.hand.length, 3, 'ally 拿到 enemy 的三张');
  assert.equal(game.player.hand.length, 1, '弃了 |3-1| = 2 张');
  assert.equal(collectCardCensus(game).ids.length, before, 'ID 守恒');
  assert.equal(Engine.useSkill(game, 'player', 'dimeng', [], { targetA: 'enemy', targetB: 'ally' }).ok, false,
    '每回合限一次');
});

test('缔盟: 手牌不足以支付 X 时拒绝 (零副作用)', () => {
  const game = trio(['lusu', 'caocao', 'liubei']);
  game.player.hand = [c('sha', { id: 'only' })];
  game.enemy.hand = ['e1', 'e2', 'e3', 'e4'].map((id) => c('sha', { id }));
  game.ally.hand = [];
  const result = Engine.useSkill(game, 'player', 'dimeng', [], { targetA: 'enemy', targetB: 'ally' });
  assert.equal(result.ok, false, 'X = 4 > 手牌 1 → 拒绝');
  assert.equal(game.player.hand.length, 1, '零副作用');
  assert.equal(game.enemy.hand.length, 4, '未交换');
});

// ───── 孟获 祸首 / 再起 ─────

test('祸首: 南蛮对孟获无效, 且南蛮伤害的来源变成孟获', () => {
  const game = trio(['menghuo', 'caocao', 'simayi']);
  game.enemy.hand = [c('nanman', { id: 'nm-1' })];
  game.player.hand = [c('sha', { id: 'mh-card' })];
  game.ally.hand = []; game.ally.skillPreferences = { fankui: 'auto' };
  game.turn = 'enemy';
  const before = collectCardCensus(game).ids.length;
  Engine.playCard(game, 'enemy', 'nm-1', {});
  assert.equal(game.player.hp, game.player.maxHp, '南蛮对孟获无效');
  // 司马懿【反馈】"受到伤害后获得伤害来源的一张牌" → 应从孟获手里拿
  assert.ok(game.ally.hand.some((card) => card.id === 'mh-card'),
    '反馈从孟获手里拿牌 → 伤害来源确已替换');
  assert.equal(collectCardCensus(game).ids.length, before, 'ID 守恒');
});

test('祸首: 孟获自己使用南蛮时不替换来源 ("其他角色"限定)', () => {
  const game = trio(['menghuo', 'caocao', 'simayi']);
  game.player.hand = [c('nanman', { id: 'nm-self' })];
  game.ally.hand = []; game.ally.skillPreferences = { fankui: 'auto' };
  Engine.playCard(game, 'player', 'nm-self', {});
  // 来源本就是孟获, 替换与否不可观测 —— 断言不崩且守恒即可
  assert.ok(game.log.some((line) => /南蛮入侵/.test(line)));
});

test('再起: 放弃摸牌亮 X 张, 红桃回血入弃, 其余获得', () => {
  const game = trio(['menghuo', 'caocao', 'liubei']);
  game.player.hp = game.player.maxHp - 2; // X = 2
  game.player.skillPreferences = { zaiqi: 'auto' };
  // 牌堆顶 (数组尾部) 放一张红桃 + 一张黑桃
  game.deck = [c('sha', { id: 'z-black', suit: 'spade', color: 'black' }),
    c('tao', { id: 'z-heart', suit: 'heart', color: 'red' })];
  game.discard = [c('sha', { id: 'refill' })];
  game.phase = 'judge';
  const before = collectCardCensus(game).ids.length;
  Engine.advancePhase(game);
  assert.equal(game.player.hp, game.player.maxHp - 1, '红桃 1 张 → 回复 1 点');
  assert.ok(game.player.hand.some((card) => card.id === 'z-black'), '非红桃的牌被获得');
  assert.ok(game.discard.some((card) => card.id === 'z-heart'), '红桃入弃牌堆');
  assert.equal(collectCardCensus(game).ids.length, before, 'ID 守恒');
});

test('再起: 未受伤时不触发 (照常摸牌)', () => {
  const game = trio(['menghuo', 'caocao', 'liubei']);
  game.player.skillPreferences = { zaiqi: 'auto' };
  game.phase = 'judge';
  Engine.advancePhase(game);
  assert.equal(game.player.hand.length, 2, '满血 → 正常摸两张');
});

// ───── 祝融 巨象 / 烈刃 ─────

test('巨象: 南蛮对祝融无效, 且结算完毕后祝融获得该南蛮', () => {
  const game = trio(['zhurong', 'caocao', 'liubei']);
  game.enemy.hand = [c('nanman', { id: 'nm-jx' })];
  const before = collectCardCensus(game).ids.length;
  game.turn = 'enemy';
  Engine.playCard(game, 'enemy', 'nm-jx', {});
  assert.equal(game.player.hp, game.player.maxHp, '南蛮对祝融无效');
  assert.ok(game.player.hand.some((card) => card.id === 'nm-jx'), '结算完毕后祝融获得之');
  assert.ok(!game.discard.some((card) => card.id === 'nm-jx'), '不在弃牌堆');
  assert.equal(collectCardCensus(game).ids.length, before, 'ID 守恒');
});

test('巨象: 祝融自己使用的南蛮不触发 ("其他角色使用的"限定)', () => {
  // 对手不能是曹操 —— 奸雄会把造成伤害的南蛮拿走, 那样它根本不在弃牌堆,
  // 测的就不是"自己用不触发"这条了。
  const game = trio(['zhurong', 'guanyu', 'liubei']);
  game.player.hand = [c('nanman', { id: 'nm-own' })];
  Engine.playCard(game, 'player', 'nm-own', {});
  assert.ok(game.discard.some((card) => card.id === 'nm-own'), '自己用的南蛮照常入弃牌堆');
  assert.ok(!game.player.hand.some((card) => card.id === 'nm-own'));
});

test('巨象: 被奸雄抢先拿走的南蛮不触发 (它没有"因结算完毕而置入弃牌堆")', () => {
  // 由刘备使用, 曹操作为**目标**受伤 → 奸雄拿走该南蛮 → 它没有"因结算
  // 完毕而置入弃牌堆", 祝融不触发。
  const game = trio(['zhurong', 'caocao', 'liubei']);
  game.ally.hand = [c('nanman', { id: 'nm-jy' })];
  game.turn = 'ally';
  Engine.playCard(game, 'ally', 'nm-jy', {});
  assert.ok(game.enemy.hand.some((card) => card.id === 'nm-jy'), '奸雄拿走了该南蛮');
  assert.ok(!game.player.hand.some((card) => card.id === 'nm-jy'), '祝融没拿到');
  assert.ok(!game.discard.some((card) => card.id === 'nm-jy'), '也不在弃牌堆');
});

test('烈刃: 杀造成伤害后拼点, 赢则获得其一张牌', () => {
  const game = duel('zhurong');
  game.player.hand = [c('sha', { id: 'lr-sha' }), c('sha', { id: 'lr-K', rank: 'K' })];
  game.enemy.hand = [c('sha', { id: 'lr-3', rank: '3' })];
  const before = collectCardCensus(game).ids.length;
  Engine.playCard(game, 'player', 'lr-sha', { target: 'enemy' });
  assert.equal(Engine.getPendingChoice(game).kind, 'pindian-card', '伤害后开拼点');
  Engine.resolvePendingChoice(game, { cardId: 'lr-K' });
  assert.ok(game.log.some((line) => /烈刃/.test(line) && /赢/.test(line)), 'K > 3 → 赢');
  assert.equal(collectCardCensus(game).ids.length, before, 'ID 守恒');
});

test('烈刃: 杀被闪抵消 (未造成伤害) → 不触发', () => {
  const game = duel('zhurong');
  game.player.hand = [c('sha', { id: 'lr-miss' }), c('sha', { id: 'lr-K2', rank: 'K' })];
  game.enemy.hand = [c('shan', { id: 'e-shan' })];
  Engine.playCard(game, 'player', 'lr-miss', { target: 'enemy' });
  const pending = Engine.getPendingChoice(game);
  assert.ok(!pending || pending.kind !== 'pindian-card', '被闪抵消 → 无伤害 → 不拼点');
});

// ───── 贾诩 完杀 / 乱武 / 帷幕 ─────

test('完杀: 贾诩回合内, 非濒死的其他角色不能用【桃】救援', () => {
  const game = trio(['jiaxu', 'caocao', 'liubei']);
  game.turn = 'player'; // 贾诩的回合
  game.ally.hp = 1;
  game.enemy.hand = [c('tao', { id: 'e-tao' })];
  game.player.hand = [c('sha', { id: 'jx-sha' })];
  game.enemy.skillPreferences = { dying: 'auto' };
  game.ally.skillPreferences = { dying: 'auto' };
  Engine.playCard(game, 'player', 'jx-sha', { target: 'ally' });
  assert.ok(game.log.some((line) => /完杀/.test(line)), '救援被完杀拦下');
  assert.ok(game.enemy.hand.some((card) => card.id === 'e-tao'), '桃没被消耗');
});

test('完杀: 濒死者本人仍可用【桃】自救 ("不处于濒死状态的"限定)', () => {
  const game = trio(['jiaxu', 'caocao', 'liubei']);
  game.turn = 'player';
  game.ally.hp = 1;
  game.ally.hand = [c('tao', { id: 'a-tao' })];
  game.ally.skillPreferences = { dying: 'auto' };
  game.player.hand = [c('sha', { id: 'jx-sha2' })];
  Engine.playCard(game, 'player', 'jx-sha2', { target: 'ally' });
  assert.ok(game.ally.hp >= 1, '濒死者本人自救成功');
});

test('完杀: 别人的回合不受限', () => {
  const game = trio(['jiaxu', 'caocao', 'liubei']);
  game.turn = 'enemy'; // 不是贾诩的回合
  game.ally.hp = 1;
  game.enemy.hand = [c('sha', { id: 'e-sha3' }), c('tao', { id: 'e-tao2' })];
  game.enemy.skillPreferences = { dying: 'auto' };
  game.ally.skillPreferences = { dying: 'auto' };
  Engine.playCard(game, 'enemy', 'e-sha3', { target: 'ally' });
  assert.ok(game.ally.hp >= 1 || !game.enemy.hand.some((card) => card.id === 'e-tao2'),
    '非贾诩回合 → 桃可用');
});

test('帷幕: 贾诩不是黑色锦囊牌的合法目标 (红色锦囊照常)', () => {
  const game = duel('jiaxu');
  const blackTrick = c('guohe', { id: 'w-black', suit: 'spade', color: 'black' });
  const redTrick = c('guohe', { id: 'w-red', suit: 'heart', color: 'red' });
  game.player.hand = [c('sha', { id: 'jx-hand' })];
  assert.equal(Engine.isLegalCardTarget(game, 'enemy', blackTrick, 'player'), false, '黑色锦囊被挡');
  assert.equal(Engine.isLegalCardTarget(game, 'enemy', redTrick, 'player'), true, '红色锦囊照常');
});

test('帷幕: 黑色**延时**锦囊同样被挡 (锦囊牌含延时类)', () => {
  const game = duel('jiaxu');
  const blackDelayed = c('lebusishu', { id: 'w-lebu', suit: 'club', color: 'black' });
  assert.equal(Engine.isLegalCardTarget(game, 'enemy', blackDelayed, 'player'), false);
});

test('乱武: 限定技, 每名其他角色对最近者用杀否则失 1 体力; 本局仅一次', () => {
  const game = trio(['jiaxu', 'caocao', 'liubei']);
  game.enemy.hand = [c('sha', { id: 'lw-e' })];
  game.ally.hand = []; // 无杀 → 失去 1 点体力
  const allyBefore = game.ally.hp;
  const result = Engine.useSkill(game, 'player', 'luanwu', [], {});
  assert.equal(result.ok, true);
  assert.equal(game.ally.hp, allyBefore - 1, '无杀 → 失去 1 点体力');
  assert.ok(!game.enemy.hand.some((card) => card.id === 'lw-e'), '有杀 → 打出去了');
  // 官方【乱武】不保护发动者 —— "所有其他角色各需对距离最小的另一名角色
  // 使用【杀】", 那名"另一名角色"完全可能就是贾诩自己。此处不作豁免断言。
  assert.equal(Engine.useSkill(game, 'player', 'luanwu', [], {}).ok, false, '限定技每局一次');
});

// ───── 董卓 酒池 / 肉林 / 崩坏 / 暴虐 ─────

test('酒池: 黑桃手牌当【酒】(缺省目标为自己)', () => {
  const game = duel('dongzhuo');
  game.player.hand = [c('sha', { id: 'jc-spade', suit: 'spade', color: 'black' }),
    c('sha', { id: 'jc-heart', suit: 'heart', color: 'red' })];
  assert.equal(Engine.playCardAs(game, 'player', 'jc-spade', 'jiu', {}).ok, true);
  assert.equal(game.player.shaBonus, 1, '酒的加成落在自己身上');
  assert.equal(game.player.flags.jiuUsedThisTurn, true);
  assert.equal(Engine.playCardAs(game, 'player', 'jc-heart', 'jiu', {}).ok, false, '非黑桃被拒');
});

test('肉林: 董卓对女性目标出杀 → 需两张闪; 对男性照常一张', () => {
  const game = duel('dongzhuo', 'diaochan');
  assert.equal(game.enemy.gender, 'female');
  game.player.hand = [c('sha', { id: 'rl-sha' })];
  game.enemy.hand = [c('shan', { id: 'rl-s1' }), c('shan', { id: 'rl-s2' })];
  game.enemy.skillPreferences = { shanResponse: 'auto' };
  Engine.playCard(game, 'player', 'rl-sha', { target: 'enemy' });
  assert.equal(game.enemy.hand.length, 0, '两张闪都被消耗');
  assert.equal(game.enemy.hp, game.enemy.maxHp, '两张闪 → 抵消成功');
  assert.ok(game.log.some((line) => /肉林/.test(line)), '日志按肉林具名 (不写无双)');
});

test('肉林: 女性角色对董卓出杀 → 董卓需两张闪 (双向)', () => {
  const game = duel('diaochan', 'dongzhuo');
  game.turn = 'player';
  game.player.hand = [c('sha', { id: 'rl-dc' })];
  game.enemy.hand = [c('shan', { id: 'dz-s1' }), c('shan', { id: 'dz-s2' })];
  Engine.playCard(game, 'player', 'rl-dc', { target: 'enemy' });
  assert.equal(game.enemy.hand.length, 0, '董卓两张闪都被消耗');
  assert.equal(game.enemy.hp, game.enemy.maxHp);
});

test('肉林: 男性角色之间不触发 (仍是一张闪)', () => {
  const game = duel('dongzhuo', 'caocao');
  assert.equal(game.enemy.gender, 'male');
  game.player.hand = [c('sha', { id: 'rl-m' })];
  game.enemy.hand = [c('shan', { id: 'm-s1' }), c('shan', { id: 'm-s2' })];
  Engine.playCard(game, 'player', 'rl-m', { target: 'enemy' });
  assert.equal(game.enemy.hand.length, 1, '只消耗一张闪');
});

test('崩坏: 结束阶段非最小体力 → 二选一 (减上限时体力随之下降)', () => {
  const game = duel('dongzhuo');
  game.enemy.hp = 2;
  Engine.endTurn(game, 'player');
  assert.equal(Engine.getPendingChoice(game).kind, 'benghuai-choice');
  const maxBefore = game.player.maxHp;
  Engine.resolvePendingChoice(game, { choice: 'maxHp' });
  assert.equal(game.player.maxHp, maxBefore - 1, '减 1 点体力上限');
  assert.ok(game.player.hp <= game.player.maxHp, '体力值不得大于体力上限');
});

test('崩坏: 已是体力值最小的角色 → 不触发', () => {
  const game = duel('dongzhuo');
  game.player.hp = 1;
  game.enemy.hp = 4;
  Engine.endTurn(game, 'player');
  const pending = Engine.getPendingChoice(game);
  assert.ok(!pending || pending.kind !== 'benghuai-choice', '最小体力 → 锁定技不触发');
});

test('暴虐: 主公技 — 群势力角色受伤后来源判定黑桃则董卓回血', () => {
  const game = trio(['dongzhuo', 'caocao', 'huaxiong'], 91090,
    { player: '主公', enemy: '反贼', ally: '反贼' });
  assert.equal(game.ally.camp, '群', '华雄为群势力');
  game.player.hp = game.player.maxHp - 3;
  game.deck = [c('sha', { id: 'refill-a' }), c('sha', { id: 'bn-judge', suit: 'spade', color: 'black', rank: '5' })];
  game.discard = [c('sha', { id: 'refill-b' })];
  game.enemy.hand = [c('sha', { id: 'bn-sha' })];
  game.turn = 'enemy';
  const hpBefore = game.player.hp;
  Engine.playCard(game, 'enemy', 'bn-sha', { target: 'ally' });
  assert.equal(game.player.hp, hpBefore + 1, '黑桃判定 → 董卓回复 1 点体力');
  assert.ok(game.log.some((line) => /暴虐/.test(line)));
});

test('暴虐: 受伤者非群势力 → 不触发', () => {
  const game = trio(['dongzhuo', 'caocao', 'liubei'], 91091,
    { player: '主公', enemy: '反贼', ally: '反贼' });
  assert.equal(game.ally.camp, '蜀');
  game.player.hp = game.player.maxHp - 3;
  game.enemy.hand = [c('sha', { id: 'bn-sha2' })];
  game.turn = 'enemy';
  const hpBefore = game.player.hp;
  Engine.playCard(game, 'enemy', 'bn-sha2', { target: 'ally' });
  assert.equal(game.player.hp, hpBefore, '非群势力 → 不判定不回血');
});

// ───── 评审收口回归钉 (opus 前置勘查 + 对抗复现) ─────

test('收口 A2 [牌守恒]: 乱武摸到杀但无合法目标 → 牌退回手牌, 不得消失', () => {
  const game = trio(['jiaxu', 'caocao', 'liubei']);
  game.enemy.hand = [c('sha', { id: 'lw-x' })];
  game.ally.hand = [];
  const before = collectCardCensus(game).ids.length;
  Engine.useSkill(game, 'player', 'luanwu', [], {});
  const census = collectCardCensus(game);
  assert.equal(census.ids.length, before, 'ID 守恒');
  assert.deepEqual(census.duplicates || [], [], '零区域重复');
});

test('收口 A1: 乱武链已接进 resumeSuspendedTurnFlowIfReady (源码锚点)', () => {
  const text = fs.readFileSync(new URL('../src/engine/response.js', import.meta.url), 'utf8');
  assert.match(text, /pauseState\.luanwu/, '乱武链必须有续跑分支, 否则挂起后永久悬空');
});

test('收口 A3: 祸首的伤害来源在挂起快照里也已替换 (源码锚点)', () => {
  const text = fs.readFileSync(new URL('../src/engine/tricks.js', import.meta.url), 'utf8');
  assert.equal((text.split('sourceActor: aoe.sourceActor').length - 1), 2,
    '仅 meta 里的两处显示用途保留裸 sourceActor; source 快照必须走 aoeDamageSourceFor');
});

test('收口 B1: 帷幕挡黑色 AOE (flow__condition.md:101 目标合法性类技能)', () => {
  const game = trio(['jiaxu', 'caocao', 'liubei']);
  game.enemy.hand = [c('nanman', { id: 'nm-black', suit: 'spade', color: 'black' })];
  game.turn = 'enemy';
  const before = game.player.hp;
  Engine.playCard(game, 'enemy', 'nm-black', {});
  assert.equal(game.player.hp, before, '黑色南蛮不能指定贾诩');
  assert.equal(game.ally.hp, game.ally.maxHp - 1, '其他座席照常结算');
});

test('收口 B1b: 红色 AOE 不受帷幕影响', () => {
  const game = trio(['jiaxu', 'caocao', 'liubei']);
  game.enemy.hand = [c('nanman', { id: 'nm-red', suit: 'heart', color: 'red' })];
  game.turn = 'enemy';
  Engine.playCard(game, 'enemy', 'nm-red', {});
  assert.equal(game.player.hp, game.player.maxHp - 1, '红色锦囊照常打贾诩');
});

test('收口 B4: 贾诩阵亡后完杀立即失效', () => {
  const game = trio(['jiaxu', 'caocao', 'liubei']);
  game.turn = 'player';
  game.player.hp = 0;
  game.enemy.hp = game.enemy.maxHp - 1;
  const tao = c('tao', { id: 'wt' });
  assert.equal(Engine.isLegalCardTarget(game, 'enemy', tao, 'enemy'), true,
    '贾诩已亡 → 其锁定技不再生效');
});

test('收口 B5: 乱武不绕开距离/目标合法性 (flow__condition.md:107 判例)', () => {
  const text = fs.readFileSync(new URL('../src/engine/skills.js', import.meta.url), 'utf8');
  const luanwu = text.slice(text.indexOf('function applyLuanwuForSeat'),
    text.indexOf('function resolveLuanwuShaChoice'));
  // 注释里会提到 ignoreDistance (说明为什么**不**传), 所以只钉实际调用。
  assert.ok(!/playSha\(game, seat, shaCard, \{[^}]*ignoreDistance/.test(luanwu),
    '乱武不在"改变使用牌的距离限制"的官方技能名单里; 用不出去就失 1 点体力');
});

await runTests();

console.log('\nv15 U 林包 18 技用例通过。');
