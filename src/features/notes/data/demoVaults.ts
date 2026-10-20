import { ulid } from "ulid";
import { createMemoryFileSystem, memoryPersistKey } from "../../../core/fs/memoryFs";
import { serializeFrontmatter } from "../../../core/vault/frontmatter";
import type { VaultInfo } from "../../../core/vault/types";
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
const hoursAgo = (hours: number, minutes = 0) =>
  now - (hours * 60 + minutes) * 60_000;
const daysAgo = (days: number) => now - days * 86_400_000;

interface DemoMeta {
  title: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

/** 演示库直接从内存种入带 frontmatter 的文件，标签与时间才像真实笔记。 */
function withMeta(body: string, meta: DemoMeta): string {
  return serializeFrontmatter(
    {
      id: ulid(),
      title: meta.title,
      created: new Date(meta.createdAt).toISOString(),
      updated: new Date(meta.updatedAt).toISOString(),
      tags: meta.tags,
    },
    body,
  );
}

export interface DemoVault {
  id: string;
  name: string;
  description: string;
  root: string;
  files: Record<string, string>;
}

export const demoVaults: DemoVault[] = [
  {
    id: "demo-personal",
    name: "演示知识库",
    description: "10 篇带双向链接的笔记 · 内存文件系统",
    root: "/vaults/demo-personal",
    files: {
      "欢迎使用 Wikloom.md": withMeta(welcome, {
        title: "欢迎使用 Wikloom",
        tags: ["入门", "M1"],
        createdAt: daysAgo(21),
        updatedAt: hoursAgo(2, 12),
      }),
      "编辑器与阅读态.md": withMeta(editor, {
        title: "编辑器与阅读态",
        tags: ["编辑器", "M1"],
        createdAt: daysAgo(18),
        updatedAt: hoursAgo(3, 40),
      }),
      "双向链接与反链.md": withMeta(backlinks, {
        title: "双向链接与反链",
        tags: ["链接", "概念"],
        createdAt: daysAgo(20),
        updatedAt: hoursAgo(5),
      }),
      "路线图 2026.md": withMeta(roadmap, {
        title: "路线图 2026",
        tags: ["计划"],
        createdAt: daysAgo(14),
        updatedAt: hoursAgo(7),
      }),
      "网页剪藏设计笔记.md": withMeta(clipperNotes, {
        title: "网页剪藏设计笔记",
        tags: ["剪藏", "设计"],
        createdAt: daysAgo(12),
        updatedAt: hoursAgo(9),
      }),
      "主题与排版.md": withMeta(theme, {
        title: "主题与排版",
        tags: ["设计", "排版"],
        createdAt: daysAgo(16),
        updatedAt: hoursAgo(20),
      }),
      "Markdown 速查.md": withMeta(markdown, {
        title: "Markdown 速查",
        tags: ["Markdown", "参考"],
        createdAt: daysAgo(45),
        updatedAt: hoursAgo(26),
      }),
      "卡片盒笔记法.md": withMeta(zettelkasten, {
        title: "卡片盒笔记法",
        tags: ["方法", "链接"],
        createdAt: daysAgo(24),
        updatedAt: hoursAgo(30),
      }),
      "知识库结构约定.md": withMeta(structure, {
        title: "知识库结构约定",
        tags: ["规范"],
        createdAt: daysAgo(30),
        updatedAt: daysAgo(2),
      }),
      "常见问题.md": withMeta(faq, {
        title: "常见问题",
        tags: ["FAQ"],
        createdAt: daysAgo(10),
        updatedAt: daysAgo(2.5),
      }),
    },
  },
  {
    id: "demo-work",
    name: "工作演示库",
    description: "3 篇工作笔记，用来验证换库 · 内存文件系统",
    root: "/vaults/demo-work",
    files: {
      "本周工作计划.md": withMeta(weekPlan, {
        title: "本周工作计划",
        tags: ["工作", "计划"],
        createdAt: daysAgo(7),
        updatedAt: hoursAgo(1, 20),
      }),
      "会议纪要 · 2026-10-20.md": withMeta(meeting, {
        title: "会议纪要 · 2026-10-20",
        tags: ["会议"],
        createdAt: hoursAgo(5),
        updatedAt: hoursAgo(4),
      }),
      "发布检查清单.md": withMeta(releaseChecklist, {
        title: "发布检查清单",
        tags: ["流程"],
        createdAt: daysAgo(5),
        updatedAt: hoursAgo(6),
      }),
    },
  },
];

export function getDemoVault(id: string): DemoVault | null {
  return demoVaults.find((vault) => vault.id === id) ?? null;
}

/** 首次打开演示库时把内置 Markdown 种进内存 FS；已有状态则直接复用。 */
export function seedDemoVault(id: string): VaultInfo | null {
  const demo = getDemoVault(id);
  if (!demo) return null;
  createMemoryFileSystem(demo.root, {
    seed: demo.files,
    persistKey: memoryPersistKey(demo.root),
  });
  return { kind: "memory", root: demo.root, name: demo.name };
}
