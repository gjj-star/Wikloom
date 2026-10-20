import { describe, expect, it } from "vitest";
import {
  classifyGenerationError,
  GeneratedNoteParseError,
  parseGeneratedNote,
} from "./generate";
import { getProvider } from "./providers";
import { AiRunnerError } from "./runner";

const claude = getProvider("claude");
const ollama = getProvider("ollama");

describe("parseGeneratedNote", () => {
  it("parses frontmatter, title and tags, keeping unknown fields", () => {
    const draft = parseGeneratedNote(
      [
        "---",
        "tags: [engineering, cs, engineering]",
        "status: Seed",
        "updated: 2026-10-01",
        "---",
        "",
        "# 递归怎么理解",
        "",
        "递归是函数调用自己。",
      ].join("\n"),
    );

    expect(draft.title).toBe("递归怎么理解");
    expect(draft.content.startsWith("# 递归怎么理解")).toBe(true);
    expect(draft.tags).toEqual(["engineering", "cs"]);
    expect(draft.extra).toEqual({ status: "Seed" });
  });

  it("unwraps a whole-output markdown code fence", () => {
    const draft = parseGeneratedNote(
      "```markdown\n# 标题\n\n正文。\n```",
    );
    expect(draft.title).toBe("标题");
    expect(draft.content).toBe("# 标题\n\n正文。");
  });

  it("accepts a note without frontmatter when it starts with an H1", () => {
    const draft = parseGeneratedNote("# 标题\n\n正文。");
    expect(draft.tags).toEqual([]);
    expect(draft.extra).toEqual({});
  });

  it("rejects conversational preamble", () => {
    expect(() =>
      parseGeneratedNote("Here is your note:\n\n# 标题\n\n正文。"),
    ).toThrow(GeneratedNoteParseError);
  });

  it("rejects a note with only a title", () => {
    expect(() => parseGeneratedNote("# 标题\n")).toThrow(
      /只有标题|没有正文/,
    );
  });

  it("rejects malformed frontmatter", () => {
    expect(() =>
      parseGeneratedNote("---\ntags: [a]\n# 标题\n正文"),
    ).toThrow(/frontmatter/);
  });
});

describe("classifyGenerationError", () => {
  it("maps a missing CLI to a settings action", () => {
    const info = classifyGenerationError(
      "CLI_NOT_FOUND: 找不到 claude",
      claude,
    );
    expect(info.code).toBe("CLI_MISSING");
    expect(info.action).toBe("settings");
    expect(info.message).toContain("安装");
  });

  it("maps NOT_CONFIGURED to a missing CLI", () => {
    const info = classifyGenerationError(
      new AiRunnerError("NOT_CONFIGURED", "还没有配置"),
      claude,
    );
    expect(info.code).toBe("CLI_MISSING");
  });

  it("maps login and API key errors to auth", () => {
    const info = classifyGenerationError(
      new AiRunnerError(
        "RUN_FAILED",
        "Invalid API key. Please run /login to authenticate.",
      ),
      claude,
    );
    expect(info.code).toBe("AUTH_REQUIRED");
    expect(info.message).toContain("登录");
  });

  it("maps timeout and cancel codes", () => {
    expect(
      classifyGenerationError(new AiRunnerError("TIMEOUT", "生成超时"), claude)
        .code,
    ).toBe("TIMEOUT");
    expect(
      classifyGenerationError(new AiRunnerError("CANCELED", "已取消"), claude)
        .code,
    ).toBe("CANCELED");
  });

  it("maps parse failures to output invalid", () => {
    const info = classifyGenerationError(
      new GeneratedNoteParseError("正文没有标题", "# 无标题"),
      claude,
    );
    expect(info.code).toBe("OUTPUT_INVALID");
    expect(info.action).toBe("retry");
    expect(info.detail).toBe("# 无标题");
  });

  it("does not mistake a model error for a missing CLI", () => {
    const info = classifyGenerationError(
      new AiRunnerError("RUN_FAILED", "model not found: sonnet"),
      claude,
    );
    expect(info.code).toBe("RUN_FAILED");
  });

  it("maps an unreachable Ollama service to provider unavailable", () => {
    const info = classifyGenerationError(
      new AiRunnerError("RUN_FAILED", "Ollama 连接失败：error sending request"),
      ollama,
    );
    expect(info.code).toBe("PROVIDER_UNAVAILABLE");
    expect(info.action).toBe("settings");
  });
});
