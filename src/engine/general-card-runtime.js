// AA3: 场外武将牌资源。武将牌以目录 ID 表示, 不属于 CardRuntime 游戏牌。
// 所有可变数据与随机数进度均在 game.generalCards, JSON 克隆后可独立续跑。
import { HERO_CATALOG } from '../data/heroes.js';

const VERSION = 1;
const RNG_MODULUS = 2147483647;
const RNG_MULTIPLIER = 16807;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function seatsOf(game) {
  return Array.isArray(game && game.seats) && game.seats.length
    ? game.seats : ['player', 'enemy'];
}

function validActor(game, actor) {
  return typeof actor === 'string' && seatsOf(game).includes(actor)
    && own(game, actor) && !!game[actor] && typeof game[actor] === 'object';
}

function initialRandomState(seed) {
  const numeric = Number(seed);
  const normalized = Number.isFinite(numeric) ? Math.floor(Math.abs(numeric)) : 1;
  // 与普通游戏牌独立的确定性随机流。初始化不调用/推进 game.random。
  return ((normalized % (RNG_MODULUS - 1)) + 104729) % (RNG_MODULUS - 1) + 1;
}

function nextIndex(state, length) {
  state.randomState = state.randomState * RNG_MULTIPLIER % RNG_MODULUS;
  return Math.floor((state.randomState - 1) / (RNG_MODULUS - 1) * length);
}

function initialize(game, options = {}) {
  if (!game || typeof game !== 'object') throw new TypeError('武将牌堆需要有效的对局。');
  if (game.generalCards) {
    assertConservation(game);
    return game.generalCards;
  }
  const catalog = options.catalog || HERO_CATALOG;
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    throw new TypeError('武将目录须为 heroId 到武将资料的对象。');
  }
  const catalogIds = Object.keys(catalog).sort();
  if (!catalogIds.length || catalogIds.some(id => !id || !catalog[id] || catalog[id].id !== id)) {
    throw new TypeError('武将目录包含空目录或不一致的武将 ID。');
  }
  const catalogSet = new Set(catalogIds);
  const excluded = new Set();
  for (const actor of seatsOf(game)) {
    if (!validActor(game, actor)) throw new TypeError('武将牌堆包含无效座席。');
    const heroId = game[actor].heroId || game[actor].id;
    if (!catalogSet.has(heroId)) throw new TypeError('上场武将不在指定目录内：' + heroId);
    // 旧对局可让多个座席使用同一目录武将; 目录资源按 ID 排除一次。
    excluded.add(heroId);
  }
  const state = {
    version: VERSION,
    catalogIds,
    excludedIds: catalogIds.filter(id => excluded.has(id)),
    outsideIds: catalogIds.filter(id => !excluded.has(id)),
    holdings: {},
    // 仅死亡结算的系统处理步骤登记; hp <= 0 仍可能处在求桃流程中。
    deathReturnedSeats: [],
    randomState: initialRandomState(options.seed),
  };
  game.generalCards = state;
  return state;
}

function stateFor(game, actor) {
  const state = game && game.generalCards;
  return state && state.version === VERSION && validActor(game, actor) ? state : null;
}

function holdingFor(state, actor) {
  return own(state.holdings, actor) ? state.holdings[actor] : null;
}

function draw(game, actor, count) {
  const state = stateFor(game, actor);
  if (!state || state.deathReturnedSeats.includes(actor)
      || !Number.isSafeInteger(count) || count <= 0 || !state.outsideIds.length) return [];
  const amount = Math.min(count, state.outsideIds.length);
  const holding = holdingFor(state, actor) || { hiddenIds: [], activeId: null };
  // 使用 defineProperty 使合法的自定义座席名也不会写入对象原型。
  if (!holdingFor(state, actor)) {
    Object.defineProperty(state.holdings, actor, {
      value: holding, enumerable: true, configurable: true, writable: true,
    });
  }
  const drawn = [];
  for (let i = 0; i < amount; i += 1) {
    const id = state.outsideIds.splice(nextIndex(state, state.outsideIds.length), 1)[0];
    holding.hiddenIds.push(id);
    drawn.push(id);
  }
  return drawn;
}

