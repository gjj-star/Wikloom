export type VaultErrorCode =
  | "VAULT_MISSING"
  | "VAULT_NOT_DIRECTORY"
  | "VAULT_PERMISSION"
  | "SCAN_FAILED"
  | "WRITE_FAILED"
  | "PATH_OUTSIDE_VAULT"
  | "UNKNOWN";

export class VaultError extends Error {
  readonly code: VaultErrorCode;
  readonly path?: string;
  readonly detail?: string;

  constructor(
    code: VaultErrorCode,
    message: string,
    options: { path?: string; detail?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "VaultError";
    this.code = code;
    this.path = options.path;
    this.detail = options.detail;
  }
}

function rawMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

/** 把底层 I/O 错误翻成用户能看懂的提示，同时保留原始信息。 */
export function toVaultError(
  error: unknown,
  fallbackCode: VaultErrorCode,
  fallbackMessage: string,
): VaultError {
  if (error instanceof VaultError) return error;

  const detail = rawMessage(error);
  if (/permission|denied|EACCES|EPERM|os error 5/i.test(detail)) {
    return new VaultError("VAULT_PERMISSION", "没有权限访问这个文件夹。", {
      detail,
      cause: error,
    });
  }
  if (/no such file|not found|ENOENT|os error 2|不存在/i.test(detail)) {
    return new VaultError("VAULT_MISSING", "知识库文件夹不存在。", {
      detail,
      cause: error,
    });
  }
  return new VaultError(fallbackCode, fallbackMessage, {
    detail,
    cause: error,
  });
}
