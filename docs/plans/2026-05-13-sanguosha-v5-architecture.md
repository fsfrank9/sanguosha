# v5.0 Real Modules + GitHub Pages Migration Plan

> **方向锚定:** README 把 v5 定义为「不再把全部源码/数据塞进单 HTML;走 GitHub 托管发布链接访问和真正模块化架构」。v4 已经把源码拆到 `src/`,但产物仍然是把所有 `<script>` 内联进一个 `index.html`,通过 IIFE + `window.SanguoshaData` / `window.SanguoshaEngineModules` / `window.SanguoshaEngine` 三个全局对象相互找。v5 把这一层去掉:每个 `src/*.js` 变成真正的 ES 模块,HTML 入口只剩 `<script type="module" src="…">`,通过 GitHub Pages 提供 https 访问。

**Goal:** 从「单文件 HTML 产物 + IIFE/window globals」迁移到「真正的 ES 模块 + GitHub Pages 托管」。

**Non-goals(v5 不做):**

- 不引入打包器(Vite/esbuild/Rollup)、不添加 npm 运行时依赖。
- 不维护 `file://` 直开兼容(原生 `<script type="module">` 在 file:// 下被浏览器 CORS 拦截)。
- 不维护 `dist/index.html` 单文件离线包;若用户需要离线分发,后续可作为可选 release artifact 重新引入,但不再是架构主路径。
- 不重构游戏逻辑、不调整 SkillRuntime hook 形态、不动 v4 Phase 4 已经迁好的技能链路。

**Tech Stack:** 浏览器原生 ES modules、纯 HTML/CSS/JavaScript、Node ESM 测试、GitHub Pages 静态托管。无运行时服务器、无 npm 依赖。

**前置条件:** 仓库 `package.json` 已经是 `"type": "module"`,Node 直接支持 `import` 加载 `src/**/*.js`。

---

## 与 v4 的具体差异

| 维度 | v4 (当前) | v5 (目标) |
| --- | --- | --- |
| 源码组织 | `src/` 模块化 | `src/` 模块化(不变) |
| 模块互联 | `window.SanguoshaData` / `window.SanguoshaEngineModules` / `window.SanguoshaEngine` 三个全局 | 原生 `import` / `export` |
| 模块语法 | IIFE `(function(){ ... }())`,内部 `var`,无 `export` | ES module,顶层 `export const/function` |
| HTML 入口 | `<style>__SANGUOSHA_STYLE__</style>` + `<script>__SANGUOSHA_ENGINE__</script>` + `<script>__SANGUOSHA_UI__</script>` 单文件内联 | `<link rel="stylesheet" href="./src/styles/main.css">` + `<script type="module" src="./src/main.js"></script>` |
| 构建脚本 | `tools/build.mjs` 拼接生成 `index.html` 与 `dist/index.html`(字节级一致) | `tools/build.mjs` 不再生成 HTML 产物;`--check` 改为校验模块结构与入口标签 |
| 直开方式 | `file://` 双击 `index.html` | https://<user>.github.io/sanguosha/ 或本地 `python -m http.server` |
| 测试加载 | `fs.readFileSync('index.html')` → 正则提取 `<script id="game-engine">` → `vm.runInContext` | 直接 `import { … } from '../src/…'` |
| 发布 | 仓库根 `index.html` 作为可分享产物 | GitHub Pages 自动部署 `main` 分支 |

---

## Phase 总览

每个 Phase 独立提交、独立验证(测试通过 + 浏览器 smoke);中途任何 Phase 都可暂停而不破坏游戏运行。

| Phase | 范围 | 风险 |
| --- | --- | --- |
| 5.0 | 仅本计划文档 + RED 架构测试骨架(默认 skip) | 零 |
| 5A | `src/index.template.html` → 真正的 `index.html`,改为多个 `<script type="module">`;`src/data/*.js`、`src/engine/*.js`、`src/ui/dom-adapter.js` 全部转为 ES 模块;`src/main.js` 作为入口 | 中(改动面大,但语义保持) |
| 5B | 测试基础设施切换:`tests/*.mjs` 从 `vm.runInContext` 改为 `import` | 中(每个测试文件都要改头部 4–10 行) |
| 5C | 移除 `window.SanguoshaData` / `SanguoshaEngineModules` / `SanguoshaEngine` 三个全局 shim;移除 `tools/build.mjs` 的 HTML 拼接逻辑;删除 `dist/` 目录;移除依赖 `index.html` 拼接的 `tests/architecture_build.test.mjs` 与 `tests/engine_modules.test.mjs` 中的 build-artifact assertion(改为模块入口结构 assertion) | 中 |
| 5D | 加 `.github/workflows/pages.yml`(或仓库设置启用 Pages from `main`);更新 README 的运行说明 | 低 |
| 5E | 收尾:精简 v4 残留(模板 placeholder、过渡期注释、未用的 `tools/build.mjs` 参数);补 README v5 章节 | 低 |

---

## Phase 5.0 — Plan + RED architecture scaffold (本次提交)

**Status:** ✅ 已完成。

### Task 1: 计划文档

- 新增本文档 `docs/plans/2026-05-13-sanguosha-v5-architecture.md`。
- README "架构路线" 章节末尾追加一条指向本文档的引用,但不修改 v4 描述。

### Task 2: RED 架构测试骨架(默认 skip)

- 新增 `tests/v5_architecture.test.mjs`,断言 v5 完成状态的结构特征:
  - `src/main.js` 存在且为 ES 模块入口;
  - `src/data/*.js`、`src/engine/*.js`、`src/ui/dom-adapter.js` 顶层均使用 `export`,不再有 `window.SanguoshaXxx = …`;
  - 根目录 `index.html` 不再是构建产物,而是手写的 ES 模块入口 HTML;
  - `dist/index.html` 不存在;
  - `tools/build.mjs --check` 校验模块结构而非字节级 HTML 比对;
  - `.github/workflows/pages.yml` 存在。
- 默认 `process.env.SANGUOSHA_V5 !== '1'` 时直接 `process.exit(0)`,不计入 `npm test` 失败。Phase 5A/5B/5C 完成后改为默认启用。

### 验收标准

- `npm test` 仍然全部通过(v5 测试默认 skip)。
- 浏览器 `file://` 打开 `index.html` 仍能游玩。
- 没有任何源码或产物字节变化。

---

## Phase 5A — Source modules → ES exports + multi-script HTML entry

**Status:** ✅ 已完成。

### 设计要点

1. **保留 `window.Sanguosha*` 三个全局作为过渡 shim**。每个模块在顶层 `export const Xxx = …` 的同时,继续写 `if (typeof window !== 'undefined') window.SanguoshaEngineModules.Xxx = Xxx;` —— 让旧测试(还在用 `vm.runInContext`)在 Phase 5B 完成前继续工作。
2. **创建 `src/main.js`** 作为浏览器入口,按依赖顺序 `import` 数据模块、runtime 模块、game-engine、ui-adapter。`main.js` 不写新逻辑,只负责装配。
3. **`index.html` 不再由 `tools/build.mjs` 拼接生成,而是手写**;v4 的 `src/index.template.html` 退化为只在 Phase 5C 删除前作为参考。新的 `index.html` 用:

   ```html
   <link rel="stylesheet" href="./src/styles/main.css" />
   ...
   <script type="module" src="./src/main.js"></script>
   ```

   `tools/build.mjs run` 在 5A 暂时保留拼接逻辑以维持 `dist/index.html` 字节相等(为 5C 删除做铺垫),但 root `index.html` 改为手写后,build 仅校验 `dist/index.html` 与拼接结果一致。
4. **每个模块的转换是机械的**:

   ```js
   // 之前
   (function () {
     'use strict';
     var modules = window.SanguoshaEngineModules || (window.SanguoshaEngineModules = {});
     function clone(v) { ... }
     modules.Runtime = { clone, ... };
   }());

   // 之后
   export function clone(v) { ... }
   export const Runtime = { clone, ... };
   if (typeof window !== 'undefined') {
     const modules = window.SanguoshaEngineModules || (window.SanguoshaEngineModules = {});
     modules.Runtime = Runtime;
   }
   ```

5. **`src/engine/game-engine.js`** 顶层不再读 `window.SanguoshaEngineModules`,改为:

   ```js
   import { Runtime } from './runtime.js';
   import { SkillRuntime } from './skill-runtime.js';
   ...
   const MODULES = { Runtime, SkillRuntime, ... };
   export const SanguoshaEngine = { ... };
   if (typeof window !== 'undefined') window.SanguoshaEngine = SanguoshaEngine;
   ```

6. **`src/ui/dom-adapter.js`** 顶层 `import { SanguoshaEngine } from '../engine/game-engine.js'`,DOM 绑定逻辑保持不变。

### 任务

- Task 1: RED `tests/v5_architecture.test.mjs` 启用(去掉 `SANGUOSHA_V5` 守卫的 5A 子集)。
- Task 2: 转换 `src/data/{heroes,cards,skill-status}.js` 为 ES 模块。
- Task 3: 转换 `src/engine/{runtime,skill-runtime,card-runtime,state,phases,judgement,game-engine}.js`。
- Task 4: 转换 `src/ui/dom-adapter.js`。
- Task 5: 新增 `src/main.js`。
- Task 6: 手写新的 `index.html`(可参考 `src/index.template.html` 的非 placeholder 部分)。
- Task 7: 调整 `tools/build.mjs`,只校验 `dist/index.html`(由旧拼接逻辑生成)与新的 `index.html` 行为等价(模块入口标签存在 + 资源路径正确);拼接逻辑加 `export`-stripping 临时 hack(仅限 5A 过渡)。

### 验收标准

- `npm test` 全绿(老测试仍走 `vm.runInContext` 拼接路径,新 v5 架构测试也通过)。
- 本地 `python3 -m http.server` 启动后 http://localhost:8000 可以打开并完成一局对战。
- `file://` 直开方式 **预期失败**,在 README 显式声明。

---

## Phase 5B — Tests switch from `vm.runInContext` to `import`

**Status:** ✅ 已完成。

### 设计要点

- 当前 23 个测试都通过下面这种模板加载引擎:
  ```js
  const html = fs.readFileSync('index.html');
  const match = html.match(/<script id="game-engine"[^>]*>([\s\S]*?)<\/script>/);
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(match[1], sandbox, { filename: 'game-engine.js' });
  const Engine = sandbox.window.SanguoshaEngine;
  ```
- v5B 提供共享 helper `tests/helpers/load-engine.mjs`:
  ```js
  export { SanguoshaEngine as Engine } from '../../src/engine/game-engine.js';
  export { Runtime, SkillRuntime, CardRuntime, StateRuntime, PhaseRuntime, JudgementRuntime }
    from '../../src/engine/index.js'; // 一个 barrel
  ```
- 每个测试文件改 4–10 行 import 即可。
- `tests/architecture_build.test.mjs` 与 `tests/engine_modules.test.mjs` 中关于 `dist/index.html` 字节一致的断言改为「模块入口结构」断言。

### 任务

- Task 1: 新增 `tests/helpers/load-engine.mjs` barrel。
- Task 2: 批量改写 23 个测试的 import,保留断言逻辑不变。
- Task 3: 删除 `vm`、正则提取 `<script id>` 的辅助函数。

### 验收标准

- `npm test` 全绿。
- 测试运行时间不显著上升(原本每个测试都要解析整份 HTML)。

---

## Phase 5C — Drop legacy: single-file artifact, build concat, window shims

**Status:** ✅ 已完成。

### 任务

- Task 1: 删除 `dist/` 目录、`dist/index.html`,从 `tools/build.mjs` 移除拼接逻辑;`tools/build.mjs --check` 改为校验:
  - `index.html` 包含 `<script type="module" src="./src/main.js">` 与 `<link rel="stylesheet" href="./src/styles/main.css">`;
  - 必需的源文件存在;
  - `dist/` 不再存在。
- Task 2: 删除 `src/index.template.html` 与所有 `__SANGUOSHA_*__` placeholder 残留。
- Task 3: 移除所有 `window.SanguoshaData` / `window.SanguoshaEngineModules` / `window.SanguoshaEngine` 写入 shim(只在 5A 临时引入的)。`game-engine.js` 仍可选保留 `window.SanguoshaEngine = …` 一行作为浏览器调试入口,但 `Data` 与 `EngineModules` 必须移除以避免误用。
- Task 4: 更新 `tests/architecture_build.test.mjs`、`tests/data_modules.test.mjs`、`tests/engine_modules.test.mjs`,删除关于「构建拼接顺序」的 assertion,新增「模块直接 import 链路」assertion。

### 验收标准

- `npm test` 全绿。
- 仓库不再有 `dist/`、`src/index.template.html`、字节级构建产物校验。
- 浏览器 http server 仍能跑完整流程。

---

## Phase 5D — GitHub Pages publish

**Status:** ✅ 已完成。

### 任务

- Task 1: 新增 `.github/workflows/pages.yml`,基于官方 `actions/upload-pages-artifact` + `actions/deploy-pages`,从 `main` 分支根目录发布静态站点。`main.js` 与 `src/**` 直接作为静态资产即可。
- Task 2: 在仓库设置启用 Pages(用户操作,本 plan 不能代为完成);README 说明如何启用。
- Task 3: README 增加 v5 章节,标注线上访问地址、本地起 http 服务器命令、不再支持 `file://` 直开。

### 验收标准

- Pages 部署成功,线上 https 链接可以打开并完整游玩。
- README 的运行章节同时给出本地 http 服务器与线上链接两种方式。

---

## Phase 5E — 收尾

**Status:** ✅ 已完成。

### 任务

- 删除 `tools/build.mjs` 中已经无用的辅助函数;若 `build` / `build:check` 两个 npm script 仍要保留(用于 CI 结构校验),保持最小化。
- 更新 README 顶部从「v4.0 模块化源码与单文件构建」改为「v5.0 模块化加载 + GitHub Pages」。
- 把 `docs/plans/2026-04-29-sanguosha-v4-architecture.md` 的 Phase 4 全部状态标记为 Frozen(后续 Phase 4U+ 改在 v5 之上继续做)。

---

## 风险与回滚

- **风险 1:**`<script type="module">` 不能 `file://` 直开。**应对:** README 显式声明、提供 `python3 -m http.server` 一行命令;若用户极度依赖双击 `index.html`,可在 Phase 5E 选择性地基于 ES module 源码用一个外部构建脚本重新合成 single-file release,但不进入主路径。
- **风险 2:** Phase 5A 是一次性大改,失败后回滚成本高。**应对:** 每个文件 ES 化的内部 commit 都保留 `window.Sanguosha*` shim,使老测试与新模块两条加载链路并行,可在任意中间状态停止;Phase 5A 验收后再进入 5B 抽离测试。
- **风险 3:** GitHub Pages 与 Pages workflow 权限。**应对:** Phase 5D 任务包含 README 说明,要求仓库 owner 在 Settings → Pages 启用 "GitHub Actions" source。

---

## 测试矩阵

| 测试 | Phase 5.0 | 5A | 5B | 5C | 5D | 5E |
| --- | --- | --- | --- | --- | --- | --- |
| `tests/v5_architecture.test.mjs` | skip | partial green | green | green | green | green |
| `tests/architecture_build.test.mjs` | green(老语义) | green(老语义) | green(改写) | green(新语义) | green | green |
| `tests/data_modules.test.mjs` | green | green | green(改写) | green(新语义) | green | green |
| `tests/engine_modules.test.mjs` | green | green | green(改写) | green(新语义) | green | green |
| 其余 19 个测试 | green | green | green(改写 import) | green | green | green |
| 浏览器 smoke(http server) | n/a | manual | manual | manual | green(线上) | green |
| `file://` 直开 smoke | green | 弃用 | 弃用 | 弃用 | 弃用 | 弃用 |
