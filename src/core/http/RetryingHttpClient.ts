import { AppError } from '../errors';
import type { HttpClient, HttpRequest, HttpResponse } from '../ports/HttpClient';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class RetryingHttpClient implements HttpClient {
  constructor(
    private readonly inner: HttpClient,
    private readonly maxAttempts = 2,
  ) {}

  async request(request: HttpRequest): Promise<HttpResponse> {
    if (request.retry === 'none') return this.inner.request(request);

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.inner.request(request);
        if (response.status === 429 || response.status >= 500) {
          throw new AppError('UPSTREAM', `上游返回 ${response.status}`, {
            retryable: true,
            details: { status: response.status },
          });
        }
        return response;
      } catch (error) {
        lastError = error;
        const retryable = !(error instanceof AppError) || error.retryable;
        if (!retryable || request.signal?.aborted || attempt === this.maxAttempts) break;
        await delay(250 * 2 ** attempt);
      }
    }

    if (lastError instanceof AppError) throw lastError;
    throw new AppError('NETWORK', '网络请求失败', { retryable: true });
  }
}
