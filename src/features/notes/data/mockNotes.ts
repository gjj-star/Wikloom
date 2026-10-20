import type { Note } from "../../../core/notes/types";
import welcome from "../content/welcome.md?raw";
import backlinks from "../content/backlinks.md?raw";
import editor from "../content/editor.md?raw";
import markdown from "../content/markdown.md?raw";
import zettelkasten from "../content/zettelkasten.md?raw";
import structure from "../content/structure.md?raw";
import clipperNotes from "../content/clipper-notes.md?raw";
import roadmap from "../content/roadmap.md?raw";
import faq from "../content/faq.md?raw";
import theme from "../content/theme.md?raw";
import weekPlan from "../content/week-plan.md?raw";
import meeting from "../content/meeting.md?raw";
import releaseChecklist from "../content/release-checklist.md?raw";

const now = Date.now();
const minutesAgo = (minutes: number) => now - minutes * 60_000;
const hoursAgo = (hours: number, minutes = 0) =>
  minutesAgo(hours * 60 + minutes);
const daysAgo = (days: number) => now - days * 86_400_000;

/**
 * M1 的演示数据。正文是独立 .md 文件，将来接真实文件系统时可以整段替换。
 * 链接关系：见各文件里的 [[标题]]。
 */
export const mockNotes: Note[] = [
  {
    id: "welcome",
    title: "欢迎使用 Wikloom",
    content: welcome,
    tags: ["入门", "M1"],
    vaultId: "personal",
    createdAt: daysAgo(21),
    updatedAt: hoursAgo(2, 12),
  },
  {
    id: "editor",
    title: "编辑器与阅读态",
    content: editor,
    tags: ["编辑器", "M1"],
    vaultId: "personal",
    createdAt: daysAgo(18),
    updatedAt: hoursAgo(3, 40),
  },
  {
    id: "backlinks",
    title: "双向链接与反链",
    content: backlinks,
    tags: ["链接", "概念"],
    vaultId: "personal",
    createdAt: daysAgo(20),
    updatedAt: hoursAgo(5),
  },
  {
    id: "roadmap",
    title: "路线图 2026",
    content: roadmap,
    tags: ["计划"],
    vaultId: "personal",
    createdAt: daysAgo(14),
    updatedAt: hoursAgo(7),
  },
  {
    id: "clipper-notes",
    title: "网页剪藏设计笔记",
    content: clipperNotes,
    tags: ["剪藏", "设计"],
    vaultId: "personal",
    createdAt: daysAgo(12),
    updatedAt: hoursAgo(9),
  },
  {
    id: "theme",
    title: "主题与排版",
    content: theme,
    tags: ["设计", "排版"],
    vaultId: "personal",
    createdAt: daysAgo(16),
    updatedAt: hoursAgo(20),
  },
  {
    id: "markdown",
    title: "Markdown 速查",
    content: markdown,
    tags: ["Markdown", "参考"],
    vaultId: "personal",
    createdAt: daysAgo(45),
    updatedAt: hoursAgo(26),
  },
  {
    id: "zettelkasten",
    title: "卡片盒笔记法",
    content: zettelkasten,
    tags: ["方法", "链接"],
    vaultId: "personal",
    createdAt: daysAgo(24),
    updatedAt: hoursAgo(30),
  },
  {
    id: "structure",
    title: "知识库结构约定",
    content: structure,
    tags: ["规范"],
    vaultId: "personal",
    createdAt: daysAgo(30),
    updatedAt: daysAgo(2),
  },
  {
    id: "faq",
    title: "常见问题",
    content: faq,
    tags: ["FAQ"],
    vaultId: "personal",
    createdAt: daysAgo(10),
    updatedAt: daysAgo(2.5),
  },
  {
    id: "week-plan",
    title: "本周工作计划",
    content: weekPlan,
    tags: ["工作", "计划"],
    vaultId: "work",
    createdAt: daysAgo(7),
    updatedAt: hoursAgo(1, 20),
  },
  {
    id: "meeting",
    title: "会议纪要 · 2026-10-20",
    content: meeting,
    tags: ["会议"],
    vaultId: "work",
    createdAt: hoursAgo(5),
    updatedAt: hoursAgo(4),
  },
  {
    id: "release-checklist",
    title: "发布检查清单",
    content: releaseChecklist,
    tags: ["流程"],
    vaultId: "work",
    createdAt: daysAgo(5),
    updatedAt: hoursAgo(6),
  },
];
