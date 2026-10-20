import type { Note } from "../notes/types";

/** 标题 > 标签 > 正文的轻量打分搜索，够 M1 用，后续可换成索引。 */
export function searchNotes(notes: Note[], query: string): Note[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) {
    return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  return notes
    .map((note) => {
      const title = note.title.toLowerCase();
      let score = 0;

      if (title === keyword) score += 100;
      else if (title.startsWith(keyword)) score += 60;
      else if (title.includes(keyword)) score += 40;

      if (note.tags.some((tag) => tag.toLowerCase().includes(keyword))) score += 20;
      if (note.content.toLowerCase().includes(keyword)) score += 10;

      return { note, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.note.updatedAt - a.note.updatedAt)
    .map((entry) => entry.note);
}
