import type { DirEntry, FileSystemPort } from "./types";

export function memoryPersistKey(root: string): string {
  return `wikloom:memfs:${encodeURIComponent(root)}`;
}

export function hasMemoryState(root: string): boolean {
  try {
    return localStorage.getItem(memoryPersistKey(root)) !== null;
  } catch {
    return false;
  }
}

interface MemoryState {
  files: Record<string, string>;
  dirs: Record<string, true>;
  mtimes: Record<string, number>;
}

const states = new Map<string, MemoryState>();

/** 只接受绝对、POSIX 风格的虚拟路径（如 /vaults/demo）。 */
function normalizeVirtualPath(value: string): string {
  const slashed = value.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (!slashed.startsWith("/")) {
    throw new Error(`内存文件系统只接受绝对路径：${value}`);
  }
  return slashed.length > 1 && slashed.endsWith("/")
    ? slashed.replace(/\/+$/, "")
    : slashed;
}

function parentOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index <= 0 ? "/" : path.slice(0, index);
}

function readPersisted(key: string): MemoryState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MemoryState>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      files: parsed.files ?? {},
      dirs: parsed.dirs ?? {},
      mtimes: parsed.mtimes ?? {},
    };
  } catch {
    return null;
  }
}

function persist(key: string, state: MemoryState): void {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // 隐私模式或配额不足时退化为纯内存
  }
}

function seedState(
  seed: Record<string, string>,
  base: string,
): MemoryState {
  const state: MemoryState = { files: {}, dirs: { "/": true }, mtimes: {} };
  for (const [path, content] of Object.entries(seed)) {
    const raw = path.startsWith("/") ? path : `${base}/${path}`;
    const normalized = normalizeVirtualPath(raw);
    state.files[normalized] = content;
    state.mtimes[normalized] = Date.now();
    let cursor = parentOf(normalized);
    while (cursor !== "/") {
      state.dirs[cursor] = true;
      cursor = parentOf(cursor);
    }
    state.dirs["/"] = true;
  }
  return state;
}

export interface MemoryFileSystemOptions {
  seed?: Record<string, string>;
  persistKey?: string;
  now?: () => number;
}

/**
 * Web / dev / Playwright 用的内存文件系统。
 * 传入 persistKey 时会把内容写成 localStorage，刷新后仍然存在，
 * 方便在浏览器里验证「关掉重开」的完整链路。
 */
