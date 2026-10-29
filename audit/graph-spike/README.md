# S3 Spike 结果：cytoscape.js 大图性能（2026-10-29）

目的：把「1000 节点 / 5000 边在 WebView2 能不能跑」从推断变成数字，决定 S4 用 cytoscape 还是换 sigma。

## 环境与口径

- 运行环境：Tauri debug 0.4.2（Windows，WebView2 / Edge 156 内核），1280×820 窗口。
- 数据：合成图，1000 节点、5000 条有向边（固定生成规则，不依赖真实知识库）。
- 布局：内置 `cose`，`animate:false`，分别跑 `numIter=100` 与 `numIter=50` 两个预算；另用 `preset` 量「只建图 + 一次绘制」。
- 配置两组：
  - `default`：不改任何渲染选项，满画质。
  - `hints`：`hideEdgesOnViewport`、`textureOnViewport`、`motionBlur` 全部为 true。
- 每组 5 轮，取中位数（首屏、hover、FPS、长帧），原始每轮数据见 `results-100.json` / `results-50.json`。
- 阈值（Chief 2026-10-29 定）：首屏 ≤2s；hover p95 ≤100ms；平移平均 ≥50 FPS；长帧（单帧 >50ms）≤3。

测量方法：

- 首屏：元素数组就绪 → 布局 + 首个可交互帧（`layoutstop` 后再等一个 `requestAnimationFrame`）。
- preset 首帧：同一路径但用 `preset` 布局，只含建图与一次绘制，用来把渲染成本和布局成本分开。
- hover：把指针移到节点位置，从 `pointermove` 到邻居高亮 class 应用并完成下一帧为一次采样；每轮 30 次取 p95。
- 平移：每帧调用 `panBy` 连续 3 秒，统计 rAF 帧数与 >50ms 的长帧数。

## 结果（中位数）

### numIter=100（第一轮，未达标）

| 配置 | 首屏 | preset 首帧 | 布局 | hover p95 | 平移 FPS | 长帧 |
| --- | --- | --- | --- | --- | --- | --- |
| default | 2718 ms ✗ | 284 ms | 2617 ms | 41 ms ✓ | 53.3 ✓ | 1 ✓ |
| hints | 2617 ms ✗ | 238 ms | 2553 ms | 45 ms ✓ | 53.3 ✓ | 0 ✓ |

### numIter=50（最终采用）

| 配置 | 首屏 | preset 首帧 | 布局 | hover p95 | 平移 FPS | 长帧 |
| --- | --- | --- | --- | --- | --- | --- |
| default（满画质） | **1559 ms ✓** | 288 ms | 1502 ms | **44 ms ✓** | **52.3 ✓** | **0 ✓** |
| hints | 1598 ms ✓ | 240 ms | 1517 ms | 46 ms ✓ | 52.7 ✓ | 1 ✓ |

### 布局预算诊断（单独探针，2 次采样）

| 布局预算 | 布局耗时 |
| --- | --- |
| cose 默认（不设 numIter） | 12521 / 13142 ms |
| numIter=100 | 2094 / 2131 ms |
| numIter=50 | 1216 / 1288 ms |
| numIter=25 | 778 / 808 ms |
| numIter=10 | 504 / 663 ms |

（探针只量布局，不含样式与首帧渲染，所以比表格里的「布局」列略小。）

## 结论

1. **渲染不是瓶颈，布局才是。** preset 首帧 240–288 ms，hover 44 ms、平移 52 FPS、长帧 0，说明 canvas 渲染 1000/5000 完全够用；首屏超标全部来自 `cose` 布局。
2. **满画质达标，不需要降质开关。** `default`（三个渲染 hint 全关）在 `numIter=50` 下四项全部过线；`hints` 没有带来可测收益。因此不采用「有条件达标」，也不切换 sigma。
3. **`numIter=50` 是 S4 的必需配置。** 不设迭代上限时布局 12.5–13.1 s，首屏不可用；100 次也要 2.6 s。代价是布局收敛度降低（50 与 100 的截图见 `layout-50.png`、`layout-100.png`，合成图呈多个团簇，真实笔记图会更连成一片，S4 用真实数据再看一次观感）。
4. **限制**：单机、单次环境；合成图的结构与真实知识库不同，性能数字可用，观感需 S4 用真实数据复核。

复跑方式：spike 页面是临时路由，验收后已删除；如需重跑，从本目录 `results-*.json` 的 `layout`/`thresholds` 字段还原参数即可。
