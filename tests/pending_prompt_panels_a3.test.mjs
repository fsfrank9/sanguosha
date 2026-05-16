import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
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

test('v8 PR-A3: index.html 含 cixiongFirePanel + Hint + FireBtn + DeclineBtn', () => {
  assert.match(htmlSource, /id="cixiongFirePanel"[^>]*hidden/);
  assert.match(htmlSource, /id="cixiongFireHint"/);
  assert.match(htmlSource, /id="cixiongFireBtn"/);
  assert.match(htmlSource, /id="cixiongFireDeclineBtn"/);
});

test('v8 PR-A3: cixiongFirePanel 用通用框架类', () => {
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel[^"]*"\s+id="cixiongFirePanel"/);
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel__hint[^"]*"\s+id="cixiongFireHint"/);
});

test('v8 PR-A3: index.html 含 cixiongChoosePanel + Hint + Choices + DrawBtn', () => {
  assert.match(htmlSource, /id="cixiongChoosePanel"[^>]*hidden/);
  assert.match(htmlSource, /id="cixiongChooseHint"/);
  assert.match(htmlSource, /id="cixiongChooseChoices"/);
  assert.match(htmlSource, /id="cixiongChooseDrawBtn"/);
});

test('v8 PR-A3: cixiongChoosePanel 用通用框架类', () => {
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel[^"]*"\s+id="cixiongChoosePanel"/);
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel__hint[^"]*"\s+id="cixiongChooseHint"/);
  assert.match(htmlSource, /class="[^"]*pending-prompt-panel__choices[^"]*"\s+id="cixiongChooseChoices"/);
});

test('v8 PR-A3: els 缓存新增 cixiongFire* + cixiongChoose* (8 个 id)', () => {
  assert.match(adapterSource, /'cixiongFirePanel',\s*'cixiongFireHint',\s*'cixiongFireBtn',\s*'cixiongFireDeclineBtn'/);
  assert.match(adapterSource, /'cixiongChoosePanel',\s*'cixiongChooseHint',\s*'cixiongChooseChoices',\s*'cixiongChooseDrawBtn'/);
});

test('v8 PR-A3: renderPendingChoice 含 cixiong-fire 分支 (actor=player)', () => {
  assert.match(adapterSource, /kind === 'cixiong-fire' && pending\.actor === 'player'/);
});

test('v8 PR-A3: cixiong-fire 文案提及"异性"和 target 名', () => {
  // 文案应同时含 "异性" 和 actorDisplayName(pending.target)
  assert.match(adapterSource, /'雌雄双股剑：对'\s*\+\s*actorDisplayName\(pending\.target\)/);
  assert.match(adapterSource, /异性/);
});

test('v8 PR-A3: renderPendingChoice 含 cixiong-choose 分支 (actor=player)', () => {
  assert.match(adapterSource, /kind === 'cixiong-choose' && pending\.actor === 'player'/);
});

test('v8 PR-A3: cixiong-choose 渲染手牌用 promptCardChoice + dataAttrs.cixiongDiscardCardId', () => {
  assert.match(adapterSource, /cixiongDiscardCardId:\s*cardId/);
  // 文案应提及 sourceActor 名
  assert.match(adapterSource, /actorDisplayName\(pending\.sourceActor\)/);
});

test('v8 PR-A3: 事件绑定 — cixiongFireBtn → resolvePendingChoice({fire:true})', () => {
  assert.match(adapterSource, /cixiongFireBtn\.addEventListener[\s\S]{0,200}resolvePendingChoice\(game,\s*\{\s*fire:\s*true\s*\}/);
});

test('v8 PR-A3: 事件绑定 — cixiongFireDeclineBtn → resolvePendingChoice({decline:true})', () => {
  assert.match(adapterSource, /cixiongFireDeclineBtn\.addEventListener[\s\S]{0,200}resolvePendingChoice\(game,\s*\{\s*decline:\s*true\s*\}/);
});

test('v8 PR-A3 / v9 PR-E24: cixiongChooseChoices click → stage (kind:pending, payload.option=discard)', () => {
  // v9 PR-E24: 改两步化 — 点候选只 stage, #handConfirmBtn 才 resolvePendingChoice.
  assert.match(adapterSource, /cixiongChooseChoices\.addEventListener\([\s\S]{0,300}data-cixiong-discard-card-id/);
  assert.match(adapterSource, /cixiongChooseChoices\.addEventListener\([\s\S]{0,500}stagedModalChoice\s*=\s*\{[\s\S]{0,200}option:\s*'discard',\s*cardId:\s*cardId/);
});

test('v8 PR-A3: 事件绑定 — cixiongChooseDrawBtn → resolvePendingChoice({option:"draw"})', () => {
  assert.match(adapterSource, /cixiongChooseDrawBtn\.addEventListener[\s\S]{0,200}resolvePendingChoice\(game,\s*\{\s*option:\s*'draw'\s*\}/);
});

console.log('\nPending prompt panels A3 (cixiong-fire + cixiong-choose) tests passed.');
