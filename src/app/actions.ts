import { displayNameFromRoot } from "../core/paths";
import { isTauriRuntime } from "../core/fs/runtime";
import { seedDemoVault } from "../features/notes/data/demoVaults";
import { useNotesStore } from "../features/notes/store";
import { useUiStore } from "./uiStore";

/** 打开一条笔记；跨库切换已经不在这里处理。 */
export function openNote(
  noteId: string,
  options?: { mode?: "read" | "edit" },
): void {
  const notesStore = useNotesStore.getState();
  if (!notesStore.notes.some((item) => item.id === noteId)) return;

  notesStore.selectNote(noteId);
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

export async function createNote(): Promise<string | null> {
  const id = await useNotesStore.getState().createNote();
  const ui = useUiStore.getState();
  if (!id) {
    ui.showToast(
      useNotesStore.getState().saveError ?? "新建笔记失败。",
      "error",
    );
    return null;
  }
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

export async function copyText(
  text: string,
  message = "已复制",
): Promise<void> {
  const ui = useUiStore.getState();
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();
      if (!copied) throw new Error("copy command failed");
    }
    ui.showToast(message, "success");
  } catch {
    ui.showToast("复制失败，剪贴板不可用。", "error");
  }
}

export function selectTag(tag: string): void {
  useNotesStore.getState().setTagFilter(tag);
  useUiStore.getState().navigate("notes");
}

export async function saveActiveNote(): Promise<void> {
  const notesStore = useNotesStore.getState();
  await notesStore.saveNote(notesStore.selectedId);
  const state = useNotesStore.getState();
  const ui = useUiStore.getState();
  if (state.saveState === "error") {
    ui.showToast(state.saveError ?? "保存失败。", "error");
  } else {
    ui.showToast("已保存到磁盘", "success");
  }
}

export function openVaultPicker(): void {
  useUiStore.getState().openVaultPicker();
}

/** 命令面板入口：跳设置并定位到自定义模式面板。 */
export function openCustomModesSettings(): void {
  const ui = useUiStore.getState();
  ui.closePalette();
  ui.navigate("settings");
  window.setTimeout(() => {
    document
      .getElementById("custom-modes")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 120);
}

/** 浏览器/测试环境：打开内置内存知识库。 */
export async function chooseDemoVault(id: string): Promise<boolean> {
  const vault = seedDemoVault(id);
  if (!vault) return false;

  await useNotesStore.getState().openVault(vault);
  const ui = useUiStore.getState();
  if (useNotesStore.getState().status === "ready") {
    ui.navigate("notes");
    ui.closeVaultPicker();
    return true;
  }
  return false;
}

/** 桌面环境：目录选择与 fs scope 放行都在 Rust 里完成，前端只拿结果。 */
export async function chooseTauriVault(): Promise<boolean> {
  if (!isTauriRuntime()) return false;

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const selected = await invoke<string | null>("pick_vault");
    if (typeof selected !== "string" || !selected) return false;

    await useNotesStore.getState().openVault({
      kind: "tauri",
      root: selected,
      name: displayNameFromRoot(selected),
    });

    const ui = useUiStore.getState();
    if (useNotesStore.getState().status === "ready") {
      ui.navigate("notes");
      ui.closeVaultPicker();
      return true;
    }
    return false;
  } catch (error) {
    useUiStore
      .getState()
      .showToast(
        `选择文件夹失败：${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    return false;
  }
}
