# PRD 对照状态清单：PRD v1.1 → Wikloom v0.4.2

更新：v0.4.2（外部审计修订，未打 tag；审计基线 `7339ee2` / v0.4.1）

| 项 | 值 |
| --- | --- |
| 对照 PRD | 《个人知识 Wiki 产品需求文档》v1.1，2026-10-14，589 行 / 54,969 字节（仓库外本地 PRD 文件，不入库） |
| 代码版本 | v0.4.2（`package.json:4`、`src/features/settings/SettingsPage.tsx:269`；修复在工作区，tag 未打；文档基线 HEAD `7339ee2`） |
| 审计快照 | commit `7339ee2`（v0.4.1 文档 HEAD）。2026-10-27 外部审计按 v1.1 验收原文复跑，重判 FR01/AC01/AC05/§7.1/FR12 五行，报告见 `audit/2026-10-27/PRD-AUDIT-2026-10-27.md` |
| 生成日期 | 2026-10-20（v0.4.0 基线）；2026-10-26 按 v0.4.1 增量更新；2026-10-28 按外部审计修订 |
| 判定方法 | 「已实现」= 当前代码中存在可指认的实现路径（文件:行），且至少一条可执行或可查看的验证（vitest 用例 / `screenshots/` 截图 / 真机日志）；只有界面占位、只有数据结构、或依赖未实现前置的，一律不计为已实现。 |
| 证据口径 | 路径相对仓库根；本次修订行按 commit `7339ee2` 核对，未改动行沿用 v0.4.0（`23ac30f`）行号。修复后已复跑 `pnpm test`（45 通过，含审计回归、代码块守卫与多笔记交叉失败用例）、`pnpm build`、`cargo test clipper::tests`（5 通过）；审计复现脚本保留在 `audit/2026-10-27/`，不进入常规测试。2026-10-28 另做本机复核：浏览器冒烟 9 步与真机（只读目录、关窗失败）证据在 `screenshots/audit-2026-10-28/`、`audit/2026-10-28/`。 |

状态取值：`已实现` / `部分实现` / `未实现` / `已废止`（被 v0.4.0 方向取代）/ `未核`（证据不足，不猜）；决策项另用 `已收敛`（已由实现确定，不再待决）。

## 状态总表

### A. 功能需求（FR01–FR13）

