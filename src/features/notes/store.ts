import { create } from "zustand";
import type { FileSystemPort } from "../../core/fs/types";
import {
  createMemoryFileSystem,
  hasMemoryState,
  memoryPersistKey,
} from "../../core/fs/memoryFs";
import { isTauriRuntime } from "../../core/fs/runtime";
import { createTauriFileSystem } from "../../core/fs/tauriFs";
import type { Note } from "../../core/notes/types";
import { displayNameFromRoot } from "../../core/paths";
import { normalizeTags } from "../../core/vault/frontmatter";
import { VaultError, toVaultError } from "../../core/vault/errors";
import { scanVault, type VaultFileError } from "../../core/vault/scan";
import type { VaultInfo } from "../../core/vault/types";
import { createEmptyNote, createNoteWithContent, writeNoteFile } from "../../core/vault/write";
import type { NewNoteContent } from "../../core/vault/write";

export type NotesStatus =
  | "idle"
  | "loading"
  | "onboarding"
  | "ready"
  | "error";
export type SaveState = "idle" | "saving" | "saved" | "error";

const VAULT_KEY = "wikloom:vault";
const SAVE_DELAY = 800;

let activeFs: FileSystemPort | null = null;
let saveTimer: number | undefined;
let pendingNoteId: string | null = null;
let inFlightSave: Promise<void> | null = null;
let bootstrapStarted = false;

function persistVault(vault: VaultInfo): void {
  // Tauri 的已选目录存在 Rust 侧（vault-path.txt），不再写 localStorage。
  if (vault.kind !== "memory") return;
  try {
    localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
  } catch {
    // 隐私模式忽略
  }
}

function readSavedVault(): VaultInfo | null {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VaultInfo>;
    if (parsed.kind !== "memory") return null;
    if (typeof parsed.root !== "string" || !parsed.root) return null;
    return {
      kind: parsed.kind,
      root: parsed.root,
      name:
        typeof parsed.name === "string" && parsed.name
          ? parsed.name
          : displayNameFromRoot(parsed.root),
    };
  } catch {
    return null;
  }
}

interface NotesState {
  status: NotesStatus;
  vault: VaultInfo | null;
  notes: Note[];
  selectedId: string;
  query: string;
  tagFilter: string | null;
  errors: VaultFileError[];
  failure: VaultError | null;
  saveState: SaveState;
  lastSavedAt: number | null;
  saveError: string | null;

  bootstrap: () => Promise<void>;
  openVault: (vault: VaultInfo) => Promise<void>;
  rescan: () => Promise<void>;

  selectNote: (id: string) => void;
  setQuery: (query: string) => void;
  setTagFilter: (tag: string | null) => void;

  createNote: () => Promise<string | null>;
  createGeneratedNote: (input: NewNoteContent) => Promise<Note>;
  updateContent: (id: string, content: string) => void;
  updateTags: (id: string, tags: string[]) => void;
  saveNote: (id?: string) => Promise<void>;
  flush: () => Promise<void>;
}

