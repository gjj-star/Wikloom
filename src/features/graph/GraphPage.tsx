import { useMemo } from "react";
import { Network } from "lucide-react";
import { useNotesStore } from "../notes/store";
import { createNote } from "../../app/actions";
import { useUiStore } from "../../app/uiStore";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { buildGraph } from "../../core/graph/buildGraph";

/**
 * 全库关系图页面（S2：路由与空态）。
 * 数据来自内存里的 notes，不读磁盘；渲染层在 S4 接入。
 */
export function GraphPage() {
  const notes = useNotesStore((state) => state.notes);
  const navigate = useUiStore((state) => state.navigate);
  const status = useNotesStore((state) => state.status);

  const graph = useMemo(() => buildGraph(notes), [notes]);
  const loading = status === "loading" || status === "idle";

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-6">
        <h1 className="text-[13px] font-semibold text-ink">图谱</h1>
        <span className="ml-auto text-[11px] text-faint">
          {loading
            ? "正在读取知识库…"
            : `${graph.nodes.length} 篇笔记 · ${graph.edges.length} 条链接 · ${graph.missingLinks} 条断链`}
        </span>
      </header>

      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center text-[12px] text-faint">
            正在读取知识库…
          </div>
        ) : graph.nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={<Network size={18} />}
              title="知识库里还没有笔记"
              description="新建第一篇笔记后，这里会显示全库的双向链接关系。"
              action={
                <Button size="sm" variant="primary" onClick={() => void createNote()}>
                  新建笔记
                </Button>
              }
            />
          </div>
        ) : graph.edges.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={<Network size={18} />}
              title="还没有双向链接"
              description={
                graph.missingLinks > 0
                  ? `正文里写 [[标题]] 就能和已有笔记连起来；目前另有 ${graph.missingLinks} 条链接指向不存在的笔记。`
                  : "在正文里写 [[标题]]，或用断链卡片的「创建空白笔记」，就会在这里连成图。"
              }
              action={
                <Button size="sm" onClick={() => navigate("notes")}>
                  回到全部笔记
                </Button>
              }
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-8">
            <div className="flex max-w-[460px] flex-col items-center rounded-xl border border-dashed border-line-strong px-8 py-12 text-center">
              <Network size={20} className="text-faint" />
              <p className="mt-3 text-[13px] font-medium text-ink">
                关系图渲染将在 S4 接入
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                数据层已就绪：{graph.nodes.length} 个节点、{graph.edges.length} 条链接
                {graph.selfLinks > 0 ? `，${graph.selfLinks} 条自链未画` : ""}
                {graph.missingLinks > 0 ? `，${graph.missingLinks} 条断链未画` : ""}。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