| PRD 编号 | 需求摘要 | 状态 | 证据 | 缺口 / 备注 |
| --- | --- | --- | --- | --- |
| FR01 | 本地知识库与持久化 | 部分实现 | `src/core/vault/scan.ts:147` 扫描建索引；`src/core/vault/write.ts:32` 临时文件+rename 原子写；`src/features/notes/store.ts:177` 启动恢复；`src-tauri/src/lib.rs:62` 选库并授权；`src/core/vault/write.test.ts:83`；v0.4.2 修复「保存失败后 rescan 丢草稿」：`src/features/notes/store.ts:108-116` 失败不清空、`flush` 按失败笔记集合逐篇重试（`:427-445`），回归用例 `src/features/notes/store.failedSave.test.ts:78`、`:107`（另一篇保存成功也不会误报全部落盘）；真机复核 `screenshots/audit-2026-10-28/11-tauri-rescan-blocked.png`、`12-tauri-draft-kept.png` | 无文件监听，外部改动不实时同步（`README.md:55`）；审计基线在 `7339ee2` 复现过失败后 rescan 丢草稿，修复已在单测与真机只读目录（2026-10-28）验证；真实磁盘重启恢复仍未实测 |
| FR02 | Markdown 创建编辑与阅读（表格/公式/高亮） | 部分实现 | `src/features/editor/MarkdownView.tsx:208-217` 启用 remark-gfm + remark-math + rehype-katex；`src/features/editor/MarkdownView.tsx:195-201` 表格容器；`src/features/notes/NotePane.tsx:234-287` 编辑态；`screenshots/m2/03-editing.png` | 代码语法高亮缺失：`src/features/editor/MarkdownView.tsx:82-98` 仅渲染 `<pre>` 与语言标签，`package.json:15-36` 无高亮依赖；无重命名入口；Mermaid 无实现（P0 条件项） |
| FR03 | Markdown 导入与文本粘贴 | 未实现 | 全仓无导入入口：`src/features/notes/store.ts:87-88` 只有 `createNote`/`createGeneratedNote`；`src-tauri/src/lib.rs` 无导入命令 | 无多文件导入、无粘贴转换、无同名/附件冲突反馈 |
| FR04 | 统一知识对象与两种视图 | 未实现 | `src/core/notes/types.ts:1-12` Note 只有 id/title/content/tags/filePath/时间戳，无 kind/view；`src/app/uiStore.ts:5` 仅有 read/edit 双态 | 方向偏离：v0.3.0 把「视图」收敛为阅读/编辑双态，未保留便签/页面的对象级视图 |
| FR05 | Wiki 链接与反向引用 | 部分实现 | `src/core/links/wikiLinks.ts:15` 提取 `[[标题]]`、`src/core/links/wikiLinks.ts:78` 预处理为链接；`src/features/editor/MarkdownView.tsx:116-151` 可点击与缺失态；`src/core/links/backlinks.ts:54` 反链；`screenshots/v021/08-tauri-context-backlink.png` | 链接按标题解析（`src/core/links/backlinks.ts:65`、`src/app/actions.ts:22-31`），frontmatter 的 id 不参与寻址；改名即断链；同名时静默取首个；wikiLinks/backlinks 无测试用例（建链已有 `linkNote.test.ts`） |
| FR06 | 选词创建/复用并原位建链（核心 C08） | 部分实现 | 入口 `src/features/editor/CodeEditor.tsx:119`、`src/features/notes/NotePane.tsx:223`；生成 `src/features/ai/CreateLinkNoteDialog.tsx:283`，落盘与回写 `src/features/ai/CreateLinkNoteDialog.tsx:356`；事务替换 `src/features/editor/editorBridge.ts:59`；标题校验/同源判断 `src/core/links/linkNote.ts:27`、`:62`；`src/core/links/linkNote.test.ts:27-77` 7 个用例；`screenshots/m35/18-exact-recursion-preview.png`、`screenshots/m35/19-exact-recursion-backlink.png` | 已支持「新建或同名复用 + 原位 `[[标题]]` + 反链」；仍未实现「仅保存 / 改链接目标 / 取消链接」三选一，任意已有对象选择器缺失，AC06 仍不完整 |
| FR07 | AI 解释与保存（双入口、提示词模式） | 部分实现 | 全篇生成 `src/features/ai/GenerateNoteDialog.tsx:235`；内联动作 `src/features/ai/InlineActionDialog.tsx:214`；provider 抽象 `src/core/ai/providers.ts:34-119`；`screenshots/m3/09-generate-preview.png`、`screenshots/m3/20-inline-inserted.png` | 只有 CLI/Ollama（`src/core/ai/providers.ts:34-119`），无 PRD 要求的「普通模式：应用内配置 API」；无「选词解释→追问→保存为知识对象」；无多轮对话（`README.md:87`）；建链复用只按同名标题匹配，无任意对象选择 |
| FR08 | 来源保存与上下文回溯 | 未实现 | `src/core/notes/types.ts:1-12` 无 source 字段；`src/core/vault/scan.ts:29` 托管键仅 id/title/created/updated/tags；无来源面板 | 无 SourceRecord、无摘录/URL/作者/采集时间，无法回溯学习来源 |
| FR09 | 搜索与已有知识选择 | 部分实现 | `src/core/search/searchNotes.ts:4` 标题/标签/正文打分；`src/features/notes/NoteList.tsx:159-165` 搜索框；`src/app/CommandPalette.tsx:72-77` 复用同一搜索 | 无别名（`src/core/notes/types.ts` 无 aliases），别名检索无法通过；建链复用只按同名标题匹配，未接入搜索选择器 |
| FR10 | 导出备份与索引恢复 | 部分实现 | 「重新扫描」重建索引 `src/features/settings/SettingsPage.tsx:101`、`src/features/notes/store.ts:230`；原件始终是磁盘 Markdown（`src/core/vault/write.ts:32`） | 无导出、无完整备份包、无恢复；重新扫描只是内存索引重建，无进度与关系数校验 |
| FR11 | 网页内容采集最小版本 | 部分实现 | `src-tauri/src/clipper.rs:55` `clip_fetch`、`:370` 编码解码；`src/features/clipper/ClipDialog.tsx:231` 抓取、`:276` 保存、`:499` HTTP 提示；`src/features/clipper/extract.ts:171` 正文抽取；`cargo test clipper::tests` 5 个用例通过；`screenshots/m4/01-preview-english.png`、`screenshots/m4/03-preview-gbk.png`、`screenshots/m4/05-preview-images.png` | URL 抓取、预览、图片绝对链接、GBK、错误态已可用；粘贴富文本转换、D08 选择记录、模板编辑器仍未做 |
| FR12 | 关系发现与平台扩展（P1–P2） | 未实现 | 子项拆分：**未链接提及已实现**——`src/core/links/backlinks.ts:56-99` 计算 `mentions`、`src/features/links/BacklinkDrawer.tsx:106` 有「提及」页签；对象合并、关系图、别名与平台扩展无代码（`package.json:15-36` 无图/布局依赖） | 整体仍未启动：可用部分只有提及列表，合并/图谱/扩展都未做；状态按整体记「未实现」，不再写成「全仓无关系发现代码」 |
| FR13 | AI 内容来源区分与可信度 | 未实现 | `src/core/notes/types.ts:1-12` 无来源性质字段；`src/features/editor/MarkdownView.tsx` 无来源标注渲染；AI 提示词无来源分层（`src/core/ai/prompt.ts`） | 原文摘录/AI 解释/用户理解在保存后不可区分，验收条件无法满足 |

