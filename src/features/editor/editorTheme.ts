import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

export const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "var(--c-ink)",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-sans)",
    overflow: "auto",
  },
  ".cm-content": {
    padding: "4px 0 40vh",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--prose-size, 16px)",
    lineHeight: "1.9",
    caretColor: "var(--c-accent)",
  },
  ".cm-line": {
    padding: "0 2px",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--c-accent)",
    borderLeftWidth: "1.5px",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    {
      backgroundColor: "var(--c-accent-soft)",
    },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".cm-gutters": {
    display: "none",
  },
  ".cm-placeholder": {
    color: "var(--c-faint)",
    fontStyle: "italic",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--c-card)",
    border: "1px solid var(--c-line)",
    borderRadius: "8px",
  },
  "&.cm-focused": {
    outline: "none",
  },
});

const markdownHighlightStyle = HighlightStyle.define([
  {
    tag: [t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6],
    fontWeight: "650",
    color: "var(--c-ink)",
  },
  {
    tag: t.heading1,
    fontSize: "1.2em",
  },
  {
    tag: t.strong,
    fontWeight: "650",
    color: "var(--c-ink)",
  },
  {
    tag: t.emphasis,
    fontStyle: "italic",
  },
  {
    tag: t.strikethrough,
    textDecoration: "line-through",
    color: "var(--c-muted)",
  },
  {
    tag: [t.link, t.url],
    color: "var(--c-accent)",
    textDecoration: "underline",
  },
  {
    tag: t.monospace,
    fontFamily: "var(--font-mono)",
    fontSize: "0.92em",
    color: "var(--c-code-text)",
    backgroundColor: "var(--c-code-bg)",
  },
  {
    tag: [t.meta, t.processingInstruction],
    color: "var(--c-faint)",
  },
  {
    tag: t.quote,
    color: "var(--c-muted)",
    fontStyle: "italic",
  },
  {
    tag: t.list,
    color: "var(--c-accent)",
  },
  {
    tag: t.contentSeparator,
    color: "var(--c-faint)",
  },
  {
    tag: t.comment,
    color: "var(--c-faint)",
  },
]);

export const editorHighlighting = syntaxHighlighting(markdownHighlightStyle);