export const useNotesStore = create<NotesState>((set, get) => {
  async function load(vault: VaultInfo, keepSelection = false): Promise<void> {
    await get().flush();
    const previousId = keepSelection ? get().selectedId : "";

    set({
      status: "loading",
      vault,
      notes: [],
      selectedId: "",
      query: "",
      tagFilter: null,
      errors: [],
      failure: null,
      saveState: "idle",
      lastSavedAt: null,
      saveError: null,
    });

    try {
      let fs: FileSystemPort;
      if (vault.kind === "tauri") {
        fs = await createTauriFileSystem(vault.root);
      } else {
        fs = createMemoryFileSystem(vault.root, {
          persistKey: memoryPersistKey(vault.root),
        });
      }
      const result = await scanVault(fs, vault.root);
      activeFs = fs;
      persistVault(vault);
      const selectedId =
        keepSelection && result.notes.some((note) => note.id === previousId)
          ? previousId
          : result.notes[0]?.id ?? "";
      set({
        status: "ready",
        notes: result.notes,
        selectedId,
        errors: result.errors,
        failure: null,
      });
    } catch (error) {
      activeFs = null;
      const failure = toVaultError(
        error,
        "SCAN_FAILED",
        "读取知识库失败。",
      );
      set({
        status: "error",
        notes: [],
        selectedId: "",
        failure,
      });
    }
  }

  function scheduleSave(id: string): void {
    pendingNoteId = id;
    if (saveTimer !== undefined) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = undefined;
      const target = pendingNoteId;
      pendingNoteId = null;
      if (target) void get().saveNote(target);
    }, SAVE_DELAY);
  }

  return {
    status: "idle",
    vault: null,
    notes: [],
    selectedId: "",
    query: "",
    tagFilter: null,
    errors: [],
    failure: null,
    saveState: "idle",
    lastSavedAt: null,
    saveError: null,

    async bootstrap() {
      if (bootstrapStarted) return;
      bootstrapStarted = true;

      // 桌面端：已选目录由 Rust 持有并恢复 scope，前端不再能指定路径。
      if (isTauriRuntime()) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const root = await invoke<string | null>("get_saved_vault");
          if (!root) {
            set({ status: "onboarding" });
            return;
          }
          await load({
            kind: "tauri",
            root,
            name: displayNameFromRoot(root),
          });
        } catch (error) {
          const failure = toVaultError(
            error,
            "SCAN_FAILED",
            "读取知识库失败。",
          );
          set({ status: "error", failure });
        }
        return;
      }

      const saved = readSavedVault();
      if (!saved) {
        set({ status: "onboarding" });
        return;
      }
      if (!hasMemoryState(saved.root)) {
        set({
          status: "error",
          vault: saved,
          failure: new VaultError(
            "VAULT_MISSING",
            "知识库文件夹不存在。它可能被移动或删除了。",
            { path: saved.root },
          ),
        });
        return;
      }
      await load(saved);
    },

    async openVault(vault) {
      await load(vault);
    },

    async rescan() {
      const vault = get().vault;
      if (!vault) return;
      await load(vault, true);
    },

    selectNote(id) {
      if (!get().notes.some((note) => note.id === id)) return;
      void get().flush();
      set({ selectedId: id });
    },

    setQuery(query) {
      set({ query });
    },

    setTagFilter(tagFilter) {
      set({ tagFilter });
    },

    async createNote() {
      const vault = get().vault;
      const fs = activeFs;
      if (!vault || !fs) return null;

      try {
        await get().flush();
        const note = await createEmptyNote(fs, vault.root, get().notes);
        set((state) => ({
          notes: [note, ...state.notes],
          selectedId: note.id,
          query: "",
          tagFilter: null,
          saveState: "saved",
          lastSavedAt: note.updatedAt,
          saveError: null,
        }));
        return note.id;
      } catch (error) {
        const failure = toVaultError(
          error,
          "WRITE_FAILED",
          "新建笔记失败。",
        );
        set({ saveState: "error", saveError: failure.message });
        return null;
      }
    },

    async createGeneratedNote(input) {
      const vault = get().vault;
      const fs = activeFs;
      if (!vault || !fs) {
        throw new VaultError(
          "WRITE_FAILED",
          "知识库还没有准备好，暂时不能写入生成结果。",
        );
      }

      await get().flush();
      const note = await createNoteWithContent(
        fs,
        vault.root,
        get().notes,
        input,
      );
      set((state) => ({
        notes: [note, ...state.notes],
        selectedId: note.id,
        query: "",
        tagFilter: null,
        saveState: "saved",
        lastSavedAt: note.updatedAt,
        saveError: null,
      }));
      return note;
    },

    updateContent(id, content) {
      set((state) => ({
        notes: state.notes.map((note) =>
          note.id === id ? { ...note, content } : note,
        ),
        saveState: state.saveState === "saving" ? "saving" : "idle",
      }));

      scheduleSave(id);
    },

    updateTags(id, tags) {
      const note = get().notes.find((item) => item.id === id);
      if (!note) return;

      const normalized = normalizeTags(tags);
      if (
        note.tags.length === normalized.length &&
        note.tags.every((tag, index) => tag === normalized[index])
      ) {
        return;
      }

      set((state) => ({
        notes: state.notes.map((item) =>
          item.id === id ? { ...item, tags: normalized } : item,
        ),
        saveState: state.saveState === "saving" ? "saving" : "idle",
      }));

      scheduleSave(id);
    },

    async saveNote(requestedId) {
      const id = requestedId ?? get().selectedId;
      const note = get().notes.find((item) => item.id === id);
      const vault = get().vault;
      const fs = activeFs;
      if (!note || !vault || !fs) return;

      if (saveTimer !== undefined) {
        window.clearTimeout(saveTimer);
        saveTimer = undefined;
      }
      pendingNoteId = null;

      if (inFlightSave) await inFlightSave;
      const current = get().notes.find((item) => item.id === id);
      if (!current) return;

      set({ saveState: "saving", saveError: null });

      const task = (async () => {
        const updatedAt = Date.now();
        await writeNoteFile(fs, vault.root, { ...current, updatedAt });
        const latest = get().notes.find((item) => item.id === id);
        // 内容或标签在写入途中变了，就不能显示「已保存」；后续防抖会再写一次。
        const stillCurrent = Boolean(
          latest &&
            latest.content === current.content &&
            latest.tags.length === current.tags.length &&
            latest.tags.every((tag, index) => tag === current.tags[index]),
        );
        set((state) => ({
          notes: state.notes.map((item) =>
            item.id === id ? { ...item, updatedAt } : item,
          ),
          saveState: stillCurrent ? "saved" : "saving",
          lastSavedAt: updatedAt,
        }));
      })()
        .catch((error: unknown) => {
          const failure = toVaultError(
            error,
            "WRITE_FAILED",
            "保存笔记失败。",
          );
          set({
            saveState: "error",
            saveError: failure.message,
          });
        })
        .finally(() => {
          inFlightSave = null;
        });

      inFlightSave = task;
      await task;
    },

    async flush() {
      if (saveTimer !== undefined) {
        window.clearTimeout(saveTimer);
        saveTimer = undefined;
      }
      const pending = pendingNoteId;
      pendingNoteId = null;
      if (pending) await get().saveNote(pending);
      if (inFlightSave) await inFlightSave;
    },
  };
});
