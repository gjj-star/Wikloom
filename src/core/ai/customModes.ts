import {
  CUSTOM_MODE_DEFAULT_OBJECT,
  CUSTOM_MODE_TEMPLATE,
} from "./prompt";
import type { CustomMode } from "./settings";

/** 插件规则：名称转小写、空白转连字符、只保留 a-z0-9-。 */
export function deriveCustomModeId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function uniqueCustomModeId(
  desired: string,
  modes: Array<{ id: string }>,
  fallback: string,
): string {
  const base = desired.trim() || fallback;
  let candidate = base;
  let suffix = 2;
  while (modes.some((mode) => mode.id === candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function createCustomMode(
  existing: CustomMode[],
  now = Date.now(),
): CustomMode {
  const fallback = `custom-${now}`;
  return {
    id: uniqueCustomModeId(fallback, existing, fallback),
    name: CUSTOM_MODE_DEFAULT_OBJECT.name,
    description:
      CUSTOM_MODE_DEFAULT_OBJECT.description ?? "My custom mode",
    prompt: CUSTOM_MODE_TEMPLATE,
  };
}

export function validateCustomModeDraft(draft: CustomMode): string | null {
  if (!draft.name.trim()) return "模式名称不能为空。";
  if (!draft.description.trim()) return "说明不能为空。";
  if (!draft.prompt.trim()) return "提示词不能为空。";
  return null;
}
