import { describe, expect, it } from "vitest";
import {
  buildFullNotePrompt,
  buildInlinePrompt,
  CUSTOM_MODE_TEMPLATE,
  INLINE_ACTIONS,
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

  it("uses the custom prompt when building a full-note prompt", () => {
    const mode = custom({ prompt: 'Custom instructions for "{selection}".' });
    const prompt = buildFullNotePrompt(mode, "递归");
    expect(prompt).toContain('Custom instructions for "递归".');
  });
});

describe("inline actions", () => {
  it("keeps the nine plugin actions and fills selection plus context", () => {
    expect(INLINE_ACTIONS).toHaveLength(9);
    const action = INLINE_ACTIONS.find((item) => item.id === "simplify");
    expect(action).toBeTruthy();
    const prompt = buildInlinePrompt(
      action!,
      "需要简化的句子",
      "当前笔记正文",
    );
    expect(prompt).toContain("需要简化的句子");
    expect(prompt).toContain("当前笔记正文");
    expect(prompt).toContain("Output rules:");
  });
});
