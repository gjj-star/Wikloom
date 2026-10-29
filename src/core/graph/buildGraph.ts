import type { Note } from "../notes/types";
import { createTitleIndex, resolveFromTitleIndex } from "../notes/resolveByTitle";
import { extractWikiLinks } from "../links/wikiLinks";

export interface GraphNode {
  id: string;
  title: string;
  tags: string[];
  /** 去重后的入边 + 出边数量，用于入口提示与节点大小。 */
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  /** 同一对笔记之间的链接条数；重复链接只画一条边。 */
  linkCount: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** 指向不存在笔记的链接数（按出现次数计，不画边）。 */
  missingLinks: number;
  /** 指向笔记自己的链接数（按出现次数计，不画边）。 */
  selfLinks: number;
}

/**
 * 从内存里的 notes 推导全库关系图，不读磁盘、不新增数据源。
 *
 * 规则（见 docs/graph-plan.md §1）：
 * - 每条笔记一个节点，孤立笔记也保留；
 * - `[[标题]]` / `[[标题|别名]]` 按标题解析成有向边，解析规则与点击链接一致
 *   （大小写不敏感、取第一个匹配）；
 * - 同一对笔记的重复链接合并成一条边，只累加 linkCount；
 * - 自链接与断链不画边，只计数；
 * - 代码块与行内代码里的 `[[ ]]` 由 extractWikiLinks 跳过，不产生边。
 */
export function buildGraph(notes: Note[]): GraphData {
  const nodes: GraphNode[] = notes.map((note) => ({
    id: note.id,
    title: note.title,
    tags: note.tags,
    degree: 0,
  }));

  const byTitle = createTitleIndex(notes);
  const edges: GraphEdge[] = [];
  const edgeByPair = new Map<string, GraphEdge>();
  let missingLinks = 0;
  let selfLinks = 0;

  for (const note of notes) {
    for (const link of extractWikiLinks(note.content)) {
      const target = resolveFromTitleIndex(byTitle, link.target);
      if (!target) {
        missingLinks += 1;
        continue;
      }
      if (target.id === note.id) {
        selfLinks += 1;
        continue;
      }

      const key = `${note.id}\u0000${target.id}`;
      const existing = edgeByPair.get(key);
      if (existing) {
        existing.linkCount += 1;
        continue;
      }

      const edge: GraphEdge = {
        source: note.id,
        target: target.id,
        linkCount: 1,
      };
      edgeByPair.set(key, edge);
      edges.push(edge);
    }
  }

  const degreeById = new Map<string, number>();
  for (const edge of edges) {
    degreeById.set(edge.source, (degreeById.get(edge.source) ?? 0) + 1);
    degreeById.set(edge.target, (degreeById.get(edge.target) ?? 0) + 1);
  }
  for (const node of nodes) {
    node.degree = degreeById.get(node.id) ?? 0;
  }

  return { nodes, edges, missingLinks, selfLinks };
}
