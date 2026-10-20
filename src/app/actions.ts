import { useNotesStore } from "../features/notes/store";
import { useUiStore } from "./uiStore";

/** 打开一条笔记；跨知识库时先切换知识库。 */
export function openNote(
  noteId: string,
  options?: { mode?: "read" | "edit" },
): void {
  const notesStore = useNotesStore.getState();
  const note = notesStore.notes.find((item) => item.id === noteId);
  if (!note) return;

  if (note.vaultId !== notesStore.vaultId) notesStore.setVault(note.vaultId);
  notesStore.select(noteId);

  const ui = useUiStore.getState();
  ui.navigate("notes");
  if (options?.mode) ui.setMode(options.mode);
  ui.closePalette();
}

export function openNoteByTitle(title: string): boolean {
  const note = useNotesStore
    .getState()
    .notes.find(
      (item) => item.title.toLowerCase() === title.trim().toLowerCase(),
    );
  if (!note) return false;
  openNote(note.id, { mode: "read" });
  return true;
}

export function createNote(): string {
  const id = useNotesStore.getState().createNote();
  const ui = useUiStore.getState();
  ui.navigate("notes");
  ui.setMode("edit");
  ui.closePalette();
  ui.showToast("已新建笔记", "success");
  return id;
}

export function openAllNotes(): void {
  const notesStore = useNotesStore.getState();
  notesStore.setQuery("");
  notesStore.setTagFilter(null);
  useUiStore.getState().navigate("notes");
}

export function selectTag(tag: string): void {
  useNotesStore.getState().setTagFilter(tag);
  useUiStore.getState().navigate("notes");
}

export function saveActiveNote(): void {
  const notesStore = useNotesStore.getState();
  const ui = useUiStore.getState();
  notesStore.saveNote(notesStore.selectedId);
  ui.setMode("read");
  ui.showToast("已保存到内存草稿", "success");
}
