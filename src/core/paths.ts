export class VaultPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultPathError";
  }
}

export function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

export function stripTrailingSlash(value: string): string {
  const normalized = normalizeSlashes(value);
  if (normalized === "/" || /^[a-zA-Z]:\/$/.test(normalized)) return normalized;
  return normalized.replace(/\/+$/, "");
}

export function basenameOf(value: string): string {
  const path = stripTrailingSlash(value);
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}

export function dirnameOf(value: string): string {
  const path = stripTrailingSlash(value);
  const index = path.lastIndexOf("/");
  if (index === -1) return "";
  if (index === 0) return "/";
  return path.slice(0, index);
}

export function isAbsolutePath(value: string): boolean {
  const path = normalizeSlashes(value);
  return path.startsWith("/") || /^[a-zA-Z]:\//.test(path) || path.startsWith("//");
}

export function assertRelativePath(value: string): void {
  const path = normalizeSlashes(value);
  if (path.includes("\0")) {
    throw new VaultPathError("路径包含非法字符。");
  }
  if (isAbsolutePath(path)) {
    throw new VaultPathError("不允许使用绝对路径。");
  }
  if (path.split("/").includes("..")) {
    throw new VaultPathError("路径不能包含 ..。");
  }
}

/** 把相对路径安全地拼到 vault root 下；越界或绝对路径直接抛错。 */
export function joinVaultPath(root: string, relativePath: string): string {
  const raw = normalizeSlashes(relativePath);
  if (raw.trim() !== "") assertRelativePath(raw);
  const relative = raw
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
  const base = stripTrailingSlash(root);
  return relative ? `${base}/${relative}` : base;
}

export function isPathInside(root: string, candidate: string): boolean {
  const base = stripTrailingSlash(normalizeSlashes(root));
  const target = normalizeSlashes(candidate).replace(/\/+/g, "/");
  const caseInsensitive =
    /^[a-zA-Z]:\//.test(base) || base.startsWith("//");
  const a = caseInsensitive ? base.toLowerCase() : base;
  const b = caseInsensitive ? target.toLowerCase() : target;

  if (a === "/") return b.startsWith("/");
  return b === a || b.startsWith(`${a}/`);
}

export function displayNameFromRoot(root: string): string {
  const name = basenameOf(root);
  return name || root;
}
