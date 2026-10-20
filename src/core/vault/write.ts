import { ulid } from "ulid";
import type { FileSystemPort } from "../fs/types";
import type { Note } from "../notes/types";
import {
  assertRelativePath,
  basenameOf,
  dirnameOf,
  joinVaultPath,
  normalizeSlashes,
} from "../paths";
import { VaultError, toVaultError } from "./errors";
import {
  normalizeTags,
  sanitizeFileStem,
  serializeFrontmatter,
} from "./frontmatter";

export function serializeNote(note: Note): string {
  const data: Record<string, unknown> = {
    id: note.id,
    title: note.title,
    created: new Date(note.createdAt).toISOString(),
    updated: new Date(note.updatedAt).toISOString(),
    // 空标签不写成 `tags: []`，删光后 frontmatter 里不留空壳。
    ...(note.tags.length > 0 ? { tags: note.tags } : {}),
    ...note.extra,
  };
  return serializeFrontmatter(data, note.content);
}

/** 写临时文件再 rename，避免写到一半崩溃留下半个文件。 */
export async function atomicWriteText(
  fs: FileSystemPort,
  root: string,
  relativePath: string,
  text: string,
): Promise<void> {
  const relativeDir = dirnameOf(relativePath);
  const fullDir = joinVaultPath(root, relativeDir === "/" ? "" : relativeDir);
  await fs.mkdir(fullDir);

  const tempName = `.${basenameOf(relativePath)}.${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}.tmp`;
  const tempRelative =
    relativeDir && relativeDir !== "/"
      ? `${relativeDir}/${tempName}`
      : tempName;
  const tempFull = joinVaultPath(root, tempRelative);
  const targetFull = joinVaultPath(root, relativePath);

  try {
    await fs.writeText(tempFull, text);
    await fs.rename(tempFull, targetFull);
  } catch (error) {
    try {
      await fs.remove(tempFull);
    } catch {
      // 临时文件可能压根没创建成功
    }
    throw toVaultError(error, "WRITE_FAILED", "保存笔记失败。");
  }
}

export async function writeNoteFile(
  fs: FileSystemPort,
  root: string,
  note: Note,
): Promise<void> {
  await atomicWriteText(fs, root, note.filePath, serializeNote(note));
}

export async function createEmptyNote(
  fs: FileSystemPort,
  root: string,
  existingNotes: Note[],
  now = Date.now(),
): Promise<Note> {
  const baseTitle = "未命名笔记";
  let title = baseTitle;
  let filePath = `${sanitizeFileStem(title)}.md`;
  let suffix = 2;

  while (
    existingNotes.some((note) => note.filePath === filePath) ||
    (await fs.stat(joinVaultPath(root, filePath))) !== null
  ) {
    title = `${baseTitle} ${suffix}`;
    filePath = `${sanitizeFileStem(title)}.md`;
    suffix += 1;
    if (suffix > 500) {
      throw new VaultError("WRITE_FAILED", "无法为新建笔记生成唯一文件名。");
    }
  }

  const note: Note = {
    id: ulid(),
    title,
    content: "",
    tags: [],
    filePath,
    createdAt: now,
    updatedAt: now,
    extra: {},
  };
  await writeNoteFile(fs, root, note);
  return note;
}

const NOTE_MANAGED_KEYS = new Set([
  "id",
  "title",
  "created",
  "updated",
  "tags",
]);

function cleanTitle(value: string): string {
  return (
    value
      .replace(/[\r\n\t]+/g, " ")
      .trim()
      .slice(0, 200) || "未命名笔记"
  );
}

/**
 * 把用户输入的子文件夹规范成 vault 内的相对路径。
 * 绝对路径、`..`、NUL 直接拒绝；空段和 `./` 被忽略。
 */
export function normalizeNoteFolder(folder: string): string {
  const raw = normalizeSlashes(folder).trim();
  if (!raw) return "";
  assertRelativePath(raw);

  return raw
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== ".")
    .map((segment) => sanitizeFileStem(segment))
    .join("/");
}

/** 预览用路径；实际写入时如果重名，会自动追加序号。 */
export function notePathForTitle(folder: string, title: string): string {
  const normalizedFolder = normalizeNoteFolder(folder);
  const stem = sanitizeFileStem(cleanTitle(title));
  return normalizedFolder ? `${normalizedFolder}/${stem}.md` : `${stem}.md`;
}

function retitleContent(content: string, title: string): string {
  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)#\s+\S/.exec(lines[index]);
    if (!match) continue;
    lines[index] = `${match[1]}# ${title}`;
    break;
  }
  return lines.join("\n");
}

async function uniqueNotePath(
  fs: FileSystemPort,
  root: string,
  folder: string,
  baseTitle: string,
  existingNotes: Note[],
): Promise<{ title: string; filePath: string }> {
  let title = baseTitle;
  let suffix = 2;

  for (;;) {
    const filePath = notePathForTitle(folder, title);
    const inIndex = existingNotes.some((note) => note.filePath === filePath);
    const onDisk =
      !inIndex && (await fs.stat(joinVaultPath(root, filePath))) !== null;
    if (!inIndex && !onDisk) return { title, filePath };
    if (suffix > 500) {
      throw new VaultError("WRITE_FAILED", "无法为生成笔记生成唯一文件名。");
    }
    title = `${baseTitle} ${suffix}`;
    suffix += 1;
  }
}

export interface NewNoteContent {
  title: string;
  content: string;
  tags?: string[];
  folder?: string;
  /** frontmatter 里的非托管字段，例如生成结果带的 status。 */
  extra?: Record<string, unknown>;
}

/**
 * 用生成好的 Markdown 建一条新笔记，走现有的原子写链路。
 * 托管字段（id/title/created/updated/tags）由 Wikloom 自己生成，
 * 生成结果里的同名 frontmatter 字段不会覆盖它们。
 */
export async function createNoteWithContent(
  fs: FileSystemPort,
  root: string,
  existingNotes: Note[],
  input: NewNoteContent,
  now = Date.now(),
): Promise<Note> {
  const folder = normalizeNoteFolder(input.folder ?? "");
  const baseTitle = cleanTitle(input.title);
  const { title, filePath } = await uniqueNotePath(
    fs,
    root,
    folder,
    baseTitle,
    existingNotes,
  );
  const content =
    title === baseTitle ? input.content : retitleContent(input.content, title);
  const extra = Object.fromEntries(
    Object.entries(input.extra ?? {}).filter(
      ([key]) => !NOTE_MANAGED_KEYS.has(key),
    ),
  );

  const note: Note = {
    id: ulid(),
    title,
    content,
    tags: normalizeTags(input.tags ?? []),
    filePath,
    createdAt: now,
    updatedAt: now,
    extra,
  };
  await writeNoteFile(fs, root, note);
  return note;
}
