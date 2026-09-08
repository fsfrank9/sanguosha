// AC3 empirical data collection. This module only observes real Engine calls;
// no production counters, alternate AI profile, or hidden-information features.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Engine, c, StateRuntime } from './load-engine.mjs';

export const PACKS = ['fire', 'lin', 'shan', 'sp'];
export const CATALOG = PACKS.flatMap(pack => {
  const spec = JSON.parse(fs.readFileSync(new URL(`../fixtures/official_${pack}_skill_specs.json`, import.meta.url)));
  return spec.heroes.flatMap(hero => hero.skills.filter(skill => Engine.IMPLEMENTED_SKILL_IDS.includes(skill.localSkillId))
    .map(skill => ({ pack, hero: hero.localHeroId, id: skill.localSkillId, name: skill.name })));
});
export const GOD_CATALOG = JSON.parse(fs.readFileSync(new URL('../fixtures/official_god_skill_specs.json', import.meta.url)))
  .heroes.flatMap(hero => hero.skills.map(skill => ({ pack: 'god', hero: hero.localHeroId, id: skill.localSkillId, name: skill.name })));
const seats = ['player', 'enemy', 'ally', 'ally2'];
let serial = 0;
export const card = (type = 'shan', suit = 'spade', rank = '5') => c(type, {
  id: `ac-${++serial}`, suit, color: ['heart', 'diamond'].includes(suit) ? 'red' : 'black', rank
});
const hand = (count, type = 'shan', suit = 'spade') => Array.from({ length: count }, () => card(type, suit));

export function controlledGame(hero, options = {}) {
  const game = Engine.newGame({ seed: 169301, seats, hiddenRoles: false,
    roles: { player: '主公', enemy: '反贼', ally: '忠臣', ally2: '反贼' },
    playerHero: 'guanyu', enemyHero: hero, allyHero: 'ganning', ally2Hero: 'zhangfei', ...options });
  for (const seat of seats) {
    Object.assign(game[seat], { hand: [], judgeArea: [], flags: {}, skillPreferences: {}, tian: [],
      equipment: { weapon: null, armor: null, horsePlus: null, horseMinus: null }, turnedOver: false, chained: false });
    game[seat].hp = game[seat].maxHp;
  }
  // Only the human seat's responses are scripted. Evaluated non-player seats
  // retain production preference defaults, including optional phase skills.
  game.player.skillPreferences = { dying: 'auto', shanResponse: 'auto', shaDuelResponse: 'auto', wuxieResponse: 'auto' };
  Object.assign(game, { turn: 'enemy', phase: 'play', log: [], discard: [], pendingChoice: null,
    pendingChoiceQueue: [], pauseState: {}, pendingExtraTurns: [], extraTurnReturnSeat: null });
  game.deck = Array.from({ length: 100 }, (_, i) => card('sha', ['spade', 'heart', 'club', 'diamond'][i % 4]));
  return game;
}

