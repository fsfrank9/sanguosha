import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const REQUIRED_FILES = [
  'index.html',
  'src/main.js',
  'src/styles/main.css',
  'src/data/heroes.js',
  'src/data/cards.js',
  'src/data/skill-status.js',
  'src/data/identity.js',
  'src/engine/runtime.js',
  'src/engine/skill-runtime.js',
  'src/engine/card-runtime.js',
  'src/engine/state.js',
  'src/engine/phases.js',
  'src/engine/judgement.js',
  'src/engine/damage-dying.js',
  'src/engine/response.js',
  'src/engine/tricks.js',
  'src/engine/sha-flow.js',
  'src/engine/skills.js',
  'src/engine/judge-area.js',
  'src/engine/equipment.js',
  'src/engine/ai.js',
  'src/engine/game-engine.js',
  'src/ui/dom-adapter.js',
  'src/ui/panels/response-panels.js',
  'src/ui/panels/prompt-panels.js',
  'src/ui/panels/mode-panels.js',
  'src/ui/panels/lobby-panels.js',
  'src/ui/panels/board-panels.js',
];

const MODULE_ENTRY_REQUIREMENTS = [
  { needle: '<script type="module" src="./src/main.js"></script>', message: 'index.html should load ./src/main.js as an ES module' },
  { needle: '<link rel="stylesheet" href="./src/styles/main.css" />', message: 'index.html should reference ./src/styles/main.css' },
];

const FORBIDDEN_PATHS = ['dist', 'src/index.template.html'];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function checkStructure() {
  const errors = [];

  for (const rel of REQUIRED_FILES) {
    if (!exists(rel)) errors.push(`missing required file: ${rel}`);
  }

  if (exists('index.html')) {
    const html = read('index.html');
    for (const { needle, message } of MODULE_ENTRY_REQUIREMENTS) {
      if (!html.includes(needle)) errors.push(`index.html: ${message}`);
    }
    if (/__SANGUOSHA_[A-Z_]+__/.test(html)) {
      errors.push('index.html still contains build placeholders');
    }
    if (/<script id="game-engine"/.test(html)) {
      errors.push('index.html should no longer inline a bundled engine <script id="game-engine">');
    }
  }

  for (const rel of FORBIDDEN_PATHS) {
    if (exists(rel)) errors.push(`forbidden v5 artifact still exists: ${rel} (Phase 5C dropped it)`);
  }

  // v14 O1: 测试样板收敛护栏 — tests/*.mjs 不得再本地定义 test()
  // (统一走 tests/helpers/harness.mjs 的 test/runTests; node:test 导入不受限)。
  // 引入 harness 的文件必须调用 runTests(), 否则队列静默不执行、假绿。
  // 评审收口加固 (opus 对抗探针 A-I): 先剥注释再按正则匹配 —
  // ① 定义禁令覆盖 缩进/async/括号前空格/箭头(const test =) 等价写法,
  //    且不误伤注释中引用旧样板的文字;
  // ② harness 引用判定兼容单双引号, runTests 调用判定不认注释行
  //    (堵"双引号 import + 注释里提 runTests"的假绿绕过面)。
  const stripComments = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  const testsDir = path.join(root, 'tests');
  if (fs.existsSync(testsDir)) {
    for (const name of fs.readdirSync(testsDir)) {
      if (!name.endsWith('.mjs')) continue;
      const code = stripComments(read(path.join('tests', name)));
      if (/^\s*(async\s+)?function\s+test\s*\(/m.test(code) || /^\s*(const|let|var)\s+test\s*=/m.test(code)) {
        errors.push(`tests/${name}: local test() definition is forbidden — import { test, runTests } from './helpers/harness.mjs' (v14 O1)`);
      }
      if (/from\s*['"][^'"]*helpers\/harness\.mjs['"]/.test(code) && !/(^|[^.\w])runTests\s*\(/.test(code)) {
        errors.push(`tests/${name}: imports harness but never calls runTests() — queued tests would silently not run (v14 O1)`);
      }
    }
  }

  return errors;
}

const errors = checkStructure();

if (errors.length) {
  for (const err of errors) console.error('  - ' + err);
  console.error(`\nv5 structural check failed (${errors.length} issue${errors.length === 1 ? '' : 's'}).`);
  process.exit(1);
}

if (checkOnly) {
  console.log('v5 structural check passed: module entry intact, all source modules present, no legacy bundle.');
} else {
  console.log('v5 has no bundle output; nothing to build. Use --check to verify structure.');
}
