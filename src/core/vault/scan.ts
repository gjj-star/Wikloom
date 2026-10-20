import { ulid } from "ulid";
import type { FileSystemPort } from "../fs/types";
import type { Note } from "../notes/types";
import { joinVaultPath } from "../paths";
import { VaultError } from "./errors";
import {
  normalizeTags,
  serializeFrontmatter,
  splitFrontmatter,
  titleFromBody,
  titleFromPath,
  toTimestamp,
} from "./frontmatter";
import { atomicWriteText } from "./write";

export interface VaultFileError {
  path: string;
  message: string;
}

export interface ScanResult {
  notes: Note[];
  errors: VaultFileError[];
  scannedAt: number;
}

const MAX_FILES = 2000;
const MAX_DEPTH = 8;
const MANAGED_KEYS = new Set(["id", "title", "created", "updated", "tags"]);
const SKIP_DIRS = new Set([".git", "node_modules", ".obsidian", ".trash", ".tauri"]);

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function extraFields(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => !MANAGED_KEYS.has(key)),
  );
}

interface LoadedNote {
  note: Note;
  writeError?: string;
}

async function loadNote(
  fs: FileSystemPort,
  root: string,
  filePath: string,
  seenIds: Set<string>,
): Promise<LoadedNote> {
  const fullPath = joinVaultPath(root, filePath);
  const raw = await fs.readText(fullPath);
  const parsed = splitFrontmatter(raw);
  const stat = await fs.stat(fullPath).catch(() => null);
  const fallbackTime = stat?.mtimeMs ?? Date.now();
  const data = parsed.data;

  const filenameTitle = titleFromPath(filePath);
  const headingTitle = titleFromBody(parsed.body);
  const title =
    typeof data.title === "string" && data.title.trim()
      ? data.title.trim()
      : headingTitle || filenameTitle;

  const tags = normalizeTags(data.tags);
  const createdAt = toTimestamp(data.created, fallbackTime);
  const updatedAt = toTimestamp(data.updated, fallbackTime);

  let id =
    typeof data.id === "string" && data.id.trim() ? data.id.trim() : ulid();
  let dirty = !parsed.hasFrontmatter;

  if (typeof data.id !== "string" || !data.id.trim()) dirty = true;
  if (typeof data.title !== "string" || !data.title.trim()) dirty = true;
  if (data.tags === undefined || !Array.isArray(data.tags)) dirty = true;
  if (data.created === undefined) dirty = true;
  if (data.updated === undefined) dirty = true;

  if (seenIds.has(id)) {
    id = ulid();
    dirty = true;
  }
  seenIds.add(id);

  const extra = extraFields(data);
  const note: Note = {
    id,
    title,
    content: parsed.body,
    tags,
    filePath,
    createdAt,
    updatedAt,
    extra,
  };

  if (!dirty) return { note };

  const managed: Record<string, unknown> = {
    id,
    title,
    created: data.created ?? new Date(createdAt).toISOString(),
    updated: data.updated ?? new Date(updatedAt).toISOString(),
    tags,
    ...extra,
  };

  try {
    await atomicWriteText(
      fs,
      root,
      filePath,
      serializeFrontmatter(managed, parsed.body),
    );
  } catch (error) {
    return {
      note,
      writeError: `无法写回 frontmatter：${messageOf(error)}`,
    };
  }

  return { note };
}

/**
 * 递归扫描 vault：
 * - 跳过隐藏目录、符号链接、非 Markdown 文件
 * - 缺 frontmatter 的文件补齐 id / title / created / updated / tags 并写回
 * - 单个文件损坏只记录错误，不中断整库
 */
export async function scanVault(
  fs: FileSystemPort,
  root: string,
): Promise<ScanResult> {
  const rootStat = await fs.stat(root).catch(() => null);
  if (!rootStat) {
    throw new VaultError("VAULT_MISSING", "知识库文件夹不存在。", {
      path: root,
    });
  }
  if (!rootStat.isDirectory) {
    throw new VaultError("VAULT_NOT_DIRECTORY", "选择的路径不是文件夹。", {
      path: root,
    });
  }

  const notes: Note[] = [];
  const errors: VaultFileError[] = [];
  const seenIds = new Set<string>();
  let truncated = false;

  async function walk(relativeDir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || truncated) return;

    let entries;
    try {
      entries = await fs.list(joinVaultPath(root, relativeDir));
    } catch (error) {
      errors.push({
        path: relativeDir || ".",
        message: `目录读取失败：${messageOf(error)}`,
      });
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

    for (const entry of entries) {
      if (notes.length >= MAX_FILES) {
        truncated = true;
        return;
      }

      const relativePath = relativeDir
        ? `${relativeDir}/${entry.name}`
        : entry.name;

      if (entry.isSymlink) {
        errors.push({ path: relativePath, message: "已跳过符号链接。" });
        continue;
      }

      if (entry.isDirectory) {
        if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
        await walk(relativePath, depth + 1);
        continue;
      }

      if (
        entry.name.startsWith(".") ||
        !entry.name.toLowerCase().endsWith(".md")
      ) {
        continue;
      }

      try {
        const { note, writeError } = await loadNote(
          fs,
          root,
          relativePath,
          seenIds,
        );
        notes.push(note);
        if (writeError) {
          errors.push({ path: relativePath, message: writeError });
        }
      } catch (error) {
        errors.push({ path: relativePath, message: messageOf(error) });
      }
    }
  }

  await walk("", 0);

  if (truncated) {
    errors.push({
      path: ".",
      message: `笔记超过 ${MAX_FILES} 篇，本次只读取了前 ${MAX_FILES} 篇。`,
    });
  }

  notes.sort(
    (a, b) =>
      b.updatedAt - a.updatedAt || a.title.localeCompare(b.title, "zh-CN"),
  );

  return { notes, errors, scannedAt: Date.now() };
}
