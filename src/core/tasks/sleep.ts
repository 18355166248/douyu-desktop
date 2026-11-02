import { AppError } from '../errors';

/**
 * Abortable delay for task pacing (Douyu throttles repeated sign requests).
 * Rejects with CANCELLED so a task stops promptly when the runner aborts.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AppError('CANCELLED', '已取消'));
      return;
    }

    const cleanup = (): void => {
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = (): void => {
      clearTimeout(timer);
      cleanup();
      reject(new AppError('CANCELLED', '已取消'));
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