export function settle(game, limit = 100) {
  for (let i = 0; game.pendingChoice && i < limit; i++) {
    const p = game.pendingChoice;
    let ds;
    switch (p.kind) {
      case 'pindian-pick': ds = [{ cardId: game[p.actor].hand[0]?.id }]; break;
      case 'god-choice': {
        const d = { choiceId: p.choiceId };
        if (p.optional) d.decline = true;
        else if (p.godChoiceType === 'faction') d.optionId = '魏';
        else if (p.godChoiceType === 'wumou') d.optionId = game[p.actor].godMarks?.rage > 0 ? 'rage' : 'hp';
        else if (p.godChoiceType === 'shelie-pick') d.cardIds = [...new Map(p.cards.map(c => [c.suit, c.id])).values()];
        else {
          if (p.options?.length) d.optionId = p.options.find(x => !x.disabled)?.id;
          if (p.cards?.length) d.cardIds = p.cards.filter(x => !x.disabled).slice(0, p.cardMin || 0).map(x => x.id);
          if (p.starCards?.length) d.starIds = p.starCards.slice(0, p.starMin || 0).map(x => x.id);
          if (p.targets?.length) d.targetActors = p.targets.slice(0, p.targetMin || 0).map(x => x.actor);
        }
        ds = [d]; break;
      }
      case 'fanjian-guess': ds = [{ suit: 'spade' }]; break;
      case 'cixiong-choose': ds = [{ option: 'draw' }]; break;
      case 'ganglie-source-choice': ds = [{ mode: 'takeDamage' }]; break;
      case 'huogong-show': ds = [{ cardId: p.cardIds?.[0] }]; break;
      case 'wugu-pick': ds = [{ cardId: p.cards?.[0]?.id }]; break;
      case 'yaowu-reward': ds = [{ choice: 'draw' }]; break;
      case 'yongsi-discard': ds = [{ cardIds: p.options.slice(0, p.count).map(x => x.cardId) }]; break;
      case 'guohe-1v1-pick': {
        const x = p.equipment?.[0] || p.hand?.[0] || p.judgeArea?.[0];
        ds = [{ zone: p.equipment?.length ? 'equipment' : p.hand?.length ? 'hand' : 'judge', cardId: x?.cardId }]; break;
      }
      case 'fankui-pick': ds = [p.zones?.[0]?.zone === 'equipment'
        ? { zone: 'equipment', cardId: p.zones[0].cardId } : { zone: 'hand' }]; break;
      default: ds = [{ decline: true, skip: true, use: false }, { auto: true },
        { cardId: p.cards?.[0]?.cardId || p.options?.[0]?.cardId, target: p.candidates?.[0]?.seat }, {}];
    }
    let resolved = false;
    for (const d of ds) {
      const result = Engine.resolvePendingChoice(game, d);
      if (result?.ok && game.pendingChoice !== p) { resolved = true; break; }
      assert.equal(game.pendingChoice, p, 'rejected response preserves the pending window');
    }
    assert.ok(resolved, `AC unresolved ${p.kind}/${p.godChoiceType || ''}`);
  }
  assert.equal(game.pendingChoice, null, 'controlled observation must finish its pending response');
}

function snapshot(game) {
  return Object.fromEntries(seats.map(s => [s, { hp: game[s].hp, maxHp: game[s].maxHp,
    cards: game[s].hand.length + Object.values(game[s].equipment).filter(Boolean).length,
    hand: game[s].hand.length, tian: game[s].tian?.length || 0, turned: +!!game[s].turnedOver }]));
}
function delta(before, after) {
  return Object.fromEntries(seats.map(s => [s, Object.fromEntries(Object.keys(before[s]).map(k => [k, after[s][k] - before[s][k]]))]));
}
const ai = game => Engine.aiTakeAction(game, 'enemy');
const draw = game => { game.phase = 'judge'; return Engine.advancePhase(game); };
const prepare = game => Engine.startTurn(game, 'enemy');
const hit = (game, type = 'sha', suit = 'spade', target = 'enemy', source = 'ally') => {
  game.turn = source; game.phase = 'play'; const x = card(type, suit); game[source].hand.push(x);
  return Engine.playCard(game, source, x.id, { target });
};
const logged = name => g => g.log.some(line => line.includes(`【${name}】`) && !/等待|不发动|选择放弃/.test(line));
const flag = name => g => !!g.enemy.flags[name];
const scenarios = new Map();
function add(id, opportunity, setup, action, used, note = '', options = {}) {
  scenarios.set(id, { opportunity, setup, action, used, note, options });
}