### B. 核心验收清单（AC01–AC14）

| PRD 编号 | 需求摘要 | 状态 | 证据 | 缺口 / 备注 |
| --- | --- | --- | --- | --- |
| AC01 | 选词手动保存并原位建链 | 部分实现 | AI 生成确认后落盘并回写：`src/features/ai/CreateLinkNoteDialog.tsx:356`；事务替换选区 `src/features/editor/editorBridge.ts:59`；v0.4.1 断链卡片可建空白笔记（`src/features/links/LinkPreview.tsx:340-358`） | 审计：PRD `docs/prd/PRD-v1.1-archive.md:542` 要求「手动保存知识」，现只有 AI 生成后才能保存（`CreateLinkNoteDialog.tsx:296-339`），无手动填写知识正文的流程；文件导入未实现；写 `[[链接]]`、同名复用、建空白笔记都不等于这条验收 |
| AC02 | AI 解释后编辑并保存 | 未实现 | `src/features/ai/InlineActionDialog.tsx:214` 只回写选区文本，不产生知识对象；`src/features/ai/GenerateNoteDialog.tsx:235` 是整篇生成，不基于选区解释 | 无「AI 会话→确认→保存对象→建链」链路 |
| AC03 | 断网/不配 AI 仍可手动建链 | 部分实现 | 离线创建/阅读/搜索可用（`src/features/notes/store.ts:250`、`src/features/notes/NoteList.tsx:159`）；手写 `[[标题]]` 可渲染（`src/features/editor/MarkdownView.tsx:116`）；v0.4.1 断链卡片「创建空白笔记」不依赖 AI（`src/features/links/LinkPreview.tsx:340-358`，真机验收：无 CLI 时只出现该按钮并成功落盘） | 「选词→建链」仍依赖 AI；断网仍只能手写 `[[标题]]`，无断网实测 |
| AC04 | 同一对象切换便签/页面 | 未实现 | 同 FR04：`src/core/notes/types.ts` 无 view，无切换入口 | ID/正文/关系不变无法验证 |
| AC05 | 三处同名只改选中一处 | 部分实现 | 编辑态纯文本三同名用例通过：`src/features/editor/selectionMapping.test.ts:29`；替换仍只改快照选区（`src/features/editor/editorBridge.ts:59-84`）；v0.4.2 定位：`locateTextInActiveEditor`（`editorBridge.ts:148`）只数阅读态可见出现（`:236` 排除 frontmatter/链接地址/图片/引用定义/注释，且代码块内的链接语法按可见计，`:199`）；回归用例 `selectionMapping.test.ts:62`（隐藏 URL）、`:91`（行内代码）、`:112`（围栏代码）、`:130`（跨行）；不可靠时拒绝并提示回编辑态 | 审计基线在 `7339ee2` 复现过「URL 里含同名词 → 改到另一处」，已修；兜底策略是不猜：代码块/行内代码、跨行选区、找不到原文都直接拒绝并提示回编辑态；仍未做真正的渲染节点到源码位置映射，跨 Markdown 标记的选区会被拒绝而不是定位 |
| AC06 | 复用已有对象并新增引用 | 部分实现 | `src/features/ai/CreateLinkNoteDialog.tsx:257` 复用已有、`:584` 按钮、`:606` 新建序号；`src/core/links/linkNote.ts:62` 同源判断；`src/core/links/linkNote.test.ts:50-61`；`screenshots/m35/06-existing-reuse.png` | 只能按同名标题复用，没有任意对象搜索/选择器；`source_note` 只写入新建笔记，复用不更新旧笔记 |
| AC07 | 重命名或同名对象的链接身份 | 未实现 | `src/core/links/backlinks.ts:65` 按标题比对；`src/app/actions.ts:25-27` 取首个同名；`src/features/notes/content/structure.md:15` 自述「标题即标识…重命名要全库更新」，无改名迁移代码 | 与 PRD 7.3 稳定身份直接冲突 |
| AC08 | 从反向引用回到来源位置 | 部分实现 | `src/features/links/BacklinkDrawer.tsx:53` 打开来源笔记阅读态；`src/features/links/BacklinkDrawer.tsx:66-68` 展示摘要 | 不滚动定位到引用处；无「定位失效」状态，只有摘要 |
| AC09 | 保存中断/无权限/外部修改 | 部分实现 | 原子写 `src/core/vault/write.ts:32-63`；错误态 `src/features/notes/store.ts`；关窗 flush `src/app/App.tsx`；v0.4.2 故障注入回归 `src/features/notes/store.failedSave.test.ts:78`、`:107`（多笔记交叉失败）；关窗失败走应用内确认 `src/app/CloseConfirmDialog.tsx`，真机 `screenshots/audit-2026-10-28/13-tauri-close-confirm.png` | 无外部修改检测与冲突合并（`README.md:55`、`README.md:87`）；写入失败、多笔记交叉失败与关窗已实测，外部改动与故障恢复策略仍未覆盖 |
| AC10 | 完整备份恢复并重建索引 | 未实现 | 同 FR10；`src-tauri/src/lib.rs:168-178` 无备份/导出命令 | 仅能手动拷文件夹；无恢复流程与校验 |
| AC11 | 危险 HTML 与代码块安全 | 部分实现 | `src/features/editor/MarkdownView.tsx:208-214` 未启用 rehype-raw，原始 HTML 不作为 HTML 渲染；`src/core/links/wikiLinks.ts:20-31` 跳过围栏代码与行内代码 | 无导入，也无危险 HTML/代码块回归用例，仅代码推断 |
| AC12 | 删除目标或解除链接 | 部分实现 | 缺链显示 `is-missing`（`src/features/editor/MarkdownView.tsx:121-127`）、反链摘要保留；v0.4.1 断链卡片可直接创建目标笔记（`src/features/links/LinkPreview.tsx:340-358`） | 断链可一键补建恢复，但仍无删除目标、无解除链接操作，无受影响引用提示 |
| AC13 | 首次使用完整学习流程 | 部分实现 | 首启选库（`src/features/notes/Onboarding.tsx:105-126`）；选词建链主路径 `src/features/ai/CreateLinkNoteDialog.tsx:283`、`:356`；`screenshots/m35/18-exact-recursion-preview.png`、`screenshots/m35/19-exact-recursion-backlink.png` | 「选库→阅读→选词→生成→保存→反链」已可走通；仍缺「仅保存/改目标/取消链接」控制，C11/AC14 未闭环 |
| AC14 | 选词后「仅保存」不改原文 | 未实现 | `src/features/ai/CreateLinkNoteDialog.tsx:356` 确认后固定插入 `[[标题]]`；无仅保存入口 | 状态未变：当前只有「保存并建链」，没有「仅保存」分支，也没有「链接未完成」语义 |

