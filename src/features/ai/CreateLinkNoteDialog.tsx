import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  FileText,
  Link2,
  Loader2,
  RefreshCw,
  Settings,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import type { Note } from "../../core/notes/types";
import {
  buildFullNotePrompt,
  findMode,
  mergeModes,
  resolveMode,
} from "../../core/ai/prompt";
import {
  modeDisplayDescription,
  modeDisplayName,
} from "../../core/ai/modeCopy";
import { getProvider, providerModel } from "../../core/ai/providers";
import {
  classifyGenerationError,
  parseGeneratedNote,
  type GeneratedNoteDraft,
  type GenerationErrorInfo,
} from "../../core/ai/generate";
import { cancelRun, runProviderText } from "../../core/ai/runner";
import type { AiSettings } from "../../core/ai/settings";
import {
  findNoteByTitle,
  isInsideWikiLink,
  isSameSourceNote,
  isWikiLinkSelection,
  nextAvailableTitle,
  normalizeLinkTitle,
} from "../../core/links/linkNote";
import { isTauriRuntime } from "../../core/fs/runtime";
import { countCharacters } from "../../core/text/plainText";
import { toVaultError } from "../../core/vault/errors";
import { notePathForTitle } from "../../core/vault/write";
import {
  getEditorSelection,
  getSelectionProblem,
  replaceSelectionWithLink,
  type EditorSelectionSnapshot,
} from "../editor/editorBridge";
import { MarkdownView } from "../editor/MarkdownView";
import { useNotesStore } from "../notes/store";
import { useAiSettingsStore } from "./aiSettingsStore";
import { useUiStore } from "../../app/uiStore";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Tag } from "../../ui/Tag";

type Stage =
  | "form"
  | "existing"
  | "same-source"
  | "already-link"
  | "self-link"
  | "invalid-title"
  | "no-selection"
  | "generating"
  | "preview"
  | "error"
  | "saving"
  | "created-no-link"
  | "link-error";

function newRequestId(): string {
  return `ai-link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function providerSummary(settings: AiSettings): string {
  const provider = getProvider(settings.provider);
  const model = providerModel(provider, settings);
  return `${provider.label} · ${model || "默认模型"}`;
}

/** 生成结果的一级标题必须跟双链目标一致。 */
function retitleFirstHeading(content: string, title: string): string {
  if (/^#\s+.+$/m.test(content)) {
    return content.replace(/^#\s+.*$/m, () => `# ${title}`);
  }
  return `# ${title}\n\n${content}`;
}

