import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  keymap,
  placeholder,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  ClipboardPaste,
  Copy,
  Link2,
  Maximize2,
  Scissors,
  Sparkles,
} from "lucide-react";
import { readClipboardText, writeClipboardText } from "../../core/clipboard";
import { useUiStore } from "../../app/uiStore";
import { openContextMenu } from "../../ui/ContextMenu";
import { editorHighlighting, editorTheme } from "./editorTheme";
import {
  deleteSelection,
  getEditorSelection,
  insertClipboardText,
  selectAllInActiveEditor,
  setActiveEditor,
} from "./editorBridge";

interface CodeEditorProps {
  /** 初始内容；切换笔记时由上层用 key 重挂载。 */
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
}

function reportFailure(message: string): void {
  useUiStore.getState().showToast(message, "error");
}

async function copySelection(text: string): Promise<void> {
  try {
    await writeClipboardText(text);
    useUiStore.getState().showToast("已复制");
  } catch (error) {
    reportFailure(
      `复制失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function cutSelection(): Promise<void> {
  const selection = getEditorSelection();
  if (!selection) return;
  try {
    await writeClipboardText(selection.text);
  } catch (error) {
    reportFailure(
      `剪切失败：${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  const applied = deleteSelection(selection);
  if (!applied.ok) reportFailure(`剪切失败：${applied.reason}`);
}

async function pasteClipboard(): Promise<void> {
  try {
    const text = await readClipboardText();
    const applied = insertClipboardText(text);
    if (!applied.ok) reportFailure(`粘贴失败：${applied.reason}`);
  } catch (error) {
    reportFailure(
      `粘贴失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function showEditorContextMenu(
  event: MouseEvent,
  view: EditorView,
): void {
  const selection = getEditorSelection();
  const items = [];

  if (selection) {
    items.push(
      {
        label: "剪切",
        icon: <Scissors size={13} />,
        onSelect: () => void cutSelection(),
      },
      {
        label: "复制",
        icon: <Copy size={13} />,
        onSelect: () => void copySelection(selection.text),
      },
    );
  }

  items.push({
    label: "粘贴",
    icon: <ClipboardPaste size={13} />,
    onSelect: () => void pasteClipboard(),
  });
  items.push({
    label: "全选",
    icon: <Maximize2 size={13} />,
    onSelect: () => {
      const applied = selectAllInActiveEditor();
      if (!applied.ok) reportFailure(`全选失败：${applied.reason}`);
    },
  });

  if (selection) {
    items.push(
      {
        label: "创建双链笔记…",
        icon: <Link2 size={13} />,
        separatorBefore: true,
        onSelect: () => useUiStore.getState().openLinkNote(),
      },
      {
        label: "AI 内联动作",
        icon: <Sparkles size={13} />,
        onSelect: () => useUiStore.getState().openInlineAction(),
      },
    );
  }

  view.focus();
  openContextMenu(event, items);
}

export function CodeEditor({ value, onChange, onSave }: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          markdown(),
          editorHighlighting,
          editorTheme,
          EditorView.domEventHandlers({
            contextmenu(event, view) {
              showEditorContextMenu(event, view);
              return true;
            },
          }),
          placeholder("写点什么…支持 Markdown 与 [[双向链接]]"),
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                onSaveRef.current();
                return true;
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
      parent: host,
    });

    view.focus();
    setActiveEditor(view);
    return () => {
      setActiveEditor(null);
      view.destroy();
    };
    // value 只作为初始文档，笔记切换由上层 key 触发重挂载
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={hostRef} className="h-full" />;
}
