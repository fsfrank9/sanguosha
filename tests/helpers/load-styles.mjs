// v9 PR-E0: CSS 拆分后, 测试用 regex 匹配 CSS 内容仍然需要"全量"视图.
// 这个 helper 把 main.css 之外的 8 个分文件按 @import 顺序拼起来,
// 与拆分前的单 main.css 行为等价。
//
// 用法:
//   import { loadAllStyles } from './helpers/load-styles.mjs';
//   const cssSource = loadAllStyles();
//
// 测试断言不需要改 (内容文本不变)。新加 CSS 时, 直接加进对应分文件即可。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const helpersDir = path.dirname(fileURLToPath(import.meta.url));
const stylesDir = path.resolve(helpersDir, '..', '..', 'src', 'styles');

const SPLIT_FILES = [
  'tokens.css',
  'layout.css',
  'hero.css',
  'cards.css',
  'zones.css',
  'modals.css',
  'controls.css',
  'setup.css',
];

export function loadAllStyles() {
  return SPLIT_FILES
    .map((name) => fs.readFileSync(path.join(stylesDir, name), 'utf8'))
    .join('\n');
}

export const SPLIT_CSS_FILES = SPLIT_FILES.slice();
