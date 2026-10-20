export type VaultId = "personal" | "work";

export interface Vault {
  id: VaultId;
  name: string;
  description: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  vaultId: VaultId;
  createdAt: number;
  updatedAt: number;
}
