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

export type LocateResult = { ok: true } | { ok: false; reason: string };

/**
 * 阅读态发起建链时，切到编辑态后按文本和出现序号找回选区。
 * 序号来自渲染后的正文，只数和渲染一致的「可见出现」；定位不可靠时返回原因，
 * 调用方必须提示用户回编辑态重选，不能猜着替换（v0.4.2）。
 */
export function locateTextInActiveEditor(
  text: string,
  occurrence = 0,
): LocateResult {
  const view = activeView;
  if (!view || !view.dom.isConnected) {
    return { ok: false, reason: "编辑器还没有挂载" };
  }
  if (!text.trim()) return { ok: false, reason: "没有选中文字" };
  if (text.includes("\n")) {
    return {
      ok: false,
      reason: "选区跨了多行，位置不可靠；请切到编辑态重新选择。",
    };
  }

  const doc = view.state.doc.toString();
  const index = findVisibleOccurrence(doc, text, occurrence);
  if (index < 0) {
    return {
      ok: false,
      reason: "原文里找不到刚才选中的文字，可能已被修改；请切到编辑态重新选择。",
    };
  }

  // 代码块/行内代码在阅读态以文本显示，但把 [[链接]] 写进去会破坏代码；
  // 这类位置一律拒绝，不做猜测。
  if (codeRanges(doc).some(([from, to]) => index < to && index + text.length > from)) {
    return {
      ok: false,
      reason: "选中的文字在代码块或行内代码里，不能从阅读态建链；请切到编辑态重新选择。",
    };
  }

  view.dispatch({
    selection: { anchor: index, head: index + text.length },
    scrollIntoView: true,
  });
  view.focus();
  return { ok: true };
}

/** 兼容旧调用：只关心能否选中。 */
export function selectTextInActiveEditor(
  text: string,
  occurrence = 0,
): boolean {
  return locateTextInActiveEditor(text, occurrence).ok;
}

/** 围栏代码块与行内代码的区间：[from, to) 半开区间。 */
function codeRanges(doc: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let offset = 0;
  let fence: { char: string; length: number; start: number } | null = null;

  for (const line of doc.split("\n")) {
    const start = offset;
    const end = start + line.length;
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line);

    if (fence) {
      if (
        marker &&
        marker[1][0] === fence.char &&
        marker[1].length >= fence.length
      ) {
        ranges.push([fence.start, end]);
        fence = null;
      }
    } else if (marker) {
      fence = { char: marker[1][0], length: marker[1].length, start };
    } else {
      for (const match of line.matchAll(/(`+)([^`\n]*?)\1/g)) {
        const from = start + (match.index ?? 0);
        ranges.push([from, from + match[0].length]);
      }
    }

    offset = end + 1;
  }

  // 未闭合的围栏按到文末算，宁可少定位也不改错地方。
  if (fence) ranges.push([fence.start, doc.length]);
  return ranges;
}

/** Markdown 里不进入阅读态正文的片段，[from, to) 半开区间；代码区间内不算隐藏。 */
function hiddenRanges(doc: string): Array<[number, number]> {
  const code = codeRanges(doc);
  const raw: Array<[number, number]> = [];

  // YAML frontmatter：阅读态不渲染。
  const front = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(doc);
  if (front) raw.push([0, front[0].length]);

  // 图片整段：阅读态渲染成 <img>，alt 与地址都不显示为正文文字。
  for (const match of doc.matchAll(/!\[[^\]]*\]\([^)\n]*\)/g)) {
    const from = match.index ?? 0;
    raw.push([from, from + match[0].length]);
  }

  // 行内链接的地址部分 `](...)`，允许一层嵌套括号。
  for (let i = doc.indexOf("]("); i >= 0; i = doc.indexOf("](", i + 1)) {
    const open = i + 1;
    let depth = 0;
    let end = -1;
    for (let cursor = open; cursor < doc.length && cursor - open <= 2048; cursor += 1) {
      const char = doc[cursor];
      if (char === "\n") break;
      if (char === "(") depth += 1;
      else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          end = cursor + 1;
          break;
        }
      }
    }
    if (end > open) raw.push([open, end]);
  }

  // 引用式链接定义整行；HTML 注释。这两种在阅读态都不显示为正文。
  // 注意不要把 HTML 标签和自动链接整个排除：阅读态里它们可能以文字形式可见，
  // 排掉反而会让序号少算。
  for (const match of doc.matchAll(/^\s{0,3}\[[^\]]+\]:.*$/gm)) {
    const from = match.index ?? 0;
    raw.push([from, from + match[0].length]);
  }
  for (const match of doc.matchAll(/<!--[\s\S]*?-->/g)) {
    const from = match.index ?? 0;
    raw.push([from, from + match[0].length]);
  }

  // 代码块/行内代码里的 `](...)` 在阅读态是可见代码文本，不能当隐藏地址。
  return raw.filter(
    ([from, to]) =>
      !code.some(([codeFrom, codeTo]) => from < codeTo && to > codeFrom),
  );
}

function findVisibleOccurrence(
  doc: string,
  text: string,
  occurrence: number,
): number {
  const hidden = hiddenRanges(doc);
  const isHidden = (index: number) =>
    hidden.some(([from, to]) => index >= from && index < to);

  let visible = -1;
  for (let cursor = 0; cursor <= doc.length; cursor += 1) {
    const index = doc.indexOf(text, cursor);
    if (index < 0) return -1;
    cursor = index + text.length - 1;
    if (isHidden(index)) continue;
    visible += 1;
    if (visible === occurrence) return index;
  }
  return -1;
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
