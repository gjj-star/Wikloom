import { EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { extractWikiLinks } from "../../core/links/wikiLinks";
import {
  getEditorSelection,
  replaceSelectionWithLink,
  selectTextInActiveEditor,
  setActiveEditor,
} from "./editorBridge";

function fakeEditor(doc: string) {
  let state = EditorState.create({ doc });
  const view = {
    get state() {
      return state;
    },
    dom: { isConnected: true },
    dispatch(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
    focus() {},
  } as unknown as EditorView;
  return { view, doc: () => state.doc.toString() };
}

describe("selection mapping", () => {
  it("selects the second of three identical occurrences and replaces only that one", () => {
    const original = "第一个：递归。\n第二个：递归。\n第三个：递归。";
    const first = original.indexOf("递归");
    const second = original.indexOf("递归", first + 2);
    const third = original.indexOf("递归", second + 2);
    const editor = fakeEditor(original);

    setActiveEditor(editor.view);
    try {
      expect(selectTextInActiveEditor("递归", 1)).toBe(true);
      const selection = getEditorSelection();
      expect(selection?.from).toBe(second);
      expect(selection?.to).toBe(second + 2);
      expect(selection?.text).toBe("递归");

      expect(replaceSelectionWithLink(selection!, "递归")).toEqual({ ok: true });
      const after = editor.doc();
      const expected =
        original.slice(0, second) + "[[递归]]" + original.slice(second + 2);
      expect(after).toBe(expected);
      expect(after.replace("[[递归]]", "递归")).toBe(original);

      const links = extractWikiLinks(after);
      expect(links).toHaveLength(1);
      expect(links[0].target).toBe("递归");
      expect(links[0].start).toBe(second);
      expect(after.slice(first, first + 2)).toBe("递归");
      expect(after.slice(third + 4, third + 6)).toBe("递归");
    } finally {
      setActiveEditor(null);
    }
  });
});
