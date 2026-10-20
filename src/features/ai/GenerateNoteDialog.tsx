import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  FileText,
  FolderOpen,
  Loader2,
  RefreshCw,
  Settings,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { buildFullNotePrompt, findMode, mergeModes, resolveMode } from "../../core/ai/prompt";
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
import { isTauriRuntime } from "../../core/fs/runtime";
import { toVaultError } from "../../core/vault/errors";
import { normalizeNoteFolder, notePathForTitle } from "../../core/vault/write";
import { useAiSettingsStore } from "./aiSettingsStore";
import { useNotesStore } from "../notes/store";
import { MarkdownView } from "../editor/MarkdownView";
import { useUiStore } from "../../app/uiStore";
import { Button } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { Dialog } from "../../ui/Dialog";
import { Input } from "../../ui/Input";
import { Tag } from "../../ui/Tag";

type Stage = "form" | "generating" | "preview" | "error" | "saving";

function newRequestId(): string {
  return `ai-generate-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function providerSummary(settings: AiSettings): string {
  const provider = getProvider(settings.provider);
  const model = providerModel(provider, settings);
  return `${provider.label} · ${model || "默认模型"}`;
}

export function GenerateNoteDialog() {
  const open = useUiStore((state) => state.generateOpen);
  const settings = useAiSettingsStore((state) => state.settings);
  const notes = useNotesStore((state) => state.notes);
  const desktop = isTauriRuntime();
  const provider = getProvider(settings.provider);

  const modes = useMemo(
    () => mergeModes(settings.customModes),
    [settings.customModes],
  );
  const fallbackMode = resolveMode(
    settings.defaultModeId,
    settings.customModes,
  );
  const [modeId, setModeId] = useState(fallbackMode.id);
  const selectedMode =
    modes.find((mode) => mode.id === modeId) ?? fallbackMode;

  const [topic, setTopic] = useState("");
  const [folder, setFolder] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("form");
  const [draft, setDraft] = useState<GeneratedNoteDraft | null>(null);
  const [errorInfo, setErrorInfo] = useState<GenerationErrorInfo | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [writeErrorDetail, setWriteErrorDetail] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const requestRef = useRef<string | null>(null);
  const writingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setModeId(fallbackMode.id);
    setTopic("");
    setFolder("");
    setFolderError(null);
    setStage("form");
    setDraft(null);
    setErrorInfo(null);
    setWriteError(null);
    setWriteErrorDetail(null);
    setCanceling(false);
  }, [open, fallbackMode.id]);

  // 对话框关闭时兜底取消，避免生成进程留在后台。
  useEffect(() => {
    if (!open) return;
    return () => {
      const requestId = requestRef.current;
      requestRef.current = null;
      if (requestId) void cancelRun(requestId);
    };
  }, [open]);

  const previewPath = useMemo(() => {
    if (!draft) return "";
    try {
      return notePathForTitle(folder, draft.title);
    } catch {
      return "";
    }
  }, [draft, folder]);

  function resetRun() {
    requestRef.current = null;
    setCanceling(false);
  }

  function closeDialog() {
    const requestId = requestRef.current;
    requestRef.current = null;
    if (requestId) void cancelRun(requestId);
    setStage("form");
    setDraft(null);
    setErrorInfo(null);
    setWriteError(null);
    setWriteErrorDetail(null);
    setCanceling(false);
    useUiStore.getState().closeGenerate();
  }

  function openSettings() {
    closeDialog();
    useUiStore.getState().navigate("settings");
  }

  async function startGeneration() {
    // 防止双击或重复触发同时起两个 CLI 进程。
    if (requestRef.current) return;
    if (!desktop) {
      setErrorInfo({
        code: "NOT_DESKTOP",
        title: "需要桌面版",
        message: "浏览器演示版不能调用本机 CLI。请在桌面版里生成。",
        action: null,
        detail: null,
      });
      setStage("error");
      return;
    }

    const cleanTopic = topic.trim();
    if (!cleanTopic) return;

    try {
      normalizeNoteFolder(folder);
    } catch (error) {
      setFolderError(errorText(error));
      setStage("form");
      return;
    }
    setFolderError(null);

    const mode = findMode(modeId, settings.customModes) ?? fallbackMode;
    const prompt = buildFullNotePrompt(mode, cleanTopic);
    const requestId = newRequestId();
    requestRef.current = requestId;
    setStage("generating");
    setDraft(null);
    setErrorInfo(null);
    setWriteError(null);
    setWriteErrorDetail(null);
    setCanceling(false);

    try {
      const text = await runProviderText(settings.provider, settings, prompt, {
        requestId,
        timeoutMs: 180_000,
      });
      if (requestRef.current !== requestId) return;
      const parsed = parseGeneratedNote(text);
      requestRef.current = null;
      setDraft(parsed);
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

  function handleCancelGeneration() {
    const requestId = requestRef.current;
    if (!requestId || canceling) return;
    setCanceling(true);
    void cancelRun(requestId);
  }

  function backToForm() {
    resetRun();
    setStage("form");
    setDraft(null);
    setErrorInfo(null);
    setWriteError(null);
    setWriteErrorDetail(null);
  }

  async function handleWrite() {
    if (!draft || writingRef.current) return;
    writingRef.current = true;
    setStage("saving");
    setWriteError(null);
    setWriteErrorDetail(null);

    try {
      const note = await useNotesStore.getState().createGeneratedNote({
        title: draft.title,
        content: draft.content,
        tags: draft.tags,
        folder,
        extra: draft.extra,
      });
      const ui = useUiStore.getState();
      ui.closeGenerate();
      ui.navigate("notes");
      ui.setMode("read");
      ui.showToast(`已写入 ${note.filePath}`, "success");
      resetRun();
      setStage("form");
      setDraft(null);
    } catch (error) {
      const failure = toVaultError(
        error,
        "WRITE_FAILED",
        "写入笔记失败。",
      );
      setWriteError(failure.message);
      setWriteErrorDetail(failure.detail ?? errorText(error));
      setStage("preview");
    } finally {
      writingRef.current = false;
    }
  }

  if (!open) return null;

  const errorCode = errorInfo?.code;
  const canGoSettings =
    errorInfo?.action === "settings" ||
    errorCode === "CLI_MISSING" ||
    errorCode === "AUTH_REQUIRED" ||
    errorCode === "PROVIDER_UNAVAILABLE";
  const canRetry = errorInfo?.action === "retry";

  return (
    <Dialog
      open={open}
      onClose={closeDialog}
      className="max-w-[700px]"
      labelledBy="generate-note-title"
    >
      <header className="flex h-14 items-center gap-2.5 border-b border-line px-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Sparkles size={15} />
        </span>
        <div className="min-w-0">
          <h2
            id="generate-note-title"
            className="text-[13.5px] font-semibold text-ink"
          >
            AI 生成笔记
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

      <div className="max-h-[72vh] overflow-y-auto px-5 py-4">
        {stage === "form" ? (
          <div className="grid gap-4">
            {!desktop ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                浏览器演示版不能调用本机 CLI 或 Ollama；请到桌面版使用生成功能。
              </div>
            ) : null}

            <div className="grid gap-1.5">
              <label
                htmlFor="generate-mode"
                className="text-[11px] font-medium text-ink"
              >
                模式
              </label>
              <select
                id="generate-mode"
                value={selectedMode.id}
                onChange={(event) => setModeId(event.target.value)}
                className="h-9 w-full rounded-lg border border-line bg-card px-2.5 text-[12.5px] text-ink focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/15"
              >
                {modes.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {modeDisplayName(mode)}
                    {mode.custom ? "（自定义）" : ""}
                  </option>
                ))}
              </select>
              {modeDisplayDescription(selectedMode) ? (
                <p className="text-[10px] leading-relaxed text-faint">
                  {modeDisplayDescription(selectedMode)}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <label
                htmlFor="generate-topic"
                className="text-[11px] font-medium text-ink"
              >
                主题
              </label>
              <textarea
                id="generate-topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                rows={3}
                placeholder="想生成一篇关于什么的笔记？例如：费曼学习法如何解释递归"
                className="w-full resize-y rounded-lg border border-line bg-card px-3 py-2 text-[12.5px] text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/15"
              />
            </div>

            <div className="grid gap-1.5">
              <label
                htmlFor="generate-folder"
                className="text-[11px] font-medium text-ink"
              >
                子文件夹（可选）
              </label>
              <Input
                id="generate-folder"
                value={folder}
                onChange={(event) => {
                  setFolder(event.target.value);
                  setFolderError(null);
                }}
                placeholder="例如：ai-notes 或 research/ai"
              />
              <p
                className={cn(
                  "text-[10px] leading-relaxed",
                  folderError ? "text-red-500 dark:text-red-400" : "text-faint",
                )}
              >
                {folderError ??
                  "留空写到知识库根目录；路径必须在当前知识库内。"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Button
                variant="primary"
                icon={<Sparkles size={13} />}
                disabled={!desktop || !topic.trim()}
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
                生成不会直接写文件，确认预览后才落盘。
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
              正在生成笔记
            </h3>
            <p className="mx-auto mt-1 max-w-[420px] break-words text-[11.5px] leading-relaxed text-muted">
              {modeDisplayName(selectedMode)} · {topic.trim()}
            </p>
            <p className="mt-2 text-[10.5px] text-faint">
              生成期间不会写入任何文件。
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
              <div className="mt-1 flex items-start gap-2">
                <FileText size={15} className="mt-0.5 shrink-0 text-faint" />
                <h4 className="text-[16px] font-semibold leading-snug text-ink">
                  {draft.title}
                </h4>
              </div>
            </div>

            {draft.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {draft.tags.map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </div>
            ) : null}

            <div>
              <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-faint">
                <span>开头预览</span>
                <span className="normal-case tracking-normal">
                  共 {draft.content.length} 字符
                </span>
              </div>
              <div
                className="max-h-[300px] overflow-y-auto rounded-lg border border-line bg-surface px-4 py-3"
                style={{ "--prose-size": "13px" } as CSSProperties}
              >
                <div className="pointer-events-none">
                  <MarkdownView content={draft.content} />
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[10.5px] text-muted">
              <FolderOpen size={13} className="mt-0.5 shrink-0 text-faint" />
              <span>
                将写入：
                <span className="ml-1 break-all font-mono text-ink">
                  {previewPath || "知识库根目录"}
                </span>
                <span className="ml-1 text-faint">
                  {notes.some((note) => note.filePath === previewPath)
                    ? "（重名会自动加序号）"
                    : ""}
                </span>
              </span>
            </div>

            {writeError ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[11px] leading-relaxed text-red-600 dark:text-red-300">
                写入失败：{writeError}
                {writeErrorDetail ? (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-[10px] opacity-80">
                      查看详细错误
                    </summary>
                    <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] opacity-90">
                      {writeErrorDetail}
                    </pre>
                  </details>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Button
                variant="primary"
                icon={<Check size={13} />}
                onClick={() => void handleWrite()}
              >
                写入知识库
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
              {canRetry ? (
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
              <Button variant="ghost" icon={<ArrowLeft size={12} />} onClick={backToForm}>
                返回修改
              </Button>
              <Button variant="ghost" onClick={closeDialog}>
                关闭
              </Button>
            </div>
          </div>
        ) : null}

        {stage === "saving" ? (
          <div className="py-10 text-center">
            <Loader2 size={24} className="mx-auto animate-spin text-accent" />
            <p className="mt-3 text-[12.5px] text-muted">正在写入知识库…</p>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
