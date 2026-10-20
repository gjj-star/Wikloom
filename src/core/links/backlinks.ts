import type { Note } from "../notes/types";
import { extractWikiLinks } from "./wikiLinks";

export interface Backlink {
  note: Note;
  /** 命中位置前后截出来的一段纯文本。 */
  snippet: string;
}

export interface BacklinkGroups {
  references: Backlink[];
  mentions: Backlink[];
}

function cleanSnippet(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[\[|\]\]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 把围栏代码块替换成等长空白，避免摘要截到半段代码或误认代码里的 [[。 */
function maskFencedBlocks(markdown: string): string {
  let inFence = false;
  return markdown
    .split("\n")
    .map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
        inFence = !inFence;
        return " ".repeat(line.length);
      }
      return inFence ? " ".repeat(line.length) : line;
    })
    .join("\n");
}

function snippetAround(content: string, index: number, length: number): string {
  const start = Math.max(0, index - 55);
  const end = Math.min(content.length, index + length + 75);
  const body = cleanSnippet(content.slice(start, end));
  return `${start > 0 ? "…" : ""}${body}${end < content.length ? "…" : ""}`;
}

/**
 * 引用 = 显式写了 [[标题]]；提及 = 正文里自然出现了标题。
 * 一条笔记命中引用就不再计入提及，避免同一来源出现两次。
 */
export function getBacklinks(target: Note, notes: Note[]): BacklinkGroups {
  const references: Backlink[] = [];
  const mentions: Backlink[] = [];
  const title = target.title;
  const lowerTitle = title.toLowerCase();

  for (const note of notes) {
    if (note.id === target.id) continue;

    const masked = maskFencedBlocks(note.content);
    const links = extractWikiLinks(note.content);
    const reference = links.find((link) => link.target === title);
    if (reference) {
      references.push({
        note,
        snippet: snippetAround(masked, reference.start, reference.end - reference.start),
      });
      continue;
    }

    // 标题可能出现多次；第一次落在别的 wiki 链接里时，继续找下一处。
    const lowerMasked = masked.toLowerCase();
    let index = lowerMasked.indexOf(lowerTitle);
    let mentionIndex = -1;

    while (index !== -1) {
      const insideOtherLink = links.some(
        (link) => index >= link.start && index + title.length <= link.end,
      );
      if (!insideOtherLink) {
        mentionIndex = index;
        break;
      }
      index = lowerMasked.indexOf(lowerTitle, index + 1);
    }

    if (mentionIndex < 0) continue;

    mentions.push({
      note,
      snippet: snippetAround(masked, mentionIndex, title.length),
    });
  }

  const byUpdatedAt = (a: Backlink, b: Backlink) => b.note.updatedAt - a.note.updatedAt;
  return { references: references.sort(byUpdatedAt), mentions: mentions.sort(byUpdatedAt) };
}
