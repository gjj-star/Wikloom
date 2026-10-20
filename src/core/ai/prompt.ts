import pluginData from "../../../docs/plugin-modes.json";
import type { CustomMode } from "./settings";

export interface NoteMode {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  isDefault?: boolean;
  prompt: string;
  custom?: boolean;
}

export interface InlineAction {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  prompt: string;
}

export interface PromptSuffixes {
  description?: string;
  fullNoteRules: string;
  inlineRules: string;
  appendRules: string;
}

const data = pluginData as unknown as {
  noteModes: NoteMode[];
  inlineActions: InlineAction[];
  promptSuffixes: PromptSuffixes;
  customModes: {
    defaultTemplate: string;
    defaultObject: Omit<NoteMode, "prompt" | "custom"> & { prompt: string };
    uiCopy: string;
  };
};

/** 原样来自插件 bundle 的 CLI system prompt（JSON 未收录）。 */
export const CLI_SYSTEM_PROMPT =
  "Output ONLY the note content as markdown text directly to stdout. Write from your training knowledge. You CAN use web search if needed. Do not ask questions. Do not offer alternatives. Do not attempt to save or write files. Just output the note content directly as your response.";

/** Ollama 分支的 system prompt，同样原样来自 bundle。 */
export const OLLAMA_SYSTEM_PROMPT =
  "Output ONLY the note content as markdown text directly. Write from your training knowledge. Do not ask questions. Do not offer alternatives. Just output the note content directly as your response.";

export const EMPTY_TOPIC_CONTEXT =
  "This note is being created from scratch. There is no existing source note.";

export const NOTE_MODES = data.noteModes;
export const INLINE_ACTIONS = data.inlineActions;
export const PROMPT_SUFFIXES = data.promptSuffixes;
export const CUSTOM_MODE_TEMPLATE = data.customModes.defaultTemplate;
export const CUSTOM_MODE_DEFAULT_OBJECT = data.customModes.defaultObject;
export const CUSTOM_MODE_UI_COPY = data.customModes.uiCopy;

/** 自定义模式与内置模式合并；非空提示词原样保留，空提示词回退到插件模板。 */
export function mergeModes(customModes: CustomMode[]): NoteMode[] {
  return [
    ...NOTE_MODES,
    ...customModes.map((mode) => ({
      id: mode.id,
      name: mode.name,
      icon: "pencil",
      description: mode.description,
      prompt: mode.prompt.trim() ? mode.prompt : CUSTOM_MODE_TEMPLATE,
      custom: true,
    })),
  ];
}

export function findMode(
  modeId: string,
  customModes: CustomMode[],
): NoteMode | undefined {
  return mergeModes(customModes).find((mode) => mode.id === modeId);
}

/** 未知模式回退到内置默认模式（explain）。 */
export function resolveMode(
  modeId: string,
  customModes: CustomMode[],
): NoteMode {
  const modes = mergeModes(customModes);
  return (
    modes.find((mode) => mode.id === modeId) ??
    modes.find((mode) => mode.isDefault) ??
    modes[0]
  );
}

export function escapePromptValue(value: string): string {
  // 插件行为：只转义双引号，让 {selection}/{context} 落在模板引号里也安全。
  return value.replace(/"/g, '\\"');
}

export function fillPrompt(
  template: string,
  values: { selection: string; context: string },
): string {
  return template
    .replace(/\{selection\}/g, escapePromptValue(values.selection))
    .replace(/\{context\}/g, escapePromptValue(values.context));
}

export function todayIso(): string {
  // 与插件一致：用 ISO/UTC 日期，不随本地时区跨日漂移。
  return new Date().toISOString().slice(0, 10);
}

export function renderSuffix(
  suffix: string,
  today: string = todayIso(),
): string {
  return suffix
    .replace(/\$\{today\}/g, today)
    .replace(/\{today\}/g, today);
}

export function inlineContext(content: string): string {
  return content.length > 2000
    ? `${content.slice(0, 2000)}\n...(truncated)`
    : content;
}

export function buildFullNotePrompt(
  mode: NoteMode,
  topic: string,
  context = EMPTY_TOPIC_CONTEXT,
  today?: string,
): string {
  return (
    fillPrompt(mode.prompt, { selection: topic, context }) +
    renderSuffix(PROMPT_SUFFIXES.fullNoteRules, today)
  );
}

export function buildInlinePrompt(
  action: InlineAction,
  selection: string,
  noteContent: string,
  today?: string,
): string {
  return (
    fillPrompt(action.prompt, {
      selection,
      context: inlineContext(noteContent),
    }) + renderSuffix(PROMPT_SUFFIXES.inlineRules, today)
  );
}

/** 预留给后续“追加到当前笔记”流程。 */
export function buildAppendPrompt(
  mode: NoteMode,
  noteContent: string,
  today?: string,
): string {
  return (
    fillPrompt(mode.prompt, { selection: "", context: noteContent }) +
    renderSuffix(PROMPT_SUFFIXES.appendRules, today)
  );
}
