import { CLI_SYSTEM_PROMPT } from "./prompt";
import type { AiSettings, ProviderId } from "./settings";

export interface CliDetection {
  type: "command";
  args: string[];
}

export interface OllamaDetection {
  type: "http";
  path: string;
}

export interface ProviderDefinition {
  id: ProviderId;
  label: string;
  kind: "cli" | "ollama";
  defaultCommand: string;
  commandField?: keyof AiSettings;
  modelField: keyof AiSettings;
  defaultModel: string;
  /** 模型为空时仍要传 --model（Claude 默认 sonnet）。 */
  alwaysModel?: boolean;
  argsTemplate: string[];
  modelArgs?: string[];
  stdinPrefix?: string;
  outputFileArgs?: string[];
  argsSuffix?: string[];
  detection: CliDetection | OllamaDetection;
  installHint: string;
  docsUrl: string;
}

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: "claude",
    label: "Claude Code",
    kind: "cli",
    defaultCommand: "claude",
    commandField: "claudePath",
    modelField: "claudeModel",
    defaultModel: "sonnet",
    alwaysModel: true,
    argsTemplate: [
      "-p",
      "{systemPrompt}",
      "--max-turns",
      "10",
      "--disallowedTools",
      "Edit,Write,Read,Bash,PowerShell,Glob,Grep",
    ],
    modelArgs: ["--model", "{model}"],
    detection: { type: "command", args: ["--version"] },
    installHint: "npm install -g @anthropic-ai/claude-code",
    docsUrl: "https://docs.anthropic.com/en/docs/claude-code",
  },
  {
    id: "codex",
    label: "Codex CLI",
    kind: "cli",
    defaultCommand: "codex",
    commandField: "codexPath",
    modelField: "codexModel",
    defaultModel: "",
    argsTemplate: [
      "exec",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
    ],
    modelArgs: ["--model", "{model}"],
    outputFileArgs: ["--output-last-message", "{outputFile}"],
    argsSuffix: ["-"],
    stdinPrefix: CLI_SYSTEM_PROMPT,
    detection: { type: "command", args: ["--version"] },
    installHint: "npm install -g @openai/codex",
    docsUrl: "https://github.com/openai/codex",
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    kind: "cli",
    defaultCommand: "gemini",
    commandField: "geminiPath",
    modelField: "geminiModel",
    defaultModel: "",
    argsTemplate: ["-p", "{systemPrompt}", "--approval-mode", "plan"],
    modelArgs: ["--model", "{model}"],
    detection: { type: "command", args: ["--version"] },
    installHint: "npm install -g @google/gemini-cli",
    docsUrl: "https://github.com/google-gemini/gemini-cli",
  },
  {
    id: "ollama",
    label: "Ollama",
    kind: "ollama",
    defaultCommand: "",
    modelField: "ollamaModel",
    defaultModel: "llama3",
    argsTemplate: [],
    detection: { type: "http", path: "/api/tags" },
    installHint: "下载并启动 Ollama 服务：https://ollama.com/download",
    docsUrl: "https://github.com/ollama/ollama/blob/main/docs/api.md",
  },
  {
    id: "custom",
    label: "自定义 CLI",
    kind: "cli",
    defaultCommand: "",
    commandField: "customPath",
    modelField: "customModel",
    defaultModel: "",
    argsTemplate: [],
    modelArgs: ["--model", "{model}"],
    detection: { type: "command", args: ["--version"] },
    installHint: "填写任意 CLI 可执行文件；提示词通过 stdin 传入。",
    docsUrl: "",
  },
];

export function getProvider(id: ProviderId): ProviderDefinition {
  return PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS[0];
}

function stringSetting(settings: AiSettings, key: keyof AiSettings): string {
  const value = settings[key];
  return typeof value === "string" ? value : "";
}

export function providerCommand(
  provider: ProviderDefinition,
  settings: AiSettings,
): string {
  if (provider.id === "custom") return settings.customPath.trim();
  if (!provider.commandField) return "";
  return stringSetting(settings, provider.commandField).trim();
}

export function providerModel(
  provider: ProviderDefinition,
  settings: AiSettings,
): string {
  const configured = stringSetting(settings, provider.modelField).trim();
  return configured || provider.defaultModel;
}

export interface ProviderInvocation {
  command: string;
  args: string[];
  stdinPrefix: string;
  usesOutputFile: boolean;
}

function replaceTokens(
  values: string[],
  replacements: Record<string, string>,
): string[] {
  return values.map((value) =>
    value.replace(/\{(\w+)\}/g, (match, key: string) => {
      return replacements[key] ?? match;
    }),
  );
}

/**
 * 生成 CLI 参数模板。{systemPrompt} 在参数里，{model} 按 provider 规则，
 * {outputFile} 由 Rust runner 替换成临时文件路径。
 */
export function buildInvocation(
  provider: ProviderDefinition,
  settings: AiSettings,
  options: { forDetection?: boolean } = {},
): ProviderInvocation {
  if (provider.kind === "ollama") {
    return { command: "", args: [], stdinPrefix: "", usesOutputFile: false };
  }

  const model = providerModel(provider, settings);
  const args = [...provider.argsTemplate];
  const replacements: Record<string, string> = {
    systemPrompt: CLI_SYSTEM_PROMPT,
    model,
    outputFile: "{outputFile}",
  };

  const resolved = replaceTokens(args, replacements);
  if (provider.modelArgs && (provider.alwaysModel || model)) {
    resolved.push(...replaceTokens(provider.modelArgs, replacements));
  }
  if (
    !options.forDetection &&
    provider.outputFileArgs
  ) {
    resolved.push(...replaceTokens(provider.outputFileArgs, replacements));
  }
  if (provider.argsSuffix) resolved.push(...provider.argsSuffix);

  if (provider.id === "custom") {
    resolved.length = 0;
    resolved.push(...settings.customArgs);
    if (model) {
      resolved.push(...replaceTokens(provider.modelArgs ?? [], replacements));
    }
  }

  return {
    command: providerCommand(provider, settings),
    args: resolved,
    stdinPrefix: provider.stdinPrefix ?? "",
    usesOutputFile:
      !options.forDetection && Boolean(provider.outputFileArgs),
  };
}

export function detectionCommand(
  provider: ProviderDefinition,
  settings: AiSettings,
): { command: string; args: string[] } | { url: string } {
  if (provider.detection.type === "http") {
    return {
      url: `${settings.ollamaUrl.replace(/\/+$/, "")}${provider.detection.path}`,
    };
  }
  return {
    command: providerCommand(provider, settings),
    args: provider.detection.args,
  };
}
