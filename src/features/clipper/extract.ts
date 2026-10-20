import { countCharacters, excerpt as plainExcerpt } from "../../core/text/plainText";

export interface ClipParser {
  Defuddle: typeof import("defuddle/full").default;
  createMarkdownContent: typeof import("defuddle/full").createMarkdownContent;
  parseHTML: typeof import("linkedom").parseHTML;
}

export interface ExtractedClip {
  title: string;
  markdown: string;
  wordCount: number;
  excerpt: string;
  domain: string;
  sourceUrl: string;
  usedFallback: boolean;
}

export class ClipExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClipExtractError";
  }
}

let parserPromise: Promise<ClipParser> | null = null;

/** 只在剪藏打开/抓取时调用；保持动态导入，避免进首屏主包。 */
export function loadClipParser(): Promise<ClipParser> {
  if (!parserPromise) {
    parserPromise = Promise.all([
      import("defuddle/full"),
      import("linkedom"),
    ]).then(([defuddle, linkedom]) => ({
      Defuddle: defuddle.default,
      createMarkdownContent: defuddle.createMarkdownContent,
      parseHTML: linkedom.parseHTML,
    }));
  }
  return parserPromise;
}

export function resetClipParser(): void {
  parserPromise = null;
}

function absoluteUrl(value: string, base: string): string | null {
  try {
    const url = new URL(value, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * linkedom 的 document.defaultView 在浏览器里会落到原生 window，
 * Defuddle 调 window.getComputedStyle(linkedom 节点) 会报 Illegal invocation。
 * 给 Defuddle 一个最小布局 stub，隐藏元素/表格判定就不会越界调原生 DOM。
 */
function patchLinkedomView(document: Document): void {
  const getComputedStyle = () =>
    ({
      display: "block",
      visibility: "visible",
      opacity: "1",
      getPropertyValue: () => "",
    }) as unknown as CSSStyleDeclaration;
  Object.defineProperty(document, "defaultView", {
    value: { getComputedStyle },
    configurable: true,
  });
}

function absolutizeDocument(document: Document, pageUrl: string): void {
  const baseElement = document.querySelector("base[href]");
  const base =
    absoluteUrl(baseElement?.getAttribute("href") ?? "", pageUrl) ?? pageUrl;

  for (const image of Array.from(document.querySelectorAll("img"))) {
    const lazy =
      image.getAttribute("data-src") ||
      image.getAttribute("data-original") ||
      image.getAttribute("data-lazy-src");
    if (lazy) image.setAttribute("src", lazy);
    const source = image.getAttribute("src");
    if (source) {
      const resolved = absoluteUrl(source, base);
      if (resolved) image.setAttribute("src", resolved);
    }
  }

  for (const element of Array.from(
    document.querySelectorAll("a[href], source[src], video[poster], iframe[src]"),
  )) {
    const attribute = element.hasAttribute("href")
      ? "href"
      : element.hasAttribute("poster")
        ? "poster"
        : "src";
    const value = element.getAttribute(attribute);
    if (!value || value.startsWith("#")) continue;
    const resolved = absoluteUrl(value, base);
    if (resolved) element.setAttribute(attribute, resolved);
  }
}

function cleanFallbackMarkdown(markdown: string): string {
  const lines = markdown.split("\n");
  const kept: string[] = [];
  let inFence = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = !inFence;
      kept.push(line);
      continue;
    }
    // 老站点常在正文容器末尾塞入脚本/Flash 的原始 HTML；不是正文。
    if (
      !inFence &&
      /^<!doctype\b|^<html\b|^<head\b|^<meta\b|^<object\b|^<embed\b|^<script\b|^codebase\s*=/i.test(
        trimmed,
      )
    ) {
      break;
    }
    kept.push(line);
  }

  return kept.join("\n").trim();
}

function fallbackMarkdown(
  document: Document,
  url: string,
  createMarkdownContent: ClipParser["createMarkdownContent"],
): { markdown: string; chars: number } {
  const selectors = [
    "article",
    "main",
    "[role='main']",
    "#content",
    "#Content",
    ".content",
    ".Content",
    ".article",
    ".article-content",
    ".post-content",
    ".entry-content",
  ];
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const text = element?.textContent?.trim() ?? "";
    if (text.length < 120) continue;
    const html = element?.innerHTML?.trim();
    if (!html) continue;
    const markdown = createMarkdownContent(html, url).trim();
    if (markdown) {
      const cleaned = cleanFallbackMarkdown(markdown);
      if (cleaned) {
        return { markdown: cleaned, chars: countCharacters(cleaned) };
      }
    }
  }
  return { markdown: "", chars: 0 };
}

export async function extractClip(
  html: string,
  sourceUrl: string,
): Promise<ExtractedClip> {
  const parser = await loadClipParser();
  const { document } = parser.parseHTML(html);
  patchLinkedomView(document as unknown as Document);
  absolutizeDocument(document as unknown as Document, sourceUrl);

  let title = "";
  let markdown = "";
  let wordCount = 0;
  let usedFallback = false;

  try {
    const result = new parser.Defuddle(document as unknown as Document, {
      url: sourceUrl,
      separateMarkdown: true,
    }).parse();
    title = result.title?.trim() ?? "";
    markdown = result.contentMarkdown?.trim() ?? "";
    wordCount = result.wordCount ?? 0;
    if (!markdown && result.content?.trim()) {
      markdown = parser
        .createMarkdownContent(result.content, sourceUrl)
        .trim();
    }
  } catch {
    // 继续走 article/main 降级
  }

  if (!markdown) {
    const fallback = fallbackMarkdown(
      document,
      sourceUrl,
      parser.createMarkdownContent,
    );
    markdown = fallback.markdown;
    usedFallback = Boolean(markdown);
  } else {
    const fallback = fallbackMarkdown(
      document,
      sourceUrl,
      parser.createMarkdownContent,
    );
    // 老式 table 布局页面里，Defuddle 可能把站点头部一起带进来；
    // 明确的 article/main/#Content 候选更干净时优先用它。
    if (
      fallback.chars >= 200 &&
      countCharacters(markdown) > fallback.chars * 1.6
    ) {
      markdown = fallback.markdown;
      usedFallback = true;
    }
  }

  if (countCharacters(markdown) < 40) {
    throw new ClipExtractError(
      "没有从页面里抽出可读正文。可以换一个网页，或稍后重试。",
    );
  }

  if (usedFallback) {
    // Defuddle 的 wordCount 可能统计的是整页，降级到正文容器后按实际内容重算。
    wordCount = countCharacters(markdown);
  }

  const domain = new URL(sourceUrl).hostname;
  if (!title) {
    title =
      document.querySelector("title")?.textContent?.trim() ||
      domain ||
      "未命名剪藏";
  }

  return {
    title: title.replace(/\s+/g, " ").trim().slice(0, 200),
    markdown,
    wordCount: wordCount || countCharacters(markdown),
    excerpt: plainExcerpt(markdown, 240),
    domain,
    sourceUrl,
    usedFallback,
  };
}
