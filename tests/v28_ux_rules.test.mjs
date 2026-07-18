import assert from 'node:assert/strict';
import { Engine } from './helpers/load-engine.mjs';

assert.ok(Engine, 'game engine should expose SanguoshaEngine via ES module export');


import fs from 'node:fs';
import path from 'node:path';
import { loadAllStyles } from './helpers/load-styles.mjs';

const root = path.resolve(import.meta.dirname, '..');
const html = [
  fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
  loadAllStyles(),
  // v12 F6: 战场渲染域迁往 panels/board-panels.js — 拼接一并纳入。
  fs.readFileSync(path.join(root, 'src/ui/panels/board-panels.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'src/ui/dom-adapter.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'src/data/cards.js'), 'utf8'),
].join('\n');

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
  // v10 V2: enterZhihengMode / confirmZhiheng 死函数已删, 改走通用
  // enterCardSkillMode + confirmCardSkill (skillSelectMode 仍持 'zhiheng').
  assert.match(html, /id="zhihengModePanel"/, 'Zhiheng should expose a manual selection panel');
  assert.match(html, /id="zhihengConfirmBtn"/, 'Zhiheng confirm button should exist');
  assert.match(html, /zhiheng:\s*\{[\s\S]*?name:\s*'制衡'/, 'cardSkillConfig should list zhiheng for manual select');
  assert.match(html, /skillSelectMode\s*=\s*skillId/, 'enterCardSkillMode should set skillSelectMode from arg');
  assert.match(html, /Engine\.useSkill\(game,\s*'player',\s*skillSelectMode,\s*cardIds/, 'Zhiheng should use exactly the selected cards');
  assert.doesNotMatch(html, /game\.player\.hand\.map\([^)]*=>[^)]*\.id\)/, 'UI should not auto-select every hand card for Zhiheng');
});

test('1v1 选将流程包含身份判定：随机主公/反贼，主公先选，然后对方再选', () => {
  // v10 V2: confirmHeroPick / draftPicker / firstPickBadge 死链已删,
  // PR-E11 顺序选将 接管 (主公先选→反贼后选, 完成自动 newGame).
  assert.match(html, /id="roleDraftPanel"/, 'role draft panel should exist');
  assert.match(html, /id="randomRolesBtn"/, 'random role button should exist');
  assert.match(html, /id="heroPickPrompt"/, 'hero-pick prompt (PR-E11) should show current picker');
  assert.match(html, /您是主公/, 'UI should address player as 主公 in prompt');
  assert.match(html, /function assignRandomRoles/, 'random role assignment should be implemented');
  // v13 L1→二批-4: 身份场改号位序 (自己优先+号位升序), duel 分支
  // "主公先选"语义仍逐字保留 — 断言跟随新表达式定位。
  assert.match(html, /pickOrder\s*=\s*\(playerRole\s*===\s*'主公'\)\s*\?\s*\['player',\s*'enemy'\]/, 'duel pick order should still start from lord side');
  assert.match(html, /function handleHeroPickCardClick/, 'card-click should advance the sequence');
  assert.match(html, /pickStep\s*\+=\s*1/, 'pickStep should increment per pick');
});

console.log('\nv2.8 UX/rules tests passed.');
