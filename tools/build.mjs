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
  'src/engine/runtime.js',
  'src/engine/skill-runtime.js',
  'src/engine/card-runtime.js',
  'src/engine/state.js',
  'src/engine/phases.js',
  'src/engine/judgement.js',
  'src/engine/damage-dying.js',
  'src/engine/response.js',
  'src/engine/ai.js',
  'src/engine/game-engine.js',
  'src/ui/dom-adapter.js',
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
