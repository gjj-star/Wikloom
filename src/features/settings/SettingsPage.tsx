import { Check } from "lucide-react";
import { useNotesStore } from "../notes/store";
import {
  useUiStore,
  type ProseSize,
  type Theme,
} from "../../app/uiStore";
import { Button } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { Panel } from "../../ui/Panel";

const themeOptions: Array<{ value: Theme; label: string; hint: string }> = [
  { value: "light", label: "浅色", hint: "暖纸底 · 钴蓝强调" },
  { value: "dark", label: "深色", hint: "暖黑底 · 低对比" },
];

const statusLabels: Record<string, string> = {
  idle: "未加载",
  loading: "加载中",
  ready: "正常",
  error: "错误",
};

export function SettingsPage() {
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const proseSize = useUiStore((state) => state.proseSize);
  const setProseSize = useUiStore((state) => state.setProseSize);
  const navigate = useUiStore((state) => state.navigate);
  const showToast = useUiStore((state) => state.showToast);

  const status = useNotesStore((state) => state.status);
  const load = useNotesStore((state) => state.load);
  const showError = useNotesStore((state) => state.showError);
  const restore = useNotesStore((state) => state.restore);
  const setQuery = useNotesStore((state) => state.setQuery);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-6">
        <h1 className="text-[13px] font-semibold text-ink">设置</h1>
        <span className="text-[11px] text-faint">外观、阅读与演示状态</span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[820px] space-y-4 px-8 py-8">
          <Panel
            title="外观"
            description="主题只影响界面，不写入笔记。"
          >
            <div className="grid grid-cols-2 gap-3">
              {themeOptions.map((option) => {
                const active = theme === option.value;
                const dark = option.value === "dark";
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTheme(option.value)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-colors",
                      active
                        ? "border-accent/50 bg-card ring-1 ring-accent/20"
                        : "border-line bg-card hover:border-line-strong",
                    )}
                  >
                    <div
                      className={cn(
                        "mb-2.5 h-14 rounded-lg border p-2.5",
                        dark
                          ? "border-[#2c2c26] bg-[#161613]"
                          : "border-[#e5dfd4] bg-[#f7f4ee]",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            dark ? "bg-[#9db4ff]" : "bg-[#3a6ff0]",
                          )}
                        />
                        <span
                          className={cn(
                            "h-2 w-10 rounded-full",
                            dark ? "bg-[#3d3d35]" : "bg-[#d3cabd]",
                          )}
                        />
                      </div>
                      <div className="mt-2 space-y-1.5">
                        <span
                          className={cn(
                            "block h-1.5 w-3/4 rounded-full",
                            dark ? "bg-[#3d3d35]" : "bg-[#e5dfd4]",
                          )}
                        />
                        <span
                          className={cn(
                            "block h-1.5 w-1/2 rounded-full",
                            dark ? "bg-[#2c2c26]" : "bg-[#ece7dd]",
                          )}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-ink">
                        {option.label}
                      </span>
                      {active ? (
                        <Check size={13} className="text-accent" />
                      ) : null}
                    </div>
                    <span className="mt-0.5 block text-[10.5px] text-faint">
                      {option.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel
            title="阅读"
            description="正文字号同时作用于阅读态与编辑态。"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[12.5px] font-medium text-ink">正文字号</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  行宽固定约 780px，行高 1.9。
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] tabular-nums text-faint">
                  {proseSize}px
                </span>
                <input
                  type="range"
                  min={15}
                  max={18}
                  step={1}
                  value={proseSize}
                  aria-label="正文字号"
                  onChange={(event) =>
                    setProseSize(Number(event.target.value) as ProseSize)
                  }
                  className="w-32 accent-[var(--c-accent)]"
                />
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-line bg-surface px-4 py-3">
              <span
                className="text-ink"
                style={{ fontSize: `${proseSize}px`, lineHeight: 1.9 }}
              >
                正文预览：好的排版让长文也能读下去。
              </span>
            </div>
          </Panel>

          <Panel
            title="演示状态"
            description="M1 没有真实数据源，这几个按钮直接切换界面状态。"
          >
            <p className="mb-3 text-[11.5px] leading-relaxed text-muted">
              当前状态：
              <span className="font-medium text-ink">
                {statusLabels[status] ?? status}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  load();
                  navigate("notes");
                }}
              >
                模拟加载中
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  showError();
                  navigate("notes");
                }}
              >
                模拟加载失败
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  restore();
                  navigate("notes");
                }}
              >
                恢复正常
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="border border-line"
                onClick={() => {
                  setQuery("不存在的标题");
                  navigate("notes");
                  showToast("空状态演示：没有匹配的笔记");
                }}
              >
                查看空列表
              </Button>
            </div>
          </Panel>

          <Panel title="关于">
            <dl className="grid grid-cols-[88px_1fr] gap-x-4 gap-y-2.5 text-[11.5px]">
              <dt className="text-faint">版本</dt>
              <dd className="text-ink">v0.1.0 · M1 界面骨架</dd>
              <dt className="text-faint">技术栈</dt>
              <dd className="text-ink">
                React 19 · Tauri 2 · Tailwind CSS 4 · CodeMirror 6
              </dd>
              <dt className="text-faint">数据</dt>
              <dd className="text-ink">内存演示数据，刷新后重置</dd>
              <dt className="text-faint">知识库</dt>
              <dd className="text-ink">~/vault（M2 接入文件系统）</dd>
              <dt className="text-faint">命令</dt>
              <dd className="font-mono text-[11px] text-muted">
                pnpm dev · pnpm build
              </dd>
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}
