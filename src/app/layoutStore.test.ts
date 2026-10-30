import { describe, expect, it } from "vitest";
import {
  LAYOUT_DEFAULTS,
  LAYOUT_STORAGE_KEY,
  clampPaneWidth,
  computeEffectiveWidths,
  limitDragWidth,
  parseStoredLayout,
  serializeLayout,
  type LayoutWidths,
} from "./layoutStore";

describe("clampPaneWidth", () => {
  it("clamps below min and above max", () => {
    expect(clampPaneWidth("sidebar", 100)).toBe(180);
    expect(clampPaneWidth("sidebar", 999)).toBe(320);
    expect(clampPaneWidth("noteList", 500)).toBe(500);
    expect(clampPaneWidth("backlinks", 1000)).toBe(600);
  });

  it("falls back to that pane's default for non-finite numbers", () => {
    expect(clampPaneWidth("noteList", Number.NaN)).toBe(320);
    expect(clampPaneWidth("backlinks", Number.POSITIVE_INFINITY)).toBe(340);
  });
});

describe("stored layout", () => {
  it("falls back to defaults for missing, broken, or old data", () => {
    expect(parseStoredLayout(null)).toEqual(LAYOUT_DEFAULTS);
    expect(parseStoredLayout("{oops")).toEqual(LAYOUT_DEFAULTS);
    expect(parseStoredLayout("[]")).toEqual(LAYOUT_DEFAULTS);
    expect(
      parseStoredLayout(
        JSON.stringify({ version: 0, sidebar: 200, noteList: 300, backlinks: 340 }),
      ),
    ).toEqual(LAYOUT_DEFAULTS);
    expect(
      parseStoredLayout(
        JSON.stringify({ version: 1, sidebar: "220", noteList: 320, backlinks: 340 }),
      ),
    ).toEqual(LAYOUT_DEFAULTS);
  });

  it("clamps out-of-range numbers but keeps valid fields", () => {
    expect(
      parseStoredLayout(
        JSON.stringify({ version: 1, sidebar: 999, noteList: 250, backlinks: 10 }),
      ),
    ).toEqual({ sidebar: 320, noteList: 250, backlinks: 260 });
  });

  it("round-trips through serializeLayout", () => {
    const widths: LayoutWidths = { sidebar: 260, noteList: 400, backlinks: 300 };
    expect(parseStoredLayout(serializeLayout(widths))).toEqual(widths);
    expect(serializeLayout(widths)).toContain('"version":1');
    expect(LAYOUT_STORAGE_KEY).toBe("wikloom:layout.v1");
  });
});

describe("computeEffectiveWidths", () => {
  it("keeps saved widths on a roomy viewport", () => {
    const closed = computeEffectiveWidths(LAYOUT_DEFAULTS, 1280, false);
    expect(closed).toMatchObject({
      sidebar: 220,
      noteList: 320,
      backlinks: 0,
      main: 740,
      drawerTemporarilyCollapsed: false,
      noteListCompressed: false,
      overflow: false,
    });

    const open = computeEffectiveWidths(LAYOUT_DEFAULTS, 1280, true);
    expect(open).toMatchObject({ backlinks: 340, main: 400 });
  });

  it("temporarily collapses the drawer before touching the note list", () => {
    const result = computeEffectiveWidths(LAYOUT_DEFAULTS, 1100, true);
    expect(result.drawerTemporarilyCollapsed).toBe(true);
    expect(result.backlinks).toBe(0);
    expect(result.noteList).toBe(320);
    expect(result.main).toBe(560);
    expect(result.overflow).toBe(false);
  });

  it("compresses the note list down to 180 only when the drawer is already collapsed", () => {
    const result = computeEffectiveWidths(LAYOUT_DEFAULTS, 850, true);
    expect(result.drawerTemporarilyCollapsed).toBe(true);
    expect(result.noteListCompressed).toBe(true);
    expect(result.noteList).toBe(270);
    expect(result.main).toBe(360);
    expect(result.overflow).toBe(false);
  });

  it("keeps the main area at 360 even when minima do not fit", () => {
    const result = computeEffectiveWidths(LAYOUT_DEFAULTS, 700, true);
    expect(result.noteList).toBe(180);
    expect(result.main).toBe(360);
    expect(result.overflow).toBe(true);
  });

  it("compresses the note list on narrow windows when the drawer is closed", () => {
    const result = computeEffectiveWidths(LAYOUT_DEFAULTS, 800, false);
    expect(result.backlinks).toBe(0);
    expect(result.noteList).toBe(220);
    expect(result.noteListCompressed).toBe(true);
    expect(result.main).toBe(360);
  });
});

describe("limitDragWidth", () => {
  it("respects the pane range on a roomy viewport", () => {
    expect(
      limitDragWidth("sidebar", 500, LAYOUT_DEFAULTS, 1280, false),
    ).toBe(320);
  });

  it("stops before squeezing the main area below 360", () => {
    expect(limitDragWidth("sidebar", 320, LAYOUT_DEFAULTS, 900, false)).toBe(220);
    expect(limitDragWidth("noteList", 560, LAYOUT_DEFAULTS, 1280, true)).toBe(360);
    expect(limitDragWidth("backlinks", 600, LAYOUT_DEFAULTS, 1280, true)).toBe(380);
  });

  it("never returns less than the pane minimum", () => {
    expect(limitDragWidth("noteList", 10, LAYOUT_DEFAULTS, 700, true)).toBe(240);
  });
});
