import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const htmlPath = path.resolve(import.meta.dirname, '../index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script id="game-engine"[^>]*>([\s\S]*?)<\/script>/);
assert.ok(match, 'index.html should contain <script id="game-engine">');

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(match[1], sandbox, { filename: 'game-engine.js' });
const Engine = sandbox.window.SanguoshaEngine;
assert.ok(Engine, 'engine should expose window.SanguoshaEngine');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

function c(type, overrides = {}) {
  return Engine.makeTestCard(type, overrides);
}

function ids(cards) {
  return Array.from(cards).map((card) => card.id);
}

test('过河拆桥和顺手牵羊可选择手牌、装备区或判定区作为目标区', () => {
  const game = Engine.newGame({ seed: 801, playerHero: 'liubei', enemyHero: 'caocao' });
  game.player.hand = [c('guohe', { id: 'break-equip' }), c('shunshou', { id: 'steal-judge' })];
  game.enemy.hand = [];
  game.enemy.equipment.weapon = c('zhuge', { id: 'enemy-zhuge' });
  game.enemy.judgeArea = [c('lebusishu', { id: 'enemy-lebu' })];

  const breakResult = Engine.playCard(game, 'player', 'break-equip', { targetZone: 'equipment', targetCardId: 'enemy-zhuge' });
  assert.equal(breakResult.ok, true, breakResult.message);
  assert.equal(game.enemy.equipment.weapon, null);
  assert.ok(ids(game.discard).includes('enemy-zhuge'));

  const stealResult = Engine.playCard(game, 'player', 'steal-judge', { targetZone: 'judge', targetCardId: 'enemy-lebu' });
  assert.equal(stealResult.ok, true, stealResult.message);
  assert.deepEqual(ids(game.enemy.judgeArea), []);
  assert.ok(ids(game.player.hand).includes('enemy-lebu'));
});

test('无手牌但有装备或判定牌时，过河拆桥/顺手牵羊仍然可用', () => {
  const game = Engine.newGame({ seed: 802, playerHero: 'liubei', enemyHero: 'caocao' });
  const guohe = c('guohe', { id: 'break-nonhand' });
  game.player.hand = [guohe];
  game.enemy.hand = [];
  game.enemy.equipment.armor = c('renwang', { id: 'enemy-renwang' });
  assert.equal(Engine.canPlayCard(game, 'player', guohe).ok, true);
});

test('战报改为侧栏长列表，按时间顺序滚动显示每句比赛信息', () => {
  assert.match(html, /id="battleLogPanel"/, 'battle log should have a dedicated side panel');
  assert.match(html, /side-log-panel/, 'battle log panel should be styled as left/right side log');
  assert.match(html, /game\.log\.slice\(-\d+\)\.map/, 'renderLog should keep chronological order, not reverse the log');
  assert.doesNotMatch(html, /game\.log\.slice\(-\d+\)\.reverse\(\)/, 'renderLog should not reverse entries');
  assert.match(html, /els\.log\.scrollTop\s*=\s*els\.log\.scrollHeight/, 'renderLog should auto-scroll to latest sentence');
});

test('敌方行动在 UI 中逐张牌分步播放，而不是 runAITurn 一次性结算完', () => {
  const enemyStepMatch = html.match(/function enemyStep\(\)[\s\S]*?function maybeStartEnemyTurn/);
  assert.ok(enemyStepMatch, 'enemyStep should exist');
  assert.doesNotMatch(enemyStepMatch[0], /Engine\.runAITurn/, 'UI enemyStep must not call full runAITurn');
  assert.match(enemyStepMatch[0], /Engine\.aiTakeAction/, 'UI enemyStep should execute one AI action per tick');
  assert.match(enemyStepMatch[0], /window\.setTimeout\(enemyStep,\s*enemyActionDelay/, 'enemyStep should schedule the next visible action');
});

test('制衡进入手动选择模式，不能默认弃全部或自动弃牌', () => {
  assert.match(html, /id="zhihengModePanel"/, 'Zhiheng should expose a manual selection panel');
  assert.match(html, /id="zhihengConfirmBtn"/, 'Zhiheng confirm button should exist');
  assert.match(html, /skillSelectMode\s*=\s*'zhiheng'/, 'clicking Zhiheng should enter explicit selection mode');
  assert.match(html, /Engine\.useSkill\(game, 'player', 'zhiheng', selectedSkillCardIds/, 'Zhiheng should use exactly selected cards');
  assert.doesNotMatch(html, /game\.player\.hand\.map\([^)]*=>[^)]*\.id\)/, 'UI should not auto-select every hand card for Zhiheng');
});

test('1v1 选将流程包含身份判定：随机主公/反贼，主公先选，然后对方再选', () => {
  assert.match(html, /id="roleDraftPanel"/, 'role draft panel should exist');
  assert.match(html, /id="randomRolesBtn"/, 'random role button should exist');
  assert.match(html, /id="firstPickBadge"/, 'first-pick badge should exist');
  assert.match(html, /主公先选/, 'UI should state lord picks first');
  assert.match(html, /function assignRandomRoles/, 'random role assignment should be implemented');
  assert.match(html, /draftPicker/, 'draft picker state should track who picks now');
  assert.match(html, /confirmHeroPickBtn/, 'draft should have an explicit pick confirmation button');
});

console.log('\nv2.8 UX/rules tests passed.');
