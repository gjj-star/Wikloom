import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

type Listener = (state: ContextMenuState | null) => void;

let current: ContextMenuState | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener(current);
}

interface TriggerEvent {
  clientX: number;
  clientY: number;
  preventDefault: () => void;
  stopPropagation: () => void;
}

/** 右键目标显式调用；不在列表里的位置由 App 的全局 listener 吃掉。 */
export function openContextMenu(
  event: TriggerEvent,
  items: ContextMenuItem[],
): void {
  event.preventDefault();
  event.stopPropagation();
  if (items.length === 0) return;
  current = { x: event.clientX, y: event.clientY, items };
  emit();
}

export function closeContextMenu(): void {
  if (current === null) return;
  current = null;
  emit();
}

export function ContextMenuHost() {
  const [state, setState] = useState<ContextMenuState | null>(current);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    ready: false,
  });

  useEffect(() => {
    listeners.add(setState);
    setState(current);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  useLayoutEffect(() => {
    if (!state) {
      setPosition({ left: 0, top: 0, ready: false });
      return;
    }
    const menu = menuRef.current;
    if (!menu) return;

    const rect = menu.getBoundingClientRect();
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    setPosition({
      left: Math.min(Math.max(margin, state.x), maxLeft),
      top: Math.min(Math.max(margin, state.y), maxTop),
      ready: true,
    });

    const first = menu.querySelector<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)',
    );
    first?.focus();
  }, [state]);

  useEffect(() => {
    if (!state) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        closeContextMenu();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      // 只关菜单；不要顺带把下层反链抽屉/命令面板一起关掉。
      event.stopImmediatePropagation();
      closeContextMenu();
    };
    const dismiss = () => closeContextMenu();

    window.addEventListener("pointerdown", onPointerDown, true);
    // capture 阶段先关菜单，Esc 不会继续冒泡到 App 的反链抽屉快捷键。
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", dismiss);
    window.addEventListener("resize", dismiss);
    document.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("resize", dismiss);
      document.removeEventListener("scroll", dismiss, true);
    };
  }, [state]);

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab") {
      closeContextMenu();
      return;
    }
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }

    const buttons = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? []),
    ];
    if (buttons.length === 0) return;

    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next = index;
    if (event.key === "ArrowDown") {
      next = index < 0 ? 0 : (index + 1) % buttons.length;
    } else if (event.key === "ArrowUp") {
      next = index <= 0 ? buttons.length - 1 : index - 1;
    } else if (event.key === "Home") {
      next = 0;
    } else {
      next = buttons.length - 1;
    }

    event.preventDefault();
    buttons[next]?.focus();
  }

  if (!state) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      aria-label="右键菜单"
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={handleMenuKeyDown}
      style={{
        left: position.left,
        top: position.top,
        visibility: position.ready ? "visible" : "hidden",
      }}
      className="fixed z-[80] min-w-[176px] overflow-hidden rounded-xl border border-line bg-card p-1 shadow-[var(--c-shadow)] outline-none"
    >
      {state.items.map((item, index) => (
        <button
          key={`${item.label}-${index}`}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            if (item.disabled) return;
            closeContextMenu();
            item.onSelect();
          }}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11.5px] text-muted transition-colors",
            "hover:bg-hover hover:text-ink focus:bg-hover focus:text-ink focus:outline-none",
            "disabled:pointer-events-none disabled:opacity-40",
          )}
        >
          {item.icon ? (
            <span className="shrink-0 text-faint">{item.icon}</span>
          ) : null}
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
