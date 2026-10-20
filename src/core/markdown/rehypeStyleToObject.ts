import type { Root } from "hast";
import { visit } from "unist-util-visit";

/**
 * react-markdown 通过 hast-util-to-jsx-runtime 把 style 字符串交给 style-to-js 解析，
 * 但该 CJS 包的默认导入在这种依赖布局下拿不到函数，`ignoreInvalidStyle` 又把异常
 * 静默吞成空对象——于是 KaTeX 的定位样式全丢，上下标会错位。
 * 这里提前把样式字符串转成 React 需要的 camelCase 对象，绕开那次解析。
 */
export function rehypeStyleToObject() {
  return (tree: Root) => {
    visit(tree, "element", (node) => {
      const style = node.properties?.style;
      if (typeof style !== "string") return;

      const parsed: Record<string, string> = {};
      for (const declaration of style.split(";")) {
        const separator = declaration.indexOf(":");
        if (separator === -1) continue;
        const property = declaration.slice(0, separator).trim();
        const value = declaration.slice(separator + 1).trim();
        if (!property || !value) continue;
        const camelCase = property.replace(/-([a-z])/g, (_, letter: string) =>
          letter.toUpperCase(),
        );
        parsed[camelCase] = value;
      }

      // hast 的 style 类型声明为 string，但 jsx runtime 接受对象。
      node.properties.style = parsed as unknown as string;
    });
  };
}
