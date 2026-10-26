# PRD 对照状态清单：PRD v1.1 → Wikloom v0.4.1

更新：v0.4.1（3065a59）

| 项 | 值 |
| --- | --- |
| 对照 PRD | 《个人知识 Wiki 产品需求文档》v1.1，2026-10-14，589 行 / 54,969 字节（仓库外本地 PRD 文件，不入库） |
| 代码版本 | v0.4.1（`package.json:4`、`src/features/settings/SettingsPage.tsx:261`；git tag `v0.4.1`，HEAD `3065a59`） |
| 审计快照 | commit `3065a59`（tag `v0.4.1`）。本清单在 v0.4.1 发布后补 D02 与断链创建的核对行，其余判定沿用 v0.4.0（`23ac30f`）审计 |
| 生成日期 | 2026-10-20（v0.4.0 基线）；2026-10-26 按 v0.4.1 增量更新 |
| 判定方法 | 「已实现」= 当前代码中存在可指认的实现路径（文件:行），且至少一条可执行或可查看的验证（vitest 用例 / `screenshots/` 截图 / 真机日志）；只有界面占位、只有数据结构、或依赖未实现前置的，一律不计为已实现。 |
| 证据口径 | 路径相对仓库根；本次更新行按 commit `3065a59` 核对，未改动行沿用 v0.4.0（`23ac30f`）行号。v0.4.1 已复跑 `pnpm test`（39 通过）、`pnpm exec tsc --noEmit`、`pnpm build`。 |

状态取值：`已实现` / `部分实现` / `未实现` / `已废止`（被 v0.4.0 方向取代）/ `未核`（证据不足，不猜）；决策项另用 `已收敛`（已由实现确定，不再待决）。

## 状态总表

### A. 功能需求（FR01–FR13）

| PRD 编号 | 需求摘要 | 状态 | 证据 | 缺口 / 备注 |
| --- | --- | --- | --- | --- |
| FR01 | 本地知识库与持久化 | 已实现 | `src/core/vault/scan.ts:147` 扫描建索引；`src/core/vault/write.ts:32` 临时文件+rename 原子写；`src/features/notes/store.ts:177` 启动恢复；`src-tauri/src/lib.rs:62` 选库并授权；`src/core/vault/write.test.ts:83`「writes managed frontmatter and preserves generated extra fields」；`screenshots/m2/09-tauri-reopen.png` | 无文件监听，外部改动不实时同步（`README.md:55`）；路径不可写时保留草稿只有代码路径（`src/features/notes/store.ts:379-389`），无实测 |
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
| FR12 | 关系发现与平台扩展（P1–P2） | 未实现 | 全仓无未链接提及建议、对象合并、关系图代码；`package.json:15-36` 无图/布局依赖 | P1 范围，本版未启动 |
| FR13 | AI 内容来源区分与可信度 | 未实现 | `src/core/notes/types.ts:1-12` 无来源性质字段；`src/features/editor/MarkdownView.tsx` 无来源标注渲染；AI 提示词无来源分层（`src/core/ai/prompt.ts`） | 原文摘录/AI 解释/用户理解在保存后不可区分，验收条件无法满足 |

### B. 核心验收清单（AC01–AC14）

| PRD 编号 | 需求摘要 | 状态 | 证据 | 缺口 / 备注 |
| --- | --- | --- | --- | --- |
| AC01 | 选词手动保存并原位建链 | 已实现 | `src/features/ai/CreateLinkNoteDialog.tsx:356` 确认后 `createNoteFromContent` 落盘并回写；`src/features/editor/editorBridge.ts:59` 事务替换选区；`screenshots/m35/18-exact-recursion-preview.png`、`screenshots/m35/19-exact-recursion-backlink.png` | 通过 AI 生成确认后保存，不是空白笔记变体；重启保持复用 M2 的文件持久化 |
| AC02 | AI 解释后编辑并保存 | 未实现 | `src/features/ai/InlineActionDialog.tsx:214` 只回写选区文本，不产生知识对象；`src/features/ai/GenerateNoteDialog.tsx:235` 是整篇生成，不基于选区解释 | 无「AI 会话→确认→保存对象→建链」链路 |
| AC03 | 断网/不配 AI 仍可手动建链 | 部分实现 | 离线创建/阅读/搜索可用（`src/features/notes/store.ts:250`、`src/features/notes/NoteList.tsx:159`）；手写 `[[标题]]` 可渲染（`src/features/editor/MarkdownView.tsx:116`）；v0.4.1 断链卡片「创建空白笔记」不依赖 AI（`src/features/links/LinkPreview.tsx:340-358`，真机验收：无 CLI 时只出现该按钮并成功落盘） | 「选词→建链」仍依赖 AI；断网仍只能手写 `[[标题]]`，无断网实测 |
| AC04 | 同一对象切换便签/页面 | 未实现 | 同 FR04：`src/core/notes/types.ts` 无 view，无切换入口 | ID/正文/关系不变无法验证 |
| AC05 | 三处同名只改选中一处 | 已实现 | `src/features/editor/editorBridge.ts:59-84` 只替换快照 `from/to` 选区；`src/features/editor/selectionMapping.test.ts:28`「selects the second of three identical occurrences and replaces only that one」（三处同名、选第二处、断言只改第二处并校验文档）；`src/core/links/linkNote.test.ts:37-49` 覆盖已链接/链接内选区；`screenshots/m35/14-link-before-undo.png`、`screenshots/m35/15-link-undo.png` | 三处同名专项用例已通过；替换后只产生一个 `[[递归]]`，另外两处保持原文 |
| AC06 | 复用已有对象并新增引用 | 部分实现 | `src/features/ai/CreateLinkNoteDialog.tsx:257` 复用已有、`:584` 按钮、`:606` 新建序号；`src/core/links/linkNote.ts:62` 同源判断；`src/core/links/linkNote.test.ts:50-61`；`screenshots/m35/06-existing-reuse.png` | 只能按同名标题复用，没有任意对象搜索/选择器；`source_note` 只写入新建笔记，复用不更新旧笔记 |
| AC07 | 重命名或同名对象的链接身份 | 未实现 | `src/core/links/backlinks.ts:65` 按标题比对；`src/app/actions.ts:25-27` 取首个同名；`src/features/notes/content/structure.md:15` 自述「标题即标识…重命名要全库更新」，无改名迁移代码 | 与 PRD 7.3 稳定身份直接冲突 |
| AC08 | 从反向引用回到来源位置 | 部分实现 | `src/features/links/BacklinkDrawer.tsx:53` 打开来源笔记阅读态；`src/features/links/BacklinkDrawer.tsx:66-68` 展示摘要 | 不滚动定位到引用处；无「定位失效」状态，只有摘要 |
| AC09 | 保存中断/无权限/外部修改 | 部分实现 | 原子写 `src/core/vault/write.ts:32-63`；错误态 `src/features/notes/store.ts:379-389`；关窗 flush `src/app/App.tsx:80-92` | 无外部修改检测与冲突合并（`README.md:55`、`README.md:87`）；无故障注入测试 |
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
| §7.1 | 保存并建链一致性 | 未实现 | 现有保存只写单文件（`src/core/vault/write.ts:32-63`），无目标+来源+索引的协同与重试状态；建链已能保存并回写 `[[标题]]`（`src/features/ai/CreateLinkNoteDialog.tsx:356`） | 仍无「知识已保存，链接未完成」状态、失败重试与索引协同 |
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
| 已实现 | 4 |
| 部分实现 | 18 |
| 未实现 | 12 |
| 未核 | 2 |
| 已废止 | 1 |
| 合计 | 37 |

