import { EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { extractWikiLinks } from "../../core/links/wikiLinks";
import {
  getEditorSelection,
  locateTextInActiveEditor,
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

  it("ignores same-name text hidden in link URLs and frontmatter", () => {
    // 回归（v0.4.2 审计 P1）：渲染后的第二处 recursion 对应源文中的第二处可见文本，
    // 不能被藏在链接地址里的同名片段挤掉，否则会改到第一处。
    const original = [
      "[reference](https://example.org/recursion)",
      "",
      "recursion first",
      "recursion second",
      "recursion third",
    ].join("\n");
    const second = original.indexOf("recursion second");
    const editor = fakeEditor(original);

    setActiveEditor(editor.view);
    try {
      expect(selectTextInActiveEditor("recursion", 1)).toBe(true);
      const selection = getEditorSelection();
      expect(selection?.from).toBe(second);
      expect(selection?.text).toBe("recursion");

      expect(replaceSelectionWithLink(selection!, "recursion")).toEqual({ ok: true });
      const after = editor.doc();
      expect(after).toContain("[[recursion]] second");
      expect(after).toContain("recursion first");
    } finally {
      setActiveEditor(null);
    }
  });

  it("counts link syntax inside inline code as visible, but refuses linking in code", () => {
    // 回归：`[x](recursion)` 在阅读态是可见的代码文本，不能当成隐藏的链接地址。
    const original = "`[x](recursion)`\n\nrecursion first\nrecursion second";
    const editor = fakeEditor(original);

    setActiveEditor(editor.view);
    try {
      // 可见出现：代码里的 recursion(0)、first(1)、second(2)。
      expect(selectTextInActiveEditor("recursion", 2)).toBe(true);
      expect(getEditorSelection()?.from).toBe(
        original.indexOf("recursion second"),
      );

      const refused = locateTextInActiveEditor("recursion", 0);
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.reason).toContain("代码");
    } finally {
      setActiveEditor(null);
    }
  });

  it("counts fenced code text as visible, but refuses linking inside it", () => {
    const original = "```\nrecursion in code\n```\n\nrecursion outside";
    const editor = fakeEditor(original);

    setActiveEditor(editor.view);
    try {
      const refused = locateTextInActiveEditor("recursion", 0);
      expect(refused.ok).toBe(false);

      expect(selectTextInActiveEditor("recursion", 1)).toBe(true);
      expect(getEditorSelection()?.from).toBe(
        original.indexOf("recursion outside"),
      );
    } finally {
      setActiveEditor(null);
    }
  });

  it("refuses a selection that spans lines instead of guessing", () => {
    const editor = fakeEditor("alpha beta\ngamma delta");
    setActiveEditor(editor.view);
    try {
      const refused = locateTextInActiveEditor("beta\ngamma", 0);
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.reason).toContain("多行");
    } finally {
      setActiveEditor(null);
    }
  });
});
