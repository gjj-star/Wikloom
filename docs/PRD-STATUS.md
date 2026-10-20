# PRD 对照状态清单：PRD v1.1 → Wikloom v0.3.0

| 项 | 值 |
| --- | --- |
| 对照 PRD | 《个人知识 Wiki 产品需求文档》v1.1，2026-10-14，589 行 / 54,969 字节（仓库外本地 PRD 文件，不入库） |
| 代码版本 | v0.3.0（`package.json:4`、`src/features/settings/SettingsPage.tsx:261`；git tag `v0.3.0`，HEAD `2e1761a`） |
| 审计快照 | commit `2e1761a`（tag `v0.3.0`）。审计开始时工作区干净；16:48–16:50 检测到未提交的并发改动（`src-tauri/src/clipper.rs`、`defuddle`/`linkedom`、`createNoteFromContent`），未纳入本清单，见文末第 9 条 |
| 生成日期 | 2026-10-20 |
| 判定方法 | 「已实现」= 当前代码中存在可指认的实现路径（文件:行），且至少一条可执行或可查看的验证（vitest 用例 / `screenshots/` 截图 / 真机日志）；只有界面占位、只有数据结构、或依赖未实现前置的，一律不计为已实现。 |
| 证据口径 | 路径相对仓库根；行号按 commit `2e1761a` 的文件内容核对。测试只核对了文件与用例名，未复跑（原因见「审计关注」第 1 条）。 |

状态取值：`已实现` / `部分实现` / `未实现` / `已废止`（被 v0.3.0 方向取代）/ `未核`（证据不足，不猜）。

## 状态总表

### A. 功能需求（FR01–FR13）

