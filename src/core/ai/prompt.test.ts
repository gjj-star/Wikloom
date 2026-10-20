import { describe, expect, it } from "vitest";
import {
  CUSTOM_MODE_TEMPLATE,
  mergeModes,
  resolveMode,
} from "./prompt";
import type { CustomMode } from "./settings";

function custom(overrides: Partial<CustomMode> = {}): CustomMode {
  return {
    id: "custom-test",
    name: "Custom Test",
    description: "test",
    prompt: 'Keep "{selection}" exactly.',
    ...overrides,
  };
}

describe("custom mode merge", () => {
  it("keeps a non-empty prompt byte-for-byte and resolves by id", () => {
    const mode = custom();
    const merged = mergeModes([mode]);
    expect(merged).toHaveLength(25);
    expect(merged.at(-1)?.prompt).toBe(mode.prompt);
    expect(resolveMode(mode.id, [mode]).id).toBe(mode.id);
  });

  it("falls back to the plugin template when the prompt is blank", () => {
    const mode = custom({ id: "custom-empty", prompt: "   " });
    expect(mergeModes([mode]).at(-1)?.prompt).toBe(CUSTOM_MODE_TEMPLATE);
  });

  it("falls back to explain for an unknown mode id", () => {
    expect(resolveMode("missing-mode", []).id).toBe("explain");
    expect(resolveMode("missing-mode", [custom()]).id).toBe("explain");
  });
});
