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
  const query = useNotesStore((state) => state.query);
  const tagFilter = useNotesStore((state) => state.tagFilter);
  const errors = useNotesStore((state) => state.errors);
  const setQuery = useNotesStore((state) => state.setQuery);
  const setTagFilter = useNotesStore((state) => state.setTagFilter);
  const rescan = useNotesStore((state) => state.rescan);

  const filtered = useMemo(() => {
    const result = searchNotes(notes, query);
    return tagFilter
      ? result.filter((note) => note.tags.includes(tagFilter))
      : result;
  }, [notes, query, tagFilter]);

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
          <IconButton
            label="新建笔记"
            size="sm"
            onClick={() => void createNote()}
          >
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

      {errors.length > 0 ? (
        <div className="mx-3 mb-2 shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-[10px] leading-relaxed text-amber-700 dark:text-amber-300">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertTriangle size={11} className="shrink-0" />
            {errors.length} 个文件读取异常
          </div>
          <p
            className="mt-1 line-clamp-2 opacity-80"
            title={errors
              .map((error) => `${error.path}：${error.message}`)
              .join("\n")}
          >
            {errors[0].path}：{errors[0].message}
          </p>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <ListSkeleton />
        ) : status === "error" ? (
          <EmptyState
            compact
            icon={<AlertTriangle size={16} />}
            title="列表读取失败"
            description="知识库暂时读不出来，可以重新扫描或换库。"
            action={
              <Button size="sm" onClick={() => void rescan()}>
                重新扫描
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            compact
            icon={hasFilter ? <SearchX size={16} /> : <FileText size={16} />}
            title={hasFilter ? "没有匹配的笔记" : "这个知识库还是空的"}
            description={
              hasFilter
                ? "换个关键词，或者清掉标签筛选再看看。"
                : "新建一篇，Wikloom 会立刻在文件夹里写下 .md 文件。"
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
                <Button size="sm" onClick={() => void createNote()}>
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
