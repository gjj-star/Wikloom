import { useState } from "react";
import {
  AlertTriangle,
  Check,
  FolderOpen,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { openVaultPicker } from "../../app/actions";
import {
  useUiStore,
  type ProseSize,
  type Theme,
} from "../../app/uiStore";
import { useNotesStore } from "../notes/store";
import { Button } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { Panel } from "../../ui/Panel";

const themeOptions: Array<{ value: Theme; label: string; hint: string }> = [
  { value: "light", label: "浅色", hint: "暖纸底 · 钴蓝强调" },
  { value: "dark", label: "深色", hint: "暖黑底 · 低对比" },
];

export function SettingsPage() {
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const proseSize = useUiStore((state) => state.proseSize);
  const setProseSize = useUiStore((state) => state.setProseSize);

  const vault = useNotesStore((state) => state.vault);
  const notes = useNotesStore((state) => state.notes);
  const errors = useNotesStore((state) => state.errors);
  const rescan = useNotesStore((state) => state.rescan);
  const [rescanning, setRescanning] = useState(false);

  async function handleRescan() {
    setRescanning(true);
    try {
      await rescan();
    } finally {
      setRescanning(false);
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-6">
        <h1 className="text-[13px] font-semibold text-ink">设置</h1>
        <span className="text-[11px] text-faint">
          知识库、外观、阅读与关于
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[820px] space-y-4 px-8 py-8">
          <Panel
            title="知识库"
            description="笔记以 Markdown 文件存在这个文件夹里。"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded border border-line bg-surface px-1.5 py-0.5 text-[9px] text-faint">
                    {vault?.kind === "tauri" ? "本地文件夹" : "内存演示库"}
                  </span>
                  <p className="truncate text-[12.5px] font-medium text-ink">
                    {vault?.name ?? "未打开知识库"}
                  </p>
                </div>
                <p className="mt-1.5 break-all font-mono text-[10.5px] leading-relaxed text-muted">
                  {vault?.root ?? "—"}
                </p>
                <p className="mt-1.5 text-[10.5px] text-faint">
                  {notes.length} 篇笔记 · {errors.length} 个异常文件
                </p>
              </div>

              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  icon={<FolderOpen size={13} />}
                  onClick={openVaultPicker}
                >
                  切换知识库…
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="border border-line"
                  disabled={rescanning}
                  icon={
                    rescanning ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <RefreshCw size={13} />
                    )
                  }
                  onClick={() => void handleRescan()}
                >
                  重新扫描
                </Button>
              </div>
            </div>

            {errors.length > 0 ? (
              <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                  <AlertTriangle size={12} />
                  {errors.length} 个文件读取异常（其余笔记不受影响）
                </div>
                <ul className="mt-2 max-h-44 space-y-1.5 overflow-y-auto">
                  {errors.map((error) => (
                    <li
                      key={`${error.path}-${error.message}`}
                      className="rounded-md bg-card/60 px-2 py-1.5"
                    >
                      <p className="break-all font-mono text-[10px] text-ink">
                        {error.path}
                      </p>
                      <p className="mt-0.5 break-words text-[10px] leading-relaxed text-muted">
                        {error.message}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
              扫描时会给没有 frontmatter 的文件补上 id / title / created /
              updated 并写回磁盘；tags 缺失不补，重复或空数组会归一。已有字段不会被覆盖。
            </p>
          </Panel>

          <Panel title="外观" description="主题只影响界面，不写入笔记。">
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

            <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
              编辑后 800ms 自动保存到磁盘，Ctrl S 立即保存；写入采用临时文件 +
              rename，中途崩溃不会留下半个文件。
            </p>
          </Panel>

          <Panel title="关于">
            <dl className="grid grid-cols-[88px_1fr] gap-x-4 gap-y-2.5 text-[11.5px]">
              <dt className="text-faint">版本</dt>
              <dd className="text-ink">v0.2.0 · M2 真实文件系统</dd>
              <dt className="text-faint">技术栈</dt>
              <dd className="text-ink">
                React 19 · Tauri 2 · Tailwind CSS 4 · CodeMirror 6
              </dd>
              <dt className="text-faint">数据</dt>
              <dd className="text-ink">
                本地 Markdown 文件；frontmatter 存 id / 时间 / 标签
              </dd>
              <dt className="text-faint">保存</dt>
              <dd className="text-ink">自动保存 800ms · Ctrl S · 原子写</dd>
              <dt className="text-faint">命令</dt>
              <dd className="font-mono text-[11px] text-muted">
                pnpm dev · pnpm build · pnpm tauri dev
              </dd>
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}