export function CreateLinkNoteDialog() {
  const open = useUiStore((state) => state.linkNoteOpen);
  const missingTarget = useUiStore((state) => state.missingLinkTarget);
  const settings = useAiSettingsStore((state) => state.settings);
  const notes = useNotesStore((state) => state.notes);
  const selectedId = useNotesStore((state) => state.selectedId);
  const desktop = isTauriRuntime();
  const provider = getProvider(settings.provider);

  const modes = mergeModes(settings.customModes);
  const fallbackMode = resolveMode(
    settings.defaultModeId,
    settings.customModes,
  );

  const [selection, setSelection] =
    useState<EditorSelectionSnapshot | null>(null);
  const [sourceNoteId, setSourceNoteId] = useState<string | null>(null);
  const [baseTitle, setBaseTitle] = useState("");
  const [existingNote, setExistingNote] = useState<Note | null>(null);
  const [modeId, setModeId] = useState(fallbackMode.id);
  const [stage, setStage] = useState<Stage>("form");
  const [draft, setDraft] = useState<GeneratedNoteDraft | null>(null);
  const [errorInfo, setErrorInfo] = useState<GenerationErrorInfo | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [createdNote, setCreatedNote] = useState<Note | null>(null);
  const [canceling, setCanceling] = useState(false);

  const requestRef = useRef<string | null>(null);
  const writingRef = useRef(false);
  const openNoteIdRef = useRef<string | null>(null);

  const note = notes.find((item) => item.id === selectedId);
  const selectedMode =
    modes.find((mode) => mode.id === modeId) ?? fallbackMode;
  const liveSourceNote = notes.find((item) => item.id === sourceNoteId);

  useEffect(() => {
    if (!open) return;
    const state = useNotesStore.getState();
    const currentNote = state.notes.find(
      (item) => item.id === state.selectedId,
    );
    const snapshot = getEditorSelection();
    openNoteIdRef.current = currentNote?.id ?? null;
    setSourceNoteId(currentNote?.id ?? null);
    setSelection(snapshot);
    setBaseTitle("");
    setExistingNote(null);
    setDraft(null);
    setErrorInfo(null);
    setWriteError(null);
    setLinkError(null);
    setCreatedNote(null);
    setCanceling(false);
    setModeId(resolveMode(settings.defaultModeId, settings.customModes).id);

    // 断链预览进入：链接已经在原文里，只需要创建目标笔记，不回写选区。
    if (missingTarget) {
      if (!currentNote) {
        setStage("no-selection");
        return;
      }
      setSelection(null);
      setBaseTitle(missingTarget);
      setStage("form");
      return;
    }

    if (!currentNote || !snapshot || !snapshot.text.trim()) {
      setStage("no-selection");
      return;
    }

    const raw = snapshot.text.trim();
    if (
      isWikiLinkSelection(raw) ||
      isInsideWikiLink(currentNote.content, snapshot.from, snapshot.to)
    ) {
      setStage("already-link");
      return;
    }

    const title = normalizeLinkTitle(raw);
    if (!title) {
      setStage("invalid-title");
      return;
    }
    setBaseTitle(title);

    if (currentNote.title.toLowerCase() === title.toLowerCase()) {
      setStage("self-link");
      return;
    }

    const existing = findNoteByTitle(state.notes, title);
    if (existing) {
      setExistingNote(existing);
      setStage(
        isSameSourceNote(existing, currentNote.id) ? "same-source" : "existing",
      );
      return;
    }

    setStage("form");
    // 只在打开时抓一次设置；对话框打开期间不跟随设置变更重置。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, missingTarget]);

  // 笔记切换后旧选区/旧请求都不再有效；先取消请求，再锁死本轮结果。
  useEffect(() => {
    if (!open) return;
    const currentId = note?.id ?? "";
    if (openNoteIdRef.current === null) return;
    if (openNoteIdRef.current === currentId) return;

    const requestId = requestRef.current;
    requestRef.current = null;
    if (requestId) void cancelRun(requestId);
    setSelection(null);
    setCanceling(false);
    setErrorInfo({
      code: "CANCELED",
      title: "已切换笔记",
      message: "笔记已切换，本次建链已取消，没有创建或修改任何笔记。",
      action: null,
      detail: null,
    });
    setStage("error");
  }, [open, note?.id]);

  useEffect(() => {
    if (!open) return;
    return () => {
      const requestId = requestRef.current;
      requestRef.current = null;
      openNoteIdRef.current = null;
      if (requestId) void cancelRun(requestId);
    };
  }, [open]);

  function resetRun(): void {
    requestRef.current = null;
    setCanceling(false);
  }

  function closeDialog(): void {
    const requestId = requestRef.current;
    requestRef.current = null;
    openNoteIdRef.current = null;
    if (requestId) void cancelRun(requestId);
    setSelection(null);
    setDraft(null);
    setErrorInfo(null);
    setWriteError(null);
    setLinkError(null);
    setCreatedNote(null);
    setCanceling(false);
    setStage("form");
    useUiStore.getState().closeLinkNote();
  }

  function openSettings(): void {
    closeDialog();
    useUiStore.getState().navigate("settings");
  }

  function enterEditMode(): void {
    closeDialog();
    const ui = useUiStore.getState();
    ui.navigate("notes");
    ui.setMode("edit");
    ui.showToast("已进入编辑态，选中一段文字后再创建双链笔记。");
  }

  function insertExistingLink(existing: Note): void {
    if (!selection) {
      setLinkError("原选区已经失效，没有插入链接。");
      setStage("link-error");
      return;
    }
    const problem = getSelectionProblem(selection);
    if (problem) {
      setLinkError(`没有插入链接：原选区${problem}。`);
      setStage("link-error");
      return;
    }
    const applied = replaceSelectionWithLink(selection, existing.title);
    if (!applied.ok) {
      setLinkError(`没有插入链接：${applied.reason}。`);
      setStage("link-error");
      return;
    }
    if (sourceNoteId) void useNotesStore.getState().saveNote(sourceNoteId);
    const ui = useUiStore.getState();
    ui.closeLinkNote();
    ui.setMode("edit");
    ui.showToast(`已链接到已有笔记「${existing.title}」`, "success");
    setStage("form");
  }

  async function startGeneration(): Promise<void> {
    if (requestRef.current) return;
    if (!desktop) {
      setErrorInfo({
        code: "NOT_DESKTOP",
        title: "需要桌面版",
        message: "浏览器演示版不能调用本机 CLI。请在桌面版里生成笔记。",
        action: null,
        detail: null,
      });
      setStage("error");
      return;
    }
    if ((!selection && !missingTarget) || !baseTitle) {
      setStage("no-selection");
      return;
    }

    const mode = findMode(modeId, settings.customModes) ?? fallbackMode;
    const prompt = buildFullNotePrompt(mode, baseTitle);
    const requestId = newRequestId();
    requestRef.current = requestId;
    setStage("generating");
    setDraft(null);
    setErrorInfo(null);
    setWriteError(null);
    setLinkError(null);
    setCanceling(false);

    try {
      const text = await runProviderText(settings.provider, settings, prompt, {
        requestId,
        timeoutMs: 180_000,
      });
      if (requestRef.current !== requestId) return;
      const parsed = parseGeneratedNote(text);
      requestRef.current = null;
      setDraft({
        title: baseTitle,
        content: retitleFirstHeading(parsed.content, baseTitle),
        tags: ["AI", "建链"],
        extra: sourceNoteId ? { source_note: sourceNoteId } : {},
      });
      setStage("preview");
    } catch (error) {
      if (requestRef.current !== requestId) return;
      requestRef.current = null;
      setErrorInfo(classifyGenerationError(error, provider, settings));
      setStage("error");
    } finally {
      if (requestRef.current === requestId) {
        requestRef.current = null;
        setCanceling(false);
      }
    }
  }

  function handleCancelGeneration(): void {
    const requestId = requestRef.current;
    if (!requestId || canceling) return;
    setCanceling(true);
    void cancelRun(requestId);
  }

  function backToForm(): void {
    resetRun();
    setStage("form");
    setDraft(null);
    setErrorInfo(null);
    setWriteError(null);
    setLinkError(null);
  }

  async function handleWrite(): Promise<void> {
    if (!draft || writingRef.current) return;

    // 断链目标：链接已经在来源笔记里，只创建目标笔记，不替换选区。
    if (missingTarget) {
      if (!sourceNoteId) {
        setWriteError("来源笔记已经关闭，没有创建文件。");
        setStage("preview");
        return;
      }
      writingRef.current = true;
      setStage("saving");
      setWriteError(null);
      try {
        const note = await useNotesStore.getState().createNoteFromContent(
          {
            title: draft.title,
            content: draft.content,
            tags: draft.tags,
            extra: draft.extra,
          },
          { selectNew: false },
        );
        const ui = useUiStore.getState();
        ui.closeLinkNote();
        ui.showToast(`已创建「${note.title}」，链接已可打开。`, "success");
        resetRun();
        setStage("form");
        setDraft(null);
      } catch (error) {
        const failure = toVaultError(
          error,
          "WRITE_FAILED",
          "创建链接目标失败。",
        );
        setWriteError(failure.message);
        setStage("preview");
      } finally {
        writingRef.current = false;
      }
      return;
    }

    if (!selection || !sourceNoteId) {
      setWriteError("原选区已经失效，还没有创建文件。请返回后重新选中。");
      setStage("preview");
      return;
    }

    const problem = getSelectionProblem(selection);
    if (problem) {
      setWriteError(`原选区${problem}，还没有创建文件。请返回后重新选中。`);
      setStage("preview");
      return;
    }

    writingRef.current = true;
    setStage("saving");
    setWriteError(null);

    try {
      const note = await useNotesStore.getState().createNoteFromContent(
        {
          title: draft.title,
          content: draft.content,
          tags: draft.tags,
          extra: draft.extra,
        },
        { selectNew: false },
      );
      const applied = replaceSelectionWithLink(selection, note.title);
      if (!applied.ok) {
        setCreatedNote(note);
        setWriteError(
          `笔记已经创建为「${note.filePath}」，但原选区${applied.reason}，链接没有写回。`,
        );
        setStage("created-no-link");
        return;
      }

      if (sourceNoteId) void useNotesStore.getState().saveNote(sourceNoteId);
      const ui = useUiStore.getState();
      ui.closeLinkNote();
      ui.setMode("edit");
      ui.showToast(
        `已创建「${note.title}」并插入双链；Ctrl+Z 可撤销链接，笔记文件不会自动删除。`,
        "success",
      );
      resetRun();
      setStage("form");
      setDraft(null);
    } catch (error) {
      const failure = toVaultError(
        error,
        "WRITE_FAILED",
        "创建双链笔记失败。",
      );
      setWriteError(failure.message);
      setStage("preview");
    } finally {
      writingRef.current = false;
    }
  }

  function openCreatedNote(): void {
    if (!createdNote) return;
    closeDialog();
    useNotesStore.getState().selectNote(createdNote.id);
    const ui = useUiStore.getState();
    ui.navigate("notes");
    ui.setMode("read");
  }

  if (!open) return null;

  const errorCode = errorInfo?.code;
  const canGoSettings =
    errorInfo?.action === "settings" ||
    errorCode === "CLI_MISSING" ||
    errorCode === "AUTH_REQUIRED" ||
    errorCode === "PROVIDER_UNAVAILABLE";
  const canRetry = errorInfo?.action === "retry";
  const previewPath = draft ? notePathForTitle("", draft.title) : "";
  const previewCollision = Boolean(
    existingNote ??
      (draft ? findNoteByTitle(notes, draft.title) : undefined),
  );

  return (
    <Dialog
      open={open}
      onClose={closeDialog}
      className="max-w-[720px]"
      labelledBy="link-note-title"
    >
      <header className="flex h-14 items-center gap-2.5 border-b border-line px-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Link2 size={15} />
        </span>
        <div className="min-w-0">
          <h2
            id="link-note-title"
            className="text-[13.5px] font-semibold text-ink"
          >
            创建双链笔记
          </h2>
          <p className="text-[10px] text-faint">{providerSummary(settings)}</p>
        </div>
        <button
          type="button"
          onClick={closeDialog}
          aria-label="关闭"
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-lg text-faint transition-colors hover:bg-hover hover:text-ink"
        >
          <X size={15} />
        </button>
      </header>

      <div className="max-h-[74vh] overflow-y-auto px-5 py-4">
        {stage === "no-selection" ? (
          <div className="grid gap-4 py-4">
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <AlertTriangle
                size={16}
                className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300"
              />
              <div>
                <h3 className="text-[13px] font-semibold text-ink">
                  先选中一段文字
                </h3>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  进入编辑态，选中要展开成一个知识点的文字，再右键或点「建链笔记」。
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" onClick={enterEditMode}>
                进入编辑态
              </Button>
              <Button variant="ghost" onClick={closeDialog}>
                关闭
              </Button>
            </div>
          </div>
        ) : null}

        {stage === "already-link" ? (
          <div className="grid gap-4 py-4">
            <div className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4">
              <Link2 size={16} className="mt-0.5 shrink-0 text-accent" />
              <div>
                <h3 className="text-[13px] font-semibold text-ink">
                  选区已经是双链
                </h3>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  这里已经是一个 [[双链]]，不需要再创建一次。可以点进链接编辑原笔记。
                </p>
              </div>
            </div>
            <Button variant="ghost" className="w-fit" onClick={closeDialog}>
              关闭
            </Button>
          </div>
        ) : null}

        {stage === "self-link" ? (
          <div className="grid gap-4 py-4">
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <AlertTriangle
                size={16}
                className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300"
              />
              <div>
                <h3 className="text-[13px] font-semibold text-ink">
                  不能链接到当前笔记
                </h3>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  选区就是这篇笔记的标题「{note?.title}」。换一段正文里的词再试。
                </p>
              </div>
            </div>
            <Button variant="ghost" className="w-fit" onClick={closeDialog}>
              关闭
            </Button>
          </div>
        ) : null}

        {stage === "invalid-title" ? (
          <div className="grid gap-4 py-4">
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <AlertTriangle
                size={16}
                className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300"
              />
              <div>
                <h3 className="text-[13px] font-semibold text-ink">
                  这段文字不能直接做标题
                </h3>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  双链标题里不能包含 [ ] | 或换行。请只选中要作为笔记标题的词或短句。
                </p>
              </div>
            </div>
            <Button variant="ghost" className="w-fit" onClick={closeDialog}>
              关闭
            </Button>
          </div>
        ) : null}

        {stage === "existing" && existingNote ? (
          <div className="grid gap-4 py-4">
            <div className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4">
              <FileText size={16} className="mt-0.5 shrink-0 text-faint" />
              <div>
                <h3 className="text-[13px] font-semibold text-ink">
                  知识库里已经有「{existingNote.title}」
                </h3>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  可以直接复用它，只插入链接；也可以生成一篇新笔记，文件名为「
                  {existingNote.title} 2」这样的序号。
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                icon={<Link2 size={13} />}
                onClick={() => insertExistingLink(existingNote)}
              >
                复用已有
              </Button>
              <Button
                variant="ghost"
                icon={<FileText size={13} />}
                onClick={() => {
                  try {
                    setBaseTitle(nextAvailableTitle(baseTitle, notes));
                    setExistingNote(null);
                    setModeId(fallbackMode.id);
                    setStage("form");
                  } catch (error) {
                    const failure = toVaultError(
                      error,
                      "WRITE_FAILED",
                      "无法为同名笔记生成序号。",
                    );
                    setLinkError(failure.message);
                    setStage("link-error");
                  }
                }}
              >
                新建并加序号
              </Button>
              <Button variant="ghost" onClick={closeDialog}>
                取消
              </Button>
            </div>
          </div>
        ) : null}

        {stage === "same-source" && existingNote ? (
          <div className="grid gap-4 py-4">
            <div className="flex items-start gap-3 rounded-xl border border-accent/25 bg-accent-soft p-4">
              <Link2 size={16} className="mt-0.5 shrink-0 text-accent" />
              <div>
                <h3 className="text-[13px] font-semibold text-ink">
                  这篇笔记已经由当前笔记创建过
                </h3>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  「{existingNote.title}」的 source_note
                  就是当前笔记。插入链接会复用已有笔记，不会重复创建文件。
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                icon={<Link2 size={13} />}
                onClick={() => insertExistingLink(existingNote)}
              >
                插入已有链接
              </Button>
              <Button variant="ghost" onClick={closeDialog}>
                取消
              </Button>
            </div>
          </div>
        ) : null}

        {stage === "form" ? (
          <div className="grid gap-4">
            {!desktop ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                浏览器演示版不能调用本机 CLI；请到桌面版生成双链笔记。
              </div>
            ) : null}

            <div className="rounded-lg border border-line bg-surface px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-faint">
                要展开的概念
              </div>
              <div className="mt-0.5 text-[13px] font-medium text-ink">
                {baseTitle}
              </div>
              <div className="mt-0.5 text-[10px] text-faint">
                {missingTarget
                  ? "确认后会创建目标笔记；原文里的链接保持不动。"
                  : `创建后会替换选区为 [[${baseTitle}]]，可以 Ctrl+Z 撤销。`}
              </div>
            </div>

            <div className="grid gap-1.5">
              <div className="text-[11px] font-medium text-ink">
                用哪种方式写这篇笔记
              </div>
              <div className="grid max-h-[280px] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                {modes.map((mode) => {
                  const active = mode.id === selectedMode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setModeId(mode.id)}
                      aria-pressed={active}
                      className={
                        active
                          ? "rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-left"
                          : "rounded-lg border border-line bg-card px-3 py-2 text-left transition-colors hover:border-line-strong hover:bg-hover"
                      }
                    >
                      <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
                        {modeDisplayName(mode)}
                        {mode.custom ? (
                          <span className="rounded bg-hover px-1 py-0.5 text-[8.5px] text-faint">
                            自定义
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-relaxed text-muted">
                        {modeDisplayDescription(mode)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Button
                variant="primary"
                icon={<Sparkles size={13} />}
                disabled={!desktop || !baseTitle}
                onClick={() => void startGeneration()}
              >
                生成预览
              </Button>
              <Button
                variant="ghost"
                icon={<Settings size={12} />}
                onClick={openSettings}
              >
                AI 设置
              </Button>
              <span className="ml-auto text-[10px] text-faint">
                生成后先预览，确认才创建文件和链接。
              </span>
            </div>
          </div>
        ) : null}

        {stage === "generating" ? (
          <div className="py-8 text-center">
            <Loader2
              size={26}
              className="mx-auto animate-spin text-accent"
            />
            <h3 className="mt-4 text-[14px] font-semibold text-ink">
              正在生成「{baseTitle}」
            </h3>
            <p className="mx-auto mt-1 max-w-[420px] break-words text-[11.5px] leading-relaxed text-muted">
              {modeDisplayName(selectedMode)} · 生成期间不会创建文件
            </p>
            <div className="mt-5">
              <Button
                variant="ghost"
                className="border border-line"
                icon={
                  canceling ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Square size={11} />
                  )
                }
                disabled={canceling}
                onClick={handleCancelGeneration}
              >
                {canceling ? "正在取消…" : "取消生成"}
              </Button>
            </div>
          </div>
        ) : null}

        {stage === "preview" && draft ? (
          <div className="grid gap-3">
            <div className="flex items-center gap-2">
              <Check size={14} className="text-accent" />
              <h3 className="text-[13px] font-semibold text-ink">
                预览生成结果
              </h3>
              <span className="ml-auto text-[10px] text-faint">
                {modeDisplayName(selectedMode)}
              </span>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-faint">
                标题
              </div>
              <h4 className="mt-1 text-[16px] font-semibold leading-snug text-ink">
                {draft.title}
              </h4>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {draft.tags.map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-faint">
                <span>开头预览</span>
                <span className="normal-case tracking-normal">
                  共 {countCharacters(draft.content)} 字
                </span>
              </div>
              <div
                className="max-h-[260px] overflow-y-auto rounded-lg border border-line bg-surface px-4 py-3"
                style={{ "--prose-size": "13px" } as CSSProperties}
              >
                <div className="pointer-events-none">
                  <MarkdownView content={draft.content} />
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[10.5px] text-muted">
              <FileText size={13} className="mt-0.5 shrink-0 text-faint" />
              <span>
                将创建：
                <span className="ml-1 break-all font-mono text-ink">
                  {previewPath}
                </span>
                {previewCollision ? (
                  <span className="ml-1 text-faint">
                    （已有同名笔记，保存时会自动加序号）
                  </span>
                ) : null}
              </span>
            </div>

            <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[10.5px] leading-relaxed text-muted">
              {missingTarget ? (
                <>
                  确认后会创建目标笔记「{draft.title}」；原文里的{" "}
                  <span className="font-mono text-ink">[[{draft.title}]]</span>{" "}
                  链接保持不动。
                </>
              ) : (
                <>
                  确认后原选区会变成{" "}
                  <span className="font-mono text-ink">[[{draft.title}]]</span>
                  ；链接替换可以 Ctrl+Z 撤销，已创建的笔记文件不会自动删除。
                </>
              )}
            </div>

            {writeError ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[11px] leading-relaxed text-red-600 dark:text-red-300">
                写入失败：{writeError}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Button
                variant="primary"
                icon={<Check size={13} />}
                onClick={() => void handleWrite()}
              >
                {missingTarget ? "创建这篇笔记" : "创建并插入双链"}
              </Button>
              <Button
                variant="ghost"
                icon={<ArrowLeft size={12} />}
                onClick={backToForm}
              >
                返回修改
              </Button>
              <Button
                variant="ghost"
                icon={<RefreshCw size={12} />}
                onClick={() => void startGeneration()}
              >
                重新生成
              </Button>
              <span className="ml-auto text-[10px] text-faint">
                确认前不会创建文件。
              </span>
            </div>
          </div>
        ) : null}

        {stage === "saving" ? (
          <div className="py-10 text-center">
            <Loader2 size={24} className="mx-auto animate-spin text-accent" />
            <p className="mt-3 text-[12.5px] text-muted">正在创建笔记并写回双链…</p>
          </div>
        ) : null}

        {stage === "created-no-link" && createdNote ? (
          <div className="grid gap-4 py-4">
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <AlertTriangle
                size={16}
                className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300"
              />
              <div>
                <h3 className="text-[13px] font-semibold text-ink">
                  笔记已创建，链接没写回
                </h3>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  {writeError ?? "原选区已经变化。"}
                </p>
                <p className="mt-1 break-all text-[10.5px] text-faint">
                  {createdNote.filePath}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={openCreatedNote}>
                打开新笔记
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  closeDialog();
                  useUiStore.getState().setMode("edit");
                }}
              >
                留在原笔记
              </Button>
            </div>
          </div>
        ) : null}

        {stage === "link-error" ? (
          <div className="grid gap-4 py-4">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-[11.5px] leading-relaxed text-muted">
              {linkError ?? "没有插入链接。"}
            </div>
            <Button variant="ghost" className="w-fit" onClick={closeDialog}>
              关闭
            </Button>
          </div>
        ) : null}

        {stage === "error" && errorInfo ? (
          <div className="grid gap-3">
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300">
                <AlertTriangle size={15} />
              </span>
              <div className="min-w-0">
                <h3 className="text-[13px] font-semibold text-ink">
                  {errorInfo.title}
                </h3>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  {errorInfo.message}
                </p>
              </div>
            </div>

            {errorInfo.detail ? (
              <details className="rounded-lg border border-line bg-surface px-3 py-2">
                <summary className="cursor-pointer text-[10.5px] text-faint">
                  查看原始错误输出
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-muted">
                  {errorInfo.detail}
                </pre>
              </details>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              {canRetry && liveSourceNote && selection ? (
                <Button
                  variant="primary"
                  icon={<RefreshCw size={13} />}
                  onClick={() => void startGeneration()}
                >
                  重试
                </Button>
              ) : null}
              {canGoSettings ? (
                <Button
                  variant="ghost"
                  className="border border-line"
                  icon={<Settings size={12} />}
                  onClick={openSettings}
                >
                  去设置
                </Button>
              ) : null}
              <Button
                variant="ghost"
                icon={<ArrowLeft size={12} />}
                onClick={backToForm}
              >
                返回修改
              </Button>
              <Button variant="ghost" onClick={closeDialog}>
                关闭
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
