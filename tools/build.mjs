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
  ],
  engine: path.join(root, 'src/engine/game-engine.js'),
  ui: path.join(root, 'src/ui/dom-adapter.js'),
  rootHtml: path.join(root, 'index.html'),
  distHtml: path.join(root, 'dist/index.html'),
};

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function buildEngineBundle() {
  return [
    ...paths.dataModules.map(read),
    ...paths.engineModules.map(read),
    read(paths.engine),
  ].join('\n\n');
}

function buildHtml() {
  let html = read(paths.template);
  const replacements = {
    __SANGUOSHA_STYLE__: read(paths.style),
    __SANGUOSHA_ENGINE__: buildEngineBundle(),
    __SANGUOSHA_UI__: read(paths.ui),
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

function ensureGeneratedArtifact(filePath, expected) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${path.relative(root, filePath)} is missing; run npm run build`);
  }
  const actual = read(filePath);
  if (actual !== expected) {
    throw new Error(`${path.relative(root, filePath)} is stale; run npm run build`);
  }
}

const built = buildHtml();

if (checkOnly) {
  ensureGeneratedArtifact(paths.rootHtml, built);
  ensureGeneratedArtifact(paths.distHtml, built);
  console.log('Build artifacts are up to date.');
} else {
  fs.mkdirSync(path.dirname(paths.distHtml), { recursive: true });
  fs.writeFileSync(paths.rootHtml, built, 'utf8');
  fs.writeFileSync(paths.distHtml, built, 'utf8');
  console.log('Built index.html and dist/index.html from src/.');
}
