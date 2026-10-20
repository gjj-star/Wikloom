import { useMemo } from "react";
import { ChevronRight, Hash, Tags as TagsIcon } from "lucide-react";
import { selectTag } from "../../app/actions";
import { EmptyState } from "../../ui/EmptyState";
import { Skeleton } from "../../ui/Skeleton";
import { useNotesStore } from "./store";

export function TagsPage() {
  const notes = useNotesStore((state) => state.notes);
  const status = useNotesStore((state) => state.status);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of notes) {
      for (const tag of note.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"),
    );
  }, [notes]);

  const loading = status === "loading" || status === "idle";

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-6">
        <h1 className="text-[13px] font-semibold text-ink">标签</h1>
        <span className="text-[11px] text-faint">{notes.length} 篇笔记</span>
        <span className="ml-auto text-[11px] tabular-nums text-faint">
          {tags.length} 个标签
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[860px] px-8 py-8">
          <p className="max-w-[560px] text-[12px] leading-relaxed text-muted">
            标签是横向索引，链接是纵向索引。点一个标签，会回到笔记列表并自动加上筛选。
          </p>

          <div className="mt-5">
            {loading ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-[64px] rounded-xl" />
                ))}
              </div>
            ) : tags.length === 0 ? (
              <EmptyState
                icon={<TagsIcon size={18} />}
                title="还没有标签"
                description="在笔记的 frontmatter 里加上 tags，它们会汇总到这里。"
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {tags.map(([tag, count]) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => selectTag(tag)}
                    className="group flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 text-left transition-colors hover:border-line-strong hover:bg-hover"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                      <Hash size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">
                        {tag}
                      </span>
                      <span className="block text-[10.5px] text-faint">
                        {count} 篇笔记
                      </span>
                    </span>
                    <ChevronRight
                      size={14}
                      className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
