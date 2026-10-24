import type { AppErrorPayload, Result } from '@shared/contracts/result';

export class ApiError extends Error {
  readonly payload: AppErrorPayload;

  constructor(payload: AppErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.payload = payload;
  }
}

export function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.data;
  throw new ApiError(result.error);
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.payload.message;
  if (error instanceof Error) return error.message;
  return '操作失败';
}
