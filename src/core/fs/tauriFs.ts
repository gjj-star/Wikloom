import type { FileStat, FileSystemPort } from "./types";
import {
  isPathInside,
  normalizeSlashes,
  stripTrailingSlash,
  VaultPathError,
} from "../paths";

function isMissingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such file|not found|os error 2|os error 3|ENOENT|不存在|找不到指定的路径/i.test(
    message,
  );
}

/**
 * Tauri 版文件系统：plugin-fs 做 I/O。
 * 目录选择与 scope 放行在 Rust 的 pick_vault 命令里完成，前端不接触路径授权。
 */
export async function createTauriFileSystem(
  root: string,
): Promise<FileSystemPort> {
  const api = await import("@tauri-apps/plugin-fs");
  const base = stripTrailingSlash(normalizeSlashes(root));

  function requireInside(path: string): string {
    if (!isPathInside(base, path)) {
      throw new VaultPathError("路径越界，已拒绝访问。");
    }
    return path;
  }

  async function assertNoSymlink(path: string): Promise<void> {
    const target = stripTrailingSlash(normalizeSlashes(path));
    if (target === base) return;

    const relative = target.slice(base.length + 1);
    const segments = relative.split("/").filter(Boolean);
    let current = base;

    for (const segment of segments) {
      current = `${current}/${segment}`;
      let info;
      try {
        info = await api.lstat(current);
      } catch (error) {
        if (isMissingError(error)) return;
        throw error;
      }
      if (info.isSymlink) {
        throw new VaultPathError(
          "不允许通过符号链接访问知识库外的文件。",
        );
      }
    }
  }

  async function guard(path: string): Promise<string> {
    const inside = requireInside(path);
    await assertNoSymlink(inside);
    return inside;
  }

  return {
    kind: "tauri",

    async list(path) {
      const safe = await guard(path);
      const entries = await api.readDir(safe);
      return entries.map((entry) => ({
        name: entry.name,
        path: `${stripTrailingSlash(normalizeSlashes(safe))}/${entry.name}`,
        isDirectory: entry.isDirectory,
        isSymlink: entry.isSymlink,
      }));
    },

    async readText(path) {
      return api.readTextFile(await guard(path));
    },

    async writeText(path, content) {
      await api.writeTextFile(await guard(path), content);
    },

    async stat(path): Promise<FileStat | null> {
      requireInside(path);
      try {
        await assertNoSymlink(path);
        const info = await api.stat(path);
        return {
          isFile: info.isFile,
          isDirectory: info.isDirectory,
          isSymlink: info.isSymlink,
          size: info.size,
          mtimeMs: info.mtime ? info.mtime.getTime() : Date.now(),
        };
      } catch (error) {
        if (error instanceof VaultPathError) throw error;
        if (isMissingError(error)) return null;
        throw error;
      }
    },

    async mkdir(path) {
      await api.mkdir(await guard(path), { recursive: true });
    },

    async remove(path) {
      await api.remove(await guard(path), { recursive: true });
    },

    async rename(from, to) {
      await guard(from);
      await guard(to);
      await api.rename(from, to);
    },
  };
}