add('qiangxi', '出牌阶段，满体力且近距离敌方存活', g => {}, ai, logged('强袭'), '付1体力换敌方1伤害；局部代价，不直接认定自伤误用。');
add('quhu', '较高体力敌方有手牌，自己有K点牌', g => { g.enemy.hp = 2; g.enemy.hand = [card('shan', 'spade', 'K')]; g.ally.hand = [card('shan', 'heart', '2')]; }, ai, flag('quhuUsed'), '记录拼点整次结算；敌方最高牌仅由对照场景设定，AI仍只读手牌数。');
add('jieming', '自己受到1点伤害，友方有补牌缺口', g => {}, hit, logged('节命'));
add('bazhen', '无防具时受到杀，判定顶牌红色', g => { g.deck.push(card('sha', 'heart')); }, hit, g => g.enemy.hp === g.enemy.maxHp, '锁定虚拟八卦；使用=本次挡下杀。');
add('huoji', '红色手牌可当火攻，敌人有手牌，另有同花色付款牌', g => { g.enemy.hand = [card('shan', 'heart'), card('sha', 'spade')]; g.ally.hand = [card('shan', 'spade')]; g.enemy.usedSha = true; }, ai, logged('火计'));
add('kanpo', '敌方使用无中，自己只有黑色转换材料', g => { g.enemy.hand = [card('shan')]; }, g => hit(g, 'wuzhong', 'heart', 'ally', 'ally'), logged('看破'));
add('lianhuan', '梅花手牌可当铁索，存在敌方目标', g => { g.enemy.hand = [card('shan', 'club')]; }, ai, logged('连环'));
add('niepan', '限定技未用，1体力承受致命杀', g => { g.enemy.hp = 1; }, hit, flag('niepanUsed'), '使用=濒死后复活，包含摸3和重置状态。');
add('tianyi', '有杀与K点拼点牌，敌方有牌', g => { g.enemy.hand = [card('sha', 'spade', '3'), card('shan', 'club', 'K')]; g.ally.hand = [card('shan', 'heart', '2')]; }, ai, flag('tianyiUsed'));
add('mengjin', '自己使用杀被敌方闪避，目标还有可弃牌', g => { g.enemy.hand = [card('sha')]; g.ally.hand = [card('shan'), card('shan')]; g.player.hand = [card('shan'), card('shan')]; }, ai, logged('猛进'));
add('shuangxiong', '摸牌阶段有至少3张手牌，可选择替代摸牌', g => { g.enemy.hand = hand(4); }, draw, g => !!g.enemy.flags.shuangxiongColor, '局部摸牌量减少1；本行未假设后续决斗收益。');
add('luanji', '同花色手牌2张；敌方数多于友方数', g => { g.roles.ally2 = '忠臣'; g.enemy.hand = hand(2); }, ai, logged('乱击'));
add('xueyi', '主公有其他群势力存活且手牌超普通上限', g => { g.roles.enemy = '主公'; g.roles.player = '反贼'; g.ally.camp = '群'; g.enemy.hand = hand(g.enemy.hp + 2); }, g => { g.phase = 'discard'; return Engine.finishPlayPhase(g); }, g => g.enemy.hand.length > g.enemy.hp && Engine.getDiscardCount(g, 'enemy') === 0, '锁定技保留超过普通上限的牌；非主动选择。');
add('duanliang', '黑色非锦囊手牌，合法敌方判定区无兵粮', g => { g.enemy.hand = [card('shan')]; }, ai, logged('断粮'));
add('xingshang', '其他角色即将死亡且区域有牌', g => { g.ally.hp = 1; g.ally.hand = [card('sha')]; }, g => hit(g, 'sha', 'spade', 'ally', 'ally2'), logged('行殇'));
add('fangzhu', '自己受到伤害，场上有其他角色', g => { g.enemy.hp--; }, hit, logged('放逐'));
add('songwei', '主公曹丕存活，同势力角色黑色判定', g => { g.roles.enemy = '主公'; g.roles.player = '反贼'; g.ally.camp = '魏'; g.ally.judgeArea = [card('lebusishu')]; g.deck.push(card('sha')); }, g => { g.turn = 'ally'; g.phase = 'prepare'; return Engine.advancePhase(g); }, logged('颂威'));
add('yinghun', '准备阶段已损失2体力', g => { g.enemy.hp -= 2; g.ally.hand = hand(3); }, prepare, logged('英魂'));
add('haoshi', '正常摸牌阶段，可多摸2张', g => {}, draw, logged('好施'));
add('dimeng', '敌方3手牌、友方1手牌，自己3手牌可支付差额', g => { g.enemy.hand = hand(3); g.ally.hand = hand(3); g.ally2.hand = hand(1); g.player.hand = hand(2); }, ai, flag('dimengUsed'));
add('huoshou', '其他角色使用南蛮', g => {}, g => hit(g, 'nanman'), g => g.enemy.hp === g.enemy.maxHp, '锁定南蛮免疫；整次AOE其他伤害归于完整窗口。');
add('zaiqi', '摸牌阶段损失2体力；待亮牌有红桃', g => { g.enemy.hp -= 2; g.deck.push(card('sha', 'heart'), card('sha', 'spade')); }, draw, logged('再起'));
add('juxiang', '其他角色使用南蛮，实体牌待结算', g => {}, g => hit(g, 'nanman'), logged('巨象'));
add('lieren', '自己杀造成伤害，双方仍有拼点牌', g => { g.enemy.hand = [card('sha'), card('shan', 'spade', 'K')]; g.ally.hand = [card('sha', 'spade', '2')]; g.player.hand = [card('sha', 'spade', '2')]; }, ai, logged('烈刃'));
add('wansha', '自己回合杀濒死敌人，第三方持桃', g => { g.ally.hp = 1; g.player.hand = [card('tao', 'heart')]; g.enemy.hand = [card('sha')]; }, g => Engine.playCard(g, 'enemy', g.enemy.hand[0].id, { target: 'ally' }), g => g.ally.hp <= 0 && g.player.hand.length === 1, '锁定救援限制；固定杀由测试提供触发，救援响应为原生AI。');
add('luanwu', '至少2敌方且其中一人2体力，限定技未用', g => { g.ally.hp = 2; }, ai, flag('luanwuUsed'));
add('weimu', '自己成为黑色南蛮候选目标', g => {}, g => hit(g, 'nanman'), g => g.enemy.hp === g.enemy.maxHp, '锁定黑锦囊目标免疫。');
add('jiuchi', '黑桃非酒手牌与杀，敌人存活', g => { g.enemy.hand = [card('shan'), card('sha', 'heart')]; }, ai, logged('酒池'));
add('roulin', '杀女性目标，目标仅持1闪', g => { g.ally.gender = 'female'; g.ally.hand = [card('shan')]; g.player.gender = 'female'; g.player.hand = [card('shan')]; g.enemy.hand = [card('sha')]; }, ai, g => g.ally.hp < g.ally.maxHp || g.player.hp < g.player.maxHp, '锁定双闪门槛；使用=一闪不足时命中。');
add('benghuai', '结束阶段自己体力高于另一角色', g => { g.ally.hp = 2; }, g => { g.phase = 'finish'; return Engine.endTurn(g); }, logged('崩坏'), '强制负面技能，损失不可称为AI滥用。');
add('baonue', '董卓主公受伤，同群角色造成伤害，判定黑桃', g => { g.roles.enemy = '主公'; g.roles.player = '反贼'; g.enemy.hp--; g.ally2.camp = '群'; g.deck.push(card('sha')); }, g => hit(g, 'sha', 'spade', 'ally', 'ally2'), logged('暴虐'));
add('qiaobian', '有成本牌；摸牌阶段两名敌方各有手牌', g => { g.enemy.hand = hand(1); g.player.hand = hand(1); g.ally.hand = hand(1); }, draw, logged('巧变'), '本行单独量摸牌分支；Z出牌移动分支另有测试。');
add('tuntian', '回合外失去一张手牌，判定非红桃', g => { g.enemy.hand = hand(1); g.deck.push(card('sha')); }, g => hit(g, 'shunshou'), g => g.enemy.tian.length === 1);
add('zaoxian', '准备阶段有3张田，尚未觉醒', g => { g.enemy.tian = hand(3); }, prepare, flag('zaoxianAwakened'), '锁定觉醒：减上限，获得急袭；后续能力不折算为HP。');
add('jixi', '已获得急袭，有田和合法敌方可获取区域牌', g => { StateRuntime.grantSkill(g.enemy, 'jixi', '急袭'); g.enemy.tian = hand(1); g.ally.hand = hand(1); }, ai, logged('急袭'));
add('tiaoxin', '敌方攻击范围内有自己，敌方持可弃牌', g => { g.ally.hand = hand(1); }, ai, flag('tiaoxinUsed'));
add('zhiji', '准备阶段手牌为空，尚未觉醒', g => {}, prepare, flag('zhijiAwakened'), '锁定觉醒，局部包括所选回血/摸牌。');
add('xiangle', '敌方使用杀且无额外基本牌可付', g => {}, hit, g => g.enemy.hp === g.enemy.maxHp, '锁定杀附加成本。');
add('fangquan', '出牌前仅有闪可支付，存活友方有杀且敌方存活', g => { g.enemy.hand = hand(1); g.ally2.hand = [card('sha')]; }, g => { g.phase = 'draw'; Engine.advancePhase(g); if (g.phase === 'play') Engine.finishPlayPhase(g); if (g.phase === 'discard') Engine.advancePhase(g); if (g.phase === 'finish') Engine.endTurn(g); return { ok: true }; }, logged('放权'), '支付1牌换友方额外回合；窗口只观察授予，不估算整个额外回合胜率。');
add('ruoyu', '主公准备阶段最低体力，尚未觉醒', g => { g.roles.enemy = '主公'; g.roles.player = '反贼'; g.enemy.hp = 2; }, prepare, flag('ruoyuAwakened'));
add('jiang', '自己使用红色杀', g => { g.enemy.hand = [card('sha', 'heart')]; }, ai, logged('激昂'));
add('hunzi', '准备阶段1体力，尚未觉醒', g => { g.enemy.hp = 1; }, prepare, flag('hunziAwakened'));
add('zhiba', '吴势力友方有2手牌；孙策主公有K点牌', g => { g.roles.enemy = '主公'; g.roles.player = '反贼'; g.roles.ally2 = '忠臣'; g.ally2.camp = '吴'; g.enemy.hand = [card('shan', 'spade', 'K')]; g.ally2.hand = [card('shan', 'club', '2'), card('shan', 'heart', '3')]; }, g => { g.turn = 'ally2'; return Engine.aiTakeAction(g, 'ally2'); }, logged('制霸'), '发动者为主公友方AI；收益归技能持有者。');
add('zhijian', '自己手持装备，存活友方有相应空装备栏', g => { g.enemy.hand = [card('qinggang')]; }, ai, logged('直谏'));
add('guzheng', '其他角色弃牌阶段弃2张手牌', g => { g.ally.hp = 2; g.ally.hand = hand(4); }, g => { g.turn = 'ally'; g.phase = 'discard'; Engine.discardSelected(g, 'ally', g.ally.hand.slice(0, 2).map(x => x.id)); return Engine.advancePhase(g); }, logged('固政'));
add('beige', '友方受到杀伤害，自己有弃牌成本，判定红桃', g => { g.enemy.hand = hand(1); g.deck.push(card('sha', 'heart')); }, g => hit(g, 'sha', 'spade', 'ally2'), logged('悲歌'));
add('duanchang', '自己1体力被有技能的敌方杀死', g => { g.enemy.hp = 1; }, hit, g => g.ally.skills.length === 0, '死亡后的锁定惩罚；自己死亡不是主动AI成本。');
add('danji', '曹操主公，准备阶段手牌数高于体力', g => { g.enemy.hand = hand(5); }, prepare, flag('danjiAwakened'), '', { playerHero: 'caocao' });
add('yongsi', '摸牌阶段有多个存活势力', g => {}, draw, logged('庸肆'), '只量额外摸牌；强制弃牌成本在另一个阶段，不能将这里净增牌当整回合收益。');
add('weidi', '非主公袁术视为拥有主公颂威，其他魏角色黑色判定', g => { g.ally.camp = '魏'; g.ally.judgeArea = [card('lebusishu')]; g.deck.push(card('sha')); }, g => { g.turn = 'ally'; g.phase = 'prepare'; return Engine.advancePhase(g); }, g => g.enemy.hand.length === 1, '视为拥有主公技能后获得颂威摸牌；不将伪帝本身视为主动发动。', { playerHero: 'caopi' });

