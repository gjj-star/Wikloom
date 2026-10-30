# 三栏可调宽：方案骨架（v2.0 新增需求）

状态：方案草案，未实现。范围按 Chief 的 2026-10-30 口径：栏间加可拖动分隔条；宽度写 `localStorage`、下次打开保持；双击分隔条恢复默认；每栏有最小/最大宽度，拖不出屏幕。**不做**布局预设、不做动画。

## 1. 现状

- 三栏在 `src/app/Shell.tsx`：`Sidebar`（`w-[220px]`）+ `main`（`NoteList` `w-[320px]` + `NotePane` flex + `BacklinkDrawer` 打开时 `w-[340px]`、关闭时 `w-0`）。
- 宽度全部写死在 Tailwind class 里；反链抽屉靠 `transition-[width] duration-200` 开关。
- 图谱/标签/剪藏/设置是独立路由，只保留 Sidebar，不挂 NoteList/BacklinkDrawer。

## 2. 分隔条放在哪

三处，都是「右栏宽度可变、主内容 flex 吃掉剩余」：

| 分隔条 | 位置 | 拖动改变 | 生效范围 |
| --- | --- | --- | --- |
| S1 | Sidebar 右缘、`main` 之前 | Sidebar 宽度 | 所有路由（含图谱等全宽页） |
| S2 | NoteList 与 NotePane 之间 | NoteList 宽度 | 仅笔记页 |
| S3 | NotePane 与 BacklinkDrawer 之间 | 反链抽屉宽度 | 仅笔记页且抽屉打开时 |

- 分隔条本身 6px 命中区，视觉上 1px 竖线；`cursor: col-resize`；不额外占布局空间（绝对定位在边界上，或用 6px flex 项，取后者更简单）。
- 反链抽屉关闭时 S3 不渲染；打开时按上次宽度。

## 3. 宽度与持久化

- 状态放独立 store：`src/app/layoutStore.ts`（zustand，与 `uiStore` 分离，避免拖动时整个应用跟着重渲染）。
  - `sidebar: number`、`noteList: number`、`backlinks: number`。
  - 默认 `220 / 320 / 340`（与现状一致）。
  - 保存值范围：sidebar `180–320`、noteList `240–560`、backlinks `260–600`；主内容最小 `360`。
  - **窄窗临时压缩不写回保存值**：noteList 的有效宽度在窗口不足时可临时降到 `180`，但 `localStorage` 里仍是用户拖到的值（≥240），窗口恢复后回来。
- 存储键：`wikloom:layout.v1`，值 `{"version":1,"sidebar":220,"noteList":320,"backlinks":340}`。
  - 脏数据分两层：
    - **非数字 / JSON 解析失败 / version 不匹配** → 整体回落默认值；
    - **是数字但超出范围** → 逐项 `clamp` 到范围，不丢其他字段。
  - 反链抽屉宽度单独记忆：收起不丢，重新打开沿用上次值。
  - 写入时机：`pointerup`、`pointercancel` 后的清理、双击重置、键盘调整后各写一次；拖动过程中只更新内存，不写 localStorage。
- 反链抽屉的「是否打开」仍由 `uiStore.backlinksOpen` 管，不持久化（保持现状）。

## 4. 拖动与约束

- 用 Pointer Events + `setPointerCapture`：按下记录起始宽度与起点 x，`pointermove` 里算 `newWidth = start + dx`，**用 `requestAnimationFrame` 合并到每帧再 clamp + set**，不在事件回调里直接改状态；松手持久化。
- clamp 同时考虑视口：
  - S1 上限 = `min(320, 视口宽 − 其他两栏有效宽 − 360)`；
  - S2 上限 = `min(560, 视口宽 − sidebar − 抽屉有效宽 − 360)`；
  - S3 上限 = `min(600, 视口宽 − sidebar − noteList 有效宽 − 360)`。
  - 任何一条都不得低于各自最小值。
- 空间不足时按定稿顺序让位，不压编辑器：**先临时收起反链抽屉（不改保存值）→ 仍不够把 noteList 有效宽度压到 180 → 主内容始终 ≥360**；侧栏保持自身最小值 180，不做折叠栏。Tauri 窗口最小宽度 960（`tauri.conf.json` 的 `min_inner_size`），这一套在桌面端放得下；浏览器更窄时接受主内容横向空间不足，但不改变保存值。
- 拖动时给 `body` 加 `cursor: col-resize; user-select: none`；`pointerup` 和 **`pointercancel`** 都要释放 `setPointerCapture`、移除 body 样式、清掉拖动态；窗口失焦/触摸中断只走 `pointercancel`，不能只监听 `pointerup`。
- `BacklinkDrawer` 的宽度过渡（`transition-[width]`）在拖动期间关闭（`data-dragging` 或临时 `transition: none`），松手恢复；否则 pointer capture 与过渡动画会互相抢宽度。

## 5. 双击与键盘

