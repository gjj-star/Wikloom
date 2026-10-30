import { describe, expect, it } from "vitest";
import { describeEmptyLinks } from "./emptyGraphText";

describe("describeEmptyLinks", () => {
  it("explains missing and self links when there are no edges", () => {
    expect(describeEmptyLinks({ missingLinks: 2, selfLinks: 1 })).toContain(
      "2 条链接指向不存在的笔记",
    );
    expect(describeEmptyLinks({ missingLinks: 2, selfLinks: 1 })).toContain(
      "1 条链接指向笔记自己",
    );
  });

  it("falls back to the plain hint without extra counts", () => {
    const text = describeEmptyLinks({ missingLinks: 0, selfLinks: 0 });
    expect(text).toContain("[[其它笔记的标题]]");
    expect(text).not.toContain("条链接");
  });
});
