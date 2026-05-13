import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const paths = {
  template: path.join(root, 'src/index.template.html'),
  style: path.join(root, 'src/styles/main.css'),
  dataModules: [
    path.join(root, 'src/data/heroes.js'),
    path.join(root, 'src/data/cards.js'),
    path.join(root, 'src/data/skill-status.js'),
  ],
  engineModules: [
    path.join(root, 'src/engine/runtime.js'),
    path.join(root, 'src/engine/skill-runtime.js'),
    path.join(root, 'src/engine/card-runtime.js'),
    path.join(root, 'src/engine/state.js'),
    path.join(root, 'src/engine/phases.js'),
    path.join(root, 'src/engine/judgement.js'),
  ],
  engine: path.join(root, 'src/engine/game-engine.js'),
  ui: path.join(root, 'src/ui/dom-adapter.js'),
  rootHtml: path.join(root, 'index.html'),
  distHtml: path.join(root, 'dist/index.html'),
};

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

// v5 Phase 5A transition: source modules use real ES module syntax
// (top-level `import` / `export`). The legacy single-file bundle in
// `dist/index.html` is still produced for the existing vm-based test
// harness; we strip the module syntax so the concatenated body remains
// valid as a non-module <script>. Phase 5C drops this bundler.
function stripModuleSyntax(src) {
  return src
    .replace(/^[ \t]*import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"]\s*;?[ \t]*\n?/gm, '')
    .replace(/^[ \t]*import\s+[^;{}\n]+\s+from\s*['"][^'"]+['"]\s*;?[ \t]*\n?/gm, '')
    .replace(/^[ \t]*import\s*['"][^'"]+['"]\s*;?[ \t]*\n?/gm, '')
    .replace(/^([ \t]*)export\s+(const|let|var|function|class)\s+/gm, '$1$2 ')
    .replace(/^[ \t]*export\s*\{[^}]*\}\s*;?[ \t]*\n?/gm, '')
    .replace(/^[ \t]*export\s+default\s+/gm, '');
}

function buildEngineBundle() {
  const sources = [
    ...paths.dataModules,
    ...paths.engineModules,
    paths.engine,
  ];
  return sources.map((p) => stripModuleSyntax(read(p))).join('\n\n');
}

function buildLegacyBundle() {
  let html = read(paths.template);
  const uiBody = stripModuleSyntax(read(paths.ui));
  const replacements = {
    __SANGUOSHA_STYLE__: read(paths.style),
    __SANGUOSHA_ENGINE__: buildEngineBundle(),
    __SANGUOSHA_UI__: uiBody,
  };

  for (const [placeholder, content] of Object.entries(replacements)) {
    if (!html.includes(placeholder)) {
      throw new Error(`Template is missing placeholder ${placeholder}`);
    }
    html = html.replace(placeholder, content);
  }

  const leftover = html.match(/__SANGUOSHA_[A-Z_]+__/g);
  if (leftover) {
    throw new Error(`Template placeholders were not fully replaced: ${leftover.join(', ')}`);
  }

  return html;
}

const MODULE_ENTRY_REQUIREMENTS = [
  { needle: '<script type="module" src="./src/main.js"></script>', message: 'index.html should load ./src/main.js as an ES module' },
  { needle: '<link rel="stylesheet" href="./src/styles/main.css" />', message: 'index.html should reference ./src/styles/main.css' },
];

function ensureModuleEntry(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${path.relative(root, filePath)} is missing; it is hand-written in v5 and must exist`);
  }
  const html = read(filePath);
  for (const { needle, message } of MODULE_ENTRY_REQUIREMENTS) {
    if (!html.includes(needle)) {
      throw new Error(`${path.relative(root, filePath)}: ${message}`);
    }
  }
  if (/__SANGUOSHA_[A-Z_]+__/.test(html)) {
    throw new Error(`${path.relative(root, filePath)} still contains build placeholders`);
  }
}

function ensureLegacyBundle(filePath, expected) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${path.relative(root, filePath)} is missing; run npm run build`);
  }
  const actual = read(filePath);
  if (actual !== expected) {
    throw new Error(`${path.relative(root, filePath)} is stale; run npm run build`);
  }
}

const legacyBundle = buildLegacyBundle();

if (checkOnly) {
  ensureModuleEntry(paths.rootHtml);
  ensureLegacyBundle(paths.distHtml, legacyBundle);
  console.log('Module entry index.html and dist/index.html legacy bundle are up to date.');
} else {
  ensureModuleEntry(paths.rootHtml);
  fs.mkdirSync(path.dirname(paths.distHtml), { recursive: true });
  fs.writeFileSync(paths.distHtml, legacyBundle, 'utf8');
  console.log('Wrote dist/index.html legacy bundle (root index.html is hand-written).');
}
