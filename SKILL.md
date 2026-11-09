---
name: coding-map-skill
description: "把源码、Git 变更或需求设计生成可离线分享的交互式 HTML 代码地图，包含工程树、全景/时序/流程图、节点说明和分步导览。用于代码讲解、迭代复盘、PR 讲解、开发蓝图和架构入门。"
---

# Coding Map

围绕一个功能或一条工程主线，产出结构化 JSON 和可独立打开的 HTML。使用本技能目录的脚本；以下命令中的 `<skill>` 指本技能目录。

## 选择素材与主线

按用户目标选择 S1 教学、S2 迭代、S3 蓝图、S4 PR 或 S5 入门，读取 [场景说明](references/scenarios.md) 中相应部分。目标已明确时直接推进；只有范围或基线无法从上下文确定且会改变结论时才询问。

- 迭代/PR：运行 `node <skill>/scripts/extract-diff.mjs <repo> <base> [head]` 获取摘要，再阅读 diff 和关键源码。PR 通常用 `--merge-base`；只有需要包含未提交改动时才用 `--worktree`。两项不组合使用。
- 教学/入门：从真实入口追踪一次典型调用，核对核心分支、持久化、外部依赖和异常出口。
- 需求蓝图：结合现有实现设计目标态，明确标注计划新增、调整和复用；不要把计划描述成已实现。

摘要不是完整分析。文件名、行号、调用顺序和变更统计应有源码或 Git 证据；不清楚的地方标为待核实。

## 构建地图数据

读取 [数据契约](references/data-spec.md)，可从 `examples/order-request.json` 或 `examples/pr-change.json` 开始。案例是虚构教学示意，替换其内容，不将其路径或业务结论带入真实项目。

1. 在用户指定目录输出 JSON；未指定时使用 `<project>/docs/code-map/<topic>/`。
2. 工程树聚焦本主题；说明卡回答职责、关键设计和边界；三类图分别表达结构、调用顺序和方法分支，按需要保留 1–3 张。
3. 树节点用明确的图节点 ID 建立 `anchors`；时序锚点填写精确的 participant 显示名。避免靠宽泛关键词关联。
4. 导览按请求或开发顺序组成一条完整叙事，通常 6–10 站。首站解释全貌，末站给出异常边界、验证方式或验收标准；不为凑站数添加重复内容。

数据字段为纯文本。通过 JSON 修改内容，不手工拼接脚本或修改生成后的 HTML。

## 生成与检查

```bash
node <skill>/scripts/validate-map.mjs <data.json>
node <skill>/scripts/build-map.mjs <data.json> <map.html>
node <skill>/scripts/validate-map.mjs <map.html>
```

静态错误应修复后再交付，警告按实际语义处理。具备本地浏览器条件时继续运行：

```bash
node <skill>/scripts/check-render.mjs <map.html>
```

此检查需要在本技能目录执行过 `npm ci` 和 `npx playwright install chromium`。也可用已有浏览器实际打开 HTML，检查图的渲染、树/图/卡片联动和导览。没有浏览器条件时说明只完成静态检查，不把它报告成渲染通过。

校验只能检查数据与交互的一致性，不能证明图与业务代码语义一致。交付前回看入口、关键分支与异常出口是否有代码依据。

## 交付

提供 JSON 与单文件 HTML 的可访问链接，简短说明主题、输入基线和已完成的检查。提示读者用顶部导览跟随主线，或点击树、图、说明卡自由浏览。HTML 已包含 Mermaid，无需再附 `vendor` 目录。
