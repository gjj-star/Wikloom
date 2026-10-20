import type { Vault, VaultId } from "../../../core/notes/types";

export const vaults: Vault[] = [
  { id: "personal", name: "个人知识库", description: "长期积累 · 本地" },
  { id: "work", name: "工作笔记", description: "项目与会议 · 本地" },
];

export function getVault(id: VaultId): Vault {
  return vaults.find((vault) => vault.id === id) ?? vaults[0];
}
