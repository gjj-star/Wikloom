import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { useUiStore } from "../app/uiStore";
import { cn } from "./cn";

export function Toaster() {
  const toast = useUiStore((state) => state.toast);
  const dismiss = useUiStore((state) => state.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(dismiss, 2400);
    return () => window.clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;

  return createPortal(
    <div
      role="status"
      className="animate-toast fixed bottom-6 left-1/2 z-[70] -translate-x-1/2"
    >
      <div
        className={cn(
          "flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-[12.5px] text-ink shadow-[var(--c-shadow)]",
          toast.tone === "error" ? "border-red-500/30" : "border-line",
        )}
      >
        {toast.tone === "success" ? (
          <Check size={14} className="text-accent" />
        ) : null}
        {toast.text}
      </div>
    </div>,
    document.body,
  );
}
