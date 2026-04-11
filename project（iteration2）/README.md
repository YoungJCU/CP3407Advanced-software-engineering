# Campus Navigation

Express + SQLite (`server/`) serves the site and API. Static UI is in `client/`.

## One-click start / stop

In **Terminal** (macOS: Terminal.app or Cursor terminal):

```bash
cd "/path/to/test web/project"
chmod +x run_all.sh stop_all.sh
./run_all.sh
```

Then open **http://localhost:3000/** in your browser.

To stop:

```bash
./stop_all.sh
```

Do **not** open `client/index.html` by double-click — use the URL above after `./run_all.sh`.

---

## Sign-in

Email is stored in the browser (`localStorage`) for the header only. Password is validated on the page and not stored.

---

## 编辑器：w_pct / h_pct 单位与行为（说明）

- w_pct / h_pct: 可选字段，表示“相对于整张校园图片”的百分比（取值 0–100）。前端会使用这些值乘以图片的实际像素宽/高来得到绘制的像素宽/高（例如 rw = w_pct / 100 * image.width）。
- 向后兼容：如果没有填写 `w_pct`/`h_pct`，渲染仍然会使用原来的自动尺寸计算（基于 label 长度 + scale），所以这是一个可选字段，不填不会破坏旧数据。
- 拖拽与缩放：当前编辑器在图标右下角提供一个把手（CSS cursor: se-resize），实现为单向的右下角拉伸 —— 会同时改变宽和高（按像素或百分比同时更新）。如果你需要“只改宽/只改高”“锁定纵横比”或“多把手（四角/边中点）”，可以进一步扩展前端交互逻辑。
- 拖动与旋转：编辑器现在支持直接在预览上拖动 Gate 与每个 Block（拖动会改变 left_pct/top_pct 并在保存时写入文件）。每个 Block/Gate 也有一个旋转把手：拖动旋转把手可改变 `rot_deg`（顺时针度数），保存时会把 `rot_deg` 一并写入 `data/block_map.json`。
- 同步到主页：主页面（`index` / `campusoverview`）在渲染时优先使用保存的 `w_pct` / `h_pct`（如果存在）来确定尺寸，并会应用 `rot_deg` 的旋转（SVG 中将把整个 marker 旋转，但会对 label 做反向旋转以保持可读）。因此：在 Map Editor 修改并保存后，刷新主页面即可看到尺寸、位置和旋转的变化被应用。

（注）后端已加入简单校验：`w_pct`/`h_pct` 必须是 0.1–100；`rot_deg` 必须在 -360 至 360 之间。保存失败时编辑器会显示后端返回的错误信息。

- 后端保存：编辑器通过 PUT/POST 请求把整个 JSON body 写入 `client/data/block_map.json`。对应的路由文件是 `server/routes/blockMapApi.js`，它会把接收到的 body 直接用 `fs.writeFile` 覆盖保存。
- 后端验证（已添加）：为了避免明显的坏数据，后端现在对 `blocks[*].w_pct` 和 `blocks[*].h_pct` 进行了可选验证：若存在，则必须是数字且在 0.1 到 100 之间，否则会返回 400 错误。其它现有的字段验证保持不变。

已知限制与建议的改进（可选）

- 当前拖拽把手只在右下角统一改变宽和高；若需更细粒度控制（只改宽/只改高、锁定纵横比或在四角/边中点增加把手），我可以实现并提交前端改动。
- 后端的 `validateBody` 目前只做基本校验；如果你希望更严格（比如确保 0 < w_pct,h_pct <= 100 并返回更详细的错误位置），可以继续改进。当前实现已强制要求 0.1–100 的范围。
- 可以在 Block 卡片上增加一个“重置尺寸”按钮（清除 w_pct/h_pct 字段，回退到自动尺寸）。
- 如果你更倾向于直接保存像素宽/高（而不是百分比），也可以改为在保存时基于当前底图尺寸把百分比换算为像素再保存，但百分比在不同分辨率/响应式场景下更方便。

下一步（我可以帮你执行的操作）

- 把这段说明纳入更完整的 README 或单独的开发文档（已完成本节）。
- 在后端增加更详细的错误信息或更严格的校验（比如对 mapUi/blockDefaults/road 数据做更细的结构检查）。
- 在前端实现更多把手（四角/边中点）、按比例缩放或“只改宽/只改高”的操作。
- 给保存流程做一次本地演示（启动服务并在浏览器中操作并录屏），或我可以把本地运行时的保存日志拷贝给你做验证。

如果你希望我接着做其中一项，请告诉我（例如：1) 实现重置尺寸按钮；2) 增加四角/边中点把手；3) 把百分比换算为像素后保存）。
