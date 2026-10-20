export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  /** 相对知识库根目录的 POSIX 路径，例如 `notes/foo.md` */
  filePath: string;
  createdAt: number;
  updatedAt: number;
  /** frontmatter 里除托管字段外的其他键，保存时原样写回 */
  extra: Record<string, unknown>;
}
