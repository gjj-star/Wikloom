import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { FileText, Loader2, Plus, Sparkles } from "lucide-react";
import { openNote } from "../../app/actions";
import { getProvider, providerCommand } from "../../core/ai/providers";
import { detectProvider } from "../../core/ai/runner";
import { isTauriRuntime } from "../../core/fs/runtime";
import { formatDateTime } from "../../core/time/relativeTime";
import { excerpt } from "../../core/text/plainText";
import { Button } from "../../ui/Button";
import { Tag } from "../../ui/Tag";
import { useAiSettingsStore } from "../ai/aiSettingsStore";
import { useNotesStore } from "../notes/store";
import { LinkPreviewContext } from "./linkPreviewContext";

interface LinkPreviewProviderProps {
  children: ReactNode;
  /** 断链卡片：「创建空白笔记」，不需要 AI。成功返回 true，卡片随后关闭。 */
  onCreateBlank?: (title: string) => Promise<boolean> | boolean;
  /** 断链卡片：「用 AI 生成」，走已有的建链生成流程。 */
  onCreateMissing?: (title: string) => void;
}

interface ActivePreview {
  target: string;
  element: HTMLElement;
}

const SHOW_DELAY = 350;
const HIDE_DELAY = 180;

type AiAvailability = "checking" | "available" | "unavailable";

export function LinkPreviewProvider({
  children,
  onCreateBlank,
  onCreateMissing,
}: LinkPreviewProviderProps) {
  const notes = useNotesStore((state) => state.notes);
  const aiSettings = useAiSettingsStore((state) => state.settings);
  const [active, setActive] = useState<ActivePreview | null>(null);
  const [aiAvailability, setAiAvailability] =
    useState<AiAvailability | null>(null);
  const activeRef = useRef<ActivePreview | null>(null);
  const pendingRef = useRef<ActivePreview | null>(null);
  const aiCheckKeyRef = useRef<string | null>(null);
  const aiCheckTokenRef = useRef(0);
  const showTimer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);

  const clearTimers = useCallback(() => {
    if (showTimer.current !== undefined) {
      window.clearTimeout(showTimer.current);
      showTimer.current = undefined;
    }
    if (hideTimer.current !== undefined) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = undefined;
    }
  }, []);

  const closePreview = useCallback(() => {
    clearTimers();
    pendingRef.current = null;
    activeRef.current = null;
    setActive(null);
  }, [clearTimers]);

  const showPreview = useCallback(
    (target: string, element: HTMLElement) => {
      clearTimers();
      if (
        activeRef.current?.target === target &&
        activeRef.current.element === element
      ) {
        return;
      }
      pendingRef.current = { target, element };
      showTimer.current = window.setTimeout(() => {
        const next = pendingRef.current;
        if (!next) return;
        activeRef.current = next;
        setActive(next);
      }, SHOW_DELAY);
    },
    [clearTimers],
  );

  const hidePreview = useCallback(() => {
    if (showTimer.current !== undefined) {
      window.clearTimeout(showTimer.current);
      showTimer.current = undefined;
    }
    pendingRef.current = null;
    if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      activeRef.current = null;
      setActive(null);
    }, HIDE_DELAY);
  }, []);

  const holdPreview = useCallback(() => {
    if (hideTimer.current !== undefined) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = undefined;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closePreview();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [active, closePreview]);

  const activeMissing = active
    ? !notes.some((note) => note.title === active.target)
    : false;

  // 断链卡片先给不依赖 AI 的入口；只有探测到 AI 工具可用时才并列生成入口。
  // 同一份设置只探测一次，避免反复悬停时反复起 CLI 进程。
  useEffect(() => {
    if (!active || !activeMissing || !onCreateBlank || !onCreateMissing) return;

    const provider = getProvider(aiSettings.provider);
    const target =
      provider.kind === "ollama"
        ? aiSettings.ollamaUrl.trim()
        : providerCommand(provider, aiSettings);
    const checkKey = `${provider.id}:${target}`;
    if (aiCheckKeyRef.current === checkKey) return;
    aiCheckKeyRef.current = checkKey;

    const token = aiCheckTokenRef.current + 1;
    aiCheckTokenRef.current = token;

    if (!isTauriRuntime()) {
      setAiAvailability("unavailable");
      return;
    }

    setAiAvailability("checking");
    void detectProvider(provider.id, aiSettings)
      .then((result) => {
        if (aiCheckTokenRef.current !== token) return;
        setAiAvailability(
          result.found && !result.error ? "available" : "unavailable",
        );
      })
      .catch(() => {
        if (aiCheckTokenRef.current !== token) return;
        setAiAvailability("unavailable");
      });
  }, [active, activeMissing, aiSettings, onCreateBlank, onCreateMissing]);

  useEffect(() => {
    return () => {
      aiCheckTokenRef.current += 1;
    };
  }, []);

  const api = useMemo(
    () => ({ showPreview, hidePreview, closePreview }),
    [showPreview, hidePreview, closePreview],
  );

  return (
    <LinkPreviewContext.Provider value={api}>
      {children}
      {active
        ? createPortal(
            <LinkPreviewCard
              key={active.target}
              target={active.target}
              anchor={active.element}
              aiAvailability={aiAvailability}
              onCreateBlank={onCreateBlank}
              onCreateMissing={onCreateMissing}
              onHold={holdPreview}
              onMouseLeave={hidePreview}
              onClose={closePreview}
            />,
            document.body,
          )
        : null}
    </LinkPreviewContext.Provider>
  );
}

