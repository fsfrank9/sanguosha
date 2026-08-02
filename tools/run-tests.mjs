// v14 O2: 分档测试运行器 (J4 慢测试分层预案兑现)。
//
//   node tools/run-tests.mjs          → 全档: tests/*.mjs 全量逐文件执行,
//                                       失败即停 — CI 门禁 (npm test / verify)。
//   node tools/run-tests.mjs --quick  → 快档: 秒级冒烟 + 守恒/架构红线
//                                       (npm run test:quick / verify:quick)。
//
// 约定 (v14 路线图 O2): 新增 soak / 基准 / 慢测试一律入全档, 不入快档;
// 快档只收秒级文件, 定位是开发内循环的即时反馈, 不替代合并前全量门禁。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quick = process.argv.includes('--quick');

// 快档清单 — 逐文件注明入选理由 (全部亚秒级):
const QUICK_TIER = [
  'architecture_build.test.mjs',        // 结构守护 (源码⇄产物零漂移)
  'engine_modules.test.mjs',            // 引擎域模块装配冒烟
  'data_modules.test.mjs',              // 数据 catalog 冒烟
  'catalog.test.mjs',                   // 武将/牌目录完整性
  'advanced_engine.test.mjs',           // 核心对局流程冒烟
  'card_conservation.test.mjs',         // 全场牌数守恒红线
  'move_card_convergence.test.mjs',     // 裸区域操作零容忍红线
  'equipment_handler_registry.test.mjs',// 裸装备判断零容忍红线
  'v13_m_hidden_roles.test.mjs',        // AI 零直读 (去全知) 守护红线
  'skill_schema.test.mjs',              // 技能元数据 schema 一致性
  'card_rules.test.mjs',                // 牌规则 schema 一致性
  'v6_skill_audit.test.mjs',            // cache⇄specs⇄heroes⇄cards 四方一致
  'css_split.test.mjs',                 // CSS 拆分结构守护
  'dom_adapter_behavior.test.mjs',      // UI 适配层全链路冒烟
];

const testsDir = path.join(root, 'tests');
let files;
if (quick) {
  const missing = QUICK_TIER.filter((f) => !fs.existsSync(path.join(testsDir, f)));
  if (missing.length) {
    console.error(`快档清单文件缺失 (重命名后请同步 tools/run-tests.mjs): ${missing.join(', ')}`);
    process.exit(1);
  }
  files = QUICK_TIER.slice();
} else {
  files = fs.readdirSync(testsDir).filter((f) => f.endsWith('.mjs')).sort();
}

for (const f of files) {
  const rel = path.join('tests', f);
  process.stdout.write(`\n===== ${rel}\n`);
  const r = spawnSync(process.execPath, [rel], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status === null ? 1 : r.status);
}
console.log(`\n${quick ? '快档' : '全档'} ${files.length} 个测试文件全绿。`);
