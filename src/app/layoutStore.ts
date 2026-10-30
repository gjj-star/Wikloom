import { create } from "zustand";

export const LAYOUT_STORAGE_KEY = "wikloom:layout.v1";
export const LAYOUT_STORAGE_VERSION = 1;
/** 主内容（编辑器/阅读区）的最小宽度。 */
export const MAIN_MIN_WIDTH = 360;
/** 窄窗时笔记列表允许临时压到的最小值；这个值不写回保存值。 */
export const NOTE_LIST_NARROW_MIN = 180;

export type PaneKey = "sidebar" | "noteList" | "backlinks";

export interface LayoutWidths {
  sidebar: number;
  noteList: number;
  backlinks: number;
}

export interface EffectiveWidths extends LayoutWidths {
  /** 主内容拿到的宽度，始终不小于 MAIN_MIN_WIDTH。 */
  main: number;
  /** 抽屉本来开着，但因为窗口不够宽被临时收起（保存值不变）。 */
  drawerTemporarilyCollapsed: boolean;
  /** 笔记列表被临时压窄（保存值不变）。 */
  noteListCompressed: boolean;
  /** 连最小宽度都放不下：主内容仍保持 360，超出的部分允许横向溢出。 */
  overflow: boolean;
}

export const LAYOUT_DEFAULTS: LayoutWidths = {
  sidebar: 220,
  noteList: 320,
  backlinks: 340,
};

export const LAYOUT_RANGES: Record<PaneKey, { min: number; max: number }> = {
  sidebar: { min: 180, max: 320 },
  noteList: { min: 240, max: 560 },
  backlinks: { min: 260, max: 600 },
};

/** 单栏 clamp：数字超范围夹到边界，非有限数字回落该栏默认值。 */
export function clampPaneWidth(pane: PaneKey, value: number): number {
  const { min, max } = LAYOUT_RANGES[pane];
  if (!Number.isFinite(value)) return LAYOUT_DEFAULTS[pane];
  return Math.min(max, Math.max(min, value));
}

function fallbackWidths(): LayoutWidths {
  return { ...LAYOUT_DEFAULTS };
}

/**
 * 解析 localStorage 里的宽度。
 * 两层兜底：JSON/版本/字段类型任一不对 → 整体回落默认；
 * 字段是数字但超范围 → 逐项 clamp，其他字段保留。
 */
export function parseStoredLayout(raw: string | null): LayoutWidths {
  if (!raw) return fallbackWidths();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallbackWidths();
  }
  if (typeof parsed !== "object" || parsed === null) return fallbackWidths();
  const record = parsed as Record<string, unknown>;
  if (record.version !== LAYOUT_STORAGE_VERSION) return fallbackWidths();
  const values = [record.sidebar, record.noteList, record.backlinks];
  if (
    !values.every(
      (value) => typeof value === "number" && Number.isFinite(value),
    )
  ) {
    return fallbackWidths();
  }
  return {
    sidebar: clampPaneWidth("sidebar", record.sidebar as number),
    noteList: clampPaneWidth("noteList", record.noteList as number),
    backlinks: clampPaneWidth("backlinks", record.backlinks as number),
  };
}

export function serializeLayout(widths: LayoutWidths): string {
  return JSON.stringify({
    version: LAYOUT_STORAGE_VERSION,
    sidebar: widths.sidebar,
    noteList: widths.noteList,
    backlinks: widths.backlinks,
  });
}

/**
 * 把保存宽度换算成当前窗口下的实际宽度。
 * 窄窗让位顺序（定稿口径）：先临时收起反链抽屉 → 仍不够把笔记列表压到 180
 * → 主内容始终 ≥360；全程只算有效宽度，不修改保存值。
 */
export function computeEffectiveWidths(
  widths: LayoutWidths,
  viewportWidth: number,
  drawerOpen: boolean,
): EffectiveWidths {
  const available = Math.max(0, Math.floor(viewportWidth));
  const sidebar = clampPaneWidth("sidebar", widths.sidebar);
  let noteList = clampPaneWidth("noteList", widths.noteList);
  let backlinks = drawerOpen ? clampPaneWidth("backlinks", widths.backlinks) : 0;

  let drawerTemporarilyCollapsed = false;
  if (
    drawerOpen &&
    sidebar + noteList + backlinks + MAIN_MIN_WIDTH > available
  ) {
    backlinks = 0;
    drawerTemporarilyCollapsed = true;
  }

  let noteListCompressed = false;
  if (sidebar + noteList + backlinks + MAIN_MIN_WIDTH > available) {
    const allowed = available - sidebar - backlinks - MAIN_MIN_WIDTH;
    const target = Math.max(NOTE_LIST_NARROW_MIN, Math.min(noteList, allowed));
    if (target < noteList) {
      noteListCompressed = true;
      noteList = target;
    }
  }

  const main = available - sidebar - noteList - backlinks;
  return {
    sidebar,
    noteList,
    backlinks,
    main: Math.max(main, MAIN_MIN_WIDTH),
    drawerTemporarilyCollapsed,
    noteListCompressed,
    overflow: main < MAIN_MIN_WIDTH,
  };
}

/**
 * 拖动时的宽度上限：既受单栏范围限制，也不能把主内容压到 360 以下。
 * 其他两栏用当前保存值算出的有效宽度（窄窗下可能已经临时压缩）。
 */
export function limitDragWidth(
  pane: PaneKey,
  next: number,
  widths: LayoutWidths,
  viewportWidth: number,
  drawerOpen: boolean,
): number {
  const requested = clampPaneWidth(pane, next);
  const effective = computeEffectiveWidths(widths, viewportWidth, drawerOpen);
  const others =
    effective.sidebar +
    effective.noteList +
    effective.backlinks -
    effective[pane];
  const maxByViewport = viewportWidth - MAIN_MIN_WIDTH - others;
  const { min } = LAYOUT_RANGES[pane];
  return Math.min(requested, Math.max(min, maxByViewport));
}

interface LayoutState extends LayoutWidths {
  setWidth: (pane: PaneKey, value: number) => void;
  resetWidth: (pane: PaneKey) => void;
  hydrate: () => void;
  persist: () => void;
}

function readStorage(): LayoutWidths {
  try {
    return parseStoredLayout(localStorage.getItem(LAYOUT_STORAGE_KEY));
  } catch {
    return fallbackWidths();
  }
}

function writeStorage(widths: LayoutWidths): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, serializeLayout(widths));
  } catch {
    // 隐私模式/配额满：宽度保持内存态即可，不影响使用。
  }
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  ...LAYOUT_DEFAULTS,
  setWidth(pane, value) {
    set({ [pane]: clampPaneWidth(pane, value) } as Partial<LayoutWidths>);
  },
  resetWidth(pane) {
    set({ [pane]: LAYOUT_DEFAULTS[pane] } as Partial<LayoutWidths>);
  },
  hydrate() {
    set(readStorage());
  },
  persist() {
    const { sidebar, noteList, backlinks } = get();
    writeStorage({ sidebar, noteList, backlinks });
  },
}));