| PRD 编号 | 需求摘要 | 状态 | 证据 | 缺口 / 备注 |
| --- | --- | --- | --- | --- |
| FR01 | 本地知识库与持久化 | 已实现 | `src/core/vault/scan.ts:147` 扫描建索引；`src/core/vault/write.ts:32` 临时文件+rename 原子写；`src/features/notes/store.ts:177` 启动恢复；`src-tauri/src/lib.rs:62` 选库并授权；`src/core/vault/write.test.ts:83`「writes managed frontmatter and preserves generated extra fields」；`screenshots/m2/09-tauri-reopen.png` | 无文件监听，外部改动不实时同步（`README.md:55`）；路径不可写时保留草稿只有代码路径（`src/features/notes/store.ts:379-389`），无实测 |
| FR02 | Markdown 创建编辑与阅读（表格/公式/高亮） | 部分实现 | `src/features/editor/MarkdownView.tsx:208-217` 启用 remark-gfm + remark-math + rehype-katex；`src/features/editor/MarkdownView.tsx:195-201` 表格容器；`src/features/notes/NotePane.tsx:234-287` 编辑态；`screenshots/m2/03-editing.png` | 代码语法高亮缺失：`src/features/editor/MarkdownView.tsx:82-98` 仅渲染 `<pre>` 与语言标签，`package.json:15-36` 无高亮依赖；无重命名入口；Mermaid 无实现（P0 条件项） |
| FR03 | Markdown 导入与文本粘贴 | 未实现 | 全仓无导入入口：`src/features/notes/store.ts:87-88` 仅 `createNote`/`createGeneratedNote`；`src-tauri/src/lib.rs:168-178` 仅注册 `pick_vault`/`pick_ai_cli` 两个文件对话框，无导入命令 | 无多文件导入、无粘贴转换、无同名/附件冲突反馈 |
| FR04 | 统一知识对象与两种视图 | 未实现 | `src/core/notes/types.ts:1-12` Note 只有 id/title/content/tags/filePath/时间戳，无 kind/view；`src/app/uiStore.ts:5` 仅有 read/edit 双态 | 方向偏离：v0.3.0 把「视图」收敛为阅读/编辑双态，未保留便签/页面的对象级视图 |
| FR05 | Wiki 链接与反向引用 | 部分实现 | `src/core/links/wikiLinks.ts:15` 提取 `[[标题]]`、`src/core/links/wikiLinks.ts:78` 预处理为链接；`src/features/editor/MarkdownView.tsx:116-151` 可点击与缺失态；`src/core/links/backlinks.ts:54` 反链；`screenshots/v021/08-tauri-context-backlink.png` | 链接按标题解析（`src/core/links/backlinks.ts:65`、`src/app/actions.ts:22-31`），frontmatter 的 id 不参与寻址；改名即断链；同名时静默取首个；links 模块无测试用例 |
| FR06 | 选词创建/复用并原位建链（核心 C08） | 未实现 | 全仓无「选区→建知识对象→回写 `[[标题]]`」链路；`src/features/editor/editorBridge.ts:38-69` 只把 AI 文本写回选区；`README.md:87` 明确「生成后自动建链…暂不做」 | 无建链、无「仅保存/改链接目标/取消链接」三选一；AC01/AC05/AC06/AC13/AC14 因此连锁未实现 |
| FR07 | AI 解释与保存（双入口、提示词模式） | 部分实现 | 全篇生成 `src/features/ai/GenerateNoteDialog.tsx:235`；内联动作 `src/features/ai/InlineActionDialog.tsx:214`；provider 抽象 `src/core/ai/providers.ts:34-119`；`screenshots/m3/09-generate-preview.png`、`screenshots/m3/20-inline-inserted.png` | 只有 CLI/Ollama（`src/core/ai/providers.ts:34-119`），无 PRD 要求的「普通模式：应用内配置 API」；无「选词解释→追问→保存为知识对象」；无多轮对话（`README.md:87`）；无建链复用 |
| FR08 | 来源保存与上下文回溯 | 未实现 | `src/core/notes/types.ts:1-12` 无 source 字段；`src/core/vault/scan.ts:29` 托管键仅 id/title/created/updated/tags；无来源面板 | 无 SourceRecord、无摘录/URL/作者/采集时间，无法回溯学习来源 |
| FR09 | 搜索与已有知识选择 | 部分实现 | `src/core/search/searchNotes.ts:4` 标题/标签/正文打分；`src/features/notes/NoteList.tsx:159-165` 搜索框；`src/app/CommandPalette.tsx:72-77` 复用同一搜索 | 无别名（`src/core/notes/types.ts` 无 aliases），别名检索无法通过；「建链时复用搜索」因 FR06 缺失而不存在 |
| FR10 | 导出备份与索引恢复 | 部分实现 | 「重新扫描」重建索引 `src/features/settings/SettingsPage.tsx:101`、`src/features/notes/store.ts:230`；原件始终是磁盘 Markdown（`src/core/vault/write.ts:32`） | 无导出、无完整备份包、无恢复；重新扫描只是内存索引重建，无进度与关系数校验 |
| FR11 | 网页内容采集最小版本 | 未实现 | `src/features/clipper/ClipperPage.tsx:10-21` 静态占位，第 19 行「入口已留，能力未接」；无 URL 抓取或富文本转换代码 | 粘贴富文本转换、URL 导入两者均无；D08 无选择记录 |
| FR12 | 关系发现与平台扩展（P1–P2） | 未实现 | 全仓无未链接提及建议、对象合并、关系图代码；`package.json:15-36` 无图/布局依赖 | P1 范围，本版未启动 |
| FR13 | AI 内容来源区分与可信度 | 未实现 | `src/core/notes/types.ts:1-12` 无来源性质字段；`src/features/editor/MarkdownView.tsx` 无来源标注渲染；AI 提示词无来源分层（`src/core/ai/prompt.ts`） | 原文摘录/AI 解释/用户理解在保存后不可区分，验收条件无法满足 |

### B. 核心验收清单（AC01–AC14）

