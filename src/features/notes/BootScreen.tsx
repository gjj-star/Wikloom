import { Loader2 } from "lucide-react";

export function BootScreen() {
  return (
    <div className="flex h-full items-center justify-center bg-canvas">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent font-serif text-lg font-semibold text-accent-ink shadow-sm">
          W
        </div>
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <Loader2 size={14} className="animate-spin text-accent" />
          正在打开知识库…
        </div>
      </div>
    </div>
  );
}
