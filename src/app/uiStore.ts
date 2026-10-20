import { create } from "zustand";
import type { Route } from "./router";

export type Theme = "light" | "dark";
export type EditorMode = "read" | "edit";
export type ProseSize = 15 | 16 | 17 | 18;

export interface ToastMessage {
  id: number;
  text: string;
  tone: "default" | "success" | "error";
}

const THEME_KEY = "wikloom:theme";
const MODE_KEY = "wikloom:mode";
const SIZE_KEY = "wikloom:font-size";

function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function readMode(): EditorMode {
  try {
    return localStorage.getItem(MODE_KEY) === "edit" ? "edit" : "read";
  } catch {
    return "read";
  }
}

function readSize(): ProseSize {
  try {
    const value = Number(localStorage.getItem(SIZE_KEY));
    if (value === 15 || value === 16 || value === 17 || value === 18) return value;
  } catch {
    // localStorage 不可用时用默认值
  }
  return 16;
}

function persist(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 忽略隐私模式下写入失败
  }
}

interface UiState {
  route: Route;
  paletteOpen: boolean;
  generateOpen: boolean;
  inlineActionOpen: boolean;
  backlinksOpen: boolean;
  vaultPickerOpen: boolean;
  theme: Theme;
  mode: EditorMode;
  proseSize: ProseSize;
  toast: ToastMessage | null;

  navigate: (route: Route) => void;
  setRoute: (route: Route) => void;

  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;

  openGenerate: () => void;
  closeGenerate: () => void;

  openInlineAction: () => void;
  closeInlineAction: () => void;

  setBacklinksOpen: (open: boolean) => void;
  toggleBacklinks: () => void;

  openVaultPicker: () => void;
  closeVaultPicker: () => void;
  toggleVaultPicker: () => void;

  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;

  setMode: (mode: EditorMode) => void;
  toggleMode: () => void;

  setProseSize: (size: ProseSize) => void;

  showToast: (text: string, tone?: ToastMessage["tone"]) => void;
  dismissToast: () => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  route: "notes",
  paletteOpen: false,
  generateOpen: false,
  inlineActionOpen: false,
  backlinksOpen: false,
  vaultPickerOpen: false,
  theme: readTheme(),
  mode: readMode(),
  proseSize: readSize(),
  toast: null,

  navigate(route) {
    if (get().route === route) return;
    set({ route });
    try {
      if (window.location.hash !== `#/${route}`) window.location.hash = `/${route}`;
    } catch {
      // 非浏览器环境忽略
    }
  },
  setRoute(route) {
    set({ route });
  },

  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  togglePalette: () => set((state) => ({ paletteOpen: !state.paletteOpen })),

  openGenerate: () => set({ generateOpen: true, paletteOpen: false }),
  closeGenerate: () => set({ generateOpen: false }),

  openInlineAction: () =>
    set({ inlineActionOpen: true, paletteOpen: false }),
  closeInlineAction: () => set({ inlineActionOpen: false }),

  setBacklinksOpen: (open) => set({ backlinksOpen: open }),
  toggleBacklinks: () => set((state) => ({ backlinksOpen: !state.backlinksOpen })),

  openVaultPicker: () => set({ vaultPickerOpen: true }),
  closeVaultPicker: () => set({ vaultPickerOpen: false }),
  toggleVaultPicker: () =>
    set((state) => ({ vaultPickerOpen: !state.vaultPickerOpen })),

  setTheme(theme) {
    set({ theme });
    persist(THEME_KEY, theme);
  },
  toggleTheme() {
    get().setTheme(get().theme === "light" ? "dark" : "light");
  },

  setMode(mode) {
    set({ mode });
    persist(MODE_KEY, mode);
  },
  toggleMode() {
    get().setMode(get().mode === "read" ? "edit" : "read");
  },

  setProseSize(proseSize) {
    set({ proseSize });
    persist(SIZE_KEY, String(proseSize));
  },

  showToast(text, tone = "default") {
    set({ toast: { id: Date.now(), text, tone } });
  },
  dismissToast() {
    set({ toast: null });
  },
}));
