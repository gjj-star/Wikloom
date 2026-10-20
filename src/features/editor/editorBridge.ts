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

function invalidReason(
  selection: EditorSelectionSnapshot,
): string | null {
  const { view, from, to } = selection;
  if (!view.dom.isConnected) return "编辑器已经关闭";
  if (from < 0 || to < from || to > view.state.doc.length) {
    return "选区位置已经失效";
  }
  if (view.state.sliceDoc(from, to) !== selection.text) {
    return "选区已经变化";
  }
  return null;
}

/** 写文件前先确认原选区还能安全替换，避免创建了笔记却写不回链接。 */
export function getSelectionProblem(
  selection: EditorSelectionSnapshot,
): string | null {
  return invalidReason(selection);
}

/** 把选区替换成 [[标题]]，走 CodeMirror 事务，可 Ctrl+Z 撤销。 */
export function replaceSelectionWithLink(
  selection: EditorSelectionSnapshot,
  title: string,
): ApplyInlineResult {
  const reason = invalidReason(selection);
  if (reason) return { ok: false, reason };

  const insert = `[[${title}]]`;
  try {
    selection.view.dispatch({
      changes: { from: selection.from, to: selection.to, insert },
      selection: { anchor: selection.from + insert.length },
      scrollIntoView: true,
      userEvent: "input",
    });
    selection.view.focus();
  } catch {
    return { ok: false, reason: "编辑器已经关闭" };
  }
  return { ok: true };
}

/** 剪切：调用方先写系统剪贴板，再删掉选区。 */
export function deleteSelection(
  selection: EditorSelectionSnapshot,
): ApplyInlineResult {
  const reason = invalidReason(selection);
  if (reason) return { ok: false, reason };

  try {
    selection.view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: "" },
      selection: { anchor: selection.from },
      scrollIntoView: true,
      userEvent: "delete.cut",
    });
    selection.view.focus();
  } catch {
    return { ok: false, reason: "编辑器已经关闭" };
  }
  return { ok: true };
}

/** 在当前光标/选区处插入剪贴板文本；粘贴进入正常事务，可撤销。 */
export function insertClipboardText(text: string): ApplyInlineResult {
  const view = activeView;
  if (!view || !view.dom.isConnected) {
    return { ok: false, reason: "编辑器已经关闭" };
  }
  if (!text) return { ok: true };

  const range = view.state.selection.main;
  try {
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: text },
      selection: { anchor: range.from + text.length },
      scrollIntoView: true,
      userEvent: "input.paste",
    });
    view.focus();
  } catch {
    return { ok: false, reason: "编辑器已经关闭" };
  }
  return { ok: true };
}

export function selectAllInActiveEditor(): ApplyInlineResult {
  const view = activeView;
  if (!view || !view.dom.isConnected) {
    return { ok: false, reason: "编辑器已经关闭" };
  }
  try {
    view.dispatch({
      selection: { anchor: 0, head: view.state.doc.length },
    });
    view.focus();
  } catch {
    return { ok: false, reason: "编辑器已经关闭" };
  }
  return { ok: true };
}

/**
 * 阅读态发起建链时，切到编辑态后按文本和出现序号找回选区。
 * 返回 false 表示编辑器还没挂载或第 N 处文本已经不在原文里。
 */
export function selectTextInActiveEditor(
  text: string,
  occurrence = 0,
): boolean {
  const view = activeView;
  if (!view || !view.dom.isConnected || !text.trim()) return false;
  const doc = view.state.doc.toString();
  let index = -1;
  let from = 0;
  for (let count = 0; count <= occurrence; count += 1) {
    index = doc.indexOf(text, from);
    if (index < 0) return false;
    from = index + text.length;
  }
  view.dispatch({
    selection: { anchor: index, head: index + text.length },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

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
