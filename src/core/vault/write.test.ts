import { describe, expect, it } from "vitest";
import type { FileSystemPort } from "../fs/types";
import { sanitizeFileStem, splitFrontmatter } from "./frontmatter";
import {
  createNoteWithContent,
  normalizeNoteFolder,
  notePathForTitle,
} from "./write";

function fakeFileSystem() {
  const files = new Map<string, string>();
  const dirs = new Set<string>();

  const fs: FileSystemPort = {
    kind: "memory",
    async list() {
      return [];
    },
    async readText(path) {
      const value = files.get(path);
      if (value === undefined) throw new Error(`ENOENT: ${path}`);
      return value;
    },
    async writeText(path, content) {
      files.set(path, content);
    },
    async stat(path) {
      if (files.has(path)) {
        return {
          isFile: true,
          isDirectory: false,
          isSymlink: false,
          size: files.get(path)!.length,
          mtimeMs: 1,
        };
      }
      if (dirs.has(path)) {
        return {
          isFile: false,
          isDirectory: true,
          isSymlink: false,
          size: 0,
          mtimeMs: 1,
        };
      }
      return null;
    },
    async mkdir(path) {
      dirs.add(path);
    },
    async remove(path) {
      files.delete(path);
    },
    async rename(from, to) {
      const value = files.get(from);
      if (value === undefined) throw new Error(`ENOENT: ${from}`);
      files.delete(from);
      files.set(to, value);
    },
  };

  return { fs, files };
}

describe("note paths", () => {
  it("normalizes a nested folder and rejects traversal", () => {
    expect(normalizeNoteFolder(" research\\ai / notes ")).toBe(
      "research/ai/notes",
    );
    expect(normalizeNoteFolder("")).toBe("");
    expect(() => normalizeNoteFolder("../outside")).toThrow();
    expect(() => normalizeNoteFolder("C:\\outside")).toThrow();
  });

  it("sanitizes the file stem but keeps the title intact", () => {
    expect(notePathForTitle("ai", "What: is / recursion?")).toBe(
      "ai/What- is - recursion-.md",
    );
  });

  it("adds a suffix to Windows reserved device names", () => {
    for (const value of ["con", "CON", "nul", "aux", "prn", "com1", "LPT9"]) {
      expect(sanitizeFileStem(value).toLowerCase()).toMatch(/-note$/);
    }
    expect(sanitizeFileStem("con.foo")).toBe("con-note.foo");
    expect(sanitizeFileStem("console")).toBe("console");
    expect(notePathForTitle("", "con")).toBe("con-note.md");
  });
});

describe("createNoteWithContent", () => {
  it("writes managed frontmatter and preserves generated extra fields", async () => {
    const { fs, files } = fakeFileSystem();
    const note = await createNoteWithContent(
      fs,
      "/vault",
      [],
      {
        title: "递归",
        content: "# 递归\n\n递归是函数调用自己。",
        tags: [" cs ", "cs", "engineering"],
        folder: "ai-notes",
        extra: {
          status: "Seed",
          updated: "1999-01-01",
          id: "model-id",
          tags: ["should-not-win"],
        },
      },
      1700000000000,
    );

    expect(note.filePath).toBe("ai-notes/递归.md");
    const raw = files.get("/vault/ai-notes/递归.md");
    expect(raw).toBeTruthy();
    const parsed = splitFrontmatter(raw!);
    expect(parsed.data.id).toBe(note.id);
    expect(parsed.data.title).toBe("递归");
    expect(parsed.data.tags).toEqual(["cs", "engineering"]);
    expect(parsed.data.status).toBe("Seed");
    expect(parsed.data.updated).toBe(
      new Date(1700000000000).toISOString(),
    );
    expect(parsed.data.id).not.toBe("model-id");
    expect(parsed.body).toContain("# 递归");
  });

  it("checks disk even when the note index is stale", async () => {
    const { fs } = fakeFileSystem();
    await fs.writeText("/vault/递归.md", "stale index");
    const note = await createNoteWithContent(
      fs,
      "/vault",
      [],
      { title: "递归", content: "# 递归\n\n正文。" },
      1700000000000,
    );
    expect(note.title).toBe("递归 2");
    expect(note.filePath).toBe("递归 2.md");
  });

  it("adds a suffix and rewrites the H1 when the path exists", async () => {
    const { fs, files } = fakeFileSystem();
    const first = await createNoteWithContent(
      fs,
      "/vault",
      [],
      { title: "递归", content: "# 递归\n\n第一版。" },
      1700000000000,
    );
    const second = await createNoteWithContent(
      fs,
      "/vault",
      [first],
      { title: "递归", content: "# 递归\n\n第二版。" },
      1700000000000,
    );

    expect(second.title).toBe("递归 2");
    expect(second.filePath).toBe("递归 2.md");
    expect(second.content.startsWith("# 递归 2")).toBe(true);
    expect(files.has("/vault/递归 2.md")).toBe(true);
  });
});