interface LinkPreviewCardProps {
  target: string;
  anchor: HTMLElement;
  aiAvailability: AiAvailability | null;
  onHold: () => void;
  onMouseLeave: () => void;
  onClose: () => void;
  onCreateBlank?: (title: string) => Promise<boolean> | boolean;
  onCreateMissing?: (title: string) => void;
}

function LinkPreviewCard({
  target,
  anchor,
  aiAvailability,
  onHold,
  onMouseLeave,
  onClose,
  onCreateBlank,
  onCreateMissing,
}: LinkPreviewCardProps) {
  const notes = useNotesStore((state) => state.notes);
  const note = notes.find((item) => item.title === target);
  const cardRef = useRef<HTMLDivElement>(null);
  const [creatingBlank, setCreatingBlank] = useState(false);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    ready: false,
  });

  useLayoutEffect(() => {
    const update = () => {
      const card = cardRef.current;
      if (!card) return;
      if (!anchor.isConnected) {
        onClose();
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const margin = 8;
      const gap = 10;
      const maxLeft = Math.max(
        margin,
        window.innerWidth - cardRect.width - margin,
      );
      const maxTop = Math.max(
        margin,
        window.innerHeight - cardRect.height - margin,
      );

      const left = Math.min(
        Math.max(margin, rect.left + rect.width / 2 - cardRect.width / 2),
        maxLeft,
      );
      let top = rect.bottom + gap;
      if (top + cardRect.height > window.innerHeight - margin) {
        top = rect.top - cardRect.height - gap;
      }
      top = Math.min(Math.max(margin, top), maxTop);

      setPosition((previous) =>
        previous.ready &&
        previous.left === left &&
        previous.top === top
          ? previous
          : { left, top, ready: true },
      );
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchor, note?.id, note?.updatedAt, onClose]);

  const tags = note?.tags.slice(0, 4) ?? [];
  const remainingTags = note ? Math.max(0, note.tags.length - tags.length) : 0;

  async function createBlank(): Promise<void> {
    if (!onCreateBlank || creatingBlank) return;
    setCreatingBlank(true);
    try {
      const created = await onCreateBlank(target);
      if (created) onClose();
    } finally {
      setCreatingBlank(false);
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>): void {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    onClose();
  }

  return (
    <div
      ref={cardRef}
      role="dialog"
      tabIndex={-1}
      aria-label={note ? `「${target}」预览` : `「${target}」尚未创建`}
      onFocus={onHold}
      onBlur={handleBlur}
      onMouseEnter={onHold}
      onMouseLeave={onMouseLeave}
      style={{
        left: position.left,
        top: position.top,
        visibility: position.ready ? "visible" : "hidden",
      }}
      className="fixed z-[70] w-[340px] max-w-[calc(100vw-16px)] rounded-xl border border-line bg-card p-4 shadow-[var(--c-shadow)] outline-none"
    >
      {!note ? (
        <div className="grid gap-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-faint">
            <FileText size={13} />
            尚未创建
          </div>
          <h3 className="text-[15px] font-semibold leading-snug text-ink">
            {target}
          </h3>
          <p className="text-[11.5px] leading-relaxed text-muted">
            这个链接指向的笔记还不存在。创建后会写入当前知识库，原文里的链接保持不动。
          </p>
          {onCreateBlank ? (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  icon={
                    creatingBlank ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Plus size={12} />
                    )
                  }
                  disabled={creatingBlank}
                  onClick={() => void createBlank()}
                >
                  {creatingBlank ? "正在创建…" : "创建空白笔记"}
                </Button>
                {aiAvailability === "available" && onCreateMissing ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="border border-line"
                    icon={<Sparkles size={12} />}
                    onClick={() => {
                      onClose();
                      onCreateMissing(target);
                    }}
                  >
                    用 AI 生成
                  </Button>
                ) : null}
              </div>
              {aiAvailability === "checking" ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-faint">
                  <Loader2 size={10} className="animate-spin" />
                  正在检测 AI 是否可用…
                </span>
              ) : null}
              {aiAvailability === "unavailable" ? (
                <span className="text-[10px] leading-relaxed text-faint">
                  未检测到可用的 AI；空白笔记不需要配置。
                </span>
              ) : null}
            </div>
          ) : onCreateMissing ? (
            <Button
              type="button"
              size="sm"
              variant="primary"
              icon={<Plus size={12} />}
              onClick={() => {
                onClose();
                onCreateMissing(target);
              }}
            >
              创建这篇笔记
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-2">
          <div className="flex items-start gap-2">
            <FileText size={14} className="mt-0.5 shrink-0 text-faint" />
            <h3 className="text-[15px] font-semibold leading-snug text-ink">
              {note.title}
            </h3>
          </div>

          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
              {remainingTags > 0 ? (
                <span className="text-[10px] text-faint">+{remainingTags}</span>
              ) : null}
            </div>
          ) : (
            <div className="text-[10px] text-faint">无标签</div>
          )}

          <div className="text-[10.5px] text-faint">
            更新于 {formatDateTime(note.updatedAt)}
          </div>

          <p className="line-clamp-4 text-[11.5px] leading-relaxed text-muted">
            {excerpt(note.content, 200) || "还没有正文。"}
          </p>

          <div className="mt-1 flex items-center gap-2 border-t border-line pt-3">
            <Button
              type="button"
              size="sm"
              variant="primary"
              icon={<FileText size={12} />}
              onClick={() => {
                onClose();
                openNote(note.id, { mode: "read" });
              }}
            >
              打开
            </Button>
            <span className="text-[10px] text-faint">点击左侧链接也可直接打开</span>
          </div>
        </div>
      )}
    </div>
  );
}
