export interface VaultInfo {
  kind: "tauri" | "memory";
  /** Tauri 为真实绝对路径；memory 为虚拟绝对路径 */
  root: string;
  name: string;
}
