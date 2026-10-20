import { isTauriRuntime } from "./fs/runtime";

/**
 * 桌面版走 Tauri 剪贴板插件（不依赖 WebView 的权限策略）；
 * 浏览器演示版回退到 navigator.clipboard。
 */
export async function writeClipboardText(text: string): Promise<void> {
  if (isTauriRuntime()) {
    const { writeText } = await import(
      "@tauri-apps/plugin-clipboard-manager"
    );
    await writeText(text);
    return;
  }
  if (!navigator.clipboard?.writeText) {
    throw new Error("当前浏览器不支持写入剪贴板。");
  }
  await navigator.clipboard.writeText(text);
}

export async function readClipboardText(): Promise<string> {
  if (isTauriRuntime()) {
    const { readText } = await import(
      "@tauri-apps/plugin-clipboard-manager"
    );
    return readText();
  }
  if (!navigator.clipboard?.readText) {
    throw new Error("当前浏览器不支持读取剪贴板。");
  }
  return navigator.clipboard.readText();
}