export function runControlled() {
  return CATALOG.map(entry => {
    const s = scenarios.get(entry.id);
    assert.ok(s, `missing controlled opportunity for ${entry.id}`);
    const game = controlledGame(entry.hero, s.options);
    s.setup(game);
    assert.ok(StateRuntime.skillEnabled(game.enemy, entry.id, game), `${entry.id} must be enabled in its opportunity`);
    const groups = { self: ['enemy'], friends: seats.filter(seat => seat !== 'enemy' && !StateRuntime.perceivedHostile(game, 'enemy', seat)),
      foes: seats.filter(seat => seat !== 'enemy' && StateRuntime.perceivedHostile(game, 'enemy', seat)) };
    const before = snapshot(game);
    const result = s.action(game);
    assert.ok(!result || result.ok !== false, `${entry.id}: ${result?.message}`);
    settle(game);
    const row = { ...entry, opportunity: s.opportunity, opportunities: 1, uses: +!!s.used(game), groups,
      delta: delta(before, snapshot(game)), note: s.note, logs: game.log.slice() };
    // Keep the neutral legal opportunity above; add a tactical opportunity
    // instead of rewriting it to inflate the apparent use rate.
    if (entry.id === 'lianhuan' || entry.id === 'jiuchi' || entry.id === 'quhu') {
      const tactical = controlledGame(entry.hero); s.setup(tactical);
      if (entry.id === 'lianhuan') tactical.ally2.chained = true;
      else if (entry.id === 'jiuchi') tactical.player.hp = 2;
      else tactical.ally.equipment.weapon = card('zhangba');
      const tacticalBefore = snapshot(tactical);
      const r = s.action(tactical); assert.ok(r?.ok, r?.message); settle(tactical);
      row.additional = { opportunity: entry.id === 'lianhuan' ? '友方已横置，可解除连锁'
        : entry.id === 'jiuchi' ? '敌方2体力，酒杀可达击杀线' : '拼点目标装备长距离武器，可令其伤害另一敌方',
        uses: +!!s.used(tactical), delta: delta(tacticalBefore, snapshot(tactical)), logs: tactical.log.slice() };
      row.opportunities++;
      row.uses += row.additional.uses;
    }
    return row;
  });
}

