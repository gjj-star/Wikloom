import type { Note } from "../notes/types";
import { VaultError } from "../vault/errors";

const WIKI_LINK_SELECTION = /^\[\[[^\]|\n]+?(?:\|[^\]\n]+)?\]\]$/;

/** 整个选区就是一个现成的 [[双链]]。 */
export function isWikiLinkSelection(text: string): boolean {
  return WIKI_LINK_SELECTION.test(text.trim());
}

/** 选区只是链接文字、两侧的 [[ ]] 还在。 */
export function isInsideWikiLink(
  content: string,
  from: number,
  to: number,
): boolean {
  return (
    content.slice(Math.max(0, from - 2), from) === "[[" &&
    content.slice(to, to + 2) === "]]"
  );
}

/**
 * 选区变成可用作文件名和双链目标的标题。
 * 双链语法里的 [ ] | 不能出现在目标标题里，直接判非法。
 */
export function normalizeLinkTitle(raw: string): string | null {
  const title = raw.replace(/\s+/g, " ").trim();
  if (!title || /[\[\]|\n]/.test(title)) return null;
  return title.slice(0, 200);
}

export function findNoteByTitle(
  notes: Note[],
  title: string,
): Note | undefined {
  const lower = title.toLowerCase();
  return notes.find((note) => note.title.toLowerCase() === lower);
}

/** 同名标题已存在时，给「新建并加序号」分支找一个不重复的标题。 */
export function nextAvailableTitle(
  baseTitle: string,
  notes: Note[],
): string {
  let suffix = 2;
  let candidate = `${baseTitle} ${suffix}`;
  while (findNoteByTitle(notes, candidate)) {
    suffix += 1;
    if (suffix > 500) {
      throw new VaultError(
        "WRITE_FAILED",
        `无法为「${baseTitle}」生成唯一标题，同名笔记过多。`,
      );
    }
    candidate = `${baseTitle} ${suffix}`;
  }
  return candidate;
}

/** 同名笔记是否就是当前来源笔记生成的，避免重复创建。 */
export function isSameSourceNote(
  note: Note,
  sourceNoteId: string,
): boolean {
  return (
    typeof note.extra.source_note === "string" &&
    note.extra.source_note === sourceNoteId
  );
}
