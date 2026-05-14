import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadAllStyles } from './helpers/load-styles.mjs';

const root = path.resolve(import.meta.dirname, '..');
const cssSource = loadAllStyles();
const adapterSource = fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test('v8 PR-0: dom-adapter 暴露 suitRankBadge / suitColorClass helpers', () => {
  assert.match(adapterSource, /function suitColorClass\(/);
  assert.match(adapterSource, /function suitRankBadge\(/);
});

test('v8 PR-0: renderCard 调用 suitRankBadge 渲染右上角', () => {
  // renderCard 模板里应当出现 suitRankBadge(card)
  assert.match(adapterSource, /suitRankBadge\(card\)/);
});

test('v8 PR-0: zoneCards 渲染 suit + rank (装备区 / 判定区 公开信息)', () => {
  // zoneCards 输出应当包含 mini-card-suit span 和 suitColorClass
  assert.match(adapterSource, /mini-card-suit/);
});

test('v8 PR-0: CSS 包含 .card-corner / .suit-red / .suit-black / .mini-card-suit', () => {
  assert.match(cssSource, /\.card-corner\s*\{/);
  assert.match(cssSource, /\.suit-red\s*\{/);
  assert.match(cssSource, /\.suit-black\s*\{/);
  assert.match(cssSource, /\.mini-card-suit\s*\{/);
});

test('v8 PR-0: suitLabel 仍映射四花色到 ♠♥♣♦', () => {
  // 保留旧 helper, 没破坏
  assert.match(adapterSource, /spade:\s*['"]♠['"]/);
  assert.match(adapterSource, /heart:\s*['"]♥['"]/);
  assert.match(adapterSource, /club:\s*['"]♣['"]/);
  assert.match(adapterSource, /diamond:\s*['"]♦['"]/);
});

test('v8 PR-0: 红色花色用红色，黑色花色用浅色 (suit-red / suit-black)', () => {
  // .suit-red 的颜色应当是红系
  assert.match(cssSource, /\.suit-red\s*\{[^}]*color:\s*#[fF][fF][^}]*\}/);
  // .suit-black 不应当是红色（用浅灰白系）
  assert.doesNotMatch(cssSource, /\.suit-black\s*\{[^}]*color:\s*#[fF][fF]0000/);
});

test('v8 PR-0: 对手手牌仍走 miniBacks（隐私保护，不显示 suit/rank）', () => {
  assert.match(adapterSource, /enemyHandBacks\.innerHTML\s*=\s*miniBacks\(/);
  // miniBacks 函数本身不应该读 card.suit / card.rank
  const miniBacksMatch = adapterSource.match(/function miniBacks\([^)]*\)\s*\{[^}]*\}/s);
  assert.ok(miniBacksMatch, 'miniBacks 函数应存在');
  assert.doesNotMatch(miniBacksMatch[0], /\.suit/);
  assert.doesNotMatch(miniBacksMatch[0], /\.rank/);
});

console.log('\nCard face suit/rank tests passed.');
