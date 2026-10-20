import { useState } from "react";
import {
  Check,
  Database,
  FolderOpen,
  Loader2,
  X,
} from "lucide-react";
import { chooseDemoVault, chooseTauriVault } from "../app/actions";
import { useUiStore } from "../app/uiStore";
import { isTauriRuntime } from "../core/fs/runtime";
import { cn } from "../ui/cn";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { IconButton } from "../ui/IconButton";
import { demoVaults } from "../features/notes/data/demoVaults";
import { useNotesStore } from "../features/notes/store";

export function VaultPicker() {
  const open = useUiStore((state) => state.vaultPickerOpen);
  const close = useUiStore((state) => state.closeVaultPicker);
  const vault = useNotesStore((state) => state.vault);
  const [busy, setBusy] = useState<string | null>(null);
  const tauri = isTauriRuntime();

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
    <Dialog open={open} onClose={close} className="max-w-[520px]">
      <div className="flex h-12 items-center gap-2 border-b border-line px-4">
        <FolderOpen size={15} className="text-muted" />
        <h2 className="text-[13px] font-semibold text-ink">切换知识库</h2>
        <div className="ml-auto">
          <IconButton label="关闭" size="sm" onClick={close}>
            <X size={15} />
          </IconButton>
        </div>
      </div>

      <div className="p-4">
        {vault ? (
          <div className="mb-4 rounded-xl border border-line bg-surface px-3.5 py-3">
            <div className="flex items-center gap-2">
              <span className="rounded border border-line bg-card px-1.5 py-0.5 text-[9px] text-faint">
                {vault.kind === "tauri" ? "本地文件夹" : "演示库"}
              </span>
              <span className="truncate text-[12.5px] font-medium text-ink">
                {vault.name}
              </span>
            </div>
            <p className="mt-1.5 break-all font-mono text-[10px] leading-relaxed text-faint">
              {vault.root}
            </p>
          </div>
        ) : null}

        {tauri ? (
          <div>
            <Button
              variant="primary"
              className="w-full"
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
              选择文件夹…
            </Button>
            <p className="mt-2.5 text-[10.5px] leading-relaxed text-faint">
              选择的文件夹需要包含（或即将包含）Markdown 笔记。Wikloom
              只读写这个目录内部。
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[10.5px] text-faint">
              浏览器演示使用内存文件系统：
            </p>
            {demoVaults.map((demo) => {
              const active = vault?.root === demo.root;
              return (
                <button
                  key={demo.id}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void handleDemo(demo.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors disabled:opacity-60",
                    active
                      ? "border-accent/40 bg-accent-soft"
                      : "border-line bg-card hover:bg-hover",
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    {busy === demo.id ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Database size={15} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-ink">
                      {demo.name}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-faint">
                      {demo.description}
                    </span>
                  </span>
                  {active ? (
                    <Check size={14} className="shrink-0 text-accent" />
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-line px-4 py-2.5 text-[10px] text-faint">
        {tauri
          ? "下次启动会自动打开上次的文件夹。"
          : "桌面版可以直接选择真实文件夹。"}
      </div>
    </Dialog>
  );
}
