import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Globe,
  Loader2,
  RefreshCw,
  Scissors,
  X,
} from "lucide-react";
import { isTauriRuntime } from "../../core/fs/runtime";
import { toVaultError } from "../../core/vault/errors";
import { useNotesStore } from "../notes/store";
import { useUiStore } from "../../app/uiStore";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Input } from "../../ui/Input";
import { Tag } from "../../ui/Tag";
import {
  ClipExtractError,
  extractClip,
  loadClipParser,
  resetClipParser,
  type ExtractedClip,
} from "./extract";

interface FetchedPage {
  finalUrl: string;
  html: string;
  contentType: string;
  charset: string;
  status: number;
}

type ClipStage = "form" | "fetching" | "preview" | "saving" | "error";
type ParserState = "loading" | "ready" | "error" | "unavailable";
type ErrorAction = "retry" | "form" | null;

interface ClipErrorInfo {
  code: string;
  title: string;
  message: string;
  action: ErrorAction;
  detail: string | null;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function rawError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function toClipError(error: unknown): ClipErrorInfo {
  if (error instanceof ClipExtractError) {
    return {
      code: "EXTRACT_FAILED",
      title: "没有找到正文",
      message: error.message,
      action: "retry",
      detail: null,
    };
  }

  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : null;
  const code =
    typeof record?.code === "string" ? record.code : "UNKNOWN";
  const message =
    typeof record?.message === "string" && record.message.trim()
      ? record.message
      : rawError(error) || "抓取失败，请稍后重试。";
  const status =
    typeof record?.status === "number" ? String(record.status) : null;

  switch (code) {
    case "INVALID_URL":
      return {
        code,
        title: "网址不完整",
        message,
        action: "form",
        detail: null,
      };
    case "UNSAFE_URL":
      return {
        code,
        title: "不能抓取这个地址",
        message,
        action: "form",
        detail: null,
      };
    case "HTTP_404":
      return {
        code,
        title: "页面不存在",
        message,
        action: "form",
        detail: status,
      };
    case "NOT_HTML":
      return {
        code,
        title: "这不是 HTML 网页",
        message,
        action: "form",
        detail: null,
      };
    case "TOO_LARGE":
      return {
        code,
        title: "页面太大",
        message,
        action: "form",
        detail: null,
      };
    case "TIMEOUT":
      return {
        code,
        title: "抓取超时",
        message,
        action: "retry",
        detail: null,
      };
    case "NETWORK":
      return {
        code,
        title: "网络连接失败",
        message,
        action: "retry",
        detail: null,
      };
    case "HTTP_ERROR":
      return {
        code,
        title: "页面无法访问",
        message,
        action: "retry",
        detail: status,
      };
    default:
      return {
        code,
        title: "剪藏失败",
        message,
        action: "retry",
        detail: status ?? code,
      };
  }
}

export function ClipDialog() {
  const open = useUiStore((state) => state.clipOpen);
  const desktop = isTauriRuntime();
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [stage, setStage] = useState<ClipStage>("form");
  const [phase, setPhase] = useState<"fetching" | "extracting">("fetching");
  const [parserState, setParserState] = useState<ParserState>("loading");
  const [parserError, setParserError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ExtractedClip | null>(null);
  const [errorInfo, setErrorInfo] = useState<ClipErrorInfo | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const runTokenRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    const token = ++runTokenRef.current;
    setUrl("");
    setUrlError(null);
    setStage("form");
    setPhase("fetching");
    setPreview(null);
    setErrorInfo(null);
    setSaveError(null);
    setParserError(null);

    if (!desktop) {
      setParserState("unavailable");
      return;
    }

    setParserState("loading");
    void (async () => {
      try {
        await loadClipParser();
        if (token === runTokenRef.current) setParserState("ready");
      } catch (error) {
        resetClipParser();
        if (token === runTokenRef.current) {
          setParserState("error");
          setParserError(`解析器加载失败：${rawError(error)}`);
        }
      }
    })();
  }, [open, desktop]);

  async function retryParser() {
    if (!desktop) return;
    const token = runTokenRef.current;
    setParserState("loading");
    setParserError(null);
    try {
      await loadClipParser();
      if (token === runTokenRef.current) setParserState("ready");
    } catch (error) {
      resetClipParser();
      if (token === runTokenRef.current) {
        setParserState("error");
        setParserError(`解析器加载失败：${rawError(error)}`);
      }
    }
  }

