import {
  Braces,
  ChevronDown,
  Globe,
  Highlighter,
  Scissors,
} from "lucide-react";
import { Panel } from "../../ui/Panel";

export function ClipperPage() {
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-6">
        <h1 className="text-[13px] font-semibold text-ink">剪藏</h1>
        <span className="rounded-full border border-accent/20 bg-accent-soft px-1.5 py-0.5 text-[9.5px] font-medium text-accent">
          M3
        </span>
        <span className="ml-auto text-[11px] text-faint">
          入口已留，能力未接
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[860px] space-y-4 px-8 py-8">
          <div className="flex items-start gap-3 rounded-xl border border-accent/20 bg-accent-soft px-4 py-3">
            <Scissors size={16} className="mt-0.5 shrink-0 text-accent" />
            <div>
              <p className="text-[12.5px] font-medium text-ink">
                这一版只有入口
              </p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
                M1 不接网页抓取。下面是按 Obsidian Clipper
                五段式排的静态结构，M3 会把它变成真面板。
              </p>
            </div>
          </div>

          <Panel
            title="剪藏面板（结构示意）"
            description="模板 → 属性 → 正文 → 位置 → 主按钮"
            actions={
              <span className="rounded border border-line bg-surface px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide text-faint">
                预览
              </span>
            }
          >
            <div
              aria-hidden
              className="pointer-events-none select-none space-y-3"
            >
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[11.5px] text-faint">
                <Globe size={13} className="shrink-0" />
                <span className="truncate">https://example.com/an-article</span>
                <span className="ml-auto rounded-md bg-accent px-2 py-1 text-[10.5px] text-accent-ink">
                  读取
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-line bg-card px-3 py-2 text-[11.5px]">
                <span className="text-ink">默认模板 · 文章</span>
                <ChevronDown size={13} className="text-faint" />
              </div>

              <div className="rounded-lg border border-line bg-card px-3 py-2 text-[13px] text-ink">
                为什么链接比分类更重要
              </div>

              <div className="overflow-hidden rounded-lg border border-line bg-card">
                <div className="flex items-center justify-between px-3 py-2 text-[11px] text-muted">
                  <span>属性</span>
                  <span className="text-faint">3 项</span>
                </div>
                <div className="space-y-1.5 border-t border-line px-3 py-2 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-faint">作者</span>
                    <span className="text-muted">…</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-faint">日期</span>
                    <span className="text-muted">2026-10-20</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-faint">来源</span>
                    <span className="truncate pl-6 text-muted">
                      example.com
                    </span>
                  </div>
                </div>
              </div>

              <div className="min-h-[88px] rounded-lg border border-line bg-surface px-3 py-2 text-[11.5px] leading-relaxed text-faint">
                摘录的正文会放在这里，用户可以在下面补自己的话。
              </div>

              <div className="flex items-center gap-2 border-t border-line pt-3">
                <span className="text-[11px] text-faint">notes/inbox</span>
                <span className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-[11.5px] font-medium text-accent-ink">
                  保存到知识库
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-line text-muted">
                  …
                </span>
              </div>
            </div>
          </Panel>

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="M3 要做三件事">
              <ul className="space-y-3 text-[12px] leading-relaxed text-muted">
                <li className="flex gap-2.5">
                  <Globe size={14} className="mt-0.5 shrink-0 text-accent" />
                  <span>
                    <span className="font-medium text-ink">正文抽取</span>
                    ：接入 defuddle，去掉导航与广告，只留文章主体。
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <Braces size={14} className="mt-0.5 shrink-0 text-accent" />
                  <span>
                    <span className="font-medium text-ink">模板与变量</span>
                    ：{"{{title}}"}、{"{{author}}"} 按 URL 规则匹配。
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <Highlighter
                    size={14}
                    className="mt-0.5 shrink-0 text-accent"
                  />
                  <span>
                    <span className="font-medium text-ink">高亮摘录</span>
                    ：整页剪藏之外，支持只摘划选的一段。
                  </span>
                </li>
              </ul>
            </Panel>

            <Panel title="已经定下的约定">
              <ul className="space-y-2.5 text-[12px] leading-relaxed text-muted">
                <li>· 落库路径遵守「知识库结构约定」，先进 inbox</li>
                <li>· 主按钮只有一个，次要动作收进溢出菜单</li>
                <li>· frontmatter 与属性面板字段一一对应</li>
              </ul>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
