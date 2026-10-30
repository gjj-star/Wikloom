import { useEffect, useRef } from "react";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import type { GraphData } from "../../core/graph/buildGraph";

interface GraphCanvasProps {
  data: GraphData;
  theme: "light" | "dark";
  onOpenNote: (id: string) => void;
}

/**
 * cytoscape 适配层：只吃 GraphData 和「打开笔记」回调。
 * 布局预算按 S3 spike 结论固定为 cose(numIter=50)，三个渲染 hint 保持默认关。
 */
export function GraphCanvas({ data, theme, onOpenNote }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(onOpenNote);
  openRef.current = onOpenNote;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 主题切换时 CSS 变量可能还没落到容器上，直接按 theme 取同一套色值，避免读到旧值。
    const palette =
      theme === "dark"
        ? {
            accent: "#9db4ff",
            line: "#3d3d35",
            ink: "#e9e5dc",
            background: "#161613",
          }
        : {
            accent: "#3a6ff0",
            line: "#d3cabd",
            ink: "#22211d",
            background: "#f7f4ee",
          };
    const accent = palette.accent;
    const line = palette.line;
    const ink = palette.ink;

    const elements: ElementDefinition[] = [];
    for (const node of data.nodes) {
      elements.push({
        group: "nodes",
        data: { id: node.id, label: node.title, degree: node.degree },
      });
    }
    for (const edge of data.edges) {
      elements.push({
        group: "edges",
        data: {
          id: `${edge.source}->${edge.target}`,
          source: edge.source,
          target: edge.target,
        },
      });
    }

    const cy: Core = cytoscape({
      container,
      elements,
      style: [
        {
          selector: "node",
          style: {
            "background-color": accent,
            width: 12,
            height: 12,
            label: "data(label)",
            color: ink,
            "font-size": 9,
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 4,
            "min-zoomed-font-size": 7,
            "text-opacity": 0.82,
          },
        },
        {
          selector: "edge",
          style: {
            width: 0.6,
            "line-color": line,
            "curve-style": "haystack",
            opacity: 0.65,
          },
        },
        {
          selector: "node.gsp-hover",
          style: {
            "background-color": "#e08a1e",
            "border-width": 2,
            "border-color": accent,
            width: 18,
            height: 18,
          },
        },
        {
          selector: "node.gsp-neighbor",
          style: { "background-color": accent, width: 14, height: 14 },
        },
        {
          selector: ".gsp-dim",
          style: { opacity: 0.12 },
        },
      ],
      layout: { name: "preset" },
      wheelSensitivity: 0.4,
      minZoom: 0.05,
      maxZoom: 4,
      textureOnViewport: false,
      hideEdgesOnViewport: false,
      motionBlur: false,
    });

    cy.on("tap", "node", (event) => {
      openRef.current(event.target.id());
    });

    cy.on("mouseover", "node", (event) => {
      const node = event.target;
      const neighborhood = node.closedNeighborhood();
      cy.elements().difference(neighborhood).addClass("gsp-dim");
      node.addClass("gsp-hover");
      neighborhood.nodes().not(node).addClass("gsp-neighbor");
      container.dataset.hoverNode = node.id();
    });

    cy.on("mouseout", "node", () => {
      cy.elements().removeClass("gsp-dim gsp-hover gsp-neighbor");
      delete container.dataset.hoverNode;
    });

    // 调试/自动化用：节点数写进容器，不参与业务逻辑。
    container.dataset.nodeCount = String(data.nodes.length);

    // 布局预算：S3 spike 证明 1000 节点必须限迭代（默认 12.5–13.1s，50 次约 1.5s）。
    // 小图默认迭代很便宜且收敛更好，所以只对超过 200 节点的图设上限。
    const layoutBudget =
      data.nodes.length > 200 ? { numIter: 50 } : {};
    // 小图 fit 后会把标签放得过大，缩放封顶 1.4。
    cy.one("layoutstop", () => {
      if (cy.zoom() > 1.4) {
        cy.zoom(1.4);
        cy.center();
      }
    });
    cy.layout({
      name: "cose",
      animate: false,
      fit: true,
      padding: 32,
      ...layoutBudget,
    }).run();

    return () => {
      cy.destroy();
    };
  }, [data, theme]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ backgroundColor: theme === "dark" ? "#161613" : "#f7f4ee" }}
    />
  );
}