### C. 已确认基线（C）

| PRD 编号 | 需求摘要 | 状态 | 证据 | 缺口 / 备注 |
| --- | --- | --- | --- | --- |
| C10 | 独立桌面应用，不依赖 Obsidian | 已实现 | `src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`（Tauri 2 独立壳）；`screenshots/m2/07-tauri-real-fs.png`；无 Obsidian 运行时依赖 | 仅复用 Second Brain Builder 提示词数据（`docs/README.md:5-10`，MIT） |
| C11 | 用户控制权：仅保存/改目标/取消 | 未实现 | `src/features/ai/CreateLinkNoteDialog.tsx:356` 确认后固定插入 `[[标题]]`；无仅保存/改目标/取消入口 | 保存并建链已存在，但 PRD 要求的三选一控制权仍未实现 |

### D. 数据、非功能与架构（章节号）

| PRD 编号 | 需求摘要 | 状态 | 证据 | 缺口 / 备注 |
| --- | --- | --- | --- | --- |
| §4.2 | 对象与字段模型 | 部分实现 | `src/core/notes/types.ts:1-12` 有稳定 id、title、body、时间戳；`src/core/vault/scan.ts:74-98` 补写/去重 id | 无 kind/view/aliases；无 LinkOccurrence、SourceRecord；链接位置未建模 |
| §7.1 | 保存并建链一致性 | 部分实现 | 已有「知识已保存、链接未完成」分叉：`src/features/ai/CreateLinkNoteDialog.tsx:445` 进入 `created-no-link`、`:927` 渲染提示；来源笔记回写在 `:449` | 审计：`:449` 是 `void saveNote(...)`，不等待来源笔记落盘就关闭对话框并报成功，来源文件写入失败时没有一致性状态；仍无失败重试与索引协同 |
| §7.3 | 稳定身份与 Markdown 一致性 | 部分实现 | frontmatter id 存在（`src/core/vault/scan.ts:74-98`），导出/重扫可保留 | 链接用标题寻址（`src/core/links/backlinks.ts:65`、`src/app/actions.ts:25-27`），id 未参与，改名/同名不满足 |
| §8.1 | 离线可用与可靠性 | 未核 | 核心链路无网络调用；AI 为显式可选（`src/core/ai/providers.ts:34-119`） | 需一次断网冒烟（创建/编辑/搜索/重启）才能判「已实现」 |
| §8.3 | 性能与易用性指标 | 未核 | `package.json:7-14` 无压测脚本，仓库无基准日志 | 需 1,000 篇/100 MB/10,000 链接的实测数据 |
| §8.5 | 首次使用成本 | 部分实现 | 首启 1 步选库（`src/features/notes/Onboarding.tsx:105-126`），0 必填配置；默认标题「未命名笔记」（`src/core/vault/write.ts:79-105`）；选词建链主路径见 `src/features/ai/CreateLinkNoteDialog.tsx:283` | 路径已可走通，但「阅读到建链 ≤5 步」未实测；默认知识库位置未提供建议 |
| §9.1 | AI Provider 适配层 | 部分实现 | `src/core/ai/providers.ts:34-119` 统一 provider 定义与参数模板；`src-tauri/src/ai.rs` 执行与取消 | 仅 CLI/Ollama，无 API 服务商；无用量/错误持久记录；无普通/高级双入口抽象 |
| §9.3 | 阅读选区与 Markdown 源码映射 | 已废止 | 改为源码态取选区（`src/features/editor/editorBridge.ts:18-29`）；v0.4.0 阅读态建链通过文本 + 出现序号切回编辑态选词（`src/features/notes/NotePane.tsx:223`、`src/features/editor/editorBridge.ts:145`） | 仍是近似文本定位，不是完整 Markdown 位置映射；重复文本有歧义。是否接受该方案需产品确认，行状态保留本清单判断 |

