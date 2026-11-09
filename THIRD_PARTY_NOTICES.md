# 来源与第三方许可

交互式代码地图的产品思路参考 [fuzhengwei/xfg-coding-map-skills](https://gitcode.com/fuzhengwei/xfg-coding-map-skills)（参考时提交 `aee990e118feaff98bfbf8486b52b1af73f02041`）。本仓库独立编写技能文档、JSON 契约、查看器、构建与校验工具以及示例；未复制上游代码、课程材料或案例。

`assets/vendor/mermaid.min.js` 由 Mermaid 12.3.0 及其传递依赖通过 esbuild 打包。Mermaid 使用 MIT 许可，原文保存在 `assets/vendor/mermaid.LICENSE`。构建器根据实际打包输入收集依赖的许可证，保存在 `assets/vendor/THIRD_PARTY_LICENSES.txt` 并追加到 bundle，随单文件地图一同内联。精确依赖版本见 `package-lock.json`；运行 `npm ci && npm run vendor` 可重新打包。

本仓库自有代码和文档使用根目录 `LICENSE` 的 MIT 许可。第三方组件仍按各自许可分发。
