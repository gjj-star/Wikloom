import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  FileText,
  FolderOpen,
  Link2,
  Moon,
  Pencil,
  Plus,
  Search,
  SearchX,
  Settings,
  Scissors,
  Sparkles,
  Sun,
  Tags as TagsIcon,
} from "lucide-react";
import type { Note } from "../core/notes/types";
import { modKey } from "../core/platform";
import { searchNotes } from "../core/search/searchNotes";
import { relativeTime } from "../core/time/relativeTime";
import { cn } from "../ui/cn";
import { Dialog } from "../ui/Dialog";
import { EmptyState } from "../ui/EmptyState";
import { Kbd } from "../ui/Kbd";
import { createNote, openCustomModesSettings, openNote } from "./actions";
import { useUiStore } from "./uiStore";
import { useNotesStore } from "../features/notes/store";

interface PaletteCommand {
  key: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

type PaletteItem =
  | { kind: "note"; note: Note }
  | { kind: "command"; command: PaletteCommand };

export function CommandPalette() {
  const open = useUiStore((state) => state.paletteOpen);
  const closePalette = useUiStore((state) => state.closePalette);
  const theme = useUiStore((state) => state.theme);
  const mode = useUiStore((state) => state.mode);
  const notes = useNotesStore((state) => state.notes);

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const noteResults = useMemo(() => {
    const base = query.trim()
      ? searchNotes(notes, query)
      : [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
    return base.slice(0, 4);
  }, [notes, query]);

  const commands = useMemo<PaletteCommand[]>(() => {
    return [
      {
        key: "new-note",
        label: "新建笔记",
        hint: `${modKey} N`,
        icon: <Plus size={14} />,
        run: () => {
          void createNote();
        },
      },
      {
        key: "generate-note",
        label: "整篇生成（实验）",
        hint: "AI",
        icon: <Sparkles size={14} />,
        run: () => {
          useUiStore.getState().openGenerate();
        },
      },
      {
        key: "link-note",
        label: "选词建链笔记…",
        hint: "选中文本",
        icon: <Link2 size={14} />,
        run: () => {
          useUiStore.getState().openLinkNote();
        },
      },
      {
        key: "inline-action",
        label: "内联 AI 动作",
        hint: "选中文本",
        icon: <Sparkles size={14} />,
        run: () => {
          useUiStore.getState().openInlineAction();
        },
      },
      {
        key: "custom-modes",
        label: "自定义模式…",
        icon: <Pencil size={14} />,
        run: openCustomModesSettings,
      },
      {
        key: "toggle-mode",
        label: mode === "edit" ? "回到阅读态" : "进入编辑态",
        hint: `${modKey} E`,
        icon: <Pencil size={14} />,
        run: () => {
          const ui = useUiStore.getState();
          ui.toggleMode();
          ui.closePalette();
        },
      },
      {
        key: "toggle-backlinks",
        label: "显示反向链接",
        icon: <Link2 size={14} />,
        run: () => {
          const ui = useUiStore.getState();
          ui.setBacklinksOpen(true);
          ui.closePalette();
        },
      },
      {
        key: "switch-vault",
        label: "切换知识库…",
        icon: <FolderOpen size={14} />,
        run: () => {
          const ui = useUiStore.getState();
          ui.closePalette();
          ui.openVaultPicker();
        },
      },
      {
        key: "open-tags",
        label: "浏览标签",
        icon: <TagsIcon size={14} />,
        run: () => {
          const ui = useUiStore.getState();
          ui.closePalette();
          ui.navigate("tags");
        },
      },
      {
        key: "clip-web",
        label: "剪藏网页…",
        hint: "URL",
        icon: <Scissors size={14} />,
        run: () => {
          useUiStore.getState().openClip();
        },
      },
      {
        key: "toggle-theme",
        label: theme === "dark" ? "切换到浅色主题" : "切换到深色主题",
        icon: theme === "dark" ? <Sun size={14} /> : <Moon size={14} />,
        run: () => {
          const ui = useUiStore.getState();
          ui.toggleTheme();
          ui.closePalette();
        },
      },
      {
        key: "open-settings",
        label: "打开设置",
        icon: <Settings size={14} />,
        run: () => {
          const ui = useUiStore.getState();
          ui.closePalette();
          ui.navigate("settings");
        },
      },
    ];
  }, [mode, theme]);

  const keyword = query.trim().toLowerCase();
  const filteredCommands = keyword
    ? commands.filter(
        (command) =>
          command.label.toLowerCase().includes(keyword) ||
          command.key.includes(keyword),
      )
    : commands;

  const items: PaletteItem[] = [
    ...noteResults.map((note) => ({ kind: "note" as const, note })),
    ...filteredCommands.map((command) => ({
      kind: "command" as const,
      command,
    })),
  ];

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function runItem(item: PaletteItem) {
    if (item.kind === "note") {
      openNote(item.note.id, { mode: "read" });
      return;
    }
    item.command.run();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    // 中文输入法上屏的 Enter 不能当成「打开当前项」
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) =>
        items.length === 0 ? 0 : Math.min(items.length - 1, index + 1),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) runItem(item);
    }
  }

  let cursor = 0;

  return (
    <Dialog open={open} onClose={closePalette} className="max-w-[560px]">
      <div className="flex h-12 items-center gap-2.5 border-b border-line px-4">
        <Search size={15} className="shrink-0 text-faint" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="搜索笔记，或输入命令…"
          aria-label="命令面板搜索"
          className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-faint"
        />
        <Kbd>Esc</Kbd>
      </div>

      <div className="max-h-[500px] overflow-y-auto p-1.5">
        {items.length === 0 ? (
          <EmptyState
            compact
            icon={<SearchX size={16} />}
            title="没有匹配项"
            description="换个关键词，或者按 Esc 关闭。"
          />
        ) : null}

        {noteResults.length > 0 ? (
          <div>
            <div className="px-3 pb-1 pt-2 text-[9.5px] font-medium uppercase tracking-[0.14em] text-faint">
              笔记
            </div>
            {noteResults.map((note) => {
              const index = cursor++;
              const active = index === activeIndex;
              return (
                <button
                  key={note.id}
                  ref={active ? activeRef : undefined}
                  type="button"
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => runItem({ kind: "note", note })}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left",
                    active && "bg-hover",
                  )}
                >
                  <FileText size={14} className="shrink-0 text-faint" />
                  <span className="truncate text-[12.5px] text-ink">
                    {note.title}
                  </span>
                  <span className="ml-auto shrink-0 text-[10px] tabular-nums text-faint">
                    {relativeTime(note.updatedAt)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {filteredCommands.length > 0 ? (
          <div>
            <div className="px-3 pb-1 pt-2.5 text-[9.5px] font-medium uppercase tracking-[0.14em] text-faint">
              命令
            </div>
            {filteredCommands.map((command) => {
              const index = cursor++;
              const active = index === activeIndex;
              return (
                <button
                  key={command.key}
                  ref={active ? activeRef : undefined}
                  type="button"
                  title={
                    command.key === "new-note"
                      ? `浏览器通常会保留 ${modKey}+N，可直接点按执行`
                      : undefined
                  }
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => runItem({ kind: "command", command })}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left",
                    active && "bg-hover",
                  )}
                >
                  <span className="shrink-0 text-faint">{command.icon}</span>
                  <span className="truncate text-[12.5px] text-ink">
                    {command.label}
                  </span>
                  {command.hint ? (
                    <span className="ml-auto shrink-0 text-[10px] text-faint">
                      {command.hint}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[10px] text-faint">
        <span className="inline-flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> 选择
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>↵</Kbd> 打开
        </span>
        <span className="ml-auto">Wikloom 命令面板</span>
      </div>
    </Dialog>
  );
}
