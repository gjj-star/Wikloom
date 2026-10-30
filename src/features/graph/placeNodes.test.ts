import { describe, expect, it } from "vitest";
import type { GraphData, GraphEdge, GraphNode } from "../../core/graph/buildGraph";
import { planNodePositions } from "./placeNodes";

function node(id: string): GraphNode {
  return { id, title: id, tags: [], degree: 0 };
}

function edge(source: string, target: string): GraphEdge {
  return { source, target, linkCount: 1 };
}

function graph(nodes: string[], edges: Array<[string, string]> = []): GraphData {
  return {
    nodes: nodes.map(node),
    edges: edges.map(([source, target]) => edge(source, target)),
    missingLinks: 0,
    selfLinks: 0,
  };
}

const viewport = { width: 1000, height: 800 };

describe("planNodePositions", () => {
  it("keeps every existing node exactly where it was", () => {
    const previous = new Map([
      ["a", { x: 10, y: 20 }],
      ["b", { x: 300, y: 400 }],
    ]);

    const positions = planNodePositions({
      graph: graph(["a", "b"], [["a", "b"]]),
      previous,
      viewport,
    });

    expect(positions.get("a")).toEqual({ x: 10, y: 20 });
    expect(positions.get("b")).toEqual({ x: 300, y: 400 });
  });

  it("drops ids that are no longer in the graph", () => {
    const previous = new Map([
      ["a", { x: 1, y: 2 }],
      ["gone", { x: 3, y: 4 }],
    ]);

    const positions = planNodePositions({
      graph: graph(["a"]),
      previous,
      viewport,
    });

    expect(positions.has("a")).toBe(true);
    expect(positions.has("gone")).toBe(false);
  });

  it("places a new node at the average of its positioned neighbors", () => {
    const previous = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 100, y: 200 }],
    ]);

    const positions = planNodePositions({
      graph: graph(["a", "b", "c"], [
        ["a", "c"],
        ["c", "b"],
      ]),
      previous,
      viewport,
    });

    expect(positions.get("c")).toEqual({ x: 50, y: 100 });
  });

  it("offsets a new node from its only neighbor instead of stacking on it", () => {
    const positions = planNodePositions({
      graph: graph(["a", "b"], [["a", "b"]]),
      previous: new Map([["a", { x: 0, y: 0 }]]),
      viewport,
    });

    const point = positions.get("b")!;
    const distance = Math.hypot(point.x - 0, point.y - 0);
    expect(distance).toBeGreaterThan(20);
    expect(distance).toBeLessThan(50);
  });

  it("spreads isolated new nodes around the viewport centre", () => {
    const positions = planNodePositions({
      graph: graph(["a", "b", "c"]),
      previous: new Map(),
      viewport,
    });

    const center = { x: 500, y: 400 };
    const points = ["a", "b", "c"].map((id) => positions.get(id)!);
    for (const point of points) {
      const distance = Math.hypot(point.x - center.x, point.y - center.y);
      expect(distance).toBeGreaterThan(30);
      expect(distance).toBeLessThan(200);
    }
    expect(new Set(points.map((point) => `${point.x}:${point.y}`)).size).toBe(3);
  });
});
