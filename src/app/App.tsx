import { useEffect } from "react";
import { createNote } from "./actions";
import { readRoute } from "./router";
import { Shell } from "./Shell";
import { useUiStore } from "./uiStore";
import { useNotesStore } from "../features/notes/store";

export function App() {
  const theme = useUiStore((state) => state.theme);
  const paletteOpen = useUiStore((state) => state.paletteOpen);
  const backlinksOpen = useUiStore((state) => state.backlinksOpen);
  const setRoute = useUiStore((state) => state.setRoute);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#161613" : "#f7f4ee");
  }, [theme]);

  useEffect(() => {
    useNotesStore.getState().init();
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
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (!mod) {
        if (event.key === "Escape" && !paletteOpen && backlinksOpen) {
          useUiStore.getState().setBacklinksOpen(false);
        }
        return;
      }

      if (key === "k") {
        event.preventDefault();
        useUiStore.getState().togglePalette();
        return;
      }
      if (key === "n") {
        event.preventDefault();
        createNote();
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

  return <Shell />;
}
