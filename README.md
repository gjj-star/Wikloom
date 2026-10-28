# Wikloom

本地优先的个人知识库。**M2 已接入真实文件系统，M3 已接入 AI 生成，M3.5 加了选词建链，M4 已接入网页剪藏**：桌面版直接读写你选的文件夹，每篇笔记是一个 `.md` 文件，元数据在 frontmatter 里；AI 支持整篇生成、编辑区内联动作和自定义模式；选中正文文字可以右键生成一篇双链笔记；可以在应用内输入 URL，抓取正文、预览后保存为 Markdown；Web 版用内存演示库。

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
│   ├── clipper/  网页剪藏对话框、正文抽取
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

## M3 范围

- Provider：Claude Code / Codex / Gemini / Ollama / 自定义 CLI；设置页可检测、浏览、手填、测试，支持取消
- 全篇生成：选模式（24 个内置 + 自定义）、填主题、指定子文件夹，生成后先预览标题/标签/开头，确认才写入
- 写入走 M2 的 frontmatter 与原子写链路；托管字段由 Wikloom 生成，生成结果里的 `status` 等未知字段保留
- 内联动作：编辑器选区 → 9 个插件动作 → 按插件行为插入到选区下方或替换选区
- 自定义模式：新增 / 编辑 / 删除，存本地设置；ID 按插件规则从名称推导，不写入 Markdown
- 入口：命令面板「整篇生成（实验）」「内联 AI 动作」「自定义模式」；侧栏不再放生成按钮

## M3.5 选词建链

- 正文里选中文本 → 编辑器右键「创建双链笔记…」或工具栏「建链笔记」；阅读态选中文本也能直接从右键进入
- 先选模式，每个模式显示中文名 + 一句说明；提示词仍使用 `docs/plugin-modes.json` 的英文原文
- 生成 → 预览标题/开头/字数 → 确认后写入当前知识库，frontmatter 带 id/title/created/updated/tags（默认 `AI`、`建链`）和 `source_note`
- 原选区替换成 `[[标题]]`，走 CodeMirror 事务，`Ctrl+Z` 可撤销；已创建的笔记文件不会随撤销自动删除
- 已有同名笔记时可选「复用已有」或「新建并加序号」；选区已经是链接、或同名笔记来源相同时只提示，不重复创建

## M4 范围

- 入口：侧栏「剪藏」或命令面板「剪藏网页…」，在应用内粘贴 URL
- 抓取在 Rust 侧完成：只允许 http / https，跟随最多 10 次重定向；每次跳转都重新校验目标，拒绝 `file://`、localhost、本机 / 内网 IP
- DNS 校验与真实请求使用同一组解析结果，避免 DNS rebinding 在校验后改指向内网；总超时 20 秒，响应上限 5MB，使用正常浏览器 UA
- 编码顺序：BOM → `Content-Type` charset → HTML `<meta charset>` → UTF-8；中文 GBK 页面实测不乱码
- 正文抽取：`defuddle/full` + `linkedom` 动态导入，不进入首屏主包；抽不到正文时降级到 `article` / `main` / 常见正文容器，再不行报错
- 支持普通 HTML 文章页，包括中文 GBK 页面和图片较多的页面；需要登录、纯 JS 渲染或非 HTML 内容不支持
- Markdown 保留标题、列表、表格、代码块；图片与相对链接转绝对 URL，恢复 `data-src` / `data-original` 等懒加载属性
- 保存前预览标题、来源域名、字数、正文开头；确认后走 M2 的 frontmatter 与原子写链路，默认加 `剪藏` 标签，并写入 `source_url` / `clipped_at`
- 错误态：网络失败、404、非 HTML、页面过大、超时、抽不到正文、非法 / 内网地址，各有可读提示与重试 / 返回修改
- 不做模板编辑器、浏览器扩展、阅读高亮和批量抓取

## 验收与测试

