import { useMemo } from "react";
import { Network } from "lucide-react";
import { useNotesStore } from "../notes/store";
import { createNote, openNote } from "../../app/actions";
import { useUiStore } from "../../app/uiStore";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { buildGraph } from "../../core/graph/buildGraph";
import { GraphCanvas } from "./GraphCanvas";
import { describeEmptyLinks } from "./emptyGraphText";

/**
 * 全库关系图页面：数据来自内存里的 notes，渲染交给 GraphCanvas（cytoscape）。
 * 点击节点打开笔记；悬浮节点高亮直接相连的笔记。
 */
export function GraphPage() {
  const notes = useNotesStore((state) => state.notes);
  const status = useNotesStore((state) => state.status);
  const navigate = useUiStore((state) => state.navigate);
  const openVaultPicker = useUiStore((state) => state.openVaultPicker);
  const theme = useUiStore((state) => state.theme);

  const graph = useMemo(() => buildGraph(notes), [notes]);
  const loading = status === "loading" || status === "idle";

  let content;
  if (loading) {
    content = (
      <div className="flex h-full items-center justify-center text-[12px] text-faint">
        正在读取知识库…
      </div>
    );
  } else if (status === "onboarding") {
    content = (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={<Network size={18} />}
          title="还没有选择知识库"
          description="先选一个文件夹或演示库，图谱才有笔记可显示。"
          action={
            <Button size="sm" variant="primary" onClick={openVaultPicker}>
              选择知识库
            </Button>
          }
        />
      </div>
    );
  } else if (status === "error") {
    content = (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={<Network size={18} />}
          title="知识库读取失败"
          description="回到笔记页修好知识库后再回来看图谱。"
          action={
            <Button size="sm" onClick={() => navigate("notes")}>
              回到笔记页
            </Button>
          }
        />
      </div>
    );
  } else if (graph.nodes.length === 0) {
    content = (
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
    );
  } else if (graph.edges.length === 0) {
    content = (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={<Network size={18} />}
          title="还没有双向链接"
          description={describeEmptyLinks(graph)}
          action={
            <Button size="sm" onClick={() => navigate("notes")}>
              回到全部笔记
            </Button>
          }
        />
      </div>
    );
  } else {
    content = (
      <GraphCanvas
        data={graph}
        theme={theme}
        onOpenNote={(id) => openNote(id, { mode: "read" })}
      />
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-6">
        <h1 className="text-[13px] font-semibold text-ink">图谱</h1>
        <span className="text-[11px] text-faint">
          {loading
            ? ""
            : `${graph.nodes.length} 篇笔记 · ${graph.edges.length} 条链接`}
        </span>
        <span className="ml-auto text-[11px] text-faint">
          {graph.edges.length > 0 ? "悬浮看邻近笔记，点击打开" : ""}
        </span>
      </header>

      <div className="min-h-0 flex-1">{content}</div>
    </div>
  );
}
