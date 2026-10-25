import type { Session } from 'electron';
import { AppError } from '@core/errors';
import type { HttpClient, HttpRequest, HttpResponse } from '@core/ports/HttpClient';

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  for (const signal of signals) {
    if (signal.aborted) {
      abort();
      break;
    }
    signal.addEventListener('abort', abort, { once: true });
  }
  return controller.signal;
}

export class SessionHttpClient implements HttpClient {
  constructor(
    private readonly session: Session,
    private readonly userAgent: string,
  ) {}

  async request(request: HttpRequest): Promise<HttpResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? 15_000);
    const signal = request.signal
      ? anySignal([request.signal, controller.signal])
      : controller.signal;

    try {
      const response = await this.session.fetch(request.url, {
        method: request.method ?? 'GET',
        credentials: 'include',
        headers: {
          'User-Agent': this.userAgent,
          ...(request.headers ?? {}),
        },
        ...(request.body !== undefined ? { body: request.body } : {}),
        signal,
      });
      const text = await response.text();
      const json = async <T>(): Promise<T> => JSON.parse(text) as T;
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        text: async () => text,
        json,
      };
    } catch (error) {
      if (controller.signal.aborted && !request.signal?.aborted) {
        throw new AppError('NETWORK', '请求超时', { retryable: true });
      }
      if (error instanceof AppError) throw error;
      throw new AppError('NETWORK', error instanceof Error ? error.message : '网络请求失败', {
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
