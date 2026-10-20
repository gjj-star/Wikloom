import { Globe, Scissors } from "lucide-react";
import { useUiStore } from "../../app/uiStore";
import { Button } from "../../ui/Button";
import { Panel } from "../../ui/Panel";

export function ClipperPage() {
  const openClip = useUiStore((state) => state.openClip);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-6">
        <h1 className="text-[13px] font-semibold text-ink">剪藏</h1>
        <span className="rounded-full border border-accent/20 bg-accent-soft px-1.5 py-0.5 text-[9.5px] font-medium text-accent">
          M4
        </span>
        <span className="ml-auto text-[11px] text-faint">
          输入 URL，预览正文后写入知识库
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[820px] space-y-4 px-8 py-8">
          <Panel
            title="网页剪藏"
            description="抓取公开网页的正文，清理导航与广告，转成 Markdown 后保存。"
          >
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                icon={<Scissors size={14} />}
                onClick={openClip}
              >
                打开剪藏
              </Button>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                <Globe size={13} className="text-faint" />
                也可以在命令面板输入「剪藏网页」
              </span>
            </div>
            <ul className="mt-4 space-y-2 text-[11.5px] leading-relaxed text-muted">
              <li>· 只支持 http / https 公开网页；localhost、本机地址和内网地址会被拒绝。</li>
              <li>· 抓取最多 20 秒、5MB；超时或页面不是 HTML 会给出具体提示。</li>
              <li>· 图片和相对链接会转成绝对 URL，保存前先预览标题、来源、字数和正文开头。</li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
