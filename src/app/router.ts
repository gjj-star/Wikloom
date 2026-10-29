export type Route = "notes" | "graph" | "tags" | "clipper" | "settings";

export const ROUTES: Route[] = ["notes", "graph", "tags", "clipper", "settings"];

export const routeTitles: Record<Route, string> = {
  notes: "全部笔记",
  graph: "图谱",
  tags: "标签",
  clipper: "剪藏",
  settings: "设置",
};

/** 从 location.hash 读取路由（#/tags → tags），非法值回落到笔记页。 */
export function readRoute(): Route {
  const raw = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return (ROUTES as string[]).includes(raw) ? (raw as Route) : "notes";
}

export function routeHref(route: Route): string {
  return `#/${route}`;
}
