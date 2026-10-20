import { describe, expect, it } from "vitest";
import type { Note } from "../notes/types";
import {
  findNoteByTitle,
  isInsideWikiLink,
  isSameSourceNote,
  isWikiLinkSelection,
  nextAvailableTitle,
  normalizeLinkTitle,
} from "./linkNote";

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    title: "递归",
    content: "",
    tags: [],
    filePath: "递归.md",
    createdAt: 1,
    updatedAt: 1,
    extra: {},
    ...overrides,
  };
}

describe("linkNote", () => {
  it("normalizes a selected phrase into a link title", () => {
    expect(normalizeLinkTitle("  递归  ")).toBe("递归");
    expect(normalizeLinkTitle("recursive\n function")).toBe(
      "recursive function",
    );
    expect(normalizeLinkTitle("   ")).toBeNull();
    expect(normalizeLinkTitle("a | b")).toBeNull();
    expect(normalizeLinkTitle("a [[b]]")).toBeNull();
  });

  it("recognizes a selection that is already a wiki link", () => {
    expect(isWikiLinkSelection("[[递归]]")).toBe(true);
    expect(isWikiLinkSelection("[[递归|别名]]")).toBe(true);
    expect(isWikiLinkSelection("递归")).toBe(false);
  });

  it("recognizes text selected inside the brackets of a link", () => {
    const content = "前缀 [[递归]] 后缀";
    const from = content.indexOf("递归");
    expect(isInsideWikiLink(content, from, from + 2)).toBe(true);
    expect(isInsideWikiLink(content, 0, 2)).toBe(false);
  });

  it("finds an existing note case-insensitively", () => {
    const notes = [note({ title: "Recursion" })];
    expect(findNoteByTitle(notes, "recursion")?.title).toBe("Recursion");
    expect(findNoteByTitle(notes, "其他")).toBeUndefined();
  });

  it("detects a note created by the same source note", () => {
    const existing = note({ extra: { source_note: "source-1" } });
    expect(isSameSourceNote(existing, "source-1")).toBe(true);
    expect(isSameSourceNote(existing, "source-2")).toBe(false);
    expect(isSameSourceNote(note(), "source-1")).toBe(false);
  });

  it("finds the next free numbered title", () => {
    const notes = [
      note({ title: "递归" }),
      note({ title: "递归 2", filePath: "ai-real/递归 2.md" }),
    ];
    expect(nextAvailableTitle("递归", notes)).toBe("递归 3");
    expect(nextAvailableTitle("新概念", notes)).toBe("新概念 2");
  });

  it("stops after 500 numbered candidates", () => {
    const notes = Array.from({ length: 499 }, (_, index) =>
      note({ title: `递归 ${index + 2}`, filePath: `递归 ${index + 2}.md` }),
    );
    expect(() => nextAvailableTitle("递归", notes)).toThrow(/唯一标题/);
  });
});
