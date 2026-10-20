import { describe, expect, it } from "vitest";
import modeCopyDoc from "../../../docs/mode-copy.zh.md?raw";
import { NOTE_MODES } from "./prompt";
import { modeDisplayDescription, modeDisplayName } from "./modeCopy";

describe("modeCopy", () => {
  it("provides a Chinese name and one-sentence description for every built-in mode", () => {
    for (const mode of NOTE_MODES) {
      const name = modeDisplayName(mode);
      const description = modeDisplayDescription(mode);
      expect(name.trim(), mode.id).not.toBe("");
      expect(description.trim(), mode.id).not.toBe("");
      expect(name, mode.id).toMatch(/[\u4e00-\u9fff]/);
      expect(description, mode.id).toMatch(/[\u4e00-\u9fff]/);
    }
  });

  it("keeps docs/mode-copy.zh.md in sync with the built-in mode list", () => {
    const rows = modeCopyDoc
      .split(/\r?\n/)
      .map((line) => /^\| ([a-z0-9-]+) \| (.+?) \| (.+?) \|$/.exec(line))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => ({
        id: match[1],
        name: match[2].trim(),
        description: match[3].trim(),
      }))
      .filter((row) => row.id !== "---");

    expect(rows.map((row) => row.id)).toEqual(NOTE_MODES.map((mode) => mode.id));
    for (const mode of NOTE_MODES) {
      const row = rows.find((item) => item.id === mode.id);
      expect(row, mode.id).toBeDefined();
      expect(row?.name, mode.id).toBe(modeDisplayName(mode));
      expect(row?.description, mode.id).toBe(modeDisplayDescription(mode));
    }
  });
});