| PRD 编号 | 需求摘要 | 状态 | 证据 | 缺口 / 备注 |
| --- | --- | --- | --- | --- |
| AC01 | 选词手动保存并原位建链 | 未实现 | 依赖 FR06；无对应实现与用例 | 重启保持无从验证 |
| AC02 | AI 解释后编辑并保存 | 未实现 | `src/features/ai/InlineActionDialog.tsx:214` 只回写选区文本，不产生知识对象；`src/features/ai/GenerateNoteDialog.tsx:235` 是整篇生成，不基于选区解释 | 无「AI 会话→确认→保存对象→建链」链路 |
| AC03 | 断网/不配 AI 仍可手动建链 | 部分实现 | 离线创建/阅读/搜索可用（`src/features/notes/store.ts:250`、`src/features/notes/NoteList.tsx:159`）；手写 `[[标题]]` 可渲染（`src/features/editor/MarkdownView.tsx:116`） | 只能手写链接语法，无选词建链；无断网实测 |
| AC04 | 同一对象切换便签/页面 | 未实现 | 同 FR04：`src/core/notes/types.ts` 无 view，无切换入口 | ID/正文/关系不变无法验证 |
| AC05 | 三处同名只改选中一处 | 未实现 | 无选词建链链路；无对应用例 | 重复提交幂等亦未验证 |
| AC06 | 复用已有对象并新增引用 | 未实现 | 无复用选择器；只能手写 `[[标题]]` | 不存在「不覆盖旧内容」的判定逻辑 |
| AC07 | 重命名或同名对象的链接身份 | 未实现 | `src/core/links/backlinks.ts:65` 按标题比对；`src/app/actions.ts:25-27` 取首个同名；`src/features/notes/content/structure.md:15` 自述「标题即标识…重命名要全库更新」，无改名迁移代码 | 与 PRD 7.3 稳定身份直接冲突 |
| AC08 | 从反向引用回到来源位置 | 部分实现 | `src/features/links/BacklinkDrawer.tsx:53` 打开来源笔记阅读态；`src/features/links/BacklinkDrawer.tsx:66-68` 展示摘要 | 不滚动定位到引用处；无「定位失效」状态，只有摘要 |
| AC09 | 保存中断/无权限/外部修改 | 部分实现 | 原子写 `src/core/vault/write.ts:32-63`；错误态 `src/features/notes/store.ts:379-389`；关窗 flush `src/app/App.tsx:80-92` | 无外部修改检测与冲突合并（`README.md:55`、`README.md:87`）；无故障注入测试 |
| AC10 | 完整备份恢复并重建索引 | 未实现 | 同 FR10；`src-tauri/src/lib.rs:168-178` 无备份/导出命令 | 仅能手动拷文件夹；无恢复流程与校验 |
| AC11 | 危险 HTML 与代码块安全 | 部分实现 | `src/features/editor/MarkdownView.tsx:208-214` 未启用 rehype-raw，原始 HTML 不作为 HTML 渲染；`src/core/links/wikiLinks.ts:20-31` 跳过围栏代码与行内代码 | 无导入，也无危险 HTML/代码块回归用例，仅代码推断 |
| AC12 | 删除目标或解除链接 | 部分实现 | 缺链显示 `is-missing`（`src/features/editor/MarkdownView.tsx:121-127`）、反链摘要保留 | 无删除目标、无解除链接操作，无受影响引用提示 |
| AC13 | 首次使用完整学习流程 | 未实现 | 首启选库存在（`src/features/notes/Onboarding.tsx:105-126`），但建链能力缺失 | 流程止步于「保存并建链」，AC13 无法完成 |
| AC14 | 选词后「仅保存」不改原文 | 未实现 | 保存面只有写回正文的「保存」（`src/features/notes/NotePane.tsx:191-198`），无建链选择 | 无「仅保存/保存并建链」二选一，故也无「链接未完成」语义 |

### C. 已确认基线（C）

