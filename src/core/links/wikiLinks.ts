export interface WikiLink {
  target: string;
  label: string;
  /** 原文中的起止下标，反链摘要截取时用。 */
  start: number;
  end: number;
}

const WIKI_PATTERN = /\[\[([^\]|\n]+?)(?:\|([^\]\n]+))?\]\]/g;

/**
 * 取出正文里的 wiki 链接，跳过围栏代码块与行内代码。
 * 返回的 start / end 指向原 Markdown，不是清洗后的文本。
 */
export function extractWikiLinks(markdown: string): WikiLink[] {
  const links: WikiLink[] = [];
  let offset = 0;
  let inFence = false;

  for (const line of markdown.split(/(?<=\n)/)) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = !inFence;
      offset += line.length;
      continue;
    }

    if (!inFence) {
      let column = 0;
      for (const part of line.split(/(`[^`\n]*`)/)) {
        if (part && !part.startsWith("`")) {
          WIKI_PATTERN.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = WIKI_PATTERN.exec(part))) {
            const target = match[1].trim();
            if (!target) continue;
            const start = offset + column + match.index;
            links.push({
              target,
              label: (match[2] ?? target).trim(),
              start,
              end: start + match[0].length,
            });
          }
        }
        column += part.length;
      }
    }

    offset += line.length;
  }

  return links;
}

/** 逐行处理非代码区域，代码块与行内代码原样保留。 */
function mapOutsideCode(markdown: string, transform: (text: string) => string): string {
  let inFence = false;

  return markdown
    .split("\n")
    .map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line
        .split(/(`[^`\n]*`)/)
        .map((part) => (part.startsWith("`") ? part : transform(part)))
        .join("");
    })
    .join("\n");
}

/** [[标题]] / [[标题|别名]] → [别名](wikilink:编码后的标题)，交给 Markdown 渲染。 */
export function preprocessWikiLinks(markdown: string): string {
  return mapOutsideCode(markdown, (text) =>
    text.replace(WIKI_PATTERN, (_raw, target: string, label?: string) => {
      const cleanTarget = target.trim();
      const cleanLabel = (label ?? target).trim();
      return `[${cleanLabel}](wikilink:${encodeURIComponent(cleanTarget)})`;
    }),
  );
}
