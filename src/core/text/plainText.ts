/** 把 Markdown 压成一行纯文本，用于摘要、搜索与字数统计。 */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_raw, target: string, label?: string) => label ?? target)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+(?:\[[ xX]\]\s+)?/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function excerpt(markdown: string, maxLength = 120): string {
  // 列表摘要不重复正文首行的标题
  const body = markdown.replace(/^\s*#{1,6}[^\n]*\n+/, "");
  const text = plainText(body);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

/** 中文字数：去掉空白后的字符数。 */
export function countCharacters(markdown: string): number {
  return plainText(markdown).replace(/\s/g, "").length;
}
