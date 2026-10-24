import type { AppErrorCode, AppErrorPayload } from '@shared/contracts/result';

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly retryable: boolean;
  public readonly details: Record<string, unknown> | undefined;

  constructor(
    code: AppErrorCode,
    message: string,
    options: { retryable?: boolean; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }

  toPayload(): AppErrorPayload {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error) {
    return new AppError('INTERNAL', error.message);
  }
  return new AppError('INTERNAL', '未知错误');
}
