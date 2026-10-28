import {
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  FileText,
  Link2,
  Loader2,
  Maximize2,
  Pencil,
  Plus,
  Sparkles,
} from "lucide-react";
import { getBacklinks } from "../../core/links/backlinks";
import { writeClipboardText } from "../../core/clipboard";
import type { EditorMode } from "../../app/uiStore";
import { useUiStore } from "../../app/uiStore";
import { modKey } from "../../core/platform";
import { countCharacters } from "../../core/text/plainText";
import { formatClock, formatDateTime } from "../../core/time/relativeTime";
import { toVaultError } from "../../core/vault/errors";
import {
  createNote,
  openAllNotes,
  saveActiveNote,
} from "../../app/actions";
import { Button } from "../../ui/Button";
import { openContextMenu } from "../../ui/ContextMenu";
import { cn } from "../../ui/cn";
import { EmptyState } from "../../ui/EmptyState";
import { Kbd } from "../../ui/Kbd";
import { Segmented } from "../../ui/Segmented";
import { Skeleton } from "../../ui/Skeleton";
import { CodeEditor } from "../editor/CodeEditor";
import {
  getEditorSelection,
  locateTextInActiveEditor,
} from "../editor/editorBridge";
import { MarkdownView } from "../editor/MarkdownView";
import { LinkPreviewProvider } from "../links/LinkPreview";
import { TagProperties } from "./TagProperties";
import { useNotesStore } from "./store";

function stripLeadingTitle(content: string, title: string): string {
  const lines = content.split("\n");
  let index = 0;
  while (index < lines.length && lines[index].trim() === "") index += 1;
  if (index < lines.length && lines[index].trim() === `# ${title}`) {
    lines.splice(index, 1);
    if (lines[index] !== undefined && lines[index].trim() === "") {
      lines.splice(index, 1);
    }
  }
  return lines.join("\n");
}

function ArticleSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[780px] px-10 pb-24 pt-11">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-6 h-8 w-3/5" />
      <Skeleton className="mt-4 h-3 w-56" />
      <div className="mt-4 h-px w-full bg-line" />
      <div className="mt-8 space-y-3.5">
        {Array.from({ length: 9 }).map((_, index) => (
          <Skeleton
            key={index}
            className={cn(
              "h-3.5",
              index % 4 === 0
                ? "w-full"
                : index % 3 === 0
                  ? "w-11/12"
                  : "w-10/12",
            )}
          />
        ))}
      </div>
      <Skeleton className="mt-8 h-24 w-full rounded-xl" />
    </div>
  );
}