| 模块 | 条数 | 已实现 | 部分实现 | 未实现 | 未核 | 已废止 |
| --- | --- | --- | --- | --- | --- | --- |
| 本地存储与持久化（FR01、§8.1） | 2 | 1 | 0 | 0 | 1 | 0 |
| Markdown 阅读编辑（FR02） | 1 | 0 | 1 | 0 | 0 | 0 |
| 导入与采集（FR03、FR11） | 2 | 0 | 1 | 1 | 0 | 0 |
| 对象模型与视图（FR04、AC04、§4.2） | 3 | 0 | 1 | 2 | 0 | 0 |
| 来源记录（FR08） | 1 | 0 | 0 | 1 | 0 | 0 |
| 链接与建链（FR05、FR06、AC01、AC05–AC08、AC12、AC14、§7.1、§7.3） | 11 | 2 | 6 | 3 | 0 | 0 |
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

1. 测试覆盖仍有空档：建链有 `src/core/links/linkNote.test.ts` 与 `src/features/editor/selectionMapping.test.ts`，search/markdown 仍无用例。v0.4.0 已复跑 `pnpm test`（38 通过）、`pnpm build`、`cargo test clipper::tests`（5 通过）。
2. FR01 的「路径不可写保留未保存内容」只有代码路径（`src/features/notes/store.ts:379-389`），没有实测；FR02 的表格/公式没有截图或用例，只能靠 `src/features/editor/MarkdownView.tsx:208-217` 推断。
3. AC11 的「不执行脚本」来自未启用 rehype-raw 的代码事实，未做危险 HTML 实投；AC09 的外部修改冲突在 `README.md:87` 明确未做。

**与 PRD 明显偏离（重点抽查）**

4. 链接身份：PRD 7.3 要求稳定 ID，现实现按标题字符串匹配（`src/core/links/backlinks.ts:65`、`src/app/actions.ts:25-27`），重命名即断链，同名静默取首个；`src/features/notes/content/structure.md:15` 还把「标题即标识」写成知识库约定。这是方向性冲突，不只是未完成。
5. AI 接入：PRD FR07 要求「普通模式（应用内 API）+ 高级模式（CLI）」且不强制装 CLI；v0.4.0 只有 Claude Code/Codex/Gemini/自定义 CLI/Ollama（`src/core/ai/providers.ts:34-119`），与「不强制命令行」相反。
6. 数据模型：Note 无 kind/view/source（`src/core/notes/types.ts:1-12`），FR04/FR08/FR13 不是缺界面，而是模型层没有承载字段，AC04 永远无法通过。
7. 建链已从「缺失」变为可用核心流程：选词 → 右键 → 生成/同名复用 → 预览 → 保存 → `[[标题]]` → 反链，验收见 `src/core/links/linkNote.test.ts` 与 `screenshots/m35/18-exact-recursion-preview.png`、`screenshots/m35/19-exact-recursion-backlink.png`。但 FR06 仍是「部分实现」：没有「仅保存 / 改链接目标 / 取消链接」三选一，任意已有对象选择器也未做，AC06/AC14 因此不能升为已实现。

**判定口径需外审确认**

8. §9.3 标「已废止」是本清单的判断：v0.4.0 阅读态已经可以发起建链，但用的是「文本 + 出现序号」找回源码选区，不是 PRD 要求的完整 Markdown 位置映射；重复文本仍有歧义。是否接受这个近似方案、以及该项是否改判「部分实现」，需产品/外审确认。
9. 本清单已按 tag `v0.4.1` / commit `3065a59` 更新；v0.4.1 把 D02 收敛为「悬停预览 + 点击直接打开」，旧版关于剪藏未提交的观察已并入 FR11。FR03 的富文本粘贴与导入仍未实现，网页 URL 采集不等同于完整导入。
