import { useEffect, useRef } from "react";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import type { GraphData } from "../../core/graph/buildGraph";
import { GRAPH_PALETTES } from "./graphTheme";

interface GraphCanvasProps {
  data: GraphData;
  theme: "light" | "dark";
  onOpenNote: (id: string) => void;
}

/**
 * cytoscape 适配层：只吃 GraphData 和「打开笔记」回调。
 * 布局预算按 S3 spike 结论：大图限 cose(numIter=50)，小图用默认迭代；
 * 三个渲染 hint 保持默认关（spike 证明满画质已达标）。
 */
export function GraphCanvas({ data, theme, onOpenNote }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(onOpenNote);
  openRef.current = onOpenNote;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const palette = GRAPH_PALETTES[theme];
    const titleById = new Map(data.nodes.map((node) => [node.id, node.title]));

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
          linkCount: edge.linkCount,
          label: `${titleById.get(edge.source) ?? ""} → ${titleById.get(edge.target) ?? ""}`,
        },
      });
    }

    container.style.position = "relative";
    container.style.backgroundColor = palette.background;

    const tooltip = document.createElement("div");
    Object.assign(tooltip.style, {
      position: "absolute",
      left: "0",
      top: "0",
      padding: "5px 8px",
      borderRadius: "8px",
      border: `1px solid ${palette.line}`,
      background: palette.card,
      color: palette.ink,
      fontSize: "11px",
      lineHeight: "1.35",
      whiteSpace: "nowrap",
      pointerEvents: "none",
      opacity: "0",
      transition: "opacity 80ms ease-out",
      boxShadow: "0 6px 18px rgba(0, 0, 0, 0.16)",
      zIndex: "10",
    });
    container.appendChild(tooltip);

    const cy: Core = cytoscape({
      container,
      elements,
      style: [
        {
          selector: "node",
          style: {
            "background-color": palette.accent,
            width: 12,
            height: 12,
            label: "data(label)",
            color: palette.ink,
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
            "line-color": palette.line,
            "curve-style": "haystack",
            opacity: 0.65,
          },
        },
        {
          selector: "node.gsp-hover",
          style: {
            "background-color": palette.highlight,
            "border-width": 2,
            "border-color": palette.accent,
            width: 18,
            height: 18,
          },
        },
        {
          selector: "node.gsp-neighbor",
          style: { "background-color": palette.accent, width: 14, height: 14 },
        },
        {
          selector: "edge.gsp-edge-hover",
          style: {
            "line-color": palette.accent,
            width: 1.6,
            opacity: 1,
          },
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
      tooltip.style.opacity = "0";
    });

    cy.on("mouseout", "node", () => {
      cy.elements().removeClass("gsp-dim gsp-hover gsp-neighbor");
      delete container.dataset.hoverNode;
    });

    // 边悬浮提示：方向与重复链接数（不画箭头，方向只在这里出现）。
    cy.on("mouseover", "edge", (event) => {
      const edge = event.target;
      edge.addClass("gsp-edge-hover");
      const linkCount = Number(edge.data("linkCount") ?? 1);
      tooltip.textContent =
        linkCount > 1
          ? `${edge.data("label")} · ${linkCount} 条链接`
          : String(edge.data("label") ?? "");
      tooltip.style.opacity = "1";

      const point = edge.renderedMidpoint();
      const width = tooltip.offsetWidth;
      const height = tooltip.offsetHeight;
      const maxLeft = Math.max(8, container.clientWidth - width - 8);
      const maxTop = Math.max(8, container.clientHeight - height - 8);
      tooltip.style.left = `${Math.min(Math.max(8, point.x + 12), maxLeft)}px`;
      tooltip.style.top = `${Math.min(Math.max(8, point.y + 12), maxTop)}px`;
      container.dataset.hoverEdge = edge.id();
    });

    cy.on("mouseout", "edge", (event) => {
      event.target.removeClass("gsp-edge-hover");
      tooltip.style.opacity = "0";
      delete container.dataset.hoverEdge;
    });

    // 调试/自动化用：节点数写进容器，不参与业务逻辑。
    container.dataset.nodeCount = String(data.nodes.length);

    // 布局预算：S3 spike 证明 1000 节点必须限迭代（默认 12.5–13.1s，50 次约 1.5s）。
    // 小图默认迭代很便宜且收敛更好，所以只对超过 200 节点的图设上限。
    const layoutBudget =
      data.nodes.length > 200 ? { numIter: 50 } : {};
    // 小图 fit 后会把标签放得过大，缩放封顶 2.0（放大到 1.4 会让 10 节点图缩成一小团）。
    cy.one("layoutstop", () => {
      if (cy.zoom() > 2.0) {
        cy.zoom(2.0);
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
      tooltip.remove();
    };
  }, [data, theme]);

  return <div ref={containerRef} className="h-full w-full" />;
}
