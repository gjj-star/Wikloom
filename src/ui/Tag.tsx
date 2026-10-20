import type { ReactNode } from "react";
import { cn } from "./cn";

interface TagProps {
  children: ReactNode;
  tone?: "default" | "accent";
  className?: string;
}

export function Tag({ children, tone = "default", className }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
        tone === "accent"
          ? "border-accent/20 bg-accent-soft text-accent"
          : "border-line bg-card text-muted",
        className,
      )}
    >
      #{children}
    </span>
  );
}