| PRD 编号 | 需求摘要 | 状态 | 证据 | 缺口 / 备注 |
| --- | --- | --- | --- | --- |
| C10 | 独立桌面应用，不依赖 Obsidian | 已实现 | `src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`（Tauri 2 独立壳）；`screenshots/m2/07-tauri-real-fs.png`；无 Obsidian 运行时依赖 | 仅复用 Second Brain Builder 提示词数据（`docs/README.md:5-10`，MIT） |
| C11 | 用户控制权：仅保存/改目标/取消 | 未实现 | 无对应入口；AI 结果也只能插入正文（`src/features/editor/editorBridge.ts:54-63`） | 保存即建链尚未存在，控制权选择无从谈起 |

### D. 数据、非功能与架构（章节号）

| PRD 编号 | 需求摘要 | 状态 | 证据 | 缺口 / 备注 |
| --- | --- | --- | --- | --- |
| §4.2 | 对象与字段模型 | 部分实现 | `src/core/notes/types.ts:1-12` 有稳定 id、title、body、时间戳；`src/core/vault/scan.ts:74-98` 补写/去重 id | 无 kind/view/aliases；无 LinkOccurrence、SourceRecord；链接位置未建模 |
| §7.1 | 保存并建链一致性 | 未实现 | 现有保存只写单文件（`src/core/vault/write.ts:32-63`），无目标+来源+索引的协同与重试状态 | 前置 FR06 缺失；不存在「知识已保存，链接未完成」状态 |
| §7.3 | 稳定身份与 Markdown 一致性 | 部分实现 | frontmatter id 存在（`src/core/vault/scan.ts:74-98`），导出/重扫可保留 | 链接用标题寻址（`src/core/links/backlinks.ts:65`、`src/app/actions.ts:25-27`），id 未参与，改名/同名不满足 |
| §8.1 | 离线可用与可靠性 | 未核 | 核心链路无网络调用；AI 为显式可选（`src/core/ai/providers.ts:34-119`） | 需一次断网冒烟（创建/编辑/搜索/重启）才能判「已实现」 |
| §8.3 | 性能与易用性指标 | 未核 | `package.json:7-14` 无压测脚本，仓库无基准日志 | 需 1,000 篇/100 MB/10,000 链接的实测数据 |
| §8.5 | 首次使用成本 | 部分实现 | 首启 1 步选库（`src/features/notes/Onboarding.tsx:105-126`），0 必填配置；默认标题「未命名笔记」（`src/core/vault/write.ts:79-105`） | 「阅读到建链 ≤5 步」无法达成（缺 FR06）；默认知识库位置未提供建议 |
| §9.1 | AI Provider 适配层 | 部分实现 | `src/core/ai/providers.ts:34-119` 统一 provider 定义与参数模板；`src-tauri/src/ai.rs` 执行与取消 | 仅 CLI/Ollama，无 API 服务商；无用量/错误持久记录；无普通/高级双入口抽象 |
| §9.3 | 阅读选区与 Markdown 源码映射 | 已废止 | 改为源码态取选区（`src/features/editor/editorBridge.ts:18-29`），渲染视图不提供选区动作 | v0.3.0 用 CodeMirror 源码编辑消除了该映射问题；代价是 PRD 主张的「阅读态选词」场景不存在，FR06 因此搁置 |

## 汇总统计

| 状态 | 条数 |
| --- | --- |
| 已实现 | 2 |
| 部分实现 | 14 |
| 未实现 | 18 |
| 未核 | 2 |
| 已废止 | 1 |
| 合计 | 37 |

