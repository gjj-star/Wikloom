import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryFileSystem } from "../../core/fs/memoryFs";
import { useNotesStore } from "./store";

const fault = vi.hoisted(() => ({ fail: false, failIds: new Set<string>() }));

vi.mock("../../core/vault/write", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/vault/write")>();
  return {
    ...actual,
    async writeNoteFile(
      ...args: Parameters<typeof actual.writeNoteFile>
    ): Promise<void> {
      const note = args[2];
      if (fault.fail || fault.failIds.has(note.id)) {
        throw new Error("Permission denied (test)");
      }
      return actual.writeNoteFile(...args);
    },
  };
});

const ROOT = "/failed-save-vault";

function markdown(id: string, title: string, body: string): string {
  return `---
id: ${id}
title: ${title}
created: 2026-10-21T00:00:00.000Z
updated: 2026-10-21T00:00:00.000Z
---

${body}`;
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

describe("notes store failed save", () => {
  // 回归：保存失败后 rescan / 重新加载不能清掉只存在于内存的草稿（PRD 第 260 行）。
  beforeEach(async () => {
    installBrowserStubs();
    createMemoryFileSystem(ROOT, {
      seed: {
        "Original.md": markdown("note-original", "Original", "original body"),
        "Locked.md": markdown("note-locked", "Locked", "locked body"),
        "Other.md": markdown("note-other", "Other", "other body"),
      },
    });
    await useNotesStore.getState().openVault({
      kind: "memory",
      root: ROOT,
      name: "failed-save",
    });
    expect(useNotesStore.getState().status).toBe("ready");
  });

  afterEach(() => {
    fault.fail = false;
    fault.failIds.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps the unsaved draft when a failed save is followed by rescan", async () => {
    fault.fail = true;
    useNotesStore
      .getState()
      .updateContent("note-original", "important unsaved changes");

    expect(await useNotesStore.getState().flush()).toBe(false);
    expect(useNotesStore.getState().saveState).toBe("error");
    expect(useNotesStore.getState().saveError).toBeTruthy();

    await useNotesStore.getState().rescan();

    const afterRescan = useNotesStore.getState();
    expect(afterRescan.status).toBe("ready");
    expect(afterRescan.notes.find((note) => note.id === "note-original")?.content).toBe(
      "important unsaved changes",
    );
    expect(afterRescan.saveError).toBeTruthy();

    // 权限恢复后，下一次 flush 应该重试并真正落盘。
    fault.fail = false;
    expect(await useNotesStore.getState().flush()).toBe(true);
    expect(useNotesStore.getState().saveState).toBe("saved");

    const fs = createMemoryFileSystem(ROOT);
    const raw = await fs.readText(`${ROOT}/Original.md`);
    expect(raw).toContain("important unsaved changes");
  });

  it("keeps a failed note's draft even when another note saves successfully", async () => {
    // 回归（Review 建议）：失败集合不能是单值，也不能用「另一篇成功」把错误态盖掉。
    fault.failIds.add("note-locked");
    useNotesStore
      .getState()
      .updateContent("note-locked", "locked draft must survive");
    expect(await useNotesStore.getState().flush()).toBe(false);

    useNotesStore.getState().updateContent("note-other", "other content saved");
    expect(await useNotesStore.getState().saveNote("note-other")).toBe(true);
    expect(useNotesStore.getState().saveState).toBe("saved");

    // 另一篇保存成功之后，flush 仍必须报告「还有没落盘的笔记」。
    expect(await useNotesStore.getState().flush()).toBe(false);

    await useNotesStore.getState().rescan();
    expect(
      useNotesStore
        .getState()
        .notes.find((note) => note.id === "note-locked")?.content,
    ).toBe("locked draft must survive");

    fault.failIds.clear();
    expect(await useNotesStore.getState().flush()).toBe(true);
    const saved = await createMemoryFileSystem(ROOT).readText(
      `${ROOT}/Locked.md`,
    );
    expect(saved).toContain("locked draft must survive");
  });
});
