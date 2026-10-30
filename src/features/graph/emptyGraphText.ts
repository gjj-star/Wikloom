import type { GraphData } from "../../core/graph/buildGraph";

/**
 * 「有笔记但没有双向链接」空态的说明文案。
 * 自链和断链都不画边，但用户会以为写了 [[...]] 就算链接，所以要把两种情况说清。
 */
export function describeEmptyLinks(
  graph: Pick<GraphData, "missingLinks" | "selfLinks">,
): string {
  const details: string[] = [];
  if (graph.missingLinks > 0) {
    details.push(`另有 ${graph.missingLinks} 条链接指向不存在的笔记`);
  }
  if (graph.selfLinks > 0) {
    details.push(`${graph.selfLinks} 条链接指向笔记自己，不算双向链接`);
  }
  if (details.length === 0) {
    return "在正文里写 [[其它笔记的标题]]，或用断链卡片的「创建空白笔记」，就会在这里连成图。";
  }
  return `在正文里写 [[其它笔记的标题]] 就会连成图；${details.join("；")}。`;
}