## D02 决策项核对（v0.4.1）

D02 是 PRD 第 11 章的待确认决策，不计入上方需求统计，落点见文末「汇总统计（第 11 章决策项 D01–D12）」；本表只记它的收敛情况。

| 决策项 | 决策摘要 | 状态 | 证据 | 备注 |
| --- | --- | --- | --- | --- |
| D02 | 点击内部链接的默认打开方式（是否先预览再打开） | 已收敛 | 阅读态悬停 350ms 出预览卡片（`src/features/links/LinkPreview.tsx:38`、`src/features/editor/MarkdownView.tsx:135-139`）；反链抽屉行同样支持（`src/features/links/BacklinkDrawer.tsx:62-67`）；卡片含标题、标签、更新时间、去 Markdown 后的 200 字摘要与「打开」（`LinkPreview.tsx:291-292`、`:429`、`:443`；摘要实现 `src/core/text/plainText.ts:20`）；断链卡片显示「尚未创建」，默认「创建空白笔记」，仅检测到 AI 可用时才并列「用 AI 生成」（`LinkPreview.tsx:157-174`、`:340-373`）；焦点移出卡片自动关闭（`LinkPreview.tsx:305-309`）；v0.4.1 真机验收通过 | 收敛为「悬停预览、点击直接打开」：预览是辅助，不改变点击的默认行为；编辑态 CodeMirror 内的链接未加预览（已知边界）；「锚点被卡片覆盖时闪烁」未修，已登记 |

