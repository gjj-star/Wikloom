import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryFileSystem } from "../../core/fs/memoryFs";
import { splitFrontmatter } from "../../core/vault/frontmatter";
import { useNotesStore } from "./store";

const writeDelay = vi.hoisted(() => ({ ms: 0 }));

vi.mock("../../core/vault/write", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/vault/write")>();
  return {
    ...actual,
    async writeNoteFile(
      ...args: Parameters<typeof actual.writeNoteFile>
    ): Promise<void> {
      if (writeDelay.ms > 0) {
        await new Promise((resolve) => setTimeout(resolve, writeDelay.ms));
      }
      return actual.writeNoteFile(...args);
    },
  };
});

const ROOT = "/save-race-vault";

function markdown(id: string, title: string, body: string): string {
  return `---
id: ${id}
title: ${title}
created: 2026-10-21T00:00:00.000Z
updated: 2026-10-21T00:00:00.000Z
---

# ${title}

${body}
`;
}

function installBrowserStubs(): void {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
  vi.stubGlobal("window", {
    setTimeout: (callback: () => void, delay: number) =>
      setTimeout(callback, delay),
    clearTimeout: (timer: ReturnType<typeof setTimeout>) =>
      clearTimeout(timer),
  });
}

async function seedVault(): Promise<void> {
  const fs = createMemoryFileSystem(ROOT, {
    seed: {
      "A.md": markdown("note-a", "A", "A 初始内容"),
      "B.md": markdown("note-b", "B", "B 初始内容"),
    },
  });
  await fs.writeText(`${ROOT}/A.md`, markdown("note-a", "A", "A 初始内容"));
  await fs.writeText(`${ROOT}/B.md`, markdown("note-b", "B", "B 初始内容"));
}

async function readSaved(fileName: string) {
  const fs = createMemoryFileSystem(ROOT);
  const raw = await fs.readText(`${ROOT}/${fileName}`);
  return splitFrontmatter(raw);
}

describe("notes store autosave", () => {
  // 结论（v0.4.0）：真实切换路径 + 25ms 写延迟未复现丢保存。
  // 单槽位 saveTimer / pendingNoteId 仍是结构风险；以后出现多笔记并发编辑或批量更新时要复查。
  beforeEach(async () => {
    installBrowserStubs();
    localStorage.clear();
    await seedVault();
    await useNotesStore.getState().openVault({
      kind: "memory",
      root: ROOT,
      name: "save-race",
    });
  });

  afterEach(() => {
    writeDelay.ms = 0;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps the latest content and tags when notes are switched while edits are pending", async () => {
    const store = useNotesStore.getState();
    expect(store.status).toBe("ready");
    expect(store.notes.map((note) => note.id).sort()).toEqual([
      "note-a",
      "note-b",
    ]);

    // 真实 UI 可触发的路径：编辑 → 切走（异步 flush）→ 编辑另一篇 → 再切回。
    // 人为放慢写文件，让「上一笔还在写」的窗口变大。
    writeDelay.ms = 25;
    for (let round = 0; round < 8; round += 1) {
      useNotesStore.getState().selectNote("note-a");
      useNotesStore
        .getState()
        .updateContent("note-a", `A 内容 ${round}`);
      useNotesStore.getState().updateTags("note-a", [`a-${round}`]);

      useNotesStore.getState().selectNote("note-b");
      useNotesStore
        .getState()
        .updateContent("note-b", `B 内容 ${round}`);
      useNotesStore.getState().updateTags("note-b", [`b-${round}`]);

      useNotesStore.getState().selectNote("note-a");
      await Promise.resolve();
    }

    // 最后一轮：B 已由切走时的 flush 保存；A 再改一次，显式 flush。
    useNotesStore.getState().updateContent("note-a", "A 最终内容");
    useNotesStore.getState().updateTags("note-a", ["a-final"]);
    await useNotesStore.getState().flush();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const state = useNotesStore.getState();
    const noteA = state.notes.find((note) => note.id === "note-a");
    const noteB = state.notes.find((note) => note.id === "note-b");
    expect(noteA?.content).toBe("A 最终内容");
    expect(noteA?.tags).toEqual(["a-final"]);
    expect(noteB?.content).toBe("B 内容 7");
    expect(noteB?.tags).toEqual(["b-7"]);

    const savedA = await readSaved("A.md");
    const savedB = await readSaved("B.md");
    expect(savedA.body).toContain("A 最终内容");
    expect(savedA.data.tags).toEqual(["a-final"]);
    expect(savedB.body).toContain("B 内容 7");
    expect(savedB.data.tags).toEqual(["b-7"]);
  });
});