| 模块 | 条数 | 已实现 | 部分实现 | 未实现 | 未核 | 已废止 |
| --- | --- | --- | --- | --- | --- | --- |
| 本地存储与持久化（FR01、§8.1） | 2 | 1 | 0 | 0 | 1 | 0 |
| Markdown 阅读编辑（FR02） | 1 | 0 | 1 | 0 | 0 | 0 |
| 导入与采集（FR03、FR11） | 2 | 0 | 0 | 2 | 0 | 0 |
| 对象模型与视图（FR04、AC04、§4.2） | 3 | 0 | 1 | 2 | 0 | 0 |
| 来源记录（FR08） | 1 | 0 | 0 | 1 | 0 | 0 |
| 链接与建链（FR05、FR06、AC01、AC05–AC08、AC12、AC14、§7.1、§7.3） | 11 | 0 | 4 | 7 | 0 | 0 |
| AI（FR07、FR13、AC02、§9.1） | 4 | 0 | 2 | 2 | 0 | 0 |
| 搜索（FR09、AC03） | 2 | 0 | 2 | 0 | 0 | 0 |
| 备份与导出（FR10、AC10） | 2 | 0 | 1 | 1 | 0 | 0 |
| 关系发现与扩展（FR12） | 1 | 0 | 0 | 1 | 0 | 0 |
| 异常与安全（AC09、AC11） | 2 | 0 | 2 | 0 | 0 | 0 |
| 首次使用（AC13、§8.5） | 2 | 0 | 1 | 1 | 0 | 0 |
| 架构与风险（C10、C11、§8.3、§9.3） | 4 | 1 | 0 | 1 | 1 | 1 |

## 审计建议关注点

**证据薄弱 / 需复跑**

1. 测试覆盖集中在 AI 与写盘（`src/core/vault/write.test.ts`、`src/core/ai/generate.test.ts`、`src/core/ai/prompt.test.ts`、`src/core/ai/customModes.test.ts`），links/search/markdown 零用例。本次尝试 `pnpm exec vitest run` 未成功：pnpm 触发重装被本机沙箱拒绝、`node_modules` 缺 esbuild；因此表中测试证据只核对到文件与用例名，未确认当前是否通过。外审应在有完整依赖的环境重跑 `pnpm test`、`pnpm build`。
2. FR01 的「路径不可写保留未保存内容」只有代码路径（`src/features/notes/store.ts:379-389`），没有实测；FR02 的表格/公式没有截图或用例，只能靠 `src/features/editor/MarkdownView.tsx:208-217` 推断。
3. AC11 的「不执行脚本」来自未启用 rehype-raw 的代码事实，未做危险 HTML 实投；AC09 的外部修改冲突在 `README.md:87` 明确未做。

**与 PRD 明显偏离（重点抽查）**

4. 链接身份：PRD 7.3 要求稳定 ID，现实现按标题字符串匹配（`src/core/links/backlinks.ts:65`、`src/app/actions.ts:25-27`），重命名即断链，同名静默取首个；`src/features/notes/content/structure.md:15` 还把「标题即标识」写成知识库约定。这是方向性冲突，不只是未完成。
5. AI 接入：PRD FR07 要求「普通模式（应用内 API）+ 高级模式（CLI）」且不强制装 CLI；v0.3.0 只有 Claude Code/Codex/Gemini/自定义 CLI/Ollama（`src/core/ai/providers.ts:34-119`），与「不强制命令行」相反。
6. 数据模型：Note 无 kind/view/source（`src/core/notes/types.ts:1-12`），FR04/FR08/FR13 不是缺界面，而是模型层没有承载字段，AC04 永远无法通过。
7. 核心流程缺失是主动取舍：`README.md:87` 把「生成后自动建链、多轮对话、网页剪藏」列入「暂不做」。外审需确认这是产品决策，还是范围失控；无论哪种，FR06/C08 当前都不可演示。

**判定口径需外审确认**

8. §9.3 标「已废止」是本清单的判断：源码态编辑器确实消除了选区映射风险，但也消除了「阅读视图选词」这一 PRD 主场景。若产品仍坚持阅读态选词，此项应改判「未实现」，FR06 的缺口性质也随之变化。
9. 本清单按 commit `2e1761a`（v0.3.0）判定。审计过程中仓库出现未提交的网页剪藏实现（`src-tauri/src/clipper.rs`，392 行；`package.json` 增 `defuddle`/`linkedom`；`src/features/notes/store.ts` 增 `createNoteFromContent`），FR11 与 FR03 的结论可能在下一次提交后改变。外审需先锁定基线 commit，或等工作区稳定后重审 FR11、FR03、AC03。
