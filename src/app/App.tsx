import { useEffect } from "react";
import { createNote } from "./actions";
import { readRoute } from "./router";
import { isTauriRuntime } from "../core/fs/runtime";
import { Shell } from "./Shell";
import { useUiStore } from "./uiStore";
import { VaultPicker } from "./VaultPicker";
import { BootScreen } from "../features/notes/BootScreen";
import { Onboarding } from "../features/notes/Onboarding";
import { VaultErrorScreen } from "../features/notes/VaultErrorScreen";
import { useNotesStore } from "../features/notes/store";
import { Toaster } from "../ui/Toaster";

export function App() {
  const theme = useUiStore((state) => state.theme);
  const paletteOpen = useUiStore((state) => state.paletteOpen);
  const backlinksOpen = useUiStore((state) => state.backlinksOpen);
  const setRoute = useUiStore((state) => state.setRoute);

  const status = useNotesStore((state) => state.status);
  const noteCount = useNotesStore((state) => state.notes.length);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#161613" : "#f7f4ee");
  }, [theme]);

  useEffect(() => {
    void useNotesStore.getState().bootstrap();
  }, []);

  useEffect(() => {
    const sync = () => setRoute(readRoute());
    window.addEventListener("hashchange", sync);
    if (!window.location.hash) {
      window.history.replaceState(null, "", "#/notes");
    } else {
      sync();
    }
    return () => window.removeEventListener("hashchange", sync);
  }, [setRoute]);

  useEffect(() => {
    const flush = () => {
      void useNotesStore.getState().flush();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const current = getCurrentWindow();
      const stop = await current.onCloseRequested(async (event) => {
        // 先拦住关闭，把 800ms 防抖窗口里的最后几个字刷盘，再真正关窗。
        event.preventDefault();
        try {
          await useNotesStore.getState().flush();
        } finally {
          try {
            await current.destroy();
          } catch {
            // 窗口可能已经被系统关闭
          }
        }
      });

      if (disposed) stop();
      else unlisten = stop;
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const notesStore = useNotesStore.getState();

      if (!mod) {
        if (event.key === "Escape" && !paletteOpen && backlinksOpen) {
          useUiStore.getState().setBacklinksOpen(false);
        }
        return;
      }

      if (notesStore.status !== "ready") return;

      if (key === "k") {
        event.preventDefault();
        useUiStore.getState().togglePalette();
        return;
      }
      if (key === "n") {
        event.preventDefault();
        void createNote();
        return;
      }
      if (key === "e") {
        if (useUiStore.getState().route !== "notes") return;
        event.preventDefault();
        useUiStore.getState().toggleMode();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paletteOpen, backlinksOpen]);

  let content;
  if (status === "idle" || (status === "loading" && noteCount === 0)) {
    content = <BootScreen />;
  } else if (status === "onboarding") {
    content = <Onboarding />;
  } else if (status === "error") {
    content = <VaultErrorScreen />;
  } else {
    content = <Shell />;
  }

  return (
    <>
      {content}
      <VaultPicker />
      <Toaster />
    </>
  );
}
