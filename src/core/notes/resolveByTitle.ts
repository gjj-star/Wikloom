import type { Note } from "./types";

/**
 * 标题索引：大小写不敏感，标题相同取数组里第一个（与点击 wiki 链接的结果一致）。
 * notes 的顺序由扫描决定（更新时间倒序），索引只记录第一次出现的笔记。
 */
export function createTitleIndex(notes: Note[]): Map<string, Note> {
  const index = new Map<string, Note>();
  for (const note of notes) {
    const key = note.title.toLowerCase();
    if (!index.has(key)) index.set(key, note);
  }
  return index;
}

/** 按标题找笔记；找不到返回 null。标题比较规则见 createTitleIndex。 */
export function resolveFromTitleIndex(
  index: Map<string, Note>,
  title: string,
): Note | null {
  const key = title.trim().toLowerCase();
  if (!key) return null;
  return index.get(key) ?? null;
}

/**
 * 按标题找笔记（单次查询版本）。行为必须与 openNoteByTitle 保持一致：
 * 大小写不敏感、去首尾空格、取第一个匹配。
 */
export function resolveNoteByTitle(notes: Note[], title: string): Note | null {
  return resolveFromTitleIndex(createTitleIndex(notes), title);
}
