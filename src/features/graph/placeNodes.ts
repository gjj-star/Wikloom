import type { GraphData } from "../../core/graph/buildGraph";

export interface GraphPoint {
  x: number;
  y: number;
}

export interface PlanPositionsInput {
  graph: GraphData;
  /** 上一次已经摆放好的坐标，按 note.id 索引（cytoscape model 坐标）。 */
  previous: Map<string, GraphPoint>;
  /** 视口中心，必须是 model 坐标：调用方用 (像素中心 − pan) / zoom 换算。 */
  center: GraphPoint;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * 计算下一次渲染的节点坐标：已存在节点冻结，只给新节点找位置。
 *
 * - 已有 id：原样返回 previous 的坐标，绝不重排（图页面内不漂移）。
 * - 新节点：优先放在「已定位邻居」的平均位置；没有邻居则围绕 center（model 坐标）按黄金角散开，
 *   避免多个孤立新节点叠在同一点、也避免把像素坐标当 model 坐标导致落到视口外。
 * - 已经从图里消失的 id 丢弃。
 */
export function planNodePositions({
  graph,
  previous,
  center,
}: PlanPositionsInput): Map<string, GraphPoint> {
  const positions = new Map<string, GraphPoint>();

  const neighbors = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!neighbors.has(edge.source)) neighbors.set(edge.source, []);
    if (!neighbors.has(edge.target)) neighbors.set(edge.target, []);
    neighbors.get(edge.source)!.push(edge.target);
    neighbors.get(edge.target)!.push(edge.source);
  }

  let newIndex = 0;

  for (const node of graph.nodes) {
    const kept = previous.get(node.id);
    if (kept) {
      positions.set(node.id, { x: kept.x, y: kept.y });
      continue;
    }

    const placedNeighbors = (neighbors.get(node.id) ?? [])
      .map((id) => positions.get(id))
      .filter((point): point is GraphPoint => Boolean(point));

    if (placedNeighbors.length > 0) {
      const sum = placedNeighbors.reduce(
        (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
        { x: 0, y: 0 },
      );
      const average = {
        x: sum.x / placedNeighbors.length,
        y: sum.y / placedNeighbors.length,
      };
      // 只有一个邻居时中点就是邻居本身，会完全重叠；错开一个固定半径。
      const overlapsNeighbor = placedNeighbors.some(
        (point) => Math.hypot(point.x - average.x, point.y - average.y) < 1,
      );
      if (!overlapsNeighbor) {
        positions.set(node.id, average);
        continue;
      }
      const angle = newIndex * GOLDEN_ANGLE;
      positions.set(node.id, {
        x: average.x + Math.cos(angle) * 36,
        y: average.y + Math.sin(angle) * 36,
      });
      newIndex += 1;
      continue;
    }

    const radius = 40 + 22 * Math.sqrt(newIndex);
    const angle = newIndex * GOLDEN_ANGLE;
    positions.set(node.id, {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    });
    newIndex += 1;
  }

  return positions;
}
