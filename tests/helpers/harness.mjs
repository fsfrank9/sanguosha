// v14 O1: 统一测试 harness — 收敛此前 176 个测试文件各自重复定义的
// test()/运行循环样板 (队列式 125 / 即跑式 51, 计 4 种定义 × 3 种 runner)。
//
// 约定 (tools/build.mjs --check 强制): tests/*.mjs 一律
//   import { test, runTests } from './helpers/harness.mjs';
// 文件级 `function test(` 本地定义禁止再新增; 既有 node:test 文件
// (v12_h_multiplayer 等 5 个) 与直断言文件 (v6_skill_audit 等) 不受影响。
//
// 语义与迁移前保持:
//   - 缺省 fail-fast: 首个失败用例打印 ✗ 后向上抛出 (进程非零退出),
//     与旧即跑式/队列式 runner 相同; 文件尾的成功 footer 仅在全绿时打印。
//   - { collect: true }: 逐例续跑收集失败 (soak/benchmark 类 7 文件旧语义),
//     失败打印 ✗ + 堆栈, 结尾统一 `N/M 个测试失败。` 并 exit(1)。
//   - 返回 { passed, total } 供 `${passed}/${total} …通过。` 类 footer 使用。
// 用例一律在 runTests() 处延迟执行 (与队列式一致); 即跑式迁移文件的
// 用例执行点从定义处移至文件尾, 行为经逐文件基线输出比对核实。

const queue = [];

export function test(name, fn) {
  queue.push([name, fn]);
}

export async function runTests(opts) {
  const collect = Boolean(opts && opts.collect);
  const total = queue.length;
  let passed = 0;
  let failures = 0;
  for (const [name, fn] of queue) {
    try {
      await fn();
      passed += 1;
      console.log(`✓ ${name}`);
    } catch (error) {
      console.error(`✗ ${name}`);
      if (!collect) throw error;
      failures += 1;
      console.error(error && error.stack ? error.stack : error);
    }
  }
  queue.length = 0;
  if (collect && failures > 0) {
    console.error(`\n${failures}/${total} 个测试失败。`);
    process.exit(1);
  }
  return { passed, total };
}
