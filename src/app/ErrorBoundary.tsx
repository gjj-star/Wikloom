import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "../ui/Button";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** 兜住渲染期异常，避免整个窗口白屏。 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Wikloom UI error", error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex h-full items-center justify-center bg-canvas px-6">
        <div className="w-full max-w-[460px] rounded-2xl border border-line bg-card p-7 text-center shadow-[var(--c-shadow-soft)]">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-line bg-hover text-muted">
            <AlertTriangle size={18} />
          </div>
          <h1 className="mt-4 text-[16px] font-semibold text-ink">
            界面出了点问题
          </h1>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            笔记文件还在磁盘上，没有丢。可以重新加载界面继续。
          </p>
          <code className="mt-3 block max-h-24 overflow-auto break-all rounded-lg bg-surface p-2 text-left font-mono text-[10px] text-faint">
            {this.state.error.message}
          </code>
          <Button
            variant="primary"
            className="mt-5"
            onClick={() => window.location.reload()}
          >
            重新加载
          </Button>
        </div>
      </div>
    );
  }
}
