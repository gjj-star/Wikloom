import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  AlertTriangle,
  Check,
  FolderOpen,
  Loader2,
  Play,
  Square,
  Terminal,
} from "lucide-react";
import { isTauriRuntime } from "../../core/fs/runtime";
import {
  PROVIDERS,
  getProvider,
  providerModel,
  type ProviderDefinition,
} from "../../core/ai/providers";
import { mergeModes, resolveMode } from "../../core/ai/prompt";
import {
  AiRunnerError,
  cancelRun,
  detectProvider,
  runProvider,
  type AiDetectionResult,
  type AiRunResult,
} from "../../core/ai/runner";
import type { AiSettings, ProviderId } from "../../core/ai/settings";
import { useAiSettingsStore } from "../ai/aiSettingsStore";
import { Button } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { Input } from "../../ui/Input";
import { Panel } from "../../ui/Panel";

const TEST_PROMPT =
  "Reply with exactly the two characters: OK. Do not add anything else.";

function fieldString(settings: AiSettings, key: keyof AiSettings): string {
  const value = settings[key];
  return typeof value === "string" ? value : "";
}

function errorText(error: unknown): string {
  if (error instanceof AiRunnerError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

function TestResult({
  result,
  error,
  onClear,
}: {
  result: AiRunResult | null;
  error: string | null;
  onClear: () => void;
}) {
  if (!result && !error) return null;

  return (
    <div
      className={cn(
        "mt-3 rounded-lg border p-3",
        error
          ? "border-red-500/30 bg-red-500/5"
          : "border-line bg-surface",
      )}
    >
      <div className="flex items-center gap-2">
        <Terminal size={13} className="text-faint" />
        <span className="text-[11px] font-medium text-ink">
          {error ? "测试失败" : "原始输出"}
        </span>
        {result ? (
          <span
            className={cn(
              "ml-auto text-[10px] tabular-nums",
              result.exitCode === 0 && result.stdout.trim()
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-faint",
            )}
          >
            exit {result.exitCode ?? "—"}
            {result.exitCode === 0 && result.stdout.trim() ? " · 成功" : ""}
            {result.timedOut ? " · 超时" : ""}
            {result.canceled ? " · 已取消" : ""}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] text-faint hover:text-ink"
        >
          清空
        </button>
      </div>

      {error ? (
        <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-red-600 dark:text-red-300">
          {error}
        </pre>
      ) : (
        <>
          <div className="mt-2 text-[10px] text-faint">stdout</div>
          <pre className="mt-0.5 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-md bg-card p-2 font-mono text-[10.5px] leading-relaxed text-ink">
            {result?.stdout || "（空）"}
          </pre>
          {result?.stderr ? (
            <>
              <div className="mt-2 text-[10px] text-faint">stderr</div>
              <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-card p-2 font-mono text-[10.5px] leading-relaxed text-muted">
                {result.stderr}
              </pre>
              {result.exitCode === 0 && result.stdout.trim() ? (
                <p className="mt-1 text-[10px] leading-relaxed text-faint">
                  stderr 有警告，但 CLI 退出码为 0；结果以上方 stdout 为准。
                </p>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function ProviderGuide({ provider }: { provider: ProviderDefinition }) {
  return (
    <details className="mt-3 rounded-lg border border-line bg-surface px-3 py-2">
      <summary className="cursor-pointer text-[11px] text-muted">
        没有 {provider.label}？安装 / 配置说明
      </summary>
      <div className="mt-2 space-y-2 text-[10.5px] leading-relaxed text-muted">
        <p>{provider.installHint}</p>
        {provider.docsUrl ? (
          <a
            href={provider.docsUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex text-accent hover:underline"
          >
            打开官方文档
          </a>
        ) : null}
      </div>
    </details>
  );
}

export function AiSettingsPanel() {
  const settings = useAiSettingsStore((state) => state.settings);
  const patch = useAiSettingsStore((state) => state.patch);
  const provider = getProvider(settings.provider);
  const desktop = isTauriRuntime();

  const modes = useMemo(
    () => mergeModes(settings.customModes),
    [settings.customModes],
  );
  const defaultMode = resolveMode(
    settings.defaultModeId,
    settings.customModes,
  );

  const [detecting, setDetecting] = useState(false);
  const [detection, setDetection] = useState<AiDetectionResult | null>(null);
  const [detectionError, setDetectionError] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AiRunResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const testRequestRef = useRef<string | null>(null);

  useEffect(() => {
    if (testRequestRef.current) {
      void cancelRun(testRequestRef.current);
      testRequestRef.current = null;
    }
    setTesting(false);
    setDetection(null);
    setDetectionError(null);
    setTestResult(null);
    setTestError(null);
  }, [settings.provider]);

  useEffect(() => {
    return () => {
      if (testRequestRef.current) void cancelRun(testRequestRef.current);
    };
  }, []);

  useEffect(() => {
    setDetection(null);
    setDetectionError(null);
    setTestResult(null);
    setTestError(null);
  }, [
    settings.claudePath,
    settings.geminiPath,
    settings.codexPath,
    settings.customPath,
    settings.ollamaUrl,
    settings.claudeModel,
    settings.geminiModel,
    settings.codexModel,
    settings.customModel,
    settings.ollamaModel,
  ]);

  const pathField = provider.commandField;
  const pathValue = pathField ? fieldString(settings, pathField) : "";
  const modelValue = fieldString(settings, provider.modelField);
  const modelPlaceholder = providerModel(provider, settings)
    ? `${providerModel(provider, settings)}（默认）`
    : "留空使用 CLI 默认";

  function patchProvider(providerId: ProviderId) {
    patch({ provider: providerId });
  }

  function patchPath(value: string) {
    if (!pathField) return;
    patch({ [pathField]: value } as Partial<AiSettings>);
  }

  function patchModel(value: string) {
    patch({ [provider.modelField]: value } as Partial<AiSettings>);
  }

  async function handleDetect() {
    if (!desktop) {
      setDetectionError("检测只在桌面版可用；浏览器演示版不会调用本机 CLI。");
      return;
    }
    setDetecting(true);
    setDetection(null);
    setDetectionError(null);
    try {
      const result = await detectProvider(provider.id, settings);
      setDetection(result);
    } catch (error) {
      setDetectionError(errorText(error));
    } finally {
      setDetecting(false);
    }
  }

  async function handleBrowse() {
    if (!desktop || !pathField) return;
    setBrowsing(true);
    setDetectionError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const selected = await invoke<string | null>("pick_ai_cli");
      if (selected) patchPath(selected);
    } catch (error) {
      setDetectionError(`选择文件失败：${errorText(error)}`);
    } finally {
      setBrowsing(false);
    }
  }

  async function handleTest() {
    if (!desktop) {
      setTestError("测试只在桌面版可用；浏览器演示版不会调用本机 CLI。");
      return;
    }
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    const requestId = `ai-test-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    testRequestRef.current = requestId;
    try {
      const result = await runProvider(
        provider.id,
        settings,
        TEST_PROMPT,
        { requestId, timeoutMs: 60_000 },
      );
      setTestResult(result);
    } catch (error) {
      setTestError(errorText(error));
    } finally {
      if (testRequestRef.current === requestId) {
        testRequestRef.current = null;
      }
      setTesting(false);
    }
  }

  function handleCancelTest() {
    const requestId = testRequestRef.current;
    if (requestId) void cancelRun(requestId);
  }

  function handleCustomArgs(event: ChangeEvent<HTMLTextAreaElement>) {
    patch({
      customArgs: event.target.value
        .split(/\r?\n/)
        .map((arg) => arg.trim())
        .filter(Boolean),
    });
  }

  const detectionFailed = detection?.found === false;
  const testFailedMissingCli =
    Boolean(testError) &&
    /CLI|找不到|not found|未配置|NOT_CONFIGURED/i.test(testError ?? "");
  const showMissingGuide = detectionFailed || testFailedMissingCli;

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-1.5">
          <Terminal size={14} className="text-accent" />
          AI 生成
        </span>
      }
      description="调用本机 CLI 或 Ollama 生成笔记；设置只保存在本机，不写入 Markdown。"
    >
      {!desktop ? (
        <div className="mb-3 rounded-lg border border-line bg-surface px-3 py-2 text-[10.5px] leading-relaxed text-muted">
          浏览器演示版不能检测或运行本机 CLI / Ollama，但设置会保存在浏览器本地；桌面版才能测试。
        </div>
      ) : null}

      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <label
            htmlFor="ai-provider"
            className="text-[11px] font-medium text-ink"
          >
            Provider
          </label>
          <select
            id="ai-provider"
            value={settings.provider}
            onChange={(event) =>
              patchProvider(event.target.value as ProviderId)
            }
            className="h-9 w-full rounded-lg border border-line bg-card px-2.5 text-[12.5px] text-ink focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/15"
          >
            {PROVIDERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-faint">
            {provider.kind === "ollama"
              ? "提示词通过 Ollama HTTP API 传入，不经过 shell。"
              : "提示词通过 stdin 传入，不拼接命令行。"}
          </p>
        </div>

        {provider.kind === "ollama" ? (
          <div className="grid gap-1.5">
            <label
              htmlFor="ai-ollama-url"
              className="text-[11px] font-medium text-ink"
            >
              Ollama 服务地址
            </label>
            <div className="flex gap-2">
              <Input
                id="ai-ollama-url"
                value={settings.ollamaUrl}
                placeholder="http://localhost:11434"
                onChange={(event) => patch({ ollamaUrl: event.target.value })}
              />
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 border border-line"
                disabled={!desktop || detecting || !settings.ollamaUrl.trim()}
                icon={
                  detecting ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Check size={12} />
                  )
                }
                onClick={() => void handleDetect()}
              >
                检测
              </Button>
            </div>
            <p className="text-[10px] text-faint">
              检测会请求服务地址下的 /api/tags，确认 Ollama 是否可用。
            </p>
          </div>
        ) : (
          <div className="grid gap-1.5">
            <label
              htmlFor="ai-cli-path"
              className="text-[11px] font-medium text-ink"
            >
              CLI 路径
            </label>
            <div className="flex gap-2">
              <Input
                id="ai-cli-path"
                value={pathValue}
                placeholder={provider.defaultCommand || "填写可执行文件路径"}
                onChange={(event) => patchPath(event.target.value)}
              />
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 border border-line"
                disabled={!desktop || browsing}
                icon={
                  browsing ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <FolderOpen size={12} />
                  )
                }
                onClick={() => void handleBrowse()}
              >
                浏览…
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 border border-line"
                disabled={!desktop || detecting}
                icon={
                  detecting ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Check size={12} />
                  )
                }
                onClick={() => void handleDetect()}
              >
                检测
              </Button>
            </div>
          </div>
        )}

        {detection?.found ? (
          <div className="rounded-md border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-1.5 text-[10px] leading-relaxed text-emerald-700 dark:text-emerald-300">
            {detection.path ? (
              <p className="break-all font-mono">{detection.path}</p>
            ) : null}
            {detection.version ? <p>{detection.version}</p> : null}
          </div>
        ) : null}
        {detectionFailed ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-[10px] leading-relaxed text-amber-700 dark:text-amber-300">
            {detection?.error ?? "未检测到服务。"}
          </div>
        ) : null}
        {detectionError ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-[10px] leading-relaxed text-amber-700 dark:text-amber-300">
            {detectionError}
          </div>
        ) : null}

        <div className="grid gap-1.5">
          <label
            htmlFor="ai-model"
            className="text-[11px] font-medium text-ink"
          >
            模型
          </label>
          <Input
            id="ai-model"
            value={modelValue}
            placeholder={modelPlaceholder}
            onChange={(event) => patchModel(event.target.value)}
          />
          <p className="text-[10px] text-faint">
            留空使用默认模型；Claude 默认 sonnet，Ollama 默认 llama3。
          </p>
        </div>

        {provider.id === "custom" ? (
          <div className="grid gap-1.5">
            <label
              htmlFor="ai-custom-args"
              className="text-[11px] font-medium text-ink"
            >
              附加参数
            </label>
            <textarea
              id="ai-custom-args"
              value={settings.customArgs.join("\n")}
              onChange={handleCustomArgs}
              rows={3}
              placeholder="每行一个参数，例如：&#10;--foo&#10;bar"
              className="w-full resize-y rounded-lg border border-line bg-card px-3 py-2 font-mono text-[11px] text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/15"
            />
            <p className="text-[10px] text-faint">
              每行一个参数；提示词仍从 stdin 传入。
            </p>
          </div>
        ) : null}

        <div className="grid gap-1.5">
          <label
            htmlFor="ai-default-mode"
            className="text-[11px] font-medium text-ink"
          >
            默认模式
          </label>
          <select
            id="ai-default-mode"
            value={defaultMode.id}
            onChange={(event) =>
              patch({ defaultModeId: event.target.value })
            }
            className="h-9 w-full rounded-lg border border-line bg-card px-2.5 text-[12.5px] text-ink focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/15"
          >
            {modes.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.name}
                {mode.custom ? "（自定义）" : ""}
              </option>
            ))}
          </select>
        </div>

        {showMissingGuide ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[10.5px] leading-relaxed text-amber-700 dark:text-amber-300">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertTriangle size={12} />
              没有找到可用的 {provider.label}
            </div>
            <p className="mt-1 opacity-90">{provider.installHint}</p>
            {provider.docsUrl ? (
              <a
                href={provider.docsUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-1 inline-flex underline"
              >
                查看安装文档
              </a>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <Button
            size="sm"
            variant="primary"
            disabled={!desktop || testing}
            icon={
              testing ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Play size={12} />
              )
            }
            onClick={() => void handleTest()}
          >
            {provider.kind === "ollama" ? "测试连接" : "测试 CLI"}
          </Button>
          {testing ? (
            <Button
              size="sm"
              variant="ghost"
              className="border border-line"
              icon={<Square size={11} />}
              onClick={handleCancelTest}
            >
              取消
            </Button>
          ) : null}
          <span className="text-[10px] text-faint">
            测试会跑一句最小提示，显示原始输出或报错。
          </span>
        </div>

        <TestResult
          result={testResult}
          error={testError}
          onClear={() => {
            setTestResult(null);
            setTestError(null);
          }}
        />

        <ProviderGuide provider={provider} />
      </div>
    </Panel>
  );
}
