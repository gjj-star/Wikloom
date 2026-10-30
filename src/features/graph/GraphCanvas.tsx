import { useEffect, useRef } from "react";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import type { GraphData } from "../../core/graph/buildGraph";
import { planNodePositions, type GraphPoint } from "./placeNodes";
import { GRAPH_PALETTES, type GraphPalette } from "./graphTheme";

interface GraphCanvasProps {
  data: GraphData;
  theme: "light" | "dark";
  onOpenNote: (id: string) => void;
}

interface ViewportState {
  zoom: number;
  pan: { x: number; y: number };
}

function edgeKey(source: string, target: string): string {
  return `${source}->${target}`;
}

function buildElements(data: GraphData): ElementDefinition[] {
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
        id: edgeKey(edge.source, edge.target),
        source: edge.source,
        target: edge.target,
        linkCount: edge.linkCount,
        label: `${titleById.get(edge.source) ?? ""} → ${titleById.get(edge.target) ?? ""}`,
      },
    });
  }
  return elements;
}

function buildStyles(palette: GraphPalette) {
  return [
    {
      selector: "node",
      style: {
        "background-color": palette.accent,
        width: 12,
        height: 12,
        label: "data(label)",
        color: palette.ink,
        "font-size": 9,
        "text-valign": "bottom" as const,
        "text-halign": "center" as const,
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
        "curve-style": "haystack" as const,
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
  ];
}

function createTooltip(
  container: HTMLElement,
  palette: GraphPalette,
): HTMLDivElement {
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
    // 超长标题最多两行多，横向不溢出画布。
    maxWidth: "240px",
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    pointerEvents: "none",
    opacity: "0",
    transition: "opacity 80ms ease-out",
    boxShadow: "0 6px 18px rgba(0, 0, 0, 0.16)",
    zIndex: "10",
  });
  container.appendChild(tooltip);
  return tooltip;
}

function writeDebugDataset(
  container: HTMLElement,
  cy: Core,
  data: GraphData,
  positions: Map<string, GraphPoint>,
): void {
  container.dataset.graphSignature = `${data.nodes.length}:${data.edges.length}`;
  container.dataset.zoom = cy.zoom().toFixed(3);
  container.dataset.panX = cy.pan().x.toFixed(1);
  container.dataset.panY = cy.pan().y.toFixed(1);
  if (data.nodes.length <= 200) {
    container.dataset.positions = JSON.stringify(
      [...positions.entries()].map(([id, point]) => [
        id,
        Math.round(point.x * 100) / 100,
        Math.round(point.y * 100) / 100,
      ]),
    );
  }
}

/**
 * cytoscape 适配层。
 * - 首次挂载跑一次 cose 布局；之后 data 变化时已有节点坐标冻结、只给新节点定位，不重跑布局。
 * - 主题变化只换样式，不重建实例，缩放/平移保持。
 */
export function GraphCanvas({ data, theme, onOpenNote }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef(onOpenNote);
  const themeRef = useRef(theme);
  openRef.current = onOpenNote;
  themeRef.current = theme;

  const positionsRef = useRef<Map<string, GraphPoint>>(new Map());
  const viewportRef = useRef<ViewportState | null>(null);
  const hasLayoutRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const palette = GRAPH_PALETTES[themeRef.current];
    container.style.position = "relative";
    container.style.backgroundColor = palette.background;

    const previousViewport = viewportRef.current;
    const zoom = previousViewport?.zoom ?? 1;
    const pan = previousViewport?.pan ?? { x: 0, y: 0 };
    // 纯函数吃 model 坐标：像素中心 → (像素中心 − pan) / zoom。
    const center = {
      x: ((container.clientWidth || 800) / 2 - pan.x) / zoom,
      y: ((container.clientHeight || 600) / 2 - pan.y) / zoom,
    };
    const planned = planNodePositions({
      graph: data,
      previous: positionsRef.current,
      center,
    });

    const elements = buildElements(data);
    if (hasLayoutRef.current) {
      for (const element of elements) {
        if (element.group !== "nodes" || !element.data?.id) continue;
        const point = planned.get(String(element.data.id));
        if (point) element.position = { x: point.x, y: point.y };
      }
    }

    const tooltip = createTooltip(container, palette);
    tooltipRef.current = tooltip;

    const cy: Core = cytoscape({
      container,
      elements,
      style: buildStyles(palette),
      layout: { name: "preset" },
      wheelSensitivity: 0.4,
      minZoom: 0.05,
      maxZoom: 4,
      textureOnViewport: false,
      hideEdgesOnViewport: false,
      motionBlur: false,
    });
    cyRef.current = cy;

    const saveState = (): void => {
      const next = new Map<string, GraphPoint>();
      cy.nodes().forEach((node) => {
        const position = node.position();
        next.set(node.id(), { x: position.x, y: position.y });
      });
      positionsRef.current = next;
      viewportRef.current = { zoom: cy.zoom(), pan: cy.pan() };
      writeDebugDataset(container, cy, data, next);
    };

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

    cy.on("dragfree", "node", saveState);
    cy.on("zoom", saveState);
    cy.on("pan", saveState);

    if (!hasLayoutRef.current) {
      const layoutBudget = data.nodes.length > 200 ? { numIter: 50 } : {};
      cy.one("layoutstop", () => {
        // 小图 fit 后会把标签放得过大；大图 fit 后 zoom < 1，不触发。
        if (cy.zoom() > 2.0) {
          cy.zoom(2.0);
          cy.center();
        }
        hasLayoutRef.current = true;
        saveState();
      });
      cy.layout({
        name: "cose",
        animate: false,
        fit: true,
        padding: 32,
        ...layoutBudget,
      }).run();
    } else {
      // 数据变化：坐标冻结（preset 已按 planned 摆好），恢复缩放/平移，不跑布局。
      const previousViewport = viewportRef.current;
      if (previousViewport) {
        cy.zoom(previousViewport.zoom);
        cy.pan(previousViewport.pan);
      }
      saveState();
    }

    return () => {
      saveState();
      cy.destroy();
      tooltip.remove();
      cyRef.current = null;
      tooltipRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    const container = containerRef.current;
    const cy = cyRef.current;
    if (!container || !cy) return;
    const palette = GRAPH_PALETTES[theme];
    cy.style(buildStyles(palette));
    container.style.backgroundColor = palette.background;
    const tooltip = tooltipRef.current;
    if (tooltip) {
      tooltip.style.border = `1px solid ${palette.line}`;
      tooltip.style.background = palette.card;
      tooltip.style.color = palette.ink;
    }
  }, [theme]);

  return <div ref={containerRef} className="h-full w-full" />;
}
