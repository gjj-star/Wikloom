export type ProviderId =
  | "claude"
  | "codex"
  | "gemini"
  | "ollama"
  | "custom";

export interface CustomMode {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

export interface AiSettings {
  provider: ProviderId;
  claudePath: string;
  claudeModel: string;
  geminiPath: string;
  geminiModel: string;
  codexPath: string;
  codexModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  customPath: string;
  customModel: string;
  customArgs: string[];
  defaultModeId: string;
  customModes: CustomMode[];
}

export const AI_SETTINGS_KEY = "wikloom:ai-settings";

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: "claude",
  claudePath: "claude",
  claudeModel: "",
  geminiPath: "gemini",
  geminiModel: "",
  codexPath: "codex",
  codexModel: "",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "llama3",
  customPath: "",
  customModel: "",
  customArgs: [],
  defaultModeId: "",
  customModes: [],
};

const PROVIDERS: ProviderId[] = [
  "claude",
  "codex",
  "gemini",
  "ollama",
  "custom",
];

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeCustomModes(value: unknown): CustomMode[] {
  if (!Array.isArray(value)) return [];
  const modes: CustomMode[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = asString(record.id, "").trim();
    const name = asString(record.name, "").trim();
    const prompt = asString(record.prompt, "");
    if (!id || !name || !prompt.trim() || seen.has(id)) continue;
    seen.add(id);
    modes.push({
      id,
      name,
      description: asString(record.description, "").trim(),
      prompt,
    });
  }
  return modes;
}

export function normalizeAiSettings(value: unknown): AiSettings {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    provider: PROVIDERS.includes(raw.provider as ProviderId)
      ? (raw.provider as ProviderId)
      : DEFAULT_AI_SETTINGS.provider,
    claudePath: asString(raw.claudePath, DEFAULT_AI_SETTINGS.claudePath),
    claudeModel: asString(raw.claudeModel, DEFAULT_AI_SETTINGS.claudeModel),
    geminiPath: asString(raw.geminiPath, DEFAULT_AI_SETTINGS.geminiPath),
    geminiModel: asString(raw.geminiModel, DEFAULT_AI_SETTINGS.geminiModel),
    codexPath: asString(raw.codexPath, DEFAULT_AI_SETTINGS.codexPath),
    codexModel: asString(raw.codexModel, DEFAULT_AI_SETTINGS.codexModel),
    ollamaUrl: asString(raw.ollamaUrl, DEFAULT_AI_SETTINGS.ollamaUrl),
    ollamaModel: asString(raw.ollamaModel, DEFAULT_AI_SETTINGS.ollamaModel),
    customPath: asString(raw.customPath, DEFAULT_AI_SETTINGS.customPath),
    customModel: asString(raw.customModel, DEFAULT_AI_SETTINGS.customModel),
    customArgs: Array.isArray(raw.customArgs)
      ? raw.customArgs
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
    defaultModeId: asString(
      raw.defaultModeId,
      DEFAULT_AI_SETTINGS.defaultModeId,
    ),
    customModes: normalizeCustomModes(raw.customModes),
  };
}

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    return normalizeAiSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export function saveAiSettings(settings: AiSettings): void {
  try {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 隐私模式或配额不足时只保留内存状态
  }
}
