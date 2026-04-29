# 三国杀 · 进阶单文件版

一个可直接打开的单文件离线 HTML 三国杀 1v1 原型。

## 运行

直接用浏览器打开：

```text
index.html
```

不需要服务器、构建步骤或外部依赖。

## 当前版本

`v3.0 正式流程扩展版`

主要特性：

- 单文件 HTML/CSS/JavaScript。
- 1v1 选将、主公/反贼身份与主公先手流程。
- 标准包、风林火山、SP 武将池 catalog。
- 标准 + 军争核心牌组。
- 阶段、装备区、判定区、延时锦囊、部分武将技能和 AI 行动。
- 火攻、铁索连环、顺手牵羊、过河拆桥等交互选择流程。

## 测试

使用 Node 直接执行测试文件，例如：

```bash
node tests/game_engine.test.mjs
node tests/v30_official_flow.test.mjs
```

全量回归：

```bash
node tests/game_engine.test.mjs && \
node tests/catalog.test.mjs && \
node tests/ui_layout.test.mjs && \
node tests/phases.test.mjs && \
node tests/cards_equipment.test.mjs && \
node tests/skills.test.mjs && \
node tests/ai_flow.test.mjs && \
node tests/visual_polish.test.mjs && \
node tests/v27_regression.test.mjs && \
node tests/v28_ux_rules.test.mjs && \
node tests/v29_precise_target_log.test.mjs && \
node tests/v30_official_flow.test.mjs && \
node tests/advanced_engine.test.mjs
```
