import { ulid } from "ulid";
import type { FileSystemPort } from "../fs/types";
import type { Note } from "../notes/types";
import { basenameOf, dirnameOf, joinVaultPath } from "../paths";
import { VaultError, toVaultError } from "./errors";
import { sanitizeFileStem, serializeFrontmatter } from "./frontmatter";

export function serializeNote(note: Note): string {
  const data: Record<string, unknown> = {
    id: note.id,
    title: note.title,
    created: new Date(note.createdAt).toISOString(),
    updated: new Date(note.updatedAt).toISOString(),
    tags: note.tags,
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