## 汇总统计（需求条目）

| 状态 | 条数 |
| --- | --- |
| 已实现 | 1 |
| 部分实现 | 22 |
| 未实现 | 11 |
| 未核 | 2 |
| 已废止 | 1 |
| 合计 | 37 |

| 模块 | 条数 | 已实现 | 部分实现 | 未实现 | 未核 | 已废止 |
| --- | --- | --- | --- | --- | --- | --- |
| 本地存储与持久化（FR01、§8.1） | 2 | 0 | 1 | 0 | 1 | 0 |
| Markdown 阅读编辑（FR02） | 1 | 0 | 1 | 0 | 0 | 0 |
| 导入与采集（FR03、FR11） | 2 | 0 | 1 | 1 | 0 | 0 |
| 对象模型与视图（FR04、AC04、§4.2） | 3 | 0 | 1 | 2 | 0 | 0 |
| 来源记录（FR08） | 1 | 0 | 0 | 1 | 0 | 0 |
| 链接与建链（FR05、FR06、AC01、AC05–AC08、AC12、AC14、§7.1、§7.3） | 11 | 0 | 9 | 2 | 0 | 0 |
| AI（FR07、FR13、AC02、§9.1） | 4 | 0 | 2 | 2 | 0 | 0 |
| 搜索（FR09、AC03） | 2 | 0 | 2 | 0 | 0 | 0 |
| 备份与导出（FR10、AC10） | 2 | 0 | 1 | 1 | 0 | 0 |
| 关系发现与扩展（FR12） | 1 | 0 | 0 | 1 | 0 | 0 |
| 异常与安全（AC09、AC11） | 2 | 0 | 2 | 0 | 0 | 0 |
| 首次使用（AC13、§8.5） | 2 | 0 | 2 | 0 | 0 | 0 |
| 架构与风险（C10、C11、§8.3、§9.3） | 4 | 1 | 0 | 1 | 1 | 1 |

## 汇总统计（第 11 章决策项 D01–D12）

| 状态 | 条数 |
| --- | --- |
| 已收敛 | 1 |
| 未核对 | 11 |
| 合计 | 12 |

已收敛：D02（v0.4.1，悬停预览 + 点击直接打开，明细见上方 D02 表）。其余 D01、D03–D12 共 11 项本清单尚未逐条核对，统一记「未核对」，不替未审项编状态；v2.0 提案里 D01/D06/D08 虽已标「删除（已收敛）」，仍需按代码逐条核过再改这里的计数。

