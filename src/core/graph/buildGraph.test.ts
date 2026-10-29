import { describe, expect, it } from "vitest";
import type { Note } from "../notes/types";
import { buildGraph } from "./buildGraph";

let seq = 0;
function note(title: string, content: string, tags: string[] = []): Note {
  seq += 1;
  return {
    id: `note-${seq}`,
    title,
    content,
    tags,
    filePath: `${title}.md`,
    createdAt: seq,
    updatedAt: seq,
    extra: {},
  };
}

describe("buildGraph", () => {
  it("makes one node per note and resolves wiki links (including aliases) as edges", () => {
    const a = note("A", "[[B]] 与 [[C|显示文字]]");
    const b = note("B", "[[A]]", ["标签B"]);
    const c = note("C", "没有链接");

    const graph = buildGraph([a, b, c]);

    expect(graph.nodes.map((node) => node.title).sort()).toEqual(["A", "B", "C"]);
    expect(graph.nodes.find((node) => node.id === b.id)?.tags).toEqual(["标签B"]);
    expect(graph.edges).toHaveLength(3);
    expect(graph.edges).toContainEqual({ source: a.id, target: b.id, linkCount: 1 });
    expect(graph.edges).toContainEqual({ source: a.id, target: c.id, linkCount: 1 });
    expect(graph.edges).toContainEqual({ source: b.id, target: a.id, linkCount: 1 });
    expect(graph.missingLinks).toBe(0);
    expect(graph.selfLinks).toBe(0);

    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    expect(byId.get(a.id)?.degree).toBe(3);
    expect(byId.get(b.id)?.degree).toBe(2);
    expect(byId.get(c.id)?.degree).toBe(1);
  });

  it("merges repeated links between the same pair and keeps a link count", () => {
    const a = note("A", "[[B]] [[B]] [[B]]");
    const b = note("B", "");

    const graph = buildGraph([a, b]);

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({ source: a.id, target: b.id, linkCount: 3 });
    expect(graph.nodes.every((node) => node.degree === 1)).toBe(true);
  });

  it("counts self links without drawing edges", () => {
    const a = note("A", "[[A]] 和 [[A|自己]]");

    const graph = buildGraph([a]);

    expect(graph.edges).toHaveLength(0);
    expect(graph.selfLinks).toBe(2);
    expect(graph.nodes[0].degree).toBe(0);
  });

  it("counts unresolved links but ignores wiki syntax inside code", () => {
    const a = note(
      "A",
      ["`[[行内代码]]`", "", "```", "[[围栏代码]]", "```", "", "[[不存在的笔记]]"].join("\n"),
    );

    const graph = buildGraph([a]);

    expect(graph.edges).toHaveLength(0);
    expect(graph.missingLinks).toBe(1);
    expect(graph.nodes[0].degree).toBe(0);
  });

  it("resolves titles case-insensitively", () => {
    const a = note("A", "[[target]]");
    const target = note("Target", "");

    const graph = buildGraph([a, target]);

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].target).toBe(target.id);
    expect(graph.missingLinks).toBe(0);
  });

  it("connects only the first note when two notes share a title", () => {
    const source = note("来源", "[[同名]]");
    const first = note("同名", "");
    const second = note("同名", "");

    const graph = buildGraph([source, first, second]);

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].target).toBe(first.id);
    expect(graph.nodes.find((node) => node.id === second.id)?.degree).toBe(0);
  });

  it("keeps both directions as separate edges", () => {
    const a = note("A", "[[B]]");
    const b = note("B", "[[A]]");

    const graph = buildGraph([a, b]);

    expect(graph.edges).toHaveLength(2);
    expect(graph.nodes.every((node) => node.degree === 2)).toBe(true);
  });

  it("handles 1000 notes and 5000 edges within a reasonable time", () => {
    const notes: Note[] = [];
    for (let index = 0; index < 1000; index += 1) {
      const links = Array.from({ length: 5 }, (_unused, offset) => {
        const target = (index + offset + 1) % 1000;
        return `[[N${target}]]`;
      });
      notes.push(note(`N${index}`, links.join(" ")));
    }

    const started = Date.now();
    const graph = buildGraph(notes);
    const elapsed = Date.now() - started;

    expect(graph.nodes).toHaveLength(1000);
    expect(graph.edges).toHaveLength(5000);
    expect(graph.missingLinks).toBe(0);
    expect(graph.selfLinks).toBe(0);
    expect(graph.nodes.every((node) => node.degree === 10)).toBe(true);
    expect(elapsed).toBeLessThan(3000);
  });
});
