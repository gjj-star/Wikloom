import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export interface FrontmatterSplit {
  data: Record<string, unknown>;
  body: string;
  hasFrontmatter: boolean;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function splitFrontmatter(raw: string): FrontmatterSplit {
  const text = raw.replace(/^\uFEFF/, "");
  const match = FRONTMATTER.exec(text);

  if (!match) {
    if (/^---\r?\n/.test(text)) {
      throw new Error("frontmatter 缺少结束的 ---");
    }
    return { data: {}, body: text, hasFrontmatter: false };
  }

  const parsed = parseYaml(match[1]) as unknown;
  if (parsed == null) {
    return {
      data: {},
      body: text.slice(match[0].length),
      hasFrontmatter: true,
    };
  }
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("frontmatter 不是键值对象");
  }

  return {
    data: parsed as Record<string, unknown>,
    body: text.slice(match[0].length).replace(/^\n+/, ""),
    hasFrontmatter: true,
  };
}

export function serializeFrontmatter(
  data: Record<string, unknown>,
  body: string,
): string {
  const yamlText = stringifyYaml(data, { lineWidth: 0 }).trimEnd();
  const cleanBody = body.replace(/^\n+/, "");
  const normalizedBody =
    cleanBody === "" || cleanBody.endsWith("\n")
      ? cleanBody
      : `${cleanBody}\n`;
  return `---\n${yamlText}\n---\n\n${normalizedBody}`;
}

export function normalizeTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.map((item) =>
        typeof item === "string" ? item.trim() : String(item).trim(),
      )
    : typeof value === "string"
      ? value.split(/[,，]/).map((item) => item.trim())
      : [];

  const seen = new Set<string>();
  const tags: string[] = [];
  for (const tag of raw) {
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

export function toTimestamp(value: unknown, fallback: number): number {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getTime();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e11 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

export function titleFromBody(body: string): string {
  const match = /^#\s+(.+)$/m.exec(body);
  return match ? match[1].trim() : "";
}

export function titleFromPath(filePath: string): string {
  const name = filePath.split("/").pop() ?? filePath;
  return name.replace(/\.md$/i, "").trim();
}

/** 文件名里不能出现的字符，替换掉；中文和空格保留。 */
export function sanitizeFileStem(value: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 80)
    .trim();
  return cleaned || "未命名笔记";
}