export function runGapControls() {
  return ['huoji', 'lianhuan', 'duanliang', 'jiuchi', 'qiaobian', 'jixi', 'fangquan'].map(id => {
    const entry = CATALOG.find(e => e.id === id), s = scenarios.get(id);
    const game = controlledGame(entry.hero, s.options); s.setup(game);
    const before = snapshot(game);
    let result;
    if (['qiaobian', 'fangquan'].includes(id)) {
      game.enemy.skillPreferences[id] = 'auto';
      result = s.action(game);
    } else {
      const asType = { huoji: 'huogong', lianhuan: 'tiesuo', duanliang: 'bingliang', jiuchi: 'jiu', jixi: 'shunshou' }[id];
      const material = id === 'jixi' ? game.enemy.tian[0] : game.enemy.hand[0];
      assert.equal(Engine.canPlayCardAs(game, 'enemy', material.id, asType).ok, true, `${id} legal conversion opportunity`);
      result = Engine.playCardAs(game, 'enemy', material.id, asType,
        asType === 'tiesuo' ? { mode: 'chain', targets: ['player', 'ally'] } : asType === 'jiu' ? {} : { target: 'ally' });
    }
    assert.ok(result?.ok, `${id} intervention: ${result?.message}`); settle(game);
    return { id, uses: +!!s.used(game), delta: delta(before, snapshot(game)), logs: game.log.slice() };
  });
}