- `pnpm test`（vitest：45 项，含保存失败草稿、选区映射、建链、AI 解析等回归）
- `pnpm exec tsc --noEmit`
- `pnpm build`
- 审计冒烟（可重跑）：`pnpm build && pnpm exec vite preview --port 4173`，另开一个终端 `node audit/2026-10-28/browser-smoke.mjs`；9 步截图写到 `screenshots/audit-2026-10-28/`。Playwright 默认浏览器没装时，用 `CHROMIUM_PATH` 指向本机已有的 Chromium/Chrome。
- 真机复核（只读目录 + 关窗确认）：先 `pnpm tauri build --debug --no-bundle`，再用 `WIKLOOM_STATE_DIR`（内含 `vault-path.txt`）和 `WIKLOOM_WEBVIEW_DATA_DIR` 指向临时目录启动 debug 版，`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223`；随后 `node audit/2026-10-28/tauri-check.mjs`，步骤见脚本头部注释。
- Playwright（内存 FS）：首次引导、真实文件列表、新建 `.md`、自动保存 / `Ctrl S`、刷新重开、换库、坏库错误页；脚本在工作区 `.tools/shoot/m2-e2e.mjs`
- 真实磁盘 harness（Node fs 适配器跑同一套 core/vault）：frontmatter 补写、已有字段保留、原子保存、重开、换库不写脏、删库报错
- AI 真机 E2E（脚本在工作区 `.tools/shoot/`）：设置页检测/测试、全篇生成预览与落盘、内联动作替换/下方插入、自定义模式增删改与持久化；假 CLI 覆盖取消/缺 CLI/解析失败，真实 Claude 跑通 Feynman 全篇生成与 Simplify 内联动作
- M3.5 建链真机 E2E（脚本在工作区 `.tools/shoot/m35-*.mjs`）：选词 → 右键 → 生成 → 预览 → `[[标题]]` 回写 → 反链；复用、同源提示、新建序号、`Ctrl+Z`、剪贴板，以及列表/阅读/编辑五处右键菜单
- M4 剪藏真机 E2E（脚本在工作区 `.tools/shoot/m4-*.mjs`）：英文文章、中文 GBK、图片页、重定向、四类错误态；GBK 样本 `news.enorth.com.cn/system/2011/06/21/006783899.shtml`，图片页 28 张图片全部为可打开的绝对 URL
- `cargo test clipper::tests`：GBK 解码、header charset 优先、内网 / localhost 拦截、非 http 协议拒绝

## 截图

- `screenshots/m2/01-onboarding.png` 首次引导
- `screenshots/m2/02-notes.png` 真实文件列表
- `screenshots/m2/03-editing.png` 编辑态 / 自动保存
- `screenshots/m2/05-switch-vault.png` 换库
- `screenshots/m2/06-error.png` 坏库错误页
- `screenshots/m2/07-tauri-real-fs.png` Tauri 真机读写
- `screenshots/m2/08-tauri-create.png` Tauri 真机新建笔记
- `screenshots/m2/09-tauri-reopen.png` Tauri 关掉重开后仍记得知识库
- `screenshots/m4/01-preview-english.png` 英文文章预览
- `screenshots/m4/03-preview-gbk.png` 中文 GBK 文章预览
- `screenshots/m4/05-preview-images.png` 图片多的页面
- `screenshots/m4/07-error-network.png` 网络失败
- `screenshots/m4/11-preview-redirect.png` http → https 重定向后预览
- `screenshots/m35/02-link-form.png` 选词建链的模式选择
- `screenshots/m35/03-link-preview.png` 生成预览
- `screenshots/m35/19-exact-recursion-backlink.png` 递归笔记与反链来源
- `screenshots/m35/09-editor-selection.png` 编辑器右键菜单

## 第三方许可

M4 新增的两个前端依赖按实际许可证记录：

- `defuddle` 0.19.5 — MIT
- `linkedom` 0.18.13 — ISC

## 暂不做

流式输出、多轮对话、整篇生成后自动建链、文件监听、重命名自动改双链、外部修改冲突合并、剪藏模板编辑器、浏览器扩展、阅读高亮、批量抓取。

## 参考

- siyuan-note/siyuan —— 三栏 dock、反链面板两段式
- usememos/memos —— kit/ui 分层、编辑 / 展示双态
- obsidianmd/obsidian-clipper —— 五段剪藏面板、单主按钮
