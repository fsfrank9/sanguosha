// v11 A1: 全局牌守恒断言 helper。
//
// 二轮审计 (H1 丈八造牌 / M2 白银旁路 / M5 奸雄拿火杀) 证明"牌凭空增减"是
// 最危险的一类引擎 bug。本 helper 提供统一的守恒断言, 供引擎行为测试逐文件
// 接入: 任何被 assertCardConservation 包住的引擎调用, 前后全场唯一牌 ID
// 集合必须完全一致, 且没有任何一张牌同时出现在两个区域。
//
// 关键设计: 牌在响应窗口 / 五谷展示池 / 观星等挂起状态下会离开常规区域,
// 暂存在 pendingChoice(队列) 或 pauseState 快照里 ("在途")。census 对这些
// 结构做深扫并按 ID 去重 —— 在途牌被计入, 而 payload 中对区域内牌的引用
// (如反馈候选列表) 不会造成双重计数。

export const EQUIP_SLOTS = ['weapon', 'armor', 'horseMinus', 'horsePlus'];

// v12 H: 多座席对局 (identity3) 普查覆盖全部座席; 无 seats 的旧局面回退 1v1。
function censusSeats(game) {
  if (game && Array.isArray(game.seats) && game.seats.length) return game.seats;
  return ['player', 'enemy'];
}

function isCardLike(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.id === undefined || typeof value.type !== 'string') return false;
  return typeof value.suit === 'string' || typeof value.color === 'string'
    || typeof value.family === 'string';
}

// 深扫任意 pending/快照结构, 收集其中的实体牌 (虚拟牌收集其组成实体牌)。
function collectCardsDeep(value, game, sink, seen, depth) {
  if (depth > 12 || !value || typeof value !== 'object') return;
  if (value === game || typeof value === 'function') return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectCardsDeep(item, game, sink, seen, depth + 1);
    return;
  }
  if (isCardLike(value)) {
    if (value.virtual) {
      collectCardsDeep(value.physicalCards || [], game, sink, seen, depth + 1);
    } else {
      sink.push(value);
    }
    return;
  }
  for (const key of Object.keys(value)) {
    collectCardsDeep(value[key], game, sink, seen, depth + 1);
  }
}

// 全场牌普查: 常规区域逐张登记 (含所在区域名), 在途结构深扫补充。
// 返回 { ids, zoneEntries, zoneDuplicates, inFlightIds }。
export function collectCardCensus(game) {
  const zoneEntries = new Map(); // id -> [zoneName, ...]
  const registerZoneCard = (card, zone) => {
    if (!card) return;
    const list = zoneEntries.get(card.id) || [];
    list.push(zone);
    zoneEntries.set(card.id, list);
  };

  for (const card of game.deck || []) registerZoneCard(card, 'deck');
  for (const card of game.discard || []) registerZoneCard(card, 'discard');
  for (const actor of censusSeats(game)) {
    const state = game[actor];
    if (!state) continue;
    for (const card of state.hand || []) registerZoneCard(card, `${actor}.hand`);
    for (const slot of EQUIP_SLOTS) {
      if (state.equipment && state.equipment[slot]) {
        registerZoneCard(state.equipment[slot], `${actor}.equipment.${slot}`);
      }
    }
    for (const card of state.judgeArea || []) registerZoneCard(card, `${actor}.judgeArea`);
    // v12 G2: 不屈 — 武将牌上的"创"入普查
    for (const card of state.chuang || []) registerZoneCard(card, `${actor}.chuang`);
  }

  const inFlight = [];
  const seen = new WeakSet();
  collectCardsDeep(game.pendingChoice, game, inFlight, seen, 0);
  collectCardsDeep(game.pendingChoiceQueue, game, inFlight, seen, 0);
  collectCardsDeep(game.pauseState, game, inFlight, seen, 0);

  const ids = new Set(zoneEntries.keys());
  const inFlightIds = new Set();
  for (const card of inFlight) {
    if (!zoneEntries.has(card.id)) inFlightIds.add(card.id);
    ids.add(card.id);
  }

  const zoneDuplicates = [];
  for (const [id, zones] of zoneEntries) {
    if (zones.length > 1) zoneDuplicates.push(`${id} @ [${zones.join(', ')}]`);
  }

  return { ids, zoneEntries, zoneDuplicates, inFlightIds };
}

// 常规区域牌数 (deck + discard + 手牌 + 装备 + 判定区), 与二轮审计
// card_conservation.test.mjs 的旧版 countAllCards 语义一致。
export function countAllCards(game) {
  let total = (game.deck || []).length + (game.discard || []).length;
  for (const actor of censusSeats(game)) {
    const state = game[actor];
    if (!state) continue;
    total += (state.hand || []).length;
    for (const slot of EQUIP_SLOTS) {
      if (state.equipment && state.equipment[slot]) total += 1;
    }
    total += (state.judgeArea || []).length;
  }
  return total;
}

function diffIdSets(before, after) {
  const vanished = [...before].filter((id) => !after.has(id));
  const conjured = [...after].filter((id) => !before.has(id));
  return { vanished, conjured };
}

// 守恒断言包装器: 运行 fn, 断言前后全场唯一牌 ID 集合不变、且没有牌同时
// 出现在两个区域。返回 fn 的返回值, 便于原地包住既有引擎调用:
//   const result = assertCardConservation(game, () => Engine.playCard(...));
export function assertCardConservation(game, fn, label = '牌守恒') {
  const before = collectCardCensus(game);
  if (before.zoneDuplicates.length) {
    throw new Error(`${label}: 调用前已有牌重复出现在多个区域: ${before.zoneDuplicates.join('; ')}`);
  }
  const result = fn();
  const after = collectCardCensus(game);
  if (after.zoneDuplicates.length) {
    throw new Error(`${label}: 调用后有牌同时出现在多个区域: ${after.zoneDuplicates.join('; ')}`);
  }
  const { vanished, conjured } = diffIdSets(before.ids, after.ids);
  if (vanished.length || conjured.length) {
    const parts = [];
    if (vanished.length) parts.push(`凭空消失: ${vanished.join(', ')}`);
    if (conjured.length) parts.push(`凭空出现: ${conjured.join(', ')}`);
    throw new Error(`${label}: 全场牌 ID 集合改变 — ${parts.join(' | ')}`);
  }
  return result;
}