export const MIXED_SEEDS = 96;
export const MIXED_MAX_ACTIONS = 120;
export function runMixed(seedCount = MIXED_SEEDS, catalog = CATALOG, firstSeed = 169401) {
  const heroes = [...new Set(catalog.map(e => e.hero))];
  const totals = Object.fromEntries(catalog.map(e => [e.id, { games: 0, decisionIntervals: 0, intervalsWithSkillLog: 0, hpDelta: 0, cardDelta: 0 }]));
  let finished = 0, actions = 0;
  const pendingKinds = new Set();
  for (let i = 0; i < seedCount; i++) {
    const options = { seed: firstSeed + i, seats, hiddenRoles: i % 2 === 1, playerHero: 'guanyu' };
    // Rotate public roles as well as heroes. Keeping the human seat as the
    // sole lord would remove every native AI lord-skill opportunity.
    options.roles = Object.fromEntries(seats.map((seat, j) => [seat, ['主公', '反贼', '忠臣', '内奸'][(i + j) % 4]]));
    for (let j = 1; j < seats.length; j++) options[seats[j] + 'Hero'] = heroes[(i + j * 7) % heroes.length];
    const game = Engine.newGame(options);
    game.player.skillPreferences = { dying: 'auto', shanResponse: 'auto', shaDuelResponse: 'auto', wuxieResponse: 'auto' };
    for (const e of catalog) if (seats.slice(1).some(seat => game[seat].heroId === e.hero || game[seat].skills.some(s => s.id === e.id))) totals[e.id].games++;
    for (let step = 0; step < MIXED_MAX_ACTIONS && game.phase !== 'gameover'; step++) {
      const before = snapshot(game), startLog = game.log.length, acting = game.turn;
      for (const e of catalog) if (acting !== 'player' && StateRuntime.skillEnabled(game[acting], e.id, game)) totals[e.id].decisionIntervals++;
      if (game.pendingChoice) { pendingKinds.add(game.pendingChoice.kind); settle(game); }
      else {
        const debug = process.env.AC_AI_DEBUG ? JSON.stringify(game) : null;
        const r = Engine.runAITurn(game, game.turn);
        if (!r?.ok && !game.pendingChoice && debug) fs.writeFileSync('/tmp/ac-ai-failure.json', debug);
        assert.ok(r?.ok || game.pendingChoice, `mixed seed ${firstSeed + i} step ${step}: ${r?.message}`);
      }
      const after = snapshot(game), logs = game.log.slice(startLog);
      for (const e of catalog) {
        const holders = seats.slice(1).filter(seat => StateRuntime.ownsSkill(game[seat], e.id, game));
        for (const seat of holders) {
          const observed = logs.some(line => line.includes(`【${e.name}】`) && !/等待|不发动|选择放弃/.test(line));
          if (observed) {
            totals[e.id].intervalsWithSkillLog++;
            totals[e.id].hpDelta += after[seat].hp - before[seat].hp;
            totals[e.id].cardDelta += after[seat].cards - before[seat].cards;
          }
        }
      }
      actions++;
    }
    if (game.phase === 'gameover') finished++;
  }
  return { seeds: seedCount, firstSeed, maxActions: MIXED_MAX_ACTIONS, actions, finished,
    truncated: seedCount - finished, pendingKinds: [...pendingKinds].sort(), rows: totals };
}
