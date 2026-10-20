import type { EditorView } from "@codemirror/view";

let activeView: EditorView | null = null;

/** CodeEditor 挂载时登记当前 EditorView，供全局内联动作读取选区。 */
export function setActiveEditor(view: EditorView | null): void {
  activeView = view;
}

export interface EditorSelectionSnapshot {
  /** 发起动作时的编辑器实例；不跟随当前激活编辑器切换。 */
  view: EditorView;
  text: string;
  from: number;
  to: number;
}

export function getEditorSelection(): EditorSelectionSnapshot | null {
  const view = activeView;
  if (!view) return null;
  const range = view.state.selection.main;
  if (range.empty) return null;
  return {
    view,
    text: view.state.sliceDoc(range.from, range.to),
    from: range.from,
    to: range.to,
  };
}

export type InlineInsertionMode = "replace" | "below";

export type ApplyInlineResult =
  | { ok: true }
  | { ok: false; reason: string };

/** 把生成结果写回快照里的那个编辑器；插入下方时与插件一致，先加两个换行。 */
export function applyInlineResult(
  selection: EditorSelectionSnapshot,
  text: string,
  mode: InlineInsertionMode,
): ApplyInlineResult {
  const { view, from, to } = selection;
  if (!view.dom.isConnected) {
    return { ok: false, reason: "编辑器已经关闭" };
  }
  if (from < 0 || to < from || to > view.state.doc.length) {
    return { ok: false, reason: "选区位置已经失效" };
  }
  if (view.state.sliceDoc(from, to) !== selection.text) {
    return { ok: false, reason: "选区已经变化" };
  }

  const insert = mode === "replace" ? text : `\n\n${text}`;
  const insertAt = mode === "replace" ? from : to;
  try {
    view.dispatch({
      changes:
        mode === "replace"
          ? { from, to, insert }
          : { from: to, to, insert },
      selection: { anchor: insertAt + insert.length },
      scrollIntoView: true,
    });
    view.focus();
  } catch {
    return { ok: false, reason: "编辑器已经关闭" };
  }
  return { ok: true };
}