- 双击分隔条：该栏恢复默认宽度并立即持久化；其余栏不动。
- 可访问性：`role="separator"`、`aria-orientation="vertical"`、`tabIndex=0`、`aria-valuenow/min/max`。
  - `←/→` 调整 16px；`Home/End` 到最小/最大；调整后持久化。
  - 焦点样式复用现有 `focus-visible:ring`。

## 6. 窗口变窄与全宽页面

- 监听 `resize`，**用 rAF 合并到每帧再算一次**；计算「有效宽度」时不改内存里的保存值：
  1. 先临时把反链抽屉有效宽度收为 0（保存值保留，关掉再打开仍是原宽度）；
  2. 仍放不下时，把 noteList 有效宽度压到 180（保存值仍是 ≥240）；
  3. 主内容始终 ≥360，不把编辑器压到无法输入；侧栏保持 180 起。
- 窗口恢复时按保存值还原；全程不写 `localStorage`。
- Tauri 桌面窗口最小 960 宽（`min_inner_size`），三档压缩后仍够放；浏览器窗口更窄时不折叠栏，接受主内容空间不足。
- 进入图谱/标签/剪藏/设置：只保留 S1（Sidebar）；S2/S3 不渲染，保存的 list/drawer 宽度不动，回到笔记页原样恢复。
- 不做断点折叠/抽屉化，不改变现有三栏语义。

## 7. 改动点

| 文件 | 改动 |
| --- | --- |
| `src/app/layoutStore.ts` | 新增：宽度状态、默认值/范围、localStorage 两层兜底、clamp 与「有效宽度」纯函数 |
| `src/ui/Splitter.tsx` | 新增：pointer capture + rAF 合并、双击重置、键盘调整、pointercancel 清理 |
| `src/app/Shell.tsx` | 插入 S1；笔记页插入 S2、S3 |
| `src/app/Sidebar.tsx` | 宽度改由 store + 内联 style |
| `src/features/notes/NoteList.tsx` | 同上（含窄窗临时 180） |
| `src/features/links/BacklinkDrawer.tsx` | 打开时宽度由 store；拖动期间禁用宽度过渡；窄窗临时收起但保留保存值 |
| `src/features/graph/GraphPage.tsx` 等全宽页 | 不改，仅沿用 Sidebar 宽度 |

## 8. 验收口径

1. 三条分隔条可拖，拖动时实时变化、松手后写入 `localStorage`；刷新页面宽度恢复。
2. 双击任一分隔条只重置该栏到默认，其余栏不变。
3. 每栏达到 min/max 后拖不动；任何拖法都不会把栏拖出可视区域、不出现横向滚动条。
4. 窄窗顺序：打开反链抽屉后缩窗口 → 抽屉先临时收起（保存值不变，拉宽后按原值回来）→ 仍不够时 noteList 压到 180（保存值不变）→ 主内容始终 ≥360。
5. 键盘可操作：Tab 聚焦分隔条，方向键 ±16px，Home/End 到端点，ARIA 值同步。
6. 图谱/标签/剪藏/设置只显示 Sidebar 分隔条；切回笔记页后 list/drawer 宽度保持。
7. 反链抽屉关闭时无 S3；打开后宽度沿用上次值。
8. 脏数据：`localStorage` 写入非法 JSON/非数字/旧 version → 刷新回落默认；写入超范围数字 → 刷新后 clamp 到边界，其他栏保持。
9. `pointercancel`（触摸中断/窗口失焦）后 body 的 `cursor`/`user-select` 已清理、pointer capture 已释放、可以继续选中文本。
10. 拖拽与窗口 resize 都经 rAF 合并，连续拖动/缩放不掉帧；无新增动画（仅保留现有抽屉开关过渡）、无布局预设。
11. 现有 60+ 测试与图谱功能不回归。

## 9. 交付顺序与估计

| 步 | 内容 | 验收 |
| --- | --- | --- |
| L1 | `layoutStore` + clamp 纯函数 + 有效宽度函数 + 单测：范围 clamp、脏数据两层兜底、窄窗三段顺序、最小主内容 360 | 单测通过 |
| L2 | `Splitter` 组件（rAF、pointercancel）+ 三处接线 + 双击/键盘 | 浏览器拖动/重置/键盘 |
| L3 | resize 压缩、抽屉临时收起、全宽路由行为 | 浏览器窄窗与路由切换 |
| L4 | 证据：拖动前后截图、刷新恢复、窄窗三段截图、pointercancel 后选中文本；Tauri 真机拖一次 | 截图 + 日志 |
| L5 | Review | — |

约 1.5–2 个工作日。

## 10. 已定口径（2026-10-30）

1. 三处分隔条都做；反链抽屉的分隔条只在抽屉打开时出现。
2. 反链抽屉宽度单独记忆，收起再打开沿用上次值。
3. 窄窗顺序：先临时收起反链抽屉（不覆盖保存值）→ 笔记列表临时压到 180 → 主内容始终 ≥360；不做折叠栏，不允许把编辑器压到无法输入。
4. 拖动与 resize 一律 rAF 合并；`pointercancel` 与 `pointerup` 同等清理；脏数据按「非数字回落默认、数字超范围 clamp」两层处理。
