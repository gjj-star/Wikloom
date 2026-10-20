import { useMemo } from "react";
import {
  AlertTriangle,
  FileText,
  Plus,
  Search,
  SearchX,
  X,
} from "lucide-react";
import type { Note } from "../../core/notes/types";
import { searchNotes } from "../../core/search/searchNotes";
import { excerpt } from "../../core/text/plainText";
import { relativeTime } from "../../core/time/relativeTime";
import { createNote, openNote } from "../../app/actions";
import { Button } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { EmptyState } from "../../ui/EmptyState";
import { IconButton } from "../../ui/IconButton";
import { Skeleton } from "../../ui/Skeleton";
import { Tag } from "../../ui/Tag";
import { useNotesStore } from "./store";

function NoteListItem({ note, selected }: { note: Note; selected: boolean }) {
  const summary = excerpt(note.content, 96);

  return (
    <button
      type="button"
      onClick={() => openNote(note.id)}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group relative block w-full border-b border-line/70 px-4 py-3 text-left transition-colors",
        selected ? "bg-accent-soft" : "hover:bg-hover",
      )}
    >
      {selected ? (
        <span className="absolute inset-y-2.5 left-0 w-[2px] rounded-full bg-accent" />
      ) : null}
      <h3 className="truncate text-[13px] font-medium text-ink">
        {note.title}
      </h3>
      <p className="mt-1 line-clamp-2 text-[11.5px] leading-[1.65] text-muted">
        {summary || "空白笔记"}
      </p>
      <div className="mt-2 flex items-center gap-1.5 overflow-hidden text-[10.5px] text-faint">
        <span className="shrink-0 tabular-nums">
          {relativeTime(note.updatedAt)}
        </span>
        {note.tags.length > 0 ? (
          <span className="h-2.5 w-px shrink-0 bg-line-strong" />
        ) : null}
        <span className="flex gap-1 overflow-hidden">
          {note.tags.slice(0, 2).map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </span>
      </div>
    </button>
  );
}

function ListSkeleton() {
  return (
    <div>
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="space-y-2 border-b border-line/60 px-4 py-3.5"
        >
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-2.5 w-10" />
            <Skeleton className="h-2.5 w-8" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function NoteList() {
  const notes = useNotesStore((state) => state.notes);
  const status = useNotesStore((state) => state.status);
  const selectedId = useNotesStore((state) => state.selectedId);
  const vaultId = useNotesStore((state) => state.vaultId);
  const query = useNotesStore((state) => state.query);
  const tagFilter = useNotesStore((state) => state.tagFilter);
  const setQuery = useNotesStore((state) => state.setQuery);
  const setTagFilter = useNotesStore((state) => state.setTagFilter);
  const retry = useNotesStore((state) => state.retry);

  const vaultNotes = useMemo(
    () => notes.filter((note) => note.vaultId === vaultId),
    [notes, vaultId],
  );

  const filtered = useMemo(() => {
    const result = searchNotes(vaultNotes, query);
    return tagFilter
      ? result.filter((note) => note.tags.includes(tagFilter))
      : result;
  }, [vaultNotes, query, tagFilter]);

  const loading = status === "loading" || status === "idle";
  const hasFilter = Boolean(query.trim() || tagFilter);

  return (
    <section className="flex w-[320px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="text-[13px] font-semibold text-ink">全部笔记</h2>
        <span className="rounded-full bg-hover px-1.5 py-0.5 text-[10px] tabular-nums text-muted">
          {filtered.length}
        </span>
        <div className="ml-auto">
          <IconButton label="新建笔记" size="sm" onClick={() => createNote()}>
            <Plus size={15} />
          </IconButton>
        </div>
      </div>

      <div className="shrink-0 px-3 py-2">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、正文、标签…"
            aria-label="搜索笔记"
            className="h-8 w-full rounded-lg border border-transparent bg-hover pl-8 pr-7 text-[12px] text-ink placeholder:text-faint focus:border-line focus:bg-card focus:outline-none focus:ring-2 focus:ring-accent/10"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="清空搜索"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-ink"
            >
              <X size={12} />
            </button>
          ) : null}
        </div>

        {tagFilter ? (
          <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-muted">
            <span>标签筛选</span>
            <Tag tone="accent">{tagFilter}</Tag>
            <button
              type="button"
              onClick={() => setTagFilter(null)}
              className="ml-auto inline-flex items-center gap-0.5 text-faint hover:text-ink"
            >
              清除 <X size={10} />
            </button>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <ListSkeleton />
        ) : status === "error" ? (
          <EmptyState
            compact
            icon={<AlertTriangle size={16} />}
            title="列表读取失败"
            description="知识库暂时读不出来。演示模式下可在设置里恢复。"
            action={
              <Button size="sm" onClick={retry}>
                重试
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            compact
            icon={hasFilter ? <SearchX size={16} /> : <FileText size={16} />}
            title={hasFilter ? "没有匹配的笔记" : "还没有笔记"}
            description={
              hasFilter
                ? "换个关键词，或者清掉标签筛选再看看。"
                : "新建一篇，从第一行字开始。"
            }
            action={
              hasFilter ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setTagFilter(null);
                  }}
                >
                  清除筛选
                </Button>
              ) : (
                <Button size="sm" onClick={() => createNote()}>
                  新建笔记
                </Button>
              )
            }
          />
        ) : (
          filtered.map((note) => (
            <NoteListItem
              key={note.id}
              note={note}
              selected={note.id === selectedId}
            />
          ))
        )}
      </div>
    </section>
  );
}
