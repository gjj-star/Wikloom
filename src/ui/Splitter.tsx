import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "./cn";
import {
  LAYOUT_RANGES,
  clampPaneWidth,
  limitDragWidth,
  useLayoutStore,
  type LayoutWidths,
  type PaneKey,
} from "../app/layoutStore";

/** 键盘 ←/→ 每次调整的宽度。 */
const KEYBOARD_STEP = 16;

interface SplitterProps {
  pane: PaneKey;
  /** 无障碍名称，例如「调整侧栏宽度」。 */
  label: string;
  /** 反链抽屉是否打开；决定拖动上限里抽屉占多少宽度。 */
  drawerOpen?: boolean;
  /**
   * 这一栏往哪个方向变宽：侧栏/笔记列表的分隔条在右缘（向右拖变宽），
   * 反链抽屉的分隔条在左缘（向左拖变宽）。
   */
  growDirection?: "right" | "left";
}

interface DragState {
  pointerId: number;
  startX: number;
  startWidth: number;
  latestX: number;
  frame: number | null;
  drawerOpen: boolean;
}

function readWidths(): LayoutWidths {
  const { sidebar, noteList, backlinks } = useLayoutStore.getState();
  return { sidebar, noteList, backlinks };
}

/**
 * 栏间分隔条：6px 命中区，视觉上 1px 竖线。
 * 拖动用 pointer capture + rAF 合并；松手/取消才写 localStorage；
 * 双击恢复该栏默认宽度；←/→ 调 16px，Home/End 到端点。
 */
export function Splitter({
  pane,
  label,
  drawerOpen = false,
  growDirection = "right",
}: SplitterProps) {
  const width = useLayoutStore((state) => state[pane]);
  const setWidth = useLayoutStore((state) => state.setWidth);
  const resetWidth = useLayoutStore((state) => state.resetWidth);
  const persist = useLayoutStore((state) => state.persist);

  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const drawerOpenRef = useRef(drawerOpen);
  // 分隔条在栏的左缘时，指针往左移才是变宽。
  const growSign = growDirection === "left" ? -1 : 1;

  useEffect(() => {
    drawerOpenRef.current = drawerOpen;
  }, [drawerOpen]);

  const applyWidth = useCallback(
    (clientX: number) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = limitDragWidth(
        pane,
        drag.startWidth + (clientX - drag.startX) * growSign,
        readWidths(),
        window.innerWidth,
        drag.drawerOpen,
      );
      setWidth(pane, next);
    },
    [pane, setWidth, growSign],
  );

  const clearBodyStyles = useCallback(() => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    delete document.body.dataset.dragging;
  }, []);

  const releasePointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (element.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
  }, []);

  // 组件卸载时（例如切到全宽页）丢掉未执行的帧，别把拖动样式留在 body 上。
  useEffect(() => {
    return () => {
      const drag = dragRef.current;
      if (drag?.frame != null) cancelAnimationFrame(drag.frame);
      dragRef.current = null;
      clearBodyStyles();
    };
  }, [clearBodyStyles]);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    element.focus({ preventScroll: true });
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: clampPaneWidth(pane, useLayoutStore.getState()[pane]),
      latestX: event.clientX,
      frame: null,
      drawerOpen: drawerOpenRef.current,
    };
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.body.dataset.dragging = "true";
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.latestX = event.clientX;
    if (drag.frame !== null) return;
    drag.frame = requestAnimationFrame(() => {
      const current = dragRef.current;
      if (!current) return;
      current.frame = null;
      applyWidth(current.latestX);
    });
  }

  function finishDrag(
    event: ReactPointerEvent<HTMLDivElement>,
    applyFinal: boolean,
  ) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.frame !== null) {
      cancelAnimationFrame(drag.frame);
      drag.frame = null;
    }
    if (applyFinal) applyWidth(event.clientX);
    dragRef.current = null;
    setDragging(false);
    clearBodyStyles();
    releasePointer(event);
    persist();
  }

  function handleDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    resetWidth(pane);
    persist();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const { min, max } = LAYOUT_RANGES[pane];
    const step = KEYBOARD_STEP * growSign;
    let requested: number;
    switch (event.key) {
      case "ArrowLeft":
        requested = width - step;
        break;
      case "ArrowRight":
        requested = width + step;
        break;
      case "Home":
        requested = min;
        break;
      case "End":
        requested = max;
        break;
      default:
        return;
    }
    event.preventDefault();
    setWidth(
      pane,
      limitDragWidth(
        pane,
        requested,
        readWidths(),
        window.innerWidth,
        drawerOpenRef.current,
      ),
    );
    persist();
  }

  const { min, max } = LAYOUT_RANGES[pane];

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(clampPaneWidth(pane, width))}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      data-splitter={pane}
      title="拖动调整宽度，双击恢复默认"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finishDrag(event, true)}
      onPointerCancel={(event) => finishDrag(event, false)}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "group relative w-1.5 shrink-0 cursor-col-resize touch-none select-none focus-visible:outline-none",
        dragging && "cursor-col-resize",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line transition-colors",
          "group-hover:bg-accent group-focus-visible:bg-accent",
          dragging && "bg-accent",
        )}
      />
    </div>
  );
}
