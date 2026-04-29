import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const htmlPath = path.resolve(import.meta.dirname, '../index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test('face-to-face layout has enemy top, center arena, player board, and hand dock in order', () => {
  const enemyIndex = html.indexOf('id="enemyBoard"');
  const arenaIndex = html.indexOf('id="centerArena"');
  const playerIndex = html.indexOf('id="playerBoard"');
  const handDockIndex = html.indexOf('id="playerHandDock"');
  assert.ok(enemyIndex > 0, 'enemyBoard should exist');
  assert.ok(arenaIndex > enemyIndex, 'centerArena should appear after enemyBoard');
  assert.ok(playerIndex > arenaIndex, 'playerBoard should appear after centerArena');
  assert.ok(handDockIndex > playerIndex, 'playerHandDock should appear after playerBoard');
});

test('layout exposes official-style zones for equipment and judgement', () => {
  const ids = [
    'enemyJudgeArea', 'enemyEquipmentArea',
    'playerJudgeArea', 'playerEquipmentArea',
    'phaseTrack', 'battleLog', 'playerSkillBar', 'heroSelectPanel'
  ];
  for (const id of ids) {
    assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  }
});

test('CSS includes battlefield table and bottom hand dock styling hooks', () => {
  assert.ok(/\.duel-table/.test(html), 'should include .duel-table CSS');
  assert.ok(/\.hand-dock/.test(html), 'should include .hand-dock CSS');
  assert.ok(/\.opponent-zone/.test(html), 'should include .opponent-zone CSS');
  assert.ok(/\.player-zone/.test(html), 'should include .player-zone CSS');
});

console.log('\nUI layout tests passed.');
