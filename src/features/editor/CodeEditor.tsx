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
import { editorHighlighting, editorTheme } from "./editorTheme";
import { setActiveEditor } from "./editorBridge";

interface CodeEditorProps {
  /** 初始内容；切换笔记时由上层用 key 重挂载。 */
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
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
