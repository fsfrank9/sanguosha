import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

function loadBuiltWindow() {
  const html = read('index.html');
  const match = html.match(/<script id="game-engine"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(match, 'built root index.html should contain <script id="game-engine">');
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox, { filename: 'built-game-engine.js' });
  return sandbox.window;
}

test('state runtime exposes pure actor/state helpers while preserving public engine APIs', () => {
  const win = loadBuiltWindow();
  const StateRuntime = win.SanguoshaEngineModules && win.SanguoshaEngineModules.StateRuntime;
  const Engine = win.SanguoshaEngine;

  assert.ok(StateRuntime, 'built artifact should expose StateRuntime');
  assert.equal(typeof StateRuntime.actorName, 'function');
  assert.equal(typeof StateRuntime.opponent, 'function');
  assert.equal(typeof StateRuntime.hasSkill, 'function');
  assert.equal(typeof StateRuntime.distanceBetween, 'function');
  assert.equal(typeof StateRuntime.handLimit, 'function');
  assert.equal(typeof StateRuntime.getActorStatus, 'function');

  assert.equal(Engine.opponent, StateRuntime.opponent, 'public opponent API should delegate to StateRuntime');
  assert.equal(Engine.distanceBetween, StateRuntime.distanceBetween, 'public distance API should delegate to StateRuntime');
  assert.equal(Engine.handLimit, StateRuntime.handLimit, 'public handLimit API should delegate to StateRuntime');
  assert.equal(Engine.getActorStatus, StateRuntime.getActorStatus, 'public status API should delegate to StateRuntime');
});

test('state runtime preserves roles, skill lookup, distance, range, limits, and status behavior', () => {
  const win = loadBuiltWindow();
  const StateRuntime = win.SanguoshaEngineModules.StateRuntime;
  const Engine = win.SanguoshaEngine;
  const game = Engine.newGame({ seed: 303, playerHero: 'machao', enemyHero: 'sunquan', playerRole: '反贼', enemyRole: '主公' });

  assert.equal(StateRuntime.opponent('player'), 'enemy');
  assert.equal(StateRuntime.opponent('enemy'), 'player');
  assert.equal(StateRuntime.firstActorFromRoles({ player: '反贼', enemy: '主公' }, 'player'), 'enemy');
  assert.equal(StateRuntime.actorName(game, 'player'), '马超');

  assert.equal(StateRuntime.hasSkill(game.player, 'mashu'), true);
  assert.equal(StateRuntime.hasSkill(game.enemy, 'mashu'), false);
  assert.equal(StateRuntime.distanceBetween(game, 'player', 'enemy'), 1, 'Mashu should reduce distance but never below 1');

  game.enemy.equipment.horsePlus = Engine.makeTestCard('plus_horse', { id: 'enemy-plus' });
  assert.equal(StateRuntime.distanceBetween(game, 'player', 'enemy'), 1, 'Mashu should offset enemy +1 horse');
  game.player.skills = game.player.skills.filter((skill) => skill.id !== 'mashu');
  assert.equal(StateRuntime.distanceBetween(game, 'player', 'enemy'), 2, 'enemy +1 horse should increase distance without Mashu');
  assert.equal(StateRuntime.weaponRange(game.player), 1);
  assert.equal(StateRuntime.canReachWithSha(game, 'player', 'enemy'), false);
  game.player.equipment.weapon = Engine.makeTestCard('qinglong', { id: 'range-3' });
  assert.equal(StateRuntime.weaponRange(game.player), 3);
  assert.equal(StateRuntime.canReachWithSha(game, 'player', 'enemy'), true);

  assert.equal(StateRuntime.canUseUnlimitedSha(game.player), false);
  game.player.skills.push({ id: 'paoxiao', name: '咆哮' });
  assert.equal(StateRuntime.canUseUnlimitedSha(game.player), true);
  game.player.skills = [];
  game.player.equipment.weapon = Engine.makeTestCard('zhuge', { id: 'zhuge' });
  assert.equal(StateRuntime.canUseUnlimitedSha(game.player), true);

  game.player.hp = 2;
  assert.equal(StateRuntime.handLimit(game, 'player'), 2);
  game.player.hp = 0;
  assert.equal(StateRuntime.handLimit(game, 'player'), 0);
  assert.equal(StateRuntime.getActorStatus(game, 'player'), '未横置');
  game.player.chained = true;
  assert.equal(StateRuntime.getActorStatus(game, 'player'), '铁索横置');
  assert.equal(StateRuntime.getActorStatus(game, 'ghost'), '未知');
});

console.log('\nState runtime tests passed.');
