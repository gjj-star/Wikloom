export function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in (window as unknown as Record<string, unknown>)
  );
}

let contextMenuQueue: Promise<void> = Promise.resolve();

/**
 * WebView2 默认右键菜单在运行时按需开关：只有笔记编辑态打开，让 CodeMirror
 * 继续用系统原生剪切/复制/粘贴/全选菜单。命令串行执行，避免快速切换模式时竞态。
 */
export function setDefaultContextMenus(enabled: boolean): Promise<void> {
  if (!isTauriRuntime()) return Promise.resolve();

  contextMenuQueue = contextMenuQueue
    .then(async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_default_context_menus", { enabled });
    })
    .catch(() => {
      // 窗口正在关闭或命令不可用时忽略；不影响编辑本身。
    });
  return contextMenuQueue;
}