## 审计建议关注点

**证据薄弱 / 需复跑**

1. 测试覆盖仍有空档：建链有 `src/core/links/linkNote.test.ts` 与 `src/features/editor/selectionMapping.test.ts`，search/markdown 仍无用例。v0.4.2 修复后已复跑 `pnpm test`（41 通过，新增 `store.failedSave.test.ts` 与隐藏 URL 回归用例）、`pnpm build`；Rust 侧 `cargo test clipper::tests`（5 通过）是 v0.4.0 记录，本机无 cargo 未复跑。
2. FR01 的「路径不可写保留未保存内容」在 v0.4.2 前只有代码路径（`src/features/notes/store.ts`），审计在 `7339ee2` 复现了失败后 rescan 丢草稿；修复后由 `store.failedSave.test.ts` 用注入失败覆盖，但没有真实不可写目录的桌面实测。FR02 的表格/公式没有截图或用例，只能靠 `src/features/editor/MarkdownView.tsx:208-217` 推断。
3. AC11 的「不执行脚本」来自未启用 rehype-raw 的代码事实，未做危险 HTML 实投；AC09 的外部修改冲突在 `README.md:87` 明确未做。

**与 PRD 明显偏离（重点抽查）**

4. 链接身份：PRD 7.3 要求稳定 ID，现实现按标题字符串匹配（`src/core/links/backlinks.ts:65`、`src/app/actions.ts:25-27`），重命名即断链，同名静默取首个；`src/features/notes/content/structure.md:15` 还把「标题即标识」写成知识库约定。这是方向性冲突，不只是未完成。
5. AI 接入：PRD FR07 要求「普通模式（应用内 API）+ 高级模式（CLI）」且不强制装 CLI；v0.4.0 只有 Claude Code/Codex/Gemini/自定义 CLI/Ollama（`src/core/ai/providers.ts:34-119`），与「不强制命令行」相反。
6. 数据模型：Note 无 kind/view/source（`src/core/notes/types.ts:1-12`），FR04/FR08/FR13 不是缺界面，而是模型层没有承载字段，AC04 永远无法通过。
7. 建链已从「缺失」变为可用核心流程：选词 → 右键 → 生成/同名复用 → 预览 → 保存 → `[[标题]]` → 反链，验收见 `src/core/links/linkNote.test.ts` 与 `screenshots/m35/18-exact-recursion-preview.png`、`screenshots/m35/19-exact-recursion-backlink.png`。但 FR06 仍是「部分实现」：没有「仅保存 / 改链接目标 / 取消链接」三选一，任意已有对象选择器也未做，AC06/AC14 因此不能升为已实现。

**判定口径需外审确认**

8. §9.3 标「已废止」是本清单的判断：v0.4.0 阅读态已经可以发起建链，但用的是「文本 + 出现序号」找回源码选区，不是 PRD 要求的完整 Markdown 位置映射；重复文本仍有歧义。是否接受这个近似方案、以及该项是否改判「部分实现」，需产品/外审确认。
9. 本清单已按外部审计（`audit/2026-10-27/PRD-AUDIT-2026-10-27.md`，基线 `7339ee2`）修订：FR01、AC01、AC05 降为「部分实现」，§7.1 改为「部分实现」，FR12 拆出已实现的「提及」子项但整体仍记「未实现」；汇总按 1/22/11/2/1 重算。D02 仍为决策项、单列，不混入这 37 条；v0.4.1 已把 D02 收敛为「悬停预览 + 点击直接打开」。两个 P1 的代码修复随 v0.4.2：单测、浏览器冒烟 9 步、真机只读目录与关窗确认均已复核（`screenshots/audit-2026-10-28/`、`audit/2026-10-28/`）；真实磁盘重启恢复、断网、AI 生成与剪藏仍未实测。
10. FR03 的富文本粘贴与导入仍未实现，网页 URL 采集不等同于完整导入；本次审计未重验全部 37 项的端到端流程。
