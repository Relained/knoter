// Typed errors with exit codes for the kn CLI

export enum ErrorCode {
  VAULT_NOT_FOUND = "VAULT_NOT_FOUND",
  VAULT_LOCKED = "VAULT_LOCKED",
  VAULT_EXISTS = "VAULT_EXISTS",
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  EMBEDDING_FAILED = "EMBEDDING_FAILED",
  CONFIG_INVALID = "CONFIG_INVALID",
  SYNC_FAILED = "SYNC_FAILED",
  SEARCH_FAILED = "SEARCH_FAILED",
  LOCK_CONTENTION = "LOCK_CONTENTION",
  PREPROCESSOR_FAILED = "PREPROCESSOR_FAILED",
  UNKNOWN = "UNKNOWN",
}

/**
 * Maps error codes to exit codes
 * 1 = general error
 * 2 = usage error
 * 3 = lock contention
 */
const errorCodeToExitCode: Record<ErrorCode, number> = {
  [ErrorCode.VAULT_NOT_FOUND]: 1,
  [ErrorCode.VAULT_LOCKED]: 3,
  [ErrorCode.VAULT_EXISTS]: 1,
  [ErrorCode.FILE_NOT_FOUND]: 1,
  [ErrorCode.EMBEDDING_FAILED]: 1,
  [ErrorCode.CONFIG_INVALID]: 2,
  [ErrorCode.SYNC_FAILED]: 1,
  [ErrorCode.SEARCH_FAILED]: 1,
  [ErrorCode.LOCK_CONTENTION]: 3,
  [ErrorCode.PREPROCESSOR_FAILED]: 1,
  [ErrorCode.UNKNOWN]: 1,
};

export class KnError extends Error {
  code: ErrorCode;
  exitCode: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "KnError";
    this.code = code;
    this.exitCode = errorCodeToExitCode[code];
  }
}
