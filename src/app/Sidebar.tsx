import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronsUpDown,
  Library,
  Moon,
  Plus,
  Scissors,
  Settings,
  Sun,
  Tags as TagsIcon,
} from "lucide-react";
import { cn } from "../ui/cn";
import { modKey } from "../core/platform";
import { IconButton } from "../ui/IconButton";
import { Kbd } from "../ui/Kbd";
import { createNote, openAllNotes } from "./actions";
import { useUiStore } from "./uiStore";
import { useNotesStore } from "../features/notes/store";
import { getVault, vaults } from "../features/notes/data/vaults";

function NavItem({
  icon,
  label,
  count,
  badge,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  count?: number;
  badge?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-[7px] text-[12.5px] transition-colors",
        active
          ? "bg-accent-soft font-medium text-ink"
          : "text-muted hover:bg-hover hover:text-ink",
      )}
    >
      <span className={cn("shrink-0", active ? "text-accent" : "text-faint")}>
        {icon}
      </span>
      <span className="truncate">{label}</span>
      {badge ? (
        <span className="ml-auto rounded bg-hover px-1 py-0.5 text-[9px] uppercase tracking-wide text-faint">
          {badge}
        </span>
      ) : typeof count === "number" ? (
        <span className="ml-auto text-[10.5px] tabular-nums text-faint">
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function Sidebar() {
  const route = useUiStore((state) => state.route);
  const navigate = useUiStore((state) => state.navigate);
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const showToast = useUiStore((state) => state.showToast);

  const notes = useNotesStore((state) => state.notes);
  const vaultId = useNotesStore((state) => state.vaultId);
  const setVault = useNotesStore((state) => state.setVault);

  const [vaultOpen, setVaultOpen] = useState(false);
  const vaultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!vaultOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!vaultRef.current?.contains(event.target as Node)) {
        setVaultOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [vaultOpen]);

  const vault = getVault(vaultId);
  const vaultNotes = notes.filter((note) => note.vaultId === vaultId);
  const tagCount = new Set(vaultNotes.flatMap((note) => note.tags)).size;

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-accent font-serif text-[14px] font-semibold text-accent-ink shadow-sm">
          W
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold tracking-tight text-ink">
            Wikloom
          </div>
          <div className="text-[9px] uppercase tracking-[0.16em] text-faint">
            local knowledge
          </div>
        </div>
      </div>

      <div className="px-3 pt-1">
        <button
          type="button"
          onClick={() => createNote()}
          title={`新建笔记（${modKey}+N；浏览器会保留该组合键，可直接点按）`}
          className="flex h-8 w-full items-center gap-2 rounded-lg border border-line bg-card px-2.5 text-[11.5px] text-muted shadow-[var(--c-shadow-soft)] transition-colors hover:border-line-strong hover:text-ink"
        >
          <Plus size={14} className="text-accent" />
          <span>新建笔记</span>
          <span className="ml-auto flex items-center gap-1">
            <Kbd>{modKey}</Kbd>
            <Kbd>N</Kbd>
          </span>
        </button>
      </div>

      <nav className="mt-5 flex-1 px-2">
        <div className="mb-1.5 px-2 text-[9.5px] font-medium uppercase tracking-[0.14em] text-faint">
          工作区
        </div>
        <NavItem
          icon={<Library size={15} />}
          label="全部笔记"
          count={vaultNotes.length}
          active={route === "notes"}
          onClick={openAllNotes}
        />
        <NavItem
          icon={<TagsIcon size={15} />}
          label="标签"
          count={tagCount}
          active={route === "tags"}
          onClick={() => navigate("tags")}
        />
        <NavItem
          icon={<Scissors size={15} />}
          label="剪藏"
          badge="M3"
          active={route === "clipper"}
          onClick={() => navigate("clipper")}
        />

      </nav>

      <div ref={vaultRef} className="relative px-2">
        <button
          type="button"
          onClick={() => setVaultOpen((open) => !open)}
          aria-expanded={vaultOpen}
          aria-haspopup="listbox"
          className="flex w-full items-center gap-2 rounded-lg border border-line bg-card px-2 py-1.5 text-left transition-colors hover:border-line-strong"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-[10px] font-semibold text-accent">
            {vault.name.slice(0, 1)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11.5px] font-medium text-ink">
              {vault.name}
            </span>
            <span className="block text-[9.5px] text-faint">
              {vaultNotes.length} 篇笔记
            </span>
          </span>
          <ChevronsUpDown size={13} className="shrink-0 text-faint" />
        </button>

        {vaultOpen ? (
          <div
            role="listbox"
            aria-label="切换知识库"
            className="animate-rise absolute bottom-full left-2 right-2 mb-1.5 overflow-hidden rounded-xl border border-line bg-card p-1 shadow-[var(--c-shadow)]"
          >
            {vaults.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={item.id === vaultId}
                onClick={() => {
                  setVault(item.id);
                  setVaultOpen(false);
                  showToast(`已切换到「${item.name}」`);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-hover",
                  item.id === vaultId && "bg-accent-soft",
                )}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-hover text-[9px] font-semibold text-muted">
                  {item.name.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11.5px] text-ink">
                    {item.name}
                  </span>
                  <span className="block text-[9.5px] text-faint">
                    {item.description}
                  </span>
                </span>
                {item.id === vaultId ? (
                  <Check size={13} className="shrink-0 text-accent" />
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex items-center gap-1 px-2 pb-2.5">
        <div className="min-w-0 flex-1">
          <NavItem
            icon={<Settings size={15} />}
            label="设置"
            active={route === "settings"}
            onClick={() => navigate("settings")}
          />
        </div>
        <IconButton
          label={theme === "dark" ? "切换到浅色主题" : "切换到深色主题"}
          size="sm"
          onClick={toggleTheme}
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </IconButton>
      </div>
    </aside>
  );
}
