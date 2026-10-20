import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  Database,
  FileText,
  FolderOpen,
  Link2,
  Loader2,
} from "lucide-react";
import { chooseDemoVault, chooseTauriVault } from "../../app/actions";
import { isTauriRuntime } from "../../core/fs/runtime";
import { demoVaults } from "./data/demoVaults";
import { Button } from "../../ui/Button";

function Feature({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        {icon}
      </div>
      <div>
        <p className="text-[12px] font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
          {children}
        </p>
      </div>
    </div>
  );
}

export function Onboarding() {
  const tauri = isTauriRuntime();
  const [busy, setBusy] = useState<string | null>(null);

  async function handleFolder() {
    setBusy("folder");
    try {
      await chooseTauriVault();
    } finally {
      setBusy(null);
    }
  }

  async function handleDemo(id: string) {
    setBusy(id);
    try {
      await chooseDemoVault(id);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-[660px]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent font-serif text-[15px] font-semibold text-accent-ink shadow-sm">
            W
          </div>
          <div>
            <p className="text-[14px] font-semibold tracking-tight text-ink">
              Wikloom
            </p>
            <p className="text-[9px] uppercase tracking-[0.16em] text-faint">
              local knowledge
            </p>
          </div>
        </div>

        <div className="mt-7 rounded-2xl border border-line bg-card p-8 shadow-[var(--c-shadow)]">
          <p className="text-[9.5px] font-medium uppercase tracking-[0.18em] text-accent">
            第一步 · 选择知识库
          </p>
          <h1 className="mt-3 text-[28px] font-semibold leading-[1.25] tracking-[-0.02em] text-ink">
            把笔记放在自己的文件夹里
          </h1>
          <p className="mt-3 max-w-[520px] text-[13px] leading-relaxed text-muted">
            Wikloom 直接读写你选的文件夹：每篇笔记是一个 Markdown
            文件，元数据写在 frontmatter 里，随时可以用别的编辑器打开。
          </p>

          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <Feature icon={<FileText size={14} />} title="纯 Markdown 文件">
              没有私有数据库，文件夹拷走就能带走全部笔记。
            </Feature>
            <Feature icon={<Database size={14} />} title="frontmatter 身份">
              id / created / updated 写在文件里，重开也能对上。
            </Feature>
            <Feature icon={<Link2 size={14} />} title="双向链接照旧">
              沿用 [[标题]] 语法，反链从真实正文实时计算。
            </Feature>
            <Feature icon={<FolderOpen size={14} />} title="自动保存">
              编辑停 800ms 自动落盘，Ctrl S 立即保存。
            </Feature>
          </div>

          <div className="mt-8">
            {tauri ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  size="md"
                  disabled={busy !== null}
                  icon={
                    busy === "folder" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <FolderOpen size={14} />
                    )
                  }
                  onClick={() => void handleFolder()}
                >
                  选择知识库文件夹
                </Button>
                <span className="text-[10.5px] text-faint">
                  建议先新建一个空文件夹
                </span>
              </div>
            ) : (
              <div>
                <p className="mb-2.5 text-[10.5px] text-faint">
                  浏览器里没有真实文件夹权限，先用内置演示库体验；桌面版可选真实目录。
                </p>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {demoVaults.map((vault) => (
                    <button
                      key={vault.id}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void handleDemo(vault.id)}
                      className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-line-strong hover:bg-hover disabled:opacity-60"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                        {busy === vault.id ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <Database size={15} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium text-ink">
                          {vault.name}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-faint">
                          {vault.description}
                        </span>
                      </span>
                      <ArrowRight
                        size={14}
                        className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <p className="mt-6 text-[10px] leading-relaxed text-faint">
            {tauri
              ? "路径会保存在本机，下次启动自动打开；换库随时在左下角切换。"
              : "演示库写在浏览器内存里（刷新仍在）；装桌面版后可选真实文件夹。"}
          </p>
        </div>
      </div>
    </div>
  );
}
