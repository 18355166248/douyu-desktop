export type AppErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_EXPIRED'
  | 'INVALID_INPUT'
  | 'CONFIRM_REQUIRED'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'UPSTREAM'
  | 'CANCELLED'
  | 'BUSY'
  | 'UNSUPPORTED'
  | 'INTERNAL';

export interface AppErrorPayload {
  code: AppErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppErrorPayload };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail<T = never>(error: AppErrorPayload): Result<T> {
  return { ok: false, error };
}
