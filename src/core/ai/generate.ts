import { normalizeTags, splitFrontmatter } from "../vault/frontmatter";
import type { ProviderDefinition } from "./providers";
import { AiRunnerError } from "./runner";
import type { AiSettings } from "./settings";

export interface GeneratedNoteDraft {
  title: string;
  content: string;
  tags: string[];
  /** 生成结果里除托管字段外的 frontmatter，例如 status。 */
  extra: Record<string, unknown>;
}

export class GeneratedNoteParseError extends Error {
  readonly detail: string;

  constructor(message: string, detail: string) {
    super(message);
    this.name = "GeneratedNoteParseError";
    this.detail = detail;
  }
}

const MANAGED_KEYS = new Set([
  "id",
  "title",
  "created",
  "updated",
  "tags",
]);

const FENCED_OUTPUT =
  /^```(?:markdown|md)?[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/;

function unwrapFence(raw: string): string {
  const text = raw.replace(/^\uFEFF/, "").trim();
  const match = FENCED_OUTPUT.exec(text);
  return match ? match[1].trim() : text;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 把 CLI 返回的 Markdown 拆成可保存的笔记。
 * 只接受两种开头：frontmatter 或一级标题，避免把模型的前言/道歉写进正文。
 */
export function parseGeneratedNote(raw: string): GeneratedNoteDraft {
  const text = unwrapFence(raw);
  if (!text) {
    throw new GeneratedNoteParseError("模型没有返回内容。", raw);
  }

  let data: Record<string, unknown> = {};
  let body = text;

  if (text.startsWith("---")) {
    if (!/^---\r?\n/.test(text)) {
      throw new GeneratedNoteParseError(
        "frontmatter 开头格式不正确，`---` 后必须换行。",
        raw,
      );
    }
    try {
      const parsed = splitFrontmatter(text);
      data = parsed.data;
      body = parsed.body;
    } catch (error) {
      throw new GeneratedNoteParseError(
        `frontmatter 解析失败：${errorMessage(error)}`,
        raw,
      );
    }
  }

  const start = body.replace(/^\s+/, "");
  if (!start) {
    throw new GeneratedNoteParseError("frontmatter 后面没有正文。", raw);
  }

  const firstLineEnd = start.search(/\r?\n/);
  const firstLine =
    firstLineEnd === -1 ? start : start.slice(0, firstLineEnd);
  const titleMatch = /^#\s+(.+?)\s*$/.exec(firstLine);
  if (!titleMatch) {
    throw new GeneratedNoteParseError(
      "正文没有以一级标题（# 标题）开头。",
      raw,
    );
  }

  const contentAfterTitle =
    firstLineEnd === -1 ? "" : start.slice(firstLineEnd).trim();
  if (!contentAfterTitle) {
    throw new GeneratedNoteParseError("笔记只有标题，没有正文。", raw);
  }

  const extra = Object.fromEntries(
    Object.entries(data).filter(([key]) => !MANAGED_KEYS.has(key)),
  );

  return {
    title: titleMatch[1].trim(),
    content: start.trim(),
    tags: normalizeTags(data.tags),
    extra,
  };
}

export type GenerationErrorCode =
  | "NOT_DESKTOP"
  | "CLI_MISSING"
  | "AUTH_REQUIRED"
  | "TIMEOUT"
  | "OUTPUT_INVALID"
  | "PROVIDER_UNAVAILABLE"
  | "CANCELED"
  | "RUN_FAILED";

export type GenerationAction = "settings" | "retry" | null;

export interface GenerationErrorInfo {
  code: GenerationErrorCode;
  title: string;
  message: string;
  action: GenerationAction;
  /** 原始错误输出，放在「详情」里，不替代人话提示。 */
  detail: string | null;
}

function isMissingCli(message: string): boolean {
  return /CLI_NOT_FOUND|找不到 CLI|PATH 中找不到|无法启动 CLI|系统找不到指定的文件|系统找不到指定的路径|command not found|ENOENT|no such file or directory/i.test(
    message,
  );
}

function isAuthError(message: string): boolean {
  return /not logged in|login required|please (run|log ?in)|authentication|unauthorized|invalid api key|api key|credential|oauth|token (has )?expired|\b401\b|\b403\b/i.test(
    message,
  );
}

function isTimeout(message: string): boolean {
  return /timed? ?out|超时|timeout/i.test(message);
}

function isOllamaUnavailable(message: string): boolean {
  return /Ollama 连接失败|无法连接|error sending request|connection refused|failed to connect|HTTP 5\d\d|无法解析 Ollama 返回/i.test(
    message,
  );
}

function authHint(provider: ProviderDefinition): string {
  switch (provider.id) {
    case "claude":
      return "请在终端运行 `claude`，按提示完成登录；已登录的话重新登录一次。";
    case "codex":
      return "请在终端运行 `codex login` 重新登录。";
    case "gemini":
      return "请在终端运行 `gemini` 完成 Google 账号授权，或设置 GEMINI_API_KEY。";
    case "ollama":
      return "请检查 Ollama 服务地址和访问权限。";
    default:
      return "请检查自定义 CLI 的登录状态，必要时重新登录。";
  }
}

function firstLine(value: string): string {
  return value.split(/\r?\n/).find((line) => line.trim())?.trim() ?? value.trim();
}

export function classifyGenerationError(
  error: unknown,
  provider: ProviderDefinition,
  settings?: AiSettings,
): GenerationErrorInfo {
  if (error instanceof GeneratedNoteParseError) {
    return {
      code: "OUTPUT_INVALID",
      title: "返回内容无法解析",
      message: `模型返回的内容不能直接保存：${error.message} 可以重试，或换一个模式。`,
      action: "retry",
      detail: error.detail,
    };
  }

  if (error instanceof AiRunnerError) {
    if (error.code === "NOT_DESKTOP") {
      return {
        code: "NOT_DESKTOP",
        title: "需要桌面版",
        message: "浏览器演示版不能调用本机 CLI。请在桌面版里生成。",
        action: null,
        detail: error.message,
      };
    }
    if (error.code === "NOT_CONFIGURED") {
      return {
        code: "CLI_MISSING",
        title: `没有配置「${provider.label}」`,
        message:
          provider.id === "custom"
            ? "请先在设置里填写自定义 CLI 的可执行文件路径，或确认文件存在。"
            : `请先在设置里填写「${provider.label}」的路径，或安装它之后再试。`,
        action: "settings",
        detail: error.message,
      };
    }
    if (error.code === "CANCELED") {
      return {
        code: "CANCELED",
        title: "已取消",
        message: "生成已取消，没有写入任何文件。",
        action: "retry",
        detail: null,
      };
    }
    if (error.code === "TIMEOUT") {
      return {
        code: "TIMEOUT",
        title: "生成超时",
        message:
          "生成超过 180 秒仍未返回。可以重试，或改用更快的模型。",
        action: "retry",
        detail: error.message,
      };
    }
    if (error.code === "EMPTY_OUTPUT") {
      return {
        code: "OUTPUT_INVALID",
        title: "返回内容为空",
        message: "模型没有返回任何内容。可以重试，或换一个模式。",
        action: "retry",
        detail: error.message,
      };
    }
  }

  const message = errorMessage(error).trim();
  const detail = message || null;

  if (isMissingCli(message)) {
    return {
      code: "CLI_MISSING",
      title: `没有找到「${provider.label}」`,
      message:
        provider.kind === "ollama"
          ? "请确认 Ollama 服务已经启动，或在设置里检查服务地址。"
          : provider.id === "custom"
            ? "请先在设置里填写自定义 CLI 的可执行文件路径，或确认文件存在。"
            : `请先安装「${provider.label}」，或在设置里填写 CLI 路径。安装方式：${provider.installHint}`,
      action: "settings",
      detail,
    };
  }

  if (isAuthError(message)) {
    return {
      code: "AUTH_REQUIRED",
      title: `${provider.label} 未登录或登录已过期`,
      message: `${authHint(provider)} 完成后回来点「重试」。`,
      action: "retry",
      detail,
    };
  }

  if (isTimeout(message)) {
    return {
      code: "TIMEOUT",
      title: "生成超时",
      message:
        "生成超过 180 秒仍未返回。可以重试，或改用更快的模型。",
      action: "retry",
      detail,
    };
  }

  if (provider.kind === "ollama" && isOllamaUnavailable(message)) {
    const url = settings?.ollamaUrl?.trim() || "Ollama 服务";
    return {
      code: "PROVIDER_UNAVAILABLE",
      title: "连接不上 Ollama",
      message: `无法连接 ${url}。请确认 Ollama 已启动，或在设置里检查服务地址。`,
      action: "settings",
      detail,
    };
  }

  return {
    code: "RUN_FAILED",
    title: "生成失败",
    message: `生成没有完成：${firstLine(message) || "未知错误"} 可以重试，或在设置里检查 CLI。`,
    action: "retry",
    detail,
  };
}