export function NotePane() {
  const notes = useNotesStore((state) => state.notes);
  const status = useNotesStore((state) => state.status);
  const selectedId = useNotesStore((state) => state.selectedId);
  const vault = useNotesStore((state) => state.vault);
  const updateContent = useNotesStore((state) => state.updateContent);
  const rescan = useNotesStore((state) => state.rescan);
  const saveNote = useNotesStore((state) => state.saveNote);
  const saveState = useNotesStore((state) => state.saveState);
  const lastSavedAt = useNotesStore((state) => state.lastSavedAt);
  const saveError = useNotesStore((state) => state.saveError);

  const mode = useUiStore((state) => state.mode);
  const setMode = useUiStore((state) => state.setMode);
  const proseSize = useUiStore((state) => state.proseSize);
  const backlinksOpen = useUiStore((state) => state.backlinksOpen);
  const toggleBacklinks = useUiStore((state) => state.toggleBacklinks);

  const note = notes.find((item) => item.id === selectedId);
  const groups = useMemo(
    () =>
      note
        ? getBacklinks(note, notes)
        : { references: [], mentions: [] },
    [note, notes],
  );
  const totalLinks = groups.references.length + groups.mentions.length;
  const vaultName = vault?.name ?? "知识库";

  const noteTitle = note?.title ?? "";
  useEffect(() => {
    document.title = noteTitle ? `${noteTitle} · Wikloom` : "Wikloom";
  }, [noteTitle]);

  const loading = status === "loading" || status === "idle";
  const proseStyle = { "--prose-size": `${proseSize}px` } as CSSProperties;
  const articleRef = useRef<HTMLElement>(null);
  const pendingReadingLinkRef = useRef<{
    text: string;
    occurrence: number;
  } | null>(null);

  useEffect(() => {
    pendingReadingLinkRef.current = null;
  }, [note?.id]);

  // 阅读态发起建链：切到编辑态、找回同一处文字，再打开对话框。
  useEffect(() => {
    if (mode !== "edit" || !pendingReadingLinkRef.current) return;
    const pending = pendingReadingLinkRef.current;
    const frame = window.requestAnimationFrame(() => {
      if (pendingReadingLinkRef.current !== pending) return;
      pendingReadingLinkRef.current = null;
      const located = locateTextInActiveEditor(
        pending.text,
        pending.occurrence,
      );
      if (located.ok) {
        useUiStore.getState().openLinkNote();
      } else {
        useUiStore.getState().showToast(located.reason, "error");
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mode, note?.id]);

  function openInlineActions() {
    const selection = getEditorSelection();
    if (!selection?.text.trim()) {
      useUiStore
        .getState()
        .showToast("先在正文里选中一段文字，再执行内联动作。");
      return;
    }
    useUiStore.getState().openInlineAction();
  }

  function openLinkNoteFromSelection() {
    const selection = getEditorSelection();
    if (!selection?.text.trim()) {
      useUiStore
        .getState()
        .showToast("先在正文里选中一段文字，再创建双链笔记。");
      return;
    }
    useUiStore.getState().openLinkNote();
  }

  /** 断链卡片的默认入口：不调用 AI，只按链接文字建一篇空笔记。 */
  async function createBlankLinkedNote(title: string): Promise<boolean> {
    if (!note) return false;
    const state = useNotesStore.getState();
    const existing = state.notes.find((item) => item.title === title);
    if (existing) {
      useUiStore
        .getState()
        .showToast(`「${existing.title}」已经存在，链接已可打开。`, "success");
      return true;
    }

    try {
      const created = await state.createNoteFromContent(
        {
          title,
          content: "",
          tags: [],
          extra: { source_note: note.id },
        },
        { selectNew: false },
      );
      useUiStore
        .getState()
        .showToast(
          `已创建空白笔记「${created.title}」，链接已可打开。`,
          "success",
        );
      return true;
    } catch (error) {
      const failure = toVaultError(
        error,
        "WRITE_FAILED",
        "创建空白笔记失败。",
      );
      useUiStore.getState().showToast(failure.message, "error");
      return false;
    }
  }

  async function copyReadingSelection(text: string): Promise<void> {
    try {
      await writeClipboardText(text);
      useUiStore.getState().showToast("已复制");
    } catch (error) {
      useUiStore
        .getState()
        .showToast(
          `复制失败：${error instanceof Error ? error.message : String(error)}`,
          "error",
        );
    }
  }

  function selectReadingAll(): void {
    const root = articleRef.current;
    if (!root) return;
    const range = document.createRange();
    range.selectNodeContents(root);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function handleReadingContextMenu(event: ReactMouseEvent<HTMLElement>) {
    const domSelection = window.getSelection();
    const selected = domSelection?.toString().trim() ?? "";
    if (!selected) {
      event.preventDefault();
      return;
    }

    let occurrence = 0;
    if (
      domSelection &&
      domSelection.rangeCount > 0 &&
      articleRef.current
    ) {
      const range = domSelection.getRangeAt(0);
      const prefix = document.createRange();
      prefix.selectNodeContents(articleRef.current);
      prefix.setEnd(range.startContainer, range.startOffset);
      occurrence = prefix.toString().split(selected).length - 1;
    }

    openContextMenu(event, [
      {
        label: "创建双链笔记…",
        icon: <Link2 size={13} />,
        onSelect: () => {
          pendingReadingLinkRef.current = { text: selected, occurrence };
          setMode("edit");
        },
      },
      {
        label: "复制",
        icon: <Copy size={13} />,
        onSelect: () => void copyReadingSelection(selected),
      },
      {
        label: "全选",
        icon: <Maximize2 size={13} />,
        onSelect: selectReadingAll,
      },
    ]);
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-canvas">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
        <nav className="flex min-w-0 items-center gap-1 text-[11.5px] text-muted">
          <span className="max-w-[140px] shrink-0 truncate">{vaultName}</span>
          <ChevronRight size={12} className="shrink-0 text-faint" />
          <button
            type="button"
            onClick={openAllNotes}
            className="shrink-0 rounded px-0.5 transition-colors hover:text-ink"
          >
            全部笔记
          </button>
          {note ? (
            <>
              <ChevronRight size={12} className="shrink-0 text-faint" />
              <span className="truncate text-ink">{note.title}</span>
            </>
          ) : null}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={toggleBacklinks}
            title="反向链接"
            aria-label="反向链接"
            aria-pressed={backlinksOpen}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-lg px-1.5 text-[11px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25",
              backlinksOpen
                ? "bg-accent-soft text-accent"
                : "text-muted hover:bg-hover hover:text-ink",
            )}
          >
            <Link2 size={14} />
            {totalLinks}
          </button>

          <span className="mx-0.5 h-4 w-px bg-line" />

          <Segmented<EditorMode>
            options={[
              { value: "read", label: "阅读", icon: <BookOpen size={12} /> },
              { value: "edit", label: "编辑", icon: <Pencil size={12} /> },
            ]}
            value={mode}
            onChange={(next) => {
              setMode(next);
              if (next === "read" && note) void saveNote(note.id);
            }}
            ariaLabel="正文模式"
          />

          {mode === "edit" && note ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="border border-line"
                icon={<Link2 size={12} />}
                title="选中文字，生成一篇双链笔记"
                onClick={openLinkNoteFromSelection}
              >
                建链笔记
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="border border-line"
                icon={<Sparkles size={12} />}
                title="内联 AI 动作（先选中文字）"
                onClick={openInlineActions}
              >
                AI 动作
              </Button>
              <Button
                size="sm"
                variant="primary"
                icon={<Check size={12} />}
                onClick={() => void saveActiveNote()}
              >
                保存
              </Button>
            </>
          ) : null}
        </div>
      </header>

      {note && status === "ready" ? <TagProperties note={note} /> : null}

      {loading ? (
        <ArticleSkeleton />
      ) : status === "error" ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            icon={<AlertTriangle size={18} />}
            title="读取笔记失败"
            description="知识库暂时读不出来，可以在设置里重新扫描或换库。"
            action={<Button onClick={() => void rescan()}>重新扫描</Button>}
          />
        </div>
      ) : !note ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            icon={<FileText size={18} />}
            title={notes.length > 0 ? "选择一篇笔记" : "这个知识库还是空的"}
            description={
              notes.length > 0
                ? "从左边列表挑一篇，或者开始写新的。"
                : "新建一篇，Wikloom 会立刻在文件夹里写下 .md 文件。"
            }
            action={
              <Button icon={<Plus size={14} />} onClick={() => void createNote()}>
                新建笔记
              </Button>
            }
          />
        </div>
      ) : mode === "edit" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-6 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5 font-medium text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              <Pencil size={11} />
              编辑中
            </span>
            <span className="text-faint">·</span>
            <span className="truncate">{note.title}</span>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[10.5px]">
              {saveState === "saving" ? (
                <span className="inline-flex items-center gap-1 text-muted">
                  <Loader2 size={11} className="animate-spin" />
                  保存中…
                </span>
              ) : saveState === "error" ? (
                <span
                  className="text-red-500 dark:text-red-400"
                  title={saveError ?? undefined}
                >
                  保存失败，内容还在编辑器里
                </span>
              ) : saveState === "saved" ? (
                <span className="inline-flex items-center gap-1 text-muted">
                  <Check size={11} className="text-accent" />
                  已保存
                  {lastSavedAt ? ` ${formatClock(lastSavedAt)}` : ""}
                </span>
              ) : (
                <span className="text-faint">编辑中 · 自动保存</span>
              )}
              <span className="text-faint">·</span>
              <span className="inline-flex items-center gap-1 text-faint">
                <Kbd>{modKey}</Kbd>
                <Kbd>S</Kbd>
                保存
              </span>
            </span>
          </div>
          <div
            className="mx-auto flex min-h-0 w-full max-w-[860px] flex-1 flex-col px-10 pt-7"
            style={proseStyle}
          >
            <div className="min-h-0 flex-1">
              <CodeEditor
                key={note.id}
                value={note.content}
                onChange={(value) => updateContent(note.id, value)}
                onSave={saveActiveNote}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <LinkPreviewProvider
            key={note.id}
            onCreateBlank={createBlankLinkedNote}
            onCreateMissing={(title) =>
              useUiStore.getState().openMissingLinkNote(title)
            }
          >
            <article
              ref={articleRef}
              onContextMenu={handleReadingContextMenu}
              className="mx-auto w-full max-w-[780px] px-10 pb-32 pt-11"
              style={proseStyle}
            >
            <h1 className="text-[30px] font-semibold leading-[1.25] tracking-[-0.02em] text-ink">
              {note.title}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] text-faint">
              <span>{formatDateTime(note.updatedAt)} 更新</span>
              <span>·</span>
              <span>{countCharacters(note.content)} 字</span>
              <span>·</span>
              <span>{totalLinks} 个链接</span>
              {saveState === "saving" ? (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Loader2 size={10} className="animate-spin" />
                    保存中
                  </span>
                </>
              ) : null}
            </div>

            <hr className="my-6 border-line" />

            <MarkdownView
              content={stripLeadingTitle(note.content, note.title)}
            />

            <div className="mt-14 flex items-center gap-2 border-t border-line pt-5 text-[12px] text-muted">
              <Link2 size={14} className="shrink-0 text-faint" />
              {totalLinks > 0 ? (
                <button
                  type="button"
                  onClick={() => useUiStore.getState().setBacklinksOpen(true)}
                  className="rounded px-0.5 text-left transition-colors hover:text-ink"
                >
                  被 {groups.references.length} 篇引用，{groups.mentions.length}{" "}
                  处提及
                </button>
              ) : (
                <span className="text-faint">还没有笔记链接到这里</span>
              )}
            </div>
          </article>
          </LinkPreviewProvider>
        </div>
      )}
    </div>
  );
}