export function createMemoryFileSystem(
  root: string,
  options: MemoryFileSystemOptions = {},
): FileSystemPort {
  const base = normalizeVirtualPath(root);
  const key = options.persistKey ?? memoryPersistKey(base);
  const now = options.now ?? (() => Date.now());

  let state = states.get(key) ?? readPersisted(key);
  if (!state) {
    state = seedState(options.seed ?? {}, base);
    state.dirs[base] = true;
  } else {
    state.dirs[base] = true;
  }
  states.set(key, state);
  persist(key, state);

  function save(): void {
    persist(key, state as MemoryState);
  }

  function ensureParents(path: string): void {
    let cursor = parentOf(path);
    const chain: string[] = [];
    while (cursor !== "/") {
      chain.push(cursor);
      cursor = parentOf(cursor);
    }
    for (const dir of chain.reverse()) state!.dirs[dir] = true;
    state!.dirs["/"] = true;
  }

  function isFile(path: string): boolean {
    return Object.hasOwn(state!.files, path);
  }

  function isDirectory(path: string): boolean {
    return Boolean(state!.dirs[path]);
  }

  function assertDirectory(path: string): void {
    if (!isDirectory(path)) {
      throw new Error(`ENOENT: 目录不存在 ${path}`);
    }
  }

  function assertFile(path: string): void {
    if (!isFile(path)) {
      throw new Error(`ENOENT: 文件不存在 ${path}`);
    }
  }

  return {
    kind: "memory",

    async list(path) {
      const dir = normalizeVirtualPath(path);
      assertDirectory(dir);
      const children = new Map<string, boolean>();

      for (const candidate of Object.keys(state!.dirs)) {
        if (candidate === dir || !candidate.startsWith(`${dir}/`)) continue;
        const rest = candidate.slice(dir.length + 1);
        if (!rest || rest.includes("/")) continue;
        children.set(rest, true);
      }
      for (const file of Object.keys(state!.files)) {
        if (!file.startsWith(`${dir}/`)) continue;
        const rest = file.slice(dir.length + 1);
        const slash = rest.indexOf("/");
        const name = slash === -1 ? rest : rest.slice(0, slash);
        const isDir = slash !== -1;
        children.set(name, children.get(name) === true || isDir);
      }

      const entries: DirEntry[] = [...children.entries()]
        .map(([name, isDir]) => ({
          name,
          path: dir === "/" ? `/${name}` : `${dir}/${name}`,
          isDirectory: isDir,
          isSymlink: false,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
      return entries;
    },

    async readText(path) {
      const file = normalizeVirtualPath(path);
      assertFile(file);
      return state!.files[file];
    },

    async writeText(path, content) {
      const file = normalizeVirtualPath(path);
      if (isDirectory(file)) throw new Error(`EISDIR: ${file}`);
      ensureParents(file);
      state!.files[file] = content;
      state!.mtimes[file] = now();
      save();
    },

    async stat(path) {
      const target = normalizeVirtualPath(path);
      if (isFile(target)) {
        const content = state!.files[target];
        return {
          isFile: true,
          isDirectory: false,
          isSymlink: false,
          size: new TextEncoder().encode(content).length,
          mtimeMs: state!.mtimes[target] ?? now(),
        };
      }
      if (isDirectory(target)) {
        return {
          isFile: false,
          isDirectory: true,
          isSymlink: false,
          size: 0,
          mtimeMs: now(),
        };
      }
      return null;
    },

    async mkdir(path) {
      const dir = normalizeVirtualPath(path);
      state!.dirs[dir] = true;
      ensureParents(dir);
      save();
    },

    async remove(path) {
      const target = normalizeVirtualPath(path);
      let changed = false;
      if (isFile(target)) {
        delete state!.files[target];
        delete state!.mtimes[target];
        changed = true;
      }
      for (const file of Object.keys(state!.files)) {
        if (file.startsWith(`${target}/`)) {
          delete state!.files[file];
          delete state!.mtimes[file];
          changed = true;
        }
      }
      for (const dir of Object.keys(state!.dirs)) {
        if (dir === target || dir.startsWith(`${target}/`)) {
          delete state!.dirs[dir];
          changed = true;
        }
      }
      if (changed) save();
    },

    async rename(from, to) {
      const source = normalizeVirtualPath(from);
      const target = normalizeVirtualPath(to);
      if (isFile(source)) {
        if (!isFile(source)) throw new Error(`ENOENT: ${source}`);
        ensureParents(target);
        state!.files[target] = state!.files[source];
        state!.mtimes[target] = state!.mtimes[source] ?? now();
        delete state!.files[source];
        delete state!.mtimes[source];
        save();
        return;
      }
      if (!isDirectory(source)) throw new Error(`ENOENT: ${source}`);
      ensureParents(target);
      for (const dir of Object.keys(state!.dirs)) {
        if (dir === source || dir.startsWith(`${source}/`)) {
          const next = target + dir.slice(source.length);
          state!.dirs[next] = true;
          delete state!.dirs[dir];
        }
      }
      for (const file of Object.keys(state!.files)) {
        if (file === source || file.startsWith(`${source}/`)) {
          const next = target + file.slice(source.length);
          state!.files[next] = state!.files[file];
          state!.mtimes[next] = state!.mtimes[file] ?? now();
          delete state!.files[file];
          delete state!.mtimes[file];
        }
      }
      save();
    },
  };
}
