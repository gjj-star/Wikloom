import { isTauriRuntime } from "../fs/runtime";
import { OLLAMA_SYSTEM_PROMPT } from "./prompt";
import {
  buildInvocation,
  detectionCommand,
  getProvider,
  providerModel,
} from "./providers";
import type { AiSettings, ProviderId } from "./settings";

export interface AiRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  canceled: boolean;
}

export interface AiDetectionResult {
  found: boolean;
  path: string | null;
  version: string | null;
  error: string | null;
}

export class AiRunnerError extends Error {
  code:
    | "NOT_DESKTOP"
    | "NOT_CONFIGURED"
    | "CLI_NOT_FOUND"
    | "TIMEOUT"
    | "CANCELED"
    | "RUN_FAILED"
    | "EMPTY_OUTPUT";

  constructor(code: AiRunnerError["code"], message: string) {
    super(message);
    this.name = "AiRunnerError";
    this.code = code;
  }
}

function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function assertDesktop(): void {
  if (!isTauriRuntime()) {
    throw new AiRunnerError(
      "NOT_DESKTOP",
      "AI 生成只在桌面版可用；浏览器演示版没有本地 CLI 进程权限。",
    );
  }
}

export interface RunOptions {
  requestId?: string;
  timeoutMs?: number;
}

export async function runProvider(
  providerId: ProviderId,
  settings: AiSettings,
  prompt: string,
  options: RunOptions = {},
): Promise<AiRunResult> {
  assertDesktop();
  const provider = getProvider(providerId);
  const requestId = options.requestId ?? newRequestId();
  const timeoutMs = options.timeoutMs ?? 180_000;
  const { invoke } = await import("@tauri-apps/api/core");

  if (provider.kind === "ollama") {
    return invoke<AiRunResult>("ai_ollama", {
      url: settings.ollamaUrl.trim(),
      model: providerModel(provider, settings),
      prompt,
      system: OLLAMA_SYSTEM_PROMPT,
      timeoutMs,
    });
  }

  const invocation = buildInvocation(provider, settings);
  if (!invocation.command) {
    throw new AiRunnerError(
      "NOT_CONFIGURED",
      `还没有配置 ${provider.label} 的 CLI 路径。`,
    );
  }

  const stdin = invocation.stdinPrefix
    ? `${invocation.stdinPrefix}\n\n${prompt}`
    : prompt;

  return invoke<AiRunResult>("ai_run", {
    requestId,
    command: invocation.command,
    args: invocation.args,
    prompt: stdin,
    timeoutMs,
    captureOutputFile: invocation.usesOutputFile,
  });
}

export async function runProviderText(
  providerId: ProviderId,
  settings: AiSettings,
  prompt: string,
  options: RunOptions = {},
): Promise<string> {
  const result = await runProvider(providerId, settings, prompt, options);
  if (result.canceled) {
    throw new AiRunnerError("CANCELED", "生成已取消。");
  }
  if (result.timedOut) {
    throw new AiRunnerError(
      "TIMEOUT",
      `生成超时。${result.stderr.trim() ? `\n${result.stderr.trim()}` : ""}`,
    );
  }
  if (result.exitCode !== 0) {
    throw new AiRunnerError(
      "RUN_FAILED",
      result.stderr.trim() ||
        result.stdout.trim() ||
        `CLI 退出码 ${result.exitCode ?? "unknown"}`,
    );
  }
  const text = result.stdout.trim();
  if (!text) {
    throw new AiRunnerError("EMPTY_OUTPUT", "CLI 没有返回内容。");
  }
  return text;
}

export async function cancelRun(requestId: string): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("ai_cancel", { requestId });
  } catch {
    // 进程可能已经结束
  }
}

export async function detectProvider(
  providerId: ProviderId,
  settings: AiSettings,
): Promise<AiDetectionResult> {
  assertDesktop();
  const provider = getProvider(providerId);
  const { invoke } = await import("@tauri-apps/api/core");
  const detection = detectionCommand(provider, settings);

  if ("url" in detection) {
    return invoke<AiDetectionResult>("ai_ollama_detect", {
      url: detection.url,
    });
  }

  return invoke<AiDetectionResult>("ai_detect", {
    command: detection.command,
    args: detection.args,
  });
}
