# Wikloom

本地优先的个人知识库。**M1 只做界面骨架**：三栏布局、阅读 / 编辑双态、反链抽屉、命令面板；数据是内存 mock，不接文件系统、AI 与剪藏。

## 运行

```bash
pnpm install
pnpm dev        # http://127.0.0.1:5173
pnpm build      # tsc --noEmit && vite build
```

桌面壳是 Tauri 2，M1 未编译验证（需要 Rust 工具链）：

```bash
pnpm tauri dev
```

`pnpm-workspace.yaml` 里显式关闭了 esbuild 的 postinstall（pnpm 11 默认拦截构建脚本），依赖仍可正常使用。

## 目录

```text
src/
├── app/         Shell、Sidebar、命令面板、hash 路由、全局 UI 状态
├── features/
│   ├── notes/   列表、正文、标签页、mock 数据（content/*.md）
│   ├── editor/  Markdown 渲染、CodeMirror 编辑态
│   ├── links/   反链抽屉
│   ├── clipper/ 剪藏占位（M3）
│   └── settings/设置页
├── core/        纯逻辑：wiki 链接、反链、搜索、时间、文本
└── ui/          Button / Input / Dialog / Panel / EmptyState 等
src-tauri/       Tauri 2 壳（scaffold）
```

## M1 范围

- 10 篇个人库 mock 笔记 + 3 篇工作库笔记，互相 `[[链接]]`
- 阅读态：中文正文、表格、代码块、KaTeX 公式
- 编辑态：CodeMirror 6，`Ctrl S` 保存（内存）
- 反链面板：「引用 / 提及」两段，从 mock 正文实时计算
- 命令面板：`Ctrl K`，搜索笔记 + 8 条命令
- 空 / 加载 / 错误三态，设置页可手动触发
- 快捷键：`Ctrl K` 命令面板、`Ctrl N` 新建、`Ctrl E` 切换阅读 / 编辑（macOS 用 `⌘`）
- 浏览器演示时 `Ctrl/⌘ N` 通常被浏览器占用，可用左侧「新建笔记」或命令面板；Tauri 桌面端不受影响

## 截图

- `screenshots/home.png` 首页阅读态
- `screenshots/editing.png` 编辑态
- `screenshots/command-palette.png` 命令面板

## 不做

真实文件系统、AI、剪藏抓取、持久化、Tauri 构建验证（从 M2 起）。

## 参考

- siyuan-note/siyuan —— 三栏 dock、反链面板两段式
- usememos/memos —— kit/ui 分层、编辑 / 展示双态
- obsidianmd/obsidian-clipper —— 五段剪藏面板、单主按钮
