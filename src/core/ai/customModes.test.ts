import { describe, expect, it } from "vitest";
import {
  createCustomMode,
  deriveCustomModeId,
  uniqueCustomModeId,
  validateCustomModeDraft,
} from "./customModes";
import { CUSTOM_MODE_TEMPLATE } from "./prompt";
import type { CustomMode } from "./settings";

function mode(overrides: Partial<CustomMode> = {}): CustomMode {
  return {
    id: "test-mode",
    name: "Test Mode",
    description: "test",
    prompt: "Use {selection} and {context}.",
    ...overrides,
  };
}

describe("custom mode ids", () => {
  it("derives ids with the plugin rule", () => {
    expect(deriveCustomModeId("My Test Mode!")).toBe("my-test-mode");
    expect(deriveCustomModeId("  A / B  ")).toBe("a--b");
    expect(deriveCustomModeId("中文模式")).toBe("");
  });

  it("falls back to a timestamp id for a new mode", () => {
    const created = createCustomMode([], 1700000000000);
    expect(created.id).toBe("custom-1700000000000");
    expect(created.prompt).toBe(CUSTOM_MODE_TEMPLATE);
  });

  it("avoids duplicate ids", () => {
    expect(
      uniqueCustomModeId("test-mode", [mode()], "custom-1"),
    ).toBe("test-mode-2");
    expect(uniqueCustomModeId("", [mode()], "custom-1")).toBe("custom-1");
  });
});

describe("custom mode validation", () => {
  it("requires name, description and prompt", () => {
    expect(validateCustomModeDraft(mode())).toBeNull();
    expect(validateCustomModeDraft(mode({ name: " " }))).toContain("名称");
    expect(validateCustomModeDraft(mode({ description: "" }))).toContain(
      "说明",
    );
    expect(validateCustomModeDraft(mode({ prompt: "\n" }))).toContain(
      "提示词",
    );
  });
});
