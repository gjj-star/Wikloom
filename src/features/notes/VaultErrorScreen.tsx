import { useState } from "react";
import {
  AlertTriangle,
  FolderX,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { openVaultPicker } from "../../app/actions";
import { useNotesStore } from "./store";
import { Button } from "../../ui/Button";

const titles: Record<string, string> = {
  VAULT_MISSING: "知识库文件夹不在了",
  VAULT_PERMISSION: "没有权限读取这个文件夹",
  VAULT_NOT_DIRECTORY: "选择的不是文件夹",
  SCAN_FAILED: "知识库打不开",
};

export function VaultErrorScreen() {
  const failure = useNotesStore((state) => state.failure);
  const vault = useNotesStore((state) => state.vault);
  const rescan = useNotesStore((state) => state.rescan);
  const [busy, setBusy] = useState(false);

  const code = failure?.code ?? "SCAN_FAILED";
  const title = titles[code] ?? "知识库打不开";
  const path = failure?.path ?? vault?.root ?? "";
  const Icon =
    code === "VAULT_MISSING"
      ? FolderX
      : code === "VAULT_PERMISSION"
        ? ShieldAlert
        : AlertTriangle;

  async function handleRescan() {
    setBusy(true);
    try {
      await rescan();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-[560px] rounded-2xl border border-line bg-card p-8 shadow-[var(--c-shadow)]">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface text-muted">
          <Icon size={20} />
        </div>

        <h1 className="mt-5 text-[20px] font-semibold tracking-tight text-ink">
          {title}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          {failure?.message ?? "读取知识库时遇到了问题。"}
        </p>

        {path ? (
          <div className="mt-4 rounded-lg border border-line bg-surface px-3 py-2">
            <p className="text-[9.5px] uppercase tracking-[0.14em] text-faint">
              路径
            </p>
            <p className="mt-1 break-all font-mono text-[10.5px] text-muted">
              {path}
            </p>
          </div>
        ) : null}

        {failure?.detail ? (
          <details className="mt-3 text-[10.5px] text-faint">
            <summary className="cursor-pointer select-none">
              技术细节
            </summary>
            <code className="mt-2 block max-h-28 overflow-auto break-all rounded-lg bg-surface p-2 font-mono text-[10px]">
              {failure.detail}
            </code>
          </details>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            variant="primary"
            icon={
              busy ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <RefreshCw size={13} />
              )
            }
            disabled={busy}
            onClick={() => void handleRescan()}
          >
            重新扫描
          </Button>
          <Button onClick={openVaultPicker}>换一个知识库</Button>
        </div>

        <p className="mt-5 text-[10.5px] leading-relaxed text-faint">
          文件夹恢复后点「重新扫描」即可；已有的笔记文件不会被删除或覆盖。
        </p>
      </div>
    </div>
  );
}