function select(game, actor, generalId) {
  const state = stateFor(game, actor);
  if (!state || state.deathReturnedSeats.includes(actor)) return null;
  const holding = state && holdingFor(state, actor);
  if (!holding || typeof generalId !== 'string') return null;
  const previousId = holding.activeId;
  if (previousId === generalId) return { activeId: generalId, previousId };
  const index = holding.hiddenIds.indexOf(generalId);
  if (index < 0) return null;
  holding.hiddenIds.splice(index, 1);
  if (previousId) holding.hiddenIds.push(previousId);
  holding.activeId = generalId;
  return { activeId: generalId, previousId };
}

function release(game, actor, generalIds) {
  const state = stateFor(game, actor);
  const holding = state && holdingFor(state, actor);
  if (!holding || !Array.isArray(generalIds) || !generalIds.length) return [];
  const requested = new Set(generalIds);
  // 整批写前校验: 不允许跨席归还、重复 ID、归还上场本体牌或场外牌。
  if (requested.size !== generalIds.length || generalIds.some(id => typeof id !== 'string'
      || (id !== holding.activeId && !holding.hiddenIds.includes(id)))) return [];
  holding.hiddenIds = holding.hiddenIds.filter(id => !requested.has(id));
  if (requested.has(holding.activeId)) holding.activeId = null;
  state.outsideIds.push(...generalIds);
  if (!holding.hiddenIds.length && !holding.activeId) delete state.holdings[actor];
  return generalIds.slice();
}

function releaseAll(game, actor) {
  const state = stateFor(game, actor);
  const holding = state && holdingFor(state, actor);
  if (!holding) return [];
  return release(game, actor, holding.hiddenIds.concat(holding.activeId ? [holding.activeId] : []));
}

function releaseOnDeath(game, actor) {
  const state = stateFor(game, actor);
  if (!state || state.deathReturnedSeats.includes(actor)) return [];
  // flow__death.md:35, 系统处理 c: 本体武将牌回未加入游戏武将牌堆。
  // 场外武将资源独立于普通游戏牌; 暗置/公开化身牌一并归还自己的池。
  const returned = releaseAll(game, actor);
  state.deathReturnedSeats.push(actor);
  const heroId = game[actor].heroId || game[actor].id;
  const stillOnBoard = seatsOf(game).some(seat => validActor(game, seat)
    && !state.deathReturnedSeats.includes(seat)
    && (game[seat].heroId || game[seat].id) === heroId);
  // 旧对局支持同将多席: 最后一席真正完成死亡系统处理才释放该目录 ID。
  const excludedIndex = state.excludedIds.indexOf(heroId);
  if (!stillOnBoard && excludedIndex >= 0) {
    state.excludedIds.splice(excludedIndex, 1);
    state.outsideIds.push(heroId);
    returned.push(heroId);
  }
  return returned;
}

function view(game, viewer, owner = viewer) {
  const state = stateFor(game, owner);
  if (!state) return null;
  const holding = holdingFor(state, owner) || { hiddenIds: [], activeId: null };
  const visible = { owner, activeId: holding.activeId, hiddenCount: holding.hiddenIds.length };
  if (viewer === owner) visible.hiddenIds = holding.hiddenIds.slice();
  return visible;
}

function choiceOptions(game, actor) {
  const state = stateFor(game, actor);
  const holding = state && holdingFor(state, actor);
  if (!holding) return [];
  // 当前公开牌也可再次选择, 以便化身在同一张武将牌上另选技能。
  return (holding.activeId ? [holding.activeId] : []).concat(holding.hiddenIds)
    .map(generalId => ({ generalId, active: generalId === holding.activeId }));
}

