# Wikloom

本地优先的个人知识库。**M2 已接入真实文件系统**：桌面版直接读写你选的文件夹，每篇笔记是一个 `.md` 文件，元数据在 frontmatter 里；Web 版用内存演示库。

## 运行

```bash
pnpm install
pnpm dev        # 浏览器演示：内存 FS + localStorage（刷新仍在）
pnpm build      # tsc --noEmit && vite build
pnpm tauri dev  # 桌面版：选真实文件夹，读写 Markdown
```

桌面版通过 Tauri `fs` + `dialog` 插件访问文件。选目录只在 Rust 里完成：`pick_vault` 打开系统对话框 → `canonicalize` → `allow_directory`，前端不能指定要放行的路径。静态 fs scope 为空，读写只覆盖用户选中的目录；路径存在 app config 的 `vault-path.txt`，下次启动由 Rust 恢复 scope。

如果在受限终端/沙箱里运行，WebView2 默认写 AppData 可能被拦，指定工作区内的状态目录：

```powershell
$env:WIKLOOM_WEBVIEW_DATA_DIR="$PWD\.tmp\webview2-data"
pnpm tauri dev
```

`WIKLOOM_STATE_DIR` 可以单独指定 `vault-path.txt` 的目录；未设置时优先用 `WIKLOOM_WEBVIEW_DATA_DIR`，再退到 app config。`pnpm-workspace.yaml` 里显式关闭了 esbuild 的 postinstall（pnpm 11 默认拦截构建脚本），并把依赖布局设为 `nodeLinker: hoisted`（Node 24 + Windows 下 pnpm junction 的 realpath 问题）。

## 目录

```text
src/
├── app/          Shell、Sidebar、命令面板、hash 路由、全局状态、选库对话框
├── features/
│   ├── notes/    列表、正文、标签页、引导、错误页、演示库
│   ├── editor/   Markdown 渲染、CodeMirror 编辑态
│   ├── links/    反链抽屉
│   ├── clipper/  剪藏占位（M3）
│   └── settings/ 设置页
├── core/
│   ├── fs/       FileSystemPort：Tauri 实现 + 内存实现
│   ├── vault/    frontmatter、扫描索引、原子写、错误映射
│   ├── links/    wiki 链接与反链
│   ├── search/   标题 / 正文 / 标签搜索
│   └── paths.ts  路径归一化与 root 越界守卫
└── ui/           Button / Input / Dialog / Panel / EmptyState 等
src-tauri/        Tauri 2 壳、fs/dialog 插件、capabilities
```

## M2 范围

- 首次启动引导：选知识库文件夹；选择结果持久化，下次自动打开；设置页可换库、看当前路径、重新扫描
- 扫描目录 → 解析 frontmatter → 建索引；缺 frontmatter 的文件补 `id`(ULID) / `created` / `updated` / `title` / `tags` 并**写回磁盘**
- 选中文件夹后由 Rust 命令 `pick_vault` 打开对话框、canonicalize 并把该目录加入 fs scope；静态 scope 为空，前端没有放权入口
- 编辑后 800ms 自动保存 + `Ctrl S` 立即保存；临时文件 + `rename` 原子写
- 关窗时 `onCloseRequested` 先 flush 再 destroy，另有 `pagehide` 兜底
- 路径守卫：拒绝 `..`、绝对路径；Tauri 端还会 `lstat` 每一级路径，拒绝符号链接
- 错误态：文件夹不存在 / 权限不足 / 路径不是目录 / 单个文件 frontmatter 损坏，都有可读提示
- 文件内容留在本地；没有文件监听，外部编辑器改动不会实时同步

## 验收与测试

- `pnpm exec tsc --noEmit`
- `pnpm build`
- Playwright（内存 FS）：首次引导、真实文件列表、新建 `.md`、自动保存 / `Ctrl S`、刷新重开、换库、坏库错误页；脚本在工作区 `.tools/shoot/m2-e2e.mjs`
- 真实磁盘 harness（Node fs 适配器跑同一套 core/vault）：frontmatter 补写、已有字段保留、原子保存、重开、换库不写脏、删库报错

## 截图

- `screenshots/m2/01-onboarding.png` 首次引导
- `screenshots/m2/02-notes.png` 真实文件列表
- `screenshots/m2/03-editing.png` 编辑态 / 自动保存
- `screenshots/m2/05-switch-vault.png` 换库
- `screenshots/m2/06-error.png` 坏库错误页
- `screenshots/m2/07-tauri-real-fs.png` Tauri 真机读写
- `screenshots/m2/08-tauri-create.png` Tauri 真机新建笔记
- `screenshots/m2/09-tauri-reopen.png` Tauri 关掉重开后仍记得知识库

## 暂不做（M3+）

文件监听、重命名自动改双链、外部修改冲突合并、AI、网页剪藏。

## 参考

- siyuan-note/siyuan —— 三栏 dock、反链面板两段式
- usememos/memos —— kit/ui 分层、编辑 / 展示双态
- obsidianmd/obsidian-clipper —— 五段剪藏面板、单主按钮
