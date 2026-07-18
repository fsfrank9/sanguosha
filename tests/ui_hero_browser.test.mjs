// v13 武将图鉴 (首页「武将」入口) — fake-DOM 全链路:
//   入口启用 → 图鉴屏开合; 内容 = 全武将 × 技能描述 × 实现状态标注
//   (数据源 HERO_CATALOG × IMPLEMENTED/ACTIVE_SKILL_IDS, 与实态恒同步)。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installFakeDom } from './helpers/fake-dom.mjs';

const dom = installFakeDom();
const { Engine, HERO_CATALOG, IMPLEMENTED_SKILL_IDS, ACTIVE_SKILL_IDS } = await import('./helpers/load-engine.mjs');
await import('../src/ui/dom-adapter.js');

const $ = dom.$;
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('图鉴: 静态标记 — 武将入口启用 (无 disabled), 图鉴屏骨架齐备', () => {
  assert.match(html, /id="lobbyHeroesBtn"/);
  assert.doesNotMatch(html, /id="lobbyHeroesBtn"[^>]*disabled/);
  assert.doesNotMatch(html, /<button[^>]*disabled[^>]*id="lobbyHeroesBtn"/);
  for (const id of ['heroBrowserScreen', 'heroBrowserGrid', 'heroBrowserSummary', 'heroBrowserBackBtn']) {
    assert.match(html, new RegExp('id="' + id + '"'), id);
  }
  assert.match(html, /id="heroBrowserScreen"[^>]*hidden/, '图鉴屏默认隐藏');
});

test('图鉴: 入口开合 — 点武将进图鉴, 返回大厅复原', () => {
  $('lobbyHeroesBtn').click();
  assert.equal($('heroBrowserScreen').hidden, false, '图鉴屏打开');
  assert.equal($('lobbyScreen').hidden, true, '大厅隐藏');
  $('heroBrowserBackBtn').click();
  assert.equal($('heroBrowserScreen').hidden, true);
  assert.equal($('lobbyScreen').hidden, false, '返回大厅');
});

test('图鉴: 内容全量 — 每名武将成卡, 汇总计数与数据源一致', () => {
  $('lobbyHeroesBtn').click();
  const grid = String($('heroBrowserGrid').innerHTML);
  const heroIds = Object.keys(HERO_CATALOG);
  for (const id of heroIds) {
    assert.ok(grid.indexOf('data-hero-id="' + id + '"') >= 0, '武将卡: ' + id);
  }
  let total = 0, done = 0;
  for (const id of heroIds) {
    for (const skill of (HERO_CATALOG[id].skills || [])) {
      total += 1;
      if (IMPLEMENTED_SKILL_IDS.includes(skill.id)) done += 1;
    }
  }
  const summary = String($('heroBrowserSummary').textContent);
  assert.ok(summary.indexOf(heroIds.length + ' 名武将') >= 0, '武将数: ' + summary);
  assert.ok(summary.indexOf(done + '/' + total) >= 0, '技能实现计数: ' + summary);
  $('heroBrowserBackBtn').click();
});

test('图鉴: 状态标注 — 奸雄已实现, 蛊惑未实现, 苦肉带主动标', () => {
  $('lobbyHeroesBtn').click();
  const grid = String($('heroBrowserGrid').innerHTML);
  const cardOf = (heroId) => {
    const start = grid.indexOf('data-hero-id="' + heroId + '"');
    const end = grid.indexOf('</article>', start);
    return grid.slice(start, end);
  };
  assert.ok(/奸雄[\s\S]{0,80}is-done/.test(cardOf('caocao')), '曹操奸雄标已实现');
  assert.ok(/蛊惑[\s\S]{0,80}is-pending/.test(cardOf('yuji')), '于吉蛊惑标未实现');
  assert.ok(!/蛊惑[\s\S]{0,80}is-done/.test(cardOf('yuji')), '蛊惑不得标已实现');
  assert.ok(/苦肉[\s\S]{0,120}is-active-skill/.test(cardOf('huanggai')), '黄盖苦肉带主动标');
  assert.ok(cardOf('yuji').indexOf('可声明任意基本牌/锦囊') >= 0, '技能描述展示');
  $('heroBrowserBackBtn').click();
});

test('图鉴: 四势力分组标题齐备', () => {
  $('lobbyHeroesBtn').click();
  const grid = String($('heroBrowserGrid').innerHTML);
  for (const camp of ['魏', '蜀', '吴', '群']) {
    assert.ok(new RegExp('hb-camp__title">' + camp + '（\\d+ 名）').test(grid), camp + ' 分组');
  }
  $('heroBrowserBackBtn').click();
});

let passed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed += 1; console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}`); throw error; }
}
console.log(`${passed}/${tests.length} 个武将图鉴用例通过。`);