function census(game) {
  const state = game && game.generalCards;
  const zoneEntries = new Map();
  const invalidEntries = [];
  const catalogIds = state && Array.isArray(state.catalogIds) ? state.catalogIds.slice() : [];
  const catalog = new Set(catalogIds);
  if (!state || state.version !== VERSION) invalidEntries.push('武将牌堆未初始化或版本不受支持');
  if (!catalogIds.length || catalog.size !== catalogIds.length
      || catalogIds.some(id => typeof id !== 'string' || !id)) invalidEntries.push('目录 ID 无效');
  if (state && (!Number.isInteger(state.randomState) || state.randomState <= 0
      || state.randomState >= RNG_MODULUS)) invalidEntries.push('随机数进度无效');
  const add = (id, zone) => {
    if (typeof id !== 'string' || !id) { invalidEntries.push(zone + ' 包含无效 ID'); return; }
    const zones = zoneEntries.get(id) || [];
    zones.push(zone);
    zoneEntries.set(id, zones);
  };
  const addList = (ids, zone) => {
    if (!Array.isArray(ids)) { invalidEntries.push(zone + ' 不是 ID 列表'); return; }
    ids.forEach(id => add(id, zone));
  };
  if (state) {
    const deathReturnedSeats = Array.isArray(state.deathReturnedSeats) ? state.deathReturnedSeats : [];
    if (!Array.isArray(state.deathReturnedSeats)
        || new Set(deathReturnedSeats).size !== deathReturnedSeats.length
        || deathReturnedSeats.some(actor => !validActor(game, actor))) {
      invalidEntries.push('死亡归还座席台账无效');
    }
    addList(state.excludedIds, 'excluded');
    addList(state.outsideIds, 'outside');
    if (!state.holdings || typeof state.holdings !== 'object' || Array.isArray(state.holdings)) {
      invalidEntries.push('持有区无效');
    } else {
      for (const actor of Object.keys(state.holdings)) {
        if (!validActor(game, actor)) invalidEntries.push('持有区座席无效：' + actor);
        if (deathReturnedSeats.includes(actor)) invalidEntries.push('已死亡归还座席仍有持有区：' + actor);
        const holding = state.holdings[actor];
        if (!holding || typeof holding !== 'object') { invalidEntries.push(actor + ' 持有区无效'); continue; }
        addList(holding.hiddenIds, actor + '.hidden');
        if (holding.activeId !== null) add(holding.activeId, actor + '.active');
      }
    }
    // 已完成死亡系统处理的席不再占用本体牌; 濒死与终局早停不能提前归还。
    const onBoard = new Set(seatsOf(game).filter(actor => validActor(game, actor)
      && !deathReturnedSeats.includes(actor))
      .map(actor => game[actor].heroId || game[actor].id));
    const excluded = new Set(Array.isArray(state.excludedIds) ? state.excludedIds : []);
    if (onBoard.size !== excluded.size || [...onBoard].some(id => !excluded.has(id))) {
      invalidEntries.push('上场武将与排除区不一致');
    }
  }
  const ids = new Set(zoneEntries.keys());
  const zoneDuplicates = [...zoneEntries].filter(([, zones]) => zones.length > 1)
    .map(([id, zones]) => id + ' @ [' + zones.join(', ') + ']');
  return {
    catalogIds, ids, zoneEntries, zoneDuplicates, invalidEntries,
    total: [...zoneEntries.values()].reduce((sum, zones) => sum + zones.length, 0),
    missingIds: catalogIds.filter(id => !ids.has(id)),
    unknownIds: [...ids].filter(id => !catalog.has(id)),
  };
}

function assertCensus(result) {
  const problems = result.invalidEntries.concat(result.zoneDuplicates,
    result.missingIds.map(id => '缺失：' + id), result.unknownIds.map(id => '未知：' + id));
  if (problems.length) throw new Error('武将牌守恒失败：' + problems.join('; '));
}

function assertConservation(game, action) {
  const before = census(game);
  assertCensus(before);
  if (typeof action !== 'function') return before;
  const result = action();
  const after = census(game);
  assertCensus(after);
  if (before.catalogIds.length !== after.catalogIds.length
      || before.catalogIds.some(id => !after.ids.has(id))) {
    throw new Error('武将牌守恒失败：操作改变了目录资源集合。');
  }
  return result;
}

export const GeneralCardRuntime = {
  initialize, draw, select, release, releaseAll, releaseOnDeath, view, choiceOptions, census, assertConservation,
};
