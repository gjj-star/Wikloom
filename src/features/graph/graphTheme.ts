export interface GraphPalette {
  accent: string;
  line: string;
  ink: string;
  background: string;
  card: string;
  highlight: string;
}

/**
 * 图谱画布的配色，值必须与 `src/styles.css` 的主题变量保持一致。
 * 画布在 effect 里一次性取色，主题切换会重建实例；直接写常量比读 CSS 变量可靠，
 * 避免切换瞬间变量还没落到容器上读到旧值。
 */
export const GRAPH_PALETTES: Record<"light" | "dark", GraphPalette> = {
  light: {
    accent: "#3a6ff0",
    line: "#d3cabd",
    ink: "#22211d",
    background: "#f7f4ee",
    card: "#fffdf9",
    highlight: "#e08a1e",
  },
  dark: {
    accent: "#9db4ff",
    line: "#3d3d35",
    ink: "#e9e5dc",
    background: "#161613",
    card: "#1e1e19",
    highlight: "#f0b45a",
  },
};
