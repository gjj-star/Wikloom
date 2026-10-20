import {
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
} from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Check, Copy, ExternalLink, FileText } from "lucide-react";
import { copyText, openNoteByTitle } from "../../app/actions";
import { useNotesStore } from "../notes/store";
import { preprocessWikiLinks } from "../../core/links/wikiLinks";
import { rehypeStyleToObject } from "../../core/markdown/rehypeStyleToObject";
import { cn } from "../../ui/cn";
import { openContextMenu } from "../../ui/ContextMenu";

function extractText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractText(node.props.children);
  }
  return "";
}

function extractLanguage(node: ReactNode): string | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const language = extractLanguage(child);
      if (language) return language;
    }
    return null;
  }
  if (isValidElement<{ className?: string; children?: ReactNode }>(node)) {
    const match = /language-([\w-]+)/.exec(node.props.className ?? "");
    if (match) return match[1];
    return extractLanguage(node.props.children);
  }
  return null;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      timer.current = window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // 剪贴板不可用时忽略
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="复制代码"
      aria-label="复制代码"
      className="code-copy inline-flex h-7 w-7 items-center justify-center rounded-md border border-line bg-card/90 text-muted opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

function CodeBlock({
  code,
  language,
  children,
}: {
  code: string;
  language: string | null;
  children: ReactNode;
}) {
  return (
    <div className="code-block group">
      {language ? <span className="code-lang">{language}</span> : null}
      <pre>{children}</pre>
      <CopyButton text={code} />
    </div>
  );
}

interface MarkdownViewProps {
  content: string;
  className?: string;
}

export function MarkdownView({ content, className }: MarkdownViewProps) {
  const notes = useNotesStore((state) => state.notes);
  const titles = useMemo(
    () => new Set(notes.map((note) => note.title)),
    [notes],
  );
  const prepared = useMemo(() => preprocessWikiLinks(content), [content]);

  const components = useMemo<Components>(
    () => ({
      a({ href, children }) {
        if (href?.startsWith("wikilink:")) {
          const target = decodeURIComponent(href.slice("wikilink:".length));
          const exists = titles.has(target);
          return (
            <button
              type="button"
              className={cn("wiki-link", !exists && "is-missing")}
              title={
                exists
                  ? `打开「${target}」`
                  : `未找到「${target}」，可能还没建这条笔记`
              }
              onClick={() => {
                if (exists) openNoteByTitle(target);
              }}
              onContextMenu={(event) => {
                openContextMenu(event, [
                  {
                    label: "复制链接",
                    icon: <Copy size={13} />,
                    onSelect: () => void copyText(`[[${target}]]`, "已复制链接"),
                  },
                  {
                    label: "打开",
                    icon: <FileText size={13} />,
                    disabled: !exists,
                    onSelect: () => {
                      if (exists) openNoteByTitle(target);
                    },
                  },
                ]);
              }}
            >
              {children}
            </button>
          );
        }

        const link = href ?? "";
        return (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            onContextMenu={(event) => {
              openContextMenu(event, [
                {
                  label: "复制链接",
                  icon: <Copy size={13} />,
                  disabled: !link,
                  onSelect: () => void copyText(link, "已复制链接"),
                },
                {
                  label: "打开",
                  icon: <ExternalLink size={13} />,
                  disabled: !link,
                  onSelect: () => {
                    if (link) {
                      window.open(link, "_blank", "noopener,noreferrer");
                    }
                  },
                },
              ]);
            }}
          >
            {children}
          </a>
        );
      },
      pre({ children }) {
        return (
          <CodeBlock
            code={extractText(children)}
            language={extractLanguage(children)}
          >
            {children}
          </CodeBlock>
        );
      },
      table({ children }) {
        return (
          <div className="table-wrap">
            <table>{children}</table>
          </div>
        );
      },
    }),
    [titles],
  );

  return (
    <div className={cn("prose-wikloom", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeStyleToObject]}
        urlTransform={(url) =>
          url.startsWith("wikilink:") ? url : defaultUrlTransform(url)
        }
        components={components}
      >
        {prepared}
      </ReactMarkdown>
    </div>
  );
}
