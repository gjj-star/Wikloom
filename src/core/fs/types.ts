export interface DirEntry {
  name: string;
  /** 绝对路径（Tauri）或虚拟绝对路径（内存 FS） */
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
}

export interface FileStat {
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
  mtimeMs: number;
}

/**
 * 知识库的唯一 I/O 边界。
 * 路径一律是绝对路径；调用方负责保证在 vault root 内。
 */
export interface FileSystemPort {
  readonly kind: "tauri" | "memory";
  list(path: string): Promise<DirEntry[]>;
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  stat(path: string): Promise<FileStat | null>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}
