import { create } from "zustand";
import type { Note, VaultId } from "../../core/notes/types";
import { mockNotes } from "./data/mockNotes";

export type NotesStatus = "idle" | "loading" | "ready" | "error";

interface NotesState {
  status: NotesStatus;
  notes: Note[];
  selectedId: string;
  vaultId: VaultId;
  query: string;
  tagFilter: string | null;

  init: () => void;
  load: () => void;
  retry: () => void;
  showError: () => void;
  restore: () => void;

  select: (id: string) => void;
  setQuery: (query: string) => void;
  setTagFilter: (tag: string | null) => void;
  setVault: (vaultId: VaultId) => void;

  createNote: () => string;
  updateContent: (id: string, content: string) => void;
  saveNote: (id: string) => void;
}

const LOAD_DELAY = 700;

let loadTimer: number | undefined;

function clearLoadTimer(): void {
  if (loadTimer !== undefined) {
    window.clearTimeout(loadTimer);
    loadTimer = undefined;
  }
}

export const useNotesStore = create<NotesState>((set, get) => ({
  status: "idle",
  notes: mockNotes,
  selectedId: "welcome",
  vaultId: "personal",
  query: "",
  tagFilter: null,

  init() {
    if (get().status !== "idle") return;
    get().load();
  },

  // M1 用 700ms 的假加载演示骨架屏，M2 换成真实读取。
  load() {
    clearLoadTimer();
    set({ status: "loading" });
    loadTimer = window.setTimeout(() => {
      loadTimer = undefined;
      set({ status: "ready" });
    }, LOAD_DELAY);
  },

  retry() {
    get().load();
  },

  showError() {
    clearLoadTimer();
    set({ status: "error" });
  },

  restore() {
    clearLoadTimer();
    set({ status: "ready" });
  },

  select(id) {
    if (!get().notes.some((note) => note.id === id)) return;
    set({ selectedId: id });
  },

  setQuery(query) {
    set({ query });
  },

  setTagFilter(tagFilter) {
    set({ tagFilter });
  },

  setVault(vaultId) {
    const first = get().notes.find((note) => note.vaultId === vaultId);
    set({
      vaultId,
      selectedId: first ? first.id : get().selectedId,
      tagFilter: null,
      query: "",
    });
  },

  createNote() {
    const id = `note-${Date.now().toString(36)}`;
    const timestamp = Date.now();
    const note: Note = {
      id,
      title: "未命名笔记",
      content: "",
      tags: [],
      vaultId: get().vaultId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    set((state) => ({
      notes: [note, ...state.notes],
      selectedId: id,
      status: "ready",
      tagFilter: null,
      query: "",
    }));
    return id;
  },

  updateContent(id, content) {
    set((state) => ({
      notes: state.notes.map((note) =>
        note.id === id ? { ...note, content } : note,
      ),
    }));
  },

  saveNote(id) {
    set((state) => ({
      notes: state.notes.map((note) =>
        note.id === id ? { ...note, updatedAt: Date.now() } : note,
      ),
    }));
  },
}));
