# 地图数据契约（schemaVersion: 1）

地图内容保存在 UTF-8 JSON 文件中。使用 `node scripts/build-map.mjs <data.json> <output.html>` 生成 HTML；不要直接修改生成后的 HTML 或模板引擎。

```json
{
  "schemaVersion": 1,
  "title": "订单请求代码地图",
  "subtitle": "从 HTTP 入口到持久化",
  "project": "order-service",
  "scenario": "S5",
  "stats": [{"label": "核心模块", "value": "3"}],
  "diagrams": [{"id": "overview", "title": "全景图", "source": "flowchart LR\n  API[HTTP入口] --> Service[订单服务]"}],
  "tree": [{
    "id": "api", "name": "OrderController", "kind": "class", "status": "new",
    "docId": "api-doc",
    "anchors": [{"diagram": "overview", "node": "API", "label": "HTTP入口"}]
  }],
  "docs": [{
    "id": "api-doc", "title": "OrderController · 接收订单", "status": "new",
    "file": "src/OrderController.ts:12", "summary": "校验输入并调用应用服务。",
    "details": ["入口负责参数转换。", "业务约束由领域服务维护。"]
  }],
  "tour": [{"title": "入口", "text": "先看请求如何进入。", "diagram": "overview", "treeId": "api"}]
}
```

- `schemaVersion` 固定为数字 `1`。`title`、`project`、`scenario` 必填；`subtitle` 和 `stats` 可省略。`scenario` 为 S1 教学 / S2 迭代 / S3 蓝图 / S4 PR / S5 入门。
- `diagrams` 为 1–3 项，`id` 唯一，使用 `overview` / `sequence` / `flow`。只提供需要的图，删减图不需要修改引擎。`source` 为 Mermaid 图源；全景和流程使用 flowchart，时序使用 sequenceDiagram。
- `tree` 为嵌套数组；节点必填 `id`、`name`、`kind`。`kind` 为 module / package / class / interface / method。`children` 可省略。全树 `id` 唯一。`status` 可省略，支持 new / modified / reused / external / warning / error。
- 有说明卡的节点填写 `docId`，引用 `docs.id`，并提供至少一个 `anchors`。锚点 `diagram` 引用图 ID，`node` 是 Mermaid 图中的节点/participant 标识符，`label` 是渲染后精确匹配的显示文本（推荐填写，时序图必填）。不要用宽泛关键词猜测节点。
- `docs` 中每项必填唯一 `id`、`title`、`summary`；可填 `file`、`status`、`details`（字符串数组）。内容为纯文本，不支持任意 HTML。文件名和行号必须来自实际源码；设计中的文件须标为计划。
- `tour` 为站点数组，每站必填 `title`、`text`、`diagram`，可填写 `treeId` 联动树节点；通常 6–10 站，但不强制凑数。第一站给全貌，中间按请求/开发顺序推进，末站说明边界、验证或验收。有 `treeId` 时该节点须有当前图的锚点。
- 五色语义：new=绿 / reused=灰 / external=蓝 / warning=橙 / error=红；modified 使用橙色。Mermaid 图中可用 `classDef` 配色，示例展示具体写法。时序参与者颜色由锚点关联树状态补充。

所有文字字段都是纯文本。JSON 通过构建器转义后嵌入 HTML。不要将密钥、个人数据或未授权的源码内容放入可分享地图。

`validate-map.mjs` 校验数据结构和跨引用；不执行数据中的 JavaScript。Mermaid 语法与渲染后锚点需通过 `check-render.mjs` 的真实浏览器检查；两层检查均不证明业务语义正确。
