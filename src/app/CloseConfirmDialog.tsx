import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { useUiStore } from "./uiStore";
import { Button } from "../ui/Button";

/**
 * 关窗时还有内容没写进磁盘：先停在这里，让用户选「留下重试」或「明确放弃」。
 * 不用 window.confirm —— Tauri 里它没有可交互的原生对话框，会直接按 true 返回。
 */
export function CloseConfirmDialog() {
  const open = useUiStore((state) => state.closePrompt);
  const setClosePrompt = useUiStore((state) => state.setClosePrompt);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setClosePrompt(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setClosePrompt]);

  if (!open) return null;

  async function discardAndClose(): Promise<void> {
    setClosePrompt(false);
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().destroy();
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="还有内容没有保存到磁盘"
        className="w-[440px] max-w-full rounded-xl border border-line bg-card p-5 shadow-[var(--c-shadow)]"
      >
        <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400" />
          还有内容没有保存到磁盘
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          关闭窗口会丢掉这些修改。可以先点「留在这里」，修好写入问题后再保存和关闭。
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            autoFocus
            onClick={() => setClosePrompt(false)}
          >
            留在这里
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => void discardAndClose()}
          >
            放弃修改并关闭
          </Button>
        </div>
      </div>
    </div>
  );
}
