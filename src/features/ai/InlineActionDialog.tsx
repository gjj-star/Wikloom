import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Pencil,
  RefreshCw,
  Settings,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import {
  buildInlinePrompt,
  INLINE_ACTIONS,
  type InlineAction,
} from "../../core/ai/prompt";
import { getProvider, providerModel } from "../../core/ai/providers";
import {
  classifyGenerationError,
  type GenerationErrorInfo,
} from "../../core/ai/generate";
import { cancelRun, runProviderText } from "../../core/ai/runner";
import type { AiSettings } from "../../core/ai/settings";
import { isTauriRuntime } from "../../core/fs/runtime";
import {
  applyInlineResult,
  getEditorSelection,
  type EditorSelectionSnapshot,
  type InlineInsertionMode,
} from "../editor/editorBridge";
import { useNotesStore } from "../notes/store";
import { useAiSettingsStore } from "./aiSettingsStore";
import { useUiStore } from "../../app/uiStore";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Segmented } from "../../ui/Segmented";

type Stage = "form" | "generating" | "error" | "no-selection";

function newRequestId(): string {
  return `ai-inline-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function providerSummary(settings: AiSettings): string {
  const provider = getProvider(settings.provider);
  const model = providerModel(provider, settings);
  return `${provider.label} · ${model || "默认模型"}`;
}

function selectionPreview(text: string): string {
  return text.length > 600 ? `${text.slice(0, 600)}…` : text;
}

export function InlineActionDialog() {
  const open = useUiStore((state) => state.inlineActionOpen);
  const settings = useAiSettingsStore((state) => state.settings);
  const notes = useNotesStore((state) => state.notes);
  const selectedId = useNotesStore((state) => state.selectedId);
  const note = notes.find((item) => item.id === selectedId);
  const desktop = isTauriRuntime();
  const provider = getProvider(settings.provider);

  const [selection, setSelection] =
    useState<EditorSelectionSnapshot | null>(null);
  const [actionId, setActionId] = useState(INLINE_ACTIONS[0].id);
  const [insertionMode, setInsertionMode] =
    useState<InlineInsertionMode>("below");
  const [stage, setStage] = useState<Stage>("form");
  const [errorInfo, setErrorInfo] = useState<GenerationErrorInfo | null>(null);
  const [canceling, setCanceling] = useState(false);
  const requestRef = useRef<string | null>(null);
  const requestNoteIdRef = useRef<string | null>(null);
  const openNoteIdRef = useRef<string | null>(null);

  const action =
    INLINE_ACTIONS.find((item) => item.id === actionId) ?? INLINE_ACTIONS[0];

  useEffect(() => {
    if (!open) return;
    const state = useNotesStore.getState();
    const currentNote = state.notes.find(
      (item) => item.id === state.selectedId,
    );
    const snapshot = getEditorSelection();
    openNoteIdRef.current = currentNote?.id ?? null;
    setSelection(snapshot);
    setStage(
      snapshot && snapshot.text.trim() && currentNote
        ? "form"
        : "no-selection",
    );
    setActionId(INLINE_ACTIONS[0].id);
    setInsertionMode("below");
    setErrorInfo(null);
    setCanceling(false);
  }, [open]);

  // 笔记切换后旧选区/旧请求都不再有效；先取消请求，再锁死本轮结果。
  useEffect(() => {
    if (!open) return;
    const currentId = note?.id ?? "";
    if (openNoteIdRef.current === null) return;
    if (openNoteIdRef.current === currentId) return;

    const requestId = requestRef.current;
    requestRef.current = null;
    requestNoteIdRef.current = null;
    if (requestId) void cancelRun(requestId);
    setSelection(null);
    setCanceling(false);
    setErrorInfo({
      code: "CANCELED",
      title: "已切换笔记",
      message: "笔记已切换，本次内联动作已取消，没有修改任何笔记。",
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
      requestNoteIdRef.current = null;
      openNoteIdRef.current = null;
      if (requestId) void cancelRun(requestId);
    };
  }, [open]);

  function closeDialog() {
    const requestId = requestRef.current;
    requestRef.current = null;
    requestNoteIdRef.current = null;
    openNoteIdRef.current = null;
    if (requestId) void cancelRun(requestId);
    setSelection(null);
    setErrorInfo(null);
    setCanceling(false);
    setStage("form");
    useUiStore.getState().closeInlineAction();
  }

  function openSettings() {
    closeDialog();
    useUiStore.getState().navigate("settings");
  }

  function enterEditMode() {
    closeDialog();
    const ui = useUiStore.getState();
    ui.navigate("notes");
    ui.setMode("edit");
    ui.showToast("已进入编辑态，选中一段文字后再打开内联动作。");
  }

  async function startGeneration() {
    if (requestRef.current) return;
    if (!desktop) {
      setErrorInfo({
        code: "NOT_DESKTOP",
        title: "需要桌面版",
        message: "浏览器演示版不能调用本机 CLI。请在桌面版里使用内联动作。",
        action: null,
        detail: null,
      });
      setStage("error");
      return;
    }
    if (!selection || !selection.text.trim() || !note) {
      setStage("no-selection");
      return;
    }

    const prompt = buildInlinePrompt(
      action,
      selection.text.trim(),
      note.content,
    );
    const requestId = newRequestId();
    requestRef.current = requestId;
    requestNoteIdRef.current = note.id;
    setStage("generating");
    setErrorInfo(null);
    setCanceling(false);

    try {
      const text = await runProviderText(settings.provider, settings, prompt, {
        requestId,
        timeoutMs: 180_000,
      });
      if (requestRef.current !== requestId) return;
      // 笔记已经切换时，绝不把 A 的结果写进 B。
      if (useNotesStore.getState().selectedId !== requestNoteIdRef.current) {
        requestRef.current = null;
        requestNoteIdRef.current = null;
        setSelection(null);
        setErrorInfo({
          code: "CANCELED",
          title: "已切换笔记",
          message: "笔记已切换，本次内联动作已取消，没有修改任何笔记。",
          action: null,
          detail: null,
        });
        setStage("error");
        return;
      }
      requestRef.current = null;
      requestNoteIdRef.current = null;

      const applied = applyInlineResult(selection, text, insertionMode);
      if (!applied.ok) {
        setErrorInfo({
          code: "RUN_FAILED",
          title: "结果没有写入",
          message: `${applied.reason}。结果没有修改笔记，请关闭后重新选中再试。`,
          action: null,
          detail: text,
        });
        setStage("error");
        return;
      }

      const ui = useUiStore.getState();
      ui.closeInlineAction();
      ui.showToast(
        insertionMode === "replace"
          ? `已替换选区：${action.name}`
          : `已插入到选区下方：${action.name}`,
        "success",
      );
      setSelection(null);
      setStage("form");
    } catch (error) {
      if (requestRef.current !== requestId) return;
      requestRef.current = null;
      requestNoteIdRef.current = null;
      setErrorInfo(classifyGenerationError(error, provider, settings));
      setStage("error");
    } finally {
      if (requestRef.current === requestId) {
        requestRef.current = null;
        requestNoteIdRef.current = null;
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

  if (!open) return null;

  const canRetry = errorInfo?.action === "retry";
  const canGoSettings =
    errorInfo?.action === "settings" ||
    errorInfo?.code === "CLI_MISSING" ||
    errorInfo?.code === "AUTH_REQUIRED" ||
    errorInfo?.code === "PROVIDER_UNAVAILABLE";

  return (
    <Dialog
      open={open}
      onClose={closeDialog}
      className="max-w-[640px]"
      labelledBy="inline-action-title"
    >
      <header className="flex h-14 items-center gap-2.5 border-b border-line px-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Sparkles size={15} />
        </span>
        <div className="min-w-0">
          <h2
            id="inline-action-title"
            className="text-[13.5px] font-semibold text-ink"
          >
            内联 AI 动作
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
        {stage === "no-selection" ? (
          <div className="py-8 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-faint">
              <Pencil size={18} />
            </span>
            <h3 className="mt-4 text-[14px] font-semibold text-ink">
              先在正文里选中一段文字
            </h3>
            <p className="mx-auto mt-1 max-w-[420px] text-[11.5px] leading-relaxed text-muted">
              内联动作只改写选区，不会新建笔记。进入编辑态，选中文字后再从工具栏或命令面板执行。
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <Button
                variant="primary"
                icon={<Pencil size={12} />}
                onClick={enterEditMode}
              >
                进入编辑态
              </Button>
              <Button variant="ghost" onClick={closeDialog}>
                关闭
              </Button>
            </div>
          </div>
        ) : null}

        {stage === "form" && selection ? (
          <div className="grid gap-4">
            {!desktop ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                浏览器演示版不能调用本机 CLI；请到桌面版使用内联动作。
              </div>
            ) : null}

            <div className="rounded-lg border border-line bg-surface px-3 py-2">
              <div className="flex items-center justify-between text-[10px] text-faint">
                <span>选中文本</span>
                <span className="tabular-nums">
                  {selection.text.length} 字符
                </span>
              </div>
              <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[10.5px] leading-relaxed text-ink">
                {selectionPreview(selection.text)}
              </pre>
            </div>

            <div className="grid gap-1.5">
              <label
                htmlFor="inline-action"
                className="text-[11px] font-medium text-ink"
              >
                动作
              </label>
              <select
                id="inline-action"
                value={action.id}
                onChange={(event) => setActionId(event.target.value)}
                className="h-9 w-full rounded-lg border border-line bg-card px-2.5 text-[12.5px] text-ink focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/15"
              >
                {INLINE_ACTIONS.map((item: InlineAction) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              {action.description ? (
                <p className="text-[10px] leading-relaxed text-faint">
                  {action.description}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <span className="text-[11px] font-medium text-ink">写入方式</span>
              <Segmented<InlineInsertionMode>
                options={[
                  { value: "below", label: "插入到下方" },
                  { value: "replace", label: "替换选区" },
                ]}
                value={insertionMode}
                onChange={setInsertionMode}
                ariaLabel="内联结果写入方式"
              />
              <p className="text-[10px] leading-relaxed text-faint">
                默认与插件一致：插到选区下方，保留原文。选「替换选区」会覆盖选中文本。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Button
                variant="primary"
                icon={<Sparkles size={13} />}
                disabled={!desktop || !selection.text.trim()}
                onClick={() => void startGeneration()}
              >
                生成并写入
              </Button>
              <Button
                variant="ghost"
                icon={<Settings size={12} />}
                onClick={openSettings}
              >
                AI 设置
              </Button>
              <span className="ml-auto text-[10px] text-faint">
                不新建笔记，只改当前选区。
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
              正在执行 {action.name}
            </h3>
            <p className="mx-auto mt-1 max-w-[420px] break-words text-[11.5px] leading-relaxed text-muted">
              {selection ? selectionPreview(selection.text) : ""}
            </p>
            <p className="mt-2 text-[10.5px] text-faint">
              取消不会修改笔记。
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
                  查看原始输出
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
              <Button
                variant="ghost"
                onClick={() => {
                  setErrorInfo(null);
                  setStage(selection ? "form" : "no-selection");
                }}
              >
                返回
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