  function closeDialog() {
    runTokenRef.current += 1;
    setStage("form");
    setPreview(null);
    setErrorInfo(null);
    setSaveError(null);
    setUrlError(null);
    useUiStore.getState().closeClip();
  }

  async function handleFetch() {
    if (!desktop || parserState !== "ready") return;
    const trimmed = url.trim();
    if (!trimmed) {
      setUrlError("请先输入网页地址。");
      return;
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("scheme");
      }
    } catch {
      setUrlError("请输入完整的 http 或 https 网址。");
      return;
    }

    setUrlError(null);
    setErrorInfo(null);
    setSaveError(null);
    setPhase("fetching");
    setStage("fetching");
    const token = runTokenRef.current;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const page = await invoke<FetchedPage>("clip_fetch", {
        url: trimmed,
      });
      if (token !== runTokenRef.current) return;

      setPhase("extracting");
      await nextFrame();
      const extracted = await extractClip(page.html, page.finalUrl);
      if (token !== runTokenRef.current) return;

      setPreview(extracted);
      setStage("preview");
    } catch (error) {
      if (token !== runTokenRef.current) return;
      setErrorInfo(toClipError(error));
      setStage("error");
    }
  }

  async function handleSave() {
    if (!preview) return;
    setStage("saving");
    setSaveError(null);

    try {
      const note = await useNotesStore.getState().createNoteFromContent({
        title: preview.title,
        content: preview.markdown,
        tags: ["剪藏"],
        extra: {
          source_url: preview.sourceUrl,
          clipped_at: new Date().toISOString(),
        },
      });
      runTokenRef.current += 1;
      const ui = useUiStore.getState();
      ui.closeClip();
      ui.navigate("notes");
      ui.setMode("read");
      ui.showToast(`已剪藏「${note.title}」`, "success");
    } catch (error) {
      const failure = toVaultError(error, "WRITE_FAILED", "保存剪藏失败。");
      setSaveError(failure.message);
      setStage("preview");
    }
  }

  function handleRetry() {
    void handleFetch();
  }

  if (!open) return null;

  const canRetry = errorInfo?.action === "retry";
  const parserReady = parserState === "ready";

  return (
    <Dialog
      open={open}
      onClose={closeDialog}
      className="max-w-[700px]"
      labelledBy="clip-title"
    >
      <header className="flex h-14 items-center gap-2.5 border-b border-line px-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Scissors size={15} />
        </span>
        <div className="min-w-0">
          <h2 id="clip-title" className="text-[13.5px] font-semibold text-ink">
            网页剪藏
          </h2>
          <p className="text-[10px] text-faint">
            抓取正文，预览后再写进知识库
          </p>
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
        {stage === "form" ? (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleFetch();
            }}
          >
            {!desktop ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                浏览器演示版不能抓取网页；请使用桌面版剪藏。
              </div>
            ) : null}

            <div className="grid gap-1.5">
              <label
                htmlFor="clip-url"
                className="text-[11px] font-medium text-ink"
              >
                网页地址
              </label>
              <Input
                id="clip-url"
                type="url"
                value={url}
                autoFocus
                placeholder="https://example.com/article"
                onChange={(event) => {
                  setUrl(event.target.value);
                  setUrlError(null);
                }}
              />
              <p
                className={
                  urlError
                    ? "text-[10px] leading-relaxed text-red-500 dark:text-red-400"
                    : "text-[10px] leading-relaxed text-faint"
                }
              >
                {urlError ??
                  "只支持 http / https 网页；localhost、本机地址和内网地址会被拒绝。"}
              </p>
            </div>

            {desktop && parserState === "loading" ? (
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[10.5px] text-muted">
                <Loader2 size={12} className="animate-spin text-accent" />
                正在准备解析器…
              </div>
            ) : null}
            {parserState === "error" ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[10.5px] leading-relaxed text-red-600 dark:text-red-300">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle size={12} />
                  {parserError ?? "解析器加载失败。"}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="mt-1.5 border border-line"
                  icon={<RefreshCw size={11} />}
                  onClick={() => void retryParser()}
                >
                  重试加载
                </Button>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Button
                type="submit"
                variant="primary"
                icon={
                  !parserReady ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Globe size={13} />
                  )
                }
                disabled={!desktop || !parserReady || !url.trim()}
              >
                {desktop && parserState === "loading"
                  ? "正在准备解析器…"
                  : "抓取网页"}
              </Button>
              <Button type="button" variant="ghost" onClick={closeDialog}>
                关闭
              </Button>
              <span className="ml-auto text-[10px] text-faint">
                抓取后先预览，确认才写入。
              </span>
            </div>
          </form>
        ) : null}

        {stage === "fetching" ? (
          <div className="py-8 text-center">
            <Loader2
              size={26}
              className="mx-auto animate-spin text-accent"
            />
            <h3 className="mt-4 text-[14px] font-semibold text-ink">
              {phase === "fetching" ? "正在抓取网页…" : "正在抽取正文…"}
            </h3>
            <p className="mx-auto mt-1 max-w-[500px] break-all text-[11px] leading-relaxed text-muted">
              {url.trim()}
            </p>
            <p className="mt-2 text-[10.5px] text-faint">
              {phase === "fetching"
                ? "跟随重定向，最多等待 20 秒。"
                : "解析器已就绪，正在清理导航和广告。"}
            </p>
            <Button
              type="button"
              variant="ghost"
              className="mt-5 border border-line"
              onClick={closeDialog}
            >
              关闭
            </Button>
          </div>
        ) : null}

        {stage === "preview" && preview ? (
          <div className="grid gap-3">
            <div className="flex items-center gap-2">
              <Check size={14} className="text-accent" />
              <h3 className="text-[13px] font-semibold text-ink">
                确认剪藏
              </h3>
              <span className="ml-auto text-[10px] text-faint">
                {preview.usedFallback ? "正文抽取降级" : "正文已抽取"}
              </span>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-faint">
                标题
              </div>
              <h4 className="mt-1 text-[16px] font-semibold leading-snug text-ink">
                {preview.title}
              </h4>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-faint">
              <Tag tone="accent">剪藏</Tag>
              <span>{preview.domain}</span>
              <span>·</span>
              <span>{preview.wordCount.toLocaleString()} 字</span>
              <span>·</span>
              <span className="max-w-full break-all">{preview.sourceUrl}</span>
            </div>

            {preview.sourceUrl.startsWith("http://") ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[10.5px] leading-relaxed text-amber-700 dark:text-amber-300">
                非加密页面（HTTP）：内容可能在传输途中被篡改，确认来源可信后再保存。
              </div>
            ) : null}

            <div>
              <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-faint">
                正文开头
              </div>
              <pre className="max-h-[300px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-surface px-4 py-3 font-mono text-[10.5px] leading-relaxed text-ink">
                {preview.markdown.slice(0, 1600)}
              </pre>
            </div>

            {saveError ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[11px] leading-relaxed text-red-600 dark:text-red-300">
                保存失败：{saveError}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Button
                type="button"
                variant="primary"
                icon={<Check size={13} />}
                onClick={() => void handleSave()}
              >
                保存到知识库
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setStage("form");
                  setSaveError(null);
                }}
              >
                返回修改
              </Button>
              <Button type="button" variant="ghost" onClick={closeDialog}>
                关闭
              </Button>
              <span className="ml-auto text-[10px] text-faint">
                将添加 #剪藏 标签和来源网址。
              </span>
            </div>
          </div>
        ) : null}

        {stage === "saving" ? (
          <div className="py-10 text-center">
            <Loader2 size={24} className="mx-auto animate-spin text-accent" />
            <p className="mt-3 text-[12.5px] text-muted">正在写入知识库…</p>
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
              <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[10px] text-faint">
                错误代码：{errorInfo.code}
                {errorInfo.detail !== errorInfo.code
                  ? ` · ${errorInfo.detail}`
                  : ""}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              {canRetry ? (
                <Button
                  type="button"
                  variant="primary"
                  icon={<RefreshCw size={13} />}
                  onClick={handleRetry}
                >
                  重试
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setErrorInfo(null);
                  setStage("form");
                }}
              >
                返回修改
              </Button>
              <Button type="button" variant="ghost" onClick={closeDialog}>
                关闭
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
