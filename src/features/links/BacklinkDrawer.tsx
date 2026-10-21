import {
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { Copy, FileText, Link2, X } from "lucide-react";
import type { Backlink } from "../../core/links/backlinks";
import { getBacklinks } from "../../core/links/backlinks";
import { relativeTime } from "../../core/time/relativeTime";
import { copyText, openNote } from "../../app/actions";
import { useUiStore } from "../../app/uiStore";
import { cn } from "../../ui/cn";
import { openContextMenu } from "../../ui/ContextMenu";
import { EmptyState } from "../../ui/EmptyState";
import { IconButton } from "../../ui/IconButton";
import { useNotesStore } from "../notes/store";
import { LinkPreviewProvider } from "./LinkPreview";
import { useLinkPreview } from "./linkPreviewContext";

type BacklinkTab = "references" | "mentions";

function highlightSnippet(snippet: string, term: string): ReactNode {
  const index = snippet.toLowerCase().indexOf(term.toLowerCase());
  if (index < 0) return snippet;
  return (
    <>
      {snippet.slice(0, index)}
      <mark className="bl-mark">{snippet.slice(index, index + term.length)}</mark>
      {snippet.slice(index + term.length)}
    </>
  );
}

function BacklinkRow({ item, term }: { item: Backlink; term: string }) {
  const linkPreview = useLinkPreview();

  function handleContextMenu(event: ReactMouseEvent<HTMLButtonElement>) {
    openContextMenu(event, [
      {
        label: "复制链接",
        icon: <Copy size={13} />,
        onSelect: () => void copyText(`[[${item.note.title}]]`, "已复制链接"),
      },
      {
        label: "打开",
        icon: <FileText size={13} />,
        onSelect: () => openNote(item.note.id, { mode: "read" }),
      },
    ]);
  }

  return (
    <button
      type="button"
      onClick={() => {
        linkPreview?.closePreview();
        openNote(item.note.id, { mode: "read" });
      }}
      onContextMenu={handleContextMenu}
      onMouseEnter={
        linkPreview
          ? (event) => linkPreview.showPreview(item.note.title, event.currentTarget)
          : undefined
      }
      onMouseLeave={linkPreview?.hidePreview}
      className="group w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-hover"
    >
      <div className="flex items-center gap-1.5">
        <FileText size={12} className="shrink-0 text-faint" />
        <span className="truncate text-[12.5px] font-medium text-ink">
          {item.note.title}
        </span>
        <span className="ml-auto shrink-0 text-[10.5px] tabular-nums text-faint">
          {relativeTime(item.note.updatedAt)}
        </span>
      </div>
      <p className="mt-1 line-clamp-3 text-[11.5px] leading-relaxed text-muted">
        {highlightSnippet(item.snippet, term)}
      </p>
    </button>
  );
}

export function BacklinkDrawer() {
  const open = useUiStore((state) => state.backlinksOpen);
  const setOpen = useUiStore((state) => state.setBacklinksOpen);
  const notes = useNotesStore((state) => state.notes);
  const selectedId = useNotesStore((state) => state.selectedId);
  const [tab, setTab] = useState<BacklinkTab>("references");

  const note = notes.find((item) => item.id === selectedId);
  const groups = useMemo(
    () => (note ? getBacklinks(note, notes) : { references: [], mentions: [] }),
    [note, notes],
  );

  useEffect(() => {
    setTab("references");
  }, [note?.id]);

  const items = tab === "references" ? groups.references : groups.mentions;
  const tabs: Array<{ key: BacklinkTab; label: string; count: number }> = [
    { key: "references", label: "引用", count: groups.references.length },
    { key: "mentions", label: "提及", count: groups.mentions.length },
  ];

  return (
    <LinkPreviewProvider key={`${note?.id ?? ""}:${open ? "open" : "closed"}`}>
      <aside
        aria-label="反向链接"
        inert={!open}
        className={cn(
          "shrink-0 overflow-hidden bg-surface transition-[width] duration-200 ease-out",
          open ? "w-[340px] border-l border-line" : "w-0",
        )}
      >
      <div className="flex h-full w-[340px] flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
          <Link2 size={15} className="text-muted" />
          <h2 className="text-[13px] font-semibold text-ink">反向链接</h2>
          <span className="rounded-full bg-hover px-1.5 py-0.5 text-[10px] tabular-nums text-muted">
            {groups.references.length + groups.mentions.length}
          </span>
          <div className="ml-auto">
            <IconButton
              label="关闭反链面板"
              size="sm"
              onClick={() => setOpen(false)}
            >
              <X size={15} />
            </IconButton>
          </div>
        </header>

        <div className="flex shrink-0 border-b border-line px-2">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              aria-pressed={tab === item.key}
              className={cn(
                "relative flex-1 py-2.5 text-[12px] font-medium transition-colors",
                tab === item.key
                  ? "text-ink"
                  : "text-muted hover:text-ink",
              )}
            >
              {item.label}
              <span className="ml-1 text-[10px] tabular-nums text-faint">
                {item.count}
              </span>
              {tab === item.key ? (
                <span className="absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-accent" />
              ) : null}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {items.length === 0 ? (
            <EmptyState
              compact
              icon={<Link2 size={16} />}
              title={tab === "references" ? "还没有引用" : "还没有提及"}
              description={
                tab === "references"
                  ? `在任意笔记里写 [[${note?.title ?? "标题"}]]，来源就会出现在这里。`
                  : "其他笔记正文里出现这个标题时，会在这里列出。"
              }
            />
          ) : (
            items.map((item) => (
              <BacklinkRow
                key={item.note.id}
                item={item}
                term={note?.title ?? ""}
              />
            ))
          )}
        </div>

        <footer className="shrink-0 border-t border-line px-4 py-3 text-[10.5px] leading-relaxed text-faint">
          引用 = 显式写了 wiki 链接；提及 = 正文提到了标题。
        </footer>
      </div>
      </aside>
    </LinkPreviewProvider>
  );
}
